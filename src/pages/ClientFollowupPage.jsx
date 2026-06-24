// ────────────────────────────────────────────────────────────────────
// ClientFollowupPage, Phase 6 of the Client Intake Form rebuild.
//
// Public route at /followup/:token. Renders one question + a single
// long-text input. Submits via the supabase RPC submit_followup_anon
// which refuses if the parent brief has been approved (locked) per
// spec. After successful submit, fires a fire-and-forget call to
// /api/intake-followup with action='notify-response' so the
// designer gets an email immediately.
//
// Five render branches:
//   loading       , initial load
//   not-found     , token didn't match anything
//   already-done  , followup already answered
//   brief-locked  , parent brief has been approved; spec mandates
//                    we show a clear "contact your designer" message
//   ready         , show the question + input + submit
//   submitted     , show a branded thank-you screen
// ────────────────────────────────────────────────────────────────────

import { useContext, useEffect, useState } from 'react'
import AppContext from '../context/AppContext'
import { ArrowRightIcon, CheckIcon } from '@heroicons/react/24/outline'
// Reuse the canonical app client instead of spawning a second one.
// Multiple createClient calls compete on auth-state storage and
// can hang unrelated Supabase requests on the Dashboard.
import { supabase } from '../lib/supabase'

export default function ClientFollowupPage() {
  const { activeFollowupToken } = useContext(AppContext)
  const [state, setState] = useState({ status: 'loading' })

  useEffect(() => {
    if (!activeFollowupToken) {
      setState({ status: 'not-found' })
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const { data, error } = await supabase.rpc('load_followup_public', { p_token: activeFollowupToken })
        if (cancelled) return
        if (error) throw error
        const row = Array.isArray(data) ? data[0] : data
        if (!row) {
          setState({ status: 'not-found' })
          return
        }
        if (row.status === 'answered') {
          setState({ status: 'already-done', row })
          return
        }
        if (row.brief_locked) {
          setState({ status: 'brief-locked', row })
          return
        }
        setState({ status: 'ready', row })
      } catch (e) {
        if (cancelled) return
        console.error('[followup] load failed', e)
        setState({ status: 'error', message: e?.message || 'Could not load the question.' })
      }
    })()
    return () => { cancelled = true }
  }, [activeFollowupToken])

  if (state.status === 'loading') return <Screen branding={null}><Spinner /></Screen>
  if (state.status === 'not-found') return <Screen branding={null} title="Link not found" body="This follow-up link doesn't match anything. Double-check with the person who sent it." />
  if (state.status === 'already-done')
    return <Screen branding={state.row?.branding} title="Already answered" body="This question has already been answered. Thanks." />
  if (state.status === 'brief-locked')
    return <Screen branding={state.row?.branding} title="Brief is locked" body="Your designer has already approved this brief. Please reach out to them directly if there's anything to update." />
  if (state.status === 'error')
    return <Screen branding={null} title="Something went wrong" body={state.message} />

  return <AnswerView row={state.row} />
}

