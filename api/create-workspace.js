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

// Returns true if user is the project owner OR an active team_member on it.
// Used for write authorization across task / subtask / comment endpoints
// so invited collaborators (not just the owner) can act on the project.
async function userHasProjectAccess(userId, projectId) {
  if (!userId || !projectId) return false
  const { data: project } = await supabase
    .from('projects')
    .select('user_id')
    .eq('id', projectId)
    .maybeSingle()
  if (project && project.user_id === userId) return true

  const { data: member } = await supabase
    .from('team_members')
    .select('id')
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle()
  return !!member
}

// Returns the user's role on the project:
//   'Admin'   — project creator OR active team_member with job_role='Admin'
//   'Editor'  — active team_member with any other non-Viewer role
//   'Viewer'  — active team_member with role Viewer/Guest
//   null      — no access at all
// Normalises legacy roles (Team Member / Collaborator / PM / etc.) into
// 'Editor', matching the client-side normaliseRole() in AppContext.
async function userProjectRole(userId, projectId) {
  if (!userId || !projectId) return null
  const { data: project } = await supabase
    .from('projects')
    .select('user_id')
    .eq('id', projectId)
    .maybeSingle()
  if (project && project.user_id === userId) return 'Admin'

  const { data: member } = await supabase
    .from('team_members')
    .select('job_role')
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle()
  if (!member) return null
  const r = String(member.job_role || '').toLowerCase()
  if (r === 'viewer' || r === 'guest') return 'Viewer'
  if (r === 'admin') return 'Admin'
  return 'Editor'
}

// Hard gate for write endpoints. Admin + Editor pass; Viewer is blocked.
// Returns { ok: true } on success, or sends a 403 response and returns
// { ok: false } so the handler can early-return.
async function requireEditor(req, res, userId, projectId, opts = {}) {
  const role = await userProjectRole(userId, projectId)
  if (role === 'Admin' || role === 'Editor') return { ok: true, role }
  if (role === 'Viewer') {
    res.status(403).json({
      error: opts.label
        ? `Viewers cannot ${opts.label}`
        : 'Read-only access — Viewers cannot edit this project',
      code: 'VIEWER_FORBIDDEN',
    })
    return { ok: false, role: 'Viewer' }
  }
  res.status(403).json({ error: 'Not a project member' })
  return { ok: false, role: null }
}

