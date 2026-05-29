import { useState, useEffect, useContext, useMemo } from 'react'
import AppContext from '../context/AppContext'
import { supabase } from '../lib/supabase'
import {
  ArrowRightIcon,
  ArrowDownTrayIcon,
  CreditCardIcon,
  CalendarDaysIcon,
  CheckIcon,
  LockClosedIcon,
  XMarkIcon,
  ExclamationTriangleIcon,
  BoltIcon,
} from '@heroicons/react/24/outline'

// ─────────────────────────────────────────────────────────────────────
// Billing page
//
// Mounted inside the SettingsPage 'plans' tab. Loads billing_history +
// credit_usage_log for the signed-in user, exposes:
//   • Current Plan overview
//   • Credits usage + per-action breakdown
//   • Billing History (with browser-printed receipt)
//   • Change Plan (3-up comparison + upgrade/downgrade)
//   • Cancel Subscription (multi-step modal)
//
// Fully responsive: mobile (≤480), tablet (481–768), desktop (769+).
// ─────────────────────────────────────────────────────────────────────

const PLAN_NAMES = { free: 'Free', starter: 'Starter', pro: 'Pro' }
const PLAN_PRICES = { free: 0, starter: 12, pro: 29 }
const PLAN_PILL = {
  free:    { bg: 'var(--color-surface)',       color: 'var(--color-text-muted)', border: 'var(--color-border)',         label: 'Free plan' },
  starter: { bg: 'rgba(96,165,250,0.15)',      color: '#60A5FA',                 border: 'rgba(96,165,250,0.35)',       label: 'Starter' },
  pro:     { bg: 'rgba(139,92,246,0.15)',      color: '#8B5CF6',                 border: 'rgba(139,92,246,0.35)',       label: 'Pro ✦' },
}
const PLAN_TAGLINE = {
  free: 'Free forever',
  starter: '$12/month',
  pro: '$29/month',
}
const PLAN_FEATURES = {
  free:    ['2 projects', 'No team members', '50 one-time credits', 'Watermarked exports'],
  starter: ['10 projects', '2 members per project', '300 credits/month', 'Clean PDF exports', 'Shareable links'],
  pro:     ['Unlimited projects', '10 members per project', '1,000 credits/month', 'White-label exports', 'Client intake forms', 'Custom templates'],
}
const ACTION_LABELS = {
  brief_translation:    'Brief translations',
  kanban_generation:    'Kanban generations',
  ai_task_prompt:       'AI task prompts',
  moodboard_refresh:    'Moodboard refreshes',
  red_flag_analysis:    'Red flag analyses',
  questions_generation: 'Questions regenerations',
  client_intake:        'Client intake forms',
}

function useViewport() {
  const [w, setW] = useState(() => (typeof window !== 'undefined' ? window.innerWidth : 1200))
  useEffect(() => {
    const h = () => setW(window.innerWidth)
    window.addEventListener('resize', h)
    return () => window.removeEventListener('resize', h)
  }, [])
  return { isMobile: w <= 480, isTablet: w > 480 && w <= 768, isDesktop: w > 768 }
}

