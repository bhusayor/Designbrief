import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
)

function extractFileKey(urlOrKey) {
  const match = urlOrKey.match(
    /figma\.com\/(?:design|file)\/([a-zA-Z0-9]+)/
  )
  if (match) return match[1]
  if (/^[a-zA-Z0-9]+$/.test(urlOrKey)) return urlOrKey
  return null
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).end()

  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) return res.status(401).json({ error: 'Unauthorised' })

  const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
  if (authErr || !user) return res.status(401).json({ error: 'Invalid session' })

  const { figmaToken, figmaUrl, workspaceId, action } = req.body

  if (!workspaceId || !action)
    return res.status(400).json({ error: 'workspaceId and action required' })

  try {
    if (action === 'disconnect') {
      await supabase.from('connectors').upsert({
        workspace_id: workspaceId,
        user_id: user.id,
        type: 'figma',
        status: 'disconnected',
        config: {},
        extracted_data: {},
        updated_at: new Date().toISOString(),
      }, { onConflict: 'workspace_id,type' })
      return res.json({ success: true })
    }

    if (!figmaToken || !figmaUrl)
      return res.status(400).json({ error: 'figmaToken and figmaUrl required' })

    const fileKey = extractFileKey(figmaUrl)
    if (!fileKey)
      return res.status(400).json({ error: 'Invalid Figma URL or file key' })

    const [stylesRes, fileRes] = await Promise.all([
      fetch('https://api.figma.com/v1/files/' + fileKey + '/styles', {
        headers: { 'X-Figma-Token': figmaToken },
      }),
      fetch('https://api.figma.com/v1/files/' + fileKey + '?depth=1&geometry=paths', {
        headers: { 'X-Figma-Token': figmaToken },
      }),
    ])

    if (!stylesRes.ok) {
      const err = await stylesRes.json()
      return res.status(400).json({
        error: 'Figma API error: ' + (err.message || stylesRes.status),
        code: 'FIGMA_API_ERROR',
      })
    }

    const stylesData = await stylesRes.json()
    const fileData = fileRes.ok ? await fileRes.json() : null
    const styles = stylesData.meta?.styles || []

    const colorStyles = styles
      .filter(s => s.style_type === 'FILL')
      .map(s => ({ id: s.node_id, name: s.name, description: s.description || '' }))

    const textStyles = styles
      .filter(s => s.style_type === 'TEXT')
      .map(s => ({ id: s.node_id, name: s.name, description: s.description || '' }))

    // Fetch actual hex values for colour styles
    let colorValues = []
    if (colorStyles.length > 0) {
      const nodeIds = colorStyles.slice(0, 20).map(s => s.id).join(',')
      const nodesRes = await fetch(
        'https://api.figma.com/v1/files/' + fileKey + '/nodes?ids=' + nodeIds,
        { headers: { 'X-Figma-Token': figmaToken } }
      )
      if (nodesRes.ok) {
        const nodesData = await nodesRes.json()
        colorValues = colorStyles.slice(0, 20).map(style => {
          const node = nodesData.nodes?.[style.id]?.document
          const fill = node?.fills?.[0]
          let hex = null
          if (fill?.type === 'SOLID' && fill.color) {
            const { r, g, b } = fill.color
            hex = '#' + [r, g, b]
              .map(v => Math.round(v * 255).toString(16).padStart(2, '0'))
              .join('')
          }
          return { name: style.name, hex, description: style.description }
        }).filter(c => c.hex)
      }
    }

    // Fetch font info from text styles
    let fontValues = []
    if (textStyles.length > 0) {
      const nodeIds = textStyles.slice(0, 10).map(s => s.id).join(',')
      const nodesRes = await fetch(
        'https://api.figma.com/v1/files/' + fileKey + '/nodes?ids=' + nodeIds,
        { headers: { 'X-Figma-Token': figmaToken } }
      )
      if (nodesRes.ok) {
        const nodesData = await nodesRes.json()
        const seenFonts = new Set()
        fontValues = textStyles.slice(0, 10).map(style => {
          const node = nodesData.nodes?.[style.id]?.document
          const fontFamily = node?.style?.fontFamily
          if (!fontFamily || seenFonts.has(fontFamily)) return null
          seenFonts.add(fontFamily)
          return {
            name: style.name,
            fontFamily,
            fontSize: node?.style?.fontSize,
            fontWeight: node?.style?.fontWeight,
          }
        }).filter(Boolean)
      }
    }

    const extractedData = {
      fileName: fileData?.name || 'Figma File',
      fileKey,
      colors: colorValues,
      fonts: fontValues,
      colorCount: colorStyles.length,
      textStyleCount: textStyles.length,
      syncedAt: new Date().toISOString(),
    }

    // figmaToken is NEVER stored in Supabase
    await supabase.from('connectors').upsert({
      workspace_id: workspaceId,
      user_id: user.id,
      type: 'figma',
      status: 'connected',
      config: {
        figmaUrl,
        fileKey,
        fileName: fileData?.name,
      },
      extracted_data: extractedData,
      last_synced_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'workspace_id,type' })

    return res.json({ success: true, data: extractedData })
  } catch (e) {
    console.error('[figma connector]', e)
    return res.status(500).json({ error: e.message })
  }
}
