import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
)

// ── Figma helpers ─────────────────────────────────────────────────────────────

function extractFileKey(urlOrKey) {
  const match = urlOrKey.match(/figma\.com\/(?:design|file)\/([a-zA-Z0-9]+)/)
  if (match) return match[1]
  if (/^[a-zA-Z0-9]+$/.test(urlOrKey)) return urlOrKey
  return null
}

async function handleFigma(req, res, user) {
  const { figmaToken, figmaUrl, workspaceId, action } = req.body

  if (action === 'disconnect') {
    await supabase.from('connectors').upsert({
      workspace_id: workspaceId, user_id: user.id, type: 'figma',
      status: 'disconnected', config: {}, extracted_data: {},
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
    fetch('https://api.figma.com/v1/files/' + fileKey + '?depth=1', {
      headers: { 'X-Figma-Token': figmaToken },
    }),
  ])

  if (!stylesRes.ok) {
    const err = await stylesRes.json()
    return res.status(400).json({ error: 'Figma API error: ' + (err.message || stylesRes.status), code: 'FIGMA_API_ERROR' })
  }

  const stylesData = await stylesRes.json()
  const fileData = fileRes.ok ? await fileRes.json() : null
  const styles = stylesData.meta?.styles || []

  const colorStyles = styles.filter(s => s.style_type === 'FILL').map(s => ({ id: s.node_id, name: s.name, description: s.description || '' }))
  const textStyles = styles.filter(s => s.style_type === 'TEXT').map(s => ({ id: s.node_id, name: s.name, description: s.description || '' }))

  let colorValues = []
  if (colorStyles.length > 0) {
    const nodeIds = colorStyles.slice(0, 20).map(s => s.id).join(',')
    const nodesRes = await fetch('https://api.figma.com/v1/files/' + fileKey + '/nodes?ids=' + nodeIds, { headers: { 'X-Figma-Token': figmaToken } })
    if (nodesRes.ok) {
      const nodesData = await nodesRes.json()
      colorValues = colorStyles.slice(0, 20).map(style => {
        const node = nodesData.nodes?.[style.id]?.document
        const fill = node?.fills?.[0]
        let hex = null
        if (fill?.type === 'SOLID' && fill.color) {
          const { r, g, b } = fill.color
          hex = '#' + [r, g, b].map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join('')
        }
        return { name: style.name, hex, description: style.description }
      }).filter(c => c.hex)
    }
  }

  let fontValues = []
  if (textStyles.length > 0) {
    const nodeIds = textStyles.slice(0, 10).map(s => s.id).join(',')
    const nodesRes = await fetch('https://api.figma.com/v1/files/' + fileKey + '/nodes?ids=' + nodeIds, { headers: { 'X-Figma-Token': figmaToken } })
    if (nodesRes.ok) {
      const nodesData = await nodesRes.json()
      const seenFonts = new Set()
      fontValues = textStyles.slice(0, 10).map(style => {
        const node = nodesData.nodes?.[style.id]?.document
        const fontFamily = node?.style?.fontFamily
        if (!fontFamily || seenFonts.has(fontFamily)) return null
        seenFonts.add(fontFamily)
        return { name: style.name, fontFamily, fontSize: node?.style?.fontSize, fontWeight: node?.style?.fontWeight }
      }).filter(Boolean)
    }
  }

  const extractedData = {
    fileName: fileData?.name || 'Figma File', fileKey,
    colors: colorValues, fonts: fontValues,
    colorCount: colorStyles.length, textStyleCount: textStyles.length,
    syncedAt: new Date().toISOString(),
  }

  await supabase.from('connectors').upsert({
    workspace_id: workspaceId, user_id: user.id, type: 'figma',
    status: 'connected',
    config: { figmaUrl, fileKey, fileName: fileData?.name },
    extracted_data: extractedData,
    last_synced_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'workspace_id,type' })

  return res.json({ success: true, data: extractedData })
}

// ── GitHub helpers ────────────────────────────────────────────────────────────

function parseGithubUrl(url) {
  const match = url.match(/github\.com\/([^/]+)\/([^/\s?]+)/)
  if (!match) return null
  return { owner: match[1], repo: match[2].replace(/\.git$/, '') }
}

function detectFramework(deps, devDeps) {
  const all = { ...deps, ...devDeps }
  if (all['next']) return 'Next.js'
  if (all['@remix-run/react']) return 'Remix'
  if (all['@sveltejs/kit']) return 'SvelteKit'
  if (all['nuxt']) return 'Nuxt.js'
  if (all['vue']) return 'Vue.js'
  if (all['react']) return 'React'
  if (all['astro']) return 'Astro'
  return null
}

function detectUIKit(deps, devDeps) {
  const all = { ...deps, ...devDeps }
  const kits = []
  if (all['@shadcn/ui'] || all['shadcn-ui']) kits.push('shadcn/ui')
  if (all['@radix-ui/react-dialog'] || all['@radix-ui/themes']) kits.push('Radix UI')
  if (all['@chakra-ui/react']) kits.push('Chakra UI')
  if (all['@mui/material']) kits.push('Material UI')
  if (all['antd']) kits.push('Ant Design')
  if (all['@nextui-org/react']) kits.push('NextUI')
  return kits
}

function detectStyling(deps, devDeps) {
  const all = { ...deps, ...devDeps }
  if (all['tailwindcss']) return 'Tailwind CSS'
  if (all['styled-components']) return 'Styled Components'
  if (all['@emotion/react']) return 'Emotion'
  if (all['stitches']) return 'Stitches'
  return 'CSS Modules'
}

function detectAnimations(deps) {
  if (deps['framer-motion']) return 'Framer Motion'
  if (deps['gsap']) return 'GSAP'
  if (deps['@react-spring/web']) return 'React Spring'
  if (deps['motion']) return 'Motion'
  return null
}

function detectDatabase(deps) {
  if (deps['@supabase/supabase-js']) return 'Supabase'
  if (deps['@prisma/client']) return 'Prisma'
  if (deps['drizzle-orm']) return 'Drizzle'
  if (deps['mongoose']) return 'MongoDB'
  if (deps['firebase']) return 'Firebase'
  return null
}

async function handleGithub(req, res, user) {
  const { repoUrl, githubToken, workspaceId, action } = req.body

  if (action === 'disconnect') {
    await supabase.from('connectors').upsert({
      workspace_id: workspaceId, user_id: user.id, type: 'github',
      status: 'disconnected', config: {}, extracted_data: {},
      updated_at: new Date().toISOString(),
    }, { onConflict: 'workspace_id,type' })
    return res.json({ success: true })
  }

  if (!repoUrl) return res.status(400).json({ error: 'repoUrl required' })

  const parsed = parseGithubUrl(repoUrl)
  if (!parsed) return res.status(400).json({ error: 'Invalid GitHub URL' })

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
    if (pkgRes.status === 404) return res.status(400).json({ error: 'Could not find package.json. Is this a Node.js project?', code: 'NO_PACKAGE_JSON' })
    if (pkgRes.status === 401 || pkgRes.status === 403) return res.status(400).json({ error: 'Repository is private. Add a GitHub token to access it.', code: 'PRIVATE_REPO' })
    return res.status(400).json({ error: 'GitHub API error: ' + pkgRes.status })
  }

  const pkgContent = await pkgRes.json()
  const pkgJson = JSON.parse(Buffer.from(pkgContent.content, 'base64').toString('utf8'))
  const deps = pkgJson.dependencies || {}
  const devDeps = pkgJson.devDependencies || {}
  const repoData = repoRes.ok ? await repoRes.json() : null
  const isTypeScript = !!devDeps['typescript'] || !!devDeps['@types/react']

  const extractedData = {
    repoName: repoData?.name || repo,
    repoDescription: repoData?.description || null,
    framework: detectFramework(deps, devDeps),
    language: isTypeScript ? 'TypeScript' : 'JavaScript',
    styling: detectStyling(deps, devDeps),
    uiKit: detectUIKit(deps, devDeps),
    animations: detectAnimations(deps),
    database: detectDatabase(deps),
    allDependencies: [...Object.keys(deps), ...Object.keys(devDeps)],
    packageName: pkgJson.name,
    nodeVersion: pkgJson.engines?.node || null,
    syncedAt: new Date().toISOString(),
  }

  await supabase.from('connectors').upsert({
    workspace_id: workspaceId, user_id: user.id, type: 'github',
    status: 'connected',
    config: { repoUrl, owner, repo, isPrivate: repoData?.private || false },
    extracted_data: extractedData,
    last_synced_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'workspace_id,type' })

  return res.json({ success: true, data: extractedData })
}

