// ────────────────────────────────────────────────────────────────────
// BacklogView.jsx — renders a generated Phase 2 backlog.
//
// Two-pane layout consistent with BriefV3View:
//   - LEFT: sticky epic rail (numbered, priority dot, story count).
//   - RIGHT: long-form document of the selected epic — header card +
//            included pages/modules + stories list. Stories show full
//            "As a / I want / so that" + acceptance signal + tags.
//
// Phase A renders inventory + epics + stories. Phase B will add a
// per-story task drill-in (tasks + subtasks + AC) when those land.
// ────────────────────────────────────────────────────────────────────

import { useMemo, useState } from 'react'

export default function BacklogView({
  backlog,
  briefTitle,
  isGenerating = false,
  generationStage = null, // 'inventory' | 'epics' | 'stories' | null
  onBackToBrief,
  onRegenerate,
  onSendToBoard,
}) {
  const epics = Array.isArray(backlog?.epics) ? backlog.epics : []
  const stories = Array.isArray(backlog?.stories) ? backlog.stories : []
  const inventory = backlog?.inventory || null
  const [activeEpicId, setActiveEpicId] = useState(epics[0]?.id || null)

  const storiesByEpic = useMemo(() => {
    const map = {}
    for (const s of stories) {
      const eid = s.epic_id || 'unassigned'
      if (!map[eid]) map[eid] = []
      map[eid].push(s)
    }
    return map
  }, [stories])

  const activeEpic = epics.find(e => e.id === activeEpicId) || epics[0]

  // Inventory chip totals for the header
  const counts = inventory ? {
    pages: inventory.pages?.length || 0,
    modules: inventory.modules?.length || 0,
    components: inventory.components?.length || 0,
    roles: inventory.roles?.length || 0,
    entities: inventory.entities?.length || 0,
    integrations: inventory.integrations?.length || 0,
  } : null

  return (
    <div className="bl-root">
      <BacklogStyles />

      <header className="bl-topbar">
        <div className="bl-topbar-left">
          <span className="bl-topbar-kicker">Implementation Backlog</span>
          <h1 className="bl-topbar-title">{briefTitle || backlog?.projectTitle || 'Untitled brief'}</h1>
        </div>
        <div className="bl-topbar-right">
          {isGenerating && (
            <div className="bl-topbar-status">
              <span className="bl-topbar-pulse" aria-hidden />
              {generationStage ? `Generating ${generationStage}` : 'Generating'}
            </div>
          )}
          {onBackToBrief && (
            <button type="button" className="bl-topbar-back" onClick={onBackToBrief}>
              Back to brief
            </button>
          )}
          {onSendToBoard && !isGenerating && stories.length > 0 && (
            <button type="button" className="bl-topbar-back" onClick={onSendToBoard}>
              Send to board
            </button>
          )}
          {onRegenerate && !isGenerating && (
            <button type="button" className="bl-topbar-regen" onClick={onRegenerate}>
              Regenerate
            </button>
          )}
        </div>
      </header>

      {counts && (
        <div className="bl-counts-strip">
          <CountChip label="Pages"        value={counts.pages}        tone="amber" />
          <CountChip label="Modules"      value={counts.modules}      tone="indigo" />
          <CountChip label="Components"   value={counts.components}   tone="slate" />
          <CountChip label="Roles"        value={counts.roles}        tone="emerald" />
          <CountChip label="Entities"     value={counts.entities}     tone="slate" />
          <CountChip label="Integrations" value={counts.integrations} tone="red" />
          <CountChip label="Epics"        value={epics.length}        tone="accent" />
          <CountChip label="Stories"      value={stories.length}      tone="accent" />
        </div>
      )}

      <div className="bl-layout">
        <aside className="bl-rail" aria-label="Epic rail">
          <div className="bl-rail-label">Epics</div>
          {epics.length === 0 && !isGenerating && (
            <div className="bl-rail-empty">No epics yet.</div>
          )}
          {epics.length === 0 && isGenerating && (
            <div className="bl-rail-empty">Generating epics…</div>
          )}
          <ul className="bl-rail-list">
            {epics.map((epic, i) => {
              const storyCount = storiesByEpic[epic.id]?.length || 0
              const isActive = activeEpic?.id === epic.id
              return (
                <li key={epic.id || i}>
                  <button
                    type="button"
                    onClick={() => setActiveEpicId(epic.id)}
                    className={`bl-rail-item ${isActive ? 'is-active' : ''}`}
                  >
                    <span className="bl-rail-num">{String(i + 1).padStart(2, '0')}</span>
                    <span className="bl-rail-name">{epic.name}</span>
                    <span className={`bl-prio-dot bl-prio-dot-${priorityTone(epic.priority)}`} title={epic.priority} />
                    {storyCount > 0 && <span className="bl-rail-count">{storyCount}</span>}
                  </button>
                </li>
              )
            })}
          </ul>
        </aside>

        <main className="bl-doc">
          {!activeEpic && !isGenerating && (
            <div className="bl-empty">
              <div className="bl-empty-title">No backlog yet</div>
              <div className="bl-empty-body">Generate one from the brief to see epics and stories here.</div>
            </div>
          )}
          {activeEpic && (
            <EpicPane
              epic={activeEpic}
              stories={storiesByEpic[activeEpic.id] || []}
              inventory={inventory}
            />
          )}
        </main>
      </div>
    </div>
  )
}

