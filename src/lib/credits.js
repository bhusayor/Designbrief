// ────────────────────────────────────────────────────────────────────
// Display-only costs. Enforcement and deduction live in /api/ai and
// migrations/0013_server_ai_credit_operations.sql. Never deduct credits
// from browser code.
// ────────────────────────────────────────────────────────────────────

export const CREDIT_COSTS = {
  // Full brief: translate + score + deep analysis (techStack +
  // features + userFlow) all in parallel. The Render backend has no
  // Vercel 60s ceiling so we bundle everything back into one click;
  // 10 = 6 (translate) + 4 (deep) at the previous unit prices.
  brief_translation: 10,
  // Kept for backward compatibility with old result-page builds that
  // still expose a manual re-run path. New translations include deep
  // analysis up-front and never hit this charge.
  deep_analysis: 4,
  kanban_generation: 8,
  backlog_generation: 8,
  ai_task_prompt: 3,
  moodboard_refresh: 3,
  red_flag_analysis: 3,
  questions_generation: 3,
  client_intake: 5,
}
