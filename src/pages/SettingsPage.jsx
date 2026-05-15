import React, { useState, useEffect } from 'react'
import { useApp } from '../context/AppContext'
import { supabase } from '../lib/supabase'
import { getAuthHeader } from '../lib/getAuthHeader'
import {
  XMarkIcon,
  UserIcon,
  SwatchIcon,
  Cog6ToothIcon,
  BoltIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  ClipboardDocumentIcon,
  SunIcon,
  MoonIcon,
} from '@heroicons/react/24/outline'

// ── Shared callSettings ───────────────────────────────────────────────────────

async function callSettings(body) {
  const h = await getAuthHeader()
  if (!h) throw new Error('Session expired. Please refresh.')
  const res = await fetch('/api/settings', {
    method: 'POST',
    headers: h,
    body: JSON.stringify(body),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Request failed')
  return data
}

// ── SettingRow layout ─────────────────────────────────────────────────────────

function SettingRow({ label, description, children }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 32,
      padding: '20px 0',
      borderBottom: '1px solid var(--color-border)',
    }}>
      <div style={{ maxWidth: 340 }}>
        <div style={{
          fontWeight: 600, fontSize: 14,
          color: 'var(--color-text)', marginBottom: 5, letterSpacing: '-0.01em',
        }}>
          {label}
        </div>
        <div style={{ fontSize: 12, color: 'var(--color-text-muted)', lineHeight: 1.65 }}>
          {description}
        </div>
      </div>
      <div style={{ flexShrink: 0 }}>{children}</div>
    </div>
  )
}

// ── Input styles ──────────────────────────────────────────────────────────────

const inputBase = {
  background: 'var(--color-surface)',
  border: '1px solid var(--color-border)',
  borderRadius: 9,
  padding: '8px 12px',
  fontFamily: 'var(--font-sans)',
  fontSize: 13,
  color: 'var(--color-text)',
  outline: 'none',
  transition: 'all 0.15s',
}

function focusInput(e) {
  e.target.style.borderColor = '#7C3AED'
  e.target.style.boxShadow = '0 0 0 3px rgba(124,58,237,0.12)'
}

function blurInput(e) {
  e.target.style.borderColor = 'var(--color-border)'
  e.target.style.boxShadow = 'none'
}

// ── Section: Profile ──────────────────────────────────────────────────────────

function ProfileSection() {
  const { authUser, updateUser, user } = useApp()
  const [name, setName] = useState(
    user?.name ||
    authUser?.user_metadata?.full_name ||
    authUser?.user_metadata?.name ||
    authUser?.email?.split('@')[0] || ''
  )
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  const email = authUser?.email || user?.email || ''

  const initials = name.trim()
    .split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || '?'

  async function handleUpdateName() {
    if (!name.trim()) return
    setSaving(true); setError(''); setSaved(false)
    try {
      await callSettings({ action: 'update_name', name: name.trim() })
      updateUser({ name: name.trim(), firstName: name.trim().split(' ')[0] })
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <h1 style={{ fontWeight: 800, fontSize: 22, letterSpacing: '-0.04em', color: 'var(--color-text)', margin: '0 0 4px' }}>
        Account settings
      </h1>
      <p style={{ fontSize: 13, color: 'var(--color-text-muted)', margin: '0 0 28px', lineHeight: 1.6 }}>
        Personalise how others see and interact with you on DesignBrief.
      </p>

      {/* Avatar preview */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 14,
        padding: '16px 0 20px', borderBottom: '1px solid var(--color-border)',
      }}>
        <div style={{
          width: 52, height: 52, borderRadius: '50%',
          background: 'linear-gradient(135deg, #7C3AED, #A855F7)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'var(--font-sans)', fontWeight: 800, fontSize: 18,
          color: 'white', flexShrink: 0, letterSpacing: '-0.02em',
        }}>
          {initials}
        </div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--color-text)', marginBottom: 3 }}>
            {name || 'Your name'}
          </div>
          <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{email}</div>
        </div>
      </div>

      {/* Display name */}
      <SettingRow
        label="Display name"
        description="This is how your name appears to teammates in shared workspaces and project boards."
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="text" value={name}
              onChange={e => { setName(e.target.value); setError(''); setSaved(false) }}
              onKeyDown={e => { if (e.key === 'Enter') handleUpdateName() }}
              placeholder="Your name"
              style={{ ...inputBase, width: 200 }}
              onFocus={focusInput} onBlur={blurInput}
            />
            <button
              onClick={handleUpdateName}
              disabled={saving || !name.trim()}
              style={{
                padding: '8px 16px',
                background: saved ? '#16a34a' : 'var(--color-surface)',
                border: '1px solid ' + (saved ? '#BBF7D0' : 'var(--color-border)'),
                borderRadius: 9, cursor: saving ? 'not-allowed' : 'pointer',
                fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 600,
                color: saved ? '#16a34a' : 'var(--color-text)',
                transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: 5,
              }}
            >
              {saved ? (<><CheckCircleIcon style={{ width: 13, height: 13 }} />Saved</>) : saving ? 'Saving...' : 'Update'}
            </button>
          </div>
          {error && (
            <div style={{ fontSize: 12, color: '#DC2626', display: 'flex', gap: 4, alignItems: 'center' }}>
              <ExclamationCircleIcon style={{ width: 12, height: 12 }} />{error}
            </div>
          )}
        </div>
      </SettingRow>

      {/* Email (read only) */}
      <SettingRow
        label="Email address"
        description="Your email address associated with this account. To change your email contact support."
      >
        <input
          type="email" value={email} readOnly
          style={{ ...inputBase, width: 260, color: 'var(--color-text-muted)', cursor: 'default' }}
        />
      </SettingRow>
    </div>
  )
}

