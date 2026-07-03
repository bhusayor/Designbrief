// ────────────────────────────────────────────────────────────────────
// Shared CORS helper. Previously every api/ function set
// Access-Control-Allow-Origin: * which let any website script our
// authenticated endpoints with a stolen/phished token. Now the
// allowlist is: the deployed app origin (APP_ORIGIN or VITE_APP_URL
// env) + localhost dev ports. Unknown origins get no CORS headers at
// all, so browsers block the response.
// ────────────────────────────────────────────────────────────────────

function allowedOrigins() {
  const list = []
  const fromEnv = process.env.APP_ORIGIN || process.env.VITE_APP_URL
  if (fromEnv) {
    try { list.push(new URL(fromEnv).origin) } catch { list.push(fromEnv.replace(/\/$/, '')) }
  }
  // Vercel previews + prod aliases can be added via APP_ORIGIN_EXTRA
  // as a comma-separated list.
  const extra = process.env.APP_ORIGIN_EXTRA
  if (extra) {
    for (const o of extra.split(',')) {
      const t = o.trim().replace(/\/$/, '')
      if (t) list.push(t)
    }
  }
  list.push('http://localhost:5173', 'http://localhost:3000', 'http://localhost:4173')
  return list
}

export function setCors(req, res) {
  const origin = req.headers?.origin
  const allowed = allowedOrigins()
  if (origin && allowed.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Vary', 'Origin')
  } else if (!origin) {
    // Non-browser callers (curl, server-to-server) have no Origin
    // header; CORS doesn't apply to them anyway.
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
}
