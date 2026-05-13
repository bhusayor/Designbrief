import React, { useState } from 'react'
import {
  Card, Label, safeText, safeArr,
  WorkflowSection, CompetitorsSection, InspirationSection,
  GanttSection, BudgetSection, TeamRolesSection,
} from './shared'
import { ArrowRightIcon, ClockIcon } from '@heroicons/react/24/outline'

export default function SprintPlanRenderer({ result }) {
  if (!result) return null
  const r = result
  const accent = '#16a34a'
  const [openSprint, setOpenSprint] = useState(0)

  // Build sprint weeks from timeframe.taskDays
  const taskDays = r.timeframe?.taskDays || {}
  const tasks = Object.entries(taskDays).map(([name, days]) => ({
    name,
    days: Number(days) || 1,
  }))

  // Group into weekly sprints (~5 working days each)
  const sprints = []
  let week = [], dayCount = 0, weekNum = 1
  tasks.forEach(t => {
    week.push(t)
    dayCount += t.days
    if (dayCount >= 5) {
      sprints.push({ week: weekNum, tasks: week, days: dayCount })
      week = []
      dayCount = 0
      weekNum++
    }
  })
  if (week.length > 0) {
    sprints.push({ week: weekNum, tasks: week, days: dayCount })
  }

  const totalWeeks = r.timeframe?.total || sprints.length + ' weeks'

  return (
    <div style={{ fontFamily: 'var(--font-sans)', maxWidth: 800 }}>

      {/* Header banner */}
      <div style={{
        background: 'linear-gradient(135deg, #16a34a12 0%, #22c55e08 100%)',
        border: '1px solid #16a34a25',
        borderRadius: 'var(--radius-xl)',
        padding: '20px 24px',
        marginBottom: 16,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 12,
      }}>
        <div>
          <div style={{
            fontWeight: 800, fontSize: 20,
            letterSpacing: '-0.03em',
            color: 'var(--color-text)', marginBottom: 4,
          }}>
            {safeText(r.projectTitle, 'Sprint Plan')}
          </div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 5,
            fontSize: 13, color: 'var(--color-text-muted)',
          }}>
            <ClockIcon style={{ width: 13, height: 13 }} />
            {totalWeeks} total · {sprints.length} sprints · {tasks.length} tasks
          </div>
        </div>
        <button style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '8px 16px',
          background: accent, color: 'white',
          border: 'none', borderRadius: 'var(--radius-md)',
          cursor: 'pointer',
          fontFamily: 'var(--font-sans)', fontSize: 12, fontWeight: 700,
        }}>
          <ArrowRightIcon style={{ width: 13, height: 13 }} />
          Send to Board
        </button>
      </div>

      {/* Sprint weeks */}
      {sprints.length > 0 ? sprints.map((sprint, si) => (
        <div key={si} style={{
          marginBottom: 10,
          background: 'var(--color-card)',
          border: '1px solid ' + (openSprint === si ? accent : 'var(--color-border)'),
          borderLeft: '3px solid ' + accent,
          borderRadius: 'var(--radius-lg)',
          overflow: 'hidden',
        }}>
          <button
            onClick={() => setOpenSprint(openSprint === si ? -1 : si)}
            style={{
              width: '100%',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '14px 18px',
              background: 'transparent', border: 'none',
              cursor: 'pointer', textAlign: 'left',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 10, fontWeight: 700,
                letterSpacing: '0.08em', textTransform: 'uppercase',
                color: accent,
                background: accent + '15',
                border: '1px solid ' + accent + '30',
                borderRadius: 'var(--radius-full)',
                padding: '3px 10px',
              }}>
                Week {sprint.week}
              </div>
              <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--color-text)' }}>
                {sprint.tasks.length} tasks · {sprint.days} days
              </span>
            </div>
            <span style={{
              fontSize: 16, color: 'var(--color-text-muted)',
              transform: openSprint === si ? 'rotate(90deg)' : 'rotate(0)',
              transition: '200ms ease',
              display: 'inline-block',
            }}>
              ›
            </span>
          </button>

          {openSprint === si && (
            <div style={{
              padding: '4px 18px 16px',
              borderTop: '1px solid var(--color-divider)',
            }}>
              {sprint.tasks.map((t, ti) => (
                <div key={ti} style={{
                  display: 'flex', alignItems: 'flex-start', gap: 10,
                  padding: '8px 0',
                  borderBottom: ti < sprint.tasks.length - 1
                    ? '1px solid var(--color-divider)'
                    : 'none',
                }}>
                  <div style={{
                    width: 16, height: 16,
                    borderRadius: 4,
                    border: '1.5px solid var(--color-border)',
                    flexShrink: 0, marginTop: 2,
                  }} />
                  <div style={{
                    flex: 1,
                    fontSize: 13, color: 'var(--color-text)', lineHeight: 1.5,
                  }}>
                    {t.name}
                  </div>
                  <div style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 10, color: 'var(--color-text-muted)', flexShrink: 0,
                  }}>
                    {t.days}d
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )) : (
        <Card>
          <div style={{
            fontSize: 13, color: 'var(--color-text-muted)',
            textAlign: 'center', padding: '20px 0',
          }}>
            No sprint data available. The AI did not return a task breakdown. Try retranslating.
          </div>
        </Card>
      )}

      {/* Gantt Timeline — prominent for sprint plan */}
      {r.ganttData?.phases?.length > 0 && (
        <Card style={{ marginTop: 16 }}>
          <Label>Brief Timeline · {r.ganttData.totalDays ? r.ganttData.totalDays + ' days' : 'Gantt'}</Label>
          <GanttSection ganttData={r.ganttData} accent={accent} />
        </Card>
      )}

      {/* Project Workflow */}
      {r.projectWorkflow?.length > 0 && (
        <Card style={{ marginTop: 16 }}>
          <Label>Project Workflow</Label>
          <WorkflowSection workflow={r.projectWorkflow} accent={accent} />
        </Card>
      )}

      {/* Team Roles */}
      {(r.teamRoles?.length > 0 || safeArr(r.rolesNeeded).length > 0) && (
        <Card style={{ marginTop: 16 }}>
          <Label>Team Needed</Label>
          <TeamRolesSection teamRoles={r.teamRoles} rolesNeeded={r.rolesNeeded} accent={accent} />
        </Card>
      )}

      {/* Budget */}
      {r.budgetRange && (
        <Card style={{ marginTop: 16 }}>
          <Label>Budget Estimate</Label>
          <BudgetSection budgetRange={r.budgetRange} accent={accent} />
        </Card>
      )}

      {/* Competitors */}
      {r.competitors?.length > 0 && (
        <Card style={{ marginTop: 16 }}>
          <Label>Competitive Landscape</Label>
          <CompetitorsSection competitors={r.competitors} accent={accent} />
        </Card>
      )}

      {/* Inspiration */}
      {r.inspiration?.length > 0 && (
        <Card style={{ marginTop: 16 }}>
          <Label>References & Inspiration</Label>
          <InspirationSection inspiration={r.inspiration} accent={accent} />
        </Card>
      )}
    </div>
  )
}
