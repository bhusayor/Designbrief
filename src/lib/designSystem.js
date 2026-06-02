import { supabase } from './supabase'

// ────────────────────────────────────────────────────────────────────
// Project Design System library — the canonical source of truth that
// every AI call in a project should read from.
//
// Two exports the rest of the app cares about:
//
//   DEFAULT_DESIGN_SYSTEM
//     Initial values for every field. Shape matches the columns in
//     supabase/design-system.sql (camelCase ↔ snake_case maps live in
//     the panel's load / save handlers).
//
//   designSystemToContext(ds)
//     Serialise a design-system row into the system-prompt block
//     that gets injected ahead of every AI call. Pass null for "no
//     design system defined yet" — returns an empty string so the
//     caller can safely splice it into a template.
// ────────────────────────────────────────────────────────────────────

export const DEFAULT_DESIGN_SYSTEM = {
  // Colors — array of { id, hex, name, role }
  colors: [],

  // Typography
  headingFont: '',
  headingWeights: ['700', '800'],
  bodyFont: '',
  bodyWeights: ['400', '500'],
  baseFontSize: 16,
  scaleRatio: '1.25',
  letterSpacingHeadings: '-0.03em',
  letterSpacingBody: '0em',
  letterSpacingLabels: '0.08em',

  // Buttons
  buttonRadius: 'rounded',      // square | rounded | pill | custom
  buttonRadiusValue: 8,
  buttonSize: 'medium',         // small | medium | large
  buttonStyle: 'filled',        // filled | outlined | soft | ghost
  buttonWeight: '600',          // 400 | 500 | 600 | 700

  // Icons (Phase 2)
  iconLibrary: 'lucide',
  iconStyle: 'outline',
  iconSizeSm: 16,
  iconSizeMd: 20,
  iconSizeLg: 24,
  customIconUrl: '',

  // Spacing (Phase 2)
  baseUnit: 4,
  borderRadiusSm: 4,
  borderRadiusMd: 8,
  borderRadiusLg: 16,
  borderRadiusFull: 9999,
  maxContentWidth: 1280,
  gridColumns: 12,
  gutter: 24,

  // Brand voice (Phase 2)
  toneKeywords: [],
  copyStyle: 'conversational',
  thingsToAvoid: '',

  // Imagery (Phase 2)
  photographyStyle: 'lifestyle',
  imageTreatment: 'full_color',
  illustrationStyle: 'none',

  // Animation (Phase 2)
  motionStyle: 'subtle',
  easingPreference: 'smooth',

  // Shadows (Phase 2)
  shadowStyle: 'medium',
  shadowColorTint: 'black',
}

// Format a string list — empty becomes "Not defined" so the AI knows
// which sections are intentionally open and which are constrained.
function pretty(v, fallback = 'Not defined') {
  if (v == null) return fallback
  if (Array.isArray(v)) return v.length ? v.join(', ') : fallback
  if (typeof v === 'string' && !v.trim()) return fallback
  return String(v)
}

export function designSystemToContext(ds) {
  if (!ds) return ''

  const colorsLine = ds.colors?.length > 0
    ? ds.colors.map(c => `${c.name} (${c.role}): ${c.hex}`).join(', ')
    : 'Not defined'

  const fontsLine = [
    ds.headingFont && `Headings: ${ds.headingFont}`,
    ds.bodyFont && `Body: ${ds.bodyFont}`,
  ].filter(Boolean).join(', ') || 'Not defined'

  const buttonShape = ds.buttonRadius === 'pill'
    ? 'pill'
    : ds.buttonRadius === 'square'
      ? 'square corners'
      : `${ds.buttonRadiusValue}px radius`
  const buttonDesc =
    `${ds.buttonStyle} style, ${buttonShape}, ${ds.buttonSize} size, font-weight ${ds.buttonWeight}`

  return [
    'PROJECT DESIGN SYSTEM',
    '',
    'COLORS:',
    colorsLine,
    '',
    'TYPOGRAPHY:',
    fontsLine,
    `Base size: ${ds.baseFontSize}px`,
    `Scale ratio: ${ds.scaleRatio}`,
    `Letter spacing — headings ${ds.letterSpacingHeadings}, body ${ds.letterSpacingBody}, labels ${ds.letterSpacingLabels}`,
    '',
    'BUTTONS:',
    buttonDesc,
    '',
    'ICONS:',
    `${ds.iconLibrary} icons, ${ds.iconStyle} style`,
    ds.customIconUrl ? `Custom library: ${ds.customIconUrl}` : null,
    '',
    'SPACING:',
    `Base unit: ${ds.baseUnit}px`,
    `Border radius — sm ${ds.borderRadiusSm}px, md ${ds.borderRadiusMd}px, lg ${ds.borderRadiusLg}px, full pill`,
    `Max content width: ${ds.maxContentWidth}px`,
    `Grid: ${ds.gridColumns} columns, ${ds.gutter}px gutter`,
    '',
    'BRAND VOICE:',
    `Tone: ${pretty(ds.toneKeywords)}`,
    `Copy style: ${ds.copyStyle}`,
    ds.thingsToAvoid ? `Avoid: ${ds.thingsToAvoid}` : null,
    '',
    'IMAGERY:',
    `Photography: ${ds.photographyStyle}`,
    `Treatment: ${ds.imageTreatment}`,
    `Illustration: ${ds.illustrationStyle}`,
    '',
    'ANIMATION:',
    `Motion style: ${ds.motionStyle}`,
    `Easing: ${ds.easingPreference}`,
    '',
    'SHADOWS:',
    `Style: ${ds.shadowStyle}`,
    `Tint: ${ds.shadowColorTint}`,
    '',
    'Apply ALL of the above consistently to everything you generate for this project. Never deviate from the defined design system.',
  ].filter(Boolean).join('\n')
}

