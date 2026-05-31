import { useEffect, useRef, useState } from 'react'

// ────────────────────────────────────────────────────────────────────
// MagneticCursor — custom cursor for desktop pointer devices.
//
// Two layers:
//   - Outer ring: lerps toward the pointer (eased follow) and changes
//     size + style based on what the pointer is over (hover, text,
//     drag, view, or default).
//   - Inner dot: pinned exactly to the pointer for precision.
//
// Detection runs on every move via document.elementFromPoint and
// inspects ancestor classes / [data-cursor*] attributes. Add
// data-cursor="open" / "view" / "delete" / etc to any element to
// customise the label shown inside the ring.
//
// Bails on:
//   - touch / coarse pointer devices
//   - prefers-reduced-motion
//   - <body data-cursor-off> (escape hatch)
//
// The system cursor is hidden via CSS class added to <html> while the
// component is mounted, and removed on cleanup.
// ────────────────────────────────────────────────────────────────────

const SIZE_BY_STATE = {
  default: 32,
  hover:   56,
  text:    4,
  drag:    48,
  view:    64,
}

function supportsCustomCursor() {
  if (typeof window === 'undefined') return false
  if (!window.matchMedia) return false
  return window.matchMedia('(hover: hover) and (pointer: fine)').matches
}

function reduceMotion() {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export default function MagneticCursor() {
  const [cursorState, setCursorState] = useState('default')
  const [label, setLabel] = useState('')
  const [visible, setVisible] = useState(false)
  const ringRef = useRef(null)
  const dotRef = useRef(null)
  const posRef = useRef({ x: -100, y: -100 })
  const targetRef = useRef({ x: -100, y: -100 })

  useEffect(() => {
    if (!supportsCustomCursor() || reduceMotion()) return
    if (document.body?.dataset?.cursorOff != null) return

    // Hide the system cursor.
    document.documentElement.classList.add('custom-cursor-active')

    let raf = null
    const ease = 0.16

    const tick = () => {
      posRef.current.x += (targetRef.current.x - posRef.current.x) * ease
      posRef.current.y += (targetRef.current.y - posRef.current.y) * ease
      if (ringRef.current) {
        ringRef.current.style.transform =
          `translate3d(${posRef.current.x}px, ${posRef.current.y}px, 0) translate(-50%, -50%)`
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)

    const onMove = (e) => {
      targetRef.current.x = e.clientX
      targetRef.current.y = e.clientY
      if (dotRef.current) {
        dotRef.current.style.transform =
          `translate3d(${e.clientX}px, ${e.clientY}px, 0) translate(-50%, -50%)`
      }
      if (!visible) setVisible(true)

      const el = document.elementFromPoint(e.clientX, e.clientY)
      if (!el) return

      // Drag wins first (kanban + tabs).
      if (el.closest('.kanban-task-card')) {
        setCursorState('drag')
        setLabel(el.closest('[data-cursor]')?.dataset?.cursor || 'drag')
        return
      }
      // Text input → caret-like state.
      if (el.closest('input, textarea, [contenteditable="true"]')) {
        setCursorState('text')
        setLabel('')
        return
      }
      // Hover state for any interactive surface.
      if (el.closest('a, button, .proximity-btn, .project-card, .plan-card, .template-card, .build-queue-item, [data-cursor]')) {
        setCursorState('hover')
        const dl = el.closest('[data-cursor]')?.dataset?.cursor
        setLabel(dl || '')
        return
      }
      // Generic "view" cue (e.g. iframe previews).
      if (el.closest('[data-cursor-view]')) {
        setCursorState('view')
        setLabel('view')
        return
      }
      setCursorState('default')
      setLabel('')
    }

    const onLeave = () => setVisible(false)
    const onEnter = () => setVisible(true)

    document.addEventListener('mousemove', onMove, { passive: true })
    document.addEventListener('mouseleave', onLeave)
    document.addEventListener('mouseenter', onEnter)

    return () => {
      cancelAnimationFrame(raf)
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseleave', onLeave)
      document.removeEventListener('mouseenter', onEnter)
      document.documentElement.classList.remove('custom-cursor-active')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!supportsCustomCursor() || reduceMotion()) return null

  const size = SIZE_BY_STATE[cursorState] || 32
  const isHover = cursorState === 'hover'
  const isText  = cursorState === 'text'

  return (
    <>
      <div
        ref={ringRef}
        aria-hidden
        style={{
          position: 'fixed',
          top: 0, left: 0,
          width: size, height: size,
          borderRadius: isText ? 2 : '50%',
          border: isHover
            ? '1.5px solid rgba(139,92,246,0.85)'
            : '1.5px solid rgba(180,180,180,0.55)',
          background: isHover
            ? 'rgba(139,92,246,0.10)'
            : isText
              ? 'rgba(255,255,255,0.8)'
              : 'transparent',
          backdropFilter: isHover ? 'blur(4px)' : 'none',
          transition:
            'width 0.22s cubic-bezier(0.34,1.56,0.64,1), ' +
            'height 0.22s cubic-bezier(0.34,1.56,0.64,1), ' +
            'border-radius 0.18s ease, ' +
            'border-color 0.18s ease, ' +
            'background 0.18s ease',
          pointerEvents: 'none',
          zIndex: 99999,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          opacity: visible ? 1 : 0,
        }}
      >
        {label && (
          <span style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10, fontWeight: 800,
            letterSpacing: '0.08em', textTransform: 'uppercase',
            color: '#fff', whiteSpace: 'nowrap',
            mixBlendMode: 'difference',
          }}>{label}</span>
        )}
      </div>
      <div
        ref={dotRef}
        aria-hidden
        style={{
          position: 'fixed',
          top: 0, left: 0,
          width: 4, height: 4,
          borderRadius: '50%',
          background: isHover ? '#8B5CF6' : 'rgba(0,0,0,0.8)',
          transition: 'background 0.18s ease',
          pointerEvents: 'none',
          zIndex: 100000,
          opacity: isText ? 0 : (visible ? 1 : 0),
        }}
      />
    </>
  )
}
