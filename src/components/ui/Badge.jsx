export default function Badge({
  children,
  color = 'var(--color-accent)',
  size = 'md',
  dot = false,
  pulse = false,
}) {
  const sm = size === 'sm';

  return (
    <span
      style={{
        background: `${color}2E`,   // ~18% opacity
        border: `1px solid ${color}54`,  // ~33% opacity
        borderRadius: '5px',
        padding: sm ? '3px 9px' : '4px 11px',
        fontSize: sm ? '9px' : '10px',
        fontFamily: "'Urbanist', sans-serif",
        fontWeight: 700,
        color,
        letterSpacing: '0.05em',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '5px',
        lineHeight: 1,
        whiteSpace: 'nowrap',
      }}
    >
      {dot && (
        <span
          style={{
            width: '5px',
            height: '5px',
            borderRadius: '50%',
            background: color,
            flexShrink: 0,
            animation: pulse ? 'pulse 2s ease infinite' : undefined,
          }}
        />
      )}
      {children}
    </span>
  );
}
