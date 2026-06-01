import { motion } from 'framer-motion'
import {
  ProjectsIllustration,
  TasksIllustration,
  BriefIllustration,
  HistoryIllustration,
  TeamIllustration,
  NotificationsIllustration,
  BuilderIllustration,
  SearchIllustration,
  UpgradeIllustration,
  SuccessIllustration,
} from './illustrations'

// ────────────────────────────────────────────────────────────────────
// EmptyState — drop-in zero-data placeholder for any list/grid. Pick a
// type to get the right animated illustration + default copy, or pass
// title/message/action to override. The illustration container floats
// gently with a 3s up-down loop on top of each SVG's own internal
// animations.
//
//   <EmptyState type="tasks" onAction={openCreate} />
// ────────────────────────────────────────────────────────────────────

const ILLUSTRATIONS = {
  projects:      <ProjectsIllustration />,
  tasks:         <TasksIllustration />,
  history:       <HistoryIllustration />,
  team:          <TeamIllustration />,
  brief:         <BriefIllustration />,
  notifications: <NotificationsIllustration />,
  builder:       <BuilderIllustration />,
  search:        <SearchIllustration />,
  upgrade:       <UpgradeIllustration />,
  success:       <SuccessIllustration />,
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
  builder: {
    title: 'Ready to build',
    message: 'Start the AI Build to generate your website section by section from your kanban tasks.',
    action: 'Start AI Build',
  },
  search: {
    title: 'Nothing found',
    message: 'Try different keywords or check your spelling.',
    action: null,
  },
  upgrade: {
    title: 'Unlock Pro',
    message: 'More credits, more projects, unlimited workspaces — designed for serious creative work.',
    action: 'Upgrade',
  },
  success: {
    title: 'All done',
    message: 'Everything is in place. Nice work.',
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
  const Illustration = ILLUSTRATIONS[type]

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
      {/* Illustration container — transparent so the animated SVG
          breathes. The outer float-up loop runs on top of each SVG's
          own internal keyframes. */}
      <motion.div
        animate={{ y: [0, -6, 0] }}
        transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
        style={{
          width: 140,
          height: 140,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 8,
        }}
      >
        {CustomIcon || Illustration}
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
