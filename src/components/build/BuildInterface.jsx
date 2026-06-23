import { useState, useEffect, useRef, useContext } from 'react'
import JSZip from 'jszip'
import {
  XMarkIcon, CheckCircleIcon, ArrowDownTrayIcon, BoltIcon,
} from '@heroicons/react/24/outline'
import { buildWithProxy } from '../../lib/buildEngine'
import { supabase } from '../../lib/supabase'
import AppContext from '../../context/AppContext'

const TIPS = [
  ['Component isolation', 'Each task becomes a self-contained React component you can drop anywhere in your codebase.'],
  ['Tailwind CSS', 'All styles use utility classes, no extra CSS files, works with any Tailwind project.'],
  ['Approve & iterate', 'Not happy with the output? Regenerate the current task before moving on.'],
  ['ZIP download', 'At the end you get a ZIP with every component as its own file, ready to import.'],
  ['Use the context', 'The AI reads your task title and description. The more detail you add, the better the output.'],
  ['Stack agnostic', 'Components use standard React patterns, easy to adapt to Next.js, Remix, or Vite.'],
  ['Preview accuracy', 'The preview uses Babel + Tailwind CDN, so what you see is close to the real render.'],
]

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

function buildPrompt(task, projectName, taskIndex, totalTasks) {
  return `Project: ${projectName || 'My Project'}
Task ${taskIndex + 1} of ${totalTasks}: ${task.title}
${task.description ? `Description: ${task.description}` : ''}

Generate a complete, polished React component for this task. The component should look production-ready with realistic content.`
}

