import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useApp } from '../context/AppContext'
import { supabase } from '../lib/supabase'
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
  ComputerDesktopIcon,
  ArrowLeftIcon,
  LinkIcon,
  TrashIcon,
  CameraIcon,
  ArrowUpTrayIcon,
} from '@heroicons/react/24/outline'
import Connectors from './Connectors'

function PanelLeftClose({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect width="18" height="18" x="3" y="3" rx="2" />
      <path d="M9 3v18" />
      <path d="m16 15-3-3 3-3" />
    </svg>
  )
}

// ── Mobile hook ───────────────────────────────────────────────────────────────

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 640)
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 640)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])
  return isMobile
}

// ── SettingRow layout ─────────────────────────────────────────────────────────

function SettingRow({ label, description, children, stretch = false }) {
  const isMobile = useIsMobile()
  return (
    <div style={{
      display: 'flex',
      flexDirection: isMobile ? 'column' : 'row',
      alignItems: isMobile ? 'flex-start' : 'center',
      justifyContent: 'space-between',
      gap: isMobile ? 12 : 32,
      padding: '20px 0',
      borderBottom: '1px solid var(--color-border)',
    }}>
      <div style={{ maxWidth: isMobile ? 'none' : 340, width: isMobile ? '100%' : 'auto', flexShrink: 0 }}>
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
      <div style={{
        flex: stretch ? 1 : undefined,
        flexShrink: stretch ? undefined : 0,
        minWidth: stretch ? 0 : undefined,
        width: isMobile ? '100%' : (stretch ? undefined : 'auto'),
      }}>{children}</div>
    </div>
  )
}

// ── Save button with animated checkmark ──────────────────────────────────────

function SaveButton({ saving, saved, disabled, onClick, label = 'Update' }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || saving}
      style={{
        position: 'relative',
        padding: '8px 18px',
        background: saved
          ? 'rgba(22,163,74,0.1)'
          : saving
            ? 'var(--color-surface)'
            : 'var(--color-surface)',
        border: '1px solid ' + (saved ? 'rgba(22,163,74,0.4)' : 'var(--color-border)'),
        borderRadius: 9,
        cursor: (disabled || saving) ? 'not-allowed' : 'pointer',
        fontFamily: 'var(--font-sans)',
        fontSize: 13,
        fontWeight: 600,
        color: saved ? '#16a34a' : 'var(--color-text)',
        transition: 'all 0.2s ease',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        overflow: 'hidden',
        minWidth: 80,
        justifyContent: 'center',
      }}
    >
      {saving ? (
        <>
          <span style={{
            display: 'inline-block',
            width: 11, height: 11,
            border: '2px solid var(--color-border)',
            borderTopColor: '#7C3AED',
            borderRadius: '50%',
            animation: 'settingsSpin 0.6s linear infinite',
            flexShrink: 0,
          }} />
          Saving
        </>
      ) : saved ? (
        <>
          <span style={{ animation: 'settingsCheckPop 0.3s ease', display: 'flex' }}>
            <CheckCircleIcon style={{ width: 13, height: 13, color: '#16a34a' }} />
          </span>
          Saved!
        </>
      ) : (
        label
      )}
    </button>
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

