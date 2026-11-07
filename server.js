// ────────────────────────────────────────────────────────────────────
// server.js, DesignBrief AI API server (Express).
//
// Deployment target: Render (https://render.com). The Vercel deploy
// continues to host the frontend; this server handles the AI proxy
// + Pexels proxy and is reached via VITE_API_BASE_URL on the frontend.
//
// Routes:
//   GET  /health     → { status: 'ok' }     liveness check
//   POST /api/ai      → unified OpenAI Responses proxy
//   POST /api/pexels  → media search proxy   (ports api/pexels.js)
//
// Env required:
//   PORT                      , Render injects; falls back to 3001
//   OPENAI_API_KEY            , OpenAI project key
//   PEXELS_API_KEY            , Pexels free-tier key
//   VITE_SUPABASE_URL         , used by requireAuth in api/lib/
//   SUPABASE_SERVICE_ROLE_KEY , used by requireAuth in api/lib/
//   CORS_ORIGINS              , comma-separated allowlist (frontend
//                                Vercel URL + any preview/test URLs).
//                                Defaults to localhost dev origins.
//
// The shared auth / error / model helpers are imported from the
// existing api/lib/ + src/lib/ paths so this server and the Vercel
// /api functions stay on a single source of truth until the Vercel
// /api folder is retired.
// ────────────────────────────────────────────────────────────────────

import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import aiHandler from './api/ai.js'
import buildComponentHandler from './api/build-component.js'
import buildSectionHandler from './api/build-section.js'
import createWorkspaceHandler from './api/create-workspace.js'
import intakeFollowupHandler from './api/intake-followup.js'
import inviteHandler from './api/invite.js'
import publishBuildHandler from './api/publish-build.js'
import sendIntakeEmailHandler from './api/send-intake-email.js'
import settingsHandler from './api/settings.js'
import { runIntakePipeline } from './intake-pipeline.js'
import {
  createBriefReview,
  createQuickLink,
  getBriefReviewByToken,
  submitBriefReviewDecision,
  submitSectionDecision,
  addBriefReviewComment,
  setBriefReviewCommentStatus,
  resolveAllProjectComments,
  getBriefReviewByProject,
} from './server-lib/briefReviews.js'

const app = express()
const PORT = process.env.PORT || 3001

// ── CORS ───────────────────────────────────────────────────────────
// Comma-separated allowlist via env, on top of two built-in
// allowances:
//   1. Tools that send no Origin header (curl, server-to-server)
//      always pass.
//   2. Vercel domains (*.vercel.app) always pass. Every Vercel
//      deployment, preview branches, production, lives on this
//      domain, so allowing it by default means a freshly deployed
//      Vercel frontend can talk to Render immediately without any
//      env-var configuration on the Render side.
//
// Anything else needs to be on the explicit CORS_ORIGINS list.
const allowedOrigins = (
  process.env.CORS_ORIGINS ||
  'http://localhost:5173,http://localhost:3000,http://localhost:4173'
)
  .split(',')
  .map(s => s.trim())
  .filter(Boolean)

function isAllowedOrigin(origin) {
  if (!origin) return true
  if (allowedOrigins.includes(origin)) return true
  // Match any *.vercel.app subdomain (production + preview deploys).
  // Strictly verifies the protocol + hostname tail; query strings
  // and ports don't appear in origin values.
  try {
    const { hostname, protocol } = new URL(origin)
    if (protocol === 'https:' && hostname.endsWith('.vercel.app')) return true
  } catch {}
  return false
}

app.use(cors({
  origin: (origin, cb) => {
    if (isAllowedOrigin(origin)) return cb(null, true)
    return cb(new Error(`CORS: origin ${origin} not allowed. Add it to CORS_ORIGINS on Render.`))
  },
  credentials: true,
}))

app.use(express.json({ limit: '2mb' }))

// ── /health ────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' })
})

app.post('/api/ai', aiHandler)

