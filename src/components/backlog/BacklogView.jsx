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
import './backlog.css'

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

