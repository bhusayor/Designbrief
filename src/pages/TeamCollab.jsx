import React, { useState, useRef, useEffect, useContext } from 'react'
import AppContext from '../context/AppContext'
import { Button, Badge } from '../components/ui'
import {
  SparklesIcon, CheckIcon, PlusIcon,
  XMarkIcon, ArrowUpIcon, ChevronDownIcon,
  UserGroupIcon, UserIcon, CalendarIcon, LinkIcon,
  Squares2X2Icon, ListBulletIcon,
  TableCellsIcon, CalendarDaysIcon, ChartBarIcon,
  ChevronLeftIcon, ChevronRightIcon,
  ExclamationCircleIcon,
  CheckCircleIcon, EllipsisHorizontalIcon,
  PencilIcon, ArrowLeftIcon, ArrowRightIcon, TrashIcon,
  Bars2Icon,
  ArrowPathIcon,
  ClipboardDocumentIcon,
  AdjustmentsHorizontalIcon,
  ArrowsUpDownIcon, BoltIcon, ClockIcon, DevicePhoneMobileIcon,
  MagnifyingGlassIcon, PencilSquareIcon, RectangleGroupIcon,
  SwatchIcon, UsersIcon,
} from '@heroicons/react/24/outline'
import { ROLE_META, KANBAN_COLS, COL_COLORS, PRIORITY_COLORS } from '../lib/constants'
import { getWebsiteTemplate } from '../lib/templates'
import { generateKanban, generateTeamRoles, handleFollowUp, callJSON, callClaude, callClaudeTools } from '../lib/api'
import { PER_TASK_PROMPT_SYSTEM, SENIOR_CREATIVE_DIRECTOR } from '../lib/aiSystemPrompts'
import { getProjectInvites } from '../lib/teamService'
import {
  saveTasksToDB, loadTasksFromDB, updateTaskInDB, deleteTaskFromDB, mapDBTask,
  loadProjectSettings, saveKanbanColumns,
  calculateDueDates, calculateProgress, logActivity,
} from '../lib/taskService'
import { projectLimit } from '../lib/plans'
import TeamPage from './TeamPage'
import ConnectPanel from '../components/connectors/ConnectPanel'
import { GanttSection } from '../components/brief/renderers/shared'
import BuildInterface from '../components/build/BuildInterface'
import BuildModeModal from '../components/builder/BuildModeModal'
import AIBuilder from '../components/builder/AIBuilder'
import { authedFetch } from '../lib/getAuthHeader'
import { supabase } from '../lib/supabase'
import { createBuild } from '../lib/aiBuildEngine'
import TaskDetailModal from '../components/TaskDetailModal'
import ConfirmDeleteModal from '../components/ConfirmDeleteModal'
const uid = () => Math.random().toString(36).slice(2, 9)

// ─── Board agent tools ────────────────────────────────────────────────────────

const BOARD_TOOLS = [
  {
    name: 'board_action',
    description: 'Perform a single action on the kanban board: add, move, update, or delete a task.',
    input_schema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['add', 'move', 'update', 'delete'],
          description: 'The action to perform',
        },
        taskId: {
          type: 'string',
          description: 'ID of existing task (required for move/update/delete)',
        },
        task: {
          type: 'object',
          description: 'Task data for add/update',
          properties: {
            title: { type: 'string' },
            description: { type: 'string' },
            column: { type: 'string' },
            priority: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH'] },
            assignee: { type: 'string' },
            dueDate: { type: 'string' },
          },
        },
        toColumn: {
          type: 'string',
          description: 'Target column for move action',
        },
      },
      required: ['action'],
    },
  },
  {
    name: 'bulk_action',
    description: 'Add multiple tasks to the board at once. Use when user asks to generate tasks, break something into subtasks, or create a project plan.',
    input_schema: {
      type: 'object',
      properties: {
        tasks: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              description: { type: 'string' },
              column: { type: 'string' },
              priority: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH'] },
              assignee: { type: 'string' },
              dueDate: { type: 'string' },
            },
            required: ['title'],
          },
          description: 'Array of tasks to add',
        },
        clearFirst: {
          type: 'boolean',
          description: 'Whether to clear existing tasks before adding (for full replans)',
        },
      },
      required: ['tasks'],
    },
  },
  {
    name: 'column_action',
    description: 'Rename a column or clear all tasks from a column.',
    input_schema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['rename', 'clear'] },
        columnId: { type: 'string', description: 'ID of the column' },
        newLabel: { type: 'string', description: 'New name (for rename only)' },
      },
      required: ['action', 'columnId'],
    },
  },
  {
    name: 'move_all',
    description: 'Move all tasks from one column to another.',
    input_schema: {
      type: 'object',
      properties: {
        fromColumn: { type: 'string' },
        toColumn: { type: 'string' },
      },
      required: ['fromColumn', 'toColumn'],
    },
  },
  {
    name: 'prioritise_board',
    description: 'Reorder tasks across the board by priority. Returns a suggested ordering with reasoning.',
    input_schema: {
      type: 'object',
      properties: {
        criteria: {
          type: 'string',
          description: 'What to prioritise by: impact, urgency, effort, deadline',
        },
      },
      required: ['criteria'],
    },
  },
]

const ALL_SUGGESTIONS = [
  {
    label: 'Generate a project sprint',
    prompt: 'Generate a realistic sprint plan for this project with tasks distributed across all columns.',
    icon: 'SparklesIcon',
    category: 'planning',
  },
  {
    label: 'What should I tackle first?',
    prompt: 'Looking at the current board, what is the highest-impact task I should work on right now and why?',
    icon: 'BoltIcon',
    category: 'insight',
  },
  {
    label: 'Prioritise by urgency',
    prompt: 'Reorder all tasks on the board prioritising the most urgent and highest-impact ones first.',
    icon: 'ArrowsUpDownIcon',
    category: 'action',
  },
  {
    label: 'Show project health',
    prompt: 'Give me an honest summary of this project — what is on track, what is behind, and what needs immediate attention.',
    icon: 'ChartBarIcon',
    category: 'insight',
  },
  {
    label: 'Find blockers',
    prompt: 'Scan the board and identify any tasks that look stuck, overdue, or blocking other work.',
    icon: 'ExclamationCircleIcon',
    category: 'insight',
  },
  {
    label: 'Break task into steps',
    prompt: 'Take the first high-priority task in To Do and break it into 5 specific, actionable subtasks.',
    icon: 'ListBulletIcon',
    category: 'action',
  },
  {
    label: 'Plan a design handoff',
    prompt: 'Add tasks for a complete design-to-dev handoff: final screens, component specs, assets, prototype link, dev QA review.',
    icon: 'PencilSquareIcon',
    category: 'planning',
  },
  {
    label: 'Add user research tasks',
    prompt: 'Add a set of user research tasks: recruitment screener, discussion guide, 5 user sessions, affinity mapping, insights report.',
    icon: 'UsersIcon',
    category: 'planning',
  },
  {
    label: 'Mark completed work as done',
    prompt: 'Move all tasks that appear complete or finished to the Done column.',
    icon: 'CheckCircleIcon',
    category: 'action',
  },
  {
    label: 'What is overdue?',
    prompt: 'Check all tasks with due dates and tell me which ones are overdue or at risk of being late.',
    icon: 'ClockIcon',
    category: 'insight',
  },
  {
    label: 'Plan a mobile app build',
    prompt: 'Generate tasks for building a mobile app: onboarding, auth, core screens, API integration, testing, App Store submission.',
    icon: 'DevicePhoneMobileIcon',
    category: 'planning',
  },
  {
    label: 'Build a design system',
    prompt: 'Add tasks for building a design system: colour tokens, typography scale, component library, documentation, team rollout.',
    icon: 'SwatchIcon',
    category: 'planning',
  },
  {
    label: 'Plan a launch week',
    prompt: 'Create a launch week task plan: pre-launch checklist, announcement content, social posts, email campaign, post-launch review.',
    icon: 'BoltIcon',
    category: 'planning',
  },
  {
    label: 'Estimate the workload',
    prompt: 'Look at all current tasks and give me a rough estimate of how many days of work remain.',
    icon: 'ChartBarIcon',
    category: 'insight',
  },
  {
    label: 'Clear done column',
    prompt: 'Clear all tasks from the Done column to clean up the board.',
    icon: 'ArrowPathIcon',
    category: 'action',
  },
  {
    label: 'Add a discovery phase',
    prompt: 'Add discovery phase tasks: stakeholder interviews, competitive audit, user journey mapping, problem statement, success metrics.',
    icon: 'MagnifyingGlassIcon',
    category: 'planning',
  },
]

// ─── ChatBubble ───────────────────────────────────────────────────────────────

function ChatBubble({ msg }) {
  const isAI = msg.role === 'ai'

  return (
    <div style={{
      display: 'flex',
      flexDirection: isAI ? 'row' : 'row-reverse',
      gap: 8,
      alignItems: 'flex-start',
      marginBottom: 8,
    }}>
      {isAI && (
        <div style={{
          width: 26, height: 26, borderRadius: 8,
          background: 'linear-gradient(135deg, #8B5CF6 0%, #3B82F6 100%)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0, marginTop: 2,
        }}>
          <SparklesIcon style={{ width: 12, height: 12, color: 'white' }} />
        </div>
      )}
      <div style={{
        maxWidth: '82%',
        background: isAI ? 'var(--color-surface)' : 'var(--color-text)',
        border: isAI ? '1px solid var(--color-border)' : 'none',
        borderRadius: isAI ? '4px 12px 12px 12px' : '12px 4px 12px 12px',
        padding: '10px 13px',
        fontFamily: 'var(--font-sans)',
        fontSize: 13, fontWeight: 400,
        color: isAI ? 'var(--color-text)' : 'var(--color-bg)',
        lineHeight: 1.65, wordBreak: 'break-word',
      }}>
        {msg.text}
      </div>
    </div>
  )
}

// ─── TypingBubble ─────────────────────────────────────────────────────────────

function TypingBubble({ userMessage }) {
  const getThinkingMessages = (msg) => {
    const text = (msg || '').toLowerCase()
    if (/add|create|new task/i.test(text)) {
      return ['Adding to your board...', 'Setting priority...', 'Placing in the right column...']
    }
    if (/generate|plan|sprint|tasks for/i.test(text)) {
      return ['Analysing your project...', 'Planning the task structure...', 'Assigning priorities...', 'Distributing across columns...']
    }
    if (/move|transfer/i.test(text)) {
      return ['Finding the task...', 'Moving to new column...']
    }
    if (/priorit/i.test(text)) {
      return ['Reading the board...', 'Scoring by impact and urgency...', 'Reordering tasks...']
    }
    if (/summarise|summary|progress|status/i.test(text)) {
      return ['Reading the board...', 'Analysing progress...', 'Putting it together...']
    }
    if (/block|stuck|overdue/i.test(text)) {
      return ['Scanning for blockers...', 'Checking due dates...', 'Identifying risks...']
    }
    if (/delete|remove|clear/i.test(text)) {
      return ['Identifying tasks...', 'Clearing from board...']
    }
    return ['Thinking...', 'Reading the board...', 'Working on it...']
  }

  const msgs = getThinkingMessages(userMessage)
  const [idx, setIdx] = useState(0)

  useEffect(() => {
    const timer = setInterval(() => {
      setIdx(prev => prev < msgs.length - 1 ? prev + 1 : prev)
    }, 1500)
    return () => clearInterval(timer)
  }, [msgs.length])

  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 12 }}>
      <div style={{
        width: 26, height: 26, borderRadius: 8,
        background: 'linear-gradient(135deg, #8B5CF6 0%, #3B82F6 100%)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0, marginTop: 2,
      }}>
        <SparklesIcon style={{ width: 12, height: 12, color: 'white' }} />
      </div>
      <div style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: '4px 12px 12px 12px',
        padding: '10px 14px',
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <div style={{
          width: 6, height: 6, borderRadius: '50%',
          background: 'linear-gradient(135deg, #8B5CF6, #3B82F6)',
          animation: 'breathe 1.5s ease infinite',
          flexShrink: 0,
        }} />
        <span style={{
          fontFamily: 'var(--font-sans)',
          fontSize: 13, fontWeight: 500,
          color: 'var(--color-text-muted)',
          fontStyle: 'italic',
        }}>
          {msgs[idx]}
        </span>
      </div>
    </div>
  )
}

// ─── TeamCollab ───────────────────────────────────────────────────────────────

