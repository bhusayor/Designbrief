import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import ConfirmDeleteModal from './ConfirmDeleteModal'
import {
  XMarkIcon, ShareIcon, EllipsisHorizontalIcon, EyeIcon,
  PlusIcon, TrashIcon, CalendarIcon, FlagIcon, UserIcon, TagIcon,
  ChevronDownIcon, SparklesIcon, ClipboardDocumentIcon, CheckIcon,
  ArrowUpIcon, HandThumbUpIcon, HandThumbDownIcon,
  ArrowUturnLeftIcon, PencilIcon, PaperClipIcon, ArrowDownTrayIcon,
  PhotoIcon, DocumentIcon,
} from '@heroicons/react/24/outline'
import {
  getSubtasks, addSubtask, updateSubtask, deleteSubtask,
  getComments, addComment, deleteComment,
  getActivity, logActivity, updateTaskInDB, mapDBTask,
  enhanceDescription, generateAIPrompt,
} from '../lib/taskService'
import { fetchDesignSystem } from '../lib/designSystem'

// ─── Constants ──────────────────────────────────────────────────────────────

const STATUS_OPTIONS = ['To Do', 'In Progress', 'Review', 'Done']
const STATUS_COLORS = {
  'To Do': '#6B7280',
  'In Progress': '#3B82F6',
  'Review': '#F59E0B',
  'Done': '#10B981',
}

const PRIORITY_OPTIONS = [
  { id: 'URGENT', label: 'Urgent', emoji: '🔴', color: '#EF4444' },
  { id: 'HIGH', label: 'High', emoji: '🟠', color: '#F97316' },
  { id: 'MEDIUM', label: 'Medium', emoji: '🟡', color: '#F59E0B' },
  { id: 'LOW', label: 'Low', emoji: '🟢', color: '#10B981' },
  { id: 'none', label: 'None', emoji: '⚪', color: '#9CA3AF' },
]

// ─── Helpers ────────────────────────────────────────────────────────────────

function timeAgo(ts) {
  if (!ts) return ''
  const diff = Date.now() - new Date(ts).getTime()
  const s = Math.floor(diff / 1000)
  if (s < 60) return 'just now'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d}d ago`
  return new Date(ts).toLocaleDateString()
}

function formatDate(iso) {
  if (!iso) return null
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function isOverdue(dueDate) {
  if (!dueDate) return false
  const d = new Date(dueDate)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return d < today
}

function initialOf(name) {
  return (name || '?')[0]?.toUpperCase() || '?'
}

// Matches:
//   https://example.com/path?q=1
//   http://example.com
//   www.example.com
//   google.com  /  mail.google.com  /  news.bbc.co.uk
// Avoids false positives like "e.g." by only matching a known TLD whitelist
// at the end of a bare domain, OR an explicit http(s)://www. prefix.
const TLD_GROUP = '(?:com|net|org|io|co|app|dev|me|ai|xyz|info|biz|us|uk|ca|au|de|fr|nl|jp|cn|in|br|ru|es|it|edu|gov|tv|so|sh|to|cc|ly|gg|tech|page|site|design|store|cloud|tools|email|news|blog|shop|art|fyi|chat|games|video|live|world|space|online|website|studio|agency|company|finance|capital|systems|works|stream)'
const URL_REGEX = new RegExp(
  '(https?:\\/\\/[^\\s<>"\'()]+|www\\.[^\\s<>"\'()]+|\\b(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\\.)+' + TLD_GROUP + '\\b(?:\\/[^\\s<>"\'()]*)?)',
  'gi'
)

// Renders plain text with URLs auto-linked. exec() loop avoids the
// stateful split+test bug we had before.
// Highlights @mentions inside a plain-text segment as accent-coloured chips.
// Tries to match against a `members` list — when present, a name match
// strengthens the highlight to a soft accent-bg pill.
function highlightMentions(text, members) {
  if (!text) return text
  // @Name — allows letters/digits/dot/hyphen/underscore/apostrophe, plus a
  // single space between two name parts (matches "@John Doe", "@Joe").
  // We greedily try a two-word capture first so multi-word names work, but
  // fall back to a single word if there's no member-list to anchor on.
  const re = /@([A-Za-z][A-Za-z0-9._'-]*(?:\s[A-Za-z][A-Za-z0-9._'-]*)?)/g
  const out = []
  let lastIndex = 0
  let m
  while ((m = re.exec(text)) !== null) {
    if (m.index > lastIndex) out.push(text.slice(lastIndex, m.index))
    const display = m[1]
    const matched = (members || []).find(p => (p.name || '').toLowerCase() === display.toLowerCase())
    out.push(
      <span key={out.length} style={{
        color: 'var(--color-accent)',
        background: matched ? 'var(--color-accent-soft)' : 'transparent',
        borderRadius: 4, padding: matched ? '0 3px' : 0,
        fontWeight: 600,
      }}>@{display}</span>
    )
    lastIndex = m.index + m[0].length
  }
  if (lastIndex < text.length) out.push(text.slice(lastIndex))
  return out
}

function renderCommentBody(text, members) {
  if (!text) return null
  const str = String(text)
  const re = new RegExp(URL_REGEX.source, URL_REGEX.flags)
  const out = []
  let lastIndex = 0
  let match
  function pushText(chunk) {
    if (!chunk) return
    const mentioned = highlightMentions(chunk, members)
    if (Array.isArray(mentioned)) {
      mentioned.forEach((n, i) => out.push(
        typeof n === 'string'
          ? <span key={out.length + ':' + i}>{n}</span>
          : <span key={out.length + ':' + i}>{n}</span>,
      ))
    } else {
      out.push(<span key={out.length}>{mentioned}</span>)
    }
  }
  while ((match = re.exec(str)) !== null) {
    // Strip trailing punctuation that shouldn't be part of the link
    let raw = match[0]
    let extra = ''
    while (raw.length > 1 && '.,;:!?)]>'.includes(raw[raw.length - 1])) {
      extra = raw[raw.length - 1] + extra
      raw = raw.slice(0, -1)
    }
    if (match.index > lastIndex) pushText(str.slice(lastIndex, match.index))
    const href = raw.startsWith('http') ? raw : `https://${raw.replace(/^www\./, '')}`
    out.push(
      <a key={out.length} href={href} target="_blank" rel="noopener noreferrer"
        onClick={e => e.stopPropagation()}
        style={{ color: 'var(--color-accent)', textDecoration: 'underline', wordBreak: 'break-all' }}>
        {raw}
      </a>
    )
    if (extra) out.push(<span key={out.length}>{extra}</span>)
    lastIndex = match.index + match[0].length
  }
  if (lastIndex < str.length) pushText(str.slice(lastIndex))
  return out.length ? out : str
}

// ─── Tiny presentational helpers ────────────────────────────────────────────

const SectionLabel = ({ children }) => (
  <div style={{
    fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600,
    letterSpacing: '0.08em', textTransform: 'uppercase',
    color: 'var(--color-text-muted)', marginBottom: 8,
  }}>{children}</div>
)

const Avatar = ({ name, src, size = 24 }) => (
  <div style={{
    width: size, height: size, borderRadius: '50%',
    background: src ? 'var(--color-surface)' : 'var(--color-text)',
    color: 'var(--color-bg)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontFamily: 'var(--font-sans)', fontWeight: 700,
    fontSize: size * 0.42, flexShrink: 0, overflow: 'hidden',
    border: src ? '1px solid var(--color-border)' : 'none',
  }}>
    {src ? (
      <img
        src={src}
        alt={name || ''}
        onError={e => { e.currentTarget.style.display = 'none' }}
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
      />
    ) : initialOf(name)}
  </div>
)