function startOfMonthIso() {
  const d = new Date()
  d.setDate(1); d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

function fmtDate(input, opts = {}) {
  if (!input) return '-'
  const d = new Date(input)
  if (Number.isNaN(d.getTime())) return '-'
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', ...opts })
}

function fmtMonthYear(input) {
  return fmtDate(input, { month: 'long', year: 'numeric', day: undefined })
}

export default function Billing() {
  const {
    authUser, user,
    userPlan, userCredits, creditsLimit, creditsUsed, creditsResetAt,
    planStatus, accessUntil, planStartedAt,
    openUpgradeModal,
    showToast,
    refreshUserPlan,
  } = useContext(AppContext)
  const { isMobile, isTablet } = useViewport()

  const [history, setHistory] = useState([])
  const [usageRows, setUsageRows] = useState([])
  const [loadingHistory, setLoadingHistory] = useState(true)
  const [showAllHistory, setShowAllHistory] = useState(false)
  // payment_method_removed_at — when the user clicks Remove card, we set
  // it to now(). The Payment Method card flips to "No payment method"
  // until a newer billing_history.created_at exists.
  const [paymentMethodRemovedAt, setPaymentMethodRemovedAt] = useState(null)

  const [cancelOpen, setCancelOpen] = useState(false)
  const [downgradeTo, setDowngradeTo] = useState(null)
  const [removeCardOpen, setRemoveCardOpen] = useState(false)
  const [removingCard, setRemovingCard] = useState(false)

  // ── Data fetch ────────────────────────────────────────────────────
  useEffect(() => {
    if (!authUser?.id) return
    setLoadingHistory(true)
    Promise.all([
      supabase.from('billing_history')
        .select('*')
        .eq('user_id', authUser.id)
        .order('created_at', { ascending: false })
        .limit(50),
      supabase.from('credit_usage_log')
        .select('action, credits, created_at')
        .eq('user_id', authUser.id)
        .gte('created_at', startOfMonthIso()),
      supabase.from('profiles')
        .select('payment_method_removed_at')
        .eq('id', authUser.id)
        .single(),
    ]).then(([h, u, p]) => {
      setHistory(h.data || [])
      setUsageRows(u.data || [])
      // Prefer the DB column; fall back to the localStorage flag for
      // installs that haven't run supabase/billing-page.sql yet.
      let removedAt = p.data?.payment_method_removed_at || null
      if (!removedAt) {
        try { removedAt = localStorage.getItem('db-payment-method-removed-at:' + authUser.id) || null } catch {}
      }
      setPaymentMethodRemovedAt(removedAt)
    }).catch(() => {}).finally(() => setLoadingHistory(false))
  }, [authUser?.id])

  const breakdown = useMemo(() => {
    const acc = {}
    for (const row of usageRows) {
      if (!acc[row.action]) acc[row.action] = { count: 0, total: 0 }
      acc[row.action].count += 1
      acc[row.action].total += row.credits
    }
    return acc
  }, [usageRows])
  const breakdownTotal = useMemo(() => Object.values(breakdown).reduce((a, b) => a + b.total, 0), [breakdown])

  // Reset countdown (30 days from credits_reset_at)
  const daysToReset = useMemo(() => {
    if (userPlan === 'free' || !creditsResetAt) return null
    const last = new Date(creditsResetAt).getTime()
    if (Number.isNaN(last)) return null
    return Math.max(0, Math.ceil((last + 30 * 24 * 60 * 60 * 1000 - Date.now()) / 86400000))
  }, [creditsResetAt, userPlan])
  const resetDate = useMemo(() => {
    if (!creditsResetAt) return null
    return new Date(new Date(creditsResetAt).getTime() + 30 * 24 * 60 * 60 * 1000)
  }, [creditsResetAt])

  // Credits bar colour / values
  const remaining = Math.max(0, Math.min(creditsLimit, userCredits ?? 0))
  const usedPct = creditsLimit > 0 ? Math.round(((creditsLimit - remaining) / creditsLimit) * 100) : 0
  const barColor = usedPct >= 80 ? '#EF4444' : usedPct >= 50 ? '#FBBF24' : '#22C55E'

  const visibleHistory = showAllHistory ? history : history.slice(0, 12)

  async function handleCancellationDone(reason, feedback, accessUntilIso) {
    if (!authUser?.id) {
      showToast?.('Please sign in again to cancel.', 'error')
      return
    }
    try {
      const reasonValue = feedback
        ? `${reason || 'unspecified'} · ${feedback.slice(0, 500)}`
        : (reason || null)
      const { error } = await supabase
        .from('profiles')
        .update({
          plan_status: 'cancelled',
          cancellation_reason: reasonValue,
          access_until: accessUntilIso || null,
        })
        .eq('id', authUser.id)
      if (error) {
        console.error('[cancel] supabase update error:', error)
        showToast?.('Could not cancel: ' + (error.message || 'try again.'), 'error')
        return
      }
      await refreshUserPlan?.()
      setCancelOpen(false)
      showToast?.(`Subscription cancelled. You have ${PLAN_NAMES[userPlan]} access until ${fmtDate(accessUntilIso)}.`, 'success')
    } catch (e) {
      console.error('[cancel]', e)
      showToast?.('Could not cancel. Try again.', 'error')
    }
  }

  async function reactivateSubscription() {
    try {
      await supabase.from('profiles').update({
        plan_status: 'active',
        cancellation_reason: null,
        access_until: null,
      }).eq('id', authUser.id)
      await refreshUserPlan?.()
      showToast?.('Subscription reactivated 🎉', 'success')
    } catch (e) {
      console.error('[reactivate]', e)
      showToast?.('Could not reactivate. Try again.', 'error')
    }
  }

  function downloadReceipt(row) {
    const html = receiptHtml({
      user: { name: user?.name || authUser?.user_metadata?.full_name || authUser?.email, email: authUser?.email },
      row,
    })
    const w = window.open('', '_blank', 'width=720,height=900')
    if (!w) { showToast?.('Allow pop-ups to download receipts.', 'error'); return }
    w.document.write(html)
    w.document.close()
    setTimeout(() => { try { w.focus(); w.print() } catch {} }, 250)
  }

  async function confirmRemoveCard() {
    if (!authUser?.id) return
    setRemovingCard(true)
    const nowIso = new Date().toISOString()
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ payment_method_removed_at: nowIso })
        .eq('id', authUser.id)
      if (error) {
        // Column not added yet → fall back to a per-device localStorage
        // flag so removal still works in the UI. The next successful
        // charge updates billing_history.created_at, which the
        // PaymentMethodCard compares against to re-flip the indicator.
        const missingColumn = /payment_method_removed_at/i.test(error.message || '')
          || /column .* does not exist/i.test(error.message || '')
          || error.code === '42703'
        if (missingColumn) {
          console.warn('[confirmRemoveCard] payment_method_removed_at column missing — using localStorage fallback. Run supabase/billing-page.sql to enable cross-device removal.')
          try { localStorage.setItem('db-payment-method-removed-at:' + authUser.id, nowIso) } catch {}
          setPaymentMethodRemovedAt(nowIso)
          setRemoveCardOpen(false)
          showToast?.('Card removed.', 'success')
          return
        }
        console.error('[confirmRemoveCard] supabase error:', error)
        showToast?.('Could not remove card: ' + (error.message || 'try again.'), 'error')
        return
      }
      setPaymentMethodRemovedAt(nowIso)
      setRemoveCardOpen(false)
      showToast?.('Card removed.', 'success')
    } catch (e) {
      console.error('[confirmRemoveCard]', e)
      showToast?.('Could not remove card. Try again.', 'error')
    } finally {
      setRemovingCard(false)
    }
  }

  // ── Card update flow ──────────────────────────────────────────────
  // Paid users → open Flutterwave Inline directly with their current
  // plan's monthly amount. tx_ref encodes _card so the webhook can
  // distinguish this from an initial subscription if it cares to.
  // The redirect_url + flw_callback handler in App.jsx already handles
  // post-payment verification + plan refresh.
  function launchCardUpdate() {
    if (userPlan === 'free') {
      showToast?.('Choose a paid plan first to add a card.', 'info')
      return
    }
    const publicKey = import.meta.env.VITE_FLW_PUBLIC_KEY
    if (!publicKey) {
      showToast?.('Billing not configured.', 'error')
      return
    }
    if (!authUser?.id || !authUser?.email) {
      showToast?.('Please sign in to update your card.', 'error')
      return
    }
    if (typeof window === 'undefined' || typeof window.FlutterwaveCheckout !== 'function') {
      showToast?.('Payment SDK still loading. Try again in a moment.', 'info')
      return
    }
    const monthly = PLAN_PRICES[userPlan] || 12
    const tx_ref = `db_${authUser.id}_${userPlan}_monthly_${Date.now()}_card`
    try {
      localStorage.setItem('db-pending-payment', JSON.stringify({ tx_ref, plan: userPlan, at: Date.now() }))
    } catch {}
    window.FlutterwaveCheckout({
      public_key: publicKey,
      tx_ref,
      amount: monthly,
      currency: 'USD',
      payment_options: 'card',
      redirect_url: window.location.origin + '/?flw_callback=1',
      customer: {
        email: authUser.email,
        name: user?.name || authUser?.user_metadata?.full_name || authUser.email,
      },
      customizations: {
        title: 'DesignBrief AI · Update card',
        description: `Update your card on file · ${PLAN_NAMES[userPlan] || 'Plan'} renewal`,
        logo: 'https://designbrief-vert.vercel.app/favicon.svg',
      },
    })
  }

  // ── Render ────────────────────────────────────────────────────────
  return (
    <div style={{
      width: '100%',
      padding: isMobile ? '20px 16px' : isTablet ? '32px 24px' : '40px 48px',
      boxSizing: 'border-box', fontFamily: 'var(--font-sans)',
    }}>
      <h1 style={{ fontWeight: 800, fontSize: isMobile ? 22 : 26, letterSpacing: '-0.04em', color: 'var(--color-text)', margin: '0 0 6px' }}>
        Billing
      </h1>
      <p style={{ fontSize: 13, color: 'var(--color-text-muted)', margin: '0 0 28px', lineHeight: 1.6 }}>
        Manage your subscription, AI credits, payment history, and plan changes.
      </p>

      <CurrentPlanCard
        userPlan={userPlan}
        planStatus={planStatus}
        accessUntil={accessUntil}
        planStartedAt={planStartedAt}
        isMobile={isMobile}
        onUpgrade={(_plan) => openUpgradeModal?.('general')}
        onReactivate={reactivateSubscription}
      />

      <CreditsUsageCard
        userPlan={userPlan}
        remaining={remaining}
        creditsLimit={creditsLimit}
        usedPct={usedPct}
        barColor={barColor}
        daysToReset={daysToReset}
        resetDate={resetDate}
        breakdown={breakdown}
        breakdownTotal={breakdownTotal}
        isMobile={isMobile}
        onUpgrade={() => openUpgradeModal?.('credits')}
      />

      <BillingHistoryCard
        history={visibleHistory}
        totalCount={history.length}
        showAll={showAllHistory}
        onShowMore={() => setShowAllHistory(true)}
        onDownload={downloadReceipt}
        loading={loadingHistory}
        isMobile={isMobile}
      />

      <ChangePlanCard
        userPlan={userPlan}
        onUpgrade={(plan) => {
          // Both upgrades use the same modal+flow; the modal already knows
          // the current plan from context and routes to the right card.
          openUpgradeModal?.(plan === 'pro' ? 'general' : 'general')
        }}
        onDowngrade={(plan) => setDowngradeTo(plan)}
        isMobile={isMobile}
        isTablet={isTablet}
      />

      <PaymentMethodCard
        history={history}
        isMobile={isMobile}
        userPlan={userPlan}
        paymentMethodRemovedAt={paymentMethodRemovedAt}
        onUpdate={launchCardUpdate}
        onRemove={() => setRemoveCardOpen(true)}
      />

      {(userPlan === 'starter' || userPlan === 'pro') && planStatus !== 'cancelled' && (
        <DangerZone onCancel={() => setCancelOpen(true)} />
      )}

      <CancellationModal
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        plan={userPlan}
        renewalAt={resetDate}
        onConfirm={(reason, feedback) => handleCancellationDone(reason, feedback, resetDate?.toISOString())}
        isMobile={isMobile}
      />

      <RemoveCardModal
        open={removeCardOpen}
        onClose={() => removingCard ? null : setRemoveCardOpen(false)}
        onConfirm={confirmRemoveCard}
        loading={removingCard}
        isMobile={isMobile}
      />

      <DowngradeModal
        open={!!downgradeTo}
        from={userPlan}
        to={downgradeTo}
        onClose={() => setDowngradeTo(null)}
        onConfirm={async () => {
          try {
            await supabase.from('profiles').update({
              plan_status: 'cancelled',
              cancellation_reason: 'downgrade:' + downgradeTo,
              access_until: resetDate?.toISOString() || null,
            }).eq('id', authUser.id)
            await refreshUserPlan?.()
            showToast?.(`Downgrade scheduled. You'll move to ${PLAN_NAMES[downgradeTo]} on ${fmtDate(resetDate)}.`, 'success')
          } catch (e) {
            showToast?.('Could not schedule downgrade. Try again.', 'error')
          }
          setDowngradeTo(null)
        }}
        isMobile={isMobile}
      />
    </div>
  )
}

