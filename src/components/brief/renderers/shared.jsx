import React, { useState } from 'react'

export function safeText(val, fallback = '') {
  if (!val) return fallback
  if (typeof val === 'string') return val
  if (Array.isArray(val)) return val.join(', ')
  return String(val)
}

export function safeArr(val) {
  if (!val) return []
  if (Array.isArray(val)) return val
  return []
}

export function Card({ children, style }) {
  return (
    <div style={{
      background: 'var(--color-card)',
      border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius-lg)',
      padding: 24,
      marginBottom: 16,
      boxShadow: 'var(--shadow-sm)',
      fontFamily: 'var(--font-sans)',
      ...style,
    }}>
      {children}
    </div>
  )
}

export function SectionHeading({ title, subtitle, accent }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{
        fontFamily: 'var(--font-sans)',
        fontWeight: 800,
        fontSize: 16,
        letterSpacing: '-0.03em',
        color: 'var(--color-text)',
        marginBottom: subtitle ? 4 : 0,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}>
        {accent && (
          <div style={{
            width: 3, height: 16,
            borderRadius: 2,
            background: accent,
            flexShrink: 0,
          }} />
        )}
        {title}
      </div>
      {subtitle && (
        <div style={{
          fontSize: 13,
          color: 'var(--color-text-muted)',
          lineHeight: 1.5,
          marginLeft: accent ? 11 : 0,
        }}>
          {subtitle}
        </div>
      )}
    </div>
  )
}

export function Label({ children, color }) {
  return (
    <div style={{
      fontFamily: 'var(--font-mono)',
      fontSize: 9,
      fontWeight: 700,
      letterSpacing: '0.08em',
      textTransform: 'uppercase',
      color: color || 'var(--color-text-muted)',
      marginBottom: 8,
    }}>
      {children}
    </div>
  )
}

// ─── WorkflowSection ──────────────────────────────────────────────────────────

