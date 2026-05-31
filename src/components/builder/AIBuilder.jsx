import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import AppContext from '../../context/AppContext'
import { supabase } from '../../lib/supabase'
import {
  buildSection,
  assembleWebsite,
  approveSection,
  skipSection,
  markChangesRequested,
  pauseBuild,
  resumeBuild,
  completeBuild,
} from '../../lib/aiBuildEngine'
import { fetchBriefContext } from '../../lib/briefContext'
import useProximity from '../../hooks/useProximity'
import StaggerGrid, { StaggerItem } from '../StaggerGrid'
import useScramble from '../../hooks/useScramble'
import {
  SparklesIcon,
  XMarkIcon,
  PauseIcon,
  PlayIcon,
  CheckCircleIcon,
  ArrowPathIcon,
  ForwardIcon,
  PaperAirplaneIcon,
  ComputerDesktopIcon,
  DeviceTabletIcon,
  DevicePhoneMobileIcon,
  RocketLaunchIcon,
} from '@heroicons/react/24/outline'
import PublishModal from './PublishModal'
import BuilderChat from './BuilderChat'

// ────────────────────────────────────────────────────────────────────
// AIBuilder — full-screen overlay that drives the AI Builder loop:
//   - Left: build queue with per-task status
//   - Right top: live preview iframe (streams the current section)
//   - Right bottom: approval panel (Approve / Request Changes / Skip)
//
// Owns the build orchestration: picks the next 'queued' section,
// streams it via buildSection(), and (in task_by_task mode) waits for
// the user to approve before starting the next one. In build_all mode
// it runs straight through.
//
// Subscribes to build_sections realtime so other tabs / cross-device
// updates show up immediately, and so new tasks added to the kanban
// while the builder is open join the queue with a ✨ Synced toast.
// ────────────────────────────────────────────────────────────────────

const DEVICE_WIDTHS = {
  desktop: '100%',
  tablet: 820,
  mobile: 390,
}