// Snake-case column → camelCase field map used by the panel's load
// handler. Keeping it next to the schema so adding a field is one
// place to change.
export function dbRowToDesignSystem(row) {
  if (!row) return DEFAULT_DESIGN_SYSTEM
  return {
    colors: row.colors || [],
    headingFont: row.heading_font || '',
    headingWeights: row.heading_weights || ['700', '800'],
    bodyFont: row.body_font || '',
    bodyWeights: row.body_weights || ['400', '500'],
    baseFontSize: row.base_font_size ?? 16,
    scaleRatio: row.scale_ratio || '1.25',
    letterSpacingHeadings: row.letter_spacing_headings || '-0.03em',
    letterSpacingBody: row.letter_spacing_body || '0em',
    letterSpacingLabels: row.letter_spacing_labels || '0.08em',
    buttonRadius: row.button_radius || 'rounded',
    buttonRadiusValue: row.button_radius_value ?? 8,
    buttonSize: row.button_size || 'medium',
    buttonStyle: row.button_style || 'filled',
    buttonWeight: row.button_weight || '600',
    iconLibrary: row.icon_library || 'lucide',
    iconStyle: row.icon_style || 'outline',
    iconSizeSm: row.icon_size_sm ?? 16,
    iconSizeMd: row.icon_size_md ?? 20,
    iconSizeLg: row.icon_size_lg ?? 24,
    customIconUrl: row.custom_icon_url || '',
    baseUnit: row.base_unit ?? 4,
    borderRadiusSm: row.border_radius_sm ?? 4,
    borderRadiusMd: row.border_radius_md ?? 8,
    borderRadiusLg: row.border_radius_lg ?? 16,
    borderRadiusFull: row.border_radius_full ?? 9999,
    maxContentWidth: row.max_content_width ?? 1280,
    gridColumns: row.grid_columns ?? 12,
    gutter: row.gutter ?? 24,
    toneKeywords: row.tone_keywords || [],
    copyStyle: row.copy_style || 'conversational',
    thingsToAvoid: row.things_to_avoid || '',
    photographyStyle: row.photography_style || 'lifestyle',
    imageTreatment: row.image_treatment || 'full_color',
    illustrationStyle: row.illustration_style || 'none',
    motionStyle: row.motion_style || 'subtle',
    easingPreference: row.easing_preference || 'smooth',
    shadowStyle: row.shadow_style || 'medium',
    shadowColorTint: row.shadow_color_tint || 'black',
  }
}

// ────────────────────────────────────────────────────────────────────
// fetchDesignSystem — single async lookup callers use to load the
// project's saved design system before firing an AI call. Returns
// the camelCase shape directly (the helper handles the mapping +
// the "no row exists yet" case). Returns null if nothing's saved or
// the table isn't set up — callers then either pass null down (so
// designSystemToContext returns '') or skip the integration silently.
// ────────────────────────────────────────────────────────────────────
export async function fetchDesignSystem(projectId) {
  if (!projectId) return null
  try {
    const { data, error } = await supabase
      .from('design_systems')
      .select('*')
      .eq('project_id', projectId)
      .maybeSingle()
    if (error) {
      // 42P01 = table missing (Phase 1 SQL not run yet) — fail silently.
      // PGRST116 = no row found for this project — that's expected for
      // a project the user hasn't set up a design system for.
      return null
    }
    return data ? dbRowToDesignSystem(data) : null
  } catch {
    return null
  }
}

// Inverse — camelCase → snake_case for the upsert.
export function designSystemToDbRow(ds, projectId, workspaceId, userId) {
  return {
    project_id: projectId,
    workspace_id: workspaceId || null,
    user_id: userId,
    colors: ds.colors || [],
    heading_font: ds.headingFont || null,
    heading_weights: ds.headingWeights || [],
    body_font: ds.bodyFont || null,
    body_weights: ds.bodyWeights || [],
    base_font_size: ds.baseFontSize,
    scale_ratio: ds.scaleRatio,
    letter_spacing_headings: ds.letterSpacingHeadings,
    letter_spacing_body: ds.letterSpacingBody,
    letter_spacing_labels: ds.letterSpacingLabels,
    button_radius: ds.buttonRadius,
    button_radius_value: ds.buttonRadiusValue,
    button_size: ds.buttonSize,
    button_style: ds.buttonStyle,
    button_weight: ds.buttonWeight,
    icon_library: ds.iconLibrary,
    icon_style: ds.iconStyle,
    icon_size_sm: ds.iconSizeSm,
    icon_size_md: ds.iconSizeMd,
    icon_size_lg: ds.iconSizeLg,
    custom_icon_url: ds.customIconUrl || null,
    base_unit: ds.baseUnit,
    border_radius_sm: ds.borderRadiusSm,
    border_radius_md: ds.borderRadiusMd,
    border_radius_lg: ds.borderRadiusLg,
    max_content_width: ds.maxContentWidth,
    grid_columns: ds.gridColumns,
    gutter: ds.gutter,
    tone_keywords: ds.toneKeywords || [],
    copy_style: ds.copyStyle,
    things_to_avoid: ds.thingsToAvoid || null,
    photography_style: ds.photographyStyle,
    image_treatment: ds.imageTreatment,
    illustration_style: ds.illustrationStyle,
    motion_style: ds.motionStyle,
    easing_preference: ds.easingPreference,
    shadow_style: ds.shadowStyle,
    shadow_color_tint: ds.shadowColorTint,
    updated_at: new Date().toISOString(),
  }
}
