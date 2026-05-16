import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
)

const resend = new Resend(process.env.RESEND_API_KEY)

const APP_URL = process.env.APP_URL || 'https://designbrief-vert.vercel.app'

function inviteEmailHTML({ workspaceName, inviterName, inviterEmail, role, inviteUrl }) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width">
  <title>You're invited to ${workspaceName}</title>
</head>
<body style="margin:0;padding:0;background:#0E0E0E;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0E0E0E;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#161616;border:1px solid #2a2a2a;border-radius:16px;overflow:hidden;max-width:560px;width:100%;">

          <!-- Header -->
          <tr>
            <td style="padding:32px 40px 24px;border-bottom:1px solid #2a2a2a;">
              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <div style="width:36px;height:36px;background:linear-gradient(135deg,#7C3AED,#A855F7);border-radius:10px;display:inline-flex;align-items:center;justify-content:center;font-size:18px;">✦</div>
                  </td>
                  <td style="padding-left:10px;">
                    <span style="color:#ffffff;font-size:18px;font-weight:700;letter-spacing:-0.5px;">DesignBrief</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:32px 40px;">
              <h1 style="color:#ffffff;font-size:24px;font-weight:800;letter-spacing:-0.5px;margin:0 0 12px;">
                You're invited to join <span style="color:#A855F7;">${workspaceName}</span>
              </h1>

              <p style="color:#888888;font-size:15px;line-height:1.6;margin:0 0 24px;">
                <strong style="color:#cccccc;">${inviterName}</strong> (${inviterEmail}) has invited you to collaborate on
                <strong style="color:#cccccc;">${workspaceName}</strong> as a
                <strong style="color:#A855F7;">${role}</strong>.
              </p>

              <p style="color:#888888;font-size:14px;line-height:1.6;margin:0 0 28px;">
                DesignBrief AI helps teams translate client briefs into actionable design direction, task boards, and project workflows.
              </p>

              <!-- CTA Button -->
              <table cellpadding="0" cellspacing="0" style="margin:0 0 28px;">
                <tr>
                  <td style="background:linear-gradient(135deg,#7C3AED,#A855F7);border-radius:10px;">
                    <a href="${inviteUrl}" style="display:inline-block;padding:14px 32px;color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;letter-spacing:-0.2px;">
                      Accept Invitation →
                    </a>
                  </td>
                </tr>
              </table>

              <p style="color:#555555;font-size:12px;line-height:1.6;margin:0 0 8px;">Or copy this link into your browser:</p>
              <p style="color:#7C3AED;font-size:12px;word-break:break-all;margin:0 0 28px;">${inviteUrl}</p>

              <!-- Expiry notice -->
              <div style="background:#1a1a1a;border:1px solid #2a2a2a;border-radius:8px;padding:12px 16px;">
                <p style="color:#666666;font-size:12px;margin:0;">
                  ⏱ This invitation expires in 7 days. If you did not expect this email, you can safely ignore it.
                </p>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 40px;border-top:1px solid #2a2a2a;">
              <p style="color:#444444;font-size:12px;margin:0;">Sent by DesignBrief AI · This is an automated message</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).end()

  const { action } = req.body

  // Auth — check action is public (invite link visitors are not signed in)
  const token = req.headers.authorization?.replace('Bearer ', '')
  let user = null

  if (action !== 'check') {
    if (!token || token === 'undefined' || token === 'null' || token === 'anonymous' || token.trim() === '')
      return res.status(401).json({ error: 'Missing authorization token' })

    const { data: { user: authedUser }, error: authErr } = await supabase.auth.getUser(token)
    if (authErr || !authedUser)
      return res.status(401).json({ error: 'Invalid session' })

    user = authedUser
  }

  try {

    // ── SEND INVITE ───────────────────────────────────────────────────────────
    if (action === 'send') {
      const { workspaceId, email, role = 'member' } = req.body

      if (!workspaceId || !email)
        return res.status(400).json({ error: 'workspaceId and email required' })

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRegex.test(email))
        return res.status(400).json({ error: 'Invalid email address' })

      // Check sender is owner or admin — also check workspaces.owner_id as fallback
      const [{ data: senderMember }, { data: wsOwnerRow }] = await Promise.all([
        supabase.from('workspace_members').select('role').eq('workspace_id', workspaceId).eq('user_id', user.id).single(),
        supabase.from('workspaces').select('owner_id').eq('id', workspaceId).eq('owner_id', user.id).single(),
      ])

      const isOwnerViaTable = senderMember && ['owner', 'admin'].includes(senderMember.role)
      const isOwnerViaDirect = !!wsOwnerRow

      if (!isOwnerViaTable && !isOwnerViaDirect)
        return res.status(403).json({ error: 'Only owners and admins can invite members' })

      // Auto-repair: ensure workspace owner is in workspace_members
      if (isOwnerViaDirect && !senderMember) {
        await supabase.from('workspace_members').upsert(
          { workspace_id: workspaceId, user_id: user.id, role: 'owner' },
          { onConflict: 'workspace_id,user_id' }
        )
      }

      // Check if invite already exists
      const { data: existingInvite } = await supabase
        .from('workspace_invites')
        .select('id, status')
        .eq('workspace_id', workspaceId)
        .eq('invited_email', email.toLowerCase())
        .single()

      if (existingInvite?.status === 'pending')
        return res.status(400).json({ error: 'An invite has already been sent to this email address' })

      // Get workspace name
      const { data: workspace } = await supabase
        .from('workspaces')
        .select('name')
        .eq('id', workspaceId)
        .single()

      if (!workspace)
        return res.status(400).json({ error: 'Workspace not found' })

      // Get inviter details
      const { data: { user: inviterUser } } = await supabase.auth.admin.getUserById(user.id)

      const inviterName =
        inviterUser?.user_metadata?.name ||
        inviterUser?.user_metadata?.full_name ||
        inviterUser?.email?.split('@')[0] ||
        'Someone'
      const inviterEmail = inviterUser?.email || ''

      // Create or update invite record
      let inviteToken

      if (existingInvite) {
        const { data: updated } = await supabase
          .from('workspace_invites')
          .update({
            status: 'pending',
            invited_by: user.id,
            role,
            expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          })
          .eq('id', existingInvite.id)
          .select('token')
          .single()
        inviteToken = updated?.token
      } else {
        const { data: created, error: createErr } = await supabase
          .from('workspace_invites')
          .insert({
            workspace_id: workspaceId,
            invited_by: user.id,
            invited_email: email.toLowerCase(),
            role,
          })
          .select('token')
          .single()

        if (createErr) {
          console.error('[invite create]', createErr)
          return res.status(500).json({ error: 'Failed to create invite' })
        }
        inviteToken = created?.token
      }

      if (!inviteToken)
        return res.status(500).json({ error: 'Failed to generate invite token' })

      const inviteUrl = APP_URL + '/invite/' + inviteToken

      // Respond immediately — invite is in the DB regardless of email delivery
      res.json({ success: true, message: 'Invite sent to ' + email, inviteUrl })

      // Fire-and-forget email — never blocks the response
      resend.emails.send({
        from: 'DesignBrief AI <onboarding@resend.dev>',
        to: email,
        subject: inviterName + ' invited you to join ' + workspace.name + ' on DesignBrief AI',
        html: inviteEmailHTML({ workspaceName: workspace.name, inviterName, inviterEmail, role, inviteUrl }),
      }).catch(e => console.error('[resend]', e))
    }

    // ── CHECK INVITE ──────────────────────────────────────────────────────────
    if (action === 'check') {
      const { token: inviteToken } = req.body

      if (!inviteToken)
        return res.status(400).json({ error: 'token required' })

      const { data: invite, error: inviteErr } = await supabase
        .from('workspace_invites')
        .select(`
          id, status, role, invited_email, expires_at,
          workspace:workspaces(id, name)
        `)
        .eq('token', inviteToken)
        .single()

      if (inviteErr || !invite)
        return res.status(404).json({ error: 'Invite not found', code: 'NOT_FOUND' })

      if (invite.status === 'accepted')
        return res.status(400).json({ error: 'This invite has already been accepted', code: 'ALREADY_ACCEPTED' })

      if (invite.status === 'cancelled')
        return res.status(400).json({ error: 'This invite has been cancelled', code: 'CANCELLED' })

      if (new Date(invite.expires_at) < new Date()) {
        await supabase
          .from('workspace_invites')
          .update({ status: 'expired' })
          .eq('id', invite.id)

        return res.status(400).json({
          error: 'This invite has expired. Ask the workspace owner to send a new one.',
          code: 'EXPIRED',
        })
      }

      const isLinkInvite = invite.invited_email?.startsWith('link:')

      return res.json({
        valid: true,
        isLinkInvite,
        invite: {
          id: invite.id,
          role: invite.role,
          invitedEmail: isLinkInvite ? null : invite.invited_email,
          workspace: invite.workspace,
        },
      })
    }

    // ── ACCEPT INVITE ─────────────────────────────────────────────────────────
    if (action === 'accept') {
      const { token: inviteToken } = req.body

      if (!inviteToken)
        return res.status(400).json({ error: 'token required' })

      const { data: invite } = await supabase
        .from('workspace_invites')
        .select('*')
        .eq('token', inviteToken)
        .single()

      if (!invite)
        return res.status(404).json({ error: 'Invite not found' })

      if (invite.status !== 'pending')
        return res.status(400).json({ error: 'Invite is no longer valid', code: invite.status.toUpperCase() })

      if (new Date(invite.expires_at) < new Date()) {
        await supabase
          .from('workspace_invites')
          .update({ status: 'expired' })
          .eq('id', invite.id)
        return res.status(400).json({ error: 'Invite has expired', code: 'EXPIRED' })
      }

      const isLinkInvite = invite.invited_email?.startsWith('link:')

      // Verify email match only for email-specific invites
      if (!isLinkInvite) {
        const { data: { user: acceptingUser } } = await supabase.auth.admin.getUserById(user.id)
        if (acceptingUser?.email?.toLowerCase() !== invite.invited_email.toLowerCase())
          return res.status(403).json({
            error: 'This invite was sent to ' + invite.invited_email + '. Please sign in with that email.',
            code: 'EMAIL_MISMATCH',
          })
      }

      // Check if already a member
      const { data: existing } = await supabase
        .from('workspace_members')
        .select('id')
        .eq('workspace_id', invite.workspace_id)
        .eq('user_id', user.id)
        .single()

      if (!existing) {
        const { error: memberErr } = await supabase
          .from('workspace_members')
          .insert({ workspace_id: invite.workspace_id, user_id: user.id, role: invite.role })

        if (memberErr) {
          console.error('[member insert]', memberErr)
          return res.status(500).json({ error: 'Failed to join workspace' })
        }
      }

      // Mark invite as accepted
      await supabase
        .from('workspace_invites')
        .update({ status: 'accepted', accepted_at: new Date().toISOString() })
        .eq('id', invite.id)

      const { data: workspace } = await supabase
        .from('workspaces')
        .select('id, name')
        .eq('id', invite.workspace_id)
        .single()

      return res.json({ success: true, workspace, role: invite.role })
    }

    // ── CREATE WORKSPACE INVITE LINK (no specific email) ─────────────────────
    if (action === 'create_link') {
      const { workspaceId, role = 'member' } = req.body
      if (!workspaceId) return res.status(400).json({ error: 'workspaceId required' })

      const [{ data: senderMember }, { data: wsOwnerRow }] = await Promise.all([
        supabase.from('workspace_members').select('role').eq('workspace_id', workspaceId).eq('user_id', user.id).single(),
        supabase.from('workspaces').select('owner_id').eq('id', workspaceId).eq('owner_id', user.id).single(),
      ])
      if (!senderMember && !wsOwnerRow)
        return res.status(403).json({ error: 'Only owners and admins can create invite links' })
      if (senderMember && !['owner', 'admin'].includes(senderMember.role) && !wsOwnerRow)
        return res.status(403).json({ error: 'Only owners and admins can create invite links' })

      // Sentinel email identifies this as a link-type invite (not email-specific)
      const sentinelEmail = 'link:' + role

      // Return existing valid link if present
      const { data: existing } = await supabase
        .from('workspace_invites')
        .select('token, expires_at')
        .eq('workspace_id', workspaceId)
        .eq('invited_email', sentinelEmail)
        .eq('status', 'pending')
        .gte('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (existing) {
        return res.json({
          token: existing.token,
          expiresAt: existing.expires_at,
          link: APP_URL + '/invite/' + existing.token,
        })
      }

      // Create new link invite
      const { data: created, error: createErr } = await supabase
        .from('workspace_invites')
        .insert({
          workspace_id: workspaceId,
          invited_by: user.id,
          invited_email: sentinelEmail,
          role,
        })
        .select('token, expires_at')
        .single()

      if (createErr) return res.status(500).json({ error: 'Failed to create invite link' })

      return res.json({
        token: created.token,
        expiresAt: created.expires_at,
        link: APP_URL + '/invite/' + created.token,
      })
    }

    // ── RESEND INVITE ─────────────────────────────────────────────────────────
    if (action === 'resend') {
      const { inviteId, workspaceId } = req.body
      if (!inviteId || !workspaceId) return res.status(400).json({ error: 'inviteId and workspaceId required' })

      const [{ data: member }, { data: wsOwner }] = await Promise.all([
        supabase.from('workspace_members').select('role').eq('workspace_id', workspaceId).eq('user_id', user.id).single(),
        supabase.from('workspaces').select('owner_id').eq('id', workspaceId).eq('owner_id', user.id).single(),
      ])
      const canResend = (member && ['owner', 'admin'].includes(member.role)) || !!wsOwner
      if (!canResend) return res.status(403).json({ error: 'Access denied' })

      const { data: invite } = await supabase
        .from('workspace_invites')
        .select('*, workspace:workspaces(name)')
        .eq('id', inviteId)
        .single()
      if (!invite) return res.status(404).json({ error: 'Invite not found' })

      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
      await supabase
        .from('workspace_invites')
        .update({ status: 'pending', expires_at: expiresAt })
        .eq('id', inviteId)

      const inviteUrl = APP_URL + '/invite/' + invite.token
      const { data: { user: inviterUser } } = await supabase.auth.admin.getUserById(user.id)
      const inviterName = inviterUser?.user_metadata?.name || inviterUser?.user_metadata?.full_name || inviterUser?.email?.split('@')[0] || 'Someone'
      const inviterEmail = inviterUser?.email || ''

      resend.emails.send({
        from: 'DesignBrief AI <onboarding@resend.dev>',
        to: invite.invited_email,
        subject: inviterName + ' invited you to join ' + invite.workspace.name + ' on DesignBrief AI',
        html: inviteEmailHTML({ workspaceName: invite.workspace.name, inviterName, inviterEmail, role: invite.role, inviteUrl }),
      }).catch(e => console.error('[resend email]', e))

      return res.json({ success: true })
    }

    // ── LIST INVITES ──────────────────────────────────────────────────────────
    if (action === 'list') {
      const { workspaceId } = req.body

      if (!workspaceId)
        return res.status(400).json({ error: 'workspaceId required' })

      const [{ data: member }, { data: wsOwner }] = await Promise.all([
        supabase.from('workspace_members').select('role').eq('workspace_id', workspaceId).eq('user_id', user.id).single(),
        supabase.from('workspaces').select('owner_id').eq('id', workspaceId).eq('owner_id', user.id).single(),
      ])

      const canList = (member && ['owner', 'admin'].includes(member.role)) || !!wsOwner
      if (!canList)
        return res.status(403).json({ error: 'Access denied' })

      // Auto-repair missing owner row
      if (wsOwner && !member) {
        await supabase.from('workspace_members').upsert(
          { workspace_id: workspaceId, user_id: user.id, role: 'owner' },
          { onConflict: 'workspace_id,user_id' }
        )
      }

      const { data: invites } = await supabase
        .from('workspace_invites')
        .select('*')
        .eq('workspace_id', workspaceId)
        .eq('status', 'pending')
        .not('invited_email', 'like', 'link:%')
        .order('created_at', { ascending: false })

      return res.json({ invites: invites || [] })
    }

    // ── CANCEL INVITE ─────────────────────────────────────────────────────────
    if (action === 'cancel') {
      const { inviteId, workspaceId } = req.body

      if (!inviteId || !workspaceId)
        return res.status(400).json({ error: 'inviteId and workspaceId required' })

      const { data: member } = await supabase
        .from('workspace_members')
        .select('role')
        .eq('workspace_id', workspaceId)
        .eq('user_id', user.id)
        .single()

      if (!member || !['owner', 'admin'].includes(member.role))
        return res.status(403).json({ error: 'Access denied' })

      await supabase
        .from('workspace_invites')
        .update({ status: 'cancelled' })
        .eq('id', inviteId)
        .eq('workspace_id', workspaceId)

      return res.json({ success: true })
    }

    // ── LIST MEMBERS ──────────────────────────────────────────────────────────
    if (action === 'list_members') {
      const { workspaceId } = req.body

      if (!workspaceId)
        return res.status(400).json({ error: 'workspaceId required' })

      // Auto-repair: if workspace owner is not in workspace_members, add them
      const { data: wsOwner } = await supabase
        .from('workspaces').select('owner_id').eq('id', workspaceId).single()

      if (wsOwner?.owner_id) {
        await supabase.from('workspace_members').upsert(
          { workspace_id: workspaceId, user_id: wsOwner.owner_id, role: 'owner' },
          { onConflict: 'workspace_id,user_id' }
        )
      }

      const { data: members } = await supabase
        .from('workspace_members')
        .select('user_id, role, created_at')
        .eq('workspace_id', workspaceId)

      if (!members?.length)
        return res.json({ members: [] })

      const memberDetails = await Promise.all(
        members.map(async (m) => {
          const { data: { user: u } } = await supabase.auth.admin.getUserById(m.user_id)
          return {
            id: m.user_id,
            role: m.role,
            joinedAt: m.created_at,
            email: u?.email || '',
            name:
              u?.user_metadata?.name ||
              u?.user_metadata?.full_name ||
              u?.email?.split('@')[0] ||
              'Member',
            avatar: u?.user_metadata?.avatar_url || null,
          }
        })
      )

      return res.json({ members: memberDetails })
    }

    // ── REMOVE MEMBER ─────────────────────────────────────────────────────────
    if (action === 'remove_member') {
      const { workspaceId, userId } = req.body

      if (!workspaceId || !userId)
        return res.status(400).json({ error: 'workspaceId and userId required' })

      const { data: member } = await supabase
        .from('workspace_members')
        .select('role')
        .eq('workspace_id', workspaceId)
        .eq('user_id', user.id)
        .single()

      if (!member || member.role !== 'owner')
        return res.status(403).json({ error: 'Only the workspace owner can remove members' })

      if (userId === user.id)
        return res.status(400).json({ error: 'Cannot remove yourself from your own workspace' })

      await supabase
        .from('workspace_members')
        .delete()
        .eq('workspace_id', workspaceId)
        .eq('user_id', userId)

      return res.json({ success: true })
    }

    return res.status(400).json({ error: 'Unknown action: ' + action })

  } catch (e) {
    console.error('[invite]', e)
    return res.status(500).json({ error: e.message })
  }
}