export function WorkflowSection({ workflow, accent }) {
  if (!workflow?.length) return null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {workflow.map((step, i) => {
        const isLast = i === workflow.length - 1
        const isMilestone = step.milestone
        return (
          <div key={i} style={{ display: 'flex', gap: 14 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%',
                background: isMilestone ? accent : 'var(--color-surface)',
                border: '2px solid ' + (isMilestone ? accent : 'var(--color-border)'),
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700,
                color: isMilestone ? 'white' : 'var(--color-text-muted)',
                flexShrink: 0, zIndex: 1,
              }}>
                {isMilestone ? '★' : i + 1}
              </div>
              {!isLast && (
                <div style={{ width: 2, flex: 1, minHeight: 20, background: 'var(--color-border)', margin: '2px 0' }} />
              )}
            </div>
            <div style={{ paddingBottom: isLast ? 0 : 16, flex: 1, paddingTop: 2 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--color-text)', letterSpacing: '-0.01em' }}>
                  {step.title}
                </span>
                {step.duration && (
                  <span style={{
                    fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 600,
                    color: accent, background: accent + '12',
                    border: '1px solid ' + accent + '25',
                    borderRadius: 100, padding: '1px 8px',
                    letterSpacing: '0.04em', textTransform: 'uppercase',
                  }}>
                    {step.duration}
                  </span>
                )}
                {isMilestone && (
                  <span style={{
                    fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700,
                    color: '#f59e0b', background: '#FEF9C3',
                    border: '1px solid #FDE68A',
                    borderRadius: 100, padding: '1px 8px', textTransform: 'uppercase',
                  }}>
                    Milestone
                  </span>
                )}
              </div>
              {step.description && (
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)', lineHeight: 1.6 }}>
                  {step.description}
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── CompetitorsSection ───────────────────────────────────────────────────────

export function CompetitorsSection({ competitors, accent }) {
  if (!competitors?.length) return null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {competitors.slice(0, 5).map((c, i) => (
        <div key={i} style={{
          background: 'var(--color-surface)', border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-lg)', overflow: 'hidden',
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '10px 14px 8px', borderBottom: '1px solid var(--color-border)',
            background: 'var(--color-card)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{
                width: 20, height: 20, borderRadius: 4,
                background: accent + '20', display: 'flex', alignItems: 'center',
                justifyContent: 'center', fontFamily: 'var(--font-mono)',
                fontSize: 9, fontWeight: 700, color: accent, flexShrink: 0,
              }}>
                {(c.name || '?')[0].toUpperCase()}
              </div>
              <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--color-text)' }}>
                {c.name}
              </span>
              {c.url && (
                <a
                  href={c.url.startsWith('http') ? c.url : 'https://' + c.url}
                  target="_blank" rel="noopener noreferrer"
                  style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--color-text-muted)', textDecoration: 'none' }}
                  onMouseEnter={e => { e.currentTarget.style.color = accent }}
                  onMouseLeave={e => { e.currentTarget.style.color = 'var(--color-text-muted)' }}
                >
                  ↗
                </a>
              )}
            </div>
            {c.relevance && (
              <span style={{ fontFamily: 'var(--font-sans)', fontSize: 10, color: 'var(--color-text-muted)', fontStyle: 'italic', maxWidth: 160, textAlign: 'right' }}>
                {c.relevance}
              </span>
            )}
          </div>
          <div style={{ padding: '10px 14px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {c.description && (
              <div style={{ gridColumn: '1 / -1', fontSize: 12, color: 'var(--color-text-soft)', lineHeight: 1.55 }}>
                {c.description}
              </div>
            )}
            {c.strength && (
              <div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#16a34a', marginBottom: 4 }}>
                  ↑ Strength
                </div>
                <div style={{ fontSize: 11, color: 'var(--color-text-soft)', lineHeight: 1.5 }}>{c.strength}</div>
              </div>
            )}
            {c.weakness && (
              <div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#f59e0b', marginBottom: 4 }}>
                  ↓ Opportunity
                </div>
                <div style={{ fontSize: 11, color: 'var(--color-text-soft)', lineHeight: 1.5 }}>{c.weakness}</div>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── InspirationSection ───────────────────────────────────────────────────────

export function InspirationSection({ inspiration, accent }) {
  if (!inspiration?.length) return null
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
      {inspiration.slice(0, 6).map((ref, i) => (
        <div key={i} style={{
          background: 'var(--color-surface)', border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-lg)', borderTop: '3px solid ' + accent,
          padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 6,
        }}>
          <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--color-text)', lineHeight: 1.3 }}>
            {ref.title}
          </div>
          {ref.description && (
            <div style={{ fontSize: 11, color: 'var(--color-text-muted)', lineHeight: 1.55, flex: 1 }}>
              {ref.description}
            </div>
          )}
          {ref.why && (
            <div style={{ fontSize: 10, color: accent, fontStyle: 'italic', lineHeight: 1.4, paddingTop: 4, borderTop: '1px solid var(--color-border)' }}>
              {ref.why}
            </div>
          )}
          {ref.url && (
            <a
              href={ref.url.startsWith('http') ? ref.url : 'https://' + ref.url}
              target="_blank" rel="noopener noreferrer"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 600, color: 'var(--color-text-muted)', textDecoration: 'none', letterSpacing: '0.04em', marginTop: 2 }}
              onMouseEnter={e => { e.currentTarget.style.color = accent }}
              onMouseLeave={e => { e.currentTarget.style.color = 'var(--color-text-muted)' }}
            >
              View reference ↗
            </a>
          )}
        </div>
      ))}
    </div>
  )
}

// ─── GanttSection ─────────────────────────────────────────────────────────────

export function GanttSection({ ganttData, accent }) {
  if (!ganttData?.phases?.length) return null
  const totalDays = ganttData.totalDays || 30
  const phaseColors = ['#7C3AED', '#0EA5E9', '#16a34a', '#f59e0b', '#EC4899', '#6366F1']

  return (
    <div style={{ overflowX: 'auto' }}>
      {/* Legend */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        {ganttData.phases.map((phase, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: phase.color || phaseColors[i % phaseColors.length] }} />
            <span style={{ fontFamily: 'var(--font-sans)', fontSize: 11, color: 'var(--color-text-soft)' }}>{phase.name}</span>
          </div>
        ))}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#f59e0b' }} />
          <span style={{ fontFamily: 'var(--font-sans)', fontSize: 11, color: 'var(--color-text-soft)' }}>Milestone</span>
        </div>
      </div>

      <div style={{ minWidth: 500 }}>
        {/* Day markers */}
        <div style={{ display: 'flex', marginBottom: 6, paddingLeft: 120 }}>
          {Array.from({ length: 5 }, (_, i) => {
            const day = Math.round((i / 4) * totalDays)
            return (
              <div key={i} style={{ flex: 1, fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--color-text-muted)', textAlign: i === 4 ? 'right' : 'left' }}>
                Day {day}
              </div>
            )
          })}
        </div>

        {/* Phase rows */}
        {ganttData.phases.map((phase, pi) => {
          const pColor = phase.color || phaseColors[pi % phaseColors.length]
          return (
            <div key={pi}>
              {/* Phase header bar */}
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: 3, height: 28 }}>
                <div style={{ width: 120, paddingRight: 10, fontFamily: 'var(--font-sans)', fontSize: 10, fontWeight: 700, color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 0 }}>
                  {phase.name}
                </div>
                <div style={{ flex: 1, position: 'relative', height: 20, background: 'var(--color-surface)', borderRadius: 4 }}>
                  <div style={{
                    position: 'absolute',
                    left: ((phase.startDay - 1) / totalDays * 100) + '%',
                    width: Math.min(100 - ((phase.startDay - 1) / totalDays * 100), ((phase.endDay - phase.startDay + 1) / totalDays * 100)) + '%',
                    height: '100%', background: pColor + 'CC', borderRadius: 4,
                    display: 'flex', alignItems: 'center', paddingLeft: 6, overflow: 'hidden',
                  }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, fontWeight: 700, color: 'white', whiteSpace: 'nowrap' }}>
                      {phase.endDay - phase.startDay + 1}d
                    </span>
                  </div>
                </div>
              </div>

              {/* Task rows */}
              {phase.tasks?.map((task, ti) => (
                <div key={ti} style={{ display: 'flex', alignItems: 'center', marginBottom: 2, height: 20 }}>
                  <div style={{ width: 120, paddingRight: 10, paddingLeft: 12, fontFamily: 'var(--font-sans)', fontSize: 9, color: 'var(--color-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4 }}>
                    {task.milestone && <span style={{ color: '#f59e0b', fontSize: 8 }}>★</span>}
                    {task.name}
                  </div>
                  <div style={{ flex: 1, position: 'relative', height: 14, background: 'var(--color-surface)', borderRadius: 3 }}>
                    {task.milestone ? (
                      <div style={{ position: 'absolute', left: ((task.startDay - 1) / totalDays * 100) + '%', top: '50%', transform: 'translate(-50%, -50%) rotate(45deg)', width: 10, height: 10, background: '#f59e0b' }} />
                    ) : (
                      <div style={{
                        position: 'absolute',
                        left: ((task.startDay - 1) / totalDays * 100) + '%',
                        width: Math.max(0.5, (task.duration || (task.endDay - task.startDay + 1)) / totalDays * 100) + '%',
                        minWidth: 4, height: '100%', background: pColor, borderRadius: 3, opacity: 0.6,
                      }} />
                    )}
                  </div>
                </div>
              ))}

              <div style={{ height: 6 }} />
            </div>
          )
        })}

        <div style={{ display: 'flex', marginTop: 4, paddingLeft: 120 }}>
          <div style={{ flex: 1, height: 1, background: 'var(--color-border)' }} />
        </div>
      </div>
    </div>
  )
}

// ─── BudgetSection ────────────────────────────────────────────────────────────

export function BudgetSection({ budgetRange, accent }) {
  if (!budgetRange) return null
  const currency = budgetRange.currency || 'USD'
  const symbol = currency === 'NGN' ? '₦' : '$'

  function formatMoney(num) {
    if (!num && num !== 0) return '-'
    const n = Number(num)
    if (n >= 1000000) return symbol + (n / 1000000).toFixed(1) + 'M'
    if (n >= 1000) return symbol + Math.round(n / 1000) + 'K'
    return symbol + n.toLocaleString()
  }

  const breakdown = Array.isArray(budgetRange.breakdown) ? budgetRange.breakdown : []

  return (
    <div>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 16, padding: 16,
        background: accent + '08', border: '1px solid ' + accent + '20',
        borderRadius: 'var(--radius-lg)', marginBottom: 14,
      }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-text-muted)', marginBottom: 4 }}>
            Budget Range
          </div>
          <div style={{ fontWeight: 800, fontSize: 22, letterSpacing: '-0.03em', color: 'var(--color-text)' }}>
            {formatMoney(budgetRange.low)}{', '}{formatMoney(budgetRange.high)}
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--color-text-muted)', marginTop: 2 }}>
            {currency}
          </div>
        </div>
      </div>

      {breakdown.length > 0 && (
        <div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-text-muted)', marginBottom: 8 }}>
            Breakdown
          </div>
          <div style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
            {breakdown.map((item, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', padding: '9px 14px',
                background: i % 2 === 0 ? 'transparent' : 'var(--color-surface)',
                borderBottom: i < breakdown.length - 1 ? '1px solid var(--color-border)' : 'none',
              }}>
                <div style={{ flex: 1, fontFamily: 'var(--font-sans)', fontSize: 12, fontWeight: 600, color: 'var(--color-text)' }}>
                  {item.item || item}
                </div>
                {(item.low || item.high) && (
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-text-soft)', textAlign: 'right' }}>
                    {formatMoney(item.low)}{item.high && item.high !== item.low ? '-' + formatMoney(item.high) : ''}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── TeamRolesSection ─────────────────────────────────────────────────────────

export function TeamRolesSection({ teamRoles, rolesNeeded, accent }) {
  const roles = teamRoles?.length
    ? teamRoles
    : (rolesNeeded || []).map(r => ({
        role: typeof r === 'string' ? r : r.role,
        responsibility: null, timeCommitment: null, required: true, skills: [],
      }))

  if (!roles?.length) return null

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
      {roles.map((role, i) => {
        const roleName = typeof role === 'string' ? role : role.role
        const required = role.required !== false
        return (
          <div key={i} style={{
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderLeft: '3px solid ' + (required ? accent : '#94a3b8'),
            borderRadius: 'var(--radius-lg)', padding: '12px 14px',
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 6, gap: 8 }}>
              <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--color-text)', lineHeight: 1.3 }}>
                {roleName}
              </div>
              {required && (
                <span style={{
                  fontFamily: 'var(--font-mono)', fontSize: 8, fontWeight: 700,
                  color: accent, background: accent + '12',
                  border: '1px solid ' + accent + '25',
                  borderRadius: 100, padding: '1px 6px',
                  textTransform: 'uppercase', letterSpacing: '0.04em', flexShrink: 0,
                }}>
                  Required
                </span>
              )}
            </div>
            {role.responsibility && (
              <div style={{ fontSize: 11, color: 'var(--color-text-muted)', lineHeight: 1.5, marginBottom: (role.timeCommitment || role.skills?.length) ? 8 : 0 }}>
                {role.responsibility}
              </div>
            )}
            {role.timeCommitment && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: role.skills?.length ? 7 : 0 }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--color-text-muted)', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Time:</span>
                <span style={{ fontFamily: 'var(--font-sans)', fontSize: 11, color: 'var(--color-text-soft)' }}>{role.timeCommitment}</span>
              </div>
            )}
            {role.skills?.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {role.skills.slice(0, 4).map((skill, si) => (
                  <span key={si} style={{
                    fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--color-text-muted)',
                    background: 'var(--color-surface)', border: '1px solid var(--color-border)',
                    borderRadius: 4, padding: '1px 6px',
                  }}>
                    {skill}
                  </span>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

export function PriorityChip({ priority }) {
  const map = {
    HIGH:     { bg: '#FEF2F2', color: '#DC2626', border: '#FECACA' },
    ESSENTIAL:{ bg: '#FEF2F2', color: '#DC2626', border: '#FECACA' },
    MEDIUM:   { bg: '#FFFBEB', color: '#D97706', border: '#FDE68A' },
    IMPORTANT:{ bg: '#FFFBEB', color: '#D97706', border: '#FDE68A' },
    LOW:      { bg: '#F0FDF4', color: '#16A34A', border: '#BBF7D0' },
    OPTIONAL: { bg: '#F0FDF4', color: '#16A34A', border: '#BBF7D0' },
  }
  const key = (priority || '').toUpperCase()
  const s = map[key] || map.MEDIUM
  return (
    <span style={{
      background: s.bg,
      color: s.color,
      border: '1px solid ' + s.border,
      borderRadius: 'var(--radius-full)',
      padding: '2px 8px',
      fontFamily: 'var(--font-mono)',
      fontSize: 9,
      fontWeight: 700,
      letterSpacing: '0.04em',
      textTransform: 'uppercase',
    }}>
      {priority || 'MEDIUM'}
    </span>
  )
}
