import { createClient } from '@supabase/supabase-js'

/*
 * Run in Supabase SQL Editor before deploying:
 *
 * CREATE TABLE IF NOT EXISTS workspaces (
 *   id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
 *   name text NOT NULL,
 *   slug text UNIQUE,
 *   owner_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
 *   plan text DEFAULT 'free' CHECK (plan IN ('free','pro','business')),
 *   credits_used_today integer DEFAULT 0,
 *   credits_reset_at timestamptz,
 *   created_at timestamptz DEFAULT now(),
 *   updated_at timestamptz DEFAULT now()
 * );
 *
 * CREATE TABLE IF NOT EXISTS workspace_members (
 *   id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
 *   workspace_id uuid REFERENCES workspaces(id) ON DELETE CASCADE,
 *   user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
 *   role text DEFAULT 'member' CHECK (role IN ('owner','admin','member')),
 *   created_at timestamptz DEFAULT now(),
 *   UNIQUE(workspace_id, user_id)
 * );
 *
 * ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
 * ALTER TABLE workspace_members ENABLE ROW LEVEL SECURITY;
 *
 * CREATE POLICY "Members can read their workspaces"
 *   ON workspaces FOR SELECT
 *   USING (
 *     owner_id = auth.uid() OR
 *     EXISTS (
 *       SELECT 1 FROM workspace_members
 *       WHERE workspace_id = workspaces.id
 *       AND user_id = auth.uid()
 *     )
 *   );
 *
 * CREATE POLICY "Members can read workspace_members"
 *   ON workspace_members FOR SELECT
 *   USING (user_id = auth.uid());
 */

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
)

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
}

async function requireUser(req, res) {
  const authHeader = req.headers.authorization || req.headers.Authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing Authorization header' })
    return null
  }
  const { data: { user }, error } = await supabase.auth.getUser(authHeader.slice(7))
  if (error || !user) {
    res.status(401).json({ error: 'Invalid or expired token' })
    return null
  }
  return user
}

export default async function handler(req, res) {
  setCors(res)

  if (req.method === 'OPTIONS') return res.status(200).end()

  // ── PATCH: update a project the caller owns (bypasses RLS via service key) ──
  // Body: { project_id, updates: { title?, pinned?, locked?, ... } }
  if (req.method === 'PATCH') {
    const user = await requireUser(req, res)
    if (!user) return

    const { project_id, updates } = req.body || {}
    if (!project_id || !updates || typeof updates !== 'object') {
      return res.status(400).json({ error: 'project_id and updates required' })
    }

    // Whitelist allowed columns so callers can't update sensitive fields
    const allowed = ['title', 'pinned', 'locked', 'section', 'kanban', 'team_members', 'approval_status', 'comments']
    const patch = { updated_at: new Date().toISOString() }
    for (const k of allowed) if (k in updates) patch[k] = updates[k]

    try {
      // Verify ownership server-side, then upsert. Upsert covers the case
      // where the row doesn't yet exist (TC-created project that hasn't
      // had its first save).
      const { data: existing } = await supabase
        .from('projects')
        .select('id, user_id')
        .eq('id', project_id)
        .maybeSingle()

      if (existing && existing.user_id !== user.id) {
        return res.status(403).json({ error: 'Not project owner' })
      }

      // For new rows only, default section to 'team' so the project doesn't
      // get the DB default 'translator' and start showing in BriefTranslator
      // Recents. UPDATEs of existing rows don't touch section unless the
      // caller explicitly sent one in `updates`.
      if (!existing && !('section' in patch)) {
        patch.section = 'team'
      }

      const { data, error } = await supabase
        .from('projects')
        .upsert({
          id: project_id,
          user_id: user.id,
          ...patch,
        }, { onConflict: 'id' })
        .select('*')
        .single()

      if (error) throw error
      return res.json({ project: data })
    } catch (e) {
      console.error('[create-workspace PATCH project]', e)
      return res.status(500).json({ error: e.message })
    }
  }

  // ── DELETE: delete a project the caller owns ────────────────────────────────
  // Body: { project_id }
  if (req.method === 'DELETE') {
    const user = await requireUser(req, res)
    if (!user) return

    const project_id = req.body?.project_id || req.query?.project_id
    if (!project_id) return res.status(400).json({ error: 'project_id required' })

    try {
      const { data: existing } = await supabase
        .from('projects')
        .select('id, user_id')
        .eq('id', project_id)
        .maybeSingle()

      if (!existing) return res.json({ ok: true })
      if (existing.user_id !== user.id) {
        return res.status(403).json({ error: 'Not project owner' })
      }

      const { error } = await supabase
        .from('projects')
        .delete()
        .eq('id', project_id)

      if (error) throw error
      return res.json({ ok: true })
    } catch (e) {
      console.error('[create-workspace DELETE project]', e)
      return res.status(500).json({ error: e.message })
    }
  }

  // ── GET: look up the authenticated user's workspace (bypasses RLS) ──────
  if (req.method === 'GET') {
    const authHeader = req.headers.authorization || req.headers.Authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing Authorization header' })
    }
    const accessToken = authHeader.slice(7)

    const { data: { user }, error: userErr } = await supabase.auth.getUser(accessToken)
    if (userErr || !user) {
      return res.status(401).json({ error: 'Invalid or expired token' })
    }

    try {
      const { data: owned, error: ownedErr } = await supabase
        .from('workspaces')
        .select('*')
        .eq('owner_id', user.id)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle()

      if (ownedErr) throw ownedErr

      const { data: memberRows, error: memberErr } = await supabase
        .from('workspace_members')
        .select('workspace_id, role, workspaces(*)')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true })

      if (memberErr) throw memberErr

      const memberWorkspace =
        memberRows?.find(m => m.workspaces)?.workspaces || null

      const workspace = owned || memberWorkspace

      // Diagnostic: surface DB state so we can debug login loop
      return res.json({
        workspace,
        debug: {
          authedUserId: user.id,
          authedEmail: user.email,
          ownedWorkspaceFound: !!owned,
          memberWorkspaceCount: memberRows?.length || 0,
        },
      })
    } catch (e) {
      console.error('[create-workspace GET]', e)
      return res.status(500).json({ error: e.message, stack: e.stack })
    }
  }

  // ── POST: create a workspace ────────────────────────────────────────────
  if (req.method !== 'POST') return res.status(405).end()

  const { userId, workspaceName, plan } = req.body

  if (!userId || !workspaceName) {
    return res.status(400).json({ error: 'userId and workspaceName required' })
  }

  try {
    const { data: workspace, error } = await supabase
      .from('workspaces')
      .insert({
        name: workspaceName.trim(),
        owner_id: userId,
        plan: plan || 'free',
        credits_used_today: 0,
        credits_reset_at: new Date(
          new Date().setUTCHours(24, 0, 0, 0)
        ).toISOString(),
      })
      .select('*')
      .single()

    if (error) throw error

    await supabase
      .from('workspace_members')
      .insert({
        workspace_id: workspace.id,
        user_id: userId,
        role: 'owner',
      })

    return res.json({ workspace })
  } catch (e) {
    console.error('[create-workspace]', e)
    return res.status(500).json({ error: e.message })
  }
}
