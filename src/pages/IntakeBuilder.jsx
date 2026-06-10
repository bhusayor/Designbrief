// ────────────────────────────────────────────────────────────────────
// IntakeBuilder — Phase 1 of the Client Intake Form rebuild.
//
// Replaces the legacy 3-screen wizard with a richer builder:
//
//   1. Project-type card grid (first run only). Selecting a type
//      loads the default question set + branding + settings.
//   2. Builder screen with three tabs:
//        Questions   — drag/duplicate/delete/inline-edit cards,
//                      conditional-logic rule builder per card,
//                      Add Question button.
//        Branding    — logo upload, primary colour picker, welcome
//                      and completion messages (200 char each).
//        Settings    — expiry, file uploads on/off, language
//                      (en/fr/es/pt), progress bar, confirmation +
//                      designer notification emails, live estimated
//                      completion time.
//   3. Sticky bottom bar — Save Draft / Preview Form / Publish.
//   4. Live preview — desktop side panel, tablet drawer, mobile
//      modal. Always reflects the latest builder state.
//
// Responsive:
//   ≥1024 desktop  — two-column: tabs+content | sticky preview
//   768-1023 tablet — single column + Preview FAB → modal
//   <768  mobile    — single column + Preview FAB → modal
// ────────────────────────────────────────────────────────────────────

