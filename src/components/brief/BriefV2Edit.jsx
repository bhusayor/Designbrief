// ────────────────────────────────────────────────────────────────────
// BriefV2Edit — per-shape inline editors for brief cards.
//
// One editor component per item shape. Each takes:
//   value       — current item.content
//   onChange    — fires with the new content on every keystroke /
//                 row change. Parent debounces persistence.
//
// Friendly editors for the common simple shapes (text, list,
// numbered_list, moodboard, roles, levels). Complex array-of-object
// shapes (rows, badged_list, journey, competitors, inventory) fall
// back to a JSON textarea with parse-on-blur validation — building
// a row editor per shape would 5× the scope and these shapes are
// edited rarely in practice.
//
// All editors share the same outer form chrome — see BriefCardEditor
// in BriefV2View.jsx for the Cancel/Save buttons.
// ────────────────────────────────────────────────────────────────────

import { useState, useEffect } from 'react'
import { PlusIcon, TrashIcon } from '@heroicons/react/24/outline'

// ────────────────────────────────────────────────────────────────────
// Shape registry — the BriefCardEditor picks the editor by shape.
// ────────────────────────────────────────────────────────────────────
export function EditorForShape({ shape, itemKey, value, onChange }) {
  switch (shape) {
    case 'text':           return <TextEditor value={value} onChange={onChange} />
    case 'list':           return <ListEditor value={value} onChange={onChange} />
    case 'numbered_list':  return <ListEditor value={value} onChange={onChange} />
    case 'roles':          return <RolesEditor value={value} onChange={onChange} />
    case 'levels':         return <LevelsEditor value={value} onChange={onChange} />
    case 'moodboard':      return <MoodboardEditor value={value} onChange={onChange} />
    // Complex shapes get the JSON fallback for now.
    case 'rows':
    case 'badged_list':
    case 'journey':
    case 'competitors':
    case 'inventory':
    default:               return <JsonEditor value={value} onChange={onChange} />
  }
}

// ── Plain text ─────────────────────────────────────────────────────
function TextEditor({ value, onChange }) {
  return (
    <textarea
      className="briefv2-edit-textarea"
      value={String(value ?? '')}
      onChange={e => onChange(e.target.value)}
      rows={4}
      autoFocus
    />
  )
}

// ── List of strings (deliverables, scope_constraints, brand_personality, questions) ──
function ListEditor({ value, onChange }) {
  const list = Array.isArray(value) ? value : []
  const text = list.map(x => typeof x === 'string' ? x : safeStr(x)).join('\n')
  return (
    <>
      <div className="briefv2-edit-hint">One entry per line.</div>
      <textarea
        className="briefv2-edit-textarea"
        value={text}
        onChange={e => {
          const lines = e.target.value.split('\n').map(l => l.trim()).filter(Boolean)
          onChange(lines)
        }}
        rows={Math.max(4, list.length + 1)}
        autoFocus
      />
    </>
  )
}

// ── Colour palette (roles) ─────────────────────────────────────────
function RolesEditor({ value, onChange }) {
  const v = value && typeof value === 'object' ? value : {}
  const swatches = Array.isArray(v.swatches) ? v.swatches : []
  const light = v.light || {}
  const dark  = v.dark  || {}
  const avoid = v.avoid || ''

  function patch(next) { onChange({ ...v, ...next }) }
  function patchSwatch(idx, key, val) {
    const nextSwatches = swatches.map((s, i) => i === idx ? { ...s, [key]: val } : s)
    patch({ swatches: nextSwatches })
  }
  function removeSwatch(idx) {
    patch({ swatches: swatches.filter((_, i) => i !== idx) })
  }
  function addSwatch() {
    patch({ swatches: [...swatches, { role: 'Custom', name: '', hex: '#000000', intent: '' }] })
  }

  return (
    <div className="briefv2-edit-stack">
      <SectionLabel>Palette swatches</SectionLabel>
      {swatches.map((s, i) => (
        <div key={i} className="briefv2-edit-swatch-row">
          <input
            type="color"
            value={isHex(s.hex) ? s.hex : '#000000'}
            onChange={e => patchSwatch(i, 'hex', e.target.value.toUpperCase())}
            className="briefv2-edit-color"
            aria-label={`Colour for ${s.role || s.name}`}
          />
          <input
            type="text"
            value={s.role || ''}
            onChange={e => patchSwatch(i, 'role', e.target.value)}
            placeholder="Role"
            className="briefv2-edit-input briefv2-edit-input-narrow"
          />
          <input
            type="text"
            value={s.name || ''}
            onChange={e => patchSwatch(i, 'name', e.target.value)}
            placeholder="Name"
            className="briefv2-edit-input"
          />
          <input
            type="text"
            value={s.hex || ''}
            onChange={e => patchSwatch(i, 'hex', e.target.value)}
            placeholder="#RRGGBB"
            className="briefv2-edit-input briefv2-edit-input-mono"
          />
          <button type="button" onClick={() => removeSwatch(i)} className="briefv2-edit-icon-btn" title="Remove">
            <TrashIcon style={{ width: 14, height: 14 }} />
          </button>
        </div>
      ))}
      <button type="button" onClick={addSwatch} className="briefv2-edit-add">
        <PlusIcon style={{ width: 13, height: 13 }} /> Add swatch
      </button>

      <SectionLabel>Light theme tokens</SectionLabel>
      <TokenMapEditor map={light} onChange={next => patch({ light: next })} />

      <SectionLabel>Dark theme tokens</SectionLabel>
      <TokenMapEditor map={dark} onChange={next => patch({ dark: next })} />

      <SectionLabel>Avoid</SectionLabel>
      <textarea
        className="briefv2-edit-textarea"
        value={avoid}
        onChange={e => patch({ avoid: e.target.value })}
        rows={2}
      />
    </div>
  )
}

