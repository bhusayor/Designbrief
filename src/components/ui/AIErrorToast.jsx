import { useEffect, useState } from 'react'
import {
  ExclamationTriangleIcon,
  SparklesIcon,
  ClockIcon,
  ArrowPathIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'

// ────────────────────────────────────────────────────────────────────
// AIErrorToast, bottom-anchored, user-safe AI error banner.
//
// Driven by AppContext.aiError, which holds:
//   {
//     code:        'high_demand' | 'rate_limited' | 'timeout' | 'service_unavailable' | 'unexpected',
//     message:     string,
//     retryAfter?: number (seconds, only for rate_limited),
//     onRetry?:    () => void,
//     key:         unique number (forces remount when re-thrown),
//   }
//
// Rendered once in AppShell so any AI failure across the app gets the
// same treatment.
// ────────────────────────────────────────────────────────────────────

const VARIANTS = {
  rate_limited: {
    icon: ClockIcon,
    accent: '#F59E0B',
    bg: 'rgba(245,158,11,0.10)',
    border: 'rgba(245,158,11,0.35)',
    iconColor: '#F59E0B',
  },
  high_demand: {
    icon: SparklesIcon,
    accent: '#8B5CF6',
    bg: 'rgba(139,92,246,0.10)',
    border: 'rgba(139,92,246,0.35)',
    iconColor: '#8B5CF6',
    pulse: true,
  },
  timeout: {
    icon: ClockIcon,
    accent: '#0EA5E9',
    bg: 'rgba(14,165,233,0.10)',
    border: 'rgba(14,165,233,0.35)',
    iconColor: '#0EA5E9',
  },
  service_unavailable: {
    icon: ExclamationTriangleIcon,
    accent: '#EF4444',
    bg: 'rgba(239,68,68,0.10)',
    border: 'rgba(239,68,68,0.35)',
    iconColor: '#EF4444',
  },
  unexpected: {
    icon: ExclamationTriangleIcon,
    accent: '#6B7280',
    bg: 'var(--color-surface)',
    border: 'var(--color-border)',
    iconColor: 'var(--color-text-muted)',
  },
}

export default function AIErrorToast({ error, onDismiss }) {
  const [remaining, setRemaining] = useState(() => {
    if (error?.code === 'rate_limited' && error?.retryAfter) return error.retryAfter
    return 0
  })
  const [exiting, setExiting] = useState(false)

  // Reset countdown each time a new error fires (via .key bump).
  useEffect(() => {
    if (error?.code === 'rate_limited' && error?.retryAfter) {
      setRemaining(error.retryAfter)
    } else {
      setRemaining(0)
    }
    setExiting(false)
  }, [error?.key])

  // Tick the countdown.
  useEffect(() => {
    if (!remaining) return
    const t = setInterval(() => {
      setRemaining(r => (r <= 1 ? 0 : r - 1))
    }, 1000)
    return () => clearInterval(t)
  }, [remaining > 0])

  if (!error) return null

  const variant = VARIANTS[error.code] || VARIANTS.unexpected
  const Icon = variant.icon
  const canRetry = !!error.onRetry
  const countdownActive = remaining > 0
  const retryDisabled = countdownActive

  function handleDismiss() {
    setExiting(true)
    setTimeout(() => onDismiss?.(), 220)
  }

  function handleRetry() {
    if (retryDisabled) return
    try { error.onRetry?.() } catch {}
    handleDismiss()
  }

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 20,
        left: '50%',
        transform: exiting ? 'translateX(-50%) translateY(10px)' : 'translateX(-50%) translateY(0)',
        opacity: exiting ? 0 : 1,
        transition: 'opacity 200ms ease, transform 200ms ease',
        zIndex: 1400,
        maxWidth: 480,
        width: 'calc(100% - 32px)',
        background: 'var(--color-card)',
        border: '1px solid ' + variant.border,
        borderLeft: '3px solid ' + variant.accent,
        borderRadius: 14,
        boxShadow: '0 18px 40px rgba(0,0,0,0.22), 0 4px 12px rgba(0,0,0,0.10)',
        padding: '14px 16px',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
        fontFamily: 'var(--font-sans)',
        animation: exiting ? 'none' : 'fadeUp 220ms cubic-bezier(0.16, 1, 0.3, 1)',
      }}
    >
      <span style={{
        width: 30, height: 30, borderRadius: 10,
        background: variant.bg,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
        animation: variant.pulse && !exiting ? 'pulse 1.6s ease-in-out infinite' : 'none',
      }}>
        <Icon style={{ width: 15, height: 15, color: variant.iconColor }} />
      </span>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 13, fontWeight: 700, color: 'var(--color-text)',
          letterSpacing: '-0.005em',
        }}>
          {error.message}
        </div>
        {countdownActive && (
          <div style={{
            fontSize: 11.5, color: 'var(--color-text-muted)', marginTop: 3,
            fontFamily: 'var(--font-mono)',
          }}>
            Ready in {remaining}s
          </div>
        )}
        {!countdownActive && error.code === 'rate_limited' && (
          <div style={{
            fontSize: 11.5, color: variant.accent, marginTop: 3, fontWeight: 600,
          }}>
            Ready, try again now
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
        {canRetry && (
          <button
            onClick={handleRetry}
            disabled={retryDisabled}
            style={{
              padding: '7px 12px',
              background: retryDisabled ? 'var(--color-surface)' : variant.accent,
              color: retryDisabled ? 'var(--color-text-muted)' : 'white',
              border: retryDisabled ? '1px solid var(--color-border)' : 'none',
              borderRadius: 8,
              cursor: retryDisabled ? 'not-allowed' : 'pointer',
              fontFamily: 'var(--font-sans)', fontSize: 12, fontWeight: 700,
              display: 'inline-flex', alignItems: 'center', gap: 5,
              opacity: retryDisabled ? 0.6 : 1,
              transition: 'background 0.15s, opacity 0.15s',
            }}
          >
            <ArrowPathIcon style={{ width: 12, height: 12 }} />
            Try Again
          </button>
        )}
        <button
          onClick={handleDismiss}
          style={{
            width: 28, height: 28, borderRadius: 8,
            background: 'transparent', border: 'none', cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--color-text-muted)',
          }}
          title="Dismiss"
        >
          <XMarkIcon style={{ width: 14, height: 14 }} />
        </button>
      </div>
    </div>
  )
}
