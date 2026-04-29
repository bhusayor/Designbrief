import Anthropic from '@anthropic-ai/sdk'
import { requireAuth, checkRateLimit, logUsage } from './lib/authMiddleware.js'

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
    const { message, system = '', maxTokens = 3000 } = req.body

    if (!message) {
      return res.status(400).json({ error: 'message is required' })
    }

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: Math.min(maxTokens, 8096),
      ...(system && { system }),
      messages: [{ role: 'user', content: message }],
    })

    // 3. Log usage (non-blocking)
    const tokensUsed = (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0)
    logUsage(supabase, user.id, 'claude', tokensUsed)

    const text = response.content[0]?.type === 'text' ? response.content[0].text : ''
    res.json({ content: response.content, text })
  } catch (error) {
    console.error('Claude API error:', error)
    res.status(500).json({ error: error.message })
  }
}
