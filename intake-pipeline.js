// ────────────────────────────────────────────────────────────────────
// intake-pipeline.js — Phase 4 of the Client Intake Form rebuild.
//
// 8-step automated processing pipeline that runs after a client
// submits the public intake form. Runs on the Render Express server
// (no Vercel timeout ceiling).
//
//   4a — raw answer ingestion (already done by the submit RPC; this
//        file just reads the row).
//   4b — AI enrichment: expand thin answers, resolve contradictions,
//        extract implicit signals.
//   4c — brief assembly: rewrite the enriched answers as continuous
//        prose organised by section.
//   4d — V2 translator: 21 items × 5 sections, parallel call set.
//   4e — design system extraction from items 12-17.
//   4f — kanban population: parse item 4 + item 6 into one card per
//        deliverable.
//   4g — block detection: flag cards affected by High red flags,
//        unconfirmed assumptions, unanswered blocking questions.
//   4h — notification email to the designer + an in-app flag count.
//
// Status is written to intake_submissions.status as each step
// completes so the designer review screen can poll progress.
// ────────────────────────────────────────────────────────────────────

import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const supabase = createClient(
  process.env.VITE_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  { auth: { persistSession: false } },
)
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null

const MODEL = 'claude-sonnet-4-5'

// ────────────────────────────────────────────────────────────────────
// Public entry point — main pipeline orchestrator
// ────────────────────────────────────────────────────────────────────
export async function runIntakePipeline(submissionId) {
  let submission, form
  try {
    submission = await loadSubmission(submissionId)
    if (!submission) throw new Error('submission_not_found')
    form = await loadForm(submission.intake_form_id)
    if (!form) throw new Error('form_not_found')
  } catch (e) {
    await markFailed(submissionId, 'load', e.message)
    return { ok: false, step: 'load', error: e.message }
  }

  const answers = submission.answers || {}
  const questions = Array.isArray(form.questions) ? form.questions : []

  // ── 4b: enrich ────────────────────────────────────────────────
  let enriched
  try {
    await setStatus(submissionId, 'enriching')
    enriched = await enrichAnswers(answers, questions)
    await update(submissionId, { enriched_answers: enriched })
  } catch (e) {
    return finishFailed(submissionId, 'enriching', e)
  }

  // ── 4c: assemble brief ────────────────────────────────────────
  let briefText
  try {
    briefText = await assembleBrief(enriched, form, answers, questions)
    await update(submissionId, { assembled_brief: briefText })
  } catch (e) {
    return finishFailed(submissionId, 'assembling', e)
  }

  // ── 4d: V2 translation ────────────────────────────────────────
  let v2Result
  try {
    await setStatus(submissionId, 'translating')
    v2Result = await translateBriefV2Server(briefText)
  } catch (e) {
    return finishFailed(submissionId, 'translating', e)
  }

  // ── 4e: design system extraction ──────────────────────────────
  let designSystem = null
  try {
    await setStatus(submissionId, 'extracting_design_system')
    designSystem = await extractDesignSystemServer(v2Result)
  } catch (e) {
    // non-fatal — translation already useful without the design system
    console.warn('[pipeline] design-system failed (non-fatal)', e?.message)
  }
  v2Result.designSystem = designSystem

  // ── 4f + 4g: kanban + block detection ─────────────────────────
  try {
    await setStatus(submissionId, 'building_kanban')
    const kanban = buildKanbanFromV2(v2Result)
    v2Result.kanbanCards = kanban
  } catch (e) {
    console.warn('[pipeline] kanban derivation failed (non-fatal)', e?.message)
  }

  // ── Persist the full result ───────────────────────────────────
  try {
    const flags = aggregateFlags(v2Result)
    await update(submissionId, {
      translated_result: v2Result,
      flags,
      status: 'notifying',
      completed_at: new Date().toISOString(),
    })

    // ── 4h: notification ────────────────────────────────────────
    await notifyDesigner(form, submission, v2Result, flags).catch(e => {
      console.warn('[pipeline] notification failed (non-fatal)', e?.message)
    })

    await update(submissionId, { status: 'complete' })
    return { ok: true }
  } catch (e) {
    return finishFailed(submissionId, 'persisting', e)
  }
}

