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

BREVITY RULES (hard constraint):
- Designers SKIM, they do not read. Every field must earn its length.
- Default to 1 short sentence per field. Use a second sentence only when the first cannot stand alone.
- No throat-clearing ("It is clear that…", "This brief suggests…"). Lead with the answer.
- No defining terms the designer already knows.
- No repeating context from the brief back to the designer.

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
    "core_problem_clarity": "<1-2 sentences MAX. The real design challenge underneath the surface request. Lead with the answer>",
    "project_intent":        "<1-2 sentences. What this project is meant to accomplish. The why, in plain words>",
    "business_context":      "<1-2 sentences. Why this exists now. What's driving the urgency>",
    "deliverables":          ["<one named page, screen, flow, or touchpoint per entry. Be specific: 'Onboarding step 1: welcome'. 4-12 entries>"],
    "target_audience":       "<2-3 short sentences. Who this is for: behaviours, goals, frustrations. End with one sentence starting 'Not for:'>",
    "user_journey": [
      {
        "step": 1,
        "title": "<3-5 word touchpoint name, e.g. 'First app open' or 'Pricing decision'>",
        "action": "<what the user does at this step. 1 sentence>",
        "emotion": "<single dominant emotion at this step, e.g. 'curious', 'overwhelmed', 'reassured'>"
      }
    ],
    "success_definition": "<1-2 sentences. A concrete metric, behaviour change, or business result specific enough to design toward>"
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

COLOR: propose an actual palette with names + hex codes that match the brand personality. The "swatches" array is the brand palette. The "light" and "dark" maps are full surface tokens for a live preview in each theme.

TYPOGRAPHY: name actual fonts (prefer Google Fonts so they render in-browser). Specify weights, letter-spacing, and a full type scale for desktop + mobile.

Return JSON exactly in this shape:
{
  "items": {
    "brand_personality": [
      "<trait>: <one-line explanation of what this trait means for design decisions>"
    ],
    "tone_mood": "<1 short sentence on what it should FEEL like, plus one sentence starting 'Never feel like:' calling out the wrong register>",
    "emotional_direction": [
      { "step": 1, "stage": "<journey stage name, mirror the user_journey step titles from section 1>", "emotion": "<what the user should feel here>" }
    ],
    "color_direction": {
      "swatches": [
        { "role": "Primary",    "name": "<descriptive colour name, e.g. Indigo Violet>", "hex": "#RRGGBB", "intent": "<one short line on where this is used>" },
        { "role": "Secondary",  "name": "<...>", "hex": "#RRGGBB", "intent": "<...>" },
        { "role": "Accent",     "name": "<...>", "hex": "#RRGGBB", "intent": "<...>" },
        { "role": "Neutral 900","name": "<...>", "hex": "#RRGGBB", "intent": "Primary text" },
        { "role": "Neutral 500","name": "<...>", "hex": "#RRGGBB", "intent": "Muted text + dividers" },
        { "role": "Neutral 100","name": "<...>", "hex": "#RRGGBB", "intent": "Soft surface" }
      ],
      "light": {
        "background": "#RRGGBB", "surface": "#RRGGBB", "text": "#RRGGBB", "muted": "#RRGGBB", "border": "#RRGGBB", "primary": "#RRGGBB", "onPrimary": "#RRGGBB"
      },
      "dark": {
        "background": "#RRGGBB", "surface": "#RRGGBB", "text": "#RRGGBB", "muted": "#RRGGBB", "border": "#RRGGBB", "primary": "#RRGGBB", "onPrimary": "#RRGGBB"
      },
      "avoid": "<one short line. Colours that must never appear, with reason>"
    },
    "typography_direction": {
      "display": { "family": "<actual font name>", "google": true, "weights": [600, 700], "tracking": "<e.g. -0.02em>", "notes": "<one short line on character / when to use>" },
      "body":    { "family": "<actual font name>", "google": true, "weights": [400, 500], "tracking": "<e.g. 0>", "notes": "<short line>" },
      "label":   { "family": "<actual font name>", "google": true, "weights": [500],      "tracking": "<e.g. 0.04em>", "notes": "<short line>" },
      "scale": {
        "desktop": [
          { "token": "Display", "size": 64, "lineHeight": 72, "weight": 700, "useFor": "Hero" },
          { "token": "H1",      "size": 48, "lineHeight": 56, "weight": 700, "useFor": "Page titles" },
          { "token": "H2",      "size": 32, "lineHeight": 40, "weight": 600, "useFor": "Section headers" },
          { "token": "H3",      "size": 24, "lineHeight": 32, "weight": 600, "useFor": "Subsections" },
          { "token": "Body",    "size": 16, "lineHeight": 24, "weight": 400, "useFor": "Long-form" },
          { "token": "Caption", "size": 12, "lineHeight": 16, "weight": 500, "useFor": "Metadata" }
        ],
        "mobile": [
          { "token": "Display", "size": 40, "lineHeight": 48, "weight": 700, "useFor": "Hero" },
          { "token": "H1",      "size": 32, "lineHeight": 40, "weight": 700, "useFor": "Page titles" },
          { "token": "H2",      "size": 24, "lineHeight": 32, "weight": 600, "useFor": "Section headers" },
          { "token": "H3",      "size": 20, "lineHeight": 28, "weight": 600, "useFor": "Subsections" },
          { "token": "Body",    "size": 15, "lineHeight": 24, "weight": 400, "useFor": "Long-form" },
          { "token": "Caption", "size": 12, "lineHeight": 16, "weight": 500, "useFor": "Metadata" }
        ]
      },
      "avoid": "<short line. Typographic directions that would contradict the brand>"
    },
    "moodboard_direction": {
      "summary": "<1-2 short sentences on aesthetic territories: UI style, imagery treatment, layout feel>",
      "avoid": "<1 short sentence. Visual directions to stay away from>",
      "references": [
        {
          "label": "<descriptive label, e.g. 'Linear marketing site' or 'Stripe Press editorial layout'>",
          "type":  "Site | Product | Designer | Article | Pattern",
          "url":   "<best-guess URL where this reference lives, e.g. https://linear.app or https://mobbin.com/apps/linear-web>",
          "note":  "<1 short line on what to study about it (layout? colour? motion?)>"
        }
      ]
    }
  }
}

