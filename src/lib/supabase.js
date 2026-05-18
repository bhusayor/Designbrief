import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

console.log('Supabase URL:', supabaseUrl ? 'SET' : 'MISSING')
console.log('Supabase Key:', supabaseKey ? 'SET' : 'MISSING')

if (!supabaseUrl || !supabaseKey) {
  console.error(
    'Missing Supabase env vars. ' +
    'Check your .env file for ' +
    'VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY'
  )
}

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseKey || 'placeholder-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: 'designbrief-auth-v1',
      flowType: 'pkce',
      // No-op lock — bypasses the navigator/localStorage lock that was
      // throwing "Lock was released because another request stole it" when
      // our 5s project polling raced with Supabase's internal auto-refresh.
      // We're single-tab per device so we don't need cross-tab coordination.
      lock: (_name, _acquireTimeout, fn) => fn(),
    },
  }
)

export default supabase
