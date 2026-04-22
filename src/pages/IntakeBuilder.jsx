import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { Button, Badge, Input } from '../components/ui';
import { INTAKE_SECTIONS, PROJECT_TYPES } from '../lib/constants';
import { supabase } from '../lib/supabase';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function initSections() {
  return INTAKE_SECTIONS.map(s => ({
    ...s,
    enabled: s.defaultEnabled,
    expanded: false,
    questions: [...s.questions],
  }));
}

// ─── Toggle Switch ────────────────────────────────────────────────────────────

function Toggle({ enabled, onChange }) {
  return (
    <div
      onClick={e => { e.stopPropagation(); onChange(!enabled); }}
      style={{
        width: '36px', height: '20px', borderRadius: '10px', flexShrink: 0,
        background: enabled ? 'var(--color-accent)' : 'var(--color-border)',
        position: 'relative', cursor: 'pointer', transition: 'background 0.2s',
      }}
    >
      <div style={{
        position: 'absolute', top: '3px',
        left: enabled ? '18px' : '3px',
        width: '14px', height: '14px', borderRadius: '50%',
        background: enabled ? 'var(--color-accent-text)' : 'var(--color-text-muted)',
        transition: 'left 0.2s',
      }} />
    </div>
  );
}

// ─── Phase: Setup ─────────────────────────────────────────────────────────────

