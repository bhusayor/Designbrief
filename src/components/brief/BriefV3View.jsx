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
import { BRIEF_V3_TIERS } from '../../lib/briefV3Schema.js'

export default function BriefV3View({
  result,
  isStreaming = false,
  revising = false,
  // The wider app still hands these in (revise modal trigger, comments
  // banner, version tabs). Phase 1A renders the doc only; Phase 1B will
  // wire these into the shell where they belong.
  onRevise,
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
      <V3Styles />

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
    case 'snapshot':        return <SnapshotRenderer       content={c} />
    case 'scorecard':       return <ScorecardRenderer      content={c} />
    case 'state_diagram':   return <StateDiagramRenderer   content={c} />
    case 'priority_matrix': return <PriorityMatrixRenderer content={c} />
    default:
      return (
        <div className="brief-v3-unhandled">
          Renderer for shape <code>{section.shape}</code> not yet implemented in Phase 1A.
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

// ────────────────────────────────────────────────────────────────────
// V3 Styles — completely new visual language. Inter / Fraunces /
// JetBrains Mono. Slate + amber palette. No purple, no card grid,
// nothing carried over from V2.
// ────────────────────────────────────────────────────────────────────
function V3Styles() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,700&family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap');

      :root {
        --v3-bg:           #FAF7F2;
        --v3-bg-2:         #F3EFE7;
        --v3-ink:          #1A1A1A;
        --v3-ink-soft:     #3F3F3F;
        --v3-ink-muted:    #8A8580;
        --v3-line:         #E2DCCF;
        --v3-line-soft:    #EFEAE0;
        --v3-accent:       #C97B2F;   /* burnt amber */
        --v3-accent-ink:   #6B3F12;
        --v3-emerald:      #2F7D4F;
        --v3-amber:        #B26B0F;
        --v3-red:          #B43838;
        --v3-orange:       #C0521A;
        --v3-slate:        #475766;
        --v3-indigo:       #3B4990;
      }
      @media (prefers-color-scheme: dark) {
        /* V3 Phase 1A targets light mode only. Dark mode tuned in
           Phase 1B once the rest of the chapters land. */
      }

      /* ── Root + topbar ────────────────────────────────────────── */
      .brief-v3-root {
        background: var(--v3-bg);
        color: var(--v3-ink);
        font-family: 'Inter', -apple-system, sans-serif;
        min-height: 100vh;
      }
      .brief-v3-topbar {
        position: sticky; top: 0; z-index: 30;
        background: var(--v3-bg);
        border-bottom: 1px solid var(--v3-line);
        backdrop-filter: blur(8px);
      }
      .brief-v3-topbar-inner {
        max-width: 1240px; margin: 0 auto;
        padding: 18px 32px;
        display: flex; align-items: center; justify-content: space-between; gap: 24px;
      }
      .brief-v3-topbar-left { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
      .brief-v3-topbar-kicker {
        font: 600 10px 'JetBrains Mono', monospace;
        letter-spacing: 0.16em; text-transform: uppercase;
        color: var(--v3-ink-muted);
      }
      .brief-v3-topbar-title {
        margin: 0;
        font: 700 22px/1.15 'Fraunces', serif;
        letter-spacing: -0.01em;
        color: var(--v3-ink);
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      }
      .brief-v3-topbar-right { display: flex; align-items: center; gap: 14px; }
      .brief-v3-topbar-score {
        display: flex; align-items: center; gap: 8px;
        padding: 6px 10px;
        border: 1px solid var(--v3-line);
        border-radius: 10px;
        background: var(--v3-bg-2);
      }
      .brief-v3-topbar-score-num {
        font: 700 20px 'Fraunces', serif;
        color: var(--v3-accent-ink);
      }
      .brief-v3-topbar-score-label {
        font: 600 8px 'JetBrains Mono', monospace;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: var(--v3-ink-muted);
        line-height: 1.2;
      }
      .brief-v3-topbar-status {
        display: inline-flex; align-items: center; gap: 6px;
        font: 600 11px 'JetBrains Mono', monospace;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--v3-accent);
      }
      .brief-v3-topbar-pulse {
        width: 8px; height: 8px; border-radius: 50%;
        background: var(--v3-accent);
        animation: v3pulse 1.4s ease-in-out infinite;
      }
      @keyframes v3pulse {
        0%, 100% { opacity: 1; transform: scale(1); }
        50%      { opacity: 0.35; transform: scale(0.7); }
      }
      .brief-v3-topbar-revise {
        padding: 9px 18px;
        background: var(--v3-ink);
        color: var(--v3-bg);
        border: none;
        border-radius: 999px;
        font: 700 12px 'Inter', sans-serif;
        letter-spacing: 0.02em;
        cursor: pointer;
        transition: background 0.15s;
      }
      .brief-v3-topbar-revise:hover { background: var(--v3-accent-ink); }

      /* ── Two-column layout ────────────────────────────────────── */
      .brief-v3-layout {
        max-width: 1240px; margin: 0 auto;
        padding: 0 32px;
        display: grid;
        grid-template-columns: 260px minmax(0, 1fr);
        gap: 48px;
      }
      @media (max-width: 980px) {
        .brief-v3-layout { grid-template-columns: 1fr; padding: 0 20px; gap: 0; }
        .brief-v3-nav { display: none; }
      }

      /* ── Left sticky nav ──────────────────────────────────────── */
      .brief-v3-nav {
        position: sticky;
        top: 88px;
        align-self: start;
        max-height: calc(100vh - 100px);
        overflow-y: auto;
        padding: 32px 0 80px;
      }
      .brief-v3-nav-eyebrow {
        font: 600 9px 'JetBrains Mono', monospace;
        letter-spacing: 0.16em;
        text-transform: uppercase;
        color: var(--v3-ink-muted);
        margin-bottom: 14px;
      }
      .brief-v3-nav-group { margin-bottom: 22px; }
      .brief-v3-nav-group-label {
        display: flex; flex-direction: column; gap: 2px;
        margin-bottom: 8px;
      }
      .brief-v3-nav-group-tag {
        font: 700 10px 'JetBrains Mono', monospace;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: var(--v3-accent-ink);
      }
      .brief-v3-nav-group-hint {
        font: 500 11px 'Inter', sans-serif;
        color: var(--v3-ink-muted);
      }
      .brief-v3-nav-list { list-style: none; padding: 0; margin: 0; }
      .brief-v3-nav-item {
        display: grid;
        grid-template-columns: 28px 1fr 10px;
        align-items: center;
        gap: 8px;
        width: 100%;
        background: none; border: none;
        text-align: left;
        padding: 6px 0;
        cursor: pointer;
        color: var(--v3-ink-soft);
        border-radius: 6px;
        transition: color 0.12s;
      }
      .brief-v3-nav-item:hover { color: var(--v3-ink); }
      .brief-v3-nav-item.is-active { color: var(--v3-accent-ink); }
      .brief-v3-nav-num {
        font: 600 10px 'JetBrains Mono', monospace;
        color: var(--v3-ink-muted);
      }
      .brief-v3-nav-item.is-active .brief-v3-nav-num { color: var(--v3-accent); }
      .brief-v3-nav-title {
        font: 500 13px/1.3 'Inter', sans-serif;
      }
      .brief-v3-nav-item.is-active .brief-v3-nav-title { font-weight: 700; }
      .brief-v3-nav-dot {
        width: 6px; height: 6px; border-radius: 50%;
        background: var(--v3-line);
        transition: background 0.12s, transform 0.12s;
      }
      .brief-v3-nav-item-done    .brief-v3-nav-dot { background: var(--v3-emerald); }
      .brief-v3-nav-item-pending .brief-v3-nav-dot { background: var(--v3-accent); animation: v3pulse 1.6s ease infinite; }
      .brief-v3-nav-item-phase   .brief-v3-nav-dot { background: var(--v3-line); }
      .brief-v3-nav-item-error   .brief-v3-nav-dot { background: var(--v3-red); }
      .brief-v3-nav-item.is-active .brief-v3-nav-dot { transform: scale(1.4); }

      /* ── Document / chapters ──────────────────────────────────── */
      .brief-v3-doc {
        padding: 56px 0 200px;
        min-width: 0;
      }
      .brief-v3-chapter {
        padding: 56px 0 64px;
        border-bottom: 1px solid var(--v3-line-soft);
      }
      .brief-v3-chapter:first-child { padding-top: 8px; }
      .brief-v3-chapter:last-child { border-bottom: none; }
      .brief-v3-chapter-head {
        display: grid;
        grid-template-columns: 56px 1fr auto;
        align-items: start;
        gap: 18px;
        margin-bottom: 36px;
      }
      .brief-v3-chapter-num {
        font: 400 36px/1 'Fraunces', serif;
        font-variant-numeric: oldstyle-nums;
        color: var(--v3-accent);
      }
      .brief-v3-chapter-meta { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
      .brief-v3-chapter-title {
        margin: 0;
        font: 700 36px/1.1 'Fraunces', serif;
        letter-spacing: -0.02em;
        color: var(--v3-ink);
      }
      .brief-v3-chapter-desc {
        margin: 0;
        font: 400 15px/1.5 'Inter', sans-serif;
        color: var(--v3-ink-muted);
        max-width: 60ch;
      }
      .brief-v3-chapter-badge {
        font: 700 9px 'JetBrains Mono', monospace;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        padding: 4px 8px;
        border-radius: 4px;
        white-space: nowrap;
      }
      .brief-v3-chapter-badge-pending {
        background: rgba(201,123,47,0.12);
        color: var(--v3-accent-ink);
      }
      .brief-v3-chapter-badge-phase {
        background: var(--v3-bg-2);
        color: var(--v3-ink-muted);
      }
      .brief-v3-chapter-badge-error {
        background: rgba(180,56,56,0.12);
        color: var(--v3-red);
      }
      .brief-v3-chapter-body { margin-left: 0; }

      .brief-v3-skeleton { display: flex; flex-direction: column; gap: 10px; }
      .brief-v3-skeleton-row {
        height: 16px;
        background: linear-gradient(90deg, var(--v3-line-soft), var(--v3-bg-2), var(--v3-line-soft));
        background-size: 200% 100%;
        border-radius: 4px;
        animation: v3sk 1.6s ease infinite;
      }
      @keyframes v3sk {
        0%   { background-position: 100% 0; }
        100% { background-position: -100% 0; }
      }

      .brief-v3-phase, .brief-v3-error {
        padding: 24px 28px;
        background: var(--v3-bg-2);
        border: 1px solid var(--v3-line);
        border-radius: 10px;
        font: 500 14px/1.55 'Inter', sans-serif;
        color: var(--v3-ink-soft);
      }
      .brief-v3-error { background: rgba(180,56,56,0.06); border-color: rgba(180,56,56,0.30); color: var(--v3-red); }
      .brief-v3-error-head { font-weight: 700; margin-bottom: 4px; }
      .brief-v3-unhandled {
        padding: 16px 20px;
        background: var(--v3-bg-2);
        border: 1px dashed var(--v3-line);
        border-radius: 8px;
        font: 500 13px 'Inter', sans-serif;
        color: var(--v3-ink-muted);
      }
      .brief-v3-unhandled code {
        font: 600 12px 'JetBrains Mono', monospace;
        color: var(--v3-accent-ink);
      }

      /* ── 1. Snapshot renderer ─────────────────────────────────── */
      .brief-v3-snapshot { display: flex; flex-direction: column; gap: 28px; }
      .brief-v3-lede {
        margin: 0;
        font: 500 19px/1.5 'Fraunces', serif;
        font-style: italic;
        color: var(--v3-ink);
        max-width: 56ch;
        border-left: 3px solid var(--v3-accent);
        padding-left: 18px;
      }
      .brief-v3-snapshot-grid {
        margin: 0;
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 0;
        border-top: 1px solid var(--v3-line);
      }
      @media (max-width: 700px) { .brief-v3-snapshot-grid { grid-template-columns: 1fr; } }
      .brief-v3-snapshot-row {
        display: grid;
        grid-template-columns: 130px 1fr;
        gap: 18px;
        padding: 12px 0;
        border-bottom: 1px solid var(--v3-line);
      }
      .brief-v3-snapshot-row:nth-child(odd) {
        border-right: 1px solid var(--v3-line);
        padding-right: 24px;
      }
      .brief-v3-snapshot-row:nth-child(even) {
        padding-left: 24px;
      }
      @media (max-width: 700px) {
        .brief-v3-snapshot-row:nth-child(odd) { border-right: none; padding-right: 0; }
        .brief-v3-snapshot-row:nth-child(even) { padding-left: 0; }
      }
      .brief-v3-snapshot-row dt {
        font: 600 10px 'JetBrains Mono', monospace;
        letter-spacing: 0.10em;
        text-transform: uppercase;
        color: var(--v3-ink-muted);
        padding-top: 3px;
      }
      .brief-v3-snapshot-row dd {
        margin: 0;
        font: 500 14px/1.5 'Inter', sans-serif;
        color: var(--v3-ink);
      }
      .brief-v3-inferred {
        display: inline-block;
        margin-left: 6px;
        font: 700 8px 'JetBrains Mono', monospace;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        padding: 1px 5px;
        border-radius: 3px;
        background: rgba(201,123,47,0.15);
        color: var(--v3-accent-ink);
        vertical-align: middle;
      }
      .brief-v3-snapshot-chips {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 12px;
        margin-top: 4px;
      }
      @media (max-width: 700px) { .brief-v3-snapshot-chips { grid-template-columns: 1fr; } }
      .brief-v3-snapshot-chip {
        padding: 14px 16px;
        border: 1px solid var(--v3-line);
        border-radius: 10px;
        background: var(--v3-bg-2);
        display: flex; flex-direction: column; gap: 4px;
      }
      .brief-v3-snapshot-chip-amber   { border-top: 3px solid var(--v3-amber); }
      .brief-v3-snapshot-chip-slate   { border-top: 3px solid var(--v3-slate); }
      .brief-v3-snapshot-chip-emerald { border-top: 3px solid var(--v3-emerald); }
      .brief-v3-snapshot-chip-label {
        font: 600 9px 'JetBrains Mono', monospace;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: var(--v3-ink-muted);
      }
      .brief-v3-snapshot-chip-value {
        font: 700 18px 'Fraunces', serif;
        color: var(--v3-ink);
      }
      .brief-v3-snapshot-chip-rationale {
        font: 400 12px/1.45 'Inter', sans-serif;
        color: var(--v3-ink-soft);
      }

      /* ── 2. Scorecard renderer ────────────────────────────────── */
      .brief-v3-scorecard { display: flex; flex-direction: column; gap: 28px; }
      .brief-v3-scorecard-hero {
        display: grid;
        grid-template-columns: 180px 1fr;
        align-items: center;
        gap: 28px;
        padding: 28px 32px;
        background: var(--v3-bg-2);
        border: 1px solid var(--v3-line);
        border-radius: 14px;
        border-left-width: 5px;
      }
      .brief-v3-scorecard-hero.brief-v3-tone-emerald { border-left-color: var(--v3-emerald); }
      .brief-v3-scorecard-hero.brief-v3-tone-amber   { border-left-color: var(--v3-amber); }
      .brief-v3-scorecard-hero.brief-v3-tone-orange  { border-left-color: var(--v3-orange); }
      .brief-v3-scorecard-hero.brief-v3-tone-red     { border-left-color: var(--v3-red); }
      .brief-v3-scorecard-overall { display: flex; align-items: baseline; gap: 4px; }
      .brief-v3-scorecard-overall-num {
        font: 400 88px/1 'Fraunces', serif;
        font-variant-numeric: oldstyle-nums;
        color: var(--v3-ink);
      }
      .brief-v3-scorecard-overall-of {
        font: 500 16px 'JetBrains Mono', monospace;
        color: var(--v3-ink-muted);
      }
      .brief-v3-scorecard-verdict {
        margin: 0;
        font: 500 17px/1.4 'Fraunces', serif;
        font-style: italic;
        color: var(--v3-ink-soft);
      }
      .brief-v3-scorecard-bars {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 18px 32px;
      }
      @media (max-width: 700px) { .brief-v3-scorecard-bars { grid-template-columns: 1fr; } }
      .brief-v3-scorebar { display: flex; flex-direction: column; gap: 6px; }
      .brief-v3-scorebar-head {
        display: flex; align-items: baseline; justify-content: space-between;
      }
      .brief-v3-scorebar-name {
        font: 600 13px 'Inter', sans-serif;
        color: var(--v3-ink);
      }
      .brief-v3-scorebar-num {
        font: 600 14px 'JetBrains Mono', monospace;
      }
      .brief-v3-scorebar-track {
        height: 6px;
        background: var(--v3-line-soft);
        border-radius: 3px;
        overflow: hidden;
      }
      .brief-v3-scorebar-fill {
        height: 100%;
        border-radius: 3px;
        transition: width 0.4s ease;
      }
      .brief-v3-scorebar-fill.brief-v3-tone-emerald { background: var(--v3-emerald); }
      .brief-v3-scorebar-fill.brief-v3-tone-amber   { background: var(--v3-amber); }
      .brief-v3-scorebar-fill.brief-v3-tone-orange  { background: var(--v3-orange); }
      .brief-v3-scorebar-fill.brief-v3-tone-red     { background: var(--v3-red); }
      .brief-v3-tone-emerald { color: var(--v3-emerald); }
      .brief-v3-tone-amber   { color: var(--v3-amber); }
      .brief-v3-tone-orange  { color: var(--v3-orange); }
      .brief-v3-tone-red     { color: var(--v3-red); }
      .brief-v3-tone-slate   { color: var(--v3-slate); }
      .brief-v3-tone-indigo  { color: var(--v3-indigo); }
      .brief-v3-scorebar-note {
        font: 400 12px/1.45 'Inter', sans-serif;
        color: var(--v3-ink-muted);
      }
      .brief-v3-scorecard-lists {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
        gap: 16px;
      }
      .brief-v3-scorelist {
        padding: 18px 20px;
        background: var(--v3-bg-2);
        border: 1px solid var(--v3-line);
        border-radius: 10px;
        border-top: 3px solid currentColor;
      }
      .brief-v3-scorelist.brief-v3-tone-emerald { border-top-color: var(--v3-emerald); }
      .brief-v3-scorelist.brief-v3-tone-amber   { border-top-color: var(--v3-amber); }
      .brief-v3-scorelist.brief-v3-tone-slate   { border-top-color: var(--v3-slate); }
      .brief-v3-scorelist.brief-v3-tone-red     { border-top-color: var(--v3-red); }
      .brief-v3-scorelist.brief-v3-tone-indigo  { border-top-color: var(--v3-indigo); }
      .brief-v3-scorelist-head {
        font: 700 11px 'JetBrains Mono', monospace;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: var(--v3-ink);
        margin-bottom: 10px;
      }
      .brief-v3-scorelist ul {
        list-style: none; margin: 0; padding: 0;
        display: flex; flex-direction: column; gap: 8px;
      }
      .brief-v3-scorelist li {
        font: 500 13px/1.5 'Inter', sans-serif;
        color: var(--v3-ink-soft);
        display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
      }
      .brief-v3-pill {
        display: inline-block;
        padding: 2px 7px;
        border-radius: 3px;
        font: 700 9px 'JetBrains Mono', monospace;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
      .brief-v3-pill-emerald { background: rgba(47,125,79,0.14);  color: var(--v3-emerald); }
      .brief-v3-pill-amber   { background: rgba(178,107,15,0.14); color: var(--v3-amber); }
      .brief-v3-pill-red     { background: rgba(180,56,56,0.14);  color: var(--v3-red); }
      .brief-v3-pill-slate   { background: rgba(71,87,102,0.14);  color: var(--v3-slate); }
      .brief-v3-pill-indigo  { background: rgba(59,73,144,0.14);  color: var(--v3-indigo); }

      /* ── 3. State diagram renderer ────────────────────────────── */
      .brief-v3-state { display: flex; flex-direction: column; gap: 28px; }
      .brief-v3-state-flow {
        display: grid;
        grid-template-columns: 1fr 100px 1fr;
        gap: 16px;
        align-items: stretch;
      }
      @media (max-width: 800px) {
        .brief-v3-state-flow { grid-template-columns: 1fr; }
        .brief-v3-state-arrow { transform: rotate(90deg); margin: 0 auto; }
      }
      .brief-v3-state-card {
        padding: 24px 28px;
        background: var(--v3-bg-2);
        border: 1px solid var(--v3-line);
        border-radius: 12px;
        display: flex; flex-direction: column; gap: 12px;
      }
      .brief-v3-state-card-current { border-top: 4px solid var(--v3-slate); }
      .brief-v3-state-card-desired { border-top: 4px solid var(--v3-emerald); }
      .brief-v3-state-card-label {
        font: 700 10px 'JetBrains Mono', monospace;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: var(--v3-ink-muted);
      }
      .brief-v3-state-card p {
        margin: 0;
        font: 500 15px/1.55 'Inter', sans-serif;
        color: var(--v3-ink);
      }
      .brief-v3-state-arrow {
        display: flex; align-items: center; justify-content: center;
        position: relative;
      }
      .brief-v3-state-arrow::before {
        content: '';
        position: absolute;
        top: 50%; left: 8px; right: 8px;
        height: 2px;
        background: var(--v3-accent);
      }
      .brief-v3-state-arrow::after {
        content: '';
        position: absolute;
        top: calc(50% - 6px); right: 6px;
        border-left: 10px solid var(--v3-accent);
        border-top: 6px solid transparent;
        border-bottom: 6px solid transparent;
      }
      .brief-v3-state-arrow-gap {
        position: relative;
        z-index: 1;
        background: var(--v3-bg);
        padding: 4px 10px;
        font: 700 10px 'JetBrains Mono', monospace;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        color: var(--v3-accent);
        border: 1px solid var(--v3-accent);
        border-radius: 4px;
        max-width: 88px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        text-align: center;
      }
      .brief-v3-state-impact {
        padding: 18px 22px;
        background: var(--v3-bg);
        border-left: 3px solid var(--v3-red);
      }
      .brief-v3-state-impact-label {
        font: 700 10px 'JetBrains Mono', monospace;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: var(--v3-red);
      }
      .brief-v3-state-impact p {
        margin: 6px 0 0;
        font: 500 14px/1.55 'Inter', sans-serif;
        color: var(--v3-ink);
      }
      .brief-v3-state-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
        gap: 16px;
      }
      .brief-v3-state-col {
        padding: 18px 20px;
        background: var(--v3-bg-2);
        border: 1px solid var(--v3-line);
        border-radius: 10px;
        border-top: 3px solid currentColor;
      }
      .brief-v3-state-col.brief-v3-tone-red     { border-top-color: var(--v3-red); }
      .brief-v3-state-col.brief-v3-tone-amber   { border-top-color: var(--v3-amber); }
      .brief-v3-state-col.brief-v3-tone-emerald { border-top-color: var(--v3-emerald); }
      .brief-v3-state-col.brief-v3-tone-slate   { border-top-color: var(--v3-slate); }
      .brief-v3-state-col-head {
        font: 700 11px 'JetBrains Mono', monospace;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: var(--v3-ink);
        margin-bottom: 10px;
      }
      .brief-v3-state-col ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 12px; }
      .brief-v3-state-col li {
        font: 500 13px/1.5 'Inter', sans-serif;
        color: var(--v3-ink-soft);
      }
      .brief-v3-state-line { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
      .brief-v3-state-line strong { color: var(--v3-ink); font-weight: 600; }
      .brief-v3-state-evidence {
        font: 400 12px/1.5 'Inter', sans-serif;
        color: var(--v3-ink-muted);
        margin-top: 3px;
      }

      /* ── 4. Business / priority matrix renderer ───────────────── */
      .brief-v3-biz { display: flex; flex-direction: column; gap: 28px; }
      .brief-v3-biz-block-label {
        font: 700 11px 'JetBrains Mono', monospace;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: var(--v3-ink-muted);
        margin-bottom: 10px;
      }
      .brief-v3-table {
        width: 100%;
        border-collapse: collapse;
        background: var(--v3-bg-2);
        border: 1px solid var(--v3-line);
        border-radius: 10px;
        overflow: hidden;
        font: 500 13px 'Inter', sans-serif;
      }
      .brief-v3-table thead th {
        text-align: left;
        font: 700 10px 'JetBrains Mono', monospace;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: var(--v3-ink-muted);
        background: var(--v3-bg);
        padding: 10px 14px;
        border-bottom: 1px solid var(--v3-line);
      }
      .brief-v3-table tbody td {
        padding: 12px 14px;
        border-bottom: 1px solid var(--v3-line-soft);
        color: var(--v3-ink);
        vertical-align: top;
      }
      .brief-v3-table tbody tr:last-child td { border-bottom: none; }
      .brief-v3-mono {
        font: 600 12px 'JetBrains Mono', monospace;
        color: var(--v3-ink-soft);
      }
      .brief-v3-matrix {
        display: flex; flex-direction: column;
        background: var(--v3-bg-2);
        border: 1px solid var(--v3-line);
        border-radius: 12px;
        overflow: hidden;
      }
      .brief-v3-matrix-row {
        display: grid;
        grid-template-columns: 120px repeat(3, 1fr);
        border-bottom: 1px solid var(--v3-line);
      }
      .brief-v3-matrix-row:last-child { border-bottom: none; }
      .brief-v3-matrix-axis-head {
        background: var(--v3-bg);
      }
      .brief-v3-matrix-axis-head > span {
        padding: 10px 12px;
        font: 700 10px 'JetBrains Mono', monospace;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: var(--v3-ink-muted);
        border-right: 1px solid var(--v3-line);
        text-align: center;
      }
      .brief-v3-matrix-axis-head > span:last-child { border-right: none; }
      .brief-v3-matrix-axis-head .brief-v3-matrix-corner { background: transparent; }
      .brief-v3-matrix-axis-side {
        padding: 14px 12px;
        font: 700 10px 'JetBrains Mono', monospace;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: var(--v3-ink-muted);
        background: var(--v3-bg);
        border-right: 1px solid var(--v3-line);
        display: flex; align-items: center;
      }
      .brief-v3-matrix-cell {
        padding: 12px;
        border-right: 1px solid var(--v3-line-soft);
        display: flex; flex-direction: column; gap: 6px;
        min-height: 100px;
        position: relative;
      }
      .brief-v3-matrix-cell:last-child { border-right: none; }
      .brief-v3-matrix-cell-tag {
        font: 700 8px 'JetBrains Mono', monospace;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: var(--v3-ink-muted);
        align-self: flex-end;
      }
      .brief-v3-matrix-cell-quickwin  { background: rgba(47,125,79,0.07); }
      .brief-v3-matrix-cell-quickwin  .brief-v3-matrix-cell-tag { color: var(--v3-emerald); }
      .brief-v3-matrix-cell-bigbet    { background: rgba(59,73,144,0.06); }
      .brief-v3-matrix-cell-bigbet    .brief-v3-matrix-cell-tag { color: var(--v3-indigo); }
      .brief-v3-matrix-cell-fillin    { background: var(--v3-bg-2); }
      .brief-v3-matrix-cell-avoid     { background: rgba(180,56,56,0.06); }
      .brief-v3-matrix-cell-avoid     .brief-v3-matrix-cell-tag { color: var(--v3-red); }
      .brief-v3-matrix-cell-consider  { background: rgba(201,123,47,0.05); }
      .brief-v3-matrix-cell-consider  .brief-v3-matrix-cell-tag { color: var(--v3-amber); }
      .brief-v3-matrix-chip {
        font: 600 11px 'Inter', sans-serif;
        color: var(--v3-ink);
        padding: 4px 8px;
        background: var(--v3-bg);
        border: 1px solid var(--v3-line);
        border-radius: 6px;
        cursor: help;
      }
      .brief-v3-matrix-cell-empty {
        color: var(--v3-ink-muted);
        font-size: 12px;
        align-self: flex-start;
      }
      @media (max-width: 800px) {
        .brief-v3-matrix-row { grid-template-columns: 80px repeat(3, 1fr); }
        .brief-v3-matrix-axis-side, .brief-v3-matrix-axis-head > span { font-size: 9px; padding: 8px 6px; }
      }

      .brief-v3-biz-cols {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
        gap: 16px;
      }
      .brief-v3-biz-col {
        padding: 18px 20px;
        background: var(--v3-bg-2);
        border: 1px solid var(--v3-line);
        border-radius: 10px;
        border-top: 3px solid currentColor;
      }
      .brief-v3-biz-col.brief-v3-tone-amber   { border-top-color: var(--v3-amber); }
      .brief-v3-biz-col.brief-v3-tone-emerald { border-top-color: var(--v3-emerald); }
      .brief-v3-biz-col.brief-v3-tone-red     { border-top-color: var(--v3-red); }
      .brief-v3-biz-col-head {
        font: 700 11px 'JetBrains Mono', monospace;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: var(--v3-ink);
        margin-bottom: 10px;
      }
      .brief-v3-biz-col ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
      .brief-v3-biz-col li {
        display: flex; flex-direction: column; gap: 4px;
        font: 500 13px/1.45 'Inter', sans-serif;
        color: var(--v3-ink-soft);
      }
      .brief-v3-biz-col-badges {
        display: inline-flex; gap: 6px; flex-wrap: wrap;
      }
    `}</style>
  )
}
