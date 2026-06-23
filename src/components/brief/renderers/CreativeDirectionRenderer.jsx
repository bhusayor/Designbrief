import React from 'react'
import {
  Card, SectionHeading, Label, safeText, safeArr,
  WorkflowSection, CompetitorsSection, InspirationSection,
  GanttSection, BudgetSection, TeamRolesSection,
} from './shared'

export default function CreativeDirectionRenderer({ result }) {
  if (!result) return null
  const r = result
  const accent = '#EC4899'

  return (
    <div style={{ fontFamily: 'var(--font-sans)', maxWidth: 800 }}>

      {/* Concept statement, hero */}
      {r.creativeConceptStatement && (
        <div style={{
          marginBottom: 20,
          padding: '40px 36px',
          background: 'linear-gradient(135deg, #EC489910 0%, #A855F710 100%)',
          border: '1px solid #EC489920',
          borderRadius: 'var(--radius-xl)',
          textAlign: 'center',
        }}>
          <div style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10, fontWeight: 700,
            letterSpacing: '0.1em', textTransform: 'uppercase',
            color: accent, marginBottom: 16,
          }}>
            Creative Concept
          </div>
          <blockquote style={{
            fontWeight: 900,
            fontSize: 'clamp(20px, 3vw, 28px)',
            letterSpacing: '-0.04em',
            lineHeight: 1.2,
            fontStyle: 'italic',
            background: 'linear-gradient(135deg, #EC4899, #A855F7)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            margin: '0 auto',
            maxWidth: 520,
          }}>
            "{safeText(r.creativeConceptStatement)}"
          </blockquote>
        </div>
      )}

      {/* Color palette, full bleed swatches */}
      {safeArr(r.colorPalette).length > 0 && (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px 12px' }}>
            <SectionHeading title="Color Palette" accent={accent} />
          </div>
          <div style={{ display: 'flex' }}>
            {safeArr(r.colorPalette).slice(0, 5).map((c, i) => (
              <div key={i} style={{
                flex: 1,
                minHeight: 100,
                background: c.hex || c.color,
                display: 'flex',
                alignItems: 'flex-end',
                padding: '10px 12px',
              }}>
                <div>
                  <div style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 10, fontWeight: 700,
                    color: 'white',
                    textShadow: '0 1px 3px rgba(0,0,0,0.5)',
                  }}>
                    {c.hex || c.color}
                  </div>
                  <div style={{
                    fontSize: 11,
                    color: 'rgba(255,255,255,0.8)',
                    textShadow: '0 1px 2px rgba(0,0,0,0.4)',
                  }}>
                    {c.name}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Typography, large display */}
      {r.typography && (
        <Card>
          <SectionHeading title="Typography" accent={accent} />
          {[
            { label: 'Display Font', font: r.typography.displayFont, size: 52 },
            { label: 'Body Font', font: r.typography.bodyFont, size: 28 },
          ].map((item, i) => (
            <div key={i} style={{
              marginBottom: i === 0 ? 20 : 0,
              paddingBottom: i === 0 ? 20 : 0,
              borderBottom: i === 0 ? '1px solid var(--color-divider)' : 'none',
            }}>
              <Label>{item.label}</Label>
              <div style={{
                fontWeight: 900,
                fontSize: item.size,
                letterSpacing: '-0.04em',
                color: 'var(--color-text)',
                lineHeight: 1, marginBottom: 6,
              }}>
                {item.font || 'Inter'}
              </div>
              <div style={{ fontSize: 14, color: 'var(--color-text-muted)' }}>
                AaBbCcDd 123 !@#
              </div>
            </div>
          ))}
        </Card>
      )}

      {/* Tone words, large pill tags */}
      {safeArr(r.toneWords).length > 0 && (
        <Card>
          <SectionHeading title="Brand Tone" accent={accent} />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {safeArr(r.toneWords).map((w, i) => (
              <div key={i} style={{
                background: 'linear-gradient(135deg, #EC489910, #A855F710)',
                border: '1px solid #EC489930',
                borderRadius: 'var(--radius-full)',
                padding: '10px 22px',
                fontWeight: 700, fontSize: 18,
                letterSpacing: '-0.02em',
                color: accent,
              }}>
                {w}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Brand voice */}
      {r.copyVoice && (
        <Card>
          <SectionHeading title="Brand Voice" accent={accent} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <Label color="#16a34a">Do Say</Label>
              {safeArr(r.copyVoice.doSay).map((item, i) => (
                <div key={i} style={{ display: 'flex', gap: 7, marginBottom: 7, alignItems: 'flex-start' }}>
                  <span style={{ color: '#16a34a', flexShrink: 0, marginTop: 1 }}>✓</span>
                  <span style={{ fontSize: 13, color: 'var(--color-text-soft)', lineHeight: 1.5 }}>{item}</span>
                </div>
              ))}
            </div>
            <div>
              <Label color="#DC2626">Don't Say</Label>
              {safeArr(r.copyVoice.doNotSay).map((item, i) => (
                <div key={i} style={{ display: 'flex', gap: 7, marginBottom: 7, alignItems: 'flex-start' }}>
                  <span style={{ color: '#DC2626', flexShrink: 0, marginTop: 1 }}>✕</span>
                  <span style={{ fontSize: 13, color: 'var(--color-text-soft)', lineHeight: 1.5 }}>{item}</span>
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}

      {/* Inspiration, prominent for creative */}
      {r.inspiration?.length > 0 && (
        <Card>
          <SectionHeading title="Inspiration & References" subtitle="Real examples to guide the creative direction" accent={accent} />
          <InspirationSection inspiration={r.inspiration} accent={accent} />
        </Card>
      )}

      {/* Competitors */}
      {r.competitors?.length > 0 && (
        <Card>
          <SectionHeading title="Competitive Landscape" subtitle="Who you're up against and where the opportunity is" accent={accent} />
          <CompetitorsSection competitors={r.competitors} accent={accent} />
        </Card>
      )}

      {/* Project Workflow */}
      {r.projectWorkflow?.length > 0 && (
        <Card>
          <SectionHeading title="Project Workflow" subtitle="Step-by-step creative process" accent={accent} />
          <WorkflowSection workflow={r.projectWorkflow} accent={accent} />
        </Card>
      )}

      {/* Team Roles */}
      {(r.teamRoles?.length > 0 || r.rolesNeeded?.length > 0) && (
        <Card>
          <SectionHeading title="Team" subtitle="Who you need for this project" accent={accent} />
          <TeamRolesSection teamRoles={r.teamRoles} rolesNeeded={r.rolesNeeded} accent={accent} />
        </Card>
      )}

      {/* Budget */}
      {r.budgetRange && (
        <Card>
          <SectionHeading title="Budget" subtitle="Estimated cost breakdown" accent={accent} />
          <BudgetSection budgetRange={r.budgetRange} accent={accent} />
        </Card>
      )}

      {/* Gantt, minimal for creative */}
      {r.ganttData?.phases?.length > 0 && (
        <Card>
          <SectionHeading
            title="Timeline Overview"
            subtitle={r.ganttData.totalDays ? r.ganttData.totalDays + ' day project' : undefined}
            accent={accent}
          />
          <GanttSection ganttData={r.ganttData} accent={accent} />
        </Card>
      )}
    </div>
  )
}
