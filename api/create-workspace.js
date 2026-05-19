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

  // ── PATCH: update a task (caller must own the parent project) ───────────
  // Body: { task_id, updates: {...} }
  if (req.method === 'PATCH' && req.body?.task_id) {
    const user = await requireUser(req, res)
    if (!user) return

    const { task_id, updates } = req.body
    if (!updates || typeof updates !== 'object') {
      return res.status(400).json({ error: 'updates required' })
    }

    const allowed = ['title', 'description', 'column_name', 'assigned_role', 'assigned_name', 'assigned_user_id', 'priority', 'estimated_days', 'due_date', 'start_date', 'labels', 'reporter_id', 'ai_prompt', 'completed', 'completed_at', 'blocked_by', 'position', 'phase']
    const patch = { updated_at: new Date().toISOString() }
    for (const k of allowed) if (k in updates) patch[k] = updates[k]

    try {
      const { data: task } = await supabase
        .from('tasks')
        .select('id, project_id')
        .eq('id', task_id)
        .maybeSingle()
      if (!task) return res.status(404).json({ error: 'Task not found' })

      const { data: project } = await supabase
        .from('projects')
        .select('user_id')
        .eq('id', task.project_id)
        .maybeSingle()
      if (!project || project.user_id !== user.id) {
        return res.status(403).json({ error: 'Not project owner' })
      }

      const { data, error } = await supabase
        .from('tasks')
        .update(patch)
        .eq('id', task_id)
        .select('*')
        .single()
      if (error) throw error
      return res.json({ task: data })
    } catch (e) {
      console.error('[create-workspace PATCH task]', e)
      return res.status(500).json({ error: e.message })
    }
  }

  // ── POST: bulk upsert tasks for a project ───────────────────────────────
  // Body: { kind: 'tasks', project_id, tasks: [...] }
  if (req.method === 'POST' && req.body?.kind === 'tasks') {
    const user = await requireUser(req, res)
    if (!user) return

    const { project_id, tasks } = req.body
    if (!project_id || !Array.isArray(tasks)) {
      return res.status(400).json({ error: 'project_id and tasks array required' })
    }

    try {
      const { data: project } = await supabase
        .from('projects')
        .select('user_id')
        .eq('id', project_id)
        .maybeSingle()
      if (project && project.user_id !== user.id) {
        return res.status(403).json({ error: 'Not project owner' })
      }
      // If project doesn't exist yet, create it (FK)
      if (!project) {
        await supabase
          .from('projects')
          .upsert({
            id: project_id,
            user_id: user.id,
            section: 'team',
            updated_at: new Date().toISOString(),
          }, { onConflict: 'id' })
      }

      // Always overwrite position with array index so display order stays
      // stable across saves. Drift from preserved-but-stale positions was
      // making tasks appear in the wrong order on re-load.
      const records = tasks.map((t, i) => ({
        id: t.id,
        project_id,
        user_id: user.id,
        title: t.title || 'Untitled Task',
        description: t.description || '',
        column_name: t.column || t.column_name || 'To Do',
        assigned_role: t.assignedRole || t.assigned_role || '',
        assigned_name: t.assignedName || t.assigned_name || '',
        priority: t.priority || 'MEDIUM',
        estimated_days: t.estimatedDays || t.estimated_days || 1,
        due_date: t.dueDate || t.due_date || null,
        completed: (t.column || t.column_name) === 'Done',
        blocked_by: t.blockedBy || t.blocked_by || [],
        position: i,
        phase: t.phase || null,
        updated_at: new Date().toISOString(),
      }))

      const { error } = await supabase
        .from('tasks')
        .upsert(records, { onConflict: 'id' })
      if (error) throw error
      return res.json({ ok: true, count: records.length })
    } catch (e) {
      console.error('[create-workspace POST tasks]', e)
      return res.status(500).json({ error: e.message })
    }
  }

  // ── POST: add a subtask (caller must own the parent project) ───────────
  // Body: { kind:'subtask', task_id, project_id, title }
  if (req.method === 'POST' && req.body?.kind === 'subtask') {
    const user = await requireUser(req, res)
    if (!user) return

    const { task_id, project_id, title } = req.body
    if (!task_id || !project_id || !title) {
      return res.status(400).json({ error: 'task_id, project_id and title required' })
    }
    try {
      const { data: project } = await supabase
        .from('projects')
        .select('user_id')
        .eq('id', project_id)
        .maybeSingle()
      if (project && project.user_id !== user.id) {
        return res.status(403).json({ error: 'Not project owner' })
      }

      const id = Math.random().toString(36).slice(2, 10)
      const { data, error } = await supabase
        .from('subtasks')
        .insert({ id, task_id, project_id, title })
        .select('*')
        .single()
      if (error) throw error
      return res.json({ subtask: data })
    } catch (e) {
      console.error('[create-workspace POST subtask]', e)
      return res.status(500).json({ error: e.message })
    }
  }

  // ── PATCH: toggle / rename a subtask ────────────────────────────────────
  // Body: { subtask_id, updates: { completed?, title? } }
  if (req.method === 'PATCH' && req.body?.subtask_id) {
    const user = await requireUser(req, res)
    if (!user) return

    const { subtask_id, updates } = req.body
    if (!updates || typeof updates !== 'object') {
      return res.status(400).json({ error: 'updates required' })
    }

    try {
      const { data: sub } = await supabase
        .from('subtasks')
        .select('id, project_id')
        .eq('id', subtask_id)
        .maybeSingle()
      if (!sub) return res.status(404).json({ error: 'Subtask not found' })

      const { data: project } = await supabase
        .from('projects')
        .select('user_id')
        .eq('id', sub.project_id)
        .maybeSingle()
      if (project && project.user_id !== user.id) {
        return res.status(403).json({ error: 'Not project owner' })
      }

      const patch = {}
      if ('completed' in updates) {
        patch.completed = !!updates.completed
        patch.completed_at = updates.completed ? new Date().toISOString() : null
      }
      if ('title' in updates) patch.title = updates.title

      const { data, error } = await supabase
        .from('subtasks')
        .update(patch)
        .eq('id', subtask_id)
        .select('*')
        .single()
      if (error) throw error
      return res.json({ subtask: data })
    } catch (e) {
      console.error('[create-workspace PATCH subtask]', e)
      return res.status(500).json({ error: e.message })
    }
  }

  // ── DELETE: delete a subtask ────────────────────────────────────────────
  // Body: { subtask_id }
  if (req.method === 'DELETE' && req.body?.subtask_id) {
    const user = await requireUser(req, res)
    if (!user) return

    const { subtask_id } = req.body
    try {
      const { data: sub } = await supabase
        .from('subtasks')
        .select('id, project_id')
        .eq('id', subtask_id)
        .maybeSingle()
      if (!sub) return res.json({ ok: true })

      const { data: project } = await supabase
        .from('projects')
        .select('user_id')
        .eq('id', sub.project_id)
        .maybeSingle()
      if (project && project.user_id !== user.id) {
        return res.status(403).json({ error: 'Not project owner' })
      }

      const { error } = await supabase.from('subtasks').delete().eq('id', subtask_id)
      if (error) throw error
      return res.json({ ok: true })
    } catch (e) {
      console.error('[create-workspace DELETE subtask]', e)
      return res.status(500).json({ error: e.message })
    }
  }

  // ── POST: add a comment ────────────────────────────────────────────────
  // Body: { kind:'comment', task_id, project_id, author_name, content }
  if (req.method === 'POST' && req.body?.kind === 'comment') {
    const user = await requireUser(req, res)
    if (!user) return

    const { task_id, project_id, author_name, content } = req.body
    if (!task_id || !project_id || !content) {
      return res.status(400).json({ error: 'task_id, project_id and content required' })
    }
    try {
      const { data: project } = await supabase
        .from('projects')
        .select('user_id')
        .eq('id', project_id)
        .maybeSingle()
      if (project && project.user_id !== user.id) {
        return res.status(403).json({ error: 'Not project owner' })
      }

      const id = Math.random().toString(36).slice(2, 10)
      const { data, error } = await supabase
        .from('task_comments')
        .insert({
          id, task_id, project_id,
          user_id: user.id,
          author_name: author_name || user.email || 'User',
          content,
        })
        .select('*')
        .single()
      if (error) throw error

      // Also log to task_activity so the History tab picks it up
      await supabase.from('task_activity').insert({
        id: Math.random().toString(36).slice(2, 10),
        task_id, project_id, user_id: user.id,
        actor_name: author_name || user.email || 'User',
        action: 'added comment',
        new_value: content.slice(0, 80),
      })

      return res.json({ comment: data })
    } catch (e) {
      console.error('[create-workspace POST comment]', e)
      return res.status(500).json({ error: e.message })
    }
  }

  // ── DELETE: delete a comment ───────────────────────────────────────────
  // Body: { comment_id }
  if (req.method === 'DELETE' && req.body?.comment_id) {
    const user = await requireUser(req, res)
    if (!user) return
    const { comment_id } = req.body
    try {
      const { data: comment } = await supabase
        .from('task_comments')
        .select('id, project_id, user_id')
        .eq('id', comment_id)
        .maybeSingle()
      if (!comment) return res.json({ ok: true })

      const { data: project } = await supabase
        .from('projects')
        .select('user_id')
        .eq('id', comment.project_id)
        .maybeSingle()
      const isOwner = project && project.user_id === user.id
      const isAuthor = comment.user_id === user.id
      if (!isOwner && !isAuthor) {
        return res.status(403).json({ error: 'Not allowed' })
      }

      const { error } = await supabase.from('task_comments').delete().eq('id', comment_id)
      if (error) throw error
      return res.json({ ok: true })
    } catch (e) {
      console.error('[create-workspace DELETE comment]', e)
      return res.status(500).json({ error: e.message })
    }
  }

  // ── POST: log an activity entry ────────────────────────────────────────
  // Body: { kind:'activity', task_id, project_id, action, old_value, new_value, actor_name }
  if (req.method === 'POST' && req.body?.kind === 'activity') {
    const user = await requireUser(req, res)
    if (!user) return
    const { task_id, project_id, action, old_value, new_value, actor_name } = req.body
    if (!task_id || !project_id || !action) {
      return res.status(400).json({ error: 'task_id, project_id and action required' })
    }
    try {
      const { error } = await supabase.from('task_activity').insert({
        id: Math.random().toString(36).slice(2, 10),
        task_id, project_id,
        user_id: user.id,
        actor_name: actor_name || user.email || 'User',
        action,
        old_value: old_value || null,
        new_value: new_value || null,
      })
      if (error) throw error
      return res.json({ ok: true })
    } catch (e) {
      console.error('[create-workspace POST activity]', e)
      return res.status(500).json({ error: e.message })
    }
  }

  // ── POST: AI-enhance a description ─────────────────────────────────────
  // Body: { kind:'enhance-description', text, title }
  if (req.method === 'POST' && req.body?.kind === 'enhance-description') {
    const user = await requireUser(req, res)
    if (!user) return
    const { text, title } = req.body
    try {
      const apiKey = process.env.ANTHROPIC_API_KEY
      if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' })

      const userMsg = `Task title: "${title || 'Untitled'}"\n\nCurrent description:\n"""\n${text || '(empty)'}\n"""\n\nRewrite the description to be clearer, more actionable, and well-structured. Use short paragraphs and bullet points when helpful. Keep the original intent. Output ONLY the new description text, no preamble.`

      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-5',
          max_tokens: 800,
          messages: [{ role: 'user', content: userMsg }],
        }),
      })
      if (!resp.ok) {
        const err = await resp.text()
        return res.status(500).json({ error: 'AI failed: ' + err.slice(0, 200) })
      }
      const data = await resp.json()
      const enhanced = data?.content?.[0]?.text?.trim() || ''
      return res.json({ description: enhanced })
    } catch (e) {
      console.error('[create-workspace POST enhance]', e)
      return res.status(500).json({ error: e.message })
    }
  }

  // ── DELETE: delete a task (caller must own parent project) ──────────────
  // Body: { task_id }
  if (req.method === 'DELETE' && req.body?.task_id) {
    const user = await requireUser(req, res)
    if (!user) return

    const { task_id } = req.body
    try {
      const { data: task } = await supabase
        .from('tasks')
        .select('id, project_id')
        .eq('id', task_id)
        .maybeSingle()
      if (!task) return res.json({ ok: true })

      const { data: project } = await supabase
        .from('projects')
        .select('user_id')
        .eq('id', task.project_id)
        .maybeSingle()
      if (project && project.user_id !== user.id) {
        return res.status(403).json({ error: 'Not project owner' })
      }

      const { error } = await supabase.from('tasks').delete().eq('id', task_id)
      if (error) throw error
      return res.json({ ok: true })
    } catch (e) {
      console.error('[create-workspace DELETE task]', e)
      return res.status(500).json({ error: e.message })
    }
  }

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
