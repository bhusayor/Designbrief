import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
)

class ClientError extends Error {
  constructor(status, message, extra = {}) {
    super(message)
    this.status = status
    this.extra = extra
  }
}

// --- Figma helpers ---

function extractFileKey(urlOrKey) {
  const match = urlOrKey.match(/figma\.com\/(?:design|file)\/([a-zA-Z0-9]+)/)
  if (match) return match[1]
  if (/^[a-zA-Z0-9]+$/.test(urlOrKey)) return urlOrKey
  return null
}

async function handleFigma(action, body, user) {
  const { figmaToken, figmaUrl, projectId, workspaceId } = body

  if (action === 'install') {
    if (!figmaToken) throw new ClientError(400, 'figmaToken required')

    const testRes = await fetch('https://api.figma.com/v1/me', {
      headers: { 'X-Figma-Token': figmaToken },
    })
    if (!testRes.ok) {
      throw new ClientError(400, 'Invalid Figma token. Check it in Figma → Account Settings → Security → Personal access tokens.', { code: 'INVALID_TOKEN' })
    }
    const me = await testRes.json()

    await supabase.from('workspace_tokens').upsert({
      workspace_id: workspaceId,
      user_id: user.id,
      figma_token_hint: figmaToken.slice(-4),
      figma_installed: true,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'workspace_id' })

    return { success: true, installed: true, user: me.email || me.handle }
  }

  if (action === 'uninstall') {
    await supabase.from('workspace_tokens')
      .update({ figma_installed: false, figma_token_hint: null, updated_at: new Date().toISOString() })
      .eq('workspace_id', workspaceId)

    await supabase.from('project_connectors')
      .update({ figma_file_url: null, figma_file_key: null, figma_file_name: null, figma_extracted: {}, figma_synced_at: null, updated_at: new Date().toISOString() })
      .eq('workspace_id', workspaceId)

    return { success: true }
  }

  if (action === 'disconnect') {
    if (!projectId) throw new ClientError(400, 'projectId required')
    await supabase.from('project_connectors').upsert({
      project_id: projectId, workspace_id: workspaceId, user_id: user.id,
      figma_file_url: null, figma_file_key: null, figma_file_name: null,
      figma_extracted: {}, figma_synced_at: null, updated_at: new Date().toISOString(),
    }, { onConflict: 'project_id,workspace_id' })
    return { success: true }
  }

  // connect / sync
  if (!projectId) throw new ClientError(400, 'projectId required')
  if (!figmaToken || !figmaUrl) throw new ClientError(400, 'figmaToken and figmaUrl required')

  const fileKey = extractFileKey(figmaUrl)
  if (!fileKey) throw new ClientError(400, 'Invalid Figma URL')

  const [stylesRes, fileRes] = await Promise.all([
    fetch('https://api.figma.com/v1/files/' + fileKey + '/styles', { headers: { 'X-Figma-Token': figmaToken } }),
    fetch('https://api.figma.com/v1/files/' + fileKey + '?depth=1', { headers: { 'X-Figma-Token': figmaToken } }),
  ])

  if (!stylesRes.ok) {
    const err = await stylesRes.json()
    throw new ClientError(400, 'Figma error: ' + (err.message || stylesRes.status), { code: 'FIGMA_API_ERROR' })
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

  return { success: true, data: extracted }
}

// --- GitHub helpers ---

function parseGithubUrl(url) {
  const match = url.match(/github\.com\/([^/]+)\/([^/\s?]+)/)
  if (!match) return null
  return { owner: match[1], repo: match[2].replace(/\.git$/, '') }
}

function detect(deps, devDeps) {
  const all = { ...deps, ...devDeps }
  return {
    framework:
      all['next'] ? 'Next.js' :
      all['@remix-run/react'] ? 'Remix' :
      all['@sveltejs/kit'] ? 'SvelteKit' :
      all['nuxt'] ? 'Nuxt.js' :
      all['vue'] ? 'Vue.js' :
      all['react'] ? 'React' :
      all['astro'] ? 'Astro' : null,
    language: (devDeps['typescript'] || devDeps['@types/react']) ? 'TypeScript' : 'JavaScript',
    styling:
      all['tailwindcss'] ? 'Tailwind CSS' :
      all['styled-components'] ? 'Styled Components' :
      all['@emotion/react'] ? 'Emotion' : 'CSS Modules',
    uiKit: [
      all['@shadcn/ui'] || all['shadcn-ui'] ? 'shadcn/ui' : null,
      all['@radix-ui/react-dialog'] ? 'Radix UI' : null,
      all['@chakra-ui/react'] ? 'Chakra UI' : null,
      all['@mui/material'] ? 'Material UI' : null,
    ].filter(Boolean),
    animations:
      deps['framer-motion'] ? 'Framer Motion' :
      deps['gsap'] ? 'GSAP' :
      deps['motion'] ? 'Motion' : null,
    database:
      deps['@supabase/supabase-js'] ? 'Supabase' :
      deps['@prisma/client'] ? 'Prisma' :
      deps['drizzle-orm'] ? 'Drizzle' :
      deps['firebase'] ? 'Firebase' : null,
  }
}

async function handleGithub(action, body, user) {
  const { githubToken, repoUrl, projectId, workspaceId } = body

  if (action === 'install') {
    let githubUser = null
    if (githubToken) {
      const verifyRes = await fetch('https://api.github.com/user', {
        headers: {
          'Accept': 'application/vnd.github+json',
          'Authorization': 'Bearer ' + githubToken,
          'X-GitHub-Api-Version': '2022-11-28',
        },
      })
      if (!verifyRes.ok) {
        throw new ClientError(400, 'Invalid GitHub token. Go to GitHub → Settings → Developer settings → Personal access tokens.', { code: 'INVALID_TOKEN' })
      }
      githubUser = await verifyRes.json()
    }

    await supabase.from('workspace_tokens').upsert({
      workspace_id: workspaceId,
      user_id: user.id,
      github_token_hint: githubToken ? githubToken.slice(-4) : null,
      github_installed: true,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'workspace_id' })

    return { success: true, installed: true, user: githubUser?.login || null }
  }

  if (action === 'uninstall') {
    await supabase.from('workspace_tokens')
      .update({ github_installed: false, github_token_hint: null, updated_at: new Date().toISOString() })
      .eq('workspace_id', workspaceId)

    await supabase.from('project_connectors')
      .update({ github_repo_url: null, github_repo_name: null, github_extracted: {}, github_synced_at: null, updated_at: new Date().toISOString() })
      .eq('workspace_id', workspaceId)

    return { success: true }
  }

  if (action === 'disconnect') {
    if (!projectId) throw new ClientError(400, 'projectId required')
    await supabase.from('project_connectors').upsert({
      project_id: projectId, workspace_id: workspaceId, user_id: user.id,
      github_repo_url: null, github_repo_name: null,
      github_extracted: {}, github_synced_at: null, updated_at: new Date().toISOString(),
    }, { onConflict: 'project_id,workspace_id' })
    return { success: true }
  }

  // connect
  if (!projectId) throw new ClientError(400, 'projectId required')
  if (!repoUrl) throw new ClientError(400, 'repoUrl required')

  const parsed = parseGithubUrl(repoUrl)
  if (!parsed) throw new ClientError(400, 'Invalid GitHub URL')

  const { owner, repo } = parsed
  const baseUrl = 'https://api.github.com/repos/' + owner + '/' + repo
  const headers = {
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    ...(githubToken && { 'Authorization': 'Bearer ' + githubToken }),
  }

  const [pkgRes, repoRes] = await Promise.all([
    fetch(baseUrl + '/contents/package.json', { headers }),
    fetch(baseUrl, { headers }),
  ])

  if (!pkgRes.ok) {
    if (pkgRes.status === 404)
      throw new ClientError(400, 'No package.json found. Is this a Node.js project?', { code: 'NO_PACKAGE_JSON' })
    if (pkgRes.status === 401 || pkgRes.status === 403)
      throw new ClientError(400, 'Private repo — add a GitHub token to access it.', { code: 'PRIVATE_REPO' })
    throw new ClientError(400, 'GitHub error: ' + pkgRes.status)
  }

  const pkgContent = await pkgRes.json()
  const pkgJson = JSON.parse(Buffer.from(pkgContent.content, 'base64').toString('utf8'))
  const repoData = repoRes.ok ? await repoRes.json() : null
  const deps = pkgJson.dependencies || {}
  const devDeps = pkgJson.devDependencies || {}
  const detected = detect(deps, devDeps)

  const extracted = {
    repoName: repoData?.name || repo,
    repoDescription: repoData?.description || null,
    ...detected,
    allDependencies: [...Object.keys(deps), ...Object.keys(devDeps)],
  }

  await supabase.from('project_connectors').upsert({
    project_id: projectId, workspace_id: workspaceId, user_id: user.id,
    github_repo_url: repoUrl, github_repo_name: repoData?.name || repo,
    github_extracted: extracted, github_synced_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'project_id,workspace_id' })

  if (githubToken) {
    await supabase.from('workspace_tokens').upsert({
      workspace_id: workspaceId, user_id: user.id,
      github_token_hint: githubToken.slice(-4), updated_at: new Date().toISOString(),
    }, { onConflict: 'workspace_id' })
  }

  return { success: true, data: extracted }
}

// --- Notion helpers ---

function extractNotionPageId(url) {
  // UUID format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
  const uuidMatch = url.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i)
  if (uuidMatch) return uuidMatch[1].replace(/-/g, '')
  // Plain 32-char hex at end of path segment
  const hexMatch = url.match(/([0-9a-f]{32})(?:[?#/]|$)/i)
  if (hexMatch) return hexMatch[1]
  return null
}

function richTextToPlain(richText = []) {
  return richText.map(t => t.plain_text).join('')
}

async function handleNotion(action, body, user) {
  const { notionToken, notionUrl, projectId, workspaceId } = body

  if (action === 'install') {
    if (!notionToken) throw new ClientError(400, 'notionToken required')

    const testRes = await fetch('https://api.notion.com/v1/users/me', {
      headers: { 'Authorization': 'Bearer ' + notionToken, 'Notion-Version': '2022-06-28' },
    })
    if (!testRes.ok) {
      throw new ClientError(400, 'Invalid Notion token. Go to notion.so → Settings → Connections → Develop or manage integrations.', { code: 'INVALID_TOKEN' })
    }
    const me = await testRes.json()

    await supabase.from('workspace_tokens').upsert({
      workspace_id: workspaceId,
      user_id: user.id,
      notion_token_hint: notionToken.slice(-4),
      notion_installed: true,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'workspace_id' })

    return { success: true, installed: true, user: me.name || me.bot?.owner?.user?.name || null }
  }

  if (action === 'uninstall') {
    await supabase.from('workspace_tokens')
      .update({ notion_installed: false, notion_token_hint: null, updated_at: new Date().toISOString() })
      .eq('workspace_id', workspaceId)

    await supabase.from('project_connectors')
      .update({ notion_page_url: null, notion_page_id: null, notion_page_title: null, notion_extracted: {}, notion_synced_at: null, updated_at: new Date().toISOString() })
      .eq('workspace_id', workspaceId)

    return { success: true }
  }

  if (action === 'disconnect') {
    if (!projectId) throw new ClientError(400, 'projectId required')
    await supabase.from('project_connectors').upsert({
      project_id: projectId, workspace_id: workspaceId, user_id: user.id,
      notion_page_url: null, notion_page_id: null, notion_page_title: null,
      notion_extracted: {}, notion_synced_at: null, updated_at: new Date().toISOString(),
    }, { onConflict: 'project_id,workspace_id' })
    return { success: true }
  }

  // connect
  if (!projectId) throw new ClientError(400, 'projectId required')
  if (!notionToken || !notionUrl) throw new ClientError(400, 'notionToken and notionUrl required')

  const pageId = extractNotionPageId(notionUrl)
  if (!pageId) throw new ClientError(400, 'Invalid Notion URL — could not extract page ID')

  const notionHeaders = { 'Authorization': 'Bearer ' + notionToken, 'Notion-Version': '2022-06-28' }

  const [pageRes, blocksRes] = await Promise.all([
    fetch('https://api.notion.com/v1/pages/' + pageId, { headers: notionHeaders }),
    fetch('https://api.notion.com/v1/blocks/' + pageId + '/children?page_size=100', { headers: notionHeaders }),
  ])

  if (!pageRes.ok) {
    const err = await pageRes.json().catch(() => ({}))
    if (pageRes.status === 404) throw new ClientError(400, 'Page not found. Make sure the integration has access to this page in Notion.', { code: 'NOT_FOUND' })
    if (pageRes.status === 401) throw new ClientError(401, 'Notion token is invalid or expired.', { code: 'INVALID_TOKEN' })
    throw new ClientError(400, 'Notion error: ' + (err.message || pageRes.status), { code: 'NOTION_API_ERROR' })
  }

  const pageData = await pageRes.json()
  const blocksData = blocksRes.ok ? await blocksRes.json() : null

  const titleProp = Object.values(pageData.properties || {}).find(p => p.type === 'title')
  const pageTitle = richTextToPlain(titleProp?.title) || 'Untitled'

  const CONTENT_TYPES = ['paragraph', 'heading_1', 'heading_2', 'heading_3', 'bulleted_list_item', 'numbered_list_item', 'quote', 'callout', 'toggle']
  const blocks = blocksData?.results || []
  const contentBlocks = blocks
    .filter(b => CONTENT_TYPES.includes(b.type))
    .map(b => ({ type: b.type, text: richTextToPlain(b[b.type]?.rich_text) }))
    .filter(b => b.text.trim())

  const extracted = {
    pageTitle,
    pageId,
    contentBlocks,
    contentPreview: contentBlocks.slice(0, 8).map(b => b.text).join('\n'),
    blockCount: blocks.length,
    lastEdited: pageData.last_edited_time,
  }

  await supabase.from('project_connectors').upsert({
    project_id: projectId, workspace_id: workspaceId, user_id: user.id,
    notion_page_url: notionUrl, notion_page_id: pageId,
    notion_page_title: pageTitle, notion_extracted: extracted,
    notion_synced_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  }, { onConflict: 'project_id,workspace_id' })

  await supabase.from('workspace_tokens').upsert({
    workspace_id: workspaceId, user_id: user.id,
    notion_token_hint: notionToken.slice(-4), updated_at: new Date().toISOString(),
  }, { onConflict: 'workspace_id' })

  return { success: true, data: extracted }
}

// --- Google Docs helpers ---

function extractDocId(url) {
  const match = url.match(/\/document\/d\/([a-zA-Z0-9_-]+)/)
  return match ? match[1] : null
}

async function handleGdocs(action, body, user) {
  const { gdocsUrl, gdocsApiKey, projectId, workspaceId } = body

  if (action === 'install') {
    await supabase.from('workspace_tokens').upsert({
      workspace_id: workspaceId,
      user_id: user.id,
      gdocs_installed: true,
      gdocs_token_hint: gdocsApiKey ? gdocsApiKey.slice(-4) : null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'workspace_id' })
    return { success: true, installed: true }
  }

  if (action === 'uninstall') {
    await supabase.from('workspace_tokens')
      .update({ gdocs_installed: false, gdocs_token_hint: null, updated_at: new Date().toISOString() })
      .eq('workspace_id', workspaceId)

    await supabase.from('project_connectors')
      .update({ gdocs_file_url: null, gdocs_file_id: null, gdocs_file_name: null, gdocs_extracted: {}, gdocs_synced_at: null, updated_at: new Date().toISOString() })
      .eq('workspace_id', workspaceId)

    return { success: true }
  }

  if (action === 'disconnect') {
    if (!projectId) throw new ClientError(400, 'projectId required')
    await supabase.from('project_connectors').upsert({
      project_id: projectId, workspace_id: workspaceId, user_id: user.id,
      gdocs_file_url: null, gdocs_file_id: null, gdocs_file_name: null,
      gdocs_extracted: {}, gdocs_synced_at: null, updated_at: new Date().toISOString(),
    }, { onConflict: 'project_id,workspace_id' })
    return { success: true }
  }

  // connect
  if (!projectId) throw new ClientError(400, 'projectId required')
  if (!gdocsUrl) throw new ClientError(400, 'gdocsUrl required')

  const docId = extractDocId(gdocsUrl)
  if (!docId) throw new ClientError(400, 'Invalid Google Docs URL — paste the full URL from your browser')

  // Export as plain text (works for "anyone with the link can view" docs)
  const exportUrl = 'https://docs.google.com/document/d/' + docId + '/export?format=txt'
  const exportRes = await fetch(exportUrl, { redirect: 'follow' })

  if (!exportRes.ok) {
    if (exportRes.status === 403 || exportRes.status === 401) {
      throw new ClientError(400, 'Document is private. In Google Docs, share it as "Anyone with the link" and try again.', { code: 'PRIVATE_DOC' })
    }
    throw new ClientError(400, 'Could not access document: ' + exportRes.status)
  }

  const content = await exportRes.text()

  // Use Google Docs API for title if API key provided, otherwise use first content line
  let docTitle = 'Google Doc'
  if (gdocsApiKey) {
    const apiRes = await fetch('https://docs.googleapis.com/v1/documents/' + docId + '?key=' + gdocsApiKey + '&fields=title')
    if (apiRes.ok) {
      const apiData = await apiRes.json()
      docTitle = apiData.title || 'Google Doc'
    }
  } else {
    const firstLine = content.split('\n').find(l => l.trim())
    if (firstLine) docTitle = firstLine.trim().slice(0, 120)
  }

  const wordCount = content.split(/\s+/).filter(Boolean).length
  const extracted = {
    fileName: docTitle,
    docId,
    content: content.slice(0, 8000),
    wordCount,
  }

  await supabase.from('project_connectors').upsert({
    project_id: projectId, workspace_id: workspaceId, user_id: user.id,
    gdocs_file_url: gdocsUrl, gdocs_file_id: docId,
    gdocs_file_name: docTitle, gdocs_extracted: extracted,
    gdocs_synced_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  }, { onConflict: 'project_id,workspace_id' })

  if (gdocsApiKey) {
    await supabase.from('workspace_tokens').upsert({
      workspace_id: workspaceId, user_id: user.id,
      gdocs_token_hint: gdocsApiKey.slice(-4), updated_at: new Date().toISOString(),
    }, { onConflict: 'workspace_id' })
  }

  return { success: true, data: extracted }
}

// --- Main handler ---

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).end()

  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token || token === 'undefined' || token === 'null') {
    return res.status(401).json({ error: 'Missing or invalid authorization header' })
  }

  const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
  if (authErr || !user) {
    console.error('[connectors/index auth]', authErr)
    return res.status(401).json({ error: 'Invalid session' })
  }

  const { type, workspaceId, ...rest } = req.body
  if (!workspaceId) return res.status(400).json({ error: 'workspaceId required' })

  try {
    let result
    const body = { workspaceId, ...rest }
    switch (type) {
      case 'figma':  result = await handleFigma(rest.action, body, user);  break
      case 'github': result = await handleGithub(rest.action, body, user); break
      case 'notion': result = await handleNotion(rest.action, body, user); break
      case 'gdocs':  result = await handleGdocs(rest.action, body, user);  break
      default: return res.status(400).json({ error: 'Unknown connector type: ' + type })
    }
    return res.json(result)
  } catch (e) {
    if (e instanceof ClientError) return res.status(e.status).json({ error: e.message, ...e.extra })
    console.error('[connectors/index]', e)
    return res.status(500).json({ error: e.message })
  }
}
