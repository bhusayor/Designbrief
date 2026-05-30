import Anthropic from '@anthropic-ai/sdk'
import { requireAuth, checkRateLimit, logUsage } from './lib/authMiddleware.js'
import { mapClaudeError } from './lib/claudeError.js'
import { pickModel, ALLOWED_MODELS, DEFAULT_MODEL } from '../src/lib/models.js'

// ────────────────────────────────────────────────────────────────────
// Unified Claude proxy. Five things in one file:
//
//   - model selection driven by task_type (with explicit model override
//     accepted from the client, validated against ALLOWED_MODELS so a
//     malformed request can never escalate cost or hit an unintended
//     model)
//   - non-streaming JSON response (single call, default)
//   - non-streaming response with messages[]+tools (tools mode)
//   - non-streaming with web_search auto-injected (search mode)
//   - streaming SSE response when body.stream === true
//
// task_type comes from the central src/lib/models.js MODEL_FOR map.
// Unknown task_type falls back to Sonnet rather than erroring out so a
// fresh feature never blocks itself on a missing entry.
//
// Errors are passed through the shared mapClaudeError helper so the
// user-facing copy is consistent across the app and never leaks the
// AI provider's identity.
// ────────────────────────────────────────────────────────────────────

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
}

export default async function handler(req, res) {
  setCors(res)
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

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
    max_tokens, // accept either case
    tools,
    mode,
    webSearch,
    model: requestedModel,
    task_type,
    stream: shouldStream,
  } = body

  const finalMaxTokens = Math.min(maxTokens ?? max_tokens ?? 2000, 8096)
  const model = pickModel(task_type, requestedModel)

  // Detect call shape.
  const isTools = Array.isArray(messages) && messages.length > 0
  const isSearch = !isTools && (mode === 'search' || webSearch === true)

  if (!isTools && !message) {
    return res.status(400).json({
      error: 'bad_request',
      message: 'Missing message in request.',
    })
  }

  // Cheap one-line trace so we can see model + task in Vercel logs.
  try {
    console.log('[claude]', JSON.stringify({
      task: task_type || 'unspecified',
      model,
      stream: !!shouldStream,
      mode: isTools ? 'tools' : isSearch ? 'search' : 'simple',
    }))
  } catch {}

  // ── Streaming path (SSE) ──────────────────────────────────────────
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
        messages: isTools
          ? messages
          : [{ role: 'user', content: message }],
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

  // ── Non-streaming path ────────────────────────────────────────────
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

    const tokensUsed = (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0)
    logUsage(supabase, user.id, task_type || (isTools ? 'claude-tools' : isSearch ? 'claude-search' : 'claude'), tokensUsed)

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
}

// Re-export for any caller that wants to introspect the whitelist.
export { ALLOWED_MODELS, DEFAULT_MODEL }
