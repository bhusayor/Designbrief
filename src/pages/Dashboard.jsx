import { useState, useContext, useRef, useEffect } from 'react'
import AppContext from '../context/AppContext'
import LiquidBackground from '../components/LiquidBackground'
import {
  PlusIcon, PaperClipIcon, ArrowUpIcon, XMarkIcon, DocumentIcon,
  ArrowLeftIcon, ArrowDownTrayIcon, ShareIcon, UserGroupIcon,
  ExclamationTriangleIcon, LightBulbIcon, CurrencyDollarIcon,
  CalendarDaysIcon, UsersIcon, GlobeAltIcon,
  ArrowTopRightOnSquareIcon, SparklesIcon, BoltIcon, ChevronRightIcon, ChevronDownIcon,
  SwatchIcon, CursorArrowRaysIcon, CodeBracketIcon, ServerIcon,
  FilmIcon, PencilSquareIcon, ClipboardDocumentListIcon,
} from '@heroicons/react/24/outline'
import {
  translateAndAnalyse,
  fetchInspirations as apiFetchInspirations,
  analyseCompetitors,
  callJSON,
  generateSubtasks,
} from '../lib/api'
import { PHASE_COLORS, ROLE_META } from '../lib/constants'
import { getWebsiteTemplate } from '../lib/templates'
import { supabase } from '../lib/supabase'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const uid = () => Math.random().toString(36).slice(2, 9)

function buildPhasesLocal(taskDays) {
  if (!taskDays || typeof taskDays !== 'object') return []
  const tasks = Object.entries(taskDays).map(([name, days]) => ({ name, days: Number(days) || 1 }))
  if (!tasks.length) return []
  const buckets = { Discovery: [], Design: [], Development: [], Launch: [] }
  const kw = {
    Discovery:   ['research', 'discover', 'audit', 'analys', 'planning', 'plan', 'strateg', 'kickoff', 'requirement', 'brief'],
    Design:      ['design', 'wireframe', 'prototype', 'ui', 'ux', 'visual', 'brand', 'style', 'mockup', 'figma', 'colour', 'color', 'typograph'],
    Development: ['develop', 'build', 'code', 'implement', 'frontend', 'backend', 'api', 'database', 'integrat', 'program', 'engineer'],
    Launch:      ['launch', 'deploy', 'release', 'go-live', 'handoff', 'qa', 'quality', 'review', 'feedback', 'test'],
  }
  tasks.forEach(t => {
    const low = t.name.toLowerCase()
    let placed = false
    for (const [phase, words] of Object.entries(kw)) {
      if (words.some(w => low.includes(w))) { buckets[phase].push(t); placed = true; break }
    }
    if (!placed) buckets.Development.push(t)
  })
  return Object.entries(buckets)
    .filter(([, ts]) => ts.length > 0)
    .map(([name, ts], i) => ({
      name, tasks: ts,
      totalDays: ts.reduce((s, t) => s + t.days, 0),
      color: PHASE_COLORS[i % PHASE_COLORS.length],
    }))
}

