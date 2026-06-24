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

// Returns one of:
//   { success: true,  creditsRemaining: number }
//   { success: false, reason: 'insufficient_credits', credits, required }
//   { success: false, reason: 'profile_not_found' | 'update_failed' | 'unknown' }
// Race a promise against a timer. Used to escape silent Supabase
// hangs (RLS deadlock, network drop, suspended row lock). When the
// timer fires first, the original promise is abandoned and we
// return null so the caller knows to fall through.
function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise(resolve => setTimeout(() => {
      console.warn('[deductCredits] timeout after', ms, 'ms at', label)
      resolve({ __timeout: true })
    }, ms)),
  ])
}

export async function deductCredits(supabase, userId, action) {
  const cost = CREDIT_COSTS[action]
  if (!cost) return { success: false, reason: 'unknown' }
  if (!userId) return { success: false, reason: 'no_user' }

  console.log('[deductCredits] start. user:', userId, 'action:', action, 'cost:', cost)

  try {
    console.log('[deductCredits] reading profile...')
    const readPromise = supabase
      .from('profiles')
      .select('credits, credits_used, plan')
      .eq('id', userId)
      .single()
    // 8s ceiling on the profile read. A healthy Supabase round-trip
    // is ~150-400ms; anything past 8s is hanging, not slow.
    const readResult = await withTimeout(readPromise, 8000, 'profile_read')
    if (readResult.__timeout) {
      // Profile read hung. Most common cause: RLS policy issue or
      // Supabase row lock. We BYPASS the credit gate so the user
      // can still translate; usage tracking just skips this call.
      console.warn('[deductCredits] profile read hung — bypassing credit gate so translation can proceed')
      return { success: true, creditsRemaining: 999, used: 0, __bypassed: true }
    }
    const { data: profile, error: readErr } = readResult
    console.log('[deductCredits] profile:', profile, 'error:', readErr)

    if (readErr || !profile) {
      return { success: false, reason: 'profile_not_found' }
    }

    // Paid plans with unlimited / refreshed credits still go through
    // this path so we record usage, but never block them on shortage.
    if ((profile.credits ?? 0) < cost && profile.plan === 'free') {
      return {
        success: false,
        reason: 'insufficient_credits',
        credits: profile.credits ?? 0,
        required: cost,
      }
    }

    const newCredits = Math.max(0, (profile.credits ?? 0) - cost)
    const newUsed = (profile.credits_used ?? 0) + cost

    console.log('[deductCredits] updating profile...')
    const writePromise = supabase
      .from('profiles')
      .update({ credits: newCredits, credits_used: newUsed })
      .eq('id', userId)
    const writeResult = await withTimeout(writePromise, 8000, 'profile_update')
    if (writeResult.__timeout) {
      // Update hung. Treat the same as the read timeout — proceed
      // optimistically. The credit gets effectively used (because
      // we already returned success) without being deducted.
      console.warn('[deductCredits] profile update hung — proceeding with translation anyway')
      return { success: true, creditsRemaining: newCredits, used: newUsed, __bypassed: true }
    }
    const { error: writeErr } = writeResult
    console.log('[deductCredits] update done. error:', writeErr)

    if (writeErr) return { success: false, reason: 'update_failed' }

    return { success: true, creditsRemaining: newCredits, used: newUsed }
  } catch (e) {
    console.error('[deductCredits]', e)
    return { success: false, reason: 'unknown' }
  }
}
