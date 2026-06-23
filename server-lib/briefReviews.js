// ────────────────────────────────────────────────────────────────────
// briefReviews.js — endpoints for the client-facing brief review
// flow. Mounted under /api/brief-reviews/* in server.js.
//
// Endpoints:
//   POST /api/brief-reviews                  (auth required)
//        → create a new share link + email the client
//   GET  /api/brief-reviews/by-token/:token  (public, token-gated)
//        → return the brief data + review metadata
//   POST /api/brief-reviews/by-token/:token/decision (public)
//        → client submits approve / changes_requested
//   POST /api/brief-reviews/by-token/:token/comments (public)
//        → client adds a comment
//   GET  /api/brief-reviews/by-project/:projectId (auth required)
//        → designer fetches the review state + comments
// ────────────────────────────────────────────────────────────────────

import { createClient } from '@supabase/supabase-js'
import { sendEmail } from './sendEmail.js'
import { randomBytes } from 'crypto'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  { auth: { persistSession: false } },
)

function genShareToken() {
  // 32 hex chars = 128 bits of entropy. Plenty for an unguessable
  // share link, fits cleanly in a URL.
  return randomBytes(16).toString('hex')
}

function appUrl(req) {
  return (
    process.env.VITE_APP_URL ||
    req.headers.origin ||
    'https://designbrief.ai'
  ).replace(/\/$/, '')
}

