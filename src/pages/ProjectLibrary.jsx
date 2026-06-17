import { useState, useContext, useEffect } from 'react';
import AppContext from '../context/AppContext';
import useProximity from '../hooks/useProximity';
import StaggerGrid, { StaggerItem } from '../components/StaggerGrid';
import { SearchIllustration } from '../components/illustrations';

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
import { supabase } from '../lib/supabase';
import {
  ClockIcon,
  SparklesIcon,
  BoltIcon,
  LinkIcon,
  LockClosedIcon,
  MagnifyingGlassIcon,
  // Card meta + action icons
  DocumentTextIcon,
  InboxArrowDownIcon,
  FlagIcon,
  CheckBadgeIcon,
  CalendarDaysIcon,
  EyeIcon,
  PencilSquareIcon,
  TrashIcon,
  EllipsisHorizontalIcon,
  EnvelopeIcon,
  ArrowTopRightOnSquareIcon,
  ExclamationTriangleIcon,
  ChevronRightIcon,
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
  const members  = project.teamMembers?.slice(0, 4) ?? [];
  const origin   = projectOrigin(item);

  // One meaningful tag instead of three generic tone-words. The
  // discipline + platform tells you what kind of work this brief is
  // (e.g. "Digital Product · Web", "Brand · Print", "Photography"),
  // and that's a more useful filter than e.g. ["modern","clean","bold"]
  // which show up on most briefs. Falls back to source label so the
  // tag is never empty.
  const discipline = project.result?.discipline;
  let discLabel = '';
  if (discipline?.type) {
    discLabel = String(discipline.type).replace(/-/g, ' ');
    if (discipline.platform && discipline.platform !== 'both') {
      discLabel += ' · ' + discipline.platform;
    }
  } else if (item.section === 'team') {
    discLabel = 'Kanban project';
  } else if (item.section === 'intake') {
    discLabel = 'Client intake';
  } else {
    discLabel = 'Brief';
  }

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
        // height: 100% so every card in a row stretches to the row's
        // tallest sibling — equal-height grid cards.
        height: '100%',
        boxSizing: 'border-box',
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

      {/* Single discipline tag — what kind of work this brief is. */}
      <div>
        <span style={{
          display: 'inline-block',
          background: 'var(--color-surface)',
          borderRadius: '5px', padding: '3px 10px',
          fontSize: '11px', fontFamily: "'Urbanist', sans-serif",
          color: 'var(--color-text-soft)',
          textTransform: 'capitalize',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          maxWidth: '100%',
        }}>
          {discLabel}
        </span>
      </div>

      {/* Spacer pushes the footer (members + date) to the card bottom
          so cards line up neatly when content above them differs. */}
      <div style={{ flex: 1 }} />

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

// ─── SearchEmpty ──────────────────────────────────────────────────────────────
//   Rendered when the user has projects but the search query returns
//   nothing. Replaces the previous one-line "No projects match …"
//   message with the animated SearchIllustration.

function SearchEmpty({ query }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', padding: '60px 24px', textAlign: 'center',
      gap: 12,
    }}>
      <div style={{ width: 120, height: 120 }}>
        <SearchIllustration />
      </div>
      <div style={{
        fontFamily: "'Urbanist', sans-serif", fontWeight: 700,
        fontSize: 18, color: 'var(--color-text)', letterSpacing: '-0.02em',
      }}>
        Nothing found
      </div>
      <div style={{
        fontFamily: "'Urbanist', sans-serif", fontSize: 13,
        color: 'var(--color-text-muted)', maxWidth: 320, lineHeight: 1.6,
      }}>
        No projects match "{query}". Try different keywords or check your spelling.
      </div>
    </div>
  );
}

// ─── IntakeFormCard ───────────────────────────────────────────────────────────

