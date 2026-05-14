import { useState, useEffect, useRef, useCallback } from 'react'
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
  UserGroupIcon,
} from '@heroicons/react/24/outline'
import { useApp } from '../context/AppContext'
import { sendInvite, listInvites, cancelInvite, listMembers, removeMember } from '../lib/inviteApi'

// ─── helpers ────────────────────────────────────────────────────────────────

function getInitials(name, email) {
  const src = name || email || '?'
  return src.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase()
}

const AVATAR_COLORS = [
  ['#7C3AED', '#EDE9FE'],
  ['#0EA5E9', '#E0F2FE'],
  ['#10B981', '#D1FAE5'],
  ['#F59E0B', '#FEF3C7'],
  ['#EF4444', '#FEE2E2'],
  ['#8B5CF6', '#F3E8FF'],
  ['#06B6D4', '#CFFAFE'],
  ['#F97316', '#FFEDD5'],
]

function getAvatarColor(str) {
  let h = 0
  for (let i = 0; i < (str || '').length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0
  return AVATAR_COLORS[h % AVATAR_COLORS.length]
}

function Avatar({ name, email, size = 36 }) {
  const initials = getInitials(name, email)
  const [bg, fg] = getAvatarColor(email || name || '')
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: bg + '33', border: `1.5px solid ${bg}55`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: bg, fontSize: size * 0.36, fontWeight: 700,
      fontFamily: 'var(--font-sans)', flexShrink: 0,
    }}>
      {initials}
    </div>
  )
}

const ROLE_STYLES = {
  owner:  { bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.3)', color: '#D97706' },
  admin:  { bg: 'rgba(168,85,247,0.12)', border: 'rgba(168,85,247,0.3)', color: '#9333EA' },
  member: { bg: 'rgba(100,116,139,0.1)',  border: 'rgba(100,116,139,0.25)', color: '#64748B' },
}

function RoleBadge({ role }) {
  const s = ROLE_STYLES[role] || ROLE_STYLES.member
  return (
    <span style={{
      padding: '3px 9px', borderRadius: 20, fontSize: 11, fontWeight: 600,
      fontFamily: 'var(--font-sans)', letterSpacing: '0.2px',
      background: s.bg, border: `1px solid ${s.border}`, color: s.color,
    }}>
      {(role || 'member').charAt(0).toUpperCase() + (role || 'member').slice(1)}
    </span>
  )
}

function StatusBadge({ status }) {
  if (status === 'accepted') return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#10B981', fontSize: 12, fontFamily: 'var(--font-sans)' }}>
      <CheckCircleIcon style={{ width: 13, height: 13 }} /> Active
    </span>
  )
  if (status === 'pending') return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--color-text-muted)', fontSize: 12, fontFamily: 'var(--font-sans)' }}>
      <ClockIcon style={{ width: 13, height: 13 }} /> Pending
    </span>
  )
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#EF4444', fontSize: 12, fontFamily: 'var(--font-sans)' }}>
      <ExclamationCircleIcon style={{ width: 13, height: 13 }} /> Expired
    </span>
  )
}

// ─── inner invite modal ──────────────────────────────────────────────────────

