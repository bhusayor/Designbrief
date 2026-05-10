import { useState, useEffect, useRef } from 'react'
import { XMarkIcon, KeyIcon, EyeIcon, EyeSlashIcon } from '@heroicons/react/24/outline'

export const AGENTS = [
  {
    id: 'claude',
    type: 'claude',
    name: 'Claude',
    model: 'claude-sonnet-4-6',
    badge: 'Sonnet 4.6',
    badgeColor: '#CC785C',
    description: "Anthropic’s Claude — excellent at UI and component code.",
    keyLabel: 'Anthropic API key',
    keyPlaceholder: 'sk-ant-...',
    keyHelpUrl: 'https://console.anthropic.com/settings/keys',
    keyHelpText: 'Get your key at console.anthropic.com',
  },
  {
    id: 'codex',
    type: 'codex',
    name: 'Codex',
    model: 'gpt-4o',
    badge: 'GPT-4o',
    badgeColor: '#10a37f',
    description: "OpenAI's GPT-4o — strong at structured code generation.",
    keyLabel: 'OpenAI API key',
    keyPlaceholder: 'sk-...',
    keyHelpUrl: 'https://platform.openai.com/api-keys',
    keyHelpText: 'Get your key at platform.openai.com',
  },
]

export function getAgentKey(agentId) {
  return localStorage.getItem(`db-agent-key-${agentId}`) || ''
}

