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
    },
  }
)

export default supabase
