import Anthropic from '@anthropic-ai/sdk'
import { requireAuth, checkRateLimit } from './lib/authMiddleware.js'
import { mapClaudeError } from './lib/claudeError.js'
import { MODELS, ALLOWED_MODELS } from '../src/lib/models.js'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
// Default stream model = Haiku for snappy turn-around; callers can
// override via body.model but only if it's in the whitelist.
const DEFAULT_STREAM_MODEL = MODELS.HAIKU

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

  // 1. Auth check
  const auth = await requireAuth(req, res)
  if (!auth) return
  const { user, supabase } = auth

  // 2. Rate limit check
  const allowed = await checkRateLimit(supabase, user.id, res)
  if (!allowed) return

  try {
    const { message, system = '', maxTokens = 1000, model: requestedModel } = req.body

    if (!message) {
      return res.status(400).json({ error: 'message is required' })
    }

    const model = ALLOWED_MODELS.includes(requestedModel) ? requestedModel : DEFAULT_STREAM_MODEL

    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.flushHeaders()

    const stream = client.messages.stream({
      model,
      max_tokens: Math.min(maxTokens, 4096),
      ...(system && { system }),
      messages: [{ role: 'user', content: message }],
    })

    stream.on('text', (text) => {
      res.write(`data: ${JSON.stringify({ text })}\n\n`)
    })

    stream.on('finalMessage', () => {
      res.write(`data: ${JSON.stringify({ done: true })}\n\n`)
      res.end()
    })

    stream.on('error', (err) => {
      const { body } = mapClaudeError(err, '[claude-stream]')
      res.write(`data: ${JSON.stringify(body)}\n\n`)
      res.end()
    })

  } catch (error) {
    const { status, body } = mapClaudeError(error, '[claude-stream]')
    if (!res.headersSent) {
      res.status(status).json(body)
    } else {
      res.write(`data: ${JSON.stringify({ done: true, ...body })}\n\n`)
      res.end()
    }
  }
}
