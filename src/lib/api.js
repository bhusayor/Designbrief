/**
 * api.js — Higher-level Claude API helpers for DesignBrief AI
 *
 * Uses the same backend proxy pattern as src/services/aiService.js.
 * All Claude calls go through the Express / Vercel API routes to keep
 * the Anthropic API key server-side.
 */

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

// ─── Core fetch helper ────────────────────────────────────────────────────────

async function post(path, body) {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `API error: ${res.status}`);
  }
  return res.json();
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
 * Returns { content, stop_reason } where content is an array of blocks.
 */
export async function callClaudeTools({ messages, system = '', maxTokens = 2000, tools } = {}) {
  return post('/api/claude-tools', { messages, system, maxTokens, tools })
}

/**
 * callClaude — returns raw text string from Claude.
 */
export async function callClaude(systemPrompt, userMessage, maxTokens = 2000) {
  const data = await post('/api/claude', {
    system: systemPrompt,
    message: userMessage,
    maxTokens,
  });
  return data.text ?? '';
}

/**
 * callJSON — returns parsed JSON object, or null on failure.
 */
export async function callJSON(systemPrompt, userMessage, maxTokens = 4000) {
  const text = await callClaude(systemPrompt, userMessage, maxTokens);
  return extractJSON(text);
}

/**
 * callClaudeWithSearch — calls Claude with web_search tool enabled.
 * Returns concatenated text from all text content blocks.
 */
export async function callClaudeWithSearch(systemPrompt, userMessage, maxTokens = 2000) {
  const data = await post('/api/claude-search', {
    system: systemPrompt,
    message: userMessage,
    maxTokens,
  });
  return data.text ?? '';
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

  return callJSON(system, user, 800);
}

/**
 * translateBrief — full strategic translation (3500 tokens).
 * Returns all 17 fields.
 */
export async function translateBrief(briefText) {
  const system = `You are an expert product design strategist. Your job is to translate a client brief into actionable design direction.

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

ROLES: Only suggest roles relevant to the discipline. A photography brief needs Photographer, Photo Editor, Art Director, Stylist — NOT a Frontend Developer.

BUDGET: Line items must match the discipline.
Photography → equipment, location, talent, editing, licensing.
Brand → strategy, logo design, guidelines, asset creation.
Video → pre-production, filming, editing, sound, colour grade.
Social media → content creation, copywriting, scheduling, community management.

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

Respond ONLY with valid JSON.`;
  const user = `Translate this design brief into a structured strategy document.
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
    "low": "<low estimate>",
    "high": "<high estimate>",
    "breakdown": { "<phase>": "<cost>" }
  },
  "timeframe": {
    "total": "<total weeks>",
    "taskDays": { "<task name>": <days> }
  },
  "rolesNeeded": ["<role 1>", "<role 2>"],
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
  ]
}

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
- Do NOT use Urbanist or DM Mono as displayFont or bodyFont
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

  return callJSON(system, user, 7000);
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

  return callJSON(system, user, 4000);
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
      600
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

  const text = await callClaudeWithSearch(system, user, 1500);
  return extractJSON(text) ?? [];
}

// ─── Combined runners ─────────────────────────────────────────────────────────

/**
 * translateAndAnalyse — runs score → translate + analyse in parallel.
 * Returns: { scoreData, finalResult }
 */
export async function translateAndAnalyse(briefText) {
  // Score first (fast, 800 tokens — gives early verdict)
  const scoreData = await scoreBrief(briefText);

  // Translate + deep analyse in parallel
  const [translation, analysis] = await Promise.all([
    translateBrief(briefText),
    analyseDeep(briefText, scoreData?.projectTitle ?? 'Project'),
  ]);

  const finalResult = {
    ...translation,
    techStack: analysis?.techStack ?? null,
    features: analysis?.features ?? [],
    userFlow: analysis?.userFlow ?? [],
  };

  return { scoreData, finalResult };
}

/**
 * generateKanban — generates role-assigned task board.
 * Returns: { tasks, projectTimeline, unassignedTasks, missingRoles }
 */
export async function generateKanban(briefText, projectTitle, teamMembers = []) {
  const rolesString = teamMembers
    .map(m => m.role + (m.name ? ' (' + m.name + ')' : ''))
    .join(', ');

  const roleList = teamMembers.map(m => m.role);

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
    'You are a project manager. Respond ONLY with valid JSON. No markdown, no code fences. Start with { and end with }.',
    prompt,
    3500
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
    1000
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

  const system = [
    'You are a project management assistant for: ' + projectTitle + '.',
    'Team: ' + teamStr + '.',
    'The board has ' + (kanban?.tasks?.length || 0) + ' tasks.',
    'Help the user update the board or answer questions about the project.',
    'If the user wants a board change, end your reply with ONE BOARD_UPDATE line.',
    'add task:    BOARD_UPDATE:{"action":"add_task","task":{"id":"t-new","title":"...","description":"...","assignedRole":"...","assignedName":"","priority":"MEDIUM","estimatedDays":2,"column":"To Do"}}',
    'add tasks:   BOARD_UPDATE:{"action":"add_tasks","tasks":[{task1},{task2}]}',
    'move:        BOARD_UPDATE:{"action":"move","taskId":"...","column":"In Progress"}',
    'priority:    BOARD_UPDATE:{"action":"priority","taskId":"...","priority":"HIGH"}',
    'reassign:    BOARD_UPDATE:{"action":"reassign","taskId":"...","assignedRole":"...","assignedName":""}',
    'Only include BOARD_UPDATE when user explicitly requests a change.',
    'Otherwise reply conversationally.',
  ].join(' ');

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
    const res = await fetch(
      (import.meta.env.VITE_API_BASE_URL || '') + '/api/claude',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system,
          message: historyToSend[historyToSend.length - 1].content,
          maxTokens: 1200,
        }),
      }
    );
    const data = await res.json();
    const rawReply = data.text || 'I could not process that.';

    const updateMatch = rawReply.match(/BOARD_UPDATE:(\{[\s\S]*?\})\s*$/m);
    displayReply = rawReply.replace(/BOARD_UPDATE:\{[\s\S]*?\}\s*$/m, '').trim();

    if (updateMatch) {
      try { boardUpdate = JSON.parse(updateMatch[1]); }
      catch (e) { boardUpdate = null; }
    }
  } catch (e) {
    displayReply = 'Something went wrong. Please try again.';
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

  const result = await callJSON(system, user, 2500)
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