export default function BuildInterface({ tasks: rawTasks, projectName, onClose }) {
  const { setCreditsUsed, showAIError } = useContext(AppContext)
  const order = ['To Do', 'In Progress', 'Review', 'Done']
  const tasks = [...(rawTasks || [])].sort((a, b) => order.indexOf(a.column) - order.indexOf(b.column))

  const [currentIndex, setCurrentIndex] = useState(0)
  const [phase, setPhase] = useState('idle') // idle | building | done | complete
  const [streamedCode, setStreamedCode] = useState('')
  const [completedComponents, setCompletedComponents] = useState([])
  const [error, setError] = useState('')
  const [tipIndex, setTipIndex] = useState(0)

  const iframeRef = useRef(null)
  const codeRef = useRef(null)

  useEffect(() => {
    const id = setInterval(() => setTipIndex(i => (i + 1) % TIPS.length), 5000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    if (codeRef.current) codeRef.current.scrollTop = codeRef.current.scrollHeight
  }, [streamedCode])

  useEffect(() => {
    if (phase === 'done' && iframeRef.current) {
      iframeRef.current.srcdoc = buildPreviewHtml(cleanCode(streamedCode))
    }
  }, [phase, streamedCode])

  // Close on Escape
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const currentTask = tasks[currentIndex]
  const isComplete = currentIndex >= tasks.length

  async function buildCurrentTask() {
    if (!currentTask) return
    setError('')
    setStreamedCode('')
    setPhase('building')

    try {
      const { data: { session } } = await supabase.auth.getSession().catch(() => ({ data: {} }))
      const authHeader = session?.access_token ? 'Bearer ' + session.access_token : undefined

      const prompt = buildPrompt(currentTask, projectName, currentIndex, tasks.length)
      await buildWithProxy(prompt, text => {
        setStreamedCode(prev => prev + text)
      }, authHeader)

      setPhase('done')
      setCreditsUsed(prev => prev + 1)
    } catch (e) {
      console.error('[BuildInterface] section failed:', e)
      setPhase('idle')
      showAIError?.(e, () => startBuild())
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
      zip.file(`components/${toFileName(taskTitle)}.jsx`, code)
    })

    const exports = components
      .map(({ taskTitle }) => `export { default as ${toFileName(taskTitle)} } from './${toFileName(taskTitle)}'`)
      .join('\n')
    zip.file('components/index.js', exports)

    const blob = await zip.generateAsync({ type: 'blob' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = (projectName || 'project').replace(/\s+/g, '-').toLowerCase() + '-components.zip'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 10000,
      display: 'flex', flexDirection: 'column',
      background: 'var(--color-bg)',
      fontFamily: "'Urbanist', sans-serif",
    }}>
      {/* Top bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '12px 20px', borderBottom: '1px solid var(--color-border)',
        background: 'var(--color-card)', flexShrink: 0,
      }}>
        <button
          onClick={onClose}
          style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', fontSize: 13, fontWeight: 600, padding: '4px 8px', borderRadius: 8 }}
          onMouseEnter={e => e.currentTarget.style.color = 'var(--color-text)'}
          onMouseLeave={e => e.currentTarget.style.color = 'var(--color-text-muted)'}
        >
          <XMarkIcon style={{ width: 15, height: 15 }} />
          Close
        </button>
        <span style={{ color: 'var(--color-border)' }}>›</span>
        <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--color-text)' }}>Build with AI</span>
        {projectName && (
          <>
            <span style={{ color: 'var(--color-border)' }}>·</span>
            <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>{projectName}</span>
          </>
        )}

        {/* Progress pill */}
        {tasks.length > 0 && !isComplete && (
          <span style={{
            fontFamily: "'Urbanist', sans-serif", fontSize: 11, fontWeight: 700,
            background: 'rgba(124,58,237,0.08)', border: '1px solid rgba(124,58,237,0.2)',
            borderRadius: 100, padding: '3px 10px', color: '#7C3AED',
            marginLeft: 'auto',
          }}>
            {currentIndex + 1} / {tasks.length}
          </span>
        )}
      </div>

      {/* Three-column body */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* LEFT: task list */}
        <div style={{
          width: 260, flexShrink: 0, borderRight: '1px solid var(--color-border)',
          background: 'var(--color-card)', display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
          <div style={{ padding: '14px 16px 10px', borderBottom: '1px solid var(--color-border)' }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--color-text)' }}>Tasks</div>
            <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 2 }}>
              {completedComponents.length} of {tasks.length} built
            </div>
          </div>

          {tasks.length === 0 ? (
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
                  <div key={task.id} style={{
                    display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 16px',
                    background: isCurrent ? 'rgba(124,58,237,0.06)' : 'transparent',
                    borderLeft: isCurrent ? '3px solid #7C3AED' : '3px solid transparent',
                  }}>
                    <div style={{
                      width: 20, height: 20, borderRadius: '50%', flexShrink: 0, marginTop: 1,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: isDone ? '#7C3AED' : 'transparent',
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
                        textDecoration: isDone ? 'line-through' : 'none',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>{task.title}</div>
                      <div style={{ fontSize: 10, color: 'var(--color-text-muted)', marginTop: 2, fontFamily: "'Urbanist', sans-serif" }}>
                        {task.column}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* CENTER: preview */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--color-bg)' }}>
          {phase === 'complete' ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20, padding: 40 }}>
              <div style={{ fontSize: 48 }}>🎉</div>
              <div style={{ fontWeight: 800, fontSize: 24, letterSpacing: '-0.03em', color: 'var(--color-text)' }}>
                Build complete!
              </div>
              <div style={{ fontSize: 14, color: 'var(--color-text-muted)', textAlign: 'center', maxWidth: 360, lineHeight: 1.6 }}>
                {completedComponents.length} component{completedComponents.length !== 1 ? 's' : ''} generated.
                Download the ZIP to get your React files.
              </div>
              <button
                onClick={downloadZip}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '12px 28px', borderRadius: 12,
                  background: '#7C3AED', color: '#fff', border: 'none', cursor: 'pointer',
                  fontFamily: "'Urbanist', sans-serif", fontSize: 15, fontWeight: 700,
                  boxShadow: '0 4px 16px rgba(124,58,237,0.35)',
                }}
                onMouseEnter={e => e.currentTarget.style.background = '#6D28D9'}
                onMouseLeave={e => e.currentTarget.style.background = '#7C3AED'}
              >
                <ArrowDownTrayIcon style={{ width: 18, height: 18 }} />
                Download ZIP
              </button>
              <div style={{ width: '100%', maxWidth: 480, marginTop: 8 }}>
                {completedComponents.map(({ taskTitle }, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: '1px solid var(--color-border)' }}>
                    <CheckCircleIcon style={{ width: 14, height: 14, color: '#7C3AED', flexShrink: 0 }} />
                    <span style={{ fontSize: 13, color: 'var(--color-text)' }}>{toFileName(taskTitle)}.jsx</span>
                  </div>
                ))}
              </div>
            </div>
          ) : phase === 'idle' && !currentTask ? null : (
            <>
              {/* Current task header */}
              {currentTask && (
                <div style={{ padding: '14px 20px 10px', borderBottom: '1px solid var(--color-border)', flexShrink: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--color-text)' }}>{currentTask.title}</div>
                  {currentTask.description && (
                    <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 4, lineHeight: 1.5 }}>
                      {currentTask.description}
                    </div>
                  )}
                </div>
              )}

              {/* Preview iframe */}
              <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
                {phase === 'idle' ? (
                  <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 40 }}>
                    <div style={{
                      width: 52, height: 52, borderRadius: 16,
                      background: 'rgba(124,58,237,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <BoltIcon style={{ width: 24, height: 24, color: '#7C3AED' }} />
                    </div>
                    <div style={{ fontWeight: 700, fontSize: 18, color: 'var(--color-text)' }}>Ready to build</div>
                    <div style={{ fontSize: 13, color: 'var(--color-text-muted)', textAlign: 'center', maxWidth: 320, lineHeight: 1.6 }}>
                      {`Click "Build this task" to generate a React component for "${currentTask?.title}".`}
                    </div>
                    {error && (
                      <div style={{ padding: '8px 14px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 8, color: '#ef4444', fontSize: 13, maxWidth: 400, textAlign: 'center' }}>
                        {error}
                      </div>
                    )}
                  </div>
                ) : (
                  <iframe
                    ref={iframeRef}
                    title="preview"
                    sandbox="allow-scripts"
                    style={{ width: '100%', height: '100%', border: 'none', background: '#fff' }}
                  />
                )}
              </div>
            </>
          )}
        </div>

        {/* RIGHT: code + controls */}
        <div style={{
          width: 340, flexShrink: 0, borderLeft: '1px solid var(--color-border)',
          background: 'var(--color-card)', display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
          {/* Code panel */}
          <div style={{ flex: 1, overflow: 'hidden', position: 'relative', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '12px 16px 8px', borderBottom: '1px solid var(--color-border)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontFamily: "'Urbanist', sans-serif", fontSize: 11, color: 'var(--color-text-muted)', letterSpacing: '0.05em' }}>
                {phase === 'building' ? 'GENERATING…' : 'CODE'}
              </span>
              {phase === 'building' && (
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#7C3AED', animation: 'pulse 1s infinite' }} />
              )}
            </div>
            <pre
              ref={codeRef}
              style={{
                flex: 1, overflowY: 'auto', margin: 0,
                padding: '14px 16px',
                fontFamily: "'Urbanist', sans-serif", fontSize: 11, lineHeight: 1.7,
                color: 'var(--color-text)', background: 'transparent',
                whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              }}
            >
              {streamedCode || (phase === 'idle' ? '// Code will appear here…' : '')}
            </pre>
          </div>

          {/* Tip box */}
          {(phase === 'idle' || phase === 'building') && (
            <div style={{
              padding: '12px 16px', borderTop: '1px solid var(--color-border)',
              background: 'rgba(124,58,237,0.04)', flexShrink: 0,
            }}>
              <div style={{ fontFamily: "'Urbanist', sans-serif", fontSize: 9, letterSpacing: '0.08em', color: '#7C3AED', marginBottom: 4 }}>
                TIP, {TIPS[tipIndex][0].toUpperCase()}
              </div>
              <div style={{ fontSize: 11, color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
                {TIPS[tipIndex][1]}
              </div>
            </div>
          )}

          {/* Action bar */}
          <div style={{ padding: '12px 16px', borderTop: '1px solid var(--color-border)', display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0 }}>
            {phase === 'idle' && !isComplete && (
              <button
                onClick={buildCurrentTask}
                style={{
                  width: '100%', padding: '9px 0', borderRadius: 9, border: 'none', cursor: 'pointer',
                  background: '#7C3AED', color: '#fff',
                  fontFamily: "'Urbanist', sans-serif", fontSize: 13, fontWeight: 700,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                }}
                onMouseEnter={e => { e.currentTarget.style.background = '#6D28D9' }}
                onMouseLeave={e => { e.currentTarget.style.background = '#7C3AED' }}
              >
                <BoltIcon style={{ width: 14, height: 14 }} />
                Build this task
              </button>
            )}

            {phase === 'building' && (
              <button
                disabled
                style={{
                  width: '100%', padding: '9px 0', borderRadius: 9, border: 'none',
                  background: 'rgba(124,58,237,0.5)', color: '#fff',
                  fontFamily: "'Urbanist', sans-serif", fontSize: 13, fontWeight: 700,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'not-allowed',
                }}
              >
                <div style={{ width: 12, height: 12, borderRadius: '50%', border: '2px solid #fff', borderTopColor: 'transparent', animation: 'spin 0.7s linear infinite' }} />
                Building…
              </button>
            )}

            {phase === 'done' && (
              <>
                <button
                  onClick={approveAndNext}
                  style={{
                    width: '100%', padding: '9px 0', borderRadius: 9, border: 'none', cursor: 'pointer',
                    background: '#7C3AED', color: '#fff',
                    fontFamily: "'Urbanist', sans-serif", fontSize: 13, fontWeight: 700,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = '#6D28D9'}
                  onMouseLeave={e => e.currentTarget.style.background = '#7C3AED'}
                >
                  <CheckCircleIcon style={{ width: 14, height: 14 }} />
                  {currentIndex + 1 >= tasks.length ? 'Approve & Finish' : 'Approve & Next'}
                </button>
                <button
                  onClick={regenerate}
                  style={{
                    width: '100%', padding: '8px 0', borderRadius: 9, cursor: 'pointer',
                    border: '1px solid var(--color-border)', background: 'transparent',
                    color: 'var(--color-text-muted)',
                    fontFamily: "'Urbanist', sans-serif", fontSize: 13, fontWeight: 600,
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = '#7C3AED'; e.currentTarget.style.color = '#7C3AED' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--color-border)'; e.currentTarget.style.color = 'var(--color-text-muted)' }}
                >
                  Regenerate
                </button>
                <button
                  onClick={downloadZip}
                  style={{
                    width: '100%', padding: '8px 0', borderRadius: 9, cursor: 'pointer',
                    border: '1px solid var(--color-border)', background: 'transparent',
                    color: 'var(--color-text-muted)',
                    fontFamily: "'Urbanist', sans-serif", fontSize: 13, fontWeight: 600,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = '#7C3AED'; e.currentTarget.style.color = '#7C3AED' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--color-border)'; e.currentTarget.style.color = 'var(--color-text-muted)' }}
                >
                  <ArrowDownTrayIcon style={{ width: 13, height: 13 }} />
                  Download so far
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