// ────────────────────────────────────────────────────────────────────
// 4b — enrichment
// ────────────────────────────────────────────────────────────────────
async function enrichAnswers(answers, questions) {
  const transcript = questions
    .map((q, i) => {
      const v = answers[q.id]
      const label = `Q${i + 1} (${q.type}, ${q.required ? 'required' : 'optional'}): ${q.text}`
      const val = formatAnswer(v)
      return `${label}\nA: ${val}`
    })
    .join('\n\n')

  const system = `You are a senior product strategist who reads raw client intake answers and prepares them for translation into a design brief. You do exactly three things and nothing more:

1. EXPAND THIN ANSWERS. If a required question received fewer than 10 words, infer additional context from other answers in the same form. Mark inferred content "(AI-inferred)" so the designer can see what came from the client versus what you added.

2. RESOLVE CONTRADICTIONS. Compare answers for contradictions. A client who says "minimal" but uploads maximalist references contradicts themselves; a 2-week deadline with 20 features contradicts itself. Flag each one with a plain-language explanation.

3. EXTRACT IMPLICIT SIGNALS. Note tone (formal/casual/emotional), the gap between how they describe the audience vs the product, and any other patterns across answers. These signals shape the brief without being stated.

Never use em dashes (—) or en dashes (–). Respond ONLY with valid JSON. No markdown, no code fences.`

  const user = `Here are the client's answers. Run your three enrichment passes.

${transcript}

Return JSON in this exact shape:
{
  "expansions": [
    { "qid": "<original question id>", "original": "<client's actual answer>", "expanded": "<your inferred fuller version, with (AI-inferred) tags on inferred bits>" }
  ],
  "contradictions": [
    { "between": "<short label like 'Q3 vs Q7'>", "explanation": "<one plain-language sentence about what contradicts what>" }
  ],
  "implicit_signals": [
    "<single signal observation, one per array entry>"
  ]
}

Counts:
- expansions: only for required questions whose answer was < 10 words. Skip the rest.
- contradictions: 0-5 entries, only real conflicts. Don't manufacture.
- implicit_signals: 3-8 observations.`

  const text = await callClaudeJson({ system, user, maxTokens: 2500 })
  const parsed = safeJson(text) || { expansions: [], contradictions: [], implicit_signals: [] }
  return scrubDashes(parsed)
}

// ────────────────────────────────────────────────────────────────────
// 4c — brief assembly
// ────────────────────────────────────────────────────────────────────
async function assembleBrief(enriched, form, answers, questions) {
  const projectType = labelForType(form.project_type)
  const transcript = questions
    .map(q => {
      const v = answers[q.id]
      const val = formatAnswer(v)
      return `${q.text}\n→ ${val}`
    })
    .join('\n\n')
  const expansionsBlock = (enriched.expansions || [])
    .map(e => `Q ${e.qid}: ${e.expanded || e.original || ''}`)
    .join('\n')
  const contradictionsBlock = (enriched.contradictions || [])
    .map(c => `[${c.between}] ${c.explanation}`)
    .join('\n')
  const signalsBlock = (enriched.implicit_signals || []).map(s => `- ${s}`).join('\n')

  const system = `You are a senior product strategist with 15+ years at top design agencies. You read raw client intake answers, AI-enrichment notes, contradiction flags, and implicit signals; then you write a clean draft brief that reads like a document a thoughtful designer wrote after a thorough client discovery call.

Hard rules:
- Continuous prose. No bullet lists, no Q&A format.
- Organise into the seven canonical sections: project overview, business context, audience, goals, constraints, visual direction, references.
- Reference what the client said directly. When you incorporate an AI-inferred expansion, write it in your own voice without flagging it inside the brief (the metadata captures it).
- Acknowledge contradictions and unknowns honestly — don't paper over them.
- Never use em dashes (—) or en dashes (–). Use commas, semicolons, or short sentences.
- Output PLAIN TEXT. No markdown, no headings with #, no code fences.`

  const user = `Project type: ${projectType}

CLIENT'S RAW ANSWERS:
${transcript}

EXPANSIONS THE AI INFERRED:
${expansionsBlock || '(none)'}

CONTRADICTIONS DETECTED:
${contradictionsBlock || '(none)'}

IMPLICIT SIGNALS:
${signalsBlock || '(none)'}

Now write the brief. Around 400-700 words. Section headers as plain text on their own line in capital letters, with a blank line above and below. No # marks.`

  const text = await callClaudeText({ system, user, maxTokens: 2000 })
  return scrubDashes(text)
}

