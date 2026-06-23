import React, { useState, useEffect, useCallback } from 'react'
import { useApp } from '../context/AppContext'
import { supabase } from '../lib/supabase'
import { authedFetch, getAuthHeader } from '../lib/getAuthHeader'
import ConfirmDeleteModal from '../components/ConfirmDeleteModal'
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

// ── Mobile hook ───────────────────────────────────────────────────────────────
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 640)
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 640)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])
  return isMobile
}

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

function NotionLogo({ size = 32, color }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color || 'currentColor'}>
      <path d="M4.459 4.208c.746.606 1.026.56 2.428.466l13.215-.793c.28 0 .047-.28-.046-.326L17.86.82c-.28-.186-.654-.466-1.354-.513L3.351.006C2.605.051 1.859.326 1.858 1.373v.047l.046.093 2.555 3.695zm.746 14.226V5.234c0-.28.14-.513.42-.607l14.34-.84.047.047V18.827c0 .28-.093.513-.42.56l-13.967.84c-.42.046-.42-.187-.42-.793zm12.44-.793c.327-.047.42-.234.42-.513V6.167l-2.24.14V18.08l1.82-.44zm-11.09 1.167l12.253-2.193V7.054l-12.253.653v11.1z"/>
    </svg>
  )
}

function GDocsLogo({ size = 32, color }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color || '#4285F4'}>
      <path d="M14.727 0H2.182A2.182 2.182 0 0 0 0 2.182v19.636C0 23.02.98 24 2.182 24h15.636A2.182 2.182 0 0 0 20 21.818V5.273L14.727 0zm-.545 1.455 3.862 3.863h-3.862V1.455zM18.182 22.91H2.182a1.09 1.09 0 0 1-1.09-1.09V2.18a1.09 1.09 0 0 1 1.09-1.09h10.909v4.363h4.364v16.364a1.09 1.09 0 0 1-1.273 1.09z"/>
      <path d="M4.364 11.636h10.909v1.091H4.364zm0 2.91h10.909v1.09H4.364zm0 2.909h6.545v1.09H4.364z"/>
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
    id: 'notion',
    name: 'Notion',
    tagline: 'Pull notes, specs, and briefs into AI context',
    description:
      'Connect a Notion page to any project and DesignBrief AI ' +
      'reads its content as context. Paste in existing requirements, ' +
      'research notes, or user stories, the AI extends what you ' +
      'already have instead of starting from scratch.',
    accentColor: '#000000',
    bgColor: 'var(--color-surface)',
    popularity: 'Popular',
    Logo: NotionLogo,
    logoColor: 'var(--color-text)',
    tools: ['page_content', 'context_injection', 'brief_enrichment', 'heading_extraction'],
    tokenLabel: 'Integration Token',
    tokenPlaceholder: 'secret_...',
    tokenHelp: 'Notion → Settings → Connections → Develop or manage integrations',
    tokenHelpUrl: 'https://www.notion.so/profile/integrations',
    tokenRequired: true,
  },
  {
    id: 'gdocs',
    name: 'Google Docs',
    tagline: 'Import existing docs as brief context',
    description:
      'Link a Google Doc to your project and DesignBrief AI will ' +
      'read its content as context. PRDs, research docs, and briefs ' +
      'you\'ve already written become input for generating sharper AI ' +
      'output. Works with any publicly shared document.',
    accentColor: '#4285F4',
    bgColor: 'rgba(66,133,244,0.08)',
    popularity: null,
    Logo: GDocsLogo,
    logoColor: '#4285F4',
    tools: ['doc_content', 'context_injection', 'brief_enrichment', 'public_access'],
    tokenLabel: 'Google API Key (optional, for title lookup)',
    tokenPlaceholder: 'AIza... or leave blank',
    tokenHelp: 'Leave blank, just share your doc as "Anyone with the link"',
    tokenHelpUrl: 'https://console.cloud.google.com/apis/credentials',
    tokenRequired: false,
  },
]

