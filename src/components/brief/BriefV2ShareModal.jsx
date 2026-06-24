// ────────────────────────────────────────────────────────────────────
// BriefV2ShareModal, designer-facing modal for sending a brief to
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
  const [copyingLink, setCopyingLink] = useState(false)
  const [linkToast, setLinkToast] = useState('') // toast message after copy
  const [error, setError] = useState('')
  const [emailStatus, setEmailStatus] = useState(null) // { sent, error }
  const firstFieldRef = useRef(null)

  // Reset state every time the modal opens fresh.
  useEffect(() => {
    if (open) {
      setEmail(defaultClientEmail)
      setName(defaultClientName)
      // Restored the friendly default, designers can edit or wipe
      // it. If left as-is, it shows in the blockquote on the
      // client's review page as the personal message.
      setMessage(defaultMessage || defaultMessageBody({ name: defaultClientName }))
      setShareUrl('')
      setCopied(false)
      setLinkToast('')
      setError('')
      setEmailStatus(null)
      // Defer focus so the modal mount completes first.
      setTimeout(() => firstFieldRef.current?.focus(), 30)
      // Auto-generate the shareable URL in the background so the
      // designer sees the link the moment the modal renders.
      // Errors are swallowed here so a transient backend hiccup
      // doesn't show a red banner on a successful modal open -
      // the Copy button will retry on click and surface any error
      // then.
      ;(async () => {
        try {
          const { data: { session } } = await supabase.auth.getSession()
          const tok = session?.access_token
          if (!tok) return
          const apiUrl = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')
          const res = await fetch(`${apiUrl}/api/brief-reviews/quick-link`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
            body: JSON.stringify({
              project_id: projectId,
              intake_submission_id: intakeSubmissionId,
            }),
          })
          const body = await res.json().catch(() => ({}))
          if (res.ok && body?.share_url) setShareUrl(body.share_url)
        } catch { /* swallow, retry on Copy click */ }
      })()
    }
  }, [open, defaultClientEmail, defaultClientName, defaultMessage, projectId, intakeSubmissionId])

  // Esc-to-close.
  useEffect(() => {
    if (!open) return
    function onKey(e) { if (e.key === 'Escape' && !submitting) onClose?.() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, submitting, onClose])

  if (!open) return null

  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())

  // Send the email-based review invite. The form must have a
  // valid email when this fires.
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
      setEmailStatus(body.email || null)
      setSubmitting(false)
    } catch (err) {
      console.error('[BriefV2ShareModal] create failed', err)
      setError(err?.message || 'Could not send. Try again.')
      setSubmitting(false)
    }
  }

  // Copy the share URL without going through the email flow.
  // Generates a token on demand (via /quick-link) the first time;
  // subsequent clicks reuse the cached URL. Shows a toast message
  // and stays on the same screen.
  async function handleCopyLink() {
    if (copyingLink) return
    setCopyingLink(true)
    setError('')
    try {
      let url = shareUrl
      if (!url) {
        const { data: { session } } = await supabase.auth.getSession()
        const tok = session?.access_token
        if (!tok) {
          setError('You need to be signed in to copy a link.')
          setCopyingLink(false)
          return
        }
        const apiUrl = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')
        const res = await fetch(`${apiUrl}/api/brief-reviews/quick-link`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
          body: JSON.stringify({
            project_id: projectId,
            intake_submission_id: intakeSubmissionId,
          }),
        })
        const body = await res.json().catch(() => ({}))
        if (!res.ok || !body?.share_url) {
          setError(body?.message || body?.error || 'Could not generate link.')
          setCopyingLink(false)
          return
        }
        url = body.share_url
        setShareUrl(url)
      }
      // navigator.clipboard requires HTTPS / localhost. Fall back
      // silently if it throws, the toast still tells the user
      // the link exists.
      try { await navigator.clipboard.writeText(url) } catch {}
      setLinkToast('Review link copied. Share it anywhere you like.')
      setTimeout(() => setLinkToast(''), 2400)
    } catch (err) {
      console.error('[BriefV2ShareModal] copy link failed', err)
      setError(err?.message || 'Could not generate link.')
    } finally {
      setCopyingLink(false)
    }
  }

  // Back-compat: kept for the success view's copy button.
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
        {!emailStatus ? (
          <form onSubmit={handleSend} style={{ padding: '18px 24px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Shareable link, auto-loaded on modal open. Designer
                can copy + send via any channel without filling the
                form. */}
            <Field label="Shareable link">
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  type="text"
                  readOnly
                  value={shareUrl || 'Generating link…'}
                  onFocus={(e) => shareUrl && e.target.select()}
                  style={{
                    ...inputStyle,
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 12,
                    flex: 1,
                    color: shareUrl ? 'var(--color-text)' : 'var(--color-text-muted)',
                  }}
                />
                <button
                  type="button"
                  onClick={handleCopyLink}
                  disabled={copyingLink || !shareUrl}
                  title="Copy review link"
                  style={{
                    padding: '0 14px',
                    background: linkToast ? '#10b981' : 'var(--color-text)',
                    color: linkToast ? 'white' : 'var(--color-bg)',
                    border: 'none',
                    borderRadius: 9,
                    font: '700 12px Urbanist, sans-serif',
                    cursor: (copyingLink || !shareUrl) ? 'not-allowed' : 'pointer',
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                    whiteSpace: 'nowrap',
                    opacity: (copyingLink || !shareUrl) ? 0.7 : 1,
                  }}
                >
                  {linkToast
                    ? <><CheckIcon style={{ width: 12, height: 12 }} /> Copied</>
                    : <><ClipboardDocumentIcon style={{ width: 12, height: 12 }} /> Copy</>
                  }
                </button>
              </div>
              {linkToast && (
                <p style={{
                  margin: '6px 0 0',
                  fontSize: 11,
                  color: '#047857',
                }}>
                  {linkToast}
                </p>
              )}
            </Field>
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
            {emailStatus?.sent !== false ? (
              <div style={{
                padding: '12px 14px',
                background: 'rgba(16,185,129,0.07)',
                border: '1px solid rgba(16,185,129,0.30)',
                borderRadius: 10,
                display: 'flex', alignItems: 'flex-start', gap: 10,
              }}>
                <CheckIcon style={{ width: 18, height: 18, color: '#047857', flexShrink: 0, marginTop: 1 }} />
                <div style={{ fontSize: 13, color: 'var(--color-text)', lineHeight: 1.5 }}>
                  Sent to <strong>{email}</strong>.{' '}
                  <span style={{ color: 'var(--color-text-muted)' }}>
                    If it doesn't arrive in 1-2 minutes, check the spam folder, and copy the link below as a backup.
                  </span>
                </div>
              </div>
            ) : (
              <div style={{
                padding: '12px 14px',
                background: 'rgba(245,158,11,0.16)',
                border: '1px solid rgba(180,83,9,0.55)',
                borderRadius: 10,
                display: 'flex', alignItems: 'flex-start', gap: 10,
              }}>
                <span style={{ fontSize: 18, lineHeight: 1, marginTop: 1 }}>⚠</span>
                <div style={{ fontSize: 13, color: 'var(--color-text)', lineHeight: 1.5 }}>
                  Email didn't go out: <strong>{emailStatus.error || 'unknown error'}</strong>.
                  The review link below still works, copy and send it manually.
                </div>
              </div>
            )}

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

// Default body used to pre-fill the message textarea so the modal
// is ready to send with one click. Designer can edit or wipe it.
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
