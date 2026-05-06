import React, { useState, useEffect } from 'react'
import { useApp } from '../context/AppContext'
import { supabase } from '../lib/supabase'
import {
  LinkIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  ArrowPathIcon,
  EyeIcon,
  EyeSlashIcon,
} from '@heroicons/react/24/outline'

// ─── ConnectorCard ────────────────────────────────────────────────────────────

function ConnectorCard({
  type,
  name,
  description,
  icon: Icon,
  accentColor,
  connected,
  connectedData,
  onConnect,
  onDisconnect,
  onSync,
  loading,
  fields,
}) {
  const [expanded, setExpanded] = useState(false)
  const [values, setValues] = useState({})
  const [showSecrets, setShowSecrets] = useState({})
  const [localLoading, setLocalLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleConnect() {
    setLocalLoading(true)
    setError('')
    try {
      await onConnect(values)
      setExpanded(false)
      setValues({})
    } catch (e) {
      setError(e.message)
    } finally {
      setLocalLoading(false)
    }
  }

  const isConnected = connected === true
  const allRequiredFilled = fields.every(
    f => f.required === false || values[f.key]?.trim()
  )

  return (
    <div style={{
      background: 'var(--color-card)',
      border: '1.5px solid ' + (isConnected ? accentColor + '40' : 'var(--color-border)'),
      borderRadius: 'var(--radius-xl)',
      overflow: 'hidden',
      fontFamily: 'var(--font-sans)',
      transition: 'border-color var(--transition-base)',
      boxShadow: isConnected ? '0 0 0 3px ' + accentColor + '12' : 'var(--shadow-xs)',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '18px 20px' }}>
        {/* Icon */}
        <div style={{
          width: 42, height: 42, flexShrink: 0,
          borderRadius: 'var(--radius-md)',
          background: isConnected ? accentColor + '15' : 'var(--color-surface)',
          border: '1px solid ' + (isConnected ? accentColor + '30' : 'var(--color-border)'),
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon style={{ width: 20, height: 20, color: isConnected ? accentColor : 'var(--color-text-muted)' }} />
        </div>

        {/* Name + status */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
            <span style={{ fontWeight: 700, fontSize: 15, letterSpacing: '-0.02em', color: 'var(--color-text)' }}>
              {name}
            </span>
            {isConnected && (
              <span style={{
                display: 'flex', alignItems: 'center', gap: 4,
                background: accentColor + '12',
                border: '1px solid ' + accentColor + '25',
                borderRadius: 'var(--radius-full)',
                padding: '2px 9px',
                fontFamily: 'var(--font-mono)',
                fontSize: 9, fontWeight: 700,
                color: accentColor,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
              }}>
                <CheckCircleIcon style={{ width: 9, height: 9 }} />
                Connected
              </span>
            )}
          </div>
          <div style={{ fontSize: 12, color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
            {isConnected && connectedData ? connectedData.summary : description}
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {isConnected ? (
            <>
              <button
                onClick={onSync}
                disabled={loading}
                title="Re-sync"
                style={{
                  width: 32, height: 32,
                  borderRadius: 'var(--radius-md)',
                  background: 'transparent',
                  border: '1px solid var(--color-border)',
                  cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'var(--color-text-muted)',
                  transition: 'var(--transition-fast)',
                }}
                onMouseEnter={e => { e.currentTarget.style.color = accentColor; e.currentTarget.style.borderColor = accentColor }}
                onMouseLeave={e => { e.currentTarget.style.color = 'var(--color-text-muted)'; e.currentTarget.style.borderColor = 'var(--color-border)' }}
              >
                <ArrowPathIcon style={{ width: 14, height: 14, animation: loading ? 'spin 1s linear infinite' : 'none' }} />
              </button>
              <button
                onClick={onDisconnect}
                style={{
                  padding: '6px 14px',
                  background: 'transparent',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-md)',
                  cursor: 'pointer',
                  fontFamily: 'var(--font-sans)',
                  fontSize: 12, fontWeight: 600,
                  color: 'var(--color-text-muted)',
                  transition: 'var(--transition-fast)',
                }}
                onMouseEnter={e => { e.currentTarget.style.color = '#dc2626'; e.currentTarget.style.borderColor = '#dc2626' }}
                onMouseLeave={e => { e.currentTarget.style.color = 'var(--color-text-muted)'; e.currentTarget.style.borderColor = 'var(--color-border)' }}
              >
                Disconnect
              </button>
            </>
          ) : (
            <button
              onClick={() => setExpanded(v => !v)}
              style={{
                padding: '7px 16px',
                background: expanded ? accentColor + '12' : 'var(--color-primary)',
                color: expanded ? accentColor : 'var(--color-primary-text)',
                border: '1px solid ' + (expanded ? accentColor : 'transparent'),
                borderRadius: 'var(--radius-md)',
                cursor: 'pointer',
                fontFamily: 'var(--font-sans)',
                fontSize: 13, fontWeight: 700,
                transition: 'var(--transition-fast)',
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
          padding: '16px 20px 18px',
          background: 'var(--color-surface)',
        }}>
          {fields.map(field => (
            <div key={field.key} style={{ marginBottom: 12 }}>
              <label style={{
                display: 'block',
                fontFamily: 'var(--font-mono)',
                fontSize: 10, fontWeight: 600,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'var(--color-text-muted)',
                marginBottom: 5,
              }}>
                {field.label}
                {field.required === false && (
                  <span style={{ marginLeft: 6, fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>
                    (optional)
                  </span>
                )}
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={field.type === 'password' && !showSecrets[field.key] ? 'password' : 'text'}
                  value={values[field.key] || ''}
                  onChange={e => setValues(prev => ({ ...prev, [field.key]: e.target.value }))}
                  placeholder={field.placeholder}
                  style={{
                    width: '100%',
                    background: 'var(--color-card)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-md)',
                    padding: field.type === 'password' ? '9px 40px 9px 12px' : '9px 12px',
                    fontFamily: 'var(--font-sans)',
                    fontSize: 13,
                    color: 'var(--color-text)',
                    outline: 'none',
                    boxSizing: 'border-box',
                    transition: 'var(--transition-fast)',
                  }}
                  onFocus={e => { e.target.style.borderColor = accentColor; e.target.style.boxShadow = '0 0 0 3px ' + accentColor + '15' }}
                  onBlur={e => { e.target.style.borderColor = 'var(--color-border)'; e.target.style.boxShadow = 'none' }}
                />
                {field.type === 'password' && (
                  <button
                    type="button"
                    onClick={() => setShowSecrets(prev => ({ ...prev, [field.key]: !prev[field.key] }))}
                    style={{
                      position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: 'var(--color-text-muted)', display: 'flex',
                    }}
                  >
                    {showSecrets[field.key]
                      ? <EyeSlashIcon style={{ width: 15, height: 15 }} />
                      : <EyeIcon style={{ width: 15, height: 15 }} />
                    }
                  </button>
                )}
              </div>
              {field.help && (
                <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 4, lineHeight: 1.5 }}>
                  {field.help}
                </div>
              )}
            </div>
          ))}

          {error && (
            <div style={{
              display: 'flex', alignItems: 'flex-start', gap: 7,
              padding: '8px 12px',
              background: '#FEF2F2', border: '1px solid #FECACA',
              borderRadius: 'var(--radius-md)',
              marginBottom: 12, fontSize: 12, color: '#DC2626',
            }}>
              <ExclamationCircleIcon style={{ width: 14, height: 14, flexShrink: 0, marginTop: 1 }} />
              {error}
            </div>
          )}

          <button
            onClick={handleConnect}
            disabled={localLoading || !allRequiredFilled}
            style={{
              padding: '9px 20px',
              background: localLoading || !allRequiredFilled ? 'var(--color-border)' : accentColor,
              color: 'white',
              border: 'none',
              borderRadius: 'var(--radius-md)',
              cursor: localLoading || !allRequiredFilled ? 'default' : 'pointer',
              fontFamily: 'var(--font-sans)',
              fontSize: 13, fontWeight: 700,
              transition: 'var(--transition-fast)',
            }}
          >
            {localLoading ? 'Connecting…' : 'Connect ' + name}
          </button>
        </div>
      )}

      {/* Connected data preview */}
      {isConnected && connectedData?.details && (
        <div style={{
          borderTop: '1px solid var(--color-border)',
          padding: '12px 20px',
          background: 'var(--color-surface)',
        }}>
          {connectedData.details}
        </div>
      )}
    </div>
  )
}

// ─── Connectors page ──────────────────────────────────────────────────────────

export default function Connectors() {
  const { workspace } = useApp()
  const [connectors, setConnectors] = useState({ figma: null, github: null, linear: null })
  const [loading, setLoading] = useState({ figma: false, github: false, linear: false })

  useEffect(() => {
    if (!workspace?.id) return
    loadConnectors()
  }, [workspace?.id])

  async function loadConnectors() {
    try {
      const { data } = await supabase
        .from('connectors')
        .select('*')
        .eq('workspace_id', workspace.id)
      if (data) {
        const map = {}
        data.forEach(c => { map[c.type] = c })
        setConnectors(prev => ({
          ...prev,
          figma: map.figma || null,
          github: map.github || null,
          linear: map.linear || null,
        }))
      }
    } catch (e) {
      console.error('[connectors load]', e)
    }
  }

  async function getAuthHeader() {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token
      ? { 'Authorization': 'Bearer ' + session.access_token }
      : {}
  }

  async function callConnector(type, body) {
    const authH = await getAuthHeader()
    const res = await fetch('/api/connectors/' + type, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authH },
      body: JSON.stringify({ workspaceId: workspace.id, ...body }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Connection failed')
    return data
  }

  async function handleConnect(type, values) {
    setLoading(prev => ({ ...prev, [type]: true }))
    try {
      await callConnector(type, { action: 'connect', ...values })
      await loadConnectors()
    } finally {
      setLoading(prev => ({ ...prev, [type]: false }))
    }
  }

  async function handleDisconnect(type) {
    if (!confirm('Disconnect ' + type + '? Extracted data will be cleared.')) return
    setLoading(prev => ({ ...prev, [type]: true }))
    try {
      await callConnector(type, { action: 'disconnect' })
      await loadConnectors()
    } finally {
      setLoading(prev => ({ ...prev, [type]: false }))
    }
  }

  async function handleSync(type) {
    setLoading(prev => ({ ...prev, [type]: true }))
    try {
      await callConnector(type, { action: 'sync' })
      await loadConnectors()
    } finally {
      setLoading(prev => ({ ...prev, [type]: false }))
    }
  }

  // ── Connected data summaries ──────────────────────────────────────────────

  function figmaConnectedData() {
    const d = connectors.figma?.extracted_data
    if (!d) return null
    return {
      summary: d.fileName + ' · ' + d.colorCount + ' colour styles · ' + d.textStyleCount + ' text styles',
      details: (
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          {d.colors?.length > 0 && (
            <div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-text-muted)', marginBottom: 6 }}>
                Colours
              </div>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {d.colors.slice(0, 10).map((c, i) => (
                  <div key={i} title={c.name + ' ' + c.hex} style={{ width: 20, height: 20, borderRadius: 5, background: c.hex, border: '1px solid rgba(0,0,0,0.1)' }} />
                ))}
              </div>
            </div>
          )}
          {d.fonts?.length > 0 && (
            <div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-text-muted)', marginBottom: 6 }}>
                Fonts
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                {d.fonts.slice(0, 3).map((f, i) => (
                  <div key={i} style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--color-text-soft)' }}>{f.fontFamily}</div>
                ))}
              </div>
            </div>
          )}
        </div>
      ),
    }
  }

  function githubConnectedData() {
    const d = connectors.github?.extracted_data
    if (!d) return null
    return {
      summary: d.repoName + ' · ' + (d.framework || 'Unknown framework') + ' · ' + d.language,
      details: (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[d.framework, d.language, d.styling, ...(d.uiKit || []), d.animations, d.database]
            .filter(Boolean)
            .map((item, i) => (
              <span key={i} style={{
                background: 'var(--color-surface-2)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-full)',
                padding: '3px 10px',
                fontFamily: 'var(--font-mono)',
                fontSize: 10, fontWeight: 600,
                color: 'var(--color-text-soft)',
              }}>
                {item}
              </span>
            ))}
        </div>
      ),
    }
  }

  function linearConnectedData() {
    const d = connectors.linear?.extracted_data
    if (!d) return null
    return {
      summary: d.viewer?.name + ' · ' + d.teams?.length + ' team' + (d.teams?.length !== 1 ? 's' : ''),
      details: (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {(d.teams || []).map((t, i) => (
            <span key={i} style={{
              background: 'rgba(99,102,241,0.08)',
              border: '1px solid rgba(99,102,241,0.2)',
              borderRadius: 'var(--radius-full)',
              padding: '3px 10px',
              fontFamily: 'var(--font-mono)',
              fontSize: 10, fontWeight: 600,
              color: '#6366F1',
            }}>
              {t.name}
            </span>
          ))}
        </div>
      ),
    }
  }

  // ── Connector configs ─────────────────────────────────────────────────────

  const CONFIGS = [
    {
      type: 'figma',
      name: 'Figma',
      description: 'Import colour styles, text styles, and font tokens from a Figma file. Enriches brief translations with your actual design system.',
      accentColor: '#A259FF',
      icon: ({ style }) => (
        <svg viewBox="0 0 38 57" style={style} fill="none">
          <path d="M19 28.5a9.5 9.5 0 1 1 19 0 9.5 9.5 0 0 1-19 0z" fill="#1ABCFE"/>
          <path d="M0 47.5A9.5 9.5 0 0 1 9.5 38H19v9.5a9.5 9.5 0 1 1-19 0z" fill="#0ACF83"/>
          <path d="M19 0v19h9.5a9.5 9.5 0 1 0 0-19H19z" fill="#FF7262"/>
          <path d="M0 9.5A9.5 9.5 0 0 0 9.5 19H19V0H9.5A9.5 9.5 0 0 0 0 9.5z" fill="#F24E1E"/>
          <path d="M0 28.5A9.5 9.5 0 0 0 9.5 38H19V19H9.5A9.5 9.5 0 0 0 0 28.5z" fill="#FF7262"/>
        </svg>
      ),
      connected: connectors.figma?.status === 'connected',
      fields: [
        {
          key: 'figmaToken',
          label: 'Figma Access Token',
          placeholder: 'figd_...',
          type: 'password',
          help: 'Get from Figma → Account Settings → Personal access tokens',
        },
        {
          key: 'figmaUrl',
          label: 'Figma File URL',
          placeholder: 'https://figma.com/design/...',
          type: 'text',
          help: 'Open your Figma file and copy the URL from the browser address bar',
        },
      ],
    },
    {
      type: 'github',
      name: 'GitHub',
      description: 'Detect your existing tech stack from a repository. AI prompts extend your current setup instead of suggesting a new one.',
      accentColor: '#24292F',
      icon: ({ style }) => (
        <svg viewBox="0 0 24 24" style={style} fill="currentColor">
          <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/>
        </svg>
      ),
      connected: connectors.github?.status === 'connected',
      fields: [
        {
          key: 'repoUrl',
          label: 'Repository URL',
          placeholder: 'https://github.com/owner/repo',
          type: 'text',
          help: 'Public repos work without a token. Private repos require a token below.',
        },
        {
          key: 'githubToken',
          label: 'GitHub Token',
          placeholder: 'ghp_...',
          type: 'password',
          required: false,
          help: 'Required only for private repos. Create at GitHub → Settings → Developer settings → Personal access tokens',
        },
      ],
    },
    {
      type: 'linear',
      name: 'Linear',
      description: 'Push Team Collab tasks directly to Linear as issues. Priorities and columns map to your Linear workflow states automatically.',
      accentColor: '#5E6AD2',
      icon: ({ style }) => (
        <svg viewBox="0 0 100 100" style={style} fill="currentColor">
          <path d="M1.22541 61.5228c-.2225-.9485.90748-1.5459 1.59638-.857l37.4647 37.4648c.6889.6889.0915 1.8189-.857 1.5964C20.0515 94.4522 5.54779 79.9485 1.22541 61.5228zM.00189 46.8891c-.01764 1.1768.9275 2.2348 2.1044 2.2172L52.1109 99.9981c1.1768.0176 2.3339.0077 3.4728-.0277L.02966 46.6628c-.03549 1.0617-.04474 1.5734-.02777 2.2263zM5.91288 27.2783c-.4681-.7927.3124-1.7133 1.1762-1.3938L72.9214 92.9138c.3195.8639-.6011 1.6445-1.3938 1.1762C58.1808 86.8084 14.1973 42.8248 5.91288 27.2783zM16.1427 13.4795c-.5292-.6892.1312-1.6472.9425-1.3942l71.4237 71.4238c.253.8113-.705 1.4717-1.3942.9425C74.5437 73.2108 26.8467 25.5138 16.1427 13.4795zM32.3125 3.49969c-.6479-.5278-1.5562.2109-1.1918.9563l64.3228 64.3226c.7454.3644 1.4841-.5439.9563-1.1918C88.7294 56.0095 44.0597 13.0085 32.3125 3.49969zM51.6129.926861C51.2557.384083 50.4554.439907 50.1782 1.02093l48.7966 48.7966c.5811-.277.6369-1.0773.0942-1.4346C87.7866 38.2143 62.0011 9.99544 51.6129.926861zM71.7315 1.01626c-.7993-.4207-1.6626.4427-1.2419 1.2419l27.2358 27.2358c.7993.4207 1.6626-.4427 1.2419-1.2419L71.7315 1.01626z"/>
        </svg>
      ),
      connected: connectors.linear?.status === 'connected',
      fields: [
        {
          key: 'linearToken',
          label: 'Linear API Key',
          placeholder: 'lin_api_...',
          type: 'password',
          help: 'Get from Linear → Settings → API → Personal API keys',
        },
      ],
    },
  ]

  return (
    <div style={{ padding: '32px', maxWidth: 760, fontFamily: 'var(--font-sans)' }}>
      {/* Page header */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <div style={{
            width: 32, height: 32,
            borderRadius: 'var(--radius-md)',
            background: 'linear-gradient(135deg, #7C3AED 0%, #A855F7 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <LinkIcon style={{ width: 15, height: 15, color: 'white' }} />
          </div>
          <h1 style={{ fontWeight: 800, fontSize: 22, letterSpacing: '-0.04em', color: 'var(--color-text)', margin: 0 }}>
            Connectors
          </h1>
        </div>
        <p style={{ fontSize: 14, color: 'var(--color-text-muted)', lineHeight: 1.6, margin: 0, maxWidth: 520 }}>
          Connect your tools to make DesignBrief AI smarter. Import design tokens, detect your tech stack, and push tasks to your project board.
        </p>
      </div>

      {/* Cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {CONFIGS.map(config => (
          <ConnectorCard
            key={config.type}
            {...config}
            loading={loading[config.type]}
            connectedData={
              config.type === 'figma' ? figmaConnectedData()
              : config.type === 'github' ? githubConnectedData()
              : linearConnectedData()
            }
            onConnect={values => handleConnect(config.type, values)}
            onDisconnect={() => handleDisconnect(config.type)}
            onSync={() => handleSync(config.type)}
          />
        ))}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
