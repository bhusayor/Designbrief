import { useState, useEffect, useContext } from 'react';
import { createClient } from '@supabase/supabase-js';
import AppContext from '../context/AppContext';
import { Button, Input } from '../components/ui';

function useWindowWidth() {
  const [w, setW] = useState(() => window.innerWidth)
  useEffect(() => {
    const fn = () => setW(window.innerWidth)
    window.addEventListener('resize', fn)
    return () => window.removeEventListener('resize', fn)
  }, [])
  return w
}

// Dedicated public client — never carries an auth session so anon RLS policies apply
const publicSupabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      },
    },
  }
);

// ─── Invalid State ─────────────────────────────────────────────────────────────

function InvalidView() {
  return (
    <div style={{
      height: '100%', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      background: 'var(--color-bg)', padding: '80px 24px', textAlign: 'center',
      gap: '12px',
    }}>
      <div style={{
        width: '56px', height: '56px', borderRadius: '50%',
        background: 'rgba(255,77,106,0.12)',
        border: '1px solid var(--color-red)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '22px', color: 'var(--color-red)',
        marginBottom: '4px',
      }}>
        ✗
      </div>
      <div style={{
        fontFamily: "'Urbanist', sans-serif", fontWeight: 700, fontSize: '20px',
        color: 'var(--color-text)',
      }}>
        This form link is invalid or has expired.
      </div>
      <div style={{
        fontFamily: "'DM Mono', monospace", fontSize: '13px',
        color: 'var(--color-text-soft)',
      }}>
        Please ask your designer to send you a new link.
      </div>
    </div>
  );
}

// ─── Submitting State ──────────────────────────────────────────────────────────

function SubmittingView({ loadMsg }) {
  return (
    <div style={{
      height: '100%', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      background: 'var(--color-bg)', gap: '16px',
    }}>
      <div
        className="spin"
        style={{
          width: '40px', height: '40px', borderRadius: '50%',
          border: '3px solid var(--color-border)',
          borderTopColor: 'var(--color-accent)',
        }}
      />
      <div style={{
        fontFamily: "'DM Mono', monospace", fontSize: '13px',
        color: 'var(--color-text-soft)',
      }}>
        {loadMsg}
      </div>
    </div>
  );
}

// ─── Done State ────────────────────────────────────────────────────────────────

function DoneView({ designerName }) {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#ffffff', padding: '24px',
    }}>
      <div style={{ maxWidth: '480px', width: '100%', textAlign: 'center' }}>

        {/* Green check circle */}
        <div style={{
          width: '72px', height: '72px', borderRadius: '50%',
          background: 'rgba(22,163,74,0.08)',
          border: '2px solid rgba(22,163,74,0.2)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 28px',
        }}>
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
            <polyline
              points="6,16 13,23 26,10"
              stroke="#16a34a" strokeWidth="2.5"
              strokeLinecap="round" strokeLinejoin="round"
            />
          </svg>
        </div>

        <div style={{
          fontFamily: "'Urbanist', sans-serif", fontWeight: 800, fontSize: '28px',
          color: '#111111', letterSpacing: '-0.02em', lineHeight: 1.2,
          marginBottom: '12px',
        }}>
          Thanks! We've got your brief.
        </div>

        <div style={{
          fontFamily: "'Urbanist', sans-serif", fontSize: '16px',
          color: '#6b6b6b', lineHeight: 1.7,
          marginBottom: '32px',
        }}>
          Your responses have been received.{' '}
          {designerName
            ? `${designerName} will be in touch soon.`
            : 'Your designer will be in touch soon.'
          }
        </div>

        {/* Divider */}
        <div style={{
          width: '40px', height: '2px',
          background: '#e5e5e5', borderRadius: '1px',
          margin: '0 auto 28px',
        }} />

        <div style={{
          fontFamily: "'DM Mono', monospace", fontSize: '12px',
          color: '#9b9b9b', lineHeight: 1.6,
        }}>
          You can close this tab now.
        </div>

        {/* Branding */}
        <div style={{
          marginTop: '48px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          gap: '6px', opacity: 0.4,
        }}>
          <span style={{ fontSize: '14px', color: '#111111' }}>✦</span>
          <span style={{
            fontFamily: "'DM Mono', monospace", fontSize: '11px',
            color: '#111111', letterSpacing: '0.04em',
          }}>
            Powered by DesignBrief AI
          </span>
        </div>

      </div>
    </div>
  );
}

// ─── Filling View ──────────────────────────────────────────────────────────────