// ── Current Plan ─────────────────────────────────────────────────────
function CurrentPlanCard({ userPlan, planStatus, accessUntil, planStartedAt, isMobile, onUpgrade, onReactivate }) {
  const pill = PLAN_PILL[userPlan] || PLAN_PILL.free
  const cancelled = planStatus === 'cancelled'
  return (
    <Section title="Current Plan">
      <div style={{
        display: 'flex',
        flexDirection: isMobile ? 'column' : 'row',
        gap: isMobile ? 16 : 20,
        alignItems: isMobile ? 'flex-start' : 'flex-start',
        justifyContent: 'space-between',
      }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <span style={pillStyle(pill)}>{pill.label}</span>
          <div style={{
            marginTop: 10, fontFamily: 'var(--font-sans)', fontWeight: 800,
            fontSize: isMobile ? 20 : 24, letterSpacing: '-0.03em', color: 'var(--color-text)',
          }}>
            {PLAN_NAMES[userPlan]}
          </div>
          <div style={{ marginTop: 2, fontSize: 13, color: 'var(--color-text-muted)' }}>
            {PLAN_TAGLINE[userPlan]}
          </div>

          <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <StatusRow status={cancelled ? 'cancelled' : (planStatus === 'past_due' ? 'past_due' : 'active')} />
            {userPlan !== 'free' && (
              <InfoRow icon={CalendarDaysIcon} label={cancelled
                ? `Cancelled · Access until ${fmtDate(accessUntil)}`
                : `Renews on ${fmtDate(accessUntil || addDays(planStartedAt, 30))}`} />
            )}
            {planStartedAt && (
              <InfoRow icon={CalendarDaysIcon} label={`Member since ${fmtMonthYear(planStartedAt)}`} muted />
            )}
          </div>
        </div>

        <div style={{
          display: 'flex', flexDirection: 'column',
          gap: 8, width: isMobile ? '100%' : 'auto',
          alignItems: isMobile ? 'stretch' : 'flex-end',
        }}>
          {cancelled && (
            <button onClick={onReactivate} style={primaryBtn(isMobile)}>
              <BoltIcon style={{ width: 13, height: 13 }} /> Reactivate Subscription
            </button>
          )}
          {!cancelled && userPlan === 'free' && (
            <>
              <button onClick={() => onUpgrade('starter')} style={secondaryBtn(isMobile)}>Upgrade to Starter</button>
              <button onClick={() => onUpgrade('pro')} style={primaryBtn(isMobile)}>
                Upgrade to Pro <ArrowRightIcon style={{ width: 12, height: 12 }} />
              </button>
            </>
          )}
          {!cancelled && userPlan === 'starter' && (
            <button onClick={() => onUpgrade('pro')} style={primaryBtn(isMobile)}>
              Upgrade to Pro <ArrowRightIcon style={{ width: 12, height: 12 }} />
            </button>
          )}
          {!cancelled && userPlan === 'pro' && (
            // Pro is the highest tier — no upgrade button, just a clear
            // status line so users know they're not missing anything.
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '8px 12px',
              fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 600,
              color: 'var(--color-text-muted)',
            }}>
              ✦ You're on our best plan
            </span>
          )}
        </div>
      </div>
    </Section>
  )
}

function StatusRow({ status }) {
  const map = {
    active: { color: '#22C55E', label: 'Active' },
    cancelled: { color: '#EF4444', label: 'Cancelled' },
    past_due: { color: '#F59E0B', label: 'Past Due' },
  }
  const s = map[status] || map.active
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, color: 'var(--color-text)' }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: s.color, display: 'inline-block' }} />
      {s.label}
    </div>
  )
}

function InfoRow({ icon: Icon, label, muted }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: muted ? 'var(--color-text-muted)' : 'var(--color-text)' }}>
      <Icon style={{ width: 12, height: 12, color: 'var(--color-text-muted)', flexShrink: 0 }} />
      {label}
    </div>
  )
}

