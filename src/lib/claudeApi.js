// ────────────────────────────────────────────────────────────────────
// claudeApi.js — the SINGLE client-side entry point for /api/claude.
//
// Every AI call in the app routes through callClaude / callClaudeStream
// here (directly or via one of the convenience wrappers below). The
// task type is the source of truth for model selection: never hard-code
// a model id at the call site.
//
// Built on top of the unified /api/claude endpoint which already:
//   - validates the model id against ALLOWED_MODELS
//   - maps Anthropic errors via api/lib/claudeError.js so the messages
//     that reach this file are already user-safe
//   - supports streaming (SSE) when stream:true is set
//
// Retry strategy:
//   - 429 (rate_limited) and 503 (high_demand / service_unavailable)
//     retry up to MAX_RETRIES with an exponential-backoff delay.
//   - 504 (timeout), 4xx (bad_request), 5xx (unexpected) DO NOT retry.
// ────────────────────────────────────────────────────────────────────

import { supabase } from './supabase.js'
import { MODELS, MODEL_FOR, pickModel } from './models.js'
import { designSystemToContext } from './designSystem.js'

// API base — points at the standalone Express API server (Render in
// production, localhost:3001 in dev). Set VITE_API_URL on Vercel to
// the Render URL. Fetches below already template-string this base
// into every /api/claude call, so swapping deployments is one env
// var change away.
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001'
const MAX_RETRIES = 2
const BASE_DELAY_MS = 1500
const DEFAULT_TIMEOUT_MS = 60000

// Per-taskType timeout overrides. Heavy operations (brief_translation
// hits Sonnet with up to 8000 output tokens + a 290-line system
// prompt + a complex 17-field JSON schema) routinely run past 60s on
// busy Anthropic windows, which produced the "taking longer than
// expected" error even when the API was working fine.
const TIMEOUT_BY_TASK = {
  brief_translation: 180000, // 3 minutes
  kanban_generation: 120000, // 2 minutes
  competitors_search: 90000,
  website_builder:   180000,
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

async function authHeader() {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token ? { Authorization: 'Bearer ' + session.access_token } : {}
  } catch {
    return {}
  }
}

function shouldRetry(status) {
  return status === 429 || status === 503
}

function toError(body, status) {
  const err = new Error(body?.message || 'Something interrupted the AI. Your work is safe — please try again.')
  err.status = status
  err.code = body?.error || null
  err.data = body || null
  if (body?.retry_after) err.retryAfter = body.retry_after
  return err
}

// ────────────────────────────────────────────────────────────────────
// callClaude — non-streaming.
// Returns { text, content, usage, model_used }.
// ────────────────────────────────────────────────────────────────────
export async function callClaude({
  taskType,
  system = '',
  userMessage,
  messages,
  tools,
  mode,
  maxTokens = 4000,
  retries = MAX_RETRIES,
  timeoutMs,
} = {}) {
  // Resolve per-task timeout if the caller didn't pass one explicitly.
  if (timeoutMs == null) {
    timeoutMs = TIMEOUT_BY_TASK[taskType] ?? DEFAULT_TIMEOUT_MS
  }
  if (!userMessage && !(Array.isArray(messages) && messages.length)) {
    throw new Error('callClaude needs either userMessage or messages[].')
  }

  const model = pickModel(taskType)
  const auth = await authHeader()
  let lastErr = null

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const res = await fetch(`${API_BASE}/api/claude`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...auth },
        body: JSON.stringify({
          task_type: taskType,
          model,
          system,
          ...(Array.isArray(messages) && messages.length
            ? { messages }
            : { message: userMessage }),
          ...(Array.isArray(tools) && tools.length ? { tools } : {}),
          ...(mode ? { mode } : {}),
          max_tokens: maxTokens,
          stream: false,
        }),
        signal: controller.signal,
      })
      clearTimeout(timer)

      if (res.ok) {
        const data = await res.json().catch(() => ({}))
        const text = data.text
          || (Array.isArray(data.content)
              ? data.content.filter(b => b?.type === 'text').map(b => b.text).join('\n')
              : '')
        return { text, content: data.content, usage: data.usage, model_used: data.model_used, stop_reason: data.stop_reason }
      }

      const errBody = await res.json().catch(() => ({}))
      lastErr = toError(errBody, res.status)
      if (shouldRetry(res.status) && attempt < retries) {
        await sleep(BASE_DELAY_MS * (attempt + 1))
        continue
      }
      throw lastErr
    } catch (e) {
      clearTimeout(timer)
      if (e?.name === 'AbortError') {
        const t = new Error('This brief is taking longer than expected. Try breaking it into smaller sections.')
        t.code = 'timeout'
        throw t
      }
      if (attempt < retries && (e?.code === 'high_demand' || e?.code === 'rate_limited' || e?.status === 429 || e?.status === 503)) {
        lastErr = e
        await sleep(BASE_DELAY_MS * (attempt + 1))
        continue
      }
      throw e
    }
  }

  throw lastErr || new Error('Something interrupted the AI. Your work is safe — please try again.')
}

