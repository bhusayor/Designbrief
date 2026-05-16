import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useContext } from 'react'
import AppContext from '../context/AppContext'
import { loadTasksFromDB } from '../lib/taskService'
import { getAuthHeader } from '../lib/getAuthHeader'
import JSZip from 'jszip'
import {
  ArrowLeftIcon,
  CheckCircleIcon,
  ArrowDownTrayIcon,
  KeyIcon,
  EyeIcon,
  EyeSlashIcon,
  BoltIcon,
} from '@heroicons/react/24/outline'

// ── Tips that rotate during build ─────────────────────────────────────────────
const TIPS = [
  ['Component isolation', 'Each task becomes a self-contained React component you can drop anywhere in your codebase.'],
  ['Tailwind CSS', 'All styles use utility classes — no extra CSS files, works with any Tailwind project.'],
  ['Approve & iterate', 'Not happy with the output? Regenerate the current task before moving on.'],
  ['ZIP download', 'At the end you get a ZIP with every component as its own file, ready to import.'],
  ['Use the context', 'The AI reads your task title and description — the more detail you add in TeamCollab, the better the output.'],
  ['Stack agnostic', 'Components use standard React patterns — easy to adapt to Next.js, Remix, or Vite.'],
  ['Preview accuracy', 'The preview uses Babel + Tailwind CDN, so what you see is close to the real render.'],
]

