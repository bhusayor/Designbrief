// ────────────────────────────────────────────────────────────────────
// IntakeBriefReview — Phase 5 of the Client Intake Form rebuild.
//
// The designer lands here from the notification email link or from
// IntakeDelivery's View Brief button on a submission row. Shows the
// full V2 translation in an editable layout, with three companion
// panels (Flags / Design System / Kanban Preview) and an Approve
// flow that locks the brief.
//
// Responsive:
//   ≥1024 desktop  — three-column: left section nav, centre
//                    translation, right tabbed panel (Flags /
//                    System / Kanban).
//   768-1023 tablet — two-column: left translation, right collapses
//                    into a slide-in drawer behind a floating
//                    "Flags + System" button.
//   <768  mobile    — single column; sticky bottom tab bar with
//                    Brief / Flags / System tabs. Kanban opens as
//                    a bottom sheet via View Board.
// ────────────────────────────────────────────────────────────────────

import { useContext, useEffect, useMemo, useRef, useState } from 'react'
import AppContext from '../context/AppContext'
import { supabase } from '../lib/supabase'
import { BRIEF_V2_SECTIONS, BRIEF_V2_ITEM_BY_KEY } from '../lib/briefV2Schema'
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  ArrowDownTrayIcon,
  CheckIcon,
  CheckCircleIcon,
  ChevronDownIcon,
  ExclamationTriangleIcon,
  EyeIcon,
  FlagIcon,
  LockClosedIcon,
  LockOpenIcon,
  PaintBrushIcon,
  PencilSquareIcon,
  QuestionMarkCircleIcon,
  Squares2X2Icon,
  XMarkIcon,
} from '@heroicons/react/24/outline'

// ────────────────────────────────────────────────────────────────────
// Public component
// ────────────────────────────────────────────────────────────────────
export default function IntakeBriefReview() {
  const { activeIntakeSubmissionId, navigate, showToast } = useContext(AppContext)
  const [state, setState] = useState({ status: 'loading' })

  useEffect(() => {
    if (!activeIntakeSubmissionId) {
      setState({ status: 'not-found' })
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const { data: sub, error: subErr } = await supabase
          .from('intake_submissions')
          .select('*')
          .eq('id', activeIntakeSubmissionId)
          .maybeSingle()
        if (cancelled) return
        if (subErr) throw subErr
        if (!sub) {
          setState({ status: 'not-found' })
          return
        }
        const { data: form } = await supabase
          .from('intake_forms')
          .select('*')
          .eq('id', sub.intake_form_id)
          .maybeSingle()
        if (cancelled) return
        setState({ status: 'ready', submission: sub, form })
      } catch (e) {
        if (cancelled) return
        console.error('[review] load failed', e)
        setState({ status: 'error', message: e?.message || 'Could not load.' })
      }
    })()
    return () => { cancelled = true }
  }, [activeIntakeSubmissionId])

  if (state.status === 'loading') return <CenteredMessage spinner>Loading brief…</CenteredMessage>
  if (state.status === 'not-found') return <CenteredMessage>No submission selected.</CenteredMessage>
  if (state.status === 'error') return <CenteredMessage>{state.message}</CenteredMessage>

  return (
    <ReviewShell
      submission={state.submission}
      form={state.form}
      onBack={() => navigate?.('intake')}
      showToast={showToast}
    />
  )
}

// ────────────────────────────────────────────────────────────────────
// Follow-ups loader hook
// ────────────────────────────────────────────────────────────────────
function useFollowups(submissionId) {
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)
  const reload = async () => {
    if (!submissionId) return
    try {
      const { data, error } = await supabase
        .from('intake_followups')
        .select('*')
        .eq('submission_id', submissionId)
        .order('sent_at', { ascending: false })
      if (error) throw error
      setList(data || [])
    } catch (e) {
      console.warn('[review] followups load', e?.message)
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    ;(async () => {
      await reload()
      if (cancelled) return
    })()
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submissionId])
  return { list, loading, reload }
}

