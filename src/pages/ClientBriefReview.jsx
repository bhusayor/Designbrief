// ────────────────────────────────────────────────────────────────────
// ClientBriefReview, public page at /review/<token>.
//
// The client opens the share link the designer sent them, reads the
// translated brief, and either Approves it or Requests Changes with
// a note. Token-gated, no auth required. Hits the server endpoints
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
// We deliberately reuse BriefV2View by omitting onEditItem, the
// pencil + edit chrome only show when that prop is wired.
// ────────────────────────────────────────────────────────────────────

import { useContext, useEffect, useState } from 'react'
import { CheckCircleIcon, ExclamationCircleIcon } from '@heroicons/react/24/outline'
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

  // Per-question answers keyed by question index. Optional — empty
  // answers are filtered out before submit. Bundled with any free-
  // text change-request note on submit so the designer sees both
  // structured answers + unstructured asks in one banner.
  const [answers, setAnswers] = useState({})
  const handleAnswer = (idx, text) => {
    setAnswers(prev => ({ ...prev, [idx]: text }))
  }

  // Extract the questions list so we can pair index → question text
  // when posting the answers. Reads from the brief content.
  const questions = (() => {
    const interrogate = data?.brief?.sections?.find(s => s.id === 'interrogate')
    const qItem = interrogate?.items?.find(i => i.key === 'questions')
    return Array.isArray(qItem?.content) ? qItem.content : []
  })()

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

  // Overall review decision (Approve / Request changes on the
  // whole brief). The per-section fan-out was removed: clients
  // make one decision at the bottom of the page, optionally with
  // a free-text note. The designer reads the note and decides
  // how to revise.
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

      setData(prev => prev ? {
        ...prev,
        review: {
          ...prev.review,
          status,
          decision_note: note || null,
          approved_at: status === 'approved' ? new Date().toISOString() : prev.review.approved_at,
        },
      } : prev)
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

      {/* The brief, read-only. Per-section approve/changes UI was
          intentionally removed in favour of a single decision at
          the bottom of the page; most clients won't engage with
          section-by-section ceremony, a simple Approve all + free-
          text changes note is enough. */}
      <div style={{ background: 'var(--color-bg)' }}>
        <BriefV2View
          result={brief}
          isStreaming={false}
          showCompletionBanner={false}
          clientAnswers={answers}
          onClientAnswer={handleAnswer}
        />
      </div>

      {/* Feedback thread + composer. Always visible regardless of
          decision state so the client can keep iterating, change
          their mind, or add follow-up notes. Any per-question
          answers the client typed above get bundled into the comment
          body when they submit, so the designer sees both Q&A pairs
          and free-text change requests in one banner. */}
      <div style={container}>
        <FeedbackThread
          comments={data.comments || []}
          isApproved={isApproved}
          approvedAt={review.approved_at}
          hasUnsentAnswers={Object.values(answers).some(a => String(a || '').trim())}
          onAddComment={async (freeText) => {
            const body = bundleAnswersAndText(answers, questions, freeText)
            if (!body) return // nothing to send
            const r = await fetch(`${API_BASE}/api/brief-reviews/by-token/${activeReviewToken}/comments`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ body, section_id: 'overall' }),
            })
            if (!r.ok) throw new Error(`Could not send (${r.status})`)
            const j = await r.json().catch(() => ({}))
            const newComment = j?.comment
            setData(prev => prev ? {
              ...prev,
              review: { ...prev.review, status: 'changes_requested' },
              comments: [...(prev.comments || []), newComment].filter(Boolean),
            } : prev)
            // Clear answers + free-text on success so the client
            // doesn't accidentally re-send the same answers.
            setAnswers({})
          }}
          onApprove={async () => {
            // If the client typed any answers, ship them as a
            // comment before flipping the status to approved.
            // Order matters: comment first so its status='open',
            // then decision so review.status='approved' wins.
            const body = bundleAnswersAndText(answers, questions, '')
            if (body) {
              try {
                const r = await fetch(`${API_BASE}/api/brief-reviews/by-token/${activeReviewToken}/comments`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ body, section_id: 'overall' }),
                })
                const j = r.ok ? await r.json().catch(() => ({})) : null
                const newComment = j?.comment
                if (newComment) {
                  setData(prev => prev ? {
                    ...prev,
                    comments: [...(prev.comments || []), newComment].filter(Boolean),
                  } : prev)
                }
                setAnswers({})
              } catch { /* fall through to approval anyway */ }
            }
            await submitDecision('approved')
          }}
          submittingApprove={submitting}
          designerPrimary={designer.primary}
        />
      </div>
    </div>
  )
}