// ── Section: Appearance ───────────────────────────────────────────────────────

function AppearanceSection() {
  const { theme, setTheme } = useApp()

  return (
    <div>
      <h1 style={{ fontWeight: 800, fontSize: 22, letterSpacing: '-0.04em', color: 'var(--color-text)', margin: '0 0 4px' }}>
        Appearance
      </h1>
      <p style={{ fontSize: 13, color: 'var(--color-text-muted)', margin: '0 0 28px', lineHeight: 1.6 }}>
        Customise the look and feel of DesignBrief.
      </p>

      <SettingRow
        label="Theme"
        description="Choose your preferred colour theme. This setting syncs with the toggle in the sidebar."
      >
        <div style={{ display: 'flex', gap: 8 }}>
          {[
            { value: 'light', label: 'Light', icon: SunIcon },
            { value: 'dark',  label: 'Dark',  icon: MoonIcon },
          ].map(opt => {
            const Icon = opt.icon
            const isSelected = theme === opt.value
            return (
              <button
                key={opt.value}
                onClick={() => setTheme(opt.value)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 7,
                  padding: '8px 16px',
                  background: isSelected ? '#7C3AED' : 'var(--color-surface)',
                  border: '1px solid ' + (isSelected ? '#7C3AED' : 'var(--color-border)'),
                  borderRadius: 9, cursor: 'pointer',
                  fontFamily: 'var(--font-sans)', fontSize: 13,
                  fontWeight: isSelected ? 700 : 500,
                  color: isSelected ? 'white' : 'var(--color-text)',
                  transition: 'all 0.15s',
                }}
              >
                <Icon style={{ width: 14, height: 14 }} />
                {opt.label}
              </button>
            )
          })}
        </div>
      </SettingRow>
    </div>
  )
}

// ── Section: Workspace General ────────────────────────────────────────────────