brand_personality: exactly 3-5 traits.
emotional_direction: one entry per journey step. Mirror the step titles you'd expect from section 1.
color_direction: ALL hex values are required and must be real 6-digit hex strings starting with #. Use real colour names (not generic ones like "Blue"). Light and dark token maps must use ACTUAL real hex values appropriate for each mode; do not just lighten or invert each other mechanically.
typography_direction: family names must be real (and on Google Fonts if google=true) so they render in the live preview. Weights must exist on the family. Scale numbers are unit-less px.
moodboard_direction.references: 4-8 entries. Mix product sites (Linear, Stripe, Vercel, Notion, etc), pattern libraries (Mobbin, Dribbble shots, Awwwards winners), and individual designers/studios where relevant. Every URL must be a plausible real homepage or specific page — do not invent fake URLs. If you are not confident a URL is real, omit the reference rather than guessing wildly.

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
    "reference_audit": "<1-2 sentences. What any references reveal about taste / expectations / blind spots. If none in the brief, start with: 'No references provided.' then one sentence on what that absence itself reveals>",
    "competitor_analysis": [
      {
        "name": "<competitor name>",
        "url": "<best-guess homepage URL, e.g. https://linear.app — omit the field entirely if not confident>",
        "positioning": "<how they present strategically. 1 short sentence>",
        "layout": "<their dominant layout pattern, plain language, e.g. 'split hero with feature grid below'>",
        "strength": "<one short sentence on what they do best>",
        "weakness": "<one short sentence on where they fall short>",
        "differentiation": "<the specific opportunity for us to diverge from them>"
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

// ────────────────────────────────────────────────────────────────────
// enrichCompetitorUrls — for each competitor without a URL, fire a
// /api/web-search query against Brave and adopt the top result's
// URL. Failure is silent (the card just renders without a link).
// Returns a new result object with the enriched competitor list;
// the original input isn't mutated.
// ────────────────────────────────────────────────────────────────────
export async function enrichCompetitorUrls(result) {
  try {
    if (!result?.sections) return result
    const landscapeSection = result.sections.find(s => s.id === 'landscape')
    if (!landscapeSection) return result
    const compItem = landscapeSection.items.find(i => i.key === 'competitor_analysis')
    if (!compItem || !Array.isArray(compItem.content)) return result

    const apiBase = (import.meta.env?.VITE_API_URL || import.meta.env?.VITE_API_BASE_URL || '').replace(/\/$/, '')
    if (!apiBase) return result // no Render endpoint configured

    const list = compItem.content
    const needsLookup = list.filter(c => c?.name && !c.url)
    if (!needsLookup.length) return result

    const enriched = await Promise.all(list.map(async (c) => {
      if (!c?.name || c.url) return c
      try {
        const r = await fetch(`${apiBase}/api/web-search`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: `${c.name} official site`, count: 3 }),
        })
        if (!r.ok) return c
        const { results } = await r.json()
        const best = (results || []).find(x => x.url && !/wikipedia|reddit|youtube|facebook|twitter|instagram/i.test(x.url)) || results?.[0]
        if (best?.url) return { ...c, url: best.url }
        return c
      } catch { return c }
    }))

    // Build a new result object with the enriched competitor item.
    return {
      ...result,
      sections: result.sections.map(s => {
        if (s.id !== 'landscape') return s
        return {
          ...s,
          items: s.items.map(i => i.key === 'competitor_analysis' ? { ...i, content: enriched } : i),
        }
      }),
    }
  } catch (e) {
    console.warn('[enrichCompetitorUrls] failed', e?.message)
    return result
  }
}