function InviteModal({ workspaceId, onClose, onInvited }) {
  const [emails, setEmails] = useState('')
  const [role, setRole] = useState('member')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSuccess('')
    const list = emails.split(/[\s,;]+/).map(s => s.trim().toLowerCase()).filter(Boolean)
    if (!list.length) { setError('Enter at least one email address.'); return }
    const invalid = list.filter(e => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))
    if (invalid.length) { setError(`Invalid email${invalid.length > 1 ? 's' : ''}: ${invalid.join(', ')}`); return }

    setLoading(true)
    try {
      await Promise.all(list.map(email => sendInvite(workspaceId, email, role)))
      setSuccess(`Invite${list.length > 1 ? 's' : ''} sent to ${list.join(', ')}`)
      setEmails('')
      setTimeout(() => { onInvited?.(); onClose?.() }, 1200)
    } catch (err) {
      setError(err.message || 'Failed to send invite.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 600,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.55)', padding: 20,
    }} onClick={e => { if (e.target === e.currentTarget) onClose?.() }}>
      <div style={{
        width: '100%', maxWidth: 440,
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 20, padding: 28,
        fontFamily: 'var(--font-sans)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--color-text)', letterSpacing: '-0.3px' }}>
            Invite members
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', padding: 4, display: 'flex' }}>
            <XMarkIcon style={{ width: 18, height: 18 }} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={labelStyle}>Email addresses</label>
            <div style={{ position: 'relative' }}>
              <EnvelopeIcon style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 15, height: 15, color: 'var(--color-text-muted)' }} />
              <input
                type="text"
                value={emails}
                onChange={e => setEmails(e.target.value)}
                placeholder="email@company.com, another@..."
                style={{ ...inputStyle, paddingLeft: 32 }}
                autoFocus
              />
            </div>
            <p style={{ margin: '5px 0 0', fontSize: 11, color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>
              Separate multiple emails with commas
            </p>
          </div>

          <div>
            <label style={labelStyle}>Role</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                { value: 'member', label: 'Member', desc: 'Can view and comment on projects' },
                { value: 'admin',  label: 'Admin',  desc: 'Can manage members and settings' },
              ].map(opt => (
                <label key={opt.value} style={{
                  display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer',
                  padding: '10px 12px', borderRadius: 10,
                  background: role === opt.value ? 'rgba(168,85,247,0.06)' : 'transparent',
                  border: `1px solid ${role === opt.value ? 'rgba(168,85,247,0.3)' : 'var(--color-border)'}`,
                  transition: 'all 0.15s',
                }}>
                  <input
                    type="radio" name="role" value={opt.value}
                    checked={role === opt.value}
                    onChange={() => setRole(opt.value)}
                    style={{ marginTop: 2, accentColor: 'var(--color-accent)' }}
                  />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text)', marginBottom: 2 }}>{opt.label}</div>
                    <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{opt.desc}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {error && (
            <div style={{ display: 'flex', gap: 7, padding: '8px 12px', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8 }}>
              <ExclamationCircleIcon style={{ width: 14, height: 14, color: '#f87171', flexShrink: 0, marginTop: 1 }} />
              <p style={{ margin: 0, fontSize: 12, color: '#f87171', lineHeight: 1.5 }}>{error}</p>
            </div>
          )}
          {success && (
            <div style={{ display: 'flex', gap: 7, padding: '8px 12px', background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 8 }}>
              <CheckCircleIcon style={{ width: 14, height: 14, color: '#10B981', flexShrink: 0, marginTop: 1 }} />
              <p style={{ margin: 0, fontSize: 12, color: '#10B981', lineHeight: 1.5 }}>{success}</p>
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <button type="button" onClick={onClose} style={{ flex: 1, padding: '10px 0', background: 'transparent', border: '1px solid var(--color-border)', borderRadius: 10, color: 'var(--color-text-muted)', fontSize: 13, fontWeight: 600, fontFamily: 'var(--font-sans)', cursor: 'pointer' }}>
              Cancel
            </button>
            <button type="submit" disabled={loading} style={{
              flex: 2, padding: '10px 0',
              background: 'linear-gradient(135deg,#7C3AED,#A855F7)',
              border: 'none', borderRadius: 10,
              color: '#fff', fontSize: 13, fontWeight: 700,
              fontFamily: 'var(--font-sans)', cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.7 : 1,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}>
              {loading ? '…' : (
                <><UserPlusIcon style={{ width: 14, height: 14 }} /> Send invite</>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── main TeamPage ───────────────────────────────────────────────────────────

export default function TeamPage({ onClose }) {
  const { workspace, authUser } = useApp()
  const [tab, setTab] = useState('all')
  const [members, setMembers] = useState([])
  const [pending, setPending] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [selected, setSelected] = useState(new Set())
  const [showInvite, setShowInvite] = useState(false)
  const [actionError, setActionError] = useState('')
  const [copied, setCopied] = useState(false)

  const load = useCallback(async () => {
    if (!workspace?.id) return
    setLoading(true)
    try {
      const [membRes, invRes] = await Promise.all([
        listMembers(workspace.id),
        listInvites(workspace.id),
      ])
      setMembers(membRes.members || [])
      setPending(invRes.invites || [])
    } catch {
      // silent — table shown empty
    } finally {
      setLoading(false)
    }
  }, [workspace?.id])

  useEffect(() => { load() }, [load])

  // close on Escape
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // ── derived rows ──────────────────────────────────────────────────────────
  const allRows = [
    ...members.map(m => ({
      id: m.user_id,
      kind: 'member',
      name: m.profiles?.full_name || '',
      email: m.profiles?.email || m.email || '',
      role: m.role,
      joinedAt: m.created_at,
      status: 'accepted',
    })),
    ...pending.map(p => ({
      id: p.id,
      kind: 'invite',
      name: '',
      email: p.invited_email,
      role: p.role,
      joinedAt: p.created_at,
      status: p.status === 'accepted' ? 'accepted' : (new Date(p.expires_at) < new Date() ? 'expired' : 'pending'),
    })),
  ]

  const tabRows = tab === 'members' ? allRows.filter(r => r.kind === 'member')
    : tab === 'pending' ? allRows.filter(r => r.kind === 'invite')
    : allRows

  const filtered = tabRows.filter(r => {
    const q = search.toLowerCase()
    const matchQ = !q || r.email.toLowerCase().includes(q) || r.name.toLowerCase().includes(q)
    const matchRole = roleFilter === 'all' || r.role === roleFilter
    return matchQ && matchRole
  })

  const memberCount = members.length
  const pendingCount = pending.filter(p => p.status === 'pending' && new Date(p.expires_at) >= new Date()).length

  // ── actions ───────────────────────────────────────────────────────────────
  async function handleCancel(inviteId) {
    try {
      await cancelInvite(workspace.id, inviteId)
      await load()
    } catch (err) {
      setActionError(err.message || 'Failed to cancel invite.')
      setTimeout(() => setActionError(''), 3000)
    }
  }

  async function handleRemove(userId) {
    try {
      await removeMember(workspace.id, userId)
      await load()
    } catch (err) {
      setActionError(err.message || 'Failed to remove member.')
      setTimeout(() => setActionError(''), 3000)
    }
  }

  async function handleBulkRemove() {
    const toRemove = filtered.filter(r => selected.has(r.id))
    try {
      await Promise.all(toRemove.map(r =>
        r.kind === 'member' ? removeMember(workspace.id, r.id) : cancelInvite(workspace.id, r.id)
      ))
      setSelected(new Set())
      await load()
    } catch (err) {
      setActionError(err.message || 'Action failed.')
      setTimeout(() => setActionError(''), 3000)
    }
  }

  function exportCSV() {
    const rows = [['Name', 'Email', 'Role', 'Status', 'Joined']]
    allRows.forEach(r => rows.push([r.name, r.email, r.role, r.status, r.joinedAt ? new Date(r.joinedAt).toLocaleDateString() : '']))
    const csv = rows.map(r => r.map(v => `"${(v || '').replace(/"/g, '""')}"`).join(',')).join('\n')
    const a = document.createElement('a')
    a.href = 'data:text/csv,' + encodeURIComponent(csv)
    a.download = `${workspace?.name || 'workspace'}-members.csv`
    a.click()
  }

  async function copyInviteLink() {
    try {
      const data = await sendInvite(workspace.id, '__link__', 'member').catch(() => null)
      const link = data?.inviteUrl || `${window.location.origin}/invite/link`
      await navigator.clipboard.writeText(link)
    } catch {
      await navigator.clipboard.writeText(window.location.origin)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function toggleRow(id) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleAll() {
    if (selected.size === filtered.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(filtered.map(r => r.id)))
    }
  }

  const currentUserIsOwner = members.some(m => m.profiles?.email === authUser?.email && m.role === 'owner')
    || members.some(m => m.user_id === authUser?.id && m.role === 'owner')

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <>
      <style>{`
        @keyframes teamPageSlideUp {
          from { opacity: 0; transform: translateY(18px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .team-page-wrap { animation: teamPageSlideUp 0.2s ease both; }
        .team-row:hover { background: var(--color-surface) !important; }
        .team-row input[type="checkbox"] { accent-color: var(--color-accent); }
      `}</style>

      {/* backdrop */}
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 500, background: 'rgba(0,0,0,0.6)' }}
        onClick={onClose}
      />

      {/* panel */}
      <div className="team-page-wrap" style={{
        position: 'fixed', inset: 0, zIndex: 501,
        display: 'flex', flexDirection: 'column',
        background: 'var(--color-bg)',
        overflow: 'hidden',
        pointerEvents: 'none',
      }}>
        {/* top bar */}
        <div style={{
          pointerEvents: 'all',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 28px',
          height: 56,
          borderBottom: '1px solid var(--color-border)',
          flexShrink: 0,
          background: 'var(--color-surface)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <UserGroupIcon style={{ width: 18, height: 18, color: 'var(--color-accent)' }} />
            <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text)', fontFamily: 'var(--font-sans)', letterSpacing: '-0.3px' }}>
              People
            </span>
            {workspace?.name && (
              <span style={{ fontSize: 13, color: 'var(--color-text-muted)', fontFamily: 'var(--font-sans)' }}>
                · {workspace.name}
              </span>
            )}
          </div>
          <button onClick={onClose} style={{
            display: 'flex', alignItems: 'center', gap: 5,
            background: 'transparent', border: '1px solid var(--color-border)',
            borderRadius: 8, padding: '5px 10px',
            color: 'var(--color-text-muted)', fontSize: 12, fontWeight: 500,
            fontFamily: 'var(--font-sans)', cursor: 'pointer',
          }}>
            <XMarkIcon style={{ width: 13, height: 13 }} /> Close
          </button>
        </div>

        {/* content */}
        <div style={{
          pointerEvents: 'all',
          flex: 1, overflow: 'auto',
          padding: '28px 28px 40px',
        }}>
          <div style={{ maxWidth: 960, margin: '0 auto' }}>

            {/* page header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
              <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: 'var(--color-text)', fontFamily: 'var(--font-sans)', letterSpacing: '-0.5px' }}>
                Team members
              </h1>
              <span style={{
                padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                background: 'rgba(168,85,247,0.1)', border: '1px solid rgba(168,85,247,0.25)',
                color: 'var(--color-accent)', fontFamily: 'var(--font-sans)',
              }}>
                {memberCount} member{memberCount !== 1 ? 's' : ''}
              </span>
            </div>

            {/* tabs */}
            <div style={{ display: 'flex', gap: 2, marginBottom: 20, borderBottom: '1px solid var(--color-border)', paddingBottom: 0 }}>
              {[
                { key: 'all',     label: `All (${allRows.length})` },
                { key: 'members', label: `Members (${memberCount})` },
                { key: 'pending', label: `Pending (${pendingCount})` },
              ].map(t => (
                <button key={t.key} onClick={() => { setTab(t.key); setSelected(new Set()) }} style={{
                  padding: '8px 16px', background: 'none', border: 'none',
                  cursor: 'pointer', fontSize: 13, fontWeight: 600,
                  fontFamily: 'var(--font-sans)',
                  color: tab === t.key ? 'var(--color-accent)' : 'var(--color-text-muted)',
                  borderBottom: `2px solid ${tab === t.key ? 'var(--color-accent)' : 'transparent'}`,
                  marginBottom: -1, transition: 'all 0.15s',
                }}>
                  {t.label}
                </button>
              ))}
            </div>

            {/* toolbar */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
              {/* search */}
              <div style={{ position: 'relative', flex: '1 1 200px', minWidth: 160 }}>
                <MagnifyingGlassIcon style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 14, height: 14, color: 'var(--color-text-muted)' }} />
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search by name or email…"
                  style={{ ...inputStyle, paddingLeft: 32, width: '100%', boxSizing: 'border-box' }}
                />
              </div>

              {/* role filter */}
              <select
                value={roleFilter}
                onChange={e => setRoleFilter(e.target.value)}
                style={{ ...inputStyle, width: 'auto', paddingRight: 28, cursor: 'pointer' }}
              >
                <option value="all">All roles</option>
                <option value="owner">Owner</option>
                <option value="admin">Admin</option>
                <option value="member">Member</option>
              </select>

              <button onClick={exportCSV} style={ghostBtn} title="Export CSV">
                <ArrowDownTrayIcon style={{ width: 14, height: 14 }} /> Export
              </button>

              <button onClick={copyInviteLink} style={ghostBtn} title="Copy invite link">
                <LinkIcon style={{ width: 14, height: 14 }} />
                {copied ? 'Copied!' : 'Copy link'}
              </button>

              <button onClick={() => setShowInvite(true)} style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '8px 14px',
                background: 'linear-gradient(135deg,#7C3AED,#A855F7)',
                border: 'none', borderRadius: 8,
                color: '#fff', fontSize: 13, fontWeight: 700,
                fontFamily: 'var(--font-sans)', cursor: 'pointer',
                letterSpacing: '-0.1px',
              }}>
                <UserPlusIcon style={{ width: 14, height: 14 }} /> Invite members
              </button>
            </div>

            {/* bulk action bar */}
            {selected.size > 0 && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '10px 16px', marginBottom: 12,
                background: 'rgba(168,85,247,0.08)', border: '1px solid rgba(168,85,247,0.2)',
                borderRadius: 10, fontFamily: 'var(--font-sans)',
              }}>
                <span style={{ fontSize: 13, color: 'var(--color-text)', fontWeight: 600 }}>
                  {selected.size} selected
                </span>
                <button onClick={handleBulkRemove} style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: '5px 12px', background: 'rgba(239,68,68,0.1)',
                  border: '1px solid rgba(239,68,68,0.25)', borderRadius: 7,
                  color: '#EF4444', fontSize: 12, fontWeight: 600,
                  fontFamily: 'var(--font-sans)', cursor: 'pointer',
                }}>
                  <TrashIcon style={{ width: 12, height: 12 }} /> Remove selected
                </button>
                <button onClick={() => setSelected(new Set())} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', fontSize: 12, fontFamily: 'var(--font-sans)' }}>
                  Cancel
                </button>
              </div>
            )}

            {/* error toast */}
            {actionError && (
              <div style={{
                display: 'flex', gap: 7, padding: '8px 14px', marginBottom: 12,
                background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)',
                borderRadius: 8,
              }}>
                <ExclamationCircleIcon style={{ width: 14, height: 14, color: '#f87171', flexShrink: 0, marginTop: 1 }} />
                <p style={{ margin: 0, fontSize: 12, color: '#f87171', fontFamily: 'var(--font-sans)' }}>{actionError}</p>
              </div>
            )}

            {/* table */}
            {loading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}>
                <div className="spin" style={{ width: 28, height: 28, border: '2.5px solid var(--color-border)', borderTopColor: 'var(--color-accent)', borderRadius: '50%' }} />
              </div>
            ) : filtered.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--color-text-muted)', fontFamily: 'var(--font-sans)', fontSize: 14 }}>
                {search || roleFilter !== 'all' ? 'No results match your filters.' : 'No members yet.'}
              </div>
            ) : (
              <div style={{ border: '1px solid var(--color-border)', borderRadius: 12, overflow: 'hidden' }}>
                {/* table header */}
                <div style={{
                  display: 'grid', gridTemplateColumns: '36px 1fr 110px 130px 90px 80px',
                  padding: '10px 16px', background: 'var(--color-surface)',
                  borderBottom: '1px solid var(--color-border)',
                  fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)',
                  fontFamily: 'var(--font-sans)', letterSpacing: '0.5px', textTransform: 'uppercase',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <input type="checkbox" checked={selected.size === filtered.length && filtered.length > 0} onChange={toggleAll} />
                  </div>
                  <div>Member</div>
                  <div>Role</div>
                  <div>Joined</div>
                  <div>Status</div>
                  <div />
                </div>

                {/* rows */}
                {filtered.map((row, i) => {
                  const isMe = row.email === authUser?.email || row.id === authUser?.id
                  const canAct = currentUserIsOwner || (members.some(m => (m.user_id === authUser?.id || m.profiles?.email === authUser?.email) && m.role === 'admin'))
                  const isOwner = row.role === 'owner'

                  return (
                    <div
                      key={row.id}
                      className="team-row"
                      style={{
                        display: 'grid', gridTemplateColumns: '36px 1fr 110px 130px 90px 80px',
                        padding: '12px 16px', alignItems: 'center',
                        borderBottom: i < filtered.length - 1 ? '1px solid var(--color-border)' : 'none',
                        background: selected.has(row.id) ? 'rgba(168,85,247,0.04)' : 'transparent',
                        transition: 'background 0.1s',
                      }}
                    >
                      <div>
                        <input
                          type="checkbox"
                          checked={selected.has(row.id)}
                          onChange={() => toggleRow(row.id)}
                          disabled={isOwner || isMe}
                        />
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                        {row.kind === 'invite' ? (
                          <div style={{
                            width: 36, height: 36, borderRadius: '50%',
                            border: '1.5px dashed var(--color-border)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            flexShrink: 0,
                          }}>
                            <EnvelopeIcon style={{ width: 14, height: 14, color: 'var(--color-text-muted)' }} />
                          </div>
                        ) : (
                          <Avatar name={row.name} email={row.email} />
                        )}
                        <div style={{ minWidth: 0 }}>
                          {row.name && (
                            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text)', fontFamily: 'var(--font-sans)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {row.name}{isMe && <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--color-text-muted)', fontWeight: 500 }}>(you)</span>}
                            </div>
                          )}
                          <div style={{ fontSize: 12, color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {row.email}
                          </div>
                        </div>
                      </div>

                      <div><RoleBadge role={row.role} /></div>

                      <div style={{ fontSize: 12, color: 'var(--color-text-muted)', fontFamily: 'var(--font-sans)' }}>
                        {row.joinedAt ? new Date(row.joinedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                      </div>

                      <div><StatusBadge status={row.status} /></div>

                      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        {!isOwner && !isMe && canAct && (
                          row.kind === 'invite' ? (
                            <button
                              onClick={() => handleCancel(row.id)}
                              title="Cancel invite"
                              style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                width: 28, height: 28,
                                background: 'transparent', border: '1px solid var(--color-border)',
                                borderRadius: 7, cursor: 'pointer',
                                color: 'var(--color-text-muted)',
                                transition: 'all 0.15s',
                              }}
                              onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(239,68,68,0.4)'; e.currentTarget.style.color = '#EF4444' }}
                              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--color-border)'; e.currentTarget.style.color = 'var(--color-text-muted)' }}
                            >
                              <XMarkIcon style={{ width: 13, height: 13 }} />
                            </button>
                          ) : (
                            <button
                              onClick={() => handleRemove(row.id)}
                              title="Remove member"
                              style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                width: 28, height: 28,
                                background: 'transparent', border: '1px solid var(--color-border)',
                                borderRadius: 7, cursor: 'pointer',
                                color: 'var(--color-text-muted)',
                                transition: 'all 0.15s',
                              }}
                              onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(239,68,68,0.4)'; e.currentTarget.style.color = '#EF4444' }}
                              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--color-border)'; e.currentTarget.style.color = 'var(--color-text-muted)' }}
                            >
                              <TrashIcon style={{ width: 13, height: 13 }} />
                            </button>
                          )
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {showInvite && (
        <InviteModal
          workspaceId={workspace?.id}
          onClose={() => setShowInvite(false)}
          onInvited={load}
        />
      )}
    </>
  )
}

// ─── shared styles ──────────────────────────────────────────────────────────

const inputStyle = {
  padding: '8px 12px',
  background: 'var(--color-bg)',
  border: '1px solid var(--color-border)',
  borderRadius: 8,
  color: 'var(--color-text)',
  fontSize: 13,
  fontFamily: 'var(--font-sans)',
  outline: 'none',
}

const ghostBtn = {
  display: 'flex', alignItems: 'center', gap: 5,
  padding: '8px 12px',
  background: 'transparent',
  border: '1px solid var(--color-border)',
  borderRadius: 8,
  color: 'var(--color-text-muted)',
  fontSize: 13, fontWeight: 500,
  fontFamily: 'var(--font-sans)',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
}

const labelStyle = {
  display: 'block',
  color: 'var(--color-text-muted)',
  fontSize: 12, fontWeight: 500,
  marginBottom: 6,
  fontFamily: 'var(--font-sans)',
}