// ────────────────────────────────────────────────────────────────────
// callClaudeStream — SSE streaming.
// onChunk(text, accumulated) fires per delta.
// onComplete(fullText) fires when the stream ends successfully.
// onError(err) fires once on failure.
// Returns the accumulated full text.
// ────────────────────────────────────────────────────────────────────
export async function callClaudeStream({
  taskType,
  system = '',
  userMessage,
  messages,
  maxTokens = 6000,
  onChunk,
  onComplete,
  onError,
  signal,
} = {}) {
  if (!userMessage && !(Array.isArray(messages) && messages.length)) {
    const err = new Error('callClaudeStream needs userMessage or messages[].')
    onError?.(err)
    throw err
  }

  const model = pickModel(taskType)
  const auth = await authHeader()

  try {
    const res = await fetch(`${API_BASE}/api/claude`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth },
      body: JSON.stringify({
        task_type: taskType,
        model,
        system,
        ...(Array.isArray(messages) && messages.length
          ? { messages }
          : { message: userMessage }),
        max_tokens: maxTokens,
        stream: true,
      }),
      signal,
    })

    if (!res.ok || !res.body) {
      let errBody = {}
      try { errBody = await res.json() } catch {}
      const err = toError(errBody, res.status)
      onError?.(err)
      throw err
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let acc = ''

    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      let idx
      while ((idx = buffer.indexOf('\n\n')) !== -1) {
        const event = buffer.slice(0, idx)
        buffer = buffer.slice(idx + 2)

        for (const line of event.split('\n')) {
          if (!line.startsWith('data: ')) continue
          const payload = line.slice(6).trim()
          if (!payload) continue
          if (payload === '[DONE]') {
            onComplete?.(acc)
            return acc
          }
          try {
            const json = JSON.parse(payload)
            if (typeof json.text === 'string') {
              acc += json.text
              try { onChunk?.(json.text, acc) } catch {}
            } else if (json.error && json.message) {
              const err = toError(json, 500)
              onError?.(err)
              throw err
            }
          } catch (e) {
            if (e?.code) throw e
            // ignore malformed SSE comment lines
          }
        }
      }
    }
    onComplete?.(acc)
    return acc
  } catch (e) {
    if (e?.name !== 'AbortError') {
      // onError already fired for known cases above; fire generically for raw network errors.
      if (!e?.code) {
        const generic = new Error('Something interrupted the AI. Your work is safe — please try again.')
        generic.code = 'unexpected'
        onError?.(generic)
        throw generic
      }
    }
    throw e
  }
}

// ────────────────────────────────────────────────────────────────────
// Convenience wrappers — pre-configured per task type.
// ────────────────────────────────────────────────────────────────────

// JSON-only Sonnet helpers.
const JSON_RULES = 'You respond with valid JSON only. No markdown, no code fences, no commentary. Start with { or [ and end with the matching close brace/bracket.'

export function translateBrief(briefText, templateFormat = 'agency-deck') {
  return callClaude({
    taskType: 'brief_translation',
    maxTokens: 4000,
    system: `You are an expert design strategist and brand consultant. Translate client briefs into structured, actionable design briefs with precision and creative intelligence. ${JSON_RULES}`,
    userMessage: `Translate this client brief into a structured design brief.\nTemplate format: ${templateFormat}\n\nBrief:\n${briefText}\n\nReturn ONLY valid JSON with these keys:\n{\n  "projectUnderstanding": "",\n  "toneAndMood": "",\n  "colorDirection": [],\n  "typographyDirection": "",\n  "brandPersonality": "",\n  "moodboardDirection": "",\n  "redFlags": [],\n  "clientQuestions": [],\n  "budgetEstimate": "",\n  "timeframeEstimate": "",\n  "productRoadmap": "",\n  "techStack": ""\n}`,
  })
}

export function generateKanban(briefResult, projectName) {
  return callClaude({
    taskType: 'kanban_generation',
    maxTokens: 2000,
    system: `You are a senior project manager and creative director who creates precise, actionable task lists from design briefs. ${JSON_RULES}`,
    userMessage: `Based on this design brief, generate a kanban board task list.\n\nProject: ${projectName}\nBrief: ${JSON.stringify(briefResult)}\n\nReturn ONLY a JSON array of 6-12 tasks ordered chronologically (foundation tasks first):\n[\n  { "title": "...", "description": "...", "column_name": "todo", "position": 0, "estimated_days": 2 }\n]`,
  })
}

