// ────────────────────────────────────────────────────────────────────
// ClientIntakePage — Phase 3 of the Client Intake Form rebuild.
//
// Public route at /intake/:formId. Requires no authentication. Renders
// one question per screen, evaluates conditional logic in real time
// against previous answers, persists progress to localStorage so a
// returning client lands back where they left, and submits via the
// anonymous Supabase RPC (no service-role server hop needed).
//
// Three phases:
//   1. Opening    — designer logo, welcome message, estimated time,
//                   Start button.
//   2. Filling    — one-question-per-screen flow with progress bar,
//                   Back + Continue. Counter shows position over
//                   visible-questions total (skips conditional
//                   misses). All 7 question types handled inline.
//   3. Completion — designer logo, completion message, done.
//
// Responsive:
//   ≥1024 desktop  — centered single-column, max-width 640, generous
//                   spacing, Continue button below the input.
//   768-1023 tablet — same layout, reduced padding.
//   <768  mobile    — full-width single column, Continue button
//                   fixed to the bottom of the viewport, Back at
//                   top-left.
// ────────────────────────────────────────────────────────────────────

import { useContext, useEffect, useMemo, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import AppContext from '../context/AppContext'
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  ArrowUpTrayIcon,
  CheckIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'

// Standalone client — no app session is required to read public form
// rows + call the public RPCs.
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
)

// localStorage key for the in-progress draft. Keyed by form id so a
// client opening multiple share links on the same device doesn't get
// their progress crossed.
const DRAFT_KEY = (formId) => `db-intake-draft-${formId}`

export default function ClientIntakePage() {
  const { activeIntakeId } = useContext(AppContext)
  const [state, setState] = useState({ status: 'loading' })

  useEffect(() => {
    if (!activeIntakeId) {
      setState({ status: 'not-found' })
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const { data, error } = await supabase
          .from('intake_forms')
          .select('*')
          .eq('id', activeIntakeId)
          .maybeSingle()
        if (cancelled) return
        if (error) throw error
        if (!data) {
          setState({ status: 'not-found' })
          return
        }
        // Expired check — drawn on either expires_at being past OR
        // an explicit status flag the designer set.
        const expired =
          data.status === 'expired' ||
          (data.expires_at && new Date(data.expires_at).getTime() < Date.now())
        if (expired) {
          setState({ status: 'expired', form: data })
          return
        }
        // Draft / unpublished — only the designer should see them.
        if (data.status === 'draft' && !data.published_at) {
          setState({ status: 'not-published', form: data })
          return
        }
        setState({ status: 'ready', form: data })
        // Best-effort open counter; failure is silent.
        try {
          supabase.rpc('increment_intake_open', { form_id: data.id })
            .catch(() => {})
        } catch {}
      } catch (e) {
        if (cancelled) return
        console.error('[client-intake] load failed', e)
        setState({ status: 'error', message: e?.message || 'Could not load this form.' })
      }
    })()
    return () => { cancelled = true }
  }, [activeIntakeId])

  if (state.status === 'loading') return <CenteredMessage spinner>Loading…</CenteredMessage>
  if (state.status === 'not-found')
    return <BrandedScreen title="Form not found" body="The link you opened doesn't match any active form. Double-check with whoever sent it." />
  if (state.status === 'expired')
    return <BrandedScreen form={state.form} title="This link has expired" body="Reach out to your designer and they'll send a fresh one." />
  if (state.status === 'not-published')
    return <BrandedScreen form={state.form} title="Not published yet" body="Your designer hasn't finished setting this up. Try again in a bit." />
  if (state.status === 'error')
    return <BrandedScreen title="Something went wrong" body={state.message} />

  return <FormShell form={state.form} />
}

