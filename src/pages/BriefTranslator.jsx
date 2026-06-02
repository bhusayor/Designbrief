import { useState, useContext, useEffect } from 'react'
import AppContext from '../context/AppContext'
import { Button, Card } from '../components/ui'
import { fetchInspirations as apiFetchInspirations } from '../lib/api'
import {
  ScoreStrip, ChaosBanner, NumberedList,
  BudgetCard, RoadmapCard, RolesCard, TechStackCard,
  FeaturesCard, UserFlowCard, InspirationsCard,
  buildPhases, extractHexColors,
} from '../components/brief/BriefSections'
import { labelStyle, axisLabel } from '../lib/chartUtils'

/**
 * BriefTranslator — view-only page for saved history items.
 * New translations happen on the Dashboard.
 * If no matching activeChat, redirects to dashboard.
 */
export default function BriefTranslator() {
  const { navigate, history, activeChat, showToast } = useContext(AppContext)

  const [result, setResult] = useState(null)
  const [scoring, setScoring] = useState(null)
  const [inspirations, setInspirations] = useState([])
  const [loadingInspi, setLoadingInspi] = useState(false)

  // Load result from history when activeChat changes
  useEffect(() => {
    if (!activeChat) {
      navigate('dashboard')
      return
    }
    const item = history.find(
      h => h.id === activeChat && h.section === 'translator'
    )
    if (!item?.data?.result) {
      navigate('dashboard')
      return
    }
    setResult(item.data.result)
    setScoring(item.data.scoring ?? null)
    setInspirations([])
  }, [activeChat]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleFetchInspirations() {
    if (!result) return
    setLoadingInspi(true)
    try {
      const data = await apiFetchInspirations(
        result.projectTitle,
        result.toneWords,
        result.moodboardKeywords
      )
      setInspirations(Array.isArray(data) ? data : [])
    } catch {
      showToast('Could not fetch inspirations', 'error')
    }
    setLoadingInspi(false)
  }

  function handleDownload() {
    if (!result) return
    const r = result
    const s = scoring
    const lines = [
      `TRANSLATED BRIEF — ${r.projectTitle ?? 'Untitled'}`,
      '='.repeat(60),
      '',
      s ? `BRIEF SCORE: ${s.overall}/10  (${s.verdict})` : '',
      s ? `Clarity: ${s.clarity}/10 | Completeness: ${s.completeness}/10 | Contradictions: ${s.contradictions}/10` : '',
      '',
      '─── PROJECT UNDERSTANDING ───',
      r.projectUnderstanding ?? '',
      '',
      '─── TONE WORDS ───',
      (r.toneWords ?? []).join(', '),
      '',
      '─── COLOUR DIRECTION ───',
      r.colorDirection ?? '',
      '',
      '─── TYPOGRAPHY ───',
      typeof r.typography === 'string'
        ? r.typography
        : (r.typography
            ? [r.typography.displayFont, r.typography.bodyFont].filter(Boolean).join(' + ') +
              (r.typography.rationale ? ' — ' + r.typography.rationale : '')
            : ''),
      '',
      '─── MOODBOARD KEYWORDS ───',
      (r.moodboardKeywords ?? []).join(', '),
      '',
      '─── QUESTIONS TO ASK ───',
      ...(r.questionsToAsk ?? []).map((q, i) => `  ${String(i + 1).padStart(2, '0')}. ${q}`),
      '',
      '─── RED FLAGS ───',
      ...(r.redFlags ?? []).map(f => `  ⚠ ${f}`),
    ].filter(l => l !== undefined).join('\n')

    const blob = new Blob([lines], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = (r.projectTitle || 'brief').toLowerCase().replace(/\s+/g, '-') + '.txt'
    a.click()
    URL.revokeObjectURL(url)
  }

  // Loading / redirect state
  if (!result) {
    return (
      <div
        style={{
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--color-bg)',
        }}
      >
        <div
          style={{
            fontFamily: "'Urbanist', sans-serif",
            fontSize: '13px',
            color: 'var(--color-text-muted)',
          }}
        >
          Loading...
        </div>
      </div>
    )
  }

  const r = result
  const s = scoring
  const phases = buildPhases(r.timeframe?.taskDays)
  const hexColors = extractHexColors(r.colorDirection)

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: 'var(--color-bg)' }}>

      {/* Sticky header */}
      <div
        style={{
          position: 'sticky',
          top: 0,
          background: 'var(--color-bg)',
          borderBottom: '1px solid var(--color-border)',
          padding: '12px 32px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          zIndex: 10,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            onClick={() => navigate('dashboard')}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-surface)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: '6px 10px',
              borderRadius: '8px',
              color: 'var(--color-text-soft)',
              fontFamily: "'Urbanist', sans-serif",
              fontSize: '13px',
              transition: 'background 0.15s',
            }}
          >
            ← New Brief
          </button>
          <span
            style={{
              fontFamily: "'Urbanist', sans-serif",
              fontWeight: 700,
              fontSize: '16px',
              color: 'var(--color-text)',
            }}
          >
            {r.projectTitle ?? 'Untitled Project'}
          </span>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => {
              navigator.clipboard
                .writeText(window.location.origin + '/share/' + (activeChat || ''))
                .then(() => showToast('Share link copied!', 'success'))
            }}
            style={{
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: '9px',
              padding: '7px 14px',
              fontFamily: "'Urbanist', sans-serif",
              fontWeight: 600,
              fontSize: '13px',
              color: 'var(--color-text)',
              cursor: 'pointer',
            }}
          >
            Share
          </button>
          <button
            onClick={handleDownload}
            style={{
              background: 'var(--color-text)',
              color: 'var(--color-bg)',
              border: 'none',
              borderRadius: '9px',
              padding: '7px 14px',
              fontFamily: "'Urbanist', sans-serif",
              fontWeight: 600,
              fontSize: '13px',
              cursor: 'pointer',
            }}
          >
            Download
          </button>
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: '860px', margin: '0 auto', padding: '24px 40px 80px' }}>

        {s && <ScoreStrip s={s} />}
        {r.isChaos && r.chaosSolutions?.length > 0 && <ChaosBanner r={r} s={s} />}

        {r.projectUnderstanding && (
          <div
            style={{
              background: 'var(--color-card)',
              border: '1px solid var(--color-border)',
              borderRadius: '14px',
              padding: '18px 24px',
              marginBottom: '16px',
            }}
          >
            <div style={labelStyle}>PROJECT UNDERSTANDING</div>
            <p
              style={{
                fontFamily: "'Urbanist', sans-serif",
                fontSize: '15px',
                color: 'var(--color-text)',
                lineHeight: 1.85,
                margin: 0,
              }}
            >
              {r.projectUnderstanding}
            </p>
          </div>
        )}

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '14px',
            marginBottom: '14px',
          }}
        >
          <Card title="Tone & Mood">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {(r.toneWords ?? []).map(w => (
                <span
                  key={w}
                  style={{
                    background: 'var(--color-surface)',
                    border: '1px solid var(--color-border)',
                    borderRadius: '6px',
                    padding: '4px 12px',
                    fontFamily: "'Urbanist', sans-serif",
                    fontWeight: 600,
                    fontSize: '12px',
                    color: 'var(--color-text)',
                  }}
                >
                  {w}
                </span>
              ))}
            </div>
          </Card>

          <Card title="Colour Direction">
            {hexColors.length > 0 ? (
              <>
                <div style={{ display: 'flex', gap: '6px', marginBottom: '10px' }}>
                  {hexColors.map(hex => (
                    <div
                      key={hex}
                      title={hex}
                      onClick={() => navigator.clipboard.writeText(hex)}
                      style={{
                        flex: 1,
                        height: '36px',
                        borderRadius: '8px',
                        background: hex,
                        cursor: 'pointer',
                        border: '1px solid rgba(128,128,128,0.15)',
                      }}
                    />
                  ))}
                </div>
                <p
                  style={{
                    fontFamily: "'Urbanist', sans-serif",
                    fontSize: '11px',
                    color: 'var(--color-text-soft)',
                    margin: 0,
                  }}
                >
                  {r.colorDirection}
                </p>
              </>
            ) : (
              <p
                style={{
                  fontFamily: "'Urbanist', sans-serif",
                  fontSize: '12px',
                  color: 'var(--color-text-soft)',
                  lineHeight: 1.7,
                  margin: 0,
                }}
              >
                {r.colorDirection}
              </p>
            )}
          </Card>

          {/* Typography — newer briefs save typography as an object
              {displayFont, bodyFont, displayUse, bodyUse, rationale,
              platform}; older saved briefs may have it as a string.
              Render the object structurally; fall back to the string
              for legacy data. Rendering the raw object as a React
              child throws and black-screens the page. */}
          {r.typography && (
            <Card title="Typography Direction">
              {typeof r.typography === 'string' ? (
                <p style={{ fontFamily: "'Urbanist', sans-serif", fontSize: '12px', color: 'var(--color-text-soft)', lineHeight: 1.7, margin: 0 }}>
                  {r.typography}
                </p>
              ) : (
                <>
                  {(r.typography.displayFont || r.typography.bodyFont) && (
                    <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginBottom: 10 }}>
                      {r.typography.displayFont && (
                        <div>
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--color-text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 2 }}>Display</div>
                          <div style={{ fontFamily: 'var(--font-sans)', fontSize: 16, fontWeight: 700, color: 'var(--color-text)' }}>{r.typography.displayFont}</div>
                          {r.typography.displayUse && <div style={{ fontFamily: 'var(--font-sans)', fontSize: 11, color: 'var(--color-text-muted)', marginTop: 2 }}>{r.typography.displayUse}</div>}
                        </div>
                      )}
                      {r.typography.bodyFont && (
                        <div>
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--color-text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 2 }}>Body</div>
                          <div style={{ fontFamily: 'var(--font-sans)', fontSize: 16, fontWeight: 700, color: 'var(--color-text)' }}>{r.typography.bodyFont}</div>
                          {r.typography.bodyUse && <div style={{ fontFamily: 'var(--font-sans)', fontSize: 11, color: 'var(--color-text-muted)', marginTop: 2 }}>{r.typography.bodyUse}</div>}
                        </div>
                      )}
                    </div>
                  )}
                  {r.typography.rationale && (
                    <p style={{ fontFamily: "'Urbanist', sans-serif", fontSize: '12px', color: 'var(--color-text-soft)', lineHeight: 1.7, margin: 0 }}>
                      {r.typography.rationale}
                    </p>
                  )}
                </>
              )}
            </Card>
          )}

          {r.brandAxes?.length > 0 && (
            <Card title="Brand Personality">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {r.brandAxes.map((axis, i) => (
                  <div key={i}>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        marginBottom: '6px',
                      }}
                    >
                      <span style={axisLabel}>{axis.left ?? axis.label}</span>
                      <span style={axisLabel}>{axis.right ?? ''}</span>
                    </div>
                    <div
                      style={{
                        position: 'relative',
                        height: '3px',
                        background: 'var(--color-border)',
                        borderRadius: '2px',
                      }}
                    >
                      <div
                        style={{
                          position: 'absolute',
                          top: '-5px',
                          left: `calc(${axis.value ?? 50}% - 6px)`,
                          width: '13px',
                          height: '13px',
                          borderRadius: '50%',
                          background: 'var(--color-text)',
                          border: '2px solid var(--color-bg)',
                          transition: 'left 0.5s ease',
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>

        {r.moodboardKeywords?.length > 0 && (
          <Card title="Moodboard Direction" style={{ marginBottom: '14px' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '7px' }}>
              {r.moodboardKeywords.map(kw => (
                <span
                  key={kw}
                  style={{
                    background: 'var(--color-surface)',
                    border: '1px solid var(--color-border)',
                    borderRadius: '6px',
                    padding: '4px 12px',
                    fontFamily: "'Urbanist', sans-serif",
                    fontSize: '12px',
                    color: 'var(--color-text)',
                  }}
                >
                  {kw}
                </span>
              ))}
            </div>
          </Card>
        )}

        {r.clarityImprovements?.length > 0 && (
          <Card
            accent
            title="How to Improve This Brief"
            style={{ marginBottom: '14px', borderColor: 'rgba(91,155,213,0.4)' }}
          >
            <NumberedList items={r.clarityImprovements} color="var(--color-blue)" />
          </Card>
        )}

        {r.questionsToAsk?.length > 0 && (
          <Card title="Questions to Ask Your Client" style={{ marginBottom: '14px' }}>
            <NumberedList items={r.questionsToAsk} color="var(--color-text-soft)" dimText />
          </Card>
        )}

        {r.redFlags?.length > 0 && (
          <Card
            accent
            title="Red Flags"
            style={{ marginBottom: '14px', borderColor: 'rgba(255,107,107,0.4)' }}
          >
            {r.redFlags.map((flag, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  gap: '10px',
                  alignItems: 'flex-start',
                  padding: '10px 0',
                  borderBottom:
                    i < r.redFlags.length - 1 ? '1px solid var(--color-border)' : 'none',
                }}
              >
                <span style={{ color: 'var(--color-red)', flexShrink: 0 }}>⚠</span>
                <span
                  style={{
                    fontFamily: "'Urbanist', sans-serif",
                    fontSize: '13px',
                    color: 'var(--color-text)',
                  }}
                >
                  {flag}
                </span>
              </div>
            ))}
          </Card>
        )}

        {r.budgetRange && <BudgetCard budgetRange={r.budgetRange} />}
        {phases.length > 0 && <RoadmapCard phases={phases} timeframe={r.timeframe} />}
        {r.rolesNeeded?.length > 0 && <RolesCard rolesNeeded={r.rolesNeeded} />}
        {r.techStack && <TechStackCard techStack={r.techStack} />}
        {r.features?.length > 0 && <FeaturesCard features={r.features} />}
        {r.userFlow?.length > 0 && <UserFlowCard userFlow={r.userFlow} />}

        <InspirationsCard
          r={r}
          inspirations={inspirations}
          loadingInspi={loadingInspi}
          onFetch={handleFetchInspirations}
        />

        <div style={{ display: 'flex', gap: '10px', marginTop: '16px', paddingBottom: '40px' }}>
          <Button variant="secondary" onClick={() => navigate('dashboard')}>← New Brief</Button>
          <Button variant="primary" onClick={handleDownload}>⬇ Download Brief</Button>
        </div>
      </div>
    </div>
  )
}
