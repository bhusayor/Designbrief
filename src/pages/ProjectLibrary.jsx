import { useState, useContext } from 'react';
import AppContext from '../context/AppContext';
import { Button, Badge } from '../components/ui';
import { ROLE_META } from '../lib/constants';

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

function ProjectCard({ item, onClick }) {
  const project  = normalise(item);
  const verdict  = project.scoring?.verdict;
  const toneWords = project.result?.toneWords?.slice(0, 3) ?? [];
  const members  = project.teamMembers?.slice(0, 4) ?? [];

  function handleEnter(e) {
    e.currentTarget.style.borderColor = 'var(--color-border-hover)';
    e.currentTarget.style.transform = 'translateY(-2px)';
  }
  function handleLeave(e) {
    e.currentTarget.style.borderColor = 'var(--color-border)';
    e.currentTarget.style.transform = 'translateY(0)';
  }

  return (
    <div
      onClick={onClick}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
      style={{
        background: 'var(--color-card)',
        border: '1px solid var(--color-border)',
        borderRadius: '14px',
        padding: '18px 20px',
        cursor: 'pointer',
        transition: 'border-color 0.2s, transform 0.2s',
        display: 'flex', flexDirection: 'column', gap: '10px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
        <span style={{
          fontFamily: "'Urbanist', sans-serif", fontWeight: 700, fontSize: '14px',
          color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {project.title}
        </span>
        {verdict && (
          <Badge color={verdictColor(verdict)} size="sm">{verdict}</Badge>
        )}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
        {toneWords.length > 0
          ? toneWords.map(w => (
              <span key={w} style={{
                background: 'var(--color-surface)', borderRadius: '5px', padding: '2px 9px',
                fontSize: '11px', fontFamily: "'DM Mono', monospace", color: 'var(--color-text-soft)',
              }}>
                {w}
              </span>
            ))
          : (
            <span style={{
              background: 'var(--color-surface)', borderRadius: '5px', padding: '2px 9px',
              fontSize: '11px', fontFamily: "'DM Mono', monospace", color: 'var(--color-text-muted)',
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
        <span style={{ fontFamily: "'DM Mono', monospace", fontSize: '10px', color: 'var(--color-text-muted)' }}>
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
        fontFamily: "'DM Mono', monospace", fontSize: '13px',
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

// ─── ProjectLibrary ────────────────────────────────────────────────────────────

export default function ProjectLibrary() {
  const { history, openProject, navigate } = useContext(AppContext);
  const [query, setQuery] = useState('');

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

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: 'var(--color-bg)' }}>
      <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '0 40px 60px' }}>

        {/* Header */}
        <div style={{ padding: '32px 0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h1 style={{
              fontFamily: "'Urbanist', sans-serif", fontWeight: 800, fontSize: '26px',
              color: 'var(--color-text)', letterSpacing: '-0.02em', margin: '0 0 4px',
            }}>
              Project Library
            </h1>
            <div style={{
              fontFamily: "'DM Mono', monospace", fontSize: '12px',
              color: 'var(--color-text-muted)',
            }}>
              {history.length} project{history.length !== 1 ? 's' : ''}
            </div>
          </div>

          {/* Search */}
          {history.length > 0 && (
            <div style={{ position: 'relative', width: '240px' }}>
              <span style={{
                position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)',
                color: 'var(--color-text-muted)', fontSize: '13px', pointerEvents: 'none',
              }}>
                ⌕
              </span>
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search projects..."
                style={{
                  width: '100%', paddingLeft: '32px', paddingRight: '12px',
                  height: '36px', background: 'var(--color-surface)',
                  border: '1px solid var(--color-border)', borderRadius: '9px',
                  color: 'var(--color-text)', fontFamily: "'DM Mono', monospace",
                  fontSize: '12px', outline: 'none',
                  boxSizing: 'border-box',
                }}
                onFocus={e => (e.currentTarget.style.borderColor = 'var(--color-accent)')}
                onBlur={e => (e.currentTarget.style.borderColor = 'var(--color-border)')}
              />
            </div>
          )}
        </div>

        {/* Empty state */}
        {history.length === 0 && <EmptyState navigate={navigate} />}

        {/* No results */}
        {history.length > 0 && filtered.length === 0 && (
          <div style={{
            padding: '60px 0', textAlign: 'center',
            fontFamily: "'DM Mono', monospace", fontSize: '13px',
            color: 'var(--color-text-muted)',
          }}>
            No projects match "{query}"
          </div>
        )}

        {/* Grid */}
        {filtered.length > 0 && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: '12px',
          }}>
            {filtered.map(item => (
              <ProjectCard
                key={item.id}
                item={item}
                onClick={() => openProject(item)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
