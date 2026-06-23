// ────────────────────────────────────────────────────────────────────
// IntakeDelivery, Phase 2 of the Client Intake Form rebuild.
//
// Renders after a form is published. Three delivery methods + a
// live status panel:
//
//   1. Copy link , readonly URL + Copy button with confirmation.
//   2. Send email, composer (recipients, subject, body) → POSTs to
//                   /api/send-intake-email which formats a branded
//                   email and sends via Resend.
//   3. QR code   , generated client-side via the qrcode library;
//                   downloadable as PNG and SVG.
//
// Status panel:
//   - Form status (Draft / Active / Expired) pill.
//   - Opens count + submission count.
//   - Submission list with email + timestamp + View Brief button.
// ────────────────────────────────────────────────────────────────────

import { useContext, useEffect, useMemo, useRef, useState } from 'react'
import AppContext from '../../context/AppContext'
import { supabase } from '../../lib/supabase'
import { estimatedMinutes } from '../../lib/intakeQuestionSets'
import {
  ArrowDownTrayIcon,
  CheckIcon,
  ClipboardDocumentIcon,
  EnvelopeIcon,
  EyeIcon,
  LinkIcon,
  PaperAirplaneIcon,
  PencilSquareIcon,
  QrCodeIcon,
} from '@heroicons/react/24/outline'

export default function IntakeDelivery({ form, onEdit, designerName }) {
  const { showToast } = useContext(AppContext)
  const formUrl = `${window.location.origin}/intake/${form.id}`
  // The submission/open counts + submissions list state used to
  // power the now-removed StatusPanel. Dropped entirely so this
  // view no longer pings Supabase on mount just to show numbers
  // the Project Library already surfaces.

  return (
    <div className="id-root">
      <Styles />

      {/* Topbar, Dashboard back button removed (designers reach
          the dashboard via the sidebar; this view's only forward
          path is Edit form or sharing the link). Title falls back
          to the recipient's business name + project-type label if
          project_name didn't get persisted (older drafts), so the
          delivery view never reads "Untitled form" once the
          designer has filled in Page 0. */}
      <header className="id-topbar">
        <div className="id-title">
          <span className="id-eyebrow">Client intake form</span>
          <span className="id-name">{resolveFormTitle(form)}</span>
        </div>
        <button onClick={onEdit} className="id-btn id-btn-quiet">
          <PencilSquareIcon style={{ width: 14, height: 14 }} /> Edit form
        </button>
      </header>

      <div className="id-wrap">
        <div className="id-grid">
          <CopyLinkTile url={formUrl} showToast={showToast} expiresAt={form.expires_at} />
          <EmailTile form={form} designerName={designerName} showToast={showToast} />
          <QrTile url={formUrl} formName={form.project_name} />
        </div>
        {/* StatusPanel removed, the Link opens / Submissions /
            Expires stats + submissions list lived here. Designers
            who want submission state read it from the Project
            Library card now, which surfaces the same pipeline
            stages with column-bucketed cards. */}
      </div>
    </div>
  )
}

// Resolve the form's display title with sensible fallbacks. The
// builder writes a composed "<Business> - <Type label>" into
// form.project_name on save/publish, but older drafts (or rows
// saved before the project_name column existed) may have it
// missing. Fall through to the recipient's business name + type,
// then the type label alone, before the generic "Untitled form".
function resolveFormTitle(form) {
  if (form?.project_name && String(form.project_name).trim()) {
    return form.project_name
  }
  const business = String(form?.settings?.recipient?.business_name || '').trim()
  const typeLabel = labelForType(form?.project_type)
  if (business && typeLabel) return `${business} - ${typeLabel}`
  if (business) return business
  if (typeLabel) return typeLabel
  return 'Client intake form'
}

function labelForType(id) {
  const m = {
    website:   'Website or landing page',
    mobile:    'Mobile app or SaaS product',
    brand:     'Brand identity',
    ecommerce: 'E-commerce',
    redesign:  'Redesign of existing product',
    custom:    'Custom',
  }
  return m[id] || ''
}

