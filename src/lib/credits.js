import { withTimeout } from './textUtils.js'

// ────────────────────────────────────────────────────────────────────
// Credit costs per AI action + a small server-side-style deduction
// helper that callers run before invoking the action.
//
// We run the read/update directly through the anon client and rely on
// RLS, the user can only deduct from their own profile row. Service-
// role isn't needed here, and the round-trip stays fast.
// ────────────────────────────────────────────────────────────────────

export const CREDIT_COSTS = {
  // Full brief: translate + score + deep analysis (techStack +
  // features + userFlow) all in parallel. The Render backend has no
  // Vercel 60s ceiling so we bundle everything back into one click;
  // 10 = 6 (translate) + 4 (deep) at the previous unit prices.
  brief_translation: 10,
  // Kept for backward compatibility with old result-page builds that
  // still expose a manual re-run path. New translations include deep
  // analysis up-front and never hit this charge.
  deep_analysis: 4,
  kanban_generation: 8,
  ai_task_prompt: 3,
  moodboard_refresh: 3,
  red_flag_analysis: 3,
  questions_generation: 3,
  client_intake: 5,
}
// Deduction now goes through the deduct_credits(p_action) Postgres RPC
// (migrations/0012_credit_lockdown.sql):
//   - ATOMIC: one conditional UPDATE, no read-then-write race. Two
//     parallel translations can no longer share one deduction.
//   - SERVER-PRICED: the cost table lives in the function, so a
//     tampered client can't undercharge. CREDIT_COSTS above is only
//     used for UI display (modals, tooltips).
//   - GUARDED: a BEFORE UPDATE trigger on profiles rejects any direct
//     client write to credits / credits_used / plan, so the old
//     console exploit (update({ credits: 99999 })) is dead.
export async function deductCredits(supabase, userId, action) {
  if (!CREDIT_COSTS[action]) return { success: false, reason: 'unknown' }
  if (!userId) return { success: false, reason: 'no_user' }

  console.log('[deductCredits] rpc start. action:', action)
  try {
    const rpcPromise = supabase.rpc('deduct_credits', { p_action: action })
    // 8s ceiling. A healthy round-trip is ~150-400ms; past 8s it is
    // hanging, not slow. On hang we fail OPEN so a Supabase hiccup
    // never blocks a translation, an availability call made after
    // the earlier silent-hang incidents. The RPC itself is atomic,
    // so the open-fail can no longer double-spend, worst case is one
    // uncharged action.
    const result = await withTimeout(rpcPromise, 8000, 'deduct_rpc')
    if (result.__timeout) {
      console.warn('[deductCredits] rpc hung — bypassing credit gate so the action can proceed')
      return { success: true, creditsRemaining: 999, __bypassed: true }
    }

    const { data, error } = result
    if (error) {
      // Function not deployed yet (migration 0012 not run) → fall
      // open with a loud warning rather than dead-ending every user.
      console.error('[deductCredits] rpc error:', error.message)
      if (/function .*deduct_credits/i.test(error.message || '')) {
        console.warn('[deductCredits] deduct_credits RPC missing — run migrations/0012_credit_lockdown.sql. Bypassing gate.')
        return { success: true, creditsRemaining: 999, __bypassed: true }
      }
      return { success: false, reason: 'update_failed' }
    }

    const row = Array.isArray(data) ? data[0] : data
    if (!row) return { success: false, reason: 'unknown' }
    if (row.ok) {
      return { success: true, creditsRemaining: row.credits_remaining }
    }
    if (row.reason === 'insufficient_credits') {
      return {
        success: false,
        reason: 'insufficient_credits',
        credits: row.credits_remaining ?? 0,
        required: CREDIT_COSTS[action],
      }
    }
    return { success: false, reason: row.reason || 'unknown' }
  } catch (e) {
    console.error('[deductCredits]', e)
    return { success: false, reason: 'unknown' }
  }
}
