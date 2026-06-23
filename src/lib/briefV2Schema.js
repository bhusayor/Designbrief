// ────────────────────────────────────────────────────────────────────
// briefV2Schema.js, single source of truth for the 21-item brief
// translation framework.
//
// 5 sections, 21 items. Each item has:
//   id     , its global item number (1..21) shown on the card chip
//   key    , stable identifier the AI must echo back in its JSON
//   title  , human-readable card title
//   shape  , what the AI returns for this item's `content`:
//             'text'           plain prose paragraph
//             'list'           simple bulleted list of strings
//             'rows'           two-column rows ({ left, right })
//             'badged_list'    list of { text, status } where status is
//                              constrained to one of `statuses`
//             'numbered_list'  ordered, priority-implied list of strings
//             'roles'          per-role colour intent map
//             'levels'         per-type-level intent map
//             'journey'        ordered steps with emotional state
//             'competitors'    list of { name, positioning, layout }
//             'inventory'      per-page content + asset breakdown
//   statuses (optional), allowed status tags for `badged_list` rows
//
// The renderer in BriefV2View reads this map at runtime, so adding /
// renaming an item is one entry here + one mini renderer per shape.
// ────────────────────────────────────────────────────────────────────

export const BRIEF_V2_SECTIONS = [
  {
    id: 'understand',
    label: 'Understand the problem first',
    items: [
      { id: 1, key: 'core_problem_clarity', title: 'Core Problem Clarity', shape: 'text' },
      { id: 2, key: 'project_intent',       title: 'Project Intent',        shape: 'text' },
      { id: 3, key: 'business_context',     title: 'Business Context',      shape: 'text' },
      { id: 4, key: 'deliverables',         title: 'Deliverables Definition', shape: 'list' },
      { id: 5, key: 'target_audience',      title: 'Target Audience',       shape: 'text' },
      { id: 6, key: 'user_journey',         title: 'User Journey Snapshot', shape: 'journey' },
      { id: 7, key: 'success_definition',   title: 'Success Definition',    shape: 'text' },
    ],
  },
  {
    id: 'interrogate',
    label: 'Interrogate the brief',
    items: [
      { id: 8,  key: 'wants_vs_needs',  title: 'Wants vs. Needs Breakdown', shape: 'rows' },
      { id: 9,  key: 'assumptions_log', title: 'Assumptions Log',
        shape: 'badged_list',
        statuses: ['Confirmed', 'Unconfirmed', 'Needs Clarification'] },
      { id: 10, key: 'red_flags',       title: 'Red Flags',
        shape: 'badged_list',
        statuses: ['High', 'Medium', 'Low'] },
      { id: 11, key: 'questions',       title: 'Questions for Your Client', shape: 'numbered_list' },
    ],
  },
  {
    id: 'direction',
    label: 'Define the direction',
    items: [
      { id: 12, key: 'brand_personality',    title: 'Brand Personality',     shape: 'list' },
      { id: 13, key: 'tone_mood',            title: 'Tone & Mood',           shape: 'text' },
      { id: 14, key: 'emotional_direction',  title: 'Emotional Direction',   shape: 'journey' },
      { id: 15, key: 'color_direction',      title: 'Color Direction',       shape: 'roles' },
      { id: 16, key: 'typography_direction', title: 'Typography Direction',  shape: 'levels' },
      { id: 17, key: 'moodboard_direction',  title: 'Moodboard Direction',   shape: 'moodboard' },
    ],
  },
  {
    id: 'landscape',
    label: 'Situate in the landscape',
    items: [
      { id: 18, key: 'reference_audit',     title: 'Reference Audit',     shape: 'text' },
      { id: 19, key: 'competitor_analysis', title: 'Competitor Analysis', shape: 'competitors' },
    ],
  },
  {
    id: 'boundaries',
    label: 'Lock the boundaries',
    items: [
      { id: 20, key: 'scope_constraints',   title: 'Scope & Constraints',          shape: 'list' },
      { id: 21, key: 'content_inventory',   title: 'Content & Asset Inventory',    shape: 'inventory' },
    ],
  },
]

// Flat lookup: key → item descriptor (with section back-pointer).
export const BRIEF_V2_ITEM_BY_KEY = (() => {
  const map = {}
  for (const s of BRIEF_V2_SECTIONS) {
    for (const it of s.items) {
      map[it.key] = { ...it, sectionId: s.id, sectionLabel: s.label }
    }
  }
  return map
})()

export const BRIEF_V2_ALL_KEYS = Object.keys(BRIEF_V2_ITEM_BY_KEY)

// Section grouping helper used by translator. Returns the 4-7 items
// in each section the AI must produce when prompted for that section.
export function itemsForSection(sectionId) {
  return BRIEF_V2_SECTIONS.find(s => s.id === sectionId)?.items || []
}

// ────────────────────────────────────────────────────────────────────
// scrubDashes. User-mandated: NEVER let an em (U+2014) or en (U+2013)
// dash appear in AI-generated output. Walk every string in the shape
// and replace. Numbers / booleans / null pass through.
//
// Regexes use \u escapes so the bytes can't be mass-replaced by a
// codebase-wide dash purge.
// ────────────────────────────────────────────────────────────────────
export function scrubDashes(v) {
  if (v == null) return v
  if (typeof v === 'string') {
    return v
      .replace(/\s*—\s*/g, ' ')
      .replace(/\s*–\s*/g, ' ')
      .replace(/—/g, '-')
      .replace(/–/g, '-')
  }
  if (Array.isArray(v)) return v.map(scrubDashes)
  if (typeof v === 'object') {
    const out = {}
    for (const k of Object.keys(v)) out[k] = scrubDashes(v[k])
    return out
  }
  return v
}

// ────────────────────────────────────────────────────────────────────
// Empty content factories, used by the renderer to stub items that
// haven't streamed in yet so the layout doesn't jump when they land.
// ────────────────────────────────────────────────────────────────────
export function emptyContentForShape(shape) {
  switch (shape) {
    case 'text':          return ''
    case 'list':          return []
    case 'rows':          return { rows: [] }
    case 'badged_list':   return { items: [] }
    case 'numbered_list': return []
    case 'roles':         return { primary: '', secondary: '', accent: '', background: '', surface: '', avoid: '' }
    case 'levels':        return { display: '', body: '', label: '', avoid: '' }
    case 'journey':       return []
    case 'competitors':   return []
    case 'inventory':     return []
    default:              return null
  }
}

export const BRIEF_V2_SCHEMA_VERSION = 'v2'
