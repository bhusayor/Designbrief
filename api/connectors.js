import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
)

// ── Figma ─────────────────────────────────────────────────────────────────────

function extractFileKey(urlOrKey) {
  const match = urlOrKey.match(
    /figma\.com\/(?:design|file)\/([a-zA-Z0-9]+)/)
  if (match) return match[1]
  if (/^[a-zA-Z0-9]+$/.test(urlOrKey)) return urlOrKey
  return null
}

async function handleFigma(req, res, user) {
  const { action, figmaToken, figmaUrl, projectId, workspaceId } = req.body

  if (action === 'disconnect') {
    await supabase
      .from('project_connectors')
      .upsert({
        project_id: projectId,
        workspace_id: workspaceId,
        user_id: user.id,
        figma_file_url: null,
        figma_file_key: null,
        figma_file_name: null,
        figma_extracted: {},
        figma_synced_at: null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'project_id,workspace_id' })
    return res.json({ success: true })
  }

  if (!figmaToken || !figmaUrl)
    return res.status(400).json({ error: 'figmaToken and figmaUrl required' })

  const fileKey = extractFileKey(figmaUrl)
  if (!fileKey)
    return res.status(400).json({ error: 'Invalid Figma URL' })

  const [stylesRes, fileRes] = await Promise.all([
    fetch('https://api.figma.com/v1/files/' + fileKey + '/styles',
      { headers: { 'X-Figma-Token': figmaToken } }),
    fetch('https://api.figma.com/v1/files/' + fileKey + '?depth=1',
      { headers: { 'X-Figma-Token': figmaToken } }),
  ])

  if (!stylesRes.ok) {
    const err = await stylesRes.json()
    return res.status(400).json({
      error: 'Figma error: ' + (err.message || stylesRes.status),
      code: 'FIGMA_API_ERROR',
    })
  }

  const stylesData = await stylesRes.json()
  const fileData = fileRes.ok ? await fileRes.json() : null
  const styles = stylesData.meta?.styles || []

  const colorStyles = styles.filter(s => s.style_type === 'FILL')
  const textStyles = styles.filter(s => s.style_type === 'TEXT')

  let colors = []
  if (colorStyles.length > 0) {
    const nodeIds = colorStyles.slice(0, 20).map(s => s.node_id).join(',')
    const nodesRes = await fetch(
      'https://api.figma.com/v1/files/' + fileKey + '/nodes?ids=' + nodeIds,
      { headers: { 'X-Figma-Token': figmaToken } }
    )
    if (nodesRes.ok) {
      const nodesData = await nodesRes.json()
      colors = colorStyles.slice(0, 20).map(style => {
        const node = nodesData.nodes?.[style.node_id]?.document
        const fill = node?.fills?.[0]
        if (fill?.type === 'SOLID' && fill.color) {
          const { r, g, b } = fill.color
          const hex = '#' + [r, g, b]
            .map(v => Math.round(v * 255).toString(16).padStart(2, '0'))
            .join('')
          return { name: style.name, hex, description: style.description || '' }
        }
        return null
      }).filter(Boolean)
    }
  }

  let fonts = []
  if (textStyles.length > 0) {
    const nodeIds = textStyles.slice(0, 10).map(s => s.node_id).join(',')
    const nodesRes = await fetch(
      'https://api.figma.com/v1/files/' + fileKey + '/nodes?ids=' + nodeIds,
      { headers: { 'X-Figma-Token': figmaToken } }
    )
    if (nodesRes.ok) {
      const nodesData = await nodesRes.json()
      const seen = new Set()
      fonts = textStyles.slice(0, 10).map(style => {
        const node = nodesData.nodes?.[style.node_id]?.document
        const ff = node?.style?.fontFamily
        if (!ff || seen.has(ff)) return null
        seen.add(ff)
        return {
          name: style.name,
          fontFamily: ff,
          fontSize: node?.style?.fontSize,
          fontWeight: node?.style?.fontWeight,
        }
      }).filter(Boolean)
    }
  }

  const extracted = {
    fileName: fileData?.name || 'Figma File',
    fileKey,
    colors,
    fonts,
    colorCount: colorStyles.length,
    textStyleCount: textStyles.length,
  }

  await supabase
    .from('project_connectors')
    .upsert({
      project_id: projectId,
      workspace_id: workspaceId,
      user_id: user.id,
      figma_file_url: figmaUrl,
      figma_file_key: fileKey,
      figma_file_name: fileData?.name || null,
      figma_extracted: extracted,
      figma_synced_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'project_id,workspace_id' })

  await supabase
    .from('workspace_tokens')
    .upsert({
      workspace_id: workspaceId,
      user_id: user.id,
      figma_token_hint: figmaToken.slice(-4),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'workspace_id' })

  return res.json({ success: true, data: extracted })
}

// ── GitHub ────────────────────────────────────────────────────────────────────

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
    language:
      (devDeps['typescript'] || devDeps['@types/react'])
        ? 'TypeScript' : 'JavaScript',
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

