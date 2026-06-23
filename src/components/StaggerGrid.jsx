import { motion } from 'framer-motion'
import { STAGGER } from '../lib/motion'

// ────────────────────────────────────────────────────────────────────
// StaggerGrid + StaggerItem, a thin wrapper over Framer Motion's
// variants system. Pair them:
//
//   <StaggerGrid speed="fast">
//     {items.map(i => (
//       <StaggerItem key={i.id} variant="itemUp">
//         {i.body}
//       </StaggerItem>
//     ))}
//   </StaggerGrid>
//
// Variants live in src/lib/motion.js so the rhythm stays consistent
// app-wide. layoutId on StaggerItem opts the child into Framer Motion
// shared-element transitions (the "continuity" bullet).
// ────────────────────────────────────────────────────────────────────

export default function StaggerGrid({
  children,
  speed = 'normal',     // 'fast' | 'normal' | 'slow'
  className,
  style,
  as: Component = 'div',
}) {
  const variants =
    speed === 'fast' ? STAGGER.containerFast :
    speed === 'slow' ? STAGGER.containerSlow :
    STAGGER.container

  const MotionEl = motion[Component] || motion.div
  return (
    <MotionEl
      variants={variants}
      initial="hidden"
      animate="show"
      className={className}
      style={style}
    >
      {children}
    </MotionEl>
  )
}

export function StaggerItem({
  children,
  variant = 'itemUp',   // 'itemUp' | 'itemFade' | 'itemScale'
  className,
  style,
  layoutId,
  layout = false,
  onClick,
  ...rest
}) {
  const v = STAGGER[variant] || STAGGER.itemUp
  return (
    <motion.div
      variants={v}
      className={className}
      style={style}
      layoutId={layoutId}
      layout={layout || !!layoutId}
      onClick={onClick}
      {...rest}
    >
      {children}
    </motion.div>
  )
}
