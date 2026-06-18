// ────────────────────────────────────────────────────────────────────
// server.js — DesignBrief AI API server (Express).
//
// Deployment target: Render (https://render.com). The Vercel deploy
// continues to host the frontend; this server handles the AI proxy
// + Pexels proxy and is reached via VITE_API_URL on the frontend.
//
// Routes:
//   GET  /health     → { status: 'ok' }     liveness check
//   POST /api/claude  → unified Claude proxy (ports api/claude.js)
//   POST /api/pexels  → media search proxy   (ports api/pexels.js)
//
// Env required:
//   PORT                       — Render injects; falls back to 3001
//   ANTHROPIC_API_KEY          — Anthropic key
//   PEXELS_API_KEY             — Pexels free-tier key
//   VITE_SUPABASE_URL          — used by requireAuth in api/lib/
//   SUPABASE_SERVICE_ROLE_KEY  — used by requireAuth in api/lib/
//   CORS_ORIGINS               — comma-separated allowlist (frontend
//                                Vercel URL + any preview/test URLs).
//                                Defaults to localhost dev origins.
//
// The shared auth / error / model helpers are imported from the
// existing api/lib/ + src/lib/ paths so this server and the Vercel
// /api functions stay on a single source of truth until the Vercel
// /api folder is retired.
// ────────────────────────────────────────────────────────────────────

import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import Anthropic from '@anthropic-ai/sdk'

import { requireAuth, checkRateLimit, logUsage } from './server-lib/authMiddleware.js'
import { mapClaudeError } from './server-lib/claudeError.js'
import { pickModel } from './src/lib/models.js'
import { runIntakePipeline } from './intake-pipeline.js'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 3001

// ── CORS ───────────────────────────────────────────────────────────
// Comma-separated allowlist via env. Tools that send no Origin
// header (curl, server-to-server) are always allowed. An origin
// that's not listed is rejected with a clear error so misconfig
// surfaces fast instead of silently failing.
const allowedOrigins = (
  process.env.CORS_ORIGINS ||
  'http://localhost:5173,http://localhost:3000,http://localhost:4173'
)
  .split(',')
  .map(s => s.trim())
  .filter(Boolean)

app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true)
    if (allowedOrigins.includes(origin)) return cb(null, true)
    return cb(new Error(`CORS: origin ${origin} not in CORS_ORIGINS allowlist`))
  },
  credentials: true,
}))

app.use(express.json({ limit: '2mb' }))

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// ── /health ────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' })
})

