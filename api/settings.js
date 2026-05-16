import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
)

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).end()

  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token || token === 'undefined' || token === 'null' || token.trim() === '')
    return res.status(401).json({ error: 'Unauthorised' })

  const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
  if (authErr || !user)
    return res.status(401).json({ error: 'Invalid session' })

  const { action } = req.body

  try {
    // ── UPDATE DISPLAY NAME ───────────────────────────────────────────────────
    if (action === 'update_name') {
      const { name } = req.body
      if (!name?.trim())
        return res.status(400).json({ error: 'Name is required' })

      const { error } = await supabase.auth.admin.updateUserById(user.id, {
        user_metadata: {
          ...user.user_metadata,
          name: name.trim(),
          full_name: name.trim(),
        },
      })

      if (error) throw error
      return res.json({ success: true })
    }

    // ── UPDATE WORKSPACE NAME ─────────────────────────────────────────────────
    if (action === 'update_workspace_name') {
      const { workspaceId, name } = req.body
      if (!workspaceId || !name?.trim())
        return res.status(400).json({ error: 'workspaceId and name required' })

      const { data: member } = await supabase
        .from('workspace_members')
        .select('role')
        .eq('workspace_id', workspaceId)
        .eq('user_id', user.id)
        .single()

      if (!member || !['owner', 'admin'].includes(member.role))
        return res.status(403).json({ error: 'Only owners and admins can update the workspace name' })

      const { error } = await supabase
        .from('workspaces')
        .update({ name: name.trim() })
        .eq('id', workspaceId)

      if (error) throw error
      return res.json({ success: true })
    }

    // ── DELETE WORKSPACE ──────────────────────────────────────────────────────
    if (action === 'delete_workspace') {
      const { workspaceId, confirmName } = req.body
      if (!workspaceId || !confirmName)
        return res.status(400).json({ error: 'workspaceId and confirmName required' })

      const { data: member } = await supabase
        .from('workspace_members')
        .select('role')
        .eq('workspace_id', workspaceId)
        .eq('user_id', user.id)
        .single()

      if (!member || member.role !== 'owner')
        return res.status(403).json({ error: 'Only the workspace owner can delete the workspace' })

      const { data: workspace } = await supabase
        .from('workspaces')
        .select('name')
        .eq('id', workspaceId)
        .single()

      if (!workspace)
        return res.status(404).json({ error: 'Workspace not found' })

      if (workspace.name.toLowerCase().trim() !== confirmName.toLowerCase().trim())
        return res.status(400).json({ error: 'Workspace name does not match' })

      const { error } = await supabase
        .from('workspaces')
        .delete()
        .eq('id', workspaceId)

      if (error) throw error
      return res.json({ success: true })
    }

    // ── LEAVE WORKSPACE ───────────────────────────────────────────────────────
    if (action === 'leave_workspace') {
      const { workspaceId } = req.body
      if (!workspaceId)
        return res.status(400).json({ error: 'workspaceId required' })

      const { data: member } = await supabase
        .from('workspace_members')
        .select('role')
        .eq('workspace_id', workspaceId)
        .eq('user_id', user.id)
        .single()

      if (!member)
        return res.status(404).json({ error: 'You are not a member of this workspace' })

      if (member.role === 'owner')
        return res.status(400).json({
          error: 'Workspace owners cannot leave. Transfer ownership first or delete the workspace.',
        })

      const { error } = await supabase
        .from('workspace_members')
        .delete()
        .eq('workspace_id', workspaceId)
        .eq('user_id', user.id)

      if (error) throw error
      return res.json({ success: true })
    }

    // ── DELETE ACCOUNT ────────────────────────────────────────────────────────
    if (action === 'delete_account') {
      const { error } = await supabase.auth.admin.deleteUser(user.id)
      if (error) throw error
      return res.json({ success: true })
    }

    // ── GET WORKSPACE ─────────────────────────────────────────────────────────
    if (action === 'get-workspace') {
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

      return res.json({ workspace: workspace || null })
    }

    return res.status(400).json({ error: 'Unknown action: ' + action })
  } catch (e) {
    console.error('[settings]', e)
    return res.status(500).json({ error: e.message })
  }
}
