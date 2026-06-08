// ────────────────────────────────────────────────────────────────────
// SharedBrief — public viewer for /share/:token URLs.
//
// The Share button on the brief result page inserts a snapshot of
// the brief into supabase.shared_briefs with a UUID token. That
// token rides in the URL; this page reads it out of context
// (App.jsx routing pre-populates activeShareToken), fetches the
// snapshot from supabase as anon, and renders it through the same
// ResultView the owner sees — minus the owner-only sticky header
// (hideStickyHeader prop on ResultView).
// ────────────────────────────────────────────────────────────────────

import { useContext, useEffect, useState } from 'react'
import AppContext from '../context/AppContext'
import { supabase } from '../lib/supabase'
import { SparklesIcon } from '@heroicons/react/24/outline'
import { ResultView } from './Dashboard'

export default function SharedBrief() {
  const { activeShareToken } = useContext(AppContext)
  const [state, setState] = useState({ status: 'loading', data: null, error: null })

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

  // Ready — render the owner-facing ResultView with the sticky
  // header suppressed; we supply our own minimal one above the brief.
  const snap = state.data
  return (
    <div style={{ minHeight: '100dvh', background: 'var(--color-bg)' }}>
      <PublicHeader title={snap.title} />
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

function PublicHeader({ title }) {
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
      <a
        href="/"
        style={{
          padding: '7px 14px',
          background: 'var(--color-text)',
          color: 'var(--color-bg)',
          borderRadius: 9,
          fontFamily: "'Urbanist', sans-serif",
          fontWeight: 600,
          fontSize: 13,
          textDecoration: 'none',
          flexShrink: 0,
        }}
      >
        Create your own
      </a>
    </div>
  )
}