function IntakeFormCard({ form, onView, onCopyLink, onOpenPublic, onDelete }) {
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => {
    if (!menuOpen) return;
    const onClickAway = (e) => {
      if (!e.target.closest?.('[data-card-menu]')) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onClickAway);
    return () => document.removeEventListener('mousedown', onClickAway);
  }, [menuOpen]);
  // Most recent submission. With many submissions per form (a form
  // can be sent to multiple clients) the others stay accessible via
  // the Delivery view; the card just surfaces the freshest pipeline
  // state.
  const submission = (form.intake_submissions || [])
    .slice()
    .sort((a, b) => new Date(b.submitted_at || b.created_at) - new Date(a.submitted_at || a.created_at))[0];

  // Recipient fields. Prefer the submission's actual values (the
  // client's filled Page 0), then fall back to the designer's
  // pre-fill on form.settings.recipient, then legacy columns.
  const recipient = form.settings?.recipient || {};
  const businessName = submission?.business_name || recipient.business_name || '';
  const clientName   = submission?.client_name   || recipient.client_name   || form.client_name || '';

  // Pipeline-aware status. The card surfaces what's actually
  // happening so the designer can decide whether to follow up.
  const progress = deriveIntakeProgress(form, submission);
  const isReady = progress.tone === 'success';

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
          {businessName || form.project_name || 'Untitled Project'}
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
      {clientName && (
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
            {clientName[0].toUpperCase()}
          </div>
          <span style={{
            fontFamily: "'Urbanist', sans-serif",
            fontSize: 12,
            color: 'var(--color-text-soft)',
          }}>
            {clientName}
          </span>
        </div>
      )}

      {/* Meta stats row — iconified glanceable data:
          questions count, submissions count, open count,
          flag count, expiry. Each chip has an icon so the row
          reads even when scanned quickly. */}
      <MetaStatsRow form={form} submission={submission} />

      {/* Status indicator — pipeline-aware: Draft / Awaiting /
          Processing / Ready / Approved / Failed */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12,
        padding: '6px 10px',
        background: progress.bg,
        border: '1px solid ' + progress.border,
        borderRadius: 8,
      }}>
        <div style={{
          width: 6, height: 6, borderRadius: '50%',
          background: progress.color,
          animation: progress.pulse ? 'pulse 2s infinite' : 'none',
        }} />
        <span style={{
          fontFamily: "'Urbanist', sans-serif",
          fontSize: 10, fontWeight: 700,
          color: progress.color,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
        }}>
          {progress.label}
        </span>
        {submission?.approved_at && (
          <CheckBadgeIcon style={{ width: 12, height: 12, color: progress.color, marginLeft: 4 }} />
        )}
        {(submission?.submitted_at || form.published_at) && (
          <span style={{
            fontFamily: "'Urbanist', sans-serif",
            fontSize: 9,
            color: 'var(--color-text-muted)',
            marginLeft: 'auto',
          }}>
            {timeAgo(submission?.submitted_at || form.published_at)}
          </span>
        )}
      </div>

      {/* Action buttons row.
          Primary (filled) — varies by state. Review brief when
          ready; otherwise the most useful follow-up action.
          Secondary (icon-only) — Open public form in a new tab.
          Ellipsis menu — Copy link / Open public / Delete. */}
      <div style={{ display: 'flex', gap: 6 }}>
        {isReady ? (
          <button onClick={() => onView(form)} style={primaryBtn} title="Review the translated brief">
            <SparklesIcon style={{ width: 13, height: 13 }} />
            Review brief
            <ChevronRightIcon style={{ width: 12, height: 12, marginLeft: 'auto' }} />
          </button>
        ) : progress.tone === 'accent' ? (
          <button onClick={() => onCopyLink(form)} style={secondaryBtn} title="Copy share link">
            <LinkIcon style={{ width: 13, height: 13 }} />
            Copy link
          </button>
        ) : form.status === 'draft' ? (
          <button onClick={() => onCopyLink(form)} style={secondaryBtn} title="Copy share link">
            <PencilSquareIcon style={{ width: 13, height: 13 }} />
            Open draft
          </button>
        ) : (
          <button onClick={() => onCopyLink(form)} style={secondaryBtn} title="Copy share link">
            <LinkIcon style={{ width: 13, height: 13 }} />
            Copy link
          </button>
        )}

        <div style={{ position: 'relative' }} data-card-menu>
          <button
            onClick={() => setMenuOpen(v => !v)}
            style={iconBtn}
            title="More actions"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label="More actions"
          >
            <EllipsisHorizontalIcon style={{ width: 14, height: 14 }} />
          </button>
          {menuOpen && (
            <CardMenu
              form={form}
              onCopyLink={() => { setMenuOpen(false); onCopyLink?.(form); }}
              onOpenPublic={() => { setMenuOpen(false); onOpenPublic?.(form); }}
              onView={() => { setMenuOpen(false); onView?.(form); }}
              onDelete={() => { setMenuOpen(false); onDelete?.(form); }}
              isReady={isReady}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Card button + menu styling shared by all states ─────────────
const primaryBtn = {
  flex: 1,
  background: 'var(--color-text)',
  color: 'var(--color-bg)',
  border: 'none',
  borderRadius: 9,
  padding: '8px 12px',
  fontFamily: "'Urbanist', sans-serif",
  fontWeight: 700, fontSize: 12,
  cursor: 'pointer',
  display: 'flex', alignItems: 'center', gap: 6,
};
const secondaryBtn = {
  flex: 1,
  background: 'var(--color-surface)',
  color: 'var(--color-text)',
  border: '1px solid var(--color-border)',
  borderRadius: 9,
  padding: '8px 12px',
  fontFamily: "'Urbanist', sans-serif",
  fontWeight: 600, fontSize: 12,
  cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
};
const iconBtn = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  width: 32, height: 32,
  background: 'var(--color-surface)',
  color: 'var(--color-text-soft)',
  border: '1px solid var(--color-border)',
  borderRadius: 9,
  cursor: 'pointer',
  flexShrink: 0,
};

// ─── MetaStatsRow ────────────────────────────────────────────────
// Glanceable chip row inside an intake card. Surfaces:
//   📋 question count          (always)
//   📨 submission count        (when at least one client submitted)
//   👁 form open count         (when published + has opens)
//   ⚠ red-flag count          (when the freshest submission has them)
//   ⏰ expires in X days       (when expires_at is in the future)
// Hidden entirely when there's nothing useful to show.
function MetaStatsRow({ form, submission }) {
  const qCount = Array.isArray(form.questions) ? form.questions.length
    : (Array.isArray(form.sections)
      ? form.sections.reduce((sum, s) => sum + (s.questions?.length || 0), 0)
      : 0);
  const submissions = form.submission_count || 0;
  const opens = form.open_count || 0;
  const redFlags = (() => {
    const list = submission?.flags;
    if (!Array.isArray(list)) return 0;
    return list.filter(f => f?.type === 'red_flag' && String(f.severity || '').toLowerCase() === 'high').length;
  })();
  const expiresInDays = (() => {
    if (!form.expires_at) return null;
    const ms = new Date(form.expires_at).getTime() - Date.now();
    if (ms <= 0) return 0;
    return Math.ceil(ms / 86400000);
  })();

  const chips = [];
  if (qCount > 0) chips.push({ icon: DocumentTextIcon, label: `${qCount}`, title: `${qCount} question${qCount === 1 ? '' : 's'}` });
  if (submissions > 0) chips.push({ icon: InboxArrowDownIcon, label: `${submissions}`, title: `${submissions} submission${submissions === 1 ? '' : 's'}` });
  if (opens > 0 && submissions !== opens) chips.push({ icon: EyeIcon, label: `${opens}`, title: `Opened ${opens} time${opens === 1 ? '' : 's'}` });
  if (redFlags > 0) chips.push({ icon: ExclamationTriangleIcon, label: `${redFlags}`, title: `${redFlags} high-severity red flag${redFlags === 1 ? '' : 's'}`, tone: 'warn' });
  if (expiresInDays != null && expiresInDays <= 14) chips.push({
    icon: CalendarDaysIcon,
    label: expiresInDays === 0 ? 'Expired' : `${expiresInDays}d`,
    title: expiresInDays === 0 ? 'Form expired' : `Expires in ${expiresInDays} day${expiresInDays === 1 ? '' : 's'}`,
    tone: expiresInDays <= 3 ? 'warn' : undefined,
  });

  if (!chips.length) return null;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
      {chips.map((c, i) => (
        <span
          key={i}
          title={c.title}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '3px 8px',
            background: c.tone === 'warn' ? 'rgba(217,119,6,0.08)' : 'var(--color-surface)',
            border: '1px solid ' + (c.tone === 'warn' ? 'rgba(217,119,6,0.20)' : 'var(--color-border)'),
            borderRadius: 100,
            fontFamily: "'Urbanist', sans-serif",
            fontSize: 11, fontWeight: 700,
            color: c.tone === 'warn' ? '#b45309' : 'var(--color-text-soft)',
          }}
        >
          <c.icon style={{ width: 11, height: 11 }} />
          {c.label}
        </span>
      ))}
    </div>
  );
}

