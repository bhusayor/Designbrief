import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import {
  XMarkIcon, EnvelopeIcon, UserIcon, SparklesIcon,
  ClipboardDocumentIcon, CheckIcon,
} from '@heroicons/react/24/outline'

// PROJECT-LEVEL invite modal. Used inside TeamCollab so users invite
// collaborators to A SPECIFIC PROJECT (not to the whole workspace).
//
// Server endpoint: POST /api/invite { action:'send_project', projectId, email, name, jobRole }
// Token link format: /join/:token (handled by JoinPage)
//
// New invitee flow: signup → create own workspace → land on join page
//                   → handleAcceptInvite inserts team_members row.
// Existing invitee flow: auto-accept on landing.
export default function ProjectInviteModal({
  projectId, projectName, onClose, defaultRole = 'Collaborator',
}) {
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [role, setRole] = useState(defaultRole)
  const [sending, setSending] = useState(false)
  const [sentLink, setSentLink] = useState(null)
  const [error, setError] = useState(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function handleSend() {
    const trimmed = email.trim().toLowerCase()
    if (!trimmed) { setError('Email is required'); return }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) { setError('Invalid email'); return }
    if (!projectId) { setError('Missing project'); return }

    setSending(true)
    setError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) { setError('Sign in required'); return }

      const res = await fetch('/api/invite', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action: 'send_project',
          projectId,
          email: trimmed,
          name: name.trim(),
          jobRole: role,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'Failed to send invite')
        return
      }
      setSentLink(data.inviteUrl)
    } catch (e) {
      setError(e.message)
    } finally {
      setSending(false)
    }
  }

  async function copyLink() {
    if (!sentLink) return
    try {
      await navigator.clipboard.writeText(sentLink)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {}
  }

  function resetForm() {
    setSentLink(null)
    setEmail('')
    setName('')
    setRole(defaultRole)
    setError(null)
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 600,
        background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20, animation: 'tdmFade 0.18s ease',
      }}>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 460,
          background: 'var(--color-bg)',
          border: '1px solid var(--color-border)',
          borderRadius: 16, padding: 24,
          boxShadow: '0 24px 64px rgba(0,0,0,0.3)',
        }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 9,
            background: 'var(--color-accent-soft)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <UserIcon style={{ width: 16, height: 16, color: 'var(--color-accent)' }} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: 'var(--font-sans)', fontWeight: 800, fontSize: 17, color: 'var(--color-text)' }}>
              Invite to project
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-text-muted)' }}>
              {projectName || 'this project'}
            </div>
          </div>
          <button onClick={onClose} style={{
            background: 'transparent', border: 'none', padding: 6, borderRadius: 7,
            color: 'var(--color-text-muted)', cursor: 'pointer',
            display: 'flex', alignItems: 'center',
          }}>
            <XMarkIcon style={{ width: 16, height: 16 }} />
          </button>
        </div>

        <p style={{
          fontFamily: 'var(--font-sans)', fontSize: 12,
          color: 'var(--color-text-muted)', margin: '10px 0 18px', lineHeight: 1.55,
        }}>
          They'll join just this project, they keep (or create) their own workspace.
        </p>

        {/* SUCCESS STATE */}
        {sentLink ? (
          <div>
            <div style={{
              padding: '14px 16px', borderRadius: 12,
              background: 'var(--color-accent-soft)',
              border: '1px solid rgba(13,148,136,0.25)',
              fontFamily: 'var(--font-sans)', fontSize: 13,
              color: 'var(--color-accent)', marginBottom: 14,
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <SparklesIcon style={{ width: 14, height: 14 }} />
              Invite sent to <strong>{email}</strong>
            </div>

            <label style={labelStyle()}>Or share this link</label>
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              <input
                readOnly
                value={sentLink}
                onClick={e => e.target.select()}
                style={{
                  ...inputStyle(),
                  flex: 1, fontFamily: 'var(--font-mono)', fontSize: 11,
                }}
              />
              <button onClick={copyLink} style={{
                background: copied ? 'var(--color-accent)' : 'var(--color-text)',
                color: copied ? 'var(--color-accent-text)' : 'var(--color-bg)',
                border: 'none', borderRadius: 9, padding: '0 14px',
                fontFamily: 'var(--font-sans)', fontSize: 12, fontWeight: 700,
                cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 5,
              }}>
                {copied ? <CheckIcon style={{ width: 13, height: 13 }} /> : <ClipboardDocumentIcon style={{ width: 13, height: 13 }} />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={resetForm} style={btnSecondary()}>Invite another</button>
              <button onClick={onClose} style={btnPrimary()}>Done</button>
            </div>
          </div>
        ) : (
          /* FORM */
          <div>
            <label style={labelStyle()}>Email address</label>
            <div style={{ position: 'relative', marginBottom: 14 }}>
              <EnvelopeIcon style={{
                position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
                width: 14, height: 14, color: 'var(--color-text-muted)', pointerEvents: 'none',
              }} />
              <input
                autoFocus type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="colleague@company.com"
                style={{ ...inputStyle(), paddingLeft: 36 }}
              />
            </div>

            <label style={labelStyle()}>Name <span style={optional()}>(optional)</span></label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="What should we call them?"
              style={{ ...inputStyle(), marginBottom: 14 }}
            />

            <label style={labelStyle()}>Role</label>
            <input
              type="text"
              value={role}
              onChange={e => setRole(e.target.value)}
              placeholder="e.g. Designer, Developer, PM"
              style={{ ...inputStyle(), marginBottom: 16 }}
            />

            {error && (
              <div style={{
                background: 'rgba(239,68,68,0.08)', color: '#EF4444',
                border: '1px solid rgba(239,68,68,0.25)', borderRadius: 9,
                padding: '8px 12px', fontFamily: 'var(--font-sans)', fontSize: 12,
                marginBottom: 14,
              }}>{error}</div>
            )}

            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={onClose} style={btnSecondary()}>Cancel</button>
              <button onClick={handleSend} disabled={sending || !email.trim()} style={{
                ...btnPrimary(),
                opacity: sending || !email.trim() ? 0.55 : 1,
                cursor: sending || !email.trim() ? 'default' : 'pointer',
              }}>
                {sending ? 'Sending...' : 'Send invite'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── tiny style helpers ──────────────────────────────────────────────────────
function inputStyle() {
  return {
    width: '100%', boxSizing: 'border-box',
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: 9, padding: '10px 12px',
    fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--color-text)',
    outline: 'none',
  }
}
function labelStyle() {
  return {
    display: 'block',
    fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700,
    color: 'var(--color-text-muted)', letterSpacing: '0.08em',
    textTransform: 'uppercase', marginBottom: 6,
  }
}
function optional() {
  return {
    fontFamily: 'var(--font-sans)', fontSize: 10, fontWeight: 500,
    color: 'var(--color-text-muted)', letterSpacing: 0, textTransform: 'none',
    marginLeft: 4,
  }
}
function btnPrimary() {
  return {
    flex: 1, padding: '10px 14px',
    background: 'var(--color-text)', color: 'var(--color-bg)',
    border: 'none', borderRadius: 9,
    fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 700,
    cursor: 'pointer',
  }
}
function btnSecondary() {
  return {
    flex: 1, padding: '10px 14px',
    background: 'var(--color-surface)', color: 'var(--color-text-muted)',
    border: '1px solid var(--color-border)', borderRadius: 9,
    fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 600,
    cursor: 'pointer',
  }
}
