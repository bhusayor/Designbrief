const VARIANTS = {
  primary: {
    background: 'var(--color-text)',
    color: 'var(--color-bg)',
    border: 'none',
    '--hover-bg': 'var(--color-text)',
  },
  secondary: {
    background: 'var(--color-card)',
    color: 'var(--color-text)',
    border: '1px solid var(--color-border)',
    '--hover-bg': 'var(--color-card-hover)',
  },
  ghost: {
    background: 'transparent',
    color: 'var(--color-text-soft)',
    border: 'none',
    '--hover-bg': 'var(--color-surface)',
  },
  danger: {
    background: 'rgba(255,77,106,0.15)',
    color: 'var(--color-red)',
    border: '1px solid rgba(255,77,106,0.3)',
    '--hover-bg': 'rgba(255,77,106,0.25)',
  },
};

const SIZES = {
  sm: { padding: '6px 12px', fontSize: '11px' },
  md: { padding: '10px 20px', fontSize: '13px' },
  lg: { padding: '13px 28px', fontSize: '14px' },
};

function Spinner() {
  return (
    <span
      style={{
        display: 'inline-block',
        width: '12px',
        height: '12px',
        border: '2px solid currentColor',
        borderTopColor: 'transparent',
        borderRadius: '50%',
        animation: 'spin 0.8s linear infinite',
        flexShrink: 0,
      }}
    />
  );
}

export default function Button({
  children,
  onClick,
  variant = 'secondary',
  size = 'md',
  disabled = false,
  full = false,
  icon,
  loading = false,
  type = 'button',
  style: extraStyle,
}) {
  const v = VARIANTS[variant] ?? VARIANTS.secondary;
  const s = SIZES[size] ?? SIZES.md;

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      style={{
        ...v,
        ...s,
        fontFamily: "'Urbanist', sans-serif",
        fontWeight: 700,
        borderRadius: '9px',
        cursor: disabled || loading ? 'not-allowed' : 'pointer',
        transition: 'all 0.15s',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '6px',
        width: full ? '100%' : undefined,
        opacity: disabled ? 0.4 : 1,
        lineHeight: 1,
        whiteSpace: 'nowrap',
        ...extraStyle,
      }}
      onMouseEnter={e => {
        if (!disabled && !loading) {
          e.currentTarget.style.opacity = variant === 'primary' ? '0.88' : '1';
          e.currentTarget.style.background = v['--hover-bg'];
        }
      }}
      onMouseLeave={e => {
        if (!disabled && !loading) {
          e.currentTarget.style.opacity = '1';
          e.currentTarget.style.background = v.background;
        }
      }}
    >
      {loading ? <Spinner /> : icon ? <span style={{ lineHeight: 1 }}>{icon}</span> : null}
      {children}
    </button>
  );
}
