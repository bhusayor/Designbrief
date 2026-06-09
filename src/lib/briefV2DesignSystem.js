// ────────────────────────────────────────────────────────────────────
// briefV2DesignSystem.js — async design-system extraction.
//
// Phase 2 of the 21-item framework. After the translator returns all
// 5 sections, we run one focused AI call that reads items
//   12 brand_personality
//   13 tone_mood
//   14 emotional_direction
//   15 color_direction
//   16 typography_direction
//   17 moodboard_direction
// and compiles a single shared design-system object the kanban
// cards (Phase 3) and the AI builder (Phase 4) read.
//
// The spec is explicit: every value must be derived from the
// translation, never defaulted or invented. The prompt enforces
// this by passing only those 6 items as context and rejecting
// generic placeholder language.
//
// The output schema mirrors the spec's six pillars: color, type,
// spacing, component, motion, visual language. Stored on the
// result as `result.designSystem`, so the standard history-load
// hydration picks it up for free.
// ────────────────────────────────────────────────────────────────────

import { callClaude } from './claudeApi.js'
import { scrubDashes } from './briefV2Schema.js'

const SYSTEM_PROMPT = `You are a senior design systems architect. You read the brand-and-direction items from a translated brief and compile a single design-system object the team will hand to every kanban card and every AI builder run.

HARD RULES:
- Every field must derive directly from the source items. Do not invent values. If an item is empty or ambiguous, write "Not specified in brief" in that field, never a generic placeholder.
- Never use em dashes (—), en dashes (–), or ellipses (…). Use commas, semicolons, or short sentences.
- Be concrete and operational. "Tight and dense" is good. "Modern and clean" is not.

Respond ONLY with valid JSON. No markdown, no code fences, no preamble.`

const USER_PROMPT = (items) => `Compile a design-system object from these 6 brief items.

Source items:
${formatItems(items)}

Return JSON in this EXACT shape:
{
  "color": {
    "primary":             "<role + the emotional association from Color Direction, in one sentence>",
    "secondary":           "<role + intent>",
    "accent":              "<role + intent>",
    "background":          "<warm vs cool, light vs dark, behaviour, one sentence>",
    "surface":             "<elevation behaviour for cards / panels, one sentence>",
    "never_appear":        ["<colour or palette that must never appear, with the reason>"]
  },
  "typography": {
    "display":             "<personality + weight behaviour for headings, one sentence>",
    "body":                "<feel + line-height intent + reading rhythm, one sentence>",
    "label":               "<UI label style + size behaviour + hierarchy rules, one sentence>",
    "contradicts_brand":   ["<typographic choice that would contradict the brand personality>"]
  },
  "spacing": {
    "density":             "tight | open",
    "scale":               "compact | standard | generous",
    "rationale":           "<one sentence connecting density + scale back to the Brand Personality and Tone & Mood>"
  },
  "component": {
    "corner_radius":       "sharp | slightly-rounded | soft",
    "radius_reason":       "<one sentence linking the choice to brand personality>",
    "density":             "minimal | rich",
    "borders":             "present | subtle | absent"
  },
  "motion": {
    "speed":               "instant | measured | considered",
    "transition":          "mechanical | fluid | elastic",
    "speed_reason":        "<one sentence linking speed to tone>"
  },
  "visual_language": {
    "imagery_type":        "illustrative | photographic | abstract | typographic",
    "ui_style":            "flat | layered | glassmorphic | brutalist | editorial",
    "imagery_treatment":   "full-bleed | contained | absent"
  }
}

Allowed enum values (use exactly one from the listed set where the schema requires it):
- spacing.density: tight, open
- spacing.scale: compact, standard, generous
- component.corner_radius: sharp, slightly-rounded, soft
- component.density: minimal, rich
- component.borders: present, subtle, absent
- motion.speed: instant, measured, considered
- motion.transition: mechanical, fluid, elastic
- visual_language.imagery_type: illustrative, photographic, abstract, typographic
- visual_language.ui_style: flat, layered, glassmorphic, brutalist, editorial
- visual_language.imagery_treatment: full-bleed, contained, absent`

function formatItems(items) {
  const lines = []
  if (items.brand_personality) {
    lines.push('Item 12 — Brand Personality:')
    if (Array.isArray(items.brand_personality)) {
      items.brand_personality.forEach(t => lines.push(`  - ${t}`))
    } else {
      lines.push(`  ${items.brand_personality}`)
    }
  }
  if (items.tone_mood) {
    lines.push('')
    lines.push('Item 13 — Tone & Mood:')
    lines.push(`  ${items.tone_mood}`)
  }
  if (items.emotional_direction) {
    lines.push('')
    lines.push('Item 14 — Emotional Direction:')
    if (Array.isArray(items.emotional_direction)) {
      items.emotional_direction.forEach(s => lines.push(`  - ${s.stage || s.step}: ${s.emotion || ''}`))
    }
  }
  if (items.color_direction) {
    lines.push('')
    lines.push('Item 15 — Color Direction:')
    const c = items.color_direction
    if (typeof c === 'object') {
      for (const [k, v] of Object.entries(c)) lines.push(`  ${k}: ${v}`)
    } else lines.push(`  ${c}`)
  }
  if (items.typography_direction) {
    lines.push('')
    lines.push('Item 16 — Typography Direction:')
    const t = items.typography_direction
    if (typeof t === 'object') {
      for (const [k, v] of Object.entries(t)) lines.push(`  ${k}: ${v}`)
    } else lines.push(`  ${t}`)
  }
  if (items.moodboard_direction) {
    lines.push('')
    lines.push('Item 17 — Moodboard Direction:')
    lines.push(`  ${items.moodboard_direction}`)
  }
  return lines.join('\n')
}

