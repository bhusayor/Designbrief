// ────────────────────────────────────────────────────────────────────
// briefV2Translator.js — produces the 21-item brief framework.
//
// One translateBriefV2(briefText, { onSection }) call spawns 5
// parallel callClaude calls, one per section. Each call returns its
// 4-7 items at once with the JSON shapes defined in
// briefV2Schema.js. As each section resolves, the onSection callback
// fires so the UI can paint the section's cards progressively. Total
// wall time is bounded by the slowest section call (~15-25s) since
// they run in parallel.
//
// Strict JSON rules baked into the system prompt:
//   - Never use em (—) or en (–) dashes anywhere. Use plain hyphens
//     or nothing.
//   - Never include the literal words "Hero", "Features",
//     "Testimonials", "How It Works", "FAQ", "CTA" as section names
//     when describing structure. (This rule belongs to the AI
//     builder but echoing it here means the brief itself never
//     suggests default page sections.)
//   - All output is JSON only; no markdown, no preamble.
// ────────────────────────────────────────────────────────────────────

import { callClaude } from './claudeApi.js'
import {
  BRIEF_V2_SECTIONS,
  BRIEF_V2_SCHEMA_VERSION,
  scrubDashes,
} from './briefV2Schema.js'

const PUNCTUATION_BAN = `
PUNCTUATION RULES (hard constraint):
- NEVER use em dashes (—) or en dashes (–). Anywhere. Use a comma, a
  semicolon, two short sentences, or a plain hyphen.
- Do not use ellipses (…).
- Do not start any field with "In a world where" or "Imagine".
`.trim()

const BASE_SYSTEM = `You are an expert product design strategist. You translate raw client briefs into a structured 21-item framework that designers use to align on intent, direction, and scope before any pixels move. You write with precision, you do not invent facts the brief doesn't support, and you call out gaps explicitly.

${PUNCTUATION_BAN}

Respond ONLY with valid JSON. No markdown, no preamble, no code fences.`

