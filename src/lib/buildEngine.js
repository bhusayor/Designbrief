// Streaming build engine — calls AI providers directly from the browser.
// Each function calls onToken(text) for each streamed chunk.

export async function callClaudeForBuild(prompt, apiKey, onToken) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 3000,
      stream: true,
      system: `You are an expert React developer. Generate clean, polished React components using Tailwind CSS.

Rules (STRICTLY follow):
- Export a default function named exactly "Component"
- Use only Tailwind CSS classes for ALL styling (no inline styles, no CSS modules)
- React and ReactDOM are available globally — do NOT import them
- Do NOT import anything at all
- Make it visually complete with realistic placeholder content
- Use modern design: clean spacing, good typography, subtle shadows
- Return ONLY the JavaScript/JSX code — no markdown, no code fences, no explanation`,
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error?.message || `Claude API error ${res.status}`)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    const lines = buf.split('\n')
    buf = lines.pop()
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const raw = line.slice(6).trim()
      if (raw === '[DONE]') continue
      try {
        const evt = JSON.parse(raw)
        if (evt.type === 'content_block_delta' && evt.delta?.type === 'text_delta') {
          onToken(evt.delta.text)
        }
      } catch { /* skip malformed lines */ }
    }
  }
}

export async function callOpenAIForBuild(prompt, apiKey, onToken) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      max_tokens: 3000,
      stream: true,
      messages: [
        {
          role: 'system',
          content: `You are an expert React developer. Generate clean, polished React components using Tailwind CSS.

Rules (STRICTLY follow):
- Export a default function named exactly "Component"
- Use only Tailwind CSS classes for ALL styling (no inline styles, no CSS modules)
- React and ReactDOM are available globally — do NOT import them
- Do NOT import anything at all
- Make it visually complete with realistic placeholder content
- Use modern design: clean spacing, good typography, subtle shadows
- Return ONLY the JavaScript/JSX code — no markdown, no code fences, no explanation`,
        },
        { role: 'user', content: prompt },
      ],
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error?.message || `OpenAI API error ${res.status}`)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    const lines = buf.split('\n')
    buf = lines.pop()
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const raw = line.slice(6).trim()
      if (raw === '[DONE]') continue
      try {
        const evt = JSON.parse(raw)
        const text = evt.choices?.[0]?.delta?.content
        if (text) onToken(text)
      } catch { /* skip malformed lines */ }
    }
  }
}

export async function callAgentForBuild(prompt, agent, onToken) {
  if (agent.type === 'claude') return callClaudeForBuild(prompt, agent.apiKey, onToken)
  if (agent.type === 'codex') return callOpenAIForBuild(prompt, agent.apiKey, onToken)
  throw new Error(`Unknown agent type: ${agent.type}`)
}