import { useContext, useEffect, useMemo, useState } from 'react'
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
import {
  ArrowLeftIcon,
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
  const { authUser, user, showToast, navigate } = useContext(AppContext)
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

  if (!form.project_type) {
    return (
      <ProjectTypeScreen
        onPick={(typeId) => {
          setForm(f => ({
            ...f,
            project_type: typeId,
            questions: defaultQuestionsFor(typeId),
          }))
        }}
        onBack={() => navigate?.('dashboard')}
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
  // the Save / Publish button spinning forever. 15s is generous; if
  // the upsert hasn't returned by then something is wrong upstream.
  function withTimeout(p, ms = 15000, label = 'request') {
    return Promise.race([
      p,
      new Promise((_, rj) => setTimeout(
        () => rj(new Error(`${label} timed out after ${ms / 1000}s. Check your connection and try again.`)),
        ms,
      )),
    ])
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
      const row = formToRow(form, authUser.id, { status: 'draft', id })
      const { error } = await withTimeout(
        supabase.from('intake_forms').upsert(row, { onConflict: 'id' }),
        15000,
        'Save',
      )
      if (error) throw error
      setForm(f => ({ ...f, id }))
      showToast?.('Draft saved.', 'success')
    } catch (e) {
      console.error('[intake save]', e)
      showToast?.(explainError(e), 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handlePublish() {
    if (publishing) return
    if (!authUser?.id) { showToast?.('Sign in to publish.', 'error'); return }
    setPublishing(true)
    try {
      const id = form.id || ('intake_' + slug())
      const row = formToRow(form, authUser.id, {
        id,
        status: 'active',
        published_at: new Date().toISOString(),
      })
      const { error } = await withTimeout(
        supabase.from('intake_forms').upsert(row, { onConflict: 'id' }),
        15000,
        'Publish',
      )
      if (error) throw error
      setForm(f => ({ ...f, id, status: 'active' }))
      setView('delivery')
      showToast?.('Published. Share the link with your client.', 'success')
    } catch (e) {
      console.error('[intake publish]', e)
      showToast?.(explainError(e), 'error')
    } finally {
      setPublishing(false)
    }
  }

  return (
    <div className="ib-root">
      <ResponsiveStyles />

      <header className="ib-topbar">
        <button onClick={() => navigate?.('dashboard')} className="ib-topbar-back" aria-label="Back to dashboard">
          <ArrowLeftIcon style={{ width: 16, height: 16 }} />
          <span>Dashboard</span>
        </button>
        <div className="ib-topbar-title">
          <span className="ib-topbar-eyebrow">Client intake form</span>
          <span className="ib-topbar-name">{labelForType(form.project_type)}</span>
        </div>
        <span className={`ib-status-pill ib-status-${form.status || 'draft'}`}>
          {form.status === 'active' ? 'Active' : 'Draft'}
        </span>
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
            <button onClick={handleSaveDraft} disabled={saving} className="ib-btn ib-btn-quiet">
              {saving ? 'Saving…' : 'Save draft'}
            </button>
            <button onClick={() => setPreviewOpen(true)} className="ib-btn ib-btn-quiet">
              <EyeIcon style={{ width: 14, height: 14 }} /> Preview
            </button>
            <button onClick={handlePublish} disabled={publishing} className="ib-btn ib-btn-primary">
              {publishing ? 'Publishing…' : (form.status === 'active' ? 'Update' : 'Publish')}
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
// Project-type card grid (first screen)
// ────────────────────────────────────────────────────────────────────
function ProjectTypeScreen({ onPick, onBack }) {
  const icons = {
    website:   GlobeAltIcon,
    mobile:    Square3Stack3DIcon,
    brand:     PaintBrushIcon,
    ecommerce: SwatchIcon,
    redesign:  ArrowsUpDownIcon,
    custom:    PlusIcon,
  }
  return (
    <div className="ib-root">
      <ResponsiveStyles />
      <header className="ib-topbar">
        <button onClick={onBack} className="ib-topbar-back" aria-label="Back">
          <ArrowLeftIcon style={{ width: 16, height: 16 }} />
          <span>Dashboard</span>
        </button>
        <div className="ib-topbar-title">
          <span className="ib-topbar-eyebrow">New intake form</span>
          <span className="ib-topbar-name">Pick a project type</span>
        </div>
        <span style={{ width: 80 }} />
      </header>
      <div className="ib-pt-wrap">
        <h1 className="ib-pt-h1">What kind of project is this for?</h1>
        <p className="ib-pt-sub">Each type comes with a default set of questions tuned for that work. Rename, reorder, delete, or add on the next screen.</p>
        <div className="ib-pt-grid">
          {PROJECT_TYPES.map(t => {
            const Icon = icons[t.id] || PlusIcon
            return (
              <button key={t.id} className="ib-pt-card" onClick={() => onPick(t.id)}>
                <span className="ib-pt-icon"><Icon style={{ width: 22, height: 22 }} /></span>
                <span className="ib-pt-label">{t.label}</span>
                <span className="ib-pt-tagline">{t.tagline}</span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────
// Questions editor
// ────────────────────────────────────────────────────────────────────
function QuestionsEditor({ questions, setQuestions }) {
  const [dragIdx, setDragIdx] = useState(null)
  const [dragOverIdx, setDragOverIdx] = useState(null)

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
  function add() {
    const lockedIdx = questions.findIndex(q => q.locked)
    const blank = {
      id: uid('q'), text: 'New question', helper_text: '',
      type: 'short_text', required: true, options: null,
      scale_low_label: null, scale_high_label: null,
      conditional_rules: [], order_index: 0, locked: false,
    }
    const next = lockedIdx >= 0
      ? [...questions.slice(0, lockedIdx), blank, ...questions.slice(lockedIdx)]
      : [...questions, blank]
    setQuestions(reindex(next))
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

  return (
    <div className="ib-qedit">
      <p className="ib-section-tip">
        Drag the card or use the arrows to reorder. The final question is locked because the translator relies on it.
      </p>
      {questions.map((q, i) => (
        <QuestionCard
          key={q.id}
          q={q}
          index={i}
          total={questions.length}
          others={questions}
          onChange={(patch) => update(i, patch)}
          onDuplicate={() => dup(i)}
          onDelete={() => remove(i)}
          onMoveUp={() => move(i, i - 1)}
          onMoveDown={() => move(i, i + 1)}
          dragOverIdx={dragOverIdx}
          onDragStart={() => setDragIdx(i)}
          onDragOver={() => setDragOverIdx(i)}
          onDrop={() => { move(dragIdx, i); setDragIdx(null); setDragOverIdx(null) }}
          onDragEnd={() => { setDragIdx(null); setDragOverIdx(null) }}
        />
      ))}
      <button onClick={add} className="ib-add-btn">
        <PlusIcon style={{ width: 14, height: 14 }} /> Add question
      </button>
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
  return {
    id: override.id ?? form.id,
    user_id: userId,
    project_name: labelForType(form.project_type),
    project_type: form.project_type,
    questions: form.questions,
    branding: form.branding,
    settings: form.settings,
    expires_at: form.expires_at,
    published_at: override.published_at ?? form.published_at,
    status: override.status ?? form.status,
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
// Styles — single block scoped to .ib-root via prefix class names.
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
      .ib-topbar { display: flex; align-items: center; gap: 14px; padding: 12px 22px; border-bottom: 1px solid var(--color-border); background: var(--color-bg); flex-shrink: 0; }
      .ib-topbar-back { display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; border-radius: 9px; background: transparent; border: 1px solid var(--color-border); color: var(--color-text-soft); cursor: pointer; font: 600 12px/1.2 'Urbanist', sans-serif; }
      .ib-topbar-title { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; }
      .ib-topbar-eyebrow { font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--color-text-muted); font-weight: 700; }
      .ib-topbar-name { font-size: 15px; font-weight: 800; color: var(--color-text); }
      .ib-status-pill { font-size: 10px; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase; padding: 3px 10px; border-radius: 100px; background: var(--color-surface); color: var(--color-text-soft); border: 1px solid var(--color-border); }
      .ib-status-pill.ib-status-active { background: rgba(16,185,129,0.12); color: #047857; border-color: rgba(16,185,129,0.35); }

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

      .ib-actions { position: sticky; bottom: 0; background: var(--color-bg); border-top: 1px solid var(--color-border); padding: 12px 24px; display: flex; gap: 10px; justify-content: flex-end; z-index: 10; }

      .ib-side-preview { border-left: 1px solid var(--color-border); background: var(--color-card); overflow-y: auto; }
      .ib-side-preview-inner { padding: 16px; }
      .ib-side-preview-head { display: flex; flex-direction: column; gap: 2px; margin-bottom: 14px; }
      .ib-side-preview-head > :first-child { font: 800 13px 'Urbanist', sans-serif; }
      .ib-side-preview-hint { font: 500 11px 'Urbanist', sans-serif; color: var(--color-text-muted); }

      .ib-pt-wrap { padding: 40px 24px 80px; max-width: 920px; margin: 0 auto; width: 100%; box-sizing: border-box; flex: 1; overflow-y: auto; }
      .ib-pt-h1 { font-size: 26px; font-weight: 800; letter-spacing: -0.02em; margin: 0 0 8px; }
      .ib-pt-sub { font-size: 14px; color: var(--color-text-soft); margin: 0 0 28px; max-width: 560px; }
      .ib-pt-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; }
      .ib-pt-card { display: flex; flex-direction: column; gap: 10px; padding: 22px 18px; background: var(--color-card); border: 1px solid var(--color-border); border-radius: 14px; text-align: left; cursor: pointer; font-family: inherit; transition: transform 0.12s, border-color 0.12s, box-shadow 0.12s; }
      .ib-pt-card:hover { border-color: var(--color-accent); transform: translateY(-1px); box-shadow: 0 6px 20px rgba(0,0,0,0.08); }
      .ib-pt-icon { display: inline-flex; align-items: center; justify-content: center; width: 40px; height: 40px; background: rgba(139,92,246,0.10); color: var(--color-accent); border-radius: 10px; }
      .ib-pt-label { font: 800 15px 'Urbanist', sans-serif; color: var(--color-text); }
      .ib-pt-tagline { font: 500 12px 'Urbanist', sans-serif; color: var(--color-text-soft); line-height: 1.5; }

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
      }
      @media (max-width: 767px) {
        .ib-topbar { padding: 10px 14px; gap: 10px; }
        .ib-topbar-name { font-size: 14px; }
        .ib-topbar-back span { display: none; }
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
        .ib-pt-wrap { padding: 24px 14px 60px; }
        .ib-pt-h1 { font-size: 22px; }
        .ib-pt-grid { grid-template-columns: 1fr; }
      }
    `}</style>
  )
}
