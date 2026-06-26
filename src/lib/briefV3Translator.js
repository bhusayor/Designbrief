// ────────────────────────────────────────────────────────────────────
// briefV3Translator.js — orchestrates the 22-section Design
// Intelligence Document translation.
//
// Sections 1-8 are wired with prompts (Phase 1A + 1B). Sections
// 9-22 fall through to a placeholder content that the renderer
// surfaces as "Coming in next phase". That lets us ship working
// slices on real briefs while remaining chapters land in later
// phases (2: chapters 9-16, 3: chapters 17-22).
//
// Pattern mirrors briefV2Translator: each section is one Claude
// call, calls run in throttled waves of WAVE_SIZE to respect tier
// rate limits, rate-limit detection triggers one retry with backoff.
// ────────────────────────────────────────────────────────────────────

import { callClaude } from './claudeApi.js'
import {
  BRIEF_V3_SECTIONS,
  BRIEF_V3_WIRED_KEYS,
  BRIEF_V3_SCHEMA_VERSION,
  scrubDashesV3,
} from './briefV3Schema.js'

// ────────────────────────────────────────────────────────────────────
// BASE_SYSTEM — voice + rules every section call inherits.
//
// V3 demands a different posture vs V2: the AI is acting as a
// Principal Product Designer + UX Strategist + Design Director + IA
// + PM + Systems Thinker + Researcher + Creative Director + AI
// Design Translator (per user spec). Output is a Design Intelligence
// Document, not a brief restatement. The model must INFER what the
// client forgot, detect contradictions, surface assumptions, and
// reason like a consultant.
// ────────────────────────────────────────────────────────────────────
const BASE_SYSTEM = `You are a Principal Product Designer, UX Strategist, Design Director, Information Architect, Product Manager, Systems Thinker, Researcher, Creative Director, and AI Design Translator with 20+ years of experience.

Your role: transform any brief (complete, incomplete, messy, verbal, AI-generated, client-written) into a world-class Design Intelligence Document section that another senior designer, PM, dev, or AI could act on without further clarification.

THINK BEFORE WRITING. Silently perform these steps before generating output:
1. Understand the business, users, product, context, constraints.
2. Understand what success looks like and what priorities exist.
3. Identify missing information, hidden assumptions, contradictions.
4. Detect opportunities and risks the brief did not name.
5. Ask yourself: what did the client forget to mention?

Only then write the output.

NEVER simply reorganise the brief. EXTRACT hidden information. INFER relationships. IDENTIFY assumptions and mark them clearly. DETECT contradictions. FIND missing requirements. Think like a consultant, not a summariser.

OUTPUT RULES (hard constraints):
- Return ONLY valid JSON in the exact shape requested. No prose around it. No code fences.
- NO em-dashes (—) or en-dashes (–) anywhere. Use commas, periods, parentheses, or " : " instead.
- Be DECISIVE. "Use X because Y" beats "consider X". Never offer generic SaaS-template advice.
- Where the schema allows a "reasoning" object, ALWAYS populate it: { recommendation, reason, impact, tradeoffs, confidence }. Confidence is "high" | "medium" | "low".
- Where the schema asks for an inferred value (something not explicit in the brief), include an "assumed": true flag so the renderer can mark it visually.
- Do NOT default to the generic AI-website skeleton (Hero / Logo Cloud / Features / Testimonials / Pricing / FAQ / CTA). Design FOR THIS SPECIFIC PRODUCT.
- Brevity earns its keep. Designers skim. Default to 1 short sentence per field; 2 only when the first cannot stand alone.

VISUAL THINKING: the renderer turns your JSON into tables, matrices, journey maps, swimlanes, decision trees, scorecards. Structure your output so it converts to a visual cleanly. Lists of bare strings are weaker than lists of objects with explicit fields.`

