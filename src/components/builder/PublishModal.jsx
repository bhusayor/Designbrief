import { useContext, useEffect, useMemo, useRef, useState } from 'react'
import AppContext from '../../context/AppContext'
import { supabase } from '../../lib/supabase'
import { assembleWebsite } from '../../lib/aiBuildEngine'
import {
  XMarkIcon,
  RocketLaunchIcon,
  CheckCircleIcon,
  ClipboardDocumentIcon,
  ArrowTopRightOnSquareIcon,
  ShareIcon,
} from '@heroicons/react/24/outline'

// ────────────────────────────────────────────────────────────────────
// PublishModal — runs the publish flow:
//   1. Type a slug, we check ai_builds.slug uniqueness live.
//   2. Optional SEO title + meta description.
//   3. On submit, assemble the full HTML (approved sections only),
//      POST to /api/publish-build which uploads to Supabase Storage
//      (and, when configured, deploys to Vercel) and writes
//      ai_builds.{slug, published_url, published_at, status='complete'}.
//   4. Success screen with Visit / Copy / Share buttons.
// ────────────────────────────────────────────────────────────────────

const SLUG_REGEX = /^[a-z0-9-]+$/
const BASE_DOMAIN = 'designbrief.app'
const API_BASE = import.meta.env.VITE_API_BASE_URL || ''

