import { useState, useContext, useEffect, useRef, Component } from 'react';
import { createPortal } from 'react-dom';
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
import SubmissionAnswersModal from '../components/intake/SubmissionAnswersModal';
import ConfirmDeleteModal from '../components/ConfirmDeleteModal';
import RenewExpiryModal from '../components/intake/RenewExpiryModal';
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
  ArrowPathIcon,
  NoSymbolIcon,
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

function IntakeFormCard({ form, onView, onCopyLink, onOpenPublic, onDelete, onRenew, onViewSubmission, onShareBrief, onResendInvite, onReprocess, hideMenu = false }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState(null);
  const triggerRef = useRef(null);

  // Position is computed synchronously in toggleMenu() (below) so
  // the popover has coords on its FIRST render — useEffect would
  // have introduced an empty frame where menuOpen=true but
  // menuPosition was still null, which on some browsers + render
  // schedules made the menu invisible after the click.
  useEffect(() => {
    if (!menuOpen) return;
    const onClickAway = (e) => {
      if (!e.target.closest?.('[data-card-menu]')) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onClickAway);
    return () => document.removeEventListener('mousedown', onClickAway);
  }, [menuOpen]);

  function toggleMenu() {
    if (menuOpen) {
      setMenuPosition(null);
      setMenuOpen(false);
      return;
    }
    const rect = triggerRef.current?.getBoundingClientRect();
    // Default to top-left of viewport if we somehow don't have a
    // rect — the menu still renders + the designer at least sees
    // it open. Without this fallback a null rect would keep the
    // portal from rendering at all.
    if (rect) {
      setMenuPosition({
        top: rect.bottom + 4,
        left: Math.max(8, rect.right - 180),
      });
    } else {
      setMenuPosition({ top: 80, left: 16 });
    }
    setMenuOpen(true);
  }
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
      {/* Project name + type. Title clamps to 2 lines max + breaks
          on word boundary so long business names wrap cleanly
          instead of being cut mid-word. */}
      <div style={{ marginBottom: 10 }}>
        <div style={{
          fontFamily: "'Urbanist', sans-serif",
          fontWeight: 700, fontSize: 14,
          color: 'var(--color-text)',
          marginBottom: 4,
          lineHeight: 1.35,
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
          wordBreak: 'break-word',
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
      <div style={{ display: 'flex', gap: 6, minWidth: 0 }}>
        {isReady ? (
          <button onClick={() => onView(form)} style={primaryBtn} title="Review the translated brief">
            <SparklesIcon style={btnIcon} />
            <span style={btnLabel}>Review brief</span>
            <ChevronRightIcon style={btnChevron} />
          </button>
        ) : progress.tone === 'expired' ? (
          <button onClick={() => onRenew?.(form)} style={primaryBtn} title="Extend the form's expiry and reactivate the share link">
            <ArrowPathIcon style={btnIcon} />
            <span style={btnLabel}>Renew expiry</span>
            <ChevronRightIcon style={btnChevron} />
          </button>
        ) : progress.tone === 'accent' ? (
          <button onClick={() => onViewSubmission?.(form)} style={primaryBtn} title="View what the client submitted">
            <InboxArrowDownIcon style={btnIcon} />
            <span style={btnLabel}>View submission</span>
            <ChevronRightIcon style={btnChevron} />
          </button>
        ) : form.status === 'draft' ? (
          <button onClick={() => onCopyLink(form)} style={secondaryBtn} title="Copy share link">
            <PencilSquareIcon style={btnIcon} />
            <span style={btnLabel}>Open draft</span>
          </button>
        ) : (
          <button onClick={() => onCopyLink(form)} style={secondaryBtn} title="Copy share link">
            <LinkIcon style={btnIcon} />
            <span style={btnLabel}>Copy link</span>
          </button>
        )}

        {/* Menu trigger — the more button. Hidden entirely when
            `hideMenu` is set (Expired column doesn't surface a
            menu because the Renew primary CTA is the only useful
            action and a styled modal owns the rest). */}
        {!hideMenu && (
          <div style={{ position: 'relative' }} data-card-menu>
            <button
              ref={triggerRef}
              onClick={toggleMenu}
              style={iconBtn}
              title="More actions"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-label="More actions"
            >
              <EllipsisHorizontalIcon style={{ width: 14, height: 14, pointerEvents: 'none' }} />
            </button>
          </div>
        )}

        {/* Menu rendered via createPortal to document.body so the
            popover escapes the swipe board's overflow-x: auto
            clipping. Skipped when hideMenu is true. */}
        {!hideMenu && menuOpen && menuPosition && createPortal(
          <MenuErrorBoundary onClose={() => setMenuOpen(false)}>
            <div data-card-menu style={{
              position: 'fixed',
              top: menuPosition.top,
              left: menuPosition.left,
              zIndex: 1000,
            }}>
              <CardMenu
                form={form}
                submission={submission}
                progress={progress}
                onCopyLink={() => { setMenuOpen(false); onCopyLink?.(form); }}
                onOpenPublic={() => { setMenuOpen(false); onOpenPublic?.(form); }}
                onView={() => { setMenuOpen(false); onView?.(form); }}
                onDelete={() => { setMenuOpen(false); onDelete?.(form); }}
                onRenew={() => { setMenuOpen(false); onRenew?.(form); }}
                onViewSubmission={() => { setMenuOpen(false); onViewSubmission?.(form); }}
                onShareBrief={() => { setMenuOpen(false); onShareBrief?.(form); }}
                onResendInvite={() => { setMenuOpen(false); onResendInvite?.(form); }}
                onReprocess={() => { setMenuOpen(false); onReprocess?.(form); }}
                isReady={isReady}
                hasSubmission={Array.isArray(form.intake_submissions) && form.intake_submissions.length > 0}
              />
            </div>
          </MenuErrorBoundary>,
          document.body,
        )}
      </div>
    </div>
  );
}

// ─── MenuErrorBoundary ──────────────────────────────────────────
// Wraps the CardMenu render so a runtime error inside any menu
// item (undefined icon, broken handler, missing prop) logs to
// the console + auto-closes the menu instead of blanking the
// entire library page. React 18+'s default error boundary
// behaviour is to unmount the tree, which is exactly the
// "blank page" symptom designers were hitting.
class MenuErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null } }
  static getDerivedStateFromError(error) { return { error } }
  componentDidCatch(error, info) {
    console.error('[CardMenu] runtime error:', error, info?.componentStack)
    // Close the menu so we don't keep rendering the broken state.
    setTimeout(() => this.props.onClose?.(), 0)
  }
  render() {
    if (this.state.error) return null
    return this.props.children
  }
}

