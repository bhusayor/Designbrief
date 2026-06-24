// ────────────────────────────────────────────────────────────────────
// BriefV2View, renders the 21-item brief framework.
//
// 5 sections, 21 cards. Each card shows its global item number, its
// title, and the AI-generated content rendered through a shape-
// specific mini renderer. While a section is still streaming in,
// its cards display a skeleton state so the layout doesn't jump.
//
// Responsive (all media queries scoped to .brief-v2-root via a
// single <style> block at the top, so we don't touch a Tailwind
// config or global stylesheet):
//   ≥1024px desktop  - 2-col card grid + sticky side nav on the
//                      left with active-section highlight.
//   768-1023 tablet  - single column + horizontal tab bar at top.
//   <768  mobile     - single column + sticky section headers + a
//                      floating bottom bar showing translation
//                      progress / Jump to Kanban once complete.
//
// Streaming protocol: parent owns the result object; replaces an
// item's `content` from null to populated as each section call
// resolves. This component re-renders, skeleton → real card.
// ────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowDownTrayIcon,
  ArrowRightIcon,
  ChevronDownIcon,
  ExclamationTriangleIcon,
  PaperAirplaneIcon,
  QuestionMarkCircleIcon,
  ShareIcon,
  CheckBadgeIcon,
} from '@heroicons/react/24/outline'
import {
  BRIEF_V2_SECTIONS,
  emptyContentForShape,
} from '../../lib/briefV2Schema.js'
import BriefV2ShareModal from './BriefV2ShareModal.jsx'

// ────────────────────────────────────────────────────────────────────
// Public component
// ────────────────────────────────────────────────────────────────────
export default function BriefV2View({
  result,
  isStreaming = false,
  onJumpToKanban,
  projectId,
  intakeSubmissionId,
  defaultClientEmail,
  defaultClientName,
  onExportPdf,
  onBuildBoard,
  // Per-section client-review props. When sectionDecisions is set
  // (even to {}) AND onSectionDecision is provided, each section
  // header renders Approve / Request changes buttons + reflects the
  // current decision state. Used by the public /review/<token> page.
  sectionDecisions = null,
  onSectionDecision = null,
  // Revision props, designer-side only. When onRevise is provided,
  // the action bar gets a "Revise" button; when result.revisions[]
  // has entries, a tab strip below the hero lets the designer flip
  // between versions. onRestore is called when the designer hits
  // Restore on an older tab (promotes that version to Latest).
  onRevise = null,
  onRestore = null,
  revising = false,
  pendingReviewNote = null, // legacy single-note (used as fallback when comments[] is empty)
  pendingComments = [],     // full thread from the client. Designer can mark each addressed individually.
  onResolveComment = null,  // (commentId) → void
  showCompletionBanner = false,
  designSystemBuilding = false,
}) {
  // Which version of the brief to render. 'latest' is the live
  // result; any other value is a snapshot id from result.revisions[].
  const [viewedVersion, setViewedVersion] = useState('latest')
  const revisions = Array.isArray(result?.revisions) ? result.revisions : []

  // When a new revision lands, snap the viewer back to Latest so the
  // designer sees the fresh AI output (unless they're actively
  // inspecting an old version, in which case leave them alone).
  useEffect(() => {
    if (revising) setViewedVersion('latest')
  }, [revising])

  // Compute the "displayed" sections/designSystem/score based on
  // viewedVersion. Latest reads off result; otherwise we pluck from
  // the revisions[] history. This is purely render-time, the
  // underlying result state never changes from a tab switch.
  const viewedSnap = viewedVersion === 'latest'
    ? null
    : revisions.find(r => r.id === viewedVersion) || null
  const displayedSections = viewedSnap?.sections || result?.sections || BRIEF_V2_SECTIONS.map(s => ({
    ...s,
    items: s.items.map(it => ({ ...it, content: null })),
  }))
  const displayedProjectTitle = viewedSnap?.projectTitle || result?.projectTitle
  const displayedDesignSystem = viewedSnap?.designSystem ?? result?.designSystem
  const displayedScore = viewedSnap?.score ?? result?.score
  const isViewingOldVersion = viewedVersion !== 'latest' && !!viewedSnap

  const sections = useMemo(() => displayedSections, [displayedSections])

  const totalItems = sections.reduce((n, s) => n + s.items.length, 0)
  const completedItems = sections.reduce(
    (n, s) => n + s.items.filter(it => it.content !== null && it.content !== undefined).length,
    0,
  )
  const progress = totalItems ? completedItems / totalItems : 0
  const allDone = completedItems === totalItems

  // Active section for sticky nav highlight + tab bar selection.
  const sectionRefs = useRef({})
  const [activeSectionId, setActiveSectionId] = useState(sections[0]?.id)
  const [shareOpen, setShareOpen] = useState(false)

  useEffect(() => {
    const els = sections
      .map(s => ({ id: s.id, el: sectionRefs.current[s.id] }))
      .filter(e => e.el)
    if (!els.length) return

    function onScroll() {
      const top = window.scrollY + 100
      let current = els[0].id
      for (const e of els) {
        if (e.el.offsetTop <= top) current = e.id
      }
      setActiveSectionId(current)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => window.removeEventListener('scroll', onScroll)
  }, [sections])

  function scrollToSection(id) {
    const el = sectionRefs.current[id]
    if (!el) return
    const y = el.getBoundingClientRect().top + window.scrollY - 80
    window.scrollTo({ top: y, behavior: 'smooth' })
  }

  return (
    <div className="brief-v2-root">
      <ResponsiveStyles />

      {/* Top tab bar removed, the brief reads as a single flowing
          document now; the natural section-glyph headers serve as
          jump targets via scroll. */}

      <div className="brief-v2-layout">
        {/* Translation map sidebar removed, designers can use the
            tablet tab bar at the top for jumping between sections,
            and the page scrolls naturally for everything else. */}

        {/* Main column, sections + cards (now full-width) */}
        <main className="brief-v2-main">
          {displayedProjectTitle && (
            <header className="brief-v2-hero">
              <div className="brief-v2-hero-row">
                <div className="brief-v2-hero-text">
                  {isViewingOldVersion && (
                    <div className="brief-v2-hero-label">
                      {viewedSnap.label} <span style={{ opacity: 0.6 }}>· read-only</span>
                    </div>
                  )}
                  <h1 className="brief-v2-hero-title">{displayedProjectTitle}</h1>
                  <HeroPills result={result} />
                  <HeroSummary sections={sections} />
                  <div className="brief-v2-hero-meta">
                    21-item framework · {sections.length} sections
                    {isStreaming && !allDone && <span className="brief-v2-hero-pulse"> · generating…</span>}
                    {revising && <span className="brief-v2-hero-pulse"> · revising…</span>}
                  </div>
                </div>
                {displayedScore && <BriefScoreBadge score={displayedScore} />}
              </div>
            </header>
          )}

          {/* Quick Read strip — four KPI cards distilling the
              brief's most-asked questions into a glance. Hides on
              very narrow screens by falling into a horizontal
              scroll snap rail. */}
          <QuickReadStrip sections={sections} />

          {/* Version tab strip, only when there's at least one
              older snapshot to compare against. Latest tab is left;
              older versions stack to the right, newest first. */}
          {revisions.length > 0 && (
            <VersionTabStrip
              revisions={revisions}
              viewedVersion={viewedVersion}
              onSelect={setViewedVersion}
              onRestore={onRestore}
            />
          )}

          {/* Pending client feedback banner, only on the latest
              tab so the designer doesn't see it while inspecting
              old versions. Surfaces the full thread (or the legacy
              single note) + a Revise CTA. */}
          {!isViewingOldVersion && onRevise && (
            (pendingComments && pendingComments.some(c => c.status !== 'resolved'))
              ? (
                <PendingChangesBanner
                  comments={pendingComments}
                  onRevise={onRevise}
                  onResolve={onResolveComment}
                  revising={revising}
                />
              )
              : (pendingReviewNote && (
                <PendingChangesBanner
                  note={pendingReviewNote}
                  onRevise={onRevise}
                  revising={revising}
                />
              ))
          )}

          {/* Revision meta banner, shown on the latest tab when the
              brief has been revised, so designer can see what the
              latest revision was about. */}
          {!isViewingOldVersion && result?.revisionMeta?.status === 'complete' && result.revisionMeta.feedback && (
            <RevisionMetaBanner meta={result.revisionMeta} />
          )}

          {result?.review?.status === 'approved' && !isViewingOldVersion && (
            <ApprovedBanner review={result.review} />
          )}

          {showCompletionBanner && allDone && !isViewingOldVersion && (
            <CompletionBanner
              onShareReview={() => setShareOpen(true)}
              reviewStatus={result?.review?.status}
              onBuildBoard={onBuildBoard}
              onExportPdf={onExportPdf}
              designSystemBuilding={designSystemBuilding}
            />
          )}

          {sections.map((section, sectionIdx) => {
            const decision = sectionDecisions?.[section.id] || null
            const showReview = !!onSectionDecision
            const cfg = SECTION_LAYOUT[section.id]
            const display = cfg || { title: section.label, eyebrow: '', layout: section.items.map(i => [i.key, 'full']) }
            // Map layout config to actual item objects (in declared
            // order). Items not present in the section data fall
            // through silently.
            const orderedCells = display.layout
              .map(([key, width]) => {
                const item = section.items.find(i => i.key === key)
                return item ? { item, width } : null
              })
              .filter(Boolean)
            return (
              <section
                key={section.id}
                id={`brief-v2-${section.id}`}
                ref={el => (sectionRefs.current[section.id] = el)}
                className={`brief-v2-section ${decision?.status ? `brief-v2-section-${decision.status}` : ''}`}
              >
                <SectionHeader
                  index={sectionIdx + 1}
                  title={display.title}
                  eyebrow={display.eyebrow}
                  sectionId={section.id}
                />
                {showReview && (
                  <SectionReviewBar
                    sectionId={section.id}
                    decision={decision}
                    onDecide={onSectionDecision}
                  />
                )}
                <div className="brief-v2-grid">
                  {orderedCells.map(({ item, width }) => (
                    <div
                      key={item.id}
                      className={`brief-v2-cell brief-v2-cell-${width}`}
                    >
                      <BriefCard item={item} />
                    </div>
                  ))}
                </div>
              </section>
            )
          })}

          {/* Design system panel intentionally not rendered in the
              result view. The extracted designSystem object still
              lives on result.designSystem and is consumed by the
              kanban + AI builder pipelines downstream — it just
              isn't shown to the designer here since the brief
              cards already surface the same content (palette,
              typography, etc) in their proper sections. */}

          <div style={{ height: 80 }} />
        </main>
      </div>

      {/* Floating table of contents — bottom-right on desktop +
          mobile. Opens a panel listing all 5 sections; click a
          section to scroll-snap to its header. */}
      <FloatingTOC
        sections={sections.map((s, i) => ({
          id: s.id,
          label: SECTION_LAYOUT[s.id]?.title || s.label,
          index: i + 1,
        }))}
        activeId={activeSectionId}
        onJump={scrollToSection}
      />

      <BriefV2ShareModal
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        projectId={projectId}
        intakeSubmissionId={intakeSubmissionId}
        defaultClientEmail={defaultClientEmail}
        defaultClientName={defaultClientName}
      />

      {/* Mobile floating bottom bar */}
      <div className="brief-v2-bottombar">
        {allDone ? (
          <button onClick={onJumpToKanban} className="brief-v2-bottombar-cta">
            <ArrowRightIcon style={{ width: 16, height: 16 }} />
            Jump to Kanban
          </button>
        ) : (
          <>
            <div className="brief-v2-bottombar-progress">
              <div className="brief-v2-progress-track">
                <div className="brief-v2-progress-fill" style={{ width: `${progress * 100}%` }} />
              </div>
            </div>
            <span className="brief-v2-bottombar-label">{completedItems}/{totalItems}</span>
          </>
        )}
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────
// Section layout — per-section editorial title, eyebrow, and item-
// to-cell-width mapping. The view reorders + re-sizes each item's
// card based on this config, so direction (the showpiece) gets
// full-width palette + typography while boundaries gets a tidy
// 2-up grid.
//
// width: 'full' = 12 cols, 'half' = 6 cols.
// Items present in the section but missing from the layout fall
// through silently (so framework additions don't break the view).
// ────────────────────────────────────────────────────────────────────
const SECTION_LAYOUT = {
  understand: {
    title:   'The Problem',
    eyebrow: 'What we are really solving',
    layout: [
      ['core_problem_clarity', 'full'],
      ['project_intent',       'half'],
      ['business_context',     'half'],
      ['target_audience',      'full'],
      ['success_definition',   'half'],
      ['deliverables',         'half'],
      ['user_journey',         'full'],
    ],
  },
  product_decisions: {
    title:   'Product Decisions',
    eyebrow: 'What we are building, and what we are not',
    layout: [
      ['features_hierarchy', 'full'],
      ['positioning',        'half'],
      ['trust_strategy',     'half'],
    ],
  },
  interrogate: {
    title:   'The Reality Check',
    eyebrow: 'Risks, gaps, and assumptions',
    layout: [
      ['red_flags',       'full'],
      ['wants_vs_needs',  'half'],
      ['assumptions_log', 'half'],
      ['questions',       'full'],
    ],
  },
  direction: {
    title:   'The Creative Direction',
    eyebrow: 'How the brand should look and feel',
    layout: [
      ['brand_personality',          'half'],
      ['tone_mood',                  'half'],
      ['design_personality_ratings', 'full'],
      ['color_direction',            'full'],
      ['typography_direction',       'full'],
      ['emotional_direction',        'half'],
      ['moodboard_direction',        'half'],
    ],
  },
  info_hierarchy: {
    title:   'Information Hierarchy',
    eyebrow: 'What users see first, second, third',
    layout: [
      ['ranked_content', 'full'],
    ],
  },
  landscape: {
    title:   'The Landscape',
    eyebrow: 'Who else lives in this space',
    layout: [
      ['reference_audit',     'full'],
      ['competitor_analysis', 'full'],
    ],
  },
  boundaries: {
    title:   'The Plan',
    eyebrow: 'Scope and content boundaries',
    layout: [
      ['scope_constraints', 'full'],
      ['content_inventory', 'full'],
    ],
  },
  system_foundations: {
    title:   'System Foundations',
    eyebrow: 'Spacing, grid, and component primitives',
    layout: [
      ['spacing_system',   'full'],
      ['grid_system',      'full'],
      ['component_system', 'full'],
    ],
  },
  visual_language: {
    title:   'Visual Language',
    eyebrow: 'Photography, motion, icons, empty + loading states',
    layout: [
      ['visual_language', 'full'],
    ],
  },
  inspiration_library: {
    title:   'Inspiration Library',
    eyebrow: 'Real references to study, with explicit calls',
    layout: [
      ['inspiration_library', 'full'],
    ],
  },
  builder_guidance: {
    title:   'Builder Guidance',
    eyebrow: 'Per-feature instructions for the build pipeline',
    layout: [
      ['ai_builder_guidance', 'full'],
    ],
  },
  build_priorities: {
    title:   'Build Priorities',
    eyebrow: 'What ships first, second, third',
    layout: [
      ['build_phases', 'full'],
    ],
  },
  verdict: {
    title:   "Director's Verdict",
    eyebrow: 'Decisive close — read this if you read nothing else',
    layout: [
      ['director_verdict', 'full'],
    ],
  },
}

// Section accent palette — each section has a hue applied to the
// section number glyph + the eyebrow. Tints stay subtle so the
// content cards lead the page, not the dividers.
const SECTION_TONES = {
  understand:          { tint: 'rgba(59,130,246,0.10)',  ink: '#1d4ed8' },  // blue-700
  product_decisions:   { tint: 'rgba(168,85,247,0.10)',  ink: '#7e22ce' },  // purple-700
  interrogate:         { tint: 'rgba(245,158,11,0.10)',  ink: '#b45309' },  // amber-700
  direction:           { tint: 'rgba(139,92,246,0.10)',  ink: '#6d28d9' },  // violet-700
  info_hierarchy:      { tint: 'rgba(14,165,233,0.10)',  ink: '#0369a1' },  // sky-700
  landscape:           { tint: 'rgba(16,185,129,0.10)',  ink: '#047857' },  // emerald-700
  boundaries:          { tint: 'rgba(239,68,68,0.10)',   ink: '#b91c1c' },  // red-700
  system_foundations:  { tint: 'rgba(100,116,139,0.10)', ink: '#334155' },  // slate-700
  visual_language:     { tint: 'rgba(217,70,239,0.10)',  ink: '#a21caf' },  // fuchsia-700
  inspiration_library: { tint: 'rgba(244,63,94,0.10)',   ink: '#be123c' },  // rose-700
  builder_guidance:    { tint: 'rgba(34,197,94,0.10)',   ink: '#15803d' },  // green-700
  build_priorities:    { tint: 'rgba(249,115,22,0.10)',  ink: '#c2410c' },  // orange-700 / terracotta
  verdict:             { tint: 'rgba(15,23,42,0.10)',    ink: '#0f172a' },  // slate-900, neutral editorial
}

// ── Floating table of contents ─────────────────────────────────────
// Bottom-right pill that toggles a section list. Designed to feel
// like a discrete utility (not a primary nav), so it stays small +
// dark + tucked into the corner. Active section highlights.
function FloatingTOC({ sections, activeId, onJump }) {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (!open) return
    function onKey(e) { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])
  if (!sections || sections.length === 0) return null
  return (
    <>
      {open && (
        <div
          className="brief-v2-toc-backdrop"
          onClick={() => setOpen(false)}
          aria-hidden
        />
      )}
      {open && (
        <nav
          className="brief-v2-toc-panel"
          aria-label="Section navigation"
        >
          <div className="brief-v2-toc-header">
            <span>Jump to</span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="brief-v2-toc-close"
              aria-label="Close section list"
            >
              ✕
            </button>
          </div>
          <ul className="brief-v2-toc-list">
            {sections.map(s => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => { onJump?.(s.id); setOpen(false) }}
                  className={`brief-v2-toc-item ${activeId === s.id ? 'is-active' : ''}`}
                >
                  <span className="brief-v2-toc-num">
                    {String(s.index).padStart(2, '0')}
                  </span>
                  <span className="brief-v2-toc-label">{s.label}</span>
                </button>
              </li>
            ))}
          </ul>
        </nav>
      )}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="brief-v2-toc-fab"
        aria-expanded={open}
        aria-label="Jump to section"
      >
        <span className="brief-v2-toc-fab-icon" aria-hidden>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="8" y1="6" x2="21" y2="6" />
            <line x1="8" y1="12" x2="21" y2="12" />
            <line x1="8" y1="18" x2="21" y2="18" />
            <line x1="3" y1="6" x2="3.01" y2="6" />
            <line x1="3" y1="12" x2="3.01" y2="12" />
            <line x1="3" y1="18" x2="3.01" y2="18" />
          </svg>
        </span>
        <span className="brief-v2-toc-fab-text">Sections</span>
      </button>
    </>
  )
}

