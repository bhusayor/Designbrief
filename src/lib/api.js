/**
 * api.js — higher-level AI helpers.
 *
 * All AI calls route through our backend proxy. Errors that come back
 * from the server are already mapped to user-safe codes/messages by
 * api/lib/claudeError.js — we just surface them verbatim.
 */

import { supabase } from './supabase.js'
import { KANBAN_TASK_SYSTEM, buildBriefChatSystem } from './aiSystemPrompts.js'
import { callClaude as centralCallClaude, callClaudeStream } from './claudeApi.js'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

// ─── Core fetch helper ────────────────────────────────────────────────────────

async function post(path, body, timeoutMs = 25000) {
  // Attach the current session JWT if available
  const { data: { session } } = await supabase.auth.getSession().catch(() => ({ data: {} }))
  const authHeader = session?.access_token
    ? { 'Authorization': 'Bearer ' + session.access_token }
    : {}

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const res = await fetch(`${API_BASE_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}))
      // The server-side error mapper (api/lib/claudeError.js) gives us:
      //   { error: <code>, message: <user-safe text>, retry_after?: number }
      // We just surface that. No provider-specific language reaches here.
      const message = errData.message || 'Something interrupted the AI. Your work is safe — please try again.'
      const error = new Error(message)
      error.status = res.status
      error.data = errData
      error.code = errData.error || null
      if (errData.retry_after) error.retryAfter = errData.retry_after
      throw error
    }
    return res.json()
  } catch (err) {
    if (err.name === 'AbortError') {
      const timeoutErr = new Error('This brief is taking longer than expected. Try breaking it into smaller sections.')
      timeoutErr.code = 'timeout'
      throw timeoutErr
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
}

// ─── JSON extraction strategies ───────────────────────────────────────────────

function extractJSON(text) {
  if (!text) return null

  // Already an object — return as-is
  if (typeof text === 'object') return text

  const str = String(text).trim()

  // Strip ALL markdown code fences (```json, ```JSON, ```, etc.)
  const stripped = str
    .replace(/^```(?:json|JSON|js|javascript)?\s*/m, '')
    .replace(/\s*```\s*$/m, '')
    .trim()

  // Try parsing stripped version first
  try {
    return JSON.parse(stripped)
  } catch (e1) {}

  // Find first { or [ and parse from there
  const objStart = str.indexOf('{')
  const arrStart = str.indexOf('[')

  let start = -1
  if (objStart === -1) start = arrStart
  else if (arrStart === -1) start = objStart
  else start = Math.min(objStart, arrStart)

  if (start === -1) {
    console.warn('[api] No JSON found in response')
    return null
  }

  const isArray = str[start] === '['
  const openChar = isArray ? '[' : '{'
  const closeChar = isArray ? ']' : '}'

  let depth = 0
  let end = -1
  let inString = false
  let escape = false

  for (let i = start; i < str.length; i++) {
    const ch = str[i]
    if (escape) { escape = false; continue }
    if (ch === '\\' && inString) { escape = true; continue }
    if (ch === '"') { inString = !inString; continue }
    if (inString) continue
    if (ch === openChar) depth++
    else if (ch === closeChar) {
      depth--
      if (depth === 0) { end = i; break }
    }
  }

  if (end === -1) {
    console.warn('[api] Truncated JSON, attempting recovery')
    const partial = str.slice(start)
    for (const attempt of [
      partial + (isArray ? ']' : '}'),
      partial + ']}',
      partial + '}}',
    ]) {
      try { return JSON.parse(attempt) } catch (e) {}
    }
    return null
  }

  try {
    return JSON.parse(str.slice(start, end + 1))
  } catch (e2) {
    console.warn('[api] JSON parse failed:', e2.message, str.slice(start, start + 100))
    return null
  }
}

// ─── Base callers ─────────────────────────────────────────────────────────────

/**
 * callClaudeTools — sends a full conversation with optional tools.
 * Returns { content, stop_reason }.
 *
 * Accepts optional taskType so the server picks the right model
 * (defaults to chat_refinement → Haiku — the in-board chat is the
 * primary user of this entry point).
 */
export async function callClaudeTools({ messages, system = '', maxTokens = 2000, tools, taskType = 'chat_refinement' } = {}) {
  const data = await centralCallClaude({
    taskType,
    system,
    messages,
    tools,
    maxTokens,
  })
  return { content: data.content, stop_reason: data.stop_reason }
}

/**
 * callClaude — returns the raw text string. Positional signature kept
 * for backward compat; pass taskType as the 4th arg to opt into a
 * non-default model. Without taskType the server falls back to Sonnet.
 */
export async function callClaude(systemPrompt, userMessage, maxTokens = 2000, taskType) {
  const data = await centralCallClaude({
    taskType,
    system: systemPrompt,
    userMessage,
    maxTokens,
  })
  return data.text ?? ''
}

/**
 * callJSON — same as callClaude but parses the response as JSON.
 */
export async function callJSON(systemPrompt, userMessage, maxTokens = 4000, taskType) {
  const text = await callClaude(systemPrompt, userMessage, maxTokens, taskType)
  return extractJSON(text)
}

/**
 * callClaudeWithSearch — Claude with web_search injected. Default
 * model = competitors_search (still Sonnet) — the inspirations/
 * competitors lookups are the primary user.
 */
export async function callClaudeWithSearch(systemPrompt, userMessage, maxTokens = 2000, taskType = 'competitors_search') {
  // The new helper handles search mode via the userMessage path; we
  // surface it by sending mode='search' on a hand-built request.
  const { data: { session } } = await supabase.auth.getSession().catch(() => ({ data: {} }))
  const authHeaderObj = session?.access_token
    ? { Authorization: 'Bearer ' + session.access_token }
    : {}
  const res = await fetch(`${API_BASE_URL}/api/claude`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaderObj },
    body: JSON.stringify({
      task_type: taskType,
      system: systemPrompt,
      message: userMessage,
      maxTokens,
      mode: 'search',
    }),
  })
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}))
    const error = new Error(errData.message || 'Something interrupted the AI. Your work is safe — please try again.')
    error.status = res.status
    error.code = errData.error || null
    if (errData.retry_after) error.retryAfter = errData.retry_after
    throw error
  }
  const data = await res.json()
  return data.text ?? ''
}

// ─── Brief analysis ───────────────────────────────────────────────────────────

