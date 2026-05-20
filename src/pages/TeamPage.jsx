import React, { useState, useEffect, useRef, useCallback } from 'react'
import ReactDOM from 'react-dom'
import { useApp } from '../context/AppContext'
import { supabase } from '../lib/supabase'
import ConfirmDeleteModal from '../components/ConfirmDeleteModal'
import {
  XMarkIcon,
  MagnifyingGlassIcon,
  ArrowDownTrayIcon,
  LinkIcon,
  UserPlusIcon,
  TrashIcon,
  CheckCircleIcon,
  ClockIcon,
  ExclamationCircleIcon,
  EnvelopeIcon,
  ChevronDownIcon,
  ArrowPathIcon,
  EllipsisHorizontalIcon,
  CurrencyDollarIcon,
} from '@heroicons/react/24/outline'

// ── Helpers ──────────────────────────────────────────────────────────────────

function getInitials(name) {
  if (!name) return '?'
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

function getAvatarColor(name) {
  const colors = [
    { bg: 'rgba(124,58,237,0.12)',  color: '#7C3AED' },
    { bg: 'rgba(16,163,127,0.12)', color: '#10a37f' },
    { bg: 'rgba(14,165,233,0.12)', color: '#0EA5E9' },
    { bg: 'rgba(236,72,153,0.12)', color: '#EC4899' },
    { bg: 'rgba(245,158,11,0.12)', color: '#F59E0B' },
  ]
  const i = (name?.charCodeAt(0) || 0) % colors.length
  return colors[i]
}

function Avatar({ name, size = 32 }) {
  const { bg, color } = getAvatarColor(name)
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: bg,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'var(--font-sans)', fontWeight: 700,
      fontSize: size * 0.35, color, flexShrink: 0,
    }}>
      {getInitials(name)}
    </div>
  )
}

function RoleBadge({ role }) {
  const r = String(role || '').toLowerCase()
  const styles = {
    // Workspace-level
    owner:   { bg: 'rgba(245,158,11,0.1)',  color: '#92400E', border: 'rgba(245,158,11,0.3)', label: 'Owner' },
    admin:   { bg: 'rgba(124,58,237,0.1)',  color: '#7C3AED', border: 'rgba(124,58,237,0.25)', label: 'Admin' },
    member:  { bg: 'var(--color-surface)',  color: 'var(--color-text-muted)', border: 'var(--color-border)', label: 'Member' },
    // Project-level
    pm:      { bg: 'rgba(124,58,237,0.1)',  color: '#7C3AED', border: 'rgba(124,58,237,0.25)', label: 'Project Manager' },
    'team member':  { bg: 'var(--color-surface)',  color: 'var(--color-text-muted)', border: 'var(--color-border)', label: 'Team Member' },
    contributor:    { bg: 'var(--color-surface)',  color: 'var(--color-text-muted)', border: 'var(--color-border)', label: 'Contributor' },
    viewer:  { bg: 'rgba(14,165,233,0.10)', color: '#0369A1', border: 'rgba(14,165,233,0.25)', label: 'Viewer' },
    guest:   { bg: 'rgba(14,165,233,0.10)', color: '#0369A1', border: 'rgba(14,165,233,0.25)', label: 'Guest' },
  }
  const s = styles[r] || { ...styles.member, label: role || 'Member' }
  return (
    <span style={{
      fontFamily: 'var(--font-sans)', fontSize: 11, fontWeight: 600,
      background: s.bg, color: s.color, border: '1px solid ' + s.border,
      borderRadius: 100, padding: '2px 9px',
      letterSpacing: '0.01em',
    }}>
      {s.label}
    </span>
  )
}

// Inline role picker — used in the project members table by the Admin to
// switch a member between Admin / Editor / Viewer. Visually mirrors
// RoleBadge when collapsed.
function RoleSelect({ value, onChange }) {
  const v = value === 'Admin' ? 'Admin'
    : value === 'Viewer' ? 'Viewer'
    : 'Editor'
  const palette = {
    Admin:  { bg: 'rgba(124,58,237,0.10)', text: '#7C3AED', border: 'rgba(124,58,237,0.30)' },
    Editor: { bg: 'var(--color-surface)',  text: 'var(--color-text-muted)', border: 'var(--color-border)' },
    Viewer: { bg: 'rgba(14,165,233,0.10)', text: '#0369A1', border: 'rgba(14,165,233,0.25)' },
  }
  const colors = palette[v]
  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <select
        value={v}
        onChange={e => onChange?.(e.target.value)}
        style={{
          appearance: 'none', WebkitAppearance: 'none',
          fontFamily: 'var(--font-sans)', fontSize: 11, fontWeight: 600,
          background: colors.bg, color: colors.text,
          border: '1px solid ' + colors.border,
          borderRadius: 100, padding: '2px 22px 2px 9px',
          cursor: 'pointer', outline: 'none',
        }}
      >
        <option value="Admin">Admin</option>
        <option value="Editor">Editor</option>
        <option value="Viewer">Viewer</option>
      </select>
      <ChevronDownIcon style={{
        position: 'absolute', right: 6, top: '50%',
        transform: 'translateY(-50%)',
        width: 11, height: 11, color: colors.text, pointerEvents: 'none',
      }} />
    </div>
  )
}

