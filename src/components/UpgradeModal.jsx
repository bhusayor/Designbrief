import { useContext, useEffect, useRef, useState } from 'react'
import AppContext from '../context/AppContext'
import { supabase } from '../lib/supabase'
import { CREDIT_TIERS, pickTier } from '../lib/plans'
import {
  XMarkIcon,
  BoltIcon,
  FolderIcon,
  BuildingOffice2Icon,
  UsersIcon,
  ClockIcon,
  DocumentArrowDownIcon,
  DocumentTextIcon,
  ClipboardDocumentListIcon,
  LinkIcon,
  SparklesIcon,
  ArrowRightIcon,
  CheckIcon,
  LockClosedIcon,
} from '@heroicons/react/24/outline'

// Dynamic copy + Heroicon per limit reason. Add new entries here when
// a new gate is wired.
const REASONS = {
  credits: {
    Icon: BoltIcon,
    headline: 'Choose your credit plan',
    message: 'Pick the monthly allowance that fits your work — from 300 credits on Starter up to 4,000 on Pro. Change tier or cancel anytime.',
  },
  projects: {
    Icon: FolderIcon,
    headline: 'Project limit reached',
    message: "You've used both free-plan projects. Upgrade to create up to 10 or unlimited projects.",
  },
  workspaces: {
    Icon: BuildingOffice2Icon,
    headline: 'Workspace limit reached',
    message: 'Free plan includes one workspace. Upgrade to create multiple workspaces and isolate clients.',
  },
  team_members: {
    Icon: UsersIcon,
    headline: 'Team collaboration is a paid feature',
    message: 'Upgrade to invite teammates and collaborate on projects in real time.',
  },
  history: {
    Icon: ClockIcon,
    headline: 'Brief history locked',
    message: 'Free plan shows your 5 most recent briefs. Upgrade to access your full history.',
  },
  export: {
    Icon: DocumentArrowDownIcon,
    headline: 'Remove watermark from exports',
    message: 'Upgrade to export clean, professional PDFs with your branding instead of the free-plan watermark.',
  },
  intake: {
    Icon: ClipboardDocumentListIcon,
    headline: 'Client Intake is Pro only',
    message: 'Send professional intake forms to clients and auto-generate briefs from their responses.',
    proOnly: true,
  },
  client_intake: {
    Icon: ClipboardDocumentListIcon,
    headline: 'Client Intake is Pro only',
    message: 'Send professional intake forms to clients and auto-generate briefs from their responses.',
    proOnly: true,
  },
  custom_templates: {
    Icon: SparklesIcon,
    headline: 'Custom Templates is Pro only',
    message: 'Build your own brief structure. The AI will follow your exact format every time.',
    proOnly: true,
  },
  white_label: {
    Icon: DocumentArrowDownIcon,
    headline: 'White-label export is Pro only',
    message: 'Replace the DesignBrief watermark with your own logo and brand on every PDF.',
    proOnly: true,
  },
  docx_export: {
    Icon: DocumentTextIcon,
    headline: 'DOCX export is Pro only',
    message: 'Download your brief as a fully-formatted Word document, ready for handoff.',
    proOnly: true,
  },
  shareable_link: {
    Icon: LinkIcon,
    headline: 'Shareable links are a paid feature',
    message: 'Share your brief as a beautiful public page. Available on Starter and Pro.',
  },
  general: {
    Icon: SparklesIcon,
    headline: 'Unlock more of DesignBrief AI',
    message: 'Starter and Pro plans remove the free-plan limits and add powerful AI features.',
  },
}

const STARTER_FEATURES = [
  '300 credits / month',
  '10 projects',
  '2 team members',
  'Full brief history',
  'Clean PDF exports',
]

const PRO_FEATURES = [
  '1,000 credits / month',
  'Unlimited projects',
  '10 team members',
  'Up to 3 workspaces',
  'White-label exports',
  'Client intake forms',
  'Custom templates',
]