// ────────────────────────────────────────────────────────────────────
// extractDesignSystem — main entry point. Takes the V2 result,
// extracts items 12-17, sends them to Claude, returns the parsed
// design-system object. Errors return null so the caller can decide
// whether to retry or surface the failure.
// ────────────────────────────────────────────────────────────────────
export async function extractDesignSystem(v2Result) {
  if (!v2Result?.sections) return null

  const items = {}
  for (const section of v2Result.sections) {
    for (const item of section.items) {
      if (item.key === 'brand_personality')    items.brand_personality    = item.content
      if (item.key === 'tone_mood')            items.tone_mood            = item.content
      if (item.key === 'emotional_direction')  items.emotional_direction  = item.content
      if (item.key === 'color_direction')      items.color_direction      = item.content
      if (item.key === 'typography_direction') items.typography_direction = item.content
      if (item.key === 'moodboard_direction')  items.moodboard_direction  = item.content
    }
  }

  // Bail if the source items haven't streamed in yet. Caller should
  // run this only after the final translator promise resolves.
  const hasAnything = Object.values(items).some(v => v != null)
  if (!hasAnything) return null

  try {
    const { text } = await callClaude({
      taskType: 'brief_translation',
      system: SYSTEM_PROMPT,
      userMessage: USER_PROMPT(items),
      maxTokens: 2000,
    })
    const parsed = safeJsonParse(text)
    return scrubDashes(parsed)
  } catch (e) {
    console.warn('[design-system] extraction failed:', e?.message)
    return null
  }
}

function safeJsonParse(text) {
  if (!text) return null
  let s = String(text).trim()
  if (s.startsWith('```')) {
    s = s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim()
  }
  try { return JSON.parse(s) } catch {}
  const first = s.indexOf('{')
  const last = s.lastIndexOf('}')
  if (first >= 0 && last > first) {
    try { return JSON.parse(s.slice(first, last + 1)) } catch {}
  }
  return null
}

// ────────────────────────────────────────────────────────────────────
// designSystemToContextBlock — Phase 4 (AI builder) reads this. It
// formats the design-system object into the prefix system-prompt
// block every builder call gets. Kept here so Phase 4 doesn't have
// to know the object's shape.
// ────────────────────────────────────────────────────────────────────
export function designSystemToContextBlock(ds) {
  if (!ds) return ''
  const lines = ['PROJECT DESIGN SYSTEM']
  if (ds.color) {
    lines.push('', 'COLOR INTENT:')
    if (ds.color.primary)    lines.push(`  Primary: ${ds.color.primary}`)
    if (ds.color.secondary)  lines.push(`  Secondary: ${ds.color.secondary}`)
    if (ds.color.accent)     lines.push(`  Accent: ${ds.color.accent}`)
    if (ds.color.background) lines.push(`  Background: ${ds.color.background}`)
    if (ds.color.surface)    lines.push(`  Surface: ${ds.color.surface}`)
    if (Array.isArray(ds.color.never_appear) && ds.color.never_appear.length)
      lines.push(`  Never appear: ${ds.color.never_appear.join('; ')}`)
  }
  if (ds.typography) {
    lines.push('', 'TYPOGRAPHY BEHAVIOUR:')
    if (ds.typography.display) lines.push(`  Display: ${ds.typography.display}`)
    if (ds.typography.body)    lines.push(`  Body: ${ds.typography.body}`)
    if (ds.typography.label)   lines.push(`  Label: ${ds.typography.label}`)
    if (Array.isArray(ds.typography.contradicts_brand) && ds.typography.contradicts_brand.length)
      lines.push(`  Contradicts brand: ${ds.typography.contradicts_brand.join('; ')}`)
  }
  if (ds.spacing) {
    lines.push('', 'SPACING PHILOSOPHY:')
    lines.push(`  Density: ${ds.spacing.density || 'standard'}`)
    lines.push(`  Scale: ${ds.spacing.scale || 'standard'}`)
    if (ds.spacing.rationale) lines.push(`  Rationale: ${ds.spacing.rationale}`)
  }
  if (ds.component) {
    lines.push('', 'COMPONENT STYLE:')
    lines.push(`  Corner radius: ${ds.component.corner_radius || 'slightly-rounded'}`)
    if (ds.component.radius_reason) lines.push(`  Reason: ${ds.component.radius_reason}`)
    lines.push(`  Density: ${ds.component.density || 'minimal'}`)
    lines.push(`  Borders: ${ds.component.borders || 'subtle'}`)
  }
  if (ds.motion) {
    lines.push('', 'MOTION + INTERACTION FEEL:')
    lines.push(`  Speed: ${ds.motion.speed || 'measured'}`)
    lines.push(`  Transition: ${ds.motion.transition || 'fluid'}`)
    if (ds.motion.speed_reason) lines.push(`  Reason: ${ds.motion.speed_reason}`)
  }
  if (ds.visual_language) {
    lines.push('', 'VISUAL LANGUAGE:')
    lines.push(`  Imagery type: ${ds.visual_language.imagery_type || 'photographic'}`)
    lines.push(`  UI style: ${ds.visual_language.ui_style || 'flat'}`)
    lines.push(`  Imagery treatment: ${ds.visual_language.imagery_treatment || 'contained'}`)
  }
  lines.push('', 'Apply ALL of the above consistently to every layout, colour, type, component, and motion decision you make for this project. Never deviate.')
  return lines.join('\n')
}
