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

// --- Linear helpers ---

const LINEAR_API = 'https://api.linear.app/graphql'

async function linearQuery(token, query, variables = {}) {
  const res = await fetch(LINEAR_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': token },
    body: JSON.stringify({ query, variables }),
  })
  if (!res.ok) throw new Error('Linear API error: ' + res.status)
  const data = await res.json()
  if (data.errors) throw new Error(data.errors[0]?.message || 'Linear error')
  return data.data
}

async function handleLinear(action, body, user) {
  const { linearToken, projectId, workspaceId, teamId, tasks } = body

  if (action === 'install') {
    if (!linearToken) throw new ClientError(400, 'linearToken required')

    const data = await linearQuery(linearToken, `query { viewer { id name email } }`)

    await supabase.from('workspace_tokens').upsert({
      workspace_id: workspaceId,
      user_id: user.id,
      linear_token_hint: linearToken.slice(-4),
      linear_installed: true,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'workspace_id' })

    return { success: true, installed: true, user: data.viewer?.email || data.viewer?.name }
  }

  if (action === 'uninstall') {
    await supabase.from('workspace_tokens')
      .update({ linear_installed: false, linear_token_hint: null, updated_at: new Date().toISOString() })
      .eq('workspace_id', workspaceId)

    await supabase.from('project_connectors')
      .update({ linear_team_id: null, linear_team_name: null, linear_synced_at: null, updated_at: new Date().toISOString() })
      .eq('workspace_id', workspaceId)

    return { success: true }
  }

  if (action === 'disconnect') {
    if (!projectId) throw new ClientError(400, 'projectId required')
    await supabase.from('project_connectors').upsert({
      project_id: projectId, workspace_id: workspaceId, user_id: user.id,
      linear_team_id: null, linear_team_name: null,
      linear_synced_at: null, updated_at: new Date().toISOString(),
    }, { onConflict: 'project_id,workspace_id' })
    return { success: true }
  }

  if (!linearToken) throw new ClientError(400, 'linearToken required')

  if (action === 'get_teams') {
    const data = await linearQuery(linearToken, `query {
      teams { nodes { id name key states { nodes { id name type color } } } }
      viewer { id name email }
    }`)
    const teams = data.teams?.nodes?.map(t => ({
      id: t.id, name: t.name, key: t.key, states: t.states?.nodes || [],
    })) || []

    await supabase.from('workspace_tokens').upsert({
      workspace_id: workspaceId, user_id: user.id,
      linear_token_hint: linearToken.slice(-4), updated_at: new Date().toISOString(),
    }, { onConflict: 'workspace_id' })

    return { success: true, data: { viewer: data.viewer, teams } }
  }

  if (action === 'save_team') {
    if (!projectId) throw new ClientError(400, 'projectId required')
    await supabase.from('project_connectors').upsert({
      project_id: projectId, workspace_id: workspaceId, user_id: user.id,
      linear_team_id: teamId, linear_team_name: body.teamName || null,
      linear_synced_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }, { onConflict: 'project_id,workspace_id' })
    return { success: true }
  }

  if (action === 'push_tasks') {
    if (!projectId) throw new ClientError(400, 'projectId required')
    if (!teamId || !tasks?.length) throw new ClientError(400, 'teamId and tasks required')

    const teamData = await linearQuery(linearToken,
      `query($teamId: String!) { team(id: $teamId) { states { nodes { id name type } } } }`,
      { teamId }
    )
    const states = teamData.team?.states?.nodes || []
    const stateMap = {
      'todo': states.find(s => s.type === 'unstarted' || s.name.toLowerCase().includes('todo'))?.id,
      'inprogress': states.find(s => s.type === 'started' || s.name.toLowerCase().includes('progress'))?.id,
      'review': states.find(s => s.name.toLowerCase().includes('review'))?.id,
      'done': states.find(s => s.type === 'completed' || s.name.toLowerCase().includes('done'))?.id,
    }
    const priorityMap = { HIGH: 2, MEDIUM: 3, LOW: 4 }
    const results = []

    for (const task of tasks) {
      try {
        const stateId = stateMap[task.column?.toLowerCase()] || stateMap['todo']
        const data = await linearQuery(linearToken,
          `mutation CreateIssue($input: IssueCreateInput!) { issueCreate(input: $input) { success issue { id identifier url title } } }`,
          { input: { teamId, title: task.title, description: task.description || '', priority: priorityMap[task.priority?.toUpperCase()] || 3, ...(stateId && { stateId }) } }
        )
        if (data.issueCreate?.success)
          results.push({ taskId: task.id, issue: data.issueCreate.issue, success: true })
      } catch (e) {
        results.push({ taskId: task.id, error: e.message, success: false })
      }
    }

    return {
      success: true,
      pushed: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      results,
    }
  }

  throw new ClientError(400, 'Unknown action: ' + action)
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
      case 'linear': result = await handleLinear(rest.action, body, user); break
      default: return res.status(400).json({ error: 'Unknown connector type: ' + type })
    }
    return res.json(result)
  } catch (e) {
    if (e instanceof ClientError) return res.status(e.status).json({ error: e.message, ...e.extra })
    console.error('[connectors/index]', e)
    return res.status(500).json({ error: e.message })
  }
}
