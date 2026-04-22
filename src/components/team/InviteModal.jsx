import { useState, useContext } from 'react'
import AppContext from '../../context/AppContext'
import { Modal, Button, Input, Badge } from '../ui'
import { ROLE_META } from '../../lib/constants'
import { createInvite, cancelInvite } from '../../lib/teamService'

export default function InviteModal({
  open, onClose, projectId, projectName,
  onInviteSent, existingInvites,
}) {
  const { authUser, user, showToast } = useContext(AppContext)

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [jobRole, setJobRole] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [sent, setSent] = useState([])
  const [copied, setCopied] = useState(false)

  const lastSent = sent[0]

  async function handleSendInvite() {
    if (!name.trim() || !email.trim() || !jobRole) return
    setLoading(true)
    setError(null)

    try {
      const result = await createInvite({
        projectId,
        inviterName: user?.firstName || 'Your designer',
        inviteeEmail: email.trim(),
        inviteeName: name.trim(),
        jobRole,
        projectName,
      })

      setSent(prev => [{ ...result.invite, inviteLink: result.inviteLink }, ...prev])
      setCopied(false)
      const sentEmail = email.trim()
      setName('')
      setEmail('')
      setJobRole('')
      onInviteSent(result)
      showToast('Invite created for ' + sentEmail + '!')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleCancelInvite(inviteId) {
    try {
      await cancelInvite(inviteId)
      showToast('Invite cancelled')
      onInviteSent(null)
    } catch (err) {
      showToast('Could not cancel invite')
    }
  }

  function handleCopyLink(link) {
    navigator.clipboard.writeText(link).then(() => {
      showToast('Invite link copied!')
    }).catch(() => {
      showToast('Could not copy link')
    })
  }

  // Deduplicated pending invites list
  const allInvites = [
    ...sent,
    ...existingInvites.filter(e => !sent.find(s => s.id === e.id)),
  ].filter(inv => inv.status === 'pending')

  return (
    <Modal open={open} onClose={onClose} title="Invite Team Member" width={500}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

        <p style={{
          fontFamily: "'DM Mono', monospace", fontSize: 12,
          color: 'var(--color-text-soft)', margin: 0,
        }}>
          Invite someone to collaborate on this project.
        </p>

        <Input
          label="Full Name"
          placeholder="Alex Johnson"
          value={name}
          onChange={e => setName(e.target.value)}
          full
        />

        <Input
          label="Email Address"
          type="email"
          placeholder="alex@studio.com"
          value={email}
          onChange={e => setEmail(e.target.value)}
          full
        />

        {/* Job Role selector */}
        <div>
          <div style={{
            fontFamily: "'Urbanist', sans-serif", fontWeight: 600, fontSize: 12,
            color: 'var(--color-text-soft)', marginBottom: 8,
          }}>
            Job Role
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {Object.keys(ROLE_META).map(role => {
              const meta = ROLE_META[role]
              const isSelected = jobRole === role
              return (
                <button
                  key={role}
                  onClick={() => setJobRole(role)}
                  style={{
                    background: isSelected ? meta.color + '22' : 'var(--color-surface)',
                    border: '1px solid ' + (isSelected ? meta.color : 'var(--color-border)'),
                    borderRadius: 8, padding: '6px 12px',
                    cursor: 'pointer', transition: 'all 0.15s',
                    display: 'flex', gap: 5, alignItems: 'center',
                    fontSize: 11, fontFamily: "'Urbanist', sans-serif", fontWeight: 600,
                    color: isSelected ? meta.color : 'var(--color-text-soft)',
                  }}
                >
                  {meta.icon} {role}
                </button>
              )
            })}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div style={{
            background: 'color-mix(in srgb, var(--color-red) 8%, transparent)',
            border: '1px solid color-mix(in srgb, var(--color-red) 30%, transparent)',
            borderRadius: 8, padding: '10px 14px',
            fontFamily: "'DM Mono', monospace", fontSize: 12,
            color: 'var(--color-red)',
          }}>
            {error}
          </div>
        )}

        <Button
          variant="primary"
          full
          loading={loading}
          disabled={!name.trim() || !email.trim() || !jobRole}
          onClick={handleSendInvite}
        >
          Send Invite →
        </Button>

        {/* Pending invites list */}
        {allInvites.length > 0 && (
          <div>
            <div style={{
              height: 1, background: 'var(--color-border)', margin: '4px 0 12px',
            }} />
            <div style={{
              fontFamily: "'Urbanist', sans-serif", fontWeight: 600, fontSize: 12,
              color: 'var(--color-text-soft)', marginBottom: 8,
            }}>
              Pending Invites
            </div>
            {allInvites.map(invite => {
              const meta = ROLE_META[invite.job_role] || {}
              const initial = (invite.invitee_name || invite.invitee_email || '?')[0].toUpperCase()
              return (
                <div key={invite.id} style={{
                  display: 'flex', gap: 12, alignItems: 'center',
                  padding: '10px 12px', marginBottom: 6,
                  background: 'var(--color-surface)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 10,
                }}>
                  {/* Initials circle */}
                  <div style={{
                    width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                    background: (meta.color || 'var(--color-accent)') + '22',
                    border: '1px solid ' + (meta.color || 'var(--color-accent)') + '70',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, fontFamily: "'Urbanist', sans-serif", fontWeight: 700,
                    color: meta.color || 'var(--color-accent)',
                  }}>
                    {initial}
                  </div>

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontFamily: "'Urbanist', sans-serif", fontWeight: 600, fontSize: 12,
                      color: 'var(--color-text)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {invite.invitee_name}
                    </div>
                    <div style={{
                      fontFamily: "'DM Mono', monospace", fontSize: 10,
                      color: 'var(--color-text-muted)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {invite.invitee_email}
                    </div>
                    {invite.job_role && (
                      <Badge color={meta.color || 'var(--color-accent)'} size="sm">
                        {meta.icon} {invite.job_role}
                      </Badge>
                    )}
                  </div>

                  {/* Status + cancel */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                    <Badge color="var(--color-amber)" size="sm">Pending</Badge>
                    <button
                      onClick={() => handleCancelInvite(invite.id)}
                      title="Cancel invite"
                      style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: 'var(--color-text-muted)', fontSize: 16, lineHeight: 1,
                        padding: '2px 4px', borderRadius: 4,
                        transition: 'color 0.15s',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-red)')}
                      onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-text-muted)')}
                    >×</button>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Invite link — always shown after send */}
        {lastSent?.inviteLink && (
          <div style={{
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 10, padding: '14px 16px',
          }}>
            <div style={{
              fontFamily: "'DM Mono', monospace", fontSize: 11,
              color: 'var(--color-text-muted)', marginBottom: 8,
            }}>
              Share this link with {lastSent.invitee_name}:
            </div>
            <div style={{
              display: 'flex', gap: 10, alignItems: 'center',
              background: 'var(--color-card)',
              border: '1px solid var(--color-border)',
              borderRadius: 8, padding: '10px 12px',
            }}>
              <span style={{
                flex: 1, fontFamily: "'DM Mono', monospace", fontSize: 11,
                color: 'var(--color-text)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {lastSent.inviteLink}
              </span>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(lastSent.inviteLink).then(() => {
                    setCopied(true)
                    setTimeout(() => setCopied(false), 2000)
                  }).catch(() => showToast('Could not copy link'))
                }}
                style={{
                  background: copied ? 'var(--color-green)' : 'var(--color-accent)',
                  border: 'none', borderRadius: 6, padding: '5px 12px',
                  cursor: 'pointer', fontFamily: "'Urbanist', sans-serif",
                  fontWeight: 700, fontSize: 11,
                  color: 'var(--color-accent-text)', flexShrink: 0,
                  transition: 'background 0.2s',
                }}
              >
                {copied ? '✓ Copied' : 'Copy'}
              </button>
            </div>
            <div style={{
              fontFamily: "'DM Mono', monospace", fontSize: 10,
              color: 'var(--color-text-muted)', marginTop: 8, fontStyle: 'italic',
            }}>
              ✉ An email invitation has also been sent if email delivery is configured.
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}