// ────────────────────────────────────────────────────────────────────
// Main form shell — opening / filling / completion
// ────────────────────────────────────────────────────────────────────
function FormShell({ form }) {
  // Read whatever shape the form uses: new (questions[]) or legacy
  // (sections[] flattened into a question array). Builder writes
  // questions[]; legacy reads stay supported so old forms still work.
  const allQuestions = useMemo(() => {
    if (Array.isArray(form.questions) && form.questions.length) return form.questions
    return legacyFlatten(form.sections)
  }, [form.questions, form.sections])

  const accent = form.branding?.primary_color || '#8B5CF6'
  const langSettings = form.settings?.language || 'en'
  const showProgress = form.settings?.show_progress_bar !== false
  const t = translations(langSettings)

  // ── Restore from localStorage on mount ──────────────────────────
  const [phase, setPhase] = useState('intro') // 'intro' | 'filling' | 'submitting' | 'done'
  const [answers, setAnswers] = useState({})
  const [step, setStep] = useState(0)
  const [restoredBack, setRestoredBack] = useState(false)
  const [submitError, setSubmitError] = useState(null)

  // Page 0 — collected before any questions render. business_name
  // is the most load-bearing: it gets substituted into question
  // text + the assembled brief + the designer's notification
  // subject.
  const [clientName, setClientName] = useState('')
  const [businessName, setBusinessName] = useState('')
  const [clientEmail, setClientEmail] = useState('')
  const [pageZeroErrors, setPageZeroErrors] = useState({})

  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY(form.id))
      if (!raw) return
      const draft = JSON.parse(raw)
      if (draft && draft.answers && typeof draft.step === 'number') {
        setAnswers(draft.answers)
        setStep(Math.max(0, Math.min(draft.step, allQuestions.length - 1)))
        if (draft.clientName) setClientName(draft.clientName)
        if (draft.businessName) setBusinessName(draft.businessName)
        if (draft.clientEmail) setClientEmail(draft.clientEmail)
        if (draft.phase === 'filling') {
          setPhase('filling')
          setRestoredBack(true)
        }
      }
    } catch (e) {
      console.warn('[client-intake] could not restore draft', e?.message)
      try { localStorage.removeItem(DRAFT_KEY(form.id)) } catch {}
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.id, allQuestions.length])

  // Persist progress on every change. We capture Page 0 fields once
  // the user advances out of intro so a refresh mid-form doesn't
  // wipe them.
  useEffect(() => {
    if (phase !== 'filling') return
    try {
      localStorage.setItem(DRAFT_KEY(form.id), JSON.stringify({
        phase, step, answers, clientName, businessName, clientEmail,
      }))
    } catch {}
  }, [phase, step, answers, clientName, businessName, clientEmail, form.id])

  // ── Visible-questions logic (conditional-rule evaluator) ────────
  const visible = useMemo(
    () => allQuestions.filter(q => meetsCondition(q, answers)),
    [allQuestions, answers],
  )
  const total = visible.length
  const safeStep = Math.min(step, Math.max(0, total - 1))
  const current = visible[safeStep]

  function next() {
    if (safeStep >= total - 1) {
      handleSubmit()
      return
    }
    setStep(safeStep + 1)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  function back() {
    if (safeStep <= 0) return
    setStep(safeStep - 1)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function setAnswer(qid, value) {
    setAnswers(prev => ({ ...prev, [qid]: value }))
  }

  function handlePageZeroContinue() {
    const errors = {}
    if (!clientName.trim()) errors.clientName = 'Your name is required'
    if (!businessName.trim()) errors.businessName = 'Business name is required'
    if (clientEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clientEmail.trim())) {
      errors.clientEmail = 'Please enter a valid email'
    }
    if (Object.keys(errors).length > 0) {
      setPageZeroErrors(errors)
      return
    }
    setPageZeroErrors({})
    setPhase('filling')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // Personalise question text using the business name. Swaps
  // "your business", "your brand", "your product", "your company"
  // for the captured name so the form feels written for them.
  // No business name yet → return the text untouched.
  const personalizeQuestion = useMemo(() => {
    const trimmed = businessName.trim()
    if (!trimmed) return (t) => t
    return (text) => String(text || '').replace(
      /\byour (business|brand|product|company)\b/gi,
      trimmed,
    )
  }, [businessName])

  async function handleSubmit() {
    setPhase('submitting')
    setSubmitError(null)
    try {
      // Collect mood/reference URLs across all upload questions.
      // After Phase 6 polish, uploaded files are objects
      // { name, size, type, url, path } — pull the public URL so the
      // pipeline can include them in the brief.
      const moodUrls = Object.entries(answers)
        .flatMap(([_qid, val]) => Array.isArray(val) ? val : [])
        .map(v => {
          if (typeof v === 'string' && /^https?:\/\//.test(v)) return v
          if (v && typeof v === 'object' && typeof v.url === 'string' && /^https?:\/\//.test(v.url)) return v.url
          return null
        })
        .filter(Boolean)
        .join('\n')
      // Try the anonymous RPC first. Falls back to direct insert if
      // the RPC isn't deployed yet (legacy intake-public-tracking.sql
      // missing).
      const resolvedEmail = clientEmail.trim() || extractEmail(answers, allQuestions)
      const trimmedClientName   = clientName.trim() || null
      const trimmedBusinessName = businessName.trim() || null
      let submissionId = null
      try {
        // submit_intake_anon returns the new submission id (text)
        const { data: rpcId, error: rpcErr } = await supabase.rpc('submit_intake_anon', {
          p_form_id: form.id,
          p_answers: answers,
          p_client_email: resolvedEmail,
          p_mood_urls: moodUrls,
          p_client_name: trimmedClientName,
          p_business_name: trimmedBusinessName,
        })
        if (!rpcErr) submissionId = rpcId
        else if (rpcErr.message?.toLowerCase().includes('form_expired')) {
          throw new Error('expired')
        }
      } catch (e) {
        if (e.message === 'expired') throw e
      }
      if (!submissionId) {
        const fallbackId = 'sub_' + Math.random().toString(36).slice(2, 14)
        const { error: insertErr } = await supabase
          .from('intake_submissions')
          .insert({
            id: fallbackId,
            intake_form_id: form.id,
            answers,
            client_email: resolvedEmail,
            client_name: trimmedClientName,
            business_name: trimmedBusinessName,
            mood_urls: moodUrls,
            status: 'pending',
            submitted_at: new Date().toISOString(),
          })
        if (insertErr) throw insertErr
        submissionId = fallbackId
      }

      // Phase 4 — fire-and-forget the processing pipeline. Runs on
      // Render with no Vercel timeout ceiling. We don't wait for
      // the response; the client sees the completion screen
      // immediately while the pipeline runs in the background and
      // updates the submission row's status as each step lands.
      const pipelineUrl = (import.meta.env.VITE_API_URL || '') + '/api/process-intake'
      if (pipelineUrl) {
        fetch(pipelineUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ submission_id: submissionId }),
        }).catch(e => console.warn('[client-intake] pipeline kickoff failed', e?.message))
      }

      try { localStorage.removeItem(DRAFT_KEY(form.id)) } catch {}
      setPhase('done')
    } catch (e) {
      console.error('[client-intake] submit failed', e)
      setSubmitError(e.message === 'expired'
        ? 'This form expired while you were filling it out. Reach out to your designer for a fresh link.'
        : (e.message || 'Could not submit. Try again in a moment.'))
      setPhase('filling')
    }
  }

  // ── Render branches ────────────────────────────────────────────
  if (phase === 'done') return <CompletionScreen form={form} t={t} clientName={clientName} businessName={businessName} />
  if (phase === 'submitting') return <CenteredMessage spinner>{t.submitting}</CenteredMessage>

  if (!total) {
    return (
      <BrandedScreen
        form={form}
        title={t.emptyTitle}
        body={t.emptyBody}
      />
    )
  }

  return (
    <div className="ci-root" style={{ ['--accent']: accent }}>
      <Styles />

      {phase === 'intro' ? (
        <IntroScreen
          form={form}
          t={t}
          estMinutes={estimatedMinutes(allQuestions)}
          clientName={clientName}
          businessName={businessName}
          clientEmail={clientEmail}
          setClientName={setClientName}
          setBusinessName={setBusinessName}
          setClientEmail={setClientEmail}
          errors={pageZeroErrors}
          clearError={(key) => setPageZeroErrors(prev => ({ ...prev, [key]: undefined }))}
          onContinue={handlePageZeroContinue}
        />
      ) : (
        <>
          {showProgress && (
            <div className="ci-progress" role="progressbar" aria-valuenow={safeStep + 1} aria-valuemax={total}>
              <div style={{ width: `${((safeStep + 1) / total) * 100}%` }} />
            </div>
          )}

          {restoredBack && safeStep > 0 && (
            <RestoredBanner onDismiss={() => setRestoredBack(false)} t={t} />
          )}

          {submitError && (
            <div className="ci-submit-err" role="alert">{submitError}</div>
          )}

          <div className="ci-screen">
            <div className="ci-screen-inner">
              {/* Back affordance only renders past the first question.
                  Step 0 has nothing meaningful behind it (the intro
                  page already collected the up-front context). */}
              {safeStep > 0 && (
                <button onClick={back} className="ci-back-link" aria-label={t.back}>
                  <ArrowLeftIcon style={{ width: 14, height: 14 }} />
                  <span>{t.back}</span>
                </button>
              )}

              <div className="ci-counter">{t.questionWord} {safeStep + 1} {t.of} {total}</div>

              <h2 className="ci-q-text">{personalizeQuestion(current.text)}</h2>
              {current.helper_text && <p className="ci-q-helper">{personalizeQuestion(current.helper_text)}</p>}

              <div className="ci-q-input">
                <QuestionInput
                  q={current}
                  value={answers[current.id]}
                  onChange={(v) => setAnswer(current.id, v)}
                  uploadsAllowed={form.settings?.file_uploads_enabled !== false}
                  t={t}
                  formId={form.id}
                />
              </div>

              <div className="ci-q-actions">
                <button
                  onClick={next}
                  disabled={current.required && isEmpty(answers[current.id])}
                  className="ci-continue"
                >
                  {safeStep === total - 1 ? t.submit : t.continue}
                  <ArrowRightIcon style={{ width: 14, height: 14 }} />
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────
// Page 0 — intro form (replaces the legacy OpeningScreen).
// Collects client name, business name, optional email before any
// question is shown. Business name flows through every question +
// the assembled brief + the designer notification.
// ────────────────────────────────────────────────────────────────────
function IntroScreen({
  form, t, estMinutes,
  clientName, businessName, clientEmail,
  setClientName, setBusinessName, setClientEmail,
  errors, clearError, onContinue,
}) {
  const b = form.branding || {}
  return (
    <div className="ci-intro-stage">
      <div className="ci-intro-card">
        {b.logo_url && <img src={b.logo_url} alt="" className="ci-intro-logo" />}

        {/* Step indicator — 1 of 3, first dot active. Inactive dot
            colour is theme-aware via .ci-step-dot-dim. */}
        <div className="ci-intro-steps">
          <span className="ci-step-dot" />
          <span className="ci-step-dot ci-step-dot-dim" />
          <span className="ci-step-dot ci-step-dot-dim" />
          <span className="ci-intro-steps-label">{t.beforeWeStart}</span>
        </div>

        <h1 className="ci-intro-h1">{t.tellUsTitle}</h1>
        <p className="ci-intro-sub">{t.tellUsSub}</p>

        <IntroField
          label={t.yourNameLabel}
          placeholder={t.yourNamePlaceholder}
          value={clientName}
          onChange={setClientName}
          required
          error={errors.clientName}
          clearError={() => clearError('clientName')}
          onEnter={onContinue}
          t={t}
        />
        <IntroField
          label={t.businessLabel}
          sublabel={t.businessSub}
          placeholder={t.businessPlaceholder}
          value={businessName}
          onChange={setBusinessName}
          required
          error={errors.businessName}
          clearError={() => clearError('businessName')}
          onEnter={onContinue}
          t={t}
        />
        <IntroField
          label={t.emailLabel}
          sublabel={t.emailSub}
          placeholder={t.emailPlaceholder}
          type="email"
          value={clientEmail}
          onChange={setClientEmail}
          error={errors.clientEmail}
          clearError={() => clearError('clientEmail')}
          onEnter={onContinue}
          t={t}
        />

        <button onClick={onContinue} className="ci-intro-continue">
          {t.continue}
          <ArrowRightIcon style={{ width: 16, height: 16 }} />
        </button>

        <p className="ci-intro-foot">
          <span className="ci-intro-req-star">*</span> {t.requiredFields}
          {estMinutes > 0 && <> · {t.estimatedTime} {estMinutes} {estMinutes === 1 ? t.minute : t.minutes}</>}
        </p>
      </div>
    </div>
  )
}

function IntroField({ label, sublabel, value, onChange, placeholder, type = 'text', required = false, error, clearError, onEnter, t }) {
  return (
    <div className="ci-intro-field">
      <div className="ci-intro-field-head">
        <label className="ci-intro-label">{label}</label>
        {required
          ? <span className="ci-intro-req-star" aria-label="required">*</span>
          : <span className="ci-intro-opt-tag">{t.optionalLabel || 'optional'}</span>}
      </div>
      {sublabel && <p className="ci-intro-sublabel">{sublabel}</p>}
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        className={`ci-intro-input${error ? ' is-error' : ''}`}
        onChange={(e) => { onChange(e.target.value); if (error) clearError?.() }}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onEnter?.() } }}
        autoCapitalize={type === 'email' ? 'off' : 'words'}
        autoCorrect={type === 'email' ? 'off' : undefined}
        spellCheck={type === 'email' ? false : undefined}
        inputMode={type === 'email' ? 'email' : undefined}
      />
      {error && <p className="ci-intro-err">{error}</p>}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────
// Completion screen — redesigned premium thank-you.
// ────────────────────────────────────────────────────────────────────
function CompletionScreen({ form, t, clientName, businessName }) {
  const b = form.branding || {}
  const firstName = (clientName || '').trim().split(/\s+/)[0]
  const greeting = firstName ? `${t.thanksWithName} ${firstName}.` : t.thankYou
  return (
    <div className="ci-done-stage">
      <div className="ci-done-card">
        {b.logo_url && <img src={b.logo_url} alt="" className="ci-done-logo" />}
        <div className="ci-done-check" aria-hidden>
          <CheckIcon style={{ width: 30, height: 30 }} />
        </div>
        <h1 className="ci-done-h1">{greeting}</h1>
        <p className="ci-done-lead">
          {b.completion_message || t.defaultDone}
        </p>
        {businessName?.trim() && (
          <div className="ci-done-meta">
            <span className="ci-done-meta-label">{t.briefForLabel}</span>
            <span className="ci-done-meta-value">{businessName.trim()}</span>
          </div>
        )}
        <ol className="ci-done-next">
          <li>
            <span className="ci-done-next-num">1</span>
            <span>{t.nextStep1}</span>
          </li>
          <li>
            <span className="ci-done-next-num">2</span>
            <span>{t.nextStep2}</span>
          </li>
          <li>
            <span className="ci-done-next-num">3</span>
            <span>{t.nextStep3}</span>
          </li>
        </ol>
        <p className="ci-done-close">{t.youCanClose}</p>
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────
// Question input dispatcher
// ────────────────────────────────────────────────────────────────────
function QuestionInput({ q, value, onChange, uploadsAllowed, t, formId }) {
  switch (q.type) {
    case 'short_text':
      return <ShortText value={value} onChange={onChange} />
    case 'long_text':
      return <LongText value={value} onChange={onChange} />
    case 'single_choice':
      return <SingleChoice options={q.options || []} value={value} onChange={onChange} />
    case 'multi_choice':
      return <MultiChoice options={q.options || []} value={Array.isArray(value) ? value : []} onChange={onChange} />
    case 'scale':
      return <Scale low={q.scale_low_label} high={q.scale_high_label} value={value} onChange={onChange} />
    case 'reference_upload':
      return uploadsAllowed
        ? <FileDrop accept="image/jpeg,image/png,image/webp,application/pdf" valueArr={value} onChange={onChange} t={t} kind="reference" formId={formId} />
        : <DisabledMsg msg={t.uploadsDisabled} />
    case 'file_upload':
      return uploadsAllowed
        ? <FileDrop accept="*/*" valueArr={value} onChange={onChange} t={t} kind="file" formId={formId} />
        : <DisabledMsg msg={t.uploadsDisabled} />
    default:
      return <ShortText value={value} onChange={onChange} />
  }
}

function DisabledMsg({ msg }) {
  return <div className="ci-disabled">{msg}</div>
}

function ShortText({ value, onChange }) {
  const v = typeof value === 'string' ? value : ''
  return (
    <div>
      <input
        type="text"
        value={v}
        onChange={e => onChange(e.target.value.slice(0, 150))}
        className="ci-input"
        maxLength={150}
        placeholder=""
      />
      <div className="ci-counter-line">{v.length} / 150</div>
    </div>
  )
}

function LongText({ value, onChange }) {
  const v = typeof value === 'string' ? value : ''
  return (
    <div>
      <textarea
        value={v}
        onChange={e => onChange(e.target.value.slice(0, 1000))}
        className="ci-textarea"
        rows={5}
        maxLength={1000}
      />
      <div className="ci-counter-line">{v.length} / 1000</div>
    </div>
  )
}

function SingleChoice({ options, value, onChange }) {
  return (
    <div className="ci-pills">
      {options.map((opt, i) => {
        const active = value === opt
        return (
          <button
            key={i}
            onClick={() => onChange(opt)}
            className={`ci-pill ${active ? 'is-active' : ''}`}
            type="button"
          >
            {active && <CheckIcon style={{ width: 12, height: 12, marginRight: 6, flexShrink: 0 }} />}
            {opt}
          </button>
        )
      })}
    </div>
  )
}

function MultiChoice({ options, value, onChange }) {
  function toggle(opt) {
    if (value.includes(opt)) onChange(value.filter(v => v !== opt))
    else onChange([...value, opt])
  }
  return (
    <div className="ci-pills">
      {options.map((opt, i) => {
        const active = value.includes(opt)
        return (
          <button
            key={i}
            onClick={() => toggle(opt)}
            className={`ci-pill ${active ? 'is-active' : ''}`}
            type="button"
          >
            {active && <CheckIcon style={{ width: 12, height: 12, marginRight: 6, flexShrink: 0 }} />}
            {opt}
          </button>
        )
      })}
    </div>
  )
}

function Scale({ low, high, value, onChange }) {
  return (
    <div className="ci-scale">
      <div className="ci-scale-labels">
        <span>{low || '1'}</span>
        <span>{high || '10'}</span>
      </div>
      <div className="ci-scale-bar">
        {[1,2,3,4,5,6,7,8,9,10].map(n => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            className={`ci-scale-btn ${value === n ? 'is-active' : ''}`}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  )
}

function FileDrop({ accept, valueArr, onChange, t, kind, formId }) {
  const files = Array.isArray(valueArr) ? valueArr : []
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  async function addFiles(list) {
    if (!list?.length) return
    setError(null)
    setBusy(true)
    try {
      const next = [...files]
      for (const f of list) {
        if (next.length >= 5) break
        if (f.size > 8 * 1024 * 1024) {
          setError(t.fileTooBig.replace('{name}', f.name))
          continue
        }
        try {
          // Upload to the intake-uploads Storage bucket. Path is
          // namespaced under the form id so the designer can see at
          // a glance in the Supabase dashboard which form a file
          // came from. Timestamp + random suffix prevent collisions
          // on double-submits + keep the URL unguessable.
          const cleanName = f.name.replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 60)
          const path = `${formId || 'anon'}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${cleanName}`
          const { error: upErr } = await supabase.storage
            .from('intake-uploads')
            .upload(path, f, { cacheControl: '3600', contentType: f.type })
          if (upErr) {
            // Bucket missing or policy not in place — fall back to a
            // data URL so the form still works during the migration
            // window before the storage SQL is run.
            console.warn('[upload] storage failed, falling back to data URL', upErr?.message)
            const dataUrl = await fileToDataUrl(f)
            next.push({ name: f.name, size: f.size, type: f.type, data: dataUrl })
            continue
          }
          const { data: pub } = supabase.storage.from('intake-uploads').getPublicUrl(path)
          next.push({ name: f.name, size: f.size, type: f.type, url: pub.publicUrl, path })
        } catch (e) {
          console.warn('[upload]', e?.message)
          setError(t.fileFailed)
        }
      }
      onChange(next)
    } finally {
      setBusy(false)
    }
  }

  function remove(i) {
    onChange(files.filter((_, idx) => idx !== i))
  }

  function onSelect(e) {
    addFiles(Array.from(e.target.files || []))
    e.target.value = ''
  }
  function onDragOver(e) { e.preventDefault() }
  function onDrop(e) {
    e.preventDefault()
    addFiles(Array.from(e.dataTransfer?.files || []))
  }

  return (
    <div>
      <label
        className="ci-drop"
        onDragOver={onDragOver}
        onDrop={onDrop}
      >
        <input
          type="file"
          multiple
          accept={accept}
          onChange={onSelect}
          style={{ display: 'none' }}
        />
        <ArrowUpTrayIcon style={{ width: 18, height: 18 }} />
        <span>{busy ? t.uploading : t.dropOrTap}</span>
        <span className="ci-drop-sub">
          {kind === 'reference' ? 'JPG · PNG · WEBP · PDF · up to 5' : t.anyFile}
        </span>
      </label>

      {error && (
        <div className="ci-file-error">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ci-x" aria-label="Dismiss">
            <XMarkIcon style={{ width: 12, height: 12 }} />
          </button>
        </div>
      )}

      {files.length > 0 && (
        <ul className="ci-file-list">
          {files.map((f, i) => (
            <li key={i} className="ci-file-row">
              {isImage(f) ? (
                <img src={f.url || f.data} alt="" className="ci-file-thumb" />
              ) : (
                <span className="ci-file-icon">📎</span>
              )}
              <div className="ci-file-meta">
                <span className="ci-file-name">{f.name}</span>
                <span className="ci-file-size">{prettySize(f.size)}</span>
              </div>
              <button onClick={() => remove(i)} className="ci-x" aria-label="Remove">
                <XMarkIcon style={{ width: 12, height: 12 }} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────
// Branded fallback screens
// ────────────────────────────────────────────────────────────────────
function BrandedScreen({ form, title, body }) {
  const b = form?.branding || {}
  const accent = b.primary_color || '#8B5CF6'
  return (
    <div className="ci-root" style={{ ['--accent']: accent }}>
      <Styles />
      <div className="ci-open">
        {b.logo_url && <img src={b.logo_url} alt="" className="ci-open-logo" />}
        <h1 className="ci-done-h1" style={{ fontSize: 22 }}>{title}</h1>
        <p className="ci-open-welcome">{body}</p>
      </div>
    </div>
  )
}

function CenteredMessage({ children, spinner }) {
  return (
    <div className="ci-root" style={{ ['--accent']: '#8B5CF6' }}>
      <Styles />
      <div className="ci-open">
        {spinner && (
          <div className="ci-spinner" aria-hidden>
            <div className="ci-spinner-ring" />
          </div>
        )}
        <p className="ci-open-welcome">{children}</p>
      </div>
    </div>
  )
}

function RestoredBanner({ onDismiss, t }) {
  return (
    <div className="ci-restored">
      <span>{t.restored}</span>
      <button onClick={onDismiss} className="ci-x" aria-label="Dismiss">
        <XMarkIcon style={{ width: 12, height: 12 }} />
      </button>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────
function meetsCondition(q, answers) {
  const rules = q.conditional_rules || []
  if (!rules.length) return true
  return rules.every(r => {
    const v = answers[r.depends_on_qid]
    if (v == null || v === '') return false
    const a = String(v).toLowerCase()
    const b = String(r.value).toLowerCase()
    if (r.operator === 'equals') return a === b
    if (r.operator === 'not_equals') return a !== b
    if (r.operator === 'contains') return a.includes(b)
    return true
  })
}

function isEmpty(v) {
  if (v == null) return true
  if (typeof v === 'string') return v.trim().length === 0
  if (Array.isArray(v)) return v.length === 0
  return false
}

function estimatedMinutes(questions) {
  const required = (questions || []).filter(q => q?.required).length
  return Math.max(1, Math.round((required * 45) / 60))
}

function legacyFlatten(sections) {
  if (!Array.isArray(sections)) return []
  const out = []
  for (const s of sections) {
    if (Array.isArray(s?.questions)) {
      for (const q of s.questions) {
        out.push({
          id: q.id || `legacy_${out.length}`,
          text: q.text || q.label || '',
          helper_text: q.helper || '',
          type: q.type || 'short_text',
          required: q.required !== false,
          options: q.options || null,
          conditional_rules: [],
        })
      }
    }
  }
  return out
}

function extractEmail(answers, questions) {
  // Best-effort: scan any short_text question whose text mentions
  // "email" for a matching value.
  for (const q of questions) {
    if (q.type !== 'short_text') continue
    if (!/email/i.test(q.text)) continue
    const v = answers[q.id]
    if (typeof v === 'string' && /^.+@.+\..+$/.test(v)) return v
  }
  return null
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

function isImage(f) {
  return typeof f?.type === 'string' && f.type.startsWith('image/')
}

function prettySize(bytes) {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB'
  return (bytes / 1024 / 1024).toFixed(1) + ' MB'
}

// ────────────────────────────────────────────────────────────────────
// i18n — system labels only; designer's question text is untouched.
// ────────────────────────────────────────────────────────────────────
function translations(lang) {
  const en = {
    start: 'Start',
    continue: 'Continue',
    back: 'Back',
    submit: 'Submit',
    submitting: 'Submitting…',
    questionWord: 'Question',
    of: 'of',
    minute: 'minute',
    minutes: 'minutes',
    estimatedTime: 'Takes about',
    thankYou: 'Thank you',
    defaultWelcome: "Welcome. Thanks for taking a few minutes to share the shape of this project.",
    defaultDone: "Thanks. I have what I need to start. I'll be in touch within a couple of days.",
    emptyTitle: 'No questions yet',
    emptyBody: 'This form has no questions. Ask your designer to add some.',
    uploadsDisabled: 'File uploads are disabled on this form.',
    dropOrTap: 'Drag + drop, or tap to browse',
    anyFile: 'Any common file type. Up to 5.',
    uploading: 'Uploading…',
    fileTooBig: '{name} is too large (max 8MB).',
    fileFailed: 'Could not read the file. Try a different one.',
    restored: 'Welcome back — continuing where you left off.',
    // Page 0
    beforeWeStart: 'Before we start',
    tellUsTitle: 'Tell us about your project',
    tellUsSub: 'This helps us personalise your questions and generate a brief that actually sounds like your brand.',
    yourNameLabel: 'Your name',
    yourNamePlaceholder: 'e.g. Amaka Okafor',
    businessLabel: 'Business or product name',
    businessSub: 'This is what we use throughout your brief.',
    businessPlaceholder: 'e.g. Nestiq, PocketBase, Akaani',
    emailLabel: 'Your email',
    emailSub: "We'll send you a copy of your answers.",
    emailPlaceholder: 'you@business.com',
    optionalLabel: 'optional',
    requiredFields: 'Required fields',
    // Thank-you screen
    thanksWithName: 'Thanks,',
    briefForLabel: 'Brief for',
    nextStep1: 'Your answers go straight to your designer.',
    nextStep2: 'A first draft of the brief is being prepared in the background.',
    nextStep3: "You'll hear back with next steps shortly.",
    youCanClose: 'You can safely close this tab.',
  }
  const fr = {
    start: 'Commencer', continue: 'Continuer', back: 'Retour', submit: 'Envoyer', submitting: 'Envoi…',
    questionWord: 'Question', of: 'sur', minute: 'minute', minutes: 'minutes', estimatedTime: 'Environ',
    thankYou: 'Merci',
    defaultWelcome: 'Bienvenue. Merci de prendre quelques minutes pour décrire ce projet.',
    defaultDone: "Merci. J'ai ce qu'il me faut pour commencer. Je reviens vers vous dans quelques jours.",
    emptyTitle: 'Aucune question', emptyBody: 'Ce formulaire ne contient aucune question.',
    uploadsDisabled: "Les pièces jointes sont désactivées sur ce formulaire.",
    dropOrTap: 'Glissez-déposez, ou touchez pour parcourir', anyFile: 'Tout type de fichier courant. Jusqu\'à 5.',
    uploading: 'Téléversement…',
    fileTooBig: '{name} est trop volumineux (max 8 Mo).',
    fileFailed: 'Impossible de lire le fichier.',
    restored: 'Bon retour. Reprenons où vous en étiez.',
    beforeWeStart: 'Avant de commencer',
    tellUsTitle: 'Parlez-nous de votre projet',
    tellUsSub: 'Cela nous aide à personnaliser vos questions et à rédiger un brief qui ressemble vraiment à votre marque.',
    yourNameLabel: 'Votre nom',
    yourNamePlaceholder: 'ex. Amaka Okafor',
    businessLabel: 'Nom de l\'entreprise ou du produit',
    businessSub: 'C\'est ce que nous utiliserons dans votre brief.',
    businessPlaceholder: 'ex. Nestiq, PocketBase, Akaani',
    emailLabel: 'Votre email',
    emailSub: 'Nous vous enverrons une copie de vos réponses.',
    emailPlaceholder: 'vous@entreprise.com',
    optionalLabel: 'facultatif',
    requiredFields: 'Champs requis',
    thanksWithName: 'Merci,',
    briefForLabel: 'Brief pour',
    nextStep1: 'Vos réponses partent directement à votre designer.',
    nextStep2: 'Un premier jet du brief est en préparation en arrière-plan.',
    nextStep3: 'Vous aurez bientôt des nouvelles avec les prochaines étapes.',
    youCanClose: 'Vous pouvez fermer cet onglet en toute sécurité.',
  }
  const es = {
    start: 'Empezar', continue: 'Continuar', back: 'Volver', submit: 'Enviar', submitting: 'Enviando…',
    questionWord: 'Pregunta', of: 'de', minute: 'minuto', minutes: 'minutos', estimatedTime: 'Tarda unos',
    thankYou: 'Gracias',
    defaultWelcome: 'Bienvenido. Gracias por tomar unos minutos para describir este proyecto.',
    defaultDone: 'Gracias. Tengo lo que necesito para empezar. Estaré en contacto en unos días.',
    emptyTitle: 'Sin preguntas', emptyBody: 'Este formulario aún no tiene preguntas.',
    uploadsDisabled: 'Las cargas de archivos están deshabilitadas.',
    dropOrTap: 'Arrastra y suelta, o toca para buscar', anyFile: 'Cualquier tipo común. Hasta 5.',
    uploading: 'Subiendo…',
    fileTooBig: '{name} es demasiado grande (máx 8 MB).',
    fileFailed: 'No se pudo leer el archivo.',
    restored: 'Bienvenido de vuelta. Continuamos donde lo dejaste.',
    beforeWeStart: 'Antes de empezar',
    tellUsTitle: 'Cuéntanos sobre tu proyecto',
    tellUsSub: 'Esto nos ayuda a personalizar tus preguntas y generar un brief que suene a tu marca.',
    yourNameLabel: 'Tu nombre',
    yourNamePlaceholder: 'p. ej. Amaka Okafor',
    businessLabel: 'Nombre del negocio o producto',
    businessSub: 'Esto es lo que usaremos en tu brief.',
    businessPlaceholder: 'p. ej. Nestiq, PocketBase, Akaani',
    emailLabel: 'Tu correo',
    emailSub: 'Te enviaremos una copia de tus respuestas.',
    emailPlaceholder: 'tu@negocio.com',
    optionalLabel: 'opcional',
    requiredFields: 'Campos obligatorios',
    thanksWithName: 'Gracias,',
    briefForLabel: 'Brief para',
    nextStep1: 'Tus respuestas llegan directamente a tu diseñador.',
    nextStep2: 'Se está preparando un primer borrador del brief en segundo plano.',
    nextStep3: 'Pronto sabrás los próximos pasos.',
    youCanClose: 'Puedes cerrar esta pestaña tranquilamente.',
  }
  const pt = {
    start: 'Começar', continue: 'Continuar', back: 'Voltar', submit: 'Enviar', submitting: 'Enviando…',
    questionWord: 'Pergunta', of: 'de', minute: 'minuto', minutes: 'minutos', estimatedTime: 'Leva cerca de',
    thankYou: 'Obrigado',
    defaultWelcome: 'Bem-vindo. Obrigado por dedicar alguns minutos para descrever este projeto.',
    defaultDone: 'Obrigado. Tenho o que preciso para começar. Entrarei em contato em alguns dias.',
    emptyTitle: 'Sem perguntas', emptyBody: 'Este formulário ainda não tem perguntas.',
    uploadsDisabled: 'O envio de arquivos está desativado.',
    dropOrTap: 'Arraste e solte, ou toque para procurar', anyFile: 'Qualquer tipo de arquivo comum. Até 5.',
    uploading: 'Enviando…',
    fileTooBig: '{name} é muito grande (máx 8 MB).',
    fileFailed: 'Não foi possível ler o arquivo.',
    restored: 'Bem-vindo de volta. Continuando de onde parou.',
    beforeWeStart: 'Antes de começar',
    tellUsTitle: 'Conte-nos sobre o seu projeto',
    tellUsSub: 'Isso nos ajuda a personalizar suas perguntas e gerar um brief com a cara da sua marca.',
    yourNameLabel: 'Seu nome',
    yourNamePlaceholder: 'ex. Amaka Okafor',
    businessLabel: 'Nome do negócio ou produto',
    businessSub: 'É o que usaremos ao longo do seu brief.',
    businessPlaceholder: 'ex. Nestiq, PocketBase, Akaani',
    emailLabel: 'Seu email',
    emailSub: 'Enviaremos uma cópia das suas respostas.',
    emailPlaceholder: 'voce@negocio.com',
    optionalLabel: 'opcional',
    requiredFields: 'Campos obrigatórios',
    thanksWithName: 'Obrigado,',
    briefForLabel: 'Brief para',
    nextStep1: 'Suas respostas vão direto para o seu designer.',
    nextStep2: 'Um primeiro rascunho do brief está sendo preparado em segundo plano.',
    nextStep3: 'Em breve você terá novidades sobre os próximos passos.',
    youCanClose: 'Você pode fechar esta aba tranquilamente.',
  }
  if (lang === 'fr') return fr
  if (lang === 'es') return es
  if (lang === 'pt') return pt
  return en
}

// ────────────────────────────────────────────────────────────────────
// Styles
// ────────────────────────────────────────────────────────────────────
function Styles() {
  return (
    <style>{`
      .ci-root {
        --accent: #8B5CF6;
        min-height: 100dvh;
        background: var(--color-bg);
        color: var(--color-text);
        font-family: 'Urbanist', -apple-system, sans-serif;
        display: flex;
        flex-direction: column;
      }

      .ci-progress { position: sticky; top: 0; z-index: 5; height: 3px; background: rgba(0,0,0,0.06); }
      .ci-progress > div { height: 100%; background: var(--accent); transition: width 0.3s ease; }

      .ci-restored { display: flex; align-items: center; justify-content: space-between; gap: 8px; max-width: 640px; margin: 12px auto 0; padding: 10px 14px; background: rgba(139,92,246,0.10); border: 1px solid rgba(139,92,246,0.30); border-radius: 10px; font-size: 13px; color: var(--color-text); }

      .ci-submit-err { max-width: 640px; margin: 12px auto 0; padding: 10px 14px; background: rgba(239,68,68,0.08); border: 1px solid rgba(239,68,68,0.30); border-radius: 10px; font-size: 13px; color: #b91c1c; }

      .ci-screen { flex: 1; display: flex; justify-content: center; padding: 40px 24px 140px; }
      .ci-screen-inner { width: 100%; max-width: 640px; display: flex; flex-direction: column; gap: 16px; }

      .ci-back-link { align-self: flex-start; display: inline-flex; align-items: center; gap: 6px; padding: 6px 10px; background: transparent; border: none; color: var(--color-text-soft); font: 600 13px 'Urbanist', sans-serif; cursor: pointer; border-radius: 7px; }
      .ci-back-link:disabled { opacity: 0.35; cursor: not-allowed; }

      .ci-counter { font: 700 11px 'JetBrains Mono', monospace; letter-spacing: 0.08em; text-transform: uppercase; color: var(--color-text-muted); }
      .ci-q-text { font: 800 28px 'Urbanist', sans-serif; letter-spacing: -0.02em; margin: 0; line-height: 1.2; color: var(--color-text); }
      .ci-q-helper { font: 500 14px 'Urbanist', sans-serif; color: var(--color-text-muted); margin: 0; line-height: 1.55; }
      .ci-q-input { margin-top: 8px; }
      .ci-q-actions { display: flex; justify-content: flex-end; margin-top: 14px; }

      .ci-continue {
        display: inline-flex; align-items: center; justify-content: center; gap: 8px;
        padding: 14px 24px;
        background: var(--accent); color: white;
        border: none; border-radius: 12px;
        font: 800 15px 'Urbanist', sans-serif;
        cursor: pointer;
        transition: opacity 0.15s, transform 0.05s;
        min-height: 48px;
      }
      .ci-continue:disabled { opacity: 0.45; cursor: not-allowed; }
      .ci-continue:active:not(:disabled) { transform: translateY(1px); }

      .ci-input, .ci-textarea {
        width: 100%; padding: 14px 16px;
        background: var(--color-surface); border: 1.5px solid var(--color-border);
        border-radius: 12px; outline: none;
        font: 500 16px 'Urbanist', sans-serif; color: var(--color-text);
        box-sizing: border-box;
        transition: border-color 0.15s, background 0.15s;
      }
      .ci-input:focus, .ci-textarea:focus { border-color: var(--accent); background: var(--color-bg); }
      .ci-textarea { resize: vertical; min-height: 120px; line-height: 1.55; }
      .ci-counter-line { text-align: right; font: 600 11px 'JetBrains Mono', monospace; color: var(--color-text-muted); margin-top: 4px; }

      .ci-pills { display: flex; flex-direction: column; gap: 8px; }
      .ci-pill {
        display: inline-flex; align-items: center;
        padding: 14px 18px;
        background: var(--color-surface); border: 1.5px solid var(--color-border);
        border-radius: 12px;
        font: 600 15px 'Urbanist', sans-serif; color: var(--color-text);
        cursor: pointer; text-align: left;
        transition: background 0.12s, border-color 0.12s, transform 0.05s;
        min-height: 48px;
      }
      .ci-pill:hover { border-color: var(--color-text-soft); }
      .ci-pill:active { transform: translateY(1px); }
      .ci-pill.is-active { background: rgba(139,92,246,0.10); border-color: var(--accent); color: var(--accent); }

      .ci-scale { display: flex; flex-direction: column; gap: 10px; }
      .ci-scale-labels { display: flex; justify-content: space-between; font: 600 12px 'Urbanist', sans-serif; color: var(--color-text-muted); }
      .ci-scale-bar { display: grid; grid-template-columns: repeat(10, minmax(0, 1fr)); gap: 6px; }
      .ci-scale-btn {
        padding: 14px 0;
        background: var(--color-surface); border: 1.5px solid var(--color-border);
        border-radius: 10px;
        font: 700 14px 'JetBrains Mono', monospace; color: var(--color-text-soft);
        cursor: pointer;
        min-height: 48px;
        transition: background 0.12s, border-color 0.12s;
      }
      .ci-scale-btn.is-active { background: var(--accent); color: white; border-color: var(--accent); }

      .ci-drop {
        display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px;
        padding: 28px 14px;
        background: var(--color-surface); border: 2px dashed var(--color-border);
        border-radius: 12px;
        color: var(--color-text-soft);
        font: 600 14px 'Urbanist', sans-serif;
        cursor: pointer;
        transition: border-color 0.15s, background 0.15s;
      }
      .ci-drop:hover { border-color: var(--accent); background: rgba(139,92,246,0.04); }
      .ci-drop-sub { font: 500 12px 'Urbanist', sans-serif; color: var(--color-text-muted); }

      .ci-file-error { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 8px; padding: 9px 12px; background: rgba(239,68,68,0.08); border: 1px solid rgba(239,68,68,0.30); border-radius: 9px; font-size: 13px; color: #b91c1c; }

      .ci-file-list { list-style: none; padding: 0; margin: 12px 0 0; display: flex; flex-direction: column; gap: 6px; }
      .ci-file-row { display: flex; align-items: center; gap: 10px; padding: 8px 10px; background: var(--color-surface); border: 1px solid var(--color-border); border-radius: 9px; }
      .ci-file-thumb { width: 36px; height: 36px; border-radius: 6px; object-fit: cover; flex-shrink: 0; }
      .ci-file-icon { font-size: 22px; line-height: 1; flex-shrink: 0; padding: 4px 8px; }
      .ci-file-meta { flex: 1; display: flex; flex-direction: column; gap: 1px; min-width: 0; }
      .ci-file-name { font: 600 13px 'Urbanist', sans-serif; color: var(--color-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .ci-file-size { font: 500 11px 'JetBrains Mono', monospace; color: var(--color-text-muted); }

      .ci-disabled { padding: 14px 16px; background: var(--color-surface); border: 1.5px dashed var(--color-border); border-radius: 10px; color: var(--color-text-muted); font: 500 13px 'Urbanist', sans-serif; }

      .ci-x { display: inline-flex; align-items: center; justify-content: center; width: 22px; height: 22px; background: transparent; border: none; color: var(--color-text-muted); cursor: pointer; border-radius: 5px; }
      .ci-x:hover { background: rgba(0,0,0,0.06); }

      .ci-open { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px; padding: 60px 28px 100px; text-align: center; max-width: 540px; margin: 0 auto; width: 100%; box-sizing: border-box; }
      .ci-open-logo { max-height: 60px; max-width: 220px; margin-bottom: 8px; }
      .ci-open-welcome { font: 500 18px 'Urbanist', sans-serif; line-height: 1.6; color: var(--color-text); margin: 0; max-width: 460px; }
      .ci-open-est { font: 600 13px 'JetBrains Mono', monospace; color: var(--color-text-muted); margin: 0; }

      .ci-start {
        display: inline-flex; align-items: center; justify-content: center; gap: 8px;
        padding: 16px 32px; margin-top: 14px;
        background: var(--accent); color: white;
        border: none; border-radius: 12px;
        font: 800 16px 'Urbanist', sans-serif;
        cursor: pointer;
        box-shadow: 0 8px 28px rgba(139,92,246,0.30);
        min-height: 48px;
        transition: transform 0.05s;
      }
      .ci-start:active { transform: translateY(1px); }

      .ci-done-check { display: inline-flex; align-items: center; justify-content: center; width: 64px; height: 64px; background: rgba(16,185,129,0.12); color: #10b981; border-radius: 50%; }
      .ci-done-h1 { font: 800 28px 'Urbanist', sans-serif; letter-spacing: -0.02em; margin: 0; }

      .ci-spinner { display: inline-flex; align-items: center; justify-content: center; }
      .ci-spinner-ring { width: 36px; height: 36px; border-radius: 50%; border: 3px solid rgba(0,0,0,0.08); border-top-color: var(--accent); animation: ci-spin 0.8s linear infinite; }
      @keyframes ci-spin { to { transform: rotate(360deg); } }

      /* ── Page 0 — intro form (replaces opening welcome) ──────── */
      .ci-intro-stage {
        flex: 1;
        display: flex; align-items: center; justify-content: center;
        padding: 48px 24px;
        min-height: calc(100vh - 48px);
        box-sizing: border-box;
      }
      .ci-intro-card {
        width: 100%; max-width: 480px;
        display: flex; flex-direction: column;
      }
      .ci-intro-logo { max-height: 44px; max-width: 200px; margin-bottom: 24px; align-self: flex-start; }
      .ci-intro-steps { display: flex; align-items: center; gap: 6px; margin-bottom: 32px; }
      .ci-step-dot { width: 28px; height: 4px; border-radius: 99px; background: var(--accent); display: inline-block; }
      .ci-step-dot-dim { background: var(--ci-dot-dim, rgba(0,0,0,0.10)); }
      [data-theme="dark"] .ci-step-dot-dim { background: rgba(255,255,255,0.10); }
      .ci-intro-steps-label {
        font: 700 11px 'JetBrains Mono', 'DM Mono', monospace;
        letter-spacing: 0.08em; text-transform: uppercase;
        color: var(--color-text-muted);
        margin-left: 8px;
      }

      .ci-intro-h1 {
        font: 800 clamp(24px, 4vw, 36px) 'Urbanist', sans-serif;
        letter-spacing: -0.03em;
        color: var(--color-text);
        margin: 0 0 8px;
        line-height: 1.15;
      }
      .ci-intro-sub {
        font: 500 15px 'Urbanist', sans-serif;
        color: var(--color-text-muted);
        margin: 0 0 40px;
        line-height: 1.6;
      }

      .ci-intro-field { margin-bottom: 20px; }
      .ci-intro-field-head { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; }
      .ci-intro-label { font: 600 14px 'Urbanist', sans-serif; color: var(--color-text); }
      .ci-intro-req-star { color: var(--accent); font-size: 14px; line-height: 1; }
      .ci-intro-opt-tag {
        font: 600 11px 'JetBrains Mono', 'DM Mono', monospace;
        letter-spacing: 0.05em;
        color: var(--color-text-muted);
        text-transform: lowercase;
      }
      .ci-intro-sublabel {
        font: 500 13px 'Urbanist', sans-serif;
        color: var(--color-text-muted);
        margin: 0 0 8px;
        line-height: 1.5;
      }
      .ci-intro-input {
        width: 100%;
        padding: 12px 16px;
        background: var(--color-surface);
        border: 1.5px solid var(--color-border);
        border-radius: 12px;
        color: var(--color-text);
        font: 500 15px 'Urbanist', sans-serif;
        outline: none;
        box-sizing: border-box;
        transition: border-color 0.2s ease, background 0.2s ease;
      }
      .ci-intro-input:focus { border-color: var(--accent); background: var(--color-bg); }
      .ci-intro-input.is-error { border-color: #EF4444; }
      .ci-intro-err { font: 500 12px 'Urbanist', sans-serif; color: #EF4444; margin: 6px 0 0; }

      .ci-intro-continue {
        width: 100%;
        padding: 14px 24px;
        margin-top: 8px;
        background: var(--accent);
        color: white;
        border: none;
        border-radius: 12px;
        font: 700 16px 'Urbanist', sans-serif;
        cursor: pointer;
        display: inline-flex; align-items: center; justify-content: center; gap: 8px;
        transition: background 0.18s ease, transform 0.05s ease;
        min-height: 48px;
      }
      .ci-intro-continue:hover { filter: brightness(0.94); }
      .ci-intro-continue:active { transform: translateY(1px); }

      .ci-intro-foot {
        font: 600 11px 'JetBrains Mono', 'DM Mono', monospace;
        color: var(--color-text-muted);
        text-align: center;
        margin: 16px 0 0;
        letter-spacing: 0.02em;
      }

      /* ── Redesigned thank-you screen ────────────────────────── */
      .ci-done-stage {
        flex: 1;
        display: flex; align-items: center; justify-content: center;
        padding: 48px 24px;
        min-height: calc(100vh - 48px);
        box-sizing: border-box;
      }
      .ci-done-card {
        width: 100%; max-width: 480px;
        display: flex; flex-direction: column; align-items: center;
        text-align: center;
      }
      .ci-done-logo { max-height: 44px; max-width: 200px; margin-bottom: 24px; }
      .ci-done-check {
        display: inline-flex; align-items: center; justify-content: center;
        width: 64px; height: 64px;
        background: rgba(16,185,129,0.12);
        color: #10b981;
        border: 1px solid rgba(16,185,129,0.30);
        border-radius: 50%;
        margin-bottom: 24px;
      }
      .ci-done-h1 {
        font: 800 clamp(26px, 4.2vw, 36px) 'Urbanist', sans-serif;
        letter-spacing: -0.03em;
        color: var(--color-text);
        margin: 0 0 10px;
        line-height: 1.15;
      }
      .ci-done-lead {
        font: 500 15px 'Urbanist', sans-serif;
        color: var(--color-text-muted);
        margin: 0 0 24px;
        line-height: 1.6;
        max-width: 420px;
      }
      .ci-done-meta {
        display: inline-flex; align-items: center; gap: 8px;
        padding: 8px 14px;
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: 100px;
        margin-bottom: 28px;
      }
      .ci-done-meta-label {
        font: 700 10px 'JetBrains Mono', monospace;
        letter-spacing: 0.08em; text-transform: uppercase;
        color: var(--color-text-muted);
      }
      .ci-done-meta-value {
        font: 700 13px 'Urbanist', sans-serif;
        color: var(--color-text);
      }
      .ci-done-next {
        list-style: none; padding: 0; margin: 0 0 28px;
        display: flex; flex-direction: column; gap: 12px;
        width: 100%;
        text-align: left;
      }
      .ci-done-next li {
        display: flex; align-items: flex-start; gap: 12px;
        padding: 12px 14px;
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: 10px;
        font: 500 13.5px 'Urbanist', sans-serif;
        color: var(--color-text);
        line-height: 1.55;
      }
      .ci-done-next-num {
        flex-shrink: 0;
        width: 22px; height: 22px;
        display: inline-flex; align-items: center; justify-content: center;
        background: var(--accent); color: white;
        border-radius: 50%;
        font: 700 11px 'JetBrains Mono', monospace;
        line-height: 1;
      }
      .ci-done-close {
        font: 500 12px 'Urbanist', sans-serif;
        color: var(--color-text-muted);
        margin: 0;
      }

      /* Tablet (768-1023): tighter padding, Continue stays inline */
      @media (max-width: 1023px) {
        .ci-screen { padding: 30px 20px 140px; }
        .ci-q-text { font-size: 24px; }
      }
      /* Mobile (<768): Continue fixed to the bottom of the viewport */
      @media (max-width: 767px) {
        .ci-screen { padding: 20px 16px 110px; }
        .ci-q-text { font-size: 22px; }
        .ci-q-actions {
          position: fixed;
          bottom: 0; left: 0; right: 0;
          padding: 12px 16px calc(12px + env(safe-area-inset-bottom));
          background: var(--color-bg);
          border-top: 1px solid var(--color-border);
          justify-content: stretch;
          z-index: 6;
        }
        .ci-continue { width: 100%; padding: 15px 18px; font-size: 16px; }
        .ci-back-link { padding: 8px 12px; }
        .ci-open { padding: 40px 24px 60px; }
        .ci-open-logo { max-height: 48px; }
        .ci-open-welcome { font-size: 16px; }
        .ci-pill { font-size: 14px; padding: 13px 16px; }
        .ci-intro-stage { padding: 32px 18px; min-height: calc(100vh - 32px); }
        .ci-done-stage { padding: 32px 18px; min-height: calc(100vh - 32px); }
        .ci-intro-h1 { font-size: 24px; }
        .ci-done-h1 { font-size: 24px; }
        .ci-done-next { gap: 8px; }
      }
    `}</style>
  )
}
