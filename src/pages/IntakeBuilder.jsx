// ────────────────────────────────────────────────────────────────────
// IntakeBuilder, Phase 1 of the Client Intake Form rebuild.
//
// Replaces the legacy 3-screen wizard with a richer builder:
//
//   1. Project-type card grid (first run only). Selecting a type
//      loads the default question set + branding + settings.
//   2. Builder screen with three tabs:
//        Questions  , drag/duplicate/delete/inline-edit cards,
//                      conditional-logic rule builder per card,
//                      Add Question button.
//        Branding   , logo upload, primary colour picker, welcome
//                      and completion messages (200 char each).
//        Settings   , expiry, file uploads on/off, language
//                      (en/fr/es/pt), progress bar, confirmation +
//                      designer notification emails, live estimated
//                      completion time.
//   3. Sticky bottom bar, Save Draft / Preview Form / Publish.
//   4. Live preview, desktop side panel, tablet drawer, mobile
//      modal. Always reflects the latest builder state.
//
// Responsive:
//   ≥1024 desktop , two-column: tabs+content | sticky preview
//   768-1023 tablet, single column + Preview FAB → modal
//   <768  mobile   , single column + Preview FAB → modal
// ────────────────────────────────────────────────────────────────────

import { useContext, useEffect, useMemo, useRef, useState } from 'react'
import AppContext from '../context/AppContext'
import { supabase } from '../lib/supabase'
import {
  PROJECT_TYPES,
  QUESTION_TYPES,
  defaultQuestionsFor,
  defaultBranding,
  defaultSettings,
  estimatedMinutes,
} from '../lib/intakeQuestionSets'
import IntakeDelivery from '../components/intake/IntakeDelivery'
import { motion } from 'framer-motion'
import StaggerGrid, { StaggerItem } from '../components/StaggerGrid'
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  ArrowsUpDownIcon,
  ArrowUpTrayIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  ClipboardDocumentListIcon,
  Cog6ToothIcon,
  DocumentDuplicateIcon,
  EyeIcon,
  GlobeAltIcon,
  LinkIcon,
  PaintBrushIcon,
  PlusIcon,
  Square3Stack3DIcon,
  SwatchIcon,
  TrashIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'

const uid = (p = 'q') => p + '_' + Math.random().toString(36).slice(2, 10)
const slug = () => Math.random().toString(36).slice(2, 14)

