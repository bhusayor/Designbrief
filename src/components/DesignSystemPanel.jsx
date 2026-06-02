import { useState, useEffect, useContext } from 'react'
import { createPortal } from 'react-dom'
import {
  XMarkIcon,
  SwatchIcon,
  ArrowRightIcon,
  PlusIcon,
  Squares2X2Icon,
  CursorArrowRaysIcon,
  SparklesIcon,
  Square3Stack3DIcon,
  ChatBubbleLeftRightIcon,
  PhotoIcon,
  BoltIcon,
  CubeIcon,
} from '@heroicons/react/24/outline'
import AppContext from '../context/AppContext'
import { supabase } from '../lib/supabase'
import {
  DEFAULT_DESIGN_SYSTEM,
  dbRowToDesignSystem,
  designSystemToDbRow,
} from '../lib/designSystem'

// ────────────────────────────────────────────────────────────────────
// DesignSystemPanel — modal that captures the project's design tokens
// and saves them to the design_systems table (one row per project).
//
// Phase 1 ships three sections: Colors, Typography, Buttons. Phase 2
// adds Icons / Spacing / Brand Voice / Imagery / Animation / Shadows.
// Phase 3 threads designSystemToContext(ds) into the system prompts
// of translateBrief / buildSection / chatRefinement / enhanceDescription
// so the saved system actually drives AI output.
//
// Portalled to document.body so we escape any ancestor's containing
// block (same gotcha that made AIBuilder leak the sidebar through).
// ────────────────────────────────────────────────────────────────────

// Curated Google Fonts list — the ones designers actually reach for.
// Used by Typography's combobox; type-to-filter narrows the list.
const FONT_CATALOG = {
  serif: [
    'Fraunces', 'Playfair Display', 'Cormorant Garamond', 'Lora',
    'EB Garamond', 'Libre Baskerville', 'Merriweather', 'Bodoni Moda',
    'PT Serif', 'Source Serif Pro', 'Crimson Pro', 'Spectral',
  ],
  sans: [
    'Inter', 'DM Sans', 'Space Grotesk', 'Plus Jakarta Sans', 'Manrope',
    'Outfit', 'Satoshi', 'Geist', 'Work Sans', 'Lato', 'Mulish',
    'Open Sans', 'Nunito', 'Poppins', 'Rubik', 'Sora', 'Public Sans',
  ],
  display: [
    'Clash Display', 'Anybody', 'Big Shoulders Display', 'Bricolage Grotesque',
    'Rajdhani', 'Bebas Neue', 'Archivo Black', 'Anton',
  ],
  mono: [
    'JetBrains Mono', 'Space Mono', 'IBM Plex Mono', 'DM Mono', 'Fira Code',
  ],
}
const FONT_LIST = [
  ...FONT_CATALOG.sans,
  ...FONT_CATALOG.serif,
  ...FONT_CATALOG.display,
  ...FONT_CATALOG.mono,
]

// Inject a <link> tag for the chosen Google Font so the live preview
// renders in the actual face + weights. Re-renders update the href so
// adding a weight pulls down that file. One tag per font keeps the
// document head clean even when the user picks many fonts in a
// session.
function useGoogleFont(family, weights) {
  useEffect(() => {
    if (!family) return
    // Skip custom / non-Google fonts the user may have typed manually.
    if (!FONT_LIST.includes(family)) return
    const id = 'gf-' + family.replace(/[^a-z0-9]/gi, '-').toLowerCase()
    const wList = (weights && weights.length ? weights : ['400', '700']).join(';')
    const href = `https://fonts.googleapis.com/css2?family=${family.replace(/ /g, '+')}:wght@${wList}&display=swap`
    let link = document.getElementById(id)
    if (!link) {
      link = document.createElement('link')
      link.id = id
      link.rel = 'stylesheet'
      document.head.appendChild(link)
    }
    if (link.href !== href) link.href = href
  }, [family, weights?.join(',')]) // eslint-disable-line react-hooks/exhaustive-deps
}

const SECTIONS = [
  { id: 'colors',     label: 'Colors',      Icon: SwatchIcon },
  { id: 'typography', label: 'Typography',  Icon: Squares2X2Icon },
  { id: 'buttons',    label: 'Buttons',     Icon: CursorArrowRaysIcon },
  { id: 'icons',      label: 'Icons',       Icon: SparklesIcon },
  { id: 'spacing',    label: 'Spacing',     Icon: Square3Stack3DIcon },
  { id: 'voice',      label: 'Brand voice', Icon: ChatBubbleLeftRightIcon },
  { id: 'imagery',    label: 'Imagery',     Icon: PhotoIcon },
  { id: 'animation',  label: 'Animation',   Icon: BoltIcon },
  { id: 'shadows',    label: 'Shadows',     Icon: CubeIcon },
]

