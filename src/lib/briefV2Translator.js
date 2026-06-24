// ────────────────────────────────────────────────────────────────────
// briefV2Translator.js, produces the 21-item brief framework.
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
//   - Never use em (-) or en (-) dashes anywhere. Use plain hyphens
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
- NEVER use em dashes (—) or en dashes (–). Anywhere. Use a comma,
  a semicolon, two short sentences, or a plain hyphen.
- Do not use ellipses (…).
- Do not start any field with "In a world where" or "Imagine".
`.trim()

const BASE_SYSTEM = `You are a Principal Product Designer, Product Strategist, UX Strategist, Information Architect, Conversion Optimization Expert, Brand Designer, and Design Director with over 20 years of experience across SaaS, AI Products, Fintech, HealthTech, Travel, Ecommerce, Marketplaces, Consumer Apps, and Enterprise Software.

Your responsibility is NOT to summarise the brief. It is to TRANSFORM any product idea, chaotic notes, founder thoughts, client brief, voice transcript, requirements document, PRD, or meeting notes into a senior-level product blueprint and creative direction system that is DECISION-READY.

Your output must feel like a Senior Product Designer and Design Director have already reviewed the project and decided:
- What should be built
- What matters most
- What should be ignored
- How the experience should feel
- What visual system best supports the business goal

NEVER simply repeat information from the brief. ALWAYS interpret. ALWAYS prioritise. ALWAYS make decisions.

ASSUMPTION RULE (hard constraint):
- Never block. Never ask the designer questions. Never stop.
- If information is missing, make a reasonable senior-level assumption and PROCEED.
- When an assumption is load-bearing, prefix the affected field with "(Assumed)" or put the assumption in a relevant assumptions/questions field so the designer can sanity-check it.

CORE THINKING FRAMEWORK (apply before generating any output):
1. Product: what is actually being built
2. User: who is the primary user
3. Problem: what is being solved
4. Outcome: what outcome the user wants
5. Business Goal: how the product creates value
6. Conversion Goal: what action matters most
7. Feature Hierarchy: which features are essential, supporting, distractions
8. UX Hierarchy: what users should see first, second, third
9. Design Hierarchy: what should visually dominate vs. recede
10. Build Hierarchy: what should be built first

