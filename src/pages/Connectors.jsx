import React, { useState, useEffect, useCallback } from 'react'
import { useApp } from '../context/AppContext'
import { EyeIcon, EyeSlashIcon } from '@heroicons/react/24/outline'

// ── localStorage token helpers ────────────────────────────────────────────────
function getTokenKey(workspaceId, type) { return 'db-token-' + workspaceId + '-' + type }
function saveToken(workspaceId, type, value) { if (value?.trim()) localStorage.setItem(getTokenKey(workspaceId, type), value) }
function getToken(workspaceId, type) { return localStorage.getItem(getTokenKey(workspaceId, type)) || '' }
function clearToken(workspaceId, type) { localStorage.removeItem(getTokenKey(workspaceId, type)) }

function getAuthHeader() {
  try {
    const raw = localStorage.getItem('sb-' + (import.meta.env.VITE_SUPABASE_URL || '').replace(/^https?:\/\//, '').split('.')[0] + '-auth-token')
    if (raw) { const p = JSON.parse(raw); if (p?.access_token) return 'Bearer ' + p.access_token }
  } catch {}
  for (const k of Object.keys(localStorage)) {
    if (k.includes('-auth-token')) {
      try { const p = JSON.parse(localStorage.getItem(k)); if (p?.access_token) return 'Bearer ' + p.access_token } catch {}
    }
  }
  return ''
}

// ── SVG brand icons ────────────────────────────────────────────────────────────
function FigmaIcon({ style }) {
  return (
    <svg style={style} viewBox="0 0 38 57" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M19 28.5C19 25.9804 20.0009 23.5641 21.7825 21.7825C23.5641 20.0009 25.9804 19 28.5 19C31.0196 19 33.4359 20.0009 35.2175 21.7825C36.9991 23.5641 38 25.9804 38 28.5C38 31.0196 36.9991 33.4359 35.2175 35.2175C33.4359 36.9991 31.0196 38 28.5 38C25.9804 38 23.5641 36.9991 21.7825 35.2175C20.0009 33.4359 19 31.0196 19 28.5Z" fill="#1ABCFE"/>
      <path d="M0 47.5C0 44.9804 1.00089 42.5641 2.78249 40.7825C4.56408 39.0009 6.98044 38 9.5 38H19V47.5C19 50.0196 17.9991 52.4359 16.2175 54.2175C14.4359 55.9991 12.0196 57 9.5 57C6.98044 57 4.56408 55.9991 2.78249 54.2175C1.00089 52.4359 0 50.0196 0 47.5Z" fill="#0ACF83"/>
      <path d="M19 0V19H28.5C31.0196 19 33.4359 17.9991 35.2175 16.2175C36.9991 14.4359 38 12.0196 38 9.5C38 6.98044 36.9991 4.56408 35.2175 2.78249C33.4359 1.00089 31.0196 0 28.5 0H19Z" fill="#FF7262"/>
      <path d="M0 9.5C0 12.0196 1.00089 14.4359 2.78249 16.2175C4.56408 17.9991 6.98044 19 9.5 19H19V0H9.5C6.98044 0 4.56408 1.00089 2.78249 2.78249C1.00089 4.56408 0 6.98044 0 9.5Z" fill="#F24E1E"/>
      <path d="M0 28.5C0 31.0196 1.00089 33.4359 2.78249 35.2175C4.56408 36.9991 6.98044 38 9.5 38H19V19H9.5C6.98044 19 8.56408 20.0009 6.78249 21.7825C5.00089 23.5641 4 25.9804 4 28.5V28.5C4 30.0196 4.00089 33.4359 2.78249 35.2175C1.00089 33.4359 0 31.0196 0 28.5Z" fill="#FF7262"/>
      <path d="M0 28.5C0 25.9804 1.00089 23.5641 2.78249 21.7825C4.56408 20.0009 6.98044 19 9.5 19H19V38H9.5C6.98044 38 4.56408 36.9991 2.78249 35.2175C1.00089 33.4359 0 31.0196 0 28.5Z" fill="#A259FF"/>
    </svg>
  )
}

function GitHubIcon({ style }) {
  return (
    <svg style={style} viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path fillRule="evenodd" clipRule="evenodd" d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
    </svg>
  )
}

function LinearIcon({ style }) {
  return (
    <svg style={style} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M1.22541 61.5228c-.2225-.9485.90748-1.5459 1.59638-.857l36.4485 36.4484c.6889.6889.0915 1.8189-.857 1.5964C17.3712 94.4522 5.54765 82.6286 1.22541 61.5228zM.00189135 46.8891c-.01764375.2833.08887 .5599.28957.7606L52.3503 99.7085c.2007.2007.4773.3072.7606.2896 2.3336-.1452 4.6071-.4271 6.8091-.8355.3933-.0731.5…" fill="#5E6AD2"/>
      <path d="M0 52.2293c0-.2637.10483-.5167.29148-.7034L52.2293.29148C52.416.10483 52.669 0 52.9327 0 76.1607 0 95.9604 17.7538 99.3884 40.9627c.0539.3682-.0765.7408-.3484 1.0127L1.0127 99.04c-.27192.2719-.64461.4023-1.01274.3484C2.95054 96.1878.528997 74.2019 0 52.2293z" fill="#5E6AD2"/>
    </svg>
  )
}

// ── connector definitions ──────────────────────────────────────────────────────
const CONNECTORS = [
  {
    type: 'figma',
    name: 'Figma',
    tagline: 'Import colors, typography & design tokens',
    description: 'Pull your design system directly into briefs. Colors, fonts, and styles stay in sync with your Figma files.',
    accentColor: '#1ABCFE',
    Icon: FigmaIcon,
    tokenLabel: 'Personal Access Token',
    tokenPlaceholder: 'figd_…',
    tokenHelp: 'Figma → Account Settings → Security → Personal access tokens',
    tokenHelpUrl: 'https://www.figma.com/settings',
    capabilities: ['Color palettes & hex values', 'Typography & font families', 'Design token extraction', 'Auto-sync on brief generation'],
  },
  {
    type: 'github',
    name: 'GitHub',
    tagline: 'Read your repo tech stack automatically',
    description: 'Connect a repo and Designbrief reads your package.json to auto-detect your framework, styling, and dependencies.',
    accentColor: '#24292f',
    Icon: GitHubIcon,
    tokenLabel: 'Personal Access Token (optional for private repos)',
    tokenPlaceholder: 'ghp_… or leave blank for public repos',
    tokenHelp: 'GitHub → Settings → Developer settings → Personal access tokens',
    tokenHelpUrl: 'https://github.com/settings/tokens',
    capabilities: ['Framework detection', 'Dependency & library list', 'Language & styling stack', 'Feeds AI brief generation'],
  },
  {
    type: 'linear',
    name: 'Linear',
    tagline: 'Push tasks directly to your Linear team',
    description: 'Generate tasks from your brief and send them straight to Linear — with priority, status, and description.',
    accentColor: '#5E6AD2',
    Icon: LinearIcon,
    tokenLabel: 'API Key',
    tokenPlaceholder: 'lin_api_…',
    tokenHelp: 'Linear → Settings → API → Personal API keys',
    tokenHelpUrl: 'https://linear.app/settings/api',
    capabilities: ['Create issues from tasks', 'Map priority & status', 'Link to Linear team', 'One-click push from brief'],
  },
]

// ── main page ──────────────────────────────────────────────────────────────────
export default function Connectors() {
  const { workspace } = useApp()
  const wsId = workspace?.id

  const [installed, setInstalled] = useState({ figma: false, github: false, linear: false })
  const [hints, setHints] = useState({ figma: null, github: null, linear: null })
  const [loading, setLoading] = useState({})
  const [error, setError] = useState({})
  const [success, setSuccess] = useState({})

  const loadStatus = useCallback(async () => {
    if (!wsId) return
    try {
      const r = await fetch('/api/connectors/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': getAuthHeader() },
        body: JSON.stringify({ workspaceId: wsId }),
      })
      if (r.ok) {
        const d = await r.json()
        setInstalled(d.installed || { figma: false, github: false, linear: false })
        setHints(d.hints || {})
      }
    } catch {}
  }, [wsId])

  useEffect(() => { loadStatus() }, [loadStatus])

  async function handleInstall(type, token) {
    if (!wsId) return
    setLoading(l => ({ ...l, [type]: true }))
    setError(e => ({ ...e, [type]: null }))
    setSuccess(s => ({ ...s, [type]: null }))
    try {
      const body = { action: 'install', workspaceId: wsId }
      if (type === 'figma') body.figmaToken = token
      if (type === 'github') body.githubToken = token
      if (type === 'linear') body.linearToken = token
      const r = await fetch('/api/connectors/' + type, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': getAuthHeader() },
        body: JSON.stringify(body),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Install failed')
      if (token) saveToken(wsId, type, token)
      setInstalled(i => ({ ...i, [type]: true }))
      setHints(h => ({ ...h, [type]: token ? '…' + token.slice(-4) : null }))
      setSuccess(s => ({ ...s, [type]: (d.user ? 'Connected as ' + d.user : 'Installed successfully') }))
      await loadStatus()
    } catch (e) {
      setError(er => ({ ...er, [type]: e.message }))
    } finally {
      setLoading(l => ({ ...l, [type]: false }))
    }
  }

  async function handleUninstall(type) {
    if (!wsId) return
    setLoading(l => ({ ...l, [type]: true }))
    setError(e => ({ ...e, [type]: null }))
    setSuccess(s => ({ ...s, [type]: null }))
    try {
      const r = await fetch('/api/connectors/' + type, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': getAuthHeader() },
        body: JSON.stringify({ action: 'uninstall', workspaceId: wsId }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Uninstall failed')
      clearToken(wsId, type)
      setInstalled(i => ({ ...i, [type]: false }))
      setHints(h => ({ ...h, [type]: null }))
    } catch (e) {
      setError(er => ({ ...er, [type]: e.message }))
    } finally {
      setLoading(l => ({ ...l, [type]: false }))
    }
  }

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '40px 24px' }}>
      <div style={{ marginBottom: 40 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: '#111', margin: 0 }}>Integrations</h1>
        <p style={{ color: '#6b7280', marginTop: 6, fontSize: 15 }}>
          Connect your tools to supercharge AI-generated briefs.
        </p>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {CONNECTORS.map(cfg => (
          <IntegrationCard
            key={cfg.type}
            {...cfg}
            workspaceId={wsId}
            installed={installed[cfg.type]}
            hint={hints[cfg.type]}
            loading={!!loading[cfg.type]}
            error={error[cfg.type]}
            success={success[cfg.type]}
            onInstall={token => handleInstall(cfg.type, token)}
            onUninstall={() => handleUninstall(cfg.type)}
          />
        ))}
      </div>
    </div>
  )
}

