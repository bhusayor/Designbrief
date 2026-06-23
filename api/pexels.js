// ────────────────────────────────────────────────────────────────────
// /api/pexels, proxy to the Pexels free Search API.
//
// Body (POST):
//   {
//     query:        string (required)
//     type:         'video' | 'photo'      default 'video'
//     orientation:  'landscape' | 'portrait' | 'square'  default 'landscape'
//     per_page:     number 1-15            default 5
//     size:         'large' | 'medium' | 'small'         default 'large'
//   }
//
// Returns the top 3 results in a stable shape the client can drop
// straight into an HTML <video> or <img> tag.
//
// Auth: any signed-in app user (we don't expose the Pexels key to the
// browser). We accept either an Authorization Bearer header or no auth
// at all, Pexels' free tier is generous so we don't gate this hard.
// ────────────────────────────────────────────────────────────────────

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
}

export default async function handler(req, res) {
  setCors(res)
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).end()

  if (!process.env.PEXELS_API_KEY) {
    console.error('[pexels] PEXELS_API_KEY missing in env')
    return res.status(503).json({
      error: 'service_unavailable',
      message: 'Media library is temporarily unavailable.',
    })
  }

  const {
    query,
    type = 'video',
    orientation = 'landscape',
    per_page = 5,
    size = 'large',
  } = req.body || {}

  if (!query) {
    return res.status(400).json({
      error: 'bad_request',
      message: 'A search query is required.',
    })
  }

  // Sanitize. Pexels accepts free-text but cap length and strip
  // characters that would only ever come from a hostile client.
  const cleanQuery = String(query)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s+]/g, ' ')
    .replace(/\s+/g, ' ')
    .slice(0, 100)
    .trim()

  const cappedPerPage = Math.max(1, Math.min(15, Number(per_page) || 5))
  const validOrientations = new Set(['landscape', 'portrait', 'square'])
  const finalOrientation = validOrientations.has(orientation) ? orientation : 'landscape'
  const validSizes = new Set(['large', 'medium', 'small'])
  const finalSize = validSizes.has(size) ? size : 'large'

  const params = new URLSearchParams({
    query: cleanQuery,
    orientation: finalOrientation,
    per_page: String(cappedPerPage),
    size: finalSize,
  })

  const baseUrl = type === 'photo'
    ? 'https://api.pexels.com/v1/search'
    : 'https://api.pexels.com/videos/search'

  try {
    const resp = await fetch(`${baseUrl}?${params.toString()}`, {
      headers: { Authorization: process.env.PEXELS_API_KEY },
    })
    if (!resp.ok) {
      console.error('[pexels] upstream ' + resp.status)
      return res.status(502).json({
        error: 'media_search_failed',
        message: 'Could not find matching media. CSS animation will be used instead.',
      })
    }
    const data = await resp.json()

    if (type === 'photo') {
      const images = (data.photos || [])
        .slice(0, 3)
        .map(p => ({
          id: p.id,
          url: p.src?.original || p.src?.large2x || '',
          large: p.src?.large2x || p.src?.large || '',
          medium: p.src?.large || '',
          small: p.src?.medium || '',
          thumbnail: p.src?.small || '',
          alt: p.alt || '',
          photographer: p.photographer || '',
          avg_color: p.avg_color || null,
          pexels_url: p.url || '',
        }))
        .filter(p => p.url)
      return res.status(200).json({ type: 'photo', results: images, query: cleanQuery })
    }

    // Default to video.
    const videos = (data.videos || [])
      .slice(0, 3)
      .map(v => {
        const files = Array.isArray(v.video_files) ? v.video_files : []
        // Prefer HD ≥1280; fall back to SD; final fallback to any file.
        const hd = files.find(f => f.quality === 'hd' && (f.width || 0) >= 1280)
        const sd = files.find(f => f.quality === 'sd')
        const file = hd || sd || files[0]
        return {
          id: v.id,
          url: file?.link || '',
          width: file?.width || 1920,
          height: file?.height || 1080,
          duration: v.duration,
          thumbnail: v.image,
          photographer: v.user?.name || '',
          pexels_url: v.url || '',
        }
      })
      .filter(v => v.url)
    return res.status(200).json({ type: 'video', results: videos, query: cleanQuery })
  } catch (e) {
    console.error('[pexels] error:', e?.message)
    return res.status(502).json({
      error: 'media_search_failed',
      message: 'Could not find matching media. CSS animation will be used instead.',
    })
  }
}