// ── Linear helpers ────────────────────────────────────────────────────────────

const LINEAR_API = 'https://api.linear.app/graphql'

async function linearQuery(token, query, variables = {}) {
  const res = await fetch(LINEAR_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': token },
    body: JSON.stringify({ query, variables }),
  })
  if (!res.ok) throw new Error('Linear API error: ' + res.status)
  const data = await res.json()
  if (data.errors) throw new Error(data.errors[0]?.message || 'Linear GraphQL error')
  return data.data
}

async function handleLinear(req, res, user) {
  const { linearToken, workspaceId, action, teamId, tasks } = req.body

  if (action === 'disconnect') {
    await supabase.from('connectors').upsert({
      workspace_id: workspaceId, user_id: user.id, type: 'linear',
      status: 'disconnected', config: {}, extracted_data: {},
      updated_at: new Date().toISOString(),
    }, { onConflict: 'workspace_id,type' })
    return res.json({ success: true })
  }

  if (!linearToken) return res.status(400).json({ error: 'linearToken required' })

  if (action === 'connect' || action === 'sync') {
    const data = await linearQuery(linearToken, `query {
      teams { nodes { id name key states { nodes { id name type color } } } }
      viewer { id name email }
    }`)

    const extractedData = {
      viewer: data.viewer,
      teams: data.teams?.nodes?.map(t => ({ id: t.id, name: t.name, key: t.key, states: t.states?.nodes || [] })) || [],
      syncedAt: new Date().toISOString(),
    }

    await supabase.from('connectors').upsert({
      workspace_id: workspaceId, user_id: user.id, type: 'linear',
      status: 'connected',
      config: { viewerName: data.viewer?.name, viewerEmail: data.viewer?.email },
      extracted_data: extractedData,
      last_synced_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'workspace_id,type' })

    return res.json({ success: true, data: extractedData })
  }

  if (action === 'push_tasks') {
    if (!teamId || !tasks?.length) return res.status(400).json({ error: 'teamId and tasks required' })

    const teamData = await linearQuery(linearToken, `query($teamId: String!) { team(id: $teamId) { states { nodes { id name type } } } }`, { teamId })
    const states = teamData.team?.states?.nodes || []

    const stateMap = {
      'todo': states.find(s => s.type === 'unstarted' || s.name.toLowerCase().includes('todo') || s.name.toLowerCase().includes('backlog'))?.id,
      'inprogress': states.find(s => s.type === 'started' || s.name.toLowerCase().includes('progress') || s.name.toLowerCase().includes('doing'))?.id,
      'review': states.find(s => s.name.toLowerCase().includes('review') || s.name.toLowerCase().includes('testing'))?.id,
      'done': states.find(s => s.type === 'completed' || s.name.toLowerCase().includes('done') || s.name.toLowerCase().includes('complete'))?.id,
    }

    const priorityMap = { 'HIGH': 2, 'MEDIUM': 3, 'LOW': 4 }
    const results = []

    for (const task of tasks) {
      try {
        const stateId = stateMap[task.column] || stateMap['todo']
        const data = await linearQuery(linearToken, `mutation CreateIssue($input: IssueCreateInput!) { issueCreate(input: $input) { success issue { id identifier url title } } }`, {
          input: {
            teamId, title: task.title,
            description: task.description || '',
            priority: priorityMap[task.priority?.toUpperCase()] || 3,
            ...(stateId && { stateId }),
          },
        })
        if (data.issueCreate?.success) results.push({ taskId: task.id, issue: data.issueCreate.issue, success: true })
      } catch (taskErr) {
        results.push({ taskId: task.id, error: taskErr.message, success: false })
      }
    }

    return res.json({ success: true, pushed: results.filter(r => r.success).length, failed: results.filter(r => !r.success).length, results })
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

  const { type, workspaceId } = req.body
  if (!workspaceId) return res.status(400).json({ error: 'workspaceId required' })

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
