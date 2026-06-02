import { useContext, useEffect, useRef, useState } from 'react'
import AppContext from '../../context/AppContext'
import { chatRefinement } from '../../lib/claudeApi'
import {
  searchPexelsVideo,
  searchPexelsImage,
  buildMediaQuery,
} from '../../lib/pexels'
import { ANIMATION_TEMPLATES, renderMediaHTML } from '../../lib/animations'
import {
  PaperAirplaneIcon,
  ChatBubbleLeftRightIcon,
} from '@heroicons/react/24/outline'

// ────────────────────────────────────────────────────────────────────
// BuilderChat — the assistant that sits inside AIBuilder. The user can
// ask it to change anything about the currently-reviewing section:
//
//   "add a video"        → swap in a Pexels video matching the brief
//   "use an image"       → swap in a Pexels image
//   "no video, use css"  → swap in a CSS animation
//   "make it darker"     → ask the AI to refine
//   "headline should be" → ask the AI to refine
//   anything else        → ask the AI to refine
//
// Updates flow back to the parent via onSectionUpdate(html). The
// parent (AIBuilder) is responsible for persisting the new HTML and
// re-rendering the preview iframe.
// ────────────────────────────────────────────────────────────────────

const QUICK_CHIPS = [
  'Add a video',
  'Make it darker',
  'Change the headline',
  'More minimal',
  'Try an image',
  'Use a CSS animation',
]

