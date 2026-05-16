import React, { useState, useEffect, useRef } from 'react'
import { XMarkIcon } from '@heroicons/react/24/outline'
import { authedFetch } from '../../lib/getAuthHeader'

function getToken(workspaceId, type) {
  return localStorage.getItem('db-token-' + workspaceId + '-' + type) || ''
}

// ── Small brand icons ──────────────────────────────────────────────────────────
function FigmaIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 38 57" fill="none">
      <path d="M19 28.5C19 25.98 20 23.56 21.78 21.78C23.56 20 25.98 19 28.5 19C31.02 19 33.44 20 35.22 21.78C37 23.56 38 25.98 38 28.5C38 31.02 37 33.44 35.22 35.22C33.44 37 31.02 38 28.5 38C25.98 38 23.56 37 21.78 35.22C20 33.44 19 31.02 19 28.5Z" fill="#1ABCFE"/>
      <path d="M0 47.5C0 44.98 1 42.56 2.78 40.78C4.56 39 6.98 38 9.5 38H19V47.5C19 50.02 17.99 52.44 16.22 54.22C14.44 56 12.02 57 9.5 57C6.98 57 4.56 56 2.78 54.22C1 52.44 0 50.02 0 47.5Z" fill="#0ACF83"/>
      <path d="M19 0V19H28.5C31.02 19 33.44 17.99 35.22 16.22C37 14.44 38 12.02 38 9.5C38 6.98 37 4.56 35.22 2.78C33.44 1 31.02 0 28.5 0H19Z" fill="#FF7262"/>
      <path d="M0 9.5C0 12.02 1 14.44 2.78 16.22C4.56 18 6.98 19 9.5 19H19V0H9.5C6.98 0 4.56 1 2.78 2.78C1 4.56 0 6.98 0 9.5Z" fill="#F24E1E"/>
      <path d="M0 28.5C0 25.98 1 23.56 2.78 21.78C4.56 20 6.98 19 9.5 19H19V38H9.5C6.98 38 4.56 37 2.78 35.22C1 33.44 0 31.02 0 28.5Z" fill="#A259FF"/>
    </svg>
  )
}

function GitHubIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" style={{ color: 'var(--color-text)' }}>
      <path fillRule="evenodd" clipRule="evenodd" d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
    </svg>
  )
}

function NotionIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" style={{ color: 'var(--color-text)' }}>
      <path d="M4.459 4.208c.746.606 1.026.56 2.428.466l13.215-.793c.28 0 .047-.28-.046-.326L17.86.82c-.28-.186-.654-.466-1.354-.513L3.351.006C2.605.051 1.859.326 1.858 1.373v.047l.046.093 2.555 3.695zm.746 14.226V5.234c0-.28.14-.513.42-.607l14.34-.84.047.047V18.827c0 .28-.093.513-.42.56l-13.967.84c-.42.046-.42-.187-.42-.793zm12.44-.793c.327-.047.42-.234.42-.513V6.167l-2.24.14V18.08l1.82-.44zm-11.09 1.167l12.253-2.193V7.054l-12.253.653v11.1z"/>
    </svg>
  )
}

function GDocsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="#4285F4">
      <path d="M14.727 0H2.182A2.182 2.182 0 0 0 0 2.182v19.636C0 23.02.98 24 2.182 24h15.636A2.182 2.182 0 0 0 20 21.818V5.273L14.727 0zm-.545 1.455 3.862 3.863h-3.862V1.455zM18.182 22.91H2.182a1.09 1.09 0 0 1-1.09-1.09V2.18a1.09 1.09 0 0 1 1.09-1.09h10.909v4.363h4.364v16.364a1.09 1.09 0 0 1-1.273 1.09z"/>
      <path d="M4.364 11.636h10.909v1.091H4.364zm0 2.91h10.909v1.09H4.364zm0 2.909h6.545v1.09H4.364z"/>
    </svg>
  )
}

