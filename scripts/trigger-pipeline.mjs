// ────────────────────────────────────────────────────────────────────
// scripts/trigger-pipeline.mjs — rescue tool for stuck submissions.
//
// Finds every intake_submissions row that hasn't finished translating
// (status not in 'complete'/'failed' OR no translated_result) and
// fires the pipeline at $RENDER_URL/api/process-intake for each.
//
// Use this when:
//   - You just deployed Render and need to flush the backlog of
//     submissions that landed before the pipeline endpoint was
//     reachable.
//   - You hit Render env-var misconfiguration and want to retry
//     everything that got stuck during the window.
//   - You're debugging the pipeline locally and want to manually
//     trigger it on a row.
//
// Reads VITE_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from .env (or
// from process.env when run in CI).
//
// Usage:
//   node scripts/trigger-pipeline.mjs                # all stuck
//   node scripts/trigger-pipeline.mjs sub_abc123     # specific id
//   node scripts/trigger-pipeline.mjs --dry-run      # list only
//
// Render URL is read from RENDER_URL env var first, then VITE_API_URL
// as a fallback, then the user is prompted on the CLI.
// ────────────────────────────────────────────────────────────────────

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

// Tiny .env loader so the script runs straight from `node` without
// the user needing dotenv or any shell rituals.
function loadDotEnv() {
  try {
    const here = dirname(fileURLToPath(import.meta.url))
    const envPath = resolve(here, '..', '.env')
    const text = readFileSync(envPath, 'utf8')
    for (const line of text.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eq = trimmed.indexOf('=')
      if (eq < 0) continue
      const key = trimmed.slice(0, eq).trim()
      let val = trimmed.slice(eq + 1).trim()
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1)
      }
      if (!(key in process.env)) process.env[key] = val
    }
  } catch {
    // No .env or unreadable — fall back to whatever's already
    // in process.env. CI will set them directly.
  }
}

async function main() {
  loadDotEnv()
  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) {
    console.error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env / env vars.')
    process.exit(1)
  }

  const renderUrl = (
    process.env.RENDER_URL
    || process.env.VITE_API_URL
    || ''
  ).replace(/\/$/, '')
  if (!renderUrl) {
    console.error([
      'No RENDER_URL or VITE_API_URL configured.',
      'Set one and re-run, e.g.',
      '  RENDER_URL=https://your-service.onrender.com node scripts/trigger-pipeline.mjs',
    ].join('\n'))
    process.exit(1)
  }

  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const explicitId = args.find(a => !a.startsWith('--'))

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  })

  // Wildcard select so the script works regardless of which
  // migrations have been applied — older DBs may be missing
  // failure_step/business_name/translated_result and we don't
  // want the rescue tool to crash because of schema lag.
  let query = supabase
    .from('intake_submissions')
    .select('*')
    .order('submitted_at', { ascending: false })

  if (explicitId) {
    query = query.eq('id', explicitId)
  } else {
    // Anything that didn't successfully translate. Includes
    // pending/enriching/etc stuck mid-pipeline AND failed rows the
    // designer wants to retry.
    query = query.or('translated_result.is.null,status.eq.failed')
  }

  const { data, error } = await query
  if (error) {
    console.error('Supabase select failed:', error.message)
    process.exit(1)
  }
  if (!data?.length) {
    console.log('No matching submissions. Either everything is already translated or the id is wrong.')
    return
  }

  console.log(`Found ${data.length} submission(s) to (re-)process via ${renderUrl}/api/process-intake`)
  console.log('')
  for (const row of data) {
    const ts = row.submitted_at ? new Date(row.submitted_at).toISOString() : '(no timestamp)'
    const who = row.business_name || row.client_name || '(no identity)'
    console.log(`  ${row.id} · status=${row.status} · ${ts} · ${who}`)
  }
  console.log('')

  if (dryRun) {
    console.log('--dry-run flag set; not firing any requests.')
    return
  }

  let ok = 0, fail = 0
  for (const row of data) {
    process.stdout.write(`Triggering ${row.id} ... `)
    try {
      const res = await fetch(`${renderUrl}/api/process-intake`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ submission_id: row.id }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) {
        console.log(`FAIL (${res.status}: ${j.message || j.error || 'no body'})`)
        fail++
      } else {
        console.log('queued')
        ok++
      }
    } catch (e) {
      console.log(`ERROR: ${e?.message || e}`)
      fail++
    }
    // Gentle pacing so we don't overwhelm Render if there's a long
    // backlog. Pipeline runs ~60s per submission anyway.
    await new Promise(r => setTimeout(r, 200))
  }

  console.log('')
  console.log(`Done. ${ok} queued, ${fail} failed.`)
  console.log('Pipeline runs ~60-90s per submission. Watch intake_submissions.status in Supabase to see them advance.')
}

main().catch(e => {
  console.error('Uncaught:', e)
  process.exit(1)
})