// ─── Card button + menu styling shared by all states ─────────────
// Buttons reserve a min-width so labels like "View submission" and
// "Renew expiry" never get squeezed. white-space: nowrap stops the
// browser from breaking the label across lines. The column itself
// is wide enough to hold this comfortably; the card padding keeps
// the buttons inside their box.
const primaryBtn = {
  flex: 1,
  minWidth: 100,
  background: 'var(--color-text)',
  color: 'var(--color-bg)',
  border: 'none',
  borderRadius: 9,
  padding: '8px 12px',
  fontFamily: "'Urbanist', sans-serif",
  fontWeight: 700, fontSize: 12,
  cursor: 'pointer',
  display: 'flex', alignItems: 'center', gap: 6,
  whiteSpace: 'nowrap',
};
const secondaryBtn = {
  flex: 1,
  minWidth: 100,
  background: 'var(--color-surface)',
  color: 'var(--color-text)',
  border: '1px solid var(--color-border)',
  borderRadius: 9,
  padding: '8px 12px',
  fontFamily: "'Urbanist', sans-serif",
  fontWeight: 600, fontSize: 12,
  cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
  whiteSpace: 'nowrap',
};
// Label wrapper — kept as a plain span. Buttons never truncate
// their labels now; the column is sized to fit the longest label.
const btnLabel = {
  whiteSpace: 'nowrap',
};
const btnIcon = {
  width: 13, height: 13,
  flexShrink: 0,
};
const btnChevron = {
  width: 12, height: 12,
  marginLeft: 'auto',
  flexShrink: 0,
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
function CardMenu({ form, submission, progress, onCopyLink, onOpenPublic, onView, onDelete, onRenew, onViewSubmission, onShareBrief, onResendInvite, onReprocess, isReady, hasSubmission }) {
  // Resolve the client email from any source the data might be in.
  // Page 0 writes to settings.recipient.client_email; the publish
  // path mirrors to the legacy column; older forms might have only
  // the legacy column. Pick whichever has a real address.
  const clientEmail =
    form?.settings?.recipient?.client_email
    || form?.client_email
    || null;

  // ── In Progress: a deliberately tight menu ─────────────────────
  // While the pipeline is running the designer is just waiting. The
  // only actions that earn their slot:
  //   Email client — opens a preloaded "got your form, working on
  //                  the brief now" mailto so the designer can fire
  //                  a quick reassurance in one click.
  //   Delete form  — cancel + remove if the submission was sent in
  //                  error or no longer wanted.
  // Open public form + Extend expiry are deliberately omitted — the
  // form's been filled, the link is already alive; previewing or
  // extending isn't useful in this state.
  if (progress?.tone === 'accent') {
    const items = [];
    if (clientEmail) {
      items.push({
        icon: EnvelopeIcon,
        label: 'Email client',
        onClick: () => { window.location.href = buildInProgressMailto(clientEmail, form, submission); },
      });
    }
    // Re-run translation. The most common reason a card sits in
    // In Progress for longer than expected is that the pipeline
    // never fired (env var missing, Render down, the original
    // fire-and-forget POST didn't reach the server). This kicks
    // it explicitly.
    items.push({ icon: ArrowPathIcon, label: 'Re-run translation', onClick: onReprocess });
    items.push({ icon: TrashIcon, label: 'Delete form', onClick: onDelete, danger: true });
    return renderMenu(items);
  }

  const items = [];
  if (isReady) {
    items.push({ icon: SparklesIcon, label: 'Review brief', onClick: onView });
    if (clientEmail) {
      items.push({ icon: EnvelopeIcon, label: 'Share brief with client', onClick: onShareBrief });
    }
  }
  // View raw client answers. Still shown on Ready to Review
  // (primary is Review brief) and Expired (primary is Renew expiry).
  if (hasSubmission) {
    const lbl = progress?.tone === 'expired' ? 'View past submissions' : 'View submission';
    items.push({ icon: InboxArrowDownIcon, label: lbl, onClick: onViewSubmission });
  }
  // Resend the original invite when the form is waiting for a
  // client. Only useful when the email is on file.
  if (!hasSubmission && clientEmail) {
    items.push({ icon: EnvelopeIcon, label: 'Resend invite', onClick: onResendInvite });
  }
  if (progress?.tone === 'expired') {
    items.push({ icon: ArrowPathIcon, label: 'Renew expiry', onClick: onRenew });
  }
  // Rescue path: an Expired or Ready card may carry a submission
  // that never finished translating. Surface Re-run translation
  // whenever we have a submission without a translated_result so
  // the designer can fire the pipeline manually.
  if (submission && !submission.translated_result && progress?.tone !== 'accent') {
    items.push({ icon: ArrowPathIcon, label: 'Re-run translation', onClick: onReprocess });
  }
  // Public-form preview. Useful in Awaiting + Ready states (sanity
  // check / verify after edits). Omitted for In Progress above.
  items.push({ icon: ArrowTopRightOnSquareIcon, label: 'Open public form', onClick: onOpenPublic });
  if (clientEmail) {
    items.push({
      icon: EnvelopeIcon,
      label: 'Email client',
      onClick: () => { window.location.href = buildMailtoForState(clientEmail, form, submission, progress); },
    });
  }
  if (progress?.tone !== 'expired' && form.expires_at) {
    items.push({ icon: ArrowPathIcon, label: 'Extend expiry', onClick: onRenew });
  }
  items.push({ icon: TrashIcon, label: 'Delete form', onClick: onDelete, danger: true });

  return renderMenu(items);
}

// State-aware mailto dispatcher. Pulls the right preloaded
// template based on the card's progress tone so the designer
// doesn't have to write the same gentle nudge / reassurance / etc.
// every time they want to follow up.
function buildMailtoForState(email, form, submission, progress) {
  const tone = progress?.tone;
  if (tone === 'accent')   return buildInProgressMailto(email, form, submission);
  if (tone === 'awaiting') return buildAwaitingMailto(email, form, submission);
  if (tone === 'expired')  return buildExpiredMailto(email, form, submission);
  // Ready to Review + Draft + Failed → plain mailto. Ready cards
  // already have "Share brief with client" for the formal
  // announcement; if the designer hits Email client they probably
  // want a blank slate.
  return `mailto:${email}`;
}

// Awaiting Client mailto. The form is published but the client
// hasn't filled it yet — pre-fill a gentle reminder with the
// share link inline so it lands ready to send.
function buildAwaitingMailto(email, form, submission) {
  const firstName = pickFirstName(form, submission);
  const business  = pickBusinessName(form, submission);
  const formUrl   = buildFormUrl(form);
  const subject = business
    ? `Quick reminder about the intake form for ${business}`
    : 'Quick reminder about your project intake';
  const body = [
    `Hi ${firstName},`,
    '',
    `Just checking in — did you get a chance to fill out the project intake form${business ? ` for ${business}` : ''}?`,
    '',
    "It takes a few minutes and helps me put together a brief that actually reflects what you're trying to build.",
    '',
    `Here's the link in case you need it: ${formUrl}`,
    '',
    'Let me know if you have any questions.',
  ].join('\n');
  return buildMailto(email, subject, body);
}

// Expired link mailto. Apologetic + offers a fresh link the
// designer would still need to renew first, but the message
// sets the expectation cleanly.
function buildExpiredMailto(email, form, submission) {
  const firstName = pickFirstName(form, submission);
  const business  = pickBusinessName(form, submission);
  const subject = business
    ? `Refreshing the intake form for ${business}`
    : 'Refreshing your project intake link';
  const body = [
    `Hi ${firstName},`,
    '',
    'Quick heads up — the original intake link has expired.',
    '',
    `I'll send a fresh link${business ? ` for ${business}` : ''} in a follow-up. Should only take a moment.`,
    '',
    'Thanks for your patience.',
  ].join('\n');
  return buildMailto(email, subject, body);
}

// Universal mailto for In Progress cards. Pre-fills a warm
// reassurance message addressed by first name + business so the
// designer can fire-and-forget while waiting on the pipeline.
function buildInProgressMailto(email, form, submission) {
  const firstName = pickFirstName(form, submission);
  const business  = pickBusinessName(form, submission);
  const subject = business
    ? `Got your intake for ${business}`
    : 'Got your project intake';
  const body = [
    `Hi ${firstName},`,
    '',
    `Just a quick note to let you know I've received your intake${business ? ` for ${business}` : ''} and I'm putting your brief together now.`,
    '',
    "You'll hear back from me shortly with the full direction.",
    '',
    'Thanks for the great inputs.',
  ].join('\n');
  return buildMailto(email, subject, body);
}

// ── Shared mailto helpers ───────────────────────────────────────
function pickFirstName(form, submission) {
  return (
    submission?.client_name
    || form?.settings?.recipient?.client_name
    || ''
  ).trim().split(/\s+/)[0] || 'there';
}
function pickBusinessName(form, submission) {
  return (
    submission?.business_name
    || form?.settings?.recipient?.business_name
    || ''
  ).trim();
}
function buildFormUrl(form) {
  const origin = (import.meta.env.VITE_APP_URL || window.location.origin).replace(/\/$/, '');
  return `${origin}/intake/${form?.id || ''}`;
}
function buildMailto(email, subject, body) {
  // Use encodeURIComponent, NOT URLSearchParams. URLSearchParams is
  // form-urlencoded (spaces → "+"), which mail clients render
  // literally instead of as spaces. Mailto wants percent-encoding
  // (spaces → "%20"), and encodeURIComponent also handles newlines
  // (\n → %0A) and punctuation cleanly.
  const s = encodeURIComponent(subject);
  const b = encodeURIComponent(body);
  return `mailto:${email}?subject=${s}&body=${b}`;
}

// Shared menu render. Pulled out so the early-return for the In
// Progress state stays terse without duplicating the dropdown
// markup.
function renderMenu(items) {
  // Defensively skip any item whose icon is falsy (undefined /
  // null) — JSX would otherwise blow up with "type is invalid" on
  // an empty component reference. We DON'T type-check icon against
  // 'function' because Heroicons are forwardRef components (typeof
  // === 'object'); the previous version of this filter accidentally
  // stripped every single item out of every dropdown.
  const safeItems = (items || []).filter(it => it && it.icon != null);

  return (
    <div
      role="menu"
      style={{
        // Positioned by the portal wrapper (fixed coords). This
        // element just renders the styled popover inside that
        // wrapper — no own positioning.
        minWidth: 180,
        background: 'var(--color-card)',
        border: '1px solid var(--color-border)',
        borderRadius: 10,
        boxShadow: '0 12px 24px rgba(0,0,0,0.12)',
        padding: 4,
      }}
    >
      {safeItems.map((it, i) => (
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
    expired:    { color: '#b91c1c', bg: 'rgba(185,28,28,0.06)',  border: 'rgba(185,28,28,0.20)',  pulse: false, tone: 'expired' },
  };

  // Computed-expired check. Honoured ONLY when the brief isn't
  // already done (translated/approved). A ready brief is the
  // useful artefact — link expiry doesn't take that away from the
  // designer; we leave it in Ready to Review and let the
  // submission state win.
  const linkExpired = form?.status === 'expired'
    || (form?.expires_at && new Date(form.expires_at).getTime() < Date.now());

  // Brief-level done states take precedence over link expiry.
  if (submission?.approved_at) {
    return { ...STYLES.success, label: 'Approved' };
  }
  const subStatus = String(submission?.status || '').toLowerCase();
  if (submission && (subStatus === 'complete' || subStatus === 'completed' || submission.translated_result)) {
    return { ...STYLES.success, label: 'Brief ready' };
  }

  if (linkExpired) {
    return { ...STYLES.expired, label: 'Link expired' };
  }
  if (form?.status === 'draft' && !form?.published_at) {
    return { ...STYLES.neutral, label: 'Draft' };
  }
  if (!submission) {
    return { ...STYLES.awaiting, label: 'Awaiting client' };
  }
  if (subStatus === 'failed') {
    return { ...STYLES.danger, label: 'Processing failed' };
  }
  if (['enriching', 'translating', 'extracting_design_system', 'building_kanban', 'notifying'].includes(subStatus)) {
    return { ...STYLES.accent, label: 'Processing' };
  }
  if (subStatus === 'pending') {
    return { ...STYLES.accent, label: 'Pending' };
  }
  return { ...STYLES.awaiting, label: 'Awaiting client' };
}

// ─── StatusColumn ─────────────────────────────────────────────────────────────

function StatusColumn({ title, color, icon: Icon, forms, onView, onCopyLink, onOpenPublic, onDelete, onRenew, onViewSubmission, onShareBrief, onResendInvite, onReprocess, hideMenu = false }) {
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
          onRenew={onRenew}
          onViewSubmission={onViewSubmission}
          onShareBrief={onShareBrief}
          onResendInvite={onResendInvite}
          onReprocess={onReprocess}
          hideMenu={hideMenu}
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
  // Open modal showing raw submission answers. State holds
  // { form, submissions[] } so we can paginate through multiple.
  const [answersModal, setAnswersModal] = useState(null);
  // Delete-form confirmation modal state. Holds the form being
  // deleted + a busy flag while the supabase delete is in flight.
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  // Renew-expiry modal target. State holds the form being renewed
  // + a busy flag that disables the modal's inputs while the
  // supabase update is in flight.
  const [renewTarget, setRenewTarget] = useState(null);
  const [renewing, setRenewing] = useState(false);

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

  // Card-level handler — opens the styled RenewExpiryModal.
  // The actual supabase update runs in confirmRenewExpiry(days)
  // after the user picks a duration and hits Renew.
  function handleRenewExpiry(form) {
    setRenewTarget(form);
  }

  async function confirmRenewExpiry(days) {
    const form = renewTarget;
    if (!form || renewing) return;
    if (!Number.isFinite(days) || days < 1 || days > 365) {
      showToast('Enter a number between 1 and 365.', 'error');
      return;
    }
    setRenewing(true);
    const newExpiry = new Date(Date.now() + days * 86400000).toISOString();
    try {
      const { error } = await supabase
        .from('intake_forms')
        .update({ expires_at: newExpiry, status: 'active' })
        .eq('id', form.id);
      if (error) throw error;
      showToast(`Form extended by ${days} day${days === 1 ? '' : 's'}.`);
      loadIntakeForms?.();
      setRenewTarget(null);
    } catch (e) {
      console.error('[library] renew failed', e);
      showToast(e?.message || 'Could not renew the form.', 'error');
    } finally {
      setRenewing(false);
    }
  }

  function handleViewSubmission(form) {
    const subs = (form.intake_submissions || []).slice()
      .sort((a, b) => new Date(b.submitted_at || b.created_at) - new Date(a.submitted_at || a.created_at));
    if (!subs.length) {
      showToast('No submissions on this form yet.');
      return;
    }
    setAnswersModal({ form, submissions: subs });
  }

  async function handleShareBriefWithClient(form) {
    const subs = (form.intake_submissions || []).slice()
      .sort((a, b) => new Date(b.submitted_at || b.created_at) - new Date(a.submitted_at || a.created_at));
    const submission = subs[0];
    if (!submission?.translated_result) {
      showToast('Brief is not ready yet.', 'error');
      return;
    }
    const email = submission.client_email || form.settings?.recipient?.client_email || form.client_email;
    if (!email) {
      showToast('No client email on file to send to.', 'error');
      return;
    }
    const ok = window.confirm(`Email ${email} that the brief is ready?`);
    if (!ok) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/send-intake-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + (session?.access_token || ''),
        },
        body: JSON.stringify({
          form_id: form.id,
          submission_id: submission.id,
          mode: 'brief-ready',
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.message || j.error || `HTTP ${res.status}`);
      showToast(`Sent to ${email}.`);
    } catch (e) {
      console.error('[library] share brief failed', e);
      showToast(e?.message || 'Could not send.', 'error');
    }
  }

  async function handleResendInvite(form) {
    const email = form.settings?.recipient?.client_email || form.client_email;
    if (!email) {
      showToast('No client email on file. Use Copy link instead.', 'error');
      return;
    }
    const business = form.settings?.recipient?.business_name || form.project_name || 'your project';
    const ok = window.confirm(`Resend the invite to ${email}?`);
    if (!ok) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/send-intake-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + (session?.access_token || ''),
        },
        body: JSON.stringify({
          form_id: form.id,
          recipients: [email],
          subject: `Your project intake for ${business}`,
          body: form.branding?.welcome_message
            || `Hi, I've put together a short intake form to capture the shape of ${business}. Click the button below to fill it out — takes a few minutes.`,
          mode: 'invite',
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.message || j.error || `HTTP ${res.status}`);
      showToast(`Resent to ${email}.`);
    } catch (e) {
      console.error('[library] resend invite failed', e);
      showToast(e?.message || 'Could not resend.', 'error');
    }
  }

  async function handleReprocessPipeline(form) {
    // Picks the freshest submission and fires the Render pipeline
    // endpoint with its id. Useful when a submission landed before
    // the pipeline was working (status: pending forever) or when
    // a previous run failed mid-step.
    const subs = (form.intake_submissions || []).slice()
      .sort((a, b) => new Date(b.submitted_at || b.created_at) - new Date(a.submitted_at || a.created_at));
    const submission = subs[0];
    if (!submission) {
      showToast('No submission on this form yet.', 'error');
      return;
    }
    const apiUrl = (import.meta.env.VITE_API_URL || '') + '/api/process-intake';
    if (!import.meta.env.VITE_API_URL) {
      showToast('Set VITE_API_URL on Vercel to your Render URL first.', 'error');
      return;
    }
    try {
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ submission_id: submission.id }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.message || j.error || `HTTP ${res.status}`);
      showToast('Translation kicked off. Refresh in a minute to see the result.', 'success');
      // Give the pipeline a head start, then refresh the library so
      // the card moves into the In Progress column.
      setTimeout(() => loadIntakeForms?.(), 3000);
    } catch (e) {
      console.error('[library] reprocess failed', e);
      showToast(e?.message || 'Could not trigger translation.', 'error');
    }
  }

  // Card-level handler — opens the styled ConfirmDeleteModal.
  // The actual delete runs in confirmDeleteForm() when the user
  // hits the destructive button.
  function handleDeleteForm(form) {
    setDeleteTarget(form);
  }

  async function confirmDeleteForm() {
    const form = deleteTarget;
    if (!form || deleting) return;
    setDeleting(true);
    try {
      const { error } = await supabase
        .from('intake_forms')
        .delete()
        .eq('id', form.id);
      if (error) throw error;
      showToast('Form deleted.');
      loadIntakeForms?.();
      setDeleteTarget(null);
    } catch (e) {
      console.error('[library] delete failed', e);
      showToast(e?.message || 'Could not delete the form.', 'error');
    } finally {
      setDeleting(false);
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
    <div style={{
      height: '100%',
      overflowY: 'auto',
      // Clip horizontal overflow at the page level so the swipe
      // board's own overflowX scroller is the only horizontal
      // scrollbar in town. Without this, the AppShell sidebar
      // sliding in/out on tablet was nudging the page width and
      // triggering body-level horizontal scroll.
      overflowX: 'hidden',
      background: 'var(--color-bg)',
    }}>
      <div style={{
        width: '100%', boxSizing: 'border-box',
        // Fluid page padding. Tighter on small viewports so the
        // swipe board has more room before the next column has to
        // peek into uncomfortable territory.
        padding: 'clamp(16px, 3vw, 40px) clamp(12px, 3vw, 48px)',
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

        {/* Tab bar — overflow-x: auto + nowrap so the tabs scroll
            horizontally instead of wrapping when the viewport (or
            tab list) is narrow. scrollbarWidth: thin keeps the
            scrollbar subtle. */}
        <div style={{
          display: 'flex', gap: 4,
          borderBottom: '1px solid var(--color-border)',
          marginBottom: 24, paddingBottom: 0,
          overflowX: 'auto',
          whiteSpace: 'nowrap',
          scrollbarWidth: 'thin',
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
                  flexShrink: 0,
                  whiteSpace: 'nowrap',
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
          // form's raw status.
          const buckets = { awaiting: [], processing: [], ready: [], expired: [] };
          for (const f of intakeForms) {
            const subs = (f.intake_submissions || []).slice()
              .sort((a, b) => new Date(b.submitted_at || b.created_at) - new Date(a.submitted_at || a.created_at));
            const prog = deriveIntakeProgress(f, subs[0]);
            if (prog.tone === 'success')      buckets.ready.push(f);
            else if (prog.tone === 'accent')  buckets.processing.push(f);
            else if (prog.tone === 'expired') buckets.expired.push(f);
            else                              buckets.awaiting.push(f); // covers neutral (draft), awaiting, danger
          }
          // Two layout modes for the intake board:
          //   Desktop (≥1024px): 4-column CSS grid (every column
          //     visible at once, no scroll).
          //   Tablet + mobile (<1024px): horizontal swipe — flex
          //     row with overflow-x: auto + per-column scroll-snap
          //     so each column locks into view as the user swipes.
          //     Columns get a fixed width so they don't collapse;
          //     the next column "peeks" past the right edge so the
          //     user knows to scroll.
          const useHorizontalScroll = isMobile || isTablet;
          // Generous column widths so each card has plenty of room
          // for its content; the swipe board's own overflow-x
          // handles bringing every column into view via horizontal
          // scroll. The whole board's total width = sum of column
          // widths + gaps and freely exceeds the viewport — only
          // the inner swipe scroller moves, so the page itself
          // never gets a horizontal scrollbar.
          //   Tablet — 540px: each card has ~508px of usable width
          //                   after padding. Comfortable for long
          //                   business names + every chip + the
          //                   full button label.
          //   Mobile — 340px: phone-sized; still gives the card
          //                   enough room to breathe.
          const columnWidth = isMobile ? 340 : 540;
          const sharedColumnProps = {
            onView: handleViewForm,
            onCopyLink: handleCopyLink,
            onOpenPublic: handleOpenPublic,
            onDelete: handleDeleteForm,
            onRenew: handleRenewExpiry,
            onViewSubmission: handleViewSubmission,
            onShareBrief: handleShareBriefWithClient,
            onResendInvite: handleResendInvite,
            onReprocess: handleReprocessPipeline,
          };
          const columnDefs = [
            { title: 'Awaiting Client',  color: '#d97706',           icon: ClockIcon,    forms: buckets.awaiting },
            { title: 'In Progress',      color: 'var(--color-blue)', icon: BoltIcon,     forms: buckets.processing },
            { title: 'Ready to Review',  color: '#16a34a',           icon: SparklesIcon, forms: buckets.ready },
            { title: 'Expired',          color: '#b91c1c',           icon: NoSymbolIcon, forms: buckets.expired, hideMenu: true },
          ];
          return (
            <div>
              {useHorizontalScroll && (
                <div style={{
                  fontFamily: "'Urbanist', sans-serif",
                  fontSize: 11,
                  color: 'var(--color-text-muted)',
                  marginBottom: 8,
                  display: 'flex', alignItems: 'center', gap: 6,
                }}>
                  Swipe to see other columns →
                </div>
              )}
              <div
                className="intake-board"
                style={useHorizontalScroll ? {
                  // Flex row that horizontally scrolls when its
                  // children (the columns) overflow. Total board
                  // width = sum of column widths + gaps, freely
                  // exceeds the viewport — the page padding gives
                  // the visible window. overflow-x: auto on this
                  // element makes the inner row scroll, NOT the
                  // page. (Outer page wrapper has overflow-x:
                  // hidden as the safety net.)
                  display: 'flex',
                  gap: 12,
                  overflowX: 'auto',
                  overflowY: 'visible',
                  scrollSnapType: 'x mandatory',
                  scrollPaddingLeft: 4,
                  paddingBottom: 12,
                  WebkitOverflowScrolling: 'touch',
                } : {
                  display: 'grid',
                  gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
                  gap: 16,
                }}
              >
                {columnDefs.map((c) => (
                  <div
                    key={c.title}
                    style={useHorizontalScroll ? {
                      flexShrink: 0,
                      minWidth: 280,
                      width: columnWidth,
                      scrollSnapAlign: 'start',
                    } : undefined}
                  >
                    <StatusColumn
                      title={c.title}
                      color={c.color}
                      icon={c.icon}
                      forms={c.forms}
                      hideMenu={c.hideMenu}
                      {...sharedColumnProps}
                    />
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

      </div>

      {/* Modal: raw submission answers (In Progress + Expired). */}
      {answersModal && (
        <SubmissionAnswersModal
          form={answersModal.form}
          submissions={answersModal.submissions}
          onClose={() => setAnswersModal(null)}
        />
      )}

      {/* Styled delete-form confirmation. Reuses the shared
          ConfirmDeleteModal so the destructive UX matches every
          other "Are you sure?" flow in the app. */}
      <ConfirmDeleteModal
        open={!!deleteTarget}
        title="Delete intake form?"
        description={(() => {
          const label = deleteTarget?.settings?.recipient?.business_name
            || deleteTarget?.project_name
            || 'this form';
          const subs = deleteTarget?.intake_submissions?.length || 0;
          return (
            <>
              You're about to delete the intake form for{' '}
              <strong>{label}</strong>. The shareable link will stop working immediately and the form template will be gone.
              {subs > 0 && (
                <>
                  {' '}<br /><br />
                  <strong>{subs}</strong> client submission{subs === 1 ? '' : 's'} attached to this form will also be removed.
                </>
              )}
              {' '}This can't be undone.
            </>
          );
        })()}
        confirmLabel="Delete form"
        busy={deleting}
        onCancel={() => { if (!deleting) setDeleteTarget(null); }}
        onConfirm={confirmDeleteForm}
      />

      {/* Renew expiry — styled modal with preset durations.
          Replaces the previous window.prompt() that fired from the
          Expired card's primary CTA. */}
      <RenewExpiryModal
        open={!!renewTarget}
        form={renewTarget}
        busy={renewing}
        onCancel={() => { if (!renewing) setRenewTarget(null); }}
        onRenew={confirmRenewExpiry}
      />
    </div>
  );
}
