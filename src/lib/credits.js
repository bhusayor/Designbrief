// ────────────────────────────────────────────────────────────────────
// Credit costs per AI action + a small server-side-style deduction
// helper that callers run before invoking the action.
//
// We run the read/update directly through the anon client and rely on
// RLS — the user can only deduct from their own profile row. Service-
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
export async function deductCredits(supabase, userId, action) {
  const cost = CREDIT_COSTS[action]
  if (!cost) return { success: false, reason: 'unknown' }
  if (!userId) return { success: false, reason: 'no_user' }

  try {
    const { data: profile, error: readErr } = await supabase
      .from('profiles')
      .select('credits, credits_used, plan')
      .eq('id', userId)
      .single()

    if (readErr || !profile) {
      return { success: false, reason: 'profile_not_found' }
    }

    // Paid plans with unlimited / refreshed credits still go through
    // this path so we record usage — but never block them on shortage.
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

    const { error: writeErr } = await supabase
      .from('profiles')
      .update({ credits: newCredits, credits_used: newUsed })
      .eq('id', userId)

    if (writeErr) return { success: false, reason: 'update_failed' }

    return { success: true, creditsRemaining: newCredits, used: newUsed }
  } catch (e) {
    console.error('[deductCredits]', e)
    return { success: false, reason: 'unknown' }
  }
}