// ────────────────────────────────────────────────────────────────────
// Section prompts (Phase 1A: 1-4 only).
// ────────────────────────────────────────────────────────────────────
const SECTION_PROMPTS = {
  // ── 1. Executive Summary ───────────────────────────────────────
  executive_summary: {
    system: BASE_SYSTEM,
    user: (briefText) => `Write the Executive Summary for this brief. Two parts: (a) summary, 2-3 punchy sentences that any stakeholder could read in 15 seconds; (b) a structured snapshot.

Return JSON exactly in this shape:
{
  "summary": "<2-3 sentence project summary>",
  "snapshot": {
    "project":          { "value": "<project name or short label>", "assumed": false },
    "industry":         { "value": "<industry / vertical>",         "assumed": false },
    "platform":         { "value": "<Web / iOS / Android / Multi>", "assumed": false },
    "audience":         { "value": "<primary audience, 1 line>",    "assumed": false },
    "business_goal":    { "value": "<single most important business outcome>", "assumed": false },
    "user_goal":        { "value": "<single most important user outcome>",    "assumed": false },
    "core_problem":     { "value": "<the actual problem being solved, 1 sentence>", "assumed": false },
    "expected_outcome": { "value": "<what shipped success looks like, 1 sentence>", "assumed": false },
    "priority":         { "value": "Critical | High | Medium | Low", "rationale": "<one short line>" },
    "complexity":       { "value": "Simple | Moderate | Complex | Enterprise", "rationale": "<one short line>" },
    "confidence":       { "value": 0-100, "rationale": "<one short line on how confident you are in this read of the brief>" }
  }
}

Mark any field "assumed": true when you inferred it because the brief did not explicitly state it. Be honest.

Brief:
${briefText}`,
  },

  // ── 2. Brief Health Assessment ─────────────────────────────────
  brief_health: {
    system: BASE_SYSTEM,
    user: (briefText) => `Score the QUALITY of this brief on 10 dimensions (0-100 each), then list strengths / weaknesses / missing information / risks / questions for the designer to send the client.

Return JSON exactly in this shape:
{
  "overall_score": 0-100,
  "verdict": "<one short sentence, like 'Solid foundation, three gaps to close before kickoff' or 'Critically thin, do not start design until interrogated'>",
  "scores": [
    { "dimension": "Clarity",            "score": 0-100, "note": "<one short line on why this score>" },
    { "dimension": "Completeness",       "score": 0-100, "note": "..." },
    { "dimension": "Business context",   "score": 0-100, "note": "..." },
    { "dimension": "User context",       "score": 0-100, "note": "..." },
    { "dimension": "Technical detail",   "score": 0-100, "note": "..." },
    { "dimension": "Visual direction",   "score": 0-100, "note": "..." },
    { "dimension": "Content strategy",   "score": 0-100, "note": "..." },
    { "dimension": "Success metrics",    "score": 0-100, "note": "..." },
    { "dimension": "Dependencies",       "score": 0-100, "note": "..." },
    { "dimension": "Unknowns surfaced",  "score": 0-100, "note": "..." }
  ],
  "strengths":   [ "<one short line>" ],
  "weaknesses":  [ "<one short line>" ],
  "missing":     [ "<one short line on what should have been in the brief but was not>" ],
  "risks":       [ { "risk": "<short>", "severity": "High | Medium | Low" } ],
  "questions":   [ "<question to send the client to fill the gap>" ]
}

3-6 entries per list. Be CRITICAL of the brief, but constructive. Scores below 50 should be backed by a clear note.

Brief:
${briefText}`,
  },

  // ── 3. Problem Definition ──────────────────────────────────────
  problem_definition: {
    system: BASE_SYSTEM,
    user: (briefText) => `Translate the brief into the ACTUAL problem being solved. The brief usually describes the surface; your job is to find the underlying problem.

Return JSON exactly in this shape:
{
  "current_state": "<1-2 sentences on the world as it is today for this audience>",
  "desired_state": "<1-2 sentences on the world after this product exists>",
  "gap":           "<the gap between current and desired, named directly>",
  "pain_points": [
    { "pain": "<short>", "severity": "Acute | Chronic | Latent", "evidence": "<what in the brief or audience signals this>" }
  ],
  "root_causes": [
    { "cause": "<short>", "category": "Behavioural | Structural | Technical | Economic | Cultural" }
  ],
  "impact":        "<who is hurt by the current state and how. 1-2 sentences>",
  "opportunities": [
    { "opportunity": "<short>", "leverage": "High | Medium | Low" }
  ],
  "unknowns":      [ "<information not in the brief that would change the problem framing>" ]
}

3-6 entries per list. Pain points must connect to evidence (something in the brief, audience, or industry context). Root causes must NOT just restate the pain.

Brief:
${briefText}`,
  },

  // ── 4. Business Intelligence ───────────────────────────────────
  business_intelligence: {
    system: BASE_SYSTEM,
    user: (briefText) => `Surface the BUSINESS context: goals, KPIs, constraints, opportunities, risks. Then place initiatives on an Effort × Impact matrix.

Return JSON exactly in this shape:
{
  "goals": [
    { "category": "Revenue | Operational | Brand | Growth | Retention | Conversion | Trust", "goal": "<short>", "kpi": "<measurable metric, e.g. 'free→paid conversion within 14d'>" }
  ],
  "constraints":   [ { "constraint": "<short>", "type": "Budget | Time | Resource | Regulatory | Technical | Brand" } ],
  "opportunities": [ { "opportunity": "<short>", "category": "Revenue | Growth | Brand | Retention | Trust | Other" } ],
  "risks":         [ { "risk": "<short>", "likelihood": "High | Medium | Low", "impact": "High | Medium | Low" } ],
  "matrix": [
    { "initiative": "<one short label per initiative>", "effort": "Low | Medium | High", "impact": "Low | Medium | High", "reasoning": "<one short line>" }
  ]
}

goals: 4-7 entries spread across categories that actually apply.
constraints: 3-6 entries.
opportunities: 3-6 entries.
risks: 3-6 entries.
matrix: 5-10 initiatives positioned on the 3×3 grid. Quick wins (Low effort / High impact) should appear first.

Be DECISIVE. Vague KPIs ("increase engagement") are rejected, use specifics ("DAU/MAU > 0.30 within Q2").

Brief:
${briefText}`,
  },

  // ── 5. User Intelligence ───────────────────────────────────────
  user_intelligence: {
    system: BASE_SYSTEM,
    user: (briefText) => `Build deep user understanding: 1-2 primary personas + 1-2 secondary personas, plus the shared context that applies to everyone.

Return JSON exactly in this shape:
{
  "primary": [
    {
      "name":              "<persona archetype name, e.g. 'The Solo Stylist' or 'Time-Starved Founder'>",
      "role":              "<their role in life or work, 1 short line>",
      "tagline":           "<a quote they would say in their own voice, 1 sentence>",
      "mindset":           "<how they think about this domain, 1 line>",
      "environment":       "<where + when + on what device they typically engage, 1 line>",
      "motivations":       [ "<one short driver>" ],
      "needs":             [ "<one short need>" ],
      "frustrations":      [ "<one short frustration>" ],
      "mental_models":     [ "<existing pattern they expect, e.g. 'Treats it like Instagram'>" ],
      "digital_literacy":  "Low | Medium | High",
      "accessibility":     "<specific accessibility considerations for this persona, or 'Standard WCAG AA' if no specific>",
      "device_usage":      "<which devices, share, e.g. '80% mobile, 20% desktop'>",
      "context_of_use":    "<the conditions of use, e.g. 'distracted, mid-commute, low signal'>",
      "goals":             [ "<one short goal in this product>" ],
      "barriers":          [ "<one short barrier to success>" ],
      "expected_outcome":  "<what they hope to walk away with, 1 line>"
    }
  ],
  "secondary": [ { "<same shape as primary>": "..." } ],
  "shared_context": {
    "time_pressure":   "Low | Medium | High",
    "connectivity":    "<typical network conditions, e.g. 'Mostly 4G + intermittent'>",
    "emotional_state": "<the dominant feeling users carry into this product, 1 line>",
    "trust_baseline":  "<how much trust this audience extends by default, 1 line>"
  }
}

primary: 1-2 personas. secondary: 0-2 personas. motivations/needs/frustrations/mental_models/goals/barriers: 2-4 entries each. Be SPECIFIC; reject generic "wants better UX". Personas must reflect the actual audience signals in the brief, not boilerplate.

Brief:
${briefText}`,
  },

  // ── 6. Jobs To Be Done ─────────────────────────────────────────
  jobs_to_be_done: {
    system: BASE_SYSTEM,
    user: (briefText) => `Frame the work as Jobs To Be Done. Three categories (functional, emotional, social), plus desired outcomes, current alternatives, and opportunity areas.

Return JSON exactly in this shape:
{
  "functional": [
    {
      "job":              "<job statement: 'When [situation], I want to [motivation], so I can [outcome]'>",
      "context":          "<when this job comes up, 1 short line>",
      "current_solution": "<how they get this done today, 1 short line>",
      "success_signal":   "<the moment they know the job is done, 1 short line>"
    }
  ],
  "emotional": [ { "job": "...", "context": "...", "current_solution": "...", "success_signal": "..." } ],
  "social":    [ { "job": "...", "context": "...", "current_solution": "...", "success_signal": "..." } ],
  "outcomes": [
    { "outcome": "<measurable user outcome>", "metric": "<how it would be measured>", "priority": "Must | Should | Could" }
  ],
  "alternatives": [
    { "alternative": "<existing product/workaround>", "what_works": "<short>", "what_fails": "<short>" }
  ],
  "opportunity_areas": [
    { "area": "<short>", "leverage": "High | Medium | Low", "reasoning": "<one short line>" }
  ]
}

functional: 3-5 jobs (rational tasks). emotional: 2-4 jobs (feelings). social: 1-3 jobs (perception by others). outcomes: 4-6. alternatives: 3-5. opportunity_areas: 3-5. Every job MUST follow the "When..., I want to..., so I can..." structure.

Brief:
${briefText}`,
  },

  // ── 7. User Journey ────────────────────────────────────────────
  user_journey: {
    system: BASE_SYSTEM,
    user: (briefText) => `Map the user journey for the primary persona, end-to-end. Multiple stages with full structure per stage + an emotion curve (1-5 scale per stage).

Return JSON exactly in this shape:
{
  "persona_ref":  "<the persona name from User Intelligence section, if relevant>",
  "stages": [
    {
      "stage":               "<stage name, e.g. 'Discover' / 'Evaluate' / 'Onboard' / 'Use' / 'Retain'>",
      "goal":                "<what the user wants here, 1 short line>",
      "actions":             [ "<one specific action they take>" ],
      "touchpoints":         [ "<surface they interact with, e.g. 'Marketing site hero', 'Email reminder'>" ],
      "thoughts":            "<what's in their head, 1 short line>",
      "emotion":             { "label": "Excited | Hopeful | Curious | Anxious | Frustrated | Relieved | Delighted | Trusting | Skeptical | Bored", "score": 1-5 },
      "pain_points":         [ "<one short pain at this stage>" ],
      "opportunities":       [ "<one short opportunity to delight or reduce friction>" ],
      "moments_of_delight":  [ "<one short delight moment>" ],
      "moments_of_friction": [ "<one short friction moment>" ]
    }
  ]
}

stages: 4-7 stages depending on the product (a consumer site might be Discover→Browse→Decide→Purchase→Use→Advocate; a B2B SaaS might be Aware→Evaluate→Trial→Activate→Adopt→Expand). Actions: 2-4 per stage. Pain points: 1-3 per stage. Opportunities: 1-3 per stage. Emotion score is on a 1-5 scale where 1=worst, 5=best.

Brief:
${briefText}`,
  },

  // ── 8. User Flows ──────────────────────────────────────────────
  user_flows: {
    system: BASE_SYSTEM,
    user: (briefText) => `Define the core user flows. ONE happy path through the primary outcome, plus alternative paths, error paths, edge cases, and key decision points.

Return JSON exactly in this shape:
{
  "primary_outcome": "<the single outcome this flow drives, 1 short line>",
  "happy_path": [
    { "step": 1, "node": "<screen or state name>", "action": "<what the user does>", "system": "<what the system does in response>" }
  ],
  "alternatives": [
    {
      "name":   "<branch label, e.g. 'Returning user' or 'Skip onboarding'>",
      "fork_at": "<the step number in happy_path where this branches>",
      "steps":  [ { "step": 1, "node": "...", "action": "...", "system": "..." } ],
      "rejoins_at": "<step number where the branch rejoins the happy path, or null if it terminates>"
    }
  ],
  "error_paths": [
    {
      "name":      "<error label, e.g. 'Payment declined' or 'Email already exists'>",
      "trigger":   "<what causes this error>",
      "recovery":  "<how the user gets back on track>",
      "prevention":"<what design could do to prevent this happening>"
    }
  ],
  "edge_cases": [
    { "case": "<short>", "implication": "<one short line on what the design must handle>" }
  ],
  "decision_points": [
    {
      "decision":  "<the choice the user faces>",
      "options":   [ "<option A>", "<option B>" ],
      "stakes":    "<what's at risk if they pick wrong>",
      "default":   "<the recommended default choice + why>"
    }
  ]
}

happy_path: 4-8 steps. alternatives: 2-4 branches. error_paths: 2-4 errors. edge_cases: 3-5 cases. decision_points: 2-4. Be SPECIFIC about node names ("Auth screen" beats "screen 2"). Every step's "system" field describes what the product does in response (animation, redirect, validation, etc.).

Brief:
${briefText}`,
  },

  // ── 9. Information Architecture ────────────────────────────────
  information_architecture: {
    system: BASE_SYSTEM,
    user: (briefText) => `Define the Information Architecture. A site map tree + primary/secondary/utility navigation + content groupings + cross-cutting relationships + taxonomy.

Return JSON exactly in this shape:
{
  "site_map": {
    "name":     "<root, usually the product name>",
    "type":     "root",
    "children": [
      {
        "name": "<page/section name>",
        "type": "page | section | flow | external",
        "purpose": "<one short line on what lives here>",
        "children": [ { "name": "...", "type": "...", "purpose": "...", "children": [] } ]
      }
    ]
  },
  "navigation": {
    "primary":   [ { "label": "<nav label>", "destination": "<where it points>", "rationale": "<one short line>" } ],
    "secondary": [ { "label": "...", "destination": "...", "rationale": "..." } ],
    "utility":   [ { "label": "...", "destination": "...", "rationale": "..." } ]
  },
  "groupings": [
    { "group": "<content group name>", "members": [ "<page/area>" ], "rationale": "<why these live together>" }
  ],
  "relationships": [
    { "from": "<page/area>", "to": "<page/area>", "type": "Links to | Inherits | Depends on | Cross-references", "purpose": "<one short line>" }
  ],
  "taxonomy": [
    { "term": "<a term used across the product>", "definition": "<short>", "synonyms": [ "<alt>" ] }
  ],
  "depth_warning": "<one short line if any branch is >3 levels deep and worth simplifying, or empty string>"
}

site_map: depth 2-3 typical. Don't invent generic page lists; let the brief drive what pages exist. Don't default to Home/About/Services/Contact unless the brief actually points there.
navigation.primary: 3-6 items max. secondary + utility optional, 0-5 each.
groupings: 2-5 logical groupings.
relationships: 3-8 meaningful cross-links.
taxonomy: 3-8 terms whose meaning must be consistent (decide them now).

Brief:
${briefText}`,
  },

  // ── 10. Functional Requirements ────────────────────────────────
  functional_requirements: {
    system: BASE_SYSTEM,
    user: (briefText) => `List the functional requirements. Group features as core / supporting / future. For each feature, specify inputs / outputs / business rules / validation / permissions / all UI states.

Return JSON exactly in this shape:
{
  "core": [
    {
      "feature":        "<feature name>",
      "description":    "<one short sentence>",
      "inputs":         [ "<what the user provides>" ],
      "outputs":        [ "<what the system returns>" ],
      "business_rules": [ "<rule the product must enforce>" ],
      "validation":     [ "<input rule, e.g. 'Email must be unique'>" ],
      "permissions":    [ "<who can do this, e.g. 'Authenticated, role=Admin'>" ],
      "states": {
        "empty":   "<what's shown when there's no data>",
        "loading": "<what's shown while loading>",
        "error":   "<what's shown on error>",
        "success": "<what's shown after a successful action>",
        "offline": "<what's shown when offline (or 'N/A' if no offline support needed)>"
      },
      "edge_cases": [ "<one short edge case>" ]
    }
  ],
  "supporting":  [ { "<same shape>": "..." } ],
  "future":      [ { "feature": "...", "description": "...", "rationale": "<why later, not now>" } ],
  "dependencies": [
    { "depends_on": "<other feature/system>", "needed_for": "<this feature>", "type": "Hard | Soft" }
  ]
}

core: 3-7 features (the must-haves). supporting: 3-6 features. future: 2-5 deferred features. Be SPECIFIC; reject vague "user management".

Brief:
${briefText}`,
  },

  // ── 11. Non-Functional Requirements ────────────────────────────
  non_functional_requirements: {
    system: BASE_SYSTEM,
    user: (briefText) => `Define the non-functional requirements. For each dimension that applies, name a specific target + the standard + a one-line reasoning.

Return JSON exactly in this shape:
{
  "requirements": [
    {
      "category":  "Accessibility | Performance | Scalability | Localization | Privacy | Security | Responsiveness | Offline | Animation | Dark mode | Maintainability | Analytics | SEO | Compliance",
      "target":    "<specific, measurable target, e.g. 'WCAG 2.2 AA across all surfaces' or 'LCP < 1.8s on 4G'>",
      "standard":  "<the standard or framework backing it, or 'Internal' if bespoke>",
      "rationale": "<one short line on why this target>",
      "priority":  "Must | Should | Could"
    }
  ]
}

Cover 8-14 categories that actually apply to this product (skip categories that are genuinely N/A, but be honest, most products need at least Accessibility / Performance / Security / Responsiveness / Analytics). For each, give a SPECIFIC measurable target. "Fast" is rejected, use "LCP < 1.8s". "Secure" is rejected, use specifics like "OWASP Top 10 mitigations + CSP + HSTS".

Brief:
${briefText}`,
  },

  // ── 12. Content Strategy ───────────────────────────────────────
  content_strategy: {
    system: BASE_SYSTEM,
    user: (briefText) => `Define the content strategy. Content types + hierarchy + voice + tone + microcopy patterns for each surface.

Return JSON exactly in this shape:
{
  "content_types": [
    { "type": "<e.g. 'Product copy', 'Onboarding flow', 'Error states'>", "purpose": "<one short line>", "tone": "<the tone for this type>" }
  ],
  "hierarchy": [
    { "level": 1, "label": "<what appears first>", "intent": "<one short line>" },
    { "level": 2, "label": "...", "intent": "..." }
  ],
  "voice": {
    "personality": "<3 adjectives that describe the brand voice, e.g. 'Direct, warm, witty'>",
    "we_are":      [ "<one short line per attribute>" ],
    "we_are_not":  [ "<one short line per anti-attribute>" ]
  },
  "tone_adapters": [
    { "context": "<where the tone shifts, e.g. 'Error messages', 'Onboarding', 'Empty states'>", "tone": "<the tone for this context>", "example": "<a one-line copy example>" }
  ],
  "microcopy": {
    "ctas":          [ { "context": "<surface>", "copy": "<exact copy>", "anti_pattern": "<what NOT to say here>" } ],
    "errors":        [ { "context": "...", "copy": "...", "anti_pattern": "..." } ],
    "empty_states":  [ { "context": "...", "copy": "...", "anti_pattern": "..." } ],
    "notifications": [ { "context": "...", "copy": "...", "anti_pattern": "..." } ],
    "success":       [ { "context": "...", "copy": "...", "anti_pattern": "..." } ]
  },
  "information_density": "Dense | Moderate | Spacious",
  "density_rationale":   "<one short line on why this density fits the audience>"
}

content_types: 4-7 entries. hierarchy: 3-6 levels. tone_adapters: 4-7 contexts. microcopy sub-lists: 2-4 entries each, populated for surfaces that actually exist.

Brief:
${briefText}`,
  },

  // ── 13. Competitive Landscape ──────────────────────────────────
  competitive_landscape: {
    system: BASE_SYSTEM,
    user: (briefText) => `Analyse the competitive landscape. 3-5 direct competitors + common patterns we should follow + standards we should meet + how to differentiate + anti-patterns to avoid + innovation opportunities.

Return JSON exactly in this shape:
{
  "competitors": [
    {
      "name":            "<real competitor name>",
      "url":             "<homepage URL only if you're confident from training data, else omit>",
      "positioning":     "<how they position themselves, 1 short line>",
      "dominant_pattern":"<their dominant layout / interaction pattern>",
      "strength":        "<one short line on what they do best>",
      "weakness":        "<one short line on where they fall short>",
      "lesson":          "<the specific lesson for us, 1 short line>"
    }
  ],
  "common_patterns": [
    { "pattern": "<UX pattern most players use>", "should_follow": true, "reasoning": "<why or why not>" }
  ],
  "industry_standards": [
    { "standard": "<implicit user expectation in this category>", "how_to_meet": "<one short line>" }
  ],
  "differentiators": [
    { "diff": "<how we can stand out>", "leverage": "High | Medium | Low", "reasoning": "<one short line>" }
  ],
  "anti_patterns": [
    { "pattern": "<bad pattern common in the space>", "why_avoid": "<one short line>" }
  ],
  "innovation_opportunities": [
    { "opportunity": "<unconventional move worth considering>", "risk": "Low | Medium | High", "reasoning": "<one short line>" }
  ]
}

competitors: 3-5. Real names only, omit URL if uncertain. common_patterns: 3-6. industry_standards: 3-6. differentiators: 3-5. anti_patterns: 2-4. innovation_opportunities: 2-4.

Brief:
${briefText}`,
  },

  // ── 14. Design Principles (reasoning chain) ────────────────────
  design_principles: {
    system: BASE_SYSTEM,
    user: (briefText) => `Generate 4-6 PROJECT-SPECIFIC design principles. Not generic ones like "clarity over cleverness". Each must be defensible against trade-offs.

Return JSON exactly in this shape:
{
  "principles": [
    {
      "name":         "<short principle name, 2-5 words>",
      "statement":    "<the principle as a declarative sentence>",
      "why_exists":   "<the specific reason this principle exists for THIS product, 1 sentence>",
      "what_it_means":"<concrete what it looks like in design decisions, 1-2 sentences>",
      "what_it_prevents": "<the specific failure mode it guards against, 1 sentence>",
      "example":      "<a concrete example of applying it, 1 short line>",
      "tradeoffs":    "<the cost of holding this principle, 1 short line>",
      "confidence":   "high | medium | low"
    }
  ]
}

4-6 principles. Each principle must be PROJECT-SPECIFIC, not generic SaaS-design wisdom. "Clarity over cleverness" is rejected. "Lead with price transparency, never bury totals" is good for an ecommerce brief; "Trade visual flourish for sub-second load" is good for a slow-network product. Every principle includes the full reasoning chain.

Brief:
${briefText}`,
  },

  // ── 15. Visual Direction ───────────────────────────────────────
  visual_direction: {
    system: BASE_SYSTEM,
    user: (briefText) => `Make the visual direction call. Mood + personality + colour + type + spacing + grid + iconography + illustration + photography + elevation + radius + motion + component philosophy + a/c. References must be real and category-appropriate.

Return JSON exactly in this shape:
{
  "mood":         "<3-5 words capturing the visual feel>",
  "personality":  "<3-5 adjectives>",
  "color_strategy": {
    "approach":    "<one short line on the colour approach, e.g. 'Restrained editorial with a single signature accent'>",
    "primary":     "<recommended primary hue family, 1 short line>",
    "accent":      "<recommended accent hue family, 1 short line>",
    "tone":        "<light dominant | dark dominant | dual>",
    "rationale":   "<one short line on why this fits>"
  },
  "typography_strategy": {
    "display": "<recommended display family + rationale>",
    "body":    "<recommended body family + rationale>",
    "pairing_rationale": "<why this pairing>"
  },
  "spacing":      "<base unit + scale, e.g. '4px base, geometric 4/8/12/16/24/32/48/64'>",
  "grid":         "<recommended grid, e.g. '12-col fluid, 80px gutter at desktop'>",
  "iconography":  "<recommended icon style + size + weight>",
  "illustration": "<recommended illustration style, or 'Not used' if not appropriate>",
  "photography":  "<recommended photography style, or 'Not used'>",
  "elevation":    "<recommended elevation approach + shadow tokens, e.g. '3-level: 0/sm/md, soft long shadows'>",
  "border_radius":"<recommended radius scale, e.g. 'Geometric 0/4/8/12/999'>",
  "motion":       "<motion philosophy, e.g. 'Quiet defaults (150ms), expressive only for celebratory moments'>",
  "component_philosophy": "<one short line on how components should compose, e.g. 'Editorial cards over chrome'>",
  "accessibility_notes": [ "<one short line per consideration>" ],
  "dark_mode":    "<recommended approach to dark mode + when to deploy>",
  "light_mode":   "<recommended approach to light mode>",
  "references": [
    { "name": "<real product/site/designer>", "url": "<URL if confident, else omit>", "what_to_borrow": "<one short line>" }
  ]
}

references: 4-7 entries, project-specific (e.g. for a fashion brand: Margiela, Acne Studios, Telfar; for a fintech: Wise, Mercury, Cash App). Reject the default SaaS shortlist unless this IS a B2B SaaS.
accessibility_notes: 3-5 specific concerns (not "ensure WCAG AA"). Be specific to the audience and product.

Brief:
${briefText}`,
  },

  // ── 16. Component Inventory ────────────────────────────────────
  component_inventory: {
    system: BASE_SYSTEM,
    user: (briefText) => `List every UI component the product needs, grouped by category. For each, mark how heavily it's used + any specific variants required.

Return JSON exactly in this shape:
{
  "categories": [
    {
      "category": "Navigation | Inputs & forms | Surfaces | Data display | Feedback | Overlay | Media | Utility",
      "components": [
        {
          "name":     "<component name, e.g. 'Top nav', 'Combobox', 'Card', 'Toast'>",
          "usage":    "Heavy | Moderate | Light",
          "variants": [ "<variant label, e.g. 'Compact', 'With avatar'>" ],
          "notes":    "<one short line on a specific requirement or constraint, or empty string>"
        }
      ]
    }
  ],
  "build_order": [
    { "phase": "Foundation | Core | Polish", "components": [ "<component name>" ], "reasoning": "<one short line>" }
  ]
}

categories: 4-8 categories that apply. Each category should list 3-8 components. Be CONCRETE; if the brief is for a fashion site, list "Lookbook card", "Variant swatch picker", "Size selector", not just "Card", "Input", "Picker".
build_order: 3 phases ordering components by build priority.

Brief:
${briefText}`,
  },
}