// Single source for both the modal trigger (from any page via
// AppContext.openUpgradeModal) and the click handlers.
export default function UpgradeModal({ reason, open, onClose, onUpgrade }) {
  const ctx = useContext(AppContext)
  const currentPlan = ctx?.userPlan || 'free'
  const authUser = ctx?.authUser
  const user = ctx?.user
  const showToast = ctx?.showToast
  const refreshAuthUser = ctx?.refreshAuthUser
  const refreshUserPlan = ctx?.refreshUserPlan

  // Annual gets a 25% discount baked into the Flutterwave charge.
  // 12 × $12 × 0.75 = $108/yr for Starter ; 12 × $29 × 0.75 = $261/yr for Pro.
  const [cycle, setCycle] = useState('monthly') // 'monthly' | 'annual'

  // Per-plan selected credit tier. Defaults to each plan's first
  // (cheapest) tier. The plan card's dropdown changes this; the price
  // and Flutterwave amount react.
  const [starterCredits, setStarterCredits] = useState(CREDIT_TIERS.starter[0].credits)
  const [proCredits, setProCredits] = useState(CREDIT_TIERS.pro[0].credits)
  const selectedCreditsByPlan = { starter: starterCredits, pro: proCredits }

  function priceFor(planKey) {
    const tier = pickTier(planKey, selectedCreditsByPlan[planKey])
    if (!tier) return { display: '$0', interval: '/mo', subPrice: null, amount: 0 }
    if (cycle === 'annual') {
      const yearly = Math.round(tier.monthly * 12 * 0.75 * 100) / 100
      const perMo = Math.round(tier.monthly * 0.75 * 100) / 100
      return {
        display: '$' + yearly,
        interval: '/yr',
        subPrice: '$' + perMo + '/mo billed annually',
        amount: yearly,
      }
    }
    return {
      display: '$' + tier.monthly,
      interval: '/mo',
      subPrice: null,
      amount: tier.monthly,
    }
  }

  useEffect(() => {
    if (!open) return
    function onKey(e) { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  const info = REASONS[reason] || REASONS.general
  const Icon = info.Icon

  // Hide Starter when the user is already on it OR the reason is a Pro-
  // only feature (intake / custom_templates / white_label / docx).
  // A Free user hitting team_members sees both cards. A Starter user
  // hitting any cap sees Pro only.
  const showStarter = currentPlan === 'free' && !info.proOnly
  const showPro = true

  function pickPlan(plan) {
    if (onUpgrade) return onUpgrade(plan)

    // Flutterwave Inline checkout. Public key + payment amount are read
    // from env at build time. The server-side webhook in /api/settings
    // grants the plan when charge.completed fires; the client just
    // needs to open the payment modal and show a friendly result toast.
    const publicKey = import.meta.env.VITE_FLW_PUBLIC_KEY
    if (!publicKey) {
      showToast?.('Billing not configured yet. Email hello@designbrief.app to upgrade.', 'info')
      return
    }
    if (!authUser?.id || !authUser?.email) {
      showToast?.('Please sign in to upgrade.', 'error')
      return
    }
    if (typeof window === 'undefined' || typeof window.FlutterwaveCheckout !== 'function') {
      showToast?.('Payment SDK still loading — try again in a moment.', 'info')
      return
    }
    // Read price + credits from the per-plan tier the user picked in the
    // dropdown. tx_ref embeds plan + cycle + credits so the server can
    // grant the correct credit cap when it processes the webhook /
    // verify_payment call. Credits use a 'c' prefix so the parser can
    // distinguish them from a numeric timestamp in legacy tx_refs.
    const tier = pickTier(plan, selectedCreditsByPlan[plan])
    const monthly = tier?.monthly || (plan === 'pro' ? 29 : 12)
    const amount = cycle === 'annual'
      ? Math.round(monthly * 12 * 0.75 * 100) / 100
      : monthly
    const credits = tier?.credits || (plan === 'pro' ? 1000 : 300)
    const tx_ref = `db_${authUser.id}_${plan}_${cycle}_c${credits}_${Date.now()}`

    // Tracks whether the callback already verified + granted the plan,
    // so the onclose handler doesn't duplicate the work.
    let activated = false

    async function activatePlan(data) {
      if (activated) return
      activated = true
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const token = session?.access_token
        if (!token) throw new Error('No session')
        const res = await fetch('/api/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
          body: JSON.stringify({
            action: 'verify_payment',
            tx_ref: data?.tx_ref || tx_ref,
            transaction_id: data?.transaction_id,
          }),
        })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) {
          showToast?.('Payment received — couldn\'t verify automatically: ' + (json.error || 'try refreshing'), 'error')
          return
        }
        showToast?.('Plan activated 🎉', 'success')
        try { await Promise.all([refreshAuthUser?.(), refreshUserPlan?.()]) } catch {}
      } catch (e) {
        console.error('[activatePlan]', e)
        showToast?.('Payment received — please refresh to see your new plan.', 'info')
      }
    }

    // Remember the pending payment so App.jsx can pick it up after the
    // redirect lands. localStorage survives the round-trip; sessionStorage
    // is wiped by some embedded WebViews.
    try {
      localStorage.setItem('db-pending-payment', JSON.stringify({ tx_ref, plan, at: Date.now() }))
    } catch {}

    onClose?.()
    window.FlutterwaveCheckout({
      public_key: publicKey,
      tx_ref,
      amount,
      currency: 'USD',
      payment_options: 'card,ussd,banktransfer',
      // The v3 inline modal in production routinely skips the JS
      // callback — Flutterwave expects a redirect_url and sends the
      // user back with tx_ref + transaction_id + status in the query
      // string. App.jsx picks the params up and calls verify_payment.
      redirect_url: window.location.origin + '/?flw_callback=1',
      customer: {
        email: authUser.email,
        name: user?.name || authUser?.user_metadata?.full_name || authUser.email,
      },
      customizations: {
        title: 'DesignBrief AI — ' + (plan === 'pro' ? 'Pro' : 'Starter') + (cycle === 'annual' ? ' (Annual)' : ''),
        description: (plan === 'pro' ? 'Unlimited projects + 1,000 credits' : '10 projects + 300 credits') + (cycle === 'annual' ? ' · 25% off' : ''),
        logo: 'https://designbrief-vert.vercel.app/favicon.svg',
      },
      meta: { user_id: authUser.id, plan, billing_cycle: cycle },
      // Belt-and-braces — these fire on browsers that don't take the
      // redirect path. Whichever runs first wins; activatePlan is
      // idempotent because billing_events.tx_ref is unique.
      callback: async (data) => {
        try { window.closePaymentModal?.() } catch {}
        if (data?.status === 'successful' || data?.status === 'completed') {
          await activatePlan(data)
        }
      },
      onclose: async () => {
        await activatePlan({})
      },
    })
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 560,
          maxHeight: '90vh', overflowY: 'auto',
          background: 'var(--color-bg)',
          border: '1px solid var(--color-border)',
          borderRadius: 20,
          fontFamily: 'var(--font-sans)',
          boxShadow: '0 24px 64px rgba(0,0,0,0.35)',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '20px 24px 14px', borderBottom: '1px solid var(--color-border)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <SparklesIcon style={{ width: 16, height: 16, color: '#A855F7' }} />
            <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--color-text)' }}>
              Upgrade DesignBrief AI
            </span>
          </div>
          <button onClick={onClose} style={{
            width: 30, height: 30, borderRadius: 8, background: 'transparent',
            border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <XMarkIcon style={{ width: 16, height: 16 }} />
          </button>
        </div>

        {/* Reason headline */}
        <div style={{ padding: '20px 24px 8px', textAlign: 'center' }}>
          <div style={{
            width: 52, height: 52, borderRadius: 14,
            background: 'linear-gradient(135deg, rgba(124,58,237,0.14), rgba(168,85,247,0.14))',
            border: '1px solid rgba(124,58,237,0.30)',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            marginBottom: 12,
          }}>
            <Icon style={{ width: 22, height: 22, color: '#7C3AED' }} />
          </div>
          <h2 style={{
            margin: 0, fontWeight: 800, fontSize: 20,
            letterSpacing: '-0.02em', color: 'var(--color-text)',
          }}>{info.headline}</h2>
          <p style={{
            margin: '6px 0 0', fontSize: 13, lineHeight: 1.55,
            color: 'var(--color-text-muted)',
          }}>{info.message}</p>
        </div>

        {/* Monthly / Annual toggle */}
        <div style={{ padding: '14px 24px 0', display: 'flex', justifyContent: 'center' }}>
          <CycleToggle value={cycle} onChange={setCycle} />
        </div>

        {/* Plan cards */}
        <div style={{
          padding: '14px 24px 22px',
          display: 'grid',
          gridTemplateColumns: showStarter && showPro
            ? (window.innerWidth < 560 ? '1fr' : '1fr 1fr')
            : '1fr',
          gap: 12,
          maxWidth: showStarter && showPro ? '100%' : 380,
          margin: showStarter && showPro ? undefined : '0 auto',
        }}>
          {showStarter && (() => {
            const p = priceFor('starter')
            return (
              <PlanCard
                name="Starter"
                price={p.display}
                interval={p.interval}
                subPrice={p.subPrice}
                features={STARTER_FEATURES}
                ctaLabel="Upgrade to Starter"
                ctaVariant="outline"
                onClick={() => pickPlan('starter')}
                creditTiers={CREDIT_TIERS.starter}
                selectedCredits={starterCredits}
                onSelectCredits={setStarterCredits}
              />
            )
          })()}
          {showPro && (() => {
            const p = priceFor('pro')
            return (
              <PlanCard
                name="Pro"
                price={p.display}
                interval={p.interval}
                subPrice={p.subPrice}
                features={PRO_FEATURES}
                mostPopular
                ctaLabel="Upgrade to Pro"
                ctaVariant="primary"
                onClick={() => pickPlan('pro')}
                creditTiers={CREDIT_TIERS.pro}
                selectedCredits={proCredits}
                onSelectCredits={setProCredits}
              />
            )
          })()}
        </div>

        {/* Maybe later */}
        <div style={{ padding: '0 24px 22px', textAlign: 'center' }}>
          <button onClick={onClose} style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 500,
            color: 'var(--color-text-muted)',
          }}>
            Maybe later
          </button>
        </div>
      </div>
    </div>
  )
}