function extractHexColors(text) {
  const raw = (text || '').match(/#[0-9A-Fa-f]{6}/g) ?? []
  return [...new Set(raw)].slice(0, 5)
}

function verdictBadge(verdict) {
  const map = {
    GOOD:  { bg: '#dcfce7', color: '#15803d' },
    FAIR:  { bg: '#fef9c3', color: '#a16207' },
    POOR:  { bg: '#fee2e2', color: '#dc2626' },
    CHAOS: { bg: '#f3e8ff', color: '#7c3aed' },
  }
  return map[verdict] ?? { bg: 'var(--color-surface)', color: 'var(--color-text-muted)' }
}

function scoreColor(n) {
  if (n >= 7) return '#16a34a'
  if (n >= 4) return '#d97706'
  return '#dc2626'
}

const PRIORITY_GROUPS = [
  { key: 'HIGH',   label: 'MUST HAVE',    color: '#FF4D6A' },
  { key: 'MEDIUM', label: 'SHOULD HAVE',  color: '#FFB84D' },
  { key: 'LOW',    label: 'NICE TO HAVE', color: '#606078' },
]

const TECH_COLORS = {
  frontend: '#5AB8FF', backend: '#4DFFA0', database: '#B87FFF',
  devops: '#FFB84D', design: '#FF9EF5', thirdParty: '#2DD4BF',
}

const LOAD_MSGS = [
  'Reading your brief...',
  'Scoring clarity and completeness...',
  'Extracting strategic signals...',
  'Mapping brand direction...',
  'Analysing tech requirements...',
  'Finalising your document...',
]

const BUDGET_COLORS = [
  '#4A90D9', '#6B8F71', '#9B72FF', '#E8A838',
  '#D4706A', '#4ECDC4', '#95A5A6', '#E67E22',
]

function getRoleIcon(role) {
  const map = {
    'UI Designer':      SwatchIcon,
    'UX Designer':      CursorArrowRaysIcon,
    'Frontend Dev':     CodeBracketIcon,
    'Backend Dev':      ServerIcon,
    'Brand Strategist': LightBulbIcon,
    'Motion Designer':  FilmIcon,
    'Copywriter':       PencilSquareIcon,
    'Project Manager':  ClipboardDocumentListIcon,
  }
  return map[role] || SparklesIcon
}

function safeTypoStr(val) {
  if (!val) return ''
  if (typeof val === 'string') return val
  if (typeof val === 'object') {
    return val.name || val.family || val.font ||
           val.value || val.label ||
           Object.values(val)
             .filter(v => typeof v === 'string')
             .join(' · ') ||
           ''
  }
  return String(val)
}

function extractColors(result) {
  if (result?.colorPalette?.length >= 2) {
    const valid = result.colorPalette.map(c => ({ hex: c.hex || c, name: c.name || 'Colour', usage: c.usage || '' })).filter(c => c.hex && /^#[0-9A-Fa-f]{6}$/.test(c.hex))
    if (valid.length >= 2) return valid
  }
  if (result?.colorDirection?.palette?.length >= 2) {
    const valid = result.colorDirection.palette.map((item, i) => {
      const hex = typeof item === 'string' ? item : item.hex
      if (!hex || !/^#[0-9A-Fa-f]{6}$/.test(hex)) return null
      return { hex, name: typeof item === 'object' ? item.name : ['Primary','Accent','Background','Secondary','Neutral'][i] || 'Colour '+(i+1), usage: typeof item === 'object' ? item.usage : '' }
    }).filter(Boolean)
    if (valid.length >= 2) return valid
  }
  if (typeof result?.colorDirection === 'string') {
    const matches = [...new Set(result.colorDirection.match(/#[0-9A-Fa-f]{6}/g) || [])]
    if (matches.length >= 2) return matches.slice(0, 5).map((hex, i) => ({ hex, name: ['Primary','Accent','Background','Secondary','Neutral'][i] || 'Colour '+(i+1), usage: '' }))
  }
  if (result?.colorDirection?.colors?.length >= 2) return result.colorDirection.colors
  return [{ hex: '#1E1E1E', name: 'Dark', usage: '' }, { hex: '#FFFFFF', name: 'Light', usage: '' }]
}

// ─── getSectionLabel ──────────────────────────────────────────────────────────

function getSectionLabel(defaultLabel, result) {
  const discipline = result?.discipline?.type
  const map = {
    'Tech Stack': {
      'brand':        'Production Tools',
      'photography':  'Production Setup',
      'video':        'Production Tools',
      'motion':       'Production Tools',
      'social-media': 'Tools & Platforms',
      'print':        'Production Tools',
      'illustration': 'Creative Tools',
      'game':         'Game Stack',
    },
    'User Flow': {
      'brand':        'Brand Journey',
      'campaign':     'Campaign Journey',
      'photography':  'Production Flow',
      'video':        'Production Flow',
      'motion':       'Production Flow',
      'social-media': 'Content Journey',
      'print':        'Production Flow',
    },
    'Feature Analysis': {
      'brand':        'Brand Elements',
      'campaign':     'Campaign Elements',
      'photography':  'Shot Priority',
      'video':        'Scene Priority',
      'social-media': 'Content Priority',
      'print':        'Design Elements',
      'illustration': 'Artwork Priority',
    },
  }
  return map[defaultLabel]?.[discipline] || defaultLabel
}

// ─── TypewriterHeading ────────────────────────────────────────────────────────

const TYPEWRITER_PHRASES = [
  'clear project plan',
  'structured deliverables',
  'winning design strategy',
  'client-ready roadmap',
  'team roles & timelines',
]

function TypewriterHeading() {
  const [phraseIdx, setPhraseIdx] = useState(0)
  const [displayed, setDisplayed] = useState('')
  const [phase, setPhase] = useState('typing')

  useEffect(() => {
    const target = TYPEWRITER_PHRASES[phraseIdx]
    let t
    if (phase === 'typing') {
      if (displayed.length < target.length) {
        t = setTimeout(() => setDisplayed(target.slice(0, displayed.length + 1)), 55)
      } else {
        t = setTimeout(() => setPhase('pause'), 1800)
      }
    } else if (phase === 'pause') {
      t = setTimeout(() => setPhase('deleting'), 400)
    } else {
      if (displayed.length > 0) {
        t = setTimeout(() => setDisplayed(prev => prev.slice(0, -1)), 28)
      } else {
        setPhraseIdx(i => (i + 1) % TYPEWRITER_PHRASES.length)
        setPhase('typing')
      }
    }
    return () => clearTimeout(t)
  }, [phase, displayed, phraseIdx])

  return (
    <h1 style={{
      fontFamily: 'var(--font-sans)', fontWeight: 800,
      fontSize: 'clamp(30px, 4.5vw, 46px)',
      letterSpacing: '-0.04em', lineHeight: 1.08,
      color: 'var(--color-text)', textAlign: 'center',
      marginBottom: 14, maxWidth: 540,
    }}>
      From messy brief to
      <br />
      <span style={{
        background: 'linear-gradient(135deg, var(--color-accent) 0%, var(--color-accent-2) 100%)',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        backgroundClip: 'text',
      }}>
        {displayed}
      </span>
      <span style={{
        display: 'inline-block', width: 2, height: '0.8em',
        background: 'var(--color-accent)',
        verticalAlign: 'middle', marginLeft: 1,
        animation: 'blink 1s step-end infinite',
      }} />
    </h1>
  )
}

// ─── Responsive hook ─────────────────────────────────────────────────────────

function useWindowWidth() {
  const [width, setWidth] = useState(() => window.innerWidth)
  useEffect(() => {
    function onResize() { setWidth(window.innerWidth) }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return width
}

// ─── Dashboard (main) ─────────────────────────────────────────────────────────

export default function Dashboard() {
  const {
    user, navigate, saveHistory, showToast, setCreditsUsed,
    selectedWebsiteTemplate, setSelectedWebsiteTemplate,
    setActiveProjectBriefResult,
    activeProjectBriefResult,
    activeProjectScoring,
    setActiveProjectScoring,
    connectorData,
    workspace,
    consumeCredits,
    userPlan, openUpgradeModal,
  } = useContext(AppContext)

  const windowWidth = useWindowWidth()
  const isMobile = windowWidth <= 480

  const [phase, setPhase] = useState('input')
  const [input, setInput] = useState('')
  const [inputFocused, setInputFocused] = useState(false)
  const [attachedFiles, setAttachedFiles] = useState([])
  const [loadMsg, setLoadMsg] = useState(LOAD_MSGS[0])
  const [result, setResult] = useState(null)
  const [scoring, setScoring] = useState(null)
  const [inspirations, setInspirations] = useState([])
  const [loadingInspi, setLoadingInspi] = useState(false)
  const [showPlusMenu, setShowPlusMenu] = useState(false)
  const [streamedText, setStreamedText] = useState('')
  const [streamDone, setStreamDone] = useState(false)
  const [loadingCompetitors, setLoadingCompetitors] = useState(false)
  const [storedBriefText, setStoredBriefText] = useState('')
  const [inspiSearched, setInspiSearched] = useState(false)
  const [downloadingPdf, setDownloadingPdf] = useState(false)

  const textareaRef = useRef(null)
  const fileInputRef = useRef(null)
  const plusMenuRef = useRef(null)
  const msgTimerRef = useRef(null)

  // Quick brief from session storage
  useEffect(() => {
    const quick = sessionStorage.getItem('db-quick-brief')
    if (quick) { setInput(quick); sessionStorage.removeItem('db-quick-brief') }
  }, [])

  // When something else (Sidebar history click, Project Library card
  // click) loads a brief into context, lift it into Dashboard's
  // local state and switch straight into result phase — the same
  // ResultView that renders a fresh translation. Cleared once
  // consumed so navigating away and back doesn't re-trap into
  // result view.
  useEffect(() => {
    if (!activeProjectBriefResult) return
    setResult(activeProjectBriefResult)
    setScoring(activeProjectScoring || null)
    // Hydrate inspirations from the saved result. Briefs created
    // before inspirations were persisted have no array here, so
    // fall back to [] — the empty state then keeps inspiSearched
    // false so the Find Inspiration button still appears as a
    // one-time backfill. New briefs persist inspirations on the
    // result object, so this path skips the fallback entirely.
    const savedInspi = Array.isArray(activeProjectBriefResult.inspirations)
      ? activeProjectBriefResult.inspirations
      : []
    setInspirations(savedInspi)
    setInspiSearched(savedInspi.length > 0)
    setPhase('result')
    setActiveProjectBriefResult?.(null)
    setActiveProjectScoring?.(null)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProjectBriefResult])

  // Close plus menu on outside click
  useEffect(() => {
    if (!showPlusMenu) return
    function handler(e) {
      if (plusMenuRef.current && !plusMenuRef.current.contains(e.target)) setShowPlusMenu(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showPlusMenu])

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = 'auto'
    const maxH = 240
    ta.style.height = Math.min(ta.scrollHeight, maxH) + 'px'
    ta.style.overflowY = ta.scrollHeight > maxH ? 'auto' : 'hidden'
  }, [input])

  // ── File handling ─────────────────────────────────────────────────────────

  function handleFileAttach(file) {
    if (!file) return
    setShowPlusMenu(false)
    const fileId = uid()
    const isText = file.type === 'text/plain' || file.name.endsWith('.txt') || file.name.endsWith('.md')
    setAttachedFiles(prev => [...prev, { id: fileId, name: file.name, size: file.size, type: file.type, content: null, loading: true }])
    const reader = new FileReader()
    reader.onload = e => {
      setAttachedFiles(prev => prev.map(f => f.id === fileId ? { ...f, content: e.target.result, loading: false } : f))
    }
    if (isText) reader.readAsText(file)
    else reader.readAsDataURL(file)
  }

  function removeFile(id) { setAttachedFiles(prev => prev.filter(f => f.id !== id)) }

  function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  }

  // ── Translation ───────────────────────────────────────────────────────────

  async function handleTranslate() {
    // Already mid-flight — don't fire twice.
    if (phase === 'loading') return

    let fullContext = input.trim()
    attachedFiles.forEach(f => {
      if (f.content && typeof f.content === 'string' && !f.content.startsWith('data:'))
        fullContext += '\n\n--- Attached: ' + f.name + ' ---\n' + f.content
    })
    if (!fullContext.trim()) {
      // Silent return hid the reason from the user — surface it.
      showToast?.('Paste a brief or attach a file first', 'warning')
      return
    }

    // Optimistically flip to loading IMMEDIATELY so the button shows
    // the spinner the instant the click registers. consumeCredits
    // below is a Supabase round-trip that can take ~1-2s; previously
    // we waited for that before any visual change, which made the
    // button look dead. If credits fail, we roll the phase back.
    setPhase('loading')
    setStoredBriefText(fullContext)
    setStreamedText('')
    setStreamDone(false)

    // Free-plan credit gate (10 credits per translation). On insufficient
    // credits consumeCredits shows its own toast + opens the upgrade
    // modal. For any OTHER failure reason it just console.errors —
    // we surface a generic retry toast so the click is always
    // acknowledged.
    if (consumeCredits) {
      const r = await consumeCredits('brief_translation')
      if (!r.ok) {
        if (r.reason && r.reason !== 'insufficient_credits') {
          showToast?.('Could not start translation. Try again in a moment.', 'error')
        }
        setPhase('input')
        return
      }
    }

    // Stream display text in background. Routes through the unified
    // /api/claude with stream:true so we don't need a dedicated
    // claude-stream function (Hobby plan caps at 12 functions).
    // Auth: /api/claude is gated by requireAuth, so we pass the
    // Supabase session JWT — without this the streaming fetch was
    // 401-ing and dumping a console error on every translation.
    const API_BASE = import.meta.env.VITE_API_BASE_URL || ''
    const { data: streamSession } = await supabase.auth.getSession().catch(() => ({ data: {} }))
    const streamAuth = streamSession?.session?.access_token
      ? { Authorization: 'Bearer ' + streamSession.session.access_token }
      : {}
    fetch(API_BASE + '/api/claude', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...streamAuth },
      body: JSON.stringify({
        task_type: 'brief_chat',
        stream: true,
        system: 'You are a senior brand strategist reading a design brief for the first time. Think out loud about what you notice. Write in short punchy sentences. Use plain punctuation only - no dashes, no em dashes, no hyphens between thoughts. Use periods and line breaks instead. Keep it conversational and direct.',
        message: 'Read this brief and share your first impressions. What is this project really about? Who needs it? What design direction feels right? Write 3 to 4 short paragraphs. Use simple punctuation only.\n\n' + fullContext.slice(0, 800),
        maxTokens: 600,
      }),
    }).then(async res => {
      if (!res.ok) { setStreamDone(true); return }
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value)
        for (const line of chunk.split('\n')) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6))
              if (data.text) {
                const cleaned = (data.text || '')
                  .replace(/\s*—\s*/g, ' ')
                  .replace(/–/g, '-')
                  .replace(/\u2014/g, ' ')
                  .replace(/\u2013/g, '-')
                setStreamedText(prev => prev + cleaned)
              }
              if (data.done) setStreamDone(true)
            } catch (_) {}
          }
        }
      }
      setStreamDone(true)
    }).catch(() => setStreamDone(true))

    // Rotate loading messages
    let msgIdx = 0
    msgTimerRef.current = setInterval(() => {
      msgIdx = (msgIdx + 1) % LOAD_MSGS.length
      setLoadMsg(LOAD_MSGS[msgIdx])
    }, 2200)

    try {
      // Brief-template-style instructions were removed. The website
      // template still drives the kanban/build step downstream, so
      // we keep its structural hints in the user message.
      const websiteTmpl = getWebsiteTemplate(selectedWebsiteTemplate)
      const templateContext =
        '\n\n---WEBSITE STRUCTURE---\n' +
        'Build for a ' + websiteTmpl.name +
        ' structure.\nKey sections: ' +
        websiteTmpl.sections.join(', ') +
        '\nMotion: ' + websiteTmpl.motion

      // Build connector enrichment context
      let connectorContext = ''
      if (connectorData?.figma) {
        const f = connectorData.figma
        const colorList = (f.colors || []).slice(0, 10).map(c => c.name + ': ' + c.hex).join(', ')
        const fontList = (f.fonts || []).slice(0, 4).map(f => f.fontFamily).join(', ')
        connectorContext +=
          '\n\n---EXISTING FIGMA DESIGN SYSTEM---' +
          '\nFile: ' + (f.fileName || 'Figma file') +
          (colorList ? '\nColor styles: ' + colorList : '') +
          (fontList ? '\nFont families: ' + fontList : '') +
          '\nIMPORTANT: Use these exact colors and fonts in the color palette and typography sections of the output. Do not suggest different ones.'
      }
      if (connectorData?.github) {
        const g = connectorData.github
        connectorContext +=
          '\n\n---EXISTING TECH STACK---' +
          '\nRepo: ' + (g.repoName || '') +
          '\nFramework: ' + (g.framework || 'Unknown') +
          '\nLanguage: ' + (g.language || 'JS') +
          '\nStyling: ' + (g.styling || '') +
          (g.uiKit?.length ? '\nUI kit: ' + g.uiKit.join(', ') : '') +
          (g.animations ? '\nAnimations: ' + g.animations : '') +
          (g.database ? '\nDatabase: ' + g.database : '') +
          '\nIMPORTANT: The tech stack section must use this existing stack. Do not suggest replacing it.'
      }

      const { scoreData, finalResult } = await translateAndAnalyse(fullContext + templateContext + connectorContext)
      clearInterval(msgTimerRef.current)
      if (!finalResult) throw new Error('Translation returned empty. Please try again.')
      setCreditsUsed(prev => prev + 1)

      // Deep technical breakdown (techStack + features + userFlow)
      // is now part of translateAndAnalyse — runs in parallel with
      // score + translate on the Render backend (no 60s ceiling).
      // The 10-credit brief_translation cost covers it.

      // Fetch competitors + inspirations in parallel
      setLoadingInspi(true)
      const [competitors, inspiData] = await Promise.all([
        analyseCompetitors(
          finalResult.projectTitle,
          finalResult.industry,
          finalResult.toneWords,
          fullContext
        ).catch(e => { console.error('Competitors error:', e); return [] }),
        apiFetchInspirations(
          finalResult.projectTitle,
          finalResult.toneWords,
          finalResult.moodboardKeywords
        ).catch(e => { console.error('Inspirations error:', e); return [] }),
      ])

      // inspirations live on the result object so reopening the
      // brief from history (sidebar Recent / Project Library card)
      // restores them — otherwise the InspirationsSection would fall
      // back to its empty state + Find Inspiration button every time.
      const inspirationsArr = Array.isArray(inspiData) ? inspiData : []
      const fullResult = { ...finalResult, competitors, inspirations: inspirationsArr }
      setScoring(scoreData)
      const resultWithMeta = {
        ...fullResult,
        _websiteTemplateId: selectedWebsiteTemplate,
      }
      setResult(resultWithMeta)
      setActiveProjectBriefResult(resultWithMeta)
      setPhase('result')
      setInspirations(inspirationsArr)
      setInspiSearched(true)
      setLoadingInspi(false)

      saveHistory({
        id: uid(),
        section: 'translator',
        title: finalResult.projectTitle || 'Untitled Brief',
        ts: Date.now(),
        pinned: false,
        data: { brief: fullContext, scoring: scoreData, result: fullResult },
      })
    } catch (err) {
      clearInterval(msgTimerRef.current)
      // Recognise timeout-class errors so we can give a more
      // actionable message than the raw "interrupted" line.
      const isTimeout =
        err?.code === 'timeout' ||
        err?.status === 504 ||
        /504|timeout|taking longer/i.test(err?.message || '')
      showToast(
        isTimeout
          ? 'Your brief is quite detailed. Try trimming it a bit and translating again.'
          : (err.message || 'Translation failed. Please try again.'),
        'error'
      )
      setPhase('input')
    }
  }

  async function handleFetchInspirations() {
    setInspiSearched(true)
    setLoadingInspi(true)
    console.log('[handleFetchInspirations] fetching for:', result?.projectTitle, '| tone:', result?.toneWords, '| keywords:', result?.moodboardKeywords)
    try {
      const data = await apiFetchInspirations(result?.projectTitle, result?.toneWords, result?.moodboardKeywords)
      console.log('[handleFetchInspirations] raw response:', data)
      const arr = Array.isArray(data) ? data : []
      setInspirations(arr)
      if (arr.length === 0) showToast('No inspirations found. Try refining your brief.', 'error')
    } catch (e) {
      console.error('[handleFetchInspirations] error:', e)
      showToast('Could not fetch inspirations', 'error')
    }
    setLoadingInspi(false)
  }

  async function handleLoadCompetitors() {
    setLoadingCompetitors(true)
    console.log('[handleLoadCompetitors] fetching for:', result?.projectTitle, '| industry:', result?.industry, '| tone:', result?.toneWords)
    try {
      const comps = await analyseCompetitors(
        result?.projectTitle,
        result?.industry,
        result?.toneWords,
        storedBriefText
      )
      console.log('[handleLoadCompetitors] raw response:', comps)
      if (!Array.isArray(comps) || comps.length === 0) {
        showToast('No competitors found. Try adding more context to your brief.', 'error')
      }
      setResult(prev => ({ ...prev, competitors: Array.isArray(comps) ? comps : [] }))
    } catch (e) {
      console.error('[handleLoadCompetitors] error:', e)
      showToast('Could not load competitors', 'error')
    }
    setLoadingCompetitors(false)
  }

  function handleReset() {
    setPhase('input'); setInput(''); setAttachedFiles([])
    setResult(null); setScoring(null); setInspirations([])
    setStreamedText(''); setStreamDone(false)
  }

  async function handleDownload() {
    if (!result || downloadingPdf) return
    const root = document.querySelector('.brief-result-root')
    if (!root) {
      showToast?.('Brief content not ready yet.', 'error')
      return
    }

    setDownloadingPdf(true)
    showToast?.('Preparing PDF…', 'success')

    try {
      // Dynamic import — keeps html2canvas + jspdf (~250KB combined)
      // out of the initial bundle. They're only loaded when the user
      // actually clicks Download.
      const [{ default: html2canvas }, jspdfModule] = await Promise.all([
        import('html2canvas'),
        import('jspdf'),
      ])
      const { jsPDF } = jspdfModule

      const bg = getComputedStyle(root).backgroundColor || '#ffffff'

      const canvas = await html2canvas(root, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: bg,
        // Force desktop layout regardless of where the user is
        // clicking Download from. Without this, a mobile click would
        // capture the stacked single-column view, which is fine on
        // screen but feels sparse on an A4 page.
        windowWidth: 1200,
        // Exclude the sticky header — it'd appear at the top of the
        // PDF and the action buttons aren't relevant in a saved file.
        ignoreElements: (el) =>
          !!(el.classList && el.classList.contains('brief-result-sticky')),
      })

      const imgData = canvas.toDataURL('image/jpeg', 0.92)
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
      const pdfWidth = pdf.internal.pageSize.getWidth()
      const pdfHeight = pdf.internal.pageSize.getHeight()
      const imgWidth = pdfWidth
      const imgHeight = (canvas.height * imgWidth) / canvas.width

      // Multi-page split: drop the same full-height image on each
      // page with a negative y-offset so the page window walks down
      // the canvas. Cleaner than slicing the canvas — the PDF stays
      // a single embedded image stream.
      let heightLeft = imgHeight
      let position = 0

      pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight)
      heightLeft -= pdfHeight

      while (heightLeft > 0) {
        position = heightLeft - imgHeight
        pdf.addPage()
        pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight)
        heightLeft -= pdfHeight
      }

      const filename =
        (result.projectTitle || 'brief')
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '') + '.pdf'
      pdf.save(filename)
      showToast?.('PDF downloaded', 'success')
    } catch (e) {
      console.error('[download pdf]', e)
      showToast?.(e?.message || 'Could not generate PDF. Try again.', 'error')
    } finally {
      setDownloadingPdf(false)
    }
  }

  // ── Loading phase ──────────────────────────────────────────────────────────

  if (phase === 'loading') {
    return <StreamingLoadingView streamedText={streamedText} streamDone={streamDone} />
  }

  // ── Result phase ───────────────────────────────────────────────────────────

  if (phase === 'result' && result) {
    // Brief templates were removed at user's request — every brief
    // renders through the canonical ResultView. The five renderers
    // (AgencyDeckRenderer / TechnicalSpecRenderer / etc.) still live
    // under src/components/brief/renderers/ but are no longer
    // mounted from the Dashboard.
    return (
      <ResultView
        result={result}
        scoring={scoring}
        inspirations={inspirations}
        loadingInspi={loadingInspi}
        inspiSearched={inspiSearched}
        onFetchInspirations={handleFetchInspirations}
        onReset={handleReset}
        onDownload={handleDownload}
        downloadingPdf={downloadingPdf}
        onShare={() => {
          navigator.clipboard.writeText(window.location.origin + '/share/' + uid())
            .then(() => showToast('Share link copied!', 'success'))
        }}
        onNavigate={navigate}
        showToast={showToast}
        loadingCompetitors={loadingCompetitors}
        onLoadCompetitors={handleLoadCompetitors}
      />
    )
  }

  // ── Input phase ────────────────────────────────────────────────────────────

  const hasContent = input.trim().length > 0 || attachedFiles.length > 0

  return (
    <div style={{
      height: '100%', overflowY: 'auto',
      background: 'var(--gradient-hero)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: isMobile ? '64px 16px 32px' : 'clamp(32px, 6vh, 60px) clamp(16px, 5vw, 40px)',
      position: 'relative',
    }}>
      {/* Mobile Upgrade to Pro button — top right */}
      {isMobile && workspace?.plan === 'free' && (
        <button
          onClick={() => alert('Pro plan coming soon! 500 credits/day for $19/mo.')}
          style={{
            position: 'absolute',
            top: 14,
            right: 14,
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            padding: '6px 12px',
            background: 'linear-gradient(135deg, var(--color-accent) 0%, var(--color-accent-2) 100%)',
            color: 'white',
            border: 'none',
            borderRadius: 'var(--radius-full)',
            cursor: 'pointer',
            fontFamily: 'var(--font-sans)',
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: '-0.01em',
            boxShadow: '0 2px 8px rgba(124,58,237,0.35)',
            zIndex: 5,
            whiteSpace: 'nowrap',
          }}
        >
          <BoltIcon style={{ width: 12, height: 12 }} />
          Upgrade
        </button>
      )}

      {/* Liquid blob background — sits behind the grid texture for
          a subtle living-canvas feel under the hero copy. */}
      <LiquidBackground opacity={0.08} />

      {/* Grid texture overlay */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        backgroundImage: 'radial-gradient(circle, var(--color-border) 1px, transparent 1px)',
        backgroundSize: '24px 24px',
        opacity: 0.6,
        maskImage: 'radial-gradient(ellipse 70% 70% at 50% 50%, black 0%, transparent 100%)',
        WebkitMaskImage: 'radial-gradient(ellipse 70% 70% at 50% 50%, black 0%, transparent 100%)',
      }} />

      {/* Hero content */}
      <div style={{ position: 'relative', width: '100%', maxWidth: '680px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>

        <TypewriterHeading />

        {/* Subheading */}
        <p style={{
          fontFamily: 'var(--font-sans)', fontSize: isMobile ? 13 : 15, fontWeight: 400,
          color: 'var(--color-text-muted)', textAlign: 'center',
          lineHeight: 1.7, marginBottom: isMobile ? 24 : 40, maxWidth: 400,
        }}>
          Paste a client brief. Get deliverables, timelines, colors, and team roles in seconds.
        </p>

        {/* Input card */}
        <div style={{
          width: '100%',
          background: 'var(--color-card)',
          border: `1px solid ${inputFocused ? 'var(--color-accent)' : 'var(--color-border)'}`,
          borderRadius: 'var(--radius-xl)',
          boxShadow: inputFocused ? `var(--shadow-lg), 0 0 0 3px var(--color-focus-ring)` : 'var(--shadow-lg)',
          transition: 'box-shadow var(--transition-base), border-color var(--transition-base)',
        }}>
          {/* Attached files */}
          {attachedFiles.length > 0 && (
            <div style={{ padding: '10px 14px 0', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {attachedFiles.map(file => (
                <div key={file.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: '8px', padding: '6px 10px', maxWidth: '200px' }}>
                  {file.loading
                    ? <span style={{ width: '6px', height: '6px', borderRadius: '50%', border: '1.5px solid var(--color-text-muted)', borderTopColor: 'var(--color-text)', display: 'inline-block', animation: 'spin 0.8s linear infinite', flexShrink: 0 }} />
                    : <DocumentIcon style={{ width: '14px', height: '14px', color: 'var(--color-text-soft)', flexShrink: 0 }} />
                  }
                  <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                    <span style={{ fontFamily: 'var(--font-sans)', fontSize: '12px', color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '120px' }}>{file.name}</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--color-text-muted)' }}>{formatFileSize(file.size)}</span>
                  </div>
                  <button onClick={() => removeFile(file.id)} onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-text)')} onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-text-muted)')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', padding: 0, marginLeft: '2px', display: 'flex', alignItems: 'center' }}>
                    <XMarkIcon style={{ width: '12px', height: '12px' }} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <textarea
            ref={textareaRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onFocus={() => setInputFocused(true)}
            onBlur={() => setInputFocused(false)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (hasContent) handleTranslate() } }}
            placeholder="Paste your brief here…"
            style={{ width: '100%', background: 'transparent', border: 'none', outline: 'none', resize: 'none', padding: '20px 22px 12px', color: 'var(--color-text)', fontFamily: 'var(--font-sans)', fontSize: '14px', fontWeight: 400, lineHeight: 1.7, minHeight: '120px', maxHeight: '320px', overflowY: 'hidden', display: 'block', boxSizing: 'border-box' }}
          />

          {/* Input footer */}
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px 14px', borderTop: '1px solid var(--color-divider)' }}>
            {/* Left: attach only */}
            <div style={{ display: 'flex', alignItems: 'center' }}>
              {/* Attach button — no border, icon-only */}
              <div style={{ position: 'relative' }} ref={plusMenuRef}>

                <button
                  onClick={() => setShowPlusMenu(v => !v)}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-surface)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                  style={{ width: '32px', height: '32px', borderRadius: 'var(--radius-md)', background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  <PlusIcon style={{ width: '18px', height: '18px', color: 'var(--color-text-muted)', strokeWidth: 2 }} />
                </button>
                {showPlusMenu && (
                  <div style={{ position: 'absolute', bottom: 'calc(100% + 8px)', left: 0, background: 'var(--color-card)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: '5px', minWidth: '190px', boxShadow: 'var(--shadow-lg)', animation: 'fadeUp 0.15s ease', zIndex: 100 }}>
                    <div onClick={() => { fileInputRef.current.click(); setShowPlusMenu(false) }} onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-surface)')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')} style={{ display: 'flex', gap: '10px', alignItems: 'center', padding: '9px 12px', borderRadius: 'var(--radius-md)', cursor: 'pointer' }}>
                      <PaperClipIcon style={{ width: '16px', height: '16px', color: 'var(--color-text-soft)', flexShrink: 0 }} />
                      <div>
                        <div style={{ fontFamily: 'var(--font-sans)', fontSize: '13px', color: 'var(--color-text)' }}>Attach file</div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--color-text-muted)' }}>.txt  .pdf  .docx  .md</div>
                      </div>
                    </div>
                  </div>
                )}
                <input ref={fileInputRef} type="file" accept=".txt,.pdf,.doc,.docx,.md" style={{ display: 'none' }} onChange={e => { handleFileAttach(e.target.files[0]); e.target.value = '' }} />
              </div>

              {/* end left group — template + send are on the right */}
            </div>

            {/* Right: send button (brief-template picker was removed
                — every translation now produces the same default
                strategic brief). */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {/* Send button — square. Disabled when no content OR
                while a translation is already in flight (prevents
                the "looks dead → click again → fires twice" pattern
                that was eating extra credits). */}
            <button
              onClick={handleTranslate}
              disabled={!hasContent || phase === 'loading'}
              style={{
                width: 32, height: 32, minHeight: 'unset',
                borderRadius: 8,
                background: (hasContent && phase !== 'loading')
                  ? 'var(--color-primary)'
                  : 'var(--color-surface-2)',
                color: (hasContent && phase !== 'loading') ? 'var(--color-primary-text)' : 'var(--color-text-muted)',
                border: 'none',
                cursor: (hasContent && phase !== 'loading') ? 'pointer' : 'default',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
                transition: 'all var(--transition-fast)',
                boxShadow: (hasContent && phase !== 'loading') ? 'var(--shadow-sm)' : 'none',
                opacity: phase === 'loading' ? 0.7 : 1,
              }}
              onMouseEnter={e => { if (hasContent) { e.currentTarget.style.opacity = '0.88'; e.currentTarget.style.boxShadow = 'var(--shadow-md)' } }}
              onMouseLeave={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.boxShadow = hasContent ? 'var(--shadow-sm)' : 'none' }}
            >
              {phase === 'loading' ? (
                <span style={{
                  width: 12, height: 12, borderRadius: '50%',
                  border: '1.5px solid currentColor',
                  borderTopColor: 'transparent',
                  animation: 'spin 0.6s linear infinite',
                }} />
              ) : (
                <ArrowUpIcon style={{ width: 15, height: 15, strokeWidth: 2.5 }} />
              )}
            </button>
            </div>{/* end right group */}
          </div>
        </div>

        {/* Active connector badges — hidden from live site for now.
            Re-enable by uncommenting the block below.
        {(connectorData?.figma || connectorData?.github) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 600, letterSpacing: '0.06em', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Active</span>
            {connectorData?.figma && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, background: '#A259FF12', border: '1px solid #A259FF30', borderRadius: 'var(--radius-full)', padding: '3px 10px', fontFamily: 'var(--font-sans)', fontSize: 11, fontWeight: 600, color: '#A259FF' }}>
                <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#A259FF' }} />
                Figma · {(connectorData.figma.colors || []).length} colors
              </div>
            )}
            {connectorData?.github && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'rgba(45,51,59,0.08)', border: '1px solid rgba(45,51,59,0.2)', borderRadius: 'var(--radius-full)', padding: '3px 10px', fontFamily: 'var(--font-sans)', fontSize: 11, fontWeight: 600, color: 'var(--color-text-soft)' }}>
                <div style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--color-text-soft)' }} />
                {connectorData.github.framework || 'GitHub'}
              </div>
            )}
          </div>
        )}
        */}

      </div>
    </div>
  )
}

// ─── Streaming Loading View ────────────────────────────────────────────────────

function StreamingLoadingView({ streamedText, streamDone }) {
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--color-bg)' }}>
      <div style={{ height: '40px', borderBottom: '1px solid var(--color-border)', padding: '0 32px', display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
        <div style={{ width: '16px', height: '16px', border: '2px solid var(--color-border)', borderTopColor: 'var(--color-text)', borderRadius: '50%', animation: 'spin 0.8s linear infinite', flexShrink: 0 }} />
        <span style={{ fontFamily: "'Urbanist', sans-serif", fontSize: '14px', color: 'var(--color-text-soft)' }}>
          Analysing brief...
        </span>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', maxWidth: '760px', margin: '0 auto', width: '100%', padding: '32px 32px 80px' }}>
        {streamedText ? (
          <p style={{ fontFamily: "'Urbanist', sans-serif", fontSize: '16px', lineHeight: 1.85, color: 'var(--color-text)', margin: 0 }}>
            {streamedText}
            {!streamDone && (
              <span style={{ display: 'inline-block', width: '2px', height: '18px', background: 'var(--color-text)', marginLeft: '2px', verticalAlign: 'middle', animation: 'blink 1s step-end infinite' }} />
            )}
          </p>
        ) : (
          <div style={{ display: 'flex', gap: '8px', paddingTop: '16px' }}>
            {[0, 1, 2].map(i => (
              <div key={i} style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--color-text-muted)', animation: 'pulse 1.2s ease infinite', animationDelay: `${i * 0.2}s` }} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Result View ──────────────────────────────────────────────────────────────

function ResultView({ result: r, scoring: s, inspirations, loadingInspi, inspiSearched, onFetchInspirations, onReset, onDownload, downloadingPdf, onShare, onNavigate, showToast, loadingCompetitors, onLoadCompetitors }) {
  const phases = buildPhasesLocal(r.timeframe?.taskDays)
  const badge = s ? verdictBadge(s.verdict) : null

  return (
    <div className="brief-result-root" style={{ height: '100%', overflowY: 'auto', background: 'var(--color-bg)' }}>

      {/* ── Responsive overrides ───────────────────────────────────
          Inline styles in this view bake desktop-sized padding and
          fixed multi-column grids into every section. Rather than
          edit ~17 components, we override the inline styles via
          media queries here. Selectors target either an explicit
          className we add to the few load-bearing wrappers, or the
          serialised inline `style` attribute (React renders camelCase
          props as kebab-case in the DOM, so [style*="1fr 1fr"]
          reliably matches the grid declarations).
          Breakpoints:
            ≤ 700px  — mobile: stack everything, shrink padding
            701-1024 — tablet: keep grids, ease padding
            ≥ 1025px — desktop: original layout
      */}
      <style>{`
        @media (max-width: 1024px) {
          /* Section wrappers in this view come in both <section> and
             <div> flavours but share a 40-48px / 48-48px horizontal
             padding pattern. Target by inline style so we hit both
             tag types without adding classNames to every section. */
          .brief-result-root [style*="padding: 40px 48px"],
          .brief-result-root [style*="padding: 28px 48px"] {
            padding-left: 32px !important; padding-right: 32px !important;
          }
          .brief-result-root .brief-result-hero { padding-left: 32px !important; padding-right: 32px !important; gap: 32px !important; }
          .brief-result-root .brief-result-sticky { padding-left: 20px !important; padding-right: 20px !important; }
          /* Lift desktop-baked maxWidth caps on text blocks so prose
             reaches both edges of its container instead of stranding
             whitespace on the right (Hero description, score-card
             summary, creative-concept quote, attached-file chips). */
          .brief-result-root [style*="max-width: 600"],
          .brief-result-root [style*="max-width: 800"],
          .brief-result-root [style*="max-width: 540"],
          .brief-result-root [style*="max-width: 400"] {
            max-width: 100% !important;
          }
          /* Tighter auto-fill minimums so tile grids land 2-3 cards
             per row on tablet instead of one card + dead space. */
          .brief-result-root [style*="minmax(280px"] { grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)) !important; }
          .brief-result-root [style*="minmax(240px"] { grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)) !important; }
        }
        @media (max-width: 700px) {
          .brief-result-root [style*="padding: 40px 48px"],
          .brief-result-root [style*="padding: 28px 48px"] {
            padding-left: 16px !important; padding-right: 16px !important;
            padding-top: 28px !important; padding-bottom: 28px !important;
          }
          /* Hero: stack title + score card, shrink title */
          .brief-result-root .brief-result-hero {
            grid-template-columns: 1fr !important;
            padding: 28px 16px 24px !important;
            gap: 20px !important;
          }
          .brief-result-root .brief-result-hero h1 { font-size: 28px !important; }
          .brief-result-root .brief-result-hero p { font-size: 15px !important; line-height: 1.65 !important; }
          /* Score card: drop sticky positioning when stacked */
          .brief-result-root .brief-result-score-card { position: static !important; padding: 20px !important; }
          /* Any 2-col / 3-col / fractional-col grid stacks to 1 column.
             [style*="1fr 1fr"] also catches "1fr 1fr 1fr" — that's
             desired (3-col stacks on mobile too). [style*="2fr 1fr"]
             catches the Hero + Issues banner; [style*="repeat(3"]
             catches the deliverables / clarity grids. The type-scale
             table is excluded via .brief-result-no-stack so its rows
             keep their column structure. */
          .brief-result-root [style*="1fr 1fr"]:not(.brief-result-no-stack),
          .brief-result-root [style*="2fr 1fr"]:not(.brief-result-no-stack),
          .brief-result-root [style*="1fr 1.4fr"]:not(.brief-result-no-stack),
          .brief-result-root [style*="repeat(3"]:not(.brief-result-no-stack) {
            grid-template-columns: 1fr !important;
            gap: 16px !important;
          }
          /* Sticky header: trim padding, hide secondary button labels */
          .brief-result-root .brief-result-sticky {
            padding-left: 12px !important; padding-right: 12px !important;
            gap: 8px !important;
          }
          .brief-result-root .brief-result-sticky .sticky-label { display: none !important; }
          .brief-result-root .brief-result-sticky .sticky-project-title { display: none !important; }
          /* Generic large headings on mobile */
          .brief-result-root h1 { font-size: 28px !important; }
          .brief-result-root h2 { font-size: 22px !important; }
          /* Lift every remaining width cap so blocks fill the row */
          .brief-result-root [style*="max-width: 600"],
          .brief-result-root [style*="max-width: 800"],
          .brief-result-root [style*="max-width: 540"],
          .brief-result-root [style*="max-width: 400"],
          .brief-result-root [style*="max-width: 180"],
          .brief-result-root [style*="max-width: 150"],
          .brief-result-root [style*="max-width: 120"] {
            max-width: 100% !important;
          }
          /* Cap auto-fill grids to a single column on mobile so cards
             don't sit at their min-tile width with dead space beside. */
          .brief-result-root [style*="minmax(280px"],
          .brief-result-root [style*="minmax(240px"],
          .brief-result-root [style*="minmax(200px"] {
            grid-template-columns: 1fr !important;
          }
          /* Type-scale block: the inner 6-col grid totals ~300px
             minimum; on viewports under 360px it would overflow. Wrap
             it in a horizontal scroll so the rows stay readable
             without squishing the columns. */
          .brief-result-root .brief-result-scale-block { overflow-x: auto; -webkit-overflow-scrolling: touch; }
          /* Centre the creative-concept quote and let it breathe */
          .brief-result-root section [style*="text-align: center"] { margin-left: auto !important; margin-right: auto !important; }
        }
      `}</style>

      {/* Sticky header */}
      <div className="brief-result-sticky" style={{ position: 'sticky', top: 0, zIndex: 20, background: 'var(--color-bg)', borderBottom: '1px solid var(--color-border)', padding: '0 32px', height: '52px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
          <button onClick={onReset} onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-surface)')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'transparent', border: 'none', cursor: 'pointer', padding: '6px 10px', borderRadius: '8px', color: 'var(--color-text-soft)', fontFamily: "'Urbanist', sans-serif", fontSize: '13px', transition: 'background 0.15s', flexShrink: 0 }}>
            <ArrowLeftIcon style={{ width: '16px', height: '16px' }} />
            <span className="sticky-label">New Brief</span>
          </button>
          <div className="sticky-project-title" style={{ width: '1px', height: '20px', background: 'var(--color-border)', margin: '0 4px' }} />
          <span className="sticky-project-title" style={{ fontFamily: "'Urbanist', sans-serif", fontWeight: 700, fontSize: '16px', color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {r.projectTitle ?? 'Untitled Project'}
          </span>
          {s && badge && (
            <span style={{ fontFamily: "'Urbanist', sans-serif", fontSize: '11px', fontWeight: 600, padding: '3px 10px', borderRadius: '20px', background: badge.bg, color: badge.color, flexShrink: 0 }}>
              {s.verdict}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
          <button onClick={onShare} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: '9px', padding: '7px 14px', fontFamily: "'Urbanist', sans-serif", fontWeight: 600, fontSize: '13px', color: 'var(--color-text)', cursor: 'pointer' }}>
            <ShareIcon style={{ width: '14px', height: '14px' }} />
            <span className="sticky-label">Share</span>
          </button>
          <button
            onClick={onDownload}
            disabled={downloadingPdf}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              background: 'var(--color-text)', color: 'var(--color-bg)',
              border: 'none', borderRadius: '9px', padding: '7px 14px',
              fontFamily: "'Urbanist', sans-serif", fontWeight: 600, fontSize: '13px',
              cursor: downloadingPdf ? 'wait' : 'pointer',
              opacity: downloadingPdf ? 0.7 : 1,
              transition: 'opacity 0.15s',
            }}
          >
            {downloadingPdf ? (
              <span style={{ display: 'inline-block', width: 14, height: 14, borderRadius: '50%', border: '2px solid currentColor', borderTopColor: 'transparent', animation: 'spin 0.6s linear infinite' }} />
            ) : (
              <ArrowDownTrayIcon style={{ width: '14px', height: '14px' }} />
            )}
            <span className="sticky-label">{downloadingPdf ? 'Preparing…' : 'Download'}</span>
          </button>
          <button onClick={() => onNavigate('team')} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--color-text)', color: 'var(--color-bg)', border: 'none', borderRadius: '9px', padding: '7px 14px', fontFamily: "'Urbanist', sans-serif", fontWeight: 600, fontSize: '13px', cursor: 'pointer' }}>
            <UserGroupIcon style={{ width: '14px', height: '14px' }} />
            <span className="sticky-label">Build Team</span>
          </button>
        </div>
      </div>

      {/* Sections — priority order */}
      <HeroSection r={r} s={s} />
      {r.creativeConceptStatement && <CreativeConceptSection statement={r.creativeConceptStatement} />}
      <IssuesBannerSection r={r} scoring={s} />
      <DesignDirectionSection r={r} showToast={showToast} />
      <TypographyMoodboardSection r={r} />
      <TypographySection typography={r.typography} discipline={r.discipline} />
      {r.copyVoice && <BrandVoiceSection copyVoice={r.copyVoice} />}
      {phases.length > 0 && <GanttSection phases={phases} timeframe={r.timeframe} projectTitle={r.projectTitle} />}
      {r.budgetRange && <BudgetSection budgetRange={r.budgetRange} />}
      {r.rolesNeeded?.length > 0 && <RolesSection rolesNeeded={r.rolesNeeded} />}
      {r.deliverables?.length > 0 && <DeliverablesSection deliverables={r.deliverables} />}
      {/* Deep analysis (features, techStack, userFlow) is bundled
          into translateAndAnalyse now, so every result has these.
          Saved briefs from before the bundle change may not — render
          each section conditionally so old briefs degrade gracefully
          instead of showing empty headers. */}
      {r.features?.length > 0 && <FeaturesSection features={r.features} discipline={r.discipline} />}
      {r.techStack && <TechStackSection techStack={r.techStack} discipline={r.discipline} />}
      {(() => {
        const uf = r.userFlow
        let steps = Array.isArray(uf) ? uf
          : uf?.steps ? uf.steps
          : uf && typeof uf === 'object' ? Object.values(uf) : []
        steps = steps.filter(s => s && typeof s === 'object')
        if (!steps.length) return null
        return <UserFlowSection userFlow={steps} discipline={r.discipline} />
      })()}
      <CompetitorsSection result={r} loadingCompetitors={loadingCompetitors} onLoad={onLoadCompetitors} />
      <ClarityFlagsSection r={r} />
      <InspirationsSection r={r} inspirations={inspirations} loadingInspi={loadingInspi} onFetch={onFetchInspirations} inspiSearched={inspiSearched} />
    </div>
  )
}

// ─── Creative Concept Section ─────────────────────────────────────────────────

function CreativeConceptSection({ statement }) {
  return (
    <section style={{ padding: '28px 48px', borderBottom: '1px solid var(--color-border)', background: 'var(--color-surface)' }}>
      <div style={{ maxWidth: 800, margin: '0 auto', textAlign: 'center' }}>
        <div style={{ fontFamily: "'Urbanist',sans-serif", fontSize: 64, lineHeight: 0.8, color: 'var(--color-border)', marginBottom: 8, fontWeight: 900 }}>"</div>
        <div style={{ fontFamily: "'Urbanist',sans-serif", fontWeight: 700, fontSize: 22, color: 'var(--color-text)', lineHeight: 1.5, letterSpacing: '-0.01em', marginBottom: 14 }}>
          {statement}
        </div>
        <div style={{ fontFamily: "'Urbanist', sans-serif", fontSize: 10, color: 'var(--color-text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
          Creative Concept
        </div>
      </div>
    </section>
  )
}

// ─── Brand Voice Section ──────────────────────────────────────────────────────

function BrandVoiceSection({ copyVoice }) {
  return (
    <section style={{ padding: '40px 48px', borderBottom: '1px solid var(--color-border)' }}>
      <div style={{ fontFamily: "'Urbanist', sans-serif", fontSize: 11, color: 'var(--color-text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 28 }}>Brand Voice</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 20 }}>

        {/* Personality + Principles */}
        <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 14, padding: 20 }}>
          <div style={{ fontFamily: "'Urbanist', sans-serif", fontSize: 9, color: 'var(--color-text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 12 }}>Voice Personality</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
            {(copyVoice.personality || '').split(',').map(p => p.trim()).filter(Boolean).map((trait, i) => (
              <div key={i} style={{ background: 'var(--color-card)', border: '1px solid var(--color-border)', borderRadius: 100, padding: '5px 14px', fontFamily: "'Urbanist',sans-serif", fontWeight: 600, fontSize: 13, color: 'var(--color-text)' }}>{trait}</div>
            ))}
          </div>
          {copyVoice.writingPrinciples?.length > 0 && (
            <div>
              <div style={{ fontFamily: "'Urbanist', sans-serif", fontSize: 9, color: 'var(--color-text-muted)', letterSpacing: '0.06em', marginBottom: 8, textTransform: 'uppercase' }}>Principles</div>
              {copyVoice.writingPrinciples.map((p, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 6 }}>
                  <div style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--color-text)', flexShrink: 0, marginTop: 6 }} />
                  <div style={{ fontFamily: "'Urbanist',sans-serif", fontSize: 12, color: 'var(--color-text-soft)', lineHeight: 1.6 }}>{p}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Say this */}
        <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 14, padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 12 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#16a34a' }} />
            <div style={{ fontFamily: "'Urbanist', sans-serif", fontSize: 9, color: '#16a34a', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 700 }}>Say this</div>
          </div>
          {copyVoice.doSay?.map((ex, i) => (
            <div key={i} style={{ background: 'rgba(22,163,74,0.05)', border: '1px solid rgba(22,163,74,0.15)', borderLeft: '3px solid #16a34a', borderRadius: '0 8px 8px 0', padding: '8px 12px', marginBottom: 8, fontFamily: "'Urbanist',sans-serif", fontSize: 13, color: 'var(--color-text)', lineHeight: 1.55 }}>{ex}</div>
          ))}
        </div>

        {/* Avoid this */}
        <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 14, padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 12 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#dc2626' }} />
            <div style={{ fontFamily: "'Urbanist', sans-serif", fontSize: 9, color: '#dc2626', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 700 }}>Avoid this</div>
          </div>
          {copyVoice.doNotSay?.map((ex, i) => (
            <div key={i} style={{ background: 'rgba(220,38,38,0.05)', border: '1px solid rgba(220,38,38,0.15)', borderLeft: '3px solid #dc2626', borderRadius: '0 8px 8px 0', padding: '8px 12px', marginBottom: 8, fontFamily: "'Urbanist',sans-serif", fontSize: 13, color: 'var(--color-text)', lineHeight: 1.55 }}>{ex}</div>
          ))}
        </div>

      </div>
    </section>
  )
}

// ─── Deliverables Section ─────────────────────────────────────────────────────

function DeliverablesSection({ deliverables }) {
  return (
    <section style={{ padding: '40px 48px', borderBottom: '1px solid var(--color-border)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 24 }}>
        <div style={{ fontFamily: "'Urbanist', sans-serif", fontSize: 11, color: 'var(--color-text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Deliverables</div>
        <div style={{ fontFamily: "'Urbanist', sans-serif", fontSize: 11, color: 'var(--color-text-muted)' }}>{deliverables.length} items</div>
      </div>

      {/* Table header */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 80px 120px 100px', gap: 12, padding: '8px 16px', background: 'var(--color-surface)', borderRadius: 8, marginBottom: 8 }}>
        {['Deliverable', 'Format', 'Qty', 'Who', 'Priority'].map(h => (
          <div key={h} style={{ fontFamily: "'Urbanist', sans-serif", fontSize: 9, color: 'var(--color-text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{h}</div>
        ))}
      </div>

      {deliverables.map((d, i) => {
        const priorityColor =
          d.priority === 'ESSENTIAL' ? '#dc2626'
          : d.priority === 'IMPORTANT' ? '#d97706'
          : '#6b7280'
        return (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 80px 120px 100px', gap: 12, padding: '12px 16px', background: 'var(--color-card)', border: '1px solid var(--color-border)', borderRadius: 10, marginBottom: 6, alignItems: 'center' }}>
            <div style={{ fontFamily: "'Urbanist',sans-serif", fontWeight: 600, fontSize: 13, color: 'var(--color-text)' }}>{d.item}</div>
            <div style={{ fontFamily: "'Urbanist', sans-serif", fontSize: 11, color: 'var(--color-text-muted)' }}>{d.format}</div>
            <div style={{ fontFamily: "'Urbanist', sans-serif", fontSize: 11, color: 'var(--color-text-soft)' }}>{d.quantity}</div>
            <div style={{ fontFamily: "'Urbanist',sans-serif", fontSize: 11, color: 'var(--color-text-soft)' }}>{d.discipline}</div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: priorityColor + '10', border: '1px solid ' + priorityColor + '25', borderRadius: 5, padding: '3px 9px' }}>
              <div style={{ width: 5, height: 5, borderRadius: '50%', background: priorityColor }} />
              <span style={{ fontFamily: "'Urbanist', sans-serif", fontSize: 9, fontWeight: 700, color: priorityColor, letterSpacing: '0.04em' }}>{d.priority}</span>
            </div>
          </div>
        )
      })}
    </section>
  )
}

// ─── Section 1: Hero ──────────────────────────────────────────────────────────

function HeroSection({ r, s }) {
  const [scoreRevealed, setScoreRevealed] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setScoreRevealed(true), 300)
    return () => clearTimeout(t)
  }, [])

  return (
    <div className="brief-result-hero" style={{ padding: '48px 48px 40px', borderBottom: '1px solid var(--color-border)', display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '48px', alignItems: 'flex-start' }}>
      <div>
        <SparklesIcon style={{ width: '18px', height: '18px', color: 'var(--color-text-muted)', marginBottom: '12px', display: 'block' }} />
        <h1 style={{ fontFamily: "'Urbanist', sans-serif", fontWeight: 800, fontSize: '42px', letterSpacing: '-0.03em', color: 'var(--color-text)', marginBottom: '16px', lineHeight: 1.1 }}>
          {r.projectTitle ?? 'Untitled Project'}
        </h1>
        {r.discipline && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
            {r.discipline.type && (
              <div style={{ background: 'var(--color-text)', color: 'var(--color-bg)', borderRadius: 100, padding: '4px 14px', fontFamily: "'Urbanist', sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                {r.discipline.type.replace(/-/g, ' ')}
              </div>
            )}
            {/* Prefer the granular platforms array (website / webapp /
                mobile). Fall back to the coarse platform string when
                the older schema is in play. */}
            {Array.isArray(r.discipline.platforms) && r.discipline.platforms.length > 0 ? (
              r.discipline.platforms.map(p => (
                <div key={p} style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 100, padding: '4px 14px', fontFamily: "'Urbanist', sans-serif", fontSize: 11, color: 'var(--color-text-soft)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <span aria-hidden style={{ fontSize: 11 }}>
                    {p === 'mobile' ? '📱' : p === 'webapp' ? '🛠' : '🖥'}
                  </span>
                  <span style={{ textTransform: 'capitalize' }}>{p}</span>
                </div>
              ))
            ) : (
              r.discipline.platform && (
                <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 100, padding: '4px 14px', fontFamily: "'Urbanist', sans-serif", fontSize: 11, color: 'var(--color-text-soft)', textTransform: 'capitalize' }}>
                  {r.discipline.platform}
                </div>
              )
            )}
            {r.discipline.primaryCreative && (
              <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 100, padding: '4px 14px', fontFamily: "'Urbanist',sans-serif", fontSize: 11, fontWeight: 500, color: 'var(--color-text-soft)' }}>
                {r.discipline.primaryCreative}
              </div>
            )}
          </div>
        )}
        {r.projectUnderstanding && (
          <p style={{ fontFamily: "'Urbanist', sans-serif", fontSize: '17px', lineHeight: 1.8, color: 'var(--color-text-soft)', maxWidth: '600px', margin: 0 }}>
            {r.projectUnderstanding}
          </p>
        )}
      </div>

      {s && (
        <div className="brief-result-score-card" style={{ background: 'var(--color-card)', border: '1px solid var(--color-border)', borderRadius: 20, padding: 28, position: 'sticky', top: 70 }}>

          {/* Score ring + verdict */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 24 }}>
            {(() => {
              const score = s.overall || 0
              const r2 = 38
              const circ = 2 * Math.PI * r2
              const offset = circ - (scoreRevealed ? (score / 10) * circ : 0)
              const color = score >= 7 ? '#16a34a' : score >= 4 ? '#d97706' : '#dc2626'
              return (
                <div style={{ position: 'relative', width: 100, height: 100, flexShrink: 0 }}>
                  <svg width="100" height="100" style={{ transform: 'rotate(-90deg)' }}>
                    <circle cx="50" cy="50" r={r2} fill="none" stroke="var(--color-border)" strokeWidth="7" />
                    <circle cx="50" cy="50" r={r2} fill="none" stroke={color} strokeWidth="7"
                      strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={offset}
                      style={{ transition: scoreRevealed ? 'stroke-dashoffset 1.4s cubic-bezier(0.34,1.56,0.64,1)' : 'none' }} />
                  </svg>
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ fontFamily: "'Urbanist', sans-serif", fontWeight: 800, fontSize: 26, color, lineHeight: 1 }}>{score}</span>
                    <span style={{ fontFamily: "'Urbanist', sans-serif", fontSize: 10, color: 'var(--color-text-muted)' }}>/10</span>
                  </div>
                </div>
              )
            })()}

            <div>
              <div style={{ fontFamily: "'Urbanist', sans-serif", fontSize: 10, color: 'var(--color-text-muted)', letterSpacing: '0.08em', marginBottom: 6, textTransform: 'uppercase' }}>
                Brief Score
              </div>
              <div style={{ fontFamily: "'Urbanist', sans-serif", fontWeight: 800, fontSize: 22, color: s.overall >= 7 ? '#16a34a' : s.overall >= 4 ? '#d97706' : '#dc2626', marginBottom: 4 }}>
                {s.verdict || 'FAIR'}
              </div>
              <div style={{ fontFamily: "'Urbanist', sans-serif", fontSize: 11, color: 'var(--color-text-soft)', lineHeight: 1.5, maxWidth: 180 }}>
                {s.summary || ''}
              </div>
            </div>
          </div>

          {/* Three expanding metric bars */}
          {[
            { label: 'Clarity', value: s.clarity || 0 },
            { label: 'Completeness', value: s.completeness || 0 },
            { label: 'No Contradictions', value: s.contradictions || 0 },
          ].map((m, i) => {
            const barColor = m.value >= 7 ? '#16a34a' : m.value >= 4 ? '#d97706' : '#dc2626'
            return (
              <div key={m.label} style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                  <span style={{ fontFamily: "'Urbanist', sans-serif", fontSize: 11, color: 'var(--color-text-soft)' }}>{m.label}</span>
                  <span style={{ fontFamily: "'Urbanist', sans-serif", fontSize: 11, color: barColor, fontWeight: 700 }}>{m.value}/10</span>
                </div>
                <div style={{ height: 5, background: 'var(--color-border)', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ height: '100%', borderRadius: 3, background: barColor, width: scoreRevealed ? `${(m.value / 10) * 100}%` : '0%', transition: scoreRevealed ? `width 1s ease ${0.3 + i * 0.15}s` : 'none' }} />
                </div>
              </div>
            )
          })}

        </div>
      )}
    </div>
  )
}

// ─── Section 2: Chaos Banner ──────────────────────────────────────────────────

function ChaosBannerSection({ r, s }) {
  return (
    <div style={{ padding: '24px 48px', background: 'rgba(124,58,237,0.06)', borderBottom: '1px solid rgba(124,58,237,0.2)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
        <BoltIcon style={{ width: '18px', height: '18px', color: '#7c3aed', flexShrink: 0 }} />
        <span style={{ fontFamily: "'Urbanist', sans-serif", fontWeight: 700, fontSize: '16px', color: '#7c3aed' }}>
          This brief needs clarity before design begins
        </span>
      </div>
      {s?.chaosReason && (
        <p style={{ fontFamily: "'Urbanist', sans-serif", fontSize: '14px', color: 'var(--color-text-soft)', marginBottom: '16px', lineHeight: 1.6 }}>
          {s.chaosReason}
        </p>
      )}
      {r.chaosSolutions.map((sol, i) => (
        <div key={i} style={{ display: 'flex', gap: '14px', alignItems: 'flex-start', padding: '10px 0', borderBottom: i < r.chaosSolutions.length - 1 ? '1px solid rgba(124,58,237,0.15)' : 'none' }}>
          <span style={{ fontFamily: "'Urbanist', sans-serif", fontSize: '11px', color: '#7c3aed', fontWeight: 700, flexShrink: 0 }}>{String(i + 1).padStart(2, '0')}</span>
          <span style={{ fontFamily: "'Urbanist', sans-serif", fontSize: '14px', color: 'var(--color-text)', lineHeight: 1.6 }}>{sol}</span>
        </div>
      ))}
    </div>
  )
}

// ─── Section 2b: Issues Banner ────────────────────────────────────────────────

function IssuesBannerSection({ r, scoring }) {
  const hasIssues = scoring?.issues?.length > 0
  const isChaos   = !!r?.isChaos
  if (!hasIssues && !isChaos) return null

  const accentColor  = isChaos ? '#dc2626' : '#d97706'
  const hasFixes     = r?.chaosSolutions?.length > 0

  return (
    <section style={{
      padding: '24px 48px',
      borderBottom: '1px solid var(--color-border)',
      background: isChaos ? 'rgba(220,38,38,0.03)' : 'rgba(217,119,6,0.03)',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 16 }}>
        <ExclamationTriangleIcon style={{ width: 18, height: 18, color: accentColor, flexShrink: 0, marginTop: 2 }} />
        <div>
          <div style={{ fontFamily: "'Urbanist',sans-serif", fontWeight: 700, fontSize: 16, color: accentColor, marginBottom: 4 }}>
            {isChaos
              ? 'This brief needs significant clarity before design can begin'
              : 'Issues found in this brief'}
          </div>
          {r?.chaosReason && (
            <div style={{ fontFamily: "'Urbanist',sans-serif", fontSize: 13, color: 'var(--color-text-soft)', lineHeight: 1.65 }}>
              {r.chaosReason}
            </div>
          )}
        </div>
      </div>

      {/* Two-column body */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, alignItems: 'flex-start' }}>

        {/* Left — issues grid */}
        <div>
          {hasIssues && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 8 }}>
              {scoring.issues.map((issue, i) => (
                <div key={i} style={{
                  display: 'flex',
                  gap: 10,
                  alignItems: 'flex-start',
                  background: 'var(--color-card)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 9,
                  padding: '10px 14px',
                }}>
                  <div style={{
                    width: 22, height: 22,
                    borderRadius: '50%',
                    background: 'rgba(220,38,38,0.1)',
                    border: '1.5px solid rgba(220,38,38,0.4)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    fontFamily: "'Urbanist', sans-serif",
                    fontSize: 9,
                    fontWeight: 700,
                    color: '#dc2626',
                    marginTop: 1,
                  }}>
                    {i + 1}
                  </div>
                  <div style={{
                    fontFamily: "'Urbanist',sans-serif",
                    fontSize: 12,
                    color: 'var(--color-text-soft)',
                    lineHeight: 1.6,
                  }}>
                    {issue}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right — recommended fixes card */}
        {hasFixes && (
          <div style={{
            background: 'var(--color-card)',
            border: '1px solid var(--color-border)',
            borderRadius: 12, padding: '16px 18px',
          }}>
            <div style={{ fontFamily: "'Urbanist', sans-serif", fontSize: 10, color: 'var(--color-text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 12 }}>Recommended fixes</div>
            {r.chaosSolutions.map((sol, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: i < r.chaosSolutions.length - 1 ? 10 : 0 }}>
                <div style={{
                  width: 20, height: 20, borderRadius: '50%',
                  background: 'rgba(22,163,74,0.1)',
                  border: '1px solid rgba(22,163,74,0.3)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                  fontFamily: "'Urbanist', sans-serif", fontSize: 9, fontWeight: 700, color: '#16a34a',
                }}>{i + 1}</div>
                <div style={{ fontFamily: "'Urbanist',sans-serif", fontSize: 13, color: 'var(--color-text-soft)', lineHeight: 1.6 }}>{sol}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

// ─── Section 3: Design Direction ─────────────────────────────────────────────

function DesignDirectionSection({ r, showToast }) {
  const [revealed, setRevealed] = useState(false)
  const [paletteMode, setPaletteMode] = useState('light')

  useEffect(() => {
    const t = setTimeout(() => setRevealed(true), 400)
    return () => clearTimeout(t)
  }, [])

  function generateTints(hex) {
    try {
      const rr = parseInt(hex.slice(1, 3), 16)
      const gg = parseInt(hex.slice(3, 5), 16)
      const bb = parseInt(hex.slice(5, 7), 16)
      return [0.85, 0.65, 0.45, 0.2, 0, 0.25, 0.5].map((mix, i) => {
        if (i < 4) {
          return `rgb(${Math.round(rr + (255 - rr) * mix)},${Math.round(gg + (255 - gg) * mix)},${Math.round(bb + (255 - bb) * mix)})`
        }
        return `rgb(${Math.round(rr * (1 - mix))},${Math.round(gg * (1 - mix))},${Math.round(bb * (1 - mix))})`
      })
    } catch (e) { return [] }
  }

  const colors = extractColors(r)
  const primary = colors[0]?.hex || '#1A1A2E'
  const accent  = colors[1]?.hex || '#E94560'
  const bg      = colors[2]?.hex || '#F9FAFB'

  const dispFontName = safeTypoStr(r?.typography?.displayFont || r?.typography?.display).split('—')[0].trim() || 'Urbanist'
  const bodyFontName = safeTypoStr(r?.typography?.bodyFont || r?.typography?.body).split('—')[0].trim() || 'Urbanist'

  const AXIS_COLORS = ['#FF4D6A', '#6C63FF', '#4DAAFF', '#4CAF82', '#FFB84D']

  return (
    <section style={{ padding: '40px 48px', borderBottom: '1px solid var(--color-border)' }}>
      <div style={{ fontFamily: "'Urbanist', sans-serif", fontSize: 11, color: 'var(--color-text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 28 }}>
        Design Direction
      </div>

      {/* ── ROW 1: Full-width Colour Palette ── */}
      <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 16, padding: 24, marginBottom: 24, display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 32 }}>

        {/* Left: swatches + tint scale */}
        <div>
          <div style={{ fontFamily: "'Urbanist', sans-serif", fontSize: 10, color: 'var(--color-text-muted)', letterSpacing: '0.08em', marginBottom: 16, textTransform: 'uppercase' }}>Colour Palette</div>
          {colors.map((color, ci) => {
            const tints = generateTints(color.hex)
            return (
              <div key={ci} style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 6 }}>
                  <div
                    onClick={() => { navigator.clipboard.writeText(color.hex); showToast && showToast(color.hex + ' copied!', 'success') }}
                    title={'Click to copy ' + color.hex}
                    style={{ width: 48, height: 48, borderRadius: 10, background: color.hex, flexShrink: 0, cursor: 'pointer', border: '1px solid rgba(0,0,0,0.07)', transition: 'transform 0.15s, box-shadow 0.15s' }}
                    onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.06)'; e.currentTarget.style.boxShadow = '0 4px 14px rgba(0,0,0,0.18)' }}
                    onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = 'none' }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: "'Urbanist', sans-serif", fontWeight: 600, fontSize: 14, color: 'var(--color-text)', marginBottom: 2 }}>{color.name}</div>
                    <div style={{ fontFamily: "'Urbanist', sans-serif", fontSize: 11, color: 'var(--color-text-muted)', marginBottom: 2 }}>{color.hex}</div>
                    {color.usage && (
                      <div style={{ fontFamily: "'Urbanist', sans-serif", fontSize: 10, color: 'var(--color-text-muted)', lineHeight: 1.4 }}>{color.usage}</div>
                    )}
                  </div>
                </div>
                {tints.length > 0 && (
                  <div style={{ display: 'flex', gap: 0 }}>
                    {tints.map((t, ti) => (
                      <div key={ti} style={{ flex: 1, height: 6, background: t, borderRadius: ti === 0 ? '4px 0 0 4px' : ti === tints.length - 1 ? '0 4px 4px 0' : '0' }} />
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Right: live brand preview */}
        <div>
          {/* Header row with mode toggle */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ fontFamily: "'Urbanist', sans-serif", fontSize: 10, color: 'var(--color-text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Live Brand Preview</div>
            <div style={{ display: 'flex', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8, padding: 3, gap: 3 }}>
              {['light', 'dark'].map(mode => (
                <button
                  key={mode}
                  onClick={() => setPaletteMode(mode)}
                  style={{
                    background: paletteMode === mode ? 'var(--color-card)' : 'transparent',
                    border: paletteMode === mode ? '1px solid var(--color-border)' : '1px solid transparent',
                    borderRadius: 6,
                    padding: '4px 10px',
                    fontFamily: "'Urbanist', sans-serif",
                    fontSize: 9,
                    fontWeight: paletteMode === mode ? 700 : 400,
                    color: paletteMode === mode ? 'var(--color-text)' : 'var(--color-text-muted)',
                    cursor: 'pointer',
                    textTransform: 'capitalize',
                    transition: 'all 0.15s',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                  }}
                >
                  {mode === 'light' ? '☀' : '☾'} {mode}
                </button>
              ))}
            </div>
          </div>

          {/* Mode-aware preview */}
          {(() => {
            const previewBg        = paletteMode === 'light' ? '#FFFFFF' : '#111111'
            const previewText      = paletteMode === 'light' ? '#111111' : '#F0F0F0'
            const previewTextMuted = paletteMode === 'light' ? '#6B6B6B' : '#888888'
            const previewCardBg    = paletteMode === 'light' ? '#F8F8F8' : '#1E1E1E'
            const previewBorder    = paletteMode === 'light' ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)'
            const previewCardBorder= paletteMode === 'light' ? '#E5E5E5' : '#2A2A2A'
            const badgeBg          = paletteMode === 'light' ? accent + '18' : accent + '25'
            const typoRowBg        = paletteMode === 'light' ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.05)'

            return (
              <div style={{ border: '1px solid var(--color-border)', borderRadius: 12, overflow: 'hidden', opacity: revealed ? 1 : 0, transition: 'opacity 0.4s ease' }}>
                {/* Mock nav — always uses primary colour */}
                <div style={{ background: primary, padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', gap: 5 }}>
                    {['#FF5F57', '#FFBD2E', '#28CA41'].map((c, ci) => (
                      <div key={ci} style={{ width: 10, height: 10, borderRadius: '50%', background: c }} />
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 14 }}>
                    {['Projects', 'Clients', 'Invoices'].map(l => (
                      <span key={l} style={{ fontFamily: "'Urbanist', sans-serif", fontSize: 10, color: 'rgba(255,255,255,0.55)' }}>{l}</span>
                    ))}
                  </div>
                </div>
                {/* Mock content */}
                <div style={{ background: previewBg, padding: 16 }}>
                  <div style={{ fontFamily: `'${dispFontName}', 'Urbanist', sans-serif`, fontWeight: 800, fontSize: 15, color: previewText, marginBottom: 4 }}>Active Projects</div>
                  <div style={{ fontFamily: `'${bodyFontName}', 'Urbanist', sans-serif`, fontSize: 11, color: previewTextMuted, marginBottom: 12 }}>3 projects · 2 invoices pending</div>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                    <div style={{ background: accent, color: 'white', borderRadius: 7, padding: '6px 14px', fontFamily: `'${dispFontName}', 'Urbanist', sans-serif`, fontWeight: 700, fontSize: 11, cursor: 'default' }}>+ New Project</div>
                    <div style={{ background: 'transparent', color: previewText, border: '1.5px solid ' + previewCardBorder, borderRadius: 7, padding: '6px 14px', fontFamily: `'${dispFontName}', 'Urbanist', sans-serif`, fontWeight: 600, fontSize: 11, cursor: 'default' }}>View All</div>
                  </div>
                  <div style={{ background: previewCardBg, borderRadius: 8, padding: 10, border: '1px solid ' + previewCardBorder }}>
                    <div style={{ display: 'inline-block', background: badgeBg, color: accent, fontFamily: `'${bodyFontName}', 'Urbanist', sans-serif`, fontSize: 8, fontWeight: 700, letterSpacing: '0.06em', borderRadius: 4, padding: '2px 7px', marginBottom: 5, textTransform: 'uppercase' }}>In Progress</div>
                    <div style={{ fontFamily: `'${bodyFontName}', 'Urbanist', sans-serif`, fontSize: 12, color: previewText, lineHeight: 1.4 }}>
                      Branding redesign for Akaani Foods, due in 12 days
                    </div>
                  </div>
                  <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid ' + previewBorder, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <div style={{ fontFamily: `'${dispFontName}', 'Urbanist', sans-serif`, fontWeight: 700, fontSize: 10, color: previewText, background: previewCardBg, border: '1px solid ' + previewCardBorder, borderRadius: 7, padding: '3px 10px', whiteSpace: 'nowrap' }}>{dispFontName} · Display</div>
                    <div style={{ fontFamily: `'${bodyFontName}', 'Urbanist', sans-serif`, fontSize: 10, color: previewTextMuted, background: previewCardBg, border: '1px solid ' + previewCardBorder, borderRadius: 7, padding: '3px 10px', whiteSpace: 'nowrap' }}>{bodyFontName} · Body</div>
                  </div>
                </div>
              </div>
            )
          })()}
        </div>
      </div>

      {/* ── ROW 2: Tone & Mood + Brand Personality ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>

        {/* Tone & Mood */}
        <div>
          <div style={{ fontFamily: "'Urbanist', sans-serif", fontSize: 10, color: 'var(--color-text-muted)', letterSpacing: '0.08em', marginBottom: 12, textTransform: 'uppercase' }}>Tone & Mood</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
            {(r?.toneWords ?? []).map((w, wi) => (
              <div key={wi} style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 100, padding: '6px 14px', fontFamily: "'Urbanist', sans-serif", fontWeight: 600, fontSize: 13, color: 'var(--color-text)' }}>{w}</div>
            ))}
          </div>
          {colors.length > 1 && (
            <div style={{ height: 5, borderRadius: 3, marginBottom: 8, background: `linear-gradient(90deg, ${colors.map(c => c.hex).join(',')})` }} />
          )}
          {typeof r?.colorDirection === 'string' && r.colorDirection && (
            <div style={{ fontFamily: "'Urbanist', sans-serif", fontSize: 11, color: 'var(--color-text-muted)', lineHeight: 1.6 }}>
              {r.colorDirection.slice(0, 140)}{r.colorDirection.length > 140 ? '…' : ''}
            </div>
          )}
        </div>

        {/* Brand Personality — coloured axis sliders */}
        <div>
          <div style={{ fontFamily: "'Urbanist', sans-serif", fontSize: 10, color: 'var(--color-text-muted)', letterSpacing: '0.08em', marginBottom: 12, textTransform: 'uppercase' }}>Brand Personality</div>
          {(r?.brandAxes ?? []).map((axis, i) => {
            const pct = axis.value ?? 50
            const color = AXIS_COLORS[i % AXIS_COLORS.length]
            return (
              <div key={i} style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontFamily: "'Urbanist', sans-serif", fontSize: 12, fontWeight: 600, color: 'var(--color-text)' }}>{axis.left ?? axis.label}</span>
                  <span style={{ fontFamily: "'Urbanist', sans-serif", fontSize: 12, fontWeight: 500, color: 'var(--color-text-muted)' }}>{axis.right ?? ''}</span>
                </div>
                <div style={{ height: 6, borderRadius: 3, background: 'var(--color-border)', position: 'relative', overflow: 'visible' }}>
                  <div style={{ height: '100%', width: pct + '%', borderRadius: 3, background: color, transition: 'width 0.8s ease' }}/>
                  <div style={{ position: 'absolute', top: '50%', left: pct + '%', transform: 'translate(-50%,-50%)', width: 14, height: 14, borderRadius: '50%', background: color, border: '2.5px solid var(--color-bg)', boxShadow: '0 2px 6px rgba(0,0,0,0.2)' }}/>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

// ─── Section 4: Typography & Moodboard ───────────────────────────────────────

function TypographyMoodboardSection({ r }) {
  return (
    <div style={{ padding: '40px 48px', borderBottom: '1px solid var(--color-border)' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '48px' }}>
        <div>
          <div style={{ fontFamily: "'Urbanist', sans-serif", fontSize: '11px', color: 'var(--color-text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '20px' }}>Typography Direction</div>
          {r.typography && (
            <div style={{ background: 'var(--color-surface)', borderLeft: '3px solid var(--color-border)', padding: '12px 16px', borderRadius: '0 8px 8px 0' }}>
              <p style={{ fontFamily: "'Urbanist', sans-serif", fontSize: '14px', color: 'var(--color-text-soft)', lineHeight: 1.7, margin: 0, fontStyle: 'normal' }}>
                {typeof r.typography === 'object'
                  ? safeTypoStr(r.typography.rationale) || safeTypoStr(r.typography.display)
                  : safeTypoStr(r.typography)}
              </p>
            </div>
          )}
        </div>
        <div>
          <div style={{ fontFamily: "'Urbanist', sans-serif", fontSize: '11px', color: 'var(--color-text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '16px' }}>Moodboard Direction</div>
          {(() => {
            const mColors = extractColors(r)
            const keywords = r?.moodboardKeywords || r?.toneWords || []
            const c0 = mColors[0]?.hex || '#1A1A2E'
            const c1 = mColors[1]?.hex || '#E94560'
            const c2 = mColors[2]?.hex || '#F5F5F5'
            const c3 = mColors[3]?.hex || '#0F3460'

            // helper: is a color dark?
            function isDark(hex) {
              try {
                const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16)
                return (r*299 + g*587 + b*114) / 1000 < 128
              } catch { return true }
            }
            const onC0 = isDark(c0) ? 'rgba(255,255,255,0.92)' : 'rgba(0,0,0,0.82)'
            const onC1 = isDark(c1) ? 'rgba(255,255,255,0.92)' : 'rgba(0,0,0,0.82)'
            const onC3 = isDark(c3) ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.75)'

            return (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gridTemplateRows: '170px 115px 105px', gap: 10 }}>

                {/* Tile 1 — Hero gradient (col 1-2, row 1) */}
                <div style={{ gridColumn: '1 / 3', gridRow: '1', borderRadius: 14, overflow: 'hidden', background: `linear-gradient(135deg, ${c0} 0%, ${c3} 55%, ${c1} 100%)`, position: 'relative', display: 'flex', alignItems: 'flex-end', padding: '20px 22px' }}>
                  {/* noise texture overlay */}
                  <div style={{ position: 'absolute', inset: 0, backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 200 200\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'n\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.75\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23n)\' opacity=\'0.04\'/%3E%3C/svg%3E")', backgroundSize: 'cover', opacity: 0.4 }}/>
                  {/* grid lines */}
                  <div style={{ position: 'absolute', inset: 0, backgroundImage: 'repeating-linear-gradient(0deg,rgba(255,255,255,0.04) 0,rgba(255,255,255,0.04) 1px,transparent 1px,transparent 32px),repeating-linear-gradient(90deg,rgba(255,255,255,0.04) 0,rgba(255,255,255,0.04) 1px,transparent 1px,transparent 32px)' }}/>
                  {/* floating accent circle */}
                  <div style={{ position: 'absolute', top: 24, right: 28, width: 52, height: 52, borderRadius: '50%', background: c1, opacity: 0.35, filter: 'blur(16px)' }}/>
                  <div style={{ position: 'absolute', top: 18, right: 22, width: 18, height: 18, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.5)' }}/>
                  {keywords[0] && (
                    <div style={{ position: 'relative', zIndex: 1 }}>
                      <div style={{ fontFamily: "'Urbanist', sans-serif", fontSize: 9, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 6 }}>mood · direction</div>
                      <div style={{ fontFamily: "'Urbanist',sans-serif", fontWeight: 800, fontSize: 22, color: 'rgba(255,255,255,0.95)', letterSpacing: '-0.02em', lineHeight: 1.1 }}>
                        {keywords.slice(0, 2).join(' & ')}
                      </div>
                    </div>
                  )}
                </div>

                {/* Tile 2 — Primary color swatch (col 3, row 1) */}
                <div style={{ gridColumn: '3', gridRow: '1', borderRadius: 14, overflow: 'hidden', background: c0, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '16px 14px', position: 'relative' }}>
                  <div style={{ position: 'absolute', bottom: -20, right: -20, width: 90, height: 90, borderRadius: '50%', background: c1, opacity: 0.2, filter: 'blur(20px)' }}/>
                  <div>
                    <div style={{ width: 28, height: 28, borderRadius: '50%', background: c1, marginBottom: 10, border: '2px solid rgba(255,255,255,0.2)' }}/>
                    <div style={{ fontFamily: "'Urbanist',sans-serif", fontWeight: 700, fontSize: 12, color: onC0, marginBottom: 3 }}>
                      {mColors[0]?.name || 'Primary'}
                    </div>
                    <div style={{ fontFamily: "'Urbanist', sans-serif", fontSize: 10, color: isDark(c0) ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.4)', letterSpacing: '0.04em' }}>
                      {c0.toUpperCase()}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 5 }}>
                    {[c0,c1,c2,c3].map((cc,ci) => (
                      <div key={ci} style={{ flex: 1, height: 5, borderRadius: 3, background: cc, border: '1px solid rgba(255,255,255,0.15)' }}/>
                    ))}
                  </div>
                </div>

                {/* Tile 3 — Concentric rings / geometry (col 1, row 2) */}
                <div style={{ gridColumn: '1', gridRow: '2', borderRadius: 14, overflow: 'hidden', background: c3, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                  <svg width="90" height="90" viewBox="0 0 90 90">
                    {[40, 30, 20, 11].map((rv, ri) => (
                      <circle key={ri} cx="45" cy="45" r={rv} fill="none" stroke={c1} strokeWidth={ri === 3 ? 0 : 1} opacity={0.15 + ri * 0.18} />
                    ))}
                    <circle cx="45" cy="45" r="5" fill={c1} opacity="0.9"/>
                    <line x1="5" y1="45" x2="85" y2="45" stroke={c1} strokeWidth="0.5" opacity="0.2" strokeDasharray="3 4"/>
                    <line x1="45" y1="5" x2="45" y2="85" stroke={c1} strokeWidth="0.5" opacity="0.2" strokeDasharray="3 4"/>
                  </svg>
                </div>

                {/* Tile 4 — Typography preview (col 2, row 2) */}
                <div style={{ gridColumn: '2', gridRow: '2', borderRadius: 14, overflow: 'hidden', background: 'var(--color-card)', border: '1px solid var(--color-border)', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center', padding: '14px 16px', gap: 4 }}>
                  <div style={{ fontFamily: "'Urbanist', sans-serif", fontSize: 8, color: 'var(--color-text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>typography</div>
                  <div style={{ fontFamily: "'Urbanist',sans-serif", fontWeight: 800, fontSize: 32, color: c0, lineHeight: 1, letterSpacing: '-0.03em' }}>Aa</div>
                  <div style={{ fontFamily: "'Urbanist', sans-serif", fontSize: 8, color: 'var(--color-text-muted)' }}>Display · Body</div>
                </div>

                {/* Tile 5 — Keywords (col 3, rows 2-3) */}
                <div style={{ gridColumn: '3', gridRow: '2 / 4', borderRadius: 14, overflow: 'hidden', background: c1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '16px 14px', gap: 7, position: 'relative' }}>
                  <div style={{ position: 'absolute', top: -10, left: -10, width: 60, height: 60, borderRadius: '50%', background: 'rgba(255,255,255,0.08)', filter: 'blur(10px)' }}/>
                  <div style={{ fontFamily: "'Urbanist', sans-serif", fontSize: 8, color: isDark(c1) ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.4)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>keywords</div>
                  {keywords.slice(0, 5).map((kw, ki) => (
                    <div key={ki} style={{ fontFamily: "'Urbanist',sans-serif", fontWeight: ki === 0 ? 700 : 500, fontSize: ki === 0 ? 13 : 11, color: isDark(c1) ? `rgba(255,255,255,${0.95 - ki * 0.12})` : `rgba(0,0,0,${0.85 - ki * 0.1})`, lineHeight: 1.2 }}>
                      {ki === 0 ? '→ ' : '· '}{kw}
                    </div>
                  ))}
                </div>

                {/* Tile 6 — Color palette strip (col 1-2, row 3) */}
                <div style={{ gridColumn: '1 / 3', gridRow: '3', borderRadius: 14, overflow: 'hidden', background: 'var(--color-card)', border: '1px solid var(--color-border)', display: 'flex', alignItems: 'stretch' }}>
                  {mColors.map((color, ci) => (
                    <div key={ci} style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', padding: '0 0 10px 10px', background: color.hex, position: 'relative' }}>
                      {ci === 0 && <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, transparent 40%, rgba(0,0,0,0.35))' }}/>}
                      <div style={{ position: 'relative', zIndex: 1 }}>
                        <div style={{ fontFamily: "'Urbanist', sans-serif", fontSize: 8, fontWeight: 700, color: isDark(color.hex) ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.7)', letterSpacing: '0.04em' }}>
                          {color.hex.toUpperCase()}
                        </div>
                        <div style={{ fontFamily: "'Urbanist',sans-serif", fontSize: 9, fontWeight: 600, color: isDark(color.hex) ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.5)', marginTop: 1 }}>
                          {(color.name || '').split(' ').slice(0, 2).join(' ')}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

              </div>
            )
          })()}
        </div>
      </div>
    </div>
  )
}

// ─── Section 4b: Typography Showcase ─────────────────────────────────────────

function TypographySection({ typography, discipline }) {
  if (!typography || typeof typography !== 'object') return null

  const displayFont = safeTypoStr(typography.displayFont || typography.display).split('—')[0].trim() || 'Urbanist'
  const bodyFont    = safeTypoStr(typography.bodyFont || typography.body).split('—')[0].trim() || 'Urbanist'

  const displayUse = safeTypoStr(typography.displayUse) || (
    safeTypoStr(typography.display).includes('—')
      ? safeTypoStr(typography.display).split('—').slice(1).join('—').trim()
      : 'Headings, hero text, brand name'
  )
  const bodyUse = safeTypoStr(typography.bodyUse) || (
    safeTypoStr(typography.body).includes('—')
      ? safeTypoStr(typography.body).split('—').slice(1).join('—').trim()
      : 'Body copy, UI labels, navigation'
  )

  const rationale = safeTypoStr(typography.rationale)

  const platform = typography.platform || 'web'
  const hasWeb    = platform === 'web'    || platform === 'both'
  const hasMobile = platform === 'mobile' || platform === 'both'

  function normaliseScaleArray(arr) {
    if (!Array.isArray(arr)) return []
    return arr.map(s => ({
      label:      safeTypoStr(s.label || s.name || ''),
      size:       safeTypoStr(s.size || s.fontSize || '16px'),
      weight:     safeTypoStr(s.weight || s.fontWeight || '400'),
      lineHeight: safeTypoStr(s.lineHeight || s.line_height || '—'),
      spacing:    safeTypoStr(s.letterSpacing || s.letter_spacing || s.spacing || '0'),
    })).filter(s => s.label)
  }

  let webScale    = []
  let mobileScale = []

  if (typography.scale) {
    if (Array.isArray(typography.scale)) {
      // Old flat array format — assign to active platform
      if (platform === 'mobile') {
        mobileScale = normaliseScaleArray(typography.scale)
      } else {
        webScale = normaliseScaleArray(typography.scale)
      }
    } else if (typeof typography.scale === 'object') {
      // New nested format
      if (typography.scale.web)    webScale    = normaliseScaleArray(typography.scale.web)
      if (typography.scale.mobile) mobileScale = normaliseScaleArray(typography.scale.mobile)
      // Fallback: old flat object format (label → "size/weight")
      if (!webScale.length && !mobileScale.length) {
        const vals = Object.values(typography.scale)
        if (vals.length && typeof vals[0] === 'string') {
          webScale = Object.entries(typography.scale).map(([label, val]) => ({
            label,
            size:       safeTypoStr(val).split('/')[0]?.trim() || safeTypoStr(val),
            weight:     safeTypoStr(val).split('/')[1]?.trim() || '400',
            lineHeight: '—',
            spacing:    '0',
          }))
        }
      }
    }
  }

  const defaultScale = [
    { label: 'H1',    size: '48px', weight: '800', lineHeight: '52px', spacing: '-0.02em' },
    { label: 'H2',    size: '32px', weight: '700', lineHeight: '38px', spacing: '-0.01em' },
    { label: 'Body',  size: '16px', weight: '400', lineHeight: '26px', spacing: '0' },
    { label: 'Small', size: '13px', weight: '400', lineHeight: '20px', spacing: '0.01em' },
  ]
  if (!webScale.length && !mobileScale.length) webScale = defaultScale

  const [scaleView, setScaleView] = useState(hasWeb ? 'web' : 'mobile')
  const activeScale = scaleView === 'web' ? webScale : mobileScale

  // Granular product types detected on the brief. Falls back to the
  // coarse typography.platform / discipline.platform if the AI didn't
  // emit the platforms array (older saved briefs).
  const detectedPlatforms = (() => {
    if (Array.isArray(discipline?.platforms) && discipline.platforms.length) {
      return discipline.platforms
    }
    if (platform === 'mobile') return ['mobile']
    if (platform === 'both')   return ['website', 'mobile']
    return ['website']
  })()
  const platformChipMeta = {
    website: { icon: '🖥', label: 'Website' },
    webapp:  { icon: '🛠', label: 'Webapp' },
    mobile:  { icon: '📱', label: 'Mobile' },
  }

  return (
    <section style={{ padding: '40px 48px', borderBottom: '1px solid var(--color-border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 28, flexWrap: 'wrap' }}>
        <div style={{ fontFamily: "'Urbanist', sans-serif", fontSize: 11, color: 'var(--color-text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Typography</div>
        {detectedPlatforms.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontFamily: "'Urbanist', sans-serif", fontSize: 10, color: 'var(--color-text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              Sized for
            </span>
            {detectedPlatforms.map(p => {
              const meta = platformChipMeta[p] || { icon: '•', label: p }
              return (
                <div key={p} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 100, background: 'var(--color-surface)', border: '1px solid var(--color-border)', fontFamily: "'Urbanist', sans-serif", fontSize: 10, color: 'var(--color-text-soft)' }}>
                  <span aria-hidden>{meta.icon}</span>
                  <span>{meta.label}</span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        {/* Left: Font preview cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Display font card */}
          <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 14, padding: '20px 22px', overflow: 'hidden' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
              <div>
                <div style={{ fontFamily: "'Urbanist', sans-serif", fontSize: 9, color: 'var(--color-text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>Display Font</div>
                <div style={{ fontFamily: `"${displayFont}",Urbanist,sans-serif`, fontWeight: 700, fontSize: 16, color: 'var(--color-text)', letterSpacing: '-0.01em' }}>{displayFont}</div>
              </div>
              <div style={{ background: 'var(--color-card)', border: '1px solid var(--color-border)', borderRadius: 6, padding: '3px 8px', fontFamily: "'Urbanist', sans-serif", fontSize: 9, color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>Headings</div>
            </div>
            <div style={{ fontFamily: `"${displayFont}",Urbanist,sans-serif`, fontWeight: 800, fontSize: 30, color: 'var(--color-text)', lineHeight: 1.1, letterSpacing: '-0.02em', marginBottom: 12, fontStyle: 'normal' }}>
              The quick brown fox
            </div>
            {displayUse && (
              <div style={{ fontFamily: "'Urbanist', sans-serif", fontSize: 10, color: 'var(--color-text-muted)', marginBottom: 12 }}>{displayUse}</div>
            )}
            <div style={{ display: 'flex', gap: 12, paddingTop: 12, borderTop: '1px solid var(--color-border)' }}>
              {[{ w: 300, l: 'Light' }, { w: 400, l: 'Regular' }, { w: 600, l: 'Semi' }, { w: 800, l: 'Bold' }].map(({ w, l }) => (
                <div key={w} style={{ flex: 1, textAlign: 'center' }}>
                  <div style={{ fontFamily: `"${displayFont}",Urbanist,sans-serif`, fontWeight: w, fontSize: 20, color: 'var(--color-text)', lineHeight: 1, marginBottom: 4, fontStyle: 'normal' }}>Aa</div>
                  <div style={{ fontFamily: "'Urbanist', sans-serif", fontSize: 9, color: 'var(--color-text-muted)' }}>{l}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Body font card */}
          <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 14, padding: '20px 22px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
              <div>
                <div style={{ fontFamily: "'Urbanist', sans-serif", fontSize: 9, color: 'var(--color-text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>Body Font</div>
                <div style={{ fontFamily: `"${bodyFont}",Urbanist,sans-serif`, fontWeight: 700, fontSize: 16, color: 'var(--color-text)' }}>{bodyFont}</div>
              </div>
              <div style={{ background: 'var(--color-card)', border: '1px solid var(--color-border)', borderRadius: 6, padding: '3px 8px', fontFamily: "'Urbanist', sans-serif", fontSize: 9, color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>Body copy</div>
            </div>
            <div style={{ fontFamily: `"${bodyFont}",Urbanist,sans-serif`, fontWeight: 400, fontSize: 14, color: 'var(--color-text-soft)', lineHeight: 1.75, marginBottom: 10, fontStyle: 'normal' }}>
              Body text designed for comfortable reading at length. Clear hierarchy and generous spacing make content easy to scan across all screen sizes.
            </div>
            {bodyUse && (
              <div style={{ fontFamily: "'Urbanist', sans-serif", fontSize: 10, color: 'var(--color-text-muted)', marginBottom: rationale ? 10 : 0 }}>{bodyUse}</div>
            )}
            {rationale && (
              <div style={{ paddingTop: 10, borderTop: '1px solid var(--color-border)', fontFamily: "'Urbanist', sans-serif", fontSize: 11, color: 'var(--color-text-muted)', lineHeight: 1.65, fontStyle: 'normal' }}>
                {rationale}
              </div>
            )}
          </div>
        </div>

        {/* Right: Type scale table */}
        <div className="brief-result-scale-block" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 14, padding: '20px 22px', height: 'fit-content' }}>
          <div style={{ fontFamily: "'Urbanist', sans-serif", fontSize: 9, color: 'var(--color-text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 14 }}>Type Scale</div>

          {/* Platform tabs — show only when both exist */}
          {hasWeb && hasMobile && (
            <div style={{ display: 'flex', gap: 4, marginBottom: 14 }}>
              {[{ id: 'web', label: '🖥 Web' }, { id: 'mobile', label: '📱 Mobile' }].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setScaleView(tab.id)}
                  style={{
                    background: scaleView === tab.id ? 'var(--color-card)' : 'transparent',
                    border: scaleView === tab.id ? '1px solid var(--color-border)' : '1px solid transparent',
                    borderRadius: 7,
                    padding: '4px 10px',
                    fontFamily: "'Urbanist', sans-serif",
                    fontSize: 10,
                    color: scaleView === tab.id ? 'var(--color-text)' : 'var(--color-text-muted)',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                >{tab.label}</button>
              ))}
            </div>
          )}

          {/* Single platform badge */}
          {hasMobile && !hasWeb && (
            <div style={{ fontFamily: "'Urbanist', sans-serif", fontSize: 9, color: 'var(--color-text-muted)', marginBottom: 10, background: 'var(--color-card)', border: '1px solid var(--color-border)', borderRadius: 5, padding: '3px 8px', display: 'inline-block' }}>📱 Mobile</div>
          )}
          {hasWeb && !hasMobile && (
            <div style={{ fontFamily: "'Urbanist', sans-serif", fontSize: 9, color: 'var(--color-text-muted)', marginBottom: 10, background: 'var(--color-card)', border: '1px solid var(--color-border)', borderRadius: 5, padding: '3px 8px', display: 'inline-block' }}>🖥 Web</div>
          )}

          {/* Header row */}
          <div style={{ display: 'grid', gridTemplateColumns: '44px 1fr 48px 52px 52px 60px', gap: 8, paddingBottom: 8, marginBottom: 4, borderBottom: '2px solid var(--color-border)' }}>
            {['Style', 'Preview', 'Size', 'Weight', 'Line H', 'Spacing'].map(h => (
              <div key={h} style={{ fontFamily: "'Urbanist', sans-serif", fontSize: 9, color: 'var(--color-text-muted)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>{h}</div>
            ))}
          </div>

          {/* Scale rows */}
          {activeScale.map((row, ri) => {
            const sizeNum   = parseInt(row.size) || 16
            const weightNum = parseInt(row.weight) || 400
            const fontToUse = sizeNum >= 24 ? displayFont : bodyFont
            const previewSize = Math.min(sizeNum * 0.55, 28)
            return (
              <div key={ri} style={{ display: 'grid', gridTemplateColumns: '44px 1fr 48px 52px 52px 60px', gap: 8, padding: '10px 0', borderBottom: ri < activeScale.length - 1 ? '1px solid var(--color-border)' : 'none', alignItems: 'center' }}>
                <div style={{ fontFamily: "'Urbanist', sans-serif", fontSize: 9, fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>{row.label}</div>
                <div style={{ fontFamily: `"${fontToUse}",Urbanist,sans-serif`, fontWeight: weightNum, fontSize: previewSize, color: 'var(--color-text)', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontStyle: 'normal' }}>
                  {row.label === 'Label' ? 'LABEL' : row.label === 'Small' ? 'Caption' : row.label === 'Body' ? 'Body copy' : 'Heading'}
                </div>
                <div style={{ fontFamily: "'Urbanist', sans-serif", fontSize: 10, color: 'var(--color-text-soft)' }}>{row.size}</div>
                <div style={{ fontFamily: "'Urbanist', sans-serif", fontSize: 10, color: 'var(--color-text-soft)' }}>{row.weight}</div>
                <div style={{ fontFamily: "'Urbanist', sans-serif", fontSize: 10, color: 'var(--color-text-soft)' }}>{row.lineHeight}</div>
                <div style={{ fontFamily: "'Urbanist', sans-serif", fontSize: 10, color: 'var(--color-text-soft)' }}>{row.spacing}</div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

// ─── Section 5: Gantt Roadmap ─────────────────────────────────────────────────

function GanttSection({ phases, timeframe, projectTitle }) {
  const [ganttTask, setGanttTask] = useState(null)
  const [loadingSubtasks, setLoadingSubtasks] = useState(false)
  const [generatedSubtasks, setGeneratedSubtasks] = useState({})

  useEffect(() => {
    if (!ganttTask) return
    const task = ganttTask.task
    const taskKey = task.name || task.title || 'task'
    const existingSubtasks = task.subtasks || []
    const alreadyGenerated = generatedSubtasks[taskKey]?.length > 0
    if (existingSubtasks.length > 0 || alreadyGenerated) return

    async function gen() {
      setLoadingSubtasks(true)
      const subs = await generateSubtasks(
        task.name || task.title || 'Task',
        ganttTask.phaseName || 'Project',
        projectTitle || 'Project'
      )
      setGeneratedSubtasks(prev => ({ ...prev, [taskKey]: subs }))
      setLoadingSubtasks(false)
    }
    gen()
  }, [ganttTask?.task?.name])

  const totalDays = phases.reduce((s, p) => s + p.totalDays, 0)
  const totalWeeks = Math.max(Math.ceil(totalDays / 7), 1)
  const weeks = Array.from({ length: totalWeeks }, (_, i) => i + 1)

  let cumDays = 0
  const phasesWithPos = phases.map(p => {
    const start = cumDays
    cumDays += p.totalDays
    return { ...p, startPct: (start / totalDays) * 100, widthPct: (p.totalDays / totalDays) * 100 }
  })

  return (
    <div style={{ padding: '40px 48px', borderBottom: '1px solid var(--color-border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
        <CalendarDaysIcon style={{ width: '18px', height: '18px', color: 'var(--color-text-muted)' }} />
        <span style={{ fontFamily: "'Urbanist', sans-serif", fontWeight: 700, fontSize: '20px', color: 'var(--color-text)' }}>Product Roadmap</span>
      </div>
      <p style={{ fontFamily: "'Urbanist', sans-serif", fontSize: '12px', color: 'var(--color-text-muted)', marginBottom: '32px' }}>
        {timeframe?.total || `${totalWeeks} weeks`} total · click any task for details
      </p>

      {/* Week header */}
      <div style={{ display: 'flex', marginBottom: '8px', marginLeft: '180px' }}>
        {weeks.map(w => {
          const showLabel = totalWeeks <= 10 || w % 2 === 0
          return (
            <div key={w} style={{ width: `${100 / totalWeeks}%`, flexShrink: 0, textAlign: 'center', fontFamily: "'Urbanist', sans-serif", fontSize: '10px', color: showLabel ? 'var(--color-text-muted)' : 'transparent', borderRight: '1px solid var(--color-border)', paddingBottom: '4px' }}>
              Wk{w}
            </div>
          )
        })}
      </div>

      {/* Phase rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {phasesWithPos.map((phase, pi) => (
          <div key={pi}>
            {/* Phase label row */}
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '3px' }}>
              <div style={{ width: '180px', flexShrink: 0, paddingRight: '16px' }}>
                <div style={{ fontFamily: "'Urbanist', sans-serif", fontWeight: 600, fontSize: '13px', color: 'var(--color-text)' }}>{phase.name}</div>
                <div style={{ fontFamily: "'Urbanist', sans-serif", fontSize: '10px', color: 'var(--color-text-muted)' }}>{phase.tasks.length} tasks · {phase.totalDays}d</div>
              </div>
              <div style={{ flex: 1, position: 'relative', height: '36px' }}>
                <div style={{ position: 'absolute', left: `${phase.startPct}%`, width: `${phase.widthPct}%`, height: '36px', background: phase.color, borderRadius: '6px', display: 'flex', alignItems: 'center', paddingLeft: '12px', overflow: 'hidden' }}>
                  <span style={{ fontFamily: "'Urbanist', sans-serif", fontWeight: 600, fontSize: '12px', color: '#000', opacity: 0.75, whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                    {phase.name}
                  </span>
                </div>
              </div>
            </div>
            {/* Task rows */}
            {phase.tasks.map((task, ti) => {
              const taskStartDays = phase.tasks.slice(0, ti).reduce((s, t) => s + t.days, 0)
              const taskStartPct = phase.startPct + (taskStartDays / totalDays) * 100
              const taskWidthPct = (task.days / totalDays) * 100
              return (
                <div key={ti} style={{ display: 'flex', alignItems: 'center', marginBottom: '2px' }}>
                  <div
                    onClick={() => setGanttTask({ task, phaseColor: phase.color, phaseName: phase.name })}
                    onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-text)')}
                    onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-text-muted)')}
                    style={{ width: '180px', flexShrink: 0, paddingRight: '16px', paddingLeft: '12px', cursor: 'pointer' }}
                  >
                    <div style={{ fontFamily: "'Urbanist', sans-serif", fontSize: '11px', color: 'inherit', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.name}</div>
                  </div>
                  <div style={{ flex: 1, position: 'relative', height: '24px' }}>
                    <div
                      onClick={() => setGanttTask({ task, phaseColor: phase.color, phaseName: phase.name })}
                      onMouseEnter={e => (e.currentTarget.style.filter = 'brightness(1.15)')}
                      onMouseLeave={e => (e.currentTarget.style.filter = 'brightness(1)')}
                      style={{ position: 'absolute', left: `${taskStartPct}%`, width: `${Math.max(taskWidthPct, 2)}%`, height: '24px', background: phase.color, borderRadius: '4px', opacity: 0.65, display: 'flex', alignItems: 'center', paddingLeft: '8px', overflow: 'hidden', cursor: 'pointer', transition: 'filter 0.15s' }}
                    >
                      <span style={{ fontFamily: "'Urbanist', sans-serif", fontSize: '10px', color: '#000', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                        {task.name}
                      </span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        ))}
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginTop: '20px' }}>
        {phases.map((p, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: p.color, flexShrink: 0 }} />
            <span style={{ fontFamily: "'Urbanist', sans-serif", fontSize: '11px', color: 'var(--color-text-muted)' }}>{p.name}</span>
          </div>
        ))}
      </div>

      {/* Task detail modal */}
      {ganttTask && (
        <div
          onClick={() => setGanttTask(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(3px)' }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: 'var(--color-card)', border: '1px solid var(--color-border)', borderTop: `3px solid ${ganttTask.phaseColor}`, borderRadius: 18, width: 480, maxWidth: '92vw', maxHeight: '80vh', overflow: 'auto', boxShadow: 'var(--shadow-modal)', animation: 'fadeUp 0.2s ease' }}
          >
            <div style={{ padding: '18px 20px 14px', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontFamily: "'Urbanist', sans-serif", fontSize: 10, color: ganttTask.phaseColor, letterSpacing: '0.08em', marginBottom: 6, textTransform: 'uppercase' }}>
                  {ganttTask.phaseName}
                </div>
                <div style={{ fontFamily: "'Urbanist', sans-serif", fontWeight: 800, fontSize: 18, color: 'var(--color-text)', letterSpacing: '-0.02em', lineHeight: 1.2 }}>
                  {ganttTask.task.name}
                </div>
                {ganttTask.task.description && (
                  <p style={{ fontFamily: "'Urbanist', sans-serif", fontSize: 13, color: 'var(--color-text-soft)', lineHeight: 1.5, margin: '6px 0 0' }}>
                    {ganttTask.task.description}
                  </p>
                )}
              </div>
              <button
                onClick={() => setGanttTask(null)}
                style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8, width: 30, height: 30, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-soft)', fontSize: 16, flexShrink: 0 }}
              >×</button>
            </div>
            <div style={{ padding: '18px 20px' }}>
              <div style={{ display: 'flex', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
                <div style={{ background: ganttTask.phaseColor + '15', border: '1px solid ' + ganttTask.phaseColor + '30', borderRadius: 8, padding: '8px 14px' }}>
                  <div style={{ fontFamily: "'Urbanist', sans-serif", fontSize: 10, color: 'var(--color-text-muted)', marginBottom: 3, letterSpacing: '0.06em' }}>DURATION</div>
                  <div style={{ fontFamily: "'Urbanist', sans-serif", fontWeight: 700, fontSize: 16, color: ganttTask.phaseColor }}>
                    {ganttTask.task.days === 1 ? '1 day' : ganttTask.task.days + ' days'}
                  </div>
                </div>
                {(() => {
                  const taskKey = ganttTask.task.name || ganttTask.task.title || 'task'
                  const activeSubtasks = ganttTask.task.subtasks?.length > 0
                    ? ganttTask.task.subtasks
                    : generatedSubtasks[taskKey] || []
                  return activeSubtasks.length > 0 ? (
                    <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8, padding: '8px 14px' }}>
                      <div style={{ fontFamily: "'Urbanist', sans-serif", fontSize: 10, color: 'var(--color-text-muted)', marginBottom: 3, letterSpacing: '0.06em' }}>SUBTASKS</div>
                      <div style={{ fontFamily: "'Urbanist', sans-serif", fontWeight: 700, fontSize: 16, color: 'var(--color-text)' }}>{activeSubtasks.length}</div>
                    </div>
                  ) : null
                })()}
              </div>
              {(() => {
                const taskKey = ganttTask.task.name || ganttTask.task.title || 'task'
                const activeSubtasks = ganttTask.task.subtasks?.length > 0
                  ? ganttTask.task.subtasks
                  : generatedSubtasks[taskKey] || []
                return loadingSubtasks ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '20px 0', fontFamily: "'Urbanist', sans-serif", fontSize: 12, color: 'var(--color-text-muted)' }}>
                    <div style={{ width: 14, height: 14, border: '2px solid var(--color-border)', borderTopColor: 'var(--color-text)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                    Generating subtasks...
                  </div>
                ) : (
                  <div>
                    <div style={{ fontFamily: "'Urbanist', sans-serif", fontSize: 10, color: 'var(--color-text-muted)', letterSpacing: '0.08em', marginBottom: 10, textTransform: 'uppercase' }}>Subtasks</div>
                    {activeSubtasks.map((sub, si) => {
                      const subText = typeof sub === 'string' ? sub : sub.description || sub.title || sub.name || sub.task || JSON.stringify(sub)
                      return (
                        <div key={si} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '10px 0', borderBottom: si < activeSubtasks.length - 1 ? '1px solid var(--color-border)' : 'none' }}>
                          <div style={{ width: 22, height: 22, borderRadius: '50%', background: ganttTask.phaseColor + '18', border: '1px solid ' + ganttTask.phaseColor + '40', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Urbanist', sans-serif", fontSize: 10, fontWeight: 700, color: ganttTask.phaseColor, flexShrink: 0 }}>
                            {si + 1}
                          </div>
                          <div style={{ flex: 1, fontFamily: "'Urbanist',sans-serif", fontSize: 13, color: 'var(--color-text)', lineHeight: 1.65 }}>
                            {subText}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Section 6: Budget ────────────────────────────────────────────────────────

function BudgetSection({ budgetRange: br }) {
  const [hoveredBudget, setHoveredBudget] = useState(null)
  const breakdown = br.breakdown ? Object.entries(br.breakdown) : []

  const SIZE = 200, RADIUS = 80, INNER = 50
  const CX = SIZE / 2, CY = SIZE / 2

  function polarToCart(angle, r) {
    return { x: CX + r * Math.cos(angle - Math.PI / 2), y: CY + r * Math.sin(angle - Math.PI / 2) }
  }

  function parseCost(cost) {
    if (!cost) return 0
    if (typeof cost === 'number') return cost
    if (typeof cost === 'object') {
      if (cost.amount) return Number(cost.amount) || 0
      if (cost.min && cost.max) return (Number(cost.min) + Number(cost.max)) / 2
      if (cost.low && cost.high) return (Number(cost.low) + Number(cost.high)) / 2
      const vals = Object.values(cost).map(Number).filter(Boolean)
      if (vals.length) return vals.reduce((a, b) => a + b) / vals.length
      return 0
    }
    const cleaned = String(cost).replace(/[$,\s]/g, '')
    const nums = cleaned.split(/[-–to]+/).map(Number).filter(n => n > 0)
    if (nums.length === 2) return (nums[0] + nums[1]) / 2
    if (nums.length === 1) return nums[0]
    const anyNum = String(cost).replace(/[^0-9]/g, ' ').trim().split(/\s+/).map(Number).filter(Boolean)
    return anyNum.length ? anyNum.reduce((a, b) => a + b) / anyNum.length : 0
  }

  function formatCostDisplay(cost) {
    if (!cost) return ''
    if (typeof cost === 'number') return '$' + cost.toLocaleString()
    if (typeof cost === 'string') {
      if (cost.includes('$')) return cost
      const nums = cost.replace(/[^0-9\-–]/g, '').split(/[-–]/).map(Number).filter(Boolean)
      if (nums.length === 2) return '$' + nums[0].toLocaleString() + '–$' + nums[1].toLocaleString()
      if (nums.length === 1) return '$' + nums[0].toLocaleString()
    }
    return String(cost)
  }

  const items = breakdown.map(([role, cost], i) => {
    const amount = parseCost(cost)
    return { role, originalCost: cost, amount, color: ROLE_META[role]?.color ?? BUDGET_COLORS[i % BUDGET_COLORS.length] }
  })
  const total = items.reduce((s, item) => s + item.amount, 0)

  let startAngle = 0
  const segments = total > 0 ? items.map((item, i) => {
    const angle = (item.amount / total) * 2 * Math.PI
    const endAngle = startAngle + angle
    const start = polarToCart(startAngle, RADIUS), end = polarToCart(endAngle, RADIUS)
    const iStart = polarToCart(startAngle, INNER), iEnd = polarToCart(endAngle, INNER)
    const largeArc = angle > Math.PI ? 1 : 0
    const d = [`M ${start.x} ${start.y}`, `A ${RADIUS} ${RADIUS} 0 ${largeArc} 1 ${end.x} ${end.y}`, `L ${iEnd.x} ${iEnd.y}`, `A ${INNER} ${INNER} 0 ${largeArc} 0 ${iStart.x} ${iStart.y}`, 'Z'].join(' ')
    const seg = { d, item, i, isHovered: hoveredBudget === i }
    startAngle = endAngle
    return seg
  }) : []

  return (
    <div style={{ padding: '40px 48px', borderBottom: '1px solid var(--color-border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
        <CurrencyDollarIcon style={{ width: '18px', height: '18px', color: 'var(--color-text-muted)' }} />
        <span style={{ fontFamily: "'Urbanist', sans-serif", fontWeight: 700, fontSize: '20px', color: 'var(--color-text)' }}>Budget Estimate</span>
      </div>
      <div style={{ fontFamily: "'Urbanist', sans-serif", fontWeight: 800, fontSize: '32px', letterSpacing: '-0.02em', color: 'var(--color-text)', marginBottom: '6px' }}>
        {br.low} – {br.high}
      </div>

      {breakdown.length > 0 && total > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 24, alignItems: 'center', marginTop: 16 }}>
          {/* Donut chart */}
          <div style={{ position: 'relative' }}>
            <svg width={SIZE} height={SIZE}>
              {segments.map(seg => (
                <path key={seg.i} d={seg.d} fill={seg.item.color}
                  opacity={hoveredBudget === null ? 0.85 : hoveredBudget === seg.i ? 1 : 0.4}
                  style={{ cursor: 'pointer', transition: 'opacity 0.2s, transform 0.2s', transformOrigin: `${CX}px ${CY}px`, transform: seg.isHovered ? 'scale(1.05)' : 'scale(1)' }}
                  onMouseEnter={() => setHoveredBudget(seg.i)}
                  onMouseLeave={() => setHoveredBudget(null)}
                />
              ))}
              {/* Centre text */}
              <text x={CX} y={CY - 10} textAnchor="middle" fontFamily="'Urbanist',sans-serif" fontWeight="800" fontSize="15" fill="var(--color-text)">
                {hoveredBudget !== null
                  ? '$' + Math.round(items[hoveredBudget]?.amount || 0).toLocaleString()
                  : total > 999 ? '$' + (total / 1000).toFixed(0) + 'k' : '$' + Math.round(total).toLocaleString()}
              </text>
              <text x={CX} y={CY + 8} textAnchor="middle" fontFamily="'Urbanist', sans-serif" fontSize="9" fill="var(--color-text-muted)">
                {hoveredBudget !== null
                  ? (items[hoveredBudget]?.role || '').split(' ').slice(0, 2).join(' ')
                  : 'total budget'}
              </text>
            </svg>
          </div>
          {/* Legend */}
          <div>
            {items.map((item, i) => {
              const pct = total > 0 ? Math.round(item.amount / total * 100) : 0
              const isHovered = hoveredBudget === i
              return (
                <div key={i} onMouseEnter={() => setHoveredBudget(i)} onMouseLeave={() => setHoveredBudget(null)}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', borderRadius: 8, cursor: 'pointer', marginBottom: 3, background: isHovered ? 'var(--color-surface)' : 'transparent', transition: 'background 0.15s', opacity: hoveredBudget === null ? 1 : isHovered ? 1 : 0.5 }}
                >
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: item.color, flexShrink: 0 }} />
                  <span style={{ fontFamily: "'Urbanist', sans-serif", fontSize: 13, color: 'var(--color-text)', flex: 1, fontWeight: isHovered ? 600 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 150 }}>{item.role}</span>
                  <span style={{ fontFamily: "'Urbanist', sans-serif", fontSize: 11, color: item.color, fontWeight: 700, flexShrink: 0 }}>{pct}%</span>
                  <span style={{ fontFamily: "'Urbanist', sans-serif", fontSize: 10, color: 'var(--color-text-muted)', flexShrink: 0, marginLeft: 4 }}>{formatCostDisplay(item.originalCost)}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Section 7: Roles ─────────────────────────────────────────────────────────

function RolesSection({ rolesNeeded }) {
  return (
    <div style={{ padding: '40px 48px', borderBottom: '1px solid var(--color-border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
        <UsersIcon style={{ width: '18px', height: '18px', color: 'var(--color-text-muted)' }} />
        <span style={{ fontFamily: "'Urbanist', sans-serif", fontWeight: 700, fontSize: '20px', color: 'var(--color-text)' }}>Roles Needed</span>
      </div>
      <p style={{ fontFamily: "'Urbanist', sans-serif", fontSize: '12px', color: 'var(--color-text-muted)', marginBottom: '24px' }}>All roles below are required for this project</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
        {rolesNeeded.map((role, i) => {
          const RoleIcon = getRoleIcon(role)
          const meta = ROLE_META[role] || {}
          const roleColor = meta.color || ['#4A90D9','#6B8F71','#9B72FF','#E8A838','#D4706A','#4ECDC4','#E67E22','#95A5A6'][i % 8]
          return (
            <div key={i} style={{ background: 'var(--color-card)', border: '1px solid var(--color-border)', borderTop: '3px solid ' + roleColor, borderRadius: 14, padding: '18px 16px', display: 'flex', flexDirection: 'column', gap: 10, minHeight: 140, height: 'auto' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: 9, background: roleColor + '15', border: '1px solid ' + roleColor + '30', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <RoleIcon style={{ width: 17, height: 17, color: roleColor }} />
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontFamily: "'Urbanist',sans-serif", fontWeight: 700, fontSize: 13, color: 'var(--color-text)', lineHeight: 1.3, wordBreak: 'break-word' }}>{role}</div>
                  {meta.description && (
                    <div style={{ fontFamily: "'Urbanist', sans-serif", fontSize: 10, color: 'var(--color-text-muted)', marginTop: 2, lineHeight: 1.4 }}>
                      {meta.description.slice(0, 80)}{meta.description.length > 80 ? '…' : ''}
                    </div>
                  )}
                </div>
              </div>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: roleColor + '10', border: '1px solid ' + roleColor + '25', borderRadius: 5, padding: '3px 9px', alignSelf: 'flex-start' }}>
                <div style={{ width: 5, height: 5, borderRadius: '50%', background: roleColor }} />
                <span style={{ fontFamily: "'Urbanist', sans-serif", fontSize: 9, fontWeight: 700, color: roleColor, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Required</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Section 8: Tech Stack ────────────────────────────────────────────────────

function TechStackSection({ techStack, discipline }) {
  if (!techStack) return null

  // Normalise all possible shapes into canonical keys
  const KEY_MAP = {
    frontend:   ['frontend','front','client','ui','fe'],
    backend:    ['backend','back','server','api','be'],
    database:   ['database','db','data','storage'],
    devops:     ['devops','deploy','infra','cloud','ops'],
    design:     ['design','figma','tool'],
    thirdParty: ['third','third-party','thirdparty','external','service','integration','payment','auth','analytics'],
  }
  let raw = Array.isArray(techStack) ? { general: techStack } : techStack
  const normalised = {}
  Object.entries(raw).forEach(([key, val]) => {
    const k = key.toLowerCase()
    let mapped = key
    for (const [canonical, aliases] of Object.entries(KEY_MAP)) {
      if (aliases.some(a => k.includes(a))) { mapped = canonical; break }
    }
    if (!normalised[mapped]) normalised[mapped] = []
    const items = Array.isArray(val) ? val
      : typeof val === 'string' ? [val]
      : typeof val === 'object' ? Object.values(val).flat() : []
    normalised[mapped].push(...items)
  })

  const hasAnyTools = Object.values(normalised).some(v => v.length > 0)
  if (!hasAnyTools) return null

  const LAYERS = [
    { key: 'frontend',   label: 'FRONTEND',    color: TECH_COLORS.frontend },
    { key: 'backend',    label: 'BACKEND',     color: TECH_COLORS.backend },
    { key: 'database',   label: 'DATABASE',    color: TECH_COLORS.database },
    { key: 'thirdParty', label: 'THIRD PARTY', color: TECH_COLORS.thirdParty },
    { key: 'devops',     label: 'DEVOPS',      color: TECH_COLORS.devops },
    { key: 'design',     label: 'DESIGN',      color: TECH_COLORS.design },
  ].filter(l => normalised[l.key]?.length > 0)

  if (LAYERS.length === 0) return null

  function parseTool(t) {
    if (!t) return ''
    if (typeof t === 'string') return t.split('—')[0].split('(')[0].trim()
    if (typeof t === 'object') return (t.name || t.tool || t.label || JSON.stringify(t)).split('—')[0].trim()
    return String(t)
  }

  return (
    <div style={{ padding: '40px 48px', borderBottom: '1px solid var(--color-border)' }}>
      <div style={{ fontFamily: "'Urbanist', sans-serif", fontWeight: 700, fontSize: '20px', color: 'var(--color-text)', marginBottom: '24px' }}>{getSectionLabel('Tech Stack', { discipline })}</div>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 0, overflowX: 'auto', paddingBottom: 8 }}>
        {LAYERS.map((layer, i) => {
          const tools = normalised[layer.key] || []
          const isLast = i === LAYERS.length - 1
          return (
            <div key={layer.key} style={{ display: 'flex', alignItems: 'flex-start', flexShrink: 0 }}>
              <div style={{ background: layer.color + '12', border: '1.5px solid ' + layer.color + '40', borderRadius: 14, padding: '16px 14px', minWidth: 150, maxWidth: 180 }}>
                <div style={{ fontFamily: "'Urbanist', sans-serif", fontSize: 10, fontWeight: 700, color: layer.color, letterSpacing: '0.08em', textAlign: 'center', marginBottom: 14, textTransform: 'uppercase' }}>
                  {layer.label}
                </div>
                {tools.slice(0, 7).map((tool, ti) => (
                  <div key={ti} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, background: 'var(--color-card)', border: '1px solid var(--color-border)', borderRadius: 8, padding: '7px 10px' }}>
                    <div style={{ width: 7, height: 7, borderRadius: '50%', background: layer.color, flexShrink: 0 }} />
                    <span style={{ fontFamily: "'Urbanist', sans-serif", fontSize: 12, fontWeight: 500, color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {parseTool(tool)}
                    </span>
                  </div>
                ))}
              </div>
              {!isLast && (
                <div style={{ display: 'flex', alignItems: 'center', paddingTop: 52, paddingLeft: 4, paddingRight: 4, flexShrink: 0 }}>
                  <svg width="36" height="16" overflow="visible">
                    <line x1="2" y1="8" x2="28" y2="8" stroke="var(--color-border)" strokeWidth="1.5" strokeDasharray="4 3" />
                    <path d="M24,4 L32,8 L24,12" stroke="var(--color-border)" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Section 9: Features ──────────────────────────────────────────────────────

function FeaturesSection({ features, discipline }) {
  const [hoveredFeature, setHoveredFeature] = useState(null)

  const W = 600, H = 400
  const PAD = { top: 20, right: 20, bottom: 50, left: 50 }
  const plotW = W - PAD.left - PAD.right
  const plotH = H - PAD.top - PAD.bottom

  function toSVG(x, y) {
    return {
      sx: PAD.left + (x / 10) * plotW,
      sy: PAD.top + (1 - y / 10) * plotH,
    }
  }

  function effortVal(c) {
    if (!c) return 5
    const cl = c.toUpperCase()
    if (cl === 'LOW') return 2
    if (cl === 'HIGH') return 8
    return 5
  }

  function impactVal(p) {
    if (!p) return 5
    const pu = p.toUpperCase()
    if (pu === 'MUST HAVE' || pu === 'HIGH') return 8.5
    if (pu === 'SHOULD HAVE' || pu === 'MEDIUM') return 5
    return 2
  }

  function priorityColor(p) {
    if (!p) return '#8B8BA0'
    const pu = p.toUpperCase()
    if (pu === 'MUST HAVE' || pu === 'HIGH') return '#FF4D6A'
    if (pu === 'SHOULD HAVE' || pu === 'MEDIUM') return '#FFB84D'
    return '#8B8BA0'
  }

  const gridTicks = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

  return (
    <div style={{ padding: '40px 48px', borderBottom: '1px solid var(--color-border)' }}>
      <div style={{ fontFamily: "'Urbanist', sans-serif", fontWeight: 700, fontSize: '20px', color: 'var(--color-text)', marginBottom: '24px' }}>{getSectionLabel('Feature Analysis', { discipline })}</div>

      {features.length > 0 && (
        <div style={{ marginBottom: 32 }}>
          <div style={{ fontFamily: "'Urbanist', sans-serif", fontSize: 10, color: 'var(--color-text-muted)', letterSpacing: '0.08em', marginBottom: 12, textTransform: 'uppercase' }}>Priority Scatter Plot</div>
          <div style={{ overflowX: 'auto', background: 'var(--color-surface)', borderRadius: 14, border: '1px solid var(--color-border)', padding: 16 }}>
            <svg width={W} height={H} style={{ display: 'block' }}>
              {/* Quadrant tints */}
              <rect x={PAD.left} y={PAD.top} width={plotW/2} height={plotH/2} fill="rgba(255,77,106,0.05)" />
              <rect x={PAD.left + plotW/2} y={PAD.top} width={plotW/2} height={plotH/2} fill="rgba(255,77,106,0.10)" />
              <rect x={PAD.left} y={PAD.top + plotH/2} width={plotW/2} height={plotH/2} fill="rgba(139,139,160,0.04)" />
              <rect x={PAD.left + plotW/2} y={PAD.top + plotH/2} width={plotW/2} height={plotH/2} fill="rgba(255,184,77,0.06)" />

              {/* Grid lines */}
              {gridTicks.map(t => {
                const { sx } = toSVG(t, 0)
                const { sy } = toSVG(0, t)
                return (
                  <g key={t}>
                    <line x1={sx} y1={PAD.top} x2={sx} y2={PAD.top + plotH} stroke="var(--color-border)" strokeWidth="0.5" strokeDasharray="3 3" />
                    <line x1={PAD.left} y1={sy} x2={PAD.left + plotW} y2={sy} stroke="var(--color-border)" strokeWidth="0.5" strokeDasharray="3 3" />
                    <text x={sx} y={PAD.top + plotH + 14} textAnchor="middle" fontFamily="Urbanist" fontSize="9" fill="var(--color-text-muted)">{t}</text>
                    {t > 0 && <text x={PAD.left - 8} y={sy + 3} textAnchor="end" fontFamily="Urbanist" fontSize="9" fill="var(--color-text-muted)">{t}</text>}
                  </g>
                )
              })}

              {/* Axis labels */}
              <text x={PAD.left + plotW / 2} y={H - 4} textAnchor="middle" fontFamily="Urbanist" fontSize="10" fill="var(--color-text-muted)">Implementation Effort →</text>
              <text x={12} y={PAD.top + plotH / 2} textAnchor="middle" fontFamily="Urbanist" fontSize="10" fill="var(--color-text-muted)" transform={`rotate(-90, 12, ${PAD.top + plotH / 2})`}>Business Impact →</text>

              {/* Bubbles */}
              {features.map((f, i) => {
                const seed = i + 1
                const effort = effortVal(f.complexity) + ((seed * 7) % 5 - 2) * 0.4
                const impact = impactVal(f.priority) + ((seed * 13) % 5 - 2) * 0.4
                const { sx, sy } = toSVG(
                  Math.max(0.5, Math.min(9.5, effort)),
                  Math.max(0.5, Math.min(9.5, impact))
                )
                const col = priorityColor(f.priority)
                const isHovered = hoveredFeature === i
                return (
                  <g key={i} style={{ cursor: 'pointer' }}
                    onMouseEnter={() => setHoveredFeature(i)}
                    onMouseLeave={() => setHoveredFeature(null)}>
                    {isHovered && <circle cx={sx} cy={sy} r="18" fill={col} opacity="0.2" />}
                    <circle cx={sx} cy={sy} r="10" fill={col} opacity={isHovered ? 1 : 0.8} />
                    <text x={sx} y={sy + 4} textAnchor="middle" fontFamily="Urbanist" fontSize="9" fill="white" fontWeight="700">{i + 1}</text>
                    {isHovered && (
                      <g>
                        <rect x={sx + 14} y={sy - 28} width="140" height="44" rx="6" fill="var(--color-card)" stroke={col} strokeWidth="1" filter="drop-shadow(0 2px 6px rgba(0,0,0,0.3))" />
                        <text x={sx + 22} y={sy - 12} fontFamily="Urbanist" fontSize="11" fontWeight="700" fill="var(--color-text)">{f.name?.slice(0, 18)}{f.name?.length > 18 ? '…' : ''}</text>
                        <text x={sx + 22} y={sy + 4} fontFamily="Urbanist" fontSize="9" fill="var(--color-text-muted)">Effort {effort.toFixed(1)} · Impact {impact.toFixed(1)}</text>
                      </g>
                    )}
                  </g>
                )
              })}
            </svg>
          </div>

          {/* Legend */}
          <div style={{ display: 'flex', gap: 20, marginTop: 12 }}>
            {[['#FF4D6A', 'Must Have'], ['#FFB84D', 'Should Have'], ['#8B8BA0', 'Nice to Have']].map(([col, label]) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: col }} />
                <span style={{ fontFamily: "'Urbanist', sans-serif", fontSize: 10, color: 'var(--color-text-muted)' }}>{label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Priority columns */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', alignItems: 'flex-start' }}>
        {PRIORITY_GROUPS.map(group => {
          const items = features.filter(f => f.priority === group.key)
          if (!items.length) return null
          return (
            <div key={group.key}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: group.color, flexShrink: 0 }} />
                <span style={{ fontFamily: "'Urbanist', sans-serif", fontSize: '11px', fontWeight: 700, color: group.color }}>{group.label}</span>
                <span style={{ fontFamily: "'Urbanist', sans-serif", fontSize: '10px', color: 'var(--color-text-muted)' }}>({items.length})</span>
              </div>
              {items.map((feat, i) => (
                <div key={i} style={{ background: 'var(--color-surface)', border: `1px solid ${group.color}28`, borderLeft: `3px solid ${group.color}`, borderRadius: '10px', padding: '14px', marginBottom: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', marginBottom: '6px' }}>
                    <div style={{ fontFamily: "'Urbanist', sans-serif", fontWeight: 700, fontSize: '13px', color: 'var(--color-text)', flex: 1 }}>{feat.name}</div>
                    <span style={{ fontFamily: "'Urbanist', sans-serif", fontSize: '9px', fontWeight: 700, padding: '2px 7px', borderRadius: '4px', background: `${group.color}20`, color: group.color, flexShrink: 0 }}>{group.label}</span>
                  </div>
                  {feat.description && <p style={{ fontFamily: "'Urbanist', sans-serif", fontSize: '13px', color: 'var(--color-text-soft)', lineHeight: 1.6, margin: '0 0 8px' }}>{feat.description}</p>}
                  {feat.userValue && <div style={{ fontFamily: "'Urbanist', sans-serif", fontSize: '11px', color: 'var(--color-text)', marginBottom: '8px' }}>→ {feat.userValue}</div>}
                  {feat.complexity && <span style={{ fontFamily: "'Urbanist', sans-serif", fontSize: '9px', padding: '2px 7px', borderRadius: '4px', background: 'var(--color-border)', color: 'var(--color-text-muted)' }}>{feat.complexity}</span>}
                </div>
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Section 10: User Flow ────────────────────────────────────────────────────

const BLUE = '#3B82F6'

// Layout constants for flowchart
const FC = {
  NODE_W: 156,   // process node width
  NODE_H: 80,    // process node height
  DEC_W:  156,   // decision diamond width (same bounding box)
  DEC_H:  88,    // decision diamond height (taller for diamond)
  TERM_W: 120,   // terminal (start/end) pill width
  TERM_H: 44,    // terminal pill height
  GAP_X:  72,    // horizontal gap between nodes
  CENTER_Y: 200, // vertical center of main flow
  BRANCH_DROP: 90, // how far below center the branch label sits
}

function UserFlowSection({ userFlow, discipline }) {
  const steps = (userFlow || []).filter(Boolean)

  const [viewScale, setViewScale] = useState(0.8)
  const [offset, setOffset] = useState({ x: 32, y: 0 })
  const [dragging, setDragging] = useState(false)
  const [dragStart, setDragStart] = useState(null)
  const [hoveredNode, setHoveredNode] = useState(null)
  const containerRef = useRef(null)

  function handleWheel(e) {
    e.preventDefault()
    const delta = e.deltaY > 0 ? -0.008 : 0.008
    setViewScale(s => Math.min(2.5, Math.max(0.25, s + delta)))
  }
  function handleMouseDown(e) {
    if (e.button !== 0) return
    e.preventDefault()
    setDragging(true)
    setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y })
  }
  function handleMouseMove(e) {
    if (!dragging || !dragStart) return
    setOffset({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y })
  }
  function handleMouseUp() { setDragging(false); setDragStart(null) }

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    el.addEventListener('wheel', handleWheel, { passive: false })
    return () => el.removeEventListener('wheel', handleWheel)
  })

  if (!steps.length) {
    return (
      <section style={{ padding: '40px 48px', borderBottom: '1px solid var(--color-border)' }}>
        <div style={{ fontFamily: "'Urbanist', sans-serif", fontSize: 11, color: 'var(--color-text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 16 }}>{getSectionLabel('User Flow', { discipline })}</div>
        <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 12, padding: '32px', textAlign: 'center' }}>
          <div style={{ fontFamily: "'Urbanist',sans-serif", fontSize: 14, color: 'var(--color-text-muted)' }}>User flow not generated for this brief</div>
        </div>
      </section>
    )
  }

  // Build node descriptors with exact geometry
  let curX = 0
  const nodes = steps.map((step, i) => {
    const isStart = i === 0
    const isEnd = i === steps.length - 1
    const isTerm = isStart || isEnd
    const isDecision = !isTerm && !!(step.branch && step.branch.trim().length > 0)

    const w = isTerm ? FC.TERM_W : FC.NODE_W
    const h = isTerm ? FC.TERM_H : (isDecision ? FC.DEC_H : FC.NODE_H)
    const x = curX
    const y = FC.CENTER_Y - h / 2
    const cx = x + w / 2
    const cy = FC.CENTER_Y

    // right exit point (centre-right of shape)
    const exitX = isTerm ? x + w : (isDecision ? x + w : x + w)
    const exitY = cy
    // left entry point
    const entryX = isTerm ? x : x
    const entryY = cy

    curX += w + FC.GAP_X

    return {
      i, x, y, w, h, cx, cy,
      exitX, exitY, entryX, entryY,
      isStart, isEnd, isTerm, isDecision,
      title: step.title || step.screen || step.name || `Step ${step.step || i + 1}`,
      action: step.action || step.description || '',
      outcome: step.outcome || step.result || '',
      branch: step.branch || '',
      stepNum: step.step || step.number || (i + 1),
    }
  })

  const TOTAL_W = curX + 40
  const CANVAS_H = FC.CENTER_Y + FC.BRANCH_DROP + 60

  return (
    <section style={{ padding: '40px 48px', borderBottom: '1px solid var(--color-border)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <div style={{ fontFamily: "'Urbanist', sans-serif", fontSize: 11, color: 'var(--color-text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>{getSectionLabel('User Flow', { discipline })}</div>
          <div style={{ fontFamily: "'Urbanist', sans-serif", fontSize: 11, color: 'var(--color-text-muted)' }}>{steps.length} steps · drag to pan · scroll to zoom</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button onClick={() => setViewScale(s => Math.max(0.25, s - 0.1))} style={{ width: 28, height: 28, borderRadius: 7, background: 'var(--color-surface)', border: '1px solid var(--color-border)', cursor: 'pointer', fontFamily: "'Urbanist',sans-serif", fontSize: 16, fontWeight: 700, color: 'var(--color-text)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
          <span style={{ fontFamily: "'Urbanist', sans-serif", fontSize: 11, color: 'var(--color-text-muted)', minWidth: 40, textAlign: 'center' }}>{Math.round(viewScale * 100)}%</span>
          <button onClick={() => setViewScale(s => Math.min(2.5, s + 0.1))} style={{ width: 28, height: 28, borderRadius: 7, background: 'var(--color-surface)', border: '1px solid var(--color-border)', cursor: 'pointer', fontFamily: "'Urbanist',sans-serif", fontSize: 16, fontWeight: 700, color: 'var(--color-text)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
          <button onClick={() => { setViewScale(0.8); setOffset({ x: 32, y: 0 }) }} style={{ height: 28, borderRadius: 7, background: 'var(--color-surface)', border: '1px solid var(--color-border)', cursor: 'pointer', fontFamily: "'Urbanist', sans-serif", fontSize: 10, color: 'var(--color-text-muted)', padding: '0 10px' }}>Fit</button>
        </div>
      </div>

      <div
        ref={containerRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        style={{ width: '100%', height: 480, background: '#F8FAFF', border: '1px solid #E2E8F0', borderRadius: 16, overflow: 'hidden', position: 'relative', cursor: dragging ? 'grabbing' : 'grab', userSelect: 'none' }}
      >
        {/* Dot grid background */}
        <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
          <defs>
            <pattern id="fcgrid" x="0" y="0" width="24" height="24" patternUnits="userSpaceOnUse">
              <circle cx="1" cy="1" r="1" fill="#CBD5E1" opacity="0.7"/>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#fcgrid)" />
        </svg>

        <div style={{ position: 'absolute', left: 0, top: 0, transformOrigin: '0 0', transform: `translate(${offset.x}px,${offset.y + 20}px) scale(${viewScale})`, width: TOTAL_W, height: CANVAS_H }}>
          <svg width={TOTAL_W} height={CANVAS_H} style={{ position: 'absolute', top: 0, left: 0, overflow: 'visible' }}>
            <defs>
              {/* Main flow arrow — grey */}
              <marker id="fc-arr" markerWidth="10" markerHeight="10" refX="8" refY="4" orient="auto">
                <path d="M1,1 L8,4 L1,7" stroke="#94A3B8" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
              </marker>
              {/* Branch arrow — blue */}
              <marker id="fc-arr-blue" markerWidth="10" markerHeight="10" refX="8" refY="4" orient="auto">
                <path d="M1,1 L8,4 L1,7" stroke={BLUE} strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
              </marker>
              {/* Drop shadow filter */}
              <filter id="fc-shadow" x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#0F172A" floodOpacity="0.08"/>
              </filter>
              <filter id="fc-shadow-hover" x="-30%" y="-30%" width="160%" height="160%">
                <feDropShadow dx="0" dy="4" stdDeviation="8" floodColor={BLUE} floodOpacity="0.2"/>
              </filter>
            </defs>

            {/* ── Horizontal connecting lines (main flow) ── */}
            {nodes.slice(0, -1).map((node, i) => {
              const next = nodes[i + 1]
              const x1 = node.exitX
              const x2 = next.entryX
              const y = FC.CENTER_Y
              // For diamond: exit from right vertex, entry to left vertex
              const ex1 = node.isDecision ? node.x + node.w : node.exitX
              const ex2 = next.isDecision ? next.x : next.entryX
              return (
                <g key={'conn' + i}>
                  <line x1={ex1} y1={y} x2={ex2 - 6} y2={y}
                    stroke="#CBD5E1" strokeWidth="2" markerEnd="url(#fc-arr)"/>
                  {/* YES label on main flow out of decision */}
                  {node.isDecision && (
                    <text x={(ex1 + ex2) / 2} y={y - 6}
                      textAnchor="middle" fontFamily="'Urbanist', sans-serif" fontSize="9" fontWeight="700" fill="#22C55E">
                      YES
                    </text>
                  )}
                </g>
              )
            })}

            {/* ── Branch lines down from decision nodes ── */}
            {nodes.filter(n => n.isDecision).map(node => {
              const bx = node.cx
              const topY = node.y + node.h    // bottom vertex of diamond
              const lineEndY = topY + FC.BRANCH_DROP - 28
              const labelY = lineEndY + 6
              return (
                <g key={'branch' + node.i}>
                  <line x1={bx} y1={topY} x2={bx} y2={lineEndY}
                    stroke={BLUE} strokeWidth="1.5" strokeDasharray="5 3" markerEnd="url(#fc-arr-blue)"/>
                  {/* NO label */}
                  <text x={bx + 6} y={topY + 16}
                    fontFamily="'Urbanist', sans-serif" fontSize="9" fontWeight="700" fill={BLUE}>
                    NO
                  </text>
                  {/* Branch condition pill */}
                  <rect x={bx - 64} y={labelY} width={128} height={26} rx="6"
                    fill={BLUE + '10'} stroke={BLUE + '50'} strokeWidth="1.5"/>
                  <foreignObject x={bx - 58} y={labelY + 4} width={116} height={18}>
                    <div style={{ fontFamily: "'Urbanist', sans-serif", fontSize: '9px', color: BLUE, textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600 }}>
                      {node.branch.slice(0, 28)}
                    </div>
                  </foreignObject>
                </g>
              )
            })}

            {/* ── Node shapes ── */}
            {nodes.map(node => {
              const hovered = hoveredNode === node.i
              const filt = hovered ? 'url(#fc-shadow-hover)' : 'url(#fc-shadow)'

              if (node.isTerm) {
                // Pill / stadium terminal
                return (
                  <rect key={'shp' + node.i}
                    x={node.x} y={node.y} width={node.w} height={node.h}
                    rx={node.h / 2}
                    fill={BLUE}
                    filter={filt}
                    opacity={hovered ? 1 : 0.92}
                    style={{ transition: 'opacity 0.15s' }}/>
                )
              }
              if (node.isDecision) {
                const pts = [
                  `${node.cx},${node.y}`,
                  `${node.x + node.w},${node.cy}`,
                  `${node.cx},${node.y + node.h}`,
                  `${node.x},${node.cy}`,
                ].join(' ')
                return (
                  <polygon key={'shp' + node.i} points={pts}
                    fill="white" stroke={hovered ? BLUE : '#93C5FD'} strokeWidth={hovered ? 2.5 : 2}
                    filter={filt}
                    style={{ transition: 'stroke 0.15s, stroke-width 0.15s' }}/>
                )
              }
              // Process node
              return (
                <rect key={'shp' + node.i}
                  x={node.x} y={node.y} width={node.w} height={node.h} rx="12"
                  fill="white" stroke={hovered ? BLUE : '#E2E8F0'} strokeWidth={hovered ? 2 : 1.5}
                  filter={filt}
                  style={{ transition: 'stroke 0.15s, stroke-width 0.15s' }}/>
              )
            })}

            {/* ── Node text & interactivity ── */}
            {nodes.map(node => {
              const hovered = hoveredNode === node.i

              if (node.isTerm) {
                return (
                  <g key={'lbl' + node.i}
                    onMouseEnter={() => setHoveredNode(node.i)}
                    onMouseLeave={() => setHoveredNode(null)}>
                    {/* invisible hit target */}
                    <rect x={node.x} y={node.y} width={node.w} height={node.h} rx={node.h/2} fill="transparent"/>
                    <foreignObject x={node.x + 8} y={node.cy - 9} width={node.w - 16} height={18}>
                      <div style={{ fontFamily: "'Urbanist',sans-serif", fontWeight: 800, fontSize: '11px', color: 'white', textAlign: 'center', letterSpacing: '0.04em', textTransform: 'uppercase', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {node.isStart ? '▶ Start' : '■ End'}
                      </div>
                    </foreignObject>
                  </g>
                )
              }

              if (node.isDecision) {
                return (
                  <g key={'lbl' + node.i}
                    onMouseEnter={() => setHoveredNode(node.i)}
                    onMouseLeave={() => setHoveredNode(null)}>
                    {/* invisible diamond hit area */}
                    <polygon
                      points={`${node.cx},${node.y} ${node.x+node.w},${node.cy} ${node.cx},${node.y+node.h} ${node.x},${node.cy}`}
                      fill="transparent"/>
                    {/* Step badge */}
                    <circle cx={node.cx} cy={node.y} r={10} fill={BLUE}/>
                    <text x={node.cx} y={node.y + 4}
                      textAnchor="middle" fontFamily="'Urbanist',sans-serif" fontWeight="800" fontSize="9" fill="white">
                      {node.stepNum}
                    </text>
                    {/* Title inside diamond */}
                    <foreignObject x={node.x + 20} y={node.cy - 16} width={node.w - 40} height={32}>
                      <div style={{ fontFamily: "'Urbanist',sans-serif", fontWeight: 700, fontSize: '10px', color: '#1E293B', textAlign: 'center', lineHeight: '1.3', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                        {node.title}
                      </div>
                    </foreignObject>
                    {/* Hover tooltip */}
                    {hovered && node.action && (
                      <g>
                        <rect x={node.cx - 72} y={node.y - 52} width={144} height={44} rx="8"
                          fill="white" stroke={BLUE} strokeWidth="1"
                          style={{ filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.12))' }}/>
                        <foreignObject x={node.cx - 64} y={node.y - 48} width={128} height={36}>
                          <div style={{ fontFamily: "'Urbanist', sans-serif", fontSize: '9px', color: '#475569', lineHeight: 1.5 }}>
                            {node.action.slice(0, 70)}
                          </div>
                        </foreignObject>
                      </g>
                    )}
                  </g>
                )
              }

              // Process node
              return (
                <g key={'lbl' + node.i}
                  onMouseEnter={() => setHoveredNode(node.i)}
                  onMouseLeave={() => setHoveredNode(null)}>
                  <rect x={node.x} y={node.y} width={node.w} height={node.h} rx="12" fill="transparent"/>
                  {/* Step number badge top-right */}
                  <circle cx={node.x + node.w - 2} cy={node.y + 2} r={10} fill={BLUE}/>
                  <text x={node.x + node.w - 2} y={node.y + 6}
                    textAnchor="middle" fontFamily="'Urbanist',sans-serif" fontWeight="800" fontSize="9" fill="white">
                    {node.stepNum}
                  </text>
                  {/* Title */}
                  <foreignObject x={node.x + 10} y={node.y + 10} width={node.w - 28} height={30}>
                    <div style={{ fontFamily: "'Urbanist',sans-serif", fontWeight: 700, fontSize: '11px', color: '#1E293B', lineHeight: '1.3', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                      {node.title}
                    </div>
                  </foreignObject>
                  {/* Action subtitle */}
                  {node.action && (
                    <foreignObject x={node.x + 10} y={node.y + 42} width={node.w - 20} height={18}>
                      <div style={{ fontFamily: "'Urbanist', sans-serif", fontSize: '8px', color: '#94A3B8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {node.action.slice(0, 42)}{node.action.length > 42 ? '…' : ''}
                      </div>
                    </foreignObject>
                  )}
                  {/* Outcome dot */}
                  {node.outcome && (
                    <foreignObject x={node.x + 10} y={node.y + node.h - 19} width={node.w - 20} height={14}>
                      <div style={{ fontFamily: "'Urbanist', sans-serif", fontSize: '8px', color: '#22C55E', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        ✓ {node.outcome.slice(0, 36)}
                      </div>
                    </foreignObject>
                  )}
                  {/* Hover tooltip */}
                  {hovered && (node.action || node.outcome) && (
                    <g>
                      <rect x={node.x} y={node.y - 70} width={node.w} height={62} rx="8"
                        fill="white" stroke={BLUE} strokeWidth="1.5"
                        style={{ filter: 'drop-shadow(0 4px 14px rgba(0,0,0,0.12))' }}/>
                      <foreignObject x={node.x + 8} y={node.y - 66} width={node.w - 16} height={54}>
                        <div>
                          {node.action && <div style={{ fontFamily: "'Urbanist', sans-serif", fontSize: '9px', color: '#475569', lineHeight: 1.6, marginBottom: 3 }}>{node.action.slice(0, 90)}</div>}
                          {node.outcome && <div style={{ fontFamily: "'Urbanist', sans-serif", fontSize: '9px', color: '#22C55E' }}>✓ {node.outcome.slice(0, 60)}</div>}
                        </div>
                      </foreignObject>
                    </g>
                  )}
                </g>
              )
            })}
          </svg>
        </div>
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 24, marginTop: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <svg width="36" height="18"><rect x="1" y="1" width="34" height="16" rx="8" fill={BLUE}/></svg>
          <span style={{ fontFamily: "'Urbanist', sans-serif", fontSize: 10, color: 'var(--color-text-muted)' }}>Start / End</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <svg width="32" height="18"><rect x="1" y="1" width="30" height="16" rx="4" fill="white" stroke="#E2E8F0" strokeWidth="1.5"/></svg>
          <span style={{ fontFamily: "'Urbanist', sans-serif", fontSize: 10, color: 'var(--color-text-muted)' }}>Process / Action</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <svg width="22" height="18"><polygon points="11,1 21,9 11,17 1,9" fill="white" stroke="#93C5FD" strokeWidth="1.5"/></svg>
          <span style={{ fontFamily: "'Urbanist', sans-serif", fontSize: 10, color: 'var(--color-text-muted)' }}>Decision</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <svg width="32" height="12"><line x1="2" y1="6" x2="24" y2="6" stroke="#CBD5E1" strokeWidth="2"/><polygon points="22,3 30,6 22,9" fill="#CBD5E1"/></svg>
          <span style={{ fontFamily: "'Urbanist', sans-serif", fontSize: 10, color: 'var(--color-text-muted)' }}>Flow</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <svg width="32" height="12"><line x1="2" y1="6" x2="24" y2="6" stroke={BLUE} strokeWidth="1.5" strokeDasharray="4 3"/><polygon points="22,3 30,6 22,9" fill={BLUE}/></svg>
          <span style={{ fontFamily: "'Urbanist', sans-serif", fontSize: 10, color: 'var(--color-text-muted)' }}>Alternate path</span>
        </div>
      </div>
    </section>
  )
}

// ─── Section 11: Competitors ──────────────────────────────────────────────────

function CompetitorsSection({ result, loadingCompetitors, onLoad }) {
  const competitors = result?.competitors || []

  const catStyle = (cat) => ({
    Direct:       { bg: 'rgba(220,38,38,0.08)',  color: '#dc2626' },
    Indirect:     { bg: 'rgba(217,119,6,0.08)',  color: '#d97706' },
    Aspirational: { bg: 'rgba(124,58,237,0.08)', color: '#7c3aed' },
  }[cat] || { bg: 'rgba(100,100,100,0.08)', color: 'var(--color-text-muted)' })

  return (
    <div style={{ padding: '40px 48px', borderBottom: '1px solid var(--color-border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
        <GlobeAltIcon style={{ width: '18px', height: '18px', color: 'var(--color-text-muted)' }} />
        <span style={{ fontFamily: "'Urbanist', sans-serif", fontWeight: 700, fontSize: '20px', color: 'var(--color-text)' }}>Competitor Analysis</span>
      </div>

      {competitors.length === 0 ? (
        <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 16, padding: '32px', textAlign: 'center', marginTop: 16 }}>
          <GlobeAltIcon style={{ width: 32, height: 32, color: 'var(--color-text-muted)', margin: '0 auto 12px', display: 'block' }} />
          <div style={{ fontFamily: "'Urbanist', sans-serif", fontWeight: 600, fontSize: 15, color: 'var(--color-text)', marginBottom: 6 }}>
            Analyse your competitors
          </div>
          <div style={{ fontFamily: "'Urbanist', sans-serif", fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 20, lineHeight: 1.6 }}>
            Find real competitors via web search and get strategic differentiation insights
          </div>
          <button
            onClick={onLoad}
            disabled={loadingCompetitors}
            style={{ background: 'var(--color-text)', color: 'var(--color-bg)', border: 'none', borderRadius: 10, padding: '10px 24px', fontFamily: "'Urbanist', sans-serif", fontWeight: 700, fontSize: 13, cursor: loadingCompetitors ? 'default' : 'pointer', opacity: loadingCompetitors ? 0.6 : 1, display: 'inline-flex', alignItems: 'center', gap: 8 }}
          >
            {loadingCompetitors ? (
              <>
                <div style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: 'white', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                Searching...
              </>
            ) : (
              <>
                <GlobeAltIcon style={{ width: 14, height: 14 }} />
                Find Competitors
              </>
            )}
          </button>
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16, marginTop: 16 }}>
            {(() => {
              const CARD_COLORS = ['#4CAF82','#FF4D6A','#4DAAFF','#9B72FF','#FFB84D','#FF72C8']
              const scoreColors = ['#FF4D6A','#6C63FF','#4CAF82']
              return competitors.map((comp, i) => {
                const isHighlighted = comp.category === 'Direct'
                const avatarColor = CARD_COLORS[i % CARD_COLORS.length]
                const scores = [
                  { label: 'UX Quality',    value: comp.uxScore || (comp.rating ? comp.rating * 20 : 60) },
                  { label: 'Feature Depth', value: comp.featureScore || ((comp.strengths?.length || 2) * 15) || 50 },
                  { label: 'Mobile',        value: comp.mobileScore || 55 },
                ]
                return (
                  <div key={i} style={{ background: 'var(--color-card)', border: isHighlighted ? '2px solid #FF4D6A' : '1px solid var(--color-border)', borderRadius: 16, padding: 20, position: 'relative' }}>
                    {/* Avatar */}
                    <div style={{ width: 44, height: 44, borderRadius: 12, background: avatarColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Urbanist',sans-serif", fontWeight: 800, fontSize: 20, color: 'white', marginBottom: 10 }}>
                      {(comp.name || '?')[0].toUpperCase()}
                    </div>
                    {/* Name + description */}
                    <div style={{ fontFamily: "'Urbanist',sans-serif", fontWeight: 700, fontSize: 16, color: 'var(--color-text)', marginBottom: 2 }}>{comp.name}</div>
                    <div style={{ fontFamily: "'Urbanist',sans-serif", fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 10 }}>
                      {comp.description?.split('.')[0] || comp.category}
                    </div>
                    {/* Feature tags */}
                    {comp.strengths?.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 12 }}>
                        {comp.strengths.slice(0, 3).map((s, si) => (
                          <div key={si} style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 5, padding: '3px 8px', fontFamily: "'Urbanist',sans-serif", fontSize: 11, fontWeight: 500, color: 'var(--color-text-soft)' }}>
                            {s.split(' ').slice(0, 2).join(' ')}
                          </div>
                        ))}
                      </div>
                    )}
                    {/* Score bars */}
                    <div style={{ marginBottom: 12 }}>
                      {scores.map((score, si) => (
                        <div key={score.label} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                          <div style={{ fontFamily: "'Urbanist',sans-serif", fontSize: 11, fontWeight: 500, color: 'var(--color-text-muted)', width: 80, flexShrink: 0 }}>{score.label}</div>
                          <div style={{ flex: 1, height: 4, background: 'var(--color-border)', borderRadius: 2, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: Math.min(score.value, 100) + '%', background: scoreColors[si], borderRadius: 2 }}/>
                          </div>
                        </div>
                      ))}
                    </div>
                    {/* Gap tag */}
                    {comp.weakness && (
                      <div style={{ display: 'inline-block', background: 'rgba(255,77,106,0.08)', border: '1px solid rgba(255,77,106,0.25)', borderRadius: 5, padding: '3px 9px', fontFamily: "'Urbanist', sans-serif", fontSize: 9, fontWeight: 700, color: '#FF4D6A', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                        {comp.weakness.split('.')[0].slice(0, 25).toUpperCase()}
                      </div>
                    )}
                    {/* URL */}
                    {comp.url && (
                      <a href={comp.url} target="_blank" rel="noopener noreferrer"
                        style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 10, textDecoration: 'none', fontFamily: "'Urbanist', sans-serif", fontSize: 10, color: 'var(--color-text-muted)', transition: 'color 0.15s' }}
                        onMouseEnter={e => e.currentTarget.style.color = 'var(--color-text)'}
                        onMouseLeave={e => e.currentTarget.style.color = 'var(--color-text-muted)'}
                      >
                        <ArrowTopRightOnSquareIcon style={{ width: 11, height: 11 }}/>
                        {comp.url.replace(/^https?:\/\//, '')}
                      </a>
                    )}
                  </div>
                )
              })
            })()}
            {/* Your App card */}
            <div style={{ background: 'var(--color-card)', border: '2px solid #FF4D6A', borderRadius: 16, padding: 20 }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: '#FF4D6A', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Urbanist',sans-serif", fontWeight: 800, fontSize: 20, color: 'white', marginBottom: 10 }}>+</div>
              <div style={{ fontFamily: "'Urbanist',sans-serif", fontWeight: 700, fontSize: 16, color: 'var(--color-text)', marginBottom: 2 }}>Your App</div>
              <div style={{ fontFamily: "'Urbanist',sans-serif", fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 10 }}>
                {result?.projectTitle?.split(' ').slice(0, 3).join(' ')}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 12 }}>
                {(result?.features || []).filter(f => f.priority === 'HIGH' || f.priority?.includes('MUST')).slice(0, 3).map((f, fi) => (
                  <div key={fi} style={{ background: 'rgba(255,77,106,0.08)', border: '1px solid rgba(255,77,106,0.25)', borderRadius: 5, padding: '3px 8px', fontFamily: "'Urbanist',sans-serif", fontSize: 11, fontWeight: 500, color: '#FF4D6A' }}>
                    {f.name?.split(' ').slice(0, 2).join(' ')}
                  </div>
                ))}
              </div>
              {[{ label: 'UX Quality', value: 90, color: '#FF4D6A' }, { label: 'Feature Depth', value: 85, color: '#6C63FF' }, { label: 'Mobile', value: 95, color: '#4CAF82' }].map(s => (
                <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                  <div style={{ fontFamily: "'Urbanist',sans-serif", fontSize: 11, fontWeight: 500, color: 'var(--color-text-muted)', width: 80, flexShrink: 0 }}>{s.label}</div>
                  <div style={{ flex: 1, height: 4, background: 'var(--color-border)', borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: s.value + '%', background: s.color, borderRadius: 2 }}/>
                  </div>
                </div>
              ))}
              <div style={{ display: 'inline-block', marginTop: 10, background: 'rgba(255,77,106,0.08)', border: '1px solid rgba(255,77,106,0.25)', borderRadius: 5, padding: '3px 9px', fontFamily: "'Urbanist', sans-serif", fontSize: 9, fontWeight: 700, color: '#FF4D6A', letterSpacing: '0.04em', textTransform: 'uppercase' }}>BUILT FOR DESIGNERS +</div>
            </div>
          </div>
          {/* Comparison table */}
          {competitors.length > 1 && (
            <div style={{ marginTop: 28, overflowX: 'auto' }}>
              <div style={{ fontFamily: "'Urbanist', sans-serif", fontSize: 10, color: 'var(--color-text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 12 }}>Comparison</div>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 520 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                    {['Competitor', 'Category', 'Rating', 'Pricing', 'Market Share', 'User Base'].map(col => (
                      <th key={col} style={{ textAlign: 'left', padding: '6px 12px', fontFamily: "'Urbanist', sans-serif", fontSize: 10, color: 'var(--color-text-muted)', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {competitors.map((c, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--color-border)', background: i % 2 === 1 ? 'var(--color-surface)' : 'transparent' }}>
                      <td style={{ padding: '8px 12px', fontFamily: "'Urbanist', sans-serif", fontWeight: 600, fontSize: 12, color: 'var(--color-text)' }}>{c.name}</td>
                      <td style={{ padding: '8px 12px' }}>
                        {c.category && <span style={{ background: catStyle(c.category).bg, color: catStyle(c.category).color, fontSize: 9, fontFamily: "'Urbanist', sans-serif", fontWeight: 700, borderRadius: 4, padding: '2px 6px' }}>{c.category}</span>}
                      </td>
                      <td style={{ padding: '8px 12px' }}>
                        <div style={{ display: 'flex', gap: 1 }}>
                          {[1,2,3,4,5].map(n => (
                            <span key={n} style={{ color: n <= (c.rating || 0) ? '#FFB84D' : 'var(--color-border)', fontSize: 11 }}>★</span>
                          ))}
                        </div>
                      </td>
                      <td style={{ padding: '8px 12px', fontFamily: "'Urbanist', sans-serif", fontSize: 11, color: 'var(--color-text-soft)' }}>{c.pricing || '—'}</td>
                      <td style={{ padding: '8px 12px', fontFamily: "'Urbanist', sans-serif", fontSize: 11, color: 'var(--color-text-soft)' }}>{c.marketShare || '—'}</td>
                      <td style={{ padding: '8px 12px', fontFamily: "'Urbanist', sans-serif", fontSize: 11, color: 'var(--color-text-soft)' }}>{c.userBase || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ─── Section 12: Clarity + Questions + Flags ──────────────────────────────────

function ClarityFlagsSection({ r }) {
  const hasAny = r.clarityImprovements?.length > 0 || r.questionsToAsk?.length > 0 || r.redFlags?.length > 0
  if (!hasAny) return null
  return (
    <div style={{ padding: '40px 48px', borderBottom: '1px solid var(--color-border)' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '32px' }}>
        {r.clarityImprovements?.length > 0 && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
              <LightBulbIcon style={{ width: '16px', height: '16px', color: 'var(--color-text-muted)' }} />
              <span style={{ fontFamily: "'Urbanist', sans-serif", fontWeight: 700, fontSize: '15px', color: 'var(--color-text)' }}>How to Improve</span>
            </div>
            {r.clarityImprovements.map((item, i) => (
              <div key={i} style={{ display: 'flex', gap: '12px', padding: '10px 0', borderBottom: i < r.clarityImprovements.length - 1 ? '1px solid var(--color-border)' : 'none' }}>
                <span style={{ fontFamily: "'Urbanist', sans-serif", fontSize: '11px', color: 'var(--color-blue)', fontWeight: 700, flexShrink: 0 }}>{String(i + 1).padStart(2, '0')}</span>
                <span style={{ fontFamily: "'Urbanist', sans-serif", fontSize: '13px', color: 'var(--color-text)', lineHeight: 1.6 }}>{item}</span>
              </div>
            ))}
          </div>
        )}
        {r.questionsToAsk?.length > 0 && (
          <div>
            <div style={{ fontFamily: "'Urbanist', sans-serif", fontWeight: 700, fontSize: '15px', color: 'var(--color-text)', marginBottom: '14px' }}>Questions for Client</div>
            {r.questionsToAsk.map((q, i) => (
              <div key={i} style={{ display: 'flex', gap: '12px', padding: '10px 0', borderBottom: i < r.questionsToAsk.length - 1 ? '1px solid var(--color-border)' : 'none' }}>
                <span style={{ fontFamily: "'Urbanist', sans-serif", fontSize: '11px', color: 'var(--color-text-muted)', fontWeight: 700, flexShrink: 0 }}>{String(i + 1).padStart(2, '0')}</span>
                <span style={{ fontFamily: "'Urbanist', sans-serif", fontSize: '13px', color: 'var(--color-text-soft)', lineHeight: 1.6 }}>{q}</span>
              </div>
            ))}
          </div>
        )}
        {r.redFlags?.length > 0 && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
              <ExclamationTriangleIcon style={{ width: '16px', height: '16px', color: 'var(--color-red)' }} />
              <span style={{ fontFamily: "'Urbanist', sans-serif", fontWeight: 700, fontSize: '15px', color: 'var(--color-red)' }}>Red Flags</span>
            </div>
            {r.redFlags.map((flag, i) => (
              <div key={i} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', background: 'rgba(220,38,38,0.04)', borderRadius: '8px', padding: '8px 10px', marginBottom: '6px' }}>
                <ExclamationTriangleIcon style={{ width: '13px', height: '13px', color: 'var(--color-red)', flexShrink: 0, marginTop: '2px' }} />
                <span style={{ fontFamily: "'Urbanist', sans-serif", fontSize: '13px', color: 'var(--color-text)', lineHeight: 1.6 }}>{flag}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Section 13: Inspirations ─────────────────────────────────────────────────

function InspirationsSection({ inspirations, loadingInspi, onFetch, inspiSearched }) {
  const CAT_COLORS = {
    'UI': '#5AB8FF', 'Brand': '#C8F55A', 'Web': 'var(--color-teal)',
    'App': '#4DFFA0', 'Motion': '#FF9EF5', 'Branding': '#C8F55A',
    'UI Reference': '#5AB8FF', 'Competitor': '#FF4D6A', 'Design System': '#B87FFF',
  }

  return (
    <div style={{ padding: '40px 48px' }}>
      <div style={{ fontFamily: "'Urbanist', sans-serif", fontWeight: 700, fontSize: '20px', color: 'var(--color-text)', marginBottom: '24px' }}>Inspiration</div>

      {loadingInspi ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '32px 0' }}>
          <div style={{ width: '20px', height: '20px', border: '2px solid var(--color-border)', borderTopColor: 'var(--color-text)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          <span style={{ fontFamily: "'Urbanist', sans-serif", fontSize: '13px', color: 'var(--color-text-soft)' }}>Searching for inspiration...</span>
        </div>
      ) : inspirations.length === 0 && !inspiSearched ? (
        <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: '16px', padding: '40px', textAlign: 'center' }}>
          <SparklesIcon style={{ width: '32px', height: '32px', color: 'var(--color-text-muted)', margin: '0 auto 12px', display: 'block' }} />
          <div style={{ fontFamily: "'Urbanist', sans-serif", fontWeight: 600, fontSize: '16px', color: 'var(--color-text)', marginBottom: '8px' }}>Find inspiration for this brief</div>
          <p style={{ fontFamily: "'Urbanist', sans-serif", fontSize: '13px', color: 'var(--color-text-muted)', marginBottom: '20px', lineHeight: 1.6 }}>
            Search for design references tailored to your project's tone and industry
          </p>
          <button onClick={onFetch} style={{ background: 'var(--color-text)', color: 'var(--color-bg)', border: 'none', borderRadius: '10px', padding: '10px 24px', fontFamily: "'Urbanist', sans-serif", fontWeight: 700, fontSize: '14px', cursor: 'pointer' }}>
            Find Inspiration
          </button>
        </div>
      ) : inspirations.length === 0 && inspiSearched ? (
        <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: '16px', padding: '40px', textAlign: 'center' }}>
          <SparklesIcon style={{ width: '32px', height: '32px', color: 'var(--color-text-muted)', margin: '0 auto 12px', display: 'block' }} />
          <div style={{ fontFamily: "'Urbanist', sans-serif", fontWeight: 600, fontSize: '16px', color: 'var(--color-text)', marginBottom: '8px' }}>No inspiration found</div>
          <p style={{ fontFamily: "'Urbanist', sans-serif", fontSize: '13px', color: 'var(--color-text-muted)', marginBottom: '20px', lineHeight: 1.6 }}>
            Try adding more specific tone or industry context to your brief
          </p>
          <button onClick={onFetch} style={{ background: 'var(--color-text)', color: 'var(--color-bg)', border: 'none', borderRadius: '10px', padding: '10px 24px', fontFamily: "'Urbanist', sans-serif", fontWeight: 700, fontSize: '14px', cursor: 'pointer' }}>
            Search Again
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '12px' }}>
          {inspirations.map((ins, i) => {
            const catColor = CAT_COLORS[ins.category] ?? 'var(--color-text-soft)'
            let faviconUrl = null
            try { faviconUrl = ins.url ? `https://www.google.com/s2/favicons?domain=${new URL(ins.url).hostname}&sz=32` : null } catch (_) {}
            return (
              <a key={i} href={ins.url} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', flexDirection: 'column', gap: '8px', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: '12px', padding: '14px', textDecoration: 'none', transition: 'all 0.2s' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--color-border-hover)'; e.currentTarget.style.transform = 'translateY(-2px)' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--color-border)'; e.currentTarget.style.transform = 'translateY(0)' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {faviconUrl && <img src={faviconUrl} width={16} height={16} alt="" style={{ borderRadius: '3px' }} onError={e => { e.target.style.display = 'none' }} />}
                    <span style={{ fontFamily: "'Urbanist', sans-serif", fontWeight: 700, fontSize: '13px', color: 'var(--color-text)' }}>{ins.name}</span>
                  </div>
                  {ins.category && <span style={{ fontFamily: "'Urbanist', sans-serif", fontSize: '9px', fontWeight: 700, padding: '2px 6px', borderRadius: '4px', background: `${catColor}20`, color: catColor }}>{ins.category}</span>}
                </div>
                {ins.why && <p style={{ fontFamily: "'Urbanist', sans-serif", fontSize: '12px', color: 'var(--color-text-soft)', lineHeight: 1.5, margin: 0 }}>{ins.why}</p>}
                <span style={{ fontFamily: "'Urbanist', sans-serif", fontSize: '10px', color: 'var(--color-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ins.url}</span>
              </a>
            )
          })}
        </div>
      )}
    </div>
  )
}