// ────────────────────────────────────────────────────────────────────
// 4d — V2 translator (server-side port of src/lib/briefV2Translator.js)
// ────────────────────────────────────────────────────────────────────
const BRIEF_V2_SECTIONS = [
  { id: 'understand',  label: 'Understand the problem first',
    items: [
      { id: 1, key: 'core_problem_clarity', title: 'Core Problem Clarity', shape: 'text' },
      { id: 2, key: 'project_intent',       title: 'Project Intent',        shape: 'text' },
      { id: 3, key: 'business_context',     title: 'Business Context',      shape: 'text' },
      { id: 4, key: 'deliverables',         title: 'Deliverables Definition', shape: 'list' },
      { id: 5, key: 'target_audience',      title: 'Target Audience',       shape: 'text' },
      { id: 6, key: 'user_journey',         title: 'User Journey Snapshot', shape: 'journey' },
      { id: 7, key: 'success_definition',   title: 'Success Definition',    shape: 'text' },
    ] },
  { id: 'interrogate', label: 'Interrogate the brief',
    items: [
      { id: 8,  key: 'wants_vs_needs',  title: 'Wants vs. Needs Breakdown', shape: 'rows' },
      { id: 9,  key: 'assumptions_log', title: 'Assumptions Log',           shape: 'badged_list' },
      { id: 10, key: 'red_flags',       title: 'Red Flags',                 shape: 'badged_list' },
      { id: 11, key: 'questions',       title: 'Questions for Your Client', shape: 'numbered_list' },
    ] },
  { id: 'direction',   label: 'Define the direction',
    items: [
      { id: 12, key: 'brand_personality',    title: 'Brand Personality',     shape: 'list' },
      { id: 13, key: 'tone_mood',            title: 'Tone & Mood',           shape: 'text' },
      { id: 14, key: 'emotional_direction',  title: 'Emotional Direction',   shape: 'journey' },
      { id: 15, key: 'color_direction',      title: 'Color Direction',       shape: 'roles' },
      { id: 16, key: 'typography_direction', title: 'Typography Direction',  shape: 'levels' },
      { id: 17, key: 'moodboard_direction',  title: 'Moodboard Direction',   shape: 'text' },
    ] },
  { id: 'landscape',   label: 'Situate in the landscape',
    items: [
      { id: 18, key: 'reference_audit',     title: 'Reference Audit',     shape: 'text' },
      { id: 19, key: 'competitor_analysis', title: 'Competitor Analysis', shape: 'competitors' },
    ] },
  { id: 'boundaries',  label: 'Lock the boundaries',
    items: [
      { id: 20, key: 'scope_constraints', title: 'Scope & Constraints',          shape: 'list' },
      { id: 21, key: 'content_inventory', title: 'Content & Asset Inventory',    shape: 'inventory' },
    ] },
]

