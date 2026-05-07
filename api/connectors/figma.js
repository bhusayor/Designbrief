import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
)

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
}

function extractFileKey(urlOrKey) {
  const match = urlOrKey.match(/figma\.com\/(?:design|file)\/([a-zA-Z0-9]+)/)
  if (match) return match[1]
  if (/^[a-zA-Z0-9]+$/.test(urlOrKey)) return urlOrKey
  return null
}

export default async function handler(req, res) {
  setCors(res)
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).end()

  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) return res.status(401).json({ error: 'Unauthorised' })

  const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
  if (authErr || !user) return res.status(401).json({ error: 'Invalid session' })

  const { action, figmaToken, figmaUrl, projectId, workspaceId } = req.body
  if (!workspaceId) return res.status(400).json({ error: 'workspaceId required' })

  try {
    if (action === 'install') {
      if (!figmaToken) return res.status(400).json({ error: 'figmaToken required' })

      const testRes = await fetch('https://api.figma.com/v1/me', {
        headers: { 'X-Figma-Token': figmaToken },
      })
      if (!testRes.ok) {
        return res.status(400).json({
          error: 'Invalid Figma token. Check it in Figma → Account Settings → Security → Personal access tokens.',
          code: 'INVALID_TOKEN',
        })
      }
      const me = await testRes.json()

      await supabase.from('workspace_tokens').upsert({
        workspace_id: workspaceId,
        user_id: user.id,
        figma_token_hint: figmaToken.slice(-4),
        figma_installed: true,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'workspace_id' })

      return res.json({ success: true, installed: true, user: me.email || me.handle })
    }

    if (action === 'uninstall') {
      await supabase.from('workspace_tokens')
        .update({ figma_installed: false, figma_token_hint: null, updated_at: new Date().toISOString() })
        .eq('workspace_id', workspaceId)

      await supabase.from('project_connectors')
        .update({ figma_file_url: null, figma_file_key: null, figma_file_name: null, figma_extracted: {}, figma_synced_at: null, updated_at: new Date().toISOString() })
        .eq('workspace_id', workspaceId)

      return res.json({ success: true })
    }

    if (action === 'disconnect') {
      if (!projectId) return res.status(400).json({ error: 'projectId required' })
      await supabase.from('project_connectors').upsert({
        project_id: projectId, workspace_id: workspaceId, user_id: user.id,
        figma_file_url: null, figma_file_key: null, figma_file_name: null,
        figma_extracted: {}, figma_synced_at: null, updated_at: new Date().toISOString(),
      }, { onConflict: 'project_id,workspace_id' })
      return res.json({ success: true })
    }

    // connect / sync
    if (!projectId) return res.status(400).json({ error: 'projectId required' })
    if (!figmaToken || !figmaUrl)
      return res.status(400).json({ error: 'figmaToken and figmaUrl required' })

    const fileKey = extractFileKey(figmaUrl)
    if (!fileKey) return res.status(400).json({ error: 'Invalid Figma URL' })

    const [stylesRes, fileRes] = await Promise.all([
      fetch('https://api.figma.com/v1/files/' + fileKey + '/styles', { headers: { 'X-Figma-Token': figmaToken } }),
      fetch('https://api.figma.com/v1/files/' + fileKey + '?depth=1', { headers: { 'X-Figma-Token': figmaToken } }),
    ])

    if (!stylesRes.ok) {
      const err = await stylesRes.json()
      return res.status(400).json({ error: 'Figma error: ' + (err.message || stylesRes.status), code: 'FIGMA_API_ERROR' })
    }

    const stylesData = await stylesRes.json()
    const fileData = fileRes.ok ? await fileRes.json() : null
    const styles = stylesData.meta?.styles || []
    const colorStyles = styles.filter(s => s.style_type === 'FILL')
    const textStyles = styles.filter(s => s.style_type === 'TEXT')

    let colors = []
    if (colorStyles.length > 0) {
      const nodeIds = colorStyles.slice(0, 20).map(s => s.node_id).join(',')
      const nodesRes = await fetch('https://api.figma.com/v1/files/' + fileKey + '/nodes?ids=' + nodeIds, { headers: { 'X-Figma-Token': figmaToken } })
      if (nodesRes.ok) {
        const nodesData = await nodesRes.json()
        colors = colorStyles.slice(0, 20).map(style => {
          const node = nodesData.nodes?.[style.node_id]?.document
          const fill = node?.fills?.[0]
          if (fill?.type === 'SOLID' && fill.color) {
            const { r, g, b } = fill.color
            const hex = '#' + [r, g, b].map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join('')
            return { name: style.name, hex, description: style.description || '' }
          }
          return null
        }).filter(Boolean)
      }
    }

    let fonts = []
    if (textStyles.length > 0) {
      const nodeIds = textStyles.slice(0, 10).map(s => s.node_id).join(',')
      const nodesRes = await fetch('https://api.figma.com/v1/files/' + fileKey + '/nodes?ids=' + nodeIds, { headers: { 'X-Figma-Token': figmaToken } })
      if (nodesRes.ok) {
        const nodesData = await nodesRes.json()
        const seen = new Set()
        fonts = textStyles.slice(0, 10).map(style => {
          const node = nodesData.nodes?.[style.node_id]?.document
          const ff = node?.style?.fontFamily
          if (!ff || seen.has(ff)) return null
          seen.add(ff)
          return { name: style.name, fontFamily: ff, fontSize: node?.style?.fontSize, fontWeight: node?.style?.fontWeight }
        }).filter(Boolean)
      }
    }

    const extracted = { fileName: fileData?.name || 'Figma File', fileKey, colors, fonts, colorCount: colorStyles.length, textStyleCount: textStyles.length }

    await supabase.from('project_connectors').upsert({
      project_id: projectId, workspace_id: workspaceId, user_id: user.id,
      figma_file_url: figmaUrl, figma_file_key: fileKey,
      figma_file_name: fileData?.name || null, figma_extracted: extracted,
      figma_synced_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }, { onConflict: 'project_id,workspace_id' })

    await supabase.from('workspace_tokens').upsert({
      workspace_id: workspaceId, user_id: user.id,
      figma_token_hint: figmaToken.slice(-4), updated_at: new Date().toISOString(),
    }, { onConflict: 'workspace_id' })

    return res.json({ success: true, data: extracted })
  } catch (e) {
    console.error('[connectors/figma]', e)
    return res.status(500).json({ error: e.message })
  }
}
