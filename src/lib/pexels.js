// ────────────────────────────────────────────────────────────────────
// pexels.js — client helper for the /api/pexels proxy.
//
// Returns either the top result (top-level fetchers) or all 3 results
// (the `search*` versions), or `null` on failure. Callers are
// expected to fall back to a CSS animation when null.
// ────────────────────────────────────────────────────────────────────

const API_BASE = import.meta.env.VITE_API_BASE_URL || ''

async function fetchPexels(body) {
  try {
    const res = await fetch(`${API_BASE}/api/pexels`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) return null
    const data = await res.json()
    return Array.isArray(data?.results) ? data.results : null
  } catch (e) {
    console.warn('[pexels] search failed:', e?.message)
    return null
  }
}

// Top video for a query (HD where available).
export async function searchPexelsVideo(query, { orientation = 'landscape', perPage = 5 } = {}) {
  const results = await fetchPexels({ query, type: 'video', orientation, per_page: perPage })
  return results?.[0] || null
}

// Top image for a query.
export async function searchPexelsImage(query, { orientation = 'landscape', perPage = 5 } = {}) {
  const results = await fetchPexels({ query, type: 'photo', orientation, per_page: perPage })
  return results?.[0] || null
}

// Full result list (up to 3 each from the server) for alt-pick UIs.
export async function searchPexelsVideos(query, opts) {
  const results = await fetchPexels({ query, type: 'video', orientation: opts?.orientation || 'landscape', per_page: opts?.perPage || 5 })
  return results || []
}
export async function searchPexelsImages(query, opts) {
  const results = await fetchPexels({ query, type: 'photo', orientation: opts?.orientation || 'landscape', per_page: opts?.perPage || 5 })
  return results || []
}

// ────────────────────────────────────────────────────────────────────
// Heuristics — decide what kind of media (if any) belongs in the hero
// of a given brief, and what to search for.
// ────────────────────────────────────────────────────────────────────

const AUDIENCE_RX = /\b(food|restaurant|cook(?:ing|ery)?|cafe|bar|fashion|cloth(?:ing|es)|wear|beauty|cosmetic|makeup|fitness|gym|workout|yoga|run(?:ning)?|travel|hotel|destination|vacation|luxury|premium|tech|saas|software|developer|fintech|finance|crypto|wellness|health|medical|education|school|learning|real ?estate|property|interior|architecture|art|gallery|museum|sport|outdoor|nature|product|ecommerce|brand|agency|studio|consult(?:ing|ant)?|legal|law)\b/g

const VIDEO_SIGNAL = /food|restaurant|cook|cafe|bar|fashion|cloth|wear|fitness|gym|workout|yoga|run|travel|hotel|destination|vacation|wellness|sport|outdoor|nature|lifestyle|beauty/i
const IMAGE_SIGNAL = /luxury|premium|exclusive|architecture|real ?estate|property|interior|art|gallery|museum|legal|consult|finance|product|ecommerce/i
const CSS_SIGNAL   = /tech|saas|software|app|digital|fintech|crypto|minimal|precise|clean|agency|studio|design|developer|code|platform|web3|ai/i

export function decideHeroMediaType(briefContext = {}) {
  const combined = [
    briefContext.tone,
    briefContext.toneAndMood,
    Array.isArray(briefContext.tone) ? briefContext.tone.join(' ') : '',
    briefContext.brandPersonality,
    Array.isArray(briefContext.brandPersonality) ? briefContext.brandPersonality.join(' ') : '',
    briefContext.projectUnderstanding,
    briefContext.creativeConcept,
    briefContext.moodboardDirection,
  ].filter(Boolean).join(' ').toLowerCase()

  // Tech / minimal beats video/image — those products read better with
  // motion design than stock footage.
  if (CSS_SIGNAL.test(combined)) return 'css'
  if (VIDEO_SIGNAL.test(combined)) return 'video'
  if (IMAGE_SIGNAL.test(combined)) return 'image'
  return 'css'
}

export function buildMediaQuery(briefContext = {}, _section, userHint = null) {
  if (userHint && typeof userHint === 'string' && userHint.trim()) {
    return userHint.trim().slice(0, 100)
  }

  const toneStr = Array.isArray(briefContext.tone)
    ? briefContext.tone.join(' ')
    : (briefContext.toneAndMood || briefContext.tone || '')
  const tone = String(toneStr).toLowerCase()
  const understanding = String(briefContext.projectUnderstanding || '').toLowerCase()
  const concept = String(briefContext.creativeConcept || '').toLowerCase()

  const toneWords = tone
    .split(/[\s,]+/)
    .filter(w => w.length > 3)
    .slice(0, 3)

  const audienceWords = (understanding + ' ' + concept).match(AUDIENCE_RX) || []
  const dedupedAudience = [...new Set(audienceWords)].slice(0, 2)

  const query = [...dedupedAudience, ...toneWords.slice(0, 2)]
    .filter(Boolean)
    .join(' ')
    .trim()

  return query || briefContext.projectName || 'professional lifestyle'
}
