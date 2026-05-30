import { useState, useContext, useEffect } from 'react';
import AppContext from '../context/AppContext';
import useProximity from '../hooks/useProximity';

function useWindowWidth() {
  const [width, setWidth] = useState(() => window.innerWidth)
  useEffect(() => {
    function onResize() { setWidth(window.innerWidth) }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return width
}
import { Button, Badge } from '../components/ui';
import { ROLE_META } from '../lib/constants';
import {
  ClockIcon,
  SparklesIcon,
  BoltIcon,
  LinkIcon,
  LockClosedIcon,
  MagnifyingGlassIcon,
} from '@heroicons/react/24/outline';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function shortDate(ts) {
  const d = new Date(ts);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return 'Today';
  const diff = Math.floor((now - d) / 86400000);
  if (diff === 1) return 'Yesterday';
  if (diff < 7) return `${diff}d ago`;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function verdictColor(verdict) {
  if (verdict === 'GOOD')  return 'var(--color-green)';
  if (verdict === 'FAIR')  return 'var(--color-amber)';
  if (verdict === 'CHAOS') return 'var(--color-purple)';
  return 'var(--color-red)';
}

function normalise(item) {
  return {
    ...item,
    result:  item.result  ?? item.data?.result  ?? null,
    scoring: item.scoring ?? item.data?.scoring ?? null,
    title:   item.title   ?? item.data?.projectName ?? 'Untitled',
  };
}

// ─── ProjectCard ──────────────────────────────────────────────────────────────

// Origin label + colour for the small pill in the top-right of every
// project card. Mirrors the OriginPill in the sidebar so users see the
// same vocabulary everywhere.
function projectOrigin(item) {
  if (item.source === 'intake') {
    return { label: 'Client', color: '#16a34a', bg: 'rgba(22,163,74,0.10)', border: 'rgba(22,163,74,0.25)' }
  }
  if (item.section === 'team') {
    return { label: 'Team Collab', color: '#7C3AED', bg: 'rgba(124,58,237,0.10)', border: 'rgba(124,58,237,0.25)' }
  }
  return { label: 'Brief', color: '#0369A1', bg: 'rgba(14,165,233,0.10)', border: 'rgba(14,165,233,0.25)' }
}

function ProjectCard({ item, onClick }) {
  const project  = normalise(item);
  const verdict  = project.scoring?.verdict;
  const toneWords = project.result?.toneWords?.slice(0, 3) ?? [];
  const members  = project.teamMembers?.slice(0, 4) ?? [];
  const origin   = projectOrigin(item);

  // Proximity handles scale/lift now — only the border-color hover
  // is wired here so we don't fight the dock effect.
  function handleEnter(e) {
    e.currentTarget.style.borderColor = 'var(--color-border-hover)';
  }
  function handleLeave(e) {
    e.currentTarget.style.borderColor = 'var(--color-border)';
  }

  return (
    <div
      onClick={onClick}
      className="project-card"
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
      style={{
        background: 'var(--color-card)',
        border: '1px solid var(--color-border)',
        borderRadius: '14px',
        padding: '18px 20px',
        cursor: 'pointer',
        transition: 'border-color 0.2s',
        display: 'flex', flexDirection: 'column', gap: '10px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
        <span style={{
          fontFamily: "'Urbanist', sans-serif", fontWeight: 700, fontSize: '14px',
          color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          minWidth: 0, flex: 1,
        }}>
          {project.title}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          {verdict && (
            <Badge color={verdictColor(verdict)} size="sm">{verdict}</Badge>
          )}
          <span style={{
            background: origin.bg,
            border: '1px solid ' + origin.border,
            color: origin.color,
            borderRadius: 4,
            padding: '2px 7px',
            fontFamily: "'Urbanist', sans-serif",
            fontSize: 9, fontWeight: 700,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            whiteSpace: 'nowrap',
          }}>
            {origin.label}
          </span>
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
        {toneWords.length > 0
          ? toneWords.map(w => (
              <span key={w} style={{
                background: 'var(--color-surface)', borderRadius: '5px', padding: '2px 9px',
                fontSize: '11px', fontFamily: "'Urbanist', sans-serif", color: 'var(--color-text-soft)',
              }}>
                {w}
              </span>
            ))
          : (
            <span style={{
              background: 'var(--color-surface)', borderRadius: '5px', padding: '2px 9px',
              fontSize: '11px', fontFamily: "'Urbanist', sans-serif", color: 'var(--color-text-muted)',
            }}>
              {item.section ?? 'brief'}
            </span>
          )
        }
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '2px' }}>
        <div style={{ display: 'flex', gap: '4px' }}>
          {members.map((m, i) => {
            const meta = ROLE_META[m.role];
            return (
              <span key={i} title={m.role} style={{
                width: '22px', height: '22px', borderRadius: '50%', fontSize: '10px',
                background: meta ? `${meta.color}22` : 'var(--color-border)',
                border: `1px solid ${meta ? `${meta.color}55` : 'var(--color-border)'}`,
                color: meta?.color ?? 'var(--color-text-muted)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {meta?.icon ?? '?'}
              </span>
            );
          })}
        </div>
        <span style={{ fontFamily: "'Urbanist', sans-serif", fontSize: '10px', color: 'var(--color-text-muted)' }}>
          {shortDate(item.ts)}
        </span>
      </div>
    </div>
  );
}

// ─── EmptyState ───────────────────────────────────────────────────────────────

function EmptyState({ navigate }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', padding: '80px 40px', textAlign: 'center',
      gap: '12px',
    }}>
      <div style={{
        fontSize: '48px', color: 'var(--color-accent)',
        background: 'var(--color-accent-bg)',
        border: '1px solid var(--color-accent-border)',
        borderRadius: '16px', padding: '18px',
        marginBottom: '8px',
      }}>
        ▦
      </div>
      <div style={{
        fontFamily: "'Urbanist', sans-serif", fontWeight: 800, fontSize: '20px',
        color: 'var(--color-text)',
      }}>
        No projects yet
      </div>
      <div style={{
        fontFamily: "'Urbanist', sans-serif", fontSize: '13px',
        color: 'var(--color-text-soft)', maxWidth: '360px', lineHeight: 1.7,
        marginBottom: '8px',
      }}>
        Translate a brief or send an intake form to get started.
      </div>
      <div style={{ display: 'flex', gap: '10px' }}>
        <Button variant="primary" onClick={() => navigate('translator')}>Translate a Brief →</Button>
        <Button variant="secondary" onClick={() => navigate('intake')}>Send Intake Form</Button>
      </div>
    </div>
  );
}

// ─── IntakeFormCard ───────────────────────────────────────────────────────────

function IntakeFormCard({ form, onView, onCopyLink }) {
  const submission = form.intake_submissions?.[0];
  const isComplete = form.status === 'complete' ||
    submission?.status === 'complete';

  const timeAgo = (dateStr) => {
    if (!dateStr) return 'Just now';
    const diff = Date.now() - new Date(dateStr);
    const days = Math.floor(diff / 86400000);
    const hrs  = Math.floor(diff / 3600000);
    const mins = Math.floor(diff / 60000);
    if (days > 0) return days + 'd ago';
    if (hrs  > 0) return hrs  + 'h ago';
    return mins + 'm ago';
  };

  return (
    <div
      onMouseEnter={e => {
        e.currentTarget.style.borderColor = 'var(--color-border-hover)';
        e.currentTarget.style.boxShadow   = 'var(--shadow-card)';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = 'var(--color-border)';
        e.currentTarget.style.boxShadow   = 'none';
      }}
      style={{
        background: 'var(--color-card)',
        border: '1px solid var(--color-border)',
        borderRadius: 14,
        padding: 16,
        marginBottom: 10,
        transition: 'all 0.15s',
      }}
    >
      {/* Project name + type */}
      <div style={{ marginBottom: 10 }}>
        <div style={{
          fontFamily: "'Urbanist', sans-serif",
          fontWeight: 700, fontSize: 14,
          color: 'var(--color-text)',
          marginBottom: 4,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {form.project_name || 'Untitled Project'}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {form.project_type && (
            <span style={{
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 100,
              padding: '2px 8px',
              fontFamily: "'Urbanist', sans-serif",
              fontSize: 10,
              color: 'var(--color-text-muted)',
            }}>
              {form.project_type}
            </span>
          )}
          <span style={{
            fontFamily: "'Urbanist', sans-serif",
            fontSize: 10,
            color: 'var(--color-text-muted)',
          }}>
            {timeAgo(form.created_at)}
          </span>
        </div>
      </div>

      {/* Client info */}
      {form.client_name && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 7, marginBottom: 12,
        }}>
          <div style={{
            width: 22, height: 22, borderRadius: '50%',
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: "'Urbanist', sans-serif",
            fontWeight: 700, fontSize: 9,
            color: 'var(--color-text-muted)',
            flexShrink: 0,
          }}>
            {form.client_name[0].toUpperCase()}
          </div>
          <span style={{
            fontFamily: "'Urbanist', sans-serif",
            fontSize: 12,
            color: 'var(--color-text-soft)',
          }}>
            {form.client_name}
          </span>
        </div>
      )}

      {/* Status indicator */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12,
        padding: '6px 10px',
        background: isComplete
          ? 'rgba(22,163,74,0.06)' : 'rgba(217,119,6,0.06)',
        border: '1px solid ' + (isComplete
          ? 'rgba(22,163,74,0.15)' : 'rgba(217,119,6,0.15)'),
        borderRadius: 8,
      }}>
        <div style={{
          width: 6, height: 6, borderRadius: '50%',
          background: isComplete ? '#16a34a' : '#d97706',
          animation: !isComplete ? 'pulse 2s infinite' : 'none',
        }} />
        <span style={{
          fontFamily: "'Urbanist', sans-serif",
          fontSize: 10, fontWeight: 700,
          color: isComplete ? '#16a34a' : '#d97706',
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
        }}>
          {isComplete ? 'Brief ready' : 'Awaiting client'}
        </span>
        {isComplete && submission?.submitted_at && (
          <span style={{
            fontFamily: "'Urbanist', sans-serif",
            fontSize: 9,
            color: 'var(--color-text-muted)',
            marginLeft: 'auto',
          }}>
            {timeAgo(submission.submitted_at)}
          </span>
        )}
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 8 }}>
        {isComplete ? (
          <button
            onClick={() => onView(form)}
            style={{
              flex: 1,
              background: 'var(--color-text)',
              color: 'var(--color-bg)',
              border: 'none',
              borderRadius: 9,
              padding: '8px 0',
              fontFamily: "'Urbanist', sans-serif",
              fontWeight: 700, fontSize: 12,
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}
          >
            <SparklesIcon style={{ width: 13, height: 13 }} />
            View Brief
          </button>
        ) : (
          <button
            onClick={() => onCopyLink(form)}
            style={{
              flex: 1,
              background: 'var(--color-surface)',
              color: 'var(--color-text)',
              border: '1px solid var(--color-border)',
              borderRadius: 9,
              padding: '8px 0',
              fontFamily: "'Urbanist', sans-serif",
              fontWeight: 600, fontSize: 12,
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}
          >
            <LinkIcon style={{ width: 13, height: 13 }} />
            Copy Link
          </button>
        )}
      </div>
    </div>
  );
}

