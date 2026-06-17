// ────────────────────────────────────────────────────────────────────
// SubmissionAnswersModal — view raw client answers for an intake
// submission. Used from the Project Library's:
//
//   - "View submission" action on In Progress cards (peek while the
//     pipeline is running, before the brief is ready)
//   - "View past submissions" action on Expired cards (catch
//     anything that came in just before the link died)
//
// Renders Q + A pairs left-to-right with the question text and the
// client's answer. Supports pagination across multiple submissions
// for the same form via prev/next chips at the top.
// ────────────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react'
import { XMarkIcon, ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline'

export default function SubmissionAnswersModal({ form, submissions = [], onClose }) {
  const [idx, setIdx] = useState(0)

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.()
      if (e.key === 'ArrowLeft'  && idx > 0) setIdx(i => i - 1)
      if (e.key === 'ArrowRight' && idx < submissions.length - 1) setIdx(i => i + 1)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [idx, submissions.length, onClose])

  if (!submissions?.length) return null
  const submission = submissions[idx]
  const answers = submission?.answers || {}
  const questions = pickQuestions(form)

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: 'rgba(0,0,0,0.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 20,
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        width: '100%', maxWidth: 640,
        maxHeight: 'calc(100vh - 40px)',
        background: 'var(--color-bg)',
        border: '1px solid var(--color-border)',
        borderRadius: 16,
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
        boxShadow: '0 24px 60px rgba(0,0,0,0.25)',
      }}>
        {/* Header */}
        <header style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '14px 18px',
          borderBottom: '1px solid var(--color-border)',
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--color-text-muted)',
              marginBottom: 2,
            }}>
              {submissions.length > 1 ? `Submission ${idx + 1} of ${submissions.length}` : 'Submission'}
            </div>
            <div style={{
              fontFamily: "'Urbanist', sans-serif",
              fontSize: 15, fontWeight: 800,
              color: 'var(--color-text)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {submission?.business_name || submission?.client_name || form?.project_name || 'Client answers'}
            </div>
            {submission?.submitted_at && (
              <div style={{
                fontFamily: "'Urbanist', sans-serif",
                fontSize: 11,
                color: 'var(--color-text-muted)',
                marginTop: 2,
              }}>
                Submitted {prettyDate(submission.submitted_at)}
              </div>
            )}
          </div>
          {submissions.length > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <button
                onClick={() => setIdx(i => Math.max(0, i - 1))}
                disabled={idx === 0}
                style={paginationBtn}
                aria-label="Previous submission"
              >
                <ChevronLeftIcon style={{ width: 14, height: 14 }} />
              </button>
              <button
                onClick={() => setIdx(i => Math.min(submissions.length - 1, i + 1))}
                disabled={idx === submissions.length - 1}
                style={paginationBtn}
                aria-label="Next submission"
              >
                <ChevronRightIcon style={{ width: 14, height: 14 }} />
              </button>
            </div>
          )}
          <button onClick={onClose} style={closeBtn} aria-label="Close">
            <XMarkIcon style={{ width: 16, height: 16 }} />
          </button>
        </header>

        {/* Client identity row */}
        {(submission?.client_name || submission?.business_name || submission?.client_email) && (
          <div style={{
            padding: '10px 18px',
            background: 'var(--color-surface)',
            borderBottom: '1px solid var(--color-border)',
            display: 'flex', flexWrap: 'wrap', gap: 12,
            fontFamily: "'Urbanist', sans-serif",
            fontSize: 12,
            color: 'var(--color-text-soft)',
          }}>
            {submission?.client_name && (
              <span><strong style={{ color: 'var(--color-text-muted)', marginRight: 4, fontWeight: 700 }}>Name:</strong>{submission.client_name}</span>
            )}
            {submission?.business_name && (
              <span><strong style={{ color: 'var(--color-text-muted)', marginRight: 4, fontWeight: 700 }}>Business:</strong>{submission.business_name}</span>
            )}
            {submission?.client_email && (
              <span><strong style={{ color: 'var(--color-text-muted)', marginRight: 4, fontWeight: 700 }}>Email:</strong>{submission.client_email}</span>
            )}
          </div>
        )}

        {/* Answers */}
        <div style={{
          flex: 1, overflowY: 'auto',
          padding: '16px 18px 20px',
        }}>
          {questions.length === 0 ? (
            <div style={{ color: 'var(--color-text-muted)', fontSize: 13, padding: '24px 0', textAlign: 'center' }}>
              No questions defined on this form.
            </div>
          ) : questions.map((q, i) => (
            <AnswerRow
              key={q.id || i}
              index={i + 1}
              question={q}
              value={answers[q.id]}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function AnswerRow({ index, question, value }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{
        display: 'flex', alignItems: 'baseline', gap: 8,
        marginBottom: 4,
      }}>
        <span style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 11, fontWeight: 700,
          color: 'var(--color-text-muted)',
          flexShrink: 0,
        }}>
          Q{index}
        </span>
        <span style={{
          fontFamily: "'Urbanist', sans-serif",
          fontSize: 13, fontWeight: 700,
          color: 'var(--color-text)',
          lineHeight: 1.4,
        }}>
          {question.text || question.label || 'Untitled question'}
        </span>
      </div>
      <div style={{
        padding: '10px 14px',
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 9,
        fontFamily: "'Urbanist', sans-serif",
        fontSize: 13,
        color: 'var(--color-text-soft)',
        lineHeight: 1.55,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
      }}>
        {renderAnswer(value)}
      </div>
    </div>
  )
}

function renderAnswer(v) {
  if (v == null || v === '') {
    return <span style={{ color: 'var(--color-text-muted)', fontStyle: 'italic' }}>(not answered)</span>
  }
  if (typeof v === 'number') return v
  if (typeof v === 'string') return v
  if (Array.isArray(v)) {
    if (v.length && typeof v[0] === 'object' && (v[0]?.name || v[0]?.url)) {
      // Uploaded file objects
      return v.map((f, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <span style={{ fontSize: 14 }}>📎</span>
          {f.url
            ? <a href={f.url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-accent)', textDecoration: 'underline' }}>{f.name || 'attachment'}</a>
            : <span>{f.name || 'attachment'}</span>}
        </div>
      ))
    }
    return v.join(', ')
  }
  if (typeof v === 'object') return JSON.stringify(v, null, 2)
  return String(v)
}

function pickQuestions(form) {
  if (Array.isArray(form?.questions) && form.questions.length) return form.questions
  if (Array.isArray(form?.sections)) {
    const out = []
    for (const s of form.sections) {
      if (Array.isArray(s.questions)) for (const q of s.questions) out.push(q)
    }
    return out
  }
  return []
}

function prettyDate(iso) {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit',
    })
  } catch { return '' }
}

const paginationBtn = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  width: 28, height: 28,
  background: 'var(--color-surface)',
  border: '1px solid var(--color-border)',
  borderRadius: 7,
  color: 'var(--color-text-soft)',
  cursor: 'pointer',
}

const closeBtn = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  width: 30, height: 30,
  background: 'transparent',
  border: '1px solid var(--color-border)',
  borderRadius: 8,
  color: 'var(--color-text-soft)',
  cursor: 'pointer',
}
