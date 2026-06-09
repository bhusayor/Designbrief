// ────────────────────────────────────────────────────────────────────
// IntakeDelivery — Phase 2 of the Client Intake Form rebuild.
//
// Renders after a form is published. Three delivery methods + a
// live status panel:
//
//   1. Copy link  — readonly URL + Copy button with confirmation.
//   2. Send email — composer (recipients, subject, body) → POSTs to
//                   /api/send-intake-email which formats a branded
//                   email and sends via Resend.
//   3. QR code    — generated client-side via the qrcode library;
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
  ArrowLeftIcon,
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
  const { showToast, navigate } = useContext(AppContext)
  const formUrl = `${window.location.origin}/intake/${form.id}`
  const [submissions, setSubmissions] = useState([])
  const [loadingSubs, setLoadingSubs] = useState(true)
  const [counts, setCounts] = useState({ opens: 0, submissions: 0 })

  // ── Load submissions + counts ───────────────────────────────────
  useEffect(() => {
    if (!form?.id) return
    let cancelled = false
    ;(async () => {
      try {
        const [{ data: subs, error: subErr }, { data: row }] = await Promise.all([
          supabase
            .from('intake_submissions')
            .select('*')
            .eq('intake_form_id', form.id)
            .order('submitted_at', { ascending: false }),
          supabase
            .from('intake_forms')
            .select('open_count, submission_count')
            .eq('id', form.id)
            .maybeSingle(),
        ])
        if (cancelled) return
        if (subErr) console.warn('[intake-delivery] subs load', subErr)
        setSubmissions(subs || [])
        setCounts({
          opens: row?.open_count || 0,
          submissions: row?.submission_count || (subs?.length || 0),
        })
      } catch (e) {
        console.warn('[intake-delivery] load failed', e)
      } finally {
        if (!cancelled) setLoadingSubs(false)
      }
    })()
    return () => { cancelled = true }
  }, [form?.id])

  return (
    <div className="id-root">
      <Styles />

      <header className="id-topbar">
        <button onClick={() => navigate?.('dashboard')} className="id-back" aria-label="Back to dashboard">
          <ArrowLeftIcon style={{ width: 16, height: 16 }} />
          <span>Dashboard</span>
        </button>
        <div className="id-title">
          <span className="id-eyebrow">Client intake form</span>
          <span className="id-name">{form.project_name || 'Untitled form'}</span>
        </div>
        <button onClick={onEdit} className="id-btn id-btn-quiet">
          <PencilSquareIcon style={{ width: 14, height: 14 }} /> Edit form
        </button>
      </header>

      <div className="id-wrap">
        <div className="id-grid">
          <CopyLinkTile url={formUrl} showToast={showToast} />
          <EmailTile form={form} designerName={designerName} showToast={showToast} />
          <QrTile url={formUrl} formName={form.project_name} />
        </div>

        <StatusPanel
          form={form}
          counts={counts}
          submissions={submissions}
          loading={loadingSubs}
          showToast={showToast}
        />
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────
// Method 1: Copy link
// ────────────────────────────────────────────────────────────────────
function CopyLinkTile({ url, showToast }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      showToast?.('Copy failed. URL is in the field — select and copy manually.', 'error')
    }
  }
  return (
    <section className="id-tile">
      <div className="id-tile-head">
        <span className="id-tile-icon"><LinkIcon style={{ width: 16, height: 16 }} /></span>
        <h3>Copy link</h3>
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
  const [to, setTo] = useState('')
  const [subject, setSubject] = useState(
    `Your project questionnaire from ${designerName || 'your designer'}`
  )
  const welcome = form?.branding?.welcome_message || ''
  const est = estimatedMinutes(form?.questions)
  const [bodyText, setBodyText] = useState(() =>
`Hi,

${welcome || 'Thanks for the call.'} I put together a short questionnaire to capture the shape of the project before we start.

It takes about ${est} ${est === 1 ? 'minute' : 'minutes'}. You can save and come back later if you need to.

Tap the button in this email when you are ready. No login required.

Looking forward to it.`
  )
  const [sending, setSending] = useState(false)

  async function send() {
    if (sending) return
    const recipients = to.split(/[,\s]+/).map(s => s.trim()).filter(Boolean)
    if (!recipients.length) {
      showToast?.('Add at least one recipient email.', 'error')
      return
    }
    if (!subject.trim()) { showToast?.('Subject is required.', 'error'); return }
    if (!bodyText.trim()) { showToast?.('Message body is required.', 'error'); return }
    if (recipients.some(r => !/^.+@.+\..+$/.test(r))) {
      showToast?.('One of the email addresses looks malformed.', 'error')
      return
    }
    setSending(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/send-intake-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (session?.access_token || '') },
        body: JSON.stringify({ form_id: form.id, recipients, subject, body: bodyText }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.message || j.error || `HTTP ${res.status}`)
      showToast?.(`Sent to ${recipients.length} recipient${recipients.length === 1 ? '' : 's'}.`, 'success')
      setTo('')
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
      <p className="id-tile-sub">Branded email with your logo and primary colour. Recipients open the form with one tap.</p>

      <label className="id-field">
        <span className="id-label">To</span>
        <input
          value={to}
          onChange={e => setTo(e.target.value)}
          placeholder="client@company.com, second@company.com"
          className="id-input"
        />
        <span className="id-help">Comma-separated for multiple recipients.</span>
      </label>

      <label className="id-field">
        <span className="id-label">Subject</span>
        <input value={subject} onChange={e => setSubject(e.target.value)} className="id-input" />
      </label>

      <label className="id-field">
        <span className="id-label">Message</span>
        <textarea value={bodyText} onChange={e => setBodyText(e.target.value)} rows={8} className="id-textarea" />
      </label>

      <button onClick={send} disabled={sending} className="id-btn id-btn-primary id-btn-block">
        {sending ? 'Sending…' : <><PaperAirplaneIcon style={{ width: 14, height: 14 }} /> Send</>}
      </button>
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
function StatusPanel({ form, counts, submissions, loading, showToast }) {
  const { navigate, setActiveProjectBriefResult, setActiveProjectScoring } = useContext(AppContext)
  const isExpired = form?.expires_at && new Date(form.expires_at).getTime() < Date.now()
  const status = isExpired ? 'expired' : (form?.status || 'draft')

  function openBrief(sub) {
    const r = sub.translated_result
    if (!r) {
      showToast?.('This submission has not been translated yet. Phase 4 wires the pipeline.', 'success')
      return
    }
    setActiveProjectBriefResult?.(r)
    setActiveProjectScoring?.(sub.scoring || null)
    navigate?.('dashboard')
  }

  return (
    <section className="id-status">
      <div className="id-status-head">
        <h3>Form status</h3>
        <span className={`id-pill id-pill-${status}`}>{capitalise(status)}</span>
      </div>

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
            : '—'}</span>
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
  const v = String(s || 'pending')
  if (v === 'completed') return 'Ready'
  if (v === 'processing') return 'Translating'
  if (v === 'pending') return 'Pending'
  return capitalise(v)
}
function prettyDate(iso) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    })
  } catch { return '—' }
}