function TokenMapEditor({ map, onChange }) {
  const KEYS = ['background', 'surface', 'text', 'muted', 'border', 'primary', 'onPrimary']
  return (
    <div className="briefv2-edit-grid-3">
      {KEYS.map(k => (
        <label key={k} className="briefv2-edit-field">
          <span className="briefv2-edit-field-label">{k}</span>
          <div className="briefv2-edit-token-row">
            <input
              type="color"
              value={isHex(map[k]) ? map[k] : '#000000'}
              onChange={e => onChange({ ...map, [k]: e.target.value.toUpperCase() })}
              className="briefv2-edit-color-small"
            />
            <input
              type="text"
              value={map[k] || ''}
              onChange={e => onChange({ ...map, [k]: e.target.value })}
              placeholder="#RRGGBB"
              className="briefv2-edit-input briefv2-edit-input-mono"
            />
          </div>
        </label>
      ))}
    </div>
  )
}

// ── Typography system (levels) ─────────────────────────────────────
function LevelsEditor({ value, onChange }) {
  const v = value && typeof value === 'object' ? value : {}
  function patch(next) { onChange({ ...v, ...next }) }
  return (
    <div className="briefv2-edit-stack">
      {['display', 'body', 'label'].map(role => (
        <FamilyEditor
          key={role}
          role={role}
          font={v[role] || {}}
          onChange={(next) => patch({ [role]: next })}
        />
      ))}

      <SectionLabel>Avoid</SectionLabel>
      <textarea
        className="briefv2-edit-textarea"
        value={v.avoid || ''}
        onChange={e => patch({ avoid: e.target.value })}
        rows={2}
      />

      <details className="briefv2-edit-details">
        <summary>Edit type scale as JSON</summary>
        <JsonEditor value={v.scale || {}} onChange={(next) => patch({ scale: next })} />
      </details>
    </div>
  )
}

function FamilyEditor({ role, font, onChange }) {
  function patch(next) { onChange({ ...font, ...next }) }
  return (
    <div className="briefv2-edit-card">
      <div className="briefv2-edit-field-label briefv2-edit-field-label-loud">{role.toUpperCase()}</div>
      <div className="briefv2-edit-grid-2">
        <label className="briefv2-edit-field">
          <span className="briefv2-edit-field-label">Family</span>
          <input
            type="text"
            value={font.family || ''}
            onChange={e => patch({ family: e.target.value })}
            className="briefv2-edit-input"
          />
        </label>
        <label className="briefv2-edit-field">
          <span className="briefv2-edit-field-label">Weights (comma-sep)</span>
          <input
            type="text"
            value={(font.weights || []).join(', ')}
            onChange={e => {
              const list = e.target.value.split(',').map(x => parseInt(x.trim(), 10)).filter(Number.isFinite)
              patch({ weights: list })
            }}
            className="briefv2-edit-input"
          />
        </label>
        <label className="briefv2-edit-field">
          <span className="briefv2-edit-field-label">Tracking</span>
          <input
            type="text"
            value={font.tracking || ''}
            onChange={e => patch({ tracking: e.target.value })}
            placeholder="e.g. -0.02em"
            className="briefv2-edit-input"
          />
        </label>
        <label className="briefv2-edit-field">
          <span className="briefv2-edit-field-label">Notes</span>
          <input
            type="text"
            value={font.notes || ''}
            onChange={e => patch({ notes: e.target.value })}
            className="briefv2-edit-input"
          />
        </label>
      </div>
    </div>
  )
}

