import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import {
  XMarkIcon, ShareIcon, EllipsisHorizontalIcon, EyeIcon,
  PlusIcon, TrashIcon, CalendarIcon, FlagIcon, UserIcon, TagIcon,
  ChevronDownIcon, SparklesIcon, ClipboardDocumentIcon, CheckIcon,
} from '@heroicons/react/24/outline'
import {
  getSubtasks, addSubtask, updateSubtask, deleteSubtask,
  getComments, addComment, deleteComment,
  getActivity, logActivity, updateTaskInDB, mapDBTask,
  enhanceDescription, generateAIPrompt,
} from '../lib/taskService'

// ─── Constants ──────────────────────────────────────────────────────────────

const STATUS_OPTIONS = ['To Do', 'In Progress', 'Review', 'Done']
const STATUS_COLORS = {
  'To Do': '#6B7280',
  'In Progress': '#3B82F6',
  'Review': '#F59E0B',
  'Done': '#10B981',
}

const PRIORITY_OPTIONS = [
  { id: 'URGENT', label: 'Urgent', emoji: '🔴', color: '#EF4444' },
  { id: 'HIGH', label: 'High', emoji: '🟠', color: '#F97316' },
  { id: 'MEDIUM', label: 'Medium', emoji: '🟡', color: '#F59E0B' },
  { id: 'LOW', label: 'Low', emoji: '🟢', color: '#10B981' },
  { id: 'none', label: 'None', emoji: '⚪', color: '#9CA3AF' },
]

// ─── Helpers ────────────────────────────────────────────────────────────────