// ────────────────────────────────────────────────────────────────────
// Method 1: Copy link
// ────────────────────────────────────────────────────────────────────
function CopyLinkTile({ url, showToast, expiresAt }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      showToast?.('Copy failed. URL is in the field, select and copy manually.', 'error')
    }
  }
  return (
    <section className="id-tile">
      <div className="id-tile-head">
        <span className="id-tile-icon"><LinkIcon style={{ width: 16, height: 16 }} /></span>
        <h3>Copy link</h3>
        {/* Expiry pill in the right edge of the header, replaces
            the deleted "Share link" section so the designer still
            sees when the URL will stop working, without a duplicate
            section taking up real estate. */}
        <DeliveryExpiryPill expiresAt={expiresAt} />
      </div>
      <p className="id-tile-sub">Share the URL anywhere. The link works on any device.</p>
      <div className="id-link-row">
        <input value={url} readOnly className="id-input id-input-mono" />
        <button onClick={copy} className={`id-btn ${copied ? 'id-btn-success' : 'id-btn-primary'}`}>
          {copied
            ? <><CheckIcon style={{ width: 14, height: 14 }} /> Copied</>
            : <><ClipboardDocumentIcon style={{ width: 14, height: 14 }} /> Copy</>}
        </button>
      </div>
    </section>
  )
}

// ────────────────────────────────────────────────────────────────────
// Method 2: Email composer
// ────────────────────────────────────────────────────────────────────
function EmailTile({ form, designerName, showToast }) {
  // Pre-fill the To field with the client_email captured on Page 0
  // (or the legacy column) so the designer doesn't have to retype
  // what they already entered while building the form.
  const presetEmail =
    form?.settings?.recipient?.client_email
    || form?.client_email
    || ''

  const [to, setTo] = useState(presetEmail)
  const [subject, setSubject] = useState(
    `Your project questionnaire from ${designerName || 'your designer'}`
  )
  const welcome = form?.branding?.welcome_message || ''
  const est = estimatedMinutes(form?.questions)

  // Compose the form URL once + include it directly in the default
  // body so it's visible inline alongside the styled CTA button.
  const formUrl = `${window.location.origin}/intake/${form?.id}`

  const [bodyText, setBodyText] = useState(() =>
`Hi,

${welcome || 'Thanks for the call.'} I put together a short questionnaire to capture the shape of the project before we start.

It takes about ${est} ${est === 1 ? 'minute' : 'minutes'}. You can save and come back later if you need to.

Open the form here: ${formUrl}

Looking forward to it.`
  )
  const [sending, setSending] = useState(false)

  async function send() {
    if (sending) return
    const recipient = to.trim()
    if (!recipient) {
      showToast?.("Add the client's email.", 'error')
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
      showToast?.('That email looks malformed.', 'error')
      return
    }
    if (!subject.trim()) { showToast?.('Subject is required.', 'error'); return }
    if (!bodyText.trim()) { showToast?.('Message body is required.', 'error'); return }

    // Always include the form URL in the body. If the designer
    // edited the default and removed it, append before sending so
    // the client can never miss the link.
    let finalBody = bodyText
    if (!finalBody.includes(formUrl)) {
      finalBody = `${finalBody.trim()}\n\nOpen the form here: ${formUrl}`
    }

    setSending(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/send-intake-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (session?.access_token || '') },
        // Pass as a single-entry array so the server's existing
        // recipients[] contract stays unchanged.
        body: JSON.stringify({ form_id: form.id, recipients: [recipient], subject, body: finalBody }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.message || j.error || `HTTP ${res.status}`)
      showToast?.(`Sent to ${recipient}.`, 'success')
    } catch (e) {
      console.error('[send email]', e)
      showToast?.(e.message || 'Could not send the email. Try again.', 'error')
    } finally {
      setSending(false)
    }
  }

  return (
    <section className="id-tile id-tile-wide">
      <div className="id-tile-head">
        <span className="id-tile-icon"><EnvelopeIcon style={{ width: 16, height: 16 }} /></span>
        <h3>Send via email</h3>
      </div>
      <p className="id-tile-sub">Branded email with your logo and primary colour. The client opens the form with one tap.</p>

      <label className="id-field">
        <span className="id-label">Client email</span>
        <input
          type="email"
          value={to}
          onChange={e => setTo(e.target.value)}
          placeholder="client@company.com"
          className="id-input"
        />
        <span className="id-help">One client per form. Multiple submissions would produce different briefs for the same project.</span>
      </label>

      <label className="id-field">
        <span className="id-label">Subject</span>
        <input value={subject} onChange={e => setSubject(e.target.value)} className="id-input" />
      </label>

      <label className="id-field">
        <span className="id-label">Message</span>
        <textarea value={bodyText} onChange={e => setBodyText(e.target.value)} rows={9} className="id-textarea" />
        <span className="id-help">The form link is included in the message + as a button. If you remove it from the text we'll add it back automatically before sending.</span>
      </label>

      <button onClick={send} disabled={sending} className="id-btn id-btn-primary id-btn-block">
        {sending ? 'Sending…' : <><PaperAirplaneIcon style={{ width: 14, height: 14 }} /> Send</>}
      </button>

      {/* Deliverability hint, emails sent through the shared
          Resend sender (onboarding@resend.dev) often land in spam.
          Verifying a custom domain in Resend (and updating
          server-lib/sendEmail.js with the verified sender) is the
          long-term fix. Until then, ask clients to whitelist the
          designer's reply-to address. */}
      <p className="id-deliverability">
        Not arriving? Ask your client to check their spam folder + add your reply-to address to their contacts. Verify a custom domain in Resend for the highest deliverability.
      </p>
    </section>
  )
}

