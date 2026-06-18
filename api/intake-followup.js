// ────────────────────────────────────────────────────────────────────
// /api/intake-followup — Phase 6 of the Client Intake Form rebuild.
//
// Two actions, one endpoint (one Vercel function slot):
//
//   action: 'send'             — designer-authenticated. Inserts a
//                                row into intake_followups with a
//                                fresh token, sends a branded single-
//                                question email to the client via
//                                Resend. Returns the token so the
//                                review screen can mark the question
//                                "sent".
//   action: 'notify-response'  — no auth. Called by the public
//                                /followup/:token page right after
//                                supabase.rpc('submit_followup_anon')
//                                lands. Pulls the followup + parent
//                                form to find the designer's email,
//                                then sends a notification email.
//
// Body for 'send':
//   { action: 'send', submission_id, question_text, context_text? }
// Body for 'notify-response':
//   { action: 'notify-response', token }
// ────────────────────────────────────────────────────────────────────

import { sendEmail } from '../server-lib/sendEmail.js'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  { auth: { persistSession: false } }
)

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
}

export default async function handler(req, res) {
  setCors(res)
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const action = req.body?.action
  if (action === 'send')             return handleSend(req, res)
  if (action === 'notify-response')  return handleNotifyResponse(req, res)
  return res.status(400).json({ error: 'bad_request', message: 'unknown action' })
}

// ────────────────────────────────────────────────────────────────────
// action: 'send'
// ────────────────────────────────────────────────────────────────────
async function handleSend(req, res) {
  // Auth
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: 'unauthorised' })
  const { data: { user }, error: userErr } = await supabase.auth.getUser(authHeader.slice(7))
  if (userErr || !user) return res.status(401).json({ error: 'invalid_session' })

  const { submission_id, question_text, context_text } = req.body || {}
  if (!submission_id || !question_text) {
    return res.status(400).json({ error: 'bad_request', message: 'submission_id and question_text required' })
  }

  // Verify ownership: the submission's parent form must belong to the caller.
  const { data: sub, error: subErr } = await supabase
    .from('intake_submissions')
    .select('id, client_email, intake_form_id, approved_at')
    .eq('id', submission_id)
    .maybeSingle()
  if (subErr || !sub) return res.status(404).json({ error: 'submission_not_found' })
  if (sub.approved_at) return res.status(400).json({ error: 'brief_locked', message: 'Brief is approved; unlock it before sending follow-ups.' })

  const { data: form, error: formErr } = await supabase
    .from('intake_forms')
    .select('id, user_id, branding, project_name')
    .eq('id', sub.intake_form_id)
    .maybeSingle()
  if (formErr || !form) return res.status(404).json({ error: 'form_not_found' })
  if (form.user_id !== user.id) return res.status(403).json({ error: 'forbidden' })

  const recipient = sub.client_email
  if (!recipient) {
    return res.status(400).json({ error: 'no_client_email', message: 'This submission has no client email on file. Add one via the answers first.' })
  }

  // Designer display name + reply-to.
  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, full_name, email')
    .eq('id', user.id)
    .maybeSingle()
  const designerName = profile?.display_name || profile?.full_name || user.email?.split('@')[0] || 'Your designer'
  const designerEmail = profile?.email || user.email

  // Insert with the service-role client so we get the token back
  // even though the table has RLS turned on (the designer policy
  // would let this work for an authenticated user as well, but
  // service-role is simpler from here).
  const { data: insertRow, error: insertErr } = await supabase
    .from('intake_followups')
    .insert({
      submission_id,
      form_id: form.id,
      question_text,
      context_text: context_text || null,
      recipient_email: recipient,
      status: 'sent',
    })
    .select('token')
    .single()
  if (insertErr || !insertRow?.token) {
    console.error('[followup send] insert failed', insertErr)
    return res.status(500).json({ error: 'insert_failed', message: insertErr?.message || 'Insert failed' })
  }

  const appUrl = process.env.VITE_APP_URL || req.headers.origin || 'https://designbrief.ai'
  const responseUrl = `${appUrl.replace(/\/$/, '')}/followup/${insertRow.token}`

  const branding = form.branding || {}
  const primary = branding.primary_color || '#8B5CF6'
  const logo = branding.logo_url || null

  const html = sendTemplate({
    designerName,
    question: question_text,
    context: context_text || '',
    responseUrl,
    primary,
    logo,
  })
  const text = `${context_text ? context_text + '\n\n' : ''}Question: ${question_text}\n\nReply: ${responseUrl}\n\nSent on behalf of ${designerName}.`

  try {
    if (!process.env.RESEND_API_KEY) {
      console.warn('[followup send] RESEND_API_KEY missing; skipping email but row is saved')
    } else {
      const { error: sendErr } = await sendEmail({
        from: 'DesignBrief AI <onboarding@resend.dev>',
        reply_to: designerEmail || undefined,
        to: recipient,
        subject: `Quick question on the ${form.project_name || 'project'}`,
        html,
        text,
      })
      if (sendErr) throw sendErr
    }
    return res.status(200).json({ ok: true, token: insertRow.token, response_url: responseUrl })
  } catch (e) {
    console.error('[followup send] resend failed', e)
    // We don't roll back the row — the designer can re-send by re-using the token if needed.
    return res.status(500).json({ error: 'send_failed', token: insertRow.token, message: e?.message || 'Email send failed' })
  }
}

