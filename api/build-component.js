import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { WEBSITE_BUILDER_SYSTEM } from '../src/lib/aiSystemPrompts.js'
import { mapClaudeError } from '../server-lib/claudeError.js'
import { MODEL_FOR } from '../src/lib/models.js'

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
)

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
}

export default async function handler(req, res) {
  setCors(res)
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).end()

  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token || token === 'undefined' || token === 'null') {
    return res.status(401).json({ error: 'Missing authorization header' })
  }

  const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
  if (authErr || !user) return res.status(401).json({ error: 'Invalid session' })

  const { userApiKey, taskTitle, taskDescription, projectName, taskIndex, totalTasks } = req.body
  if (!userApiKey) return res.status(400).json({ error: 'userApiKey required' })
  if (!taskTitle) return res.status(400).json({ error: 'taskTitle required' })

  const client = new Anthropic({ apiKey: userApiKey })

  const systemPrompt = WEBSITE_BUILDER_SYSTEM

  const userPrompt = `Project: ${projectName || 'My Project'}
Task ${taskIndex + 1} of ${totalTasks}: ${taskTitle}
${taskDescription ? `Description: ${taskDescription}` : ''}

Generate a complete, polished React component for this task. The component should look production-ready with realistic content.`

  try {
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.flushHeaders()

    const stream = client.messages.stream({
      model: MODEL_FOR.component_builder,
      max_tokens: 3000,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    })

    stream.on('text', (text) => {
      res.write(`data: ${JSON.stringify({ text })}\n\n`)
    })

    stream.on('finalMessage', () => {
      res.write(`data: ${JSON.stringify({ done: true })}\n\n`)
      res.end()
    })

    stream.on('error', (err) => {
      const body = byokError(err) || mapClaudeError(err, '[build-component]').body
      res.write(`data: ${JSON.stringify(body)}\n\n`)
      res.end()
    })
  } catch (e) {
    const byok = byokError(e)
    if (byok) {
      if (!res.headersSent) return res.status(401).json(byok)
      res.write(`data: ${JSON.stringify(byok)}\n\n`)
      return res.end()
    }
    const { status, body } = mapClaudeError(e, '[build-component]')
    if (!res.headersSent) return res.status(status).json(body)
    res.write(`data: ${JSON.stringify(body)}\n\n`)
    res.end()
  }
}

// build-component is bring-your-own-key, the user pasted their own key in
// Project Builder. A 401 means THEIR key is bad, so we tell them that
// instead of falling through to mapClaudeError's "temporarily unavailable"
// (which is for platform-key failures).
function byokError(err) {
  if (err?.status === 401) {
    return {
      error: 'invalid_user_key',
      message: 'That key was rejected. Double-check the value you pasted on Project Builder and try again.',
    }
  }
  return null
}