// Vercel-compatible handlers are also mounted here so the Render API is
// the complete backend. Keeping one handler implementation per route lets
// Vercel remain a short-term fallback without maintaining two code paths.
app.all('/api/build-component', buildComponentHandler)
app.all('/api/build-section', buildSectionHandler)
app.all('/api/create-workspace', createWorkspaceHandler)
app.all('/api/intake-followup', intakeFollowupHandler)
app.all('/api/invite', inviteHandler)
app.all('/api/publish-build', publishBuildHandler)
app.all('/api/send-intake-email', sendIntakeEmailHandler)
app.all('/api/settings', settingsHandler)

// ────────────────────────────────────────────────────────────────────
// POST /api/pexels, full port of api/pexels.js
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
// POST /api/process-intake, Phase 4 of the Client Intake Form
// rebuild. Runs the 8-step pipeline (enrichment → brief assembly →
// V2 translation → design system → kanban → notification). Returns
// 202 immediately so the client doesn't wait for the full ~30-60s
// processing; the pipeline runs asynchronously and updates the
// submission row's status as each step lands.
//
// No auth, the public client form needs to call this right after
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

// ────────────────────────────────────────────────────────────────────
// POST /api/web-search, Brave Search proxy. Used by the brief
// translator to enrich competitor analysis with real homepage URLs
// (so the comparison table renders working links instead of name-
// only chips).
//
// Body: { query, count? }
// Returns: { results: [{ title, url, description }] }
//
// Gracefully degrades to an empty result list (200, results: [])
// when BRAVE_API_KEY isn't configured, so the brief still renders
// without competitor URLs.
// ────────────────────────────────────────────────────────────────────
app.post('/api/web-search', async (req, res) => {
  const { query, count = 3 } = req.body || {}
  if (!query || typeof query !== 'string') {
    return res.status(400).json({ error: 'bad_request', message: 'query (string) is required' })
  }
  if (!process.env.BRAVE_API_KEY) {
    // Soft failure: caller treats empty results as "no link found"
    // and renders the competitor without a link. This means the
    // brief never blocks on missing search credentials.
    return res.status(200).json({ results: [], degraded: 'no_api_key' })
  }
  const cleaned = query.trim().slice(0, 200)
  const capped = Math.max(1, Math.min(10, Number(count) || 3))
  try {
    const r = await fetch(
      `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(cleaned)}&count=${capped}`,
      {
        headers: {
          'Accept': 'application/json',
          'X-Subscription-Token': process.env.BRAVE_API_KEY,
        },
      }
    )
    if (!r.ok) {
      console.warn('[web-search] brave upstream', r.status)
      return res.status(200).json({ results: [], degraded: 'upstream_' + r.status })
    }
    const data = await r.json()
    const results = (data?.web?.results || []).slice(0, capped).map(x => ({
      title: x.title,
      url: x.url,
      description: x.description,
    }))
    return res.status(200).json({ results })
  } catch (e) {
    console.error('[web-search] failed', e?.message || e)
    return res.status(200).json({ results: [], degraded: 'exception' })
  }
})

// ────────────────────────────────────────────────────────────────────
// Brief reviews, client-facing approval flow
// ────────────────────────────────────────────────────────────────────
app.post('/api/brief-reviews', createBriefReview)
app.post('/api/brief-reviews/quick-link', createQuickLink)
app.get('/api/brief-reviews/by-token/:token', getBriefReviewByToken)
app.post('/api/brief-reviews/by-token/:token/decision', submitBriefReviewDecision)
app.post('/api/brief-reviews/by-token/:token/section-decision', submitSectionDecision)
app.post('/api/brief-reviews/by-token/:token/comments', addBriefReviewComment)
app.patch('/api/brief-reviews/comments/:commentId/status', setBriefReviewCommentStatus)
app.post('/api/brief-reviews/by-project/:projectId/comments/resolve-all', resolveAllProjectComments)
app.get('/api/brief-reviews/by-project/:projectId', getBriefReviewByProject)

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
  console.log('  POST /api/ai')
  console.log('  POST /api/pexels')
  console.log('  POST /api/process-intake')
  console.log('CORS origins:', allowedOrigins.join(', '))
})
