import { useState, useContext } from 'react';
import AppContext from '../context/AppContext';
import { Button, Card, Badge, Input } from '../components/ui';
import { fetchInspirations } from '../lib/api';
import {
  ScoreStrip, ChaosBanner, NumberedList,
  BudgetCard, RoadmapCard, RolesCard, TechStackCard,
  FeaturesCard, UserFlowCard, InspirationsCard,
  buildPhases, extractHexColors, verdictColor,
} from '../components/brief/BriefSections';
import { labelStyle } from '../lib/chartUtils';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function downloadBrief(r, s, opts = {}) {
  if (!r) return;
  const isFree = opts.plan === 'free';
  const lines = [
    `TRANSLATED BRIEF — ${r.projectTitle ?? 'Untitled'}`,
    '='.repeat(60),
    '',
    s ? `BRIEF SCORE: ${s.overall}/10  (${s.verdict})` : '',
    s ? `Clarity: ${s.clarity}/10 | Completeness: ${s.completeness}/10 | Contradictions: ${s.contradictions}/10` : '',
    '',
    '─── PROJECT UNDERSTANDING ───',
    r.projectUnderstanding ?? '',
    '',
    '─── TONE WORDS ───',
    (r.toneWords ?? []).join(', '),
    '',
    '─── COLOUR DIRECTION ───',
    r.colorDirection ?? '',
    '',
    '─── TYPOGRAPHY ───',
    r.typography ?? '',
    '',
    '─── MOODBOARD KEYWORDS ───',
    (r.moodboardKeywords ?? []).join(', '),
    '',
    '─── BUDGET RANGE ───',
    r.budgetRange ? `${r.budgetRange.low} – ${r.budgetRange.high}` : '',
    ...(r.budgetRange?.breakdown
      ? Object.entries(r.budgetRange.breakdown).map(([k, v]) => `  ${k}: ${v}`)
      : []),
    '',
    '─── TIMEFRAME ───',
    r.timeframe?.total ? `Total: ${r.timeframe.total}` : '',
    ...(r.timeframe?.taskDays
      ? Object.entries(r.timeframe.taskDays).map(([k, v]) => `  ${k}: ${v} days`)
      : []),
    '',
    '─── ROLES NEEDED ───',
    (r.rolesNeeded ?? []).join(', '),
    '',
    '─── TECH STACK ───',
    ...(r.techStack ? Object.entries(r.techStack).flatMap(([cat, items]) =>
      items?.length ? [`  ${cat}: ${items.join(', ')}`] : []
    ) : []),
    '',
    '─── FEATURES ───',
    ...(r.features ?? []).map(f => `  [${f.priority}] ${f.name} — ${f.description}`),
    '',
    '─── USER FLOW ───',
    ...(r.userFlow ?? []).map(s => `  Step ${s.step}: ${s.title} — ${s.description}`),
    '',
    '─── QUESTIONS TO ASK ───',
    ...(r.questionsToAsk ?? []).map((q, i) => `  ${String(i + 1).padStart(2, '0')}. ${q}`),
    '',
    '─── RED FLAGS ───',
    ...(r.redFlags ?? []).map(f => `  ⚠ ${f}`),
    // Free-plan watermark footer
    ...(isFree ? [
      '',
      '─'.repeat(60),
      'Generated with DesignBrief AI',
      'designbrief.app · Upgrade to remove watermark',
    ] : []),
  ].filter(l => l !== undefined);

  const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${(r.projectTitle ?? 'brief').toLowerCase().replace(/\s+/g, '-')}-document.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── PillButton ───────────────────────────────────────────────────────────────

function PillButton({ active, activeColor, activeLabel, inactiveLabel, onClick }) {
  const [hovered, setHovered] = useState(false);

  const bg = active
    ? `${activeColor}26`
    : hovered ? 'var(--color-surface)' : 'transparent';

  const border = active
    ? `1px solid ${activeColor}66`
    : hovered ? `1px solid ${activeColor}66` : '1px solid var(--color-border)';

  const color = active
    ? activeColor
    : hovered ? activeColor : 'var(--color-text-muted)';

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: bg, border, color,
        borderRadius: '100px', padding: '4px 12px',
        fontFamily: "'Urbanist', sans-serif", fontWeight: 600, fontSize: '11px',
        cursor: 'pointer', transition: 'all 0.15s', whiteSpace: 'nowrap',
      }}
    >
      {active ? activeLabel : inactiveLabel}
    </button>
  );
}