export default function PublishModal({ open, onClose, build, briefContext, sections, projectName, onPublished }) {
  const { showToast } = useContext(AppContext)
  const [slug, setSlug] = useState(() => suggestSlug(projectName))
  const [seoTitle, setSeoTitle] = useState(projectName || '')
  const [metaDescription, setMetaDescription] = useState(briefContext?.projectUnderstanding?.slice(0, 160) || '')
  const [checking, setChecking] = useState(false)
  const [available, setAvailable] = useState(null) // null | true | false
  const [publishing, setPublishing] = useState(false)
  const [published, setPublished] = useState(null) // { url }
  const [copied, setCopied] = useState(false)
  const checkTimerRef = useRef(null)

  useEffect(() => {
    if (!open) return
    function onKey(e) { if (e.key === 'Escape' && !publishing) onClose?.() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose, publishing])

  // Reset state when modal closes.
  useEffect(() => {
    if (!open) {
      setPublished(null)
      setCopied(false)
      setAvailable(null)
    }
  }, [open])

  // Debounced uniqueness check.
  useEffect(() => {
    if (!open) return
    clearTimeout(checkTimerRef.current)
    if (!slug || !SLUG_REGEX.test(slug) || slug.length < 3) {
      setAvailable(null); setChecking(false); return
    }
    setChecking(true)
    checkTimerRef.current = setTimeout(async () => {
      try {
        const { data } = await supabase
          .from('ai_builds')
          .select('id')
          .eq('slug', slug)
          .maybeSingle()
        // If the only match is THIS build, treat it as available.
        const isAvailable = !data || data.id === build?.id
        setAvailable(isAvailable)
      } catch {
        setAvailable(null)
      } finally {
        setChecking(false)
      }
    }, 350)
    return () => clearTimeout(checkTimerRef.current)
  }, [slug, open, build?.id])

  const fullHtml = useMemo(() => {
    if (!sections?.length) return ''
    const html = assembleWebsite(sections, briefContext)
    if (!seoTitle && !metaDescription) return html
    // Inject SEO into <head>. Cheap string splice — the assembled html
    // always has a single <title>...</title> we can replace, and the
    // meta description goes right after it.
    let out = html
    if (seoTitle) {
      out = out.replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(seoTitle)}</title>`)
    }
    if (metaDescription) {
      out = out.replace(
        '</title>',
        `</title>\n    <meta name="description" content="${escapeHtml(metaDescription)}" />`
      )
    }
    return out
  }, [sections, briefContext, seoTitle, metaDescription])

  async function handlePublish() {
    if (!available || !slug || !build?.id) return
    setPublishing(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) throw new Error('Sign in to publish')

      const res = await fetch(`${API_BASE}/api/publish-build`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + token,
        },
        body: JSON.stringify({
          build_id: build.id,
          slug,
          html: fullHtml,
          seo_title: seoTitle || null,
          meta_description: metaDescription || null,
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || `Publish failed (${res.status})`)
      setPublished({ url: body.published_url, kind: body.deployment_kind })
      onPublished?.({
        slug,
        published_url: body.published_url,
        published_at: new Date().toISOString(),
        status: 'complete',
      })
    } catch (e) {
      console.error('[publish]', e)
      showToast?.('Publish failed: ' + e.message, 'error')
    } finally {
      setPublishing(false)
    }
  }

  function handleCopy() {
    if (!published?.url) return
    navigator.clipboard.writeText(published.url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  function handleShare() {
    if (!published?.url) return
    if (navigator.share) {
      navigator.share({ title: seoTitle || projectName, url: published.url }).catch(() => {})
    } else {
      handleCopy()
    }
  }

  if (!open) return null

  return (
    <div
      onClick={publishing ? undefined : onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1300,
        background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20, fontFamily: 'var(--font-sans)',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 540,
          maxHeight: '92vh', overflowY: 'auto',
          background: 'var(--color-bg)',
          border: '1px solid var(--color-border)',
          borderRadius: 18,
          boxShadow: '0 24px 64px rgba(0,0,0,0.35)',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '18px 22px 14px', borderBottom: '1px solid var(--color-border)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <RocketLaunchIcon style={{ width: 17, height: 17, color: '#16A34A' }} />
            <span style={{ fontWeight: 800, fontSize: 15, color: 'var(--color-text)', letterSpacing: '-0.01em' }}>
              Publish Your Website
            </span>
          </div>
          <button onClick={onClose} disabled={publishing} style={iconBtn}>
            <XMarkIcon style={{ width: 15, height: 15 }} />
          </button>
        </div>

        {/* Body */}
        {!published ? (
          <div style={{ padding: '18px 22px 8px' }}>
            <SectionLabel>Choose your site URL</SectionLabel>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '10px 12px',
              background: 'var(--color-surface)',
              border: '1px solid ' + (available === false ? '#EF4444' : 'var(--color-border)'),
              borderRadius: 10,
              fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--color-text-muted)',
            }}>
              <span>https://</span>
              <input
                value={slug}
                onChange={e => setSlug(sanitizeSlug(e.target.value))}
                placeholder="your-site"
                maxLength={50}
                style={{
                  flex: 1, minWidth: 0,
                  background: 'transparent', border: 'none', outline: 'none',
                  color: 'var(--color-text)', fontWeight: 700,
                  fontFamily: 'var(--font-mono)', fontSize: 13,
                }}
              />
              <span>.{BASE_DOMAIN}</span>
            </div>
            <SlugStatus slug={slug} checking={checking} available={available} />

            <div style={{ height: 18 }} />

            <SectionLabel optional>SEO Settings (optional)</SectionLabel>
            <Label>Page title</Label>
            <input
              value={seoTitle}
              onChange={e => setSeoTitle(e.target.value)}
              maxLength={70}
              placeholder={projectName || 'Page title'}
              style={textInput}
            />
            <div style={{ height: 10 }} />
            <Label>Meta description</Label>
            <textarea
              value={metaDescription}
              onChange={e => setMetaDescription(e.target.value)}
              maxLength={160}
              rows={3}
              placeholder="Short description for search engines and social previews."
              style={{ ...textInput, resize: 'vertical' }}
            />
            <div style={{ fontSize: 10.5, color: 'var(--color-text-muted)', marginTop: 4 }}>
              {metaDescription.length}/160
            </div>

            <div style={{
              display: 'flex', justifyContent: 'flex-end', gap: 8,
              marginTop: 20, paddingBottom: 14,
            }}>
              <button onClick={onClose} disabled={publishing} style={secondaryBtn}>Cancel</button>
              <button
                onClick={handlePublish}
                disabled={!available || publishing}
                style={{
                  ...publishBtn,
                  background: (!available || publishing) ? 'var(--color-border)' : 'linear-gradient(135deg, #16A34A, #22C55E)',
                  cursor: (!available || publishing) ? 'not-allowed' : 'pointer',
                  boxShadow: (!available || publishing) ? 'none' : '0 6px 18px rgba(22,163,74,0.30)',
                }}
              >
                <RocketLaunchIcon style={{ width: 14, height: 14 }} />
                {publishing ? 'Publishing…' : 'Publish Now'}
              </button>
            </div>
          </div>
        ) : (
          <SuccessScreen
            url={published.url}
            kind={published.kind}
            copied={copied}
            onCopy={handleCopy}
            onShare={handleShare}
            onClose={onClose}
          />
        )}
      </div>
    </div>
  )
}

// ──── Subcomponents ─────────────────────────────────────────────────

function SlugStatus({ slug, checking, available }) {
  if (!slug) {
    return <Hint>Pick at least 3 characters. Lowercase, numbers, hyphens.</Hint>
  }
  if (!SLUG_REGEX.test(slug) || slug.length < 3) {
    return <Hint warn>Lowercase letters, numbers, and hyphens only.</Hint>
  }
  if (checking) return <Hint>Checking availability…</Hint>
  if (available === true) {
    return <Hint ok>✓ {slug}.{BASE_DOMAIN} is available</Hint>
  }
  if (available === false) {
    return <Hint warn>✗ Taken. Try {slug}-app or {slug}-co</Hint>
  }
  return null
}

function SuccessScreen({ url, kind, copied, onCopy, onShare, onClose }) {
  return (
    <div style={{ padding: '24px 26px 24px', textAlign: 'center' }}>
      <div style={{
        width: 56, height: 56, borderRadius: 14,
        background: 'linear-gradient(135deg, #16A34A, #22C55E)',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: 14, boxShadow: '0 12px 32px rgba(22,163,74,0.30)',
      }}>
        <CheckCircleIcon style={{ width: 28, height: 28, color: 'white' }} />
      </div>
      <h3 style={{ margin: 0, fontWeight: 800, fontSize: 18, color: 'var(--color-text)', letterSpacing: '-0.02em' }}>
        Your website is live!
      </h3>
      <a
        href={url} target="_blank" rel="noopener noreferrer"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          marginTop: 10,
          padding: '8px 14px',
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 100,
          fontFamily: 'var(--font-mono)', fontSize: 12.5, fontWeight: 600,
          color: 'var(--color-text)', textDecoration: 'none',
        }}
      >
        {url.replace(/^https?:\/\//, '')}
        <ArrowTopRightOnSquareIcon style={{ width: 12, height: 12, color: 'var(--color-text-muted)' }} />
      </a>
      {kind === 'storage' && (
        <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 8, lineHeight: 1.5 }}>
          Served from Supabase Storage. Vercel auto-deploy is queued for setup; the URL above is permanent.
        </div>
      )}
      <div style={{
        display: 'flex', justifyContent: 'center', gap: 8, flexWrap: 'wrap',
        marginTop: 20,
      }}>
        <a href={url} target="_blank" rel="noopener noreferrer" style={{ ...primaryBtn, textDecoration: 'none' }}>
          <ArrowTopRightOnSquareIcon style={{ width: 13, height: 13 }} /> Visit Site
        </a>
        <button onClick={onCopy} style={secondaryBtn}>
          <ClipboardDocumentIcon style={{ width: 13, height: 13 }} /> {copied ? 'Copied!' : 'Copy Link'}
        </button>
        <button onClick={onShare} style={secondaryBtn}>
          <ShareIcon style={{ width: 13, height: 13 }} /> Share
        </button>
      </div>
      <div style={{ marginTop: 22 }}>
        <button onClick={onClose} style={ghostBtn}>Done</button>
      </div>
    </div>
  )
}

function SectionLabel({ children, optional }) {
  return (
    <div style={{
      fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 800,
      letterSpacing: '0.08em', textTransform: 'uppercase',
      color: 'var(--color-text-muted)',
      marginBottom: 8,
      display: 'flex', alignItems: 'center', gap: 6,
    }}>
      {children}
      {optional && (
        <span style={{ background: 'var(--color-surface)', padding: '1px 6px', borderRadius: 100, fontSize: 9 }}>
          OPTIONAL
        </span>
      )}
    </div>
  )
}

function Label({ children }) {
  return (
    <div style={{
      fontSize: 11.5, fontWeight: 600, color: 'var(--color-text-muted)',
      marginBottom: 5,
    }}>
      {children}
    </div>
  )
}

function Hint({ children, warn, ok }) {
  return (
    <div style={{
      marginTop: 6, fontSize: 11.5,
      color: warn ? '#EF4444' : ok ? '#16A34A' : 'var(--color-text-muted)',
    }}>
      {children}
    </div>
  )
}

function suggestSlug(name) {
  return sanitizeSlug(String(name || '').toLowerCase()).slice(0, 30)
}

function sanitizeSlug(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50)
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]))
}

// ──── Style constants ───────────────────────────────────────────────

const iconBtn = {
  width: 28, height: 28, borderRadius: 7, background: 'transparent',
  border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
}

const textInput = {
  width: '100%', boxSizing: 'border-box',
  padding: '10px 12px',
  background: 'var(--color-surface)',
  border: '1px solid var(--color-border)', borderRadius: 9,
  color: 'var(--color-text)', fontFamily: 'var(--font-sans)',
  fontSize: 13, fontWeight: 500, outline: 'none',
}

const primaryBtn = {
  padding: '10px 16px',
  background: 'linear-gradient(135deg, #8B5CF6, #6366F1)',
  color: 'white', border: 'none', borderRadius: 10,
  cursor: 'pointer',
  fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 700,
  display: 'inline-flex', alignItems: 'center', gap: 6,
}

const secondaryBtn = {
  padding: '10px 16px',
  background: 'transparent', color: 'var(--color-text)',
  border: '1px solid var(--color-border)', borderRadius: 10,
  cursor: 'pointer',
  fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 600,
  display: 'inline-flex', alignItems: 'center', gap: 6,
}

const ghostBtn = {
  padding: '8px 14px',
  background: 'transparent', color: 'var(--color-text-muted)',
  border: 'none', cursor: 'pointer',
  fontFamily: 'var(--font-sans)', fontSize: 12.5, fontWeight: 600,
}

const publishBtn = {
  padding: '10px 18px',
  color: 'white', border: 'none', borderRadius: 10,
  fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 800,
  display: 'inline-flex', alignItems: 'center', gap: 6,
  letterSpacing: '-0.005em',
}
