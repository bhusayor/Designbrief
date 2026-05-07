import React, { useState, useEffect, useRef } from 'react'
import { LinkIcon, XMarkIcon, CheckCircleIcon, ArrowPathIcon } from '@heroicons/react/24/outline'
import { authedFetch, getAuthHeader } from '../../lib/getAuthHeader'

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
    <svg width="18" height="18" viewBox="0 0 24 24" fill="#24292f">
      <path fillRule="evenodd" clipRule="evenodd" d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
    </svg>
  )
}

function LinearIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 100 100" fill="none">
      <path d="M1.22541 61.5228c-.2225-.9485.90748-1.5459 1.59638-.857l36.4485 36.4484c.6889.6889.0915 1.8189-.857 1.5964C17.3712 94.4522 5.54765 82.6286 1.22541 61.5228zM.00189 46.8891c-.01764.2833.08887.5599.28957.7606L52.3503 99.7085c.2007.2007.4773.3072.7606.2896 2.3336-.1452 4.6071-.4271 6.8091-.8355.3933-.0731.5283-.5599.2448-.8434L.8452 40.0756c-.28349-.2835-.77028-.1485-.8434.2448-.40839 2.202-.69029 4.4755-.8-.8355zM0 52.2293c0-.2637.10483-.5167.29148-.7034L52.2293.29148C52.416.10483 52.669 0 52.9327 0 76.1607 0 95.9604 17.7538 99.3884 40.9627c.0539.3682-.0765.7408-.3484 1.0127L1.0127 99.04c-.27192.2719-.64461.4023-1.01274.3484C2.95054 96.1878.528997 74.2019 0 52.2293z" fill="#5E6AD2"/>
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

  // Linear state
  const [linearTeams, setLinearTeams] = useState(null)
  const [linearLoading, setLinearLoading] = useState(false)
  const [linearError, setLinearError] = useState(null)
  const [selectedTeamId, setSelectedTeamId] = useState(null)
  const [selectedTeamName, setSelectedTeamName] = useState(null)
  const [savingTeam, setSavingTeam] = useState(false)

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
        action: 'connect', workspaceId, projectId,
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
      await authedFetch('/api/connectors/figma', { action: 'disconnect', workspaceId, projectId })
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
        action: 'connect', workspaceId, projectId,
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
      await authedFetch('/api/connectors/github', { action: 'disconnect', workspaceId, projectId })
      setProject(p => ({ ...(p || {}), github_repo_url: null, github_repo_name: null, github_extracted: null }))
      onConnected?.()
    } catch (e) { setGithubError(e.message) }
    finally { setGithubLoading(false) }
  }

  // ── Linear ─────────────────────────────────────────────────────────────────
  async function handleFetchTeams() {
    const token = getToken(workspaceId, 'linear')
    if (!token) { setLinearError('No Linear token saved. Install Linear from the Integrations page.'); return }
    setLinearLoading(true); setLinearError(null)
    try {
      const d = await authedFetch('/api/connectors/linear', {
        action: 'get_teams', workspaceId, linearToken: token,
      })
      setLinearTeams(d.data?.teams || [])
    } catch (e) { setLinearError(e.message) }
    finally { setLinearLoading(false) }
  }

  async function handleSaveTeam() {
    if (!selectedTeamId) return
    setSavingTeam(true); setLinearError(null)
    try {
      await authedFetch('/api/connectors/linear', {
        action: 'save_team', workspaceId, projectId,
        teamId: selectedTeamId, teamName: selectedTeamName,
      })
      setProject(p => ({ ...(p || {}), linear_team_id: selectedTeamId, linear_team_name: selectedTeamName }))
      setLinearTeams(null); setSelectedTeamId(null); setSelectedTeamName(null)
      onConnected?.()
    } catch (e) { setLinearError(e.message) }
    finally { setSavingTeam(false) }
  }

  async function handleLinearUnlink() {
    setLinearLoading(true); setLinearError(null)
    try {
      await authedFetch('/api/connectors/linear', { action: 'disconnect', workspaceId, projectId })
      setProject(p => ({ ...(p || {}), linear_team_id: null, linear_team_name: null }))
      setLinearTeams(null)
      onConnected?.()
    } catch (e) { setLinearError(e.message) }
    finally { setLinearLoading(false) }
  }

  const figmaConnected = !!project?.figma_file_url
  const githubConnected = !!project?.github_repo_url
  const linearConnected = !!project?.linear_team_id

  return (
    <div
      ref={panelRef}
      style={{
        position: 'absolute', top: 44, right: 0, zIndex: 200,
        width: 320, background: '#fff', borderRadius: 14,
        boxShadow: '0 8px 32px rgba(0,0,0,0.14), 0 2px 8px rgba(0,0,0,0.08)',
        border: '1px solid #e5e7eb', overflow: 'hidden',
      }}
    >
      {/* Panel header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px 12px', borderBottom: '1px solid #f3f4f6' }}>
        <span style={{ fontWeight: 600, fontSize: 14, color: '#111' }}>Connect to project</span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: 2 }}>
          <XMarkIcon style={{ width: 16, height: 16 }} />
        </button>
      </div>

      {loadingStatus ? (
        <div style={{ padding: 24, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>Loading…</div>
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
                <button
                  onClick={handleFigmaUnlink}
                  disabled={figmaLoading}
                  style={unlinkStyle}
                >
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
                <button
                  onClick={handleGithubUnlink}
                  disabled={githubLoading}
                  style={unlinkStyle}
                >
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

          {/* ── Linear row ── */}
          {installed?.linear && (
            <ConnectorRow
              Icon={<LinearIcon />}
              name="Linear"
              accentColor="#5E6AD2"
              connected={linearConnected}
              connectedLabel={project?.linear_team_name || 'Team connected'}
              loading={linearLoading || savingTeam}
              error={linearError}
            >
              {linearConnected ? (
                <button
                  onClick={handleLinearUnlink}
                  disabled={linearLoading}
                  style={unlinkStyle}
                >
                  {linearLoading ? '…' : 'Unlink'}
                </button>
              ) : linearTeams ? (
                <div style={{ marginTop: 6 }}>
                  <select
                    value={selectedTeamId || ''}
                    onChange={e => {
                      const team = linearTeams.find(t => t.id === e.target.value)
                      setSelectedTeamId(e.target.value)
                      setSelectedTeamName(team?.name || null)
                    }}
                    style={{ ...inputStyle, width: '100%', marginBottom: 6 }}
                  >
                    <option value="">Select a team…</option>
                    {linearTeams.map(t => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      onClick={() => { setLinearTeams(null); setSelectedTeamId(null) }}
                      style={{ ...unlinkStyle, flex: 1 }}
                    >Cancel</button>
                    <button
                      onClick={handleSaveTeam}
                      disabled={savingTeam || !selectedTeamId}
                      style={{ ...linkBtnStyle, flex: 2, background: savingTeam || !selectedTeamId ? '#e5e7eb' : '#5E6AD2', color: savingTeam || !selectedTeamId ? '#9ca3af' : '#fff' }}
                    >
                      {savingTeam ? 'Saving…' : 'Connect team'}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={handleFetchTeams}
                  disabled={linearLoading}
                  style={{ ...linkBtnStyle, marginTop: 6, width: '100%', background: '#5E6AD2', color: '#fff' }}
                >
                  {linearLoading ? 'Loading teams…' : 'Fetch teams'}
                </button>
              )}
            </ConnectorRow>
          )}

          {/* If nothing installed */}
          {!installed?.figma && !installed?.github && !installed?.linear && (
            <div style={{ padding: '16px 16px 12px', textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>
              No integrations installed yet.{' '}
              <a href="/connectors" style={{ color: '#6366f1' }}>Set them up →</a>
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
    <div style={{ padding: '10px 16px', borderBottom: '1px solid #f9fafb' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: connected ? 0 : 2 }}>
        <div style={{ width: 28, height: 28, borderRadius: 7, background: connected ? accentColor + '18' : '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          {Icon}
        </div>
        <div style={{ flex: 1 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#111' }}>{name}</span>
          {connected && (
            <div style={{ fontSize: 12, color: '#6b7280', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180 }}>
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
        <div style={{ marginTop: 6, fontSize: 11, color: '#dc2626', lineHeight: 1.4 }}>{error}</div>
      )}
    </div>
  )
}

// ── Shared micro-styles ────────────────────────────────────────────────────────
const inputStyle = {
  flex: 1, padding: '6px 8px', borderRadius: 7,
  border: '1px solid #d1d5db', fontSize: 12, outline: 'none',
  minWidth: 0,
}

const linkBtnStyle = {
  padding: '6px 12px', borderRadius: 7, fontSize: 12, fontWeight: 600,
  border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
}

const unlinkStyle = {
  marginTop: 4, padding: '4px 10px', borderRadius: 7, fontSize: 11,
  border: '1px solid #e5e7eb', background: '#fff', color: '#6b7280',
  cursor: 'pointer',
}
