// ────────────────────────────────────────────────────────────────────
// BriefV2ReviseModal, designer-facing modal that captures feedback
// and triggers an AI revision of the brief. Auto-prefills the
// textarea with the client's note when there's an outstanding
// brief_review with status='changes_requested', so the designer
// doesn't have to copy-paste from the email.
// ────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from 'react'
import { XMarkIcon, SparklesIcon } from '@heroicons/react/24/outline'

export default function BriefV2ReviseModal({
  open,
  onClose,
  onSubmit,             // (feedback, { reviewId? }) → Promise<void>
  pendingReview = null, // { decision_note, client_name, id } | null
  pendingComments = [], // open (unaddressed) thread comments, oldest first
}) {
  const [feedback, setFeedback] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const taRef = useRef(null)

  useEffect(() => {
    if (open) {
      // Prefill: prefer the full thread (concatenated, numbered)
      // over the legacy single-note decision_note. Designer can
      // edit before submitting.
      let initial = ''
      if (Array.isArray(pendingComments) && pendingComments.length > 0) {
        initial = pendingComments
          .map((c, i) => `${i + 1}. ${String(c.body || '').trim()}`)
          .join('\n\n')
      } else if (pendingReview?.decision_note) {
        initial = pendingReview.decision_note
      }
      setFeedback(initial)
      setSubmitting(false)
      setTimeout(() => taRef.current?.focus(), 30)
    }
  }, [open, pendingReview?.id, pendingComments?.length])

  useEffect(() => {
    if (!open) return
    function onKey(e) { if (e.key === 'Escape' && !submitting) onClose?.() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, submitting, onClose])

  if (!open) return null

  async function submit() {
    const trimmed = feedback.trim()
    if (!trimmed || submitting) return
    setSubmitting(true)
    try {
      await onSubmit?.(trimmed, { reviewId: pendingReview?.id || null })
      onClose?.()
    } catch (e) {
      console.error('[BriefV2ReviseModal] submit failed', e)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      onClick={() => { if (!submitting) onClose?.() }}
      style={{
        position: 'fixed', inset: 0, zIndex: 920,
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
          width: '100%', maxWidth: 560,
          overflow: 'hidden',
          boxShadow: '0 24px 64px rgba(0,0,0,0.3)',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '18px 22px 14px',
          borderBottom: '1px solid var(--color-border)',
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 9,
              background: 'rgba(139,92,246,0.10)',
              border: '1px solid rgba(139,92,246,0.30)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              <SparklesIcon style={{ width: 16, height: 16, color: 'var(--color-accent)' }} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 800, fontSize: 16 }}>Revise brief with AI</div>
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                Describe what should change. The current brief becomes a saved version.
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={submitting}
            style={{
              width: 28, height: 28, borderRadius: 8,
              background: 'transparent', border: 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--color-text-muted)',
              cursor: submitting ? 'not-allowed' : 'pointer',
              flexShrink: 0,
            }}
          >
            <XMarkIcon style={{ width: 16, height: 16 }} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '16px 22px 18px' }}>
          {(pendingComments?.length > 0 || pendingReview?.decision_note) && (
            <div style={{
              marginBottom: 12,
              padding: '8px 11px',
              background: 'rgba(245,158,11,0.07)',
              border: '1px solid rgba(245,158,11,0.30)',
              borderRadius: 9,
              fontSize: 12,
              color: 'var(--color-text)',
              lineHeight: 1.5,
            }}>
              <strong style={{ fontWeight: 800 }}>
                {pendingReview?.client_name ? `${pendingReview.client_name} ` : 'Your client '}
              </strong>
              sent {pendingComments?.length > 1
                ? `${pendingComments.length} unaddressed notes`
                : 'a note'}. Pre-filled below, edit or rewrite as you like.
            </div>
          )}

          <label style={{
            display: 'block',
            font: '800 10px Urbanist, sans-serif',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: 'var(--color-text-muted)',
            marginBottom: 6,
          }}>
            What should change?
          </label>
          <textarea
            ref={taRef}
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="e.g. The audience is too broad, we only target independent designers, not agencies. Tone should feel more practical, less aspirational."
            rows={7}
            disabled={submitting}
            style={{
              width: '100%',
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 10,
              padding: '12px 14px',
              font: '400 14px Urbanist, sans-serif',
              lineHeight: 1.55,
              color: 'var(--color-text)',
              resize: 'vertical',
              outline: 'none',
            }}
            onFocus={(e) => { e.target.style.borderColor = 'var(--color-accent)' }}
            onBlur={(e) => { e.target.style.borderColor = 'var(--color-border)' }}
          />
          <div style={{
            fontSize: 11,
            color: 'var(--color-text-muted)',
            marginTop: 6,
          }}>
            AI will re-translate the whole brief addressing this feedback. Takes ~20-30 seconds.
            The current version will be saved as "Original" or "Revision N" in the tab strip above the brief.
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
            <button
              onClick={onClose}
              disabled={submitting}
              style={{
                padding: '10px 18px',
                background: 'transparent',
                border: '1px solid var(--color-border)',
                color: 'var(--color-text-soft)',
                borderRadius: 9,
                font: '700 13px Urbanist, sans-serif',
                cursor: submitting ? 'not-allowed' : 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              onClick={submit}
              disabled={submitting || !feedback.trim()}
              style={{
                padding: '10px 20px',
                background: (submitting || !feedback.trim()) ? 'var(--color-border)' : 'var(--color-accent)',
                color: 'white',
                border: 'none',
                borderRadius: 9,
                font: '700 13px Urbanist, sans-serif',
                cursor: (submitting || !feedback.trim()) ? 'not-allowed' : 'pointer',
                display: 'inline-flex', alignItems: 'center', gap: 6,
              }}
            >
              <SparklesIcon style={{ width: 14, height: 14 }} />
              {submitting ? 'Revising…' : 'Revise brief'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
