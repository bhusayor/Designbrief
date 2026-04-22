import { useContext } from 'react';
import AppContext from '../../context/AppContext';
import Modal from '../ui/Modal';

function OptionCard({ icon, iconColor, title, description, tag, borderHover, onClick }) {
  function handleEnter(e) {
    e.currentTarget.style.borderColor = borderHover;
    e.currentTarget.style.background = 'var(--color-card-hover)';
  }
  function handleLeave(e) {
    e.currentTarget.style.borderColor = 'var(--color-border)';
    e.currentTarget.style.background = 'var(--color-surface)';
  }

  return (
    <div
      onClick={onClick}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
      style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: '14px',
        padding: '20px',
        cursor: 'pointer',
        transition: 'border-color 0.2s, background 0.2s',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
      }}
    >
      {/* Icon */}
      <div style={{
        width: '44px', height: '44px', borderRadius: '12px',
        background: `${iconColor}26`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '22px', color: iconColor,
      }}>
        {icon}
      </div>

      {/* Title */}
      <div style={{
        fontFamily: "'Urbanist', sans-serif", fontWeight: 700, fontSize: '15px',
        color: 'var(--color-text)',
      }}>
        {title}
      </div>

      {/* Description */}
      <p style={{
        fontFamily: "'DM Mono', monospace", fontSize: '12px',
        color: 'var(--color-text-soft)', lineHeight: 1.7,
        flex: 1,
      }}>
        {description}
      </p>

      {/* Tag */}
      {tag && (
        <div>
          <span style={{
            display: 'inline-block',
            background: 'var(--color-accent-bg)',
            border: '1px solid var(--color-accent-border)',
            color: 'var(--color-accent)',
            borderRadius: '6px',
            padding: '2px 9px',
            fontSize: '11px',
            fontFamily: "'DM Mono', monospace",
          }}>
            {tag}
          </span>
        </div>
      )}
    </div>
  );
}

export default function NewProjectModal({ open, onClose }) {
  const { navigate } = useContext(AppContext);

  function go(section) {
    onClose();
    navigate(section);
  }

  return (
    <Modal open={open} onClose={onClose} title="Start a New Project" width={480}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <OptionCard
          icon="◈"
          iconColor="var(--color-purple)"
          borderHover="rgba(184,127,255,0.5)"
          title="Translate a Brief"
          description="I already have something from my client — an email, a message, or a document. Let AI translate it into a full design brief."
          tag="Most popular"
          onClick={() => go('translator')}
        />
        <OptionCard
          icon="◎"
          iconColor="var(--color-blue)"
          borderHover="rgba(90,184,255,0.5)"
          title="Send Client Intake Form"
          description="My client hasn't sent a brief yet. I'll send them a smart intake form to collect everything I need before work begins."
          onClick={() => go('intake')}
        />

        <div style={{
          borderTop: '1px solid var(--color-border)',
          paddingTop: '16px',
          textAlign: 'center',
          fontFamily: "'DM Mono', monospace",
          fontSize: '11px',
          color: 'var(--color-text-muted)',
        }}>
          Both options create a saved project
        </div>
      </div>
    </Modal>
  );
}
