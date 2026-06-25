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
  // ── Product Decisions ────────────────────────────────────────────
  // Senior-level calls about WHAT to build before we get into the
  // visual + structural territory. Sits between Understand and
  // Interrogate so the Reality Check has features to react to.
  {
    id: 'product_decisions',
    label: 'Product decisions',
    items: [
      { id: 22, key: 'features_hierarchy', title: 'Feature Hierarchy', shape: 'features_hierarchy' },
      { id: 23, key: 'positioning',         title: 'Positioning & Advantage', shape: 'text' },
      { id: 24, key: 'trust_strategy',      title: 'Trust Strategy',  shape: 'text' },
    ],
  },
  {
    id: 'direction',
    label: 'Define the direction',
    items: [
      { id: 12, key: 'brand_personality',          title: 'Brand Personality',          shape: 'list' },
      { id: 13, key: 'tone_mood',                  title: 'Tone & Mood',                shape: 'text' },
      { id: 25, key: 'design_personality_ratings', title: 'Design Personality Profile', shape: 'star_ratings' },
    ],
  },
  // ── Color Strategy ──────────────────────────────────────────────
  // Pulled out of Direction into its own section so the deep analysis
  // (psychology, why-it-fits-X, semantic palette, default theme rec)
  // gets the real estate it deserves.
  {
    id: 'color_strategy',
    label: 'Color strategy',
    items: [
      { id: 15, key: 'color_direction', title: 'Color Strategy', shape: 'roles' },
    ],
  },
  // ── Typography System ────────────────────────────────────────────
  // Same treatment: extracted so display/heading/body/mono can each
  // have a real card + the weights table + per-device type scale.
  {
    id: 'typography_system',
    label: 'Typography system',
    items: [
      { id: 16, key: 'typography_direction', title: 'Typography System', shape: 'levels' },
    ],
  },
  {
    id: 'landscape',
    label: 'Situate in the landscape',
    items: [
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
  // ── System Foundations ──────────────────────────────────────────
  // The mechanical underpinnings every screen leans on: spacing
  // scale, grid system, component primitives. One section, three
  // crisp items so the foundations don't sprawl.
  {
    id: 'system_foundations',
    label: 'System foundations',
    items: [
      { id: 29, key: 'spacing_system',   title: 'Spacing System',   shape: 'spacing_scale' },
      { id: 30, key: 'grid_system',      title: 'Grid System',      shape: 'grid_system' },
      { id: 31, key: 'component_system', title: 'Component System', shape: 'component_system' },
    ],
  },
  // ── Visual Language ─────────────────────────────────────────────
  // Photography, illustration, icon, motion, empty + loading state
  // direction in one card. Saves having seven tiny separate cards.
  {
    id: 'visual_language',
    label: 'Visual language',
    items: [
      { id: 32, key: 'visual_language', title: 'Visual Language', shape: 'visual_language' },
    ],
  },
  // ── Inspiration Library ─────────────────────────────────────────
  // Categorised inspiration refs (layout / motion / dashboard / etc),
  // each with product name + what-to-borrow / what-to-avoid / why.
  {
    id: 'inspiration_library',
    label: 'Inspiration library',
    items: [
      { id: 33, key: 'inspiration_library', title: 'Inspiration Library', shape: 'inspiration_grid' },
    ],
  },
  // ── Builder Guidance ────────────────────────────────────────────
  // Per-feature build instructions: purpose, value (user + business),
  // required components, success criteria, failure conditions.
  // Drives the downstream AI builder pipeline.
  {
    id: 'builder_guidance',
    label: 'Builder guidance',
    items: [
      { id: 34, key: 'ai_builder_guidance', title: 'AI Builder Guidance', shape: 'builder_guidance' },
    ],
  },
  // ── Build Priorities ────────────────────────────────────────────
  // Three-phase build plan with explicit business impact per phase.
  // Lands right before the verdict so the closing memo can reference
  // the build sequence.
  {
    id: 'build_priorities',
    label: 'Build priorities',
    items: [
      { id: 27, key: 'build_phases', title: 'Build Phases', shape: 'phases' },
    ],
  },
  // ── Section 6: Director's Verdict ────────────────────────────────
  // The decisive editorial close. Designers / clients read this first
  // when they only have 60 seconds with the brief. Renders as a
  // single rich 'verdict' card (key-targeted custom renderer).
  {
    id: 'verdict',
    label: "Director's verdict",
    items: [
      { id: 28, key: 'director_verdict', title: "Director's Verdict", shape: 'verdict' },
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
    case 'verdict':       return {}
    case 'moodboard':     return {}
    case 'features_hierarchy': return { core: [], supporting: [], enhancement: [], deprioritize: [] }
    case 'ranked_list':   return []
    case 'phases':        return []
    case 'star_ratings':  return []
    case 'spacing_scale': return { scale: [], rationale: '' }
    case 'grid_system':   return {}
    case 'component_system': return {}
    case 'visual_language':  return {}
    case 'inspiration_grid': return []
    case 'builder_guidance': return []
    default:              return null
  }
}

export const BRIEF_V2_SCHEMA_VERSION = 'v2'
