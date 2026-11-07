import { setCors } from '../server-lib/cors.js'
import { createClient } from '@supabase/supabase-js'
import { WEBSITE_BUILDER_SYSTEM } from '../src/lib/aiSystemPrompts.js'
import { mapOpenAIError } from '../server-lib/openaiError.js'
import { streamCodexAgent } from '../server-lib/openai.js'
import { MODEL_FOR } from '../src/lib/models.js'
import { checkRateLimit, logUsage, requireProPlan } from '../server-lib/authMiddleware.js'

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
)

// CORS now goes through the shared origin-checked helper.

export default async function handler(req, res) {
  setCors(req, res)
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).end()

  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token || token === 'undefined' || token === 'null') {
    return res.status(401).json({ error: 'Missing authorization header' })
  }

  const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
  if (authErr || !user) return res.status(401).json({ error: 'Invalid session' })
  if (!await requireProPlan(supabase, user.id, res)) return
  if (!await checkRateLimit(supabase, user.id, res)) return

  const { prompt, taskTitle, taskDescription, projectName, taskIndex = 0, totalTasks = 1 } = req.body || {}
  if (!prompt && !taskTitle) return res.status(400).json({ error: 'prompt or taskTitle required' })
  if (
    String(prompt || '').length > 120000
    || String(taskTitle || '').length > 500
    || String(taskDescription || '').length > 30000
    || String(projectName || '').length > 500
  ) {
    return res.status(413).json({ error: 'Builder prompt is too large' })
  }
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return res.status(503).json({ error: 'AI builder is not configured' })

  const systemPrompt = WEBSITE_BUILDER_SYSTEM

  const userPrompt = prompt ? String(prompt) : `Project: ${projectName || 'My Project'}
Task ${taskIndex + 1} of ${totalTasks}: ${taskTitle}
${taskDescription ? `Description: ${taskDescription}` : ''}

Generate a complete, polished React component for this task. The component should look production-ready with realistic content.`

  try {
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.flushHeaders()

    const result = await streamCodexAgent({
      apiKey,
      model: MODEL_FOR.component_builder,
      instructions: systemPrompt,
      input: userPrompt,
      reasoningEffort: 'medium',
      spendLimitCents: 50,
      onText: text => res.write(`data: ${JSON.stringify({ text })}\n\n`),
    })
    await logUsage(supabase, user.id, 'component_builder', result.text.length)
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`)
    res.end()
  } catch (e) {
    const { status, body } = mapOpenAIError(e, '[build-component]')
    if (!res.headersSent) return res.status(status).json(body)
    res.write(`data: ${JSON.stringify(body)}\n\n`)
    res.end()
  }
}
