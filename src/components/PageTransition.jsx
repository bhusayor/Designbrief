import { AnimatePresence, motion } from 'framer-motion'
import { PAGE } from '../lib/motion'

// ────────────────────────────────────────────────────────────────────
// PageTransition — wrap the section content so changing the `pageKey`
// (typically AppContext.activeSection) crossfades the old view out
// and scales the new view in with a brief blur. The AppShell already
// remounts on workspace change; this layer handles the in-shell
// section navigation (Dashboard → Library → TeamCollab → Settings …).
//
// We use mode="wait" so the previous view fully exits before the
// next one enters — avoids overlap glitches when the page heights
// are different.
// ────────────────────────────────────────────────────────────────────

export default function PageTransition({ pageKey, children }) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={pageKey || 'page'}
        variants={PAGE.crossfade}
        initial="initial"
        animate="animate"
        exit="exit"
        style={{ width: '100%', height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column' }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  )
}