export default function DesignSystemPanel({
  isOpen,
  onClose,
  onSkip,
  projectId,
  workspaceId,
}) {
  const { showToast, authUser } = useContext(AppContext)

  const [ds, setDs] = useState(DEFAULT_DESIGN_SYSTEM)
  const [activeSection, setActiveSection] = useState('colors')
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)

  // Load existing design system on open.
  useEffect(() => {
    if (!isOpen || !projectId) return
    let cancelled = false
    setIsLoading(true)
    ;(async () => {
      const { data, error } = await supabase
        .from('design_systems')
        .select('*')
        .eq('project_id', projectId)
        .maybeSingle()
      if (cancelled) return
      if (error && error.code !== 'PGRST116') {
        // PGRST116 = no row found; that's expected for first time
        if (error.code === '42P01') {
          showToast?.('Design system table not set up — run supabase/design-system.sql.', 'error')
        } else {
          console.warn('[design-system] load failed', error)
        }
      }
      setDs(data ? dbRowToDesignSystem(data) : DEFAULT_DESIGN_SYSTEM)
      setHasChanges(false)
      setIsLoading(false)
    })()
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, projectId])

  function update(key, value) {
    setDs(prev => ({ ...prev, [key]: value }))
    setHasChanges(true)
  }

  async function handleSave() {
    if (!projectId) {
      showToast?.('Open a project first.', 'error')
      return
    }
    if (!authUser?.id) {
      showToast?.('Sign in required.', 'error')
      return
    }
    setIsSaving(true)
    try {
      const row = designSystemToDbRow(ds, projectId, workspaceId, authUser.id)
      const { error } = await supabase
        .from('design_systems')
        .upsert(row, { onConflict: 'project_id' })
      if (error) throw error
      setHasChanges(false)
      showToast?.('Design system saved', 'success')
      onClose?.()
    } catch (e) {
      console.error('[design-system] save failed', e)
      const msg =
        e?.code === '42P01'
          ? 'Design system table not set up — run supabase/design-system.sql.'
          : (e?.message || 'Could not save. Try again.')
      showToast?.(msg, 'error')
    } finally {
      setIsSaving(false)
    }
  }

  function handleSkip() {
    onSkip?.()
    onClose?.()
  }

  if (!isOpen) return null

  return createPortal((
    <div onClick={onClose} style={overlayStyle}>
      <div onClick={e => e.stopPropagation()} style={modalStyle}>
        {/* Header */}
        <div style={headerStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <span style={{
              width: 32, height: 32, borderRadius: 9,
              background: 'linear-gradient(135deg, #8B5CF6, #6366F1)',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              <SwatchIcon style={{ width: 16, height: 16, color: 'white' }} />
            </span>
            <div style={{ minWidth: 0 }}>
              <div style={{
                fontFamily: 'var(--font-sans)', fontWeight: 800, fontSize: 15,
                color: 'var(--color-text)', letterSpacing: '-0.01em',
              }}>
                Design System
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--color-text-muted)' }}>
                The source of truth for every AI generation in this project
              </div>
            </div>
          </div>
          <button onClick={onClose} style={iconBtn} aria-label="Close">
            <XMarkIcon style={{ width: 16, height: 16 }} />
          </button>
        </div>

        {/* Body */}
        <div style={bodyStyle}>
          {/* Left rail — section nav */}
          <aside style={navStyle}>
            {SECTIONS.map(s => {
              const isActive = s.id === activeSection
              return (
                <button
                  key={s.id}
                  onClick={() => setActiveSection(s.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    width: '100%', padding: '10px 12px',
                    background: isActive ? 'rgba(139,92,246,0.10)' : 'transparent',
                    border: 'none',
                    borderRadius: 9,
                    color: isActive ? 'var(--color-accent)' : 'var(--color-text-soft)',
                    cursor: 'pointer',
                    fontFamily: 'var(--font-sans)',
                    fontSize: 13, fontWeight: isActive ? 700 : 500,
                    textAlign: 'left',
                    marginBottom: 2,
                  }}
                >
                  <s.Icon style={{ width: 15, height: 15 }} />
                  {s.label}
                </button>
              )
            })}
          </aside>

          {/* Content — active section */}
          <main style={contentStyle}>
            {isLoading ? <SectionLoading /> : (() => {
              switch (activeSection) {
                case 'colors':     return <ColorsSection ds={ds} update={update} />
                case 'typography': return <TypographySection ds={ds} update={update} />
                case 'buttons':    return <ButtonsSection ds={ds} update={update} />
                case 'icons':      return <IconsSection ds={ds} update={update} />
                case 'spacing':    return <SpacingSection ds={ds} update={update} />
                case 'voice':      return <VoiceSection ds={ds} update={update} />
                case 'imagery':    return <ImagerySection ds={ds} update={update} />
                case 'animation':  return <AnimationSection ds={ds} update={update} />
                case 'shadows':    return <ShadowsSection ds={ds} update={update} />
                default:           return null
              }
            })()}
          </main>
        </div>

        {/* Footer */}
        <div style={footerStyle}>
          <button onClick={handleSkip} style={skipBtn}>
            I'll do this later
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onClose} style={cancelBtn}>Cancel</button>
            <button
              onClick={handleSave}
              disabled={isSaving || !hasChanges}
              style={{
                ...primaryBtn,
                opacity: (isSaving || !hasChanges) ? 0.6 : 1,
                cursor: (isSaving || !hasChanges) ? 'wait' : 'pointer',
              }}
            >
              {isSaving ? 'Saving…' : 'Save design system'}
              {!isSaving && <ArrowRightIcon style={{ width: 12, height: 12 }} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  ), document.body)
}

// ────────────────────────────────────────────────────────────────────
// Section: Colors
// ────────────────────────────────────────────────────────────────────

const COLOR_ROLES = [
  'primary', 'secondary', 'accent', 'background', 'surface', 'text',
  'success', 'warning', 'error',
]

// Treat any role not in the predefined list as a custom role and
// surface it in the UI under the "custom" dropdown choice.
function isCustomRole(role) {
  return role && !COLOR_ROLES.includes(role)
}

function ColorsSection({ ds, update }) {
  const [newColor, setNewColor] = useState({ hex: '#8B5CF6', name: '', role: 'primary', customRole: '' })

  function addColor() {
    if (!newColor.name.trim()) return
    // For the "custom" choice, write the actual custom name into the
    // role field — the rest of the app reads role as a free string so
    // this round-trips cleanly through Supabase.
    const finalRole = newColor.role === 'custom'
      ? (newColor.customRole.trim() || 'custom')
      : newColor.role
    update('colors', [
      ...(ds.colors || []),
      { id: Date.now().toString(), hex: newColor.hex, name: newColor.name.trim(), role: finalRole },
    ])
    setNewColor({ hex: '#8B5CF6', name: '', role: 'primary', customRole: '' })
  }

  function removeColor(id) {
    update('colors', (ds.colors || []).filter(c => c.id !== id))
  }

  return (
    <>
      <SectionHeader
        title="Colors"
        subtitle="Define your brand palette. Name each color so the AI knows where to use it."
      />

      {ds.colors?.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
          {ds.colors.map(color => (
            <div key={color.id} style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
              minWidth: 76,
            }}>
              <div style={{
                position: 'relative', width: 52, height: 52, borderRadius: 12,
                background: color.hex,
                border: '2px solid rgba(255,255,255,0.1)',
                boxShadow: `0 4px 14px ${color.hex}55`,
              }}>
                <button
                  onClick={() => removeColor(color.id)}
                  aria-label={`Remove ${color.name}`}
                  style={{
                    position: 'absolute', top: -6, right: -6,
                    width: 18, height: 18, borderRadius: '50%',
                    background: '#EF4444', border: 'none', color: 'white',
                    cursor: 'pointer', display: 'flex',
                    alignItems: 'center', justifyContent: 'center',
                    padding: 0, lineHeight: 0,
                  }}
                >
                  <XMarkIcon style={{ width: 10, height: 10 }} />
                </button>
              </div>
              <div style={{
                fontFamily: 'var(--font-sans)', fontSize: 12, fontWeight: 600,
                color: 'var(--color-text)', maxWidth: 80,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                textAlign: 'center',
              }}>
                {color.name}
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--color-text-muted)' }}>
                {color.hex.toUpperCase()}
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--color-accent)', textTransform: 'uppercase' }}>
                {color.role}
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{
        background: 'var(--color-surface)', borderRadius: 12, padding: 16,
        border: '1px dashed var(--color-border)',
      }}>
        <FieldLabel>Add color</FieldLabel>
        <div style={{ display: 'grid', gridTemplateColumns: '52px 1fr 1fr', gap: 10, alignItems: 'end' }}>
          {/* Picker + hex paired bidirectionally — typing/pasting a
              valid hex in the text field updates the picker, and
              picking a colour updates the text. */}
          <HexPicker
            value={newColor.hex}
            onChange={v => setNewColor(p => ({ ...p, hex: v }))}
          />
          <div>
            <FieldLabel>Name</FieldLabel>
            <TextInput
              value={newColor.name}
              onChange={v => setNewColor(p => ({ ...p, name: v }))}
              placeholder="Forest Green"
            />
          </div>
          <div>
            <FieldLabel>Role</FieldLabel>
            <select
              value={newColor.role}
              onChange={e => setNewColor(p => ({ ...p, role: e.target.value }))}
              style={selectStyle}
            >
              {COLOR_ROLES.map(r => (
                <option key={r} value={r}>{r[0].toUpperCase() + r.slice(1)}</option>
              ))}
              <option value="custom">Custom name…</option>
            </select>
          </div>
        </div>
        {newColor.role === 'custom' && (
          <div style={{ marginTop: 10 }}>
            <FieldLabel>Custom role name</FieldLabel>
            <TextInput
              value={newColor.customRole}
              onChange={v => setNewColor(p => ({ ...p, customRole: v }))}
              placeholder="e.g. brand-glow, deep-shade, hero-mist"
            />
          </div>
        )}
        <button
          onClick={addColor}
          disabled={!newColor.name.trim()}
          style={{
            marginTop: 12, padding: '8px 14px', borderRadius: 8,
            border: '1px solid rgba(139,92,246,0.4)',
            background: 'rgba(139,92,246,0.1)',
            color: '#8B5CF6',
            fontFamily: 'var(--font-sans)', fontWeight: 600, fontSize: 13,
            cursor: newColor.name.trim() ? 'pointer' : 'not-allowed',
            opacity: newColor.name.trim() ? 1 : 0.5,
            display: 'inline-flex', alignItems: 'center', gap: 6,
          }}
        >
          <PlusIcon style={{ width: 13, height: 13 }} /> Add color
        </button>
      </div>
    </>
  )
}

// ────────────────────────────────────────────────────────────────────
// Section: Typography
// ────────────────────────────────────────────────────────────────────

const WEIGHTS = ['300', '400', '500', '600', '700', '800']
const SCALE_RATIOS = [
  { value: '1.125', label: '1.125 · Minor second' },
  { value: '1.25',  label: '1.25 · Major third' },
  { value: '1.333', label: '1.333 · Perfect fourth' },
  { value: '1.5',   label: '1.5 · Perfect fifth' },
]