function WorkspaceGeneralSection() {
  const { workspace, setWorkspace } = useApp()
  const [wsName, setWsName] = useState(workspace?.name || '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => { setWsName(workspace?.name || '') }, [workspace?.name])

  async function handleUpdateName() {
    if (!wsName.trim() || wsName.trim() === workspace?.name) return
    setSaving(true); setError(''); setSaved(false)
    try {
      await callSettings({ action: 'update_workspace_name', workspaceId: workspace.id, name: wsName.trim() })
      setWorkspace(prev => ({ ...prev, name: wsName.trim() }))
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  function handleCopyId() {
    const id = workspace?.id || ''
    navigator.clipboard.writeText(id).catch(() => {
      const input = document.createElement('input')
      input.value = id
      document.body.appendChild(input)
      input.select()
      document.execCommand('copy')
      document.body.removeChild(input)
    })
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div>
      <h1 style={{ fontWeight: 800, fontSize: 22, letterSpacing: '-0.04em', color: 'var(--color-text)', margin: '0 0 4px' }}>
        Workspace settings
      </h1>
      <p style={{ fontSize: 13, color: 'var(--color-text-muted)', margin: '0 0 28px', lineHeight: 1.6 }}>
        Manage your workspace name and general configuration.
      </p>

      <SettingRow
        label="Workspace name"
        description="The name of your workspace shown across all projects, the sidebar, and shared links. Updates everywhere immediately."
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="text" value={wsName}
              onChange={e => { setWsName(e.target.value); setError(''); setSaved(false) }}
              onKeyDown={e => { if (e.key === 'Enter') handleUpdateName() }}
              placeholder="Workspace name"
              style={{ ...inputBase, width: 200 }}
              onFocus={focusInput} onBlur={blurInput}
            />
            <button
              onClick={handleUpdateName}
              disabled={saving || !wsName.trim() || wsName.trim() === workspace?.name}
              style={{
                padding: '8px 16px',
                background: saved ? '#16a34a' : 'var(--color-surface)',
                border: '1px solid ' + (saved ? '#BBF7D0' : 'var(--color-border)'),
                borderRadius: 9, cursor: 'pointer',
                fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 600,
                color: saved ? '#16a34a' : 'var(--color-text)',
                display: 'flex', alignItems: 'center', gap: 5, transition: 'all 0.15s',
              }}
            >
              {saved ? (<><CheckCircleIcon style={{ width: 13, height: 13 }} />Saved</>) : saving ? 'Saving...' : 'Update'}
            </button>
          </div>
          {error && (
            <div style={{ fontSize: 12, color: '#DC2626', display: 'flex', gap: 4, alignItems: 'center' }}>
              <ExclamationCircleIcon style={{ width: 12, height: 12 }} />{error}
            </div>
          )}
        </div>
      </SettingRow>

      <SettingRow
        label="Workspace ID"
        description="Your unique workspace identifier. Used in API requests and shared links."
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: 12,
            background: 'var(--color-surface)', border: '1px solid var(--color-border)',
            borderRadius: 9, padding: '8px 12px', color: 'var(--color-text-muted)',
            maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {workspace?.id?.slice(0, 8) + '...' || 'Loading...'}
          </div>
          <button
            onClick={handleCopyId}
            title={copied ? 'Copied!' : 'Copy ID'}
            style={{
              width: 34, height: 34, borderRadius: 9,
              background: 'var(--color-surface)',
              border: '1px solid ' + (copied ? '#BBF7D0' : 'var(--color-border)'),
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: copied ? '#16a34a' : 'var(--color-text-muted)', transition: 'all 0.15s',
            }}
          >
            {copied
              ? <CheckCircleIcon style={{ width: 14, height: 14 }} />
              : <ClipboardDocumentIcon style={{ width: 14, height: 14 }} />
            }
          </button>
        </div>
      </SettingRow>
    </div>
  )
}

// ── Section: Plans & Credits ──────────────────────────────────────────────────

function PlansSection() {
  const { workspace, creditsUsed, creditsLimit } = useApp()
  const plan = workspace?.plan || 'free'
  const pct = creditsLimit > 0 ? Math.round((creditsUsed / creditsLimit) * 100) : 0
  const barColor = pct >= 90 ? '#dc2626' : pct >= 70 ? '#f59e0b' : '#7C3AED'

  return (
    <div>
      <h1 style={{ fontWeight: 800, fontSize: 22, letterSpacing: '-0.04em', color: 'var(--color-text)', margin: '0 0 4px' }}>
        Plans & credits
      </h1>
      <p style={{ fontSize: 13, color: 'var(--color-text-muted)', margin: '0 0 28px', lineHeight: 1.6 }}>
        Manage your subscription and daily AI usage.
      </p>

      <SettingRow
        label="Current plan"
        description="You are on the Free plan. Upgrade to Pro for unlimited brief translations, project builds, and priority support."
      >
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 10 }}>
          <span style={{
            fontFamily: 'var(--font-sans)', fontSize: 12, fontWeight: 600,
            background: plan === 'pro' ? 'rgba(124,58,237,0.1)' : 'var(--color-surface)',
            border: '1px solid ' + (plan === 'pro' ? 'rgba(124,58,237,0.25)' : 'var(--color-border)'),
            borderRadius: 100, padding: '3px 12px',
            color: plan === 'pro' ? '#7C3AED' : 'var(--color-text-muted)',
            textTransform: 'capitalize',
          }}>
            {plan === 'pro' ? 'Pro plan' : 'Free plan'}
          </span>
          {plan !== 'pro' && (
            <button
              onClick={() => alert('Pro plan coming soon! 500 credits/day for $19/mo.')}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '9px 20px',
                background: 'linear-gradient(135deg, #7C3AED 0%, #A855F7 100%)',
                color: 'white', border: 'none', borderRadius: 10, cursor: 'pointer',
                fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 700,
                boxShadow: '0 2px 8px rgba(124,58,237,0.3)',
              }}
            >
              <BoltIcon style={{ width: 13, height: 13 }} />
              Upgrade to Pro
            </button>
          )}
        </div>
      </SettingRow>

      <SettingRow
        label="AI credits"
        description="Daily credits for brief translations, AI chat, and build features. Resets every day at midnight UTC."
      >
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
            <span style={{ fontWeight: 700, fontSize: 20, letterSpacing: '-0.03em', color: 'var(--color-text)', fontFamily: 'var(--font-sans)' }}>
              {creditsUsed}
            </span>
            <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
              / {creditsLimit} used today
            </span>
          </div>
          <div style={{ width: 200, height: 6, background: 'var(--color-border)', borderRadius: 99, overflow: 'hidden' }}>
            <div style={{ width: pct + '%', height: '100%', background: barColor, borderRadius: 99, transition: 'width 0.3s ease' }} />
          </div>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-text-muted)' }}>
            Resets at midnight UTC
          </span>
        </div>
      </SettingRow>
    </div>
  )
}