const SECTION_PROMPTS = {
  understand: (briefText) => ({
    user: `Translate this brief into the first 7 framework items.

Return JSON in this shape:
{
  "projectTitle": "<concise name>",
  "items": {
    "core_problem_clarity": "<2-4 sentences>",
    "project_intent":        "<2-3 sentences>",
    "business_context":      "<2-3 sentences>",
    "deliverables":          ["<one named page/screen/flow per entry, 4-12 entries>"],
    "target_audience":       "<3-5 sentences ending with 'Not for: ...'>",
    "user_journey":  [{ "step": 1, "title": "<3-5 words>", "action": "<1 sentence>", "emotion": "<single word>" }],
    "success_definition": "<2-3 sentences>"
  }
}

User journey: 4-7 ordered steps.

Brief:
${briefText}`,
  }),
  interrogate: (briefText) => ({
    user: `Produce items 8-11.

Return JSON:
{
  "items": {
    "wants_vs_needs": { "rows": [{ "left": "<asked for>", "right": "<actually need>" }] },
    "assumptions_log": { "items": [{ "text": "<assumption>", "status": "Confirmed | Unconfirmed | Needs Clarification" }] },
    "red_flags": { "items": [{ "text": "<flag>", "severity": "High | Medium | Low" }] },
    "questions": ["<priority-ordered clarifying question>"]
  }
}

Counts: wants_vs_needs 3-6 rows, assumptions_log 3-8 items, red_flags 2-6 items, questions 3-7.

Brief:
${briefText}`,
  }),
  direction: (briefText) => ({
    user: `Translate the strategic direction into items 12-17. No font names. No hex codes. Plain language only.

Return JSON:
{
  "items": {
    "brand_personality": ["<trait>: <one-line explanation>"],
    "tone_mood": "<2-3 sentences ending with 'Never feel like: ...'>",
    "emotional_direction": [{ "step": 1, "stage": "<stage>", "emotion": "<emotion>" }],
    "color_direction": { "primary":"", "secondary":"", "accent":"", "background":"", "surface":"", "avoid":"" },
    "typography_direction": { "display":"", "body":"", "label":"", "avoid":"" },
    "moodboard_direction": "<3-4 sentences ending with 'Avoid: ...'>"
  }
}

brand_personality: exactly 3-5 traits.

Brief:
${briefText}`,
  }),
  landscape: (briefText) => ({
    user: `Produce items 18-19.

Return JSON:
{
  "items": {
    "reference_audit": "<3-5 sentences. If brief has no references, start with 'No references provided. ' followed by what that absence reveals>",
    "competitor_analysis": [
      { "name":"", "positioning":"<1 sentence>", "layout":"<dominant layout pattern, plain language>", "differentiation":"<diverge opportunity>" }
    ]
  }
}

Minimum 3 competitors if any can be inferred from the brief; otherwise a single placeholder.

Brief:
${briefText}`,
  }),
  boundaries: (briefText) => ({
    user: `Produce items 20-21.

Return JSON:
{
  "items": {
    "scope_constraints": ["<one boundary per entry, 4-8 total>"],
    "content_inventory": [{ "page":"<from deliverables>", "content":"<copy notes>", "assets":"<media notes>", "status":"Available | Needs Creation | Unknown" }]
  }
}

Brief:
${briefText}`,
  }),
}

const SHARED_SYSTEM = `You are an expert product design strategist who translates briefs into a 21-item framework with precision and creative intelligence.

PUNCTUATION RULES (hard constraint):
- Never use em dashes (—) or en dashes (–). Anywhere. Use commas, semicolons, two short sentences, or hyphens.
- Don't use ellipses (…).

Respond ONLY with valid JSON. No markdown, no code fences, no preamble.`

async function translateBriefV2Server(briefText) {
  const result = {
    schemaVersion: 'v2',
    projectTitle: 'Untitled brief',
    sections: BRIEF_V2_SECTIONS.map(s => ({
      id: s.id,
      label: s.label,
      items: s.items.map(it => ({ ...it, content: null })),
    })),
  }

  const promises = BRIEF_V2_SECTIONS.map(async (def) => {
    const prompt = SECTION_PROMPTS[def.id](briefText)
    try {
      const text = await callClaudeJson({
        system: SHARED_SYSTEM,
        user: prompt.user,
        maxTokens: 3500,
      })
      const parsed = scrubDashes(safeJson(text) || {})
      if (def.id === 'understand' && parsed.projectTitle) result.projectTitle = parsed.projectTitle
      const itemMap = parsed.items || {}
      const sec = result.sections.find(s => s.id === def.id)
      if (sec) {
        for (const item of sec.items) {
          if (itemMap[item.key] != null) item.content = itemMap[item.key]
        }
      }
    } catch (e) {
      console.warn('[v2-translate]', def.id, 'failed:', e?.message)
    }
  })
  await Promise.all(promises)
  return result
}

