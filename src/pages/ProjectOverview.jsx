import { useState, useEffect, useContext } from 'react'
import AppContext from '../context/AppContext'
import { loadTasksFromDB, getProjectActivity } from '../lib/taskService'
import {
  ArrowRightIcon,
  Squares2X2Icon,
  ClipboardDocumentListIcon,
  ClockIcon,
  EllipsisHorizontalIcon,
  SparklesIcon,
  PencilSquareIcon,
} from '@heroicons/react/24/outline'

// Default kanban columns — mirrored from TeamCollab so the swimlane
// summary works for projects that haven't yet customised columns.
const DEFAULT_COLS = [
  { id: 'To Do', label: 'To Do', color: '#6B7280' },
  { id: 'In Progress', label: 'In Progress', color: '#3B82F6' },
  { id: 'Review', label: 'Review', color: '#F59E0B' },
  { id: 'Done', label: 'Done', color: '#16a34a' },
]

function useIsMobile() {
  const [m, setM] = useState(() => window.innerWidth < 720)
  useEffect(() => {
    const h = () => setM(window.innerWidth < 720)
    window.addEventListener('resize', h)
    return () => window.removeEventListener('resize', h)
  }, [])
  return m
}

// ─────────────────────────────────────────────────────────────────────
// Project Overview
//
// New unified project page. Currently rendered for projects created in
// TeamCollab (no brief). The user clicks a project in the sidebar →
// AppContext.openProject sends manually-created projects here instead
// of ProjectDocument.
//
// Tabs:
//   Overview (default) — progress, mini swimlane, recent activity, team
//   Board              — opens the full kanban (navigates to TeamCollab)
//   Activity           — full activity timeline
// ─────────────────────────────────────────────────────────────────────
export default function ProjectOverview() {
  const { activeProject, navigate, setActiveProject, authUser } = useContext(AppContext)
  const isMobile = useIsMobile()
  const [tab, setTab] = useState('overview')
  const [tasks, setTasks] = useState([])
  const [activity, setActivity] = useState([])
  const [loadingTasks, setLoadingTasks] = useState(true)
  const [loadingActivity, setLoadingActivity] = useState(true)

  const projectId = activeProject?.id
  const hasBrief = !!(activeProject?.data?.brief || activeProject?.brief_text)
  const isManuallyCreated = activeProject?.section === 'team' || !hasBrief

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

  // Column buckets, using DEFAULT_COLS as a stable summary. Tasks with a
  // column_name outside the defaults are dropped into "Other".
  const columns = DEFAULT_COLS
  const tasksByCol = columns.map(c => ({
    ...c,
    tasks: tasks.filter(t => (t.column || t.column_name) === c.id),
  }))
  const totalTasks = tasks.length
  const doneTasks = tasks.filter(t => (t.column || t.column_name) === 'Done').length
  const progressPct = totalTasks === 0 ? 0 : Math.round((doneTasks / totalTasks) * 100)

  function openBoard() {
    // Keep activeProject as-is and switch to TeamCollab.
    navigate('team')
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
      height: '100dvh', overflow: 'auto', background: 'var(--color-bg)',
      fontFamily: 'var(--font-sans)',
    }}>
      {/* ── Header ───────────────────────────────────────────────────── */}
      <div style={{
        padding: isMobile ? '20px 16px 0' : '32px 40px 0',
        maxWidth: 1100, margin: '0 auto', boxSizing: 'border-box',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 22, lineHeight: 1 }}>
                {isManuallyCreated ? '💻' : '🎨'}
              </span>
              <h1 style={{
                margin: 0, fontWeight: 800, fontSize: isMobile ? 22 : 26,
                letterSpacing: '-0.03em', color: 'var(--color-text)',
                overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
                {activeProject.title || 'Untitled Project'}
              </h1>
              <OriginTag manual={isManuallyCreated} />
            </div>
            <div style={{
              marginTop: 6, fontSize: 12, color: 'var(--color-text-muted)',
              display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap',
            }}>
              <span>Last updated {timeAgo(activeProject.ts || Date.now())}</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button onClick={openBoard} style={primaryBtn()}>
              <Squares2X2Icon style={{ width: 14, height: 14 }} />
              Open Board
            </button>
            <button title="More" style={iconBtn()}>
              <EllipsisHorizontalIcon style={{ width: 16, height: 16 }} />
            </button>
          </div>
        </div>

        {/* ── Tabs ─────────────────────────────────────────────────── */}
        <div style={{
          marginTop: 22,
          borderBottom: '1px solid var(--color-border)',
          display: 'flex', gap: 4,
          overflowX: 'auto',
        }}>
          <TabBtn label="Overview" active={tab === 'overview'} onClick={() => setTab('overview')} icon={ClipboardDocumentListIcon} />
          <TabBtn label="Board" active={tab === 'board'} onClick={openBoard} icon={Squares2X2Icon} />
          <TabBtn label="Activity" active={tab === 'activity'} onClick={() => setTab('activity')} icon={ClockIcon} />
        </div>
      </div>

      {/* ── Body ──────────────────────────────────────────────────── */}
      <div style={{
        padding: isMobile ? '20px 16px 40px' : '24px 40px 56px',
        maxWidth: 1100, margin: '0 auto', boxSizing: 'border-box',
      }}>
        {tab === 'overview' && (
          <OverviewTab
            totalTasks={totalTasks}
            doneTasks={doneTasks}
            progressPct={progressPct}
            tasksByCol={tasksByCol}
            activity={activity.slice(0, 5)}
            loading={loadingTasks}
            onOpenBoard={openBoard}
            isManuallyCreated={isManuallyCreated}
            isMobile={isMobile}
          />
        )}
        {tab === 'activity' && (
          <ActivityTab activity={activity} loading={loadingActivity} />
        )}
      </div>
    </div>
  )
}

