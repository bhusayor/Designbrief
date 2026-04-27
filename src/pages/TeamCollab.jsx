import React, { useState, useRef, useEffect, useContext } from 'react'
import AppContext from '../context/AppContext'
import { Button, Badge } from '../components/ui'
import {
  SparklesIcon, CheckIcon, PlusIcon,
  XMarkIcon, ArrowUpIcon, ChevronDownIcon,
  UserGroupIcon, UserIcon, CalendarIcon,
  Squares2X2Icon, ListBulletIcon,
  TableCellsIcon, CalendarDaysIcon, ChartBarIcon,
  ChevronLeftIcon, ChevronRightIcon,
  ExclamationCircleIcon,
} from '@heroicons/react/24/outline'
import { ROLE_META, KANBAN_COLS, COL_COLORS, PRIORITY_COLORS } from '../lib/constants'
import { generateKanban, generateTeamRoles, handleFollowUp, callJSON } from '../lib/api'
import { getProjectInvites } from '../lib/teamService'
import {
  saveTasksToDB, loadTasksFromDB, updateTaskInDB,
  calculateDueDates, calculateProgress, logActivity,
} from '../lib/taskService'
import { InviteModal } from '../components/team'
const uid = () => Math.random().toString(36).slice(2, 9)

// ─── ChatBubble ───────────────────────────────────────────────────────────────

function ChatBubble({ msg }) {
  const isAI = msg.role === 'ai'
  const lines = msg.text.split('\n')

  const textContent = (
    <div style={{
      fontFamily: "'Urbanist', sans-serif",
      fontSize: 13, lineHeight: 1.65,
      color: isAI ? 'var(--color-text)' : 'var(--color-bg)',
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
              ? <strong key={i} style={{ fontWeight: 700 }}>{p}</strong>
              : p
            )}
          </div>
        )
      })}
    </div>
  )

  if (isAI) {
    return (
      <div style={{
        display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 12,
      }}>
        <div style={{
          width: 28, height: 28, borderRadius: 8,
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0, marginTop: 2,
        }}>
          <SparklesIcon style={{ width: 13, height: 13, color: 'var(--color-text)' }} />
        </div>
        <div style={{
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: '4px 14px 14px 14px',
          padding: '10px 14px', maxWidth: '85%',
        }}>
          {textContent}
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
      <div style={{
        background: 'var(--color-text)',
        borderRadius: '14px 4px 14px 14px',
        padding: '10px 14px', maxWidth: '80%',
      }}>
        {textContent}
      </div>
    </div>
  )
}

