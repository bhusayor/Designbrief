import React, { useState, useRef, useEffect } from 'react';
import {
  MapPinIcon,
  PencilSquareIcon,
  LinkIcon,
  TrashIcon,
  EllipsisHorizontalIcon,
} from '@heroicons/react/24/outline';

// Lightweight pill that shows where a sidebar project came from:
// • intake source → green "Client"
// • section='team' → purple "Team"
// • everything else → blue "Brief"
function OriginPill({ item }) {
  let label, bg, border, color
  if (item.source === 'intake') {
    label = 'Client'
    bg = 'rgba(22,163,74,0.1)'
    border = 'rgba(22,163,74,0.2)'
    color = '#16a34a'
  } else if (item.section === 'team') {
    label = 'Team'
    bg = 'rgba(124,58,237,0.10)'
    border = 'rgba(124,58,237,0.25)'
    color = '#7C3AED'
  } else {
    label = 'Brief'
    bg = 'rgba(14,165,233,0.10)'
    border = 'rgba(14,165,233,0.25)'
    color = '#0369A1'
  }
  return (
    <span style={{
      background: bg,
      border: '1px solid ' + border,
      borderRadius: 4,
      padding: '1px 5px',
      fontFamily: "'Urbanist', sans-serif",
      fontSize: 8, fontWeight: 700,
      color,
      marginLeft: 5,
      letterSpacing: '0.04em',
      textTransform: 'uppercase',
      flexShrink: 0,
    }}>
      {label}
    </span>
  )
}

