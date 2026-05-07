import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
)

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
}

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

export default async function handler(req, res) {
  setCors(res)
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).end()

  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) return res.status(401).json({ error: 'Unauthorised' })

  const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
  if (authErr || !user) return res.status(401).json({ error: 'Invalid session' })

  const { action, githubToken, repoUrl, projectId, workspaceId } = req.body
  if (!workspaceId) return res.status(400).json({ error: 'workspaceId required' })

  try {
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
          return res.status(400).json({
            error: 'Invalid GitHub token. Go to GitHub → Settings → Developer settings → Personal access tokens.',
            code: 'INVALID_TOKEN',
          })
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

      return res.json({ success: true, installed: true, user: githubUser?.login || null })
    }

    if (action === 'uninstall') {
      await supabase.from('workspace_tokens')
        .update({ github_installed: false, github_token_hint: null, updated_at: new Date().toISOString() })
        .eq('workspace_id', workspaceId)

      await supabase.from('project_connectors')
        .update({ github_repo_url: null, github_repo_name: null, github_extracted: {}, github_synced_at: null, updated_at: new Date().toISOString() })
        .eq('workspace_id', workspaceId)

      return res.json({ success: true })
    }

    if (action === 'disconnect') {
      if (!projectId) return res.status(400).json({ error: 'projectId required' })
      await supabase.from('project_connectors').upsert({
        project_id: projectId, workspace_id: workspaceId, user_id: user.id,
        github_repo_url: null, github_repo_name: null,
        github_extracted: {}, github_synced_at: null, updated_at: new Date().toISOString(),
      }, { onConflict: 'project_id,workspace_id' })
      return res.json({ success: true })
    }

    // connect
    if (!projectId) return res.status(400).json({ error: 'projectId required' })
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
      if (pkgRes.status === 404)
        return res.status(400).json({ error: 'No package.json found. Is this a Node.js project?', code: 'NO_PACKAGE_JSON' })
      if (pkgRes.status === 401 || pkgRes.status === 403)
        return res.status(400).json({ error: 'Private repo — add a GitHub token to access it.', code: 'PRIVATE_REPO' })
      return res.status(400).json({ error: 'GitHub error: ' + pkgRes.status })
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

    return res.json({ success: true, data: extracted })
  } catch (e) {
    console.error('[connectors/github]', e)
    return res.status(500).json({ error: e.message })
  }
}
