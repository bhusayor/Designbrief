import { useState, useEffect } from 'react'
import {
  XMarkIcon,
  EnvelopeIcon,
  UserPlusIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  TrashIcon,
  ClockIcon,
  UserGroupIcon,
  UsersIcon,
} from '@heroicons/react/24/outline'
import { sendInvite, listInvites, cancelInvite, listMembers, removeMember } from '../../lib/inviteApi'
import { useApp } from '../../context/AppContext'

// ── Avatar ────────────────────────────────────────────────────────────────────

function Avatar({ name, size = 32 }) {
  const initials = (name || '?')
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
  const palette = ['#7C3AED', '#0EA5E9', '#16a34a', '#f59e0b', '#EC4899', '#6366F1', '#0891B2']
  const color = palette[(name?.charCodeAt(0) || 0) % palette.length]
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: color + '22', border: '1.5px solid ' + color + '55',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'var(--font-sans)', fontWeight: 700,
      fontSize: Math.round(size * 0.35),
      color, flexShrink: 0, letterSpacing: '-0.5px',
    }}>
      {initials}
    </div>
  )
}

// ── RoleBadge ─────────────────────────────────────────────────────────────────

function RoleBadge({ role }) {
  const styles = {
    owner:  { color: '#f59e0b', bg: '#FEF9C3', border: '#FDE68A' },
    admin:  { color: '#7C3AED', bg: 'rgba(124,58,237,0.08)', border: 'rgba(124,58,237,0.25)' },
    member: { color: 'var(--color-text-muted)', bg: 'var(--color-surface)', border: 'var(--color-border)' },
  }
  const s = styles[role] || styles.member
  return (
    <span style={{
      fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700,
      color: s.color, background: s.bg,
      border: '1px solid ' + s.border,
      borderRadius: 100, padding: '2px 8px',
      textTransform: 'uppercase', letterSpacing: '0.06em',
    }}>
      {role}
    </span>
  )
}

// ── InviteModal ───────────────────────────────────────────────────────────────