// ── Section 1: Understand the problem first ────────────────────────
const SECTION_PROMPTS = {
  understand: {
    system: BASE_SYSTEM,
    user: (briefText) => `Translate this brief into the first 7 framework items.

CRITICAL: Every item must be answered from this brief. If the brief is too thin for an item, write the best-interpretation reading and append " (interpreted)" to the start of that field's content.

Return JSON exactly in this shape:
{
  "projectTitle": "<concise project name pulled from or implied by the brief>",
  "items": {
    "core_problem_clarity": "<2-4 sentences. What the client is actually trying to solve, not just what they described. Strip surface-level requests to expose the real design challenge>",
    "project_intent":        "<2-3 sentences. What this project is meant to accomplish. The why behind the work, not a restatement of the brief>",
    "business_context":      "<2-3 sentences. The commercial or organisational reason this exists now. What is driving the urgency or pressure>",
    "deliverables":          ["<one named page, screen, flow, or touchpoint per array entry. Be specific: 'Onboarding screen 1: welcome', not 'onboarding'. 4-12 entries>"],
    "target_audience":       "<3-5 sentences. Who this is being designed for: behaviours, expectations, goals, frustrations. End with one sentence starting 'Not for:' identifying who this is explicitly NOT for>",
    "user_journey": [
      {
        "step": 1,
        "title": "<3-5 word touchpoint name, e.g. 'First app open' or 'Pricing decision'>",
        "action": "<what the user does at this step. 1 sentence>",
        "emotion": "<single dominant emotion at this step, e.g. 'curious', 'overwhelmed', 'reassured'>"
      }
    ],
    "success_definition": "<2-3 sentences. What a successful outcome looks like in concrete terms. A metric, behaviour change, feeling, or business result specific enough to design toward>"
  }
}

User journey: 4-7 steps in chronological order, covering first encounter through to the success state.

Brief:
${briefText}`,
  },

  // ── Section 2: Interrogate the brief ─────────────────────────────
  interrogate: {
    system: BASE_SYSTEM,
    user: (briefText) => `Read this brief and produce items 8-11 of the framework.

Return JSON exactly in this shape:
{
  "items": {
    "wants_vs_needs": {
      "rows": [
        { "left": "<what the client asked for, in their words>", "right": "<what they actually need, in your words>" }
      ]
    },
    "assumptions_log": {
      "items": [
        { "text": "<the assumption baked into the brief>", "status": "Confirmed | Unconfirmed | Needs Clarification" }
      ]
    },
    "red_flags": {
      "items": [
        { "text": "<the contradiction, vague instruction, missing info, or conflicting signal>", "severity": "High | Medium | Low" }
      ]
    },
    "questions": [
      "<numbered prioritised clarifying question. Only include questions that genuinely block design progress. Most important first>"
    ]
  }
}

Counts:
- wants_vs_needs.rows: minimum 3, maximum 6.
- assumptions_log.items: 3-8. Mix the three statuses.
- red_flags.items: 2-6. Use severity honestly; not every brief has High flags.
- questions: 3-7, ordered by priority.

Brief:
${briefText}`,
  },

  // ── Section 3: Define the direction ──────────────────────────────
  direction: {
    system: BASE_SYSTEM,
    user: (briefText) => `Translate the strategic direction in this brief into items 12-17.

No specific font names. No hex codes. Describe direction in plain language with intent per role.

Return JSON exactly in this shape:
{
  "items": {
    "brand_personality": [
      "<trait>: <one-line explanation of what this trait means for design decisions>"
    ],
    "tone_mood": "<2-3 sentences on the emotional register. What it should FEEL like, and one explicit sentence starting 'Never feel like:' calling out the wrong register>",
    "emotional_direction": [
      { "step": 1, "stage": "<journey stage name, mirror the user_journey step titles from section 1>", "emotion": "<what the user should feel here>" }
    ],
    "color_direction": {
      "primary":    "<hue family + emotional intent for the primary brand colour>",
      "secondary":  "<hue family + intent for secondary>",
      "accent":     "<hue family + intent for accent>",
      "background": "<background behaviour: warm / cool / neutral, light / dark, intent>",
      "surface":    "<surface behaviour for cards, panels: subtle elevation hint>",
      "avoid":      "<colours that must never appear, with reason>"
    },
    "typography_direction": {
      "display": "<display type personality, weight behaviour, character>",
      "body":    "<body type feel, line height intent, reading rhythm>",
      "label":   "<UI label style, size behaviour, hierarchy rules>",
      "avoid":   "<what typographic choices would contradict the brand personality>"
    },
    "moodboard_direction": "<3-4 sentences on aesthetic territories to explore. Cover UI style, visual language, imagery treatment, and layout feel. Include explicit 'Avoid:' clause naming visual directions to stay away from>"
  }
}

brand_personality: exactly 3-5 traits.
emotional_direction: one entry per journey step. Mirror the step titles you'd expect from section 1.

Brief:
${briefText}`,
  },

  // ── Section 4: Situate in the landscape ──────────────────────────
  landscape: {
    system: BASE_SYSTEM,
    user: (briefText) => `Produce items 18-19: situate this brief in its competitive landscape.

Return JSON exactly in this shape:
{
  "items": {
    "reference_audit": "<3-5 sentences. Analysis of any references the client provided or implied. Extract what they reveal about taste, expectations, and blind spots. If no references appear in the brief, the field must start with: 'No references provided. ' followed by what that absence itself reveals>",
    "competitor_analysis": [
      {
        "name": "<competitor name>",
        "positioning": "<how they present strategically. 1 sentence>",
        "layout": "<their dominant layout pattern, plain language, e.g. 'split hero with feature grid below' or 'full-bleed hero with stacked benefit blocks'>",
        "differentiation": "<the specific opportunity to diverge from them>"
      }
    ]
  }
}

competitor_analysis: minimum 3 competitors if any are detectable from the brief's industry / audience signals. If genuinely no competitors are inferable, return a single entry with name "Inference unavailable" and positioning/layout explaining the gap.

Brief:
${briefText}`,
  },

  // ── Section 5: Lock the boundaries ───────────────────────────────
  boundaries: {
    system: BASE_SYSTEM,
    user: (briefText) => `Produce items 20-21. Use the brief's named deliverables and constraints; do not invent pages that weren't implied.

Return JSON exactly in this shape:
{
  "items": {
    "scope_constraints": [
      "<each boundary on its own array entry. Mix timeline signals, technical limits, brand rules, platform requirements, and stakeholder constraints. Be concrete: 'Launch before Q3 board review' not 'tight deadline'>"
    ],
    "content_inventory": [
      {
        "page": "<the page name, matching one of the deliverables>",
        "content": "<what copy / words this page needs>",
        "assets":  "<what media / imagery / illustration this page needs>",
        "status":  "Available | Needs Creation | Unknown"
      }
    ]
  }
}

scope_constraints: 4-8 boundaries. Each on its own line.
content_inventory: one entry per deliverable from section 1's deliverables list. If the brief did not specify what content exists, status is "Unknown".

Brief:
${briefText}`,
  },
}

