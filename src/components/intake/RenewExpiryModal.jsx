// ────────────────────────────────────────────────────────────────────
// RenewExpiryModal, designer-facing dialog for extending a form's
// share-link lifetime. Replaces the previous window.prompt() that
// fired from the Project Library's Renew expiry action.
//
// UX:
//   - Title + a one-line context sentence with the business name +
//     the old expiry date so the designer always sees what they're
//     renewing.
//   - Preset pills: 7 / 14 / 30 (default) / 60 / 90 days. One click
//     to pick.
//   - Custom field for anything else (1-365 days).
//   - Live preview of the new expiry date below the choice so the
//     designer can confirm it matches their expectation before
//     submitting.
//   - Cancel + Renew buttons in the footer. Renew shows a busy
//     state while the supabase update is in flight.
//
// Props:
//   open      , render when true
//   form      , { settings?.recipient?.business_name, expires_at, ... }
//   busy      , disables inputs + flips Renew label to "Renewing…"
//   onCancel  , fires on Esc, backdrop click, X, or Cancel
//   onRenew   , fires on Renew with the number of days picked
// ────────────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react'
import { XMarkIcon, ArrowPathIcon } from '@heroicons/react/24/outline'

const PRESETS = [7, 14, 30, 60, 90]
const DEFAULT_DAYS = 30

