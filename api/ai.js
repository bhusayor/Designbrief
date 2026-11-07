/* global process */

import { requireAuth, checkRateLimit, consumeCreditOperation, logUsage } from '../server-lib/authMiddleware.js'
import { mapOpenAIError } from '../server-lib/openaiError.js'
import {
  createOpenAIResponse,
  normalizeUsage,
  streamOpenAIResponse,
  toAppContent,
} from '../server-lib/openai.js'
import { setCors } from '../server-lib/cors.js'
import { pickModel, reasoningEffortFor } from '../src/lib/models.js'
import { getTaskPolicy, isUuid, validateAIRequest } from '../server-lib/aiPolicy.js'

export default async function handler(req, res) {
  setCors(req, res)
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  if (!process.env.OPENAI_API_KEY) {
    console.error('[openai] OPENAI_API_KEY missing in env')
    return res.status(503).json({
      error: 'service_unavailable',
      message: 'AI features are temporarily unavailable. Try again shortly.',
    })
  }

  const auth = await requireAuth(req, res)
  if (!auth) return
  const { user, supabase } = auth
  if (!await checkRateLimit(supabase, user.id, res)) return

  const {
    message,
    messages,
    system = '',
    maxTokens,
    max_tokens,
    tools,
    mode,
    webSearch,
    task_type,
    operation_id,
    stream: shouldStream,
  } = req.body || {}

  const isTools = Array.isArray(messages) && messages.length > 0
  const isSearch = !isTools && (mode === 'search' || webSearch === true)
  if (!isTools && !message) {
    return res.status(400).json({ error: 'bad_request', message: 'Missing message in request.' })
  }

  const validation = validateAIRequest({
    taskType: task_type,
    system,
    message,
    messages,
    tools,
    wantsSearch: isSearch,
    requestedMaxTokens: maxTokens ?? max_tokens,
  })
  if (!validation.ok) {
    return res.status(validation.status).json({
      error: 'bad_request',
      code: validation.code,
      message: validation.message,
    })
  }
  const policy = getTaskPolicy(task_type)
  if (policy.billableAction && !isUuid(operation_id)) {
    return res.status(400).json({
      error: 'operation_required',
      code: 'OPERATION_REQUIRED',
      message: 'A valid billing operation ID is required for this task.',
    })
  }

  const credit = await consumeCreditOperation(supabase, user.id, operation_id, policy, res)
  if (!credit) return

  const finalMaxTokens = validation.maxOutputTokens
  // The server registry is authoritative. A client-supplied model is ignored.
  const model = pickModel(task_type)
  const reasoningEffort = reasoningEffortFor(task_type)

  try {
    console.log('[openai]', JSON.stringify({
      task: task_type || 'unspecified',
      model,
      reasoning: reasoningEffort,
      stream: !!shouldStream,
      mode: isTools ? 'tools' : isSearch ? 'search' : 'simple',
      charged: !!credit.charged,
    }))
  } catch {
    // Logging must never block a request.
  }

  if (shouldStream) {
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    if (typeof res.flushHeaders === 'function') res.flushHeaders()
    res.write(`data: ${JSON.stringify({
      meta: {
        credits_remaining: credit.credits_remaining,
        charged: credit.charged,
        credit_cost: credit.credit_cost,
        calls_remaining: credit.calls_remaining,
      },
    })}\n\n`)

    try {
      const { text, response } = await streamOpenAIResponse({
        model,
        instructions: system,
        message,
        messages,
        maxOutputTokens: finalMaxTokens,
        reasoningEffort,
        onText: delta => res.write(`data: ${JSON.stringify({ text: delta })}\n\n`),
      })
      const usage = normalizeUsage(response?.usage)
      await logUsage(supabase, user.id, task_type || 'openai-stream', usage.total_tokens || text.length)
      res.write('data: [DONE]\n\n')
      return res.end()
    } catch (error) {
      const { body } = mapOpenAIError(error, '[openai-stream]')
      res.write(`data: ${JSON.stringify(body)}\n\n`)
      return res.end()
    }
  }

  try {
    const response = await createOpenAIResponse({
      model,
      instructions: system,
      message,
      messages,
      tools: Array.isArray(tools) ? tools : [],
      webSearch: isSearch,
      maxOutputTokens: finalMaxTokens,
      reasoningEffort,
    })
    const content = toAppContent(response)
    const text = response.output_text || content
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('\n')
    const usage = normalizeUsage(response.usage)
    await logUsage(supabase, user.id, task_type || (isTools ? 'openai-tools' : isSearch ? 'openai-search' : 'openai'), usage.total_tokens)

    return res.json({
      content,
      text,
      stop_reason: content.some(block => block.type === 'tool_use') ? 'tool_use' : 'end_turn',
      usage,
      model_used: model,
      response_id: response.id,
      credits_remaining: credit.credits_remaining,
      charged: credit.charged,
      credit_cost: credit.credit_cost,
      calls_remaining: credit.calls_remaining,
    })
  } catch (error) {
    const { status, body } = mapOpenAIError(error, '[openai]')
    return res.status(status).json(body)
  }
}