// ── Moodboard ──────────────────────────────────────────────────────
function MoodboardEditor({ value, onChange }) {
  // Back-compat: old string shape gets promoted to the object shape.
  const v = (value && typeof value === 'object') ? value : { summary: String(value || ''), references: [] }
  const refs = Array.isArray(v.references) ? v.references : []

  function patch(next) { onChange({ ...v, ...next }) }
  function patchRef(idx, key, val) {
    patch({ references: refs.map((r, i) => i === idx ? { ...r, [key]: val } : r) })
  }
  function removeRef(idx) { patch({ references: refs.filter((_, i) => i !== idx) }) }
  function addRef() { patch({ references: [...refs, { label: '', type: 'Site', url: '', note: '' }] }) }

  return (
    <div className="briefv2-edit-stack">
      <SectionLabel>Summary</SectionLabel>
      <textarea
        className="briefv2-edit-textarea"
        value={v.summary || ''}
        onChange={e => patch({ summary: e.target.value })}
        rows={3}
      />

      <SectionLabel>References</SectionLabel>
      {refs.map((r, i) => (
        <div key={i} className="briefv2-edit-card">
          <div className="briefv2-edit-grid-2">
            <label className="briefv2-edit-field">
              <span className="briefv2-edit-field-label">Label</span>
              <input type="text" value={r.label || ''} onChange={e => patchRef(i, 'label', e.target.value)} className="briefv2-edit-input" />
            </label>
            <label className="briefv2-edit-field">
              <span className="briefv2-edit-field-label">Type</span>
              <select value={r.type || 'Site'} onChange={e => patchRef(i, 'type', e.target.value)} className="briefv2-edit-input">
                {['Site', 'Product', 'Designer', 'Article', 'Pattern'].map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>
            <label className="briefv2-edit-field briefv2-edit-field-span">
              <span className="briefv2-edit-field-label">URL</span>
              <input type="url" value={r.url || ''} onChange={e => patchRef(i, 'url', e.target.value)} className="briefv2-edit-input briefv2-edit-input-mono" />
            </label>
            <label className="briefv2-edit-field briefv2-edit-field-span">
              <span className="briefv2-edit-field-label">Note</span>
              <input type="text" value={r.note || ''} onChange={e => patchRef(i, 'note', e.target.value)} className="briefv2-edit-input" />
            </label>
          </div>
          <button type="button" onClick={() => removeRef(i)} className="briefv2-edit-icon-btn briefv2-edit-icon-btn-trail" title="Remove">
            <TrashIcon style={{ width: 14, height: 14 }} /> Remove
          </button>
        </div>
      ))}
      <button type="button" onClick={addRef} className="briefv2-edit-add">
        <PlusIcon style={{ width: 13, height: 13 }} /> Add reference
      </button>

      <SectionLabel>Avoid</SectionLabel>
      <textarea
        className="briefv2-edit-textarea"
        value={v.avoid || ''}
        onChange={e => patch({ avoid: e.target.value })}
        rows={2}
      />
    </div>
  )
}

// ── JSON fallback for the array-of-object shapes ───────────────────
function JsonEditor({ value, onChange }) {
  const [text, setText] = useState(() => {
    try { return JSON.stringify(value ?? null, null, 2) } catch { return '' }
  })
  const [parseError, setParseError] = useState('')

  // Keep the textarea in sync if the parent swaps the value
  // (e.g. on cancel + reopen).
  useEffect(() => {
    try { setText(JSON.stringify(value ?? null, null, 2)) } catch {}
  }, [value])

  function tryParse(raw) {
    setText(raw)
    try {
      const parsed = JSON.parse(raw)
      setParseError('')
      onChange(parsed)
    } catch (e) {
      setParseError(e?.message || 'Invalid JSON')
    }
  }

  return (
    <>
      <div className="briefv2-edit-hint">
        Edit as JSON. Click Save once it parses cleanly.
      </div>
      <textarea
        className="briefv2-edit-textarea briefv2-edit-textarea-mono"
        value={text}
        onChange={e => tryParse(e.target.value)}
        rows={Math.max(8, Math.min(20, (text.match(/\n/g) || []).length + 2))}
        spellCheck={false}
      />
      {parseError && <div className="briefv2-edit-error">JSON error: {parseError}</div>}
    </>
  )
}

// ── Helpers ────────────────────────────────────────────────────────
function SectionLabel({ children }) {
  return <div className="briefv2-edit-section-label">{children}</div>
}

function isHex(s) { return typeof s === 'string' && /^#[0-9A-Fa-f]{6}$/.test(s.trim()) }

function safeStr(o) { try { return JSON.stringify(o) } catch { return String(o) } }