// Monthly ⇄ Annual toggle. Annual gets a small "Save 25%" badge so the
// benefit is obvious at a glance.
function CycleToggle({ value, onChange }) {
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: 3, background: 'var(--color-surface)',
      border: '1px solid var(--color-border)', borderRadius: 100,
      fontFamily: 'var(--font-sans)', fontSize: 12, fontWeight: 600,
    }}>
      <button
        onClick={() => onChange('monthly')}
        style={{
          padding: '5px 12px', borderRadius: 100, border: 'none',
          background: value === 'monthly' ? 'var(--color-bg)' : 'transparent',
          color: value === 'monthly' ? 'var(--color-text)' : 'var(--color-text-muted)',
          cursor: 'pointer', boxShadow: value === 'monthly' ? '0 1px 3px rgba(0,0,0,0.10)' : 'none',
        }}
      >Monthly</button>
      <button
        onClick={() => onChange('annual')}
        style={{
          padding: '5px 12px', borderRadius: 100, border: 'none',
          background: value === 'annual' ? 'var(--color-bg)' : 'transparent',
          color: value === 'annual' ? 'var(--color-text)' : 'var(--color-text-muted)',
          cursor: 'pointer', boxShadow: value === 'annual' ? '0 1px 3px rgba(0,0,0,0.10)' : 'none',
          display: 'inline-flex', alignItems: 'center', gap: 5,
        }}
      >
        Annual
        <span style={{
          fontFamily: 'var(--font-sans)', fontSize: 9, fontWeight: 800,
          letterSpacing: '0.04em',
          background: 'rgba(34,197,94,0.12)', color: '#16a34a',
          border: '1px solid rgba(34,197,94,0.30)',
          borderRadius: 100, padding: '1px 6px',
        }}>SAVE 25%</span>
      </button>
    </div>
  )
}