/**
 * scoreBrief — quick scoring pass (800 tokens).
 * Returns: { clarity, completeness, contradictions, overall,
 *            verdict, summary, issues[], chaosReason }
 */
export async function scoreBrief(briefText) {
  const system = `You are a design brief analyst. Respond ONLY with valid JSON.`;
  const user = `Score this design brief and return JSON with these exact keys:
{
  "clarity": <0-10>,
  "completeness": <0-10>,
  "contradictions": <0-10>,
  "overall": <0-10>,
  "verdict": "<GOOD|FAIR|POOR|CHAOS>",
  "summary": "<one sentence summary>",
  "issues": ["<issue 1>", "<issue 2>"],
  "chaosReason": "<explain if CHAOS, else null>"
}

Brief:
${briefText}`;

  return callJSON(system, user, 800, 'brief_translation');
}

/**
 * translateBrief — full strategic translation (3500 tokens).
 * Returns all 17 fields.
 *
 * `templateId` selects one of the five brief-template aiModifiers
 * (agency-deck / technical-spec / creative-direction / sprint-plan /
 * lean-canvas). The modifier is injected into BOTH the system prompt
 * and the user message so the rewrite tone + emphasis actually shifts
 * per template instead of getting buried.
 */
export async function translateBrief(briefText, templateId = null) {
  // Lazy-load to avoid circular import risk (templates.js is plain).
  let templateModifier = ''
  let templateName = ''
  if (templateId) {
    try {
      const { getBriefTemplate } = await import('./templates.js')
      const tmpl = getBriefTemplate(templateId)
      if (tmpl) {
        templateModifier = tmpl.aiModifier || ''
        templateName = tmpl.name || ''
      }
    } catch {}
  }

  const system = `You are an expert product design strategist. Your job is to translate a client brief into actionable design direction.${templateModifier ? `

TEMPLATE: ${templateName} — ${templateModifier} Apply this voice but stay concise; the schema is fixed.` : ''}

ACCURACY RULES — follow these strictly:
1. Only state facts that are directly supported by the brief. Do not invent project details.
2. If the brief does not mention a platform, infer it carefully from context clues. 'mobile app' = mobile, 'website' = web, 'platform' or 'SaaS' = web, no mention = web.
3. Budget estimates must be realistic for the stated requirements. A simple landing page costs $2k-$8k. A full SaaS product costs $30k-$150k. Never underestimate complexity.
4. Timeline must be realistic. A mobile app with payments takes minimum 12 weeks.
5. Font recommendations must be real Google Fonts or system fonts that exist.
6. Hex colours must be valid 6-digit codes that actually suit the described brand.
7. Competitor names must be real companies that actually exist in this market.
8. Do not pad responses with generic advice. Every sentence must be specific to THIS brief.
9. If information is missing from the brief, ask for clarification in questionsToAsk. Do not invent answers.
10. Tech stack must use real, current technologies appropriate for the scale and budget described.

CRITICAL: You MUST always return a complete, valid JSON object regardless of brief quality.
If the brief is vague, chaotic, or incomplete:
- Set isChaos: true
- Still generate ALL fields with your best interpretation and reasonable assumptions
- Use projectUnderstanding to explain what you inferred from the brief
- Set verdict to CHAOS and overall score to 1-3
- Still provide colorPalette, typography, timeframe, rolesNeeded, and all other fields
- Never return an incomplete or truncated JSON
- A chaotic brief still needs design direction — provide it based on what CAN be inferred

DISCIPLINE DETECTION RULES — follow strictly:
Analyse the brief and detect the creative discipline.

digital-product: brief mentions app, website, SaaS, dashboard, mobile, platform, UX, UI, screens, flows, wireframes, prototype
brand: brief mentions logo, identity, branding, visual identity, brand guidelines, brand book, rebrand, naming, brand strategy
campaign: brief mentions campaign, advertising, ad, commercial, promotion, launch, awareness, OOH, billboard, print ad, media
photography: brief mentions photoshoot, photos, photography, images, shots, editorial, lookbook, product photography, portrait
video: brief mentions video, film, production, shooting, footage, commercial, documentary, YouTube, reel, cinematic
motion: brief mentions animation, motion graphics, After Effects, animated, transitions, micro-interactions, motion design, GIF, Lottie
social-media: brief mentions social media, Instagram, TikTok, content, posts, stories, reels, content strategy, content calendar
illustration: brief mentions illustration, illustrations, artwork, drawing, vector art, character design, icons
print: brief mentions print, poster, flyer, brochure, packaging, magazine, book cover, business card, stationery
game: brief mentions game, gaming, UI for game, game design, levels, characters, game assets
hybrid: brief spans multiple disciplines above

For primaryCreative — detect from context:
  digital-product → UI/UX Designer
  brand → Brand Designer
  campaign → Art Director
  photography → Photographer
  video → Videographer/Director
  motion → Motion Designer
  social-media → Social Media Designer
  illustration → Illustrator
  print → Graphic Designer
  game → Game Designer

For platform:
  If mentions app/mobile/iOS/Android → mobile
  If mentions website/web/SaaS/desktop → web
  If mentions both → both
  If mentions print/physical → print
  If mentions video/film → video
  If mentions social → social
  If mentions packaging/product → physical

Use the detected discipline to adapt all other output sections:

TEAM ROLES RULES (ALL DISCIPLINES):
Generate roles specific to this discipline. Never suggest developer roles for non-technical briefs.
teamRoles is a rich array alongside the flat rolesNeeded string[].
teamRoles shape: [{ role, responsibility, timeCommitment, required, skills[] }]
digital-product: UI/UX Designer, Frontend Developer, Backend Developer, Product Manager, QA Engineer
brand: Brand Strategist, Logo Designer, Graphic Designer, Copywriter, Account Manager
campaign: Creative Director, Art Director, Copywriter, Account Manager, Media Planner, Producer
photography: Photographer, Second Shooter, Photo Editor, Stylist/Prop Stylist, Producer
video: Director, Videographer, Editor, Motion Graphics Designer, Sound Designer, Producer
social-media: Social Media Strategist, Content Creator, Graphic Designer, Copywriter, Community Manager
illustration: Lead Illustrator, Art Director, Copywriter (if needed)
print: Graphic Designer, Copywriter, Print Specialist, Account Manager

BUDGET RULES (ALL DISCIPLINES):
Generate realistic budget breakdown with discipline-specific line items.
Use NGN rates for clearly local Nigerian projects, USD for international scope.
budgetRange.breakdown is an ARRAY of line-item objects — NOT a key/value object.
digital-product line items: Design, Frontend development, Backend development, QA testing, Hosting/infrastructure, Project management
brand line items: Strategy & discovery, Logo design, Brand guidelines, Collateral design, File preparation & delivery
campaign line items: Strategy, Creative concept, Copywriting, Design/production, Media spend (if applicable), Project management
photography line items: Photographer day rate, Second shooter, Equipment/studio hire, Styling, Post-production & retouching, Licensing fees
video line items: Pre-production, Director/crew, Equipment & location, Talent/actors, Post-production & editing, Music licensing
social-media line items: Strategy, Content creation, Photography/video, Copywriting, Scheduling tools, Monthly management
print line items: Design, Copywriting, Photography, Print production, Finishing & delivery
IMPORTANT: Use real market rates. Never return $0 or obviously fake numbers.

TECH STACK:
For non-digital disciplines rename this section:
- Brand/Print → 'Production Tools' (Figma, Illustrator, InDesign, Photoshop)
- Photography → 'Production Setup' (Camera, Lightroom, Photoshop, delivery format)
- Video/Motion → 'Production Tools' (Premiere, After Effects, DaVinci, Lottie)
- Social Media → 'Tools & Platforms' (Figma, CapCut, Canva, scheduling tools)
- Game → 'Game Stack' (Unity/Unreal, Figma, asset tools)

USER FLOW:
For non-digital disciplines adapt the flow:
- Brand → Brand Application Journey (brief → research → concept → refinement → delivery → guidelines)
- Campaign → Campaign Journey (strategy → concept → production → launch → measure)
- Photography/Video → Production Flow (brief → mood board → pre-production → shoot/film → edit → deliver)
- Social Media → Content Journey (strategy → content pillars → creation → schedule → publish → analyse)
- Print → Print Production Flow (brief → concept → design → proof → print → deliver)

FEATURE ANALYSIS:
For non-digital disciplines rename and reframe:
- Brand → 'Brand Elements Priority' (what brand assets to create first)
- Campaign → 'Campaign Elements' (hero assets vs supporting assets)
- Photography/Video → 'Shot/Scene Priority' (essential shots vs nice to have)
- Social Media → 'Content Priority' (hero content vs regular vs experimental)
- Print → 'Design Elements Priority'

PROJECT WORKFLOW RULES (ALL DISCIPLINES):
Generate exactly 8 steps that guide the team from start to finish for THIS specific project.
Use real details from the brief — not generic placeholders.
Adapt the step names and descriptions to the detected discipline:
digital-product: Discovery & Requirements → Information Architecture → Wireframes & User Flows → Visual Design → Prototype & Test → Developer Handoff → Build & QA → Launch
brand: Brand Discovery Workshop → Competitor & Market Audit → Positioning & Strategy → Concept Exploration (3 directions) → Refinement of Chosen Direction → Brand System Build → Guidelines Document → Asset Delivery
campaign: Brief & Objectives Alignment → Audience Research → Creative Strategy → Concept Development → Copy & Creative Production → Review & Approvals → Campaign Setup & Trafficking → Launch & Optimisation
photography: Brief & Mood Board → Location Scouting → Shot List Finalisation → Pre-Production & Styling → Shoot Day → Culling & Selection → Editing & Retouching → Final Delivery
video: Brief & Concept → Script & Storyboard → Pre-Production → Shoot / Production → Rough Cut Review → Edit & Motion Graphics → Sound & Colour Grade → Final Delivery
motion: Brief & Style Frames → Storyboard → Asset Creation → Animation (Rough) → Review & Revisions → Sound Design → Final Render → Delivery Formats
social-media: Strategy & Pillars → Content Calendar → Template Design → Content Production → Scheduling Setup → Community Guidelines → Launch & Monitor → Monthly Reporting
illustration: Brief & Reference Gathering → Rough Sketches (3 concepts) → Client Approval of Direction → Detailed Line Work → Colour & Texture → Revisions → Final Artwork → File Delivery
print: Brief & Specifications → Concept & Layout → Client Review → Copywriting & Photography → Final Design → Print-Ready Files → Print Proof Approval → Production & Delivery
game: Concept & GDD → Prototype → Art Style & Assets → Core Mechanics Build → Level Design → QA & Playtesting → Polish & Optimisation → Launch
Set milestone: true on the 2 most important approval/delivery steps. All other steps have milestone: false.

COMPETITORS RULES (ALL DISCIPLINES):
Research 3-5 real competitors relevant to this brief's discipline and market.
digital-product: competing apps/sites
brand: competing brand identities in the same market
campaign: competing brands with recent campaigns and similar approach
photography: photographers/studios doing similar work
social-media: accounts with similar audience and content type
Each competitor must have: { name, url (real URL), description, strength, weakness, relevance }
IMPORTANT: Only use real companies/brands that actually exist. Never invent competitors.

INSPIRATION RULES (ALL DISCIPLINES):
Generate 4-6 specific, actionable inspiration references the creative team can actually look at.
digital-product → websites, apps, design systems (e.g. "Linear.app for minimal SaaS UI")
brand → brand identities, logos, style guides (e.g. "Mailchimp for friendly yet professional B2B brand")
campaign → specific ad campaigns, marketing moments (e.g. "Nike 'You Can't Stop Us' for split-screen emotional storytelling")
photography → photographers, shoots, visual styles (e.g. "Annie Leibovitz portrait style for dramatic environmental lighting")
video → films, commercials, music videos with specific visual/editing style
social-media → accounts, content styles, viral formats with real @ handles
illustration → illustrators, art movements, styles with real artist names
print → print campaigns, editorial design, publications with real names
Each inspiration: { title, description, url (real URL if possible), why (why relevant to THIS brief specifically), discipline (what aspect to reference) }

GANTT DATA RULES (ALL DISCIPLINES):
Generate a structured timeline based on the projectWorkflow steps and timeframe.
Phases map to the major workflow stages. totalDays must match timeframe.total converted to days.
Tasks within a phase must have non-overlapping day ranges unless parallel work is explicitly logical.
Milestones mark key approval or delivery moments (milestone: true).
Assignee must match a role from rolesNeeded.
Use discipline-appropriate phase colours: discovery=#7C3AED, design=#3B82F6, production=#10B981, delivery=#F59E0B, review=#EF4444.
Schema:
ganttData: {
  totalDays: number,
  startDate: "Day 1",
  phases: [{
    id: "phase-1",
    name: string,
    color: hex string,
    startDay: number,
    endDay: number,
    tasks: [{
      id: "task-1-1",
      name: string,
      startDay: number,
      endDay: number,
      duration: number,
      assignee: string (role),
      milestone: boolean,
      dependencies: string[] (task ids, empty array if none)
    }]
  }]
}

DISCIPLINE-SPECIFIC DATA RULES:

After detecting the discipline, populate the "disciplineData" object with fields relevant ONLY to that discipline.

For digital-product:
  disciplineData: {
    features: [{ name, description, priority, effort }],
    userFlow: string[],
    techStack: { framework, styling, database, hosting, extras[] },
    components: string[]
  }

For brand:
  disciplineData: {
    logoUsage: { dos: string[], donts: string[] },
    brandRules: string[],
    fileFormats: string[],
    printSpecs: string,
    brandPersonality: string[]
  }

For campaign:
  disciplineData: {
    targetAudience: { primary: string, secondary: string, psychographics: string[] },
    campaignGoal: string,
    messagingPillars: string[],
    channels: string[],
    adFormats: string[],
    KPIs: string[],
    callToAction: string
  }

For photography:
  disciplineData: {
    shotList: string[],
    locations: string[],
    moodReference: string[],
    lightingStyle: string,
    deliveryFormats: string[]
  }

For video:
  disciplineData: {
    videoLength: string,
    platforms: string[],
    scriptOutline: string[],
    visualStyle: string,
    music: string,
    deliveryFormats: string[]
  }

For motion:
  disciplineData: {
    animationStyle: string,
    duration: string,
    platforms: string[],
    deliveryFormats: string[],
    software: string[]
  }

For social-media:
  disciplineData: {
    platforms: string[],
    postFormats: string[],
    contentMix: { educational: string, promotional: string, entertainment: string },
    postFrequency: string,
    hashtagStrategy: string,
    engagementGoals: string[]
  }

For illustration:
  disciplineData: {
    styleReference: string[],
    colorRestrictions: string,
    fileFormats: string[],
    usageRights: string,
    technique: string
  }

For print:
  disciplineData: {
    dimensions: string,
    printSpecs: string,
    fileFormats: string[],
    bleedMargins: string,
    colorMode: string,
    paperStock: string
  }

For game:
  disciplineData: {
    platforms: string[],
    genre: string,
    coreMechanics: string[],
    artStyle: string,
    techStack: string[]
  }

For hybrid:
  disciplineData: {
    primaryDisciplineData: object,
    secondaryDisciplineData: object
  }

IMPORTANT RULES FOR disciplineData:
- Only include fields relevant to the detected discipline
- Do NOT include techStack in non-digital briefs
- Do NOT include shotList in non-photography briefs
- Keep all existing 17 fields intact — disciplineData is the 18th field
- If a field has no relevant data from the brief, use null not empty string

Respond ONLY with valid JSON.`;
  const user = `Translate this design brief into a structured strategy document.${templateModifier ? `

Template voice: ${templateName}. ${templateModifier}` : ''}
Return JSON with these exact keys:
{
  "projectTitle": "<title>",
  "projectUnderstanding": "<2-3 sentence strategic summary>",
  "isChaos": <true|false>,
  "chaosSolutions": ["<solution 1>", "<solution 2>"],
  "toneWords": ["<word1>", "<word2>", "<word3>", "<word4>", "<word5>"],
  "colorPalette": [
    { "hex": "#HEX_CODE", "name": "<colour name based on the brand>", "usage": "<what this colour is used for>" }
  ],
  "colorDirection": "<overall colour palette narrative>",
  "typography": {
    "displayFont": "<Font name only — e.g. Playfair Display>",
    "bodyFont": "<Font name only — e.g. Inter>",
    "displayUse": "<Short description of where display font is used — e.g. Hero headings, brand name, section titles>",
    "bodyUse": "<Short description of where body font is used — e.g. Body copy, UI labels, navigation, captions>",
    "rationale": "<One sentence why these two fonts suit this specific brand>",
    "platform": "<web|mobile|both>",
    "scale": {
      "web": [
        { "label": "H1", "size": "64px", "weight": "800", "lineHeight": "72px", "letterSpacing": "-0.02em" },
        { "label": "H2", "size": "48px", "weight": "700", "lineHeight": "56px", "letterSpacing": "-0.01em" },
        { "label": "H3", "size": "32px", "weight": "600", "lineHeight": "40px", "letterSpacing": "0" },
        { "label": "Body", "size": "18px", "weight": "400", "lineHeight": "30px", "letterSpacing": "0" },
        { "label": "Small", "size": "14px", "weight": "400", "lineHeight": "22px", "letterSpacing": "0.01em" },
        { "label": "Label", "size": "12px", "weight": "600", "lineHeight": "16px", "letterSpacing": "0.06em" }
      ],
      "mobile": [
        { "label": "H1", "size": "36px", "weight": "800", "lineHeight": "42px", "letterSpacing": "-0.02em" },
        { "label": "H2", "size": "28px", "weight": "700", "lineHeight": "34px", "letterSpacing": "-0.01em" },
        { "label": "H3", "size": "22px", "weight": "600", "lineHeight": "28px", "letterSpacing": "0" },
        { "label": "Body", "size": "16px", "weight": "400", "lineHeight": "26px", "letterSpacing": "0" },
        { "label": "Small", "size": "13px", "weight": "400", "lineHeight": "20px", "letterSpacing": "0.01em" },
        { "label": "Label", "size": "11px", "weight": "600", "lineHeight": "15px", "letterSpacing": "0.06em" }
      ]
    }
  },
  "brandAxes": [
    { "label": "<axis name>", "left": "<left pole>", "right": "<right pole>", "value": <0-100> }
  ],
  "moodboardKeywords": ["<keyword1>", "<keyword2>", "<keyword3>"],
  "redFlags": ["<flag 1>", "<flag 2>"],
  "questionsToAsk": ["<question 1>", "<question 2>", "<question 3>"],
  "clarityImprovements": ["<improvement 1>", "<improvement 2>"],
  "budgetRange": {
    "low": <number>,
    "high": <number>,
    "currency": "<NGN or USD>",
    "breakdown": [
      { "item": "<line item name>", "low": <number>, "high": <number>, "notes": "<brief context>" }
    ]
  },
  "timeframe": {
    "total": "<total weeks>",
    "taskDays": { "<task name>": <days> }
  },
  "rolesNeeded": ["<role 1>", "<role 2>"],
  "teamRoles": [
    {
      "role": "<role name>",
      "responsibility": "<what they own on this project>",
      "timeCommitment": "<e.g. Full-time 6 weeks, Part-time 2 weeks>",
      "required": <true|false>,
      "skills": ["<skill 1>", "<skill 2>"]
    }
  ],
  "discipline": {
    "type": "<digital-product | brand | campaign | photography | video | motion | social-media | illustration | print | game | hybrid>",
    "platform": "<web | mobile | both | print | video | social | physical>",
    "primaryCreative": "<main creative role — e.g. UI Designer, Brand Designer, Photographer>",
    "secondaryCreatives": ["<other creative roles involved>"]
  },
  "creativeConceptStatement": "<single sharp creative concept sentence that unifies all creative decisions — specific to this project, not generic. Example: 'A premium Nigerian food brand that feels like a Michelin-starred restaurant brought to your kitchen — elevated, warm, and culturally proud.'>",
  "copyVoice": {
    "personality": "<3 words describing the brand voice e.g. Bold, Direct, Warm>",
    "doSay": [
      "<example sentence showing correct brand voice>",
      "<another example sentence>",
      "<third example>"
    ],
    "doNotSay": [
      "<example of wrong tone to avoid>",
      "<another example to avoid>"
    ],
    "writingPrinciples": [
      "<principle 1>",
      "<principle 2>",
      "<principle 3>"
    ]
  },
  "deliverables": [
    {
      "item": "<specific deliverable name>",
      "format": "<file format or specs>",
      "quantity": "<how many>",
      "discipline": "<which creative produces this>",
      "priority": "<ESSENTIAL | IMPORTANT | OPTIONAL>"
    }
  ],
  "disciplineData": {},
  "competitors": [
    {
      "name": "<company or brand name>",
      "url": "<real URL>",
      "description": "<what they do — 1 sentence>",
      "strength": "<what they do particularly well>",
      "weakness": "<gap or opportunity vs this project>",
      "relevance": "<why they are worth comparing to>"
    }
  ],
  "inspiration": [
    {
      "title": "<reference name>",
      "description": "<what it is>",
      "url": "<real URL if possible, else empty string>",
      "why": "<why specifically relevant to this brief>",
      "discipline": "<what aspect of it to reference>"
    }
  ],
  "projectWorkflow": [
    {
      "step": 1,
      "title": "<step name — max 4 words>",
      "description": "<what happens in this step — 1-2 sentences specific to this brief>",
      "duration": "<e.g. 2 days, 1 week>",
      "milestone": false
    }
  ],
  "ganttData": {
    "totalDays": <number>,
    "startDate": "Day 1",
    "phases": [
      {
        "id": "phase-1",
        "name": "<phase name>",
        "color": "<hex colour>",
        "startDay": <number>,
        "endDay": <number>,
        "tasks": [
          {
            "id": "task-1-1",
            "name": "<task name>",
            "startDay": <number>,
            "endDay": <number>,
            "duration": <number>,
            "assignee": "<role>",
            "milestone": false,
            "dependencies": []
          }
        ]
      }
    ]
  }
}

CRITICAL projectWorkflow rules:
- Generate EXACTLY 8 steps
- Each step must be specific to this brief — use real project details, not generic text
- Set milestone: true on exactly 2 steps (the most important approval/delivery moments)
- duration must be a realistic string like "2 days", "1 week", "3 days"

CRITICAL competitors rules:
- Return 3-5 real, existing companies/brands
- url must be a real, working URL (e.g. "https://notion.so")
- Never invent competitor names — only use real brands that actually operate in this market
- weakness must be a genuine gap or opportunity, not just a generic complaint

CRITICAL inspiration rules:
- Return 4-6 specific, named references the team can actually look up
- url should be a real URL when possible; use empty string only when no URL exists
- why must be specific to THIS brief — explain exactly what to take from the reference
- Adapt references to the discipline: no "check Dribbble" generics — name actual works/accounts

CRITICAL ganttData rules:
- totalDays must match timeframe.total converted to working days (1 week = 5 days)
- Tasks within the same phase must not overlap day ranges (unless intentionally parallel)
- At least 2 tasks must have milestone: true
- All task id values must be unique strings like "task-1-1", "task-1-2", "task-2-1"
- dependencies must reference real task ids within the ganttData object, or be an empty array

CRITICAL teamRoles rules:
- Generate roles specific to the detected discipline — never add developer roles to non-technical briefs
- required: true means the project cannot be delivered without this role
- timeCommitment must be realistic (e.g. "Full-time, 8 weeks", "Part-time, 2 days/week for 4 weeks")
- Keep rolesNeeded as a flat string[] (backwards compatibility) AND populate teamRoles

CRITICAL colorPalette rules:
- Return EXACTLY 4 colours — no more, no less
- The 4 colours must cover: Primary, Secondary, Background, and Text/Neutral
- Do NOT default to orange or green unless the brand specifically calls for it (food, health, energy brands only)
- Choose colours that are sophisticated, modern and appropriate for the specific industry:
  Tech/SaaS → blues, purples, neutrals
  Finance → navy, slate, gold
  Healthcare → teal, deep blue, clean white
  Fashion/Luxury → black, gold, cream, grey
  Creative → bold primaries, high contrast
  Food → earthy tones, warm neutrals (not lime green)
- All 4 hex codes must have strong contrast ratios
- Never include #5AFFEE or any neon colour
- Every hex must be a valid 6-digit hex code starting with #
CRITICAL typography rules:
- Use EXACTLY 2 fonts — displayFont and bodyFont
- displayFont is for headings, hero text, brand name
- bodyFont is for body copy, UI labels, navigation
- Both must be real Google Fonts or system fonts matched to the brand personality:
  Luxury/fashion → Cormorant Garamond + DM Sans
  Tech/SaaS → Inter + JetBrains Mono OR Space Grotesk + Inter
  Health/wellness → DM Serif Display + Lato OR Nunito + Mulish
  Finance/legal → Libre Baskerville + Source Sans Pro
  Creative/agency → Fraunces + Work Sans OR Clash Display + Satoshi
  Food/restaurant → Playfair Display + Lato
  Education → Merriweather + Open Sans
  Gaming/entertainment → Rajdhani + Barlow
  Startup/modern → Plus Jakarta Sans + Plus Jakarta Sans (single family)
- Do NOT use Urbanist as displayFont or bodyFont
CRITICAL typography platform rules:
- If the product is ONLY a website: set platform to 'web' and only include the web scale array inside scale
- If the product is ONLY a mobile app: set platform to 'mobile' and only include the mobile scale array inside scale
- If the product includes BOTH website and mobile (web app, responsive app, cross-platform): set platform to 'both' and include both web and mobile scale arrays
- Detect platform from: 'app' 'mobile' 'iOS' 'Android' 'website' 'web' 'landing page' 'SaaS' keywords in the brief
- Scale values should be appropriate for the platform and brand — luxury brands use larger sizes, dense tools use smaller sizes
- All scale values are strings

CRITICAL discipline rules:
- discipline.type must be exactly one of the 11 values listed — no other values allowed
- discipline.platform must reflect what was detected from the brief keywords
- creativeConceptStatement must be a single sentence, specific to THIS project — never generic filler
- copyVoice applies to ALL disciplines — every brand needs a voice, not just copywriting projects
- copyVoice.doSay must be actual example sentences in the brand voice, not descriptions of the voice
- copyVoice.doNotSay must be actual example sentences of the wrong tone, not generic advice

CRITICAL deliverables rules:
- Generate 5-8 deliverables specific to the detected discipline and project scope
- Deliverable items must be concrete and named (e.g. 'Primary logo' not 'Logo work')
- format must specify real file formats or specs appropriate to the discipline
- quantity must be a specific number or range (e.g. '3 variants', '20 selects', '1 document')
- discipline field must match the role who produces that deliverable
- ESSENTIAL = project cannot be delivered without it; IMPORTANT = strongly recommended; OPTIONAL = adds value

Brief:
${briefText}`;

  // 8000 → 5500 → 4000 → 3000 + STREAMING. Streaming keeps the
  // Vercel connection active (no idle-bytes timeout) and lets the
  // client see incremental progress instead of waiting on a single
  // blocking response. Combined with the lower output budget,
  // translation now consistently lands well under the 60s function
  // ceiling on Hobby. Stream chunks accumulate then extractJSON
  // parses the final string (Sonnet emits well-formed JSON at the
  // end whether streamed char-by-char or all at once).
  const text = await callClaudeStream({
    taskType: 'brief_translation',
    system,
    userMessage: user,
    maxTokens: 3000,
  })
  return extractJSON(text)
}

