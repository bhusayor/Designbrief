import { useEffect, useRef, useState } from 'react'
import { useInView } from 'framer-motion'

// ────────────────────────────────────────────────────────────────────
// AnimatedNumber — count-up to a target value once the element scrolls
// into view, using an easeOutExpo curve. requestAnimationFrame driven
// so it's smooth and stops cleanly on unmount.
//
//   <AnimatedNumber value={credits} duration={800} suffix=" / 300" />
// ────────────────────────────────────────────────────────────────────

function easeOutExpo(t) {
  return t === 1 ? 1 : 1 - Math.pow(2, -10 * t)
}

export default function AnimatedNumber({
  value,
  duration = 1200,
  prefix = '',
  suffix = '',
  decimals = 0,
  style,
  className,
}) {
  const [display, setDisplay] = useState(0)
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true })
  const frameRef = useRef(null)

  useEffect(() => {
    if (!isInView) return

    const start = performance.now()
    const endValue = parseFloat(value) || 0

    const tick = (now) => {
      const elapsed = now - start
      const progress = Math.min(elapsed / duration, 1)
      const eased = easeOutExpo(progress)
      const current = endValue * eased

      setDisplay(parseFloat(current.toFixed(decimals)))

      if (progress < 1) {
        frameRef.current = requestAnimationFrame(tick)
      } else {
        setDisplay(endValue)
      }
    }

    frameRef.current = requestAnimationFrame(tick)
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current)
    }
  }, [value, isInView, duration, decimals])

  const formatted =
    decimals > 0
      ? display.toFixed(decimals)
      : Math.floor(display).toLocaleString()

  return (
    <span ref={ref} className={className} style={style}>
      {prefix}{formatted}{suffix}
    </span>
  )
}
