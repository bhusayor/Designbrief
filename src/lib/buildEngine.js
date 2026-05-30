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
    const detail = err?.details || err?.error || ''
    // Anthropic returns a 400 with this message when the account is out of
    // credits — surface that exactly so the user knows it's a billing
    // issue on the AI provider side, not a bug in the app.
    const lowBalance = /credit balance is too low/i.test(detail)
      || /credit balance is too low/i.test(err?.error || '')
    if (lowBalance) {
      throw new Error('AI is temporarily unavailable. The Anthropic account is out of credits — top up at console.anthropic.com/settings/plans and try again.')
    }
    throw new Error(detail || err?.error || `Build API error ${res.status}`)
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