// ── Install Modal ──────────────────────────────────────────────────────────────
function InstallModal({ connector, installed, hint, workspaceId, onClose, onInstalled, onUninstalled }) {
  const isMobile = useIsMobile()
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

  const [confirmUninstall, setConfirmUninstall] = useState(false)

  function handleUninstall() {
    setConfirmUninstall(true)
  }

  async function doUninstall() {
    setLoading(true)
    try {
      const headers = await getAuthHeader()
      if (!headers) { setLoading(false); setConfirmUninstall(false); return }
      clearToken(workspaceId, connector.id)
      await fetch('/api/connectors/' + connector.id, {
        method: 'POST',
        headers,
        body: JSON.stringify({ type: connector.id, action: 'uninstall', workspaceId, projectId: 'workspace' }),
      })
      onUninstalled()
      setConfirmUninstall(false)
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
        display: 'flex',
        alignItems: isMobile ? 'flex-end' : 'center',
        justifyContent: 'center',
        padding: isMobile ? 0 : 24,
        backdropFilter: 'blur(6px)',
        animation: 'fadeIn 0.15s ease',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--color-bg)',
          border: '1px solid var(--color-border)',
          borderRadius: isMobile ? '20px 20px 0 0' : 20,
          width: '100%', maxWidth: isMobile ? '100%' : 560,
          maxHeight: isMobile ? '92vh' : 'none',
          overflowY: isMobile ? 'auto' : 'visible',
          boxShadow: '0 24px 64px rgba(0,0,0,0.3)',
          animation: isMobile ? 'slideUp 0.25s ease' : 'scaleIn 0.2s ease',
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
                background: !canInstall || loading ? 'var(--color-border)' : '#7C3AED',
                color: 'white', border: 'none', borderRadius: 10,
                cursor: !canInstall || loading ? 'not-allowed' : 'pointer',
                fontFamily: "'Urbanist', sans-serif",
                fontSize: 13, fontWeight: 700,
                transition: 'all 0.15s',
                boxShadow: !canInstall || loading ? 'none' : '0 2px 8px rgba(124,58,237,0.35)',
              }}
            >
              {loading ? 'Connecting...' : success ? 'Connected ✓' : 'Connect'}
            </button>
          )}
        </div>

        {/* Modal body */}
        <div style={{ padding: isMobile ? '20px 16px 32px' : '24px 28px 28px' }}>
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
                    fontFamily: "'Urbanist', sans-serif",
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
                fontFamily: "'Urbanist', sans-serif", fontSize: 11,
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
                  fontFamily: "'Urbanist', sans-serif", fontSize: 11, fontWeight: 500,
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

          {/* Token input, only when not installed */}
          {!installed && (
            <div>
              <label style={{
                display: 'block',
                fontFamily: "'Urbanist', sans-serif",
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
                  onFocus={e => { e.target.style.borderColor = '#7C3AED'; e.target.style.boxShadow = '0 0 0 3px rgba(124,58,237,0.12)' }}
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
                display: 'flex', alignItems: 'flex-start', gap: 4, flexWrap: 'wrap',
                fontSize: 12, color: 'var(--color-text-muted)', lineHeight: 1.6,
              }}>
                {connector.tokenHelp}
                <a
                  href={connector.tokenHelpUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    color: '#7C3AED', textDecoration: 'none',
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

      {/* Uninstall confirmation, shared destructive modal */}
      <ConfirmDeleteModal
        open={confirmUninstall}
        title="Uninstall connector?"
        confirmLabel="Uninstall"
        busy={loading}
        onCancel={() => { if (!loading) setConfirmUninstall(false) }}
        onConfirm={doUninstall}
        description={
          <>
            <strong>{connector.name}</strong> will be uninstalled and removed
            from all projects in this workspace. You can re-install it any time.
          </>
        }
      />
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
          ? '0 0 0 3px rgba(124,58,237,0.15), var(--shadow-md)'
          : 'var(--shadow-md)'
        if (!installed) e.currentTarget.style.borderColor = 'rgba(124,58,237,0.4)'
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
            e.currentTarget.style.background = 'rgba(124,58,237,0.08)'
            e.currentTarget.style.borderColor = '#7C3AED'
            e.currentTarget.style.color = '#7C3AED'
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
            fontFamily: "'Urbanist', sans-serif", fontSize: 9, fontWeight: 700,
            background: 'rgba(124,58,237,0.08)',
            border: '1px solid rgba(124,58,237,0.2)',
            borderRadius: 100, padding: '1px 7px',
            color: '#7C3AED',
            letterSpacing: '0.04em', textTransform: 'uppercase',
          }}>
            {connector.popularity}
          </span>
        )}

        {installed && (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            fontFamily: "'Urbanist', sans-serif", fontSize: 9, fontWeight: 700,
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

      {/* Tool tags, first 3 */}
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
        {connector.tools.slice(0, 3).map(t => (
          <span key={t} style={{
            fontFamily: "'Urbanist', sans-serif", fontSize: 10,
            color: 'var(--color-text-muted)',
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 6, padding: '2px 8px',
          }}>
            {t}
          </span>
        ))}
        {connector.tools.length > 3 && (
          <span style={{ fontFamily: "'Urbanist', sans-serif", fontSize: 10, color: 'var(--color-text-muted)', padding: '2px 4px' }}>
            +{connector.tools.length - 3}
          </span>
        )}
      </div>
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function Connectors({ embedded = false }) {
  const isMobile = useIsMobile()
  const { workspace, authUser } = useApp()
  const [installed, setInstalled] = useState({ figma: false, github: false, notion: false, gdocs: false })
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
      ...(embedded ? {} : { height: '100%', overflowY: 'auto' }),
      padding: isMobile ? '20px 16px' : '28px 32px',
      fontFamily: "'Urbanist', sans-serif",
      boxSizing: 'border-box',
    }}>
      {/* Header + search, constrained width */}
      <div style={{ maxWidth: isMobile ? 'none' : 640 }}>
        {!embedded && (
          <div style={{ marginBottom: 24, textAlign: isMobile ? 'center' : 'left' }}>
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
                  marginLeft: 8, fontFamily: "'Urbanist', sans-serif",
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
        )}

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

      {/* 4-col grid on desktop, 1-col on mobile */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(4, 1fr)', gap: isMobile ? 12 : 14 }}>
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
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(32px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}