// ── Tab button ────────────────────────────────────────────────────────
function TabBtn({ label, active, onClick, icon: Icon }) {
  return (
    <button onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 6,
      padding: '10px 14px', background: 'transparent', border: 'none',
      borderBottom: '2px solid ' + (active ? 'var(--color-accent)' : 'transparent'),
      cursor: 'pointer', fontFamily: 'var(--font-sans)', fontSize: 13,
      fontWeight: active ? 700 : 500,
      color: active ? 'var(--color-text)' : 'var(--color-text-muted)',
      transition: 'all 0.15s', flexShrink: 0,
    }}>
      <Icon style={{ width: 14, height: 14 }} />
      {label}
    </button>
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

// ── Overview tab ──────────────────────────────────────────────────────
function OverviewTab({
  totalTasks, doneTasks, progressPct, tasksByCol, activity,
  loading, onOpenBoard, isManuallyCreated, isMobile,
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Progress card */}
      <SectionCard
        title="Task progress"
        action={<button onClick={onOpenBoard} style={ghostBtn()}>Open board <ArrowRightIcon style={{ width: 12, height: 12 }} /></button>}
      >
        {loading ? (
          <SkeletonRow />
        ) : totalTasks === 0 ? (
          <EmptyTasks onAdd={onOpenBoard} />
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
      </SectionCard>

      {/* Recent activity */}
      <SectionCard title="Recent activity">
        {loading ? (
          <SkeletonRow />
        ) : activity.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
            No activity yet. Edits, moves, and comments will appear here.
          </div>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {activity.map(a => (
              <ActivityRow key={a.id} entry={a} />
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  )
}

// ── Activity tab ──────────────────────────────────────────────────────
function ActivityTab({ activity, loading }) {
  return (
    <SectionCard title="Project activity">
      {loading ? (
        <SkeletonRow />
      ) : activity.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
          No activity yet.
        </div>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {activity.map(a => (
            <ActivityRow key={a.id} entry={a} verbose />
          ))}
        </ul>
      )}
    </SectionCard>
  )
}

// ── Activity row ──────────────────────────────────────────────────────
function ActivityRow({ entry, verbose = false }) {
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
          {verbose && (oldVal || newVal) && (
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

// ── SectionCard ───────────────────────────────────────────────────────
function SectionCard({ title, action, children }) {
  return (
    <section style={{
      background: 'var(--color-card)',
      border: '1px solid var(--color-border)',
      borderRadius: 14, padding: 18,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 12, gap: 10,
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
function primaryBtn() {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '8px 14px', background: 'linear-gradient(135deg, #7C3AED, #A855F7)',
    color: 'white', border: 'none', borderRadius: 9,
    cursor: 'pointer', fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 700,
    boxShadow: '0 2px 8px rgba(124,58,237,0.25)',
  }
}
function ghostBtn() {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 4,
    padding: '5px 9px', background: 'transparent',
    border: '1px solid var(--color-border)', borderRadius: 7,
    cursor: 'pointer', fontFamily: 'var(--font-sans)', fontSize: 12, fontWeight: 600,
    color: 'var(--color-text-muted)',
  }
}
function iconBtn() {
  return {
    width: 32, height: 32, borderRadius: 8,
    background: 'transparent', border: '1px solid var(--color-border)',
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
