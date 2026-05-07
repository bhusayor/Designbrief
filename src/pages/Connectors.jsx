import React, { useState, useEffect } from 'react'
import { useApp } from '../context/AppContext'
import { supabase } from '../lib/supabase'
import {
  LinkIcon, CheckCircleIcon,
  ExclamationCircleIcon, ArrowPathIcon,
  EyeIcon, EyeSlashIcon, KeyIcon,
  FolderIcon, ArrowTopRightOnSquareIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'

// ── localStorage token helpers ────────────────────────────────────────────────
// Tokens are scoped per workspace and never sent to the database.

function getTokenKey(workspaceId, type) {
  return 'db-token-' + workspaceId + '-' + type
}
function saveToken(workspaceId, type, value) {
  if (value?.trim())
    localStorage.setItem(getTokenKey(workspaceId, type), value)
}
function getToken(workspaceId, type) {
  return localStorage.getItem(getTokenKey(workspaceId, type)) || ''
}

// ── TokenField ────────────────────────────────────────────────────────────────

function TokenField({ label, tokenKey, workspaceId, placeholder, help, helpUrl, onSaved }) {
  const [value, setValue] = useState('')
  const [show, setShow] = useState(false)
  const [saved, setSaved] = useState(false)
  const [tick, setTick] = useState(0)

  const existing = getToken(workspaceId, tokenKey)
  const hasSaved = !!existing

  function handleSave() {
    if (!value.trim()) return
    saveToken(workspaceId, tokenKey, value)
    setSaved(true)
    setValue('')
    setTick(t => t + 1)
    setTimeout(() => setSaved(false), 2000)
    if (onSaved) onSaved()
  }

  function handleClear() {
    localStorage.removeItem(getTokenKey(workspaceId, tokenKey))
    setValue('')
    setTick(t => t + 1)
    if (onSaved) onSaved()
  }

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{
        display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', marginBottom: 5,
      }}>
        <label style={{
          fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600,
          letterSpacing: '0.08em', textTransform: 'uppercase',
          color: 'var(--color-text-muted)',
        }}>
          {label}
        </label>
        {hasSaved && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 5,
            fontFamily: 'var(--font-sans)', fontSize: 11, fontWeight: 600,
            color: '#16a34a',
          }}>
            <CheckCircleIcon style={{ width: 11, height: 11 }}/>
            Saved
            <button
              onClick={handleClear}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--color-text-muted)', padding: 0,
                marginLeft: 4, display: 'flex',
              }}
              title="Remove token"
            >
              <XMarkIcon style={{ width: 12, height: 12 }}/>
            </button>
          </div>
        )}
      </div>

      {hasSaved ? (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '9px 12px',
          background: 'rgba(22,163,74,0.06)',
          border: '1px solid rgba(22,163,74,0.2)',
          borderRadius: 'var(--radius-md)',
          fontFamily: 'var(--font-mono)', fontSize: 12, color: '#16a34a',
        }}>
          <KeyIcon style={{ width: 13, height: 13 }}/>
          ••••••••{existing.slice(-4)}
        </div>
      ) : (
        <div style={{ position: 'relative' }}>
          <input
            type={show ? 'text' : 'password'}
            value={value}
            onChange={e => setValue(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSave() }}
            placeholder={placeholder}
            style={{
              width: '100%',
              background: 'var(--color-card)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-md)',
              padding: '9px 72px 9px 12px',
              fontFamily: 'var(--font-sans)', fontSize: 13,
              color: 'var(--color-text)', outline: 'none',
              boxSizing: 'border-box',
              transition: 'var(--transition-fast)',
            }}
            onFocus={e => {
              e.target.style.borderColor = '#7C3AED'
              e.target.style.boxShadow = '0 0 0 3px rgba(124,58,237,0.12)'
            }}
            onBlur={e => {
              e.target.style.borderColor = 'var(--color-border)'
              e.target.style.boxShadow = 'none'
            }}
          />
          <div style={{
            position: 'absolute', right: 8, top: '50%',
            transform: 'translateY(-50%)', display: 'flex', gap: 4,
          }}>
            <button
              type="button"
              onClick={() => setShow(p => !p)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                padding: 4, color: 'var(--color-text-muted)', display: 'flex',
              }}
            >
              {show
                ? <EyeSlashIcon style={{ width: 14, height: 14 }}/>
                : <EyeIcon style={{ width: 14, height: 14 }}/>
              }
            </button>
            {value.trim() && (
              <button
                onClick={handleSave}
                style={{
                  background: '#7C3AED', border: 'none', borderRadius: 5,
                  cursor: 'pointer', padding: '2px 8px',
                  fontFamily: 'var(--font-sans)', fontSize: 11, fontWeight: 700,
                  color: 'white',
                }}
              >
                Save
              </button>
            )}
          </div>
        </div>
      )}

      {help && (
        <div style={{
          fontSize: 11, color: 'var(--color-text-muted)',
          marginTop: 4, lineHeight: 1.5,
        }}>
          {help}
          {helpUrl && (
            <a
              href={helpUrl} target="_blank" rel="noopener noreferrer"
              style={{
                color: '#7C3AED', marginLeft: 4, textDecoration: 'none',
                display: 'inline-flex', alignItems: 'center', gap: 2,
              }}
            >
              Get token
              <ArrowTopRightOnSquareIcon style={{ width: 10, height: 10 }}/>
            </a>
          )}
        </div>
      )}
    </div>
  )
}