export default function BuilderChat({
  section,            // current build_section row (must have generated_code)
  briefContext,
  designSystem,       // null OK — when present, threaded into chatRefinement
  projectName,
  onSectionUpdate,    // (newHtml: string) => void
  collapsed,
  onToggle,
}) {
  const { showAIError } = useContext(AppContext)

  const [messages, setMessages] = useState(() => [{
    role: 'assistant',
    content: `Hi! I'm your AI design assistant for ${projectName || 'this project'}. Tell me what to change — colors, layout, copy, animations, or media. I'll update the preview in place.`,
  }])
  const [input, setInput] = useState('')
  const [thinking, setThinking] = useState(false)
  const [showChips, setShowChips] = useState(true)
  const bottomRef = useRef(null)
  const taRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length, thinking])

  // Auto-grow textarea up to ~96px
  useEffect(() => {
    const el = taRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 96) + 'px'
  }, [input])

  function pushUser(text) {
    setMessages(prev => [...prev, { role: 'user', content: text }])
  }
  function pushAssistant(text) {
    setMessages(prev => [...prev, { role: 'assistant', content: text }])
  }

  async function send() {
    const text = input.trim()
    if (!text || thinking) return
    setInput('')
    setShowChips(false)
    pushUser(text)
    setThinking(true)

    try {
      const intent = detectIntent(text)
      const currentHtml = section?.generated_code || ''
      let newHtml = currentHtml
      let reply = ''

      if (intent === 'change_to_video') {
        const userTerm = extractSearchTerms(text)
        const query = buildMediaQuery(briefContext || {}, 'hero', userTerm)
        const v = await searchPexelsVideo(query).catch(() => null)
        if (v) {
          const mediaHtml = renderMediaHTML(
            { type: 'video', url: v.url, thumbnail: v.thumbnail, photographer: v.photographer, pexels_url: v.pexels_url },
            briefContext || {},
          )
          newHtml = swapMediaBackground(currentHtml, mediaHtml)
          reply = "Done. I swapped in a brand-matched video. Want a different shot or want me to dial the brand overlay opacity?"
        } else {
          reply = "Couldn't find a matching video. Describe what you want to see (\"people cooking\", \"city lifestyle\", \"nature outdoors\") and I'll search again."
        }
      } else if (intent === 'change_to_image') {
        const userTerm = extractSearchTerms(text)
        const query = buildMediaQuery(briefContext || {}, 'hero', userTerm)
        const img = await searchPexelsImage(query).catch(() => null)
        if (img) {
          const mediaHtml = renderMediaHTML(
            { type: 'image', url: img.large || img.url, photographer: img.photographer, pexels_url: img.pexels_url },
            briefContext || {},
          )
          newHtml = swapMediaBackground(currentHtml, mediaHtml)
          reply = 'Done. Replaced the background with an editorial image. Want a different shot or want me to soften the overlay?'
        } else {
          reply = "Couldn't find the right image. Tell me more about the vibe and I'll search again."
        }
      } else if (intent === 'change_to_css') {
        const template = detectCssTemplate(text, briefContext || {})
        const mediaHtml = renderMediaHTML({ type: 'css', template }, briefContext || {})
        newHtml = swapMediaBackground(currentHtml, mediaHtml)
        reply = `Done. Replaced with a "${template}" CSS animation using your brand colors. Want me to try a different style?`
      } else {
        // All other changes → AI refinement.
        const history = messages.slice(-6)
        const { text: aiHtml } = await chatRefinement({
          userMessage: text,
          currentHTML: currentHtml,
          briefContext: briefContext || {},
          designSystem,
          conversationHistory: history,
        })
        if (aiHtml && aiHtml.trim().length > 80) {
          newHtml = stripFences(aiHtml)
          reply = responseFor(intent)
        } else {
          reply = "I tried but didn't get a clean answer back. Can you rephrase?"
        }
      }

      if (newHtml && newHtml !== currentHtml) {
        try { await onSectionUpdate?.(newHtml) } catch {}
      }
      pushAssistant(reply)
    } catch (e) {
      showAIError?.(e, () => send())
      pushAssistant('Something interrupted that. Your work is safe — try again.')
    } finally {
      setThinking(false)
    }
  }

  // ── Render ─────────────────────────────────────────────────────────

  if (collapsed) {
    return (
      <button
        onClick={onToggle}
        title="Open AI assistant"
        style={{
          padding: '8px 14px',
          background: 'linear-gradient(135deg, #8B5CF6, #6366F1)',
          color: 'white', border: 'none', borderRadius: 10,
          cursor: 'pointer',
          fontFamily: 'var(--font-sans)', fontSize: 12.5, fontWeight: 700,
          display: 'inline-flex', alignItems: 'center', gap: 6,
          boxShadow: '0 4px 14px rgba(124,58,237,0.30)',
        }}
      >
        <ChatBubbleLeftRightIcon style={{ width: 14, height: 14 }} />
        Ask the assistant
      </button>
    )
  }

  const canSend = !!input.trim() && !thinking

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      height: '100%', minHeight: 0,
      background: 'var(--color-card)',
      borderTop: '1px solid var(--color-border)',
      fontFamily: 'var(--font-sans)',
    }}>
      {/* Header */}
      <div style={{
        padding: '10px 14px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        borderBottom: '1px solid var(--color-border)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            width: 8, height: 8, borderRadius: 100,
            background: '#22C55E',
            animation: 'pulse 2s ease-in-out infinite',
          }} />
          <span style={{
            fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 800,
            letterSpacing: '0.08em', textTransform: 'uppercase',
            color: 'var(--color-text-muted)',
          }}>
            AI Assistant
          </span>
        </div>
        {onToggle && (
          <button
            onClick={onToggle}
            style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: 'var(--color-text-muted)',
              fontSize: 11, fontWeight: 600,
            }}
          >
            Hide
          </button>
        )}
      </div>

      {/* Messages */}
      <div style={{
        flex: 1, minHeight: 0,
        overflowY: 'auto',
        padding: 14,
        display: 'flex', flexDirection: 'column', gap: 10,
      }}>
        {messages.map((m, i) => (
          <Bubble key={i} role={m.role}>{m.content}</Bubble>
        ))}
        {thinking && (
          <div style={{
            display: 'inline-flex', gap: 4,
            padding: '10px 14px',
            background: 'var(--color-surface)',
            borderRadius: '14px 14px 14px 4px',
            width: 'fit-content',
          }}>
            {[0, 1, 2].map(i => (
              <span key={i} style={{
                width: 6, height: 6, borderRadius: 100,
                background: '#8B5CF6',
                animation: 'buildPulse 1.2s ease-in-out infinite',
                animationDelay: (i * 0.18) + 's',
              }} />
            ))}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Quick chips (only when fresh) */}
      {showChips && (
        <div style={{
          display: 'flex', gap: 6, flexWrap: 'wrap',
          padding: '0 14px 8px',
        }}>
          {QUICK_CHIPS.map(chip => (
            <button
              key={chip}
              onClick={() => { setInput(chip); setShowChips(false); setTimeout(() => taRef.current?.focus(), 0) }}
              style={{
                padding: '5px 11px',
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                borderRadius: 100,
                color: 'var(--color-text-muted)',
                cursor: 'pointer',
                fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600,
                letterSpacing: '0.01em',
              }}
            >
              {chip}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div style={{
        padding: '10px 14px 12px',
        borderTop: '1px solid var(--color-border)',
        display: 'flex', gap: 8, alignItems: 'flex-end',
      }}>
        <textarea
          ref={taRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              send()
            }
          }}
          placeholder="Change anything… (Enter to send)"
          rows={1}
          style={{
            flex: 1,
            padding: '9px 12px',
            background: 'var(--color-bg)',
            border: '1px solid var(--color-border)',
            borderRadius: 11,
            color: 'var(--color-text)',
            fontFamily: 'var(--font-sans)',
            fontSize: 13, lineHeight: 1.4,
            resize: 'none', outline: 'none',
            maxHeight: 96,
          }}
        />
        <button
          onClick={send}
          disabled={!canSend}
          style={{
            padding: '9px 13px',
            background: canSend ? 'linear-gradient(135deg, #8B5CF6, #6366F1)' : 'var(--color-surface)',
            color: canSend ? 'white' : 'var(--color-text-muted)',
            border: canSend ? 'none' : '1px solid var(--color-border)',
            borderRadius: 11,
            cursor: canSend ? 'pointer' : 'not-allowed',
            fontFamily: 'var(--font-sans)', fontSize: 12.5, fontWeight: 700,
            display: 'inline-flex', alignItems: 'center', gap: 5,
            boxShadow: canSend ? '0 4px 12px rgba(124,58,237,0.30)' : 'none',
            transition: 'background 0.15s',
          }}
        >
          <PaperAirplaneIcon style={{ width: 13, height: 13 }} />
          {thinking ? '...' : 'Send'}
        </button>
      </div>
    </div>
  )
}

// ──── Bubble ────────────────────────────────────────────────────────

function Bubble({ role, children }) {
  const isUser = role === 'user'
  return (
    <div style={{ display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start' }}>
      <div style={{
        maxWidth: '85%',
        padding: '9px 13px',
        background: isUser ? 'linear-gradient(135deg, #8B5CF6, #6366F1)' : 'var(--color-surface)',
        color: isUser ? 'white' : 'var(--color-text)',
        borderRadius: isUser ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
        fontFamily: 'var(--font-sans)',
        fontSize: 13, lineHeight: 1.5,
        wordWrap: 'break-word',
        whiteSpace: 'pre-wrap',
        boxShadow: isUser ? '0 4px 12px rgba(124,58,237,0.25)' : 'none',
      }}>
        {children}
      </div>
    </div>
  )
}

// ──── Intent detection ──────────────────────────────────────────────

function detectIntent(message) {
  const m = String(message || '').toLowerCase()
  if (/\bremove (the )?(video|image|photo|background)\b/.test(m) ||
      /\bno (video|image|photo)\b/.test(m) ||
      /\b(css|animation|animated background|motion design)\b/.test(m)) return 'change_to_css'
  if (/\b(video|footage|film|clip)\b/.test(m)) return 'change_to_video'
  if (/\b(image|photo|picture)\b/.test(m)) return 'change_to_image'
  if (/\b(darker|dark mode|moody)\b/.test(m)) return 'make_darker'
  if (/\b(lighter|light mode|brighter|airy)\b/.test(m)) return 'make_lighter'
  if (/\b(headline|title|heading)\b/.test(m)) return 'change_headline'
  if (/\b(button|cta|call to action)\b/.test(m)) return 'change_cta'
  if (/\b(color|colour|palette)\b/.test(m)) return 'change_color'
  if (/\b(font|typeface|typography|type)\b/.test(m)) return 'change_font'
  if (/\b(minimal|simpler|cleaner|less busy)\b/.test(m)) return 'make_minimal'
  if (/\b(bold|bigger|more impact|punchier|larger)\b/.test(m)) return 'make_bolder'
  return 'general_change'
}

const STOPWORDS = new Set([
  'change', 'make', 'add', 'put', 'use', 'show', 'the', 'a', 'an', 'to', 'with', 'for',
  'hero', 'background', 'section', 'video', 'image', 'photo', 'picture', 'this', 'that',
  'please', 'can', 'you', 'want', 'something', 'more', 'less', 'remove', 'instead',
])

function extractSearchTerms(message) {
  return String(message || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOPWORDS.has(w))
    .slice(0, 6)
    .join(' ')
    .trim() || null
}

function detectCssTemplate(message, briefContext = {}) {
  const m = String(message || '').toLowerCase()
  const tone = String(briefContext.toneAndMood || briefContext.tone || '').toLowerCase()

  if (/particle|dots|nodes|stars/.test(m) || /tech|ai|saas/.test(tone)) return 'particles'
  if (/geometric|shape|blob|abstract/.test(m) || /creative|bold/.test(tone)) return 'geometric'
  if (/grid|line|fintech/.test(m) || /minimal|precise/.test(tone)) return 'gridLines'
  if (/wave|liquid|fluid/.test(m) || /wellness|health|calm/.test(tone)) return 'wave'
  return 'gradientMesh'
}

function responseFor(intent) {
  const r = {
    make_darker:     "Done. Darker, moodier, brand overlay deeper. Want me to push it further?",
    make_lighter:    "Lightened it up — feels more open. Happy with the direction?",
    change_headline: "Updated the headline. Does the new copy land for you?",
    change_cta:      "CTA refreshed — verb-first, outcome-focused. Want to tweak the wording?",
    change_color:    "Colors updated. Still inside your brand palette.",
    change_font:     "Typography swapped. Type scale and weight pairing should feel right now.",
    make_minimal:    "Simplified — removed visual noise, gave the content more breathing room. Better?",
    make_bolder:     "Pushed scale and contrast up. Should feel more commanding now.",
    general_change:  "Done. Check the preview — want to keep refining?",
  }
  return r[intent] || r.general_change
}

// ──── HTML manipulation ─────────────────────────────────────────────

// Replace the first .hero-media block (or .hero-gradient/.hero-particles/
// .hero-geometric/.hero-grid/.hero-wave) with the new media HTML. Falls
// back to inserting the media right after the opening <section> / <div>
// tag if no existing hero-media wrapper is found.
function swapMediaBackground(currentHtml, newMediaHtml) {
  if (!currentHtml) return newMediaHtml

  const replaceFirstBlock = (html, classes) => {
    for (const cls of classes) {
      const startRx = new RegExp(`<(div|section)\\b[^>]*class=["'][^"']*\\b${cls}\\b[^"']*["'][^>]*>`, 'i')
      const startMatch = html.match(startRx)
      if (!startMatch) continue
      const startIdx = startMatch.index
      // Walk forward balancing the opening tag.
      const openTag = startMatch[1]
      let depth = 1
      let i = startIdx + startMatch[0].length
      const openRx = new RegExp(`<${openTag}\\b`, 'ig')
      const closeRx = new RegExp(`</${openTag}>`, 'ig')
      let lastClose = -1
      while (depth > 0 && i < html.length) {
        openRx.lastIndex = i
        closeRx.lastIndex = i
        const oNext = openRx.exec(html)
        const cNext = closeRx.exec(html)
        if (!cNext) break
        if (oNext && oNext.index < cNext.index) {
          depth++
          i = oNext.index + oNext[0].length
        } else {
          depth--
          lastClose = cNext.index + cNext[0].length
          i = lastClose
        }
      }
      if (lastClose > 0) {
        return html.slice(0, startIdx) + newMediaHtml + html.slice(lastClose)
      }
    }
    return null
  }

  // Also strip any prior <style> ABOVE the media block when present —
  // CSS animation templates pack a <style> right before the wrapper.
  const stylePrefix = (html, cls) => {
    const rx = new RegExp(`<style[\\s\\S]*?<\\/style>\\s*<(div|section)[^>]*class=["'][^"']*\\b${cls}\\b`, 'i')
    return rx.test(html) ? html.replace(rx.exec(html)[0], '') : html
  }

  const classes = ['hero-media', 'hero-gradient', 'hero-particles', 'hero-geometric', 'hero-grid', 'hero-wave']
  let stripped = currentHtml
  for (const cls of classes) stripped = stylePrefix(stripped, cls)
  const replaced = replaceFirstBlock(stripped, classes)
  if (replaced) return replaced

  // Fallback: inject newMediaHtml right after the first <section> or <div> open tag.
  const openRx = /<(section|div)\b[^>]*>/i
  const m = stripped.match(openRx)
  if (m) {
    const i = m.index + m[0].length
    return stripped.slice(0, i) + '\n' + newMediaHtml + '\n' + stripped.slice(i)
  }
  return newMediaHtml + '\n' + stripped
}

function stripFences(s) {
  return String(s || '').trim()
    .replace(/^```(?:html|HTML)?\s*/m, '')
    .replace(/\s*```\s*$/m, '')
    .trim()
}
