import { motion } from 'framer-motion'

// ────────────────────────────────────────────────────────────────────
// EmptyState — drop-in zero-data placeholder for any list/grid. Pick a
// type to get the right icon + default copy, or pass title/message/
// action to override. The icon container floats gently with a 3s
// up-down loop so the surface doesn't feel dead.
//
//   <EmptyState type="tasks" onAction={openCreate} />
// ────────────────────────────────────────────────────────────────────

const ICONS = {
  projects: (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
      <rect x="6" y="8" width="36" height="32" rx="6" stroke="currentColor" strokeWidth="2" strokeDasharray="4 3" />
      <path d="M16 20h16M16 26h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="36" cy="36" r="8" fill="var(--color-bg)" stroke="currentColor" strokeWidth="2" />
      <path d="M33 36h6M36 33v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  ),
  tasks: (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
      <rect x="8" y="8" width="32" height="8" rx="4" stroke="currentColor" strokeWidth="2" strokeDasharray="4 3" />
      <rect x="8" y="22" width="32" height="8" rx="4" stroke="currentColor" strokeWidth="2" strokeDasharray="4 3" />
      <rect x="8" y="36" width="20" height="8" rx="4" stroke="currentColor" strokeWidth="2" strokeDasharray="4 3" />
    </svg>
  ),
  history: (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
      <circle cx="24" cy="24" r="16" stroke="currentColor" strokeWidth="2" />
      <path d="M24 14v10l6 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  team: (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
      <circle cx="18" cy="18" r="7" stroke="currentColor" strokeWidth="2" />
      <path d="M6 40c0-7 5-12 12-12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="34" cy="16" r="5" stroke="currentColor" strokeWidth="2" strokeDasharray="3 2" />
      <path d="M30 40c0-5 3-8.5 8-9.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeDasharray="3 2" />
    </svg>
  ),
  brief: (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
      <path d="M12 6h24a2 2 0 0 1 2 2v32a2 2 0 0 1-2 2H12a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z" stroke="currentColor" strokeWidth="2" />
      <path d="M17 17h14M17 23h14M17 29h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeDasharray="3 2" />
      <circle cx="36" cy="36" r="8" fill="var(--color-bg)" stroke="currentColor" strokeWidth="2" />
      <path d="M33 36h6M36 33v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  ),
  notifications: (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
      <path d="M24 8c-7 0-12 5-12 11v8l-3 4h30l-3-4V19c0-6-5-11-12-11z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M21 37a3 3 0 0 0 6 0" stroke="currentColor" strokeWidth="2" />
    </svg>
  ),
}

const DEFAULTS = {
  projects: {
    title: 'No projects yet',
    message: 'Create your first project and translate a brief to get started.',
    action: 'Create Project',
  },
  tasks: {
    title: 'No tasks here',
    message: 'Add tasks manually or translate a brief to auto-generate your board.',
    action: 'Add Task',
  },
  history: {
    title: 'No briefs translated yet',
    message: 'Your translated briefs will appear here. Start by pasting a client brief.',
    action: 'Translate a Brief',
  },
  team: {
    title: 'No team members yet',
    message: 'Invite collaborators to work on this project together.',
    action: 'Invite Member',
  },
  brief: {
    title: 'No brief yet',
    message: 'Paste a client brief to unlock AI-powered insights and auto-generate your kanban board.',
    action: 'Translate Brief',
  },
  notifications: {
    title: 'All caught up',
    message: 'No new notifications. Check back when your team is active.',
    action: null,
  },
}

export default function EmptyState({
  type = 'projects',
  title,
  message,
  action,
  onAction,
  icon: CustomIcon,
}) {
  const config = DEFAULTS[type] || DEFAULTS.projects
  const displayTitle = title || config.title
  const displayMessage = message || config.message
  const displayAction = action ?? config.action
  const Icon = ICONS[type]

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '60px 24px',
        textAlign: 'center',
        gap: 16,
      }}
    >
      <motion.div
        animate={{ y: [0, -6, 0] }}
        transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
        style={{
          width: 80,
          height: 80,
          borderRadius: 20,
          background: 'rgba(139,92,246,0.08)',
          border: '1px solid rgba(139,92,246,0.15)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--color-accent)',
          marginBottom: 8,
        }}
      >
        {CustomIcon || Icon}
      </motion.div>

      <h3
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: 20,
          fontWeight: 700,
          color: 'var(--color-text)',
          margin: 0,
          letterSpacing: '-0.02em',
        }}
      >
        {displayTitle}
      </h3>

      <p
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: 14,
          color: 'var(--color-text-muted)',
          margin: 0,
          maxWidth: 320,
          lineHeight: 1.6,
        }}
      >
        {displayMessage}
      </p>

      {displayAction && onAction && (
        <motion.button
          onClick={onAction}
          whileTap={{ scale: 0.97 }}
          className="proximity-btn"
          style={{
            marginTop: 8,
            padding: '10px 20px',
            background: 'var(--color-accent)',
            color: 'white',
            border: 'none',
            borderRadius: 10,
            fontFamily: 'var(--font-sans)',
            fontWeight: 600,
            fontSize: 14,
            cursor: 'pointer',
          }}
        >
          {displayAction}
        </motion.button>
      )}
    </motion.div>
  )
}