/**
 * analyseDeep — product architecture deep-dive (4000 tokens).
 * Returns: { techStack, features, userFlow }
 */
export async function analyseDeep(briefText, projectTitle) {
  const system = `You are a senior product architect. Respond ONLY with valid JSON.`;
  const user = `Perform a deep technical and product analysis for: "${projectTitle}".
Return JSON with these exact keys:
{
  "techStack": {
    "frontend": ["<3-5 specific UI framework + styling tools>"],
    "backend": ["<3-5 specific server + API layer tools>"],
    "database": ["<3-5 specific primary + caching databases>"],
    "devops": ["<3-5 specific hosting + CI/CD + monitoring tools>"],
    "thirdParty": ["<3-5 specific external services + APIs>"]
  },
  "features": [
    {
      "name": "<feature name>",
      "description": "<one line>",
      "priority": "<HIGH|MEDIUM|LOW>",
      "complexity": "<HIGH|MEDIUM|LOW>",
      "subtasks": ["<specific actionable subtask 1>", "<specific actionable subtask 2>", "<specific actionable subtask 3>", "<specific actionable subtask 4>"]
    }
  ],
  "userFlow": [
    {
      "step": <number>,
      "title": "<screen or action name — max 3 words>",
      "action": "<what the user does on this screen — 1-2 sentences specific to this product>",
      "outcome": "<what happens as a result — 1 sentence>",
      "branch": "<alternate path if applicable, empty string if none>"
    }
  ]
}

CRITICAL techStack rules:
- Return ALL 5 keys: frontend, backend, database, devops, thirdParty
- Each array must have 3-5 specific, real, production-grade tools
- Choose based on project type and scale:
  Small startup → Vercel + Supabase + Next.js
  Enterprise → AWS + PostgreSQL + microservices
  Mobile-first → React Native + Expo + Firebase
  E-commerce → Next.js + Stripe + Redis
- devops must include: hosting platform, CI/CD tool, monitoring service
- thirdParty must include payment, auth, email, analytics services relevant to this product
- No hallucinated or non-existent tools
- Specific names only: 'PostgreSQL', 'Stripe Payments API', 'Vercel'

CRITICAL subtask rules:
- Every feature's subtasks array MUST have 3-5 items
- Each subtask must be a specific, actionable sentence describing exactly what to do
- NEVER return an empty subtasks array
- Good: 'Create wireframe for the login screen showing email field, password field, and CTA button'
- Bad: 'Design screens' (too vague)

CRITICAL userFlow rules:
- Return 6-10 steps minimum
- Steps must represent actual app screens and user interactions for THIS product
- Each step must have all 4 fields: title, action, outcome, branch
- action must be 1-2 sentences specific to this product (not generic)
- Include at least one decision branch point (non-empty branch field)
- Cover the complete user journey from first touch to primary goal completion

Brief:
${briefText}`;

  // Stream + 3000 max tokens (same reasoning as translateBrief
  // above). analyseDeep is now button-triggered so the user gets a
  // visible spinner while it runs, but the underlying call still
  // benefits from streaming's looser connection-timeout behaviour.
  const text = await callClaudeStream({
    taskType: 'brief_translation',
    system,
    userMessage: user,
    maxTokens: 3000,
  })
  return extractJSON(text)
}

