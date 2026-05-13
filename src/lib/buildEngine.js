// Build engine — routes component generation through DesignBrief's /api/claude proxy.

const BUILD_SYSTEM = `You are an expert React developer. Generate clean, polished React components using Tailwind CSS.

Rules (STRICTLY follow):
- Export a default function named exactly "Component"
- Use only Tailwind CSS classes for ALL styling (no inline styles, no CSS modules)
- React and ReactDOM are available globally — do NOT import them
- Do NOT import anything at all
- Make it visually complete with realistic placeholder content
- Use modern design: clean spacing, good typography, subtle shadows
- Return ONLY the JavaScript/JSX code — no markdown, no code fences, no explanation`

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
