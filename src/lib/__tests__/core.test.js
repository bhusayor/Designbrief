// First safety net: pure-logic functions that have silently broken
// before (dash scrubbing, kanban derivation, model routing). No DOM,
// no network, no Supabase — everything here must run in plain node.

import { describe, it, expect } from 'vitest'
import { scrubDashes, emptyContentForShape } from '../briefV2Schema.js'
import { scrubDashesV3, BRIEF_V3_SECTIONS, BRIEF_V3_WIRED_KEYS } from '../briefV3Schema.js'
import { buildKanbanFromV2 } from '../briefV2Kanban.js'
import { pickModel, MODEL_FOR, DEFAULT_MODEL, ALLOWED_MODELS } from '../models.js'
import { CREDIT_COSTS } from '../credits.js'

describe('scrubDashes (V2)', () => {
  it('replaces em and en dashes in strings', () => {
    expect(scrubDashes('a — b – c')).not.toMatch(/[—–]/)
  })
  it('walks nested arrays and objects', () => {
    const out = scrubDashes({ a: ['x — y'], b: { c: 'p – q' } })
    expect(JSON.stringify(out)).not.toMatch(/[—–]/)
  })
  it('passes through numbers, booleans, null', () => {
    expect(scrubDashes(42)).toBe(42)
    expect(scrubDashes(null)).toBe(null)
    expect(scrubDashes(true)).toBe(true)
  })
})

describe('scrubDashesV3', () => {
  it('matches V2 behaviour on strings', () => {
    expect(scrubDashesV3('one—two–three')).not.toMatch(/[—–]/)
  })
})

describe('V3 schema integrity', () => {
  it('has 22 sections with unique keys and ids', () => {
    expect(BRIEF_V3_SECTIONS).toHaveLength(22)
    const keys = BRIEF_V3_SECTIONS.map(s => s.key)
    expect(new Set(keys).size).toBe(22)
    const ids = BRIEF_V3_SECTIONS.map(s => s.id)
    expect(new Set(ids).size).toBe(22)
  })
  it('every wired key exists in the schema', () => {
    const keys = new Set(BRIEF_V3_SECTIONS.map(s => s.key))
    for (const k of BRIEF_V3_WIRED_KEYS) expect(keys.has(k)).toBe(true)
  })
})

describe('emptyContentForShape', () => {
  it('returns an array for list-like shapes', () => {
    expect(emptyContentForShape('list')).toEqual([])
    expect(emptyContentForShape('journey')).toEqual([])
  })
  it('returns null for unknown shapes', () => {
    expect(emptyContentForShape('nope')).toBe(null)
  })
})

describe('buildKanbanFromV2', () => {
  const v2 = {
    sections: [
      {
        id: 'understand',
        items: [
          { key: 'deliverables', content: ['Home page', 'Pricing page'] },
          { key: 'core_problem_clarity', content: 'Problem statement.' },
          { key: 'user_journey', content: [{ step: 1, title: 'Home page', action: 'Lands' }] },
        ],
      },
      { id: 'interrogate', items: [{ key: 'red_flags', content: { items: [] } }] },
    ],
  }
  it('one deliverable → one card, title is the page name', () => {
    const { tasks } = buildKanbanFromV2(v2)
    expect(tasks).toHaveLength(2)
    expect(tasks[0].title).toBe('Home page')
    expect(tasks[0].column).toBe('todo')
  })
  it('returns empty tasks for a result without sections', () => {
    expect(buildKanbanFromV2(null).tasks).toEqual([])
    expect(buildKanbanFromV2({}).tasks).toEqual([])
  })
  it('blocks a card when a high red flag mentions the page', () => {
    const flagged = JSON.parse(JSON.stringify(v2))
    flagged.sections[1].items[0].content.items = [
      { severity: 'High', text: 'Home page has no copy yet' },
    ]
    const { tasks } = buildKanbanFromV2(flagged)
    expect(tasks[0].blocked).toBe(true)
    expect(tasks[1].blocked).toBe(false)
  })
})

describe('pickModel', () => {
  it('routes known task types', () => {
    expect(pickModel('brief_translation')).toBe(MODEL_FOR.brief_translation)
  })
  it('falls back to the default for unknown tasks', () => {
    expect(pickModel('made_up_task')).toBe(DEFAULT_MODEL)
  })
  it('rejects arbitrary model strings', () => {
    expect(pickModel('brief_translation', 'gpt-99')).toBe(MODEL_FOR.brief_translation)
  })
  it('accepts whitelisted model overrides', () => {
    expect(pickModel('brief_translation', ALLOWED_MODELS[0])).toBe(ALLOWED_MODELS[0])
  })
})

describe('CREDIT_COSTS', () => {
  it('every cost is a positive integer', () => {
    for (const [k, v] of Object.entries(CREDIT_COSTS)) {
      expect(Number.isInteger(v) && v > 0, `${k} should be a positive int`).toBe(true)
    }
  })
})
