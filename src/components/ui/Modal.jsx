export default function Modal({
  open,
  onClose,
  children,
  title,
  width = 520,
  hideClose = false,
}) {
  if (!open) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.7)',
        backdropFilter: 'blur(4px)',
        zIndex: 200,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--color-card)',
          border: '1px solid var(--color-border)',
          borderRadius: '18px',
          width: `min(${width}px, 92vw)`,
          maxHeight: '88vh',
          overflow: 'auto',
          boxShadow: 'var(--shadow-modal)',
          animation: 'fadeUp 0.25s ease',
        }}
      >
        {title && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '20px 24px',
              borderBottom: '1px solid var(--color-border)',
            }}
          >
            <span
              style={{
                fontFamily: "'Urbanist', sans-serif",
                fontWeight: 800,
                fontSize: '18px',
                color: 'var(--color-text)',
              }}
            >
              {title}
            </span>
            {!hideClose && (
              <button
                onClick={onClose}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--color-text-muted)',
                  cursor: 'pointer',
                  fontSize: '18px',
                  lineHeight: 1,
                  padding: '2px 6px',
                  borderRadius: '6px',
                  transition: 'color 0.15s',
                }}
                onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-text)')}
                onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-text-muted)')}
              >
                ×
              </button>
            )}
          </div>
        )}
        <div style={{ padding: title ? '24px' : '0' }}>{children}</div>
      </div>
    </div>
  );
}
