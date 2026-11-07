// ────────────────────────────────────────────────────────────────────
// /api/build-section, streams ONE HTML section for the AI Builder
// (Phase 2). Server-side so the platform OpenAI API key never
// reaches the browser. Streams SSE events; the client appends each
// delta into a srcDoc iframe for the typewriter live preview.
//
// Body (POST):
//   {
//     build_id:        uuid (required)
//     section_id:      uuid of build_sections row to write into (required)
//     task_title:      string (required)
//     task_description?: string
//     task_ai_prompt?:   string
//     brief_context:     object  (output of compactBriefForPrompt)
//     previous_titles:   string[] (already-approved section titles, in order)
//     total_tasks:       integer
//     change_request?:   string   (when re-running after Request Changes)
//   }
//
// On stream end the section row is updated:
//   generated_code = full HTML
//   status         = 'review'
//   built_at       = now()
// ────────────────────────────────────────────────────────────────────

import { createClient } from '@supabase/supabase-js'
import { SECTION_BUILDER_SYSTEM } from '../src/lib/aiSystemPrompts.js'
import { mapOpenAIError } from '../server-lib/openaiError.js'
import { streamCodexAgent } from '../server-lib/openai.js'
import { setCors } from '../server-lib/cors.js'
import { MODEL_FOR } from '../src/lib/models.js'
import { checkRateLimit, logUsage, requireProPlan } from '../server-lib/authMiddleware.js'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
)

// CORS now goes through the shared origin-checked helper.