// ─── SectionWrapper ────────────────────────────────────────────────────────────

function SectionWrapper({ id, label, children, status, onApprove, onFlag, comment, onComment, noApproval }) {
  const borderColor = status === 'approved'
    ? 'var(--color-green)'
    : status === 'flagged'
    ? 'var(--color-red)'
    : 'transparent';

  return (
    <div style={{ position: 'relative', marginBottom: '14px' }}>
      {/* Left border indicator */}
      <div style={{
        position: 'absolute', left: 0, top: 0, bottom: 0,
        width: '3px', borderRadius: '2px',
        background: borderColor,
        transition: 'background 0.2s',
        zIndex: 1,
      }} />

      <div style={{ paddingLeft: '10px' }}>
        {children}

        {!noApproval && (
          <div style={{
            display: 'flex', gap: '6px', alignItems: 'center',
            marginTop: '6px', paddingLeft: '2px',
          }}>
            <PillButton
              active={status === 'approved'}
              activeColor="var(--color-green)"
              activeLabel="✓ Approved"
              inactiveLabel="Approve"
              onClick={() => onApprove(id)}
            />
            <PillButton
              active={status === 'flagged'}
              activeColor="var(--color-red)"
              activeLabel="⚑ Flagged"
              inactiveLabel="Flag"
              onClick={() => onFlag(id)}
            />
          </div>
        )}

        {status === 'flagged' && !noApproval && (
          <div style={{
            display: 'flex', gap: '8px', alignItems: 'flex-start',
            marginTop: '8px', paddingLeft: '2px',
          }}>
            <Input
              multiline
              rows={2}
              full
              placeholder="What needs to change?"
              value={comment || ''}
              onChange={e => onComment(id, e.target.value)}
              style={{ fontSize: '12px' }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Approval stat card ────────────────────────────────────────────────────────

function ApprovalStat({ value, label, color }) {
  return (
    <div style={{
      flex: 1, background: 'var(--color-card)',
      border: '1px solid var(--color-border)',
      borderRadius: '12px', padding: '16px 20px',
      display: 'flex', alignItems: 'center', gap: '14px',
    }}>
      <div style={{
        width: '40px', height: '40px', borderRadius: '10px', flexShrink: 0,
        background: `${color}26`, border: `1px solid ${color}4D`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: "'Urbanist', sans-serif", fontWeight: 800, fontSize: '20px', color,
      }}>
        {value}
      </div>
      <div style={{
        fontFamily: "'Urbanist', sans-serif", fontSize: '11px',
        color: 'var(--color-text-muted)',
      }}>
        {label}
      </div>
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState({ navigate }) {
  return (
    <div style={{
      height: '100%', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      background: 'var(--color-bg)', padding: '80px 40px', textAlign: 'center', gap: '12px',
    }}>
      <div style={{ fontSize: '40px', color: 'var(--color-text-muted)' }}>◈</div>
      <div style={{
        fontFamily: "'Urbanist', sans-serif", fontWeight: 700, fontSize: '18px',
        color: 'var(--color-text)',
      }}>
        No project selected
      </div>
      <div style={{
        fontFamily: "'Urbanist', sans-serif", fontSize: '12px',
        color: 'var(--color-text-soft)', marginBottom: '12px',
      }}>
        Go to the Brief Translator or Project Library to open a project.
      </div>
      <Button variant="primary" onClick={() => navigate('library')}>Go to Library</Button>
    </div>
  );
}

// ─── ProjectDocument ──────────────────────────────────────────────────────────

export default function ProjectDocument() {
  const { activeProject, showToast, navigate, userPlan } = useContext(AppContext);

  const r = activeProject?.result  ?? null;
  const s = activeProject?.scoring ?? null;

  const phases     = r ? buildPhases(r.timeframe?.taskDays) : [];
  const hexColors  = r ? extractHexColors(r.colorDirection) : [];

  const [activeTab,       setActiveTab]       = useState('brief');
  const [approvalStatus,  setApprovalStatus]  = useState({});
  const [comments,        setComments]        = useState({});
  const [shareLink,       setShareLink]       = useState(null);
  const [copied,          setCopied]          = useState(false);
  const [inspirations,    setInspirations]    = useState([]);
  const [loadingInspi,    setLoadingInspi]    = useState(false);

  // ── Compute approvable sections ────────────────────────────────────────────

  const approvableSections = r ? [
    { id: 'understanding', label: 'Project Understanding',  show: !!r.projectUnderstanding },
    { id: 'chaos',         label: 'Chaos Solutions',        show: !!(r.isChaos && r.chaosSolutions?.length > 0) },
    { id: 'tone',          label: 'Tone & Mood',            show: !!(r.toneWords?.length > 0) },
    { id: 'colour',        label: 'Colour Direction',       show: !!r.colorDirection },
    { id: 'typography',    label: 'Typography Direction',   show: !!r.typography },
    { id: 'brand',         label: 'Brand Personality',      show: !!(r.brandAxes?.length > 0) },
    { id: 'moodboard',     label: 'Moodboard Direction',    show: !!(r.moodboardKeywords?.length > 0) },
    { id: 'budget',        label: 'Budget Estimate',        show: !!r.budgetRange },
    { id: 'roadmap',       label: 'Product Roadmap',        show: phases.length > 0 },
    { id: 'roles',         label: 'Roles Needed',           show: !!(r.rolesNeeded?.length > 0) },
    { id: 'techstack',     label: 'Tech Stack',             show: !!r.techStack },
    { id: 'features',      label: 'Feature Analysis',       show: !!(r.features?.length > 0) },
    { id: 'userflow',      label: 'User Flow',              show: !!(r.userFlow?.length > 0) },
    { id: 'inspirations',  label: 'Design Inspirations',    show: true },
  ].filter(s => s.show) : [];

  const approvedCount = approvableSections.filter(sec => approvalStatus[sec.id] === 'approved').length;
  const flaggedCount  = approvableSections.filter(sec => approvalStatus[sec.id] === 'flagged').length;
  const pendingCount  = approvableSections.length - approvedCount - flaggedCount;
  const locked        = approvableSections.length > 0 && approvedCount === approvableSections.length;

  // ── Actions ────────────────────────────────────────────────────────────────

  function handleApprove(id) {
    setApprovalStatus(prev => ({
      ...prev,
      [id]: prev[id] === 'approved' ? 'pending' : 'approved',
    }));
  }

  function handleFlag(id) {
    setApprovalStatus(prev => ({
      ...prev,
      [id]: prev[id] === 'flagged' ? 'pending' : 'flagged',
    }));
  }

  function handleComment(id, val) {
    setComments(prev => ({ ...prev, [id]: val }));
  }

  function handleSendForApproval() {
    const approvalId = Math.random().toString(36).slice(2, 9);
    const link = `${window.location.origin}/approval/${approvalId}`;
    setShareLink(link);
    navigator.clipboard.writeText(link).then(() => {
      showToast('Approval link copied to clipboard!', 'success');
    });
    setActiveTab('approval');
  }

  function copyShareLink() {
    navigator.clipboard.writeText(shareLink).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  async function handleFetchInspirations() {
    if (!r) return;
    setLoadingInspi(true);
    try {
      const found = await fetchInspirations(r.projectTitle, r.toneWords, r.moodboardKeywords);
      setInspirations(Array.isArray(found) ? found : []);
    } catch {
      showToast('Could not fetch inspirations', 'error');
    } finally {
      setLoadingInspi(false);
    }
  }

  // ── Wrap helper ────────────────────────────────────────────────────────────

  function wrap(id, content, noApproval = false) {
    return (
      <SectionWrapper
        key={id}
        id={id}
        status={approvalStatus[id] ?? 'pending'}
        onApprove={handleApprove}
        onFlag={handleFlag}
        comment={comments[id]}
        onComment={handleComment}
        noApproval={noApproval}
      >
        {content}
      </SectionWrapper>
    );
  }

  // ── Empty / no project ─────────────────────────────────────────────────────

  if (!activeProject) return <EmptyState navigate={navigate} />;

  // ── Render ─────────────────────────────────────────────────────────────────

  const verdictBadgeColor = s ? verdictColor(s.verdict) : 'var(--color-text-muted)';

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--color-bg)' }}>

      {/* ── Top bar ── */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 50,
        background: 'var(--color-bg)',
        borderBottom: '1px solid var(--color-border)',
        padding: '0 40px', height: '60px', flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: '16px',
      }}>
        {/* Left */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0, flex: 1 }}>
          <Button variant="ghost" size="sm" onClick={() => navigate('library')}>←</Button>
          <span style={{
            fontFamily: "'Urbanist', sans-serif", fontWeight: 700, fontSize: '15px',
            color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {activeProject.title ?? 'Untitled Project'}
          </span>
          {s && (
            <Badge color={verdictBadgeColor} dot size="sm">{s.verdict}</Badge>
          )}
          {locked && (
            <Badge color="var(--color-green)" dot size="sm">Locked</Badge>
          )}
        </div>

        {/* Centre — tab switcher */}
        <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
          {['brief', 'approval'].map(tab => {
            const active = activeTab === tab;
            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{
                  padding: '6px 16px', borderRadius: '8px', cursor: 'pointer',
                  fontFamily: "'Urbanist', sans-serif", fontWeight: 600, fontSize: '13px',
                  transition: 'all 0.15s', border: 'none',
                  background: active ? 'var(--color-accent-bg)' : 'transparent',
                  color: active ? 'var(--color-accent)' : 'var(--color-text-soft)',
                  outline: active ? '1px solid rgba(200,245,90,0.44)' : 'none',
                }}
                onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--color-surface)'; }}
                onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent'; }}
              >
                {tab === 'brief' ? 'Brief' : 'Approval'}
                {tab === 'approval' && flaggedCount > 0 && (
                  <span style={{
                    marginLeft: '6px', background: 'var(--color-red)', color: '#fff',
                    borderRadius: '100px', padding: '1px 6px', fontSize: '9px', fontWeight: 700,
                  }}>
                    {flaggedCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Right — actions */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0 }}>
          <Button
            variant="secondary"
            size="sm"
            title={userPlan === 'free' ? 'Free-plan exports include a watermark. Upgrade to remove it.' : undefined}
            onClick={() => downloadBrief(r, s, { plan: userPlan })}>
            ⬇ {userPlan === 'free' ? 'Download (Free)' : 'Download'}
          </Button>
          <Button variant="secondary" size="sm" onClick={handleSendForApproval}>🔗 Send for Approval</Button>
          {!locked && (
            <Button variant="primary" size="sm" onClick={() => navigate('team')}>Build Team →</Button>
          )}
        </div>
      </div>

      {/* ── Scrollable content ── */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <div style={{ maxWidth: '860px', margin: '0 auto', padding: '32px 40px 80px' }}>

          {/* ══ TAB 1 — BRIEF ══ */}
          {activeTab === 'brief' && (
            <>
              {/* Locked banner */}
              {locked && (
                <div style={{
                  background: 'rgba(77,255,160,0.08)',
                  border: '1px solid rgba(77,255,160,0.3)',
                  borderRadius: '12px', padding: '14px 20px',
                  display: 'flex', alignItems: 'center', gap: '12px',
                  marginBottom: '20px',
                }}>
                  <div style={{
                    width: '28px', height: '28px', borderRadius: '50%',
                    background: 'var(--color-green)', flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#09090D', fontWeight: 800, fontSize: '14px',
                  }}>✓</div>
                  <span style={{
                    fontFamily: "'Urbanist', sans-serif", fontWeight: 600, fontSize: '13px',
                    color: 'var(--color-text)',
                  }}>
                    This brief has been approved by your client. It is now locked and ready for execution.
                  </span>
                </div>
              )}

              {/* Project understanding */}
              {r?.projectUnderstanding && wrap('understanding', (
                <div style={{
                  background: 'var(--color-surface)', border: '1px solid var(--color-border)',
                  borderRadius: '14px', padding: '18px 24px',
                }}>
                  <div style={labelStyle}>PROJECT UNDERSTANDING</div>
                  <p style={{ fontFamily: "'Urbanist', sans-serif", fontSize: '14px', color: 'var(--color-text)', lineHeight: 1.85, margin: 0 }}>
                    {r.projectUnderstanding}
                  </p>
                </div>
              ))}

              {/* Score (no approval) */}
              {s && wrap('score', <ScoreStrip s={s} />, true)}

              {/* Chaos banner */}
              {r?.isChaos && r.chaosSolutions?.length > 0 && wrap('chaos', <ChaosBanner r={r} s={s} />)}

              {/* Tone & Mood */}
              {r?.toneWords?.length > 0 && wrap('tone', (
                <Card title="Tone & Mood">
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {r.toneWords.map(w => (
                      <span key={w} style={{
                        background: 'var(--color-accent-bg)', border: '1px solid var(--color-accent-border)',
                        borderRadius: '6px', padding: '4px 12px',
                        fontFamily: "'Urbanist', sans-serif", fontWeight: 600, fontSize: '12px', color: 'var(--color-accent)',
                      }}>{w}</span>
                    ))}
                  </div>
                </Card>
              ))}

              {/* Colour Direction */}
              {r?.colorDirection && wrap('colour', (
                <Card title="Colour Direction">
                  {hexColors.length > 0 ? (
                    <>
                      <div style={{ display: 'flex', gap: '6px', marginBottom: '10px' }}>
                        {hexColors.map(hex => (
                          <div key={hex} title={hex}
                            onClick={() => navigator.clipboard.writeText(hex)}
                            style={{
                              flex: 1, height: '36px', borderRadius: '8px',
                              background: hex, cursor: 'pointer',
                              border: '1px solid rgba(255,255,255,0.1)',
                            }}
                          />
                        ))}
                      </div>
                      <p style={{ fontFamily: "'Urbanist', sans-serif", fontSize: '11px', color: 'var(--color-text-soft)', margin: 0 }}>
                        {r.colorDirection}
                      </p>
                    </>
                  ) : (
                    <p style={{ fontFamily: "'Urbanist', sans-serif", fontSize: '12px', color: 'var(--color-text-soft)', lineHeight: 1.7, margin: 0 }}>
                      {r.colorDirection}
                    </p>
                  )}
                </Card>
              ))}

              {/* Typography */}
              {r?.typography && wrap('typography', (
                <Card title="Typography Direction">
                  <p style={{ fontFamily: "'Urbanist', sans-serif", fontSize: '12px', color: 'var(--color-text-soft)', lineHeight: 1.7, margin: 0 }}>
                    {r.typography}
                  </p>
                </Card>
              ))}

              {/* Brand Personality */}
              {r?.brandAxes?.length > 0 && wrap('brand', (
                <Card title="Brand Personality">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    {r.brandAxes.map((axis, i) => (
                      <div key={i}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                          <span style={{ fontFamily: "'Urbanist', sans-serif", fontSize: '10px', color: 'var(--color-text-muted)' }}>{axis.left ?? axis.label}</span>
                          <span style={{ fontFamily: "'Urbanist', sans-serif", fontSize: '10px', color: 'var(--color-text-muted)' }}>{axis.right ?? ''}</span>
                        </div>
                        <div style={{ position: 'relative', height: '3px', background: 'var(--color-border)', borderRadius: '2px' }}>
                          <div style={{
                            position: 'absolute', top: '-5px',
                            left: `calc(${axis.value ?? 50}% - 6px)`,
                            width: '13px', height: '13px', borderRadius: '50%',
                            background: 'var(--color-accent)',
                            border: '2px solid var(--color-bg)',
                            transition: 'left 0.5s ease',
                          }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              ))}

              {/* Moodboard */}
              {r?.moodboardKeywords?.length > 0 && wrap('moodboard', (
                <Card title="Moodboard Direction">
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '7px' }}>
                    {r.moodboardKeywords.map(kw => (
                      <span key={kw} style={{
                        background: 'var(--color-surface)', border: '1px solid var(--color-border)',
                        borderRadius: '6px', padding: '4px 12px',
                        fontFamily: "'Urbanist', sans-serif", fontSize: '12px', color: 'var(--color-text)',
                      }}>{kw}</span>
                    ))}
                  </div>
                </Card>
              ))}

              {/* How to improve (no approval) */}
              {r?.clarityImprovements?.length > 0 && wrap('improvements', (
                <Card accent title="How to Improve This Brief" style={{ borderColor: 'rgba(90,184,255,0.4)' }}>
                  <NumberedList items={r.clarityImprovements} color="var(--color-blue)" />
                </Card>
              ), true)}

              {/* Questions to ask (no approval) */}
              {r?.questionsToAsk?.length > 0 && wrap('questions', (
                <Card title="Questions to Ask Your Client">
                  <NumberedList items={r.questionsToAsk} color="var(--color-accent)" dimText />
                </Card>
              ), true)}

              {/* Red flags (no approval) */}
              {r?.redFlags?.length > 0 && wrap('redflags', (
                <Card accent title="Red Flags" style={{ borderColor: 'rgba(255,77,106,0.4)', backgroundImage: 'linear-gradient(135deg, rgba(255,77,106,0.04) 0%, transparent 60%)' }}>
                  {r.redFlags.map((flag, i) => (
                    <div key={i} style={{
                      display: 'flex', gap: '10px', alignItems: 'flex-start',
                      padding: '10px 0',
                      borderBottom: i < r.redFlags.length - 1 ? '1px solid var(--color-border)' : 'none',
                    }}>
                      <span style={{ color: 'var(--color-red)', flexShrink: 0 }}>⚠</span>
                      <span style={{ fontFamily: "'Urbanist', sans-serif", fontSize: '13px', color: 'var(--color-text)' }}>{flag}</span>
                    </div>
                  ))}
                </Card>
              ), true)}

              {/* Budget */}
              {r?.budgetRange && wrap('budget', <BudgetCard budgetRange={r.budgetRange} />)}

              {/* Roadmap */}
              {phases.length > 0 && wrap('roadmap', <RoadmapCard phases={phases} timeframe={r.timeframe} />)}

              {/* Roles */}
              {r?.rolesNeeded?.length > 0 && wrap('roles', <RolesCard rolesNeeded={r.rolesNeeded} />)}

              {/* Tech stack */}
              {r?.techStack && wrap('techstack', <TechStackCard techStack={r.techStack} />)}

              {/* Features */}
              {r?.features?.length > 0 && wrap('features', <FeaturesCard features={r.features} />)}

              {/* User flow */}
              {r?.userFlow?.length > 0 && wrap('userflow', <UserFlowCard userFlow={r.userFlow} />)}

              {/* Inspirations */}
              {wrap('inspirations', (
                <InspirationsCard
                  r={r}
                  inspirations={inspirations}
                  loadingInspi={loadingInspi}
                  onFetch={handleFetchInspirations}
                />
              ))}
            </>
          )}

          {/* ══ TAB 2 — APPROVAL ══ */}
          {activeTab === 'approval' && (
            <>
              {/* Stats row */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '24px' }}>
                <ApprovalStat value={approvedCount} label="Sections Approved" color="var(--color-green)" />
                <ApprovalStat value={flaggedCount}  label="Sections Flagged"  color="var(--color-red)" />
                <ApprovalStat value={pendingCount}  label="Awaiting Review"   color="var(--color-text-muted)" />
              </div>

              {/* Progress bar */}
              <div style={{ marginBottom: '24px' }}>
                <div style={{
                  fontFamily: "'Urbanist', sans-serif", fontWeight: 600, fontSize: '13px',
                  color: 'var(--color-text)', marginBottom: '6px',
                }}>
                  Brief Review Progress
                </div>
                <div style={{
                  fontFamily: "'Urbanist', sans-serif", fontSize: '11px',
                  color: 'var(--color-text-muted)', marginBottom: '8px',
                }}>
                  {approvedCount} of {approvableSections.length} sections approved
                </div>
                <div style={{ height: '6px', background: 'var(--color-border)', borderRadius: '3px', overflow: 'hidden' }}>
                  <div style={{
                    height: '100%',
                    width: approvableSections.length > 0 ? `${(approvedCount / approvableSections.length) * 100}%` : '0%',
                    background: 'var(--color-green)',
                    borderRadius: '3px',
                    transition: 'width 0.6s ease',
                  }} />
                </div>
              </div>

              {/* Send for approval */}
              <div style={{
                background: 'var(--color-card)',
                border: '1px solid var(--color-accent-border)',
                borderRadius: '14px', padding: '20px', marginBottom: '20px',
              }}>
                {shareLink ? (
                  <>
                    <div style={{
                      fontFamily: "'Urbanist', sans-serif", fontWeight: 700, fontSize: '14px',
                      color: 'var(--color-text)', marginBottom: '10px',
                    }}>
                      Approval link is active
                    </div>
                    <div style={{
                      background: 'var(--color-surface)', border: '1px solid var(--color-border)',
                      borderRadius: '10px', padding: '12px 14px',
                      display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px',
                    }}>
                      <span style={{
                        flex: 1, fontFamily: "'Urbanist', sans-serif", fontSize: '12px',
                        color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {shareLink}
                      </span>
                      <Button variant="secondary" size="sm" onClick={copyShareLink}>
                        {copied ? '✓ Copied!' : 'Copy'}
                      </Button>
                    </div>
                    <div style={{
                      fontFamily: "'Urbanist', sans-serif", fontSize: '12px',
                      color: 'var(--color-text-soft)',
                    }}>
                      Send this link to your client. They can review and approve each section of the brief.
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{
                      fontFamily: "'Urbanist', sans-serif", fontWeight: 700, fontSize: '14px',
                      color: 'var(--color-text)', marginBottom: '6px',
                    }}>
                      Send brief to client for approval
                    </div>
                    <div style={{
                      fontFamily: "'Urbanist', sans-serif", fontSize: '12px',
                      color: 'var(--color-text-soft)', marginBottom: '14px',
                    }}>
                      Generate a shareable link your client can use to review and sign off on the brief.
                    </div>
                    <Button variant="primary" onClick={handleSendForApproval}>
                      Generate Approval Link
                    </Button>
                  </>
                )}
              </div>

              {/* Flagged sections */}
              {flaggedCount > 0 && (
                <div style={{ marginBottom: '24px' }}>
                  <div style={{
                    fontFamily: "'Urbanist', sans-serif", fontWeight: 700, fontSize: '13px',
                    color: 'var(--color-text)', marginBottom: '12px',
                  }}>
                    Flagged Sections
                  </div>
                  {approvableSections
                    .filter(sec => approvalStatus[sec.id] === 'flagged')
                    .map(sec => (
                      <div key={sec.id} style={{
                        background: 'var(--color-surface)',
                        border: '1px solid rgba(255,77,106,0.3)',
                        borderRadius: '10px', padding: '14px 16px',
                        marginBottom: '8px',
                        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px',
                      }}>
                        <div style={{ flex: 1 }}>
                          <div style={{
                            fontFamily: "'Urbanist', sans-serif", fontWeight: 600, fontSize: '13px',
                            color: 'var(--color-text)',
                          }}>
                            {sec.label}
                          </div>
                          {comments[sec.id] && (
                            <div style={{
                              fontFamily: "'Urbanist', sans-serif", fontSize: '12px',
                              color: 'var(--color-text-soft)', fontStyle: 'italic', marginTop: '4px',
                            }}>
                              {comments[sec.id]}
                            </div>
                          )}
                        </div>
                        <Button variant="ghost" size="sm" onClick={() => handleApprove(sec.id)}>
                          Resolve
                        </Button>
                      </div>
                    ))
                  }
                </div>
              )}

              {/* All sections status */}
              <div>
                <div style={{
                  fontFamily: "'Urbanist', sans-serif", fontWeight: 700, fontSize: '13px',
                  color: 'var(--color-text)', marginBottom: '12px',
                }}>
                  All Sections
                </div>
                {approvableSections.map((sec, i) => {
                  const st = approvalStatus[sec.id] ?? 'pending';
                  const badgeColor = st === 'approved' ? 'var(--color-green)' : st === 'flagged' ? 'var(--color-red)' : 'var(--color-text-muted)';
                  return (
                    <div key={sec.id} style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '10px 0',
                      borderBottom: i < approvableSections.length - 1 ? '1px solid var(--color-border)' : 'none',
                    }}>
                      <span style={{
                        fontFamily: "'Urbanist', sans-serif", fontSize: '13px', color: 'var(--color-text)',
                      }}>
                        {sec.label}
                      </span>
                      <Badge color={badgeColor} size="sm">
                        {st.charAt(0).toUpperCase() + st.slice(1)}
                      </Badge>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