// ────────────────────────────────────────────────────────────────────
// 4e — design system extraction (server port)
// ────────────────────────────────────────────────────────────────────
async function extractDesignSystemServer(v2Result) {
  if (!v2Result?.sections) return null
  const items = {}
  for (const section of v2Result.sections) {
    for (const item of section.items) {
      if (['brand_personality', 'tone_mood', 'emotional_direction', 'color_direction', 'typography_direction', 'moodboard_direction'].includes(item.key)) {
        items[item.key] = item.content
      }
    }
  }
  if (!Object.values(items).some(v => v != null)) return null

  const system = `You are a senior design systems architect. You compile a single design-system object from the brand-and-direction items of a translated brief.

HARD RULES:
- Every field must derive directly from the source items. Do not invent values. Write "Not specified in brief" if an item is empty.
- Never use em dashes (—) or en dashes (–) or ellipses (…).
- Be concrete and operational.

Respond ONLY with valid JSON.`

  const user = `Compile a design-system object from these items.

${formatItemsForDs(items)}

Return JSON in this shape:
{
  "color": { "primary":"", "secondary":"", "accent":"", "background":"", "surface":"", "never_appear":[] },
  "typography": { "display":"", "body":"", "label":"", "contradicts_brand":[] },
  "spacing": { "density":"tight | open", "scale":"compact | standard | generous", "rationale":"" },
  "component": { "corner_radius":"sharp | slightly-rounded | soft", "radius_reason":"", "density":"minimal | rich", "borders":"present | subtle | absent" },
  "motion": { "speed":"instant | measured | considered", "transition":"mechanical | fluid | elastic", "speed_reason":"" },
  "visual_language": { "imagery_type":"illustrative | photographic | abstract | typographic", "ui_style":"flat | layered | glassmorphic | brutalist | editorial", "imagery_treatment":"full-bleed | contained | absent" }
}`

  try {
    const text = await callClaudeJson({ system, user, maxTokens: 2000 })
    return scrubDashes(safeJson(text))
  } catch (e) {
    console.warn('[design-system]', e?.message)
    return null
  }
}

function formatItemsForDs(items) {
  const lines = []
  if (items.brand_personality) {
    lines.push('Item 12 (Brand Personality):')
    if (Array.isArray(items.brand_personality)) items.brand_personality.forEach(t => lines.push(`  - ${t}`))
    else lines.push(`  ${items.brand_personality}`)
  }
  if (items.tone_mood) lines.push('', 'Item 13 (Tone & Mood):', `  ${items.tone_mood}`)
  if (items.color_direction) {
    lines.push('', 'Item 15 (Color Direction):')
    const c = items.color_direction
    if (typeof c === 'object') for (const [k, v] of Object.entries(c)) lines.push(`  ${k}: ${v}`)
  }
  if (items.typography_direction) {
    lines.push('', 'Item 16 (Typography Direction):')
    const t = items.typography_direction
    if (typeof t === 'object') for (const [k, v] of Object.entries(t)) lines.push(`  ${k}: ${v}`)
  }
  if (items.moodboard_direction) lines.push('', 'Item 17 (Moodboard Direction):', `  ${items.moodboard_direction}`)
  return lines.join('\n')
}

// ────────────────────────────────────────────────────────────────────
// 4f + 4g — kanban (server port of src/lib/briefV2Kanban.js)
// ────────────────────────────────────────────────────────────────────
function buildKanbanFromV2(v2Result) {
  if (!v2Result?.sections) return { tasks: [] }
  const byKey = {}
  for (const s of v2Result.sections) for (const it of s.items) byKey[it.key] = it.content

  const deliverables = normalizeList(byKey.deliverables)
  if (!deliverables.length) return { tasks: [] }

  const journey = normalizeJourney(byKey.user_journey)
  const emotion = normalizeJourney(byKey.emotional_direction)
  const inventory = Array.isArray(byKey.content_inventory) ? byKey.content_inventory : []
  const constraints = normalizeList(byKey.scope_constraints)
  const redFlags = Array.isArray(byKey.red_flags?.items) ? byKey.red_flags.items : []
  const assumptions = Array.isArray(byKey.assumptions_log?.items) ? byKey.assumptions_log.items : []
  const questions = Array.isArray(byKey.questions) ? byKey.questions : []
  const designSystem = v2Result.designSystem || null

  const corePurpose = String(byKey.core_problem_clarity || '')
  const intent = String(byKey.project_intent || '')
  const audience = String(byKey.target_audience || '')
  const success = String(byKey.success_definition || '')

  const tasks = deliverables.map((page, idx) => {
    const journeyStep = matchStage(page, journey, idx)
    const emotionStep = matchStage(page, emotion, idx) || journeyStep
    const inv = inventory.find(i => sameName(i.page, page))
    const blocks = detectBlocks(page, redFlags, assumptions, questions)
    const desc = composeDescription({ page, corePurpose, intent, audience, journeyStep, emotionStep, success, inv, constraints, designSystem })
    return {
      id: 'task_' + Math.random().toString(36).slice(2, 10),
      title: page,
      description: desc,
      column_name: 'todo',
      column: 'todo',
      position: idx,
      estimated_days: 2,
      status: blocks.length ? 'blocked' : 'todo',
      blocked: blocks.length > 0,
      blocked_reasons: blocks,
      design_system: designSystem,
      schemaVersion: 'v2',
      v2: { page, journeyStep, emotionStep, inventoryEntry: inv || null, relevantConstraints: filterRelevant(page, constraints) },
    }
  })

  return { tasks, projectTimeline: 'Auto-derived from brief', designSystem }
}