// ────────────────────────────────────────────────────────────────────
// POST /api/claude — full port of api/claude.js
//
// Unified Claude proxy. One endpoint, four call shapes:
//   - simple non-streaming (message)
//   - tools mode (messages[] + tools[])
//   - search mode (web_search auto-injected)
//   - streaming SSE (stream: true)
//
// Model selection is task_type-driven via pickModel; the explicit
// client model is accepted but validated against ALLOWED_MODELS so a
// malformed request can never escalate cost or hit an unintended model.
// ────────────────────────────────────────────────────────────────────
app.post('/api/claude', async (req, res) => {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('[claude] ANTHROPIC_API_KEY missing in env')
    return res.status(503).json({
      error: 'service_unavailable',
      message: 'AI features are temporarily unavailable. Try again shortly.',
    })
  }

  const auth = await requireAuth(req, res)
  if (!auth) return
  const { user, supabase } = auth

  const allowed = await checkRateLimit(supabase, user.id, res)
  if (!allowed) return

  const body = req.body || {}
  const {
    message,
    messages,
    system = '',
    maxTokens,
    max_tokens,
    tools,
    mode,
    webSearch,
    model: requestedModel,
    task_type,
    stream: shouldStream,
  } = body

  const finalMaxTokens = Math.min(maxTokens ?? max_tokens ?? 2000, 8096)
  const model = pickModel(task_type, requestedModel)

  const isTools = Array.isArray(messages) && messages.length > 0
  const isSearch = !isTools && (mode === 'search' || webSearch === true)

  if (!isTools && !message) {
    return res.status(400).json({
      error: 'bad_request',
      message: 'Missing message in request.',
    })
  }

  try {
    console.log('[claude]', JSON.stringify({
      task: task_type || 'unspecified',
      model,
      stream: !!shouldStream,
      mode: isTools ? 'tools' : isSearch ? 'search' : 'simple',
    }))
  } catch {}

  // ── Streaming path (SSE) ─────────────────────────────────────────
  if (shouldStream) {
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    if (typeof res.flushHeaders === 'function') res.flushHeaders()

    try {
      const stream = client.messages.stream({
        model,
        max_tokens: finalMaxTokens,
        ...(system && { system }),
        messages: isTools ? messages : [{ role: 'user', content: message }],
        ...(isTools && Array.isArray(tools) && tools.length ? { tools } : {}),
        ...(isSearch ? { tools: [{ type: 'web_search_20250305', name: 'web_search' }] } : {}),
      })

      let total = 0
      stream.on('text', (text) => {
        total += text.length
        res.write(`data: ${JSON.stringify({ text })}\n\n`)
      })
      stream.on('finalMessage', () => {
        try {
          logUsage(supabase, user.id, task_type || 'claude-stream', total)
        } catch {}
        res.write('data: [DONE]\n\n')
        res.end()
      })
      stream.on('error', (err) => {
        const { body: errBody } = mapClaudeError(err, '[claude-stream]')
        res.write(`data: ${JSON.stringify(errBody)}\n\n`)
        res.end()
      })
    } catch (e) {
      const { status, body: errBody } = mapClaudeError(e, '[claude-stream]')
      if (!res.headersSent) return res.status(status).json(errBody)
      res.write(`data: ${JSON.stringify(errBody)}\n\n`)
      res.end()
    }
    return
  }

  // ── Non-streaming path ───────────────────────────────────────────
  try {
    const params = {
      model,
      max_tokens: finalMaxTokens,
      ...(system && { system }),
    }
    if (isTools) {
      params.messages = messages
      if (Array.isArray(tools) && tools.length) params.tools = tools
    } else {
      params.messages = [{ role: 'user', content: message }]
      if (isSearch) {
        params.tools = [{ type: 'web_search_20250305', name: 'web_search' }]
      }
    }

    const response = await client.messages.create(params)

    const tokensUsed =
      (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0)
    logUsage(
      supabase,
      user.id,
      task_type || (isTools ? 'claude-tools' : isSearch ? 'claude-search' : 'claude'),
      tokensUsed,
    )

    if (isTools) {
      return res.json({
        content: response.content,
        stop_reason: response.stop_reason,
        usage: response.usage,
        model_used: model,
      })
    }

    const content = Array.isArray(response.content) ? response.content : []
    const text = content
      .filter(b => b && b.type === 'text')
      .map(b => b.text)
      .join('\n')

    return res.json({
      content,
      text,
      usage: response.usage,
      model_used: model,
    })
  } catch (error) {
    const { status, body: errBody } = mapClaudeError(error, '[claude]')
    return res.status(status).json(errBody)
  }
})

