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

export default async function handler(req, res) {
  setCors(res)
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).end()

  // Verify the user's session token
  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token || token === 'undefined' || token === 'null' || !token.trim())
    return res.status(401).json({ error: 'Unauthorised' })

  const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
  if (authErr || !user)
    return res.status(401).json({ error: 'Invalid session' })

  try {
    // 1. Try to find a workspace the user owns
    let { data: workspace } = await supabase
      .from('workspaces')
      .select('*')
      .eq('owner_id', user.id)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()

    // 2. Fall back to workspaces the user is a member of
    if (!workspace) {
      const { data: membership } = await supabase
        .from('workspace_members')
        .select('workspace_id')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle()

      if (membership?.workspace_id) {
        const { data: memberWs } = await supabase
          .from('workspaces')
          .select('*')
          .eq('id', membership.workspace_id)
          .maybeSingle()
        workspace = memberWs || null
      }
    }

    // 3. Auto-create a default workspace so the user never hits the setup screen
    if (!workspace) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, first_name')
        .eq('id', user.id)
        .maybeSingle()

      const displayName =
        profile?.first_name ||
        profile?.full_name?.split(' ')[0] ||
        user.user_metadata?.full_name?.split(' ')[0] ||
        user.email?.split('@')[0] ||
        'My'

      const wsName = `${displayName}'s Workspace`

      const { data: newWs, error: createErr } = await supabase
        .from('workspaces')
        .insert({
          name: wsName,
          owner_id: user.id,
          plan: 'free',
          credits_used_today: 0,
          credits_reset_at: new Date(new Date().setUTCHours(24, 0, 0, 0)).toISOString(),
        })
        .select('*')
        .single()

      if (createErr) throw createErr

      await supabase
        .from('workspace_members')
        .insert({ workspace_id: newWs.id, user_id: user.id, role: 'owner' })

      workspace = newWs
    }

    return res.json({ workspace })
  } catch (e) {
    console.error('[get-workspace]', e)
    return res.status(500).json({ error: e.message })
  }
}
