import { useState } from 'react'
import {
  SparklesIcon,
  BuildingOffice2Icon,
  ArrowRightIcon,
  CheckIcon,
} from '@heroicons/react/24/outline'

export default function WorkspaceSetup({ user, onComplete }) {
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const suggested = user?.email
    ? user.email
        .split('@')[0]
        .replace(/[^a-zA-Z0-9]/g, ' ')
        .replace(/\b\w/g, l => l.toUpperCase())
        .trim() + "'s Workspace"
    : ''

  async function handleCreate() {
    const wsName = name.trim()
    if (!wsName) return

    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/create-workspace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          workspaceName: wsName,
          plan: 'free',
        }),
      })

      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error || 'Failed to create workspace')
      }

      const { workspace } = await res.json()
      onComplete(workspace)
    } catch (e) {
      setError(e.message)
      setLoading(false)
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--gradient-hero)',
        padding: 24,
        position: 'relative',
        overflow: 'hidden',
        fontFamily: 'var(--font-sans)',
      }}
    >
      {/* Dot grid texture */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage:
            'radial-gradient(circle, var(--color-border) 1px, transparent 1px)',
          backgroundSize: '24px 24px',
          opacity: 0.6,
          pointerEvents: 'none',
          maskImage:
            'radial-gradient(ellipse 80% 80% at 50% 50%, black 0%, transparent 100%)',
          WebkitMaskImage:
            'radial-gradient(ellipse 80% 80% at 50% 50%, black 0%, transparent 100%)',
        }}
      />

      <div
        style={{
          width: '100%',
          maxWidth: 460,
          position: 'relative',
          zIndex: 1,
        }}
      >
        {/* Logo mark */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 32 }}>
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 'var(--radius-lg)',
              background:
                'linear-gradient(135deg, var(--color-accent) 0%, var(--color-accent-2) 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: 'var(--shadow-lg)',
            }}
          >
            <SparklesIcon style={{ width: 22, height: 22, color: 'white' }} />
          </div>
        </div>

        {/* Heading */}
        <h1
          style={{
            textAlign: 'center',
            fontWeight: 800,
            fontSize: 28,
            letterSpacing: '-0.04em',
            color: 'var(--color-text)',
            marginBottom: 8,
            lineHeight: 1.1,
          }}
        >
          Create your workspace
        </h1>
        <p
          style={{
            textAlign: 'center',
            fontSize: 14,
            color: 'var(--color-text-muted)',
            lineHeight: 1.65,
            maxWidth: 340,
            margin: '0 auto 32px',
          }}
        >
          Your workspace is where your briefs, projects, and team live. You can
          rename it anytime.
        </p>

        {/* Card */}
        <div
          style={{
            background: 'var(--color-card)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-xl)',
            padding: 28,
            boxShadow: 'var(--shadow-xl)',
          }}
        >
          {/* Label */}
          <label
            style={{
              display: 'block',
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--color-text-muted)',
              marginBottom: 8,
            }}
          >
            Workspace name
          </label>

          {/* Input */}
          <div style={{ position: 'relative' }}>
            <div
              style={{
                position: 'absolute',
                left: 12,
                top: '50%',
                transform: 'translateY(-50%)',
                pointerEvents: 'none',
              }}
            >
              <BuildingOffice2Icon
                style={{ width: 15, height: 15, color: 'var(--color-text-muted)' }}
              />
            </div>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleCreate() }}
              placeholder={suggested || 'e.g. Acme Studio'}
              autoFocus
              style={{
                width: '100%',
                background: 'var(--color-surface)',
                border: '1.5px solid var(--color-border)',
                borderRadius: 'var(--radius-md)',
                padding: '11px 14px 11px 38px',
                fontFamily: 'var(--font-sans)',
                fontSize: 14,
                fontWeight: 500,
                color: 'var(--color-text)',
                outline: 'none',
                boxSizing: 'border-box',
              }}
              onFocus={e => {
                e.target.style.borderColor = 'var(--color-accent)'
                e.target.style.boxShadow = '0 0 0 3px var(--color-accent-soft)'
              }}
              onBlur={e => {
                e.target.style.borderColor = 'var(--color-border)'
                e.target.style.boxShadow = 'none'
              }}
            />
          </div>

          {error && (
            <p style={{ fontSize: 12, color: '#dc2626', marginTop: 6, fontWeight: 500 }}>
              {error}
            </p>
          )}

          {/* Plan info */}
          <div
            style={{
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-md)',
              padding: '12px 14px',
              marginTop: 16,
              marginBottom: 20,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 7,
                marginBottom: 8,
              }}
            >
              <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--color-text)' }}>
                Free plan
              </span>
              <span
                style={{
                  background: 'var(--color-accent-soft)',
                  border: '1px solid rgba(13,148,136,0.2)',
                  borderRadius: 'var(--radius-full)',
                  padding: '1px 8px',
                  fontSize: 10,
                  fontWeight: 700,
                  color: 'var(--color-accent)',
                  fontFamily: 'var(--font-mono)',
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                }}
              >
                FREE
              </span>
            </div>

            {[
              '50 AI credits per day',
              'Resets at midnight UTC',
              '3 active projects',
              '1 client intake form',
            ].map((item, i, arr) => (
              <div
                key={item}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 7,
                  marginBottom: i < arr.length - 1 ? 5 : 0,
                }}
              >
                <CheckIcon
                  style={{ width: 13, height: 13, color: 'var(--color-accent)', flexShrink: 0 }}
                />
                <span style={{ fontSize: 12, color: 'var(--color-text-soft)', fontWeight: 400 }}>
                  {item}
                </span>
              </div>
            ))}
          </div>

          {/* CTA */}
          <button
            onClick={handleCreate}
            disabled={loading || !name.trim()}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              padding: '12px 24px',
              background: !name.trim()
                ? 'var(--color-surface-2)'
                : loading
                  ? 'var(--color-border)'
                  : 'var(--color-primary)',
              color: !name.trim()
                ? 'var(--color-text-muted)'
                : loading
                  ? 'var(--color-text-muted)'
                  : 'var(--color-primary-text)',
              border: `1px solid ${!name.trim() ? 'var(--color-border)' : 'transparent'}`,
              borderRadius: 'var(--radius-md)',
              cursor: !name.trim() || loading ? 'not-allowed' : 'pointer',
              fontFamily: 'var(--font-sans)',
              fontWeight: 700,
              fontSize: 14,
              letterSpacing: '-0.01em',
              transition: 'var(--transition-base)',
              boxShadow: !name.trim() || loading ? 'none' : 'var(--shadow-sm)',
              transform: 'translateY(0)',
            }}
            onMouseEnter={e => {
              if (name.trim() && !loading) {
                e.currentTarget.style.transform = 'translateY(-1px)'
                e.currentTarget.style.boxShadow = 'var(--shadow-md)'
              }
            }}
            onMouseLeave={e => {
              e.currentTarget.style.transform = 'translateY(0)'
              e.currentTarget.style.boxShadow = name.trim() && !loading ? 'var(--shadow-sm)' : 'none'
            }}
          >
            {loading ? (
              'Creating...'
            ) : !name.trim() ? (
              'Enter a workspace name'
            ) : (
              <>
                Create workspace
                <ArrowRightIcon style={{ width: 15, height: 15 }} />
              </>
            )}
          </button>
        </div>

        {/* Footer note */}
        <p
          style={{
            textAlign: 'center',
            fontSize: 11,
            color: 'var(--color-text-muted)',
            marginTop: 16,
            fontFamily: 'var(--font-mono)',
            letterSpacing: '0.02em',
          }}
        >
          You can upgrade to Pro anytime →
        </p>
      </div>
    </div>
  )
}
