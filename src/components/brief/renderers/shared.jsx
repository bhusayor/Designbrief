import React from 'react'

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