function SetupPhase({ projectName, setProjectName, projectType, setProjectType, onContinue }) {
  return (
    <div style={{
      height: '100%', overflowY: 'auto', background: 'var(--color-bg)',
    }}>
      <div style={{ maxWidth: '560px', margin: '0 auto', padding: '48px 32px' }}>

        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: '6px',
          background: 'var(--color-surface)', border: '1px solid var(--color-border)',
          borderRadius: '6px', padding: '4px 10px', marginBottom: '20px',
          fontFamily: "'DM Mono', monospace", fontSize: '10px',
          color: 'var(--color-text-muted)', letterSpacing: '0.08em',
        }}>
          ◎ CLIENT INTAKE
        </div>

        <h1 style={{
          fontFamily: "'Urbanist', sans-serif", fontWeight: 800, fontSize: '32px',
          color: 'var(--color-text)', letterSpacing: '-0.02em', margin: '0 0 10px',
        }}>
          What kind of project is this?
        </h1>

        <p style={{
          fontFamily: "'DM Mono', monospace", fontSize: '13px',
          color: 'var(--color-text-soft)', lineHeight: 1.7, marginBottom: '32px',
        }}>
          Choose a project type and we'll suggest the right questions to send your client.
        </p>

        <div style={{ marginBottom: '24px' }}>
          <Input
            label="Project Name"
            placeholder="e.g. Bloom Skincare Brand Identity"
            value={projectName}
            onChange={e => setProjectName(e.target.value)}
            full
          />
        </div>

        <div style={{ marginBottom: '28px' }}>
          <div style={{
            fontFamily: "'Urbanist', sans-serif", fontWeight: 600, fontSize: '12px',
            color: 'var(--color-text-soft)', marginBottom: '12px',
          }}>
            Project Type
          </div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
            gap: '10px',
          }}>
            {PROJECT_TYPES.map(pt => {
              const selected = projectType?.id === pt.id;
              return (
                <div
                  key={pt.id}
                  onClick={() => setProjectType(pt)}
                  onMouseEnter={e => {
                    if (!selected) {
                      e.currentTarget.style.borderColor = 'var(--color-border-hover)';
                      e.currentTarget.style.background = 'var(--color-card-hover)';
                    }
                  }}
                  onMouseLeave={e => {
                    if (!selected) {
                      e.currentTarget.style.borderColor = 'var(--color-border)';
                      e.currentTarget.style.background = 'var(--color-card)';
                    }
                  }}
                  style={{
                    background: selected ? 'var(--color-accent-bg)' : 'var(--color-card)',
                    border: selected
                      ? '2px solid var(--color-accent)'
                      : '1px solid var(--color-border)',
                    borderRadius: '12px',
                    padding: '16px',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    textAlign: 'left',
                  }}
                >
                  <div style={{ fontSize: '22px', marginBottom: '10px' }}>{pt.icon}</div>
                  <div style={{
                    fontFamily: "'Urbanist', sans-serif", fontWeight: 700, fontSize: '13px',
                    color: 'var(--color-text)', marginBottom: '4px',
                  }}>
                    {pt.label}
                  </div>
                  <div style={{
                    fontFamily: "'DM Mono', monospace", fontSize: '11px',
                    color: 'var(--color-text-muted)', lineHeight: 1.5,
                  }}>
                    {pt.description}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <Button
          variant="primary"
          full
          disabled={!projectName.trim() || !projectType}
          onClick={onContinue}
        >
          Continue →
        </Button>
      </div>
    </div>
  );
}

// ─── Section Card ─────────────────────────────────────────────────────────────

function SectionCard({ section, index, total, onToggle, onExpand, onQuestionChange, onQuestionDelete, onAddQuestion, dragIdx, onDragStart, onDragOver, onDrop, onDragEnd }) {
  const isDragging = dragIdx === index;

  return (
    <div
      draggable
      onDragStart={() => onDragStart(index)}
      onDragOver={e => { e.preventDefault(); onDragOver(index); }}
      onDrop={() => onDrop(index)}
      onDragEnd={onDragEnd}
      style={{
        background: 'var(--color-card)',
        border: '1px solid var(--color-border)',
        borderRadius: '14px',
        marginBottom: '10px',
        overflow: 'hidden',
        opacity: isDragging ? 0.4 : 1,
        transition: 'opacity 0.15s',
      }}
    >
      {/* Header */}
      <div
        onClick={() => onExpand(index)}
        style={{
          padding: '14px 16px', display: 'flex', alignItems: 'center',
          gap: '12px', cursor: 'pointer',
        }}
      >
        <span style={{
          fontSize: '14px', color: 'var(--color-text-muted)',
          cursor: 'grab', flexShrink: 0,
        }}>
          ⠿
        </span>

        <Toggle enabled={section.enabled} onChange={v => onToggle(index, v)} />

        <span style={{ fontSize: '16px', flexShrink: 0 }}>{section.icon}</span>

        <span style={{
          fontFamily: "'Urbanist', sans-serif", fontWeight: 600, fontSize: '13px',
          color: 'var(--color-text)', flex: 1,
        }}>
          {section.label}
        </span>

        <span style={{
          fontFamily: "'DM Mono', monospace", fontSize: '10px',
          color: 'var(--color-text-muted)', marginRight: '8px',
        }}>
          {section.questions.length} questions
        </span>

        <span style={{ color: 'var(--color-text-muted)', fontSize: '12px' }}>
          {section.expanded ? '▾' : '▸'}
        </span>
      </div>

      {/* Body */}
      {section.expanded && (
        <div style={{
          padding: '0 16px 16px',
          borderTop: '1px solid var(--color-border)',
          paddingTop: '14px',
        }}>
          {section.questions.map((q, qi) => (
            <div key={qi} style={{
              display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px',
            }}>
              <span style={{
                color: 'var(--color-text-muted)', fontSize: '10px',
                cursor: 'grab', flexShrink: 0,
              }}>
                ⠿
              </span>
              <Input
                value={q}
                onChange={e => onQuestionChange(index, qi, e.target.value)}
                full
                style={{ fontSize: '12px', fontFamily: "'DM Mono', monospace" }}
              />
              <button
                onClick={() => onQuestionDelete(index, qi)}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--color-text-muted)', fontSize: '16px',
                  padding: '0 4px', flexShrink: 0, lineHeight: 1,
                }}
                onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-red)')}
                onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-text-muted)')}
              >
                ×
              </button>
            </div>
          ))}

          <button
            onClick={() => onAddQuestion(index)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--color-accent)', fontFamily: "'DM Mono', monospace",
              fontSize: '12px', padding: '6px 0', marginTop: '4px',
            }}
          >
            + Add question
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Phase: Builder ───────────────────────────────────────────────────────────