function formatDate(ts) {
  const d = new Date(ts);
  const now = new Date();
  const diffDays = Math.floor((now - d) / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

const MENU_ITEMS = [
  { key: 'pin',    Icon: MapPinIcon,        label: 'Pin to top',     pinnedLabel: 'Unpin' },
  { key: 'rename', Icon: PencilSquareIcon,  label: 'Rename' },
  { key: 'share',  Icon: LinkIcon,          label: 'Copy share link' },
  { key: 'delete', Icon: TrashIcon,         label: 'Delete', danger: true },
];

export default function HistoryItem({
  item,
  active,
  onClick,
  onDelete,
  onPin,
  onRename,
  onShare,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameVal, setRenameVal] = useState(item.title);
  const [hovered, setHovered] = useState(false);
  const menuRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return;
    function handle(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [menuOpen]);

  useEffect(() => {
    if (renaming && inputRef.current) inputRef.current.select();
  }, [renaming]);

  function handleMenu(key) {
    setMenuOpen(false);
    if (key === 'delete') onDelete?.(item.id);
    else if (key === 'pin') onPin?.(item.id);
    else if (key === 'rename') { setRenameVal(item.title); setRenaming(true); }
    else if (key === 'share') onShare?.(item);
  }

  function commitRename() {
    const trimmed = renameVal.trim();
    if (trimmed && trimmed !== item.title) onRename?.(item.id, trimmed);
    setRenaming(false);
  }

  const icon = item.section === 'team' ? '◉' : '◈';

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: 'relative',
        borderRadius: '8px',
        background: active ? 'var(--color-accent-bg)' : 'transparent',
        border: `1px solid ${active ? 'var(--color-accent-border)' : 'transparent'}`,
        marginBottom: '2px',
        transition: 'background 0.12s, border-color 0.12s',
      }}
    >
      <div
        onClick={() => !renaming && onClick?.(item)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '7px 8px',
          cursor: renaming ? 'default' : 'pointer',
          borderRadius: '8px',
        }}
        onMouseEnter={e => { if (!active && !renaming) e.currentTarget.style.background = 'var(--color-surface)'; }}
        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
      >
        {item.pinned && (
          <MapPinIcon style={{ width: 11, height: 11, color: 'var(--color-accent)', flexShrink: 0 }} />
        )}

        <span style={{ fontSize: '11px', color: active ? 'var(--color-accent)' : 'var(--color-text-muted)', flexShrink: 0 }}>
          {icon}
        </span>

        {renaming ? (
          <input
            ref={inputRef}
            value={renameVal}
            onChange={e => setRenameVal(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') commitRename();
              if (e.key === 'Escape') setRenaming(false);
            }}
            onBlur={commitRename}
            style={{
              flex: 1,
              background: 'var(--color-surface)',
              border: '1px solid var(--color-accent-border)',
              borderRadius: '5px',
              color: 'var(--color-text)',
              fontSize: '12px',
              fontFamily: "'Urbanist', sans-serif",
              padding: '2px 6px',
              outline: 'none',
            }}
          />
        ) : (
          <>
            <span
              style={{
                flex: 1,
                fontSize: '12px',
                color: active ? 'var(--color-text)' : 'var(--color-text-soft)',
                fontFamily: "'Urbanist', sans-serif",
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                fontWeight: active ? 600 : 400,
              }}
            >
              {item.title}
            </span>
            {/* Origin tag, Client (intake) / Team Collab / Brief */}
            <OriginPill item={item} />
          </>
        )}

        {!renaming && (
          <span style={{ fontSize: '10px', color: 'var(--color-text-muted)', fontFamily: "'Urbanist', sans-serif", flexShrink: 0 }}>
            {formatDate(item.ts)}
          </span>
        )}

        {!renaming && hovered && (
          <button
            onClick={e => { e.stopPropagation(); setMenuOpen(v => !v); }}
            aria-label="More actions"
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--color-text-muted)',
              cursor: 'pointer',
              width: 22, height: 22,
              padding: 0,
              lineHeight: 0,
              flexShrink: 0,
              borderRadius: 6,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'background 0.12s, color 0.12s',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.color = 'var(--color-text)'
              e.currentTarget.style.background = 'var(--color-surface)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.color = 'var(--color-text-muted)'
              e.currentTarget.style.background = 'transparent'
            }}
          >
            <EllipsisHorizontalIcon style={{ width: 18, height: 18 }} />
          </button>
        )}
      </div>

      {menuOpen && (
        <div
          ref={menuRef}
          style={{
            position: 'absolute',
            right: 0,
            top: 'calc(100% + 4px)',
            background: 'var(--color-card)',
            border: '1px solid var(--color-border)',
            borderRadius: '12px',
            // More outer padding gives icons + labels breathing room.
            padding: '6px',
            minWidth: '184px',
            boxShadow: 'var(--shadow-dropdown)',
            animation: 'fadeUp 0.15s ease',
            zIndex: 500,
            display: 'flex',
            flexDirection: 'column',
            // Tiny vertical gap between items so rows don't look glued.
            gap: 2,
          }}
        >
          {MENU_ITEMS.map((mi, idx) => {
            const Icon = mi.Icon
            const label = mi.key === 'pin' && item.pinned ? mi.pinnedLabel : mi.label
            // Visually separate the destructive Delete action from the
            // safe actions above it with a slim divider.
            const showDivider = mi.danger && idx > 0
            return (
              <React.Fragment key={mi.key}>
                {showDivider && (
                  <div style={{
                    height: 1,
                    background: 'var(--color-border)',
                    margin: '4px -2px',
                    opacity: 0.7,
                  }} />
                )}
                <button
                  onClick={() => handleMenu(mi.key)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    // Wider gap between icon and label.
                    gap: 11,
                    width: '100%',
                    background: 'none',
                    border: 'none',
                    textAlign: 'left',
                    // Roomier touch target, same vertical rhythm as Heroicons docs.
                    padding: '9px 12px',
                    fontSize: 13,
                    fontWeight: 500,
                    lineHeight: 1.1,
                    fontFamily: "'Urbanist', sans-serif",
                    color: mi.danger ? 'var(--color-red)' : 'var(--color-text-soft)',
                    cursor: 'pointer',
                    borderRadius: 8,
                    transition: 'background 0.12s, color 0.12s',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.background = mi.danger ? 'rgba(255,77,106,0.12)' : 'var(--color-surface)';
                    if (!mi.danger) e.currentTarget.style.color = 'var(--color-text)';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.background = 'none';
                    e.currentTarget.style.color = mi.danger ? 'var(--color-red)' : 'var(--color-text-soft)';
                  }}
                >
                  {/* Bigger, clearer icon, 16px reads cleanly next to
                      13px label without dominating. strokeWidth nudged
                      up so outline icons match the visual weight of
                      the label. */}
                  <Icon style={{ width: 16, height: 16, strokeWidth: 1.8, flexShrink: 0 }} />
                  <span>{label}</span>
                </button>
              </React.Fragment>
            )
          })}
        </div>
      )}
    </div>
  );
}