function TypographySection({ ds, update }) {
  const base = ds.baseFontSize || 16
  const ratio = parseFloat(ds.scaleRatio || '1.25')
  const scale = {
    h1: Math.round(base * Math.pow(ratio, 5)),
    h2: Math.round(base * Math.pow(ratio, 4)),
    h3: Math.round(base * Math.pow(ratio, 3)),
    body: base,
  }

  // Pick the dominant weight from the selected weight set so the
  // preview shows what the heading/body will actually look like at
  // the user's chosen weight. Fallbacks pick a reasonable middle of
  // the requested range.
  const headingWeight = pickPreviewWeight(ds.headingWeights, '700')
  const bodyWeight = pickPreviewWeight(ds.bodyWeights, '400')

  // Dynamically load the chosen Google Fonts so previews render in
  // the real face, not a sans-serif fallback.
  useGoogleFont(ds.headingFont, ds.headingWeights)
  useGoogleFont(ds.bodyFont, ds.bodyWeights)

  function toggleWeight(field, w) {
    const current = ds[field] || []
    update(field, current.includes(w) ? current.filter(x => x !== w) : [...current, w])
  }

  return (
    <>
      <SectionHeader
        title="Typography"
        subtitle="Pair the heading + body fonts. The AI will use these in every generated component."
      />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
        <div>
          <FieldLabel>Heading font</FieldLabel>
          <FontCombobox
            value={ds.headingFont}
            onChange={v => update('headingFont', v)}
            placeholder="Search Fraunces, Inter, Playfair…"
          />
          {ds.headingFont && (
            <a
              href={`https://fonts.google.com/specimen/${ds.headingFont.replace(/ /g, '+')}`}
              target="_blank" rel="noopener noreferrer"
              style={fontLink}
            >
              View on Google Fonts →
            </a>
          )}
          <div style={{ marginTop: 12 }}>
            <FieldLabel>Weights used</FieldLabel>
            <WeightPicker
              family={ds.headingFont}
              weights={ds.headingWeights || []}
              onToggle={w => toggleWeight('headingWeights', w)}
            />
          </div>
        </div>
        <div>
          <FieldLabel>Body font</FieldLabel>
          <FontCombobox
            value={ds.bodyFont}
            onChange={v => update('bodyFont', v)}
            placeholder="Search DM Sans, Inter, Outfit…"
          />
          {ds.bodyFont && (
            <a
              href={`https://fonts.google.com/specimen/${ds.bodyFont.replace(/ /g, '+')}`}
              target="_blank" rel="noopener noreferrer"
              style={fontLink}
            >
              View on Google Fonts →
            </a>
          )}
          <div style={{ marginTop: 12 }}>
            <FieldLabel>Weights used</FieldLabel>
            <WeightPicker
              family={ds.bodyFont}
              weights={ds.bodyWeights || []}
              onToggle={w => toggleWeight('bodyWeights', w)}
            />
          </div>
        </div>
      </div>

      <div style={{ marginBottom: 20 }}>
        <FieldLabel>Type scale ratio</FieldLabel>
        <PillSelector
          options={SCALE_RATIOS}
          value={ds.scaleRatio}
          onChange={v => update('scaleRatio', v)}
        />
      </div>

      {(ds.headingFont || ds.bodyFont) && (
        <div style={{
          background: 'var(--color-surface)', borderRadius: 12, padding: 16,
        }}>
          <FieldLabel>Scale preview</FieldLabel>
          {Object.entries(scale).map(([name, size]) => {
            const isBody = name === 'body'
            return (
              <div key={name} style={{
                display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 6,
              }}>
                <span style={{
                  fontFamily: 'var(--font-mono)', fontSize: 10,
                  color: 'var(--color-text-muted)', width: 30, flexShrink: 0,
                  textTransform: 'uppercase',
                }}>
                  {name}
                </span>
                <span style={{
                  fontFamily: isBody
                    ? (ds.bodyFont ? `"${ds.bodyFont}", sans-serif` : 'inherit')
                    : (ds.headingFont ? `"${ds.headingFont}", sans-serif` : 'inherit'),
                  fontWeight: isBody ? bodyWeight : headingWeight,
                  fontSize: `${size}px`,
                  color: 'var(--color-text)',
                  lineHeight: 1.15,
                }}>
                  {isBody
                    ? 'The quick brown fox jumps over the lazy dog.'
                    : 'The Quick Brown Fox'}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}

function pickPreviewWeight(list, fallback) {
  if (!Array.isArray(list) || !list.length) return fallback
  // Prefer the heaviest of the chosen set so heading previews really
  // read as the heading; body previews use the median.
  return list[list.length - 1]
}

// Typeahead combobox for the curated FONT_LIST. Filters as the user
// types; click commits. Lets the user paste a font name not in the
// list too — the field still saves whatever string they pick.
function FontCombobox({ value, onChange, placeholder }) {
  const [draft, setDraft] = useState(value || '')
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)

  useEffect(() => { setDraft(value || '') }, [value])
  useEffect(() => {
    if (!open) return
    function onDoc(e) { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const filtered = draft
    ? FONT_LIST.filter(f => f.toLowerCase().includes(draft.toLowerCase()))
    : FONT_LIST

  function commit(name) {
    setDraft(name)
    onChange(name)
    setOpen(false)
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <input
        type="text"
        value={draft}
        onChange={e => { setDraft(e.target.value); setOpen(true); onChange(e.target.value) }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        style={{
          width: '100%', padding: '10px 14px',
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 10,
          color: 'var(--color-text)',
          fontFamily: 'var(--font-sans)', fontSize: 14,
          outline: 'none', boxSizing: 'border-box',
          transition: 'border-color 0.15s',
        }}
        onBlur={e => (e.target.style.borderColor = 'var(--color-border)')}
      />
      {open && filtered.length > 0 && (
        <div style={{
          position: 'absolute', left: 0, right: 0, top: 'calc(100% + 4px)',
          zIndex: 20,
          maxHeight: 220, overflowY: 'auto',
          background: 'var(--color-bg)',
          border: '1px solid var(--color-border)',
          borderRadius: 10,
          boxShadow: 'var(--shadow-dropdown, 0 10px 30px rgba(0,0,0,0.18))',
          padding: 4,
        }}>
          {filtered.slice(0, 14).map(f => (
            <button
              key={f}
              onClick={() => commit(f)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                width: '100%', padding: '7px 10px',
                background: f === value ? 'rgba(139,92,246,0.10)' : 'transparent',
                border: 'none', borderRadius: 7,
                color: 'var(--color-text)', cursor: 'pointer',
                fontFamily: `"${f}", sans-serif`,
                fontSize: 14, textAlign: 'left',
              }}
              onMouseEnter={e => { if (f !== value) e.currentTarget.style.background = 'var(--color-surface)' }}
              onMouseLeave={e => { if (f !== value) e.currentTarget.style.background = 'transparent' }}
            >
              <span>{f}</span>
              <PreviewLoader family={f} />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// Tiny helper component — mounts a useGoogleFont hook for the
// dropdown row's font so the preview row renders in the real face.
function PreviewLoader({ family }) {
  useGoogleFont(family, ['400', '700'])
  return null
}

function WeightPicker({ family, weights, onToggle }) {
  // Each chip renders in the actual family + weight so the user can
  // FEEL the choice before adopting it. Falls back to mono when no
  // family picked yet.
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {WEIGHTS.map(w => {
        const isOn = weights.includes(w)
        return (
          <button
            key={w}
            onClick={() => onToggle(w)}
            style={{
              padding: '5px 12px', borderRadius: 8,
              border: `1px solid ${isOn ? 'var(--color-accent)' : 'var(--color-border)'}`,
              background: isOn ? 'rgba(139,92,246,0.10)' : 'var(--color-bg)',
              color: isOn ? 'var(--color-accent)' : 'var(--color-text)',
              fontFamily: family ? `"${family}", sans-serif` : 'var(--font-mono)',
              fontSize: 13, fontWeight: w,
              cursor: 'pointer',
              transition: 'background 0.15s, border-color 0.15s, color 0.15s',
              minWidth: 44, textAlign: 'center',
            }}
          >
            {w}
          </button>
        )
      })}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────
// Section: Buttons
// ────────────────────────────────────────────────────────────────────

function ButtonsSection({ ds, update }) {
  const accent = ds.colors?.[0]?.hex || '#8B5CF6'
  const secondary = ds.buttonSecondary || {}
  const secondaryEnabled = secondary.enabled

  // When secondary is disabled we still need values for the preview;
  // fall back to "outlined version of primary" so the user gets a
  // sensible default if they enable it later.
  const secStyle = secondaryEnabled ? secondary.style : 'outlined'
  const secRadius = secondaryEnabled ? secondary.radius : ds.buttonRadius
  const secRadiusValue = secondaryEnabled ? secondary.radiusValue : ds.buttonRadiusValue
  const secSize = secondaryEnabled ? secondary.size : ds.buttonSize
  const secWeight = secondaryEnabled ? secondary.weight : ds.buttonWeight

  const primaryPreview = buttonPreview({
    accent, radius: ds.buttonRadius, radiusValue: ds.buttonRadiusValue,
    size: ds.buttonSize, style: ds.buttonStyle, weight: ds.buttonWeight,
    fontFamily: ds.bodyFont,
  })
  const secondaryPreview = buttonPreview({
    accent, radius: secRadius, radiusValue: secRadiusValue,
    size: secSize, style: secStyle, weight: secWeight,
    fontFamily: ds.bodyFont,
  })

  function setSec(key, val) {
    update('buttonSecondary', { ...(ds.buttonSecondary || {}), [key]: val })
  }

  return (
    <>
      <SectionHeader
        title="Buttons"
        subtitle="Define the primary CTA + an optional secondary action. The AI applies these to every button pair."
      />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
        {/* PRIMARY card */}
        <ButtonCard
          title="Primary"
          radius={ds.buttonRadius}
          radiusValue={ds.buttonRadiusValue}
          style={ds.buttonStyle}
          size={ds.buttonSize}
          weight={ds.buttonWeight}
          setRadius={v => update('buttonRadius', v)}
          setRadiusValue={v => update('buttonRadiusValue', v)}
          setStyle={v => update('buttonStyle', v)}
          setSize={v => update('buttonSize', v)}
          setWeight={v => update('buttonWeight', v)}
        />

        {/* SECONDARY card — collapsible via the enable toggle */}
        <div style={{
          background: secondaryEnabled ? 'var(--color-surface)' : 'transparent',
          border: `1px solid ${secondaryEnabled ? 'var(--color-border)' : 'var(--color-border-strong, var(--color-border))'}`,
          borderRadius: 14, padding: 16,
          display: 'flex', flexDirection: 'column',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <h4 style={{
              margin: 0, fontFamily: 'var(--font-sans)',
              fontWeight: 700, fontSize: 13, color: 'var(--color-text)',
              letterSpacing: '-0.01em',
            }}>
              Secondary
            </h4>
            <Toggle
              on={!!secondaryEnabled}
              onChange={v => setSec('enabled', v)}
            />
          </div>
          {secondaryEnabled ? (
            <ButtonCardInner
              radius={secRadius}
              radiusValue={secRadiusValue}
              style={secStyle}
              size={secSize}
              weight={secWeight}
              setRadius={v => setSec('radius', v)}
              setRadiusValue={v => setSec('radiusValue', v)}
              setStyle={v => setSec('style', v)}
              setSize={v => setSec('size', v)}
              setWeight={v => setSec('weight', v)}
            />
          ) : (
            <p style={{
              margin: 0, fontFamily: 'var(--font-sans)', fontSize: 12,
              color: 'var(--color-text-muted)', lineHeight: 1.5,
            }}>
              Disabled. The AI will derive the secondary action from the primary (outlined variant by default). Toggle on to customise.
            </p>
          )}
        </div>
      </div>

      {/* Live preview */}
      <div style={{
        background: 'var(--color-surface)', borderRadius: 14, padding: '28px 16px',
      }}>
        <FieldLabel>Live preview</FieldLabel>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', marginTop: 10 }}>
          <button style={primaryPreview}>Get started</button>
          <button style={secondaryPreview}>Learn more</button>
        </div>
      </div>
    </>
  )
}

function buttonPreview({ accent, radius, radiusValue, size, style, weight, fontFamily }) {
  return {
    padding: size === 'small' ? '6px 14px' : size === 'large' ? '14px 28px' : '10px 20px',
    borderRadius:
      radius === 'pill' ? 9999
        : radius === 'square' ? 0
          : radiusValue,
    border: style === 'outlined' ? `2px solid ${accent}` : 'none',
    background:
      style === 'filled' ? accent
        : style === 'soft' ? accent + '22'
          : 'transparent',
    color: style === 'filled' ? 'white' : accent,
    fontFamily: fontFamily ? `"${fontFamily}", sans-serif` : 'var(--font-sans)',
    fontWeight: weight,
    fontSize: size === 'small' ? 13 : size === 'large' ? 16 : 14,
    cursor: 'pointer',
    transition: 'transform 0.15s ease',
  }
}

function ButtonCard({ title, ...rest }) {
  return (
    <div style={{
      background: 'var(--color-surface)',
      border: '1px solid var(--color-border)',
      borderRadius: 14, padding: 16,
    }}>
      <h4 style={{
        margin: '0 0 12px', fontFamily: 'var(--font-sans)',
        fontWeight: 700, fontSize: 13, color: 'var(--color-text)',
        letterSpacing: '-0.01em',
      }}>
        {title}
      </h4>
      <ButtonCardInner {...rest} />
    </div>
  )
}

function ButtonCardInner({
  radius, radiusValue, style, size, weight,
  setRadius, setRadiusValue, setStyle, setSize, setWeight,
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <FieldLabel>Shape</FieldLabel>
        <PillSelector
          options={[
            { value: 'square', label: 'Square' },
            { value: 'rounded', label: 'Rounded' },
            { value: 'pill', label: 'Pill' },
            { value: 'custom', label: 'Custom' },
          ]}
          value={radius}
          onChange={setRadius}
        />
        {radius === 'custom' && (
          <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="range"
              min="0"
              max="32"
              value={radiusValue}
              onChange={e => setRadiusValue(parseInt(e.target.value, 10))}
              style={{ flex: 1 }}
            />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--color-text)', minWidth: 36 }}>
              {radiusValue}px
            </span>
          </div>
        )}
      </div>
      <div>
        <FieldLabel>Fill</FieldLabel>
        <PillSelector
          options={[
            { value: 'filled',   label: 'Filled' },
            { value: 'outlined', label: 'Outlined' },
            { value: 'soft',     label: 'Soft' },
            { value: 'ghost',    label: 'Ghost' },
          ]}
          value={style}
          onChange={setStyle}
        />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div>
          <FieldLabel>Size</FieldLabel>
          <PillSelector
            options={[
              { value: 'small',  label: 'S' },
              { value: 'medium', label: 'M' },
              { value: 'large',  label: 'L' },
            ]}
            value={size}
            onChange={setSize}
          />
        </div>
        <div>
          <FieldLabel>Weight</FieldLabel>
          <PillSelector
            options={[
              { value: '400', label: 'R' },
              { value: '500', label: 'M' },
              { value: '600', label: 'SB' },
              { value: '700', label: 'B' },
            ]}
            value={weight}
            onChange={setWeight}
          />
        </div>
      </div>
    </div>
  )
}

// Simple iOS-style toggle for Boolean settings.
function Toggle({ on, onChange }) {
  return (
    <button
      onClick={() => onChange(!on)}
      aria-pressed={on}
      style={{
        position: 'relative',
        width: 36, height: 20,
        borderRadius: 9999,
        background: on ? 'var(--color-accent)' : 'var(--color-border)',
        border: 'none',
        cursor: 'pointer',
        transition: 'background 0.15s',
        padding: 0,
      }}
    >
      <span style={{
        position: 'absolute',
        top: 2, left: on ? 18 : 2,
        width: 16, height: 16, borderRadius: '50%',
        background: 'white',
        transition: 'left 0.15s',
        boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
      }} />
    </button>
  )
}

// ────────────────────────────────────────────────────────────────────
// Section: Icons
// ────────────────────────────────────────────────────────────────────

const ICON_LIBRARIES = [
  { value: 'lucide',    label: 'Lucide',    url: 'https://lucide.dev' },
  { value: 'phosphor',  label: 'Phosphor',  url: 'https://phosphoricons.com' },
  { value: 'heroicons', label: 'Heroicons', url: 'https://heroicons.com' },
  { value: 'tabler',    label: 'Tabler',    url: 'https://tabler.io/icons' },
  { value: 'feather',   label: 'Feather',   url: 'https://feathericons.com' },
  { value: 'custom',    label: 'Custom' },
]

function IconsSection({ ds, update }) {
  const selected = ICON_LIBRARIES.find(l => l.value === ds.iconLibrary)

  return (
    <>
      <SectionHeader
        title="Icons"
        subtitle="Choose your icon library. The AI references this in every generated component."
      />

      <div style={{ marginBottom: 20 }}>
        <FieldLabel>Icon library</FieldLabel>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          {ICON_LIBRARIES.map(lib => {
            const isOn = ds.iconLibrary === lib.value
            return (
              <button
                key={lib.value}
                onClick={() => update('iconLibrary', lib.value)}
                style={{
                  padding: '10px 12px', borderRadius: 10,
                  border: `1.5px solid ${isOn ? 'var(--color-accent)' : 'var(--color-border)'}`,
                  background: isOn ? 'rgba(139,92,246,0.10)' : 'var(--color-surface)',
                  color: isOn ? 'var(--color-accent)' : 'var(--color-text)',
                  fontFamily: 'var(--font-sans)', fontSize: 13,
                  fontWeight: isOn ? 600 : 400,
                  cursor: 'pointer', textAlign: 'center',
                  transition: 'all 0.15s',
                }}
              >
                {lib.label}
              </button>
            )
          })}
        </div>
        {selected?.url && ds.iconLibrary !== 'custom' && (
          <a href={selected.url} target="_blank" rel="noopener noreferrer" style={fontLink}>
            Browse {selected.label} →
          </a>
        )}
        {ds.iconLibrary === 'custom' && (
          <div style={{ marginTop: 12 }}>
            <FieldLabel>Icon library URL</FieldLabel>
            <TextInput
              value={ds.customIconUrl}
              onChange={v => update('customIconUrl', v)}
              placeholder="https://your-icon-library.com"
            />
          </div>
        )}
      </div>

      <div style={{ marginBottom: 20 }}>
        <FieldLabel>Icon style</FieldLabel>
        <PillSelector
          options={[
            { value: 'outline', label: 'Outline' },
            { value: 'filled',  label: 'Filled' },
            { value: 'duotone', label: 'Duotone' },
            { value: 'bold',    label: 'Bold' },
          ]}
          value={ds.iconStyle}
          onChange={v => update('iconStyle', v)}
        />
      </div>

      <div>
        <FieldLabel>Size scale</FieldLabel>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          {[
            { key: 'iconSizeSm', label: 'Small' },
            { key: 'iconSizeMd', label: 'Medium' },
            { key: 'iconSizeLg', label: 'Large' },
          ].map(({ key, label }) => (
            <div key={key}>
              <FieldLabel>{label}</FieldLabel>
              <NumberWithUnit
                value={ds[key]}
                onChange={v => update(key, v)}
                unit="px"
                min={8}
                max={64}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Live preview — three icons rendered at the configured sizes
          so the user can compare them next to each other. The icon
          itself is a generic glyph; the visual point is the SCALE. */}
      <div style={{
        marginTop: 22, background: 'var(--color-surface)', borderRadius: 12,
        padding: '20px 16px',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14,
      }}>
        <FieldLabel>Live preview</FieldLabel>
        <div style={{ display: 'flex', gap: 32, alignItems: 'baseline' }}>
          {[
            { size: ds.iconSizeSm, label: 'SM' },
            { size: ds.iconSizeMd, label: 'MD' },
            { size: ds.iconSizeLg, label: 'LG' },
          ].map(({ size, label }) => (
            <div key={label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <SparklesIcon style={{ width: size, height: size, color: 'var(--color-accent)' }} />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--color-text-muted)' }}>
                {label} · {size}px
              </span>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}

// ────────────────────────────────────────────────────────────────────
// Section: Spacing
// ────────────────────────────────────────────────────────────────────

function SpacingSection({ ds, update }) {
  return (
    <>
      <SectionHeader
        title="Spacing"
        subtitle="Base unit, radii, and the layout grid. The AI uses these for every measurement."
      />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
        <div>
          <FieldLabel>Base unit</FieldLabel>
          <PillSelector
            options={[
              { value: 4, label: '4px' },
              { value: 6, label: '6px' },
              { value: 8, label: '8px' },
            ]}
            value={ds.baseUnit}
            onChange={v => update('baseUnit', v)}
          />
        </div>
        <div>
          <FieldLabel>Grid columns</FieldLabel>
          <PillSelector
            options={[
              { value: 8,  label: '8' },
              { value: 12, label: '12' },
              { value: 16, label: '16' },
            ]}
            value={ds.gridColumns}
            onChange={v => update('gridColumns', v)}
          />
        </div>
      </div>

      <div style={{ marginBottom: 20 }}>
        <FieldLabel>Border radius scale</FieldLabel>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          {[
            { key: 'borderRadiusSm', label: 'Small' },
            { key: 'borderRadiusMd', label: 'Medium' },
            { key: 'borderRadiusLg', label: 'Large' },
          ].map(({ key, label }) => (
            <div key={key}>
              <FieldLabel>{label}</FieldLabel>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <NumberWithUnit
                  value={ds[key]}
                  onChange={v => update(key, v)}
                  unit="px"
                  min={0}
                  max={64}
                />
                <div style={{
                  width: 32, height: 32, flexShrink: 0,
                  background: 'var(--color-accent)',
                  borderRadius: ds[key],
                  border: '1px solid var(--color-border)',
                }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <div>
          <FieldLabel>Max content width</FieldLabel>
          <NumberWithUnit
            value={ds.maxContentWidth}
            onChange={v => update('maxContentWidth', v)}
            unit="px"
            min={640}
            max={1920}
            step={20}
          />
        </div>
        <div>
          <FieldLabel>Gutter</FieldLabel>
          <NumberWithUnit
            value={ds.gutter}
            onChange={v => update('gutter', v)}
            unit="px"
            min={4}
            max={64}
          />
        </div>
      </div>

      {/* Layout preview — three "cards" laid out at the chosen radius
          + gutter so the spacing language reads instantly. */}
      <div style={{
        marginTop: 22, background: 'var(--color-surface)', borderRadius: 12,
        padding: 16,
      }}>
        <FieldLabel>Layout preview</FieldLabel>
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
          gap: Math.round(ds.gutter * 0.6),
          marginTop: 10,
        }}>
          {[0, 1, 2].map(i => (
            <div key={i} style={{
              height: 56,
              background: 'var(--color-bg)',
              border: '1px solid var(--color-border)',
              borderRadius: ds.borderRadiusMd,
            }} />
          ))}
        </div>
      </div>
    </>
  )
}

// ────────────────────────────────────────────────────────────────────
// Section: Brand voice
// ────────────────────────────────────────────────────────────────────

function VoiceSection({ ds, update }) {
  const [draft, setDraft] = useState('')

  function addTag() {
    const t = draft.trim()
    if (!t) return
    if ((ds.toneKeywords || []).includes(t)) {
      setDraft('')
      return
    }
    update('toneKeywords', [...(ds.toneKeywords || []), t])
    setDraft('')
  }

  function removeTag(t) {
    update('toneKeywords', (ds.toneKeywords || []).filter(k => k !== t))
  }

  return (
    <>
      <SectionHeader
        title="Brand voice"
        subtitle="Tone words and copy style. The AI writes in this voice for every headline and CTA."
      />

      <div style={{ marginBottom: 20 }}>
        <FieldLabel>Tone keywords</FieldLabel>
        {(ds.toneKeywords || []).length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
            {ds.toneKeywords.map(t => (
              <span key={t} style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '4px 10px', borderRadius: 9999,
                background: 'rgba(139,92,246,0.10)',
                border: '1px solid rgba(139,92,246,0.30)',
                color: 'var(--color-accent)',
                fontFamily: 'var(--font-sans)', fontSize: 12, fontWeight: 600,
              }}>
                {t}
                <button
                  onClick={() => removeTag(t)}
                  aria-label={`Remove ${t}`}
                  style={{
                    background: 'transparent', border: 'none', padding: 0,
                    cursor: 'pointer', color: 'var(--color-accent)', lineHeight: 0,
                  }}
                >
                  <XMarkIcon style={{ width: 11, height: 11 }} />
                </button>
              </span>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          <TextInput
            value={draft}
            onChange={setDraft}
            placeholder="e.g. confident, witty, grounded"
          />
          <button
            onClick={addTag}
            disabled={!draft.trim()}
            style={{
              flexShrink: 0,
              padding: '0 16px', borderRadius: 10,
              border: '1px solid rgba(139,92,246,0.4)',
              background: 'rgba(139,92,246,0.1)',
              color: 'var(--color-accent)',
              fontFamily: 'var(--font-sans)', fontWeight: 600, fontSize: 13,
              cursor: draft.trim() ? 'pointer' : 'not-allowed',
              opacity: draft.trim() ? 1 : 0.5,
            }}
          >
            Add
          </button>
        </div>
      </div>

      <div style={{ marginBottom: 20 }}>
        <FieldLabel>Copy style</FieldLabel>
        <PillSelector
          options={[
            { value: 'conversational', label: 'Conversational' },
            { value: 'professional',   label: 'Professional' },
            { value: 'playful',        label: 'Playful' },
            { value: 'authoritative',  label: 'Authoritative' },
            { value: 'minimal',        label: 'Minimal' },
          ]}
          value={ds.copyStyle}
          onChange={v => update('copyStyle', v)}
        />
      </div>

      <div>
        <FieldLabel>Things to avoid</FieldLabel>
        <textarea
          value={ds.thingsToAvoid || ''}
          onChange={e => update('thingsToAvoid', e.target.value)}
          placeholder="e.g. no buzzwords, no exclamation marks, never use 'leverage'"
          rows={3}
          style={{
            width: '100%', padding: '10px 14px',
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 10,
            color: 'var(--color-text)',
            fontFamily: 'var(--font-sans)', fontSize: 14, lineHeight: 1.5,
            outline: 'none', resize: 'vertical', boxSizing: 'border-box',
          }}
          onFocus={e => (e.target.style.borderColor = 'var(--color-accent)')}
          onBlur={e => (e.target.style.borderColor = 'var(--color-border)')}
        />
      </div>

      {/* Live preview — a sample headline + sub written in the
          selected copy style. Lets the user feel the voice before
          shipping. */}
      <div style={{
        marginTop: 20, background: 'var(--color-surface)', borderRadius: 12,
        padding: 18,
      }}>
        <FieldLabel>Sample copy</FieldLabel>
        <VoicePreview style={ds.copyStyle} />
      </div>
    </>
  )
}

const VOICE_SAMPLES = {
  conversational: {
    headline: "Let's get your team in sync.",
    sub: "Plans, comments, and decisions in one tidy place. Open it up and breathe.",
    cta: 'Try it free',
  },
  professional: {
    headline: 'Operations clarity, delivered.',
    sub: 'A workflow platform built for organisations that take execution seriously.',
    cta: 'Request a demo',
  },
  playful: {
    headline: "Work, but make it fun.",
    sub: "Less wrestling with tools, more shipping things you're proud of.",
    cta: 'Jump in',
  },
  authoritative: {
    headline: 'The standard for modern operations.',
    sub: 'Used by the teams shipping the products you reach for every day.',
    cta: 'See the platform',
  },
  minimal: {
    headline: 'Plan. Build. Ship.',
    sub: 'One workspace. Zero friction.',
    cta: 'Start',
  },
}

function VoicePreview({ style }) {
  const sample = VOICE_SAMPLES[style] || VOICE_SAMPLES.conversational
  return (
    <div style={{ paddingTop: 6 }}>
      <h4 style={{
        margin: '0 0 6px',
        fontFamily: 'var(--font-sans)',
        fontSize: 20, fontWeight: 800,
        color: 'var(--color-text)',
        letterSpacing: '-0.02em', lineHeight: 1.2,
      }}>
        {sample.headline}
      </h4>
      <p style={{
        margin: '0 0 14px',
        fontFamily: 'var(--font-sans)',
        fontSize: 13, color: 'var(--color-text-soft)',
        lineHeight: 1.5,
      }}>
        {sample.sub}
      </p>
      <span style={{
        display: 'inline-block',
        padding: '6px 14px',
        background: 'var(--color-accent)',
        color: 'white',
        borderRadius: 8,
        fontFamily: 'var(--font-sans)',
        fontSize: 12, fontWeight: 700,
      }}>
        {sample.cta} →
      </span>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────
// Section: Imagery
// ────────────────────────────────────────────────────────────────────

const PHOTO_STYLES = [
  { value: 'lifestyle', label: 'Lifestyle' },
  { value: 'studio',    label: 'Studio' },
  { value: 'editorial', label: 'Editorial' },
  { value: 'candid',    label: 'Candid' },
  { value: 'minimal',   label: 'Minimal' },
  { value: 'none',      label: 'No photography' },
]
const TREATMENTS = [
  { value: 'full_color',    label: 'Full color' },
  { value: 'black_white',   label: 'B & W' },
  { value: 'duotone',       label: 'Duotone' },
  { value: 'desaturated',   label: 'Desaturated' },
  { value: 'high_contrast', label: 'High contrast' },
]
const ILLUSTRATIONS = [
  { value: 'none',       label: 'None' },
  { value: 'line',       label: 'Line art' },
  { value: 'flat',       label: 'Flat geometric' },
  { value: '3d',         label: '3D / isometric' },
  { value: 'hand_drawn', label: 'Hand drawn' },
  { value: 'mixed',      label: 'Mixed media' },
]

function ImagerySection({ ds, update }) {
  const accent = ds.colors?.[0]?.hex || '#8B5CF6'

  return (
    <>
      <SectionHeader
        title="Imagery"
        subtitle="Photography style + treatment + illustration. Each tile shows what the AI will reach for."
      />

      <div style={{ marginBottom: 22 }}>
        <FieldLabel>Photography style</FieldLabel>
        <TileGrid
          options={PHOTO_STYLES}
          value={ds.photographyStyle}
          onChange={v => update('photographyStyle', v)}
          renderArt={v => <PhotoArt kind={v} accent={accent} />}
        />
      </div>

      <div style={{ marginBottom: 22 }}>
        <FieldLabel>Image treatment</FieldLabel>
        <TileGrid
          options={TREATMENTS}
          value={ds.imageTreatment}
          onChange={v => update('imageTreatment', v)}
          renderArt={v => <TreatmentArt kind={v} accent={accent} />}
        />
      </div>

      <div>
        <FieldLabel>Illustration style</FieldLabel>
        <TileGrid
          options={ILLUSTRATIONS}
          value={ds.illustrationStyle}
          onChange={v => update('illustrationStyle', v)}
          renderArt={v => <IllustrationArt kind={v} accent={accent} />}
        />
      </div>
    </>
  )
}

// Generic 3-up grid of visual choice tiles. Each tile has artwork at
// top + label at bottom, selected state with accent border.
function TileGrid({ options, value, onChange, renderArt }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
      gap: 10,
    }}>
      {options.map(opt => {
        const isOn = value === opt.value
        return (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            style={{
              padding: 8,
              borderRadius: 12,
              border: `2px solid ${isOn ? 'var(--color-accent)' : 'var(--color-border)'}`,
              background: isOn ? 'rgba(139,92,246,0.06)' : 'var(--color-surface)',
              cursor: 'pointer',
              display: 'flex', flexDirection: 'column', gap: 6,
              transition: 'all 0.15s',
            }}
          >
            <div style={{
              width: '100%', aspectRatio: '4 / 3',
              borderRadius: 8, overflow: 'hidden',
              background: 'var(--color-bg)',
              border: '1px solid var(--color-border)',
              position: 'relative',
            }}>
              {renderArt(opt.value)}
            </div>
            <span style={{
              fontFamily: 'var(--font-sans)', fontSize: 11.5,
              fontWeight: isOn ? 700 : 500,
              color: isOn ? 'var(--color-accent)' : 'var(--color-text)',
              textAlign: 'center',
              padding: '2px 0 0',
            }}>
              {opt.label}
            </span>
          </button>
        )
      })}
    </div>
  )
}

// ── Photography style art — abstract scenes evoking each style.
function PhotoArt({ kind, accent }) {
  if (kind === 'none') {
    return (
      <div style={{
        width: '100%', height: '100%',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--color-text-muted)', fontSize: 10,
        fontFamily: 'var(--font-mono)', letterSpacing: '0.08em',
      }}>
        NO PHOTO
      </div>
    )
  }
  const presets = {
    lifestyle: {
      bg: `radial-gradient(circle at 30% 40%, ${accent}55, transparent 60%),
           linear-gradient(135deg, #c9b89e, #8b6e54 70%, #4b3a2c)`,
      shapes: [{ left: '15%', top: '55%', w: 26, h: 26, rad: '50%', color: '#fffbf3' }],
    },
    studio: {
      bg: `radial-gradient(ellipse at center, #efeae3 0%, #c7c0b3 70%, #8d8579 100%)`,
      shapes: [{ left: '40%', top: '30%', w: 22, h: 38, rad: 4, color: '#1a1814' }],
    },
    editorial: {
      bg: `linear-gradient(180deg, #f8f3eb 50%, #1a1612 50%)`,
      shapes: [
        { left: '20%', top: '20%', w: 18, h: 26, rad: 2, color: '#1a1612' },
        { left: '55%', top: '60%', w: 28, h: 16, rad: 2, color: '#fffbf3' },
      ],
    },
    candid: {
      bg: `linear-gradient(45deg, #5a4d3f 0%, #b09679 60%, #f4e8d8 100%)`,
      shapes: [
        { left: '20%', top: '40%', w: 14, h: 14, rad: '50%', color: '#1a1612' },
        { left: '50%', top: '35%', w: 18, h: 18, rad: '50%', color: '#3a2d22' },
      ],
    },
    minimal: {
      bg: '#f4f0e8',
      shapes: [{ left: '38%', top: '25%', w: 24, h: 50, rad: 1, color: '#1a1612' }],
    },
  }
  const cfg = presets[kind] || presets.minimal
  return (
    <div style={{ position: 'absolute', inset: 0, background: cfg.bg }}>
      {(cfg.shapes || []).map((s, i) => (
        <div key={i} style={{
          position: 'absolute',
          left: s.left, top: s.top,
          width: s.w + '%', height: s.h + '%',
          borderRadius: s.rad,
          background: s.color,
          opacity: 0.92,
        }} />
      ))}
    </div>
  )
}

// ── Treatment art — same base hue, different post-processing.
function TreatmentArt({ kind, accent }) {
  const baseBg = `linear-gradient(135deg, #c97b50 0%, #d4a574 40%, #6e5237 100%)`
  const filterMap = {
    full_color:    'none',
    black_white:   'grayscale(1) contrast(1.05)',
    duotone:       `grayscale(1) sepia(1) hue-rotate(${hexToHue(accent) - 30}deg) saturate(2) contrast(1.05)`,
    desaturated:   'saturate(0.4) brightness(0.95)',
    high_contrast: 'contrast(1.6) saturate(1.4)',
  }
  return (
    <div style={{ position: 'absolute', inset: 0, background: baseBg, filter: filterMap[kind] || 'none' }}>
      <div style={{ position: 'absolute', left: '25%', top: '40%', width: '28%', height: '28%', borderRadius: '50%', background: '#fff5e0', opacity: 0.7 }} />
      <div style={{ position: 'absolute', left: '60%', top: '20%', width: '22%', height: '52%', borderRadius: 4, background: '#1f1a14' }} />
    </div>
  )
}

function hexToHue(hex) {
  // Convert hex → hue degrees so the duotone preview tints in the
  // user's actual brand colour direction.
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16) / 255
  const g = parseInt(h.slice(2, 4), 16) / 255
  const b = parseInt(h.slice(4, 6), 16) / 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  let hue = 0
  if (max === min) hue = 0
  else if (max === r) hue = ((g - b) / (max - min)) * 60
  else if (max === g) hue = ((b - r) / (max - min)) * 60 + 120
  else hue = ((r - g) / (max - min)) * 60 + 240
  return (hue + 360) % 360
}

// ── Illustration art — minimal SVG glyphs evoking each style.
function IllustrationArt({ kind, accent }) {
  if (kind === 'none') {
    return (
      <div style={{
        width: '100%', height: '100%',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--color-text-muted)', fontSize: 10,
        fontFamily: 'var(--font-mono)', letterSpacing: '0.08em',
      }}>
        NONE
      </div>
    )
  }
  const stroke = accent
  const fill = accent + '33'
  return (
    <svg viewBox="0 0 60 45" style={{ width: '100%', height: '100%', display: 'block' }}>
      {kind === 'line' && (
        <g fill="none" stroke={stroke} strokeWidth="1.4" strokeLinecap="round">
          <circle cx="20" cy="22" r="9" />
          <path d="M14 36 L28 36 M32 22 L48 22 M32 28 L46 28" />
        </g>
      )}
      {kind === 'flat' && (
        <g>
          <rect x="6" y="10" width="20" height="20" rx="2" fill={accent} />
          <circle cx="40" cy="18" r="9" fill={accent + '88'} />
          <polygon points="32,38 46,38 39,28" fill={accent + 'cc'} />
        </g>
      )}
      {kind === '3d' && (
        <g>
          <polygon points="12,25 30,17 30,33 12,41" fill={accent + 'aa'} />
          <polygon points="30,17 48,25 48,41 30,33" fill={accent + '66'} />
          <polygon points="12,25 30,17 48,25 30,33" fill={accent} />
        </g>
      )}
      {kind === 'hand_drawn' && (
        <g fill="none" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M8 30 Q14 14 22 22 T36 26 T50 18" />
          <path d="M10 36 Q24 32 38 38 T54 34" opacity="0.5" />
        </g>
      )}
      {kind === 'mixed' && (
        <g>
          <rect x="6" y="8" width="22" height="14" rx="2" fill={fill} stroke={stroke} strokeWidth="1.2" />
          <circle cx="42" cy="16" r="8" fill={accent} />
          <path d="M10 30 Q24 22 38 32 T54 28" fill="none" stroke={stroke} strokeWidth="1.4" />
        </g>
      )}
    </svg>
  )
}

// ────────────────────────────────────────────────────────────────────
// Section: Animation
// ────────────────────────────────────────────────────────────────────

const MOTION_RECIPES = {
  subtle:    { distance: 8,   scaleFrom: 0.98, duration: 600,  rotate: 0 },
  playful:   { distance: 20,  scaleFrom: 0.85, duration: 600,  rotate: -6 },
  cinematic: { distance: 40,  scaleFrom: 1.05, duration: 1100, rotate: 0 },
  minimal:   { distance: 4,   scaleFrom: 1,    duration: 300,  rotate: 0 },
  bold:      { distance: 50,  scaleFrom: 1.15, duration: 700,  rotate: 0 },
}
const EASING_RECIPES = {
  smooth: 'cubic-bezier(0.16, 1, 0.3, 1)',
  spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
  linear: 'linear',
  sharp:  'cubic-bezier(0.83, 0, 0.17, 1)',
}

function AnimationSection({ ds, update }) {
  const accent = ds.colors?.[0]?.hex || '#8B5CF6'
  // Replay-token bumps every time the user changes anything so the
  // preview tile restarts the keyframe.
  const [replay, setReplay] = useState(0)
  useEffect(() => { setReplay(r => r + 1) }, [ds.motionStyle, ds.easingPreference])

  const recipe = MOTION_RECIPES[ds.motionStyle] || MOTION_RECIPES.subtle
  const easing = EASING_RECIPES[ds.easingPreference] || EASING_RECIPES.smooth
  const keyframeName = `motion-preview-${replay}`

  return (
    <>
      <SectionHeader
        title="Animation"
        subtitle="Motion personality and easing curve. The preview restarts as you change settings."
      />

      <div style={{ marginBottom: 20 }}>
        <FieldLabel>Motion style</FieldLabel>
        <PillSelector
          options={[
            { value: 'subtle',    label: 'Subtle' },
            { value: 'playful',   label: 'Playful' },
            { value: 'cinematic', label: 'Cinematic' },
            { value: 'minimal',   label: 'Minimal' },
            { value: 'bold',      label: 'Bold' },
          ]}
          value={ds.motionStyle}
          onChange={v => update('motionStyle', v)}
        />
      </div>

      <div style={{ marginBottom: 24 }}>
        <FieldLabel>Easing preference</FieldLabel>
        <PillSelector
          options={[
            { value: 'smooth', label: 'Smooth (ease-out)' },
            { value: 'spring', label: 'Spring' },
            { value: 'linear', label: 'Linear' },
            { value: 'sharp',  label: 'Sharp' },
          ]}
          value={ds.easingPreference}
          onChange={v => update('easingPreference', v)}
        />
      </div>

      {/* Live preview — element enters using the chosen recipe.
          Inline <style> defines the keyframe so we don't pollute the
          global CSS namespace. */}
      <div style={{
        background: 'var(--color-surface)', borderRadius: 14, padding: 32,
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16,
      }}>
        <FieldLabel>Live preview</FieldLabel>
        <style>{`
          @keyframes ${keyframeName} {
            from {
              opacity: 0;
              transform: translateY(${recipe.distance}px) scale(${recipe.scaleFrom}) rotate(${recipe.rotate}deg);
            }
            to {
              opacity: 1;
              transform: translateY(0) scale(1) rotate(0deg);
            }
          }
        `}</style>
        <div
          key={replay}
          style={{
            padding: '16px 28px',
            background: accent,
            color: 'white',
            borderRadius: 12,
            fontFamily: 'var(--font-sans)', fontSize: 14, fontWeight: 700,
            boxShadow: `0 10px 30px ${accent}55`,
            animation: `${keyframeName} ${recipe.duration}ms ${easing} both`,
          }}
        >
          Section reveal
        </div>
        <button
          onClick={() => setReplay(r => r + 1)}
          style={{
            padding: '6px 14px', borderRadius: 8,
            border: '1px solid var(--color-border)',
            background: 'var(--color-bg)',
            color: 'var(--color-text)',
            fontFamily: 'var(--font-sans)', fontSize: 12, fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          ↻ Replay
        </button>
      </div>
    </>
  )
}

// ────────────────────────────────────────────────────────────────────
// Section: Shadows
// ────────────────────────────────────────────────────────────────────

const SHADOW_RECIPES = {
  none:    'none',
  soft:    '0 2px 8px rgba(0,0,0,0.06)',
  medium:  '0 8px 24px rgba(0,0,0,0.10)',
  hard:    '0 4px 0px rgba(0,0,0,0.20)',
  floating: '0 20px 48px rgba(0,0,0,0.18)',
  layered: '0 1px 2px rgba(0,0,0,0.08), 0 6px 16px rgba(0,0,0,0.12), 0 24px 60px rgba(0,0,0,0.14)',
}

function tintShadow(recipe, tint, accent) {
  if (recipe === 'none') return recipe
  const colors = {
    black: 'rgba(0,0,0,',
    brand: accent
      ? hexToRgba(accent, '')
      : 'rgba(139,92,246,',
    warm:  'rgba(180,90,40,',
    cool:  'rgba(40,90,140,',
  }
  const repl = colors[tint] || colors.black
  return recipe.replace(/rgba\(0,0,0,/g, repl)
}

function hexToRgba(hex, alpha) {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return `rgba(${r},${g},${b},`
}

function ShadowsSection({ ds, update }) {
  const accent = ds.colors?.[0]?.hex
  const recipe = SHADOW_RECIPES[ds.shadowStyle] || SHADOW_RECIPES.medium
  const previewShadow = tintShadow(recipe, ds.shadowColorTint, accent)

  return (
    <>
      <SectionHeader
        title="Shadows"
        subtitle="Elevation language. The AI uses this for every card, dropdown, and floating element."
      />

      <div style={{ marginBottom: 20 }}>
        <FieldLabel>Style</FieldLabel>
        <PillSelector
          options={[
            { value: 'none',     label: 'None' },
            { value: 'soft',     label: 'Soft' },
            { value: 'medium',   label: 'Medium' },
            { value: 'hard',     label: 'Hard' },
            { value: 'floating', label: 'Floating' },
            { value: 'layered',  label: 'Layered' },
          ]}
          value={ds.shadowStyle}
          onChange={v => update('shadowStyle', v)}
        />
      </div>

      <div style={{ marginBottom: 24 }}>
        <FieldLabel>Color tint</FieldLabel>
        <PillSelector
          options={[
            { value: 'black', label: 'Black' },
            { value: 'brand', label: accent ? `Brand (${accent})` : 'Brand' },
            { value: 'warm',  label: 'Warm' },
            { value: 'cool',  label: 'Cool' },
          ]}
          value={ds.shadowColorTint}
          onChange={v => update('shadowColorTint', v)}
        />
      </div>

      <div style={{
        background: 'var(--color-surface)', borderRadius: 12, padding: 32,
        display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 24,
        flexWrap: 'wrap',
      }}>
        <FieldLabel>Live preview</FieldLabel>
        <div style={{
          width: 220, height: 100, borderRadius: 14,
          background: 'var(--color-bg)',
          border: '1px solid var(--color-border)',
          boxShadow: previewShadow,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--color-text-muted)',
        }}>
          Elevated surface
        </div>
      </div>
    </>
  )
}

// ────────────────────────────────────────────────────────────────────
// Shared bits
// ────────────────────────────────────────────────────────────────────

function SectionHeader({ title, subtitle }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <h3 style={{
        margin: 0, fontFamily: 'var(--font-sans)', fontSize: 18, fontWeight: 800,
        color: 'var(--color-text)', letterSpacing: '-0.02em',
      }}>
        {title}
      </h3>
      {subtitle && (
        <p style={{
          margin: '4px 0 0', fontFamily: 'var(--font-sans)', fontSize: 13,
          color: 'var(--color-text-muted)', lineHeight: 1.5,
        }}>
          {subtitle}
        </p>
      )}
    </div>
  )
}

function FieldLabel({ children }) {
  return (
    <div style={{
      fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700,
      letterSpacing: '0.08em', textTransform: 'uppercase',
      color: 'var(--color-text-muted)', marginBottom: 6,
    }}>
      {children}
    </div>
  )
}

// Hex + colour picker fused into one control. Picker swatch on top,
// editable hex input below — typing a valid 6-char hex updates the
// picker, picking a colour updates the text. Validates lightly so
// the swatch never goes blank.
function HexPicker({ value, onChange }) {
  const [draft, setDraft] = useState(value || '#000000')
  useEffect(() => { setDraft(value || '#000000') }, [value])

  function commit(raw) {
    let v = (raw || '').trim()
    if (!v.startsWith('#')) v = '#' + v
    setDraft(v)
    if (/^#[0-9a-fA-F]{6}$/.test(v)) onChange(v.toUpperCase())
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <input
        type="color"
        value={/^#[0-9a-fA-F]{6}$/.test(draft) ? draft : '#000000'}
        onChange={e => { setDraft(e.target.value.toUpperCase()); onChange(e.target.value.toUpperCase()) }}
        style={{
          width: 52, height: 52, borderRadius: 12,
          border: '2px solid var(--color-border)',
          padding: 2, cursor: 'pointer', background: 'none',
        }}
      />
      <input
        type="text"
        value={draft}
        onChange={e => commit(e.target.value)}
        onBlur={() => {
          // Restore the canonical value if the user left garbage in the
          // input — otherwise it'd look misleading.
          if (!/^#[0-9a-fA-F]{6}$/.test(draft)) setDraft(value || '#000000')
        }}
        spellCheck={false}
        style={{
          width: 52, padding: '4px 2px',
          textAlign: 'center',
          background: 'var(--color-bg)',
          border: '1px solid var(--color-border)',
          borderRadius: 6,
          fontFamily: 'var(--font-mono)', fontSize: 11,
          color: 'var(--color-text)',
          outline: 'none',
        }}
      />
    </div>
  )
}

function TextInput({ value, onChange, placeholder, type = 'text' }) {
  return (
    <input
      type={type}
      value={value ?? ''}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      style={{
        width: '100%', padding: '10px 14px',
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 10,
        color: 'var(--color-text)',
        fontFamily: 'var(--font-sans)', fontSize: 14,
        outline: 'none', boxSizing: 'border-box',
        transition: 'border-color 0.15s',
      }}
      onFocus={e => (e.target.style.borderColor = 'var(--color-accent)')}
      onBlur={e => (e.target.style.borderColor = 'var(--color-border)')}
    />
  )
}

function PillSelector({ options, value, onChange }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {options.map(opt => {
        const isOn = value === opt.value
        return (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            style={{
              padding: '6px 14px', borderRadius: 9999,
              border: `1.5px solid ${isOn ? 'var(--color-accent)' : 'var(--color-border)'}`,
              background: isOn ? 'rgba(139,92,246,0.12)' : 'var(--color-surface)',
              color: isOn ? 'var(--color-accent)' : 'var(--color-text-muted)',
              fontFamily: 'var(--font-sans)', fontSize: 13,
              fontWeight: isOn ? 600 : 400,
              cursor: 'pointer',
              transition: 'background 0.15s, border-color 0.15s, color 0.15s',
            }}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}

// Number input with a static unit suffix — used by Spacing + Icons.
function NumberWithUnit({ value, onChange, unit = 'px', min, max, step = 1 }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'stretch',
      border: '1px solid var(--color-border)', borderRadius: 10,
      background: 'var(--color-surface)',
      overflow: 'hidden',
    }}>
      <input
        type="number"
        value={value ?? ''}
        min={min}
        max={max}
        step={step}
        onChange={e => {
          const v = parseInt(e.target.value, 10)
          if (!isNaN(v)) onChange(v)
        }}
        style={{
          flex: 1, padding: '10px 12px',
          background: 'transparent', border: 'none', outline: 'none',
          fontFamily: 'var(--font-sans)', fontSize: 14,
          color: 'var(--color-text)', minWidth: 0,
        }}
      />
      <span style={{
        display: 'inline-flex', alignItems: 'center',
        padding: '0 10px',
        background: 'var(--color-bg)',
        borderLeft: '1px solid var(--color-border)',
        fontFamily: 'var(--font-mono)', fontSize: 11,
        color: 'var(--color-text-muted)',
      }}>
        {unit}
      </span>
    </div>
  )
}

function SectionLoading() {
  return (
    <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: 13 }}>
      Loading…
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────
// Style constants
// ────────────────────────────────────────────────────────────────────

const overlayStyle = {
  position: 'fixed', inset: 0, zIndex: 1100,
  background: 'rgba(0,0,0,0.55)',
  backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  padding: 20,
}

const modalStyle = {
  width: '100%', maxWidth: 960, maxHeight: 'min(92vh, 780px)',
  background: 'var(--color-bg)',
  border: '1px solid var(--color-border)',
  borderRadius: 20,
  boxShadow: '0 40px 100px rgba(0,0,0,0.5), 0 0 0 1px rgba(139,92,246,0.08)',
  display: 'flex', flexDirection: 'column',
  overflow: 'hidden',
  fontFamily: 'var(--font-sans)',
}

const headerStyle = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  padding: '16px 22px',
  borderBottom: '1px solid var(--color-border)',
  background: 'linear-gradient(180deg, rgba(139,92,246,0.04), transparent)',
  flexShrink: 0,
}

const bodyStyle = {
  flex: 1, minHeight: 0,
  display: 'grid', gridTemplateColumns: '200px 1fr',
}

const navStyle = {
  borderRight: '1px solid var(--color-border)',
  padding: 10,
  overflowY: 'auto',
  background: 'var(--color-card)',
}

const contentStyle = {
  padding: '28px 32px',
  overflowY: 'auto',
}

const footerStyle = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  gap: 10, padding: '12px 18px',
  borderTop: '1px solid var(--color-border)',
  background: 'var(--color-card)',
  flexShrink: 0,
}

const iconBtn = {
  width: 30, height: 30, borderRadius: 8,
  background: 'transparent', border: '1px solid var(--color-border)',
  color: 'var(--color-text-muted)',
  cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
}

const skipBtn = {
  padding: '9px 14px',
  background: 'transparent',
  border: 'none',
  color: 'var(--color-text-muted)',
  fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 600,
  cursor: 'pointer',
  textDecoration: 'underline',
  textDecorationStyle: 'dashed',
  textUnderlineOffset: 4,
}

const cancelBtn = {
  padding: '9px 16px',
  background: 'transparent',
  border: '1px solid var(--color-border)',
  borderRadius: 10,
  color: 'var(--color-text)',
  fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 600,
  cursor: 'pointer',
}

const primaryBtn = {
  padding: '9px 18px',
  background: 'linear-gradient(135deg, #8B5CF6, #6366F1)',
  border: 'none',
  borderRadius: 10,
  color: 'white',
  fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 700,
  cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center', gap: 6,
  boxShadow: '0 4px 14px rgba(124,58,237,0.30)',
}

const selectStyle = {
  width: '100%', padding: '10px 14px',
  background: 'var(--color-surface)',
  border: '1px solid var(--color-border)',
  borderRadius: 10,
  color: 'var(--color-text)',
  fontFamily: 'var(--font-sans)', fontSize: 14,
  outline: 'none', cursor: 'pointer', boxSizing: 'border-box',
}

const fontLink = {
  fontFamily: 'var(--font-mono)', fontSize: 11,
  color: 'var(--color-accent)',
  textDecoration: 'none',
  display: 'block', marginTop: 6,
}
