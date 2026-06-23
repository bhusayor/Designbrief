import { useCallback, useEffect, useRef, useState } from 'react'

// ────────────────────────────────────────────────────────────────────
// useScramble, typewriter-style text reveal that scrambles random
// characters into the target string left-to-right.
//
// Designed for AI surfaces ("Building hero section…", "Translating
// brief…") where a smooth crossfade feels static and a hard cut feels
// brittle. The scramble animates only when `targetText` changes (or
// when scramble() is called manually).
//
// Usage:
//   const { displayText } = useScramble("Building hero…", { duration: 600 })
//   return <span>{displayText}</span>
//
// Respects prefers-reduced-motion (returns target immediately).
// ────────────────────────────────────────────────────────────────────

const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'

function reduceMotion() {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export default function useScramble(targetText, options = {}) {
  const {
    duration = 600,
    delay = 0,
    trigger = true,
  } = options

  const [displayText, setDisplayText] = useState(targetText)
  const frameRef = useRef(null)
  const startRef = useRef(null)
  const target = String(targetText ?? '')

  const scramble = useCallback(() => {
    if (reduceMotion()) {
      setDisplayText(target)
      return
    }
    if (frameRef.current) cancelAnimationFrame(frameRef.current)

    const begin = () => {
      startRef.current = performance.now()

      const animate = (now) => {
        const elapsed = now - startRef.current
        const progress = Math.min(elapsed / Math.max(1, duration), 1)
        const revealed = Math.floor(progress * target.length)

        let out = ''
        for (let i = 0; i < target.length; i++) {
          const ch = target[i]
          if (ch === ' ' || ch === '\n') { out += ch; continue }
          if (i < revealed) { out += ch; continue }
          out += CHARS[Math.floor(Math.random() * CHARS.length)]
        }
        setDisplayText(out)

        if (progress < 1) {
          frameRef.current = requestAnimationFrame(animate)
        } else {
          setDisplayText(target)
          frameRef.current = null
        }
      }

      frameRef.current = requestAnimationFrame(animate)
    }

    if (delay > 0) {
      const t = setTimeout(begin, delay)
      return () => clearTimeout(t)
    }
    begin()
  }, [target, duration, delay])

  useEffect(() => {
    if (!trigger) return
    scramble()
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current)
    }
  }, [target, trigger, scramble])

  return { displayText, scramble }
}