function CountChip({ label, value, tone }) {
  return (
    <div className={`bl-count bl-tone-${tone}`}>
      <span className="bl-count-value">{value}</span>
      <span className="bl-count-label">{label}</span>
    </div>
  )
}

function EpicPane({ epic, stories, inventory }) {
  const includedPages = (epic.included_pages || [])
    .map(id => inventory?.pages?.find(p => p.id === id))
    .filter(Boolean)
  const includedModules = (epic.included_modules || [])
    .map(id => inventory?.modules?.find(m => m.id === id))
    .filter(Boolean)

  return (
    <article className="bl-epic">
      <header className="bl-epic-head">
        <div className="bl-epic-meta">
          <h2 className="bl-epic-title">{epic.name}</h2>
          {epic.description && <p className="bl-epic-desc">{epic.description}</p>}
        </div>
        <div className="bl-epic-tags">
          <Tag label={epic.priority}  tone={priorityTone(epic.priority)}  prefix="Priority" />
          <Tag label={epic.complexity} tone="slate" prefix="Complexity" />
          {epic.lead_role && <Tag label={epic.lead_role} tone="indigo" prefix="Lead" />}
        </div>
      </header>

      {(includedPages.length > 0 || includedModules.length > 0) && (
        <div className="bl-epic-bundle">
          {includedPages.length > 0 && (
            <div className="bl-epic-bundle-block">
              <div className="bl-block-label">Pages in scope</div>
              <div className="bl-chip-row">
                {includedPages.map(p => (
                  <span key={p.id} className={`bl-chip ${p.assumed ? 'is-assumed' : ''}`} title={p.purpose}>
                    {p.name}
                    {p.assumed && <span className="bl-chip-flag">inferred</span>}
                  </span>
                ))}
              </div>
            </div>
          )}
          {includedModules.length > 0 && (
            <div className="bl-epic-bundle-block">
              <div className="bl-block-label">Modules in scope</div>
              <div className="bl-chip-row">
                {includedModules.map(m => (
                  <span key={m.id} className={`bl-chip ${m.assumed ? 'is-assumed' : ''}`} title={m.purpose}>
                    {m.name}
                    {m.assumed && <span className="bl-chip-flag">inferred</span>}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {(Array.isArray(epic.depends_on) && epic.depends_on.length > 0) || epic.priority_reason ? (
        <dl className="bl-epic-meta-grid">
          {epic.priority_reason && (
            <>
              <dt>Why this priority</dt>
              <dd>{epic.priority_reason}</dd>
            </>
          )}
          {Array.isArray(epic.depends_on) && epic.depends_on.length > 0 && (
            <>
              <dt>Depends on</dt>
              <dd className="bl-mono">{epic.depends_on.join(', ')}</dd>
            </>
          )}
          {Array.isArray(epic.suggested_labels) && epic.suggested_labels.length > 0 && (
            <>
              <dt>Labels</dt>
              <dd className="bl-tag-row">
                {epic.suggested_labels.map((l, i) => <span key={i} className="bl-chip bl-chip-soft">{l}</span>)}
              </dd>
            </>
          )}
        </dl>
      ) : null}

      <div className="bl-stories">
        <div className="bl-block-label bl-stories-label">User stories</div>
        {stories.length === 0 && (
          <div className="bl-stories-empty">No stories for this epic yet.</div>
        )}
        <ol className="bl-stories-list">
          {stories.map((s, i) => <StoryCard key={s.id || i} story={s} index={i} inventory={inventory} />)}
        </ol>
      </div>
    </article>
  )
}

function StoryCard({ story, index, inventory }) {
  const relatedPages = (story.related_pages || [])
    .map(id => inventory?.pages?.find(p => p.id === id))
    .filter(Boolean)
  return (
    <li className="bl-story">
      <div className="bl-story-num">{String(index + 1).padStart(2, '0')}</div>
      <div className="bl-story-body">
        <p className="bl-story-statement">
          <span className="bl-story-as">As {indefArticle(story.as)} </span>
          <strong>{story.as || 'user'}</strong>
          <span className="bl-story-as">, I want to </span>
          <strong>{story.want || 'do something'}</strong>
          {story.so_that && (
            <>
              <span className="bl-story-as">, so that </span>
              <strong>{story.so_that}</strong>
            </>
          )}
          .
        </p>
        {story.acceptance_signal && (
          <div className="bl-story-ac">
            <span className="bl-story-ac-label">Acceptance</span>
            <span>{story.acceptance_signal}</span>
          </div>
        )}
        <div className="bl-story-tags">
          {story.priority   && <Tag label={story.priority}   tone={priorityTone(story.priority)}  prefix="Priority" />}
          {story.complexity && <Tag label={story.complexity} tone="slate" prefix="Complexity" />}
          {Array.isArray(story.labels) && story.labels.map((l, i) => (
            <span key={i} className="bl-chip bl-chip-soft">{l}</span>
          ))}
        </div>
        {relatedPages.length > 0 && (
          <div className="bl-story-pages">
            <span className="bl-story-pages-label">Touches:</span>
            {relatedPages.map(p => <span key={p.id} className="bl-mono bl-story-page">{p.name}</span>)}
          </div>
        )}
      </div>
    </li>
  )
}

function Tag({ label, tone, prefix }) {
  if (!label) return null
  return (
    <span className={`bl-tag bl-tone-${tone}`}>
      {prefix && <span className="bl-tag-prefix">{prefix}</span>}
      <span className="bl-tag-value">{label}</span>
    </span>
  )
}

function priorityTone(p) {
  const v = String(p || '').toLowerCase()
  if (v === 'critical') return 'red'
  if (v === 'high')     return 'amber'
  if (v === 'medium')   return 'slate'
  return 'emerald'
}

function indefArticle(word) {
  if (!word) return 'a '
  return /^[aeiou]/i.test(word.trim()) ? 'an ' : 'a '
}

// ────────────────────────────────────────────────────────────────────
// Styles — extends the V3 visual language with backlog-specific
// classes (prefix `bl-`). Reuses Fraunces/Inter/JetBrains Mono and
// the slate + amber palette already loaded by BriefV3View.
// ────────────────────────────────────────────────────────────────────
function BacklogStyles() {
  return (
    <style>{`
      .bl-root {
        background: #FAF7F2;
        color: #1A1A1A;
        font-family: 'Inter', -apple-system, sans-serif;
        min-height: 100vh;
      }

      .bl-topbar {
        position: sticky; top: 0; z-index: 30;
        background: #FAF7F2;
        border-bottom: 1px solid #E2DCCF;
        backdrop-filter: blur(8px);
        padding: 18px 32px;
        display: flex; align-items: center; justify-content: space-between; gap: 24px;
      }
      .bl-topbar-left { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
      .bl-topbar-kicker {
        font: 600 10px 'JetBrains Mono', monospace;
        letter-spacing: 0.16em; text-transform: uppercase;
        color: #8A8580;
      }
      .bl-topbar-title {
        margin: 0;
        font: 700 22px/1.15 'Fraunces', serif;
        letter-spacing: -0.01em;
        color: #1A1A1A;
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      }
      .bl-topbar-right { display: flex; align-items: center; gap: 12px; }
      .bl-topbar-status {
        display: inline-flex; align-items: center; gap: 6px;
        font: 600 11px 'JetBrains Mono', monospace;
        letter-spacing: 0.08em; text-transform: uppercase;
        color: #C97B2F;
      }
      .bl-topbar-pulse {
        width: 8px; height: 8px; border-radius: 50%;
        background: #C97B2F;
        animation: blpulse 1.4s ease-in-out infinite;
      }
      @keyframes blpulse {
        0%, 100% { opacity: 1; transform: scale(1); }
        50%      { opacity: 0.35; transform: scale(0.7); }
      }
      .bl-topbar-back, .bl-topbar-regen {
        padding: 9px 18px;
        background: transparent;
        color: #1A1A1A;
        border: 1px solid #E2DCCF;
        border-radius: 999px;
        font: 700 12px 'Inter', sans-serif;
        letter-spacing: 0.02em;
        cursor: pointer;
        transition: background 0.15s;
      }
      .bl-topbar-back:hover { background: #F3EFE7; }
      .bl-topbar-regen {
        background: #1A1A1A; color: #FAF7F2; border-color: #1A1A1A;
      }
      .bl-topbar-regen:hover { background: #6B3F12; border-color: #6B3F12; }

      .bl-counts-strip {
        max-width: 1240px; margin: 0 auto;
        padding: 16px 32px 0;
        display: grid; grid-template-columns: repeat(8, 1fr);
        gap: 10px;
      }
      @media (max-width: 980px) {
        .bl-counts-strip { grid-template-columns: repeat(4, 1fr); padding: 16px 20px 0; }
      }
      @media (max-width: 600px) {
        .bl-counts-strip { grid-template-columns: repeat(2, 1fr); }
      }
      .bl-count {
        padding: 10px 12px;
        background: #F3EFE7;
        border: 1px solid #E2DCCF;
        border-top: 3px solid currentColor;
        border-radius: 10px;
        display: flex; flex-direction: column; align-items: flex-start; gap: 1px;
      }
      .bl-count-value {
        font: 700 22px 'Fraunces', serif;
        font-variant-numeric: oldstyle-nums;
        color: #1A1A1A;
        letter-spacing: -0.02em;
      }
      .bl-count-label {
        font: 700 9px 'JetBrains Mono', monospace;
        letter-spacing: 0.14em; text-transform: uppercase;
        color: #8A8580;
      }
      .bl-tone-amber   { color: #B26B0F; }
      .bl-tone-indigo  { color: #3B4990; }
      .bl-tone-slate   { color: #475766; }
      .bl-tone-emerald { color: #2F7D4F; }
      .bl-tone-red     { color: #B43838; }
      .bl-tone-accent  { color: #C97B2F; }

      .bl-layout {
        max-width: 1240px; margin: 0 auto;
        padding: 24px 32px 80px;
        display: grid;
        grid-template-columns: 260px minmax(0, 1fr);
        gap: 48px;
      }
      @media (max-width: 980px) {
        .bl-layout { grid-template-columns: 1fr; padding: 24px 20px 80px; gap: 16px; }
      }

      .bl-rail {
        position: sticky; top: 100px;
        align-self: start;
        max-height: calc(100vh - 120px);
        overflow-y: auto;
      }
      @media (max-width: 980px) {
        .bl-rail { position: static; max-height: none; }
      }
      .bl-rail-label {
        font: 700 10px 'JetBrains Mono', monospace;
        letter-spacing: 0.16em; text-transform: uppercase;
        color: #8A8580;
        margin-bottom: 12px;
      }
      .bl-rail-list { list-style: none; padding: 0; margin: 0; }
      .bl-rail-empty {
        font: 500 13px 'Inter', sans-serif;
        color: #8A8580;
        font-style: italic;
        padding: 8px 0;
      }
      .bl-rail-item {
        display: grid;
        grid-template-columns: 30px 1fr auto auto;
        align-items: center; gap: 8px;
        width: 100%;
        background: none; border: none;
        text-align: left;
        padding: 8px 10px;
        margin-bottom: 2px;
        border-radius: 8px;
        cursor: pointer;
        color: #3F3F3F;
        transition: background 0.12s, color 0.12s;
      }
      .bl-rail-item:hover { background: #F3EFE7; color: #1A1A1A; }
      .bl-rail-item.is-active {
        background: #1A1A1A;
        color: #FAF7F2;
      }
      .bl-rail-num {
        font: 600 10px 'JetBrains Mono', monospace;
        color: #8A8580;
      }
      .bl-rail-item.is-active .bl-rail-num { color: #94A3B8; }
      .bl-rail-name {
        font: 500 13px/1.3 'Inter', sans-serif;
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      }
      .bl-rail-item.is-active .bl-rail-name { font-weight: 700; }
      .bl-prio-dot {
        width: 8px; height: 8px; border-radius: 50%;
        background: currentColor;
      }
      .bl-rail-count {
        font: 600 10px 'JetBrains Mono', monospace;
        padding: 2px 6px;
        background: #E2DCCF;
        color: #475766;
        border-radius: 999px;
      }
      .bl-rail-item.is-active .bl-rail-count {
        background: #3F3F3F;
        color: #FAF7F2;
      }

      .bl-doc { min-width: 0; }
      .bl-empty {
        padding: 60px 0;
        text-align: center;
        color: #8A8580;
      }
      .bl-empty-title { font: 700 18px 'Fraunces', serif; color: #475766; margin-bottom: 6px; }
      .bl-empty-body { font: 500 14px 'Inter', sans-serif; }

      /* ── Epic pane ──────────────────────────────────────────── */
      .bl-epic {
        display: flex; flex-direction: column; gap: 24px;
      }
      .bl-epic-head {
        display: flex; flex-direction: column; gap: 14px;
        padding-bottom: 20px;
        border-bottom: 1px solid #EFEAE0;
      }
      .bl-epic-meta { display: flex; flex-direction: column; gap: 6px; }
      .bl-epic-title {
        margin: 0;
        font: 700 36px/1.1 'Fraunces', serif;
        letter-spacing: -0.02em;
        color: #1A1A1A;
      }
      .bl-epic-desc {
        margin: 0;
        font: 400 15px/1.5 'Inter', sans-serif;
        color: #8A8580;
        max-width: 60ch;
      }
      .bl-epic-tags { display: flex; flex-wrap: wrap; gap: 8px; }

      .bl-tag {
        display: inline-flex; align-items: center; gap: 6px;
        padding: 5px 11px;
        background: #F3EFE7;
        border: 1px solid #E2DCCF;
        border-radius: 999px;
        font: 600 11px 'Inter', sans-serif;
        color: currentColor;
      }
      .bl-tag-prefix {
        font: 700 9px 'JetBrains Mono', monospace;
        letter-spacing: 0.14em; text-transform: uppercase;
        color: #8A8580;
      }
      .bl-tag-value { color: #1A1A1A; font-weight: 700; }
      .bl-tag.bl-tone-red     { background: rgba(180,56,56,0.10); border-color: rgba(180,56,56,0.35); }
      .bl-tag.bl-tone-amber   { background: rgba(178,107,15,0.10); border-color: rgba(178,107,15,0.35); }
      .bl-tag.bl-tone-emerald { background: rgba(47,125,79,0.10); border-color: rgba(47,125,79,0.35); }
      .bl-tag.bl-tone-indigo  { background: rgba(59,73,144,0.08); border-color: rgba(59,73,144,0.30); }
      .bl-tag.bl-tone-slate   { background: rgba(71,87,102,0.08); border-color: rgba(71,87,102,0.25); }

      .bl-epic-bundle {
        display: grid; grid-template-columns: 1fr 1fr; gap: 16px;
      }
      @media (max-width: 700px) { .bl-epic-bundle { grid-template-columns: 1fr; } }
      .bl-epic-bundle-block {
        padding: 14px 16px;
        background: #F3EFE7;
        border: 1px solid #E2DCCF;
        border-radius: 10px;
        display: flex; flex-direction: column; gap: 10px;
      }
      .bl-block-label {
        font: 700 10px 'JetBrains Mono', monospace;
        letter-spacing: 0.14em; text-transform: uppercase;
        color: #475766;
      }
      .bl-chip-row { display: flex; flex-wrap: wrap; gap: 6px; }
      .bl-chip {
        display: inline-flex; align-items: center; gap: 6px;
        padding: 4px 10px;
        background: #FAF7F2;
        border: 1px solid #E2DCCF;
        border-radius: 6px;
        font: 500 12px 'Inter', sans-serif;
        color: #1A1A1A;
      }
      .bl-chip-soft {
        background: rgba(201,123,47,0.10);
        border-color: rgba(201,123,47,0.30);
        color: #6B3F12;
        font-weight: 600;
      }
      .bl-chip.is-assumed { border-style: dashed; color: #8A8580; }
      .bl-chip-flag {
        font: 700 8px 'JetBrains Mono', monospace;
        letter-spacing: 0.14em; text-transform: uppercase;
        color: #B26B0F;
      }

      .bl-epic-meta-grid {
        margin: 0;
        display: grid; grid-template-columns: 140px 1fr;
        column-gap: 16px; row-gap: 8px;
        padding: 14px 16px;
        background: #FAF7F2;
        border: 1px solid #EFEAE0;
        border-radius: 10px;
      }
      .bl-epic-meta-grid dt {
        font: 700 9px 'JetBrains Mono', monospace;
        letter-spacing: 0.14em; text-transform: uppercase;
        color: #8A8580;
        padding-top: 2px;
      }
      .bl-epic-meta-grid dd {
        margin: 0;
        font: 500 13px 'Inter', sans-serif;
        color: #1A1A1A;
      }
      .bl-mono {
        font: 500 12px 'JetBrains Mono', monospace;
        color: #475766;
      }
      .bl-tag-row { display: flex; flex-wrap: wrap; gap: 6px; }

      /* ── Stories ────────────────────────────────────────────── */
      .bl-stories { display: flex; flex-direction: column; gap: 12px; }
      .bl-stories-label { margin-bottom: -2px; }
      .bl-stories-empty {
        padding: 16px;
        background: #F3EFE7;
        border: 1px dashed #E2DCCF;
        border-radius: 8px;
        font: 500 13px 'Inter', sans-serif;
        color: #8A8580;
        font-style: italic;
      }
      .bl-stories-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }

      .bl-story {
        display: grid;
        grid-template-columns: 44px 1fr;
        gap: 14px;
        padding: 16px 18px;
        background: #F3EFE7;
        border: 1px solid #E2DCCF;
        border-left: 3px solid #C97B2F;
        border-radius: 10px;
      }
      .bl-story-num {
        font: 400 22px/1 'Fraunces', serif;
        color: #C97B2F;
      }
      .bl-story-body { display: flex; flex-direction: column; gap: 10px; min-width: 0; }
      .bl-story-statement {
        margin: 0;
        font: 500 15px/1.55 'Fraunces', serif;
        color: #1A1A1A;
      }
      .bl-story-as { color: #8A8580; font-style: italic; font-weight: 400; }
      .bl-story-statement strong { font-weight: 700; color: #1A1A1A; }
      .bl-story-ac {
        display: grid; grid-template-columns: 86px 1fr; gap: 10px;
        padding: 10px 12px;
        background: rgba(47,125,79,0.07);
        border-left: 3px solid #2F7D4F;
        border-radius: 4px;
      }
      .bl-story-ac-label {
        font: 700 9px 'JetBrains Mono', monospace;
        letter-spacing: 0.14em; text-transform: uppercase;
        color: #2F7D4F;
        padding-top: 2px;
      }
      .bl-story-ac > span:last-child {
        font: 500 13px/1.5 'Inter', sans-serif;
        color: #1A1A1A;
      }
      .bl-story-tags { display: flex; flex-wrap: wrap; gap: 6px; }
      .bl-story-pages {
        display: flex; flex-wrap: wrap; align-items: center; gap: 8px;
        padding-top: 8px;
        border-top: 1px solid #E2DCCF;
      }
      .bl-story-pages-label {
        font: 700 9px 'JetBrains Mono', monospace;
        letter-spacing: 0.14em; text-transform: uppercase;
        color: #8A8580;
      }
      .bl-story-page {
        padding: 2px 8px;
        background: #FAF7F2;
        border: 1px solid #E2DCCF;
        border-radius: 4px;
      }
    `}</style>
  )
}
