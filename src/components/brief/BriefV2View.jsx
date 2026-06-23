// ────────────────────────────────────────────────────────────────────
// BriefV2View — renders the 21-item brief framework.
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
  showCompletionBanner = false,
  designSystemBuilding = false,
}) {
  const sections = useMemo(() => result?.sections || BRIEF_V2_SECTIONS.map(s => ({
    ...s,
    items: s.items.map(it => ({ ...it, content: null })),
  })), [result?.sections])

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

      {/* Top tab bar removed — the brief reads as a single flowing
          document now; the natural section-glyph headers serve as
          jump targets via scroll. */}

      <div className="brief-v2-layout">
        {/* Translation map sidebar removed — designers can use the
            tablet tab bar at the top for jumping between sections,
            and the page scrolls naturally for everything else. */}

        {/* Main column — sections + cards (now full-width) */}
        <main className="brief-v2-main">
          {result?.projectTitle && (
            <header className="brief-v2-hero">
              <div className="brief-v2-hero-row">
                <div className="brief-v2-hero-text">
                  <div className="brief-v2-hero-label">Translated brief</div>
                  <h1 className="brief-v2-hero-title">{result.projectTitle}</h1>
                  <div className="brief-v2-hero-meta">
                    21-item framework · {sections.length} sections
                    {isStreaming && !allDone && <span className="brief-v2-hero-pulse"> · generating…</span>}
                  </div>
                </div>
                {result.score && <BriefScoreBadge score={result.score} />}
              </div>
            </header>
          )}

          {result?.review?.status === 'approved' && (
            <ApprovedBanner review={result.review} />
          )}

          {showCompletionBanner && allDone && (
            <CompletionBanner
              onShareReview={() => setShareOpen(true)}
              reviewStatus={result?.review?.status}
              onBuildBoard={onBuildBoard}
              onExportPdf={onExportPdf}
              designSystemBuilding={designSystemBuilding}
            />
          )}

          {sections.map(section => {
            const decision = sectionDecisions?.[section.id] || null
            const showReview = !!onSectionDecision
            return (
              <section
                key={section.id}
                id={`brief-v2-${section.id}`}
                ref={el => (sectionRefs.current[section.id] = el)}
                className={`brief-v2-section ${decision?.status ? `brief-v2-section-${decision.status}` : ''}`}
              >
                <SectionHeader index={sections.indexOf(section) + 1} label={section.label} sectionId={section.id} />
                {showReview && (
                  <SectionReviewBar
                    sectionId={section.id}
                    decision={decision}
                    onDecide={onSectionDecision}
                  />
                )}
                <div className="brief-v2-card-grid">
                  {section.items.map(item => (
                    <BriefCard key={item.id} item={item} />
                  ))}
                </div>
              </section>
            )
          })}

          {(result?.designSystem || designSystemBuilding) && (
            <DesignSystemPanel ds={result?.designSystem} briefResult={result} building={designSystemBuilding} />
          )}

          <div style={{ height: 80 }} />
        </main>
      </div>

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
// Section header — circular section icon + title chip
// ────────────────────────────────────────────────────────────────────
const SECTION_GLYPHS = {
  understand:  '01',
  interrogate: '02',
  direction:   '03',
  landscape:   '04',
  boundaries:  '05',
}
const SECTION_TONES = {
  understand:  { tint: 'rgba(59,130,246,0.10)',  ink: '#3b82f6' },
  interrogate: { tint: 'rgba(245,158,11,0.10)',  ink: '#d97706' },
  direction:   { tint: 'rgba(139,92,246,0.10)',  ink: '#8b5cf6' },
  landscape:   { tint: 'rgba(16,185,129,0.10)',  ink: '#10b981' },
  boundaries:  { tint: 'rgba(239,68,68,0.10)',   ink: '#ef4444' },
}

function SectionHeader({ index, label, sectionId }) {
  const tone = SECTION_TONES[sectionId] || SECTION_TONES.understand
  const glyph = SECTION_GLYPHS[sectionId] || String(index).padStart(2, '0')
  return (
    <div className="brief-v2-section-header">
      <span
        className="brief-v2-section-glyph"
        style={{ background: tone.tint, color: tone.ink, borderColor: tone.tint }}
        aria-hidden
      >
        {glyph}
      </span>
      <h2 className="brief-v2-section-title">{label}</h2>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────
// SectionReviewBar — Approve / Request changes UI rendered under
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
          placeholder="e.g. The audience description is too broad — we only target independent designers."
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
  // system, and moodboard refs also need the breathing room — added
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
    default:               return <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', margin: 0 }}>{JSON.stringify(content, null, 2)}</pre>
  }
}

// ── Brand personality (chips) ──────────────────────────────────────
// brand_personality is a list of "Trait: explanation" strings. Split
// each entry on the first colon so we can render the trait as a
// chip + the explanation as supporting copy underneath.
function BrandPersonalityContent({ value }) {
  const list = Array.isArray(value) ? value : []
  if (!list.length) return <p className="brief-v2-text">No traits yet.</p>
  return (
    <div className="brief-v2-traits">
      {list.map((entry, i) => {
        const raw = typeof entry === 'string' ? entry : ''
        const colon = raw.indexOf(':')
        const trait = colon > -1 ? raw.slice(0, colon).trim() : raw.trim()
        const explain = colon > -1 ? raw.slice(colon + 1).trim() : ''
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
// register and the wrong register as two separated bands — much
// easier to scan than a single sentence with a "but…" buried in it.
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
          <div className="brief-v2-tone-text">{feels || '—'}</div>
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

// ── Brief score badge ──────────────────────────────────────────────
// Sits in the hero of BriefV2View next to the title. The overall
// score is the big number; sub-scores fold out into a popover on
// click so the hero stays compact by default.
function BriefScoreBadge({ score }) {
  const [open, setOpen] = useState(false)
  if (!score || typeof score.overall !== 'number') return null
  const n = Math.max(0, Math.min(100, Math.round(score.overall)))
  const tone = n >= 85 ? 'excellent' : n >= 70 ? 'strong' : n >= 55 ? 'good' : n >= 40 ? 'thin' : 'critical'
  return (
    <div className="brief-v2-score-wrap">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`brief-v2-score brief-v2-score-${tone}`}
        aria-expanded={open}
      >
        <span className="brief-v2-score-num">{n}</span>
        <span className="brief-v2-score-meta">
          <span className="brief-v2-score-label">Brief score</span>
          <span className="brief-v2-score-rating">{score.rating || '—'}</span>
        </span>
      </button>
      {open && (
        <div className="brief-v2-score-pop" role="dialog" aria-label="Brief score detail">
          {Array.isArray(score.sub) && score.sub.length > 0 && (
            <ul className="brief-v2-score-list">
              {score.sub.map((s, i) => {
                const sn = Math.max(0, Math.min(100, Math.round(s.score || 0)))
                return (
                  <li key={i} className="brief-v2-score-row">
                    <div className="brief-v2-score-row-top">
                      <span className="brief-v2-score-row-label">{s.label}</span>
                      <span className="brief-v2-score-row-num">{sn}</span>
                    </div>
                    <div className="brief-v2-score-bar">
                      <div className="brief-v2-score-bar-fill" style={{ width: sn + '%' }} />
                    </div>
                    {s.note && <div className="brief-v2-score-note">{s.note}</div>}
                  </li>
                )
              })}
            </ul>
          )}
          {score.summary && <div className="brief-v2-score-summary">{score.summary}</div>}
        </div>
      )}
    </div>
  )
}

// ── Text ────────────────────────────────────────────────────────────
function TextContent({ value }) {
  return <p className="brief-v2-text">{String(value || '').trim() || '—'}</p>
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
              <span className="brief-v2-row-value">{r.left || '—'}</span>
            </div>
            <div className="brief-v2-row-cell brief-v2-row-cell-right">
              <span className="brief-v2-row-label">Need</span>
              <span className="brief-v2-row-value">{r.right || '—'}</span>
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
            <span className="brief-v2-badged-text">{it.text || '—'}</span>
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
              <span className="brief-v2-roles-value">{val || '—'}</span>
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
            <div
              className="brief-v2-theme-card"
              style={{ background: tokens.surface, borderColor: tokens.border }}
            >
              <div className="brief-v2-theme-eyebrow" style={{ color: tokens.muted }}>
                Headline
              </div>
              <div className="brief-v2-theme-h" style={{ color: tokens.text }}>
                The brand in its own colours
              </div>
              <div className="brief-v2-theme-p" style={{ color: tokens.muted }}>
                This card uses your palette tokens. Toggle Light / Dark to see how it holds up in both.
              </div>
              <div className="brief-v2-theme-actions">
                <button
                  type="button"
                  className="brief-v2-theme-btn"
                  style={{ background: tokens.primary, color: tokens.onPrimary }}
                >
                  Primary action
                </button>
                <button
                  type="button"
                  className="brief-v2-theme-btn-ghost"
                  style={{ borderColor: tokens.border, color: tokens.text }}
                >
                  Secondary
                </button>
                <span
                  className="brief-v2-theme-chip"
                  style={{ background: tokens.primary + '22', color: tokens.primary }}
                >
                  Tag
                </span>
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
              <span className="brief-v2-roles-value">{val || '—'}</span>
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
          <ul className="brief-v2-type-list">
            {activeScale.map((row, i) => {
              const fam = row.token && /caption|label|meta/i.test(row.token)
                ? (label?.family || bodyFam)
                : (row.token && /body|paragraph/i.test(row.token) ? bodyFam : (display?.family || bodyFam))
              return (
                <li key={i} className="brief-v2-type-row">
                  <div className="brief-v2-type-row-meta">
                    <span className="brief-v2-type-row-token">{row.token}</span>
                    <span className="brief-v2-type-row-spec">
                      {row.size}px / {row.lineHeight}px · {row.weight}
                    </span>
                    {row.useFor && <span className="brief-v2-type-row-use">{row.useFor}</span>}
                  </div>
                  <div
                    className="brief-v2-type-row-sample"
                    style={{
                      fontFamily: `"${fam}", sans-serif`,
                      fontSize: row.size + 'px',
                      lineHeight: row.lineHeight + 'px',
                      fontWeight: row.weight,
                    }}
                  >
                    {sampleFor(row.token)}
                  </div>
                </li>
              )
            })}
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
        {weights.length ? weights.join(' / ') : '—'}{font.tracking ? ` · ${font.tracking}` : ''}
      </div>
      {font.notes && <div className="brief-v2-type-card-notes">{font.notes}</div>}
    </div>
  )
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

// Google Fonts injection — one <link> per family, cached so a
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
      {/* Cards */}
      <ul className="brief-v2-competitors">
        {list.map((c, i) => (
          <li key={i} className="brief-v2-competitor">
            <div className="brief-v2-competitor-head">
              <span className="brief-v2-competitor-name">{c.name || '—'}</span>
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
            {c.positioning && <p className="brief-v2-competitor-line"><strong>Positioning.</strong> {c.positioning}</p>}
            {c.layout      && <p className="brief-v2-competitor-line"><strong>Layout.</strong> {c.layout}</p>}
            {(c.strength || c.weakness) && (
              <div className="brief-v2-competitor-sw">
                {c.strength && (
                  <div className="brief-v2-competitor-sw-cell brief-v2-competitor-sw-good">
                    <span className="brief-v2-competitor-sw-label">Strength</span>
                    <span className="brief-v2-competitor-sw-text">{c.strength}</span>
                  </div>
                )}
                {c.weakness && (
                  <div className="brief-v2-competitor-sw-cell brief-v2-competitor-sw-bad">
                    <span className="brief-v2-competitor-sw-label">Weakness</span>
                    <span className="brief-v2-competitor-sw-text">{c.weakness}</span>
                  </div>
                )}
              </div>
            )}
            {c.differentiation && <p className="brief-v2-competitor-line"><strong>Where to diverge.</strong> {c.differentiation}</p>}
          </li>
        ))}
      </ul>

      {/* Comparison table (only show if we have ≥2 competitors and ≥2 fields to compare) */}
      {list.length >= 2 && <CompetitorMatrix list={list} />}
    </div>
  )
}

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
                  <div className="brief-v2-comp-matrix-name">{c.name || '—'}</div>
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
                  <td key={i}>{c[r.key] || '—'}</td>
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
function MoodboardContent({ value }) {
  // Backwards-compatible: old shape was a plain string.
  if (typeof value === 'string') {
    return <p className="brief-v2-text">{value.trim() || '—'}</p>
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
            ? 'Compiling design system from items 12-17…'
            : 'Click any card to edit. Send to your client for sign-off, or build the board.'}
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

// ── Approved banner — shown when client clicks Approve ─────────────
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
// Responsive styles — single <style> block. Reuses CSS variables
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

      /* Top tab bar removed — no styles needed. */

      .brief-v2-layout {
        /* Full-width single column — the Translation map sidebar
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
      .brief-v2-hero-title { font-size: 32px; line-height: 1.1; font-weight: 800; letter-spacing: -0.02em; margin: 0 0 10px; }
      .brief-v2-hero-meta  { font-size: 12px; color: var(--color-text-muted); }
      .brief-v2-hero-pulse { color: var(--color-accent); animation: briefv2pulse 1.4s ease-in-out infinite; }
      .brief-v2-hero-row { display: flex; gap: 18px; align-items: flex-start; justify-content: space-between; flex-wrap: wrap; }
      .brief-v2-hero-text { flex: 1 1 auto; min-width: 0; }

      /* ── Brief score badge ───────────────────────────────────── */
      .brief-v2-score-wrap { position: relative; flex-shrink: 0; }
      .brief-v2-score {
        display: inline-flex; align-items: center; gap: 12px;
        padding: 10px 14px 10px 12px;
        background: var(--color-bg);
        border: 1px solid var(--color-border);
        border-radius: 14px;
        cursor: pointer;
        text-align: left;
        transition: border-color 0.15s, background 0.15s;
      }
      .brief-v2-score:hover { border-color: var(--color-text-soft); }
      .brief-v2-score-num {
        font: 800 28px 'Urbanist', sans-serif;
        line-height: 1;
        padding: 8px 10px;
        border-radius: 10px;
        color: white;
      }
      .brief-v2-score-meta { display: flex; flex-direction: column; gap: 1px; }
      .brief-v2-score-label {
        font: 800 9px 'Urbanist', sans-serif;
        letter-spacing: 0.12em; text-transform: uppercase;
        color: var(--color-text-muted);
      }
      .brief-v2-score-rating { font: 700 13px 'Urbanist', sans-serif; color: var(--color-text); }
      .brief-v2-score-excellent .brief-v2-score-num { background: #10b981; }
      .brief-v2-score-strong    .brief-v2-score-num { background: #3b82f6; }
      .brief-v2-score-good      .brief-v2-score-num { background: #8b5cf6; }
      .brief-v2-score-thin      .brief-v2-score-num { background: #f59e0b; }
      .brief-v2-score-critical  .brief-v2-score-num { background: #ef4444; }

      .brief-v2-score-pop {
        position: absolute;
        top: calc(100% + 8px);
        right: 0;
        z-index: 20;
        width: 320px;
        background: var(--color-bg);
        border: 1px solid var(--color-border);
        border-radius: 14px;
        padding: 14px;
        box-shadow: 0 16px 40px rgba(0,0,0,0.18);
      }
      .brief-v2-score-list { list-style: none; padding: 0; margin: 0 0 8px; display: flex; flex-direction: column; gap: 10px; }
      .brief-v2-score-row-top { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 4px; }
      .brief-v2-score-row-label { font: 700 12px 'Urbanist', sans-serif; color: var(--color-text); }
      .brief-v2-score-row-num   { font: 800 13px 'JetBrains Mono', monospace; color: var(--color-text); }
      .brief-v2-score-bar { height: 5px; background: var(--color-surface); border-radius: 100px; overflow: hidden; }
      .brief-v2-score-bar-fill { height: 100%; background: var(--color-accent); border-radius: 100px; }
      .brief-v2-score-note { font-size: 11px; color: var(--color-text-muted); margin-top: 4px; line-height: 1.4; }
      .brief-v2-score-summary {
        margin-top: 10px; padding-top: 10px;
        border-top: 1px solid var(--color-border);
        font-size: 12px; line-height: 1.5; color: var(--color-text-soft);
      }

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
      .brief-v2-tone-band-bad  .brief-v2-tone-icon { background: #ef4444; }
      .brief-v2-tone-label {
        font: 800 9px 'Urbanist', sans-serif; letter-spacing: 0.12em; text-transform: uppercase;
        color: var(--color-text-muted);
        margin-bottom: 3px;
      }
      .brief-v2-tone-text { font-size: 13px; line-height: 1.55; color: var(--color-text); }

      .brief-v2-section { margin-bottom: 36px; scroll-margin-top: 80px; }
      .brief-v2-section-header {
        display: flex; align-items: center; gap: 12px;
        margin-bottom: 18px;
        position: sticky; top: 0; z-index: 4;
        background: linear-gradient(to bottom, var(--color-bg) 60%, transparent);
        padding: 10px 0;
      }
      .brief-v2-section-glyph {
        display: inline-flex; align-items: center; justify-content: center;
        width: 36px; height: 36px;
        border-radius: 10px;
        border: 1px solid;
        font: 800 12px 'JetBrains Mono', monospace;
        letter-spacing: 0.04em;
        flex-shrink: 0;
      }
      /* Per-section client review status accents on the wrapping section */
      .brief-v2-section-approved          { /* accent supplied by inner bar */ }
      .brief-v2-section-changes_requested { /* accent supplied by inner bar */ }

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
      .brief-v2-srbar-pill-warn { background: #f59e0b; color: white; }
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
      .brief-v2-srbar-btn-warn { background: #f59e0b; color: white; }
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
      .brief-v2-section-title { font-size: 20px; line-height: 1.2; font-weight: 800; letter-spacing: -0.01em; margin: 0; }

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
      .brief-v2-badge-critical { background: #ef4444; color: white; }
      .brief-v2-badge-warn     { background: #f59e0b; color: white; }
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
        background: rgba(239,68,68,0.05);
        border: 1px dashed rgba(239,68,68,0.35);
        border-radius: 9px;
        font-size: 12px; line-height: 1.55; color: var(--color-text);
      }
      .brief-v2-roles-avoid-label {
        display: inline-block;
        font-size: 9px; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase;
        color: #ef4444; margin-right: 6px;
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
        .brief-v2-section-header { flex-direction: column; align-items: flex-start; gap: 6px; padding: 10px 0 6px; }
        .brief-v2-section-title { font-size: 18px; }
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
