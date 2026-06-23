// ────────────────────────────────────────────────────────────────────
// briefV2Kanban.js, derive kanban cards from a V2 brief result.
//
// Phase 3 of the 21-item framework. Per spec:
//   - Item 4 (Deliverables Definition) is the source of truth for
//     what gets a card. One entry → one card. Card title is the
//     page name only, clean.
//   - Each card's description is auto-built from items 1, 2 (page
//     purpose), 5, 6 (user context + journey), 14 (emotion at this
//     stage), 7 (success condition), 20 (constraints), 21 (content +
//     asset status for this specific page).
//   - Blocked status comes from items 9, 10, 11, when a Red Flag
//     of High severity, an Assumption marked Needs Clarification,
//     or an open Question mentions the page name (or maps to "this
//     page" / "all pages"), the card is flagged blocked with the
//     reason. Build with AI is disabled until resolved.
//   - The shared designSystem reference rides along on every card
//     so Phase 4's AI builder picks it up off card.design_system.
//
// No AI call. Deterministic. Runs at translation time so the cards
// are persisted with the brief and "Build Board" just shows them.
// ────────────────────────────────────────────────────────────────────

const uid = () => Math.random().toString(36).slice(2, 10)

// ────────────────────────────────────────────────────────────────────
// buildKanbanFromV2(v2Result) → { tasks: [...] }
// Returns the same shape TeamCollab's existing setKanban call
// expects, so we can swap this in for generateKanban with no
// downstream changes.
// ────────────────────────────────────────────────────────────────────
export function buildKanbanFromV2(v2Result, opts = {}) {
  if (!v2Result?.sections) return { tasks: [] }
  const itemsByKey = flattenItems(v2Result)

  const deliverables = normalizeList(itemsByKey.deliverables)
  if (!deliverables.length) return { tasks: [] }

  const userJourney        = normalizeJourney(itemsByKey.user_journey)
  const emotionalDirection = normalizeJourney(itemsByKey.emotional_direction)
  const inventory          = Array.isArray(itemsByKey.content_inventory) ? itemsByKey.content_inventory : []
  const constraints        = normalizeList(itemsByKey.scope_constraints)
  const redFlags           = Array.isArray(itemsByKey.red_flags?.items) ? itemsByKey.red_flags.items : []
  const assumptions        = Array.isArray(itemsByKey.assumptions_log?.items) ? itemsByKey.assumptions_log.items : []
  const questions          = Array.isArray(itemsByKey.questions) ? itemsByKey.questions : []

  const corePurpose       = stringField(itemsByKey.core_problem_clarity)
  const projectIntent     = stringField(itemsByKey.project_intent)
  const targetAudience    = stringField(itemsByKey.target_audience)
  const successDefinition = stringField(itemsByKey.success_definition)
  const designSystem      = v2Result.designSystem || null

  const tasks = deliverables.map((page, idx) => {
    // Match this page to its emotional-arc stage. The translator
    // emits emotionalDirection mirroring the user_journey step
    // titles, so we prefer name match → falls back to index → falls
    // back to first stage.
    const journeyStep = matchJourneyStage(page, userJourney, idx)
    const emotionStep = matchJourneyStage(page, emotionalDirection, idx) || journeyStep
    const inventoryEntry = inventory.find(i => sameName(i.page, page))
    const blocks = detectBlocks({ page, redFlags, assumptions, questions })

    const description = composeDescription({
      page,
      corePurpose,
      projectIntent,
      targetAudience,
      journeyStep,
      emotionStep,
      successDefinition,
      inventoryEntry,
      constraints,
      designSystem,
    })

    return {
      id: uid(),
      title: page,
      description,
      column_name: 'todo',
      column: 'todo',
      position: idx,
      estimated_days: 2,
      status: blocks.length ? 'blocked' : 'todo',
      blocked: blocks.length > 0,
      blocked_reasons: blocks,
      // Phase 4 hook: every card carries the design system reference
      // so the AI builder can splice designSystemToContextBlock(ds)
      // ahead of its system prompt.
      design_system: designSystem,
      // V2 metadata so downstream code (TeamCollab, Phase 4 builder,
      // Phase 6 PDF) can tell a V2-generated card from a legacy one.
      schemaVersion: 'v2',
      v2: {
        page,
        journeyStep,
        emotionStep,
        inventoryEntry: inventoryEntry || null,
        relevantConstraints: pickRelevantConstraints(page, constraints),
      },
    }
  })

  return {
    tasks,
    projectTimeline: opts.projectTimeline || 'Auto-derived from brief',
    designSystem,
  }
}

// ── Helpers ─────────────────────────────────────────────────────────

function flattenItems(v2Result) {
  const out = {}
  for (const s of v2Result.sections || []) {
    for (const it of s.items || []) {
      out[it.key] = it.content
    }
  }
  return out
}

