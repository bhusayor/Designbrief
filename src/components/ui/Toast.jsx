export default function Toast({ message, type = 'info' }) {
  return (
    <div
      style={{
        position: 'fixed',
        top: '20px',
        right: '20px',
        background: 'var(--color-card)',
        border: '1px solid rgba(124,58,237,0.3)',
        borderRadius: '12px',
        padding: '12px 18px',
        display: 'flex',
        gap: '10px',
        alignItems: 'center',
        zIndex: 9999,
        boxShadow: '0 8px 32px rgba(124,58,237,0.15), 0 2px 8px rgba(0,0,0,0.1)',
        animation: 'toastSlideIn 0.28s cubic-bezier(0.34,1.56,0.64,1) both',
        maxWidth: '320px',
        pointerEvents: 'none',
      }}
    >
      <span
        style={{
          width: '7px',
          height: '7px',
          borderRadius: '50%',
          background: 'var(--color-accent)',
          flexShrink: 0,
        }}
      />
      <span
        style={{
          fontSize: '13px',
          fontFamily: 'var(--font-sans)',
          fontWeight: 600,
          color: 'var(--color-text)',
          lineHeight: 1.4,
        }}
      >
        {message}
      </span>
    </div>
  );
}
