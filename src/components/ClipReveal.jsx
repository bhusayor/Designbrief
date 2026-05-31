import { motion } from 'framer-motion'
import { EASE } from '../lib/motion'

// ────────────────────────────────────────────────────────────────────
// ClipReveal — scroll-triggered clip-path wipe. Wrap any block of
// content and pick the direction:
//
//   left   → wipe in from the left   (great for hero copy)
//   right  → wipe in from the right
//   up     → wipe up from the bottom (great for brief sections)
//   down   → wipe down from the top
//   circle → expand from the centre  (cinematic reveal)
//
// Animates once per element, on first scroll into view. Honours
// prefers-reduced-motion (Framer Motion auto-disables the variant
// transition).
// ────────────────────────────────────────────────────────────────────

const VARIANTS = {
  left: {
    hidden: { clipPath: 'inset(0 100% 0 0)' },
    show:   { clipPath: 'inset(0 0% 0 0)' },
  },
  right: {
    hidden: { clipPath: 'inset(0 0 0 100%)' },
    show:   { clipPath: 'inset(0 0 0 0%)' },
  },
  up: {
    hidden: { clipPath: 'inset(100% 0 0 0)' },
    show:   { clipPath: 'inset(0% 0 0 0)' },
  },
  down: {
    hidden: { clipPath: 'inset(0 0 100% 0)' },
    show:   { clipPath: 'inset(0 0 0% 0)' },
  },
  circle: {
    hidden: { clipPath: 'circle(0% at 50% 50%)' },
    show:   { clipPath: 'circle(150% at 50% 50%)' },
  },
}

export default function ClipReveal({
  children,
  direction = 'up',
  delay = 0,
  duration = 0.7,
  once = true,
  className,
  style,
}) {
  const variants = VARIANTS[direction] || VARIANTS.up
  return (
    <motion.div
      variants={variants}
      initial="hidden"
      whileInView="show"
      viewport={{ once, amount: 0.2 }}
      transition={{ duration, delay, ease: EASE.cinematic }}
      className={className}
      style={style}
    >
      {children}
    </motion.div>
  )
}
