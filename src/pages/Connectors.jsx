import React, { useState, useEffect } from 'react'
import { useApp } from '../context/AppContext'
import { supabase } from '../lib/supabase'
import { authedFetch, getAuthHeader } from '../lib/getAuthHeader'
import {
  MagnifyingGlassIcon,
  ArrowLeftIcon,
  CheckCircleIcon,
  EyeIcon,
  EyeSlashIcon,
  ArrowTopRightOnSquareIcon,
  Cog6ToothIcon,
  PlusIcon,
  ExclamationCircleIcon,
} from '@heroicons/react/24/outline'

// ── Token helpers (localStorage only) ──────────────────────────────────────────
function getTokenKey(wsId, type) { return 'db-token-' + wsId + '-' + type }
function saveToken(wsId, type, val) { if (val?.trim()) localStorage.setItem(getTokenKey(wsId, type), val) }
function getToken(wsId, type) { return localStorage.getItem(getTokenKey(wsId, type)) || '' }
function clearToken(wsId, type) { localStorage.removeItem(getTokenKey(wsId, type)) }

// ── Brand SVG icons ────────────────────────────────────────────────────────────
function FigmaLogo({ size = 32 }) {
  return (
    <svg width={size} height={size * 1.5} viewBox="0 0 38 57" fill="none">
      <path d="M19 28.5a9.5 9.5 0 1 1 19 0 9.5 9.5 0 0 1-19 0z" fill="#1ABCFE"/>
      <path d="M0 47.5A9.5 9.5 0 0 1 9.5 38H19v9.5a9.5 9.5 0 1 1-19 0z" fill="#0ACF83"/>
      <path d="M19 0v19h9.5a9.5 9.5 0 1 0 0-19H19z" fill="#FF7262"/>
      <path d="M0 9.5A9.5 9.5 0 0 0 9.5 19H19V0H9.5A9.5 9.5 0 0 0 0 9.5z" fill="#F24E1E"/>
      <path d="M0 28.5A9.5 9.5 0 0 0 9.5 38H19V19H9.5A9.5 9.5 0 0 0 0 28.5z" fill="#FF7262"/>
    </svg>
  )
}

function GitHubLogo({ size = 32, color }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color || 'currentColor'}>
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/>
    </svg>
  )
}

function LinearLogo({ size = 32, color }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill={color || '#5E6AD2'}>
      <path d="M1.22541 61.5228c-.2225-.9485.90748-1.5459 1.59638-.857l37.4647 37.4648c.6889.6889.0915 1.8189-.857 1.5964C20.0515 94.4522 5.54779 79.9485 1.22541 61.5228zM.00189 46.8891c-.01764 1.1768.92748 2.3339 1.02777 3.4728L52.1109 99.9981c1.1768.0176 2.3339.0077 3.4728-.0277L.02966 46.6628c-.03549 1.0617-.04474 1.5734-.02777 2.2263zM5.91288 27.2783c-.4681-.7927.3124-1.7133 1.1762-1.3938L72.9214 92.9138c.3195.8639-.6011 1.6445-1.3938 1.1762C58.1808 86.8084 14.1973 42.8248 5.91288 27.2783zM16.1427 13.4795c-.5292-.6892.1312-1.6472.9425-1.3942l71.4237 71.4238c.253.8113-.705 1.4717-1.3942.9425C74.5437 73.2108 26.8467 25.5138 16.1427 13.4795z"/>
    </svg>
  )
}

