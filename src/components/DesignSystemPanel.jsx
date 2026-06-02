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

const COLOR_ROLES = ['primary', 'secondary', 'accent', 'background', 'surface', 'text', 'success', 'warning', 'error']

function ColorsSection({ ds, update }) {
  const [newColor, setNewColor] = useState({ hex: '#8B5CF6', name: '', role: 'primary' })

  function addColor() {
    if (!newColor.name.trim()) return
    update('colors', [
      ...(ds.colors || []),
      { ...newColor, id: Date.now().toString() },
    ])
    setNewColor({ hex: '#8B5CF6', name: '', role: 'primary' })
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
          <input
            type="color"
            value={newColor.hex}
            onChange={e => setNewColor(p => ({ ...p, hex: e.target.value }))}
            style={{
              width: 52, height: 52, borderRadius: 12,
              border: '2px solid var(--color-border)',
              padding: 2, cursor: 'pointer', background: 'none',
            }}
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
            </select>
          </div>
        </div>
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
          <TextInput value={ds.headingFont} onChange={v => update('headingFont', v)} placeholder="Fraunces" />
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
            <WeightPicker weights={ds.headingWeights || []} onToggle={w => toggleWeight('headingWeights', w)} />
          </div>
        </div>
        <div>
          <FieldLabel>Body font</FieldLabel>
          <TextInput value={ds.bodyFont} onChange={v => update('bodyFont', v)} placeholder="DM Sans" />
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
            <WeightPicker weights={ds.bodyWeights || []} onToggle={w => toggleWeight('bodyWeights', w)} />
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
          {Object.entries(scale).map(([name, size]) => (
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
                fontFamily: name === 'body'
                  ? (ds.bodyFont || 'inherit')
                  : (ds.headingFont || 'inherit'),
                fontSize: `${size}px`,
                color: 'var(--color-text)',
                lineHeight: 1.2,
              }}>
                {size}px sample
              </span>
            </div>
          ))}
        </div>
      )}
    </>
  )
}