// ── Feedback thread + composer ──────────────────────────────────────
// Renders previous comments chronologically + an always-visible
// composer with Send note + Approve actions. The decision is
// reversible: client can approve, then later add another note, then
// approve again. Each action just creates a new event.
// Bundle per-question answers + an optional free-text change-request
// note into one comment body. The format is a plain-text protocol
// (no JSON column needed) the designer-side renderer parses:
//
//   ANSWERED:
//   Q1. <question text>
//   A1. <client answer>
//
//   Q2. ...
//
//   CHANGES:
//   <free text>
//
// Either section can be absent. Returns empty string when nothing
// to send so callers can early-return.
function bundleAnswersAndText(answersMap, questionsList, freeText) {
  const answered = Object.entries(answersMap || {})
    .filter(([, a]) => String(a || '').trim())
    .map(([idx, a]) => ({
      idx: Number(idx),
      q: questionsList[Number(idx)],
      a: String(a).trim(),
    }))
    .filter(e => e.q)
    .sort((x, y) => x.idx - y.idx)
  const trimmedFree = String(freeText || '').trim()
  if (!answered.length && !trimmedFree) return ''
  let body = ''
  if (answered.length) {
    body += 'ANSWERED:\n'
    body += answered
      .map(e => `Q${e.idx + 1}. ${e.q}\nA${e.idx + 1}. ${e.a}`)
      .join('\n\n')
  }
  if (trimmedFree) {
    if (body) body += '\n\n'
    body += `CHANGES:\n${trimmedFree}`
  }
  return body
}