// ── ConnectPanel ───────────────────────────────────────────────────────────────
export default function ConnectPanel({ workspaceId, projectId, installed, onClose, onConnected }) {
  const panelRef = useRef(null)
  const [project, setProject] = useState(null)
  const [loadingStatus, setLoadingStatus] = useState(true)

  // Figma state
  const [figmaUrl, setFigmaUrl] = useState('')
  const [figmaLoading, setFigmaLoading] = useState(false)
  const [figmaError, setFigmaError] = useState(null)

  // GitHub state
  const [githubUrl, setGithubUrl] = useState('')
  const [githubLoading, setGithubLoading] = useState(false)
  const [githubError, setGithubError] = useState(null)

  // Notion state
  const [notionUrl, setNotionUrl] = useState('')
  const [notionLoading, setNotionLoading] = useState(false)
  const [notionError, setNotionError] = useState(null)

  // Google Docs state
  const [gdocsUrl, setGdocsUrl] = useState('')
  const [gdocsLoading, setGdocsLoading] = useState(false)
  const [gdocsError, setGdocsError] = useState(null)

  // Close on outside click
  useEffect(() => {
    function handleClick(e) {
      if (panelRef.current && !panelRef.current.contains(e.target)) onClose()
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [onClose])

  // Load project connector status
  useEffect(() => {
    if (!workspaceId || !projectId) return
    setLoadingStatus(true)
    authedFetch('/api/connectors/status', { workspaceId, projectId })
      .then(d => { if (d?.project) setProject(d.project) })
      .catch(() => {})
      .finally(() => setLoadingStatus(false))
  }, [workspaceId, projectId])

  // ── Figma ──────────────────────────────────────────────────────────────────
  async function handleFigmaLink() {
    const token = getToken(workspaceId, 'figma')
    if (!figmaUrl.trim()) return
    setFigmaLoading(true); setFigmaError(null)
    try {
      const d = await authedFetch('/api/connectors/figma', {
        type: 'figma', action: 'connect', workspaceId, projectId,
        figmaToken: token, figmaUrl: figmaUrl.trim(),
      })
      setProject(p => ({ ...(p || {}), figma_file_url: figmaUrl, figma_file_name: d.data?.fileName, figma_extracted: d.data }))
      setFigmaUrl('')
      onConnected?.()
    } catch (e) { setFigmaError(e.message) }
    finally { setFigmaLoading(false) }
  }

  async function handleFigmaUnlink() {
    setFigmaLoading(true); setFigmaError(null)
    try {
      await authedFetch('/api/connectors/figma', { type: 'figma', action: 'disconnect', workspaceId, projectId })
      setProject(p => ({ ...(p || {}), figma_file_url: null, figma_file_name: null, figma_extracted: null }))
      onConnected?.()
    } catch (e) { setFigmaError(e.message) }
    finally { setFigmaLoading(false) }
  }

  // ── GitHub ─────────────────────────────────────────────────────────────────
  async function handleGithubLink() {
    if (!githubUrl.trim()) return
    const token = getToken(workspaceId, 'github')
    setGithubLoading(true); setGithubError(null)
    try {
      const d = await authedFetch('/api/connectors/github', {
        type: 'github', action: 'connect', workspaceId, projectId,
        githubToken: token || undefined, repoUrl: githubUrl.trim(),
      })
      setProject(p => ({ ...(p || {}), github_repo_url: githubUrl, github_repo_name: d.data?.repoName, github_extracted: d.data }))
      setGithubUrl('')
      onConnected?.()
    } catch (e) { setGithubError(e.message) }
    finally { setGithubLoading(false) }
  }

  async function handleGithubUnlink() {
    setGithubLoading(true); setGithubError(null)
    try {
      await authedFetch('/api/connectors/github', { type: 'github', action: 'disconnect', workspaceId, projectId })
      setProject(p => ({ ...(p || {}), github_repo_url: null, github_repo_name: null, github_extracted: null }))
      onConnected?.()
    } catch (e) { setGithubError(e.message) }
    finally { setGithubLoading(false) }
  }

  // ── Notion ─────────────────────────────────────────────────────────────────
  async function handleNotionLink() {
    const token = getToken(workspaceId, 'notion')
    if (!notionUrl.trim()) return
    setNotionLoading(true); setNotionError(null)
    try {
      const d = await authedFetch('/api/connectors/notion', {
        type: 'notion', action: 'connect', workspaceId, projectId,
        notionToken: token, notionUrl: notionUrl.trim(),
      })
      setProject(p => ({ ...(p || {}), notion_page_url: notionUrl, notion_page_title: d.data?.pageTitle, notion_extracted: d.data }))
      setNotionUrl('')
      onConnected?.()
    } catch (e) { setNotionError(e.message) }
    finally { setNotionLoading(false) }
  }

  async function handleNotionUnlink() {
    setNotionLoading(true); setNotionError(null)
    try {
      await authedFetch('/api/connectors/notion', { type: 'notion', action: 'disconnect', workspaceId, projectId })
      setProject(p => ({ ...(p || {}), notion_page_url: null, notion_page_title: null, notion_extracted: null }))
      onConnected?.()
    } catch (e) { setNotionError(e.message) }
    finally { setNotionLoading(false) }
  }

  // ── Google Docs ────────────────────────────────────────────────────────────
  async function handleGdocsLink() {
    if (!gdocsUrl.trim()) return
    const apiKey = getToken(workspaceId, 'gdocs')
    setGdocsLoading(true); setGdocsError(null)
    try {
      const d = await authedFetch('/api/connectors/gdocs', {
        type: 'gdocs', action: 'connect', workspaceId, projectId,
        gdocsUrl: gdocsUrl.trim(),
        ...(apiKey && { gdocsApiKey: apiKey }),
      })
      setProject(p => ({ ...(p || {}), gdocs_file_url: gdocsUrl, gdocs_file_name: d.data?.fileName, gdocs_extracted: d.data }))
      setGdocsUrl('')
      onConnected?.()
    } catch (e) { setGdocsError(e.message) }
    finally { setGdocsLoading(false) }
  }

  async function handleGdocsUnlink() {
    setGdocsLoading(true); setGdocsError(null)
    try {
      await authedFetch('/api/connectors/gdocs', { type: 'gdocs', action: 'disconnect', workspaceId, projectId })
      setProject(p => ({ ...(p || {}), gdocs_file_url: null, gdocs_file_name: null, gdocs_extracted: null }))
      onConnected?.()
    } catch (e) { setGdocsError(e.message) }
    finally { setGdocsLoading(false) }
  }

  const figmaConnected = !!project?.figma_file_url
  const githubConnected = !!project?.github_repo_url
  const notionConnected = !!project?.notion_page_url
  const gdocsConnected = !!project?.gdocs_file_url

  const noneInstalled = !installed?.figma && !installed?.github && !installed?.notion && !installed?.gdocs

  return (
    <div
      ref={panelRef}
      style={{
        position: 'absolute', top: 44, right: 0, zIndex: 200,
        width: 320, background: 'var(--color-card)', borderRadius: 14,
        boxShadow: 'var(--shadow-lg)',
        border: '1px solid var(--color-border)', overflow: 'hidden',
      }}
    >
      {/* Panel header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px 12px', borderBottom: '1px solid var(--color-border)' }}>
        <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--color-text)' }}>Connect to project</span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', padding: 2 }}>
          <XMarkIcon style={{ width: 16, height: 16 }} />
        </button>
      </div>

      {loadingStatus ? (
        <div style={{ padding: 24, textAlign: 'center', color: 'var(--color-text-muted)', fontSize: 13 }}>Loading…</div>
      ) : (
        <div style={{ padding: '8px 0 4px' }}>

          {/* ── Figma row ── */}
          {installed?.figma && (
            <ConnectorRow
              Icon={<FigmaIcon />}
              name="Figma"
              accentColor="#1ABCFE"
              connected={figmaConnected}
              connectedLabel={project?.figma_file_name || 'Figma file'}
              loading={figmaLoading}
              error={figmaError}
            >
              {figmaConnected ? (
                <button onClick={handleFigmaUnlink} disabled={figmaLoading} style={unlinkStyle}>
                  {figmaLoading ? '…' : 'Unlink'}
                </button>
              ) : (
                <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                  <input
                    value={figmaUrl}
                    onChange={e => setFigmaUrl(e.target.value)}
                    placeholder="figma.com/design/…"
                    style={inputStyle}
                    onKeyDown={e => { if (e.key === 'Enter') handleFigmaLink() }}
                  />
                  <button
                    onClick={handleFigmaLink}
                    disabled={figmaLoading || !figmaUrl.trim()}
                    style={{ ...linkBtnStyle, background: figmaLoading || !figmaUrl.trim() ? '#e5e7eb' : '#1ABCFE', color: figmaLoading || !figmaUrl.trim() ? '#9ca3af' : '#fff' }}
                  >
                    {figmaLoading ? '…' : 'Link'}
                  </button>
                </div>
              )}
            </ConnectorRow>
          )}

          {/* ── GitHub row ── */}
          {installed?.github && (
            <ConnectorRow
              Icon={<GitHubIcon />}
              name="GitHub"
              accentColor="#24292f"
              connected={githubConnected}
              connectedLabel={project?.github_repo_name || 'Repository'}
              loading={githubLoading}
              error={githubError}
            >
              {githubConnected ? (
                <button onClick={handleGithubUnlink} disabled={githubLoading} style={unlinkStyle}>
                  {githubLoading ? '…' : 'Unlink'}
                </button>
              ) : (
                <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                  <input
                    value={githubUrl}
                    onChange={e => setGithubUrl(e.target.value)}
                    placeholder="github.com/org/repo"
                    style={inputStyle}
                    onKeyDown={e => { if (e.key === 'Enter') handleGithubLink() }}
                  />
                  <button
                    onClick={handleGithubLink}
                    disabled={githubLoading || !githubUrl.trim()}
                    style={{ ...linkBtnStyle, background: githubLoading || !githubUrl.trim() ? '#e5e7eb' : '#24292f', color: githubLoading || !githubUrl.trim() ? '#9ca3af' : '#fff' }}
                  >
                    {githubLoading ? '…' : 'Link'}
                  </button>
                </div>
              )}
            </ConnectorRow>
          )}

          {/* ── Notion row ── */}
          {installed?.notion && (
            <ConnectorRow
              Icon={<NotionIcon />}
              name="Notion"
              accentColor="#000"
              connected={notionConnected}
              connectedLabel={project?.notion_page_title || 'Notion page'}
              loading={notionLoading}
              error={notionError}
            >
              {notionConnected ? (
                <button onClick={handleNotionUnlink} disabled={notionLoading} style={unlinkStyle}>
                  {notionLoading ? '…' : 'Unlink'}
                </button>
              ) : (
                <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                  <input
                    value={notionUrl}
                    onChange={e => setNotionUrl(e.target.value)}
                    placeholder="notion.so/…"
                    style={inputStyle}
                    onKeyDown={e => { if (e.key === 'Enter') handleNotionLink() }}
                  />
                  <button
                    onClick={handleNotionLink}
                    disabled={notionLoading || !notionUrl.trim()}
                    style={{ ...linkBtnStyle, background: notionLoading || !notionUrl.trim() ? '#e5e7eb' : '#000', color: notionLoading || !notionUrl.trim() ? '#9ca3af' : '#fff' }}
                  >
                    {notionLoading ? '…' : 'Link'}
                  </button>
                </div>
              )}
            </ConnectorRow>
          )}

          {/* ── Google Docs row ── */}
          {installed?.gdocs && (
            <ConnectorRow
              Icon={<GDocsIcon />}
              name="Google Docs"
              accentColor="#4285F4"
              connected={gdocsConnected}
              connectedLabel={project?.gdocs_file_name || 'Google Doc'}
              loading={gdocsLoading}
              error={gdocsError}
            >
              {gdocsConnected ? (
                <button onClick={handleGdocsUnlink} disabled={gdocsLoading} style={unlinkStyle}>
                  {gdocsLoading ? '…' : 'Unlink'}
                </button>
              ) : (
                <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                  <input
                    value={gdocsUrl}
                    onChange={e => setGdocsUrl(e.target.value)}
                    placeholder="docs.google.com/document/…"
                    style={inputStyle}
                    onKeyDown={e => { if (e.key === 'Enter') handleGdocsLink() }}
                  />
                  <button
                    onClick={handleGdocsLink}
                    disabled={gdocsLoading || !gdocsUrl.trim()}
                    style={{ ...linkBtnStyle, background: gdocsLoading || !gdocsUrl.trim() ? '#e5e7eb' : '#4285F4', color: gdocsLoading || !gdocsUrl.trim() ? '#9ca3af' : '#fff' }}
                  >
                    {gdocsLoading ? '…' : 'Link'}
                  </button>
                </div>
              )}
            </ConnectorRow>
          )}

          {/* If nothing installed */}
          {noneInstalled && (
            <div style={{ padding: '16px 16px 12px', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: 13 }}>
              No integrations installed yet.{' '}
              <a href="/connectors" style={{ color: 'var(--color-accent)' }}>Set them up →</a>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── ConnectorRow sub-component ─────────────────────────────────────────────────
function ConnectorRow({ Icon, name, accentColor, connected, connectedLabel, loading, error, children }) {
  return (
    <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--color-border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: connected ? 0 : 2 }}>
        <div style={{ width: 28, height: 28, borderRadius: 7, background: connected ? accentColor + '18' : 'var(--color-surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          {Icon}
        </div>
        <div style={{ flex: 1 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text)' }}>{name}</span>
          {connected && (
            <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180 }}>
              {connectedLabel}
            </div>
          )}
        </div>
        {connected && (
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: accentColor, flexShrink: 0 }} />
        )}
      </div>
      {children}
      {error && (
        <div style={{ marginTop: 6, fontSize: 11, color: 'var(--color-red)', lineHeight: 1.4 }}>{error}</div>
      )}
    </div>
  )
}

// ── Shared micro-styles ────────────────────────────────────────────────────────
const inputStyle = {
  flex: 1, padding: '6px 8px', borderRadius: 7,
  border: '1px solid var(--color-border)', fontSize: 12, outline: 'none',
  background: 'var(--color-surface)', color: 'var(--color-text)',
  minWidth: 0,
}

const linkBtnStyle = {
  padding: '6px 12px', borderRadius: 7, fontSize: 12, fontWeight: 600,
  border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
}

const unlinkStyle = {
  marginTop: 4, padding: '4px 10px', borderRadius: 7, fontSize: 11,
  border: '1px solid var(--color-border)', background: 'var(--color-surface)',
  color: 'var(--color-text-muted)', cursor: 'pointer',
}
