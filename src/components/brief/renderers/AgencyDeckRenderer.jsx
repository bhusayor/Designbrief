import React from 'react'
import { Card, SectionHeading, Label, PriorityChip, safeText, safeArr } from './shared'

export default function AgencyDeckRenderer({ result }) {
  if (!result) return null
  const r = result
  const accent = '#7C3AED'

  return (
    <div style={{ fontFamily: 'var(--font-sans)', maxWidth: 800 }}>

      {/* Project title banner */}
      <div style={{
        background: 'linear-gradient(135deg, #7C3AED15 0%, #A855F715 100%)',
        border: '1px solid rgba(124,58,237,0.2)',
        borderRadius: 'var(--radius-xl)',
        padding: '28px 32px',
        marginBottom: 16,
      }}>
        <div style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 10, fontWeight: 700,
          letterSpacing: '0.08em', textTransform: 'uppercase',
          color: '#7C3AED', marginBottom: 8,
        }}>
          Project Brief
        </div>
        <h1 style={{
          fontWeight: 800, fontSize: 28,
          letterSpacing: '-0.04em',
          color: 'var(--color-text)',
          marginBottom: 10, lineHeight: 1.1,
        }}>
          {safeText(r.projectTitle, 'Untitled Project')}
        </h1>
        <p style={{
          fontSize: 15, color: 'var(--color-text-soft)',
          lineHeight: 1.65, maxWidth: 560,
        }}>
          {safeText(r.projectUnderstanding)}
        </p>
      </div>

      {/* Color Palette */}
      {safeArr(r.colorPalette).length > 0 && (
        <Card>
          <SectionHeading title="Color Palette" accent={accent} />
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
            gap: 10,
          }}>
            {safeArr(r.colorPalette).slice(0, 5).map((c, i) => (
              <div key={i}>
                <div style={{
                  height: 72,
                  borderRadius: 'var(--radius-md)',
                  background: c.hex || c.color,
                  marginBottom: 8,
                  border: '1px solid var(--color-border)',
                }} />
                <div style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11, fontWeight: 700,
                  color: 'var(--color-text)',
                }}>
                  {c.hex || c.color}
                </div>
                <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 2 }}>
                  {c.name}
                </div>
                {c.usage && (
                  <div style={{ fontSize: 10, color: 'var(--color-text-muted)', marginTop: 2, fontStyle: 'italic' }}>
                    {c.usage}
                  </div>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Typography */}
      {r.typography && (
        <Card>
          <SectionHeading title="Typography" accent={accent} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {[
              { label: 'Display / Headings', font: r.typography.displayFont },
              { label: 'Body / UI', font: r.typography.bodyFont },
            ].map((item, i) => (
              <div key={i} style={{
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-md)',
                padding: '16px 18px',
              }}>
                <Label>{item.label}</Label>
                <div style={{
                  fontWeight: 800, fontSize: 22,
                  letterSpacing: '-0.03em',
                  color: 'var(--color-text)',
                  lineHeight: 1.1, marginBottom: 6,
                }}>
                  {item.font || 'Inter'}
                </div>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)', lineHeight: 1.6 }}>
                  Aa Bb Cc — The quick brown fox jumps
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Tone words */}
      {safeArr(r.toneWords).length > 0 && (
        <Card>
          <SectionHeading title="Brand Tone" accent={accent} />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {safeArr(r.toneWords).map((word, i) => (
              <div key={i} style={{
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-full)',
                padding: '6px 16px',
                fontWeight: 600, fontSize: 13,
                color: 'var(--color-text)',
              }}>
                {word}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Deliverables */}
      {safeArr(r.deliverables).length > 0 && (
        <Card>
          <SectionHeading title="Deliverables" accent={accent} />
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--color-border)' }}>
                  {['Item', 'Format', 'Priority'].map(h => (
                    <th key={h} style={{
                      padding: '8px 10px', textAlign: 'left',
                      fontFamily: 'var(--font-mono)',
                      fontSize: 9, fontWeight: 700,
                      letterSpacing: '0.06em', textTransform: 'uppercase',
                      color: 'var(--color-text-muted)',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {safeArr(r.deliverables).map((d, i) => (
                  <tr key={i} style={{
                    borderBottom: '1px solid var(--color-border)',
                    background: i % 2 === 0 ? 'transparent' : 'var(--color-surface)',
                  }}>
                    <td style={{ padding: '9px 10px', fontWeight: 600, color: 'var(--color-text)' }}>
                      {safeText(d.item || d)}
                    </td>
                    <td style={{ padding: '9px 10px', color: 'var(--color-text-soft)' }}>
                      {safeText(d.format, 'TBD')}
                    </td>
                    <td style={{ padding: '9px 10px' }}>
                      <PriorityChip priority={d.priority} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Questions to ask */}
      {safeArr(r.questionsToAsk).length > 0 && (
        <Card style={{ background: 'var(--color-surface)' }}>
          <SectionHeading title="Questions to Ask" accent={accent} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {safeArr(r.questionsToAsk).slice(0, 6).map((q, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <div style={{
                  width: 20, height: 20,
                  borderRadius: '50%',
                  background: 'rgba(124,58,237,0.1)',
                  border: '1px solid rgba(124,58,237,0.2)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                  fontFamily: 'var(--font-mono)',
                  fontSize: 9, fontWeight: 700,
                  color: '#7C3AED', marginTop: 1,
                }}>
                  {i + 1}
                </div>
                <div style={{ fontSize: 13, color: 'var(--color-text-soft)', lineHeight: 1.6 }}>
                  {q}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}