// ────────────────────────────────────────────────────────────────────
// translateBriefV2 — runs all 5 section calls in parallel.
// onSection(sectionId, items, partialResult) fires as each call
// resolves so the UI can render cards progressively.
// Returns the full v2 result object with schemaVersion stamped.
// ────────────────────────────────────────────────────────────────────
export async function translateBriefV2(briefText, { onSection } = {}) {
  const result = {
    schemaVersion: BRIEF_V2_SCHEMA_VERSION,
    projectTitle: 'Untitled brief',
    sections: BRIEF_V2_SECTIONS.map(s => ({
      id: s.id,
      label: s.label,
      // Items start out empty; replaced as the section's call returns.
      items: s.items.map(it => ({ ...it, content: null })),
    })),
  }

  // Each section call returns a Promise of its parsed section data.
  // We await Promise.all but also fire onSection() the moment each
  // individual promise resolves (not waiting for the slowest one).
  const sectionPromises = BRIEF_V2_SECTIONS.map(async (sectionDef) => {
    const sectionId = sectionDef.id
    const prompt = SECTION_PROMPTS[sectionId]
    try {
      const { text } = await callClaude({
        taskType: 'brief_translation',
        system: prompt.system,
        userMessage: prompt.user(briefText),
        maxTokens: 3500,
      })
      const parsed = safeJsonParse(text)
      const scrubbed = scrubDashes(parsed) || {}

      // Title only comes from the 'understand' section.
      if (sectionId === 'understand' && scrubbed.projectTitle) {
        result.projectTitle = scrubbed.projectTitle
      }

      const itemMap = scrubbed.items || {}
      const sectionResult = result.sections.find(s => s.id === sectionId)
      if (sectionResult) {
        for (const item of sectionResult.items) {
          if (itemMap[item.key] != null) {
            item.content = itemMap[item.key]
          }
        }
        try { onSection?.(sectionId, sectionResult.items, result) } catch {}
      }
      return { sectionId, ok: true }
    } catch (e) {
      console.warn('[translateBriefV2] section failed', sectionId, e?.message)
      // Leave items with content: null so the UI shows them as
      // failed-to-load rather than the whole brief blowing up.
      try { onSection?.(sectionId, [], result, e) } catch {}
      return { sectionId, ok: false, error: e?.message }
    }
  })

  await Promise.all(sectionPromises)
  return result
}

// Resilient JSON parsing: AI sometimes wraps in code fences despite
// being told not to. Strip and parse; on hard failure return {}.
function safeJsonParse(text) {
  if (!text) return {}
  let s = String(text).trim()
  if (s.startsWith('```')) {
    s = s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim()
  }
  try { return JSON.parse(s) } catch {}
  // Last-resort: extract the first balanced { ... } block
  const first = s.indexOf('{')
  const last = s.lastIndexOf('}')
  if (first >= 0 && last > first) {
    try { return JSON.parse(s.slice(first, last + 1)) } catch {}
  }
  return {}
}

// Detection helper used by routing code to decide which renderer to
// mount: V2 layout if schemaVersion === 'v2' AND a sections array is
// present, else legacy.
export function isV2Result(r) {
  return r?.schemaVersion === BRIEF_V2_SCHEMA_VERSION && Array.isArray(r?.sections)
}