// ────────────────────────────────────────────────────────────────────
// POST /api/pexels — full port of api/pexels.js
//
// Body: { query, type='video'|'photo', orientation, per_page, size }
// Returns the top 3 results in a stable shape the client can drop
// straight into a <video> / <img> tag.
// ────────────────────────────────────────────────────────────────────
app.post('/api/pexels', async (req, res) => {
  if (!process.env.PEXELS_API_KEY) {
    console.error('[pexels] PEXELS_API_KEY missing in env')
    return res.status(503).json({
      error: 'service_unavailable',
      message: 'Media library is temporarily unavailable.',
    })
  }

  const {
    query,
    type = 'video',
    orientation = 'landscape',
    per_page = 5,
    size = 'large',
  } = req.body || {}

  if (!query) {
    return res.status(400).json({
      error: 'bad_request',
      message: 'A search query is required.',
    })
  }

  const cleanQuery = String(query)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s+]/g, ' ')
    .replace(/\s+/g, ' ')
    .slice(0, 100)
    .trim()

  const cappedPerPage = Math.max(1, Math.min(15, Number(per_page) || 5))
  const validOrientations = new Set(['landscape', 'portrait', 'square'])
  const finalOrientation = validOrientations.has(orientation) ? orientation : 'landscape'
  const validSizes = new Set(['large', 'medium', 'small'])
  const finalSize = validSizes.has(size) ? size : 'large'

  const params = new URLSearchParams({
    query: cleanQuery,
    orientation: finalOrientation,
    per_page: String(cappedPerPage),
    size: finalSize,
  })

  const baseUrl = type === 'photo'
    ? 'https://api.pexels.com/v1/search'
    : 'https://api.pexels.com/videos/search'

  try {
    const resp = await fetch(`${baseUrl}?${params.toString()}`, {
      headers: { Authorization: process.env.PEXELS_API_KEY },
    })
    if (!resp.ok) {
      console.error('[pexels] upstream ' + resp.status)
      return res.status(502).json({
        error: 'media_search_failed',
        message: 'Could not find matching media. CSS animation will be used instead.',
      })
    }
    const data = await resp.json()

    if (type === 'photo') {
      const images = (data.photos || [])
        .slice(0, 3)
        .map(p => ({
          id: p.id,
          url: p.src?.original || p.src?.large2x || '',
          large: p.src?.large2x || p.src?.large || '',
          medium: p.src?.large || '',
          small: p.src?.medium || '',
          thumbnail: p.src?.small || '',
          alt: p.alt || '',
          photographer: p.photographer || '',
          avg_color: p.avg_color || null,
          pexels_url: p.url || '',
        }))
        .filter(p => p.url)
      return res.status(200).json({ type: 'photo', results: images, query: cleanQuery })
    }

    const videos = (data.videos || [])
      .slice(0, 3)
      .map(v => {
        const files = Array.isArray(v.video_files) ? v.video_files : []
        const hd = files.find(f => f.quality === 'hd' && (f.width || 0) >= 1280)
        const sd = files.find(f => f.quality === 'sd')
        const file = hd || sd || files[0]
        return {
          id: v.id,
          url: file?.link || '',
          width: file?.width || 1920,
          height: file?.height || 1080,
          duration: v.duration,
          thumbnail: v.image,
          photographer: v.user?.name || '',
          pexels_url: v.url || '',
        }
      })
      .filter(v => v.url)
    return res.status(200).json({ type: 'video', results: videos, query: cleanQuery })
  } catch (e) {
    console.error('[pexels] error:', e?.message)
    return res.status(502).json({
      error: 'media_search_failed',
      message: 'Could not find matching media. CSS animation will be used instead.',
    })
  }
})

// ────────────────────────────────────────────────────────────────────
// POST /api/process-intake — Phase 4 of the Client Intake Form
// rebuild. Runs the 8-step pipeline (enrichment → brief assembly →
// V2 translation → design system → kanban → notification). Returns
// 202 immediately so the client doesn't wait for the full ~30-60s
// processing; the pipeline runs asynchronously and updates the
// submission row's status as each step lands.
//
// No auth — the public client form needs to call this right after
// submit. The pipeline itself reads + writes via the service-role
// supabase client so RLS isn't a concern. To prevent stranger-
// triggered runs, the pipeline silently no-ops if the submission
// isn't in ['pending', 'failed'] when it loads.
// ────────────────────────────────────────────────────────────────────
app.post('/api/process-intake', async (req, res) => {
  const { submission_id } = req.body || {}
  if (!submission_id) {
    return res.status(400).json({ error: 'bad_request', message: 'submission_id is required' })
  }
  // Acknowledge immediately so the client form's submit flow doesn't
  // wait. The pipeline runs in the background; the Express process
  // keeps it alive until completion.
  res.status(202).json({ ok: true, status: 'queued', submission_id })
  // Fire-and-forget; failures are written to the submission row.
  Promise.resolve(runIntakePipeline(submission_id)).catch(e => {
    console.error('[process-intake] uncaught', e?.message || e)
  })
})

// ── Unhandled-error fallback ───────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error('[server] unhandled error', err)
  if (res.headersSent) return
  res.status(500).json({
    error: 'internal_server_error',
    message: err?.message || 'Unexpected server error.',
  })
})

app.listen(PORT, () => {
  console.log(`DesignBrief API server listening on http://localhost:${PORT}`)
  console.log('  GET  /health')
  console.log('  POST /api/claude')
  console.log('  POST /api/pexels')
  console.log('  POST /api/process-intake')
  console.log('CORS origins:', allowedOrigins.join(', '))
})
