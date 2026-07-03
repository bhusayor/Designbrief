// ────────────────────────────────────────────────────────────────────
// briefV3Backlog.js — Phase 2 engine.
//
// Reads a completed V3 Design Intelligence Document and produces a
// structured implementation backlog: Inventory → Epics → Stories,
// each item carrying priority + dependencies + classification.
//
// PHASE A (this commit): 3 sequential AI calls.
//   1. INVENTORY — pages, modules, components, roles, entities,
//      integrations. Inferred items flagged.
//   2. EPICS — group inventory into 5-12 epics. Each epic ships
//      priority + dependencies + included pages/modules.
//   3. STORIES — generate user stories per epic in JTBD-adjacent
//      "As a / I want / so that" format with acceptance signals.
//
// PHASE B (next): adds tasks + subtasks + acceptance criteria +
// labels + assignee roles + complexity per task. Same orchestrator
// pattern.
//
// Output is stable JSON the UI walks to render the backlog and
// downstream consumers (PDF export, Jira/Linear sync) can ingest.
// ────────────────────────────────────────────────────────────────────

import { callClaude } from './claudeApi.js'
import { scrubDashes as scrubDashesV3, safeJsonParse } from './textUtils.js'

export const BACKLOG_VERSION = 'v1'

// ────────────────────────────────────────────────────────────────────
// System prompt — the AI is a Principal Product Architect, not a
// designer. Different posture than the brief translator.
// ────────────────────────────────────────────────────────────────────
const BASE_SYSTEM = `You are a Principal Product Architect, Senior Technical Product Manager, Software Architect, UX Architect, Systems Analyst, Scrum Master, and AI Planning Engine with 20+ years of experience.

Your input is a COMPLETED Design Intelligence Report. It has already been validated. Do NOT reinterpret, summarise, or redesign it. Your only job is to extract every buildable item and convert it into a structured implementation backlog.

GOLDEN RULE: Never produce generic items like "Design Dashboard", "Build Homepage", or "Authentication". Decompose everything. Every page becomes its own epic-aligned unit. Every feature becomes its own story. Inferred items must be flagged explicitly.

OUTPUT RULES (hard constraints):
- Return ONLY valid JSON in the exact shape requested. No prose. No code fences.
- NO em-dashes (—) or en-dashes (–). Use commas, periods, parentheses, or " : " instead.
- Be EXHAUSTIVE: if a page is logically required but not in the report, infer it and set "assumed": true.
- Be SPECIFIC: "User profile editor" beats "Settings". "Stripe webhook handler for subscription events" beats "Backend".
- Be DECISIVE about priority and dependencies; never default to Medium / "none" out of caution.`

// ────────────────────────────────────────────────────────────────────
// 1. INVENTORY — discover everything that needs to exist.
// ────────────────────────────────────────────────────────────────────
const INVENTORY_PROMPT = (brief) => `STAGE 1 of 3: PRODUCT INVENTORY.

Extract every buildable artefact this product requires. Cover the entire surface — public website, application, dashboard, admin, auth, settings, support, notifications, payments, analytics, reports, APIs, integrations, roles, permissions, database entities. If a page or module is logically required but not explicitly mentioned in the report, infer it and set "assumed": true. Mark inferred items honestly — do not over-infer to pad the list.

Return JSON exactly in this shape:
{
  "pages": [
    {
      "id":        "<kebab-case unique id, e.g. 'home', 'auth.login', 'admin.users'>",
      "name":      "<short display name>",
      "category":  "Public website | Application | Auth | Admin | Settings | Support | Marketing | Legal | Errors",
      "purpose":   "<one short line on what this page is for>",
      "assumed":   false
    }
  ],
  "modules": [
    {
      "id":       "<kebab-case>",
      "name":     "<e.g. 'Notifications', 'Bookings'>",
      "category": "Authentication | User management | Content | Payments | Notifications | Reporting | Analytics | Search | Booking | Messaging | Reviews | Favourites | Uploads | Workflow | Automation | AI | Admin | Security | Settings | Profile | Billing | Integrations | Other",
      "purpose":  "<one short line>",
      "assumed":  false
    }
  ],
  "components": [
    {
      "id":       "<kebab-case>",
      "name":     "<concrete component name, e.g. 'Booking calendar', 'Inline price editor'>",
      "category": "Navigation | Inputs | Surfaces | Data display | Feedback | Overlay | Media | Utility",
      "usage":    "Heavy | Moderate | Light",
      "assumed":  false
    }
  ],
  "roles": [
    {
      "id":      "<kebab-case>",
      "name":    "<role name, e.g. 'Guest', 'Customer', 'Admin', 'Vendor'>",
      "purpose": "<one short line on what this role does>",
      "assumed": false
    }
  ],
  "entities": [
    {
      "id":      "<kebab-case>",
      "name":    "<database entity, e.g. 'User', 'Order', 'Booking', 'Subscription'>",
      "purpose": "<one short line on what it stores>",
      "assumed": false
    }
  ],
  "integrations": [
    {
      "id":     "<kebab-case>",
      "name":   "<service name, e.g. 'Stripe', 'Algolia', 'Twilio'>",
      "type":   "Payment | Auth | Email | SMS | Search | Analytics | CMS | Storage | Other",
      "purpose":"<one short line on what we use it for>",
      "assumed":false
    }
  ]
}

Pages: aim for 12-30 entries covering public + auth + app + admin + errors. Include 404, 500, maintenance pages if not present.
Modules: 6-15 entries.
Components: 15-40 concrete components named for THIS product (no generic "Card", "Input" unless that's literally all that's needed).
Roles: 2-6 roles minimum (Guest is implicit if there's any anonymous browsing).
Entities: 4-12 entities reflecting the data model.
Integrations: only what the report actually requires or strongly implies.

Design Intelligence Report:
${brief}`