// ────────────────────────────────────────────────────────────────────
// Method 3: QR code
// ────────────────────────────────────────────────────────────────────
function QrTile({ url, formName }) {
  const [pngUrl, setPngUrl] = useState(null)
  const [svgString, setSvgString] = useState(null)
  const [error, setError] = useState(null)
  const canvasRef = useRef(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const mod = await import('qrcode')
        const QR = mod.default || mod
        if (cancelled) return
        // PNG via canvas → dataURL
        await QR.toCanvas(canvasRef.current, url, { width: 220, margin: 1, color: { dark: '#111111', light: '#ffffff' } })
        const png = canvasRef.current.toDataURL('image/png')
        // SVG string
        const svg = await QR.toString(url, { type: 'svg', margin: 1, color: { dark: '#111111', light: '#ffffff' } })
        if (cancelled) return
        setPngUrl(png)
        setSvgString(svg)
      } catch (e) {
        console.warn('[qr] failed', e)
        if (!cancelled) setError(e?.message || 'Could not generate QR code')
      }
    })()
    return () => { cancelled = true }
  }, [url])

  function download(href, ext) {
    const a = document.createElement('a')
    a.href = href
    a.download = (formName || 'intake-form').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '.' + ext
    document.body.appendChild(a)
    a.click()
    a.remove()
  }
  function downloadSvg() {
    const blob = new Blob([svgString], { type: 'image/svg+xml' })
    const href = URL.createObjectURL(blob)
    download(href, 'svg')
    setTimeout(() => URL.revokeObjectURL(href), 1000)
  }

  return (
    <section className="id-tile">
      <div className="id-tile-head">
        <span className="id-tile-icon"><QrCodeIcon style={{ width: 16, height: 16 }} /></span>
        <h3>QR code</h3>
      </div>
      <p className="id-tile-sub">Print on a card, drop into a slide deck, or include in a PDF.</p>

      <div className="id-qr-frame">
        <canvas ref={canvasRef} style={{ display: pngUrl ? 'block' : 'none', borderRadius: 8 }} />
        {!pngUrl && !error && <span className="id-qr-loading">Generating…</span>}
        {error && <span className="id-qr-loading">{error}</span>}
      </div>

      <div className="id-qr-actions">
        <button onClick={() => download(pngUrl, 'png')} disabled={!pngUrl} className="id-btn id-btn-quiet">
          <ArrowDownTrayIcon style={{ width: 14, height: 14 }} /> PNG
        </button>
        <button onClick={downloadSvg} disabled={!svgString} className="id-btn id-btn-quiet">
          <ArrowDownTrayIcon style={{ width: 14, height: 14 }} /> SVG
        </button>
      </div>
    </section>
  )
}