function BuilderPhase({ projectName, projectType, sections, setSections, onBack, onGenerate }) {
  const [dragIdx, setDragIdx] = useState(null);

  const enabledSections = sections.filter(s => s.enabled);
  const totalQuestions = enabledSections.reduce((acc, s) => acc + s.questions.length, 0);

  function toggleSection(i, val) {
    setSections(prev => prev.map((s, idx) => idx === i ? { ...s, enabled: val } : s));
  }

  function expandSection(i) {
    setSections(prev => prev.map((s, idx) => idx === i ? { ...s, expanded: !s.expanded } : s));
  }

  function changeQuestion(si, qi, val) {
    setSections(prev => prev.map((s, idx) => {
      if (idx !== si) return s;
      const questions = [...s.questions];
      questions[qi] = val;
      return { ...s, questions };
    }));
  }

  function deleteQuestion(si, qi) {
    setSections(prev => prev.map((s, idx) => {
      if (idx !== si) return s;
      return { ...s, questions: s.questions.filter((_, i) => i !== qi) };
    }));
  }

  function addQuestion(si) {
    setSections(prev => prev.map((s, idx) => {
      if (idx !== si) return s;
      return { ...s, questions: [...s.questions, ''], expanded: true };
    }));
  }

  function handleDrop(dropIdx) {
    if (dragIdx === null || dragIdx === dropIdx) return;
    const next = [...sections];
    const [moved] = next.splice(dragIdx, 1);
    next.splice(dropIdx, 0, moved);
    setSections(next);
    setDragIdx(null);
  }

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: 'var(--color-bg)' }}>
      <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '32px 40px 80px' }}>

        {/* Page header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: '32px',
        }}>
          <Button variant="ghost" size="sm" onClick={onBack}>← Back</Button>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{
              fontFamily: "'Urbanist', sans-serif", fontWeight: 700, fontSize: '14px',
              color: 'var(--color-text)',
            }}>
              {projectName}
            </span>
            <Badge>{projectType.label}</Badge>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '32px', alignItems: 'flex-start' }}>

          {/* Left: section editor */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ marginBottom: '20px' }}>
              <div style={{
                fontFamily: "'Urbanist', sans-serif", fontWeight: 700, fontSize: '14px',
                color: 'var(--color-text)', marginBottom: '4px',
              }}>
                Form Sections
              </div>
              <div style={{
                fontFamily: "'DM Mono', monospace", fontSize: '11px',
                color: 'var(--color-text-muted)',
              }}>
                Toggle sections on or off. Drag to reorder.
              </div>
            </div>

            {sections.map((section, i) => (
              <SectionCard
                key={section.id}
                section={section}
                index={i}
                total={sections.length}
                onToggle={toggleSection}
                onExpand={expandSection}
                onQuestionChange={changeQuestion}
                onQuestionDelete={deleteQuestion}
                onAddQuestion={addQuestion}
                dragIdx={dragIdx}
                onDragStart={setDragIdx}
                onDragOver={() => {}}
                onDrop={handleDrop}
                onDragEnd={() => setDragIdx(null)}
              />
            ))}

            {/* Send bar */}
            <div style={{
              padding: '20px 0 0',
              borderTop: '1px solid var(--color-border)',
              display: 'flex', gap: '12px', alignItems: 'center',
              marginTop: '8px',
            }}>
              <span style={{
                fontFamily: "'DM Mono', monospace", fontSize: '12px',
                color: 'var(--color-text-muted)', flex: 1,
              }}>
                {totalQuestions} question{totalQuestions !== 1 ? 's' : ''} across {enabledSections.length} section{enabledSections.length !== 1 ? 's' : ''}
              </span>
              <Button
                variant="primary"
                disabled={enabledSections.length === 0}
                onClick={onGenerate}
              >
                Generate Intake Link →
              </Button>
            </div>
          </div>

          {/* Right: live preview */}
          <div style={{ width: '380px', flexShrink: 0, position: 'sticky', top: '32px' }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              marginBottom: '16px',
            }}>
              <span style={{
                fontFamily: "'Urbanist', sans-serif", fontWeight: 700, fontSize: '13px',
                color: 'var(--color-text)',
              }}>
                Client Preview
              </span>
              <Badge color="var(--color-green)" dot pulse>Live</Badge>
            </div>

            <div style={{
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: '16px',
              padding: '20px',
              maxHeight: '600px',
              overflowY: 'auto',
            }}>
              {/* Mini header */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                marginBottom: '16px',
              }}>
                <span style={{ color: 'var(--color-accent)', fontSize: '12px' }}>✦</span>
                <span style={{
                  fontFamily: "'Urbanist', sans-serif", fontWeight: 700, fontSize: '11px',
                  color: 'var(--color-text-muted)',
                }}>
                  DesignBrief AI
                </span>
              </div>
              <div style={{
                fontFamily: "'Urbanist', sans-serif", fontWeight: 700, fontSize: '16px',
                color: 'var(--color-text)', marginBottom: '6px',
              }}>
                {projectName || 'Your Project'}
              </div>
              <Badge size="sm">{projectType.label}</Badge>

              {enabledSections.length === 0 && (
                <div style={{
                  marginTop: '20px', fontFamily: "'DM Mono', monospace", fontSize: '11px',
                  color: 'var(--color-text-muted)', textAlign: 'center', padding: '20px 0',
                }}>
                  Enable at least one section
                </div>
              )}

              {enabledSections.map(section => (
                <div key={section.id} style={{ marginTop: '16px' }}>
                  <div style={{
                    fontFamily: "'DM Mono', monospace", fontSize: '11px',
                    color: 'var(--color-text-muted)', letterSpacing: '0.08em',
                    textTransform: 'uppercase', marginBottom: '8px',
                  }}>
                    {section.icon} {section.label}
                  </div>
                  {section.questions.map((q, qi) => (
                    <div key={qi} style={{
                      background: 'var(--color-card)',
                      border: '1px solid var(--color-border)',
                      borderRadius: '8px',
                      padding: '8px 12px',
                      fontFamily: "'DM Mono', monospace",
                      fontSize: '11px',
                      color: 'var(--color-text-muted)',
                      marginBottom: '6px',
                      pointerEvents: 'none',
                    }}>
                      {q || '(empty question)'}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Info Card (Sent phase) ───────────────────────────────────────────────────

function InfoCard({ icon, color, title, text }) {
  return (
    <div style={{
      flex: 1,
      background: 'var(--color-card)',
      border: '1px solid var(--color-border)',
      borderRadius: '12px',
      padding: '14px',
      textAlign: 'left',
    }}>
      <div style={{
        width: '28px', height: '28px', borderRadius: '7px',
        background: `${color}26`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '14px', color,
        marginBottom: '10px',
      }}>
        {icon}
      </div>
      <div style={{
        fontFamily: "'Urbanist', sans-serif", fontWeight: 700, fontSize: '12px',
        color: 'var(--color-text)', marginBottom: '4px',
      }}>
        {title}
      </div>
      <div style={{
        fontFamily: "'DM Mono', monospace", fontSize: '11px',
        color: 'var(--color-text-soft)', lineHeight: 1.6,
      }}>
        {text}
      </div>
    </div>
  );
}

// ─── Phase: Sent ──────────────────────────────────────────────────────────────

function SentPhase({ shareLink, onReset, onViewProjects }) {
  const [copied, setCopied] = useState(false);

  function copyLink() {
    navigator.clipboard.writeText(shareLink).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div style={{
      height: '100%', overflowY: 'auto', background: 'var(--color-bg)',
    }}>
      <div style={{
        maxWidth: '520px', margin: '0 auto',
        padding: '80px 32px', textAlign: 'center',
      }}>
        <div style={{
          width: '64px', height: '64px', borderRadius: '20px',
          background: 'var(--color-accent-bg)',
          border: '1px solid var(--color-accent-border)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '28px', color: 'var(--color-accent)',
          margin: '0 auto 24px',
        }}>
          ✦
        </div>

        <h2 style={{
          fontFamily: "'Urbanist', sans-serif", fontWeight: 800, fontSize: '26px',
          color: 'var(--color-text)', letterSpacing: '-0.02em',
          margin: '0 0 12px',
        }}>
          Your intake form is ready
        </h2>

        <p style={{
          fontFamily: "'DM Mono', monospace", fontSize: '13px',
          color: 'var(--color-text-soft)', lineHeight: 1.7,
          marginBottom: '32px',
        }}>
          Send this link to your client. They can fill it in without creating an
          account. Once submitted, DesignBrief AI will automatically translate it
          into a full brief.
        </p>

        {/* Link box */}
        <div style={{
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: '12px',
          padding: '14px 16px',
          display: 'flex', alignItems: 'center', gap: '12px',
          marginBottom: '16px', textAlign: 'left',
        }}>
          <span style={{
            flex: 1, fontFamily: "'DM Mono', monospace", fontSize: '12px',
            color: 'var(--color-text)', overflow: 'hidden',
            textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {shareLink}
          </span>
          <Button variant="secondary" size="sm" onClick={copyLink}>
            {copied ? '✓ Copied!' : 'Copy Link'}
          </Button>
        </div>

        {/* Info cards */}
        <div style={{ display: 'flex', gap: '10px', marginBottom: '32px' }}>
          <InfoCard
            icon="◎" color="var(--color-blue)"
            title="No account needed"
            text="Your client opens the link and fills it in — no sign up required."
          />
          <InfoCard
            icon="◈" color="var(--color-purple)"
            title="Auto-translated"
            text="When submitted, AI instantly translates the responses into a full design brief."
          />
          <InfoCard
            icon="▦" color="var(--color-green)"
            title="Saved to projects"
            text="The completed brief is automatically saved to your project library."
          />
        </div>

        {/* Bottom buttons */}
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
          <Button variant="ghost" onClick={onReset}>← Build Another Form</Button>
          <Button variant="secondary" onClick={onViewProjects}>View Projects →</Button>
        </div>
      </div>
    </div>
  );
}

// ─── IntakeBuilder ─────────────────────────────────────────────────────────────

export default function IntakeBuilder() {
  const { navigate, authUser } = useApp();
  const [phase, setPhase] = useState('setup');
  const [projectType, setProjectType] = useState(null);
  const [projectName, setProjectName] = useState('');
  const [sections, setSections] = useState(initSections);
  const [shareLink, setShareLink] = useState(null);

  function handleContinue() {
    setSections(initSections());
    setPhase('builder');
  }

  async function handleGenerateLink() {
    const intakeId = Math.random().toString(36).slice(2, 10);
    const enabledSections = sections.filter(s => s.enabled);
    const data = {
      intakeId,
      projectName,
      projectType: projectType.id,
      projectTypeLabel: projectType.label,
      sections: enabledSections,
      createdAt: new Date().toISOString(),
      status: 'pending',
    };
    // Always save to localStorage so the public client page can read it
    localStorage.setItem('intake-' + intakeId, JSON.stringify(data));
    const link = window.location.origin + '/intake/' + intakeId;
    setShareLink(link);
    setPhase('sent');

    // Also persist to Supabase if logged in
    if (authUser) {
      try {
        await supabase.from('intake_forms').insert({
          id: intakeId,
          user_id: authUser.id,
          project_name: projectName,
          project_type: projectType.id,
          sections: enabledSections,
        });
      } catch (e) {
        console.error('[IntakeBuilder] Supabase intake save error:', e);
      }
    }
  }

  function handleReset() {
    setProjectType(null);
    setProjectName('');
    setSections(initSections());
    setShareLink(null);
    setPhase('setup');
  }

  if (phase === 'setup') {
    return (
      <SetupPhase
        projectName={projectName}
        setProjectName={setProjectName}
        projectType={projectType}
        setProjectType={setProjectType}
        onContinue={handleContinue}
      />
    );
  }

  if (phase === 'builder') {
    return (
      <BuilderPhase
        projectName={projectName}
        projectType={projectType}
        sections={sections}
        setSections={setSections}
        onBack={() => setPhase('setup')}
        onGenerate={handleGenerateLink}
      />
    );
  }

  return (
    <SentPhase
      shareLink={shareLink}
      onReset={handleReset}
      onViewProjects={() => navigate('library')}
    />
  );
}
