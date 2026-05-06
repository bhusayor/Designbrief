import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
)

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

  const { repoUrl, githubToken, workspaceId, action } = req.body

  if (!workspaceId || !action)
    return res.status(400).json({ error: 'workspaceId and action required' })

  try {
    if (action === 'disconnect') {
      await supabase.from('connectors').upsert({
        workspace_id: workspaceId,
        user_id: user.id,
        type: 'github',
        status: 'disconnected',
        config: {},
        extracted_data: {},
        updated_at: new Date().toISOString(),
      }, { onConflict: 'workspace_id,type' })
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

    const [pkgRes, readmeRes, repoRes] = await Promise.all([
      fetch(baseUrl + '/contents/package.json', { headers }),
      fetch(baseUrl + '/contents/README.md', { headers }).catch(() => null),
      fetch(baseUrl, { headers }),
    ])

    if (!pkgRes.ok) {
      if (pkgRes.status === 404)
        return res.status(400).json({
          error: 'Could not find package.json. Is this a Node.js project?',
          code: 'NO_PACKAGE_JSON',
        })
      if (pkgRes.status === 401 || pkgRes.status === 403)
        return res.status(400).json({
          error: 'Repository is private. Add a GitHub token to access it.',
          code: 'PRIVATE_REPO',
        })
      return res.status(400).json({ error: 'GitHub API error: ' + pkgRes.status })
    }

    const pkgContent = await pkgRes.json()
    const pkgJson = JSON.parse(
      Buffer.from(pkgContent.content, 'base64').toString('utf8')
    )

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
      workspace_id: workspaceId,
      user_id: user.id,
      type: 'github',
      status: 'connected',
      config: {
        repoUrl,
        owner,
        repo,
        isPrivate: repoData?.private || false,
      },
      extracted_data: extractedData,
      last_synced_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'workspace_id,type' })

    return res.json({ success: true, data: extractedData })
  } catch (e) {
    console.error('[github connector]', e)
    return res.status(500).json({ error: e.message })
  }
}
