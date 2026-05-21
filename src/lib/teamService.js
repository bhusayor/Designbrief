import { supabase } from './supabase'
import { callJSON } from './api'

const uid = () => Math.random().toString(36).slice(2, 10)
const token = () =>
  Math.random().toString(36).slice(2, 18) +
  Math.random().toString(36).slice(2, 18)

// ── Create an invite ──────────────────────────
export async function createInvite({
  projectId, inviterName, inviteeEmail,
  inviteeName, jobRole, projectName,
}) {
  const inviteToken = token()
  const inviteId = uid()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  // Check if already invited
  const { data: existing } = await supabase
    .from('team_invites')
    .select('id, status')
    .eq('project_id', projectId)
    .eq('invitee_email', inviteeEmail.toLowerCase())
    .single()

  if (existing && existing.status === 'pending') {
    throw new Error('This person has already been invited')
  }

  // Create the invite record
  const { data, error } = await supabase
    .from('team_invites')
    .insert({
      id: inviteId,
      project_id: projectId,
      inviter_id: user.id,
      invitee_email: inviteeEmail.toLowerCase().trim(),
      invitee_name: inviteeName.trim(),
      job_role: jobRole,
      token: inviteToken,
      status: 'pending',
    })
    .select()
    .single()

  if (error) throw error

  // Send invite via backend (which has the service role key)
  const API_BASE = import.meta.env.VITE_API_BASE_URL || ''
  let inviteLink = window.location.origin + '/join/' + inviteToken

  try {
    const inviteRes = await fetch(API_BASE + '/api/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: inviteeEmail.toLowerCase().trim(),
        inviteToken,
        projectId,
        projectName,
        jobRole,
        inviterName,
      }),
    })
    const inviteResult = await inviteRes.json()
    if (inviteResult.inviteLink) {
      inviteLink = inviteResult.inviteLink
    }
    if (inviteResult.method) {
      console.log('Invite method:', inviteResult.method)
    }
  } catch (fetchErr) {
    console.warn('Invite backend call failed, using link-only:', fetchErr.message)
  }

  return { invite: data, inviteLink }
}

// ── Get all invites for a project ─────────────
export async function getProjectInvites(projectId) {
  const { data, error } = await supabase
    .from('team_invites')
    .select('*')
    .eq('project_id', projectId)
    .order('invited_at', { ascending: false })

  if (error) throw error
  return data || []
}

// ── Get invite by token ───────────────────────
export async function getInviteByToken(inviteToken) {
  const { data, error } = await supabase
    .from('team_invites')
    .select('*')
    .eq('token', inviteToken)
    .single()

  if (error) return null
  return data
}

// ── Accept an invite ──────────────────────────
// Routes through /api/invite (service role) so RLS on team_members can't
// block the recipient from inserting their own membership row.
// `displayName` is a fallback for link invites where invitee_name is empty.
export async function acceptInvite(inviteToken, userId, displayName = '') {
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token
  if (!token) throw new Error('Not authenticated')

  const res = await fetch('/api/invite', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + token,
    },
    body: JSON.stringify({
      action: 'accept_project_invite',
      token: inviteToken,
      displayName,
    }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(data.error || 'Failed to accept invite')
  }

  // Best-effort: still fetch the invite row so JoinPage gets the same
  // shape it always had (its caller reads { projectId, invite }).
  const invite = await getInviteByToken(inviteToken).catch(() => null)
  return {
    projectId: data.projectId,
    project: data.project || null,
    tasks: Array.isArray(data.tasks) ? data.tasks : [],
    jobRole: data.jobRole || 'Editor',
    invite,
  }
}

// ── Get team members for a project ────────────
export async function getTeamMembers(projectId) {
  const { data, error } = await supabase
    .from('team_members')
    .select('*')
    .eq('project_id', projectId)
    .eq('status', 'active')

  if (error) throw error
  return data || []
}

// ── Remove a team member ──────────────────────
export async function removeTeamMember(projectId, userId) {
  const { error } = await supabase
    .from('team_members')
    .delete()
    .eq('project_id', projectId)
    .eq('user_id', userId)

  if (error) throw error
}

// ── Cancel an invite ──────────────────────────
export async function cancelInvite(inviteId) {
  const { error } = await supabase
    .from('team_invites')
    .update({ status: 'cancelled' })
    .eq('id', inviteId)

  if (error) throw error
}

// ── Auto-assign tasks to new member ───────────
export async function autoAssignToNewMember(kanban, newMember) {
  if (!kanban?.tasks?.length) return kanban

  const unassigned = kanban.tasks
    .filter(t => !t.assignedName || t.assignedName === '')
    .map(t => t.id + ': ' + t.title + ' [' + t.assignedRole + ']')
    .join('\n')

  if (!unassigned) return kanban

  const result = await callJSON(
    'You are a project manager. Respond ONLY with valid JSON.',
    `A new team member just joined: ${newMember.display_name} (${newMember.job_role}).

These tasks are currently unassigned:
${unassigned}

Which tasks should be assigned to this person based on their role?

Return JSON:
{
  "assignedTaskIds": ["task-id-1", "task-id-2"],
  "reasoning": "Brief explanation"
}

Only assign tasks where the assignedRole matches their job role.`,
    800
  )

  if (!result?.assignedTaskIds?.length) return kanban

  const updatedTasks = kanban.tasks.map(t => {
    if (result.assignedTaskIds.includes(t.id)) {
      return { ...t, assignedName: newMember.display_name }
    }
    return t
  })

  return { ...kanban, tasks: updatedTasks }
}
