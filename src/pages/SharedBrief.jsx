// ────────────────────────────────────────────────────────────────────
// SharedBrief — public viewer for /share/:token URLs.
//
// The Share button on the brief result page inserts a snapshot of
// the brief into supabase.shared_briefs with a UUID token. That
// token rides in the URL; this page reads it out of context
// (App.jsx routing pre-populates activeShareToken), fetches the
// snapshot from supabase as anon, and renders it through the same
// ResultView the owner sees — minus the owner-only sticky header.
//
// Header buttons branch on auth state:
//   - Anon visitor → "Create your own" sends them to signup (App.jsx
//     skips AppShell so no sidebar leaks the app UI).
//   - Signed-in viewer → "Save to history" snapshots into their own
//     projects table so the brief lands in Recent. "Create your own"
//     opens a fresh Dashboard translator.
// ────────────────────────────────────────────────────────────────────

import { useContext, useEffect, useState } from 'react'
import AppContext from '../context/AppContext'
import { supabase } from '../lib/supabase'
import { SparklesIcon, BookmarkIcon } from '@heroicons/react/24/outline'
import { ResultView } from './Dashboard'

export default function SharedBrief() {
  const { activeShareToken, authUser, navigate, saveHistory, showToast } = useContext(AppContext)
  const [state, setState] = useState({ status: 'loading', data: null, error: null })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!activeShareToken) {
      setState({ status: 'not-found', data: null, error: 'No share token in URL.' })
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const { data, error } = await supabase
          .from('shared_briefs')
          .select('*')
          .eq('token', activeShareToken)
          .maybeSingle()
        if (cancelled) return
        if (error) throw error
        if (!data) {
          setState({ status: 'not-found', data: null, error: 'Share link not found or revoked.' })
          return
        }
        setState({ status: 'ready', data, error: null })
      } catch (e) {
        if (cancelled) return
        console.error('[shared-brief] fetch failed', e)
        setState({ status: 'error', data: null, error: e?.message || 'Could not load brief.' })
      }
    })()
    return () => { cancelled = true }
  }, [activeShareToken])

  // ── Header actions ────────────────────────────────────────────
  // "Create your own" sends anon visitors to the signup page and
  // signed-in viewers to a fresh translator. We use a localStorage
  // hint to land anon visitors on the Create-account tab directly.
  function handleCreateOwn() {
    if (!authUser) {
      try { localStorage.setItem('db-auth-default-tab', 'signup') } catch {}
      navigate('auth')
      return
    }
    navigate('dashboard')
  }

  // "Save to history" — only for signed-in viewers. Pipes the snapshot
  // into saveHistory which writes a project row + lights up the
  // Recent list in the sidebar. Inspirations live on result.inspirations
  // so the standard history hydration in Dashboard.jsx restores them.
  async function handleSaveToHistory() {
    if (!state.data || saving) return
    if (!authUser) {
      showToast?.('Sign in to save briefs.', 'error')
      return
    }
    setSaving(true)
    try {
      const snap = state.data
      const resultWithInspi = {
        ...snap.result,
        inspirations: Array.isArray(snap.inspirations) ? snap.inspirations : [],
      }
      await saveHistory({
        id: `hist_share_${snap.token}`,
        section: 'translator',
        title: snap.title || 'Shared brief',
        ts: Date.now(),
        pinned: false,
        data: {
          brief: '',
          scoring: snap.scoring || null,
          result: resultWithInspi,
        },
      })
      setSaved(true)
      showToast?.('Saved — check Recent in the sidebar.', 'success')
    } catch (e) {
      console.error('[shared-brief] save failed', e)
      showToast?.(e?.message || 'Could not save brief. Try again.', 'error')
    } finally {
      setSaving(false)
    }
  }

  if (state.status === 'loading') {
    return (
      <FullPage>
        <div className="spin" style={{
          width: 36, height: 36,
          border: '3px solid var(--color-border)',
          borderTopColor: 'var(--color-accent)',
          borderRadius: '50%',
        }} />
        <div style={{ fontFamily: "'Urbanist', sans-serif", fontSize: 13, color: 'var(--color-text-muted)' }}>
          Loading shared brief…
        </div>
      </FullPage>
    )
  }

  if (state.status === 'not-found' || state.status === 'error') {
    return (
      <FullPage>
        <SparklesIcon style={{ width: 36, height: 36, color: 'var(--color-text-muted)' }} />
        <div style={{ fontFamily: "'Urbanist', sans-serif", fontSize: 18, fontWeight: 700, color: 'var(--color-text)' }}>
          {state.status === 'not-found' ? 'This share link no longer works' : 'Could not load brief'}
        </div>
        <div style={{ fontFamily: "'Urbanist', sans-serif", fontSize: 13, color: 'var(--color-text-muted)', maxWidth: 380, textAlign: 'center', lineHeight: 1.6 }}>
          {state.status === 'not-found'
            ? 'The owner may have revoked the link or it never existed. Ask them for a new one.'
            : state.error}
        </div>
        <a
          href="/"
          style={{
            padding: '8px 18px',
            background: 'var(--color-text)',
            color: 'var(--color-bg)',
            border: 'none',
            borderRadius: 9,
            fontFamily: "'Urbanist', sans-serif",
            fontWeight: 600,
            fontSize: 13,
            cursor: 'pointer',
            textDecoration: 'none',
          }}
        >
          Go to DesignBrief AI
        </a>
      </FullPage>
    )
  }

  const snap = state.data
  return (
    <div style={{ minHeight: '100dvh', background: 'var(--color-bg)' }}>
      <PublicHeader
        title={snap.title}
        isSignedIn={!!authUser}
        onCreateOwn={handleCreateOwn}
        onSave={handleSaveToHistory}
        saving={saving}
        saved={saved}
      />
      <ResultView
        result={snap.result || {}}
        scoring={snap.scoring || null}
        inspirations={Array.isArray(snap.inspirations) ? snap.inspirations : []}
        loadingInspi={false}
        inspiSearched={true}
        hideStickyHeader
      />
    </div>
  )
}