// ────────────────────────────────────────────────────────────────────
// POST /api/brief-reviews — designer creates a share link
// Auth: Bearer token (designer's Supabase JWT)
// Body: { project_id, client_email, client_name?, designer_message? }
// ────────────────────────────────────────────────────────────────────
export async function createBriefReview(req, res) {
  // Auth
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'unauthorised' })
  }
  const { data: { user }, error: userErr } = await supabase.auth.getUser(authHeader.slice(7))
  if (userErr || !user) return res.status(401).json({ error: 'invalid_session' })

  const { project_id, intake_submission_id, client_email, client_name, designer_message } = req.body || {}
  if (!project_id && !intake_submission_id) {
    return res.status(400).json({ error: 'bad_request', message: 'project_id or intake_submission_id required' })
  }
  if (!client_email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(client_email)) {
    return res.status(400).json({ error: 'bad_request', message: 'valid client_email required' })
  }

  // Verify the project / submission belongs to the designer.
  if (project_id) {
    const { data: project, error: projErr } = await supabase
      .from('projects')
      .select('id, user_id, title')
      .eq('id', project_id)
      .maybeSingle()
    if (projErr || !project) return res.status(404).json({ error: 'project_not_found' })
    if (project.user_id !== user.id) return res.status(403).json({ error: 'forbidden' })
  }

  // Look up the designer's display name + branding for the email.
  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, full_name, logo_url, brand_primary_color')
    .eq('id', user.id)
    .maybeSingle()
  const designerName =
    profile?.display_name || profile?.full_name || user.email || 'Your designer'

  // Insert the review row with a fresh share_token.
  const share_token = genShareToken()
  const { data: review, error: insErr } = await supabase
    .from('brief_reviews')
    .insert({
      project_id: project_id || null,
      intake_submission_id: intake_submission_id || null,
      user_id: user.id,
      share_token,
      client_email,
      client_name: client_name || null,
      designer_message: designer_message || null,
      status: 'pending',
    })
    .select('*')
    .single()
  if (insErr || !review) {
    console.error('[brief-reviews] insert failed', insErr)
    return res.status(500).json({ error: 'insert_failed', message: insErr?.message })
  }

  // Send the invite email. Failure here is non-fatal — the review
  // row exists and the designer can copy the link manually — but we
  // capture the failure mode so the API response tells the designer
  // exactly what went wrong instead of leaving them guessing.
  const reviewUrl = `${appUrl(req)}/review/${share_token}`
  let emailResult = { sent: false, error: null }
  try {
    const safeName = String(designerName).replace(/[<>"]/g, '').trim() || 'Your designer'
    const html = renderInviteHtml({
      designerName: safeName,
      clientName: client_name,
      message: designer_message,
      reviewUrl,
      logo: profile?.logo_url || null,
      primary: profile?.brand_primary_color || '#8B5CF6',
    })
    const text = renderInviteText({
      designerName: safeName,
      clientName: client_name,
      message: designer_message,
      reviewUrl,
    })
    // Less-spammy subject: a personal-feeling sentence beats
    // "Designer sent you a thing". Spam filters key on "sent you" +
    // generic CTAs. A subject phrased like the designer wrote it
    // themselves scores significantly better.
    const firstName = (client_name || '').trim().split(/\s+/)[0]
    const subject = firstName
      ? `${firstName}, quick read before we get started`
      : 'Quick read before we get started'

    // List-Unsubscribe headers tell Gmail/Outlook this is a real
    // sender (transactional senders provide them). Reduces spam
    // scoring meaningfully even on shared sender domains.
    const headers = {
      'List-Unsubscribe': `<mailto:${user.email || 'support@designbrief.ai'}?subject=unsubscribe>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    }

    const sendRes = await sendEmail({
      from: `${safeName} <onboarding@resend.dev>`,
      reply_to: user.email || undefined,
      to: [client_email],
      subject,
      html,
      text,
      headers,
    })
    if (sendRes?.error) {
      // The shape from server-lib/sendEmail.js when Resend returns
      // a non-2xx response. Logged loudly so Render captures it,
      // and surfaced in the API response so the designer sees the
      // real reason.
      console.error('[brief-reviews] resend rejected', sendRes.error)
      emailResult = { sent: false, error: sendRes.error.message || 'Email provider rejected the message.' }
    } else {
      emailResult = { sent: true, error: null, id: sendRes?.data?.id || null }
      console.log('[brief-reviews] email sent', { to: client_email, id: sendRes?.data?.id })
    }
  } catch (e) {
    console.error('[brief-reviews] email exception', e)
    emailResult = { sent: false, error: e?.message || 'Email send failed.' }
  }

  return res.status(200).json({ ok: true, review, share_url: reviewUrl, email: emailResult })
}

// ────────────────────────────────────────────────────────────────────
// GET /api/brief-reviews/by-token/:token — public read of a brief
// for the client's review page. Returns the brief result + review
// metadata + existing comments. Also stamps opened_at the first
// time it's hit so the designer can see "client opened the link".
// ────────────────────────────────────────────────────────────────────
export async function getBriefReviewByToken(req, res) {
  const { token } = req.params
  if (!token) return res.status(400).json({ error: 'bad_request' })

  const { data: review, error } = await supabase
    .from('brief_reviews')
    .select('id, project_id, intake_submission_id, user_id, status, approved_at, decision_note, client_name, client_email, designer_message, opened_at, created_at')
    .eq('share_token', token)
    .maybeSingle()
  if (error || !review) return res.status(404).json({ error: 'not_found' })

  // Stamp first-open. Best-effort; ignore errors.
  if (!review.opened_at) {
    supabase.from('brief_reviews').update({ opened_at: new Date().toISOString() }).eq('id', review.id).then(() => {}, () => {})
  }

  // Resolve the brief content. Two possible sources:
  //   1. projects.result (a designer-translated brief)
  //   2. intake_submissions.translated_result (came from a client form)
  let brief = null
  let projectTitle = null
  if (review.project_id) {
    const { data: project } = await supabase
      .from('projects')
      .select('title, result')
      .eq('id', review.project_id)
      .maybeSingle()
    brief = project?.result || null
    projectTitle = project?.title || null
  } else if (review.intake_submission_id) {
    const { data: sub } = await supabase
      .from('intake_submissions')
      .select('business_name, translated_result, intake_form_id')
      .eq('id', review.intake_submission_id)
      .maybeSingle()
    brief = sub?.translated_result || null
    projectTitle = sub?.business_name || null
  }

  // Designer branding for the client view (footer note + colour).
  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, full_name, logo_url, brand_primary_color')
    .eq('id', review.user_id)
    .maybeSingle()

  const { data: comments } = await supabase
    .from('brief_review_comments')
    .select('id, section_id, item_key, body, status, created_at')
    .eq('review_id', review.id)
    .order('created_at', { ascending: true })

  return res.status(200).json({
    review: {
      id: review.id,
      status: review.status,
      approved_at: review.approved_at,
      decision_note: review.decision_note,
      client_name: review.client_name,
      client_email: review.client_email,
      designer_message: review.designer_message,
      opened_at: review.opened_at,
      created_at: review.created_at,
    },
    brief,
    projectTitle,
    designer: {
      name: profile?.display_name || profile?.full_name || 'Your designer',
      logo: profile?.logo_url || null,
      primary: profile?.brand_primary_color || '#8B5CF6',
    },
    comments: comments || [],
  })
}

// ────────────────────────────────────────────────────────────────────
// POST /api/brief-reviews/by-token/:token/decision — client decides
// Body: { status: 'approved' | 'changes_requested', note? }
// ────────────────────────────────────────────────────────────────────
export async function submitBriefReviewDecision(req, res) {
  const { token } = req.params
  const { status, note } = req.body || {}
  if (!token) return res.status(400).json({ error: 'bad_request' })
  if (status !== 'approved' && status !== 'changes_requested') {
    return res.status(400).json({ error: 'bad_request', message: 'status must be approved or changes_requested' })
  }

  const patch = {
    status,
    decision_note: note || null,
    approved_at: status === 'approved' ? new Date().toISOString() : null,
  }
  const { data, error } = await supabase
    .from('brief_reviews')
    .update(patch)
    .eq('share_token', token)
    .select('id, user_id, project_id, intake_submission_id')
    .maybeSingle()
  if (error || !data) return res.status(404).json({ error: 'not_found' })

  return res.status(200).json({ ok: true, status })
}

// ────────────────────────────────────────────────────────────────────
// POST /api/brief-reviews/by-token/:token/comments — client comment
// Body: { section_id, item_key?, body }
// ────────────────────────────────────────────────────────────────────
export async function addBriefReviewComment(req, res) {
  const { token } = req.params
  const { section_id, item_key, body } = req.body || {}
  if (!token || !section_id || !body) return res.status(400).json({ error: 'bad_request' })

  // Resolve review_id from the token (server-side; client never
  // sees the internal id).
  const { data: review } = await supabase
    .from('brief_reviews')
    .select('id')
    .eq('share_token', token)
    .maybeSingle()
  if (!review) return res.status(404).json({ error: 'not_found' })

  const { data, error } = await supabase
    .from('brief_review_comments')
    .insert({
      review_id: review.id,
      section_id,
      item_key: item_key || null,
      body: String(body).slice(0, 4000),
    })
    .select('*')
    .single()
  if (error) return res.status(500).json({ error: 'insert_failed', message: error.message })

  return res.status(200).json({ ok: true, comment: data })
}

// ────────────────────────────────────────────────────────────────────
// GET /api/brief-reviews/by-project/:projectId — designer view
// Returns the review row + all comments. Auth required.
// ────────────────────────────────────────────────────────────────────
export async function getBriefReviewByProject(req, res) {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: 'unauthorised' })
  const { data: { user } } = await supabase.auth.getUser(authHeader.slice(7))
  if (!user) return res.status(401).json({ error: 'invalid_session' })

  const { projectId } = req.params
  const { data: review } = await supabase
    .from('brief_reviews')
    .select('*')
    .eq('project_id', projectId)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!review) return res.status(200).json({ review: null, comments: [] })

  const { data: comments } = await supabase
    .from('brief_review_comments')
    .select('*')
    .eq('review_id', review.id)
    .order('created_at', { ascending: true })

  return res.status(200).json({ review, comments: comments || [] })
}

// ────────────────────────────────────────────────────────────────────
// Email templates — keep in this file so the entire brief-review
// surface area is one read.
// ────────────────────────────────────────────────────────────────────
function esc(s) {
  return String(s || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
}

function renderInviteHtml({ designerName, clientName, message, reviewUrl, logo, primary }) {
  const greet = clientName ? `Hi ${esc(clientName.split(/\s+/)[0])},` : 'Hi,'
  const msgHtml = message
    ? `<div style="margin: 18px 0; padding: 14px 16px; background: #F9FAFB; border-left: 3px solid ${esc(primary)}; border-radius: 6px; font-size: 14px; line-height: 1.55; color: #374151;">${esc(message).replace(/\n/g, '<br />')}</div>`
    : ''

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Brief ready for your review</title>
</head>
<body style="margin:0;padding:0;background:#F5F5F7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#111827;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F5F5F7;padding:32px 16px;">
    <tr>
      <td align="center">
        <table cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px;background:#FFFFFF;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.04);">
          ${logo ? `
          <tr>
            <td align="center" style="padding:30px 30px 8px;">
              <img src="${esc(logo)}" alt="${esc(designerName)}" style="max-height:48px;max-width:200px;display:block;" />
            </td>
          </tr>` : ''}
          <tr>
            <td style="padding:${logo ? '12px' : '36px'} 36px 4px;">
              <p style="margin:0 0 12px;font-size:16px;line-height:1.55;">${greet}</p>
              <p style="margin:0 0 12px;font-size:14px;line-height:1.6;color:#374151;">
                ${esc(designerName)} has prepared a project brief and would like your review before they start design work.
              </p>
              <p style="margin:0;font-size:14px;line-height:1.6;color:#374151;">
                Take a few minutes to read through, add any comments, and approve or request changes. It will help make sure the design heads in the right direction.
              </p>
              ${msgHtml}
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:18px 36px 8px;">
              <a href="${esc(reviewUrl)}" style="display:inline-block;background:${esc(primary)};color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:10px;font-weight:700;font-size:15px;">
                Review the brief
              </a>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:6px 36px 28px;">
              <p style="margin:0;font-size:12px;color:#6B7280;">Takes about 5 minutes. Mobile friendly.</p>
            </td>
          </tr>
          <tr>
            <td style="padding:18px 36px 24px;border-top:1px solid #EEEEF0;">
              <p style="margin:0 0 6px;font-size:11px;color:#9CA3AF;line-height:1.5;">
                Sent on behalf of <strong>${esc(designerName)}</strong>. If you weren't expecting this, you can safely ignore the email.
              </p>
              <p style="margin:0;font-size:10px;color:#B0B0B5;line-height:1.5;">
                Powered by DesignBrief.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

function renderInviteText({ designerName, clientName, message, reviewUrl }) {
  const greet = clientName ? `Hi ${clientName.split(/\s+/)[0]},` : 'Hi,'
  return [
    greet,
    '',
    `${designerName} has prepared a project brief and would like your review before they start design work.`,
    '',
    'Read through, add any comments, and approve or request changes.',
    '',
    message ? `Message from ${designerName}:\n${message}\n` : '',
    `Review the brief: ${reviewUrl}`,
    '',
    `Sent on behalf of ${designerName}. Powered by DesignBrief.`,
  ].filter(Boolean).join('\n')
}
