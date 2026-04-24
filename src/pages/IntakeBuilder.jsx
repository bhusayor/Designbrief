import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { INTAKE_SECTIONS } from '../lib/constants';
import { supabase } from '../lib/supabase';
import {
  ArrowRightIcon,
  ArrowLeftIcon,
  CheckCircleIcon,
  LinkIcon,
  ClipboardDocumentIcon,
  SparklesIcon,
  UserIcon,
  FolderIcon,
  SwatchIcon,
  ComputerDesktopIcon,
  DevicePhoneMobileIcon,
  PhotoIcon,
  FilmIcon,
  DocumentTextIcon,
  PaintBrushIcon,
  CameraIcon,
  Bars3Icon,
  ChevronDownIcon,
  ChevronRightIcon,
  GlobeAltIcon,
  UsersIcon,
  CurrencyDollarIcon,
  MegaphoneIcon,
  RectangleStackIcon,
  PaperClipIcon,
  StarIcon,
  VideoCameraIcon,
  PencilIcon,
} from '@heroicons/react/24/outline';

// ─── Project types (local, with descriptions + Heroicons) ─────────────────────

const LOCAL_PROJECT_TYPES = [
  { id: 'brand-identity', label: 'Brand Identity',  Icon: SwatchIcon,          desc: 'Logo, visual identity, brand guidelines' },
  { id: 'website',        label: 'Website',          Icon: ComputerDesktopIcon, desc: 'Marketing site, landing page, web presence' },
  { id: 'mobile-app',     label: 'Mobile App',       Icon: DevicePhoneMobileIcon, desc: 'iOS, Android or cross-platform app' },
  { id: 'saas-product',   label: 'SaaS Product',     Icon: RectangleStackIcon,  desc: 'Web application, dashboard, platform' },
  { id: 'campaign',       label: 'Campaign',          Icon: MegaphoneIcon,       desc: 'Marketing campaign, social, print, digital' },
  { id: 'logo',           label: 'Logo Only',         Icon: StarIcon,            desc: 'Standalone logo design' },
  { id: 'motion',         label: 'Motion & Video',    Icon: VideoCameraIcon,     desc: 'Animation, video production, motion graphics' },
  { id: 'illustration',   label: 'Illustration',      Icon: PencilIcon,          desc: 'Custom illustration, icon set, artwork' },
];