/**
 * generateSubtasks — generates specific subtasks for a gantt task.
 * Always returns at least 4 items via hardcoded fallback.
 */
export async function generateSubtasks(taskName, phaseName, projectTitle) {
  try {
    const result = await callJSON(
      'You are a senior project manager. Respond ONLY with valid JSON. Never return empty subtasks.',
      `Generate 4 specific subtasks for this task.

Project: ${projectTitle}
Phase: ${phaseName}
Task: ${taskName}

Each subtask must be a complete actionable sentence describing exactly what needs to be done.

Return this exact JSON structure:
{
  "subtasks": [
    "Review existing user research and identify 3 key pain points to address in this task",
    "Create detailed specifications document with acceptance criteria and edge cases",
    "Build and test the implementation with at least 2 iterations based on feedback",
    "Document the completed work and update project status in the tracking system"
  ]
}

Make subtasks specific to: ${taskName}
Return ONLY the JSON, nothing else.`,
      600,
      'ai_task_prompt'
    )
    if (result?.subtasks?.length > 0) return result.subtasks
    return [
      `Review requirements and create detailed specification for: ${taskName}`,
      `Design and prototype the solution for: ${taskName}`,
      `Implement and test: ${taskName}`,
      `Review, iterate and document: ${taskName}`,
    ]
  } catch (err) {
    console.error('generateSubtasks error:', err)
    return [
      `Plan and specify: ${taskName}`,
      `Execute: ${taskName}`,
      `Test and review: ${taskName}`,
      `Document and complete: ${taskName}`,
    ]
  }
}