// ────────────────────────────────────────────────────────────────────
// translateBriefV3
//
// onSection(sectionKey, content, partialResult) fires as each
// section's call resolves so the renderer can stream chapters into
// the document progressively.
// ────────────────────────────────────────────────────────────────────
export async function translateBriefV3(briefText, { onSection } = {}) {
  console.log('[translateBriefV3] start. brief length:', briefText?.length || 0, 'sections:', BRIEF_V3_SECTIONS.length, 'wired:', BRIEF_V3_WIRED_KEYS.length)

  // Initialise result with every section's content set to null. The
  // renderer treats null as "still streaming" and shows a skeleton.
  // Sections outside Phase 1A are flipped to a "pending_phase" marker
  // so the renderer surfaces them as roadmap items rather than
  // skeleton-forever blocks.
  const result = {
    schemaVersion: BRIEF_V3_SCHEMA_VERSION,
    projectTitle: 'Untitled brief',
    sections: BRIEF_V3_SECTIONS.map(s => ({
      key: s.key,
      id: s.id,
      title: s.title,
      shape: s.shape,
      tier: s.tier,
      description: s.description,
      content: BRIEF_V3_WIRED_KEYS.includes(s.key) ? null : { __pending_phase: true },
    })),
  }

  // Token budgets per section. Scorecard + priority matrix carry a
  // lot of structured rows so they need more headroom.
  const MAX_TOKENS = {
    executive_summary:           1800,
    brief_health:                3500,
    problem_definition:          3000,
    business_intelligence:       4000,
    user_intelligence:           4500,
    jobs_to_be_done:             3500,
    user_journey:                4500,
    user_flows:                  4500,
    information_architecture:    5000,  // tree JSON gets deep
    functional_requirements:     6000,  // every feature has 6 sub-arrays
    non_functional_requirements: 3500,
    content_strategy:            4500,
    competitive_landscape:       4500,
    design_principles:           3000,
    visual_direction:            4500,
    component_inventory:         3500,
  }

  async function runSection(sectionDef, attempt = 0) {
    const key = sectionDef.key
    const prompt = SECTION_PROMPTS[key]
    if (!prompt) {
      // Not wired in this phase. Skip silently, the renderer surfaces
      // it as "Coming in next phase".
      return { key, ok: true, skipped: true }
    }
    console.log('[translateBriefV3]', key, attempt > 0 ? `retry ${attempt}` : 'firing')
    try {
      const { text } = await callClaude({
        taskType: 'brief_translation',
        system: prompt.system,
        userMessage: prompt.user(briefText),
        maxTokens: MAX_TOKENS[key] || 3500,
      })
      console.log('[translateBriefV3]', key, 'returned. length:', text?.length || 0)
      const parsed = safeJsonParse(text)
      if (!parsed || Object.keys(parsed).length === 0) {
        console.error('[translateBriefV3]', key, 'parse returned empty. length:', text?.length, 'first 200 chars:', String(text || '').slice(0, 200))
        throw new Error('parse_empty')
      }
      const scrubbed = scrubDashesV3(parsed)
      // Project title extraction: take from executive_summary.snapshot.project.value
      if (key === 'executive_summary') {
        const projTitle = scrubbed?.snapshot?.project?.value
        if (projTitle && typeof projTitle === 'string' && projTitle.trim()) {
          result.projectTitle = projTitle.trim()
        }
      }
      const section = result.sections.find(s => s.key === key)
      if (section) {
        section.content = scrubbed
        try { onSection?.(key, scrubbed, result) } catch {}
      }
      return { key, ok: true }
    } catch (e) {
      const msg = String(e?.message || '').toLowerCase()
      const isRateLimit = msg.includes('429') || msg.includes('rate') || msg.includes('overloaded')
      if (isRateLimit && attempt === 0) {
        console.warn('[translateBriefV3]', key, 'rate-limited, retrying after 1500ms')
        await new Promise(r => setTimeout(r, 1500))
        return runSection(sectionDef, 1)
      }
      console.warn('[translateBriefV3] section failed', key, e?.message)
      const section = result.sections.find(s => s.key === key)
      if (section) {
        section.content = { __error: true, reason: e?.message || 'failed' }
        try { onSection?.(key, section.content, result, e) } catch {}
      }
      return { key, ok: false, error: e?.message }
    }
  }

  // Throttled waves of 4. Same reasoning as V2: Sonnet Tier 1 = 50 RPM
  // and we want to leave headroom for any post-translation passes.
  const WAVE_SIZE = 4
  const wiredSections = BRIEF_V3_SECTIONS.filter(s => BRIEF_V3_WIRED_KEYS.includes(s.key))
  for (let i = 0; i < wiredSections.length; i += WAVE_SIZE) {
    const wave = wiredSections.slice(i, i + WAVE_SIZE)
    console.log('[translateBriefV3] wave', i / WAVE_SIZE + 1, 'firing', wave.map(s => s.key).join(', '))
    await Promise.all(wave.map(s => runSection(s)))
    console.log('[translateBriefV3] wave', i / WAVE_SIZE + 1, 'complete')
  }
  console.log('[translateBriefV3] all wired sections complete')
  return result
}