// ── Section: Danger Zone ──────────────────────────────────────────────────────

function DangerSection({ onWorkspaceDeleted, onWorkspaceLeft }) {
  const { workspace, authUser } = useApp()
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false)
  const [confirmName, setConfirmName] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [error, setError] = useState('')
  const [isOwner, setIsOwner] = useState(false)

  useEffect(() => {
    async function checkRole() {
      if (!workspace?.id || !authUser?.id) return
      const { data } = await supabase
        .from('workspace_members')
        .select('role')
        .eq('workspace_id', workspace.id)
        .eq('user_id', authUser.id)
        .single()
      setIsOwner(data?.role === 'owner')
    }
    checkRole()
  }, [workspace?.id, authUser?.id])

  async function handleDelete() {
    if (confirmName !== workspace?.name) { setError('Workspace name does not match'); return }
    setDeleting(true); setError('')
    try {
      await callSettings({ action: 'delete_workspace', workspaceId: workspace.id, confirmName })
      onWorkspaceDeleted?.()
    } catch (e) {
      setError(e.message)
      setDeleting(false)
    }
  }

  async function handleLeave() {
    setLeaving(true); setError('')
    try {
      await callSettings({ action: 'leave_workspace', workspaceId: workspace.id })
      onWorkspaceLeft?.()
    } catch (e) {
      setError(e.message)
      setLeaving(false)
    }
  }

  return (
    <div>
      <h1 style={{ fontWeight: 800, fontSize: 22, letterSpacing: '-0.04em', color: 'var(--color-text)', margin: '0 0 4px' }}>
        Danger zone
      </h1>
      <p style={{ fontSize: 13, color: 'var(--color-text-muted)', margin: '0 0 28px', lineHeight: 1.6 }}>
        Irreversible and destructive actions. Please proceed with caution.
      </p>

      <div style={{ border: '1px solid #FECACA', borderRadius: 12, overflow: 'hidden' }}>
        {/* Delete workspace — owner only */}
        {isOwner && (
          <div style={{ padding: '20px 24px', borderBottom: showLeaveConfirm ? 'none' : (!isOwner ? 'none' : '1px solid #FECACA') }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 24 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#DC2626', marginBottom: 6 }}>Delete workspace</div>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)', lineHeight: 1.6, maxWidth: 360 }}>
                  Permanently delete this workspace and all its projects, briefs, and tasks. This action cannot be undone.
                </div>
              </div>
              <button
                onClick={() => { setShowDeleteConfirm(true); setError(''); setConfirmName('') }}
                onMouseEnter={e => (e.currentTarget.style.background = '#FEF2F2')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                style={{
                  padding: '8px 16px', background: 'transparent', border: '1px solid #FECACA',
                  borderRadius: 9, cursor: 'pointer', fontFamily: 'var(--font-sans)',
                  fontSize: 13, fontWeight: 600, color: '#DC2626', flexShrink: 0, transition: 'all 0.15s',
                }}
              >
                Delete workspace
              </button>
            </div>

            {showDeleteConfirm && (
              <div style={{
                marginTop: 16, padding: 16,
                background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10,
              }}>
                <div style={{ fontSize: 13, color: '#991B1B', marginBottom: 10, lineHeight: 1.6, fontWeight: 500 }}>
                  This will permanently delete <strong>{workspace?.name}</strong>. Type the workspace name to confirm:
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    type="text" value={confirmName}
                    onChange={e => { setConfirmName(e.target.value); setError('') }}
                    placeholder={workspace?.name}
                    autoFocus
                    style={{
                      flex: 1, background: 'white', border: '1px solid #FECACA',
                      borderRadius: 9, padding: '8px 12px',
                      fontFamily: 'var(--font-sans)', fontSize: 13, outline: 'none', color: '#991B1B',
                    }}
                  />
                  <button
                    onClick={handleDelete}
                    disabled={deleting || confirmName !== workspace?.name}
                    style={{
                      padding: '8px 16px',
                      background: confirmName === workspace?.name ? '#DC2626' : '#FECACA',
                      color: 'white', border: 'none', borderRadius: 9,
                      cursor: confirmName === workspace?.name ? 'pointer' : 'not-allowed',
                      fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 700, flexShrink: 0, transition: 'all 0.15s',
                    }}
                  >
                    {deleting ? 'Deleting...' : 'Delete forever'}
                  </button>
                  <button
                    onClick={() => { setShowDeleteConfirm(false); setConfirmName(''); setError('') }}
                    style={{
                      padding: '8px 12px', background: 'transparent', border: '1px solid #FECACA',
                      borderRadius: 9, cursor: 'pointer', fontFamily: 'var(--font-sans)', fontSize: 13, color: '#991B1B',
                    }}
                  >
                    Cancel
                  </button>
                </div>
                {error && (
                  <div style={{ marginTop: 8, fontSize: 12, color: '#DC2626', display: 'flex', gap: 4, alignItems: 'center' }}>
                    <ExclamationCircleIcon style={{ width: 12, height: 12 }} />{error}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Leave workspace — non-owners */}
        {!isOwner && (
          <div style={{ padding: '20px 24px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 24 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--color-text)', marginBottom: 6 }}>Leave workspace</div>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)', lineHeight: 1.6, maxWidth: 360 }}>
                  Remove yourself from this workspace. You will lose access to all shared projects and briefs immediately.
                </div>
              </div>
              <button
                onClick={() => setShowLeaveConfirm(true)}
                style={{
                  padding: '8px 16px', background: 'transparent',
                  border: '1px solid var(--color-border)',
                  borderRadius: 9, cursor: 'pointer', fontFamily: 'var(--font-sans)',
                  fontSize: 13, fontWeight: 600, color: 'var(--color-text)', flexShrink: 0,
                }}
              >
                Leave workspace
              </button>
            </div>

            {showLeaveConfirm && (
              <div style={{
                marginTop: 14, padding: '14px 16px',
                background: 'var(--color-surface)', border: '1px solid var(--color-border)',
                borderRadius: 10, display: 'flex', alignItems: 'center',
                justifyContent: 'space-between', gap: 16,
              }}>
                <span style={{ fontSize: 13, color: 'var(--color-text)' }}>
                  Are you sure you want to leave <strong>{workspace?.name}</strong>?
                </span>
                <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                  <button
                    onClick={() => setShowLeaveConfirm(false)}
                    style={{
                      padding: '6px 14px', background: 'transparent',
                      border: '1px solid var(--color-border)', borderRadius: 8,
                      cursor: 'pointer', fontFamily: 'var(--font-sans)',
                      fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)',
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleLeave}
                    disabled={leaving}
                    style={{
                      padding: '6px 14px', background: '#DC2626', color: 'white',
                      border: 'none', borderRadius: 8, cursor: 'pointer',
                      fontFamily: 'var(--font-sans)', fontSize: 12, fontWeight: 700,
                    }}
                  >
                    {leaving ? 'Leaving...' : 'Yes, leave'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Nav config ────────────────────────────────────────────────────────────────

const NAV = [
  {
    group: 'Account',
    items: [
      { id: 'profile',    label: 'Profile',    icon: UserIcon },
      { id: 'appearance', label: 'Appearance', icon: SwatchIcon },
    ],
  },
  {
    group: 'Workspace',
    items: [
      { id: 'general', label: 'General',        icon: Cog6ToothIcon },
      { id: 'plans',   label: 'Plans & credits', icon: BoltIcon },
      { id: 'danger',  label: 'Danger zone',    icon: ExclamationTriangleIcon },
    ],
  },
]

// ── Main SettingsPage ─────────────────────────────────────────────────────────

export default function SettingsPage({ onClose }) {
  const [activeSection, setActiveSection] = useState('profile')

  // Close on Escape
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  function renderSection() {
    switch (activeSection) {
      case 'profile':    return <ProfileSection />
      case 'appearance': return <AppearanceSection />
      case 'general':    return <WorkspaceGeneralSection />
      case 'plans':      return <PlansSection />
      case 'danger':
        return (
          <DangerSection
            onWorkspaceDeleted={() => supabase.auth.signOut().then(() => window.location.reload())}
            onWorkspaceLeft={() => window.location.reload()}
          />
        )
      default: return <ProfileSection />
    }
  }

  return (
    <>
      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <div style={{
        position: 'fixed', inset: 0,
        background: 'var(--color-bg)', zIndex: 500,
        display: 'flex', flexDirection: 'column',
        fontFamily: 'var(--font-sans)',
        animation: 'slideUp 0.2s ease',
      }}>
        {/* Top bar */}
        <div style={{
          height: 52, borderBottom: '1px solid var(--color-border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 28px', flexShrink: 0, background: 'var(--color-card)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#7C3AED' }} />
            <span style={{ fontWeight: 700, fontSize: 15, letterSpacing: '-0.02em', color: 'var(--color-text)' }}>
              Settings
            </span>
          </div>
          <button
            onClick={onClose}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--color-text)'; e.currentTarget.style.borderColor = 'var(--color-border-strong, #555)' }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--color-text-muted)'; e.currentTarget.style.borderColor = 'var(--color-border)' }}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '6px 12px', background: 'transparent',
              border: '1px solid var(--color-border)', borderRadius: 8,
              cursor: 'pointer', fontFamily: 'var(--font-sans)',
              fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)', transition: 'all 0.15s',
            }}
          >
            <XMarkIcon style={{ width: 14, height: 14 }} />
            Close
          </button>
        </div>

        {/* Body: left nav + content */}
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '220px 1fr', overflow: 'hidden' }}>
          {/* Left nav */}
          <div style={{
            borderRight: '1px solid var(--color-border)',
            background: 'var(--color-surface)',
            padding: '16px 0',
            overflowY: 'auto',
          }}>
            {NAV.map(group => (
              <div key={group.group}>
                <div style={{
                  fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700,
                  letterSpacing: '0.08em', textTransform: 'uppercase',
                  color: 'var(--color-text-muted)', padding: '12px 18px 6px',
                }}>
                  {group.group}
                </div>
                {group.items.map(item => {
                  const Icon = item.icon
                  const isActive = activeSection === item.id
                  const isDanger = item.id === 'danger'
                  return (
                    <button
                      key={item.id}
                      onClick={() => setActiveSection(item.id)}
                      onMouseEnter={e => {
                        if (!isActive) {
                          e.currentTarget.style.background = 'var(--color-card)'
                          e.currentTarget.style.color = isDanger ? '#DC2626' : 'var(--color-text)'
                        }
                      }}
                      onMouseLeave={e => {
                        if (!isActive) {
                          e.currentTarget.style.background = 'transparent'
                          e.currentTarget.style.color = 'var(--color-text-muted)'
                        }
                      }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 9,
                        padding: '8px 14px', margin: '1px 8px',
                        width: 'calc(100% - 16px)',
                        background: isActive ? 'var(--color-card)' : 'transparent',
                        border: 'none', borderRadius: 8, cursor: 'pointer',
                        fontFamily: 'var(--font-sans)', fontSize: 13,
                        fontWeight: isActive ? 700 : 400,
                        color: isActive
                          ? (isDanger ? '#DC2626' : 'var(--color-text)')
                          : 'var(--color-text-muted)',
                        textAlign: 'left', transition: 'all 0.15s',
                      }}
                    >
                      <Icon style={{
                        width: 15, height: 15, flexShrink: 0,
                        color: isActive ? (isDanger ? '#DC2626' : '#7C3AED') : 'inherit',
                      }} />
                      {item.label}
                    </button>
                  )
                })}
              </div>
            ))}
          </div>

          {/* Content area */}
          <div style={{ overflowY: 'auto', padding: '36px 48px', maxWidth: 760, width: '100%', boxSizing: 'border-box' }}>
            {renderSection()}
          </div>
        </div>
      </div>
    </>
  )
}
