import { useState, useEffect, useContext, useRef } from 'react'
import AppContext from '../context/AppContext'
import { loadTasksFromDB, getProjectActivity } from '../lib/taskService'
import ConfirmDeleteModal from '../components/ConfirmDeleteModal'
import {
  ArrowLeftIcon,
  Squares2X2Icon,
  EllipsisHorizontalIcon,
  SparklesIcon,
  PencilSquareIcon,
  TrashIcon,
} from '@heroicons/react/24/outline'

// Default kanban columns — mirrored from TeamCollab so the swimlane
// summary works for projects that haven't yet customised columns.
const DEFAULT_COLS = [
  { id: 'To Do', label: 'To Do', color: '#6B7280' },
  { id: 'In Progress', label: 'In Progress', color: '#3B82F6' },
  { id: 'Review', label: 'Review', color: '#F59E0B' },
  { id: 'Done', label: 'Done', color: '#16a34a' },
]

function useViewport() {
  const [w, setW] = useState(() => window.innerWidth)
  useEffect(() => {
    const h = () => setW(window.innerWidth)
    window.addEventListener('resize', h)
    return () => window.removeEventListener('resize', h)
  }, [])
  return { isMobile: w < 720, isTablet: w >= 720 && w < 1024 }
}

// ─────────────────────────────────────────────────────────────────────
// Project Overview
//
// Single-page "big file" view of a manually-created TeamCollab project.
// No tabs — every section is stacked on one page, full-width, with a
// back arrow at the top-left. The ⋯ icon opens a small dropdown menu
// that exposes Delete (routed through the shared ConfirmDeleteModal).
// ─────────────────────────────────────────────────────────────────────
export default function ProjectOverview() {
  const { activeProject, navigate, deleteProject } = useContext(AppContext)
  const { isMobile, isTablet } = useViewport()

  const [tasks, setTasks] = useState([])
  const [activity, setActivity] = useState([])
  const [loadingTasks, setLoadingTasks] = useState(true)
  const [loadingActivity, setLoadingActivity] = useState(true)

  const [menuOpen, setMenuOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const menuRef = useRef(null)

  const projectId = activeProject?.id
  const hasBrief = !!(activeProject?.data?.brief || activeProject?.brief_text)
  const isManuallyCreated = activeProject?.section === 'team' || !hasBrief

  // Load tasks
  useEffect(() => {
    if (!projectId || projectId === 'default') {
      setTasks([])
      setLoadingTasks(false)
      return
    }
    setLoadingTasks(true)
    loadTasksFromDB(projectId)
      .then(t => setTasks(t || []))
      .catch(() => setTasks([]))
      .finally(() => setLoadingTasks(false))
  }, [projectId])

  // Load activity
  useEffect(() => {
    if (!projectId || projectId === 'default') {
      setActivity([])
      setLoadingActivity(false)
      return
    }
    setLoadingActivity(true)
    getProjectActivity(projectId, 50)
      .then(a => setActivity(a || []))
      .catch(() => setActivity([]))
      .finally(() => setLoadingActivity(false))
  }, [projectId])

  // Close the ⋯ dropdown when clicking outside
  useEffect(() => {
    if (!menuOpen) return
    function handler(e) {
      if (!menuRef.current?.contains(e.target)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuOpen])

  const columns = DEFAULT_COLS
  const tasksByCol = columns.map(c => ({
    ...c,
    tasks: tasks.filter(t => (t.column || t.column_name) === c.id),
  }))
  const totalTasks = tasks.length
  const doneTasks = tasks.filter(t => (t.column || t.column_name) === 'Done').length
  const progressPct = totalTasks === 0 ? 0 : Math.round((doneTasks / totalTasks) * 100)

  function openBoard() {
    navigate('team')
  }

  async function handleDelete() {
    if (!projectId) { setConfirmDelete(false); return }
    setDeleting(true)
    try {
      await deleteProject?.(projectId)
      setConfirmDelete(false)
      navigate('dashboard')
    } catch (e) {
      console.error('[ProjectOverview delete]', e)
    } finally {
      setDeleting(false)
    }
  }

  if (!activeProject) {
    return (
      <div style={{ padding: 40, fontFamily: 'var(--font-sans)', color: 'var(--color-text-muted)' }}>
        No project selected.
      </div>
    )
  }

  return (
    <div style={{
      minHeight: '100dvh', width: '100%',
      background: 'var(--color-bg)',
      fontFamily: 'var(--font-sans)',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* ── Top bar with Back button ────────────────────────────── */}
      <div style={{
        padding: isMobile ? '14px 16px' : '18px 32px',
        borderBottom: '1px solid var(--color-border)',
        display: 'flex', alignItems: 'center', gap: 10,
        background: 'var(--color-bg)',
      }}>
        <button
          onClick={() => navigate('dashboard')}
          style={backBtn()}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-surface)'; e.currentTarget.style.color = 'var(--color-text)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--color-text-muted)' }}
        >
          <ArrowLeftIcon style={{ width: 14, height: 14 }} />
          Back
        </button>
      </div>

      {/* ── Body — true full-width, no horizontal padding ──────── */}
      <div style={{
        flex: 1, width: '100%',
        padding: isMobile ? '20px 0 40px' : '32px 0 56px',
        boxSizing: 'border-box',
        display: 'flex', flexDirection: 'column', gap: 28,
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
          gap: 16, flexWrap: 'wrap',
          paddingLeft: isMobile ? 16 : 28,
          paddingRight: isMobile ? 16 : 28,
          paddingBottom: 18, borderBottom: '1px solid var(--color-border)',
        }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <h1 style={{
                margin: 0, fontWeight: 800,
                fontSize: isMobile ? 22 : isTablet ? 26 : 30,
                letterSpacing: '-0.03em', color: 'var(--color-text)',
                overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
                {activeProject.title || 'Untitled Project'}
              </h1>
              <OriginTag manual={isManuallyCreated} />
            </div>
            <div style={{
              marginTop: 8, fontSize: 12, color: 'var(--color-text-muted)',
              display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap',
            }}>
              <span>Last updated {timeAgo(activeProject.ts || Date.now())}</span>
            </div>
          </div>

          {/* ⋯ dropdown — Delete + future actions */}
          <div ref={menuRef} style={{ position: 'relative' }}>
            <button
              title="More"
              onClick={() => setMenuOpen(o => !o)}
              style={iconBtn(menuOpen)}
            >
              <EllipsisHorizontalIcon style={{ width: 16, height: 16 }} />
            </button>
            {menuOpen && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 6px)', right: 0,
                background: 'var(--color-bg)', border: '1px solid var(--color-border)',
                borderRadius: 10, minWidth: 180, zIndex: 20,
                boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
                padding: 4,
              }}>
                <button
                  onClick={() => { setMenuOpen(false); setConfirmDelete(true) }}
                  style={{
                    width: '100%', textAlign: 'left',
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '9px 10px', background: 'transparent', border: 'none',
                    cursor: 'pointer', borderRadius: 7,
                    fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 600,
                    color: '#DC2626',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(220,38,38,0.08)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                >
                  <TrashIcon style={{ width: 13, height: 13 }} />
                  Delete project
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Task progress */}
        <Section title="Task progress" isMobile={isMobile} action={
          <button onClick={openBoard} style={primaryBtn()}>
            <Squares2X2Icon style={{ width: 14, height: 14 }} />
            Open board
          </button>
        }>
            {loadingTasks ? (
              <SkeletonRow />
            ) : totalTasks === 0 ? (
              <EmptyTasks onAdd={openBoard} />
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 10 }}>
                  <span style={{ fontFamily: 'var(--font-sans)', fontWeight: 700, fontSize: 22, color: 'var(--color-text)' }}>
                    {doneTasks} <span style={{ fontWeight: 500, color: 'var(--color-text-muted)', fontSize: 14 }}>of {totalTasks} tasks done</span>
                  </span>
                  <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--color-text-muted)' }}>
                    {progressPct}%
                  </span>
                </div>
                <div style={{
                  width: '100%', height: 8, borderRadius: 999,
                  background: 'var(--color-surface)',
                  border: '1px solid var(--color-border)',
                  overflow: 'hidden',
                }}>
                  <div style={{
                    width: `${progressPct}%`, height: '100%',
                    background: 'linear-gradient(90deg, #7C3AED, #16a34a)',
                    transition: 'width 0.25s ease',
                  }} />
                </div>

                {/* Mini swimlane summary */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)',
                  gap: 12, marginTop: 18,
                }}>
                  {tasksByCol.map(col => (
                    <div key={col.id} style={{
                      background: 'var(--color-surface)',
                      border: '1px solid var(--color-border)',
                      borderRadius: 10, padding: '10px 12px',
                    }}>
                      <div style={{
                        fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700,
                        letterSpacing: '0.06em', textTransform: 'uppercase',
                        color: 'var(--color-text-muted)', marginBottom: 4,
                        display: 'flex', alignItems: 'center', gap: 6,
                      }}>
                        <span style={{
                          width: 6, height: 6, borderRadius: '50%', background: col.color, display: 'inline-block',
                        }} />
                        {col.label}
                      </div>
                      <div style={{ fontFamily: 'var(--font-sans)', fontWeight: 700, fontSize: 18, color: 'var(--color-text)' }}>
                        {col.tasks.length}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </Section>

        {/* Recent activity */}
        <Section title="Recent activity" isMobile={isMobile}>
          {loadingActivity ? (
            <SkeletonRow />
          ) : activity.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
              No activity yet. Edits, moves, and comments will appear here.
            </div>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {activity.slice(0, 10).map(a => (
                <ActivityRow key={a.id} entry={a} />
              ))}
            </ul>
          )}
        </Section>
      </div>

      {/* Delete confirmation — shared destructive modal */}
      <ConfirmDeleteModal
        open={confirmDelete}
        title="Delete project?"
        confirmLabel="Delete project"
        busy={deleting}
        onCancel={() => { if (!deleting) setConfirmDelete(false) }}
        onConfirm={handleDelete}
        description={
          <>
            <strong>{activeProject.title || 'This project'}</strong> and all its
            tasks, comments, and activity will be permanently removed. This cannot
            be undone.
          </>
        }
      />
    </div>
  )
}

// ── Origin tag ────────────────────────────────────────────────────────
function OriginTag({ manual }) {
  return (
    <span style={{
      fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700,
      letterSpacing: '0.06em', textTransform: 'uppercase',
      background: manual ? 'rgba(124,58,237,0.10)' : 'rgba(14,165,233,0.10)',
      color: manual ? '#7C3AED' : '#0369A1',
      border: '1px solid ' + (manual ? 'rgba(124,58,237,0.30)' : 'rgba(14,165,233,0.25)'),
      borderRadius: 100, padding: '2px 9px',
      display: 'inline-flex', alignItems: 'center', gap: 4,
    }}>
      {manual ? <PencilSquareIcon style={{ width: 10, height: 10 }} /> : <SparklesIcon style={{ width: 10, height: 10 }} />}
      {manual ? 'Team Collab' : 'Translated brief'}
    </span>
  )
}

// ── Section ───────────────────────────────────────────────────────────
function Section({ title, action, children, isMobile }) {
  return (
    <section style={{
      paddingLeft: isMobile ? 16 : 28,
      paddingRight: isMobile ? 16 : 28,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 12, gap: 10, flexWrap: 'wrap',
      }}>
        <div style={{
          fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700,
          letterSpacing: '0.08em', textTransform: 'uppercase',
          color: 'var(--color-text-muted)',
        }}>{title}</div>
        {action}
      </div>
      {children}
    </section>
  )
}

// ── ActivityRow ───────────────────────────────────────────────────────
function ActivityRow({ entry }) {
  const action = entry.action || ''
  const oldVal = entry.old_value || ''
  const newVal = entry.new_value || ''
  return (
    <li style={{
      display: 'flex', alignItems: 'flex-start', gap: 10,
      padding: '8px 10px', background: 'var(--color-surface)',
      border: '1px solid var(--color-border)', borderRadius: 9,
    }}>
      <div style={{
        flexShrink: 0, width: 6, height: 6, marginTop: 7,
        borderRadius: '50%', background: 'var(--color-accent)',
      }} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--color-text)' }}>
          <strong style={{ fontWeight: 600 }}>{entry.actor_name || 'Someone'}</strong>{' '}
          <span style={{ color: 'var(--color-text-muted)' }}>{action}</span>
          {(oldVal || newVal) && (
            <span style={{ color: 'var(--color-text-muted)' }}>
              {oldVal && <> from <strong style={{ color: 'var(--color-text)', fontWeight: 600 }}>{oldVal}</strong></>}
              {newVal && <> to <strong style={{ color: 'var(--color-text)', fontWeight: 600 }}>{newVal}</strong></>}
            </span>
          )}
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-text-muted)', marginTop: 2 }}>
          {timeAgo(entry.created_at)}
        </div>
      </div>
    </li>
  )
}

function SkeletonRow() {
  return (
    <div style={{ height: 36, borderRadius: 8, background: 'var(--color-surface)', opacity: 0.6 }} />
  )
}

function EmptyTasks({ onAdd }) {
  return (
    <div style={{
      padding: 22, textAlign: 'center',
      background: 'var(--color-surface)',
      border: '1px dashed var(--color-border)',
      borderRadius: 10,
    }}>
      <div style={{ fontFamily: 'var(--font-sans)', fontSize: 14, color: 'var(--color-text)', fontWeight: 600 }}>
        No tasks yet
      </div>
      <div style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--color-text-muted)', margin: '4px 0 14px' }}>
        Open the board to start adding tasks.
      </div>
      <button onClick={onAdd} style={primaryBtn()}>
        <Squares2X2Icon style={{ width: 14, height: 14 }} />
        Open board
      </button>
    </div>
  )
}

