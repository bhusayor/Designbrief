import React from 'react'
import { Card, Label, PriorityChip, safeText, safeArr } from './shared'

export default function TechnicalSpecRenderer({ result }) {
  if (!result) return null
  const r = result
  const accent = '#0EA5E9'

  function SpecSection({ title, children }) {
    return (
      <div style={{ marginBottom: 24 }}>
        <div style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 10, fontWeight: 700,
          letterSpacing: '0.1em', textTransform: 'uppercase',
          color: accent,
          marginBottom: 10,
          paddingBottom: 6,
          borderBottom: '2px solid ' + accent + '30',
        }}>
          {title}
        </div>
        {children}
      </div>
    )
  }

  return (
    <div style={{
      fontFamily: 'var(--font-sans)',
      maxWidth: 800,
      background: 'var(--color-surface)',
      borderRadius: 'var(--radius-xl)',
      border: '1px solid var(--color-border)',
      padding: '28px 32px',
    }}>

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 10, fontWeight: 700,
          letterSpacing: '0.1em', textTransform: 'uppercase',
          color: accent, marginBottom: 6,
        }}>
          Technical Specification
        </div>
        <div style={{
          fontWeight: 800, fontSize: 24,
          letterSpacing: '-0.03em',
          color: 'var(--color-text)', marginBottom: 6,
        }}>
          {safeText(r.projectTitle, 'Project Spec')}
        </div>
        <div style={{
          fontSize: 14, lineHeight: 1.6,
          color: 'var(--color-text-muted)', maxWidth: 560,
        }}>
          {safeText(r.projectUnderstanding)}
        </div>
      </div>

      {/* Tech Stack */}
      {r.techStack && (
        <SpecSection title="Tech Stack">
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
            gap: 8,
          }}>
            {Object.entries(r.techStack).filter(([, v]) => v).map(([key, val]) => (
              <div key={key} style={{
                background: 'var(--color-card)',
                border: '1px solid var(--color-border)',
                borderLeft: '3px solid ' + accent,
                borderRadius: 'var(--radius-md)',
                padding: '8px 12px',
              }}>
                <div style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 9, fontWeight: 700,
                  letterSpacing: '0.06em', textTransform: 'uppercase',
                  color: 'var(--color-text-muted)', marginBottom: 3,
                }}>
                  {key}
                </div>
                <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--color-text)' }}>
                  {Array.isArray(val) ? val.join(', ') : String(val)}
                </div>
              </div>
            ))}
          </div>
        </SpecSection>
      )}

      {/* Features */}
      {safeArr(r.features).length > 0 && (
        <SpecSection title="Features">
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{
                background: 'var(--color-surface-2)',
                borderBottom: '2px solid var(--color-border)',
              }}>
                {['Feature', 'Priority', 'Effort', 'Impact'].map(h => (
                  <th key={h} style={{
                    padding: '7px 10px', textAlign: 'left',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 9, fontWeight: 700,
                    letterSpacing: '0.06em', textTransform: 'uppercase',
                    color: 'var(--color-text-muted)',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {safeArr(r.features).map((f, i) => (
                <tr key={i} style={{
                  borderBottom: '1px solid var(--color-border)',
                  background: i % 2 === 0 ? 'transparent' : 'var(--color-surface)',
                }}>
                  <td style={{ padding: '8px 10px', fontWeight: 600, color: 'var(--color-text)' }}>
                    {safeText(f.name || f)}
                  </td>
                  <td style={{ padding: '8px 10px' }}>
                    <PriorityChip priority={f.priority} />
                  </td>
                  <td style={{
                    padding: '8px 10px',
                    fontFamily: 'var(--font-mono)', fontSize: 11,
                    color: 'var(--color-text-muted)',
                  }}>
                    {f.complexity || f.effort || 'M'}
                  </td>
                  <td style={{
                    padding: '8px 10px',
                    fontFamily: 'var(--font-mono)', fontSize: 11,
                    color: 'var(--color-text-muted)',
                  }}>
                    {f.impact || 'H'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </SpecSection>
      )}

      {/* Roles */}
      {safeArr(r.rolesNeeded).length > 0 && (
        <SpecSection title="Team Roles">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {safeArr(r.rolesNeeded).map((role, i) => (
              <div key={i} style={{
                background: 'var(--color-card)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-md)',
                padding: '6px 12px',
                fontFamily: 'var(--font-mono)',
                fontSize: 11, fontWeight: 600,
                color: accent,
              }}>
                {safeText(role)}
              </div>
            ))}
          </div>
        </SpecSection>
      )}

      {/* Red flags */}
      {safeArr(r.redFlags).length > 0 && (
        <SpecSection title="Risk Flags">
          {safeArr(r.redFlags).map((f, i) => (
            <div key={i} style={{
              display: 'flex', gap: 8, alignItems: 'flex-start',
              marginBottom: 8, padding: '8px 10px',
              background: '#FEF2F2',
              border: '1px solid #FECACA',
              borderRadius: 'var(--radius-md)',
            }}>
              <span style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 10, color: '#DC2626',
                fontWeight: 700, flexShrink: 0, marginTop: 1,
              }}>⚠</span>
              <span style={{ fontSize: 12, color: '#991B1B', lineHeight: 1.6 }}>{f}</span>
            </div>
          ))}
        </SpecSection>
      )}
    </div>
  )
}
