import { useContext, useEffect } from 'react'
import AppContext from '../context/AppContext'
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
    headline: "You're out of credits",
    message: 'Upgrade to get 300–1,000 credits per month and keep translating briefs without interruption.',
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
    // Default fallback — open settings/billing route if it exists.
    try { window.location.assign('/?upgrade=' + plan) } catch {}
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

        {/* Plan cards */}
        <div style={{
          padding: '18px 24px 22px',
          display: 'grid',
          gridTemplateColumns: showStarter && showPro
            ? (window.innerWidth < 560 ? '1fr' : '1fr 1fr')
            : '1fr',
          gap: 12,
          maxWidth: showStarter && showPro ? '100%' : 380,
          margin: showStarter && showPro ? undefined : '0 auto',
        }}>
          {showStarter && (
            <PlanCard
              name="Starter"
              price="$12"
              interval="/mo"
              features={STARTER_FEATURES}
              ctaLabel="Upgrade to Starter"
              ctaVariant="outline"
              onClick={() => pickPlan('starter')}
            />
          )}
          {showPro && (
            <PlanCard
              name="Pro"
              price="$29"
              interval="/mo"
              features={PRO_FEATURES}
              mostPopular
              ctaLabel="Upgrade to Pro"
              ctaVariant="primary"
              onClick={() => pickPlan('pro')}
            />
          )}
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

function PlanCard({ name, price, interval, features, ctaLabel, ctaVariant, mostPopular, onClick }) {
  const isPro = ctaVariant === 'primary'
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
      </div>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {features.map(f => (
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