// ── Credits Usage ────────────────────────────────────────────────────
function CreditsUsageCard({ userPlan, remaining, creditsLimit, usedPct, barColor, daysToReset, resetDate, breakdown, breakdownTotal, isMobile, onUpgrade }) {
  const breakdownEntries = Object.entries(breakdown).sort(([, a], [, b]) => b.total - a.total)
  return (
    <Section title="AI Credits">
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 14 }}>
        <span style={{ fontFamily: 'var(--font-sans)', fontWeight: 800, fontSize: isMobile ? 32 : 40, letterSpacing: '-0.04em', color: 'var(--color-text)' }}>
          {remaining}
        </span>
        <span style={{ fontSize: 16, color: 'var(--color-text-muted)' }}>/ {creditsLimit} credits</span>
      </div>

      <div style={{
        width: '100%', height: 10, borderRadius: 99,
        background: 'var(--color-surface)', overflow: 'hidden',
        border: '1px solid var(--color-border)',
      }}>
        <div style={{ width: usedPct + '%', height: '100%', background: barColor, borderRadius: 99, transition: 'width 0.3s ease' }} />
      </div>

      <div style={{ marginTop: 10, fontSize: 12, color: 'var(--color-text-muted)' }}>
        {userPlan === 'free' ? (
          <>
            One-time credits · Never refreshes
            <button onClick={onUpgrade} style={{
              marginLeft: 10, padding: '4px 10px', background: 'transparent',
              border: '1px solid #8B5CF6', borderRadius: 7, cursor: 'pointer',
              color: '#8B5CF6', fontFamily: 'var(--font-sans)', fontSize: 11, fontWeight: 700,
            }}>
              Upgrade to get 300/mo →
            </button>
          </>
        ) : daysToReset != null ? (
          <>Resets in {daysToReset} day{daysToReset === 1 ? '' : 's'} · {fmtDate(resetDate)}</>
        ) : null}
      </div>

      {/* Breakdown */}
      <div style={{ marginTop: 22, paddingTop: 18, borderTop: '1px solid var(--color-border)' }}>
        <Label>Credit Breakdown</Label>
        {breakdownEntries.length === 0 ? (
          <div style={{ marginTop: 12, fontSize: 13, color: 'var(--color-text-muted)' }}>
            No credit usage this month yet.
          </div>
        ) : (
          <>
            {/* Desktop / Tablet: table */}
            {!isMobile && (
              <div style={{ marginTop: 14 }}>
                {breakdownEntries.map(([action, agg]) => (
                  <BreakdownRow key={action} action={action} count={agg.count} total={agg.total} />
                ))}
                <div style={{
                  display: 'flex', justifyContent: 'space-between',
                  paddingTop: 12, marginTop: 6, borderTop: '1px solid var(--color-border)',
                  fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 700, color: 'var(--color-text)',
                }}>
                  <span>Total used this month</span>
                  <span>{breakdownTotal} credits</span>
                </div>
              </div>
            )}
            {/* Mobile: stacked cards */}
            {isMobile && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
                {breakdownEntries.map(([action, agg]) => (
                  <div key={action} style={{
                    padding: '10px 12px', background: 'var(--color-surface)',
                    border: '1px solid var(--color-border)', borderRadius: 10,
                  }}>
                    <div style={{ fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 600, color: 'var(--color-text)' }}>
                      {ACTION_LABELS[action] || action}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 12, color: 'var(--color-text-muted)' }}>
                      <span>× {agg.count}</span>
                      <span>{agg.total} credits</span>
                    </div>
                  </div>
                ))}
                <div style={{
                  marginTop: 6, padding: '10px 12px',
                  background: 'rgba(139,92,246,0.08)',
                  border: '1px solid rgba(139,92,246,0.25)',
                  borderRadius: 10, display: 'flex', justifyContent: 'space-between',
                  fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 700, color: 'var(--color-text)',
                }}>
                  <span>Total this month</span><span>{breakdownTotal} credits</span>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </Section>
  )
}

function BreakdownRow({ action, count, total }) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '1fr 90px 100px',
      padding: '8px 0', alignItems: 'baseline',
      borderBottom: '1px dashed var(--color-border)',
      fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--color-text)',
    }}>
      <span>{ACTION_LABELS[action] || action}</span>
      <span style={{ textAlign: 'right', color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>× {count}</span>
      <span style={{ textAlign: 'right', fontWeight: 600 }}>{total} credits</span>
    </div>
  )
}

// ── Billing History ──────────────────────────────────────────────────
function BillingHistoryCard({ history, totalCount, showAll, onShowMore, onDownload, loading, isMobile }) {
  return (
    <Section title="Billing History">
      {loading ? (
        <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Loading…</div>
      ) : history.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--color-text-muted)', textAlign: 'center', padding: '20px 0' }}>
          No payments yet.
        </div>
      ) : isMobile ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {history.map(row => (
            <div key={row.id} style={{
              padding: 14, background: 'var(--color-surface)',
              border: '1px solid var(--color-border)', borderRadius: 12,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                <div style={{ fontFamily: 'var(--font-sans)', fontWeight: 700, fontSize: 14, color: 'var(--color-text)' }}>
                  {PLAN_NAMES[row.plan] || row.plan} {row.billing_cycle ? `· ${row.billing_cycle}` : ''}
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 700, color: 'var(--color-text)' }}>
                  ${Number(row.amount).toFixed(2)}
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{fmtDate(row.created_at)}</div>
                <StatusBadge status={row.status || 'successful'} />
              </div>
              <button onClick={() => onDownload(row)} style={{
                marginTop: 12, width: '100%', padding: '8px 0',
                background: 'transparent', border: '1px solid var(--color-border)',
                borderRadius: 8, cursor: 'pointer',
                fontFamily: 'var(--font-sans)', fontSize: 12, fontWeight: 600, color: 'var(--color-text)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}>
                <ArrowDownTrayIcon style={{ width: 12, height: 12 }} /> Receipt
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div>
          <div style={{
            display: 'grid', gridTemplateColumns: '1.2fr 1.4fr 0.8fr 0.8fr 0.6fr',
            gap: 8, paddingBottom: 8, borderBottom: '1px solid var(--color-border)',
            fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700,
            letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-text-muted)',
          }}>
            <div>Date</div><div>Plan</div><div>Amount</div><div>Status</div><div></div>
          </div>
          {history.map(row => (
            <div key={row.id} style={{
              display: 'grid', gridTemplateColumns: '1.2fr 1.4fr 0.8fr 0.8fr 0.6fr',
              gap: 8, padding: '12px 0',
              borderBottom: '1px solid var(--color-border)',
              fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--color-text)',
              alignItems: 'center',
            }}>
              <div>{fmtDate(row.created_at)}</div>
              <div style={{ fontWeight: 600 }}>
                {PLAN_NAMES[row.plan] || row.plan}
                {row.billing_cycle && (
                  <span style={{ color: 'var(--color-text-muted)', fontWeight: 400 }}> · {row.billing_cycle}</span>
                )}
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>${Number(row.amount).toFixed(2)}</div>
              <div><StatusBadge status={row.status || 'successful'} /></div>
              <div style={{ textAlign: 'right' }}>
                <button onClick={() => onDownload(row)} style={{
                  padding: '6px 10px', background: 'transparent',
                  border: '1px solid var(--color-border)', borderRadius: 8,
                  cursor: 'pointer', fontFamily: 'var(--font-sans)', fontSize: 12, fontWeight: 600,
                  color: 'var(--color-text)', display: 'inline-flex', alignItems: 'center', gap: 5,
                }}>
                  <ArrowDownTrayIcon style={{ width: 12, height: 12 }} /> Receipt
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {!showAll && totalCount > history.length && (
        <button onClick={onShowMore} style={{
          marginTop: 14, width: isMobile ? '100%' : 'auto', padding: '8px 14px',
          background: 'transparent', border: '1px solid var(--color-border)',
          borderRadius: 9, cursor: 'pointer',
          fontFamily: 'var(--font-sans)', fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)',
        }}>
          Load more
        </button>
      )}
    </Section>
  )
}

function StatusBadge({ status }) {
  const map = {
    successful: { bg: 'rgba(34,197,94,0.10)',  color: '#16a34a', border: 'rgba(34,197,94,0.30)',  label: 'Successful' },
    failed:     { bg: 'rgba(239,68,68,0.10)',  color: '#DC2626', border: 'rgba(239,68,68,0.30)',  label: 'Failed' },
    refunded:   { bg: 'var(--color-surface)',  color: 'var(--color-text-muted)', border: 'var(--color-border)', label: 'Refunded' },
  }
  const s = map[status] || map.successful
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      background: s.bg, color: s.color, border: '1px solid ' + s.border,
      borderRadius: 100, padding: '2px 8px',
      fontFamily: 'var(--font-sans)', fontSize: 10, fontWeight: 700,
      letterSpacing: '0.04em', textTransform: 'uppercase',
    }}>{s.label}</span>
  )
}

// ── Change Plan ──────────────────────────────────────────────────────
function ChangePlanCard({ userPlan, onUpgrade, onDowngrade, isMobile, isTablet }) {
  const PLANS = ['free', 'starter', 'pro']
  return (
    <Section title="Change Plan">
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : isTablet ? '1fr 1fr 1fr' : '1fr 1fr 1fr',
        gap: 12,
      }}>
        {PLANS.map(p => (
          <PlanComparisonCard
            key={p}
            plan={p}
            userPlan={userPlan}
            onUpgrade={onUpgrade}
            onDowngrade={onDowngrade}
          />
        ))}
      </div>
    </Section>
  )
}