// Editorial section header — large section number on the left,
// eyebrow + title stack on the right. Reads like a magazine spread
// rather than a chip + label row.
function SectionHeader({ index, title, eyebrow, sectionId }) {
  const tone = SECTION_TONES[sectionId] || SECTION_TONES.understand
  const num = String(index).padStart(2, '0')
  return (
    <div className="brief-v2-section-header">
      <span
        className="brief-v2-section-num"
        style={{ color: tone.ink }}
        aria-hidden
      >
        {num}
      </span>
      <div className="brief-v2-section-headtext">
        {eyebrow && (
          <span
            className="brief-v2-section-eyebrow"
            style={{ color: tone.ink }}
          >
            {eyebrow}
          </span>
        )}
        <h2 className="brief-v2-section-title">{title}</h2>
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────
// SectionReviewBar, Approve / Request changes UI rendered under
// each section header on the public client review page.
//
// States:
//   - undecided        → two buttons (Approve + Request changes)
//   - approved         → green badge with a Reset link
//   - changes_requested → amber callout containing the client's note
//                         + a Reset link to redo the decision
//
// Request-changes opens an inline note input so the client can
// describe what needs to change without leaving the section.
// ────────────────────────────────────────────────────────────────────
function SectionReviewBar({ sectionId, decision, onDecide }) {
  const [composing, setComposing] = useState(false)
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function fire(status, payloadNote) {
    if (submitting) return
    setSubmitting(true)
    try {
      await onDecide?.(sectionId, status, payloadNote || null)
      setComposing(false)
      setNote('')
    } finally {
      setSubmitting(false)
    }
  }

  if (decision?.status === 'approved') {
    return (
      <div className="brief-v2-srbar brief-v2-srbar-approved" role="status">
        <span className="brief-v2-srbar-pill brief-v2-srbar-pill-good">
          <CheckBadgeIcon style={{ width: 14, height: 14 }} /> Approved
        </span>
        <button
          type="button"
          onClick={() => fire('changes_requested', null)}
          className="brief-v2-srbar-link"
          disabled={submitting}
        >
          Reset
        </button>
      </div>
    )
  }

  if (decision?.status === 'changes_requested') {
    return (
      <div className="brief-v2-srbar brief-v2-srbar-changes">
        <div className="brief-v2-srbar-changes-head">
          <span className="brief-v2-srbar-pill brief-v2-srbar-pill-warn">
            <ExclamationTriangleIcon style={{ width: 14, height: 14 }} /> Changes requested
          </span>
          <button
            type="button"
            onClick={() => fire('approved', null)}
            className="brief-v2-srbar-link"
            disabled={submitting}
          >
            Mark approved
          </button>
        </div>
        {decision.note && (
          <p className="brief-v2-srbar-note">{decision.note}</p>
        )}
      </div>
    )
  }

  if (composing) {
    return (
      <div className="brief-v2-srbar brief-v2-srbar-compose">
        <label className="brief-v2-srbar-compose-label">
          What should change in this section?
        </label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. The audience description is too broad, we only target independent designers."
          rows={3}
          autoFocus
          disabled={submitting}
          className="brief-v2-srbar-textarea"
        />
        <div className="brief-v2-srbar-compose-actions">
          <button
            type="button"
            onClick={() => { setComposing(false); setNote('') }}
            disabled={submitting}
            className="brief-v2-srbar-btn brief-v2-srbar-btn-ghost"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => fire('changes_requested', note.trim())}
            disabled={submitting || !note.trim()}
            className="brief-v2-srbar-btn brief-v2-srbar-btn-warn"
          >
            {submitting ? 'Sending…' : 'Send change request'}
          </button>
        </div>
      </div>
    )
  }

  // Undecided default state.
  return (
    <div className="brief-v2-srbar">
      <span className="brief-v2-srbar-prompt">Looks good?</span>
      <div className="brief-v2-srbar-actions">
        <button
          type="button"
          onClick={() => setComposing(true)}
          disabled={submitting}
          className="brief-v2-srbar-btn brief-v2-srbar-btn-ghost"
        >
          Request changes
        </button>
        <button
          type="button"
          onClick={() => fire('approved', null)}
          disabled={submitting}
          className="brief-v2-srbar-btn brief-v2-srbar-btn-good"
        >
          <CheckBadgeIcon style={{ width: 13, height: 13 }} />
          Approve section
        </button>
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────
// Generic card chrome + content router
// ────────────────────────────────────────────────────────────────────
function BriefCard({ item }) {
  const isLoading = item.content === null || item.content === undefined
  const isError   = item.content && typeof item.content === 'object' && item.content.__error === true
  // Rich/wide shapes get a full-row card. The colour palette, type
  // system, and moodboard refs also need the breathing room, added
  // here so the grid has a clear 2-up-then-stack rhythm.
  const isFullWidth =
    item.shape === 'rows' ||
    item.shape === 'journey' ||
    item.shape === 'competitors' ||
    item.shape === 'inventory' ||
    item.shape === 'roles' ||
    item.shape === 'levels' ||
    item.shape === 'moodboard'

  return (
    <article className={`brief-v2-card ${isFullWidth ? 'is-wide' : ''} ${isLoading ? 'is-loading' : ''} ${isError ? 'is-error' : ''}`}>
      <div className="brief-v2-card-head">
        <span className="brief-v2-card-num">{String(item.id).padStart(2, '0')}</span>
        <h3 className="brief-v2-card-title">{item.title}</h3>
        {item.key === 'questions' && Array.isArray(item.content) && (
          <span className="brief-v2-card-badge">{item.content.length}</span>
        )}
      </div>
      <div className="brief-v2-card-body">
        {isError ? (
          <div className="brief-v2-card-error">
            <p className="brief-v2-card-error-title">This item failed to translate.</p>
            <p className="brief-v2-card-error-sub">
              {item.content.reason === 'parse_empty'
                ? 'The model response was incomplete. Try re-running the translation.'
                : `Reason: ${item.content.reason || 'unknown'}.`}
            </p>
          </div>
        ) : isLoading ? (
          <Skeleton shape={item.shape} />
        ) : (
          <ItemContent shape={item.shape} content={item.content} item={item} />
        )}
      </div>
    </article>
  )
}

// ────────────────────────────────────────────────────────────────────
// Item shape → renderer map
// ────────────────────────────────────────────────────────────────────
function ItemContent({ shape, content, item }) {
  // Key-targeted overrides for items that deserve a visual treatment
  // distinct from the bare shape renderer.
  if (item?.key === 'brand_personality') return <BrandPersonalityContent value={content} />
  if (item?.key === 'tone_mood')         return <ToneMoodContent value={content} />
  if (item?.key === 'red_flags')         return <RedFlagsContent value={content} />

  switch (shape) {
    case 'text':           return <TextContent value={content} />
    case 'list':           return <ListContent value={content} />
    case 'rows':           return <RowsContent value={content} />
    case 'badged_list':    return <BadgedListContent value={content} statuses={item.statuses} />
    case 'numbered_list':  return <QuestionsContent value={content} />
    case 'roles':          return <RolesContent value={content} />
    case 'levels':         return <LevelsContent value={content} />
    case 'journey':        return <JourneyContent value={content} />
    case 'competitors':    return <CompetitorsContent value={content} />
    case 'inventory':      return <InventoryContent value={content} />
    case 'moodboard':      return <MoodboardContent value={content} />
    case 'verdict':        return <VerdictContent value={content} />
    case 'features_hierarchy': return <FeaturesHierarchyContent value={content} />
    case 'ranked_list':    return <RankedListContent value={content} />
    case 'phases':         return <PhasesContent value={content} />
    case 'star_ratings':   return <StarRatingsContent value={content} />
    case 'spacing_scale':  return <SpacingScaleContent value={content} />
    case 'grid_system':    return <GridSystemContent value={content} />
    case 'component_system': return <ComponentSystemContent value={content} />
    case 'visual_language':  return <VisualLanguageContent value={content} />
    case 'inspiration_grid': return <InspirationGridContent value={content} />
    case 'builder_guidance': return <BuilderGuidanceContent value={content} />
    default:               return <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', margin: 0 }}>{JSON.stringify(content, null, 2)}</pre>
  }
}

// ── Brand personality (chips) ──────────────────────────────────────
// brand_personality is a list of "Trait: explanation" strings. Split
// each entry on the first colon so we can render the trait as a
// chip + the explanation as supporting copy underneath.
// Traits dictionary: maps a common brand-personality word to its
// natural opposite + a stable hue. Used to render the AI's free-
// form trait list as paired-label sliders (PDF reference). The
// position of the indicator favours the trait side (~75%) since
// the AI named THAT side as the brand's lean.
//
// Phase 2 will replace this with structured AI output (named axis
// + numeric 0..100 position), removing the dictionary entirely.
const TRAIT_AXES = {
  playful:     { opposite: 'Serious',         hue: '#8b5cf6' },
  serious:     { opposite: 'Playful',         hue: '#8b5cf6' },
  minimal:     { opposite: 'Richly Textured', hue: '#10b981' },
  ornate:      { opposite: 'Minimal',         hue: '#10b981' },
  bold:        { opposite: 'Quiet',           hue: '#f59e0b' },
  quiet:       { opposite: 'Bold',            hue: '#f59e0b' },
  accessible:  { opposite: 'Ultra-Luxury',    hue: '#3b82f6' },
  luxury:      { opposite: 'Accessible',      hue: '#3b82f6' },
  premium:     { opposite: 'Approachable',    hue: '#3b82f6' },
  subtle:      { opposite: 'Full Immersion',  hue: '#ef4444' },
  immersive:   { opposite: 'Subtle Nod',      hue: '#ef4444' },
  rooted:      { opposite: 'Untethered',      hue: '#10b981' },
  regal:       { opposite: 'Casual',          hue: '#a855f7' },
  editorial:   { opposite: 'Conversational',  hue: '#0ea5e9' },
  elevated:    { opposite: 'Grounded',        hue: '#f97316' },
  unapologetic:{ opposite: 'Diplomatic',      hue: '#ef4444' },
  modern:      { opposite: 'Heritage',        hue: '#3b82f6' },
  warm:        { opposite: 'Cool',            hue: '#f97316' },
  cool:        { opposite: 'Warm',            hue: '#0ea5e9' },
  energetic:   { opposite: 'Calm',            hue: '#f59e0b' },
  calm:        { opposite: 'Energetic',       hue: '#10b981' },
  confident:   { opposite: 'Humble',          hue: '#8b5cf6' },
  honest:      { opposite: 'Aspirational',    hue: '#10b981' },
}

function BrandPersonalityContent({ value }) {
  const list = Array.isArray(value) ? value : []
  if (!list.length) return <p className="brief-v2-text">No traits yet.</p>

  // Parse each entry into { trait, explain }, then look up the axis.
  const rows = list.map(entry => {
    const raw = typeof entry === 'string' ? entry : ''
    const colon = raw.indexOf(':')
    const trait = (colon > -1 ? raw.slice(0, colon) : raw).trim()
    const explain = colon > -1 ? raw.slice(colon + 1).trim() : ''
    const axis = TRAIT_AXES[trait.toLowerCase()] || null
    return { trait, explain, axis }
  })

  return (
    <div className="brief-v2-traits">
      {rows.map(({ trait, explain, axis }, i) => {
        if (axis) {
          // Slider layout: trait label on right (the brand IS this),
          // opposite on left (what it's not). Position favours trait.
          return (
            <div key={i} className="brief-v2-trait-slider">
              <div className="brief-v2-trait-slider-labels">
                <span>{axis.opposite}</span>
                <span style={{ color: axis.hue }}>{trait}</span>
              </div>
              <div className="brief-v2-trait-slider-track">
                <div
                  className="brief-v2-trait-slider-fill"
                  style={{ width: '78%', background: axis.hue }}
                />
                <div
                  className="brief-v2-trait-slider-thumb"
                  style={{ left: '78%', background: axis.hue, borderColor: axis.hue }}
                />
              </div>
              {explain && <div className="brief-v2-trait-slider-note">{explain}</div>}
            </div>
          )
        }
        // Fallback to original chip + line for traits we don't
        // have an axis for. Phase 2's structured AI output will
        // eliminate this branch.
        return (
          <div key={i} className="brief-v2-trait">
            <span className="brief-v2-trait-chip">{trait || 'Trait'}</span>
            {explain && <span className="brief-v2-trait-text">{explain}</span>}
          </div>
        )
      })}
    </div>
  )
}

// ── Tone & mood (two visual lanes) ─────────────────────────────────
// The prompt asks for a single string that looks like:
//   "Confident and warm. Never feel like: corporate or sterile."
// We split on "Never feel like:" so we can render the positive
// register and the wrong register as two separated bands, much
// easier to scan than a single sentence with a "but…" buried in it.
// ── Red flags (numbered amber circles) ─────────────────────────────
// red_flags is shaped as { items: [{ text, severity }] }. Each row
// gets a numbered amber circle on the left so the list reads like
// the editorial "this brief needs attention" callout in the PDF
// reference. Severity is shown as a small badge on the right when
// it's High; Medium/Low are quieter to avoid visual noise.
function RedFlagsContent({ value }) {
  const items = Array.isArray(value?.items) ? value.items : []
  if (!items.length) return <p className="brief-v2-text">No red flags.</p>
  return (
    <ol className="brief-v2-redflags">
      {items.map((it, i) => {
        const sev = String(it.severity || '').toLowerCase()
        const tone = sev === 'high' ? 'critical' : sev === 'medium' ? 'warn' : 'ok'
        return (
          <li key={i} className="brief-v2-redflag-row">
            <span className={`brief-v2-redflag-num brief-v2-redflag-num-${tone}`}>{i + 1}</span>
            <span className="brief-v2-redflag-text">{it.text || '-'}</span>
            {sev === 'high' && (
              <span className="brief-v2-redflag-sev">High</span>
            )}
          </li>
        )
      })}
    </ol>
  )
}

function ToneMoodContent({ value }) {
  const raw = String(value || '').trim()
  if (!raw) return <p className="brief-v2-text">No tone defined yet.</p>
  const match = raw.match(/never feel like:?\s*/i)
  let feels = raw
  let never = ''
  if (match) {
    const cutAt = raw.toLowerCase().indexOf(match[0].toLowerCase())
    feels = raw.slice(0, cutAt).trim().replace(/[.\s]+$/, '')
    never = raw.slice(cutAt + match[0].length).trim()
  }
  return (
    <div className="brief-v2-tone">
      <div className="brief-v2-tone-band brief-v2-tone-band-good">
        <span className="brief-v2-tone-icon" aria-hidden>✓</span>
        <div>
          <div className="brief-v2-tone-label">Feels like</div>
          <div className="brief-v2-tone-text">{feels || '-'}</div>
        </div>
      </div>
      {never && (
        <div className="brief-v2-tone-band brief-v2-tone-band-bad">
          <span className="brief-v2-tone-icon" aria-hidden>✕</span>
          <div>
            <div className="brief-v2-tone-label">Never feels like</div>
            <div className="brief-v2-tone-text">{never}</div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Hero pills ──────────────────────────────────────────────────────
// Three small chips below the title that signal the project's
// shape at a glance: the website template name (filled accent),
// the deliverable channel ("Web"), and the designer's role/spec.
// All three fall back gracefully so the row is never empty.
function HeroPills({ result }) {
  // The translator stores _websiteTemplateId on the result so the
  // kanban + builder can pick the right scaffold downstream.
  const tplId = result?._websiteTemplateId || null
  const tplName = pillTemplateName(tplId)
  return (
    <div className="brief-v2-hero-pills">
      {tplName && <span className="brief-v2-hero-pill brief-v2-hero-pill-solid">{tplName}</span>}
      <span className="brief-v2-hero-pill">Web</span>
      <span className="brief-v2-hero-pill">Designer + Art Director</span>
    </div>
  )
}

function pillTemplateName(id) {
  // Tiny inline map so this file stays standalone, no need to
  // import the full templates list just for a label.
  const NAMES = {
    'saas-landing': 'SaaS',
    'ecommerce': 'E-commerce',
    'portfolio': 'Portfolio',
    'editorial': 'Editorial',
    'agency': 'Agency',
    'product-marketing': 'Product Marketing',
    'mobile-app': 'Mobile App',
    'brand-site': 'Brand Site',
    'hybrid': 'Hybrid',
  }
  return NAMES[id] || (id ? id.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : 'Hybrid')
}

// One-paragraph editorial summary pulled from the first item of
// the brief (core_problem_clarity). Falls back to project_intent.
function HeroSummary({ sections }) {
  const understand = sections.find(s => s.id === 'understand')
  const coreItem = understand?.items?.find(i => i.key === 'core_problem_clarity')
  const intentItem = understand?.items?.find(i => i.key === 'project_intent')
  const text = (typeof coreItem?.content === 'string' && coreItem.content.trim())
    || (typeof intentItem?.content === 'string' && intentItem.content.trim())
  if (!text) return null
  return (
    <p className="brief-v2-hero-summary">{text}</p>
  )
}

// ── Quick Read strip ────────────────────────────────────────────────
// Four small KPI-style cards below the hero that distill the brief's
// most-asked-of questions into a single line each. Pulled
// deterministically from the existing items, so no extra AI cost.
// Hidden if the brief is still streaming and none of the source
// items have arrived yet.
function QuickReadStrip({ sections }) {
  const understand = sections.find(s => s.id === 'understand')
  const boundaries = sections.find(s => s.id === 'boundaries')
  const audience  = understand?.items?.find(i => i.key === 'target_audience')?.content
  const success   = understand?.items?.find(i => i.key === 'success_definition')?.content
  const delivs    = understand?.items?.find(i => i.key === 'deliverables')?.content
  const journey   = understand?.items?.find(i => i.key === 'user_journey')?.content
  const scope     = boundaries?.items?.find(i => i.key === 'scope_constraints')?.content

  // Bail until at least one source has streamed in — avoids a row of
  // empty "—" cards on the very first paint.
  const ready = [audience, success, delivs, scope].some(v => v != null && (typeof v === 'string' ? v.trim() : true))
  if (!ready) return null

  const cards = [
    {
      label: 'Audience',
      value: firstSentence(audience) || '—',
      hint: typeof audience === 'string' && /Not for:/i.test(audience)
        ? 'with exclusions' : '',
      hue: '#3b82f6',
    },
    {
      label: 'Goal',
      value: firstSentence(success) || '—',
      hint: '',
      hue: '#10b981',
    },
    {
      label: 'Deliverables',
      value: Array.isArray(delivs)
        ? `${delivs.length} item${delivs.length === 1 ? '' : 's'}`
        : '—',
      hint: Array.isArray(journey) ? `${journey.length} touchpoints` : '',
      hue: '#8b5cf6',
    },
    {
      label: 'Constraints',
      value: Array.isArray(scope)
        ? `${scope.length} bound${scope.length === 1 ? '' : 's'}`
        : '—',
      hint: '',
      hue: '#b45309',
    },
  ]

  return (
    <div className="brief-v2-quickread">
      {cards.map((c, i) => (
        <div key={i} className="brief-v2-quickread-card">
          <div className="brief-v2-quickread-label" style={{ color: c.hue }}>
            {c.label}
          </div>
          <div className="brief-v2-quickread-value">{c.value}</div>
          {c.hint && <div className="brief-v2-quickread-hint">{c.hint}</div>}
        </div>
      ))}
    </div>
  )
}

function firstSentence(v) {
  if (typeof v !== 'string') return ''
  const m = v.trim().match(/^[^.!?]{8,180}([.!?]|$)/)
  return (m ? m[0] : v.trim()).trim()
}

// ── Brief score card ───────────────────────────────────────────────
// Right column of the hero. Big editorial card showing the verdict
// word (CHAOS / THIN / GOOD / STRONG / EXCELLENT) above a donut
// ring + score, the AI's one-line summary, and three sub-score
// bars colour-coded by performance. Replaces the previous compact
// popover badge — clients open the brief and immediately see
// where it sits.
function BriefScoreBadge({ score }) {
  if (!score || typeof score.overall !== 'number') return null
  // Server returns 0-100; the editorial card uses a 0-10 scale so
  // the donut + sub-scores read like an exam grade.
  const tenth = (n) => Math.max(0, Math.min(10, Math.round((Number(n) || 0) / 10)))
  const overall = tenth(score.overall)
  const tone = scoreTone(overall)
  const verdict = (score.rating || verdictFor(overall)).toUpperCase()
  const subs = Array.isArray(score.sub) ? score.sub.slice(0, 3) : []

  return (
    <aside className="brief-v2-scorecard" data-tone={tone}>
      <div className="brief-v2-scorecard-top">
        <DonutRing value={overall} max={10} tone={tone} />
        <div className="brief-v2-scorecard-head">
          <div className="brief-v2-scorecard-label">BRIEF SCORE</div>
          <div className="brief-v2-scorecard-verdict">{verdict}</div>
          {score.summary && (
            <p className="brief-v2-scorecard-summary">{score.summary}</p>
          )}
        </div>
      </div>
      {subs.length > 0 && (
        <ul className="brief-v2-scorecard-bars">
          {subs.map((s, i) => {
            const v = tenth(s.score)
            return (
              <li key={i}>
                <div className="brief-v2-scorecard-bar-meta">
                  <span>{s.label}</span>
                  <span className="brief-v2-scorecard-bar-num">{v}/10</span>
                </div>
                <div className="brief-v2-scorecard-bar">
                  <div
                    className="brief-v2-scorecard-bar-fill"
                    style={{ width: `${v * 10}%`, background: barColor(v) }}
                  />
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </aside>
  )
}

function scoreTone(n) {
  if (n >= 9) return 'excellent'
  if (n >= 7) return 'strong'
  if (n >= 5) return 'good'
  if (n >= 4) return 'thin'
  return 'chaos'
}
function verdictFor(n) {
  if (n >= 9) return 'Excellent'
  if (n >= 7) return 'Strong'
  if (n >= 5) return 'Good'
  if (n >= 4) return 'Thin'
  return 'Chaos'
}
function barColor(n) {
  if (n >= 7) return '#10b981'
  if (n >= 5) return '#f59e0b'
  return '#ef4444'
}

// Donut ring SVG showing a numeric score 0..max as a stroked arc.
// Tone drives the arc colour. Centre shows the score / max.
function DonutRing({ value, max = 10, tone = 'good', size = 96, stroke = 8 }) {
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const pct = Math.max(0, Math.min(1, value / max))
  const dash = pct * circumference
  const colour = tone === 'chaos' ? '#ef4444'
                : tone === 'thin' ? '#f59e0b'
                : tone === 'good' ? '#f59e0b'
                : tone === 'strong' ? '#3b82f6'
                : '#10b981'
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden style={{ flexShrink: 0 }}>
      <circle
        cx={size / 2} cy={size / 2} r={radius}
        fill="none" stroke="var(--color-border)" strokeWidth={stroke}
      />
      <circle
        cx={size / 2} cy={size / 2} r={radius}
        fill="none" stroke={colour} strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={`${dash} ${circumference}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text
        x="50%" y="50%"
        textAnchor="middle" dominantBaseline="central"
        style={{ font: '800 24px "Urbanist", sans-serif', fill: 'var(--color-text)' }}
      >
        {value}
      </text>
      <text
        x="50%" y="65%"
        textAnchor="middle" dominantBaseline="central"
        style={{ font: '700 10px "Urbanist", sans-serif', fill: 'var(--color-text-muted)' }}
      >
        /{max}
      </text>
    </svg>
  )
}

// ── Text ────────────────────────────────────────────────────────────
function TextContent({ value }) {
  return <p className="brief-v2-text">{String(value || '').trim() || '-'}</p>
}

// ── Plain bulleted list ────────────────────────────────────────────
function ListContent({ value }) {
  const list = Array.isArray(value) ? value : []
  if (!list.length) return <p className="brief-v2-text">No items.</p>
  return (
    <ul className="brief-v2-list">
      {list.map((entry, i) => (
        <li key={i}>{typeof entry === 'string' ? entry : safeJsonString(entry)}</li>
      ))}
    </ul>
  )
}

// ── Wants vs Needs two-column rows ─────────────────────────────────
function RowsContent({ value }) {
  const rows = Array.isArray(value?.rows) ? value.rows : []
  if (!rows.length) return <p className="brief-v2-text">No rows.</p>
  return (
    <>
      <div className="brief-v2-rows-head" aria-hidden>
        <span>What they asked for</span>
        <span>What they actually need</span>
      </div>
      <div className="brief-v2-rows">
        {rows.map((r, i) => (
          <div key={i} className="brief-v2-row">
            <div className="brief-v2-row-cell">
              <span className="brief-v2-row-label">Asked</span>
              <span className="brief-v2-row-value">{r.left || '-'}</span>
            </div>
            <div className="brief-v2-row-cell brief-v2-row-cell-right">
              <span className="brief-v2-row-label">Need</span>
              <span className="brief-v2-row-value">{r.right || '-'}</span>
            </div>
          </div>
        ))}
      </div>
    </>
  )
}

// ── Badged list (assumptions, red flags) ───────────────────────────
function BadgedListContent({ value, statuses }) {
  const items = Array.isArray(value?.items) ? value.items : []
  if (!items.length) return <p className="brief-v2-text">None.</p>
  return (
    <ul className="brief-v2-badged-list">
      {items.map((it, i) => {
        const status = it.status || it.severity || 'Unknown'
        const variant = statusVariant(status)
        return (
          <li key={i} className={`brief-v2-badged-row brief-v2-badged-${variant}`}>
            <span className="brief-v2-badged-text">{it.text || '-'}</span>
            <span className={`brief-v2-badge brief-v2-badge-${variant}`}>{status}</span>
          </li>
        )
      })}
    </ul>
  )
}

function statusVariant(s) {
  const v = String(s || '').toLowerCase()
  if (v === 'high' || v === 'needs clarification') return 'critical'
  if (v === 'medium' || v === 'unconfirmed') return 'warn'
  if (v === 'low' || v === 'confirmed' || v === 'available') return 'ok'
  if (v === 'needs creation') return 'warn'
  if (v === 'unknown') return 'neutral'
  return 'neutral'
}

// ── Questions accordion / numbered list ────────────────────────────
function QuestionsContent({ value }) {
  const list = Array.isArray(value) ? value : []
  const [openIdx, setOpenIdx] = useState(null)
  if (!list.length) return <p className="brief-v2-text">No questions.</p>
  return (
    <ol className="brief-v2-questions">
      {list.map((q, i) => {
        const isOpen = openIdx === i
        return (
          <li key={i} className="brief-v2-question">
            <button
              onClick={() => setOpenIdx(isOpen ? null : i)}
              className="brief-v2-question-btn"
              aria-expanded={isOpen}
            >
              <span className="brief-v2-question-num">{String(i + 1).padStart(2, '0')}</span>
              <span className="brief-v2-question-text">{q}</span>
              <ChevronDownIcon
                style={{
                  width: 14, height: 14,
                  transform: isOpen ? 'rotate(180deg)' : 'none',
                  transition: 'transform 0.15s',
                  flexShrink: 0,
                }}
              />
            </button>
            {isOpen && (
              <div className="brief-v2-question-meta">
                <span><PaperAirplaneIcon style={{ width: 11, height: 11 }} /> Priority {i + 1}</span>
                <span><QuestionMarkCircleIcon style={{ width: 11, height: 11 }} /> Blocks progress until answered</span>
              </div>
            )}
          </li>
        )
      })}
    </ol>
  )
}

// ── Color palette (rich) ───────────────────────────────────────────
// Renders three things:
//   1. A swatch grid showing every brand colour with name + hex.
//      Click-to-copy on the hex chip.
//   2. A theme toggle (Light / Dark) sitting above…
//   3. A live brand preview: card + heading + body + button + chip
//      using the actual primary / surface / text tokens for the
//      selected theme, so the designer SEES the palette in use.
//
// Backwards-compatible: if the old shape (primary/secondary as
// plain strings) lands, we fall back to a slim hue-name list.
function RolesContent({ value }) {
  const v = value || {}
  const [theme, setTheme] = useState('light')
  const [copied, setCopied] = useState('')

  const swatches = Array.isArray(v.swatches) ? v.swatches : null
  const tokens = (theme === 'dark' ? v.dark : v.light) || null

  function copyHex(hex) {
    navigator.clipboard?.writeText(hex).then(() => {
      setCopied(hex)
      setTimeout(() => setCopied(c => (c === hex ? '' : c)), 1200)
    }).catch(() => {})
  }

  // Legacy shape fallback.
  if (!swatches && !tokens) {
    const rows = [
      ['Primary',    v.primary],
      ['Secondary',  v.secondary],
      ['Accent',     v.accent],
      ['Background', v.background],
      ['Surface',    v.surface],
    ]
    return (
      <>
        <ul className="brief-v2-roles">
          {rows.map(([label, val]) => (
            <li key={label}>
              <span className="brief-v2-roles-label">{label}</span>
              <span className="brief-v2-roles-value">{val || '-'}</span>
            </li>
          ))}
        </ul>
        {v.avoid && (
          <div className="brief-v2-roles-avoid">
            <span className="brief-v2-roles-avoid-label">Never</span> {v.avoid}
          </div>
        )}
      </>
    )
  }

  return (
    <div className="brief-v2-palette">
      {/* Swatch grid */}
      {swatches && swatches.length > 0 && (
        <div className="brief-v2-swatch-grid">
          {swatches.map((s, i) => (
            <div key={i} className="brief-v2-swatch">
              <div className="brief-v2-swatch-chip" style={{ background: s.hex }} aria-hidden />
              <div className="brief-v2-swatch-meta">
                <div className="brief-v2-swatch-role">{s.role}</div>
                <div className="brief-v2-swatch-name">{s.name}</div>
                <button
                  type="button"
                  onClick={() => copyHex(s.hex)}
                  className="brief-v2-swatch-hex"
                  title="Copy hex"
                >
                  {copied === s.hex ? 'Copied' : s.hex}
                </button>
                {s.intent && <div className="brief-v2-swatch-intent">{s.intent}</div>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Live theme preview */}
      {tokens && (
        <div className="brief-v2-theme-preview">
          <div className="brief-v2-theme-head">
            <span className="brief-v2-theme-title">Live preview</span>
            <div className="brief-v2-theme-toggle" role="tablist" aria-label="Theme">
              <button
                type="button"
                role="tab"
                aria-selected={theme === 'light'}
                onClick={() => setTheme('light')}
                className={`brief-v2-theme-tab ${theme === 'light' ? 'is-active' : ''}`}
              >Light</button>
              <button
                type="button"
                role="tab"
                aria-selected={theme === 'dark'}
                onClick={() => setTheme('dark')}
                className={`brief-v2-theme-tab ${theme === 'dark' ? 'is-active' : ''}`}
              >Dark</button>
            </div>
          </div>
          <div
            className="brief-v2-theme-stage"
            style={{ background: tokens.background, borderColor: tokens.border }}
          >
            {/* Mac window mockup so the live preview feels like a
                real app screen, not a stranded card. */}
            <div
              className="brief-v2-macwin"
              style={{
                background: tokens.surface,
                borderColor: tokens.border,
                color: tokens.text,
              }}
            >
              <div
                className="brief-v2-macwin-titlebar"
                style={{ borderColor: tokens.border }}
              >
                <span className="brief-v2-macwin-dot brief-v2-macwin-dot-r" aria-hidden />
                <span className="brief-v2-macwin-dot brief-v2-macwin-dot-y" aria-hidden />
                <span className="brief-v2-macwin-dot brief-v2-macwin-dot-g" aria-hidden />
                <div className="brief-v2-macwin-nav" style={{ color: tokens.muted }}>
                  <span>Projects</span>
                  <span>Clients</span>
                  <span>Invoices</span>
                </div>
              </div>
              <div className="brief-v2-macwin-body">
                <div className="brief-v2-macwin-h" style={{ color: tokens.text }}>
                  Active Projects
                </div>
                <div className="brief-v2-macwin-sub" style={{ color: tokens.muted }}>
                  3 projects · 2 invoices pending
                </div>
                <div className="brief-v2-macwin-actions">
                  <button
                    type="button"
                    className="brief-v2-macwin-btn"
                    style={{ background: tokens.primary, color: tokens.onPrimary }}
                  >
                    + New Project
                  </button>
                  <button
                    type="button"
                    className="brief-v2-macwin-btn-ghost"
                    style={{ borderColor: tokens.border, color: tokens.text }}
                  >
                    View All
                  </button>
                </div>
                <div
                  className="brief-v2-macwin-row"
                  style={{ background: tokens.background, borderColor: tokens.border }}
                >
                  <span
                    className="brief-v2-macwin-pill"
                    style={{ background: tokens.primary + '22', color: tokens.primary }}
                  >
                    In Progress
                  </span>
                  <span className="brief-v2-macwin-rowtext" style={{ color: tokens.text }}>
                    Branding redesign for Akaani Foods, due in 12 days
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {v.avoid && (
        <div className="brief-v2-roles-avoid">
          <span className="brief-v2-roles-avoid-label">Never</span> {v.avoid}
        </div>
      )}
    </div>
  )
}

// ── Typography (rich) ──────────────────────────────────────────────
// Renders four things:
//   1. A family card per role (display / body / label) showing the
//      font NAME rendered IN that font, plus weights + tracking.
//   2. A desktop / mobile toggle.
//   3. A live type scale preview: each scale token rendered at its
//      actual px size in the actual family + weight.
//   4. "Avoid" footer with the wrong-direction warning.
//
// Google Fonts get auto-injected into <head> once per family.
//
// Legacy fallback: if shape is the old { display: string }, falls
// back to a slim level list.
function LevelsContent({ value }) {
  const v = value || {}
  const [device, setDevice] = useState('desktop')

  const display = isObj(v.display) ? v.display : null
  const body    = isObj(v.body)    ? v.body    : null
  const label   = isObj(v.label)   ? v.label   : null
  const scale = v.scale && (Array.isArray(v.scale.desktop) || Array.isArray(v.scale.mobile)) ? v.scale : null

  // Inject Google Font links once per family on mount + when families change.
  useEffect(() => {
    [display, body, label].forEach(f => {
      if (f?.family && f.google !== false) ensureGoogleFont(f.family, f.weights || [400, 700])
    })
  }, [display?.family, body?.family, label?.family])

  // Legacy fallback.
  if (!display && !body && !label && !scale) {
    const rows = [
      ['Display', v.display],
      ['Body',    v.body],
      ['Label',   v.label],
    ]
    return (
      <>
        <ul className="brief-v2-roles">
          {rows.map(([lab, val]) => (
            <li key={lab}>
              <span className="brief-v2-roles-label">{lab}</span>
              <span className="brief-v2-roles-value">{val || '-'}</span>
            </li>
          ))}
        </ul>
        {v.avoid && (
          <div className="brief-v2-roles-avoid">
            <span className="brief-v2-roles-avoid-label">Avoid</span> {v.avoid}
          </div>
        )}
      </>
    )
  }

  const activeScale = scale ? (device === 'mobile' ? scale.mobile : scale.desktop) : null
  const bodyFam = body?.family || display?.family || 'inherit'

  return (
    <div className="brief-v2-type">
      {/* Family cards */}
      <div className="brief-v2-type-families">
        {display && <FontFamilyCard role="Display" font={display} />}
        {body    && <FontFamilyCard role="Body"    font={body} />}
        {label   && <FontFamilyCard role="Label"   font={label} />}
      </div>

      {/* Type scale */}
      {activeScale && activeScale.length > 0 && (
        <div className="brief-v2-type-scale">
          <div className="brief-v2-type-head">
            <span className="brief-v2-type-head-title">Type scale</span>
            <div className="brief-v2-type-toggle" role="tablist" aria-label="Device">
              <button
                type="button"
                role="tab"
                aria-selected={device === 'desktop'}
                onClick={() => setDevice('desktop')}
                className={`brief-v2-type-tab ${device === 'desktop' ? 'is-active' : ''}`}
              >Desktop</button>
              <button
                type="button"
                role="tab"
                aria-selected={device === 'mobile'}
                onClick={() => setDevice('mobile')}
                className={`brief-v2-type-tab ${device === 'mobile' ? 'is-active' : ''}`}
              >Mobile</button>
            </div>
          </div>
          <div className="brief-v2-type-scale-scroll">
            <table className="brief-v2-type-table">
              <thead>
                <tr>
                  <th>Style</th>
                  <th>Preview</th>
                  <th>Size</th>
                  <th>Weight</th>
                  <th>Line H</th>
                  <th>Spacing</th>
                </tr>
              </thead>
              <tbody>
                {activeScale.map((row, i) => {
                  const fam = row.token && /caption|label|meta/i.test(row.token)
                    ? (label?.family || bodyFam)
                    : (row.token && /body|paragraph/i.test(row.token) ? bodyFam : (display?.family || bodyFam))
                  const spacing = row.tracking || row.spacing || (
                    /h1|display/i.test(row.token || '') ? '-0.02em' :
                    /h2|h3|h4/i.test(row.token || '')  ? '-0.01em' :
                    /caption|label/i.test(row.token || '') ? '0.01em' :
                    '0'
                  )
                  return (
                    <tr key={i}>
                      <td className="brief-v2-type-table-token">{row.token}</td>
                      <td>
                        <span
                          className="brief-v2-type-table-sample"
                          style={{
                            fontFamily: `"${fam}", sans-serif`,
                            fontSize: Math.min(row.size, 28) + 'px',
                            fontWeight: row.weight,
                            letterSpacing: spacing,
                          }}
                        >
                          {sampleShort(row.token)}
                        </span>
                      </td>
                      <td className="brief-v2-type-table-num">{row.size}px</td>
                      <td className="brief-v2-type-table-num">{row.weight}</td>
                      <td className="brief-v2-type-table-num">{row.lineHeight}px</td>
                      <td className="brief-v2-type-table-num">{spacing}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {v.avoid && (
        <div className="brief-v2-roles-avoid">
          <span className="brief-v2-roles-avoid-label">Avoid</span> {v.avoid}
        </div>
      )}
    </div>
  )
}

function FontFamilyCard({ role, font }) {
  if (!font) return null
  const family = font.family || 'System'
  const weights = Array.isArray(font.weights) ? font.weights : []
  return (
    <div className="brief-v2-type-card">
      <div className="brief-v2-type-card-role">{role}</div>
      <div
        className="brief-v2-type-card-name"
        style={{
          fontFamily: `"${family}", sans-serif`,
          fontWeight: weights[weights.length - 1] || 600,
          letterSpacing: font.tracking || '0',
        }}
      >
        {family}
      </div>
      <div className="brief-v2-type-card-meta">
        {weights.length ? weights.join(' / ') : '-'}{font.tracking ? ` · ${font.tracking}` : ''}
      </div>
      {font.notes && <div className="brief-v2-type-card-notes">{font.notes}</div>}
    </div>
  )
}

// One-word sample for the table layout — full sentences don't fit
// in a single table cell at size H1 (48px).
function sampleShort(token) {
  const t = String(token || '').toLowerCase()
  if (t.includes('display')) return 'Display'
  if (t === 'h1' || t === 'h2' || t === 'h3' || t === 'h4') return 'Heading'
  if (t.includes('caption') || t.includes('label')) return 'CAPTION'
  return 'Body copy'
}

function sampleFor(token) {
  const t = String(token || '').toLowerCase()
  if (t.includes('display'))  return 'The grand vision'
  if (t === 'h1')             return 'A page begins'
  if (t === 'h2')             return 'Sections divide'
  if (t === 'h3' || t === 'h4') return 'Subsections lead'
  if (t.includes('caption') || t.includes('label')) return 'METADATA · UI HINT'
  return 'The quick brown fox jumps over the lazy dog. Reading rhythm matters.'
}

function isObj(x) { return x && typeof x === 'object' && !Array.isArray(x) }

// Google Fonts injection, one <link> per family, cached so a
// re-render doesn't spam duplicates. Weights collapse to a single
// wght axis request.
const _injectedFonts = new Set()
function ensureGoogleFont(family, weights) {
  if (typeof document === 'undefined') return
  const key = `${family}::${(weights || []).slice().sort().join(',')}`
  if (_injectedFonts.has(key)) return
  _injectedFonts.add(key)
  const fam = family.trim().replace(/\s+/g, '+')
  const w = (weights && weights.length ? weights : [400, 700]).slice().sort((a, b) => a - b).join(';')
  const href = `https://fonts.googleapis.com/css2?family=${fam}:wght@${w}&display=swap`
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = href
  link.dataset.briefV2Font = family
  document.head.appendChild(link)
}

// ── Journey / emotional direction ───────────────────────────────────
function JourneyContent({ value }) {
  const steps = Array.isArray(value) ? value : []
  if (!steps.length) return <p className="brief-v2-text">No journey yet.</p>
  return (
    <ol className="brief-v2-journey">
      {steps.map((s, i) => (
        <li key={i} className="brief-v2-journey-step">
          <span className="brief-v2-journey-num">{s.step || i + 1}</span>
          <div className="brief-v2-journey-body">
            <div className="brief-v2-journey-title">{s.title || s.stage || 'Step'}</div>
            {s.action && <div className="brief-v2-journey-action">{s.action}</div>}
            {(s.emotion || s.feeling) && (
              <span className="brief-v2-journey-emotion">{s.emotion || s.feeling}</span>
            )}
          </div>
        </li>
      ))}
    </ol>
  )
}

// ── Competitor analysis ────────────────────────────────────────────
// Renders three things stacked:
//   1. A list of competitor cards with name + URL link, positioning,
//      layout, strength, weakness, divergence opportunity.
//   2. A side-by-side comparison table that lets the designer scan
//      one row per attribute across all competitors.
//
// Backwards-compatible: rows that don't have the new strength /
// weakness / url fields just hide those cells.
function CompetitorsContent({ value }) {
  const list = Array.isArray(value) ? value : []
  if (!list.length) return <p className="brief-v2-text">No competitors detected.</p>

  return (
    <div className="brief-v2-comp">
      {/* Card grid with avatar + metric bars (UX Quality / Feature
          Depth / Mobile). Until Phase 2 ships AI metric scores, the
          bars are deterministically derived from competitor name
          + strength/weakness presence so they're stable per render
          (no flicker on re-render) but vaguely meaningful. */}
      <div className="brief-v2-comp-grid">
        {list.map((c, i) => (
          <CompetitorCard key={i} competitor={c} index={i} />
        ))}
      </div>

      {/* Comparison table (only show if we have ≥2 competitors and ≥2 fields to compare) */}
      {list.length >= 2 && <CompetitorMatrix list={list} />}
    </div>
  )
}

// Single competitor card. Coloured-letter avatar + name, descriptive
// pills, three metric bars. Metrics are placeholder until Phase 2's
// AI prompt update returns real scores.
function CompetitorCard({ competitor: c, index }) {
  const initial = (c.name || '?').trim().charAt(0).toUpperCase()
  const palette = ['#10b981', '#f97316', '#3b82f6', '#a855f7', '#f59e0b', '#ef4444']
  const colour = palette[index % palette.length]
  // Deterministic metric values from name hash so the bars don't
  // dance between renders. Replaced by AI output in Phase 2.
  const metrics = synthesiseMetrics(c)
  return (
    <article className="brief-v2-comp-card">
      <div className="brief-v2-comp-card-head">
        <span className="brief-v2-comp-avatar" style={{ background: colour }}>{initial}</span>
        {c.url && (
          <a
            href={c.url}
            target="_blank"
            rel="noreferrer noopener"
            className="brief-v2-competitor-link"
          >
            {prettyHost(c.url)} ↗
          </a>
        )}
      </div>
      <div className="brief-v2-comp-card-name">{c.name || '-'}</div>
      {c.positioning && (
        <p className="brief-v2-comp-card-desc">{c.positioning}</p>
      )}
      {(c.strength || c.weakness) && (
        <div className="brief-v2-comp-card-pills">
          {c.strength && <span className="brief-v2-comp-card-pill">{shortPhrase(c.strength)}</span>}
          {c.layout && <span className="brief-v2-comp-card-pill">{shortPhrase(c.layout)}</span>}
        </div>
      )}
      <div className="brief-v2-comp-metrics">
        <MetricBar label="UX Quality"    value={metrics.ux}      colour="#ef4444" />
        <MetricBar label="Feature Depth" value={metrics.feature} colour="#8b5cf6" />
        <MetricBar label="Mobile"        value={metrics.mobile}  colour="#10b981" />
      </div>
      {c.weakness && (
        <div className="brief-v2-comp-flag">
          {c.weakness.length > 60 ? c.weakness.slice(0, 60).toUpperCase() + '…' : c.weakness.toUpperCase()}
        </div>
      )}
    </article>
  )
}

function MetricBar({ label, value, colour }) {
  return (
    <div className="brief-v2-comp-metric">
      <span className="brief-v2-comp-metric-label">{label}</span>
      <div className="brief-v2-comp-metric-track">
        <div
          className="brief-v2-comp-metric-fill"
          style={{ width: `${value}%`, background: colour }}
        />
        <div
          className="brief-v2-comp-metric-thumb"
          style={{ left: `${value}%`, background: colour }}
        />
      </div>
    </div>
  )
}

function shortPhrase(s) {
  const txt = String(s || '').trim()
  if (txt.length <= 28) return txt
  return txt.slice(0, 26) + '…'
}

function synthesiseMetrics(c) {
  // Hash the name to get stable pseudo-random values per render.
  // Phase 2 will replace this with real AI-scored fields on the
  // competitor object (c.metrics.ux, etc).
  if (c.metrics) {
    return {
      ux: clampPct(c.metrics.ux ?? 60),
      feature: clampPct(c.metrics.feature ?? 50),
      mobile: clampPct(c.metrics.mobile ?? 60),
    }
  }
  const seed = String(c.name || 'x').split('').reduce((a, ch) => a + ch.charCodeAt(0), 0)
  const baseUX = 50 + ((seed * 13) % 45)
  const baseFD = 30 + ((seed * 7) % 60)
  const baseMo = 45 + ((seed * 11) % 50)
  // Lift the score a bit when there's a strength noted, lower
  // when there's a weakness, so the bars correlate loosely.
  return {
    ux: clampPct(baseUX + (c.strength ? 10 : 0) - (c.weakness ? 5 : 0)),
    feature: clampPct(baseFD + (c.strength ? 5 : 0)),
    mobile: clampPct(baseMo),
  }
}

function clampPct(n) { return Math.max(5, Math.min(95, Math.round(n))) }

function CompetitorMatrix({ list }) {
  const ROWS = [
    { key: 'positioning',     label: 'Positioning' },
    { key: 'layout',          label: 'Dominant layout' },
    { key: 'strength',        label: 'Strength' },
    { key: 'weakness',        label: 'Weakness' },
    { key: 'differentiation', label: 'How to diverge' },
  ]
  // Only include rows where at least 2 competitors have content.
  const visibleRows = ROWS.filter(r => list.filter(c => c[r.key]).length >= 2)
  if (!visibleRows.length) return null
  return (
    <div className="brief-v2-comp-matrix-wrap">
      <div className="brief-v2-comp-matrix-head">Side-by-side</div>
      <div className="brief-v2-comp-matrix-scroll">
        <table className="brief-v2-comp-matrix">
          <thead>
            <tr>
              <th></th>
              {list.map((c, i) => (
                <th key={i}>
                  <div className="brief-v2-comp-matrix-name">{c.name || '-'}</div>
                  {c.url && (
                    <a
                      href={c.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="brief-v2-comp-matrix-link"
                    >{prettyHost(c.url)} ↗</a>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((r) => (
              <tr key={r.key}>
                <th scope="row">{r.label}</th>
                {list.map((c, i) => (
                  <td key={i}>{c[r.key] || '-'}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function prettyHost(url) {
  try {
    const u = new URL(url)
    return u.hostname.replace(/^www\./, '')
  } catch { return url }
}

// ── Moodboard direction (references) ───────────────────────────────
// ── Director's verdict ─────────────────────────────────────────────
// The decisive editorial close. Renders as a 3-column data grid for
// the discrete priority calls (priorities, screen, feature, etc) +
// two narrative paragraphs at the top (product_summary, final
// recommendation). Editorial weight by default — designers should
// be able to read this section in 30 seconds and have a complete
// picture of the project's direction.
// ── Features hierarchy (4-tier) ────────────────────────────────────
// core / supporting / enhancement / deprioritize as a 4-quadrant
// editorial grid. deprioritize rows include a reason for the cut.
function FeaturesHierarchyContent({ value }) {
  const v = (value && typeof value === 'object') ? value : {}
  const tiers = [
    { key: 'core',         label: 'Core',         tone: 'good',     hint: 'Ship first. Without these the product is incomplete.' },
    { key: 'supporting',   label: 'Supporting',   tone: 'info',     hint: 'Strengthen the core; not required at MVP.' },
    { key: 'enhancement',  label: 'Enhancement',  tone: 'neutral',  hint: 'Later phases. Delight + depth.' },
    { key: 'deprioritize', label: 'Deprioritize', tone: 'warn',     hint: 'Leave out. Distractions.' },
  ]
  return (
    <div className="brief-v2-fh">
      {tiers.map(t => {
        const items = Array.isArray(v[t.key]) ? v[t.key] : []
        if (!items.length) return null
        return (
          <div key={t.key} className={`brief-v2-fh-tier brief-v2-fh-tier-${t.tone}`}>
            <div className="brief-v2-fh-tier-head">
              <span className="brief-v2-fh-tier-label">{t.label}</span>
              <span className="brief-v2-fh-tier-count">{items.length}</span>
            </div>
            <p className="brief-v2-fh-tier-hint">{t.hint}</p>
            <ul className="brief-v2-fh-list">
              {items.map((it, i) => {
                if (typeof it === 'string') {
                  return <li key={i} className="brief-v2-fh-item">{it}</li>
                }
                return (
                  <li key={i} className="brief-v2-fh-item">
                    <span className="brief-v2-fh-item-name">{it.name || '-'}</span>
                    {it.reason && <span className="brief-v2-fh-item-reason"> · {it.reason}</span>}
                  </li>
                )
              })}
            </ul>
          </div>
        )
      })}
    </div>
  )
}

// ── Ranked list (information hierarchy) ────────────────────────────
// Ordered list with a big rank number on the left + content name +
// reason text. Reads like a "what users see first" page-composition
// brief.
function RankedListContent({ value }) {
  const list = Array.isArray(value) ? value : []
  if (!list.length) return <p className="brief-v2-text">No ranking yet.</p>
  return (
    <ol className="brief-v2-ranked">
      {list.map((item, i) => {
        const name = typeof item === 'string' ? item : (item.name || `Item ${i + 1}`)
        const reason = typeof item === 'object' ? item.reason : ''
        return (
          <li key={i} className="brief-v2-ranked-row">
            <span className="brief-v2-ranked-num">{String(i + 1).padStart(2, '0')}</span>
            <div className="brief-v2-ranked-body">
              <div className="brief-v2-ranked-name">{name}</div>
              {reason && <div className="brief-v2-ranked-reason">{reason}</div>}
            </div>
          </li>
        )
      })}
    </ol>
  )
}

// ── Build phases ───────────────────────────────────────────────────
// Three-phase build plan with purpose + items list + business impact
// per phase. Renders as a horizontal phase track on desktop, stacked
// on tablet/mobile.
function PhasesContent({ value }) {
  const phases = Array.isArray(value) ? value : []
  if (!phases.length) return <p className="brief-v2-text">No build plan yet.</p>
  return (
    <ol className="brief-v2-phases">
      {phases.map((p, i) => (
        <li key={i} className="brief-v2-phase">
          <div className="brief-v2-phase-head">
            <span className="brief-v2-phase-num">{String(i + 1).padStart(2, '0')}</span>
            <span className="brief-v2-phase-name">{p.name || `Phase ${i + 1}`}</span>
          </div>
          {p.purpose && (
            <p className="brief-v2-phase-purpose">{p.purpose}</p>
          )}
          {Array.isArray(p.items) && p.items.length > 0 && (
            <ul className="brief-v2-phase-items">
              {p.items.map((it, j) => (
                <li key={j}>{it}</li>
              ))}
            </ul>
          )}
          {p.business_impact && (
            <div className="brief-v2-phase-impact">
              <span className="brief-v2-phase-impact-label">IMPACT</span>
              {p.business_impact}
            </div>
          )}
        </li>
      ))}
    </ol>
  )
}

// ── Star ratings (design personality profile) ──────────────────────
// 9 standardised dimensions rated 1-5 stars with a one-line rationale.
// Uses a two-column layout: trait name + filled-star indicator + note.
function StarRatingsContent({ value }) {
  const list = Array.isArray(value) ? value : []
  if (!list.length) return <p className="brief-v2-text">No personality profile yet.</p>
  return (
    <ul className="brief-v2-stars">
      {list.map((r, i) => {
        const stars = Math.max(0, Math.min(5, Math.round(Number(r.stars) || 0)))
        return (
          <li key={i} className="brief-v2-star-row">
            <span className="brief-v2-star-trait">{r.trait || '-'}</span>
            <span className="brief-v2-star-meter" aria-label={`${stars} of 5`}>
              {[1,2,3,4,5].map(n => (
                <span
                  key={n}
                  className={`brief-v2-star ${n <= stars ? 'is-on' : ''}`}
                  aria-hidden
                >★</span>
              ))}
            </span>
            {r.note && <span className="brief-v2-star-note">{r.note}</span>}
          </li>
        )
      })}
    </ul>
  )
}

// ── Spacing scale ──────────────────────────────────────────────────
// Visual bar chart of the scale values + 3 short rationale lines.
function SpacingScaleContent({ value }) {
  const v = (value && typeof value === 'object') ? value : {}
  const scale = Array.isArray(v.scale) ? v.scale : []
  if (!scale.length && !v.section_spacing) return <p className="brief-v2-text">No spacing system yet.</p>
  return (
    <div className="brief-v2-spacing">
      {scale.length > 0 && (
        <div className="brief-v2-spacing-bars">
          {scale.map((n, i) => (
            <div key={i} className="brief-v2-spacing-col">
              <div className="brief-v2-spacing-bar" style={{ height: `${Math.min(96, Number(n) || 0)}px` }} />
              <div className="brief-v2-spacing-num">{n}</div>
            </div>
          ))}
        </div>
      )}
      <ul className="brief-v2-spacing-rules">
        {v.section_spacing   && <li><strong>Section spacing.</strong> {v.section_spacing}</li>}
        {v.component_spacing && <li><strong>Component spacing.</strong> {v.component_spacing}</li>}
        {v.content_spacing   && <li><strong>Content spacing.</strong> {v.content_spacing}</li>}
      </ul>
    </div>
  )
}

// ── Grid system ────────────────────────────────────────────────────
// 3 device tables (mobile / tablet / desktop) showing columns,
// margin, gutter, max-width per breakpoint.
function GridSystemContent({ value }) {
  const v = (value && typeof value === 'object') ? value : {}
  const devices = [
    { key: 'mobile',  label: 'Mobile',  hint: '< 768' },
    { key: 'tablet',  label: 'Tablet',  hint: '768 – 1023' },
    { key: 'desktop', label: 'Desktop', hint: '≥ 1024' },
  ]
  if (!v.mobile && !v.tablet && !v.desktop) return <p className="brief-v2-text">No grid system yet.</p>
  return (
    <div className="brief-v2-grid-sys">
      <div className="brief-v2-grid-sys-cards">
        {devices.map(d => {
          const g = v[d.key] || {}
          return (
            <div key={d.key} className="brief-v2-grid-sys-card">
              <div className="brief-v2-grid-sys-head">
                <span className="brief-v2-grid-sys-label">{d.label}</span>
                <span className="brief-v2-grid-sys-hint">{d.hint}</span>
              </div>
              <dl className="brief-v2-grid-sys-spec">
                <dt>Columns</dt><dd>{g.columns ?? '-'}</dd>
                <dt>Margin</dt><dd>{g.margin ?? '-'}</dd>
                <dt>Gutter</dt><dd>{g.gutter ?? '-'}</dd>
                {g.max_width && <><dt>Max width</dt><dd>{g.max_width}</dd></>}
              </dl>
            </div>
          )
        })}
      </div>
      {v.rationale && <p className="brief-v2-grid-sys-rationale">{v.rationale}</p>}
    </div>
  )
}

// ── Component system ───────────────────────────────────────────────
// Radius scale, shadow scale, density, with rationale lines.
function ComponentSystemContent({ value }) {
  const v = (value && typeof value === 'object') ? value : {}
  const radius = v.border_radius || {}
  const shadows = v.shadows || {}
  if (!radius.small && !shadows.small && !v.density) return <p className="brief-v2-text">No component system yet.</p>
  return (
    <div className="brief-v2-comp-sys">
      {/* Radius row */}
      {(radius.small || radius.medium || radius.large) && (
        <div className="brief-v2-comp-sys-block">
          <div className="brief-v2-comp-sys-label">Border radius</div>
          <div className="brief-v2-comp-sys-radii">
            {['small', 'medium', 'large'].map(k => radius[k] ? (
              <div key={k} className="brief-v2-comp-sys-radius">
                <div
                  className="brief-v2-comp-sys-radius-swatch"
                  style={{ borderRadius: radius[k] }}
                />
                <div className="brief-v2-comp-sys-radius-meta">
                  <span className="brief-v2-comp-sys-radius-key">{k}</span>
                  <span className="brief-v2-comp-sys-radius-val">{radius[k]}</span>
                </div>
              </div>
            ) : null)}
          </div>
          {v.radius_rationale && <p className="brief-v2-comp-sys-note">{v.radius_rationale}</p>}
        </div>
      )}

      {/* Shadow row */}
      {(shadows.small || shadows.medium || shadows.large) && (
        <div className="brief-v2-comp-sys-block">
          <div className="brief-v2-comp-sys-label">Elevation</div>
          <div className="brief-v2-comp-sys-shadows">
            {['small', 'medium', 'large'].map(k => shadows[k] ? (
              <div key={k} className="brief-v2-comp-sys-shadow">
                <div
                  className="brief-v2-comp-sys-shadow-swatch"
                  style={{ boxShadow: shadows[k] }}
                />
                <div className="brief-v2-comp-sys-radius-meta">
                  <span className="brief-v2-comp-sys-radius-key">{k}</span>
                </div>
              </div>
            ) : null)}
          </div>
          {v.elevation_rationale && <p className="brief-v2-comp-sys-note">{v.elevation_rationale}</p>}
        </div>
      )}

      {/* Density */}
      {v.density && (
        <div className="brief-v2-comp-sys-block">
          <div className="brief-v2-comp-sys-label">Density</div>
          <div className="brief-v2-comp-sys-density">
            <span className="brief-v2-comp-sys-density-val">{v.density}</span>
          </div>
          {v.density_rationale && <p className="brief-v2-comp-sys-note">{v.density_rationale}</p>}
        </div>
      )}
    </div>
  )
}

// ── Visual language ────────────────────────────────────────────────
// 7-field micro-card grid (photography / illustration / icon / etc).
function VisualLanguageContent({ value }) {
  const v = (value && typeof value === 'object') ? value : {}
  const fields = [
    { key: 'photography',   label: 'Photography',     icon: '📷' },
    { key: 'illustration',  label: 'Illustration',    icon: '✦' },
    { key: 'icon',          label: 'Icon style',      icon: '◇' },
    { key: 'motion',        label: 'Motion',          icon: '↗' },
    { key: 'imagery',       label: 'Imagery framing', icon: '▭' },
    { key: 'empty_state',   label: 'Empty state',     icon: '∅' },
    { key: 'loading_state', label: 'Loading state',   icon: '◐' },
  ].filter(f => v[f.key])
  if (!fields.length) return <p className="brief-v2-text">No visual language defined yet.</p>
  return (
    <div className="brief-v2-vl">
      {fields.map(f => (
        <div key={f.key} className="brief-v2-vl-card">
          <div className="brief-v2-vl-head">
            <span className="brief-v2-vl-icon" aria-hidden>{f.icon}</span>
            <span className="brief-v2-vl-label">{f.label}</span>
          </div>
          <p className="brief-v2-vl-text">{v[f.key]}</p>
        </div>
      ))}
    </div>
  )
}

// ── Inspiration grid ───────────────────────────────────────────────
// Categorised reference cards. Each has category chip + name + url +
// borrow / avoid / why bullets.
function InspirationGridContent({ value }) {
  const list = Array.isArray(value) ? value : []
  if (!list.length) return <p className="brief-v2-text">No inspiration refs yet.</p>
  return (
    <div className="brief-v2-insp">
      {list.map((it, i) => (
        <article key={i} className="brief-v2-insp-card">
          <div className="brief-v2-insp-head">
            {it.category && <span className="brief-v2-insp-cat">{it.category}</span>}
            <h3 className="brief-v2-insp-name">{it.name || 'Reference'}</h3>
            {it.url && it.url !== 'none' && (
              <a
                href={it.url}
                target="_blank"
                rel="noreferrer noopener"
                className="brief-v2-insp-url"
              >
                {prettyHost(it.url)} ↗
              </a>
            )}
          </div>
          <dl className="brief-v2-insp-spec">
            {it.what_to_borrow && (
              <>
                <dt className="brief-v2-insp-dt-good">Borrow</dt>
                <dd>{it.what_to_borrow}</dd>
              </>
            )}
            {it.what_to_avoid && (
              <>
                <dt className="brief-v2-insp-dt-bad">Avoid</dt>
                <dd>{it.what_to_avoid}</dd>
              </>
            )}
            {it.why && (
              <>
                <dt className="brief-v2-insp-dt-why">Why it fits</dt>
                <dd>{it.why}</dd>
              </>
            )}
          </dl>
        </article>
      ))}
    </div>
  )
}

// ── Builder guidance ───────────────────────────────────────────────
// Per-feature accordion: purpose / user value / business value /
// components / success criteria / failure conditions.
function BuilderGuidanceContent({ value }) {
  const list = Array.isArray(value) ? value : []
  const [openIdx, setOpenIdx] = useState(0)
  if (!list.length) return <p className="brief-v2-text">No builder guidance yet.</p>
  return (
    <ul className="brief-v2-bg">
      {list.map((g, i) => {
        const isOpen = openIdx === i
        return (
          <li key={i} className="brief-v2-bg-item">
            <button
              type="button"
              className="brief-v2-bg-head"
              onClick={() => setOpenIdx(isOpen ? -1 : i)}
              aria-expanded={isOpen}
            >
              <span className="brief-v2-bg-feature">{g.feature || `Feature ${i + 1}`}</span>
              <span className="brief-v2-bg-chevron">{isOpen ? '−' : '+'}</span>
            </button>
            {isOpen && (
              <div className="brief-v2-bg-body">
                {g.purpose && (
                  <div className="brief-v2-bg-row"><span>PURPOSE</span><p>{g.purpose}</p></div>
                )}
                <div className="brief-v2-bg-twocol">
                  {g.user_value && (
                    <div className="brief-v2-bg-row"><span>USER VALUE</span><p>{g.user_value}</p></div>
                  )}
                  {g.business_value && (
                    <div className="brief-v2-bg-row"><span>BUSINESS VALUE</span><p>{g.business_value}</p></div>
                  )}
                </div>
                {Array.isArray(g.components) && g.components.length > 0 && (
                  <div className="brief-v2-bg-row">
                    <span>COMPONENTS</span>
                    <div className="brief-v2-bg-chips">
                      {g.components.map((c, j) => (
                        <span key={j} className="brief-v2-bg-chip">{c}</span>
                      ))}
                    </div>
                  </div>
                )}
                <div className="brief-v2-bg-twocol">
                  {g.success_criteria && (
                    <div className="brief-v2-bg-row brief-v2-bg-row-good">
                      <span>SUCCESS</span><p>{g.success_criteria}</p>
                    </div>
                  )}
                  {g.failure_conditions && (
                    <div className="brief-v2-bg-row brief-v2-bg-row-bad">
                      <span>FAILURE</span><p>{g.failure_conditions}</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}

function VerdictContent({ value }) {
  const v = (value && typeof value === 'object') ? value : {}
  if (!v.product_summary && !v.final_recommendation && !v.most_important_screen) {
    return <p className="brief-v2-text">No verdict yet.</p>
  }
  const calls = [
    { label: 'UX priority',           value: v.ux_priority },
    { label: 'Conversion priority',   value: v.conversion_priority },
    { label: 'Visual style',          value: v.visual_style },
    { label: 'Product feel',          value: v.product_feel },
    { label: 'Most important screen', value: v.most_important_screen, mono: true },
    { label: 'Most important feature',value: v.most_important_feature, mono: true },
  ].filter(c => c.value)
  const risks = [
    { label: 'Biggest opportunity',     value: v.biggest_opportunity,     tone: 'good' },
    { label: 'Biggest design risk',     value: v.biggest_design_risk,     tone: 'warn' },
    { label: 'Biggest UX risk',         value: v.biggest_ux_risk,         tone: 'warn' },
    { label: 'Biggest conversion risk', value: v.biggest_conversion_risk, tone: 'warn' },
  ].filter(r => r.value)
  return (
    <div className="brief-v2-verdict">
      {v.product_summary && (
        <div className="brief-v2-verdict-lead">
          <div className="brief-v2-verdict-lead-label">SUMMARY</div>
          <p>{v.product_summary}</p>
        </div>
      )}

      {calls.length > 0 && (
        <ul className="brief-v2-verdict-calls">
          {calls.map((c, i) => (
            <li key={i} className="brief-v2-verdict-call">
              <span className="brief-v2-verdict-call-label">{c.label}</span>
              <span className={`brief-v2-verdict-call-value ${c.mono ? 'is-mono' : ''}`}>
                {c.value}
              </span>
            </li>
          ))}
        </ul>
      )}

      {risks.length > 0 && (
        <ul className="brief-v2-verdict-risks">
          {risks.map((r, i) => (
            <li key={i} className={`brief-v2-verdict-risk brief-v2-verdict-risk-${r.tone}`}>
              <span className="brief-v2-verdict-risk-label">{r.label}</span>
              <span className="brief-v2-verdict-risk-text">{r.value}</span>
            </li>
          ))}
        </ul>
      )}

      {v.final_recommendation && (
        <div className="brief-v2-verdict-final">
          <div className="brief-v2-verdict-final-label">FINAL RECOMMENDATION — DESIGN DIRECTOR</div>
          <p>{v.final_recommendation}</p>
        </div>
      )}
    </div>
  )
}

function MoodboardContent({ value }) {
  // Backwards-compatible: old shape was a plain string.
  if (typeof value === 'string') {
    return <p className="brief-v2-text">{value.trim() || '-'}</p>
  }
  const v = value || {}
  const refs = Array.isArray(v.references) ? v.references : []
  return (
    <div className="brief-v2-mood">
      {v.summary && <p className="brief-v2-text">{v.summary}</p>}
      {refs.length > 0 && (
        <div className="brief-v2-mood-refs">
          <div className="brief-v2-mood-refs-head">Look here</div>
          <ul className="brief-v2-mood-list">
            {refs.map((r, i) => (
              <li key={i} className="brief-v2-mood-ref">
                <div className="brief-v2-mood-ref-top">
                  {r.type && <span className="brief-v2-mood-ref-type">{r.type}</span>}
                  <span className="brief-v2-mood-ref-label">{r.label || 'Reference'}</span>
                </div>
                {r.url && (
                  <a
                    href={r.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="brief-v2-mood-ref-url"
                  >{prettyHost(r.url)} ↗</a>
                )}
                {r.note && <div className="brief-v2-mood-ref-note">{r.note}</div>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {v.avoid && (
        <div className="brief-v2-roles-avoid">
          <span className="brief-v2-roles-avoid-label">Avoid</span> {v.avoid}
        </div>
      )}
    </div>
  )
}

// ── Content inventory ──────────────────────────────────────────────
function InventoryContent({ value }) {
  const list = Array.isArray(value) ? value : []
  if (!list.length) return <p className="brief-v2-text">No inventory yet.</p>
  return (
    <ul className="brief-v2-inventory">
      {list.map((p, i) => {
        const variant = statusVariant(p.status)
        return (
          <li key={i} className="brief-v2-inventory-row">
            <div className="brief-v2-inventory-head">
              <span className="brief-v2-inventory-page">{p.page || 'Page'}</span>
              <span className={`brief-v2-badge brief-v2-badge-${variant}`}>{p.status || 'Unknown'}</span>
            </div>
            {p.content && <div className="brief-v2-inventory-line"><strong>Content.</strong> {p.content}</div>}
            {p.assets  && <div className="brief-v2-inventory-line"><strong>Assets.</strong> {p.assets}</div>}
          </li>
        )
      })}
    </ul>
  )
}

// ── Design system summary panel ────────────────────────────────────
// Surfaces the extracted designSystem object so the user sees what
// was compiled. Renders six pillar cards (color / typography /
// spacing / component / motion / visual language). Shimmers while
// the extraction is in flight; populated once the result arrives.
function DesignSystemPanel({ ds, briefResult, building }) {
  // Pull richer source data from the original brief for the visual
  // pillars. The DS extractor produces descriptive strings (for the
  // kanban / builder pipeline downstream); these brief items carry
  // structured values (hex codes, font names, scale arrays) we can
  // render as actual visuals.
  const direction = briefResult?.sections?.find(s => s.id === 'direction')
  const colorItem = direction?.items?.find(i => i.key === 'color_direction')
  const typeItem  = direction?.items?.find(i => i.key === 'typography_direction')

  const colorRich = colorItem?.content && Array.isArray(colorItem.content.swatches) ? colorItem.content : null
  const typeRich  = typeItem?.content && (isObj(typeItem.content.display) || isObj(typeItem.content.body)) ? typeItem.content : null

  const pillars = [
    {
      key: 'color', label: 'Color',
      visual: colorRich ? <DSColorVisual color={colorRich} /> : null,
      lines: ds?.color ? colorLines(ds.color) : null,
    },
    {
      key: 'typography', label: 'Typography',
      visual: typeRich ? <DSTypeVisual type={typeRich} /> : null,
      lines: ds?.typography ? typographyLines(ds.typography) : null,
    },
    {
      key: 'spacing', label: 'Spacing',
      visual: ds?.spacing ? <DSSpacingVisual spacing={ds.spacing} /> : null,
      lines: ds?.spacing ? spacingLines(ds.spacing) : null,
    },
    {
      key: 'component', label: 'Components',
      visual: ds?.component ? <DSComponentVisual component={ds.component} color={colorRich} /> : null,
      lines: ds?.component ? componentLines(ds.component) : null,
    },
    { key: 'motion',          label: 'Motion',          lines: ds?.motion          ? motionLines(ds.motion)         : null },
    { key: 'visual_language', label: 'Visual language', lines: ds?.visual_language ? visualLines(ds.visual_language) : null },
  ]

  return (
    <section className="brief-v2-section">
      <div className="brief-v2-section-header">
        <span className="brief-v2-section-chip">Design system</span>
        <h2 className="brief-v2-section-title">
          {building ? 'Compiling from items 12 to 17…' : 'Compiled from items 12 to 17'}
        </h2>
      </div>
      <div className="brief-v2-ds-grid">
        {pillars.map(p => (
          <div key={p.key} className="brief-v2-ds-card">
            <div className="brief-v2-ds-label">{p.label}</div>
            {p.visual}
            {p.lines ? (
              <ul className="brief-v2-ds-list">
                {p.lines.map((l, i) => (
                  <li key={i}>
                    <span className="brief-v2-ds-key">{l.key}</span>
                    <span className="brief-v2-ds-val">{l.val}</span>
                  </li>
                ))}
              </ul>
            ) : !p.visual && (
              <div className="brief-v2-skeleton">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="brief-v2-skeleton-line" style={{ width: `${55 + ((i * 17) % 38)}%` }} />
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}

// ── Design system mini visuals ─────────────────────────────────────
function DSColorVisual({ color }) {
  const chips = (color.swatches || []).slice(0, 6)
  return (
    <div className="brief-v2-ds-visual brief-v2-ds-colorvis">
      <div className="brief-v2-ds-colorvis-row">
        {chips.map((c, i) => (
          <div key={i} className="brief-v2-ds-colorvis-chip" title={`${c.name} ${c.hex}`}>
            <div className="brief-v2-ds-colorvis-swatch" style={{ background: c.hex }} />
            <div className="brief-v2-ds-colorvis-meta">
              <div className="brief-v2-ds-colorvis-name">{c.name || c.role}</div>
              <div className="brief-v2-ds-colorvis-hex">{c.hex}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function DSTypeVisual({ type }) {
  const display = isObj(type.display) ? type.display : null
  const body    = isObj(type.body)    ? type.body    : null
  useEffect(() => {
    if (display?.family && display.google !== false) ensureGoogleFont(display.family, display.weights || [400, 700])
    if (body?.family    && body.google    !== false) ensureGoogleFont(body.family,    body.weights    || [400, 600])
  }, [display?.family, body?.family])
  return (
    <div className="brief-v2-ds-visual brief-v2-ds-typevis">
      {display && (
        <div
          className="brief-v2-ds-typevis-display"
          style={{
            fontFamily: `"${display.family}", sans-serif`,
            fontWeight: (display.weights || [700])[(display.weights || []).length - 1] || 700,
            letterSpacing: display.tracking || '-0.02em',
          }}
        >
          {display.family}
        </div>
      )}
      {body && (
        <div
          className="brief-v2-ds-typevis-body"
          style={{
            fontFamily: `"${body.family}", sans-serif`,
            fontWeight: (body.weights || [400])[0] || 400,
          }}
        >
          The quick brown fox in {body.family}.
        </div>
      )}
    </div>
  )
}

function DSSpacingVisual({ spacing }) {
  const scale = String(spacing.scale || '').toLowerCase()
  const SCALES = {
    compact:   [4, 8, 12, 16, 20, 24],
    standard:  [4, 8, 12, 16, 24, 32, 48],
    generous:  [8, 16, 24, 32, 48, 64, 96],
  }
  const stops = SCALES[scale] || SCALES.standard
  return (
    <div className="brief-v2-ds-visual brief-v2-ds-spacevis">
      {stops.map((px, i) => (
        <div key={i} className="brief-v2-ds-space-col">
          <div className="brief-v2-ds-space-bar" style={{ height: px + 'px' }} />
          <div className="brief-v2-ds-space-num">{px}</div>
        </div>
      ))}
    </div>
  )
}

function DSComponentVisual({ component, color }) {
  const radiusMap = { 'sharp': 2, 'slightly-rounded': 8, 'soft': 16 }
  const radius = radiusMap[String(component.corner_radius || '').toLowerCase()] ?? 8
  const borderMap = { 'present': '1.5px solid', 'subtle': '1px solid', 'absent': '0 solid' }
  const border = borderMap[String(component.borders || '').toLowerCase()] || '1px solid'
  // Use brand primary if available; fall back to neutral text colour.
  const primary = color?.light?.primary || color?.swatches?.[0]?.hex || 'var(--color-text)'
  const onPrimary = color?.light?.onPrimary || '#fff'
  return (
    <div className="brief-v2-ds-visual brief-v2-ds-compvis">
      <button
        type="button"
        className="brief-v2-ds-compvis-btn"
        style={{
          background: primary,
          color: onPrimary,
          borderRadius: radius,
          border: 'none',
        }}
      >
        Primary
      </button>
      <button
        type="button"
        className="brief-v2-ds-compvis-btn-ghost"
        style={{
          borderRadius: radius,
          border: `${border} var(--color-border)`,
        }}
      >
        Ghost
      </button>
      <div
        className="brief-v2-ds-compvis-card"
        style={{
          borderRadius: radius,
          border: `${border} var(--color-border)`,
        }}
      >
        Card
      </div>
    </div>
  )
}
function colorLines(c) {
  const out = []
  if (c.primary)    out.push({ key: 'Primary',    val: c.primary })
  if (c.secondary)  out.push({ key: 'Secondary',  val: c.secondary })
  if (c.accent)     out.push({ key: 'Accent',     val: c.accent })
  if (c.background) out.push({ key: 'Background', val: c.background })
  if (c.surface)    out.push({ key: 'Surface',    val: c.surface })
  if (Array.isArray(c.never_appear) && c.never_appear.length) {
    out.push({ key: 'Never appear', val: c.never_appear.join('; ') })
  }
  return out
}
function typographyLines(t) {
  const out = []
  if (t.display) out.push({ key: 'Display', val: t.display })
  if (t.body)    out.push({ key: 'Body',    val: t.body })
  if (t.label)   out.push({ key: 'Label',   val: t.label })
  if (Array.isArray(t.contradicts_brand) && t.contradicts_brand.length) {
    out.push({ key: 'Contradicts brand', val: t.contradicts_brand.join('; ') })
  }
  return out
}
function spacingLines(s) {
  const out = []
  if (s.density)   out.push({ key: 'Density', val: s.density })
  if (s.scale)     out.push({ key: 'Scale',   val: s.scale })
  if (s.rationale) out.push({ key: 'Why',     val: s.rationale })
  return out
}
function componentLines(c) {
  const out = []
  if (c.corner_radius)  out.push({ key: 'Radius',  val: c.corner_radius })
  if (c.radius_reason)  out.push({ key: 'Why',     val: c.radius_reason })
  if (c.density)        out.push({ key: 'Density', val: c.density })
  if (c.borders)        out.push({ key: 'Borders', val: c.borders })
  return out
}
function motionLines(m) {
  const out = []
  if (m.speed)        out.push({ key: 'Speed',      val: m.speed })
  if (m.transition)   out.push({ key: 'Transition', val: m.transition })
  if (m.speed_reason) out.push({ key: 'Why',        val: m.speed_reason })
  return out
}
function visualLines(v) {
  const out = []
  if (v.imagery_type)      out.push({ key: 'Imagery type', val: v.imagery_type })
  if (v.ui_style)          out.push({ key: 'UI style',     val: v.ui_style })
  if (v.imagery_treatment) out.push({ key: 'Treatment',    val: v.imagery_treatment })
  return out
}

// ── Completion banner ──────────────────────────────────────────────
function CompletionBanner({ onBuildBoard, onExportPdf, onShareReview, reviewStatus, designSystemBuilding }) {
  const shareLabel = reviewStatus === 'pending'
    ? 'Review pending'
    : reviewStatus === 'changes_requested'
    ? 'Changes requested'
    : 'Send for client review'
  return (
    <div className="brief-v2-banner">
      <div className="brief-v2-banner-body">
        <div className="brief-v2-banner-title">Translation ready</div>
        <div className="brief-v2-banner-sub">
          {designSystemBuilding
            ? 'Compiling design system from items 12 to 17.'
            : 'Send to your client for sign-off, or build the board.'}
        </div>
      </div>
      <div className="brief-v2-banner-actions">
        {onShareReview && (
          <button onClick={onShareReview} className="brief-v2-banner-btn brief-v2-banner-btn-quiet">
            <ShareIcon style={{ width: 14, height: 14 }} /> {shareLabel}
          </button>
        )}
        <button onClick={onExportPdf} className="brief-v2-banner-btn brief-v2-banner-btn-quiet">
          <ArrowDownTrayIcon style={{ width: 14, height: 14 }} /> Export PDF
        </button>
        <button onClick={onBuildBoard} disabled={designSystemBuilding} className="brief-v2-banner-btn brief-v2-banner-btn-primary">
          Build board <ArrowRightIcon style={{ width: 14, height: 14 }} />
        </button>
      </div>
    </div>
  )
}

// Inline sparkles SVG (avoids a new heroicons import path collision)
function SparklesIconInline() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" />
    </svg>
  )
}

// ── Version tab strip ──────────────────────────────────────────────
// Shows tabs for every snapshot in revisions[] plus a Latest tab.
// Newest old version sits closest to Latest; Original ends up at
// the far right. Each old-version tab includes a Restore link that
// fires onRestore(snapshotId), promotes that snapshot back to
// Latest so the designer can roll back from a bad AI revision.
function VersionTabStrip({ revisions, viewedVersion, onSelect, onRestore }) {
  // Newest first (after Latest), so Original lands at the end.
  const ordered = revisions.slice().reverse()
  return (
    <div className="brief-v2-versions">
      <div className="brief-v2-versions-label">Versions</div>
      <div className="brief-v2-versions-tabs">
        <button
          type="button"
          onClick={() => onSelect('latest')}
          className={`brief-v2-vtab ${viewedVersion === 'latest' ? 'is-active' : ''}`}
        >
          Latest
        </button>
        {ordered.map(snap => {
          const active = viewedVersion === snap.id
          return (
            <div key={snap.id} className="brief-v2-vtab-wrap">
              <button
                type="button"
                onClick={() => onSelect(snap.id)}
                className={`brief-v2-vtab ${active ? 'is-active' : ''}`}
                title={snap.createdAt ? new Date(snap.createdAt).toLocaleString() : ''}
              >
                {snap.label}
              </button>
              {active && onRestore && (
                <button
                  type="button"
                  onClick={() => onRestore(snap.id)}
                  className="brief-v2-vtab-restore"
                  title="Promote this version to Latest"
                >
                  Restore
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Pending changes banner ────────────────────────────────────────
// Amber prompt when there's an outstanding client review with
// status='changes_requested'. The Revise button triggers the modal
// which auto-prefills the note.
function PendingChangesBanner({ note, comments, onRevise, onResolve, revising }) {
  // Thread mode when an array of comments is passed; legacy
  // single-note fallback when only `note` is set.
  const useThread = Array.isArray(comments) && comments.length > 0
  const open = useThread ? comments.filter(c => c.status !== 'resolved') : []
  const resolved = useThread ? comments.filter(c => c.status === 'resolved') : []
  const [showResolved, setShowResolved] = useState(false)

  return (
    <div className="brief-v2-pending-banner">
      <div className="brief-v2-pending-banner-icon" aria-hidden>
        <ExclamationTriangleIcon style={{ width: 16, height: 16 }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="brief-v2-pending-banner-title">
          {useThread
            ? (open.length === 1
                ? 'Your client sent 1 note'
                : `Your client sent ${open.length} unaddressed notes`)
            : 'Your client requested changes'}
        </div>

        {useThread ? (
          <>
            <ul className="brief-v2-pending-thread">
              {open.map(c => (
                <li key={c.id} className="brief-v2-pending-comment">
                  <div className="brief-v2-pending-comment-meta">
                    <span className="brief-v2-pending-comment-when">{formatThreadDate(c.created_at)}</span>
                    {onResolve && (
                      <button
                        type="button"
                        onClick={() => onResolve(c.id)}
                        className="brief-v2-pending-comment-resolve"
                      >
                        Mark addressed
                      </button>
                    )}
                  </div>
                  <div className="brief-v2-pending-comment-body">{c.body}</div>
                </li>
              ))}
            </ul>
            {resolved.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={() => setShowResolved(s => !s)}
                  className="brief-v2-pending-resolved-toggle"
                >
                  {showResolved
                    ? `Hide addressed (${resolved.length})`
                    : `Show addressed (${resolved.length})`}
                </button>
                {showResolved && (
                  <ul className="brief-v2-pending-thread">
                    {resolved.map(c => (
                      <li key={c.id} className="brief-v2-pending-comment brief-v2-pending-comment-resolved">
                        <div className="brief-v2-pending-comment-meta">
                          <span className="brief-v2-pending-comment-when">{formatThreadDate(c.created_at)}</span>
                          <span className="brief-v2-pending-comment-addressed">Addressed</span>
                        </div>
                        <div className="brief-v2-pending-comment-body">{c.body}</div>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </>
        ) : (
          <div className="brief-v2-pending-banner-note">"{note}"</div>
        )}
      </div>
      <button
        type="button"
        onClick={() => onRevise?.()}
        disabled={revising}
        className="brief-v2-pending-banner-btn"
      >
        <SparklesIconInline /> {revising ? 'Revising…' : 'Revise with AI'}
      </button>
    </div>
  )
}

function formatThreadDate(iso) {
  try {
    const d = new Date(iso)
    return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  } catch { return '' }
}

// ── Revision meta banner ──────────────────────────────────────────
// Quiet info banner on the Latest tab after a revision lands so the
// designer can see what feedback drove the current version.
function RevisionMetaBanner({ meta }) {
  const when = meta.revisedAt
    ? new Date(meta.revisedAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
    : null
  return (
    <div className="brief-v2-revmeta-banner">
      <SparklesIconInline />
      <div style={{ minWidth: 0 }}>
        <div className="brief-v2-revmeta-banner-title">
          Revised {when ? `on ${when}` : 'recently'} with this feedback:
        </div>
        <div className="brief-v2-revmeta-banner-note">"{meta.feedback}"</div>
      </div>
    </div>
  )
}

// ── Approved banner, shown when client clicks Approve ─────────────
function ApprovedBanner({ review }) {
  const when = review?.approved_at
    ? new Date(review.approved_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
    : null
  const who = review?.client_name || review?.client_email || 'the client'
  return (
    <div className="brief-v2-approved-banner">
      <CheckBadgeIcon style={{ width: 22, height: 22, color: '#047857', flexShrink: 0 }} />
      <div>
        <div className="brief-v2-approved-title">Approved by {who}</div>
        {when && <div className="brief-v2-approved-sub">on {when}</div>}
      </div>
    </div>
  )
}

// ── Skeleton placeholder ───────────────────────────────────────────
function Skeleton({ shape }) {
  const lines = shape === 'text' || shape === 'list' ? 3
    : shape === 'rows' || shape === 'badged_list' ? 4
    : shape === 'numbered_list' ? 3
    : shape === 'roles' || shape === 'levels' ? 4
    : shape === 'journey' ? 4
    : shape === 'competitors' || shape === 'inventory' ? 3
    : 2
  return (
    <div className="brief-v2-skeleton">
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="brief-v2-skeleton-line" style={{ width: `${60 + ((i * 13) % 40)}%` }} />
      ))}
    </div>
  )
}

// Utility used only for opaque entries in plain lists if the AI
// returns objects instead of strings.
function safeJsonString(v) {
  try { return JSON.stringify(v) } catch { return String(v) }
}

// ────────────────────────────────────────────────────────────────────
// Responsive styles, single <style> block. Reuses CSS variables
// (var(--color-…)) that the app already exposes globally, so this
// participates in light/dark themes without extra wiring.
// ────────────────────────────────────────────────────────────────────
function ResponsiveStyles() {
  return (
    <style>{`
      .brief-v2-root {
        font-family: 'Urbanist', sans-serif;
        background: var(--color-bg);
        color: var(--color-text);
      }

      /* Top tab bar removed, no styles needed. */

      .brief-v2-layout {
        /* Full-width single column, the Translation map sidebar
           was removed in favour of the tablet tab bar + natural
           scroll. The brief card grid below still self-organises
           into 2 columns ≥1024 via .brief-v2-cards. */
        display: block;
        max-width: 100%;
        margin: 0;
        padding: 32px clamp(20px, 4vw, 56px) 24px;
      }

      .brief-v2-sidenav {
        position: sticky;
        top: 24px;
        align-self: start;
        height: fit-content;
      }
      .brief-v2-sidenav-inner {
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: 16px;
        padding: 18px;
      }
      .brief-v2-sidenav-title {
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: var(--color-text-muted);
        margin-bottom: 14px;
      }
      .brief-v2-sidenav-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 4px; }
      .brief-v2-sidenav-link {
        display: flex; align-items: flex-start; gap: 10px;
        width: 100%;
        padding: 9px 10px;
        background: transparent; border: none; cursor: pointer; border-radius: 9px;
        text-align: left;
        font-family: inherit; font-size: 13px; line-height: 1.35; font-weight: 600;
        color: var(--color-text-soft);
        transition: background 0.15s, color 0.15s;
      }
      .brief-v2-sidenav-link:hover { background: var(--color-card); color: var(--color-text); }
      .brief-v2-sidenav-link.is-active {
        background: var(--color-card);
        color: var(--color-text);
        box-shadow: inset 2px 0 0 var(--color-accent);
      }
      .brief-v2-sidenav-step {
        font-family: 'JetBrains Mono', monospace;
        font-size: 10px;
        color: var(--color-text-muted);
        flex-shrink: 0;
        line-height: 1.6;
      }

      .brief-v2-sidenav-progress { margin-top: 14px; padding-top: 14px; border-top: 1px solid var(--color-border); }
      .brief-v2-progress-track { height: 4px; background: var(--color-border); border-radius: 4px; overflow: hidden; }
      .brief-v2-progress-fill  { height: 100%; background: var(--color-accent); border-radius: 4px; transition: width 0.4s ease; }
      .brief-v2-progress-label { margin-top: 8px; font-size: 10px; color: var(--color-text-muted); display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
      .brief-v2-progress-tag {
        padding: 2px 7px; border-radius: 100px;
        background: rgba(139,92,246,0.12);
        color: var(--color-accent);
        font-weight: 700; letter-spacing: 0.04em; font-size: 9px;
        text-transform: uppercase;
      }

      .brief-v2-main { min-width: 0; }

      .brief-v2-hero {
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: 18px;
        padding: 28px 28px 24px;
        margin-bottom: 28px;
      }
      .brief-v2-hero-label {
        font-size: 10px; font-weight: 700; letter-spacing: 0.12em;
        text-transform: uppercase; color: var(--color-text-muted);
        margin-bottom: 8px;
      }
      .brief-v2-hero-title { font-size: 32px; line-height: 1.1; font-weight: 800; letter-spacing: -0.02em; margin: 0 0 14px; }
      .brief-v2-hero-pills { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 14px; }
      .brief-v2-hero-pill {
        display: inline-flex; align-items: center;
        padding: 4px 11px;
        border: 1px solid var(--color-border);
        border-radius: 100px;
        font: 700 11px 'Urbanist', sans-serif;
        letter-spacing: 0.02em;
        color: var(--color-text);
      }
      .brief-v2-hero-pill-solid {
        background: var(--color-text);
        color: var(--color-bg);
        border-color: var(--color-text);
        text-transform: uppercase;
        letter-spacing: 0.08em;
        font-weight: 800;
        font-size: 10px;
      }
      .brief-v2-hero-summary {
        margin: 0 0 14px;
        font-size: 14px;
        line-height: 1.6;
        color: var(--color-text-soft);
        max-width: 640px;
      }

      /* ── Quick Read strip ────────────────────────────────────── */
      .brief-v2-quickread {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 12px;
        margin: 4px 0 28px;
      }
      .brief-v2-quickread-card {
        padding: 14px 16px;
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: 12px;
        display: flex; flex-direction: column; gap: 4px;
        min-width: 0;
      }
      .brief-v2-quickread-label {
        font: 800 10px 'Urbanist', sans-serif;
        letter-spacing: 0.14em;
        text-transform: uppercase;
      }
      .brief-v2-quickread-value {
        font-size: 14px;
        line-height: 1.4;
        color: var(--color-text);
        font-weight: 700;
        overflow: hidden;
        text-overflow: ellipsis;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
      }
      .brief-v2-quickread-hint {
        font: 600 11px 'Urbanist', sans-serif;
        color: var(--color-text-muted);
      }
      @media (max-width: 1023px) {
        .brief-v2-quickread { grid-template-columns: repeat(2, 1fr); }
      }
      @media (max-width: 600px) {
        .brief-v2-quickread {
          display: flex;
          gap: 10px;
          overflow-x: auto;
          scroll-snap-type: x mandatory;
          padding-bottom: 4px;
        }
        .brief-v2-quickread-card {
          flex: 0 0 78%;
          scroll-snap-align: start;
        }
      }
      .brief-v2-hero-meta  { font-size: 12px; color: var(--color-text-muted); }
      .brief-v2-hero-pulse { color: var(--color-accent); animation: briefv2pulse 1.4s ease-in-out infinite; }
      .brief-v2-hero-row { display: flex; gap: 18px; align-items: flex-start; justify-content: space-between; flex-wrap: wrap; }
      .brief-v2-hero-text { flex: 1 1 auto; min-width: 0; }

      /* ── Brief score card ────────────────────────────────────── */
      .brief-v2-scorecard {
        flex-shrink: 0;
        width: 320px; max-width: 100%;
        padding: 18px 18px 16px;
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: 16px;
      }
      .brief-v2-scorecard[data-tone="chaos"]    { border-color: rgba(239,68,68,0.40); }
      .brief-v2-scorecard[data-tone="thin"]     { border-color: rgba(245,158,11,0.40); }
      .brief-v2-scorecard[data-tone="strong"]   { border-color: rgba(59,130,246,0.40); }
      .brief-v2-scorecard[data-tone="excellent"]{ border-color: rgba(16,185,129,0.40); }
      .brief-v2-scorecard-top {
        display: flex; align-items: flex-start; gap: 14px;
        margin-bottom: 14px;
      }
      .brief-v2-scorecard-head { display: flex; flex-direction: column; gap: 4px; min-width: 0; flex: 1; }
      .brief-v2-scorecard-label {
        font: 800 9px 'Urbanist', sans-serif;
        letter-spacing: 0.14em; text-transform: uppercase;
        color: var(--color-text-muted);
      }
      .brief-v2-scorecard-verdict {
        font: 800 22px 'Urbanist', sans-serif;
        letter-spacing: 0.02em;
        line-height: 1.1;
        color: var(--color-text);
      }
      .brief-v2-scorecard[data-tone="chaos"]    .brief-v2-scorecard-verdict { color: #ef4444; }
      .brief-v2-scorecard[data-tone="thin"]     .brief-v2-scorecard-verdict { color: #f59e0b; }
      .brief-v2-scorecard[data-tone="good"]     .brief-v2-scorecard-verdict { color: #f59e0b; }
      .brief-v2-scorecard[data-tone="strong"]   .brief-v2-scorecard-verdict { color: #3b82f6; }
      .brief-v2-scorecard[data-tone="excellent"].brief-v2-scorecard-verdict { color: #10b981; }
      .brief-v2-scorecard-summary {
        margin: 4px 0 0; font-size: 12px; line-height: 1.55;
        color: var(--color-text-soft);
      }
      .brief-v2-scorecard-bars { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 10px; }
      .brief-v2-scorecard-bar-meta {
        display: flex; justify-content: space-between; align-items: baseline;
        margin-bottom: 5px;
        font: 600 11px 'Urbanist', sans-serif;
        color: var(--color-text-soft);
      }
      .brief-v2-scorecard-bar-num { font: 700 11px 'JetBrains Mono', monospace; color: var(--color-text); }
      .brief-v2-scorecard-bar { height: 4px; background: var(--color-border); border-radius: 100px; overflow: hidden; }
      .brief-v2-scorecard-bar-fill { height: 100%; border-radius: 100px; transition: width 0.6s ease; }

      /* ── Brand personality chips ─────────────────────────────── */
      .brief-v2-traits { display: flex; flex-direction: column; gap: 10px; }
      .brief-v2-trait {
        display: flex; align-items: baseline; gap: 12px;
        padding: 10px 12px;
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: 10px;
      }
      .brief-v2-trait-chip {
        flex-shrink: 0;
        padding: 4px 10px;
        background: linear-gradient(135deg, rgba(139,92,246,0.18), rgba(124,58,237,0.10));
        color: var(--color-accent);
        border: 1px solid rgba(139,92,246,0.30);
        border-radius: 100px;
        font: 700 11px 'Urbanist', sans-serif;
        letter-spacing: 0.02em;
        white-space: nowrap;
      }
      .brief-v2-trait-text { font-size: 12px; line-height: 1.55; color: var(--color-text-soft); }

      /* ── Tone & mood lanes ───────────────────────────────────── */
      /* ── Brand personality sliders ───────────────────────────── */
      .brief-v2-trait-slider {
        display: flex; flex-direction: column; gap: 6px;
        padding: 11px 13px;
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: 10px;
      }
      .brief-v2-trait-slider-labels {
        display: flex; justify-content: space-between;
        font: 700 12px 'Urbanist', sans-serif;
        color: var(--color-text-soft);
      }
      .brief-v2-trait-slider-track {
        position: relative;
        height: 5px;
        background: var(--color-border);
        border-radius: 100px;
      }
      .brief-v2-trait-slider-fill {
        position: absolute; inset: 0 auto 0 0;
        height: 100%;
        border-radius: 100px;
        transition: width 0.6s ease;
      }
      .brief-v2-trait-slider-thumb {
        position: absolute;
        top: 50%;
        width: 12px; height: 12px;
        border-radius: 50%;
        border: 2px solid;
        background: white;
        transform: translate(-50%, -50%);
        box-shadow: 0 1px 4px rgba(0,0,0,0.20);
      }
      .brief-v2-trait-slider-note {
        margin-top: 2px;
        font-size: 11px;
        color: var(--color-text-muted);
        line-height: 1.5;
      }

      /* ── Red flags (numbered amber circles) ──────────────────── */
      .brief-v2-redflags {
        list-style: none; padding: 0; margin: 0;
        display: flex; flex-direction: column; gap: 10px;
      }
      .brief-v2-redflag-row {
        display: grid;
        grid-template-columns: 28px 1fr auto;
        gap: 12px;
        align-items: start;
        padding: 11px 13px;
        /* WCAG: previous 0.05 / 0.22 was barely visible against the
           page bg in both light + dark modes, the row read as
           neutral instead of "warning". Bumped the tint + border
           opacity so the amber semantic is unmistakable while text
           still passes contrast against the page bg. */
        background: rgba(245,158,11,0.14);
        border: 1px solid rgba(180,83,9,0.50);
        border-radius: 10px;
      }
      .brief-v2-redflag-num {
        display: inline-flex; align-items: center; justify-content: center;
        width: 26px; height: 26px;
        border-radius: 50%;
        font: 800 12px 'Urbanist', sans-serif;
        color: white;
        flex-shrink: 0;
      }
      /* WCAG: white text on these solid backgrounds. amber-500
         (#f59e0b) only gives 2.05:1 vs white and red-500 (#ef4444)
         gives 3.76:1 — both fail AA 4.5:1. Bumped to amber-700 +
         red-700 so the numbered circles announce themselves
         properly. */
      .brief-v2-redflag-num-critical { background: #b91c1c; }
      .brief-v2-redflag-num-warn     { background: #b45309; }
      .brief-v2-redflag-num-ok       { background: #6b7280; }
      .brief-v2-redflag-text {
        font-size: 13px; line-height: 1.55;
        color: var(--color-text);
        padding-top: 4px;
      }
      .brief-v2-redflag-sev {
        align-self: start;
        padding: 3px 8px;
        background: #b91c1c; /* red-700 — passes 4.5:1 with white */
        color: white;
        border-radius: 100px;
        font: 800 9px 'Urbanist', sans-serif;
        letter-spacing: 0.06em;
        text-transform: uppercase;
      }

      .brief-v2-tone { display: flex; flex-direction: column; gap: 8px; }
      .brief-v2-tone-band {
        display: grid; grid-template-columns: 24px 1fr; gap: 12px;
        padding: 12px 14px;
        border-radius: 10px;
        border: 1px solid var(--color-border);
      }
      .brief-v2-tone-band-good { background: rgba(16,185,129,0.05); border-color: rgba(16,185,129,0.30); }
      .brief-v2-tone-band-bad  { background: rgba(239,68,68,0.05);  border-color: rgba(239,68,68,0.30); }
      .brief-v2-tone-icon {
        width: 22px; height: 22px; border-radius: 999px;
        display: inline-flex; align-items: center; justify-content: center;
        font: 800 12px 'JetBrains Mono', monospace;
        color: white;
      }
      .brief-v2-tone-band-good .brief-v2-tone-icon { background: #10b981; }
      .brief-v2-tone-band-bad  .brief-v2-tone-icon { background: #b91c1c; }
      .brief-v2-tone-label {
        font: 800 9px 'Urbanist', sans-serif; letter-spacing: 0.12em; text-transform: uppercase;
        color: var(--color-text-muted);
        margin-bottom: 3px;
      }
      .brief-v2-tone-text { font-size: 13px; line-height: 1.55; color: var(--color-text); }

      /* ── Floating TOC ──────────────────────────────────────── */
      .brief-v2-toc-fab {
        position: fixed;
        right: 24px;
        bottom: 24px;
        z-index: 30;
        display: inline-flex; align-items: center; gap: 8px;
        padding: 10px 16px 10px 14px;
        background: var(--color-text);
        color: var(--color-bg);
        border: none;
        border-radius: 100px;
        box-shadow: 0 12px 28px rgba(0,0,0,0.20);
        font: 800 12px 'Urbanist', sans-serif;
        letter-spacing: 0.04em;
        cursor: pointer;
        transition: transform 0.15s ease, box-shadow 0.15s ease;
      }
      .brief-v2-toc-fab:hover { transform: translateY(-1px); box-shadow: 0 16px 36px rgba(0,0,0,0.28); }
      .brief-v2-toc-fab-icon { display: inline-flex; align-items: center; }
      @media (max-width: 600px) {
        .brief-v2-toc-fab {
          right: 16px; bottom: 16px;
          width: 48px; height: 48px;
          padding: 0;
          justify-content: center;
          border-radius: 50%;
        }
        .brief-v2-toc-fab-text { display: none; }
      }
      .brief-v2-toc-backdrop {
        position: fixed; inset: 0;
        background: rgba(0,0,0,0.45);
        backdrop-filter: blur(4px);
        z-index: 28;
      }
      .brief-v2-toc-panel {
        position: fixed;
        right: 24px; bottom: 84px;
        z-index: 31;
        width: 280px;
        max-width: calc(100vw - 32px);
        background: var(--color-bg);
        border: 1px solid var(--color-border);
        border-radius: 14px;
        box-shadow: 0 20px 48px rgba(0,0,0,0.30);
        overflow: hidden;
      }
      @media (max-width: 600px) {
        .brief-v2-toc-panel {
          right: 16px; left: 16px; bottom: 76px;
          width: auto; max-width: none;
        }
      }
      .brief-v2-toc-header {
        display: flex; align-items: center; justify-content: space-between;
        padding: 12px 14px;
        border-bottom: 1px solid var(--color-border);
        font: 800 11px 'Urbanist', sans-serif;
        letter-spacing: 0.10em;
        text-transform: uppercase;
        color: var(--color-text-muted);
      }
      .brief-v2-toc-close {
        background: transparent; border: none; cursor: pointer;
        color: var(--color-text-muted);
        font: 600 13px 'Urbanist', sans-serif;
        line-height: 1;
        padding: 4px 6px;
      }
      .brief-v2-toc-list { list-style: none; margin: 0; padding: 6px; }
      .brief-v2-toc-item {
        display: flex; align-items: center; gap: 10px;
        width: 100%;
        padding: 10px 12px;
        background: transparent;
        border: none;
        border-radius: 8px;
        text-align: left;
        cursor: pointer;
        color: var(--color-text-soft);
        transition: background 0.15s, color 0.15s;
      }
      .brief-v2-toc-item:hover {
        background: var(--color-surface);
        color: var(--color-text);
      }
      .brief-v2-toc-item.is-active {
        background: var(--color-surface);
        color: var(--color-text);
      }
      .brief-v2-toc-num {
        font: 800 11px 'JetBrains Mono', monospace;
        color: var(--color-text-muted);
        min-width: 22px;
      }
      .brief-v2-toc-label { font: 700 13px 'Urbanist', sans-serif; }

      /* ── Features hierarchy (4-tier grid) ────────────────────── */
      .brief-v2-fh {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
      }
      @media (max-width: 767px) {
        .brief-v2-fh { grid-template-columns: 1fr; }
      }
      .brief-v2-fh-tier {
        padding: 14px 14px 12px;
        border: 1px solid var(--color-border);
        border-left: 3px solid;
        border-radius: 10px;
        background: var(--color-surface);
        display: flex; flex-direction: column; gap: 8px;
      }
      .brief-v2-fh-tier-good    { border-left-color: #10b981; }
      .brief-v2-fh-tier-info    { border-left-color: #3b82f6; }
      .brief-v2-fh-tier-neutral { border-left-color: #94a3b8; }
      .brief-v2-fh-tier-warn    { border-left-color: #b45309; }
      .brief-v2-fh-tier-head {
        display: flex; align-items: center; justify-content: space-between;
      }
      .brief-v2-fh-tier-label {
        font: 800 11px 'Urbanist', sans-serif;
        letter-spacing: 0.10em;
        text-transform: uppercase;
        color: var(--color-text);
      }
      .brief-v2-fh-tier-count {
        font: 800 11px 'JetBrains Mono', monospace;
        color: var(--color-text-muted);
      }
      .brief-v2-fh-tier-hint {
        margin: 0;
        font-size: 11px;
        color: var(--color-text-muted);
        line-height: 1.5;
      }
      .brief-v2-fh-list {
        list-style: none; padding: 0; margin: 4px 0 0;
        display: flex; flex-direction: column; gap: 6px;
      }
      .brief-v2-fh-item {
        font-size: 12px;
        line-height: 1.5;
        color: var(--color-text);
        padding-left: 14px;
        position: relative;
      }
      .brief-v2-fh-item::before {
        content: '';
        position: absolute;
        left: 0; top: 9px;
        width: 4px; height: 4px;
        border-radius: 50%;
        background: var(--color-text-muted);
      }
      .brief-v2-fh-item-name { font-weight: 700; }
      .brief-v2-fh-item-reason { color: var(--color-text-soft); }

      /* ── Ranked list (information hierarchy) ─────────────────── */
      .brief-v2-ranked {
        list-style: none; padding: 0; margin: 0;
        display: flex; flex-direction: column; gap: 8px;
      }
      .brief-v2-ranked-row {
        display: grid;
        grid-template-columns: 40px 1fr;
        gap: 14px;
        padding: 12px 14px;
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: 10px;
        align-items: start;
      }
      .brief-v2-ranked-num {
        font: 800 22px 'Urbanist', sans-serif;
        line-height: 1;
        color: var(--color-text-muted);
        letter-spacing: -0.02em;
        font-variant-numeric: tabular-nums;
        padding-top: 2px;
      }
      .brief-v2-ranked-body { min-width: 0; }
      .brief-v2-ranked-name {
        font: 800 14px 'Urbanist', sans-serif;
        color: var(--color-text);
        margin-bottom: 3px;
      }
      .brief-v2-ranked-reason {
        font-size: 12px;
        line-height: 1.55;
        color: var(--color-text-soft);
      }

      /* ── Build phases ────────────────────────────────────────── */
      .brief-v2-phases {
        list-style: none; padding: 0; margin: 0;
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 12px;
      }
      @media (max-width: 1023px) {
        .brief-v2-phases { grid-template-columns: 1fr; }
      }
      .brief-v2-phase {
        padding: 16px 16px 14px;
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: 12px;
        display: flex; flex-direction: column; gap: 10px;
      }
      .brief-v2-phase-head {
        display: flex; align-items: center; gap: 10px;
      }
      .brief-v2-phase-num {
        display: inline-flex; align-items: center; justify-content: center;
        width: 28px; height: 28px;
        background: var(--color-text);
        color: var(--color-bg);
        border-radius: 8px;
        font: 800 12px 'JetBrains Mono', monospace;
      }
      .brief-v2-phase-name {
        font: 800 14px 'Urbanist', sans-serif;
        color: var(--color-text);
      }
      .brief-v2-phase-purpose {
        margin: 0;
        font-size: 12px;
        line-height: 1.55;
        color: var(--color-text-soft);
      }
      .brief-v2-phase-items {
        list-style: none; padding: 0; margin: 0;
        display: flex; flex-direction: column; gap: 5px;
      }
      .brief-v2-phase-items li {
        font-size: 12px;
        line-height: 1.5;
        color: var(--color-text);
        padding-left: 14px;
        position: relative;
      }
      .brief-v2-phase-items li::before {
        content: '✓';
        position: absolute;
        left: 0; top: 0;
        color: #10b981;
        font-weight: 800;
      }
      .brief-v2-phase-impact {
        margin-top: auto;
        padding: 8px 10px;
        background: var(--color-bg);
        border: 1px solid var(--color-border);
        border-radius: 7px;
        font-size: 11px;
        line-height: 1.5;
        color: var(--color-text);
        display: flex; flex-direction: column; gap: 3px;
      }
      .brief-v2-phase-impact-label {
        font: 800 9px 'Urbanist', sans-serif;
        letter-spacing: 0.12em;
        color: var(--color-text-muted);
      }

      /* ── Star ratings (design personality profile) ───────────── */
      .brief-v2-stars {
        list-style: none; padding: 0; margin: 0;
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 8px;
      }
      @media (max-width: 1023px) {
        .brief-v2-stars { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      }
      @media (max-width: 600px) {
        .brief-v2-stars { grid-template-columns: 1fr; }
      }
      .brief-v2-star-row {
        padding: 11px 12px;
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: 9px;
        display: flex; flex-direction: column; gap: 4px;
      }
      .brief-v2-star-trait {
        font: 800 11px 'Urbanist', sans-serif;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        color: var(--color-text);
      }
      .brief-v2-star-meter {
        display: inline-flex; gap: 1px;
        font-size: 15px;
        line-height: 1;
      }
      .brief-v2-star {
        color: var(--color-border);
        transition: color 0.15s;
      }
      .brief-v2-star.is-on { color: #f59e0b; }
      .brief-v2-star-note {
        font-size: 11px;
        line-height: 1.5;
        color: var(--color-text-soft);
        margin-top: 2px;
      }

      /* ── Spacing scale ────────────────────────────────────────── */
      .brief-v2-spacing { display: flex; flex-direction: column; gap: 14px; }
      .brief-v2-spacing-bars {
        display: flex; align-items: flex-end; gap: 10px;
        padding: 16px 14px 8px;
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: 12px;
        overflow-x: auto;
      }
      .brief-v2-spacing-col { display: flex; flex-direction: column; align-items: center; gap: 6px; flex-shrink: 0; min-width: 28px; }
      .brief-v2-spacing-bar {
        width: 100%;
        background: linear-gradient(180deg, var(--color-accent), rgba(139,92,246,0.45));
        border-radius: 3px 3px 0 0;
        min-height: 4px;
      }
      .brief-v2-spacing-num {
        font: 700 10px 'JetBrains Mono', monospace;
        color: var(--color-text-muted);
      }
      .brief-v2-spacing-rules {
        list-style: none; padding: 0; margin: 0;
        display: flex; flex-direction: column; gap: 6px;
      }
      .brief-v2-spacing-rules li {
        font-size: 12px;
        line-height: 1.55;
        color: var(--color-text-soft);
        padding-left: 14px;
        position: relative;
      }
      .brief-v2-spacing-rules li::before {
        content: '';
        position: absolute;
        left: 0; top: 8px;
        width: 4px; height: 4px;
        border-radius: 50%;
        background: var(--color-text-muted);
      }
      .brief-v2-spacing-rules strong { color: var(--color-text); font-weight: 700; }

      /* ── Grid system ──────────────────────────────────────────── */
      .brief-v2-grid-sys { display: flex; flex-direction: column; gap: 12px; }
      .brief-v2-grid-sys-cards {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 10px;
      }
      @media (max-width: 767px) {
        .brief-v2-grid-sys-cards { grid-template-columns: 1fr; }
      }
      .brief-v2-grid-sys-card {
        padding: 12px 14px;
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: 10px;
      }
      .brief-v2-grid-sys-head {
        display: flex; align-items: center; justify-content: space-between;
        margin-bottom: 8px;
      }
      .brief-v2-grid-sys-label {
        font: 800 11px 'Urbanist', sans-serif;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--color-text);
      }
      .brief-v2-grid-sys-hint {
        font: 600 10px 'JetBrains Mono', monospace;
        color: var(--color-text-muted);
      }
      .brief-v2-grid-sys-spec {
        display: grid;
        grid-template-columns: 80px 1fr;
        gap: 4px 10px;
        margin: 0;
      }
      .brief-v2-grid-sys-spec dt {
        font: 700 10px 'Urbanist', sans-serif;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: var(--color-text-muted);
      }
      .brief-v2-grid-sys-spec dd {
        margin: 0;
        font: 700 12px 'JetBrains Mono', monospace;
        color: var(--color-text);
      }
      .brief-v2-grid-sys-rationale {
        margin: 0;
        font-size: 12px;
        color: var(--color-text-soft);
        line-height: 1.55;
      }

      /* ── Component system ─────────────────────────────────────── */
      .brief-v2-comp-sys { display: flex; flex-direction: column; gap: 14px; }
      .brief-v2-comp-sys-block {
        padding: 12px 14px;
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: 10px;
        display: flex; flex-direction: column; gap: 10px;
      }
      .brief-v2-comp-sys-label {
        font: 800 10px 'Urbanist', sans-serif;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: var(--color-text-muted);
      }
      .brief-v2-comp-sys-radii,
      .brief-v2-comp-sys-shadows {
        display: flex; gap: 18px; flex-wrap: wrap;
      }
      .brief-v2-comp-sys-radius,
      .brief-v2-comp-sys-shadow {
        display: flex; flex-direction: column; gap: 6px; align-items: center;
      }
      .brief-v2-comp-sys-radius-swatch {
        width: 56px; height: 56px;
        background: var(--color-accent);
      }
      .brief-v2-comp-sys-shadow-swatch {
        width: 56px; height: 56px;
        background: var(--color-bg);
        border: 1px solid var(--color-border);
        border-radius: 8px;
      }
      .brief-v2-comp-sys-radius-meta { display: flex; flex-direction: column; align-items: center; gap: 2px; }
      .brief-v2-comp-sys-radius-key {
        font: 700 10px 'Urbanist', sans-serif;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: var(--color-text-soft);
      }
      .brief-v2-comp-sys-radius-val {
        font: 600 10px 'JetBrains Mono', monospace;
        color: var(--color-text-muted);
      }
      .brief-v2-comp-sys-density {
        display: inline-flex;
      }
      .brief-v2-comp-sys-density-val {
        padding: 6px 14px;
        background: var(--color-text);
        color: var(--color-bg);
        border-radius: 100px;
        font: 800 11px 'Urbanist', sans-serif;
        letter-spacing: 0.06em;
        text-transform: uppercase;
      }
      .brief-v2-comp-sys-note {
        margin: 0;
        font-size: 12px;
        line-height: 1.55;
        color: var(--color-text-soft);
      }

      /* ── Visual language ──────────────────────────────────────── */
      .brief-v2-vl {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
        gap: 10px;
      }
      .brief-v2-vl-card {
        padding: 12px 14px;
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: 10px;
        display: flex; flex-direction: column; gap: 6px;
      }
      .brief-v2-vl-head {
        display: flex; align-items: center; gap: 8px;
      }
      .brief-v2-vl-icon {
        font-size: 14px;
        line-height: 1;
        color: var(--color-accent);
      }
      .brief-v2-vl-label {
        font: 800 10px 'Urbanist', sans-serif;
        letter-spacing: 0.10em;
        text-transform: uppercase;
        color: var(--color-text-muted);
      }
      .brief-v2-vl-text {
        margin: 0;
        font-size: 12px;
        line-height: 1.55;
        color: var(--color-text);
      }

      /* ── Inspiration grid ─────────────────────────────────────── */
      .brief-v2-insp {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
        gap: 12px;
      }
      .brief-v2-insp-card {
        padding: 14px 16px;
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: 12px;
        display: flex; flex-direction: column; gap: 10px;
      }
      .brief-v2-insp-head { display: flex; flex-direction: column; gap: 4px; }
      .brief-v2-insp-cat {
        align-self: flex-start;
        padding: 3px 9px;
        background: rgba(139,92,246,0.10);
        color: var(--color-accent);
        border: 1px solid rgba(139,92,246,0.25);
        border-radius: 100px;
        font: 700 9px 'Urbanist', sans-serif;
        letter-spacing: 0.10em;
        text-transform: uppercase;
      }
      .brief-v2-insp-name {
        margin: 0;
        font: 800 14px 'Urbanist', sans-serif;
        color: var(--color-text);
      }
      .brief-v2-insp-url {
        align-self: flex-start;
        font: 600 11px 'JetBrains Mono', monospace;
        color: var(--color-accent);
        text-decoration: none;
        padding: 2px 7px;
        border: 1px solid rgba(139,92,246,0.25);
        border-radius: 6px;
      }
      .brief-v2-insp-url:hover { background: rgba(139,92,246,0.08); }
      .brief-v2-insp-spec {
        display: grid;
        grid-template-columns: 70px 1fr;
        gap: 6px 10px;
        margin: 0;
      }
      .brief-v2-insp-spec dt {
        font: 800 9px 'Urbanist', sans-serif;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
      .brief-v2-insp-dt-good { color: #047857; }
      .brief-v2-insp-dt-bad  { color: #b91c1c; }
      .brief-v2-insp-dt-why  { color: var(--color-text-muted); }
      .brief-v2-insp-spec dd {
        margin: 0;
        font-size: 12px;
        line-height: 1.5;
        color: var(--color-text);
      }

      /* ── Builder guidance (accordion) ─────────────────────────── */
      .brief-v2-bg {
        list-style: none; padding: 0; margin: 0;
        display: flex; flex-direction: column; gap: 8px;
      }
      .brief-v2-bg-item {
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: 10px;
        overflow: hidden;
      }
      .brief-v2-bg-head {
        width: 100%;
        display: flex; align-items: center; justify-content: space-between;
        padding: 12px 14px;
        background: transparent;
        border: none;
        cursor: pointer;
        text-align: left;
      }
      .brief-v2-bg-feature {
        font: 800 13px 'Urbanist', sans-serif;
        color: var(--color-text);
      }
      .brief-v2-bg-chevron {
        font: 700 16px 'JetBrains Mono', monospace;
        color: var(--color-text-muted);
      }
      .brief-v2-bg-body {
        padding: 0 14px 14px;
        display: flex; flex-direction: column; gap: 10px;
        border-top: 1px solid var(--color-border);
        padding-top: 12px;
      }
      .brief-v2-bg-twocol { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
      @media (max-width: 600px) { .brief-v2-bg-twocol { grid-template-columns: 1fr; } }
      .brief-v2-bg-row {
        padding: 10px 12px;
        background: var(--color-bg);
        border: 1px solid var(--color-border);
        border-radius: 8px;
        display: flex; flex-direction: column; gap: 4px;
      }
      .brief-v2-bg-row span {
        font: 800 9px 'Urbanist', sans-serif;
        letter-spacing: 0.12em;
        color: var(--color-text-muted);
      }
      .brief-v2-bg-row p {
        margin: 0;
        font-size: 12px;
        line-height: 1.55;
        color: var(--color-text);
      }
      .brief-v2-bg-row-good { border-left: 3px solid #10b981; }
      .brief-v2-bg-row-bad  { border-left: 3px solid #b91c1c; }
      .brief-v2-bg-chips { display: flex; gap: 5px; flex-wrap: wrap; margin-top: 4px; }
      .brief-v2-bg-chip {
        padding: 3px 9px;
        background: var(--color-bg);
        border: 1px solid var(--color-border);
        border-radius: 6px;
        font: 600 10px 'JetBrains Mono', monospace;
        color: var(--color-text);
      }

      /* ── Director's verdict ──────────────────────────────────── */
      .brief-v2-verdict {
        display: flex; flex-direction: column; gap: 18px;
      }
      .brief-v2-verdict-lead {
        padding: 14px 16px;
        background: var(--color-bg);
        border: 1px solid var(--color-border);
        border-left: 3px solid var(--color-accent);
        border-radius: 10px;
      }
      .brief-v2-verdict-lead-label {
        font: 800 9px 'Urbanist', sans-serif;
        letter-spacing: 0.14em;
        color: var(--color-text-muted);
        margin-bottom: 5px;
      }
      .brief-v2-verdict-lead p {
        margin: 0;
        font-size: 15px;
        line-height: 1.55;
        color: var(--color-text);
        font-weight: 600;
      }
      .brief-v2-verdict-calls {
        list-style: none; padding: 0; margin: 0;
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 10px;
      }
      .brief-v2-verdict-call {
        padding: 11px 12px;
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: 9px;
        display: flex; flex-direction: column; gap: 4px;
        min-width: 0;
      }
      .brief-v2-verdict-call-label {
        font: 800 9px 'Urbanist', sans-serif;
        letter-spacing: 0.10em;
        text-transform: uppercase;
        color: var(--color-text-muted);
      }
      .brief-v2-verdict-call-value {
        font-size: 13px;
        line-height: 1.45;
        color: var(--color-text);
        font-weight: 700;
      }
      .brief-v2-verdict-call-value.is-mono {
        font-family: 'JetBrains Mono', monospace;
        font-size: 12px;
        font-weight: 600;
      }
      @media (max-width: 767px) {
        .brief-v2-verdict-calls { grid-template-columns: 1fr; }
      }
      @media (min-width: 768px) and (max-width: 1023px) {
        .brief-v2-verdict-calls { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      }
      .brief-v2-verdict-risks {
        list-style: none; padding: 0; margin: 0;
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 10px;
      }
      .brief-v2-verdict-risk {
        padding: 11px 13px;
        border-radius: 9px;
        border: 1px solid;
        display: flex; flex-direction: column; gap: 4px;
      }
      .brief-v2-verdict-risk-good {
        background: rgba(16,185,129,0.06);
        border-color: rgba(16,185,129,0.30);
      }
      .brief-v2-verdict-risk-warn {
        background: rgba(180,83,9,0.08);
        border-color: rgba(180,83,9,0.40);
      }
      .brief-v2-verdict-risk-label {
        font: 800 9px 'Urbanist', sans-serif;
        letter-spacing: 0.10em;
        text-transform: uppercase;
      }
      .brief-v2-verdict-risk-good .brief-v2-verdict-risk-label { color: #047857; }
      .brief-v2-verdict-risk-warn .brief-v2-verdict-risk-label { color: #b45309; }
      .brief-v2-verdict-risk-text {
        font-size: 13px;
        line-height: 1.5;
        color: var(--color-text);
      }
      @media (max-width: 600px) {
        .brief-v2-verdict-risks { grid-template-columns: 1fr; }
      }
      .brief-v2-verdict-final {
        padding: 18px 20px;
        background: var(--color-text);
        color: var(--color-bg);
        border-radius: 12px;
      }
      .brief-v2-verdict-final-label {
        font: 800 9px 'Urbanist', sans-serif;
        letter-spacing: 0.16em;
        color: rgba(255,255,255,0.55);
        margin-bottom: 8px;
      }
      .brief-v2-verdict-final p {
        margin: 0;
        font-size: 14px;
        line-height: 1.6;
        font-weight: 600;
      }

      /* ── Section rhythm: more breathing room between sections,
         editorial divider line above each header. */
      .brief-v2-section {
        margin-top: 56px;
        padding-top: 32px;
        border-top: 1px solid var(--color-border);
        scroll-margin-top: 80px;
      }
      .brief-v2-section:first-of-type {
        margin-top: 28px;
        padding-top: 0;
        border-top: none;
      }
      .brief-v2-section-header {
        display: flex; align-items: flex-start; gap: 18px;
        margin-bottom: 22px;
        padding: 8px 0;
      }
      .brief-v2-section-num {
        font: 800 36px 'Urbanist', sans-serif;
        line-height: 0.9;
        letter-spacing: -0.02em;
        flex-shrink: 0;
        font-variant-numeric: tabular-nums;
      }
      .brief-v2-section-headtext { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
      .brief-v2-section-eyebrow {
        font: 800 10px 'Urbanist', sans-serif;
        letter-spacing: 0.14em;
        text-transform: uppercase;
      }
      /* Per-section client review status accents on the wrapping section */
      .brief-v2-section-approved          { /* accent supplied by inner bar */ }
      .brief-v2-section-changes_requested { /* accent supplied by inner bar */ }

      /* ── Per-section layout grid — 12-col system so cards can
         declare full / half (and future third / quarter) widths
         intentionally. */
      .brief-v2-grid {
        display: grid;
        grid-template-columns: repeat(12, 1fr);
        gap: 16px;
      }
      .brief-v2-cell-full  { grid-column: span 12; min-width: 0; }
      .brief-v2-cell-half  { grid-column: span 6;  min-width: 0; }
      .brief-v2-cell-third { grid-column: span 4;  min-width: 0; }
      @media (max-width: 1023px) {
        .brief-v2-cell-half  { grid-column: span 12; }
        .brief-v2-cell-third { grid-column: span 12; }
      }
      .brief-v2-cell > .brief-v2-card { height: 100%; }

      /* ── SectionReviewBar ─────────────────────────────────────── */
      .brief-v2-srbar {
        display: flex; align-items: center; justify-content: space-between;
        gap: 12px; flex-wrap: wrap;
        padding: 10px 14px;
        margin-bottom: 14px;
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: 10px;
      }
      .brief-v2-srbar-approved {
        background: rgba(16,185,129,0.06);
        border-color: rgba(16,185,129,0.30);
      }
      .brief-v2-srbar-changes {
        flex-direction: column;
        align-items: flex-start;
        background: rgba(245,158,11,0.06);
        border-color: rgba(245,158,11,0.30);
      }
      .brief-v2-srbar-changes-head {
        display: flex; align-items: center; justify-content: space-between;
        gap: 12px; width: 100%;
      }
      .brief-v2-srbar-note {
        margin: 6px 0 0;
        font-size: 13px; line-height: 1.55;
        color: var(--color-text);
        background: var(--color-bg);
        padding: 10px 12px;
        border-radius: 8px;
        width: 100%;
        white-space: pre-wrap;
      }
      .brief-v2-srbar-prompt {
        font: 700 12px 'Urbanist', sans-serif;
        color: var(--color-text-soft);
      }
      .brief-v2-srbar-pill {
        display: inline-flex; align-items: center; gap: 5px;
        padding: 4px 10px;
        border-radius: 100px;
        font: 800 11px 'Urbanist', sans-serif;
        letter-spacing: 0.02em;
      }
      .brief-v2-srbar-pill-good { background: #10b981; color: white; }
      .brief-v2-srbar-pill-warn { background: #b45309; color: white; }
      .brief-v2-srbar-actions { display: flex; gap: 8px; }
      .brief-v2-srbar-btn {
        display: inline-flex; align-items: center; gap: 5px;
        padding: 7px 14px;
        border-radius: 8px;
        font: 700 12px 'Urbanist', sans-serif;
        cursor: pointer;
        border: 1px solid transparent;
      }
      .brief-v2-srbar-btn:disabled { opacity: 0.55; cursor: not-allowed; }
      .brief-v2-srbar-btn-good { background: #10b981; color: white; }
      .brief-v2-srbar-btn-good:hover:not(:disabled) { opacity: 0.92; }
      .brief-v2-srbar-btn-warn { background: #b45309; color: white; }
      .brief-v2-srbar-btn-warn:hover:not(:disabled) { opacity: 0.92; }
      .brief-v2-srbar-btn-ghost {
        background: transparent;
        border-color: var(--color-border);
        color: var(--color-text-soft);
      }
      .brief-v2-srbar-btn-ghost:hover:not(:disabled) {
        background: var(--color-bg);
        color: var(--color-text);
      }
      .brief-v2-srbar-link {
        background: transparent; border: none; color: var(--color-text-soft);
        font: 700 11px 'Urbanist', sans-serif;
        cursor: pointer;
        text-decoration: underline;
        text-underline-offset: 2px;
        padding: 0;
      }
      .brief-v2-srbar-link:hover { color: var(--color-text); }

      .brief-v2-srbar-compose { flex-direction: column; align-items: stretch; }
      .brief-v2-srbar-compose-label {
        font: 700 11px 'Urbanist', sans-serif;
        color: var(--color-text-muted);
        letter-spacing: 0.04em; text-transform: uppercase;
      }
      .brief-v2-srbar-textarea {
        width: 100%;
        background: var(--color-bg);
        border: 1px solid var(--color-border);
        border-radius: 8px;
        padding: 10px 12px;
        font: 400 13px 'Urbanist', sans-serif;
        line-height: 1.55;
        color: var(--color-text);
        resize: vertical;
        outline: none;
      }
      .brief-v2-srbar-textarea:focus {
        border-color: var(--color-accent);
        box-shadow: 0 0 0 3px rgba(139,92,246,0.10);
      }
      .brief-v2-srbar-compose-actions {
        display: flex; gap: 8px; justify-content: flex-end;
      }
      .brief-v2-section-chip {
        font-family: 'JetBrains Mono', monospace;
        font-size: 10px; letter-spacing: 0.1em;
        padding: 3px 9px; border-radius: 100px;
        background: var(--color-card); color: var(--color-text-soft);
        border: 1px solid var(--color-border);
        text-transform: uppercase; font-weight: 700;
      }
      .brief-v2-section-title { font-size: 26px; line-height: 1.15; font-weight: 800; letter-spacing: -0.02em; margin: 0; color: var(--color-text); }

      .brief-v2-card-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 16px;
      }

      .brief-v2-card {
        background: var(--color-card);
        border: 1px solid var(--color-border);
        border-radius: 14px;
        padding: 18px;
        display: flex; flex-direction: column; gap: 12px;
        min-width: 0;
        transition: background 0.15s, border-color 0.15s;
      }
      .brief-v2-card.is-wide { grid-column: 1 / -1; }
      .brief-v2-card.is-loading { background: var(--color-surface); }

      .brief-v2-card-head { display: flex; align-items: center; gap: 10px; }
      .brief-v2-card-num {
        font-family: 'JetBrains Mono', monospace;
        font-size: 11px; color: var(--color-text-muted);
        background: var(--color-surface);
        padding: 3px 8px; border-radius: 7px;
        border: 1px solid var(--color-border);
        flex-shrink: 0;
      }
      .brief-v2-card-title { font-size: 15px; font-weight: 700; letter-spacing: -0.01em; margin: 0; flex: 1; min-width: 0; }
      .brief-v2-card-badge {
        font-size: 10px; font-weight: 800;
        background: var(--color-accent); color: white;
        border-radius: 100px; padding: 2px 9px;
        flex-shrink: 0;
      }
      .brief-v2-text { margin: 0; }
      .brief-v2-list { padding-left: 18px; margin: 0; display: flex; flex-direction: column; gap: 6px; }
      .brief-v2-list li::marker { color: var(--color-text-muted); }

      .brief-v2-rows-head {
        display: grid; grid-template-columns: 1fr 1fr; gap: 16px;
        margin-bottom: 8px;
        font-size: 10px; font-weight: 700;
        letter-spacing: 0.1em; text-transform: uppercase;
        color: var(--color-text-muted);
      }
      .brief-v2-rows { display: flex; flex-direction: column; gap: 8px; }
      .brief-v2-row {
        display: grid; grid-template-columns: 1fr 1fr; gap: 16px;
        padding: 10px 12px;
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: 10px;
      }
      .brief-v2-row-cell { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
      .brief-v2-row-cell-right { border-left: 1px dashed var(--color-border); padding-left: 16px; }
      .brief-v2-row-label { display: none; font-size: 9px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: var(--color-text-muted); }
      .brief-v2-row-value { font-size: 13px; line-height: 1.5; color: var(--color-text); word-break: break-word; }

      .brief-v2-badged-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 8px; }
      .brief-v2-badged-row {
        display: flex; gap: 12px; align-items: flex-start; justify-content: space-between;
        padding: 10px 12px;
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: 10px;
        border-left-width: 3px;
      }
      .brief-v2-badged-critical { border-left-color: #ef4444; background: rgba(239,68,68,0.05); }
      .brief-v2-badged-warn     { border-left-color: #f59e0b; background: rgba(245,158,11,0.05); }
      .brief-v2-badged-ok       { border-left-color: #10b981; }
      .brief-v2-badged-neutral  { }
      .brief-v2-badged-text { flex: 1; font-size: 13px; line-height: 1.5; color: var(--color-text); min-width: 0; }

      .brief-v2-badge { font-size: 10px; font-weight: 800; padding: 3px 9px; border-radius: 100px; letter-spacing: 0.04em; text-transform: uppercase; flex-shrink: 0; }
      .brief-v2-badge-critical { background: #b91c1c; color: white; }
      .brief-v2-badge-warn     { background: #b45309; color: white; }
      .brief-v2-badge-ok       { background: #10b981; color: white; }
      .brief-v2-badge-neutral  { background: var(--color-text-muted); color: var(--color-bg); }

      .brief-v2-questions { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 6px; counter-reset: q; }
      .brief-v2-question { background: var(--color-surface); border: 1px solid var(--color-border); border-radius: 10px; overflow: hidden; }
      .brief-v2-question-btn {
        display: flex; align-items: center; gap: 10px;
        width: 100%; padding: 10px 12px;
        background: transparent; border: none; cursor: pointer;
        text-align: left; font-family: inherit;
      }
      .brief-v2-question-num { font-family: 'JetBrains Mono', monospace; font-size: 11px; color: var(--color-text-muted); flex-shrink: 0; }
      .brief-v2-question-text { flex: 1; font-size: 13px; line-height: 1.5; color: var(--color-text); min-width: 0; }
      .brief-v2-question-meta { padding: 0 12px 10px; font-size: 11px; color: var(--color-text-muted); display: flex; gap: 14px; flex-wrap: wrap; }
      .brief-v2-question-meta span { display: inline-flex; align-items: center; gap: 5px; }

      .brief-v2-roles { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 8px; }
      .brief-v2-roles li { display: grid; grid-template-columns: 100px 1fr; gap: 12px; align-items: start; padding: 9px 10px; background: var(--color-surface); border: 1px solid var(--color-border); border-radius: 9px; }
      .brief-v2-roles-label { font-size: 10px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: var(--color-text-muted); padding-top: 2px; }
      .brief-v2-roles-value { font-size: 13px; line-height: 1.5; color: var(--color-text); }
      .brief-v2-roles-avoid {
        margin-top: 12px; padding: 9px 10px;
        background: rgba(239,68,68,0.10);
        border: 1px dashed rgba(185,28,28,0.55);
        border-radius: 9px;
        font-size: 12px; line-height: 1.55; color: var(--color-text);
      }
      .brief-v2-roles-avoid-label {
        display: inline-block;
        font-size: 9px; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase;
        color: #b91c1c; /* red-700 — passes AA on the light red tint */
        margin-right: 6px;
      }

      /* ── Colour palette renderer ─────────────────────────────── */
      .brief-v2-palette { display: flex; flex-direction: column; gap: 16px; }
      .brief-v2-swatch-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
        gap: 10px;
      }
      .brief-v2-swatch {
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: 12px;
        overflow: hidden;
        display: flex; flex-direction: column;
      }
      .brief-v2-swatch-chip {
        height: 76px;
        border-bottom: 1px solid var(--color-border);
      }
      .brief-v2-swatch-meta { padding: 10px 12px 12px; display: flex; flex-direction: column; gap: 3px; }
      .brief-v2-swatch-role {
        font-size: 9px; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase;
        color: var(--color-text-muted);
      }
      .brief-v2-swatch-name { font-size: 13px; font-weight: 700; color: var(--color-text); }
      .brief-v2-swatch-hex {
        align-self: flex-start;
        margin-top: 3px; padding: 3px 8px;
        background: var(--color-bg);
        border: 1px solid var(--color-border);
        border-radius: 5px;
        font-family: 'JetBrains Mono', monospace; font-size: 11px; font-weight: 600;
        color: var(--color-text);
        cursor: pointer;
        transition: background 0.15s, color 0.15s;
      }
      .brief-v2-swatch-hex:hover { background: var(--color-text); color: var(--color-bg); }
      .brief-v2-swatch-intent { font-size: 11px; color: var(--color-text-muted); line-height: 1.45; margin-top: 3px; }

      .brief-v2-theme-preview {
        border: 1px solid var(--color-border);
        border-radius: 12px;
        overflow: hidden;
      }
      .brief-v2-theme-head {
        display: flex; align-items: center; justify-content: space-between;
        padding: 10px 14px;
        background: var(--color-surface);
        border-bottom: 1px solid var(--color-border);
      }
      .brief-v2-theme-title {
        font-size: 10px; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase;
        color: var(--color-text-muted);
      }
      .brief-v2-theme-toggle { display: inline-flex; gap: 2px; background: var(--color-bg); border: 1px solid var(--color-border); border-radius: 100px; padding: 2px; }
      .brief-v2-theme-tab {
        padding: 4px 12px; border-radius: 100px; background: transparent; border: none;
        font: 700 11px 'Urbanist', sans-serif; color: var(--color-text-muted); cursor: pointer;
        transition: background 0.15s, color 0.15s;
      }
      .brief-v2-theme-tab.is-active { background: var(--color-text); color: var(--color-bg); }
      .brief-v2-theme-stage { padding: 24px; border-top: none; }

      /* ── Mac window mockup in the live preview ───────────────── */
      .brief-v2-macwin {
        max-width: 560px;
        border: 1px solid;
        border-radius: 12px;
        overflow: hidden;
        box-shadow: 0 12px 28px rgba(0,0,0,0.18);
      }
      .brief-v2-macwin-titlebar {
        display: flex; align-items: center; gap: 6px;
        padding: 9px 14px;
        border-bottom: 1px solid;
      }
      .brief-v2-macwin-dot {
        width: 11px; height: 11px; border-radius: 50%;
        flex-shrink: 0;
      }
      .brief-v2-macwin-dot-r { background: #ff5f57; }
      .brief-v2-macwin-dot-y { background: #febc2e; }
      .brief-v2-macwin-dot-g { background: #28c840; }
      .brief-v2-macwin-nav {
        display: flex; gap: 16px;
        margin-left: 16px;
        font: 600 11px 'Urbanist', sans-serif;
      }
      .brief-v2-macwin-body { padding: 18px 18px 16px; }
      .brief-v2-macwin-h { font-size: 18px; font-weight: 800; margin-bottom: 4px; }
      .brief-v2-macwin-sub { font-size: 12px; margin-bottom: 12px; }
      .brief-v2-macwin-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 12px; }
      .brief-v2-macwin-btn {
        padding: 7px 12px; border: none; border-radius: 7px;
        font: 700 12px 'Urbanist', sans-serif; cursor: pointer;
      }
      .brief-v2-macwin-btn-ghost {
        padding: 7px 12px; background: transparent; border: 1px solid;
        border-radius: 7px;
        font: 700 12px 'Urbanist', sans-serif; cursor: pointer;
      }
      .brief-v2-macwin-row {
        display: flex; align-items: center; gap: 10px;
        padding: 10px 12px;
        border-radius: 8px;
        border: 1px solid;
      }
      .brief-v2-macwin-pill {
        padding: 3px 8px;
        border-radius: 100px;
        font: 800 9px 'Urbanist', sans-serif;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        flex-shrink: 0;
      }
      .brief-v2-macwin-rowtext { font-size: 12px; line-height: 1.4; }
      .brief-v2-theme-card {
        padding: 22px 22px 18px;
        border: 1px solid;
        border-radius: 14px;
        max-width: 560px;
      }
      .brief-v2-theme-eyebrow {
        font-size: 10px; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase;
        margin-bottom: 8px;
      }
      .brief-v2-theme-h { font-size: 22px; font-weight: 800; line-height: 1.2; margin-bottom: 8px; }
      .brief-v2-theme-p { font-size: 13px; line-height: 1.55; margin-bottom: 16px; }
      .brief-v2-theme-actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
      .brief-v2-theme-btn {
        padding: 9px 18px; border: none; border-radius: 8px;
        font: 700 13px 'Urbanist', sans-serif; cursor: pointer;
      }
      .brief-v2-theme-btn-ghost {
        padding: 9px 18px; background: transparent; border: 1px solid;
        border-radius: 8px;
        font: 700 13px 'Urbanist', sans-serif; cursor: pointer;
      }
      .brief-v2-theme-chip {
        padding: 5px 11px; border-radius: 100px;
        font: 700 10px 'Urbanist', sans-serif; letter-spacing: 0.06em; text-transform: uppercase;
      }

      /* ── Typography renderer ─────────────────────────────────── */
      .brief-v2-type { display: flex; flex-direction: column; gap: 18px; }
      .brief-v2-type-families {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: 10px;
      }
      .brief-v2-type-card {
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: 12px;
        padding: 14px 14px 12px;
        display: flex; flex-direction: column; gap: 4px;
      }
      .brief-v2-type-card-role {
        font-size: 9px; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase;
        color: var(--color-text-muted);
      }
      .brief-v2-type-card-name { font-size: 22px; color: var(--color-text); line-height: 1.1; }
      .brief-v2-type-card-meta { font-size: 11px; color: var(--color-text-muted); font-family: 'JetBrains Mono', monospace; }
      .brief-v2-type-card-notes { font-size: 11px; color: var(--color-text-soft); line-height: 1.45; margin-top: 3px; }

      .brief-v2-type-scale {
        border: 1px solid var(--color-border);
        border-radius: 12px;
        overflow: hidden;
      }
      .brief-v2-type-head {
        display: flex; align-items: center; justify-content: space-between;
        padding: 10px 14px;
        background: var(--color-surface);
        border-bottom: 1px solid var(--color-border);
      }
      .brief-v2-type-head-title {
        font-size: 10px; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase;
        color: var(--color-text-muted);
      }
      .brief-v2-type-toggle { display: inline-flex; gap: 2px; background: var(--color-bg); border: 1px solid var(--color-border); border-radius: 100px; padding: 2px; }
      .brief-v2-type-tab {
        padding: 4px 12px; border-radius: 100px; background: transparent; border: none;
        font: 700 11px 'Urbanist', sans-serif; color: var(--color-text-muted); cursor: pointer;
      }
      .brief-v2-type-tab.is-active { background: var(--color-text); color: var(--color-bg); }
      .brief-v2-type-list { list-style: none; padding: 0; margin: 0; }

      .brief-v2-type-scale-scroll { overflow-x: auto; }
      .brief-v2-type-table {
        width: 100%;
        border-collapse: separate;
        border-spacing: 0;
        font-size: 12px;
      }
      .brief-v2-type-table thead th {
        position: sticky; top: 0;
        background: var(--color-surface);
        text-align: left;
        padding: 10px 12px;
        font: 800 10px 'Urbanist', sans-serif;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        color: var(--color-text-muted);
        border-bottom: 1px solid var(--color-border);
      }
      .brief-v2-type-table tbody td {
        padding: 12px;
        border-bottom: 1px solid var(--color-border);
        vertical-align: middle;
      }
      .brief-v2-type-table tbody tr:last-child td { border-bottom: none; }
      .brief-v2-type-table-token {
        font: 800 11px 'Urbanist', sans-serif;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: var(--color-text);
        width: 70px;
      }
      .brief-v2-type-table-num {
        font: 600 11px 'JetBrains Mono', monospace;
        color: var(--color-text-soft);
        white-space: nowrap;
      }
      .brief-v2-type-table-sample {
        color: var(--color-text);
        line-height: 1;
        display: inline-block;
        max-width: 240px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .brief-v2-type-row {
        display: grid;
        grid-template-columns: 200px 1fr;
        gap: 16px;
        padding: 14px 16px;
        border-top: 1px solid var(--color-border);
      }
      .brief-v2-type-row:first-child { border-top: none; }
      .brief-v2-type-row-meta { display: flex; flex-direction: column; gap: 3px; padding-top: 4px; }
      .brief-v2-type-row-token { font-size: 13px; font-weight: 800; color: var(--color-text); }
      .brief-v2-type-row-spec { font-size: 11px; color: var(--color-text-muted); font-family: 'JetBrains Mono', monospace; }
      .brief-v2-type-row-use { font-size: 11px; color: var(--color-text-soft); }
      .brief-v2-type-row-sample { color: var(--color-text); overflow: hidden; min-width: 0; word-break: break-word; }
      @media (max-width: 767px) {
        .brief-v2-type-row { grid-template-columns: 1fr; gap: 8px; }
      }

      .brief-v2-journey { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 10px; }
      .brief-v2-journey-step { display: grid; grid-template-columns: 32px 1fr; gap: 12px; padding: 10px 12px; background: var(--color-surface); border: 1px solid var(--color-border); border-radius: 10px; }
      .brief-v2-journey-num { font-family: 'JetBrains Mono', monospace; font-size: 11px; font-weight: 700; color: var(--color-accent); padding-top: 1px; }
      .brief-v2-journey-body { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
      .brief-v2-journey-title { font-size: 13px; font-weight: 700; color: var(--color-text); }
      .brief-v2-journey-action { font-size: 12px; color: var(--color-text-soft); line-height: 1.5; }
      .brief-v2-journey-emotion {
        margin-top: 2px;
        align-self: flex-start;
        padding: 2px 8px; border-radius: 100px;
        background: rgba(139,92,246,0.12); color: var(--color-accent);
        font-size: 10px; font-weight: 700; letter-spacing: 0.04em;
        text-transform: lowercase;
      }

      .brief-v2-competitors { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 12px; }
      .brief-v2-competitor { padding: 12px 14px; background: var(--color-surface); border: 1px solid var(--color-border); border-radius: 11px; }
      .brief-v2-competitor-head { display: flex; gap: 10px; align-items: baseline; margin-bottom: 6px; }
      .brief-v2-competitor-name { font-size: 14px; font-weight: 800; color: var(--color-text); }
      .brief-v2-competitor-line { font-size: 12px; line-height: 1.55; margin: 4px 0; color: var(--color-text-soft); }
      .brief-v2-competitor-line strong { color: var(--color-text); font-weight: 700; }

      .brief-v2-comp { display: flex; flex-direction: column; gap: 18px; }
      .brief-v2-comp-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
        gap: 14px;
      }
      .brief-v2-comp-card {
        padding: 16px 16px 14px;
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: 14px;
        display: flex; flex-direction: column;
      }
      .brief-v2-comp-card-head {
        display: flex; align-items: center; justify-content: space-between;
        gap: 10px; margin-bottom: 12px;
      }
      .brief-v2-comp-avatar {
        display: inline-flex; align-items: center; justify-content: center;
        width: 36px; height: 36px;
        border-radius: 9px;
        font: 800 16px 'Urbanist', sans-serif;
        color: white;
        flex-shrink: 0;
      }
      .brief-v2-comp-card-name {
        font: 800 16px 'Urbanist', sans-serif;
        color: var(--color-text);
        margin-bottom: 4px;
      }
      .brief-v2-comp-card-desc {
        margin: 0 0 10px;
        font-size: 12px;
        line-height: 1.55;
        color: var(--color-text-soft);
      }
      .brief-v2-comp-card-pills { display: flex; gap: 5px; flex-wrap: wrap; margin-bottom: 12px; }
      .brief-v2-comp-card-pill {
        padding: 3px 9px;
        background: var(--color-bg);
        border: 1px solid var(--color-border);
        border-radius: 6px;
        font: 600 10px 'Urbanist', sans-serif;
        color: var(--color-text-soft);
      }
      .brief-v2-comp-metrics { display: flex; flex-direction: column; gap: 6px; margin-top: auto; }
      .brief-v2-comp-metric {
        display: grid;
        grid-template-columns: 90px 1fr;
        gap: 10px;
        align-items: center;
      }
      .brief-v2-comp-metric-label {
        font: 600 10px 'Urbanist', sans-serif;
        color: var(--color-text-muted);
      }
      .brief-v2-comp-metric-track {
        position: relative;
        height: 3px;
        background: var(--color-border);
        border-radius: 100px;
      }
      .brief-v2-comp-metric-fill {
        position: absolute; inset: 0 auto 0 0;
        height: 100%;
        border-radius: 100px;
      }
      .brief-v2-comp-metric-thumb {
        position: absolute;
        top: 50%;
        width: 8px; height: 8px;
        border-radius: 50%;
        transform: translate(-50%, -50%);
      }
      .brief-v2-comp-flag {
        margin-top: 12px;
        padding: 7px 11px;
        background: rgba(239,68,68,0.10);
        border: 1px solid rgba(239,68,68,0.30);
        border-radius: 6px;
        font: 700 10px 'Urbanist', sans-serif;
        letter-spacing: 0.06em;
        color: #ef4444;
        text-align: center;
      }

      .brief-v2-competitor-link {
        font: 600 11px 'JetBrains Mono', monospace;
        color: var(--color-accent);
        text-decoration: none;
        padding: 2px 7px;
        border: 1px solid rgba(139,92,246,0.30);
        border-radius: 6px;
        transition: background 0.15s;
      }
      .brief-v2-competitor-link:hover { background: rgba(139,92,246,0.10); }
      .brief-v2-competitor-sw {
        display: grid; grid-template-columns: 1fr 1fr; gap: 8px;
        margin: 8px 0 4px;
      }
      @media (max-width: 600px) { .brief-v2-competitor-sw { grid-template-columns: 1fr; } }
      .brief-v2-competitor-sw-cell { padding: 8px 10px; border-radius: 8px; border: 1px solid; }
      .brief-v2-competitor-sw-good { background: rgba(16,185,129,0.05); border-color: rgba(16,185,129,0.25); }
      .brief-v2-competitor-sw-bad  { background: rgba(239,68,68,0.05);  border-color: rgba(239,68,68,0.25); }
      .brief-v2-competitor-sw-label {
        display: block;
        font: 800 9px 'Urbanist', sans-serif; letter-spacing: 0.1em; text-transform: uppercase;
        color: var(--color-text-muted);
        margin-bottom: 3px;
      }
      .brief-v2-competitor-sw-text { font-size: 12px; line-height: 1.5; color: var(--color-text); }

      .brief-v2-comp-matrix-wrap {
        border: 1px solid var(--color-border);
        border-radius: 12px;
        overflow: hidden;
      }
      .brief-v2-comp-matrix-head {
        padding: 10px 14px;
        background: var(--color-surface);
        border-bottom: 1px solid var(--color-border);
        font: 800 10px 'Urbanist', sans-serif; letter-spacing: 0.12em; text-transform: uppercase;
        color: var(--color-text-muted);
      }
      .brief-v2-comp-matrix-scroll { overflow-x: auto; }
      .brief-v2-comp-matrix {
        width: 100%;
        border-collapse: separate; border-spacing: 0;
        font-size: 12px;
      }
      .brief-v2-comp-matrix th,
      .brief-v2-comp-matrix td {
        text-align: left;
        padding: 10px 12px;
        border-bottom: 1px solid var(--color-border);
        vertical-align: top;
        line-height: 1.5;
        min-width: 160px;
      }
      .brief-v2-comp-matrix thead th { background: var(--color-bg); position: sticky; top: 0; }
      .brief-v2-comp-matrix tbody th[scope="row"] {
        font: 800 10px 'Urbanist', sans-serif; letter-spacing: 0.08em; text-transform: uppercase;
        color: var(--color-text-muted);
        background: var(--color-surface);
        min-width: 130px;
      }
      .brief-v2-comp-matrix-name { font-weight: 800; color: var(--color-text); }
      .brief-v2-comp-matrix-link {
        display: inline-block; margin-top: 2px;
        font: 600 10px 'JetBrains Mono', monospace;
        color: var(--color-accent);
        text-decoration: none;
      }
      .brief-v2-comp-matrix tr:last-child td,
      .brief-v2-comp-matrix tr:last-child th { border-bottom: none; }

      /* ── Moodboard refs ──────────────────────────────────────── */
      .brief-v2-mood { display: flex; flex-direction: column; gap: 14px; }
      .brief-v2-mood-refs {
        border: 1px solid var(--color-border);
        border-radius: 12px;
        overflow: hidden;
      }
      .brief-v2-mood-refs-head {
        padding: 9px 14px;
        background: var(--color-surface);
        border-bottom: 1px solid var(--color-border);
        font: 800 10px 'Urbanist', sans-serif; letter-spacing: 0.12em; text-transform: uppercase;
        color: var(--color-text-muted);
      }
      .brief-v2-mood-list { list-style: none; padding: 0; margin: 0; }
      .brief-v2-mood-ref {
        padding: 12px 14px;
        border-top: 1px solid var(--color-border);
        display: flex; flex-direction: column; gap: 4px;
      }
      .brief-v2-mood-ref:first-child { border-top: none; }
      .brief-v2-mood-ref-top { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
      .brief-v2-mood-ref-type {
        font: 700 9px 'Urbanist', sans-serif; letter-spacing: 0.08em; text-transform: uppercase;
        color: var(--color-accent);
        padding: 2px 7px;
        background: rgba(139,92,246,0.10);
        border: 1px solid rgba(139,92,246,0.25);
        border-radius: 100px;
      }
      .brief-v2-mood-ref-label { font-size: 13px; font-weight: 700; color: var(--color-text); }
      .brief-v2-mood-ref-url {
        font: 600 11px 'JetBrains Mono', monospace;
        color: var(--color-accent);
        text-decoration: none;
        align-self: flex-start;
      }
      .brief-v2-mood-ref-url:hover { text-decoration: underline; }
      .brief-v2-mood-ref-note { font-size: 12px; line-height: 1.5; color: var(--color-text-soft); }

      .brief-v2-inventory { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 10px; }
      .brief-v2-inventory-row { padding: 10px 12px; background: var(--color-surface); border: 1px solid var(--color-border); border-radius: 10px; }
      .brief-v2-inventory-head { display: flex; align-items: center; gap: 10px; justify-content: space-between; margin-bottom: 6px; }
      .brief-v2-inventory-page { font-size: 13px; font-weight: 700; color: var(--color-text); }
      .brief-v2-inventory-line { font-size: 12px; line-height: 1.55; margin: 2px 0; color: var(--color-text-soft); }
      .brief-v2-inventory-line strong { color: var(--color-text); font-weight: 700; }

      .brief-v2-skeleton { display: flex; flex-direction: column; gap: 8px; }
      .brief-v2-skeleton-line {
        height: 9px;
        background: linear-gradient(90deg, var(--color-surface), var(--color-card), var(--color-surface));
        background-size: 200% 100%;
        border-radius: 5px;
        animation: briefv2shimmer 1.4s ease-in-out infinite;
      }

      .brief-v2-banner {
        background: linear-gradient(135deg, rgba(139,92,246,0.10), rgba(99,102,241,0.06));
        border: 1px solid rgba(139,92,246,0.25);
        border-radius: 16px;
        padding: 18px 22px;
        margin-bottom: 24px;
        display: flex; gap: 18px; align-items: center; flex-wrap: wrap;
      }
      .brief-v2-banner-body { flex: 1; min-width: 220px; }
      .brief-v2-banner-title { font-size: 14px; font-weight: 800; margin-bottom: 4px; }
      .brief-v2-banner-sub   { font-size: 12px; color: var(--color-text-soft); }
      .brief-v2-banner-actions { display: flex; gap: 8px; flex-wrap: wrap; }
      .brief-v2-banner-btn {
        display: inline-flex; align-items: center; gap: 6px;
        padding: 8px 14px;
        border: 1px solid var(--color-border);
        border-radius: 9px;
        background: var(--color-card);
        color: var(--color-text);
        font-family: inherit; font-size: 12px; font-weight: 700;
        cursor: pointer;
        transition: background 0.15s, opacity 0.15s;
      }
      .brief-v2-banner-btn:hover { background: var(--color-surface); }
      .brief-v2-banner-btn-primary {
        background: var(--color-accent); color: white; border-color: transparent;
      }
      .brief-v2-banner-btn-primary:hover { background: var(--color-accent); opacity: 0.9; }
      .brief-v2-banner-btn:disabled { opacity: 0.5; cursor: not-allowed; }

      /* ── Version tab strip ────────────────────────────────────── */
      .brief-v2-versions {
        display: flex; align-items: center; gap: 12px;
        margin-bottom: 18px;
        padding: 8px 12px;
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: 12px;
        flex-wrap: wrap;
      }
      .brief-v2-versions-label {
        font: 800 9px 'Urbanist', sans-serif;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: var(--color-text-muted);
        flex-shrink: 0;
      }
      .brief-v2-versions-tabs { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
      .brief-v2-vtab {
        padding: 6px 12px;
        background: transparent;
        border: 1px solid var(--color-border);
        border-radius: 100px;
        font: 700 12px 'Urbanist', sans-serif;
        color: var(--color-text-soft);
        cursor: pointer;
        transition: background 0.15s, color 0.15s, border-color 0.15s;
      }
      .brief-v2-vtab:hover { border-color: var(--color-text-soft); color: var(--color-text); }
      .brief-v2-vtab.is-active {
        background: var(--color-text);
        color: var(--color-bg);
        border-color: var(--color-text);
      }
      .brief-v2-vtab-wrap { display: inline-flex; align-items: center; gap: 6px; }
      .brief-v2-vtab-restore {
        background: transparent; border: none;
        font: 700 11px 'Urbanist', sans-serif;
        color: var(--color-accent);
        cursor: pointer;
        text-decoration: underline;
        text-underline-offset: 2px;
        padding: 0;
      }
      .brief-v2-vtab-restore:hover { opacity: 0.8; }

      /* ── Pending client-changes banner (designer view) ──────────
         Premium dark surface treatment: clean elevated neutral
         (--color-surface) with a 3px terracotta indicator on the
         left edge. The accent is confined to the border + icon
         chip; the body itself sits on the same surface language
         as the rest of the dark UI so the alert announces itself
         without shouting in amber wash.
         Terracotta #c2410c chosen over amber-700 for an editorial
         feel that pairs with luxury / heritage palettes; swap to
         #a16207 (muted amber) or #059669 (emerald) by overriding
         the --pending-accent token below. */
      .brief-v2-pending-banner {
        --pending-accent: #c2410c;
        display: flex; gap: 14px; align-items: flex-start;
        margin-bottom: 24px;
        padding: 16px 18px 16px 16px;
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-left: 3px solid var(--pending-accent);
        border-radius: 12px;
      }
      .brief-v2-pending-banner-icon {
        width: 32px; height: 32px;
        border-radius: 9px;
        background: rgba(194,65,12,0.14);
        color: var(--pending-accent);
        display: inline-flex; align-items: center; justify-content: center;
        flex-shrink: 0;
        margin-top: 1px;
      }
      .brief-v2-pending-banner-title {
        font: 800 14px 'Urbanist', sans-serif;
        color: var(--color-text);
        margin-bottom: 5px;
        letter-spacing: -0.005em;
      }
      .brief-v2-pending-banner-note {
        font-size: 13px;
        color: var(--color-text-soft);
        line-height: 1.6;
        white-space: pre-wrap;
      }
      .brief-v2-pending-banner-btn {
        flex-shrink: 0;
        display: inline-flex; align-items: center; gap: 6px;
        padding: 9px 16px;
        background: var(--color-accent);
        color: white;
        border: none;
        border-radius: 9px;
        font: 700 12px 'Urbanist', sans-serif;
        cursor: pointer;
      }
      .brief-v2-pending-banner-btn:hover { opacity: 0.92; }
      .brief-v2-pending-banner-btn:disabled { opacity: 0.55; cursor: not-allowed; }

      .brief-v2-pending-thread {
        list-style: none; padding: 0; margin: 8px 0 0;
        display: flex; flex-direction: column; gap: 8px;
      }
      .brief-v2-pending-comment {
        padding: 10px 12px;
        /* Recessed inside the banner — sits at --color-bg so it
           feels inset (one layer deeper than the surrounding
           surface). The previous semi-white + amber border looked
           muddy on dark backgrounds. */
        background: var(--color-bg);
        border: 1px solid var(--color-border);
        border-radius: 8px;
      }
      .brief-v2-pending-comment-resolved {
        background: transparent;
        border-color: var(--color-border);
        opacity: 0.55;
      }
      .brief-v2-pending-comment-meta {
        display: flex; align-items: center; justify-content: space-between;
        gap: 8px; margin-bottom: 4px;
      }
      .brief-v2-pending-comment-when {
        font: 700 10px 'Urbanist', sans-serif;
        letter-spacing: 0.04em;
        color: var(--color-text-muted);
      }
      .brief-v2-pending-comment-resolve {
        background: transparent; border: none;
        font: 700 11px 'Urbanist', sans-serif;
        color: #047857;
        cursor: pointer;
        text-decoration: underline;
        text-underline-offset: 2px;
        padding: 0;
      }
      .brief-v2-pending-comment-resolve:hover { opacity: 0.8; }
      .brief-v2-pending-comment-addressed {
        font: 800 9px 'Urbanist', sans-serif; letter-spacing: 0.08em;
        text-transform: uppercase;
        color: #047857;
      }
      .brief-v2-pending-comment-body {
        font-size: 13px;
        line-height: 1.55;
        color: var(--color-text);
        white-space: pre-wrap;
      }
      .brief-v2-pending-resolved-toggle {
        margin-top: 8px;
        background: transparent; border: none;
        font: 700 11px 'Urbanist', sans-serif;
        color: var(--color-text-soft);
        cursor: pointer;
        text-decoration: underline;
        text-underline-offset: 2px;
        padding: 0;
      }

      /* ── Revision meta banner (latest tab info) ───────────────── */
      .brief-v2-revmeta-banner {
        display: flex; gap: 10px; align-items: flex-start;
        margin-bottom: 18px;
        padding: 10px 12px;
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: 10px;
        font-size: 12px;
        color: var(--color-text-soft);
      }
      .brief-v2-revmeta-banner-title {
        font: 700 11px 'Urbanist', sans-serif;
        color: var(--color-text);
        margin-bottom: 3px;
      }
      .brief-v2-revmeta-banner-note {
        font-size: 12px;
        font-style: italic;
        color: var(--color-text-soft);
        line-height: 1.5;
      }

      .brief-v2-ds-grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 14px;
      }
      .brief-v2-ds-card {
        background: var(--color-card);
        border: 1px solid var(--color-border);
        border-radius: 14px;
        padding: 16px;
      }
      .brief-v2-ds-label {
        font-size: 10px; font-weight: 700; letter-spacing: 0.12em;
        text-transform: uppercase; color: var(--color-text-muted);
        margin-bottom: 10px;
      }
      .brief-v2-ds-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 6px; }
      .brief-v2-ds-list li {
        display: grid; grid-template-columns: 90px 1fr; gap: 10px; align-items: start;
        padding: 7px 8px;
        background: var(--color-surface);
        border-radius: 8px;
        font-size: 12px; line-height: 1.5;
      }
      .brief-v2-ds-key { font-size: 9px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--color-text-muted); padding-top: 2px; }
      .brief-v2-ds-val { color: var(--color-text); }

      /* DS mini visuals */
      .brief-v2-ds-visual { margin-bottom: 12px; }

      .brief-v2-ds-colorvis-row { display: flex; flex-wrap: wrap; gap: 6px; }
      .brief-v2-ds-colorvis-chip {
        display: flex; flex-direction: column;
        flex: 1 1 calc(33.33% - 6px); min-width: 70px;
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: 8px;
        overflow: hidden;
      }
      .brief-v2-ds-colorvis-swatch { height: 32px; }
      .brief-v2-ds-colorvis-meta { padding: 5px 7px; }
      .brief-v2-ds-colorvis-name { font-size: 10px; font-weight: 700; color: var(--color-text); line-height: 1.2; }
      .brief-v2-ds-colorvis-hex  { font: 600 9px 'JetBrains Mono', monospace; color: var(--color-text-muted); }

      .brief-v2-ds-typevis { display: flex; flex-direction: column; gap: 6px; padding: 12px; background: var(--color-surface); border-radius: 10px; }
      .brief-v2-ds-typevis-display { font-size: 22px; line-height: 1.1; color: var(--color-text); }
      .brief-v2-ds-typevis-body    { font-size: 13px; line-height: 1.4; color: var(--color-text-soft); }

      .brief-v2-ds-spacevis {
        display: flex; align-items: flex-end; gap: 6px; padding: 10px 8px 4px;
        background: var(--color-surface); border-radius: 10px;
        min-height: 110px;
      }
      .brief-v2-ds-space-col { display: flex; flex-direction: column; align-items: center; gap: 4px; flex: 1; }
      .brief-v2-ds-space-bar {
        width: 100%;
        background: linear-gradient(180deg, var(--color-accent), rgba(139,92,246,0.50));
        border-radius: 3px 3px 0 0;
        min-height: 4px;
      }
      .brief-v2-ds-space-num { font: 600 9px 'JetBrains Mono', monospace; color: var(--color-text-muted); }

      .brief-v2-ds-compvis {
        display: flex; flex-wrap: wrap; align-items: center; gap: 8px;
        padding: 12px; background: var(--color-surface); border-radius: 10px;
      }
      .brief-v2-ds-compvis-btn {
        padding: 7px 14px;
        font: 700 11px 'Urbanist', sans-serif;
        cursor: pointer;
      }
      .brief-v2-ds-compvis-btn-ghost {
        padding: 7px 14px;
        background: transparent;
        color: var(--color-text);
        font: 700 11px 'Urbanist', sans-serif;
        cursor: pointer;
      }
      .brief-v2-ds-compvis-card {
        padding: 8px 14px;
        background: var(--color-bg);
        font: 600 11px 'Urbanist', sans-serif;
        color: var(--color-text-muted);
      }

      .brief-v2-bottombar { display: none; }

      @keyframes briefv2shimmer {
        0%   { background-position: 200% 0; }
        100% { background-position: -200% 0; }
      }
      @keyframes briefv2pulse {
        0%, 100% { opacity: 1; }
        50%      { opacity: 0.45; }
      }

      /* ── Tablet (768-1023) ───────────────────────────────────── */
      @media (max-width: 1023px) {
        .brief-v2-layout { padding: 24px 24px 16px; }
        .brief-v2-card-grid { grid-template-columns: 1fr; }
        .brief-v2-card.is-wide { grid-column: auto; }
        .brief-v2-ds-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      }

      /* ── Mobile (<768) ───────────────────────────────────────── */
      @media (max-width: 767px) {
        .brief-v2-layout { padding: 16px 14px 12px; }
        .brief-v2-hero { padding: 20px 18px; border-radius: 14px; }
        .brief-v2-hero-title { font-size: 24px; }
        .brief-v2-section { margin-top: 36px; padding-top: 24px; }
        .brief-v2-section-header { gap: 14px; }
        .brief-v2-section-num { font-size: 30px; }
        .brief-v2-section-title { font-size: 20px; }
        .brief-v2-section-eyebrow { font-size: 9px; }
        .brief-v2-grid { gap: 12px; }
        .brief-v2-card { padding: 14px; border-radius: 12px; }
        .brief-v2-card-title { font-size: 16px; font-weight: 800; }
        .brief-v2-row { grid-template-columns: 1fr; gap: 10px; }
        .brief-v2-row-cell-right { border-left: none; padding-left: 0; padding-top: 8px; border-top: 1px dashed var(--color-border); }
        .brief-v2-row-label { display: block; }
        .brief-v2-rows-head { display: none; }
        .brief-v2-badged-row { flex-direction: column; align-items: flex-start; gap: 6px; }
        .brief-v2-roles li { grid-template-columns: 1fr; gap: 4px; }
        .brief-v2-roles-label { padding-top: 0; }
        .brief-v2-ds-grid { grid-template-columns: 1fr; }
        .brief-v2-ds-list li { grid-template-columns: 1fr; gap: 4px; }
        .brief-v2-ds-key { padding-top: 0; }
        .brief-v2-bottombar {
          display: flex; align-items: center; gap: 12px;
          position: fixed; left: 12px; right: 12px; bottom: 12px;
          padding: 10px 14px;
          background: var(--color-card);
          border: 1px solid var(--color-border);
          border-radius: 14px;
          box-shadow: 0 18px 40px rgba(0,0,0,0.35);
          z-index: 30;
        }
        .brief-v2-bottombar-progress { flex: 1; }
        .brief-v2-bottombar-label { font-family: 'JetBrains Mono', monospace; font-size: 11px; color: var(--color-text-muted); }
        .brief-v2-bottombar-cta {
          display: flex; align-items: center; justify-content: center; gap: 6px;
          flex: 1;
          padding: 10px 14px;
          background: var(--color-text); color: var(--color-bg);
          border: none; border-radius: 9px;
          font-family: inherit; font-weight: 800; font-size: 13px;
          cursor: pointer;
        }
      }
    `}</style>
  )
}
