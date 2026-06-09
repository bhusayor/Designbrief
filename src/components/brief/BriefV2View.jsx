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
} from '@heroicons/react/24/outline'
import {
  BRIEF_V2_SECTIONS,
  emptyContentForShape,
} from '../../lib/briefV2Schema.js'

// ────────────────────────────────────────────────────────────────────
// Public component
// ────────────────────────────────────────────────────────────────────
export default function BriefV2View({
  result,
  isStreaming = false,
  onJumpToKanban,
  onReviewTranslation,
  onExportPdf,
  onBuildBoard,
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

      {/* Tablet horizontal tab bar — visible only 768-1023 */}
      <nav className="brief-v2-tabbar" aria-label="Sections">
        {sections.map(s => (
          <button
            key={s.id}
            onClick={() => scrollToSection(s.id)}
            className={`brief-v2-tab ${activeSectionId === s.id ? 'is-active' : ''}`}
          >
            {s.label}
          </button>
        ))}
      </nav>

      <div className="brief-v2-layout">
        {/* Desktop sticky side nav — visible only ≥1024 */}
        <aside className="brief-v2-sidenav" aria-label="Sections">
          <div className="brief-v2-sidenav-inner">
            <div className="brief-v2-sidenav-title">Translation map</div>
            <ol className="brief-v2-sidenav-list">
              {sections.map((s, idx) => (
                <li key={s.id}>
                  <button
                    onClick={() => scrollToSection(s.id)}
                    className={`brief-v2-sidenav-link ${activeSectionId === s.id ? 'is-active' : ''}`}
                  >
                    <span className="brief-v2-sidenav-step">0{idx + 1}</span>
                    <span>{s.label}</span>
                  </button>
                </li>
              ))}
            </ol>
            <div className="brief-v2-sidenav-progress">
              <div className="brief-v2-progress-track">
                <div className="brief-v2-progress-fill" style={{ width: `${progress * 100}%` }} />
              </div>
              <div className="brief-v2-progress-label">
                {completedItems} of {totalItems} items
                {designSystemBuilding && <span className="brief-v2-progress-tag">Building design system</span>}
              </div>
            </div>
          </div>
        </aside>

        {/* Main column — sections + cards */}
        <main className="brief-v2-main">
          {result?.projectTitle && (
            <header className="brief-v2-hero">
              <div className="brief-v2-hero-label">Translated brief</div>
              <h1 className="brief-v2-hero-title">{result.projectTitle}</h1>
              <div className="brief-v2-hero-meta">
                21-item framework · {sections.length} sections
                {isStreaming && !allDone && <span className="brief-v2-hero-pulse"> · generating…</span>}
              </div>
            </header>
          )}

          {showCompletionBanner && allDone && (
            <CompletionBanner
              onReviewTranslation={onReviewTranslation}
              onBuildBoard={onBuildBoard}
              onExportPdf={onExportPdf}
              designSystemBuilding={designSystemBuilding}
            />
          )}

          {sections.map(section => (
            <section
              key={section.id}
              id={`brief-v2-${section.id}`}
              ref={el => (sectionRefs.current[section.id] = el)}
              className="brief-v2-section"
            >
              <SectionHeader index={sections.indexOf(section) + 1} label={section.label} />
              <div className="brief-v2-card-grid">
                {section.items.map(item => (
                  <BriefCard key={item.id} item={item} />
                ))}
              </div>
            </section>
          ))}

          {(result?.designSystem || designSystemBuilding) && (
            <DesignSystemPanel ds={result?.designSystem} building={designSystemBuilding} />
          )}

          <div style={{ height: 80 }} />
        </main>
      </div>

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
// Section header — section number chip + title
// ────────────────────────────────────────────────────────────────────
function SectionHeader({ index, label }) {
  return (
    <div className="brief-v2-section-header">
      <span className="brief-v2-section-chip">Section {index}</span>
      <h2 className="brief-v2-section-title">{label}</h2>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────
// Generic card chrome + content router
// ────────────────────────────────────────────────────────────────────
function BriefCard({ item }) {
  const isLoading = item.content === null || item.content === undefined
  const isFullWidth = item.shape === 'rows' || item.shape === 'journey' || item.shape === 'competitors' || item.shape === 'inventory'

  return (
    <article className={`brief-v2-card ${isFullWidth ? 'is-wide' : ''} ${isLoading ? 'is-loading' : ''}`}>
      <div className="brief-v2-card-head">
        <span className="brief-v2-card-num">{String(item.id).padStart(2, '0')}</span>
        <h3 className="brief-v2-card-title">{item.title}</h3>
        {item.key === 'questions' && Array.isArray(item.content) && (
          <span className="brief-v2-card-badge">{item.content.length}</span>
        )}
      </div>
      <div className="brief-v2-card-body">
        {isLoading
          ? <Skeleton shape={item.shape} />
          : <ItemContent shape={item.shape} content={item.content} item={item} />}
      </div>
    </article>
  )
}

// ────────────────────────────────────────────────────────────────────
// Item shape → renderer map
// ────────────────────────────────────────────────────────────────────
function ItemContent({ shape, content, item }) {
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
    default:               return <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', margin: 0 }}>{JSON.stringify(content, null, 2)}</pre>
  }
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

// ── Color roles ────────────────────────────────────────────────────
function RolesContent({ value }) {
  const v = value || {}
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

// ── Typography levels ──────────────────────────────────────────────
function LevelsContent({ value }) {
  const v = value || {}
  const rows = [
    ['Display', v.display],
    ['Body',    v.body],
    ['Label',   v.label],
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
          <span className="brief-v2-roles-avoid-label">Avoid</span> {v.avoid}
        </div>
      )}
    </>
  )
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
function CompetitorsContent({ value }) {
  const list = Array.isArray(value) ? value : []
  if (!list.length) return <p className="brief-v2-text">No competitors detected.</p>
  return (
    <ul className="brief-v2-competitors">
      {list.map((c, i) => (
        <li key={i} className="brief-v2-competitor">
          <div className="brief-v2-competitor-head">
            <span className="brief-v2-competitor-name">{c.name || '—'}</span>
          </div>
          {c.positioning && <p className="brief-v2-competitor-line"><strong>Positioning.</strong> {c.positioning}</p>}
          {c.layout      && <p className="brief-v2-competitor-line"><strong>Layout.</strong> {c.layout}</p>}
          {c.differentiation && <p className="brief-v2-competitor-line"><strong>Where to diverge.</strong> {c.differentiation}</p>}
        </li>
      ))}
    </ul>
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
function DesignSystemPanel({ ds, building }) {
  const pillars = [
    { key: 'color',           label: 'Color',           lines: ds?.color           ? colorLines(ds.color)           : null },
    { key: 'typography',      label: 'Typography',      lines: ds?.typography      ? typographyLines(ds.typography) : null },
    { key: 'spacing',         label: 'Spacing',         lines: ds?.spacing         ? spacingLines(ds.spacing)       : null },
    { key: 'component',       label: 'Components',      lines: ds?.component       ? componentLines(ds.component)   : null },
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
            {p.lines ? (
              <ul className="brief-v2-ds-list">
                {p.lines.map((l, i) => (
                  <li key={i}>
                    <span className="brief-v2-ds-key">{l.key}</span>
                    <span className="brief-v2-ds-val">{l.val}</span>
                  </li>
                ))}
              </ul>
            ) : (
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
function CompletionBanner({ onReviewTranslation, onBuildBoard, onExportPdf, designSystemBuilding }) {
  return (
    <div className="brief-v2-banner">
      <div className="brief-v2-banner-body">
        <div className="brief-v2-banner-title">Translation ready</div>
        <div className="brief-v2-banner-sub">
          {designSystemBuilding ? 'Compiling design system from items 12-17…' : 'Design system attached. Build the board when you are ready.'}
        </div>
      </div>
      <div className="brief-v2-banner-actions">
        <button onClick={onReviewTranslation} className="brief-v2-banner-btn brief-v2-banner-btn-quiet">
          Review translation
        </button>
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

      .brief-v2-tabbar { display: none; }

      .brief-v2-layout {
        display: grid;
        grid-template-columns: 260px minmax(0, 1fr);
        gap: 32px;
        max-width: 1280px;
        margin: 0 auto;
        padding: 32px 32px 24px;
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

      .brief-v2-section { margin-bottom: 36px; scroll-margin-top: 80px; }
      .brief-v2-section-header {
        display: flex; align-items: baseline; gap: 12px;
        margin-bottom: 18px;
        position: sticky; top: 0; z-index: 4;
        background: linear-gradient(to bottom, var(--color-bg) 60%, transparent);
        padding: 10px 0;
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
      .brief-v2-card-body { font-size: 13px; line-height: 1.6; color: var(--color-text-soft); }

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
        .brief-v2-layout { grid-template-columns: 1fr; padding: 24px 24px 16px; gap: 0; }
        .brief-v2-sidenav { display: none; }
        .brief-v2-tabbar {
          display: flex; gap: 6px;
          overflow-x: auto;
          padding: 12px 24px;
          position: sticky; top: 0; z-index: 6;
          background: var(--color-bg);
          border-bottom: 1px solid var(--color-border);
          -webkit-overflow-scrolling: touch;
        }
        .brief-v2-tab {
          flex-shrink: 0;
          padding: 7px 14px; border-radius: 100px;
          background: var(--color-surface);
          border: 1px solid var(--color-border);
          color: var(--color-text-soft);
          font-family: inherit; font-size: 12px; font-weight: 700;
          cursor: pointer;
          white-space: nowrap;
        }
        .brief-v2-tab.is-active { background: var(--color-text); color: var(--color-bg); border-color: var(--color-text); }
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
