export default function Card({
  children,
  title,
  subtitle,
  style,
  className,
  noPadding = false,
  accent = false,
}) {
  return (
    <div
      className={className}
      style={{
        background: 'var(--color-card)',
        border: `1px solid ${accent ? 'var(--color-accent-border)' : 'var(--color-border)'}`,
        borderRadius: '14px',
        padding: noPadding ? 0 : '20px',
        textAlign: 'left',
        backgroundImage: accent
          ? 'linear-gradient(135deg, var(--color-accent-bg) 0%, transparent 60%)'
          : undefined,
        ...style,
      }}
    >
      {title && (
        <div
          style={{
            fontSize: '10px',
            color: 'var(--color-text-muted)',
            fontFamily: "'Urbanist', sans-serif",
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            marginBottom: subtitle ? '6px' : '14px',
            textAlign: 'left',
          }}
        >
          {title}
        </div>
      )}
      {subtitle && (
        <div
          style={{
            fontSize: '12px',
            color: 'var(--color-text-soft)',
            marginBottom: '12px',
            textAlign: 'left',
          }}
        >
          {subtitle}
        </div>
      )}
      {children}
    </div>
  );
}