// Strict admin gate. Project creator OR an invited member whose job_role
// resolves to 'Admin'. Used for the admin-only endpoints (invite, manage
// roles, set credit limits, remove members, etc).
async function requireAdmin(req, res, userId, projectId, opts = {}) {
  const role = await userProjectRole(userId, projectId)
  if (role === 'Admin') return { ok: true, role }
  res.status(403).json({
    error: opts.label
      ? `Only the project Admin can ${opts.label}`
      : 'Only the project Admin can do this',
    code: 'ADMIN_ONLY',
  })
  return { ok: false, role }
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

      // If the task row exists, verify the caller owns the parent project.
      // If it does NOT exist yet (e.g. user just clicked "+ Add Task" and
      // the save hasn't landed yet), allow the upsert — the body MUST
      // include project_id in updates for us to be able to create the row.
      if (task) {
        const gate = await requireEditor(req, res, user.id, task.project_id, { label: 'edit tasks' })
        if (!gate.ok) return
        const { data, error } = await supabase
          .from('tasks')
          .update(patch)
          .eq('id', task_id)
          .select('*')
          .single()
        if (error) throw error
        return res.json({ task: data })
      }

      // Race-safe upsert path: task doesn't exist yet, create from updates
      const projectIdFromBody = updates.project_id || req.body?.project_id
      if (!projectIdFromBody) {
        return res.status(404).json({ error: 'Task not found and no project_id provided' })
      }
      // Allow creation even if project doesn't exist yet (initial creation flow)
      const { data: projectExists } = await supabase
        .from('projects')
        .select('id')
        .eq('id', projectIdFromBody)
        .maybeSingle()
      if (projectExists) {
        const gate = await requireEditor(req, res, user.id, projectIdFromBody, { label: 'create tasks' })
        if (!gate.ok) return
      }

      const { data, error } = await supabase
        .from('tasks')
        .upsert({
          id: task_id,
          project_id: projectIdFromBody,
          user_id: user.id,
          title: patch.title || 'Untitled Task',
          ...patch,
        }, { onConflict: 'id' })
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
      if (project) {
        const gate = await requireEditor(req, res, user.id, project_id, { label: 'save tasks' })
        if (!gate.ok) return
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
        assigned_user_id: t.assignedUserId || t.assigned_user_id || null,
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
      const gate = await requireEditor(req, res, user.id, project_id, { label: 'add subtasks' })
      if (!gate.ok) return

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

      const gate = await requireEditor(req, res, user.id, sub.project_id, { label: 'edit subtasks' })
      if (!gate.ok) return

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

      const gate = await requireEditor(req, res, user.id, sub.project_id, { label: 'delete subtasks' })
      if (!gate.ok) return

      const { error } = await supabase.from('subtasks').delete().eq('id', subtask_id)
      if (error) throw error
      return res.json({ ok: true })
    } catch (e) {
      console.error('[create-workspace DELETE subtask]', e)
      return res.status(500).json({ error: e.message })
    }
  }

  // ── POST: add a comment (top-level OR reply) ──────────────────────────
  // Body: { kind:'comment', task_id, project_id, author_name, content, parent_id? }
  if (req.method === 'POST' && req.body?.kind === 'comment') {
    const user = await requireUser(req, res)
    if (!user) return

    const { task_id, project_id, author_name, content, parent_id, attachments } = req.body
    // Allow attachment-only comments (no text content) so users can drop files
    if (!task_id || !project_id || (!content && !(Array.isArray(attachments) && attachments.length > 0))) {
      return res.status(400).json({ error: 'task_id, project_id, and content or attachments required' })
    }
    try {
      if (!(await userHasProjectAccess(user.id, project_id))) {
        return res.status(403).json({ error: 'Not a project member' })
      }

      const id = Math.random().toString(36).slice(2, 10)
      const row = {
        id, task_id, project_id,
        user_id: user.id,
        author_name: author_name || user.email || 'User',
        content: content || '',
      }
      if (parent_id) row.parent_id = parent_id
      if (Array.isArray(attachments) && attachments.length > 0) row.attachments = attachments

      const { data, error } = await supabase
        .from('task_comments')
        .insert(row)
        .select('*')
        .single()
      if (error) throw error

      // Also log to task_activity so the History tab picks it up
      await supabase.from('task_activity').insert({
        id: Math.random().toString(36).slice(2, 10),
        task_id, project_id, user_id: user.id,
        actor_name: author_name || user.email || 'User',
        action: parent_id ? 'replied' : 'added comment',
        new_value: content.slice(0, 80),
      })

      return res.json({ comment: data })
    } catch (e) {
      console.error('[create-workspace POST comment]', e)
      return res.status(500).json({ error: e.message })
    }
  }

  // ── PATCH: edit a comment ──────────────────────────────────────────────
  // Body: { comment_id, updates: { content } }
  if (req.method === 'PATCH' && req.body?.comment_id) {
    const user = await requireUser(req, res)
    if (!user) return
    const { comment_id, updates } = req.body
    if (!updates?.content) return res.status(400).json({ error: 'content required' })
    try {
      const { data: comment } = await supabase
        .from('task_comments')
        .select('id, user_id, project_id')
        .eq('id', comment_id)
        .maybeSingle()
      if (!comment) return res.status(404).json({ error: 'Comment not found' })

      // Author OR project owner can edit
      const { data: project } = await supabase
        .from('projects')
        .select('user_id')
        .eq('id', comment.project_id)
        .maybeSingle()
      const isAuthor = comment.user_id === user.id
      const isOwner = project && project.user_id === user.id
      if (!isAuthor && !isOwner) {
        return res.status(403).json({ error: 'Not allowed' })
      }

      const { data, error } = await supabase
        .from('task_comments')
        .update({
          content: updates.content,
          updated_at: new Date().toISOString(),
        })
        .eq('id', comment_id)
        .select('*')
        .single()
      if (error) throw error
      return res.json({ comment: data })
    } catch (e) {
      console.error('[create-workspace PATCH comment]', e)
      return res.status(500).json({ error: e.message })
    }
  }

  // ── POST: toggle a thumbs reaction ─────────────────────────────────────
  // Body: { kind:'reaction', comment_id, reaction: 'up'|'down' }
  if (req.method === 'POST' && req.body?.kind === 'reaction') {
    const user = await requireUser(req, res)
    if (!user) return
    const { comment_id, reaction } = req.body
    if (!comment_id || !['up', 'down'].includes(reaction)) {
      return res.status(400).json({ error: 'comment_id and reaction (up|down) required' })
    }
    try {
      // If user already has same reaction, remove it (toggle off)
      const { data: existing } = await supabase
        .from('task_comment_reactions')
        .select('id, reaction')
        .eq('comment_id', comment_id)
        .eq('user_id', user.id)
        .maybeSingle()

      if (existing && existing.reaction === reaction) {
        await supabase.from('task_comment_reactions').delete().eq('id', existing.id)
        return res.json({ removed: true })
      }
      if (existing) {
        // Different reaction — switch
        const { data, error } = await supabase
          .from('task_comment_reactions')
          .update({ reaction })
          .eq('id', existing.id)
          .select('*')
          .single()
        if (error) throw error
        return res.json({ reaction: data })
      }

      const id = Math.random().toString(36).slice(2, 10)
      const { data, error } = await supabase
        .from('task_comment_reactions')
        .insert({ id, comment_id, user_id: user.id, reaction })
        .select('*')
        .single()
      if (error) throw error
      return res.json({ reaction: data })
    } catch (e) {
      console.error('[create-workspace POST reaction]', e)
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
      // Activity entries log writes. Viewers don't perform writes, so any
      // log attempt from a Viewer is suspicious — block it.
      const gate = await requireEditor(req, res, user.id, project_id, { label: 'log activity' })
      if (!gate.ok) return
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

      const system = `You are an editor that improves task descriptions for a project-management tool. Your only job is to rewrite the user's task description so it is clearer, more concrete, and easier to act on.

STRICT OUTPUT RULES:
- Output ONLY the improved description text.
- Do NOT add headings like "Description:", "Enhanced:", "AI Prompt:", "Notes:", or any preamble.
- Do NOT propose a design prompt, AI prompt, or implementation prompt.
- Do NOT add code blocks, JSON, or markdown headers.
- Keep the same intent as the original.
- Plain prose with short paragraphs; bullet points only if the original already has a list.
- Maximum a few short paragraphs.`

      const userMsg = `Task title: "${title || 'Untitled'}"\n\nCurrent description:\n"""\n${text || '(empty)'}\n"""\n\nRewrite the description per the rules above.`

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
          system,
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

  // ── POST: AI-generate an AI prompt for the task ────────────────────────
  // Body: { kind:'generate-ai-prompt', title, description }
  if (req.method === 'POST' && req.body?.kind === 'generate-ai-prompt') {
    const user = await requireUser(req, res)
    if (!user) return
    const { title, description } = req.body
    try {
      const apiKey = process.env.ANTHROPIC_API_KEY
      if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' })

      const system = `You write design / implementation prompts that another AI (or a designer) can use to execute a task. Given a task title and description, produce a single, self-contained prompt.

STRICT OUTPUT RULES:
- Output ONLY the prompt text — no preamble, no "Here's a prompt:", no surrounding explanation.
- The prompt should be specific, actionable, and reference the task's domain (UI design, copywriting, coding, etc. — infer from the title/description).
- Include constraints / goals if implied by the description.
- Length: 2–6 short paragraphs.
- Plain text. No markdown headings.`

      const userMsg = `Task title: "${title || 'Untitled'}"\n\nTask description:\n"""\n${description || '(empty)'}\n"""\n\nGenerate the prompt now.`

      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-5',
          max_tokens: 1000,
          system,
          messages: [{ role: 'user', content: userMsg }],
        }),
      })
      if (!resp.ok) {
        const err = await resp.text()
        return res.status(500).json({ error: 'AI failed: ' + err.slice(0, 200) })
      }
      const data = await resp.json()
      const prompt = data?.content?.[0]?.text?.trim() || ''
      return res.json({ prompt })
    } catch (e) {
      console.error('[create-workspace POST generate-ai-prompt]', e)
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

      const gate = await requireEditor(req, res, user.id, task.project_id, { label: 'delete tasks' })
      if (!gate.ok) return

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
    const allowed = [
      'title', 'pinned', 'locked', 'section', 'kanban', 'team_members',
      'approval_status', 'comments', 'kanban_columns', 'brief_text',
    ]
    const patch = { updated_at: new Date().toISOString() }
    for (const k of allowed) if (k in updates) patch[k] = updates[k]

    // Owner-only fields: renaming, pinning, locking, section, and
    // team_members JSON are still admin-only. kanban / kanban_columns /
    // brief_text are project-edit fields that any active Editor may
    // change (the Viewer block is enforced client-side; the API mirrors
    // that distinction here).
    const OWNER_ONLY = new Set(['title', 'pinned', 'locked', 'section', 'team_members', 'approval_status'])
    const wantsOwnerOnly = Object.keys(patch).some(k => OWNER_ONLY.has(k))

    try {
      // Verify access server-side, then upsert.
      const { data: existing } = await supabase
        .from('projects')
        .select('id, user_id')
        .eq('id', project_id)
        .maybeSingle()

      const isOwner = existing && existing.user_id === user.id
      let isEditor = false
      if (existing && !isOwner) {
        const { data: tm } = await supabase
          .from('team_members')
          .select('job_role')
          .eq('project_id', project_id)
          .eq('user_id', user.id)
          .eq('status', 'active')
          .maybeSingle()
        const role = String(tm?.job_role || '').toLowerCase()
        // Anything that isn't Viewer counts as Editor for write purposes
        isEditor = !!tm && role !== 'viewer' && role !== 'guest'
      }

      if (existing && !isOwner) {
        if (wantsOwnerOnly) {
          return res.status(403).json({ error: 'Only the project Admin can change this' })
        }
        if (!isEditor) {
          return res.status(403).json({ error: 'Read-only access' })
        }
      }

      // For new rows only, default section to 'team' so the project doesn't
      // get the DB default 'translator' and start showing in BriefTranslator
      // Recents. UPDATEs of existing rows don't touch section unless the
      // caller explicitly sent one in `updates`.
      if (!existing && !('section' in patch)) {
        patch.section = 'team'
      }

      // Preserve the original owner on UPDATEs — an Editor patching
      // brief / kanban must NOT silently overwrite user_id with their own.
      const upsertRow = existing
        ? { id: project_id, user_id: existing.user_id, ...patch }
        : { id: project_id, user_id: user.id, ...patch }

      const { data, error } = await supabase
        .from('projects')
        .upsert(upsertRow, { onConflict: 'id' })
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
      // RBAC: Admin (owner) + Editor (any active team_member that isn't
      // Viewer/Guest) may delete the project. Viewer is blocked.
      if (existing.user_id !== user.id) {
        const gate = await requireEditor(req, res, user.id, project_id, { label: 'delete this project' })
        if (!gate.ok) return
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

    // GET ?kind=tasks&project_id=X — return all tasks for a project. Used by
    // invited members whose anon-key SELECT may be blocked by stale or
    // misconfigured RLS. Service-role read bypasses RLS entirely.
    if (req.query?.kind === 'tasks' && req.query?.project_id) {
      const projectId = String(req.query.project_id)
      const ok = await userHasProjectAccess(user.id, projectId)
      if (!ok) return res.status(403).json({ error: 'Not a project member' })

      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('project_id', projectId)
        .order('position', { ascending: true })

      if (error) return res.status(500).json({ error: error.message })
      return res.json({ tasks: data || [] })
    }

    // GET ?kind=project_settings&project_id=X — kanban_columns + brief etc.
    // Used so invited members can see the admin's column layout.
    if (req.query?.kind === 'project_settings' && req.query?.project_id) {
      const projectId = String(req.query.project_id)
      const ok = await userHasProjectAccess(user.id, projectId)
      if (!ok) return res.status(403).json({ error: 'Not a project member' })

      const { data, error } = await supabase
        .from('projects')
        .select('id, title, brief_text, kanban_columns, kanban')
        .eq('id', projectId)
        .single()
      if (error) return res.status(500).json({ error: error.message })
      return res.json({ project: data })
    }

    try {
      const { data: owned, error: ownedErr } = await supabase
        .from('workspaces')
        .select('*')
        .eq('owner_id', user.id)
        .order('created_at', { ascending: true })

      if (ownedErr) throw ownedErr

      const { data: memberRows, error: memberErr } = await supabase
        .from('workspace_members')
        .select('workspace_id, role, workspaces(*)')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true })

      if (memberErr) throw memberErr

      const ownedList = owned || []
      const ownedIds = new Set(ownedList.map(w => w.id))
      const memberList = (memberRows || [])
        .map(m => m.workspaces && ({ ...m.workspaces, _role: m.role }))
        .filter(w => w && !ownedIds.has(w.id))

      const workspaces = [...ownedList, ...memberList]
      const workspace = workspaces[0] || null

      return res.json({
        workspace,
        workspaces,
        debug: {
          authedUserId: user.id,
          authedEmail: user.email,
          ownedWorkspaceCount: ownedList.length,
          memberWorkspaceCount: memberList.length,
        },
      })
    } catch (e) {
      console.error('[create-workspace GET]', e)
      return res.status(500).json({ error: e.message, stack: e.stack })
    }
  }

  // ── POST: create a workspace ────────────────────────────────────────────
  if (req.method !== 'POST') return res.status(405).end()

  const { userId: bodyUserId, workspaceName, plan } = req.body

  if (!workspaceName) {
    return res.status(400).json({ error: 'workspaceName required' })
  }

  // For the initial sign-up flow the client posts unauthenticated with the
  // freshly-created userId. For "create another workspace" the request is
  // authed — in that case we enforce the plan's workspace limit.
  let userId = bodyUserId
  let enforceLimit = false
  const authHeader = req.headers.authorization || req.headers.Authorization
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const { data: { user } } = await supabase.auth.getUser(authHeader.slice(7))
    if (user) {
      userId = user.id
      enforceLimit = true
    }
  }

  if (!userId) {
    return res.status(400).json({ error: 'userId required' })
  }

  try {
    if (enforceLimit) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('plan')
        .eq('id', userId)
        .single()
      const planKey = String(profile?.plan || 'free').toLowerCase()
      const limits = { free: 1, starter: 3, pro: Infinity }
      const cap = limits[planKey] ?? 1

      const { count } = await supabase
        .from('workspaces')
        .select('id', { count: 'exact', head: true })
        .eq('owner_id', userId)

      if ((count || 0) >= cap) {
        return res.status(403).json({
          error: 'workspace_limit_reached',
          message: planKey === 'free'
            ? 'Free plan is limited to 1 workspace. Upgrade to create more.'
            : `Your ${planKey} plan allows up to ${cap} workspace${cap === 1 ? '' : 's'}.`,
          plan: planKey,
          limit: cap,
        })
      }
    }

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
