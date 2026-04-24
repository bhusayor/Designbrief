import { createClient } from '@supabase/supabase-js'

// Uses service role — bypasses RLS and auth
const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    }
  }
)

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const {
      project_name,
      project_type,
      sections,
      user_id,
      client_name,
      client_email,
    } = req.body

    if (!project_name || !user_id) {
      return res.status(400).json({
        error: 'project_name and user_id required'
      })
    }

    const { data, error } = await supabase
      .from('intake_forms')
      .insert({
        project_name,
        project_type: project_type || '',
        sections: sections || [],
        user_id,
        status: 'sent',
        client_name: client_name || null,
        client_email: client_email || null,
      })
      .select('id')
      .single()

    if (error) {
      console.error('[create-intake] Error:', error)
      return res.status(500).json({ error: error.message })
    }

    console.log('[create-intake] Created:', data.id)
    return res.json({ id: data.id })

  } catch (e) {
    console.error('[create-intake] Exception:', e)
    return res.status(500).json({ error: e.message })
  }
}