// ── Build the iframe HTML to render a component ───────────────────────────────
function buildPreviewHtml(code) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <script src="https://unpkg.com/react@18/umd/react.development.js"></script>
  <script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>body{margin:0;padding:16px;font-family:'Urbanist',sans-serif;background:#fff}</style>
</head>
<body>
  <div id="root"></div>
  <script type="text/babel">
    ${code}
    const root = ReactDOM.createRoot(document.getElementById('root'));
    root.render(React.createElement(Component));
  </script>
</body>
</html>`
}

// ── Sanitise streamed code (strip markdown fences if Claude adds them) ─────────
function cleanCode(raw) {
  return raw
    .replace(/^```(?:jsx?|tsx?|javascript|typescript)?\n?/im, '')
    .replace(/```\s*$/im, '')
    .trim()
}

function toFileName(title) {
  return title
    .replace(/[^a-zA-Z0-9 ]/g, '')
    .trim()
    .split(' ')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join('') || 'Component'
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function ProjectBuilder() {
  const { activeProject, navigate } = useContext(AppContext)

  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)

  // Builder state
  const [currentIndex, setCurrentIndex] = useState(0)
  const [phase, setPhase] = useState('idle') // idle | building | done | complete
  const [streamedCode, setStreamedCode] = useState('')
  const [completedComponents, setCompletedComponents] = useState([]) // { taskTitle, code }
  const [error, setError] = useState('')

  // API key
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('db-anthropic-key') || '')
  const [showKey, setShowKey] = useState(false)
  const [keyDraft, setKeyDraft] = useState('')
  const [editingKey, setEditingKey] = useState(false)

  // Preview
  const iframeRef = useRef(null)
  const codeRef = useRef(null)

  // Tips
  const [tipIndex, setTipIndex] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTipIndex(i => (i + 1) % TIPS.length), 5000)
    return () => clearInterval(id)
  }, [])

  // Load tasks
  useEffect(() => {
    if (!activeProject?.id) { setLoading(false); return }
    loadTasksFromDB(activeProject.id).then(t => {
      // Flatten all columns, Todo first
      const order = ['To Do', 'In Progress', 'Review', 'Done']
      const sorted = [...t].sort((a, b) => order.indexOf(a.column) - order.indexOf(b.column))
      setTasks(sorted)
      setLoading(false)
    })
  }, [activeProject?.id])

  // Scroll code panel to bottom while streaming
  useEffect(() => {
    if (codeRef.current) codeRef.current.scrollTop = codeRef.current.scrollHeight
  }, [streamedCode])

  // Render preview when build for current task finishes
  useEffect(() => {
    if (phase === 'done' && iframeRef.current) {
      const cleaned = cleanCode(streamedCode)
      const html = buildPreviewHtml(cleaned)
      iframeRef.current.srcdoc = html
    }
  }, [phase, streamedCode])

  const currentTask = tasks[currentIndex]
  const isComplete = currentIndex >= tasks.length

  async function buildCurrentTask() {
    if (!apiKey.trim()) { setError('Enter your Anthropic API key first.'); return }
    if (!currentTask) return
    setError('')
    setStreamedCode('')
    setPhase('building')

    try {
      const headers = await getAuthHeader()
      if (!headers) { setError('Session expired — please refresh.'); setPhase('idle'); return }

      const res = await fetch('/api/build-component', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          userApiKey: apiKey.trim(),
          taskTitle: currentTask.title,
          taskDescription: currentTask.description || '',
          projectName: activeProject?.name || 'My Project',
          taskIndex: currentIndex,
          totalTasks: tasks.length,
        }),
      })

      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error || 'Build failed')
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop()
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const payload = JSON.parse(line.slice(6))
          if (payload.error) throw new Error(payload.error)
          if (payload.text) setStreamedCode(prev => prev + payload.text)
          if (payload.done) { setPhase('done'); return }
        }
      }
      setPhase('done')
    } catch (e) {
      setError(e.message)
      setPhase('idle')
    }
  }

  function approveAndNext() {
    const cleaned = cleanCode(streamedCode)
    setCompletedComponents(prev => [...prev, { taskTitle: currentTask.title, code: cleaned }])
    const next = currentIndex + 1
    setCurrentIndex(next)
    setStreamedCode('')
    setPhase(next >= tasks.length ? 'complete' : 'idle')
  }

  function regenerate() {
    setStreamedCode('')
    setPhase('idle')
  }

  async function downloadZip() {
    const zip = new JSZip()
    const components = completedComponents.length > 0
      ? completedComponents
      : [{ taskTitle: currentTask?.title || 'Component', code: cleanCode(streamedCode) }]

    components.forEach(({ taskTitle, code }) => {
      const name = toFileName(taskTitle)
      zip.file(`components/${name}.jsx`, code)
    })

    // index.js barrel export
    const exports = components.map(({ taskTitle }) => {
      const name = toFileName(taskTitle)
      return `export { default as ${name} } from './${name}'`
    }).join('\n')
    zip.file('components/index.js', exports)

    const blob = await zip.generateAsync({ type: 'blob' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = (activeProject?.name || 'project').replace(/\s+/g, '-').toLowerCase() + '-components.zip'
    a.click()
    URL.revokeObjectURL(url)
  }

  function saveKey() {
    const k = keyDraft.trim()
    if (k) { localStorage.setItem('db-anthropic-key', k); setApiKey(k) }
    setEditingKey(false)
    setKeyDraft('')
  }

  const hasKey = !!apiKey

  // ── Layout ────────────────────────────────────────────────────────────────
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100dvh',
      fontFamily: "'Urbanist', sans-serif", background: 'var(--color-bg)',
      overflow: 'hidden',
    }}>
      {/* Top bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '12px 20px', borderBottom: '1px solid var(--color-border)',
        background: 'var(--color-card)', flexShrink: 0,
      }}>
        <button
          onClick={() => navigate('team')}
          style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', fontSize: 13, fontWeight: 600, padding: '4px 8px', borderRadius: 8 }}
          onMouseEnter={e => e.currentTarget.style.color = 'var(--color-text)'}
          onMouseLeave={e => e.currentTarget.style.color = 'var(--color-text-muted)'}
        >
          <ArrowLeftIcon style={{ width: 15, height: 15 }} />
          Team Collab
        </button>
        <span style={{ color: 'var(--color-border)' }}>›</span>
        <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--color-text)' }}>
          Build with AI
        </span>
        {activeProject?.name && (
          <>
            <span style={{ color: 'var(--color-border)' }}>·</span>
            <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>{activeProject.name}</span>
          </>
        )}

        {/* Progress pill */}
        {tasks.length > 0 && !isComplete && (
          <span style={{
            marginLeft: 'auto', fontFamily: "'Urbanist', sans-serif", fontSize: 11, fontWeight: 700,
            background: 'rgba(124,58,237,0.08)', border: '1px solid rgba(124,58,237,0.2)',
            borderRadius: 100, padding: '3px 10px', color: '#7C3AED',
          }}>
            {currentIndex + 1} / {tasks.length}
          </span>
        )}
      </div>

      {/* Three-column body */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* ── LEFT: task list ── */}
        <div style={{
          width: 260, flexShrink: 0, borderRight: '1px solid var(--color-border)',
          background: 'var(--color-card)', display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
        }}>
          <div style={{ padding: '14px 16px 10px', borderBottom: '1px solid var(--color-border)' }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--color-text)' }}>Tasks</div>
            <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 2 }}>
              {completedComponents.length} of {tasks.length} built
            </div>
          </div>

          {loading ? (
            <div style={{ padding: 20, color: 'var(--color-text-muted)', fontSize: 13 }}>Loading tasks…</div>
          ) : tasks.length === 0 ? (
            <div style={{ padding: 20, color: 'var(--color-text-muted)', fontSize: 13 }}>
              No tasks found. Add tasks in Team Collab first.
            </div>
          ) : (
            <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
              {tasks.map((task, i) => {
                const isDone = i < currentIndex || (i === currentIndex && phase === 'complete')
                const isCurrent = i === currentIndex && !isComplete
                const isBuilding = isCurrent && phase === 'building'

                return (
                  <div
                    key={task.id}
                    style={{
                      display: 'flex', alignItems: 'flex-start', gap: 10,
                      padding: '10px 16px',
                      background: isCurrent ? 'rgba(124,58,237,0.06)' : 'transparent',
                      borderLeft: isCurrent ? '3px solid #7C3AED' : '3px solid transparent',
                      transition: 'all 0.15s',
                    }}
                  >
                    {/* Status indicator */}
                    <div style={{
                      width: 20, height: 20, borderRadius: '50%', flexShrink: 0, marginTop: 1,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: isDone ? '#7C3AED' : isCurrent ? 'transparent' : 'transparent',
                      border: isDone ? 'none' : isCurrent ? '2px solid #7C3AED' : '2px solid var(--color-border)',
                    }}>
                      {isDone && <CheckCircleIcon style={{ width: 20, height: 20, color: '#fff' }} />}
                      {isBuilding && (
                        <div style={{
                          width: 10, height: 10, borderRadius: '50%',
                          border: '2px solid #7C3AED', borderTopColor: 'transparent',
                          animation: 'spin 0.7s linear infinite',
                        }} />
                      )}
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: 12, fontWeight: 600,
                        color: isDone ? 'var(--color-text-muted)' : isCurrent ? 'var(--color-text)' : 'var(--color-text-muted)',
                        lineHeight: 1.4,
                        textDecoration: isDone ? 'line-through' : 'none',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {task.title}
                      </div>
                      <div style={{
                        fontSize: 10, color: 'var(--color-text-muted)',
                        marginTop: 2, fontFamily: "'Urbanist', sans-serif",
                      }}>
                        {task.column}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* ── CENTER: preview ── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--color-bg)' }}>
          {phase === 'complete' ? (
            // Build complete banner
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20, padding: 40 }}>
              <div style={{ fontSize: 48 }}>🎉</div>
              <div style={{ fontWeight: 800, fontSize: 24, letterSpacing: '-0.03em', color: 'var(--color-text)' }}>
                Build complete!
              </div>
              <div style={{ fontSize: 14, color: 'var(--color-text-muted)', textAlign: 'center', maxWidth: 360, lineHeight: 1.6 }}>
                {completedComponents.length} component{completedComponents.length !== 1 ? 's' : ''} generated.
                Download the ZIP to get your React files, ready to drop into your project.
              </div>
              <button
                onClick={downloadZip}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '12px 28px', borderRadius: 12,
                  background: '#7C3AED', color: '#fff',
                  border: 'none', cursor: 'pointer',
                  fontFamily: "'Urbanist', sans-serif",
                  fontSize: 15, fontWeight: 700,
                  boxShadow: '0 4px 16px rgba(124,58,237,0.35)',
                  transition: 'all 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = '#6D28D9'; e.currentTarget.style.transform = 'translateY(-1px)' }}
                onMouseLeave={e => { e.currentTarget.style.background = '#7C3AED'; e.currentTarget.style.transform = 'translateY(0)' }}
              >
                <ArrowDownTrayIcon style={{ width: 18, height: 18 }} />
                Download ZIP
              </button>

              {/* Component list */}
              <div style={{ width: '100%', maxWidth: 480, marginTop: 8 }}>
                {completedComponents.map(({ taskTitle }, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: '1px solid var(--color-border)' }}>
                    <CheckCircleIcon style={{ width: 14, height: 14, color: '#7C3AED', flexShrink: 0 }} />
                    <span style={{ fontSize: 13, color: 'var(--color-text)' }}>{toFileName(taskTitle)}.jsx</span>
                  </div>
                ))}
              </div>
            </div>
          ) : phase === 'idle' && !streamedCode ? (
            // Empty state
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 40, color: 'var(--color-text-muted)' }}>
              <div style={{ width: 56, height: 56, borderRadius: 16, background: 'rgba(124,58,237,0.08)', border: '1px solid rgba(124,58,237,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <BoltIcon style={{ width: 24, height: 24, color: '#7C3AED' }} />
              </div>
              <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--color-text)' }}>Preview will appear here</div>
              <div style={{ fontSize: 13, textAlign: 'center', maxWidth: 300, lineHeight: 1.6 }}>
                {tasks.length === 0
                  ? 'Add tasks in Team Collab, then come back to build them.'
                  : hasKey
                    ? 'Click "Build task" to generate the first component.'
                    : 'Add your API key on the right to get started.'}
              </div>
            </div>
          ) : phase === 'building' ? (
            // Streaming code view
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', gap: 8, background: 'var(--color-card)' }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#7C3AED', animation: 'pulse 1s ease-in-out infinite' }} />
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)', fontFamily: "'Urbanist', sans-serif" }}>
                  Generating {currentTask?.title}…
                </span>
              </div>
              <pre
                ref={codeRef}
                style={{
                  flex: 1, margin: 0, padding: '16px 20px',
                  fontSize: 12, lineHeight: 1.7,
                  fontFamily: "'Urbanist', sans-serif",
                  color: '#7C3AED', background: 'var(--color-bg)',
                  overflowY: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
                }}
              >
                {streamedCode}
                <span style={{ display: 'inline-block', width: 2, height: '1em', background: '#7C3AED', animation: 'blink 1s step-end infinite', verticalAlign: 'text-bottom' }} />
              </pre>
            </div>
          ) : (
            // Preview iframe (build done)
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', gap: 8, background: 'var(--color-card)' }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#16a34a' }} />
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)', fontFamily: "'Urbanist', sans-serif" }}>
                  {currentTask?.title} — preview
                </span>
              </div>
              <iframe
                ref={iframeRef}
                style={{ flex: 1, border: 'none', width: '100%' }}
                sandbox="allow-scripts"
                title="Component preview"
              />
            </div>
          )}
        </div>

        {/* ── RIGHT: controls ── */}
        <div style={{
          width: 300, flexShrink: 0, borderLeft: '1px solid var(--color-border)',
          background: 'var(--color-card)', display: 'flex', flexDirection: 'column',
          padding: '20px 16px', gap: 20, overflowY: 'auto',
        }}>

          {/* API key section */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <KeyIcon style={{ width: 14, height: 14, color: hasKey ? '#7C3AED' : 'var(--color-text-muted)' }} />
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text)', fontFamily: "'Urbanist', sans-serif", textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Anthropic API Key
              </span>
            </div>

            {!hasKey || editingKey ? (
              <div>
                {!hasKey && (
                  <div style={{ marginBottom: 8, padding: '8px 10px', background: 'rgba(220,38,38,0.06)', border: '1px solid rgba(220,38,38,0.15)', borderRadius: 8, fontSize: 11, color: '#dc2626', lineHeight: 1.5 }}>
                    Enter your Anthropic API key to start building. It's stored locally and never sent to our servers.
                  </div>
                )}
                <div style={{ display: 'flex', gap: 6 }}>
                  <div style={{ position: 'relative', flex: 1 }}>
                    <input
                      type={showKey ? 'text' : 'password'}
                      value={keyDraft}
                      onChange={e => setKeyDraft(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') saveKey() }}
                      placeholder="sk-ant-..."
                      autoFocus
                      style={{
                        width: '100%', padding: '8px 32px 8px 10px',
                        borderRadius: 8, border: '1.5px solid var(--color-border)',
                        background: 'var(--color-surface)', color: 'var(--color-text)',
                        fontFamily: "'Urbanist', sans-serif", fontSize: 11,
                        outline: 'none', boxSizing: 'border-box', transition: 'all 0.15s',
                      }}
                      onFocus={e => { e.target.style.borderColor = '#7C3AED'; e.target.style.boxShadow = '0 0 0 3px rgba(124,58,237,0.12)' }}
                      onBlur={e => { e.target.style.borderColor = 'var(--color-border)'; e.target.style.boxShadow = 'none' }}
                    />
                    <button
                      onClick={() => setShowKey(p => !p)}
                      style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', padding: 0, display: 'flex' }}
                    >
                      {showKey ? <EyeSlashIcon style={{ width: 13, height: 13 }} /> : <EyeIcon style={{ width: 13, height: 13 }} />}
                    </button>
                  </div>
                  <button
                    onClick={saveKey}
                    disabled={!keyDraft.trim()}
                    style={{ padding: '8px 12px', borderRadius: 8, background: keyDraft.trim() ? '#7C3AED' : 'var(--color-border)', color: keyDraft.trim() ? '#fff' : 'var(--color-text-muted)', border: 'none', cursor: keyDraft.trim() ? 'pointer' : 'not-allowed', fontFamily: "'Urbanist', sans-serif", fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' }}
                  >
                    Save
                  </button>
                </div>
                {editingKey && (
                  <button onClick={() => { setEditingKey(false); setKeyDraft('') }} style={{ marginTop: 6, background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: 'var(--color-text-muted)' }}>
                    Cancel
                  </button>
                )}
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: 'rgba(124,58,237,0.06)', border: '1px solid rgba(124,58,237,0.15)', borderRadius: 8 }}>
                <CheckCircleIcon style={{ width: 14, height: 14, color: '#7C3AED', flexShrink: 0 }} />
                <span style={{ flex: 1, fontFamily: "'Urbanist', sans-serif", fontSize: 11, color: 'var(--color-text)' }}>
                  ••••••{apiKey.slice(-4)}
                </span>
                <button onClick={() => { setEditingKey(true); setKeyDraft('') }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: '#7C3AED', fontWeight: 600 }}>
                  Edit
                </button>
              </div>
            )}
          </div>

          {/* Divider */}
          <div style={{ height: 1, background: 'var(--color-border)' }} />

          {/* Action buttons */}
          {!isComplete && tasks.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {phase === 'done' ? (
                <>
                  <button
                    onClick={approveAndNext}
                    style={{
                      padding: '11px 0', borderRadius: 10, border: 'none',
                      background: '#7C3AED', color: '#fff', cursor: 'pointer',
                      fontFamily: "'Urbanist', sans-serif", fontSize: 14, fontWeight: 700,
                      boxShadow: '0 2px 8px rgba(124,58,237,0.3)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = '#6D28D9'}
                    onMouseLeave={e => e.currentTarget.style.background = '#7C3AED'}
                  >
                    <CheckCircleIcon style={{ width: 16, height: 16 }} />
                    Approve & {currentIndex + 1 < tasks.length ? 'next task' : 'finish'} ✓
                  </button>
                  <button
                    onClick={regenerate}
                    style={{ padding: '9px 0', borderRadius: 10, border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)', cursor: 'pointer', fontFamily: "'Urbanist', sans-serif", fontSize: 13, fontWeight: 600 }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = '#7C3AED'; e.currentTarget.style.color = '#7C3AED' }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--color-border)'; e.currentTarget.style.color = 'var(--color-text)' }}
                  >
                    Regenerate
                  </button>
                </>
              ) : (
                <button
                  onClick={buildCurrentTask}
                  disabled={phase === 'building' || !hasKey || tasks.length === 0}
                  style={{
                    padding: '11px 0', borderRadius: 10, border: 'none',
                    background: phase === 'building' || !hasKey ? 'var(--color-border)' : '#7C3AED',
                    color: phase === 'building' || !hasKey ? 'var(--color-text-muted)' : '#fff',
                    cursor: phase === 'building' || !hasKey ? 'not-allowed' : 'pointer',
                    fontFamily: "'Urbanist', sans-serif", fontSize: 14, fontWeight: 700,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    transition: 'all 0.15s',
                    boxShadow: phase === 'building' || !hasKey ? 'none' : '0 2px 8px rgba(124,58,237,0.3)',
                  }}
                >
                  <BoltIcon style={{ width: 16, height: 16 }} />
                  {phase === 'building' ? 'Building…' : 'Build task'}
                </button>
              )}

              {error && (
                <div style={{ padding: '8px 10px', background: 'rgba(220,38,38,0.06)', border: '1px solid rgba(220,38,38,0.15)', borderRadius: 8, fontSize: 11, color: '#dc2626', lineHeight: 1.5 }}>
                  {error}
                </div>
              )}
            </div>
          )}

          {/* Download mid-build */}
          {completedComponents.length > 0 && !isComplete && (
            <button
              onClick={downloadZip}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px 0', borderRadius: 10, border: '1px solid var(--color-border)', background: 'transparent', color: 'var(--color-text-muted)', cursor: 'pointer', fontFamily: "'Urbanist', sans-serif", fontSize: 13, fontWeight: 600 }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = '#7C3AED'; e.currentTarget.style.color = '#7C3AED' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--color-border)'; e.currentTarget.style.color = 'var(--color-text-muted)' }}
            >
              <ArrowDownTrayIcon style={{ width: 14, height: 14 }} />
              Download {completedComponents.length} built so far
            </button>
          )}

          {/* Divider */}
          {phase === 'building' && <div style={{ height: 1, background: 'var(--color-border)' }} />}

          {/* Tips (visible while building) */}
          {phase === 'building' && (
            <div style={{ padding: '12px 14px', background: 'rgba(124,58,237,0.04)', border: '1px solid rgba(124,58,237,0.12)', borderRadius: 12 }}>
              <div style={{ fontSize: 10, fontWeight: 700, fontFamily: "'Urbanist', sans-serif", color: '#7C3AED', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
                💡 {TIPS[tipIndex][0]}
              </div>
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)', lineHeight: 1.6 }}>
                {TIPS[tipIndex][1]}
              </div>
            </div>
          )}

          {/* Task detail (idle/done) */}
          {(phase === 'idle' || phase === 'done') && currentTask && (
            <div style={{ padding: '12px 14px', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 12 }}>
              <div style={{ fontSize: 10, fontWeight: 700, fontFamily: "'Urbanist', sans-serif", color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
                Current task
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text)', marginBottom: 4, lineHeight: 1.4 }}>
                {currentTask.title}
              </div>
              {currentTask.description && (
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)', lineHeight: 1.6 }}>
                  {currentTask.description}
                </div>
              )}
              <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                <span style={{ fontFamily: "'Urbanist', sans-serif", fontSize: 10, padding: '2px 7px', borderRadius: 6, border: '1px solid var(--color-border)', color: 'var(--color-text-muted)', background: 'var(--color-card)' }}>
                  {currentTask.column}
                </span>
                <span style={{ fontFamily: "'Urbanist', sans-serif", fontSize: 10, padding: '2px 7px', borderRadius: 6, border: '1px solid var(--color-border)', color: 'var(--color-text-muted)', background: 'var(--color-card)' }}>
                  {currentTask.priority}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }
        @keyframes blink { 0%,100% { opacity: 1; } 50% { opacity: 0; } }
      `}</style>
    </div>
  )
}