function timeAgo(ts) {
  if (!ts) return ''
  const diff = Date.now() - new Date(ts).getTime()
  const s = Math.floor(diff / 1000)
  if (s < 60) return 'just now'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d}d ago`
  return new Date(ts).toLocaleDateString()
}

function formatDate(iso) {
  if (!iso) return null
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function isOverdue(dueDate) {
  if (!dueDate) return false
  const d = new Date(dueDate)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return d < today
}

function initialOf(name) {
  return (name || '?')[0]?.toUpperCase() || '?'
}

// ─── Tiny presentational helpers ────────────────────────────────────────────

const SectionLabel = ({ children }) => (
  <div style={{
    fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600,
    letterSpacing: '0.08em', textTransform: 'uppercase',
    color: 'var(--color-text-muted)', marginBottom: 8,
  }}>{children}</div>
)

const Avatar = ({ name, size = 24 }) => (
  <div style={{
    width: size, height: size, borderRadius: '50%',
    background: 'var(--color-text)',
    color: 'var(--color-bg)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontFamily: 'var(--font-sans)', fontWeight: 700,
    fontSize: size * 0.42, flexShrink: 0,
  }}>{initialOf(name)}</div>
)

// ─── Main component ─────────────────────────────────────────────────────────

export default function TaskDetailModal({
  task: initialTask,
  projectId,
  projectName = 'Project',
  authUser,
  user,
  teamMembers = [],
  onUpdate,
  onDelete,
  onClose,
}) {
  // ── Track viewport for mobile bottom-sheet variant ─────────────────────
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' && window.innerWidth <= 768
  )
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth <= 768)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  // ── Local copy of the task — patched optimistically ────────────────────
  const [task, setTask] = useState(initialTask)
  const taskRef = useRef(task)
  taskRef.current = task

  // Sync if parent passes a new task (e.g. realtime update from kanban)
  useEffect(() => {
    if (initialTask?.id !== taskRef.current?.id) {
      setTask(initialTask)
    }
  }, [initialTask?.id])

  // ── Lists ──────────────────────────────────────────────────────────────
  const [subtasks, setSubtasks] = useState([])
  const [comments, setComments] = useState([])
  const [activity, setActivity] = useState([])

  // ── UI state ───────────────────────────────────────────────────────────
  const [activityTab, setActivityTab] = useState('comments')
  const [titleDraft, setTitleDraft] = useState(task?.title || '')
  const [descDraft, setDescDraft] = useState(task?.description || '')
  const [editingTitle, setEditingTitle] = useState(false)
  const [editingDesc, setEditingDesc] = useState(false)
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('')
  const [addingSubtask, setAddingSubtask] = useState(false)
  const [newComment, setNewComment] = useState('')
  const [showStatus, setShowStatus] = useState(false)
  const [showPriority, setShowPriority] = useState(false)
  const [showAssignee, setShowAssignee] = useState(false)
  const [aiPromptOpen, setAiPromptOpen] = useState(true)
  const [copiedPrompt, setCopiedPrompt] = useState(false)
  const [showLabels, setShowLabels] = useState(false)
  const [newLabel, setNewLabel] = useState('')
  const [showMoreMenu, setShowMoreMenu] = useState(false)
  const [enhancing, setEnhancing] = useState(false)
  const [generatingPrompt, setGeneratingPrompt] = useState(false)
  const [shareToast, setShareToast] = useState(null)

  // Description textarea auto-grows with content (capped, then scrolls)
  const descTextareaRef = useRef(null)
  useEffect(() => {
    const el = descTextareaRef.current
    if (!el) return
    el.style.height = 'auto'
    const scroll = el.scrollHeight
    const max = 400
    el.style.height = Math.min(scroll, max) + 'px'
    el.style.overflowY = scroll > max ? 'auto' : 'hidden'
  }, [descDraft, editingDesc])

  // Close any popover when user clicks outside
  const popoverRef = useRef(null)
  useEffect(() => {
    function onDocClick(e) {
      if (!popoverRef.current) return
      if (!popoverRef.current.contains(e.target)) {
        setShowStatus(false); setShowPriority(false)
        setShowAssignee(false); setShowLabels(false)
        setShowMoreMenu(false)
      }
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  // ── Initial fetch of subtasks / comments / activity ────────────────────
  useEffect(() => {
    if (!task?.id) return
    let cancelled = false
    getSubtasks(task.id).then(d => { if (!cancelled) setSubtasks(d || []) }).catch(() => {})
    getComments(task.id).then(d => { if (!cancelled) setComments(d || []) }).catch(() => {})
    getActivity(task.id).then(d => { if (!cancelled) setActivity(d || []) }).catch(() => {})
    return () => { cancelled = true }
  }, [task?.id])

  // ── Real-time subscription for this open task ──────────────────────────
  useEffect(() => {
    if (!task?.id) return
    const channel = supabase
      .channel(`task-detail-${task.id}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'tasks',
        filter: `id=eq.${task.id}`,
      }, payload => {
        const remote = mapDBTask(payload.new)
        // Only apply if it's a real change from another device — we already
        // patched local state optimistically for our own actions.
        setTask(prev => {
          if (!prev) return remote
          return { ...prev, ...remote }
        })
      })
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'task_comments',
        filter: `task_id=eq.${task.id}`,
      }, payload => {
        setComments(prev => prev.some(c => c.id === payload.new.id)
          ? prev
          : [...prev, payload.new])
      })
      .on('postgres_changes', {
        event: 'DELETE', schema: 'public', table: 'task_comments',
        filter: `task_id=eq.${task.id}`,
      }, payload => {
        setComments(prev => prev.filter(c => c.id !== payload.old.id))
      })
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'subtasks',
        filter: `task_id=eq.${task.id}`,
      }, payload => {
        if (payload.eventType === 'INSERT') {
          setSubtasks(prev => prev.some(s => s.id === payload.new.id)
            ? prev : [...prev, payload.new])
        } else if (payload.eventType === 'UPDATE') {
          setSubtasks(prev => prev.map(s => s.id === payload.new.id ? payload.new : s))
        } else if (payload.eventType === 'DELETE') {
          setSubtasks(prev => prev.filter(s => s.id !== payload.old.id))
        }
      })
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'task_activity',
        filter: `task_id=eq.${task.id}`,
      }, payload => {
        setActivity(prev => prev.some(a => a.id === payload.new.id)
          ? prev : [payload.new, ...prev])
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [task?.id])

  // ── Escape to close ────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // ── Save helper ────────────────────────────────────────────────────────
  async function patchTask(updates, activityAction, oldValue, newValue) {
    const next = { ...task, ...updates }
    setTask(next)
    onUpdate?.(next)
    try {
      await updateTaskInDB(next)
      if (activityAction && projectId && authUser?.id) {
        logActivity(
          task.id, projectId, authUser.id,
          user?.firstName || user?.name || 'User',
          activityAction,
          oldValue == null ? '' : String(oldValue),
          newValue == null ? '' : String(newValue),
        ).catch(() => {})
      }
    } catch (e) {
      console.error('[TaskDetailModal] patchTask', e)
    }
  }

  // ── Field handlers ─────────────────────────────────────────────────────
  function commitTitle() {
    setEditingTitle(false)
    const trimmed = titleDraft.trim()
    if (!trimmed || trimmed === task.title) {
      setTitleDraft(task.title || '')
      return
    }
    patchTask({ title: trimmed }, 'renamed', task.title, trimmed)
  }

  function commitDesc() {
    setEditingDesc(false)
    if (descDraft === (task.description || '')) return
    patchTask({ description: descDraft }, 'updated description')
  }

  async function changeStatus(newStatus) {
    setShowStatus(false)
    if (newStatus === task.column) return
    await patchTask({ column: newStatus }, 'moved', task.column, newStatus)
  }

  async function changePriority(newPriority) {
    setShowPriority(false)
    if (newPriority === task.priority) return
    await patchTask({ priority: newPriority }, 'set priority', task.priority || 'none', newPriority)
  }

  async function changeAssignee(member) {
    setShowAssignee(false)
    const name = member?.name || member?.role || ''
    const role = member?.role || ''
    if (name === (task.assignedName || '')) return
    await patchTask({ assignedName: name, assignedRole: role }, 'assigned', task.assignedName || 'Unassigned', name || 'Unassigned')
  }

  async function changeDueDate(iso) {
    if (iso === (task.dueDate || '')) return
    await patchTask({ dueDate: iso || null }, 'changed due date', task.dueDate || '', iso || 'cleared')
  }

  async function changeStartDate(iso) {
    if (iso === (task.startDate || '')) return
    await patchTask({ startDate: iso || null }, 'changed start date', task.startDate || '', iso || 'cleared')
  }

  async function addLabelTag(label) {
    const existing = Array.isArray(task.labels) ? task.labels : []
    if (existing.includes(label)) return
    const next = [...existing, label]
    await patchTask({ labels: next }, 'added label', '', label)
  }

  async function removeLabelTag(label) {
    const existing = Array.isArray(task.labels) ? task.labels : []
    const next = existing.filter(l => l !== label)
    await patchTask({ labels: next }, 'removed label', label, '')
  }

  // ── Subtasks ───────────────────────────────────────────────────────────
  async function handleAddSubtask() {
    const t = newSubtaskTitle.trim()
    if (!t) return
    setNewSubtaskTitle('')
    setAddingSubtask(false)
    try {
      const created = await addSubtask(task.id, projectId, t)
      if (created) {
        setSubtasks(prev => prev.some(s => s.id === created.id) ? prev : [...prev, created])
      }
      if (projectId && authUser?.id) {
        logActivity(task.id, projectId, authUser.id,
          user?.firstName || 'User', 'added subtask', '', t).catch(() => {})
      }
    } catch (e) {
      console.error('[TaskDetailModal] addSubtask', e)
    }
  }

  async function toggleSubtask(s) {
    const next = !s.completed
    setSubtasks(prev => prev.map(x => x.id === s.id ? { ...x, completed: next } : x))
    try {
      await updateSubtask(s.id, { completed: next })
    } catch (e) { console.error(e) }
  }

  async function removeSubtask(id) {
    setSubtasks(prev => prev.filter(s => s.id !== id))
    try {
      await deleteSubtask(id)
    } catch (e) { console.error(e) }
  }

  // ── Comments ───────────────────────────────────────────────────────────
  async function handleAddComment() {
    const c = newComment.trim()
    if (!c || !authUser?.id) return
    setNewComment('')
    try {
      const created = await addComment(task.id, projectId, authUser.id,
        user?.firstName || user?.name || 'User', c)
      if (created) {
        setComments(prev => prev.some(x => x.id === created.id) ? prev : [...prev, created])
      }
    } catch (e) {
      console.error('[TaskDetailModal] addComment', e)
    }
  }

  async function handleDeleteComment(id) {
    setComments(prev => prev.filter(c => c.id !== id))
    try { await deleteComment(id) } catch (e) { console.error(e) }
  }

  // ── Share task link (native share on mobile, clipboard on desktop) ─────
  async function handleShare() {
    const url = `${window.location.origin}/task/${task.id}`
    const shareData = {
      title: task.title || 'Task',
      text: `${task.title || 'Task'} — ${projectName}`,
      url,
    }
    // Web Share API (mobile native share sheet)
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share(shareData)
        return
      } catch (e) {
        // User cancelled — bail silently, don't fall through to clipboard
        if (e?.name === 'AbortError') return
        // Other errors fall through to clipboard
      }
    }
    // Fallback: clipboard + toast
    try {
      await navigator.clipboard.writeText(url)
      setShareToast('Link copied to clipboard')
      setTimeout(() => setShareToast(null), 2000)
    } catch {
      setShareToast('Could not copy link')
      setTimeout(() => setShareToast(null), 2000)
    }
  }

  // ── AI prompt copy ─────────────────────────────────────────────────────
  function copyAiPrompt() {
    if (!task.aiPrompt) return
    navigator.clipboard.writeText(task.aiPrompt).then(() => {
      setCopiedPrompt(true)
      setTimeout(() => setCopiedPrompt(false), 1500)
    }).catch(() => {})
  }

  // ── AI enhance description ─────────────────────────────────────────────
  async function handleEnhanceDescription() {
    if (enhancing) return
    setEnhancing(true)
    try {
      const enhanced = await enhanceDescription(descDraft || task.description || '', task.title)
      if (enhanced) {
        setDescDraft(enhanced)
        await patchTask({ description: enhanced }, 'enhanced description with AI')
      }
    } catch (e) {
      console.error('[enhance]', e)
    } finally {
      setEnhancing(false)
    }
  }

  // ── AI generate task prompt ────────────────────────────────────────────
  async function handleGenerateAIPrompt() {
    if (generatingPrompt) return
    setGeneratingPrompt(true)
    try {
      const prompt = await generateAIPrompt(task.title, task.description)
      if (prompt) {
        await patchTask({ aiPrompt: prompt }, task.aiPrompt ? 'regenerated AI prompt' : 'generated AI prompt')
        setAiPromptOpen(true)
      }
    } catch (e) {
      console.error('[gen ai prompt]', e)
    } finally {
      setGeneratingPrompt(false)
    }
  }

  // ── Derived ────────────────────────────────────────────────────────────
  const statusColor = STATUS_COLORS[task.column] || '#6B7280'
  const priorityMeta = PRIORITY_OPTIONS.find(p => p.id === (task.priority || 'none')) || PRIORITY_OPTIONS[4]
  const overdue = isOverdue(task.dueDate)

  // Compute activity feed view
  const filteredActivity = activityTab === 'comments'
    ? comments.map(c => ({ kind: 'comment', ...c }))
    : activityTab === 'history'
      ? activity.map(a => ({ kind: 'activity', ...a }))
      : [
          ...comments.map(c => ({ kind: 'comment', ts: c.created_at, ...c })),
          ...activity.map(a => ({ kind: 'activity', ts: a.created_at, ...a })),
        ].sort((a, b) => new Date(b.ts || b.created_at) - new Date(a.ts || a.created_at))

  // ── Styles (object-style for portability with CSS vars) ────────────────
  const overlayStyle = {
    position: 'fixed', inset: 0, zIndex: 250,
    background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)',
    display: 'flex', alignItems: isMobile ? 'flex-end' : 'center', justifyContent: 'center',
    padding: isMobile ? 0 : 24,
    animation: 'tdmFade 0.2s ease',
  }
  const shellStyle = {
    position: 'relative',  // anchor for the toast
    background: 'var(--color-bg)',
    border: '1px solid var(--color-border)',
    borderRadius: isMobile ? '20px 20px 0 0' : 16,
    width: isMobile ? '100%' : '85vw',
    maxWidth: isMobile ? '100%' : 1100,
    // Use dvh so the modal doesn't get crushed by mobile keyboards
    height: isMobile ? '94dvh' : '90vh',
    maxHeight: isMobile ? '94dvh' : '90vh',
    overflow: 'hidden',
    display: 'flex', flexDirection: 'column',
    boxShadow: '0 24px 80px rgba(0,0,0,0.3)',
    animation: isMobile ? 'tdmSlideUp 0.25s ease' : 'tdmFadeUp 0.25s ease',
  }
  const headerStyle = {
    height: isMobile ? 48 : 52, flexShrink: 0,
    padding: isMobile ? '0 10px' : '0 18px',
    borderBottom: '1px solid var(--color-border)',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    fontFamily: 'var(--font-sans)',
    gap: 4,
  }
  const bodyStyle = {
    flex: 1, display: 'flex', overflow: 'hidden',
    flexDirection: isMobile ? 'column' : 'row',
    minHeight: 0,
  }
  const leftStyle = {
    width: isMobile ? '100%' : '60%',
    height: isMobile ? 'auto' : '100%',
    flex: isMobile ? '1 1 auto' : 'none',
    borderRight: isMobile ? 'none' : '1px solid var(--color-border)',
    borderBottom: isMobile ? '1px solid var(--color-border)' : 'none',
    display: 'flex', flexDirection: 'column',
    overflow: 'hidden',
    minHeight: 0,
  }
  const rightStyle = {
    width: isMobile ? '100%' : '40%',
    overflowY: 'auto',
    padding: isMobile ? '14px 16px 18px' : '20px 22px',
    background: 'var(--color-card)',
    flexShrink: 0,
    // On mobile, give the right panel a sensible max height since it
    // appears stacked below the (scrollable) left panel
    maxHeight: isMobile ? '50vh' : 'none',
  }
  const detailRowStyle = {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '8px 10px',
    borderRadius: 8,
    cursor: 'pointer',
    fontFamily: 'var(--font-sans)',
    transition: 'background 0.12s',
    gap: 10,
  }
  const labelStyle = {
    fontSize: 13, color: 'var(--color-text-muted)',
    fontFamily: 'var(--font-sans)',
    minWidth: isMobile ? 70 : 84,
    flexShrink: 0,
  }

  return (
    <div style={overlayStyle} onClick={onClose}>
      <style>{`
        @keyframes tdmFade { from { opacity: 0 } to { opacity: 1 } }
        @keyframes tdmFadeUp { from { opacity: 0; transform: translateY(8px) } to { opacity: 1; transform: translateY(0) } }
        @keyframes tdmSlideUp { from { transform: translateY(100%) } to { transform: translateY(0) } }
        .tdm-row:hover { background: var(--color-surface) }
        .tdm-tab { padding: 6px 12px; border-radius: 8px; cursor: pointer; font-size: 12px; font-weight: 600; font-family: var(--font-sans); color: var(--color-text-muted); }
        .tdm-tab-active { background: var(--color-surface); color: var(--color-text); }
      `}</style>

      <div style={shellStyle} onClick={e => e.stopPropagation()} ref={popoverRef}>

        {/* HEADER */}
        <div style={headerStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--color-text-muted)', fontSize: 13, overflow: 'hidden', minWidth: 0 }}>
            {!isMobile && (
              <>
                <span style={{ fontFamily: 'var(--font-sans)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 }}>{projectName}</span>
                <span>/</span>
              </>
            )}
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--color-text)' }}>
              TASK-{(task.id || '').slice(-6).toUpperCase()}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
            {!isMobile && (
              <button title="Viewers" style={iconBtn()}>
                <EyeIcon style={iconSize()} /><span style={{ fontSize: 11, marginLeft: 4 }}>1</span>
              </button>
            )}
            <button title="Share task link" style={iconBtn()} onClick={handleShare}>
              <ShareIcon style={iconSize()} />
            </button>
            <div style={{ position: 'relative' }}>
              <button title="More options" style={iconBtn()} onClick={() => setShowMoreMenu(s => !s)}>
                <EllipsisHorizontalIcon style={iconSize()} />
              </button>
              {showMoreMenu && (
                <div style={popoverStyle({ top: '100%', right: 0, minWidth: 180 })}>
                  <div className="tdm-row"
                    onClick={() => {
                      setShowMoreMenu(false)
                      if (window.confirm('Delete this task permanently?')) {
                        onDelete?.(task.id); onClose?.()
                      }
                    }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '8px 10px', cursor: 'pointer',
                      fontFamily: 'var(--font-sans)', fontSize: 13,
                      color: '#EF4444',
                    }}>
                    <TrashIcon style={{ width: 13, height: 13 }} />
                    Delete Task
                  </div>
                </div>
              )}
            </div>
            <button title="Close" onClick={onClose} style={iconBtn()}>
              <XMarkIcon style={iconSize()} />
            </button>
          </div>
        </div>

        {/* BODY */}
        <div style={bodyStyle}>

          {/* LEFT PANEL */}
          <div style={leftStyle}>
            <div style={{ flex: 1, overflowY: 'auto', padding: isMobile ? '16px 16px 12px' : '22px 26px 16px' }}>

              {/* TITLE */}
              {editingTitle ? (
                <input
                  autoFocus
                  value={titleDraft}
                  onChange={e => setTitleDraft(e.target.value)}
                  onBlur={commitTitle}
                  onKeyDown={e => { if (e.key === 'Enter') commitTitle(); if (e.key === 'Escape') { setTitleDraft(task.title || ''); setEditingTitle(false) } }}
                  style={{
                    width: '100%', background: 'transparent', border: 'none',
                    outline: 'none', borderBottom: '2px solid var(--color-accent)',
                    fontFamily: 'var(--font-sans)', fontSize: isMobile ? 19 : 24, fontWeight: 700,
                    color: 'var(--color-text)', letterSpacing: '-0.02em',
                    padding: '4px 0',
                  }}
                />
              ) : (
                <h1
                  onClick={() => { setTitleDraft(task.title || ''); setEditingTitle(true) }}
                  style={{
                    margin: 0, padding: '4px 0',
                    fontFamily: 'var(--font-sans)', fontSize: isMobile ? 19 : 24, fontWeight: 700,
                    color: 'var(--color-text)', letterSpacing: '-0.02em',
                    cursor: 'text', lineHeight: 1.3,
                  }}>
                  {task.title || 'Untitled task'}
                </h1>
              )}

              {/* DESCRIPTION */}
              <div style={{ marginTop: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <SectionLabel>Description</SectionLabel>
                  <button
                    onClick={handleEnhanceDescription}
                    disabled={enhancing}
                    title="Rewrite this description with AI"
                    style={{
                      display: 'flex', alignItems: 'center', gap: 4,
                      background: enhancing ? 'var(--color-surface)' : 'var(--color-accent-soft)',
                      border: '1px solid ' + (enhancing ? 'var(--color-border)' : 'rgba(13,148,136,0.25)'),
                      borderRadius: 100,
                      padding: '3px 9px',
                      fontFamily: 'var(--font-sans)', fontSize: 10, fontWeight: 700,
                      letterSpacing: '0.02em',
                      color: enhancing ? 'var(--color-text-muted)' : 'var(--color-accent)',
                      cursor: enhancing ? 'wait' : 'pointer',
                      marginBottom: 6,
                    }}>
                    <SparklesIcon style={{ width: 11, height: 11 }} />
                    {enhancing ? 'Enhancing...' : 'Enhance with AI'}
                  </button>
                </div>
                {editingDesc ? (
                  <textarea
                    ref={descTextareaRef}
                    autoFocus
                    value={descDraft}
                    onChange={e => setDescDraft(e.target.value)}
                    onBlur={commitDesc}
                    placeholder="Add a description..."
                    style={{
                      width: '100%', minHeight: 80, maxHeight: 400,
                      background: 'var(--color-surface)',
                      border: '1px solid var(--color-border)', borderRadius: 10,
                      padding: '10px 12px',
                      fontFamily: 'var(--font-sans)', fontSize: 14, lineHeight: 1.6,
                      color: 'var(--color-text)', outline: 'none',
                      resize: 'none', boxSizing: 'border-box',
                      overflowY: 'auto',
                    }}
                  />
                ) : (
                  <div
                    onClick={() => { setDescDraft(task.description || ''); setEditingDesc(true) }}
                    style={{
                      minHeight: 60, maxHeight: 400, overflowY: 'auto',
                      padding: '10px 12px',
                      background: 'var(--color-surface)',
                      border: '1px dashed var(--color-border)', borderRadius: 10,
                      fontFamily: 'var(--font-sans)', fontSize: 14, lineHeight: 1.6,
                      color: task.description ? 'var(--color-text)' : 'var(--color-text-muted)',
                      cursor: 'text', whiteSpace: 'pre-wrap',
                    }}>
                    {task.description || 'Add a description...'}
                  </div>
                )}
              </div>

              {/* AI PROMPT — placed under Description for visibility */}
              <div style={{ marginTop: 16 }}>
                <button
                  onClick={handleGenerateAIPrompt}
                  disabled={generatingPrompt}
                  style={{
                    width: '100%',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    background: generatingPrompt ? 'var(--color-surface)' : 'var(--color-accent-soft)',
                    border: '1px solid ' + (generatingPrompt ? 'var(--color-border)' : 'rgba(13,148,136,0.25)'),
                    borderRadius: 9, padding: '9px 12px',
                    fontFamily: 'var(--font-sans)', fontSize: 12, fontWeight: 700,
                    color: generatingPrompt ? 'var(--color-text-muted)' : 'var(--color-accent)',
                    cursor: generatingPrompt ? 'wait' : 'pointer',
                  }}>
                  <SparklesIcon style={{ width: 13, height: 13 }} />
                  {generatingPrompt
                    ? 'Generating…'
                    : (task.aiPrompt ? 'Regenerate AI prompt' : 'Generate AI prompt')}
                </button>
                {task.aiPrompt && (
                  <>
                    <div
                      onClick={() => setAiPromptOpen(o => !o)}
                      style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', marginTop: 12, marginBottom: 8 }}>
                      <SparklesIcon style={{ width: 13, height: 13, color: 'var(--color-accent)' }} />
                      <SectionLabel>AI Design Prompt</SectionLabel>
                      <ChevronDownIcon style={{ width: 12, height: 12, color: 'var(--color-text-muted)', marginLeft: 'auto', transform: aiPromptOpen ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.15s' }} />
                    </div>
                    {aiPromptOpen && (
                      <div style={{
                        background: 'var(--color-surface)',
                        border: '1px solid var(--color-border)',
                        borderRadius: 10, padding: '10px 12px',
                        fontSize: 12, fontFamily: 'var(--font-mono)', lineHeight: 1.6,
                        color: 'var(--color-text-soft)', whiteSpace: 'pre-wrap',
                        position: 'relative',
                        maxHeight: 320, overflowY: 'auto',
                      }}>
                        {task.aiPrompt}
                        <button onClick={copyAiPrompt} style={{
                          position: 'absolute', top: 8, right: 8,
                          background: 'var(--color-bg)', border: '1px solid var(--color-border)',
                          borderRadius: 6, padding: '4px 8px', cursor: 'pointer',
                          fontFamily: 'var(--font-sans)', fontSize: 10, fontWeight: 600,
                          color: 'var(--color-text-muted)',
                          display: 'flex', alignItems: 'center', gap: 4,
                        }}>
                          <ClipboardDocumentIcon style={{ width: 11, height: 11 }} />
                          {copiedPrompt ? 'Copied' : 'Copy'}
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* SUBTASKS */}
              <div style={{ marginTop: 28 }}>
                <SectionLabel>Subtasks ({subtasks.length})</SectionLabel>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {subtasks.map(s => (
                    <div key={s.id} className="tdm-row" style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '8px 10px', borderRadius: 8, fontSize: 13,
                      fontFamily: 'var(--font-sans)',
                    }}>
                      <button
                        onClick={() => toggleSubtask(s)}
                        style={{
                          width: 16, height: 16, borderRadius: 4,
                          border: '1.5px solid ' + (s.completed ? 'var(--color-accent)' : 'var(--color-border)'),
                          background: s.completed ? 'var(--color-accent)' : 'transparent',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          cursor: 'pointer', padding: 0, flexShrink: 0,
                        }}>
                        {s.completed && <CheckIcon style={{ width: 11, height: 11, color: 'white' }} />}
                      </button>
                      <span style={{
                        flex: 1, color: 'var(--color-text)',
                        textDecoration: s.completed ? 'line-through' : 'none',
                        opacity: s.completed ? 0.5 : 1,
                      }}>{s.title}</span>
                      <button onClick={() => removeSubtask(s.id)} style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: 'var(--color-text-muted)', padding: 4,
                      }}><TrashIcon style={{ width: 13, height: 13 }} /></button>
                    </div>
                  ))}

                  {addingSubtask ? (
                    <div style={{ display: 'flex', gap: 8, padding: '6px 10px' }}>
                      <input
                        autoFocus
                        value={newSubtaskTitle}
                        onChange={e => setNewSubtaskTitle(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') handleAddSubtask()
                          if (e.key === 'Escape') { setNewSubtaskTitle(''); setAddingSubtask(false) }
                        }}
                        onBlur={() => { if (!newSubtaskTitle.trim()) setAddingSubtask(false) }}
                        placeholder="Subtask title..."
                        style={{
                          flex: 1, background: 'var(--color-surface)',
                          border: '1px solid var(--color-border)', borderRadius: 7,
                          padding: '6px 10px', fontSize: 13, outline: 'none',
                          fontFamily: 'var(--font-sans)', color: 'var(--color-text)',
                          boxSizing: 'border-box',
                        }}
                      />
                    </div>
                  ) : (
                    <button
                      onClick={() => setAddingSubtask(true)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        padding: '8px 10px', borderRadius: 8,
                        background: 'transparent', border: 'none',
                        color: 'var(--color-text-muted)',
                        fontFamily: 'var(--font-sans)', fontSize: 12,
                        cursor: 'pointer', alignSelf: 'flex-start',
                      }}>
                      <PlusIcon style={{ width: 13, height: 13 }} />
                      Add subtask
                    </button>
                  )}
                </div>
              </div>

              {/* ACTIVITY */}
              <div style={{ marginTop: 32 }}>
                <SectionLabel>Activity</SectionLabel>
                <div style={{ display: 'flex', gap: 4, marginBottom: 12, borderBottom: '1px solid var(--color-border)' }}>
                  {['all', 'comments', 'history'].map(t => (
                    <div key={t}
                      className={'tdm-tab ' + (activityTab === t ? 'tdm-tab-active' : '')}
                      onClick={() => setActivityTab(t)}>
                      {t[0].toUpperCase() + t.slice(1)}
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {filteredActivity.length === 0 && (
                    <div style={{
                      fontFamily: 'var(--font-sans)', fontSize: 12,
                      color: 'var(--color-text-muted)', textAlign: 'center', padding: 16,
                    }}>No activity yet.</div>
                  )}
                  {filteredActivity.map((entry, i) => (
                    entry.kind === 'comment' ? (
                      <div key={'c' + entry.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                        <Avatar name={entry.author_name} size={28} />
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontFamily: 'var(--font-sans)', fontWeight: 600, fontSize: 13, color: 'var(--color-text)' }}>{entry.author_name}</span>
                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-text-muted)' }}>{timeAgo(entry.created_at)}</span>
                            {entry.user_id === authUser?.id && (
                              <button onClick={() => handleDeleteComment(entry.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', padding: 0, marginLeft: 4 }}>
                                <TrashIcon style={{ width: 11, height: 11 }} />
                              </button>
                            )}
                          </div>
                          <div style={{
                            marginTop: 4, padding: '8px 12px',
                            background: 'var(--color-surface)',
                            borderRadius: 8,
                            fontFamily: 'var(--font-sans)', fontSize: 13,
                            color: 'var(--color-text)', whiteSpace: 'pre-wrap', lineHeight: 1.5,
                          }}>{entry.content}</div>
                        </div>
                      </div>
                    ) : (
                      <div key={'a' + entry.id} style={{ display: 'flex', gap: 10, alignItems: 'center', fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--color-text-muted)' }}>
                        <Avatar name={entry.actor_name} size={22} />
                        <span><b style={{ color: 'var(--color-text)' }}>{entry.actor_name}</b> {entry.action}{entry.new_value && entry.action !== 'added comment' ? ` to ${entry.new_value}` : ''}</span>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, marginLeft: 'auto' }}>{timeAgo(entry.created_at)}</span>
                      </div>
                    )
                  ))}
                </div>
              </div>
            </div>

            {/* COMMENT INPUT */}
            <div style={{
              flexShrink: 0,
              padding: isMobile ? '10px 14px env(safe-area-inset-bottom, 10px)' : '12px 22px',
              borderTop: '1px solid var(--color-border)',
              background: 'var(--color-bg)',
            }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <Avatar name={user?.firstName || user?.name} size={26} />
                <input
                  value={newComment}
                  onChange={e => setNewComment(e.target.value)}
                  onKeyDown={e => { if ((e.key === 'Enter' && (e.metaKey || e.ctrlKey)) || (e.key === 'Enter' && !e.shiftKey)) { e.preventDefault(); handleAddComment() } }}
                  placeholder="Add a comment... (⌘+Enter to send)"
                  style={{
                    flex: 1, background: 'var(--color-surface)',
                    border: '1px solid var(--color-border)', borderRadius: 9,
                    padding: '8px 12px', fontSize: 13, outline: 'none',
                    fontFamily: 'var(--font-sans)', color: 'var(--color-text)',
                    boxSizing: 'border-box',
                  }}
                />
                <button
                  onClick={handleAddComment}
                  disabled={!newComment.trim()}
                  style={{
                    background: newComment.trim() ? 'var(--color-accent)' : 'var(--color-surface)',
                    color: newComment.trim() ? 'var(--color-accent-text)' : 'var(--color-text-muted)',
                    border: 'none', borderRadius: 9, padding: '8px 14px',
                    fontFamily: 'var(--font-sans)', fontSize: 12, fontWeight: 700,
                    cursor: newComment.trim() ? 'pointer' : 'default',
                  }}>Send</button>
              </div>
            </div>
          </div>

          {/* RIGHT PANEL */}
          <div style={rightStyle}>

            {/* STATUS PILL */}
            <div style={{ marginBottom: 24, position: 'relative' }}>
              <SectionLabel>Status</SectionLabel>
              <button
                onClick={() => setShowStatus(s => !s)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  background: statusColor + '18',
                  border: '1px solid ' + statusColor + '40',
                  borderRadius: 100, padding: '8px 14px',
                  fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 600,
                  color: statusColor, cursor: 'pointer',
                  width: 'fit-content',
                }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: statusColor }} />
                {task.column || 'To Do'}
                <ChevronDownIcon style={{ width: 12, height: 12 }} />
              </button>
              {showStatus && (
                <div style={popoverStyle({ top: '100%', left: 0 })}>
                  {STATUS_OPTIONS.map(s => (
                    <div key={s} onClick={() => changeStatus(s)} className="tdm-row"
                      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', cursor: 'pointer', fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--color-text)' }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: STATUS_COLORS[s] }} />
                      {s}
                      {task.column === s && <CheckIcon style={{ width: 13, height: 13, marginLeft: 'auto', color: 'var(--color-accent)' }} />}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* DETAILS */}
            <SectionLabel>Details</SectionLabel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 24 }}>

              {/* Assignee */}
              <div style={{ position: 'relative' }}>
                <div className="tdm-row" style={detailRowStyle} onClick={() => setShowAssignee(s => !s)}>
                  <span style={labelStyle}>Assignee</span>
                  {task.assignedName ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Avatar name={task.assignedName} size={22} />
                      <span style={{ fontSize: 13, color: 'var(--color-text)' }}>{task.assignedName}</span>
                    </div>
                  ) : (
                    <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Unassigned</span>
                  )}
                </div>
                {showAssignee && (
                  <div style={popoverStyle({ top: '100%', right: 0, minWidth: 200 })}>
                    {teamMembers.length === 0 && (
                      <div style={{ padding: '8px 10px', fontSize: 12, color: 'var(--color-text-muted)', fontFamily: 'var(--font-sans)' }}>No team members yet</div>
                    )}
                    {teamMembers.map(m => (
                      <div key={m.id} onClick={() => changeAssignee(m)} className="tdm-row"
                        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', cursor: 'pointer', fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--color-text)' }}>
                        <Avatar name={m.name || m.role} size={22} />
                        <span>{m.name || m.role}</span>
                      </div>
                    ))}
                    <div onClick={() => changeAssignee(null)} className="tdm-row"
                      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', cursor: 'pointer', fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--color-text-muted)', borderTop: '1px solid var(--color-border)' }}>
                      Unassign
                    </div>
                  </div>
                )}
                {!task.assignedName && authUser?.id && (
                  <div style={{ padding: '0 10px 4px', fontSize: 11, color: 'var(--color-accent)', fontFamily: 'var(--font-sans)', cursor: 'pointer' }}
                    onClick={() => changeAssignee({ name: user?.firstName || user?.name, role: '' })}>
                    Assign to me
                  </div>
                )}
              </div>

              {/* Labels */}
              <div style={{ position: 'relative' }}>
                <div className="tdm-row" style={detailRowStyle} onClick={() => setShowLabels(s => !s)}>
                  <span style={labelStyle}>Labels</span>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, justifyContent: 'flex-end' }}>
                    {(Array.isArray(task.labels) && task.labels.length > 0) ? task.labels.map(l => (
                      <span key={l} style={{
                        background: 'var(--color-accent-soft)', color: 'var(--color-accent)',
                        borderRadius: 100, padding: '2px 9px', fontSize: 11, fontWeight: 600,
                        fontFamily: 'var(--font-sans)',
                      }}>{l}</span>
                    )) : (
                      <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>None</span>
                    )}
                  </div>
                </div>
                {showLabels && (
                  <div style={popoverStyle({ top: '100%', right: 0, minWidth: 220, padding: 10 })}>
                    {(Array.isArray(task.labels) && task.labels.length > 0) && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
                        {task.labels.map(l => (
                          <span key={l} style={{
                            background: 'var(--color-accent-soft)', color: 'var(--color-accent)',
                            borderRadius: 100, padding: '3px 10px', fontSize: 11, fontWeight: 600,
                            fontFamily: 'var(--font-sans)', display: 'flex', alignItems: 'center', gap: 4,
                          }}>{l}
                            <button onClick={() => removeLabelTag(l)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-accent)', padding: 0, fontSize: 14, lineHeight: 1 }}>×</button>
                          </span>
                        ))}
                      </div>
                    )}
                    <input
                      value={newLabel}
                      onChange={e => setNewLabel(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          const v = newLabel.trim()
                          if (v) { addLabelTag(v); setNewLabel('') }
                        }
                      }}
                      placeholder="Add a label..."
                      style={{
                        width: '100%', background: 'var(--color-surface)',
                        border: '1px solid var(--color-border)', borderRadius: 7,
                        padding: '6px 10px', fontSize: 12, outline: 'none',
                        fontFamily: 'var(--font-sans)', color: 'var(--color-text)',
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>
                )}
              </div>

              {/* Start Date — goes BEFORE Due Date */}
              <label className="tdm-row" style={{ ...detailRowStyle, display: 'flex' }}>
                <span style={labelStyle}>Start Date</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {task.startDate ? (
                    <span style={{ fontSize: 13, color: 'var(--color-text)' }}>{formatDate(task.startDate)}</span>
                  ) : (
                    <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>None</span>
                  )}
                  <input type="date" value={task.startDate || ''}
                    onChange={e => changeStartDate(e.target.value)}
                    style={{ position: 'absolute', opacity: 0, pointerEvents: 'auto', width: 1, height: 1 }} />
                  <CalendarIcon style={{ width: 13, height: 13, color: 'var(--color-text-muted)', cursor: 'pointer' }}
                    onClick={e => { e.currentTarget.parentElement.querySelector('input[type=date]').showPicker?.() }} />
                </div>
              </label>

              {/* Due Date */}
              <label className="tdm-row" style={{ ...detailRowStyle, display: 'flex' }}>
                <span style={labelStyle}>Due Date</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {task.dueDate ? (
                    <span style={{
                      fontSize: 13,
                      color: overdue ? '#EF4444' : 'var(--color-text)',
                      fontWeight: overdue ? 600 : 400,
                    }}>{formatDate(task.dueDate)}</span>
                  ) : (
                    <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>None</span>
                  )}
                  <input type="date" value={task.dueDate || ''}
                    onChange={e => changeDueDate(e.target.value)}
                    style={{ position: 'absolute', opacity: 0, pointerEvents: 'auto', width: 1, height: 1 }} />
                  <CalendarIcon style={{ width: 13, height: 13, color: 'var(--color-text-muted)', cursor: 'pointer' }}
                    onClick={e => { e.currentTarget.parentElement.querySelector('input[type=date]').showPicker?.() }} />
                </div>
              </label>

              {/* Priority */}
              <div style={{ position: 'relative' }}>
                <div className="tdm-row" style={detailRowStyle} onClick={() => setShowPriority(s => !s)}>
                  <span style={labelStyle}>Priority</span>
                  <span style={{ fontSize: 13, color: 'var(--color-text)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span>{priorityMeta.emoji}</span>
                    {priorityMeta.id === 'none' ? <span style={{ color: 'var(--color-text-muted)' }}>None</span> : priorityMeta.label}
                  </span>
                </div>
                {showPriority && (
                  <div style={popoverStyle({ top: '100%', right: 0 })}>
                    {PRIORITY_OPTIONS.map(p => (
                      <div key={p.id} onClick={() => changePriority(p.id)} className="tdm-row"
                        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', cursor: 'pointer', fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--color-text)' }}>
                        <span>{p.emoji}</span>{p.label}
                        {(task.priority || 'none') === p.id && <CheckIcon style={{ width: 13, height: 13, marginLeft: 'auto', color: 'var(--color-accent)' }} />}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Reporter */}
              <div className="tdm-row" style={{ ...detailRowStyle, cursor: 'default' }}>
                <span style={labelStyle}>Reporter</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Avatar name={user?.firstName || user?.name} size={22} />
                  <span style={{ fontSize: 13, color: 'var(--color-text)' }}>{user?.firstName || user?.name || 'You'}</span>
                </div>
              </div>
            </div>

          </div>
        </div>

        {/* Share toast (in-modal) */}
        {shareToast && (
          <div style={{
            position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)',
            background: 'var(--color-text)', color: 'var(--color-bg)',
            padding: '8px 16px', borderRadius: 100, fontFamily: 'var(--font-sans)',
            fontSize: 12, fontWeight: 600,
            boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
            zIndex: 10,
            animation: 'tdmFade 0.2s ease',
          }}>{shareToast}</div>
        )}
      </div>
    </div>
  )
}

// ─── Style helpers ──────────────────────────────────────────────────────────

function iconBtn() {
  return {
    background: 'transparent', border: 'none', padding: '6px 8px',
    borderRadius: 7, cursor: 'pointer',
    color: 'var(--color-text-muted)',
    display: 'flex', alignItems: 'center',
  }
}
function iconSize() {
  return { width: 15, height: 15 }
}
function popoverStyle(pos) {
  return {
    position: 'absolute', zIndex: 5, marginTop: 4,
    background: 'var(--color-bg)',
    border: '1px solid var(--color-border)',
    borderRadius: 10, boxShadow: '0 6px 24px rgba(0,0,0,0.18)',
    padding: 6, minWidth: 160,
    ...pos,
  }
}