/**
 * fetchInspirations — searches for real design references.
 * Returns: [{ name, url, why, category }]
 */
export async function fetchInspirations(projectTitle, toneWords, moodboardKeywords) {
  const system = `You are a creative director with deep knowledge of design references.
Respond ONLY with a valid JSON array.`;
  const user = `Find real design inspiration references for a project called "${projectTitle}".
Tone: ${(toneWords || []).join(', ')}
Keywords: ${(moodboardKeywords || []).join(', ')}

Return a JSON array of objects:
[{ "name": "<site/project name>", "url": "<real URL>", "why": "<why it fits>", "category": "<UI|Brand|Motion|Web|App>" }]

Return 6-8 high-quality, real references.`;

  const text = await callClaudeWithSearch(system, user, 1500, 'inspirations_search');
  return extractJSON(text) ?? [];
}

// ─── Combined runners ─────────────────────────────────────────────────────────

/**
 * translateAndAnalyse — runs score → translate + analyse in parallel.
 * Returns: { scoreData, finalResult }
 */
export async function translateAndAnalyse(briefText, templateId = null, opts = {}) {
  // Score first (fast, 800 tokens — gives early verdict)
  const scoreData = await scoreBrief(briefText);

  // Default: only run scoreBrief + translateBrief. The heavy deep
  // analysis (techStack + features + userFlow) was hitting the 60s
  // Vercel function ceiling when bundled with translateBrief, so it's
  // now an explicit on-demand call — see runDeepAnalysis below, fired
  // by the "Generate Deep Analysis" button on the result page.
  //
  // Callers that genuinely need the deep block inline can pass
  // `{ deep: true }` to restore the old parallel behaviour.
  const translation = await translateBrief(briefText, templateId);

  const finalResult = { ...translation };

  if (opts.deep) {
    try {
      const analysis = await analyseDeep(briefText, scoreData?.projectTitle ?? 'Project');
      finalResult.techStack = analysis?.techStack ?? null;
      finalResult.features = analysis?.features ?? [];
      finalResult.userFlow = analysis?.userFlow ?? [];
    } catch (e) {
      // A deep failure must not nuke the rest of the translation.
      console.warn('[translateAndAnalyse] deep analysis failed:', e?.message)
    }
  }

  if (finalResult && !finalResult.disciplineData) {
    finalResult.disciplineData = {}
  }

  if (finalResult?.discipline) {
    finalResult.discipline = {
      type: finalResult.discipline.type || 'digital-product',
      platform: finalResult.discipline.platform || 'web',
      primaryCreative: finalResult.discipline.primaryCreative || 'Designer',
      secondaryCreatives: finalResult.discipline.secondaryCreatives || [],
    }
  }

  return { scoreData, finalResult };
}