// ── ComposerBubble: unified avatar + textarea + + menu + send ───────────────
function ComposerBubble({
  value, onChange, onSubmit,
  onAttachDocument, onAttachImage,
  uploading,
  attachments = [], onRemoveAttachment,
  userName,
  userAvatar,
  members = [],   // [{ userId, name, avatarUrl }] for @mentions
}) {
  const [focused, setFocused] = useState(false)
  const [showAttachMenu, setShowAttachMenu] = useState(false)
  const taRef = useRef(null)
  const attachBtnRef = useRef(null)

  // @mention autocomplete state. mentionStart points at the index of the '@'
  // currently being completed; mentionQuery is the text typed after it.
  // mentionIndex tracks the highlighted suggestion for keyboard nav.
  const [mentionStart, setMentionStart] = useState(-1)
  const [mentionQuery, setMentionQuery] = useState('')
  const [mentionIndex, setMentionIndex] = useState(0)

  const filteredMentions = mentionStart === -1
    ? []
    : (members || [])
      .filter(m => (m.name || '').toLowerCase().includes(mentionQuery.toLowerCase()))
      .slice(0, 6)

  // Detect '@' immediately before the caret; opens / updates the dropdown.
  function syncMentionFromCaret(text, caret) {
    const upToCaret = text.slice(0, caret)
    const atIdx = upToCaret.lastIndexOf('@')
    if (atIdx === -1) { setMentionStart(-1); setMentionQuery(''); return }
    // Must be at start of input OR preceded by whitespace
    const prev = atIdx === 0 ? ' ' : upToCaret[atIdx - 1]
    if (!/\s/.test(prev)) { setMentionStart(-1); setMentionQuery(''); return }
    const fragment = upToCaret.slice(atIdx + 1)
    // Spaces close the mention
    if (/\s/.test(fragment)) { setMentionStart(-1); setMentionQuery(''); return }
    setMentionStart(atIdx)
    setMentionQuery(fragment)
    setMentionIndex(0)
  }

  function insertMention(member) {
    if (!member || mentionStart === -1) return
    const el = taRef.current
    const caret = el ? el.selectionStart : value.length
    const before = value.slice(0, mentionStart)
    const after = value.slice(caret)
    const inserted = `@${(member.name || '').replace(/\s+/g, ' ')} `
    const next = before + inserted + after
    onChange(next)
    setMentionStart(-1)
    setMentionQuery('')
    // Restore caret after the inserted mention on the next tick
    requestAnimationFrame(() => {
      const newPos = (before + inserted).length
      if (el) {
        el.focus()
        try { el.setSelectionRange(newPos, newPos) } catch {}
      }
    })
  }

  // Auto-grow textarea
  useEffect(() => {
    const el = taRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 160) + 'px'
  }, [value])

  // Close attach menu when clicking outside
  useEffect(() => {
    if (!showAttachMenu) return
    function onDoc(e) {
      if (!attachBtnRef.current?.contains(e.target)) setShowAttachMenu(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [showAttachMenu])

  const hasContent = !!value.trim() || attachments.length > 0

  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
      <Avatar name={userName} src={userAvatar} size={32} />
      <div
        style={{
          flex: 1, position: 'relative',
          background: 'var(--color-surface)',
          border: '1.5px solid ' + (focused ? 'var(--color-accent)' : 'var(--color-border)'),
          borderRadius: 12,
          padding: '8px 10px 8px 14px',
          boxShadow: focused ? '0 0 0 3px var(--color-accent-soft)' : 'none',
          transition: 'border-color 0.15s, box-shadow 0.15s',
        }}>

        {/* Pending attachments */}
        {attachments.length > 0 && (
          <div style={{
            display: 'flex', flexWrap: 'wrap', gap: 6,
            paddingBottom: 8, marginBottom: 8,
            borderBottom: '1px solid var(--color-border)',
          }}>
            {attachments.map((a, idx) => (
              <AttachmentChip
                key={a.path || idx}
                attachment={a}
                onRemove={() => onRemoveAttachment(idx)}
                compact
              />
            ))}
          </div>
        )}

        {/* Textarea */}
        <textarea
          ref={taRef}
          value={value}
          onChange={e => {
            onChange(e.target.value)
            syncMentionFromCaret(e.target.value, e.target.selectionStart)
          }}
          onSelect={e => syncMentionFromCaret(e.target.value, e.target.selectionStart)}
          onKeyUp={e => syncMentionFromCaret(e.currentTarget.value, e.currentTarget.selectionStart)}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false)
            // Delay closing so the dropdown's onMouseDown can fire first
            setTimeout(() => setMentionStart(-1), 120)
          }}
          onKeyDown={e => {
            // @mention navigation has priority while the dropdown is open
            if (mentionStart !== -1 && filteredMentions.length > 0) {
              if (e.key === 'ArrowDown') { e.preventDefault(); setMentionIndex(i => Math.min(filteredMentions.length - 1, i + 1)); return }
              if (e.key === 'ArrowUp') { e.preventDefault(); setMentionIndex(i => Math.max(0, i - 1)); return }
              if (e.key === 'Enter' || e.key === 'Tab') {
                e.preventDefault()
                insertMention(filteredMentions[mentionIndex])
                return
              }
              if (e.key === 'Escape') { e.preventDefault(); setMentionStart(-1); return }
            }
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault()
              if (hasContent) onSubmit()
            }
          }}
          placeholder="Add a comment… use @ to mention a teammate"
          rows={1}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={true}
          style={{
            width: '100%', background: 'transparent', border: 'none', outline: 'none',
            padding: 0, fontSize: 14, color: 'var(--color-text)',
            fontFamily: 'var(--font-sans)',
            minHeight: 22, maxHeight: 160, resize: 'none',
            lineHeight: 1.55, boxSizing: 'border-box',
          }}
        />

        {/* @mention dropdown — floats above the textarea, anchored to the bubble */}
        {mentionStart !== -1 && filteredMentions.length > 0 && (
          <div style={{
            position: 'absolute', bottom: '100%', left: 0,
            marginBottom: 8, minWidth: 240, maxWidth: 320,
            background: 'var(--color-bg)',
            border: '1px solid var(--color-border)',
            borderRadius: 10,
            boxShadow: '0 12px 32px rgba(0,0,0,0.25)',
            padding: 4, zIndex: 20,
          }}>
            <div style={{
              fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700,
              letterSpacing: '0.08em', textTransform: 'uppercase',
              color: 'var(--color-text-muted)', padding: '6px 9px 4px',
            }}>
              Mention a teammate
            </div>
            {filteredMentions.map((m, idx) => {
              const active = idx === mentionIndex
              return (
                <div
                  key={m.userId}
                  onMouseDown={e => { e.preventDefault(); insertMention(m) }}
                  onMouseEnter={() => setMentionIndex(idx)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '7px 9px', borderRadius: 7,
                    background: active ? 'var(--color-surface)' : 'transparent',
                    cursor: 'pointer',
                  }}>
                  <Avatar name={m.name} src={m.avatarUrl} size={22} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 600, color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {m.name}
                    </div>
                    {m.email && (
                      <div style={{ fontFamily: 'var(--font-sans)', fontSize: 11, color: 'var(--color-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {m.email}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Action row inside the bubble */}
        <div style={{ display: 'flex', alignItems: 'center', marginTop: 6 }}>
          <div ref={attachBtnRef} style={{ position: 'relative' }}>
            <button
              onClick={() => setShowAttachMenu(s => !s)}
              disabled={uploading}
              title="Attach"
              style={{
                background: 'transparent', border: 'none',
                width: 28, height: 28, borderRadius: 7,
                cursor: uploading ? 'wait' : 'pointer',
                color: 'var(--color-text-muted)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
              <PlusIcon style={{ width: 17, height: 17 }} />
            </button>
            {showAttachMenu && (
              <div style={{
                position: 'absolute', bottom: '100%', left: 0, marginBottom: 6,
                background: 'var(--color-bg)', border: '1px solid var(--color-border)',
                borderRadius: 10, padding: 4, minWidth: 180,
                boxShadow: '0 8px 28px rgba(0,0,0,0.2)',
                zIndex: 10,
              }}>
                <button onClick={() => { setShowAttachMenu(false); onAttachDocument() }} style={menuBtn()}>
                  <DocumentIcon style={menuIcon()} /> Upload document
                </button>
                <button onClick={() => { setShowAttachMenu(false); onAttachImage() }} style={menuBtn()}>
                  <PhotoIcon style={menuIcon()} /> Upload image
                </button>
              </div>
            )}
          </div>
          {uploading && (
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-text-muted)', marginLeft: 6 }}>Uploading…</span>
          )}
          <div style={{ flex: 1 }} />
          <button
            onClick={onSubmit}
            disabled={!hasContent}
            title="Send comment (⌘+Enter)"
            style={{
              background: hasContent ? 'var(--color-accent)' : 'var(--color-border)',
              color: hasContent ? 'var(--color-accent-text)' : 'var(--color-text-muted)',
              border: 'none', borderRadius: 8,
              width: 32, height: 32, padding: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: hasContent ? 'pointer' : 'default',
              transition: 'background 0.15s',
            }}>
            <ArrowUpIcon style={{ width: 15, height: 15 }} />
          </button>
        </div>
      </div>
    </div>
  )
}

// ── AttachmentChip: clickable inline preview/download chip ─────────────────
function AttachmentChip({ attachment, onRemove, compact = false, onPreview }) {
  const isImage = attachment.type?.startsWith('image/')
  const sizeKb = attachment.size ? Math.round(attachment.size / 1024) : null

  const handlePreviewClick = (e) => {
    if (!onPreview) return
    e.preventDefault()
    onPreview(attachment)
  }

  if (isImage && !compact) {
    return (
      <button
        type="button"
        onClick={handlePreviewClick}
        style={{
          display: 'inline-block', padding: 0,
          maxWidth: 280, maxHeight: 200,
          borderRadius: 10, overflow: 'hidden',
          border: '1px solid var(--color-border)',
          background: 'none', cursor: onPreview ? 'zoom-in' : 'default',
        }}>
        <img src={attachment.url} alt={attachment.name}
          style={{ display: 'block', maxWidth: '100%', maxHeight: 200, objectFit: 'cover' }} />
      </button>
    )
  }

  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 8,
      background: compact ? 'var(--color-bg)' : 'var(--color-surface)',
      border: '1px solid var(--color-border)', borderRadius: 9,
      padding: '5px 8px 5px 10px',
      maxWidth: 320,
      cursor: onPreview ? 'pointer' : 'default',
    }}
      onClick={onPreview ? handlePreviewClick : undefined}
    >
      {isImage
        ? <PhotoIcon style={{ width: 15, height: 15, color: 'var(--color-accent)', flexShrink: 0 }} />
        : <DocumentIcon style={{ width: 15, height: 15, color: 'var(--color-text-muted)', flexShrink: 0 }} />}
      <div style={{
        display: 'flex', flexDirection: 'column', minWidth: 0,
        fontFamily: 'var(--font-sans)',
      }}>
        <span style={{
          fontSize: 12, fontWeight: 600, color: 'var(--color-text)',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          maxWidth: 200,
        }}>{attachment.name}</span>
        {sizeKb != null && (
          <span style={{ fontSize: 10, color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>{sizeKb} KB</span>
        )}
      </div>
      {/* Download button (always available, even with preview) */}
      <a href={attachment.url} target="_blank" rel="noopener noreferrer" download={attachment.name}
        title="Download"
        onClick={e => e.stopPropagation()}
        style={{
          color: 'var(--color-text-muted)', padding: 4, borderRadius: 6,
          display: 'flex', alignItems: 'center',
        }}>
        <ArrowDownTrayIcon style={{ width: 13, height: 13 }} />
      </a>
      {onRemove && (
        <button onClick={e => { e.stopPropagation(); onRemove() }} title="Remove" style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'var(--color-text-muted)', padding: 2,
          display: 'flex', alignItems: 'center',
        }}>
          <XMarkIcon style={{ width: 12, height: 12 }} />
        </button>
      )}
    </div>
  )
}

// ── FilePreviewModal: Slack-style inline file viewer ───────────────────────
function FilePreviewModal({ file, onClose }) {
  if (!file) return null
  const type = file.type || ''
  const name = file.name || 'file'
  const url = file.url

  // Decide the renderer
  let body = null
  if (type.startsWith('image/')) {
    body = (
      <img src={url} alt={name}
        style={{ maxWidth: '100%', maxHeight: '78vh', objectFit: 'contain', borderRadius: 8 }} />
    )
  } else if (type === 'application/pdf') {
    // Native browser PDF viewer
    body = (
      <iframe src={url} title={name}
        style={{ width: '100%', height: '78vh', border: 'none', borderRadius: 8, background: 'var(--color-bg)' }} />
    )
  } else if (type.startsWith('video/')) {
    body = (
      <video src={url} controls
        style={{ maxWidth: '100%', maxHeight: '78vh', borderRadius: 8, background: '#000' }} />
    )
  } else if (type.startsWith('audio/')) {
    body = (
      <audio src={url} controls style={{ width: '100%' }} />
    )
  } else if (
    type.startsWith('text/') ||
    /\.(txt|md|json|csv|log|yaml|yml|xml|html|js|ts|jsx|tsx|css)$/i.test(name)
  ) {
    // Fetch text content and render in <pre>
    body = <TextPreview url={url} />
  } else {
    // Office docs / unknown — use Google Docs Viewer (no download required)
    const viewerUrl = `https://docs.google.com/gview?url=${encodeURIComponent(url)}&embedded=true`
    body = (
      <iframe src={viewerUrl} title={name}
        style={{ width: '100%', height: '78vh', border: 'none', borderRadius: 8, background: 'var(--color-bg)' }} />
    )
  }

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 5000,
      background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24,
      animation: 'tdmFade 0.18s ease',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--color-bg)',
        border: '1px solid var(--color-border)',
        borderRadius: 16,
        width: '92vw', maxWidth: 1100,
        maxHeight: '92vh', overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 24px 80px rgba(0,0,0,0.4)',
      }}>
        {/* Header */}
        <div style={{
          flexShrink: 0, height: 52,
          padding: '0 16px',
          borderBottom: '1px solid var(--color-border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 10,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            {type.startsWith('image/')
              ? <PhotoIcon style={{ width: 16, height: 16, color: 'var(--color-accent)' }} />
              : <DocumentIcon style={{ width: 16, height: 16, color: 'var(--color-text-muted)' }} />}
            <span style={{
              fontFamily: 'var(--font-sans)', fontWeight: 700, fontSize: 14,
              color: 'var(--color-text)',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>{name}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <a href={url} download={name} target="_blank" rel="noopener noreferrer"
              title="Download" style={{
                display: 'flex', alignItems: 'center', gap: 6,
                background: 'var(--color-surface)', border: '1px solid var(--color-border)',
                borderRadius: 8, padding: '6px 12px',
                fontFamily: 'var(--font-sans)', fontSize: 12, fontWeight: 700,
                color: 'var(--color-text)', textDecoration: 'none',
              }}>
              <ArrowDownTrayIcon style={{ width: 13, height: 13 }} />
              Download
            </a>
            <button onClick={onClose} title="Close" style={{
              background: 'transparent', border: 'none', padding: '6px 8px',
              borderRadius: 7, cursor: 'pointer', color: 'var(--color-text-muted)',
              display: 'flex', alignItems: 'center',
            }}>
              <XMarkIcon style={{ width: 16, height: 16 }} />
            </button>
          </div>
        </div>
        {/* Body */}
        <div style={{
          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 14, overflow: 'auto',
          background: 'var(--color-card)',
        }}>{body}</div>
      </div>
    </div>
  )
}

function TextPreview({ url }) {
  const [text, setText] = useState(null)
  const [err, setErr] = useState(null)
  useEffect(() => {
    let cancelled = false
    fetch(url).then(r => r.text()).then(t => { if (!cancelled) setText(t) })
      .catch(e => { if (!cancelled) setErr(e.message) })
    return () => { cancelled = true }
  }, [url])
  if (err) return <div style={{ color: '#EF4444', fontFamily: 'var(--font-mono)', fontSize: 12 }}>Failed: {err}</div>
  if (text == null) return <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--color-text-muted)' }}>Loading…</div>
  return (
    <pre style={{
      width: '100%', maxHeight: '78vh', overflow: 'auto',
      background: 'var(--color-bg)', border: '1px solid var(--color-border)',
      borderRadius: 8, padding: 14,
      fontFamily: 'var(--font-mono)', fontSize: 12, lineHeight: 1.6,
      color: 'var(--color-text)', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
    }}>{text}</pre>
  )
}

function CommentRow({
  comment, replies = [], isMine, reaction,
  editing, editDraft, setEditDraft,
  menuOpen, setMenuOpen,
  onStartEdit, onSaveEdit, onCancelEdit,
  onDelete, onCopy, onReply,
  onThumbUp, onThumbDown,
  replying, replyDraft, setReplyDraft, onSubmitReply,
  currentUserName,
  currentUserAvatar,
  resolveAvatar,
  reactionsMap,
  makeHandlersForComment,
  mentionMembers = [],
  nested = false,
}) {
  const authorAvatar = resolveAvatar ? resolveAvatar(comment) : null
  const up = reaction?.up || 0
  const down = reaction?.down || 0
  const mine = reaction?.mine || null

  // Open the ⋯ menu via fixed positioning so it escapes the scroll container
  // and never gets hidden behind the composer at the bottom.
  const menuBtnRef = useRef(null)
  const [menuPos, setMenuPos] = useState(null)
  function toggleMenu() {
    if (menuOpen) { setMenuOpen(false); return }
    const r = menuBtnRef.current?.getBoundingClientRect()
    if (r) {
      // Open upward if there's no room below
      const below = window.innerHeight - r.bottom
      const openUp = below < 180
      setMenuPos({
        top: openUp ? r.top - 6 : r.bottom + 6,
        right: window.innerWidth - r.right,
        openUp,
      })
    }
    setMenuOpen(true)
  }

  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginLeft: nested ? 36 : 0 }}>
      <Avatar name={comment.author_name} src={authorAvatar} size={nested ? 22 : 28} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontFamily: 'var(--font-sans)', fontWeight: 600, fontSize: 13, color: 'var(--color-text)' }}>{comment.author_name}</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-text-muted)' }}>{timeAgo(comment.created_at)}</span>
          <div style={{ marginLeft: 'auto' }}>
            <button ref={menuBtnRef} onClick={toggleMenu} style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--color-text-muted)', padding: 2,
              display: 'flex', alignItems: 'center', borderRadius: 4,
            }}><EllipsisHorizontalIcon style={{ width: 14, height: 14 }} /></button>
            {menuOpen && menuPos && (
              <>
                {/* Backdrop closes the menu on outside click */}
                <div onClick={() => setMenuOpen(false)} style={{
                  position: 'fixed', inset: 0, zIndex: 2000,
                }} />
                <div style={{
                  position: 'fixed',
                  top: menuPos.openUp ? 'auto' : menuPos.top,
                  bottom: menuPos.openUp ? window.innerHeight - menuPos.top : 'auto',
                  right: menuPos.right,
                  zIndex: 2001,
                  background: 'var(--color-bg)', border: '1px solid var(--color-border)',
                  borderRadius: 9, padding: 4, minWidth: 150,
                  boxShadow: '0 8px 32px rgba(0,0,0,0.22)',
                  fontFamily: 'var(--font-sans)', fontSize: 12,
                }}>
                  <button onClick={onCopy} style={menuBtn()}>
                    <ClipboardDocumentIcon style={menuIcon()} /> Copy
                  </button>
                  {!nested && (
                    <button onClick={onReply} style={menuBtn()}>
                      <ArrowUturnLeftIcon style={menuIcon()} /> Reply
                    </button>
                  )}
                  {isMine && (
                    <>
                      <button onClick={onStartEdit} style={menuBtn()}>
                        <PencilIcon style={menuIcon()} /> Edit
                      </button>
                      <button onClick={onDelete} style={{ ...menuBtn(), color: '#EF4444' }}>
                        <TrashIcon style={menuIcon()} /> Delete
                      </button>
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {editing ? (
          <div style={{ marginTop: 4 }}>
            <textarea
              autoFocus
              value={editDraft}
              onChange={e => setEditDraft(e.target.value)}
              style={{
                width: '100%', background: 'var(--color-surface)',
                border: '1px solid var(--color-border)', borderRadius: 8,
                padding: '8px 10px', fontFamily: 'var(--font-sans)', fontSize: 13,
                color: 'var(--color-text)', outline: 'none', resize: 'vertical',
                boxSizing: 'border-box', minHeight: 60,
              }}
            />
            <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
              <button onClick={onSaveEdit} style={{
                background: 'var(--color-text)', color: 'var(--color-bg)',
                border: 'none', borderRadius: 7, padding: '5px 12px',
                fontFamily: 'var(--font-sans)', fontSize: 12, fontWeight: 700, cursor: 'pointer',
              }}>Save</button>
              <button onClick={onCancelEdit} style={{
                background: 'var(--color-surface)', color: 'var(--color-text-muted)',
                border: '1px solid var(--color-border)', borderRadius: 7,
                padding: '5px 12px', fontFamily: 'var(--font-sans)', fontSize: 12, cursor: 'pointer',
              }}>Cancel</button>
            </div>
          </div>
        ) : (
          <div style={{ marginTop: 4 }}>
            {comment.content && (
              <div style={{
                padding: '8px 12px',
                background: 'var(--color-surface)',
                borderRadius: 8,
                fontFamily: 'var(--font-sans)', fontSize: 13,
                color: 'var(--color-text)', whiteSpace: 'pre-wrap', lineHeight: 1.5,
                wordBreak: 'break-word',
              }}>{renderCommentBody(comment.content, mentionMembers)}</div>
            )}
            {Array.isArray(comment.attachments) && comment.attachments.length > 0 && (
              <div style={{
                display: 'flex', flexWrap: 'wrap', gap: 6,
                marginTop: comment.content ? 6 : 0,
              }}>
                {comment.attachments.map((a, idx) => (
                  <AttachmentChip
                    key={a.path || idx}
                    attachment={a}
                    onPreview={comment.__onPreview}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Reaction strip — thumbs up/down + counts */}
        {!editing && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
            <button onClick={onThumbUp} title="Thumbs up" style={reactionBtnStyle(mine === 'up')}>
              <HandThumbUpIcon style={{ width: 12, height: 12 }} />
              {up > 0 && <span>{up}</span>}
            </button>
            <button onClick={onThumbDown} title="Thumbs down" style={reactionBtnStyle(mine === 'down')}>
              <HandThumbDownIcon style={{ width: 12, height: 12 }} />
              {down > 0 && <span>{down}</span>}
            </button>
            {!nested && replies.length === 0 && (
              <button onClick={onReply} title="Reply" style={{
                display: 'flex', alignItems: 'center', gap: 4,
                background: 'transparent', border: 'none', cursor: 'pointer',
                color: 'var(--color-text-muted)',
                fontFamily: 'var(--font-sans)', fontSize: 11, fontWeight: 600,
                padding: '3px 6px', borderRadius: 6,
              }}>
                <ArrowUturnLeftIcon style={{ width: 12, height: 12 }} />
                Reply
              </button>
            )}
          </div>
        )}

        {/* Inline reply composer */}
        {replying && !nested && (
          <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
            <Avatar name={currentUserName} src={currentUserAvatar} size={22} />
            <textarea
              autoFocus
              value={replyDraft}
              onChange={e => setReplyDraft(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); onSubmitReply() }
              }}
              placeholder="Write a reply..."
              style={{
                flex: 1, background: 'var(--color-surface)',
                border: '1px solid var(--color-border)', borderRadius: 8,
                padding: '6px 10px', fontFamily: 'var(--font-sans)', fontSize: 12,
                color: 'var(--color-text)', outline: 'none', resize: 'vertical',
                minHeight: 40, boxSizing: 'border-box',
              }}
            />
            <button onClick={onSubmitReply} disabled={!replyDraft.trim()} style={{
              background: replyDraft.trim() ? 'var(--color-accent)' : 'var(--color-surface)',
              color: replyDraft.trim() ? 'var(--color-accent-text)' : 'var(--color-text-muted)',
              border: 'none', borderRadius: 8,
              width: 32, height: 32, padding: 0,
              cursor: replyDraft.trim() ? 'pointer' : 'default',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              <ArrowUpIcon style={{ width: 14, height: 14 }} />
            </button>
          </div>
        )}

        {/* Nested replies — pass through the parent's handler factory so each
            reply gets its OWN wired set of actions (menu/edit/delete/thumbs) */}
        {replies.length > 0 && makeHandlersForComment && (
          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {replies.map(r => {
              const h = makeHandlersForComment(r)
              return (
                <CommentRow
                  key={'r' + r.id}
                  comment={r}
                  {...h}
                  nested
                  reactionsMap={reactionsMap}
                  makeHandlersForComment={makeHandlersForComment}
                  currentUserName={currentUserName}
                  currentUserAvatar={currentUserAvatar}
                  resolveAvatar={resolveAvatar}
                  mentionMembers={mentionMembers}
                />
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function menuBtn() {
  return {
    width: '100%',
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '7px 9px', borderRadius: 7,
    background: 'transparent', border: 'none', cursor: 'pointer',
    color: 'var(--color-text)',
    fontFamily: 'var(--font-sans)', fontSize: 12, fontWeight: 500,
    textAlign: 'left',
  }
}
function menuIcon() { return { width: 13, height: 13 } }
function reactionBtnStyle(active) {
  return {
    display: 'flex', alignItems: 'center', gap: 4,
    background: active ? 'var(--color-accent-soft)' : 'transparent',
    border: '1px solid ' + (active ? 'rgba(13,148,136,0.3)' : 'var(--color-border)'),
    borderRadius: 100, padding: '3px 8px',
    cursor: 'pointer',
    color: active ? 'var(--color-accent)' : 'var(--color-text-muted)',
    fontFamily: 'var(--font-sans)', fontSize: 11, fontWeight: 600,
  }
}

// ─── Main component ─────────────────────────────────────────────────────────

export default function TaskDetailModal({
  task: initialTask,
  projectId,
  projectName = 'Project',
  briefContext = null, // translated-brief snapshot — sharpens AI prompts
  authUser,
  user,
  teamMembers = [],
  projectMembers = {}, // { [user_id]: { name, avatarUrl, email } }
  onUpdate,
  onDelete,
  onClose,
  currentUserRole = 'Admin', // 'Admin' | 'Editor' | 'Viewer'
}) {
  // RBAC: Viewers can read everything and post comments, but cannot edit
  // the task itself or delete it. Admin and Editor have full task-edit rights.
  const canEdit = currentUserRole !== 'Viewer'
  const canDelete = currentUserRole === 'Admin'
  // ── Track viewport for mobile bottom-sheet variant ─────────────────────
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' && window.innerWidth <= 768
  )
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth <= 768)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  // ── Local copy of the task — patched optimistically ────────────────────
  const [task, setTask] = useState(initialTask)
  const taskRef = useRef(task)
  taskRef.current = task

  // Sync if parent passes a new task (e.g. realtime update from kanban)
  useEffect(() => {
    if (initialTask?.id !== taskRef.current?.id) {
      setTask(initialTask)
    }
  }, [initialTask?.id])

  // ── Lists ──────────────────────────────────────────────────────────────
  const [subtasks, setSubtasks] = useState([])
  const [comments, setComments] = useState([])
  const [activity, setActivity] = useState([])

  // ── UI state ───────────────────────────────────────────────────────────
  const [activityTab, setActivityTab] = useState('comments')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [titleDraft, setTitleDraft] = useState(task?.title || '')
  const [descDraft, setDescDraft] = useState(task?.description || '')
  // If the task opens with no title (created via "+ Add Task"), drop straight
  // into title-edit mode so the user can just start typing.
  const [editingTitle, setEditingTitle] = useState(() => !task?.title || !task.title.trim())
  const [editingDesc, setEditingDesc] = useState(false)
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('')
  const [addingSubtask, setAddingSubtask] = useState(false)
  const [newComment, setNewComment] = useState('')
  const [showStatus, setShowStatus] = useState(false)
  const [showPriority, setShowPriority] = useState(false)
  const [showAssignee, setShowAssignee] = useState(false)
  const [showReporter, setShowReporter] = useState(false)
  const [aiPromptOpen, setAiPromptOpen] = useState(true)
  const [copiedPrompt, setCopiedPrompt] = useState(false)
  const [showLabels, setShowLabels] = useState(false)
  const [newLabel, setNewLabel] = useState('')
  const [showMoreMenu, setShowMoreMenu] = useState(false)
  const [enhancing, setEnhancing] = useState(false)
  const [generatingPrompt, setGeneratingPrompt] = useState(false)
  // After a successful enhance, hold onto the user's original text so
  // they can hit "Restore original" if they preferred their wording.
  // Auto-clears after 30s so it doesn't linger forever.
  const [originalDescription, setOriginalDescription] = useState(null)
  const restoreTimerRef = useRef(null)
  // Project design system — loaded lazily so AI helpers honour the saved tokens.
  const [designSystem, setDesignSystem] = useState(null)
  useEffect(() => {
    let cancelled = false
    if (!projectId) { setDesignSystem(null); return }
    fetchDesignSystem(projectId).then(ds => { if (!cancelled) setDesignSystem(ds) })
    return () => { cancelled = true }
  }, [projectId])
  const [shareToast, setShareToast] = useState(null)
  // Mobile-only: switch between left (Task) and right (Details) panels
  const [mobileTab, setMobileTab] = useState('task') // 'task' | 'details'
  // Ref for the left-panel scroll container so we can auto-scroll to bottom
  // when a new comment is added (so it doesn't hide behind the composer).
  const leftScrollRef = useRef(null)
  // Per-comment UI state
  const [editingCommentId, setEditingCommentId] = useState(null)
  const [editingCommentDraft, setEditingCommentDraft] = useState('')
  const [openCommentMenuId, setOpenCommentMenuId] = useState(null)
  const [replyingToId, setReplyingToId] = useState(null)
  const [replyDraft, setReplyDraft] = useState('')
  // Local reaction map: { [commentId]: { up: number, down: number, mine: 'up'|'down'|null } }
  const [reactions, setReactions] = useState({})
  // Pending attachments for the next comment to be sent
  const [pendingAttachments, setPendingAttachments] = useState([])
  const [uploading, setUploading] = useState(false)
  const documentInputRef = useRef(null)
  const imageInputRef = useRef(null)
  // File preview modal (Slack-style inline doc viewer)
  const [previewFile, setPreviewFile] = useState(null)

  // Description textarea auto-grows with content (capped, then scrolls)
  const descTextareaRef = useRef(null)
  useEffect(() => {
    const el = descTextareaRef.current
    if (!el) return
    el.style.height = 'auto'
    const scroll = el.scrollHeight
    const max = 400
    el.style.height = Math.min(scroll, max) + 'px'
    el.style.overflowY = scroll > max ? 'auto' : 'hidden'
  }, [descDraft, editingDesc])

  // Close any popover when user clicks outside
  const popoverRef = useRef(null)
  useEffect(() => {
    function onDocClick(e) {
      if (!popoverRef.current) return
      if (!popoverRef.current.contains(e.target)) {
        setShowStatus(false); setShowPriority(false)
        setShowAssignee(false); setShowLabels(false)
        setShowMoreMenu(false)
      }
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  // ── Initial fetch of subtasks / comments / activity ────────────────────
  useEffect(() => {
    if (!task?.id) return
    let cancelled = false
    getSubtasks(task.id).then(d => { if (!cancelled) setSubtasks(d || []) }).catch(() => {})
    getComments(task.id).then(d => { if (!cancelled) setComments(d || []) }).catch(() => {})
    getActivity(task.id).then(d => { if (!cancelled) setActivity(d || []) }).catch(() => {})
    return () => { cancelled = true }
  }, [task?.id])

  // ── Polling fallback: refetch comments / subtasks / activity every 8s
  // while the modal is visible. Realtime is preferred (the subscription
  // catches push events) but it can silently fail when:
  //   - The relevant table isn't in supabase_realtime publication
  //   - The websocket dropped during a tab/network blip
  //   - RLS is misconfigured for the broadcast
  // Polling guarantees the user sees fresh state within ~8s without
  // a full page refresh.
  useEffect(() => {
    if (!task?.id) return
    let cancelled = false

    const refetch = async () => {
      if (cancelled || document.hidden) return
      try {
        const [subs, cmts, acts] = await Promise.all([
          getSubtasks(task.id),
          getComments(task.id),
          getActivity(task.id),
        ])
        if (cancelled) return
        // Replace only if length OR most-recent-id differs to avoid
        // needless re-renders that could disturb in-progress edits
        setSubtasks(prev => {
          if (prev.length === subs.length && prev[prev.length - 1]?.id === subs[subs.length - 1]?.id) return prev
          return subs
        })
        setComments(prev => {
          if (prev.length === cmts.length && prev[prev.length - 1]?.id === cmts[cmts.length - 1]?.id) return prev
          return cmts
        })
        setActivity(prev => {
          if (prev.length === acts.length && prev[0]?.id === acts[0]?.id) return prev
          return acts
        })
      } catch {
        /* transient — next tick will retry */
      }
    }

    const interval = setInterval(refetch, 8000)
    const onVis = () => { if (!document.hidden) refetch() }
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('focus', refetch)

    return () => {
      cancelled = true
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('focus', refetch)
    }
  }, [task?.id])

  // ── Real-time subscription for this open task ──────────────────────────
  useEffect(() => {
    if (!task?.id) return
    const channel = supabase
      .channel(`task-detail-${task.id}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'tasks',
        filter: `id=eq.${task.id}`,
      }, payload => {
        const remote = mapDBTask(payload.new)
        // Only apply if it's a real change from another device — we already
        // patched local state optimistically for our own actions.
        setTask(prev => {
          if (!prev) return remote
          return { ...prev, ...remote }
        })
      })
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'task_comments',
        filter: `task_id=eq.${task.id}`,
      }, payload => {
        setComments(prev => prev.some(c => c.id === payload.new.id)
          ? prev
          : [...prev, payload.new])
      })
      .on('postgres_changes', {
        event: 'DELETE', schema: 'public', table: 'task_comments',
        filter: `task_id=eq.${task.id}`,
      }, payload => {
        setComments(prev => prev.filter(c => c.id !== payload.old.id))
      })
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'subtasks',
        filter: `task_id=eq.${task.id}`,
      }, payload => {
        if (payload.eventType === 'INSERT') {
          setSubtasks(prev => prev.some(s => s.id === payload.new.id)
            ? prev : [...prev, payload.new])
        } else if (payload.eventType === 'UPDATE') {
          setSubtasks(prev => prev.map(s => s.id === payload.new.id ? payload.new : s))
        } else if (payload.eventType === 'DELETE') {
          setSubtasks(prev => prev.filter(s => s.id !== payload.old.id))
        }
      })
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'task_activity',
        filter: `task_id=eq.${task.id}`,
      }, payload => {
        setActivity(prev => prev.some(a => a.id === payload.new.id)
          ? prev : [payload.new, ...prev])
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [task?.id])

  // ── Escape to close ────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Auto-scroll the activity feed to the bottom when comment count grows,
  // so the newest comment is visible above the composer instead of hidden
  // behind it. Only fires when we're already near the bottom (don't yank
  // the user away if they're reading older comments).
  const prevCommentCountRef = useRef(0)
  useEffect(() => {
    const el = leftScrollRef.current
    if (!el) return
    const grew = comments.length > prevCommentCountRef.current
    prevCommentCountRef.current = comments.length
    if (!grew) return
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    if (distanceFromBottom < 200) {
      // Smooth scroll to the very bottom
      requestAnimationFrame(() => {
        el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
      })
    }
  }, [comments.length])

  // ── Save helper ────────────────────────────────────────────────────────
  async function patchTask(updates, activityAction, oldValue, newValue) {
    // RBAC: Viewers cannot mutate the task itself. Their comment writes go
    // through a separate code path that remains open.
    if (!canEdit) return
    const next = { ...task, ...updates }
    setTask(next)
    onUpdate?.(next)
    try {
      await updateTaskInDB(next)
      if (activityAction && projectId && authUser?.id) {
        await logActivity(
          task.id, projectId, authUser.id,
          user?.firstName || user?.name || 'User',
          activityAction,
          oldValue == null ? '' : String(oldValue),
          newValue == null ? '' : String(newValue),
        )
        // Refetch activity right after our own write so the History tab
        // updates immediately, without waiting for realtime or polling.
        getActivity(task.id).then(d => setActivity(d || [])).catch(() => {})
      }
    } catch (e) {
      console.error('[TaskDetailModal] patchTask', e)
    }
  }

  // ── Field handlers ─────────────────────────────────────────────────────
  function commitTitle() {
    setEditingTitle(false)
    const trimmed = titleDraft.trim()
    if (!trimmed || trimmed === task.title) {
      setTitleDraft(task.title || '')
      return
    }
    patchTask({ title: trimmed }, 'renamed', task.title, trimmed)
  }

  function commitDesc() {
    setEditingDesc(false)
    if (descDraft === (task.description || '')) return
    patchTask({ description: descDraft }, 'updated description')
  }

  async function changeStatus(newStatus) {
    setShowStatus(false)
    if (newStatus === task.column) return
    await patchTask({ column: newStatus }, 'moved', task.column, newStatus)
  }

  async function changePriority(newPriority) {
    setShowPriority(false)
    if (newPriority === task.priority) return
    await patchTask({ priority: newPriority }, 'set priority', task.priority || 'none', newPriority)
  }

  async function changeAssignee(member) {
    setShowAssignee(false)
    const name = member?.name || member?.role || ''
    const role = member?.role || ''
    // userId may come from a project_members row (real auth user) or from
    // the explicit "Assign to me" button. Persisting it lets the kanban
    // resolve the assignee's avatar even after a refresh.
    const userId = member?.userId || member?.id || null
    if (
      name === (task.assignedName || '') &&
      userId === (task.assignedUserId || null)
    ) return
    await patchTask(
      {
        assignedName: name,
        assignedRole: role,
        assignedUserId: userId || null,
      },
      'assigned',
      task.assignedName || 'Unassigned',
      name || 'Unassigned',
    )
  }

  async function changeReporter(member) {
    setShowReporter(false)
    const userId = member?.userId || member?.id || null
    if (userId === (task.reporterId || null)) return
    const reporterName = member?.name || null
    const prevName = task.reporterId
      ? (projectMembers?.[task.reporterId]?.name || 'previous reporter')
      : (user?.firstName || user?.name || 'no reporter')
    await patchTask(
      { reporterId: userId },
      'changed reporter',
      prevName,
      reporterName || 'Unassigned',
    )
  }

  async function changeDueDate(iso) {
    if (iso === (task.dueDate || '')) return
    await patchTask({ dueDate: iso || null }, 'changed due date', task.dueDate || '', iso || 'cleared')
  }

  async function changeStartDate(iso) {
    if (iso === (task.startDate || '')) return
    await patchTask({ startDate: iso || null }, 'changed start date', task.startDate || '', iso || 'cleared')
  }

  async function addLabelTag(label) {
    const existing = Array.isArray(task.labels) ? task.labels : []
    if (existing.includes(label)) return
    const next = [...existing, label]
    await patchTask({ labels: next }, 'added label', '', label)
  }

  async function removeLabelTag(label) {
    const existing = Array.isArray(task.labels) ? task.labels : []
    const next = existing.filter(l => l !== label)
    await patchTask({ labels: next }, 'removed label', label, '')
  }

  // ── Subtasks ───────────────────────────────────────────────────────────
  async function handleAddSubtask() {
    const t = newSubtaskTitle.trim()
    if (!t) return
    setNewSubtaskTitle('')
    setAddingSubtask(false)
    try {
      const created = await addSubtask(task.id, projectId, t)
      if (created) {
        setSubtasks(prev => prev.some(s => s.id === created.id) ? prev : [...prev, created])
      }
      if (projectId && authUser?.id) {
        logActivity(task.id, projectId, authUser.id,
          user?.firstName || 'User', 'added subtask', '', t).catch(() => {})
      }
    } catch (e) {
      console.error('[TaskDetailModal] addSubtask', e)
    }
  }

  async function toggleSubtask(s) {
    const next = !s.completed
    setSubtasks(prev => prev.map(x => x.id === s.id ? { ...x, completed: next } : x))
    try {
      await updateSubtask(s.id, { completed: next })
    } catch (e) { console.error(e) }
  }

  async function removeSubtask(id) {
    setSubtasks(prev => prev.filter(s => s.id !== id))
    try {
      await deleteSubtask(id)
    } catch (e) { console.error(e) }
  }

  // ── File upload to Supabase Storage ────────────────────────────────────
  async function handleFilesSelected(files) {
    if (!files || files.length === 0) return
    setUploading(true)
    const uploaded = []
    for (const file of files) {
      try {
        // 5 MB cap per file (Vercel function limit + Supabase free tier sanity)
        if (file.size > 5 * 1024 * 1024) {
          setShareToast(`${file.name} is over 5MB`)
          setTimeout(() => setShareToast(null), 2200)
          continue
        }
        const ext = file.name.split('.').pop() || 'bin'
        const path = `${task.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
        const { error } = await supabase.storage
          .from('task-attachments')
          .upload(path, file, { contentType: file.type || 'application/octet-stream' })
        if (error) throw error
        const { data: pub } = supabase.storage.from('task-attachments').getPublicUrl(path)
        uploaded.push({
          path,
          url: pub?.publicUrl,
          name: file.name,
          size: file.size,
          type: file.type || 'application/octet-stream',
        })
      } catch (e) {
        console.error('[upload]', e)
        setShareToast(`Upload failed: ${e.message || file.name}`)
        setTimeout(() => setShareToast(null), 2500)
      }
    }
    setUploading(false)
    if (uploaded.length > 0) {
      setPendingAttachments(prev => [...prev, ...uploaded])
    }
    // reset both inputs so picking the same file again re-fires onChange
    if (documentInputRef.current) documentInputRef.current.value = ''
    if (imageInputRef.current) imageInputRef.current.value = ''
  }

  function removePendingAttachment(idx) {
    setPendingAttachments(prev => prev.filter((_, i) => i !== idx))
  }

  // ── Comments ───────────────────────────────────────────────────────────
  async function handleAddComment() {
    const c = newComment.trim()
    const atts = pendingAttachments
    if ((!c && atts.length === 0) || !authUser?.id) return
    setNewComment('')
    setPendingAttachments([])
    try {
      // Use the underlying API directly to pass attachments
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) throw new Error('No session')
      const res = await fetch('/api/create-workspace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          kind: 'comment',
          task_id: task.id,
          project_id: projectId,
          author_name: user?.firstName || user?.name || 'User',
          content: c,
          attachments: atts,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (data?.comment) {
        setComments(prev => prev.some(x => x.id === data.comment.id) ? prev : [...prev, data.comment])
      }
    } catch (e) {
      console.error('[TaskDetailModal] addComment', e)
    }
  }

  async function handleDeleteComment(id) {
    setComments(prev => prev.filter(c => c.id !== id))
    setOpenCommentMenuId(null)
    try { await deleteComment(id) } catch (e) { console.error(e) }
  }

  // Begin editing a comment (replaces inline content with a textarea)
  function startEditComment(c) {
    setEditingCommentId(c.id)
    setEditingCommentDraft(c.content || '')
    setOpenCommentMenuId(null)
  }
  async function saveEditComment(c) {
    const trimmed = editingCommentDraft.trim()
    setEditingCommentId(null)
    if (!trimmed || trimmed === c.content) return
    // Optimistic
    setComments(prev => prev.map(x => x.id === c.id ? { ...x, content: trimmed } : x))
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) throw new Error('No session')
      await fetch('/api/create-workspace', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ comment_id: c.id, updates: { content: trimmed } }),
      })
    } catch (e) {
      console.error('[edit comment]', e)
    }
  }

  function copyComment(c) {
    navigator.clipboard?.writeText(c.content || '').catch(() => {})
    setOpenCommentMenuId(null)
    setShareToast('Comment copied')
    setTimeout(() => setShareToast(null), 1400)
  }

  async function submitReply(parent) {
    const body = replyDraft.trim()
    if (!body || !authUser?.id) return
    setReplyDraft('')
    setReplyingToId(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) throw new Error('No session')
      const res = await fetch('/api/create-workspace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          kind: 'comment',
          task_id: task.id,
          project_id: projectId,
          author_name: user?.firstName || user?.name || 'User',
          content: body,
          parent_id: parent.id,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (data?.comment) {
        setComments(prev => prev.some(x => x.id === data.comment.id) ? prev : [...prev, data.comment])
      }
    } catch (e) {
      console.error('[reply]', e)
    }
  }

  async function toggleReaction(comment, kind /* 'up'|'down' */) {
    if (!authUser?.id) return
    // Optimistic update of local counter / mine flag
    setReactions(prev => {
      const cur = prev[comment.id] || { up: 0, down: 0, mine: null }
      let { up, down, mine } = cur
      if (mine === kind) {
        // toggle off
        if (kind === 'up') up = Math.max(0, up - 1); else down = Math.max(0, down - 1)
        mine = null
      } else {
        // switch or new
        if (mine === 'up') up = Math.max(0, up - 1)
        if (mine === 'down') down = Math.max(0, down - 1)
        if (kind === 'up') up += 1; else down += 1
        mine = kind
      }
      return { ...prev, [comment.id]: { up, down, mine } }
    })
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) return
      await fetch('/api/create-workspace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          kind: 'reaction', comment_id: comment.id, reaction: kind,
        }),
      })
    } catch (e) { console.warn('[reaction]', e) }
  }

  // Load existing reactions when the set of comment IDs grows. We only
  // fetch for IDs we don't yet have in `reactions`, and we MERGE into
  // existing state — never overwrite a locally-set optimistic value or
  // we'd "lose" a thumbs the user just clicked.
  const reactionsFetchedRef = useRef(new Set())
  useEffect(() => {
    if (!comments?.length) return
    const newIds = comments
      .map(c => c.id)
      .filter(id => !reactionsFetchedRef.current.has(id))
    if (newIds.length === 0) return
    newIds.forEach(id => reactionsFetchedRef.current.add(id))

    let cancelled = false
    supabase
      .from('task_comment_reactions')
      .select('comment_id, user_id, reaction')
      .in('comment_id', newIds)
      .then(({ data }) => {
        if (cancelled || !data) return
        const map = {}
        for (const r of data) {
          if (!map[r.comment_id]) map[r.comment_id] = { up: 0, down: 0, mine: null }
          if (r.reaction === 'up') map[r.comment_id].up++
          else if (r.reaction === 'down') map[r.comment_id].down++
          if (r.user_id === authUser?.id) map[r.comment_id].mine = r.reaction
        }
        setReactions(prev => {
          const next = { ...prev }
          for (const id of Object.keys(map)) {
            // Preserve existing optimistic state if it's already there
            if (!next[id]) next[id] = map[id]
          }
          return next
        })
      })
    return () => { cancelled = true }
  }, [comments.length, authUser?.id])

  // ── Share task link (robust: native share → clipboard → execCommand) ───
  async function handleShare() {
    const url = `${window.location.origin}/task/${task.id}`
    const shareData = {
      title: task.title || 'Task',
      text: `${task.title || 'Task'} — ${projectName}`,
      url,
    }

    // 1) Try Web Share API (mobile native share sheet)
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share(shareData)
        return  // success — native sheet handled it
      } catch (e) {
        // User pressed Cancel on the share sheet — silently bail
        if (e?.name === 'AbortError') return
        // Anything else (NotAllowedError, etc.) → fall through to clipboard
        console.warn('[share] navigator.share failed:', e?.name, e?.message)
      }
    }

    // 2) Modern Clipboard API
    let copied = false
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(url)
        copied = true
      }
    } catch (e) {
      console.warn('[share] clipboard.writeText failed:', e?.message)
    }

    // 3) Last-resort: hidden textarea + execCommand for non-HTTPS or old browsers
    if (!copied) {
      try {
        const ta = document.createElement('textarea')
        ta.value = url
        ta.style.position = 'fixed'
        ta.style.left = '-9999px'
        document.body.appendChild(ta)
        ta.select()
        copied = document.execCommand('copy')
        document.body.removeChild(ta)
      } catch (e) {
        console.warn('[share] execCommand fallback failed:', e?.message)
      }
    }

    setShareToast(copied ? 'Link copied to clipboard' : 'Could not copy link. Try again.')
    setTimeout(() => setShareToast(null), 2200)
  }

  // ── AI prompt copy ─────────────────────────────────────────────────────
  function copyAiPrompt() {
    if (!task.aiPrompt) return
    navigator.clipboard.writeText(task.aiPrompt).then(() => {
      setCopiedPrompt(true)
      setTimeout(() => setCopiedPrompt(false), 1500)
    }).catch(() => {})
  }

  // ── AI enhance description ─────────────────────────────────────────────
  async function handleEnhanceDescription() {
    if (enhancing) return
    const before = descDraft || task.description || ''
    if (!before.trim()) return
    setEnhancing(true)
    try {
      const enhanced = await enhanceDescription(before, task.title, briefContext, designSystem)
      if (enhanced) {
        setOriginalDescription(before)
        if (restoreTimerRef.current) clearTimeout(restoreTimerRef.current)
        restoreTimerRef.current = setTimeout(() => setOriginalDescription(null), 30000)
        setDescDraft(enhanced)
        await patchTask({ description: enhanced }, 'enhanced description with AI')
      }
    } catch (e) {
      console.error('[enhance]', e)
      setOriginalDescription(null)
    } finally {
      setEnhancing(false)
    }
  }

  function handleRestoreOriginal() {
    if (!originalDescription) return
    const restored = originalDescription
    setDescDraft(restored)
    patchTask({ description: restored }, 'restored original description')
    if (restoreTimerRef.current) clearTimeout(restoreTimerRef.current)
    setOriginalDescription(null)
  }

  // Clear pending restore timer on unmount so it can't fire on a
  // remounted modal for a different task.
  useEffect(() => () => {
    if (restoreTimerRef.current) clearTimeout(restoreTimerRef.current)
  }, [])

  // ── AI generate task prompt ────────────────────────────────────────────
  async function handleGenerateAIPrompt() {
    if (generatingPrompt) return
    setGeneratingPrompt(true)
    try {
      const prompt = await generateAIPrompt(task.title, task.description, briefContext, designSystem)
      if (prompt) {
        await patchTask({ aiPrompt: prompt }, task.aiPrompt ? 'regenerated AI prompt' : 'generated AI prompt')
        setAiPromptOpen(true)
      }
    } catch (e) {
      console.error('[gen ai prompt]', e)
    } finally {
      setGeneratingPrompt(false)
    }
  }

  // ── Derived ────────────────────────────────────────────────────────────
  const statusColor = STATUS_COLORS[task.column] || '#6B7280'
  const priorityMeta = PRIORITY_OPTIONS.find(p => p.id === (task.priority || 'none')) || PRIORITY_OPTIONS[4]
  const overdue = isOverdue(task.dueDate)

  // Build a handler set for any comment (top-level OR reply) so the reply
  // row gets the same Copy / Edit / Delete / Thumbs / Reply wiring as a
  // top-level comment.
  const makeHandlersForComment = (c) => ({
    isMine: c.user_id === authUser?.id,
    reaction: reactions[c.id],
    editing: editingCommentId === c.id,
    editDraft: editingCommentDraft,
    setEditDraft: setEditingCommentDraft,
    menuOpen: openCommentMenuId === c.id,
    setMenuOpen: (v) => setOpenCommentMenuId(v ? c.id : null),
    onStartEdit: () => startEditComment(c),
    onSaveEdit: () => saveEditComment(c),
    onCancelEdit: () => setEditingCommentId(null),
    onDelete: () => handleDeleteComment(c.id),
    onCopy: () => copyComment(c),
    onReply: () => { setReplyingToId(c.id); setReplyDraft('') },
    onThumbUp: () => toggleReaction(c, 'up'),
    onThumbDown: () => toggleReaction(c, 'down'),
    currentUserName: user?.firstName || user?.name,
  })

  // The signed-in user's name + avatar — pulled live from auth metadata so
  // a fresh upload / rename appears immediately on the reply composer + on
  // their own comments / activity entries.
  const currentUserName = user?.firstName || user?.name || authUser?.user_metadata?.full_name || authUser?.email?.split('@')[0] || ''
  const currentUserAvatar = authUser?.user_metadata?.avatar_url || null

  // Flat list of mention candidates for the composer's @ dropdown + the
  // mention highlighter inside rendered comments.
  const mentionMembers = Object.entries(projectMembers || {}).map(([uid, m]) => ({
    userId: uid,
    name: m.name || '',
    email: m.email || '',
    avatarUrl: m.avatarUrl || null,
  }))

  // Resolve an avatar URL for any comment / activity row. Tries (in order):
  //   1. row.user_id → projectMembers (with self override to authUser
  //      metadata so the current user always sees their newest photo).
  //   2. row.author_name / row.actor_name → case-insensitive name match
  //      against projectMembers (covers older rows without user_id).
  //   3. null (Avatar falls back to initials).
  function resolveAvatar(row) {
    if (!row) return null
    const uid = row.user_id || row.userId || null
    if (uid && uid === authUser?.id) {
      return authUser?.user_metadata?.avatar_url || projectMembers?.[uid]?.avatarUrl || null
    }
    if (uid && projectMembers?.[uid]?.avatarUrl) return projectMembers[uid].avatarUrl
    const name = (row.author_name || row.actor_name || row.name || '').toLowerCase()
    if (name) {
      const match = Object.values(projectMembers || {}).find(m => (m.name || '').toLowerCase() === name)
      if (match?.avatarUrl) return match.avatarUrl
    }
    return null
  }

  // Compute activity feed view (top-level comments only; replies nested under their parent)
  const topLevelComments = comments.filter(c => !c.parent_id)
  const filteredActivity = activityTab === 'comments'
    ? topLevelComments.map(c => ({ kind: 'comment', ...c }))
    : activityTab === 'history'
      ? activity.map(a => ({ kind: 'activity', ...a }))
      : [
          ...topLevelComments.map(c => ({ kind: 'comment', ts: c.created_at, ...c })),
          ...activity.map(a => ({ kind: 'activity', ts: a.created_at, ...a })),
        ].sort((a, b) => new Date(b.ts || b.created_at) - new Date(a.ts || a.created_at))

  // ── Styles (object-style for portability with CSS vars) ────────────────
  const overlayStyle = {
    position: 'fixed', inset: 0, zIndex: 250,
    background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)',
    display: 'flex', alignItems: isMobile ? 'flex-end' : 'center', justifyContent: 'center',
    padding: isMobile ? 0 : 24,
    animation: 'tdmFade 0.2s ease',
  }
  const shellStyle = {
    position: 'relative',  // anchor for the toast
    background: 'var(--color-bg)',
    border: '1px solid var(--color-border)',
    borderRadius: isMobile ? '20px 20px 0 0' : 16,
    width: isMobile ? '100%' : '85vw',
    maxWidth: isMobile ? '100%' : 1100,
    // Use dvh so the modal doesn't get crushed by mobile keyboards
    height: isMobile ? '94dvh' : '90vh',
    maxHeight: isMobile ? '94dvh' : '90vh',
    overflow: 'hidden',
    display: 'flex', flexDirection: 'column',
    boxShadow: '0 24px 80px rgba(0,0,0,0.3)',
    animation: isMobile ? 'tdmSlideUp 0.25s ease' : 'tdmFadeUp 0.25s ease',
  }
  const headerStyle = {
    height: isMobile ? 48 : 52, flexShrink: 0,
    padding: isMobile ? '0 10px' : '0 18px',
    borderBottom: '1px solid var(--color-border)',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    fontFamily: 'var(--font-sans)',
    gap: 4,
  }
  const bodyStyle = {
    flex: 1, display: 'flex', overflow: 'hidden',
    flexDirection: 'row',
    minHeight: 0,
  }
  // On mobile we render only ONE panel at a time, selected by mobileTab.
  // No stacking, no 50vh cap — each panel takes the full body height.
  const leftStyle = {
    width: isMobile ? '100%' : '60%',
    height: '100%',
    borderRight: isMobile ? 'none' : '1px solid var(--color-border)',
    display: isMobile && mobileTab !== 'task' ? 'none' : 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    minHeight: 0,
  }
  const rightStyle = {
    width: isMobile ? '100%' : '40%',
    height: '100%',
    overflowY: 'auto',
    padding: isMobile ? '14px 16px 24px' : '20px 22px',
    background: 'var(--color-card)',
    flexShrink: 0,
    display: isMobile && mobileTab !== 'details' ? 'none' : 'block',
  }
  const detailRowStyle = {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '8px 10px',
    borderRadius: 8,
    cursor: 'pointer',
    fontFamily: 'var(--font-sans)',
    transition: 'background 0.12s',
    gap: 10,
  }
  const labelStyle = {
    fontSize: 13, color: 'var(--color-text-muted)',
    fontFamily: 'var(--font-sans)',
    minWidth: isMobile ? 70 : 84,
    flexShrink: 0,
  }

  return (
    <div style={overlayStyle} onClick={onClose}>
      <style>{`
        @keyframes tdmFade { from { opacity: 0 } to { opacity: 1 } }
        @keyframes tdmFadeUp { from { opacity: 0; transform: translateY(8px) } to { opacity: 1; transform: translateY(0) } }
        @keyframes tdmSlideUp { from { transform: translateY(100%) } to { transform: translateY(0) } }
        .tdm-row:hover { background: var(--color-surface) }
        .tdm-tab { padding: 6px 12px; border-radius: 8px; cursor: pointer; font-size: 12px; font-weight: 600; font-family: var(--font-sans); color: var(--color-text-muted); }
        .tdm-tab-active { background: var(--color-surface); color: var(--color-text); }
      `}</style>

      <div style={shellStyle} onClick={e => e.stopPropagation()} ref={popoverRef}>

        {/* HEADER */}
        <div style={headerStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--color-text-muted)', fontSize: 13, overflow: 'hidden', minWidth: 0 }}>
            {!isMobile && (
              <>
                <span style={{ fontFamily: 'var(--font-sans)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 }}>{projectName}</span>
                <span>/</span>
              </>
            )}
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--color-text)' }}>
              TASK-{(task.id || '').slice(-6).toUpperCase()}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
            {!isMobile && (
              <button title="Viewers" style={iconBtn()}>
                <EyeIcon style={iconSize()} /><span style={{ fontSize: 11, marginLeft: 4 }}>1</span>
              </button>
            )}
            <button title="Share task link" style={iconBtn()} onClick={handleShare}>
              <ShareIcon style={iconSize()} />
            </button>
            <div style={{ position: 'relative' }}>
              <button title="More options" style={iconBtn()} onClick={() => setShowMoreMenu(s => !s)}>
                <EllipsisHorizontalIcon style={iconSize()} />
              </button>
              {showMoreMenu && (
                <div style={popoverStyle({ top: '100%', right: 0, minWidth: 180 })}>
                  {canDelete ? (
                    <div className="tdm-row"
                      onClick={() => {
                        setShowMoreMenu(false)
                        setConfirmDelete(true)
                      }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '8px 10px', cursor: 'pointer',
                        fontFamily: 'var(--font-sans)', fontSize: 13,
                        color: '#EF4444',
                      }}>
                      <TrashIcon style={{ width: 13, height: 13 }} />
                      Delete Task
                    </div>
                  ) : (
                    <div style={{
                      padding: '8px 10px',
                      fontFamily: 'var(--font-sans)', fontSize: 12,
                      color: 'var(--color-text-muted)',
                    }}>
                      Only the project Admin can delete tasks.
                    </div>
                  )}
                </div>
              )}
            </div>
            <button title="Close" onClick={onClose} style={iconBtn()}>
              <XMarkIcon style={iconSize()} />
            </button>
          </div>
        </div>

        {/* MOBILE TAB BAR — switch between Task content and Details/Properties */}
        {isMobile && (
          <div style={{
            flexShrink: 0,
            display: 'flex',
            borderBottom: '1px solid var(--color-border)',
            background: 'var(--color-bg)',
          }}>
            {[
              { id: 'task',    label: 'Task' },
              { id: 'details', label: 'Details' },
            ].map(t => {
              const active = mobileTab === t.id
              return (
                <button key={t.id}
                  onClick={() => setMobileTab(t.id)}
                  style={{
                    flex: 1, padding: '11px 0',
                    background: 'transparent', border: 'none',
                    borderBottom: active ? '2px solid var(--color-accent)' : '2px solid transparent',
                    fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 700,
                    color: active ? 'var(--color-text)' : 'var(--color-text-muted)',
                    cursor: 'pointer',
                    transition: 'color 0.15s, border-color 0.15s',
                  }}>{t.label}</button>
              )
            })}
          </div>
        )}

        {/* BODY */}
        <div style={bodyStyle}>

          {/* LEFT PANEL */}
          <div style={leftStyle}>
            <div ref={leftScrollRef} style={{
              flex: 1, minHeight: 0, overflowY: 'auto',
              padding: isMobile ? '16px 16px 12px' : '22px 26px 16px',
            }}>

              {/* TITLE */}
              {editingTitle ? (
                <input
                  autoFocus
                  value={titleDraft}
                  onChange={e => setTitleDraft(e.target.value)}
                  onBlur={commitTitle}
                  onKeyDown={e => { if (e.key === 'Enter') commitTitle(); if (e.key === 'Escape') { setTitleDraft(task.title || ''); setEditingTitle(false) } }}
                  style={{
                    width: '100%', background: 'transparent', border: 'none',
                    outline: 'none', borderBottom: '2px solid var(--color-accent)',
                    fontFamily: 'var(--font-sans)', fontSize: isMobile ? 19 : 24, fontWeight: 700,
                    color: 'var(--color-text)', letterSpacing: '-0.02em',
                    padding: '4px 0',
                  }}
                />
              ) : (
                <h1
                  onClick={() => { if (canEdit) { setTitleDraft(task.title || ''); setEditingTitle(true) } }}
                  style={{
                    margin: 0, padding: '4px 0',
                    fontFamily: 'var(--font-sans)', fontSize: isMobile ? 19 : 24, fontWeight: 700,
                    color: 'var(--color-text)', letterSpacing: '-0.02em',
                    cursor: canEdit ? 'text' : 'default', lineHeight: 1.3,
                  }}>
                  {task.title || 'Untitled task'}
                </h1>
              )}

              {/* DESCRIPTION */}
              <div style={{ marginTop: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <SectionLabel>Description</SectionLabel>
                  <button
                    onClick={handleEnhanceDescription}
                    disabled={enhancing}
                    title="Rewrite this description with AI"
                    style={{
                      display: 'flex', alignItems: 'center', gap: 4,
                      background: enhancing ? 'var(--color-surface)' : 'var(--color-accent-soft)',
                      border: '1px solid ' + (enhancing ? 'var(--color-border)' : 'rgba(13,148,136,0.25)'),
                      borderRadius: 100,
                      padding: '3px 9px',
                      fontFamily: 'var(--font-sans)', fontSize: 10, fontWeight: 700,
                      letterSpacing: '0.02em',
                      color: enhancing ? 'var(--color-text-muted)' : 'var(--color-accent)',
                      cursor: enhancing ? 'wait' : 'pointer',
                      marginBottom: 6,
                    }}>
                    <SparklesIcon style={{ width: 11, height: 11 }} />
                    {enhancing ? 'Enhancing...' : 'Enhance with AI'}
                  </button>
                </div>
                {editingDesc ? (
                  <textarea
                    ref={descTextareaRef}
                    autoFocus
                    value={descDraft}
                    onChange={e => setDescDraft(e.target.value)}
                    onBlur={commitDesc}
                    placeholder="Add a description..."
                    style={{
                      width: '100%', minHeight: 80, maxHeight: 400,
                      background: 'var(--color-surface)',
                      border: '1px solid var(--color-border)', borderRadius: 10,
                      padding: '10px 12px',
                      fontFamily: 'var(--font-sans)', fontSize: 14, lineHeight: 1.6,
                      color: 'var(--color-text)', outline: 'none',
                      resize: 'none', boxSizing: 'border-box',
                      overflowY: 'auto',
                    }}
                  />
                ) : (
                  <div
                    onClick={() => { setDescDraft(task.description || ''); setEditingDesc(true) }}
                    style={{
                      minHeight: 60, maxHeight: 400, overflowY: 'auto',
                      padding: '10px 12px',
                      background: 'var(--color-surface)',
                      border: '1px dashed var(--color-border)', borderRadius: 10,
                      fontFamily: 'var(--font-sans)', fontSize: 14, lineHeight: 1.6,
                      color: task.description ? 'var(--color-text)' : 'var(--color-text-muted)',
                      cursor: 'text', whiteSpace: 'pre-wrap',
                    }}>
                    {task.description || 'Add a description...'}
                  </div>
                )}
                {/* Restore-original link — shown for 30s after a
                    successful enhance so the user can revert if the
                    rewrite missed the mark. */}
                {originalDescription && (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 6, marginTop: 6,
                  }}>
                    <span style={{
                      fontFamily: 'var(--font-mono)', fontSize: 11,
                      color: 'var(--color-text-muted)',
                    }}>
                      Description enhanced
                    </span>
                    <button
                      onClick={handleRestoreOriginal}
                      style={{
                        background: 'none', border: 'none',
                        color: 'var(--color-accent)',
                        fontFamily: 'var(--font-mono)', fontSize: 11,
                        cursor: 'pointer', textDecoration: 'underline', padding: 0,
                      }}
                    >
                      ← Restore original
                    </button>
                  </div>
                )}
              </div>

              {/* AI PROMPT — placed under Description for visibility */}
              <div style={{ marginTop: 16 }}>
                <button
                  onClick={handleGenerateAIPrompt}
                  disabled={generatingPrompt}
                  style={{
                    width: '100%',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    background: generatingPrompt ? 'var(--color-surface)' : 'var(--color-accent-soft)',
                    border: '1px solid ' + (generatingPrompt ? 'var(--color-border)' : 'rgba(13,148,136,0.25)'),
                    borderRadius: 9, padding: '9px 12px',
                    fontFamily: 'var(--font-sans)', fontSize: 12, fontWeight: 700,
                    color: generatingPrompt ? 'var(--color-text-muted)' : 'var(--color-accent)',
                    cursor: generatingPrompt ? 'wait' : 'pointer',
                  }}>
                  <SparklesIcon style={{ width: 13, height: 13 }} />
                  {generatingPrompt
                    ? 'Generating…'
                    : (task.aiPrompt ? 'Regenerate AI prompt' : 'Generate AI prompt')}
                </button>
                {task.aiPrompt && (
                  <>
                    <div
                      onClick={() => setAiPromptOpen(o => !o)}
                      style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', marginTop: 12, marginBottom: 8 }}>
                      <SparklesIcon style={{ width: 13, height: 13, color: 'var(--color-accent)' }} />
                      <SectionLabel>AI Design Prompt</SectionLabel>
                      <ChevronDownIcon style={{ width: 12, height: 12, color: 'var(--color-text-muted)', marginLeft: 'auto', transform: aiPromptOpen ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.15s' }} />
                    </div>
                    {aiPromptOpen && (
                      <div style={{
                        background: 'var(--color-surface)',
                        border: '1px solid var(--color-border)',
                        borderRadius: 10, padding: '10px 12px',
                        fontSize: 12, fontFamily: 'var(--font-mono)', lineHeight: 1.6,
                        color: 'var(--color-text-soft)', whiteSpace: 'pre-wrap',
                        position: 'relative',
                        maxHeight: 320, overflowY: 'auto',
                      }}>
                        {task.aiPrompt}
                        <button onClick={copyAiPrompt} style={{
                          position: 'absolute', top: 8, right: 8,
                          background: 'var(--color-bg)', border: '1px solid var(--color-border)',
                          borderRadius: 6, padding: '4px 8px', cursor: 'pointer',
                          fontFamily: 'var(--font-sans)', fontSize: 10, fontWeight: 600,
                          color: 'var(--color-text-muted)',
                          display: 'flex', alignItems: 'center', gap: 4,
                        }}>
                          <ClipboardDocumentIcon style={{ width: 11, height: 11 }} />
                          {copiedPrompt ? 'Copied' : 'Copy'}
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* SUBTASKS */}
              <div style={{ marginTop: 28 }}>
                <SectionLabel>Subtasks ({subtasks.length})</SectionLabel>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {subtasks.map(s => (
                    <div key={s.id} className="tdm-row" style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '8px 10px', borderRadius: 8, fontSize: 13,
                      fontFamily: 'var(--font-sans)',
                    }}>
                      <button
                        onClick={() => toggleSubtask(s)}
                        style={{
                          width: 16, height: 16, borderRadius: 4,
                          border: '1.5px solid ' + (s.completed ? 'var(--color-accent)' : 'var(--color-border)'),
                          background: s.completed ? 'var(--color-accent)' : 'transparent',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          cursor: 'pointer', padding: 0, flexShrink: 0,
                        }}>
                        {s.completed && <CheckIcon style={{ width: 11, height: 11, color: 'white' }} />}
                      </button>
                      <span style={{
                        flex: 1, color: 'var(--color-text)',
                        textDecoration: s.completed ? 'line-through' : 'none',
                        opacity: s.completed ? 0.5 : 1,
                      }}>{s.title}</span>
                      <button onClick={() => removeSubtask(s.id)} style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: 'var(--color-text-muted)', padding: 4,
                      }}><TrashIcon style={{ width: 13, height: 13 }} /></button>
                    </div>
                  ))}

                  {addingSubtask ? (
                    <div style={{ display: 'flex', gap: 8, padding: '6px 10px' }}>
                      <input
                        autoFocus
                        value={newSubtaskTitle}
                        onChange={e => setNewSubtaskTitle(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') handleAddSubtask()
                          if (e.key === 'Escape') { setNewSubtaskTitle(''); setAddingSubtask(false) }
                        }}
                        onBlur={() => { if (!newSubtaskTitle.trim()) setAddingSubtask(false) }}
                        placeholder="Subtask title..."
                        style={{
                          flex: 1, background: 'var(--color-surface)',
                          border: '1px solid var(--color-border)', borderRadius: 7,
                          padding: '6px 10px', fontSize: 13, outline: 'none',
                          fontFamily: 'var(--font-sans)', color: 'var(--color-text)',
                          boxSizing: 'border-box',
                        }}
                      />
                    </div>
                  ) : (
                    <button
                      onClick={() => setAddingSubtask(true)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        padding: '8px 10px', borderRadius: 8,
                        background: 'transparent', border: 'none',
                        color: 'var(--color-text-muted)',
                        fontFamily: 'var(--font-sans)', fontSize: 12,
                        cursor: 'pointer', alignSelf: 'flex-start',
                      }}>
                      <PlusIcon style={{ width: 13, height: 13 }} />
                      Add subtask
                    </button>
                  )}
                </div>
              </div>

              {/* ACTIVITY */}
              <div style={{ marginTop: 32 }}>
                <SectionLabel>Activity</SectionLabel>
                <div style={{ display: 'flex', gap: 4, marginBottom: 12, borderBottom: '1px solid var(--color-border)' }}>
                  {['all', 'comments', 'history'].map(t => (
                    <div key={t}
                      className={'tdm-tab ' + (activityTab === t ? 'tdm-tab-active' : '')}
                      onClick={() => {
                        setActivityTab(t)
                        // Force a fresh fetch on tab switch so the user sees
                        // the latest state instead of whatever was cached.
                        if (task?.id) {
                          if (t === 'history' || t === 'all') {
                            getActivity(task.id).then(d => setActivity(d || [])).catch(() => {})
                          }
                          if (t === 'comments' || t === 'all') {
                            getComments(task.id).then(d => setComments(d || [])).catch(() => {})
                          }
                        }
                      }}>
                      {t[0].toUpperCase() + t.slice(1)}
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {filteredActivity.length === 0 && (
                    <div style={{
                      fontFamily: 'var(--font-sans)', fontSize: 12,
                      color: 'var(--color-text-muted)', textAlign: 'center', padding: 16,
                    }}>No activity yet.</div>
                  )}
                  {filteredActivity.map((entry, i) => (
                    entry.kind === 'comment' ? (
                      <CommentRow
                        key={'c' + entry.id}
                        comment={{ ...entry, __onPreview: setPreviewFile }}
                        replies={comments
                          .filter(c => c.parent_id === entry.id)
                          .map(c => ({ ...c, __onPreview: setPreviewFile }))}
                        {...makeHandlersForComment(entry)}
                        replying={replyingToId === entry.id}
                        replyDraft={replyDraft}
                        setReplyDraft={setReplyDraft}
                        onSubmitReply={() => submitReply(entry)}
                        reactionsMap={reactions}
                        makeHandlersForComment={makeHandlersForComment}
                        currentUserName={currentUserName}
                        currentUserAvatar={currentUserAvatar}
                        resolveAvatar={resolveAvatar}
                        mentionMembers={mentionMembers}
                      />
                    ) : (
                      <div key={'a' + entry.id} style={{ display: 'flex', gap: 10, alignItems: 'center', fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--color-text-muted)' }}>
                        <Avatar name={entry.actor_name} src={resolveAvatar({ user_id: entry.user_id, author_name: entry.actor_name })} size={22} />
                        <span><b style={{ color: 'var(--color-text)' }}>{entry.actor_name}</b> {entry.action}{entry.new_value && entry.action !== 'added comment' ? ` to ${entry.new_value}` : ''}</span>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, marginLeft: 'auto' }}>{timeAgo(entry.created_at)}</span>
                      </div>
                    )
                  ))}
                </div>
              </div>
            </div>

            {/* COMMENT COMPOSER */}
            <div style={{
              flexShrink: 0,
              padding: isMobile ? '10px 12px env(safe-area-inset-bottom, 10px)' : '14px 22px 16px',
              borderTop: '1px solid var(--color-border)',
              background: 'var(--color-bg)',
            }}>
              <ComposerBubble
                key={`composer-${task.id}`}
                value={newComment}
                onChange={setNewComment}
                onSubmit={handleAddComment}
                onAttachDocument={() => documentInputRef.current?.click()}
                onAttachImage={() => imageInputRef.current?.click()}
                uploading={uploading}
                attachments={pendingAttachments}
                onRemoveAttachment={removePendingAttachment}
                userName={user?.firstName || user?.name}
                userAvatar={currentUserAvatar}
                members={mentionMembers}
              />
              <input
                ref={documentInputRef}
                type="file"
                multiple
                accept=".pdf,.doc,.docx,.txt,.md,.rtf,.xls,.xlsx,.ppt,.pptx,.csv,.zip,.json,.log,.yaml,.yml,.xml,.html"
                style={{ display: 'none' }}
                onChange={e => handleFilesSelected(Array.from(e.target.files || []))}
              />
              <input
                ref={imageInputRef}
                type="file"
                multiple
                accept="image/*"
                style={{ display: 'none' }}
                onChange={e => handleFilesSelected(Array.from(e.target.files || []))}
              />
            </div>
          </div>

          {/* RIGHT PANEL */}
          <div style={rightStyle}>

            {/* STATUS PILL */}
            <div style={{ marginBottom: 24, position: 'relative' }}>
              <SectionLabel>Status</SectionLabel>
              <button
                onClick={() => setShowStatus(s => !s)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  background: statusColor + '18',
                  border: '1px solid ' + statusColor + '40',
                  borderRadius: 100, padding: '8px 14px',
                  fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 600,
                  color: statusColor, cursor: 'pointer',
                  width: 'fit-content',
                }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: statusColor }} />
                {task.column || 'To Do'}
                <ChevronDownIcon style={{ width: 12, height: 12 }} />
              </button>
              {showStatus && (
                <div style={popoverStyle({ top: '100%', left: 0 })}>
                  {STATUS_OPTIONS.map(s => (
                    <div key={s} onClick={() => changeStatus(s)} className="tdm-row"
                      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', cursor: 'pointer', fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--color-text)' }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: STATUS_COLORS[s] }} />
                      {s}
                      {task.column === s && <CheckIcon style={{ width: 13, height: 13, marginLeft: 'auto', color: 'var(--color-accent)' }} />}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* DETAILS */}
            <SectionLabel>Details</SectionLabel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 24 }}>

              {/* Assignee */}
              {(() => {
                // Build the picker list. Real project members (with auth
                // user_ids + avatars) come first; the local pseudo team
                // members are appended only if they aren't already
                // represented by a real member with the same name.
                const realMembers = Object.entries(projectMembers || {}).map(([uid, m]) => ({
                  userId: uid,
                  name: m.name || '',
                  email: m.email || '',
                  avatarUrl: m.avatarUrl || null,
                  role: '',
                }))
                const realNames = new Set(realMembers.map(m => (m.name || '').toLowerCase()))
                const pseudoMembers = (teamMembers || [])
                  .filter(m => !realNames.has((m.name || '').toLowerCase()))
                  .map(m => ({
                    userId: null,
                    name: m.name || m.role || '',
                    email: '',
                    avatarUrl: null,
                    role: m.role || '',
                  }))
                const pickerList = [...realMembers, ...pseudoMembers]
                // Avatar URL for the currently-assigned user — prefer the
                // live authUser.user_metadata when the assignee is self.
                const isSelf = task.assignedUserId && task.assignedUserId === authUser?.id
                const currentAvatar = isSelf
                  ? (authUser?.user_metadata?.avatar_url || projectMembers?.[task.assignedUserId]?.avatarUrl || null)
                  : (task.assignedUserId ? projectMembers?.[task.assignedUserId]?.avatarUrl : null)
                return (
                  <div style={{ position: 'relative' }}>
                    <div className="tdm-row" style={detailRowStyle} onClick={() => setShowAssignee(s => !s)}>
                      <span style={labelStyle}>Assignee</span>
                      {task.assignedName ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <Avatar name={task.assignedName} src={currentAvatar} size={22} />
                          <span style={{ fontSize: 13, color: 'var(--color-text)' }}>{task.assignedName}</span>
                        </div>
                      ) : (
                        <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Unassigned</span>
                      )}
                    </div>
                    {showAssignee && (
                      <div style={popoverStyle({ top: '100%', right: 0, minWidth: 220 })}>
                        {pickerList.length === 0 && (
                          <div style={{ padding: '8px 10px', fontSize: 12, color: 'var(--color-text-muted)', fontFamily: 'var(--font-sans)' }}>No team members yet</div>
                        )}
                        {pickerList.map(m => (
                          <div key={m.userId || ('pseudo:' + m.name + ':' + m.role)} onClick={() => changeAssignee(m)} className="tdm-row"
                            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', cursor: 'pointer', fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--color-text)' }}>
                            <Avatar name={m.name || m.role} src={m.avatarUrl} size={22} />
                            <span style={{ minWidth: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {m.name || m.role}
                              {m.userId === authUser?.id && (
                                <span style={{ marginLeft: 6, fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--color-text-muted)' }}>you</span>
                              )}
                            </span>
                          </div>
                        ))}
                        <div onClick={() => changeAssignee(null)} className="tdm-row"
                          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', cursor: 'pointer', fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--color-text-muted)', borderTop: '1px solid var(--color-border)' }}>
                          Unassign
                        </div>
                      </div>
                    )}
                    {!task.assignedName && authUser?.id && (
                      <div style={{ padding: '0 10px 4px', fontSize: 11, color: 'var(--color-accent)', fontFamily: 'var(--font-sans)', cursor: 'pointer' }}
                        onClick={() => changeAssignee({
                          userId: authUser.id,
                          name: user?.name || user?.firstName || authUser.user_metadata?.full_name || authUser.email?.split('@')[0],
                          avatarUrl: authUser?.user_metadata?.avatar_url || null,
                          role: '',
                        })}>
                        Assign to me
                      </div>
                    )}
                  </div>
                )
              })()}

              {/* Labels */}
              <div style={{ position: 'relative' }}>
                <div className="tdm-row" style={detailRowStyle} onClick={() => setShowLabels(s => !s)}>
                  <span style={labelStyle}>Labels</span>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, justifyContent: 'flex-end' }}>
                    {(Array.isArray(task.labels) && task.labels.length > 0) ? task.labels.map(l => (
                      <span key={l} style={{
                        background: 'var(--color-accent-soft)', color: 'var(--color-accent)',
                        borderRadius: 100, padding: '2px 9px', fontSize: 11, fontWeight: 600,
                        fontFamily: 'var(--font-sans)',
                      }}>{l}</span>
                    )) : (
                      <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>None</span>
                    )}
                  </div>
                </div>
                {showLabels && (
                  <div style={popoverStyle({ top: '100%', right: 0, minWidth: 220, padding: 10 })}>
                    {(Array.isArray(task.labels) && task.labels.length > 0) && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
                        {task.labels.map(l => (
                          <span key={l} style={{
                            background: 'var(--color-accent-soft)', color: 'var(--color-accent)',
                            borderRadius: 100, padding: '3px 10px', fontSize: 11, fontWeight: 600,
                            fontFamily: 'var(--font-sans)', display: 'flex', alignItems: 'center', gap: 4,
                          }}>{l}
                            <button onClick={() => removeLabelTag(l)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-accent)', padding: 0, fontSize: 14, lineHeight: 1 }}>×</button>
                          </span>
                        ))}
                      </div>
                    )}
                    <input
                      value={newLabel}
                      onChange={e => setNewLabel(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          const v = newLabel.trim()
                          if (v) { addLabelTag(v); setNewLabel('') }
                        }
                      }}
                      placeholder="Add a label..."
                      style={{
                        width: '100%', background: 'var(--color-surface)',
                        border: '1px solid var(--color-border)', borderRadius: 7,
                        padding: '6px 10px', fontSize: 12, outline: 'none',
                        fontFamily: 'var(--font-sans)', color: 'var(--color-text)',
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>
                )}
              </div>

              {/* Start Date — goes BEFORE Due Date */}
              <label className="tdm-row" style={{ ...detailRowStyle, display: 'flex' }}>
                <span style={labelStyle}>Start Date</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {task.startDate ? (
                    <span style={{ fontSize: 13, color: 'var(--color-text)' }}>{formatDate(task.startDate)}</span>
                  ) : (
                    <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>None</span>
                  )}
                  <input type="date" value={task.startDate || ''}
                    onChange={e => changeStartDate(e.target.value)}
                    style={{ position: 'absolute', opacity: 0, pointerEvents: 'auto', width: 1, height: 1 }} />
                  <CalendarIcon style={{ width: 13, height: 13, color: 'var(--color-text-muted)', cursor: 'pointer' }}
                    onClick={e => { e.currentTarget.parentElement.querySelector('input[type=date]').showPicker?.() }} />
                </div>
              </label>

              {/* Due Date */}
              <label className="tdm-row" style={{ ...detailRowStyle, display: 'flex' }}>
                <span style={labelStyle}>Due Date</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {task.dueDate ? (
                    <span style={{
                      fontSize: 13,
                      color: overdue ? '#EF4444' : 'var(--color-text)',
                      fontWeight: overdue ? 600 : 400,
                    }}>{formatDate(task.dueDate)}</span>
                  ) : (
                    <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>None</span>
                  )}
                  <input type="date" value={task.dueDate || ''}
                    onChange={e => changeDueDate(e.target.value)}
                    style={{ position: 'absolute', opacity: 0, pointerEvents: 'auto', width: 1, height: 1 }} />
                  <CalendarIcon style={{ width: 13, height: 13, color: 'var(--color-text-muted)', cursor: 'pointer' }}
                    onClick={e => { e.currentTarget.parentElement.querySelector('input[type=date]').showPicker?.() }} />
                </div>
              </label>

              {/* Priority */}
              <div style={{ position: 'relative' }}>
                <div className="tdm-row" style={detailRowStyle} onClick={() => setShowPriority(s => !s)}>
                  <span style={labelStyle}>Priority</span>
                  <span style={{ fontSize: 13, color: 'var(--color-text)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span>{priorityMeta.emoji}</span>
                    {priorityMeta.id === 'none' ? <span style={{ color: 'var(--color-text-muted)' }}>None</span> : priorityMeta.label}
                  </span>
                </div>
                {showPriority && (
                  <div style={popoverStyle({ top: '100%', right: 0 })}>
                    {PRIORITY_OPTIONS.map(p => (
                      <div key={p.id} onClick={() => changePriority(p.id)} className="tdm-row"
                        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', cursor: 'pointer', fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--color-text)' }}>
                        <span>{p.emoji}</span>{p.label}
                        {(task.priority || 'none') === p.id && <CheckIcon style={{ width: 13, height: 13, marginLeft: 'auto', color: 'var(--color-accent)' }} />}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Reporter — picker mirrors the Assignee row */}
              {(() => {
                const realMembers = Object.entries(projectMembers || {}).map(([uid, m]) => ({
                  userId: uid,
                  name: m.name || '',
                  email: m.email || '',
                  avatarUrl: m.avatarUrl || null,
                }))
                // If there's no explicit reporter yet, default to the signed-in user.
                const reporterId = task.reporterId || authUser?.id || null
                const reporterMember = reporterId ? projectMembers?.[reporterId] : null
                const reporterIsSelf = reporterId && reporterId === authUser?.id
                const reporterName =
                  task.reporterName
                  || reporterMember?.name
                  || (reporterIsSelf ? (user?.firstName || user?.name || authUser?.email?.split('@')[0]) : null)
                  || 'Unassigned'
                const reporterAvatar = reporterIsSelf
                  ? (authUser?.user_metadata?.avatar_url || reporterMember?.avatarUrl || null)
                  : (reporterMember?.avatarUrl || null)
                return (
                  <div style={{ position: 'relative' }}>
                    <div className="tdm-row" style={detailRowStyle} onClick={() => setShowReporter(s => !s)}>
                      <span style={labelStyle}>Reporter</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Avatar name={reporterName} src={reporterAvatar} size={22} />
                        <span style={{ fontSize: 13, color: 'var(--color-text)' }}>{reporterName}</span>
                      </div>
                    </div>
                    {showReporter && (
                      <div style={popoverStyle({ top: '100%', right: 0, minWidth: 220 })}>
                        {realMembers.length === 0 && (
                          <div style={{ padding: '8px 10px', fontSize: 12, color: 'var(--color-text-muted)', fontFamily: 'var(--font-sans)' }}>No team members yet</div>
                        )}
                        {realMembers.map(m => (
                          <div key={m.userId} onClick={() => changeReporter(m)} className="tdm-row"
                            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', cursor: 'pointer', fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--color-text)' }}>
                            <Avatar name={m.name} src={m.avatarUrl} size={22} />
                            <span style={{ minWidth: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {m.name}
                              {m.userId === authUser?.id && (
                                <span style={{ marginLeft: 6, fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--color-text-muted)' }}>you</span>
                              )}
                            </span>
                          </div>
                        ))}
                        <div onClick={() => changeReporter(null)} className="tdm-row"
                          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', cursor: 'pointer', fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--color-text-muted)', borderTop: '1px solid var(--color-border)' }}>
                          Clear reporter
                        </div>
                      </div>
                    )}
                  </div>
                )
              })()}
            </div>

          </div>
        </div>

        {/* Share toast — sits inside modal shell so it's always on top */}
        {shareToast && (
          <div style={{
            position: 'absolute', bottom: 24, left: '50%', transform: 'translateX(-50%)',
            background: 'var(--color-text)', color: 'var(--color-bg)',
            padding: '10px 18px', borderRadius: 100, fontFamily: 'var(--font-sans)',
            fontSize: 13, fontWeight: 700,
            boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
            zIndex: 1000,
            animation: 'tdmFade 0.2s ease',
            whiteSpace: 'nowrap',
          }}>{shareToast}</div>
        )}

        {/* Slack-style file preview viewer */}
        {previewFile && (
          <FilePreviewModal file={previewFile} onClose={() => setPreviewFile(null)} />
        )}

        {/* Delete task confirmation — shared destructive modal */}
        <ConfirmDeleteModal
          open={confirmDelete}
          title="Delete task?"
          confirmLabel="Delete task"
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => {
            onDelete?.(task.id)
            setConfirmDelete(false)
            onClose?.()
          }}
          description={
            <>
              <strong>{task?.title || 'This task'}</strong> will be permanently
              removed along with its subtasks, comments, and activity history.
              This cannot be undone.
            </>
          }
        />
      </div>
    </div>
  )
}

// ─── Style helpers ──────────────────────────────────────────────────────────

function iconBtn() {
  return {
    background: 'transparent', border: 'none', padding: '6px 8px',
    borderRadius: 7, cursor: 'pointer',
    color: 'var(--color-text-muted)',
    display: 'flex', alignItems: 'center',
  }
}
function iconSize() {
  return { width: 15, height: 15 }
}
function popoverStyle(pos) {
  return {
    position: 'absolute', zIndex: 5, marginTop: 4,
    background: 'var(--color-bg)',
    border: '1px solid var(--color-border)',
    borderRadius: 10, boxShadow: '0 6px 24px rgba(0,0,0,0.18)',
    padding: 6, minWidth: 160,
    ...pos,
  }
}