function PlanCard({ name, price, interval, subPrice, features, ctaLabel, ctaVariant, mostPopular, onClick, creditTiers, selectedCredits, onSelectCredits }) {
  const isPro = ctaVariant === 'primary'
  // Skip the first feature line ("300 credits / month" etc) when the
  // card already shows a credit dropdown — the dropdown is the source
  // of truth for that number and a static "300 credits/mo" line below
  // it would conflict with whatever the user has picked.
  const featuresToRender = creditTiers && creditTiers.length > 1
    ? features.slice(1)
    : features
  return (
    <div style={{
      position: 'relative',
      background: mostPopular ? 'linear-gradient(180deg, rgba(124,58,237,0.04), transparent 60%)' : 'var(--color-surface)',
      border: '1.5px solid ' + (mostPopular ? '#8B5CF6' : 'var(--color-border)'),
      borderRadius: 14, padding: '16px 16px 18px',
      display: 'flex', flexDirection: 'column', gap: 12,
    }}>
      {mostPopular && (
        <span style={{
          position: 'absolute', top: -10, left: 12,
          background: 'linear-gradient(135deg, #7C3AED, #A855F7)',
          color: 'white', fontFamily: 'var(--font-sans)', fontSize: 10, fontWeight: 700,
          letterSpacing: '0.06em', textTransform: 'uppercase',
          padding: '3px 9px', borderRadius: 100,
        }}>
          Most popular
        </span>
      )}
      <div>
        <div style={{ fontFamily: 'var(--font-sans)', fontWeight: 700, fontSize: 14, color: 'var(--color-text)' }}>
          {name}
        </div>
        <div style={{ marginTop: 4, display: 'flex', alignItems: 'baseline', gap: 3 }}>
          <span style={{ fontFamily: 'var(--font-sans)', fontWeight: 800, fontSize: 26, color: 'var(--color-text)', letterSpacing: '-0.03em' }}>
            {price}
          </span>
          <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{interval}</span>
        </div>
        {subPrice && (
          <div style={{ marginTop: 3, fontSize: 11, color: 'var(--color-text-muted)' }}>
            {subPrice}
          </div>
        )}
      </div>
      {creditTiers && creditTiers.length > 1 && (
        <CreditTierPicker
          tiers={creditTiers}
          selected={selectedCredits}
          onSelect={onSelectCredits}
          isPro={isPro}
        />
      )}
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {featuresToRender.map(f => (
          <li key={f} style={{
            display: 'flex', alignItems: 'center', gap: 7,
            fontFamily: 'var(--font-sans)', fontSize: 12.5, color: 'var(--color-text)',
          }}>
            <CheckIcon style={{ width: 13, height: 13, color: '#16A34A', flexShrink: 0 }} />
            {f}
          </li>
        ))}
      </ul>
      <button onClick={onClick} style={{
        marginTop: 'auto',
        padding: '9px 12px',
        background: isPro ? 'linear-gradient(135deg, #7C3AED, #A855F7)' : 'transparent',
        color: isPro ? 'white' : 'var(--color-text)',
        border: isPro ? 'none' : '1px solid var(--color-border)',
        borderRadius: 10, cursor: 'pointer',
        fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 700,
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
      }}>
        {ctaLabel} <ArrowRightIcon style={{ width: 12, height: 12 }} />
      </button>
    </div>
  )
}