export default function InviteModal({ onClose }) {
  const { workspace, authUser } = useApp()

  const [tab, setTab] = useState('members')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('member')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [members, setMembers] = useState([])
  const [pendingInvites, setPendingInvites] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (workspace?.id) loadData()
  }, [workspace?.id])

  // Close on Escape key
  useEffect(() => {
    const handler = e => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  async function loadData() {
    setLoading(true)
    try {
      const [membersRes, invitesRes] = await Promise.all([
        listMembers(workspace.id),
        listInvites(workspace.id),
      ])
      setMembers(membersRes.members || [])
      setPendingInvites(invitesRes.invites || [])
    } catch (e) {
      console.error('[invite modal]', e)
    } finally {
      setLoading(false)
    }
  }

  async function handleSendInvite() {
    if (!email.trim()) return
    setSending(true)
    setError('')
    setSuccess('')
    try {
      await sendInvite(workspace.id, email.trim(), role)
      setSuccess('Invite sent to ' + email.trim())
      setEmail('')
      const res = await listInvites(workspace.id)
      setPendingInvites(res.invites || [])
      setTab('pending')
    } catch (e) {
      setError(e.message)
    } finally {
      setSending(false)
    }
  }

  async function handleCancelInvite(inviteId) {
    try {
      await cancelInvite(workspace.id, inviteId)
      setPendingInvites(prev => prev.filter(i => i.id !== inviteId))
    } catch (e) {
      setError(e.message)
    }
  }

  async function handleRemoveMember(userId) {
    if (!confirm('Remove this member from the workspace?')) return
    try {
      await removeMember(workspace.id, userId)
      setMembers(prev => prev.filter(m => m.id !== userId))
    } catch (e) {
      setError(e.message)
    }
  }

  const isOwner = members.find(m => m.id === authUser?.id)?.role === 'owner'

  function daysUntil(dateStr) {
    const diff = new Date(dateStr).getTime() - Date.now()
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24))
    if (days <= 0) return 'Expired'
    if (days === 1) return 'Expires tomorrow'
    return `Expires in ${days} days`
  }

  function timeAgo(dateStr) {
    const diff = Date.now() - new Date(dateStr).getTime()
    const days = Math.floor(diff / (1000 * 60 * 60 * 24))
    if (days === 0) return 'Today'
    if (days === 1) return 'Yesterday'
    return `${days}d ago`
  }

  const TABS = [
    { id: 'members', label: 'Members', count: members.length,  Icon: UsersIcon },
    { id: 'pending', label: 'Pending', count: pendingInvites.length, Icon: ClockIcon },
  ]

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 400,
        background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--color-bg)',
          border: '1px solid var(--color-border)',
          borderRadius: 20,
          width: '100%', maxWidth: 520,
          maxHeight: '85vh',
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 32px 80px rgba(0,0,0,0.45)',
          fontFamily: 'var(--font-sans)',
        }}
      >

        {/* ── Header ── */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '20px 24px 16px',
          borderBottom: '1px solid var(--color-border)',
          flexShrink: 0,
        }}>
          <div>
            <div style={{
              fontWeight: 800, fontSize: 16,
              letterSpacing: '-0.03em', color: 'var(--color-text)',
              marginBottom: 2,
            }}>
              {workspace?.name}
            </div>
            <div style={{
              fontSize: 12, color: 'var(--color-text-muted)',
              display: 'flex', alignItems: 'center', gap: 5,
            }}>
              <UserGroupIcon style={{ width: 12, height: 12 }} />
              {members.length} member{members.length !== 1 ? 's' : ''}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 30, height: 30, borderRadius: 8,
              background: 'transparent', border: 'none',
              cursor: 'pointer', display: 'flex', alignItems: 'center',
              justifyContent: 'center', color: 'var(--color-text-muted)',
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-surface)'; e.currentTarget.style.color = 'var(--color-text)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--color-text-muted)' }}
          >
            <XMarkIcon style={{ width: 16, height: 16 }} />
          </button>
        </div>

        {/* ── Invite input, always visible ── */}
        <div style={{
          padding: '14px 24px',
          borderBottom: '1px solid var(--color-border)',
          background: 'var(--color-surface)',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', gap: 8 }}>
            {/* Email */}
            <div style={{ position: 'relative', flex: 1 }}>
              <EnvelopeIcon style={{
                position: 'absolute', left: 11, top: '50%',
                transform: 'translateY(-50%)',
                width: 14, height: 14, color: 'var(--color-text-muted)',
                pointerEvents: 'none',
              }} />
              <input
                type="email"
                value={email}
                onChange={e => { setEmail(e.target.value); setError(''); setSuccess('') }}
                onKeyDown={e => { if (e.key === 'Enter') handleSendInvite() }}
                placeholder="colleague@company.com"
                style={{
                  width: '100%', background: 'var(--color-card)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 10, padding: '9px 12px 9px 34px',
                  fontFamily: 'var(--font-sans)', fontSize: 13,
                  color: 'var(--color-text)', outline: 'none',
                  boxSizing: 'border-box', transition: 'all 0.15s',
                }}
                onFocus={e => {
                  e.target.style.borderColor = '#7C3AED'
                  e.target.style.boxShadow = '0 0 0 3px rgba(124,58,237,0.1)'
                }}
                onBlur={e => {
                  e.target.style.borderColor = 'var(--color-border)'
                  e.target.style.boxShadow = 'none'
                }}
              />
            </div>

            {/* Role */}
            <select
              value={role}
              onChange={e => setRole(e.target.value)}
              style={{
                background: 'var(--color-card)', border: '1px solid var(--color-border)',
                borderRadius: 10, padding: '9px 10px',
                fontFamily: 'var(--font-sans)', fontSize: 13,
                color: 'var(--color-text)', outline: 'none',
                cursor: 'pointer', flexShrink: 0,
              }}
            >
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </select>

            {/* Send button */}
            <button
              onClick={handleSendInvite}
              disabled={sending || !email.trim()}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '9px 16px',
                background: sending || !email.trim() ? 'var(--color-border)' : '#7C3AED',
                color: 'white', border: 'none', borderRadius: 10,
                cursor: sending || !email.trim() ? 'not-allowed' : 'pointer',
                fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 700,
                flexShrink: 0, transition: 'all 0.15s',
                whiteSpace: 'nowrap',
              }}
              onMouseEnter={e => {
                if (!sending && email.trim())
                  e.currentTarget.style.background = '#6D28D9'
              }}
              onMouseLeave={e => {
                if (!sending && email.trim())
                  e.currentTarget.style.background = '#7C3AED'
              }}
            >
              <UserPlusIcon style={{ width: 14, height: 14 }} />
              {sending ? 'Sending…' : 'Invite'}
            </button>
          </div>

          {/* Role explanations */}
          <div style={{ display: 'flex', gap: 16, marginTop: 8 }}>
            <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
              <strong style={{ color: 'var(--color-text-soft)', fontWeight: 600 }}>Member</strong>
              {': '}view and work on projects
            </span>
            <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
              <strong style={{ color: 'var(--color-text-soft)', fontWeight: 600 }}>Admin</strong>
              {': '}invite others, manage workspace
            </span>
          </div>

          {/* Feedback */}
          {error && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 7, marginTop: 8,
              padding: '7px 10px', background: 'rgba(220,38,38,0.06)',
              border: '1px solid rgba(220,38,38,0.2)', borderRadius: 8,
            }}>
              <ExclamationCircleIcon style={{ width: 13, height: 13, color: '#DC2626', flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: '#DC2626' }}>{error}</span>
            </div>
          )}
          {success && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 7, marginTop: 8,
              padding: '7px 10px', background: 'rgba(22,163,74,0.06)',
              border: '1px solid rgba(22,163,74,0.2)', borderRadius: 8,
            }}>
              <CheckCircleIcon style={{ width: 13, height: 13, color: '#16a34a', flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: '#16a34a' }}>{success}</span>
            </div>
          )}
        </div>

        {/* ── Tabs ── */}
        <div style={{
          display: 'flex',
          borderBottom: '1px solid var(--color-border)',
          flexShrink: 0,
        }}>
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                flex: 1, padding: '10px 16px',
                background: 'transparent', border: 'none',
                borderBottom: '2px solid ' + (tab === t.id ? '#7C3AED' : 'transparent'),
                cursor: 'pointer', fontFamily: 'var(--font-sans)', fontSize: 13,
                fontWeight: tab === t.id ? 700 : 500,
                color: tab === t.id ? 'var(--color-text)' : 'var(--color-text-muted)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                gap: 7, transition: 'all 0.15s',
              }}
            >
              <t.Icon style={{ width: 14, height: 14 }} />
              {t.label}
              {t.count > 0 && (
                <span style={{
                  background: tab === t.id ? '#7C3AED' : 'var(--color-surface)',
                  color: tab === t.id ? '#fff' : 'var(--color-text-muted)',
                  borderRadius: 100, padding: '1px 7px',
                  fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700,
                  minWidth: 18, textAlign: 'center',
                }}>
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── Content ── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
          {loading ? (
            <div style={{
              padding: 32, textAlign: 'center',
              color: 'var(--color-text-muted)', fontSize: 13,
            }}>
              Loading…
            </div>
          ) : tab === 'members' ? (
            members.length === 0 ? (
              <div style={{
                padding: '40px 24px', textAlign: 'center',
                color: 'var(--color-text-muted)', fontSize: 13,
              }}>
                <UsersIcon style={{ width: 28, height: 28, margin: '0 auto 10px', opacity: 0.3 }} />
                No members yet
              </div>
            ) : (
              members.map(member => (
                <div
                  key={member.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '10px 24px', transition: 'background 0.1s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-surface)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                >
                  <Avatar name={member.name} size={34} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontWeight: 600, fontSize: 13,
                      color: 'var(--color-text)', marginBottom: 1,
                      display: 'flex', alignItems: 'center', gap: 6,
                    }}>
                      {member.name}
                      {member.id === authUser?.id && (
                        <span style={{
                          fontFamily: 'var(--font-mono)', fontSize: 9,
                          color: 'var(--color-text-muted)',
                        }}>
                          you
                        </span>
                      )}
                    </div>
                    <div style={{
                      fontSize: 11, color: 'var(--color-text-muted)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {member.email}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    <RoleBadge role={member.role} />
                    {isOwner && member.role !== 'owner' && (
                      <button
                        onClick={() => handleRemoveMember(member.id)}
                        title="Remove member"
                        style={{
                          width: 28, height: 28, borderRadius: 7,
                          background: 'transparent', border: 'none',
                          cursor: 'pointer', display: 'flex',
                          alignItems: 'center', justifyContent: 'center',
                          color: 'var(--color-text-muted)', transition: 'all 0.15s',
                        }}
                        onMouseEnter={e => {
                          e.currentTarget.style.color = '#dc2626'
                          e.currentTarget.style.background = 'rgba(220,38,38,0.08)'
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.color = 'var(--color-text-muted)'
                          e.currentTarget.style.background = 'transparent'
                        }}
                      >
                        <TrashIcon style={{ width: 13, height: 13 }} />
                      </button>
                    )}
                  </div>
                </div>
              ))
            )
          ) : (
            /* Pending tab */
            pendingInvites.length === 0 ? (
              <div style={{
                padding: '40px 24px', textAlign: 'center',
                color: 'var(--color-text-muted)', fontSize: 13,
              }}>
                <EnvelopeIcon style={{ width: 28, height: 28, margin: '0 auto 10px', opacity: 0.3 }} />
                No pending invites
              </div>
            ) : (
              pendingInvites.map(invite => (
                <div
                  key={invite.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '10px 24px', transition: 'background 0.1s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-surface)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                >
                  {/* Placeholder avatar for pending */}
                  <div style={{
                    width: 34, height: 34, borderRadius: '50%',
                    background: 'var(--color-surface)',
                    border: '1.5px dashed var(--color-border)',
                    display: 'flex', alignItems: 'center',
                    justifyContent: 'center', flexShrink: 0,
                  }}>
                    <EnvelopeIcon style={{ width: 14, height: 14, color: 'var(--color-text-muted)' }} />
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontWeight: 600, fontSize: 13,
                      color: 'var(--color-text)', marginBottom: 2,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {invite.invited_email}
                    </div>
                    <div style={{
                      fontSize: 11, color: 'var(--color-text-muted)',
                      display: 'flex', alignItems: 'center', gap: 5,
                    }}>
                      <ClockIcon style={{ width: 10, height: 10 }} />
                      {daysUntil(invite.expires_at)}
                      <span style={{ opacity: 0.4 }}>·</span>
                      Sent {timeAgo(invite.created_at)}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    <span style={{
                      fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700,
                      color: '#f59e0b', background: '#FEF9C3',
                      border: '1px solid #FDE68A',
                      borderRadius: 100, padding: '2px 8px',
                      textTransform: 'uppercase', letterSpacing: '0.06em',
                    }}>
                      {invite.role}
                    </span>
                    <button
                      onClick={() => handleCancelInvite(invite.id)}
                      style={{
                        padding: '5px 11px', background: 'transparent',
                        border: '1px solid var(--color-border)',
                        borderRadius: 8, cursor: 'pointer',
                        fontFamily: 'var(--font-sans)', fontSize: 11, fontWeight: 600,
                        color: 'var(--color-text-muted)', transition: 'all 0.15s',
                        whiteSpace: 'nowrap',
                      }}
                      onMouseEnter={e => {
                        e.currentTarget.style.color = '#dc2626'
                        e.currentTarget.style.borderColor = 'rgba(220,38,38,0.4)'
                        e.currentTarget.style.background = 'rgba(220,38,38,0.05)'
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.color = 'var(--color-text-muted)'
                        e.currentTarget.style.borderColor = 'var(--color-border)'
                        e.currentTarget.style.background = 'transparent'
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ))
            )
          )}
        </div>
      </div>
    </div>
  )
}
