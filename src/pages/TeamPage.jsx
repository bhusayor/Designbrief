import React, { useState, useEffect, useRef } from 'react'
import { useApp } from '../context/AppContext'
import { supabase } from '../lib/supabase'
import {
  XMarkIcon,
  MagnifyingGlassIcon,
  ArrowDownTrayIcon,
  LinkIcon,
  UserPlusIcon,
  TrashIcon,
  EllipsisHorizontalIcon,
  CheckCircleIcon,
  ClockIcon,
  ExclamationCircleIcon,
  EnvelopeIcon,
  ChevronDownIcon,
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
  const styles = {
    owner:  { bg: 'rgba(245,158,11,0.1)',  color: '#92400E', border: 'rgba(245,158,11,0.3)' },
    admin:  { bg: 'rgba(124,58,237,0.1)',  color: '#7C3AED', border: 'rgba(124,58,237,0.25)' },
    member: { bg: 'var(--color-surface)',  color: 'var(--color-text-muted)', border: 'var(--color-border)' },
  }
  const s = styles[role] || styles.member
  return (
    <span style={{
      fontFamily: 'var(--font-sans)', fontSize: 11, fontWeight: 600,
      background: s.bg, color: s.color, border: '1px solid ' + s.border,
      borderRadius: 100, padding: '2px 9px',
      textTransform: 'capitalize', letterSpacing: '0.01em',
    }}>
      {role}
    </span>
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

function InviteModal({ workspaceId, onClose, onSent }) {
  const [emails, setEmails] = useState('')
  const [role, setRole] = useState('member')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  async function handleSend() {
    const emailList = emails.split(',').map(e => e.trim()).filter(Boolean)
    if (!emailList.length) { setError('Enter at least one email'); return }
    const invalid = emailList.filter(e => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))
    if (invalid.length) { setError('Invalid email: ' + invalid.join(', ')); return }

    setLoading(true); setError(''); setSuccess('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const authH = session?.access_token
        ? { Authorization: 'Bearer ' + session.access_token }
        : {}

      const results = await Promise.allSettled(
        emailList.map(email =>
          fetch('/api/invite', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authH },
            body: JSON.stringify({ action: 'send', workspaceId, email, role }),
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
        setError(results[0]?.value?.error || 'Failed to send invites')
      }
    } catch (e) {
      setError(e.message)
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
              Invite members
            </div>
            <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
              Invite members to your workspace by email
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
              {[
                { value: 'member', label: 'Member', desc: 'View and work on projects' },
                { value: 'admin',  label: 'Admin',  desc: 'Invite others, manage workspace settings' },
              ].map(opt => (
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

// ── Main TeamPage ─────────────────────────────────────────────────────────────

export default function TeamPage({ onClose }) {
  const { workspace, authUser } = useApp()
  const [tab, setTab] = useState('all')
  const [members, setMembers] = useState([])
  const [pendingInvites, setPendingInvites] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [selected, setSelected] = useState(new Set())
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [error, setError] = useState('')
  const [copySuccess, setCopySuccess] = useState(false)

  useEffect(() => {
    if (workspace?.id) loadData()
  }, [workspace?.id])

  // close on Escape
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape' && !showInviteModal) onClose?.() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, showInviteModal])

  async function getAuthHeaders() {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token
      ? { Authorization: 'Bearer ' + session.access_token, 'Content-Type': 'application/json' }
      : { 'Content-Type': 'application/json' }
  }

  async function loadData() {
    setLoading(true)
    try {
      const h = await getAuthHeaders()
      const [membersRes, invitesRes] = await Promise.all([
        fetch('/api/invite', { method: 'POST', headers: h, body: JSON.stringify({ action: 'list_members', workspaceId: workspace.id }) }).then(r => r.json()),
        fetch('/api/invite', { method: 'POST', headers: h, body: JSON.stringify({ action: 'list', workspaceId: workspace.id }) }).then(r => r.json()),
      ])
      setMembers(membersRes.members || [])
      setPendingInvites(invitesRes.invites || [])
    } catch (e) {
      console.error('[team page]', e)
    } finally {
      setLoading(false)
    }
  }

  async function handleRemoveMember(userId) {
    if (!confirm('Remove this member from the workspace?')) return
    try {
      const h = await getAuthHeaders()
      await fetch('/api/invite', {
        method: 'POST', headers: h,
        body: JSON.stringify({ action: 'remove_member', workspaceId: workspace.id, userId }),
      })
      setMembers(prev => prev.filter(m => m.id !== userId))
      setSelected(prev => { const next = new Set(prev); next.delete(userId); return next })
    } catch (e) { setError(e.message) }
  }

  async function handleCancelInvite(inviteId) {
    try {
      const h = await getAuthHeaders()
      await fetch('/api/invite', {
        method: 'POST', headers: h,
        body: JSON.stringify({ action: 'cancel', workspaceId: workspace.id, inviteId }),
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

  const isOwner = members.find(m => m.id === authUser?.id)?.role === 'owner'

  const allRows = [
    ...members.map(m => ({ ...m, isPending: false })),
    ...(tab === 'all' || tab === 'pending'
      ? pendingInvites.map(i => ({
          id: i.id, name: i.invited_email, email: i.invited_email,
          role: i.role, joinedAt: null,
          isPending: true, inviteId: i.id, expiresAt: i.expires_at,
        }))
      : []
    ),
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
          padding: '0 28px', flexShrink: 0, background: 'var(--color-card)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#7C3AED' }} />
            <span style={{ fontWeight: 700, fontSize: 15, letterSpacing: '-0.02em', color: 'var(--color-text)' }}>
              Team members
            </span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-text-muted)' }}>
              {workspace?.name}
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
        <div style={{ flex: 1, overflowY: 'auto', padding: '32px 40px', maxWidth: 960, width: '100%', margin: '0 auto', boxSizing: 'border-box' }}>

          {/* Page header */}
          <div style={{ marginBottom: 24 }}>
            <h1 style={{ fontWeight: 800, fontSize: 24, letterSpacing: '-0.04em', color: 'var(--color-text)', margin: '0 0 6px' }}>
              Team members
            </h1>
            <p style={{ fontSize: 13, color: 'var(--color-text-muted)', margin: 0, lineHeight: 1.6 }}>
              Inviting people to{' '}
              <strong style={{ color: 'var(--color-text)', fontWeight: 600 }}>{workspace?.name}</strong>
              {' '}gives access to shared projects and briefs.{' '}
              <span style={{
                fontFamily: 'var(--font-mono)', fontSize: 11,
                background: 'rgba(124,58,237,0.08)', color: '#7C3AED',
                border: '1px solid rgba(124,58,237,0.2)', borderRadius: 100, padding: '2px 9px',
              }}>
                {members.length} member{members.length !== 1 ? 's' : ''}
              </span>
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

          {/* Toolbar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
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

            <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
              <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)} style={{
                background: 'var(--color-card)', border: '1px solid var(--color-border)',
                borderRadius: 9, padding: '8px 32px 8px 12px', fontFamily: 'var(--font-sans)',
                fontSize: 13, color: 'var(--color-text)', outline: 'none', cursor: 'pointer',
                appearance: 'none', WebkitAppearance: 'none',
              }}>
                <option value="all">All roles</option>
                <option value="owner">Owner</option>
                <option value="admin">Admin</option>
                <option value="member">Member</option>
              </select>
              <ChevronDownIcon style={{ position: 'absolute', right: 10, width: 14, height: 14, color: 'var(--color-text-muted)', pointerEvents: 'none' }} />
            </div>

            <button onClick={handleExport} style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px',
              background: 'var(--color-card)', border: '1px solid var(--color-border)',
              borderRadius: 9, cursor: 'pointer', fontFamily: 'var(--font-sans)',
              fontSize: 13, fontWeight: 600, color: 'var(--color-text-muted)', transition: 'all 0.15s',
            }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = '#7C3AED'; e.currentTarget.style.color = '#7C3AED' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--color-border)'; e.currentTarget.style.color = 'var(--color-text-muted)' }}
            >
              <ArrowDownTrayIcon style={{ width: 14, height: 14 }} />
              {selected.size > 0 ? 'Export ' + selected.size + ' selected' : 'Export'}
            </button>

            <button onClick={handleCopyInviteLink} style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px',
              background: 'var(--color-card)', border: '1px solid var(--color-border)',
              borderRadius: 9, cursor: 'pointer', fontFamily: 'var(--font-sans)',
              fontSize: 13, fontWeight: 600,
              color: copySuccess ? '#16a34a' : 'var(--color-text-muted)', transition: 'all 0.15s',
            }}>
              <LinkIcon style={{ width: 14, height: 14 }} />
              {copySuccess ? 'Link copied!' : 'Invite link'}
            </button>

            <button onClick={() => setShowInviteModal(true)} style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px',
              background: 'linear-gradient(135deg,#7C3AED 0%,#A855F7 100%)',
              color: 'white', border: 'none', borderRadius: 9, cursor: 'pointer',
              fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 700,
              boxShadow: '0 2px 8px rgba(124,58,237,0.3)', transition: 'all 0.15s',
            }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(124,58,237,0.4)' }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(124,58,237,0.3)' }}
            >
              <UserPlusIcon style={{ width: 14, height: 14 }} />
              Invite members
            </button>
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
                <button onClick={async () => {
                  if (!confirm('Remove ' + selected.size + ' member(s)?')) return
                  for (const id of [...selected]) await handleRemoveMember(id)
                }} style={{
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
          <div style={{ background: 'var(--color-card)', border: '1px solid var(--color-border)', borderRadius: 12, overflow: 'hidden' }}>
            {/* Header row */}
            <div style={{
              display: 'grid', gridTemplateColumns: '36px 1fr 100px 120px 100px 40px',
              padding: '8px 16px', background: 'var(--color-surface)',
              borderBottom: '1px solid var(--color-border)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <input type="checkbox"
                  checked={selected.size > 0 && selected.size === filteredRows.length}
                  onChange={toggleSelectAll}
                  style={{ width: 14, height: 14, cursor: 'pointer', accentColor: '#7C3AED' }}
                />
              </div>
              {['Name', 'Role', 'Joined', 'Status', ''].map(h => (
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
            {loading ? (
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
                display: 'grid', gridTemplateColumns: '36px 1fr 100px 120px 100px 40px',
                padding: '10px 16px', alignItems: 'center',
                borderBottom: i < filteredRows.length - 1 ? '1px solid var(--color-border)' : 'none',
                background: selected.has(row.id) ? 'rgba(124,58,237,0.04)' : 'transparent',
                transition: 'background 0.1s',
              }}>
                {/* Checkbox */}
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <input type="checkbox" checked={selected.has(row.id)} onChange={() => toggleSelect(row.id)}
                    style={{ width: 14, height: 14, cursor: 'pointer', accentColor: '#7C3AED' }}
                  />
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
                <div><RoleBadge role={row.role} /></div>

                {/* Joined */}
                <div style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--color-text-muted)' }}>
                  {row.isPending ? '—' : timeAgo(row.joinedAt)}
                </div>

                {/* Status */}
                <div><StatusBadge status={row.isPending ? 'pending' : 'active'} /></div>

                {/* Actions */}
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  {row.isPending ? (
                    <button onClick={() => handleCancelInvite(row.inviteId)} title="Cancel invite" style={{
                      width: 28, height: 28, borderRadius: 7, background: 'transparent', border: 'none',
                      cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: 'var(--color-text-muted)', transition: 'all 0.15s',
                    }}
                      onMouseEnter={e => { e.currentTarget.style.color = '#dc2626'; e.currentTarget.style.background = '#FEF2F2' }}
                      onMouseLeave={e => { e.currentTarget.style.color = 'var(--color-text-muted)'; e.currentTarget.style.background = 'transparent' }}
                    >
                      <XMarkIcon style={{ width: 13, height: 13 }} />
                    </button>
                  ) : isOwner && row.id !== authUser?.id ? (
                    <button onClick={() => handleRemoveMember(row.id)} title="Remove member" style={{
                      width: 28, height: 28, borderRadius: 7, background: 'transparent', border: 'none',
                      cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: 'var(--color-text-muted)', transition: 'all 0.15s',
                    }}
                      onMouseEnter={e => { e.currentTarget.style.color = '#dc2626'; e.currentTarget.style.background = '#FEF2F2' }}
                      onMouseLeave={e => { e.currentTarget.style.color = 'var(--color-text-muted)'; e.currentTarget.style.background = 'transparent' }}
                    >
                      <TrashIcon style={{ width: 13, height: 13 }} />
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {showInviteModal && (
        <InviteModal
          workspaceId={workspace?.id}
          onClose={() => setShowInviteModal(false)}
          onSent={loadData}
        />
      )}
    </>
  )
}