// ── LinearTeamPicker ──────────────────────────────────────────────────────────

function LinearTeamPicker({ workspaceId, projectId, hasToken, onSave, authHeader }) {
  const [teams, setTeams] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function fetchTeams() {
    const token = getToken(workspaceId, 'linear')
    if (!token) {
      setError('Save your Linear API token in the workspace tokens section first.')
      return
    }
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/connectors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader },
        body: JSON.stringify({
          type: 'linear',
          action: 'get_teams',
          linearToken: token,
          projectId,
          workspaceId,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed')
      setTeams(data.data?.teams || [])
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (hasToken) fetchTeams()
  }, [])

  if (!hasToken) {
    return (
      <div style={{ fontSize: 12, color: 'var(--color-text-muted)', fontStyle: 'italic' }}>
        Save your Linear API token above first.
      </div>
    )
  }
  if (loading) {
    return (
      <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
        Loading your Linear teams…
      </div>
    )
  }
  if (error) {
    return (
      <div style={{ fontSize: 12, color: '#dc2626' }}>{error}</div>
    )
  }

  return (
    <div>
      <div style={{
        fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600,
        letterSpacing: '0.08em', textTransform: 'uppercase',
        color: 'var(--color-text-muted)', marginBottom: 8,
      }}>
        Select team
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {teams.map(team => (
          <button
            key={team.id}
            onClick={() => onSave(team.id, team.name)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '9px 12px',
              background: 'var(--color-card)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-md)',
              cursor: 'pointer',
              fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 600,
              color: 'var(--color-text)', textAlign: 'left',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.borderColor = '#5E6AD2'
              e.currentTarget.style.background = 'rgba(94,106,210,0.06)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.borderColor = 'var(--color-border)'
              e.currentTarget.style.background = 'var(--color-card)'
            }}
          >
            <div style={{
              width: 22, height: 22, borderRadius: 5,
              background: 'rgba(94,106,210,0.15)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700,
              color: '#5E6AD2', flexShrink: 0,
            }}>
              {(team.key || team.name || '').slice(0, 2).toUpperCase()}
            </div>
            {team.name}
          </button>
        ))}
        {teams.length === 0 && !loading && (
          <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
            No teams found in your Linear workspace.
          </div>
        )}
      </div>
    </div>
  )
}