function FullPage({ children }) {
  return (
    <div style={{
      minHeight: '100dvh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'column',
      gap: 14,
      padding: 24,
      background: 'var(--color-bg)',
    }}>
      {children}
    </div>
  )
}

// Top-of-page header. Same chrome for anon + signed-in users; only
// the button set on the right changes (anon gets just Create your
// own → signup; signed-in gets Save + Create your own → dashboard).
function PublicHeader({ title, isSignedIn, onCreateOwn, onSave, saving, saved }) {
  return (
    <div style={{
      position: 'sticky', top: 0, zIndex: 20,
      background: 'var(--color-bg)',
      borderBottom: '1px solid var(--color-border)',
      padding: '12px 24px',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      gap: 12,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        <SparklesIcon style={{ width: 18, height: 18, color: 'var(--color-accent)', flexShrink: 0 }} />
        <span style={{ fontFamily: "'Urbanist', sans-serif", fontWeight: 800, fontSize: 14, color: 'var(--color-text)', flexShrink: 0 }}>
          DesignBrief AI
        </span>
        <span style={{
          fontFamily: "'Urbanist', sans-serif", fontSize: 10, fontWeight: 700, padding: '3px 8px',
          borderRadius: 100, background: 'var(--color-surface)',
          border: '1px solid var(--color-border)', color: 'var(--color-text-soft)',
          letterSpacing: '0.06em', textTransform: 'uppercase',
          flexShrink: 0,
        }}>
          Shared
        </span>
        <span style={{
          fontFamily: "'Urbanist', sans-serif", fontWeight: 600, fontSize: 13,
          color: 'var(--color-text-soft)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          minWidth: 0,
        }}>
          {title || 'Untitled brief'}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        {isSignedIn && (
          <button
            onClick={onSave}
            disabled={saving || saved}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '7px 14px',
              background: saved ? 'var(--color-surface)' : 'var(--color-card)',
              color: saved ? 'var(--color-text-soft)' : 'var(--color-text)',
              border: '1px solid var(--color-border)',
              borderRadius: 9,
              fontFamily: "'Urbanist', sans-serif",
              fontWeight: 600,
              fontSize: 13,
              cursor: (saving || saved) ? 'default' : 'pointer',
              opacity: saving ? 0.7 : 1,
              transition: 'opacity 0.15s, background 0.15s',
            }}
          >
            {saving ? (
              <span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: '50%', border: '2px solid currentColor', borderTopColor: 'transparent', animation: 'spin 0.6s linear infinite' }} />
            ) : (
              <BookmarkIcon style={{ width: 14, height: 14 }} />
            )}
            {saved ? 'Saved' : saving ? 'Saving…' : 'Save to history'}
          </button>
        )}
        <button
          onClick={onCreateOwn}
          style={{
            padding: '7px 14px',
            background: 'var(--color-text)',
            color: 'var(--color-bg)',
            border: 'none',
            borderRadius: 9,
            fontFamily: "'Urbanist', sans-serif",
            fontWeight: 600,
            fontSize: 13,
            cursor: 'pointer',
          }}
        >
          {isSignedIn ? 'Create your own' : 'Sign up to create'}
        </button>
      </div>
    </div>
  )
}
