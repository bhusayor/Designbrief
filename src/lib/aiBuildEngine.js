// ────────────────────────────────────────────────────────────────────
// aiBuildEngine — client-side orchestrator for Phase 2 AI Builder.
//
// Drives one section build at a time:
//   1. Call /api/build-section with the current task + brief context
//   2. Stream HTML chunks back via SSE
//   3. On each chunk: notify caller via onProgress(html) for the live
//      preview
//   4. The server persists the final HTML to build_sections; we just
//      surface the stream
//
// Persistence (status flips, approved_code, etc) is owned by the
// server endpoint and the realtime subscription in AIBuilder.jsx —
// this module is a pure thin streaming client.
// ────────────────────────────────────────────────────────────────────

import { supabase } from './supabase.js'
import { compactBriefForPrompt } from './briefContext.js'
import {
  decideHeroMediaType,
  buildMediaQuery,
  searchPexelsVideo,
  searchPexelsImage,
} from './pexels.js'
import {
  pickCssTemplate,
  renderMediaHTML,
  GSAP_REVEALS,
} from './animations.js'

const API_BASE = import.meta.env.VITE_API_BASE_URL || ''

export async function buildSection({
  section,            // { id, task_id, task_title, position }
  task,               // raw task row (description + ai_prompt)
  briefContext,
  previousSections,   // already-approved sections, in order
  totalTasks,
  buildId,
  changeRequest,
  onProgress,         // (partialHtml: string) => void
  signal,             // optional AbortSignal
}) {
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token
  if (!token) throw new Error('Sign in to run the AI builder')

  const previousTitles = (previousSections || []).map(s => s.task_title || s.title || '')

  // Decide if this section is the hero (or hero-like) — only hero
  // sections get a video/image/CSS background prepared up front.
  const lowerTitle = (section.task_title || task?.title || '').toLowerCase()
  const isHero = section.position === 0
    || /\b(hero|header|landing|cover|intro|above[- ]the[- ]fold)\b/.test(lowerTitle)

  let mediaContext = null
  if (isHero) {
    const decided = decideHeroMediaType(briefContext || {})
    const query = buildMediaQuery(briefContext || {}, 'hero', null)

    if (decided === 'video') {
      const v = await searchPexelsVideo(query).catch(() => null)
      if (v) {
        mediaContext = {
          type: 'video',
          url: v.url,
          thumbnail: v.thumbnail,
          photographer: v.photographer,
          pexels_url: v.pexels_url,
        }
      }
    } else if (decided === 'image') {
      const img = await searchPexelsImage(query).catch(() => null)
      if (img) {
        mediaContext = {
          type: 'image',
          url: img.large || img.url,
          thumbnail: img.thumbnail,
          photographer: img.photographer,
          pexels_url: img.pexels_url,
        }
      }
    }

    // CSS fallback covers: decided === 'css' OR Pexels failed/missing
    if (!mediaContext) {
      mediaContext = {
        type: 'css',
        template: pickCssTemplate(briefContext || {}),
      }
    }
  }

  const mediaHtml = mediaContext ? renderMediaHTML(mediaContext, briefContext || {}) : ''
  const gsapHtml = isHero ? GSAP_REVEALS : ''

  const res = await fetch(`${API_BASE}/api/build-section`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + token,
    },
    body: JSON.stringify({
      build_id: buildId,
      section_id: section.id,
      task_title: section.task_title || task?.title || 'Untitled section',
      task_description: task?.description || '',
      task_ai_prompt: task?.ai_prompt || '',
      brief_context: briefContext ? JSON.parse(compactBriefForPrompt(briefContext)) : null,
      previous_titles: previousTitles,
      total_tasks: totalTasks,
      change_request: changeRequest || null,
      media_html: mediaHtml,
      gsap_html: gsapHtml,
    }),
    signal,
  })

  if (!res.ok || !res.body) {
    let body = {}
    try { body = await res.json() } catch {}
    const err = new Error(body?.message || 'Something interrupted the AI. Your work is safe — please try again.')
    err.code = body?.error || null
    err.status = res.status
    if (body?.retry_after) err.retryAfter = body.retry_after
    throw err
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let acc = ''
  let serverError = null

  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    let idx
    while ((idx = buffer.indexOf('\n\n')) !== -1) {
      const event = buffer.slice(0, idx)
      buffer = buffer.slice(idx + 2)

      for (const line of event.split('\n')) {
        if (!line.startsWith('data: ')) continue
        const payload = line.slice(6).trim()
        if (!payload) continue
        try {
          const json = JSON.parse(payload)
          if (json.text) {
            acc += json.text
            try { onProgress?.(acc) } catch {}
          }
          // Server-mapped error frames: { error: <code>, message: <text> }
          if (json.error && json.message) {
            serverError = { code: json.error, message: json.message, retryAfter: json.retry_after }
          } else if (json.error) {
            // Legacy / passthrough — wrap as a generic friendly message.
            serverError = { code: 'unexpected', message: 'Something interrupted the AI. Your work is safe — please try again.' }
          }
        } catch {}
      }
    }
  }

  if (serverError) {
    const err = new Error(serverError.message)
    err.code = serverError.code
    if (serverError.retryAfter) err.retryAfter = serverError.retryAfter
    throw err
  }
  return acc
}

