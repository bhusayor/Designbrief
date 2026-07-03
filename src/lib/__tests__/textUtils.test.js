import { describe, it, expect } from 'vitest'
import {
  scrubDashes,
  safeJsonParse,
  parseBundledComment,
  structuredCloneSafe,
  withTimeout,
} from '../textUtils.js'

describe('safeJsonParse', () => {
  it('parses plain JSON', () => {
    expect(safeJsonParse('{"a":1}')).toEqual({ a: 1 })
  })
  it('strips code fences', () => {
    expect(safeJsonParse('```json\n{"a":1}\n```')).toEqual({ a: 1 })
  })
  it('extracts the first balanced object from noisy output', () => {
    expect(safeJsonParse('Sure! Here is the JSON: {"a":1} hope that helps')).toEqual({ a: 1 })
  })
  it('returns {} on garbage or empty input', () => {
    expect(safeJsonParse('not json at all')).toEqual({})
    expect(safeJsonParse('')).toEqual({})
    expect(safeJsonParse(null)).toEqual({})
  })
})

describe('parseBundledComment', () => {
  const bundle = [
    'ANSWERED:',
    'Q1. What is your launch date?',
    'A1. March 15',
    '',
    'Q2. Is the logo final?',
    'A2. No, rebranding',
    '',
    'CHANGES:',
    'Make the tone more grounded.',
  ].join('\n')

  it('parses answers and changes from a full bundle', () => {
    const out = parseBundledComment(bundle)
    expect(out.answers).toEqual([
      { q: 'What is your launch date?', a: 'March 15' },
      { q: 'Is the logo final?', a: 'No, rebranding' },
    ])
    expect(out.changes).toBe('Make the tone more grounded.')
  })
  it('handles answers-only bundles', () => {
    const out = parseBundledComment('ANSWERED:\nQ1. One?\nA1. Yes')
    expect(out.answers).toHaveLength(1)
    expect(out.changes).toBe('')
  })
  it('handles changes-only bundles', () => {
    const out = parseBundledComment('CHANGES:\nJust fix the header.')
    expect(out.answers).toEqual([])
    expect(out.changes).toBe('Just fix the header.')
  })
  it('returns null for legacy plain-text comments', () => {
    expect(parseBundledComment('please make the logo bigger')).toBe(null)
    expect(parseBundledComment('')).toBe(null)
  })
  it('keeps an unanswered trailing question with empty answer', () => {
    const out = parseBundledComment('ANSWERED:\nQ1. Dangling question?')
    expect(out.answers).toEqual([{ q: 'Dangling question?', a: '' }])
  })
})

describe('structuredCloneSafe', () => {
  it('deep-clones without sharing references', () => {
    const src = { a: { b: [1, 2] } }
    const out = structuredCloneSafe(src)
    expect(out).toEqual(src)
    expect(out.a).not.toBe(src.a)
  })
  it('passes through null/undefined', () => {
    expect(structuredCloneSafe(null)).toBe(null)
    expect(structuredCloneSafe(undefined)).toBe(undefined)
  })
})

describe('withTimeout', () => {
  it('resolves with the promise when it wins', async () => {
    const out = await withTimeout(Promise.resolve('fast'), 1000, 'test')
    expect(out).toBe('fast')
  })
  it('resolves { __timeout: true } when the timer wins', async () => {
    const never = new Promise(() => {})
    const out = await withTimeout(never, 10, 'test')
    expect(out).toEqual({ __timeout: true })
  })
})

describe('scrubDashes (canonical copy)', () => {
  it('scrubs across nested structures', () => {
    expect(JSON.stringify(scrubDashes({ x: ['a — b', { y: 'c – d' }] }))).not.toMatch(/[—–]/)
  })
})
