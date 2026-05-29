import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
)

// ─── Flutterwave webhook helpers ──────────────────────────────────────────────
//
// We piggy-back the webhook on this endpoint to stay under the 12-function
// Vercel limit. Flutterwave sends a verif-hash header — we check that
// BEFORE the auth gate so the webhook can call without a Supabase JWT.
const FLW_PLAN_CREDITS = { starter: 300, pro: 1000 }
// Valid credit caps the client can request via tx_ref. Anything outside
// this set falls back to the plan default so a malformed / hostile
// tx_ref can't inflate a user's monthly cap.
const ALLOWED_CREDIT_CAPS = {
  starter: new Set([300, 600, 1200]),
  pro:     new Set([1000, 2000, 4000]),
}

async function grantPlanFromTransaction(tx) {
  // tx_ref format (current): db_<userId>_<plan>_<cycle>_c<credits>_<timestamp>
  // tx_ref format (legacy):  db_<userId>_<plan>_<cycle>_<timestamp>
  //                       or db_<userId>_<plan>_<timestamp>
  // We accept all three so in-flight payments from old clients still grant.
  const parts = String(tx.tx_ref || '').split('_')
  if (parts[0] !== 'db' || !parts[1] || !parts[2]) return { ok: false, reason: 'bad_tx_ref' }
  const userId = parts[1]
  const plan = parts[2]
  if (!FLW_PLAN_CREDITS[plan]) return { ok: false, reason: 'unknown_plan' }

  // Idempotency: skip if we already granted this exact tx_ref.
  const { data: existingLog } = await supabase
    .from('billing_events')
    .select('id')
    .eq('tx_ref', tx.tx_ref)
    .maybeSingle()
  if (existingLog) return { ok: true, idempotent: true }

  // Look for a c<credits> segment anywhere after the plan key.
  let requestedCredits = null
  for (let i = 3; i < parts.length; i++) {
    const m = /^c(\d+)$/.exec(parts[i])
    if (m) { requestedCredits = Number(m[1]); break }
  }
  const allowed = ALLOWED_CREDIT_CAPS[plan]
  const credits = (requestedCredits && allowed && allowed.has(requestedCredits))
    ? requestedCredits
    : FLW_PLAN_CREDITS[plan]
  const nowIso = new Date().toISOString()
  const { error: upErr } = await supabase
    .from('profiles')
    .update({
      plan,
      credits,
      credits_used: 0,
      credits_reset_at: nowIso,
      plan_started_at: nowIso,
    })
    .eq('id', userId)
  if (upErr) {
    console.error('[flw] profile update failed', upErr)
    return { ok: false, reason: 'profile_update_failed' }
  }

  // Best-effort audit rows. Tables come from
  //   supabase/flutterwave-billing.sql  (billing_events — idempotency)
  //   supabase/billing-page.sql          (billing_history — user-facing)
  // If either is missing the catch keeps the webhook responding 200.
  try {
    await supabase.from('billing_events').insert({
      user_id: userId,
      plan,
      amount: tx.amount,
      currency: tx.currency,
      tx_ref: tx.tx_ref,
      flw_id: tx.id ? String(tx.id) : null,
      raw: tx,
    })
  } catch {}
  try {
    await supabase.from('billing_history').insert({
      user_id: userId,
      plan,
      amount: tx.amount,
      currency: tx.currency || 'USD',
      status: 'successful',
      payment_ref: tx.tx_ref,
      billing_cycle: 'monthly',
    })
  } catch {}

  return { ok: true, plan, userId }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, verif-hash')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).end()

  // ── Flutterwave webhook (BEFORE auth gate) ────────────────────────────────
  const verifHash = req.headers['verif-hash'] || req.headers['Verif-Hash']
  if (verifHash) {
    const expected = process.env.FLW_HASH || process.env.FLUTTERWAVE_HASH
    if (!expected || verifHash !== expected) {
      return res.status(401).json({ error: 'bad verif-hash' })
    }
    const payload = req.body || {}
    if (payload.event !== 'charge.completed' || payload.data?.status !== 'successful') {
      // Acknowledge so Flutterwave doesn't retry indefinitely.
      return res.json({ ok: true, ignored: true })
    }
    const result = await grantPlanFromTransaction(payload.data)
    return res.json(result)
  }

  // ── Authed actions ────────────────────────────────────────────────────────
  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token || token === 'undefined' || token === 'null' || token.trim() === '')
    return res.status(401).json({ error: 'Unauthorised' })

  const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
  if (authErr || !user)
    return res.status(401).json({ error: 'Invalid session' })

  const { action } = req.body

  // Client fallback: verify the tx_ref straight from the Flutterwave API
  // when the page returns from a redirect (covers the rare case where
  // the webhook is delayed or misconfigured). This is auth-gated so a
  // random visitor can't grant themselves a plan.
  if (action === 'verify_payment') {
    try {
      const { tx_ref, transaction_id } = req.body
      if (!tx_ref) return res.status(400).json({ error: 'tx_ref required' })
      // Confirm the tx belongs to this user (prevents granting other people's plans)
      if (!String(tx_ref).startsWith('db_' + user.id + '_')) {
        return res.status(403).json({ error: 'tx_ref does not belong to user' })
      }
      const secret = process.env.FLW_SECRET_KEY || process.env.FLUTTERWAVE_SECRET_KEY
      if (!secret) return res.status(500).json({ error: 'Flutterwave secret not configured' })

      // Prefer the direct transaction lookup when we have an id; fall back
      // to the by-reference endpoint when only tx_ref is known (e.g. the
      // Flutterwave inline modal was dismissed before the callback fired).
      const url = transaction_id
        ? 'https://api.flutterwave.com/v3/transactions/' + encodeURIComponent(transaction_id) + '/verify'
        : 'https://api.flutterwave.com/v3/transactions/verify_by_reference?tx_ref=' + encodeURIComponent(tx_ref)
      const r = await fetch(url, { headers: { Authorization: 'Bearer ' + secret } })
      const j = await r.json()
      if (j.status !== 'success' || j.data?.status !== 'successful') {
        return res.status(400).json({
          error: 'verification failed',
          detail: j.message || j.data?.status || 'unknown',
        })
      }
      const result = await grantPlanFromTransaction(j.data)
      return res.json(result)
    } catch (e) {
      console.error('[verify_payment]', e)
      return res.status(500).json({ error: e.message })
    }
  }

  try {
    // ── UPDATE DISPLAY NAME ───────────────────────────────────────────────────
    if (action === 'update_name') {
      const { name } = req.body
      if (!name?.trim())
        return res.status(400).json({ error: 'Name is required' })

      const { error } = await supabase.auth.admin.updateUserById(user.id, {
        user_metadata: {
          ...user.user_metadata,
          name: name.trim(),
          full_name: name.trim(),
        },
      })

      if (error) throw error
      return res.json({ success: true })
    }

    // ── UPDATE AVATAR URL ─────────────────────────────────────────────────────
    // Body: { action:'update_avatar', avatarUrl }
    // The client uploads the file to the `avatars` storage bucket directly,
    // then sends us the public URL to persist in auth user_metadata.
    if (action === 'update_avatar') {
      const { avatarUrl } = req.body
      if (typeof avatarUrl !== 'string' || !avatarUrl.startsWith('http')) {
        return res.status(400).json({ error: 'avatarUrl must be an http(s) URL' })
      }
      const { error } = await supabase.auth.admin.updateUserById(user.id, {
        user_metadata: {
          ...user.user_metadata,
          avatar_url: avatarUrl,
        },
      })
      if (error) throw error
      return res.json({ success: true, avatarUrl })
    }

    // ── REMOVE AVATAR ─────────────────────────────────────────────────────────
    // Body: { action:'remove_avatar' }
    // Clears the avatar_url from user_metadata. The file in storage is left
    // behind — cheap to keep, and avoids races with old URLs still in flight.
    if (action === 'remove_avatar') {
      const next = { ...user.user_metadata }
      delete next.avatar_url
      const { error } = await supabase.auth.admin.updateUserById(user.id, {
        user_metadata: next,
      })
      if (error) throw error
      return res.json({ success: true })
    }

    // ── UPDATE WORKSPACE NAME ─────────────────────────────────────────────────
    if (action === 'update_workspace_name') {
      const { workspaceId, name } = req.body
      if (!workspaceId || !name?.trim())
        return res.status(400).json({ error: 'workspaceId and name required' })

      const { data: member } = await supabase
        .from('workspace_members')
        .select('role')
        .eq('workspace_id', workspaceId)
        .eq('user_id', user.id)
        .single()

      if (!member || !['owner', 'admin'].includes(member.role))
        return res.status(403).json({ error: 'Only owners and admins can update the workspace name' })

      const { error } = await supabase
        .from('workspaces')
        .update({ name: name.trim() })
        .eq('id', workspaceId)

      if (error) throw error
      return res.json({ success: true })
    }

    // ── DELETE WORKSPACE ──────────────────────────────────────────────────────
    if (action === 'delete_workspace') {
      const { workspaceId, confirmName } = req.body
      if (!workspaceId || !confirmName)
        return res.status(400).json({ error: 'workspaceId and confirmName required' })

      const { data: member } = await supabase
        .from('workspace_members')
        .select('role')
        .eq('workspace_id', workspaceId)
        .eq('user_id', user.id)
        .single()

      if (!member || member.role !== 'owner')
        return res.status(403).json({ error: 'Only the workspace owner can delete the workspace' })

      const { data: workspace } = await supabase
        .from('workspaces')
        .select('name')
        .eq('id', workspaceId)
        .single()

      if (!workspace)
        return res.status(404).json({ error: 'Workspace not found' })

      if (workspace.name.toLowerCase().trim() !== confirmName.toLowerCase().trim())
        return res.status(400).json({ error: 'Workspace name does not match' })

      const { error } = await supabase
        .from('workspaces')
        .delete()
        .eq('id', workspaceId)

      if (error) throw error
      return res.json({ success: true })
    }

    // ── LEAVE WORKSPACE ───────────────────────────────────────────────────────
    if (action === 'leave_workspace') {
      const { workspaceId } = req.body
      if (!workspaceId)
        return res.status(400).json({ error: 'workspaceId required' })

      const { data: member } = await supabase
        .from('workspace_members')
        .select('role')
        .eq('workspace_id', workspaceId)
        .eq('user_id', user.id)
        .single()

      if (!member)
        return res.status(404).json({ error: 'You are not a member of this workspace' })

      if (member.role === 'owner')
        return res.status(400).json({
          error: 'Workspace owners cannot leave. Transfer ownership first or delete the workspace.',
        })

      const { error } = await supabase
        .from('workspace_members')
        .delete()
        .eq('workspace_id', workspaceId)
        .eq('user_id', user.id)

      if (error) throw error
      return res.json({ success: true })
    }

    // ── DELETE ACCOUNT ────────────────────────────────────────────────────────
    if (action === 'delete_account') {
      // Best-effort DB cleanup — wrap each step individually so one missing
      // table / wrong column never silently blocks account deletion.
      try { await supabase.from('workspace_members').delete().eq('user_id', user.id) } catch {}
      try { await supabase.from('team_members').delete().eq('user_id', user.id) } catch {}

      try {
        const { data: ownedWs } = await supabase
          .from('workspaces').select('id').eq('owner_id', user.id)
        for (const ws of ownedWs || []) {
          try { await supabase.from('workspaces').delete().eq('id', ws.id) } catch {}
        }
      } catch {}

      try { await supabase.from('profiles').delete().eq('id', user.id) } catch {}

      // This is the authoritative step — if it errors, surface it to the client.
      const { error } = await supabase.auth.admin.deleteUser(user.id)
      if (error) throw error
      return res.json({ success: true })
    }

    // ── GET USER WORKSPACES ───────────────────────────────────────────────────
    if (action === 'get-user-workspaces') {
      const { data: memberships } = await supabase
        .from('workspace_members')
        .select('workspace_id, workspaces(*)')
        .eq('user_id', user.id)

      const workspaces = (memberships || [])
        .map(m => m.workspaces)
        .filter(Boolean)

      return res.json({ workspaces })
    }

    // ── GET WORKSPACE ─────────────────────────────────────────────────────────
    if (action === 'get-workspace') {
      // 1. Try to find a workspace the user owns
      let { data: workspace } = await supabase
        .from('workspaces')
        .select('*')
        .eq('owner_id', user.id)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle()

      // 2. Fall back to workspaces the user is a member of
      if (!workspace) {
        const { data: membership } = await supabase
          .from('workspace_members')
          .select('workspace_id')
          .eq('user_id', user.id)
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle()

        if (membership?.workspace_id) {
          const { data: memberWs } = await supabase
            .from('workspaces')
            .select('*')
            .eq('id', membership.workspace_id)
            .maybeSingle()
          workspace = memberWs || null
        }
      }

      return res.json({ workspace: workspace || null })
    }

    return res.status(400).json({ error: 'Unknown action: ' + action })
  } catch (e) {
    console.error('[settings]', e)
    return res.status(500).json({ error: e.message })
  }
}
