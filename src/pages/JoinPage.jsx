import { useState, useEffect, useContext } from 'react'
import AppContext from '../context/AppContext'
import { Button, Badge } from '../components/ui'
import { ROLE_META } from '../lib/constants'
import { getInviteByToken, acceptInvite } from '../lib/teamService'
import { supabase } from '../lib/supabase'

export default function JoinPage() {
  const {
    authUser, navigate, showToast,
    setActiveProject, openProject, signOut,
    workspace, workspaceLoading,
  } = useContext(AppContext)

  const [phase, setPhase] = useState('loading')
  const [invite, setInvite] = useState(null)
  const [error, setError] = useState(null)

  // Inline auth state (for unauthenticated visitors)
  const [authTab, setAuthTab] = useState('signup')
  const [authEmail, setAuthEmail] = useState('')
  const [authName, setAuthName] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [authLoading, setAuthLoading] = useState(false)
  const [authError, setAuthError] = useState('')
  // Set to true after sign-in/up so the useEffect below handles navigation
  const [waitingForAuth, setWaitingForAuth] = useState(false)

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

      localStorage.setItem('db-join-token', joinToken)

      try {
        const data = await getInviteByToken(joinToken)
        if (data) {
          setInvite(data)
          setAuthEmail(data.invitee_email || '')
          setAuthName(data.invitee_name || '')
          setPhase('invite')
        } else {
          setPhase('error')
          setError('This invitation is invalid or has expired.')
        }
      } catch {
        setPhase('error')
        setError('Could not load invite.')
      }
    }

    loadInvite()
  }, [])

  // After sign-in/up, wait for authUser + workspaceLoading to settle, then proceed.
  useEffect(() => {
    if (!waitingForAuth || !authUser || workspaceLoading) return
    setWaitingForAuth(false)

    if (!workspace) {
      // New user — needs their own workspace first. Navigate away from the public 'join'
      // section so App.jsx's workspace gate kicks in and shows WorkspaceSetup.
      // App.jsx's onComplete will navigate back here once workspace is created.
      navigate('dashboard')
    } else {
      // Existing user with workspace — accept the invite immediately.
      handleAcceptInvite()
    }
  }, [waitingForAuth, authUser, workspace, workspaceLoading])

  async function handleAcceptInvite() {
    setPhase('accepting')
    try {
      const result = await acceptInvite(invite.token, authUser.id)
      localStorage.removeItem('db-join-token')

      // Fetch the project — requires the "Team members can view invited projects"
      // RLS policy on the projects table (supabase/team-project-read.sql).
      const { data: project } = await supabase
        .from('projects')
        .select('*')
        .eq('id', result.projectId)
        .single()

      if (project) {
        const projectEntry = {
          id: project.id,
          title: project.title,
          data: {
            brief: project.brief_text,
            result: project.result,
            scoring: project.scoring,
          },
          teamMembers: project.team_members || [],
          kanban: project.kanban,
          isShared: true,
        }

        // Inject into TeamCollab's own project list so it persists across navigations
        const tcProjects = (() => {
          try { return JSON.parse(localStorage.getItem('teamcollab-projects')) || [] } catch { return [] }
        })()
        if (!tcProjects.find(p => p.id === project.id)) {
          localStorage.setItem('teamcollab-projects', JSON.stringify([
            ...tcProjects, { id: project.id, title: project.title },
          ]))
        }
        localStorage.setItem('teamcollab-active-project', project.id)

        // Pre-seed per-project state so TeamCollab's loadProjectStateById finds data
        const hasCachedState = !!localStorage.getItem('tc-project-' + project.id)
        if (!hasCachedState) {
          localStorage.setItem('tc-project-' + project.id, JSON.stringify({
            teamMembers: project.team_members || [],
            kanban: project.kanban || { tasks: [] },
            projectTitle: project.title,
            briefText: project.brief_text || '',
          }))
        }

        setActiveProject(projectEntry)
      }

      setPhase('done')
    } catch (err) {
      setError(err.message)
      setPhase('error')
    }
  }

  async function handleAuth(e) {
    e.preventDefault()
    setAuthLoading(true)
    setAuthError('')

    try {
      if (authTab === 'signin') {
        const { data, error: err } = await supabase.auth.signInWithPassword({
          email: authEmail,
          password: authPassword,
        })
        if (err) { setAuthError(err.message); return }
        if (!data.session) { setAuthError('Sign-in failed. Please try again.'); return }
      } else {
        const { data, error: err } = await supabase.auth.signUp({
          email: authEmail,
          password: authPassword,
          options: { data: { full_name: authName || authEmail.split('@')[0] } },
        })
        if (err) { setAuthError(err.message); return }
        if (!data.session) {
          setAuthError('Check your email to confirm your account, then return here to sign in.')
          setAuthTab('signin')
          return
        }
      }
      // Let the useEffect watch for authUser + workspace to settle before proceeding.
      setWaitingForAuth(true)
    } catch {
      setAuthError('Authentication failed. Please try again.')
    } finally {
      setAuthLoading(false)
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

        {/* ── Loading / Accepting ── */}
        {(phase === 'loading' || phase === 'accepting') && (
          <div style={{ textAlign: 'center' }}>
            <div className="spin" style={{
              width: 36, height: 36, borderRadius: '50%',
              border: '3px solid var(--color-border)',
              borderTopColor: 'var(--color-accent)',
              margin: '0 auto 16px',
            }} />
            <div style={{ fontFamily: "'Urbanist', sans-serif", fontSize: 12, color: 'var(--color-text-soft)' }}>
              {phase === 'accepting' ? 'Joining the project...' : 'Loading your invitation...'}
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
            <div style={{ fontFamily: "'Urbanist', sans-serif", fontWeight: 700, fontSize: 18, color: 'var(--color-text)', marginBottom: 8 }}>
              {error || 'This invitation is invalid or has expired.'}
            </div>
            <div style={{ fontFamily: "'Urbanist', sans-serif", fontSize: 12, color: 'var(--color-text-soft)', marginBottom: 20 }}>
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
              fontFamily: "'Urbanist', sans-serif", fontSize: 13,
              color: 'var(--color-text-soft)', textAlign: 'center',
              margin: '0 0 24px', lineHeight: 1.7,
            }}>
              {invite.invitee_name ? `${invite.invitee_name}, you've` : "You've"} been invited to collaborate on a project.
            </p>

            {/* Project details */}
            <div style={{
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 12, padding: '16px 18px',
              marginBottom: 24,
              display: 'flex', flexDirection: 'column', gap: 10,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontFamily: "'Urbanist', sans-serif", fontSize: 10, color: 'var(--color-text-muted)' }}>PROJECT</span>
                <span style={{ fontFamily: "'Urbanist', sans-serif", fontWeight: 700, fontSize: 14, color: 'var(--color-text)' }}>
                  A design project
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontFamily: "'Urbanist', sans-serif", fontSize: 10, color: 'var(--color-text-muted)' }}>YOUR ROLE</span>
                {roleMeta ? (
                  <Badge color={roleMeta.color} size="sm">{roleMeta.icon} {invite.job_role}</Badge>
                ) : (
                  <span style={{ fontFamily: "'Urbanist', sans-serif", fontSize: 12, color: 'var(--color-text-soft)' }}>{invite.job_role}</span>
                )}
              </div>
            </div>

            {/* ── Authenticated: email matches ── */}
            {authUser && authUser.email?.toLowerCase() === invite.invitee_email?.toLowerCase() && (
              <div>
                <p style={{ fontFamily: "'Urbanist', sans-serif", fontSize: 12, color: 'var(--color-text-soft)', margin: '0 0 14px' }}>
                  Joining as <strong>{authUser.email}</strong>
                </p>
                <Button variant="primary" full onClick={handleAcceptInvite}>
                  Accept & Join Project →
                </Button>
              </div>
            )}

            {/* ── Authenticated: wrong email ── */}
            {authUser && authUser.email?.toLowerCase() !== invite.invitee_email?.toLowerCase() && (
              <div>
                <p style={{ fontFamily: "'Urbanist', sans-serif", fontSize: 12, color: 'var(--color-amber)', margin: '0 0 8px' }}>
                  This invite was sent to {invite.invitee_email}
                </p>
                <p style={{ fontFamily: "'Urbanist', sans-serif", fontSize: 11, color: 'var(--color-text-soft)', margin: '0 0 14px' }}>
                  You are signed in as {authUser.email}.
                </p>
                <Button variant="secondary" full onClick={() => { signOut(); navigate('auth') }}>
                  Sign in with correct account
                </Button>
              </div>
            )}

            {/* ── Unauthenticated: inline auth form ── */}
            {!authUser && (
              <div>
                {/* Tab switcher */}
                <div style={{
                  display: 'flex', background: 'var(--color-bg)',
                  borderRadius: 10, padding: 3, marginBottom: 18,
                }}>
                  {['signup', 'signin'].map(tab => (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => { setAuthTab(tab); setAuthError('') }}
                      style={{
                        flex: 1, padding: '7px 0', border: 'none', borderRadius: 8,
                        cursor: 'pointer', fontSize: 13, fontWeight: 600,
                        fontFamily: "'Urbanist', sans-serif",
                        transition: 'all 0.15s',
                        background: authTab === tab ? 'var(--color-card)' : 'transparent',
                        color: authTab === tab ? 'var(--color-text)' : 'var(--color-text-soft)',
                        boxShadow: authTab === tab ? '0 1px 3px rgba(0,0,0,0.15)' : 'none',
                      }}
                    >
                      {tab === 'signup' ? 'Create account' : 'Sign in'}
                    </button>
                  ))}
                </div>

                <form onSubmit={handleAuth} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div>
                    <label style={labelStyle}>Email</label>
                    <input
                      type="email"
                      value={authEmail}
                      onChange={e => setAuthEmail(e.target.value)}
                      readOnly={!!invite.invitee_email}
                      placeholder="your@email.com"
                      required
                      style={invite.invitee_email ? { ...inputStyle, opacity: 0.6, cursor: 'not-allowed' } : inputStyle}
                    />
                  </div>

                  {authTab === 'signup' && (
                    <div>
                      <label style={labelStyle}>Name</label>
                      <input
                        type="text"
                        value={authName}
                        onChange={e => setAuthName(e.target.value)}
                        placeholder="Your name"
                        style={inputStyle}
                      />
                    </div>
                  )}

                  <div>
                    <label style={labelStyle}>Password</label>
                    <input
                      type="password"
                      value={authPassword}
                      onChange={e => setAuthPassword(e.target.value)}
                      placeholder="••••••••"
                      required
                      minLength={6}
                      style={inputStyle}
                    />
                  </div>

                  {authError && (
                    <div style={{
                      padding: '8px 12px',
                      background: 'color-mix(in srgb, var(--color-red) 8%, transparent)',
                      border: '1px solid color-mix(in srgb, var(--color-red) 30%, transparent)',
                      borderRadius: 8,
                    }}>
                      <p style={{ fontFamily: "'Urbanist', sans-serif", color: 'var(--color-red)', fontSize: 12, margin: 0, lineHeight: 1.5 }}>
                        {authError}
                      </p>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={authLoading}
                    style={{
                      width: '100%', padding: '12px 0', marginTop: 4,
                      background: 'linear-gradient(135deg,#7C3AED,#A855F7)',
                      border: 'none', borderRadius: 12,
                      color: '#fff', fontSize: 14, fontWeight: 700,
                      fontFamily: "'Urbanist', sans-serif",
                      cursor: authLoading ? 'not-allowed' : 'pointer',
                      opacity: authLoading ? 0.7 : 1,
                    }}
                  >
                    {authLoading
                      ? '…'
                      : authTab === 'signin'
                        ? 'Sign in & join project'
                        : 'Create account & join project'}
                  </button>
                </form>

                {authTab === 'signup' && (
                  <p style={{ fontFamily: "'Urbanist', sans-serif", fontSize: 11, color: 'var(--color-text-muted)', textAlign: 'center', margin: '14px 0 0', lineHeight: 1.6 }}>
                    You'll set up your own workspace after signing up, then get added to this project.
                  </p>
                )}
              </div>
            )}
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
            <Button variant="primary" full onClick={() => {
              // Re-open the project to ensure TeamCollab loads it correctly
              if (activeProject) openProject(activeProject)
              else navigate('team')
            }}>
              Open Project Board →
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

const inputStyle = {
  width: '100%',
  padding: '10px 12px',
  background: 'var(--color-bg)',
  border: '1px solid var(--color-border)',
  borderRadius: 10,
  color: 'var(--color-text)',
  fontSize: 13,
  fontFamily: "'Urbanist', sans-serif",
  boxSizing: 'border-box',
  outline: 'none',
  transition: 'border-color 0.15s',
}

const labelStyle = {
  display: 'block',
  color: 'var(--color-text-muted)',
  fontSize: 12,
  fontWeight: 600,
  marginBottom: 5,
  fontFamily: "'Urbanist', sans-serif",
}