function AgentCard({ agent, isSelected, onSelect, expanded, onExpand, onSave }) {
  const [key, setKey] = useState(() => getAgentKey(agent.id))
  const [show, setShow] = useState(false)
  const saved = !!getAgentKey(agent.id)

  function handleSave() {
    if (!key.trim()) return
    localStorage.setItem(`db-agent-key-${agent.id}`, key.trim())
    onSave(agent, key.trim())
  }

  function handleClear() {
    localStorage.removeItem(`db-agent-key-${agent.id}`)
    setKey('')
    if (isSelected) onSave(agent, '')
  }

  const last4 = key.length > 4 ? key.slice(-4) : ''

  return (
    <div
      style={{
        border: `1.5px solid ${isSelected ? agent.badgeColor : 'var(--color-border)'}`,
        borderRadius: 10,
        overflow: 'hidden',
        background: isSelected ? `${agent.badgeColor}08` : 'var(--color-card)',
        transition: 'border-color 0.15s',
      }}
    >
      {/* Header row */}
      <div
        onClick={() => onSelect(agent)}
        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', cursor: 'pointer' }}
      >
        {/* Selection dot */}
        <div style={{
          width: 16, height: 16, borderRadius: '50%',
          border: `2px solid ${isSelected ? agent.badgeColor : 'var(--color-border)'}`,
          background: isSelected ? agent.badgeColor : 'transparent',
          flexShrink: 0,
          transition: 'all 0.15s',
        }} />

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontFamily: "'Urbanist', sans-serif", fontWeight: 700, fontSize: 14, color: 'var(--color-text)' }}>
              {agent.name}
            </span>
            <span style={{
              fontFamily: "'DM Mono', monospace", fontSize: 10, fontWeight: 600,
              color: agent.badgeColor, background: `${agent.badgeColor}18`,
              border: `1px solid ${agent.badgeColor}40`,
              borderRadius: 5, padding: '1px 6px',
            }}>
              {agent.badge}
            </span>
            {saved && (
              <span style={{
                fontFamily: "'DM Mono', monospace", fontSize: 9,
                color: '#22c55e', background: 'rgba(34,197,94,0.1)',
                border: '1px solid rgba(34,197,94,0.3)',
                borderRadius: 5, padding: '1px 6px',
              }}>
                key saved
              </span>
            )}
          </div>
          <div style={{ fontFamily: "'Urbanist', sans-serif", fontSize: 12, color: 'var(--color-text-muted)', marginTop: 1 }}>
            {agent.description}
          </div>
        </div>

        <button
          onClick={e => { e.stopPropagation(); onExpand(expanded ? null : agent.id) }}
          style={{
            background: 'none', border: '1px solid var(--color-border)', borderRadius: 6,
            padding: '3px 8px', cursor: 'pointer', color: 'var(--color-text-muted)',
            fontFamily: "'DM Mono', monospace", fontSize: 11, flexShrink: 0,
          }}
        >
          <KeyIcon style={{ width: 12, height: 12, display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
          {saved ? `••••${last4}` : 'Add key'}
        </button>
      </div>

      {/* Expanded key input */}
      {expanded && (
        <div style={{ padding: '0 14px 14px', borderTop: '1px solid var(--color-border)' }}>
          <div style={{ paddingTop: 12 }}>
            <label style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'var(--color-text-muted)', letterSpacing: '0.05em', display: 'block', marginBottom: 6 }}>
              {agent.keyLabel.toUpperCase()}
            </label>
            <div style={{ display: 'flex', gap: 6 }}>
              <div style={{ position: 'relative', flex: 1 }}>
                <input
                  type={show ? 'text' : 'password'}
                  value={key}
                  onChange={e => setKey(e.target.value)}
                  placeholder={agent.keyPlaceholder}
                  autoFocus
                  style={{
                    width: '100%', boxSizing: 'border-box',
                    padding: '7px 32px 7px 10px',
                    fontFamily: "'DM Mono', monospace", fontSize: 12,
                    background: 'var(--color-bg)', color: 'var(--color-text)',
                    border: '1px solid var(--color-border)', borderRadius: 7,
                    outline: 'none',
                  }}
                  onKeyDown={e => { if (e.key === 'Enter') handleSave() }}
                />
                <button
                  onClick={() => setShow(s => !s)}
                  style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', padding: 0 }}
                >
                  {show
                    ? <EyeSlashIcon style={{ width: 14, height: 14 }} />
                    : <EyeIcon style={{ width: 14, height: 14 }} />}
                </button>
              </div>
              <button
                onClick={handleSave}
                disabled={!key.trim()}
                style={{
                  padding: '7px 14px', borderRadius: 7, border: 'none', cursor: key.trim() ? 'pointer' : 'not-allowed',
                  background: key.trim() ? agent.badgeColor : 'var(--color-border)',
                  color: '#fff', fontFamily: "'Urbanist', sans-serif", fontSize: 12, fontWeight: 700,
                  flexShrink: 0,
                }}
              >
                Save
              </button>
              {saved && (
                <button
                  onClick={handleClear}
                  style={{
                    padding: '7px 10px', borderRadius: 7, border: '1px solid var(--color-border)', cursor: 'pointer',
                    background: 'transparent', color: 'var(--color-text-muted)',
                    fontFamily: "'Urbanist', sans-serif", fontSize: 12, flexShrink: 0,
                  }}
                >
                  Clear
                </button>
              )}
            </div>
            <div style={{ marginTop: 6, fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'var(--color-text-muted)' }}>
              {agent.keyHelpText} —{' '}
              <a href={agent.keyHelpUrl} target="_blank" rel="noreferrer" style={{ color: '#7C3AED' }}>
                open dashboard
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function AgentPicker({ selectedAgent, onSelect, onClose }) {
  const [expanded, setExpanded] = useState(null)
  const ref = useRef(null)

  useEffect(() => {
    function onClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) onClose()
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [onClose])

  function handleSelect(agent) {
    const apiKey = getAgentKey(agent.id)
    onSelect({ ...agent, apiKey })
  }

  function handleSave(agent, apiKey) {
    if (selectedAgent?.id === agent.id || !selectedAgent) {
      onSelect({ ...agent, apiKey })
    }
  }

  return (
    <div
      ref={ref}
      style={{
        position: 'absolute', top: 'calc(100% + 8px)', right: 0, zIndex: 9999,
        width: 340, background: 'var(--color-card)',
        border: '1px solid var(--color-border)',
        borderRadius: 12, boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
        padding: 14,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <span style={{ fontFamily: "'Urbanist', sans-serif", fontWeight: 700, fontSize: 14, color: 'var(--color-text)' }}>
          Select AI Agent
        </span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', padding: 2 }}>
          <XMarkIcon style={{ width: 16, height: 16 }} />
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {AGENTS.map(agent => (
          <AgentCard
            key={agent.id}
            agent={agent}
            isSelected={selectedAgent?.id === agent.id}
            onSelect={handleSelect}
            expanded={expanded === agent.id}
            onExpand={setExpanded}
            onSave={handleSave}
          />
        ))}
      </div>

      <div style={{ marginTop: 10, padding: '8px 10px', background: 'var(--color-surface)', borderRadius: 8, fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
        Your API key is stored locally and sent directly to the provider. It is never stored on our servers.
      </div>
    </div>
  )
}
