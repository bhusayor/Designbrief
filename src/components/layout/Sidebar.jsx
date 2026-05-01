import { useState, useContext, useEffect, useRef } from 'react'
import AppContext from '../../context/AppContext'
import HistoryItem from './HistoryItem'
import {
  PencilSquareIcon,
  MagnifyingGlassIcon,
  ClipboardDocumentListIcon,
  RectangleStackIcon,
  UserGroupIcon,
  SunIcon,
  MoonIcon,
  Cog6ToothIcon,
  ArrowRightStartOnRectangleIcon,
  ChevronDownIcon,
  DocumentTextIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline'

// ─── NavItem with tooltip ──────────────────────────────────────────────────────

function NavItem({ icon: Icon, label, active, onClick, collapsed, badge }) {
  const [hovered, setHovered] = useState(false)
  const [tooltipTop, setTooltipTop] = useState(0)
  const btnRef = useRef()

  function handleMouseEnter() {
    setHovered(true)
    if (collapsed && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect()
      setTooltipTop(rect.top + rect.height / 2)
    }
  }

  return (
    <div style={{ position: 'relative' }}>
      <button
        ref={btnRef}
        onClick={onClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={() => setHovered(false)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: collapsed ? '9px 0' : '7px 10px',
          justifyContent: collapsed ? 'center' : 'flex-start',
          borderRadius: 'var(--radius-md)',
          cursor: 'pointer',
          transition: 'background var(--transition-fast), color var(--transition-fast)',
          marginBottom: 1,
          border: 'none',
          background: active
            ? 'var(--color-sidebar-item-active)'
            : hovered
              ? 'var(--color-sidebar-item-hover)'
              : 'transparent',
          color: active ? 'var(--color-text)' : 'var(--color-text-soft)',
          fontFamily: 'var(--font-sans)',
          fontSize: 13,
          fontWeight: active ? 600 : 500,
          textAlign: 'left',
        }}
      >
        <Icon style={{ width: 15, height: 15, flexShrink: 0, opacity: active ? 1 : 0.6 }} />
        {!collapsed && (
          <span style={{ overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
            {label}
          </span>
        )}
        {!collapsed && badge > 0 && (
          <div style={{
            background: '#16a34a',
            color: 'white',
            borderRadius: '50%',
            width: 16, height: 16,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: "'DM Mono', monospace",
            fontSize: 9, fontWeight: 700,
            marginLeft: 'auto',
            flexShrink: 0,
          }}>
            {badge > 9 ? '9+' : badge}
          </div>
        )}
      </button>

      {/* Tooltip — fixed position to escape overflow:hidden on sidebar */}
      {collapsed && hovered && (
        <div
          style={{
            position: 'fixed',
            left: 64,
            top: tooltipTop,
            transform: 'translateY(-50%)',
            background: 'var(--color-text)',
            color: 'var(--color-bg)',
            padding: '5px 10px',
            borderRadius: 7,
            fontFamily: "'Urbanist', sans-serif",
            fontSize: 12,
            fontWeight: 500,
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            zIndex: 500,
            boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
          }}
        >
          {label}
        </div>
      )}
    </div>
  )
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

export default function Sidebar() {
  const {
    activeSection, navigate, history,
    activeChat, setActiveChat,
    deleteHistory, pinHistory, renameHistory, shareHistory,
    theme, toggleTheme, showToast,
    user, signOut,
    setActiveProject,
    intakeForms,
    workspace,
    creditsUsed, creditsLimit,
  } = useContext(AppContext)

  const readyCount = (intakeForms || []).filter(f => f.status === 'complete').length

  const [collapsed, setCollapsed] = useState(false)
  const [showWorkspaceMenu, setShowWorkspaceMenu] = useState(false)
  const [showSearch, setShowSearch] = useState(false)
  const [showProfileMenu, setShowProfileMenu] = useState(false)
  const [profileHovered, setProfileHovered] = useState(false)
  const [profileTooltipTop, setProfileTooltipTop] = useState(0)
  const [searchQuery, setSearchQuery] = useState('')
  const menuRef = useRef(null)
  const profileRef = useRef(null)
  const profileBtnRef = useRef(null)
  const workspaceAreaRef = useRef(null)

  // Close profile menu on outside click
  useEffect(() => {
    if (!showProfileMenu) return
    function handler(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setShowProfileMenu(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showProfileMenu])

  useEffect(() => {
    if (!showWorkspaceMenu) return
    function handler(e) {
      if (workspaceAreaRef.current && !workspaceAreaRef.current.contains(e.target)) {
        setShowWorkspaceMenu(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showWorkspaceMenu])

  const initials = (user?.firstName || user?.name || 'D')[0].toUpperCase()

  const sortedHistory = [...history].sort(
    (a, b) =>
      (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) ||
      new Date(b.ts) - new Date(a.ts)
  )

  const filteredHistory = searchQuery
    ? sortedHistory.filter(h =>
        h.title?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : sortedHistory

  function handleProfileMouseEnter() {
    setProfileHovered(true)
    if (collapsed && profileBtnRef.current) {
      const rect = profileBtnRef.current.getBoundingClientRect()
      setProfileTooltipTop(rect.top + rect.height / 2)
    }
  }

  return (
    <aside
      style={{
        width: collapsed ? '56px' : '220px',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--color-sidebar)',
        borderRight: '1px solid var(--color-sidebar-border)',
        overflow: 'hidden',
        flexShrink: 0,
        transition: 'width 0.25s ease',
        position: 'relative',
      }}
    >
      {/* ── Workspace button + sidebar toggle ── */}
      <div ref={workspaceAreaRef} style={{ flexShrink: 0 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '8px 8px 4px',
            gap: 4,
          }}
        >
          {collapsed ? (
            /* Collapsed: just logo mark centred */
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '5px 0' }}>
              <div style={{
                width: 24, height: 24,
                background: 'linear-gradient(135deg, var(--color-accent) 0%, var(--color-accent-2) 100%)',
                borderRadius: 'var(--radius-sm)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <SparklesIcon style={{ width: 13, height: 13, color: 'white' }} />
              </div>
            </div>
          ) : (
            /* Expanded: clickable workspace trigger */
            <button
              onClick={() => setShowWorkspaceMenu(v => !v)}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-sidebar-item-hover)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              style={{
                flex: 1, display: 'flex', alignItems: 'center', gap: 8,
                padding: '5px 8px', borderRadius: 'var(--radius-md)',
                border: 'none', cursor: 'pointer', background: 'transparent',
                textAlign: 'left', transition: 'background var(--transition-fast)',
              }}
            >
              <div style={{
                width: 24, height: 24,
                background: 'linear-gradient(135deg, var(--color-accent) 0%, var(--color-accent-2) 100%)',
                borderRadius: 'var(--radius-sm)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <SparklesIcon style={{ width: 13, height: 13, color: 'white' }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontFamily: 'var(--font-sans)', fontWeight: 800, fontSize: 13,
                  letterSpacing: '-0.03em', color: 'var(--color-text)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {workspace?.name || 'DesignBrief AI'}
                </div>
              </div>
              <ChevronDownIcon style={{
                width: 12, height: 12, color: 'var(--color-text-muted)', flexShrink: 0,
                transform: showWorkspaceMenu ? 'rotate(180deg)' : 'none',
                transition: 'transform var(--transition-fast)',
              }} />
            </button>
          )}

          {/* Sidebar toggle button */}
          <button
            onClick={() => setCollapsed(v => !v)}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-sidebar-item-hover)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            style={{
              width: 28, height: 28, borderRadius: 7,
              background: 'transparent', border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--color-text-soft)', flexShrink: 0,
              transition: 'background var(--transition-fast)',
            }}
          >
            {collapsed ? (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <rect x="1.5" y="2" width="3" height="12" rx="1.5" fill="currentColor" opacity="0.9" />
                <path d="M8 5l3.5 3L8 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <rect x="1.5" y="2" width="3" height="12" rx="1.5" fill="currentColor" opacity="0.9" />
                <path d="M11 5L7.5 8 11 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </button>
        </div>

        {/* Workspace dropdown — inline expansion */}
        {!collapsed && showWorkspaceMenu && (
          <div
            style={{
              margin: '0 8px 4px',
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-lg)',
              padding: '10px',
              animation: 'dropIn 0.15s ease',
            }}
          >
            {/* Workspace identity */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <div style={{
                width: 30, height: 30, borderRadius: 'var(--radius-md)',
                background: 'linear-gradient(135deg, var(--color-accent) 0%, var(--color-accent-2) 100%)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <SparklesIcon style={{ width: 14, height: 14, color: 'white' }} />
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{
                  fontFamily: 'var(--font-sans)', fontWeight: 700, fontSize: 12,
                  color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {workspace?.name || 'DesignBrief AI'}
                </div>
                <div style={{
                  fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.06em',
                  textTransform: 'uppercase', color: 'var(--color-text-muted)',
                }}>
                  {workspace?.plan ? workspace.plan + ' plan' : 'free plan'}
                </div>
              </div>
            </div>

            {/* Credits bar */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontFamily: 'var(--font-sans)', fontSize: 10, fontWeight: 600, color: 'var(--color-text-muted)' }}>
                AI Credits
              </span>
              <span style={{
                fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600,
                color: creditsUsed >= creditsLimit * 0.9 ? '#dc2626' : creditsUsed >= creditsLimit * 0.7 ? '#F59E0B' : 'var(--color-text-muted)',
              }}>
                {creditsUsed}/{creditsLimit}
              </span>
            </div>
            <div style={{ height: 3, background: 'var(--color-surface-2)', borderRadius: 'var(--radius-full)', marginBottom: 10, overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                width: Math.min((creditsUsed / creditsLimit) * 100, 100) + '%',
                background: creditsUsed >= creditsLimit * 0.9 ? '#dc2626' : creditsUsed >= creditsLimit * 0.7 ? '#F59E0B' : 'linear-gradient(90deg, var(--color-accent) 0%, var(--color-accent-2) 100%)',
                borderRadius: 'var(--radius-full)', transition: 'width 0.4s ease',
              }} />
            </div>

            {/* Upgrade button */}
            <button
              onClick={() => { alert('Pro plan coming soon! 500 credits/day for $19/mo.'); setShowWorkspaceMenu(false) }}
              onMouseEnter={e => (e.currentTarget.style.opacity = '0.88')}
              onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
              style={{
                width: '100%', padding: '7px 10px',
                background: 'linear-gradient(135deg, var(--color-accent) 0%, var(--color-accent-2) 100%)',
                color: 'white', border: 'none', borderRadius: 'var(--radius-md)',
                cursor: 'pointer', fontFamily: 'var(--font-sans)', fontSize: 11, fontWeight: 700,
                letterSpacing: '-0.01em',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                transition: 'opacity var(--transition-fast)',
              }}
            >
              <SparklesIcon style={{ width: 11, height: 11 }} />
              Upgrade to Pro
            </button>
          </div>
        )}
      </div>

      {/* ── Nav items ── */}
      <div style={{ padding: '4px 8px', flexShrink: 0 }}>
        <NavItem
          icon={PencilSquareIcon}
          label="New Chat"
          active={activeSection === 'dashboard'}
          onClick={() => navigate('dashboard')}
          collapsed={collapsed}
        />
        <NavItem
          icon={MagnifyingGlassIcon}
          label="Search"
          active={false}
          onClick={() => setShowSearch(true)}
          collapsed={collapsed}
        />
        <NavItem
          icon={ClipboardDocumentListIcon}
          label="Client Intake"
          active={activeSection === 'intake'}
          onClick={() => navigate('intake')}
          collapsed={collapsed}
          badge={readyCount}
        />
        <NavItem
          icon={RectangleStackIcon}
          label="Projects"
          active={activeSection === 'library'}
          onClick={() => navigate('library')}
          collapsed={collapsed}
        />
        <NavItem
          icon={UserGroupIcon}
          label="Team Collab"
          active={activeSection === 'team'}
          onClick={() => navigate('team')}
          collapsed={collapsed}
        />
      </div>

      {/* ── Divider ── */}
      {!collapsed && (
        <div
          style={{
            height: '1px',
            background: 'var(--color-divider)',
            margin: '4px 8px',
          }}
        />
      )}

      {/* ── History section (expanded only) ── */}
      {!collapsed ? (
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 8px' }}>
          <div
            style={{
              fontSize: '10px',
              fontFamily: 'var(--font-mono)',
              color: 'var(--color-text-muted)',
              letterSpacing: '0.08em',
              fontWeight: 600,
              padding: '8px 10px 4px',
              textTransform: 'uppercase',
            }}
          >
            Recents
          </div>

          {filteredHistory.length > 0
            ? filteredHistory.map(item => (
                <HistoryItem
                  key={item.id}
                  item={item}
                  active={activeChat === item.id}
                  onClick={h => { setActiveChat(h.id); navigate(h.section) }}
                  onDelete={deleteHistory}
                  onPin={pinHistory}
                  onRename={renameHistory}
                  onShare={shareHistory}
                />
              ))
            : (
              <div
                style={{
                  fontFamily: "'DM Mono', monospace",
                  fontSize: '11px',
                  color: 'var(--color-text-muted)',
                  padding: '12px 8px',
                }}
              >
                No projects yet
              </div>
            )
          }
        </div>
      ) : (
        <div style={{ flex: 1 }} />
      )}


      {/* ── Bottom section ── */}
      <div
        style={{
          padding: '8px',
          borderTop: '1px solid var(--color-divider)',
          flexShrink: 0,
        }}
      >
        {/* Theme toggle */}
        {!collapsed && (
          <button
            onClick={toggleTheme}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-sidebar-item-hover)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '7px 10px', borderRadius: 'var(--radius-md)', marginBottom: 4,
              border: 'none', cursor: 'pointer', background: 'transparent',
              transition: 'background var(--transition-fast)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              {theme === 'light'
                ? <SunIcon style={{ width: 14, height: 14, color: 'var(--color-text-muted)' }} />
                : <MoonIcon style={{ width: 14, height: 14, color: 'var(--color-text-muted)' }} />
              }
              <span style={{ fontFamily: 'var(--font-sans)', fontSize: 12, fontWeight: 500, color: 'var(--color-text-soft)' }}>
                {theme === 'light' ? 'Light mode' : 'Dark mode'}
              </span>
            </div>
            <div style={{
              width: 36, height: 20, borderRadius: 10, position: 'relative', flexShrink: 0,
              background: theme === 'dark' ? 'var(--color-accent)' : 'var(--color-surface-2)',
              border: `1px solid ${theme === 'dark' ? 'var(--color-accent)' : 'var(--color-border)'}`,
              transition: 'background var(--transition-base), border-color var(--transition-base)',
            }}>
              <div style={{
                position: 'absolute', top: 3, width: 12, height: 12, borderRadius: '50%',
                background: theme === 'dark' ? 'white' : 'var(--color-text-muted)',
                left: theme === 'dark' ? 19 : 3,
                transition: 'left var(--transition-base)',
              }} />
            </div>
          </button>
        )}

        {/* Profile row */}
        <div
          ref={profileRef}
          style={{ position: 'relative' }}
          onMouseEnter={handleProfileMouseEnter}
          onMouseLeave={() => setProfileHovered(false)}
        >
          {/* Profile dropdown */}
          {showProfileMenu && !collapsed && (
            <div
              ref={menuRef}
              style={{
                position: 'absolute',
                bottom: '100%',
                left: 0,
                right: 0,
                marginBottom: '4px',
                background: 'var(--color-card)',
                border: '1px solid var(--color-border)',
                borderRadius: '12px',
                padding: '5px',
                boxShadow: 'var(--shadow-dropdown)',
                animation: 'fadeUp 0.15s ease',
                zIndex: 200,
              }}
            >
              <button
                onClick={() => {
                  showToast('Settings coming soon', 'info')
                  setShowProfileMenu(false)
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-surface)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                style={{
                  display: 'flex',
                  gap: '8px',
                  alignItems: 'center',
                  width: '100%',
                  padding: '8px 10px',
                  borderRadius: '8px',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  fontFamily: "'Urbanist', sans-serif",
                  fontSize: '13px',
                  color: 'var(--color-text)',
                  textAlign: 'left',
                  transition: 'background 0.1s',
                }}
              >
                <Cog6ToothIcon style={{ width: '15px', height: '15px' }} />
                Settings
              </button>
              <button
                onClick={() => { signOut(); setShowProfileMenu(false) }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(220,38,38,0.08)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                style={{
                  display: 'flex',
                  gap: '8px',
                  alignItems: 'center',
                  width: '100%',
                  padding: '8px 10px',
                  borderRadius: '8px',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  fontFamily: "'Urbanist', sans-serif",
                  fontSize: '13px',
                  color: 'var(--color-red)',
                  textAlign: 'left',
                  transition: 'background 0.1s',
                }}
              >
                <ArrowRightStartOnRectangleIcon style={{ width: '15px', height: '15px' }} />
                Sign out
              </button>
            </div>
          )}

          {/* Profile button */}
          <button
            ref={profileBtnRef}
            onClick={() => !collapsed && setShowProfileMenu(v => !v)}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-sidebar-item-hover)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: collapsed ? '7px 0' : '7px 8px',
              justifyContent: collapsed ? 'center' : 'flex-start',
              borderRadius: 'var(--radius-md)',
              cursor: 'pointer',
              transition: 'all 0.15s',
              width: '100%',
              border: 'none',
              background: 'transparent',
              textAlign: 'left',
            }}
          >
            {/* Avatar */}
            <div
              style={{
                width: '28px',
                height: '28px',
                borderRadius: '50%',
                background: 'linear-gradient(135deg, var(--color-accent-soft), var(--color-accent-2-soft))',
                border: '1px solid var(--color-border)',
                color: 'var(--color-accent)',
                fontFamily: 'var(--font-sans)',
                fontWeight: 700,
                fontSize: '11px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              {initials}
            </div>

            {!collapsed && (
              <>
                <span
                  style={{
                    fontFamily: "'Urbanist', sans-serif",
                    fontWeight: 500,
                    fontSize: '12px',
                    color: 'var(--color-text)',
                    flex: 1,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {user?.name || user?.firstName || 'Designer'}
                </span>
                <ChevronDownIcon
                  style={{
                    width: '14px',
                    height: '14px',
                    color: 'var(--color-text-muted)',
                    flexShrink: 0,
                  }}
                />
              </>
            )}
          </button>

          {/* Profile tooltip — fixed position to escape overflow:hidden */}
          {collapsed && profileHovered && (
            <div
              style={{
                position: 'fixed',
                left: 64,
                top: profileTooltipTop,
                transform: 'translateY(-50%)',
                background: 'var(--color-text)',
                color: 'var(--color-bg)',
                padding: '5px 10px',
                borderRadius: 7,
                fontFamily: "'Urbanist', sans-serif",
                fontSize: 12,
                fontWeight: 500,
                whiteSpace: 'nowrap',
                pointerEvents: 'none',
                zIndex: 500,
                boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
              }}
            >
              {user?.firstName || user?.name || 'Designer'}
            </div>
          )}
        </div>
      </div>

      {/* ── Search Modal ── */}
      {showSearch && (
        <SearchModal
          onClose={() => setShowSearch(false)}
          history={history}
          setActiveProject={setActiveProject}
          navigate={navigate}
        />
      )}
    </aside>
  )
}

// ─── Search Modal ─────────────────────────────────────────────────────────────

function SearchModal({ onClose, history, setActiveProject, navigate }) {
  const [query, setQuery] = useState('')
  const inputRef = useRef()

  // Auto-focus input on open
  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 50)
  }, [])

  // Close on Escape
  useEffect(() => {
    function handler(e) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  const filtered = query.trim()
    ? (history || []).filter(h =>
        h.title?.toLowerCase().includes(query.toLowerCase())
      )
    : (history || []).slice(0, 12)

  function handleSelect(item) {
    setActiveProject({
      id: item.id,
      title: item.title,
      data: item.data,
      ts: item.ts,
    })
    navigate('document')
    onClose()
  }

  function formatDate(ts) {
    const d = new Date(ts)
    const now = new Date()
    const diff = now - d
    const days = Math.floor(diff / 86400000)
    if (days === 0) return 'Today'
    if (days === 1) return 'Yesterday'
    if (days < 7) return 'Past week'
    if (days < 30) return 'Past month'
    return d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })
  }

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.4)',
          zIndex: 300,
          backdropFilter: 'blur(2px)',
        }}
      />

      {/* Modal */}
      <div
        style={{
          position: 'fixed',
          top: '18%',
          left: '50%',
          transform: 'translateX(-50%)',
          width: 580,
          maxWidth: '90vw',
          maxHeight: '60vh',
          background: 'var(--color-card)',
          border: '1px solid var(--color-border)',
          borderRadius: 16,
          boxShadow: 'var(--shadow-modal)',
          zIndex: 301,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          animation: 'fadeUp 0.2s ease',
        }}
      >
        {/* Search input row */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '14px 16px',
            borderBottom: '1px solid var(--color-border)',
          }}
        >
          <MagnifyingGlassIcon
            style={{
              width: 18,
              height: 18,
              color: 'var(--color-text-muted)',
              flexShrink: 0,
            }}
          />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search projects and briefs..."
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              fontFamily: "'Urbanist', sans-serif",
              fontSize: 15,
              color: 'var(--color-text)',
            }}
          />
          <button
            onClick={onClose}
            style={{
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 7,
              padding: '3px 8px',
              cursor: 'pointer',
              fontFamily: "'DM Mono', monospace",
              fontSize: 11,
              color: 'var(--color-text-muted)',
            }}
          >
            Esc
          </button>
        </div>

        {/* Results */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '6px' }}>
          {filtered.length === 0 ? (
            <div
              style={{
                textAlign: 'center',
                padding: '32px 0',
                fontFamily: "'DM Mono', monospace",
                fontSize: 13,
                color: 'var(--color-text-muted)',
              }}
            >
              {query ? `No results for "${query}"` : 'No projects yet'}
            </div>
          ) : (
            filtered.map(item => (
              <div
                key={item.id}
                onClick={() => handleSelect(item)}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-surface)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  padding: '10px 12px',
                  borderRadius: 9,
                  cursor: 'pointer',
                  transition: 'background 0.1s',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                  <DocumentTextIcon
                    style={{
                      width: 16,
                      height: 16,
                      color: 'var(--color-text-muted)',
                      flexShrink: 0,
                    }}
                  />
                  <span
                    style={{
                      fontFamily: "'Urbanist', sans-serif",
                      fontSize: 14,
                      color: 'var(--color-text)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {item.title}
                  </span>
                </div>
                <span
                  style={{
                    fontFamily: "'DM Mono', monospace",
                    fontSize: 11,
                    color: 'var(--color-text-muted)',
                    flexShrink: 0,
                  }}
                >
                  {formatDate(item.ts)}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  )
}