// ── Connector definitions ──────────────────────────────────────────────────────
const CONNECTORS = [
  {
    id: 'figma',
    name: 'Figma',
    tagline: 'Import colors, typography & design tokens',
    description:
      'Pull your design system directly into briefs. ' +
      'Colors, fonts, and styles stay in sync with ' +
      'your Figma files. When you translate a brief, ' +
      'DesignBrief AI uses your actual brand tokens ' +
      'instead of generating generic ones.',
    accentColor: '#A259FF',
    bgColor: 'rgba(162,89,255,0.08)',
    popularity: 'Popular',
    Logo: FigmaLogo,
    logoColor: null,
    tools: ['color_styles', 'text_styles', 'font_families', 'design_tokens', 'auto_sync'],
    tokenLabel: 'Personal Access Token',
    tokenPlaceholder: 'figd_...',
    tokenHelp: 'Figma → Account Settings → Security → Personal access tokens',
    tokenHelpUrl: 'https://www.figma.com/settings',
    tokenRequired: true,
  },
  {
    id: 'github',
    name: 'GitHub',
    tagline: 'Read your repo tech stack automatically',
    description:
      'Connect a repo and DesignBrief reads your ' +
      'package.json to auto-detect your framework, ' +
      'styling, and dependencies. The AI prompt ' +
      'generator then extends what you have instead ' +
      'of suggesting a completely new stack.',
    accentColor: '#24292F',
    bgColor: 'rgba(36,41,47,0.06)',
    popularity: null,
    Logo: GitHubLogo,
    logoColor: 'var(--color-text)',
    tools: ['framework_detection', 'dependency_list', 'language_detection', 'styling_stack', 'feeds_brief_generation'],
    tokenLabel: 'Personal Access Token (optional for private repos)',
    tokenPlaceholder: 'ghp_... or leave blank for public repos',
    tokenHelp: 'GitHub → Settings → Developer settings → Personal access tokens',
    tokenHelpUrl: 'https://github.com/settings/tokens',
    tokenRequired: false,
  },
  {
    id: 'linear',
    name: 'Linear',
    tagline: 'Push tasks directly to your Linear team',
    description:
      'Generate tasks from your brief and send them ' +
      'straight to Linear — with priority, status, and ' +
      'description. Your Team Collab board maps directly ' +
      'to Linear workflow states. One-click push from ' +
      'inside the task board.',
    accentColor: '#5E6AD2',
    bgColor: 'rgba(94,106,210,0.08)',
    popularity: null,
    Logo: LinearLogo,
    logoColor: '#5E6AD2',
    tools: ['create_issues', 'map_priority_status', 'link_linear_team', 'one_click_push'],
    tokenLabel: 'API Key',
    tokenPlaceholder: 'lin_api_...',
    tokenHelp: 'Linear → Settings → API → Personal API keys',
    tokenHelpUrl: 'https://linear.app/settings/api',
    tokenRequired: true,
  },
]

