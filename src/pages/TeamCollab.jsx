import React, { useState, useRef, useEffect, useContext } from 'react'
import AppContext from '../context/AppContext'
import { Button, Badge } from '../components/ui'
import { ROLE_META, KANBAN_COLS, COL_COLORS, PRIORITY_COLORS } from '../lib/constants'
import { generateKanban, generateTeamRoles, handleFollowUp, callJSON } from '../lib/api'
import { getProjectInvites } from '../lib/teamService'
import {
  saveTasksToDB, loadTasksFromDB, updateTaskInDB,
  calculateDueDates, calculateProgress, logActivity,
} from '../lib/taskService'
import { InviteModal } from '../components/team'
import {
  ScoreStrip, ChaosBanner, BudgetCard, RoadmapCard,
  RolesCard, TechStackCard, FeaturesCard, UserFlowCard,
  buildPhases, verdictColor,
} from '../components/brief/BriefSections'

const uid = () => Math.random().toString(36).slice(2, 9)

// ─── ChatBubble ───────────────────────────────────────────────────────────────

function ChatBubble({ msg }) {
  const isAI = msg.role === 'ai'
  const lines = msg.text.split('\n')

  return (
    <div style={{
      display: 'flex', gap: 8, marginBottom: 12,
      justifyContent: isAI ? 'flex-start' : 'flex-end',
    }}>
      {isAI && (
        <div style={{
          width: 26, height: 26, background: 'var(--color-accent)',
          borderRadius: 7, display: 'flex', alignItems: 'center',
          justifyContent: 'center', fontSize: 11,
          color: 'var(--color-accent-text)', fontWeight: 800,
          flexShrink: 0, marginTop: 2,
        }}>✦</div>
      )}
      <div style={{
        maxWidth: '85%',
        background: isAI ? 'var(--color-card)' : 'var(--color-accent-bg)',
        border: isAI
          ? '1px solid var(--color-border)'
          : '1px solid var(--color-accent-border)',
        borderRadius: isAI ? '4px 12px 12px 12px' : '12px 4px 12px 12px',
        padding: '10px 13px', fontSize: 12, lineHeight: 1.75,
        color: 'var(--color-text)', fontFamily: "'Urbanist', sans-serif",
      }}>
        {lines.map((line, li) => {
          const parts = line.split(/\*\*(.*?)\*\*/g)
          const isRoleLine = /^[◈◎⟨⟩⚙◉▶✦◆⚡✅⚠]/.test(line.trim())
          return (
            <div key={li} style={{
              marginBottom: li < lines.length - 1 ? (isRoleLine ? 6 : 3) : 0,
              paddingLeft: isRoleLine ? 8 : 0,
              borderLeft: isRoleLine ? '2px solid var(--color-border)' : 'none',
              paddingTop: isRoleLine ? 3 : 0,
              paddingBottom: isRoleLine ? 3 : 0,
            }}>
              {parts.map((p, i) => i % 2 === 1
                ? <strong key={i} style={{ color: 'var(--color-accent)', fontWeight: 700 }}>{p}</strong>
                : p
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ThinkingBubble() {
  return (
    <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
      <div style={{
        width: 26, height: 26, background: 'var(--color-accent)',
        borderRadius: 7, display: 'flex', alignItems: 'center',
        justifyContent: 'center', fontSize: 11,
        color: 'var(--color-accent-text)', fontWeight: 800, flexShrink: 0,
      }}>✦</div>
      <div style={{
        background: 'var(--color-card)',
        border: '1px solid var(--color-border)',
        borderRadius: '4px 12px 12px 12px',
        padding: '12px 14px', display: 'flex', gap: 5, alignItems: 'center',
      }}>
        {[0, 1, 2].map(i => (
          <span key={i} style={{
            width: 5, height: 5, borderRadius: '50%',
            background: 'var(--color-accent)', display: 'block',
            animation: 'pulse 1.4s ease infinite',
            animationDelay: i * 0.2 + 's',
          }} />
        ))}
      </div>
    </div>
  )
}

// ─── TeamCollab ───────────────────────────────────────────────────────────────

export default function TeamCollab() {
  const { activeProject, showToast, navigate, authUser, saveProject } = useContext(AppContext)

  const [phase, setPhase] = useState('brief')
  const [messages, setMessages] = useState([{
    id: uid(), role: 'ai',
    text: 'Welcome to Team Collab. Paste a project brief or describe your project and I will help you build a team and generate a task board.',
  }])
  const [input, setInput] = useState('')
  const [briefText, setBriefText] = useState('')
  const [projectTitle, setProjectTitle] = useState('')
  const [teamMembers, setTeamMembers] = useState([])
  const [suggestedRoles, setSuggestedRoles] = useState([])
  const [kanban, setKanban] = useState(null)
  const [loading, setLoading] = useState(false)
  const [draggedTaskId, setDraggedTaskId] = useState(null)
  const [dragOverCol, setDragOverCol] = useState(null)
  const [editingTask, setEditingTask] = useState(null)
  const [showAddTaskModal, setShowAddTaskModal] = useState(false)
  const [addingTaskCol, setAddingTaskCol] = useState(null)
  const [conversationHistory, setConversationHistory] = useState([])
  const [fileName, setFileName] = useState(null)
  const [activeTab, setActiveTab] = useState('board')
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [invites, setInvites] = useState([])
  const [boardView, setBoardView] = useState('kanban')

  const chatEndRef = useRef(null)
  const fileInputRef = useRef(null)

  // ── Auto-load from activeProject ──────────────────────────────────────────

  useEffect(() => {
    if (activeProject?.data?.brief) {
      const brief = activeProject.data.brief
      const title = activeProject.title || 'Team Project'
      setBriefText(brief)
      setProjectTitle(title)
      addMessage('ai', 'I have loaded the brief for **' + title + '**. Analysing team requirements...')
      handleAnalyseBrief(brief)
    }
  }, [])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  useEffect(() => {
    if (activeProject?.id) {
      getProjectInvites(activeProject.id)
        .then(setInvites)
        .catch(console.error)
    }
  }, [activeProject?.id])

  useEffect(() => {
    if (!activeProject?.id || !authUser) return
    loadTasksFromDB(activeProject.id).then(tasks => {
      if (tasks.length > 0) {
        setKanban(prev => ({
          tasks,
          projectTimeline: prev?.projectTimeline || '',
          unassignedTasks: prev?.unassignedTasks || [],
          missingRoles: prev?.missingRoles || [],
        }))
        setPhase('kanban')
      }
    }).catch(console.error)
  }, [activeProject?.id])

  // ── Helpers ───────────────────────────────────────────────────────────────

  function addMessage(role, text) {
    setMessages(prev => [...prev, { id: uid(), role, text }])
  }

  function toggleRole(role) {
    setTeamMembers(prev => {
      const exists = prev.find(m => m.role === role)
      if (exists) return prev.filter(m => m.role !== role)
      return [...prev, { id: uid(), role, name: '' }]
    })
  }

  async function updateMemberName(id, name) {
    const updated = teamMembers.map(m => m.id === id ? { ...m, name } : m)
    setTeamMembers(updated)

    // If kanban exists and name is substantial, smart-reassign unassigned tasks
    if (kanban && name.trim().length > 1) {
      const updatedKanban = await smartReassignTasks(kanban, updated)
      setKanban(updatedKanban)
    }
  }

  function enrichTasksWithNames(tasks, members) {
    return tasks.map(task => {
      if (task.assignedName) return task
      const member = members.find(m => m.role === task.assignedRole)
      if (member?.name?.trim()) {
        return { ...task, assignedName: member.name.trim() }
      }
      return task
    })
  }

  async function smartReassignTasks(currentKanban, allTeamMembers) {
    if (!currentKanban?.tasks?.length) return currentKanban

    const unnamedTasks = currentKanban.tasks.filter(
      t => !t.assignedName || t.assignedName === ''
    )
    if (!unnamedTasks.length) return currentKanban

    const namedMembers = allTeamMembers.filter(m => m.name?.trim())
    if (!namedMembers.length) return currentKanban

    try {
      const taskRoleMap = unnamedTasks.map(t => ({
        id: t.id, title: t.title, assignedRole: t.assignedRole,
      }))

      const result = await callJSON(
        'You are a project manager. Respond ONLY with valid JSON.',
        `Assign these unassigned tasks to team members.

Tasks needing assignment:
${JSON.stringify(taskRoleMap, null, 2)}

Available team members:
${namedMembers.map(m => m.name + ' — ' + m.role).join('\n')}

Rules:
- Match tasks to people based on role alignment
- Each person should get a reasonable workload
- Only assign if the role matches

Return JSON:
{
  "assignments": [
    { "taskId": "task-id", "assignedName": "Person Name", "assignedRole": "Their Role" }
  ]
}`,
        1000
      )

      if (!result?.assignments?.length) return currentKanban

      const updatedTasks = currentKanban.tasks.map(task => {
        const assignment = result.assignments.find(a => a.taskId === task.id)
        if (assignment) {
          return { ...task, assignedName: assignment.assignedName, assignedRole: assignment.assignedRole }
        }
        return task
      })

      return { ...currentKanban, tasks: updatedTasks }
    } catch (e) {
      console.error('[TeamCollab] smartReassignTasks error:', e)
      return currentKanban
    }
  }

  function getDueDateStatus(dueDate, column) {
    if (!dueDate || column === 'Done') return null
    const today = new Date().toISOString().split('T')[0]
    if (dueDate < today) return 'overdue'
    if (dueDate === today) return 'today'
    return 'upcoming'
  }

  function formatDueDate(dateStr) {
    if (!dateStr) return ''
    const d = new Date(dateStr + 'T00:00:00')
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  }

  function moveTask(taskId, newCol) {
    const prevTask = kanban?.tasks?.find(t => t.id === taskId)
    setKanban(prev => ({
      ...prev,
      tasks: prev.tasks.map(t => t.id === taskId ? { ...t, column: newCol } : t),
    }))
    setEditingTask(prev => prev?.id === taskId ? { ...prev, column: newCol } : prev)
    if (prevTask && authUser && activeProject?.id) {
      updateTaskInDB({ ...prevTask, column: newCol }).catch(console.error)
      logActivity(
        taskId, activeProject.id, authUser.id,
        user.firstName || 'User', 'moved', prevTask.column, newCol
      ).catch(console.error)
    }
  }

  function updateTask(updated) {
    setKanban(prev => ({
      ...prev,
      tasks: prev.tasks.map(t => t.id === updated.id ? updated : t),
    }))
    setEditingTask(updated)
  }

  function addTaskToBoard(task) {
    const t = { ...task, id: uid(), column: task.column || 'To Do' }
    setKanban(prev => ({ ...prev, tasks: [...(prev.tasks || []), t] }))
  }

  function applyBoardUpdate(update) {
    if (!update) return
    setKanban(prev => {
      if (!prev) return prev
      const tasks = [...prev.tasks]
      if (update.action === 'add_task' && update.task) {
        return { ...prev, tasks: [...tasks, { ...update.task, id: update.task.id || uid() }] }
      }
      if (update.action === 'add_tasks' && Array.isArray(update.tasks)) {
        return { ...prev, tasks: [...tasks, ...update.tasks.map(t => ({ ...t, id: t.id || uid() }))] }
      }
      if (update.action === 'move') {
        return { ...prev, tasks: tasks.map(t => t.id === update.taskId ? { ...t, column: update.column } : t) }
      }
      if (update.action === 'priority') {
        return { ...prev, tasks: tasks.map(t => t.id === update.taskId ? { ...t, priority: update.priority } : t) }
      }
      if (update.action === 'reassign') {
        return { ...prev, tasks: tasks.map(t => t.id === update.taskId ? { ...t, assignedRole: update.assignedRole, assignedName: update.assignedName || '' } : t) }
      }
      return prev
    })
  }

  async function handleNewMemberJoined(newMember) {
    const updatedMembers = [...teamMembers, {
      id: newMember.user_id || uid(),
      role: newMember.job_role,
      name: newMember.display_name || '',
    }]
    setTeamMembers(updatedMembers)

    if (!kanban?.tasks?.length) return

    setLoading(true)
    addMessage('ai',
      '**' + (newMember.display_name || 'A new member') +
      '** just joined as ' + newMember.job_role +
      '. Assigning relevant tasks...'
    )

    try {
      const result = await callJSON(
        'You are a project manager. Respond ONLY with valid JSON.',
        `A new team member just joined the project.

New member: ${newMember.display_name}
Role: ${newMember.job_role}

Current unassigned tasks:
${kanban.tasks
  .filter(t => !t.assignedName)
  .map(t => t.id + ': ' + t.title + ' [needs: ' + t.assignedRole + ']')
  .join('\n')}

Which tasks match this person's role and should be assigned to them?

Return JSON:
{ "taskIds": ["id1", "id2"] }

Only include tasks where assignedRole matches or closely relates to: ${newMember.job_role}`,
        600
      )

      if (result?.taskIds?.length) {
        setKanban(prev => ({
          ...prev,
          tasks: prev.tasks.map(t =>
            result.taskIds.includes(t.id) ? { ...t, assignedName: newMember.display_name } : t
          ),
        }))
        addMessage('ai',
          '✅ Assigned **' + result.taskIds.length +
          ' tasks** to ' + newMember.display_name +
          ' based on their ' + newMember.job_role + ' role.'
        )
      } else {
        addMessage('ai',
          'No unassigned tasks match ' + newMember.display_name + "'s role right now. " +
          'You can manually assign tasks by clicking any card.'
        )
      }
    } catch (err) {
      console.error('[TeamCollab] handleNewMemberJoined error:', err)
    }

    setLoading(false)
  }

  // ── Async handlers ────────────────────────────────────────────────────────

  async function handleSend() {
    const txt = input.trim()
    if (!txt || loading) return
    setInput('')
    setFileName(null)
    addMessage('user', txt)
    if (phase === 'brief') {
      await handleAnalyseBrief(txt)
    } else if (phase === 'kanban') {
      await handleFollowUpMessage(txt)
    }
  }

  async function handleAnalyseBrief(txt) {
    setBriefText(txt)
    setLoading(true)
    const analysis = await generateTeamRoles(txt)
    setLoading(false)
    if (!analysis) {
      addMessage('ai', 'Could not analyse the brief. Please try again.')
      return
    }
    setProjectTitle(analysis.projectTitle || 'Team Project')
    setSuggestedRoles(analysis.suggestedRoles || [])
    const rolesItemized = (analysis.suggestedRoles || []).map(r => {
      const meta = ROLE_META[r]
      return (meta?.icon || '◈') + ' **' + r + '**'
    }).join('\n')
    const reasoning = typeof analysis.roleReasoning === 'object'
      ? Object.entries(analysis.roleReasoning).map(([r, why]) => `${r}: ${why}`).join('\n')
      : (analysis.roleReasoning || '')
    const reply = analysis.isChaos
      ? '⚡ Chaotic brief — ' + analysis.chaosNote + '\n\nRecommended roles:\n\n' + rolesItemized + '\n\n' + reasoning + '\n\nSelect your team below.'
      : 'For **' + analysis.projectTitle + '**, recommended roles:\n\n' + rolesItemized + '\n\n' + reasoning + '\n\nSelect roles and add names below.'
    addMessage('ai', reply)
    setConversationHistory([
      { role: 'user', content: txt },
      { role: 'assistant', content: reply },
    ])
    setPhase('roles')
  }

  async function handleGenerateKanban() {
    if (!teamMembers.length) return
    setLoading(true)
    addMessage('ai', 'Building your kanban board and assigning tasks...')
    const contextualBrief = projectTitle ? '# ' + projectTitle + '\n\n' + briefText : briefText
    const data = await generateKanban(contextualBrief, projectTitle, teamMembers)
    setLoading(false)
    if (!data || !data.tasks?.length) {
      addMessage('ai', '⚠ Could not generate the board. Please try again.')
      setPhase('roles')
      return
    }
    const enrichedTasks = enrichTasksWithNames(data.tasks, teamMembers)
    const tasksWithDates = calculateDueDates(enrichedTasks, new Date())
    const enrichedData = { ...data, tasks: tasksWithDates }
    setKanban(enrichedData)
    setPhase('kanban')

    // Save team + kanban to project
    if (activeProject) {
      saveProject({ ...activeProject, teamMembers, kanban: enrichedData })
    }

    // Persist tasks to Supabase
    if (authUser && activeProject?.id) {
      saveTasksToDB(tasksWithDates, activeProject.id, authUser.id).catch(console.error)
    }

    const missing = data.missingRoles?.length || 0
    const msg = '✅ Kanban board ready — **' + enrichedTasks.length + ' tasks** assigned. Timeline: **' + data.projectTimeline + '**.' +
      (missing ? '\n\n⚠ Missing roles: **' + data.missingRoles.join(', ') + '**' : '') +
      '\n\nDrag cards between columns, click any card to edit, or keep chatting to update the board.'
    addMessage('ai', msg)
    setConversationHistory(prev => [...prev, { role: 'assistant', content: msg }])
  }

  async function handleFollowUpMessage(txt) {
    setLoading(true)
    const contextualBrief = projectTitle ? '# ' + projectTitle + '\n\n' + briefText : briefText
    const result = await handleFollowUp(txt, kanban, teamMembers, projectTitle, conversationHistory, contextualBrief)
    setLoading(false)
    if (result.boardUpdate) applyBoardUpdate(result.boardUpdate)
    addMessage('ai', result.displayReply)
    setConversationHistory(prev => [...prev,
      { role: 'user', content: txt },
      { role: 'assistant', content: result.displayReply },
    ])
  }

  function handleFileUpload(file) {
    if (!file) return
    setFileName(file.name)
    const reader = new FileReader()
    reader.onload = e => {
      setInput(prev => prev + (prev ? '\n' : '') + e.target.result)
    }
    reader.readAsText(file)
  }

  // ── InlineAddTask (inline so it can close over teamMembers) ───────────────

  function InlineAddTask({ col, onAdd, onCancel }) {
    const [title, setTitle] = useState('')
    const [role, setRole] = useState(teamMembers[0]?.role || '')
    const accentCol = COL_COLORS[col] || 'var(--color-accent)'

    return (
      <div style={{
        background: 'var(--color-card)',
        border: '1.5px solid ' + accentCol + '66',
        borderRadius: 10, padding: '12px 14px',
        animation: 'fadeUp 0.2s ease',
      }}>
        <div style={{
          fontFamily: "'DM Mono', monospace", fontSize: 10,
          color: accentCol, marginBottom: 8, letterSpacing: '0.06em',
        }}>NEW TASK — {col.toUpperCase()}</div>
        <input
          autoFocus
          value={title}
          onChange={e => setTitle(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && title.trim()) {
              onAdd({ title, description: '', assignedRole: role, assignedName: '', priority: 'MEDIUM', estimatedDays: 1 })
            }
            if (e.key === 'Escape') onCancel()
          }}
          placeholder="Task title..."
          style={{
            width: '100%', background: 'var(--color-surface)',
            border: '1px solid var(--color-border)', borderRadius: 7,
            padding: '7px 10px', color: 'var(--color-text)',
            fontFamily: "'Urbanist', sans-serif", fontSize: 12, marginBottom: 8,
            outline: 'none', boxSizing: 'border-box',
          }}
        />
        {teamMembers.length > 0 && (
          <select
            value={role}
            onChange={e => setRole(e.target.value)}
            style={{
              width: '100%', background: 'var(--color-surface)',
              border: '1px solid var(--color-border)', borderRadius: 7,
              padding: '6px 10px', color: 'var(--color-text)',
              fontFamily: "'Urbanist', sans-serif", fontSize: 11, marginBottom: 10,
              outline: 'none', boxSizing: 'border-box',
            }}
          >
            <option value="">Unassigned</option>
            {teamMembers.map(m => (
              <option key={m.id} value={m.role}>{m.name || m.role}</option>
            ))}
          </select>
        )}
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            onClick={() => {
              if (title.trim()) onAdd({ title, description: '', assignedRole: role, assignedName: '', priority: 'MEDIUM', estimatedDays: 1 })
            }}
            disabled={!title.trim()}
            style={{
              flex: 1, background: accentCol, border: 'none',
              borderRadius: 7, padding: '7px 0',
              color: 'var(--color-accent-text)', fontFamily: "'Urbanist', sans-serif",
              fontWeight: 700, fontSize: 11, cursor: title.trim() ? 'pointer' : 'default',
              opacity: !title.trim() ? 0.5 : 1,
            }}
          >Add</button>
          <button
            onClick={onCancel}
            style={{
              flex: 1, background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 7, padding: '7px 0',
              color: 'var(--color-text-soft)', fontFamily: "'Urbanist', sans-serif",
              fontSize: 11, cursor: 'pointer',
            }}
          >Cancel</button>
        </div>
      </div>
    )
  }

  // ── TaskCard (inline so it can close over drag state setters) ─────────────

  function TaskCard({ task }) {
    const meta = ROLE_META[task.assignedRole]
    const roleColor = meta?.color || 'var(--color-text-muted)'
    const isDragging = draggedTaskId === task.id
    const priorityColor = PRIORITY_COLORS[task.priority] || 'var(--color-text-muted)'

    return (
      <div
        draggable
        onDragStart={e => {
          e.dataTransfer.setData('taskId', task.id)
          e.dataTransfer.effectAllowed = 'move'
          setDraggedTaskId(task.id)
          setTimeout(() => { e.target.style.opacity = '0.35' }, 0)
        }}
        onDragEnd={e => {
          e.target.style.opacity = '1'
          setDraggedTaskId(null)
          setDragOverCol(null)
        }}
        onClick={() => { if (!isDragging) setEditingTask(task) }}
        style={{
          background: 'var(--color-card)',
          border: '1px solid var(--color-border)',
          borderLeft: '3px solid ' + priorityColor,
          borderRadius: 12, padding: 14,
          transition: 'all 0.15s', cursor: 'grab',
          opacity: isDragging ? 0.35 : 1,
          userSelect: 'none',
        }}
        onMouseEnter={e => {
          if (!isDragging) {
            e.currentTarget.style.borderColor = roleColor
            e.currentTarget.style.borderLeftColor = priorityColor
            e.currentTarget.style.background = 'var(--color-card-hover)'
            e.currentTarget.style.transform = 'translateY(-1px)'
          }
        }}
        onMouseLeave={e => {
          if (!isDragging) {
            e.currentTarget.style.borderColor = 'var(--color-border)'
            e.currentTarget.style.borderLeftColor = priorityColor
            e.currentTarget.style.background = 'var(--color-card)'
            e.currentTarget.style.transform = 'translateY(0)'
          }
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6, marginBottom: 6 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, flex: 1, minWidth: 0 }}>
            {task.blockedBy?.length > 0 && task.column !== 'Done' && (
              <span style={{
                background: 'var(--color-red)' + '18',
                border: '1px solid ' + 'var(--color-red)' + '44',
                borderRadius: 4, padding: '1px 4px',
                color: 'var(--color-red)', fontFamily: "'DM Mono', monospace",
                fontSize: 9, flexShrink: 0, marginTop: 1,
              }}>🔒</span>
            )}
            <span style={{ color: 'var(--color-text-muted)', fontSize: 10, marginTop: 2, flexShrink: 0, cursor: 'grab', letterSpacing: -1 }}>⠿</span>
            <span style={{ fontFamily: "'Urbanist', sans-serif", fontWeight: 700, fontSize: 12, lineHeight: 1.4, color: 'var(--color-text)' }}>{task.title}</span>
          </div>
          <div style={{
            width: 6, height: 6, borderRadius: '50%',
            background: priorityColor, flexShrink: 0, marginTop: 5,
          }} />
        </div>
        {task.description && (
          <div style={{
            fontSize: 11, color: 'var(--color-text-soft)',
            fontFamily: "'DM Mono', monospace",
            lineHeight: 1.6, marginBottom: 10,
            display: '-webkit-box', WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical', overflow: 'hidden',
          }}>{task.description}</div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{
            background: roleColor + '18',
            border: '1px solid ' + roleColor + '33',
            borderRadius: 5, padding: '3px 8px',
            fontSize: 10, color: roleColor, fontFamily: "'DM Mono', monospace",
            display: 'flex', alignItems: 'center', gap: 4,
          }}>
            {meta?.icon} {task.assignedName || task.assignedRole}
          </div>
          <span style={{ fontSize: 10, color: 'var(--color-text-muted)', fontFamily: "'DM Mono', monospace" }}>
            {task.estimatedDays}d
          </span>
        </div>
        {task.dueDate && (() => {
          const status = getDueDateStatus(task.dueDate, task.column)
          const dueColor = status === 'overdue'
            ? 'var(--color-red)'
            : status === 'today'
              ? 'var(--color-amber)'
              : 'var(--color-text-muted)'
          const dueLabel = status === 'overdue'
            ? 'Overdue'
            : status === 'today'
              ? 'Due today'
              : formatDueDate(task.dueDate)
          return (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 4,
              marginTop: 8, fontSize: 10, fontFamily: "'DM Mono', monospace",
              color: dueColor,
            }}>
              <span style={{ fontSize: 10 }}>📅</span>
              <span>{dueLabel}</span>
            </div>
          )
        })()}
      </div>
    )
  }

  // ── TaskModal ─────────────────────────────────────────────────────────────

  function TaskModal({ task, onUpdate, onClose }) {
    const [editing, setEditing] = useState({ ...task })

    return (
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
        zIndex: 200, display: 'flex', alignItems: 'center',
        justifyContent: 'center', backdropFilter: 'blur(4px)',
      }}>
        <div onClick={e => e.stopPropagation()} style={{
          background: 'var(--color-card)',
          border: '1px solid var(--color-border)',
          borderRadius: 18, width: 500, maxWidth: '92vw',
          maxHeight: '88vh', overflow: 'auto',
          boxShadow: 'var(--shadow-modal)',
          animation: 'fadeUp 0.25s ease',
        }}>
          {/* Header */}
          <div style={{
            padding: '18px 22px 14px',
            borderBottom: '1px solid var(--color-border)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
          }}>
            <div style={{ flex: 1, paddingRight: 12 }}>
              <div style={{ fontSize: 10, color: 'var(--color-text-muted)', fontFamily: "'DM Mono', monospace", marginBottom: 6, letterSpacing: '0.08em' }}>TASK DETAIL</div>
              <input
                value={editing.title}
                onChange={e => setEditing(p => ({ ...p, title: e.target.value }))}
                style={{
                  width: '100%', background: 'transparent', border: 'none',
                  fontSize: 17, fontWeight: 800, color: 'var(--color-text)',
                  fontFamily: "'Urbanist', sans-serif", letterSpacing: '-0.02em', outline: 'none',
                }}
              />
            </div>
            <button onClick={onClose} style={{
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 8, width: 30, height: 30, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--color-text-soft)', fontSize: 15, flexShrink: 0,
            }}>×</button>
          </div>

          <div style={{ padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Description */}
            <div>
              <div style={{ fontSize: 10, color: 'var(--color-text-muted)', fontFamily: "'DM Mono', monospace", marginBottom: 6 }}>DESCRIPTION</div>
              <textarea
                value={editing.description || ''}
                onChange={e => setEditing(p => ({ ...p, description: e.target.value }))}
                style={{
                  width: '100%', background: 'var(--color-surface)',
                  border: '1px solid var(--color-border)', borderRadius: 9,
                  padding: '9px 12px', color: 'var(--color-text)',
                  fontFamily: "'DM Mono', monospace", fontSize: 12, lineHeight: 1.7,
                  resize: 'vertical', minHeight: 70, outline: 'none', boxSizing: 'border-box',
                }}
              />
            </div>

            {/* Priority + Days */}
            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10, color: 'var(--color-text-muted)', fontFamily: "'DM Mono', monospace", marginBottom: 6 }}>PRIORITY</div>
                <div style={{ display: 'flex', gap: 5 }}>
                  {['HIGH', 'MEDIUM', 'LOW'].map(p => (
                    <button key={p}
                      onClick={() => setEditing(prev => ({ ...prev, priority: p }))}
                      style={{
                        flex: 1,
                        background: editing.priority === p ? PRIORITY_COLORS[p] + '22' : 'var(--color-surface)',
                        border: '1px solid ' + (editing.priority === p ? PRIORITY_COLORS[p] : 'var(--color-border)'),
                        borderRadius: 7, padding: '6px 0', fontSize: 10,
                        fontFamily: "'DM Mono', monospace",
                        color: editing.priority === p ? PRIORITY_COLORS[p] : 'var(--color-text-soft)',
                        cursor: 'pointer',
                      }}
                    >{p}</button>
                  ))}
                </div>
              </div>
              <div style={{ width: 90 }}>
                <div style={{ fontSize: 10, color: 'var(--color-text-muted)', fontFamily: "'DM Mono', monospace", marginBottom: 6 }}>DAYS</div>
                <input
                  type="number" min={1} max={90}
                  value={editing.estimatedDays || 1}
                  onChange={e => setEditing(p => ({ ...p, estimatedDays: Number(e.target.value) }))}
                  style={{
                    width: '100%', background: 'var(--color-surface)',
                    border: '1px solid var(--color-border)', borderRadius: 7,
                    padding: '6px 9px', color: 'var(--color-text)',
                    fontFamily: "'DM Mono', monospace", fontSize: 13, textAlign: 'center', outline: 'none',
                  }}
                />
              </div>
            </div>

            {/* Assign to */}
            {teamMembers.length > 0 && (
              <div>
                <div style={{ fontSize: 10, color: 'var(--color-text-muted)', fontFamily: "'DM Mono', monospace", marginBottom: 6 }}>ASSIGNED TO</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {teamMembers.map(m => {
                    const mm = ROLE_META[m.role] || { color: 'var(--color-text-soft)', icon: '◈' }
                    const active = editing.assignedRole === m.role
                    return (
                      <button key={m.id}
                        onClick={() => setEditing(p => ({ ...p, assignedRole: m.role, assignedName: m.name || '' }))}
                        style={{
                          background: active ? mm.color + '22' : 'var(--color-surface)',
                          border: '1px solid ' + (active ? mm.color : 'var(--color-border)'),
                          borderRadius: 8, padding: '5px 11px', cursor: 'pointer',
                          display: 'flex', alignItems: 'center', gap: 5,
                        }}
                      >
                        <span style={{ fontSize: 11 }}>{mm.icon}</span>
                        <span style={{ fontSize: 11, color: active ? mm.color : 'var(--color-text-soft)', fontWeight: 600, fontFamily: "'Urbanist', sans-serif" }}>
                          {m.name || m.role}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Move to column */}
            <div>
              <div style={{ fontSize: 10, color: 'var(--color-text-muted)', fontFamily: "'DM Mono', monospace", marginBottom: 6 }}>MOVE TO COLUMN</div>
              <div style={{ display: 'flex', gap: 5 }}>
                {KANBAN_COLS.map(col => {
                  const active = editing.column === col
                  const cc = COL_COLORS[col] || 'var(--color-text-muted)'
                  return (
                    <button key={col}
                      onClick={() => setEditing(p => ({ ...p, column: col }))}
                      style={{
                        flex: 1,
                        background: active ? cc + '22' : 'var(--color-surface)',
                        border: '1px solid ' + (active ? cc : 'var(--color-border)'),
                        borderRadius: 7, padding: '7px 0', fontSize: 10,
                        fontFamily: "'Urbanist', sans-serif", fontWeight: 600,
                        color: active ? cc : 'var(--color-text-soft)',
                        cursor: 'pointer',
                      }}
                    >{col}</button>
                  )
                })}
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: 8, paddingTop: 4 }}>
              <button onClick={onClose} style={{
                flex: 1, background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                borderRadius: 9, padding: '10px 0',
                color: 'var(--color-text)', fontFamily: "'Urbanist', sans-serif",
                fontWeight: 700, fontSize: 12, cursor: 'pointer',
              }}>Cancel</button>
              <button onClick={() => { onUpdate(editing); onClose() }} style={{
                flex: 2, background: 'var(--color-accent)',
                border: 'none', borderRadius: 9, padding: '10px 0',
                color: 'var(--color-accent-text)', fontFamily: "'Urbanist', sans-serif",
                fontWeight: 700, fontSize: 12, cursor: 'pointer',
              }}>Save Changes</button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── AddTaskModal ──────────────────────────────────────────────────────────

  function AddTaskModal({ onAdd, onClose }) {
    const [t, setT] = useState({
      title: '', description: '', assignedRole: '',
      assignedName: '', priority: 'MEDIUM',
      estimatedDays: 1, column: 'To Do',
    })

    return (
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
        zIndex: 200, display: 'flex', alignItems: 'center',
        justifyContent: 'center', backdropFilter: 'blur(4px)',
      }}>
        <div onClick={e => e.stopPropagation()} style={{
          background: 'var(--color-card)',
          border: '1px solid var(--color-border)',
          borderRadius: 18, width: 480, maxWidth: '92vw',
          maxHeight: '88vh', overflow: 'auto',
          boxShadow: 'var(--shadow-modal)',
          animation: 'fadeUp 0.25s ease',
        }}>
          <div style={{
            padding: '18px 22px 14px',
            borderBottom: '1px solid var(--color-border)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <div>
              <div style={{ fontSize: 10, color: 'var(--color-text-muted)', fontFamily: "'DM Mono', monospace", marginBottom: 4 }}>NEW TASK</div>
              <div style={{ fontWeight: 800, fontSize: 17, fontFamily: "'Urbanist', sans-serif", color: 'var(--color-text)' }}>Add to Board</div>
            </div>
            <button onClick={onClose} style={{
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 8, width: 30, height: 30, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--color-text-soft)', fontSize: 15,
            }}>×</button>
          </div>
          <div style={{ padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <div style={{ fontSize: 10, color: 'var(--color-text-muted)', fontFamily: "'DM Mono', monospace", marginBottom: 6 }}>TITLE</div>
              <input
                autoFocus
                value={t.title}
                onChange={e => setT(p => ({ ...p, title: e.target.value }))}
                placeholder="What needs to be done?"
                style={{
                  width: '100%', background: 'var(--color-surface)',
                  border: '1px solid var(--color-border)', borderRadius: 9,
                  padding: '9px 12px', color: 'var(--color-text)',
                  fontFamily: "'Urbanist', sans-serif", fontSize: 13, outline: 'none', boxSizing: 'border-box',
                }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <div style={{ fontSize: 10, color: 'var(--color-text-muted)', fontFamily: "'DM Mono', monospace", marginBottom: 6 }}>COLUMN</div>
                {KANBAN_COLS.map(col => {
                  const cc = COL_COLORS[col] || 'var(--color-text-muted)'
                  const active = t.column === col
                  return (
                    <button key={col}
                      onClick={() => setT(p => ({ ...p, column: col }))}
                      style={{
                        display: 'block', width: '100%', marginBottom: 4,
                        background: active ? cc + '22' : 'var(--color-surface)',
                        border: '1px solid ' + (active ? cc : 'var(--color-border)'),
                        borderRadius: 7, padding: '7px 10px',
                        color: active ? cc : 'var(--color-text-soft)',
                        fontFamily: "'Urbanist', sans-serif", fontWeight: 600, fontSize: 11,
                        cursor: 'pointer', textAlign: 'left',
                      }}
                    >{col}</button>
                  )
                })}
              </div>
              <div>
                <div style={{ fontSize: 10, color: 'var(--color-text-muted)', fontFamily: "'DM Mono', monospace", marginBottom: 6 }}>PRIORITY</div>
                {['HIGH', 'MEDIUM', 'LOW'].map(p => (
                  <button key={p}
                    onClick={() => setT(prev => ({ ...prev, priority: p }))}
                    style={{
                      display: 'block', width: '100%', marginBottom: 4,
                      background: t.priority === p ? PRIORITY_COLORS[p] + '22' : 'var(--color-surface)',
                      border: '1px solid ' + (t.priority === p ? PRIORITY_COLORS[p] : 'var(--color-border)'),
                      borderRadius: 7, padding: '7px 10px',
                      color: t.priority === p ? PRIORITY_COLORS[p] : 'var(--color-text-soft)',
                      fontFamily: "'Urbanist', sans-serif", fontWeight: 600, fontSize: 11,
                      cursor: 'pointer', textAlign: 'left',
                    }}
                  >{p}</button>
                ))}
              </div>
            </div>

            {teamMembers.length > 0 && (
              <div>
                <div style={{ fontSize: 10, color: 'var(--color-text-muted)', fontFamily: "'DM Mono', monospace", marginBottom: 6 }}>ASSIGN TO</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {teamMembers.map(m => {
                    const mm = ROLE_META[m.role] || { color: 'var(--color-text-soft)', icon: '◈' }
                    const active = t.assignedRole === m.role
                    return (
                      <button key={m.id}
                        onClick={() => setT(p => ({ ...p, assignedRole: m.role, assignedName: m.name || '' }))}
                        style={{
                          background: active ? mm.color + '22' : 'var(--color-surface)',
                          border: '1px solid ' + (active ? mm.color : 'var(--color-border)'),
                          borderRadius: 7, padding: '5px 11px', cursor: 'pointer',
                          display: 'flex', alignItems: 'center', gap: 5,
                        }}
                      >
                        <span style={{ fontSize: 11 }}>{mm.icon}</span>
                        <span style={{ fontSize: 11, color: active ? mm.color : 'var(--color-text-soft)', fontWeight: 600, fontFamily: "'Urbanist', sans-serif" }}>
                          {m.name || m.role}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, paddingTop: 4 }}>
              <button onClick={onClose} style={{
                flex: 1, background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                borderRadius: 9, padding: '10px 0',
                color: 'var(--color-text)', fontFamily: "'Urbanist', sans-serif",
                fontWeight: 700, fontSize: 12, cursor: 'pointer',
              }}>Cancel</button>
              <button
                onClick={() => { if (t.title.trim()) onAdd(t) }}
                disabled={!t.title.trim()}
                style={{
                  flex: 2, background: 'var(--color-accent)', border: 'none',
                  borderRadius: 9, padding: '10px 0',
                  color: 'var(--color-accent-text)', fontFamily: "'Urbanist', sans-serif",
                  fontWeight: 700, fontSize: 12,
                  cursor: t.title.trim() ? 'pointer' : 'default',
                  opacity: !t.title.trim() ? 0.4 : 1,
                }}
              >Add Task to Board</button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{
      display: 'flex', height: '100%', overflow: 'hidden',
      position: 'relative', background: 'var(--color-bg)',
    }}>

      {/* Modals */}
      {editingTask && (
        <TaskModal
          task={editingTask}
          onUpdate={updateTask}
          onClose={() => setEditingTask(null)}
        />
      )}
      {showAddTaskModal && (
        <AddTaskModal
          onAdd={t => { addTaskToBoard(t); setShowAddTaskModal(false) }}
          onClose={() => setShowAddTaskModal(false)}
        />
      )}
      <InviteModal
        open={showInviteModal}
        onClose={() => setShowInviteModal(false)}
        projectId={activeProject?.id}
        projectName={projectTitle}
        onInviteSent={result => {
          if (result) setInvites(prev => [result.invite, ...prev])
        }}
        existingInvites={invites}
      />

      {/* ── Left chat panel ── */}
      <div style={{
        width: 300, flexShrink: 0, display: 'flex', flexDirection: 'column',
        borderRight: '1px solid var(--color-border)', background: 'var(--color-bg)',
      }}>

        {/* Messages */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 14px 0' }}>
          {messages.map(m => <ChatBubble key={m.id} msg={m} />)}
          {loading && <ThinkingBubble />}
          <div ref={chatEndRef} />
        </div>

        {/* Role selector */}
        {phase === 'roles' && (
          <div style={{
            padding: '12px 14px',
            borderTop: '1px solid var(--color-border)',
            background: 'var(--color-surface)',
          }}>
            <div style={{
              fontFamily: "'DM Mono', monospace", fontSize: 10,
              color: 'var(--color-text-muted)', marginBottom: 8,
              letterSpacing: '0.06em',
            }}>SELECT ROLES &amp; ADD NAMES</div>

            {/* Role buttons — AI Suggested first, then others */}
            {suggestedRoles.length > 0 && (
              <>
                <div style={{
                  fontFamily: "'DM Mono', monospace", fontSize: 9,
                  color: 'var(--color-accent)', letterSpacing: '0.08em',
                  marginBottom: 6,
                }}>AI SUGGESTED</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                  {suggestedRoles.map(role => {
                    const meta = ROLE_META[role]
                    if (!meta) return null
                    const isSelected = !!teamMembers.find(m => m.role === role)
                    return (
                      <button
                        key={role}
                        onClick={() => toggleRole(role)}
                        style={{
                          background: isSelected ? meta.color + '22' : 'var(--color-surface)',
                          border: '1px solid ' + (isSelected ? meta.color : meta.color + '55'),
                          boxShadow: isSelected ? 'none' : '0 0 0 1px ' + meta.color + '38',
                          borderRadius: 7, padding: '5px 10px', fontSize: 11,
                          fontFamily: "'Urbanist', sans-serif", fontWeight: 600, cursor: 'pointer',
                          color: isSelected ? meta.color : meta.color + 'BB',
                          display: 'flex', gap: 5, alignItems: 'center',
                        }}
                      >
                        {meta.icon} {role}
                        {isSelected
                          ? <span style={{ fontSize: 10, color: meta.color }}>✓</span>
                          : <span style={{ fontSize: 9, opacity: 0.7, color: meta.color }}>✦</span>
                        }
                      </button>
                    )
                  })}
                </div>
                <div style={{
                  fontFamily: "'DM Mono', monospace", fontSize: 9,
                  color: 'var(--color-text-muted)', letterSpacing: '0.08em',
                  marginBottom: 6,
                }}>OTHER ROLES</div>
              </>
            )}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {Object.keys(ROLE_META)
                .filter(role => !suggestedRoles.includes(role))
                .map(role => {
                  const meta = ROLE_META[role]
                  const isSelected = !!teamMembers.find(m => m.role === role)
                  return (
                    <button
                      key={role}
                      onClick={() => toggleRole(role)}
                      style={{
                        background: isSelected ? meta.color + '22' : 'transparent',
                        border: '1px solid ' + (isSelected ? meta.color : 'var(--color-border)'),
                        borderRadius: 7, padding: '5px 10px', fontSize: 11,
                        fontFamily: "'Urbanist', sans-serif", fontWeight: 600, cursor: 'pointer',
                        color: isSelected ? meta.color : 'var(--color-text-soft)',
                        display: 'flex', gap: 5, alignItems: 'center',
                      }}
                    >
                      {meta.icon} {role}
                      {isSelected && <span style={{ fontSize: 10, color: meta.color }}>✓</span>}
                    </button>
                  )
                })}
            </div>
            {teamMembers.length > 0 && (
              <div style={{
                fontFamily: "'DM Mono', monospace", fontSize: 11,
                color: 'var(--color-text-muted)', marginTop: 6,
              }}>
                {teamMembers.length} member{teamMembers.length !== 1 ? 's' : ''} selected
              </div>
            )}

            {/* Name inputs */}
            {teamMembers.length > 0 && (
              <>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                  {teamMembers.map(m => {
                    const meta = ROLE_META[m.role] || { color: 'var(--color-text-soft)', icon: '◈' }
                    return (
                      <div key={m.id} style={{
                        display: 'flex', alignItems: 'center', gap: 5,
                        background: 'var(--color-card)',
                        border: '1px solid ' + meta.color + '44',
                        borderRadius: 7, padding: '5px 10px',
                      }}>
                        <span style={{ fontSize: 11, flexShrink: 0 }}>{meta.icon}</span>
                        <input
                          value={m.name}
                          onChange={e => updateMemberName(m.id, e.target.value)}
                          placeholder={m.role}
                          style={{
                            background: 'transparent', border: 'none', outline: 'none',
                            fontFamily: "'Urbanist', sans-serif", fontSize: 11,
                            color: 'var(--color-text)', width: 100,
                          }}
                        />
                      </div>
                    )
                  })}
                </div>

                <button
                  onClick={handleGenerateKanban}
                  disabled={loading}
                  style={{
                    width: '100%', marginTop: 10,
                    background: loading ? 'var(--color-border)' : 'var(--color-accent)',
                    border: 'none', borderRadius: 9, padding: '10px 0',
                    color: 'var(--color-accent-text)', fontFamily: "'Urbanist', sans-serif",
                    fontWeight: 700, fontSize: 12, cursor: loading ? 'default' : 'pointer',
                    opacity: loading ? 0.6 : 1,
                  }}
                >
                  {loading ? 'Generating...' : 'Generate Kanban Board →'}
                </button>
              </>
            )}
          </div>
        )}

        {/* File indicator */}
        {fileName && (
          <div style={{ padding: '0 14px 8px' }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              background: 'var(--color-accent-bg)',
              border: '1px solid var(--color-accent-border)',
              borderRadius: 7, padding: '5px 10px',
              fontSize: 11, fontFamily: "'DM Mono', monospace", color: 'var(--color-accent)',
            }}>
              <span>📄 {fileName}</span>
              <button
                onClick={() => setFileName(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-accent)', fontSize: 13, padding: '0 0 0 6px' }}
              >×</button>
            </div>
          </div>
        )}

        {/* Chat input */}
        {(phase === 'brief' || phase === 'kanban') && (
          <div style={{
            padding: '12px 14px',
            borderTop: '1px solid var(--color-border)',
            minHeight: 68, display: 'flex', flexDirection: 'column', justifyContent: 'center',
          }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
              <button
                onClick={() => fileInputRef.current?.click()}
                style={{
                  width: 36, height: 36, background: 'var(--color-card)',
                  border: '1px solid var(--color-border)', borderRadius: 8,
                  cursor: 'pointer', fontSize: 15, color: 'var(--color-text-soft)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}
              >📎</button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".txt,.pdf,.doc,.docx,.md"
                style={{ display: 'none' }}
                onChange={e => handleFileUpload(e.target.files[0])}
              />
              <textarea
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    handleSend()
                  }
                }}
                onFocus={e => { e.currentTarget.style.borderColor = 'var(--color-accent)' }}
                onBlur={e => { e.currentTarget.style.borderColor = 'var(--color-border)' }}
                placeholder={phase === 'brief'
                  ? 'Paste brief or describe the project...'
                  : 'Ask a follow-up or request a board change...'}
                rows={1}
                style={{
                  flex: 1, background: 'var(--color-card)',
                  border: '1px solid var(--color-border)', borderRadius: 8,
                  padding: '9px 12px', color: 'var(--color-text)',
                  fontFamily: "'DM Mono', monospace", fontSize: 12,
                  resize: 'none', lineHeight: 1.6, maxHeight: 100, minHeight: 36,
                  outline: 'none', boxSizing: 'border-box',
                }}
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || loading}
                style={{
                  width: 36, height: 36, background: 'var(--color-accent)',
                  border: 'none', borderRadius: 8, cursor: !input.trim() || loading ? 'default' : 'pointer',
                  color: 'var(--color-accent-text)', fontSize: 16, flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  opacity: !input.trim() || loading ? 0.4 : 1,
                }}
              >↑</button>
            </div>
          </div>
        )}
      </div>

      {/* ── Right panel ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Tab bar */}
        <div style={{
          height: 48, borderBottom: '1px solid var(--color-border)',
          display: 'flex', alignItems: 'center',
          padding: '0 20px', gap: 4, flexShrink: 0,
          background: 'var(--color-bg)',
        }}>
          {[
            { id: 'board', label: 'Board' },
            { id: 'brief', label: 'Brief' },
            { id: 'team', label: 'Team' },
          ].map(tab => {
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  padding: '5px 14px', borderRadius: 7, cursor: 'pointer',
                  background: isActive ? 'var(--color-accent-bg)' : 'transparent',
                  border: isActive ? '1px solid var(--color-accent-border)' : '1px solid transparent',
                  color: isActive ? 'var(--color-accent)' : 'var(--color-text-soft)',
                  fontFamily: "'Urbanist', sans-serif", fontWeight: isActive ? 700 : 400,
                  fontSize: 12, transition: 'all 0.12s',
                }}
                onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'var(--color-surface)' }}
                onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent' }}
              >
                {tab.label}
              </button>
            )
          })}
        </div>

        {/* ── Brief tab ── */}
        {activeTab === 'brief' && (() => {
          const r = activeProject?.data?.result
          const s = activeProject?.data?.scoring
          const phases = r ? buildPhases(r.timeframe?.taskDays) : []
          return (
            <div style={{ flex: 1, overflowY: 'auto', background: 'var(--color-bg)' }}>
              {r ? (
                <div style={{ maxWidth: 820, margin: '0 auto', padding: '20px 28px 60px' }}>

                  {/* Brief header */}
                  <div style={{
                    display: 'flex', justifyContent: 'space-between',
                    alignItems: 'flex-start', marginBottom: 20,
                  }}>
                    <div>
                      <div style={{
                        fontFamily: "'DM Mono', monospace", fontSize: 10,
                        color: 'var(--color-text-muted)', letterSpacing: '0.08em',
                        marginBottom: 4,
                      }}>PROJECT BRIEF</div>
                      <div style={{
                        fontFamily: "'Urbanist', sans-serif", fontWeight: 800, fontSize: 22,
                        color: 'var(--color-text)',
                      }}>
                        {r.projectTitle || projectTitle}
                      </div>
                    </div>
                    {s?.verdict && (
                      <Badge color={verdictColor(s.verdict)} size="sm">
                        {s.verdict}
                      </Badge>
                    )}
                  </div>

                  {s && <ScoreStrip s={s} />}
                  {r.isChaos && <ChaosBanner r={r} s={s} />}

                  {/* Project Understanding */}
                  {r.projectUnderstanding && (
                    <div style={{
                      background: 'var(--color-surface)',
                      border: '1px solid var(--color-border)',
                      borderRadius: 14, padding: '18px 24px', marginBottom: 16,
                    }}>
                      <div style={{
                        fontFamily: "'DM Mono', monospace", fontSize: 10,
                        color: 'var(--color-text-muted)', letterSpacing: '0.08em',
                        marginBottom: 8,
                      }}>PROJECT UNDERSTANDING</div>
                      <div style={{
                        fontFamily: "'DM Mono', monospace", fontSize: 12,
                        color: 'var(--color-text-soft)', lineHeight: 1.75,
                      }}>
                        {r.projectUnderstanding}
                      </div>
                    </div>
                  )}

                  {/* Tone + Colour 2-col grid */}
                  {(r.toneWords?.length > 0 || r.colorDirection) && (
                    <div style={{
                      display: 'grid', gridTemplateColumns: '1fr 1fr',
                      gap: 14, marginBottom: 14,
                    }}>
                      {r.toneWords?.length > 0 && (
                        <div style={{
                          background: 'var(--color-surface)',
                          border: '1px solid var(--color-border)',
                          borderRadius: 14, padding: '16px 20px',
                        }}>
                          <div style={{
                            fontFamily: "'DM Mono', monospace", fontSize: 10,
                            color: 'var(--color-text-muted)', letterSpacing: '0.08em',
                            marginBottom: 10,
                          }}>TONE & MOOD</div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                            {r.toneWords.map((w, i) => (
                              <span key={i} style={{
                                background: 'var(--color-card)',
                                border: '1px solid var(--color-border)',
                                borderRadius: 6, padding: '4px 10px',
                                fontFamily: "'Urbanist', sans-serif", fontWeight: 600,
                                fontSize: 11, color: 'var(--color-text)',
                              }}>{w}</span>
                            ))}
                          </div>
                        </div>
                      )}
                      {r.colorDirection && (
                        <div style={{
                          background: 'var(--color-surface)',
                          border: '1px solid var(--color-border)',
                          borderRadius: 14, padding: '16px 20px',
                        }}>
                          <div style={{
                            fontFamily: "'DM Mono', monospace", fontSize: 10,
                            color: 'var(--color-text-muted)', letterSpacing: '0.08em',
                            marginBottom: 10,
                          }}>COLOUR DIRECTION</div>
                          <div style={{
                            fontFamily: "'DM Mono', monospace", fontSize: 12,
                            color: 'var(--color-text-soft)', lineHeight: 1.75,
                          }}>
                            {r.colorDirection}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {r.budgetRange && <BudgetCard budgetRange={r.budgetRange} />}
                  {phases.length > 0 && <RoadmapCard phases={phases} timeframe={r.timeframe} />}
                  {r.rolesNeeded?.length > 0 && <RolesCard rolesNeeded={r.rolesNeeded} />}
                  {r.techStack && <TechStackCard techStack={r.techStack} />}
                  {r.features?.length > 0 && <FeaturesCard features={r.features} />}
                  {r.userFlow?.length > 0 && <UserFlowCard userFlow={r.userFlow} />}
                </div>
              ) : (
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  height: '100%', padding: '60px 40px', textAlign: 'center',
                }}>
                  <div>
                    <div style={{
                      fontSize: 48, color: 'var(--color-text-muted)',
                      background: 'var(--color-surface)', borderRadius: 12,
                      padding: 16, display: 'inline-block', marginBottom: 16,
                    }}>◈</div>
                    <div style={{
                      fontFamily: "'Urbanist', sans-serif", fontWeight: 700, fontSize: 16,
                      color: 'var(--color-text)', marginBottom: 8,
                    }}>No brief loaded</div>
                    <div style={{
                      fontFamily: "'DM Mono', monospace", fontSize: 12,
                      color: 'var(--color-text-soft)', marginBottom: 16,
                    }}>
                      Translate a brief or load a project to see it here.
                    </div>
                    <Button variant="secondary" onClick={() => navigate('translator')}>
                      Go to Brief Translator
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )
        })()}

        {/* ── Team tab ── */}
        {activeTab === 'team' && (
          <div style={{ flex: 1, overflowY: 'auto' }}>
            <div style={{ maxWidth: 700, margin: '0 auto', padding: 24 }}>

              {/* Team header */}
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                marginBottom: 24,
              }}>
                <div>
                  <div style={{
                    fontFamily: "'Urbanist', sans-serif", fontWeight: 800, fontSize: 22,
                    color: 'var(--color-text)', marginBottom: 4,
                  }}>Team Members</div>
                  <div style={{
                    fontFamily: "'DM Mono', monospace", fontSize: 12,
                    color: 'var(--color-text-soft)',
                  }}>People working on this project</div>
                </div>
                <button
                  onClick={() => setShowInviteModal(true)}
                  style={{
                    background: 'var(--color-accent)', border: 'none',
                    borderRadius: 8, padding: '8px 14px',
                    color: 'var(--color-accent-text)', fontFamily: "'Urbanist', sans-serif",
                    fontWeight: 700, fontSize: 12, cursor: 'pointer',
                  }}
                >
                  + Invite Member
                </button>
              </div>

              {/* Current team list */}
              {teamMembers.length > 0 ? (
                teamMembers.map(member => {
                  const meta = ROLE_META[member.role] || { color: 'var(--color-accent)', icon: '◈' }
                  const initial = (member.name || member.role || '?')[0].toUpperCase()
                  return (
                    <div key={member.id} style={{
                      display: 'flex', gap: 12, alignItems: 'center',
                      background: 'var(--color-card)',
                      border: '1px solid var(--color-border)',
                      borderRadius: 12, padding: '14px 16px', marginBottom: 8,
                    }}>
                      <div style={{
                        width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                        background: meta.color + '22',
                        border: '1px solid ' + meta.color + '70',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontFamily: "'Urbanist', sans-serif", fontWeight: 700, fontSize: 14,
                        color: meta.color,
                      }}>
                        {initial}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{
                          fontFamily: "'Urbanist', sans-serif", fontWeight: 700,
                          fontSize: 13, color: 'var(--color-text)',
                        }}>
                          {member.name || member.role}
                        </div>
                        <div style={{
                          fontFamily: "'DM Mono', monospace", fontSize: 11,
                          color: 'var(--color-text-soft)',
                        }}>
                          {member.role}
                        </div>
                      </div>
                      <Badge color={meta.color} size="sm">
                        {meta.icon} {member.role}
                      </Badge>
                    </div>
                  )
                })
              ) : (
                <div style={{
                  fontFamily: "'DM Mono', monospace", fontSize: 12,
                  color: 'var(--color-text-muted)', textAlign: 'center',
                  padding: '32px 0',
                }}>
                  No team members yet. Use the chat to build your team.
                </div>
              )}

              {/* Pending invites section */}
              {invites.filter(inv => inv.status === 'pending').length > 0 && (
                <div style={{ marginTop: 20 }}>
                  <div style={{
                    fontFamily: "'Urbanist', sans-serif", fontWeight: 700,
                    fontSize: 13, color: 'var(--color-text)', marginBottom: 12,
                  }}>
                    Pending Invites
                  </div>
                  {invites.filter(inv => inv.status === 'pending').map(invite => {
                    const meta = ROLE_META[invite.job_role] || {}
                    const initial = (invite.invitee_name || invite.invitee_email || '?')[0].toUpperCase()
                    return (
                      <div key={invite.id} style={{
                        display: 'flex', gap: 12, alignItems: 'center',
                        background: 'var(--color-card)',
                        border: '1px solid var(--color-border)',
                        borderRadius: 12, padding: '14px 16px', marginBottom: 8,
                      }}>
                        <div style={{
                          width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                          background: (meta.color || 'var(--color-accent)') + '22',
                          border: '1px solid ' + (meta.color || 'var(--color-accent)') + '70',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontFamily: "'Urbanist', sans-serif", fontWeight: 700, fontSize: 14,
                          color: meta.color || 'var(--color-accent)',
                        }}>
                          {initial}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{
                            fontFamily: "'Urbanist', sans-serif", fontWeight: 700,
                            fontSize: 13, color: 'var(--color-text)',
                          }}>
                            {invite.invitee_name}
                          </div>
                          <div style={{
                            fontFamily: "'DM Mono', monospace", fontSize: 11,
                            color: 'var(--color-text-muted)',
                          }}>
                            {invite.invitee_email}
                          </div>
                        </div>
                        <Badge color="var(--color-amber)" size="sm">Awaiting</Badge>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Board tab ── */}
        {activeTab === 'board' && (<>

        {/* Empty state */}
        {!kanban && (
          <div style={{
            flex: 1, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: 12,
          }}>
            <div style={{ fontSize: 40, color: 'var(--color-text-muted)' }}>📋</div>
            <div style={{
              fontFamily: "'DM Mono', monospace", fontSize: 13,
              color: 'var(--color-text-muted)', textAlign: 'center',
            }}>Your kanban board will appear here</div>
            <div style={{
              fontFamily: "'DM Mono', monospace", fontSize: 11,
              color: 'var(--color-text-muted)', textAlign: 'center',
            }}>Add your team and generate the board</div>
          </div>
        )}

        {/* Kanban board */}
        {kanban && (
          <>
            {/* Brief reference bar */}
            <div style={{
              height: 36, flexShrink: 0,
              background: 'var(--color-surface)',
              borderBottom: '1px solid var(--color-border)',
              display: 'flex', alignItems: 'center',
              padding: '0 20px', gap: 12,
              justifyContent: 'space-between',
            }}>
              <span style={{
                fontFamily: "'DM Mono', monospace", fontSize: 11,
                color: 'var(--color-text-soft)',
              }}>
                ◈ {projectTitle || 'Project Brief'}
              </span>
              <span
                onClick={() => setActiveTab('brief')}
                style={{
                  fontFamily: "'DM Mono', monospace", fontSize: 11,
                  color: 'var(--color-accent)', cursor: 'pointer',
                }}
              >
                View Brief →
              </span>
            </div>

            {/* Board header */}
            <div style={{
              padding: '14px 20px', borderBottom: '1px solid var(--color-border)',
              flexShrink: 0,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontFamily: "'Urbanist', sans-serif", fontWeight: 700, fontSize: 14, color: 'var(--color-text)' }}>
                    {projectTitle}
                  </div>
                  <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'var(--color-text-soft)', marginTop: 2 }}>
                    {kanban.tasks.length} tasks · {kanban.projectTimeline}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  {/* View toggle */}
                  <div style={{
                    display: 'flex', gap: 3,
                    background: 'var(--color-surface)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 8, padding: 3,
                  }}>
                    {[
                      { id: 'kanban', icon: '▦', label: 'Board' },
                      { id: 'list', icon: '≡', label: 'List' },
                    ].map(v => (
                      <button
                        key={v.id}
                        onClick={() => setBoardView(v.id)}
                        title={v.label}
                        style={{
                          background: boardView === v.id ? 'var(--color-accent-bg)' : 'transparent',
                          border: boardView === v.id ? '1px solid var(--color-accent)' : '1px solid transparent',
                          borderRadius: 6, padding: '4px 10px',
                          color: boardView === v.id ? 'var(--color-accent)' : 'var(--color-text-muted)',
                          fontFamily: "'Urbanist', sans-serif", fontSize: 12,
                          cursor: 'pointer', transition: 'all 0.15s',
                          display: 'flex', alignItems: 'center', gap: 4,
                        }}
                      >
                        <span style={{ fontSize: 13 }}>{v.icon}</span>
                        <span style={{ fontSize: 11 }}>{v.label}</span>
                      </button>
                    ))}
                  </div>
                  {kanban.missingRoles?.length > 0 && (
                    <div style={{
                      background: 'var(--color-amber)' + '22',
                      border: '1px solid var(--color-amber)',
                      borderRadius: 7, padding: '4px 10px',
                      fontSize: 11, fontFamily: "'DM Mono', monospace",
                      color: 'var(--color-amber)',
                    }}>
                      ⚠ Need: {kanban.missingRoles.join(', ')}
                    </div>
                  )}
                  <button
                    onClick={() => setActiveTab('team')}
                    style={{
                      background: 'var(--color-surface)',
                      border: '1px solid var(--color-border)',
                      borderRadius: 8, padding: '7px 14px',
                      color: 'var(--color-text-soft)', fontFamily: "'Urbanist', sans-serif",
                      fontWeight: 700, fontSize: 12, cursor: 'pointer',
                    }}
                  >👤 Team</button>
                  <button
                    onClick={() => setShowAddTaskModal(true)}
                    style={{
                      background: 'var(--color-accent)', border: 'none',
                      borderRadius: 8, padding: '7px 14px',
                      color: 'var(--color-accent-text)', fontFamily: "'Urbanist', sans-serif",
                      fontWeight: 700, fontSize: 12, cursor: 'pointer',
                    }}
                  >+ Add Task</button>
                </div>
              </div>
              {/* Progress bar */}
              {(() => {
                const progress = calculateProgress(kanban.tasks)
                const progressColor = progress === 100
                  ? 'var(--color-green)'
                  : progress > 50
                    ? 'var(--color-accent)'
                    : 'var(--color-blue)'
                return (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
                    <div style={{
                      flex: 1, height: 4, background: 'var(--color-border)',
                      borderRadius: 2, overflow: 'hidden',
                    }}>
                      <div style={{
                        height: '100%', width: progress + '%',
                        background: progressColor, borderRadius: 2,
                        transition: 'width 0.6s ease',
                      }} />
                    </div>
                    <span style={{
                      fontFamily: "'DM Mono', monospace", fontSize: 11,
                      color: progress === 100 ? 'var(--color-green)' : 'var(--color-text-muted)',
                      flexShrink: 0,
                    }}>
                      {progress === 100 ? '✓ Complete' : progress + '%'}
                    </span>
                  </div>
                )
              })()}
            </div>

            {/* Board columns / List view */}
            {boardView === 'list' ? (
              <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
                {/* Table header */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '2fr 1fr 80px 100px 100px 60px',
                  gap: 12, padding: '8px 16px',
                  background: 'var(--color-surface)',
                  borderRadius: 8, marginBottom: 10,
                  fontSize: 10, fontFamily: "'DM Mono', monospace",
                  color: 'var(--color-text-muted)', letterSpacing: '0.06em',
                }}>
                  {['TASK', 'ASSIGNEE', 'PRIORITY', 'DUE DATE', 'STATUS', 'DAYS'].map(h => (
                    <div key={h}>{h}</div>
                  ))}
                </div>

                {/* Tasks grouped by column */}
                {KANBAN_COLS.map(col => {
                  const colTasks = kanban.tasks.filter(t => t.column === col)
                  if (!colTasks.length) return null
                  const cc = COL_COLORS[col] || 'var(--color-text-muted)'
                  return (
                    <div key={col} style={{ marginBottom: 16 }}>
                      {/* Column group header */}
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '10px 16px 6px',
                      }}>
                        <div style={{
                          width: 7, height: 7, borderRadius: '50%', background: cc,
                        }} />
                        <span style={{
                          fontFamily: "'Urbanist', sans-serif", fontWeight: 600,
                          fontSize: 12, color: 'var(--color-text)',
                        }}>{col}</span>
                        <span style={{
                          fontFamily: "'DM Mono', monospace", fontSize: 10,
                          color: 'var(--color-text-muted)',
                        }}>({colTasks.length})</span>
                      </div>

                      {/* Task rows */}
                      {colTasks.map(task => {
                        const meta = ROLE_META[task.assignedRole]
                        const roleColor = meta?.color || 'var(--color-text-muted)'
                        const pc = PRIORITY_COLORS[task.priority] || 'var(--color-text-muted)'
                        const dueSt = getDueDateStatus(task.dueDate, task.column)
                        const dueTxt = !task.dueDate ? '—'
                          : dueSt === 'overdue' ? 'Overdue'
                          : dueSt === 'today' ? 'Today'
                          : formatDueDate(task.dueDate)
                        const dueColor = !task.dueDate
                          ? 'var(--color-text-muted)'
                          : dueSt === 'overdue'
                            ? 'var(--color-red)'
                            : dueSt === 'today'
                              ? 'var(--color-amber)'
                              : 'var(--color-text-soft)'
                        return (
                          <div
                            key={task.id}
                            onClick={() => setEditingTask(task)}
                            style={{
                              display: 'grid',
                              gridTemplateColumns: '2fr 1fr 80px 100px 100px 60px',
                              gap: 12, padding: '10px 16px',
                              background: 'var(--color-card)',
                              border: '1px solid var(--color-border)',
                              borderLeft: '3px solid ' + pc,
                              borderRadius: 9, marginBottom: 4,
                              cursor: 'pointer', transition: 'all 0.15s',
                              alignItems: 'center',
                            }}
                            onMouseEnter={e => {
                              e.currentTarget.style.background = 'var(--color-card-hover)'
                              e.currentTarget.style.borderColor = 'var(--color-border-hover)'
                              e.currentTarget.style.borderLeftColor = pc
                            }}
                            onMouseLeave={e => {
                              e.currentTarget.style.background = 'var(--color-card)'
                              e.currentTarget.style.borderColor = 'var(--color-border)'
                              e.currentTarget.style.borderLeftColor = pc
                            }}
                          >
                            {/* Task title */}
                            <div>
                              {task.blockedBy?.length > 0 && task.column !== 'Done' && (
                                <span style={{
                                  fontSize: 9, fontFamily: "'DM Mono', monospace",
                                  color: 'var(--color-red)', marginRight: 6,
                                }}>🔒</span>
                              )}
                              <span style={{
                                fontFamily: "'Urbanist', sans-serif", fontWeight: 600,
                                fontSize: 12, color: 'var(--color-text)',
                              }}>{task.title}</span>
                              {task.description && (
                                <div style={{
                                  fontFamily: "'DM Mono', monospace", fontSize: 10,
                                  color: 'var(--color-text-muted)',
                                  overflow: 'hidden', textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap', marginTop: 2,
                                }}>{task.description}</div>
                              )}
                            </div>
                            {/* Assignee */}
                            <div>
                              {task.assignedRole ? (
                                <div style={{
                                  background: roleColor + '18',
                                  border: '1px solid ' + roleColor + '33',
                                  borderRadius: 5, padding: '2px 7px',
                                  display: 'inline-flex', alignItems: 'center', gap: 3,
                                }}>
                                  <span style={{ fontSize: 9 }}>{meta?.icon}</span>
                                  <span style={{
                                    fontSize: 9, fontFamily: "'DM Mono', monospace",
                                    color: roleColor,
                                  }}>{task.assignedName || task.assignedRole}</span>
                                </div>
                              ) : (
                                <span style={{
                                  fontFamily: "'DM Mono', monospace", fontSize: 10,
                                  color: 'var(--color-text-muted)',
                                }}>Unassigned</span>
                              )}
                            </div>
                            {/* Priority */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              <div style={{
                                width: 6, height: 6, borderRadius: '50%', background: pc,
                              }} />
                              <span style={{
                                fontFamily: "'DM Mono', monospace", fontSize: 9, color: pc,
                              }}>{task.priority}</span>
                            </div>
                            {/* Due date */}
                            <div style={{
                              fontFamily: "'DM Mono', monospace", fontSize: 10, color: dueColor,
                            }}>{dueTxt}</div>
                            {/* Status */}
                            <div>
                              <div style={{
                                background: cc + '18',
                                border: '1px solid ' + cc + '33',
                                borderRadius: 5, padding: '2px 8px',
                                display: 'inline-block',
                                fontFamily: "'DM Mono', monospace", fontSize: 9, color: cc,
                              }}>{col}</div>
                            </div>
                            {/* Days */}
                            <div style={{
                              fontFamily: "'DM Mono', monospace", fontSize: 10,
                              color: 'var(--color-text-muted)',
                            }}>{task.estimatedDays}d</div>
                          </div>
                        )
                      })}
                    </div>
                  )
                })}
              </div>
            ) : (
            <div style={{ flex: 1, overflowX: 'auto', overflowY: 'auto', padding: 20 }}>
              <div style={{ display: 'flex', minWidth: 'max-content', gap: 0 }}>
                {KANBAN_COLS.map((col, colIdx) => {
                  const colTasks = kanban.tasks.filter(t => t.column === col)
                  const isDropTarget = dragOverCol === col && draggedTaskId !== null
                  const accentCol = COL_COLORS[col]

                  return (
                    <React.Fragment key={col}>
                      {/* Column divider */}
                      {colIdx > 0 && (
                        <div style={{
                          width: 1,
                          background: 'linear-gradient(to bottom, transparent, var(--color-border), transparent)',
                          alignSelf: 'stretch', margin: '0 4px',
                        }} />
                      )}

                      {/* Column */}
                      <div
                        style={{
                          width: 280, flexShrink: 0, padding: '0 12px',
                          borderRadius: 12, transition: 'background 0.15s',
                          background: isDropTarget ? accentCol + '0D' : 'transparent',
                          outline: isDropTarget ? '2px dashed ' + accentCol + '66' : 'none',
                          outlineOffset: -2,
                        }}
                        onDragOver={e => {
                          e.preventDefault()
                          setDragOverCol(col)
                        }}
                        onDragLeave={e => {
                          if (!e.currentTarget.contains(e.relatedTarget)) {
                            setDragOverCol(null)
                          }
                        }}
                        onDrop={e => {
                          e.preventDefault()
                          const id = e.dataTransfer.getData('taskId')
                          if (id) moveTask(id, col)
                          setDragOverCol(null)
                          setDraggedTaskId(null)
                        }}
                      >
                        {/* Column header */}
                        <div style={{
                          display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14,
                        }}>
                          <div style={{ width: 7, height: 7, borderRadius: '50%', background: accentCol, flexShrink: 0 }} />
                          <span style={{ fontFamily: "'Urbanist', sans-serif", fontWeight: 700, fontSize: 12, color: 'var(--color-text)' }}>{col}</span>
                          <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'var(--color-text-muted)', marginLeft: 'auto' }}>
                            {colTasks.length}
                          </span>
                          {isDropTarget && (
                            <span style={{
                              fontFamily: "'DM Mono', monospace", fontSize: 9, color: accentCol,
                              animation: 'pulse 1s ease infinite',
                            }}>DROP</span>
                          )}
                        </div>

                        {/* Tasks */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minHeight: 60 }}>
                          {colTasks.map(task => (
                            <TaskCard key={task.id} task={task} col={col} />
                          ))}

                          {/* Empty drop zone */}
                          {colTasks.length === 0 && (
                            <div style={{
                              height: 60,
                              border: '1.5px dashed ' + (isDropTarget ? accentCol + '88' : 'var(--color-border)'),
                              borderRadius: 10,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontFamily: "'DM Mono', monospace", fontSize: 11,
                              color: isDropTarget ? accentCol : 'var(--color-text-muted)',
                              marginBottom: 8,
                            }}>
                              {isDropTarget ? 'Drop here' : 'Empty'}
                            </div>
                          )}

                          {/* Inline add or add button */}
                          {addingTaskCol === col ? (
                            <InlineAddTask
                              col={col}
                              onAdd={task => {
                                addTaskToBoard({ ...task, column: col })
                                setAddingTaskCol(null)
                              }}
                              onCancel={() => setAddingTaskCol(null)}
                            />
                          ) : (
                            <button
                              onClick={() => setAddingTaskCol(col)}
                              style={{
                                width: '100%', background: 'transparent',
                                border: '1.5px dashed var(--color-border)',
                                borderRadius: 10, padding: '9px 0',
                                color: 'var(--color-text-muted)', fontSize: 12,
                                cursor: 'pointer', fontFamily: "'Urbanist', sans-serif",
                                transition: 'all 0.2s',
                              }}
                              onMouseEnter={e => {
                                e.currentTarget.style.borderColor = accentCol + '66'
                                e.currentTarget.style.color = accentCol
                              }}
                              onMouseLeave={e => {
                                e.currentTarget.style.borderColor = 'var(--color-border)'
                                e.currentTarget.style.color = 'var(--color-text-muted)'
                              }}
                            >+ Add task</button>
                          )}
                        </div>
                      </div>
                    </React.Fragment>
                  )
                })}
              </div>
            </div>
            )}

            {/* Bottom bar — unassigned tasks */}
            <div style={{
              height: 68, borderTop: '1px solid var(--color-border)',
              background: 'var(--color-surface)', flexShrink: 0,
              display: 'flex', alignItems: 'center',
              padding: '0 20px', overflowX: 'auto', gap: 8,
            }}>
              {kanban.unassignedTasks?.length > 0 ? (
                <>
                  <span style={{
                    fontFamily: "'DM Mono', monospace", fontSize: 10,
                    color: 'var(--color-text-muted)', flexShrink: 0, marginRight: 4,
                  }}>UNASSIGNED:</span>
                  {kanban.unassignedTasks.map((ut, i) => (
                    <div key={i} style={{
                      background: 'var(--color-card)',
                      border: '1px solid var(--color-amber)',
                      borderRadius: 8, padding: '6px 12px',
                      display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0,
                    }}>
                      <span style={{ fontFamily: "'Urbanist', sans-serif", fontWeight: 600, fontSize: 11, color: 'var(--color-text)' }}>
                        {ut.title || ut}
                      </span>
                      {ut.suggestedRole && (
                        <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'var(--color-amber)' }}>
                          → Need: {ut.suggestedRole}
                        </span>
                      )}
                    </div>
                  ))}
                </>
              ) : (
                <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'var(--color-text-muted)' }}>
                  ✓ All tasks assigned
                </span>
              )}
            </div>
          </>
        )}

        </>)}
      </div>
    </div>
  )
}
