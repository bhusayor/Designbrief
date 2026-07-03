// ────────────────────────────────────────────────────────────────────
// BriefV3View.jsx — Design Intelligence Document renderer.
//
// PHASE 1A:
//   - New document shell (sticky left nav + long-form right column).
//     Editorial typography (Fraunces for chapter headings, Inter for
//     body, JetBrains Mono for metadata). Slate + amber palette,
//     NO purple, NO card grid, no carry-over from V2.
//   - Renderers for sections 1-4: Executive Summary (snapshot table),
//     Brief Health (scorecard), Problem Definition (state diagram),
//     Business Intelligence (priority matrix).
//   - Every other section renders a "Coming next phase" placeholder
//     so designers can preview the structure on real briefs while
//     Phase 1B-3 ships.
//
// V2 stays completely untouched. Dashboard routes briefs whose
// schemaVersion is 'v3' to this component; everything else still
// renders through BriefV2View.
// ────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useRef, useState } from 'react'
import './briefV3.css'
import { BRIEF_V3_TIERS } from '../../lib/briefV3Schema.js'

export default function BriefV3View({
  result,
  isStreaming = false,
  revising = false,
  // The wider app still hands these in (revise modal trigger, comments
  // banner, version tabs). Phase 1A renders the doc only; Phase 1B will
  // wire these into the shell where they belong.
  onRevise,
  // Phase 2 backlog handoff. When the project has a generated backlog,
  // hasBacklog=true and clicking the button switches to the backlog
  // view; otherwise the button runs the generator.
  onGenerateBacklog,
  onViewBacklog,
  hasBacklog = false,
  isGeneratingBacklog = false,
  // Send-for-client-review modal trigger (Dashboard renders the modal).
  onShareReview,
  versionTabs,
  pendingChangesBanner,
}) {
  const sections = Array.isArray(result?.sections) ? result.sections : []
  const [activeKey, setActiveKey] = useState(sections[0]?.key || null)
  const containerRef = useRef(null)

  // Scrollspy: highlight the nav entry of whichever chapter is
  // currently in the viewport. IntersectionObserver fires whenever
  // a chapter header crosses the top sentinel band.
  useEffect(() => {
    const root = containerRef.current
    if (!root) return
    const headers = root.querySelectorAll('[data-chapter-key]')
    if (!headers.length) return
    const observer = new IntersectionObserver(
      (entries) => {
        // Pick the entry closest to the top sentinel that is currently
        // intersecting; default to the first intersecting one.
        const visible = entries
          .filter(e => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        if (visible[0]) {
          setActiveKey(visible[0].target.getAttribute('data-chapter-key'))
        }
      },
      { rootMargin: '-100px 0px -70% 0px', threshold: [0, 1] }
    )
    headers.forEach(h => observer.observe(h))
    return () => observer.disconnect()
  }, [sections.length])

  function jumpTo(key) {
    const el = containerRef.current?.querySelector(`[data-chapter-key="${key}"]`)
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    setActiveKey(key)
  }

  // Group sections by tier for the left nav.
  const groupedNav = useMemo(() => {
    return BRIEF_V3_TIERS.map(tier => ({
      ...tier,
      sections: sections.filter(s => s.tier === tier.id),
    })).filter(g => g.sections.length > 0)
  }, [sections])

  // Health score for the persistent header chip — pulled from
  // section 2 if present.
  const health = sections.find(s => s.key === 'brief_health')?.content
  const overallScore = (health && !health.__pending_phase && !health.__error) ? Number(health.overall_score) : null

  return (
    <div className="brief-v3-root" ref={containerRef}>

      {/* Persistent top header strip — title + status + revise CTA */}
      <header className="brief-v3-topbar">
        <div className="brief-v3-topbar-inner">
          <div className="brief-v3-topbar-left">
            <span className="brief-v3-topbar-kicker">Design Intelligence Document</span>
            <h1 className="brief-v3-topbar-title">{result?.projectTitle || 'Untitled brief'}</h1>
          </div>
          <div className="brief-v3-topbar-right">
            {Number.isFinite(overallScore) && (
              <div className="brief-v3-topbar-score" title="Brief health score">
                <div className="brief-v3-topbar-score-num">{overallScore}</div>
                <div className="brief-v3-topbar-score-label">brief<br/>health</div>
              </div>
            )}
            {(isStreaming || revising) && (
              <div className="brief-v3-topbar-status">
                <span className="brief-v3-topbar-pulse" aria-hidden />
                {revising ? 'Revising' : 'Generating'}
              </div>
            )}
            {!isStreaming && (
              <button
                className="brief-v3-topbar-backlog"
                type="button"
                onClick={() => window.print()}
                title="Print or save the document as PDF"
              >
                Export PDF
              </button>
            )}
            {onShareReview && !isStreaming && (
              <button className="brief-v3-topbar-backlog" type="button" onClick={onShareReview}>
                Send to client
              </button>
            )}
            {hasBacklog && onViewBacklog && (
              <button className="brief-v3-topbar-backlog" type="button" onClick={onViewBacklog}>
                View backlog
              </button>
            )}
            {!hasBacklog && onGenerateBacklog && (
              <button
                className="brief-v3-topbar-backlog brief-v3-topbar-backlog-generate"
                type="button"
                onClick={onGenerateBacklog}
                disabled={isGeneratingBacklog || isStreaming}
              >
                {isGeneratingBacklog ? 'Generating backlog…' : 'Generate backlog'}
              </button>
            )}
            {onRevise && (
              <button className="brief-v3-topbar-revise" type="button" onClick={onRevise}>
                Revise with AI
              </button>
            )}
          </div>
        </div>
        {/* Versions + pending changes banner slot — Phase 1B wires these */}
        {versionTabs}
        {pendingChangesBanner}
      </header>

      {/* Two-column layout: sticky nav LEFT, document RIGHT. */}
      <div className="brief-v3-layout">
        <aside className="brief-v3-nav" aria-label="Table of contents">
          <div className="brief-v3-nav-eyebrow">Contents</div>
          {groupedNav.map(group => (
            <div key={group.id} className="brief-v3-nav-group">
              <div className="brief-v3-nav-group-label">
                <span className="brief-v3-nav-group-tag">{group.label}</span>
                <span className="brief-v3-nav-group-hint">{group.hint}</span>
              </div>
              <ul className="brief-v3-nav-list">
                {group.sections.map(s => {
                  const status = sectionStatus(s)
                  const isActive = activeKey === s.key
                  return (
                    <li key={s.key}>
                      <button
                        type="button"
                        onClick={() => jumpTo(s.key)}
                        className={`brief-v3-nav-item ${isActive ? 'is-active' : ''} brief-v3-nav-item-${status}`}
                      >
                        <span className="brief-v3-nav-num">{String(s.id).padStart(2, '0')}</span>
                        <span className="brief-v3-nav-title">{s.title}</span>
                        <span className="brief-v3-nav-dot" aria-hidden />
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </aside>

        <main className="brief-v3-doc">
          {sections.map((section, idx) => (
            <Chapter key={section.key} section={section} index={idx} />
          ))}
        </main>
      </div>
    </div>
  )
}

function sectionStatus(s) {
  if (!s.content) return 'pending'           // streaming
  if (s.content.__pending_phase) return 'phase'  // not in this build yet
  if (s.content.__error) return 'error'
  return 'done'
}

// ────────────────────────────────────────────────────────────────────
// Chapter — one section. Big editorial header (Number + Title + 1-line
// description) followed by the shape-specific renderer.
// ────────────────────────────────────────────────────────────────────
function Chapter({ section, index }) {
  const status = sectionStatus(section)
  return (
    <section
      className={`brief-v3-chapter brief-v3-chapter-${status}`}
      data-chapter-key={section.key}
    >
      <header className="brief-v3-chapter-head">
        <div className="brief-v3-chapter-num">{String(section.id).padStart(2, '0')}</div>
        <div className="brief-v3-chapter-meta">
          <h2 className="brief-v3-chapter-title">{section.title}</h2>
          {section.description && (
            <p className="brief-v3-chapter-desc">{section.description}</p>
          )}
        </div>
        <ChapterStatusBadge status={status} />
      </header>
      <div className="brief-v3-chapter-body">
        {status === 'pending' && <SkeletonBlock />}
        {status === 'phase' && <PhasePlaceholder section={section} />}
        {status === 'error' && <ErrorBlock section={section} />}
        {status === 'done' && <ShapeRenderer section={section} />}
      </div>
    </section>
  )
}

function ChapterStatusBadge({ status }) {
  if (status === 'done') return null
  const label = {
    pending: 'Generating',
    phase:   'Coming next',
    error:   'Failed',
  }[status]
  return <span className={`brief-v3-chapter-badge brief-v3-chapter-badge-${status}`}>{label}</span>
}

function SkeletonBlock() {
  return (
    <div className="brief-v3-skeleton">
      <div className="brief-v3-skeleton-row" style={{ width: '70%' }} />
      <div className="brief-v3-skeleton-row" style={{ width: '90%' }} />
      <div className="brief-v3-skeleton-row" style={{ width: '55%' }} />
    </div>
  )
}

function PhasePlaceholder({ section }) {
  return (
    <div className="brief-v3-phase">
      <p>
        This chapter ships in the next phase of the Intelligence Document build.
        Phase 1A covers the first four chapters (Executive Summary through Business
        Intelligence) so you can validate the structure on real briefs before the
        remaining {sectionPhase(section.id)} chapters are wired.
      </p>
    </div>
  )
}
function sectionPhase(id) {
  if (id <= 8)  return '4 Discover'
  if (id <= 13) return '5 Design'
  if (id <= 18) return '5 Direction'
  return '4 Execute'
}

function ErrorBlock({ section }) {
  return (
    <div className="brief-v3-error">
      <div className="brief-v3-error-head">Could not generate this chapter.</div>
      <div className="brief-v3-error-body">{section.content?.reason || 'Unknown error'}</div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────
// Shape router — picks the renderer per section shape.
// ────────────────────────────────────────────────────────────────────
function ShapeRenderer({ section }) {
  const c = section.content
  switch (section.shape) {
    case 'snapshot':            return <SnapshotRenderer        content={c} />
    case 'scorecard':           return <ScorecardRenderer       content={c} />
    case 'state_diagram':       return <StateDiagramRenderer    content={c} />
    case 'priority_matrix':     return <PriorityMatrixRenderer  content={c} />
    case 'personas':            return <PersonasRenderer        content={c} />
    case 'jtbd_canvas':         return <JtbdCanvasRenderer      content={c} />
    case 'journey_map':         return <JourneyMapRenderer      content={c} />
    case 'flow_chart':          return <FlowChartRenderer       content={c} />
    case 'tree':                return <TreeRenderer            content={c} />
    case 'requirements':        return <RequirementsRenderer    content={c} />
    case 'nfr_grid':            return <NfrGridRenderer         content={c} />
    case 'content_strategy':    return <ContentStrategyRenderer content={c} />
    case 'competitive':         return <CompetitiveRenderer     content={c} />
    case 'principles':          return <PrinciplesRenderer      content={c} />
    case 'visual_direction':    return <VisualDirectionRenderer content={c} />
    case 'component_inventory': return <ComponentInventoryRenderer content={c} />
    case 'ux_writing':          return <UxWritingRenderer        content={c} />
    case 'design_tokens':       return <DesignTokensRenderer     content={c} />
    case 'tech_considerations': return <TechConsiderationsRenderer content={c} />
    case 'risk_register':       return <RiskRegisterRenderer     content={c} />
    case 'success_metrics':     return <SuccessMetricsRenderer   content={c} />
    case 'ai_package':          return <AiPackageRenderer        content={c} />
    default:
      return (
        <div className="brief-v3-unhandled">
          Renderer for shape <code>{section.shape}</code> not yet implemented.
        </div>
      )
  }
}

// ────────────────────────────────────────────────────────────────────
// 1. SnapshotRenderer — Executive Summary
//    Big lede paragraph + 3×4 key/value grid. Inferred fields get
//    a small "inferred" tag so the reader knows what the AI guessed.
// ────────────────────────────────────────────────────────────────────
function SnapshotRenderer({ content }) {
  const c = content || {}
  const snap = c.snapshot || {}
  const rows = [
    ['Project',          snap.project],
    ['Industry',         snap.industry],
    ['Platform',         snap.platform],
    ['Audience',         snap.audience],
    ['Business goal',    snap.business_goal],
    ['User goal',        snap.user_goal],
    ['Core problem',     snap.core_problem],
    ['Expected outcome', snap.expected_outcome],
  ].filter(([, v]) => v && v.value)

  const priority   = snap.priority
  const complexity = snap.complexity
  const confidence = snap.confidence

  return (
    <div className="brief-v3-snapshot">
      {c.summary && <p className="brief-v3-lede">{c.summary}</p>}
      <dl className="brief-v3-snapshot-grid">
        {rows.map(([label, field]) => (
          <div key={label} className="brief-v3-snapshot-row">
            <dt>{label}</dt>
            <dd>
              {field.value}
              {field.assumed && <span className="brief-v3-inferred">inferred</span>}
            </dd>
          </div>
        ))}
      </dl>
      <div className="brief-v3-snapshot-chips">
        {priority   && <SnapshotChip label="Priority"   value={priority.value}   rationale={priority.rationale}   tone="amber" />}
        {complexity && <SnapshotChip label="Complexity" value={complexity.value} rationale={complexity.rationale} tone="slate" />}
        {confidence && <SnapshotChip label="Confidence" value={confidence.value + '%'} rationale={confidence.rationale} tone="emerald" />}
      </div>
    </div>
  )
}
function SnapshotChip({ label, value, rationale, tone }) {
  return (
    <div className={`brief-v3-snapshot-chip brief-v3-snapshot-chip-${tone}`}>
      <span className="brief-v3-snapshot-chip-label">{label}</span>
      <span className="brief-v3-snapshot-chip-value">{value}</span>
      {rationale && <span className="brief-v3-snapshot-chip-rationale">{rationale}</span>}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────
// 2. ScorecardRenderer — Brief Health
//    Big overall score + verdict + 10 dimensional score bars +
//    5 list columns (strengths / weaknesses / missing / risks / questions).
// ────────────────────────────────────────────────────────────────────
function ScorecardRenderer({ content }) {
  const c = content || {}
  const overall = Number.isFinite(Number(c.overall_score)) ? Number(c.overall_score) : null
  const tone = scoreTone(overall ?? 0)
  return (
    <div className="brief-v3-scorecard">
      {overall != null && (
        <div className={`brief-v3-scorecard-hero brief-v3-tone-${tone}`}>
          <div className="brief-v3-scorecard-overall">
            <span className="brief-v3-scorecard-overall-num">{overall}</span>
            <span className="brief-v3-scorecard-overall-of">/100</span>
          </div>
          {c.verdict && <p className="brief-v3-scorecard-verdict">{c.verdict}</p>}
        </div>
      )}
      {Array.isArray(c.scores) && c.scores.length > 0 && (
        <div className="brief-v3-scorecard-bars">
          {c.scores.map((s, i) => {
            const v = Math.max(0, Math.min(100, Number(s.score) || 0))
            const t = scoreTone(v)
            return (
              <div key={i} className="brief-v3-scorebar">
                <div className="brief-v3-scorebar-head">
                  <span className="brief-v3-scorebar-name">{s.dimension}</span>
                  <span className={`brief-v3-scorebar-num brief-v3-tone-${t}`}>{v}</span>
                </div>
                <div className="brief-v3-scorebar-track">
                  <div className={`brief-v3-scorebar-fill brief-v3-tone-${t}`} style={{ width: v + '%' }} />
                </div>
                {s.note && <div className="brief-v3-scorebar-note">{s.note}</div>}
              </div>
            )
          })}
        </div>
      )}
      <div className="brief-v3-scorecard-lists">
        <ScorecardList title="Strengths"      items={c.strengths}   tone="emerald" />
        <ScorecardList title="Weaknesses"     items={c.weaknesses}  tone="amber" />
        <ScorecardList title="Missing"        items={c.missing}     tone="slate" />
        <ScorecardList title="Risks"          items={c.risks}       tone="red"
          renderItem={(r) => (
            <>
              <span>{r.risk || r}</span>
              {r.severity && <span className={`brief-v3-pill brief-v3-pill-${severityTone(r.severity)}`}>{r.severity}</span>}
            </>
          )}
        />
        <ScorecardList title="Questions to send" items={c.questions} tone="indigo" />
      </div>
    </div>
  )
}
function ScorecardList({ title, items, tone, renderItem }) {
  const list = Array.isArray(items) ? items : []
  if (!list.length) return null
  return (
    <div className={`brief-v3-scorelist brief-v3-tone-${tone}`}>
      <div className="brief-v3-scorelist-head">{title}</div>
      <ul>
        {list.map((it, i) => (
          <li key={i}>
            {renderItem ? renderItem(it) : (typeof it === 'string' ? it : (it.text || JSON.stringify(it)))}
          </li>
        ))}
      </ul>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────
// 3. StateDiagramRenderer — Problem Definition
//    Current → Desired left/right cards, gap label between them.
//    Then pain points / root causes / impact / opportunities / unknowns.
// ────────────────────────────────────────────────────────────────────
function StateDiagramRenderer({ content }) {
  const c = content || {}
  return (
    <div className="brief-v3-state">
      <div className="brief-v3-state-flow">
        <div className="brief-v3-state-card brief-v3-state-card-current">
          <div className="brief-v3-state-card-label">Current state</div>
          <p>{c.current_state || '-'}</p>
        </div>
        <div className="brief-v3-state-arrow" aria-hidden>
          <span className="brief-v3-state-arrow-gap">{c.gap || 'gap'}</span>
        </div>
        <div className="brief-v3-state-card brief-v3-state-card-desired">
          <div className="brief-v3-state-card-label">Desired state</div>
          <p>{c.desired_state || '-'}</p>
        </div>
      </div>
      {c.impact && (
        <div className="brief-v3-state-impact">
          <span className="brief-v3-state-impact-label">Impact of inaction</span>
          <p>{c.impact}</p>
        </div>
      )}
      <div className="brief-v3-state-grid">
        <StateColumn title="Pain points" items={c.pain_points} tone="red"
          renderItem={(p) => (
            <>
              <div className="brief-v3-state-line">
                <strong>{p.pain || p}</strong>
                {p.severity && <span className={`brief-v3-pill brief-v3-pill-${severityTone(p.severity)}`}>{p.severity}</span>}
              </div>
              {p.evidence && <div className="brief-v3-state-evidence">{p.evidence}</div>}
            </>
          )}
        />
        <StateColumn title="Root causes" items={c.root_causes} tone="amber"
          renderItem={(r) => (
            <div className="brief-v3-state-line">
              <strong>{r.cause || r}</strong>
              {r.category && <span className="brief-v3-pill brief-v3-pill-slate">{r.category}</span>}
            </div>
          )}
        />
        <StateColumn title="Opportunities" items={c.opportunities} tone="emerald"
          renderItem={(o) => (
            <div className="brief-v3-state-line">
              <strong>{o.opportunity || o}</strong>
              {o.leverage && <span className={`brief-v3-pill brief-v3-pill-${leverageTone(o.leverage)}`}>{o.leverage} leverage</span>}
            </div>
          )}
        />
        <StateColumn title="Unknowns" items={c.unknowns} tone="slate" />
      </div>
    </div>
  )
}
function StateColumn({ title, items, tone, renderItem }) {
  const list = Array.isArray(items) ? items : []
  if (!list.length) return null
  return (
    <div className={`brief-v3-state-col brief-v3-tone-${tone}`}>
      <div className="brief-v3-state-col-head">{title}</div>
      <ul>
        {list.map((it, i) => (
          <li key={i}>
            {renderItem ? renderItem(it) : (typeof it === 'string' ? it : (it.text || JSON.stringify(it)))}
          </li>
        ))}
      </ul>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────
// 4. PriorityMatrixRenderer — Business Intelligence
//    Top: goals table with KPIs.
//    Middle: 3×3 Effort × Impact matrix with initiative chips placed in cells.
//    Bottom: constraints / opportunities / risks columns.
// ────────────────────────────────────────────────────────────────────
function PriorityMatrixRenderer({ content }) {
  const c = content || {}
  return (
    <div className="brief-v3-biz">
      {Array.isArray(c.goals) && c.goals.length > 0 && (
        <div className="brief-v3-biz-goals">
          <div className="brief-v3-biz-block-label">Business goals</div>
          <table className="brief-v3-table">
            <thead>
              <tr><th>Category</th><th>Goal</th><th>KPI</th></tr>
            </thead>
            <tbody>
              {c.goals.map((g, i) => (
                <tr key={i}>
                  <td><span className="brief-v3-pill brief-v3-pill-slate">{g.category}</span></td>
                  <td>{g.goal}</td>
                  <td><span className="brief-v3-mono">{g.kpi}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {Array.isArray(c.matrix) && c.matrix.length > 0 && (
        <div className="brief-v3-biz-matrix">
          <div className="brief-v3-biz-block-label">Effort × Impact</div>
          <Matrix3x3 items={c.matrix} />
        </div>
      )}

      <div className="brief-v3-biz-cols">
        <BizColumn title="Constraints"   items={c.constraints}   labelKey="constraint"  badgeKey="type"      tone="amber" />
        <BizColumn title="Opportunities" items={c.opportunities} labelKey="opportunity" badgeKey="category"  tone="emerald" />
        <BizColumn title="Risks"         items={c.risks}         labelKey="risk"        badgeKey="likelihood" tone="red"
          extraBadgeKey="impact" extraBadgeLabel="impact" />
      </div>
    </div>
  )
}
function BizColumn({ title, items, labelKey, badgeKey, tone, extraBadgeKey, extraBadgeLabel }) {
  const list = Array.isArray(items) ? items : []
  if (!list.length) return null
  return (
    <div className={`brief-v3-biz-col brief-v3-tone-${tone}`}>
      <div className="brief-v3-biz-col-head">{title}</div>
      <ul>
        {list.map((it, i) => (
          <li key={i}>
            <span>{it[labelKey]}</span>
            <span className="brief-v3-biz-col-badges">
              {it[badgeKey] && <span className="brief-v3-pill brief-v3-pill-slate">{it[badgeKey]}</span>}
              {extraBadgeKey && it[extraBadgeKey] && (
                <span className="brief-v3-pill brief-v3-pill-amber">{extraBadgeLabel}: {it[extraBadgeKey]}</span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
function Matrix3x3({ items }) {
  // Rows = Impact (High top → Low bottom). Columns = Effort (Low left → High right).
  const levels = ['Low', 'Medium', 'High']
  const cell = (effort, impact) =>
    items.filter(it => norm(it.effort) === effort && norm(it.impact) === impact)
  return (
    <div className="brief-v3-matrix" role="table">
      <div className="brief-v3-matrix-row brief-v3-matrix-axis-head">
        <span className="brief-v3-matrix-corner" />
        <span>Low effort</span>
        <span>Medium</span>
        <span>High effort</span>
      </div>
      {['High', 'Medium', 'Low'].map(impact => (
        <div key={impact} className="brief-v3-matrix-row">
          <span className="brief-v3-matrix-axis-side">{impact} impact</span>
          {levels.map(effort => {
            const cellItems = cell(effort, impact)
            const quad = quadrantLabel(effort, impact)
            return (
              <div key={effort} className={`brief-v3-matrix-cell brief-v3-matrix-cell-${quad}`}>
                <div className="brief-v3-matrix-cell-tag">{quad}</div>
                {cellItems.length === 0 ? (
                  <div className="brief-v3-matrix-cell-empty">-</div>
                ) : cellItems.map((it, i) => (
                  <div key={i} className="brief-v3-matrix-chip" title={it.reasoning || ''}>
                    {it.initiative}
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}
function norm(v) {
  const s = String(v || '').trim().toLowerCase()
  if (s.startsWith('h')) return 'High'
  if (s.startsWith('m')) return 'Medium'
  if (s.startsWith('l')) return 'Low'
  return 'Medium'
}
function quadrantLabel(effort, impact) {
  if (impact === 'High' && effort === 'Low')    return 'quickwin'
  if (impact === 'High' && effort === 'High')   return 'bigbet'
  if (impact === 'Low'  && effort === 'Low')    return 'fillin'
  if (impact === 'Low'  && effort === 'High')   return 'avoid'
  return 'consider'
}

// ────────────────────────────────────────────────────────────────────
// 5. PersonasRenderer — User Intelligence
//    Persona cards in a responsive grid; primary on top, secondary
//    below. Each card has a tagline pull-quote + needs / motivations /
//    frustrations / mental models columns + an "at a glance" strip
//    with digital literacy, device, context, accessibility.
//    Below: a shared-context band that applies to everyone.
// ────────────────────────────────────────────────────────────────────
function PersonasRenderer({ content }) {
  const c = content || {}
  const primary   = Array.isArray(c.primary) ? c.primary : []
  const secondary = Array.isArray(c.secondary) ? c.secondary : []
  const ctx       = c.shared_context || null
  return (
    <div className="brief-v3-personas">
      {primary.length > 0 && (
        <>
          <div className="brief-v3-personas-tier-label">Primary personas</div>
          <div className="brief-v3-personas-grid">
            {primary.map((p, i) => <PersonaCard key={i} persona={p} tier="primary" />)}
          </div>
        </>
      )}
      {secondary.length > 0 && (
        <>
          <div className="brief-v3-personas-tier-label">Secondary personas</div>
          <div className="brief-v3-personas-grid">
            {secondary.map((p, i) => <PersonaCard key={i} persona={p} tier="secondary" />)}
          </div>
        </>
      )}
      {ctx && (
        <div className="brief-v3-personas-context">
          <div className="brief-v3-personas-context-label">Shared context</div>
          <div className="brief-v3-personas-context-row">
            {ctx.time_pressure   && <SharedFact label="Time pressure"   value={ctx.time_pressure} />}
            {ctx.connectivity    && <SharedFact label="Connectivity"    value={ctx.connectivity} />}
            {ctx.emotional_state && <SharedFact label="Emotional state" value={ctx.emotional_state} />}
            {ctx.trust_baseline  && <SharedFact label="Trust baseline"  value={ctx.trust_baseline} />}
          </div>
        </div>
      )}
    </div>
  )
}
function SharedFact({ label, value }) {
  return (
    <div className="brief-v3-personas-context-fact">
      <span className="brief-v3-personas-context-fact-label">{label}</span>
      <span className="brief-v3-personas-context-fact-value">{value}</span>
    </div>
  )
}
function PersonaCard({ persona: p, tier }) {
  const initials = (p.name || 'P').split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase()
  return (
    <article className={`brief-v3-persona brief-v3-persona-${tier}`}>
      <header className="brief-v3-persona-head">
        <div className="brief-v3-persona-avatar">{initials}</div>
        <div className="brief-v3-persona-id">
          <div className="brief-v3-persona-name">{p.name || 'Persona'}</div>
          {p.role && <div className="brief-v3-persona-role">{p.role}</div>}
        </div>
      </header>
      {p.tagline && <blockquote className="brief-v3-persona-tagline">"{p.tagline}"</blockquote>}
      {p.mindset && (
        <div className="brief-v3-persona-mindset">
          <span className="brief-v3-persona-mindset-label">Mindset</span>
          <p>{p.mindset}</p>
        </div>
      )}
      <div className="brief-v3-persona-cols">
        <PersonaList title="Motivations" items={p.motivations} tone="emerald" />
        <PersonaList title="Needs"       items={p.needs}       tone="indigo" />
        <PersonaList title="Frustrations"items={p.frustrations}tone="red" />
        <PersonaList title="Mental models" items={p.mental_models} tone="slate" />
        <PersonaList title="Goals"       items={p.goals}       tone="emerald" />
        <PersonaList title="Barriers"    items={p.barriers}    tone="amber" />
      </div>
      <div className="brief-v3-persona-glance">
        {p.digital_literacy && <GlanceChip label="Digital literacy" value={p.digital_literacy} />}
        {p.device_usage     && <GlanceChip label="Devices"          value={p.device_usage} />}
        {p.context_of_use   && <GlanceChip label="Context"          value={p.context_of_use} />}
        {p.accessibility    && <GlanceChip label="Accessibility"    value={p.accessibility} />}
        {p.environment      && <GlanceChip label="Environment"      value={p.environment} />}
      </div>
      {p.expected_outcome && (
        <div className="brief-v3-persona-outcome">
          <span className="brief-v3-persona-outcome-label">Expected outcome</span>
          <span>{p.expected_outcome}</span>
        </div>
      )}
    </article>
  )
}
function PersonaList({ title, items, tone }) {
  const list = Array.isArray(items) ? items : []
  if (!list.length) return null
  return (
    <div className={`brief-v3-persona-list brief-v3-tone-${tone}`}>
      <div className="brief-v3-persona-list-head">{title}</div>
      <ul>
        {list.map((it, i) => <li key={i}>{typeof it === 'string' ? it : (it.text || JSON.stringify(it))}</li>)}
      </ul>
    </div>
  )
}
function GlanceChip({ label, value }) {
  return (
    <div className="brief-v3-persona-glance-chip">
      <span className="brief-v3-persona-glance-label">{label}</span>
      <span className="brief-v3-persona-glance-value">{value}</span>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────
// 6. JtbdCanvasRenderer — Jobs To Be Done
//    Three vertical columns (Functional / Emotional / Social) of
//    job cards. Each card shows the full job statement + context +
//    current solution + success signal. Below the canvas: a 3-row
//    block for desired outcomes, current alternatives, opportunity
//    areas — each as a structured row.
// ────────────────────────────────────────────────────────────────────
function JtbdCanvasRenderer({ content }) {
  const c = content || {}
  const cols = [
    { id: 'functional', title: 'Functional jobs', jobs: c.functional, tone: 'indigo', desc: 'Rational tasks the user is trying to accomplish' },
    { id: 'emotional',  title: 'Emotional jobs',  jobs: c.emotional,  tone: 'amber',  desc: 'Feelings the user is chasing or avoiding' },
    { id: 'social',     title: 'Social jobs',     jobs: c.social,     tone: 'emerald',desc: 'How they want to be perceived by others' },
  ]
  return (
    <div className="brief-v3-jtbd">
      <div className="brief-v3-jtbd-canvas">
        {cols.map(col => (
          <div key={col.id} className={`brief-v3-jtbd-col brief-v3-tone-${col.tone}`}>
            <div className="brief-v3-jtbd-col-head">
              <span className="brief-v3-jtbd-col-title">{col.title}</span>
              <span className="brief-v3-jtbd-col-desc">{col.desc}</span>
            </div>
            <div className="brief-v3-jtbd-jobs">
              {(Array.isArray(col.jobs) ? col.jobs : []).map((j, i) => (
                <div key={i} className="brief-v3-jtbd-job">
                  <p className="brief-v3-jtbd-job-statement">"{j.job}"</p>
                  <dl className="brief-v3-jtbd-job-meta">
                    {j.context          && (<><dt>When</dt><dd>{j.context}</dd></>)}
                    {j.current_solution && (<><dt>Today</dt><dd>{j.current_solution}</dd></>)}
                    {j.success_signal   && (<><dt>Done when</dt><dd>{j.success_signal}</dd></>)}
                  </dl>
                </div>
              ))}
              {(!Array.isArray(col.jobs) || col.jobs.length === 0) && (
                <div className="brief-v3-jtbd-empty">No {col.title.toLowerCase()} identified.</div>
              )}
            </div>
          </div>
        ))}
      </div>
      {Array.isArray(c.outcomes) && c.outcomes.length > 0 && (
        <div className="brief-v3-jtbd-block">
          <div className="brief-v3-biz-block-label">Desired outcomes</div>
          <table className="brief-v3-table">
            <thead>
              <tr><th>Outcome</th><th>Metric</th><th>Priority</th></tr>
            </thead>
            <tbody>
              {c.outcomes.map((o, i) => (
                <tr key={i}>
                  <td>{o.outcome}</td>
                  <td><span className="brief-v3-mono">{o.metric}</span></td>
                  <td><span className={`brief-v3-pill brief-v3-pill-${priorityTone(o.priority)}`}>{o.priority}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {Array.isArray(c.alternatives) && c.alternatives.length > 0 && (
        <div className="brief-v3-jtbd-block">
          <div className="brief-v3-biz-block-label">Current alternatives</div>
          <div className="brief-v3-jtbd-alts">
            {c.alternatives.map((a, i) => (
              <div key={i} className="brief-v3-jtbd-alt">
                <div className="brief-v3-jtbd-alt-name">{a.alternative}</div>
                <div className="brief-v3-jtbd-alt-row">
                  <div className="brief-v3-jtbd-alt-half brief-v3-tone-emerald">
                    <span className="brief-v3-jtbd-alt-tag">Works</span>
                    <span>{a.what_works}</span>
                  </div>
                  <div className="brief-v3-jtbd-alt-half brief-v3-tone-red">
                    <span className="brief-v3-jtbd-alt-tag">Fails</span>
                    <span>{a.what_fails}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {Array.isArray(c.opportunity_areas) && c.opportunity_areas.length > 0 && (
        <div className="brief-v3-jtbd-block">
          <div className="brief-v3-biz-block-label">Opportunity areas</div>
          <ul className="brief-v3-opp-list">
            {c.opportunity_areas.map((o, i) => (
              <li key={i}>
                <span className="brief-v3-opp-name">{o.area}</span>
                <span className={`brief-v3-pill brief-v3-pill-${leverageTone(o.leverage)}`}>{o.leverage} leverage</span>
                {o.reasoning && <span className="brief-v3-opp-reason">{o.reasoning}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────
// 7. JourneyMapRenderer — User Journey
//    A horizontal stage swimlane with an SVG emotion curve drawn
//    across the top, then per-stage cards underneath. Each stage
//    card has goal / actions / touchpoints / pain / opportunities /
//    delight / friction.
// ────────────────────────────────────────────────────────────────────
function JourneyMapRenderer({ content }) {
  const c = content || {}
  const stages = Array.isArray(c.stages) ? c.stages : []
  if (!stages.length) return <div className="brief-v3-empty">No stages yet.</div>
  return (
    <div className="brief-v3-journey">
      {c.persona_ref && (
        <div className="brief-v3-journey-persona">
          <span className="brief-v3-journey-persona-label">Persona</span>
          <span>{c.persona_ref}</span>
        </div>
      )}
      <EmotionCurve stages={stages} />
      <div className="brief-v3-journey-stages" style={{ gridTemplateColumns: `repeat(${stages.length}, minmax(220px, 1fr))` }}>
        {stages.map((s, i) => (
          <div key={i} className="brief-v3-journey-stage">
            <div className="brief-v3-journey-stage-head">
              <span className="brief-v3-journey-stage-num">{String(i + 1).padStart(2, '0')}</span>
              <span className="brief-v3-journey-stage-name">{s.stage}</span>
            </div>
            {s.goal && (
              <div className="brief-v3-journey-stage-goal">
                <span className="brief-v3-journey-stage-tag">Goal</span>
                <span>{s.goal}</span>
              </div>
            )}
            {s.emotion && (
              <div className={`brief-v3-journey-emotion brief-v3-emotion-${emotionTone(s.emotion.score)}`}>
                <span className="brief-v3-journey-emotion-label">{s.emotion.label}</span>
                <span className="brief-v3-journey-emotion-score">{s.emotion.score}/5</span>
              </div>
            )}
            <JourneyList title="Actions"      items={s.actions} />
            <JourneyList title="Touchpoints"  items={s.touchpoints} />
            {s.thoughts && (
              <div className="brief-v3-journey-thoughts">
                <span className="brief-v3-journey-stage-tag">Thinking</span>
                <p>{s.thoughts}</p>
              </div>
            )}
            <JourneyList title="Pain"         items={s.pain_points}        tone="red" />
            <JourneyList title="Opportunity"  items={s.opportunities}      tone="emerald" />
            <JourneyList title="Delight"      items={s.moments_of_delight} tone="indigo" />
            <JourneyList title="Friction"     items={s.moments_of_friction}tone="amber" />
          </div>
        ))}
      </div>
    </div>
  )
}
function JourneyList({ title, items, tone }) {
  const list = Array.isArray(items) ? items : []
  if (!list.length) return null
  return (
    <div className={`brief-v3-journey-list ${tone ? 'brief-v3-tone-' + tone : ''}`}>
      <div className="brief-v3-journey-list-head">{title}</div>
      <ul>
        {list.map((it, i) => <li key={i}>{typeof it === 'string' ? it : (it.text || JSON.stringify(it))}</li>)}
      </ul>
    </div>
  )
}
// Draws the emotion curve as an SVG line across the stages. Pure
// SVG, no library. The Y axis spans 1-5; X axis maps evenly across
// stage count.
function EmotionCurve({ stages }) {
  if (!stages.length) return null
  const W = Math.max(stages.length * 120, 480)
  const H = 110
  const pad = { top: 16, right: 24, bottom: 24, left: 32 }
  const innerW = W - pad.left - pad.right
  const innerH = H - pad.top - pad.bottom
  const xs = stages.map((_, i) => pad.left + (innerW * (stages.length === 1 ? 0.5 : i / (stages.length - 1))))
  const ys = stages.map(s => {
    const v = Math.max(1, Math.min(5, Number(s.emotion?.score) || 3))
    return pad.top + innerH - ((v - 1) / 4) * innerH
  })
  // Smooth path using a simple bezier between points
  const d = xs.map((x, i) => {
    if (i === 0) return `M ${x} ${ys[i]}`
    const px = xs[i - 1], py = ys[i - 1]
    const cx = (px + x) / 2
    return `C ${cx} ${py}, ${cx} ${ys[i]}, ${x} ${ys[i]}`
  }).join(' ')
  return (
    <div className="brief-v3-journey-curve-wrap" style={{ overflowX: 'auto' }}>
      <svg width={W} height={H} className="brief-v3-journey-curve" role="img" aria-label="Emotion curve across journey stages">
        {[1, 2, 3, 4, 5].map(v => {
          const y = pad.top + innerH - ((v - 1) / 4) * innerH
          return (
            <g key={v}>
              <line x1={pad.left} y1={y} x2={W - pad.right} y2={y} stroke="var(--v3-line-soft)" strokeDasharray="3 3" />
              <text x={pad.left - 8} y={y + 3} textAnchor="end" fontSize="9" fontFamily="JetBrains Mono, monospace" fill="var(--v3-ink-muted)">{v}</text>
            </g>
          )
        })}
        <path d={d} fill="none" stroke="var(--v3-accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        {xs.map((x, i) => (
          <g key={i}>
            <circle cx={x} cy={ys[i]} r="4" fill="var(--v3-bg)" stroke="var(--v3-accent)" strokeWidth="2" />
            <text x={x} y={H - 6} textAnchor="middle" fontSize="10" fontFamily="Inter, sans-serif" fontWeight="600" fill="var(--v3-ink-soft)">{stages[i].stage}</text>
          </g>
        ))}
      </svg>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────
// 8. FlowChartRenderer — User Flows
//    Happy path as a vertical timeline of step cards. Alternatives
//    rendered as branching cards next to their fork point. Errors,
//    edge cases, decision points each get their own block below.
// ────────────────────────────────────────────────────────────────────
function FlowChartRenderer({ content }) {
  const c = content || {}
  const happy = Array.isArray(c.happy_path) ? c.happy_path : []
  const alts  = Array.isArray(c.alternatives) ? c.alternatives : []
  return (
    <div className="brief-v3-flow">
      {c.primary_outcome && (
        <div className="brief-v3-flow-outcome">
          <span className="brief-v3-flow-outcome-label">Primary outcome</span>
          <p>{c.primary_outcome}</p>
        </div>
      )}
      {happy.length > 0 && (
        <div className="brief-v3-flow-block">
          <div className="brief-v3-flow-block-label">Happy path</div>
          <ol className="brief-v3-flow-path">
            {happy.map((step, i) => {
              const branches = alts.filter(a => Number(a.fork_at) === Number(step.step))
              return (
                <li key={i} className="brief-v3-flow-step">
                  <div className="brief-v3-flow-step-marker">
                    <span className="brief-v3-flow-step-num">{step.step ?? i + 1}</span>
                  </div>
                  <div className="brief-v3-flow-step-card">
                    <div className="brief-v3-flow-step-node">{step.node}</div>
                    {step.action && <div className="brief-v3-flow-step-row"><span className="brief-v3-flow-step-tag">User</span><span>{step.action}</span></div>}
                    {step.system && <div className="brief-v3-flow-step-row"><span className="brief-v3-flow-step-tag brief-v3-flow-step-tag-system">System</span><span>{step.system}</span></div>}
                  </div>
                  {branches.length > 0 && (
                    <div className="brief-v3-flow-branches">
                      {branches.map((b, bi) => (
                        <div key={bi} className="brief-v3-flow-branch">
                          <div className="brief-v3-flow-branch-head">
                            <span className="brief-v3-pill brief-v3-pill-indigo">Branch</span>
                            <span>{b.name}</span>
                            {b.rejoins_at && <span className="brief-v3-flow-branch-rejoin">rejoins at step {b.rejoins_at}</span>}
                          </div>
                          <ol className="brief-v3-flow-branch-steps">
                            {(Array.isArray(b.steps) ? b.steps : []).map((bs, bsi) => (
                              <li key={bsi}>
                                <strong>{bs.node}</strong>
                                {bs.action && <span> — {bs.action}</span>}
                              </li>
                            ))}
                          </ol>
                        </div>
                      ))}
                    </div>
                  )}
                </li>
              )
            })}
          </ol>
        </div>
      )}
      {Array.isArray(c.error_paths) && c.error_paths.length > 0 && (
        <div className="brief-v3-flow-block">
          <div className="brief-v3-flow-block-label brief-v3-tone-red">Error paths</div>
          <div className="brief-v3-flow-errors">
            {c.error_paths.map((e, i) => (
              <div key={i} className="brief-v3-flow-error">
                <div className="brief-v3-flow-error-name">{e.name}</div>
                <dl>
                  {e.trigger    && (<><dt>Trigger</dt><dd>{e.trigger}</dd></>)}
                  {e.recovery   && (<><dt>Recovery</dt><dd>{e.recovery}</dd></>)}
                  {e.prevention && (<><dt>Prevent</dt><dd>{e.prevention}</dd></>)}
                </dl>
              </div>
            ))}
          </div>
        </div>
      )}
      {Array.isArray(c.decision_points) && c.decision_points.length > 0 && (
        <div className="brief-v3-flow-block">
          <div className="brief-v3-flow-block-label">Decision points</div>
          <div className="brief-v3-flow-decisions">
            {c.decision_points.map((d, i) => (
              <div key={i} className="brief-v3-flow-decision">
                <div className="brief-v3-flow-decision-q">{d.decision}</div>
                <div className="brief-v3-flow-decision-opts">
                  {(Array.isArray(d.options) ? d.options : []).map((opt, oi) => (
                    <span key={oi} className="brief-v3-flow-decision-opt">{opt}</span>
                  ))}
                </div>
                {d.stakes  && <div className="brief-v3-flow-decision-line"><span>Stakes</span><span>{d.stakes}</span></div>}
                {d.default && <div className="brief-v3-flow-decision-line"><span>Default</span><span>{d.default}</span></div>}
              </div>
            ))}
          </div>
        </div>
      )}
      {Array.isArray(c.edge_cases) && c.edge_cases.length > 0 && (
        <div className="brief-v3-flow-block">
          <div className="brief-v3-flow-block-label">Edge cases</div>
          <ul className="brief-v3-flow-edges">
            {c.edge_cases.map((e, i) => (
              <li key={i}>
                <strong>{e.case}</strong>
                {e.implication && <span> — {e.implication}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────
// 9. TreeRenderer — Information Architecture
//    Site map rendered as an indented tree with connector lines.
//    Below: navigation lists (primary / secondary / utility) +
//    groupings + cross-cutting relationships + taxonomy.
// ────────────────────────────────────────────────────────────────────
function TreeRenderer({ content }) {
  const c = content || {}
  return (
    <div className="brief-v3-ia">
      {c.site_map && (
        <div className="brief-v3-ia-block">
          <div className="brief-v3-biz-block-label">Site map</div>
          <div className="brief-v3-tree">
            <TreeNode node={c.site_map} depth={0} isLast={true} />
          </div>
          {c.depth_warning && (
            <div className="brief-v3-ia-warning">⚠ {c.depth_warning}</div>
          )}
        </div>
      )}
      {c.navigation && (
        <div className="brief-v3-ia-block">
          <div className="brief-v3-biz-block-label">Navigation</div>
          <div className="brief-v3-ia-nav-grid">
            <NavList title="Primary"   items={c.navigation.primary}   tone="accent" />
            <NavList title="Secondary" items={c.navigation.secondary} tone="slate" />
            <NavList title="Utility"   items={c.navigation.utility}   tone="slate" />
          </div>
        </div>
      )}
      {Array.isArray(c.groupings) && c.groupings.length > 0 && (
        <div className="brief-v3-ia-block">
          <div className="brief-v3-biz-block-label">Content groupings</div>
          <div className="brief-v3-ia-groupings">
            {c.groupings.map((g, i) => (
              <div key={i} className="brief-v3-ia-grouping">
                <div className="brief-v3-ia-grouping-name">{g.group}</div>
                <div className="brief-v3-ia-grouping-members">
                  {(g.members || []).map((m, mi) => (
                    <span key={mi} className="brief-v3-pill brief-v3-pill-slate">{m}</span>
                  ))}
                </div>
                {g.rationale && <div className="brief-v3-ia-grouping-rationale">{g.rationale}</div>}
              </div>
            ))}
          </div>
        </div>
      )}
      {Array.isArray(c.relationships) && c.relationships.length > 0 && (
        <div className="brief-v3-ia-block">
          <div className="brief-v3-biz-block-label">Cross-cutting relationships</div>
          <table className="brief-v3-table">
            <thead><tr><th>From</th><th></th><th>To</th><th>Type</th><th>Purpose</th></tr></thead>
            <tbody>
              {c.relationships.map((r, i) => (
                <tr key={i}>
                  <td><strong>{r.from}</strong></td>
                  <td><span className="brief-v3-ia-arrow">→</span></td>
                  <td><strong>{r.to}</strong></td>
                  <td><span className="brief-v3-pill brief-v3-pill-indigo">{r.type}</span></td>
                  <td>{r.purpose}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {Array.isArray(c.taxonomy) && c.taxonomy.length > 0 && (
        <div className="brief-v3-ia-block">
          <div className="brief-v3-biz-block-label">Taxonomy (consistent terms)</div>
          <dl className="brief-v3-ia-taxonomy">
            {c.taxonomy.map((t, i) => (
              <div key={i} className="brief-v3-ia-tax-row">
                <dt>{t.term}</dt>
                <dd>
                  {t.definition}
                  {Array.isArray(t.synonyms) && t.synonyms.length > 0 && (
                    <div className="brief-v3-ia-tax-syn">
                      <span>also:</span>
                      {t.synonyms.map((s, si) => <span key={si} className="brief-v3-mono">{s}</span>)}
                    </div>
                  )}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </div>
  )
}
function TreeNode({ node, depth, isLast }) {
  if (!node) return null
  const children = Array.isArray(node.children) ? node.children : []
  return (
    <div className="brief-v3-tree-node">
      <div className="brief-v3-tree-row" style={{ paddingLeft: depth * 20 }}>
        {depth > 0 && <span className="brief-v3-tree-bullet" aria-hidden>{isLast ? '└' : '├'}</span>}
        <span className={`brief-v3-tree-type brief-v3-tree-type-${node.type || 'page'}`}>{node.type || 'page'}</span>
        <span className="brief-v3-tree-name">{node.name}</span>
        {node.purpose && <span className="brief-v3-tree-purpose">{node.purpose}</span>}
      </div>
      {children.map((child, i) => (
        <TreeNode key={i} node={child} depth={depth + 1} isLast={i === children.length - 1} />
      ))}
    </div>
  )
}
function NavList({ title, items, tone }) {
  const list = Array.isArray(items) ? items : []
  if (!list.length) return null
  return (
    <div className={`brief-v3-ia-nav brief-v3-tone-${tone === 'accent' ? 'amber' : tone}`}>
      <div className="brief-v3-ia-nav-head">{title}</div>
      <ul>
        {list.map((n, i) => (
          <li key={i}>
            <span className="brief-v3-ia-nav-label">{n.label}</span>
            <span className="brief-v3-ia-nav-dest">{n.destination}</span>
            {n.rationale && <span className="brief-v3-ia-nav-rationale">{n.rationale}</span>}
          </li>
        ))}
      </ul>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────
// 10. RequirementsRenderer — Functional Requirements
//    Core / Supporting / Future feature cards. Each card expands to
//    show inputs, outputs, business rules, validation, permissions,
//    and a states grid (empty / loading / error / success / offline).
// ────────────────────────────────────────────────────────────────────
function RequirementsRenderer({ content }) {
  const c = content || {}
  return (
    <div className="brief-v3-reqs">
      <FeatureGroup title="Core features"        items={c.core}       tone="accent" />
      <FeatureGroup title="Supporting features"  items={c.supporting} tone="slate" />
      <FutureGroup  title="Future features"      items={c.future} />
      {Array.isArray(c.dependencies) && c.dependencies.length > 0 && (
        <div className="brief-v3-reqs-block">
          <div className="brief-v3-biz-block-label">Dependencies</div>
          <table className="brief-v3-table">
            <thead><tr><th>This needs</th><th>To enable</th><th>Type</th></tr></thead>
            <tbody>
              {c.dependencies.map((d, i) => (
                <tr key={i}>
                  <td><strong>{d.depends_on}</strong></td>
                  <td>{d.needed_for}</td>
                  <td><span className={`brief-v3-pill brief-v3-pill-${d.type === 'Hard' ? 'red' : 'amber'}`}>{d.type}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
function FeatureGroup({ title, items, tone }) {
  const list = Array.isArray(items) ? items : []
  if (!list.length) return null
  return (
    <div className="brief-v3-reqs-block">
      <div className="brief-v3-biz-block-label">{title}</div>
      <div className="brief-v3-reqs-list">
        {list.map((f, i) => <FeatureCard key={i} feature={f} tone={tone} />)}
      </div>
    </div>
  )
}
function FeatureCard({ feature: f, tone }) {
  const [open, setOpen] = useState(false)
  const subBlocks = [
    ['Inputs',         f.inputs],
    ['Outputs',        f.outputs],
    ['Business rules', f.business_rules],
    ['Validation',     f.validation],
    ['Permissions',    f.permissions],
    ['Edge cases',     f.edge_cases],
  ].filter(([, v]) => Array.isArray(v) && v.length > 0)
  return (
    <div className={`brief-v3-feature brief-v3-feature-${tone === 'accent' ? 'accent' : 'slate'}`}>
      <button type="button" className="brief-v3-feature-head" onClick={() => setOpen(o => !o)} aria-expanded={open}>
        <div className="brief-v3-feature-head-text">
          <div className="brief-v3-feature-name">{f.feature}</div>
          {f.description && <div className="brief-v3-feature-desc">{f.description}</div>}
        </div>
        <span className="brief-v3-feature-toggle">{open ? '−' : '+'}</span>
      </button>
      {open && (
        <div className="brief-v3-feature-body">
          {subBlocks.length > 0 && (
            <div className="brief-v3-feature-blocks">
              {subBlocks.map(([label, items]) => (
                <div key={label} className="brief-v3-feature-block">
                  <div className="brief-v3-feature-block-label">{label}</div>
                  <ul>
                    {items.map((it, i) => <li key={i}>{it}</li>)}
                  </ul>
                </div>
              ))}
            </div>
          )}
          {f.states && (
            <div className="brief-v3-feature-states">
              <div className="brief-v3-feature-block-label">States</div>
              <div className="brief-v3-feature-states-grid">
                {['empty', 'loading', 'error', 'success', 'offline'].map(s => f.states[s] && (
                  <div key={s} className={`brief-v3-state-pill brief-v3-state-pill-${s}`}>
                    <span className="brief-v3-state-pill-label">{s}</span>
                    <span className="brief-v3-state-pill-body">{f.states[s]}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
function FutureGroup({ title, items }) {
  const list = Array.isArray(items) ? items : []
  if (!list.length) return null
  return (
    <div className="brief-v3-reqs-block">
      <div className="brief-v3-biz-block-label">{title}</div>
      <ul className="brief-v3-future-list">
        {list.map((f, i) => (
          <li key={i}>
            <div className="brief-v3-future-head">
              <strong>{f.feature}</strong>
              <span className="brief-v3-pill brief-v3-pill-slate">Future</span>
            </div>
            {f.description && <div className="brief-v3-future-desc">{f.description}</div>}
            {f.rationale && <div className="brief-v3-future-rationale">{f.rationale}</div>}
          </li>
        ))}
      </ul>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────
// 11. NfrGridRenderer — Non-Functional Requirements
//    Tabular grid with category / target / standard / rationale / priority.
//    Category pills colour-coded for quick scan.
// ────────────────────────────────────────────────────────────────────
function NfrGridRenderer({ content }) {
  const list = Array.isArray(content?.requirements) ? content.requirements : []
  if (!list.length) return <div className="brief-v3-empty">No non-functional requirements yet.</div>
  return (
    <div className="brief-v3-nfr">
      <table className="brief-v3-table brief-v3-nfr-table">
        <thead>
          <tr><th>Category</th><th>Target</th><th>Standard</th><th>Why</th><th>Priority</th></tr>
        </thead>
        <tbody>
          {list.map((r, i) => (
            <tr key={i}>
              <td><span className={`brief-v3-nfr-cat brief-v3-nfr-cat-${nfrCategoryTone(r.category)}`}>{r.category}</span></td>
              <td><strong>{r.target}</strong></td>
              <td><span className="brief-v3-mono">{r.standard}</span></td>
              <td>{r.rationale}</td>
              <td><span className={`brief-v3-pill brief-v3-pill-${priorityTone(r.priority)}`}>{r.priority}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
function nfrCategoryTone(cat) {
  const c = String(cat || '').toLowerCase()
  if (c.includes('access'))   return 'indigo'
  if (c.includes('perf'))     return 'amber'
  if (c.includes('secur') || c.includes('priv') || c.includes('comp')) return 'red'
  if (c.includes('scal') || c.includes('respons')) return 'emerald'
  return 'slate'
}

// ────────────────────────────────────────────────────────────────────
// 12. ContentStrategyRenderer
//    Voice card (We are / We are not) + tone adapters table + content
//    types + microcopy patterns table for each surface.
// ────────────────────────────────────────────────────────────────────
function ContentStrategyRenderer({ content }) {
  const c = content || {}
  return (
    <div className="brief-v3-content">
      {c.voice && (
        <div className="brief-v3-voice">
          <div className="brief-v3-voice-personality">
            <span className="brief-v3-voice-label">Voice</span>
            <span className="brief-v3-voice-words">{c.voice.personality}</span>
          </div>
          <div className="brief-v3-voice-cols">
            <div className="brief-v3-voice-col brief-v3-tone-emerald">
              <div className="brief-v3-voice-col-head">We are</div>
              <ul>{(c.voice.we_are || []).map((v, i) => <li key={i}>{v}</li>)}</ul>
            </div>
            <div className="brief-v3-voice-col brief-v3-tone-red">
              <div className="brief-v3-voice-col-head">We are not</div>
              <ul>{(c.voice.we_are_not || []).map((v, i) => <li key={i}>{v}</li>)}</ul>
            </div>
          </div>
        </div>
      )}
      {Array.isArray(c.content_types) && c.content_types.length > 0 && (
        <div className="brief-v3-content-block">
          <div className="brief-v3-biz-block-label">Content types</div>
          <table className="brief-v3-table">
            <thead><tr><th>Type</th><th>Purpose</th><th>Tone</th></tr></thead>
            <tbody>
              {c.content_types.map((t, i) => (
                <tr key={i}><td><strong>{t.type}</strong></td><td>{t.purpose}</td><td><span className="brief-v3-pill brief-v3-pill-indigo">{t.tone}</span></td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {Array.isArray(c.hierarchy) && c.hierarchy.length > 0 && (
        <div className="brief-v3-content-block">
          <div className="brief-v3-biz-block-label">Hierarchy on a screen</div>
          <ol className="brief-v3-content-hier">
            {c.hierarchy.map((h, i) => (
              <li key={i}>
                <span className="brief-v3-content-hier-num">{h.level}</span>
                <div>
                  <strong>{h.label}</strong>
                  {h.intent && <div className="brief-v3-content-hier-intent">{h.intent}</div>}
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}
      {Array.isArray(c.tone_adapters) && c.tone_adapters.length > 0 && (
        <div className="brief-v3-content-block">
          <div className="brief-v3-biz-block-label">Tone adapters by context</div>
          <table className="brief-v3-table">
            <thead><tr><th>Context</th><th>Tone</th><th>Example</th></tr></thead>
            <tbody>
              {c.tone_adapters.map((t, i) => (
                <tr key={i}>
                  <td><strong>{t.context}</strong></td>
                  <td><span className="brief-v3-pill brief-v3-pill-slate">{t.tone}</span></td>
                  <td><em>"{t.example}"</em></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {c.microcopy && (
        <div className="brief-v3-content-block">
          <div className="brief-v3-biz-block-label">Microcopy patterns</div>
          <div className="brief-v3-microcopy">
            {['ctas', 'errors', 'empty_states', 'notifications', 'success'].map(k => {
              const list = Array.isArray(c.microcopy[k]) ? c.microcopy[k] : []
              if (!list.length) return null
              return (
                <div key={k} className="brief-v3-microcopy-group">
                  <div className="brief-v3-microcopy-label">{microcopyLabel(k)}</div>
                  {list.map((m, i) => (
                    <div key={i} className="brief-v3-microcopy-row">
                      <div className="brief-v3-microcopy-context">{m.context}</div>
                      <div className="brief-v3-microcopy-copy">"{m.copy}"</div>
                      {m.anti_pattern && <div className="brief-v3-microcopy-anti">NOT: "{m.anti_pattern}"</div>}
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
        </div>
      )}
      {c.information_density && (
        <div className="brief-v3-content-density">
          <span className="brief-v3-content-density-label">Information density</span>
          <span className="brief-v3-content-density-value">{c.information_density}</span>
          {c.density_rationale && <span className="brief-v3-content-density-rationale">{c.density_rationale}</span>}
        </div>
      )}
    </div>
  )
}
function microcopyLabel(k) {
  return ({ ctas: 'CTAs', errors: 'Errors', empty_states: 'Empty states', notifications: 'Notifications', success: 'Success' })[k] || k
}

// ────────────────────────────────────────────────────────────────────
// 13. CompetitiveRenderer
//    Competitor cards + common patterns / standards / differentiators
//    / anti-patterns / innovation opportunities each in their own block.
// ────────────────────────────────────────────────────────────────────
function CompetitiveRenderer({ content }) {
  const c = content || {}
  return (
    <div className="brief-v3-comp">
      {Array.isArray(c.competitors) && c.competitors.length > 0 && (
        <div className="brief-v3-comp-block">
          <div className="brief-v3-biz-block-label">Competitors</div>
          <div className="brief-v3-comp-grid">
            {c.competitors.map((co, i) => (
              <div key={i} className="brief-v3-comp-card">
                <div className="brief-v3-comp-card-head">
                  <div className="brief-v3-comp-card-name">{co.name}</div>
                  {co.url && <a href={co.url} target="_blank" rel="noreferrer" className="brief-v3-comp-card-url">{co.url.replace(/^https?:\/\//, '').replace(/\/$/, '')}</a>}
                </div>
                {co.positioning && <p className="brief-v3-comp-card-positioning">{co.positioning}</p>}
                {co.dominant_pattern && (
                  <div className="brief-v3-comp-card-row">
                    <span className="brief-v3-comp-card-tag">Pattern</span>
                    <span>{co.dominant_pattern}</span>
                  </div>
                )}
                <div className="brief-v3-comp-card-sw">
                  {co.strength && <div className="brief-v3-tone-emerald"><span className="brief-v3-comp-card-tag">+</span>{co.strength}</div>}
                  {co.weakness && <div className="brief-v3-tone-red"><span className="brief-v3-comp-card-tag">−</span>{co.weakness}</div>}
                </div>
                {co.lesson && (
                  <div className="brief-v3-comp-card-lesson">
                    <span className="brief-v3-comp-card-tag">Lesson</span>
                    <span>{co.lesson}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="brief-v3-comp-cols">
        <CompList title="Common patterns to follow" items={c.common_patterns}      tone="emerald" labelKey="pattern" extraKey="reasoning" boolKey="should_follow" />
        <CompList title="Industry standards"        items={c.industry_standards}   tone="indigo" labelKey="standard" extraKey="how_to_meet" />
        <CompList title="Differentiators"           items={c.differentiators}      tone="accent" labelKey="diff" extraKey="reasoning" badgeKey="leverage" badgeTone={leverageTone} />
        <CompList title="Anti-patterns to avoid"    items={c.anti_patterns}        tone="red" labelKey="pattern" extraKey="why_avoid" />
        <CompList title="Innovation opportunities"  items={c.innovation_opportunities} tone="amber" labelKey="opportunity" extraKey="reasoning" badgeKey="risk" badgeTone={(v) => v?.toLowerCase().startsWith('h') ? 'red' : v?.toLowerCase().startsWith('m') ? 'amber' : 'emerald'} />
      </div>
    </div>
  )
}
function CompList({ title, items, tone, labelKey, extraKey, badgeKey, badgeTone, boolKey }) {
  const list = Array.isArray(items) ? items : []
  if (!list.length) return null
  const toneClass = tone === 'accent' ? 'amber' : tone
  return (
    <div className={`brief-v3-comp-list brief-v3-tone-${toneClass}`}>
      <div className="brief-v3-comp-list-head">{title}</div>
      <ul>
        {list.map((it, i) => (
          <li key={i}>
            <div className="brief-v3-comp-list-line">
              <strong>{it[labelKey]}</strong>
              {badgeKey && it[badgeKey] && (
                <span className={`brief-v3-pill brief-v3-pill-${badgeTone ? badgeTone(it[badgeKey]) : 'slate'}`}>{it[badgeKey]}</span>
              )}
              {boolKey && it[boolKey] === false && (
                <span className="brief-v3-pill brief-v3-pill-red">Skip</span>
              )}
              {boolKey && it[boolKey] === true && (
                <span className="brief-v3-pill brief-v3-pill-emerald">Follow</span>
              )}
            </div>
            {it[extraKey] && <div className="brief-v3-comp-list-extra">{it[extraKey]}</div>}
          </li>
        ))}
      </ul>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────
// 14. PrinciplesRenderer
//    Each principle as a numbered card with full reasoning chain:
//    statement → why → means → prevents → example → tradeoffs +
//    confidence bar at the bottom right.
// ────────────────────────────────────────────────────────────────────
function PrinciplesRenderer({ content }) {
  const list = Array.isArray(content?.principles) ? content.principles : []
  if (!list.length) return <div className="brief-v3-empty">No principles yet.</div>
  return (
    <ol className="brief-v3-principles">
      {list.map((p, i) => (
        <li key={i} className="brief-v3-principle">
          <div className="brief-v3-principle-head">
            <span className="brief-v3-principle-num">{String(i + 1).padStart(2, '0')}</span>
            <div className="brief-v3-principle-id">
              <h3 className="brief-v3-principle-name">{p.name}</h3>
              <p className="brief-v3-principle-statement">{p.statement}</p>
            </div>
          </div>
          <dl className="brief-v3-principle-chain">
            {p.why_exists      && (<><dt>Why it exists</dt><dd>{p.why_exists}</dd></>)}
            {p.what_it_means   && (<><dt>What it means</dt><dd>{p.what_it_means}</dd></>)}
            {p.what_it_prevents&& (<><dt>What it prevents</dt><dd>{p.what_it_prevents}</dd></>)}
            {p.example         && (<><dt>Example</dt><dd>{p.example}</dd></>)}
            {p.tradeoffs       && (<><dt>Trade-offs</dt><dd>{p.tradeoffs}</dd></>)}
          </dl>
          {p.confidence && (
            <div className="brief-v3-principle-conf">
              <span className="brief-v3-principle-conf-label">Confidence</span>
              <span className={`brief-v3-pill brief-v3-pill-${confidenceTone(p.confidence)}`}>{p.confidence}</span>
            </div>
          )}
        </li>
      ))}
    </ol>
  )
}
function confidenceTone(c) {
  const v = String(c || '').toLowerCase()
  if (v === 'high')   return 'emerald'
  if (v === 'medium') return 'amber'
  return 'red'
}

// ────────────────────────────────────────────────────────────────────
// 15. VisualDirectionRenderer
//    Mood + personality header. Then a grid of trait cards (colour,
//    type, motion, etc.), each with its strategy text. References at
//    the bottom as a clickable card grid.
// ────────────────────────────────────────────────────────────────────
function VisualDirectionRenderer({ content }) {
  const c = content || {}
  const cards = [
    ['Colour strategy', c.color_strategy && [
      ['Approach',  c.color_strategy.approach],
      ['Primary',   c.color_strategy.primary],
      ['Accent',    c.color_strategy.accent],
      ['Tone',      c.color_strategy.tone],
      ['Rationale', c.color_strategy.rationale],
    ]],
    ['Typography',    c.typography_strategy && [
      ['Display',  c.typography_strategy.display],
      ['Body',     c.typography_strategy.body],
      ['Pairing',  c.typography_strategy.pairing_rationale],
    ]],
    ['Spacing',       c.spacing       && [['', c.spacing]]],
    ['Grid',          c.grid          && [['', c.grid]]],
    ['Iconography',   c.iconography   && [['', c.iconography]]],
    ['Illustration',  c.illustration  && [['', c.illustration]]],
    ['Photography',   c.photography   && [['', c.photography]]],
    ['Elevation',     c.elevation     && [['', c.elevation]]],
    ['Border radius', c.border_radius && [['', c.border_radius]]],
    ['Motion',        c.motion        && [['', c.motion]]],
    ['Component philosophy', c.component_philosophy && [['', c.component_philosophy]]],
    ['Dark mode',     c.dark_mode     && [['', c.dark_mode]]],
    ['Light mode',    c.light_mode    && [['', c.light_mode]]],
  ].filter(([, v]) => v)
  return (
    <div className="brief-v3-visual">
      <div className="brief-v3-visual-header">
        {c.mood && (
          <div>
            <span className="brief-v3-visual-header-label">Mood</span>
            <span className="brief-v3-visual-header-value">{c.mood}</span>
          </div>
        )}
        {c.personality && (
          <div>
            <span className="brief-v3-visual-header-label">Personality</span>
            <span className="brief-v3-visual-header-value">{c.personality}</span>
          </div>
        )}
      </div>
      <div className="brief-v3-visual-grid">
        {cards.map(([title, rows], i) => (
          <div key={i} className="brief-v3-visual-card">
            <div className="brief-v3-visual-card-title">{title}</div>
            <dl>
              {rows.map(([label, value], ri) => (
                <div key={ri} className="brief-v3-visual-card-row">
                  {label && <dt>{label}</dt>}
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
      {Array.isArray(c.accessibility_notes) && c.accessibility_notes.length > 0 && (
        <div className="brief-v3-visual-a11y">
          <div className="brief-v3-visual-a11y-label">Accessibility considerations</div>
          <ul>{c.accessibility_notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
        </div>
      )}
      {Array.isArray(c.references) && c.references.length > 0 && (
        <div className="brief-v3-visual-refs">
          <div className="brief-v3-biz-block-label">References</div>
          <div className="brief-v3-visual-refs-grid">
            {c.references.map((r, i) => (
              <div key={i} className="brief-v3-visual-ref">
                <div className="brief-v3-visual-ref-name">{r.name}</div>
                {r.url && <a href={r.url} target="_blank" rel="noreferrer" className="brief-v3-visual-ref-url">{r.url.replace(/^https?:\/\//, '').replace(/\/$/, '')}</a>}
                {r.what_to_borrow && <div className="brief-v3-visual-ref-borrow">Borrow: {r.what_to_borrow}</div>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────
// 16. ComponentInventoryRenderer
//    Categories of components with usage chips + variant tags.
//    Below: build order timeline (Foundation / Core / Polish).
// ────────────────────────────────────────────────────────────────────
function ComponentInventoryRenderer({ content }) {
  const c = content || {}
  const cats = Array.isArray(c.categories) ? c.categories : []
  const buildOrder = Array.isArray(c.build_order) ? c.build_order : []
  return (
    <div className="brief-v3-comps">
      <div className="brief-v3-comps-grid">
        {cats.map((cat, i) => (
          <div key={i} className="brief-v3-comps-cat">
            <div className="brief-v3-comps-cat-head">{cat.category}</div>
            <div className="brief-v3-comps-list">
              {(cat.components || []).map((comp, ci) => (
                <div key={ci} className="brief-v3-comps-item">
                  <div className="brief-v3-comps-item-head">
                    <span className="brief-v3-comps-item-name">{comp.name}</span>
                    <span className={`brief-v3-pill brief-v3-pill-${usageTone(comp.usage)}`}>{comp.usage}</span>
                  </div>
                  {Array.isArray(comp.variants) && comp.variants.length > 0 && (
                    <div className="brief-v3-comps-item-variants">
                      {comp.variants.map((v, vi) => <span key={vi} className="brief-v3-pill brief-v3-pill-slate">{v}</span>)}
                    </div>
                  )}
                  {comp.notes && <div className="brief-v3-comps-item-notes">{comp.notes}</div>}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      {buildOrder.length > 0 && (
        <div className="brief-v3-comps-order">
          <div className="brief-v3-biz-block-label">Build order</div>
          <div className="brief-v3-comps-order-grid">
            {buildOrder.map((phase, i) => (
              <div key={i} className="brief-v3-comps-phase">
                <div className="brief-v3-comps-phase-head">
                  <span className="brief-v3-comps-phase-num">{i + 1}</span>
                  <span className="brief-v3-comps-phase-name">{phase.phase}</span>
                </div>
                <div className="brief-v3-comps-phase-list">
                  {(phase.components || []).map((c, ci) => <span key={ci} className="brief-v3-pill brief-v3-pill-slate">{c}</span>)}
                </div>
                {phase.reasoning && <div className="brief-v3-comps-phase-reasoning">{phase.reasoning}</div>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
function usageTone(u) {
  const v = String(u || '').toLowerCase()
  if (v === 'heavy')    return 'red'
  if (v === 'moderate') return 'amber'
  return 'emerald'
}

// ────────────────────────────────────────────────────────────────────
// 17. UxWritingRenderer
//    Reading-level chip + voice/tone rules with Do/Don't pairs +
//    per-surface writing patterns + a "forbidden phrases" callout.
// ────────────────────────────────────────────────────────────────────
function UxWritingRenderer({ content }) {
  const c = content || {}
  const rl = c.reading_level || {}
  const surfaces = c.surfaces || {}
  return (
    <div className="brief-v3-uxw">
      {(rl.grade || rl.reason) && (
        <div className="brief-v3-uxw-reading">
          <div className="brief-v3-uxw-reading-num">{rl.grade}</div>
          <div className="brief-v3-uxw-reading-meta">
            {rl.reason && <p>{rl.reason}</p>}
            <div className="brief-v3-uxw-reading-spec">
              {rl.max_sentence_length  && <span><strong>Sentence:</strong> {rl.max_sentence_length}</span>}
              {rl.max_paragraph_length && <span><strong>Paragraph:</strong> {rl.max_paragraph_length}</span>}
            </div>
          </div>
        </div>
      )}
      {Array.isArray(c.voice_rules) && c.voice_rules.length > 0 && (
        <div className="brief-v3-uxw-block">
          <div className="brief-v3-biz-block-label">Voice rules</div>
          <div className="brief-v3-uxw-rules">
            {c.voice_rules.map((r, i) => <DoDontCard key={i} item={r} title={r.rule} subtitle={r.why} />)}
          </div>
        </div>
      )}
      {Array.isArray(c.tone_rules) && c.tone_rules.length > 0 && (
        <div className="brief-v3-uxw-block">
          <div className="brief-v3-biz-block-label">Tone by context</div>
          <table className="brief-v3-table">
            <thead><tr><th>Context</th><th>Tone</th><th>Example</th></tr></thead>
            <tbody>
              {c.tone_rules.map((t, i) => (
                <tr key={i}>
                  <td><strong>{t.context}</strong></td>
                  <td><span className="brief-v3-pill brief-v3-pill-indigo">{t.tone}</span></td>
                  <td><em>"{t.example}"</em></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="brief-v3-uxw-block">
        <div className="brief-v3-biz-block-label">Per-surface patterns</div>
        <div className="brief-v3-uxw-surfaces">
          {['error_messages', 'confirmations', 'instructions', 'onboarding', 'button_labels', 'empty_states', 'notifications'].map(k => {
            const list = Array.isArray(surfaces[k]) ? surfaces[k] : []
            if (!list.length) return null
            return (
              <div key={k} className="brief-v3-uxw-surface">
                <div className="brief-v3-uxw-surface-head">{uxwSurfaceLabel(k)}</div>
                {list.map((p, i) => <DoDontCard key={i} item={p} title={p.pattern} compact />)}
              </div>
            )
          })}
        </div>
      </div>
      {Array.isArray(c.forbidden_phrases) && c.forbidden_phrases.length > 0 && (
        <div className="brief-v3-uxw-forbidden">
          <div className="brief-v3-uxw-forbidden-label">Forbidden phrases</div>
          <div className="brief-v3-uxw-forbidden-list">
            {c.forbidden_phrases.map((p, i) => <span key={i} className="brief-v3-uxw-forbidden-chip">"{p}"</span>)}
          </div>
        </div>
      )}
    </div>
  )
}
function DoDontCard({ item, title, subtitle, compact }) {
  return (
    <div className={`brief-v3-dodont ${compact ? 'is-compact' : ''}`}>
      {title && <div className="brief-v3-dodont-title">{title}</div>}
      {subtitle && <div className="brief-v3-dodont-subtitle">{subtitle}</div>}
      <div className="brief-v3-dodont-pair">
        {item.do && (
          <div className="brief-v3-dodont-half brief-v3-tone-emerald">
            <span className="brief-v3-dodont-tag">Do</span>
            <span>"{item.do}"</span>
          </div>
        )}
        {item.dont && (
          <div className="brief-v3-dodont-half brief-v3-tone-red">
            <span className="brief-v3-dodont-tag">Don't</span>
            <span>"{item.dont}"</span>
          </div>
        )}
      </div>
    </div>
  )
}
function uxwSurfaceLabel(k) {
  return ({
    error_messages: 'Error messages',
    confirmations:  'Confirmations',
    instructions:   'Instructions',
    onboarding:     'Onboarding',
    button_labels:  'Button labels',
    empty_states:   'Empty states',
    notifications:  'Notifications',
  })[k] || k
}

// ────────────────────────────────────────────────────────────────────
// 18. DesignTokensRenderer
//    Token tables grouped by type. Color tokens render with the
//    actual hex swatch; spacing + radius render a tiny visual demo
//    so the scale is readable at a glance.
// ────────────────────────────────────────────────────────────────────
function DesignTokensRenderer({ content }) {
  const c = content || {}
  const t = c.tokens || {}
  return (
    <div className="brief-v3-tokens">
      {Array.isArray(t.color) && t.color.length > 0 && (
        <div className="brief-v3-tokens-block">
          <div className="brief-v3-biz-block-label">Color tokens</div>
          <div className="brief-v3-tokens-color-grid">
            {t.color.map((tk, i) => (
              <div key={i} className="brief-v3-tokens-color">
                <div className="brief-v3-tokens-color-chip" style={{ background: tk.value }} />
                <div className="brief-v3-tokens-color-meta">
                  <span className="brief-v3-mono">{tk.name}</span>
                  <span className="brief-v3-tokens-color-hex">{tk.value}</span>
                  {tk.role && <span className="brief-v3-tokens-color-role">{tk.role}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {Array.isArray(t.typography) && t.typography.length > 0 && (
        <div className="brief-v3-tokens-block">
          <div className="brief-v3-biz-block-label">Typography tokens</div>
          <table className="brief-v3-table">
            <thead><tr><th>Token</th><th>Family</th><th>Size</th><th>Weight</th><th>Line</th><th>Tracking</th><th>Role</th></tr></thead>
            <tbody>
              {t.typography.map((tk, i) => (
                <tr key={i}>
                  <td><span className="brief-v3-mono">{tk.name}</span></td>
                  <td>{tk.family}</td>
                  <td>{tk.size}</td>
                  <td>{tk.weight}</td>
                  <td>{tk.lineHeight}</td>
                  <td>{tk.letterSpacing}</td>
                  <td>{tk.role}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="brief-v3-tokens-row">
        <ScaleTokenBlock title="Spacing" tokens={t.spacing} unit="px" demo="space" />
        <ScaleTokenBlock title="Radius"  tokens={t.radius}  unit="px" demo="radius" />
      </div>
      <div className="brief-v3-tokens-row">
        <ScaleTokenBlock title="Elevation" tokens={t.elevation} demo="elevation" />
        <ScaleTokenBlock title="Shadow"    tokens={t.shadow}    demo="shadow" />
      </div>
      {Array.isArray(t.motion) && t.motion.length > 0 && (
        <div className="brief-v3-tokens-block">
          <div className="brief-v3-biz-block-label">Motion tokens</div>
          <table className="brief-v3-table">
            <thead><tr><th>Token</th><th>Duration</th><th>Easing</th><th>Role</th></tr></thead>
            <tbody>
              {t.motion.map((tk, i) => (
                <tr key={i}>
                  <td><span className="brief-v3-mono">{tk.name}</span></td>
                  <td>{tk.duration}</td>
                  <td><span className="brief-v3-mono">{tk.easing}</span></td>
                  <td>{tk.role}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="brief-v3-tokens-row">
        {c.layout && (
          <div className="brief-v3-tokens-block brief-v3-tokens-mini">
            <div className="brief-v3-biz-block-label">Layout</div>
            <dl className="brief-v3-tokens-kv">
              {c.layout.container_max  && (<><dt>Container max</dt><dd>{c.layout.container_max}</dd></>)}
              {c.layout.column_padding && (<><dt>Padding</dt><dd>{c.layout.column_padding}</dd></>)}
              {c.layout.stack_default  && (<><dt>Stack</dt><dd>{c.layout.stack_default}</dd></>)}
            </dl>
          </div>
        )}
        {c.grid && (
          <div className="brief-v3-tokens-block brief-v3-tokens-mini">
            <div className="brief-v3-biz-block-label">Grid</div>
            <dl className="brief-v3-tokens-kv">
              {c.grid.columns   && (<><dt>Columns</dt><dd>{c.grid.columns}</dd></>)}
              {c.grid.gutter    && (<><dt>Gutter</dt><dd>{c.grid.gutter}</dd></>)}
              {c.grid.rationale && (<><dt>Why</dt><dd>{c.grid.rationale}</dd></>)}
            </dl>
          </div>
        )}
      </div>
      {Array.isArray(c.breakpoints) && c.breakpoints.length > 0 && (
        <div className="brief-v3-tokens-block">
          <div className="brief-v3-biz-block-label">Breakpoints</div>
          <table className="brief-v3-table">
            <thead><tr><th>Name</th><th>Min width</th><th>Rationale</th></tr></thead>
            <tbody>
              {c.breakpoints.map((b, i) => (
                <tr key={i}>
                  <td><span className="brief-v3-mono">{b.name}</span></td>
                  <td>{b.min}</td>
                  <td>{b.rationale}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {Array.isArray(c.icon_sizes) && c.icon_sizes.length > 0 && (
        <div className="brief-v3-tokens-block">
          <div className="brief-v3-biz-block-label">Icon sizes</div>
          <div className="brief-v3-tokens-icons">
            {c.icon_sizes.map((ic, i) => {
              const px = parseInt(ic.size, 10) || 16
              return (
                <div key={i} className="brief-v3-tokens-icon">
                  <div className="brief-v3-tokens-icon-demo" style={{ width: px, height: px }} />
                  <span className="brief-v3-mono">{ic.name}</span>
                  <span className="brief-v3-tokens-icon-meta">{ic.size}{ic.stroke && ic.stroke !== 'N/A' ? ` · ${ic.stroke}` : ''}</span>
                  {ic.role && <span className="brief-v3-tokens-icon-role">{ic.role}</span>}
                </div>
              )
            })}
          </div>
        </div>
      )}
      {c.naming_convention && (
        <div className="brief-v3-tokens-block brief-v3-tokens-naming">
          <div className="brief-v3-biz-block-label">Naming convention</div>
          <div className="brief-v3-tokens-naming-rule">{c.naming_convention.rule}</div>
          {Array.isArray(c.naming_convention.examples) && (
            <div className="brief-v3-tokens-naming-eg">
              {c.naming_convention.examples.map((e, i) => (
                <span key={i} className={`brief-v3-mono brief-v3-tokens-naming-chip ${i === 0 ? 'is-good' : 'is-bad'}`}>{i === 0 ? '✓' : '✗'} {e}</span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
function ScaleTokenBlock({ title, tokens, unit, demo }) {
  const list = Array.isArray(tokens) ? tokens : []
  if (!list.length) return null
  return (
    <div className="brief-v3-tokens-block brief-v3-tokens-mini">
      <div className="brief-v3-biz-block-label">{title}</div>
      <ul className="brief-v3-tokens-scale">
        {list.map((t, i) => {
          const px = parseInt(t.value, 10)
          let demoEl = null
          if (demo === 'space' && Number.isFinite(px))
            demoEl = <span className="brief-v3-tokens-space-demo" style={{ width: Math.min(px, 64) }} />
          else if (demo === 'radius' && Number.isFinite(px))
            demoEl = <span className="brief-v3-tokens-radius-demo" style={{ borderRadius: px }} />
          else if (demo === 'elevation' || demo === 'shadow')
            demoEl = <span className="brief-v3-tokens-shadow-demo" style={{ boxShadow: t.value }} />
          return (
            <li key={i}>
              {demoEl}
              <span className="brief-v3-mono">{t.name}</span>
              <span className="brief-v3-tokens-scale-val">{t.value}{unit && Number.isFinite(parseInt(t.value)) && !String(t.value).includes(unit) ? unit : ''}</span>
              {t.role && <span className="brief-v3-tokens-scale-role">{t.role}</span>}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────
// 19. TechConsiderationsRenderer
//    APIs + backend + CMS + auth + permissions + perf + caching +
//    offline + integrations + analytics + search.
// ────────────────────────────────────────────────────────────────────
function TechConsiderationsRenderer({ content }) {
  const c = content || {}
  return (
    <div className="brief-v3-tech">
      {Array.isArray(c.apis) && c.apis.length > 0 && (
        <div className="brief-v3-tech-block">
          <div className="brief-v3-biz-block-label">APIs & services</div>
          <table className="brief-v3-table">
            <thead><tr><th>Name</th><th>Purpose</th><th>Type</th></tr></thead>
            <tbody>
              {c.apis.map((a, i) => (
                <tr key={i}>
                  <td><strong>{a.name}</strong></td>
                  <td>{a.purpose}</td>
                  <td><span className={`brief-v3-pill brief-v3-pill-${a.type === 'Internal' ? 'emerald' : a.type === 'Third-party' ? 'amber' : 'slate'}`}>{a.type}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {Array.isArray(c.backend) && c.backend.length > 0 && (
        <div className="brief-v3-tech-block">
          <div className="brief-v3-biz-block-label">Backend</div>
          <div className="brief-v3-tech-list">
            {c.backend.map((b, i) => (
              <div key={i} className="brief-v3-tech-item">
                <div className="brief-v3-tech-item-head"><strong>{b.concern}</strong></div>
                <div className="brief-v3-tech-item-row"><span>Approach</span><span>{b.approach}</span></div>
                {b.rationale && <div className="brief-v3-tech-item-row"><span>Why</span><span>{b.rationale}</span></div>}
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="brief-v3-tech-row">
        {c.cms && (
          <div className="brief-v3-tech-card">
            <div className="brief-v3-tech-card-head">CMS</div>
            <div className="brief-v3-tech-card-line"><span>Needed</span><span>{c.cms.needed ? 'Yes' : 'No'}</span></div>
            {c.cms.approach && <div className="brief-v3-tech-card-line"><span>Approach</span><span>{c.cms.approach}</span></div>}
            {c.cms.rationale && <div className="brief-v3-tech-card-line"><span>Why</span><span>{c.cms.rationale}</span></div>}
          </div>
        )}
        {c.auth && (
          <div className="brief-v3-tech-card">
            <div className="brief-v3-tech-card-head">Auth</div>
            <div className="brief-v3-tech-card-line"><span>Model</span><span>{c.auth.model}</span></div>
            {c.auth.rationale && <div className="brief-v3-tech-card-line"><span>Why</span><span>{c.auth.rationale}</span></div>}
          </div>
        )}
      </div>
      {Array.isArray(c.permissions) && c.permissions.length > 0 && (
        <div className="brief-v3-tech-block">
          <div className="brief-v3-biz-block-label">Permissions</div>
          <div className="brief-v3-tech-perms">
            {c.permissions.map((p, i) => (
              <div key={i} className="brief-v3-tech-perm">
                <div className="brief-v3-tech-perm-role">{p.role}</div>
                <div className="brief-v3-tech-perm-cols">
                  <div className="brief-v3-tone-emerald">
                    <span className="brief-v3-tech-perm-tag">Can</span>
                    <ul>{(p.can || []).map((x, xi) => <li key={xi}>{x}</li>)}</ul>
                  </div>
                  <div className="brief-v3-tone-red">
                    <span className="brief-v3-tech-perm-tag">Cannot</span>
                    <ul>{(p.cannot || []).map((x, xi) => <li key={xi}>{x}</li>)}</ul>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {Array.isArray(c.performance_risks) && c.performance_risks.length > 0 && (
        <div className="brief-v3-tech-block">
          <div className="brief-v3-biz-block-label">Performance risks</div>
          <table className="brief-v3-table">
            <thead><tr><th>Risk</th><th>Trigger</th><th>Mitigation</th></tr></thead>
            <tbody>
              {c.performance_risks.map((r, i) => (
                <tr key={i}><td><strong>{r.risk}</strong></td><td>{r.trigger}</td><td>{r.mitigation}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {Array.isArray(c.caching) && c.caching.length > 0 && (
        <div className="brief-v3-tech-block">
          <div className="brief-v3-biz-block-label">Caching strategy</div>
          <table className="brief-v3-table">
            <thead><tr><th>Layer</th><th>Strategy</th><th>Why</th></tr></thead>
            <tbody>
              {c.caching.map((ca, i) => (
                <tr key={i}><td><span className="brief-v3-pill brief-v3-pill-indigo">{ca.layer}</span></td><td>{ca.strategy}</td><td>{ca.rationale}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {c.offline_strategy && (
        <div className="brief-v3-tech-block">
          <div className="brief-v3-biz-block-label">Offline strategy</div>
          <p className="brief-v3-tech-text">{c.offline_strategy}</p>
        </div>
      )}
      {Array.isArray(c.integrations) && c.integrations.length > 0 && (
        <div className="brief-v3-tech-block">
          <div className="brief-v3-biz-block-label">Integrations</div>
          <table className="brief-v3-table">
            <thead><tr><th>Service</th><th>Purpose</th><th>Risk</th></tr></thead>
            <tbody>
              {c.integrations.map((it, i) => (
                <tr key={i}><td><strong>{it.service}</strong></td><td>{it.purpose}</td><td><span className={`brief-v3-pill brief-v3-pill-${severityTone(it.risk)}`}>{it.risk}</span></td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {c.analytics && (
        <div className="brief-v3-tech-block">
          <div className="brief-v3-biz-block-label">Analytics</div>
          <div className="brief-v3-tech-card">
            <div className="brief-v3-tech-card-line"><span>Tool</span><span>{c.analytics.tool}</span></div>
            {Array.isArray(c.analytics.key_events) && c.analytics.key_events.length > 0 && (
              <ul className="brief-v3-tech-events">
                {c.analytics.key_events.map((e, i) => <li key={i}><span className="brief-v3-mono">·</span> {e}</li>)}
              </ul>
            )}
          </div>
        </div>
      )}
      {c.search_strategy && (
        <div className="brief-v3-tech-block">
          <div className="brief-v3-biz-block-label">Search strategy</div>
          <p className="brief-v3-tech-text">{c.search_strategy}</p>
        </div>
      )}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────
// 20. RiskRegisterRenderer
//    3×3 likelihood × impact matrix with risk chips placed in cells,
//    then a full risk table below with mitigation + owner.
// ────────────────────────────────────────────────────────────────────
function RiskRegisterRenderer({ content }) {
  const risks = Array.isArray(content?.risks) ? content.risks : []
  if (!risks.length) return <div className="brief-v3-empty">No risks identified.</div>
  // Reuse the 3×3 matrix component pattern from PriorityMatrixRenderer,
  // but for likelihood × impact + with risk-tone cell shading.
  return (
    <div className="brief-v3-risk">
      <div className="brief-v3-biz-block-label">Risk heatmap</div>
      <div className="brief-v3-matrix" role="table">
        <div className="brief-v3-matrix-row brief-v3-matrix-axis-head">
          <span className="brief-v3-matrix-corner" />
          <span>Low impact</span>
          <span>Medium</span>
          <span>High impact</span>
        </div>
        {['High', 'Medium', 'Low'].map(likelihood => (
          <div key={likelihood} className="brief-v3-matrix-row">
            <span className="brief-v3-matrix-axis-side">{likelihood} likelihood</span>
            {['Low', 'Medium', 'High'].map(impact => {
              const cellRisks = risks.filter(r => norm(r.likelihood) === likelihood && norm(r.impact) === impact)
              const cellTone = riskCellTone(likelihood, impact)
              return (
                <div key={impact} className={`brief-v3-matrix-cell brief-v3-matrix-cell-${cellTone}`}>
                  <div className="brief-v3-matrix-cell-tag">{riskQuadrant(likelihood, impact)}</div>
                  {cellRisks.length === 0
                    ? <div className="brief-v3-matrix-cell-empty">-</div>
                    : cellRisks.map((r, i) => (
                        <div key={i} className="brief-v3-matrix-chip" title={r.mitigation || ''}>{r.risk}</div>
                      ))
                  }
                </div>
              )
            })}
          </div>
        ))}
      </div>
      <div className="brief-v3-biz-block-label">Register</div>
      <table className="brief-v3-table">
        <thead><tr><th>Category</th><th>Risk</th><th>Likelihood</th><th>Impact</th><th>Mitigation</th><th>Owner</th></tr></thead>
        <tbody>
          {risks.map((r, i) => (
            <tr key={i}>
              <td><span className="brief-v3-pill brief-v3-pill-slate">{r.category}</span></td>
              <td><strong>{r.risk}</strong></td>
              <td><span className={`brief-v3-pill brief-v3-pill-${severityTone(r.likelihood)}`}>{r.likelihood}</span></td>
              <td><span className={`brief-v3-pill brief-v3-pill-${severityTone(r.impact)}`}>{r.impact}</span></td>
              <td>{r.mitigation}</td>
              <td><span className="brief-v3-mono">{r.owner}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
function riskQuadrant(likelihood, impact) {
  if (likelihood === 'High' && impact === 'High')   return 'critical'
  if (likelihood === 'High' && impact === 'Low')    return 'monitor'
  if (likelihood === 'Low'  && impact === 'High')   return 'plan'
  if (likelihood === 'Low'  && impact === 'Low')    return 'accept'
  return 'mitigate'
}
function riskCellTone(likelihood, impact) {
  if (likelihood === 'High' && impact === 'High')   return 'avoid'    // red
  if (likelihood === 'High' && impact === 'Low')    return 'consider' // amber
  if (likelihood === 'Low'  && impact === 'High')   return 'bigbet'   // indigo (plan-for)
  if (likelihood === 'Low'  && impact === 'Low')    return 'quickwin' // emerald (accept)
  return 'consider'
}

// ────────────────────────────────────────────────────────────────────
// 21. SuccessMetricsRenderer
//    KPI cards. Each card shows category, big target number,
//    measurement method, baseline, cadence, ties_to.
// ────────────────────────────────────────────────────────────────────
function SuccessMetricsRenderer({ content }) {
  const list = Array.isArray(content?.metrics) ? content.metrics : []
  if (!list.length) return <div className="brief-v3-empty">No metrics yet.</div>
  return (
    <div className="brief-v3-metrics">
      {list.map((m, i) => (
        <div key={i} className="brief-v3-metric">
          <div className="brief-v3-metric-head">
            <span className={`brief-v3-pill brief-v3-pill-${metricCategoryTone(m.category)}`}>{m.category}</span>
            <span className="brief-v3-pill brief-v3-pill-slate">{m.cadence}</span>
          </div>
          <div className="brief-v3-metric-name">{m.metric}</div>
          <div className="brief-v3-metric-target">{m.target}</div>
          {m.ties_to && <div className="brief-v3-metric-ties">{m.ties_to}</div>}
          <dl className="brief-v3-metric-meta">
            {m.baseline    && (<><dt>Baseline</dt><dd>{m.baseline}</dd></>)}
            {m.measurement && (<><dt>How</dt><dd><span className="brief-v3-mono">{m.measurement}</span></dd></>)}
          </dl>
        </div>
      ))}
    </div>
  )
}
function metricCategoryTone(cat) {
  const c = String(cat || '').toLowerCase()
  if (c.includes('convers') || c.includes('busin')) return 'amber'
  if (c.includes('reten') || c.includes('adop'))    return 'emerald'
  if (c.includes('error') || c.includes('bounce'))  return 'red'
  if (c.includes('engage') || c.includes('time'))   return 'indigo'
  return 'slate'
}

// ────────────────────────────────────────────────────────────────────
// 22. AiPackageRenderer
//    Structured sections + a copy-to-clipboard "handoff prompt"
//    block so this entire chapter can be pasted into another AI.
// ────────────────────────────────────────────────────────────────────
function AiPackageRenderer({ content }) {
  const c = content || {}
  const [copied, setCopied] = useState(false)
  const fullPayload = useMemo(() => buildHandoffPayload(c), [c])
  function copyAll() {
    try {
      navigator.clipboard.writeText(fullPayload)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {}
  }
  const blocks = [
    ['Project summary',  c.project_summary,  'text'],
    ['Audience',         c.audience,         'text'],
    ['Visual direction', c.visual_direction, 'text'],
    ['Goals',            c.goals,            'list'],
    ['Requirements',     c.requirements,     'list'],
    ['Flows',            c.flows,            'list'],
    ['Components',       c.components,       'list'],
    ['Constraints',      c.constraints,      'list'],
    ['Design principles',c.design_principles,'list'],
    ['Success metrics',  c.success_metrics,  'list'],
  ].filter(([, v]) => v && (Array.isArray(v) ? v.length : String(v).trim()))
  return (
    <div className="brief-v3-aip">
      <div className="brief-v3-aip-header">
        <div>
          <div className="brief-v3-aip-eyebrow">Ready for the next AI</div>
          <div className="brief-v3-aip-tagline">Paste this into another model to keep moving.</div>
        </div>
        <button type="button" onClick={copyAll} className="brief-v3-aip-copy">
          {copied ? '✓ Copied' : 'Copy full package'}
        </button>
      </div>
      {c.handoff_prompt && (
        <div className="brief-v3-aip-handoff">
          <div className="brief-v3-aip-handoff-label">Handoff prompt</div>
          <pre className="brief-v3-aip-handoff-body">{c.handoff_prompt}</pre>
        </div>
      )}
      <div className="brief-v3-aip-blocks">
        {blocks.map(([title, value, type], i) => (
          <div key={i} className="brief-v3-aip-block">
            <div className="brief-v3-aip-block-label">{title}</div>
            {type === 'text'
              ? <p className="brief-v3-aip-block-text">{value}</p>
              : (
                <ul className="brief-v3-aip-block-list">
                  {value.map((v, vi) => <li key={vi}>{v}</li>)}
                </ul>
              )}
          </div>
        ))}
      </div>
    </div>
  )
}
function buildHandoffPayload(c) {
  if (!c) return ''
  const lines = []
  if (c.handoff_prompt) lines.push(c.handoff_prompt, '')
  if (c.project_summary) lines.push('## Project', c.project_summary, '')
  if (c.audience)        lines.push('## Audience', c.audience, '')
  if (Array.isArray(c.goals) && c.goals.length) {
    lines.push('## Goals')
    c.goals.forEach(g => lines.push(`- ${g}`))
    lines.push('')
  }
  if (Array.isArray(c.requirements) && c.requirements.length) {
    lines.push('## Requirements')
    c.requirements.forEach(r => lines.push(`- ${r}`))
    lines.push('')
  }
  if (Array.isArray(c.flows) && c.flows.length) {
    lines.push('## Flows')
    c.flows.forEach(f => lines.push(`- ${f}`))
    lines.push('')
  }
  if (Array.isArray(c.components) && c.components.length) {
    lines.push('## Components')
    c.components.forEach(co => lines.push(`- ${co}`))
    lines.push('')
  }
  if (Array.isArray(c.constraints) && c.constraints.length) {
    lines.push('## Constraints')
    c.constraints.forEach(co => lines.push(`- ${co}`))
    lines.push('')
  }
  if (c.visual_direction) lines.push('## Visual direction', c.visual_direction, '')
  if (Array.isArray(c.design_principles) && c.design_principles.length) {
    lines.push('## Design principles')
    c.design_principles.forEach(p => lines.push(`- ${p}`))
    lines.push('')
  }
  if (Array.isArray(c.success_metrics) && c.success_metrics.length) {
    lines.push('## Success metrics')
    c.success_metrics.forEach(m => lines.push(`- ${m}`))
    lines.push('')
  }
  return lines.join('\n')
}

// ────────────────────────────────────────────────────────────────────
// Utility tone helpers
// ────────────────────────────────────────────────────────────────────
function scoreTone(n) {
  if (n >= 80) return 'emerald'
  if (n >= 60) return 'amber'
  if (n >= 40) return 'orange'
  return 'red'
}
function severityTone(s) {
  const v = String(s || '').toLowerCase()
  if (v.startsWith('h') || v === 'acute' || v === 'critical') return 'red'
  if (v.startsWith('m') || v === 'chronic')                   return 'amber'
  return 'slate'
}
function leverageTone(l) {
  const v = String(l || '').toLowerCase()
  if (v.startsWith('h')) return 'emerald'
  if (v.startsWith('m')) return 'amber'
  return 'slate'
}
function priorityTone(p) {
  const v = String(p || '').toLowerCase()
  if (v.startsWith('m')) return 'red'    // Must
  if (v.startsWith('s')) return 'amber'  // Should
  return 'slate'                          // Could
}
function emotionTone(score) {
  const n = Number(score) || 3
  if (n >= 4) return 'high'
  if (n <= 2) return 'low'
  return 'mid'
}

