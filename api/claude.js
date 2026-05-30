import Anthropic from '@anthropic-ai/sdk'
import { requireAuth, checkRateLimit, logUsage } from './lib/authMiddleware.js'
import { mapClaudeError } from './lib/claudeError.js'

// ────────────────────────────────────────────────────────────────────
// Unified Claude proxy. Three modes, auto-detected from the request
// body shape so existing callers keep working without a URL change:
//
//   simple  → { message,   system?, maxTokens? }     → { content, text }
//   search  → { message,   system?, maxTokens?, mode: 'search' OR webSearch: true }
//                                                    → { content, text }
//   tools   → { messages,  system?, maxTokens?, tools? }
//                                                    → { content, stop_reason }
//
// claude-search.js + claude-tools.js were folded into this file so the
// project fits the Hobby plan's 12 serverless function cap.
// ────────────────────────────────────────────────────────────────────

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
// Use Sonnet 4.5 — the same model id all the other working endpoints
// (settings.js, create-workspace.js) use. Sonnet 4.6 access can be
// account-tier dependent and the old claude.js shipped with 4-6 even
// though it may have been silently rejected on some Hobby accounts.
const MODEL = 'claude-sonnet-4-5'

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

  const auth = await requireAuth(req, res)
  if (!auth) return
  const { user, supabase } = auth

  const allowed = await checkRateLimit(supabase, user.id, res)
  if (!allowed) return

  try {
    const body = req.body || {}
    const {
      message,
      messages,
      system = '',
      maxTokens = 2000,
      tools,
      mode,
      webSearch,
    } = body

    // Mode detection.
    const isTools = Array.isArray(messages) && messages.length > 0
    const isSearch = !isTools && (mode === 'search' || webSearch === true)
    const isSimple = !isTools && !isSearch

    if (isSimple || isSearch) {
      if (!message) return res.status(400).json({ error: 'message is required' })
    }
    if (isTools && !messages.length) {
      return res.status(400).json({ error: 'messages is required' })
    }

    const params = {
      model: MODEL,
      max_tokens: Math.min(maxTokens, 8096),
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
    logUsage(supabase, user.id, isTools ? 'claude-tools' : isSearch ? 'claude-search' : 'claude', tokensUsed)

    if (isTools) {
      return res.json({ content: response.content, stop_reason: response.stop_reason })
    }

    // Defensive parse — Anthropic always returns content as an array but
    // a malformed response shouldn't take down the whole request.
    const content = Array.isArray(response.content) ? response.content : []
    const text = content
      .filter(b => b && b.type === 'text')
      .map(b => b.text)
      .join('\n')
    return res.json({ content, text })
  } catch (error) {
    const { status, body } = mapClaudeError(error, '[claude]')
    return res.status(status).json(body)
  }
}