// ── Credit tier picker ─────────────────────────────────────────────────
// Custom popover dropdown: gradient highlight on the selected tier,
// hover state, the largest tier gets a "Best value" pill, click-outside
// + Escape close. The accent gradient matches the modal so the picker
// reads as part of the plan card, not a stray native control.
function CreditTierPicker({ tiers, selected, onSelect, isPro }) {
  const [open, setOpen] = useState(false)
  const [hover, setHover] = useState(null)
  const wrapRef = useRef(null)

  useEffect(() => {
    if (!open) return
    function onDoc(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    function onKey(e) { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const current = tiers.find(t => t.credits === selected) || tiers[0]
  const accent = isPro ? '#8B5CF6' : '#7C3AED'
  const accentGradient = 'linear-gradient(135deg, #7C3AED, #A855F7)'
  // Largest credit amount = "best value" pill. Only render if there's
  // a clear top tier.
  const maxCredits = Math.max(...tiers.map(t => t.credits))

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <label style={{
        display: 'block',
        fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700,
        letterSpacing: '0.08em', textTransform: 'uppercase',
        color: 'var(--color-text-muted)', marginBottom: 6,
      }}>
        Credits per month
      </label>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        onMouseEnter={e => { e.currentTarget.style.borderColor = accent }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = open ? accent : 'var(--color-border)' }}
        style={{
          width: '100%',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
          padding: '10px 12px',
          background: 'var(--color-bg)',
          border: '1px solid ' + (open ? accent : 'var(--color-border)'),
          borderRadius: 10,
          cursor: 'pointer', outline: 'none',
          fontFamily: 'var(--font-sans)', textAlign: 'left',
          boxShadow: open ? '0 0 0 3px rgba(124,58,237,0.18)' : 'none',
          transition: 'border-color 0.15s, box-shadow 0.15s',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
          <span style={{
            width: 26, height: 26, borderRadius: 8,
            background: accentGradient,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0, boxShadow: '0 4px 10px rgba(124,58,237,0.30)',
          }}>
            <BoltIcon style={{ width: 14, height: 14, color: 'white' }} />
          </span>
          <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <span style={{
              fontSize: 14, fontWeight: 800, color: 'var(--color-text)',
              letterSpacing: '-0.01em', lineHeight: 1.15,
            }}>
              {current.credits.toLocaleString()} credits
            </span>
            <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
              ${current.monthly} / month
            </span>
          </span>
        </span>
        <ChevronDown open={open} color="var(--color-text-muted)" />
      </button>

      {open && (
        <div style={{
          position: 'absolute', left: 0, right: 0, top: 'calc(100% + 6px)',
          background: 'var(--color-bg)',
          border: '1px solid var(--color-border)',
          borderRadius: 12,
          padding: 4,
          zIndex: 20,
          boxShadow: '0 18px 40px rgba(0,0,0,0.22), 0 4px 12px rgba(0,0,0,0.10)',
          animation: 'tierFadeIn 140ms ease-out',
        }}>
          {tiers.map(t => {
            const isSelected = t.credits === selected
            const isHover = hover === t.credits
            const isTop = t.credits === maxCredits && tiers.length > 1
            return (
              <div
                key={t.credits}
                role="button"
                onMouseEnter={() => setHover(t.credits)}
                onMouseLeave={() => setHover(null)}
                onClick={() => { onSelect?.(t.credits); setOpen(false) }}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                  padding: '10px 12px',
                  borderRadius: 9, cursor: 'pointer',
                  background: isSelected
                    ? 'linear-gradient(135deg, rgba(124,58,237,0.10), rgba(168,85,247,0.08))'
                    : (isHover ? 'var(--color-surface)' : 'transparent'),
                  border: '1px solid ' + (isSelected ? 'rgba(124,58,237,0.32)' : 'transparent'),
                  transition: 'background 0.12s, border-color 0.12s',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
                  <span style={{
                    width: 22, height: 22, borderRadius: 7,
                    background: isSelected ? accentGradient : 'var(--color-surface)',
                    border: isSelected ? 'none' : '1px solid var(--color-border)',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    <BoltIcon style={{
                      width: 11, height: 11,
                      color: isSelected ? 'white' : 'var(--color-text-muted)',
                    }} />
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      fontSize: 13, fontWeight: 700, color: 'var(--color-text)',
                      letterSpacing: '-0.01em',
                    }}>
                      {t.credits.toLocaleString()} credits
                      {isTop && (
                        <span style={{
                          fontFamily: 'var(--font-mono)', fontSize: 8, fontWeight: 800,
                          letterSpacing: '0.06em', textTransform: 'uppercase',
                          background: 'rgba(34,197,94,0.14)', color: '#16a34a',
                          border: '1px solid rgba(34,197,94,0.30)',
                          borderRadius: 100, padding: '1px 6px',
                        }}>
                          Best value
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 1 }}>
                      ${t.monthly} / month
                    </div>
                  </div>
                </div>
                {isSelected && (
                  <CheckIcon style={{ width: 14, height: 14, color: accent, flexShrink: 0 }} />
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function ChevronDown({ open, color }) {
  return (
    <svg
      width="11" height="11" viewBox="0 0 24 24" fill="none"
      stroke={color || 'currentColor'}
      strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
      style={{
        transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
        transition: 'transform 0.15s',
        flexShrink: 0,
      }}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  )
}

// Small inline lock chip used by callers next to gated buttons.
export function LockChip({ label = 'Upgrade' }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 7px',
      background: 'rgba(124,58,237,0.10)',
      border: '1px solid rgba(124,58,237,0.30)',
      color: '#7C3AED',
      borderRadius: 100,
      fontFamily: 'var(--font-sans)', fontSize: 10, fontWeight: 700,
      letterSpacing: '0.04em', textTransform: 'uppercase',
    }}>
      <LockClosedIcon style={{ width: 10, height: 10 }} />
      {label}
    </span>
  )
}
