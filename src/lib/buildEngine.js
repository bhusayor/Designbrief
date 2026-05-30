// Build engine — routes component generation through DesignBrief's /api/claude proxy.

import { WEBSITE_BUILDER_SYSTEM } from './aiSystemPrompts.js'

const BUILD_SYSTEM = WEBSITE_BUILDER_SYSTEM

export async function buildWithProxy(prompt, onToken, authHeader) {
  const res = await fetch('/api/claude', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(authHeader ? { Authorization: authHeader } : {}),
    },
    body: JSON.stringify({
      system: BUILD_SYSTEM,
      message: prompt,
      maxTokens: 3000,
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.message || `Build API error ${res.status}`)
  }

  const data = await res.json()
  const text = data.text ?? ''

  // Simulate streaming by chunking the completed response
  const chunkSize = 40
  for (let i = 0; i < text.length; i += chunkSize) {
    onToken(text.slice(i, i + chunkSize))
    await new Promise(r => setTimeout(r, 12))
  }
}
