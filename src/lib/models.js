// ────────────────────────────────────────────────────────────────────
// DesignBrief AI, OpenAI Model Strategy
//
// Right model for the right task. Never use one model for everything.
//
// Sol   = complex reasoning, strategic analysis, structured output,
//         backlogs, and the managed Codex builder workflow.
// Terra = fast interactive writing, intake enrichment, chat, and
//         focused edits.
//
// This module is the SINGLE source of truth for model ids. The server
// also imports it (via the same relative path from api/) so a model
// rotation only touches this file.
// ────────────────────────────────────────────────────────────────────

export const MODELS = {
  SOL:   'gpt-6.1-sol',
  TERRA: 'gpt-6.1-terra',
}

// Task → model. Add new entries here when a new AI surface ships.
// Server validates the model coming in from the client against the
// values here, so an unknown taskType falls back to SOL (never an
// arbitrary string from the wire).
export const MODEL_FOR = {
  // Structured generation, JSON-output flows.
  brief_translation:    MODELS.SOL,
  kanban_generation:    MODELS.SOL,
  backlog_generation:   MODELS.SOL,
  ai_task_prompt:       MODELS.SOL,
  moodboard_refresh:    MODELS.SOL,
  red_flag_analysis:    MODELS.SOL,
  questions_generation: MODELS.SOL,
  competitors_search:   MODELS.SOL,
  inspirations_search:  MODELS.SOL,

  // Highest-quality code generation.
  website_builder:      MODELS.SOL,
  section_rebuild:      MODELS.SOL,
  component_builder:    MODELS.SOL,

  // Short interactive turns.
  enhance_description:  MODELS.TERRA,
  intake_processing:    MODELS.TERRA,
  chat_refinement:      MODELS.TERRA,
  inline_edit:          MODELS.TERRA,
  brief_chat:           MODELS.TERRA,
}

// These tasks run through the managed Codex harness (Agents API), not
// the direct Responses API used by the rest of the application.
export const AGENT_TASKS = new Set([
  'website_builder',
  'section_rebuild',
  'component_builder',
])

// Whitelist used by the server to reject arbitrary model strings.
// Kept derived from MODELS so the two can never drift.
export const ALLOWED_MODELS = Object.values(MODELS)

export const DEFAULT_MODEL = MODELS.SOL

// Helper used by both client and server. Falls back gracefully so an
// unknown task never blocks the call, just runs on the cheaper model.
export function pickModel(taskType, requestedModel) {
  if (requestedModel && ALLOWED_MODELS.includes(requestedModel)) return requestedModel
  if (taskType && MODEL_FOR[taskType]) return MODEL_FOR[taskType]
  return DEFAULT_MODEL
}

export function reasoningEffortFor(taskType) {
  if (AGENT_TASKS.has(taskType)) return 'medium'
  return pickModel(taskType) === MODELS.TERRA ? 'low' : 'medium'
}
