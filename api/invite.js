import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
)

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
}

export default async function handler(req, res) {
  setCors(res)

  if (req.method === 'OPTIONS') return res.status(200).end()

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const {
      email, inviteToken, projectId,
      projectName, jobRole, inviterName,
    } = req.body

    if (!email || !inviteToken) {
      return res.status(400).json({ error: 'email and inviteToken required' })
    }

    const inviteLink = (process.env.VITE_APP_URL || '') + '/join/' + inviteToken

    // Try Supabase admin invite if service key is configured
    if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
      try {
        await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
          data: {
            invite_token: inviteToken,
            project_id: projectId,
            job_role: jobRole,
            invited_by: inviterName,
            project_name: projectName,
          },
          redirectTo: inviteLink,
        })
        return res.json({ success: true, method: 'supabase', inviteLink })
      } catch (adminErr) {
        console.warn('Admin invite failed:', adminErr.message)
        // Fall through to link-only response
      }
    }

    res.json({
      success: true,
      method: 'link-only',
      inviteLink,
      message: 'Share this link with ' + email,
    })

  } catch (error) {
    console.error('Invite error:', error)
    res.status(500).json({ error: error.message })
  }
}
