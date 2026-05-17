import { createClient } from '@supabase/supabase-js'

/*
 * Returns the workspace for an authenticated user.
 * Uses the SERVICE ROLE KEY which bypasses RLS, so this works even if
 * the workspaces RLS SELECT policy is missing or misconfigured.
 *
 * Auth: caller must send the user's access token in the Authorization header.
 * We verify the token server-side before reading any rows.
 */

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

export default async function handler(req, res) {
  setCors(res)

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).end()

  const authHeader = req.headers.authorization || req.headers.Authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing Authorization header' })
  }
  const accessToken = authHeader.slice(7)

  // Validate the JWT and pull the canonical user id from Supabase
  const { data: { user }, error: userErr } = await supabase.auth.getUser(accessToken)
  if (userErr || !user) {
    return res.status(401).json({ error: 'Invalid or expired token' })
  }

  try {
    // 1. Workspace this user owns (oldest first — they keep their first one)
    const { data: owned, error: ownedErr } = await supabase
      .from('workspaces')
      .select('*')
      .eq('owner_id', user.id)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (ownedErr) throw ownedErr

    if (owned) return res.json({ workspace: owned })

    // 2. Fall back to any workspace this user is a member of
    const { data: membership, error: memberErr } = await supabase
      .from('workspace_members')
      .select('workspace_id, workspaces(*)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (memberErr) throw memberErr

    return res.json({ workspace: membership?.workspaces || null })
  } catch (e) {
    console.error('[get-workspace]', e)
    return res.status(500).json({ error: e.message })
  }
}