// ─── Assemble: stitch every approved (and the currently-reviewing)
// section into one HTML document for the live preview iframe.
export function assembleWebsite(sections, briefContext) {
  const ordered = [...(sections || [])]
    .filter(s => s.status === 'approved' || s.status === 'review' || s.status === 'building' || s.status === 'changes')
    .sort((a, b) => (a.position || 0) - (b.position || 0))

  const body = ordered
    .map(s => s.approved_code || s.generated_code || '')
    .filter(Boolean)
    .join('\n')

  const displayFont = briefContext?.typography?.displayFont || 'Inter'
  const bodyFont = briefContext?.typography?.bodyFont || 'Inter'
  const title = briefContext?.projectName || 'Preview'

  // Pull in Google Fonts for the brief's display + body fonts so the
  // preview reads like the published site even before the model
  // requests them itself.
  const fontParam = encodeURIComponent(displayFont) + ':wght@400;600;700;800&family=' + encodeURIComponent(bodyFont) + ':wght@400;500;600;700'

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=${fontParam}&display=swap" rel="stylesheet" />
    <style>
      *, *::before, *::after { box-sizing: border-box; }
      html, body { margin: 0; padding: 0; }
      body {
        font-family: '${bodyFont}', system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
        -webkit-font-smoothing: antialiased;
        text-rendering: optimizeLegibility;
        background: #fff;
        color: #0a0a0a;
      }
      img, video, svg { max-width: 100%; display: block; }
      a { color: inherit; }
    </style>
  </head>
  <body>
    ${body}
  </body>
</html>`
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]))
}

// ─── Build management helpers ───────────────────────────────────────

export async function createBuild({ projectId, workspaceId, userId, mode, todoTasks }) {
  const { data: build, error } = await supabase
    .from('ai_builds')
    .insert({
      project_id: projectId,
      workspace_id: workspaceId || null,
      user_id: userId,
      status: 'running',
      build_mode: mode || 'task_by_task',
      current_task: 0,
    })
    .select('*')
    .single()
  if (error) throw error

  const sectionRows = (todoTasks || []).map((t, i) => ({
    build_id: build.id,
    task_id: t.id,
    task_title: t.title || ('Section ' + (i + 1)),
    position: i,
    status: 'queued',
  }))

  if (sectionRows.length) {
    const { error: sErr } = await supabase
      .from('build_sections')
      .insert(sectionRows)
    if (sErr) throw sErr
  }

  return build
}

export async function approveSection({ sectionId, userId }) {
  const nowIso = new Date().toISOString()
  // copy generated_code into approved_code so we have an immutable
  // snapshot even if a later rebuild touches generated_code.
  const { data: row } = await supabase
    .from('build_sections')
    .select('generated_code')
    .eq('id', sectionId)
    .single()

  const { error } = await supabase
    .from('build_sections')
    .update({
      status: 'approved',
      approved_code: row?.generated_code || null,
      approved_at: nowIso,
      approved_by: userId,
    })
    .eq('id', sectionId)
  if (error) throw error
}

export async function skipSection(sectionId) {
  const { error } = await supabase
    .from('build_sections')
    .update({ status: 'skipped' })
    .eq('id', sectionId)
  if (error) throw error
}

export async function markChangesRequested({ sectionId, changeRequest }) {
  const { error } = await supabase
    .from('build_sections')
    .update({ status: 'changes', change_request: changeRequest })
    .eq('id', sectionId)
  if (error) throw error
}

export async function pauseBuild(buildId) {
  return supabase.from('ai_builds').update({ status: 'paused' }).eq('id', buildId)
}

export async function resumeBuild(buildId) {
  return supabase.from('ai_builds').update({ status: 'running' }).eq('id', buildId)
}

export async function completeBuild(buildId) {
  return supabase.from('ai_builds').update({ status: 'complete' }).eq('id', buildId)
}
