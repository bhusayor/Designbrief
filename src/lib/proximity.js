// ────────────────────────────────────────────────────────────────────
// proximity.js — macOS Dock-style magnetic interaction.
//
// Elements within `distance` px of the pointer scale and lift in
// proportion to how close the cursor is. Optional 3D tilt + glow.
//
// Performance:
//   - bounding rects are cached and only recomputed on scroll / resize
//     and a periodic timer (catches layout shifts the resize observer
//     doesn't fire for)
//   - pointer events flow through a single requestAnimationFrame so we
//     never write style more than once per paint
//   - elements farther than `distance` from the pointer are skipped
//     entirely (and reset once when leaving range)
//   - bails out completely on touch / coarse pointer devices and when
//     prefers-reduced-motion is set
//
// Lifecycle:
//   const cleanup = initProximityEffect('.project-card', { ... })
//   // …
//   cleanup() // remove listeners, reset styles
//
// A MutationObserver watches body subtree so newly-rendered React
// nodes pick up the base styles automatically.
// ────────────────────────────────────────────────────────────────────

const DEFAULTS = {
  distance: 120,
  maxScale: 1.08,
  maxLift: -5,
  speed: 0.3,
  glow: true,
  glowColor: '139, 92, 246',
  tilt: true,
  perspective: 600,
}

function supportsHoverPointer() {
  if (typeof window === 'undefined') return false
  if (!window.matchMedia) return true
  return window.matchMedia('(hover: hover) and (pointer: fine)').matches
}

function prefersReducedMotion() {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function initProximityEffect(selector, options = {}) {
  if (typeof document === 'undefined') return () => {}
  if (!supportsHoverPointer() || prefersReducedMotion()) return () => {}

  const opts = { ...DEFAULTS, ...options }
  const distance = Math.max(20, Number(opts.distance) || DEFAULTS.distance)
  const distance2 = distance * distance

  let lastPointerX = -9999
  let lastPointerY = -9999
  let rafId = null
  let rects = []           // [{ el, cx, cy }] cached centers
  let inRange = new WeakSet() // elements currently inside the proximity radius

  function applyBase(el) {
    if (el.dataset.proximityApplied) return
    el.dataset.proximityApplied = '1'
    const prev = el.style.cssText
    el.dataset.proximityPrevStyle = prev
    el.style.transition = `transform ${opts.speed}s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow ${opts.speed}s ease`
    el.style.willChange = 'transform'
    el.style.transformStyle = 'preserve-3d'
    el.style.backfaceVisibility = 'hidden'
  }

  function resetElement(el) {
    el.style.transform = ''
    el.style.boxShadow = ''
  }

  function getElements() {
    return document.querySelectorAll(selector)
  }

  function refreshRects() {
    const els = getElements()
    rects = []
    for (const el of els) {
      applyBase(el)
      const r = el.getBoundingClientRect()
      // Skip elements that aren't currently visible — keeps the
      // pointermove loop short.
      if (r.width === 0 || r.height === 0) continue
      rects.push({
        el,
        cx: r.left + r.width / 2,
        cy: r.top + r.height / 2,
      })
    }
  }

  function step() {
    rafId = null
    if (!rects.length) return

    const px = lastPointerX
    const py = lastPointerY

    for (let i = 0; i < rects.length; i++) {
      const { el, cx, cy } = rects[i]
      const dx = px - cx
      const dy = py - cy
      const d2 = dx * dx + dy * dy

      if (d2 > distance2) {
        // Out of range — only write style if we were just in range.
        if (inRange.has(el)) {
          inRange.delete(el)
          resetElement(el)
        }
        continue
      }

      const dist = Math.sqrt(d2)
      const p = 1 - dist / distance // 0..1 proximity

      const scale = 1 + p * (opts.maxScale - 1)
      const liftY = p * opts.maxLift
      const tiltX = opts.tilt ? p * (dy / distance) * -4 : 0
      const tiltY = opts.tilt ? p * (dx / distance) * 4 : 0

      el.style.transform =
        `perspective(${opts.perspective}px) ` +
        `scale(${scale.toFixed(3)}) ` +
        `translateY(${liftY.toFixed(2)}px) ` +
        `rotateX(${tiltX.toFixed(2)}deg) ` +
        `rotateY(${tiltY.toFixed(2)}deg)`

      if (opts.glow) {
        if (p > 0.2) {
          const blur = Math.round(30 * p)
          const offset = Math.round(8 * p)
          const alpha = (0.22 * p).toFixed(2)
          el.style.boxShadow = `0 ${offset}px ${blur}px rgba(${opts.glowColor}, ${alpha})`
        } else if (el.style.boxShadow) {
          el.style.boxShadow = ''
        }
      }

      inRange.add(el)
    }
  }

  function schedule() {
    if (rafId == null) rafId = requestAnimationFrame(step)
  }

  function onPointerMove(e) {
    lastPointerX = e.clientX
    lastPointerY = e.clientY
    schedule()
  }

  function onPointerLeave() {
    lastPointerX = -9999
    lastPointerY = -9999
    // Reset every currently-elevated element.
    rects.forEach(({ el }) => {
      if (inRange.has(el)) {
        inRange.delete(el)
        resetElement(el)
      }
    })
  }

  function onScrollOrResize() {
    refreshRects()
    schedule()
  }

  // Periodic rect refresh — covers React state updates that change
  // layout without firing scroll/resize (e.g. a card animating in).
  const periodicRefresh = setInterval(refreshRects, 600)

  refreshRects()

  document.addEventListener('pointermove', onPointerMove, { passive: true })
  document.addEventListener('pointerleave', onPointerLeave)
  window.addEventListener('scroll', onScrollOrResize, { passive: true, capture: true })
  window.addEventListener('resize', onScrollOrResize, { passive: true })

  // Watch the DOM so newly-mounted elements pick up base styles.
  const observer = new MutationObserver(() => {
    refreshRects()
  })
  observer.observe(document.body, { childList: true, subtree: true })

  return function cleanup() {
    clearInterval(periodicRefresh)
    if (rafId != null) cancelAnimationFrame(rafId)
    document.removeEventListener('pointermove', onPointerMove)
    document.removeEventListener('pointerleave', onPointerLeave)
    window.removeEventListener('scroll', onScrollOrResize, { capture: true })
    window.removeEventListener('resize', onScrollOrResize)
    observer.disconnect()
    // Reset every element we touched and restore prior inline styles.
    getElements().forEach(el => {
      if (!el.dataset.proximityApplied) return
      resetElement(el)
      const prev = el.dataset.proximityPrevStyle || ''
      el.style.cssText = prev
      delete el.dataset.proximityApplied
      delete el.dataset.proximityPrevStyle
    })
  }
}
