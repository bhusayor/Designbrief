// ────────────────────────────────────────────────────────────────────
// DesignBrief AI, Model Strategy
//
// Right model for the right task. Never use one model for everything.
//
// Sonnet = smart + fast + cost-effective baseline for structured
//          generation (briefs, kanban, task prompts, moodboards).
// Opus   = highest-quality code output for the AI website builder.
//          Used only where the cost is justified by user-visible
//          craft.
// Haiku  = fastest + cheapest for short interactive turns, chat
//          refinement, inline edits, quick rewrites.
//
// This module is the SINGLE source of truth for model ids. The server
// also imports it (via the same relative path from api/) so a model
// rotation only touches this file.
// ────────────────────────────────────────────────────────────────────

export const MODELS = {
  SONNET: 'claude-sonnet-4-6',
  OPUS:   'claude-opus-4-8',
  HAIKU:  'claude-haiku-4-5-20251001',
}

// Task → model. Add new entries here when a new AI surface ships.
// Server validates the model coming in from the client against the
// values here, so an unknown taskType falls back to SONNET (never an
// arbitrary string from the wire).
export const MODEL_FOR = {
  // Structured generation, JSON-output flows.
  brief_translation:    MODELS.SONNET,
  kanban_generation:    MODELS.SONNET,
  ai_task_prompt:       MODELS.SONNET,
  moodboard_refresh:    MODELS.SONNET,
  red_flag_analysis:    MODELS.SONNET,
  questions_generation: MODELS.SONNET,
  competitors_search:   MODELS.SONNET,
  inspirations_search:  MODELS.SONNET,
  enhance_description:  MODELS.SONNET,
  intake_processing:    MODELS.SONNET,

  // Highest-quality code generation.
  website_builder:      MODELS.OPUS,
  section_rebuild:      MODELS.OPUS,
  component_builder:    MODELS.OPUS,

  // Short interactive turns.
  chat_refinement:      MODELS.HAIKU,
  inline_edit:          MODELS.HAIKU,
  brief_chat:           MODELS.HAIKU,
}

// Whitelist used by the server to reject arbitrary model strings.
// Kept derived from MODELS so the two can never drift.
export const ALLOWED_MODELS = Object.values(MODELS)

export const DEFAULT_MODEL = MODELS.SONNET

// Helper used by both client and server. Falls back gracefully so an
// unknown task never blocks the call, just runs on the cheaper model.
export function pickModel(taskType, requestedModel) {
  if (requestedModel && ALLOWED_MODELS.includes(requestedModel)) return requestedModel
  if (taskType && MODEL_FOR[taskType]) return MODEL_FOR[taskType]
  return DEFAULT_MODEL
}