export default async function handler(req, res) {
  setCors(req, res)
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).end()

  const authHeader = req.headers.authorization || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!token) return res.status(401).json({ error: 'Missing Authorization header' })
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
  if (authErr || !user) return res.status(401).json({ error: 'Invalid session' })
  if (!await requireProPlan(supabase, user.id, res)) return
  if (!await checkRateLimit(supabase, user.id, res)) return

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'OPENAI_API_KEY not configured' })

  const {
    build_id,
    section_id,
    task_title,
    task_description,
    task_ai_prompt,
    brief_context,
    design_system_context,
    v2_card_context,
    blocked,
    blocked_reasons,
    previous_titles,
    total_tasks,
    change_request,
    media_html,
    gsap_html,
  } = req.body || {}

  if (!build_id || !section_id || !task_title) {
    return res.status(400).json({ error: 'build_id, section_id, task_title required' })
  }
  const payloadChars = JSON.stringify({
    task_description,
    task_ai_prompt,
    brief_context,
    design_system_context,
    v2_card_context,
    blocked_reasons,
    previous_titles,
    change_request,
    media_html,
    gsap_html,
  }).length
  if (
    String(task_title).length > 500
    || payloadChars > 600000
    || (Array.isArray(previous_titles) && previous_titles.length > 50)
  ) {
    return res.status(413).json({ error: 'builder_payload_too_large', message: 'Builder input is too large.' })
  }

  // Phase 4, refuse blocked cards before billing tokens. The V2
  // kanban marks a card blocked when a High Red Flag, an Unconfirmed
  // assumption, or an open Question would affect this page.
  if (blocked === true) {
    const reasons = Array.isArray(blocked_reasons) && blocked_reasons.length
      ? blocked_reasons.map(r => `  - ${r.type || 'block'}: ${r.text || ''}`).join('\n')
      : '  - The card is flagged blocked but no reasons were attached'
    return res.status(400).json({
      error: 'card_blocked',
      message: 'This card is blocked. Resolve the open Red Flag, Assumption, or Question before building.',
      reasons: blocked_reasons || [],
      details: reasons,
    })
  }

  // Verify the caller owns this build before we burn tokens on it.
  const { data: buildRow, error: buildErr } = await supabase
    .from('ai_builds')
    .select('id, user_id')
    .eq('id', build_id)
    .maybeSingle()
  if (buildErr || !buildRow || buildRow.user_id !== user.id) {
    return res.status(403).json({ error: 'Build not found or not yours' })
  }

  // Mark section as building so other tabs see the state live.
  await supabase
    .from('build_sections')
    .update({ status: 'building', change_request: change_request || null })
    .eq('id', section_id)

  const previousList = Array.isArray(previous_titles) && previous_titles.length
    ? previous_titles.map((t, i) => `  ${i + 1}. ${t}`).join('\n')
    : '  (none, this is the first section)'

  const briefJSON = brief_context ? JSON.stringify(brief_context, null, 2) : '{}'

  // V2 card context, when the card came from a 21-item brief, it
  // carries its mapped journey + emotion stage so the builder can
  // anchor Rule 1 (structure from emotional arc) and Rule 2 (section
  // order from success definition) without re-parsing the brief.
  const v2ContextLines = []
  if (v2_card_context) {
    v2ContextLines.push('THIS PAGE IN THE USER JOURNEY (anchor for Rule 1 + Rule 2):')
    if (v2_card_context.journeyStep) {
      const j = v2_card_context.journeyStep
      v2ContextLines.push(`  Stage: ${j.title || ''}`)
      if (j.action)  v2ContextLines.push(`  What the user is doing here: ${j.action}`)
    }
    if (v2_card_context.emotionStep?.emotion) {
      v2ContextLines.push(`  Emotion the user should feel: ${v2_card_context.emotionStep.emotion}`)
    }
    if (v2_card_context.inventoryEntry) {
      const inv = v2_card_context.inventoryEntry
      if (inv.content) v2ContextLines.push(`  Content brief: ${inv.content}`)
      if (inv.assets)  v2ContextLines.push(`  Assets brief: ${inv.assets}`)
      if (inv.status)  v2ContextLines.push(`  Inventory status: ${inv.status}`)
    }
    if (Array.isArray(v2_card_context.relevantConstraints) && v2_card_context.relevantConstraints.length) {
      v2ContextLines.push('  Constraints that apply to this page:')
      for (const c of v2_card_context.relevantConstraints) v2ContextLines.push(`    - ${c}`)
    }
    v2ContextLines.push('')
  }

  const userPrompt = [
    'You are building a website section by section.',
    '',
    // Design system block, when the user has saved one for this
    // project via DesignSystemPanel, it sits above the brief context
    // so the AI reads tokens (colors, fonts, button shape, motion,
    // shadow tint, etc.) as load-bearing constraints. Falls through
    // silently when no design system exists yet.
    design_system_context ? design_system_context : null,
    design_system_context ? '' : null,
    'PROJECT BRIEF CONTEXT (the strategic brief, combine with the design system above):',
    briefJSON,
    '',
    v2ContextLines.length ? v2ContextLines.join('\n') : null,
    'SECTIONS ALREADY APPROVED, in order (design this section to flow from the previous one AND ensure its structure does NOT repeat any of theirs per Rule 6):',
    previousList,
    '',
    `NOW BUILD THIS SECTION (${(Array.isArray(previous_titles) ? previous_titles.length : 0) + 1} of ${total_tasks || '?'}):`,
    `Task: ${task_title}`,
    task_description ? `Description: ${task_description}` : '',
    task_ai_prompt ? `Creative direction (treat as load-bearing):\n${task_ai_prompt}` : '',
    media_html
      ? `\nMEDIA ALREADY PREPARED, embed this HTML verbatim in the correct position (do NOT generate your own background; use this as the layered background of the section):\n"""\n${media_html}\n"""\nPlace your hero content with z-index: 2 or higher so it sits above the prepared media.`
      : '',
    gsap_html
      ? `\nGSAP REVEAL SCRIPT, include this at the END of your section so scroll-triggered animations work. Add these data-* attributes to elements you want animated:\n  data-hero-headline → on-load dramatic reveal\n  data-hero-sub → on-load fade up (delayed)\n  data-hero-cta → on-load scale-in (delayed)\n  data-reveal → scroll fade-up\n  data-stagger → stagger immediate children on scroll\n  data-text-reveal → scroll dramatic reveal\n  data-scale-in → scroll scale-in\nUse the attributes liberally on headlines, CTAs, feature grids, etc.\n\nScript to inject at the bottom of the section:\n"""\n${gsap_html}\n"""`
      : '',
    change_request
      ? `\nCHANGE REQUEST FROM DESIGNER (override the previous attempt):\n"""\n${change_request}\n"""\nRebuild this section incorporating these changes. Keep everything else true to the brief.`
      : '',
    '',
    'Return ONLY the HTML for this section per the output contract above. Start with the root element, end with its closing tag, inline all CSS in a single scoped <style> at the top.',
  ].filter(Boolean).join('\n')

  // The website builder is intentionally isolated on the managed Codex
  // harness. Everything else in the product uses direct Responses calls.
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  if (typeof res.flushHeaders === 'function') res.flushHeaders()

  let fullText = ''
  let errored = false

  try {
    const result = await streamCodexAgent({
      apiKey,
      model: MODEL_FOR.website_builder,
      instructions: SECTION_BUILDER_SYSTEM,
      input: userPrompt,
      reasoningEffort: 'medium',
      spendLimitCents: 50,
      onText: delta => {
        fullText += delta
        res.write(`data: ${JSON.stringify({ text: delta })}\n\n`)
      },
    })
    if (!fullText) fullText = result.text
    await logUsage(supabase, user.id, 'website_builder', fullText.length)
  } catch (e) {
    errored = true
    const { body } = mapOpenAIError(e, '[build-section]')
    res.write(`data: ${JSON.stringify(body)}\n\n`)
  }

  // Persist what we got. Even on partial output the user can decide
  // to Request Changes or Skip.
  const cleaned = stripFencesAndPreamble(fullText)
  try {
    await supabase
      .from('build_sections')
      .update({
        generated_code: cleaned,
        status: cleaned ? 'review' : 'queued',
        built_at: new Date().toISOString(),
      })
      .eq('id', section_id)
  } catch (e) {
    console.error('[build-section] persist failed:', e)
  }

  res.write(`data: ${JSON.stringify({ done: true, length: cleaned.length, errored })}\n\n`)
  res.end()
}

// Models sometimes wrap output in ```html fences despite the contract.
// Strip them defensively so the iframe doesn't render the backticks.
function stripFencesAndPreamble(s) {
  if (!s) return ''
  let out = String(s).trim()
  out = out.replace(/^```(?:html|HTML)?\s*/m, '').replace(/\s*```\s*$/m, '').trim()
  // Drop any text before the first opening tag.
  const firstTag = out.search(/<\s*(section|header|footer|nav|div|main|article)\b/i)
  if (firstTag > 0) out = out.slice(firstTag)
  return out
}
