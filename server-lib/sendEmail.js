// ────────────────────────────────────────────────────────────────────
// sendEmail, direct POST to Resend's HTTP API.
//
// Replaces the previous Resend SDK import (`import { Resend } from 'resend'`)
// which kept blowing up on Render + Vercel during cold starts with
// ERR_MODULE_NOT_FOUND on resend/dist/index.mjs. The SDK adds zero
// value over a single fetch, Resend's send-email endpoint is one
// POST, so we cut it out and avoid the entire module resolution
// circus.
//
// Same shape as Resend's SDK so the call sites stay readable:
//   await sendEmail({
//     from: 'DesignBrief AI <onboarding@resend.dev>',
//     to: ['client@example.com'],
//     subject: 'Hello',
//     html: '<p>Hi</p>',
//     text: 'Hi',
//     reply_to: 'designer@example.com',
//   })
//
// Returns { data, error } where error is null on success, or
// { message, statusCode } when Resend rejected the request. Throws
// only on network failures.
// ────────────────────────────────────────────────────────────────────

const RESEND_ENDPOINT = 'https://api.resend.com/emails'

export async function sendEmail(payload) {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    return { data: null, error: { message: 'RESEND_API_KEY is not set', statusCode: 0 } }
  }
  // Normalise to[], Resend accepts string or array, we always
  // send an array so the caller doesn't have to think about it.
  // headers (List-Unsubscribe etc.) are passed straight through;
  // Resend forwards them verbatim into the outbound message.
  const body = {
    ...payload,
    to: Array.isArray(payload.to) ? payload.to : [payload.to],
  }
  let res
  try {
    res = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
  } catch (e) {
    return { data: null, error: { message: e?.message || 'Network error', statusCode: 0 } }
  }
  let json = null
  try { json = await res.json() } catch {}
  if (!res.ok) {
    return {
      data: null,
      error: {
        message: json?.message || `Resend ${res.status}`,
        statusCode: res.status,
        name: json?.name,
      },
    }
  }
  return { data: json, error: null }
}