BREVITY RULES (hard constraint):
- Designers SKIM, they do not read. Every field must earn its length.
- Default to 1 short sentence per field. Use a second sentence only when the first cannot stand alone.
- No throat-clearing ("It is clear that…", "This brief suggests…"). Lead with the answer.
- No defining terms the designer already knows.
- No repeating context from the brief back to the designer.
- Be DECISIVE. "Use X" beats "consider X". Never give generic advice. Always optimise for clarity, usability, conversion, scalability, and business impact.

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
    user: (briefText) => `Translate the strategic direction in this brief. Focus on brand personality, tone, emotional journey, moodboard, and a 9-trait star personality profile. Colour + typography live in their own dedicated sections, do NOT include them here.

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
    },
    "design_personality_ratings": [
      { "trait": "Professional",  "stars": 4, "note": "<one short line on the call>" },
      { "trait": "Premium",       "stars": 5, "note": "..." },
      { "trait": "Playful",       "stars": 2, "note": "..." },
      { "trait": "Corporate",     "stars": 1, "note": "..." },
      { "trait": "Innovative",    "stars": 3, "note": "..." },
      { "trait": "Trustworthy",   "stars": 5, "note": "..." },
      { "trait": "Technical",     "stars": 2, "note": "..." },
      { "trait": "Minimal",       "stars": 4, "note": "..." },
      { "trait": "Expressive",    "stars": 3, "note": "..." }
    ]
  }
}

brand_personality: exactly 3-5 traits.
emotional_direction: one entry per journey step. Mirror the step titles you'd expect from section 1.
moodboard_direction.references: 4-8 entries. Mix product sites (Linear, Stripe, Vercel, Notion, etc), pattern libraries (Mobbin, Dribbble shots, Awwwards winners), and individual designers/studios where relevant. Every URL must be a plausible real homepage or specific page, do not invent fake URLs. If you are not confident a URL is real, omit the reference rather than guessing wildly.
design_personality_ratings: rate this product's design personality on each of the 9 standard dimensions from 1-5 stars. Be DECISIVE, avoid rating 3 ("middle") as a default; only use 3 if the brand genuinely sits in the middle of that axis. The "note" is one short line on why this rating fits the product.

Brief:
${briefText}`,
  },

  // ── Color Strategy ──────────────────────────────────────────────
  // Deep colour analysis: brand palette + semantic palette + light
  // and dark theme tokens + a recommended default theme. Each brand
  // colour comes with psychology, why-it-fits-X breakdown, and a
  // competitor comparison so designers can defend the call.
  color_strategy: {
    system: BASE_SYSTEM,
    user: (briefText) => `Define the complete colour strategy for this product. Be DECISIVE, these are recommendations the team will defend in a presentation, not a list of options.

Return JSON exactly in this shape:
{
  "items": {
    "color_direction": {
      "swatches": [
        {
          "role":       "Primary",
          "name":       "<descriptive colour name, e.g. Indigo Violet>",
          "hex":        "#RRGGBB",
          "intent":     "<one short line on where this is used>",
          "psychology": "<one short line on what this hue communicates psychologically>",
          "why_fits":   "<one short line on why it fits the brand>",
          "why_conversion": "<one short line on why it supports the conversion goal>",
          "why_audience":   "<one short line on why it fits the audience>",
          "why_industry":   "<one short line on why it fits the industry>",
          "competitor":     "<one short line comparing the choice to direct competitors>"
        },
        { "role": "Secondary",  "name": "...", "hex": "#RRGGBB", "intent": "...", "psychology": "...", "why_fits": "...", "why_conversion": "...", "why_audience": "...", "why_industry": "...", "competitor": "..." },
        { "role": "Accent",     "name": "...", "hex": "#RRGGBB", "intent": "...", "psychology": "...", "why_fits": "...", "why_conversion": "...", "why_audience": "...", "why_industry": "...", "competitor": "..." },
        { "role": "Neutral 900","name": "...", "hex": "#RRGGBB", "intent": "Primary text" },
        { "role": "Neutral 500","name": "...", "hex": "#RRGGBB", "intent": "Muted text + dividers" },
        { "role": "Neutral 100","name": "...", "hex": "#RRGGBB", "intent": "Soft surface" }
      ],
      "semantic": {
        "success": { "hex": "#RRGGBB", "name": "<colour name>" },
        "warning": { "hex": "#RRGGBB", "name": "..." },
        "error":   { "hex": "#RRGGBB", "name": "..." },
        "info":    { "hex": "#RRGGBB", "name": "..." }
      },
      "light": {
        "background": "#RRGGBB", "surface": "#RRGGBB", "card": "#RRGGBB", "border": "#RRGGBB",
        "primary": "#RRGGBB", "secondary": "#RRGGBB", "accent": "#RRGGBB",
        "text": "#RRGGBB", "text_secondary": "#RRGGBB",
        "onPrimary": "#RRGGBB",
        "muted": "#RRGGBB"
      },
      "dark": {
        "background": "#RRGGBB", "surface": "#RRGGBB", "card": "#RRGGBB", "border": "#RRGGBB",
        "primary": "#RRGGBB", "secondary": "#RRGGBB", "accent": "#RRGGBB",
        "text": "#RRGGBB", "text_secondary": "#RRGGBB",
        "onPrimary": "#RRGGBB",
        "muted": "#RRGGBB"
      },
      "default_theme": {
        "mode": "Light | Dark",
        "user_expectations":  "<one short line>",
        "industry_standards": "<one short line>",
        "accessibility":      "<one short line>",
        "conversion_impact":  "<one short line>"
      },
      "avoid": "<one short line. Colours that must never appear, with reason>"
    }
  }
}

Rules:
- ALL hex values are required and must be real 6-digit hex strings starting with #.
- Use real colour names (not generic ones like "Blue"). Lean into editorial names that match the brand (Indigo Violet, Aso-Oke Night, Deep Mahogany, Ochre Sun, Slate Storm, etc).
- For Primary / Secondary / Accent: write all six analytical fields (psychology, why_fits, why_conversion, why_audience, why_industry, competitor). For Neutral 900/500/100: just intent.
- Light and dark token maps must use ACTUAL real hex values appropriate for each mode; do not just lighten or invert each other mechanically.
- semantic.success / warning / error / info: industry-standard semantic palette tuned to fit the brand's overall hue family.
- DO NOT use teal, cyan, turquoise, or any hue between #00C7C7 and #1AA899 unless the brief explicitly asks for it. Teal is overused in SaaS / tech brands and reads as default. Lean into less common hue families (warm purples, indigos, deep greens, ochres, terracottas, slates) instead.
- All foreground / background pairs in light.text on light.background, dark.text on dark.background, primary / onPrimary must hit at least 4.5:1 contrast ratio (WCAG AA for normal text). Pick onPrimary as the colour that gets >4.5:1 against primary.
- default_theme.mode: pick ONE (Light or Dark). The four rationale lines should be DECISIVE about why this default is right for this product specifically.

Brief:
${briefText}`,
  },

  // ── Typography System ────────────────────────────────────────────
  // Display / Heading / Body / Mono with per-font analysis +
  // complete weights table + responsive type scale.
  typography_system: {
    system: BASE_SYSTEM,
    user: (briefText) => `Define the complete typography system for this product. Name REAL fonts (prefer Google Fonts so they render in-browser). Cover four type roles + the weight scale + a responsive type scale.

Return JSON exactly in this shape:
{
  "items": {
    "typography_direction": {
      "display": {
        "family":         "<actual font name>",
        "google":         true,
        "weights":        [400, 600, 700],
        "tracking":       "-0.02em",
        "notes":          "<one short line on character / when to use>",
        "personality":    "<one short line on the font's personality>",
        "readability":    "<one short line on its readability at display sizes>",
        "accessibility":  "<one short line on accessibility considerations>",
        "product_fit":    "<one short line on why it fits this product>"
      },
      "heading": {
        "family": "...", "google": true, "weights": [600, 700], "tracking": "-0.01em",
        "notes": "...", "personality": "...", "readability": "...", "accessibility": "...", "product_fit": "..."
      },
      "body": {
        "family": "...", "google": true, "weights": [400, 500, 600], "tracking": "0",
        "notes": "...", "personality": "...", "readability": "...", "accessibility": "...", "product_fit": "..."
      },
      "mono": {
        "family": "...", "google": true, "weights": [400, 500], "tracking": "0",
        "notes": "...", "personality": "...", "readability": "...", "accessibility": "...", "product_fit": "..."
      },
      "weights": [
        { "name": "Thin",       "value": 100, "usage": "<one short line, or 'unused' if not in the brand'>" },
        { "name": "Extra Light","value": 200, "usage": "..." },
        { "name": "Light",      "value": 300, "usage": "..." },
        { "name": "Regular",    "value": 400, "usage": "..." },
        { "name": "Medium",     "value": 500, "usage": "..." },
        { "name": "SemiBold",   "value": 600, "usage": "..." },
        { "name": "Bold",       "value": 700, "usage": "..." },
        { "name": "ExtraBold",  "value": 800, "usage": "..." }
      ],
      "scale": {
        "desktop": [
          { "token": "Display XL", "size": 80, "lineHeight": 88, "weight": 700, "letterSpacing": "-0.03em", "useFor": "Hero" },
          { "token": "Display L",  "size": 64, "lineHeight": 72, "weight": 700, "letterSpacing": "-0.02em", "useFor": "Section opener" },
          { "token": "Display M",  "size": 48, "lineHeight": 56, "weight": 700, "letterSpacing": "-0.02em", "useFor": "Major statement" },
          { "token": "H1",         "size": 40, "lineHeight": 48, "weight": 700, "letterSpacing": "-0.01em", "useFor": "Page title" },
          { "token": "H2",         "size": 32, "lineHeight": 40, "weight": 600, "letterSpacing": "-0.01em", "useFor": "Section header" },
          { "token": "H3",         "size": 24, "lineHeight": 32, "weight": 600, "letterSpacing": "0",       "useFor": "Subsection" },
          { "token": "H4",         "size": 20, "lineHeight": 28, "weight": 600, "letterSpacing": "0",       "useFor": "Card title" },
          { "token": "H5",         "size": 18, "lineHeight": 26, "weight": 600, "letterSpacing": "0",       "useFor": "Strong label" },
          { "token": "H6",         "size": 16, "lineHeight": 24, "weight": 600, "letterSpacing": "0",       "useFor": "Inline emphasis" },
          { "token": "Body XL",    "size": 18, "lineHeight": 28, "weight": 400, "letterSpacing": "0",       "useFor": "Lead paragraph" },
          { "token": "Body L",     "size": 16, "lineHeight": 26, "weight": 400, "letterSpacing": "0",       "useFor": "Long-form" },
          { "token": "Body M",     "size": 14, "lineHeight": 22, "weight": 400, "letterSpacing": "0",       "useFor": "UI text" },
          { "token": "Body S",     "size": 13, "lineHeight": 20, "weight": 400, "letterSpacing": "0",       "useFor": "Dense UI" },
          { "token": "Caption",    "size": 12, "lineHeight": 16, "weight": 500, "letterSpacing": "0.02em",  "useFor": "Metadata" }
        ],
        "mobile": [
          { "token": "Display XL", "size": 48, "lineHeight": 56, "weight": 700, "letterSpacing": "-0.02em", "useFor": "Hero" },
          { "token": "Display L",  "size": 40, "lineHeight": 48, "weight": 700, "letterSpacing": "-0.02em", "useFor": "Section opener" },
          { "token": "Display M",  "size": 32, "lineHeight": 40, "weight": 700, "letterSpacing": "-0.01em", "useFor": "Major statement" },
          { "token": "H1",         "size": 28, "lineHeight": 36, "weight": 700, "letterSpacing": "-0.01em", "useFor": "Page title" },
          { "token": "H2",         "size": 24, "lineHeight": 32, "weight": 600, "letterSpacing": "-0.01em", "useFor": "Section header" },
          { "token": "H3",         "size": 20, "lineHeight": 28, "weight": 600, "letterSpacing": "0",       "useFor": "Subsection" },
          { "token": "H4",         "size": 18, "lineHeight": 26, "weight": 600, "letterSpacing": "0",       "useFor": "Card title" },
          { "token": "H5",         "size": 16, "lineHeight": 24, "weight": 600, "letterSpacing": "0",       "useFor": "Strong label" },
          { "token": "H6",         "size": 15, "lineHeight": 22, "weight": 600, "letterSpacing": "0",       "useFor": "Inline emphasis" },
          { "token": "Body XL",    "size": 17, "lineHeight": 26, "weight": 400, "letterSpacing": "0",       "useFor": "Lead paragraph" },
          { "token": "Body L",     "size": 16, "lineHeight": 24, "weight": 400, "letterSpacing": "0",       "useFor": "Long-form" },
          { "token": "Body M",     "size": 15, "lineHeight": 23, "weight": 400, "letterSpacing": "0",       "useFor": "UI text" },
          { "token": "Body S",     "size": 13, "lineHeight": 20, "weight": 400, "letterSpacing": "0",       "useFor": "Dense UI" },
          { "token": "Caption",    "size": 12, "lineHeight": 16, "weight": 500, "letterSpacing": "0.02em",  "useFor": "Metadata" }
        ]
      },
      "avoid": "<short line. Typographic directions that would contradict the brand>"
    }
  }
}

Rules:
- family names must be real (and on Google Fonts if google=true) so they render in the live preview.
- Weights specified in the per-font weights[] arrays MUST exist on that family. Don't ask for 700 if the font only ships 400/500.
- weights[] (the standalone table): include all 8 standard weights. For weights the brand doesn't use, set usage to "unused". Be specific where they ARE used (e.g. "Hero headlines + brand signatures").
- Scale numbers are unit-less px. letterSpacing uses em units (e.g. "-0.02em") or "0".
- Be DECISIVE about choosing distinct fonts for display / heading / body / mono unless deliberately the same, pairing the same font for display + heading is fine if it's a versatile family; never collapse body + display to the same.

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
        "url": "<the company's actual homepage URL if you are confident from training data, e.g. https://linear.app. OMIT THIS FIELD ENTIRELY if you are not certain the URL is real and correct, a missing URL is far better than a wrong or hallucinated one>",
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

  // ── Product Decisions ────────────────────────────────────────────
  // Senior-level calls about WHAT to build. Sits between Understand
  // and Interrogate so the Reality Check has decisions to react to.
  product_decisions: {
    system: BASE_SYSTEM,
    user: (briefText) => `Make the senior product decisions for this brief. Be DECISIVE. Categorise features into Core / Supporting / Enhancement / Deprioritize. State the positioning and trust strategy with conviction.

Return JSON exactly in this shape:
{
  "items": {
    "features_hierarchy": {
      "core":         ["<critical features the product cannot ship without. 3-6 entries.>"],
      "supporting":   ["<features that strengthen the core but aren't required at MVP. 3-6 entries.>"],
      "enhancement":  ["<features for later phases that delight or deepen the product. 2-5 entries.>"],
      "deprioritize": [
        { "name": "<feature to leave out>", "reason": "<one sentence on why this is a distraction>" }
      ]
    },
    "positioning":     "<2 short sentences. How this product positions in market + the competitive advantage in one breath. Decisive.>",
    "trust_strategy":  "<1-2 short sentences. How design + content + product earn user trust. Be specific (social proof, transparency, brand cues).>"
  }
}

features_hierarchy.deprioritize: 2-5 entries with a real reason.
All lists are decisions, not suggestions. Write as "Use X" not "Consider X".

Brief:
${briefText}`,
  },

  // ── Information Hierarchy ────────────────────────────────────────
  // Ranked content importance, what users see first, second, third.
  info_hierarchy: {
    system: BASE_SYSTEM,
    user: (briefText) => `Rank the content this product's primary surface needs to show, in priority order. This maps directly to page composition decisions.

Return JSON exactly in this shape:
{
  "items": {
    "ranked_content": [
      {
        "name": "<content block name, e.g. 'Value Proposition' or 'Pricing'>",
        "reason": "<one short sentence on why it ranks here for THIS product>"
      }
    ]
  }
}

ranked_content: 5-9 entries in priority order, position 1 = most important. Common blocks: Value Proposition, Product Demo, Social Proof, Features, Pricing, FAQ, About, Onboarding CTA, Trust Markers. Use only the ones relevant to this product. Decide based on the conversion goal.

Brief:
${briefText}`,
  },

  // ── Build Priorities ─────────────────────────────────────────────
  // Phased build plan with explicit business impact per phase.
  build_priorities: {
    system: BASE_SYSTEM,
    user: (briefText) => `Define the build sequence for this product. Three phases. Each phase has a clear purpose and business impact. Be decisive about what ships when.

Return JSON exactly in this shape:
{
  "items": {
    "build_phases": [
      {
        "name":             "Phase 1",
        "purpose":          "<1 short sentence on what this phase exists to do>",
        "items":            ["<concrete deliverable for this phase>", "..."],
        "business_impact":  "<1 short sentence on the business outcome this phase unlocks>"
      },
      { "name": "Phase 2", "purpose": "...", "items": [...], "business_impact": "..." },
      { "name": "Phase 3", "purpose": "...", "items": [...], "business_impact": "..." }
    ]
  }
}

Phase 1: MVP, minimum to test the core value prop.
Phase 2: Activation, features that drive conversion + retention.
Phase 3: Scale, features that compound + differentiate.

items: 3-6 concrete deliverables per phase.

Brief:
${briefText}`,
  },

  // ── System Foundations ──────────────────────────────────────────
  // Spacing scale + grid system + component primitives in one call.
  // These translate directly into Tailwind / CSS tokens downstream.
  system_foundations: {
    system: BASE_SYSTEM,
    user: (briefText) => `Define the mechanical design system foundations for this product. Be DECISIVE about density, scale, and component personality based on the brand and the product category.

Return JSON exactly in this shape:
{
  "items": {
    "spacing_system": {
      "scale": [4, 8, 12, 16, 24, 32, 48, 64, 96],
      "section_spacing":   "<1 short sentence on the spacing between page sections>",
      "component_spacing": "<1 short sentence on the spacing between components within a section>",
      "content_spacing":   "<1 short sentence on the spacing between content elements inside a component>"
    },
    "grid_system": {
      "mobile":  { "columns": 4,  "margin": "16px", "gutter": "12px", "max_width": "100%" },
      "tablet":  { "columns": 8,  "margin": "32px", "gutter": "16px", "max_width": "100%" },
      "desktop": { "columns": 12, "margin": "64px", "gutter": "24px", "max_width": "1280px" },
      "rationale": "<1 short sentence connecting the grid to the brand + content density>"
    },
    "component_system": {
      "border_radius": { "small": "4px", "medium": "8px", "large": "16px" },
      "radius_rationale": "<1 short sentence on how the radius matches brand personality>",
      "shadows":        { "small": "<one short CSS shadow value>", "medium": "<...>", "large": "<...>" },
      "elevation_rationale": "<1 short sentence on the elevation language: flat / layered / glassmorphic>",
      "density": "Compact | Comfortable | Spacious",
      "density_rationale": "<1 short sentence on why this density fits the product>"
    }
  }
}

spacing_system.scale: choose 7-9 values from a standard 4-based scale that fits the chosen density. Compact = tighter, Spacious = wider gaps.
grid_system: pick column counts that fit the product (4/8/12 is the most common, but a portfolio might use 6/8/10). margin = container padding from viewport edge; gutter = gap between columns.
component_system.shadows: use real CSS values like "0 1px 2px rgba(15,23,42,0.04)". Premium products lean subtle; playful products can be more pronounced.

Brief:
${briefText}`,
  },

  // ── Visual Language ─────────────────────────────────────────────
  // Photography / illustration / icon / motion / imagery / empty
  // state / loading state direction. One card, seven micro-fields.
  visual_language: {
    system: BASE_SYSTEM,
    user: (briefText) => `Set the visual language direction for this product. Each field is one short sentence, decisive.

Return JSON exactly in this shape:
{
  "items": {
    "visual_language": {
      "photography":     "<1 sentence. Photo style + treatment direction.>",
      "illustration":    "<1 sentence. Illustration style direction (or 'none' if photography-led).>",
      "icon":            "<1 sentence. Icon style: filled / outline / duotone, stroke weight, corner.>",
      "motion":          "<1 sentence. Motion language: instant / measured / fluid / elastic. Where motion is used.>",
      "imagery":         "<1 sentence. Imagery framing direction: full-bleed / contained / silhouettes / product close-ups.>",
      "empty_state":     "<1 sentence. Empty-state treatment direction: explain + next-action / minimal / illustrated.>",
      "loading_state":   "<1 sentence. Loading-state treatment direction: skeleton / spinner / shimmer / progressive.>"
    }
  }
}

Brief:
${briefText}`,
  },

  // ── Inspiration Library ─────────────────────────────────────────
  // Categorised reference grid. Each ref has product name + what to
  // borrow + what to avoid + why this product is relevant here.
  inspiration_library: {
    system: BASE_SYSTEM,
    user: (briefText) => `Build a categorised inspiration library for this product. For each category, name a real, well-known product + what to borrow + what to avoid + why it fits THIS brief.

Return JSON exactly in this shape:
{
  "items": {
    "inspiration_library": [
      {
        "category":       "Layout | Motion | Dashboard | Landing Page | Pricing | Onboarding | Trust Building",
        "name":           "<real product name>",
        "url":            "<best-guess homepage URL or 'none' if not confident>",
        "what_to_borrow": "<one short line>",
        "what_to_avoid":  "<one short line>",
        "why":            "<one short line on why it fits this brief>"
      }
    ]
  }
}

inspiration_library: 6-8 entries across as many categories as relevant. Pick brands the designer knows (Linear, Stripe, Notion, Vercel, Apple, Figma, Loom, Superhuman, Pitch, Cron, etc.). Be confident, never invent fake products. Omit URL if you are not sure it's real.

Brief:
${briefText}`,
  },

  // ── Builder Guidance ────────────────────────────────────────────
  // Per-feature build instructions for the downstream AI builder.
  builder_guidance: {
    system: BASE_SYSTEM,
    user: (briefText) => `For each of the 3-5 most important features in this product, write build guidance for the AI builder.

Return JSON exactly in this shape:
{
  "items": {
    "ai_builder_guidance": [
      {
        "feature":           "<feature name>",
        "purpose":           "<1 short line on what this feature does>",
        "user_value":        "<1 short line on what the user gets>",
        "business_value":    "<1 short line on what the business gets>",
        "components":        ["<component 1>", "<component 2>", "..."],
        "success_criteria":  "<1 short line on what success looks like>",
        "failure_conditions":"<1 short line on the most common way this can fail>"
      }
    ]
  }
}

ai_builder_guidance: 3-5 entries for the most important features. components = the UI primitives the builder needs (e.g. "card", "modal", "data table", "form", "side sheet"). Be concrete, these instructions are read by an AI that builds the actual components.

Brief:
${briefText}`,
  },

  // ── Section 6: Director's Verdict ────────────────────────────────
  // The decisive editorial close. Reads like a Design Director's
  // final instructions before the project moves into production.
  verdict: {
    system: BASE_SYSTEM,
    user: (briefText) => `You are now the Design Director closing this brief. Write a decisive final verdict that the team will treat as the project's north star.

Be DECISIVE. Make calls. Never give generic advice. Never hedge with "could / might / consider". Say "do this", "build this first", "this is the risk".

Return JSON exactly in this shape:
{
  "items": {
    "director_verdict": {
      "product_summary":             "<2 short sentences. What this product IS and who it's for. Senior, decisive.>",
      "visual_style":                "<1 short sentence. The visual direction in design-language terms (e.g. 'Editorial luxury, high-contrast serifs, restrained motion').>",
      "product_feel":                "<1 short sentence. The emotional register the user should leave with (e.g. 'Trusted, calm, in control').>",
      "ux_priority":                 "<1 short sentence. The single UX outcome that beats everything else.>",
      "conversion_priority":         "<1 short sentence. The single conversion outcome the design must serve.>",
      "most_important_screen":       "<the one screen everything hinges on. Name it.>",
      "most_important_feature":      "<the one feature that, if removed, kills the product. Name it.>",
      "biggest_opportunity":         "<1 sentence. The most valuable thing this team should chase.>",
      "biggest_design_risk":         "<1 sentence. What could make the design fail. Be specific.>",
      "biggest_ux_risk":             "<1 sentence. Where users will drop off if we get it wrong.>",
      "biggest_conversion_risk":     "<1 sentence. The conversion-killing trap to avoid.>",
      "final_recommendation":        "<2-3 sentences. The Design Director's parting instruction to the team. Write it like a closing memo before the project moves into production.>"
    }
  }
}

Brief:
${briefText}`,
  },
}

// ────────────────────────────────────────────────────────────────────
// translateBriefV2, runs all 5 section calls in parallel.
// onSection(sectionId, items, partialResult) fires as each call
// resolves so the UI can render cards progressively.
// Returns the full v2 result object with schemaVersion stamped.
// ────────────────────────────────────────────────────────────────────
export async function translateBriefV2(briefText, { onSection } = {}) {
  console.log('[translateBriefV2] start. brief length:', briefText?.length || 0, 'sections:', BRIEF_V2_SECTIONS.length)
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

  // Per-section token budgets. The direction section's JSON balloons
  // to a colour palette with swatches + light/dark token maps + a
  // full typography scale (desktop + mobile) + moodboard refs, so
  // it needs significantly more headroom than the others. A truncated
  // response means JSON parse fails silently and the items never
  // populate, the UI hangs on the skeleton state forever.
  const MAX_TOKENS = {
    understand:          3500,
    product_decisions:   2500,
    interrogate:         3500,
    // direction trimmed, colour and typography moved to their own
    // sections, so this budget only covers personality + tone +
    // emotional journey + moodboard + 9 star ratings.
    direction:           4500,
    color_strategy:      8500, // bumped from 6500, was overflowing + truncating to empty JSON
    typography_system:   8500, // bumped from 7000, same overflow risk on the 14×2 type scale
    info_hierarchy:      1500,
    landscape:           4000,
    boundaries:          3500,
    system_foundations:  3500,
    visual_language:     1500,
    inspiration_library: 2500,
    builder_guidance:    3500,
    build_priorities:    2500,
    verdict:             2000,
  }

  // Section call worker, extracted so we can run the full set in
  // throttled batches instead of all 15 at once. 15 parallel
  // Sonnet calls reliably trip Anthropic Tier 1 rate limits (50 RPM
  // for Sonnet) AND were causing the heaviest two sections
  // (color_strategy + typography_system) to silently fail when
  // their response landed near a rate-limit window edge.
  async function runSection(sectionDef, attempt = 0) {
    const sectionId = sectionDef.id
    const prompt = SECTION_PROMPTS[sectionId]
    if (!prompt) {
      console.error('[translateBriefV2]', sectionId, 'has NO PROMPT in SECTION_PROMPTS — schema/prompt mismatch')
      return { sectionId, ok: false, error: 'no_prompt' }
    }
    console.log('[translateBriefV2]', sectionId, attempt > 0 ? `retry attempt ${attempt}` : 'firing')
    try {
      const { text } = await callClaude({
        taskType: 'brief_translation',
        system: prompt.system,
        userMessage: prompt.user(briefText),
        maxTokens: MAX_TOKENS[sectionId] || 3500,
      })
      console.log('[translateBriefV2]', sectionId, 'returned. text length:', text?.length || 0)
      const parsed = safeJsonParse(text)
      // Hard parse failure (returned empty {}) almost always means
      // the response was truncated. Log loudly so we catch it next
      // time instead of letting the UI hang silently.
      if (!parsed || Object.keys(parsed).length === 0) {
        console.error('[translateBriefV2]', sectionId, 'parse returned empty, likely token truncation. Response length:', text?.length, 'first 200 chars:', String(text || '').slice(0, 200))
        throw new Error('parse_empty')
      }
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
      // Rate-limit detection, retry once with a short backoff
      // before giving up. Most "section failed" reports trace back
      // to a 429 on the first burst of parallel calls.
      const msg = String(e?.message || '').toLowerCase()
      const isRateLimit = msg.includes('429') || msg.includes('rate') || msg.includes('overloaded')
      if (isRateLimit && attempt === 0) {
        console.warn('[translateBriefV2]', sectionId, 'rate-limited, retrying once after 1500ms')
        await new Promise(r => setTimeout(r, 1500))
        return runSection(sectionDef, 1)
      }
      console.warn('[translateBriefV2] section failed', sectionId, e?.message)
      // Mark every item in the failed section so the UI can surface
      // "failed to load" + a retry button instead of an endless
      // skeleton.
      const sectionResult = result.sections.find(s => s.id === sectionId)
      if (sectionResult) {
        for (const item of sectionResult.items) {
          if (item.content == null) item.content = { __error: true, reason: e?.message || 'failed' }
        }
        try { onSection?.(sectionId, sectionResult.items, result, e) } catch {}
      }
      return { sectionId, ok: false, error: e?.message }
    }
  }

  // Run sections in waves of WAVE_SIZE. Sonnet's Tier 1 limit is
  // 50 RPM; 15 simultaneous bursts plus the post-translation
  // scoring + design-system extraction calls were tripping 429s
  // and cascading. Waves of 4 keep us safely under any tier.
  const WAVE_SIZE = 4
  for (let i = 0; i < BRIEF_V2_SECTIONS.length; i += WAVE_SIZE) {
    const wave = BRIEF_V2_SECTIONS.slice(i, i + WAVE_SIZE)
    console.log('[translateBriefV2] wave', i / WAVE_SIZE + 1, 'firing', wave.map(s => s.id).join(', '))
    // Within a wave, sections fire in parallel for speed. Between
    // waves, we await so the next batch doesn't pile on.
    await Promise.all(wave.map(s => runSection(s)))
    console.log('[translateBriefV2] wave', i / WAVE_SIZE + 1, 'complete')
  }
  console.log('[translateBriefV2] all sections complete')
  return result
}

// ────────────────────────────────────────────────────────────────────
// reviseBriefV2, re-run the 5-section translator with extra context
// so the model addresses client feedback while preserving the parts
// of the brief that weren't called out.
//
//   originalBriefText  , the raw brief the designer typed initially
//   previousTranslation, the current result (sections + design system)
//   feedback           , the client's note ("the audience is too broad…")
//
// Builds an augmented brief text that includes the previous output as
// reference + the feedback as direction, then routes through the
// normal translateBriefV2() so the same section streaming, skeleton
// state, and error handling all just work.
// ────────────────────────────────────────────────────────────────────
export async function reviseBriefV2(originalBriefText, previousTranslation, feedback, { onSection } = {}) {
  const slim = serializePreviousTranslation(previousTranslation)
  const augmentedBrief = `${originalBriefText}

--- PREVIOUS TRANSLATION ---
${slim}

--- CLIENT FEEDBACK ---
${String(feedback || '').trim()}

INSTRUCTIONS: This is a REVISION. The client has reviewed the previous translation and provided the feedback above. Re-translate the brief, addressing the feedback specifically. Maintain accuracy with the original brief and preserve the parts of the previous translation the feedback didn't call out, only change what needs to change. Project title can stay the same unless the feedback explicitly asks for a rename.`

  return translateBriefV2(augmentedBrief, { onSection })
}