// ── ConnectedPreview ──────────────────────────────────────────────────────────

function ConnectedPreview({ type, connectorRow, accentColor }) {
  if (type === 'figma') {
    const d = connectorRow?.figma_extracted
    if (!d?.colors?.length && !d?.fonts?.length) return null
    return (
      <div style={{
        borderTop: '1px solid var(--color-border)',
        padding: '10px 16px',
        background: 'var(--color-surface)',
        display: 'flex', gap: 16, flexWrap: 'wrap',
      }}>
        {d.colors?.length > 0 && (
          <div>
            <div style={{
              fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700,
              letterSpacing: '0.08em', textTransform: 'uppercase',
              color: 'var(--color-text-muted)', marginBottom: 5,
            }}>
              Colors ({d.colorCount})
            </div>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {d.colors.slice(0, 12).map((c, i) => (
                <div key={i} title={c.name + ' ' + c.hex} style={{
                  width: 20, height: 20, borderRadius: 5,
                  background: c.hex, border: '1px solid rgba(0,0,0,0.1)',
                }}/>
              ))}
            </div>
          </div>
        )}
        {d.fonts?.length > 0 && (
          <div>
            <div style={{
              fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700,
              letterSpacing: '0.08em', textTransform: 'uppercase',
              color: 'var(--color-text-muted)', marginBottom: 5,
            }}>
              Fonts
            </div>
            {d.fonts.slice(0, 3).map((f, i) => (
              <div key={i} style={{
                fontFamily: 'var(--font-mono)', fontSize: 11,
                color: 'var(--color-text-soft)', marginBottom: 2,
              }}>
                {f.fontFamily}
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  if (type === 'github') {
    const d = connectorRow?.github_extracted
    if (!d) return null
    const chips = [
      d.framework, d.language, d.styling,
      ...(d.uiKit || []), d.animations, d.database,
    ].filter(Boolean)
    if (!chips.length) return null
    return (
      <div style={{
        borderTop: '1px solid var(--color-border)',
        padding: '10px 16px',
        background: 'var(--color-surface)',
        display: 'flex', gap: 5, flexWrap: 'wrap',
      }}>
        {chips.map((item, i) => (
          <span key={i} style={{
            background: 'var(--color-surface-2)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-full)',
            padding: '2px 9px',
            fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600,
            color: 'var(--color-text-soft)',
          }}>
            {item}
          </span>
        ))}
      </div>
    )
  }

  if (type === 'linear') {
    return (
      <div style={{
        borderTop: '1px solid var(--color-border)',
        padding: '8px 16px',
        background: 'var(--color-surface)',
        fontFamily: 'var(--font-sans)', fontSize: 12,
        color: 'var(--color-text-muted)',
      }}>
        Tasks will push to team:
        <strong style={{ color: '#5E6AD2', marginLeft: 4 }}>
          {connectorRow?.linear_team_name}
        </strong>
      </div>
    )
  }
  return null
}

// ── ProjectConnectorCard ──────────────────────────────────────────────────────

function ProjectConnectorCard({
  type, name, accentColor, IconComponent,
  projectId, workspaceId, connectorRow,
  loading, onConnect, onDisconnect, onSync, authHeader,
}) {
  const [expanded, setExpanded] = useState(false)
  const [fieldValues, setFieldValues] = useState({})
  const [localLoading, setLocalLoading] = useState(false)
  const [error, setError] = useState('')

  const hasToken = !!getToken(workspaceId, type)

  const isConnected =
    type === 'figma'  ? !!connectorRow?.figma_file_url
    : type === 'github' ? !!connectorRow?.github_repo_url
    : !!connectorRow?.linear_team_id

  const summary =
    type === 'figma'  ? (connectorRow?.figma_file_name || connectorRow?.figma_file_url)
    : type === 'github' ? (connectorRow?.github_repo_name || connectorRow?.github_repo_url)
    : connectorRow?.linear_team_name

  const needsToken = type !== 'github'
  const canConnect = hasToken || !needsToken

  const fields = {
    figma: [
      {
        key: 'figmaUrl',
        label: 'Figma File URL',
        placeholder: 'https://figma.com/design/...',
        help: 'Open your file in Figma and copy the URL from the browser',
      },
    ],
    github: [
      {
        key: 'repoUrl',
        label: 'Repository URL',
        placeholder: 'https://github.com/owner/repo',
        help: 'Public repos work without a token. Add a GitHub token above for private repos.',
      },
    ],
    linear: [],
  }[type] || []

  async function handleConnect() {
    const token = getToken(workspaceId, type)
    if (needsToken && !token) {
      setError('Save your ' + name + ' API token in the workspace tokens section first.')
      return
    }
    setLocalLoading(true)
    setError('')
    try {
      const extra = {}
      if (type === 'figma') { extra.figmaToken = token; extra.figmaUrl = fieldValues.figmaUrl }
      if (type === 'github') { extra.repoUrl = fieldValues.repoUrl; if (token) extra.githubToken = token }
      await onConnect(extra)
      setExpanded(false)
      setFieldValues({})
    } catch (e) {
      setError(e.message)
    } finally {
      setLocalLoading(false)
    }
  }

  return (
    <div style={{
      background: 'var(--color-card)',
      border: '1.5px solid ' + (isConnected ? accentColor + '40' : 'var(--color-border)'),
      borderRadius: 'var(--radius-lg)',
      overflow: 'hidden',
      boxShadow: isConnected ? '0 0 0 3px ' + accentColor + '10' : 'var(--shadow-xs)',
      fontFamily: 'var(--font-sans)',
    }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px' }}>
        <div style={{
          width: 38, height: 38, borderRadius: 'var(--radius-md)', flexShrink: 0,
          background: isConnected ? accentColor + '15' : 'var(--color-surface)',
          border: '1px solid ' + (isConnected ? accentColor + '30' : 'var(--color-border)'),
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <IconComponent style={{
            width: 19, height: 19,
            color: isConnected ? accentColor : 'var(--color-text-muted)',
          }}/>
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 2 }}>
            <span style={{
              fontWeight: 700, fontSize: 14, letterSpacing: '-0.02em',
              color: 'var(--color-text)',
            }}>
              {name}
            </span>
            {isConnected && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 3,
                background: accentColor + '12', border: '1px solid ' + accentColor + '25',
                borderRadius: 'var(--radius-full)', padding: '1px 8px',
                fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700,
                color: accentColor, letterSpacing: '0.06em', textTransform: 'uppercase',
              }}>
                <CheckCircleIcon style={{ width: 8, height: 8 }}/>
                Connected
              </span>
            )}
          </div>
          <div style={{
            fontSize: 11, color: 'var(--color-text-muted)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {isConnected && summary
              ? summary
              : !canConnect
                ? 'Save API token above first'
                : 'Not connected for this project'}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 7, flexShrink: 0 }}>
          {isConnected ? (
            <>
              <button
                onClick={onSync}
                disabled={loading}
                title="Re-sync"
                style={{
                  width: 30, height: 30, borderRadius: 'var(--radius-md)',
                  background: 'transparent', border: '1px solid var(--color-border)',
                  cursor: 'pointer', display: 'flex', alignItems: 'center',
                  justifyContent: 'center', color: 'var(--color-text-muted)',
                }}
                onMouseEnter={e => { e.currentTarget.style.color = accentColor; e.currentTarget.style.borderColor = accentColor }}
                onMouseLeave={e => { e.currentTarget.style.color = 'var(--color-text-muted)'; e.currentTarget.style.borderColor = 'var(--color-border)' }}
              >
                <ArrowPathIcon style={{
                  width: 13, height: 13,
                  animation: loading ? 'spin 1s linear infinite' : 'none',
                }}/>
              </button>
              <button
                onClick={onDisconnect}
                style={{
                  padding: '5px 12px', background: 'transparent',
                  border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)',
                  cursor: 'pointer', fontFamily: 'var(--font-sans)', fontSize: 12,
                  fontWeight: 600, color: 'var(--color-text-muted)',
                }}
                onMouseEnter={e => { e.currentTarget.style.color = '#dc2626'; e.currentTarget.style.borderColor = '#dc2626' }}
                onMouseLeave={e => { e.currentTarget.style.color = 'var(--color-text-muted)'; e.currentTarget.style.borderColor = 'var(--color-border)' }}
              >
                Remove
              </button>
            </>
          ) : (
            <button
              onClick={() => setExpanded(p => !p)}
              disabled={!canConnect && type !== 'linear'}
              style={{
                padding: '7px 16px',
                background: expanded ? 'transparent' : (!canConnect ? 'var(--color-surface)' : 'var(--color-primary)'),
                color: expanded ? accentColor : (!canConnect ? 'var(--color-text-muted)' : 'var(--color-primary-text)'),
                border: '1.5px solid ' + (expanded ? accentColor : 'transparent'),
                borderRadius: 'var(--radius-md)',
                cursor: !canConnect ? 'not-allowed' : 'pointer',
                fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 700,
                opacity: !canConnect && type !== 'linear' ? 0.6 : 1,
              }}
            >
              {expanded ? 'Cancel' : 'Connect'}
            </button>
          )}
        </div>
      </div>

      {/* Connect form */}
      {!isConnected && expanded && (
        <div style={{
          borderTop: '1px solid var(--color-border)',
          padding: '14px 16px 16px',
          background: 'var(--color-surface)',
        }}>
          {type === 'linear' ? (
            <LinearTeamPicker
              workspaceId={workspaceId}
              projectId={projectId}
              hasToken={hasToken}
              authHeader={authHeader}
              onSave={async (teamId, teamName) => {
                setLocalLoading(true)
                setError('')
                try {
                  await onConnect({ teamId, teamName, linearToken: getToken(workspaceId, 'linear') })
                  setExpanded(false)
                } catch (e) {
                  setError(e.message)
                } finally {
                  setLocalLoading(false)
                }
              }}
            />
          ) : (
            <>
              {fields.map(field => (
                <div key={field.key} style={{ marginBottom: 12 }}>
                  <label style={{
                    display: 'block', fontFamily: 'var(--font-mono)',
                    fontSize: 10, fontWeight: 600, letterSpacing: '0.08em',
                    textTransform: 'uppercase', color: 'var(--color-text-muted)',
                    marginBottom: 5,
                  }}>
                    {field.label}
                  </label>
                  <input
                    type="text"
                    value={fieldValues[field.key] || ''}
                    onChange={e => setFieldValues(p => ({ ...p, [field.key]: e.target.value }))}
                    placeholder={field.placeholder}
                    style={{
                      width: '100%', background: 'var(--color-card)',
                      border: '1px solid var(--color-border)',
                      borderRadius: 'var(--radius-md)', padding: '9px 12px',
                      fontFamily: 'var(--font-sans)', fontSize: 13,
                      color: 'var(--color-text)', outline: 'none', boxSizing: 'border-box',
                    }}
                    onFocus={e => { e.target.style.borderColor = accentColor; e.target.style.boxShadow = '0 0 0 3px ' + accentColor + '15' }}
                    onBlur={e => { e.target.style.borderColor = 'var(--color-border)'; e.target.style.boxShadow = 'none' }}
                  />
                  {field.help && (
                    <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 3 }}>
                      {field.help}
                    </div>
                  )}
                </div>
              ))}

              {error && (
                <div style={{
                  padding: '7px 10px', background: '#FEF2F2',
                  border: '1px solid #FECACA', borderRadius: 'var(--radius-md)',
                  fontSize: 12, color: '#DC2626', marginBottom: 12,
                  display: 'flex', gap: 6, alignItems: 'flex-start',
                }}>
                  <ExclamationCircleIcon style={{ width: 13, height: 13, flexShrink: 0, marginTop: 1 }}/>
                  {error}
                </div>
              )}

              <button
                onClick={handleConnect}
                disabled={localLoading}
                style={{
                  padding: '9px 20px',
                  background: localLoading ? 'var(--color-border)' : accentColor,
                  color: 'white', border: 'none', borderRadius: 'var(--radius-md)',
                  cursor: localLoading ? 'not-allowed' : 'pointer',
                  fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 700,
                }}
              >
                {localLoading ? 'Connecting…' : 'Connect'}
              </button>
            </>
          )}

          {error && type === 'linear' && (
            <div style={{
              marginTop: 10, padding: '7px 10px', background: '#FEF2F2',
              border: '1px solid #FECACA', borderRadius: 'var(--radius-md)',
              fontSize: 12, color: '#DC2626', display: 'flex', gap: 6,
            }}>
              <ExclamationCircleIcon style={{ width: 13, height: 13, flexShrink: 0, marginTop: 1 }}/>
              {error}
            </div>
          )}
        </div>
      )}

      {/* Connected data preview */}
      {isConnected && (
        <ConnectedPreview type={type} connectorRow={connectorRow} accentColor={accentColor}/>
      )}
    </div>
  )
}

// ── Brand icons ───────────────────────────────────────────────────────────────

function FigmaIcon({ style }) {
  return (
    <svg viewBox="0 0 38 57" style={style} fill="none">
      <path d="M19 28.5a9.5 9.5 0 1 1 19 0 9.5 9.5 0 0 1-19 0z" fill="#1ABCFE"/>
      <path d="M0 47.5A9.5 9.5 0 0 1 9.5 38H19v9.5a9.5 9.5 0 1 1-19 0z" fill="#0ACF83"/>
      <path d="M19 0v19h9.5a9.5 9.5 0 1 0 0-19H19z" fill="#FF7262"/>
      <path d="M0 9.5A9.5 9.5 0 0 0 9.5 19H19V0H9.5A9.5 9.5 0 0 0 0 9.5z" fill="#F24E1E"/>
      <path d="M0 28.5A9.5 9.5 0 0 0 9.5 38H19V19H9.5A9.5 9.5 0 0 0 0 28.5z" fill="#FF7262"/>
    </svg>
  )
}

function GitHubIcon({ style }) {
  return (
    <svg viewBox="0 0 24 24" style={style} fill="currentColor">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/>
    </svg>
  )
}

function LinearIcon({ style }) {
  return (
    <svg viewBox="0 0 100 100" style={style} fill="currentColor">
      <path d="M1.22541 61.5228c-.2225-.9485.90748-1.5459 1.59638-.857l37.4647 37.4648c.6889.6889.0915 1.8189-.857 1.5964C20.0515 94.4522 5.54779 79.9485 1.22541 61.5228zM.00189 46.8891c-.01764 1.1768.92748 2.3339 1.02777 3.4728L52.1109 99.9981c1.1768.0176 2.3339.0077 3.4728-.0277L.02966 46.6628c-.03549 1.0617-.04474 1.5734-.02777 2.2263zM5.91288 27.2783c-.4681-.7927.3124-1.7133 1.1762-1.3938L72.9214 92.9138c.3195.8639-.6011 1.6445-1.3938 1.1762C58.1808 86.8084 14.1973 42.8248 5.91288 27.2783zM16.1427 13.4795c-.5292-.6892.1312-1.6472.9425-1.3942l71.4237 71.4238c.253.8113-.705 1.4717-1.3942.9425C74.5437 73.2108 26.8467 25.5138 16.1427 13.4795z"/>
    </svg>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Connectors() {
  const { workspace, activeProject } = useApp()
  const [connectorRow, setConnectorRow] = useState(null)
  const [loading, setLoading] = useState({ figma: false, github: false, linear: false })
  const [authHeader, setAuthHeader] = useState({})

  const projectId = activeProject?.id || null

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setAuthHeader(session?.access_token
        ? { Authorization: 'Bearer ' + session.access_token }
        : {})
    })
  }, [])

  useEffect(() => {
    if (workspace?.id && projectId) loadConnectorRow()
  }, [workspace?.id, projectId])

  async function loadConnectorRow() {
    try {
      const { data } = await supabase
        .from('project_connectors')
        .select('*')
        .eq('workspace_id', workspace.id)
        .eq('project_id', String(projectId))
        .single()
      setConnectorRow(data || null)
    } catch {
      setConnectorRow(null)
    }
  }

  async function callConnector(type, body) {
    const res = await fetch('/api/connectors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader },
      body: JSON.stringify({
        type,
        projectId: String(projectId),
        workspaceId: workspace.id,
        ...body,
      }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Failed')
    return data
  }

  async function handleConnect(type, values) {
    setLoading(p => ({ ...p, [type]: true }))
    try {
      const actionMap = { figma: 'connect', github: 'connect', linear: 'save_team' }
      await callConnector(type, { action: actionMap[type], ...values })
      await loadConnectorRow()
    } finally {
      setLoading(p => ({ ...p, [type]: false }))
    }
  }

  async function handleDisconnect(type) {
    if (!confirm('Remove ' + type + ' from this project?')) return
    setLoading(p => ({ ...p, [type]: true }))
    try {
      await callConnector(type, { action: 'disconnect' })
      await loadConnectorRow()
    } finally {
      setLoading(p => ({ ...p, [type]: false }))
    }
  }

  async function handleSync(type) {
    setLoading(p => ({ ...p, [type]: true }))
    try {
      const token = getToken(workspace.id, type)
      const extraMap = {
        figma: { figmaToken: token, figmaUrl: connectorRow?.figma_file_url },
        github: { repoUrl: connectorRow?.github_repo_url, githubToken: token },
        linear: { linearToken: token, teamId: connectorRow?.linear_team_id },
      }
      await callConnector(type, { action: 'connect', ...extraMap[type] })
      await loadConnectorRow()
    } finally {
      setLoading(p => ({ ...p, [type]: false }))
    }
  }

  const TOOLS = [
    {
      type: 'figma', name: 'Figma', accentColor: '#A259FF',
      IconComponent: FigmaIcon,
      tokenLabel: 'Figma Personal Access Token',
      tokenPlaceholder: 'figd_...',
      tokenHelp: 'Used to read color and text styles from your Figma files.',
      tokenHelpUrl: 'https://help.figma.com/hc/en-us/articles/8085703771159',
    },
    {
      type: 'github', name: 'GitHub', accentColor: '#6E7681',
      IconComponent: GitHubIcon,
      tokenLabel: 'GitHub Personal Access Token',
      tokenPlaceholder: 'ghp_...',
      tokenHelp: 'Optional — only needed for private repos.',
      tokenHelpUrl: 'https://github.com/settings/tokens',
    },
    {
      type: 'linear', name: 'Linear', accentColor: '#5E6AD2',
      IconComponent: LinearIcon,
      tokenLabel: 'Linear API Key',
      tokenPlaceholder: 'lin_api_...',
      tokenHelp: 'Used to read your teams and push tasks as issues.',
      tokenHelpUrl: 'https://linear.app/settings/api',
    },
  ]

  return (
    <div style={{ padding: '28px 32px', maxWidth: 680, fontFamily: 'var(--font-sans)' }}>

      {/* ── Header ── */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 7 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 'var(--radius-md)',
            background: 'linear-gradient(135deg, #7C3AED 0%, #A855F7 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <LinkIcon style={{ width: 15, height: 15, color: 'white' }}/>
          </div>
          <h1 style={{
            fontWeight: 800, fontSize: 20, letterSpacing: '-0.04em',
            color: 'var(--color-text)', margin: 0,
          }}>
            Connectors
          </h1>
        </div>
        <p style={{
          fontSize: 13, color: 'var(--color-text-muted)', lineHeight: 1.65,
          margin: 0, maxWidth: 480,
        }}>
          API tokens are saved once per workspace in your browser.
          File URLs and repos are configured per project — each project
          connects to its own Figma file and GitHub repo.
        </p>
      </div>

      {/* ── Section 1: Workspace tokens ── */}
      <div style={{
        background: 'var(--color-card)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-xl)',
        padding: '18px 20px 6px',
        marginBottom: 20,
        boxShadow: 'var(--shadow-xs)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 16 }}>
          <KeyIcon style={{ width: 14, height: 14, color: 'var(--color-text-muted)' }}/>
          <span style={{
            fontWeight: 700, fontSize: 13, letterSpacing: '-0.02em',
            color: 'var(--color-text)',
          }}>
            Workspace API Tokens
          </span>
          <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
            — enter once, used across all projects
          </span>
        </div>

        {workspace?.id && TOOLS.map(tool => (
          <TokenField
            key={tool.type}
            label={tool.tokenLabel}
            tokenKey={tool.type}
            workspaceId={workspace.id}
            placeholder={tool.tokenPlaceholder}
            help={tool.tokenHelp}
            helpUrl={tool.tokenHelpUrl}
            onSaved={() => setConnectorRow(r => ({ ...r }))}
          />
        ))}

        {!workspace?.id && (
          <div style={{ fontSize: 12, color: 'var(--color-text-muted)', paddingBottom: 12 }}>
            Loading workspace…
          </div>
        )}
      </div>

      {/* ── Section 2: Project connectors ── */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 12 }}>
          <FolderIcon style={{ width: 14, height: 14, color: 'var(--color-text-muted)' }}/>
          <span style={{
            fontWeight: 700, fontSize: 13, letterSpacing: '-0.02em',
            color: 'var(--color-text)',
          }}>
            Project Connectors
          </span>
          {activeProject?.title && (
            <span style={{
              fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600,
              letterSpacing: '0.04em',
              background: 'rgba(124,58,237,0.08)',
              color: '#7C3AED',
              border: '1px solid rgba(124,58,237,0.2)',
              borderRadius: 'var(--radius-full)',
              padding: '2px 8px',
            }}>
              {activeProject.title}
            </span>
          )}
        </div>

        {!projectId ? (
          <div style={{
            padding: '28px 20px', textAlign: 'center',
            background: 'var(--color-surface)',
            border: '1px dashed var(--color-border)',
            borderRadius: 'var(--radius-xl)',
          }}>
            <FolderIcon style={{
              width: 26, height: 26, color: 'var(--color-text-muted)',
              margin: '0 auto 10px', display: 'block',
            }}/>
            <div style={{
              fontWeight: 600, fontSize: 13, color: 'var(--color-text)', marginBottom: 5,
            }}>
              No project selected
            </div>
            <div style={{
              fontSize: 12, color: 'var(--color-text-muted)', lineHeight: 1.6, maxWidth: 300, margin: '0 auto',
            }}>
              Open a project first, then return here to connect its Figma file,
              GitHub repo, and Linear team.
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {TOOLS.map(tool => (
              <ProjectConnectorCard
                key={tool.type}
                {...tool}
                projectId={projectId}
                workspaceId={workspace.id}
                connectorRow={connectorRow}
                loading={loading[tool.type]}
                authHeader={authHeader}
                onConnect={values => handleConnect(tool.type, values)}
                onDisconnect={() => handleDisconnect(tool.type)}
                onSync={() => handleSync(tool.type)}
              />
            ))}
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
