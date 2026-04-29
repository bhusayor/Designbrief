import Anthropic from '@anthropic-ai/sdk'
import { requireAuth, checkRateLimit } from './lib/authMiddleware.js'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const MODEL = 'claude-sonnet-4-6'

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
    const { message, system = '', maxTokens = 1000 } = req.body

    if (!message) {
      return res.status(400).json({ error: 'message is required' })
    }

    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.flushHeaders()

    const stream = client.messages.stream({
      model: MODEL,
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
      res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`)
      res.end()
    })

  } catch (error) {
    console.error('Stream error:', error)
    if (!res.headersSent) {
      res.status(500).json({ error: error.message })
    } else {
      res.write(`data: ${JSON.stringify({ done: true, error: error.message })}\n\n`)
      res.end()
    }
  }
}
