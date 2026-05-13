import { useState, useEffect, useContext } from 'react'
import { supabase } from '../lib/supabase'
import AppContext from '../context/AppContext'

export default function AcceptInvite() {
  const { navigate, authUser, setWorkspace } = useContext(AppContext)

  const token = (
    window.location.pathname.split('/invite/')[1] || ''
  ).split('?')[0] || localStorage.getItem('db-invite-token') || ''

  const [phase, setPhase] = useState('loading') // loading | valid | accepting | success | error | invalid
  const [invite, setInvite] = useState(null)
  const [error, setError] = useState('')
  const [authTab, setAuthTab] = useState('signin')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [authLoading, setAuthLoading] = useState(false)
  const [authError, setAuthError] = useState('')

  useEffect(() => {
    if (!token) {
      setError('No invite token found.')
      setPhase('invalid')
      return
    }
    checkInvite()
  }, [])

  async function checkInvite() {
    try {
      const res = await fetch('/api/invite', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer anonymous',
        },
        body: JSON.stringify({ action: 'check', token }),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'This invite is not valid.')
        setPhase('invalid')
        return
      }

      setInvite(data.invite)

      if (authUser) {
        if (authUser.email?.toLowerCase() === data.invite.invitedEmail?.toLowerCase()) {
          await doAccept(token, data.invite)
        } else {
          setPhase('valid')
        }
      } else {
        setPhase('valid')
      }
    } catch {
      setError('Failed to load invite. Please try again.')
      setPhase('error')
    }
  }

  async function doAccept(inviteToken, inviteData) {
    setPhase('accepting')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) {
        setError('Sign in required.')
        setPhase('valid')
        return
      }

      const res = await fetch('/api/invite', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + session.access_token,
        },
        body: JSON.stringify({ action: 'accept', token: inviteToken }),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Failed to accept invite.')
        setPhase('error')
        return
      }

      if (data.workspace) setWorkspace(data.workspace)
      if (inviteData) setInvite(prev => ({ ...prev, ...inviteData, workspace: data.workspace || inviteData?.workspace }))

      setPhase('success')
      setTimeout(() => {
        localStorage.removeItem('db-invite-token')
        window.history.replaceState(null, '', '/')
        navigate('dashboard')
      }, 2000)
    } catch {
      setError('Failed to accept invite. Please try again.')
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
          email: invite?.invitedEmail || '',
          password,
        })
        if (err) { setAuthError(err.message); return }
        if (!data.session) { setAuthError('Sign-in failed. Please try again.'); return }
      } else {
        const { data, error: err } = await supabase.auth.signUp({
          email: invite?.invitedEmail || '',
          password,
          options: {
            data: { full_name: name || (invite?.invitedEmail || '').split('@')[0] },
          },
        })
        if (err) { setAuthError(err.message); return }
        if (!data.session) {
          setAuthError('Please confirm your email then sign in to accept the invite.')
          return
        }
      }

      await doAccept(token, invite)
    } catch {
      setAuthError('Authentication failed. Please try again.')
    } finally {
      setAuthLoading(false)
    }
  }

  const bg = {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'var(--color-bg)',
    padding: '20px',
  }

  const card = {
    width: '100%',
    maxWidth: 420,
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: 16,
    padding: '32px',
  }

  if (phase === 'loading' || phase === 'accepting') {
    return (
      <div style={bg}>
        <div style={{ ...card, textAlign: 'center' }}>
          <Logo />
          <div
            className="spin"
            style={{
              width: 36, height: 36,
              border: '3px solid var(--color-border)',
              borderTopColor: 'var(--color-accent)',
              borderRadius: '50%',
              margin: '28px auto 16px',
            }}
          />
          <p style={{ color: 'var(--color-text-muted)', fontFamily: "'DM Mono', monospace", fontSize: 13, margin: 0 }}>
            {phase === 'accepting' ? 'Joining workspace…' : 'Loading invite…'}
          </p>
        </div>
      </div>
    )
  }

  if (phase === 'success') {
    return (
      <div style={bg}>
        <div style={{ ...card, textAlign: 'center' }}>
          <Logo />
          <div style={{
            width: 52, height: 52, borderRadius: '50%',
            background: 'rgba(168,85,247,0.15)',
            border: '2px solid var(--color-accent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '28px auto 20px',
            fontSize: 22, color: 'var(--color-accent)',
          }}>
            ✓
          </div>
          <h2 style={{ color: 'var(--color-text)', fontWeight: 700, fontSize: 20, margin: '0 0 8px', letterSpacing: '-0.4px' }}>
            You're in!
          </h2>
          <p style={{ color: 'var(--color-text-muted)', fontSize: 14, margin: '0 0 6px' }}>
            Welcome to{' '}
            <strong style={{ color: 'var(--color-text)' }}>
              {invite?.workspace?.name || 'your workspace'}
            </strong>
          </p>
          <p style={{ color: 'var(--color-text-muted)', fontFamily: "'DM Mono', monospace", fontSize: 12, margin: 0 }}>
            Redirecting to your workspace…
          </p>
        </div>
      </div>
    )
  }

  if (phase === 'invalid' || phase === 'error') {
    return (
      <div style={bg}>
        <div style={{ ...card, textAlign: 'center' }}>
          <Logo />
          <p style={{ color: '#f87171', fontSize: 14, margin: '28px 0 20px', lineHeight: 1.5 }}>
            {error || 'Something went wrong.'}
          </p>
          <button onClick={() => navigate('dashboard')} style={btnStyle}>
            Go to DesignBrief
          </button>
        </div>
      </div>
    )
  }

  const emailMismatch = authUser && authUser.email?.toLowerCase() !== invite?.invitedEmail?.toLowerCase()

  return (
    <div style={bg}>
      <div style={card}>
        <Logo />

        <div style={{ marginTop: 24, marginBottom: 24 }}>
          <h2 style={{ color: 'var(--color-text)', fontWeight: 700, fontSize: 20, margin: '0 0 6px', letterSpacing: '-0.4px' }}>
            You're invited to join
          </h2>
          <p style={{ color: 'var(--color-accent)', fontWeight: 700, fontSize: 18, margin: '0 0 10px' }}>
            {invite?.workspace?.name}
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <span style={{
              background: 'rgba(168,85,247,0.12)', border: '1px solid rgba(168,85,247,0.3)',
              color: 'var(--color-accent)', fontSize: 11, fontFamily: "'DM Mono', monospace",
              padding: '3px 9px', borderRadius: 20, textTransform: 'capitalize',
            }}>
              {invite?.role}
            </span>
            <span style={{
              background: 'var(--color-bg)', border: '1px solid var(--color-border)',
              color: 'var(--color-text-muted)', fontSize: 11, fontFamily: "'DM Mono', monospace",
              padding: '3px 9px', borderRadius: 20,
            }}>
              {invite?.invitedEmail}
            </span>
          </div>
        </div>

        {emailMismatch ? (
          <div style={{
            background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.3)',
            borderRadius: 8, padding: '12px 16px',
          }}>
            <p style={{ color: '#f87171', fontSize: 13, margin: 0, lineHeight: 1.5 }}>
              You're signed in as <strong>{authUser.email}</strong>.
              This invite was sent to <strong>{invite?.invitedEmail}</strong>.
              Please sign out and sign in with the correct account.
            </p>
          </div>
        ) : authUser ? (
          <button
            onClick={() => doAccept(token, invite)}
            style={btnStyle}
          >
            Accept Invitation
          </button>
        ) : (
          <>
            <div style={{
              display: 'flex', background: 'var(--color-bg)',
              borderRadius: 8, padding: 3, marginBottom: 20,
            }}>
              {['signin', 'signup'].map(tab => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => { setAuthTab(tab); setAuthError('') }}
                  style={{
                    flex: 1, padding: '7px 0', border: 'none', borderRadius: 6,
                    cursor: 'pointer', fontSize: 13, fontWeight: 500, transition: 'all 0.15s',
                    background: authTab === tab ? 'var(--color-surface)' : 'transparent',
                    color: authTab === tab ? 'var(--color-text)' : 'var(--color-text-muted)',
                    boxShadow: authTab === tab ? '0 1px 3px rgba(0,0,0,0.2)' : 'none',
                  }}
                >
                  {tab === 'signin' ? 'Sign In' : 'Create Account'}
                </button>
              ))}
            </div>

            <form onSubmit={handleAuth} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={labelStyle}>Email</label>
                <input
                  type="email"
                  value={invite?.invitedEmail || ''}
                  readOnly
                  style={{ ...inputStyle, opacity: 0.6, cursor: 'not-allowed' }}
                />
              </div>

              {authTab === 'signup' && (
                <div>
                  <label style={labelStyle}>Name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="Your name"
                    style={inputStyle}
                  />
                </div>
              )}

              <div>
                <label style={labelStyle}>Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  minLength={6}
                  style={inputStyle}
                />
              </div>

              {authError && (
                <p style={{ color: '#f87171', fontSize: 12, margin: 0, lineHeight: 1.5 }}>
                  {authError}
                </p>
              )}

              <button
                type="submit"
                disabled={authLoading}
                style={{ ...btnStyle, opacity: authLoading ? 0.7 : 1, marginTop: 4 }}
              >
                {authLoading
                  ? '…'
                  : authTab === 'signin'
                    ? 'Sign In & Accept'
                    : 'Create Account & Accept'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}

function Logo() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{
        width: 32, height: 32,
        background: 'linear-gradient(135deg,#7C3AED,#A855F7)',
        borderRadius: 9,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 15, color: '#fff', fontWeight: 700,
      }}>
        ✦
      </div>
      <span style={{ color: 'var(--color-text)', fontSize: 17, fontWeight: 700, letterSpacing: '-0.4px' }}>
        DesignBrief
      </span>
    </div>
  )
}

const btnStyle = {
  width: '100%',
  padding: '11px 0',
  background: 'linear-gradient(135deg,#7C3AED,#A855F7)',
  border: 'none',
  borderRadius: 10,
  color: '#fff',
  fontSize: 14,
  fontWeight: 700,
  cursor: 'pointer',
  letterSpacing: '-0.2px',
}

const inputStyle = {
  width: '100%',
  padding: '9px 12px',
  background: 'var(--color-bg)',
  border: '1px solid var(--color-border)',
  borderRadius: 8,
  color: 'var(--color-text)',
  fontSize: 14,
  boxSizing: 'border-box',
  outline: 'none',
}

const labelStyle = {
  display: 'block',
  color: 'var(--color-text-muted)',
  fontSize: 12,
  marginBottom: 5,
  fontFamily: "'DM Mono', monospace",
}
