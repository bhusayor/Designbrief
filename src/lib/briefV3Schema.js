// ────────────────────────────────────────────────────────────────────
// briefV3Schema.js — Design Intelligence Document (22-section spec).
//
// COMPLETE REWRITE of the v2 framework. The V3 brief is a long-form
// Intelligence Document, not a grid of cards. Every section ships a
// structured visual payload (matrix / scorecard / journey / etc.)
// rather than prose. The renderer in BriefV3View walks this schema
// to build both the chapter nav and the per-section blocks.
//
// SHAPES (each section.shape drives the renderer it gets in V3View):
//   'snapshot'        : K/V grid (Project / Industry / Platform / ...)
//   'scorecard'       : 10 dimensional scores + 5 list columns
//   'state_diagram'   : current → desired with gap + roots + impact
//   'priority_matrix' : Effort × Impact quadrant + reasoning
//   'personas'        : grid of persona cards (mindset / context / goals)
//   'jtbd_canvas'     : 3-column functional / emotional / social jobs
//   'journey_map'     : multi-stage table with emotion curve
//   'flow_chart'      : happy / alt / error path nodes + arrows
//   'tree'            : hierarchical tree (IA, taxonomy)
//   'requirements'    : core / supporting / future + states matrix
//   'nfr_grid'        : non-functional requirements grid
//   'content_strategy': content types + voice rules + microcopy
//   'competitive'     : competitor matrix + patterns + opportunities
//   'principles'      : numbered principles with reasoning chain
//   'visual_direction': mood / color / type / motion strategy
//   'component_inventory': checklist of component types needed
//   'ux_writing'      : voice + tone + per-surface copy patterns
//   'design_tokens'   : color / type / spacing / radius / shadow / motion tokens
//   'tech_considerations': API / backend / auth / perf / integrations
//   'risk_register'   : risk × likelihood × impact × mitigation
//   'success_metrics' : KPI table with target + measurement method
//   'ai_package'      : structured summary for downstream AI builder
//
// REASONING CHAIN: many sections embed a "reasoning" array on key
// recommendations:
//   { recommendation, reason, impact, tradeoffs, confidence }
// The renderer surfaces these as a horizontal strip per recommendation.
// ────────────────────────────────────────────────────────────────────

export const BRIEF_V3_SECTIONS = [
  { id: 1,  key: 'executive_summary',       title: 'Executive Summary',          shape: 'snapshot',           tier: 'open',  description: 'Project at a glance' },
  { id: 2,  key: 'brief_health',            title: 'Brief Health Assessment',    shape: 'scorecard',          tier: 'open',  description: 'How complete the brief is + what is missing' },
  { id: 3,  key: 'problem_definition',      title: 'Problem Definition',         shape: 'state_diagram',      tier: 'discover', description: 'Current → desired state, gap, roots, impact' },
  { id: 4,  key: 'business_intelligence',   title: 'Business Intelligence',      shape: 'priority_matrix',    tier: 'discover', description: 'Business goals, KPIs, constraints, priority matrix' },
  { id: 5,  key: 'user_intelligence',       title: 'User Intelligence',          shape: 'personas',           tier: 'discover', description: 'Primary + secondary users, behaviour, context, needs' },
  { id: 6,  key: 'jobs_to_be_done',         title: 'Jobs To Be Done',            shape: 'jtbd_canvas',        tier: 'discover', description: 'Functional, emotional, and social jobs' },
  { id: 7,  key: 'user_journey',            title: 'User Journey',               shape: 'journey_map',        tier: 'discover', description: 'Stages, actions, emotions, friction, delight' },
  { id: 8,  key: 'user_flows',              title: 'User Flows',                 shape: 'flow_chart',         tier: 'design',   description: 'Happy / alternative / error paths + edge cases' },
  { id: 9,  key: 'information_architecture',title: 'Information Architecture',   shape: 'tree',               tier: 'design',   description: 'Hierarchy, navigation, taxonomy, site map' },
  { id: 10, key: 'functional_requirements', title: 'Functional Requirements',    shape: 'requirements',       tier: 'design',   description: 'Core / supporting / future features + all states' },
  { id: 11, key: 'non_functional_requirements', title: 'Non-Functional Requirements', shape: 'nfr_grid',     tier: 'design',   description: 'Accessibility, performance, security, compliance' },
  { id: 12, key: 'content_strategy',        title: 'Content Strategy',           shape: 'content_strategy',   tier: 'design',   description: 'Types, hierarchy, voice, microcopy patterns' },
  { id: 13, key: 'competitive_landscape',   title: 'Competitive Landscape',      shape: 'competitive',        tier: 'design',   description: 'Patterns, standards, differentiators, anti-patterns' },
  { id: 14, key: 'design_principles',       title: 'Design Principles',          shape: 'principles',         tier: 'direction', description: 'Project-specific principles with reasoning' },
  { id: 15, key: 'visual_direction',        title: 'Visual Direction',           shape: 'visual_direction',   tier: 'direction', description: 'Mood, colour, type, motion, illustration, references' },
  { id: 16, key: 'component_inventory',     title: 'Component Inventory',        shape: 'component_inventory',tier: 'direction', description: 'Every UI component needed' },
  { id: 17, key: 'ux_writing',              title: 'UX Writing Guidelines',      shape: 'ux_writing',         tier: 'direction', description: 'Voice, tone, microcopy per surface' },
  { id: 18, key: 'design_tokens',           title: 'Design System Foundations',  shape: 'design_tokens',      tier: 'direction', description: 'Tokens, breakpoints, naming, layout rules' },
  { id: 19, key: 'tech_considerations',     title: 'Technical Considerations',   shape: 'tech_considerations',tier: 'execution', description: 'APIs, backend, auth, perf, integrations' },
  { id: 20, key: 'risk_assessment',         title: 'Risk Assessment',            shape: 'risk_register',      tier: 'execution', description: 'Risk × likelihood × impact × mitigation' },
  { id: 21, key: 'success_metrics',         title: 'Success Metrics',            shape: 'success_metrics',    tier: 'execution', description: 'Measurable KPIs with targets + methods' },
  { id: 22, key: 'ai_package',              title: 'AI Design Package',          shape: 'ai_package',         tier: 'execution', description: 'Concise everything for the next AI in the chain' },
]

