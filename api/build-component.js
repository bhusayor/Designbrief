import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'

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

  const systemPrompt = `You are an expert React developer. Generate clean, polished React components using Tailwind CSS.

Rules (STRICTLY follow):
- Export a default function named exactly "Component"
- Use only Tailwind CSS classes for ALL styling (no inline styles, no CSS modules)
- React and ReactDOM are available globally — do NOT import them
- Do NOT import anything at all
- Make it visually complete with realistic placeholder content
- Use modern design: clean spacing, good typography, subtle shadows
- Return ONLY the JavaScript/JSX code — no markdown, no code fences, no explanation`

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
      model: 'claude-sonnet-4-6',
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
      res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`)
      res.end()
    })
  } catch (e) {
    console.error('[build-component]', e)
    if (!res.headersSent) return res.status(500).json({ error: e.message })
    res.write(`data: ${JSON.stringify({ error: e.message })}\n\n`)
    res.end()
  }
}
