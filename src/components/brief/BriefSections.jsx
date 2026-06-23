import { Button, Card, Badge } from '../ui';
import { ROLE_META, PHASE_COLORS } from '../../lib/constants';
import { labelStyle, axisLabel } from '../../lib/chartUtils';
export { labelStyle, axisLabel } from '../../lib/chartUtils';

// ─── Helper functions ──────────────────────────────────────────────────────────

export function verdictColor(v) {
  if (v === 'GOOD')  return 'var(--color-green)';
  if (v === 'FAIR')  return 'var(--color-amber)';
  if (v === 'CHAOS') return 'var(--color-purple)';
  return 'var(--color-red)';
}

export function scoreBarColor(n) {
  if (n >= 7) return 'var(--color-green)';
  if (n >= 4) return 'var(--color-amber)';
  return 'var(--color-red)';
}

export function extractHexColors(text) {
  const raw = (text || '').match(/#[0-9A-Fa-f]{6}/g) ?? [];
  return [...new Set(raw)].slice(0, 3);
}

export function buildPhases(taskDays) {
  if (!taskDays || typeof taskDays !== 'object') return [];
  const tasks = Object.entries(taskDays).map(([name, days]) => ({
    name,
    days: Number(days) || 1,
  }));
  if (!tasks.length) return [];

  const buckets = { Discovery: [], Design: [], Development: [], Launch: [] };
  const kw = {
    Discovery:   ['research', 'discover', 'audit', 'analys', 'planning', 'plan', 'strateg', 'kickoff', 'requirement', 'brief'],
    Design:      ['design', 'wireframe', 'prototype', 'ui', 'ux', 'visual', 'brand', 'style', 'mockup', 'figma', 'colour', 'color', 'typograph'],
    Development: ['develop', 'build', 'code', 'implement', 'frontend', 'backend', 'api', 'database', 'integrat', 'program', 'engineer'],
    Launch:      ['launch', 'deploy', 'release', 'go-live', 'handoff', 'qa', 'quality', 'review', 'feedback', 'test'],
  };

  tasks.forEach(t => {
    const low = t.name.toLowerCase();
    let placed = false;
    for (const [phase, words] of Object.entries(kw)) {
      if (words.some(w => low.includes(w))) {
        buckets[phase].push(t);
        placed = true;
        break;
      }
    }
    if (!placed) buckets.Development.push(t);
  });

  return Object.entries(buckets)
    .filter(([, ts]) => ts.length > 0)
    .map(([name, ts], i) => ({
      name,
      tasks: ts,
      totalDays: ts.reduce((s, t) => s + t.days, 0),
      color: PHASE_COLORS[i % PHASE_COLORS.length],
    }));
}

// ─── Internal constants ────────────────────────────────────────────────────────

const TECH_COLORS = {
  frontend:   '#5AB8FF',
  backend:    '#4DFFA0',
  database:   '#B87FFF',
  devops:     '#FFB84D',
  design:     '#FF9EF5',
  thirdParty: 'var(--color-teal)',
};

const PRIORITY_GROUPS = [
  { key: 'HIGH',   label: 'MUST HAVE',    color: '#FF4D6A' },
  { key: 'MEDIUM', label: 'SHOULD HAVE',  color: '#FFB84D' },
  { key: 'LOW',    label: 'NICE TO HAVE', color: '#606078' },
];

const CAT_COLORS = {
  'UI Reference':  '#5AB8FF',
  'Competitor':    '#FF4D6A',
  'Design System': '#B87FFF',
  'Motion':        '#FF9EF5',
  'Branding':      '#C8F55A',
  'UI':            '#5AB8FF',
  'Brand':         '#C8F55A',
  'Web':           'var(--color-teal)',
  'App':           '#4DFFA0',
};

// ─── LoadingView ──────────────────────────────────────────────────────────────

export function LoadingView({ msg }) {
  return (
    <div style={{
      height: '100%', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: '20px',
      background: 'var(--color-bg)',
    }}>
      <div className="spin" style={{
        width: '44px', height: '44px',
        border: '3px solid var(--color-border)',
        borderTopColor: 'var(--color-accent)',
        borderRadius: '50%',
      }} />
      <p style={{ fontFamily: "'Urbanist', sans-serif", fontSize: '13px', color: 'var(--color-text-soft)' }}>
        {msg}
      </p>
      <div style={{ display: 'flex', gap: '6px' }}>
        {[0, 1, 2].map(i => (
          <span key={i} style={{
            width: '6px', height: '6px', borderRadius: '50%',
            background: 'var(--color-accent)', display: 'block',
            animation: 'pulse 1.2s ease infinite',
            animationDelay: `${i * 0.2}s`,
          }} />
        ))}
      </div>
    </div>
  );
}

// ─── NumberedList ─────────────────────────────────────────────────────────────

export function NumberedList({ items, color, dimText }) {
  return (
    <div>
      {items.map((item, i) => (
        <div key={i} style={{
          display: 'flex', gap: '14px', alignItems: 'flex-start',
          padding: '10px 0',
          borderBottom: i < items.length - 1 ? '1px solid var(--color-border)' : 'none',
        }}>
          <span style={{
            fontFamily: "'Urbanist', sans-serif", fontSize: '11px',
            color, fontWeight: 700, flexShrink: 0, minWidth: '20px',
          }}>
            {String(i + 1).padStart(2, '0')}
          </span>
          <span style={{
            fontFamily: "'Urbanist', sans-serif", fontSize: '13px',
            color: dimText ? 'var(--color-text-soft)' : 'var(--color-text)', lineHeight: 1.6,
          }}>
            {item}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── ScoreStrip ───────────────────────────────────────────────────────────────

export function ScoreStrip({ s }) {
  const c = verdictColor(s.verdict);
  const bars = [
    { label: 'Clarity',           value: s.clarity },
    { label: 'Completeness',      value: s.completeness },
    { label: 'No Contradictions', value: s.contradictions },
  ];

  return (
    <div style={{
      background: 'var(--color-card)', border: '1px solid var(--color-border)', borderRadius: '14px',
      padding: '18px 24px', marginBottom: '16px',
      display: 'flex', alignItems: 'center', gap: '24px', flexWrap: 'wrap',
    }}>
      <div style={{ flexShrink: 0 }}>
        <div style={labelStyle}>BRIEF SCORE</div>
        <div style={{ fontFamily: "'Urbanist', sans-serif", fontWeight: 800, fontSize: '42px', color: c, lineHeight: 1 }}>
          {s.overall}<span style={{ fontSize: '18px', color: 'var(--color-text-muted)' }}>/10</span>
        </div>
      </div>

      <div style={{ width: '1px', height: '50px', background: 'var(--color-border)', flexShrink: 0 }} />

      <div style={{ display: 'flex', flex: 1, gap: '20px', flexWrap: 'wrap', minWidth: '200px' }}>
        {bars.map(bar => (
          <div key={bar.label} style={{ flex: 1, minWidth: '120px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
              <span style={{ fontFamily: "'Urbanist', sans-serif", fontSize: '10px', color: 'var(--color-text-muted)' }}>
                {bar.label}
              </span>
              <span style={{ fontFamily: "'Urbanist', sans-serif", fontSize: '10px', color: 'var(--color-text-soft)' }}>
                {bar.value}/10
              </span>
            </div>
            <div style={{ height: '3px', background: 'var(--color-border)', borderRadius: '2px', overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                width: `${(bar.value ?? 0) * 10}%`,
                background: scoreBarColor(bar.value),
                borderRadius: '2px',
                transition: 'width 1s ease',
              }} />
            </div>
          </div>
        ))}
      </div>

      <div style={{ flexShrink: 0 }}>
        <Badge color={c} dot pulse={s.verdict === 'CHAOS'}>{s.verdict}</Badge>
      </div>
    </div>
  );
}

// ─── ChaosBanner ─────────────────────────────────────────────────────────────

export function ChaosBanner({ r, s }) {
  return (
    <div style={{
      background: 'rgba(184,127,255,0.08)', border: '1px solid rgba(184,127,255,0.4)',
      borderRadius: '14px', padding: '18px 24px', marginBottom: '16px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: s?.chaosReason ? '10px' : '14px' }}>
        <span style={{ fontSize: '18px' }}>⚡</span>
        <span style={{ fontFamily: "'Urbanist', sans-serif", fontWeight: 700, fontSize: '14px', color: 'var(--color-purple)' }}>
          This brief is chaotic, here's how to fix it
        </span>
      </div>
      {s?.chaosReason && (
        <p style={{
          fontFamily: "'Urbanist', sans-serif", fontSize: '12px',
          color: 'var(--color-text-soft)', marginBottom: '14px', lineHeight: 1.6,
        }}>
          {s.chaosReason}
        </p>
      )}
      {r.chaosSolutions.map((sol, i) => (
        <div key={i} style={{
          display: 'flex', gap: '14px', alignItems: 'flex-start',
          padding: '10px 0',
          borderBottom: i < r.chaosSolutions.length - 1 ? '1px solid rgba(184,127,255,0.2)' : 'none',
        }}>
          <span style={{ fontFamily: "'Urbanist', sans-serif", fontSize: '11px', color: 'var(--color-accent)', fontWeight: 700, flexShrink: 0 }}>
            {String(i + 1).padStart(2, '0')}
          </span>
          <span style={{ fontFamily: "'Urbanist', sans-serif", fontSize: '13px', color: 'var(--color-text)', lineHeight: 1.6 }}>
            {sol}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── BudgetCard ───────────────────────────────────────────────────────────────

// Normalises every shape of breakdown we've ever produced into a
// flat list of { label, cost, costNum }:
//   - new schema: [{ item, low, high, notes }]
//   - older schema: { role: cost }  (Object.entries gives [role, cost])
//   - fallback: a string  ("$5000 design, $3000 dev"), skip
function normaliseBudgetBreakdown(breakdown) {
  if (!breakdown) return []
  if (Array.isArray(breakdown)) {
    return breakdown
      .map(row => {
        if (!row || typeof row !== 'object') return null
        const label = row.item || row.role || row.name || row.label || ''
        const low = row.low
        const high = row.high
        const cost = (low != null && high != null) ? `${low}-${high}` : (low ?? high ?? row.cost ?? row.amount ?? '')
        const costNum = parseFloat(String(high ?? low ?? cost).replace(/[^0-9.]/g, ''))
        return label ? { label, cost: String(cost), costNum: isNaN(costNum) ? 0 : costNum } : null
      })
      .filter(Boolean)
  }
  if (typeof breakdown === 'object') {
    return Object.entries(breakdown).map(([label, cost]) => {
      const costNum = parseFloat(String(cost).replace(/[^0-9.]/g, ''))
      return { label, cost: String(cost), costNum: isNaN(costNum) ? 0 : costNum }
    })
  }
  return []
}

export function BudgetCard({ budgetRange: br }) {
  if (!br) return null
  const breakdown = normaliseBudgetBreakdown(br.breakdown);
  const totalNum = breakdown.reduce((sum, row) => sum + (row.costNum || 0), 0);

  return (
    <Card title="Budget Estimate" style={{ marginBottom: '14px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', marginBottom: '6px' }}>
        <span style={{ fontFamily: "'Urbanist', sans-serif", fontWeight: 800, fontSize: '32px', color: 'var(--color-text)' }}>
          {br.low}-{br.high}
        </span>
        <span style={{
          fontFamily: "'Urbanist', sans-serif", fontSize: '11px', color: 'var(--color-accent)',
          background: 'var(--color-accent-bg)', border: '1px solid var(--color-accent-border)',
          borderRadius: '4px', padding: '2px 7px',
        }}>{br.currency || 'USD'}</span>
      </div>

      {breakdown.length > 0 && (
        <>
          <div style={{ ...labelStyle, marginTop: '16px' }}>BREAKDOWN</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {breakdown.map((row, i) => {
              const pct = totalNum > 0 ? (row.costNum / totalNum) * 100 : 0;
              const roleColor = ROLE_META[row.label]?.color ?? 'var(--color-accent)';
              return (
                <div key={i} style={{
                  background: 'var(--color-surface)', border: '1px solid var(--color-border)',
                  borderRadius: '10px', padding: '12px 16px',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <span style={{ fontFamily: "'Urbanist', sans-serif", fontWeight: 700, fontSize: '13px', color: 'var(--color-text)' }}>
                      {row.label}
                    </span>
                    <span style={{ fontFamily: "'Urbanist', sans-serif", fontWeight: 800, fontSize: '14px', color: 'var(--color-accent)' }}>
                      {row.cost}
                    </span>
                  </div>
                  <div style={{ height: '3px', background: 'var(--color-border)', borderRadius: '2px', overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', width: `${pct}%`,
                      background: roleColor, borderRadius: '2px',
                      transition: 'width 1s ease',
                    }} />
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </Card>
  );
}

// ─── RoadmapCard ──────────────────────────────────────────────────────────────

export function RoadmapCard({ phases, timeframe }) {
  return (
    <Card title="Product Roadmap" style={{ marginBottom: '14px' }}>
      <div style={{ display: 'flex', gap: '3px', height: '5px', borderRadius: '3px', overflow: 'hidden', marginBottom: '20px' }}>
        {phases.map((p, i) => (
          <div
            key={i}
            style={{
              flex: p.totalDays,
              background: p.color,
              borderRadius: i === 0 ? '3px 0 0 3px' : i === phases.length - 1 ? '0 3px 3px 0' : 0,
            }}
          />
        ))}
      </div>

      <div style={{ position: 'relative' }}>
        <div style={{
          position: 'absolute', left: '14px', top: '30px',
          bottom: '30px', width: '2px',
          background: 'linear-gradient(to bottom, rgba(200,245,90,0.6), rgba(200,245,90,0.1))',
        }} />

        {phases.map((phase, pi) => {
          const phaseTotal = phase.tasks.reduce((s, t) => s + t.days, 0);
          return (
            <div key={pi} style={{ position: 'relative', paddingBottom: pi < phases.length - 1 ? '24px' : 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                <div style={{
                  width: '30px', height: '30px', borderRadius: '50%', flexShrink: 0,
                  background: `${phase.color}38`, border: `2px solid ${phase.color}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: "'Urbanist', sans-serif", fontWeight: 700, fontSize: '12px',
                  color: phase.color, zIndex: 1, position: 'relative',
                }}>
                  {pi + 1}
                </div>
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontFamily: "'Urbanist', sans-serif", fontWeight: 800, fontSize: '14px', color: 'var(--color-text)' }}>
                    {phase.name}
                  </span>
                  <span style={{ fontFamily: "'Urbanist', sans-serif", fontSize: '10px', color: 'var(--color-text-muted)' }}>
                    {phase.totalDays} days
                  </span>
                </div>
              </div>

              <div style={{ marginLeft: '42px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {phase.tasks.map((task, ti) => {
                  const pct = phaseTotal > 0 ? (task.days / phaseTotal) * 100 : 0;
                  return (
                    <div
                      key={ti}
                      style={{
                        background: 'var(--color-surface)', border: '1px solid var(--color-border)',
                        borderRadius: '9px', padding: '10px 14px',
                        transition: 'border-color 0.15s',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.borderColor = `${phase.color}8C`)}
                      onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--color-border)')}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '7px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: phase.color, flexShrink: 0, display: 'block' }} />
                          <span style={{ fontFamily: "'Urbanist', sans-serif", fontWeight: 500, fontSize: '12px', color: 'var(--color-text)' }}>
                            {task.name}
                          </span>
                        </div>
                        <span style={{
                          fontFamily: "'Urbanist', sans-serif", fontSize: '10px',
                          color: phase.color, background: `${phase.color}22`,
                          borderRadius: '4px', padding: '2px 6px', flexShrink: 0,
                        }}>
                          {task.days}d
                        </span>
                      </div>
                      <div style={{ height: '2px', background: 'var(--color-border)', borderRadius: '1px', overflow: 'hidden' }}>
                        <div style={{
                          height: '100%', width: `${pct}%`,
                          background: phase.color, borderRadius: '1px',
                          transition: 'width 1s ease',
                        }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {timeframe?.total && (
        <div style={{
          marginTop: '16px', paddingTop: '14px', borderTop: '1px solid var(--color-border)',
          fontFamily: "'Urbanist', sans-serif", fontSize: '11px', color: 'var(--color-text-muted)',
        }}>
          Estimated total: <span style={{ color: 'var(--color-accent)' }}>{timeframe.total}</span>
        </div>
      )}
    </Card>
  );
}

// ─── RolesCard ────────────────────────────────────────────────────────────────

export function RolesCard({ rolesNeeded }) {
  return (
    <Card title="Roles Needed" style={{ marginBottom: '14px' }}>
      <p style={{ fontFamily: "'Urbanist', sans-serif", fontSize: '12px', color: 'var(--color-text-soft)', marginBottom: '14px' }}>
        All roles below are required for this project.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {rolesNeeded.map((role, i) => {
          const meta = ROLE_META[role];
          const color = meta?.color ?? 'var(--color-text-muted)';
          return (
            <div
              key={i}
              style={{
                background: 'var(--color-surface)',
                border: `1px solid var(--color-border)`,
                borderLeftWidth: '3px',
                borderLeftColor: color,
                borderRadius: '10px',
                padding: '12px 16px',
                display: 'flex', alignItems: 'center', gap: '14px',
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-card-hover)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'var(--color-surface)')}
            >
              <div style={{
                width: '36px', height: '36px', flexShrink: 0,
                background: `${color}22`, border: `1px solid ${color}44`,
                borderRadius: '9px', display: 'flex', alignItems: 'center',
                justifyContent: 'center', fontSize: '16px', color,
              }}>
                {meta?.icon ?? '?'}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: "'Urbanist', sans-serif", fontWeight: 700, fontSize: '13px', color: 'var(--color-text)', marginBottom: '2px' }}>
                  {role}
                </div>
                {meta?.description && (
                  <div style={{ fontFamily: "'Urbanist', sans-serif", fontSize: '11px', color: 'var(--color-text-soft)' }}>
                    {meta.description}
                  </div>
                )}
              </div>
              <Badge color={color} size="sm">REQUIRED</Badge>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// ─── TechStackCard ────────────────────────────────────────────────────────────

export function TechStackCard({ techStack }) {
  const categories = Object.entries(techStack).filter(([, items]) => items?.length > 0);
  if (!categories.length) return null;

  return (
    <Card title="Tech Stack" style={{ marginBottom: '14px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
        {categories.map(([cat, items]) => {
          const color = TECH_COLORS[cat] ?? 'var(--color-text-soft)';
          return (
            <div key={cat}>
              <div style={{ ...labelStyle, marginBottom: '8px' }}>
                {cat.replace(/([A-Z])/g, ' $1').toUpperCase()}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {items.map((item, i) => {
                  const [name, ...rest] = typeof item === 'string' ? item.split(', ') : [item];
                  return (
                    <div key={i} style={{
                      background: 'var(--color-surface)', borderRadius: '9px',
                      padding: '9px 14px', border: `1px solid ${color}38`,
                      display: 'flex', gap: '12px', alignItems: 'flex-start',
                    }}>
                      <span style={{
                        background: `${color}38`, border: `1px solid ${color}70`,
                        borderRadius: '6px', padding: '3px 9px',
                        fontFamily: "'Urbanist', sans-serif", fontSize: '11px',
                        fontWeight: 600, color, flexShrink: 0,
                      }}>
                        {name}
                      </span>
                      {rest.length > 0 && (
                        <span style={{
                          fontFamily: "'Urbanist', sans-serif", fontSize: '12px',
                          color: 'var(--color-text-soft)', lineHeight: 1.6,
                        }}>
                          {rest.join(', ')}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// ─── FeaturesCard ─────────────────────────────────────────────────────────────

export function FeaturesCard({ features }) {
  return (
    <Card title="Feature Analysis" style={{ marginBottom: '14px' }}>
      {PRIORITY_GROUPS.map(group => {
        const items = features.filter(f => f.priority === group.key);
        if (!items.length) return null;
        return (
          <div key={group.key} style={{ marginBottom: '18px' }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              marginBottom: '10px',
            }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: group.color, display: 'block' }} />
              <span style={{ fontFamily: "'Urbanist', sans-serif", fontSize: '10px', fontWeight: 700, color: group.color, letterSpacing: '0.05em' }}>
                {group.label}
              </span>
              <span style={{ fontFamily: "'Urbanist', sans-serif", fontSize: '10px', color: 'var(--color-text-muted)' }}>
                ({items.length})
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {items.map((feat, i) => (
                <div key={i} style={{
                  background: 'var(--color-surface)',
                  border: `1px solid ${group.color}38`,
                  borderRadius: '10px', padding: '14px 16px',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <span style={{ fontFamily: "'Urbanist', sans-serif", fontWeight: 700, fontSize: '13px', color: 'var(--color-text)' }}>
                      {feat.name}
                    </span>
                    <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                      <Badge color={group.color} size="sm">{group.label}</Badge>
                      {feat.complexity && (
                        <Badge color="var(--color-text-muted)" size="sm">{feat.complexity}</Badge>
                      )}
                    </div>
                  </div>
                  {feat.description && (
                    <p style={{ fontFamily: "'Urbanist', sans-serif", fontSize: '12px', color: 'var(--color-text-soft)', lineHeight: 1.7, margin: 0 }}>
                      {feat.description}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </Card>
  );
}

// ─── UserFlowCard ─────────────────────────────────────────────────────────────

export function UserFlowCard({ userFlow }) {
  return (
    <Card title="User Flow" style={{ marginBottom: '14px' }}>
      <div style={{ position: 'relative' }}>
        <div style={{
          position: 'absolute', left: '19px', top: '20px', bottom: '20px',
          width: '1px',
          background: 'linear-gradient(to bottom, rgba(200,245,90,0.6), rgba(200,245,90,0.1))',
        }} />

        {userFlow.map((step, i) => (
          <div key={i} style={{
            display: 'flex', gap: '16px', position: 'relative',
            paddingBottom: i < userFlow.length - 1 ? '20px' : 0,
          }}>
            <div style={{
              width: '38px', height: '38px', borderRadius: '50%', flexShrink: 0,
              background: 'var(--color-accent)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: "'Urbanist', sans-serif", fontWeight: 800, fontSize: '13px',
              color: 'var(--color-accent-text)',
              border: '3px solid var(--color-bg)',
              zIndex: 1,
            }}>
              {step.step ?? i + 1}
            </div>

            <div style={{ flex: 1, paddingTop: '6px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                <span style={{ fontFamily: "'Urbanist', sans-serif", fontWeight: 700, fontSize: '13px', color: 'var(--color-text)' }}>
                  {step.title ?? step.screen ?? `Step ${step.step ?? i + 1}`}
                </span>
                <Badge color="var(--color-accent)" size="sm">Step {step.step ?? i + 1}</Badge>
              </div>
              {step.description && (
                <p style={{
                  fontFamily: "'Urbanist', sans-serif", fontSize: '12px',
                  color: 'var(--color-text-soft)', lineHeight: 1.6, margin: 0,
                }}>
                  {step.description}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ─── InspirationsCard ─────────────────────────────────────────────────────────

export function InspirationsCard({ r, inspirations, loadingInspi, onFetch }) {
  return (
    <Card title="Design Inspirations" style={{ marginBottom: '14px' }}>
      {loadingInspi ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', padding: '24px 0' }}>
          <div className="spin" style={{
            width: '28px', height: '28px',
            border: '2px solid var(--color-border)', borderTopColor: 'var(--color-accent)', borderRadius: '50%',
          }} />
          <span style={{ fontFamily: "'Urbanist', sans-serif", fontSize: '12px', color: 'var(--color-text-soft)' }}>
            Searching the web for inspirations...
          </span>
        </div>
      ) : inspirations.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '20px 0' }}>
          <p style={{
            fontFamily: "'Urbanist', sans-serif", fontSize: '13px',
            color: 'var(--color-text-soft)', marginBottom: '14px', lineHeight: 1.7,
          }}>
            Let Claude search the web for real design references that match your brief's tone and keywords.
          </p>
          <Button variant="primary" onClick={onFetch}>
            Search for Inspirations
          </Button>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '14px' }}>
            {inspirations.map((ins, i) => {
              const catColor = CAT_COLORS[ins.category] ?? 'var(--color-text-soft)';
              let faviconUrl = null;
              try {
                faviconUrl = ins.url ? `https://www.google.com/s2/favicons?domain=${new URL(ins.url).hostname}&sz=32` : null;
              } catch (_) {}
              return (
                <a
                  key={i}
                  href={ins.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'flex', gap: '14px', alignItems: 'center',
                    background: 'var(--color-surface)', borderRadius: '10px', padding: '12px 16px',
                    border: '1px solid var(--color-border)', textDecoration: 'none',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.borderColor = `${catColor}99`;
                    e.currentTarget.style.background = 'var(--color-card-hover)';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.borderColor = 'var(--color-border)';
                    e.currentTarget.style.background = 'var(--color-surface)';
                  }}
                >
                  <div style={{
                    width: '36px', height: '36px', flexShrink: 0,
                    background: `${catColor}2E`, border: `1px solid ${catColor}54`,
                    borderRadius: '8px', overflow: 'hidden',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '16px', color: catColor,
                  }}>
                    {faviconUrl ? (
                      <img
                        src={faviconUrl}
                        alt=""
                        width={20} height={20}
                        onError={e => { e.target.style.display = 'none'; }}
                      />
                    ) : (
                      ins.name?.[0] ?? '?'
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px' }}>
                      <span style={{ fontFamily: "'Urbanist', sans-serif", fontWeight: 700, fontSize: '13px', color: 'var(--color-text)' }}>
                        {ins.name}
                      </span>
                      {ins.category && <Badge color={catColor} size="sm">{ins.category}</Badge>}
                    </div>
                    {ins.why && (
                      <p style={{
                        fontFamily: "'Urbanist', sans-serif", fontSize: '11px',
                        color: 'var(--color-text-soft)', lineHeight: 1.6, margin: '0 0 3px',
                      }}>
                        {ins.why}
                      </p>
                    )}
                    <span style={{
                      fontFamily: "'Urbanist', sans-serif", fontSize: '10px', color: 'var(--color-text-muted)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      display: 'block',
                    }}>
                      {ins.url}
                    </span>
                  </div>
                  <span style={{ color: 'var(--color-text-muted)', fontSize: '14px', flexShrink: 0 }}>↗</span>
                </a>
              );
            })}
          </div>
          <Button variant="ghost" onClick={onFetch}>↺ Search Again</Button>
        </>
      )}
    </Card>
  );
}
