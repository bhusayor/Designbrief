import { useEffect } from 'react'

// ────────────────────────────────────────────────────────────────────
// useSpotlight — cursor-following radial gradient on every element
// matching `selector`. Writes CSS custom properties (--spotlight-x /
// -y / -opacity) so the actual rendering is a ::before pseudo defined
// in index.css. That keeps the element's own background intact and
// avoids any layout reflow during mousemove.
//
// Three things the original spec got wrong, fixed here:
// - Binding is idempotent: every element passes through a WeakSet so
//   the MutationObserver scan re-runs without re-attaching listeners.
//   (The spec's version leaked listeners exponentially on every DOM
//   change.)
// - mousemove is passive. mouseleave just zeroes the opacity var —
//   no layout writes.
// - Coexists with the proximity engine: if proximity marks the
//   element with `data-transitioning`, spotlight skips that frame.
// ────────────────────────────────────────────────────────────────────

export default function useSpotlight(selector, options = {}) {
  const {
    color = '139, 92, 246',
    size = 200,
    opacity = 0.07,
  } = options

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return

    const bound = new WeakSet()

    function bind(el) {
      if (bound.has(el)) return
      bound.add(el)

      el.style.setProperty('--spotlight-color', color)
      el.style.setProperty('--spotlight-size', `${size}px`)
      el.style.setProperty('--spotlight-opacity', '0')

      const onMove = (e) => {
        if (el.dataset.transitioning) return
        const r = el.getBoundingClientRect()
        el.style.setProperty('--spotlight-x', `${e.clientX - r.left}px`)
        el.style.setProperty('--spotlight-y', `${e.clientY - r.top}px`)
        el.style.setProperty('--spotlight-opacity', String(opacity))
      }

      const onLeave = () => {
        el.style.setProperty('--spotlight-opacity', '0')
      }

      el.addEventListener('mousemove', onMove, { passive: true })
      el.addEventListener('mouseleave', onLeave)

      el._spotlightCleanup = () => {
        el.removeEventListener('mousemove', onMove)
        el.removeEventListener('mouseleave', onLeave)
        el.style.removeProperty('--spotlight-x')
        el.style.removeProperty('--spotlight-y')
        el.style.removeProperty('--spotlight-opacity')
        el.style.removeProperty('--spotlight-color')
        el.style.removeProperty('--spotlight-size')
      }
    }

    function scan() {
      document.querySelectorAll(selector).forEach(bind)
    }

    scan()

    // Re-scan when the DOM changes — newly-rendered cards pick up
    // the listeners without us needing to know about them. WeakSet
    // makes the rescan a no-op for elements we've already bound.
    const observer = new MutationObserver(scan)
    observer.observe(document.body, { childList: true, subtree: true })

    return () => {
      observer.disconnect()
      document.querySelectorAll(selector).forEach((el) => {
        if (el._spotlightCleanup) {
          el._spotlightCleanup()
          delete el._spotlightCleanup
        }
      })
    }
  }, [selector, color, size, opacity])
}
