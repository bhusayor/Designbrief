// ────────────────────────────────────────────────────────────────────
// Plan definitions — single source of truth for free / starter / pro
// limits and feature flags. Read this from anywhere via getPlanLimits
// (preferred) or PLANS[planKey] directly.
// ────────────────────────────────────────────────────────────────────

export const PLANS = {
  free: {
    name: 'Free',
    credits: 50,
    creditsRefresh: false,
    projects: 2,
    workspaces: 1,
    teamMembers: 0,
    briefHistory: 5,
    export: 'watermarked',
    clientIntake: false,
    customTemplates: false,
    whiteLabel: false,
    docxExport: false,
    aiFeatures: ['basic_translation'],
  },
  starter: {
    name: 'Starter',
    credits: 300,
    creditsRefresh: true,
    projects: 10,
    workspaces: 1,
    teamMembers: 2,
    briefHistory: Infinity,
    export: 'clean',
    clientIntake: false,
    customTemplates: false,
    whiteLabel: false,
    docxExport: false,
    aiFeatures: [
      'basic_translation',
      'kanban_generation',
      'ai_task_prompts',
      'moodboard_direction',
    ],
  },
  pro: {
    name: 'Pro',
    credits: 1000,
    creditsRefresh: true,
    projects: Infinity,
    workspaces: 3,
    teamMembers: 10,
    briefHistory: Infinity,
    export: 'white_label',
    clientIntake: true,
    customTemplates: true,
    whiteLabel: true,
    docxExport: true,
    aiFeatures: ['all'],
  },
}

export function getUserPlan(user) {
  return user?.plan || 'free'
}

export function getPlanLimits(user) {
  return PLANS[getUserPlan(user)] || PLANS.free
}

// canDo returns a predicate that consumers can call with current usage
// numbers. Centralising the checks here means feature limits stay in
// sync across the Library, TeamCollab, History, Settings, etc.
//
//   const allowed = canDo(user, 'create_project')({ projectCount })
//
export function canDo(user, action) {
  const limits = getPlanLimits(user)
  const checks = {
    create_project: (usage = {}) => (usage.projectCount ?? 0) < limits.projects,
    create_workspace: (usage = {}) => (usage.workspaceCount ?? 0) < limits.workspaces,
    invite_member: () => limits.teamMembers > 0,
    view_history: (usage = {}) => (usage.historyIndex ?? 0) < limits.briefHistory,
    export_clean: () => limits.export !== 'watermarked',
    export_docx: () => limits.docxExport,
    use_intake: () => limits.clientIntake,
    use_custom_templates: () => limits.customTemplates,
    use_credits: (usage = {}) => (usage.credits ?? 0) > 0,
  }
  return checks[action] || (() => false)
}

// Display label for the sidebar plan pill.
export function planBadgeLabel(planKey) {
  if (planKey === 'starter') return 'Starter'
  if (planKey === 'pro') return 'Pro ✦'
  return 'Free plan'
}
