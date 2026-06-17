// ────────────────────────────────────────────────────────────────────
// /api/send-intake-email — sends a branded intake form invitation
// email to one or more recipients via Resend.
//
// Body (POST):
//   {
//     form_id:        string (required)
//     recipients:     string[] (required, comma-separated → array)
//     subject:        string (required)
//     body:           string (required) — plain-text body the designer
//                                          wrote; embedded inside the
//                                          branded HTML template.
//   }
//
// The email pulls branding (logo, primary colour, welcome message,
// completion-time estimate) from the form row so the message looks
// like it came from the designer's studio, not from DesignBrief AI.
// ────────────────────────────────────────────────────────────────────

import { Resend } from 'resend'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  { auth: { persistSession: false } }
)
const resend = new Resend(process.env.RESEND_API_KEY)

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
}

export default async function handler(req, res) {
  setCors(res)
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  // ── Auth ─────────────────────────────────────────────────────────
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'unauthorised' })
  }
  const { data: { user }, error: userErr } = await supabase.auth.getUser(authHeader.slice(7))
  if (userErr || !user) return res.status(401).json({ error: 'invalid_session' })

  // ── Validate body ────────────────────────────────────────────────
  // Two modes:
  //   mode='invite' (default) — designer-composed invite email.
  //                             Requires recipients, subject, body.
  //   mode='brief-ready'      — auto-composed "your brief is ready"
  //                             notification. recipients optional
  //                             (falls back to the freshest
  //                             submission's client_email); subject
  //                             + body auto-generated from the form
  //                             + recipient business name.
  const { form_id, recipients, subject, body, mode = 'invite', submission_id } = req.body || {}
  if (!form_id) return res.status(400).json({ error: 'form_id required' })
  if (mode === 'invite' && (!Array.isArray(recipients) || !recipients.length || !subject || !body)) {
    return res.status(400).json({ error: 'recipients[], subject, body required for invite mode' })
  }

  // ── Verify the form belongs to the caller ────────────────────────
  const { data: form, error: formErr } = await supabase
    .from('intake_forms')
    .select('*')
    .eq('id', form_id)
    .maybeSingle()
  if (formErr || !form) return res.status(404).json({ error: 'form_not_found' })
  if (form.user_id !== user.id) return res.status(403).json({ error: 'forbidden' })

  // ── Resolve designer display name ────────────────────────────────
  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, full_name')
    .eq('id', user.id)
    .maybeSingle()
  const designerName =
    profile?.display_name || profile?.full_name || user.email || 'A designer'

  // ── Compose URL + branding ───────────────────────────────────────
  const appUrl =
    process.env.VITE_APP_URL ||
    req.headers.origin ||
    'https://designbrief.ai'
  const formUrl = `${appUrl.replace(/\/$/, '')}/intake/${form_id}`

  const branding = form.branding || {}
  const primary = branding.primary_color || '#8B5CF6'
  const logo = branding.logo_url || null

  // ── Estimated completion time from the question count ───────────
  const required = Array.isArray(form.questions)
    ? form.questions.filter(q => q?.required).length
    : 0
  const estMinutes = Math.max(1, Math.round((required * 45) / 60))

  // ── Mode-specific composition ────────────────────────────────────
  let finalRecipients = recipients
  let finalSubject = subject
  let finalBody = body

  if (mode === 'brief-ready') {
    // Look up the submission we're announcing. Either the supplied
    // submission_id or the freshest submission on the form.
    let subQ = supabase
      .from('intake_submissions')
      .select('client_email, client_name, business_name')
      .eq('intake_form_id', form_id)
      .order('submitted_at', { ascending: false })
      .limit(1)
    if (submission_id) subQ = subQ.eq('id', submission_id)
    const { data: subRows } = await subQ
    const sub = subRows?.[0]
    const clientEmail = (Array.isArray(recipients) && recipients[0]) || sub?.client_email || form.client_email
    if (!clientEmail) {
      return res.status(400).json({
        error: 'no_recipient',
        message: 'No client email on file. Add one in the form settings or pass recipients[].',
      })
    }
    const clientFirst = (sub?.client_name || form.settings?.recipient?.client_name || '').trim().split(/\s+/)[0] || 'there'
    const business    = (sub?.business_name || form.settings?.recipient?.business_name || '').trim()
    finalRecipients = [clientEmail]
    finalSubject = business
      ? `Your brief for ${business} is ready`
      : 'Your brief is ready'
    finalBody = [
      `Hi ${clientFirst},`,
      '',
      `${designerName} has finished the design brief${business ? ` for ${business}` : ''}.`,
      '',
      "We'll be in touch shortly with next steps on the design phase. In the meantime, if anything in the brief needs adjusting just reply to this email and let us know.",
      '',
      'Thanks for the great inputs.',
    ].join('\n')
  }

  const html = renderHtml({
    designerName,
    body: finalBody,
    formUrl,
    primary,
    logo,
    estMinutes,
    mode,
  })
  const text = renderText({ designerName, body: finalBody, formUrl, estMinutes, mode })

  // ── Send ─────────────────────────────────────────────────────────
  try {
    const { error: sendErr } = await resend.emails.send({
      from: 'DesignBrief AI <onboarding@resend.dev>',
      // Resend requires a verified domain to send on the designer's
      // behalf; for now we use the shared DesignBrief sender and let
      // Resend handle the reply-to so client replies go to the
      // designer's email.
      reply_to: profile?.email || user.email || undefined,
      to: finalRecipients,
      subject: finalSubject,
      html,
      text,
    })
    if (sendErr) throw sendErr
    return res.status(200).json({ ok: true, sent: finalRecipients.length })
  } catch (e) {
    console.error('[send-intake-email] failed', e)
    return res.status(500).json({ error: 'send_failed', message: e?.message || String(e) })
  }
}

