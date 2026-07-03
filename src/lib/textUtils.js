// ────────────────────────────────────────────────────────────────────
// textUtils.js — the shared helpers that had been copy-pasted across
// translators, views, and modals. One definition each; every previous
// copy now imports from here. The riskiest duplication was
// parseBundledComment: the client review page WRITES the format while
// the designer banner and the revise modal PARSE it, and three
// separate copies could drift apart silently.
// ────────────────────────────────────────────────────────────────────

// ── scrubDashes ─────────────────────────────────────────────────────
// User-mandated: NEVER let an em (U+2014) or en (U+2013) dash appear
// in AI-generated output. Walks every string in an arbitrary shape.
// Regexes use the literal chars via \u escapes' semantics — kept as
// chars here intentionally; do not "fix" them in a dash purge.
export function scrubDashes(v) {
  if (v == null) return v
  if (typeof v === 'string') {
    return v
      .replace(/\s*—\s*/g, ' ')
      .replace(/\s*–\s*/g, ' ')
      .replace(/—/g, '-')
      .replace(/–/g, '-')
  }
  if (Array.isArray(v)) return v.map(scrubDashes)
  if (typeof v === 'object') {
    const out = {}
    for (const k of Object.keys(v)) out[k] = scrubDashes(v[k])
    return out
  }
  return v
}

// ── safeJsonParse ───────────────────────────────────────────────────
// Tolerant JSON extraction for model output: strips code fences, then
// falls back to the first balanced { ... } block. Returns {} on any
// failure so callers can test Object.keys(x).length.
export function safeJsonParse(text) {
  if (!text) return {}
  let s = String(text).trim()
  if (s.startsWith('```')) {
    s = s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim()
  }
  try { return JSON.parse(s) } catch { /* fall through */ }
  const first = s.indexOf('{')
  const last = s.lastIndexOf('}')
  if (first >= 0 && last > first) {
    try { return JSON.parse(s.slice(first, last + 1)) } catch { /* fall through */ }
  }
  return {}
}

// ── parseBundledComment ─────────────────────────────────────────────
// Parses the plain-text protocol the client review page bundles
// answers + change requests into:
//
//   ANSWERED:
//   Q1. <question text>
//   A1. <client answer>
//
//   CHANGES:
//   <free text>
//
// Returns { answers: [{ q, a }], changes } or null when the body
// doesn't use the protocol (legacy free-text comments).
export function parseBundledComment(body) {
  const text = String(body || '')
  if (!text.includes('ANSWERED:') && !text.includes('CHANGES:')) return null
  const result = { answers: [], changes: '' }
  const ansMatch = text.match(/ANSWERED:\s*([\s\S]*?)(?:\n\s*CHANGES:|$)/i)
  if (ansMatch) {
    const lines = ansMatch[1].trim().split('\n')
    let currentQ = null
    for (const line of lines) {
      const qMatch = line.match(/^Q\d+\.\s*(.+)$/)
      const aMatch = line.match(/^A\d+\.\s*(.+)$/)
      if (qMatch) {
        if (currentQ) result.answers.push({ q: currentQ, a: '' })
        currentQ = qMatch[1].trim()
      } else if (aMatch && currentQ) {
        result.answers.push({ q: currentQ, a: aMatch[1].trim() })
        currentQ = null
      }
    }
    if (currentQ) result.answers.push({ q: currentQ, a: '' })
  }
  const chgMatch = text.match(/CHANGES:\s*([\s\S]*)$/i)
  if (chgMatch) result.changes = chgMatch[1].trim()
  return result
}

// ── structuredCloneSafe ─────────────────────────────────────────────
// structuredClone where available, JSON round-trip as fallback, the
// value itself as a last resort.
export function structuredCloneSafe(v) {
  if (v == null) return v
  try {
    if (typeof structuredClone === 'function') return structuredClone(v)
  } catch { /* fall through */ }
  try { return JSON.parse(JSON.stringify(v)) } catch { /* fall through */ }
  return v
}

// ── withTimeout ─────────────────────────────────────────────────────
// Race a promise against a timer. When the timer fires first, resolve
// { __timeout: true } so the caller can branch without try/catch.
export function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise(resolve => setTimeout(() => {
      console.warn('[withTimeout]', label || 'promise', 'timed out after', ms, 'ms')
      resolve({ __timeout: true })
    }, ms)),
  ])
}
