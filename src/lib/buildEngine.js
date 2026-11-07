// Build engine, routes Phase 1 React-component generation through the
// dedicated Pro-only managed Codex agent endpoint.

import { apiUrl } from './runtimeConfig.js'

export async function buildWithProxy(prompt, onToken, authHeader) {
  const res = await fetch(apiUrl('/api/build-component'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(authHeader ? { Authorization: authHeader } : {}),
    },
    body: JSON.stringify({
      prompt,
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    // Server has already mapped this into a user-safe { message, error, retry_after }.
    const wrapped = new Error(err?.message || 'Something interrupted the AI. Your work is safe, please try again.')
    wrapped.code = err?.error || null
    wrapped.status = res.status
    if (err?.retry_after) wrapped.retryAfter = err.retry_after
    throw wrapped
  }

  if (!res.body) throw new Error('Builder stream was unavailable.')
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let fullText = ''
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const payload = JSON.parse(line.slice(6))
      if (payload.error) throw new Error(payload.message || payload.error)
      if (payload.text) {
        fullText += payload.text
        onToken(payload.text)
      }
    }
  }
  return fullText
}
