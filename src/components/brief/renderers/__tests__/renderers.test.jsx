import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import SprintPlanRenderer from '../SprintPlanRenderer.jsx'
import TechnicalSpecRenderer from '../TechnicalSpecRenderer.jsx'

describe('brief renderer smoke tests', () => {
  it('renders SprintPlanRenderer with and without result data', () => {
    expect(renderToStaticMarkup(<SprintPlanRenderer result={null} />)).toBe('')
    const html = renderToStaticMarkup(
      <SprintPlanRenderer result={{
        projectTitle: 'Designbrief',
        timeframe: { total: '2 weeks', taskDays: { Discovery: 3, Prototype: 4 } },
      }} />,
    )
    expect(html).toContain('Designbrief')
    expect(html).toContain('Week 1')
  })

  it('renders TechnicalSpecRenderer without creating nested component types', () => {
    const html = renderToStaticMarkup(
      <TechnicalSpecRenderer result={{
        projectTitle: 'Designbrief',
        projectUnderstanding: 'A design intelligence product.',
        techStack: { frontend: 'React', backend: 'Express' },
        features: [{ name: 'Brief translation', priority: 'High' }],
      }} />,
    )
    expect(html).toContain('Technical Specification')
    expect(html).toContain('Brief translation')
  })
})