function FillingView({ intakeData, answers, setAnswers, moodUrls, setMoodUrls, onSubmit }) {
  const windowWidth = useWindowWidth()
  const isMobile = windowWidth <= 480
  const totalQuestions = intakeData.sections.flatMap(s => s.questions).length;
  const answeredCount = Object.values(answers).filter(v => v && v.trim()).length;
  const pct = totalQuestions > 0 ? Math.round((answeredCount / totalQuestions) * 100) : 0;
  const remaining = totalQuestions - answeredCount;

  function setAnswer(key, val) {
    setAnswers(prev => ({ ...prev, [key]: val }));
  }

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: 'var(--color-bg)' }}>
      <div style={{ maxWidth: '680px', margin: '0 auto', padding: isMobile ? '24px 16px 100px' : '40px 24px 100px' }}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '36px' }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: '6px',
            marginBottom: '28px',
          }}>
            <span style={{ color: 'var(--color-accent)', fontSize: '18px' }}>✦</span>
            <span style={{
              fontFamily: "'Urbanist', sans-serif", fontWeight: 700, fontSize: '14px',
              color: 'var(--color-text)',
            }}>
              DesignBrief AI
            </span>
          </div>

          <h1 style={{
            fontFamily: "'Urbanist', sans-serif", fontWeight: 800, fontSize: isMobile ? '22px' : '28px',
            color: 'var(--color-text)', letterSpacing: '-0.02em',
            margin: '0 0 8px',
          }}>
            {intakeData.projectName}
          </h1>

          <p style={{
            fontFamily: "'DM Mono', monospace", fontSize: '12px',
            color: 'var(--color-text-soft)', lineHeight: 1.7,
            marginBottom: '8px',
          }}>
            Please answer the questions below. This helps your designer understand
            your project before work begins.
          </p>

          <div style={{
            fontFamily: "'DM Mono', monospace", fontSize: '11px',
            color: 'var(--color-text-muted)', marginBottom: '8px',
          }}>
            {answeredCount} of {totalQuestions} answered
          </div>

          <div style={{
            height: '3px', background: 'var(--color-border)',
            borderRadius: '2px', overflow: 'hidden',
          }}>
            <div style={{
              height: '100%', width: `${pct}%`,
              background: 'var(--color-accent)',
              transition: 'width 0.4s ease',
            }} />
          </div>
        </div>

        {/* Sections */}
        {intakeData.sections.map(section => (
          <div key={section.id}>
            {/* Section header */}
            <div style={{
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: '10px 10px 0 0',
              padding: '12px 16px',
              display: 'flex', alignItems: 'center', gap: '10px',
            }}>
              <span style={{ fontSize: '16px' }}>{section.icon}</span>
              <span style={{
                fontFamily: "'Urbanist', sans-serif", fontWeight: 600, fontSize: '13px',
                color: 'var(--color-text)',
              }}>
                {section.label}
              </span>
            </div>

            {/* Questions */}
            <div style={{
              background: 'var(--color-card)',
              border: '1px solid var(--color-border)',
              borderTop: 'none',
              borderRadius: '0 0 10px 10px',
              padding: '16px',
              marginBottom: '20px',
            }}>
              {section.questions.map((q, i) => {
                const key = `${section.id}-${i}`;
                const isMoodboardLast = section.id === 'moodboard' && i === section.questions.length - 1;
                const isAssets = section.id === 'assets';

                return (
                  <div key={i} style={{ marginBottom: i < section.questions.length - 1 ? '16px' : 0 }}>
                    <div style={{
                      fontFamily: "'Urbanist', sans-serif", fontWeight: 500, fontSize: '13px',
                      color: 'var(--color-text)', marginBottom: '6px',
                    }}>
                      {q}
                    </div>

                    <Input
                      multiline
                      rows={3}
                      full
                      placeholder="Your answer..."
                      value={answers[key] || ''}
                      onChange={e => setAnswer(key, e.target.value)}
                    />

                    {isMoodboardLast && (
                      <div style={{ marginTop: '12px' }}>
                        <div style={{
                          fontFamily: "'DM Mono', monospace", fontSize: '11px',
                          color: 'var(--color-text-muted)', marginBottom: '6px',
                        }}>
                          Paste image URLs (one per line):
                        </div>
                        <Input
                          multiline
                          rows={4}
                          full
                          placeholder={'https://dribbble.com/shots/...\nhttps://behance.net/...'}
                          value={moodUrls}
                          onChange={e => setMoodUrls(e.target.value)}
                          style={{ fontFamily: "'DM Mono', monospace", fontSize: '12px' }}
                        />
                        {moodUrls.trim() && (
                          <div style={{
                            display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '8px',
                          }}>
                            {moodUrls.split('\n').filter(u => u.trim()).map((url, ui) => (
                              <div key={ui} style={{
                                width: '60px', height: '60px', borderRadius: '8px',
                                background: 'var(--color-surface)',
                                border: '1px solid var(--color-border)',
                                overflow: 'hidden', flexShrink: 0,
                              }}>
                                <img
                                  src={url.trim()}
                                  alt=""
                                  width={60}
                                  height={60}
                                  style={{ objectFit: 'cover' }}
                                  onError={e => { e.currentTarget.style.display = 'none'; }}
                                />
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {isAssets && (
                      <div style={{
                        fontFamily: "'DM Mono', monospace", fontSize: '10px',
                        color: 'var(--color-text-muted)', fontStyle: 'italic',
                        marginTop: '4px',
                      }}>
                        File uploads will be supported in the full version. For now, describe your
                        existing assets in the text field above.
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Sticky submit bar */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        background: 'var(--color-bg)',
        borderTop: '1px solid var(--color-border)',
        padding: isMobile ? '12px 16px' : '14px 24px',
        display: 'flex', justifyContent: 'center',
        zIndex: 100,
      }}>
        <div style={{
          maxWidth: '680px', width: '100%',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span style={{
            fontFamily: "'DM Mono', monospace", fontSize: '12px',
            color: remaining === 0 ? 'var(--color-green)' : 'var(--color-text-muted)',
          }}>
            {remaining === 0
              ? '✓ All questions answered'
              : `${remaining} question${remaining !== 1 ? 's' : ''} remaining`
            }
          </span>
          <Button
            variant="primary"
            disabled={answeredCount === 0}
            onClick={onSubmit}
          >
            Submit Brief →
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── ClientIntakePage ──────────────────────────────────────────────────────────

export default function ClientIntakePage() {
  const { activeIntakeId } = useContext(AppContext);

  const [intakeData, setIntakeData] = useState(() => {
    if (!activeIntakeId) return null;
    const stored = localStorage.getItem('intake-' + activeIntakeId);
    return stored ? JSON.parse(stored) : null;
  });
  const [loadingForm, setLoadingForm] = useState(false);

  const [phase, setPhase] = useState('filling');
  const [answers, setAnswers] = useState({});
  const [moodUrls, setMoodUrls] = useState('');
  const [loadMsg, setLoadMsg] = useState('Processing your responses...');

  // Fetch form from Supabase if not in localStorage (client on different device)
  useEffect(() => {
    if (!activeIntakeId) return;

    console.log('[ClientIntakePage] formId:', activeIntakeId);
    console.log('[ClientIntakePage] full URL:', window.location.href);

    if (intakeData) return; // Already have it from localStorage

    async function fetchForm() {
      setLoadingForm(true);
      try {
        console.log('[ClientIntakePage] Fetching form:', activeIntakeId);

        const { data, error } = await publicSupabase
          .from('intake_forms')
          .select('*')
          .eq('id', activeIntakeId)
          .single();

        console.log('[ClientIntakePage] Result:', data ? 'FOUND' : 'NOT FOUND', error?.message);

        if (error || !data) {
          console.error('[ClientIntakePage] Error:', error);
          setLoadingForm(false);
          return;
        }

        setIntakeData({
          intakeId: data.id,
          projectName: data.project_name,
          projectType: data.project_type,
          projectTypeLabel: data.project_type,
          sections: data.sections || [],
          createdAt: data.created_at,
          status: data.status || 'pending',
        });
      } catch (e) {
        console.error('[ClientIntakePage] fetch exception:', e);
      }
      setLoadingForm(false);
    }

    fetchForm();
  }, [activeIntakeId]);

  if (loadingForm) return <SubmittingView loadMsg="Loading your form..." />;
  if (!intakeData) return <InvalidView />;
  if (phase === 'submitting') return <SubmittingView loadMsg="Saving your responses..." />;
  if (phase === 'done') return (
    <DoneView designerName={intakeData?.designerName || null} />
  );

  async function handleSubmit() {
    setPhase('submitting');

    const briefText = intakeData.sections.map(section => {
      const sectionAnswers = section.questions.map((q, i) => {
        const key = `${section.id}-${i}`;
        const answer = answers[key]?.trim() || 'Not provided';
        return `${q}\n${answer}`;
      }).join('\n\n');
      return `${section.label}:\n${sectionAnswers}`;
    }).join('\n\n---\n\n');

    const fullBrief = moodUrls.trim()
      ? `${briefText}\n\nMoodboard references:\n${moodUrls}`
      : briefText;

    try {
      const apiBase = import.meta.env.VITE_API_BASE_URL || '';
      const response = await fetch(apiBase + '/api/submit-intake', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          intake_form_id: activeIntakeId,
          answers,
          brief_text: fullBrief,
          mood_urls: moodUrls,
        }),
      });

      const result = await response.json();
      if (!response.ok || result.error) {
        throw new Error(result.error || 'Submission failed');
      }

      setPhase('done');
    } catch (err) {
      console.error('[ClientIntakePage] Submit error:', err);
      setPhase('filling');
      alert('Something went wrong. Please try again.');
    }
  }

  return (
    <FillingView
      intakeData={intakeData}
      answers={answers}
      setAnswers={setAnswers}
      moodUrls={moodUrls}
      setMoodUrls={setMoodUrls}
      onSubmit={handleSubmit}
    />
  );
}