async function handleGithub(req, res, user) {
  const { action, repoUrl, githubToken, projectId, workspaceId } = req.body

  if (action === 'disconnect') {
    await supabase
      .from('project_connectors')
      .upsert({
        project_id: projectId,
        workspace_id: workspaceId,
        user_id: user.id,
        github_repo_url: null,
        github_repo_name: null,
        github_extracted: {},
        github_synced_at: null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'project_id,workspace_id' })
    return res.json({ success: true })
  }

  if (!repoUrl)
    return res.status(400).json({ error: 'repoUrl required' })

  const parsed = parseGithubUrl(repoUrl)
  if (!parsed)
    return res.status(400).json({ error: 'Invalid GitHub URL' })

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
      return res.status(400).json({
        error: 'No package.json found. Is this a Node.js project?',
        code: 'NO_PACKAGE_JSON',
      })
    if (pkgRes.status === 401 || pkgRes.status === 403)
      return res.status(400).json({
        error: 'Private repo — add a GitHub token to access it.',
        code: 'PRIVATE_REPO',
      })
    return res.status(400).json({ error: 'GitHub error: ' + pkgRes.status })
  }

  const pkgContent = await pkgRes.json()
  const pkgJson = JSON.parse(
    Buffer.from(pkgContent.content, 'base64').toString('utf8'))
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

  await supabase
    .from('project_connectors')
    .upsert({
      project_id: projectId,
      workspace_id: workspaceId,
      user_id: user.id,
      github_repo_url: repoUrl,
      github_repo_name: repoData?.name || repo,
      github_extracted: extracted,
      github_synced_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'project_id,workspace_id' })

  if (githubToken) {
    await supabase
      .from('workspace_tokens')
      .upsert({
        workspace_id: workspaceId,
        user_id: user.id,
        github_token_hint: githubToken.slice(-4),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'workspace_id' })
  }

  return res.json({ success: true, data: extracted })
}

// ── Linear ────────────────────────────────────────────────────────────────────

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

async function handleLinear(req, res, user) {
  const { action, linearToken, projectId, workspaceId, teamId, tasks } = req.body

  if (action === 'disconnect') {
    await supabase
      .from('project_connectors')
      .upsert({
        project_id: projectId,
        workspace_id: workspaceId,
        user_id: user.id,
        linear_team_id: null,
        linear_team_name: null,
        linear_synced_at: null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'project_id,workspace_id' })
    return res.json({ success: true })
  }

  if (!linearToken)
    return res.status(400).json({ error: 'linearToken required' })

  if (action === 'connect' || action === 'get_teams') {
    const data = await linearQuery(
      linearToken,
      `query {
        teams { nodes { id name key
          states { nodes { id name type color } }
        } }
        viewer { id name email }
      }`
    )
    const teams = data.teams?.nodes?.map(t => ({
      id: t.id, name: t.name, key: t.key,
      states: t.states?.nodes || [],
    })) || []

    await supabase
      .from('workspace_tokens')
      .upsert({
        workspace_id: workspaceId,
        user_id: user.id,
        linear_token_hint: linearToken.slice(-4),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'workspace_id' })

    return res.json({ success: true, data: { viewer: data.viewer, teams } })
  }

  if (action === 'save_team') {
    await supabase
      .from('project_connectors')
      .upsert({
        project_id: projectId,
        workspace_id: workspaceId,
        user_id: user.id,
        linear_team_id: teamId,
        linear_team_name: req.body.teamName || null,
        linear_synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'project_id,workspace_id' })
    return res.json({ success: true })
  }

  if (action === 'push_tasks') {
    if (!teamId || !tasks?.length)
      return res.status(400).json({ error: 'teamId and tasks required' })

    const teamData = await linearQuery(
      linearToken,
      `query($teamId: String!) {
        team(id: $teamId) {
          states { nodes { id name type } }
        }
      }`,
      { teamId }
    )
    const states = teamData.team?.states?.nodes || []
    const stateMap = {
      'todo': states.find(s =>
        s.type === 'unstarted' ||
        s.name.toLowerCase().includes('todo'))?.id,
      'inprogress': states.find(s =>
        s.type === 'started' ||
        s.name.toLowerCase().includes('progress'))?.id,
      'review': states.find(s =>
        s.name.toLowerCase().includes('review'))?.id,
      'done': states.find(s =>
        s.type === 'completed' ||
        s.name.toLowerCase().includes('done'))?.id,
    }
    const priorityMap = { HIGH: 2, MEDIUM: 3, LOW: 4 }
    const results = []

    for (const task of tasks) {
      try {
        const stateId = stateMap[task.column] || stateMap['todo']
        const data = await linearQuery(
          linearToken,
          `mutation CreateIssue($input: IssueCreateInput!) {
            issueCreate(input: $input) {
              success
              issue { id identifier url title }
            }
          }`,
          {
            input: {
              teamId,
              title: task.title,
              description: task.description || '',
              priority: priorityMap[task.priority?.toUpperCase()] || 3,
              ...(stateId && { stateId }),
            },
          }
        )
        if (data.issueCreate?.success)
          results.push({ taskId: task.id, issue: data.issueCreate.issue, success: true })
      } catch (e) {
        results.push({ taskId: task.id, error: e.message, success: false })
      }
    }

    return res.json({
      success: true,
      pushed: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      results,
    })
  }

  return res.status(400).json({ error: 'Unknown action: ' + action })
}

// ── Main handler ──────────────────────────────────────────────────────────────

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

  const { type, projectId, workspaceId } = req.body
  if (!projectId || !workspaceId)
    return res.status(400).json({ error: 'projectId and workspaceId required' })

  try {
    if (type === 'figma') return await handleFigma(req, res, user)
    if (type === 'github') return await handleGithub(req, res, user)
    if (type === 'linear') return await handleLinear(req, res, user)
    return res.status(400).json({ error: 'Unknown connector type: ' + type })
  } catch (e) {
    console.error('[connectors/' + type + ']', e)
    return res.status(500).json({ error: e.message })
  }
}
