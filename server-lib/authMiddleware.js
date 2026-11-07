import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY


export async function requireAuth(req, res) {
  if (!supabaseUrl || !supabaseServiceKey) {
    res.status(503).json({
      error: 'service_unavailable',
      code: 'SUPABASE_NOT_CONFIGURED',
      message: 'Authentication is temporarily unavailable.',
    })
    return null
  }
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({
      error: 'Unauthorised',
      code: 'NO_AUTH',
    })
    return null
  }

  const token = authHeader.slice(7)

  const supabase = createClient(
    supabaseUrl,
    supabaseServiceKey,
    { auth: { persistSession: false } }
  )

  const { data: { user }, error } = await supabase.auth.getUser(token)

  if (error || !user) {
    res.status(401).json({
      error: 'Invalid session',
      code: 'INVALID_AUTH',
    })
    return null
  }

  return { user, supabase }
}

// Per-plan daily API-call backstops. Credits are the real usage cap;
// this limiter exists to stop runaway scripts. Budgets sized so
// legitimate use never hits them: a V3 brief translation alone makes
// ~22 calls, plus scoring + backlog generation.
const DAILY_LIMIT_FOR_PLAN = {
  free: 120,
  starter: 600,
  pro: 1500,
}

export async function checkRateLimit(supabase, userId, res) {
  const startOfDay = new Date()
  startOfDay.setHours(0, 0, 0, 0)

  const [{ count, error }, planRes] = await Promise.all([
    supabase
      .from('ai_usage')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('created_at', startOfDay.toISOString()),
    supabase
      .from('profiles')
      .select('plan')
      .eq('id', userId)
      .single(),
  ])

  if (error) {
    console.error('[rate limit check]', error)
    // Fail CLOSED. A limiter that fails open turns a DB outage into
    // an unlimited AI endpoint on our bill. Blocking one request
    // during a Supabase blip is the cheaper failure.
    res.status(503).json({
      error: 'service_unavailable',
      code: 'RATE_CHECK_FAILED',
      message: 'Could not verify usage limits. Try again in a moment.',
    })
    return false
  }

  const plan = planRes?.data?.plan || 'free'
  const limit = DAILY_LIMIT_FOR_PLAN[plan] ?? DAILY_LIMIT_FOR_PLAN.free

  if (count >= limit) {
    res.status(429).json({
      error: 'Daily limit reached',
      code: 'RATE_LIMITED',
      limit,
      message: 'You have used all ' + limit + ' AI requests for today. Resets at midnight.',
    })
    return false
  }

  return true
}

// Managed Codex agent runs are the most expensive AI path in the product.
// Keep the entitlement check on the server so hiding a client button is never
// the only thing standing between an unentitled account and an agent run.
export async function requireProPlan(supabase, userId, res) {
  const { data, error } = await supabase
    .from('profiles')
    .select('plan')
    .eq('id', userId)
    .single()

  if (error) {
    console.error('[plan entitlement check]', error)
    res.status(503).json({
      error: 'service_unavailable',
      code: 'PLAN_CHECK_FAILED',
      message: 'Could not verify your plan. Try again in a moment.',
    })
    return false
  }

  if (data?.plan !== 'pro') {
    res.status(403).json({
      error: 'pro_plan_required',
      code: 'PRO_PLAN_REQUIRED',
      message: 'The Codex website builder is available on the Pro plan.',
    })
    return false
  }

  return true
}

export async function logUsage(supabase, userId, endpoint, tokensUsed) {
  try {
    const { error } = await supabase
      .from('ai_usage')
      .insert({
        user_id: userId,
        endpoint,
        tokens_used: tokensUsed || 0,
      })
    if (error) console.error('[log usage]', error)
  } catch (e) {
    // Non-fatal, don't crash the request
    console.error('[log usage]', e)
  }
}

export async function consumeCreditOperation(supabase, userId, operationId, policy, res) {
  if (!policy?.billableAction) {
    return { ok: true, charged: false, credits_remaining: null, calls_remaining: null }
  }
  if (!operationId) {
    res.status(400).json({
      error: 'operation_required',
      code: 'OPERATION_REQUIRED',
      message: 'A billing operation ID is required for this AI task.',
    })
    return null
  }

  const { data, error } = await supabase.rpc('consume_ai_credit_operation', {
    p_user_id: userId,
    p_operation_id: operationId,
    p_action: policy.billableAction,
  })

  if (error) {
    console.error('[credit operation]', error)
    res.status(503).json({
      error: 'credit_service_unavailable',
      code: 'CREDIT_SERVICE_UNAVAILABLE',
      message: 'Could not verify AI credits. Try again in a moment.',
    })
    return null
  }

  const row = Array.isArray(data) ? data[0] : data
  if (!row?.ok) {
    const insufficient = row?.reason === 'insufficient_credits'
    res.status(insufficient ? 402 : 429).json({
      error: row?.reason || 'credit_operation_rejected',
      code: insufficient ? 'INSUFFICIENT_CREDITS' : 'CREDIT_OPERATION_REJECTED',
      message: insufficient
        ? 'You do not have enough AI credits for this action.'
        : 'This AI operation can no longer be used. Start the action again.',
      credits_remaining: row?.credits_remaining ?? 0,
    })
    return null
  }

  return { ...row, credit_cost: policy.creditCost }
}