function ProfileSection({ callSettings, onSaved }) {
  const isMobile = useIsMobile()
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

  // Avatar — read from auth.user_metadata so it survives refreshes and
  // appears immediately for every component subscribed to authUser.
  const avatarUrl = authUser?.user_metadata?.avatar_url || ''
  const [avatarBusy, setAvatarBusy] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [avatarError, setAvatarError] = useState('')
  const fileInputRef = useRef(null)

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
      onSaved?.('Display name updated')
      setTimeout(() => setSaved(false), 3000)
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleAvatarFile(file) {
    if (!file || !authUser?.id) return
    setAvatarError('')
    if (!file.type?.startsWith('image/')) {
      setAvatarError('Please choose an image file (PNG, JPG, GIF, WebP).')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setAvatarError('Image is too large (max 5 MB).')
      return
    }
    setAvatarBusy(true)
    setUploadProgress(0)
    try {
      const ext = (file.name.split('.').pop() || 'png').toLowerCase().slice(0, 5)
      const path = `${authUser.id}/${Date.now()}.${ext}`

      // Fresh access token for the storage REST call
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) throw new Error('Session expired')
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
      if (!supabaseUrl) throw new Error('Supabase URL not configured')

      // POST to storage REST directly so we can track real upload progress
      // via XMLHttpRequest. The supabase-js upload() doesn't expose progress.
      await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.open('POST', `${supabaseUrl}/storage/v1/object/avatars/${path}`)
        xhr.setRequestHeader('Authorization', `Bearer ${token}`)
        xhr.setRequestHeader('Content-Type', file.type)
        xhr.setRequestHeader('x-upsert', 'true')
        xhr.setRequestHeader('cache-control', '3600')
        xhr.upload.addEventListener('progress', e => {
          if (e.lengthComputable) {
            // Cap visible progress at 95% during transfer — the last 5% is
            // reserved for the server-side write + the user_metadata patch.
            setUploadProgress(Math.min(95, Math.round((e.loaded / e.total) * 95)))
          }
        })
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve()
          else reject(new Error(xhr.responseText || `Upload failed (${xhr.status})`))
        }
        xhr.onerror = () => reject(new Error('Network error during upload'))
        xhr.send(file)
      })

      setUploadProgress(97)
      const { data } = supabase.storage.from('avatars').getPublicUrl(path)
      // Bust browser cache so the new image shows immediately
      const publicUrl = data?.publicUrl ? `${data.publicUrl}?v=${Date.now()}` : null
      if (!publicUrl) throw new Error('Could not resolve public URL')

      await callSettings({ action: 'update_avatar', avatarUrl: publicUrl })
      try { await supabase.auth.refreshSession() } catch {}
      setUploadProgress(100)
      onSaved?.('Profile photo updated')
      // Brief 100% flash before clearing the bar
      setTimeout(() => setUploadProgress(0), 600)
    } catch (e) {
      console.error('[avatar upload]', e)
      setAvatarError(e.message || 'Upload failed')
      setUploadProgress(0)
    } finally {
      setAvatarBusy(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function handleRemoveAvatar() {
    if (!avatarUrl) return
    setAvatarBusy(true)
    setAvatarError('')
    try {
      await callSettings({ action: 'remove_avatar' })
      try { await supabase.auth.refreshSession() } catch {}
      onSaved?.('Profile photo removed')
    } catch (e) {
      setAvatarError(e.message || 'Could not remove photo')
    } finally {
      setAvatarBusy(false)
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

      {/* Avatar preview + upload */}
      <div style={{
        display: 'flex',
        flexDirection: isMobile ? 'column' : 'row',
        alignItems: isMobile ? 'flex-start' : 'center',
        gap: isMobile ? 14 : 16,
        padding: '16px 0 20px', borderBottom: '1px solid var(--color-border)',
      }}>
        {/* Avatar circle — clickable to upload */}
        <div
          onClick={() => !avatarBusy && fileInputRef.current?.click()}
          style={{
            position: 'relative',
            width: 72, height: 72, borderRadius: '50%',
            background: avatarUrl ? 'var(--color-surface)' : 'linear-gradient(135deg, #7C3AED, #A855F7)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'var(--font-sans)', fontWeight: 800, fontSize: 26,
            color: 'white', flexShrink: 0, letterSpacing: '-0.02em',
            cursor: avatarBusy ? 'wait' : 'pointer',
            overflow: 'hidden',
            border: '1px solid var(--color-border)',
            transition: 'transform 0.15s',
          }}
          title="Change profile photo"
          onMouseEnter={e => { if (!avatarBusy) e.currentTarget.style.transform = 'scale(1.02)' }}
          onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)' }}
        >
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={name || 'Profile'}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              onError={e => { e.currentTarget.style.display = 'none' }}
            />
          ) : (
            <span>{initials}</span>
          )}
          {/* Hover overlay with camera */}
          <div style={{
            position: 'absolute', inset: 0, borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: avatarBusy ? 'rgba(0,0,0,0.45)' : 'rgba(0,0,0,0)',
            opacity: avatarBusy ? 1 : 0,
            transition: 'background 0.15s, opacity 0.15s',
            pointerEvents: 'none',
          }} className="avatar-overlay">
            <CameraIcon style={{ width: 22, height: 22, color: 'white' }} />
          </div>
        </div>

        {/* Name / email + action buttons */}
        <div style={{ flex: 1, minWidth: 0, width: isMobile ? '100%' : 'auto' }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--color-text)', marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {name || 'Your name'}
          </div>
          <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {email}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={avatarBusy}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '7px 12px',
                background: '#7C3AED', color: 'white',
                border: 'none', borderRadius: 8,
                cursor: avatarBusy ? 'not-allowed' : 'pointer',
                fontFamily: 'var(--font-sans)', fontSize: 12, fontWeight: 700,
                opacity: avatarBusy ? 0.6 : 1,
              }}
            >
              <ArrowUpTrayIcon style={{ width: 12, height: 12 }} />
              {avatarUrl ? 'Change photo' : 'Upload photo'}
            </button>
            {avatarUrl && (
              <button
                type="button"
                onClick={handleRemoveAvatar}
                disabled={avatarBusy}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '7px 12px',
                  background: 'transparent', color: '#DC2626',
                  border: '1px solid rgba(220,38,38,0.3)', borderRadius: 8,
                  cursor: avatarBusy ? 'not-allowed' : 'pointer',
                  fontFamily: 'var(--font-sans)', fontSize: 12, fontWeight: 600,
                  transition: 'all 0.15s',
                }}
                onMouseEnter={e => { if (!avatarBusy) { e.currentTarget.style.background = 'rgba(220,38,38,0.08)'; e.currentTarget.style.borderColor = '#DC2626' } }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'rgba(220,38,38,0.3)' }}
              >
                <TrashIcon style={{ width: 12, height: 12 }} />
                Remove
              </button>
            )}
          </div>
          {/* Upload progress — shows real percentage tracked via XHR */}
          {avatarBusy && uploadProgress > 0 && (
            <div style={{ marginTop: 10 }}>
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                fontSize: 11, color: 'var(--color-text-muted)', marginBottom: 4,
                fontFamily: 'var(--font-mono)', fontWeight: 600, letterSpacing: '0.04em',
              }}>
                <span>UPLOADING</span>
                <span>{uploadProgress}%</span>
              </div>
              <div style={{
                width: '100%', height: 6, borderRadius: 999,
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                overflow: 'hidden',
              }}>
                <div style={{
                  width: `${uploadProgress}%`, height: '100%',
                  background: 'linear-gradient(90deg, #7C3AED, #A855F7)',
                  transition: 'width 0.18s ease',
                  borderRadius: 999,
                }} />
              </div>
            </div>
          )}
          {avatarError && (
            <div style={{
              fontSize: 12, color: '#DC2626', marginTop: 8,
              display: 'flex', gap: 4, alignItems: 'center',
            }}>
              <ExclamationCircleIcon style={{ width: 12, height: 12, flexShrink: 0 }} />
              {avatarError}
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/jpg,image/gif,image/webp"
            onChange={e => handleAvatarFile(e.target.files?.[0])}
            style={{ display: 'none' }}
          />
        </div>
      </div>

      {/* Display name */}
      <SettingRow
        label="Display name"
        description="This is how your name appears to teammates in shared workspaces and project boards."
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="text" value={name}
              onChange={e => { setName(e.target.value); setError(''); setSaved(false) }}
              onKeyDown={e => { if (e.key === 'Enter') handleUpdateName() }}
              placeholder="Your name"
              style={{ ...inputBase, flex: 1, minWidth: 0 }}
              onFocus={focusInput} onBlur={blurInput}
            />
            <SaveButton
              saving={saving}
              saved={saved}
              disabled={!name.trim()}
              onClick={handleUpdateName}
            />
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
        stretch
      >
        <input
          type="email" value={email} readOnly
          style={{ ...inputBase, width: '100%', color: 'var(--color-text-muted)', cursor: 'default', boxSizing: 'border-box' }}
        />
      </SettingRow>
    </div>
  )
}

