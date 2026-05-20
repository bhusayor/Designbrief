import { useEffect } from 'react'
import { XMarkIcon, TrashIcon } from '@heroicons/react/24/outline'

// Shared destructive-confirmation modal. Single style across the app so the
// user gets the same "Are you sure?" UX everywhere (Delete task, Delete
// column, Delete project, Remove member, Uninstall connector, …).
//
// Props:
//   open          – render the modal when true
//   title         – heading, e.g. "Delete project?"
//   description   – React node shown under the heading. Use <strong> for the
//                   thing being deleted so it stands out.
//   confirmLabel  – button label. Defaults to "Delete".
//   cancelLabel   – defaults to "Cancel".
//   busy          – disables buttons + shows pending label while the action
//                   is in flight.
//   onCancel      – fires on Esc, backdrop click, X, or Cancel.
//   onConfirm     – fires on the destructive button. Async-safe (parent
//                   controls `busy` while it awaits).
export default function ConfirmDeleteModal({
  open,
  title = 'Are you sure?',
  description,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  busy = false,
  onCancel,
  onConfirm,
}) {
  useEffect(() => {
    if (!open) return
    function onKey(e) { if (e.key === 'Escape' && !busy) onCancel?.() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, busy, onCancel])

  if (!open) return null

  return (
    <div
      onClick={() => { if (!busy) onCancel?.() }}
      style={{
        position: 'fixed', inset: 0, zIndex: 900,
        background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--color-bg)', border: '1px solid var(--color-border)',
          borderRadius: 16, width: '100%', maxWidth: 420,
          fontFamily: 'var(--font-sans)', overflow: 'hidden',
          boxShadow: '0 24px 64px rgba(0,0,0,0.3)',
        }}
      >
        <div style={{
          padding: '18px 22px 14px', borderBottom: '1px solid var(--color-border)',
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <div style={{
              width: 26, height: 26, borderRadius: 7,
              background: 'rgba(220,38,38,0.10)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              <TrashIcon style={{ width: 14, height: 14, color: '#DC2626' }} />
            </div>
            <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--color-text)' }}>
              {title}
            </div>
          </div>
          <button onClick={() => onCancel?.()} disabled={busy} style={{
            width: 28, height: 28, borderRadius: 8, background: 'transparent', border: 'none',
            cursor: busy ? 'not-allowed' : 'pointer', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            color: 'var(--color-text-muted)', flexShrink: 0,
          }}>
            <XMarkIcon style={{ width: 15, height: 15 }} />
          </button>
        </div>

        <div style={{ padding: '16px 22px 20px' }}>
          {description && (
            <div style={{
              fontFamily: 'var(--font-sans)', fontSize: 13,
              color: 'var(--color-text)', lineHeight: 1.55,
            }}>
              {description}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
            <button onClick={() => onCancel?.()} disabled={busy} style={{
              padding: '9px 18px', background: 'transparent',
              border: '1px solid var(--color-border)', borderRadius: 9,
              cursor: busy ? 'not-allowed' : 'pointer', fontFamily: 'var(--font-sans)',
              fontSize: 13, fontWeight: 600, color: 'var(--color-text-muted)',
            }}>
              {cancelLabel}
            </button>
            <button onClick={() => onConfirm?.()} disabled={busy} style={{
              padding: '9px 20px',
              background: busy ? 'var(--color-border)' : '#DC2626',
              color: 'white', border: 'none', borderRadius: 9,
              cursor: busy ? 'not-allowed' : 'pointer',
              fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 700,
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <TrashIcon style={{ width: 13, height: 13 }} />
              {busy ? `${confirmLabel.replace(/[!?]$/, '')}…` : confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