// ── IntegrationCard ────────────────────────────────────────────────────────────
function IntegrationCard({
  type, name, tagline, description, accentColor, Icon,
  tokenLabel, tokenPlaceholder, tokenHelp, tokenHelpUrl, capabilities,
  installed, hint, loading, error, success,
  workspaceId, onInstall, onUninstall,
}) {
  const [expanded, setExpanded] = useState(false)
  const [token, setToken] = useState('')
  const [showToken, setShowToken] = useState(false)

  useEffect(() => {
    if (workspaceId) setToken(getToken(workspaceId, type))
  }, [workspaceId, type])

  useEffect(() => {
    if (installed) setExpanded(false)
  }, [installed])

  function handleInstallClick() {
    onInstall(token)
  }

  return (
    <div style={{
      border: '1px solid',
      borderColor: installed ? accentColor + '55' : '#e5e7eb',
      borderRadius: 14,
      background: installed ? accentColor + '08' : '#fff',
      overflow: 'hidden',
      transition: 'border-color 0.2s, background 0.2s',
    }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '20px 24px' }}>
        <div style={{
          width: 48, height: 48, borderRadius: 12,
          background: installed ? accentColor + '18' : '#f3f4f6',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          <Icon style={{ width: 28, height: 28, color: installed ? accentColor : '#6b7280' }} />
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontWeight: 600, fontSize: 16, color: '#111' }}>{name}</span>
            {installed && (
              <span style={{
                fontSize: 11, fontWeight: 600, color: accentColor,
                background: accentColor + '18', borderRadius: 20,
                padding: '2px 8px', letterSpacing: 0.3,
              }}>Installed</span>
            )}
          </div>
          <p style={{ color: '#6b7280', fontSize: 13, margin: '2px 0 0', lineHeight: 1.4 }}>
            {installed && hint ? 'Token ending …' + hint.slice(-4) : tagline}
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          {installed ? (
            <button
              onClick={onUninstall}
              disabled={loading}
              style={{
                padding: '7px 16px', borderRadius: 8, fontSize: 13, fontWeight: 500,
                border: '1px solid #fca5a5', background: '#fff', color: '#dc2626',
                cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1,
              }}
            >
              {loading ? 'Removing…' : 'Uninstall'}
            </button>
          ) : (
            <button
              onClick={() => setExpanded(e => !e)}
              style={{
                padding: '7px 16px', borderRadius: 8, fontSize: 13, fontWeight: 500,
                border: '1px solid ' + accentColor,
                background: expanded ? accentColor : '#fff',
                color: expanded ? '#fff' : accentColor,
                cursor: 'pointer', transition: 'all 0.15s',
              }}
            >
              {expanded ? 'Cancel' : 'Install'}
            </button>
          )}
        </div>
      </div>

      {/* Installed: capabilities strip */}
      {installed && (
        <div style={{ padding: '0 24px 20px', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {capabilities.map(cap => (
            <span key={cap} style={{
              display: 'flex', alignItems: 'center', gap: 4,
              fontSize: 12, color: accentColor, background: accentColor + '12',
              borderRadius: 20, padding: '3px 10px',
            }}>
              <svg viewBox="0 0 20 20" fill="currentColor" style={{ width: 12, height: 12 }}>
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
              </svg>
              {cap}
            </span>
          ))}
        </div>
      )}

      {/* Expanded: install form */}
      {!installed && expanded && (
        <div style={{ padding: '0 24px 24px', borderTop: '1px solid #f3f4f6' }}>
          <p style={{ color: '#374151', fontSize: 14, margin: '16px 0 12px', lineHeight: 1.6 }}>{description}</p>

          {/* Capabilities */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 20 }}>
            {capabilities.map(cap => (
              <span key={cap} style={{
                fontSize: 12, color: '#6b7280', background: '#f9fafb',
                borderRadius: 20, padding: '3px 10px', border: '1px solid #e5e7eb',
              }}>
                {cap}
              </span>
            ))}
          </div>

          {/* Token input */}
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
              {tokenLabel}
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ position: 'relative', flex: 1 }}>
                <input
                  type={showToken ? 'text' : 'password'}
                  value={token}
                  onChange={e => setToken(e.target.value)}
                  placeholder={tokenPlaceholder}
                  style={{
                    width: '100%', padding: '8px 36px 8px 12px', borderRadius: 8,
                    border: '1px solid #d1d5db', fontSize: 13, outline: 'none',
                    fontFamily: 'monospace', boxSizing: 'border-box',
                  }}
                  onKeyDown={e => { if (e.key === 'Enter') handleInstallClick() }}
                />
                <button
                  onClick={() => setShowToken(s => !s)}
                  style={{
                    position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', cursor: 'pointer', padding: 2,
                    color: '#9ca3af',
                  }}
                >
                  {showToken
                    ? <EyeSlashIcon style={{ width: 16, height: 16 }} />
                    : <EyeIcon style={{ width: 16, height: 16 }} />}
                </button>
              </div>
              <button
                onClick={handleInstallClick}
                disabled={loading || (type !== 'github' && !token.trim())}
                style={{
                  padding: '8px 18px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                  background: accentColor, color: '#fff', border: 'none',
                  cursor: (loading || (type !== 'github' && !token.trim())) ? 'not-allowed' : 'pointer',
                  opacity: (loading || (type !== 'github' && !token.trim())) ? 0.5 : 1,
                  whiteSpace: 'nowrap',
                }}
              >
                {loading ? 'Installing…' : 'Install'}
              </button>
            </div>
          </div>

          {/* Help text */}
          <p style={{ fontSize: 12, color: '#9ca3af', margin: '6px 0 0' }}>
            {tokenHelp}.{' '}
            <a href={tokenHelpUrl} target="_blank" rel="noopener noreferrer" style={{ color: accentColor }}>
              Open settings ↗
            </a>
          </p>

          {/* Error / success */}
          {error && (
            <div style={{ marginTop: 12, padding: '8px 12px', background: '#fef2f2', borderRadius: 8, fontSize: 13, color: '#dc2626' }}>
              {error}
            </div>
          )}
          {success && (
            <div style={{ marginTop: 12, padding: '8px 12px', background: '#f0fdf4', borderRadius: 8, fontSize: 13, color: '#16a34a' }}>
              {success}
            </div>
          )}
        </div>
      )}

      {/* Installed: error/success banners */}
      {installed && (error || success) && (
        <div style={{ padding: '0 24px 16px' }}>
          {error && (
            <div style={{ padding: '8px 12px', background: '#fef2f2', borderRadius: 8, fontSize: 13, color: '#dc2626' }}>
              {error}
            </div>
          )}
          {success && (
            <div style={{ padding: '8px 12px', background: '#f0fdf4', borderRadius: 8, fontSize: 13, color: '#16a34a' }}>
              {success}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
