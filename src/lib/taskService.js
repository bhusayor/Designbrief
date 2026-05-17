import { supabase } from './supabase'

const uid = () => Math.random().toString(36).slice(2, 10)

// ── Save all tasks for a project ──────────────────────────────────────────────
export async function saveTasksToDB(tasks, projectId, userId) {
  if (!tasks?.length || !projectId || !userId) return

  const records = tasks.map((t, i) => ({
    id: t.id || uid(),
    project_id: projectId,
    user_id: userId,
    title: t.title || 'Untitled Task',
    description: t.description || '',
    column_name: t.column || 'To Do',
    assigned_role: t.assignedRole || '',
    assigned_name: t.assignedName || '',
    priority: t.priority || 'MEDIUM',
    estimated_days: t.estimatedDays || 1,
    due_date: t.dueDate || null,
    completed: t.column === 'Done',
    blocked_by: t.blockedBy || [],
    position: i,
    phase: t.phase || null,
    updated_at: new Date().toISOString(),
  }))

  const { error } = await supabase
    .from('tasks')
    .upsert(records, { onConflict: 'id' })

  if (error) console.error('saveTasksToDB error:', error)
}

// Maps a raw Supabase tasks row → JS task object used in TeamCollab state.
// Also used for real-time payload.new rows.
export function mapDBTask(t) {
  return {
    id: t.id,
    title: t.title,
    description: t.description,
    column: t.column_name,
    assignedRole: t.assigned_role,
    assignedName: t.assigned_name,
    priority: t.priority,
    estimatedDays: t.estimated_days,
    dueDate: t.due_date,
    completed: t.completed,
    blockedBy: t.blocked_by || [],
    phase: t.phase,
    position: t.position,
  }
}

// ── Load all tasks for a project ──────────────────────────────────────────────
export async function loadTasksFromDB(projectId) {
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('project_id', projectId)
    .order('position', { ascending: true })

  if (error) {
    console.error('loadTasksFromDB error:', error)
    return []
  }

  return (data || []).map(mapDBTask)
}

// ── Update a single task ───────────────────────────────────────────────────────
export async function updateTaskInDB(task) {
  const { error } = await supabase
    .from('tasks')
    .update({
      title: task.title,
      description: task.description,
      column_name: task.column,
      assigned_role: task.assignedRole,
      assigned_name: task.assignedName,
      priority: task.priority,
      estimated_days: task.estimatedDays,
      due_date: task.dueDate || null,
      completed: task.column === 'Done',
      completed_at: task.column === 'Done' ? new Date().toISOString() : null,
      blocked_by: task.blockedBy || [],
      updated_at: new Date().toISOString(),
    })
    .eq('id', task.id)

  if (error) console.error('updateTaskInDB error:', error)
}

// ── Delete a task ─────────────────────────────────────────────────────────────
export async function deleteTaskFromDB(taskId) {
  const { error } = await supabase
    .from('tasks')
    .delete()
    .eq('id', taskId)

  if (error) console.error('deleteTaskFromDB error:', error)
}

// ── Subtask functions ─────────────────────────────────────────────────────────
export async function getSubtasks(taskId) {
  const { data } = await supabase
    .from('subtasks')
    .select('*')
    .eq('task_id', taskId)
    .order('created_at', { ascending: true })
  return data || []
}

export async function addSubtask(taskId, projectId, title) {
  const { data, error } = await supabase
    .from('subtasks')
    .insert({ id: uid(), task_id: taskId, project_id: projectId, title })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateSubtask(id, updates) {
  const { error } = await supabase
    .from('subtasks')
    .update({
      ...updates,
      completed_at: updates.completed ? new Date().toISOString() : null,
    })
    .eq('id', id)
  if (error) throw error
}

export async function deleteSubtask(id) {
  await supabase.from('subtasks').delete().eq('id', id)
}

// ── Comment functions ─────────────────────────────────────────────────────────
export async function getComments(taskId) {
  const { data } = await supabase
    .from('task_comments')
    .select('*')
    .eq('task_id', taskId)
    .order('created_at', { ascending: true })
  return data || []
}

export async function addComment(taskId, projectId, userId, authorName, content) {
  const { data, error } = await supabase
    .from('task_comments')
    .insert({
      id: uid(),
      task_id: taskId,
      project_id: projectId,
      user_id: userId,
      author_name: authorName,
      content,
    })
    .select()
    .single()
  if (error) throw error

  await logActivity(taskId, projectId, userId, authorName, 'commented', '', content.slice(0, 50))

  return data
}

export async function deleteComment(id) {
  await supabase.from('task_comments').delete().eq('id', id)
}

// ── Activity log functions ────────────────────────────────────────────────────
export async function logActivity(taskId, projectId, userId, actorName, action, oldValue, newValue) {
  await supabase.from('task_activity').insert({
    id: uid(),
    task_id: taskId,
    project_id: projectId,
    user_id: userId,
    actor_name: actorName,
    action,
    old_value: oldValue || null,
    new_value: newValue || null,
  })
}

export async function getActivity(taskId) {
  const { data } = await supabase
    .from('task_activity')
    .select('*')
    .eq('task_id', taskId)
    .order('created_at', { ascending: false })
    .limit(20)
  return data || []
}

// ── Due date helpers ──────────────────────────────────────────────────────────
export function calculateDueDates(tasks, startDate) {
  const start = startDate ? new Date(startDate) : new Date()
  let currentDate = new Date(start)

  function addWorkingDays(date, days) {
    let d = new Date(date)
    let added = 0
    while (added < days) {
      d.setDate(d.getDate() + 1)
      const dow = d.getDay()
      if (dow !== 0 && dow !== 6) added++
    }
    return d
  }

  return tasks.map(task => {
    const dueDate = addWorkingDays(currentDate, task.estimatedDays || 1)
    currentDate = new Date(dueDate)
    return { ...task, dueDate: dueDate.toISOString().split('T')[0] }
  })
}

// ── Progress calculation ──────────────────────────────────────────────────────
export function calculateProgress(tasks) {
  if (!tasks?.length) return 0
  const done = tasks.filter(t => t.column === 'Done').length
  return Math.round((done / tasks.length) * 100)
}

export function calculatePhaseProgress(tasks) {
  const phases = {}
  tasks.forEach(t => {
    const phase = t.phase || 'General'
    if (!phases[phase]) phases[phase] = { total: 0, done: 0 }
    phases[phase].total++
    if (t.column === 'Done') phases[phase].done++
  })
  return Object.entries(phases).map(([name, data]) => ({
    name,
    total: data.total,
    done: data.done,
    pct: Math.round((data.done / data.total) * 100),
  }))
}