function FeedbackThread({ comments, isApproved, approvedAt, onAddComment, onApprove, submittingApprove, designerPrimary, hasUnsentAnswers }) {
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [sendErr, setSendErr] = useState('')

  // Order by created_at ascending (oldest first). Filter out
  // resolved comments from the visible thread but keep an entry so
  // the client knows it was previously addressed.
  const ordered = (comments || []).slice().sort((a, b) =>
    new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  )

  async function send() {
    const body = draft.trim()
    if (!body || sending) return
    setSending(true)
    setSendErr('')
    try {
      await onAddComment(body)
      setDraft('')
    } catch (e) {
      setSendErr(e?.message || 'Could not send your note. Please try again.')
    } finally {
      setSending(false)
    }
  }

  return (
    <div style={threadWrap(designerPrimary)}>
      <div style={threadHeader}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 16 }}>Feedback</div>
          <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
            {isApproved
              ? `You approved this brief on ${formatDate(approvedAt)}. Send another note if anything else changes.`
              : 'Send notes or approve when you are happy with everything. You can update your decision anytime.'}
          </div>
        </div>
        {isApproved && (
          <span style={approvedPill}>
            <CheckCircleIcon style={{ width: 14, height: 14 }} /> Approved
          </span>
        )}
      </div>

      {ordered.length > 0 && (
        <ul style={threadList}>
          {ordered.map(c => (
            <li key={c.id} style={threadItem(c.status === 'resolved')}>
              <div style={threadItemMeta}>
                <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
                  Your note · {formatDate(c.created_at)}
                </span>
                {c.status === 'resolved' && (
                  <span style={addressedPill}>Addressed</span>
                )}
              </div>
              <div style={{ fontSize: 14, color: 'var(--color-text)', lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>
                {c.body}
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Composer */}
      <div style={composerWrap}>
        {hasUnsentAnswers && (
          <div style={{
            padding: '8px 10px',
            background: 'var(--color-bg)',
            border: '1px solid var(--color-border)',
            borderRadius: 8,
            fontSize: 12,
            color: 'var(--color-text-soft)',
            marginBottom: 8,
            lineHeight: 1.45,
          }}>
            You have unsent answers to the designer's questions. They'll be
            included when you click Send note or Approve brief.
          </div>
        )}
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Type a note about anything you'd like changed (optional if you've answered questions above)."
          rows={3}
          style={composerTextarea}
          disabled={sending}
        />
        {sendErr && (
          <div style={{ fontSize: 12, color: '#b91c1c', marginTop: 4 }}>{sendErr}</div>
        )}
        <div style={composerActions}>
          <button
            type="button"
            onClick={onApprove}
            disabled={submittingApprove}
            style={isApproved ? ghostBtn : primaryBtn(designerPrimary)}
          >
            {submittingApprove ? 'Submitting…' : (isApproved ? 'Approve again' : 'Approve brief')}
          </button>
          <button
            type="button"
            onClick={send}
            disabled={sending || (!draft.trim() && !hasUnsentAnswers)}
            style={{
              ...(isApproved ? primaryBtn(designerPrimary) : ghostBtn),
              opacity: (sending || (!draft.trim() && !hasUnsentAnswers)) ? 0.55 : 1,
              cursor: (sending || (!draft.trim() && !hasUnsentAnswers)) ? 'not-allowed' : 'pointer',
            }}
          >
            {sending ? 'Sending…' : 'Send note'}
          </button>
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
  // #root has overflow:hidden + height:100dvh globally so the
  // designer-app stays viewport-locked with its own internal
  // scrollers. The public review page needs to scroll naturally
  // for the client, so we make THIS shell the scroll container.
  height: '100dvh',
  overflowY: 'auto',
  background: 'var(--color-bg)',
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
  // Kept for back-compat; no longer used. The bottom CTA is now
  // an inline approveAllBlock that flows in document order so the
  // page is naturally scrollable without a sticky bar covering
  // the last card.
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

function approveAllBlock(primary) {
  // Legacy; kept temporarily until any unreferenced callers are
  // removed. Safe to delete in a future cleanup.
  return {
    margin: '32px 0 48px',
    padding: '20px 22px',
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderLeft: `3px solid ${primary}`,
    borderRadius: 14,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    flexWrap: 'wrap',
  }
}

// ── Feedback thread styles ──────────────────────────────────────────
function threadWrap(primary) {
  return {
    margin: '32px 0 48px',
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderLeft: `3px solid ${primary}`,
    borderRadius: 14,
    overflow: 'hidden',
  }
}
const threadHeader = {
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: 12,
  padding: '18px 22px',
  borderBottom: '1px solid var(--color-border)',
  flexWrap: 'wrap',
}
const approvedPill = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
  padding: '4px 10px',
  background: 'rgba(16,185,129,0.10)',
  color: '#047857',
  border: '1px solid rgba(16,185,129,0.30)',
  borderRadius: 100,
  font: '800 11px Urbanist, sans-serif',
  letterSpacing: '0.02em',
}
const threadList = {
  listStyle: 'none',
  padding: 0,
  margin: 0,
  borderBottom: '1px solid var(--color-border)',
}
function threadItem(resolved) {
  return {
    padding: '14px 22px',
    borderTop: '1px solid var(--color-border)',
    background: resolved ? 'var(--color-bg)' : 'transparent',
    opacity: resolved ? 0.6 : 1,
  }
}
const threadItemMeta = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginBottom: 6,
  gap: 8,
}
const addressedPill = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '2px 8px',
  background: 'rgba(16,185,129,0.10)',
  color: '#047857',
  border: '1px solid rgba(16,185,129,0.30)',
  borderRadius: 100,
  font: '800 9px Urbanist, sans-serif',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
}
const composerWrap = {
  padding: '16px 22px 18px',
}
const composerTextarea = {
  width: '100%',
  background: 'var(--color-bg)',
  border: '1px solid var(--color-border)',
  borderRadius: 10,
  padding: '12px 14px',
  fontFamily: 'inherit',
  fontSize: 14,
  lineHeight: 1.55,
  color: 'var(--color-text)',
  resize: 'vertical',
  outline: 'none',
}
const composerActions = {
  display: 'flex',
  gap: 8,
  justifyContent: 'flex-end',
  marginTop: 12,
  flexWrap: 'wrap',
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