// Small modal the Admin uses to set a per-project credit ceiling for a member.
// Empty input clears the limit (∞). Closes on Escape, backdrop click, and Save.
function CreditLimitModal({ member, onClose, onSave }) {
  const [value, setValue] = useState(
    member?.creditLimit != null ? String(member.creditLimit) : ''
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function handleSave() {
    setError('')
    const trimmed = value.trim()
    let parsed = null
    if (trimmed !== '') {
      const n = Number(trimmed)
      if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
        setError('Enter a whole number ≥ 0, or leave blank for no limit.')
        return
      }
      parsed = n
    }
    setSaving(true)
    try {
      await onSave(parsed)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 700,
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
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <div style={{
                width: 26, height: 26, borderRadius: 7,
                background: 'rgba(124,58,237,0.10)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <CurrencyDollarIcon style={{ width: 14, height: 14, color: '#7C3AED' }} />
              </div>
              <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--color-text)' }}>
                Set credit limit
              </div>
            </div>
            <div style={{ fontSize: 12, color: 'var(--color-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              For <strong style={{ color: 'var(--color-text)' }}>{member?.name || member?.email}</strong>
            </div>
          </div>
          <button onClick={onClose} style={{
            width: 28, height: 28, borderRadius: 8, background: 'transparent', border: 'none',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--color-text-muted)', flexShrink: 0,
          }}>
            <XMarkIcon style={{ width: 15, height: 15 }} />
          </button>
        </div>

        <div style={{ padding: '16px 22px 20px' }}>
          <label style={{
            display: 'block', fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700,
            letterSpacing: '0.08em', textTransform: 'uppercase',
            color: 'var(--color-text-muted)', marginBottom: 6,
          }}>
            Total credit
          </label>
          <input
            type="number"
            min="0"
            step="1"
            value={value}
            onChange={e => { setValue(e.target.value); setError('') }}
            onKeyDown={e => { if (e.key === 'Enter') handleSave() }}
            placeholder="Leave blank for no limit"
            autoFocus
            style={{
              width: '100%', background: 'var(--color-surface)',
              border: '1px solid var(--color-border)', borderRadius: 10,
              padding: '10px 12px', fontFamily: 'var(--font-sans)',
              fontSize: 13, color: 'var(--color-text)', outline: 'none',
              boxSizing: 'border-box',
            }}
            onFocus={e => { e.target.style.borderColor = '#7C3AED'; e.target.style.boxShadow = '0 0 0 3px rgba(124,58,237,0.12)' }}
            onBlur={e => { e.target.style.borderColor = 'var(--color-border)'; e.target.style.boxShadow = 'none' }}
          />
          <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 6 }}>
            Max number of AI credits this member can spend on this project.
          </div>

          {error && (
            <div style={{
              marginTop: 12, padding: '8px 12px',
              background: '#FEF2F2', border: '1px solid #FECACA',
              borderRadius: 8, fontSize: 12, color: '#DC2626',
            }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 18 }}>
            <button onClick={onClose} style={{
              padding: '9px 18px', background: 'transparent', border: '1px solid var(--color-border)',
              borderRadius: 9, cursor: 'pointer', fontFamily: 'var(--font-sans)',
              fontSize: 13, fontWeight: 600, color: 'var(--color-text-muted)',
            }}>
              Cancel
            </button>
            <button onClick={handleSave} disabled={saving} style={{
              padding: '9px 20px',
              background: saving ? 'var(--color-border)' : '#7C3AED',
              color: 'white', border: 'none', borderRadius: 9,
              cursor: saving ? 'not-allowed' : 'pointer',
              fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 700,
            }}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function StatusBadge({ status }) {
  if (status === 'pending') return (
    <span style={{
      fontFamily: 'var(--font-sans)', fontSize: 11, fontWeight: 600,
      background: 'rgba(245,158,11,0.1)', color: '#92400E',
      border: '1px solid rgba(245,158,11,0.3)',
      borderRadius: 100, padding: '2px 9px',
      display: 'inline-flex', alignItems: 'center', gap: 4,
    }}>
      <ClockIcon style={{ width: 10, height: 10 }} />
      Pending
    </span>
  )
  return (
    <span style={{
      fontFamily: 'var(--font-sans)', fontSize: 11, fontWeight: 600,
      background: 'rgba(22,163,74,0.1)', color: '#15803d',
      border: '1px solid rgba(22,163,74,0.25)',
      borderRadius: 100, padding: '2px 9px',
      display: 'inline-flex', alignItems: 'center', gap: 4,
    }}>
      <CheckCircleIcon style={{ width: 10, height: 10 }} />
      Active
    </span>
  )
}

// ── Invite Modal (inner) ──────────────────────────────────────────────────────

function InviteModal({ workspaceId, projectId, projectName, onClose, onSent, getHeaders }) {
  const [emails, setEmails] = useState('')
  const [role, setRole] = useState('member')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // When projectId is supplied, this modal sends PROJECT-level invites
  // (action='send_project', writes team_invites, /join/:token link).
  // Otherwise it falls back to WORKSPACE-level invites (the old behaviour).
  const isProjectMode = !!projectId

  // Default role: PM/Team Member/Viewer for project, Member for workspace
  useEffect(() => {
    setRole(isProjectMode ? 'Editor' : 'member')
  }, [isProjectMode])

  async function handleSend() {
    const emailList = emails.split(',').map(e => e.trim()).filter(Boolean)
    if (!emailList.length) { setError('Enter at least one email'); return }
    const invalid = emailList.filter(e => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))
    if (invalid.length) { setError('Invalid email: ' + invalid.join(', ')); return }

    setLoading(true); setError(''); setSuccess('')
    try {
      let authH = {}
      try {
        authH = getHeaders ? await getHeaders() : {}
      } catch (authErr) {
        setError(authErr.message || 'Session expired. Please refresh the page and sign in again.')
        return
      }

      const body = isProjectMode
        ? { action: 'send_project', projectId, jobRole: role }
        : { action: 'send', workspaceId, role }

      const results = await Promise.allSettled(
        emailList.map(email =>
          fetch('/api/invite', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authH },
            body: JSON.stringify({ ...body, email }),
          }).then(r => r.json())
        )
      )

      const sent = results.filter(r => r.status === 'fulfilled' && r.value.success).length
      const failed = results.length - sent

      if (sent > 0) {
        setSuccess(sent + ' invite' + (sent > 1 ? 's' : '') + ' sent' + (failed > 0 ? ', ' + failed + ' failed' : ''))
        setEmails('')
        onSent?.()
      } else {
        const reason = results[0]?.value?.error
          || results[0]?.reason?.message
          || 'Failed to send invite — check your connection and try again'
        setError(reason)
      }
    } catch (e) {
      setError(e?.message || 'Unexpected error sending invite')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.5)', zIndex: 600,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20, backdropFilter: 'blur(4px)',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--color-bg)', border: '1px solid var(--color-border)',
          borderRadius: 16, width: '100%', maxWidth: 440,
          fontFamily: 'var(--font-sans)', overflow: 'hidden',
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '18px 22px 14px', borderBottom: '1px solid var(--color-border)',
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16, letterSpacing: '-0.02em', color: 'var(--color-text)', marginBottom: 3 }}>
              {isProjectMode ? 'Invite to project' : 'Invite members'}
            </div>
            <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
              {isProjectMode
                ? <>Add collaborators to <strong style={{ color: 'var(--color-text)' }}>{projectName || 'this project'}</strong> by email</>
                : 'Invite members to your workspace by email'}
            </div>
          </div>
          <button onClick={onClose} style={{
            width: 28, height: 28, borderRadius: 8, background: 'transparent', border: 'none',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--color-text-muted)', flexShrink: 0,
          }}>
            <XMarkIcon style={{ width: 15, height: 15 }} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '16px 22px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{
              display: 'block', fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700,
              letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-text-muted)', marginBottom: 6,
            }}>
              Email address
            </label>
            <div style={{ position: 'relative' }}>
              <EnvelopeIcon style={{
                position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)',
                width: 14, height: 14, color: 'var(--color-text-muted)', pointerEvents: 'none',
              }} />
              <input
                type="text" value={emails}
                onChange={e => { setEmails(e.target.value); setError(''); setSuccess('') }}
                onKeyDown={e => { if (e.key === 'Enter') handleSend() }}
                placeholder="email@example.com, another@example.com"
                autoFocus
                style={{
                  width: '100%', background: 'var(--color-surface)',
                  border: '1px solid var(--color-border)', borderRadius: 10,
                  padding: '10px 12px 10px 32px', fontFamily: 'var(--font-sans)',
                  fontSize: 13, color: 'var(--color-text)', outline: 'none',
                  boxSizing: 'border-box', transition: 'all 0.15s',
                }}
                onFocus={e => { e.target.style.borderColor = '#7C3AED'; e.target.style.boxShadow = '0 0 0 3px rgba(124,58,237,0.12)' }}
                onBlur={e => { e.target.style.borderColor = 'var(--color-border)'; e.target.style.boxShadow = 'none' }}
              />
            </div>
            <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 4 }}>
              Separate multiple emails with a comma
            </div>
          </div>

          <div>
            <label style={{
              display: 'block', fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700,
              letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-text-muted)', marginBottom: 6,
            }}>
              Role
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {(isProjectMode ? [
                { value: 'Admin',  label: 'Admin',  desc: 'Full control. Invite members, manage roles, delete project.' },
                { value: 'Editor', label: 'Editor', desc: 'Edit brief, create and move tasks, add comments.' },
                { value: 'Viewer', label: 'Viewer', desc: 'Read-only access. Can comment but not edit.' },
              ] : [
                { value: 'member', label: 'Member',        desc: 'View and work on projects' },
                { value: 'admin',  label: 'Administrator', desc: 'Manages billing, integrations, permissions, and workflows' },
              ]).map(opt => (
                <label key={opt.value} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '9px 12px',
                  border: '1px solid ' + (role === opt.value ? '#7C3AED' : 'var(--color-border)'),
                  background: role === opt.value ? 'rgba(124,58,237,0.06)' : 'var(--color-surface)',
                  borderRadius: 9, cursor: 'pointer', transition: 'all 0.15s',
                }}>
                  <input type="radio" name="role" value={opt.value} checked={role === opt.value}
                    onChange={() => setRole(opt.value)}
                    style={{ accentColor: '#7C3AED', flexShrink: 0 }}
                  />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--color-text)' }}>{opt.label}</div>
                    <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{opt.desc}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {error && (
            <div style={{ padding: '8px 12px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, fontSize: 12, color: '#DC2626', display: 'flex', gap: 6, alignItems: 'flex-start' }}>
              <ExclamationCircleIcon style={{ width: 13, height: 13, flexShrink: 0, marginTop: 1 }} />
              {error}
            </div>
          )}
          {success && (
            <div style={{ padding: '8px 12px', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 8, fontSize: 12, color: '#16a34a', display: 'flex', gap: 6, alignItems: 'center' }}>
              <CheckCircleIcon style={{ width: 13, height: 13 }} />
              {success}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 4 }}>
            <button onClick={onClose} style={{
              padding: '9px 18px', background: 'transparent', border: '1px solid var(--color-border)',
              borderRadius: 9, cursor: 'pointer', fontFamily: 'var(--font-sans)',
              fontSize: 13, fontWeight: 600, color: 'var(--color-text-muted)',
            }}>
              Cancel
            </button>
            <button onClick={handleSend} disabled={loading || !emails.trim()} style={{
              padding: '9px 20px',
              background: loading || !emails.trim() ? 'var(--color-border)' : '#7C3AED',
              color: 'white', border: 'none', borderRadius: 9,
              cursor: loading || !emails.trim() ? 'not-allowed' : 'pointer',
              fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 700, transition: 'all 0.15s',
            }}>
              {loading ? 'Sending...' : 'Send invite'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Invite Link Popup ─────────────────────────────────────────────────────────

function InviteLinkPopup({ workspaceId, workspaceName, projectId, projectName, getHeaders, onClose }) {
  // When projectId is supplied, the popup generates a PROJECT-level invite link
  // (writes team_invites, /join/:token). Otherwise it falls back to WORKSPACE
  // link behaviour (workspace_invites, /invite/:token).
  const isProjectMode = !!projectId

  // For workspace links the role is member|admin. For project links the
  // invite-link role is Admin, Editor or Viewer. Default to Editor.
  const [role, setRole] = useState(isProjectMode ? 'Editor' : 'member')
  const [linkData, setLinkData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const popupRef = useRef(null)

  useEffect(() => {
    function handler(e) {
      if (popupRef.current && !popupRef.current.contains(e.target)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  const generateLink = useCallback(async (r) => {
    setLoading(true)
    setLinkData(null)
    try {
      const h = await getHeaders()
      const body = isProjectMode
        ? { action: 'create_project_link', projectId, jobRole: r }
        : { action: 'create_link', workspaceId, role: r }
      const res = await fetch('/api/invite', {
        method: 'POST', headers: h,
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (res.ok) setLinkData(data)
    } catch {}
    finally { setLoading(false) }
  }, [isProjectMode, projectId, workspaceId, getHeaders])

  useEffect(() => { generateLink(role) }, [role])

  async function copyLink() {
    if (!linkData?.link) return
    try { await navigator.clipboard.writeText(linkData.link) } catch {
      const el = document.createElement('input')
      el.value = linkData.link
      document.body.appendChild(el); el.select(); document.execCommand('copy'); document.body.removeChild(el)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function daysLeft(expiresAt) {
    if (!expiresAt) return ''
    const days = Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86400000)
    if (days <= 0) return 'Expired'
    if (days === 1) return 'Expires tomorrow'
    return `Expires in ${days} days`
  }

  return (
    <div ref={popupRef} style={{
      position: 'absolute', top: 'calc(100% + 8px)', right: 0,
      width: 340, background: 'var(--color-card)',
      border: '1px solid var(--color-border)', borderRadius: 14,
      boxShadow: 'var(--shadow-lg)', zIndex: 100, padding: '18px 18px 16px',
      fontFamily: 'var(--font-sans)',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <div style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(124,58,237,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <LinkIcon style={{ width: 14, height: 14, color: '#7C3AED' }} />
          </div>
          <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--color-text)' }}>Invite link</span>
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', padding: 2, display: 'flex' }}>
          <XMarkIcon style={{ width: 14, height: 14 }} />
        </button>
      </div>

      {/* Description */}
      <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: '0 0 14px', lineHeight: 1.6 }}>
        {isProjectMode ? (
          <>
            Anyone with this link can join the project{' '}
            <strong style={{ color: 'var(--color-text)', fontWeight: 600 }}>{projectName || 'this project'}</strong>{' '}
            as the selected role. They keep (or create) their own workspace.
          </>
        ) : (
          <>
            Anyone with this link can join{' '}
            <strong style={{ color: 'var(--color-text)', fontWeight: 600 }}>{workspaceName}</strong>{' '}
            as the selected role.
          </>
        )}
      </p>

      {/* Role picker — titles + one-line descriptions */}
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-text-muted)', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
          Join as
        </label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {(isProjectMode ? [
            { value: 'Admin',  label: 'Admin',  desc: 'Full control. Invite, manage roles, delete project.' },
            { value: 'Editor', label: 'Editor', desc: 'Edit brief, create and move tasks, comment.' },
            { value: 'Viewer', label: 'Viewer', desc: 'Read-only. Can comment but not edit.' },
          ] : [
            { value: 'member', label: 'Member',        desc: 'View and work on projects.' },
            { value: 'admin',  label: 'Administrator', desc: 'Manages billing, integrations, permissions.' },
          ]).map(opt => {
            const selected = role === opt.value
            return (
              <button key={opt.value} type="button" onClick={() => setRole(opt.value)} style={{
                textAlign: 'left', cursor: 'pointer',
                display: 'flex', alignItems: 'flex-start', gap: 9,
                padding: '8px 10px',
                border: '1px solid ' + (selected ? '#7C3AED' : 'var(--color-border)'),
                background: selected ? 'rgba(124,58,237,0.06)' : 'var(--color-surface)',
                borderRadius: 9, transition: 'all 0.15s',
              }}>
                <span style={{
                  flexShrink: 0, marginTop: 2,
                  width: 14, height: 14, borderRadius: '50%',
                  border: '1.5px solid ' + (selected ? '#7C3AED' : 'var(--color-border)'),
                  background: selected ? '#7C3AED' : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {selected && <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#fff' }} />}
                </span>
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span style={{ display: 'block', fontFamily: 'var(--font-sans)', fontWeight: 600, fontSize: 13, color: 'var(--color-text)' }}>
                    {opt.label}
                  </span>
                  <span style={{ display: 'block', fontFamily: 'var(--font-sans)', fontSize: 11, color: 'var(--color-text-muted)', lineHeight: 1.45, marginTop: 1 }}>
                    {opt.desc}
                  </span>
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Link preview */}
      <div style={{
        background: 'var(--color-surface)', border: '1px solid var(--color-border)',
        borderRadius: 9, padding: '8px 12px', marginBottom: 8,
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <LinkIcon style={{ width: 12, height: 12, color: 'var(--color-text-muted)', flexShrink: 0 }} />
        <span style={{
          fontSize: 11, color: loading ? 'var(--color-text-muted)' : 'var(--color-text)',
          flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          fontFamily: 'var(--font-mono)',
        }}>
          {loading ? 'Generating link…' : (linkData?.link || '—')}
        </span>
      </div>

      {/* Expiry */}
      {linkData?.expiresAt && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 12 }}>
          <ClockIcon style={{ width: 11, height: 11, color: 'var(--color-text-muted)' }} />
          <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{daysLeft(linkData.expiresAt)}</span>
        </div>
      )}

      {/* Copy button */}
      <button onClick={copyLink} disabled={loading || !linkData} style={{
        width: '100%', padding: '9px 16px',
        background: copied ? 'rgba(34,197,94,0.1)' : 'linear-gradient(135deg,#7C3AED 0%,#A855F7 100%)',
        color: copied ? '#16a34a' : 'white',
        border: copied ? '1px solid rgba(34,197,94,0.3)' : 'none',
        borderRadius: 9, cursor: loading || !linkData ? 'not-allowed' : 'pointer',
        fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 700,
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        opacity: loading || !linkData ? 0.6 : 1, transition: 'all 0.15s',
        boxSizing: 'border-box',
      }}>
        {copied
          ? <><CheckCircleIcon style={{ width: 14, height: 14 }} /> Copied!</>
          : <><LinkIcon style={{ width: 14, height: 14 }} /> Copy invite link</>}
      </button>
    </div>
  )
}

// ── Hooks ─────────────────────────────────────────────────────────────────────

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 640)
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 640)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])
  return isMobile
}

// ── Main TeamPage ─────────────────────────────────────────────────────────────

export default function TeamPage({ onClose, projectId, projectName }) {
  const { workspace, authUser, session } = useApp()
  const isMobile = useIsMobile()
  const isProjectMode = !!projectId

  const [tab, setTab] = useState('all')
  const [apiMembers, setApiMembers] = useState([])   // from API
  const [pendingInvites, setPendingInvites] = useState([])
  const [loading, setLoading] = useState(false)       // API loading only
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [selected, setSelected] = useState(new Set())
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [showInviteLinkPopup, setShowInviteLinkPopup] = useState(false)
  const [error, setError] = useState('')
  const [copySuccess, setCopySuccess] = useState(false)
  const [resendingId, setResendingId] = useState(null)
  const [memberCredits, setMemberCredits] = useState({})
  const [openMenuId, setOpenMenuId] = useState(null)
  const [menuPos, setMenuPos] = useState(null)
  const [creditModalFor, setCreditModalFor] = useState(null)
  const [removeModalFor, setRemoveModalFor] = useState(null)
  const [removing, setRemoving] = useState(false)
  const [bulkRemoveOpen, setBulkRemoveOpen] = useState(false)
  const [bulkRemoving, setBulkRemoving] = useState(false)

  // In WORKSPACE mode we know the signed-in user is the owner — synthesize that row
  // locally so the table renders immediately. In PROJECT mode the API returns the
  // project creator with role 'PM' explicitly, so we don't need a local placeholder.
  const ownerRow = (!isProjectMode && authUser) ? {
    id: authUser.id,
    role: 'owner',
    joinedAt: workspace?.created_at || null,
    email: authUser.email || '',
    name:
      authUser.user_metadata?.full_name ||
      authUser.user_metadata?.name ||
      authUser.email?.split('@')[0] ||
      'Owner',
    isPending: false,
  } : null

  // Derived member list
  const members = isProjectMode
    ? apiMembers
    : [
        ...(ownerRow ? [ownerRow] : []),
        ...apiMembers.filter(m => m.id !== authUser?.id),
      ]

  useEffect(() => {
    if (isProjectMode && projectId) loadData()
    else if (!isProjectMode && workspace?.id) loadData()
  }, [workspace?.id, projectId, isProjectMode])

  // close on Escape
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape' && !showInviteModal) onClose?.() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, showInviteModal])

  // close row menu on outside click
  useEffect(() => {
    if (!openMenuId) return
    function handler() { setOpenMenuId(null) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [openMenuId])

  async function getAuthHeaders() {
    // 1. Use session already stored in AppContext — synchronous, always up to date
    if (session?.access_token) {
      return { Authorization: 'Bearer ' + session.access_token, 'Content-Type': 'application/json' }
    }

    // 2. Read from localStorage — synchronous, no network
    try {
      for (const key of Object.keys(localStorage)) {
        if (key.startsWith('sb-') && key.endsWith('-auth-token')) {
          const val = JSON.parse(localStorage.getItem(key) || 'null')
          if (val?.access_token) {
            return { Authorization: 'Bearer ' + val.access_token, 'Content-Type': 'application/json' }
          }
        }
      }
    } catch {}

    // 3. Retry getSession() up to 3 times
    let sess = null
    for (let i = 0; i < 3; i++) {
      try {
        const { data } = await supabase.auth.getSession()
        sess = data?.session
        if (sess?.access_token) break
      } catch {}
      if (i < 2) await new Promise(r => setTimeout(r, 400))
    }

    if (sess?.access_token) {
      return { Authorization: 'Bearer ' + sess.access_token, 'Content-Type': 'application/json' }
    }

    throw new Error('Not authenticated. Please refresh the page and sign in again.')
  }

  async function loadData() {
    if (isProjectMode ? !projectId : !workspace?.id) return
    setLoading(true)
    setError('')
    try {
      const h = await getAuthHeaders()
      const membersBody = isProjectMode
        ? { action: 'list_project_members', projectId }
        : { action: 'list_members', workspaceId: workspace.id }
      const invitesBody = isProjectMode
        ? { action: 'list_project_invites', projectId }
        : { action: 'list', workspaceId: workspace.id }

      const [membersRes, invitesRes] = await Promise.all([
        fetch('/api/invite', { method: 'POST', headers: h, body: JSON.stringify(membersBody) }).then(r => r.json()),
        fetch('/api/invite', { method: 'POST', headers: h, body: JSON.stringify(invitesBody) }).then(r => r.json()),
      ])
      console.log('[team page] members response:', membersRes)
      console.log('[team page] invites response:', invitesRes)
      if (membersRes.error) {
        setError('Members: ' + membersRes.error)
      }
      const fetchedMembers = membersRes.members || []
      setApiMembers(fetchedMembers)
      setPendingInvites(invitesRes.invites || [])
      loadCredits(fetchedMembers.map(m => m.id))
    } catch (e) {
      console.error('[team page]', e)
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleRemoveMember(userId) {
    try {
      const h = await getAuthHeaders()
      const body = isProjectMode
        ? { action: 'remove_project_member', projectId, userId }
        : { action: 'remove_member', workspaceId: workspace.id, userId }
      const res = await fetch('/api/invite', {
        method: 'POST', headers: h,
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setError(d.error || 'Failed to remove member')
        return
      }
      setApiMembers(prev => prev.filter(m => m.id !== userId))
      setSelected(prev => { const next = new Set(prev); next.delete(userId); return next })
    } catch (e) { setError(e.message) }
  }

  async function loadCredits(ids) {
    if (!ids.length) return
    try {
      const { data } = await supabase.from('profiles').select('id, credits_used').in('id', ids)
      if (data?.length) {
        const map = {}
        data.forEach(p => { if (p.credits_used !== undefined) map[p.id] = p.credits_used })
        setMemberCredits(map)
      }
    } catch {}
  }

  async function handleResendInvite(row) {
    setResendingId(row.inviteId)
    try {
      const h = await getAuthHeaders()
      const body = isProjectMode
        ? { action: 'resend_project_invite', projectId, inviteId: row.inviteId }
        : { action: 'resend', workspaceId: workspace.id, inviteId: row.inviteId }
      const res = await fetch('/api/invite', {
        method: 'POST', headers: h,
        body: JSON.stringify(body),
      })
      if (!res.ok) { const d = await res.json(); setError(d.error || 'Failed to resend') }
    } catch (e) { setError(e.message) }
    finally { setResendingId(null) }
  }

  async function handleCancelInvite(inviteId) {
    try {
      const h = await getAuthHeaders()
      const body = isProjectMode
        ? { action: 'cancel_project_invite', projectId, inviteId }
        : { action: 'cancel', workspaceId: workspace.id, inviteId }
      await fetch('/api/invite', {
        method: 'POST', headers: h,
        body: JSON.stringify(body),
      })
      setPendingInvites(prev => prev.filter(i => i.id !== inviteId))
    } catch (e) { setError(e.message) }
  }

  function exportCSV(rows) {
    const header = 'Name,Email,Role,Joined,Status'
    const lines = rows.map(r =>
      `"${r.name || ''}","${r.email || ''}","${r.role || ''}","${r.joinedAt ? new Date(r.joinedAt).toLocaleDateString() : ''}","Active"`
    )
    const pending = selected.size === 0
      ? pendingInvites.map(i => `"${i.invited_email}","${i.invited_email}","${i.role}","","Pending"`)
      : []
    const csv = [header, ...lines, ...pending].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = (workspace?.name || 'team').toLowerCase().replace(/\s+/g, '-') + '-members.csv'
    document.body.appendChild(a); a.click()
    document.body.removeChild(a); URL.revokeObjectURL(url)
  }

  function handleExport() {
    exportCSV(selected.size > 0 ? members.filter(m => selected.has(m.id)) : members)
  }

  async function handleCopyInviteLink() {
    const link = window.location.origin + '/invite/workspace-' + workspace.id
    try {
      await navigator.clipboard.writeText(link)
    } catch {
      const input = document.createElement('input')
      input.value = link
      document.body.appendChild(input)
      input.select()
      document.execCommand('copy')
      document.body.removeChild(input)
    }
    setCopySuccess(true)
    setTimeout(() => setCopySuccess(false), 2000)
  }

  function toggleSelect(id) {
    setSelected(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next })
  }

  function toggleSelectAll() {
    if (selected.size === filteredRows.length) setSelected(new Set())
    else setSelected(new Set(filteredRows.map(r => r.id)))
  }

  // In project mode the creator is the "owner" for permission purposes.
  // The creator row comes back from the API with isCreator:true.
  const isOwner = isProjectMode
    ? !!members.find(m => m.id === authUser?.id && m.isCreator)
    : members.find(m => m.id === authUser?.id)?.role === 'owner'

  // In project mode, only the project Admin can invite, remove members,
  // and change roles. `isAdmin` is true only when the signed-in user is
  // the project creator.
  const isAdmin = isProjectMode
    ? !!members.find(m => m.id === authUser?.id && m.isCreator)
    : isOwner

  async function handleChangeRole(userId, nextRole) {
    if (!isAdmin || !isProjectMode) return
    // Optimistic update
    setApiMembers(prev => prev.map(m => m.id === userId ? { ...m, role: nextRole } : m))
    try {
      const h = await getAuthHeaders()
      const res = await fetch('/api/invite', {
        method: 'POST', headers: h,
        body: JSON.stringify({
          action: 'update_project_member_role',
          projectId, userId, role: nextRole,
        }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setError(d.error || 'Failed to update role')
        // Re-fetch to recover on failure
        loadData()
      }
    } catch (e) {
      setError(e.message)
      loadData()
    }
  }

  // Workspace invites use {invited_email, role, expires_at}
  // Project invites use   {invitee_email, job_role, expires_at, invited_at}
  // Normalise into a single row shape used by the renderer.
  const mappedPending = pendingInvites.map(i => ({
    id: i.id,
    name: i.invitee_email || i.invited_email,
    email: i.invitee_email || i.invited_email,
    role: i.job_role || i.role,
    joinedAt: null,
    isPending: true,
    inviteId: i.id,
    expiresAt: i.expires_at,
  }))

  const allRows = [
    ...members
      .map(m => ({ ...m, isPending: false }))
      .sort((a, b) => {
        // Creator/PM/owner first
        const aFirst = a.isCreator || a.role === 'owner' || a.role === 'PM'
        const bFirst = b.isCreator || b.role === 'owner' || b.role === 'PM'
        return aFirst === bFirst ? 0 : aFirst ? -1 : 1
      }),
    ...(tab === 'all' || tab === 'pending' ? mappedPending : []),
  ]

  const filteredRows = allRows.filter(r => {
    if (tab === 'members' && r.isPending) return false
    if (tab === 'pending' && !r.isPending) return false
    if (roleFilter !== 'all' && r.role !== roleFilter) return false
    const q = search.toLowerCase()
    if (q && !r.name?.toLowerCase().includes(q) && !r.email?.toLowerCase().includes(q)) return false
    return true
  })

  function timeAgo(dateStr) {
    if (!dateStr) return '—'
    const diff = Date.now() - new Date(dateStr).getTime()
    const days = Math.floor(diff / 86400000)
    if (days === 0) return 'Today'
    if (days === 1) return 'Yesterday'
    if (days < 30) return days + ' days ago'
    return Math.floor(days / 30) + ' month' + (Math.floor(days / 30) > 1 ? 's' : '') + ' ago'
  }

  function daysLeft(dateStr) {
    if (!dateStr) return ''
    const days = Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000)
    if (days <= 0) return 'Expired'
    return 'Expires in ' + days + 'd'
  }

  return (
    <>
      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .tp-row:hover { background: var(--color-surface) !important; }
        .tp-owner-role { position: relative; display: inline-flex; }
        .tp-owner-tooltip {
          display: none;
          position: absolute;
          bottom: calc(100% + 6px);
          left: 50%;
          transform: translateX(-50%);
          background: #1e1e2e;
          color: #fff;
          font-family: var(--font-sans);
          font-size: 11px;
          font-weight: 500;
          line-height: 1.5;
          white-space: nowrap;
          padding: 6px 10px;
          border-radius: 7px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.25);
          pointer-events: none;
          z-index: 10;
        }
        .tp-owner-tooltip::after {
          content: '';
          position: absolute;
          top: 100%;
          left: 50%;
          transform: translateX(-50%);
          border: 5px solid transparent;
          border-top-color: #1e1e2e;
        }
        .tp-owner-role:hover .tp-owner-tooltip { display: block; }
      `}</style>

      <div style={{
        position: 'fixed', inset: 0, background: 'var(--color-bg)', zIndex: 500,
        display: 'flex', flexDirection: 'column', fontFamily: 'var(--font-sans)',
        animation: 'slideUp 0.2s ease',
      }}>
        {/* Top bar */}
        <div style={{
          height: 52, borderBottom: '1px solid var(--color-border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: isMobile ? '0 16px' : '0 28px', flexShrink: 0, background: 'var(--color-card)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#7C3AED' }} />
            <span style={{ fontWeight: 700, fontSize: 15, letterSpacing: '-0.02em', color: 'var(--color-text)' }}>
              Team members
            </span>
          </div>
          <button onClick={onClose} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '6px 12px', background: 'transparent', border: '1px solid var(--color-border)',
            borderRadius: 8, cursor: 'pointer', fontFamily: 'var(--font-sans)',
            fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)', transition: 'all 0.15s',
          }}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--color-text)'; e.currentTarget.style.borderColor = 'var(--color-text-muted)' }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--color-text-muted)'; e.currentTarget.style.borderColor = 'var(--color-border)' }}
          >
            <XMarkIcon style={{ width: 14, height: 14 }} />
            Close
          </button>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: isMobile ? '20px 16px' : '32px 40px', maxWidth: 1200, width: '100%', margin: '0 auto', boxSizing: 'border-box' }}>

          {/* Page header */}
          <div style={{ marginBottom: 24 }}>
            <h1 style={{ fontWeight: 800, fontSize: isMobile ? 20 : 24, letterSpacing: '-0.04em', color: 'var(--color-text)', margin: '0 0 6px' }}>
              {isProjectMode ? 'Project members' : 'Team members'}
            </h1>
            <p style={{ fontSize: 13, color: 'var(--color-text-muted)', margin: 0, lineHeight: 1.6 }}>
              {isProjectMode ? (
                <>
                  Inviting people to{' '}
                  <strong style={{ color: 'var(--color-text)', fontWeight: 600 }}>{projectName || 'this project'}</strong>
                  {' '}gives access to the project board, tasks, and comments — without joining your workspace.
                </>
              ) : (
                <>
                  Inviting people to{' '}
                  <strong style={{ color: 'var(--color-text)', fontWeight: 600 }}>{workspace?.name}</strong>
                  {' '}gives access to shared projects and briefs.
                </>
              )}
            </p>
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', borderBottom: '1px solid var(--color-border)', marginBottom: 20 }}>
            {[
              { id: 'all',     label: 'All',     count: members.length + pendingInvites.length },
              { id: 'members', label: 'Members', count: members.length },
              { id: 'pending', label: 'Pending', count: pendingInvites.length },
            ].map(t => (
              <button key={t.id} onClick={() => setTab(t.id)} style={{
                padding: '8px 16px', background: 'transparent', border: 'none',
                borderBottom: '2px solid ' + (tab === t.id ? '#7C3AED' : 'transparent'),
                cursor: 'pointer', fontFamily: 'var(--font-sans)', fontSize: 13,
                fontWeight: tab === t.id ? 700 : 500,
                color: tab === t.id ? 'var(--color-text)' : 'var(--color-text-muted)',
                display: 'flex', alignItems: 'center', gap: 7, transition: 'all 0.15s',
              }}>
                {t.label}
                {t.count > 0 && (
                  <span style={{
                    background: tab === t.id ? '#7C3AED' : 'var(--color-surface)',
                    color: tab === t.id ? 'white' : 'var(--color-text-muted)',
                    borderRadius: 100, padding: '1px 7px',
                    fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700,
                  }}>
                    {t.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Toolbar — single row on desktop, wraps on mobile */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, flexWrap: isMobile ? 'wrap' : 'nowrap' }}>
            {/* Search */}
            <div style={{ position: 'relative', flex: isMobile ? '1 1 100%' : '1 1 auto', minWidth: 140 }}>
              <MagnifyingGlassIcon style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 14, height: 14, color: 'var(--color-text-muted)', pointerEvents: 'none' }} />
              <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search members..."
                style={{
                  width: '100%', background: 'var(--color-card)', border: '1px solid var(--color-border)',
                  borderRadius: 9, padding: '8px 12px 8px 30px', fontFamily: 'var(--font-sans)',
                  fontSize: 13, color: 'var(--color-text)', outline: 'none', boxSizing: 'border-box',
                }}
                onFocus={e => { e.target.style.borderColor = '#7C3AED' }}
                onBlur={e => { e.target.style.borderColor = 'var(--color-border)' }}
              />
            </div>

            {/* Role filter */}
            <div style={{ position: 'relative', flex: isMobile ? '1 1 calc(50% - 4px)' : '0 0 auto', minWidth: 120 }}>
              <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)} style={{
                width: '100%', background: 'var(--color-card)', border: '1px solid var(--color-border)',
                borderRadius: 9, padding: '8px 32px 8px 12px', fontFamily: 'var(--font-sans)',
                fontSize: 13, color: 'var(--color-text)', outline: 'none', cursor: 'pointer',
                appearance: 'none', WebkitAppearance: 'none', boxSizing: 'border-box',
              }}>
                <option value="all">All roles</option>
                {isProjectMode ? (
                  <>
                    <option value="Admin">Admin</option>
                    <option value="Editor">Editor</option>
                    <option value="Viewer">Viewer</option>
                  </>
                ) : (
                  <>
                    <option value="owner">Owner</option>
                    <option value="admin">Admin</option>
                    <option value="member">Member</option>
                  </>
                )}
              </select>
              <ChevronDownIcon style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', width: 14, height: 14, color: 'var(--color-text-muted)', pointerEvents: 'none' }} />
            </div>

            {/* Spacer — pushes action buttons right on desktop */}
            {!isMobile && <div style={{ flex: 1 }} />}

            {/* Export */}
            <button onClick={handleExport} style={{
              flex: isMobile ? '1 1 calc(50% - 4px)' : '0 0 auto',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px 14px',
              background: 'var(--color-card)', border: '1px solid var(--color-border)',
              borderRadius: 9, cursor: 'pointer', fontFamily: 'var(--font-sans)',
              fontSize: 13, fontWeight: 600, color: 'var(--color-text-muted)', transition: 'all 0.15s', whiteSpace: 'nowrap',
            }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = '#7C3AED'; e.currentTarget.style.color = '#7C3AED' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--color-border)'; e.currentTarget.style.color = 'var(--color-text-muted)' }}
            >
              <ArrowDownTrayIcon style={{ width: 14, height: 14 }} />
              {selected.size > 0 ? `Export ${selected.size}` : 'Export'}
            </button>

            {/* Invite link — triggers popup. In project mode, only the Admin can create invite links. */}
            {(!isProjectMode || isAdmin) && (
            <div style={{ position: 'relative', flex: isMobile ? '1 1 calc(50% - 4px)' : '0 0 auto' }}>
              <button
                onClick={() => setShowInviteLinkPopup(v => !v)}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px 14px',
                  background: showInviteLinkPopup ? 'rgba(124,58,237,0.08)' : 'var(--color-card)',
                  border: `1px solid ${showInviteLinkPopup ? '#7C3AED' : 'var(--color-border)'}`,
                  borderRadius: 9, cursor: 'pointer', fontFamily: 'var(--font-sans)',
                  fontSize: 13, fontWeight: 600,
                  color: showInviteLinkPopup ? '#7C3AED' : 'var(--color-text-muted)',
                  transition: 'all 0.15s', whiteSpace: 'nowrap',
                }}
                onMouseEnter={e => { if (!showInviteLinkPopup) { e.currentTarget.style.borderColor = '#7C3AED'; e.currentTarget.style.color = '#7C3AED' } }}
                onMouseLeave={e => { if (!showInviteLinkPopup) { e.currentTarget.style.borderColor = 'var(--color-border)'; e.currentTarget.style.color = 'var(--color-text-muted)' } }}
              >
                <LinkIcon style={{ width: 14, height: 14 }} />
                Invite link
              </button>
              {showInviteLinkPopup && (
                <InviteLinkPopup
                  workspaceId={workspace?.id}
                  workspaceName={workspace?.name}
                  projectId={projectId}
                  projectName={projectName}
                  getHeaders={getAuthHeaders}
                  onClose={() => setShowInviteLinkPopup(false)}
                />
              )}
            </div>
            )}

            {/* Invite members — admin-only in project mode */}
            {(!isProjectMode || isAdmin) && (
            <button onClick={() => setShowInviteModal(true)} style={{
              flex: isMobile ? '1 1 100%' : '0 0 auto',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px 16px',
              background: 'linear-gradient(135deg,#7C3AED 0%,#A855F7 100%)',
              color: 'white', border: 'none', borderRadius: 9, cursor: 'pointer',
              fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap',
              boxShadow: '0 2px 8px rgba(124,58,237,0.3)', transition: 'all 0.15s',
            }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(124,58,237,0.4)' }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(124,58,237,0.3)' }}
            >
              <UserPlusIcon style={{ width: 14, height: 14 }} />
              Invite members
            </button>
            )}
          </div>

          {/* Bulk action bar */}
          {selected.size > 0 && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '8px 16px',
              background: 'rgba(124,58,237,0.06)', border: '1px solid rgba(124,58,237,0.2)',
              borderRadius: 9, marginBottom: 12,
            }}>
              <span style={{ fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 600, color: '#7C3AED' }}>
                {selected.size} selected
              </span>
              <button onClick={handleExport} style={{
                display: 'flex', alignItems: 'center', gap: 5, padding: '4px 12px',
                background: 'transparent', border: '1px solid rgba(124,58,237,0.3)',
                borderRadius: 7, cursor: 'pointer', fontFamily: 'var(--font-sans)',
                fontSize: 12, fontWeight: 600, color: '#7C3AED',
              }}>
                <ArrowDownTrayIcon style={{ width: 13, height: 13 }} />
                Export selected
              </button>
              {isOwner && (
                <button onClick={() => setBulkRemoveOpen(true)} style={{
                  display: 'flex', alignItems: 'center', gap: 5, padding: '4px 12px',
                  background: 'transparent', border: '1px solid rgba(220,38,38,0.3)',
                  borderRadius: 7, cursor: 'pointer', fontFamily: 'var(--font-sans)',
                  fontSize: 12, fontWeight: 600, color: '#DC2626',
                }}>
                  <TrashIcon style={{ width: 13, height: 13 }} />
                  Remove selected
                </button>
              )}
              <button onClick={() => setSelected(new Set())} style={{
                marginLeft: 'auto', background: 'transparent', border: 'none',
                cursor: 'pointer', fontSize: 11, color: 'var(--color-text-muted)',
                fontFamily: 'var(--font-sans)',
              }}>
                Clear selection
              </button>
            </div>
          )}

          {/* Error */}
          {error && (
            <div style={{ padding: '8px 12px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, fontSize: 12, color: '#DC2626', marginBottom: 12 }}>
              {error}
            </div>
          )}

          {/* Table */}
          <div style={{ background: 'var(--color-card)', border: '1px solid var(--color-border)', borderRadius: 12, overflowX: 'auto' }}>
            <div style={{ minWidth: 880, boxSizing: 'border-box' }}>
            {/* Header row */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '36px minmax(220px, 2fr) 130px 90px 90px 100px 90px 40px',
              gap: 14,
              padding: '10px 18px', background: 'var(--color-surface)',
              borderBottom: '1px solid var(--color-border)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <input type="checkbox"
                  checked={selected.size > 0 && selected.size === filteredRows.length}
                  onChange={toggleSelectAll}
                  style={{ width: 14, height: 14, cursor: 'pointer', accentColor: '#7C3AED' }}
                />
              </div>
              {['Name', 'Role', 'Joined', 'Credit used', 'Total credit', 'Status', ''].map(h => (
                <div key={h} style={{
                  fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700,
                  letterSpacing: '0.08em', textTransform: 'uppercase',
                  color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center',
                }}>
                  {h}
                </div>
              ))}
            </div>

            {/* Rows */}
            {loading && members.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--color-text-muted)', fontSize: 13 }}>
                Loading members...
              </div>
            ) : filteredRows.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--color-text-muted)', fontSize: 13 }}>
                {search || roleFilter !== 'all'
                  ? 'No members match your filter'
                  : tab === 'pending' ? 'No pending invites' : 'No members yet'}
              </div>
            ) : filteredRows.map((row, i) => (
              <div key={row.id || i} className="tp-row" style={{
                display: 'grid',
                gridTemplateColumns: '36px minmax(220px, 2fr) 130px 90px 90px 100px 90px 40px',
                gap: 14,
                padding: '12px 18px', alignItems: 'center',
                borderBottom: i < filteredRows.length - 1 ? '1px solid var(--color-border)' : 'none',
                background: selected.has(row.id) ? 'rgba(124,58,237,0.04)' : 'transparent',
                transition: 'background 0.1s',
              }}>
                {/* Checkbox */}
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  {(() => {
                    const isProtected = row.role === 'owner' || row.isCreator
                    return (
                      <input type="checkbox"
                        checked={selected.has(row.id)}
                        onChange={() => !isProtected && toggleSelect(row.id)}
                        disabled={isProtected}
                        style={{ width: 14, height: 14, cursor: isProtected ? 'not-allowed' : 'pointer', accentColor: '#7C3AED', opacity: isProtected ? 0.35 : 1 }}
                      />
                    )
                  })()}
                </div>

                {/* Name + email */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                  {row.isPending ? (
                    <div style={{
                      width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                      background: 'var(--color-surface)', border: '1px dashed var(--color-border)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <EnvelopeIcon style={{ width: 13, height: 13, color: 'var(--color-text-muted)' }} />
                    </div>
                  ) : (
                    <Avatar name={row.name} size={32} />
                  )}
                  <div style={{ minWidth: 0 }}>
                    <div style={{
                      fontWeight: 600, fontSize: 13, color: 'var(--color-text)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      display: 'flex', alignItems: 'center', gap: 6,
                    }}>
                      {row.isPending ? row.email : row.name}
                      {row.id === authUser?.id && (
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--color-text-muted)', fontWeight: 400 }}>
                          you
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--color-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {row.isPending ? 'Invite pending · ' + daysLeft(row.expiresAt) : row.email}
                    </div>
                  </div>
                </div>

                {/* Role */}
                <div>
                  {row.isCreator || row.role === 'owner' ? (
                    // Project creator / workspace owner — role is fixed (Admin/Owner)
                    <span className="tp-owner-role" style={{ cursor: 'default' }}>
                      <RoleBadge role={isProjectMode ? 'Admin' : 'owner'} />
                      <span className="tp-owner-tooltip">
                        {isProjectMode
                          ? "The project creator's role is Admin and cannot be changed."
                          : 'Owners can manage all collaborators, projects, and connections.'}
                      </span>
                    </span>
                  ) : isProjectMode && !row.isPending && isAdmin ? (
                    // Admin viewing a non-creator project member → editable role select
                    <RoleSelect
                      value={row.role === 'Admin' ? 'Admin' : row.role === 'Viewer' ? 'Viewer' : 'Editor'}
                      onChange={next => handleChangeRole(row.id, next)}
                    />
                  ) : (
                    // Everyone else / pending invites → read-only badge
                    <RoleBadge role={row.role} />
                  )}
                </div>

                {/* Joined */}
                <div style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--color-text-muted)' }}>
                  {row.isPending ? '—' : timeAgo(row.joinedAt)}
                </div>

                {/* Credit used */}
                <div style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--color-text-muted)' }}>
                  {row.isPending ? '—' : (memberCredits[row.id] ?? 0)}
                </div>

                {/* Total credit (per-project credit limit) */}
                <div style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--color-text-muted)' }}>
                  {row.isPending || row.isCreator || row.role === 'owner'
                    ? '—'
                    : (row.creditLimit ?? '∞')}
                </div>

                {/* Status */}
                <div><StatusBadge status={row.isPending ? 'pending' : 'active'} /></div>

                {/* Actions */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', position: 'relative' }}>
                  {row.isPending ? (
                    <button
                      onMouseDown={e => e.stopPropagation()}
                      onClick={e => {
                        e.stopPropagation()
                        if (openMenuId === row.inviteId) {
                          setOpenMenuId(null); setMenuPos(null)
                        } else {
                          const rect = e.currentTarget.getBoundingClientRect()
                          setMenuPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right })
                          setOpenMenuId(row.inviteId)
                        }
                      }}
                      style={{
                        width: 28, height: 28, borderRadius: 7, background: 'transparent', border: 'none',
                        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: openMenuId === row.inviteId ? '#7C3AED' : 'var(--color-text-muted)', transition: 'all 0.15s',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.color = '#7C3AED'; e.currentTarget.style.background = 'rgba(124,58,237,0.06)' }}
                      onMouseLeave={e => { e.currentTarget.style.color = openMenuId === row.inviteId ? '#7C3AED' : 'var(--color-text-muted)'; e.currentTarget.style.background = 'transparent' }}
                    >
                      <EllipsisHorizontalIcon style={{ width: 16, height: 16 }} />
                    </button>
                  ) : isAdmin && row.id !== authUser?.id && !row.isCreator ? (
                    <button
                      onMouseDown={e => e.stopPropagation()}
                      onClick={e => {
                        e.stopPropagation()
                        const memberKey = 'm:' + row.id
                        if (openMenuId === memberKey) {
                          setOpenMenuId(null); setMenuPos(null)
                        } else {
                          const rect = e.currentTarget.getBoundingClientRect()
                          setMenuPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right })
                          setOpenMenuId(memberKey)
                        }
                      }}
                      title="Actions"
                      style={{
                        width: 28, height: 28, borderRadius: 7, background: 'transparent', border: 'none',
                        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: openMenuId === ('m:' + row.id) ? '#7C3AED' : 'var(--color-text-muted)', transition: 'all 0.15s',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.color = '#7C3AED'; e.currentTarget.style.background = 'rgba(124,58,237,0.06)' }}
                      onMouseLeave={e => { e.currentTarget.style.color = openMenuId === ('m:' + row.id) ? '#7C3AED' : 'var(--color-text-muted)'; e.currentTarget.style.background = 'transparent' }}
                    >
                      <EllipsisHorizontalIcon style={{ width: 16, height: 16 }} />
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
            </div>
          </div>
        </div>
      </div>

      {showInviteModal && (
        <InviteModal
          workspaceId={workspace?.id}
          projectId={projectId}
          projectName={projectName}
          onClose={() => setShowInviteModal(false)}
          onSent={loadData}
          getHeaders={getAuthHeaders}
        />
      )}

      {/* Row actions dropdown — portal to escape overflow:auto clipping.
          Two flavours, dispatched on the openMenuId prefix:
            - 'm:<userId>' → active member row → Delete + Set credit limit
            - anything else  → pending-invite row → Resend + Cancel */}
      {openMenuId && menuPos && (() => {
        const isMemberMenu = typeof openMenuId === 'string' && openMenuId.startsWith('m:')

        if (isMemberMenu) {
          const userId = openMenuId.slice(2)
          const openMember = members.find(m => m.id === userId)
          if (!openMember) return null
          return ReactDOM.createPortal(
            <div
              onMouseDown={e => e.stopPropagation()}
              style={{
                position: 'fixed', top: menuPos.top, right: menuPos.right,
                background: 'var(--color-card)', border: '1px solid var(--color-border)',
                borderRadius: 9, boxShadow: '0 4px 24px rgba(0,0,0,0.18)',
                zIndex: 9999, minWidth: 200, overflow: 'hidden',
                fontFamily: 'var(--font-sans)',
              }}
            >
              <button
                onClick={() => {
                  setCreditModalFor(openMember)
                  setOpenMenuId(null); setMenuPos(null)
                }}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                  padding: '10px 14px', background: 'transparent', border: 'none',
                  cursor: 'pointer', fontSize: 13, fontWeight: 600, color: 'var(--color-text)', textAlign: 'left',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-surface)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
              >
                <CurrencyDollarIcon style={{ width: 14, height: 14, color: 'var(--color-text-muted)' }} />
                Set credit limit
              </button>
              <div style={{ height: 1, background: 'var(--color-border)', margin: '0 10px' }} />
              <button
                onClick={() => {
                  setRemoveModalFor(openMember)
                  setOpenMenuId(null); setMenuPos(null)
                }}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                  padding: '10px 14px', background: 'transparent', border: 'none',
                  cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#dc2626', textAlign: 'left',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(220,38,38,0.06)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
              >
                <TrashIcon style={{ width: 13, height: 13 }} />
                Delete
              </button>
            </div>,
            document.body
          )
        }

        const openRow = allRows.find(r => r.inviteId === openMenuId)
        if (!openRow) return null
        return ReactDOM.createPortal(
          <div
            onMouseDown={e => e.stopPropagation()}
            style={{
              position: 'fixed', top: menuPos.top, right: menuPos.right,
              background: 'var(--color-card)', border: '1px solid var(--color-border)',
              borderRadius: 9, boxShadow: '0 4px 24px rgba(0,0,0,0.18)',
              zIndex: 9999, minWidth: 160, overflow: 'hidden',
              fontFamily: 'var(--font-sans)',
            }}
          >
            <button
              onClick={() => { handleResendInvite(openRow); setOpenMenuId(null) }}
              disabled={resendingId === openMenuId}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                padding: '10px 14px', background: 'transparent', border: 'none',
                cursor: resendingId === openMenuId ? 'not-allowed' : 'pointer',
                fontSize: 13, fontWeight: 600, color: 'var(--color-text)', textAlign: 'left',
                opacity: resendingId === openMenuId ? 0.5 : 1,
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-surface)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
            >
              <ArrowPathIcon style={{ width: 13, height: 13, color: 'var(--color-text-muted)' }} />
              {resendingId === openMenuId ? 'Resending…' : 'Resend invite'}
            </button>
            <div style={{ height: 1, background: 'var(--color-border)', margin: '0 10px' }} />
            <button
              onClick={() => { handleCancelInvite(openMenuId); setOpenMenuId(null) }}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                padding: '10px 14px', background: 'transparent', border: 'none',
                cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#dc2626', textAlign: 'left',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(220,38,38,0.06)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
            >
              <XMarkIcon style={{ width: 13, height: 13 }} />
              Cancel invite
            </button>
          </div>,
          document.body
        )
      })()}

      {/* Remove member confirmation — shared destructive modal */}
      <ConfirmDeleteModal
        open={!!removeModalFor}
        title="Remove member?"
        confirmLabel="Remove member"
        busy={removing}
        onCancel={() => { if (!removing) setRemoveModalFor(null) }}
        onConfirm={async () => {
          setRemoving(true)
          try {
            await handleRemoveMember(removeModalFor.id)
            setRemoveModalFor(null)
          } finally {
            setRemoving(false)
          }
        }}
        description={removeModalFor && (
          <>
            <p style={{ margin: 0 }}>
              Remove <strong>{removeModalFor.name || removeModalFor.email}</strong>
              {(isProjectMode ? projectName : (workspace?.name)) ? <> from <strong>{isProjectMode ? projectName : workspace?.name}</strong></> : null}?
            </p>
            <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--color-text-muted)', lineHeight: 1.55 }}>
              They'll lose access to the board, tasks, comments, and brief immediately.
              On their device the project disappears from the sidebar and they'll be
              switched to their most-recent project.
            </p>
          </>
        )}
      />

      {/* Bulk remove confirmation — same shared modal */}
      <ConfirmDeleteModal
        open={bulkRemoveOpen}
        title={`Remove ${selected.size} member${selected.size === 1 ? '' : 's'}?`}
        confirmLabel={`Remove ${selected.size === 1 ? 'member' : 'members'}`}
        busy={bulkRemoving}
        onCancel={() => { if (!bulkRemoving) setBulkRemoveOpen(false) }}
        onConfirm={async () => {
          setBulkRemoving(true)
          try {
            for (const id of [...selected]) await handleRemoveMember(id)
            setBulkRemoveOpen(false)
          } finally {
            setBulkRemoving(false)
          }
        }}
        description={
          <p style={{ margin: 0 }}>
            This will remove <strong>{selected.size}</strong> {selected.size === 1 ? 'person' : 'people'} from
            {isProjectMode ? <> <strong>{projectName || 'this project'}</strong></> : <> the workspace</>}.
            They'll lose access immediately. Their own workspace and other projects are untouched.
          </p>
        }
      />

      {/* Set Credit Limit modal — only mounted when a member is selected */}
      {creditModalFor && (
        <CreditLimitModal
          member={creditModalFor}
          onClose={() => setCreditModalFor(null)}
          onSave={async value => {
            try {
              const h = await getAuthHeaders()
              const res = await fetch('/api/invite', {
                method: 'POST', headers: h,
                body: JSON.stringify({
                  action: 'update_project_member_credit',
                  projectId, userId: creditModalFor.id,
                  creditLimit: value,
                }),
              })
              if (!res.ok) {
                const d = await res.json().catch(() => ({}))
                setError(d.error || 'Failed to set credit limit')
                return
              }
              // Optimistic local update
              setApiMembers(prev => prev.map(m => m.id === creditModalFor.id ? { ...m, creditLimit: value } : m))
              setCreditModalFor(null)
            } catch (e) {
              setError(e.message)
            }
          }}
        />
      )}
    </>
  )
}