function WeightPicker({ weights, onToggle }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {WEIGHTS.map(w => {
        const isOn = weights.includes(w)
        return (
          <button
            key={w}
            onClick={() => onToggle(w)}
            style={{
              padding: '4px 10px', borderRadius: 6,
              border: `1px solid ${isOn ? 'var(--color-accent)' : 'var(--color-border)'}`,
              background: isOn ? 'rgba(139,92,246,0.1)' : 'transparent',
              color: isOn ? 'var(--color-accent)' : 'var(--color-text-muted)',
              fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: w,
              cursor: 'pointer',
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

  const previewStyle = {
    padding: ds.buttonSize === 'small' ? '6px 14px' : ds.buttonSize === 'large' ? '14px 28px' : '10px 20px',
    borderRadius:
      ds.buttonRadius === 'pill' ? 9999
        : ds.buttonRadius === 'square' ? 0
          : ds.buttonRadiusValue,
    border: ds.buttonStyle === 'outlined' ? `2px solid ${accent}` : 'none',
    background:
      ds.buttonStyle === 'filled' ? accent
        : ds.buttonStyle === 'soft' ? accent + '22'
          : 'transparent',
    color: ds.buttonStyle === 'filled' ? 'white' : accent,
    fontFamily: ds.bodyFont || 'var(--font-sans)',
    fontWeight: ds.buttonWeight,
    fontSize: ds.buttonSize === 'small' ? 13 : ds.buttonSize === 'large' ? 16 : 14,
    cursor: 'pointer',
  }

  return (
    <>
      <SectionHeader
        title="Buttons"
        subtitle="Define the button language. The AI applies this to every CTA it generates."
      />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
        <div>
          <FieldLabel>Shape</FieldLabel>
          <PillSelector
            options={[
              { value: 'square', label: 'Square' },
              { value: 'rounded', label: 'Rounded' },
              { value: 'pill', label: 'Pill' },
              { value: 'custom', label: 'Custom' },
            ]}
            value={ds.buttonRadius}
            onChange={v => update('buttonRadius', v)}
          />
          {ds.buttonRadius === 'custom' && (
            <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="range"
                min="0"
                max="32"
                value={ds.buttonRadiusValue}
                onChange={e => update('buttonRadiusValue', parseInt(e.target.value, 10))}
                style={{ flex: 1 }}
              />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--color-text)', minWidth: 36 }}>
                {ds.buttonRadiusValue}px
              </span>
            </div>
          )}
        </div>
        <div>
          <FieldLabel>Fill style</FieldLabel>
          <PillSelector
            options={[
              { value: 'filled', label: 'Filled' },
              { value: 'outlined', label: 'Outlined' },
              { value: 'soft', label: 'Soft' },
              { value: 'ghost', label: 'Ghost' },
            ]}
            value={ds.buttonStyle}
            onChange={v => update('buttonStyle', v)}
          />
        </div>
        <div>
          <FieldLabel>Size</FieldLabel>
          <PillSelector
            options={[
              { value: 'small', label: 'Small' },
              { value: 'medium', label: 'Medium' },
              { value: 'large', label: 'Large' },
            ]}
            value={ds.buttonSize}
            onChange={v => update('buttonSize', v)}
          />
        </div>
        <div>
          <FieldLabel>Font weight</FieldLabel>
          <PillSelector
            options={[
              { value: '400', label: 'Regular' },
              { value: '500', label: 'Medium' },
              { value: '600', label: 'Semibold' },
              { value: '700', label: 'Bold' },
            ]}
            value={ds.buttonWeight}
            onChange={v => update('buttonWeight', v)}
          />
        </div>
      </div>

      <div style={{
        background: 'var(--color-surface)', borderRadius: 12, padding: '24px 16px',
      }}>
        <FieldLabel>Live preview</FieldLabel>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', marginTop: 10 }}>
          <button style={previewStyle}>Get started</button>
          <button style={{
            ...previewStyle,
            background: 'transparent',
            border: '1.5px solid var(--color-border)',
            color: 'var(--color-text-muted)',
          }}>
            Learn more
          </button>
        </div>
      </div>
    </>
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
    </>
  )
}

// ────────────────────────────────────────────────────────────────────
// Section: Imagery
// ────────────────────────────────────────────────────────────────────

function ImagerySection({ ds, update }) {
  return (
    <>
      <SectionHeader
        title="Imagery"
        subtitle="Photography style + treatment + illustration. The AI picks imagery in this language."
      />

      <div style={{ marginBottom: 18 }}>
        <FieldLabel>Photography style</FieldLabel>
        <PillSelector
          options={[
            { value: 'lifestyle', label: 'Lifestyle' },
            { value: 'studio',    label: 'Studio' },
            { value: 'editorial', label: 'Editorial' },
            { value: 'candid',    label: 'Candid' },
            { value: 'minimal',   label: 'Minimal' },
            { value: 'none',      label: 'No photography' },
          ]}
          value={ds.photographyStyle}
          onChange={v => update('photographyStyle', v)}
        />
      </div>

      <div style={{ marginBottom: 18 }}>
        <FieldLabel>Image treatment</FieldLabel>
        <PillSelector
          options={[
            { value: 'full_color',     label: 'Full color' },
            { value: 'black_white',    label: 'Black & white' },
            { value: 'duotone',        label: 'Duotone' },
            { value: 'desaturated',    label: 'Desaturated' },
            { value: 'high_contrast',  label: 'High contrast' },
          ]}
          value={ds.imageTreatment}
          onChange={v => update('imageTreatment', v)}
        />
      </div>

      <div>
        <FieldLabel>Illustration style</FieldLabel>
        <PillSelector
          options={[
            { value: 'none',       label: 'No illustration' },
            { value: 'line',       label: 'Line art' },
            { value: 'flat',       label: 'Flat geometric' },
            { value: '3d',         label: '3D / isometric' },
            { value: 'hand_drawn', label: 'Hand drawn' },
            { value: 'mixed',      label: 'Mixed media' },
          ]}
          value={ds.illustrationStyle}
          onChange={v => update('illustrationStyle', v)}
        />
      </div>
    </>
  )
}

// ────────────────────────────────────────────────────────────────────
// Section: Animation
// ────────────────────────────────────────────────────────────────────

function AnimationSection({ ds, update }) {
  return (
    <>
      <SectionHeader
        title="Animation"
        subtitle="Motion personality and easing curve. The AI applies this to every transition + reveal."
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

      <div>
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
  width: '100%', maxWidth: 900, maxHeight: 'min(90vh, 720px)',
  background: 'var(--color-bg)',
  border: '1px solid var(--color-border)',
  borderRadius: 18,
  boxShadow: '0 30px 80px rgba(0,0,0,0.45)',
  display: 'flex', flexDirection: 'column',
  overflow: 'hidden',
  fontFamily: 'var(--font-sans)',
}

const headerStyle = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  padding: '14px 18px',
  borderBottom: '1px solid var(--color-border)',
  flexShrink: 0,
}

const bodyStyle = {
  flex: 1, minHeight: 0,
  display: 'grid', gridTemplateColumns: '180px 1fr',
}

const navStyle = {
  borderRight: '1px solid var(--color-border)',
  padding: 10,
  overflowY: 'auto',
  background: 'var(--color-card)',
}

const contentStyle = {
  padding: 24,
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