// ── Section: Appearance ───────────────────────────────────────────────────────

function AppearanceSection({ onSaved }) {
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
        description="Choose your preferred colour theme. Device follows your system setting automatically."
      >
        <div style={{ display: 'flex', gap: 8 }}>
          {[
            { value: 'light',  label: 'Light',  icon: SunIcon },
            { value: 'dark',   label: 'Dark',   icon: MoonIcon },
            { value: 'system', label: 'Device', icon: ComputerDesktopIcon },
          ].map(opt => {
            const Icon = opt.icon
            const isSelected = theme === opt.value
            return (
              <button
                key={opt.value}
                onClick={() => { setTheme(opt.value); onSaved?.(opt.label + ' theme applied') }}
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

function WorkspaceGeneralSection({ callSettings, onSaved }) {
  const isMobile = useIsMobile()
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
      setWorkspace(prev => {
        const updated = { ...prev, name: wsName.trim() }
        localStorage.setItem('db-workspace', JSON.stringify(updated))
        return updated
      })
      setSaved(true)
      onSaved?.('Workspace name updated')
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="text" value={wsName}
              onChange={e => { setWsName(e.target.value); setError(''); setSaved(false) }}
              onKeyDown={e => { if (e.key === 'Enter') handleUpdateName() }}
              placeholder="Workspace name"
              style={{ ...inputBase, flex: 1, minWidth: 0 }}
              onFocus={focusInput} onBlur={blurInput}
            />
            <SaveButton
              saving={saving}
              saved={saved}
              disabled={!wsName.trim() || wsName.trim() === workspace?.name}
              onClick={handleUpdateName}
            />
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: 12,
            background: 'var(--color-surface)', border: '1px solid var(--color-border)',
            borderRadius: 9, padding: '8px 12px', color: 'var(--color-text-muted)',
            flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
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
  const isMobile = useIsMobile()
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
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: isMobile ? 'flex-start' : 'flex-end', gap: 10, width: isMobile ? '100%' : 'auto' }}>
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
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: isMobile ? 'flex-start' : 'flex-end', gap: 8, width: isMobile ? '100%' : 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
            <span style={{ fontWeight: 700, fontSize: 20, letterSpacing: '-0.03em', color: 'var(--color-text)', fontFamily: 'var(--font-sans)' }}>
              {creditsUsed}
            </span>
            <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
              / {creditsLimit} used today
            </span>
          </div>
          <div style={{ width: isMobile ? '100%' : 200, height: 6, background: 'var(--color-border)', borderRadius: 99, overflow: 'hidden' }}>
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

function DangerSection({ callSettings, onWorkspaceDeleted, onWorkspaceLeft, onAccountDeleted }) {
  const isMobile = useIsMobile()
  const { workspace, authUser, setWorkspace, loadWorkspace } = useApp()
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false)
  const [showDeleteAccountConfirm, setShowDeleteAccountConfirm] = useState(false)
  const [confirmName, setConfirmName] = useState('')
  const [confirmEmail, setConfirmEmail] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [deletingAccount, setDeletingAccount] = useState(false)
  const [error, setError] = useState('')
  const [isOwner, setIsOwner] = useState(false)
  const [userWorkspaces, setUserWorkspaces] = useState([])

  useEffect(() => {
    async function checkRoleAndWorkspaces() {
      if (!workspace?.id || !authUser?.id) return
      const { data: roleData } = await supabase
        .from('workspace_members')
        .select('role')
        .eq('workspace_id', workspace.id)
        .eq('user_id', authUser.id)
        .single()
      setIsOwner(roleData?.role === 'owner')

      // Load all workspaces this user belongs to
      try {
        const { data: memberships } = await supabase
          .from('workspace_members')
          .select('workspace_id, workspaces(*)')
          .eq('user_id', authUser.id)
        setUserWorkspaces((memberships || []).map(m => m.workspaces).filter(Boolean))
      } catch {}
    }
    checkRoleAndWorkspaces()
  }, [workspace?.id, authUser?.id])

  async function handleDelete() {
    if (confirmName !== workspace?.name) { setError('Workspace name does not match'); return }
    setDeleting(true); setError('')
    try {
      await callSettings({ action: 'delete_workspace', workspaceId: workspace.id, confirmName })

      // Switch to most recently visited other workspace
      const history = (() => {
        try { return JSON.parse(localStorage.getItem('db-workspace-history') || '[]') } catch { return [] }
      })()
      const nextId = history.find(id => id !== workspace.id)
      const nextWs = nextId
        ? userWorkspaces.find(w => w.id === nextId)
        : userWorkspaces.find(w => w.id !== workspace.id)

      if (nextWs) {
        localStorage.setItem('db-workspace', JSON.stringify(nextWs))
        const hist = [nextWs.id, ...history.filter(id => id !== nextWs.id)].slice(0, 20)
        localStorage.setItem('db-workspace-history', JSON.stringify(hist))
        setWorkspace(nextWs)
        onWorkspaceDeleted?.()
      } else {
        // No other workspace — clear and reload so WorkspaceSetup shows
        localStorage.removeItem('db-workspace')
        window.location.reload()
      }
    } catch (e) {
      setError(e.message)
      setDeleting(false)
    }
  }

  async function handleLeave() {
    setLeaving(true); setError('')
    try {
      await callSettings({ action: 'leave_workspace', workspaceId: workspace.id })

      // Switch to most recently visited other workspace
      const history = (() => {
        try { return JSON.parse(localStorage.getItem('db-workspace-history') || '[]') } catch { return [] }
      })()
      const nextId = history.find(id => id !== workspace.id)
      const nextWs = nextId
        ? userWorkspaces.find(w => w.id === nextId)
        : userWorkspaces.find(w => w.id !== workspace.id)

      if (nextWs) {
        localStorage.setItem('db-workspace', JSON.stringify(nextWs))
        const hist = [nextWs.id, ...history.filter(id => id !== nextWs.id)].slice(0, 20)
        localStorage.setItem('db-workspace-history', JSON.stringify(hist))
        setWorkspace(nextWs)
        onWorkspaceLeft?.()
      } else {
        // No other workspace — clear and reload so WorkspaceSetup shows
        localStorage.removeItem('db-workspace')
        window.location.reload()
      }
    } catch (e) {
      setError(e.message)
      setLeaving(false)
    }
  }

  async function handleDeleteAccount() {
    if (confirmEmail.toLowerCase() !== authUser?.email?.toLowerCase()) {
      setError('Email address does not match')
      return
    }
    setDeletingAccount(true); setError('')
    try {
      await callSettings({ action: 'delete_account' })
      // Token is now invalid — clear everything and redirect to login
      localStorage.clear()
      window.location.href = '/'
    } catch (e) {
      setError(e.message)
      setDeletingAccount(false)
    }
  }

  const RED = '#DC2626'

  return (
    <div>
      <h1 style={{ fontWeight: 800, fontSize: 22, letterSpacing: '-0.04em', color: 'var(--color-text)', margin: '0 0 4px' }}>
        Danger zone
      </h1>
      <p style={{ fontSize: 13, color: 'var(--color-text-muted)', margin: '0 0 28px', lineHeight: 1.6 }}>
        Irreversible and destructive actions. Please proceed with caution.
      </p>

      {/* ── Workspace actions card ── */}
      <div style={{ border: `1px solid ${RED}`, borderRadius: 12, overflow: 'hidden', marginBottom: 16 }}>

        {/* Delete workspace — owner only */}
        {isOwner && (
          <div style={{ padding: '20px 24px' }}>
            <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: isMobile ? 12 : 24 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14, color: userWorkspaces.length <= 1 ? 'var(--color-text-muted)' : RED, marginBottom: 6 }}>Delete workspace</div>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)', lineHeight: 1.6, maxWidth: 360 }}>
                  {userWorkspaces.length <= 1
                    ? 'You must belong to more than one workspace before you can delete this one.'
                    : 'Permanently delete this workspace and all its projects, briefs, and tasks. This action cannot be undone.'}
                </div>
              </div>
              <button
                onClick={() => { if (userWorkspaces.length > 1) { setShowDeleteConfirm(true); setError(''); setConfirmName('') } }}
                onMouseEnter={e => { if (userWorkspaces.length > 1) e.currentTarget.style.background = 'rgba(220,38,38,0.08)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                disabled={userWorkspaces.length <= 1}
                style={{
                  padding: '8px 16px', background: 'transparent',
                  border: `1px solid ${userWorkspaces.length <= 1 ? 'var(--color-border)' : RED}`,
                  borderRadius: 9,
                  cursor: userWorkspaces.length <= 1 ? 'not-allowed' : 'pointer',
                  fontFamily: 'var(--font-sans)',
                  fontSize: 13, fontWeight: 600,
                  color: userWorkspaces.length <= 1 ? 'var(--color-text-muted)' : RED,
                  flexShrink: 0, transition: 'all 0.15s',
                  width: isMobile ? '100%' : 'auto',
                  opacity: userWorkspaces.length <= 1 ? 0.5 : 1,
                }}
              >
                Delete workspace
              </button>
            </div>

            {showDeleteConfirm && (
              <div style={{
                marginTop: 16, padding: 16,
                background: 'rgba(220,38,38,0.08)', border: `1px solid ${RED}`, borderRadius: 10,
              }}>
                <div style={{ fontSize: 13, color: RED, marginBottom: 10, lineHeight: 1.6, fontWeight: 500 }}>
                  This will permanently delete <strong>{workspace?.name}</strong>. Type the workspace name to confirm:
                </div>
                <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 8 }}>
                  <input
                    type="text" value={confirmName}
                    onChange={e => { setConfirmName(e.target.value); setError('') }}
                    placeholder={workspace?.name}
                    autoFocus
                    style={{
                      flex: 1, background: 'var(--color-surface)', border: `1px solid ${RED}`,
                      borderRadius: 9, padding: '8px 12px',
                      fontFamily: 'var(--font-sans)', fontSize: 13, outline: 'none',
                      color: 'var(--color-text)',
                    }}
                  />
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={handleDelete}
                      disabled={deleting || confirmName !== workspace?.name}
                      style={{
                        flex: isMobile ? 1 : 'none', padding: '8px 16px',
                        background: confirmName === workspace?.name ? RED : 'rgba(220,38,38,0.25)',
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
                        flex: isMobile ? 1 : 'none', padding: '8px 12px', background: 'transparent', border: `1px solid ${RED}`,
                        borderRadius: 9, cursor: 'pointer', fontFamily: 'var(--font-sans)', fontSize: 13, color: RED,
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
                {error && (
                  <div style={{ marginTop: 8, fontSize: 12, color: RED, display: 'flex', gap: 4, alignItems: 'center' }}>
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
            <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: isMobile ? 12 : 24 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14, color: userWorkspaces.length <= 1 ? 'var(--color-text-muted)' : RED, marginBottom: 6 }}>Leave workspace</div>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)', lineHeight: 1.6, maxWidth: 360 }}>
                  {userWorkspaces.length <= 1
                    ? 'You must belong to more than one workspace before you can leave this one.'
                    : 'Remove yourself from this workspace. You will lose access to all shared projects and briefs immediately.'}
                </div>
              </div>
              <button
                onClick={() => { if (userWorkspaces.length > 1) { setShowLeaveConfirm(true); setError('') } }}
                onMouseEnter={e => { if (userWorkspaces.length > 1) e.currentTarget.style.background = 'rgba(220,38,38,0.08)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                disabled={userWorkspaces.length <= 1}
                style={{
                  padding: '8px 16px', background: 'transparent',
                  border: `1px solid ${userWorkspaces.length <= 1 ? 'var(--color-border)' : RED}`,
                  borderRadius: 9,
                  cursor: userWorkspaces.length <= 1 ? 'not-allowed' : 'pointer',
                  fontFamily: 'var(--font-sans)',
                  fontSize: 13, fontWeight: 600,
                  color: userWorkspaces.length <= 1 ? 'var(--color-text-muted)' : RED,
                  flexShrink: 0, transition: 'all 0.15s',
                  width: isMobile ? '100%' : 'auto',
                  opacity: userWorkspaces.length <= 1 ? 0.5 : 1,
                }}
              >
                Leave workspace
              </button>
            </div>

            {showLeaveConfirm && (
              <div style={{
                marginTop: 14, padding: '14px 16px',
                background: 'rgba(220,38,38,0.08)', border: `1px solid ${RED}`,
                borderRadius: 10, display: 'flex', flexDirection: isMobile ? 'column' : 'row',
                alignItems: isMobile ? 'flex-start' : 'center',
                justifyContent: 'space-between', gap: 12,
              }}>
                <span style={{ fontSize: 13, color: 'var(--color-text)' }}>
                  Are you sure you want to leave <strong>{workspace?.name}</strong>?
                </span>
                <div style={{ display: 'flex', gap: 8, flexShrink: 0, width: isMobile ? '100%' : 'auto' }}>
                  <button
                    onClick={() => setShowLeaveConfirm(false)}
                    style={{
                      flex: isMobile ? 1 : 'none', padding: '6px 14px', background: 'transparent',
                      border: `1px solid ${RED}`, borderRadius: 8,
                      cursor: 'pointer', fontFamily: 'var(--font-sans)',
                      fontSize: 12, fontWeight: 600, color: RED,
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleLeave}
                    disabled={leaving}
                    style={{
                      flex: isMobile ? 1 : 'none', padding: '6px 14px', background: RED, color: 'white',
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

      {/* ── Account actions card ── */}
      <div style={{ border: `1px solid ${RED}`, borderRadius: 12, overflow: 'hidden' }}>

        {/* Delete account — all users */}
        <div style={{ padding: '20px 24px' }}>
          <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: isMobile ? 12 : 24 }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, color: RED, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                <TrashIcon style={{ width: 14, height: 14 }} />
                Delete account
              </div>
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)', lineHeight: 1.6, maxWidth: 360 }}>
                Permanently delete your account and all associated data. You will be signed out immediately and cannot recover your account.
              </div>
            </div>
            <button
              onClick={() => { setShowDeleteAccountConfirm(true); setError(''); setConfirmEmail('') }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(220,38,38,0.08)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              style={{
                padding: '8px 16px', background: 'transparent', border: `1px solid ${RED}`,
                borderRadius: 9, cursor: 'pointer', fontFamily: 'var(--font-sans)',
                fontSize: 13, fontWeight: 600, color: RED, flexShrink: 0, transition: 'all 0.15s',
                width: isMobile ? '100%' : 'auto',
              }}
            >
              Delete account
            </button>
          </div>

          {showDeleteAccountConfirm && (
            <div style={{
              marginTop: 16, padding: 16,
              background: 'rgba(220,38,38,0.08)', border: `1px solid ${RED}`, borderRadius: 10,
            }}>
              <div style={{ fontSize: 13, color: RED, marginBottom: 10, lineHeight: 1.6, fontWeight: 500 }}>
                This will permanently delete your account. Type your email <strong>{authUser?.email}</strong> to confirm:
              </div>
              <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 8 }}>
                <input
                  type="email" value={confirmEmail}
                  onChange={e => { setConfirmEmail(e.target.value); setError('') }}
                  placeholder={authUser?.email}
                  autoFocus
                  style={{
                    flex: 1, background: 'var(--color-surface)', border: `1px solid ${RED}`,
                    borderRadius: 9, padding: '8px 12px',
                    fontFamily: 'var(--font-sans)', fontSize: 13, outline: 'none',
                    color: 'var(--color-text)',
                  }}
                />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={handleDeleteAccount}
                    disabled={deletingAccount || confirmEmail.toLowerCase() !== authUser?.email?.toLowerCase()}
                    style={{
                      flex: isMobile ? 1 : 'none', padding: '8px 16px',
                      background: confirmEmail.toLowerCase() === authUser?.email?.toLowerCase() ? RED : 'rgba(220,38,38,0.25)',
                      color: 'white', border: 'none', borderRadius: 9,
                      cursor: confirmEmail.toLowerCase() === authUser?.email?.toLowerCase() ? 'pointer' : 'not-allowed',
                      fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 700, flexShrink: 0, transition: 'all 0.15s',
                    }}
                  >
                    {deletingAccount ? 'Deleting...' : 'Delete forever'}
                  </button>
                  <button
                    onClick={() => { setShowDeleteAccountConfirm(false); setConfirmEmail(''); setError('') }}
                    style={{
                      flex: isMobile ? 1 : 'none', padding: '8px 12px', background: 'transparent', border: `1px solid ${RED}`,
                      borderRadius: 9, cursor: 'pointer', fontFamily: 'var(--font-sans)', fontSize: 13, color: RED,
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
              {error && (
                <div style={{ marginTop: 8, fontSize: 12, color: RED, display: 'flex', gap: 4, alignItems: 'center' }}>
                  <ExclamationCircleIcon style={{ width: 12, height: 12 }} />{error}
                </div>
              )}
            </div>
          )}
        </div>

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
      { id: 'general',    label: 'General',        icon: Cog6ToothIcon },
      { id: 'plans',      label: 'Plans & credits', icon: BoltIcon },
      { id: 'connectors', label: 'Connectors',      icon: LinkIcon },
      { id: 'danger',     label: 'Danger zone',     icon: ExclamationTriangleIcon },
    ],
  },
]

function getSectionLabel(id) {
  for (const group of NAV) {
    const item = group.items.find(i => i.id === id)
    if (item) return item.label
  }
  return 'Settings'
}

// ── Main SettingsPage ─────────────────────────────────────────────────────────

export default function SettingsPage({ onClose, onOpenSidebar }) {
  const isMobile = useIsMobile()
  const { session } = useApp()
  const [activeSection, setActiveSection] = useState('profile')
  const [mobileView, setMobileView] = useState('nav') // 'nav' | 'content'
  const [toast, setToast] = useState(null) // { msg, key }
  const [toastExiting, setToastExiting] = useState(false)
  const toastTimer = useRef(null)
  const toastExitTimer = useRef(null)

  function showSaveToast(msg = 'Changes saved') {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    if (toastExitTimer.current) clearTimeout(toastExitTimer.current)
    setToastExiting(false)
    setToast({ msg, key: Date.now() })
    toastTimer.current = setTimeout(() => {
      setToastExiting(true)
      toastExitTimer.current = setTimeout(() => {
        setToast(null)
        setToastExiting(false)
      }, 320)
    }, 2800)
  }

  // Close on Escape
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function callSettings(body) {
    // Start with the token we already have in context (always up-to-date via onAuthStateChange)
    let token = session?.access_token

    // If context token is missing, race getSession() against a 2s timeout so we
    // never hang indefinitely waiting for a stalled token-refresh network call.
    if (!token) {
      token = await Promise.race([
        supabase.auth.getSession().then(({ data }) => data?.session?.access_token ?? null),
        new Promise(resolve => setTimeout(() => resolve(null), 2000)),
      ])
    }

    if (!token) throw new Error('Session expired — please sign out and sign back in.')

    // Abort the fetch after 20 s so the button never spins forever
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 20000)
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify(body),
        signal: controller.signal,
      })
      clearTimeout(timer)
      let data = {}
      try { data = await res.json() } catch {}
      if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`)
      return data
    } catch (e) {
      clearTimeout(timer)
      if (e.name === 'AbortError') throw new Error('Request timed out — please try again.')
      throw e
    }
  }

  function renderSection() {
    switch (activeSection) {
      case 'profile':    return <ProfileSection callSettings={callSettings} onSaved={showSaveToast} />
      case 'appearance': return <AppearanceSection onSaved={showSaveToast} />
      case 'general':    return <WorkspaceGeneralSection callSettings={callSettings} onSaved={showSaveToast} />
      case 'plans':      return <PlansSection />
      case 'connectors': return <Connectors embedded />
      case 'danger':
        return (
          <DangerSection
            callSettings={callSettings}
            onWorkspaceDeleted={() => { localStorage.removeItem('db-workspace'); supabase.auth.signOut().then(() => window.location.reload()) }}
            onWorkspaceLeft={() => { /* workspace switch handled inside handleLeave */ }}
            onAccountDeleted={() => { /* handled inside handleDeleteAccount — localStorage cleared, redirected to / */ }}
          />
        )
      default: return <ProfileSection callSettings={callSettings} onSaved={showSaveToast} />
    }
  }

  return (
    <>
      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes settingsSpin {
          to { transform: rotate(360deg); }
        }
        @keyframes settingsCheckPop {
          0%   { transform: scale(0.4); opacity: 0; }
          60%  { transform: scale(1.25); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
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
          display: 'flex', alignItems: 'center',
          padding: '0 16px', flexShrink: 0, background: 'var(--color-card)',
          position: 'relative',
        }}>
          {/* Left action */}
          {isMobile ? (
            mobileView === 'content' ? (
              <button
                onClick={() => setMobileView('nav')}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: '6px 8px', background: 'transparent',
                  border: 'none', borderRadius: 8,
                  cursor: 'pointer', fontFamily: 'var(--font-sans)',
                  fontSize: 13, fontWeight: 600, color: 'var(--color-text-muted)',
                  transition: 'all 0.15s',
                }}
              >
                <ArrowLeftIcon style={{ width: 15, height: 15 }} />
                Back
              </button>
            ) : (
              <button
                onClick={onOpenSidebar || onClose}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  padding: '6px 8px', background: 'transparent',
                  border: 'none', borderRadius: 8,
                  cursor: 'pointer', color: 'var(--color-text-muted)', transition: 'all 0.15s',
                }}
              >
                <PanelLeftClose size={18} />
              </button>
            )
          ) : (
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
              <ArrowLeftIcon style={{ width: 13, height: 13 }} />
              Back
            </button>
          )}

          {/* Title — centred on mobile, right-aligned on desktop */}
          <div style={{
            ...(isMobile
              ? { position: 'absolute', left: '50%', transform: 'translateX(-50%)' }
              : { marginLeft: 'auto' }
            ),
            display: 'flex', alignItems: 'center',
          }}>
            <span style={isMobile ? {
              fontWeight: 800, fontSize: 22, letterSpacing: '-0.04em', color: 'var(--color-text)',
            } : {
              fontWeight: 700, fontSize: 14, letterSpacing: '-0.02em', color: 'var(--color-text-muted)',
            }}>
              {isMobile && mobileView === 'content' ? getSectionLabel(activeSection) : 'Settings'}
            </span>
          </div>
        </div>

        {/* Body: left nav + content */}
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '220px 1fr', overflow: 'hidden' }}>
          {/* Left nav */}
          <div style={{
            borderRight: isMobile ? 'none' : '1px solid var(--color-border)',
            background: 'var(--color-surface)',
            padding: isMobile ? '12px 8px' : '16px 0',
            overflowY: 'auto',
            display: isMobile && mobileView === 'content' ? 'none' : 'block',
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
                      onClick={() => { setActiveSection(item.id); if (isMobile) setMobileView('content') }}
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
                        padding: isMobile ? '11px 20px' : '8px 14px',
                        margin: isMobile ? '2px 0' : '1px 8px',
                        width: isMobile ? '100%' : 'calc(100% - 16px)',
                        background: isActive ? (isMobile ? 'rgba(124,58,237,0.06)' : 'var(--color-card)') : 'transparent',
                        border: 'none',
                        borderRadius: isMobile ? 10 : 8,
                        cursor: 'pointer',
                        fontFamily: 'var(--font-sans)', fontSize: isMobile ? 14 : 13,
                        fontWeight: isActive ? 600 : 400,
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
          <div style={{
            overflowY: 'auto',
            padding: isMobile ? '20px 16px' : '36px 48px',
            maxWidth: isMobile ? 'none' : (activeSection === 'connectors' ? 'none' : 760),
            width: '100%', boxSizing: 'border-box',
            display: isMobile && mobileView === 'nav' ? 'none' : 'block',
          }}>
            {renderSection()}
          </div>
        </div>

        {/* Save toast */}
        {toast && (
          <div
            key={toast.key}
            style={{
              position: 'fixed',
              top: 20,
              right: 20,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '12px 16px',
              background: 'var(--color-card)',
              border: '1px solid rgba(124,58,237,0.25)',
              borderRadius: 14,
              boxShadow: '0 8px 32px rgba(124,58,237,0.12), 0 2px 8px rgba(0,0,0,0.08)',
              fontFamily: 'var(--font-sans)',
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--color-text)',
              animation: toastExiting
                ? 'toastSlideOut 0.28s cubic-bezier(0.4,0,1,1) forwards'
                : 'toastSlideIn 0.32s cubic-bezier(0.34,1.56,0.64,1) both',
              zIndex: 9999,
              pointerEvents: 'none',
              whiteSpace: 'nowrap',
            }}
          >
            <CheckCircleIcon style={{ width: 18, height: 18, color: '#22c55e', flexShrink: 0 }} />
            {toast.msg}
          </div>
        )}
      </div>
    </>
  )
}
