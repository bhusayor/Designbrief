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
  UserPlusIcon,
  BoltIcon,
  ArrowRightIcon,
  ClockIcon,
  CheckIcon,
  PlusIcon,
  ArrowLeftCircleIcon,
  ArrowRightCircleIcon,
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
  const [logoHovered, setLogoHovered] = useState(false)
  const menuRef = useRef(null)
  const profileRef = useRef(null)
  const profileBtnRef = useRef(null)
  const workspaceAreaRef = useRef(null)
  const workspaceDropdownRef = useRef(null)

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

  // Close workspace menu on outside click
  useEffect(() => {
    if (!showWorkspaceMenu) return
    function handler(e) {
      const inArea = workspaceAreaRef.current && workspaceAreaRef.current.contains(e.target)
      const inDropdown = workspaceDropdownRef.current && workspaceDropdownRef.current.contains(e.target)
      if (!inArea && !inDropdown) setShowWorkspaceMenu(false)
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

  function planLabel(plan) {
    if (plan === 'pro') return 'Pro'
    if (plan === 'business') return 'Business'
    return 'Free'
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
      {/* ── Row 1: Logo + app name + collapse button ── */}
      <div ref={workspaceAreaRef} style={{ flexShrink: 0 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 14px 10px',
          }}
        >
          {/* Logo mark */}
          {collapsed ? (
            <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
              <button
                onClick={() => setCollapsed(false)}
                onMouseEnter={() => setLogoHovered(true)}
                onMouseLeave={() => setLogoHovered(false)}
                title="Expand sidebar"
                style={{
                  width: 26, height: 26, borderRadius: 8, border: 'none', cursor: 'pointer',
                  background: 'linear-gradient(135deg, #7C3AED 0%, #A855F7 100%)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: '0 2px 8px rgba(124,58,237,0.3)', flexShrink: 0,
                }}
              >
                {logoHovered
                  ? <ArrowRightCircleIcon style={{ width: 15, height: 15, color: 'white' }} />
                  : <SparklesIcon style={{ width: 13, height: 13, color: 'white' }} />
                }
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <div style={{
                width: 26, height: 26, borderRadius: 8,
                background: 'linear-gradient(135deg, #7C3AED 0%, #A855F7 100%)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0, boxShadow: '0 2px 8px rgba(124,58,237,0.3)',
              }}>
                <SparklesIcon style={{ width: 13, height: 13, color: 'white' }} />
              </div>
            </div>
          )}

          {/* Collapse button — only visible when expanded */}
          {!collapsed && (
            <button
              onClick={() => setCollapsed(true)}
              title="Collapse sidebar"
              onMouseEnter={e => {
                e.currentTarget.style.background = 'var(--color-sidebar-item-hover)'
                e.currentTarget.style.borderColor = 'var(--color-border)'
                e.currentTarget.style.color = 'var(--color-text)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'transparent'
                e.currentTarget.style.borderColor = 'transparent'
                e.currentTarget.style.color = 'var(--color-text-muted)'
              }}
              style={{
                width: 26, height: 26, borderRadius: 7,
                background: 'transparent', border: '1px solid transparent',
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'var(--color-text-muted)', transition: 'var(--transition-fast)',
                flexShrink: 0,
              }}
            >
              <ArrowLeftCircleIcon style={{ width: 16, height: 16 }} />
            </button>
          )}
        </div>

        {/* Collapsed workspace avatar */}
        {collapsed && (
          <div style={{ display: 'flex', justifyContent: 'center', paddingBottom: 6 }}>
            <button
              onClick={() => setShowWorkspaceMenu(v => !v)}
              title={workspace?.name || 'My Workspace'}
              style={{
                width: 30, height: 30, borderRadius: 8, border: 'none', cursor: 'pointer',
                background: 'linear-gradient(135deg, #7C3AED 0%, #A855F7 100%)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: 'var(--font-sans)', fontWeight: 800, fontSize: 12,
                color: 'white', boxShadow: '0 2px 6px rgba(124,58,237,0.3)',
              }}
            >
              {(workspace?.name || 'D')[0].toUpperCase()}
            </button>
          </div>
        )}

        {/* Divider between logo row and workspace row */}
        {!collapsed && (
          <div style={{ height: 1, background: 'var(--color-divider)', margin: '0 12px' }} />
        )}

        {/* ── Row 2: Workspace trigger (expanded only) ── */}
        {!collapsed && (
          <div style={{ padding: '4px 8px 0' }}>
            <button
              onClick={() => setShowWorkspaceMenu(v => !v)}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-sidebar-item-hover)')}
              onMouseLeave={e => (e.currentTarget.style.background = showWorkspaceMenu ? 'var(--color-sidebar-item-active)' : 'var(--color-surface)')}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                padding: '7px 10px', borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-border)',
                cursor: 'pointer',
                background: showWorkspaceMenu ? 'var(--color-sidebar-item-active)' : 'var(--color-surface)',
                textAlign: 'left', transition: 'background var(--transition-fast)',
              }}
            >
              <div style={{
                width: 22, height: 22, borderRadius: 6,
                background: 'linear-gradient(135deg, #7C3AED 0%, #A855F7 100%)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: 'var(--font-sans)', fontWeight: 800, fontSize: 10,
                color: 'white', flexShrink: 0,
              }}>
                {(workspace?.name || 'D')[0].toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontFamily: 'var(--font-sans)', fontWeight: 700, fontSize: 12,
                  letterSpacing: '-0.02em', color: 'var(--color-text)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {workspace?.name || 'My Workspace'}
                </div>
                <div style={{
                  fontFamily: 'var(--font-sans)', fontSize: 10, color: 'var(--color-text-muted)',
                }}>
                  {planLabel(workspace?.plan)} plan
                </div>
              </div>
              <ChevronDownIcon style={{
                width: 12, height: 12, color: 'var(--color-text-muted)', flexShrink: 0,
                transform: showWorkspaceMenu ? 'rotate(180deg)' : 'none',
                transition: 'transform var(--transition-fast)',
              }} />
            </button>
          </div>
        )}

        {/* ── Workspace dropdown panel ── */}
        {!collapsed && showWorkspaceMenu && (
          <div style={{
            margin: '4px 8px 8px',
            background: 'var(--color-card)',
            border: '1px solid var(--color-border-strong)',
            borderRadius: 'var(--radius-lg)',
            overflow: 'hidden',
            boxShadow: 'var(--shadow-lg)',
            animation: 'dropIn 0.18s ease',
          }}>
            {/* Workspace info */}
            <div style={{
              padding: '14px 14px 12px',
              borderBottom: '1px solid var(--color-divider)',
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 10 }}>
                {/* Avatar with workspace initial */}
                <div style={{
                  width: 38, height: 38, borderRadius: 10,
                  background: 'linear-gradient(135deg, #7C3AED 0%, #A855F7 100%)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: 'var(--font-sans)', fontWeight: 800, fontSize: 16,
                  color: 'white', flexShrink: 0,
                  boxShadow: '0 2px 8px rgba(124,58,237,0.25)',
                }}>
                  {(workspace?.name || 'D')[0].toUpperCase()}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontFamily: 'var(--font-sans)', fontWeight: 700, fontSize: 13,
                    letterSpacing: '-0.02em', color: 'var(--color-text)',
                    lineHeight: 1.2, marginBottom: 4,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {workspace?.name || 'My Workspace'}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {/* Plan badge — Title Case */}
                    <span style={{
                      background: 'var(--color-accent-soft)',
                      border: '1px solid rgba(124,58,237,0.2)',
                      borderRadius: 'var(--radius-full)',
                      padding: '2px 8px',
                      fontFamily: 'var(--font-sans)', fontSize: 10, fontWeight: 700,
                      color: 'var(--color-accent)', letterSpacing: '0.01em',
                    }}>
                      {planLabel(workspace?.plan)}
                    </span>

                    {/* Member count */}
                    <span style={{
                      fontFamily: 'var(--font-sans)', fontSize: 11,
                      color: 'var(--color-text-muted)',
                      display: 'flex', alignItems: 'center', gap: 3,
                    }}>
                      <UserGroupIcon style={{ width: 11, height: 11 }} />
                      1 member
                    </span>
                  </div>
                </div>
              </div>

              {/* Settings + Invite buttons */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                {[
                  { icon: Cog6ToothIcon, label: 'Settings' },
                  { icon: UserPlusIcon, label: 'Invite' },
                ].map(item => (
                  <button
                    key={item.label}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-surface-2)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'var(--color-bg)')}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                      padding: '7px 8px',
                      background: 'var(--color-bg)',
                      border: '1px solid var(--color-border)',
                      borderRadius: 'var(--radius-md)', cursor: 'pointer',
                      fontFamily: 'var(--font-sans)', fontSize: 11, fontWeight: 600,
                      color: 'var(--color-text-soft)', transition: 'var(--transition-fast)',
                    }}
                  >
                    <item.icon style={{ width: 12, height: 12 }} />
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Divider */}
            <div style={{ height: 1, background: 'var(--color-border)' }} />

            {/* All Workspaces */}
            <div style={{ padding: '8px 14px 4px', background: 'var(--color-surface)' }}>
              <div style={{
                fontFamily: 'var(--font-sans)', fontSize: 11, fontWeight: 600,
                letterSpacing: '0.01em', textTransform: 'none',
                color: 'var(--color-text-muted)', marginBottom: 6,
              }}>
                All Workspaces
              </div>

              {/* Current workspace row */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '6px 8px', borderRadius: 'var(--radius-md)',
                background: 'var(--color-sidebar-item-active)', marginBottom: 2,
              }}>
                <div style={{
                  width: 22, height: 22, borderRadius: 6,
                  background: 'linear-gradient(135deg, #7C3AED 0%, #A855F7 100%)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: 'var(--font-sans)', fontWeight: 800, fontSize: 10,
                  color: 'white', flexShrink: 0,
                }}>
                  {(workspace?.name || 'D')[0].toUpperCase()}
                </div>
                <span style={{
                  fontFamily: 'var(--font-sans)', fontSize: 12, fontWeight: 600,
                  color: 'var(--color-text)', flex: 1,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {workspace?.name || 'My Workspace'}
                </span>
                <CheckIcon style={{ width: 13, height: 13, color: 'var(--color-accent)', flexShrink: 0 }} />
              </div>
            </div>

            {/* Create new workspace */}
            <div style={{ padding: '4px 14px 12px', background: 'var(--color-surface)' }}>
              <button
                onClick={() => alert('Multiple workspaces available on Pro plan.')}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = 'var(--color-accent)'
                  e.currentTarget.style.color = 'var(--color-accent)'
                  e.currentTarget.style.background = 'var(--color-accent-soft)'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = 'var(--color-border)'
                  e.currentTarget.style.color = 'var(--color-text-muted)'
                  e.currentTarget.style.background = 'transparent'
                }}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                  padding: '7px 8px', background: 'transparent',
                  border: '1px dashed var(--color-border)', borderRadius: 'var(--radius-md)',
                  cursor: 'pointer', fontFamily: 'var(--font-sans)', fontSize: 12, fontWeight: 500,
                  color: 'var(--color-text-muted)', transition: 'var(--transition-fast)',
                }}
              >
                <div style={{
                  width: 20, height: 20, borderRadius: 5,
                  border: '1.5px dashed currentColor',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  <PlusIcon style={{ width: 10, height: 10 }} />
                </div>
                Create new workspace
              </button>
            </div>
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
        <div style={{ height: '1px', background: 'var(--color-divider)', margin: '4px 8px' }} />
      )}

      {/* ── History section (expanded only) ── */}
      {!collapsed ? (
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 8px' }}>
          <div style={{
            fontSize: 11,
            fontFamily: 'var(--font-sans)',
            color: 'var(--color-text-muted)',
            letterSpacing: '0.01em',
            fontWeight: 600,
            padding: '8px 10px 4px',
            textTransform: 'none',
          }}>
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
              <div style={{
                fontFamily: "'DM Mono', monospace",
                fontSize: '11px',
                color: 'var(--color-text-muted)',
                padding: '12px 8px',
              }}>
                No projects yet
              </div>
            )
          }
        </div>
      ) : (
        <div style={{ flex: 1 }} />
      )}

      {/* ── Credits + Upgrade (always visible, free plan) ── */}
      {!collapsed && workspace?.plan === 'free' && (
        <div style={{
          margin: '0 8px 8px',
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-lg)',
          padding: '12px 12px 10px',
          flexShrink: 0,
        }}>
          {/* Header row */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontFamily: 'var(--font-sans)', fontSize: 11, fontWeight: 700, color: 'var(--color-text)', letterSpacing: '-0.01em' }}>
              AI Credits
            </span>
            <span style={{
              fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600,
              color: creditsUsed >= creditsLimit * 0.9 ? '#dc2626' : creditsUsed >= creditsLimit * 0.7 ? '#F59E0B' : 'var(--color-text-muted)',
            }}>
              {creditsUsed}/{creditsLimit}
            </span>
          </div>

          {/* Progress bar */}
          <div style={{ height: 4, background: 'var(--color-surface-2)', borderRadius: 'var(--radius-full)', marginBottom: 8, overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              width: Math.min((creditsUsed / creditsLimit) * 100, 100) + '%',
              background: creditsUsed >= creditsLimit * 0.9 ? '#dc2626' : creditsUsed >= creditsLimit * 0.7 ? '#F59E0B' : 'linear-gradient(90deg, var(--color-accent) 0%, var(--color-accent-2) 100%)',
              borderRadius: 'var(--radius-full)', transition: 'width 0.4s ease',
            }} />
          </div>

          {/* Reset text */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 4,
            fontFamily: 'var(--font-sans)', fontSize: 10, color: 'var(--color-text-muted)',
            marginBottom: 10,
          }}>
            <ClockIcon style={{ width: 10, height: 10, flexShrink: 0 }} />
            Daily credits reset at midnight UTC
          </div>

          {/* Upgrade button */}
          <button
            onClick={() => alert('Pro plan coming soon! 500 credits/day for $19/mo.')}
            onMouseEnter={e => {
              e.currentTarget.style.transform = 'translateY(-1px)'
              e.currentTarget.style.boxShadow = '0 4px 16px rgba(124,58,237,0.4)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.transform = 'translateY(0)'
              e.currentTarget.style.boxShadow = '0 2px 8px rgba(124,58,237,0.3)'
            }}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '8px 12px',
              background: 'linear-gradient(135deg, var(--color-accent) 0%, var(--color-accent-2) 100%)',
              color: 'white', border: 'none', borderRadius: 'var(--radius-md)',
              cursor: 'pointer', fontFamily: 'var(--font-sans)', fontSize: 12, fontWeight: 700,
              letterSpacing: '-0.01em', transition: 'var(--transition-fast)',
              boxShadow: '0 2px 8px rgba(124,58,237,0.3)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <BoltIcon style={{ width: 12, height: 12 }} />
              Upgrade to Pro
            </div>
            <ArrowRightIcon style={{ width: 12, height: 12, opacity: 0.8 }} />
          </button>
        </div>
      )}

      {/* ── Bottom section ── */}
      <div style={{ padding: '8px', borderTop: '1px solid var(--color-divider)', flexShrink: 0 }}>
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
                left: 0, right: 0,
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
                onClick={() => { showToast('Settings coming soon', 'info'); setShowProfileMenu(false) }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-surface)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                style={{
                  display: 'flex', gap: '8px', alignItems: 'center', width: '100%',
                  padding: '8px 10px', borderRadius: '8px',
                  background: 'transparent', border: 'none', cursor: 'pointer',
                  fontFamily: "'Urbanist', sans-serif", fontSize: '13px',
                  color: 'var(--color-text)', textAlign: 'left', transition: 'background 0.1s',
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
                  display: 'flex', gap: '8px', alignItems: 'center', width: '100%',
                  padding: '8px 10px', borderRadius: '8px',
                  background: 'transparent', border: 'none', cursor: 'pointer',
                  fontFamily: "'Urbanist', sans-serif", fontSize: '13px',
                  color: 'var(--color-red)', textAlign: 'left', transition: 'background 0.1s',
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
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: collapsed ? '7px 0' : '7px 8px',
              justifyContent: collapsed ? 'center' : 'flex-start',
              borderRadius: 'var(--radius-md)', cursor: 'pointer',
              transition: 'all 0.15s', width: '100%',
              border: 'none', background: 'transparent', textAlign: 'left',
            }}
          >
            <div style={{
              width: '28px', height: '28px', borderRadius: '50%',
              background: 'linear-gradient(135deg, var(--color-accent-soft), var(--color-accent-2-soft))',
              border: '1px solid var(--color-border)',
              color: 'var(--color-accent)',
              fontFamily: 'var(--font-sans)', fontWeight: 700, fontSize: '11px',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              {initials}
            </div>

            {!collapsed && (
              <>
                <span style={{
                  fontFamily: "'Urbanist', sans-serif", fontWeight: 500, fontSize: '12px',
                  color: 'var(--color-text)', flex: 1,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {user?.name || user?.firstName || 'Designer'}
                </span>
                <ChevronDownIcon style={{ width: '14px', height: '14px', color: 'var(--color-text-muted)', flexShrink: 0 }} />
              </>
            )}
          </button>

          {/* Profile tooltip */}
          {collapsed && profileHovered && (
            <div style={{
              position: 'fixed', left: 64, top: profileTooltipTop,
              transform: 'translateY(-50%)',
              background: 'var(--color-text)', color: 'var(--color-bg)',
              padding: '5px 10px', borderRadius: 7,
              fontFamily: "'Urbanist', sans-serif", fontSize: 12, fontWeight: 500,
              whiteSpace: 'nowrap', pointerEvents: 'none', zIndex: 500,
              boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
            }}>
              {user?.firstName || user?.name || 'Designer'}
            </div>
          )}
        </div>
      </div>

      {/* ── Collapsed workspace dropdown (fixed position) ── */}
      {collapsed && showWorkspaceMenu && (
        <div
          ref={workspaceDropdownRef}
          style={{
            position: 'fixed',
            left: 64,
            top: 60,
            width: 260,
            background: 'var(--color-card)',
            border: '1px solid var(--color-border-strong)',
            borderRadius: 'var(--radius-lg)',
            overflow: 'hidden',
            boxShadow: 'var(--shadow-lg)',
            zIndex: 400,
            animation: 'slideInLeft 0.18s ease',
          }}
        >
          {/* Workspace info */}
          <div style={{ padding: '14px 14px 12px', borderBottom: '1px solid var(--color-border)' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 10 }}>
              <div style={{
                width: 38, height: 38, borderRadius: 10,
                background: 'linear-gradient(135deg, #7C3AED 0%, #A855F7 100%)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: 'var(--font-sans)', fontWeight: 800, fontSize: 16,
                color: 'white', flexShrink: 0,
                boxShadow: '0 2px 8px rgba(124,58,237,0.25)',
              }}>
                {(workspace?.name || 'D')[0].toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontFamily: 'var(--font-sans)', fontWeight: 700, fontSize: 13,
                  letterSpacing: '-0.02em', color: 'var(--color-text)',
                  lineHeight: 1.2, marginBottom: 4,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {workspace?.name || 'My Workspace'}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{
                    background: 'var(--color-accent-soft)',
                    border: '1px solid rgba(124,58,237,0.2)',
                    borderRadius: 'var(--radius-full)',
                    padding: '2px 8px',
                    fontFamily: 'var(--font-sans)', fontSize: 10, fontWeight: 700,
                    color: 'var(--color-accent)', letterSpacing: '0.01em',
                  }}>
                    {planLabel(workspace?.plan)}
                  </span>
                  <span style={{
                    fontFamily: 'var(--font-sans)', fontSize: 11,
                    color: 'var(--color-text-muted)',
                    display: 'flex', alignItems: 'center', gap: 3,
                  }}>
                    <UserGroupIcon style={{ width: 11, height: 11 }} />
                    1 member
                  </span>
                </div>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              {[
                { icon: Cog6ToothIcon, label: 'Settings' },
                { icon: UserPlusIcon, label: 'Invite' },
              ].map(item => (
                <button
                  key={item.label}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-surface-2)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'var(--color-bg)')}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                    padding: '7px 8px',
                    background: 'var(--color-bg)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-md)', cursor: 'pointer',
                    fontFamily: 'var(--font-sans)', fontSize: 11, fontWeight: 600,
                    color: 'var(--color-text-soft)', transition: 'var(--transition-fast)',
                  }}
                >
                  <item.icon style={{ width: 12, height: 12 }} />
                  {item.label}
                </button>
              ))}
            </div>
          </div>
          {/* All Workspaces */}
          <div style={{ background: 'var(--color-surface)' }}>
            <div style={{ padding: '8px 14px 4px' }}>
              <div style={{
                fontFamily: 'var(--font-sans)', fontSize: 11, fontWeight: 600,
                letterSpacing: '0.01em', textTransform: 'none',
                color: 'var(--color-text-muted)', marginBottom: 6,
              }}>
                All Workspaces
              </div>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '6px 8px', borderRadius: 'var(--radius-md)',
                background: 'var(--color-sidebar-item-active)', marginBottom: 2,
              }}>
                <div style={{
                  width: 22, height: 22, borderRadius: 6,
                  background: 'linear-gradient(135deg, #7C3AED 0%, #A855F7 100%)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: 'var(--font-sans)', fontWeight: 800, fontSize: 10,
                  color: 'white', flexShrink: 0,
                }}>
                  {(workspace?.name || 'D')[0].toUpperCase()}
                </div>
                <span style={{
                  fontFamily: 'var(--font-sans)', fontSize: 12, fontWeight: 600,
                  color: 'var(--color-text)', flex: 1,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {workspace?.name || 'My Workspace'}
                </span>
                <CheckIcon style={{ width: 13, height: 13, color: 'var(--color-accent)', flexShrink: 0 }} />
              </div>
            </div>
            <div style={{ padding: '4px 14px 12px' }}>
              <button
                onClick={() => alert('Multiple workspaces available on Pro plan.')}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = 'var(--color-accent)'
                  e.currentTarget.style.color = 'var(--color-accent)'
                  e.currentTarget.style.background = 'var(--color-accent-soft)'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = 'var(--color-border)'
                  e.currentTarget.style.color = 'var(--color-text-muted)'
                  e.currentTarget.style.background = 'transparent'
                }}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                  padding: '7px 8px', background: 'transparent',
                  border: '1px dashed var(--color-border)', borderRadius: 'var(--radius-md)',
                  cursor: 'pointer', fontFamily: 'var(--font-sans)', fontSize: 12, fontWeight: 500,
                  color: 'var(--color-text-muted)', transition: 'var(--transition-fast)',
                }}
              >
                <div style={{
                  width: 20, height: 20, borderRadius: 5,
                  border: '1.5px dashed currentColor',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  <PlusIcon style={{ width: 10, height: 10 }} />
                </div>
                Create new workspace
              </button>
            </div>
          </div>
        </div>
      )}

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

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 50)
  }, [])

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
    setActiveProject({ id: item.id, title: item.title, data: item.data, ts: item.ts })
    navigate('document')
    onClose()
  }

  function formatDate(ts) {
    const d = new Date(ts)
    const now = new Date()
    const days = Math.floor((now - d) / 86400000)
    if (days === 0) return 'Today'
    if (days === 1) return 'Yesterday'
    if (days < 7) return 'Past week'
    if (days < 30) return 'Past month'
    return d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })
  }

  return (
    <>
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 300, backdropFilter: 'blur(2px)' }}
      />
      <div style={{
        position: 'fixed', top: '18%', left: '50%', transform: 'translateX(-50%)',
        width: 580, maxWidth: '90vw', maxHeight: '60vh',
        background: 'var(--color-card)', border: '1px solid var(--color-border)',
        borderRadius: 16, boxShadow: 'var(--shadow-modal)', zIndex: 301,
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        animation: 'fadeUp 0.2s ease',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderBottom: '1px solid var(--color-border)' }}>
          <MagnifyingGlassIcon style={{ width: 18, height: 18, color: 'var(--color-text-muted)', flexShrink: 0 }} />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search projects and briefs..."
            style={{
              flex: 1, background: 'transparent', border: 'none', outline: 'none',
              fontFamily: "'Urbanist', sans-serif", fontSize: 15, color: 'var(--color-text)',
            }}
          />
          <button
            onClick={onClose}
            style={{
              background: 'var(--color-surface)', border: '1px solid var(--color-border)',
              borderRadius: 7, padding: '3px 8px', cursor: 'pointer',
              fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'var(--color-text-muted)',
            }}
          >
            Esc
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '6px' }}>
          {filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px 0', fontFamily: "'DM Mono', monospace", fontSize: 13, color: 'var(--color-text-muted)' }}>
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
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  gap: 12, padding: '10px 12px', borderRadius: 9, cursor: 'pointer', transition: 'background 0.1s',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                  <DocumentTextIcon style={{ width: 16, height: 16, color: 'var(--color-text-muted)', flexShrink: 0 }} />
                  <span style={{ fontFamily: "'Urbanist', sans-serif", fontSize: 14, color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {item.title}
                  </span>
                </div>
                <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'var(--color-text-muted)', flexShrink: 0 }}>
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
