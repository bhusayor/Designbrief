const TYPE_COLORS = {
  success: 'var(--color-green)',
  error:   'var(--color-red)',
  warning: 'var(--color-amber)',
  info:    'var(--color-blue)',
};

export default function Toast({ message, type = 'info' }) {
  const color = TYPE_COLORS[type] ?? TYPE_COLORS.info;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '24px',
        right: '24px',
        background: 'var(--color-card)',
        border: `1px solid ${color}70`,
        borderRadius: '10px',
        padding: '11px 18px',
        display: 'flex',
        gap: '8px',
        alignItems: 'center',
        zIndex: 9999,
        boxShadow: 'var(--shadow-dropdown)',
        animation: 'fadeUp 0.3s ease',
        maxWidth: '320px',
      }}
    >
      <span
        style={{
          width: '6px',
          height: '6px',
          borderRadius: '50%',
          background: color,
          flexShrink: 0,
        }}
      />
      <span
        style={{
          fontSize: '12px',
          fontFamily: "'Urbanist', sans-serif",
          color: 'var(--color-text)',
          lineHeight: 1.4,
        }}
      >
        {message}
      </span>
    </div>
  );
}