export function generateTaskPrompt(task, briefContext) {
  return callClaude({
    taskType: 'ai_task_prompt',
    maxTokens: 1200,
    system: `You are a senior creative director who writes precise, inspiring creative briefs for individual design tasks. Output plain text — no markdown headers.`,
    userMessage: `Generate a creative direction prompt for this specific task.\n\nTask: ${task.title}\nDescription: ${task.description || ''}\n\nBrief Context:\nBrand: ${briefContext?.projectName || ''}\nTone: ${briefContext?.tone || briefContext?.toneAndMood || ''}\nColors: ${JSON.stringify(briefContext?.colors || briefContext?.colorDirection || [])}\nTypography: ${briefContext?.typography?.displayFont || briefContext?.typographyDirection || ''}\nPersonality: ${JSON.stringify(briefContext?.brandPersonality || [])}\n\nReturn a structured prompt with: Creative Direction, Design Approach, Interaction & Animation, Copy Direction, Success Metric. Be specific, bold, and inspiring — Stripe / Linear quality.`,
  })
}

// Streaming Opus helper used by the AI website builder (Phase 2). For
// the canonical Phase 2 site builder pipeline (with persistence into
// build_sections), use src/lib/aiBuildEngine.js#buildSection — that
// hits /api/build-section which writes to Supabase as it streams.
// This helper exists for ad-hoc one-shot section builds.
export function buildWebsiteSection({ task, briefContext, previousSections = [], changeRequest = null, system, maxTokens = 6000, onChunk, onComplete, onError, signal } = {}) {
  const previous = previousSections.length
    ? previousSections.map(s => s.task_title || s.title).join(', ')
    : 'None — this is the first section.'

  const briefBlock = `PROJECT CONTEXT:\nName: ${briefContext?.projectName || ''}\nTone: ${briefContext?.tone || briefContext?.toneAndMood || ''}\nColors: ${JSON.stringify(briefContext?.colors || briefContext?.colorDirection || [])}\nTypography: ${briefContext?.typography?.displayFont || briefContext?.typographyDirection || ''}\nBrand personality: ${JSON.stringify(briefContext?.brandPersonality || [])}\nTarget audience: ${briefContext?.projectUnderstanding || ''}`

  const userMessage = [
    'Build this website section.',
    '',
    briefBlock,
    '',
    'SECTIONS ALREADY BUILT:',
    previous,
    '',
    `BUILD THIS SECTION: ${task?.title || ''}`,
    task?.description ? `Details: ${task.description}` : '',
    task?.ai_prompt ? `Creative direction: ${task.ai_prompt}` : '',
    changeRequest ? `\nCHANGE REQUEST: ${changeRequest}\nApply these changes while keeping everything else.` : '',
    '',
    'Return ONLY the HTML for this section. Start with <section> or <div>. No explanation, no markdown, no ```html fences.',
  ].filter(Boolean).join('\n')

  return callClaudeStream({
    taskType: 'website_builder',
    system: system || '',
    userMessage,
    maxTokens,
    onChunk,
    onComplete,
    onError,
    signal,
  })
}

// Haiku helper for short interactive turns. `designSystem` is the
// camelCase output of fetchDesignSystem(projectId) — when present its
// designSystemToContext() rendering is spliced into the system prompt
// so Haiku honours the saved tokens (colors, type, button shape,
// motion, shadow language) on every refinement, not just the brand
// scraps from briefContext.
export function chatRefinement({ userMessage, currentHTML, briefContext = {}, designSystem = null, conversationHistory = [], maxTokens = 3000 } = {}) {
  const messages = []
  for (const m of conversationHistory.slice(-6)) {
    if (m?.role && m?.content) messages.push({ role: m.role, content: m.content })
  }
  messages.push({
    role: 'user',
    content: [
      'Current section HTML:',
      currentHTML || '(empty)',
      '',
      `Brand context:`,
      `Colors: ${JSON.stringify(briefContext?.colors || briefContext?.colorDirection || [])}`,
      `Tone: ${briefContext?.tone || briefContext?.toneAndMood || ''}`,
      '',
      `User request: ${userMessage || ''}`,
      '',
      'Make ONLY the requested change. Return the complete updated HTML. No explanation. Just the HTML.',
    ].join('\n'),
  })

  const dsBlock = designSystem ? designSystemToContext(designSystem) : ''
  const system = [
    'You are a helpful AI assistant inside a website builder. You make precise, targeted changes to website sections based on user requests. Always preserve the brand design system.',
    dsBlock || null,
  ].filter(Boolean).join('\n\n')

  return callClaude({
    taskType: 'chat_refinement',
    maxTokens,
    system,
    messages,
  })
}

// Re-exports so callers can read the model strategy from one place.
export { MODELS, MODEL_FOR, pickModel }
