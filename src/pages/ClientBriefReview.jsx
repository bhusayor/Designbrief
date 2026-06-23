// ────────────────────────────────────────────────────────────────────
// ClientBriefReview — public page at /review/<token>.
//
// The client opens the share link the designer sent them, reads the
// translated brief, and either Approves it or Requests Changes with
// a note. Token-gated — no auth required. Hits the server endpoints
// in server-lib/briefReviews.js.
//
// UX
//   Loading:  skeleton page with the designer brand colour
//   Loaded:   designer greeting → full brief (read-only, no edit
//             pencils) → sticky bottom decision bar
//   Decision: Approve fires immediately; Request changes opens a
//             modal with a textarea so the client can leave a note
//   After:    banner at the top showing the decision state and
//             timestamp; decision bar disappears
//
// We deliberately reuse BriefV2View by omitting onEditItem — the
// pencil + edit chrome only show when that prop is wired.
// ────────────────────────────────────────────────────────────────────

import { useContext, useEffect, useState } from 'react'
import { CheckCircleIcon, ExclamationCircleIcon, XMarkIcon } from '@heroicons/react/24/outline'
import AppContext from '../context/AppContext'
import BriefV2View from '../components/brief/BriefV2View'

const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')

export default function ClientBriefReview() {
  const { activeReviewToken } = useContext(AppContext)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [data, setData] = useState(null)

  // Decision UI state
  const [submitting, setSubmitting] = useState(false)
  const [showChangesModal, setShowChangesModal] = useState(false)
  const [changesNote, setChangesNote] = useState('')

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!activeReviewToken) {
        setError('Missing review token in URL.')
        setLoading(false)
        return
      }
      if (!API_BASE) {
        setError('Review endpoint is not configured. Please contact your designer.')
        setLoading(false)
        return
      }
      try {
        const r = await fetch(`${API_BASE}/api/brief-reviews/by-token/${activeReviewToken}`)
        if (!r.ok) {
          if (cancelled) return
          if (r.status === 404) setError('This review link is invalid or has expired.')
          else setError(`Could not load the brief (${r.status}).`)
          setLoading(false)
          return
        }
        const json = await r.json()
        if (cancelled) return
        setData(json)
        setLoading(false)
      } catch (e) {
        if (cancelled) return
        setError(e?.message || 'Network error. Check your connection and try again.')
        setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [activeReviewToken])

  async function submitDecision(status, note = '') {
    if (submitting) return
    setSubmitting(true)
    try {
      const r = await fetch(`${API_BASE}/api/brief-reviews/by-token/${activeReviewToken}/decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, note }),
      })
      if (!r.ok) throw new Error(`Could not submit (${r.status})`)
      // Optimistically reflect in local state so the banner appears
      // without a round trip.
      setData(prev => prev ? {
        ...prev,
        review: {
          ...prev.review,
          status,
          decision_note: note || null,
          approved_at: status === 'approved' ? new Date().toISOString() : prev.review.approved_at,
        },
      } : prev)
      setShowChangesModal(false)
      setChangesNote('')
    } catch (e) {
      alert(e?.message || 'Could not submit your decision. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  // ── Loading ──
  if (loading) {
    return (
      <div style={shell}>
        <div style={{ ...container, padding: '64px 24px', textAlign: 'center' }}>
          <div className="briefv2-review-spinner" aria-label="Loading" />
          <p style={{ color: 'var(--color-text-muted)', marginTop: 16 }}>Loading your brief…</p>
        </div>
        <SpinnerStyles />
      </div>
    )
  }

  // ── Error ──
  if (error) {
    return (
      <div style={shell}>
        <div style={{ ...container, padding: '64px 24px', textAlign: 'center' }}>
          <ExclamationCircleIcon style={{ width: 36, height: 36, color: '#ef4444', margin: '0 auto 12px' }} />
          <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>This link doesn't work</h1>
          <p style={{ color: 'var(--color-text-muted)', maxWidth: 480, margin: '0 auto', lineHeight: 1.55 }}>{error}</p>
        </div>
      </div>
    )
  }

  const { review, brief, projectTitle, designer } = data
  const isApproved = review.status === 'approved'
  const isChanges  = review.status === 'changes_requested'
  const isDone     = isApproved || isChanges

  return (
    <div style={shell}>
      {/* Top brand bar with designer name + logo */}
      <header style={topBar(designer.primary)}>
        <div style={{ ...container, display: 'flex', alignItems: 'center', gap: 12 }}>
          {designer.logo
            ? <img src={designer.logo} alt={designer.name} style={{ height: 28, maxWidth: 140, objectFit: 'contain' }} />
            : (
              <div style={{
                width: 30, height: 30, borderRadius: 8,
                background: designer.primary,
                color: 'white',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 800, fontSize: 13,
              }}>
                {(designer.name || 'D').charAt(0).toUpperCase()}
              </div>
            )
          }
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 11, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>
              Brief for review
            </span>
            <span style={{ fontSize: 13, fontWeight: 700 }}>From {designer.name}</span>
          </div>
        </div>
      </header>

      {/* Decision banner (post-decision) */}
      {isDone && (
        <div style={container}>
          <div style={decisionBanner(isApproved)}>
            {isApproved
              ? <CheckCircleIcon style={{ width: 22, height: 22, color: '#10b981', flexShrink: 0 }} />
              : <ExclamationCircleIcon style={{ width: 22, height: 22, color: '#f59e0b', flexShrink: 0 }} />}
            <div>
              <div style={{ fontWeight: 800, color: 'var(--color-text)' }}>
                {isApproved
                  ? 'You approved this brief'
                  : 'You requested changes'}
              </div>
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 2 }}>
                {isApproved
                  ? `Approved ${formatDate(review.approved_at)}. Your designer has been notified.`
                  : 'Your note has been sent to the designer.'}
              </div>
              {isChanges && review.decision_note && (
                <div style={{ fontSize: 13, marginTop: 8, padding: '8px 11px', background: 'var(--color-bg)', borderRadius: 8, color: 'var(--color-text)' }}>
                  {review.decision_note}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Designer's greeting */}
      <div style={container}>
        <section style={greeting}>
          <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.01em', marginBottom: 8 }}>
            {projectTitle || 'Your project brief'}
          </h1>
          <p style={{ color: 'var(--color-text-soft)', fontSize: 15, lineHeight: 1.6, marginBottom: 16 }}>
            {designer.name} has put together this brief based on what you shared.
            Read through it and let them know if anything needs adjusting before
            the design work begins.
          </p>
          {review.designer_message && (
            <blockquote style={messageQuote(designer.primary)}>
              {review.designer_message}
            </blockquote>
          )}
        </section>
      </div>

      {/* The brief — read-only (no onEditItem prop) */}
      <div style={{ background: 'var(--color-bg)' }}>
        <BriefV2View
          result={brief}
          isStreaming={false}
          showCompletionBanner={false}
        />
      </div>

      {/* Sticky decision bar — only when not yet decided */}
      {!isDone && (
        <div style={decisionBar(designer.primary)}>
          <div style={{ ...container, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 800, fontSize: 14 }}>Ready to decide?</div>
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                Approve the brief or send a note about what needs changing.
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
              <button
                onClick={() => setShowChangesModal(true)}
                disabled={submitting}
                style={ghostBtn}
              >
                Request changes
              </button>
              <button
                onClick={() => submitDecision('approved')}
                disabled={submitting}
                style={primaryBtn(designer.primary)}
              >
                {submitting ? 'Submitting…' : 'Approve brief'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Request changes modal */}
      {showChangesModal && (
        <ChangesModal
          onCancel={() => { if (!submitting) { setShowChangesModal(false); setChangesNote('') } }}
          onSubmit={(note) => submitDecision('changes_requested', note)}
          note={changesNote}
          setNote={setChangesNote}
          submitting={submitting}
          designerPrimary={designer.primary}
        />
      )}
    </div>
  )
}

// ── Changes modal ───────────────────────────────────────────────────
function ChangesModal({ onCancel, onSubmit, note, setNote, submitting, designerPrimary }) {
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape' && !submitting) onCancel() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel, submitting])

  return (
    <div
      onClick={() => { if (!submitting) onCancel() }}
      style={{
        position: 'fixed', inset: 0, zIndex: 900,
        background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)',
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
          width: '100%', maxWidth: 520,
          overflow: 'hidden',
          boxShadow: '0 24px 64px rgba(0,0,0,0.3)',
        }}
      >
        <header style={{
          padding: '16px 22px',
          borderBottom: '1px solid var(--color-border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ fontWeight: 800, fontSize: 16 }}>What needs to change?</div>
          <button
            onClick={onCancel}
            disabled={submitting}
            style={{
              width: 28, height: 28, borderRadius: 8, background: 'transparent', border: 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--color-text-muted)', cursor: submitting ? 'not-allowed' : 'pointer',
            }}
          >
            <XMarkIcon style={{ width: 16, height: 16 }} />
          </button>
        </header>

        <div style={{ padding: '18px 22px' }}>
          <label style={{ display: 'block', fontSize: 13, color: 'var(--color-text-soft)', lineHeight: 1.55, marginBottom: 10 }}>
            Tell the designer what's not quite right. Be as specific as you can — which section,
            which line, and what you'd prefer.
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. The audience description is too broad. We're really only targeting independent designers, not agencies."
            rows={6}
            disabled={submitting}
            autoFocus
            style={{
              width: '100%',
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 10,
              padding: '12px 14px',
              fontFamily: 'inherit',
              fontSize: 14,
              lineHeight: 1.55,
              color: 'var(--color-text)',
              resize: 'vertical',
              outline: 'none',
            }}
          />

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
            <button onClick={onCancel} disabled={submitting} style={ghostBtn}>
              Cancel
            </button>
            <button
              onClick={() => onSubmit(note.trim())}
              disabled={submitting || !note.trim()}
              style={{
                ...primaryBtn(designerPrimary),
                opacity: (submitting || !note.trim()) ? 0.55 : 1,
                cursor: (submitting || !note.trim()) ? 'not-allowed' : 'pointer',
              }}
            >
              {submitting ? 'Sending…' : 'Send to designer'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Helpers + styles ────────────────────────────────────────────────
function formatDate(iso) {
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
  } catch { return '' }
}

const shell = {
  minHeight: '100dvh',
  background: 'var(--color-bg)',
  paddingBottom: 120, // leave room for the sticky decision bar
}

const container = {
  maxWidth: 1100,
  margin: '0 auto',
  padding: '0 clamp(16px, 4vw, 32px)',
}

function topBar(primary) {
  return {
    background: 'var(--color-surface)',
    borderBottom: '1px solid var(--color-border)',
    padding: '14px 0',
    boxShadow: `inset 0 -2px 0 0 ${primary}`,
  }
}

const greeting = {
  padding: '32px 0 20px',
}

function messageQuote(primary) {
  return {
    margin: 0,
    padding: '14px 16px',
    background: 'var(--color-surface)',
    borderLeft: `3px solid ${primary}`,
    borderRadius: 10,
    fontSize: 14,
    lineHeight: 1.55,
    color: 'var(--color-text)',
    whiteSpace: 'pre-wrap',
  }
}

function decisionBanner(isApproved) {
  return {
    display: 'grid',
    gridTemplateColumns: '22px 1fr',
    gap: 12,
    alignItems: 'flex-start',
    margin: '16px 0 0',
    padding: '14px 16px',
    background: isApproved ? 'rgba(16,185,129,0.06)' : 'rgba(245,158,11,0.06)',
    border: '1px solid',
    borderColor: isApproved ? 'rgba(16,185,129,0.30)' : 'rgba(245,158,11,0.30)',
    borderRadius: 12,
  }
}

function decisionBar(primary) {
  return {
    position: 'fixed',
    left: 0, right: 0, bottom: 0,
    background: 'var(--color-bg)',
    borderTop: '1px solid var(--color-border)',
    boxShadow: '0 -10px 30px rgba(0,0,0,0.08)',
    padding: '14px 0',
    zIndex: 10,
  }
}

const ghostBtn = {
  padding: '10px 18px',
  background: 'transparent',
  border: '1px solid var(--color-border)',
  borderRadius: 9,
  fontFamily: 'inherit',
  fontSize: 13,
  fontWeight: 700,
  color: 'var(--color-text-soft)',
  cursor: 'pointer',
}

function primaryBtn(primary) {
  return {
    padding: '10px 22px',
    background: primary,
    border: 'none',
    borderRadius: 9,
    fontFamily: 'inherit',
    fontSize: 13,
    fontWeight: 800,
    color: 'white',
    cursor: 'pointer',
  }
}

function SpinnerStyles() {
  return (
    <style>{`
      .briefv2-review-spinner {
        width: 36px; height: 36px; margin: 0 auto;
        border: 3px solid var(--color-border);
        border-top-color: var(--color-accent);
        border-radius: 50%;
        animation: briefv2-review-spin 0.8s linear infinite;
      }
      @keyframes briefv2-review-spin { to { transform: rotate(360deg); } }
    `}</style>
  )
}