function normalizeList(v) {
  if (!v) return []
  if (Array.isArray(v)) return v.map(x => String(x).trim()).filter(Boolean)
  if (typeof v === 'string') return v.split('\n').map(l => l.replace(/^[-•*]\s*/, '').trim()).filter(Boolean)
  return []
}
function normalizeJourney(v) {
  if (!Array.isArray(v)) return []
  return v.map((s, i) => ({
    step: s.step || i + 1,
    title: s.title || s.stage || `Step ${i + 1}`,
    action: s.action || '',
    emotion: s.emotion || s.feeling || '',
  }))
}
function normalizeName(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim() }
function sameName(a, b) { return normalizeName(a) === normalizeName(b) }
function matchStage(page, list, idx) {
  if (!list.length) return null
  const pn = normalizeName(page)
  const m = list.find(j => { const jn = normalizeName(j.title); return jn && (pn.includes(jn) || jn.includes(pn)) })
  return m || list[idx] || list[0]
}
function detectBlocks(page, redFlags, assumptions, questions) {
  const out = []
  const pn = normalizeName(page)
  const generic = (t) => /all (pages|screens)|every (page|screen)|the whole|across the site|product wide/i.test(t || '')
  const mentions = (t) => { if (!t || !pn) return false; const x = normalizeName(t); return x.includes(pn) || generic(t) }
  for (const f of redFlags) if ((f.severity || '').toLowerCase() === 'high' && mentions(f.text)) out.push({ type: 'red_flag', severity: 'High', text: f.text })
  for (const a of assumptions) if ((a.status || '').toLowerCase() === 'needs clarification' && mentions(a.text)) out.push({ type: 'assumption', status: 'Needs Clarification', text: a.text })
  for (const q of questions) if (mentions(q)) out.push({ type: 'question', text: q })
  return out
}
function filterRelevant(page, constraints) {
  const pn = normalizeName(page)
  return constraints.filter(c => { const cn = normalizeName(c); return pn && (cn.includes(pn) || /all|every|across|product/i.test(c)) })
}
function composeDescription({ page, corePurpose, intent, audience, journeyStep, emotionStep, success, inv, constraints, designSystem }) {
  const lines = []
  lines.push('**Page purpose**')
  if (corePurpose) lines.push(corePurpose)
  if (intent) lines.push('', intent)
  lines.push('', '**User context**')
  if (audience) lines.push(audience)
  if (journeyStep) {
    lines.push('', `At this point in the journey: ${journeyStep.title}.`)
    if (journeyStep.action) lines.push(`What the user is doing: ${journeyStep.action}`)
  }
  if (emotionStep?.emotion) lines.push('', '**Emotional direction**', `The user should feel: ${emotionStep.emotion}.`)
  lines.push('', '**Required sections**',
    'Design the section order around what the user needs to think, feel, and do here. The section order must serve the user state at this moment, not a conventional content hierarchy.')
  if (success) lines.push('', `Success on this page: ${success}`)
  lines.push('', '**Content + asset status**')
  if (inv) {
    if (inv.content) lines.push(`Content: ${inv.content}`)
    if (inv.assets) lines.push(`Assets: ${inv.assets}`)
    if (inv.status) lines.push(`Status: ${inv.status}`)
  } else {
    lines.push('Inventory: Unknown. Confirm copy and media before build.')
  }
  const rel = filterRelevant(page, constraints)
  if (rel.length) { lines.push('', '**Constraints**'); for (const c of rel) lines.push(`- ${c}`) }
  if (success) lines.push('', '**Success condition**', success)
  if (designSystem) {
    lines.push('', '**Design system**')
    const parts = []
    if (designSystem.color?.primary) parts.push(`Color: ${designSystem.color.primary}`)
    if (designSystem.typography?.display) parts.push(`Typography: ${designSystem.typography.display}`)
    if (designSystem.spacing?.density) parts.push(`Spacing: ${designSystem.spacing.density}, ${designSystem.spacing.scale || 'standard'}`)
    if (designSystem.component?.corner_radius) parts.push(`Corners: ${designSystem.component.corner_radius}`)
    if (designSystem.motion?.speed) parts.push(`Motion: ${designSystem.motion.speed}`)
    if (parts.length) lines.push(parts.join('\n'))
    lines.push('', '(Full design system attached. The AI builder will apply it.)')
  }
  return lines.join('\n').replace(/—/g, '-').replace(/–/g, '-')
}