/**
 * runDeepAnalysis — on-demand deep technical breakdown. Returns the
 * techStack / features / userFlow trio that used to be bundled into
 * translateAndAnalyse. Caller is responsible for credit deduction +
 * merging the result back into the brief.
 */
export async function runDeepAnalysis(briefText, projectTitle) {
  const analysis = await analyseDeep(briefText, projectTitle ?? 'Project');
  return {
    techStack: analysis?.techStack ?? null,
    features: analysis?.features ?? [],
    userFlow: analysis?.userFlow ?? [],
  };
}

/**
 * generateKanban — generates role-assigned task board.
 * Returns: { tasks, projectTimeline, unassignedTasks, missingRoles }
 */
export async function generateKanban(briefText, projectTitle, teamMembers = [], briefData = null) {
  const rolesString = teamMembers
    .map(m => m.role + (m.name ? ' (' + m.name + ')' : ''))
    .join(', ');

  const roleList = teamMembers.map(m => m.role);

  const disciplineContext = briefData?.disciplineData
    ? '\n\nDISCIPLINE-SPECIFIC CONTEXT:\nDiscipline: ' +
      (briefData.discipline?.type || 'general') + '\n' +
      'Primary creative: ' + (briefData.discipline?.primaryCreative || 'Designer') + '\n' +
      JSON.stringify(briefData.disciplineData, null, 2)
    : ''

  const schema = JSON.stringify({
    projectTimeline: 'X weeks total',
    tasks: [
      {
        id: 't1',
        title: 'Task title',
        description: 'One sentence description',
        assignedRole: 'Must match a role from team',
        assignedName: '',
        priority: 'HIGH',
        estimatedDays: 3,
        column: 'To Do',
      },
    ],
    unassignedTasks: [
      { title: 'Task needing missing role', suggestedRole: 'Role needed' },
    ],
    missingRoles: [],
  }, null, 2);

  const prompt = [
    'Create a kanban board for this project.',
    'Project: ' + projectTitle,
    'Brief: ' + briefText.slice(0, 1000),
    'Team roles available: ' + rolesString,
    disciplineContext,
    '',
    'CRITICAL RULES:',
    '- Every task assignedRole MUST exactly match one of: ' + roleList.join(', '),
    '- All tasks start with column: To Do',
    '- Generate 8-14 tasks spread across all team roles',
    '- Use real task names specific to this project',
    '',
    'Return ONLY this JSON shape with real values:',
    schema,
  ].join('\n');

  const raw = await callClaude(
    KANBAN_TASK_SYSTEM,
    prompt,
    3500,
    'kanban_generation'
  );

  let data = null;
  try {
    const cleaned = raw.replace(/^[\s\S]*?(\{)/, '{')
                       .replace(/\}[\s\S]*$/, '}')
                       .trim();
    data = JSON.parse(cleaned);
  } catch (e) {
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) {
      try { data = JSON.parse(match[0]); } catch (e2) {}
    }
  }

  if (!data || !Array.isArray(data.tasks)) return null;

  const validCols = ['To Do', 'In Progress', 'Review', 'Done'];
  data.tasks = data.tasks.map((t, i) => ({
    ...t,
    id: t.id || ('task-' + i + '-' + Math.random().toString(36).slice(2, 6)),
    column: validCols.includes(t.column) ? t.column : 'To Do',
    assignedName: t.assignedName || '',
  }));

  return data;
}

