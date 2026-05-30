import { useEffect, useState } from 'react'
import { XMarkIcon, HandRaisedIcon, BoltIcon, SparklesIcon, ArrowRightIcon } from '@heroicons/react/24/outline'

// ────────────────────────────────────────────────────────────────────
// BuildModeModal — first step of the AI Builder. User picks how they
// want to review the build:
//   - task_by_task: AI builds one section, user approves, AI builds the
//     next. Slower but full control.
//   - build_all: AI builds every section first, user reviews the whole
//     site at the end. Faster.
//
// Confirms with the task count + a rough estimate (~40s per section),
// then calls onConfirm(mode).
// ────────────────────────────────────────────────────────────────────

export default function BuildModeModal({ open, onClose, taskCount, onConfirm }) {
  const [mode, setMode] = useState('task_by_task')

  useEffect(() => {
    if (!open) return
    function onKey(e) { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  useEffect(() => { if (!open) setMode('task_by_task') }, [open])

  if (!open) return null

  const estMinutes = Math.max(1, Math.ceil((taskCount || 1) * 0.7))

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1100,
        background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 560,
          maxHeight: '90vh', overflowY: 'auto',
          background: 'var(--color-bg)',
          border: '1px solid var(--color-border)',
          borderRadius: 18,
          fontFamily: 'var(--font-sans)',
          boxShadow: '0 24px 64px rgba(0,0,0,0.35)',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '18px 22px 14px', borderBottom: '1px solid var(--color-border)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <SparklesIcon style={{ width: 17, height: 17, color: '#8B5CF6' }} />
            <span style={{ fontWeight: 800, fontSize: 15, color: 'var(--color-text)', letterSpacing: '-0.01em' }}>
              Start AI Build
            </span>
          </div>
          <button onClick={onClose} style={iconBtn}>
            <XMarkIcon style={{ width: 16, height: 16 }} />
          </button>
        </div>

        <div style={{ padding: '20px 22px 8px' }}>
          <h3 style={{
            margin: 0, fontSize: 16, fontWeight: 700,
            color: 'var(--color-text)', letterSpacing: '-0.01em',
          }}>
            How would you like to review the build?
          </h3>
          <p style={{
            margin: '4px 0 16px',
            fontSize: 13, color: 'var(--color-text-muted)', lineHeight: 1.55,
          }}>
            Pick the cadence that fits your workflow. You can change your mind by closing and reopening the builder.
          </p>

          <ModeCard
            selected={mode === 'task_by_task'}
            onClick={() => setMode('task_by_task')}
            icon={HandRaisedIcon}
            title="Task by Task"
            description="AI builds one section at a time. You review and approve each section before the next one starts."
            best="Detailed control over every section"
          />

          <div style={{ height: 10 }} />

          <ModeCard
            selected={mode === 'build_all'}
            onClick={() => setMode('build_all')}
            icon={BoltIcon}
            title="Build All & Review"
            description="AI builds every section first, then you review all sections at once at the end."
            best="Faster builds with fewer interruptions"
          />

          <div style={{
            marginTop: 16, padding: '12px 14px',
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 10,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
            flexWrap: 'wrap',
          }}>
            <div style={{ fontSize: 12.5, color: 'var(--color-text-muted)' }}>
              <strong style={{ color: 'var(--color-text)', fontWeight: 700 }}>Tasks to build:</strong> {taskCount} {taskCount === 1 ? 'task' : 'tasks'}
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--color-text-muted)' }}>
              <strong style={{ color: 'var(--color-text)', fontWeight: 700 }}>Estimated time:</strong> ~{estMinutes} {estMinutes === 1 ? 'minute' : 'minutes'}
            </div>
          </div>
        </div>

        <div style={{
          display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap',
          padding: '14px 22px 20px',
        }}>
          <button onClick={onClose} style={secondaryBtn}>Cancel</button>
          <button
            onClick={() => onConfirm?.(mode)}
            disabled={!mode || !taskCount}
            style={{
              padding: '10px 18px',
              background: (!mode || !taskCount)
                ? 'var(--color-border)'
                : 'linear-gradient(135deg, #8B5CF6, #6366F1)',
              color: 'white', border: 'none', borderRadius: 10,
              cursor: (!mode || !taskCount) ? 'not-allowed' : 'pointer',
              fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 700,
              display: 'inline-flex', alignItems: 'center', gap: 6,
              boxShadow: (!mode || !taskCount) ? 'none' : '0 6px 18px rgba(124,58,237,0.30)',
            }}
          >
            Start Building <ArrowRightIcon style={{ width: 12, height: 12 }} />
          </button>
        </div>
      </div>
    </div>
  )
}

function ModeCard({ selected, onClick, icon: Icon, title, description, best }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: '100%',
        textAlign: 'left',
        padding: '14px 16px',
        background: selected ? 'rgba(139,92,246,0.08)' : 'var(--color-surface)',
        border: '2px solid ' + (selected ? '#8B5CF6' : 'var(--color-border)'),
        borderRadius: 12,
        cursor: 'pointer',
        fontFamily: 'var(--font-sans)',
        transition: 'background 0.15s, border-color 0.15s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
        <span style={{
          width: 30, height: 30, borderRadius: 9,
          background: selected ? 'linear-gradient(135deg, #8B5CF6, #6366F1)' : 'var(--color-bg)',
          border: selected ? 'none' : '1px solid var(--color-border)',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          <Icon style={{ width: 15, height: 15, color: selected ? 'white' : 'var(--color-text-muted)' }} />
        </span>
        <span style={{ fontWeight: 800, fontSize: 14, color: 'var(--color-text)', letterSpacing: '-0.01em' }}>
          {title}
        </span>
      </div>
      <div style={{
        fontSize: 12.5, color: 'var(--color-text-muted)',
        lineHeight: 1.5, marginBottom: 6,
      }}>
        {description}
      </div>
      <div style={{
        fontSize: 11, fontFamily: 'var(--font-mono)',
        letterSpacing: '0.04em', textTransform: 'uppercase', fontWeight: 700,
        color: selected ? '#7C3AED' : 'var(--color-text-muted)',
      }}>
        Best for: <span style={{ textTransform: 'none', letterSpacing: 0, fontFamily: 'var(--font-sans)', fontWeight: 600 }}>{best}</span>
      </div>
    </button>
  )
}

const iconBtn = {
  width: 28, height: 28, borderRadius: 7, background: 'transparent',
  border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
}

const secondaryBtn = {
  padding: '10px 16px',
  background: 'transparent', color: 'var(--color-text)',
  border: '1px solid var(--color-border)', borderRadius: 10,
  cursor: 'pointer',
  fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 600,
}
