// ────────────────────────────────────────────────────────────────────
// /api/publish-build, finishes the AI Builder flow.
//
// Body (POST):
//   { build_id, slug, html, seo_title?, meta_description? }
//
// What it does:
//   1. Verifies caller owns the build.
//   2. Verifies slug is unique (server-side defence-in-depth, the
//      client already checks, but two tabs could race).
//   3. Uploads the assembled HTML to the public `ai-builds` Storage
//      bucket at `<build_id>/index.html`.
//   4. (TODO) Triggers a Vercel deployment to map
//      <slug>.designbrief.app to the new build. Until VERCEL_TOKEN +
//      VERCEL_PROJECT_ID are configured we return the Storage public
//      URL as the published_url so the user always gets a working
//      live link.
//   5. Writes ai_builds.{slug, published_url, published_at, status}.
//
// Requires the public storage bucket `ai-builds`:
//   (run once in Supabase SQL Editor)
//
//     insert into storage.buckets (id, name, public)
//     values ('ai-builds', 'ai-builds', true)
//     on conflict (id) do nothing;
//
//     create policy "ai-builds public read"
//     on storage.objects for select
//     using (bucket_id = 'ai-builds');
// ────────────────────────────────────────────────────────────────────

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
)

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
}

const SLUG_REGEX = /^[a-z0-9](?:[a-z0-9-]{1,48}[a-z0-9])?$/

export default async function handler(req, res) {
  setCors(res)
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).end()

  const authHeader = req.headers.authorization || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!token) return res.status(401).json({ error: 'Missing Authorization' })
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
  if (authErr || !user) return res.status(401).json({ error: 'Invalid session' })

  const { build_id, slug, html, seo_title, meta_description } = req.body || {}
  if (!build_id || !slug || !html) {
    return res.status(400).json({ error: 'build_id, slug and html are required' })
  }
  if (!SLUG_REGEX.test(slug)) {
    return res.status(400).json({ error: 'Invalid slug. Use lowercase letters, numbers, hyphens.' })
  }

  // Verify ownership.
  const { data: buildRow, error: buildErr } = await supabase
    .from('ai_builds')
    .select('id, user_id, slug')
    .eq('id', build_id)
    .maybeSingle()
  if (buildErr || !buildRow || buildRow.user_id !== user.id) {
    return res.status(403).json({ error: 'Build not found or not yours' })
  }

  // Slug uniqueness: allow re-using this build's existing slug.
  const { data: clash } = await supabase
    .from('ai_builds')
    .select('id')
    .eq('slug', slug)
    .neq('id', build_id)
    .maybeSingle()
  if (clash) {
    return res.status(409).json({ error: 'Slug already taken' })
  }

  // Upload to Storage. We overwrite any prior version of this build
  // so re-publish always reflects the latest assembled HTML.
  const path = `${build_id}/index.html`
  try {
    const { error: upErr } = await supabase
      .storage
      .from('ai-builds')
      .upload(path, html, {
        contentType: 'text/html; charset=utf-8',
        upsert: true,
      })
    if (upErr) throw upErr
  } catch (e) {
    console.error('[publish-build] storage upload failed:', e)
    return res.status(500).json({
      error: e.message,
      hint: 'Make sure the public Supabase Storage bucket "ai-builds" exists. See header comments in api/publish-build.js for the one-liner SQL.',
    })
  }

  const { data: pub } = supabase.storage.from('ai-builds').getPublicUrl(path)
  const storagePublicUrl = pub?.publicUrl || null

  // ── Vercel deploy (optional) ─────────────────────────────────────
  // Wire-up checklist (once per environment):
  //   - Create a Vercel project that owns *.designbrief.app
  //   - Set VERCEL_TOKEN (account or scoped) in env
  //   - Set VERCEL_PROJECT_ID in env
  //   - Set VERCEL_TEAM_ID (if the project lives under a team) in env
  // Until those are set we return the Storage URL as published_url
  // so the user always has a live page.
  let publishedUrl = storagePublicUrl
  let deploymentKind = 'storage'

  if (process.env.VERCEL_TOKEN && process.env.VERCEL_PROJECT_ID) {
    try {
      const url = await deployToVercel({
        slug,
        html,
        seoTitle: seo_title,
        metaDescription: meta_description,
      })
      if (url) {
        publishedUrl = url
        deploymentKind = 'vercel'
      }
    } catch (e) {
      console.error('[publish-build] vercel deploy failed, falling back to storage URL:', e)
    }
  }

  // Persist on ai_builds.
  const nowIso = new Date().toISOString()
  const { error: updErr } = await supabase
    .from('ai_builds')
    .update({
      slug,
      published_url: publishedUrl,
      published_at: nowIso,
      status: 'complete',
    })
    .eq('id', build_id)
  if (updErr) {
    console.error('[publish-build] update failed:', updErr)
    return res.status(500).json({ error: updErr.message })
  }

  return res.json({
    ok: true,
    published_url: publishedUrl,
    storage_url: storagePublicUrl,
    published_at: nowIso,
    deployment_kind: deploymentKind,
  })
}

// ─── Vercel deploy helper (stubbed until env is configured) ────────
// Deploys a single index.html to the configured Vercel project. The
// canonical URL `<slug>.designbrief.app` requires the wildcard domain
// to be attached to that project, Vercel honours the alias once that
// is in place. If alias attachment fails we still return the
// `.vercel.app` URL the deployment got.
async function deployToVercel({ slug, html, seoTitle, metaDescription }) {
  const token = process.env.VERCEL_TOKEN
  const projectId = process.env.VERCEL_PROJECT_ID
  const teamId = process.env.VERCEL_TEAM_ID
  if (!token || !projectId) return null

  const teamParam = teamId ? `?teamId=${encodeURIComponent(teamId)}` : ''

  // 1. Create the deployment with a single file payload.
  const deployRes = await fetch(`https://api.vercel.com/v13/deployments${teamParam}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: slug.slice(0, 52),
      project: projectId,
      target: 'production',
      files: [{ file: 'index.html', data: html }],
      projectSettings: { framework: null },
    }),
  })
  const deployment = await deployRes.json()
  if (!deployRes.ok) {
    throw new Error('Vercel deploy: ' + (deployment.error?.message || deployRes.status))
  }

  const fallbackUrl = deployment.url
    ? `https://${deployment.url}`
    : null

  // 2. Best-effort alias to <slug>.designbrief.app. Skipped if the
  //    wildcard isn't attached to the project, the fallback URL
  //    still works.
  const aliasTarget = `${slug}.designbrief.app`
  try {
    const aliasRes = await fetch(`https://api.vercel.com/v2/deployments/${deployment.uid}/aliases${teamParam}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ alias: aliasTarget }),
    })
    if (aliasRes.ok) {
      return `https://${aliasTarget}`
    }
  } catch {}

  return fallbackUrl
}