// ────────────────────────────────────────────────────────────────────
// reviseBriefV3 — mirrors reviseBriefV2: augments the brief with
// previous translation + client feedback, then re-runs the full
// translator so all flows just work.
// ────────────────────────────────────────────────────────────────────
export async function reviseBriefV3(originalBriefText, previousTranslation, feedback, { onSection } = {}) {
  const slim = serializePreviousTranslationV3(previousTranslation)
  const augmentedBrief = `${originalBriefText}

--- PREVIOUS TRANSLATION ---
${slim}

--- CLIENT FEEDBACK ---
${String(feedback || '').trim()}

INSTRUCTIONS: This is a REVISION. The client has reviewed the previous translation and provided the feedback above. Re-translate the brief, addressing the feedback specifically. Maintain accuracy with the original brief and preserve the parts of the previous translation the feedback did not call out. Only change what needs to change. Project title can stay the same unless the feedback explicitly asks for a rename.`

  return translateBriefV3(augmentedBrief, { onSection })
}

// Slimmed serialisation for revision prompts. Sends only the most
// recent content per section (not the full JSON shape, which would
// blow up the prompt token count).
function serializePreviousTranslationV3(prev) {
  if (!prev || !Array.isArray(prev.sections)) return ''
  const lines = []
  lines.push(`Title: ${prev.projectTitle || 'Untitled'}`)
  for (const s of prev.sections) {
    if (!s.content || s.content.__pending_phase || s.content.__error) continue
    lines.push(`\n## ${s.title}`)
    try {
      lines.push(JSON.stringify(s.content).slice(0, 1200))
    } catch {}
  }
  return lines.join('\n')
}

// ────────────────────────────────────────────────────────────────────
// snapshotForRevisionsV3 — deep clone of a result for version history.
// ────────────────────────────────────────────────────────────────────
export function snapshotForRevisionsV3(result, { label } = {}) {
  return {
    label: label || 'Original',
    capturedAt: new Date().toISOString(),
    schemaVersion: BRIEF_V3_SCHEMA_VERSION,
    projectTitle: result?.projectTitle || 'Untitled brief',
    sections: structuredCloneSafe(result?.sections) || [],
  }
}

function structuredCloneSafe(v) {
  if (v == null) return v
  try {
    if (typeof structuredClone === 'function') return structuredClone(v)
  } catch {}
  try { return JSON.parse(JSON.stringify(v)) } catch {}
  return v
}

function safeJsonParse(text) {
  if (!text) return {}
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
  return {}
}

// Detection helper used by Dashboard to route to the V3 renderer.
export function isV3Result(r) {
  return r?.schemaVersion === BRIEF_V3_SCHEMA_VERSION && Array.isArray(r?.sections)
}
