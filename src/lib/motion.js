// ────────────────────────────────────────────────────────────────────
// motion.js — single source of truth for every animation value in
// DesignBrief AI. SPRINGS, EASE, DUR, STAGGER variants, PAGE / MODAL
// variants, and PROXIMITY tunings live here. Never hard-code these
// values in components.
// ────────────────────────────────────────────────────────────────────

// Spring presets matched by use-case, not by stiffness numbers.
export const SPRINGS = {
  // Buttons, quick confirmations.
  snappy:  { type: 'spring', stiffness: 500, damping: 30, mass: 0.8 },
  // Modals, cards appearing.
  bouncy:  { type: 'spring', stiffness: 350, damping: 22, mass: 1 },
  // Page transitions, large elements.
  gentle:  { type: 'spring', stiffness: 200, damping: 28, mass: 1.2 },
  // Celebratory moments (approve task, publish success).
  wobbly:  { type: 'spring', stiffness: 280, damping: 15, mass: 1 },
}

export const EASE = {
  expo:      [0.16, 1, 0.3, 1],
  back:      [0.34, 1.56, 0.64, 1],
  smooth:    [0.4, 0, 0.2, 1],
  quick:     [0.25, 0.46, 0.45, 0.94],
  cinematic: [0.77, 0, 0.175, 1],
}

export const DUR = {
  instant:   0.15,
  fast:      0.25,
  normal:    0.35,
  slow:      0.5,
  cinematic: 0.8,
}

// Stagger variants — pair `container*` on the parent with `item*` on
// each child. Variants drive opacity + transform via Framer Motion.
export const STAGGER = {
  container: {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.08, delayChildren: 0.1 },
    },
  },
  containerFast: {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.05, delayChildren: 0.05 },
    },
  },
  containerSlow: {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.12, delayChildren: 0.15 },
    },
  },
  itemUp: {
    hidden: { opacity: 0, y: 24, scale: 0.97 },
    show: {
      opacity: 1, y: 0, scale: 1,
      transition: { duration: 0.4, ease: EASE.expo },
    },
  },
  itemFade: {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { duration: 0.3 } },
  },
  itemScale: {
    hidden: { opacity: 0, scale: 0.88 },
    show: {
      opacity: 1, scale: 1,
      transition: SPRINGS.bouncy,
    },
  },
}

// Page transition variants — apply to whichever wrapper sits under
// AnimatePresence and changes its `key` on route change.
export const PAGE = {
  crossfade: {
    initial: { opacity: 0, scale: 1.02, filter: 'blur(4px)' },
    animate: {
      opacity: 1, scale: 1, filter: 'blur(0px)',
      transition: { duration: DUR.normal, ease: EASE.expo },
    },
    exit: {
      opacity: 0, scale: 0.98, filter: 'blur(4px)',
      transition: { duration: DUR.fast, ease: [0.4, 0, 1, 1] },
    },
  },
  slideRight: {
    initial: { opacity: 0, x: 40 },
    animate: {
      opacity: 1, x: 0,
      transition: { duration: DUR.normal, ease: EASE.expo },
    },
    exit: {
      opacity: 0, x: -20,
      transition: { duration: DUR.fast },
    },
  },
  slideUp: {
    initial: { opacity: 0, y: 20 },
    animate: {
      opacity: 1, y: 0,
      transition: { duration: DUR.normal, ease: EASE.expo },
    },
    exit: {
      opacity: 0, y: -10,
      transition: { duration: DUR.fast },
    },
  },
}

// Modal variants — pair `overlay` on the backdrop with `content` on
// the dialog box, or `bottomSheet` on mobile.
export const MODAL = {
  overlay: {
    initial: { opacity: 0, backdropFilter: 'blur(0px)' },
    animate: {
      opacity: 1, backdropFilter: 'blur(8px)',
      transition: { duration: DUR.fast },
    },
    exit: {
      opacity: 0, backdropFilter: 'blur(0px)',
      transition: { duration: 0.2 },
    },
  },
  content: {
    initial: { opacity: 0, scale: 0.92, y: 20, filter: 'blur(4px)' },
    animate: {
      opacity: 1, scale: 1, y: 0, filter: 'blur(0px)',
      transition: SPRINGS.bouncy,
    },
    exit: {
      opacity: 0, scale: 0.95, y: 10, filter: 'blur(2px)',
      transition: { duration: 0.18 },
    },
  },
  bottomSheet: {
    initial: { y: '100%' },
    animate: {
      y: 0,
      transition: { type: 'spring', stiffness: 300, damping: 30 },
    },
    exit: { y: '100%', transition: { duration: 0.25 } },
  },
}

// Proximity tunings keyed by surface kind.
export const PROXIMITY = {
  // sidebar intentionally absent — see src/components/layout/Sidebar.jsx
  // for why nav items are NOT magnetised.
  cards:   { distance: 140, maxScale: 1.04, maxLift: -8, speed: 0.3,  glow: true,  tilt: true  },
  kanban:  { distance: 90,  maxScale: 1.03, maxLift: -3, speed: 0.2,  glow: false, tilt: false },
  buttons: { distance: 80,  maxScale: 1.06, maxLift: -3, speed: 0.22, glow: true,  tilt: false },
  avatars: { distance: 70,  maxScale: 1.2,  maxLift: -6, speed: 0.2,  glow: true,  tilt: false },
  plans:   { distance: 150, maxScale: 1.04, maxLift: -8, speed: 0.32, glow: true,  tilt: true  },
  queue:   { distance: 90,  maxScale: 1.03, maxLift: -2, speed: 0.2,  glow: false, tilt: false },
}

// LiquidBackground default palette — kept here so the dashboard /
// hero surfaces stay consistent until a brief overrides them.
export const LIQUID_DEFAULTS = {
  color1: '#8B5CF6',
  color2: '#6366F1',
  opacity: 0.10,
}
