import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

// Daily request limit per user — generous for now, tighten when billing exists
const DAILY_LIMIT = 50

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

export async function checkRateLimit(supabase, userId, res) {
  const startOfDay = new Date()
  startOfDay.setHours(0, 0, 0, 0)

  const { count, error } = await supabase
    .from('ai_usage')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', startOfDay.toISOString())

  if (error) {
    console.error('[rate limit check]', error)
    // Fail open — don't block on DB error
    return true
  }

  if (count >= DAILY_LIMIT) {
    res.status(429).json({
      error: 'Daily limit reached',
      code: 'RATE_LIMITED',
      limit: DAILY_LIMIT,
      message: 'You have used all ' + DAILY_LIMIT + ' AI requests for today. Resets at midnight.',
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
    // Non-fatal — don't crash the request
    console.error('[log usage]', e)
  }
}