// ─── StatusColumn ─────────────────────────────────────────────────────────────

function StatusColumn({ title, color, icon: Icon, forms, onView, onCopyLink }) {
  return (
    <div>
      {/* Column header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        marginBottom: 14, paddingBottom: 10,
        borderBottom: '2px solid ' + color + '30',
      }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
        <span style={{
          fontFamily: "'Urbanist', sans-serif",
          fontWeight: 700, fontSize: 13,
          color: 'var(--color-text)',
        }}>
          {title}
        </span>
        <span style={{
          fontFamily: "'Urbanist', sans-serif",
          fontSize: 11,
          color: 'var(--color-text-muted)',
          marginLeft: 'auto',
        }}>
          {forms.length}
        </span>
      </div>

      {/* Cards */}
      {forms.length === 0 ? (
        <div style={{
          background: 'var(--color-surface)',
          border: '1px dashed var(--color-border)',
          borderRadius: 12,
          padding: '24px 16px',
          textAlign: 'center',
          fontFamily: "'Urbanist', sans-serif",
          fontSize: 12,
          color: 'var(--color-text-muted)',
        }}>
          No projects here
        </div>
      ) : forms.map((form, i) => (
        <IntakeFormCard
          key={form.id || i}
          form={form}
          onView={onView}
          onCopyLink={onCopyLink}
        />
      ))}
    </div>
  );
}

