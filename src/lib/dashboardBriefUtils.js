import { PHASE_COLORS } from './constants.js'
import {
  BRIEF_V3_PHASE_1A_KEYS,
  BRIEF_V3_SCHEMA_VERSION,
  BRIEF_V3_SECTIONS,
} from './briefV3Schema.js'

export function buildV3Skeleton(title) {
  return {
    schemaVersion: BRIEF_V3_SCHEMA_VERSION,
    projectTitle: title || 'Translating brief…',
    sections: BRIEF_V3_SECTIONS.map(section => ({
      ...section,
      content: BRIEF_V3_PHASE_1A_KEYS.includes(section.key) ? null : { __pending_phase: true },
    })),
  }
}

export function buildPhasesLocal(taskDays) {
  if (!taskDays || typeof taskDays !== 'object') return []
  const tasks = Object.entries(taskDays).map(([name, days]) => ({ name, days: Number(days) || 1 }))
  if (!tasks.length) return []
  const buckets = { Discovery: [], Design: [], Development: [], Launch: [] }
  const keywords = {
    Discovery: ['research', 'discover', 'audit', 'analys', 'planning', 'plan', 'strateg', 'kickoff', 'requirement', 'brief'],
    Design: ['design', 'wireframe', 'prototype', 'ui', 'ux', 'visual', 'brand', 'style', 'mockup', 'figma', 'colour', 'color', 'typograph'],
    Development: ['develop', 'build', 'code', 'implement', 'frontend', 'backend', 'api', 'database', 'integrat', 'program', 'engineer'],
    Launch: ['launch', 'deploy', 'release', 'go-live', 'handoff', 'qa', 'quality', 'review', 'feedback', 'test'],
  }
  for (const task of tasks) {
    const name = task.name.toLowerCase()
    const phase = Object.entries(keywords).find(([, words]) => words.some(word => name.includes(word)))?.[0]
    buckets[phase || 'Development'].push(task)
  }
  return Object.entries(buckets)
    .filter(([, phaseTasks]) => phaseTasks.length > 0)
    .map(([name, phaseTasks], index) => ({
      name,
      tasks: phaseTasks,
      totalDays: phaseTasks.reduce((sum, task) => sum + task.days, 0),
      color: PHASE_COLORS[index % PHASE_COLORS.length],
    }))
}

export function verdictBadge(verdict) {
  const map = {
    GOOD: { bg: '#dcfce7', color: '#15803d' },
    FAIR: { bg: '#fef9c3', color: '#a16207' },
    POOR: { bg: '#fee2e2', color: '#dc2626' },
    CHAOS: { bg: '#f3e8ff', color: '#7c3aed' },
  }
  return map[verdict] ?? { bg: 'var(--color-surface)', color: 'var(--color-text-muted)' }
}

export function safeTypoStr(value) {
  if (!value) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'object') {
    return value.name || value.family || value.font || value.value || value.label
      || Object.values(value).filter(item => typeof item === 'string').join(' · ')
      || ''
  }
  return String(value)
}

export function extractColors(result) {
  if (result?.colorPalette?.length >= 2) {
    const valid = result.colorPalette
      .map(color => ({ hex: color.hex || color, name: color.name || 'Colour', usage: color.usage || '' }))
      .filter(color => color.hex && /^#[0-9A-Fa-f]{6}$/.test(color.hex))
    if (valid.length >= 2) return valid
  }
  if (result?.colorDirection?.palette?.length >= 2) {
    const valid = result.colorDirection.palette.map((item, index) => {
      const hex = typeof item === 'string' ? item : item.hex
      if (!hex || !/^#[0-9A-Fa-f]{6}$/.test(hex)) return null
      return {
        hex,
        name: typeof item === 'object' ? item.name : ['Primary', 'Accent', 'Background', 'Secondary', 'Neutral'][index] || `Colour ${index + 1}`,
        usage: typeof item === 'object' ? item.usage : '',
      }
    }).filter(Boolean)
    if (valid.length >= 2) return valid
  }
  if (typeof result?.colorDirection === 'string') {
    const matches = [...new Set(result.colorDirection.match(/#[0-9A-Fa-f]{6}/g) || [])]
    if (matches.length >= 2) {
      return matches.slice(0, 5).map((hex, index) => ({
        hex,
        name: ['Primary', 'Accent', 'Background', 'Secondary', 'Neutral'][index] || `Colour ${index + 1}`,
        usage: '',
      }))
    }
  }
  if (result?.colorDirection?.colors?.length >= 2) return result.colorDirection.colors
  return [{ hex: '#1E1E1E', name: 'Dark', usage: '' }, { hex: '#FFFFFF', name: 'Light', usage: '' }]
}

export function getSectionLabel(defaultLabel, result) {
  const discipline = result?.discipline?.type
  const labels = {
    'Tech Stack': {
      brand: 'Production Tools', photography: 'Production Setup', video: 'Production Tools',
      motion: 'Production Tools', 'social-media': 'Tools & Platforms', print: 'Production Tools',
      illustration: 'Creative Tools', game: 'Game Stack',
    },
    'User Flow': {
      brand: 'Brand Journey', campaign: 'Campaign Journey', photography: 'Production Flow',
      video: 'Production Flow', motion: 'Production Flow', 'social-media': 'Content Journey', print: 'Production Flow',
    },
    'Feature Analysis': {
      brand: 'Brand Elements', campaign: 'Campaign Elements', photography: 'Shot Priority',
      video: 'Scene Priority', 'social-media': 'Content Priority', print: 'Design Elements', illustration: 'Artwork Priority',
    },
  }
  return labels[defaultLabel]?.[discipline] || defaultLabel
}