// ────────────────────────────────────────────────────────────────────
// Status panel
// ────────────────────────────────────────────────────────────────────
// Expiry pill rendered inside the delivery view's "Share link"
// header. Same colour ladder as the builder topbar's pill:
//   ok     , accent text, neutral background. Plenty of time.
//   warn   , amber, within 3 days of dying.
//   expired, red, past the timestamp.
//   none   , muted, when expires_at is not set.
function DeliveryExpiryPill({ expiresAt }) {
  if (!expiresAt) {
    return <span className="id-pill id-pill-none" title="No expiry, the link never expires">No expiry</span>
  }
  const ts = new Date(expiresAt).getTime()
  const days = Math.ceil((ts - Date.now()) / 86400000)
  const dateStr = new Date(expiresAt).toLocaleDateString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
  })
  if (days <= 0) return <span className="id-pill id-pill-expired" title={`Expired ${dateStr}`}>Expired {dateStr}</span>
  if (days <= 3) return <span className="id-pill id-pill-warn" title={`Expires in ${days} day${days === 1 ? '' : 's'} (${dateStr})`}>Expires in {days}d</span>
  return <span className="id-pill id-pill-ok" title={`Expires ${dateStr}`}>Expires {dateStr}</span>
}

function StatusPanel({ form, counts, submissions, loading, showToast }) {
  const { navigate, setActiveIntakeSubmissionId } = useContext(AppContext)
  const isExpired = form?.expires_at && new Date(form.expires_at).getTime() < Date.now()
  const status = isExpired ? 'expired' : (form?.status || 'draft')

  function openBrief(sub) {
    if (!sub?.translated_result) {
      const s = String(sub?.status || 'pending')
      const pending = ['pending', 'enriching', 'translating', 'extracting_design_system', 'building_kanban', 'notifying']
      if (pending.includes(s)) {
        showToast?.('Still processing, check back in a minute.', 'success')
      } else if (s === 'failed') {
        showToast?.('Processing failed for this submission. ' + (sub.failure_message || ''), 'error')
      } else {
        showToast?.('No translated brief yet for this submission.', 'success')
      }
      return
    }
    setActiveIntakeSubmissionId?.(sub.id)
    navigate?.('intake-review')
  }

  return (
    <section className="id-status">
      {/* "Share link" header + expiry pill moved into the Copy link
          tile so that information sits next to the URL it relates
          to. This panel now starts straight at the stats grid. */}

      <div className="id-stats">
        <div className="id-stat">
          <span className="id-stat-num">{counts.opens}</span>
          <span className="id-stat-label">Link opens</span>
        </div>
        <div className="id-stat">
          <span className="id-stat-num">{counts.submissions}</span>
          <span className="id-stat-label">Submissions</span>
        </div>
        <div className="id-stat">
          <span className="id-stat-num">{form?.expires_at
            ? new Date(form.expires_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
            : '-'}</span>
          <span className="id-stat-label">Expires</span>
        </div>
      </div>

      <div className="id-subs">
        <div className="id-subs-head">Submissions</div>
        {loading
          ? <p className="id-subs-empty">Loading…</p>
          : submissions.length === 0
            ? <p className="id-subs-empty">No submissions yet. The list will populate as clients complete the form.</p>
            : (
              <ul className="id-subs-list">
                {submissions.map(s => (
                  <li key={s.id} className="id-sub-row">
                    <div className="id-sub-meta">
                      <span className="id-sub-email">{s.client_email || 'Anonymous'}</span>
                      <span className="id-sub-ts">{prettyDate(s.submitted_at || s.created_at)}</span>
                      <span className={`id-pill id-pill-${s.status || 'pending'}`} style={{ marginLeft: 8 }}>
                        {prettyStatus(s.status)}
                      </span>
                    </div>
                    <button onClick={() => openBrief(s)} className="id-btn id-btn-quiet" disabled={!s.translated_result}>
                      <EyeIcon style={{ width: 14, height: 14 }} /> View brief
                    </button>
                  </li>
                ))}
              </ul>
            )}
      </div>
    </section>
  )
}

function capitalise(s) { return String(s || '').replace(/^./, c => c.toUpperCase()) }
function prettyStatus(s) {
  // Phase 4 pipeline emits these status values in order. Older
  // submissions may carry legacy values too (translating /
  // complete / completed); keep both alive.
  const v = String(s || 'pending')
  if (v === 'complete' || v === 'completed') return 'Ready'
  if (v === 'failed') return 'Failed'
  if (v === 'pending') return 'Pending'
  if (v === 'enriching') return 'Enriching'
  if (v === 'translating') return 'Translating'
  if (v === 'extracting_design_system') return 'Building design system'
  if (v === 'building_kanban') return 'Building board'
  if (v === 'notifying') return 'Wrapping up'
  if (v === 'processing') return 'Translating'
  return capitalise(v)
}
function prettyDate(iso) {
  if (!iso) return '-'
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    })
  } catch { return '-' }
}

