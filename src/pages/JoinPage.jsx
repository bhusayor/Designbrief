import { useState, useEffect, useContext } from 'react'
import AppContext from '../context/AppContext'
import { Button, Badge } from '../components/ui'
import { ROLE_META } from '../lib/constants'
import { getInviteByToken, acceptInvite } from '../lib/teamService'
import { supabase } from '../lib/supabase'

export default function JoinPage() {
  const {
    authUser, navigate, showToast,
    setActiveProject, signOut,
  } = useContext(AppContext)

  const [phase, setPhase] = useState('loading')
  const [invite, setInvite] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    async function loadInvite() {
      const path = window.location.pathname
      const match = path.match(/^\/join\/([a-z0-9]+)$/)
      const joinToken = match?.[1] || localStorage.getItem('db-join-token')

      if (!joinToken) {
        setPhase('error')
        setError('No invite token found.')
        return
      }

      try {
        const data = await getInviteByToken(joinToken)
        if (data) {
          setInvite(data)
          setPhase('invite')
        } else {
          setPhase('error')
          setError('This invitation is invalid or has expired.')
        }
      } catch (e) {
        setPhase('error')
        setError('Could not load invite.')
      }
    }

    loadInvite()
  }, [])

  async function handleAcceptInvite() {
    setPhase('accepting')
    try {
      const result = await acceptInvite(invite.token, authUser.id)

      localStorage.removeItem('db-join-token')

      const { data: project } = await supabase
        .from('projects')
        .select('*')
        .eq('id', result.projectId)
        .single()

      if (project) {
        setActiveProject({
          id: project.id,
          title: project.title,
          data: {
            brief: project.brief_text,
            result: project.result,
            scoring: project.scoring,
          },
          teamMembers: project.team_members || [],
          kanban: project.kanban,
        })
      }

      setPhase('done')
    } catch (err) {
      setError(err.message)
      setPhase('error')
    }
  }

  const roleMeta = invite ? ROLE_META[invite.job_role] : null

  return (
    <div style={{
      height: '100dvh', background: 'var(--color-bg)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24,
    }}>
      <div style={{
        maxWidth: 440, width: '100%',
        background: 'var(--color-card)',
        border: '1px solid var(--color-border)',
        borderRadius: 20, padding: '36px 32px',
        boxShadow: 'var(--shadow-modal)',
        animation: 'fadeUp 0.3s ease',
      }}>

        {/* ── Loading ── */}
        {phase === 'loading' && (
          <div style={{ textAlign: 'center' }}>
            <div className="spin" style={{
              width: 36, height: 36, borderRadius: '50%',
              border: '3px solid var(--color-border)',
              borderTopColor: 'var(--color-accent)',
              margin: '0 auto 16px',
            }} />
            <div style={{
              fontFamily: "'Urbanist', sans-serif", fontSize: 12,
              color: 'var(--color-text-soft)',
            }}>
              Loading your invitation...
            </div>
          </div>
        )}

        {/* ── Error ── */}
        {phase === 'error' && (
          <div style={{ textAlign: 'center' }}>
            <div style={{
              width: 56, height: 56, borderRadius: '50%',
              background: 'color-mix(in srgb, var(--color-red) 12%, transparent)',
              border: '1px solid var(--color-red)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 22, color: 'var(--color-red)',
              margin: '0 auto 16px',
            }}>✗</div>
            <div style={{
              fontFamily: "'Urbanist', sans-serif", fontWeight: 700, fontSize: 18,
              color: 'var(--color-text)', marginBottom: 8,
            }}>
              {error || 'This invitation is invalid or has expired.'}
            </div>
            <div style={{
              fontFamily: "'Urbanist', sans-serif", fontSize: 12,
              color: 'var(--color-text-soft)', marginBottom: 20,
            }}>
              Please ask your team lead to send a new invite.
            </div>
            <Button variant="primary" onClick={() => navigate('auth')}>
              Go to DesignBrief AI
            </Button>
          </div>
        )}

        {/* ── Invite ── */}
        {phase === 'invite' && invite && (
          <div>
            {/* Logo */}
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <div style={{
                width: 40, height: 40,
                background: 'var(--color-accent)',
                borderRadius: 10,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 18, color: 'var(--color-accent-text)', fontWeight: 800,
              }}>✦</div>
            </div>

            <h1 style={{
              fontFamily: "'Urbanist', sans-serif", fontWeight: 800, fontSize: 24,
              color: 'var(--color-text)', textAlign: 'center', margin: '0 0 6px',
            }}>
              You're invited!
            </h1>
            <p style={{
              fontFamily: "'Urbanist', sans-serif", fontSize: 12,
              color: 'var(--color-text-soft)', textAlign: 'center',
              margin: '0 0 24px', lineHeight: 1.7,
            }}>
              {invite.invitee_name}, you have been invited to join a project on DesignBrief AI.
            </p>

            {/* Project details */}
            <div style={{
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 12, padding: '16px 18px',
              marginBottom: 20,
              display: 'flex', flexDirection: 'column', gap: 10,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{
                  fontFamily: "'Urbanist', sans-serif", fontSize: 10,
                  color: 'var(--color-text-muted)',
                }}>PROJECT</span>
                <span style={{
                  fontFamily: "'Urbanist', sans-serif", fontWeight: 700, fontSize: 14,
                  color: 'var(--color-text)',
                }}>A design project</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{
                  fontFamily: "'Urbanist', sans-serif", fontSize: 10,
                  color: 'var(--color-text-muted)',
                }}>YOUR ROLE</span>
                {roleMeta ? (
                  <Badge color={roleMeta.color} size="sm">
                    {roleMeta.icon} {invite.job_role}
                  </Badge>
                ) : (
                  <span style={{
                    fontFamily: "'Urbanist', sans-serif", fontSize: 12,
                    color: 'var(--color-text-soft)',
                  }}>{invite.job_role}</span>
                )}
              </div>
            </div>

            {/* Auth check */}
            {!authUser ? (
              <div>
                <p style={{
                  fontFamily: "'Urbanist', sans-serif", fontSize: 12,
                  color: 'var(--color-text-soft)', margin: '0 0 14px',
                }}>
                  You need a DesignBrief AI account to join.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <Button
                    variant="primary"
                    full
                    onClick={() => {
                      localStorage.setItem('db-join-token', invite.token)
                      navigate('auth')
                      showToast('Create an account to accept your invite')
                    }}
                  >
                    Create Account & Join
                  </Button>
                  <Button
                    variant="secondary"
                    full
                    onClick={() => {
                      localStorage.setItem('db-join-token', invite.token)
                      navigate('auth')
                    }}
                  >
                    Sign In Instead
                  </Button>
                </div>
              </div>
            ) : authUser.email?.toLowerCase() === invite.invitee_email?.toLowerCase() ? (
              <div>
                <p style={{
                  fontFamily: "'Urbanist', sans-serif", fontSize: 12,
                  color: 'var(--color-text-soft)', margin: '0 0 14px',
                }}>
                  Joining as {authUser.email}
                </p>
                <Button
                  variant="primary"
                  full
                  onClick={handleAcceptInvite}
                >
                  Accept & Join Project →
                </Button>
              </div>
            ) : (
              <div>
                <p style={{
                  fontFamily: "'Urbanist', sans-serif", fontSize: 12,
                  color: 'var(--color-amber)', margin: '0 0 8px',
                }}>
                  This invite was sent to {invite.invitee_email}
                </p>
                <p style={{
                  fontFamily: "'Urbanist', sans-serif", fontSize: 11,
                  color: 'var(--color-text-soft)', margin: '0 0 14px',
                }}>
                  You are signed in as {authUser.email}.
                </p>
                <Button
                  variant="secondary"
                  full
                  onClick={() => {
                    signOut()
                    navigate('auth')
                  }}
                >
                  Sign in with correct account
                </Button>
              </div>
            )}
          </div>
        )}

        {/* ── Accepting ── */}
        {phase === 'accepting' && (
          <div style={{ textAlign: 'center' }}>
            <div className="spin" style={{
              width: 36, height: 36, borderRadius: '50%',
              border: '3px solid var(--color-border)',
              borderTopColor: 'var(--color-accent)',
              margin: '0 auto 16px',
            }} />
            <div style={{
              fontFamily: "'Urbanist', sans-serif", fontSize: 12,
              color: 'var(--color-text-soft)',
            }}>
              Joining the project...
            </div>
          </div>
        )}

        {/* ── Done ── */}
        {phase === 'done' && invite && (
          <div style={{ textAlign: 'center' }}>
            <div style={{
              width: 64, height: 64, borderRadius: '50%',
              background: 'var(--color-accent)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 28, fontWeight: 800, color: 'var(--color-accent-text)',
              margin: '0 auto 16px',
            }}>✓</div>
            <h2 style={{
              fontFamily: "'Urbanist', sans-serif", fontWeight: 800, fontSize: 24,
              color: 'var(--color-text)', margin: '0 0 12px',
            }}>
              You're on the team!
            </h2>
            <p style={{
              fontFamily: "'Urbanist', sans-serif", fontSize: 12,
              color: 'var(--color-text-soft)', margin: '0 0 24px', lineHeight: 1.7,
            }}>
              You have joined as {invite.job_role}. You can now access the project board.
            </p>
            <Button
              variant="primary"
              full
              onClick={() => navigate('team')}
            >
              Open Project Board →
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