// ────────────────────────────────────────────────────────────────────
// Public component
// ────────────────────────────────────────────────────────────────────
export default function IntakeBuilder() {
  const { authUser, user, showToast, navigate, workspace, loadIntakeForms } = useContext(AppContext)
  const [form, setForm] = useState(() => freshForm())
  const [activeTab, setActiveTab] = useState('questions')
  const [previewOpen, setPreviewOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [publishing, setPublishing] = useState(false)
  // After Publish, we route the same screen to IntakeDelivery instead
  // of staying on the builder. The user can click Edit form to come
  // back. justPublished prevents a flash of the builder before the
  // delivery view mounts.
  const [view, setView] = useState('builder') // 'builder' | 'delivery'


  const w = useWindowWidth()
  const isMobile = w < 768
  const isTablet = w >= 768 && w < 1024

  // Two-step gate for new forms:
  //   1. Start screen, one page with the recipient form (name +
  //      business + email) AND the project-type cards. The designer
  //      enters everything in a single scroll, then clicks a type
  //      card to proceed; the card click validates the fields. No
  //      back button on this screen.
  //   2. Builder, full editor. A "Change type" back button on its
  //      topbar returns to the start screen (recipient pre-filled
  //      from form.settings.recipient).
  const recipient = form.settings?.recipient || {}

  if (!form.project_type) {
    return (
      <IntakeStartScreen
        initialRecipient={recipient}
        onSubmit={({ recipient: r, project_type: t }) => {
          setForm(f => ({
            ...f,
            settings: { ...(f.settings || {}), recipient: r },
            project_type: t,
            questions: defaultQuestionsFor(t),
          }))
        }}
      />
    )
  }

  // Delivery view: shown after Publish OR when reopening an active form.
  if (view === 'delivery' && form.id) {
    const designerName =
      user?.firstName ||
      (user?.name ? String(user.name).split(/\s+/)[0] : null) ||
      (authUser?.email ? String(authUser.email).split('@')[0] : 'Your designer')
    return (
      <IntakeDelivery
        form={form}
        designerName={designerName}
        onEdit={() => setView('builder')}
      />
    )
  }

  // Promise.race wrapper so a stuck Supabase request never leaves
  // the Save / Publish button spinning forever. 120s default because
  // an intake_forms row can carry a lot of JSONB (questions[],
  // branding with a data-URL logo, settings, recipient, …) and
  // upserts under Supabase backpressure can take a while.
  function withTimeout(p, ms = 120000, label = 'request') {
    return Promise.race([
      p,
      new Promise((_, rj) => setTimeout(
        () => rj(new Error(`${label} timed out after ${ms / 1000}s. Check your connection and try again.`)),
        ms,
      )),
    ])
  }

  // Resilient upsert. If a "column does not exist" error comes back
  // (e.g. the user hasn't run the workspace-scoped-content.sql or
  // the legacy client_name/client_email columns aren't on their
  // schema), strip the offending columns and retry. After up to 3
  // strips we give up and surface the error so the user gets a
  // real message instead of a silent hang.
  async function upsertFormResilient(rowIn, label) {
    let row = { ...rowIn }
    for (let attempt = 0; attempt < 3; attempt++) {
      const { error } = await withTimeout(
        supabase.from('intake_forms').upsert(row, { onConflict: 'id' }),
        120000,
        label,
      )
      if (!error) return { error: null }
      // Surface the full diagnosis so a missing column or RLS
      // issue is visible in DevTools instead of being swallowed.
      console.warn('[intake upsert]', label, attempt, {
        code: error.code, message: error.message, hint: error.hint, details: error.details,
      })
      const msg = String(error.message || '').toLowerCase()
      const match = msg.match(/could not find the '([^']+)' column/i)
        || msg.match(/column "([^"]+)" of relation "intake_forms" does not exist/i)
      if (!match) return { error }
      const missingColumn = match[1]
      if (!(missingColumn in row)) return { error }
      delete row[missingColumn]
    }
    return { error: new Error(`${label} failed after 3 retries with missing columns.`) }
  }

  // Common error messages for the patterns we actually see in
  // practice. A column-doesn't-exist points at the missing Phase 1.1
  // migration; everything else falls through to the raw message.
  function explainError(e) {
    const msg = (e?.message || '').toLowerCase()
    if (msg.includes('column') && msg.includes('does not exist')) {
      return 'Database is missing the new intake columns. Run supabase/intake-form-builder.sql in the SQL editor.'
    }
    if (msg.includes('row-level security') || msg.includes('rls')) {
      return 'Permission error. Sign out + sign in again to refresh your session.'
    }
    return e?.message || 'Could not save. Try again.'
  }

  async function handleSaveDraft() {
    if (saving) return
    if (!authUser?.id) { showToast?.('Sign in to save.', 'error'); return }
    setSaving(true)
    try {
      const id = form.id || ('intake_' + slug())
      const row = formToRow(form, authUser.id, {
        status: 'draft',
        id,
        workspace_id: form.workspace_id || workspace?.id || null,
      })
      const { error } = await upsertFormResilient(row, 'Save')
      if (error) throw error
      setForm(f => ({
        ...f,
        id,
        workspace_id: row.workspace_id,
        // Keep the computed project name in local state so any
        // surface that reads form.project_name (delivery view title,
        // post-save preview, etc.) shows the right label without
        // needing a refresh.
        project_name: row.project_name,
      }))
      // Refresh the library list so the saved draft appears as a card.
      loadIntakeForms?.()
      showToast?.('Draft saved.', 'success')
    } catch (e) {
      console.error('[intake save]', e)
      showToast?.(explainError(e), 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handlePublish() {
    // Hard-log on every click so the console always has a marker
    // even when an early guard returns. Helps diagnose "nothing
    // happens" reports.
    console.log('[intake publish] click', {
      publishing,
      hasAuth: !!authUser?.id,
      hasId: !!form.id,
      status: form.status,
      published_at: form.published_at,
    })
    // Soft guard. If publishing got stuck true from a previous run
    // (network hang, rejected promise outside the try-catch, etc.)
    // a second click resets it instead of being permanently
    // blocked. Worst case: two simultaneous upserts of the same
    // row, which Supabase handles fine via the onConflict: 'id'
    // upsert path.
    if (publishing) {
      console.warn('[intake publish] state was already publishing, resetting and continuing')
      setPublishing(false)
    }
    if (!authUser?.id) { showToast?.('Sign in to publish.', 'error'); return }
    const wasPublished = !!form.published_at
    setPublishing(true)
    try {
      const id = form.id || ('intake_' + slug())
      const row = formToRow(form, authUser.id, {
        id,
        status: 'active',
        // First publish writes a new timestamp; re-publishes (Edit
        // form → make changes → click Publish) preserve the
        // original one so the library + expiry pill keep reading
        // when the link first went out.
        published_at: form.published_at || new Date().toISOString(),
        workspace_id: form.workspace_id || workspace?.id || null,
      })
      console.log('[intake publish] upserting row id:', row.id)
      const { error } = await upsertFormResilient(row, 'Publish')
      if (error) {
        console.error('[intake publish] upsert error:', error)
        throw error
      }
      console.log('[intake publish] success, switching to delivery view')
      setForm(f => ({
        ...f,
        id,
        status: 'active',
        published_at: row.published_at,
        workspace_id: row.workspace_id,
        project_name: row.project_name,
      }))
      setView('delivery')
      loadIntakeForms?.()
      showToast?.(wasPublished ? 'Form updated.' : 'Published. Share the link with your client.', 'success')
    } catch (e) {
      console.error('[intake publish] caught', e)
      // Surface a real error message, don't let any failure mode
      // present as silent "nothing happens".
      const msg = e?.message || explainError(e) || 'Publish failed.'
      showToast?.(`Publish failed: ${msg}`, 'error')
    } finally {
      setPublishing(false)
    }
  }

  return (
    <div className="ib-root">
      <ResponsiveStyles />

      {/* Topbar, title block + expiry pill. Draft/Active status was
          removed (not useful once published) in favour of the
          expires_at countdown so the designer sees how long the
          shareable link stays alive. */}
      <header className="ib-topbar">
        <div className="ib-topbar-title">
          <h1 className="ib-topbar-name">{labelForType(form.project_type)}</h1>
          <span className="ib-topbar-eyebrow">{recipient.business_name?.trim() || 'Client intake form'}</span>
        </div>
        <ExpiryPill expiresAt={form.expires_at} />
      </header>

      <div className="ib-layout">
        <main className="ib-main">
          <nav className="ib-tabs" role="tablist">
            <TabBtn id="questions" current={activeTab} onClick={setActiveTab} icon={ClipboardDocumentListIcon}>Questions</TabBtn>
            <TabBtn id="branding"  current={activeTab} onClick={setActiveTab} icon={PaintBrushIcon}>Branding</TabBtn>
            <TabBtn id="settings"  current={activeTab} onClick={setActiveTab} icon={Cog6ToothIcon}>Settings</TabBtn>
          </nav>

          <div className="ib-pane">
            {activeTab === 'questions' && (
              <QuestionsEditor
                questions={form.questions}
                setQuestions={(q) => setForm(f => ({ ...f, questions: q }))}
                disabledSections={form.settings?.disabled_sections || []}
                setDisabledSections={(arr) => setForm(f => ({
                  ...f,
                  settings: { ...(f.settings || {}), disabled_sections: arr },
                }))}
              />
            )}
            {activeTab === 'branding' && (
              <BrandingPanel
                branding={form.branding}
                onChange={(b) => setForm(f => ({ ...f, branding: b }))}
              />
            )}
            {activeTab === 'settings' && (
              <SettingsPanel
                settings={form.settings}
                onChange={(s) => setForm(f => ({ ...f, settings: s }))}
                expiresAt={form.expires_at}
                onChangeExpiry={(d) => setForm(f => ({ ...f, expires_at: d }))}
                questions={form.questions}
              />
            )}
          </div>

          <div className="ib-actions">
            {/* Back returns to the start screen where the designer
                can edit client name, business, email, or pick a
                different project type. Confirms before discarding
                question customisations because a fresh type swap
                seeds the new type's defaults. */}
            <button
              type="button"
              onClick={() => {
                const defaults = defaultQuestionsFor(form.project_type)
                const hasEdits = JSON.stringify(form.questions) !== JSON.stringify(defaults)
                if (form.id || hasEdits) {
                  const ok = window.confirm("Go back to the start screen? You'll be able to edit the client name, business, email, and project type. Your customised questions will be replaced with the defaults if you pick a different type.")
                  if (!ok) return
                }
                setForm(f => ({ ...f, project_type: null, questions: [] }))
              }}
              className="ib-btn ib-btn-quiet ib-actions-left"
            >
              <ArrowLeftIcon style={{ width: 14, height: 14 }} />
              <span>Back</span>
            </button>
            <button onClick={handleSaveDraft} disabled={saving} className="ib-btn ib-btn-quiet">
              {saving ? 'Saving…' : 'Save draft'}
            </button>
            <button onClick={() => setPreviewOpen(true)} className="ib-btn ib-btn-quiet">
              <EyeIcon style={{ width: 14, height: 14 }} /> Preview
            </button>
            <button onClick={handlePublish} disabled={publishing} className="ib-btn ib-btn-primary">
              {publishing ? 'Publishing…' : 'Publish'}
            </button>
          </div>
        </main>

        {!isMobile && !isTablet && (
          <aside className="ib-side-preview">
            <PreviewFrame form={form} />
          </aside>
        )}
      </div>

      {(isMobile || isTablet) && !previewOpen && (
        <button onClick={() => setPreviewOpen(true)} className="ib-preview-fab" aria-label="Preview client form">
          <EyeIcon style={{ width: 16, height: 16 }} /> Preview
        </button>
      )}

      {previewOpen && <PreviewModal form={form} onClose={() => setPreviewOpen(false)} />}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────
// IntakeStartScreen, the single first-screen the designer lands on
// when they click Client Intake in the sidebar. Combines the client
// recipient form (name + business + email) and the project-type
// picker into one continuous page. No back button, they came from
// the sidebar; the sidebar is how they leave.
//
// Interaction:
//   - Designer fills the 3 fields at the top.
//   - Designer clicks a project-type card.
//   - The card click validates the fields first. If anything is
//     missing or malformed, errors render inline + the page scrolls
//     to the first invalid field. Card stays unselected until
//     validation passes.
//   - On valid pick: onSubmit({ recipient, project_type }) fires and
//     the parent transitions to the builder.
//
// The builder's "Change type" button clears project_type to bring
// the designer back to this screen with the recipient pre-filled
// from form.settings.recipient so they can edit either side.
// ────────────────────────────────────────────────────────────────────
// ── ExpiryPill ───────────────────────────────────────────────────
// Replaces the previous Draft/Active status pill in the topbar.
// Shows the form's expiry date as a small pill that flips into a
// warning tint when the link is within 3 days of dying, and into
// an expired tint when the timestamp has passed.
function ExpiryPill({ expiresAt }) {
  if (!expiresAt) {
    return (
      <span className="ib-expiry-pill ib-expiry-none" title="No expiry set, the link never expires">
        No expiry
      </span>
    )
  }
  const ts = new Date(expiresAt).getTime()
  const days = Math.ceil((ts - Date.now()) / 86400000)
  const dateStr = new Date(expiresAt).toLocaleDateString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
  })
  let tone = 'ok'
  let label = `Expires ${dateStr}`
  if (days <= 0) { tone = 'expired'; label = `Expired ${dateStr}` }
  else if (days <= 3) { tone = 'warn'; label = `Expires in ${days}d (${dateStr})` }
  return (
    <span className={`ib-expiry-pill ib-expiry-${tone}`} title={`Form expires on ${dateStr}`}>
      {label}
    </span>
  )
}

function IntakeStartScreen({ initialRecipient = {}, onSubmit }) {
  const icons = {
    website:   GlobeAltIcon,
    mobile:    Square3Stack3DIcon,
    brand:     PaintBrushIcon,
    ecommerce: SwatchIcon,
    redesign:  ArrowsUpDownIcon,
    custom:    PlusIcon,
  }

  const [clientName, setClientName]     = useState(initialRecipient.client_name   || '')
  const [businessName, setBusinessName] = useState(initialRecipient.business_name || '')
  const [clientEmail, setClientEmail]   = useState(initialRecipient.client_email  || '')
  const [errors, setErrors]             = useState({})
  const nameRef = useRef(null)
  const businessRef = useRef(null)
  const emailRef = useRef(null)

  // Always render the recipient form. When the designer arrives
  // here from the builder's Back button, the fields are simply
  // pre-filled with whatever they entered before, they can edit
  // name, business, or email in-place and pick a (new) type
  // without losing their place in the flow.
  const recipientPrefilled = false

  function validate() {
    const e = {}
    if (!clientName.trim())   e.clientName   = "Client's name is required"
    if (!businessName.trim()) e.businessName = 'Business or product name is required'
    if (clientEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clientEmail.trim())) {
      e.clientEmail = 'Please enter a valid email'
    }
    return e
  }

  function clear(k) { setErrors(prev => ({ ...prev, [k]: undefined })) }

  function handleCardClick(typeId) {
    const e = validate()
    if (Object.keys(e).length) {
      setErrors(e)
      const ref = e.clientName ? nameRef : e.businessName ? businessRef : emailRef
      ref.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      ref.current?.focus()
      return
    }
    onSubmit?.({
      recipient: {
        client_name:   clientName.trim(),
        business_name: businessName.trim(),
        client_email:  clientEmail.trim() || null,
      },
      project_type: typeId,
    })
  }

  return (
    <div className="ib-root ib-pt-root">
      <ResponsiveStyles />

      {/* No back affordance, this is the entry point from the
          sidebar; users navigate away via the sidebar itself. */}

      <main className="ib-start-stage">
        <StaggerGrid speed="normal" className="ib-start-headblock">
          <StaggerItem variant="itemUp">
            <div className="ib-pt-steps">
              <div className="ib-pt-dot" />
              <div className={`ib-pt-dot ${recipientPrefilled ? '' : 'ib-pt-dot-dim'}`} />
              <div className="ib-pt-dot ib-pt-dot-dim" />
              <span className="ib-pt-steps-label">
                {recipientPrefilled ? 'Change project type' : 'New client intake'}
              </span>
            </div>
          </StaggerItem>
          <StaggerItem variant="itemUp">
            <h1 className="ib-start-h1">
              {recipientPrefilled
                ? `Pick a project type for ${(initialRecipient.business_name || '').trim()}`
                : 'Set up a new client intake'}
            </h1>
          </StaggerItem>
          <StaggerItem variant="itemUp">
            <p className="ib-start-sub">
              {recipientPrefilled
                ? "Swap the type and we'll reseed the form with questions tuned to that work. Your recipient info stays as-is."
                : "Tell us who this brief is for, then pick the kind of project. We'll seed the form with smart questions tuned to that work."}
            </p>
          </StaggerItem>
        </StaggerGrid>

        {!recipientPrefilled && (
          <>
            <StaggerGrid speed="fast" className="ib-start-fields">
              <StaggerItem variant="itemUp">
                <SbField
                  fieldRef={nameRef}
                  label="Client's name"
                  placeholder="e.g. Amaka Okafor"
                  value={clientName}
                  onChange={(v) => { setClientName(v); if (errors.clientName) clear('clientName') }}
                  required
                  error={errors.clientName}
                />
              </StaggerItem>
              <StaggerItem variant="itemUp">
                <SbField
                  fieldRef={businessRef}
                  label="Business or product name"
                  sublabel="This is what we use throughout the brief and the kanban board."
                  placeholder="e.g. Nestiq, PocketBase, Akaani"
                  value={businessName}
                  onChange={(v) => { setBusinessName(v); if (errors.businessName) clear('businessName') }}
                  required
                  error={errors.businessName}
                />
              </StaggerItem>
              <StaggerItem variant="itemUp">
                <SbField
                  fieldRef={emailRef}
                  label="Client's email"
                  sublabel="Optional. We'll pre-fill it on their intake form so they don't retype it."
                  placeholder="amaka@business.com"
                  type="email"
                  value={clientEmail}
                  onChange={(v) => { setClientEmail(v); if (errors.clientEmail) clear('clientEmail') }}
                  error={errors.clientEmail}
                />
              </StaggerItem>
            </StaggerGrid>

            <div className="ib-start-divider">
              <span>Pick a project type</span>
            </div>
          </>
        )}

        <StaggerGrid speed="fast" className="ib-pt-grid">
          {PROJECT_TYPES.map(t => {
            const Icon = icons[t.id] || PlusIcon
            const isCustom = t.id === 'custom'
            return (
              <StaggerItem key={t.id} variant="itemUp">
                <motion.button
                  whileTap={{ scale: 0.98 }}
                  onClick={() => handleCardClick(t.id)}
                  className={`ib-pt-card${isCustom ? ' ib-pt-card-custom' : ''}`}
                  type="button"
                >
                  <span className="ib-pt-card-arrow" aria-hidden>
                    <ArrowRightIcon style={{ width: 14, height: 14 }} />
                  </span>
                  <span className="ib-pt-icon"><Icon style={{ width: 22, height: 22 }} /></span>
                  <span className="ib-pt-label">{t.label}</span>
                  <span className="ib-pt-tagline">{t.tagline}</span>
                </motion.button>
              </StaggerItem>
            )
          })}
        </StaggerGrid>

        <p className="ib-start-foot">
          {recipientPrefilled
            ? 'Pick a project type to continue.'
            : <><span className="ib-start-req">*</span> Required fields. Pick a project type to continue.</>}
        </p>
      </main>
    </div>
  )
}

function SbField({ fieldRef, label, sublabel, value, onChange, placeholder, type = 'text', required = false, error }) {
  return (
    <div className="ib-start-field" ref={fieldRef}>
      <div className="ib-start-field-head">
        <label className="ib-start-label">{label}</label>
        {required
          ? <span className="ib-start-req" aria-label="required">*</span>
          : <span className="ib-start-opt">optional</span>}
      </div>
      {sublabel && <p className="ib-start-sublabel">{sublabel}</p>}
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        className={`ib-start-input${error ? ' is-error' : ''}`}
        onChange={(e) => onChange(e.target.value)}
        autoCapitalize={type === 'email' ? 'off' : 'words'}
        autoCorrect={type === 'email' ? 'off' : undefined}
        spellCheck={type === 'email' ? false : undefined}
        inputMode={type === 'email' ? 'email' : undefined}
      />
      {error && <p className="ib-start-err">{error}</p>}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────
// Questions editor
// ────────────────────────────────────────────────────────────────────
// Sections live in code (not the DB) so they stay consistent across
// every form. Order matters, sections render top-to-bottom.
const QUESTION_SECTIONS = [
  { id: 'basics',      label: 'Project basics',       hint: 'What this project is, what it has to do.' },
  { id: 'audience',    label: 'Audience + goals',     hint: "Who it's for and what success looks like." },
  { id: 'visual',      label: 'Visual direction',     hint: 'Tone, references, and how it should feel.' },
  { id: 'constraints', label: 'Scope + constraints',  hint: 'Timeline, budget, must-haves, must-avoids.' },
]
const DEFAULT_SECTION_ID = QUESTION_SECTIONS[0].id

// Resolve which section a question belongs to. If the question
// already has a section_id, honour it. Otherwise, fall back to a
// position-based bucket so legacy forms still organise sensibly.
function resolveSectionId(q, index, total) {
  if (q.section_id) return q.section_id
  if (q.locked) return QUESTION_SECTIONS[QUESTION_SECTIONS.length - 1].id
  const buckets = QUESTION_SECTIONS.length
  const idx = Math.min(buckets - 1, Math.floor((index / Math.max(total, 1)) * buckets))
  return QUESTION_SECTIONS[idx].id
}

function QuestionsEditor({ questions, setQuestions, disabledSections = [], setDisabledSections }) {
  const disabledSet = new Set(disabledSections)
  function toggleSectionEnabled(sectionId) {
    if (!setDisabledSections) return
    if (disabledSet.has(sectionId)) {
      setDisabledSections(disabledSections.filter(id => id !== sectionId))
    } else {
      setDisabledSections([...disabledSections, sectionId])
    }
  }
  const [dragIdx, setDragIdx] = useState(null)
  const [dragOverIdx, setDragOverIdx] = useState(null)
  // Per-section expand state. Default first section open + every
  // Sections default closed. Designer expands the section they want
  // to edit. The Add-question handler still auto-opens the section
  // the new card was added to so the new question doesn't disappear
  // behind a closed header.
  const [openSections, setOpenSections] = useState({})
  const toggleSection = (id) => setOpenSections(prev => ({ ...prev, [id]: !prev[id] }))

  // Backfill section_id on every question so the rest of the editor
  // can operate on it. Idempotent, only writes if at least one
  // question is missing the field.
  useEffect(() => {
    const total = questions.length
    let needsBackfill = false
    const next = questions.map((q, i) => {
      if (q.section_id) return q
      needsBackfill = true
      return { ...q, section_id: resolveSectionId(q, i, total) }
    })
    if (needsBackfill) setQuestions(next)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questions])

  function update(i, patch) { setQuestions(questions.map((q, idx) => idx === i ? { ...q, ...patch } : q)) }
  function dup(i) {
    const q = questions[i]
    if (q.locked) return
    const copy = { ...q, id: uid('q'), order_index: q.order_index + 0.5 }
    const next = [...questions.slice(0, i + 1), copy, ...questions.slice(i + 1)]
    setQuestions(reindex(next))
  }
  function remove(i) {
    if (questions[i].locked) return
    setQuestions(reindex(questions.filter((_, idx) => idx !== i)))
  }
  function add(sectionId) {
    const lockedIdx = questions.findIndex(q => q.locked)
    const blank = {
      id: uid('q'), text: 'New question', helper_text: '',
      type: 'short_text', required: true, options: null,
      scale_low_label: null, scale_high_label: null,
      conditional_rules: [], order_index: 0, locked: false,
      section_id: sectionId || DEFAULT_SECTION_ID,
    }
    // Insert at the end of the target section so the new card lands
    // visibly within the section the designer clicked Add inside.
    // Locked closer always sits at the very end of the list.
    let next
    if (lockedIdx >= 0) {
      // Find last index in target section that isn't the locked closer.
      let insertAt = lockedIdx
      for (let i = lockedIdx - 1; i >= 0; i--) {
        if (questions[i].section_id === (sectionId || DEFAULT_SECTION_ID)) { insertAt = i + 1; break }
      }
      next = [...questions.slice(0, insertAt), blank, ...questions.slice(insertAt)]
    } else {
      // Insert at the last index of the target section.
      let insertAt = questions.length
      for (let i = questions.length - 1; i >= 0; i--) {
        if (questions[i].section_id === (sectionId || DEFAULT_SECTION_ID)) { insertAt = i + 1; break }
      }
      next = [...questions.slice(0, insertAt), blank, ...questions.slice(insertAt)]
    }
    setQuestions(reindex(next))
    // Make sure the section we added to is expanded.
    setOpenSections(prev => ({ ...prev, [sectionId || DEFAULT_SECTION_ID]: true }))
  }
  function move(fromI, toI) {
    if (fromI === toI || toI == null || fromI == null) return
    if (questions[fromI]?.locked) return
    if (questions[toI]?.locked && toI === questions.length - 1) toI = questions.length - 2
    if (toI < 0 || toI >= questions.length) return
    const next = [...questions]
    const [item] = next.splice(fromI, 1)
    next.splice(toI, 0, item)
    setQuestions(reindex(next))
  }

  // Group by section, preserving order within each. We also track
  // each question's true index in the global array so move /
  // duplicate / delete still operate against the source-of-truth
  // flat list.
  const grouped = useMemo(() => {
    const total = questions.length
    const bySection = new Map()
    for (const s of QUESTION_SECTIONS) bySection.set(s.id, [])
    questions.forEach((q, globalIdx) => {
      const sid = q.section_id || resolveSectionId(q, globalIdx, total)
      const list = bySection.get(sid) || bySection.get(DEFAULT_SECTION_ID)
      list.push({ q, globalIdx })
    })
    return bySection
  }, [questions])

  return (
    <div className="ib-qedit">
      <p className="ib-section-tip">
        Questions are grouped into sections. Click a section to expand and edit. The final question is locked because the translator relies on it.
      </p>

      {QUESTION_SECTIONS.map(section => {
        const entries = grouped.get(section.id) || []
        const isOpen = openSections[section.id] === true
        const isEnabled = !disabledSet.has(section.id)
        return (
          <div key={section.id} className={`ib-section-block ${isOpen ? 'is-open' : ''} ${isEnabled ? '' : 'is-disabled'}`}>
            <div className="ib-section-head-row">
              <button
                type="button"
                onClick={() => toggleSection(section.id)}
                className="ib-section-head"
                aria-expanded={isOpen}
                aria-controls={`ib-section-${section.id}`}
              >
                <span className="ib-section-chev" aria-hidden>
                  {isOpen ? <ChevronUpIcon style={{ width: 14, height: 14 }} /> : <ChevronDownIcon style={{ width: 14, height: 14 }} />}
                </span>
                <span className="ib-section-head-text">
                  <span className="ib-section-label">{section.label}</span>
                  <span className="ib-section-hint">{section.hint}</span>
                </span>
                <span className="ib-section-count">{entries.length}</span>
              </button>
              {/* Enable/disable toggle. Disabled sections persist
                  under form.settings.disabled_sections and the
                  public client form skips every question whose
                  section_id matches. */}
              <button
                type="button"
                role="switch"
                aria-checked={isEnabled}
                aria-label={isEnabled ? `Disable section ${section.label}` : `Enable section ${section.label}`}
                onClick={(e) => { e.stopPropagation(); toggleSectionEnabled(section.id); }}
                className={`ib-section-switch ${isEnabled ? 'is-on' : ''}`}
                title={isEnabled ? 'On, clients will see this section' : 'Off, clients will not see this section'}
              >
                <span className="ib-section-switch-knob" />
              </button>
            </div>

            {isOpen && (
              <div id={`ib-section-${section.id}`} className="ib-section-body">
                {entries.length === 0 && (
                  <p className="ib-section-empty">No questions in this section yet.</p>
                )}
                {entries.map(({ q, globalIdx }) => (
                  <QuestionCard
                    key={q.id}
                    q={q}
                    index={globalIdx}
                    total={questions.length}
                    others={questions}
                    onChange={(patch) => update(globalIdx, patch)}
                    onDuplicate={() => dup(globalIdx)}
                    onDelete={() => remove(globalIdx)}
                    onMoveUp={() => move(globalIdx, globalIdx - 1)}
                    onMoveDown={() => move(globalIdx, globalIdx + 1)}
                    dragOverIdx={dragOverIdx}
                    onDragStart={() => setDragIdx(globalIdx)}
                    onDragOver={() => setDragOverIdx(globalIdx)}
                    onDrop={() => { move(dragIdx, globalIdx); setDragIdx(null); setDragOverIdx(null) }}
                    onDragEnd={() => { setDragIdx(null); setDragOverIdx(null) }}
                  />
                ))}
                <button onClick={() => add(section.id)} className="ib-add-btn">
                  <PlusIcon style={{ width: 14, height: 14 }} /> Add question to {section.label}
                </button>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function reindex(list) { return list.map((q, i) => ({ ...q, order_index: i })) }

function QuestionCard({
  q, index, total, others,
  onChange, onDuplicate, onDelete, onMoveUp, onMoveDown,
  dragOverIdx, onDragStart, onDragOver, onDrop, onDragEnd,
}) {
  const [logicOpen, setLogicOpen] = useState(false)
  function patchOptions(opts) { onChange({ options: opts }) }

  return (
    <div
      className={`ib-qcard ${q.locked ? 'is-locked' : ''} ${dragOverIdx === index ? 'is-drop-target' : ''}`}
      draggable={!q.locked}
      onDragStart={(e) => { if (q.locked) { e.preventDefault(); return } onDragStart() }}
      onDragOver={(e) => { e.preventDefault(); onDragOver() }}
      onDrop={(e) => { e.preventDefault(); onDrop() }}
      onDragEnd={onDragEnd}
    >
      <div className="ib-qcard-head">
        <span className="ib-qcard-num">{String(index + 1).padStart(2, '0')}</span>
        <input
          className="ib-qcard-text"
          value={q.text}
          onChange={e => onChange({ text: e.target.value })}
          placeholder="Question text"
          disabled={q.locked}
        />
        <div className="ib-qcard-actions">
          <IconBtn onClick={onMoveUp} disabled={index === 0 || q.locked} title="Move up">
            <ChevronUpIcon style={{ width: 14, height: 14 }} />
          </IconBtn>
          <IconBtn onClick={onMoveDown} disabled={index >= total - 1 || q.locked} title="Move down">
            <ChevronDownIcon style={{ width: 14, height: 14 }} />
          </IconBtn>
          <IconBtn onClick={onDuplicate} disabled={q.locked} title="Duplicate">
            <DocumentDuplicateIcon style={{ width: 14, height: 14 }} />
          </IconBtn>
          <IconBtn onClick={onDelete} disabled={q.locked} title="Delete" danger>
            <TrashIcon style={{ width: 14, height: 14 }} />
          </IconBtn>
        </div>
      </div>

      <input
        className="ib-qcard-helper"
        value={q.helper_text || ''}
        onChange={e => onChange({ helper_text: e.target.value })}
        placeholder="Helper text (optional)"
        disabled={q.locked}
      />

      <div className="ib-qcard-row">
        <label className="ib-qcard-field">
          <span className="ib-qcard-field-label">Type</span>
          <select
            value={q.type}
            disabled={q.locked}
            onChange={e => {
              const newType = e.target.value
              const next = { type: newType }
              if (['single_choice', 'multi_choice'].includes(newType) && !q.options?.length) {
                next.options = ['Option A', 'Option B', 'Option C']
              }
              if (newType === 'scale') {
                next.scale_low_label = q.scale_low_label || 'Not at all'
                next.scale_high_label = q.scale_high_label || 'Completely'
              }
              onChange(next)
            }}
            className="ib-select"
          >
            {QUESTION_TYPES.map(t => (<option key={t.id} value={t.id}>{t.label}</option>))}
          </select>
        </label>
        <label className="ib-qcard-field ib-qcard-field-required">
          <span className="ib-qcard-field-label">Required</span>
          <ToggleSwitch checked={!!q.required} onChange={(v) => onChange({ required: v })} disabled={q.locked} />
        </label>
        <button
          className={`ib-qcard-logic ${q.conditional_rules?.length ? 'has-rules' : ''}`}
          onClick={() => setLogicOpen(o => !o)}
          disabled={q.locked || index === 0}
        >
          Logic
          {q.conditional_rules?.length ? <span className="ib-logic-count">{q.conditional_rules.length}</span> : null}
        </button>
      </div>

      {(q.type === 'single_choice' || q.type === 'multi_choice') && (
        <OptionsEditor
          value={Array.isArray(q.options) ? q.options : []}
          onChange={patchOptions}
          disabled={q.locked}
        />
      )}
      {q.type === 'scale' && (
        <div className="ib-qcard-row" style={{ gap: 10 }}>
          <label className="ib-qcard-field" style={{ flex: 1 }}>
            <span className="ib-qcard-field-label">Low (1) label</span>
            <input className="ib-input" value={q.scale_low_label || ''} onChange={e => onChange({ scale_low_label: e.target.value })} placeholder="e.g. Not at all" disabled={q.locked} />
          </label>
          <label className="ib-qcard-field" style={{ flex: 1 }}>
            <span className="ib-qcard-field-label">High (10) label</span>
            <input className="ib-input" value={q.scale_high_label || ''} onChange={e => onChange({ scale_high_label: e.target.value })} placeholder="e.g. Completely" disabled={q.locked} />
          </label>
        </div>
      )}

      {logicOpen && !q.locked && (
        <LogicEditor
          rules={q.conditional_rules || []}
          others={others.filter((_, i) => i < index)}
          onChange={(rules) => onChange({ conditional_rules: rules })}
        />
      )}

      {q.locked && (
        <div className="ib-qcard-locked-note">
          This is the final question on every form. The translator relies on it, so it can't be removed or moved.
        </div>
      )}
    </div>
  )
}

function OptionsEditor({ value, onChange, disabled }) {
  function setAt(i, v) { onChange(value.map((o, idx) => idx === i ? v : o)) }
  function addOpt() { onChange([...value, 'Option ' + (value.length + 1)]) }
  function removeAt(i) { onChange(value.filter((_, idx) => idx !== i)) }
  return (
    <div className="ib-options">
      {value.map((opt, i) => (
        <div key={i} className="ib-option-row">
          <input className="ib-input" value={opt} onChange={e => setAt(i, e.target.value)} disabled={disabled} />
          <IconBtn onClick={() => removeAt(i)} disabled={disabled || value.length <= 2} title="Remove option">
            <XMarkIcon style={{ width: 12, height: 12 }} />
          </IconBtn>
        </div>
      ))}
      <button onClick={addOpt} className="ib-add-option" disabled={disabled}>
        <PlusIcon style={{ width: 12, height: 12 }} /> Option
      </button>
    </div>
  )
}

function LogicEditor({ rules, others, onChange }) {
  const r = rules[0] || { depends_on_qid: '', operator: 'equals', value: '' }
  function set(patch) {
    const next = { ...r, ...patch }
    if (!next.depends_on_qid) { onChange([]); return }
    onChange([next])
  }
  return (
    <div className="ib-logic-block">
      <div className="ib-logic-row">
        <span className="ib-logic-prefix">Show this question if</span>
        <select className="ib-select" value={r.depends_on_qid} onChange={e => set({ depends_on_qid: e.target.value })}>
          <option value="">Select a question</option>
          {others.map((q, i) => (
            <option key={q.id} value={q.id}>{String(i + 1).padStart(2, '0')} · {q.text.slice(0, 38)}{q.text.length > 38 ? '…' : ''}</option>
          ))}
        </select>
        <select className="ib-select" value={r.operator} onChange={e => set({ operator: e.target.value })}>
          <option value="equals">equals</option>
          <option value="contains">contains</option>
          <option value="not_equals">does not equal</option>
        </select>
        <input className="ib-input" value={r.value} onChange={e => set({ value: e.target.value })} placeholder="Value" />
      </div>
      {rules.length > 0 && (
        <button className="ib-link-btn" onClick={() => onChange([])}>Clear rule</button>
      )}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────
// Branding panel
// ────────────────────────────────────────────────────────────────────
function BrandingPanel({ branding, onChange }) {
  const b = branding || {}
  function set(patch) { onChange({ ...b, ...patch }) }

  async function onLogoChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => set({ logo_url: reader.result })
    reader.readAsDataURL(file)
  }

  return (
    <div className="ib-panel">
      <div className="ib-field">
        <label className="ib-label">Studio logo</label>
        <div className="ib-logo-row">
          <div className="ib-logo-preview">
            {b.logo_url ? <img src={b.logo_url} alt="Logo" /> : <span>No logo yet</span>}
          </div>
          <label className="ib-btn ib-btn-quiet">
            <ArrowUpTrayIcon style={{ width: 14, height: 14 }} />
            <span>Upload</span>
            <input type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" onChange={onLogoChange} style={{ display: 'none' }} />
          </label>
          {b.logo_url && (
            <button onClick={() => set({ logo_url: null })} className="ib-btn ib-btn-quiet">
              <TrashIcon style={{ width: 14, height: 14 }} /> Remove
            </button>
          )}
        </div>
      </div>

      <div className="ib-field">
        <label className="ib-label">Primary colour</label>
        <p className="ib-help">Tints the client form, the delivery email, and the progress bar.</p>
        <div className="ib-color-row">
          <input type="color" value={b.primary_color || '#8B5CF6'} onChange={e => set({ primary_color: e.target.value })} className="ib-color-swatch" />
          <input type="text" value={b.primary_color || ''} onChange={e => set({ primary_color: e.target.value })} placeholder="#8B5CF6" className="ib-input" style={{ maxWidth: 140 }} />
        </div>
      </div>

      <CharLimitField label="Welcome message" help="Shown to the client at the start of the form." value={b.welcome_message || ''} max={200} onChange={(v) => set({ welcome_message: v })} />
      <CharLimitField label="Completion message" help="Shown to the client after they submit." value={b.completion_message || ''} max={200} onChange={(v) => set({ completion_message: v })} />
    </div>
  )
}

function CharLimitField({ label, help, value, max, onChange }) {
  return (
    <div className="ib-field">
      <label className="ib-label">{label}</label>
      {help && <p className="ib-help">{help}</p>}
      <textarea className="ib-textarea" value={value} onChange={e => onChange(e.target.value.slice(0, max))} rows={3} maxLength={max} />
      <div className="ib-char-counter">{value.length}/{max}</div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────
// Settings panel
// ────────────────────────────────────────────────────────────────────
function SettingsPanel({ settings, onChange, expiresAt, onChangeExpiry, questions }) {
  const s = settings || {}
  function set(patch) { onChange({ ...s, ...patch }) }
  const est = estimatedMinutes(questions)
  const langs = [
    { id: 'en', label: 'English' },
    { id: 'fr', label: 'French' },
    { id: 'es', label: 'Spanish' },
    { id: 'pt', label: 'Portuguese' },
  ]
  return (
    <div className="ib-panel">
      <div className="ib-field">
        <label className="ib-label">Expiry date</label>
        <p className="ib-help">After this date, the link is dead. Leave blank for no expiry.</p>
        <input type="date" value={expiresAt ? new Date(expiresAt).toISOString().slice(0, 10) : ''} onChange={e => onChangeExpiry(e.target.value ? new Date(e.target.value).toISOString() : null)} className="ib-input" style={{ maxWidth: 220 }} />
      </div>

      <SettingToggle label="Allow file uploads" help="Turn off to disable reference + file upload questions globally." checked={s.file_uploads_enabled !== false} onChange={v => set({ file_uploads_enabled: v })} />
      <SettingToggle label="Show progress bar on the client form" checked={s.show_progress_bar !== false} onChange={v => set({ show_progress_bar: v })} />
      <SettingToggle label="Send a confirmation email to the client on submit" checked={!!s.send_confirmation_email} onChange={v => set({ send_confirmation_email: v })} />
      <SettingToggle label="Notify me by email when a submission lands" checked={s.send_designer_notification !== false} onChange={v => set({ send_designer_notification: v })} />

      <div className="ib-field">
        <label className="ib-label">Language</label>
        <p className="ib-help">Translates the client form chrome (system labels), not your custom question text.</p>
        <select value={s.language || 'en'} onChange={e => set({ language: e.target.value })} className="ib-select" style={{ maxWidth: 220 }}>
          {langs.map(l => (<option key={l.id} value={l.id}>{l.label}</option>))}
        </select>
      </div>

      <div className="ib-est">
        <span className="ib-est-num">{est}</span>
        <span className="ib-est-label">min estimated client completion time</span>
        <span className="ib-est-formula">required × 45s ÷ 60 → {est} min</span>
      </div>
    </div>
  )
}

function SettingToggle({ label, help, checked, onChange }) {
  return (
    <div className="ib-toggle-row">
      <div>
        <div className="ib-toggle-label">{label}</div>
        {help && <div className="ib-help">{help}</div>}
      </div>
      <ToggleSwitch checked={checked} onChange={onChange} />
    </div>
  )
}

function ToggleSwitch({ checked, onChange, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange?.(!checked)}
      className={`ib-switch ${checked ? 'is-on' : ''}`}
    >
      <span className="ib-switch-knob" />
    </button>
  )
}

// ────────────────────────────────────────────────────────────────────
// Preview
// ────────────────────────────────────────────────────────────────────
function PreviewFrame({ form }) {
  return (
    <div className="ib-side-preview-inner">
      <div className="ib-side-preview-head">
        <span>Live preview</span>
        <span className="ib-side-preview-hint">how the client will see it</span>
      </div>
      <ClientFormMockup form={form} />
    </div>
  )
}
function PreviewModal({ form, onClose }) {
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="ib-modal-backdrop" onClick={onClose}>
      <div className="ib-modal" onClick={e => e.stopPropagation()}>
        <header className="ib-modal-head">
          <span>Preview</span>
          <button onClick={onClose} className="ib-icon-only" aria-label="Close">
            <XMarkIcon style={{ width: 16, height: 16 }} />
          </button>
        </header>
        <ClientFormMockup form={form} />
      </div>
    </div>
  )
}

function ClientFormMockup({ form }) {
  const [step, setStep] = useState(0)
  const visible = useMemo(() => visibleQuestions(form.questions, {}), [form.questions])
  const total = visible.length
  const safeIdx = Math.min(step, Math.max(0, total - 1))
  const q = visible[safeIdx]
  const accent = form.branding?.primary_color || '#8B5CF6'
  const progress = total ? (safeIdx + 1) / total : 0
  const showProgress = form.settings?.show_progress_bar !== false

  if (!total) {
    return (
      <div className="ib-mockup" style={{ ['--accent']: accent }}>
        <p className="ib-mockup-empty">Add at least one question to preview.</p>
      </div>
    )
  }
  return (
    <div className="ib-mockup" style={{ ['--accent']: accent }}>
      {showProgress && <div className="ib-mockup-progress"><div style={{ width: `${progress * 100}%` }} /></div>}
      <div className="ib-mockup-pad">
        {form.branding?.logo_url && <img src={form.branding.logo_url} alt="" className="ib-mockup-logo" />}
        {step === 0 && form.branding?.welcome_message && (
          <p className="ib-mockup-welcome">{form.branding.welcome_message}</p>
        )}
        <div className="ib-mockup-counter">Question {safeIdx + 1} of {total}</div>
        <h3 className="ib-mockup-q">{q.text || '(empty)'}</h3>
        {q.helper_text && <p className="ib-mockup-helper">{q.helper_text}</p>}
        <PreviewInput q={q} />
        <div className="ib-mockup-actions">
          <button className="ib-mockup-back" disabled={safeIdx === 0} onClick={() => setStep(Math.max(0, safeIdx - 1))}>Back</button>
          <button className="ib-mockup-continue" onClick={() => setStep(Math.min(total - 1, safeIdx + 1))}>
            {safeIdx === total - 1 ? 'Submit' : 'Continue'}
          </button>
        </div>
      </div>
    </div>
  )
}
function PreviewInput({ q }) {
  switch (q.type) {
    case 'long_text':
      return <textarea className="ib-mockup-input" rows={4} placeholder="Type your answer…" />
    case 'single_choice':
    case 'multi_choice':
      return (
        <div className="ib-mockup-pills">
          {(q.options || []).map((o, i) => (<button key={i} className="ib-mockup-pill">{o}</button>))}
        </div>
      )
    case 'scale':
      return (
        <div className="ib-mockup-scale">
          <div className="ib-mockup-scale-labels">
            <span>{q.scale_low_label || '1'}</span>
            <span>{q.scale_high_label || '10'}</span>
          </div>
          <div className="ib-mockup-scale-bar">
            {[1,2,3,4,5,6,7,8,9,10].map(n => <button key={n}>{n}</button>)}
          </div>
        </div>
      )
    case 'reference_upload':
    case 'file_upload':
      return (
        <div className="ib-mockup-drop">
          <ArrowUpTrayIcon style={{ width: 18, height: 18 }} />
          <span>Drag + drop or tap to browse</span>
          <span className="ib-mockup-drop-sub">{q.type === 'reference_upload' ? 'JPG · PNG · WEBP · PDF · up to 5' : 'Any common file type'}</span>
        </div>
      )
    default:
      return <input className="ib-mockup-input" type="text" placeholder="Type your answer…" />
  }
}

function PublishSuccessModal({ url, onClose }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1600) } catch {}
  }
  return (
    <div className="ib-modal-backdrop" onClick={onClose}>
      <div className="ib-modal ib-modal-narrow" onClick={e => e.stopPropagation()}>
        <header className="ib-modal-head">
          <span>Form published</span>
          <button onClick={onClose} className="ib-icon-only" aria-label="Close">
            <XMarkIcon style={{ width: 16, height: 16 }} />
          </button>
        </header>
        <div style={{ padding: '12px 18px 18px' }}>
          <p className="ib-help" style={{ marginBottom: 12 }}>Share this link with your client. They can fill it out on any device.</p>
          <div className="ib-share-row">
            <LinkIcon style={{ width: 14, height: 14, color: 'var(--color-text-muted)', flexShrink: 0 }} />
            <input value={url} readOnly className="ib-input" style={{ fontSize: 13 }} />
            <button onClick={copy} className="ib-btn ib-btn-primary" style={{ flexShrink: 0 }}>
              {copied ? <><CheckIcon style={{ width: 14, height: 14 }} /> Copied</> : 'Copy link'}
            </button>
          </div>
          <p className="ib-help" style={{ marginTop: 14 }}>The richer delivery options (email + QR code + status panel) land in Phase 2.</p>
        </div>
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────
function freshForm() {
  return { id: null, project_type: null, questions: [], branding: defaultBranding(), settings: defaultSettings(), status: 'draft', expires_at: null }
}
function labelForType(id) { return PROJECT_TYPES.find(t => t.id === id)?.label || 'Untitled form' }
function formToRow(form, userId, override = {}) {
  // Compose a friendly project_name from the recipient when present
  // so the library card reads "Nestiq - Website" rather than just
  // "Website". Falls back to the type label for legacy drafts.
  const business = String(form.settings?.recipient?.business_name || '').trim()
  const typeLabel = labelForType(form.project_type)
  const projectName = business ? `${business} - ${typeLabel}` : typeLabel
  return {
    id: override.id ?? form.id,
    user_id: userId,
    workspace_id: override.workspace_id ?? form.workspace_id ?? null,
    project_name: projectName,
    project_type: form.project_type,
    questions: form.questions,
    branding: form.branding,
    settings: form.settings,
    expires_at: form.expires_at,
    published_at: override.published_at ?? form.published_at,
    status: override.status ?? form.status,
    // Mirror the recipient onto the legacy top-level columns so the
    // existing Project Library card (which still reads form.client_name)
    // surfaces a name without needing a code change.
    client_name:   form.settings?.recipient?.client_name   ?? null,
    client_email:  form.settings?.recipient?.client_email  ?? null,
    sections: [],
  }
}
function visibleQuestions(questions, answers) {
  return (questions || []).filter(q => {
    const rules = q.conditional_rules || []
    if (!rules.length) return true
    return rules.every(r => {
      const v = answers[r.depends_on_qid]
      if (v == null || v === '') return false
      if (r.operator === 'equals')     return String(v).toLowerCase() === String(r.value).toLowerCase()
      if (r.operator === 'not_equals') return String(v).toLowerCase() !== String(r.value).toLowerCase()
      if (r.operator === 'contains')   return String(v).toLowerCase().includes(String(r.value).toLowerCase())
      return true
    })
  })
}

function useWindowWidth() {
  const [w, setW] = useState(() => typeof window !== 'undefined' ? window.innerWidth : 1280)
  useEffect(() => {
    function onResize() { setW(window.innerWidth) }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return w
}

function TabBtn({ id, current, onClick, icon: Icon, children }) {
  const active = current === id
  return (
    <button role="tab" aria-selected={active} className={`ib-tab ${active ? 'is-active' : ''}`} onClick={() => onClick(id)}>
      <Icon style={{ width: 14, height: 14 }} /> {children}
    </button>
  )
}

function IconBtn({ children, onClick, disabled, title, danger }) {
  return (
    <button onClick={onClick} disabled={disabled} title={title} className={`ib-icon-only ${danger ? 'is-danger' : ''}`} type="button">
      {children}
    </button>
  )
}

// ────────────────────────────────────────────────────────────────────
// Styles, single block scoped to .ib-root via prefix class names.
// ────────────────────────────────────────────────────────────────────
function ResponsiveStyles() {
  return (
    <style>{`
      /* AppShell wraps every page in a flex column main with
         height: 100dvh + overflow: hidden. The builder needs a
         definite height to hand down so .ib-pane's overflow-y: auto
         actually engages. Using height: 100% (of the AppShell main)
         gives us that. The legacy min-height: 100dvh let content
         push the root past the parent and AppShell would clip,
         making the whole page un-scrollable. */
      .ib-root { font-family: 'Urbanist', sans-serif; background: var(--color-bg); color: var(--color-text); height: 100%; min-height: 100dvh; display: flex; flex-direction: column; }
      .ib-topbar { display: flex; align-items: center; gap: 14px; padding: 18px 28px; border-bottom: 1px solid var(--color-border); background: var(--color-bg); flex-shrink: 0; }
      .ib-topbar-back {
        display: inline-flex; align-items: center; gap: 6px;
        padding: 6px 11px;
        background: transparent;
        border: 1px solid var(--color-border);
        border-radius: 9px;
        color: var(--color-text-soft);
        font: 600 12px 'Urbanist', sans-serif;
        cursor: pointer;
        transition: border-color 0.15s ease, color 0.15s ease;
        flex-shrink: 0;
      }
      .ib-topbar-back:hover { border-color: var(--color-text-soft); color: var(--color-text); }
      .ib-topbar-title { display: flex; flex-direction: column; gap: 3px; flex: 1; min-width: 0; }
      .ib-topbar-name { font: 800 22px/1.15 'Urbanist', sans-serif; letter-spacing: -0.02em; color: var(--color-text); margin: 0; }
      .ib-topbar-eyebrow { font: 700 10px 'JetBrains Mono', monospace; letter-spacing: 0.1em; text-transform: uppercase; color: var(--color-text-muted); }

      /* ── Page 0 (designer-side intro) ───────────────────────── */
      .ib-intro-headblock { display: flex; flex-direction: column; align-items: flex-start; width: 100%; }
      .ib-intro-form { width: 100%; max-width: 480px; display: flex; flex-direction: column; gap: 18px; }
      .ib-intro-field { display: flex; flex-direction: column; gap: 5px; }
      .ib-intro-field-head { display: flex; align-items: center; gap: 6px; }
      .ib-intro-label { font: 600 14px 'Urbanist', sans-serif; color: var(--color-text); }
      .ib-intro-req { color: var(--color-accent); font-size: 14px; line-height: 1; }
      .ib-intro-opt { font: 600 11px 'JetBrains Mono', monospace; letter-spacing: 0.05em; color: var(--color-text-muted); text-transform: lowercase; }
      .ib-intro-sub { font: 500 13px 'Urbanist', sans-serif; color: var(--color-text-muted); margin: 0; line-height: 1.5; }
      .ib-intro-input {
        width: 100%;
        padding: 12px 16px;
        background: var(--color-surface);
        border: 1.5px solid var(--color-border);
        border-radius: 12px;
        color: var(--color-text);
        font: 500 15px 'Urbanist', sans-serif;
        outline: none;
        box-sizing: border-box;
        transition: border-color 0.18s ease, background 0.18s ease;
      }
      .ib-intro-input:focus { border-color: var(--color-accent); background: var(--color-bg); }
      .ib-intro-input.is-error { border-color: #EF4444; }
      .ib-intro-err { font: 500 12px 'Urbanist', sans-serif; color: #EF4444; margin: 4px 0 0; }
      .ib-intro-continue {
        width: 100%;
        padding: 14px 24px;
        margin-top: 4px;
        background: var(--color-accent);
        color: white;
        border: none;
        border-radius: 12px;
        font: 700 16px 'Urbanist', sans-serif;
        cursor: pointer;
        display: inline-flex; align-items: center; justify-content: center; gap: 8px;
        transition: filter 0.18s ease, transform 0.05s ease;
        min-height: 48px;
      }
      .ib-intro-continue:hover { filter: brightness(0.94); }
      .ib-intro-continue:active { transform: translateY(1px); }
      .ib-intro-foot { font: 600 11px 'JetBrains Mono', monospace; color: var(--color-text-muted); text-align: center; margin: 4px 0 0; letter-spacing: 0.02em; }

      /* ── IntakeStartScreen, recipient form + type picker ──── */
      .ib-start-stage {
        /* Full-bleed inside AppShell's bounded main. Content blocks
           below the stage keep their own readable max-widths, but
           the stage itself fills the viewport so the layout doesn't
           feel cramped against either edge. */
        flex: 1;
        overflow-y: auto;
        display: flex; flex-direction: column;
        padding: 56px 56px 72px;
        width: 100%;
        box-sizing: border-box;
        gap: 40px;
      }
      /* Each inner block stays readable. Head block + fields + cards
         are independent strips so the cards can run wider than the
         text columns. */
      .ib-start-headblock { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; max-width: 720px; }
      .ib-start-h1 {
        font-size: clamp(28px, 4vw, 38px);
        font-weight: 800;
        letter-spacing: -0.03em;
        color: var(--color-text);
        margin: 12px 0 6px;
        line-height: 1.15;
      }
      .ib-start-sub {
        font-size: 15px;
        color: var(--color-text-muted);
        margin: 0;
        line-height: 1.6;
        max-width: 520px;
      }

      .ib-start-fields { display: flex; flex-direction: column; gap: 18px; max-width: 560px; }
      .ib-start-field { display: flex; flex-direction: column; gap: 5px; scroll-margin-top: 80px; }
      .ib-start-field-head { display: flex; align-items: center; gap: 6px; }
      .ib-start-label { font: 600 14px 'Urbanist', sans-serif; color: var(--color-text); }
      .ib-start-req { color: var(--color-accent); font-size: 14px; line-height: 1; }
      .ib-start-opt { font: 600 11px 'JetBrains Mono', monospace; letter-spacing: 0.05em; color: var(--color-text-muted); text-transform: lowercase; }
      .ib-start-sublabel { font: 500 13px 'Urbanist', sans-serif; color: var(--color-text-muted); margin: 0; line-height: 1.5; }
      .ib-start-input {
        width: 100%;
        padding: 12px 16px;
        background: var(--color-surface);
        border: 1.5px solid var(--color-border);
        border-radius: 12px;
        color: var(--color-text);
        font: 500 15px 'Urbanist', sans-serif;
        outline: none;
        box-sizing: border-box;
        transition: border-color 0.18s ease, background 0.18s ease;
      }
      .ib-start-input:focus { border-color: var(--color-accent); background: var(--color-bg); }
      .ib-start-input.is-error { border-color: #EF4444; }
      .ib-start-err { font: 500 12px 'Urbanist', sans-serif; color: #EF4444; margin: 4px 0 0; }

      .ib-start-divider {
        display: flex; align-items: center; gap: 14px;
        font: 700 11px 'JetBrains Mono', monospace;
        letter-spacing: 0.1em; text-transform: uppercase;
        color: var(--color-text-muted);
        margin: 4px 0 0;
      }
      .ib-start-divider::before, .ib-start-divider::after {
        content: '';
        flex: 1;
        height: 1px;
        background: var(--color-border);
      }

      .ib-start-foot {
        font: 600 11px 'JetBrains Mono', monospace;
        color: var(--color-text-muted);
        text-align: center;
        margin: 4px 0 0;
        letter-spacing: 0.02em;
      }
      .ib-start-foot .ib-start-req { font-size: 11px; margin-right: 2px; }

      @media (max-width: 1023px) {
        .ib-start-stage { padding: 40px 28px 60px; gap: 28px; }
      }
      @media (max-width: 639px) {
        .ib-start-stage { padding: 28px 16px 56px; gap: 22px; }
        .ib-start-h1 { font-size: 26px; }
      }
      .ib-status-pill { font-size: 10px; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase; padding: 3px 10px; border-radius: 100px; background: var(--color-surface); color: var(--color-text-soft); border: 1px solid var(--color-border); }
      .ib-status-pill.ib-status-active { background: rgba(16,185,129,0.12); color: #047857; border-color: rgba(16,185,129,0.35); }

      .ib-expiry-pill {
        font: 700 11px 'JetBrains Mono', monospace;
        letter-spacing: 0.04em;
        padding: 5px 11px;
        border-radius: 100px;
        background: var(--color-surface);
        color: var(--color-text-soft);
        border: 1px solid var(--color-border);
        white-space: nowrap;
        flex-shrink: 0;
      }
      .ib-expiry-pill.ib-expiry-ok      { color: var(--color-text); }
      .ib-expiry-pill.ib-expiry-warn    { background: rgba(217,119,6,0.10); color: #b45309; border-color: rgba(217,119,6,0.30); }
      .ib-expiry-pill.ib-expiry-expired { background: rgba(220,38,38,0.10); color: #b91c1c; border-color: rgba(220,38,38,0.30); }
      .ib-expiry-pill.ib-expiry-none    { color: var(--color-text-muted); font-style: normal; }

      /* Both .ib-layout (flex item) and .ib-main (grid item) need
         min-height: 0 explicitly. Without it, browsers treat them
         as min-content tall, which lets .ib-pane's content push
         past the bounded root and AppShell's overflow:hidden
         clips everything. With min-height: 0 the flex/grid chain
         hands a definite bounded height down to .ib-pane and its
         overflow-y: auto finally engages. */
      .ib-layout { flex: 1; display: grid; grid-template-columns: minmax(0, 1fr) 460px; gap: 0; min-height: 0; }
      .ib-main { display: flex; flex-direction: column; min-width: 0; min-height: 0; }

      .ib-tabs { display: flex; gap: 4px; padding: 14px 24px 0; background: var(--color-bg); border-bottom: 1px solid var(--color-border); }
      .ib-tab { display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; background: transparent; border: 1px solid transparent; border-bottom: none; border-radius: 9px 9px 0 0; font: 600 13px 'Urbanist', sans-serif; color: var(--color-text-soft); cursor: pointer; position: relative; top: 1px; }
      .ib-tab.is-active { background: var(--color-surface); border-color: var(--color-border); color: var(--color-text); }
      .ib-pane { flex: 1; overflow-y: auto; padding: 22px 24px 120px; background: var(--color-surface); }

      .ib-section-tip { font-size: 12px; color: var(--color-text-muted); margin: 0 0 14px; }

      /* ── Collapsible section block ──────────────────────────── */
      .ib-section-block {
        background: var(--color-card);
        border: 1px solid var(--color-border);
        border-radius: 12px;
        margin-bottom: 12px;
        overflow: hidden;
        transition: border-color 0.15s ease;
      }
      .ib-section-block.is-open { border-color: var(--color-border-strong, var(--color-border)); }
      .ib-section-block.is-disabled .ib-section-head-text { opacity: 0.55; }
      .ib-section-block.is-disabled .ib-section-body { opacity: 0.6; pointer-events: none; }

      .ib-section-head-row { display: flex; align-items: center; padding-right: 14px; gap: 8px; }
      .ib-section-head-row .ib-section-head { flex: 1; }
      .ib-section-switch {
        position: relative;
        width: 36px; height: 20px;
        background: var(--color-border);
        border: 1px solid var(--color-border-strong, var(--color-border));
        border-radius: 100px;
        cursor: pointer;
        flex-shrink: 0;
        padding: 0;
        transition: background 0.18s ease, border-color 0.18s ease;
      }
      .ib-section-switch.is-on { background: var(--color-accent); border-color: var(--color-accent); }
      .ib-section-switch-knob {
        position: absolute;
        top: 1px; left: 1px;
        width: 16px; height: 16px;
        background: white;
        border-radius: 50%;
        box-shadow: 0 1px 2px rgba(0,0,0,0.18);
        transition: transform 0.18s ease;
      }
      .ib-section-switch.is-on .ib-section-switch-knob { transform: translateX(16px); }
      .ib-section-head {
        display: flex; align-items: center; gap: 12px;
        width: 100%;
        padding: 14px 16px;
        background: transparent;
        border: none;
        cursor: pointer;
        font-family: inherit;
        text-align: left;
        transition: background 0.15s ease;
      }
      .ib-section-head:hover { background: var(--color-surface); }
      .ib-section-chev {
        display: inline-flex; align-items: center; justify-content: center;
        width: 24px; height: 24px;
        background: var(--color-surface);
        border-radius: 6px;
        color: var(--color-text-soft);
        flex-shrink: 0;
      }
      .ib-section-head-text { flex: 1; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
      .ib-section-label { font: 800 14px 'Urbanist', sans-serif; color: var(--color-text); letter-spacing: -0.01em; }
      .ib-section-hint { font: 500 12px 'Urbanist', sans-serif; color: var(--color-text-muted); }
      .ib-section-count {
        font: 700 11px 'JetBrains Mono', monospace;
        color: var(--color-text-soft);
        background: var(--color-surface);
        padding: 4px 10px;
        border-radius: 100px;
        min-width: 28px;
        text-align: center;
        flex-shrink: 0;
      }
      .ib-section-body {
        padding: 14px 16px;
        border-top: 1px solid var(--color-border);
        background: var(--color-surface);
      }
      .ib-section-body .ib-qcard:last-of-type { margin-bottom: 14px; }
      .ib-section-empty {
        font: 500 12px 'Urbanist', sans-serif;
        color: var(--color-text-muted);
        margin: 12px 0;
        padding: 10px 12px;
        background: var(--color-surface);
        border: 1px dashed var(--color-border);
        border-radius: 8px;
        text-align: center;
      }

      .ib-qcard { background: var(--color-card); border: 1px solid var(--color-border); border-radius: 12px; padding: 14px; margin-bottom: 12px; transition: border-color 0.15s; }
      .ib-qcard.is-locked { background: var(--color-surface); opacity: 0.88; }
      .ib-qcard.is-drop-target { border-color: var(--color-accent); }

      .ib-qcard-head { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
      .ib-qcard-num { font: 700 11px 'JetBrains Mono', monospace; color: var(--color-text-muted); padding: 4px 8px; background: var(--color-surface); border-radius: 6px; flex-shrink: 0; }
      .ib-qcard-text { flex: 1; min-width: 0; font: 700 15px 'Urbanist', sans-serif; background: transparent; border: none; outline: none; color: var(--color-text); }
      .ib-qcard-text:disabled { color: var(--color-text-soft); }
      .ib-qcard-actions { display: flex; gap: 4px; flex-shrink: 0; }
      .ib-qcard-helper { width: 100%; padding: 6px 0; background: transparent; border: none; outline: none; font: 400 13px 'Urbanist', sans-serif; color: var(--color-text-soft); margin-bottom: 8px; }
      .ib-qcard-row { display: flex; gap: 10px; align-items: end; flex-wrap: wrap; margin-bottom: 6px; }
      .ib-qcard-field { display: flex; flex-direction: column; gap: 4px; }
      .ib-qcard-field-required { align-items: flex-start; }
      .ib-qcard-field-label { font: 700 9px 'Urbanist', sans-serif; letter-spacing: 0.08em; text-transform: uppercase; color: var(--color-text-muted); }
      .ib-qcard-logic { margin-left: auto; display: inline-flex; align-items: center; gap: 6px; padding: 7px 12px; border-radius: 8px; background: var(--color-surface); border: 1px solid var(--color-border); color: var(--color-text-soft); font: 700 12px 'Urbanist', sans-serif; cursor: pointer; }
      .ib-qcard-logic.has-rules { color: var(--color-accent); border-color: var(--color-accent); }
      .ib-logic-count { font-size: 9px; padding: 1px 6px; border-radius: 100px; background: var(--color-accent); color: white; }
      .ib-qcard-locked-note { margin-top: 10px; padding: 8px 10px; background: var(--color-surface); border-left: 3px solid var(--color-accent); border-radius: 6px; font-size: 12px; color: var(--color-text-soft); }

      .ib-input, .ib-select, .ib-textarea { width: 100%; padding: 9px 12px; background: var(--color-surface); border: 1px solid var(--color-border); border-radius: 8px; outline: none; font: 500 13px 'Urbanist', sans-serif; color: var(--color-text); box-sizing: border-box; }
      .ib-textarea { resize: vertical; min-height: 70px; line-height: 1.5; }
      .ib-select { cursor: pointer; }
      .ib-char-counter { font: 500 11px 'JetBrains Mono', monospace; color: var(--color-text-muted); text-align: right; margin-top: 4px; }

      .ib-options { display: flex; flex-direction: column; gap: 6px; margin-top: 8px; }
      .ib-option-row { display: flex; gap: 6px; align-items: center; }
      .ib-add-option { align-self: flex-start; display: inline-flex; align-items: center; gap: 6px; padding: 5px 10px; background: transparent; border: 1px dashed var(--color-border); border-radius: 7px; color: var(--color-text-soft); font: 700 11px 'Urbanist', sans-serif; cursor: pointer; }

      .ib-logic-block { margin-top: 10px; padding: 10px; background: var(--color-surface); border: 1px dashed var(--color-border); border-radius: 9px; }
      .ib-logic-row { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
      .ib-logic-prefix { font-size: 12px; color: var(--color-text-soft); }
      .ib-link-btn { margin-top: 6px; background: transparent; border: none; cursor: pointer; color: var(--color-accent); font: 700 11px 'Urbanist', sans-serif; }

      .ib-add-btn { display: inline-flex; align-items: center; gap: 6px; padding: 9px 14px; background: transparent; border: 1px dashed var(--color-border); border-radius: 9px; color: var(--color-text-soft); font: 700 13px 'Urbanist', sans-serif; cursor: pointer; width: 100%; justify-content: center; }

      .ib-icon-only { display: inline-flex; align-items: center; justify-content: center; width: 26px; height: 26px; background: transparent; border: 1px solid var(--color-border); border-radius: 6px; color: var(--color-text-soft); cursor: pointer; }
      .ib-icon-only:disabled { opacity: 0.4; cursor: not-allowed; }
      .ib-icon-only.is-danger { color: #ef4444; border-color: rgba(239,68,68,0.3); }

      .ib-btn { display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; background: var(--color-card); border: 1px solid var(--color-border); border-radius: 9px; font: 700 13px 'Urbanist', sans-serif; color: var(--color-text); cursor: pointer; }
      .ib-btn:disabled { opacity: 0.5; cursor: not-allowed; }
      .ib-btn-quiet { background: var(--color-surface); }
      .ib-btn-primary { background: var(--color-accent); color: white; border-color: transparent; }

      .ib-actions { position: sticky; bottom: 0; background: var(--color-bg); border-top: 1px solid var(--color-border); padding: 12px 24px; display: flex; gap: 10px; align-items: center; z-index: 10; }
      /* Change-type sits on the left edge of the action bar. The
         margin-right: auto spacer pushes Save / Preview / Publish
         to the right edge without needing a separate wrapper. */
      .ib-actions-left { margin-right: auto; }

      .ib-side-preview { border-left: 1px solid var(--color-border); background: var(--color-card); overflow-y: auto; }
      .ib-side-preview-inner { padding: 16px; }
      .ib-side-preview-head { display: flex; flex-direction: column; gap: 2px; margin-bottom: 14px; }
      .ib-side-preview-head > :first-child { font: 800 13px 'Urbanist', sans-serif; }
      .ib-side-preview-hint { font: 500 11px 'Urbanist', sans-serif; color: var(--color-text-muted); }

      /* ── Project-type picker (redesigned) ─────────────────────
         Theme-aware tokens used everywhere; per-theme overrides
         live further down for values without a CSS variable
         counterpart (e.g. inset highlight, dim step dot, raw
         border alpha). */
      .ib-pt-root {
        position: relative;
        --ib-pt-card-border: rgba(0,0,0,0.08);
        --ib-pt-inset: transparent;
        --ib-pt-dot-dim: rgba(0,0,0,0.08);
        --ib-pt-shadow-hover: 0 8px 24px rgba(139,92,246,0.12);
      }
      [data-theme="dark"] .ib-pt-root {
        --ib-pt-card-border: rgba(255,255,255,0.07);
        --ib-pt-inset: inset 0 1px 0 rgba(255,255,255,0.04);
        --ib-pt-dot-dim: rgba(255,255,255,0.1);
        --ib-pt-shadow-hover: 0 8px 24px rgba(139,92,246,0.12);
      }

      .ib-pt-back {
        position: absolute; top: 24px; left: 24px;
        display: inline-flex; align-items: center; gap: 6px;
        padding: 6px 10px;
        background: transparent; border: none;
        color: var(--color-text-muted);
        font: 600 13px 'Urbanist', sans-serif;
        cursor: pointer;
        border-radius: 8px;
        transition: color 0.18s ease;
        z-index: 5;
      }
      .ib-pt-back:hover { color: var(--color-text); }

      .ib-pt-stage {
        /* flex: 1 makes the stage take the remaining vertical space
           inside AppShell's bounded main; overflow-y: auto lets the
           content scroll on short viewports instead of getting
           clipped by AppShell's overflow: hidden. */
        flex: 1;
        overflow-y: auto;
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        min-height: calc(100vh - 48px);
        padding: 48px 24px;
        max-width: 920px; width: 100%; margin: 0 auto;
        box-sizing: border-box;
      }

      .ib-pt-headblock { display: flex; flex-direction: column; align-items: center; width: 100%; }

      .ib-pt-steps { display: flex; align-items: center; gap: 8px; margin-bottom: 20px; }
      .ib-pt-dot { width: 24px; height: 4px; border-radius: 99px; background: #8B5CF6; }
      .ib-pt-dot.ib-pt-dot-dim { background: var(--ib-pt-dot-dim); }
      .ib-pt-steps-label {
        font: 700 11px 'DM Mono', 'JetBrains Mono', monospace;
        letter-spacing: 0.08em; text-transform: uppercase;
        color: var(--color-text-muted);
        margin-left: 8px;
      }

      .ib-pt-h1 {
        font-size: clamp(28px, 4vw, 40px);
        font-weight: 800;
        letter-spacing: -0.03em;
        color: var(--color-text);
        text-align: center;
        margin: 0;
        line-height: 1.1;
      }
      .ib-pt-sub {
        font-size: 15px;
        color: var(--color-text-muted);
        max-width: 480px;
        margin: 8px auto 40px;
        text-align: center;
        line-height: 1.6;
      }

      .ib-pt-grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 14px;
        width: 100%;
      }

      .ib-pt-card {
        position: relative;
        display: flex; flex-direction: column;
        padding: 24px;
        background: var(--color-card);
        border: 1px solid var(--ib-pt-card-border);
        border-radius: 16px;
        box-shadow: var(--ib-pt-inset);
        text-align: left;
        cursor: pointer;
        font-family: inherit;
        transition: border-color 0.2s ease, transform 0.2s ease, box-shadow 0.2s ease;
      }
      .ib-pt-card:hover {
        border-color: rgba(139,92,246,0.5);
        transform: translateY(-3px);
        box-shadow: var(--ib-pt-inset), var(--ib-pt-shadow-hover);
      }
      .ib-pt-card-arrow {
        position: absolute; top: 20px; right: 20px;
        display: inline-flex; align-items: center; justify-content: center;
        color: #8B5CF6;
        opacity: 0;
        transform: translateX(-4px);
        transition: opacity 0.2s ease, transform 0.2s ease;
      }
      .ib-pt-card:hover .ib-pt-card-arrow { opacity: 1; transform: translateX(0); }

      .ib-pt-icon {
        display: inline-flex; align-items: center; justify-content: center;
        width: 44px; height: 44px;
        background: rgba(139,92,246,0.12);
        border: 1px solid rgba(139,92,246,0.2);
        color: #8B5CF6;
        border-radius: 12px;
        margin-bottom: 16px;
      }
      .ib-pt-label {
        font-family: 'Urbanist', sans-serif;
        font-size: 16px;
        font-weight: 700;
        letter-spacing: -0.02em;
        color: var(--color-text);
        margin-bottom: 6px;
        display: block;
      }
      .ib-pt-tagline {
        font-size: 13px;
        color: var(--color-text-muted);
        line-height: 1.55;
        display: block;
      }

      /* Custom card: blank-slate variant, dashed border, no fill,
         hover ramps to a faint accent wash + solid border. */
      .ib-pt-card-custom {
        background: transparent;
        border: 1px dashed rgba(139,92,246,0.35);
        box-shadow: none;
      }
      .ib-pt-card-custom:hover {
        border-style: solid;
        border-color: rgba(139,92,246,0.6);
        background: rgba(139,92,246,0.05);
        box-shadow: var(--ib-pt-shadow-hover);
      }
      .ib-pt-card-custom .ib-pt-icon {
        background: transparent;
        border: 1px dashed rgba(139,92,246,0.4);
      }
      .ib-pt-card-custom:hover .ib-pt-icon {
        border-style: solid;
        border-color: rgba(139,92,246,0.6);
      }

      .ib-switch { position: relative; width: 36px; height: 20px; border-radius: 100px; background: var(--color-border); border: none; cursor: pointer; transition: background 0.15s; }
      .ib-switch:disabled { opacity: 0.4; cursor: not-allowed; }
      .ib-switch.is-on { background: var(--color-accent); }
      .ib-switch-knob { position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; border-radius: 50%; background: white; transition: transform 0.15s; }
      .ib-switch.is-on .ib-switch-knob { transform: translateX(16px); }

      .ib-panel { display: flex; flex-direction: column; gap: 22px; max-width: 720px; }
      .ib-field { display: flex; flex-direction: column; gap: 6px; }
      .ib-label { font: 700 12px 'Urbanist', sans-serif; color: var(--color-text); letter-spacing: 0.02em; }
      .ib-help { font: 500 11.5px 'Urbanist', sans-serif; color: var(--color-text-muted); margin: 0; line-height: 1.55; }

      .ib-logo-row { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
      .ib-logo-preview { width: 96px; height: 64px; background: var(--color-surface); border: 1px dashed var(--color-border); border-radius: 9px; display: flex; align-items: center; justify-content: center; padding: 8px; font: 500 11px 'Urbanist', sans-serif; color: var(--color-text-muted); flex-shrink: 0; }
      .ib-logo-preview img { max-width: 100%; max-height: 100%; object-fit: contain; }
      .ib-color-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
      .ib-color-swatch { width: 40px; height: 40px; padding: 0; border: 1px solid var(--color-border); border-radius: 9px; background: none; cursor: pointer; }

      .ib-toggle-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; padding: 14px; background: var(--color-card); border: 1px solid var(--color-border); border-radius: 11px; }
      .ib-toggle-label { font: 600 13px 'Urbanist', sans-serif; color: var(--color-text); margin-bottom: 2px; }

      .ib-est { display: flex; align-items: baseline; gap: 10px; margin-top: 4px; padding: 14px 16px; background: linear-gradient(135deg, rgba(139,92,246,0.10), rgba(99,102,241,0.06)); border: 1px solid rgba(139,92,246,0.25); border-radius: 11px; flex-wrap: wrap; }
      .ib-est-num { font: 800 30px 'Urbanist', sans-serif; color: var(--color-accent); }
      .ib-est-label { font: 600 13px 'Urbanist', sans-serif; color: var(--color-text); }
      .ib-est-formula { font: 500 11px 'JetBrains Mono', monospace; color: var(--color-text-muted); margin-left: auto; }

      .ib-mockup { background: var(--color-bg); border: 1px solid var(--color-border); border-radius: 12px; overflow: hidden; --accent: #8B5CF6; }
      .ib-mockup-empty { padding: 30px; text-align: center; color: var(--color-text-muted); margin: 0; }
      .ib-mockup-progress { height: 3px; background: var(--color-border); }
      .ib-mockup-progress > div { height: 100%; background: var(--accent); transition: width 0.2s; }
      .ib-mockup-pad { padding: 22px 20px 18px; display: flex; flex-direction: column; gap: 12px; }
      .ib-mockup-logo { max-height: 30px; align-self: flex-start; }
      .ib-mockup-welcome { font-size: 13px; color: var(--color-text-soft); margin: 0; line-height: 1.55; }
      .ib-mockup-counter { font: 700 10px 'JetBrains Mono', monospace; letter-spacing: 0.08em; color: var(--color-text-muted); text-transform: uppercase; }
      .ib-mockup-q { font: 800 18px 'Urbanist', sans-serif; color: var(--color-text); margin: 0; letter-spacing: -0.01em; }
      .ib-mockup-helper { font: 500 12px 'Urbanist', sans-serif; color: var(--color-text-muted); margin: 0; }
      .ib-mockup-input { width: 100%; padding: 10px 12px; background: var(--color-surface); border: 1px solid var(--color-border); border-radius: 8px; outline: none; font: 500 13px 'Urbanist', sans-serif; color: var(--color-text); box-sizing: border-box; }
      .ib-mockup-pills { display: flex; gap: 6px; flex-wrap: wrap; }
      .ib-mockup-pill { padding: 7px 14px; border-radius: 100px; background: var(--color-surface); border: 1px solid var(--color-border); font: 600 12px 'Urbanist', sans-serif; color: var(--color-text-soft); cursor: pointer; }
      .ib-mockup-scale { display: flex; flex-direction: column; gap: 6px; }
      .ib-mockup-scale-labels { display: flex; justify-content: space-between; font: 500 11px 'Urbanist', sans-serif; color: var(--color-text-muted); }
      .ib-mockup-scale-bar { display: grid; grid-template-columns: repeat(10, minmax(0, 1fr)); gap: 4px; }
      .ib-mockup-scale-bar button { padding: 7px 0; border-radius: 6px; background: var(--color-surface); border: 1px solid var(--color-border); font: 700 12px 'JetBrains Mono', monospace; color: var(--color-text-soft); cursor: pointer; }
      .ib-mockup-drop { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 24px 12px; border: 1.5px dashed var(--color-border); border-radius: 11px; color: var(--color-text-soft); font: 600 12px 'Urbanist', sans-serif; }
      .ib-mockup-drop-sub { font-weight: 500; color: var(--color-text-muted); font-size: 10px; }
      .ib-mockup-actions { display: flex; justify-content: space-between; align-items: center; margin-top: 6px; }
      .ib-mockup-back { background: transparent; border: none; cursor: pointer; color: var(--color-text-soft); font: 700 12px 'Urbanist', sans-serif; }
      .ib-mockup-back:disabled { opacity: 0.4; cursor: not-allowed; }
      .ib-mockup-continue { background: var(--accent); color: white; border: none; padding: 9px 18px; border-radius: 9px; cursor: pointer; font: 800 13px 'Urbanist', sans-serif; }

      .ib-modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.5); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; padding: 20px; z-index: 200; }
      .ib-modal { width: 100%; max-width: 540px; background: var(--color-bg); border: 1px solid var(--color-border); border-radius: 14px; max-height: 90vh; overflow: hidden; display: flex; flex-direction: column; }
      .ib-modal-narrow { max-width: 480px; }
      .ib-modal-head { display: flex; align-items: center; justify-content: space-between; padding: 14px 18px; border-bottom: 1px solid var(--color-border); font: 800 14px 'Urbanist', sans-serif; }
      .ib-modal > :nth-child(2) { padding: 18px; overflow-y: auto; flex: 1; }

      .ib-preview-fab { position: fixed; right: 16px; bottom: 86px; z-index: 50; display: inline-flex; align-items: center; gap: 6px; padding: 10px 16px; border-radius: 100px; background: var(--color-text); color: var(--color-bg); border: none; box-shadow: 0 12px 30px rgba(0,0,0,0.30); font: 800 13px 'Urbanist', sans-serif; cursor: pointer; }

      .ib-share-row { display: flex; align-items: center; gap: 8px; }

      @media (max-width: 1023px) {
        .ib-layout { grid-template-columns: 1fr; }
        .ib-side-preview { display: none; }
        .ib-pt-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .ib-pt-back { top: 18px; left: 18px; }
      }
      @media (max-width: 639px) {
        .ib-pt-grid { grid-template-columns: 1fr; }
        .ib-pt-stage { padding: 32px 18px; min-height: calc(100vh - 32px); }
        .ib-pt-sub { margin-bottom: 28px; }
        .ib-pt-card { padding: 20px; }
      }
      @media (max-width: 767px) {
        .ib-topbar { padding: 14px 16px; gap: 10px; }
        .ib-topbar-name { font-size: 18px; }
        .ib-topbar-eyebrow { font-size: 9px; }
        .ib-topbar-back span { display: none; }
        .ib-topbar-back { padding: 6px 8px; }
        .ib-tabs { padding: 10px 14px 0; overflow-x: auto; -webkit-overflow-scrolling: touch; }
        .ib-tab { flex-shrink: 0; padding: 7px 12px; font-size: 12px; }
        .ib-pane { padding: 14px 14px 120px; }
        .ib-qcard { padding: 12px; border-radius: 11px; }
        .ib-qcard-head { flex-wrap: wrap; }
        .ib-qcard-actions { width: 100%; justify-content: flex-end; margin-top: 4px; }
        .ib-qcard-row { gap: 8px; }
        .ib-qcard-field { flex: 1; min-width: 120px; }
        .ib-qcard-logic { margin-left: 0; width: 100%; justify-content: center; }
        .ib-actions { padding: 10px 14px; gap: 6px; }
        .ib-actions .ib-btn { flex: 1; justify-content: center; padding: 9px 10px; font-size: 12px; }
      }
    `}</style>
  )
}
