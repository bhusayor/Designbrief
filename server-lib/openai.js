/* global process */

import OpenAI from 'openai'

export function createOpenAIClient(apiKey = process.env.OPENAI_API_KEY) {
  return new OpenAI({ apiKey })
}

function asText(value) {
  if (typeof value === 'string') return value
  if (value == null) return ''
  return JSON.stringify(value)
}

// The board assistant still keeps its browser-side history in the old
// block format. Convert that stable app contract into Responses API items
// at the server boundary so the UI does not need provider-specific state.
export function toResponsesInput({ message, messages }) {
  if (!Array.isArray(messages) || messages.length === 0) {
    return [{ role: 'user', content: asText(message) }]
  }

  const input = []
  for (const turn of messages) {
    const role = turn?.role === 'assistant' ? 'assistant' : 'user'
    const content = turn?.content
    if (typeof content === 'string') {
      input.push({ role, content })
      continue
    }
    if (!Array.isArray(content)) continue

    const text = content
      .filter(block => block?.type === 'text' && block.text)
      .map(block => block.text)
      .join('\n')
    if (text) input.push({ role, content: text })

    for (const block of content) {
      if (block?.type === 'tool_use') {
        input.push({
          type: 'function_call',
          call_id: block.id,
          name: block.name,
          arguments: JSON.stringify(block.input || {}),
        })
      } else if (block?.type === 'tool_result') {
        input.push({
          type: 'function_call_output',
          call_id: block.tool_use_id,
          output: asText(block.content),
        })
      }
    }
  }
  return input
}

export function toResponsesTools(tools = []) {
  return tools.map(tool => ({
    type: 'function',
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters || tool.input_schema || { type: 'object', properties: {} },
  }))
}

export function toAppContent(response) {
  const content = []
  for (const item of response?.output || []) {
    if (item?.type === 'message') {
      for (const part of item.content || []) {
        if (part?.type === 'output_text' && part.text) {
          content.push({ type: 'text', text: part.text })
        }
      }
    } else if (item?.type === 'function_call') {
      let input = {}
      try { input = JSON.parse(item.arguments || '{}') } catch {
        // Invalid tool arguments are represented as an empty object.
      }
      content.push({
        type: 'tool_use',
        id: item.call_id || item.id,
        name: item.name,
        input,
      })
    }
  }
  return content
}

export function normalizeUsage(usage = {}) {
  return {
    input_tokens: usage.input_tokens || 0,
    output_tokens: usage.output_tokens || 0,
    total_tokens: usage.total_tokens || (usage.input_tokens || 0) + (usage.output_tokens || 0),
    cached_input_tokens: usage.input_tokens_details?.cached_tokens || 0,
  }
}

export async function createOpenAIResponse({
  apiKey,
  model,
  instructions = '',
  message,
  messages,
  tools = [],
  webSearch = false,
  maxOutputTokens = 4000,
  reasoningEffort = 'medium',
}) {
  const client = createOpenAIClient(apiKey)
  const responseTools = toResponsesTools(tools)
  if (webSearch) responseTools.push({ type: 'web_search' })

  return client.responses.create({
    model,
    input: toResponsesInput({ message, messages }),
    ...(instructions ? { instructions } : {}),
    ...(responseTools.length ? { tools: responseTools } : {}),
    max_output_tokens: maxOutputTokens,
    reasoning: { effort: reasoningEffort },
    store: false,
  })
}

export async function streamOpenAIResponse({
  apiKey,
  model,
  instructions = '',
  message,
  messages,
  maxOutputTokens = 6000,
  reasoningEffort = 'medium',
  onText,
}) {
  const client = createOpenAIClient(apiKey)
  const stream = await client.responses.create({
    model,
    input: toResponsesInput({ message, messages }),
    ...(instructions ? { instructions } : {}),
    max_output_tokens: maxOutputTokens,
    reasoning: { effort: reasoningEffort },
    store: false,
    stream: true,
  })

  let fullText = ''
  let finalResponse = null
  for await (const event of stream) {
    if (event.type === 'response.output_text.delta') {
      fullText += event.delta
      onText?.(event.delta)
    } else if (event.type === 'response.completed') {
      finalResponse = event.response
    } else if (event.type === 'error') {
      const error = new Error(event.message || 'OpenAI stream failed')
      error.status = event.code === 'rate_limit_exceeded' ? 429 : 500
      throw error
    }
  }
  return { text: fullText, response: finalResponse }
}

// Website and component generation are the only surfaces that use the
// managed Codex harness. `environment: none` keeps the agent orchestration
// and durable turn semantics without charging for an idle hosted container.
export async function streamCodexAgent({
  apiKey,
  model,
  instructions,
  input,
  reasoningEffort = 'medium',
  spendLimitCents = 50,
  onText,
  onSession,
}) {
  const client = createOpenAIClient(apiKey)
  const events = await client.beta.agents.sessions.create({
    agent: {
      model,
      instructions,
      reasoning: { effort: reasoningEffort },
      service_tier: 'default',
    },
    environment: { type: 'none' },
    input,
    review: 'none',
    spend_control: { limit: spendLimitCents },
    stream: true,
  })

  let fullText = ''
  let sessionId = null
  for await (const event of events) {
    if (event.type === 'agent.session.created') {
      sessionId = event.session?.id || null
      onSession?.(sessionId)
    } else if (event.type === 'agent.session.turn.output_text.delta') {
      fullText += event.delta
      onText?.(event.delta)
    } else if (event.type === 'agent.session.turn.failed' || event.type === 'agent.session.failed') {
      const error = new Error(event.error?.message || 'Codex builder failed')
      error.status = 500
      throw error
    }
  }
  return { text: fullText, sessionId }
}