// ────────────────────────────────────────────────────────────────────
// Templates
// ────────────────────────────────────────────────────────────────────
function renderHtml({ designerName, body, formUrl, primary, logo, estMinutes, mode = 'invite' }) {
  const esc = (s) => String(s || '').replace(/[&<>"]/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;',
  }[c]))
  const bodyHtml = esc(body)
    .split(/\n{2,}/)
    .map(p => `<p style="margin:0 0 14px;line-height:1.6;">${p.replace(/\n/g, '<br />')}</p>`)
    .join('')

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Project questionnaire</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#111827;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f5f5f7;padding:32px 16px;">
    <tr>
      <td align="center">
        <table cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.04);">
          ${logo ? `
          <tr>
            <td align="center" style="padding:30px 30px 8px;">
              <img src="${esc(logo)}" alt="${esc(designerName)}" style="max-height:48px;max-width:200px;display:block;" />
            </td>
          </tr>` : ''}
          <tr>
            <td style="padding:${logo ? '12px' : '36px'} 36px 4px;">
              ${bodyHtml}
            </td>
          </tr>
          ${mode === 'brief-ready' ? '' : `
          <tr>
            <td align="center" style="padding:18px 36px 6px;">
              <a href="${esc(formUrl)}" style="display:inline-block;background:${esc(primary)};color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:10px;font-weight:700;font-size:15px;">
                Start the questionnaire
              </a>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:4px 36px 28px;">
              <p style="margin:0;font-size:12px;color:#6b7280;">Takes about ${estMinutes} ${estMinutes === 1 ? 'minute' : 'minutes'}. Mobile friendly.</p>
            </td>
          </tr>`}
          ${mode === 'brief-ready' ? `
          <tr><td style="padding:8px 36px 24px;"></td></tr>` : ''}
          <tr>
            <td style="padding:18px 36px 30px;border-top:1px solid #eeeef0;">
              <p style="margin:0;font-size:11px;color:#9ca3af;line-height:1.5;">
                Sent on behalf of <strong>${esc(designerName)}</strong>. If you weren't expecting this, you can safely ignore it.
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

function renderText({ designerName, body, formUrl, estMinutes, mode = 'invite' }) {
  if (mode === 'brief-ready') {
    return [body, '', `Sent on behalf of ${designerName}.`].join('\n')
  }
  return [
    body,
    '',
    `Open the questionnaire: ${formUrl}`,
    `Takes about ${estMinutes} ${estMinutes === 1 ? 'minute' : 'minutes'}.`,
    '',
    `Sent on behalf of ${designerName}.`,
  ].join('\n')
}
