import { useState } from 'react';

const baseStyle = {
  background: 'var(--color-surface)',
  border: '1px solid var(--color-border)',
  borderRadius: '9px',
  padding: '10px 14px',
  color: 'var(--color-text)',
  fontSize: '13px',
  outline: 'none',
  transition: 'border-color 0.15s',
  width: '100%',
};

export default function Input({
  value,
  onChange,
  placeholder,
  label,
  hint,
  error,
  type = 'text',
  disabled = false,
  full = false,
  icon,
  onKeyDown,
  multiline = false,
  rows = 4,
  style: extraStyle,
}) {
  const [focused, setFocused] = useState(false);

  const borderColor = error
    ? 'var(--color-red)'
    : focused
    ? 'var(--color-accent)'
    : 'var(--color-border)';

  const fieldStyle = {
    ...baseStyle,
    fontFamily: multiline ? "'Urbanist', sans-serif" : "'Urbanist', sans-serif",
    border: `1px solid ${borderColor}`,
    paddingLeft: icon ? '38px' : '14px',
    width: full || multiline ? '100%' : undefined,
    opacity: disabled ? 0.5 : 1,
    cursor: disabled ? 'not-allowed' : 'text',
    resize: multiline ? 'vertical' : undefined,
    ...extraStyle,
  };

  const sharedProps = {
    value,
    onChange,
    placeholder,
    disabled,
    onKeyDown,
    onFocus: () => setFocused(true),
    onBlur: () => setFocused(false),
    style: fieldStyle,
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', width: full ? '100%' : undefined }}>
      {label && (
        <label
          style={{
            fontSize: '12px',
            color: 'var(--color-text-soft)',
            fontFamily: "'Urbanist', sans-serif",
            fontWeight: 500,
          }}
        >
          {label}
        </label>
      )}

      <div style={{ position: 'relative' }}>
        {icon && (
          <span
            style={{
              position: 'absolute',
              left: '12px',
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--color-text-muted)',
              fontSize: '14px',
              pointerEvents: 'none',
              lineHeight: 1,
            }}
          >
            {icon}
          </span>
        )}

        {multiline ? (
          <textarea rows={rows} {...sharedProps} />
        ) : (
          <input type={type} {...sharedProps} />
        )}
      </div>

      {error && (
        <span style={{ fontSize: '11px', color: 'var(--color-red)', fontFamily: "'Urbanist', sans-serif" }}>
          {error}
        </span>
      )}
      {hint && !error && (
        <span style={{ fontSize: '11px', color: 'var(--color-text-muted)', fontFamily: "'Urbanist', sans-serif" }}>
          {hint}
        </span>
      )}
    </div>
  );
}