/**
 * generateTeamRoles — analyses brief and suggests team composition.
 * Returns: { suggestedRoles[], roleReasoning, projectTitle, isChaos, chaosNote }
 */
export async function generateTeamRoles(briefText) {
  const prompt = [
    'Analyse this project brief and suggest team roles.',
    'Brief: ' + briefText.slice(0, 1000),
    'Return ONLY this JSON with real values:',
    JSON.stringify({
      isChaos: false,
      chaosNote: '',
      projectTitle: 'Project Name',
      suggestedRoles: ['UI Designer', 'Frontend Dev'],
      roleReasoning: 'Why these roles are needed',
    }, null, 2),
    'suggestedRoles must only contain roles from:',
    'UI Designer, UX Designer, Frontend Dev, Backend Dev,',
    'Brand Strategist, Motion Designer, Copywriter,',
    'Project Manager',
  ].join('\n');

  return callJSON(
    'You are a design team strategist. Respond ONLY with valid JSON. No markdown.',
    prompt,
    1000,
    'kanban_generation'
  );
}

/**
 * handleFollowUp — multi-turn chat for kanban board updates.
 * Returns: { displayReply, boardUpdate }
 * boardUpdate is null or a parsed update object.
 */
export async function handleFollowUp(message, kanban, teamMembers, projectTitle, history) {
  const taskSummary = (kanban?.tasks || [])
    .map(t => '[' + t.column + '] ' + t.title +
              ' — ' + t.assignedRole +
              ' (' + t.priority + ')')
    .join('\n');

  const teamStr = teamMembers
    .map(m => (m.name || m.role) + ' (' + m.role + ')')
    .join(', ');

  const system = buildBriefChatSystem({
    projectTitle,
    teamStr,
    taskCount: kanban?.tasks?.length || 0,
  });

  const historyToSend = [
    ...(history || []).slice(-6),
    {
      role: 'user',
      content: 'Current board:\n' + taskSummary + '\n\nUser says: ' + message,
    },
  ];

  let displayReply = 'Sorry, something went wrong. Please try again.';
  let boardUpdate = null;

  try {
    // brief_chat → Haiku for snappy turn-around. Routes through the
    // central client helper so retry + error mapping kick in.
    const rawReply = await callClaude(
      system,
      historyToSend[historyToSend.length - 1].content,
      1200,
      'brief_chat'
    ) || 'I could not process that.'

    const updateMatch = rawReply.match(/BOARD_UPDATE:(\{[\s\S]*?\})\s*$/m);
    displayReply = rawReply.replace(/BOARD_UPDATE:\{[\s\S]*?\}\s*$/m, '').trim();

    if (updateMatch) {
      try { boardUpdate = JSON.parse(updateMatch[1]); }
      catch (e) { boardUpdate = null; }
    }
  } catch (e) {
    displayReply = e?.message || 'Something interrupted the AI. Your work is safe — please try again.'
  }

  return { displayReply, boardUpdate };
}