// ─── CardMenu ────────────────────────────────────────────────────
// Small popover anchored to the ellipsis button. Click-outside
// dismisses (handled by IntakeFormCard's useEffect listener).
function CardMenu({ form, onCopyLink, onOpenPublic, onView, onDelete, isReady }) {
  const items = [];
  if (isReady) {
    items.push({ icon: SparklesIcon, label: 'Review brief', onClick: onView });
  }
  items.push({ icon: LinkIcon, label: 'Copy share link', onClick: onCopyLink });
  items.push({ icon: ArrowTopRightOnSquareIcon, label: 'Open public form', onClick: onOpenPublic });
  if (form.client_email) {
    items.push({
      icon: EnvelopeIcon,
      label: 'Email client',
      onClick: () => { window.location.href = `mailto:${form.client_email}`; },
    });
  }
  items.push({ icon: TrashIcon, label: 'Delete form', onClick: onDelete, danger: true });

  return (
    <div
      role="menu"
      style={{
        position: 'absolute',
        top: 'calc(100% + 4px)',
        right: 0,
        minWidth: 180,
        background: 'var(--color-card)',
        border: '1px solid var(--color-border)',
        borderRadius: 10,
        boxShadow: '0 12px 24px rgba(0,0,0,0.12)',
        padding: 4,
        zIndex: 30,
      }}
    >
      {items.map((it, i) => (
        <button
          key={i}
          role="menuitem"
          onClick={it.onClick}
          style={{
            display: 'flex', alignItems: 'center', gap: 9,
            width: '100%',
            padding: '8px 10px',
            background: 'transparent',
            border: 'none',
            borderRadius: 7,
            fontFamily: "'Urbanist', sans-serif",
            fontSize: 12, fontWeight: 600,
            color: it.danger ? '#dc2626' : 'var(--color-text)',
            cursor: 'pointer',
            textAlign: 'left',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = it.danger ? 'rgba(220,38,38,0.06)' : 'var(--color-surface)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
        >
          <it.icon style={{ width: 13, height: 13, flexShrink: 0 }} />
          {it.label}
        </button>
      ))}
    </div>
  );
}

// ─── Intake progress helper ───────────────────────────────────────────────────
//
// Surfaces one of seven UI states for an intake form card based on
// the form's status, the freshest submission's pipeline status, and
// the submission's approved_at timestamp.
function deriveIntakeProgress(form, submission) {
  const STYLES = {
    success:    { color: '#16a34a', bg: 'rgba(22,163,74,0.06)',  border: 'rgba(22,163,74,0.15)',  pulse: false, tone: 'success' },
    accent:     { color: '#7C3AED', bg: 'rgba(124,58,237,0.06)', border: 'rgba(124,58,237,0.18)', pulse: true,  tone: 'accent'  },
    awaiting:   { color: '#d97706', bg: 'rgba(217,119,6,0.06)',  border: 'rgba(217,119,6,0.15)',  pulse: true,  tone: 'awaiting' },
    neutral:    { color: '#6b7280', bg: 'rgba(107,114,128,0.06)',border: 'rgba(107,114,128,0.15)',pulse: false, tone: 'neutral' },
    danger:     { color: '#dc2626', bg: 'rgba(220,38,38,0.06)',  border: 'rgba(220,38,38,0.18)',  pulse: false, tone: 'danger'  },
  };
  if (form?.status === 'draft' && !form?.published_at) {
    return { ...STYLES.neutral, label: 'Draft' };
  }
  if (!submission) {
    return { ...STYLES.awaiting, label: 'Awaiting client' };
  }
  const s = String(submission.status || '').toLowerCase();
  if (s === 'failed') {
    return { ...STYLES.danger, label: 'Processing failed' };
  }
  if (submission.approved_at) {
    return { ...STYLES.success, label: 'Approved' };
  }
  if (s === 'complete' || s === 'completed' || submission.translated_result) {
    return { ...STYLES.success, label: 'Brief ready' };
  }
  if (['enriching', 'translating', 'extracting_design_system', 'building_kanban', 'notifying'].includes(s)) {
    return { ...STYLES.accent, label: 'Processing' };
  }
  if (s === 'pending') {
    return { ...STYLES.accent, label: 'Pending' };
  }
  return { ...STYLES.awaiting, label: 'Awaiting client' };
}

// ─── StatusColumn ─────────────────────────────────────────────────────────────

function StatusColumn({ title, color, icon: Icon, forms, onView, onCopyLink, onOpenPublic, onDelete }) {
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
          onOpenPublic={onOpenPublic}
          onDelete={onDelete}
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
    setActiveIntakeSubmissionId,
  } = useContext(AppContext);

  const windowWidth = useWindowWidth()
  const isMobile = windowWidth <= 480
  const isTablet = windowWidth > 480 && windowWidth <= 768

  const [query, setQuery]       = useState('');
  const [activeTab, setActiveTab] = useState('projects');

  const pendingCount = intakeForms.filter(f => f.status !== 'complete').length;

  // macOS-dock proximity for project cards — scale + tilt only. The
  // box-shadow glow + cursor spotlight were polarising, so cards just
  // magnetise quietly on hover now.
  useProximity('.project-card', {
    distance: 140,
    maxScale: 1.04,
    maxLift: -8,
    speed: 0.3,
    glow: false,
    tilt: true,
  }, [history?.length, activeTab])

  // ── Handlers ────────────────────────────────────────────────────────────────

  function handleViewForm(form) {
    // Pick the freshest submission, same logic as the card.
    const subs = (form.intake_submissions || []).slice()
      .sort((a, b) => new Date(b.submitted_at || b.created_at) - new Date(a.submitted_at || a.created_at));
    const submission = subs[0];

    // V2 path: a translated_result + a submission id route straight
    // to the Phase 5 review screen.
    if (submission?.translated_result && submission.id) {
      setActiveIntakeSubmissionId?.(submission.id);
      navigate('intake-review');
      return;
    }

    // Legacy V1 fallback: render the old document view if a V1
    // result is sitting on the row.
    if (submission?.result) {
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
      return;
    }

    // Nothing to view yet — the form is still awaiting the client
    // or mid-processing. Toast and stay put.
    showToast?.('Brief is not ready yet.', 'success');
  }

  function handleCopyLink(form) {
    const url = (import.meta.env.VITE_APP_URL ||
      window.location.origin) + '/intake/' + form.id;
    navigator.clipboard.writeText(url);
    showToast('Link copied to clipboard');
  }

  function handleOpenPublic(form) {
    const url = (import.meta.env.VITE_APP_URL ||
      window.location.origin) + '/intake/' + form.id;
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  async function handleDeleteForm(form) {
    const label = form.settings?.recipient?.business_name || form.project_name || 'this form';
    const ok = window.confirm(`Delete the intake form for "${label}"? Submissions stay in the database; only the form template is removed.`);
    if (!ok) return;
    try {
      const { error } = await supabase
        .from('intake_forms')
        .delete()
        .eq('id', form.id);
      if (error) throw error;
      showToast('Form deleted.');
      loadIntakeForms?.();
    } catch (e) {
      console.error('[library] delete failed', e);
      showToast(e?.message || 'Could not delete the form.', 'error');
    }
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
        // Fluid page padding scales smoothly from mobile to desktop
        // instead of stepping at hard breakpoints (which left
        // awkward in-between widths cramped).
        padding: 'clamp(20px, 4vw, 40px) clamp(16px, 4vw, 48px)',
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
              // Fluid heading — scales smoothly from 22px (mobile)
              // through tablet to 30px (large desktop) instead of
              // a hard step at one breakpoint.
              fontSize: 'clamp(22px, 3vw, 30px)',
              color: 'var(--color-text)', letterSpacing: '-0.02em', margin: '0 0 4px',
              lineHeight: 1.15,
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
              <SearchEmpty query={query} />
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
                // Fully fluid grid — `auto-fill` packs in as many
                // 260px-minimum columns as the container can hold
                // and stretches each to its equal share. No hard
                // breakpoints, no awkward gaps at intermediate
                // viewport widths.
                //
                // Approximate behaviour at common widths (with this
                // page's padding):
                //   ≤500px  → 1 column
                //   501-820 → 2 columns
                //   821-1100 → 3 columns
                //   ≥1100   → 4 columns (5 on very wide screens)
                gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
                gap: '16px',
                // alignItems: stretch is the grid default; combined
                // with height:100% on each card it produces equal-
                // height rows.
                alignItems: 'stretch',
              }
              return (
                <>
                  <StaggerGrid speed="normal" style={gridStyle}>
                    {visible.map(item => (
                      <StaggerItem key={item.id} variant="itemUp" style={{ height: '100%' }}>
                        <ProjectCard
                          item={item}
                          onClick={() => openProject(item)}
                        />
                      </StaggerItem>
                    ))}
                  </StaggerGrid>

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
        {activeTab === 'intakes' && (() => {
          // Bucket each form by the same progress-tone the card uses
          // so columns reflect actual pipeline state, not just the
          // form's raw status. Without this, "active" (published +
          // awaiting client) didn't match any column and forms went
          // missing from the UI entirely.
          const buckets = { awaiting: [], processing: [], ready: [] };
          for (const f of intakeForms) {
            const subs = (f.intake_submissions || []).slice()
              .sort((a, b) => new Date(b.submitted_at || b.created_at) - new Date(a.submitted_at || a.created_at));
            const prog = deriveIntakeProgress(f, subs[0]);
            if (prog.tone === 'success')      buckets.ready.push(f);
            else if (prog.tone === 'accent')  buckets.processing.push(f);
            else                              buckets.awaiting.push(f); // covers neutral (draft), awaiting, danger
          }
          return (
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
                  forms={buckets.awaiting}
                  onView={handleViewForm}
                  onCopyLink={handleCopyLink}
                  onOpenPublic={handleOpenPublic}
                  onDelete={handleDeleteForm}
                />
                <StatusColumn
                  title="In Progress"
                  color="var(--color-blue)"
                  icon={BoltIcon}
                  forms={buckets.processing}
                  onView={handleViewForm}
                  onCopyLink={handleCopyLink}
                  onOpenPublic={handleOpenPublic}
                  onDelete={handleDeleteForm}
                />
                <StatusColumn
                  title="Ready to Review"
                  color="#16a34a"
                  icon={SparklesIcon}
                  forms={buckets.ready}
                  onView={handleViewForm}
                  onCopyLink={handleCopyLink}
                  onOpenPublic={handleOpenPublic}
                  onDelete={handleDeleteForm}
                />
              </div>
            </div>
          );
        })()}

      </div>
    </div>
  );
}
