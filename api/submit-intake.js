import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const MODEL = 'claude-sonnet-4-6'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractJSON(text) {
  try { return JSON.parse(text) } catch {}
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fence) try { return JSON.parse(fence[1].trim()) } catch {}
  const m = text.match(/\{[\s\S]*\}/)
  if (m) try { return JSON.parse(m[0]) } catch {}
  return null
}

async function callClaude(system, message, maxTokens) {
  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    system,
    messages: [{ role: 'user', content: message }],
  })
  return response.content[0]?.type === 'text' ? response.content[0].text : ''
}

async function callJSON(system, message, maxTokens) {
  const text = await callClaude(system, message, maxTokens)
  return extractJSON(text)
}

// ─── AI functions (mirrored from src/lib/api.js) ──────────────────────────────

async function scoreBrief(briefText) {
  const system = `You are a design brief analyst. Respond ONLY with valid JSON.`
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
${briefText}`
  return callJSON(system, user, 800)
}

async function translateBrief(briefText) {
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

Respond ONLY with valid JSON.`

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
    "displayUse": "<Short description of where display font is used>",
    "bodyUse": "<Short description of where body font is used>",
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
    "primaryCreative": "<main creative role>",
    "secondaryCreatives": ["<other creative roles involved>"]
  },
  "creativeConceptStatement": "<single sharp creative concept sentence specific to this project>",
  "copyVoice": {
    "personality": "<3 words describing the brand voice>",
    "doSay": ["<example sentence showing correct brand voice>", "<another example>", "<third example>"],
    "doNotSay": ["<example of wrong tone>", "<another example>"],
    "writingPrinciples": ["<principle 1>", "<principle 2>", "<principle 3>"]
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
- Do NOT default to orange or green unless the brand specifically calls for it
- All 4 hex codes must have strong contrast ratios
- Never include #5AFFEE or any neon colour
- Every hex must be a valid 6-digit hex code starting with #

CRITICAL typography rules:
- Use EXACTLY 2 fonts — displayFont and bodyFont
- Both must be real Google Fonts or system fonts matched to the brand personality
- Do NOT use Urbanist or DM Mono as displayFont or bodyFont

Brief:
${briefText}`

  return callJSON(system, user, 7000)
}

async function analyseDeep(briefText, projectTitle) {
  const system = `You are a senior product architect. Respond ONLY with valid JSON.`
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
      "subtasks": ["<actionable subtask 1>", "<actionable subtask 2>", "<actionable subtask 3>", "<actionable subtask 4>"]
    }
  ],
  "userFlow": [
    {
      "step": <number>,
      "title": "<screen or action name — max 3 words>",
      "action": "<what the user does — 1-2 sentences specific to this product>",
      "outcome": "<what happens as a result — 1 sentence>",
      "branch": "<alternate path if applicable, empty string if none>"
    }
  ]
}

CRITICAL rules:
- Return ALL 5 techStack keys, each with 3-5 real, production-grade tools
- Every feature's subtasks array MUST have 3-5 actionable items
- Return 6-10 userFlow steps minimum covering the complete journey
- Choose tech stack based on project type and scale

Brief:
${briefText}`

  return callJSON(system, user, 4000)
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { intake_form_id, answers, mood_urls, brief_text } = req.body

  if (!intake_form_id || !brief_text) {
    return res.status(400).json({ error: 'intake_form_id and brief_text are required' })
  }

  // Step 1: Save submission row (service role bypasses RLS)
  let submissionId = null
  try {
    const { data, error } = await supabase
      .from('intake_submissions')
      .insert({
        intake_form_id,
        answers: answers || {},
        mood_urls: mood_urls || '',
        brief_text,
        status: 'translating',
      })
      .select('id')
      .single()

    if (error) {
      console.error('[submit-intake] Insert error:', error)
      return res.status(500).json({ error: 'Failed to save submission' })
    }

    submissionId = data.id
    console.log('[submit-intake] Saved submission:', submissionId)
  } catch (e) {
    console.error('[submit-intake] Exception on insert:', e)
    return res.status(500).json({ error: 'Failed to save submission' })
  }

  // Step 2: Return success to client — client is done waiting
  res.json({ success: true, submissionId })

  // Step 3: AI translation runs after response is sent (Lambda stays alive up to maxDuration)
  try {
    console.log('[submit-intake] Starting AI for:', submissionId)
    const scoreData = await scoreBrief(brief_text)
    const projectTitle = scoreData?.projectTitle ?? 'Project'

    const [translation, analysis] = await Promise.all([
      translateBrief(brief_text),
      analyseDeep(brief_text, projectTitle),
    ])

    const finalResult = {
      ...translation,
      techStack: analysis?.techStack ?? null,
      features: analysis?.features ?? [],
      userFlow: analysis?.userFlow ?? [],
    }

    await supabase
      .from('intake_submissions')
      .update({
        result: finalResult,
        scoring: scoreData,
        status: 'complete',
        completed_at: new Date().toISOString(),
        submitted_at: new Date().toISOString(),
      })
      .eq('id', submissionId)

    await supabase
      .from('intake_forms')
      .update({ status: 'complete', completed_at: new Date().toISOString() })
      .eq('id', intake_form_id)

    console.log('[submit-intake] AI complete for:', submissionId)
  } catch (e) {
    console.error('[submit-intake] AI error for:', submissionId, e.message)

    await supabase
      .from('intake_submissions')
      .update({ status: 'needs_review' })
      .eq('id', submissionId)

    await supabase
      .from('intake_forms')
      .update({ status: 'submitted' })
      .eq('id', intake_form_id)
  }
}