/**
 * analyseCompetitors — analyses competitors using Claude (no web search).
 * Returns: [{ name, url, category, description, strengths[], weakness, differentiator, marketShare, pricing, rating, userBase }]
 */
export async function analyseCompetitors(projectTitle, industry, toneWords = [], briefText = '') {
  if (!projectTitle) return []
  const context = [
    projectTitle,
    industry,
    (toneWords || []).join(', '),
    briefText ? briefText.slice(0, 500) : '',
  ].filter(Boolean).join(' — ')

  const system = `You are a market research analyst with deep knowledge of competitive landscapes. Respond ONLY with a valid JSON array. No markdown, no code fences.`
  const user = `Analyse competitors for this project: "${context}".

Return a JSON array of 4-5 real, well-known competitors in this exact shape:
[{
  "name": "<company name>",
  "url": "<real URL e.g. https://example.com>",
  "category": "<Direct|Indirect|Aspirational>",
  "description": "<what they do, 1-2 sentences>",
  "strengths": ["<strength 1>", "<strength 2>"],
  "weakness": "<one notable weakness>",
  "differentiator": "<how this project can stand out vs this competitor>",
  "marketShare": "<e.g. 'Large – 40%+' or 'Medium – 10-20%' or 'Small – <5%'>",
  "pricing": "<e.g. 'Freemium', '$10-50/mo', 'Enterprise', 'Free'>",
  "rating": <1-5 integer based on overall market reputation>,
  "userBase": "<e.g. '10M+ users', 'Enterprise-focused', 'SMBs'>"}]`

  const result = await callJSON(system, user, 2500, 'competitors_search')
  return Array.isArray(result) ? result : []
}

/**
 * processIntakeSubmission — converts raw client intake into a full brief document.
 * Returns complete brief document from translateAndAnalyse.
 */
export async function processIntakeSubmission(intakeData) {
  const sections = Object.entries(intakeData)
    .map(([sectionId, answers]) => {
      const lines = Object.entries(answers)
        .map(([question, answer]) => `Q: ${question}\nA: ${answer}`)
        .join('\n\n');
      return `## ${sectionId.toUpperCase()}\n${lines}`;
    })
    .join('\n\n---\n\n');

  const briefText = `CLIENT INTAKE SUBMISSION\n\n${sections}`;
  return translateAndAnalyse(briefText);
}