// ─── ProjectLibrary ────────────────────────────────────────────────────────────

export default function ProjectLibrary() {
  const {
    history, navigate, setActiveProject, openProject,
    intakeForms, loadIntakeForms, showToast,
    userPlan, openUpgradeModal,
  } = useContext(AppContext);

  const windowWidth = useWindowWidth()
  const isMobile = windowWidth <= 480
  const isTablet = windowWidth > 480 && windowWidth <= 768

  const [query, setQuery]       = useState('');
  const [activeTab, setActiveTab] = useState('projects');

  const pendingCount = intakeForms.filter(f => f.status !== 'complete').length;

  // macOS-dock proximity for project cards. Re-runs whenever the
  // visible history changes so newly-loaded cards pick up the effect.
  useProximity('.project-card', {
    distance: 140,
    maxScale: 1.04,
    maxLift: -8,
    speed: 0.3,
    glow: true,
    tilt: true,
  }, [history?.length, activeTab])

  // ── Handlers ────────────────────────────────────────────────────────────────

  function handleViewForm(form) {
    const submission = form.intake_submissions?.[0];
    if (!submission?.result) return;

    setActiveProject({
      id: form.id,
      title: form.project_name,
      result: submission.result,
      scoring: submission.scoring,
      data: {
        brief: submission.brief_text || '',
        scoring: submission.scoring,
        result: submission.result,
      },
      ts: submission.submitted_at || form.created_at,
      source: 'intake',
    });
    navigate('document');
  }

  function handleCopyLink(form) {
    const url = (import.meta.env.VITE_APP_URL ||
      window.location.origin) + '/intake/' + form.id;
    navigator.clipboard.writeText(url);
    showToast('Link copied to clipboard');
  }

  // ── Filter / sort history ────────────────────────────────────────────────────

  const filtered = history
    .filter(item => {
      if (!query.trim()) return true;
      const title = (item.title ?? item.data?.projectName ?? '').toLowerCase();
      return title.includes(query.toLowerCase());
    })
    .sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return b.ts - a.ts;
    });

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: 'var(--color-bg)' }}>
      <div style={{
        width: '100%', boxSizing: 'border-box',
        padding: isMobile
          ? '24px 16px'
          : isTablet
            ? '32px 24px'
            : '40px 48px',
      }}>

        {/* Header */}
        <div style={{
          padding: '32px 0 24px',
          display: 'flex',
          flexDirection: isMobile ? 'column' : 'row',
          alignItems: isMobile ? 'center' : 'center',
          justifyContent: 'space-between',
          gap: isMobile ? 12 : 0,
        }}>
          <div style={{ textAlign: isMobile ? 'center' : 'left' }}>
            <h1 style={{
              fontFamily: "'Urbanist', sans-serif", fontWeight: 800,
              fontSize: isMobile ? '22px' : '26px',
              color: 'var(--color-text)', letterSpacing: '-0.02em', margin: '0 0 4px',
            }}>
              Project Library
            </h1>
            {!isMobile && (
              <div style={{
                fontFamily: "'Urbanist', sans-serif", fontSize: '12px',
                color: 'var(--color-text-muted)',
              }}>
                {activeTab === 'projects'
                  ? `${history.length} project${history.length !== 1 ? 's' : ''}`
                  : `${intakeForms.length} intake form${intakeForms.length !== 1 ? 's' : ''}`
                }
              </div>
            )}
          </div>

          {/* Search — only on projects tab */}
          {activeTab === 'projects' && history.length > 0 && (
            <div style={{ position: 'relative', width: isMobile ? '100%' : '240px' }}>
              <MagnifyingGlassIcon
                width={16}
                height={16}
                style={{
                  position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)',
                  color: 'var(--color-text-muted)', pointerEvents: 'none',
                }}
              />
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search projects..."
                style={{
                  width: '100%', paddingLeft: '34px', paddingRight: '12px',
                  height: '40px', background: 'var(--color-surface)',
                  border: '1px solid var(--color-border)', borderRadius: '9px',
                  color: 'var(--color-text)', fontFamily: "'Urbanist', sans-serif",
                  fontSize: '13px', outline: 'none', boxSizing: 'border-box',
                }}
                onFocus={e => (e.currentTarget.style.borderColor = 'var(--color-accent)')}
                onBlur={e => (e.currentTarget.style.borderColor = 'var(--color-border)')}
              />
            </div>
          )}
        </div>

        {/* Tab bar */}
        <div style={{
          display: 'flex', gap: 4,
          borderBottom: '1px solid var(--color-border)',
          marginBottom: 24, paddingBottom: 0,
        }}>
          {[
            { id: 'projects', label: 'All Projects', badge: null },
            { id: 'intakes',  label: 'Client Intakes', badge: pendingCount > 0 ? pendingCount : null },
          ].map(tab => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  background: 'transparent', border: 'none',
                  padding: '8px 16px', cursor: 'pointer',
                  fontFamily: "'Urbanist', sans-serif", fontSize: 14,
                  fontWeight: isActive ? 700 : 500,
                  color: isActive ? 'var(--color-text)' : 'var(--color-text-muted)',
                  borderBottom: `2px solid ${isActive ? 'var(--color-text)' : 'transparent'}`,
                  marginBottom: -1,
                  transition: 'all 0.15s',
                  display: 'flex', alignItems: 'center', gap: 0,
                }}
              >
                {tab.label}
                {tab.badge !== null && (
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    width: 16, height: 16, borderRadius: '50%',
                    background: 'var(--color-text)', color: 'var(--color-bg)',
                    fontFamily: "'Urbanist', sans-serif", fontWeight: 700, fontSize: 9,
                    marginLeft: 6, flexShrink: 0,
                  }}>
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* ── All Projects tab ──────────────────────────────────────────────── */}
        {activeTab === 'projects' && (
          <>
            {/* Project-limit banner (Free 2/2 or Starter 10/10) */}
            {(() => {
              const cap = userPlan === 'free' ? 2 : userPlan === 'starter' ? 10 : Infinity
              if (!Number.isFinite(cap)) return null
              const owned = (history || []).filter(p => !p.isShared).length
              if (owned < cap) return null
              const planLabel = userPlan === 'free' ? 'free-plan' : 'Starter plan'
              const ctaLabel = userPlan === 'starter' ? 'Upgrade to Pro →' : 'Upgrade →'
              return (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '12px 16px', marginBottom: 16,
                  background: 'rgba(124,58,237,0.06)',
                  border: '1px solid rgba(124,58,237,0.25)',
                  borderRadius: 12,
                  flexWrap: 'wrap',
                }}>
                  <LockClosedIcon style={{ width: 16, height: 16, color: '#7C3AED', flexShrink: 0 }} />
                  <div style={{ minWidth: 0, flex: 1, fontFamily: "'Urbanist', sans-serif", fontSize: 13, color: 'var(--color-text)' }}>
                    You've reached the {planLabel} project limit ({owned}/{cap}).
                    <span style={{ color: 'var(--color-text-muted)' }}>
                      {' '}Upgrade {userPlan === 'starter' ? 'to Pro for unlimited projects.' : 'to add more projects.'}
                    </span>
                  </div>
                  <button
                    onClick={() => openUpgradeModal?.('projects')}
                    style={{
                      padding: '7px 14px',
                      background: 'linear-gradient(135deg, #7C3AED, #A855F7)',
                      color: 'white', border: 'none', borderRadius: 9,
                      cursor: 'pointer',
                      fontFamily: "'Urbanist', sans-serif", fontSize: 12, fontWeight: 700,
                      whiteSpace: 'nowrap',
                    }}>
                    {ctaLabel}
                  </button>
                </div>
              )
            })()}

            {history.length === 0 && <EmptyState navigate={navigate} />}

            {history.length > 0 && filtered.length === 0 && (
              <div style={{
                padding: '60px 0', textAlign: 'center',
                fontFamily: "'Urbanist', sans-serif", fontSize: '13px',
                color: 'var(--color-text-muted)',
              }}>
                No projects match "{query}"
              </div>
            )}

            {filtered.length > 0 && (() => {
              // Free-plan history cap: show 5 most-recent. The rest are
              // rendered behind a blurred lock teaser so the user can see
              // they exist and click through to upgrade.
              const HISTORY_CAP = 5
              const isFree = userPlan === 'free'
              const visible = isFree ? filtered.slice(0, HISTORY_CAP) : filtered
              const hidden = isFree ? filtered.slice(HISTORY_CAP) : []
              const gridStyle = {
                display: 'grid',
                gridTemplateColumns: isMobile
                  ? '1fr'
                  : isTablet
                    ? 'repeat(2, 1fr)'
                    : 'repeat(4, 1fr)',
                gap: '16px',
              }
              return (
                <>
                  <div style={gridStyle}>
                    {visible.map(item => (
                      <ProjectCard
                        key={item.id}
                        item={item}
                        onClick={() => openProject(item)}
                      />
                    ))}
                  </div>

                  {hidden.length > 0 && (
                    <div style={{ marginTop: 22, position: 'relative' }}>
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 12,
                        padding: '12px 16px', marginBottom: 12,
                        background: 'rgba(124,58,237,0.06)',
                        border: '1px solid rgba(124,58,237,0.25)',
                        borderRadius: 12, flexWrap: 'wrap',
                      }}>
                        <LockClosedIcon style={{ width: 16, height: 16, color: '#7C3AED', flexShrink: 0 }} />
                        <div style={{ minWidth: 0, flex: 1, fontFamily: "'Urbanist', sans-serif", fontSize: 13, color: 'var(--color-text)' }}>
                          +{hidden.length} older brief{hidden.length === 1 ? '' : 's'} hidden
                          <span style={{ color: 'var(--color-text-muted)' }}> · Upgrade to access your full brief history.</span>
                        </div>
                        <button
                          onClick={() => openUpgradeModal?.('history')}
                          style={{
                            padding: '7px 14px',
                            background: 'linear-gradient(135deg, #7C3AED, #A855F7)',
                            color: 'white', border: 'none', borderRadius: 9,
                            cursor: 'pointer',
                            fontFamily: "'Urbanist', sans-serif", fontSize: 12, fontWeight: 700,
                            whiteSpace: 'nowrap',
                          }}>
                          Upgrade →
                        </button>
                      </div>

                      {/* Blurred / greyed teaser grid underneath */}
                      <div
                        onClick={() => openUpgradeModal?.('history')}
                        style={{
                          ...gridStyle,
                          filter: 'blur(3px) saturate(0.6)',
                          opacity: 0.55,
                          pointerEvents: 'none',
                          userSelect: 'none',
                        }}
                      >
                        {hidden.slice(0, 8).map(item => (
                          <ProjectCard key={'locked-' + item.id} item={item} onClick={() => {}} />
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )
            })()}
          </>
        )}

        {/* ── Client Intakes tab ───────────────────────────────────────────── */}
        {activeTab === 'intakes' && (
          <div>
            <div style={{
              display: 'grid',
              gridTemplateColumns: isMobile ? '1fr' : isTablet ? '1fr 1fr' : '1fr 1fr 1fr',
              gap: 16,
            }}>
              <StatusColumn
                title="Awaiting Client"
                color="#d97706"
                icon={ClockIcon}
                forms={intakeForms.filter(f =>
                  f.status === 'sent' ||
                  f.status === 'pending' ||
                  !f.status
                )}
                onView={handleViewForm}
                onCopyLink={handleCopyLink}
              />
              <StatusColumn
                title="Ready to Review"
                color="#16a34a"
                icon={SparklesIcon}
                forms={intakeForms.filter(f => f.status === 'complete')}
                onView={handleViewForm}
                onCopyLink={handleCopyLink}
              />
              <StatusColumn
                title="In Progress"
                color="var(--color-blue)"
                icon={BoltIcon}
                forms={intakeForms.filter(f => f.status === 'in_progress')}
                onView={handleViewForm}
                onCopyLink={handleCopyLink}
              />
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