// ────────────────────────────────────────────────────────────────────
// 2. EPICS — group inventory into work themes.
// ────────────────────────────────────────────────────────────────────
const EPICS_PROMPT = (brief, inventory) => `STAGE 2 of 3: EPIC GENERATION.

Given the INVENTORY below, group items into 5-12 Epics. Each Epic is a top-level theme that bundles related pages/modules and represents 1-3 sprints of work.

Inventory (from Stage 1):
${JSON.stringify(inventory)}

Return JSON exactly in this shape:
{
  "epics": [
    {
      "id":             "<kebab-case>",
      "name":           "<short epic name, e.g. 'Public marketing site', 'Customer onboarding', 'Admin console'>",
      "description":    "<1-2 sentences on what this epic delivers>",
      "priority":       "Critical | High | Medium | Low",
      "priority_reason":"<one short line on why this priority>",
      "complexity":     "S | M | L | XL",
      "included_pages":   [ "<page id from inventory>" ],
      "included_modules": [ "<module id from inventory>" ],
      "depends_on":      [ "<epic id this depends on, or empty array>" ],
      "blocks":           [ "<epic id this blocks, or empty array>" ],
      "suggested_labels": [ "<label, e.g. 'Website', 'Admin', 'Payments'>" ],
      "lead_role":        "Product | Design | Frontend | Backend | Fullstack | DevOps | QA | Content"
    }
  ]
}

5-12 epics. Every page in the inventory should appear in at least one epic's included_pages. The same goes for modules. depends_on should be DECISIVE (foundation epics before feature epics, auth before app, etc).

Design Intelligence Report:
${brief}`

// ────────────────────────────────────────────────────────────────────
// 3. STORIES — generate user stories per epic.
// ────────────────────────────────────────────────────────────────────
const STORIES_PROMPT = (brief, inventory, epics) => `STAGE 3 of 3: USER STORY GENERATION.

For each epic below, generate 4-8 user stories that cover its included pages + modules. Stories MUST use the format "As a {role}, I want to {action}, so that {outcome}" and ship with a clear acceptance signal a QA can verify.

Epics:
${JSON.stringify(epics)}

Available roles: ${JSON.stringify(inventory?.roles?.map(r => r.name) || ['User'])}

Return JSON exactly in this shape:
{
  "stories": [
    {
      "id":               "<kebab-case unique id>",
      "epic_id":          "<id of the epic this belongs to>",
      "as":               "<role name>",
      "want":             "<action the role wants to take>",
      "so_that":          "<outcome the role gets>",
      "acceptance_signal":"<one short line that QA can verify (binary yes/no)>",
      "related_pages":    [ "<page id from inventory>" ],
      "related_components": [ "<component id from inventory>" ],
      "priority":         "Critical | High | Medium | Low",
      "complexity":       "XS | S | M | L | XL",
      "depends_on":       [ "<other story id, or empty array>" ],
      "labels":           [ "<label tag>" ]
    }
  ]
}

For each epic: 4-8 stories. Cover the HAPPY PATH first, then critical edge cases (auth fail, payment decline, empty states, permission denied). Reject stories that just restate the page name; every story must describe a USER ACTION + USER OUTCOME.

Design Intelligence Report:
${brief}`