// ────────────────────────────────────────────────────────────────────
// Styles
// ────────────────────────────────────────────────────────────────────
function Styles() {
  return (
    <style>{`
      .id-root { font-family: 'Urbanist', sans-serif; background: var(--color-bg); color: var(--color-text); min-height: 100dvh; display: flex; flex-direction: column; }
      .id-topbar { display: flex; align-items: center; gap: 14px; padding: 12px 22px; border-bottom: 1px solid var(--color-border); background: var(--color-bg); flex-shrink: 0; }
      .id-title { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; }
      .id-eyebrow { font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--color-text-muted); font-weight: 700; }
      .id-name { font-size: 15px; font-weight: 800; color: var(--color-text); }

      .id-wrap { padding: 26px 24px 80px; max-width: 1280px; margin: 0 auto; width: 100%; box-sizing: border-box; }
      .id-grid { display: grid; grid-template-columns: 1fr 1.6fr 1fr; gap: 16px; align-items: stretch; }

      .id-tile { background: var(--color-card); border: 1px solid var(--color-border); border-radius: 14px; padding: 18px 18px 16px; display: flex; flex-direction: column; gap: 10px; }
      .id-tile-head { display: flex; align-items: center; gap: 8px; }
      .id-tile-head h3 { font: 800 14px 'Urbanist', sans-serif; margin: 0; }
      /* Push the expiry pill to the right edge of the Copy-link tile header */
      .id-tile-head > .id-pill { margin-left: auto; }
      .id-tile-icon { display: inline-flex; align-items: center; justify-content: center; width: 26px; height: 26px; background: rgba(139,92,246,0.10); color: var(--color-accent); border-radius: 7px; flex-shrink: 0; }
      .id-tile-sub { font-size: 12px; color: var(--color-text-muted); margin: 0; line-height: 1.55; }

      .id-input, .id-textarea { width: 100%; padding: 9px 12px; background: var(--color-surface); border: 1px solid var(--color-border); border-radius: 8px; outline: none; font: 500 13px 'Urbanist', sans-serif; color: var(--color-text); box-sizing: border-box; }
      .id-textarea { resize: vertical; min-height: 110px; line-height: 1.55; }
      .id-input-mono { font-family: 'JetBrains Mono', monospace; font-size: 12px; }

      .id-link-row { display: flex; gap: 8px; align-items: center; }

      .id-btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; padding: 9px 14px; background: var(--color-card); border: 1px solid var(--color-border); border-radius: 9px; font: 700 13px 'Urbanist', sans-serif; color: var(--color-text); cursor: pointer; flex-shrink: 0; }
      .id-btn:disabled { opacity: 0.5; cursor: not-allowed; }
      .id-btn-quiet { background: var(--color-surface); }
      .id-btn-primary { background: var(--color-accent); color: white; border-color: transparent; }
      .id-btn-success { background: #10b981; color: white; border-color: transparent; }
      .id-btn-block { width: 100%; padding: 11px 14px; }

      .id-field { display: flex; flex-direction: column; gap: 5px; }
      .id-label { font: 700 11px 'Urbanist', sans-serif; letter-spacing: 0.04em; text-transform: uppercase; color: var(--color-text-muted); }
      .id-help { font: 500 11px 'Urbanist', sans-serif; color: var(--color-text-muted); }
      .id-deliverability {
        font: 500 11px 'Urbanist', sans-serif;
        color: var(--color-text-muted);
        line-height: 1.55;
        margin: 12px 0 0;
        padding: 10px 12px;
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: 8px;
      }

      .id-qr-frame { background: white; border: 1px solid var(--color-border); border-radius: 10px; padding: 12px; display: flex; align-items: center; justify-content: center; min-height: 200px; }
      .id-qr-loading { font-size: 12px; color: #9ca3af; }
      .id-qr-actions { display: flex; gap: 8px; }

      .id-status { background: var(--color-card); border: 1px solid var(--color-border); border-radius: 14px; padding: 18px; margin-top: 18px; }
      .id-status-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
      .id-status-head h3 { margin: 0; font: 800 14px 'Urbanist', sans-serif; }
      .id-pill { font-size: 10px; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase; padding: 3px 10px; border-radius: 100px; background: var(--color-surface); color: var(--color-text-soft); border: 1px solid var(--color-border); }
      .id-pill-active { background: rgba(16,185,129,0.12); color: #047857; border-color: rgba(16,185,129,0.35); }
      .id-pill-ok     { background: var(--color-surface); color: var(--color-text); border-color: var(--color-border); }
      .id-pill-warn   { background: rgba(217,119,6,0.10); color: #b45309; border-color: rgba(217,119,6,0.30); }
      .id-pill-none   { background: var(--color-surface); color: var(--color-text-muted); border-color: var(--color-border); }
      .id-pill-expired { background: rgba(239,68,68,0.10); color: #b91c1c; border-color: rgba(239,68,68,0.35); }
      .id-pill-draft   { background: rgba(245,158,11,0.10); color: #b45309; border-color: rgba(245,158,11,0.30); }
      .id-pill-completed { background: rgba(16,185,129,0.12); color: #047857; border-color: rgba(16,185,129,0.35); }
      .id-pill-complete  { background: rgba(16,185,129,0.12); color: #047857; border-color: rgba(16,185,129,0.35); }
      .id-pill-processing { background: rgba(139,92,246,0.12); color: var(--color-accent); border-color: rgba(139,92,246,0.35); }
      .id-pill-enriching,
      .id-pill-translating,
      .id-pill-extracting_design_system,
      .id-pill-building_kanban,
      .id-pill-notifying { background: rgba(139,92,246,0.12); color: var(--color-accent); border-color: rgba(139,92,246,0.35); }
      .id-pill-failed   { background: rgba(239,68,68,0.10); color: #b91c1c; border-color: rgba(239,68,68,0.35); }
      .id-pill-pending { background: var(--color-surface); color: var(--color-text-soft); }

      .id-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 16px; }
      .id-stat { display: flex; flex-direction: column; gap: 2px; padding: 12px 14px; background: var(--color-surface); border-radius: 10px; border: 1px solid var(--color-border); }
      .id-stat-num { font: 800 22px 'Urbanist', sans-serif; color: var(--color-text); }
      .id-stat-label { font: 600 10px 'Urbanist', sans-serif; letter-spacing: 0.06em; text-transform: uppercase; color: var(--color-text-muted); }

      .id-subs { }
      .id-subs-head { font: 700 11px 'Urbanist', sans-serif; letter-spacing: 0.08em; text-transform: uppercase; color: var(--color-text-muted); margin-bottom: 10px; }
      .id-subs-empty { font-size: 12px; color: var(--color-text-muted); margin: 0; padding: 14px; background: var(--color-surface); border: 1px dashed var(--color-border); border-radius: 10px; }
      .id-subs-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 6px; }
      .id-sub-row { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 10px 12px; background: var(--color-surface); border: 1px solid var(--color-border); border-radius: 9px; flex-wrap: wrap; }
      .id-sub-meta { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; min-width: 0; }
      .id-sub-email { font: 600 13px 'Urbanist', sans-serif; color: var(--color-text); }
      .id-sub-ts    { font: 500 12px 'JetBrains Mono', monospace; color: var(--color-text-muted); }

      @media (max-width: 1023px) {
        .id-grid { grid-template-columns: 1fr 1fr; }
        .id-tile-wide { grid-column: 1 / -1; }
      }
      @media (max-width: 767px) {
        .id-topbar { padding: 10px 14px; }
        .id-wrap { padding: 18px 14px 80px; }
        .id-grid { grid-template-columns: 1fr; gap: 12px; }
        .id-tile { padding: 16px; }
        .id-link-row { flex-direction: column; align-items: stretch; }
        .id-link-row .id-btn { width: 100%; padding: 11px 14px; }
        .id-stats { grid-template-columns: 1fr; }
        .id-sub-row { flex-direction: column; align-items: flex-start; }
        .id-sub-row .id-btn { width: 100%; justify-content: center; }
      }
    `}</style>
  )
}
