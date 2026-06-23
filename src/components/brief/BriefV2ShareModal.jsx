// ────────────────────────────────────────────────────────────────────
// BriefV2ShareModal — designer-facing modal for sending a brief to
// the client for review/approval. Renders the form, hits
// /api/brief-reviews to create the share + send the email, then
// switches to a success state with a copy-link affordance.
// ────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from 'react'
import { XMarkIcon, PaperAirplaneIcon, ClipboardDocumentIcon, CheckIcon } from '@heroicons/react/24/outline'
import { supabase } from '../../lib/supabase'

export default function BriefV2ShareModal({
  open,
  onClose,
  projectId,
  intakeSubmissionId,
  defaultClientEmail = '',
  defaultClientName = '',
  defaultMessage = '',
}) {
  const [email, setEmail] = useState(defaultClientEmail)
  const [name, setName] = useState(defaultClientName)
  const [message, setMessage] = useState(defaultMessage)
  const [submitting, setSubmitting] = useState(false)
  const [shareUrl, setShareUrl] = useState('')
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')
  const firstFieldRef = useRef(null)

  // Reset state every time the modal opens fresh.
  useEffect(() => {
    if (open) {
      setEmail(defaultClientEmail)
      setName(defaultClientName)
      setMessage(defaultMessage || defaultMessageBody({ name: defaultClientName }))
      setShareUrl('')
      setCopied(false)
      setError('')
      // Defer focus so the modal mount completes first.
      setTimeout(() => firstFieldRef.current?.focus(), 30)
    }
  }, [open, defaultClientEmail, defaultClientName, defaultMessage])

  // Esc-to-close.
  useEffect(() => {
    if (!open) return
    function onKey(e) { if (e.key === 'Escape' && !submitting) onClose?.() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, submitting, onClose])

  if (!open) return null

  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())

  async function handleSend(e) {
    e?.preventDefault?.()
    if (!validEmail || submitting) return
    setSubmitting(true)
    setError('')

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) {
        setError('You need to be signed in to share a brief.')
        setSubmitting(false)
        return
      }

      const apiUrl = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')
      const res = await fetch(`${apiUrl}/api/brief-reviews`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          project_id: projectId,
          intake_submission_id: intakeSubmissionId,
          client_email: email.trim(),
          client_name: name.trim() || null,
          designer_message: message.trim() || null,
        }),
      })

      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(body?.message || body?.error || `Failed (${res.status})`)
        setSubmitting(false)
        return
      }

      setShareUrl(body.share_url || '')
      setSubmitting(false)
    } catch (err) {
      console.error('[BriefV2ShareModal] create failed', err)
      setError(err?.message || 'Could not send. Try again.')
      setSubmitting(false)
    }
  }

  function copyLink() {
    if (!shareUrl) return
    navigator.clipboard.writeText(shareUrl).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    }).catch(() => {})
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
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--color-bg)',
          border: '1px solid var(--color-border)',
          borderRadius: 18,
          width: '100%',
          maxWidth: 520,
          fontFamily: 'var(--font-sans)',
          overflow: 'hidden',
          boxShadow: '0 24px 64px rgba(0,0,0,0.30)',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '20px 24px 16px',
          borderBottom: '1px solid var(--color-border)',
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12,
        }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 16, color: 'var(--color-text)' }}>
              {shareUrl ? 'Brief sent for review' : 'Send brief for client review'}
            </div>
            <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 4, lineHeight: 1.5 }}>
              {shareUrl
                ? 'The client got an email with the link. Share manually too if you want.'
                : 'Your client gets a clean, branded view of the brief and can approve or request changes.'}
            </div>
          </div>
          <button
            onClick={() => onClose?.()}
            disabled={submitting}
            aria-label="Close"
            style={{
              width: 30, height: 30, borderRadius: 9,
              background: 'transparent', border: 'none',
              cursor: submitting ? 'not-allowed' : 'pointer',
              color: 'var(--color-text-muted)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <XMarkIcon style={{ width: 18, height: 18 }} />
          </button>
        </div>

        {/* Body */}
        {!shareUrl ? (
          <form onSubmit={handleSend} style={{ padding: '18px 24px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Field label="Client name" optional>
              <input
                ref={firstFieldRef}
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Amaka Okafor"
                style={inputStyle}
              />
            </Field>
            <Field label="Client email">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="client@example.com"
                style={inputStyle}
              />
            </Field>
            <Field label="Message" optional>
              <textarea
                rows={5}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                style={{ ...inputStyle, resize: 'vertical', minHeight: 110, fontFamily: 'inherit' }}
              />
            </Field>

            {error && (
              <div style={{
                padding: '9px 12px',
                background: 'rgba(239,68,68,0.06)',
                border: '1px solid rgba(239,68,68,0.30)',
                borderRadius: 9,
                fontSize: 12,
                color: '#b91c1c',
              }}>
                {error}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 6 }}>
              <button
                type="button"
                onClick={() => onClose?.()}
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
                type="submit"
                disabled={!validEmail || submitting}
                style={{
                  padding: '10px 18px',
                  background: (!validEmail || submitting) ? 'var(--color-border)' : 'var(--color-accent)',
                  border: 'none', color: 'white',
                  borderRadius: 9,
                  font: '700 13px Urbanist, sans-serif',
                  cursor: (!validEmail || submitting) ? 'not-allowed' : 'pointer',
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                }}
              >
                <PaperAirplaneIcon style={{ width: 14, height: 14 }} />
                {submitting ? 'Sending…' : 'Send for review'}
              </button>
            </div>
          </form>
        ) : (
          <div style={{ padding: '18px 24px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{
              padding: '12px 14px',
              background: 'rgba(16,185,129,0.07)',
              border: '1px solid rgba(16,185,129,0.30)',
              borderRadius: 10,
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <CheckIcon style={{ width: 18, height: 18, color: '#047857', flexShrink: 0 }} />
              <div style={{ fontSize: 13, color: 'var(--color-text)' }}>
                Sent to <strong>{email}</strong>.
              </div>
            </div>

            <Field label="Shareable review link">
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  type="text"
                  readOnly
                  value={shareUrl}
                  onFocus={(e) => e.target.select()}
                  style={{ ...inputStyle, fontFamily: "'JetBrains Mono', monospace", fontSize: 12, flex: 1 }}
                />
                <button
                  type="button"
                  onClick={copyLink}
                  style={{
                    padding: '0 12px',
                    background: copied ? '#10b981' : 'var(--color-text)',
                    color: copied ? 'white' : 'var(--color-bg)',
                    border: 'none',
                    borderRadius: 9,
                    font: '700 12px Urbanist, sans-serif',
                    cursor: 'pointer',
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {copied ? <CheckIcon style={{ width: 12, height: 12 }} /> : <ClipboardDocumentIcon style={{ width: 12, height: 12 }} />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
            </Field>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
              <button
                type="button"
                onClick={() => onClose?.()}
                style={{
                  padding: '10px 22px',
                  background: 'var(--color-accent)',
                  border: 'none', color: 'white',
                  borderRadius: 9,
                  font: '700 13px Urbanist, sans-serif',
                  cursor: 'pointer',
                }}
              >
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function Field({ label, optional, children }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{
        font: '700 10px Urbanist, sans-serif',
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: 'var(--color-text-muted)',
      }}>
        {label}
        {optional && <span style={{ marginLeft: 6, fontWeight: 600, opacity: 0.75 }}>optional</span>}
      </span>
      {children}
    </label>
  )
}

const inputStyle = {
  width: '100%',
  background: 'var(--color-bg)',
  border: '1px solid var(--color-border)',
  borderRadius: 9,
  padding: '10px 12px',
  font: '400 14px Urbanist, sans-serif',
  color: 'var(--color-text)',
  outline: 'none',
}

function defaultMessageBody({ name }) {
  const greet = name?.split(/\s+/)?.[0] ? `Hi ${name.split(/\s+/)[0]},` : 'Hi,'
  return [
    greet,
    '',
    "I've put together the brief for our project. Could you take a few minutes to read through it and let me know if it captures what you have in mind?",
    '',
    'Add a comment to any section if something is off, or approve when you are happy with it.',
    '',
    'Thanks.',
  ].join('\n')
}