// ────────────────────────────────────────────────────────────────────
// generateBacklogV3 — top-level orchestrator.
//
// onStage(stageName, result) fires after each call resolves so the
// UI can render partial state.
// ────────────────────────────────────────────────────────────────────
export async function generateBacklogV3(briefResult, { onStage } = {}) {
  if (!briefResult || !Array.isArray(briefResult.sections)) {
    throw new Error('generateBacklogV3: invalid brief result, expected V3 sections array')
  }
  const briefText = serializeBriefForBacklog(briefResult)
  console.log('[generateBacklogV3] start. brief text length:', briefText.length)

  const startedAt = new Date().toISOString()
  const out = {
    backlogVersion: BACKLOG_VERSION,
    generatedAt: startedAt,
    projectTitle: briefResult.projectTitle || 'Untitled brief',
    inventory: null,
    epics: [],
    stories: [],
  }

  // Stage 1: inventory
  console.log('[generateBacklogV3] stage 1/3 inventory firing')
  const inventoryRaw = await callOnce('inventory', INVENTORY_PROMPT(briefText), 6000)
  out.inventory = inventoryRaw
  console.log('[generateBacklogV3] inventory:', {
    pages: inventoryRaw?.pages?.length || 0,
    modules: inventoryRaw?.modules?.length || 0,
    components: inventoryRaw?.components?.length || 0,
    roles: inventoryRaw?.roles?.length || 0,
  })
  try { onStage?.('inventory', out) } catch {}

  // Stage 2: epics
  console.log('[generateBacklogV3] stage 2/3 epics firing')
  const epicsRaw = await callOnce('epics', EPICS_PROMPT(briefText, out.inventory), 5000)
  out.epics = Array.isArray(epicsRaw?.epics) ? epicsRaw.epics : []
  console.log('[generateBacklogV3] epics:', out.epics.length)
  try { onStage?.('epics', out) } catch {}

  // Stage 3: stories
  console.log('[generateBacklogV3] stage 3/3 stories firing')
  const storiesRaw = await callOnce('stories', STORIES_PROMPT(briefText, out.inventory, out.epics), 7000)
  out.stories = Array.isArray(storiesRaw?.stories) ? storiesRaw.stories : []
  console.log('[generateBacklogV3] stories:', out.stories.length)
  try { onStage?.('stories', out) } catch {}

  out.completedAt = new Date().toISOString()
  console.log('[generateBacklogV3] complete')
  return out
}

async function callOnce(stage, userPrompt, maxTokens, attempt = 0) {
  try {
    const { text } = await callClaude({
      taskType: 'kanban_generation',
      system: BASE_SYSTEM,
      userMessage: userPrompt,
      maxTokens,
    })
    const parsed = safeJsonParse(text)
    if (!parsed || Object.keys(parsed).length === 0) {
      console.error('[generateBacklogV3]', stage, 'parse empty. length:', text?.length, 'first 200:', String(text || '').slice(0, 200))
      throw new Error('parse_empty')
    }
    return scrubDashesV3(parsed)
  } catch (e) {
    const msg = String(e?.message || '').toLowerCase()
    const isRateLimit = msg.includes('429') || msg.includes('rate') || msg.includes('overloaded')
    if (isRateLimit && attempt === 0) {
      console.warn('[generateBacklogV3]', stage, 'rate-limited, retrying after 1500ms')
      await new Promise(r => setTimeout(r, 1500))
      return callOnce(stage, userPrompt, maxTokens, 1)
    }
    throw e
  }
}

// Compact serialisation of the V3 brief for the backlog prompts.
// We send a structured digest (titles + key fields) rather than the
// full nested JSON so the prompt stays well under model context.
function serializeBriefForBacklog(brief) {
  const lines = []
  lines.push(`# ${brief.projectTitle || 'Untitled brief'}`)
  for (const s of brief.sections || []) {
    if (!s.content || s.content.__pending_phase || s.content.__error) continue
    lines.push(`\n## ${s.title}`)
    try {
      const slim = JSON.stringify(s.content)
      // Cap at 2500 chars per chapter so very long chapters
      // (component inventory, functional requirements) don't
      // dominate the prompt. The orchestrator stages reference
      // each other, so per-stage trims happen there too.
      lines.push(slim.length > 2500 ? slim.slice(0, 2500) + '…(truncated)' : slim)
    } catch {}
  }
  return lines.join('\n')
}
// Helper: is this object a valid V3 backlog payload?
export function isV3Backlog(b) {
  return b && b.backlogVersion === BACKLOG_VERSION && Array.isArray(b.epics)
}