// ── Style helpers ─────────────────────────────────────────────────────
function backBtn() {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '7px 12px', background: 'transparent',
    border: '1px solid var(--color-border)', borderRadius: 8,
    cursor: 'pointer', fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 600,
    color: 'var(--color-text-muted)', transition: 'all 0.15s',
  }
}
function primaryBtn() {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '8px 14px', background: 'linear-gradient(135deg, #7C3AED, #A855F7)',
    color: 'white', border: 'none', borderRadius: 9,
    cursor: 'pointer', fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 700,
    boxShadow: '0 2px 8px rgba(124,58,237,0.25)',
  }
}
function iconBtn(active) {
  return {
    width: 32, height: 32, borderRadius: 8,
    background: active ? 'var(--color-surface)' : 'transparent',
    border: '1px solid var(--color-border)',
    cursor: 'pointer', color: 'var(--color-text-muted)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  }
}

// ── timeAgo ───────────────────────────────────────────────────────────
function timeAgo(input) {
  if (!input) return '—'
  const t = typeof input === 'string' ? new Date(input).getTime() : input
  if (Number.isNaN(t)) return '—'
  const diff = Date.now() - t
  const s = Math.floor(diff / 1000)
  if (s < 60) return 'just now'
  const m = Math.floor(s / 60)
  if (m < 60) return m + 'm ago'
  const h = Math.floor(m / 60)
  if (h < 24) return h + 'h ago'
  const d = Math.floor(h / 24)
  if (d < 30) return d + 'd ago'
  const mo = Math.floor(d / 30)
  if (mo < 12) return mo + 'mo ago'
  return Math.floor(mo / 12) + 'y ago'
}