// ────────────────────────────────────────────────────────────────────
// Styles
// ────────────────────────────────────────────────────────────────────
function Styles() {
  return (
    <style>{`
      .id-root { font-family: 'Urbanist', sans-serif; background: var(--color-bg); color: var(--color-text); min-height: 100dvh; display: flex; flex-direction: column; }
      .id-topbar { display: flex; align-items: center; gap: 14px; padding: 12px 22px; border-bottom: 1px solid var(--color-border); background: var(--color-bg); flex-shrink: 0; }
      .id-back { display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; border-radius: 9px; background: transparent; border: 1px solid var(--color-border); color: var(--color-text-soft); cursor: pointer; font: 600 12px 'Urbanist', sans-serif; }
      .id-title { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; }
      .id-eyebrow { font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--color-text-muted); font-weight: 700; }
      .id-name { font-size: 15px; font-weight: 800; color: var(--color-text); }

      .id-wrap { padding: 26px 24px 80px; max-width: 1280px; margin: 0 auto; width: 100%; box-sizing: border-box; }
      .id-grid { display: grid; grid-template-columns: 1fr 1.6fr 1fr; gap: 16px; align-items: stretch; }

      .id-tile { background: var(--color-card); border: 1px solid var(--color-border); border-radius: 14px; padding: 18px 18px 16px; display: flex; flex-direction: column; gap: 10px; }
      .id-tile-head { display: flex; align-items: center; gap: 8px; }
      .id-tile-head h3 { font: 800 14px 'Urbanist', sans-serif; margin: 0; }
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

      .id-qr-frame { background: white; border: 1px solid var(--color-border); border-radius: 10px; padding: 12px; display: flex; align-items: center; justify-content: center; min-height: 200px; }
      .id-qr-loading { font-size: 12px; color: #9ca3af; }
      .id-qr-actions { display: flex; gap: 8px; }

      .id-status { background: var(--color-card); border: 1px solid var(--color-border); border-radius: 14px; padding: 18px; margin-top: 18px; }
      .id-status-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
      .id-status-head h3 { margin: 0; font: 800 14px 'Urbanist', sans-serif; }
      .id-pill { font-size: 10px; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase; padding: 3px 10px; border-radius: 100px; background: var(--color-surface); color: var(--color-text-soft); border: 1px solid var(--color-border); }
      .id-pill-active { background: rgba(16,185,129,0.12); color: #047857; border-color: rgba(16,185,129,0.35); }
      .id-pill-expired { background: rgba(239,68,68,0.10); color: #b91c1c; border-color: rgba(239,68,68,0.35); }
      .id-pill-draft   { background: rgba(245,158,11,0.10); color: #b45309; border-color: rgba(245,158,11,0.30); }
      .id-pill-completed { background: rgba(16,185,129,0.12); color: #047857; border-color: rgba(16,185,129,0.35); }
      .id-pill-processing { background: rgba(139,92,246,0.12); color: var(--color-accent); border-color: rgba(139,92,246,0.35); }
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
        .id-back span { display: none; }
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