function PlanComparisonCard({ plan, userPlan, onUpgrade, onDowngrade }) {
  const [cardHover, setCardHover] = useState(false)
  const [btnHover, setBtnHover] = useState(false)
  const PLANS = ['free', 'starter', 'pro']
  const isCurrent = plan === userPlan
  const isUpgrade = PLANS.indexOf(plan) > PLANS.indexOf(userPlan)
  const pill = PLAN_PILL[plan]

  // Card hover: lift + accent border (current plan keeps its solid black border).
  const cardBorder = isCurrent
    ? '2px solid var(--color-text)'
    : cardHover ? '1px solid #7C3AED' : '1px solid var(--color-border)'
  const cardTransform = !isCurrent && cardHover ? 'translateY(-2px)' : 'translateY(0)'
  const cardShadow = !isCurrent && cardHover ? '0 10px 28px rgba(124,58,237,0.15)' : '0 0 0 rgba(0,0,0,0)'

  // Button hover: emphasise the affordance per variant.
  const btnBase = {
    marginTop: 'auto',
    padding: '9px 12px',
    borderRadius: 10,
    fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 700,
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
    cursor: isCurrent ? 'not-allowed' : 'pointer',
    transition: 'background 0.15s, transform 0.15s, box-shadow 0.15s, border-color 0.15s, color 0.15s',
  }
  let btnStyle
  if (isCurrent) {
    btnStyle = { ...btnBase, background: 'var(--color-surface)', color: 'var(--color-text-muted)', border: '1px solid var(--color-border)' }
  } else if (isUpgrade) {
    btnStyle = {
      ...btnBase,
      background: btnHover ? 'linear-gradient(135deg, #6D28D9, #9333EA)' : 'linear-gradient(135deg, #7C3AED, #A855F7)',
      color: 'white', border: 'none',
      transform: btnHover ? 'translateY(-1px)' : 'translateY(0)',
      boxShadow: btnHover ? '0 6px 18px rgba(124,58,237,0.35)' : '0 2px 8px rgba(124,58,237,0.20)',
    }
  } else {
    btnStyle = {
      ...btnBase,
      background: btnHover ? 'rgba(239,68,68,0.06)' : 'transparent',
      color: btnHover ? '#EF4444' : 'var(--color-text)',
      border: '1px solid ' + (btnHover ? '#EF4444' : 'var(--color-border)'),
    }
  }

  return (
    <div
      onMouseEnter={() => setCardHover(true)}
      onMouseLeave={() => setCardHover(false)}
      style={{
        background: 'var(--color-card)',
        border: cardBorder,
        borderRadius: 14, padding: 16,
        display: 'flex', flexDirection: 'column', gap: 12,
        transform: cardTransform,
        boxShadow: cardShadow,
        transition: 'transform 0.18s, box-shadow 0.18s, border-color 0.18s',
      }}
    >
      <div>
        <span style={pillStyle(pill)}>{pill.label}</span>
        <div style={{ marginTop: 8, display: 'flex', alignItems: 'baseline', gap: 4 }}>
          <span style={{ fontFamily: 'var(--font-sans)', fontWeight: 800, fontSize: 22, color: 'var(--color-text)', letterSpacing: '-0.03em' }}>
            {plan === 'free' ? '$0' : '$' + PLAN_PRICES[plan]}
          </span>
          <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
            {plan === 'free' ? '' : '/mo'}
          </span>
        </div>
      </div>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {PLAN_FEATURES[plan].map(f => (
          <li key={f} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--color-text)' }}>
            <CheckIcon style={{ width: 12, height: 12, color: '#16A34A', flexShrink: 0 }} />
            {f}
          </li>
        ))}
      </ul>
      <button
        disabled={isCurrent}
        onClick={() => isUpgrade ? onUpgrade(plan) : onDowngrade(plan)}
        onMouseEnter={() => !isCurrent && setBtnHover(true)}
        onMouseLeave={() => setBtnHover(false)}
        style={btnStyle}
      >
        {isCurrent ? 'Current Plan' : isUpgrade ? <>Upgrade <ArrowRightIcon style={{ width: 12, height: 12 }} /></> : 'Downgrade'}
      </button>
    </div>
  )
}