const SECTION_ICONS = {
  'overview':    DocumentTextIcon,
  'audience':    UsersIcon,
  'competitors': GlobeAltIcon,
  'moodboard':   PhotoIcon,
  'budget':      CurrencyDollarIcon,
  'assets':      PaperClipIcon,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function initSections() {
  return INTAKE_SECTIONS.map(s => ({
    ...s,
    enabled: s.defaultEnabled,
    expanded: false,
    questions: [...s.questions],
  }));
}

// ─── Toggle ───────────────────────────────────────────────────────────────────

function Toggle({ enabled, onChange }) {
  return (
    <div
      onClick={e => { e.stopPropagation(); onChange(!enabled); }}
      style={{
        width: 32, height: 18, borderRadius: 9, flexShrink: 0,
        background: enabled ? 'var(--color-text)' : 'var(--color-border)',
        position: 'relative', cursor: 'pointer', transition: 'background 0.2s',
        border: 'none',
      }}
    >
      <div style={{
        position: 'absolute', top: 3,
        left: enabled ? 17 : 3,
        width: 12, height: 12, borderRadius: '50%',
        background: 'white',
        transition: 'left 0.2s',
      }} />
    </div>
  );
}

// ─── Screen 1: Project Setup ──────────────────────────────────────────────────

function Screen1({ projectName, setProjectName, projectType, setProjectType, onContinue, clientName, setClientName, clientEmail, setClientEmail }) {
  const [nameFocused, setNameFocused] = useState(false);
  const [clientNameFocused, setClientNameFocused] = useState(false);
  const [clientEmailFocused, setClientEmailFocused] = useState(false);

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      padding: '48px 24px 80px', overflowY: 'auto', height: '100%',
      background: 'var(--color-bg)', boxSizing: 'border-box',
    }}>

      {/* Step pill */}
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        background: 'var(--color-surface)', border: '1px solid var(--color-border)',
        borderRadius: 100, padding: '4px 14px', marginBottom: 28,
        fontFamily: "'DM Mono', monospace", fontSize: 11,
        color: 'var(--color-text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase',
      }}>
        <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--color-accent)' }} />
        Step 1 of 2
      </div>

      {/* Heading */}
      <h1 style={{
        fontFamily: "'Urbanist', sans-serif", fontWeight: 800, fontSize: 40,
        letterSpacing: '-0.03em', color: 'var(--color-text)',
        textAlign: 'center', marginBottom: 8, maxWidth: 500, lineHeight: 1.1, margin: '0 0 8px',
      }}>
        Set up your intake form
      </h1>
      <div style={{
        fontFamily: "'DM Mono', monospace", fontSize: 13,
        color: 'var(--color-text-muted)', textAlign: 'center', marginBottom: 40,
      }}>
        Tell us about the project to get started
      </div>

      {/* Project name input */}
      <div style={{ width: '100%', maxWidth: 520, marginBottom: 16 }}>
        <div style={{
          fontFamily: "'DM Mono', monospace", fontSize: 11,
          color: 'var(--color-text-muted)', letterSpacing: '0.06em',
          textTransform: 'uppercase', marginBottom: 8,
        }}>
          Project name
        </div>
        <input
          value={projectName}
          onChange={e => setProjectName(e.target.value)}
          onFocus={() => setNameFocused(true)}
          onBlur={() => setNameFocused(false)}
          placeholder="e.g. Bloom Skincare Rebrand"
          style={{
            width: '100%', background: 'var(--color-card)',
            border: `1.5px solid ${nameFocused ? 'var(--color-accent)' : 'var(--color-border)'}`,
            borderRadius: 10, padding: '10px 14px',
            fontFamily: "'Urbanist', sans-serif", fontSize: 14,
            color: 'var(--color-text)', outline: 'none', boxSizing: 'border-box',
            boxShadow: nameFocused ? '0 0 0 3px var(--color-accent-bg)' : 'none',
            transition: 'border-color 0.15s, box-shadow 0.15s',
          }}
        />
      </div>

      {/* Client name */}
      <div style={{ width: '100%', maxWidth: 520, marginBottom: 16 }}>
        <div style={{
          fontFamily: "'DM Mono', monospace", fontSize: 11,
          color: 'var(--color-text-muted)', letterSpacing: '0.06em',
          textTransform: 'uppercase', marginBottom: 8,
        }}>
          Client name <span style={{ opacity: 0.5 }}>(optional)</span>
        </div>
        <input
          value={clientName}
          onChange={e => setClientName(e.target.value)}
          onFocus={() => setClientNameFocused(true)}
          onBlur={() => setClientNameFocused(false)}
          placeholder="Client name (optional)"
          style={{
            width: '100%', background: 'var(--color-card)',
            border: `1.5px solid ${clientNameFocused ? 'var(--color-accent)' : 'var(--color-border)'}`,
            borderRadius: 10, padding: '10px 14px',
            fontFamily: "'Urbanist', sans-serif", fontSize: 14,
            color: 'var(--color-text)', outline: 'none', boxSizing: 'border-box',
            boxShadow: clientNameFocused ? '0 0 0 3px var(--color-accent-bg)' : 'none',
            transition: 'border-color 0.15s, box-shadow 0.15s',
          }}
        />
      </div>

      {/* Client email */}
      <div style={{ width: '100%', maxWidth: 520, marginBottom: 28 }}>
        <div style={{
          fontFamily: "'DM Mono', monospace", fontSize: 11,
          color: 'var(--color-text-muted)', letterSpacing: '0.06em',
          textTransform: 'uppercase', marginBottom: 8,
        }}>
          Client email <span style={{ opacity: 0.5 }}>(optional)</span>
        </div>
        <input
          value={clientEmail}
          onChange={e => setClientEmail(e.target.value)}
          onFocus={() => setClientEmailFocused(true)}
          onBlur={() => setClientEmailFocused(false)}
          placeholder="Client email (optional)"
          type="email"
          style={{
            width: '100%', background: 'var(--color-card)',
            border: `1.5px solid ${clientEmailFocused ? 'var(--color-accent)' : 'var(--color-border)'}`,
            borderRadius: 10, padding: '10px 14px',
            fontFamily: "'Urbanist', sans-serif", fontSize: 14,
            color: 'var(--color-text)', outline: 'none', boxSizing: 'border-box',
            boxShadow: clientEmailFocused ? '0 0 0 3px var(--color-accent-bg)' : 'none',
            transition: 'border-color 0.15s, box-shadow 0.15s',
          }}
        />
      </div>

      {/* Project type grid */}
      <div style={{ width: '100%', maxWidth: 520, marginBottom: 36 }}>
        <div style={{
          fontFamily: "'DM Mono', monospace", fontSize: 11,
          color: 'var(--color-text-muted)', textTransform: 'uppercase',
          letterSpacing: '0.06em', marginBottom: 12,
        }}>
          Project type
        </div>
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10,
        }}>
          {LOCAL_PROJECT_TYPES.map(pt => {
            const selected = projectType?.id === pt.id;
            const { Icon } = pt;
            return (
              <div
                key={pt.id}
                onClick={() => setProjectType(pt)}
                onMouseEnter={e => {
                  if (!selected) {
                    e.currentTarget.style.borderColor = 'var(--color-border-hover)';
                    e.currentTarget.style.background = 'var(--color-card-hover)';
                    e.currentTarget.style.transform = 'translateY(-1px)';
                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)';
                  }
                }}
                onMouseLeave={e => {
                  if (!selected) {
                    e.currentTarget.style.borderColor = 'var(--color-border)';
                    e.currentTarget.style.background = 'var(--color-card)';
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = 'none';
                  }
                }}
                style={{
                  background: 'var(--color-card)',
                  border: `${selected ? '2px' : '1.5px'} solid ${selected ? 'var(--color-text)' : 'var(--color-border)'}`,
                  borderRadius: 16, padding: '20px 18px', cursor: 'pointer',
                  boxShadow: selected ? '0 4px 16px rgba(0,0,0,0.12)' : 'none',
                  transition: 'all 0.15s', display: 'flex', flexDirection: 'column',
                  alignItems: 'flex-start', textAlign: 'left',
                }}
              >
                <div style={{
                  width: 40, height: 40, borderRadius: 10,
                  background: selected ? 'var(--color-text)' : 'var(--color-surface)',
                  border: `1px solid ${selected ? 'var(--color-text)' : 'var(--color-border)'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  marginBottom: 14, flexShrink: 0,
                }}>
                  <Icon style={{
                    width: 20, height: 20,
                    color: selected ? 'var(--color-bg)' : 'var(--color-text-muted)',
                  }} />
                </div>
                <div style={{
                  fontFamily: "'Urbanist', sans-serif",
                  fontWeight: 700,
                  fontSize: 15,
                  letterSpacing: '-0.01em',
                  color: 'var(--color-text)',
                  marginBottom: 5,
                }}>
                  {pt.label}
                </div>
                <div style={{
                  fontFamily: "'Urbanist', sans-serif",
                  fontWeight: 400,
                  fontSize: 12,
                  color: 'var(--color-text-muted)',
                  lineHeight: 1.5,
                }}>
                  {pt.desc}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Continue button */}
      <button
        onClick={() => { if (projectName.trim() && projectType) onContinue(); }}
        disabled={!projectName.trim() || !projectType}
        style={{
          width: '100%', maxWidth: 520,
          background: 'var(--color-text)', color: 'var(--color-bg)',
          border: 'none', borderRadius: 14, padding: '15px 0',
          fontFamily: "'Urbanist', sans-serif", fontWeight: 700, fontSize: 15,
          cursor: (!projectName.trim() || !projectType) ? 'not-allowed' : 'pointer',
          opacity: (!projectName.trim() || !projectType) ? 0.35 : 1,
          boxShadow: (!projectName.trim() || !projectType) ? 'none' : '0 4px 14px rgba(0,0,0,0.2)',
          transition: 'opacity 0.15s, box-shadow 0.15s',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}
      >
        Continue
        <ArrowRightIcon style={{ width: 16, height: 16 }} />
      </button>

    </div>
  );
}

// ─── Screen 2: Form Builder ───────────────────────────────────────────────────

function Screen2({ projectName, projectType, sections, setSections, onBack, onGenerate, generating }) {
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
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--color-bg)' }}>

      {/* Top bar */}
      <div style={{
        height: 56, flexShrink: 0,
        borderBottom: '1px solid var(--color-border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 24px', background: 'var(--color-bg)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <button
            onClick={onBack}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-text)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-text-soft)')}
            style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 6,
              fontFamily: "'Urbanist', sans-serif", fontSize: 13,
              color: 'var(--color-text-soft)', padding: '6px 0', transition: 'color 0.15s',
            }}
          >
            <ArrowLeftIcon style={{ width: 16, height: 16 }} />
            Back
          </button>
          <div style={{ width: 1, height: 16, background: 'var(--color-border)', margin: '0 12px' }} />
          <span style={{
            fontFamily: "'Urbanist', sans-serif", fontWeight: 600, fontSize: 14,
            color: 'var(--color-text)',
          }}>
            {projectName}
          </span>
          {projectType && (
            <div style={{
              background: 'var(--color-surface)', border: '1px solid var(--color-border)',
              borderRadius: 100, padding: '3px 10px', marginLeft: 8,
              fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'var(--color-text-muted)',
            }}>
              {projectType.label}
            </div>
          )}
        </div>
        <div style={{
          background: 'var(--color-surface)', border: '1px solid var(--color-border)',
          borderRadius: 8, padding: '5px 12px',
          fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'var(--color-text-muted)',
        }}>
          {totalQuestions} questions
        </div>
      </div>

      {/* Two-column body */}
      <div style={{
        flex: 1, overflow: 'hidden', display: 'grid', gridTemplateColumns: '1fr 1fr',
      }}>

        {/* Left: sections list */}
        <div style={{
          padding: 24, overflowY: 'auto',
          borderRight: '1px solid var(--color-border)',
        }}>
          <div style={{
            fontFamily: "'Urbanist', sans-serif", fontWeight: 700, fontSize: 15,
            color: 'var(--color-text)', marginBottom: 4,
          }}>
            Form Sections
          </div>
          <div style={{
            fontFamily: "'DM Mono', monospace", fontSize: 11,
            color: 'var(--color-text-muted)', marginBottom: 20,
          }}>
            Toggle sections on or off
          </div>

          {sections.map((section, i) => {
            const SectionIcon = SECTION_ICONS[section.id] || DocumentTextIcon;
            const isDragging = dragIdx === i;
            return (
              <div
                key={section.id}
                draggable
                onDragStart={() => setDragIdx(i)}
                onDragOver={e => e.preventDefault()}
                onDrop={() => handleDrop(i)}
                onDragEnd={() => setDragIdx(null)}
                onMouseEnter={e => { if (!isDragging) { e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)'; e.currentTarget.style.borderColor = 'var(--color-border-hover)'; } }}
                onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.borderColor = 'var(--color-border)'; }}
                style={{
                  background: 'var(--color-card)', border: '1px solid var(--color-border)',
                  borderRadius: 14, marginBottom: 8, overflow: 'hidden',
                  opacity: isDragging ? 0.4 : 1, transition: 'all 0.15s',
                }}
              >
                {/* Section header row */}
                <div
                  onClick={() => expandSection(i)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '12px 14px', cursor: 'pointer',
                  }}
                >
                  <Bars3Icon style={{
                    width: 16, height: 16, color: 'var(--color-text-muted)',
                    cursor: 'grab', flexShrink: 0,
                  }} />

                  <Toggle enabled={section.enabled} onChange={v => toggleSection(i, v)} />

                  <div style={{
                    width: 32, height: 32, borderRadius: 8, background: 'var(--color-surface)',
                    border: '1px solid var(--color-border)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>
                    <SectionIcon style={{ width: 15, height: 15, color: 'var(--color-text-soft)' }} />
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontFamily: "'Urbanist', sans-serif", fontWeight: 600, fontSize: 14,
                      color: 'var(--color-text)',
                    }}>
                      {section.label}
                    </div>
                    <div style={{
                      fontFamily: "'DM Mono', monospace", fontSize: 11,
                      color: 'var(--color-text-muted)',
                    }}>
                      {section.questions.length} questions
                    </div>
                  </div>

                  <ChevronDownIcon style={{
                    width: 16, height: 16, color: 'var(--color-text-muted)',
                    transform: section.expanded ? 'rotate(180deg)' : 'rotate(0deg)',
                    transition: 'transform 0.2s', flexShrink: 0,
                  }} />
                </div>

                {/* Expanded questions */}
                {section.expanded && (
                  <div style={{
                    padding: '12px 14px',
                    borderTop: '1px solid var(--color-border)',
                    background: 'var(--color-surface)',
                  }}>
                    {section.questions.map((q, qi) => (
                      <div key={qi} style={{
                        display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0',
                        borderBottom: qi < section.questions.length - 1 ? '1px solid var(--color-border)' : 'none',
                      }}>
                        <div style={{
                          width: 4, height: 4, borderRadius: '50%',
                          background: 'var(--color-text-muted)', flexShrink: 0,
                        }} />
                        <div style={{
                          fontFamily: "'Urbanist', sans-serif", fontSize: 13,
                          color: 'var(--color-text-soft)', lineHeight: 1.5, flex: 1,
                        }}>
                          {q}
                        </div>
                        <button
                          onClick={e => { e.stopPropagation(); deleteQuestion(i, qi); }}
                          onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-red, #dc2626)')}
                          onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-text-muted)')}
                          style={{
                            background: 'none', border: 'none', cursor: 'pointer',
                            color: 'var(--color-text-muted)', fontSize: 16, padding: '0 4px',
                            flexShrink: 0, lineHeight: 1,
                          }}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                    <button
                      onClick={e => { e.stopPropagation(); addQuestion(i); }}
                      style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: 'var(--color-accent)', fontFamily: "'DM Mono', monospace",
                        fontSize: 12, padding: '6px 0', marginTop: 4,
                      }}
                    >
                      + Add question
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Right: client preview */}
        <div style={{ padding: 24, overflowY: 'auto', background: 'var(--color-preview-bg)' }}>
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            marginBottom: 14,
          }}>
            <div style={{
              fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'var(--color-text-muted)',
              textTransform: 'uppercase', letterSpacing: '0.08em',
            }}>
              Client Preview
            </div>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 5,
              background: 'rgba(22,163,74,0.1)', border: '1px solid rgba(22,163,74,0.2)',
              borderRadius: 100, padding: '3px 9px',
            }}>
              <div style={{
                width: 6, height: 6, borderRadius: '50%', background: '#16a34a',
                animation: 'pulse 2s infinite',
              }} />
              <span style={{
                fontFamily: "'DM Mono', monospace", fontSize: 10,
                color: '#16a34a', fontWeight: 700,
              }}>
                Live
              </span>
            </div>
          </div>

          <div style={{
            background: 'var(--color-card)', border: '1px solid var(--color-border)',
            borderRadius: 16, padding: 20, boxShadow: 'var(--shadow-card)',
          }}>
            <div style={{ paddingBottom: 16, marginBottom: 16, borderBottom: '1px solid var(--color-border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                <SparklesIcon style={{ width: 14, height: 14, color: 'var(--color-accent)' }} />
                <span style={{
                  fontFamily: "'Urbanist', sans-serif", fontWeight: 600, fontSize: 13,
                  color: 'var(--color-text-muted)',
                }}>
                  DesignBrief AI
                </span>
              </div>

              <div style={{
                fontFamily: "'Urbanist', sans-serif", fontWeight: 800, fontSize: 18,
                letterSpacing: '-0.02em', color: 'var(--color-text)', marginBottom: projectType ? 8 : 0,
              }}>
                {projectName || 'Your Project'}
              </div>

              {projectType && (
                <div style={{
                  display: 'inline-block',
                  background: 'var(--color-surface)', color: 'var(--color-text-soft)',
                  fontFamily: "'DM Mono', monospace", fontSize: 11,
                  border: '1px solid var(--color-border)',
                  borderRadius: 100, padding: '3px 10px',
                }}>
                  {projectType.label}
                </div>
              )}
            </div>

            {enabledSections.length === 0 && (
              <div style={{
                marginTop: 20, fontFamily: "'DM Mono', monospace", fontSize: 11,
                color: 'var(--color-text-muted)', textAlign: 'center', padding: '20px 0',
              }}>
                Enable at least one section
              </div>
            )}

            {enabledSections.map(section => (
              <div key={section.id} style={{ marginBottom: 16 }}>
                <div style={{
                  fontFamily: "'DM Mono', monospace", fontSize: 11,
                  color: 'var(--color-text-soft)', textTransform: 'uppercase',
                  letterSpacing: '0.06em', marginBottom: 8, fontWeight: 600,
                }}>
                  {section.label}
                </div>
                {section.questions.map((q, qi) => (
                  <div key={qi} style={{
                    background: 'var(--color-surface)', borderRadius: 7,
                    padding: '8px 12px', marginBottom: 4,
                    fontFamily: "'Urbanist', sans-serif", fontSize: 13,
                    color: 'var(--color-text)', lineHeight: 1.4,
                  }}>
                    {q || '(empty question)'}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Footer bar */}
      <div style={{
        height: 64, flexShrink: 0, background: 'var(--color-bg)',
        borderTop: '1px solid var(--color-border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 24px',
      }}>
        <span style={{
          fontFamily: "'DM Mono', monospace", fontSize: 12, color: 'var(--color-text-muted)',
        }}>
          {enabledSections.length} sections · {totalQuestions} questions
        </span>
        <button
          onClick={onGenerate}
          disabled={enabledSections.length === 0 || generating}
          style={{
            background: (enabledSections.length === 0 || generating) ? 'var(--color-border)' : 'var(--color-text)',
            color: (enabledSections.length === 0 || generating) ? 'var(--color-text-muted)' : 'var(--color-bg)',
            border: 'none', borderRadius: 10, padding: '10px 22px',
            fontFamily: "'Urbanist', sans-serif", fontWeight: 700, fontSize: 14,
            cursor: (enabledSections.length === 0 || generating) ? 'not-allowed' : 'pointer',
            boxShadow: (enabledSections.length === 0 || generating) ? 'none' : '0 2px 8px rgba(0,0,0,0.15)',
            display: 'flex', alignItems: 'center', gap: 8, transition: 'all 0.15s',
            opacity: generating ? 0.7 : 1,
          }}
        >
          <LinkIcon style={{ width: 16, height: 16 }} />
          {generating ? 'Saving...' : 'Generate Intake Link'}
        </button>
      </div>

    </div>
  );
}

// ─── Screen 3: Success ────────────────────────────────────────────────────────

function Screen3({ shareLink, onReset, onViewProjects }) {
  const [copied, setCopied] = useState(false);
  console.log('[IntakeBuilder] Generated link:', shareLink);

  function copyLink() {
    navigator.clipboard.writeText(shareLink).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const featureCards = [
    {
      Icon: UserIcon,
      bg: 'rgba(22,163,74,0.1)',
      color: '#16a34a',
      title: 'No account needed',
      desc: 'Client opens the link and fills it in',
    },
    {
      Icon: SparklesIcon,
      bg: 'var(--color-accent-bg)',
      color: 'var(--color-accent)',
      title: 'Auto-translated',
      desc: 'AI turns responses into a full design brief',
    },
    {
      Icon: FolderIcon,
      bg: 'rgba(59,130,246,0.1)',
      color: '#3B82F6',
      title: 'Saved to projects',
      desc: 'Completed brief saved to your library',
    },
  ];

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', height: '100%', padding: '40px 24px',
      textAlign: 'center', overflowY: 'auto', background: 'var(--color-bg)',
      boxSizing: 'border-box',
    }}>

      {/* Success icon */}
      <div style={{
        width: 72, height: 72, borderRadius: '50%',
        background: 'rgba(22,163,74,0.1)', border: '2px solid rgba(22,163,74,0.3)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        margin: '0 auto 24px', boxShadow: '0 0 0 8px rgba(22,163,74,0.06)',
      }}>
        <CheckCircleIcon style={{ width: 36, height: 36, color: '#16a34a' }} />
      </div>

      {/* Heading */}
      <h2 style={{
        fontFamily: "'Urbanist', sans-serif", fontWeight: 800, fontSize: 32,
        letterSpacing: '-0.03em', color: 'var(--color-text)', marginBottom: 8, margin: '0 0 8px',
      }}>
        Your intake form is ready
      </h2>
      <p style={{
        fontFamily: "'DM Mono', monospace", fontSize: 13, color: 'var(--color-text-muted)',
        maxWidth: 480, lineHeight: 1.7, marginBottom: 32,
      }}>
        Send this link to your client. They can fill it out without creating an account — DesignBrief AI will automatically translate it into a full design brief.
      </p>

      {/* Link box */}
      <div style={{
        width: '100%', maxWidth: 520, display: 'flex', gap: 0,
        background: 'var(--color-card)', border: '1.5px solid var(--color-border)',
        borderRadius: 14, overflow: 'hidden', marginBottom: 32,
        boxShadow: 'var(--shadow-card)',
      }}>
        <input
          readOnly
          value={shareLink || ''}
          style={{
            flex: 1, background: 'transparent', border: 'none', outline: 'none',
            padding: '14px 16px', fontFamily: "'DM Mono', monospace", fontSize: 12,
            color: 'var(--color-text-soft)',
          }}
        />
        <button
          onClick={copyLink}
          style={{
            background: 'var(--color-card)', color: 'var(--color-text)',
            border: 'none', borderLeft: '1.5px solid var(--color-border)',
            padding: '0 20px', fontFamily: "'Urbanist', sans-serif", fontWeight: 700,
            fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center',
            gap: 7, flexShrink: 0, transition: 'opacity 0.15s',
          }}
        >
          <ClipboardDocumentIcon style={{ width: 15, height: 15 }} />
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>

      {/* Feature cards */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12,
        width: '100%', maxWidth: 520, marginBottom: 32,
      }}>
        {featureCards.map(({ Icon, bg, color, title, desc }) => (
          <div
            key={title}
            onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)'; e.currentTarget.style.borderColor = 'var(--color-border-hover)'; }}
            onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.borderColor = 'var(--color-border)'; }}
            style={{
              background: 'var(--color-card)', border: '1px solid var(--color-border)',
              borderRadius: 16, padding: 16, textAlign: 'center', transition: 'all 0.15s',
            }}
          >
            <div style={{
              width: 36, height: 36, borderRadius: 9, background: bg,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 10px',
            }}>
              <Icon style={{ width: 18, height: 18, color }} />
            </div>
            <div style={{
              fontFamily: "'Urbanist', sans-serif", fontWeight: 700, fontSize: 13,
              color: 'var(--color-text)', marginBottom: 4,
            }}>
              {title}
            </div>
            <div style={{
              fontFamily: "'DM Mono', monospace", fontSize: 11,
              color: 'var(--color-text-muted)', lineHeight: 1.5,
            }}>
              {desc}
            </div>
          </div>
        ))}
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 10 }}>
        <button
          onClick={onReset}
          style={{
            background: 'var(--color-surface)', border: '1px solid var(--color-border)',
            borderRadius: 12, padding: '10px 20px',
            fontFamily: "'Urbanist', sans-serif", fontWeight: 600, fontSize: 14,
            color: 'var(--color-text)', cursor: 'pointer',
          }}
        >
          Build Another Form
        </button>
        <button
          onClick={onViewProjects}
          style={{
            background: 'var(--color-text)', color: 'var(--color-bg)',
            border: 'none', borderRadius: 12, padding: '10px 20px',
            fontFamily: "'Urbanist', sans-serif", fontWeight: 700, fontSize: 14,
            cursor: 'pointer',
          }}
        >
          View Projects
        </button>
      </div>

    </div>
  );
}

// ─── IntakeBuilder ────────────────────────────────────────────────────────────

export default function IntakeBuilder() {
  const { navigate, authUser, showToast } = useApp();
  const [screen, setScreen] = useState(1);
  const [projectType, setProjectType] = useState(null);
  const [projectName, setProjectName] = useState('');
  const [clientName, setClientName] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [sections, setSections] = useState(initSections);
  const [shareLink, setShareLink] = useState(null);
  const [generating, setGenerating] = useState(false);

  function handleContinue() {
    setSections(initSections());
    setScreen(2);
  }

  async function handleGenerateLink() {
    setGenerating(true);
    const enabledSections = sections.filter(s => s.enabled);

    // Step 1: Save to Supabase — no local id, let Supabase auto-generate
    const { data, error } = await supabase
      .from('intake_forms')
      .insert({
        project_name: projectName,
        project_type: projectType.id,
        sections: enabledSections,
        user_id: authUser?.id,
        status: 'sent',
        client_name: clientName || null,
        client_email: clientEmail || null,
        created_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (error || !data?.id) {
      console.error('[IntakeBuilder] Save failed:', error);
      showToast('Failed to create form. Try again.', 'error');
      setGenerating(false);
      return;
    }

    const savedId = data.id;
    console.log('[IntakeBuilder] Form saved with ID:', savedId);

    // Cache locally so the designer can open the form immediately
    localStorage.setItem('intake-' + savedId, JSON.stringify({
      intakeId: savedId,
      projectName,
      projectType: projectType.id,
      projectTypeLabel: projectType.label,
      sections: enabledSections,
      createdAt: new Date().toISOString(),
      status: 'sent',
    }));

    // Step 2: Build link using the Supabase-returned ID
    const baseUrl = import.meta.env.VITE_APP_URL || window.location.origin;
    const link = baseUrl + '/intake/' + savedId;
    console.log('[IntakeBuilder] Generated link:', link);

    // Step 3: Store link and navigate to Screen 3
    setShareLink(link);
    setGenerating(false);
    setScreen(3);
  }

  function handleReset() {
    setProjectType(null);
    setProjectName('');
    setClientName('');
    setClientEmail('');
    setSections(initSections());
    setShareLink(null);
    setScreen(1);
  }

  if (screen === 1) {
    return (
      <Screen1
        projectName={projectName}
        setProjectName={setProjectName}
        projectType={projectType}
        setProjectType={setProjectType}
        clientName={clientName}
        setClientName={setClientName}
        clientEmail={clientEmail}
        setClientEmail={setClientEmail}
        onContinue={handleContinue}
      />
    );
  }

  if (screen === 2) {
    return (
      <Screen2
        projectName={projectName}
        projectType={projectType}
        sections={sections}
        setSections={setSections}
        onBack={() => setScreen(1)}
        onGenerate={handleGenerateLink}
        generating={generating}
      />
    );
  }

  return (
    <Screen3
      shareLink={shareLink}
      onReset={handleReset}
      onViewProjects={() => navigate('library')}
    />
  );
}