// Chapter tiers used by the document shell to visually group the
// table of contents into stages (Open / Discover / Design / Direct
// / Execute). Mirrors how senior teams actually sequence the work.
export const BRIEF_V3_TIERS = [
  { id: 'open',      label: 'Open',       hint: 'Snapshot + brief health' },
  { id: 'discover',  label: 'Discover',   hint: 'Problem, business, users, journey' },
  { id: 'design',    label: 'Design',     hint: 'Flows, IA, requirements, content, competition' },
  { id: 'direction', label: 'Direction',  hint: 'Principles, visuals, components, tokens, writing' },
  { id: 'execution', label: 'Execute',    hint: 'Tech, risk, metrics, AI package' },
]

export const BRIEF_V3_KEYS = BRIEF_V3_SECTIONS.map(s => s.key)

export const BRIEF_V3_BY_KEY = (() => {
  const map = {}
  for (const s of BRIEF_V3_SECTIONS) map[s.key] = s
  return map
})()

// Keys of the chapters whose translator + renderer are wired. The
// rest render as "Coming next" placeholders so we can ship working
// slices on real briefs incrementally. Phase 1B adds chapters 5-8.
export const BRIEF_V3_WIRED_KEYS = [
  'executive_summary',
  'brief_health',
  'problem_definition',
  'business_intelligence',
  'user_intelligence',
  'jobs_to_be_done',
  'user_journey',
  'user_flows',
  'information_architecture',
  'functional_requirements',
  'non_functional_requirements',
  'content_strategy',
  'competitive_landscape',
  'design_principles',
  'visual_direction',
  'component_inventory',
  'ux_writing',
  'design_tokens',
  'tech_considerations',
  'risk_assessment',
  'success_metrics',
  'ai_package',
]

// Back-compat alias — Dashboard still imports the old name.
export const BRIEF_V3_PHASE_1A_KEYS = BRIEF_V3_WIRED_KEYS

// ────────────────────────────────────────────────────────────────────
// scrubDashes. Same user-mandated rule as V2: NEVER let an em or en
// dash appear in AI output. Walk every string in the shape.
// ────────────────────────────────────────────────────────────────────
export function scrubDashesV3(v) {
  if (v == null) return v
  if (typeof v === 'string') {
    return v
      .replace(/\s*—\s*/g, ' ')
      .replace(/\s*–\s*/g, ' ')
      .replace(/—/g, '-')
      .replace(/–/g, '-')
  }
  if (Array.isArray(v)) return v.map(scrubDashesV3)
  if (typeof v === 'object') {
    const out = {}
    for (const k of Object.keys(v)) out[k] = scrubDashesV3(v[k])
    return out
  }
  return v
}

// Empty content factory so the renderer never crashes on an in-
// progress section. Returns the shape's expected skeleton.
export function emptyV3ContentForShape(shape) {
  switch (shape) {
    case 'snapshot':        return { summary: '', snapshot: {} }
    case 'scorecard':       return { scores: [], strengths: [], weaknesses: [], missing: [], risks: [], questions: [] }
    case 'state_diagram':   return { current_state: '', desired_state: '', gap: '', pain_points: [], root_causes: [], impact: '', opportunities: [], unknowns: [] }
    case 'priority_matrix': return { goals: [], kpis: [], constraints: [], opportunities: [], risks: [], matrix: [] }
    case 'personas':        return { primary: [], secondary: [] }
    case 'jtbd_canvas':     return { functional: [], emotional: [], social: [], outcomes: [], alternatives: [], opportunities: [] }
    case 'journey_map':     return { stages: [] }
    case 'flow_chart':      return { happy_path: [], alternatives: [], error_paths: [], edge_cases: [], decision_points: [] }
    default:                return {}
  }
}

export const BRIEF_V3_SCHEMA_VERSION = 'v3'
