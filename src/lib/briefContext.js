// ────────────────────────────────────────────────────────────────────
// briefContext, pull the translated brief result for a project and
// normalise it into a single design-system snapshot that the AI
// builder hands to every buildSection() call. Same shape across all
// renderers so the model never has to guess where the colours live.
// ────────────────────────────────────────────────────────────────────

import { supabase } from './supabase.js'

export async function fetchBriefContext(projectId) {
  if (!projectId) return null

  const { data, error } = await supabase
    .from('projects')
    .select('id, title, brief_text, result')
    .eq('id', projectId)
    .single()

  if (error || !data) return null

  const r = data.result || {}
  const palette = Array.isArray(r.colorPalette) ? r.colorPalette : []
  const typography = r.typography || {}
  const copyVoice = r.copyVoice || {}

  return {
    projectId: data.id,
    projectName: data.title || r.projectTitle || 'Untitled',
    briefText: data.brief_text || '',

    // Design tokens
    colors: palette.map(c => ({
      hex: c.hex || c.color || '#000000',
      name: c.name || '',
      usage: c.usage || '',
    })),
    colorDirection: r.colorDirection || '',

    typography: {
      displayFont: typography.displayFont || 'Inter',
      bodyFont: typography.bodyFont || 'Inter',
      rationale: typography.rationale || '',
    },

    // Voice + tone
    tone: Array.isArray(r.toneWords) ? r.toneWords : [],
    brandPersonality: Array.isArray(copyVoice.personality)
      ? copyVoice.personality
      : (typeof copyVoice.personality === 'string'
          ? copyVoice.personality.split(',').map(s => s.trim()).filter(Boolean)
          : []),
    copyVoiceDo: Array.isArray(copyVoice.doSay) ? copyVoice.doSay : [],
    copyVoiceDont: Array.isArray(copyVoice.doNotSay) ? copyVoice.doNotSay : [],

    creativeConcept: r.creativeConceptStatement || '',
    projectUnderstanding: r.projectUnderstanding || '',
    moodboardDirection: r.moodboardDirection || '',

    discipline: r.discipline?.type || '',
    platform: r.discipline?.platform || 'web',
  }
}

// Compact JSON view we hand to the AI as part of every section build.
// Trim down to what actually moves the design and keep token cost low.
export function compactBriefForPrompt(ctx) {
  if (!ctx) return '{}'
  return JSON.stringify({
    projectName: ctx.projectName,
    creativeConcept: ctx.creativeConcept,
    projectUnderstanding: ctx.projectUnderstanding?.slice(0, 600),
    colors: ctx.colors.slice(0, 6),
    colorDirection: ctx.colorDirection?.slice(0, 400),
    typography: ctx.typography,
    tone: ctx.tone,
    brandPersonality: ctx.brandPersonality,
    copyVoiceDo: ctx.copyVoiceDo?.slice(0, 4),
    copyVoiceDont: ctx.copyVoiceDont?.slice(0, 4),
    moodboardDirection: ctx.moodboardDirection?.slice(0, 400),
  }, null, 2)
}

// Has the project been translated and ready for the AI builder?
export function isBriefBuildable(ctx) {
  if (!ctx) return false
  // Need at least: some understanding, a palette OR colour direction,
  // and a display font. Without these the AI can't honour the brand.
  if (!ctx.projectUnderstanding?.trim()) return false
  if (!(ctx.colors.length > 0 || ctx.colorDirection?.trim())) return false
  if (!ctx.typography?.displayFont) return false
  return true
}