// ────────────────────────────────────────────────────────────────────
// Answer view
// ────────────────────────────────────────────────────────────────────
function AnswerView({ row }) {
  const [answer, setAnswer] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [done, setDone] = useState(false)

  async function submit() {
    if (submitting) return
    const trimmed = answer.trim()
    if (trimmed.length < 3) {
      setError("Please write a real answer (at least a few words).")
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const { error: rpcErr } = await supabase.rpc('submit_followup_anon', {
        p_token: row.token,
        p_answer: trimmed,
      })
      if (rpcErr) {
        if (rpcErr.message?.toLowerCase().includes('brief_locked')) {
          setError('This brief has just been locked by your designer. Please contact them directly.')
          return
        }
        throw rpcErr
      }

      // Fire-and-forget designer notification. We don't wait so the
      // client sees their thank-you screen immediately.
      const apiUrl = (import.meta.env.VITE_API_URL || '') + '/api/intake-followup'
      fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'notify-response', token: row.token }),
      }).catch(e => console.warn('[followup] notify failed', e?.message))

      setDone(true)
    } catch (e) {
      console.error('[followup] submit failed', e)
      setError(e?.message || 'Could not submit. Try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (done) {
    return <Screen branding={row?.branding} title="Got it" body="Thanks. Your designer is notified and will fold this into the brief." />
  }

  const branding = row?.branding || {}
  return (
    <div className="cf-root" style={{ ['--accent']: branding.primary_color || '#8B5CF6' }}>
      <Styles />
      <div className="cf-card">
        {branding.logo_url && <img src={branding.logo_url} alt="" className="cf-logo" />}
        <span className="cf-eyebrow">Quick question</span>
        <h1 className="cf-question">{row.question_text}</h1>
        {row.context_text && <p className="cf-context">{row.context_text}</p>}

        <label className="cf-field">
          <textarea
            className="cf-textarea"
            rows={6}
            placeholder="Type your answer…"
            value={answer}
            onChange={e => setAnswer(e.target.value)}
            disabled={submitting}
          />
        </label>

        {error && <div className="cf-err">{error}</div>}

        <button onClick={submit} disabled={submitting || answer.trim().length < 3} className="cf-submit">
          {submitting ? 'Sending…' : <>Send answer <ArrowRightIcon style={{ width: 14, height: 14 }} /></>}
        </button>

        <p className="cf-footer">No login. No tracking. Just your answer.</p>
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────
// Screens for non-ready states
// ────────────────────────────────────────────────────────────────────
function Screen({ branding, title, body, children }) {
  const b = branding || {}
  return (
    <div className="cf-root" style={{ ['--accent']: b.primary_color || '#8B5CF6' }}>
      <Styles />
      <div className="cf-card">
        {b.logo_url && <img src={b.logo_url} alt="" className="cf-logo" />}
        {title && (
          <>
            <div className="cf-done-check" aria-hidden>
              {title === 'Got it' ? <CheckIcon style={{ width: 24, height: 24 }} /> : null}
            </div>
            <h1 className="cf-h1">{title}</h1>
          </>
        )}
        {body && <p className="cf-body">{body}</p>}
        {children}
      </div>
    </div>
  )
}

function Spinner() {
  return <div className="cf-spinner" />
}

// ────────────────────────────────────────────────────────────────────
// Styles
// ────────────────────────────────────────────────────────────────────
function Styles() {
  return (
    <style>{`
      .cf-root { --accent: #8B5CF6; min-height: 100dvh; background: var(--color-bg); color: var(--color-text); font-family: 'Urbanist', -apple-system, sans-serif; display: flex; align-items: center; justify-content: center; padding: 24px; box-sizing: border-box; }
      .cf-card { width: 100%; max-width: 540px; background: var(--color-card); border: 1px solid var(--color-border); border-radius: 16px; padding: 32px 28px; display: flex; flex-direction: column; gap: 14px; box-shadow: 0 12px 40px rgba(0,0,0,0.06); }
      .cf-logo { max-height: 44px; max-width: 200px; margin-bottom: 6px; }
      .cf-eyebrow { font-size: 10px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: var(--color-text-muted); }
      .cf-question { font: 800 24px 'Urbanist', sans-serif; letter-spacing: -0.02em; margin: 0; line-height: 1.25; color: var(--color-text); }
      .cf-context { font: 500 14px 'Urbanist', sans-serif; color: var(--color-text-soft); margin: 0; line-height: 1.55; padding: 12px 14px; background: var(--color-surface); border-radius: 10px; }
      .cf-field { display: flex; }
      .cf-textarea { width: 100%; padding: 14px 16px; background: var(--color-surface); border: 1.5px solid var(--color-border); border-radius: 12px; font: 500 15px 'Urbanist', sans-serif; color: var(--color-text); outline: none; resize: vertical; min-height: 140px; line-height: 1.55; box-sizing: border-box; transition: border-color 0.15s, background 0.15s; }
      .cf-textarea:focus { border-color: var(--accent); background: var(--color-bg); }
      .cf-err { padding: 10px 14px; background: rgba(239,68,68,0.08); border: 1px solid rgba(239,68,68,0.30); border-radius: 9px; font-size: 13px; color: #b91c1c; }
      .cf-submit { display: inline-flex; align-items: center; justify-content: center; gap: 8px; padding: 14px 22px; background: var(--accent); color: white; border: none; border-radius: 12px; font: 800 15px 'Urbanist', sans-serif; cursor: pointer; min-height: 48px; transition: opacity 0.15s, transform 0.05s; }
      .cf-submit:disabled { opacity: 0.5; cursor: not-allowed; }
      .cf-submit:active:not(:disabled) { transform: translateY(1px); }
      .cf-footer { font: 500 11px 'Urbanist', sans-serif; color: var(--color-text-muted); margin: 0; text-align: center; }

      .cf-done-check { display: inline-flex; align-items: center; justify-content: center; width: 56px; height: 56px; background: rgba(16,185,129,0.12); color: #10b981; border-radius: 50%; align-self: center; margin: 4px 0; }
      .cf-h1 { font: 800 26px 'Urbanist', sans-serif; letter-spacing: -0.02em; margin: 0; text-align: center; }
      .cf-body { font: 500 15px 'Urbanist', sans-serif; color: var(--color-text-soft); margin: 0; line-height: 1.55; text-align: center; }
      .cf-spinner { width: 32px; height: 32px; border-radius: 50%; border: 3px solid var(--color-border); border-top-color: var(--accent); animation: cf-spin 0.8s linear infinite; align-self: center; }
      @keyframes cf-spin { to { transform: rotate(360deg); } }

      @media (max-width: 600px) {
        .cf-card { padding: 24px 18px; border-radius: 12px; }
        .cf-question { font-size: 20px; }
      }
    `}</style>
  )
}