// ────────────────────────────────────────────────────────────────────
// action: 'notify-response'
// ────────────────────────────────────────────────────────────────────
async function handleNotifyResponse(req, res) {
  const { token } = req.body || {}
  if (!token) return res.status(400).json({ error: 'bad_request', message: 'token required' })

  // Service-role read; we deliberately ignore who is asking — this
  // endpoint just fires the designer notification email.
  const { data: row, error } = await supabase
    .from('intake_followups')
    .select('*, intake_submissions(intake_form_id)')
    .eq('token', token)
    .maybeSingle()
  if (error || !row) return res.status(404).json({ error: 'followup_not_found' })
  if (row.status !== 'answered') {
    return res.status(400).json({ error: 'not_answered_yet' })
  }

  const formId = row.form_id || row.intake_submissions?.intake_form_id
  const { data: form } = await supabase
    .from('intake_forms')
    .select('user_id, project_name, branding')
    .eq('id', formId)
    .maybeSingle()
  if (!form) return res.status(404).json({ error: 'form_not_found' })

  const { data: designerAuth } = await supabase.auth.admin.getUserById(form.user_id).catch(() => ({ data: null }))
  const designerEmail = designerAuth?.user?.email
  if (!designerEmail || !process.env.RESEND_API_KEY) {
    return res.status(200).json({ ok: true, sent: false, reason: 'no_email_or_resend' })
  }

  const appUrl = process.env.VITE_APP_URL || req.headers.origin || 'https://designbrief.ai'
  // Designer review screen needs the submission id, not the form id.
  const reviewUrl = `${appUrl.replace(/\/$/, '')}/intake/${formId}`

  const html = notifyTemplate({
    projectName: form.project_name || 'your project',
    question: row.question_text,
    answer: row.answer_text || '',
    reviewUrl,
  })

  try {
    const { error: sendErr } = await sendEmail({
      from: 'DesignBrief AI <onboarding@resend.dev>',
      to: designerEmail,
      subject: `Your client answered: ${form.project_name || 'follow-up'}`,
      html,
      text: `Q: ${row.question_text}\nA: ${row.answer_text || ''}\n\nReview: ${reviewUrl}`,
    })
    if (sendErr) throw sendErr
    return res.status(200).json({ ok: true })
  } catch (e) {
    console.error('[followup notify] failed', e)
    return res.status(500).json({ error: 'send_failed', message: e?.message })
  }
}

// ────────────────────────────────────────────────────────────────────
// HTML templates
// ────────────────────────────────────────────────────────────────────
function sendTemplate({ designerName, question, context, responseUrl, primary, logo }) {
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f5f5f7;font-family:-apple-system,sans-serif;color:#111827;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="padding:32px 16px;"><tr><td align="center">
  <table cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.04);">
    ${logo ? `<tr><td align="center" style="padding:30px 30px 6px;"><img src="${escapeHtml(logo)}" alt="${escapeHtml(designerName)}" style="max-height:42px;max-width:200px;display:block;"/></td></tr>` : ''}
    <tr><td style="padding:${logo ? '14px' : '36px'} 36px 4px;font-size:14px;line-height:1.6;color:#374151;">
      ${context ? `<p style="margin:0 0 16px;">${escapeHtml(context).replace(/\n/g, '<br />')}</p>` : ''}
      <p style="margin:0 0 6px;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#9ca3af;font-weight:700;">My question</p>
      <p style="margin:0 0 18px;font-size:18px;font-weight:800;line-height:1.4;color:#111827;">${escapeHtml(question)}</p>
    </td></tr>
    <tr><td align="center" style="padding:6px 36px 14px;">
      <a href="${escapeHtml(responseUrl)}" style="display:inline-block;background:${escapeHtml(primary)};color:#fff;text-decoration:none;padding:13px 26px;border-radius:10px;font-weight:700;font-size:14px;">Answer this question</a>
    </td></tr>
    <tr><td align="center" style="padding:0 36px 24px;"><p style="margin:0;font-size:12px;color:#6b7280;">Takes a minute. No login.</p></td></tr>
    <tr><td style="padding:18px 36px 28px;border-top:1px solid #eeeef0;font-size:11px;color:#9ca3af;line-height:1.5;">Sent on behalf of <strong>${escapeHtml(designerName)}</strong>.</td></tr>
  </table>
</td></tr></table></body></html>`
}

function notifyTemplate({ projectName, question, answer, reviewUrl }) {
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f5f5f7;font-family:-apple-system,sans-serif;color:#111827;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="padding:32px 16px;"><tr><td align="center">
  <table cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:#fff;border-radius:16px;overflow:hidden;">
    <tr><td style="padding:28px 30px 8px;">
      <p style="margin:0;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#8b8b94;font-weight:700;">Your client answered</p>
      <h1 style="font-size:20px;margin:6px 0 0;">${escapeHtml(projectName)}</h1>
    </td></tr>
    <tr><td style="padding:14px 30px;">
      <p style="margin:0 0 4px;font-size:11px;letter-spacing:0.06em;text-transform:uppercase;color:#9ca3af;font-weight:700;">Question</p>
      <p style="margin:0 0 16px;font-size:14px;line-height:1.55;color:#374151;">${escapeHtml(question)}</p>
      <p style="margin:0 0 4px;font-size:11px;letter-spacing:0.06em;text-transform:uppercase;color:#9ca3af;font-weight:700;">Answer</p>
      <p style="margin:0;font-size:15px;line-height:1.6;font-weight:600;color:#111827;">${escapeHtml(answer).replace(/\n/g, '<br />')}</p>
    </td></tr>
    <tr><td align="center" style="padding:18px 30px 26px;">
      <a href="${escapeHtml(reviewUrl)}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:12px 22px;border-radius:9px;font-weight:700;font-size:14px;">Review the brief</a>
    </td></tr>
  </table>
</td></tr></table></body></html>`
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
}