// ────────────────────────────────────────────────────────────────────
// Flag aggregation (for 4g and the review screen)
// ────────────────────────────────────────────────────────────────────
function aggregateFlags(v2) {
  if (!v2?.sections) return []
  const out = []
  for (const s of v2.sections) {
    for (const it of s.items) {
      if (it.key === 'red_flags' && Array.isArray(it.content?.items)) {
        for (const f of it.content.items) out.push({ type: 'red_flag', severity: f.severity || 'Medium', text: f.text || '' })
      }
      if (it.key === 'assumptions_log' && Array.isArray(it.content?.items)) {
        for (const a of it.content.items) out.push({ type: 'assumption', status: a.status || 'Unconfirmed', text: a.text || '' })
      }
      if (it.key === 'questions' && Array.isArray(it.content)) {
        for (const q of it.content) out.push({ type: 'question', text: String(q || '') })
      }
    }
  }
  return out
}

// ────────────────────────────────────────────────────────────────────
// 4h — notification
// ────────────────────────────────────────────────────────────────────
async function notifyDesigner(form, submission, v2Result, flags) {
  if (!resend) {
    console.warn('[pipeline] RESEND_API_KEY missing; skipping notification')
    return
  }
  const { data: designerAuth } = await supabase.auth.admin.getUserById(form.user_id).catch(() => ({ data: null }))
  const designerEmail = designerAuth?.user?.email
  if (!designerEmail) {
    console.warn('[pipeline] designer email not found; skipping notification')
    return
  }

  const appUrl = process.env.VITE_APP_URL || 'https://designbrief.ai'
  const reviewUrl = `${appUrl.replace(/\/$/, '')}/intake/${form.id}` // delivery view
  const projectTitle = v2Result?.projectTitle || form.project_name || 'New brief'

  const summary = summaryFromV2(v2Result)
  const flagCount = flags.length
  const highRedFlags = flags.filter(f => f.type === 'red_flag' && f.severity === 'High').length

  const html = `<!doctype html><html><body style="font-family:-apple-system,sans-serif;background:#f5f5f7;padding:32px 16px;margin:0;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;margin:0 auto;background:#fff;border-radius:14px;overflow:hidden;">
  <tr><td style="padding:30px 30px 6px;"><div style="font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#8b8b94;font-weight:700;">New brief from a client</div><h1 style="font-size:22px;margin:6px 0 0;">${escapeHtml(projectTitle)}</h1></td></tr>
  <tr><td style="padding:8px 30px 14px;color:#374151;line-height:1.6;font-size:14px;">${escapeHtml(summary)}</td></tr>
  ${flagCount > 0 ? `<tr><td style="padding:0 30px 14px;"><div style="background:#fef3c7;border:1px solid #fde68a;border-radius:8px;padding:10px 12px;color:#92400e;font-size:13px;"><strong>${flagCount}</strong> flag${flagCount === 1 ? '' : 's'} to review${highRedFlags ? `, including <strong>${highRedFlags} High</strong> severity` : ''}.</div></td></tr>` : ''}
  <tr><td align="center" style="padding:4px 30px 28px;"><a href="${escapeHtml(reviewUrl)}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:12px 22px;border-radius:9px;font-weight:700;font-size:14px;">Review the brief</a></td></tr>
  <tr><td style="padding:18px 30px 28px;border-top:1px solid #eeeef0;font-size:11px;color:#9ca3af;">Submitted ${new Date(submission.submitted_at || Date.now()).toLocaleString()}</td></tr>
</table></body></html>`

  await resend.emails.send({
    from: 'DesignBrief AI <onboarding@resend.dev>',
    to: designerEmail,
    subject: `New brief: ${projectTitle}`,
    html,
    text: `${projectTitle}\n\n${summary}\n\n${flagCount > 0 ? `${flagCount} flag${flagCount === 1 ? '' : 's'} to review.\n\n` : ''}Review: ${reviewUrl}`,
  })
}