// ────────────────────────────────────────────────────────────────────
// Shell — manages editable result + tab state + persistence
// ────────────────────────────────────────────────────────────────────
function ReviewShell({ submission, form, onBack, showToast }) {
  const initialResult = useMemo(() => submission?.translated_result || null, [submission])

  // Editable result lives in state. Persistence happens on Save +
  // Approve. Local edits are tracked via a dirty flag so the user
  // gets a hint that they have unsaved changes.
  const [result, setResult] = useState(initialResult)
  const [dirty, setDirty] = useState(false)
  const [activeSectionId, setActiveSectionId] = useState(result?.sections?.[0]?.id || 'understand')
  const [rightTab, setRightTab] = useState('flags')  // flags | system | kanban
  const [mobileTab, setMobileTab] = useState('brief') // brief | flags | system
  const [exportOpen, setExportOpen] = useState(false)
  const [kanbanSheetOpen, setKanbanSheetOpen] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [approving, setApproving] = useState(false)
  const [locked, setLocked] = useState(!!submission?.approved_at)
  const [showUnlockConfirm, setShowUnlockConfirm] = useState(false)
  const { list: followups, reload: reloadFollowups } = useFollowups(submission?.id)
  const [composer, setComposer] = useState(null)  // { question, context }

  // Sweep B — auto-unblock matching. When a follow-up question gets
  // answered, walk every kanban card's blocked_reasons and surface
  // an Apply banner if any reason text matches an answered question.
  // We don't auto-mutate the result because the designer should
  // confirm the action; the banner exposes Apply + Dismiss.
  const unblockTargets = useMemo(() => {
    const answered = new Set(
      followups
        .filter(f => f.status === 'answered')
        .map(f => normaliseText(f.question_text)),
    )
    if (!answered.size) return []
    const tasks = result?.kanbanCards?.tasks || []
    const out = []
    for (let i = 0; i < tasks.length; i++) {
      const t = tasks[i]
      const reasons = Array.isArray(t.blocked_reasons) ? t.blocked_reasons : []
      const matching = reasons.filter(r => r?.text && answered.has(normaliseText(r.text)))
      if (matching.length) out.push({ taskIndex: i, taskTitle: t.title, matching })
    }
    return out
  }, [followups, result?.kanbanCards?.tasks])

  function applyUnblocks() {
    if (locked || !unblockTargets.length) return
    const answered = new Set(
      followups
        .filter(f => f.status === 'answered')
        .map(f => normaliseText(f.question_text)),
    )
    const tasks = (result.kanbanCards?.tasks || []).map(t => {
      const reasons = Array.isArray(t.blocked_reasons) ? t.blocked_reasons : []
      const remaining = reasons.filter(r => !(r?.text && answered.has(normaliseText(r.text))))
      if (remaining.length === reasons.length) return t
      return {
        ...t,
        blocked_reasons: remaining,
        blocked: remaining.length > 0,
        status: remaining.length > 0 ? 'blocked' : 'todo',
      }
    })
    setDirty(true)
    setResult(r => ({ ...r, kanbanCards: { ...(r.kanbanCards || {}), tasks } }))
    showToast?.(`Updated ${unblockTargets.length} card${unblockTargets.length === 1 ? '' : 's'}. Save to persist.`, 'success')
  }

  const w = useWindowWidth()
  const isMobile = w < 768
  const isTablet = w >= 768 && w < 1024
  const isDesktop = w >= 1024

  // Aggregate flags from the submission row (Phase 4 writes them
  // there as part of the pipeline) + recompute from the live result
  // so edits update counts in real time.
  const flags = useMemo(() => aggregateFlags(result), [result])
  const flagCount = flags.red.length + flags.assumptions.length + flags.questions.length

  function patchItem(sectionId, itemKey, content) {
    if (locked) return
    setDirty(true)
    setResult(r => ({
      ...r,
      sections: r.sections.map(s => s.id !== sectionId ? s : {
        ...s,
        items: s.items.map(it => it.key !== itemKey ? it : { ...it, content }),
      }),
    }))
  }
  function patchAssumptionStatus(itemIndex, nextStatus) {
    if (locked) return
    setDirty(true)
    setResult(r => ({
      ...r,
      sections: r.sections.map(s => s.id !== 'interrogate' ? s : {
        ...s,
        items: s.items.map(it => {
          if (it.key !== 'assumptions_log') return it
          const items = Array.isArray(it.content?.items) ? it.content.items.slice() : []
          if (items[itemIndex]) items[itemIndex] = { ...items[itemIndex], status: nextStatus }
          return { ...it, content: { ...it.content, items } }
        }),
      }),
    }))
  }
  function patchDesignSystem(patch) {
    if (locked) return
    setDirty(true)
    setResult(r => ({ ...r, designSystem: { ...(r.designSystem || {}), ...patch } }))
  }

  async function handleSave() {
    if (saving || locked) return
    setSaving(true)
    try {
      const { error } = await supabase
        .from('intake_submissions')
        .update({ translated_result: result, flags: flatFlags(flags) })
        .eq('id', submission.id)
      if (error) throw error
      setDirty(false)
      showToast?.('Saved.', 'success')
    } catch (e) {
      console.error('[review save]', e)
      showToast?.(e.message || 'Could not save.', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleApprove() {
    if (approving || locked) return
    setApproving(true)
    try {
      const now = new Date().toISOString()
      const { error } = await supabase
        .from('intake_submissions')
        .update({ translated_result: result, flags: flatFlags(flags), approved_at: now, status: 'complete' })
        .eq('id', submission.id)
      if (error) throw error
      setLocked(true)
      setDirty(false)
      showToast?.('Brief approved. The AI builder is unlocked for all non-blocked cards.', 'success')
    } catch (e) {
      console.error('[review approve]', e)
      showToast?.(e.message || 'Could not approve.', 'error')
    } finally {
      setApproving(false)
    }
  }

  async function handleSendFollowup(question, context) {
    if (!question?.trim()) return
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const apiUrl = (import.meta.env.VITE_API_URL || '') + '/api/intake-followup'
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + (session?.access_token || ''),
        },
        body: JSON.stringify({
          action: 'send',
          submission_id: submission.id,
          question_text: question,
          context_text: context || null,
        }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.message || j.error || `HTTP ${res.status}`)
      setComposer(null)
      showToast?.('Question sent to the client.', 'success')
      await reloadFollowups()
    } catch (e) {
      console.error('[send followup]', e)
      showToast?.(e.message || 'Could not send the question.', 'error')
    }
  }

  async function handleUnlock() {
    setShowUnlockConfirm(false)
    try {
      const { error } = await supabase
        .from('intake_submissions')
        .update({ approved_at: null })
        .eq('id', submission.id)
      if (error) throw error
      setLocked(false)
      showToast?.('Brief unlocked. Approve again when you are done editing.', 'success')
    } catch (e) {
      console.error('[review unlock]', e)
      showToast?.(e.message || 'Could not unlock.', 'error')
    }
  }

  function jumpToFlags() {
    if (isMobile) setMobileTab('flags')
    else if (isTablet) setDrawerOpen(true)
    else setRightTab('flags')
  }

  if (!result?.sections?.length) {
    return (
      <CenteredMessage>
        This submission has no translated result yet. The pipeline may still be running, or it failed earlier.
        {submission.failure_message && (
          <span style={{ display: 'block', marginTop: 10, fontSize: 12, color: '#b91c1c' }}>
            Failure: {submission.failure_message}
          </span>
        )}
        <button onClick={onBack} className="br-btn br-btn-quiet" style={{ marginTop: 16 }}>
          <ArrowLeftIcon style={{ width: 14, height: 14 }} /> Back
        </button>
      </CenteredMessage>
    )
  }

  return (
    <div className="br-root">
      <Styles />

      <ReviewHeader
        submission={submission}
        form={form}
        result={result}
        flagCount={flagCount}
        locked={locked}
        dirty={dirty}
        onBack={onBack}
        onJumpToFlags={jumpToFlags}
      />

      <div className="br-layout">
        {/* Desktop section nav */}
        {isDesktop && (
          <aside className="br-sidenav" aria-label="Sections">
            <SectionNav
              result={result}
              activeId={activeSectionId}
              onPick={setActiveSectionId}
            />
          </aside>
        )}

        {/* Centre — translation OR mobile-active panel */}
        <main className="br-centre">
          {(!isMobile || mobileTab === 'brief') && (
            <TranslationPanel
              result={result}
              locked={locked}
              onChangeItem={patchItem}
              onChangeAssumption={patchAssumptionStatus}
              enrichmentMap={submission.enriched_answers}
              activeSectionId={activeSectionId}
              setActiveSectionId={setActiveSectionId}
              isDesktop={isDesktop}
            />
          )}
          {isMobile && mobileTab === 'flags' && (
            <FlagsPanel
              flags={flags}
              cards={result.kanbanCards?.tasks}
              followups={followups}
              locked={locked}
              onSendQuestion={(q) => setComposer({ question: q })}
              unblockTargets={unblockTargets}
              onApplyUnblocks={applyUnblocks}
            />
          )}
          {isMobile && mobileTab === 'system' && (
            <DesignSystemPanel ds={result.designSystem} locked={locked} onChange={patchDesignSystem} />
          )}
        </main>

        {/* Desktop right tab panel */}
        {isDesktop && (
          <aside className="br-rightpanel">
            <RightTabs current={rightTab} onSwitch={setRightTab} />
            <div className="br-rightbody">
              {rightTab === 'flags' && (
                <FlagsPanel
                  flags={flags}
                  cards={result.kanbanCards?.tasks}
                  followups={followups}
                  locked={locked}
                  onSendQuestion={(q) => setComposer({ question: q })}
                />
              )}
              {rightTab === 'system' && (
                <DesignSystemPanel ds={result.designSystem} locked={locked} onChange={patchDesignSystem} />
              )}
              {rightTab === 'kanban' && (
                <KanbanPreview kanban={result.kanbanCards} />
              )}
            </div>
          </aside>
        )}
      </div>

      {/* Sticky bottom bar */}
      <BottomBar
        locked={locked}
        dirty={dirty}
        saving={saving}
        approving={approving}
        flagCount={flagCount}
        onSave={handleSave}
        onApprove={handleApprove}
        onUnlock={() => setShowUnlockConfirm(true)}
        onResolveFlags={jumpToFlags}
        onExport={() => setExportOpen(true)}
        onViewBoard={() => setKanbanSheetOpen(true)}
        isMobile={isMobile}
      />

      {/* Mobile bottom tab bar (above the action bar) */}
      {isMobile && (
        <MobileTabBar current={mobileTab} onSwitch={setMobileTab} />
      )}

      {/* Tablet drawer */}
      {isTablet && drawerOpen && (
        <DrawerPanel
          tab={rightTab}
          onSwitch={setRightTab}
          onClose={() => setDrawerOpen(false)}
          flags={flags}
          cards={result.kanbanCards?.tasks}
          ds={result.designSystem}
          kanban={result.kanbanCards}
          locked={locked}
          onChangeDs={patchDesignSystem}
          followups={followups}
          onSendQuestion={(q) => setComposer({ question: q })}
          unblockTargets={unblockTargets}
          onApplyUnblocks={applyUnblocks}
        />
      )}

      {/* Tablet/mobile floating drawer trigger */}
      {(isTablet) && !drawerOpen && (
        <button onClick={() => setDrawerOpen(true)} className="br-floating-trigger" aria-label="Flags and design system">
          <FlagIcon style={{ width: 14, height: 14 }} />
          <span>Flags + System</span>
          {flagCount > 0 && <span className="br-floating-badge">{flagCount}</span>}
        </button>
      )}

      {/* Mobile kanban full-screen bottom sheet */}
      {kanbanSheetOpen && (
        <KanbanSheet kanban={result.kanbanCards} onClose={() => setKanbanSheetOpen(false)} />
      )}

      {exportOpen && (
        <ExportModal
          result={result}
          onClose={() => setExportOpen(false)}
        />
      )}
      {showUnlockConfirm && (
        <ConfirmModal
          title="Unlock the brief?"
          body="Unlocking re-enables editing on every item, every flag action, and the design system. The brief will need to be approved again before the AI builder is re-enabled on its kanban cards. Are you sure?"
          confirmLabel="Yes, unlock"
          onConfirm={handleUnlock}
          onCancel={() => setShowUnlockConfirm(false)}
        />
      )}
      {composer && (
        <FollowupComposerModal
          question={composer.question}
          onCancel={() => setComposer(null)}
          onSend={(q, ctx) => handleSendFollowup(q, ctx)}
        />
      )}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────
// Header
// ────────────────────────────────────────────────────────────────────
function ReviewHeader({ submission, form, result, flagCount, locked, dirty, onBack, onJumpToFlags }) {
  const status = submission?.status || 'pending'
  const statusLabel = prettyStatus(status)
  return (
    <header className="br-header">
      <button onClick={onBack} className="br-back" aria-label="Back to intake">
        <ArrowLeftIcon style={{ width: 16, height: 16 }} />
        <span>Intake</span>
      </button>

      <div className="br-header-title">
        <span className="br-eyebrow">Client brief review</span>
        <span className="br-name">{result?.projectTitle || form?.project_name || 'Untitled'}</span>
        <span className="br-sub">{prettyDate(submission?.submitted_at || submission?.created_at)}</span>
      </div>

      <div className="br-header-right">
        <span className={`br-status br-status-${status.replace(/_/g, '-')}`}>{statusLabel}</span>
        {flagCount > 0 && (
          <button onClick={onJumpToFlags} className="br-flag-badge" aria-label={`${flagCount} flags`}>
            <FlagIcon style={{ width: 12, height: 12 }} />
            <span>{flagCount}</span>
          </button>
        )}
        {locked && (
          <span className="br-locked-pill">
            <LockClosedIcon style={{ width: 11, height: 11 }} /> Approved
          </span>
        )}
        {!locked && dirty && (
          <span className="br-dirty-pill">Unsaved</span>
        )}
      </div>
    </header>
  )
}

// ────────────────────────────────────────────────────────────────────
// Section nav (desktop)
// ────────────────────────────────────────────────────────────────────
function SectionNav({ result, activeId, onPick }) {
  return (
    <div className="br-sidenav-inner">
      <div className="br-sidenav-title">Sections</div>
      <ol className="br-sidenav-list">
        {result.sections.map((s, i) => (
          <li key={s.id}>
            <button
              onClick={() => onPick(s.id)}
              className={`br-sidenav-link ${activeId === s.id ? 'is-active' : ''}`}
            >
              <span className="br-sidenav-step">0{i + 1}</span>
              <span>{s.label}</span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────
// Translation panel — all 21 items inline editable
// ────────────────────────────────────────────────────────────────────
function TranslationPanel({ result, locked, onChangeItem, onChangeAssumption, enrichmentMap, activeSectionId, setActiveSectionId, isDesktop }) {
  const sectionRefs = useRef({})

  // Sync activeSectionId with scroll position (desktop side nav).
  useEffect(() => {
    if (!isDesktop) return
    function onScroll() {
      const root = document.querySelector('.br-centre')
      if (!root) return
      const top = root.scrollTop + 60
      const ids = Object.keys(sectionRefs.current)
      let current = ids[0]
      for (const id of ids) {
        const el = sectionRefs.current[id]
        if (el && el.offsetTop <= top) current = id
      }
      if (current !== activeSectionId) setActiveSectionId(current)
    }
    const root = document.querySelector('.br-centre')
    root?.addEventListener('scroll', onScroll, { passive: true })
    return () => root?.removeEventListener('scroll', onScroll)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDesktop, result?.sections])

  // Map of "AI-inferred" markers per item key, taken from
  // submission.enriched_answers.expansions — when an expansion
  // mentions a question id, we mark items derived from it.
  const aiInferredKeys = useMemo(() => {
    const out = new Set()
    if (!enrichmentMap?.expansions) return out
    // We can't perfectly map expansion → translation item, so we mark
    // the first 5 items (Understand section is the most directly
    // derived from raw answers) when any expansion happened.
    if (enrichmentMap.expansions.length > 0) {
      for (const it of (BRIEF_V2_SECTIONS[0]?.items || [])) out.add(it.key)
    }
    return out
  }, [enrichmentMap])

  return (
    <div className="br-translation">
      {result.sections.map((section, idx) => (
        <section
          key={section.id}
          id={`br-${section.id}`}
          ref={el => (sectionRefs.current[section.id] = el)}
          className="br-section"
        >
          <header className="br-section-head">
            <span className="br-section-chip">Section {idx + 1}</span>
            <h2 className="br-section-title">{section.label}</h2>
          </header>
          {section.items.map(item => (
            <ItemCard
              key={item.id}
              item={item}
              locked={locked}
              aiInferred={aiInferredKeys.has(item.key)}
              onChange={(content) => onChangeItem(section.id, item.key, content)}
              onChangeAssumption={onChangeAssumption}
            />
          ))}
        </section>
      ))}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────
// One editable item card
// ────────────────────────────────────────────────────────────────────
function ItemCard({ item, locked, aiInferred, onChange, onChangeAssumption }) {
  const def = BRIEF_V2_ITEM_BY_KEY[item.key] || { shape: 'text' }
  const [editing, setEditing] = useState(false)

  function commitText(v) {
    onChange(v)
    setEditing(false)
  }

  return (
    <article className="br-item">
      <header className="br-item-head">
        <span className="br-item-num">{String(item.id).padStart(2, '0')}</span>
        <h3 className="br-item-title">{item.title}</h3>
        {aiInferred && (
          <span className="br-ai-badge" title="Includes content the AI inferred from other answers">AI inferred</span>
        )}
        {!locked && (
          <button onClick={() => setEditing(v => !v)} className="br-edit-btn" aria-label="Edit">
            <PencilSquareIcon style={{ width: 12, height: 12 }} />
            <span>{editing ? 'Done' : 'Edit'}</span>
          </button>
        )}
      </header>
      <div className="br-item-body">
        {item.content == null ? (
          <p className="br-empty">(not generated)</p>
        ) : (
          <ItemContent
            shape={def.shape}
            content={item.content}
            editing={editing && !locked}
            onCommit={commitText}
            onChangeAssumption={onChangeAssumption}
            itemKey={item.key}
          />
        )}
      </div>
    </article>
  )
}

function ItemContent({ shape, content, editing, onCommit, onChangeAssumption, itemKey }) {
  switch (shape) {
    case 'text':          return <TextField value={content} editing={editing} onCommit={onCommit} />
    case 'list':          return <ListField value={content} editing={editing} onCommit={onCommit} />
    case 'rows':          return <RowsField value={content} editing={editing} onCommit={onCommit} />
    case 'badged_list':   return <BadgedListField value={content} editing={editing} onCommit={onCommit} itemKey={itemKey} onChangeAssumption={onChangeAssumption} />
    case 'numbered_list': return <NumberedField value={content} editing={editing} onCommit={onCommit} />
    case 'roles':         return <RolesField value={content} editing={editing} onCommit={onCommit} />
    case 'levels':        return <LevelsField value={content} editing={editing} onCommit={onCommit} />
    case 'journey':       return <JourneyField value={content} editing={editing} onCommit={onCommit} />
    case 'competitors':   return <CompetitorsField value={content} editing={editing} onCommit={onCommit} />
    case 'inventory':     return <InventoryField value={content} editing={editing} onCommit={onCommit} />
    default:              return <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', margin: 0 }}>{JSON.stringify(content, null, 2)}</pre>
  }
}

function TextField({ value, editing, onCommit }) {
  const [draft, setDraft] = useState(String(value || ''))
  useEffect(() => { setDraft(String(value || '')) }, [value])
  if (editing) {
    return (
      <textarea
        className="br-textarea"
        rows={5}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={() => onCommit(draft)}
      />
    )
  }
  return <p className="br-text">{String(value || '').trim() || '—'}</p>
}

function ListField({ value, editing, onCommit }) {
  const arr = Array.isArray(value) ? value : []
  const [draft, setDraft] = useState(arr.join('\n'))
  useEffect(() => { setDraft((Array.isArray(value) ? value : []).join('\n')) }, [value])
  if (editing) {
    return (
      <div>
        <textarea
          className="br-textarea"
          rows={Math.max(4, arr.length + 1)}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={() => onCommit(draft.split('\n').map(s => s.trim()).filter(Boolean))}
        />
        <div className="br-edit-hint">One entry per line.</div>
      </div>
    )
  }
  if (!arr.length) return <p className="br-empty">No items.</p>
  return (
    <ul className="br-list">
      {arr.map((e, i) => <li key={i}>{typeof e === 'string' ? e : JSON.stringify(e)}</li>)}
    </ul>
  )
}

function RowsField({ value, editing, onCommit }) {
  const rows = Array.isArray(value?.rows) ? value.rows : []
  if (!rows.length && !editing) return <p className="br-empty">No rows.</p>
  if (editing) {
    return <EditableRows rows={rows} onCommit={(next) => onCommit({ rows: next })} />
  }
  return (
    <div className="br-rows">
      <div className="br-rows-head"><span>Asked for</span><span>Actually need</span></div>
      {rows.map((r, i) => (
        <div key={i} className="br-row">
          <div className="br-row-cell"><span className="br-row-label">Asked</span><span>{r.left || '—'}</span></div>
          <div className="br-row-cell"><span className="br-row-label">Need</span><span>{r.right || '—'}</span></div>
        </div>
      ))}
    </div>
  )
}

function EditableRows({ rows, onCommit }) {
  const [draft, setDraft] = useState(rows)
  useEffect(() => { setDraft(rows) }, [rows])
  function update(i, side, v) { setDraft(d => d.map((r, idx) => idx === i ? { ...r, [side]: v } : r)) }
  function addRow() { setDraft(d => [...d, { left: '', right: '' }]) }
  function remove(i) { setDraft(d => d.filter((_, idx) => idx !== i)) }
  return (
    <div>
      {draft.map((r, i) => (
        <div key={i} className="br-edit-row">
          <input className="br-input" placeholder="Asked for" value={r.left || ''} onChange={e => update(i, 'left', e.target.value)} onBlur={() => onCommit(draft)} />
          <input className="br-input" placeholder="Actually need" value={r.right || ''} onChange={e => update(i, 'right', e.target.value)} onBlur={() => onCommit(draft)} />
          <button onClick={() => { remove(i); onCommit(draft.filter((_, idx) => idx !== i)) }} className="br-icon-only" aria-label="Remove">
            <XMarkIcon style={{ width: 12, height: 12 }} />
          </button>
        </div>
      ))}
      <button onClick={() => { addRow(); onCommit([...draft, { left: '', right: '' }]) }} className="br-add-mini">+ Row</button>
    </div>
  )
}

function BadgedListField({ value, editing, onCommit, itemKey, onChangeAssumption }) {
  const items = Array.isArray(value?.items) ? value.items : []
  if (!items.length) return <p className="br-empty">None.</p>
  return (
    <ul className="br-badged-list">
      {items.map((it, i) => {
        const status = it.status || it.severity || 'Unknown'
        const variant = statusVariant(status)
        const isAssumption = itemKey === 'assumptions_log'
        return (
          <li key={i} className={`br-badged-row br-badged-${variant}`}>
            <span className="br-badged-text">{it.text || '—'}</span>
            {editing && isAssumption ? (
              <select
                value={status}
                onChange={e => onChangeAssumption?.(i, e.target.value)}
                className="br-mini-select"
              >
                <option value="Confirmed">Confirmed</option>
                <option value="Unconfirmed">Unconfirmed</option>
                <option value="Needs Clarification">Needs Clarification</option>
              </select>
            ) : (
              <span className={`br-badge br-badge-${variant}`}>{status}</span>
            )}
          </li>
        )
      })}
    </ul>
  )
}

function NumberedField({ value, editing, onCommit }) {
  const arr = Array.isArray(value) ? value : []
  const [draft, setDraft] = useState(arr.join('\n'))
  useEffect(() => { setDraft((Array.isArray(value) ? value : []).join('\n')) }, [value])
  if (editing) {
    return (
      <div>
        <textarea className="br-textarea" rows={Math.max(4, arr.length + 1)} value={draft} onChange={e => setDraft(e.target.value)} onBlur={() => onCommit(draft.split('\n').map(s => s.trim()).filter(Boolean))} />
        <div className="br-edit-hint">One question per line. Order = priority.</div>
      </div>
    )
  }
  if (!arr.length) return <p className="br-empty">No questions.</p>
  return (
    <ol className="br-numbered">
      {arr.map((q, i) => (
        <li key={i}><span className="br-num">{String(i + 1).padStart(2, '0')}</span>{q}</li>
      ))}
    </ol>
  )
}

function RolesField({ value, editing, onCommit }) {
  const v = value || {}
  const keys = ['primary', 'secondary', 'accent', 'background', 'surface', 'avoid']
  const [draft, setDraft] = useState(v)
  useEffect(() => { setDraft(value || {}) }, [value])
  if (editing) {
    return (
      <div className="br-roles">
        {keys.map(k => (
          <label key={k} className="br-roles-row-edit">
            <span className="br-roles-label">{capitalise(k)}</span>
            <input className="br-input" value={draft[k] || ''} onChange={e => setDraft({ ...draft, [k]: e.target.value })} onBlur={() => onCommit(draft)} />
          </label>
        ))}
      </div>
    )
  }
  return (
    <ul className="br-roles">
      {keys.map(k => (
        <li key={k}>
          <span className="br-roles-label">{capitalise(k)}</span>
          <span className="br-roles-value">{v[k] || '—'}</span>
        </li>
      ))}
    </ul>
  )
}

function LevelsField({ value, editing, onCommit }) {
  const v = value || {}
  const keys = ['display', 'body', 'label', 'avoid']
  const [draft, setDraft] = useState(v)
  useEffect(() => { setDraft(value || {}) }, [value])
  if (editing) {
    return (
      <div className="br-roles">
        {keys.map(k => (
          <label key={k} className="br-roles-row-edit">
            <span className="br-roles-label">{capitalise(k)}</span>
            <input className="br-input" value={draft[k] || ''} onChange={e => setDraft({ ...draft, [k]: e.target.value })} onBlur={() => onCommit(draft)} />
          </label>
        ))}
      </div>
    )
  }
  return (
    <ul className="br-roles">
      {keys.map(k => (
        <li key={k}>
          <span className="br-roles-label">{capitalise(k)}</span>
          <span className="br-roles-value">{v[k] || '—'}</span>
        </li>
      ))}
    </ul>
  )
}

function JourneyField({ value, editing, onCommit }) {
  const steps = Array.isArray(value) ? value : []
  if (editing) {
    return <EditableJourney steps={steps} onCommit={onCommit} />
  }
  if (!steps.length) return <p className="br-empty">No journey.</p>
  return (
    <ol className="br-journey">
      {steps.map((s, i) => (
        <li key={i} className="br-journey-step">
          <span className="br-journey-num">{s.step || i + 1}</span>
          <div>
            <div className="br-journey-title">{s.title || s.stage || 'Step'}</div>
            {s.action && <div className="br-journey-action">{s.action}</div>}
            {(s.emotion || s.feeling) && <span className="br-journey-emotion">{s.emotion || s.feeling}</span>}
          </div>
        </li>
      ))}
    </ol>
  )
}

function EditableJourney({ steps, onCommit }) {
  const [draft, setDraft] = useState(steps)
  useEffect(() => { setDraft(steps) }, [steps])
  function update(i, key, v) { setDraft(d => d.map((s, idx) => idx === i ? { ...s, [key]: v } : s)) }
  return (
    <div>
      {draft.map((s, i) => (
        <div key={i} className="br-edit-row" style={{ flexDirection: 'column', gap: 6 }}>
          <input className="br-input" placeholder="Title" value={s.title || s.stage || ''} onChange={e => update(i, 'title', e.target.value)} onBlur={() => onCommit(draft)} />
          <input className="br-input" placeholder="Action" value={s.action || ''} onChange={e => update(i, 'action', e.target.value)} onBlur={() => onCommit(draft)} />
          <input className="br-input" placeholder="Emotion" value={s.emotion || s.feeling || ''} onChange={e => update(i, 'emotion', e.target.value)} onBlur={() => onCommit(draft)} />
        </div>
      ))}
    </div>
  )
}

function CompetitorsField({ value, editing, onCommit }) {
  const list = Array.isArray(value) ? value : []
  if (editing) {
    return <EditableCompetitors competitors={list} onCommit={onCommit} />
  }
  if (!list.length) return <p className="br-empty">No competitors.</p>
  return (
    <ul className="br-competitors">
      {list.map((c, i) => (
        <li key={i} className="br-competitor">
          <div className="br-competitor-name">{c.name || '—'}</div>
          {c.positioning && <p><strong>Positioning.</strong> {c.positioning}</p>}
          {c.layout && <p><strong>Layout.</strong> {c.layout}</p>}
          {c.differentiation && <p><strong>Where to diverge.</strong> {c.differentiation}</p>}
        </li>
      ))}
    </ul>
  )
}
function EditableCompetitors({ competitors, onCommit }) {
  const [draft, setDraft] = useState(competitors)
  useEffect(() => { setDraft(competitors) }, [competitors])
  function update(i, key, v) { setDraft(d => d.map((c, idx) => idx === i ? { ...c, [key]: v } : c)) }
  return (
    <div>
      {draft.map((c, i) => (
        <div key={i} className="br-edit-row" style={{ flexDirection: 'column' }}>
          <input className="br-input" placeholder="Name" value={c.name || ''} onChange={e => update(i, 'name', e.target.value)} onBlur={() => onCommit(draft)} />
          <input className="br-input" placeholder="Positioning" value={c.positioning || ''} onChange={e => update(i, 'positioning', e.target.value)} onBlur={() => onCommit(draft)} />
          <input className="br-input" placeholder="Layout pattern" value={c.layout || ''} onChange={e => update(i, 'layout', e.target.value)} onBlur={() => onCommit(draft)} />
          <input className="br-input" placeholder="Where to diverge" value={c.differentiation || ''} onChange={e => update(i, 'differentiation', e.target.value)} onBlur={() => onCommit(draft)} />
        </div>
      ))}
    </div>
  )
}

function InventoryField({ value, editing, onCommit }) {
  const list = Array.isArray(value) ? value : []
  if (editing) {
    return <EditableInventory list={list} onCommit={onCommit} />
  }
  if (!list.length) return <p className="br-empty">No inventory.</p>
  return (
    <ul className="br-inventory">
      {list.map((p, i) => {
        const variant = statusVariant(p.status)
        return (
          <li key={i} className="br-inventory-row">
            <div className="br-inventory-head">
              <span className="br-inventory-page">{p.page || 'Page'}</span>
              <span className={`br-badge br-badge-${variant}`}>{p.status || 'Unknown'}</span>
            </div>
            {p.content && <div className="br-inventory-line"><strong>Content.</strong> {p.content}</div>}
            {p.assets && <div className="br-inventory-line"><strong>Assets.</strong> {p.assets}</div>}
          </li>
        )
      })}
    </ul>
  )
}
function EditableInventory({ list, onCommit }) {
  const [draft, setDraft] = useState(list)
  useEffect(() => { setDraft(list) }, [list])
  function update(i, key, v) { setDraft(d => d.map((p, idx) => idx === i ? { ...p, [key]: v } : p)) }
  return (
    <div>
      {draft.map((p, i) => (
        <div key={i} className="br-edit-row" style={{ flexDirection: 'column' }}>
          <input className="br-input" placeholder="Page" value={p.page || ''} onChange={e => update(i, 'page', e.target.value)} onBlur={() => onCommit(draft)} />
          <input className="br-input" placeholder="Content notes" value={p.content || ''} onChange={e => update(i, 'content', e.target.value)} onBlur={() => onCommit(draft)} />
          <input className="br-input" placeholder="Assets notes" value={p.assets || ''} onChange={e => update(i, 'assets', e.target.value)} onBlur={() => onCommit(draft)} />
          <select className="br-mini-select" value={p.status || 'Unknown'} onChange={e => { update(i, 'status', e.target.value); onCommit(draft.map((x, idx) => idx === i ? { ...x, status: e.target.value } : x)) }}>
            <option>Available</option>
            <option>Needs Creation</option>
            <option>Unknown</option>
          </select>
        </div>
      ))}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────
// Right tabs
// ────────────────────────────────────────────────────────────────────
function RightTabs({ current, onSwitch }) {
  return (
    <div className="br-right-tabs" role="tablist">
      <TabBtn id="flags"  current={current} onSwitch={onSwitch} icon={FlagIcon}>Flags</TabBtn>
      <TabBtn id="system" current={current} onSwitch={onSwitch} icon={PaintBrushIcon}>System</TabBtn>
      <TabBtn id="kanban" current={current} onSwitch={onSwitch} icon={Squares2X2Icon}>Kanban</TabBtn>
    </div>
  )
}
function TabBtn({ id, current, onSwitch, icon: Icon, children }) {
  const active = current === id
  return (
    <button role="tab" aria-selected={active} onClick={() => onSwitch(id)} className={`br-tab ${active ? 'is-active' : ''}`}>
      <Icon style={{ width: 13, height: 13 }} /> {children}
    </button>
  )
}

// ────────────────────────────────────────────────────────────────────
// Flags panel
// ────────────────────────────────────────────────────────────────────
function FlagsPanel({ flags, cards, followups = [], locked, onSendQuestion, unblockTargets = [], onApplyUnblocks }) {
  const total = flags.red.length + flags.assumptions.length + flags.questions.length

  // Map "question text → followup record" so each question knows
  // whether it's already been sent + whether it's been answered.
  const followupByQuestion = useMemo(() => {
    const m = new Map()
    for (const f of followups) m.set(normaliseText(f.question_text), f)
    return m
  }, [followups])

  return (
    <div className="br-panel">
      <div className="br-panel-head">
        <h3>Flags</h3>
        <span className="br-panel-sub">{total} to review</span>
      </div>

      {unblockTargets.length > 0 && !locked && (
        <div className="br-unblock-banner">
          <div className="br-unblock-body">
            <div className="br-unblock-title">
              {unblockTargets.length} card{unblockTargets.length === 1 ? '' : 's'} ready to unblock
            </div>
            <div className="br-unblock-meta">
              Client answers cover the block reasons on{' '}
              {unblockTargets.slice(0, 3).map((u, i) => (
                <span key={i}>
                  <strong>{u.taskTitle}</strong>{i < Math.min(unblockTargets.length, 3) - 1 ? ', ' : ''}
                </span>
              ))}
              {unblockTargets.length > 3 ? `, and ${unblockTargets.length - 3} more.` : '.'}
            </div>
          </div>
          <button onClick={onApplyUnblocks} className="br-unblock-btn">Apply</button>
        </div>
      )}

      <Group title={`Red flags (${flags.red.length})`} empty="No red flags.">
        {flags.red.map((f, i) => (
          <FlagItem key={i} icon={ExclamationTriangleIcon} variant={statusVariant(f.severity)}
            text={f.text} meta={f.severity + (f.cardName ? ` · affects "${f.cardName}"` : '')} />
        ))}
      </Group>

      <Group title={`Unconfirmed assumptions (${flags.assumptions.length})`} empty="No assumptions to confirm.">
        {flags.assumptions.map((a, i) => (
          <FlagItem key={i} icon={QuestionMarkCircleIcon} variant={statusVariant(a.status)}
            text={a.text} meta={a.status} />
        ))}
      </Group>

      <Group title={`Blocking questions (${flags.questions.length})`} empty="No open questions.">
        {flags.questions.map((q, i) => {
          const text = q.text || q
          const followup = followupByQuestion.get(normaliseText(text))
          return (
            <QuestionRow
              key={i}
              text={text}
              followup={followup}
              locked={locked}
              onSend={() => onSendQuestion?.(text)}
            />
          )
        })}
      </Group>

      {followups.length > 0 && (
        <Group title={`All follow-ups (${followups.length})`} empty="">
          {followups.map(f => (
            <FollowupRow key={f.token} followup={f} />
          ))}
        </Group>
      )}
    </div>
  )
}

function QuestionRow({ text, followup, locked, onSend }) {
  const status = followup?.status
  const variant = status === 'answered' ? 'ok' : (status === 'sent' ? 'warn' : 'critical')
  return (
    <li className={`br-flag-item br-flag-${variant}`}>
      <QuestionMarkCircleIcon style={{ width: 14, height: 14, flexShrink: 0 }} />
      <div className="br-flag-body">
        <div>{text}</div>
        <div className="br-flag-meta">
          {status === 'answered'
            ? <>Answered {followup.answered_at ? prettyDate(followup.answered_at) : ''}</>
            : status === 'sent'
              ? <>Sent {followup.sent_at ? prettyDate(followup.sent_at) : ''} · awaiting reply</>
              : 'Send to client to unblock'}
        </div>
        {status === 'answered' && followup.answer_text && (
          <div className="br-followup-answer"><strong>Client:</strong> {followup.answer_text}</div>
        )}
      </div>
      {!locked && status !== 'answered' && (
        <button onClick={onSend} className="br-send-btn">
          {status === 'sent' ? 'Resend' : 'Send to client'}
        </button>
      )}
    </li>
  )
}

function FollowupRow({ followup }) {
  const variant = followup.status === 'answered' ? 'ok' : 'warn'
  return (
    <li className={`br-flag-item br-flag-${variant}`}>
      <QuestionMarkCircleIcon style={{ width: 14, height: 14, flexShrink: 0 }} />
      <div className="br-flag-body">
        <div>{followup.question_text}</div>
        <div className="br-flag-meta">
          {followup.status === 'answered'
            ? <>Answered {prettyDate(followup.answered_at)}</>
            : <>Sent {prettyDate(followup.sent_at)}</>}
        </div>
        {followup.answer_text && (
          <div className="br-followup-answer"><strong>Client:</strong> {followup.answer_text}</div>
        )}
      </div>
    </li>
  )
}

function normaliseText(s) { return String(s || '').trim().toLowerCase().replace(/\s+/g, ' ') }
function Group({ title, children, empty }) {
  const list = Array.isArray(children) ? children.filter(Boolean) : (children ? [children] : [])
  return (
    <div className="br-group">
      <div className="br-group-head">{title}</div>
      {list.length === 0
        ? <div className="br-group-empty">{empty}</div>
        : <ul className="br-flag-list">{children}</ul>}
    </div>
  )
}
function FlagItem({ icon: Icon, variant, text, meta }) {
  return (
    <li className={`br-flag-item br-flag-${variant}`}>
      <Icon style={{ width: 14, height: 14, flexShrink: 0 }} />
      <div className="br-flag-body">
        <div>{text}</div>
        <div className="br-flag-meta">{meta}</div>
      </div>
    </li>
  )
}

// ────────────────────────────────────────────────────────────────────
// Design-system panel (editable)
// ────────────────────────────────────────────────────────────────────
function DesignSystemPanel({ ds, locked, onChange }) {
  if (!ds) {
    return (
      <div className="br-panel">
        <div className="br-panel-head"><h3>Design system</h3></div>
        <p className="br-empty">The pipeline didn't produce a design system for this submission.</p>
      </div>
    )
  }
  const sections = [
    { key: 'color',           label: 'Color',           keys: ['primary', 'secondary', 'accent', 'background', 'surface'] },
    { key: 'typography',      label: 'Typography',      keys: ['display', 'body', 'label'] },
    { key: 'spacing',         label: 'Spacing',         keys: ['density', 'scale', 'rationale'] },
    { key: 'component',       label: 'Components',      keys: ['corner_radius', 'radius_reason', 'density', 'borders'] },
    { key: 'motion',          label: 'Motion',          keys: ['speed', 'transition', 'speed_reason'] },
    { key: 'visual_language', label: 'Visual language', keys: ['imagery_type', 'ui_style', 'imagery_treatment'] },
  ]
  function setField(group, key, val) {
    if (locked) return
    onChange({ [group]: { ...(ds[group] || {}), [key]: val } })
  }
  return (
    <div className="br-panel">
      <div className="br-panel-head"><h3>Design system</h3></div>
      {sections.map(s => (
        <div key={s.key} className="br-ds-group">
          <div className="br-group-head">{s.label}</div>
          <ul className="br-ds-list">
            {s.keys.map(k => (
              <li key={k}>
                <span className="br-roles-label">{capitalise(k.replace(/_/g, ' '))}</span>
                {locked
                  ? <span className="br-roles-value">{ds[s.key]?.[k] || '—'}</span>
                  : <input className="br-input" value={ds[s.key]?.[k] || ''} onChange={e => setField(s.key, k, e.target.value)} />}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────
// Kanban preview
// ────────────────────────────────────────────────────────────────────
function KanbanPreview({ kanban }) {
  const tasks = kanban?.tasks || []
  if (!tasks.length) {
    return (
      <div className="br-panel">
        <div className="br-panel-head"><h3>Kanban</h3></div>
        <p className="br-empty">No kanban cards derived. (Phase 4 builds these from item 4.)</p>
      </div>
    )
  }
  return (
    <div className="br-panel">
      <div className="br-panel-head"><h3>Kanban preview</h3><span className="br-panel-sub">{tasks.length} cards · Todo column</span></div>
      <ul className="br-kanban-list">
        {tasks.map(t => (
          <li key={t.id} className={`br-kanban-card ${t.blocked ? 'is-blocked' : ''}`}>
            <div className="br-kanban-name">{t.title}</div>
            <div className="br-kanban-preview">{firstLine(t.description) || '—'}</div>
            <div className="br-kanban-meta">
              {t.blocked && <span className="br-mini-badge br-mini-badge-warn">Blocked</span>}
              {t.v2?.inventoryEntry?.status && <span className="br-mini-badge">{t.v2.inventoryEntry.status}</span>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────
// Bottom action bar
// ────────────────────────────────────────────────────────────────────
function BottomBar({ locked, dirty, saving, approving, flagCount, onSave, onApprove, onUnlock, onResolveFlags, onExport, onViewBoard, isMobile }) {
  return (
    <div className="br-bottombar">
      <div className="br-bottombar-left">
        {flagCount > 0 && (
          <button onClick={onResolveFlags} className="br-btn br-btn-quiet">
            <FlagIcon style={{ width: 14, height: 14 }} />
            <span>{!isMobile ? `Resolve flags (${flagCount})` : flagCount}</span>
          </button>
        )}
        {isMobile && (
          <button onClick={onViewBoard} className="br-btn br-btn-quiet">
            <Squares2X2Icon style={{ width: 14, height: 14 }} />
            <span>Board</span>
          </button>
        )}
      </div>
      <div className="br-bottombar-right">
        <button onClick={onExport} className="br-btn br-btn-quiet">
          <ArrowDownTrayIcon style={{ width: 14, height: 14 }} />
          <span>Export</span>
        </button>
        {locked ? (
          <button onClick={onUnlock} className="br-btn br-btn-quiet">
            <LockOpenIcon style={{ width: 14, height: 14 }} /> Unlock
          </button>
        ) : (
          <>
            <button onClick={onSave} disabled={saving || !dirty} className="br-btn br-btn-quiet">
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button onClick={onApprove} disabled={approving} className="br-btn br-btn-primary">
              {approving ? 'Approving…' : 'Approve brief'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────
// Mobile tab bar
// ────────────────────────────────────────────────────────────────────
function MobileTabBar({ current, onSwitch }) {
  return (
    <nav className="br-mobile-tabbar" aria-label="View">
      <button onClick={() => onSwitch('brief')}  className={`br-mobile-tab ${current === 'brief' ? 'is-active' : ''}`}>
        <EyeIcon style={{ width: 14, height: 14 }} /> Brief
      </button>
      <button onClick={() => onSwitch('flags')}  className={`br-mobile-tab ${current === 'flags' ? 'is-active' : ''}`}>
        <FlagIcon style={{ width: 14, height: 14 }} /> Flags
      </button>
      <button onClick={() => onSwitch('system')} className={`br-mobile-tab ${current === 'system' ? 'is-active' : ''}`}>
        <PaintBrushIcon style={{ width: 14, height: 14 }} /> System
      </button>
    </nav>
  )
}

// ────────────────────────────────────────────────────────────────────
// Tablet drawer
// ────────────────────────────────────────────────────────────────────
function DrawerPanel({ tab, onSwitch, onClose, flags, cards, ds, kanban, locked, onChangeDs, followups, onSendQuestion, unblockTargets, onApplyUnblocks }) {
  return (
    <div className="br-drawer-backdrop" onClick={onClose}>
      <aside className="br-drawer" onClick={e => e.stopPropagation()} aria-label="Drawer">
        <header className="br-drawer-head">
          <span className="br-eyebrow">Companion</span>
          <button onClick={onClose} className="br-icon-only"><XMarkIcon style={{ width: 14, height: 14 }} /></button>
        </header>
        <RightTabs current={tab} onSwitch={onSwitch} />
        <div className="br-drawer-body">
          {tab === 'flags'  && <FlagsPanel flags={flags} cards={cards} followups={followups} locked={locked} onSendQuestion={onSendQuestion} unblockTargets={unblockTargets} onApplyUnblocks={onApplyUnblocks} />}
          {tab === 'system' && <DesignSystemPanel ds={ds} locked={locked} onChange={onChangeDs} />}
          {tab === 'kanban' && <KanbanPreview kanban={kanban} />}
        </div>
      </aside>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────
// Mobile kanban full-screen bottom sheet
// ────────────────────────────────────────────────────────────────────
function KanbanSheet({ kanban, onClose }) {
  return (
    <div className="br-sheet-backdrop" onClick={onClose}>
      <div className="br-sheet" onClick={e => e.stopPropagation()}>
        <header className="br-sheet-head">
          <span className="br-eyebrow">Kanban preview</span>
          <button onClick={onClose} className="br-icon-only"><XMarkIcon style={{ width: 14, height: 14 }} /></button>
        </header>
        <div className="br-sheet-body">
          <KanbanPreview kanban={kanban} />
        </div>
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────
// Export modal
// ────────────────────────────────────────────────────────────────────
function ExportModal({ result, onClose }) {
  const [busy, setBusy] = useState(null)

  async function exportFullPdf() {
    if (busy) return
    setBusy('full')
    try {
      const mod = await import('../lib/briefV2PdfExport')
      await mod.exportV2BriefAsPdf(result, result?.projectTitle)
      onClose()
    } catch (e) {
      console.error('[export full]', e)
      alert(e.message || 'Could not export.')
    } finally {
      setBusy(null)
    }
  }

  async function exportSummaryPdf() {
    if (busy) return
    setBusy('summary')
    try {
      const { jsPDF: JsPDF } = await import('jspdf')
      const doc = new JsPDF({ orientation: 'p', unit: 'mm', format: 'a4' })
      const items = ['core_problem_clarity', 'project_intent', 'target_audience', 'success_definition', 'deliverables']
      const map = {}
      for (const s of result.sections || []) for (const it of s.items || []) map[it.key] = { title: it.title, content: it.content }
      doc.setFont('helvetica', 'bold'); doc.setFontSize(20)
      doc.text(result.projectTitle || 'Brief summary', 20, 22)
      doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(120)
      doc.text(new Date().toLocaleDateString(), 20, 30)
      let y = 42
      doc.setTextColor(0)
      for (const key of items) {
        const it = map[key]
        if (!it) continue
        doc.setFont('helvetica', 'bold'); doc.setFontSize(12)
        doc.text(it.title, 20, y); y += 5
        doc.setFont('helvetica', 'normal'); doc.setFontSize(10.5); doc.setTextColor(60)
        const body = Array.isArray(it.content) ? it.content.join(', ') : String(it.content || '—')
        const wrapped = doc.splitTextToSize(body, 170)
        doc.text(wrapped, 20, y)
        y += wrapped.length * 5 + 6
        doc.setTextColor(0)
        if (y > 270) { doc.addPage(); y = 20 }
      }
      const filename = (result?.projectTitle || 'brief').toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-summary.pdf'
      doc.save(filename)
      onClose()
    } catch (e) {
      console.error('[export summary]', e)
      alert(e.message || 'Could not export.')
    } finally {
      setBusy(null)
    }
  }

  function exportKanbanCsv() {
    if (busy) return
    setBusy('csv')
    try {
      const rows = [['Name', 'Description', 'Status', 'Block reason']]
      for (const t of result.kanbanCards?.tasks || []) {
        rows.push([t.title || '', (t.description || '').replace(/\n/g, ' ').slice(0, 1000), t.blocked ? 'Blocked' : (t.status || 'Todo'), (t.blocked_reasons || []).map(r => r.text || r.type || '').join('; ')])
      }
      const csv = rows.map(r => r.map(cell => `"${String(cell || '').replace(/"/g, '""')}"`).join(',')).join('\n')
      const blob = new Blob([csv], { type: 'text/csv' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = (result?.projectTitle || 'kanban').toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-kanban.csv'
      document.body.appendChild(a); a.click(); a.remove()
      URL.revokeObjectURL(url)
      onClose()
    } catch (e) {
      console.error('[export csv]', e)
      alert(e.message || 'Could not export.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="br-modal-backdrop" onClick={onClose}>
      <div className="br-modal" onClick={e => e.stopPropagation()}>
        <header className="br-modal-head">
          <span className="br-eyebrow">Export</span>
          <button onClick={onClose} className="br-icon-only"><XMarkIcon style={{ width: 14, height: 14 }} /></button>
        </header>
        <div className="br-export-body">
          <ExportOption
            title="Full translation PDF"
            description="All 21 items grouped by section, with the design system appended. Formatted for client sharing."
            onClick={exportFullPdf}
            busy={busy === 'full'}
          />
          <ExportOption
            title="Brief summary PDF"
            description="One page covering Core Problem Clarity, Project Intent, Target Audience, Success Definition, and Deliverables. For quick sign-off."
            onClick={exportSummaryPdf}
            busy={busy === 'summary'}
          />
          <ExportOption
            title="Kanban CSV"
            description="All task cards with name, description, status, and block reason. For import into Linear / Jira / Notion."
            onClick={exportKanbanCsv}
            busy={busy === 'csv'}
          />
        </div>
      </div>
    </div>
  )
}
function ExportOption({ title, description, onClick, busy }) {
  return (
    <button onClick={onClick} className="br-export-opt" disabled={busy}>
      <div className="br-export-opt-title">{title}</div>
      <div className="br-export-opt-sub">{description}</div>
      <ArrowRightIcon style={{ width: 14, height: 14, color: 'var(--color-text-muted)', flexShrink: 0 }} />
      {busy && <span className="br-export-opt-busy">Generating…</span>}
    </button>
  )
}

// ────────────────────────────────────────────────────────────────────
// Follow-up composer modal — send a blocking question to the client
// ────────────────────────────────────────────────────────────────────
function FollowupComposerModal({ question: initial, onCancel, onSend }) {
  const [question, setQuestion] = useState(initial || '')
  const [context, setContext] = useState(
    "Hi, I'm finalising the brief and would like one more answer to help me get it right."
  )
  const [sending, setSending] = useState(false)
  async function send() {
    if (sending) return
    setSending(true)
    try {
      await onSend(question, context)
    } finally {
      setSending(false)
    }
  }
  return (
    <div className="br-modal-backdrop" onClick={onCancel}>
      <div className="br-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 520 }}>
        <header className="br-modal-head">
          <span>Send to client</span>
          <button onClick={onCancel} className="br-icon-only"><XMarkIcon style={{ width: 14, height: 14 }} /></button>
        </header>
        <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <label className="br-field">
            <span className="br-label">Question</span>
            <textarea className="br-textarea" rows={3} value={question} onChange={e => setQuestion(e.target.value)} />
          </label>
          <label className="br-field">
            <span className="br-label">Context (optional)</span>
            <textarea className="br-textarea" rows={3} value={context} onChange={e => setContext(e.target.value)} />
            <span className="br-edit-hint">A short paragraph the client reads above the question. Keep it warm and brief.</span>
          </label>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
            <button onClick={onCancel} className="br-btn br-btn-quiet">Cancel</button>
            <button onClick={send} disabled={sending || !question.trim()} className="br-btn br-btn-primary">
              {sending ? 'Sending…' : 'Send'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────
// Confirm modal (unlock)
// ────────────────────────────────────────────────────────────────────
function ConfirmModal({ title, body, confirmLabel, onConfirm, onCancel }) {
  return (
    <div className="br-modal-backdrop" onClick={onCancel}>
      <div className="br-modal" onClick={e => e.stopPropagation()}>
        <header className="br-modal-head"><span>{title}</span></header>
        <div style={{ padding: 18 }}>
          <p style={{ margin: '0 0 16px', lineHeight: 1.55, fontSize: 13, color: 'var(--color-text-soft)' }}>{body}</p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={onCancel} className="br-btn br-btn-quiet">Cancel</button>
            <button onClick={onConfirm} className="br-btn br-btn-primary">{confirmLabel || 'Confirm'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────
// Generic
// ────────────────────────────────────────────────────────────────────
function CenteredMessage({ children, spinner }) {
  return (
    <div className="br-centered">
      <Styles />
      {spinner && <div className="br-spinner" />}
      <div>{children}</div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────
function useWindowWidth() {
  const [w, setW] = useState(() => typeof window !== 'undefined' ? window.innerWidth : 1280)
  useEffect(() => {
    function onResize() { setW(window.innerWidth) }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return w
}

function aggregateFlags(result) {
  const red = []
  const assumptions = []
  const questions = []
  if (!result?.sections) return { red, assumptions, questions }
  for (const s of result.sections) {
    for (const it of s.items) {
      if (it.key === 'red_flags' && Array.isArray(it.content?.items)) {
        for (const f of it.content.items) red.push({ ...f })
      }
      if (it.key === 'assumptions_log' && Array.isArray(it.content?.items)) {
        for (const a of it.content.items) {
          if ((a.status || '').toLowerCase() !== 'confirmed') assumptions.push({ ...a })
        }
      }
      if (it.key === 'questions' && Array.isArray(it.content)) {
        for (const q of it.content) questions.push({ text: q })
      }
    }
  }
  return { red, assumptions, questions }
}
function flatFlags({ red, assumptions, questions }) {
  return [
    ...red.map(f => ({ type: 'red_flag', severity: f.severity, text: f.text })),
    ...assumptions.map(a => ({ type: 'assumption', status: a.status, text: a.text })),
    ...questions.map(q => ({ type: 'question', text: q.text || q })),
  ]
}
function statusVariant(s) {
  const v = String(s || '').toLowerCase()
  if (v === 'high' || v === 'needs clarification') return 'critical'
  if (v === 'medium' || v === 'unconfirmed') return 'warn'
  if (v === 'low' || v === 'confirmed' || v === 'available') return 'ok'
  if (v === 'needs creation') return 'warn'
  return 'neutral'
}
function prettyStatus(s) {
  const v = String(s || 'pending')
  if (v === 'complete' || v === 'completed') return 'Ready'
  if (v === 'failed') return 'Failed'
  if (v === 'pending') return 'Pending'
  if (v === 'enriching') return 'Enriching'
  if (v === 'translating') return 'Translating'
  if (v === 'extracting_design_system') return 'Building design system'
  if (v === 'building_kanban') return 'Building board'
  if (v === 'notifying') return 'Wrapping up'
  return capitalise(v)
}
function capitalise(s) { return String(s || '').replace(/^./, c => c.toUpperCase()) }
function prettyDate(iso) {
  if (!iso) return '—'
  try { return new Date(iso).toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) } catch { return '—' }
}
function firstLine(s) {
  if (!s) return ''
  const t = String(s).replace(/\*\*/g, '').split('\n').find(x => x.trim() && !x.startsWith('**'))
  return t ? t.slice(0, 110) : ''
}

// ────────────────────────────────────────────────────────────────────
// Styles
// ────────────────────────────────────────────────────────────────────
function Styles() {
  return (
    <style>{`
      .br-root { font-family: 'Urbanist', sans-serif; background: var(--color-bg); color: var(--color-text); height: 100%; min-height: 100dvh; display: flex; flex-direction: column; }
      .br-header { display: flex; align-items: center; gap: 14px; padding: 12px 22px; border-bottom: 1px solid var(--color-border); background: var(--color-bg); flex-shrink: 0; }
      .br-back { display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; border-radius: 9px; background: transparent; border: 1px solid var(--color-border); color: var(--color-text-soft); cursor: pointer; font: 600 12px 'Urbanist', sans-serif; }
      .br-header-title { display: flex; flex-direction: column; gap: 1px; flex: 1; min-width: 0; }
      .br-eyebrow { font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--color-text-muted); font-weight: 700; }
      .br-name { font-size: 15px; font-weight: 800; }
      .br-sub  { font-size: 11px; color: var(--color-text-muted); }
      .br-header-right { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
      .br-status { font-size: 10px; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase; padding: 3px 10px; border-radius: 100px; background: var(--color-surface); color: var(--color-text-soft); border: 1px solid var(--color-border); }
      .br-status-complete, .br-status-completed { background: rgba(16,185,129,0.12); color: #047857; border-color: rgba(16,185,129,0.35); }
      .br-status-failed { background: rgba(239,68,68,0.10); color: #b91c1c; border-color: rgba(239,68,68,0.35); }
      .br-status-pending, .br-status-enriching, .br-status-translating, .br-status-extracting-design-system, .br-status-building-kanban, .br-status-notifying { background: rgba(139,92,246,0.12); color: var(--color-accent); border-color: rgba(139,92,246,0.35); }
      .br-flag-badge { display: inline-flex; align-items: center; gap: 4px; padding: 4px 10px; background: rgba(239,68,68,0.10); border: 1px solid rgba(239,68,68,0.30); color: #b91c1c; border-radius: 100px; font: 800 11px 'Urbanist', sans-serif; cursor: pointer; }
      .br-locked-pill { display: inline-flex; align-items: center; gap: 5px; padding: 4px 10px; background: rgba(16,185,129,0.12); border: 1px solid rgba(16,185,129,0.35); color: #047857; border-radius: 100px; font: 800 10px 'Urbanist', sans-serif; }
      .br-dirty-pill { padding: 4px 10px; background: rgba(245,158,11,0.10); border: 1px solid rgba(245,158,11,0.30); color: #b45309; border-radius: 100px; font: 800 10px 'Urbanist', sans-serif; }

      .br-layout { flex: 1; display: grid; grid-template-columns: 240px minmax(0, 1fr) 380px; min-height: 0; }
      .br-sidenav { border-right: 1px solid var(--color-border); background: var(--color-card); overflow-y: auto; min-height: 0; }
      .br-sidenav-inner { padding: 18px 14px; }
      .br-sidenav-title { font: 700 10px 'Urbanist', sans-serif; letter-spacing: 0.12em; text-transform: uppercase; color: var(--color-text-muted); margin-bottom: 14px; }
      .br-sidenav-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 3px; }
      .br-sidenav-link { display: flex; align-items: flex-start; gap: 8px; width: 100%; padding: 9px 10px; background: transparent; border: none; cursor: pointer; border-radius: 8px; text-align: left; font: 600 12px 'Urbanist', sans-serif; line-height: 1.35; color: var(--color-text-soft); }
      .br-sidenav-link:hover { background: var(--color-surface); }
      .br-sidenav-link.is-active { background: var(--color-surface); color: var(--color-text); box-shadow: inset 2px 0 0 var(--color-accent); }
      .br-sidenav-step { font: 700 10px 'JetBrains Mono', monospace; color: var(--color-text-muted); flex-shrink: 0; line-height: 1.6; }

      .br-centre { background: var(--color-bg); overflow-y: auto; min-height: 0; min-width: 0; padding-bottom: 80px; }

      .br-rightpanel { border-left: 1px solid var(--color-border); background: var(--color-card); display: flex; flex-direction: column; min-height: 0; }
      .br-right-tabs { display: flex; padding: 12px 12px 0; gap: 4px; border-bottom: 1px solid var(--color-border); }
      .br-tab { display: inline-flex; align-items: center; gap: 5px; padding: 8px 12px; background: transparent; border: 1px solid transparent; border-bottom: none; border-radius: 8px 8px 0 0; font: 600 12px 'Urbanist', sans-serif; color: var(--color-text-soft); cursor: pointer; position: relative; top: 1px; }
      .br-tab.is-active { background: var(--color-bg); border-color: var(--color-border); color: var(--color-text); }
      .br-rightbody { flex: 1; overflow-y: auto; min-height: 0; padding: 16px 16px 90px; }

      .br-translation { padding: 26px 28px; }
      .br-section { margin-bottom: 28px; scroll-margin-top: 70px; }
      .br-section-head { display: flex; align-items: baseline; gap: 12px; margin-bottom: 14px; }
      .br-section-chip { font: 700 10px 'JetBrains Mono', monospace; letter-spacing: 0.08em; text-transform: uppercase; color: var(--color-text-soft); padding: 3px 9px; border-radius: 100px; background: var(--color-card); border: 1px solid var(--color-border); }
      .br-section-title { font: 800 19px 'Urbanist', sans-serif; letter-spacing: -0.01em; margin: 0; }

      .br-item { background: var(--color-card); border: 1px solid var(--color-border); border-radius: 12px; padding: 14px; margin-bottom: 10px; }
      .br-item-head { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
      .br-item-num { font: 700 11px 'JetBrains Mono', monospace; color: var(--color-text-muted); background: var(--color-surface); padding: 3px 8px; border-radius: 6px; border: 1px solid var(--color-border); flex-shrink: 0; }
      .br-item-title { font: 700 14px 'Urbanist', sans-serif; margin: 0; flex: 1; min-width: 0; }
      .br-ai-badge { font: 800 9px 'Urbanist', sans-serif; letter-spacing: 0.04em; text-transform: uppercase; padding: 2px 8px; border-radius: 100px; background: rgba(139,92,246,0.12); color: var(--color-accent); border: 1px solid rgba(139,92,246,0.30); flex-shrink: 0; }
      .br-edit-btn { display: inline-flex; align-items: center; gap: 4px; padding: 4px 9px; background: var(--color-surface); border: 1px solid var(--color-border); color: var(--color-text-soft); border-radius: 7px; font: 700 11px 'Urbanist', sans-serif; cursor: pointer; flex-shrink: 0; }
      .br-item-body { font: 500 12.5px 'Urbanist', sans-serif; line-height: 1.6; color: var(--color-text-soft); }

      .br-text { margin: 0; }
      .br-empty { color: var(--color-text-muted); margin: 0; }
      .br-list { padding-left: 18px; margin: 0; display: flex; flex-direction: column; gap: 5px; }

      .br-rows { display: flex; flex-direction: column; gap: 6px; }
      .br-rows-head { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; font: 700 9px 'Urbanist', sans-serif; letter-spacing: 0.08em; text-transform: uppercase; color: var(--color-text-muted); margin-bottom: 4px; }
      .br-row { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; padding: 9px 12px; background: var(--color-surface); border: 1px solid var(--color-border); border-radius: 9px; }
      .br-row-cell { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
      .br-row-label { display: none; font: 700 9px 'Urbanist', sans-serif; letter-spacing: 0.06em; text-transform: uppercase; color: var(--color-text-muted); }

      .br-badged-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 6px; }
      .br-badged-row { display: flex; gap: 10px; align-items: flex-start; justify-content: space-between; padding: 9px 12px; background: var(--color-surface); border: 1px solid var(--color-border); border-radius: 9px; border-left-width: 3px; }
      .br-badged-critical { border-left-color: #ef4444; background: rgba(239,68,68,0.05); }
      .br-badged-warn     { border-left-color: #f59e0b; background: rgba(245,158,11,0.05); }
      .br-badged-ok       { border-left-color: #10b981; }
      .br-badged-text { flex: 1; font: 500 12.5px 'Urbanist', sans-serif; color: var(--color-text); min-width: 0; }
      .br-badge { font: 800 9px 'Urbanist', sans-serif; letter-spacing: 0.04em; text-transform: uppercase; padding: 2px 8px; border-radius: 100px; flex-shrink: 0; }
      .br-badge-critical { background: #ef4444; color: white; }
      .br-badge-warn     { background: #f59e0b; color: white; }
      .br-badge-ok       { background: #10b981; color: white; }
      .br-badge-neutral  { background: var(--color-text-muted); color: var(--color-bg); }

      .br-numbered { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 6px; }
      .br-numbered li { display: flex; align-items: flex-start; gap: 8px; padding: 9px 12px; background: var(--color-surface); border: 1px solid var(--color-border); border-radius: 9px; }
      .br-num { font: 700 10px 'JetBrains Mono', monospace; color: var(--color-text-muted); flex-shrink: 0; line-height: 1.6; }

      .br-roles { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 6px; }
      .br-roles li, .br-roles-row-edit { display: grid; grid-template-columns: 90px 1fr; gap: 12px; align-items: start; padding: 8px 10px; background: var(--color-surface); border: 1px solid var(--color-border); border-radius: 8px; }
      .br-roles-row-edit { display: grid; }
      .br-roles-label { font: 700 9px 'Urbanist', sans-serif; letter-spacing: 0.08em; text-transform: uppercase; color: var(--color-text-muted); padding-top: 2px; }
      .br-roles-value { color: var(--color-text); }

      .br-journey { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 8px; }
      .br-journey-step { display: grid; grid-template-columns: 24px 1fr; gap: 10px; padding: 9px 12px; background: var(--color-surface); border: 1px solid var(--color-border); border-radius: 9px; }
      .br-journey-num { font: 700 10px 'JetBrains Mono', monospace; color: var(--color-accent); padding-top: 1px; }
      .br-journey-title { font: 700 12.5px 'Urbanist', sans-serif; color: var(--color-text); }
      .br-journey-action { font: 500 12px 'Urbanist', sans-serif; color: var(--color-text-soft); margin-top: 2px; }
      .br-journey-emotion { display: inline-block; margin-top: 4px; padding: 2px 8px; background: rgba(139,92,246,0.12); color: var(--color-accent); border-radius: 100px; font: 700 10px 'Urbanist', sans-serif; }

      .br-competitors { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 10px; }
      .br-competitor { padding: 12px 14px; background: var(--color-surface); border: 1px solid var(--color-border); border-radius: 10px; }
      .br-competitor-name { font: 800 13px 'Urbanist', sans-serif; margin-bottom: 4px; }
      .br-competitor p { margin: 3px 0; font: 500 12px 'Urbanist', sans-serif; color: var(--color-text-soft); }
      .br-competitor strong { color: var(--color-text); }

      .br-inventory { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 8px; }
      .br-inventory-row { padding: 10px 12px; background: var(--color-surface); border: 1px solid var(--color-border); border-radius: 9px; }
      .br-inventory-head { display: flex; gap: 10px; justify-content: space-between; align-items: center; margin-bottom: 5px; }
      .br-inventory-page { font: 700 12.5px 'Urbanist', sans-serif; color: var(--color-text); }
      .br-inventory-line { font: 500 12px 'Urbanist', sans-serif; color: var(--color-text-soft); margin: 2px 0; }
      .br-inventory-line strong { color: var(--color-text); }

      .br-input, .br-textarea, .br-mini-select { width: 100%; padding: 8px 11px; background: var(--color-bg); border: 1px solid var(--color-border); border-radius: 8px; outline: none; font: 500 12.5px 'Urbanist', sans-serif; color: var(--color-text); box-sizing: border-box; }
      .br-textarea { resize: vertical; min-height: 80px; line-height: 1.55; }
      .br-mini-select { cursor: pointer; max-width: 200px; }
      .br-edit-hint { font: 500 10px 'Urbanist', sans-serif; color: var(--color-text-muted); margin-top: 4px; }
      .br-edit-row { display: flex; gap: 6px; margin-bottom: 6px; }
      .br-icon-only { display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; background: transparent; border: 1px solid var(--color-border); border-radius: 6px; color: var(--color-text-soft); cursor: pointer; flex-shrink: 0; }
      .br-add-mini { padding: 5px 11px; background: transparent; border: 1px dashed var(--color-border); border-radius: 7px; color: var(--color-text-soft); font: 700 11px 'Urbanist', sans-serif; cursor: pointer; }

      .br-panel { display: flex; flex-direction: column; gap: 14px; }
      .br-panel-head { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
      .br-panel-head h3 { margin: 0; font: 800 13px 'Urbanist', sans-serif; }
      .br-panel-sub { font: 500 11px 'Urbanist', sans-serif; color: var(--color-text-muted); }
      .br-panel-foot { font: 500 11px 'Urbanist', sans-serif; color: var(--color-text-muted); padding: 10px 12px; background: var(--color-surface); border-radius: 8px; line-height: 1.5; margin: 0; }
      .br-group { display: flex; flex-direction: column; gap: 6px; }
      .br-group-head { font: 700 10px 'Urbanist', sans-serif; letter-spacing: 0.1em; text-transform: uppercase; color: var(--color-text-muted); margin-top: 8px; }
      .br-group-empty { font: 500 11px 'Urbanist', sans-serif; color: var(--color-text-muted); padding: 9px 12px; background: var(--color-surface); border: 1px dashed var(--color-border); border-radius: 8px; }
      .br-flag-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 6px; }
      .br-flag-item { display: flex; gap: 8px; padding: 9px 11px; background: var(--color-surface); border: 1px solid var(--color-border); border-radius: 9px; border-left-width: 3px; }
      .br-flag-critical { border-left-color: #ef4444; background: rgba(239,68,68,0.04); }
      .br-flag-warn     { border-left-color: #f59e0b; background: rgba(245,158,11,0.04); }
      .br-flag-body { flex: 1; min-width: 0; }
      .br-flag-body > :first-child { font: 600 12.5px 'Urbanist', sans-serif; color: var(--color-text); margin-bottom: 2px; }
      .br-flag-meta { font: 600 10px 'Urbanist', sans-serif; color: var(--color-text-muted); letter-spacing: 0.04em; text-transform: uppercase; }
      .br-unblock-banner { display: flex; gap: 10px; align-items: center; padding: 12px 14px; background: rgba(16,185,129,0.08); border: 1px solid rgba(16,185,129,0.30); border-radius: 10px; }
      .br-unblock-body { flex: 1; min-width: 0; }
      .br-unblock-title { font: 700 12.5px 'Urbanist', sans-serif; color: #047857; margin-bottom: 2px; }
      .br-unblock-meta { font: 500 11.5px 'Urbanist', sans-serif; color: var(--color-text-soft); line-height: 1.5; }
      .br-unblock-btn { padding: 7px 14px; background: #10b981; color: white; border: none; border-radius: 8px; font: 800 12px 'Urbanist', sans-serif; cursor: pointer; flex-shrink: 0; }
      .br-unblock-btn:hover { opacity: 0.9; }
      .br-send-btn { padding: 5px 11px; background: var(--color-accent); color: white; border: none; border-radius: 7px; font: 700 11px 'Urbanist', sans-serif; cursor: pointer; flex-shrink: 0; align-self: flex-start; }
      .br-send-btn:hover { opacity: 0.92; }
      .br-followup-answer { margin-top: 6px; padding: 7px 10px; background: var(--color-bg); border: 1px solid var(--color-border); border-radius: 7px; font: 500 12px 'Urbanist', sans-serif; color: var(--color-text); line-height: 1.5; }
      .br-followup-answer strong { font-weight: 700; color: var(--color-text-muted); margin-right: 4px; }
      .br-field { display: flex; flex-direction: column; gap: 5px; }
      .br-label { font: 700 11px 'Urbanist', sans-serif; letter-spacing: 0.04em; text-transform: uppercase; color: var(--color-text-muted); }

      .br-ds-group { padding: 0; }
      .br-ds-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 4px; }
      .br-ds-list li { display: grid; grid-template-columns: 110px 1fr; gap: 10px; align-items: center; padding: 7px 10px; background: var(--color-surface); border-radius: 7px; }

      .br-kanban-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 8px; }
      .br-kanban-card { padding: 11px 13px; background: var(--color-surface); border: 1px solid var(--color-border); border-radius: 9px; }
      .br-kanban-card.is-blocked { border-left: 3px solid #f59e0b; }
      .br-kanban-name { font: 700 13px 'Urbanist', sans-serif; color: var(--color-text); margin-bottom: 4px; }
      .br-kanban-preview { font: 500 11.5px 'Urbanist', sans-serif; color: var(--color-text-muted); line-height: 1.5; }
      .br-kanban-meta { display: flex; gap: 5px; margin-top: 8px; }
      .br-mini-badge { font: 700 9px 'Urbanist', sans-serif; letter-spacing: 0.04em; text-transform: uppercase; padding: 2px 7px; border-radius: 100px; background: var(--color-card); border: 1px solid var(--color-border); color: var(--color-text-soft); }
      .br-mini-badge-warn { background: rgba(245,158,11,0.12); border-color: rgba(245,158,11,0.30); color: #b45309; }

      .br-bottombar { position: sticky; bottom: 0; display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 12px 22px; background: var(--color-bg); border-top: 1px solid var(--color-border); flex-shrink: 0; z-index: 8; }
      .br-bottombar-left { display: flex; gap: 8px; align-items: center; }
      .br-bottombar-right { display: flex; gap: 8px; align-items: center; }
      .br-btn { display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; background: var(--color-card); border: 1px solid var(--color-border); border-radius: 9px; font: 700 13px 'Urbanist', sans-serif; color: var(--color-text); cursor: pointer; }
      .br-btn:disabled { opacity: 0.5; cursor: not-allowed; }
      .br-btn-quiet { background: var(--color-surface); }
      .br-btn-primary { background: var(--color-accent); color: white; border-color: transparent; }

      .br-mobile-tabbar { display: none; }
      .br-floating-trigger { display: none; }

      .br-modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.5); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; padding: 20px; z-index: 200; }
      .br-modal { width: 100%; max-width: 480px; background: var(--color-bg); border: 1px solid var(--color-border); border-radius: 14px; overflow: hidden; max-height: 90vh; display: flex; flex-direction: column; }
      .br-modal-head { display: flex; align-items: center; justify-content: space-between; padding: 14px 18px; border-bottom: 1px solid var(--color-border); font: 800 14px 'Urbanist', sans-serif; }

      .br-export-body { display: flex; flex-direction: column; gap: 8px; padding: 14px; overflow-y: auto; }
      .br-export-opt { display: flex; align-items: center; gap: 14px; padding: 14px; background: var(--color-card); border: 1px solid var(--color-border); border-radius: 11px; font-family: inherit; text-align: left; cursor: pointer; position: relative; }
      .br-export-opt:hover { border-color: var(--color-accent); }
      .br-export-opt:disabled { opacity: 0.55; cursor: wait; }
      .br-export-opt-title { font: 800 13px 'Urbanist', sans-serif; }
      .br-export-opt-sub { font: 500 11.5px 'Urbanist', sans-serif; color: var(--color-text-soft); margin-top: 3px; line-height: 1.5; }
      .br-export-opt-busy { position: absolute; top: 10px; right: 14px; font: 600 11px 'Urbanist', sans-serif; color: var(--color-accent); }

      .br-drawer-backdrop, .br-sheet-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.4); z-index: 150; }
      .br-drawer { position: fixed; right: 0; top: 0; bottom: 0; width: 92%; max-width: 420px; background: var(--color-bg); border-left: 1px solid var(--color-border); display: flex; flex-direction: column; animation: br-slide-in 0.2s ease; }
      .br-drawer-head { display: flex; align-items: center; justify-content: space-between; padding: 14px 18px; border-bottom: 1px solid var(--color-border); }
      .br-drawer-body { flex: 1; overflow-y: auto; padding: 16px; }
      @keyframes br-slide-in { from { transform: translateX(100%); } to { transform: translateX(0); } }
      .br-sheet { position: fixed; left: 0; right: 0; bottom: 0; max-height: 90vh; background: var(--color-bg); border-top-left-radius: 18px; border-top-right-radius: 18px; border-top: 1px solid var(--color-border); display: flex; flex-direction: column; animation: br-sheet-up 0.2s ease; }
      .br-sheet-head { display: flex; align-items: center; justify-content: space-between; padding: 14px 18px; border-bottom: 1px solid var(--color-border); }
      .br-sheet-body { flex: 1; overflow-y: auto; padding: 16px; }
      @keyframes br-sheet-up { from { transform: translateY(100%); } to { transform: translateY(0); } }

      .br-centered { display: flex; align-items: center; justify-content: center; flex-direction: column; gap: 14px; min-height: 100dvh; padding: 28px; text-align: center; color: var(--color-text-soft); font: 500 13px 'Urbanist', sans-serif; line-height: 1.55; }
      .br-spinner { width: 32px; height: 32px; border-radius: 50%; border: 3px solid var(--color-border); border-top-color: var(--color-accent); animation: br-spin 0.8s linear infinite; }
      @keyframes br-spin { to { transform: rotate(360deg); } }

      /* Tablet */
      @media (max-width: 1023px) {
        .br-layout { grid-template-columns: 1fr; }
        .br-sidenav, .br-rightpanel { display: none; }
        .br-translation { padding: 22px 18px; }
        .br-floating-trigger { display: inline-flex; align-items: center; gap: 6px; padding: 10px 16px; position: fixed; right: 16px; bottom: 78px; background: var(--color-text); color: var(--color-bg); border: none; border-radius: 100px; font: 800 12px 'Urbanist', sans-serif; cursor: pointer; box-shadow: 0 12px 30px rgba(0,0,0,0.30); z-index: 12; }
        .br-floating-badge { background: white; color: var(--color-text); border-radius: 100px; padding: 1px 7px; font: 800 10px 'Urbanist', sans-serif; }
      }
      /* Mobile */
      @media (max-width: 767px) {
        .br-header { padding: 10px 14px; gap: 10px; flex-wrap: wrap; }
        .br-back span { display: none; }
        .br-header-title { order: 3; flex-basis: 100%; }
        .br-name { font-size: 14px; }
        .br-floating-trigger { bottom: 130px; }
        .br-mobile-tabbar { display: flex; position: sticky; bottom: 56px; background: var(--color-card); border-top: 1px solid var(--color-border); padding: 8px 12px; gap: 6px; z-index: 10; }
        .br-mobile-tab { flex: 1; display: inline-flex; align-items: center; justify-content: center; gap: 6px; padding: 9px 8px; background: var(--color-surface); border: 1px solid var(--color-border); color: var(--color-text-soft); border-radius: 9px; font: 700 12px 'Urbanist', sans-serif; cursor: pointer; }
        .br-mobile-tab.is-active { background: var(--color-text); color: var(--color-bg); border-color: var(--color-text); }
        .br-bottombar { padding: 10px 12px; }
        .br-bottombar .br-btn { padding: 9px 11px; font-size: 12px; }
        .br-translation { padding: 16px 14px; }
        .br-section-title { font-size: 17px; }
        .br-row { grid-template-columns: 1fr; }
        .br-rows-head { display: none; }
        .br-row-label { display: block; }
      }
    `}</style>
  )
}