function stringField(v) {
  if (v == null) return ''
  if (typeof v === 'string') return v
  if (Array.isArray(v)) return v.join(' ')
  return JSON.stringify(v)
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

function sameName(a, b) {
  return normalizeName(a) === normalizeName(b)
}
function normalizeName(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function matchJourneyStage(page, journey, idx) {
  if (!journey.length) return null
  const pageN = normalizeName(page)
  // Direct title contains / contained match
  const match = journey.find(j => {
    const jN = normalizeName(j.title)
    if (!jN) return false
    return pageN.includes(jN) || jN.includes(pageN)
  })
  if (match) return match
  // Index match if the journey has the same shape as the deliverables
  if (journey[idx]) return journey[idx]
  return journey[0]
}

// Blocked detection: a Red Flag of High severity, an Assumption of
// Needs Clarification, or an unanswered Question is treated as a
// block if it explicitly mentions the page name OR uses generic
// language like "all pages", "every screen", "this product".
function detectBlocks({ page, redFlags, assumptions, questions }) {
  const blocks = []
  const pageN = normalizeName(page)
  const isGeneric = (text) => /all (pages|screens)|every (page|screen)|the whole|across the site|product wide/i.test(text || '')
  const mentions = (text) => {
    if (!text) return false
    const t = normalizeName(text)
    if (!pageN) return false
    return t.includes(pageN) || isGeneric(text)
  }

  for (const f of redFlags) {
    if ((f.severity || '').toLowerCase() === 'high' && mentions(f.text)) {
      blocks.push({ type: 'red_flag', severity: 'High', text: f.text })
    }
  }
  for (const a of assumptions) {
    if ((a.status || '').toLowerCase() === 'needs clarification' && mentions(a.text)) {
      blocks.push({ type: 'assumption', status: 'Needs Clarification', text: a.text })
    }
  }
  for (const q of questions) {
    if (mentions(q)) blocks.push({ type: 'question', text: q })
  }
  return blocks
}

function pickRelevantConstraints(page, constraints) {
  if (!constraints.length) return []
  const pageN = normalizeName(page)
  return constraints.filter(c => {
    const cN = normalizeName(c)
    return pageN && (cN.includes(pageN) || /all|every|across|product/i.test(c))
  })
}

// ────────────────────────────────────────────────────────────────────
// composeDescription, builds the markdown body of the kanban card.
// Pulls from the items spelled out in the spec. Plain-text markdown;
// renderer in TeamCollab already handles it.
// ────────────────────────────────────────────────────────────────────
function composeDescription({
  page,
  corePurpose, projectIntent,
  targetAudience,
  journeyStep, emotionStep,
  successDefinition,
  inventoryEntry,
  constraints,
  designSystem,
}) {
  const lines = []

  lines.push(`**Page purpose**`)
  if (corePurpose)   lines.push(corePurpose)
  if (projectIntent) lines.push('', projectIntent)

  lines.push('', `**User context**`)
  if (targetAudience) lines.push(targetAudience)
  if (journeyStep) {
    lines.push('', `At this point in the journey: ${journeyStep.title}.`)
    if (journeyStep.action) lines.push(`What the user is doing: ${journeyStep.action}`)
  }

  if (emotionStep?.emotion) {
    lines.push('', `**Emotional direction**`)
    lines.push(`The user should feel: ${emotionStep.emotion}.`)
  }

  lines.push('', `**Required sections**`)
  lines.push(
    'Design the section order around what the user needs to think, feel, and do here, ' +
    'not a template. The section order must serve the user state at this moment, ' +
    'not a conventional content hierarchy.'
  )
  if (successDefinition) lines.push('', `Success on this page: ${successDefinition}`)

  lines.push('', `**Content + asset status**`)
  if (inventoryEntry) {
    if (inventoryEntry.content) lines.push(`Content: ${inventoryEntry.content}`)
    if (inventoryEntry.assets)  lines.push(`Assets: ${inventoryEntry.assets}`)
    if (inventoryEntry.status)  lines.push(`Status: ${inventoryEntry.status}`)
  } else {
    lines.push(`Inventory: Unknown. Confirm copy and media before build.`)
  }

  const relevant = pickRelevantConstraints(page, constraints)
  if (relevant.length) {
    lines.push('', `**Constraints**`)
    for (const c of relevant) lines.push(`- ${c}`)
  } else if (constraints.length) {
    lines.push('', `**Constraints**`)
    lines.push(`Project-wide boundaries apply. See item 20 in the brief.`)
  }

  if (successDefinition) {
    lines.push('', `**Success condition**`)
    lines.push(successDefinition)
  }

  if (designSystem) {
    lines.push('', `**Design system**`)
    const ds = designSystem
    const parts = []
    if (ds.color?.primary)         parts.push(`Color: ${ds.color.primary}`)
    if (ds.typography?.display)    parts.push(`Typography: ${ds.typography.display}`)
    if (ds.spacing?.density)       parts.push(`Spacing: ${ds.spacing.density}, ${ds.spacing.scale || 'standard'}`)
    if (ds.component?.corner_radius) parts.push(`Corners: ${ds.component.corner_radius}`)
    if (ds.motion?.speed)          parts.push(`Motion: ${ds.motion.speed}`)
    if (parts.length) lines.push(parts.join('\n'))
    lines.push('', `(Full design system is attached. The AI builder will apply it consistently.)`)
  }

  return lines.join('\n').replace(/—/g, '-').replace(/–/g, '-')
}
