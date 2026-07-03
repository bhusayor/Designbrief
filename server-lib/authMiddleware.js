import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY


export async function requireAuth(req, res) {
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

export async function logUsage(supabase, userId, endpoint, tokensUsed) {
  try {
    await supabase
      .from('ai_usage')
      .insert({
        user_id: userId,
        endpoint,
        tokens_used: tokensUsed || 0,
      })
  } catch (e) {
    // Non-fatal, don't crash the request
    console.error('[log usage]', e)
  }
}