function summaryFromV2(v2) {
  if (!v2?.sections) return 'A new client submission is ready for review.'
  let core = '', intent = ''
  for (const s of v2.sections) {
    for (const it of s.items) {
      if (it.key === 'core_problem_clarity' && typeof it.content === 'string') core = it.content
      if (it.key === 'project_intent' && typeof it.content === 'string') intent = it.content
    }
  }
  const out = [core, intent].filter(Boolean).join(' ').trim()
  return out || 'A new client submission is ready for review.'
}

// ────────────────────────────────────────────────────────────────────
// DB helpers
// ────────────────────────────────────────────────────────────────────
async function loadSubmission(id) {
  const { data, error } = await supabase.from('intake_submissions').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return data
}
async function loadForm(id) {
  const { data, error } = await supabase.from('intake_forms').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return data
}
async function setStatus(id, status) { await update(id, { status }) }
async function update(id, patch) {
  const { error } = await supabase.from('intake_submissions').update(patch).eq('id', id)
  if (error) console.warn('[pipeline] update', id, patch, error.message)
}
async function markFailed(id, step, message) {
  await update(id, { status: 'failed', failure_step: step, failure_message: String(message).slice(0, 500) })
}
function finishFailed(id, step, e) {
  console.error('[pipeline] failed at', step, e?.message)
  return markFailed(id, step, e?.message || String(e)).then(() => ({ ok: false, step, error: e?.message }))
}

// ────────────────────────────────────────────────────────────────────
// Claude SDK helpers (server-side; uses Anthropic SDK directly)
// ────────────────────────────────────────────────────────────────────
async function callClaudeJson({ system, user, maxTokens }) {
  const resp = await anthropic.messages.create({
    model: MODEL,
    max_tokens: Math.min(maxTokens || 2000, 8096),
    system,
    messages: [{ role: 'user', content: user }],
  })
  const text = (resp.content || []).filter(b => b?.type === 'text').map(b => b.text).join('\n')
  return text
}
async function callClaudeText({ system, user, maxTokens }) {
  return callClaudeJson({ system, user, maxTokens })
}
function safeJson(text) {
  if (!text) return null
  let s = String(text).trim()
  if (s.startsWith('```')) s = s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim()
  try { return JSON.parse(s) } catch {}
  const first = s.indexOf('{'); const last = s.lastIndexOf('}')
  if (first >= 0 && last > first) { try { return JSON.parse(s.slice(first, last + 1)) } catch {} }
  return null
}
function scrubDashes(v) {
  if (v == null) return v
  if (typeof v === 'string') return v.replace(/\s*—\s*/g, ' ').replace(/\s*–\s*/g, ' ').replace(/—/g, '-').replace(/–/g, '-')
  if (Array.isArray(v)) return v.map(scrubDashes)
  if (typeof v === 'object') { const o = {}; for (const k of Object.keys(v)) o[k] = scrubDashes(v[k]); return o }
  return v
}
function escapeHtml(s) { return String(s || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])) }
function formatAnswer(v) {
  if (v == null || v === '') return '(not answered)'
  if (Array.isArray(v)) {
    if (v.length && typeof v[0] === 'object' && v[0]?.name) return v.map(f => `[file: ${f.name}]`).join(', ')
    return v.join(', ')
  }
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}
function labelForType(id) {
  const m = { website: 'Website or landing page', mobile: 'Mobile app or SaaS product', brand: 'Brand identity', ecommerce: 'E-commerce', redesign: 'Redesign of existing product', custom: 'Custom' }
  return m[id] || 'Project'
}
