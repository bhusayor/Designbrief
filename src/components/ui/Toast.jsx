import {
  CheckCircleIcon,
  XCircleIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
} from '@heroicons/react/24/solid';

const TYPE_CONFIG = {
  success: { Icon: CheckCircleIcon,          color: '#22c55e' },
  error:   { Icon: XCircleIcon,              color: '#ef4444' },
  warning: { Icon: ExclamationTriangleIcon,  color: '#f59e0b' },
  info:    { Icon: InformationCircleIcon,    color: 'var(--color-accent)' },
};

export default function Toast({ message, type = 'info', exiting = false }) {
  const { Icon, color } = TYPE_CONFIG[type] ?? TYPE_CONFIG.info;

  return (
    <div
      style={{
        position: 'fixed',
        top: 20,
        right: 20,
        background: 'var(--color-card)',
        border: '1px solid rgba(124,58,237,0.25)',
        borderRadius: 14,
        padding: '12px 16px',
        display: 'flex',
        gap: 10,
        alignItems: 'center',
        zIndex: 9999,
        boxShadow: '0 8px 32px rgba(124,58,237,0.12), 0 2px 8px rgba(0,0,0,0.08)',
        animation: exiting
          ? 'toastSlideOut 0.28s cubic-bezier(0.4,0,1,1) forwards'
          : 'toastSlideIn 0.32s cubic-bezier(0.34,1.56,0.64,1) both',
        maxWidth: 320,
        pointerEvents: 'none',
      }}
    >
      <Icon style={{ width: 18, height: 18, color, flexShrink: 0 }} />
      <span
        style={{
          fontSize: 13,
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
