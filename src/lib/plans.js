// ────────────────────────────────────────────────────────────────────
// Plan definitions, single source of truth for free / starter / pro
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
    price: 12,
    credits: 300,
    creditsRefresh: true,
    creditsResetDay: 1,
    projects: 10,
    workspaces: 3,
    teamMembers: 2,
    briefHistory: Infinity,
    export: 'clean',
    shareableLink: true,
    clientIntake: false,
    customTemplates: false,
    whiteLabel: false,
    docxExport: false,
    aiFeatures: [
      'brief_translation',
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
    workspaces: Infinity,
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

// ────────────────────────────────────────────────────────────────────
// Credit tiers, let users pick how many credits/month they want on
// each paid plan. The first entry is the plan's default (matches the
// PLANS.credits value above) so the existing flow stays a no-op for
// users who don't open the dropdown.
// ────────────────────────────────────────────────────────────────────
export const CREDIT_TIERS = {
  starter: [
    { credits:  300, monthly: 12 },
    { credits:  600, monthly: 24 },
    { credits: 1200, monthly: 48 },
  ],
  pro: [
    { credits: 1000, monthly: 29 },
    { credits: 2000, monthly: 58 },
    { credits: 4000, monthly: 116 },
  ],
}

// Picks the tier object for a (plan, credits) pair. Falls back to the
// first (default) tier when credits is missing or unknown so callers
// never have to special-case the legacy single-price path.
export function pickTier(planKey, credits) {
  const tiers = CREDIT_TIERS[planKey]
  if (!Array.isArray(tiers) || tiers.length === 0) return null
  const n = Number(credits)
  if (!Number.isFinite(n)) return tiers[0]
  return tiers.find(t => t.credits === n) || tiers[0]
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

// Convenience: limit getters used in gate checks.
export function projectLimit(planKey) {
  const p = PLANS[planKey] || PLANS.free
  return p.projects
}
export function teamMemberLimit(planKey) {
  const p = PLANS[planKey] || PLANS.free
  return p.teamMembers
}
export function workspaceLimit(planKey) {
  const p = PLANS[planKey] || PLANS.free
  return p.workspaces
}
export function creditCap(planKey) {
  const p = PLANS[planKey] || PLANS.free
  return p.credits
}

// Days until the credit balance refreshes. credits_reset_at is the
// timestamp of the most recent refresh; the next refresh fires 30 days
// later. Returns null for the Free plan (no refresh).
export function daysUntilCreditReset(planKey, creditsResetAt) {
  if (!creditsResetAt) return null
  const p = PLANS[planKey]
  if (!p?.creditsRefresh) return null
  const last = new Date(creditsResetAt).getTime()
  if (Number.isNaN(last)) return null
  const next = last + 30 * 24 * 60 * 60 * 1000
  return Math.max(0, Math.ceil((next - Date.now()) / (24 * 60 * 60 * 1000)))
}