export default function AIBuilder({ build, project, onClose }) {
  const { authUser, workspace, showToast, showAIError, saveProject } = useContext(AppContext)
  const [sections, setSections] = useState([])
  const [briefContext, setBriefContext] = useState(null)
  const [buildState, setBuildState] = useState(build)
  const [device, setDevice] = useState('desktop')
  const [streamingId, setStreamingId] = useState(null)
  const [liveHtml, setLiveHtml] = useState('') // in-flight chunks
  const [changeRequestFor, setChangeRequestFor] = useState(null)
  const [changeRequestText, setChangeRequestText] = useState('')
  const [showPublish, setShowPublish] = useState(false)
  const [skipConfirm, setSkipConfirm] = useState(null)
  // BuilderChat — collapsible AI assistant under the approval panel.
  const [chatOpen, setChatOpen] = useState(true)

  // macOS-dock proximity for the queue rows on the left rail.
  useProximity('.build-queue-item', {
    distance: 90,
    maxScale: 1.03,
    maxLift: -2,
    speed: 0.2,
    glow: false,
    tilt: false,
  }, [build?.id])
  const abortRef = useRef(null)
  const runningRef = useRef(false)
  const seenTaskIdsRef = useRef(new Set())

  // ── Initial load ──────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (!build?.id || !project?.id) return
      const [ctx, sec] = await Promise.all([
        fetchBriefContext(project.id),
        supabase
          .from('build_sections')
          .select('*')
          .eq('build_id', build.id)
          .order('position', { ascending: true })
          .then(r => r.data || []),
      ])
      if (cancelled) return
      setBriefContext(ctx)
      setSections(sec)
      sec.forEach(s => seenTaskIdsRef.current.add(s.task_id))
    })()
    return () => { cancelled = true }
  }, [build?.id, project?.id])

  // ── Realtime: build_sections (other tabs editing same build) ─────
  useEffect(() => {
    if (!build?.id) return
    const ch = supabase
      .channel(`build-sections:${build.id}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'build_sections',
        filter: `build_id=eq.${build.id}`,
      }, payload => {
        if (payload.eventType === 'INSERT') {
          setSections(prev => prev.some(s => s.id === payload.new.id) ? prev : [...prev, payload.new].sort((a, b) => a.position - b.position))
          if (payload.new.task_id) seenTaskIdsRef.current.add(payload.new.task_id)
        } else if (payload.eventType === 'UPDATE') {
          // Skip realtime echoes for the section we're actively streaming —
          // our local liveHtml is the source of truth there.
          if (payload.new.id === streamingId) {
            // still merge non-code fields
            setSections(prev => prev.map(s => s.id === payload.new.id ? { ...s, status: payload.new.status, approved_code: payload.new.approved_code, approved_at: payload.new.approved_at, approved_by: payload.new.approved_by } : s))
          } else {
            setSections(prev => prev.map(s => s.id === payload.new.id ? { ...s, ...payload.new } : s))
          }
        } else if (payload.eventType === 'DELETE') {
          setSections(prev => prev.filter(s => s.id !== payload.old.id))
        }
      })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [build?.id, streamingId])

  // ── Realtime: new tasks added to this project's TODO column ──────
  useEffect(() => {
    if (!build?.id || !project?.id) return
    const ch = supabase
      .channel(`build-task-sync:${project.id}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'tasks',
        filter: `project_id=eq.${project.id}`,
      }, async (payload) => {
        const t = payload.new
        if (!t) return
        const col = String(t.column_name || '').toLowerCase()
        if (col !== 'to do' && col !== 'todo') return
        if (seenTaskIdsRef.current.has(t.id)) return
        seenTaskIdsRef.current.add(t.id)

        // Append a queued section row at the end of the build.
        const nextPos = sections.length
          ? Math.max(...sections.map(s => s.position)) + 1
          : 0
        const { data: inserted } = await supabase
          .from('build_sections')
          .insert({
            build_id: build.id,
            task_id: t.id,
            task_title: t.title || 'Untitled section',
            position: nextPos,
            status: 'queued',
          })
          .select('*')
          .single()
        if (inserted) {
          showToast?.(`✨ "${inserted.task_title}" added to build queue`, 'info')
        }
      })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [build?.id, project?.id, sections.length])

  // ── Realtime: this ai_builds row (status changes from another tab) ─
  useEffect(() => {
    if (!build?.id) return
    const ch = supabase
      .channel(`build-row:${build.id}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'ai_builds',
        filter: `id=eq.${build.id}`,
      }, payload => {
        setBuildState(prev => ({ ...prev, ...payload.new }))
      })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [build?.id])

  // ── Fetch the task row so we have description + ai_prompt ────────
  async function loadTask(taskId) {
    if (!taskId) return null
    const { data } = await supabase.from('tasks').select('*').eq('id', taskId).single()
    return data || null
  }

  // ── Run the next queued section ──────────────────────────────────
  const runNextSection = useCallback(async () => {
    if (runningRef.current) return
    if (!buildState || buildState.status === 'paused' || buildState.status === 'complete') return
    if (!briefContext) return

    const ordered = [...sections].sort((a, b) => a.position - b.position)
    const next = ordered.find(s => s.status === 'queued' || s.status === 'changes')
    if (!next) {
      // All sections settled. If all are approved or skipped, mark
      // the build complete.
      const allDone = ordered.length > 0 && ordered.every(s => s.status === 'approved' || s.status === 'skipped')
      if (allDone) await completeBuild(buildState.id)
      return
    }

    runningRef.current = true
    setStreamingId(next.id)
    setLiveHtml('')
    const ctrl = new AbortController()
    abortRef.current = ctrl

    try {
      const task = await loadTask(next.task_id)
      const previousApproved = ordered
        .filter(s => s.status === 'approved' && s.position < next.position)
      await buildSection({
        section: next,
        task,
        briefContext,
        previousSections: previousApproved,
        totalTasks: ordered.length,
        buildId: buildState.id,
        changeRequest: next.status === 'changes' ? next.change_request : null,
        onProgress: html => setLiveHtml(html),
        signal: ctrl.signal,
      })
    } catch (e) {
      console.error('[AIBuilder] section failed:', e)
      // Drop status back so the user can retry from the row.
      await supabase
        .from('build_sections')
        .update({ status: 'queued' })
        .eq('id', next.id)
      // Show the user-safe banner with a retry that resumes the queue.
      showAIError?.(e, () => { runningRef.current = false; runNextSection() })
    } finally {
      runningRef.current = false
      setStreamingId(null)
      setLiveHtml('')
      abortRef.current = null

      // In build_all mode keep going automatically.
      if (buildState?.build_mode === 'build_all') {
        // Mark this section approved immediately so the loop advances.
        // The user can still bulk-review at the end.
        if (next?.id) {
          try { await approveSection({ sectionId: next.id, userId: authUser?.id }) } catch {}
        }
        // Re-enter the loop on next tick so state has flushed.
        setTimeout(() => runNextSection(), 100)
      }
    }
  }, [sections, briefContext, buildState, authUser?.id, showToast])

  // Kick off when sections + brief are ready and the build is running.
  useEffect(() => {
    if (!buildState || buildState.status !== 'running') return
    if (!briefContext || sections.length === 0) return
    if (streamingId) return
    if (changeRequestFor) return // pause auto-run while user is typing a change
    const next = sections.find(s => s.status === 'queued' || s.status === 'changes')
    if (next) runNextSection()
  }, [sections, briefContext, buildState?.status, streamingId, changeRequestFor, runNextSection])

  // ── Approval / change / skip handlers ────────────────────────────
  async function handleApprove(section) {
    try {
      await approveSection({ sectionId: section.id, userId: authUser?.id })
      // Also move the linked kanban task into Done.
      if (section.task_id) {
        try {
          await supabase
            .from('tasks')
            .update({
              column_name: 'Done',
              completed: true,
              completed_at: new Date().toISOString(),
            })
            .eq('id', section.task_id)
        } catch {}
      }
      showToast?.(`✓ "${section.task_title}" approved`, 'success')
    } catch (e) {
      showToast?.('Approve failed: ' + e.message, 'error')
    }
  }

  async function handleRequestChanges(section) {
    if (!changeRequestText.trim()) return
    try {
      await markChangesRequested({ sectionId: section.id, changeRequest: changeRequestText.trim() })
      setChangeRequestFor(null)
      setChangeRequestText('')
      showToast?.('Rebuilding with your changes…', 'info')
    } catch (e) {
      showToast?.('Could not save change request: ' + e.message, 'error')
    }
  }

  async function handleSkip(section) {
    try {
      await skipSection(section.id)
      setSkipConfirm(null)
      showToast?.(`Skipped "${section.task_title}"`, 'info')
    } catch (e) {
      showToast?.('Skip failed: ' + e.message, 'error')
    }
  }

  // BuilderChat → save the edited HTML back to the section so the
  // iframe + DB reflect it. We persist into generated_code AND, when
  // the section was already approved, into approved_code too so the
  // published bundle picks up the new version.
  async function handleSectionEdit(sectionId, newHtml) {
    if (!sectionId || !newHtml) return
    setSections(prev => prev.map(s => {
      if (s.id !== sectionId) return s
      const wasApproved = s.status === 'approved'
      return {
        ...s,
        generated_code: newHtml,
        approved_code: wasApproved ? newHtml : s.approved_code,
      }
    }))
    try {
      const { data: row } = await supabase
        .from('build_sections')
        .select('status')
        .eq('id', sectionId)
        .single()
      const updates = { generated_code: newHtml }
      if (row?.status === 'approved') updates.approved_code = newHtml
      await supabase.from('build_sections').update(updates).eq('id', sectionId)
    } catch (e) {
      console.warn('[AIBuilder] section edit persist failed:', e?.message)
    }
  }

  async function handlePauseResume() {
    if (!buildState) return
    if (buildState.status === 'paused') {
      await resumeBuild(buildState.id)
      setBuildState(prev => ({ ...prev, status: 'running' }))
    } else {
      try { abortRef.current?.abort() } catch {}
      await pauseBuild(buildState.id)
      setBuildState(prev => ({ ...prev, status: 'paused' }))
    }
  }

  // ── Derived state ────────────────────────────────────────────────
  const orderedSections = useMemo(
    () => [...sections].sort((a, b) => a.position - b.position),
    [sections]
  )
  const approvedCount = orderedSections.filter(s => s.status === 'approved').length
  const skippedCount = orderedSections.filter(s => s.status === 'skipped').length
  const totalCount = orderedSections.length
  const settledCount = approvedCount + skippedCount
  const allSettled = totalCount > 0 && settledCount === totalCount
  const allApproved = totalCount > 0 && approvedCount + skippedCount === totalCount && approvedCount > 0

  // The section the approval panel speaks for: either the one we're
  // actively streaming (shows its live html) or the latest in-review.
  const sectionInReview = orderedSections.find(s => s.id === streamingId)
    || orderedSections.find(s => s.status === 'review')
    || null

  // Live HTML: if we're streaming, use the in-flight buffer for THIS
  // section + the assembled rest. Otherwise just assemble.
  const previewSections = useMemo(() => {
    if (!streamingId) return orderedSections
    return orderedSections.map(s => s.id === streamingId ? { ...s, generated_code: liveHtml, status: 'building' } : s)
  }, [orderedSections, streamingId, liveHtml])

  const previewHtml = useMemo(
    () => assembleWebsite(previewSections, briefContext),
    [previewSections, briefContext]
  )

  // ── Render ───────────────────────────────────────────────────────
  return (
    <div style={overlayStyle}>
      {/* Header */}
      <div style={headerStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <span style={{
            width: 30, height: 30, borderRadius: 9,
            background: 'linear-gradient(135deg, #8B5CF6, #6366F1)',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0, boxShadow: '0 4px 12px rgba(124,58,237,0.35)',
          }}>
            <SparklesIcon style={{ width: 15, height: 15, color: 'white' }} />
          </span>
          <span style={{
            fontFamily: 'var(--font-sans)', fontWeight: 800, fontSize: 14,
            color: 'var(--color-text)', letterSpacing: '-0.01em',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            AI Builder · {project?.title || 'Untitled'}
          </span>
          <StatusPill status={buildState?.status || 'idle'} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={handlePauseResume} style={headerBtn}>
            {buildState?.status === 'paused'
              ? <><PlayIcon style={{ width: 13, height: 13 }} /> Resume</>
              : <><PauseIcon style={{ width: 13, height: 13 }} /> Pause</>}
          </button>
          <button onClick={onClose} style={headerBtn} title="Minimise (build keeps running)">
            <XMarkIcon style={{ width: 14, height: 14 }} />
          </button>
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {/* LEFT — queue */}
        <aside style={leftPanelStyle}>
          <div style={{ marginBottom: 14 }}>
            <div style={{
              fontFamily: 'var(--font-sans)', fontWeight: 800, fontSize: 13,
              color: 'var(--color-text)', letterSpacing: '-0.01em',
            }}>
              Build Queue
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--color-text-muted)', marginTop: 2 }}>
              {totalCount} {totalCount === 1 ? 'task' : 'tasks'} · {approvedCount} approved
            </div>
            <ProgressBar approved={approvedCount} skipped={skippedCount} total={totalCount} />
            {allApproved && (
              <button
                onClick={() => setShowPublish(true)}
                style={{
                  marginTop: 12, width: '100%',
                  padding: '10px 12px',
                  background: 'linear-gradient(135deg, #16A34A, #22C55E)',
                  color: 'white', border: 'none', borderRadius: 10,
                  cursor: 'pointer',
                  fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 700,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  boxShadow: '0 4px 14px rgba(22,163,74,0.30)',
                }}
              >
                <RocketLaunchIcon style={{ width: 14, height: 14 }} /> Publish Website
              </button>
            )}
          </div>
          <StaggerGrid speed="fast" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {orderedSections.map((s, i) => (
              <StaggerItem key={s.id} variant="itemUp">
                <QueueRow
                  index={i}
                  section={s}
                  isStreaming={s.id === streamingId}
                />
              </StaggerItem>
            ))}
            {orderedSections.length === 0 && (
              <div style={{ fontSize: 12.5, color: 'var(--color-text-muted)', padding: 12 }}>
                Add tasks to the TODO column and they'll show up here.
              </div>
            )}
          </StaggerGrid>
        </aside>

        {/* RIGHT — preview + approval */}
        <main style={rightPanelStyle}>
          {/* Device toggle */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6,
            padding: '10px 16px 0',
          }}>
            <DeviceBtn active={device === 'desktop'} onClick={() => setDevice('desktop')} icon={ComputerDesktopIcon} label="Desktop" />
            <DeviceBtn active={device === 'tablet'} onClick={() => setDevice('tablet')} icon={DeviceTabletIcon} label="Tablet" />
            <DeviceBtn active={device === 'mobile'} onClick={() => setDevice('mobile')} icon={DevicePhoneMobileIcon} label="Mobile" />
          </div>

          {/* Preview iframe */}
          <div style={{
            flex: 1,
            padding: 16,
            background: 'var(--color-surface)',
            overflowY: 'auto',
            display: 'flex', justifyContent: 'center',
            minHeight: 0,
          }}>
            <div style={{
              width: device === 'desktop' ? '100%' : DEVICE_WIDTHS[device],
              maxWidth: '100%',
              borderRadius: 14,
              overflow: 'hidden',
              background: 'white',
              boxShadow: '0 18px 48px rgba(0,0,0,0.22)',
              border: '1px solid var(--color-border)',
              transition: 'width 0.25s ease',
            }}>
              {orderedSections.length === 0 ? (
                <EmptyPreview />
              ) : (
                <iframe
                  title="AI build preview"
                  srcDoc={previewHtml}
                  sandbox="allow-scripts allow-same-origin"
                  style={{ width: '100%', height: '100%', minHeight: '70vh', border: 'none', background: 'white', display: 'block' }}
                />
              )}
            </div>
          </div>

          {/* Approval panel */}
          {sectionInReview && (
            <ApprovalPanel
              section={sectionInReview}
              streaming={sectionInReview.id === streamingId}
              changeOpen={changeRequestFor === sectionInReview.id}
              changeText={changeRequestText}
              onChangeText={setChangeRequestText}
              onApprove={() => handleApprove(sectionInReview)}
              onOpenChange={() => { setChangeRequestFor(sectionInReview.id); setChangeRequestText('') }}
              onCloseChange={() => { setChangeRequestFor(null); setChangeRequestText('') }}
              onSubmitChange={() => handleRequestChanges(sectionInReview)}
              onSkip={() => setSkipConfirm(sectionInReview)}
            />
          )}

          {/* AI assistant chat — collapsible, sits under the approval
              panel. Speaks for whichever section the preview is showing
              (the in-review one, or the last approved if nothing else is
              up for review). */}
          {(() => {
            const chatSection = sectionInReview
              || orderedSections.find(s => s.status === 'approved' && s.generated_code)
              || null
            if (!chatSection) return null
            if (!chatOpen) {
              return (
                <div style={{
                  flexShrink: 0, padding: '10px 16px',
                  borderTop: '1px solid var(--color-border)',
                  background: 'var(--color-card)',
                  display: 'flex', justifyContent: 'flex-start',
                }}>
                  <BuilderChat collapsed onToggle={() => setChatOpen(true)} />
                </div>
              )
            }
            return (
              <div style={{
                flexShrink: 0,
                maxHeight: 360,
                minHeight: 240,
                display: 'flex', flexDirection: 'column',
              }}>
                <BuilderChat
                  section={chatSection}
                  briefContext={briefContext}
                  projectName={project?.title || ''}
                  onSectionUpdate={(html) => handleSectionEdit(chatSection.id, html)}
                  onToggle={() => setChatOpen(false)}
                />
              </div>
            )
          })()}
        </main>
      </div>

      {/* Skip confirm modal */}
      {skipConfirm && (
        <SkipConfirm
          section={skipConfirm}
          onCancel={() => setSkipConfirm(null)}
          onConfirm={() => handleSkip(skipConfirm)}
        />
      )}

      {/* Publish modal */}
      {showPublish && (
        <PublishModal
          open={showPublish}
          build={buildState}
          briefContext={briefContext}
          sections={orderedSections.filter(s => s.status === 'approved')}
          projectName={project?.title || ''}
          onClose={() => setShowPublish(false)}
          onPublished={(updated) => {
            setBuildState(prev => ({ ...prev, ...updated }))
            setShowPublish(false)
          }}
        />
      )}
    </div>
  )
}

// ──── Subcomponents ─────────────────────────────────────────────────

function QueueRow({ index, section, isStreaming }) {
  const status = isStreaming ? 'building' : section.status
  const meta = STATUS_META[status] || STATUS_META.queued
  return (
    <div className="build-queue-item" style={{
      display: 'flex', alignItems: 'flex-start', gap: 10,
      padding: '10px 12px',
      background: status === 'building' ? 'rgba(139,92,246,0.06)' : 'var(--color-surface)',
      border: '1px solid ' + (status === 'building' ? 'rgba(139,92,246,0.30)' : 'var(--color-border)'),
      borderRadius: 10,
      transition: 'background 0.15s, border-color 0.15s',
    }}>
      <span style={{
        width: 10, height: 10, borderRadius: 100,
        background: meta.dot,
        flexShrink: 0, marginTop: 5,
        animation: status === 'building' ? 'buildPulse 1.2s ease-in-out infinite' : 'none',
        boxShadow: status === 'building' ? '0 0 0 4px rgba(139,92,246,0.15)' : 'none',
      }} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{
          fontFamily: 'var(--font-sans)', fontSize: 12.5, fontWeight: 700,
          color: 'var(--color-text)', letterSpacing: '-0.005em',
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <span style={{ color: 'var(--color-text-muted)', fontWeight: 600 }}>{index + 1}.</span>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {section.task_title}
          </span>
        </div>
        <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 2 }}>
          {meta.label}
        </div>
      </div>
    </div>
  )
}

function ProgressBar({ approved, skipped, total }) {
  const pct = total === 0 ? 0 : Math.round(((approved + skipped) / total) * 100)
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{
        height: 6, borderRadius: 100,
        background: 'var(--color-surface-2)',
        overflow: 'hidden',
      }}>
        <div style={{
          width: pct + '%', height: '100%',
          background: 'linear-gradient(90deg, #8B5CF6, #6366F1)',
          transition: 'width 0.3s ease',
        }} />
      </div>
      <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 4 }}>
        {approved + skipped} of {total} {(approved + skipped) === 1 ? 'task' : 'tasks'}
      </div>
    </div>
  )
}

function StatusPill({ status }) {
  const palette = {
    running:  { bg: 'rgba(139,92,246,0.12)', color: '#8B5CF6', label: 'Building' },
    paused:   { bg: 'rgba(245,158,11,0.12)', color: '#F59E0B', label: 'Paused' },
    complete: { bg: 'rgba(34,197,94,0.12)',  color: '#16A34A', label: 'Complete' },
    idle:     { bg: 'var(--color-surface)',  color: 'var(--color-text-muted)', label: 'Idle' },
  }[status] || { bg: 'var(--color-surface)', color: 'var(--color-text-muted)', label: status }
  return (
    <span style={{
      marginLeft: 8,
      fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 800,
      letterSpacing: '0.06em', textTransform: 'uppercase',
      background: palette.bg, color: palette.color,
      border: '1px solid currentColor',
      padding: '2px 8px', borderRadius: 100,
    }}>
      {palette.label}
    </span>
  )
}

function ApprovalPanel({ section, streaming, changeOpen, changeText, onChangeText, onApprove, onOpenChange, onCloseChange, onSubmitChange, onSkip }) {
  // useScramble lives at the top of ApprovalPanel so the hook order is
  // stable. The hook returns the target text immediately when not
  // streaming, so we can safely render it conditionally.
  const liveLabel = `Building ${section.task_title}…`
  const { displayText } = useScramble(liveLabel, { duration: 480, trigger: streaming })

  if (streaming) {
    return (
      <div style={approvalPanelStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--color-text-muted)', fontSize: 13, fontFamily: 'var(--font-mono)' }}>
          <span style={{
            width: 8, height: 8, borderRadius: 100, background: '#8B5CF6',
            animation: 'buildPulse 1.2s ease-in-out infinite',
          }} />
          {displayText}
        </div>
      </div>
    )
  }
  if (section.status !== 'review') return null

  return (
    <div style={approvalPanelStyle}>
      {!changeOpen ? (
        <>
          <div style={{ marginBottom: 12 }}>
            <div style={{
              fontFamily: 'var(--font-sans)', fontWeight: 800, fontSize: 14,
              color: 'var(--color-text)', letterSpacing: '-0.01em',
            }}>
              ✦ {section.task_title} is ready
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--color-text-muted)', marginTop: 4 }}>
              Review the preview above and choose what to do next.
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={onApprove} style={primaryBtn}>
              <CheckCircleIcon style={{ width: 14, height: 14 }} /> Approve & Continue
            </button>
            <button onClick={onOpenChange} style={secondaryBtn}>
              <ArrowPathIcon style={{ width: 14, height: 14 }} /> Request Changes
            </button>
            <button onClick={onSkip} style={ghostBtn}>
              <ForwardIcon style={{ width: 14, height: 14 }} /> Skip
            </button>
          </div>
        </>
      ) : (
        <>
          <div style={{
            fontFamily: 'var(--font-sans)', fontWeight: 700, fontSize: 13,
            color: 'var(--color-text)', marginBottom: 8,
          }}>
            What needs to change?
          </div>
          <textarea
            value={changeText}
            onChange={e => onChangeText(e.target.value)}
            autoFocus
            placeholder="Make the background darker and increase the headline size."
            rows={3}
            style={{
              width: '100%', boxSizing: 'border-box',
              padding: '10px 12px',
              background: 'var(--color-bg)', color: 'var(--color-text)',
              border: '1px solid var(--color-border)', borderRadius: 9,
              fontFamily: 'var(--font-sans)', fontSize: 13,
              resize: 'vertical', outline: 'none',
            }}
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 10, justifyContent: 'flex-end' }}>
            <button onClick={onCloseChange} style={ghostBtn}>Cancel</button>
            <button
              onClick={onSubmitChange}
              disabled={!changeText.trim()}
              style={{ ...primaryBtn, opacity: changeText.trim() ? 1 : 0.55, cursor: changeText.trim() ? 'pointer' : 'not-allowed' }}
            >
              <PaperAirplaneIcon style={{ width: 13, height: 13 }} /> Send
            </button>
          </div>
        </>
      )}
    </div>
  )
}

function SkipConfirm({ section, onCancel, onConfirm }) {
  return (
    <div onClick={onCancel} style={{
      position: 'fixed', inset: 0, zIndex: 1200,
      background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(6px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: '100%', maxWidth: 380,
        background: 'var(--color-bg)',
        border: '1px solid var(--color-border)',
        borderRadius: 14, padding: 20, fontFamily: 'var(--font-sans)',
      }}>
        <h3 style={{ margin: 0, fontWeight: 800, fontSize: 15, color: 'var(--color-text)' }}>
          Skip "{section.task_title}"?
        </h3>
        <p style={{ margin: '6px 0 16px', fontSize: 12.5, color: 'var(--color-text-muted)', lineHeight: 1.55 }}>
          You can rebuild it later from the queue.
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onCancel} style={ghostBtn}>Cancel</button>
          <button onClick={onConfirm} style={{ ...primaryBtn, background: '#EF4444', boxShadow: 'none' }}>Skip</button>
        </div>
      </div>
    </div>
  )
}

function EmptyPreview() {
  return (
    <div style={{
      padding: 40, fontFamily: 'var(--font-sans)',
      textAlign: 'center', color: '#6B7280',
    }}>
      <div style={{ fontSize: 32, marginBottom: 12 }}>✦</div>
      <div style={{ fontWeight: 700, fontSize: 14, color: '#111' }}>
        Waiting for the first section…
      </div>
      <div style={{ fontSize: 12, marginTop: 6 }}>
        Sections will appear here as the AI builds them.
      </div>
    </div>
  )
}

function DeviceBtn({ active, onClick, icon: Icon, label }) {
  return (
    <button
      onClick={onClick}
      title={label}
      style={{
        padding: '6px 10px',
        background: active ? 'rgba(139,92,246,0.12)' : 'transparent',
        color: active ? '#8B5CF6' : 'var(--color-text-muted)',
        border: '1px solid ' + (active ? 'rgba(139,92,246,0.40)' : 'var(--color-border)'),
        borderRadius: 8, cursor: 'pointer',
        display: 'inline-flex', alignItems: 'center', gap: 5,
        fontFamily: 'var(--font-sans)', fontSize: 11.5, fontWeight: 700,
      }}
    >
      <Icon style={{ width: 13, height: 13 }} />
      <span className="device-label" style={{ }}>{label}</span>
    </button>
  )
}

// ──── Style constants ───────────────────────────────────────────────

const overlayStyle = {
  position: 'fixed', inset: 0, zIndex: 1000,
  background: 'var(--color-bg)',
  display: 'flex', flexDirection: 'column',
  fontFamily: 'var(--font-sans)',
  animation: 'fadeUp 220ms cubic-bezier(0.16, 1, 0.3, 1)',
}

const headerStyle = {
  height: 56, flexShrink: 0,
  background: 'var(--color-card)',
  borderBottom: '1px solid var(--color-border)',
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  padding: '0 20px', gap: 12,
}

const headerBtn = {
  padding: '7px 11px',
  background: 'transparent',
  border: '1px solid var(--color-border)',
  borderRadius: 9,
  color: 'var(--color-text-muted)',
  cursor: 'pointer',
  fontFamily: 'var(--font-sans)', fontSize: 12, fontWeight: 700,
  display: 'inline-flex', alignItems: 'center', gap: 6,
}

const leftPanelStyle = {
  width: '34%', minWidth: 270, maxWidth: 380,
  borderRight: '1px solid var(--color-border)',
  padding: '16px 14px',
  overflowY: 'auto',
  background: 'var(--color-card)',
}

const rightPanelStyle = {
  flex: 1, display: 'flex', flexDirection: 'column',
  minWidth: 0,
}

const approvalPanelStyle = {
  flexShrink: 0,
  padding: '14px 18px 18px',
  borderTop: '1px solid var(--color-border)',
  background: 'var(--color-card)',
}

const primaryBtn = {
  padding: '9px 14px',
  background: 'linear-gradient(135deg, #8B5CF6, #6366F1)',
  color: 'white', border: 'none', borderRadius: 10, cursor: 'pointer',
  fontFamily: 'var(--font-sans)', fontSize: 12.5, fontWeight: 700,
  display: 'inline-flex', alignItems: 'center', gap: 6,
  boxShadow: '0 4px 12px rgba(124,58,237,0.30)',
}

const secondaryBtn = {
  padding: '9px 14px',
  background: 'transparent', color: 'var(--color-text)',
  border: '1px solid var(--color-border)', borderRadius: 10,
  cursor: 'pointer',
  fontFamily: 'var(--font-sans)', fontSize: 12.5, fontWeight: 700,
  display: 'inline-flex', alignItems: 'center', gap: 6,
}

const ghostBtn = {
  padding: '9px 12px',
  background: 'transparent', color: 'var(--color-text-muted)',
  border: 'none', borderRadius: 10, cursor: 'pointer',
  fontFamily: 'var(--font-sans)', fontSize: 12.5, fontWeight: 600,
  display: 'inline-flex', alignItems: 'center', gap: 6,
}

const STATUS_META = {
  queued:   { dot: 'var(--color-text-muted)', label: 'Queued' },
  building: { dot: '#8B5CF6',                  label: 'Building…' },
  review:   { dot: '#F59E0B',                  label: 'Review needed' },
  changes:  { dot: '#F97316',                  label: 'Changes requested' },
  approved: { dot: '#16A34A',                  label: 'Approved' },
  skipped:  { dot: 'var(--color-border)',      label: 'Skipped' },
}