// ── Install Modal ──────────────────────────────────────────────────────────────
function InstallModal({ connector, installed, hint, workspaceId, onClose, onInstalled, onUninstalled }) {
  const [token, setToken] = useState('')
  const [showToken, setShowToken] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const { Logo, accentColor } = connector

  async function handleInstall() {
    if (connector.tokenRequired && !token.trim()) return
    setLoading(true)
    setError('')
    try {
      const headers = await getAuthHeader()
      if (!headers) {
        setError('Session expired. Please refresh the page.')
        setLoading(false)
        return
      }

      if (token.trim()) saveToken(workspaceId, connector.id, token.trim())

      const body = { type: connector.id, action: 'install', workspaceId, projectId: 'workspace' }
      if (connector.id === 'figma') body.figmaToken = token.trim() || getToken(workspaceId, 'figma')
      if (connector.id === 'github') body.githubToken = token.trim() || getToken(workspaceId, 'github')
      if (connector.id === 'linear') body.linearToken = token.trim() || getToken(workspaceId, 'linear')

      const res = await fetch('/api/connectors/' + connector.id, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Install failed')

      setSuccess(data.user ? 'Connected as ' + data.user : 'Installed successfully')
      setToken('')
      setTimeout(() => { onInstalled(); onClose() }, 1200)
    } catch (e) {
      setError(e.message)
      if (token.trim()) clearToken(workspaceId, connector.id)
    } finally {
      setLoading(false)
    }
  }

  async function handleUninstall() {
    if (!confirm('Uninstall ' + connector.name + '? It will be removed from all projects in this workspace.')) return
    setLoading(true)
    try {
      const headers = await getAuthHeader()
      if (!headers) { setLoading(false); return }
      clearToken(workspaceId, connector.id)
      await fetch('/api/connectors/' + connector.id, {
        method: 'POST',
        headers,
        body: JSON.stringify({ type: connector.id, action: 'uninstall', workspaceId, projectId: 'workspace' }),
      })
      onUninstalled()
      onClose()
    } finally {
      setLoading(false)
    }
  }

  const canInstall = connector.tokenRequired ? token.trim().length > 0 : true

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.55)',
        zIndex: 300,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
        backdropFilter: 'blur(6px)',
        animation: 'fadeIn 0.15s ease',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--color-bg)',
          border: '1px solid var(--color-border)',
          borderRadius: 20,
          width: '100%', maxWidth: 560,
          overflow: 'hidden',
          boxShadow: '0 24px 64px rgba(0,0,0,0.3)',
          animation: 'scaleIn 0.2s ease',
          fontFamily: "'Urbanist', sans-serif",
        }}
      >
        {/* Modal header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 20px',
          borderBottom: '1px solid var(--color-border)',
        }}>
          <button
            onClick={onClose}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: 'none', border: 'none', cursor: 'pointer',
              fontFamily: "'Urbanist', sans-serif",
              fontSize: 13, fontWeight: 600,
              color: 'var(--color-text-muted)', padding: 0,
            }}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--color-text)' }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--color-text-muted)' }}
          >
            <ArrowLeftIcon style={{ width: 15, height: 15 }}/>
            Back
          </button>

          {installed ? (
            <button
              onClick={handleUninstall}
              disabled={loading}
              style={{
                padding: '8px 20px',
                background: 'transparent',
                border: '1px solid var(--color-border)',
                borderRadius: 10, cursor: 'pointer',
                fontFamily: "'Urbanist', sans-serif",
                fontSize: 13, fontWeight: 600,
                color: 'var(--color-text-muted)',
                transition: 'all 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.color = '#dc2626'; e.currentTarget.style.borderColor = '#dc2626' }}
              onMouseLeave={e => { e.currentTarget.style.color = 'var(--color-text-muted)'; e.currentTarget.style.borderColor = 'var(--color-border)' }}
            >
              Uninstall
            </button>
          ) : (
            <button
              onClick={handleInstall}
              disabled={loading || !canInstall}
              style={{
                padding: '8px 24px',
                background: !canInstall || loading ? 'var(--color-border)' : accentColor,
                color: 'white', border: 'none', borderRadius: 10,
                cursor: !canInstall || loading ? 'not-allowed' : 'pointer',
                fontFamily: "'Urbanist', sans-serif",
                fontSize: 13, fontWeight: 700,
                transition: 'all 0.15s',
                boxShadow: !canInstall || loading ? 'none' : '0 2px 8px ' + accentColor + '40',
              }}
            >
              {loading ? 'Connecting...' : success ? 'Connected ✓' : 'Connect'}
            </button>
          )}
        </div>

        {/* Modal body */}
        <div style={{ padding: '24px 28px 28px' }}>
          {/* Logo + name */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
            <div style={{
              width: 52, height: 52, borderRadius: 14,
              background: connector.bgColor,
              border: '1px solid var(--color-border)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              <Logo size={24} color={connector.logoColor}/>
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                <h2 style={{
                  fontWeight: 800, fontSize: 20,
                  letterSpacing: '-0.03em',
                  color: 'var(--color-text)', margin: 0,
                }}>
                  {connector.name}
                </h2>
                {installed && (
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    background: '#F0FDF4',
                    border: '1px solid #BBF7D0',
                    borderRadius: 100, padding: '2px 9px',
                    fontFamily: 'monospace',
                    fontSize: 9, fontWeight: 700, color: '#16a34a',
                    letterSpacing: '0.06em', textTransform: 'uppercase',
                  }}>
                    <CheckCircleIcon style={{ width: 9, height: 9 }}/>
                    Installed{hint && ' · ••' + hint}
                  </span>
                )}
              </div>
              <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
                {connector.tagline}
              </div>
            </div>
          </div>

          {/* Description */}
          <p style={{
            fontSize: 14, color: 'var(--color-text-soft)',
            lineHeight: 1.7, marginBottom: 20,
          }}>
            {connector.description}
          </p>

          {/* Tools section */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--color-text)' }}>
                Tools
              </span>
              <span style={{
                fontFamily: 'monospace', fontSize: 11,
                color: 'var(--color-text-muted)',
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                borderRadius: 100, padding: '0px 7px',
              }}>
                {connector.tools.length}
              </span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
              {connector.tools.map(tool => (
                <span key={tool} style={{
                  fontFamily: 'monospace', fontSize: 11, fontWeight: 500,
                  color: 'var(--color-text-soft)',
                  background: 'var(--color-surface)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 8, padding: '4px 10px',
                }}>
                  {tool}
                </span>
              ))}
            </div>
          </div>

          {/* Divider */}
          <div style={{ height: 1, background: 'var(--color-border)', marginBottom: 20 }}/>

          {/* Token input — only when not installed */}
          {!installed && (
            <div>
              <label style={{
                display: 'block',
                fontFamily: 'monospace',
                fontSize: 10, fontWeight: 700,
                letterSpacing: '0.08em', textTransform: 'uppercase',
                color: 'var(--color-text-muted)',
                marginBottom: 8,
              }}>
                {connector.tokenLabel}
              </label>

              <div style={{ position: 'relative', marginBottom: 8 }}>
                <input
                  type={showToken ? 'text' : 'password'}
                  value={token}
                  onChange={e => { setToken(e.target.value); setError('') }}
                  onKeyDown={e => { if (e.key === 'Enter' && canInstall) handleInstall() }}
                  placeholder={connector.tokenPlaceholder}
                  autoFocus
                  style={{
                    width: '100%',
                    background: 'var(--color-surface)',
                    border: '1.5px solid var(--color-border)',
                    borderRadius: 10,
                    padding: '11px 44px 11px 14px',
                    fontFamily: "'Urbanist', sans-serif",
                    fontSize: 14, color: 'var(--color-text)',
                    outline: 'none', boxSizing: 'border-box',
                    transition: 'all 0.15s',
                  }}
                  onFocus={e => { e.target.style.borderColor = accentColor; e.target.style.boxShadow = '0 0 0 3px ' + accentColor + '18' }}
                  onBlur={e => { e.target.style.borderColor = 'var(--color-border)'; e.target.style.boxShadow = 'none' }}
                />
                <button
                  type="button"
                  onClick={() => setShowToken(p => !p)}
                  style={{
                    position: 'absolute', right: 12, top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--color-text-muted)',
                    display: 'flex', padding: 4,
                  }}
                >
                  {showToken
                    ? <EyeSlashIcon style={{ width: 16, height: 16 }}/>
                    : <EyeIcon style={{ width: 16, height: 16 }}/>
                  }
                </button>
              </div>

              {/* Help link */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 4,
                fontSize: 12, color: 'var(--color-text-muted)',
              }}>
                {connector.tokenHelp}
                <a
                  href={connector.tokenHelpUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    color: accentColor, textDecoration: 'none',
                    display: 'inline-flex', alignItems: 'center', gap: 3,
                    fontWeight: 600, marginLeft: 4,
                  }}
                >
                  Open settings
                  <ArrowTopRightOnSquareIcon style={{ width: 11, height: 11 }}/>
                </a>
              </div>

              {error && (
                <div style={{
                  marginTop: 12, padding: '9px 12px',
                  background: '#FEF2F2', border: '1px solid #FECACA',
                  borderRadius: 10, fontSize: 13, color: '#DC2626',
                  display: 'flex', gap: 7, alignItems: 'flex-start',
                }}>
                  <ExclamationCircleIcon style={{ width: 14, height: 14, flexShrink: 0, marginTop: 1 }}/>
                  {error}
                </div>
              )}

              {success && (
                <div style={{
                  marginTop: 12, padding: '9px 12px',
                  background: '#F0FDF4', border: '1px solid #BBF7D0',
                  borderRadius: 10, fontSize: 13, color: '#16a34a',
                  display: 'flex', gap: 7, alignItems: 'center',
                }}>
                  <CheckCircleIcon style={{ width: 14, height: 14 }}/>
                  {success}
                </div>
              )}
            </div>
          )}

          {/* Already installed state */}
          {installed && (
            <div style={{
              padding: '12px 14px',
              background: 'rgba(22,163,74,0.06)',
              border: '1px solid rgba(22,163,74,0.2)',
              borderRadius: 10, fontSize: 13, color: '#16a34a',
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <CheckCircleIcon style={{ width: 15, height: 15, flexShrink: 0 }}/>
              <span>
                {connector.name} is installed. Connect it to specific projects from the Team Collab board.
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Connector grid card ────────────────────────────────────────────────────────
function ConnectorCard({ connector, installed, hint, onClick }) {
  const { Logo, accentColor, bgColor, logoColor } = connector

  return (
    <div
      onClick={onClick}
      style={{
        background: 'var(--color-card)',
        border: '1.5px solid ' + (installed ? accentColor + '35' : 'var(--color-border)'),
        borderRadius: 16, padding: '18px 18px 16px',
        cursor: 'pointer', position: 'relative',
        transition: 'all 0.18s ease',
        boxShadow: installed ? '0 0 0 3px ' + accentColor + '10' : 'var(--shadow-xs)',
        fontFamily: "'Urbanist', sans-serif",
      }}
      onMouseEnter={e => {
        e.currentTarget.style.transform = 'translateY(-2px)'
        e.currentTarget.style.boxShadow = installed
          ? '0 0 0 3px ' + accentColor + '15, var(--shadow-md)'
          : 'var(--shadow-md)'
        if (!installed) e.currentTarget.style.borderColor = accentColor + '60'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.transform = 'translateY(0)'
        e.currentTarget.style.boxShadow = installed ? '0 0 0 3px ' + accentColor + '10' : 'var(--shadow-xs)'
        if (!installed) e.currentTarget.style.borderColor = 'var(--color-border)'
      }}
    >
      {/* Top: icon + action button */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{
          width: 44, height: 44, borderRadius: 12,
          background: bgColor,
          border: '1px solid var(--color-border)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Logo size={22} color={logoColor}/>
        </div>

        <button
          onClick={e => { e.stopPropagation(); onClick() }}
          style={{
            width: 30, height: 30, borderRadius: 8,
            background: installed ? 'var(--color-surface)' : 'transparent',
            border: '1px solid var(--color-border)',
            cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: installed ? accentColor : 'var(--color-text-muted)',
            transition: 'all 0.15s',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = accentColor + '12'
            e.currentTarget.style.borderColor = accentColor
            e.currentTarget.style.color = accentColor
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = installed ? 'var(--color-surface)' : 'transparent'
            e.currentTarget.style.borderColor = 'var(--color-border)'
            e.currentTarget.style.color = installed ? accentColor : 'var(--color-text-muted)'
          }}
        >
          {installed
            ? <Cog6ToothIcon style={{ width: 14, height: 14 }}/>
            : <PlusIcon style={{ width: 14, height: 14 }}/>
          }
        </button>
      </div>

      {/* Name + badges */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 5 }}>
        <span style={{ fontWeight: 800, fontSize: 14, letterSpacing: '-0.02em', color: 'var(--color-text)' }}>
          {connector.name}
        </span>

        {connector.popularity && !installed && (
          <span style={{
            fontFamily: 'monospace', fontSize: 9, fontWeight: 700,
            background: accentColor + '12',
            border: '1px solid ' + accentColor + '25',
            borderRadius: 100, padding: '1px 7px',
            color: accentColor,
            letterSpacing: '0.04em', textTransform: 'uppercase',
          }}>
            {connector.popularity}
          </span>
        )}

        {installed && (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            fontFamily: 'monospace', fontSize: 9, fontWeight: 700,
            background: '#F0FDF4', border: '1px solid #BBF7D0',
            borderRadius: 100, padding: '1px 7px',
            color: '#16a34a',
            letterSpacing: '0.04em', textTransform: 'uppercase',
          }}>
            <CheckCircleIcon style={{ width: 9, height: 9 }}/>
            Installed
          </span>
        )}
      </div>

      {/* Tagline */}
      <div style={{ fontSize: 12, color: 'var(--color-text-muted)', lineHeight: 1.5, marginBottom: 12 }}>
        {connector.tagline}
      </div>

      {/* Tool tags — first 3 */}
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
        {connector.tools.slice(0, 3).map(t => (
          <span key={t} style={{
            fontFamily: 'monospace', fontSize: 10,
            color: 'var(--color-text-muted)',
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 6, padding: '2px 8px',
          }}>
            {t}
          </span>
        ))}
        {connector.tools.length > 3 && (
          <span style={{ fontFamily: 'monospace', fontSize: 10, color: 'var(--color-text-muted)', padding: '2px 4px' }}>
            +{connector.tools.length - 3}
          </span>
        )}
      </div>
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function Connectors() {
  const { workspace, authUser } = useApp()
  const [installed, setInstalled] = useState({ figma: false, github: false, linear: false })
  const [hints, setHints] = useState({})
  const [search, setSearch] = useState('')
  const [selectedConnector, setSelectedConnector] = useState(null)

  useEffect(() => {
    if (workspace?.id && authUser?.id) loadStatus()
  }, [workspace?.id, authUser?.id])

  async function loadStatus() {
    if (!workspace?.id) return
    try {
      const data = await authedFetch('/api/connectors/status', {
        workspaceId: workspace.id,
      })
      if (data.installed) setInstalled(data.installed)
      if (data.hints) setHints(data.hints)
    } catch (e) {
      console.warn('[connectors]', e.message)
    }
  }

  const filtered = CONNECTORS.filter(c =>
    !search.trim() ||
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.tagline.toLowerCase().includes(search.toLowerCase())
  )

  const installedCount = Object.values(installed).filter(Boolean).length

  return (
    <div style={{
      padding: '28px 32px',
      fontFamily: "'Urbanist', sans-serif",
    }}>
      {/* Header + search — constrained width */}
      <div style={{ maxWidth: 640 }}>
        <div style={{ marginBottom: 24 }}>
          <h1 style={{
            fontWeight: 800, fontSize: 22,
            letterSpacing: '-0.04em',
            color: 'var(--color-text)',
            margin: '0 0 6px',
          }}>
            Connectors
          </h1>
          <p style={{ fontSize: 14, color: 'var(--color-text-muted)', lineHeight: 1.6, margin: 0 }}>
            Connect your tools to supercharge AI-generated briefs.
            {installedCount > 0 && (
              <span style={{
                marginLeft: 8, fontFamily: 'monospace',
                fontSize: 11, fontWeight: 700,
                background: 'rgba(22,163,74,0.08)',
                border: '1px solid rgba(22,163,74,0.2)',
                borderRadius: 100, padding: '2px 9px',
                color: '#16a34a',
              }}>
                {installedCount} installed
              </span>
            )}
          </p>
        </div>

        {/* Search */}
        <div style={{ position: 'relative', marginBottom: 20 }}>
          <MagnifyingGlassIcon style={{
            position: 'absolute', left: 12, top: '50%',
            transform: 'translateY(-50%)',
            width: 15, height: 15,
            color: 'var(--color-text-muted)',
            pointerEvents: 'none',
          }}/>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search connectors..."
            style={{
              width: '100%',
              background: 'var(--color-card)',
              border: '1px solid var(--color-border)',
              borderRadius: 10,
              padding: '10px 14px 10px 36px',
              fontFamily: "'Urbanist', sans-serif",
              fontSize: 14, color: 'var(--color-text)',
              outline: 'none', boxSizing: 'border-box',
              transition: 'all 0.15s',
            }}
            onFocus={e => { e.target.style.borderColor = '#7C3AED'; e.target.style.boxShadow = '0 0 0 3px rgba(124,58,237,0.1)' }}
            onBlur={e => { e.target.style.borderColor = 'var(--color-border)'; e.target.style.boxShadow = 'none' }}
          />
        </div>
      </div>

      {/* auto-fill grid — cards use full available width */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
        {filtered.map(connector => (
          <ConnectorCard
            key={connector.id}
            connector={connector}
            installed={installed[connector.id]}
            hint={hints[connector.id]}
            onClick={() => setSelectedConnector(connector)}
          />
        ))}
      </div>

      {filtered.length === 0 && (
        <div style={{
          textAlign: 'center', padding: '40px 20px',
          color: 'var(--color-text-muted)', fontSize: 14,
        }}>
          No connectors match "{search}"
        </div>
      )}

      {/* Install modal */}
      {selectedConnector && (
        <InstallModal
          connector={selectedConnector}
          installed={installed[selectedConnector.id]}
          hint={hints[selectedConnector.id]}
          workspaceId={workspace?.id}
          onClose={() => setSelectedConnector(null)}
          onInstalled={() => {
            loadStatus()
            setInstalled(p => ({ ...p, [selectedConnector.id]: true }))
          }}
          onUninstalled={() => {
            loadStatus()
            setInstalled(p => ({ ...p, [selectedConnector.id]: false }))
          }}
        />
      )}

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes scaleIn {
          from { opacity: 0; transform: scale(0.96) translateY(8px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </div>
  )
}
