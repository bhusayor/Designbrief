import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { Input } from '../components/ui'

export default function Auth() {
  const [tab, setTab] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)

  // ── Handlers ────────────────────────────────────────────────────────────────

  async function handleSignup() {
    setError(null)
    setSuccess(null)

    if (!fullName.trim()) {
      setError('Please enter your full name')
      return
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }

    setLoading(true)
    try {
      const { error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { data: { full_name: fullName.trim() } },
      })
      if (signUpError) {
        setError(signUpError.message)
      } else {
        setSuccess('Account created! Please check your email to verify.')
      }
    } catch (e) {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  async function handleLogin() {
    setError(null)
    setSuccess(null)
    setLoading(true)
    try {
      const { error: loginError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      })
      if (loginError) setError(loginError.message)
      // AppContext onAuthStateChange handles the redirect
    } catch (e) {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  async function handleGoogleAuth() {
    setError(null)
    try {
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin },
      })
      if (oauthError) setError(oauthError.message)
    } catch (e) {
      setError('Google sign-in failed. Please try again.')
    }
  }

  function handleSubmit() {
    if (!email.trim() || !password) return
    if (tab === 'login') handleLogin()
    else handleSignup()
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') handleSubmit()
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', background: 'var(--color-bg)', padding: 24,
    }}>
      <div style={{
        maxWidth: 420, width: '100%',
        background: 'var(--color-card)',
        border: '1px solid var(--color-border)',
        borderRadius: 20, padding: '36px 32px',
        boxShadow: 'var(--shadow-modal)',
        animation: 'fadeUp 0.3s ease',
      }}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 12,
            background: 'var(--color-text)', margin: '0 auto 14px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 18, color: 'var(--color-bg)',
          }}>✦</div>
          <div style={{
            fontFamily: "'Urbanist', sans-serif", fontWeight: 800, fontSize: 22,
            color: 'var(--color-text)', letterSpacing: '-0.02em',
          }}>DesignBrief AI</div>
          <div style={{
            fontFamily: "'DM Mono', monospace", fontSize: 11,
            color: 'var(--color-text-muted)', marginTop: 4,
          }}>The only briefing platform that thinks</div>
        </div>

        {/* Tab switcher */}
        <div style={{
          background: 'var(--color-surface)', borderRadius: 10,
          padding: 4, display: 'flex', marginBottom: 24,
        }}>
          {['login', 'signup'].map(t => (
            <button
              key={t}
              onClick={() => { setTab(t); setError(null); setSuccess(null) }}
              style={{
                flex: 1, borderRadius: 8, padding: '8px 0', textAlign: 'center',
                fontFamily: "'Urbanist', sans-serif", fontWeight: 600, fontSize: 13,
                cursor: 'pointer', transition: 'all 0.15s', border: 'none',
                background: tab === t ? 'var(--color-card)' : 'transparent',
                border: tab === t ? '1px solid var(--color-border)' : '1px solid transparent',
                color: tab === t ? 'var(--color-text)' : 'var(--color-text-muted)',
                boxShadow: tab === t ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              }}
            >
              {t === 'login' ? 'Login' : 'Sign Up'}
            </button>
          ))}
        </div>

        {/* Form */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {tab === 'signup' && (
            <Input
              label="Full Name"
              placeholder="Peter Omidiji"
              value={fullName}
              onChange={e => setFullName(e.target.value)}
              onKeyDown={handleKeyDown}
              full
            />
          )}

          <Input
            label="Email"
            type="email"
            placeholder="you@studio.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
            onKeyDown={handleKeyDown}
            full
          />

          <Input
            label="Password"
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={handleKeyDown}
            hint={tab === 'signup' ? 'Minimum 8 characters' : null}
            full
          />

          {/* Error */}
          {error && (
            <div style={{
              background: 'color-mix(in srgb, var(--color-red) 8%, transparent)',
              border: '1px solid color-mix(in srgb, var(--color-red) 30%, transparent)',
              borderRadius: 8, padding: '10px 14px',
              fontFamily: "'DM Mono', monospace", fontSize: 12,
              color: 'var(--color-red)', lineHeight: 1.5,
            }}>{error}</div>
          )}

          {/* Success */}
          {success && (
            <div style={{
              background: 'color-mix(in srgb, var(--color-green) 8%, transparent)',
              border: '1px solid color-mix(in srgb, var(--color-green) 30%, transparent)',
              borderRadius: 8, padding: '10px 14px',
              fontFamily: "'DM Mono', monospace", fontSize: 12,
              color: 'var(--color-green)', lineHeight: 1.5,
            }}>{success}</div>
          )}

          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={loading || !email.trim() || !password}
            style={{
              width: '100%', background: 'var(--color-text)', border: 'none',
              borderRadius: 10, padding: '12px 0',
              fontFamily: "'Urbanist', sans-serif", fontWeight: 700, fontSize: 14,
              color: 'var(--color-bg)', cursor: loading || !email.trim() || !password ? 'default' : 'pointer',
              opacity: loading || !email.trim() || !password ? 0.5 : 1,
              transition: 'opacity 0.15s',
            }}
          >
            {loading
              ? 'Please wait...'
              : tab === 'login' ? 'Sign In →' : 'Create Account →'}
          </button>

          {/* Divider */}
          {false && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ flex: 1, height: 1, background: 'var(--color-border)' }} />
            <span style={{
              fontFamily: "'DM Mono', monospace", fontSize: 11,
              color: 'var(--color-text-muted)',
            }}>or continue with</span>
            <div style={{ flex: 1, height: 1, background: 'var(--color-border)' }} />
          </div>
          )}

          {/* Google OAuth */}
          {false && (
          <button
            onClick={handleGoogleAuth}
            style={{
              width: '100%', background: 'var(--color-surface)',
              border: '1px solid var(--color-border)', borderRadius: 10, padding: '11px 0',
              fontFamily: "'Urbanist', sans-serif", fontWeight: 600, fontSize: 13,
              color: 'var(--color-text)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              transition: 'border-color 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--color-border-hover)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--color-border)' }}
          >
            <span style={{
              fontFamily: "'Urbanist', sans-serif", fontWeight: 800, fontSize: 14,
              color: 'var(--color-accent)',
            }}>G</span>
            Continue with Google
          </button>
          )}

          {/* Tab switch */}
          <div style={{
            fontFamily: "'DM Mono', monospace", fontSize: 12,
            color: 'var(--color-text-muted)', textAlign: 'center',
          }}>
            {tab === 'login' ? (
              <>Don't have an account?{' '}
                <button
                  onClick={() => { setTab('signup'); setError(null); setSuccess(null) }}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--color-accent)', fontFamily: "'DM Mono', monospace",
                    fontSize: 12, padding: 0, fontWeight: 600,
                  }}
                >Sign up free</button>
              </>
            ) : (
              <>Already have an account?{' '}
                <button
                  onClick={() => { setTab('login'); setError(null); setSuccess(null) }}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--color-accent)', fontFamily: "'DM Mono', monospace",
                    fontSize: 12, padding: 0, fontWeight: 600,
                  }}
                >Sign in</button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