// Serialise the previous translation into a slim string the AI can
// read. We strip the framework metadata (id, key, shape, title) and
// only keep section labels + item contents so the prompt stays well
// under the context limit even on multi-revision threads.
function serializePreviousTranslation(prev) {
  if (!prev?.sections) return '(no previous translation)'
  const lines = []
  for (const section of prev.sections) {
    lines.push(`## ${section.label}`)
    for (const item of section.items || []) {
      if (item.content == null) continue
      let value = ''
      if (typeof item.content === 'string') value = item.content
      else {
        try { value = JSON.stringify(item.content) } catch { value = String(item.content) }
      }
      // Keep each item line short; the AI just needs gist context.
      if (value.length > 500) value = value.slice(0, 500) + '…'
      lines.push(`- ${item.title}: ${value}`)
    }
    lines.push('')
  }
  return lines.join('\n')
}

// ────────────────────────────────────────────────────────────────────
// snapshotForRevisions, copies the version-specific fields off a
// brief result into a new object that can be pushed onto the
// revisions[] history array. We deliberately leave OUT the
// revisions[] field itself (no nesting) and onSection-related
// metadata, just the renderable state.
// ────────────────────────────────────────────────────────────────────
export function snapshotForRevisions(result, { label } = {}) {
  if (!result?.sections) return null
  return {
    id: `v${Date.now().toString(36)}`,
    label: label || 'Snapshot',
    createdAt: new Date().toISOString(),
    projectTitle: result.projectTitle || 'Untitled brief',
    sections: structuredCloneSafe(result.sections),
    designSystem: result.designSystem ? structuredCloneSafe(result.designSystem) : null,
    score: result.score ? structuredCloneSafe(result.score) : null,
    revisionMeta: result.revisionMeta ? structuredCloneSafe(result.revisionMeta) : null,
  }
}

function structuredCloneSafe(v) {
  try { return typeof structuredClone === 'function' ? structuredClone(v) : JSON.parse(JSON.stringify(v)) }
  catch { return JSON.parse(JSON.stringify(v)) }
}

// ────────────────────────────────────────────────────────────────────
// enrichCompetitorUrls, for each competitor without a URL, fire a
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
// scoreBriefV2, runs a short post-translation pass that grades the
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