export default function RenewExpiryModal({ open, form, busy = false, onCancel, onRenew }) {
  const [days, setDays] = useState(DEFAULT_DAYS)
  const [customMode, setCustomMode] = useState(false)
  const [customStr, setCustomStr] = useState('')
  const [error, setError] = useState('')

  // Reset state every time the modal opens fresh.
  useEffect(() => {
    if (open) {
      setDays(DEFAULT_DAYS)
      setCustomMode(false)
      setCustomStr('')
      setError('')
    }
  }, [open])

  // Esc-to-close.
  useEffect(() => {
    if (!open) return
    function onKey(e) { if (e.key === 'Escape' && !busy) onCancel?.() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, busy, onCancel])

  if (!open) return null

  const business = String(form?.settings?.recipient?.business_name || form?.project_name || '').trim()
  const oldExpiry = form?.expires_at
    ? new Date(form.expires_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
    : null

  const effectiveDays = customMode ? Number(customStr) : days
  const newExpiry = Number.isFinite(effectiveDays) && effectiveDays > 0
    ? new Date(Date.now() + effectiveDays * 86400000)
    : null

  function pickPreset(n) {
    setCustomMode(false)
    setDays(n)
    setError('')
  }

  function handleRenew() {
    let n
    if (customMode) {
      n = parseInt(customStr, 10)
      if (!Number.isFinite(n) || n < 1 || n > 365) {
        setError('Enter a number between 1 and 365.')
        return
      }
    } else {
      n = days
    }
    onRenew?.(n)
  }

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
          background: 'var(--color-bg)',
          border: '1px solid var(--color-border)',
          borderRadius: 16,
          width: '100%',
          maxWidth: 480,
          fontFamily: 'var(--font-sans)',
          overflow: 'hidden',
          boxShadow: '0 24px 64px rgba(0,0,0,0.3)',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '18px 22px 14px',
          borderBottom: '1px solid var(--color-border)',
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <div style={{
              width: 30, height: 30, borderRadius: 8,
              background: 'rgba(124,58,237,0.10)',
              border: '1px solid rgba(124,58,237,0.25)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              <ArrowPathIcon style={{ width: 15, height: 15, color: 'var(--color-accent)' }} />
            </div>
            <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--color-text)' }}>
              Renew share link
            </div>
          </div>
          <button onClick={() => onCancel?.()} disabled={busy} style={{
            width: 28, height: 28, borderRadius: 8, background: 'transparent', border: 'none',
            cursor: busy ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--color-text-muted)', flexShrink: 0,
          }}>
            <XMarkIcon style={{ width: 15, height: 15 }} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '16px 22px 18px' }}>
          {/* Context line */}
          <p style={{
            margin: '0 0 18px',
            fontSize: 13,
            lineHeight: 1.55,
            color: 'var(--color-text-soft)',
          }}>
            {business
              ? <>The intake link for <strong style={{ color: 'var(--color-text)' }}>{business}</strong>{oldExpiry ? <> expired on <strong style={{ color: 'var(--color-text)' }}>{oldExpiry}</strong></> : ' has expired'}. Pick a new lifetime below.</>
              : <>This intake link has expired. Pick a new lifetime below.</>}
          </p>

          {/* Preset pills */}
          <div style={{
            display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap',
          }}>
            {PRESETS.map(n => {
              const active = !customMode && days === n
              return (
                <button
                  key={n}
                  type="button"
                  onClick={() => pickPreset(n)}
                  disabled={busy}
                  style={{
                    padding: '7px 14px',
                    borderRadius: 100,
                    border: '1.5px solid ' + (active ? 'var(--color-accent)' : 'var(--color-border)'),
                    background: active ? 'rgba(124,58,237,0.10)' : 'var(--color-surface)',
                    color: active ? 'var(--color-accent)' : 'var(--color-text)',
                    fontFamily: 'inherit',
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: busy ? 'not-allowed' : 'pointer',
                    transition: 'background 0.15s, border-color 0.15s',
                  }}
                >
                  {n} days
                </button>
              )
            })}
            <button
              type="button"
              onClick={() => { setCustomMode(true); setError(''); }}
              disabled={busy}
              style={{
                padding: '7px 14px',
                borderRadius: 100,
                border: '1.5px solid ' + (customMode ? 'var(--color-accent)' : 'var(--color-border)'),
                background: customMode ? 'rgba(124,58,237,0.10)' : 'var(--color-surface)',
                color: customMode ? 'var(--color-accent)' : 'var(--color-text)',
                fontFamily: 'inherit',
                fontSize: 13,
                fontWeight: 700,
                cursor: busy ? 'not-allowed' : 'pointer',
              }}
            >
              Custom
            </button>
          </div>

          {/* Custom number input, animates in when Custom is picked */}
          {customMode && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <input
                type="number"
                min="1"
                max="365"
                value={customStr}
                onChange={(e) => { setCustomStr(e.target.value); setError(''); }}
                placeholder="e.g. 45"
                autoFocus
                disabled={busy}
                style={{
                  width: 110,
                  padding: '8px 12px',
                  background: 'var(--color-surface)',
                  border: '1.5px solid var(--color-border)',
                  borderRadius: 9,
                  outline: 'none',
                  fontFamily: 'inherit',
                  fontSize: 14,
                  color: 'var(--color-text)',
                }}
              />
              <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
                days (1-365)
              </span>
            </div>
          )}

          {error && (
            <p style={{
              margin: '4px 0 10px',
              fontSize: 12, color: '#dc2626',
            }}>
              {error}
            </p>
          )}

          {/* New expiry preview */}
          {newExpiry && (
            <div style={{
              padding: '11px 14px',
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 10,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              gap: 12,
              marginTop: 6,
            }}>
              <span style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 10, fontWeight: 700, letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: 'var(--color-text-muted)',
              }}>
                New expiry
              </span>
              <span style={{
                fontSize: 13, fontWeight: 700, color: 'var(--color-text)',
              }}>
                {newExpiry.toLocaleDateString(undefined, {
                  year: 'numeric', month: 'short', day: 'numeric',
                })}
              </span>
            </div>
          )}

          {/* Footer buttons */}
          <div style={{
            display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 22,
          }}>
            <button onClick={() => onCancel?.()} disabled={busy} style={{
              padding: '9px 18px',
              background: 'transparent',
              border: '1px solid var(--color-border)',
              borderRadius: 9,
              cursor: busy ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
              fontSize: 13, fontWeight: 600,
              color: 'var(--color-text-muted)',
            }}>
              Cancel
            </button>
            <button onClick={handleRenew} disabled={busy} style={{
              padding: '9px 22px',
              background: busy ? 'var(--color-border)' : 'var(--color-accent)',
              color: 'white',
              border: 'none',
              borderRadius: 9,
              cursor: busy ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
              fontSize: 13, fontWeight: 700,
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <ArrowPathIcon style={{ width: 13, height: 13 }} />
              {busy ? 'Renewing…' : 'Renew'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