// ────────────────────────────────────────────────────────────────────
// scoreBriefV2 — runs a short post-translation pass that grades the
// original brief on five rubrics (clarity, scope, audience, success,
// constraints) and returns a 0-100 overall score with sub-scores +
// a one-line summary. The translated result is included as context
// so the model doesn't have to re-do the strategic reading itself.
// Returns null on failure (UI just hides the badge).
// ────────────────────────────────────────────────────────────────────
export async function scoreBriefV2(briefText, translatedResult) {
  try {
    const slim = {
      projectTitle: translatedResult?.projectTitle,
      itemKeys: (translatedResult?.sections || []).flatMap(s =>
        (s.items || []).map(it => ({ key: it.key, hasContent: it.content != null }))
      ),
    }
    const { text } = await callClaude({
      taskType: 'brief_translation',
      system: `${BASE_SYSTEM}\n\nYou are scoring a design brief on how well it sets the designer up to do good work. Be calibrated, not flattering. A 100 is rare. A vague brief with no success metric is at most a 50.`,
      userMessage: `Score this design brief.

Return JSON exactly in this shape:
{
  "overall": <integer 0-100>,
  "rating": "Excellent | Strong | Good | Thin | Critical",
  "sub": [
    { "label": "Clarity",     "score": <int 0-100>, "note": "<one short line>" },
    { "label": "Scope",       "score": <int 0-100>, "note": "<one short line>" },
    { "label": "Audience",    "score": <int 0-100>, "note": "<one short line>" },
    { "label": "Success",     "score": <int 0-100>, "note": "<one short line>" },
    { "label": "Constraints", "score": <int 0-100>, "note": "<one short line>" }
  ],
  "summary": "<one sentence on the brief's strongest + weakest point>"
}

Rating bands: 85+ Excellent, 70-84 Strong, 55-69 Good, 40-54 Thin, <40 Critical.

Brief:
${briefText.slice(0, 4000)}

Translated coverage (which fields the translator could fill):
${JSON.stringify(slim).slice(0, 1500)}`,
      maxTokens: 700,
    })
    const parsed = safeJsonParse(text)
    if (!parsed || typeof parsed.overall !== 'number') return null
    return scrubDashes(parsed)
  } catch (e) {
    console.warn('[scoreBriefV2] failed', e?.message)
    return null
  }
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