// ── Payment Method ───────────────────────────────────────────────────
function PaymentMethodCard({ history, isMobile, userPlan, paymentMethodRemovedAt, onUpdate, onRemove }) {
  // We can't show full PAN (PCI), but we surface the last payment so the
  // user knows which card / method is on file. Flutterwave returns the
  // card type + last 4 in the verify payload — when we start saving
  // payment instruments, this is where they'll render.
  const last = history?.[0]
  // A card is considered on file when there's a recent successful
  // payment AND the user has NOT removed it since. The next successful
  // payment naturally re-flips this — its created_at will be greater
  // than payment_method_removed_at.
  const lastTime = last ? new Date(last.created_at).getTime() : 0
  const removedTime = paymentMethodRemovedAt ? new Date(paymentMethodRemovedAt).getTime() : 0
  const hasCard = !!last && lastTime > removedTime
  const isFree = userPlan === 'free'
  return (
    <Section title="Payment Method">
      <div style={{
        display: 'flex', flexDirection: isMobile ? 'column' : 'row',
        gap: isMobile ? 12 : 18, alignItems: isMobile ? 'stretch' : 'center',
        justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: 1 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10,
            background: 'rgba(124,58,237,0.10)',
            border: '1px solid rgba(124,58,237,0.25)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            <CreditCardIcon style={{ width: 18, height: 18, color: '#7C3AED' }} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: 'var(--font-sans)', fontWeight: 700, fontSize: 14, color: 'var(--color-text)' }}>
              {hasCard ? 'Payment via Flutterwave' : 'No payment method on file'}
            </div>
            <div style={{ marginTop: 2, fontSize: 12, color: 'var(--color-text-muted)' }}>
              {isFree
                ? 'Choose a paid plan to add a card.'
                : hasCard
                  ? <>Last charged {fmtDate(last.created_at)} · ${Number(last.amount).toFixed(2)} {last.currency || 'USD'}</>
                  : 'Add your card to enable plan renewal.'}
            </div>
          </div>
        </div>
        <div style={{
          display: 'flex',
          flexDirection: isMobile ? 'column' : 'row',
          gap: 8,
          width: isMobile ? '100%' : 'auto',
          flexShrink: 0,
        }}>
          {hasCard && (
            <button
              onClick={onRemove}
              title="Remove the card on file"
              style={{
                padding: '9px 16px',
                background: 'transparent',
                color: '#EF4444',
                border: '1px solid rgba(239,68,68,0.4)',
                borderRadius: 10,
                cursor: 'pointer',
                fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 600,
                width: isMobile ? '100%' : 'auto',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                transition: 'background 0.15s, border-color 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.08)'; e.currentTarget.style.borderColor = '#EF4444' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'rgba(239,68,68,0.4)' }}
            >
              Remove card
            </button>
          )}
          <button
            onClick={onUpdate}
            disabled={isFree}
            title={isFree ? 'Upgrade to a paid plan first' : (hasCard ? 'Replace the card on file' : 'Add a card to your account')}
            style={{
              padding: '9px 16px',
              background: 'transparent',
              color: isFree ? 'var(--color-text-muted)' : 'var(--color-text)',
              border: '1px solid var(--color-border)',
              borderRadius: 10,
              cursor: isFree ? 'not-allowed' : 'pointer',
              opacity: isFree ? 0.55 : 1,
              fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 600,
              width: isMobile ? '100%' : 'auto',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              transition: 'border-color 0.15s, color 0.15s',
            }}
            onMouseEnter={e => { if (!isFree) { e.currentTarget.style.borderColor = '#7C3AED'; e.currentTarget.style.color = '#7C3AED' } }}
            onMouseLeave={e => { if (!isFree) { e.currentTarget.style.borderColor = 'var(--color-border)'; e.currentTarget.style.color = 'var(--color-text)' } }}
          >
            {hasCard ? 'Update card' : 'Add card'}
          </button>
        </div>
      </div>
    </Section>
  )
}

// ── Danger Zone ──────────────────────────────────────────────────────
function DangerZone({ onCancel }) {
  return (
    <div style={{
      background: 'var(--color-card)',
      border: '1px solid rgba(239,68,68,0.30)',
      borderRadius: 16, padding: 24, marginBottom: 20,
    }}>
      <div style={{ fontFamily: 'var(--font-sans)', fontWeight: 700, fontSize: 16, color: 'var(--color-text)', marginBottom: 6 }}>
        Danger Zone
      </div>
      <div style={{ fontFamily: 'var(--font-sans)', fontWeight: 700, fontSize: 14, color: 'var(--color-text)', marginBottom: 4 }}>
        Cancel Subscription
      </div>
      <div style={{ fontSize: 12.5, color: 'var(--color-text-muted)', marginBottom: 14, lineHeight: 1.55 }}>
        Once cancelled, you will retain access until the end of your billing period.
      </div>
      <button onClick={onCancel} style={{
        padding: '9px 16px', background: 'transparent', color: '#EF4444',
        border: '1px solid #EF4444', borderRadius: 9, cursor: 'pointer',
        fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 700,
      }}
        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.08)' }}
        onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
      >
        Cancel Subscription
      </button>
    </div>
  )
}

// ── Cancellation Modal ───────────────────────────────────────────────
const REASON_OPTIONS = [
  { id: 'too_expensive',   label: 'Too expensive' },
  { id: 'not_using',       label: 'Not using it enough' },
  { id: 'missing_feature', label: 'Missing a feature I need' },
  { id: 'switching',       label: 'Switching to another tool' },
  { id: 'just_testing',    label: 'Just testing, not ready yet' },
  { id: 'other',           label: 'Other' },
]

function CancellationModal({ open, onClose, plan, renewalAt, onConfirm, isMobile }) {
  const [step, setStep] = useState(1)
  const [reason, setReason] = useState(null)
  const [feedback, setFeedback] = useState('')
  const [cancelling, setCancelling] = useState(false)

  useEffect(() => {
    if (!open) return
    function onKey(e) { if (e.key === 'Escape' && !cancelling) onClose?.() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose, cancelling])
  useEffect(() => { if (!open) { setStep(1); setReason(null); setFeedback(''); setCancelling(false) } }, [open])

  if (!open) return null

  // Continue is enabled once a reason is picked. For "Other" we also
  // require at least a few characters in the textarea so the feedback
  // isn't empty when it's the user's only chance to leave one.
  const otherNeedsText = reason === 'other'
  const canContinue = !!reason && (!otherNeedsText || feedback.trim().length > 0)

  async function handleConfirm() {
    if (cancelling) return
    setCancelling(true)
    try {
      await onConfirm?.(reason, feedback)
    } finally {
      setCancelling(false)
    }
  }

  return (
    <BottomSheetOrCenter isMobile={isMobile} onBackdrop={cancelling ? undefined : onClose}>
      <div style={{ padding: isMobile ? '14px 18px 18px' : '20px 24px 22px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{
              fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700,
              letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-text-muted)', marginBottom: 4,
            }}>Step {step} of 2</div>
            <h2 style={{ margin: 0, fontWeight: 800, fontSize: 18, color: 'var(--color-text)', letterSpacing: '-0.02em' }}>
              {step === 1 ? "We're sorry to see you go. Why are you leaving?" : 'Confirm cancellation'}
            </h2>
          </div>
          <button onClick={onClose} disabled={cancelling} style={iconBtn()}>
            <XMarkIcon style={{ width: 15, height: 15 }} />
          </button>
        </div>

        {step === 1 && (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
              {REASON_OPTIONS.map(o => (
                <label key={o.id} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 12px',
                  background: reason === o.id ? 'rgba(124,58,237,0.06)' : 'var(--color-surface)',
                  border: '1px solid ' + (reason === o.id ? '#7C3AED' : 'var(--color-border)'),
                  borderRadius: 10, cursor: 'pointer',
                  transition: 'background 0.15s, border-color 0.15s',
                }}>
                  <input
                    type="radio" name="reason" value={o.id} checked={reason === o.id}
                    onChange={() => setReason(o.id)} style={{ accentColor: '#7C3AED' }}
                  />
                  <span style={{ fontSize: 13, color: 'var(--color-text)' }}>{o.label}</span>
                </label>
              ))}
            </div>

            {reason === 'other' && (
              <div style={{ marginBottom: 16 }}>
                <textarea
                  autoFocus
                  value={feedback}
                  onChange={e => setFeedback(e.target.value)}
                  placeholder="Please tell us why you're leaving…"
                  rows={4}
                  style={{
                    width: '100%', boxSizing: 'border-box',
                    background: 'var(--color-surface)', border: '1px solid var(--color-border)',
                    borderRadius: 9, padding: '10px 12px', fontSize: 13,
                    color: 'var(--color-text)', fontFamily: 'var(--font-sans)',
                    resize: 'vertical', outline: 'none',
                  }}
                />
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
              <button onClick={onClose} style={secondaryBtn(isMobile)}>Keep my subscription</button>
              <button onClick={() => setStep(2)} disabled={!canContinue} style={primaryBtn(isMobile, !canContinue)}>
                Continue
              </button>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <div style={{ fontSize: 13, color: 'var(--color-text)', lineHeight: 1.55, marginBottom: 12 }}>
              Your <strong>{PLAN_NAMES[plan]}</strong> access continues until{' '}
              <strong>{fmtDate(renewalAt)}</strong>. After that you'll move to the Free plan and lose access to:
            </div>
            <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 18px', display: 'flex', flexDirection: 'column', gap: 5 }}>
              {(plan === 'pro' ? PLAN_FEATURES.pro : PLAN_FEATURES.starter).map(f => (
                <li key={f} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--color-text-muted)' }}>
                  <XMarkIcon style={{ width: 12, height: 12, color: '#EF4444' }} /> {f}
                </li>
              ))}
            </ul>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
              <button onClick={() => setStep(1)} disabled={cancelling} style={{
                background: 'transparent', border: 'none', color: 'var(--color-text-muted)',
                fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 600,
                cursor: cancelling ? 'not-allowed' : 'pointer',
              }}>
                ← Back
              </button>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button onClick={onClose} disabled={cancelling} style={secondaryBtn(isMobile)}>
                  Keep my subscription
                </button>
                <button
                  onClick={handleConfirm}
                  disabled={cancelling}
                  style={{
                    padding: '10px 18px',
                    background: cancelling ? 'rgba(239,68,68,0.7)' : '#EF4444',
                    color: 'white', border: 'none', borderRadius: 10,
                    cursor: cancelling ? 'not-allowed' : 'pointer',
                    fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 700,
                    width: isMobile ? '100%' : 'auto',
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={e => { if (!cancelling) e.currentTarget.style.background = '#DC2626' }}
                  onMouseLeave={e => { if (!cancelling) e.currentTarget.style.background = '#EF4444' }}
                >
                  {cancelling ? 'Cancelling…' : 'Yes, cancel my subscription'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </BottomSheetOrCenter>
  )
}

// ── Downgrade Modal ──────────────────────────────────────────────────
function DowngradeModal({ open, from, to, onClose, onConfirm, isMobile }) {
  useEffect(() => {
    if (!open) return
    function onKey(e) { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  // Features lost = everything in `from` that isn't in `to`.
  const losing = (PLAN_FEATURES[from] || []).filter(f => !(PLAN_FEATURES[to] || []).includes(f))

  return (
    <BottomSheetOrCenter isMobile={isMobile} onBackdrop={onClose}>
      <div style={{ padding: isMobile ? '14px 18px 18px' : '20px 24px 22px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <ExclamationTriangleIcon style={{ width: 18, height: 18, color: '#F59E0B', flexShrink: 0 }} />
            <h2 style={{ margin: 0, fontWeight: 800, fontSize: 17, color: 'var(--color-text)' }}>
              Downgrade to {PLAN_NAMES[to]}?
            </h2>
          </div>
          <button onClick={onClose} style={iconBtn()}><XMarkIcon style={{ width: 15, height: 15 }} /></button>
        </div>

        <div style={{ fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 10 }}>
          You will lose access to:
        </div>
        <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 14px', display: 'flex', flexDirection: 'column', gap: 5 }}>
          {losing.map(f => (
            <li key={f} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--color-text)' }}>
              <XMarkIcon style={{ width: 12, height: 12, color: '#EF4444' }} /> {f}
            </li>
          ))}
        </ul>
        <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 18 }}>
          Your downgrade takes effect at the end of your current billing cycle.
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={secondaryBtn(isMobile)}>Cancel</button>
          <button onClick={onConfirm} style={{
            padding: '9px 18px', background: '#EF4444',
            color: 'white', border: 'none', borderRadius: 10, cursor: 'pointer',
            fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 700,
            width: isMobile ? '100%' : 'auto',
          }}>
            Confirm Downgrade
          </button>
        </div>
      </div>
    </BottomSheetOrCenter>
  )
}

// ── Remove Card confirmation modal ──────────────────────────────────
function RemoveCardModal({ open, onClose, onConfirm, loading, isMobile }) {
  useEffect(() => {
    if (!open) return
    function onKey(e) { if (e.key === 'Escape' && !loading) onClose?.() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose, loading])

  if (!open) return null

  return (
    <BottomSheetOrCenter isMobile={isMobile} onBackdrop={loading ? undefined : onClose}>
      <div style={{ padding: isMobile ? '18px 20px 20px' : '24px 26px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: 'rgba(239,68,68,0.12)',
              border: '1px solid rgba(239,68,68,0.30)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              <ExclamationTriangleIcon style={{ width: 18, height: 18, color: '#EF4444' }} />
            </div>
            <h2 style={{ margin: 0, fontWeight: 800, fontSize: 17, color: 'var(--color-text)' }}>
              Remove this card?
            </h2>
          </div>
          <button onClick={onClose} disabled={loading} style={iconBtn()}>
            <XMarkIcon style={{ width: 15, height: 15 }} />
          </button>
        </div>

        <div style={{
          fontSize: 13, color: 'var(--color-text-muted)',
          lineHeight: 1.6, marginTop: 6, marginBottom: 18,
        }}>
          Your plan stays active until the end of the current billing period, but
          auto-renewal will stop. You can add a new card any time to resume renewals.
        </div>

        <div style={{
          display: 'flex',
          flexDirection: isMobile ? 'column-reverse' : 'row',
          gap: 8,
          justifyContent: 'flex-end',
        }}>
          <button
            onClick={onClose}
            disabled={loading}
            style={{
              ...secondaryBtn(isMobile),
              opacity: loading ? 0.6 : 1,
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            style={{
              padding: '10px 18px',
              background: loading ? 'rgba(239,68,68,0.7)' : '#EF4444',
              color: 'white', border: 'none', borderRadius: 10,
              cursor: loading ? 'not-allowed' : 'pointer',
              fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 700,
              width: isMobile ? '100%' : 'auto',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              transition: 'background 0.15s',
            }}
            onMouseEnter={e => { if (!loading) e.currentTarget.style.background = '#DC2626' }}
            onMouseLeave={e => { if (!loading) e.currentTarget.style.background = '#EF4444' }}
          >
            {loading ? 'Removing…' : 'Remove card'}
          </button>
        </div>
      </div>
    </BottomSheetOrCenter>
  )
}

// ── Bottom sheet on mobile, centred modal on tablet/desktop ─────────
function BottomSheetOrCenter({ children, onBackdrop, isMobile }) {
  return (
    <div
      onClick={onBackdrop}
      style={{
        position: 'fixed', inset: 0, zIndex: 900,
        background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: isMobile ? 'flex-end' : 'center',
        justifyContent: 'center',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: isMobile ? '100%' : 480,
          maxHeight: '90vh', overflow: 'auto',
          background: 'var(--color-bg)',
          border: '1px solid var(--color-border)',
          borderRadius: isMobile ? '20px 20px 0 0' : 16,
          boxShadow: '0 24px 64px rgba(0,0,0,0.35)',
        }}
      >
        {isMobile && (
          <div style={{
            display: 'flex', justifyContent: 'center', padding: '8px 0 0',
          }}>
            <div style={{
              width: 40, height: 4, borderRadius: 99,
              background: 'var(--color-border)',
            }} />
          </div>
        )}
        {children}
      </div>
    </div>
  )
}

// ── Section / shared helpers ─────────────────────────────────────────
function Section({ title, children }) {
  return (
    <section style={{
      background: 'var(--color-card)',
      border: '1px solid var(--color-border)',
      borderRadius: 16, padding: 24, marginBottom: 20,
    }}>
      <div style={{
        fontFamily: 'var(--font-sans)', fontWeight: 700, fontSize: 16,
        color: 'var(--color-text)', marginBottom: 20, paddingBottom: 16,
        borderBottom: '1px solid var(--color-border)',
      }}>
        {title}
      </div>
      {children}
    </section>
  )
}

function Label({ children }) {
  return (
    <div style={{
      fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600,
      letterSpacing: '0.08em', textTransform: 'uppercase',
      color: 'var(--color-text-muted)',
    }}>{children}</div>
  )
}

function pillStyle(palette) {
  return {
    display: 'inline-flex', alignItems: 'center',
    background: palette.bg, color: palette.color,
    border: '1px solid ' + palette.border,
    borderRadius: 100, padding: '3px 12px',
    fontFamily: 'var(--font-sans)', fontSize: 11, fontWeight: 700,
    letterSpacing: '0.02em',
  }
}

function primaryBtn(isMobile, disabled) {
  return {
    padding: '9px 16px',
    background: disabled ? 'var(--color-border)' : 'linear-gradient(135deg, #7C3AED, #A855F7)',
    color: 'white', border: 'none', borderRadius: 10,
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 700,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
    width: isMobile ? '100%' : 'auto',
  }
}

function secondaryBtn(isMobile) {
  return {
    padding: '9px 16px',
    background: 'transparent', color: 'var(--color-text)',
    border: '1px solid var(--color-border)', borderRadius: 10,
    cursor: 'pointer',
    fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 600,
    width: isMobile ? '100%' : 'auto',
  }
}

function iconBtn() {
  return {
    width: 28, height: 28, borderRadius: 7,
    background: 'transparent', border: 'none', cursor: 'pointer',
    color: 'var(--color-text-muted)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  }
}

function offerCardStyle() {
  return {
    padding: 14, background: 'rgba(34,197,94,0.06)',
    border: '1px solid rgba(34,197,94,0.25)',
    borderRadius: 11,
  }
}

function addDays(iso, n) {
  if (!iso) return null
  const d = new Date(iso)
  d.setDate(d.getDate() + n)
  return d.toISOString()
}

// ── Receipt HTML (browser print → PDF) ────────────────────────────────
function receiptHtml({ user, row }) {
  const amount = Number(row.amount).toFixed(2)
  const date = fmtDate(row.created_at)
  const plan = PLAN_NAMES[row.plan] || row.plan
  const ref = row.payment_ref || row.id
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>Receipt · DesignBrief AI</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; color: #1a1a1a; padding: 40px; max-width: 640px; margin: 0 auto; }
  .brand { display: flex; align-items: center; gap: 10px; margin-bottom: 32px; }
  .brand-mark { width: 32px; height: 32px; border-radius: 9px; background: linear-gradient(135deg, #7C3AED, #A855F7); display: flex; align-items: center; justify-content: center; color: white; font-weight: 800; }
  h1 { font-size: 24px; margin: 0 0 4px; letter-spacing: -0.02em; }
  .muted { color: #6b7280; font-size: 13px; }
  .row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #e5e7eb; font-size: 14px; }
  .total { font-weight: 700; font-size: 18px; padding-top: 18px; border-top: 2px solid #111; margin-top: 8px; }
  .footer { margin-top: 36px; padding-top: 18px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #6b7280; text-align: center; }
  @media print { body { padding: 18px; } }
</style></head>
<body>
  <div class="brand"><div class="brand-mark">✦</div>
    <div><div style="font-weight:800">DesignBrief AI</div>
      <div class="muted">designbrief.app</div></div>
  </div>

  <h1>Payment receipt</h1>
  <div class="muted" style="margin-bottom:24px">${date}</div>

  <div class="row"><span class="muted">Billed to</span><span>${escapeHtml(user.name || '')}<br><span class="muted">${escapeHtml(user.email || '')}</span></span></div>
  <div class="row"><span class="muted">Plan</span><span>${plan}${row.billing_cycle ? ' · ' + row.billing_cycle : ''}</span></div>
  <div class="row"><span class="muted">Payment reference</span><span style="font-family:ui-monospace, SF Mono, Menlo, monospace; font-size: 12px">${escapeHtml(ref)}</span></div>

  <div class="row total"><span>Total</span><span>${row.currency || 'USD'} $${amount}</span></div>

  <div class="footer">Thank you for your business. Reach support at hello@designbrief.app.</div>
</body></html>`
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
}
