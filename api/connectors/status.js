import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
)

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).end()

  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing authorization header' })
  }

  const token = authHeader.replace('Bearer ', '')
  if (!token || token === 'undefined' || token === 'null') {
    return res.status(401).json({ error: 'Invalid token' })
  }

  const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
  if (authErr || !user) {
    console.error('[status auth]', authErr)
    return res.status(401).json({ error: 'Invalid session' })
  }

  const { workspaceId, projectId } = req.body
  if (!workspaceId) return res.status(400).json({ error: 'workspaceId required' })

  try {
    const { data: wt } = await supabase
      .from('workspace_tokens')
      .select('figma_installed, figma_token_hint, github_installed, github_token_hint, linear_installed, linear_token_hint')
      .eq('workspace_id', workspaceId)
      .single()

    let pc = null
    if (projectId && projectId !== 'workspace') {
      const { data } = await supabase
        .from('project_connectors')
        .select('*')
        .eq('workspace_id', workspaceId)
        .eq('project_id', String(projectId))
        .single()
      pc = data
    }

    return res.json({
      installed: {
        figma: wt?.figma_installed || false,
        github: wt?.github_installed || false,
        linear: wt?.linear_installed || false,
      },
      hints: {
        figma: wt?.figma_token_hint || null,
        github: wt?.github_token_hint || null,
        linear: wt?.linear_token_hint || null,
      },
      project: pc || null,
    })
  } catch (e) {
    console.error('[connector status]', e)
    return res.status(500).json({ error: e.message })
  }
}
