import React from 'react'
import { safeText, safeArr } from './shared'

function CanvasBox({ title, content, accent }) {
  return (
    <div style={{
      background: 'var(--color-card)',
      borderTop: '3px solid ' + (accent || '#F59E0B'),
      padding: '14px 16px',
      minHeight: 130,
    }}>
      <div style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 9, fontWeight: 700,
        letterSpacing: '0.08em', textTransform: 'uppercase',
        color: accent || '#F59E0B',
        marginBottom: 10,
      }}>
        {title}
      </div>
      <div style={{
        fontFamily: 'var(--font-sans)',
        fontSize: 12, lineHeight: 1.65,
        color: 'var(--color-text-soft)',
        whiteSpace: 'pre-line',
      }}>
        {content || (
          <span style={{ color: 'var(--color-text-muted)', fontStyle: 'italic' }}>
            Not specified
          </span>
        )}
      </div>
    </div>
  )
}

export default function LeanCanvasRenderer({ result }) {
  if (!result) return null
  const r = result
  const colors = [
    '#F59E0B', '#EF4444', '#7C3AED',
    '#0EA5E9', '#16a34a', '#EC4899',
    '#6366F1', '#F59E0B', '#0EA5E9',
  ]

  const boxes = [
    {
      title: 'Problem',
      content: safeArr(r.questionsToAsk).slice(0, 3).join('\n') ||
        safeText(r.projectUnderstanding).slice(0, 200),
    },
    {
      title: 'Solution',
      content: safeText(r.creativeConceptStatement || r.projectUnderstanding).slice(0, 200),
    },
    {
      title: 'Unique Value Proposition',
      content: safeText(r.creativeConceptStatement).slice(0, 200),
    },
    {
      title: 'Unfair Advantage',
      content: safeArr(r.toneWords).join(', ') || 'Brand identity and positioning',
    },
    {
      title: 'Key Metrics',
      content: safeArr(r.features).slice(0, 3).map(f => safeText(f.name || f)).join('\n') ||
        'To be defined',
    },
    {
      title: 'Channels',
      content: safeArr(r.competitors).slice(0, 2).map(c => safeText(c.name || c)).join(', ') ||
        'Direct, organic, referral',
    },
    {
      title: 'Customer Segments',
      content: safeText(r.discipline?.platform || r.projectUnderstanding).slice(0, 150),
    },
    {
      title: 'Cost Structure',
      content: r.budgetRange
        ? '$' + (r.budgetRange.low || '?') + ' – $' + (r.budgetRange.high || '?')
        : 'Design + development + hosting',
    },
    {
      title: 'Revenue Streams',
      content: r.timeframe?.total
        ? 'Timeline: ' + r.timeframe.total
        : 'SaaS, one-time, licensing',
    },
  ]

  return (
    <div style={{ fontFamily: 'var(--font-sans)', maxWidth: 800 }}>

      {/* Title */}
      <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
        <h2 style={{
          fontWeight: 800, fontSize: 20,
          letterSpacing: '-0.03em', color: 'var(--color-text)',
        }}>
          {safeText(r.projectTitle, 'Project')}
        </h2>
        <span style={{
          background: '#F59E0B15',
          border: '1px solid #F59E0B30',
          borderRadius: 'var(--radius-full)',
          padding: '3px 10px',
          fontFamily: 'var(--font-mono)',
          fontSize: 9, fontWeight: 700,
          letterSpacing: '0.08em', textTransform: 'uppercase',
          color: '#F59E0B',
        }}>
          Lean Canvas
        </span>
      </div>

      {/* Canvas grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 2,
        background: 'var(--color-border)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-xl)',
        overflow: 'hidden',
      }}>
        {boxes.map((box, i) => (
          <CanvasBox
            key={i}
            title={box.title}
            content={box.content}
            accent={colors[i % colors.length]}
          />
        ))}
      </div>

      {/* Footer note */}
      <div style={{
        marginTop: 12,
        fontFamily: 'var(--font-mono)',
        fontSize: 10, color: 'var(--color-text-muted)',
        textAlign: 'center',
      }}>
        Generated from brief translation. Validate assumptions before building.
      </div>
    </div>
  )
}
