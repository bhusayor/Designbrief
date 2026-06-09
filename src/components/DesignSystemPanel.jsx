import { useState, useEffect, useContext, useRef } from 'react'
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
  ChevronDownIcon,
} from '@heroicons/react/24/outline'
import AppContext from '../context/AppContext'
import { supabase } from '../lib/supabase'
import { searchPexelsImage } from '../lib/pexels'
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

// Comprehensive Google Fonts list — the ~200 most-used faces grouped
// by category, alphabetised within each group so type-to-filter feels
// predictable. Covers everything a designer reaches for without
// pulling the full 1500+ catalog into the bundle.
const FONT_CATALOG = {
  sans: [
    'Albert Sans', 'Archivo', 'Assistant', 'Asap', 'Barlow', 'Be Vietnam Pro',
    'Cabin', 'Catamaran', 'Chivo', 'DM Sans', 'Darker Grotesque', 'Epilogue',
    'Exo 2', 'Figtree', 'Fira Sans', 'Geist', 'Heebo', 'Hind', 'IBM Plex Sans',
    'Inter', 'Karla', 'Kanit', 'Kumbh Sans', 'Lato', 'Lexend', 'Libre Franklin',
    'Manrope', 'Maven Pro', 'Montserrat', 'Mulish', 'Noto Sans', 'Nunito',
    'Nunito Sans', 'Onest', 'Open Sans', 'Outfit', 'Oxanium', 'PT Sans',
    'Plus Jakarta Sans', 'Poppins', 'Public Sans', 'Quicksand', 'Raleway',
    'Red Hat Display', 'Roboto', 'Roboto Flex', 'Rubik', 'Sarabun', 'Sora',
    'Source Sans 3', 'Space Grotesk', 'Spline Sans', 'Syne', 'Titillium Web',
    'Ubuntu', 'Urbanist', 'Varela Round', 'Work Sans',
  ],
  serif: [
    'Aleo', 'Alegreya', 'Arvo', 'Bitter', 'Bodoni Moda', 'Cardo',
    'Cormorant', 'Cormorant Garamond', 'Crimson Pro', 'Crimson Text',
    'DM Serif Display', 'DM Serif Text', 'EB Garamond', 'Eczar', 'Faustina',
    'Fraunces', 'Frank Ruhl Libre', 'Gentium Book Plus', 'IBM Plex Serif',
    'Inknut Antiqua', 'Instrument Serif', 'Lora', 'Libre Baskerville',
    'Libre Caslon Text', 'Lustria', 'Marcellus', 'Markazi Text',
    'Merriweather', 'Newsreader', 'Noticia Text', 'Noto Serif',
    'Old Standard TT', 'PT Serif', 'Petrona', 'Playfair', 'Playfair Display',
    'Prata', 'Reem Kufi', 'Roboto Serif', 'Roboto Slab', 'Rozha One',
    'Source Serif 4', 'Spectral', 'Tinos', 'Vollkorn', 'Yeseva One',
    'Yrsa', 'Zilla Slab',
  ],
  display: [
    'Abril Fatface', 'Alfa Slab One', 'Anton', 'Archivo Black',
    'Bebas Neue', 'Big Shoulders Display', 'Black Ops One',
    'Bricolage Grotesque', 'Bungee', 'Cabin Sketch', 'Carter One',
    'Chakra Petch', 'Changa One', 'Climate Crisis', 'Concert One',
    'Comfortaa', 'Domine', 'Familjen Grotesk', 'Fjalla One',
    'Fredoka', 'Funnel Display', 'Gloock', 'Gloria Hallelujah',
    'Inter Tight', 'Josefin Sans', 'Khand', 'Krona One', 'Lobster',
    'Major Mono Display', 'Monoton', 'Montagu Slab', 'Mr Dafoe',
    'Norwester', 'Oranienbaum', 'Orbitron', 'Oswald', 'Paytone One',
    'Permanent Marker', 'Philosopher', 'Poltawski Nowy',
    'Press Start 2P', 'Prosto One', 'Rajdhani', 'Rampart One',
    'Righteous', 'Rye', 'Sacramento', 'Sail', 'Saira', 'Seaweed Script',
    'Shadows Into Light', 'Special Elite', 'Stalemate', 'Staatliches',
    'Stalinist One', 'Style Script', 'Syncopate', 'Teko',
    'Tilt Neon', 'Tomorrow', 'Ultra', 'Unica One', 'Yatra One',
    'Yeon Sung', 'Zen Dots',
  ],
  mono: [
    'Anonymous Pro', 'Azeret Mono', 'Cousine', 'DM Mono', 'Fira Code',
    'Fira Mono', 'IBM Plex Mono', 'Inconsolata', 'JetBrains Mono',
    'Major Mono Display', 'Martian Mono', 'Noto Sans Mono', 'Overpass Mono',
    'PT Mono', 'Red Hat Mono', 'Roboto Mono', 'Source Code Pro',
    'Space Mono', 'Spline Sans Mono', 'Ubuntu Mono', 'VT323', 'Workbench',
  ],
  handwriting: [
    'Allison', 'Architects Daughter', 'Bad Script', 'Caveat',
    'Comforter Brush', 'Dancing Script', 'Indie Flower',
    'Just Another Hand', 'Kalam', 'Liu Jian Mao Cao', 'Mansalva',
    'Pacifico', 'Patrick Hand', 'Reenie Beanie', 'Satisfy', 'Yellowtail',
  ],
}
// Flattened + alphabetised so the combobox reads as one A→Z list
// rather than five disjoint groups. localeCompare keeps numerals and
// accents in a sensible order.
const FONT_LIST = [
  ...FONT_CATALOG.sans,
  ...FONT_CATALOG.serif,
  ...FONT_CATALOG.display,
  ...FONT_CATALOG.mono,
  ...FONT_CATALOG.handwriting,
].sort((a, b) => a.localeCompare(b))

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

  if (!isOpen) return null

  return createPortal((
    <div onClick={onClose} className="ds-overlay" style={overlayStyle}>
      <style>{`
        /* Mobile responsive overrides for the Design System modal.
           The desktop layout uses a 200px sidebar nav + flexible
           content column; on narrow screens that strands the
           content with almost no room, so we flatten everything to
           a single column and turn the nav into a horizontal pill
           strip the user can scroll. Modal also drops its rounded
           edges and overlay padding so it reads as a full-screen
           sheet on phones. */
        @media (max-width: 767px) {
          .ds-overlay {
            padding: 0 !important;
            align-items: stretch !important;
          }
          .ds-modal {
            max-width: 100% !important;
            width: 100% !important;
            height: 100dvh !important;
            max-height: 100dvh !important;
            border-radius: 0 !important;
            border-left: none !important;
            border-right: none !important;
          }
          .ds-header {
            padding: 12px 14px !important;
          }
          .ds-header-title {
            font-size: 14px !important;
          }
          .ds-header-sub {
            display: none !important;
          }
          .ds-body {
            grid-template-columns: 1fr !important;
            grid-template-rows: auto 1fr !important;
          }
          .ds-nav {
            display: flex !important;
            flex-direction: row !important;
            gap: 6px !important;
            padding: 10px 12px !important;
            border-right: none !important;
            border-bottom: 1px solid var(--color-border) !important;
            overflow-x: auto !important;
            overflow-y: hidden !important;
            -webkit-overflow-scrolling: touch;
            flex-wrap: nowrap !important;
          }
          .ds-nav > button {
            flex: 0 0 auto !important;
            width: auto !important;
            padding: 7px 12px !important;
            border-radius: 100px !important;
            background: var(--color-surface) !important;
            font-size: 12px !important;
            white-space: nowrap !important;
            margin-bottom: 0 !important;
          }
          .ds-content {
            padding: 18px 16px 22px !important;
          }
          .ds-footer {
            padding: 10px 14px !important;
            gap: 8px !important;
          }
          .ds-footer button {
            padding: 9px 14px !important;
            font-size: 13px !important;
          }
        }
      `}</style>
      <div onClick={e => e.stopPropagation()} className="ds-modal" style={modalStyle}>
        {/* Header */}
        <div className="ds-header" style={headerStyle}>
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
              <div className="ds-header-title" style={{
                fontFamily: 'var(--font-sans)', fontWeight: 800, fontSize: 15,
                color: 'var(--color-text)', letterSpacing: '-0.01em',
              }}>
                Design System
              </div>
              <div className="ds-header-sub" style={{ fontSize: 11.5, color: 'var(--color-text-muted)' }}>
                The source of truth for every AI generation in this project
              </div>
            </div>
          </div>
          <button onClick={onClose} style={iconBtn} aria-label="Close">
            <XMarkIcon style={{ width: 16, height: 16 }} />
          </button>
        </div>

        {/* Body */}
        <div className="ds-body" style={bodyStyle}>
          {/* Left rail — section nav */}
          <aside className="ds-nav" style={navStyle}>
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
          <main className="ds-content" style={contentStyle}>
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
        <div className="ds-footer" style={footerStyle}>
          <span />
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
      <div
        onClick={() => setOpen(true)}
        style={{
          display: 'flex', alignItems: 'center',
          background: 'var(--color-surface)',
          border: `1px solid ${open ? 'var(--color-accent)' : 'var(--color-border)'}`,
          borderRadius: 10,
          transition: 'border-color 0.15s',
        }}
      >
        <input
          type="text"
          value={draft}
          onChange={e => { setDraft(e.target.value); setOpen(true); onChange(e.target.value) }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          style={{
            flex: 1, padding: '10px 14px',
            background: 'transparent',
            border: 'none',
            color: 'var(--color-text)',
            fontFamily: draft && FONT_LIST.includes(draft) ? `"${draft}", sans-serif` : 'var(--font-sans)',
            fontSize: 14,
            outline: 'none', boxSizing: 'border-box',
            minWidth: 0,
          }}
        />
        <ChevronDownIcon
          style={{
            width: 16, height: 16, marginRight: 10, flexShrink: 0,
            color: 'var(--color-text-muted)',
            transform: open ? 'rotate(180deg)' : 'none',
            transition: 'transform 0.15s',
          }}
        />
      </div>
      {open && filtered.length > 0 && (
        <div style={{
          position: 'absolute', left: 0, right: 0, top: 'calc(100% + 4px)',
          zIndex: 20,
          maxHeight: 320, overflowY: 'auto',
          background: 'var(--color-bg)',
          border: '1px solid var(--color-border)',
          borderRadius: 10,
          boxShadow: 'var(--shadow-dropdown, 0 10px 30px rgba(0,0,0,0.18))',
          padding: 4,
        }}>
          {filtered.map(f => (
            <LazyFontOption
              key={f}
              family={f}
              isSelected={f === value}
              onPick={commit}
            />
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

// One row in the font combobox dropdown. Lazy-loads its Google Font
// only after the row scrolls into view — without this, opening the
// dropdown would inject 200 <link> tags into the document head and
// hammer Google Fonts' CDN. IntersectionObserver disconnects after
// the first hit so the row stays "loaded" once seen.
function LazyFontOption({ family, isSelected, onPick }) {
  const ref = useRef(null)
  const [seen, setSeen] = useState(false)
  useEffect(() => {
    if (!ref.current) return
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setSeen(true); obs.disconnect() }
    }, { threshold: 0.01 })
    obs.observe(ref.current)
    return () => obs.disconnect()
  }, [])
  return (
    <button
      ref={ref}
      onClick={() => onPick(family)}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        width: '100%', padding: '8px 10px',
        background: isSelected ? 'rgba(139,92,246,0.10)' : 'transparent',
        border: 'none', borderRadius: 7,
        color: 'var(--color-text)', cursor: 'pointer',
        fontFamily: seen ? `"${family}", sans-serif` : 'var(--font-sans)',
        fontSize: 14, textAlign: 'left',
      }}
      onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'var(--color-surface)' }}
      onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent' }}
    >
      <span>{family}</span>
      {seen && <PreviewLoader family={family} />}
    </button>
  )
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

// Per-option Pexels search queries — chosen to land on a
// representative image for each style. Image URLs come back from
// our /api/pexels proxy.
const PHOTO_QUERIES = {
  lifestyle: 'lifestyle people morning coffee',
  studio:    'studio product still life',
  editorial: 'editorial fashion magazine',
  candid:    'candid moment portrait',
  minimal:   'minimal still life white',
}
const ILLUSTRATION_QUERIES = {
  line:       'line art illustration minimal',
  flat:       'flat geometric illustration',
  '3d':       '3d isometric illustration',
  hand_drawn: 'hand drawn sketch illustration',
  mixed:      'mixed media collage illustration',
}
// Shared image for the Treatment tiles — same base shot under
// different CSS filters so the user sees the actual treatment effect.
const TREATMENT_BASE_QUERY = 'portrait warm soft light'

// Module-level cache so navigating off the section and back doesn't
// re-fetch the same image. Keyed by query string → image URL.
const imageCache = new Map()
const inflight = new Map()

function useTileImage(query) {
  const [url, setUrl] = useState(() => imageCache.get(query) || null)
  useEffect(() => {
    if (!query) return
    const cached = imageCache.get(query)
    if (cached) { setUrl(cached); return }
    // Dedupe concurrent fetches for the same query — when the panel
    // opens for the first time, every visible tile would otherwise
    // fire its own request even though they want the same answer.
    let cancelled = false
    const promise = inflight.get(query) || (() => {
      const p = searchPexelsImage(query, { perPage: 1, orientation: 'landscape' })
        .then(r => {
          const u = r?.small || r?.thumbnail || r?.medium || r?.url || null
          if (u) imageCache.set(query, u)
          inflight.delete(query)
          return u
        })
        .catch(() => { inflight.delete(query); return null })
      inflight.set(query, p)
      return p
    })()
    promise.then(u => { if (!cancelled && u) setUrl(u) })
    return () => { cancelled = true }
  }, [query])
  return url
}

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

// ── Photography style — real Pexels image per style. Loading state
// keeps the tile sized stable so layout never jumps when the image
// arrives.
function PhotoArt({ kind }) {
  const url = useTileImage(kind === 'none' ? null : PHOTO_QUERIES[kind])
  if (kind === 'none') return <PlaceholderTile label="NO PHOTO" />
  if (!url) return <LoadingTile />
  return (
    <img
      src={url}
      alt=""
      loading="lazy"
      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
    />
  )
}

// ── Treatment — same base portrait under each CSS filter. The user
// sees the actual look of the treatment on a real face.
function TreatmentArt({ kind, accent }) {
  const url = useTileImage(TREATMENT_BASE_QUERY)
  const filterMap = {
    full_color:    'none',
    black_white:   'grayscale(1) contrast(1.05)',
    duotone:       `grayscale(1) sepia(1) hue-rotate(${hexToHue(accent) - 30}deg) saturate(2.2) contrast(1.05)`,
    desaturated:   'saturate(0.35) brightness(0.95)',
    high_contrast: 'contrast(1.5) saturate(1.4)',
  }
  if (!url) return <LoadingTile />
  return (
    <img
      src={url}
      alt=""
      loading="lazy"
      style={{
        width: '100%', height: '100%', objectFit: 'cover', display: 'block',
        filter: filterMap[kind] || 'none',
      }}
    />
  )
}

function PlaceholderTile({ label }) {
  return (
    <div style={{
      width: '100%', height: '100%',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: 'var(--color-text-muted)', fontSize: 10,
      fontFamily: 'var(--font-mono)', letterSpacing: '0.08em',
    }}>
      {label}
    </div>
  )
}

function LoadingTile() {
  return (
    <div style={{
      width: '100%', height: '100%',
      background: 'linear-gradient(90deg, var(--color-surface) 0%, var(--color-card) 50%, var(--color-surface) 100%)',
      backgroundSize: '200% 100%',
      animation: 'tilePulse 1.2s ease-in-out infinite',
    }}>
      <style>{`
        @keyframes tilePulse {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
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

// ── Illustration — real Pexels result per style. Pexels indexes a
// lot of illustration work, so a search query lands on a
// representative example of each style. Falls back to the placeholder
// if Pexels returns nothing for an obscure category.
function IllustrationArt({ kind }) {
  const url = useTileImage(kind === 'none' ? null : ILLUSTRATION_QUERIES[kind])
  if (kind === 'none') return <PlaceholderTile label="NONE" />
  if (!url) return <LoadingTile />
  return (
    <img
      src={url}
      alt=""
      loading="lazy"
      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
    />
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

// Figma-style colour picker.
// Click the swatch → popover with an SV plane, hue slider, and a
// hex input. The plane updates as you drag, the hex input updates
// as you drag, and typing into the hex input moves the plane +
// hue cursor. No native <input type="color"> — that picker's
// chrome can't be styled and feels off-brand.
function HexPicker({ value, onChange }) {
  const [draft, setDraft] = useState(value || '#000000')
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const swatchRef = useRef(null)
  useEffect(() => { setDraft(value || '#000000') }, [value])

  function openPopover() {
    if (!swatchRef.current) return setOpen(true)
    const r = swatchRef.current.getBoundingClientRect()
    // Default: drop to the right of the swatch. If that overflows
    // viewport, fall back to under the swatch instead.
    const popW = 248
    const popH = 260
    let left = r.right + 10
    let top = r.top
    if (left + popW > window.innerWidth - 12) {
      left = Math.max(12, r.left)
      top = r.bottom + 10
    }
    if (top + popH > window.innerHeight - 12) {
      top = Math.max(12, window.innerHeight - popH - 12)
    }
    setPos({ top, left })
    setOpen(true)
  }

  function commitText(raw) {
    let v = (raw || '').trim()
    if (!v.startsWith('#')) v = '#' + v
    setDraft(v)
    if (/^#[0-9a-fA-F]{6}$/.test(v)) onChange(v.toUpperCase())
  }

  const validSwatch = /^#[0-9a-fA-F]{6}$/.test(draft) ? draft : '#000000'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <button
        ref={swatchRef}
        type="button"
        onClick={openPopover}
        aria-label="Pick colour"
        style={{
          width: 52, height: 52, borderRadius: 12,
          background: validSwatch,
          border: '2px solid var(--color-border)',
          boxShadow: `inset 0 0 0 1px rgba(255,255,255,0.08), 0 2px 8px ${validSwatch}55`,
          cursor: 'pointer', padding: 0,
          transition: 'transform 0.1s',
        }}
        onMouseDown={e => e.currentTarget.style.transform = 'scale(0.97)'}
        onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
        onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
      />
      <input
        type="text"
        value={draft}
        onChange={e => commitText(e.target.value)}
        onBlur={() => {
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
      {open && createPortal(
        <ColorPickerPopover
          value={validSwatch}
          top={pos.top}
          left={pos.left}
          onChange={hex => {
            setDraft(hex)
            onChange(hex)
          }}
          onClose={() => setOpen(false)}
        />,
        document.body,
      )}
    </div>
  )
}

// ── Figma-style popover ────────────────────────────────────────────
// SV plane + hue strip + hex input. Portalled so it can escape the
// modal's overflow:hidden. Closes on outside click or Escape.
function ColorPickerPopover({ value, top, left, onChange, onClose }) {
  const ref = useRef(null)
  const [hsv, setHsv] = useState(() => hexToHsv(value))
  const [hexDraft, setHexDraft] = useState(value.toUpperCase())

  // External value can change (typing in the small hex box). Sync.
  useEffect(() => {
    const next = hexToHsv(value)
    setHsv(next)
    setHexDraft(value.toUpperCase())
  }, [value])

  useEffect(() => {
    function onDoc(e) {
      if (ref.current && !ref.current.contains(e.target)) onClose()
    }
    function onKey(e) { if (e.key === 'Escape') onClose() }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  function pushHsv(next) {
    setHsv(next)
    const hex = hsvToHex(next).toUpperCase()
    setHexDraft(hex)
    onChange(hex)
  }

  function commitHex(raw) {
    let v = (raw || '').trim().toUpperCase()
    if (!v.startsWith('#')) v = '#' + v
    setHexDraft(v)
    if (/^#[0-9A-F]{6}$/.test(v)) {
      setHsv(hexToHsv(v))
      onChange(v)
    }
  }

  const pureHue = hsvToHex({ h: hsv.h, s: 100, v: 100 })

  return (
    <div
      ref={ref}
      onMouseDown={e => e.stopPropagation()}
      style={{
        position: 'fixed',
        top, left,
        width: 248,
        background: 'var(--color-bg)',
        border: '1px solid var(--color-border)',
        borderRadius: 12,
        boxShadow: '0 18px 50px rgba(0,0,0,0.45), 0 0 0 1px rgba(139,92,246,0.08)',
        padding: 12,
        zIndex: 10000,
        fontFamily: 'var(--font-sans)',
      }}
    >
      <SVPlane hsv={hsv} hueColor={pureHue} onChange={pushHsv} />
      <HueStrip h={hsv.h} onChange={h => pushHsv({ ...hsv, h })} />
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, marginTop: 12,
      }}>
        <div style={{
          width: 28, height: 28, borderRadius: 6,
          background: hexDraft,
          border: '1.5px solid var(--color-border)',
          flexShrink: 0,
        }} />
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: 10,
          color: 'var(--color-text-muted)',
          letterSpacing: '0.08em',
        }}>
          HEX
        </span>
        <input
          type="text"
          value={hexDraft.replace('#', '')}
          onChange={e => commitHex(e.target.value)}
          onBlur={() => {
            if (!/^#[0-9A-F]{6}$/.test(hexDraft)) setHexDraft(hsvToHex(hsv).toUpperCase())
          }}
          spellCheck={false}
          maxLength={6}
          style={{
            flex: 1, padding: '7px 9px',
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 7,
            fontFamily: 'var(--font-mono)', fontSize: 13,
            color: 'var(--color-text)',
            outline: 'none', textTransform: 'uppercase',
          }}
        />
      </div>
    </div>
  )
}

// ── SV (saturation/value) plane ────────────────────────────────────
// Background is a horizontal saturation gradient overlaid by a
// vertical value (black) gradient. Cursor position = hsv. Pointer
// events tracked window-wide so drags that leave the plane still
// register until release.
function SVPlane({ hsv, hueColor, onChange }) {
  const ref = useRef(null)
  const [dragging, setDragging] = useState(false)

  function pickAt(clientX, clientY) {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const x = Math.max(0, Math.min(1, (clientX - r.left) / r.width))
    const y = Math.max(0, Math.min(1, (clientY - r.top) / r.height))
    onChange({ h: hsv.h, s: x * 100, v: (1 - y) * 100 })
  }

  useEffect(() => {
    if (!dragging) return
    function onMove(e) { pickAt(e.clientX, e.clientY) }
    function onUp() { setDragging(false) }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragging, hsv.h])

  return (
    <div
      ref={ref}
      onMouseDown={e => {
        setDragging(true)
        pickAt(e.clientX, e.clientY)
      }}
      style={{
        position: 'relative',
        width: '100%', aspectRatio: '1.45 / 1',
        borderRadius: 8,
        background: `
          linear-gradient(to top, #000, transparent),
          linear-gradient(to right, #fff, ${hueColor})
        `,
        cursor: 'crosshair',
        userSelect: 'none',
      }}
    >
      <div style={{
        position: 'absolute',
        left: `${hsv.s}%`, top: `${100 - hsv.v}%`,
        width: 14, height: 14, borderRadius: '50%',
        border: '2px solid white',
        boxShadow: '0 0 0 1px rgba(0,0,0,0.35)',
        transform: 'translate(-50%, -50%)',
        pointerEvents: 'none',
      }} />
    </div>
  )
}

// ── Hue strip ──────────────────────────────────────────────────────
function HueStrip({ h, onChange }) {
  const ref = useRef(null)
  const [dragging, setDragging] = useState(false)

  function pickAt(clientX) {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const x = Math.max(0, Math.min(1, (clientX - r.left) / r.width))
    onChange(x * 360)
  }

  useEffect(() => {
    if (!dragging) return
    function onMove(e) { pickAt(e.clientX) }
    function onUp() { setDragging(false) }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragging])

  const knobColor = hsvToHex({ h, s: 100, v: 100 })

  return (
    <div
      ref={ref}
      onMouseDown={e => {
        setDragging(true)
        pickAt(e.clientX)
      }}
      style={{
        position: 'relative', marginTop: 12,
        width: '100%', height: 12, borderRadius: 6,
        background: 'linear-gradient(to right, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)',
        cursor: 'pointer',
        userSelect: 'none',
      }}
    >
      <div style={{
        position: 'absolute',
        top: '50%', left: `${(h / 360) * 100}%`,
        width: 16, height: 16, borderRadius: '50%',
        background: knobColor,
        border: '2px solid white',
        boxShadow: '0 0 0 1px rgba(0,0,0,0.35)',
        transform: 'translate(-50%, -50%)',
        pointerEvents: 'none',
      }} />
    </div>
  )
}

// ── HSV ↔ HEX helpers ─────────────────────────────────────────────
function hexToHsv(hex) {
  const clean = (hex || '').replace('#', '')
  if (clean.length !== 6) return { h: 0, s: 0, v: 0 }
  const r = parseInt(clean.slice(0, 2), 16) / 255
  const g = parseInt(clean.slice(2, 4), 16) / 255
  const b = parseInt(clean.slice(4, 6), 16) / 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  const d = max - min
  let h = 0
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h *= 60
    if (h < 0) h += 360
  }
  const s = max === 0 ? 0 : (d / max) * 100
  const v = max * 100
  return { h, s, v }
}

function hsvToHex({ h, s, v }) {
  const S = s / 100
  const V = v / 100
  const c = V * S
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = V - c
  let r = 0, g = 0, b = 0
  if      (h < 60)  { r = c; g = x; b = 0 }
  else if (h < 120) { r = x; g = c; b = 0 }
  else if (h < 180) { r = 0; g = c; b = x }
  else if (h < 240) { r = 0; g = x; b = c }
  else if (h < 300) { r = x; g = 0; b = c }
  else              { r = c; g = 0; b = x }
  const toHex = n => Math.round((n + m) * 255).toString(16).padStart(2, '0')
  return '#' + toHex(r) + toHex(g) + toHex(b)
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
  width: '100%', maxWidth: 960,
  // Fixed height so the modal doesn't jump as users hop between
  // short sections (Animation, Voice) and tall ones (Colors,
  // Typography). Caps at 92vh on small viewports so it always fits.
  height: 'min(92vh, 760px)',
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
