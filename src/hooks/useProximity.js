import { useEffect } from 'react'
import { initProximityEffect } from '../lib/proximity'

// ────────────────────────────────────────────────────────────────────
// useProximity — thin React hook wrapper around initProximityEffect.
//
// Pass a CSS selector for the elements you want magnetised. Re-runs
// when any of the deps change (typically the list/state that controls
// how many elements are on screen).
//
//   useProximity('.project-card', { distance: 140, maxScale: 1.05 }, [projects.length])
//
// The hook handles the prefers-reduced-motion and touch-device bail
// out for you. On those devices it returns immediately and no
// listeners are installed.
// ────────────────────────────────────────────────────────────────────
export default function useProximity(selector, options = {}, deps = []) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!selector) return undefined
    // Defer to the next animation frame so React has finished painting
    // the elements we're about to query.
    let cleanup
    const raf = requestAnimationFrame(() => {
      cleanup = initProximityEffect(selector, options)
    })
    return () => {
      cancelAnimationFrame(raf)
      if (typeof cleanup === 'function') cleanup()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}