function ThinkingBubble() {
  return (
    <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
      <div style={{
        width: 28, height: 28, borderRadius: 8,
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        <SparklesIcon style={{ width: 13, height: 13, color: 'var(--color-text)' }} />
      </div>
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
  const [messages, setMessages] = useState([])
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
  const [addTaskData, setAddTaskData] = useState({ title: '', description: '', assignees: [], dueDate: '', priority: 'MEDIUM', column: '' })
  const [addingToCol, setAddingToCol] = useState(null)
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [chatOpen, setChatOpen] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const [projects, setProjects] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem('teamcollab-projects'))
      if (Array.isArray(stored) && stored.length > 0) return stored
    } catch {}
    return [{ id: 'default', title: 'My Project' }]
  })
  const [activeProjectId, setActiveProjectId] = useState(() => {
    try { return localStorage.getItem('teamcollab-active-project') || 'default' } catch {}
    return 'default'
  })
  const [conversationHistory, setConversationHistory] = useState([])
  const [fileName, setFileName] = useState(null)
  const [activeTab, setActiveTab] = useState('board')
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [invites, setInvites] = useState([])
  const [viewMode, setViewMode] = useState('board')
  const [customCols, setCustomCols] = useState(() => {
    try {
      const saved = localStorage.getItem('tc-cols-' + (activeProjectId || 'default'))
      if (saved) return JSON.parse(saved)
    } catch(e) {}
    return [
      { id: 'To Do', label: 'To Do', color: '#6B7280' },
      { id: 'In Progress', label: 'In Progress', color: '#3B82F6' },
      { id: 'Review', label: 'Review', color: '#F59E0B' },
      { id: 'Done', label: 'Done', color: '#16a34a' },
    ]
  })
  const [editingColId, setEditingColId] = useState(null)
  const [editingColLabel, setEditingColLabel] = useState('')

  const chatEndRef = useRef(null)
  const fileInputRef = useRef(null)
  const addInputRef = useRef(null)

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
    if (addingToCol) addInputRef.current?.focus()
  }, [addingToCol])

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
    if (role === 'ai') {
      setChatOpen(prev => {
        if (!prev) setUnreadCount(c => c + 1)
        return prev
      })
    }
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

  function saveProjects(newProjects) {
    localStorage.setItem('teamcollab-projects', JSON.stringify(newProjects))
  }

  function saveCustomCols(cols) {
    setCustomCols(cols)
    localStorage.setItem('tc-cols-' + (activeProjectId || 'default'), JSON.stringify(cols))
  }

  function handleNewProject() {
    const newProj = { id: uid(), title: 'New Project' }
    const updated = [...projects, newProj]
    setProjects(updated)
    saveProjects(updated)
    setActiveProjectId(newProj.id)
    localStorage.setItem('teamcollab-active-project', newProj.id)
    setMessages([])
    setKanban(null)
    setTeamMembers([])
    setPhase('brief')
    setProjectTitle('')
    setBriefText('')
    setActiveTab('board')
  }

  function handleSwitchProject(id) {
    setActiveProjectId(id)
    localStorage.setItem('teamcollab-active-project', id)
    const proj = projects.find(p => p.id === id)
    if (proj?.title) setProjectTitle(proj.title)
  }

  function handleAddManualTask(columnId) {
    if (!newTaskTitle.trim()) return
    const newTask = {
      id: 'manual-' + Date.now(),
      title: newTaskTitle.trim(),
      priority: 'MEDIUM',
      assignedName: null,
      assignedRole: '',
      column: columnId,
      source: 'manual',
      subtasks: [],
      description: '',
      estimatedDays: 1,
    }
    setKanban(prev => {
      if (!prev) {
        return { tasks: [newTask], columns: ['To Do', 'In Progress', 'Review', 'Done'], projectTimeline: '', unassignedTasks: [], missingRoles: [] }
      }
      return { ...prev, tasks: [...(prev.tasks || []), newTask] }
    })
    if (phase !== 'kanban') setPhase('kanban')
    setNewTaskTitle('')
    setAddingToCol(null)
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

  async function handleChatSend() {
    const msg = input.trim()
    if (!msg || loading) return
    setInput('')
    setFileName(null)
    addMessage('user', msg)
    setLoading(true)

    try {
      const lowerMsg = msg.toLowerCase()

      // Intent: add a task
      if (lowerMsg.includes('add') || lowerMsg.includes('create') || lowerMsg.includes('new task')) {
        const result = await callJSON(
          'You are a project management assistant. Extract task details from the user message. Return ONLY valid JSON.',
          `User message: "${msg}"\n\nCurrent kanban columns: ${JSON.stringify(KANBAN_COLS)}\n\nExtract and return:\n{\n  "action": "add_task",\n  "title": "the task title",\n  "column": "exact column name from the list above",\n  "priority": "LOW or MEDIUM or HIGH"\n}\n\nIf no column specified, default to the first column.`,
          300
        )
        if (result?.title) {
          const col = KANBAN_COLS.find(c => c.toLowerCase() === (result.column || '').toLowerCase()) || KANBAN_COLS[0]
          const newTask = {
            id: 'ai-' + uid(), title: result.title,
            priority: (result.priority || 'MEDIUM').toUpperCase(),
            assignedName: null, assignedRole: '',
            column: col, source: 'ai-chat',
            subtasks: [], description: '', estimatedDays: 1,
          }
          setKanban(prev => ({
            tasks: [...(prev?.tasks || []), newTask],
            projectTimeline: prev?.projectTimeline || '',
            unassignedTasks: prev?.unassignedTasks || [],
            missingRoles: prev?.missingRoles || [],
          }))
          if (phase !== 'kanban') setPhase('kanban')
          setLoading(false)
          return
        }
      }

      // Intent: move a task
      if (lowerMsg.includes('move') || lowerMsg.includes('mark') || lowerMsg.includes('complete') || lowerMsg.includes('finish')) {
        const result = await callJSON(
          'You are a project management assistant. Extract move task details. Return ONLY JSON.',
          `User message: "${msg}"\nCurrent tasks: ${JSON.stringify((kanban?.tasks || []).map(t => ({ id: t.id, title: t.title, column: t.column })))}\nColumns: ${JSON.stringify(KANBAN_COLS)}\n\nReturn:\n{\n  "action": "move_task",\n  "taskTitle": "partial task title to match",\n  "toColumn": "exact column name from columns list"\n}`,
          300
        )
        if (result?.taskTitle && result?.toColumn) {
          const task = kanban?.tasks?.find(t => t.title.toLowerCase().includes(result.taskTitle.toLowerCase()))
          const col = KANBAN_COLS.find(c => c.toLowerCase() === result.toColumn.toLowerCase()) || result.toColumn
          if (task && col) {
            setKanban(prev => ({ ...prev, tasks: prev.tasks.map(t => t.id === task.id ? { ...t, column: col } : t) }))
            setLoading(false)
            return
          }
        }
      }

      // Intent: delete a task
      if (lowerMsg.includes('delete') || lowerMsg.includes('remove')) {
        const result = await callJSON(
          'Extract delete task info. Return ONLY JSON.',
          `Message: "${msg}"\nTasks: ${JSON.stringify((kanban?.tasks || []).map(t => ({ id: t.id, title: t.title })))}\nReturn: {"action":"delete_task","taskTitle":"title to match"}`,
          200
        )
        if (result?.taskTitle) {
          const task = kanban?.tasks?.find(t => t.title.toLowerCase().includes(result.taskTitle.toLowerCase()))
          if (task) {
            setKanban(prev => ({ ...prev, tasks: prev.tasks.filter(t => t.id !== task.id) }))
            setLoading(false)
            return
          }
        }
      }

      // Intent: generate full board or long brief
      if (!kanban?.tasks?.length || lowerMsg.includes('generate') || lowerMsg.includes('board') || lowerMsg.includes('project') || msg.length > 100) {
        setLoading(false)
        await handleAnalyseBrief(msg)
        return
      }

      // Fallback: follow-up on existing board
      setLoading(false)
      await handleFollowUpMessage(msg)

    } catch (e) {
      console.error('[chat] error:', e)
      setLoading(false)
      addMessage('ai', 'Something went wrong. Try again.')
    }
  }

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

  function AddTaskModal({ open, onClose, onSave, teamMembers: modalTeamMembers, initialColumn, defaultData }) {
    const [form, setForm] = useState({
      title: '', description: '', assignees: [], dueDate: '', priority: 'MEDIUM',
      column: initialColumn || KANBAN_COLS[0],
      ...(defaultData || {}),
    })
    const [assigneeQuery, setAssigneeQuery] = useState('')
    const [showSuggestions, setShowSuggestions] = useState(false)

    if (!open) return null

    const namedMembers = (modalTeamMembers || []).filter(m => m.name?.trim())
    const filteredSuggestions = namedMembers.filter(m =>
      m.name.toLowerCase().includes(assigneeQuery.toLowerCase()) && !form.assignees.includes(m.name)
    )

    return (
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <div onClick={e => e.stopPropagation()} style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 18, width: '100%', maxWidth: 520, maxHeight: '85vh', overflowY: 'auto', padding: 24 }}>

          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <div style={{ fontFamily: "'Urbanist',sans-serif", fontWeight: 800, fontSize: 18, color: 'var(--color-text)', letterSpacing: '-0.01em' }}>Add Task</div>
            <button onClick={(e) => { e.stopPropagation(); onClose() }} style={{ width: 30, height: 30, borderRadius: 8, background: 'var(--color-surface)', border: '1px solid var(--color-border)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <XMarkIcon style={{ width: 14, height: 14, color: 'var(--color-text-muted)' }} />
            </button>
          </div>

          {/* Title */}
          <div style={{ marginBottom: 20 }}>
            <input
              autoFocus
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder="Task title"
              onFocus={e => { e.currentTarget.style.borderBottomColor = 'var(--color-text)' }}
              onBlur={e => { e.currentTarget.style.borderBottomColor = 'var(--color-border)' }}
              style={{
                width: '100%', background: 'transparent', border: 'none',
                borderBottom: '1px solid var(--color-border)', borderRadius: 0,
                padding: '8px 0', fontFamily: "'Urbanist',sans-serif",
                fontSize: 16, fontWeight: 600, color: 'var(--color-text)',
                outline: 'none', boxSizing: 'border-box',
                transition: 'border-bottom-color 0.15s',
              }}
            />
          </div>

          {/* Description */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontFamily: "'DM Mono',monospace", fontSize: 10, color: 'var(--color-text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>Description</label>
            <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Add more details..." rows={3} style={{ width: '100%', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 10, padding: '10px 14px', fontFamily: "'Urbanist',sans-serif", fontSize: 13, color: 'var(--color-text)', outline: 'none', resize: 'vertical', boxSizing: 'border-box', lineHeight: 1.6 }} />
          </div>

          {/* Assignees */}
          <div style={{ marginBottom: 16, position: 'relative' }}>
            <label style={{ display: 'block', fontFamily: "'DM Mono',monospace", fontSize: 10, color: 'var(--color-text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>Assignees</label>
            {form.assignees.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                {form.assignees.map((a, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 100, padding: '3px 10px 3px 8px' }}>
                    <div style={{ width: 20, height: 20, borderRadius: '50%', background: 'var(--color-text)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Urbanist',sans-serif", fontWeight: 700, fontSize: 9, color: 'var(--color-bg)', flexShrink: 0 }}>{a[0]?.toUpperCase()}</div>
                    <span style={{ fontFamily: "'Urbanist',sans-serif", fontSize: 12, color: 'var(--color-text)' }}>{a}</span>
                    <button onClick={() => setForm(f => ({ ...f, assignees: f.assignees.filter((_, j) => j !== i) }))} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', color: 'var(--color-text-muted)' }}>
                      <XMarkIcon style={{ width: 10, height: 10 }} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 10, padding: '8px 12px', gap: 6 }}>
              <UserIcon style={{ width: 14, height: 14, color: 'var(--color-text-muted)', flexShrink: 0 }} />
              <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 13, color: 'var(--color-text-muted)' }}>@</span>
              <input value={assigneeQuery} onChange={e => { setAssigneeQuery(e.target.value); setShowSuggestions(true) }} onFocus={() => setShowSuggestions(true)} onBlur={() => setTimeout(() => setShowSuggestions(false), 150)} placeholder="Type name to assign..." style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontFamily: "'Urbanist',sans-serif", fontSize: 13, color: 'var(--color-text)' }} />
            </div>
            {showSuggestions && filteredSuggestions.length > 0 && (
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--color-card)', border: '1px solid var(--color-border)', borderRadius: 10, zIndex: 10, overflow: 'hidden', boxShadow: '0 4px 16px rgba(0,0,0,0.1)' }}>
                {filteredSuggestions.map((m, i) => (
                  <div key={i} onMouseDown={() => { setForm(f => ({ ...f, assignees: [...f.assignees, m.name] })); setAssigneeQuery(''); setShowSuggestions(false) }}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', cursor: 'pointer', borderBottom: i < filteredSuggestions.length - 1 ? '1px solid var(--color-border)' : 'none' }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-surface)' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                  >
                    <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--color-text)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Urbanist',sans-serif", fontWeight: 700, fontSize: 11, color: 'var(--color-bg)' }}>{m.name[0]?.toUpperCase()}</div>
                    <div>
                      <div style={{ fontFamily: "'Urbanist',sans-serif", fontWeight: 600, fontSize: 13, color: 'var(--color-text)' }}>{m.name}</div>
                      {m.role && <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 10, color: 'var(--color-text-muted)' }}>{m.role}</div>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Due Date + Priority */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
            <div>
              <label style={{ display: 'block', fontFamily: "'DM Mono',monospace", fontSize: 10, color: 'var(--color-text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>Due Date</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 10, padding: '8px 12px' }}>
                <CalendarIcon style={{ width: 14, height: 14, color: 'var(--color-text-muted)', flexShrink: 0 }} />
                <input type="date" value={form.dueDate} onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))} style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontFamily: "'Urbanist',sans-serif", fontSize: 13, color: form.dueDate ? 'var(--color-text)' : 'var(--color-text-muted)', cursor: 'pointer' }} />
              </div>
            </div>
            <div>
              <label style={{ display: 'block', fontFamily: "'DM Mono',monospace", fontSize: 10, color: 'var(--color-text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>Priority</label>
              <div style={{ display: 'flex', gap: 6 }}>
                {[{ id: 'HIGH', color: '#EF4444' }, { id: 'MEDIUM', color: '#F59E0B' }, { id: 'LOW', color: '#6B7280' }].map(p => (
                  <button key={p.id} onClick={() => setForm(f => ({ ...f, priority: p.id }))} style={{ flex: 1, padding: '8px 4px', borderRadius: 8, border: form.priority === p.id ? '1.5px solid ' + p.color : '1px solid var(--color-border)', background: form.priority === p.id ? p.color + '15' : 'var(--color-surface)', cursor: 'pointer', fontFamily: "'Urbanist',sans-serif", fontSize: 11, fontWeight: 600, color: form.priority === p.id ? p.color : 'var(--color-text-muted)', transition: 'all 0.15s' }}>
                    {p.id[0] + p.id.slice(1).toLowerCase()}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button onClick={(e) => { e.stopPropagation(); onClose() }} style={{ padding: '9px 20px', background: 'transparent', border: '1px solid var(--color-border)', borderRadius: 10, fontFamily: "'Urbanist',sans-serif", fontSize: 13, fontWeight: 600, color: 'var(--color-text-muted)', cursor: 'pointer' }}>Cancel</button>
            <button onClick={() => { if (!form.title.trim()) return; onSave(form); onClose() }} disabled={!form.title.trim()} style={{ padding: '9px 24px', background: form.title.trim() ? 'var(--color-text)' : 'var(--color-border)', border: 'none', borderRadius: 10, fontFamily: "'Urbanist',sans-serif", fontSize: 13, fontWeight: 700, color: 'var(--color-bg)', cursor: form.title.trim() ? 'pointer' : 'default', transition: 'background 0.15s' }}>Add Task</button>
          </div>
        </div>
      </div>
    )
  }

  // ── TableView ─────────────────────────────────────────────────────────────

  function TableView({ tasks, customCols: cols }) {
    if (!tasks?.length) {
      return (
        <div style={{ padding: 40, textAlign: 'center', fontFamily: "'Urbanist',sans-serif", fontSize: 14, color: 'var(--color-text-muted)' }}>
          No tasks yet. Add tasks to see them here.
        </div>
      )
    }
    const COLS = [
      { key: 'title', label: 'Task', width: '35%' },
      { key: 'assignee', label: 'Assignee', width: '15%' },
      { key: 'dueDate', label: 'Due Date', width: '15%' },
      { key: 'priority', label: 'Priority', width: '12%' },
      { key: 'column', label: 'Status', width: '15%' },
    ]
    return (
      <div style={{ width: '100%', overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: "'Urbanist',sans-serif" }}>
          <thead>
            <tr style={{ borderBottom: '2px solid var(--color-border)', background: 'var(--color-surface)' }}>
              {COLS.map(col => (
                <th key={col.key} style={{ padding: '10px 14px', textAlign: 'left', fontFamily: "'DM Mono',monospace", fontSize: 10, fontWeight: 700, color: 'var(--color-text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', width: col.width, whiteSpace: 'nowrap' }}>{col.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tasks.map((task, i) => {
              const col = cols.find(c => c.id === task.column) || { label: task.column || '—', color: '#6B7280' }
              const priorityColor = task.priority === 'HIGH' ? '#EF4444' : task.priority === 'MEDIUM' ? '#F59E0B' : '#6B7280'
              return (
                <tr key={task.id || i}
                  style={{ borderBottom: '1px solid var(--color-border)', background: i % 2 === 0 ? 'var(--color-card)' : 'transparent', transition: 'background 0.1s', cursor: 'pointer' }}
                  onClick={() => setEditingTask(task)}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-surface)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = i % 2 === 0 ? 'var(--color-card)' : 'transparent' }}
                >
                  <td style={{ padding: '10px 14px', fontWeight: 500, fontSize: 13, color: 'var(--color-text)' }}>{task.title}</td>
                  <td style={{ padding: '10px 14px' }}>
                    {task.assignedName || task.assignee ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--color-text)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Urbanist',sans-serif", fontWeight: 700, fontSize: 10, color: 'var(--color-bg)', flexShrink: 0 }}>
                          {(task.assignedName || task.assignee || '')[0]?.toUpperCase()}
                        </div>
                        <span style={{ fontSize: 12, color: 'var(--color-text-soft)' }}>{task.assignedName || task.assignee}</span>
                      </div>
                    ) : (
                      <span style={{ fontSize: 12, color: 'var(--color-text-muted)', fontFamily: "'DM Mono',monospace" }}>—</span>
                    )}
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    {task.dueDate ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontFamily: "'DM Mono',monospace", fontSize: 11, color: new Date(task.dueDate) < new Date() ? '#EF4444' : 'var(--color-text-soft)' }}>
                        <CalendarIcon style={{ width: 12, height: 12, flexShrink: 0 }} />
                        {new Date(task.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </div>
                    ) : (
                      <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 11, color: 'var(--color-text-muted)' }}>—</span>
                    )}
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: priorityColor + '15', border: '1px solid ' + priorityColor + '30', borderRadius: 5, padding: '2px 8px' }}>
                      <div style={{ width: 5, height: 5, borderRadius: '50%', background: priorityColor }} />
                      <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 9, fontWeight: 700, color: priorityColor, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{task.priority || 'MEDIUM'}</span>
                    </div>
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: col.color + '15', border: '1px solid ' + col.color + '30', borderRadius: 5, padding: '2px 8px' }}>
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: col.color }} />
                      <span style={{ fontFamily: "'Urbanist',sans-serif", fontSize: 11, fontWeight: 600, color: col.color }}>{col.label}</span>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    )
  }

  // ── CalendarView ──────────────────────────────────────────────────────────

  function CalendarView({ tasks, customCols: cols }) {
    const today = new Date()
    const [currentMonth, setCurrentMonth] = useState(today.getMonth())
    const [currentYear, setCurrentYear] = useState(today.getFullYear())

    const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December']
    const dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate()
    const firstDayOfMonth = new Date(currentYear, currentMonth, 1).getDay()

    const tasksByDate = {}
    tasks.forEach(task => {
      if (!task.dueDate) return
      const dateKey = task.dueDate.slice(0, 10)
      if (!tasksByDate[dateKey]) tasksByDate[dateKey] = []
      tasksByDate[dateKey].push(task)
    })

    const cells = []
    for (let i = 0; i < firstDayOfMonth; i++) cells.push(null)
    for (let d = 1; d <= daysInMonth; d++) cells.push(d)

    function prevMonth() {
      if (currentMonth === 0) { setCurrentMonth(11); setCurrentYear(y => y - 1) }
      else setCurrentMonth(m => m - 1)
    }
    function nextMonth() {
      if (currentMonth === 11) { setCurrentMonth(0); setCurrentYear(y => y + 1) }
      else setCurrentMonth(m => m + 1)
    }

    const noDateCount = tasks.filter(t => !t.dueDate).length

    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '16px 20px', height: '100%', overflowY: 'auto', boxSizing: 'border-box' }}>
        {/* Month navigation */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <button onClick={prevMonth} style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--color-surface)', border: '1px solid var(--color-border)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ChevronLeftIcon style={{ width: 16, height: 16, color: 'var(--color-text)' }} />
          </button>
          <div style={{ fontFamily: "'Urbanist',sans-serif", fontWeight: 800, fontSize: 20, color: 'var(--color-text)', letterSpacing: '-0.02em' }}>
            {monthNames[currentMonth]} {currentYear}
          </div>
          <button onClick={nextMonth} style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--color-surface)', border: '1px solid var(--color-border)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ChevronRightIcon style={{ width: 16, height: 16, color: 'var(--color-text)' }} />
          </button>
        </div>

        {/* Day headers */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 1, marginBottom: 4 }}>
          {dayNames.map(d => (
            <div key={d} style={{ fontFamily: "'DM Mono',monospace", fontSize: 10, color: 'var(--color-text-muted)', textAlign: 'center', padding: '4px 0', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{d}</div>
          ))}
        </div>

        {/* Calendar grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, flex: 1 }}>
          {cells.map((day, i) => {
            if (day === null) return <div key={'e-' + i} />
            const dateKey = currentYear + '-' + String(currentMonth + 1).padStart(2, '0') + '-' + String(day).padStart(2, '0')
            const dayTasks = tasksByDate[dateKey] || []
            const isToday = day === today.getDate() && currentMonth === today.getMonth() && currentYear === today.getFullYear()
            return (
              <div key={day} style={{ minHeight: 80, background: isToday ? 'rgba(59,130,246,0.06)' : 'var(--color-card)', border: isToday ? '1.5px solid #3B82F6' : '1px solid var(--color-border)', borderRadius: 10, padding: '6px 8px', transition: 'all 0.1s' }}>
                <div style={{ fontFamily: "'Urbanist',sans-serif", fontWeight: isToday ? 800 : 500, fontSize: 13, color: isToday ? '#3B82F6' : 'var(--color-text)', marginBottom: 4 }}>{day}</div>
                {dayTasks.slice(0, 3).map((task, ti) => {
                  const col = cols?.find(c => c.id === task.column) || { color: '#6B7280' }
                  return (
                    <div key={ti} onClick={() => setEditingTask(task)} style={{ background: col.color + '20', border: '1px solid ' + col.color + '40', borderLeft: '2px solid ' + col.color, borderRadius: '0 4px 4px 0', padding: '2px 5px', marginBottom: 2, fontFamily: "'Urbanist',sans-serif", fontSize: 10, fontWeight: 600, color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer' }}>
                      {task.title}
                    </div>
                  )
                })}
                {dayTasks.length > 3 && (
                  <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 9, color: 'var(--color-text-muted)' }}>+{dayTasks.length - 3} more</div>
                )}
              </div>
            )
          })}
        </div>

        {/* No-due-date notice */}
        {noDateCount > 0 && (
          <div style={{ marginTop: 16, padding: '10px 14px', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 8, fontFamily: "'Urbanist',sans-serif", fontSize: 13, color: 'var(--color-text-muted)' }}>
            <ExclamationCircleIcon style={{ width: 14, height: 14, flexShrink: 0 }} />
            {noDateCount} task{noDateCount !== 1 ? 's' : ''} have no due date and won't appear on the calendar.
          </div>
        )}
      </div>
    )
  }

  // ── GanttView ─────────────────────────────────────────────────────────────

  function GanttView({ tasks, customCols: cols }) {
    const today = new Date()
    const [startDate] = useState(() => {
      const d = new Date()
      d.setDate(d.getDate() - 7)
      d.setHours(0, 0, 0, 0)
      return d
    })

    const DAYS = 56
    const DAY_WIDTH = 32

    const days = []
    for (let i = 0; i < DAYS; i++) {
      const d = new Date(startDate)
      d.setDate(d.getDate() + i)
      days.push(d)
    }

    const ganttTasks = tasks.filter(t => t.dueDate)

    function dayIndex(dateStr) {
      const d = new Date(dateStr)
      d.setHours(0, 0, 0, 0)
      return Math.floor((d - startDate) / (1000 * 60 * 60 * 24))
    }

    const todayIndex = dayIndex(today.toISOString().slice(0, 10))

    if (!ganttTasks.length) {
      return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 40, textAlign: 'center' }}>
          <ChartBarIcon style={{ width: 32, height: 32, color: 'var(--color-text-muted)' }} />
          <div style={{ fontFamily: "'Urbanist',sans-serif", fontWeight: 700, fontSize: 16, color: 'var(--color-text)', marginBottom: 4 }}>No tasks with due dates</div>
          <div style={{ fontFamily: "'Urbanist',sans-serif", fontSize: 13, color: 'var(--color-text-muted)', maxWidth: 280, lineHeight: 1.6 }}>Add due dates to your tasks to see them on the Gantt chart.</div>
        </div>
      )
    }

    return (
      <div style={{ flex: 1, display: 'flex', overflowX: 'auto', overflowY: 'auto' }}>
        <div style={{ minWidth: 'max-content' }}>
          {/* Header row */}
          <div style={{ display: 'flex', position: 'sticky', top: 0, zIndex: 10, background: 'var(--color-bg)', borderBottom: '2px solid var(--color-border)' }}>
            <div style={{ width: 200, flexShrink: 0, padding: '8px 14px', borderRight: '1px solid var(--color-border)', fontFamily: "'DM Mono',monospace", fontSize: 10, fontWeight: 700, color: 'var(--color-text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase', background: 'var(--color-bg)' }}>Task</div>
            <div style={{ display: 'flex' }}>
              {days.map((d, i) => {
                const isToday = d.toDateString() === today.toDateString()
                const isWeekend = d.getDay() === 0 || d.getDay() === 6
                const isFirstOfWeek = d.getDay() === 1
                return (
                  <div key={i} style={{ width: DAY_WIDTH, flexShrink: 0, padding: '4px 2px', textAlign: 'center', background: isToday ? 'rgba(59,130,246,0.1)' : isWeekend ? 'var(--color-surface)' : 'transparent', borderLeft: isFirstOfWeek ? '1px solid var(--color-border)' : 'none' }}>
                    {(isFirstOfWeek || d.getDate() === 1 || i === 0) && (
                      <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 9, color: 'var(--color-text-muted)', marginBottom: 1 }}>
                        {d.toLocaleDateString('en', { month: 'short' })}
                      </div>
                    )}
                    <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 10, fontWeight: isToday ? 700 : 400, color: isToday ? '#3B82F6' : 'var(--color-text-muted)' }}>{d.getDate()}</div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Task rows */}
          {ganttTasks.map((task, ti) => {
            const col = cols?.find(c => c.id === task.column) || { color: '#6B7280', label: task.column || '—' }
            const dueIdx = dayIndex(task.dueDate)
            const startIdx = Math.max(0, dueIdx - 2)
            const endIdx = Math.min(DAYS - 1, dueIdx)
            const barWidth = Math.max(DAY_WIDTH, (endIdx - startIdx + 1) * DAY_WIDTH)
            const barLeft = startIdx * DAY_WIDTH
            const isOverdue = new Date(task.dueDate) < today && task.column !== 'done'

            return (
              <div key={task.id || ti} style={{ display: 'flex', borderBottom: '1px solid var(--color-border)', height: 44, position: 'relative' }}>
                {/* Task name (sticky) */}
                <div style={{ width: 200, flexShrink: 0, display: 'flex', alignItems: 'center', padding: '0 14px', gap: 7, borderRight: '1px solid var(--color-border)', background: 'var(--color-bg)', position: 'sticky', left: 0, zIndex: 5 }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: col.color, flexShrink: 0 }} />
                  <span style={{ fontFamily: "'Urbanist',sans-serif", fontSize: 12, fontWeight: 500, color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.title}</span>
                </div>

                {/* Timeline */}
                <div style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center', background: ti % 2 === 0 ? 'transparent' : 'var(--color-surface)', minWidth: DAYS * DAY_WIDTH }}>
                  {/* Weekend shading */}
                  {days.map((d, i) => (d.getDay() === 0 || d.getDay() === 6) ? (
                    <div key={i} style={{ position: 'absolute', left: i * DAY_WIDTH, top: 0, bottom: 0, width: DAY_WIDTH, background: 'rgba(0,0,0,0.03)', pointerEvents: 'none' }} />
                  ) : null)}

                  {/* Today line */}
                  {todayIndex >= 0 && todayIndex < DAYS && (
                    <div style={{ position: 'absolute', left: todayIndex * DAY_WIDTH + DAY_WIDTH / 2, top: 0, bottom: 0, width: 2, background: '#3B82F6', opacity: 0.5, pointerEvents: 'none', zIndex: 3 }} />
                  )}

                  {/* Week grid lines */}
                  {days.map((d, i) => d.getDay() === 1 ? (
                    <div key={i} style={{ position: 'absolute', left: i * DAY_WIDTH, top: 0, bottom: 0, width: 1, background: 'var(--color-border)', pointerEvents: 'none' }} />
                  ) : null)}

                  {/* Task bar */}
                  {dueIdx >= 0 && startIdx < DAYS && (
                    <div
                      title={task.title + ' · Due: ' + new Date(task.dueDate).toLocaleDateString()}
                      onClick={() => setEditingTask(task)}
                      style={{ position: 'absolute', left: barLeft, width: barWidth, height: 24, borderRadius: 6, background: isOverdue ? '#EF4444' : col.color, opacity: 0.85, display: 'flex', alignItems: 'center', paddingLeft: 8, cursor: 'pointer', zIndex: 4, boxShadow: '0 1px 4px rgba(0,0,0,0.15)' }}
                    >
                      {barWidth > 48 && (
                        <span style={{ fontFamily: "'Urbanist',sans-serif", fontSize: 10, fontWeight: 700, color: 'white', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: barWidth - 16 }}>{task.title}</span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden',
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
      <AddTaskModal
        open={showAddTaskModal}
        onClose={() => { setShowAddTaskModal(false); setAddTaskData({ title: '', description: '', assignees: [], dueDate: '', priority: 'MEDIUM', column: KANBAN_COLS[0] }) }}
        onSave={(formData) => {
          const newTask = {
            id: 'manual-' + uid(), title: formData.title,
            description: formData.description,
            assignees: formData.assignees,
            assignedName: formData.assignees[0] || null,
            assignedRole: '', dueDate: formData.dueDate,
            priority: formData.priority, column: formData.column,
            source: 'manual', subtasks: [], estimatedDays: 1,
          }
          setKanban(prev => ({
            ...(prev || {}),
            tasks: [...(prev?.tasks || []), newTask],
            projectTimeline: prev?.projectTimeline || '',
            unassignedTasks: prev?.unassignedTasks || [],
            missingRoles: prev?.missingRoles || [],
          }))
          if (phase !== 'kanban') setPhase('kanban')
        }}
        teamMembers={teamMembers}
        initialColumn={addTaskData.column || KANBAN_COLS[0]}
        defaultData={addTaskData}
      />
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

      {/* ── Top bar ── */}
      <div style={{
        height: 48, borderBottom: '1px solid var(--color-border)',
        display: 'flex', alignItems: 'center',
        padding: '0 20px', gap: 4, flexShrink: 0,
        background: 'var(--color-bg)',
      }}>
        {[
          { id: 'board', step: 1, label: 'Board', isDone: !!kanban?.tasks?.length, isLocked: false },
          { id: 'team', step: 2, label: 'Team', isDone: teamMembers.some(m => m.name?.trim()), isLocked: false },
        ].map(tab => {
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => !tab.isLocked && setActiveTab(tab.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 7,
                padding: '6px 14px', borderRadius: 8,
                border: isActive ? '1px solid var(--color-border)' : '1px solid transparent',
                background: isActive ? 'var(--color-card)' : 'transparent',
                cursor: tab.isLocked ? 'not-allowed' : 'pointer',
                opacity: tab.isLocked ? 0.45 : 1,
                transition: 'all 0.15s',
              }}
            >
              <div style={{
                width: 18, height: 18, borderRadius: '50%',
                background: tab.isDone ? '#16a34a' : isActive ? 'var(--color-text)' : 'var(--color-border)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0, transition: 'background 0.2s',
              }}>
                {tab.isDone ? (
                  <CheckIcon style={{ width: 10, height: 10, color: 'white' }} />
                ) : (
                  <span style={{
                    fontFamily: "'DM Mono',monospace", fontSize: 9, fontWeight: 700,
                    color: isActive ? 'var(--color-bg)' : 'var(--color-text-muted)',
                  }}>{tab.step}</span>
                )}
              </div>
              <span style={{
                fontFamily: "'Urbanist',sans-serif",
                fontWeight: isActive ? 700 : 500, fontSize: 13,
                color: isActive ? 'var(--color-text)' : 'var(--color-text-muted)',
              }}>
                {tab.label}
              </span>
            </button>
          )
        })}

        <div style={{ flex: 1 }} />

        {/* Project switcher */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <select
              value={activeProjectId}
              onChange={e => handleSwitchProject(e.target.value)}
              style={{
                appearance: 'none', background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                borderRadius: 8, padding: '6px 32px 6px 12px',
                fontFamily: "'Urbanist',sans-serif", fontWeight: 600, fontSize: 12,
                color: 'var(--color-text)', cursor: 'pointer', outline: 'none',
                maxWidth: 180,
              }}
            >
              {projects.map(p => (
                <option key={p.id} value={p.id}>{p.title}</option>
              ))}
            </select>
            <ChevronDownIcon style={{
              width: 12, height: 12, color: 'var(--color-text-muted)',
              position: 'absolute', right: 10, pointerEvents: 'none',
            }} />
          </div>
          <button
            onClick={handleNewProject}
            style={{
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 8, padding: '6px 12px',
              fontFamily: "'Urbanist',sans-serif", fontWeight: 700, fontSize: 12,
              color: 'var(--color-text-soft)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 5,
            }}
          >
            <span style={{ fontSize: 14 }}>+</span>
            New Project
          </button>
        </div>
      </div>

      {/* ── Main content ── */}
      <div style={{
        flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column',
        transition: 'margin-right 0.3s ease',
        marginRight: chatOpen ? 360 : 0,
      }}>

        {/* ── Team tab ── */}
        {activeTab === 'team' && (
          <div style={{ flex: 1, overflowY: 'auto' }}>
            <div style={{ maxWidth: 700, margin: '0 auto', padding: 24 }}>
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
                >+ Invite Member</button>
              </div>

              {teamMembers.length > 0 ? (
                teamMembers.map(member => {
                  const meta = ROLE_META[member.role] || { color: 'var(--color-accent)', icon: '◈' }
                  const initial = (member.name || member.role || '?')[0].toUpperCase()
                  return (
                    <div key={member.id} style={{
                      display: 'flex', gap: 12, alignItems: 'center',
                      background: 'var(--color-card)', border: '1px solid var(--color-border)',
                      borderRadius: 12, padding: '14px 16px', marginBottom: 8,
                    }}>
                      <div style={{
                        width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                        background: meta.color + '22', border: '1px solid ' + meta.color + '70',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontFamily: "'Urbanist', sans-serif", fontWeight: 700, fontSize: 14,
                        color: meta.color,
                      }}>{initial}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontFamily: "'Urbanist', sans-serif", fontWeight: 700, fontSize: 13, color: 'var(--color-text)' }}>
                          {member.name || member.role}
                        </div>
                        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'var(--color-text-soft)' }}>
                          {member.role}
                        </div>
                      </div>
                      <Badge color={meta.color} size="sm">{meta.icon} {member.role}</Badge>
                    </div>
                  )
                })
              ) : (
                <div style={{
                  fontFamily: "'DM Mono', monospace", fontSize: 12,
                  color: 'var(--color-text-muted)', textAlign: 'center', padding: '32px 0',
                }}>No team members yet. Use the chat to build your team.</div>
              )}

              {invites.filter(inv => inv.status === 'pending').length > 0 && (
                <div style={{ marginTop: 20 }}>
                  <div style={{
                    fontFamily: "'Urbanist', sans-serif", fontWeight: 700,
                    fontSize: 13, color: 'var(--color-text)', marginBottom: 12,
                  }}>Pending Invites</div>
                  {invites.filter(inv => inv.status === 'pending').map(invite => {
                    const meta = ROLE_META[invite.job_role] || {}
                    const initial = (invite.invitee_name || invite.invitee_email || '?')[0].toUpperCase()
                    return (
                      <div key={invite.id} style={{
                        display: 'flex', gap: 12, alignItems: 'center',
                        background: 'var(--color-card)', border: '1px solid var(--color-border)',
                        borderRadius: 12, padding: '14px 16px', marginBottom: 8,
                      }}>
                        <div style={{
                          width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                          background: (meta.color || 'var(--color-accent)') + '22',
                          border: '1px solid ' + (meta.color || 'var(--color-accent)') + '70',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontFamily: "'Urbanist', sans-serif", fontWeight: 700, fontSize: 14,
                          color: meta.color || 'var(--color-accent)',
                        }}>{initial}</div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontFamily: "'Urbanist', sans-serif", fontWeight: 700, fontSize: 13, color: 'var(--color-text)' }}>
                            {invite.invitee_name}
                          </div>
                          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'var(--color-text-muted)' }}>
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

        {/* ── ClickUp-style toolbar ── */}
        {(() => {
          const totalTasks = kanban?.tasks?.length || 0
          const doneCol = customCols.find(c => c.label === 'Done') || customCols[customCols.length - 1]
          const doneTasks = (kanban?.tasks || []).filter(t => t.column === (doneCol?.id || 'Done')).length
          const donePercent = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0
          return (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 20px', height: 44, borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg)', flexShrink: 0 }}>
              {/* Left: task count + progress */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 120 }}>
                <span style={{ fontFamily: "'Urbanist',sans-serif", fontSize: 13, fontWeight: 500, color: 'var(--color-text-muted)' }}>
                  {totalTasks} task{totalTasks !== 1 ? 's' : ''}
                </span>
                {totalTasks > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 60, height: 3, background: 'var(--color-border)', borderRadius: 2 }}>
                      <div style={{ width: donePercent + '%', height: '100%', background: '#16a34a', borderRadius: 2, transition: 'width 0.4s ease' }} />
                    </div>
                    <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 10, color: 'var(--color-text-muted)' }}>{donePercent}%</span>
                  </div>
                )}
              </div>
              {/* Centre: view tabs */}
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
                {[
                  { id: 'board', icon: Squares2X2Icon, label: 'Board' },
                  { id: 'list', icon: ListBulletIcon, label: 'List' },
                  { id: 'table', icon: TableCellsIcon, label: 'Table' },
                  { id: 'calendar', icon: CalendarDaysIcon, label: 'Calendar' },
                  { id: 'gantt', icon: ChartBarIcon, label: 'Gantt' },
                ].map(v => {
                  const isActive = viewMode === v.id
                  return (
                    <button key={v.id} onClick={() => setViewMode(v.id)}
                      style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 7, border: 'none', background: isActive ? 'var(--color-surface)' : 'transparent', cursor: 'pointer', fontFamily: "'Urbanist',sans-serif", fontSize: 13, fontWeight: isActive ? 700 : 500, color: isActive ? 'var(--color-text)' : 'var(--color-text-muted)', transition: 'all 0.15s', boxShadow: isActive ? '0 1px 3px rgba(0,0,0,0.08)' : 'none' }}
                      onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'var(--color-surface)' }}
                      onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent' }}
                    >
                      <v.icon style={{ width: 13, height: 13 }} />
                      {v.label}
                    </button>
                  )
                })}
              </div>
              {/* Right: Team + Add Task */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 120, justifyContent: 'flex-end' }}>
                <button onClick={() => setActiveTab('team')}
                  style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', background: activeTab === 'team' ? 'var(--color-surface)' : 'transparent', border: '1px solid var(--color-border)', borderRadius: 8, cursor: 'pointer', fontFamily: "'Urbanist',sans-serif", fontSize: 13, fontWeight: 600, color: 'var(--color-text)' }}>
                  <UserGroupIcon style={{ width: 13, height: 13 }} />
                  Team
                </button>
                <button onClick={() => { setAddTaskData({ title: '', description: '', assignees: [], dueDate: '', priority: 'MEDIUM', column: customCols[0]?.id || KANBAN_COLS[0] }); setShowAddTaskModal(true) }}
                  style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 14px', background: 'var(--color-text)', color: 'var(--color-bg)', border: 'none', borderRadius: 8, cursor: 'pointer', fontFamily: "'Urbanist',sans-serif", fontSize: 13, fontWeight: 700 }}>
                  <PlusIcon style={{ width: 13, height: 13 }} />
                  Add Task
                </button>
              </div>
            </div>
          )
        })()}

        {/* List view */}
        {viewMode === 'list' && (
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 80px 100px 100px 60px', gap: 12, padding: '8px 16px', background: 'var(--color-surface)', borderRadius: 8, marginBottom: 10, fontSize: 10, fontFamily: "'DM Mono', monospace", color: 'var(--color-text-muted)', letterSpacing: '0.06em' }}>
              {['TASK', 'ASSIGNEE', 'PRIORITY', 'DUE DATE', 'STATUS', 'DAYS'].map(h => <div key={h}>{h}</div>)}
            </div>
            {customCols.map(col => {
              const colTasks = (kanban?.tasks || []).filter(t => t.column === col.id)
              if (!colTasks.length) return null
              const cc = col.color
              return (
                <div key={col.id} style={{ marginBottom: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px 6px' }}>
                    <div style={{ width: 7, height: 7, borderRadius: '50%', background: cc }} />
                    <span style={{ fontFamily: "'Urbanist', sans-serif", fontWeight: 600, fontSize: 12, color: 'var(--color-text)' }}>{col.label}</span>
                    <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'var(--color-text-muted)' }}>({colTasks.length})</span>
                  </div>
                  {colTasks.map(task => {
                    const meta = ROLE_META[task.assignedRole]
                    const roleColor = meta?.color || 'var(--color-text-muted)'
                    const pc = PRIORITY_COLORS[task.priority] || 'var(--color-text-muted)'
                    const dueSt = getDueDateStatus(task.dueDate, task.column)
                    const dueTxt = !task.dueDate ? '—' : dueSt === 'overdue' ? 'Overdue' : dueSt === 'today' ? 'Today' : formatDueDate(task.dueDate)
                    const dueColor = !task.dueDate ? 'var(--color-text-muted)' : dueSt === 'overdue' ? 'var(--color-red)' : dueSt === 'today' ? 'var(--color-amber)' : 'var(--color-text-soft)'
                    return (
                      <div key={task.id} onClick={() => setEditingTask(task)} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 80px 100px 100px 60px', gap: 12, padding: '10px 16px', background: 'var(--color-card)', border: '1px solid var(--color-border)', borderLeft: '3px solid ' + pc, borderRadius: 9, marginBottom: 4, cursor: 'pointer', transition: 'all 0.15s', alignItems: 'center' }}
                        onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-card-hover)'; e.currentTarget.style.borderLeftColor = pc }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'var(--color-card)'; e.currentTarget.style.borderColor = 'var(--color-border)'; e.currentTarget.style.borderLeftColor = pc }}
                      >
                        <div>
                          {task.blockedBy?.length > 0 && task.column !== col.id && <span style={{ fontSize: 9, fontFamily: "'DM Mono', monospace", color: 'var(--color-red)', marginRight: 6 }}>🔒</span>}
                          <span style={{ fontFamily: "'Urbanist', sans-serif", fontWeight: 600, fontSize: 12, color: 'var(--color-text)' }}>{task.title}</span>
                          {task.description && <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'var(--color-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2 }}>{task.description}</div>}
                        </div>
                        <div>
                          {task.assignedRole ? (
                            <div style={{ background: roleColor + '18', border: '1px solid ' + roleColor + '33', borderRadius: 5, padding: '2px 7px', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                              <span style={{ fontSize: 9 }}>{meta?.icon}</span>
                              <span style={{ fontSize: 9, fontFamily: "'DM Mono', monospace", color: roleColor }}>{task.assignedName || task.assignedRole}</span>
                            </div>
                          ) : <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'var(--color-text-muted)' }}>Unassigned</span>}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <div style={{ width: 6, height: 6, borderRadius: '50%', background: pc }} />
                          <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: pc }}>{task.priority}</span>
                        </div>
                        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: dueColor }}>{dueTxt}</div>
                        <div><div style={{ background: cc + '18', border: '1px solid ' + cc + '33', borderRadius: 5, padding: '2px 8px', display: 'inline-block', fontFamily: "'DM Mono', monospace", fontSize: 9, color: cc }}>{col.label}</div></div>
                        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'var(--color-text-muted)' }}>{task.estimatedDays}d</div>
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
        )}

        {/* Table view */}
        {viewMode === 'table' && (
          <div style={{ flex: 1, overflowY: 'auto' }}>
            <TableView
              tasks={kanban?.tasks || []}
              customCols={customCols}
              teamMembers={teamMembers}
              onUpdateTask={(id, updates) => {
                setKanban(prev => ({
                  ...prev,
                  tasks: prev.tasks.map(t => t.id === id ? { ...t, ...updates } : t),
                }))
              }}
            />
          </div>
        )}

        {/* Calendar view */}
        {viewMode === 'calendar' && (
          <CalendarView tasks={kanban?.tasks || []} customCols={customCols} />
        )}

        {/* Gantt view */}
        {viewMode === 'gantt' && (
          <GanttView tasks={kanban?.tasks || []} customCols={customCols} />
        )}

        {/* Kanban board */}
        {viewMode === 'board' && (
        <div style={{ flex: 1, overflowX: 'auto', overflowY: 'auto', padding: '16px 20px', background: 'var(--color-surface)' }}>
          <div style={{ display: 'flex', gap: 12, height: '100%', alignItems: 'flex-start', minWidth: 'max-content' }}>
            {customCols.map((col) => {
              const colTasks = (kanban?.tasks || []).filter(t => t.column === col.id)
              const isDropTarget = dragOverCol === col.id && draggedTaskId !== null
              const accentCol = col.color
              return (
                  <div key={col.id}
                    style={{ width: 260, flexShrink: 0, borderRadius: 12, transition: 'background 0.15s', background: isDropTarget ? accentCol + '0D' : 'rgba(0,0,0,0.03)', outline: isDropTarget ? '2px dashed ' + accentCol + '66' : 'none', outlineOffset: -2, padding: '12px 10px' }}
                    onDragOver={e => { e.preventDefault(); setDragOverCol(col.id) }}
                    onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setDragOverCol(null) }}
                    onDrop={e => { e.preventDefault(); const id = e.dataTransfer.getData('taskId'); if (id) moveTask(id, col.id); setDragOverCol(null); setDraggedTaskId(null) }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                      <div style={{ width: 7, height: 7, borderRadius: '50%', background: accentCol, flexShrink: 0 }} />
                      {editingColId === col.id ? (
                        <input
                          autoFocus
                          value={editingColLabel}
                          onChange={e => setEditingColLabel(e.target.value)}
                          onBlur={() => {
                            if (editingColLabel.trim()) saveCustomCols(customCols.map(c => c.id === col.id ? { ...c, label: editingColLabel } : c))
                            setEditingColId(null)
                          }}
                          onKeyDown={e => {
                            if (e.key === 'Enter') { if (editingColLabel.trim()) saveCustomCols(customCols.map(c => c.id === col.id ? { ...c, label: editingColLabel } : c)); setEditingColId(null) }
                            if (e.key === 'Escape') setEditingColId(null)
                          }}
                          style={{ background: 'transparent', border: 'none', borderBottom: '1.5px solid var(--color-text)', outline: 'none', fontFamily: "'Urbanist',sans-serif", fontWeight: 700, fontSize: 13, color: 'var(--color-text)', width: '80%', padding: '0 0 2px 0' }}
                        />
                      ) : (
                        <span
                          onDoubleClick={() => { setEditingColId(col.id); setEditingColLabel(col.label) }}
                          style={{ fontFamily: "'Urbanist', sans-serif", fontWeight: 700, fontSize: 13, color: 'var(--color-text)', cursor: 'text', userSelect: 'none' }}
                          title="Double-click to rename"
                        >{col.label}</span>
                      )}
                      <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'var(--color-text-muted)', marginLeft: 'auto' }}>{colTasks.length}</span>
                      {isDropTarget && <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: accentCol, animation: 'pulse 1s ease infinite' }}>DROP</span>}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minHeight: 60 }}>
                      {colTasks.map(task => <TaskCard key={task.id} task={task} col={col.id} />)}
                      {colTasks.length === 0 && !isDropTarget && (
                        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px 0' }}>
                          <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 11, color: 'var(--color-text-muted)', opacity: 0.5 }}>No tasks yet</div>
                        </div>
                      )}
                      {isDropTarget && colTasks.length === 0 && (
                        <div style={{ height: 60, border: '1.5px dashed ' + accentCol + '88', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'DM Mono', monospace", fontSize: 11, color: accentCol, marginBottom: 8 }}>Drop here</div>
                      )}
                      <button
                        onClick={() => { setAddTaskData({ title: '', description: '', assignees: [], dueDate: '', priority: 'MEDIUM', column: col.id }); setShowAddTaskModal(true) }}
                        style={{ width: '100%', marginTop: 8, padding: '7px 0', background: 'transparent', border: '1px dashed var(--color-border)', borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, cursor: 'pointer', transition: 'all 0.15s', fontFamily: "'Urbanist',sans-serif", fontSize: 12, color: 'var(--color-text-muted)', fontWeight: 500 }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--color-text-muted)'; e.currentTarget.style.color = 'var(--color-text)' }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--color-border)'; e.currentTarget.style.color = 'var(--color-text-muted)' }}
                      >
                        <PlusIcon style={{ width: 13, height: 13 }} />
                        Add task
                      </button>
                    </div>
                  </div>
              )
            })}
            {/* Add group button */}
            <div style={{ width: 240, flexShrink: 0 }}>
              <button
                onClick={() => {
                  const newCol = { id: 'col-' + uid(), label: 'New Group', color: '#8B5CF6' }
                  const updated = [...customCols, newCol]
                  saveCustomCols(updated)
                  setTimeout(() => { setEditingColId(newCol.id); setEditingColLabel('New Group') }, 50)
                }}
                style={{ width: '100%', padding: '10px 16px', background: 'transparent', border: '1.5px dashed var(--color-border)', borderRadius: 12, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontFamily: "'Urbanist',sans-serif", fontSize: 13, fontWeight: 600, color: 'var(--color-text-muted)', transition: 'all 0.15s' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--color-text-muted)'; e.currentTarget.style.color = 'var(--color-text)'; e.currentTarget.style.background = 'var(--color-surface)' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--color-border)'; e.currentTarget.style.color = 'var(--color-text-muted)'; e.currentTarget.style.background = 'transparent' }}
              >
                <PlusIcon style={{ width: 14, height: 14 }} />
                Add group
              </button>
            </div>
          </div>
        </div>
        )}

        {/* Bottom bar — only when unassigned tasks exist */}
        {kanban?.unassignedTasks?.length > 0 && (
          <div style={{ height: 68, borderTop: '1px solid var(--color-border)', background: 'var(--color-surface)', flexShrink: 0, display: 'flex', alignItems: 'center', padding: '0 20px', overflowX: 'auto', gap: 8 }}>
            <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'var(--color-text-muted)', flexShrink: 0, marginRight: 4 }}>UNASSIGNED:</span>
            {kanban.unassignedTasks.map((ut, i) => (
              <div key={i} style={{ background: 'var(--color-card)', border: '1px solid var(--color-amber)', borderRadius: 8, padding: '6px 12px', display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
                <span style={{ fontFamily: "'Urbanist', sans-serif", fontWeight: 600, fontSize: 11, color: 'var(--color-text)' }}>{ut.title || ut}</span>
                {ut.suggestedRole && <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'var(--color-amber)' }}>→ Need: {ut.suggestedRole}</span>}
              </div>
            ))}
          </div>
        )}

        </>)}
      </div>

      {/* ── Floating AI chat bubble ── */}
      <button
        onPointerDown={(e) => { e.preventDefault(); setChatOpen(prev => !prev); setUnreadCount(0) }}
        title={chatOpen ? 'Close AI chat' : 'Open AI chat'}
        style={{
          position: 'absolute', bottom: 24, right: chatOpen ? 376 : 24,
          width: 52, height: 52, borderRadius: '50%',
          background: 'var(--color-text)', border: 'none',
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 4px 20px rgba(0,0,0,0.2)', zIndex: 101,
          transition: 'right 0.3s ease',
        }}
      >
        <SparklesIcon style={{ width: 20, height: 20, color: 'var(--color-bg)' }} />
        {!chatOpen && unreadCount > 0 && (
          <div style={{
            position: 'absolute', top: -4, right: -4,
            width: 18, height: 18, borderRadius: '50%',
            background: '#dc2626', border: '2px solid var(--color-bg)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: "'DM Mono',monospace", fontSize: 9, fontWeight: 700, color: 'white',
          }}>
            {unreadCount > 9 ? '9+' : unreadCount}
          </div>
        )}
      </button>

      {/* ── Sliding chat panel ── */}
      <div style={{
        position: 'absolute', top: 0, right: 0,
        width: 360, height: '100%',
        display: 'flex', flexDirection: 'column',
        borderLeft: '1px solid var(--color-border)',
        background: 'var(--color-bg)',
        transform: chatOpen ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 0.3s ease',
        zIndex: 50,
        pointerEvents: chatOpen ? 'auto' : 'none',
        visibility: chatOpen ? 'visible' : 'hidden',
      }}>

        {/* Chat panel header */}
        <div style={{
          height: 52, flexShrink: 0, display: 'flex', alignItems: 'center',
          padding: '0 14px', gap: 8, borderBottom: '1px solid var(--color-border)',
          justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 26, height: 26, borderRadius: 7,
              background: 'var(--color-surface)', border: '1px solid var(--color-border)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <SparklesIcon style={{ width: 12, height: 12, color: 'var(--color-text)' }} />
            </div>
            <span style={{ fontFamily: "'Urbanist',sans-serif", fontWeight: 700, fontSize: 13, color: 'var(--color-text)' }}>AI Assistant</span>
          </div>
          <button
            onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); setChatOpen(false) }}
            style={{
              width: 28, height: 28, borderRadius: 7,
              background: 'var(--color-surface)', border: '1px solid var(--color-border)',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              pointerEvents: 'all', zIndex: 999, position: 'relative',
            }}
          >
            <XMarkIcon style={{ width: 14, height: 14, color: 'var(--color-text-muted)' }} />
          </button>
        </div>

        {/* Messages */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 14px 0' }}>
          {messages.length === 0 && !loading && (
            <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: '40px 20px', textAlign: 'center' }}>
              <div style={{ width: 40, height: 40, borderRadius: 12, background: 'var(--color-surface)', border: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <SparklesIcon style={{ width: 18, height: 18, color: 'var(--color-text-muted)' }} />
              </div>
              <div>
                <div style={{ fontFamily: "'Urbanist',sans-serif", fontWeight: 700, fontSize: 15, color: 'var(--color-text)', marginBottom: 6, letterSpacing: '-0.01em' }}>What do you need?</div>
                <div style={{ fontFamily: "'Urbanist',sans-serif", fontSize: 13, color: 'var(--color-text-muted)', lineHeight: 1.65, maxWidth: 240 }}>Generate a board, add tasks, move cards, or ask anything about your project.</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%', maxWidth: 260, marginTop: 8 }}>
                {['Generate board from brief', 'Add task: [task name]', 'Move [task] to done'].map((suggestion, i) => (
                  <button key={i}
                    onPointerDown={() => setInput(suggestion === 'Generate board from brief' ? '' : suggestion.replace('[task name]', '').replace('[task]', ''))}
                    style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 9, padding: '8px 12px', fontFamily: "'Urbanist',sans-serif", fontSize: 12, color: 'var(--color-text-soft)', cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s' }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--color-text-muted)'; e.currentTarget.style.color = 'var(--color-text)' }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--color-border)'; e.currentTarget.style.color = 'var(--color-text-soft)' }}
                  >{suggestion}</button>
                ))}
              </div>
            </div>
          )}
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
              color: 'var(--color-text-muted)', marginBottom: 8, letterSpacing: '0.06em',
            }}>SELECT ROLES &amp; ADD NAMES</div>
            {suggestedRoles.length > 0 && (
              <>
                <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: 'var(--color-accent)', letterSpacing: '0.08em', marginBottom: 6 }}>AI SUGGESTED</div>
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
                        {isSelected ? <span style={{ fontSize: 10, color: meta.color }}>✓</span> : <span style={{ fontSize: 9, opacity: 0.7, color: meta.color }}>✦</span>}
                      </button>
                    )
                  })}
                </div>
                <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: 'var(--color-text-muted)', letterSpacing: '0.08em', marginBottom: 6 }}>OTHER ROLES</div>
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
              <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'var(--color-text-muted)', marginTop: 6 }}>
                {teamMembers.length} member{teamMembers.length !== 1 ? 's' : ''} selected
              </div>
            )}
            {teamMembers.length > 0 && (
              <>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                  {teamMembers.map(m => {
                    const meta = ROLE_META[m.role] || { color: 'var(--color-text-soft)', icon: '◈' }
                    return (
                      <div key={m.id} style={{
                        display: 'flex', alignItems: 'center', gap: 5,
                        background: 'var(--color-card)', border: '1px solid ' + meta.color + '44',
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
                >{loading ? 'Generating...' : 'Generate Kanban Board →'}</button>
              </>
            )}
          </div>
        )}

        {/* File indicator */}
        {fileName && (
          <div style={{ padding: '0 14px 8px' }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              background: 'var(--color-accent-bg)', border: '1px solid var(--color-accent-border)',
              borderRadius: 7, padding: '5px 10px',
              fontSize: 11, fontFamily: "'DM Mono', monospace", color: 'var(--color-accent)',
            }}>
              <span>📄 {fileName}</span>
              <button onClick={() => setFileName(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-accent)', fontSize: 13, padding: '0 0 0 6px' }}>×</button>
            </div>
          </div>
        )}

        {/* Chat input */}
        {(phase === 'brief' || phase === 'kanban') && (
          <div style={{ padding: '10px 14px 14px', borderTop: '1px solid var(--color-border)' }}>
            <input ref={fileInputRef} type="file" accept=".txt,.pdf,.doc,.docx,.md" style={{ display: 'none' }} onChange={e => handleFileUpload(e.target.files[0])} />
            <div style={{
              display: 'flex', alignItems: 'flex-end', gap: 8,
              background: 'var(--color-surface)', borderRadius: 12,
              padding: '8px 8px 8px 12px', border: '1px solid var(--color-border)',
            }}>
              <textarea
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleChatSend() } }}
                onFocus={e => { e.currentTarget.parentElement.style.borderColor = 'var(--color-accent)' }}
                onBlur={e => { e.currentTarget.parentElement.style.borderColor = 'var(--color-border)' }}
                placeholder="Ask anything or describe a task..."
                rows={1}
                style={{
                  flex: 1, background: 'transparent', border: 'none', outline: 'none',
                  color: 'var(--color-text)', fontFamily: "'DM Mono', monospace", fontSize: 12,
                  resize: 'none', lineHeight: 1.6, maxHeight: 100, minHeight: 20,
                  boxSizing: 'border-box', padding: 0,
                }}
              />
              <button
                onClick={handleChatSend}
                disabled={!input.trim() || loading}
                style={{
                  width: 32, height: 32, background: !input.trim() || loading ? 'var(--color-border)' : 'var(--color-text)',
                  border: 'none', borderRadius: 9, cursor: !input.trim() || loading ? 'default' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  transition: 'background 0.15s',
                }}
              >
                <ArrowUpIcon style={{ width: 16, height: 16, color: !input.trim() || loading ? 'var(--color-text-muted)' : 'var(--color-bg)' }} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