function useWindowWidth() {
  const [width, setWidth] = React.useState(() => window.innerWidth)
  React.useEffect(() => {
    function onResize() { setWidth(window.innerWidth) }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return width
}

// AddTaskModal lives at module scope so React keeps the same component
// identity across TeamCollab re-renders. When it was declared *inside*
// TeamCollab, every parent render created a new function reference and
// React unmounted/remounted the modal — wiping the user's typed input.
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div style={{ fontFamily: 'var(--font-sans)', fontWeight: 800, fontSize: 18, color: 'var(--color-text)', letterSpacing: '-0.01em' }}>Add Task</div>
          <button onClick={(e) => { e.stopPropagation(); onClose() }} style={{ width: 30, height: 30, borderRadius: 8, background: 'var(--color-surface)', border: '1px solid var(--color-border)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <XMarkIcon style={{ width: 14, height: 14, color: 'var(--color-text-muted)' }} />
          </button>
        </div>
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
              padding: '8px 0', fontFamily: 'var(--font-sans)',
              fontSize: 16, fontWeight: 600, color: 'var(--color-text)',
              outline: 'none', boxSizing: 'border-box',
              transition: 'border-bottom-color 0.15s',
            }}
          />
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--color-text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>Description</label>
          <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Add more details..." rows={3} style={{ width: '100%', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 10, padding: '10px 14px', fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--color-text)', outline: 'none', resize: 'vertical', boxSizing: 'border-box', lineHeight: 1.6 }} />
        </div>
        <div style={{ marginBottom: 16, position: 'relative' }}>
          <label style={{ display: 'block', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--color-text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>Assignees</label>
          {form.assignees.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
              {form.assignees.map((a, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 100, padding: '3px 10px 3px 8px' }}>
                  <div style={{ width: 20, height: 20, borderRadius: '50%', background: 'var(--color-text)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-sans)', fontWeight: 700, fontSize: 9, color: 'var(--color-bg)', flexShrink: 0 }}>{a[0]?.toUpperCase()}</div>
                  <span style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--color-text)' }}>{a}</span>
                  <button onClick={() => setForm(f => ({ ...f, assignees: f.assignees.filter((_, j) => j !== i) }))} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', color: 'var(--color-text-muted)' }}>
                    <XMarkIcon style={{ width: 10, height: 10 }} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 10, padding: '8px 12px', gap: 6 }}>
            <UserIcon style={{ width: 14, height: 14, color: 'var(--color-text-muted)', flexShrink: 0 }} />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--color-text-muted)' }}>@</span>
            <input value={assigneeQuery} onChange={e => { setAssigneeQuery(e.target.value); setShowSuggestions(true) }} onFocus={() => setShowSuggestions(true)} onBlur={() => setTimeout(() => setShowSuggestions(false), 150)} placeholder="Type name to assign..." style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--color-text)' }} />
          </div>
          {showSuggestions && filteredSuggestions.length > 0 && (
            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--color-card)', border: '1px solid var(--color-border)', borderRadius: 10, zIndex: 10, overflow: 'hidden', boxShadow: '0 4px 16px rgba(0,0,0,0.1)' }}>
              {filteredSuggestions.map((m, i) => (
                <div key={i} onMouseDown={() => { setForm(f => ({ ...f, assignees: [...f.assignees, m.name] })); setAssigneeQuery(''); setShowSuggestions(false) }}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', cursor: 'pointer', borderBottom: i < filteredSuggestions.length - 1 ? '1px solid var(--color-border)' : 'none' }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-surface)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                >
                  <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--color-text)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-sans)', fontWeight: 700, fontSize: 11, color: 'var(--color-bg)' }}>{m.name[0]?.toUpperCase()}</div>
                  <div>
                    <div style={{ fontFamily: 'var(--font-sans)', fontWeight: 600, fontSize: 13, color: 'var(--color-text)' }}>{m.name}</div>
                    {m.role && <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--color-text-muted)' }}>{m.role}</div>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
          <div>
            <label style={{ display: 'block', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--color-text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>Due Date</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 10, padding: '8px 12px' }}>
              <CalendarIcon style={{ width: 14, height: 14, color: 'var(--color-text-muted)', flexShrink: 0 }} />
              <input type="date" value={form.dueDate} onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))} style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontFamily: 'var(--font-sans)', fontSize: 13, color: form.dueDate ? 'var(--color-text)' : 'var(--color-text-muted)', cursor: 'pointer' }} />
            </div>
          </div>
          <div>
            <label style={{ display: 'block', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--color-text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>Priority</label>
            <div style={{ display: 'flex', gap: 6 }}>
              {[{ id: 'HIGH', color: '#EF4444' }, { id: 'MEDIUM', color: '#F59E0B' }, { id: 'LOW', color: '#6B7280' }].map(p => (
                <button key={p.id} onClick={() => setForm(f => ({ ...f, priority: p.id }))} style={{ flex: 1, padding: '8px 4px', borderRadius: 8, border: form.priority === p.id ? '1.5px solid ' + p.color : '1px solid var(--color-border)', background: form.priority === p.id ? p.color + '15' : 'var(--color-surface)', cursor: 'pointer', fontFamily: 'var(--font-sans)', fontSize: 11, fontWeight: 600, color: form.priority === p.id ? p.color : 'var(--color-text-muted)', transition: 'all 0.15s' }}>
                  {p.id[0] + p.id.slice(1).toLowerCase()}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={(e) => { e.stopPropagation(); onClose() }} style={{ padding: '9px 20px', background: 'transparent', border: '1px solid var(--color-border)', borderRadius: 10, fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 600, color: 'var(--color-text-muted)', cursor: 'pointer' }}>Cancel</button>
          <button onClick={() => { if (!form.title.trim()) return; onSave(form); onClose() }} disabled={!form.title.trim()} style={{ padding: '9px 24px', background: form.title.trim() ? 'var(--color-text)' : 'var(--color-border)', border: 'none', borderRadius: 10, fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 700, color: 'var(--color-bg)', cursor: form.title.trim() ? 'pointer' : 'default', transition: 'background 0.15s' }}>Add Task</button>
        </div>
      </div>
    </div>
  )
}


export default function TeamCollab() {
  const { activeProject, openProject, setActiveProject, projects: ctxProjects, showToast, navigate, authUser, user, saveProject, setCreditsUsed, selectedWebsiteTemplate, connectorData, workspace, renameProject: renameProjectInDB, deleteProject: deleteProjectInDB, touchProject, userPlan, openUpgradeModal, consumeCredits } = useContext(AppContext)

  const windowWidth = useWindowWidth()
  const isMobile = windowWidth <= 480
  const isTablet = windowWidth > 480 && windowWidth <= 768

  const websiteTemplate = getWebsiteTemplate(selectedWebsiteTemplate || 'saas-landing')

  // Hydrate from localStorage immediately so the board shows without waiting for
  // auth to load. The DB-load effect will override with authoritative data once
  // the session is ready.
  //
  // CRITICAL: read the active project id from the WORKSPACE-SCOPED map
  // (tc-active-by-ws), not the flat teamcollab-active-project key. Otherwise
  // remounting after a workspace switch (or remount in a freshly created
  // workspace) reads whichever workspace was last touched on this device
  // and renders its kanban for a few seconds before the new workspace's
  // data loads. We only fall back to the legacy global key when the entire
  // workspace-scoped map is missing (true one-time migration), never when
  // it exists but lacks an entry for THIS workspace.
  function _tcInitialProjectId() {
    try {
      const wsId = workspace?.id || null
      const rawMap = localStorage.getItem('tc-active-by-ws')
      const hasMap = rawMap !== null
      if (wsId && hasMap) {
        const map = JSON.parse(rawMap || '{}') || {}
        return map[wsId] || 'default'
      }
      if (!hasMap) {
        return localStorage.getItem('teamcollab-active-project') || 'default'
      }
      return 'default'
    } catch { return 'default' }
  }
  const [phase, setPhase] = useState(() => {
    try {
      const id = _tcInitialProjectId()
      if (!id || id === 'default') return 'brief'
      const s = localStorage.getItem('tc-project-' + id)
      return (s && JSON.parse(s)?.phase) || 'brief'
    } catch { return 'brief' }
  })
  const [kanban, setKanban] = useState(() => {
    try {
      const id = _tcInitialProjectId()
      if (!id || id === 'default') return null
      const s = localStorage.getItem('tc-project-' + id)
      return (s && JSON.parse(s)?.kanban) || null
    } catch { return null }
  })
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [briefText, setBriefText] = useState(() => {
    try {
      const id = _tcInitialProjectId()
      if (!id || id === 'default') return ''
      const s = localStorage.getItem('tc-project-' + id)
      return (s && JSON.parse(s)?.briefText) || ''
    } catch { return '' }
  })
  const [projectTitle, setProjectTitle] = useState(() => {
    // Seed from the per-project cache so the title shows the instant
    // TeamCollab remounts after a workspace switch — no blank header
    // while the DB hydration round-trips.
    try {
      const id = _tcInitialProjectId()
      if (!id || id === 'default') return ''
      const s = localStorage.getItem('tc-project-' + id)
      return (s && JSON.parse(s)?.projectTitle) || ''
    } catch { return '' }
  })
  const [teamMembers, setTeamMembers] = useState([])
  const [suggestedRoles, setSuggestedRoles] = useState([])
  const [loading, setLoading] = useState(false)
  const [draggedTask, setDraggedTask] = useState(null)
  const [dragOverCol, setDragOverCol] = useState(null)
  const [dragOverTaskId, setDragOverTaskId] = useState(null)
  const [draggedColId, setDraggedColId] = useState(null)
  const [dragOverColId, setDragOverColId] = useState(null)
  const [editingTask, setEditingTask] = useState(null)
  const [showAddTaskModal, setShowAddTaskModal] = useState(false)
  const [addTaskData, setAddTaskData] = useState({ title: '', description: '', assignees: [], dueDate: '', priority: 'MEDIUM', column: '' })
  const [addingToCol, setAddingToCol] = useState(null)
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [chatOpen, setChatOpen] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const [pushLinearOpen, setPushLinearOpen] = useState(false)
  const [selectedTeamId, setSelectedTeamId] = useState('')
  const [pushingLinear, setPushingLinear] = useState(false)
  const [pushResult, setPushResult] = useState(null)
  const [projects, setProjects] = useState(() => {
    try {
      const wsId = workspace?.id || null
      if (wsId) {
        const map = JSON.parse(localStorage.getItem('tc-tabs-by-ws') || '{}') || {}
        const list = map[wsId]
        if (Array.isArray(list) && list.length > 0) return list
        return [{ id: 'default', title: 'My Project' }]
      }
      const stored = JSON.parse(localStorage.getItem('teamcollab-projects'))
      if (Array.isArray(stored) && stored.length > 0) return stored
    } catch {}
    return [{ id: 'default', title: 'My Project' }]
  })
  // Seed the active TC tab from the workspace-scoped map written by the
  // tab switcher (see setActiveProjectId / persist effect below). The
  // legacy teamcollab-active-project key is ONLY used when the workspace-
  // scoped map doesn't exist yet (true one-time migration); we never fall
  // back to it when the map exists but lacks an entry for this workspace
  // — that path would re-seed a brand-new workspace with the previous
  // workspace's last project id.
  const [activeProjectId, setActiveProjectId] = useState(() => {
    try {
      const wsId = workspace?.id || null
      const rawMap = localStorage.getItem('tc-active-by-ws')
      const hasMap = rawMap !== null
      if (wsId && hasMap) {
        const map = JSON.parse(rawMap || '{}') || {}
        return map[wsId] || 'default'
      }
      if (!hasMap) {
        return localStorage.getItem('teamcollab-active-project') || 'default'
      }
      return 'default'
    } catch {}
    return 'default'
  })

  // ── Role-based access control ─────────────────────────────────────────────
  // currentUserRole on a project is one of: 'Admin' | 'Editor' | 'Viewer'.
  // - Admin     = project creator: full control + invites + delete + role mgmt
  // - Editor    = invited collaborator: edit brief, create/move tasks, comment
  // - Viewer    = read-only: view + comment only
  //
  // Derive STRICTLY from the project whose id matches activeProjectId so a
  // switch from Project A (Viewer) to Project B (Admin) never bleeds the
  // previous role's restrictions onto the new board.
  const targetProjectId = activeProjectId || activeProject?.id
  const projectInCtx = ctxProjects?.find(p => p.id === targetProjectId)
  const myRole = (
    (activeProject?.id === targetProjectId ? activeProject?.currentUserRole : null)
    || projectInCtx?.currentUserRole
    || 'Admin'
  )
  const isProjectAdmin = myRole === 'Admin'
  const canEdit = myRole === 'Admin' || myRole === 'Editor'
  const isViewer = myRole === 'Viewer'

  const [conversationHistory, setConversationHistory] = useState([])
  const [chatHistory, setChatHistory] = useState([])
  const [isTyping, setIsTyping] = useState(false)
  const [fileName, setFileName] = useState(null)
  const [activeTab, setActiveTab] = useState('board')
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
  const [openColMenuId, setOpenColMenuId] = useState(null)
  const [promptModalOpen, setPromptModalOpen] = useState(false)
  const [promptModalTask, setPromptModalTask] = useState(null)
  const [generatedPrompt, setGeneratedPrompt] = useState('')
  const [generatingPrompt, setGeneratingPrompt] = useState(false)
  const [promptCopied, setPromptCopied] = useState(false)
  const [promptPrefs, setPromptPrefs] = useState({ colors: '', fonts: '', style: '', references: '' })
  const [showPrefsPanel, setShowPrefsPanel] = useState(false)
  const [promptError, setPromptError] = useState(null)
  const [showConnectPanel, setShowConnectPanel] = useState(false)
  const [installedConnectors, setInstalledConnectors] = useState({ figma: false, github: false, linear: false })

  const [showBuildInterface, setShowBuildInterface] = useState(false)
  // Phase 2 AI Builder (website section builder)
  const [aiBuilderOpen, setAiBuilderOpen] = useState(false)
  const [aiBuildModeOpen, setAiBuildModeOpen] = useState(false)
  const [activeAiBuild, setActiveAiBuild] = useState(null)
  const [aiBuildLoading, setAiBuildLoading] = useState(false)
  const [showTeamModal, setShowTeamModal] = useState(false)
  const [showMoreViews, setShowMoreViews] = useState(false)
  const [showProjectMenu, setShowProjectMenu] = useState(false)
  const [renamingProjectId, setRenamingProjectId] = useState(null)
  const [renameValue, setRenameValue] = useState('')
  const [projectActionMenuId, setProjectActionMenuId] = useState(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState(null)
  const [confirmDeleteColId, setConfirmDeleteColId] = useState(null)
  const [projectFlash, setProjectFlash] = useState(false)
  const [boardTransitioning, setBoardTransitioning] = useState(false)
  const [tasksLoading, setTasksLoading] = useState(false)
  // Map of user_id → { name, avatarUrl } for every member of the active
  // project. Used by TaskCard so each assignee renders with their
  // profile photo (or initials fallback). Populated alongside the task
  // load below; refreshed whenever the project changes.
  const [projectMembers, setProjectMembers] = useState({})
  const [taskLoadError, setTaskLoadError] = useState(false)

  const messagesEndRef = useRef(null)
  const scrollAnchorRef = useRef(null)
  const fileInputRef = useRef(null)
  const addInputRef = useRef(null)
  const chatInputRef = useRef(null)
  const projectMenuRef = useRef(null)
  // Auto-save to DB: tracks prev task IDs per project to detect deletions
  const dbSaveTimerRef = useRef(null)
  const flushSaveRef = useRef(null)   // holds the latest doSave fn for unmount flush
  // Tracks task IDs the server has confirmed at least once. Lets the polling
  // merge tell 'pending save' (never seen) from 'deleted remotely' (seen, gone).
  const confirmedRemoteIdsRef = useRef(new Set())
  // Same idea for PROJECT IDs in the TC tab list — distinguishes "pending
  // create not yet round-tripped to the DB" from "deleted on another device".
  const seenCtxProjectIdsRef = useRef(new Set())
  // Tracks taskId → timestamp of the most recent LOCAL change. Polling and
  // realtime overrides are skipped for tasks modified locally within the
  // last 6 seconds so a column move (or rename) can't flicker back to its
  // old value while the save is still in flight.
  const localChangeAtRef = useRef(new Map())
  // Ref for draggedTask — always current in event handlers, avoids stale-closure drops
  const draggedTaskRef = useRef(null)

  const [activeSuggestions, setActiveSuggestions] = useState([])

  // Persist the active tab into a workspace-scoped map so each workspace
  // remembers its own tab. The legacy teamcollab-active-project still
  // gets written by the existing tab switcher (harmless — seeding above
  // prefers the map). This effect keeps the map in sync on every change.
  useEffect(() => {
    const wsId = workspace?.id || null
    if (!wsId) return
    try {
      const map = JSON.parse(localStorage.getItem('tc-active-by-ws') || '{}') || {}
      const id = activeProjectId || null
      if (id && id !== 'default') {
        map[wsId] = id
      } else {
        delete map[wsId]
      }
      localStorage.setItem('tc-active-by-ws', JSON.stringify(map))
    } catch {}
  }, [activeProjectId, workspace?.id])

  // Same for the project tabs list: each workspace remembers its own tabs.
  useEffect(() => {
    const wsId = workspace?.id || null
    if (!wsId) return
    try {
      const map = JSON.parse(localStorage.getItem('tc-tabs-by-ws') || '{}') || {}
      // Skip writing the empty placeholder so we don't accidentally
      // overwrite a real cached list with [default].
      const isOnlyPlaceholder = projects.length === 1 && projects[0]?.id === 'default'
      if (!isOnlyPlaceholder) {
        map[wsId] = projects.map(p => ({ id: p.id, title: p.title }))
        localStorage.setItem('tc-tabs-by-ws', JSON.stringify(map))
      }
    } catch {}
  }, [projects, workspace?.id])

  // When the workspace changes, re-seed activeProjectId AND the tab list
  // from the workspace-scoped maps so the user lands back on the project
  // (and the tab strip) they last had open in that workspace. Also
  // pre-load the kanban / phase / columns / projectTitle from the per-
  // project cache so the board shows instantly — no flicker while DB
  // load catches up.
  const prevWsForActiveTabRef = useRef(workspace?.id)
  useEffect(() => {
    const prev = prevWsForActiveTabRef.current
    const curr = workspace?.id
    prevWsForActiveTabRef.current = curr
    if (!curr || prev === curr) return
    try {
      const tabsMap = JSON.parse(localStorage.getItem('tc-tabs-by-ws') || '{}') || {}
      const nextTabs = Array.isArray(tabsMap[curr]) && tabsMap[curr].length > 0
        ? tabsMap[curr]
        : [{ id: 'default', title: 'My Project' }]
      setProjects(nextTabs)

      const activeMap = JSON.parse(localStorage.getItem('tc-active-by-ws') || '{}') || {}
      const nextId = activeMap[curr] || 'default'
      setActiveProjectId(nextId)

      if (nextId && nextId !== 'default') {
        const cached = localStorage.getItem('tc-project-' + nextId)
        if (cached) {
          try {
            const s = JSON.parse(cached)
            setKanban(s?.kanban || null)
            setPhase(s?.phase || 'brief')
            if (s?.projectTitle) setProjectTitle(s.projectTitle)
            if (s?.briefText)    setBriefText(s.briefText)
          } catch {}
        }
        const cols = localStorage.getItem('tc-cols-' + nextId)
        if (cols) {
          try { setCustomCols(JSON.parse(cols)) } catch {}
        }
      } else {
        setKanban(null)
        setPhase('brief')
        setProjectTitle('')
        setBriefText('')
      }
    } catch {}
  }, [workspace?.id])

  // ── Workspace settle / switch: reset all local TeamCollab state ─────────
  // The localStorage caches (teamcollab-projects, teamcollab-active-project,
  // tc-cols-*, tc-project-*) survive a workspace switch AND survive being
  // opened in a different browser with a different active workspace. We
  // need to wipe local state in BOTH cases so the AppContext sync effect
  // repopulates from the new workspace's ctxProjects.
  //
  // Cases covered:
  //   1. Explicit switch:   workspaceA -> workspaceB           (prev set, curr set, differ)
  //   2. Initial resolve:   undefined  -> workspaceA           (prev undef, curr set)
  //   3. Sign-out / clear:  workspaceA -> undefined            (prev set, curr undef)
  const prevWorkspaceIdRef = useRef(workspace?.id)
  useEffect(() => {
    const prev = prevWorkspaceIdRef.current
    const curr = workspace?.id
    prevWorkspaceIdRef.current = curr
    if (prev === curr) return

    setProjects([{ id: 'default', title: 'My Project' }])
    setActiveProjectId('default')
    // Use null (the "no project loaded" sentinel) rather than an empty
    // tasks array. The polling fallback skips merges when kanban is null
    // until the next project is loaded, which prevents stale tasks from
    // being repopulated while the workspace switch settles.
    setKanban(null)
    setCustomCols([
      { id: 'To Do',       label: 'To Do',       color: '#6B7280' },
      { id: 'In Progress', label: 'In Progress', color: '#3B82F6' },
      { id: 'Review',      label: 'Review',      color: '#F59E0B' },
      { id: 'Done',        label: 'Done',        color: '#16a34a' },
    ])
    setProjectTitle('')
    seenCtxProjectIdsRef.current = new Set()
    confirmedRemoteIdsRef.current = new Set()
    localChangeAtRef.current = new Map()

    try {
      localStorage.removeItem('teamcollab-projects')
      localStorage.removeItem('teamcollab-active-project')
      // tc-project-* and tc-cols-* are keyed by project id; they get
      // pruned naturally as their projects are loaded/deleted.
    } catch {}
  }, [workspace?.id])

  // ── Connector status ───────────────────────────────────────────────────────
  useEffect(() => {
    if (workspace?.id && authUser?.id) loadConnectorStatus()
  }, [workspace?.id, authUser?.id])

  async function loadConnectorStatus() {
    if (!workspace?.id) return
    try {
      const data = await authedFetch('/api/connectors/status', {
        workspaceId: workspace.id,
        projectId: String(activeProjectId || 'default'),
      })
      if (data.installed) setInstalledConnectors(data.installed)
    } catch (e) {
      console.warn('[tc connectors]', e.message)
    }
  }

  // ── Auto-load from activeProject ──────────────────────────────────────────
  // Only auto-analyse if the user EXPLICITLY arrived via a brief-translator
  // project (section='translator') AND we don't already have a kanban from
  // a previous session. Pure TC boards must never trigger brief analysis.

  useEffect(() => {
    if (!activeProject?.data?.brief) return
    if (activeProject.section === 'team') return
    if (activeProject.kanban?.tasks?.length) return
    const brief = activeProject.data.brief
    const title = activeProject.title || 'Team Project'
    setBriefText(brief)
    setProjectTitle(title)
    addMessage('ai', 'I have loaded the brief for **' + title + '**. Analysing team requirements...')
    handleAnalyseBrief(brief)
  }, [])

  useEffect(() => {
    scrollAnchorRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isTyping])

  useEffect(() => {
    const planning = ALL_SUGGESTIONS.filter(s => s.category === 'planning').sort(() => Math.random() - 0.5)[0]
    const insight = ALL_SUGGESTIONS.filter(s => s.category === 'insight').sort(() => Math.random() - 0.5)[0]
    const action = ALL_SUGGESTIONS.filter(s => s.category === 'action').sort(() => Math.random() - 0.5)[0]
    const any = ALL_SUGGESTIONS.sort(() => Math.random() - 0.5)[0]
    const picks = [planning, insight, action]
    if (!picks.find(p => p?.label === any?.label)) picks.push(any)
    setActiveSuggestions(picks.filter(Boolean).slice(0, 4))
  }, [chatOpen])

  useEffect(() => {
    const el = chatInputRef.current
    if (!el) return
    el.style.height = 'auto'
    const newHeight = Math.min(el.scrollHeight, 160)
    el.style.height = newHeight + 'px'
    el.style.overflowY = el.scrollHeight > 160 ? 'auto' : 'hidden'
  }, [input])

  useEffect(() => {
    if (activeProject?.id) {
      getProjectInvites(activeProject.id)
        .then(setInvites)
        .catch(console.error)
    }
  }, [activeProject?.id])

  // Look up an in-progress AI Builder build for this project so the
  // "Start AI Build" button can flip to "Continue Build" automatically.
  useEffect(() => {
    let cancelled = false
    const pid = activeProject?.id
    if (!pid || pid === 'default' || !authUser?.id) { setActiveAiBuild(null); return }
    ;(async () => {
      const { data } = await supabase
        .from('ai_builds')
        .select('*')
        .eq('project_id', pid)
        .eq('user_id', authUser.id)
        .in('status', ['running', 'paused'])
        .order('created_at', { ascending: false })
        .limit(1)
      if (cancelled) return
      setActiveAiBuild(Array.isArray(data) && data[0] ? data[0] : null)
    })()
    return () => { cancelled = true }
  }, [activeProject?.id, authUser?.id])

  useEffect(() => {
    if (addingToCol) addInputRef.current?.focus()
  }, [addingToCol])

  useEffect(() => {
    if (!openColMenuId) return
    function handleClick(e) {
      if (!e.target.closest('[data-col-menu]')) setOpenColMenuId(null)
    }
    setTimeout(() => document.addEventListener('click', handleClick), 0)
    return () => document.removeEventListener('click', handleClick)
  }, [openColMenuId])

  useEffect(() => {
    if (!showProjectMenu) return
    function handleClick(e) {
      if (projectMenuRef.current && !projectMenuRef.current.contains(e.target)) {
        setShowProjectMenu(false)
        setRenamingProjectId(null)
        setProjectActionMenuId(null)
      }
    }
    setTimeout(() => document.addEventListener('click', handleClick), 0)
    return () => document.removeEventListener('click', handleClick)
  }, [showProjectMenu])

  useEffect(() => {
    if (!projectActionMenuId) return
    function handleClick(e) {
      if (!e.target.closest('[data-project-action]')) setProjectActionMenuId(null)
    }
    setTimeout(() => document.addEventListener('click', handleClick), 0)
    return () => document.removeEventListener('click', handleClick)
  }, [projectActionMenuId])

  // Auto-persist per-project state whenever the board data changes
  useEffect(() => {
    if (!activeProjectId) return
    try {
      const state = { kanban, teamMembers, phase, projectTitle, briefText }
      localStorage.setItem('tc-project-' + activeProjectId, JSON.stringify(state))
    } catch(e) {}
  }, [kanban, teamMembers])

  useEffect(() => {
    // Use ONLY activeProject?.id (not the activeProjectId fallback) so a
    // workspace switch can't load tasks for a project that belongs to the
    // previous workspace. activeProject is gated through the hydrate effect
    // which only sets it when the project exists in ctxProjects (already
    // workspace-scoped).
    const projectId = activeProject?.id
    if (!projectId || projectId === 'default' || !authUser) return
    setTasksLoading(true)
    setTaskLoadError(false)
    // Reset confirmed-IDs for the new project so polling merge starts clean
    confirmedRemoteIdsRef.current = new Set()
    // Also reset the dirty-window map — those timestamps belong to the
    // previous project and would (wrongly) shield stale local tasks here.
    localChangeAtRef.current = new Map()
    loadTasksFromDB(projectId).then(tasks => {
      setTasksLoading(false)
      confirmedRemoteIdsRef.current = new Set(tasks.map(t => t.id))
      console.log('[TC] loadTasksFromDB →', tasks.length, 'tasks for', projectId)
      // Always replace kanban with the new project's tasks — even when
      // tasks.length === 0. Previously we skipped the setKanban call for
      // empty results, which left the OLD project's tasks visible after
      // a cross-device project switch.
      setKanban({
        tasks: tasks || [],
        projectTimeline: '',
        unassignedTasks: [],
        missingRoles: [],
      })
      if (tasks.length > 0) setPhase('kanban')
    }).catch(e => {
      setTasksLoading(false)
      setTaskLoadError(true)
      console.error('[TC] loadTasksFromDB:', e)
    })

    // Also load the project's shared kanban_columns (the Admin's column
    // layout). Falls back to whatever's in localStorage if the DB row
    // hasn't been migrated yet.
    loadProjectSettings(projectId).then(p => {
      if (!p) return
      if (Array.isArray(p.kanban_columns) && p.kanban_columns.length) {
        console.log('[TC] loaded kanban_columns from DB:', p.kanban_columns.length)
        setCustomCols(p.kanban_columns)
        try { localStorage.setItem('tc-cols-' + projectId, JSON.stringify(p.kanban_columns)) } catch {}
      }
      if (p.brief_text != null && !briefText) {
        setBriefText(p.brief_text)
      }
    }).catch(() => {})

    // Fetch project members so we can render their avatars on tasks
    // they're assigned to. Service-role endpoint — works for owners
    // and invited members alike. Falls back to an empty map on error.
    ;(async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const token = session?.access_token
        if (!token) return
        const res = await fetch('/api/invite', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
          body: JSON.stringify({ action: 'list_project_members', projectId }),
        })
        if (!res.ok) return
        const json = await res.json()
        const map = {}
        for (const m of (json.members || [])) {
          map[m.id] = { name: m.name, avatarUrl: m.avatarUrl, email: m.email }
        }
        setProjectMembers(map)
      } catch {}
    })()
    // Re-fire when authUser.user_metadata.avatar_url changes so the user's
    // own avatar shows up on their kanban cards immediately after upload.
  }, [activeProject?.id, activeProjectId, authUser?.id, authUser?.user_metadata?.avatar_url])

  // ── Realtime + polling: keep customCols in sync when the Admin edits ─────
  // Three paths converge on the same setCustomCols:
  //   1. Supabase broadcast on 'tc-cols-<projectId>' (sub-second; fired
  //      directly from saveCustomCols on the other client)
  //   2. postgres_changes UPDATE on projects (realtime, ~1s, requires
  //      REPLICA IDENTITY FULL so the jsonb arrives in payload.new)
  //   3. The 5s polling fallback in AppContext
  function applyIncomingCols(incoming) {
    if (!Array.isArray(incoming) || incoming.length === 0) return
    setCustomCols(prev => {
      if (prev.length === incoming.length
        && prev.every((c, i) => c.id === incoming[i].id && c.label === incoming[i].label && c.color === incoming[i].color)
      ) {
        return prev
      }
      console.log('[TC] customCols updated from remote:', incoming.map(c => c.label).join(', '))
      try { localStorage.setItem('tc-cols-' + (activeProjectId || 'default'), JSON.stringify(incoming)) } catch {}
      return incoming
    })
  }

  // Path 2 + 3 — driven by AppContext's realtime/polling refresh
  useEffect(() => {
    const pid = activeProject?.id
    if (!pid) return
    const fromCtx = ctxProjects?.find(p => p.id === pid)?.kanbanColumns
    const incoming = activeProject?.kanbanColumns || fromCtx
    applyIncomingCols(incoming)
  }, [activeProject?.kanbanColumns, ctxProjects, activeProject?.id])

  // Path 1 — direct broadcast channel for sub-second column updates
  useEffect(() => {
    const pid = activeProject?.id
    if (!pid || pid === 'default' || !authUser) return
    const ch = supabase
      .channel('tc-cols-' + pid, { config: { broadcast: { self: false } } })
      .on('broadcast', { event: 'kanban_columns' }, msg => {
        const cols = msg?.payload?.cols
        if (Array.isArray(cols)) {
          console.log('[TC] customCols broadcast received')
          applyIncomingCols(cols)
        }
      })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [activeProject?.id, authUser?.id])

  // After a page refresh the activeProjectId is restored from localStorage but
  // activeProject (AppContext) is null. Look the project up in ctxProjects
  // and SET it WITHOUT changing the active section — openProject() forces
  // section='document' which navigates the user away from TeamCollab.
  useEffect(() => {
    if (!activeProjectId || activeProjectId === 'default') return
    if (activeProject?.id === activeProjectId) return
    if (!ctxProjects?.length) return
    const found = ctxProjects.find(p => p.id === activeProjectId)
    if (found && setActiveProject) setActiveProject(found)
  }, [activeProjectId, ctxProjects])

  // ── Sync TC's project tabs from AppContext.projects (DB-backed) ───────────
  // ctxProjects is hydrated from the DB on login AND patched by the realtime
  // subscription on the projects table. Mirroring it here means:
  //   - Device B sees Device A's renames / creates / deletes without refresh.
  //   - Invited members see the shared project show up live.
  // We merge with TC's local-only projects (those not yet persisted) so
  // freshly-created tabs don't disappear during the round-trip.
  useEffect(() => {
    if (!Array.isArray(ctxProjects)) return
    setProjects(prev => {
      const ctxById = new Map(
        ctxProjects.map(p => [p.id, { id: p.id, title: p.title || 'Untitled' }])
      )
      const ctxIdSet = new Set(ctxById.keys())
      const prevSeen = seenCtxProjectIdsRef.current

      // If THIS device only has a 'default' placeholder tab but the DB has
      // real projects for this user, drop the placeholder entirely.
      const onlyPlaceholder = prev.length === 1 && prev[0].id === 'default'
      if (onlyPlaceholder && ctxProjects.length > 0) {
        const merged = ctxProjects.map(p => ({ id: p.id, title: p.title || 'Untitled' }))
        try { localStorage.setItem('teamcollab-projects', JSON.stringify(merged)) } catch {}
        seenCtxProjectIdsRef.current = new Set([...prevSeen, ...ctxIdSet])
        return merged
      }

      const merged = []
      const seen = new Set()
      for (const tab of prev) {
        const ctx = ctxById.get(tab.id)
        if (ctx) {
          merged.push({ ...tab, title: ctx.title })
          seen.add(tab.id)
          ctxById.delete(tab.id)
        } else if (prevSeen.has(tab.id)) {
          // This tab WAS in ctxProjects before and is NOT now → another device
          // deleted it. Drop it from the local tab list.
          continue
        } else {
          // Never confirmed by server → local-only pending create. Keep.
          merged.push(tab)
        }
      }
      // Append any new ctxProjects we don't yet have as tabs
      for (const ctx of ctxById.values()) {
        if (!seen.has(ctx.id)) merged.push(ctx)
      }

      seenCtxProjectIdsRef.current = new Set([...prevSeen, ...ctxIdSet])

      const same = merged.length === prev.length &&
        merged.every((m, i) => m.id === prev[i].id && m.title === prev[i].title)
      if (same) return prev
      try { localStorage.setItem('teamcollab-projects', JSON.stringify(merged)) } catch {}
      return merged
    })
  }, [ctxProjects])

  // Keep TC's projectTitle in sync with the renamed project from AppContext
  // (covers the case where Device A renamed and the change arrived via realtime
  // while Device B was viewing that project).
  useEffect(() => {
    if (!activeProjectId || !Array.isArray(ctxProjects)) return
    const found = ctxProjects.find(p => p.id === activeProjectId)
    if (found && found.title && found.title !== projectTitle) {
      setProjectTitle(found.title)
    }
  }, [ctxProjects, activeProjectId])

  // Cross-device active-project sync + deletion handling.
  // Watches both the top-of-list (which signals "Device A is on this now")
  // AND the full id list (which signals "this project was deleted").
  useEffect(() => {
    if (!Array.isArray(ctxProjects) || ctxProjects.length === 0) return

    const activeStillExists = ctxProjects.some(p => p.id === activeProjectId)
    // Local-only = id exists in TC tab list but was never confirmed by server
    // (i.e. brand-new tab the user just created, PATCH still in flight)
    const localOnly = activeProjectId
      && activeProjectId !== 'default'
      && !activeStillExists
      && !seenCtxProjectIdsRef.current.has(activeProjectId)

    // Case A: active project was deleted on another device → switch to top
    if (!activeStillExists && !localOnly && activeProjectId && activeProjectId !== 'default') {
      const target = ctxProjects[0]
      console.log('[TC] active project was deleted remotely, jumping to', target.id)
      setActiveProjectId(target.id)
      try { localStorage.setItem('teamcollab-active-project', target.id) } catch {}
      setProjectTitle(target.title || 'Untitled')
      if (setActiveProject) setActiveProject(target)
      // Clean local cache for the deleted id
      try { localStorage.removeItem('tc-project-' + activeProjectId) } catch {}
      return
    }

    // Case B: Device A switched projects → follow the new top
    const target = ctxProjects[0]
    if (!target?.id) return
    if (target.id === activeProjectId) return
    if (localOnly) return  // don't snap away from a pending-create tab
    console.log('[TC] sync: switching to most-recent project', target.id, target.title)
    setActiveProjectId(target.id)
    try { localStorage.setItem('teamcollab-active-project', target.id) } catch {}
    setProjectTitle(target.title || 'Untitled')
    if (setActiveProject) setActiveProject(target)
  }, [ctxProjects?.[0]?.id, ctxProjects?.length])

  // ── Auto-save tasks to DB ─────────────────────────────────────────────────
  // Fires whenever kanban.tasks OR authUser changes. Debounced 1.5s to batch
  // rapid changes.
  //
  // IMPORTANT: this used to also diff against prev state and call
  // deleteTaskFromDB for any task ID that disappeared from kanban — but that
  // racy "diff and delete" logic would wrongly nuke the OTHER project's
  // tasks during project switches, because:
  //   - localStorage caches can hold task IDs that don't match the fresh DB
  //   - realtime DELETE events for cascaded tasks (from a deleted project)
  //     trim the kanban DURING the project transition, and the deletion
  //     logic then re-sent those deletes for any task that happened to
  //     share the same project_id reference in transit.
  //
  // Explicit user deletes already call deleteTaskFromDB directly inside
  // deleteTaskNow. So this auto-save is upsert-only now.
  useEffect(() => {
    const projectId = activeProjectId || activeProject?.id
    if (!projectId || projectId === 'default' || !authUser || !Array.isArray(kanban?.tasks)) return

    const currentTasks = kanban.tasks
    const snapshotUserId = authUser.id

    async function doSave() {
      if (currentTasks.length > 0) {
        await saveTasksToDB(currentTasks, projectId, snapshotUserId)
      }
    }

    flushSaveRef.current = doSave

    clearTimeout(dbSaveTimerRef.current)
    dbSaveTimerRef.current = setTimeout(doSave, 1500)

    return () => clearTimeout(dbSaveTimerRef.current)
  }, [kanban?.tasks, authUser?.id])

  // Flush any pending save immediately when the component unmounts so navigating
  // away within the debounce window doesn't silently drop changes.
  useEffect(() => {
    return () => {
      clearTimeout(dbSaveTimerRef.current)
      if (flushSaveRef.current) flushSaveRef.current().catch(console.error)
    }
  }, [])

  // ── Real-time task sync (Supabase Realtime) ───────────────────────────────
  // Merges remote changes into local state so team members see updates live.
  // Own writes are ignored (already applied optimistically).
  useEffect(() => {
    const projectId = activeProject?.id
    if (!projectId || projectId === 'default' || !authUser) return

    const channel = supabase
      .channel('tc-tasks-' + projectId)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'tasks',
        filter: `project_id=eq.${projectId}`,
      }, payload => {
        if (payload.eventType === 'INSERT') {
          const t = mapDBTask(payload.new)
          setKanban(prev => {
            if (!prev) return prev
            if (prev.tasks.some(x => x.id === t.id)) return prev // already have it
            return { ...prev, tasks: [...prev.tasks, t] }
          })
        } else if (payload.eventType === 'UPDATE') {
          const t = mapDBTask(payload.new)
          // Ignore remote UPDATE if the user just edited this task locally —
          // prevents flicker between local optimistic state and the broadcast
          // we triggered ourselves arriving milliseconds later.
          const ts = localChangeAtRef.current.get(t.id)
          if (ts && (Date.now() - ts) < 6000) return
          setKanban(prev => {
            if (!prev) return prev
            return { ...prev, tasks: prev.tasks.map(x => x.id === t.id ? { ...x, ...t } : x) }
          })
        } else if (payload.eventType === 'DELETE') {
          const goneId = payload.old?.id
          const ts = goneId && localChangeAtRef.current.get(goneId)
          if (ts && (Date.now() - ts) < 6000) return
          setKanban(prev => {
            if (!prev) return prev
            return { ...prev, tasks: prev.tasks.filter(x => x.id !== goneId) }
          })
        }
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [activeProject?.id, authUser?.id])

  // ── Polling fallback for cross-device task sync ──────────────────────────
  // MERGE not replace — keep any local tasks the server hasn't seen yet so
  // a poll mid-debounce doesn't wipe a freshly-added task.
  //
  // We also track which task IDs have ever been confirmed on the server so
  // we can tell "pending save" (never on server) from "deleted remotely"
  // (was on server, now isn't).
  useEffect(() => {
    const projectId = activeProject?.id
    if (!projectId || projectId === 'default' || !authUser) return

    let cancelled = false
    const refetch = async () => {
      if (document.hidden || cancelled) return
      try {
        const remoteTasks = await loadTasksFromDB(projectId)
        if (cancelled) return
        const remoteIds = new Set(remoteTasks.map(t => t.id))
        const prevSeen = confirmedRemoteIdsRef.current

        setKanban(prev => {
          if (!prev) {
            if (remoteTasks.length === 0) {
              confirmedRemoteIdsRef.current = remoteIds
              return prev
            }
            confirmedRemoteIdsRef.current = remoteIds
            return { tasks: remoteTasks, projectTimeline: '', unassignedTasks: [], missingRoles: [] }
          }

          const remoteById = new Map(remoteTasks.map(t => [t.id, t]))
          const localById = new Map(prev.tasks.map(t => [t.id, t]))
          const now = Date.now()
          const isDirty = (id) => {
            const t = localChangeAtRef.current.get(id)
            return !!t && (now - t) < 6000
          }
          const merged = []
          // For tasks present on remote: use LOCAL if recently modified
          // locally (last 6s) — otherwise the user's column move / edit
          // would flicker back to the stale remote value before the save
          // completes. After 6s the remote is trusted.
          //
          // If a task is dirty BUT not in local, the user just deleted it
          // locally and the remote hasn't caught up yet — skip it entirely
          // so polling doesn't resurrect deleted tasks.
          for (const rt of remoteTasks) {
            if (isDirty(rt.id) && !localById.has(rt.id)) continue // locally deleted, waiting for remote
            if (isDirty(rt.id) && localById.has(rt.id)) {
              merged.push(localById.get(rt.id))
            } else {
              merged.push(rt)
            }
          }

          // Then keep local-only tasks that have NEVER been on the server
          // (pending save). If a local-only task WAS previously confirmed
          // on the server AND it's NOT dirty, it was deleted remotely — drop it.
          // If it IS dirty, the user just created/edited it locally, keep it.
          for (const lt of prev.tasks) {
            if (remoteById.has(lt.id)) continue
            if (prevSeen.has(lt.id) && !isDirty(lt.id)) continue // deleted remotely
            merged.push(lt) // pending save / dirty
          }

          // Skip update if nothing changed (avoid auto-save loop)
          const sameLen = merged.length === prev.tasks.length
          const same = sameLen && merged.every((m, i) => {
            const p = prev.tasks[i]
            return p.id === m.id && p.title === m.title && p.column === m.column &&
              p.priority === m.priority && p.completed === m.completed &&
              p.dueDate === m.dueDate && p.assignedName === m.assignedName &&
              p.position === m.position
          })
          if (same) {
            confirmedRemoteIdsRef.current = new Set([...prevSeen, ...remoteIds])
            return prev
          }
          confirmedRemoteIdsRef.current = new Set([...prevSeen, ...remoteIds])
          return { ...prev, tasks: merged }
        })
      } catch (e) {
        // transient errors get swallowed — next poll retries
      }
    }

    const interval = setInterval(refetch, 5000)
    const onVisibility = () => { if (!document.hidden) refetch() }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('focus', refetch)

    return () => {
      cancelled = true
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('focus', refetch)
    }
  }, [activeProject?.id, authUser?.id])

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
    localChangeAtRef.current.set(taskId, Date.now())
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
    const prevTask = kanban?.tasks?.find(t => t.id === updated.id)
    localChangeAtRef.current.set(updated.id, Date.now())
    setKanban(prev => ({
      ...prev,
      tasks: prev.tasks.map(t => t.id === updated.id ? updated : t),
    }))
    setEditingTask(updated)
    if (authUser) {
      updateTaskInDB(updated).catch(e => {
        console.error('[TC] updateTask:', e)
        if (showToast) showToast('Failed to save changes. Please try again.', 'error')
        if (prevTask) setKanban(prev => prev ? { ...prev, tasks: prev.tasks.map(t => t.id === prevTask.id ? prevTask : t) } : prev)
      })
    }
  }

  function addTaskToBoard(task) {
    const t = { ...task, id: uid(), column: task.column || 'To Do' }
    localChangeAtRef.current.set(t.id, Date.now())
    setKanban(prev => ({ ...prev, tasks: [...(prev.tasks || []), t] }))
  }

  // Creates a fresh empty task and opens the TaskDetailModal on it.
  // The card + the modal appear in the SAME React render so the user
  // doesn't see the task pop onto the board before the modal opens.
  // The DB save happens in the background — the PATCH endpoint upserts
  // so subsequent edits work even if the save is still in flight.
  function createAndOpenTask(column) {
    const newTask = {
      id: uid(),
      title: '',
      description: '',
      column: column || customCols[0]?.id || KANBAN_COLS[0],
      priority: 'MEDIUM',
      estimatedDays: 1,
      assignedRole: '',
      assignedName: '',
    }
    localChangeAtRef.current.set(newTask.id, Date.now())
    setKanban(prev => ({
      ...(prev || {}),
      tasks: [...(prev?.tasks || []), newTask],
      projectTimeline: prev?.projectTimeline || '',
      unassignedTasks: prev?.unassignedTasks || [],
      missingRoles: prev?.missingRoles || [],
    }))
    if (phase !== 'kanban') setPhase('kanban')
    setEditingTask(newTask)
    // Fire-and-forget persistence; PATCH upserts so race is safe.
    saveTaskNow(newTask).catch(e => console.error('[TC] createAndOpenTask save:', e))
  }

  function saveProjects(newProjects) {
    localStorage.setItem('teamcollab-projects', JSON.stringify(newProjects))
  }

  // ── DB helpers ────────────────────────────────────────────────────────────

  // Ensures the project row exists in Supabase before any task insert (FK).
  async function ensureProjectInDB(projectId) {
    if (!authUser || !projectId || projectId === 'default' || activeProject?.isShared) return
    const { error } = await supabase.from('projects').upsert(
      { id: projectId, user_id: authUser.id, workspace_id: workspace?.id || null, title: projectTitle || 'Team Project', updated_at: new Date().toISOString() },
      { onConflict: 'id', ignoreDuplicates: true }
    )
    if (error) throw new Error('project upsert: ' + error.message)
  }

  // Immediately persists a single task to DB via service-role API (bypasses RLS).
  // Sends the FULL kanban.tasks list (with the new task included if not yet
  // there) so position indexes stay sequential — saving just the new task in
  // isolation would set its position to 0 and clobber the existing task at 0.
  async function saveTaskNow(task) {
    const projectId = activeProjectId || activeProject?.id
    if (!projectId || projectId === 'default' || !authUser) return
    const current = kanban?.tasks || []
    const alreadyIn = current.some(t => t.id === task.id)
    const fullList = alreadyIn
      ? current.map(t => t.id === task.id ? task : t)
      : [...current, task]
    await saveTasksToDB(fullList, projectId, authUser.id)
  }

  // Removes a task from state and DB. Optimistic: state is removed first.
  function deleteTaskNow(taskId) {
    localChangeAtRef.current.set(taskId, Date.now())
    setKanban(prev => prev ? { ...prev, tasks: prev.tasks.filter(t => t.id !== taskId) } : prev)
    setEditingTask(null)
    deleteTaskFromDB(taskId).catch(e => console.error('[TC] deleteTask:', e))
  }

  function saveCustomCols(cols) {
    // RBAC: Viewers cannot rename / add / reorder / delete columns.
    if (isViewer) {
      showToast?.('Viewers cannot edit the board layout')
      return
    }
    setCustomCols(cols)
    localStorage.setItem('tc-cols-' + (activeProjectId || 'default'), JSON.stringify(cols))
    // Persist to the DB so collaborators on shared projects see the same
    // column layout. Skip the placeholder 'default' project id.
    const pid = activeProjectId
    if (pid && pid !== 'default' && authUser) {
      try { saveKanbanColumns(pid, cols) } catch (e) { /* fire and forget */ }
      // Fast path: broadcast the new column layout on a per-project
      // realtime channel. Subscribers on other devices apply it without
      // waiting for postgres_changes to roundtrip (~50-200ms vs ~1s+).
      try {
        const ch = supabase.channel('tc-cols-' + pid, { config: { broadcast: { self: false } } })
        ch.subscribe(status => {
          if (status === 'SUBSCRIBED') {
            ch.send({ type: 'broadcast', event: 'kanban_columns', payload: { cols } })
            // Tear down after sending — re-create per save to avoid leak
            setTimeout(() => supabase.removeChannel(ch), 250)
          }
        })
      } catch (e) {
        console.warn('[TC] broadcast columns failed:', e?.message)
      }
    }
  }

  function handleRenameColumn(colId) {
    const col = customCols.find(c => c.id === colId)
    if (col) { setEditingColId(colId); setEditingColLabel(col.label) }
    setOpenColMenuId(null)
  }

  function handleDeleteColumn(colId) {
    if (customCols.length <= 1) { alert('Cannot delete the last column'); return }
    setOpenColMenuId(null)
    setConfirmDeleteColId(colId)
  }

  function confirmDeleteColumn() {
    const colId = confirmDeleteColId
    if (!colId) return
    const targetCol = customCols.find(c => c.id !== colId)?.id
    setKanban(prev => {
      if (!prev?.tasks) return prev
      return { ...prev, tasks: prev.tasks.map(t => t.column === colId ? { ...t, column: targetCol } : t) }
    })
    saveCustomCols(customCols.filter(c => c.id !== colId))
    setConfirmDeleteColId(null)
  }

  function handleMoveColumn(colId, direction) {
    const idx = customCols.findIndex(c => c.id === colId)
    if (idx === -1) return
    if (direction === 'left' && idx === 0) return
    if (direction === 'right' && idx === customCols.length - 1) return
    const newCols = [...customCols]
    const targetIdx = direction === 'left' ? idx - 1 : idx + 1
    ;[newCols[idx], newCols[targetIdx]] = [newCols[targetIdx], newCols[idx]]
    saveCustomCols(newCols)
    setOpenColMenuId(null)
  }

  function getProjectBriefData() {
    const project = projects.find(p => p.id === activeProjectId)
    return {
      colorPalette: project?.briefData?.colorPalette || kanban?.briefData?.colorPalette || null,
      typography: project?.briefData?.typography || kanban?.briefData?.typography || null,
      toneWords: project?.briefData?.toneWords || kanban?.briefData?.toneWords || null,
      industry: project?.briefData?.industry || kanban?.briefData?.industry || null,
      discipline: project?.briefData?.discipline || kanban?.briefData?.discipline || null,
      brandVoice: project?.briefData?.copyVoice || project?.briefData?.brandVoice || null,
      audience: project?.briefData?.targetAudience || project?.briefData?.audience || null,
    }
  }

  function getAutoDesignDefaults(task) {
    const text = (task.title + ' ' + (task.description || '')).toLowerCase()

    const PALETTES = {
      premium: { name: 'Editorial · Premium', primary: '#0A0A0A', accent: '#D4AF37', bg: '#FAFAF7', text: '#0A0A0A', muted: '#737373' },
      tech: { name: 'Tech · Modern', primary: '#0F172A', accent: '#3B82F6', bg: '#FFFFFF', text: '#0F172A', muted: '#64748B' },
      saas: { name: 'SaaS · Clean', primary: '#111827', accent: '#6366F1', bg: '#F9FAFB', text: '#111827', muted: '#6B7280' },
      ecommerce: { name: 'Commerce · Energetic', primary: '#18181B', accent: '#EF4444', bg: '#FFFFFF', text: '#18181B', muted: '#71717A' },
      wellness: { name: 'Wellness · Calm', primary: '#1C1917', accent: '#84CC16', bg: '#FAFAF9', text: '#1C1917', muted: '#78716C' },
      finance: { name: 'Finance · Trust', primary: '#0C4A6E', accent: '#0EA5E9', bg: '#F8FAFC', text: '#0C4A6E', muted: '#475569' },
      creative: { name: 'Creative · Bold', primary: '#1E1B4B', accent: '#F59E0B', bg: '#FFFBEB', text: '#1E1B4B', muted: '#6B7280' },
    }

    const FONT_PAIRS = {
      premium: { display: 'Fraunces', body: 'Inter', rationale: 'Editorial serif paired with neutral sans for readable body' },
      tech: { display: 'Geist', body: 'Geist', rationale: 'Modern geometric sans, consistent through hierarchy' },
      saas: { display: 'Inter', body: 'Inter', rationale: 'System-friendly sans, optimized for UI density' },
      ecommerce: { display: 'Satoshi', body: 'Inter', rationale: 'Bold geometric display with neutral body for products' },
      wellness: { display: 'DM Serif Display', body: 'DM Sans', rationale: 'Warm serif for headings, soft sans for body' },
      finance: { display: 'IBM Plex Sans', body: 'IBM Plex Sans', rationale: 'Confident, technical, institutional feel' },
      creative: { display: 'Clash Display', body: 'Satoshi', rationale: 'High-contrast display with versatile body' },
    }

    let category = 'tech'
    if (/luxury|premium|editorial|magazine|fashion|high.end/i.test(text)) category = 'premium'
    else if (/saas|dashboard|admin|app|tool|platform/i.test(text)) category = 'saas'
    else if (/shop|store|product|cart|ecommerce|retail|gadget/i.test(text)) category = 'ecommerce'
    else if (/health|wellness|fitness|meditation|yoga|mindful/i.test(text)) category = 'wellness'
    else if (/finance|banking|invest|trading|fintech|payment/i.test(text)) category = 'finance'
    else if (/creative|agency|portfolio|art|design.studio/i.test(text)) category = 'creative'

    return { category, palette: PALETTES[category], fonts: FONT_PAIRS[category] }
  }

  // ── Phase 2 AI Builder: confirm mode → create build → open overlay ──
  async function handleAiBuildModeConfirm(mode) {
    if (aiBuildLoading) return
    const pid = activeProject?.id
    if (!pid || !authUser?.id) return
    const todoTasks = (kanban?.tasks || [])
      .filter(t => {
        const c = String(t.column || '').toLowerCase()
        return c === 'to do' || c === 'todo'
      })
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    if (todoTasks.length === 0) {
      showToast?.('No TODO tasks to build.', 'info')
      return
    }
    setAiBuildLoading(true)
    try {
      const build = await createBuild({
        projectId: pid,
        workspaceId: workspace?.id || null,
        userId: authUser.id,
        mode,
        todoTasks,
      })
      setActiveAiBuild(build)
      setAiBuildModeOpen(false)
      setAiBuilderOpen(true)
    } catch (e) {
      console.error('[ai-build start]', e)
      showToast?.('Could not start build: ' + (e.message || 'try again'), 'error')
    } finally {
      setAiBuildLoading(false)
    }
  }

  async function handleGeneratePrompt(task) {
    // Free-plan credit gate (3 credits per AI task prompt)
    if (consumeCredits) {
      const r = await consumeCredits('ai_task_prompt')
      if (!r.ok) return
    }
    setPromptModalTask(task)
    setPromptModalOpen(true)
    setGeneratedPrompt('')
    setGeneratingPrompt(true)
    setPromptCopied(false)
    setPromptError(null)

    try {
      const projectName = projects.find(p => p.id === activeProjectId)?.title || 'Project'
      const briefData = getProjectBriefData()
      const isBriefDerived = task.source !== 'manual' && (briefData.colorPalette || briefData.typography)
      const autoDefaults = !isBriefDerived ? getAutoDesignDefaults(task) : null
      const col = customCols.find(c => c.id === task.column)
      const platform = detectPlatform(task, briefData)
      const pattern = getStructurePattern(task, platform, briefData)
      const taskIcons = getTaskIcons(task)

      // Build a compact design context (keep input tokens low so response fits in 10s)
      let designCtx = ''
      if (isBriefDerived && briefData.colorPalette) {
        const colors = briefData.colorPalette.slice(0, 4).map(c => (c.hex || c.color) + ' ' + (c.name || '')).join(', ')
        const fonts = briefData.typography
          ? (briefData.typography.displayFont || 'Inter') + ' / ' + (briefData.typography.bodyFont || 'Inter')
          : 'Inter'
        designCtx = `Colors: ${colors}\nFonts: ${fonts}`
        if (briefData.toneWords?.length) designCtx += '\nTone: ' + briefData.toneWords.slice(0, 4).join(', ')
      } else if (autoDefaults) {
        const p = autoDefaults.palette
        designCtx = `Colors: ${p.primary} primary, ${p.accent} accent, ${p.bg} bg\nFonts: ${autoDefaults.fonts.display} / ${autoDefaults.fonts.body}`
      }

      const overrides = [
        promptPrefs.colors && 'Colors: ' + promptPrefs.colors,
        promptPrefs.fonts && 'Fonts: ' + promptPrefs.fonts,
        promptPrefs.style && 'Style: ' + promptPrefs.style,
        promptPrefs.references && 'References: ' + promptPrefs.references,
      ].filter(Boolean).join('\n')

      const sections = (pattern.sections || pattern.screens || []).slice(0, 6).join(', ')
      const icons = taskIcons.slice(0, 5).map(i => i.icon).join(', ')

      const promptText = await callClaude(
        PER_TASK_PROMPT_SYSTEM,
        `Generate the structured prompt for this kanban task.

TASK CONTEXT:
  Title: ${task.title}
  ${task.description ? 'Description: ' + task.description : ''}
  Project: ${projectName}
  Platform: ${platform}
  Priority: ${task.priority || 'MEDIUM'}
  Column: ${col?.label || 'To Do'}

BRIEF-DERIVED DESIGN CONTEXT (use this to ground the Creative Direction and Design Approach sections):
${designCtx || 'No explicit palette/type set — pick a deliberate one that fits the brief.'}
${overrides ? '\nUSER OVERRIDES (treat as non-negotiable):\n' + overrides : ''}

STRUCTURE SIGNALS (use to shape Design Approach + Technical Approach):
  Suggested sections: ${sections}
  Motion personality: ${pattern.motion}
  Icon vocabulary (Heroicons): ${icons}

Produce the prompt using the exact 7 section labels from the system instructions. Make every section concrete, opinionated, and award-worthy.`,
        2000
      )

      if (promptText && promptText.length >= 100) {
        setGeneratedPrompt(promptText)
      } else {
        setGeneratedPrompt(buildSeniorPrompt(task, projectName, briefData, autoDefaults, promptPrefs, col?.label))
        setPromptError('AI returned an incomplete response. Showing structured template instead.')
      }
    } catch (e) {
      console.error('[generate prompt]', e)
      const msg = e?.code === 'TIMEOUT'
        ? 'Request timed out — the server took too long. Showing template prompt instead.'
        : e?.data?.code === 'RATE_LIMITED'
        ? 'Daily AI limit reached. Resets at midnight.'
        : e?.status === 401
        ? 'Session expired — please refresh the page.'
        : 'AI unavailable — showing structured template prompt instead.'
      setPromptError(msg)
      const projectNameFb = projects.find(p => p.id === activeProjectId)?.title || 'Project'
      const briefDataFb = getProjectBriefData()
      const isBriefDerivedFb = task.source !== 'manual' && (briefDataFb.colorPalette || briefDataFb.typography)
      const autoDefaultsFb = !isBriefDerivedFb ? getAutoDesignDefaults(task) : null
      const colFb = customCols.find(c => c.id === task.column)
      setGeneratedPrompt(buildSeniorPrompt(task, projectNameFb, briefDataFb, autoDefaultsFb, promptPrefs, colFb?.label))
    } finally {
      setGeneratingPrompt(false)
    }
  }

  function extractKeyword(text) {
    const stopwords = new Set([
      'the','a','an','for','to','of','and','or','but','build','create','design',
      'page','site','website','app','need','want','make','this','that','my','our',
      'with','from','add','new'
    ])
    const words = text.replace(/[^\w\s]/g,'').split(/\s+/).filter(w => w.length > 3 && !stopwords.has(w))
    return words[0] || ''
  }

  function buildUnsplashUrl(query) {
    return 'https://unsplash.com/s/photos/' + encodeURIComponent(query)
  }

  function buildPexelsUrl(query) {
    return 'https://www.pexels.com/search/' + encodeURIComponent(query) + '/'
  }

  function buildFreepikUrl(query) {
    return 'https://www.freepik.com/search?format=search&query=' + encodeURIComponent(query)
  }

  function getImageQueries(task, briefData, pattern, platform) {
    const text = (task.title + ' ' + (task.description || '')).toLowerCase()
    const industry = briefData?.industry || ''
    const queries = []
    const sections = pattern?.sections || pattern?.screens || []

    sections.forEach((section, i) => {
      const s = section.toLowerCase()
      if (/hero|splash|opening/i.test(s)) {
        queries.push({
          section: 'Hero / Opening',
          type: i % 3 === 0 ? 'photo' : i % 3 === 1 ? '3d render' : 'illustration',
          query: industry || extractKeyword(text) || 'cinematic minimal',
          notes: 'Full-bleed, high contrast, works with overlay text',
        })
      } else if (/product|gallery/i.test(s)) {
        queries.push({
          section: 'Product imagery',
          type: 'photo',
          query: 'product photography studio clean white',
          notes: 'Consistent crop and lighting across all products',
        })
      } else if (/feature|bento/i.test(s)) {
        queries.push({
          section: 'Feature illustrations',
          type: 'illustration',
          query: 'abstract geometric shapes gradient',
          notes: 'Custom illustrations preferred over stock — keep style consistent',
        })
      } else if (/team|founder|about/i.test(s)) {
        queries.push({
          section: 'Team / Portrait',
          type: 'photo',
          query: 'portrait professional natural light',
          notes: 'Editorial style portraits, soft lighting',
        })
      } else if (/testimonial|review|customer/i.test(s)) {
        queries.push({
          section: 'Testimonial portraits',
          type: 'photo',
          query: 'professional headshot diverse',
          notes: 'Square crop, consistent background style',
        })
      } else if (/lifestyle|story/i.test(s)) {
        queries.push({
          section: 'Lifestyle / Storytelling',
          type: 'photo',
          query: (industry || 'modern') + ' lifestyle cinematic',
          notes: 'Candid moments, real people, avoid stock-photo feel',
        })
      } else if (/3d|webgl|render|scene/i.test(s)) {
        queries.push({
          section: '3D render',
          type: '3d render',
          query: '3d render ' + (extractKeyword(text) || 'abstract object'),
          notes: 'Three.js scene or static render with consistent lighting',
        })
      } else if (/mockup|demo/i.test(s)) {
        queries.push({
          section: 'UI mockup',
          type: 'mockup',
          query: 'app interface mockup ' + (platform === 'mobile' ? 'mobile' : 'desktop'),
          notes: 'Use real product screenshots in browser/device frames',
        })
      }
    })

    if (queries.length === 0) {
      queries.push({
        section: 'Primary imagery',
        type: 'photo',
        query: extractKeyword(text) || industry || 'modern minimal',
        notes: 'Set the tone for the whole design',
      })
    }
    return queries
  }

  function getTaskIcons(task) {
    const text = (task.title + ' ' + (task.description || '')).toLowerCase()
    const iconMap = []
    if (/nav|menu|header/i.test(text)) {
      iconMap.push({ use: 'Mobile menu toggle', icon: 'Bars3Icon' })
      iconMap.push({ use: 'Close menu', icon: 'XMarkIcon' })
    }
    if (/cart|shop|ecommerce|product/i.test(text)) {
      iconMap.push({ use: 'Cart', icon: 'ShoppingCartIcon' })
      iconMap.push({ use: 'Add to cart', icon: 'PlusIcon' })
      iconMap.push({ use: 'Wishlist / Favorite', icon: 'HeartIcon' })
      iconMap.push({ use: 'Quick view', icon: 'EyeIcon' })
    }
    if (/search|filter/i.test(text)) {
      iconMap.push({ use: 'Search', icon: 'MagnifyingGlassIcon' })
      iconMap.push({ use: 'Filter', icon: 'AdjustmentsHorizontalIcon' })
      iconMap.push({ use: 'Sort', icon: 'BarsArrowDownIcon' })
    }
    if (/auth|login|sign|user|profile|account/i.test(text)) {
      iconMap.push({ use: 'Email field', icon: 'EnvelopeIcon' })
      iconMap.push({ use: 'Password field', icon: 'LockClosedIcon' })
      iconMap.push({ use: 'Show / hide password', icon: 'EyeIcon · EyeSlashIcon' })
      iconMap.push({ use: 'User avatar fallback', icon: 'UserCircleIcon' })
    }
    if (/dashboard|analytics|stats|metric/i.test(text)) {
      iconMap.push({ use: 'Home / overview', icon: 'HomeIcon' })
      iconMap.push({ use: 'Analytics chart', icon: 'ChartBarIcon' })
      iconMap.push({ use: 'Trend up', icon: 'ArrowTrendingUpIcon' })
      iconMap.push({ use: 'Trend down', icon: 'ArrowTrendingDownIcon' })
      iconMap.push({ use: 'Notifications', icon: 'BellIcon' })
      iconMap.push({ use: 'Settings', icon: 'Cog6ToothIcon' })
    }
    if (/calendar|date|schedule|event/i.test(text)) {
      iconMap.push({ use: 'Date picker', icon: 'CalendarDaysIcon' })
      iconMap.push({ use: 'Clock / time', icon: 'ClockIcon' })
    }
    if (/landing|hero|cta/i.test(text)) {
      iconMap.push({ use: 'Primary CTA arrow', icon: 'ArrowRightIcon' })
      iconMap.push({ use: 'Play video', icon: 'PlayIcon' })
      iconMap.push({ use: 'Sparkle accent', icon: 'SparklesIcon' })
    }
    if (/feature|benefit|why/i.test(text)) {
      iconMap.push({ use: 'Lightning fast', icon: 'BoltIcon' })
      iconMap.push({ use: 'Secure', icon: 'ShieldCheckIcon' })
      iconMap.push({ use: 'Checkmark', icon: 'CheckCircleIcon' })
      iconMap.push({ use: 'Star rating', icon: 'StarIcon' })
    }
    if (/social|share|community/i.test(text)) {
      iconMap.push({ use: 'Share', icon: 'ShareIcon' })
      iconMap.push({ use: 'Comment', icon: 'ChatBubbleLeftIcon' })
      iconMap.push({ use: 'Like', icon: 'HandThumbUpIcon' })
    }
    if (/upload|file|attach|document/i.test(text)) {
      iconMap.push({ use: 'Upload', icon: 'ArrowUpTrayIcon' })
      iconMap.push({ use: 'Document', icon: 'DocumentIcon' })
      iconMap.push({ use: 'Paperclip', icon: 'PaperClipIcon' })
    }
    if (/message|chat|inbox|email/i.test(text)) {
      iconMap.push({ use: 'Chat', icon: 'ChatBubbleLeftRightIcon' })
      iconMap.push({ use: 'Send', icon: 'PaperAirplaneIcon' })
      iconMap.push({ use: 'Email', icon: 'EnvelopeIcon' })
    }
    if (/setting|config|admin/i.test(text)) {
      iconMap.push({ use: 'Settings', icon: 'Cog6ToothIcon' })
      iconMap.push({ use: 'More options', icon: 'EllipsisHorizontalIcon' })
    }
    if (iconMap.length === 0) {
      iconMap.push({ use: 'Forward action', icon: 'ArrowRightIcon' })
      iconMap.push({ use: 'Back action', icon: 'ArrowLeftIcon' })
      iconMap.push({ use: 'Close', icon: 'XMarkIcon' })
      iconMap.push({ use: 'Confirm', icon: 'CheckIcon' })
    }
    return iconMap
  }

  function detectPlatform(task, briefData) {
    const text = (task.title + ' ' + (task.description || '')).toLowerCase()
    const discipline = briefData?.discipline
    if (discipline?.platform) {
      const p = discipline.platform.toLowerCase()
      if (p.includes('mobile') || p.includes('ios') || p.includes('android')) return 'mobile'
      if (p.includes('desktop')) return 'desktop'
      if (p.includes('web')) return 'website'
    }
    if (/\b(ios|android|mobile\s*app|native\s*app|react\s*native|expo|swift|swiftui|kotlin|flutter)\b/i.test(text)) return 'mobile'
    if (/\b(app\s*store|play\s*store|tab\s*bar|bottom\s*nav|push\s*notif)\b/i.test(text)) return 'mobile'
    if (/\b(electron|tauri|desktop\s*app|macos\s*app|windows\s*app)\b/i.test(text)) return 'desktop'
    return 'website'
  }

  function getStructurePattern(task, platform, briefData) {
    const text = (task.title + ' ' + (task.description || '')).toLowerCase()
    const seed = (task.id || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0)
    const variant = (seed + new Date().getHours()) % 3
    if (platform === 'mobile') return getMobilePattern(text, variant)
    if (platform === 'desktop') return getDesktopPattern(text, variant)
    return getWebsitePattern(text, variant)
  }

  function getMobilePattern(text, variant) {
    if (/shop|product|cart|store|ecommerce|gadget/i.test(text)) {
      const patterns = [
        {
          name: 'Discovery-first',
          screens: [
            'Splash → quick brand reveal with logo bloom',
            'Onboarding (3 swipeable cards) — each with a 3D product render',
            'Home — large discover hero, horizontal category chips, curated rails (New, Trending, For You)',
            'Product detail — image gallery with parallax, sticky add-to-cart bar, expandable specs',
            'Cart — drag-to-remove with haptic, animated total counter',
            'Checkout — single-screen with progressive reveal',
            'Profile — circular avatar header over gradient',
            'Wishlist with empty illustration',
          ],
          motion: 'Hero parallax on scroll, shared element transitions between list and detail, spring-physics on add-to-cart',
        },
        {
          name: 'Story-driven',
          screens: [
            'Splash — typography-only reveal',
            'Tabbed home with snap-scroll collections',
            'Story-format product browse (full-screen swipeable like Instagram stories)',
            'Quick-buy flow with thumb-reachable controls',
            'Live order tracking screen with animated timeline',
            'Reviews tab with photo grid',
            'Settings as a list with grouped sections',
          ],
          motion: 'Story-style horizontal paging, drawer-like detail sheets, FLIP animation between states',
        },
        {
          name: 'Personal shopper',
          screens: [
            'Onboarding quiz — single-question-per-screen with progress ring',
            'Personalized home — feed of cards, each with reasoning ("Picked because you liked X")',
            'Product card flow with swipe-left-to-skip / swipe-right-to-save',
            'Saved items as a magazine grid',
            'Chat-style support with animated typing indicator',
            'Profile with style preferences as colored chips',
          ],
          motion: 'Tinder-style card stack, progress ring fills, chat bubble spring entrance',
        },
      ]
      return patterns[variant]
    }
    if (/fitness|health|workout|run|yoga|meditat|wellness/i.test(text)) {
      const patterns = [
        {
          name: 'Coach-led',
          screens: [
            'Splash with breathing animation',
            'Goal selection — large illustration cards',
            'Daily dashboard — circular progress for streaks, today\'s plan, mood check-in',
            'Workout active screen — full-bleed video with animated timer, large pause/skip',
            'Rest screen with breathing circle animation',
            'Stats — animated graphs that draw on entry',
          ],
          motion: 'Breathing circle pulse, graph line draw-on, count-up numbers',
        },
        {
          name: 'Habit-based',
          screens: [
            'Onboarding — habit picker grid',
            'Today screen — habits as tappable rings that fill on completion',
            'Detailed habit screen with streak calendar heatmap',
            'Insights with weekly/monthly tabs and animated chart transitions',
            'Achievements — confetti on unlock',
            'Profile with photo, level, badges',
          ],
          motion: 'Ring fill on tap, confetti particle burst, heatmap cell pulse',
        },
        {
          name: 'Class-format',
          screens: [
            'Browse classes — large hero card, filter pills',
            'Class detail with instructor profile, equipment list, preview video',
            'Pre-workout countdown screen (3-2-1)',
            'Class player — picture-in-picture instructor + main demo',
            'Post-class summary with stats and rating prompt',
            'Schedule with calendar strip',
          ],
          motion: 'Countdown number scale-out, PiP slide-in, calendar strip snap',
        },
      ]
      return patterns[variant]
    }
    if (/social|chat|message|community|feed/i.test(text)) {
      const patterns = [
        {
          name: 'Feed-first',
          screens: [
            'Pull-to-refresh feed with parallax cards',
            'Compose — full-screen overlay with media options',
            'Profile with tabbed content (posts, media, likes)',
            'Direct messages with bubble tail animation',
            'Search with trending pills',
            'Notifications grouped by type',
          ],
          motion: 'Pull-to-refresh elastic, message bubble slide-in, tab underline morph',
        },
        {
          name: 'Stories-first',
          screens: [
            'Top stories rail (circular avatars with gradient ring)',
            'Full-screen story viewer with tap-to-skip and progress bars',
            'Camera screen with filter carousel',
            'Inbox with unread dot animation',
            'Discover grid (3-column masonry)',
          ],
          motion: 'Story progress bar fill, gradient ring rotate on new content, masonry stagger',
        },
        {
          name: 'Conversation-first',
          screens: [
            'Conversations list with last message preview',
            'Chat screen with smart reply suggestions',
            'Voice message with animated waveform',
            'Group settings with member chips',
            'Compose new message with contact search',
          ],
          motion: 'Waveform pulse on play, message reaction bounce, typing dots',
        },
      ]
      return patterns[variant]
    }
    const defaults = [
      {
        name: 'Tab-based standard',
        screens: ['Splash with brand reveal', 'Bottom tab bar with 4 main areas', 'Home tab with hero + content rails', 'Detail screens with sticky header', 'Profile / Settings tab'],
        motion: 'Tab switch crossfade, sticky header collapse on scroll',
      },
      {
        name: 'Single-flow focused',
        screens: ['Splash', 'Single primary screen with floating action button', 'Modal overlays for secondary actions', 'Slide-up drawer for settings'],
        motion: 'FAB scale-out, modal slide-up with backdrop fade',
      },
      {
        name: 'Card-deck',
        screens: ['Splash', 'Stack of card-screens that swipe horizontally', 'Per-card detail with shared element transition', 'Bottom sheet for actions'],
        motion: 'Card swipe with rotation, shared element morph, bottom sheet drag',
      },
    ]
    return defaults[variant]
  }

  function getWebsitePattern(text, variant) {
    if (/shop|product|cart|store|ecommerce|gadget/i.test(text)) {
      const patterns = [
        {
          name: 'Editorial commerce',
          sections: [
            'Sticky transparent nav that inverts on scroll',
            'Editorial hero — full-bleed photo with overlay headline + price tag',
            'Manifesto strip — large typographic statement on cream background',
            'Asymmetric product grid (mix of large and small cards)',
            'In-context lifestyle gallery (parallax)',
            'Founder story with portrait and pull-quote',
            'Newsletter as full-bleed section with single input',
            'Footer with sitemap',
          ],
          motion: 'Nav invert on scroll, lifestyle parallax, image reveal masks, magnetic CTA',
        },
        {
          name: 'Storefront-first',
          sections: [
            'Top promo banner (dismissible)',
            'Sticky nav with mega-menu',
            'Hero with rotating featured product (3D model if possible)',
            'Category tile grid (4 across)',
            'Best-sellers carousel with arrows',
            'Customer photo wall (UGC grid)',
            'Reviews with star average + individual cards',
            'Trust strip (returns, shipping, support)',
            'Footer',
          ],
          motion: '3D product rotation on mouse, carousel snap, UGC tile lift on hover',
        },
        {
          name: 'Single-product showcase',
          sections: [
            'Minimal nav (logo + cart only)',
            'Full-screen hero with product centered, animated entrance',
            'Scroll-driven product story (3-4 pinned sections, each reveals a feature with animation)',
            'Specs comparison table',
            'Buy section — sticky on right while content scrolls',
            'FAQ accordion',
            'Footer',
          ],
          motion: 'Scroll-pinned sections, GSAP timeline, sticky buy panel with smooth handoff',
        },
      ]
      return patterns[variant]
    }
    if (/saas|dashboard|platform|tool|software|analytics/i.test(text)) {
      const patterns = [
        {
          name: 'Product-led',
          sections: [
            'Top nav with login + free trial CTA',
            'Hero with animated product UI mockup (browser frame)',
            'Logo cloud (greyscale, hover colorize)',
            'Three-column features with inline animated demos',
            'Long-form scroll showcasing each feature with screenshots',
            'Comparison table vs competitors',
            'Pricing with toggle (monthly / annual)',
            'Final CTA with email capture',
            'Footer with extensive sitemap',
          ],
          motion: 'Browser frame parallax, feature demos auto-cycle, pricing toggle with smooth number morph',
        },
        {
          name: 'Bento-style',
          sections: [
            'Hero with 3-line manifesto + single CTA',
            'Bento grid (Apple-style) — mixed-size cards each highlighting one feature with illustration',
            'Quote testimonial as full-bleed section',
            'Process / how it works with horizontal scroll-snap',
            'Pricing as 3 cards with one highlighted',
            'CTA banner',
            'Footer',
          ],
          motion: 'Bento card hover lift + illustration play, horizontal scroll-snap with progress dots',
        },
        {
          name: 'Use-case driven',
          sections: [
            'Nav',
            'Hero focused on customer outcome (not product)',
            'Three persona tabs — content morphs based on selection',
            'Customer story carousel with logo + quote + metric',
            'Workflow diagram as animated illustration',
            'Integration grid (logos)',
            'Pricing',
            'Footer',
          ],
          motion: 'Persona tab content morph, workflow arrows draw on scroll, integration grid stagger',
        },
      ]
      return patterns[variant]
    }
    if (/portfolio|agency|studio|creative|designer|freelance/i.test(text)) {
      const patterns = [
        {
          name: 'Project-first',
          sections: [
            'Custom cursor + minimal nav',
            'Full-screen hero with name and role typed letter-by-letter',
            'Marquee scroll text with services',
            'Project grid with hover video preview',
            'About section as a long-form paragraph with key facts highlighted',
            'Awards / recognition list',
            'Contact as a large form with cursor-following effect',
          ],
          motion: 'Custom cursor with magnetic targets, marquee infinite scroll, project hover video play',
        },
        {
          name: 'Magazine-style',
          sections: [
            'Editorial nav with fine serif',
            'Asymmetric hero — large image + overlapping text',
            'Issue-style table of contents for projects',
            'Each project as a chapter with pull-quote and gallery',
            'Manifesto / approach section',
            'Press / mentions logo strip',
            'Studio info + contact',
          ],
          motion: 'Image reveal masks, editorial pull-quote slide-in, chapter scroll progress',
        },
        {
          name: 'Experimental',
          sections: [
            'WebGL hero canvas with mouse-reactive shader',
            'Project list as a draggable spatial canvas',
            'Modal project view with image gallery and case study',
            'About as a typographic essay',
            'Contact via ASCII-style layout',
          ],
          motion: 'WebGL shader morph, draggable spatial nav, modal crossfade',
        },
      ]
      return patterns[variant]
    }
    const defaults = [
      {
        name: 'Editorial-modern',
        sections: [
          'Minimal nav — logo + 4 links + CTA',
          'Hero with large headline + supporting paragraph + dual CTA',
          'Visual feature strip (3 columns with illustrations)',
          'Long-form story section with pull-quotes',
          'Image gallery (masonry)',
          'Final CTA banner',
          'Footer',
        ],
        motion: 'Headline char-stagger, image reveal on scroll, magnetic CTA',
      },
      {
        name: 'Conversion-focused',
        sections: [
          'Sticky nav with prominent CTA',
          'Hero with social proof under fold',
          'Problem statement section',
          'Solution / features (3 bento cards)',
          'How it works (numbered steps)',
          'Testimonial wall',
          'Pricing or CTA',
          'FAQ',
          'Footer with newsletter',
        ],
        motion: 'Steps draw connecting line on scroll, testimonial wall hover pause, FAQ accordion smooth open',
      },
      {
        name: 'Showcase-style',
        sections: [
          'Floating nav (centered pill)',
          'Hero with full-bleed video or 3D scene',
          'Marquee logos / text strip',
          'Showcase grid with mixed media',
          'Detailed feature with side-by-side visual + copy',
          'Customer outcomes (numbers + quote)',
          'CTA with email capture',
          'Footer',
        ],
        motion: '3D scene mouse-react, marquee auto-scroll, number count-up on view',
      },
    ]
    return defaults[variant]
  }

  function getDesktopPattern(text, variant) {
    return {
      name: 'Productivity desktop app',
      sections: [
        'Title bar (custom traffic lights on macOS)',
        'Left sidebar (icon-only collapsible)',
        'Secondary panel (resizable)',
        'Main content area with tabs',
        'Right inspector panel (toggleable)',
        'Bottom status bar with subtle stats',
        'Command palette (Cmd+K)',
      ],
      motion: 'Sidebar collapse spring, panel resize handle hover, command palette fade-scale in',
    }
  }

  function buildSeniorPrompt(task, project, briefData, autoDefaults, prefs, status) {
    const platform = detectPlatform(task, briefData)
    const pattern = getStructurePattern(task, platform, briefData)
    const imageQueries = getImageQueries(task, briefData, pattern, platform)
    const taskIconsList = getTaskIcons(task)

    const isMobile = platform === 'mobile'
    const isDesktop = platform === 'desktop'
    const lines = []

    // ── SCOPE ──────────────────────────────────────────────────────────────
    lines.push('━━━ SCOPE ━━━')
    lines.push('Build: ' + task.title)
    lines.push('Platform: ' + platform.toUpperCase())
    if (task.description) { lines.push(''); lines.push(task.description) }
    lines.push('')

    // ── STRUCTURE PATTERN ──────────────────────────────────────────────────
    lines.push('━━━ STRUCTURE PATTERN: ' + pattern.name.toUpperCase() + ' ━━━')
    lines.push('Follow this specific pattern — do not invent a different structure.')
    lines.push('')

    // ── DESIGN DIRECTION ───────────────────────────────────────────────────
    lines.push('━━━ DESIGN DIRECTION ━━━')
    if (prefs?.colors) { lines.push('Colors (user-specified):'); lines.push('  ' + prefs.colors) }
    else if (briefData?.colorPalette?.length) {
      lines.push('Brand Colors (from project brief):')
      briefData.colorPalette.forEach(c => lines.push('  ' + (c.hex || c.color) + '  ' + (c.name || '') + (c.usage ? '  · ' + c.usage : '')))
    } else if (autoDefaults) {
      const p = autoDefaults.palette
      lines.push('Color Palette: ' + p.name)
      lines.push('  Primary    ' + p.primary); lines.push('  Accent     ' + p.accent)
      lines.push('  Background ' + p.bg); lines.push('  Text       ' + p.text)
      lines.push('  Muted      ' + p.muted)
    }
    lines.push('')
    if (prefs?.fonts) { lines.push('Typography (user-specified):'); lines.push('  ' + prefs.fonts) }
    else if (briefData?.typography) {
      lines.push('Typography (from project brief):')
      lines.push('  Display: ' + (briefData.typography.displayFont || briefData.typography.heading || 'Inter'))
      lines.push('  Body:    ' + (briefData.typography.bodyFont || briefData.typography.body || 'Inter'))
    } else if (autoDefaults) {
      lines.push('Typography:')
      lines.push('  Display: ' + autoDefaults.fonts.display)
      lines.push('  Body:    ' + autoDefaults.fonts.body)
      lines.push('  · ' + autoDefaults.fonts.rationale)
    }
    lines.push('')
    if (isMobile) {
      lines.push('Spacing: 4, 8, 12, 16, 20, 24, 32 (mobile-tight scale)')
      lines.push('Border radius: 12px (buttons), 16px (cards), 20px (sheets)')
      lines.push('Shadows: none default · 0 4px 20px rgba(0,0,0,0.10) overlay')
    } else {
      lines.push('Spacing scale: 4, 8, 12, 16, 24, 32, 48, 64, 96')
      lines.push('Border radius: 8px (buttons), 12px (cards), 16px (modals)')
      lines.push('Shadows: 0 1px 3px rgba(0,0,0,0.05) default · 0 8px 24px rgba(0,0,0,0.08) overlay')
    }
    if (prefs?.style) { lines.push(''); lines.push('Style override: ' + prefs.style) }
    if (prefs?.references) { lines.push('References: ' + prefs.references) }
    lines.push('')

    // ── LAYOUT ─────────────────────────────────────────────────────────────
    const screenItems = pattern.screens || pattern.sections || []
    if (isMobile) {
      lines.push('━━━ SCREEN FLOW ━━━')
      screenItems.forEach((s, i) => lines.push((i + 1) + '. ' + s))
    } else {
      lines.push('━━━ LAYOUT & SECTIONS ━━━')
      screenItems.forEach(s => lines.push('• ' + s))
    }
    lines.push('')

    // ── IMAGERY ────────────────────────────────────────────────────────────
    lines.push('━━━ IMAGERY ━━━')
    lines.push('Use typed imagery matched to each section:')
    lines.push('')
    imageQueries.forEach(q => {
      lines.push('[' + q.type.toUpperCase() + '] ' + q.section)
      lines.push('  Search: ' + buildUnsplashUrl(q.query))
      lines.push('  Pexels: ' + buildPexelsUrl(q.query))
      if (q.type === '3d render') lines.push('  3D tool: https://spline.design')
      if (q.type === 'illustration') lines.push('  Illustration: https://undraw.co')
      if (q.type === 'mockup') lines.push('  Mockup tool: https://rotato.app')
      if (q.notes) lines.push('  Notes: ' + q.notes)
      lines.push('')
    })
    if (isMobile) {
      lines.push('Image guidelines:')
      lines.push('  • Use Image from expo-image with contentFit="cover" and placeholder blurhash')
      lines.push('  • Avoid loading large images above the fold — use progressive reveal')
      lines.push('  • All images must have accessible alt/accessibilityLabel text')
    } else {
      lines.push('Image guidelines:')
      lines.push('  • Always use next/image with proper width, height, and alt')
      lines.push('  • Lazy-load below-the-fold images')
      lines.push('  • Hero images: 1920×1080 or 2400×1600 for retina')
      lines.push('  • Use blurhash or LQIP for placeholder while loading')
      lines.push('  • All images must have descriptive alt text for a11y')
    }
    lines.push('')

    // ── COMPONENTS ─────────────────────────────────────────────────────────
    lines.push('━━━ COMPONENTS ━━━')
    if (isMobile) {
      lines.push('• Pressable with haptic feedback (Haptics.impactAsync) on all tappable cards')
      lines.push('• Bottom sheet (react-native-bottom-sheet) for overlays — avoid native modals')
      lines.push('• Tab bar: 4-5 items with active indicator pill')
      lines.push('• Swipeable list rows (react-native-gesture-handler)')
      lines.push('• SkeletonPlaceholder for loading states')
      lines.push('• Toast via react-native-toast-message — top position, auto-dismiss 3s')
    } else if (isDesktop) {
      lines.push('• Menu bar integration with native OS menus')
      lines.push('• Resizable sidebar (drag handle, collapsible)')
      lines.push('• Context menu on right-click')
      lines.push('• Keyboard shortcut display in tooltips (Cmd/Ctrl+K pattern)')
      lines.push('• Window chrome: traffic-light controls or custom titlebar')
      lines.push('• Toast: bottom-right, auto-dismiss 4s')
    } else {
      lines.push('• Button: primary, secondary, ghost — hover/active/disabled states')
      lines.push('• Input: floating label, error state, helper text')
      lines.push('• Modal: backdrop blur, centered card, escape to close')
      lines.push('• Toast: bottom-right, auto-dismiss 4s')
      lines.push('• Dropdown menu with keyboard navigation')
    }
    lines.push('')

    // ── MOTION ─────────────────────────────────────────────────────────────
    lines.push('━━━ INTERACTIONS & MOTION ━━━')
    lines.push('Pattern motion: ' + pattern.motion)
    lines.push('')
    if (isMobile) {
      lines.push('• Tap: scale 0.97, 80ms — all pressables')
      lines.push('• Screen transitions: shared element (react-navigation sharedElements)')
      lines.push('• Scroll: sticky header collapses with interpolation')
      lines.push('• Pull-to-refresh: custom Lottie animation')
      lines.push('• Swipe gestures: dismiss, archive, reply')
      lines.push('• Respect prefers-reduced-motion via AccessibilityInfo.isReduceMotionEnabled')
    } else {
      lines.push('• Hover: translateY(-2px) + shadow expand, 200ms ease-out')
      lines.push('• Active/click: scale 0.98, 100ms')
      lines.push('• Page enter: fade-up + stagger children, 80ms delay each')
      lines.push('• Modal enter: fade + scale 0.96 → 1, 250ms ease-out')
      lines.push('• Smooth scroll for anchor links')
      lines.push('• Respect prefers-reduced-motion')
    }
    lines.push('')

    // ── ICONS ──────────────────────────────────────────────────────────────
    lines.push('━━━ ICONS ━━━')
    if (isMobile) {
      lines.push('Use Heroicons exclusively (@heroicons/react-native/24/outline).')
      lines.push('No Expo vector icons. No emojis as icons.')
    } else {
      lines.push('Use Heroicons exclusively (@heroicons/react/24/outline).')
      lines.push('No Lucide. No Font Awesome. No emojis as icons.')
    }
    lines.push('')
    lines.push('Specific icons for this task:')
    taskIconsList.forEach(item => {
      lines.push('  ' + item.icon.padEnd(32) + ' · ' + item.use)
    })
    lines.push('')
    lines.push('Browse all icons: https://heroicons.com')
    lines.push('')

    // ── STATES ─────────────────────────────────────────────────────────────
    lines.push('━━━ STATES ━━━')
    lines.push('Every component must define:')
    lines.push('• Default · Hover · Active / pressed · Focus (visible ring) · Disabled')
    lines.push('• Loading (skeleton or spinner) · Empty (illustration + CTA) · Error (with retry) · Success (confirmation)')
    lines.push('')

    // ── TECH STACK ─────────────────────────────────────────────────────────
    lines.push('━━━ TECH STACK ━━━')
    if (isMobile) {
      lines.push('• React Native + Expo (SDK 51)')
      lines.push('• TypeScript (strict)')
      lines.push('• NativeWind for styling (Tailwind on RN)')
      lines.push('• React Navigation 6 (Stack + Tab + Bottom Sheet)')
      lines.push('• React Native Reanimated 3 + Gesture Handler')
      lines.push('• @heroicons/react-native for icons')
      lines.push('• Zustand for state')
      lines.push('• expo-image for optimized images')
    } else if (isDesktop) {
      lines.push('• Tauri 2 (Rust backend) or Electron 31')
      lines.push('• React 18 + TypeScript (strict)')
      lines.push('• Tailwind CSS + shadcn/ui')
      lines.push('• Framer Motion for animations')
      lines.push('• @heroicons/react for icons')
      lines.push('• Zustand for state')
    } else {
      lines.push('• Next.js 14 (App Router)')
      lines.push('• TypeScript (strict)')
      lines.push('• Tailwind CSS')
      lines.push('• shadcn/ui as component base')
      lines.push('• Framer Motion for animations')
      lines.push('• @heroicons/react for icons')
    }
    lines.push('')

    // ── ACCEPTANCE CRITERIA ────────────────────────────────────────────────
    lines.push('━━━ ACCEPTANCE CRITERIA ━━━')
    lines.push('Pattern: ' + pattern.name)
    if (isMobile) {
      lines.push('✓ All screens in the ' + pattern.name + ' flow are implemented')
      lines.push('✓ Shared element transitions work between list and detail screens')
      lines.push('✓ Bottom tab bar is accessible with correct active states')
      lines.push('✓ Pull-to-refresh works on all scrollable screens')
      lines.push('✓ Haptic feedback fires on primary taps')
      lines.push('✓ All images load with placeholder and correct aspect ratio')
      lines.push('✓ Offline / empty states show illustrations + retry CTA')
      lines.push('✓ VoiceOver / TalkBack passes on primary flow')
    } else if (isDesktop) {
      lines.push('✓ All sections in the ' + pattern.name + ' layout are implemented')
      lines.push('✓ Sidebar resizes and collapses correctly')
      lines.push('✓ All keyboard shortcuts display in tooltips and work')
      lines.push('✓ Context menus appear on right-click')
      lines.push('✓ Window can be resized without layout breakage (min 900×600)')
      lines.push('✓ All states handled (loading, empty, error, success)')
    } else {
      lines.push('✓ All sections in the ' + pattern.name + ' layout are implemented')
      lines.push('✓ Hero loads above the fold without layout shift (CLS = 0)')
      lines.push('✓ Lighthouse: 95+ performance, 100 accessibility')
      lines.push('✓ Mobile (375px) and desktop (1440px) render cleanly')
      lines.push('✓ All forms submit and show success / error feedback')
      lines.push('✓ Animations only trigger when in viewport')
      lines.push('✓ Keyboard navigable throughout')
      lines.push('✓ WCAG AA color contrast')
    }
    lines.push('')

    // ── POLISH CHECKLIST ───────────────────────────────────────────────────
    const imageTypes = [...new Set(imageQueries.map(q => q.type))]
    lines.push('━━━ POLISH CHECKLIST ━━━')
    lines.push('[ ] All icons from Heroicons')
    lines.push('[ ] All transitions ' + (isMobile ? '80-200ms' : '200-300ms'))
    lines.push('[ ] Focus rings visible on all interactive elements')
    if (!isMobile) lines.push('[ ] No layout shift (CLS = 0)')
    lines.push('[ ] Animations respect ' + (isMobile ? 'AccessibilityInfo.isReduceMotionEnabled' : 'prefers-reduced-motion'))
    lines.push('[ ] WCAG AA color contrast')
    lines.push('[ ] Touch targets ≥ 44px')
    lines.push('[ ] All copy reviewed and on-brand')
    lines.push('[ ] Pattern "' + pattern.name + '" fully followed')
    imageTypes.forEach(t => lines.push('[ ] ' + t.charAt(0).toUpperCase() + t.slice(1) + ' imagery sourced and attributed'))
    lines.push('')

    // ── CONTEXT ────────────────────────────────────────────────────────────
    lines.push('━━━ CONTEXT ━━━')
    lines.push('Project: ' + project)
    if (status) lines.push('Status: ' + status)
    if (task.priority) lines.push('Priority: ' + task.priority)
    if (briefData?.industry) lines.push('Industry: ' + briefData.industry)
    if (briefData?.audience) lines.push('Audience: ' + briefData.audience)

    return lines.join('\n')
  }

  const DEFAULT_COLS = [
    { id: 'To Do', label: 'To Do', color: '#6B7280' },
    { id: 'In Progress', label: 'In Progress', color: '#3B82F6' },
    { id: 'Review', label: 'Review', color: '#F59E0B' },
    { id: 'Done', label: 'Done', color: '#16a34a' },
  ]

  function saveCurrentProjectState() {
    if (!activeProjectId) return
    try {
      const state = { kanban, teamMembers, phase, projectTitle, briefText }
      localStorage.setItem('tc-project-' + activeProjectId, JSON.stringify(state))
    } catch(e) {}
  }

  function loadProjectStateById(id) {
    try {
      const saved = localStorage.getItem('tc-project-' + id)
      if (saved) {
        const s = JSON.parse(saved)
        setKanban(s.kanban || null)
        setTeamMembers(s.teamMembers || [])
        setPhase(s.phase || 'brief')
        setProjectTitle(s.projectTitle || '')
        setBriefText(s.briefText || '')
      } else {
        setKanban(null)
        setTeamMembers([])
        setPhase('brief')
        setProjectTitle(projects.find(p => p.id === id)?.title || '')
        setBriefText('')
      }
      const savedCols = localStorage.getItem('tc-cols-' + id)
      setCustomCols(savedCols ? JSON.parse(savedCols) : DEFAULT_COLS)
    } catch(e) {
      setKanban(null)
      setTeamMembers([])
      setPhase('brief')
      setCustomCols(DEFAULT_COLS)
    }
    setMessages([])
    setChatHistory([])
    setActiveTab('board')
  }

  function triggerFlash() {
    setProjectFlash(true)
    setTimeout(() => setProjectFlash(false), 700)
  }

  function switchWithTransition(id, updatedProjects) {
    setBoardTransitioning(true)
    saveCurrentProjectState()
    setTimeout(() => {
      setActiveProjectId(id)
      localStorage.setItem('teamcollab-active-project', id)
      loadProjectStateById(id)
      triggerFlash()
      setBoardTransitioning(false)
    }, 200)
  }

  // Create a brand-new TC project. Goes through the service-role API
  // (renameProjectInDB → PATCH /api/create-workspace) which upserts the
  // row server-side — same path that fixed cross-device rename sync.
  async function handleNewProject() {
    // Plan project limit: free=2, starter=10, pro=Infinity. Counts owned
    // projects only (shared projects don't count against the cap).
    const cap = projectLimit(userPlan)
    if (Number.isFinite(cap)) {
      const ownedCount = (ctxProjects || []).filter(p => !p.isShared).length
      if (ownedCount >= cap) {
        openUpgradeModal?.('projects')
        return
      }
    }
    const newProj = { id: uid(), title: 'New Project' }
    console.log('[TC handleNewProject] creating', newProj, 'authUser:', authUser?.id)
    const updated = [...projects, newProj]
    setProjects(updated)
    saveProjects(updated)
    switchWithTransition(newProj.id, updated)
    if (!renameProjectInDB) {
      console.error('[TC handleNewProject] renameProjectInDB not available')
      return
    }
    try {
      renameProjectInDB(newProj.id, newProj.title, 'team')
      console.log('[TC handleNewProject] PATCH triggered, expect [renameProject] logs next')
    } catch (e) {
      console.error('[TC handleNewProject]', e)
      showToast?.('Failed to create project', 'error')
    }
  }

  function handleSwitchProject(id) {
    if (id === activeProjectId) return
    switchWithTransition(id, projects)
    // Touch the project's updated_at so other devices know this is the
    // most-recently-active one and auto-follow. Uses touchProject (no
    // owner-only fields in the PATCH) so Editor/Viewer can also bump it
    // when they switch to a shared board.
    if (touchProject && id !== 'default') {
      touchProject(id)
    }
  }

  function handleRenameProject(projectId, newTitle) {
    const trimmed = newTitle.trim()
    if (!trimmed) return
    // RBAC: only the project Admin (creator) may rename a project.
    if (projectId !== 'default') {
      const target = ctxProjects.find(p => p.id === projectId)
      const targetRole = target?.currentUserRole || (target?.isShared ? 'Editor' : 'Admin')
      if (targetRole !== 'Admin') {
        showToast?.('Only the project Admin can rename this project')
        setRenamingProjectId(null)
        return
      }
    }
    console.log('[TC handleRenameProject]', { projectId, trimmed, isDefault: projectId === 'default' })

    // `default` is the placeholder ID for the first-ever tab — it has never
    // been persisted and the projects PK is global (not per-user) so we can't
    // INSERT id='default'. Promote it to a real UID + migrate local cache.
    if (projectId === 'default') {
      const newId = uid()
      console.log('[TC promote] new uid generated:', newId, 'authUser:', !!authUser, 'authUserId:', authUser?.id)
      const updated = projects.map(p => p.id === 'default' ? { id: newId, title: trimmed } : p)
      setProjects(updated)
      saveProjects(updated)

      if (activeProjectId === 'default') {
        setActiveProjectId(newId)
        try {
          localStorage.setItem('teamcollab-active-project', newId)
          const board = localStorage.getItem('tc-project-default')
          if (board) {
            localStorage.setItem('tc-project-' + newId, board)
            localStorage.removeItem('tc-project-default')
          }
          const cols = localStorage.getItem('tc-cols-default')
          if (cols) {
            localStorage.setItem('tc-cols-' + newId, cols)
            localStorage.removeItem('tc-cols-default')
          }
        } catch {}
        setProjectTitle(trimmed)
      }

      setRenamingProjectId(null)
      triggerFlash()

      // Write to DB with explicit await + verification fetch
      ;(async () => {
        if (!authUser) {
          console.error('[TC promote] aborted — no authUser')
          return
        }
        try {
          console.log('[TC promote] sending upsert →', { id: newId, title: trimmed })
          const upsertRes = await supabase.from('projects').upsert({
            id: newId,
            user_id: authUser.id,
            workspace_id: workspace?.id || null,
            title: trimmed,
            section: 'team',
            updated_at: new Date().toISOString(),
          }, { onConflict: 'id' }).select('id, title, user_id')

          console.log('[TC promote] upsert result:', upsertRes)

          if (upsertRes.error) {
            console.error('[TC promote] upsert FAILED:', upsertRes.error)
            showToast?.('Failed to save project: ' + upsertRes.error.message, 'error')
            return
          }

          // Verification fetch: re-read the row we just wrote to confirm
          const verify = await supabase
            .from('projects')
            .select('id, title, user_id')
            .eq('id', newId)
            .maybeSingle()
          console.log('[TC promote] verification fetch:', verify)
        } catch (e) {
          console.error('[TC promote] exception:', e)
          showToast?.('Failed to save project', 'error')
        }
      })()
      return
    }

    const updated = projects.map(p => p.id === projectId ? { ...p, title: trimmed } : p)
    setProjects(updated)
    saveProjects(updated)
    if (projectId === activeProjectId) setProjectTitle(trimmed)
    setRenamingProjectId(null)
    triggerFlash()
    // Route through AppContext.renameProject. Force section='team' so this
    // TC board can never accidentally become a brief-translator entry,
    // even if the existing DB row has a stale section='translator'.
    if (renameProjectInDB) renameProjectInDB(projectId, trimmed, 'team')
  }

  function handleDeleteProject(projectId) {
    // RBAC: Admin + Editor may delete a project. Viewer cannot.
    const target = ctxProjects.find(p => p.id === projectId)
    const targetRole = target?.currentUserRole || (target?.isShared ? 'Editor' : 'Admin')
    if (targetRole === 'Viewer') {
      showToast?.('Viewers cannot delete this project')
      setConfirmDeleteId(null)
      return
    }
    if (projects.length <= 1) return
    const updated = projects.filter(p => p.id !== projectId)
    setProjects(updated)
    saveProjects(updated)
    localStorage.removeItem('tc-project-' + projectId)
    setConfirmDeleteId(null)
    setShowProjectMenu(false)
    if (projectId === activeProjectId) {
      switchWithTransition(updated[0].id, updated)
    }
    // Persist deletion to DB so other devices drop it.
    if (deleteProjectInDB) deleteProjectInDB(projectId)
  }

  function handleAddManualTask(columnId) {
    if (!newTaskTitle.trim()) return
    const newTask = {
      id: 'manual-' + uid(),
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
    // Persist immediately — optimistic update already applied above
    saveTaskNow(newTask).catch(e => {
      console.error('[TC] saveTaskNow:', e)
      if (showToast) showToast('Failed to save task. Please try again.', 'error')
      setKanban(prev => prev ? { ...prev, tasks: prev.tasks.filter(t => t.id !== newTask.id) } : prev)
    })
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

  function executeTool(toolName, toolInput) {
    switch (toolName) {

      case 'board_action': {
        const { action, taskId, task, toColumn } = toolInput

        if (action === 'add') {
          const newTask = {
            id: 'ai-' + uid(),
            title: task.title,
            description: task.description || '',
            column: task.column || customCols[0]?.id || 'To Do',
            priority: task.priority || 'MEDIUM',
            assignee: task.assignee || null,
            dueDate: task.dueDate || '',
            source: 'ai-agent',
            subtasks: [],
            tags: [],
          }
          setKanban(prev => ({
            ...(prev || {}),
            tasks: [...((prev?.tasks) || []), newTask],
          }))
          if (phase !== 'kanban') setPhase('kanban')
          return { success: true, taskId: newTask.id, message: 'Added "' + task.title + '"' }
        }

        if (action === 'move') {
          setKanban(prev => ({
            ...prev,
            tasks: prev.tasks.map(t => t.id === taskId ? { ...t, column: toColumn } : t),
          }))
          return { success: true, message: 'Moved task to ' + toColumn }
        }

        if (action === 'update') {
          setKanban(prev => ({
            ...prev,
            tasks: prev.tasks.map(t => t.id === taskId ? { ...t, ...task } : t),
          }))
          return { success: true, message: 'Updated task' }
        }

        if (action === 'delete') {
          setKanban(prev => ({
            ...prev,
            tasks: prev.tasks.filter(t => t.id !== taskId),
          }))
          return { success: true, message: 'Deleted task' }
        }

        return { success: false, error: 'Unknown action' }
      }

      case 'bulk_action': {
        const { tasks, clearFirst } = toolInput
        const newTasks = tasks.map(t => ({
          id: 'ai-' + uid(),
          title: t.title,
          description: t.description || '',
          column: t.column || customCols[0]?.id || 'To Do',
          priority: t.priority || 'MEDIUM',
          assignee: t.assignee || null,
          dueDate: t.dueDate || '',
          source: 'ai-agent',
          subtasks: [],
          tags: [],
        }))
        setKanban(prev => ({
          ...(prev || {}),
          tasks: clearFirst ? newTasks : [...((prev?.tasks) || []), ...newTasks],
        }))
        if (phase !== 'kanban') setPhase('kanban')
        return { success: true, count: newTasks.length, message: 'Added ' + newTasks.length + ' tasks' }
      }

      case 'column_action': {
        const { action, columnId, newLabel } = toolInput
        if (action === 'rename') {
          saveCustomCols(customCols.map(c => c.id === columnId ? { ...c, label: newLabel } : c))
          return { success: true, message: 'Renamed column' }
        }
        if (action === 'clear') {
          setKanban(prev => ({
            ...prev,
            tasks: prev.tasks.filter(t => t.column !== columnId),
          }))
          return { success: true, message: 'Cleared column' }
        }
        return { success: false, error: 'Unknown action' }
      }

      case 'move_all': {
        const { fromColumn, toColumn } = toolInput
        setKanban(prev => ({
          ...prev,
          tasks: prev.tasks.map(t => t.column === fromColumn ? { ...t, column: toColumn } : t),
        }))
        return { success: true, message: 'Moved all tasks from ' + fromColumn + ' to ' + toColumn }
      }

      case 'prioritise_board': {
        const order = { HIGH: 0, MEDIUM: 1, LOW: 2 }
        setKanban(prev => ({
          ...prev,
          tasks: [...(prev?.tasks || [])].sort((a, b) => (order[a.priority] || 1) - (order[b.priority] || 1)),
        }))
        return { success: true, message: 'Board prioritised' }
      }

      default:
        return { success: false, error: 'Unknown tool: ' + toolName }
    }
  }

  async function handleChatSend() {
    const msg = input.trim()
    if (!msg || isTyping) return

    setInput('')
    addMessage('user', msg)
    setIsTyping(true)

    const totalTasks = kanban?.tasks?.length || 0
    const boardContext = totalTasks > 0
      ? `CURRENT BOARD STATE:
Columns: ${customCols.map(c => c.label + ' (' + (kanban?.tasks?.filter(t => t.column === c.id).length || 0) + ' tasks)').join(', ')}

Tasks:
${(kanban?.tasks || []).map(t => {
  const col = customCols.find(c => c.id === t.column)
  return '- [' + t.id + '] ' + t.title +
    ' | col: ' + (col?.label || t.column) +
    ' | priority: ' + (t.priority || 'MEDIUM') +
    (t.assignee ? ' | assignee: ' + t.assignee : '') +
    (t.dueDate ? ' | due: ' + t.dueDate : '') +
    (t.description ? ' | desc: ' + t.description.slice(0, 80) : '')
}).join('\n')}`
      : 'BOARD IS EMPTY — no tasks yet.'

    const projectName = projects.find(p => p.id === activeProjectId)?.title || 'Project'

    const systemPrompt =
`${SENIOR_CREATIVE_DIRECTOR}

OUTPUT CONTRACT FOR THIS CALL:
You are the in-board creative-director partner for DesignBrief AI. You help designers and developers manage and SHARPEN their work, not just shuffle tasks.

PROJECT: ${projectName}
COLUMNS: ${customCols.map(c => c.id + ' (' + c.label + ')').join(', ')}

${boardContext}

YOUR CAPABILITIES:
You have tools to directly modify the board:
- board_action: add/move/update/delete tasks
- bulk_action: add multiple tasks at once
- column_action: rename/clear columns
- move_all: bulk-move between columns
- prioritise_board: sort by priority

WHEN TO USE TOOLS:
- User asks to add/create a task → board_action(add)
- User wants to generate a project plan, sprint, or task list → bulk_action
- User says "move X to done" → board_action(move)
- User says "clear the done column" → column_action(clear)
- User says "prioritise the board" → prioritise_board
- User wants to break a task into subtasks → bulk_action
- User asks a question (no action needed) → just respond

WHEN USING bulk_action FOR PROJECT PLANS OR SUBTASKS:
Generate the bold, specific tasks an award-winning team would actually do. Every task title is a creative call. Every description carries:
  → the creative angle (the unexpected take)
  → the interaction/animation goal
  → the copy direction
  → the success metric ("this task succeeds when...")

NEVER generic ("Research phase"). ALWAYS specific and opinionated ("Audit Linear, Notion, and Stripe onboarding flows", "Define a 6-step type scale using clamp()", "Build the hero card with cursor-tracking parallax").

AFTER USING A TOOL:
Give a brief, confident confirmation. 1-2 sentences max. No lists.
Example: "Done. Added 8 tasks across your board. The critical path starts with the discovery tasks in To Do."

WHEN ANSWERING QUESTIONS:
Be direct, insightful, and push back when the user is heading toward a safe/generic answer. You can see the full board state so use it.
- "How are we doing?" → real stats + your read on the creative risk
- "What's blocking us?" → look at high-priority tasks in To Do or In Progress
- "What should I work on next?" → analyse priorities and pick the one with the highest creative leverage

STYLE:
- Direct, confident, concise
- No bullet-point answers to action requests
- Never repeat the user's message back to them
- Never say "I'll help you with that"
- Act like a smart creative director sitting next to them, not an assistant`

    const newHistory = [
      ...chatHistory,
      { role: 'user', content: msg },
    ]

    try {
      const data = await callClaudeTools({
        system: systemPrompt,
        messages: newHistory,
        tools: BOARD_TOOLS,
        maxTokens: 2000,
      })

      const toolUseBlocks = data.content.filter(b => b.type === 'tool_use')
      const textBlocks = data.content.filter(b => b.type === 'text')

      if (toolUseBlocks.length > 0) {
        const toolResults = []
        for (const toolBlock of toolUseBlocks) {
          const result = executeTool(toolBlock.name, toolBlock.input)
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolBlock.id,
            content: JSON.stringify(result),
          })
        }

        const historyWithTool = [
          ...newHistory,
          { role: 'assistant', content: data.content },
          { role: 'user', content: toolResults },
        ]

        const followUpData = await callClaudeTools({
          system: systemPrompt,
          messages: historyWithTool,
          maxTokens: 500,
        })

        const replyText = followUpData.content
          .filter(b => b.type === 'text')
          .map(b => b.text)
          .join(' ')
          .trim()

        setChatHistory([
          ...newHistory,
          { role: 'assistant', content: replyText || 'Done.' },
        ])

        if (replyText) addMessage('ai', replyText)

      } else {
        const replyText = textBlocks.map(b => b.text).join(' ').trim()
        setChatHistory([
          ...newHistory,
          { role: 'assistant', content: replyText },
        ])
        addMessage('ai', replyText)
      }

      setCreditsUsed(prev => prev + 1)

    } catch (e) {
      console.error('[agent chat]', e)
      if (e.status === 429) {
        addMessage('ai', e.data?.message || 'Daily limit reached. Come back tomorrow.')
      } else if (e.status === 401) {
        addMessage('ai', 'Session expired. Please refresh the page.')
      } else {
        addMessage('ai', 'Something went wrong. Try again.')
      }
    }

    setIsTyping(false)
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
    // Free-plan credit gate (8 credits per kanban generation)
    if (consumeCredits) {
      const r = await consumeCredits('kanban_generation')
      if (!r.ok) return
    }
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
          fontFamily: 'var(--font-mono)', fontSize: 10,
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
            fontFamily: 'var(--font-sans)', fontSize: 12, marginBottom: 8,
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
              fontFamily: 'var(--font-sans)', fontSize: 11, marginBottom: 10,
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
              color: 'var(--color-accent-text)', fontFamily: 'var(--font-sans)',
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
              color: 'var(--color-text-soft)', fontFamily: 'var(--font-sans)',
              fontSize: 11, cursor: 'pointer',
            }}
          >Cancel</button>
        </div>
      </div>
    )
  }

  // ── TaskCard (inline so it can close over drag state setters) ─────────────

  function TaskCard({ task }) {
    const isDragging = draggedTask?.id === task.id
    const isDropIndicator = dragOverTaskId === task.id && draggedTask && draggedTask.id !== task.id
    const priorityColor = PRIORITY_COLORS[task.priority] || '#6B7280'
    const assigneeName = task.assignedName || task.assignee || null
    // Resolve assignee avatar: prefer the projectMembers map (keyed by
    // user_id) when the task has an assigned_user_id; otherwise fall
    // back to a name match (case-insensitive) so legacy tasks without
    // a user_id still get a photo when the name matches a member.
    // If the assignee IS the signed-in user, prefer the live
    // authUser.user_metadata.avatar_url — it updates instantly after
    // upload without waiting for the projectMembers refetch.
    const isSelf = task.assignedUserId && task.assignedUserId === authUser?.id
    const assigneeMember = task.assignedUserId
      ? projectMembers[task.assignedUserId]
      : (assigneeName
          ? Object.values(projectMembers).find(m => (m.name || '').toLowerCase() === assigneeName.toLowerCase())
          : null)
    const assigneeAvatar = isSelf
      ? (authUser?.user_metadata?.avatar_url || assigneeMember?.avatarUrl || null)
      : (assigneeMember?.avatarUrl || null)
    const assigneeInitial = (assigneeName || '?')[0]?.toUpperCase()

    return (
      <div
        draggable={canEdit}
        onDragStart={e => {
          if (!canEdit) { e.preventDefault(); return }
          e.stopPropagation()
          draggedTaskRef.current = task   // set ref immediately — no re-render lag
          setDraggedTask(task)
          e.dataTransfer.effectAllowed = 'move'
          e.dataTransfer.setData('text/plain', task.id)
          e.currentTarget.style.opacity = '0.4'
        }}
        onDragEnd={e => {
          e.currentTarget.style.opacity = '1'
          draggedTaskRef.current = null
          setDraggedTask(null)
          setDragOverCol(null)
          setDragOverTaskId(null)
        }}
        onDragOver={e => {
          const dt = draggedTaskRef.current
          if (!dt || dt.id === task.id) return
          e.preventDefault()
          e.stopPropagation()
          setDragOverTaskId(task.id)
        }}
        onDragLeave={e => {
          if (dragOverTaskId === task.id) setDragOverTaskId(null)
        }}
        onDrop={e => {
          e.preventDefault()
          e.stopPropagation()
          if (!canEdit) return
          const dt = draggedTaskRef.current
          if (!dt || dt.id === task.id) return
          const targetCol = task.column
          localChangeAtRef.current.set(dt.id, Date.now())
          setKanban(prev => {
            const tasks = [...prev.tasks]
            const fromIdx = tasks.findIndex(t => t.id === dt.id)
            const toIdx = tasks.findIndex(t => t.id === task.id)
            if (fromIdx === -1 || toIdx === -1) return prev
            const [moved] = tasks.splice(fromIdx, 1)
            moved.column = targetCol
            const newToIdx = tasks.findIndex(t => t.id === task.id)
            tasks.splice(newToIdx, 0, moved)
            return { ...prev, tasks }
          })
          if (authUser) updateTaskInDB({ ...dt, column: targetCol }).catch(console.error)
          draggedTaskRef.current = null
          setDraggedTask(null)
          setDragOverCol(null)
          setDragOverTaskId(null)
        }}
        onClick={() => { if (!isDragging) setEditingTask(task) }}
        style={{
          background: 'var(--color-card)',
          border: '1px solid var(--color-border)',
          borderTop: isDropIndicator ? '2px solid #3B82F6' : '1px solid var(--color-border)',
          borderRadius: 10, padding: '12px 14px',
          marginBottom: 8,
          cursor: isDragging ? 'grabbing' : 'grab',
          transition: 'box-shadow 0.15s ease, transform 0.15s ease, border-top 0.1s ease',
          opacity: isDragging ? 0.4 : 1,
          userSelect: 'none',
          boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
        }}
        onMouseEnter={e => {
          if (!isDragging) {
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)'
            e.currentTarget.style.transform = 'translateY(-1px)'
          }
        }}
        onMouseLeave={e => {
          e.currentTarget.style.boxShadow = '0 1px 2px rgba(0,0,0,0.04)'
          e.currentTarget.style.transform = 'translateY(0)'
        }}
      >
        {/* Priority indicator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: priorityColor }} />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700, color: priorityColor, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{task.priority || 'MEDIUM'}</span>
        </div>

        {/* Title */}
        <div style={{ fontFamily: 'var(--font-sans)', fontWeight: 600, fontSize: 14, color: 'var(--color-text)', lineHeight: 1.4, marginBottom: task.description ? 6 : 12, wordBreak: 'break-word' }}>
          {task.title}
        </div>

        {/* Description preview */}
        {task.description && (
          <div style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--color-text-muted)', lineHeight: 1.5, marginBottom: 12, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {task.description}
          </div>
        )}

        {/* Footer */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          {/* Left: assignee */}
          {assigneeName ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }} title={assigneeName}>
              {assigneeAvatar ? (
                <img
                  src={assigneeAvatar}
                  alt={assigneeName}
                  onError={e => { e.currentTarget.style.display = 'none' }}
                  style={{
                    width: 22, height: 22, borderRadius: '50%',
                    objectFit: 'cover', flexShrink: 0,
                    border: '1px solid var(--color-border)',
                  }}
                />
              ) : (
                <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--color-text)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-sans)', fontWeight: 700, fontSize: 10, color: 'var(--color-bg)', flexShrink: 0 }}>
                  {assigneeInitial}
                </div>
              )}
            </div>
          ) : (
            <div style={{ width: 22, height: 22, borderRadius: '50%', border: '1.5px dashed var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <UserIcon style={{ width: 10, height: 10, color: 'var(--color-text-muted)' }} />
            </div>
          )}
          {/* Right: due date + prompt button */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {task.dueDate && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 5, padding: '2px 7px' }}>
                <CalendarIcon style={{ width: 10, height: 10, color: 'var(--color-text-muted)' }} />
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--color-text-soft)', fontWeight: 600 }}>
                  {new Date(task.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
              </div>
            )}
            <button
              onClick={e => { e.stopPropagation(); handleGeneratePrompt(task) }}
              title="Generate implementation prompt"
              style={{ width: 24, height: 24, borderRadius: 6, background: 'linear-gradient(135deg, rgba(139,92,246,0.1) 0%, rgba(59,130,246,0.1) 100%)', border: '1px solid rgba(139,92,246,0.2)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 0.15s' }}
              onMouseEnter={e => {
                e.currentTarget.style.background = 'linear-gradient(135deg, #8B5CF6 0%, #3B82F6 100%)'
                const svg = e.currentTarget.querySelector('svg')
                if (svg) svg.style.color = 'white'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'linear-gradient(135deg, rgba(139,92,246,0.1) 0%, rgba(59,130,246,0.1) 100%)'
                const svg = e.currentTarget.querySelector('svg')
                if (svg) svg.style.color = '#8B5CF6'
              }}
            >
              <SparklesIcon style={{ width: 12, height: 12, color: '#8B5CF6', transition: 'color 0.15s' }} />
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── TableView ─────────────────────────────────────────────────────────────

  function TableView({ tasks, customCols: cols }) {
    if (!tasks?.length) {
      return (
        <div style={{ padding: 40, textAlign: 'center', fontFamily: 'var(--font-sans)', fontSize: 14, color: 'var(--color-text-muted)' }}>
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
        <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-sans)' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid var(--color-border)', background: 'var(--color-surface)' }}>
              {COLS.map(col => (
                <th key={col.key} style={{ padding: '10px 14px', textAlign: 'left', fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, color: 'var(--color-text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', width: col.width, whiteSpace: 'nowrap' }}>{col.label}</th>
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
                        <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--color-text)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-sans)', fontWeight: 700, fontSize: 10, color: 'var(--color-bg)', flexShrink: 0 }}>
                          {(task.assignedName || task.assignee || '')[0]?.toUpperCase()}
                        </div>
                        <span style={{ fontSize: 12, color: 'var(--color-text-soft)' }}>{task.assignedName || task.assignee}</span>
                      </div>
                    ) : (
                      <span style={{ fontSize: 12, color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>—</span>
                    )}
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    {task.dueDate ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontFamily: 'var(--font-mono)', fontSize: 11, color: new Date(task.dueDate) < new Date() ? '#EF4444' : 'var(--color-text-soft)' }}>
                        <CalendarIcon style={{ width: 12, height: 12, flexShrink: 0 }} />
                        {new Date(task.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </div>
                    ) : (
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-text-muted)' }}>—</span>
                    )}
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: priorityColor + '15', border: '1px solid ' + priorityColor + '30', borderRadius: 5, padding: '2px 8px' }}>
                      <div style={{ width: 5, height: 5, borderRadius: '50%', background: priorityColor }} />
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700, color: priorityColor, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{task.priority || 'MEDIUM'}</span>
                    </div>
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: col.color + '15', border: '1px solid ' + col.color + '30', borderRadius: 5, padding: '2px 8px' }}>
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: col.color }} />
                      <span style={{ fontFamily: 'var(--font-sans)', fontSize: 11, fontWeight: 600, color: col.color }}>{col.label}</span>
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
          <div style={{ fontFamily: 'var(--font-sans)', fontWeight: 800, fontSize: 20, color: 'var(--color-text)', letterSpacing: '-0.02em' }}>
            {monthNames[currentMonth]} {currentYear}
          </div>
          <button onClick={nextMonth} style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--color-surface)', border: '1px solid var(--color-border)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ChevronRightIcon style={{ width: 16, height: 16, color: 'var(--color-text)' }} />
          </button>
        </div>

        {/* Day headers */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 1, marginBottom: 4 }}>
          {dayNames.map(d => (
            <div key={d} style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--color-text-muted)', textAlign: 'center', padding: '4px 0', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{d}</div>
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
                <div style={{ fontFamily: 'var(--font-sans)', fontWeight: isToday ? 800 : 500, fontSize: 13, color: isToday ? '#3B82F6' : 'var(--color-text)', marginBottom: 4 }}>{day}</div>
                {dayTasks.slice(0, 3).map((task, ti) => {
                  const col = cols?.find(c => c.id === task.column) || { color: '#6B7280' }
                  return (
                    <div key={ti} onClick={() => setEditingTask(task)} style={{ background: col.color + '20', border: '1px solid ' + col.color + '40', borderLeft: '2px solid ' + col.color, borderRadius: '0 4px 4px 0', padding: '2px 5px', marginBottom: 2, fontFamily: 'var(--font-sans)', fontSize: 10, fontWeight: 600, color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer' }}>
                      {task.title}
                    </div>
                  )
                })}
                {dayTasks.length > 3 && (
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--color-text-muted)' }}>+{dayTasks.length - 3} more</div>
                )}
              </div>
            )
          })}
        </div>

        {/* No-due-date notice */}
        {noDateCount > 0 && (
          <div style={{ marginTop: 16, padding: '10px 14px', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--color-text-muted)' }}>
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
          <div style={{ fontFamily: 'var(--font-sans)', fontWeight: 700, fontSize: 16, color: 'var(--color-text)', marginBottom: 4 }}>No tasks with due dates</div>
          <div style={{ fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--color-text-muted)', maxWidth: 280, lineHeight: 1.6 }}>Add due dates to your tasks to see them on the Gantt chart.</div>
        </div>
      )
    }

    return (
      <div style={{ flex: 1, display: 'flex', overflowX: 'auto', overflowY: 'auto' }}>
        <div style={{ minWidth: 'max-content' }}>
          {/* Header row */}
          <div style={{ display: 'flex', position: 'sticky', top: 0, zIndex: 10, background: 'var(--color-bg)', borderBottom: '2px solid var(--color-border)' }}>
            <div style={{ width: 200, flexShrink: 0, padding: '8px 14px', borderRight: '1px solid var(--color-border)', fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, color: 'var(--color-text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase', background: 'var(--color-bg)' }}>Task</div>
            <div style={{ display: 'flex' }}>
              {days.map((d, i) => {
                const isToday = d.toDateString() === today.toDateString()
                const isWeekend = d.getDay() === 0 || d.getDay() === 6
                const isFirstOfWeek = d.getDay() === 1
                return (
                  <div key={i} style={{ width: DAY_WIDTH, flexShrink: 0, padding: '4px 2px', textAlign: 'center', background: isToday ? 'rgba(59,130,246,0.1)' : isWeekend ? 'var(--color-surface)' : 'transparent', borderLeft: isFirstOfWeek ? '1px solid var(--color-border)' : 'none' }}>
                    {(isFirstOfWeek || d.getDate() === 1 || i === 0) && (
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--color-text-muted)', marginBottom: 1 }}>
                        {d.toLocaleDateString('en', { month: 'short' })}
                      </div>
                    )}
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: isToday ? 700 : 400, color: isToday ? '#3B82F6' : 'var(--color-text-muted)' }}>{d.getDate()}</div>
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
                  <span style={{ fontFamily: 'var(--font-sans)', fontSize: 12, fontWeight: 500, color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.title}</span>
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
                        <span style={{ fontFamily: 'var(--font-sans)', fontSize: 10, fontWeight: 700, color: 'white', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: barWidth - 16 }}>{task.title}</span>
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
      position: 'relative', background: 'var(--color-surface)',
    }}>
      <style>{`
        @keyframes slideInRight {
          from { opacity: 0; transform: translateX(20px); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(0.75); }
        }
        @keyframes breathe {
          0%, 100% { opacity: 0.4; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.3); }
        }
      `}</style>

      {/* Modals */}
      {editingTask && (
        <TaskDetailModal
          task={editingTask}
          projectId={activeProjectId || activeProject?.id}
          projectName={projectTitle || 'Project'}
          authUser={authUser}
          user={user}
          teamMembers={teamMembers}
          projectMembers={projectMembers}
          currentUserRole={myRole}
          onUpdate={updateTask}
          onDelete={deleteTaskNow}
          onClose={() => {
            const closedId = editingTask?.id
            setEditingTask(null)
            // If user opened via "Add Task" and never entered a title, scrub
            // the empty row so the kanban doesn't fill up with "Untitled".
            if (!closedId) return
            const live = kanban?.tasks?.find(t => t.id === closedId)
            if (live && (!live.title || !live.title.trim())) {
              deleteTaskNow(closedId)
            }
          }}
        />
      )}
      <AddTaskModal
        open={showAddTaskModal}
        onClose={() => { setShowAddTaskModal(false); setAddTaskData({ title: '', description: '', assignees: [], dueDate: '', priority: 'MEDIUM', column: KANBAN_COLS[0] }) }}
        onSave={(formData) => {
          // Resolve the picked assignee name → real auth user_id when
          // we can match against a project member. Lets the kanban show
          // the assignee's profile photo immediately after creation.
          const firstAssignee = formData.assignees[0] || null
          let assignedUserId = null
          if (firstAssignee) {
            const lower = firstAssignee.toLowerCase()
            for (const [uid, m] of Object.entries(projectMembers || {})) {
              if ((m.name || '').toLowerCase() === lower) {
                assignedUserId = uid
                break
              }
            }
          }
          const newTask = {
            id: 'manual-' + uid(), title: formData.title,
            description: formData.description,
            assignees: formData.assignees,
            assignedName: firstAssignee,
            assignedUserId,
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
          // Persist immediately
          saveTaskNow(newTask).catch(e => {
            console.error('[TC] saveTaskNow:', e)
            if (showToast) showToast('Failed to save task. Please try again.', 'error')
            setKanban(prev => prev ? { ...prev, tasks: prev.tasks.filter(t => t.id !== newTask.id) } : prev)
          })
        }}
        teamMembers={teamMembers}
        initialColumn={addTaskData.column || KANBAN_COLS[0]}
        defaultData={addTaskData}
      />

      {/* ── Push to Linear modal ── */}
      {pushLinearOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={e => { if (e.target === e.currentTarget) setPushLinearOpen(false) }}>
          <div style={{ background: 'var(--color-card)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-xl)', padding: 28, width: 420, boxShadow: 'var(--shadow-xl)' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: '#5E6AD2', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="16" height="16" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M17.5 66.7L33.3 82.5L82.5 33.3" stroke="white" strokeWidth="14" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M17.5 33.3H50" stroke="white" strokeWidth="14" strokeLinecap="round"/>
                </svg>
              </div>
              <div>
                <div style={{ fontFamily: 'var(--font-sans)', fontWeight: 700, fontSize: 15, color: 'var(--color-text)' }}>Push to Linear</div>
                <div style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--color-text-muted)' }}>{kanban?.tasks?.length || 0} task{(kanban?.tasks?.length || 0) !== 1 ? 's' : ''} will be created as issues</div>
              </div>
            </div>

            {/* Team selector */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontFamily: 'var(--font-sans)', fontSize: 12, fontWeight: 600, color: 'var(--color-text-soft)', marginBottom: 6 }}>Team</label>
              <select
                value={selectedTeamId}
                onChange={e => setSelectedTeamId(e.target.value)}
                style={{ width: '100%', padding: '9px 12px', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--color-text)', outline: 'none', cursor: 'pointer' }}
              >
                {(connectorData?.linear?.teams || []).map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>

            {/* Result banner */}
            {pushResult && (
              <div style={{ padding: '10px 14px', borderRadius: 'var(--radius-md)', marginBottom: 16, background: pushResult.ok ? 'rgba(22,163,74,0.08)' : 'rgba(220,38,38,0.08)', border: `1px solid ${pushResult.ok ? 'rgba(22,163,74,0.2)' : 'rgba(220,38,38,0.2)'}`, fontFamily: 'var(--font-sans)', fontSize: 13, color: pushResult.ok ? '#16a34a' : '#dc2626' }}>
                {pushResult.message}
              </div>
            )}

            {/* Actions */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                onClick={() => { setPushLinearOpen(false); setPushResult(null) }}
                style={{ padding: '9px 20px', background: 'transparent', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 600, color: 'var(--color-text)', cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                disabled={!selectedTeamId || pushingLinear}
                onClick={async () => {
                  const linearToken = prompt('Enter your Linear API key to push tasks:')
                  if (!linearToken) return
                  setPushingLinear(true)
                  setPushResult(null)
                  try {
                    const { data: { session } } = await supabase.auth.getSession()
                    const resp = await fetch('/api/connectors', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json', ...(session?.access_token ? { 'Authorization': 'Bearer ' + session.access_token } : {}) },
                      body: JSON.stringify({ type: 'linear', action: 'push_tasks', linearToken, teamId: selectedTeamId, tasks: kanban.tasks, workspaceId: workspace?.id }),
                    })
                    const data = await resp.json()
                    if (data.ok) {
                      setPushResult({ ok: true, message: `Successfully pushed ${data.created || kanban.tasks.length} issues to Linear.` })
                    } else {
                      setPushResult({ ok: false, message: data.error || 'Failed to push tasks.' })
                    }
                  } catch {
                    setPushResult({ ok: false, message: 'Network error. Please try again.' })
                  } finally {
                    setPushingLinear(false)
                  }
                }}
                style={{ padding: '9px 20px', background: selectedTeamId && !pushingLinear ? '#5E6AD2' : 'var(--color-border)', border: 'none', borderRadius: 'var(--radius-md)', fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 700, color: selectedTeamId && !pushingLinear ? '#fff' : 'var(--color-text-muted)', cursor: selectedTeamId && !pushingLinear ? 'pointer' : 'default', display: 'flex', alignItems: 'center', gap: 6 }}
              >
                {pushingLinear ? 'Pushing...' : 'Push to Linear'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Top bar ── */}
      <div style={{
        height: 48,
        borderBottom: isMobile ? 'none' : '1px solid var(--color-border)',
        display: 'flex',
        alignItems: isMobile ? 'flex-start' : 'center',
        padding: isMobile ? '14px 12px 0 54px' : '0 20px',
        gap: 4,
        flexShrink: 0,
        background: isMobile ? 'transparent' : 'var(--color-bg)',
        overflowX: 'visible',
      }}>
        {/* Mobile: project switcher — left side, stroked rectangle */}
        {isMobile && (
          <div ref={projectMenuRef} style={{ position: 'relative', flexShrink: 0 }}>
            <button
              onClick={() => setShowProjectMenu(p => !p)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '4px 10px', borderRadius: 8,
                background: 'transparent', border: '1.5px solid var(--color-border-strong)',
                cursor: 'pointer', fontFamily: 'var(--font-sans)', fontWeight: 700, fontSize: 13,
                color: 'var(--color-text)', minHeight: 'unset',
                boxShadow: projectFlash ? '0 0 0 3px var(--color-accent-soft), 0 0 0 1.5px var(--color-accent)' : 'none',
              }}
            >
              <span style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {projects.find(p => p.id === activeProjectId)?.title || 'My Project'}
              </span>
              <ChevronDownIcon style={{ width: 12, height: 12, color: 'var(--color-text-muted)', flexShrink: 0, transition: 'transform 0.15s', transform: showProjectMenu ? 'rotate(180deg)' : 'none' }} />
            </button>
            {showProjectMenu && (
              <div style={{ position: 'absolute', top: 'calc(100% + 8px)', left: 0, background: 'var(--color-card)', border: '1px solid var(--color-border)', borderRadius: 12, boxShadow: 'var(--shadow-lg)', zIndex: 600, minWidth: 240, overflow: 'visible', animation: 'dropIn 0.15s ease' }}>
                <div style={{ padding: '10px 16px 8px', borderBottom: '1px solid var(--color-divider)' }}>
                  <span style={{ fontFamily: 'var(--font-sans)', fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Projects</span>
                </div>
                <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                  {projects.map(p => (
                    <div key={p.id} style={{ position: 'relative' }}>
                      {renamingProjectId === p.id ? (
                        <div style={{ padding: '8px 12px' }}>
                          <input autoFocus value={renameValue} onChange={e => setRenameValue(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') handleRenameProject(p.id, renameValue); if (e.key === 'Escape') setRenamingProjectId(null) }}
                            style={{ width: '100%', padding: '6px 10px', border: '1px solid var(--color-border)', borderRadius: 6, background: 'var(--color-surface)', fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--color-text)', outline: 'none', marginBottom: 6 }} />
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button onClick={() => handleRenameProject(p.id, renameValue)} style={{ flex: 1, padding: '6px', borderRadius: 6, background: 'var(--color-text)', color: 'var(--color-bg)', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-sans)', fontSize: 12, fontWeight: 700, minHeight: 'unset' }}>Save</button>
                            <button onClick={() => setRenamingProjectId(null)} style={{ flex: 1, padding: '6px', borderRadius: 6, background: 'transparent', color: 'var(--color-text-muted)', border: '1px solid var(--color-border)', cursor: 'pointer', fontFamily: 'var(--font-sans)', fontSize: 12, minHeight: 'unset' }}>Cancel</button>
                          </div>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', background: p.id === activeProjectId ? 'var(--color-surface)' : 'transparent' }}>
                          <button onClick={() => { handleSwitchProject(p.id); setShowProjectMenu(false) }}
                            style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, padding: '9px 8px 9px 16px', border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: p.id === activeProjectId ? 600 : 400, color: 'var(--color-text)', textAlign: 'left', minHeight: 'unset' }}>
                            <div style={{ width: 6, height: 6, borderRadius: '50%', background: p.id === activeProjectId ? 'var(--color-accent)' : 'var(--color-border)', flexShrink: 0 }} />
                            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title}</span>
                          </button>
                          <button onClick={e => { e.stopPropagation(); setRenamingProjectId(p.id); setRenameValue(p.title) }}
                            title="Rename"
                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--color-text-muted)', flexShrink: 0, borderRadius: 6, minHeight: 'unset' }}>
                            <PencilIcon style={{ width: 13, height: 13 }} />
                          </button>
                          <button onClick={e => { e.stopPropagation(); setConfirmDeleteId(p.id); setShowProjectMenu(false) }}
                            title="Delete" disabled={projects.length <= 1}
                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, border: 'none', background: 'transparent', cursor: projects.length <= 1 ? 'not-allowed' : 'pointer', color: projects.length <= 1 ? 'var(--color-border)' : 'var(--color-red)', flexShrink: 0, marginRight: 8, borderRadius: 6, minHeight: 'unset' }}>
                            <TrashIcon style={{ width: 13, height: 13 }} />
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <div style={{ height: 1, background: 'var(--color-divider)' }} />
                <button onClick={() => { handleNewProject(); setShowProjectMenu(false) }}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '10px 16px 12px', border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 500, color: 'var(--color-text)', textAlign: 'left', minHeight: 'unset' }}>
                  <PlusIcon style={{ width: 14, height: 14, color: 'var(--color-text-muted)', flexShrink: 0 }} />
                  Add new project
                </button>
              </div>
            )}
          </div>
        )}

        {/* Desktop/tablet: project switcher on the left */}
        {!isMobile && (
          <div ref={projectMenuRef} style={{ position: 'relative', flexShrink: 0 }}>
            <button
              onClick={() => setShowProjectMenu(p => !p)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '6px 12px', borderRadius: 8,
                background: 'var(--color-surface)', border: '1px solid var(--color-border)',
                cursor: 'pointer', fontFamily: 'var(--font-sans)', fontWeight: 600, fontSize: 12,
                color: 'var(--color-text)', minHeight: 'unset', maxWidth: 200,
                boxShadow: projectFlash ? '0 0 0 3px var(--color-accent-soft), 0 0 0 1px var(--color-accent)' : 'none',
              }}
            >
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {projects.find(p => p.id === activeProjectId)?.title || 'My Project'}
              </span>
              <ChevronDownIcon style={{ width: 12, height: 12, color: 'var(--color-text-muted)', flexShrink: 0, transition: 'transform 0.15s', transform: showProjectMenu ? 'rotate(180deg)' : 'none' }} />
            </button>
            {showProjectMenu && (
              <div style={{ position: 'absolute', top: 'calc(100% + 8px)', left: 0, background: 'var(--color-card)', border: '1px solid var(--color-border)', borderRadius: 12, boxShadow: 'var(--shadow-lg)', zIndex: 600, minWidth: 240, overflow: 'visible', animation: 'dropIn 0.15s ease' }}>
                <div style={{ padding: '10px 16px 8px', borderBottom: '1px solid var(--color-divider)' }}>
                  <span style={{ fontFamily: 'var(--font-sans)', fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Projects</span>
                </div>
                <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                  {projects.map(p => (
                    <div key={p.id} style={{ position: 'relative' }}>
                      {renamingProjectId === p.id ? (
                        <div style={{ padding: '8px 12px' }}>
                          <input autoFocus value={renameValue} onChange={e => setRenameValue(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') handleRenameProject(p.id, renameValue); if (e.key === 'Escape') setRenamingProjectId(null) }}
                            style={{ width: '100%', padding: '6px 10px', border: '1px solid var(--color-border)', borderRadius: 6, background: 'var(--color-surface)', fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--color-text)', outline: 'none', marginBottom: 6 }} />
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button onClick={() => handleRenameProject(p.id, renameValue)} style={{ flex: 1, padding: '6px', borderRadius: 6, background: 'var(--color-text)', color: 'var(--color-bg)', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-sans)', fontSize: 12, fontWeight: 700, minHeight: 'unset' }}>Save</button>
                            <button onClick={() => setRenamingProjectId(null)} style={{ flex: 1, padding: '6px', borderRadius: 6, background: 'transparent', color: 'var(--color-text-muted)', border: '1px solid var(--color-border)', cursor: 'pointer', fontFamily: 'var(--font-sans)', fontSize: 12, minHeight: 'unset' }}>Cancel</button>
                          </div>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', background: p.id === activeProjectId ? 'var(--color-surface)' : 'transparent' }}>
                          <button onClick={() => { handleSwitchProject(p.id); setShowProjectMenu(false) }}
                            style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, padding: '9px 8px 9px 16px', border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: p.id === activeProjectId ? 600 : 400, color: 'var(--color-text)', textAlign: 'left', minHeight: 'unset' }}>
                            <div style={{ width: 6, height: 6, borderRadius: '50%', background: p.id === activeProjectId ? 'var(--color-accent)' : 'var(--color-border)', flexShrink: 0 }} />
                            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title}</span>
                          </button>
                          <button onClick={e => { e.stopPropagation(); setRenamingProjectId(p.id); setRenameValue(p.title) }}
                            title="Rename"
                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--color-text-muted)', flexShrink: 0, borderRadius: 6, minHeight: 'unset' }}>
                            <PencilIcon style={{ width: 13, height: 13 }} />
                          </button>
                          <button onClick={e => { e.stopPropagation(); setConfirmDeleteId(p.id); setShowProjectMenu(false) }}
                            title="Delete" disabled={projects.length <= 1}
                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, border: 'none', background: 'transparent', cursor: projects.length <= 1 ? 'not-allowed' : 'pointer', color: projects.length <= 1 ? 'var(--color-border)' : 'var(--color-red)', flexShrink: 0, marginRight: 8, borderRadius: 6, minHeight: 'unset' }}>
                            <TrashIcon style={{ width: 13, height: 13 }} />
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <div style={{ height: 1, background: 'var(--color-divider)' }} />
                <button onClick={() => { handleNewProject(); setShowProjectMenu(false) }}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '10px 16px 12px', border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 500, color: 'var(--color-text)', textAlign: 'left', minHeight: 'unset' }}>
                  <PlusIcon style={{ width: 14, height: 14, color: 'var(--color-text-muted)', flexShrink: 0 }} />
                  Add new project
                </button>
              </div>
            )}
          </div>
        )}

        <div style={{ flex: 1 }} />

        {/* Desktop/tablet: Board + Team step tabs on the right */}
        {!isMobile && (() => {
          const isDone = !!kanban?.tasks?.length
          const isActive = activeTab === 'board'
          return (
            <button
              onClick={() => setActiveTab('board')}
              style={{
                display: 'flex', alignItems: 'center', gap: 7,
                padding: '6px 14px', borderRadius: 8,
                border: isActive ? '1px solid var(--color-border)' : '1px solid transparent',
                background: isActive ? 'var(--color-card)' : 'transparent',
                cursor: 'pointer', transition: 'all 0.15s',
              }}
            >
              <div style={{
                width: 18, height: 18, borderRadius: '50%',
                background: isDone ? '#16a34a' : isActive ? 'var(--color-text)' : 'var(--color-border)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0, transition: 'background 0.2s',
              }}>
                {isDone ? (
                  <CheckIcon style={{ width: 10, height: 10, color: 'white' }} />
                ) : (
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700, color: isActive ? 'var(--color-bg)' : 'var(--color-text-muted)' }}>1</span>
                )}
              </div>
              <span style={{ fontFamily: 'var(--font-sans)', fontWeight: isActive ? 700 : 500, fontSize: 13, color: isActive ? 'var(--color-text)' : 'var(--color-text-muted)' }}>
                Board
              </span>
            </button>
          )
        })()}
        {!isMobile && (() => {
          const isDone = teamMembers.some(m => m.name?.trim())
          return (
            <button
              onClick={() => setShowTeamModal(true)}
              style={{
                display: 'flex', alignItems: 'center', gap: 7,
                padding: '6px 14px', borderRadius: 8,
                border: '1px solid transparent',
                background: 'transparent',
                cursor: 'pointer', transition: 'all 0.15s',
              }}
            >
              <div style={{
                width: 18, height: 18, borderRadius: '50%',
                background: isDone ? '#16a34a' : 'var(--color-border)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0, transition: 'background 0.2s',
              }}>
                {isDone ? (
                  <CheckIcon style={{ width: 10, height: 10, color: 'white' }} />
                ) : (
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700, color: 'var(--color-text-muted)' }}>2</span>
                )}
              </div>
              <span style={{ fontFamily: 'var(--font-sans)', fontWeight: 500, fontSize: 13, color: 'var(--color-text-muted)' }}>
                Team
              </span>
            </button>
          )
        })()}
      </div>

      {/* ── Main content ── */}
      <div style={{
        flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column',
      }}>

        {/* ── Team tab ── */}
        {/* ── Board tab ── */}
        {activeTab === 'board' && (<>
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden', padding: 8, gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0, background: 'var(--color-bg)', borderRadius: 14, border: '1px solid var(--color-border)', overflow: 'hidden', display: (isMobile && chatOpen) ? 'none' : 'flex', flexDirection: 'column', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', opacity: boardTransitioning ? 0 : 1, transform: boardTransitioning ? 'translateY(8px) scale(0.99)' : 'translateY(0) scale(1)', transition: 'opacity 0.2s ease, transform 0.2s ease' }}>

        {/* ── ClickUp-style toolbar ── */}
        {(() => {
          const totalTasks = kanban?.tasks?.length || 0
          const doneCol = customCols.find(c => c.label === 'Done') || customCols[customCols.length - 1]
          const doneTasks = (kanban?.tasks || []).filter(t => t.column === (doneCol?.id || 'Done')).length
          const donePercent = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0
          return (
            <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 4 : 8, padding: isMobile ? '0 12px' : '0 20px', height: 44, borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg)', flexShrink: 0 }}>
              {/* Left: Board+Team steps (mobile) + task count + progress */}
              <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 4 : 10, flexShrink: 0 }}>
                {isMobile && (() => {
                  const boardDone = !!kanban?.tasks?.length
                  const teamDone = teamMembers.some(m => m.name?.trim())
                  return (
                    <>
                      <button onClick={() => setActiveTab('board')}
                        style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 7, border: activeTab === 'board' ? '1px solid var(--color-border)' : '1px solid transparent', background: activeTab === 'board' ? 'var(--color-surface)' : 'transparent', cursor: 'pointer', minHeight: 'unset' }}>
                        <div style={{ width: 15, height: 15, borderRadius: '50%', background: boardDone ? '#16a34a' : activeTab === 'board' ? 'var(--color-text)' : 'var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          {boardDone ? <CheckIcon style={{ width: 8, height: 8, color: 'white' }} /> : <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, fontWeight: 700, color: activeTab === 'board' ? 'var(--color-bg)' : 'var(--color-text-muted)' }}>1</span>}
                        </div>
                        <span style={{ fontFamily: 'var(--font-sans)', fontWeight: activeTab === 'board' ? 700 : 500, fontSize: 12, color: activeTab === 'board' ? 'var(--color-text)' : 'var(--color-text-muted)' }}>Board</span>
                      </button>
                      <button onClick={() => setShowTeamModal(true)}
                        style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 7, border: '1px solid transparent', background: 'transparent', cursor: 'pointer', minHeight: 'unset' }}>
                        <div style={{ width: 15, height: 15, borderRadius: '50%', background: teamDone ? '#16a34a' : 'var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          {teamDone ? <CheckIcon style={{ width: 8, height: 8, color: 'white' }} /> : <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, fontWeight: 700, color: 'var(--color-text-muted)' }}>2</span>}
                        </div>
                        <span style={{ fontFamily: 'var(--font-sans)', fontWeight: 500, fontSize: 12, color: 'var(--color-text-muted)' }}>Team</span>
                      </button>
                      <div style={{ width: 1, height: 16, background: 'var(--color-border)', flexShrink: 0 }} />
                    </>
                  )
                })()}
                {!isMobile && (
                  <>
                    <span style={{ fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 500, color: 'var(--color-text-muted)' }}>
                      {totalTasks} task{totalTasks !== 1 ? 's' : ''}
                    </span>
                    {totalTasks > 0 && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ width: 60, height: 3, background: 'var(--color-border)', borderRadius: 2 }}>
                          <div style={{ width: donePercent + '%', height: '100%', background: '#16a34a', borderRadius: 2, transition: 'width 0.4s ease' }} />
                        </div>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--color-text-muted)' }}>{donePercent}%</span>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* View tabs — 2 visible on mobile (+ more), all on desktop */}
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2, overflowX: isTablet ? 'auto' : 'visible' }}>
                {[
                  { id: 'board', icon: Squares2X2Icon, label: 'Board' },
                  { id: 'list', icon: ListBulletIcon, label: 'List' },
                  ...(!isMobile ? [
                    { id: 'table', icon: TableCellsIcon, label: 'Table' },
                    { id: 'calendar', icon: CalendarDaysIcon, label: 'Calendar' },
                    { id: 'gantt', icon: ChartBarIcon, label: 'Gantt' },
                  ] : []),
                ].map(v => {
                  const isActive = viewMode === v.id
                  return (
                    <button key={v.id} onClick={() => setViewMode(v.id)}
                      style={{ display: 'flex', alignItems: 'center', gap: 5, padding: isMobile ? '5px 8px' : '5px 12px', borderRadius: 7, border: 'none', background: isActive ? 'var(--color-surface)' : 'transparent', cursor: 'pointer', fontFamily: 'var(--font-sans)', fontSize: isMobile ? 12 : 13, fontWeight: isActive ? 700 : 500, color: isActive ? 'var(--color-text)' : 'var(--color-text-muted)', transition: 'all 0.15s', boxShadow: isActive ? '0 1px 3px rgba(0,0,0,0.08)' : 'none', flexShrink: 0, minHeight: 'unset' }}
                      onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'var(--color-surface)' }}
                      onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent' }}
                    >
                      <v.icon style={{ width: 13, height: 13 }} />
                      {v.label}
                    </button>
                  )
                })}
                {/* More views dropdown — mobile only */}
                {isMobile && (
                  <div style={{ position: 'relative' }}>
                    <button
                      onClick={() => setShowMoreViews(p => !p)}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 7, border: 'none', background: showMoreViews || ['table','calendar','gantt'].includes(viewMode) ? 'var(--color-surface)' : 'transparent', cursor: 'pointer', color: ['table','calendar','gantt'].includes(viewMode) ? 'var(--color-text)' : 'var(--color-text-muted)', minHeight: 'unset' }}
                    >
                      <EllipsisHorizontalIcon style={{ width: 16, height: 16 }} />
                    </button>
                    {showMoreViews && (
                      <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: '50%', transform: 'translateX(-50%)', background: 'var(--color-card)', border: '1px solid var(--color-border)', borderRadius: 10, boxShadow: '0 4px 16px rgba(0,0,0,0.10)', zIndex: 200, overflow: 'hidden', minWidth: 130 }}>
                        {[
                          { id: 'table', icon: TableCellsIcon, label: 'Table' },
                          { id: 'calendar', icon: CalendarDaysIcon, label: 'Calendar' },
                          { id: 'gantt', icon: ChartBarIcon, label: 'Gantt' },
                        ].map(v => {
                          const isActive = viewMode === v.id
                          return (
                            <button key={v.id} onClick={() => { setViewMode(v.id); setShowMoreViews(false) }}
                              style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '10px 14px', border: 'none', background: isActive ? 'var(--color-surface)' : 'transparent', cursor: 'pointer', fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: isActive ? 700 : 500, color: isActive ? 'var(--color-text)' : 'var(--color-text-muted)', textAlign: 'left', minHeight: 'unset' }}>
                              <v.icon style={{ width: 14, height: 14 }} />
                              {v.label}
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Right: Connect + Build with AI + Add Task + Push to Linear */}
              <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 4 : 8, minWidth: isMobile ? 'auto' : 120, justifyContent: 'flex-end', marginLeft: 'auto', flexShrink: 0 }}>
                {!isMobile && (installedConnectors.figma || installedConnectors.github || installedConnectors.linear) && (
                  <div style={{ position: 'relative' }}>
                    <button
                      onClick={() => setShowConnectPanel(p => !p)}
                      style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', background: showConnectPanel ? 'var(--color-surface)' : 'transparent', border: '1px solid var(--color-border)', borderRadius: 8, cursor: 'pointer', fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 600, color: 'var(--color-text)' }}
                    >
                      <LinkIcon style={{ width: 13, height: 13 }} />
                      Connect
                    </button>
                    {showConnectPanel && (
                      <ConnectPanel
                        workspaceId={workspace?.id}
                        projectId={activeProjectId}
                        installed={installedConnectors}
                        onClose={() => setShowConnectPanel(false)}
                        onConnected={() => setShowConnectPanel(false)}
                      />
                    )}
                  </div>
                )}
                {kanban?.tasks?.length > 0 && canEdit && (
                  <button
                    onClick={() => setShowBuildInterface(true)}
                    style={{ display: 'flex', alignItems: 'center', gap: 5, padding: isMobile ? '5px 8px' : '5px 14px', background: '#7C3AED', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 700, boxShadow: '0 1px 6px rgba(124,58,237,0.3)', minHeight: 'unset' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#6D28D9'}
                    onMouseLeave={e => e.currentTarget.style.background = '#7C3AED'}
                  >
                    <BoltIcon style={{ width: 13, height: 13 }} />
                    {!isMobile && 'Build with AI'}
                  </button>
                )}
                {/* ── Phase 2: Start AI Build (website section builder) ── */}
                {canEdit && (() => {
                  const todoCount = (kanban?.tasks || []).filter(t => {
                    const c = String(t.column || '').toLowerCase()
                    return c === 'to do' || c === 'todo'
                  }).length
                  const hasBrief = !!(activeProject?.data?.result || activeProject?.result)
                  const inProgress = !!activeAiBuild
                  const disabled = !inProgress && (!hasBrief || todoCount === 0)
                  const tooltip = !hasBrief
                    ? 'Translate a brief first to use AI Builder'
                    : todoCount === 0
                      ? 'Add tasks to your TODO column to start building'
                      : inProgress
                        ? 'Continue your build where you left off'
                        : 'Start building your website with AI'
                  const handleClick = async () => {
                    if (disabled || aiBuildLoading) return
                    if (inProgress) {
                      setAiBuilderOpen(true)
                      return
                    }
                    setAiBuildModeOpen(true)
                  }
                  return (
                    <button
                      onClick={handleClick}
                      disabled={disabled || aiBuildLoading}
                      title={tooltip}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        padding: isMobile ? '5px 10px' : '6px 16px',
                        background: disabled
                          ? 'var(--color-surface)'
                          : 'linear-gradient(135deg, #8B5CF6, #6366F1)',
                        color: disabled ? 'var(--color-text-muted)' : '#fff',
                        border: disabled ? '1px solid var(--color-border)' : 'none',
                        borderRadius: 10,
                        cursor: (disabled || aiBuildLoading) ? 'not-allowed' : 'pointer',
                        fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 700,
                        boxShadow: disabled ? 'none' : '0 4px 14px rgba(124,58,237,0.30)',
                        minHeight: 'unset',
                        opacity: disabled ? 0.7 : 1,
                        transition: 'background 0.15s, box-shadow 0.15s, opacity 0.15s',
                      }}
                    >
                      <SparklesIcon
                        style={{
                          width: 13, height: 13,
                          animation: disabled ? 'none' : 'pulse 1.6s ease-in-out infinite',
                        }}
                      />
                      {!isMobile && (inProgress ? 'Continue Build' : 'Start AI Build')}
                    </button>
                  )
                })()}
                {!isMobile && canEdit && (
                  <button onClick={() => createAndOpenTask(customCols[0]?.id || KANBAN_COLS[0])}
                    style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 14px', background: 'var(--color-text)', color: 'var(--color-bg)', border: 'none', borderRadius: 8, cursor: 'pointer', fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 700, minHeight: 'unset' }}>
                    <PlusIcon style={{ width: 13, height: 13 }} />
                    Add Task
                  </button>
                )}
                {isViewer && !isMobile && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', background: 'rgba(14,165,233,0.10)', border: '1px solid rgba(14,165,233,0.25)', color: '#0369A1', borderRadius: 8, fontFamily: 'var(--font-sans)', fontSize: 12, fontWeight: 600 }}>
                    Viewer · read-only
                  </span>
                )}
                {!isMobile && connectorData?.linear?.teams?.length > 0 && kanban?.tasks?.length > 0 && (
                  <button
                    onClick={() => { setSelectedTeamId(connectorData.linear.teams[0]?.id || ''); setPushResult(null); setPushLinearOpen(true) }}
                    style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 14px', background: '#5E6AD2', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 700 }}
                  >
                    <svg width="13" height="13" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M17.5 66.7L33.3 82.5L82.5 33.3" stroke="white" strokeWidth="14" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M17.5 33.3H50" stroke="white" strokeWidth="14" strokeLinecap="round"/>
                    </svg>
                    Push to Linear
                  </button>
                )}
              </div>
            </div>
          )
        })()}

        {/* List view */}
        {viewMode === 'list' && (
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 80px 100px 100px 60px', gap: 12, padding: '8px 16px', background: 'var(--color-surface)', borderRadius: 8, marginBottom: 10, fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--color-text-muted)', letterSpacing: '0.06em' }}>
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
                    <span style={{ fontFamily: 'var(--font-sans)', fontWeight: 600, fontSize: 12, color: 'var(--color-text)' }}>{col.label}</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--color-text-muted)' }}>({colTasks.length})</span>
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
                          {task.blockedBy?.length > 0 && task.column !== col.id && <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--color-red)', marginRight: 6 }}>🔒</span>}
                          <span style={{ fontFamily: 'var(--font-sans)', fontWeight: 600, fontSize: 12, color: 'var(--color-text)' }}>{task.title}</span>
                          {task.description && <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--color-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2 }}>{task.description}</div>}
                        </div>
                        <div>
                          {task.assignedRole ? (
                            <div style={{ background: roleColor + '18', border: '1px solid ' + roleColor + '33', borderRadius: 5, padding: '2px 7px', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                              <span style={{ fontSize: 9 }}>{meta?.icon}</span>
                              <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: roleColor }}>{task.assignedName || task.assignedRole}</span>
                            </div>
                          ) : <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--color-text-muted)' }}>Unassigned</span>}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <div style={{ width: 6, height: 6, borderRadius: '50%', background: pc }} />
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: pc }}>{task.priority}</span>
                        </div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: dueColor }}>{dueTxt}</div>
                        <div><div style={{ background: cc + '18', border: '1px solid ' + cc + '33', borderRadius: 5, padding: '2px 8px', display: 'inline-block', fontFamily: 'var(--font-mono)', fontSize: 9, color: cc }}>{col.label}</div></div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--color-text-muted)' }}>{task.estimatedDays}d</div>
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
        {viewMode === 'gantt' && (() => {
          const briefGantt = projects.find(p => p.id === activeProjectId)?.briefData?.ganttData
          return (
            <>
              {briefGantt?.phases?.length > 0 && (
                <div style={{ padding: '20px 20px 0', flexShrink: 0 }}>
                  <div style={{ background: 'var(--color-card)', border: '1px solid var(--color-border)', borderRadius: 12, padding: 20, marginBottom: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 14 }}>
                      <div style={{ fontFamily: 'var(--font-sans)', fontWeight: 700, fontSize: 14, color: 'var(--color-text)' }}>
                        Brief Timeline
                      </div>
                      {briefGantt.totalDays && (
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--color-text-muted)' }}>
                          {briefGantt.totalDays} days · from brief translation
                        </div>
                      )}
                    </div>
                    <GanttSection ganttData={briefGantt} accent="#7C3AED" />
                  </div>
                </div>
              )}
              <GanttView tasks={kanban?.tasks || []} customCols={customCols} />
            </>
          )
        })()}

        {/* Kanban board */}
        {viewMode === 'board' && (
        <div style={{
          flex: 1,
          overflowX: 'auto',
          overflowY: 'hidden',
          padding: '12px 16px',
          background: 'var(--color-surface)',
        }}>
          <div style={{
            display: 'flex',
            flexDirection: 'row',
            gap: 12,
            height: '100%',
            alignItems: 'flex-start',
            minWidth: 'max-content',
          }}>
            {customCols.map((col) => {
              const colTasks = (kanban?.tasks || []).filter(t => t.column === col.id)
              const isTaskDropTarget = dragOverCol === col.id && draggedTask !== null && !dragOverTaskId
              const isColDropTarget = dragOverColId === col.id && draggedColId !== null && draggedColId !== col.id
              const accentCol = col.color
              return (
                <div key={col.id}
                  draggable
                  onDragStart={e => {
                    if (draggedTaskRef.current) { e.preventDefault(); return }
                    setDraggedColId(col.id)
                    e.dataTransfer.effectAllowed = 'move'
                    e.dataTransfer.setData('text/plain', 'col-' + col.id)
                    e.currentTarget.style.opacity = '0.5'
                  }}
                  onDragEnd={e => {
                    e.currentTarget.style.opacity = '1'
                    setDraggedColId(null)
                    setDragOverColId(null)
                  }}
                  onDragOver={e => {
                    if (draggedTaskRef.current) {
                      e.preventDefault()
                      e.dataTransfer.dropEffect = 'move'
                      setDragOverCol(col.id)
                    } else if (draggedColId && draggedColId !== col.id) {
                      e.preventDefault()
                      e.dataTransfer.dropEffect = 'move'
                      setDragOverColId(col.id)
                    }
                  }}
                  onDrop={e => {
                    const dt = draggedTaskRef.current
                    if (dt) {
                      e.preventDefault()
                      if (!dragOverTaskId) {
                        localChangeAtRef.current.set(dt.id, Date.now())
                        setKanban(prev => ({
                          ...prev,
                          tasks: prev.tasks.map(t => t.id === dt.id ? { ...t, column: col.id } : t),
                        }))
                        if (authUser) updateTaskInDB({ ...dt, column: col.id }).catch(console.error)
                      }
                      draggedTaskRef.current = null
                      setDraggedTask(null)
                      setDragOverCol(null)
                      setDragOverTaskId(null)
                    } else if (draggedColId && draggedColId !== col.id) {
                      e.preventDefault()
                      const fromIdx = customCols.findIndex(c => c.id === draggedColId)
                      const toIdx = customCols.findIndex(c => c.id === col.id)
                      if (fromIdx !== -1 && toIdx !== -1) {
                        const newCols = [...customCols]
                        const [moved] = newCols.splice(fromIdx, 1)
                        newCols.splice(toIdx, 0, moved)
                        saveCustomCols(newCols)
                      }
                      setDraggedColId(null)
                      setDragOverColId(null)
                    }
                  }}
                  style={{
                    width: 260,
                    flexShrink: 0,
                    borderRadius: 12,
                    transition: 'background 0.15s, border-left 0.15s',
                    background: isTaskDropTarget ? 'rgba(59,130,246,0.05)' : 'rgba(0,0,0,0.03)',
                    outline: isTaskDropTarget ? '2px dashed #3B82F6' : 'none',
                    outlineOffset: -2,
                    borderLeft: isColDropTarget ? '3px solid #3B82F6' : '3px solid transparent',
                    paddingLeft: 4, padding: '12px 10px',
                  }}
                >
                  {/* Column header */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, padding: '4px 0' }}>
                    {/* Left side: drag handle + title */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0, flex: 1 }}>
                      {/* Drag handle */}
                      <div
                        style={{ cursor: 'grab', padding: '0 2px', display: 'flex', alignItems: 'center', color: 'var(--color-text-muted)', opacity: 0.4, flexShrink: 0 }}
                        onMouseEnter={e => { e.currentTarget.style.opacity = '0.8' }}
                        onMouseLeave={e => { e.currentTarget.style.opacity = '0.4' }}
                        onMouseDown={e => e.stopPropagation()}
                      >
                        <Bars2Icon style={{ width: 14, height: 14 }} />
                      </div>

                      {/* Column title — single-click to rename */}
                      {editingColId === col.id ? (
                        <input
                          autoFocus
                          value={editingColLabel}
                          onChange={e => setEditingColLabel(e.target.value)}
                          onBlur={() => {
                            if (editingColLabel.trim()) saveCustomCols(customCols.map(c => c.id === col.id ? { ...c, label: editingColLabel.trim() } : c))
                            setEditingColId(null)
                          }}
                          onKeyDown={e => {
                            if (e.key === 'Enter') { if (editingColLabel.trim()) saveCustomCols(customCols.map(c => c.id === col.id ? { ...c, label: editingColLabel.trim() } : c)); setEditingColId(null) }
                            if (e.key === 'Escape') setEditingColId(null)
                          }}
                          onClick={e => e.stopPropagation()}
                          onMouseDown={e => e.stopPropagation()}
                          style={{ background: accentCol + '15', border: '1.5px solid ' + accentCol, borderRadius: 6, outline: 'none', padding: '3px 10px', fontFamily: 'var(--font-sans)', fontWeight: 700, fontSize: 11, color: accentCol, textTransform: 'uppercase', letterSpacing: '0.04em', minWidth: 80, maxWidth: 150 }}
                        />
                      ) : (
                        <div
                          onClick={e => { e.stopPropagation(); setEditingColId(col.id); setEditingColLabel(col.label) }}
                          onMouseDown={e => e.stopPropagation()}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: accentCol + '15', border: '1px solid ' + accentCol + '30', borderRadius: 6, padding: '3px 10px', cursor: 'text', userSelect: 'none', transition: 'background 0.1s' }}
                          onMouseEnter={e => { e.currentTarget.style.background = accentCol + '25' }}
                          onMouseLeave={e => { e.currentTarget.style.background = accentCol + '15' }}
                          title="Click to rename"
                        >
                          <div style={{ width: 6, height: 6, borderRadius: '50%', background: accentCol, flexShrink: 0 }} />
                          <span style={{ fontFamily: 'var(--font-sans)', fontWeight: 700, fontSize: 11, color: accentCol, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{col.label}</span>
                        </div>
                      )}
                    </div>

                    {/* Right: task count + three-dot menu + add button */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0, position: 'relative' }} data-col-menu>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-text-muted)', fontWeight: 600, marginRight: 2 }}>{colTasks.length}</span>

                      <button
                        onClick={e => { e.stopPropagation(); setOpenColMenuId(openColMenuId === col.id ? null : col.id) }}
                        onMouseDown={e => e.stopPropagation()}
                        style={{ width: 24, height: 24, borderRadius: 6, background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.1s' }}
                        onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-surface)' }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                      >
                        <EllipsisHorizontalIcon style={{ width: 14, height: 14, color: 'var(--color-text-muted)' }} />
                      </button>

                      <button
                        onClick={e => { e.stopPropagation(); createAndOpenTask(col.id) }}
                        onMouseDown={e => e.stopPropagation()}
                        style={{ width: 24, height: 24, borderRadius: 6, background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.1s' }}
                        onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-surface)' }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                      >
                        <PlusIcon style={{ width: 14, height: 14, color: 'var(--color-text-muted)' }} />
                      </button>

                      {/* Dropdown menu */}
                      {openColMenuId === col.id && (
                        <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 4, background: 'var(--color-card)', border: '1px solid var(--color-border)', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', padding: 4, minWidth: 180, zIndex: 100 }}>
                          {(() => {
                            const colIdx = customCols.findIndex(c => c.id === col.id)
                            const isFirst = colIdx === 0
                            const isLast = colIdx === customCols.length - 1
                            const items = [
                              { icon: PencilIcon, label: 'Rename', onClick: () => handleRenameColumn(col.id), disabled: false, danger: false },
                              { icon: ArrowLeftIcon, label: 'Move left', onClick: () => handleMoveColumn(col.id, 'left'), disabled: isFirst, danger: false },
                              { icon: ArrowRightIcon, label: 'Move right', onClick: () => handleMoveColumn(col.id, 'right'), disabled: isLast, danger: false },
                              { icon: TrashIcon, label: 'Delete', onClick: () => handleDeleteColumn(col.id), disabled: customCols.length <= 1, danger: true },
                            ]
                            return items.map((item, i) => (
                              <button
                                key={i}
                                onClick={item.onClick}
                                disabled={item.disabled}
                                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 9, padding: '7px 10px', background: 'transparent', border: 'none', borderRadius: 7, cursor: item.disabled ? 'not-allowed' : 'pointer', fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 500, color: item.disabled ? 'var(--color-text-muted)' : item.danger ? '#dc2626' : 'var(--color-text)', opacity: item.disabled ? 0.4 : 1, textAlign: 'left', transition: 'background 0.1s' }}
                                onMouseEnter={e => { if (!item.disabled) e.currentTarget.style.background = item.danger ? 'rgba(220,38,38,0.08)' : 'var(--color-surface)' }}
                                onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                              >
                                <item.icon style={{ width: 14, height: 14, color: item.disabled ? 'var(--color-text-muted)' : item.danger ? '#dc2626' : 'var(--color-text-soft)', flexShrink: 0 }} />
                                {item.label}
                              </button>
                            ))
                          })()}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Tasks area */}
                  <div
                    style={{ display: 'flex', flexDirection: 'column', gap: 10, minHeight: 60 }}
                    onDragOver={e => {
                      if (!draggedTaskRef.current) return
                      e.preventDefault()
                      e.dataTransfer.dropEffect = 'move'
                      setDragOverCol(col.id)
                    }}
                    onDragLeave={e => {
                      if (e.currentTarget.contains(e.relatedTarget)) return
                      setDragOverCol(null)
                      setDragOverTaskId(null)
                    }}
                    onDrop={e => {
                      e.preventDefault()
                      if (!canEdit) return
                      const dt = draggedTaskRef.current
                      if (!dt) return
                      if (dragOverTaskId) return
                      localChangeAtRef.current.set(dt.id, Date.now())
                      setKanban(prev => ({
                        ...prev,
                        tasks: prev.tasks.map(t => t.id === dt.id ? { ...t, column: col.id } : t),
                      }))
                      if (authUser) updateTaskInDB({ ...dt, column: col.id }).catch(console.error)
                      draggedTaskRef.current = null
                      setDraggedTask(null)
                      setDragOverCol(null)
                      setDragOverTaskId(null)
                    }}
                  >
                    {/* Fetch-error notice */}
                    {taskLoadError && colTasks.length === 0 && (
                      <div style={{ padding: '12px 8px', textAlign: 'center', fontFamily: 'var(--font-sans)', fontSize: 11, color: '#dc2626' }}>
                        Failed to load tasks. Try refreshing.
                      </div>
                    )}
                    {colTasks.map(task => <React.Fragment key={task.id}>{TaskCard({ task })}</React.Fragment>)}
                    {colTasks.length === 0 && !isTaskDropTarget && !taskLoadError && (
                      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px 0' }}>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-text-muted)', opacity: 0.5 }}>No tasks yet</div>
                      </div>
                    )}
                    {isTaskDropTarget && colTasks.length === 0 && (
                      <div style={{ height: 60, border: '1.5px dashed #3B82F680', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-mono)', fontSize: 11, color: '#3B82F6' }}>Drop here</div>
                    )}
                    {canEdit && (
                    <button
                      onClick={() => createAndOpenTask(col.id)}
                      onMouseDown={e => e.stopPropagation()}
                      style={{ width: '100%', marginTop: 8, padding: '7px 0', background: 'transparent', border: '1px dashed var(--color-border)', borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, cursor: 'pointer', transition: 'all 0.15s', fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--color-text-muted)', fontWeight: 500 }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--color-text-muted)'; e.currentTarget.style.color = 'var(--color-text)' }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--color-border)'; e.currentTarget.style.color = 'var(--color-text-muted)' }}
                    >
                      <PlusIcon style={{ width: 13, height: 13 }} />
                      Add task
                    </button>
                    )}
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
                style={{ width: '100%', padding: '10px 16px', background: 'transparent', border: '1.5px dashed var(--color-border)', borderRadius: 12, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 600, color: 'var(--color-text-muted)', transition: 'all 0.15s' }}
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
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--color-text-muted)', flexShrink: 0, marginRight: 4 }}>UNASSIGNED:</span>
            {kanban.unassignedTasks.map((ut, i) => (
              <div key={i} style={{ background: 'var(--color-card)', border: '1px solid var(--color-amber)', borderRadius: 8, padding: '6px 12px', display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
                <span style={{ fontFamily: 'var(--font-sans)', fontWeight: 600, fontSize: 11, color: 'var(--color-text)' }}>{ut.title || ut}</span>
                {ut.suggestedRole && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--color-amber)' }}>→ Need: {ut.suggestedRole}</span>}
              </div>
            ))}
          </div>
        )}

        </div> {/* closes kanban card */}

        {/* AI panel — full width on mobile, inline right panel on desktop/tablet */}
        {chatOpen && (
          <div style={{
            ...(isMobile
              ? { flex: 1, minWidth: 0 }
              : { width: 400, flexShrink: 0 }
            ),
            background: 'var(--color-bg)', borderRadius: 14,
            border: '1px solid var(--color-border)', overflow: 'hidden',
            display: 'flex', flexDirection: 'column',
            boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
            animation: 'slideInRight 0.25s ease',
            fontFamily: 'var(--font-sans)',
          }}>

            {/* ── HEADER ── */}
            <div style={{
              padding: '14px 24px', borderBottom: '1px solid var(--color-border)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              flexShrink: 0, background: 'var(--color-bg)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 10,
                  background: 'linear-gradient(135deg, #8B5CF6 0%, #3B82F6 100%)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: '0 4px 12px rgba(139,92,246,0.25)',
                }}>
                  <SparklesIcon style={{ width: 15, height: 15, color: 'white' }} />
                </div>
                <div>
                  <div style={{ fontFamily: 'var(--font-sans)', fontWeight: 800, fontSize: 15, color: 'var(--color-text)', letterSpacing: '-0.02em', lineHeight: 1.2 }}>AI Assistant</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 2 }}>
                    <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#16a34a' }} />
                    <span style={{ fontFamily: 'var(--font-sans)', fontSize: 11, fontWeight: 500, color: 'var(--color-text-muted)' }}>
                      Ready · {kanban?.tasks?.length || 0} tasks on board
                    </span>
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {messages.length > 0 && (
                  <button
                    onClick={() => { setMessages([]); setChatHistory([]) }}
                    title="Clear chat"
                    style={{ width: 28, height: 28, borderRadius: 7, background: 'transparent', border: '1px solid transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-muted)', transition: 'all 0.15s' }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-surface)'; e.currentTarget.style.borderColor = 'var(--color-border)' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'transparent' }}
                  >
                    <ArrowPathIcon style={{ width: 13, height: 13 }} />
                  </button>
                )}
                <button
                  onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); setChatOpen(false) }}
                  style={{ width: 28, height: 28, borderRadius: 7, background: 'transparent', border: '1px solid transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s' }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-surface)'; e.currentTarget.style.borderColor = 'var(--color-border)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'transparent' }}
                >
                  <XMarkIcon style={{ width: 14, height: 14, color: 'var(--color-text-muted)' }} />
                </button>
              </div>
            </div>

            {/* ── MESSAGES AREA ── */}
            <div
              ref={messagesEndRef}
              style={{ flex: 1, overflowY: 'auto', padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: 4, scrollBehavior: 'smooth', alignItems: 'stretch' }}
            >
              {messages.length === 0 && !isTyping && (
                <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '20px 4px', textAlign: 'center' }}>
                  <div style={{
                    width: 44, height: 44, borderRadius: 14,
                    background: 'linear-gradient(135deg, rgba(139,92,246,0.1) 0%, rgba(59,130,246,0.1) 100%)',
                    border: '1px solid rgba(139,92,246,0.2)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 8,
                  }}>
                    <SparklesIcon style={{ width: 20, height: 20, color: '#8B5CF6' }} />
                  </div>
                  <div style={{ fontFamily: 'var(--font-sans)', fontWeight: 800, fontSize: 15, color: 'var(--color-text)', letterSpacing: '-0.02em', marginBottom: 4 }}>What do you need?</div>
                  <div style={{ fontFamily: 'var(--font-sans)', fontSize: 12, fontWeight: 400, color: 'var(--color-text-muted)', lineHeight: 1.6, maxWidth: 220, marginBottom: 16 }}>
                    Manage tasks, generate plans, prioritise work — just ask.
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 7, width: '100%' }}>
                    {activeSuggestions.map((s, i) => {
                      const iconMap = {
                        SparklesIcon, BoltIcon, ArrowsUpDownIcon, ChartBarIcon,
                        ExclamationCircleIcon, ListBulletIcon, PencilSquareIcon,
                        UsersIcon, CheckCircleIcon, ClockIcon, DevicePhoneMobileIcon,
                        SwatchIcon, ArrowPathIcon, MagnifyingGlassIcon,
                      }
                      const IconComp = iconMap[s.icon] || SparklesIcon
                      return (
                        <button
                          key={i}
                          onClick={() => setInput(s.prompt)}
                          style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 10, padding: '9px 12px', fontFamily: 'var(--font-sans)', fontSize: 12, fontWeight: 500, color: 'var(--color-text)', cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: 9, width: '100%' }}
                          onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-card)'; e.currentTarget.style.borderColor = 'var(--color-text-muted)'; e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.06)' }}
                          onMouseLeave={e => { e.currentTarget.style.background = 'var(--color-surface)'; e.currentTarget.style.borderColor = 'var(--color-border)'; e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none' }}
                        >
                          <div style={{ width: 26, height: 26, borderRadius: 7, background: 'var(--color-bg)', border: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <IconComp style={{ width: 13, height: 13, color: 'var(--color-text-muted)' }} />
                          </div>
                          <span>{s.label}</span>
                          <ArrowRightIcon style={{ width: 12, height: 12, color: 'var(--color-text-muted)', marginLeft: 'auto', flexShrink: 0 }} />
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
              {messages.map(m => <ChatBubble key={m.id} msg={m} />)}
              {isTyping && (
                <TypingBubble
                  userMessage={messages.filter(m => m.role === 'user').slice(-1)[0]?.text || ''}
                />
              )}
              <div ref={scrollAnchorRef} />
            </div>

            {/* Role selector */}
            {phase === 'roles' && (
              <div style={{ padding: '12px 14px', borderTop: '1px solid var(--color-border)', background: 'var(--color-surface)' }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--color-text-muted)', marginBottom: 8, letterSpacing: '0.06em' }}>SELECT ROLES &amp; ADD NAMES</div>
                {suggestedRoles.length > 0 && (
                  <>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--color-accent)', letterSpacing: '0.08em', marginBottom: 6 }}>AI SUGGESTED</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                      {suggestedRoles.map(role => {
                        const meta = ROLE_META[role]
                        if (!meta) return null
                        const isSelected = !!teamMembers.find(m => m.role === role)
                        return (
                          <button key={role} onClick={() => toggleRole(role)}
                            style={{ background: isSelected ? meta.color + '22' : 'var(--color-surface)', border: '1px solid ' + (isSelected ? meta.color : meta.color + '55'), boxShadow: isSelected ? 'none' : '0 0 0 1px ' + meta.color + '38', borderRadius: 7, padding: '5px 10px', fontSize: 11, fontFamily: 'var(--font-sans)', fontWeight: 600, cursor: 'pointer', color: isSelected ? meta.color : meta.color + 'BB', display: 'flex', gap: 5, alignItems: 'center' }}
                          >
                            {meta.icon} {role}
                            {isSelected ? <span style={{ fontSize: 10, color: meta.color }}>✓</span> : <span style={{ fontSize: 9, opacity: 0.7, color: meta.color }}>✦</span>}
                          </button>
                        )
                      })}
                    </div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--color-text-muted)', letterSpacing: '0.08em', marginBottom: 6 }}>OTHER ROLES</div>
                  </>
                )}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {Object.keys(ROLE_META).filter(role => !suggestedRoles.includes(role)).map(role => {
                    const meta = ROLE_META[role]
                    const isSelected = !!teamMembers.find(m => m.role === role)
                    return (
                      <button key={role} onClick={() => toggleRole(role)}
                        style={{ background: isSelected ? meta.color + '22' : 'transparent', border: '1px solid ' + (isSelected ? meta.color : 'var(--color-border)'), borderRadius: 7, padding: '5px 10px', fontSize: 11, fontFamily: 'var(--font-sans)', fontWeight: 600, cursor: 'pointer', color: isSelected ? meta.color : 'var(--color-text-soft)', display: 'flex', gap: 5, alignItems: 'center' }}
                      >
                        {meta.icon} {role}
                        {isSelected && <span style={{ fontSize: 10, color: meta.color }}>✓</span>}
                      </button>
                    )
                  })}
                </div>
                {teamMembers.length > 0 && (
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-text-muted)', marginTop: 6 }}>
                    {teamMembers.length} member{teamMembers.length !== 1 ? 's' : ''} selected
                  </div>
                )}
                {teamMembers.length > 0 && (
                  <>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                      {teamMembers.map(m => {
                        const meta = ROLE_META[m.role] || { color: 'var(--color-text-soft)', icon: '◈' }
                        return (
                          <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'var(--color-card)', border: '1px solid ' + meta.color + '44', borderRadius: 7, padding: '5px 10px' }}>
                            <span style={{ fontSize: 11, flexShrink: 0 }}>{meta.icon}</span>
                            <input value={m.name} onChange={e => updateMemberName(m.id, e.target.value)} placeholder={m.role}
                              style={{ background: 'transparent', border: 'none', outline: 'none', fontFamily: 'var(--font-sans)', fontSize: 11, color: 'var(--color-text)', width: 100 }}
                            />
                          </div>
                        )
                      })}
                    </div>
                    <button onClick={handleGenerateKanban} disabled={loading}
                      style={{ width: '100%', marginTop: 10, background: loading ? 'var(--color-border)' : 'var(--color-accent)', border: 'none', borderRadius: 9, padding: '10px 0', color: 'var(--color-accent-text)', fontFamily: 'var(--font-sans)', fontWeight: 700, fontSize: 12, cursor: loading ? 'default' : 'pointer', opacity: loading ? 0.6 : 1 }}
                    >{loading ? 'Generating...' : 'Generate Kanban Board →'}</button>
                  </>
                )}
              </div>
            )}

            {/* File indicator */}
            {fileName && (
              <div style={{ padding: '0 14px 8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--color-accent-bg)', border: '1px solid var(--color-accent-border)', borderRadius: 7, padding: '5px 10px', fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-accent)' }}>
                  <span>📄 {fileName}</span>
                  <button onClick={() => setFileName(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-accent)', fontSize: 13, padding: '0 0 0 6px' }}>×</button>
                </div>
              </div>
            )}

            {/* ── INPUT AREA ── */}
            {(phase === 'brief' || phase === 'kanban') && (
              <div style={{ padding: '10px 24px 16px', borderTop: 'none', background: 'var(--color-bg)', flexShrink: 0 }}>
                <input ref={fileInputRef} type="file" accept=".txt,.pdf,.doc,.docx,.md" style={{ display: 'none' }} onChange={e => handleFileUpload(e.target.files[0])} />
                <div
                  style={{ background: 'var(--color-surface)', border: '1.5px solid var(--color-border)', borderRadius: 14, overflow: 'visible', transition: 'border-color 0.15s, box-shadow 0.15s', opacity: canEdit ? 1 : 0.55 }}
                  onFocusCapture={e => { if (canEdit) { e.currentTarget.style.borderColor = '#8B5CF6'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(139,92,246,0.1)' } }}
                  onBlurCapture={e => { e.currentTarget.style.borderColor = 'var(--color-border)'; e.currentTarget.style.boxShadow = 'none' }}
                >
                  <textarea
                    ref={chatInputRef}
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (canEdit) handleChatSend() } }}
                    placeholder={canEdit ? (kanban?.tasks?.length ? 'Ask anything about this project...' : 'Describe your project or paste a brief...') : 'Viewers cannot edit this brief'}
                    readOnly={!canEdit}
                    rows={1}
                    style={{ width: '100%', background: 'transparent', border: 'none', outline: 'none', resize: 'none', fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 400, color: 'var(--color-text)', lineHeight: 1.6, padding: '12px 14px 6px', display: 'block', boxSizing: 'border-box', overflowY: 'hidden', height: 'auto', cursor: canEdit ? 'text' : 'not-allowed' }}
                  />
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', padding: '4px 10px 10px' }}>
                    <button
                      onPointerDown={e => { e.preventDefault(); if (canEdit) handleChatSend() }}
                      disabled={!canEdit || !input.trim() || isTyping}
                      style={{ width: 30, height: 30, borderRadius: 9, background: canEdit && input.trim() && !isTyping ? 'linear-gradient(135deg, #8B5CF6 0%, #3B82F6 100%)' : 'var(--color-border)', border: 'none', cursor: canEdit && input.trim() && !isTyping ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 0.2s', boxShadow: canEdit && input.trim() && !isTyping ? '0 2px 8px rgba(139,92,246,0.3)' : 'none' }}
                    >
                      <ArrowUpIcon style={{ width: 13, height: 13, color: canEdit && input.trim() && !isTyping ? 'white' : 'var(--color-text-muted)' }} />
                    </button>
                  </div>
                </div>
              </div>
            )}

          </div>
        )}

        </div> {/* closes outer flex row */}

        </>)}
      </div>


      {/* Prompt Modal */}
      {promptModalOpen && (
        <div
          onClick={() => setPromptModalOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, backdropFilter: 'blur(8px)' }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 20, width: '100%', maxWidth: 760, maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 24px 64px rgba(0,0,0,0.32)', fontFamily: 'var(--font-sans)' }}
          >
            {/* Header */}
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg, #8B5CF6 0%, #3B82F6 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(139,92,246,0.3)' }}>
                  <SparklesIcon style={{ width: 18, height: 18, color: 'white' }} />
                </div>
                <div>
                  <div style={{ fontFamily: 'var(--font-sans)', fontWeight: 800, fontSize: 17, color: 'var(--color-text)', letterSpacing: '-0.01em', lineHeight: 1.2 }}>Implementation Prompt</div>
                  <div style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--color-text-muted)', marginTop: 2, fontWeight: 500 }}>Senior-level brief · Claude Code · Cursor · v0</div>
                </div>
              </div>
              <button
                onPointerDown={e => { e.preventDefault(); setPromptModalOpen(false) }}
                style={{ width: 34, height: 34, borderRadius: 9, background: 'var(--color-surface)', border: '1px solid var(--color-border)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-border)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'var(--color-surface)' }}
              >
                <XMarkIcon style={{ width: 15, height: 15, color: 'var(--color-text-muted)' }} />
              </button>
            </div>

            {/* Task title chip + Customize toggle */}
            {promptModalTask && (
              <div style={{ padding: '14px 24px', background: 'var(--color-surface)', borderBottom: '1px solid var(--color-border)', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 5, height: 28, background: 'linear-gradient(180deg, #8B5CF6 0%, #3B82F6 100%)', borderRadius: 3, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: 'var(--font-sans)', fontSize: 11, color: 'var(--color-text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>For task</div>
                  <div style={{ fontFamily: 'var(--font-sans)', fontWeight: 700, fontSize: 14, color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{promptModalTask.title}</div>
                </div>
                <button
                  onClick={() => setShowPrefsPanel(prev => !prev)}
                  style={{ padding: '7px 14px', background: showPrefsPanel ? 'var(--color-text)' : 'var(--color-bg)', color: showPrefsPanel ? 'var(--color-bg)' : 'var(--color-text)', border: '1px solid ' + (showPrefsPanel ? 'var(--color-text)' : 'var(--color-border)'), borderRadius: 8, cursor: 'pointer', fontFamily: 'var(--font-sans)', fontWeight: 600, fontSize: 12, display: 'flex', alignItems: 'center', gap: 5, transition: 'all 0.15s', flexShrink: 0 }}
                >
                  <AdjustmentsHorizontalIcon style={{ width: 13, height: 13 }} />
                  Customize
                </button>
              </div>
            )}


            {/* Customize panel */}
            {showPrefsPanel && (
              <div style={{ padding: '16px 24px', background: 'var(--color-bg)', borderBottom: '1px solid var(--color-border)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, flexShrink: 0 }}>
                {[
                  { key: 'colors', label: 'Colors', placeholder: 'e.g. navy + cream, warm earth tones' },
                  { key: 'fonts', label: 'Fonts', placeholder: 'e.g. Geist, Fraunces + Inter' },
                  { key: 'style', label: 'Style direction', placeholder: 'e.g. minimalist, brutalist, editorial' },
                  { key: 'references', label: 'Reference sites', placeholder: 'e.g. linear.app, vercel.com' },
                ].map(field => (
                  <div key={field.key}>
                    <label style={{ display: 'block', fontFamily: 'var(--font-sans)', fontWeight: 600, fontSize: 11, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>{field.label}</label>
                    <input
                      value={promptPrefs[field.key]}
                      onChange={e => setPromptPrefs(p => ({ ...p, [field.key]: e.target.value }))}
                      placeholder={field.placeholder}
                      style={{ width: '100%', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8, padding: '7px 10px', fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--color-text)', outline: 'none', boxSizing: 'border-box' }}
                    />
                  </div>
                ))}
              </div>
            )}

            {/* Error banner */}
            {promptError && !generatingPrompt && (
              <div style={{ margin: '0 24px', marginTop: 12, padding: '10px 14px', background: '#FEF3C7', border: '1px solid #F59E0B40', borderRadius: 8, display: 'flex', alignItems: 'flex-start', gap: 8, flexShrink: 0 }}>
                <ExclamationCircleIcon style={{ width: 14, height: 14, color: '#D97706', flexShrink: 0, marginTop: 1 }} />
                <span style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: '#92400E', fontWeight: 500, lineHeight: 1.4 }}>{promptError}</span>
                <button onClick={() => setPromptError(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#92400E', flexShrink: 0, padding: 0 }}>
                  <XMarkIcon style={{ width: 13, height: 13 }} />
                </button>
              </div>
            )}

            {/* Prompt body */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', background: 'var(--color-bg)' }}>
              {generatingPrompt ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 60, gap: 14 }}>
                  <div style={{ display: 'flex', gap: 7 }}>
                    {[0, 1, 2].map(i => (
                      <span key={i} style={{ width: 10, height: 10, borderRadius: '50%', background: 'linear-gradient(135deg, #8B5CF6 0%, #3B82F6 100%)', display: 'block', animation: 'pulse 1.4s ease infinite', animationDelay: i * 0.2 + 's' }} />
                    ))}
                  </div>
                  <div style={{ fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 500, color: 'var(--color-text-muted)' }}>Crafting your senior-level prompt...</div>
                </div>
              ) : (
                <pre style={{ fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 400, lineHeight: 1.75, color: 'var(--color-text)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0, padding: 18, background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 12, letterSpacing: '-0.005em' }}>{generatedPrompt}</pre>
              )}
            </div>

            {/* Footer */}
            <div style={{ padding: '14px 24px', borderTop: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexShrink: 0, background: 'var(--color-bg)' }}>
              <div style={{ fontFamily: 'var(--font-sans)', fontSize: 11, color: 'var(--color-text-muted)', fontWeight: 500 }}>
                {generatedPrompt.length} chars · ~{Math.ceil(generatedPrompt.length / 4)} tokens
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => { setPromptError(null); promptModalTask && handleGeneratePrompt(promptModalTask) }}
                  disabled={generatingPrompt}
                  style={{ padding: '9px 16px', background: 'transparent', border: '1px solid var(--color-border)', borderRadius: 9, cursor: generatingPrompt ? 'wait' : 'pointer', fontFamily: 'var(--font-sans)', fontWeight: 600, fontSize: 13, color: 'var(--color-text)', display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.15s' }}
                >
                  <ArrowPathIcon style={{ width: 13, height: 13 }} />
                  Regenerate
                </button>
                <button
                  onClick={() => { navigator.clipboard.writeText(generatedPrompt); setPromptCopied(true); setTimeout(() => setPromptCopied(false), 2000) }}
                  disabled={!generatedPrompt}
                  style={{ padding: '9px 22px', background: promptCopied ? '#16a34a' : !generatedPrompt ? 'var(--color-border)' : 'linear-gradient(135deg, #8B5CF6 0%, #3B82F6 100%)', color: 'white', border: 'none', borderRadius: 9, cursor: generatedPrompt ? 'pointer' : 'not-allowed', fontFamily: 'var(--font-sans)', fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', gap: 7, transition: 'all 0.2s', boxShadow: promptCopied ? '0 4px 12px rgba(22,163,74,0.3)' : !generatedPrompt ? 'none' : '0 4px 12px rgba(139,92,246,0.3)' }}
                >
                  {promptCopied ? (
                    <><CheckIcon style={{ width: 14, height: 14 }} />Copied</>
                  ) : (
                    <><ClipboardDocumentIcon style={{ width: 14, height: 14 }} />Copy Prompt</>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Floating bubble — only when !chatOpen */}
      {!chatOpen && (
        <button
          onPointerDown={(e) => { e.preventDefault(); setChatOpen(true); setUnreadCount(0) }}
          title="Open AI chat"
          style={{ position: 'fixed', bottom: 24, right: 24, width: 52, height: 52, borderRadius: '50%', background: 'linear-gradient(135deg, #8B5CF6 0%, #3B82F6 100%)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 20px rgba(0,0,0,0.2)', zIndex: 101 }}
        >
          <SparklesIcon style={{ width: 22, height: 22, color: 'white' }} />
          {unreadCount > 0 && (
            <div style={{ position: 'absolute', top: -4, right: -4, width: 18, height: 18, borderRadius: '50%', background: '#dc2626', border: '2px solid var(--color-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700, color: 'white' }}>
              {unreadCount > 9 ? '9+' : unreadCount}
            </div>
          )}
        </button>
      )}

      {/* Delete project confirmation — shared destructive modal */}
      <ConfirmDeleteModal
        open={!!confirmDeleteId}
        title="Delete project?"
        confirmLabel="Delete project"
        onCancel={() => setConfirmDeleteId(null)}
        onConfirm={() => handleDeleteProject(confirmDeleteId)}
        description={
          <>
            <strong>{projects.find(p => p.id === confirmDeleteId)?.title || 'This project'}</strong>{' '}
            and all its tasks will be permanently removed. This cannot be undone.
          </>
        }
      />

      {/* Delete kanban column — same shared modal */}
      <ConfirmDeleteModal
        open={!!confirmDeleteColId}
        title="Delete column?"
        confirmLabel="Delete column"
        onCancel={() => setConfirmDeleteColId(null)}
        onConfirm={confirmDeleteColumn}
        description={
          <>
            <strong>{customCols.find(c => c.id === confirmDeleteColId)?.label || 'This column'}</strong>{' '}
            will be removed. Tasks inside it will be moved to the first remaining column.
          </>
        }
      />

      {/* Team People overlay — when opened FROM TeamCollab, we pass projectId
          so its invite form sends a PROJECT-level invite (not a workspace
          invite). The TeamPage UI itself is unchanged. */}
      {showTeamModal && (
        <TeamPage
          onClose={() => setShowTeamModal(false)}
          projectId={activeProjectId || activeProject?.id}
          projectName={projectTitle}
        />
      )}

      {/* Build Interface overlay */}
      {showBuildInterface && (
        <BuildInterface
          tasks={kanban?.tasks || []}
          projectName={projects.find(p => p.id === activeProjectId)?.name || activeProject?.name}
          onClose={() => setShowBuildInterface(false)}
        />
      )}

      {/* Phase 2 AI Builder — mode picker, then full-screen overlay */}
      <BuildModeModal
        open={aiBuildModeOpen}
        taskCount={(kanban?.tasks || []).filter(t => {
          const c = String(t.column || '').toLowerCase()
          return c === 'to do' || c === 'todo'
        }).length}
        onClose={() => setAiBuildModeOpen(false)}
        onConfirm={handleAiBuildModeConfirm}
      />
      {aiBuilderOpen && activeAiBuild && (
        <AIBuilder
          build={activeAiBuild}
          project={activeProject}
          onClose={() => setAiBuilderOpen(false)}
        />
      )}
    </div>
  )
}
