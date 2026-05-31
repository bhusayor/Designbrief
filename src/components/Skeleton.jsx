// ────────────────────────────────────────────────────────────────────
// Skeleton.jsx — shimmer placeholders for loading states. The base
// SkeletonBox runs a CSS keyframe shimmer (defined in index.css as
// @keyframes shimmer), so adding more variants is just composition.
//
// Variants ship for every list/grid that currently flashes empty
// while data loads: project cards, kanban tasks, brief history,
// billing rows, team members, AI build queue.
// ────────────────────────────────────────────────────────────────────

export function SkeletonBox({
  width = '100%',
  height = 16,
  borderRadius = 8,
  style,
}) {
  return (
    <div
      style={{
        width,
        height,
        borderRadius,
        background:
          'linear-gradient(90deg, var(--color-surface) 25%, var(--color-surface-2) 50%, var(--color-surface) 75%)',
        backgroundSize: '200% 100%',
        animation: 'shimmer 1.8s ease infinite',
        flexShrink: 0,
        ...style,
      }}
    />
  )
}

export function ProjectCardSkeleton() {
  return (
    <div
      style={{
        background: 'var(--color-card)',
        border: '1px solid var(--color-border)',
        borderRadius: 16,
        padding: 20,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <SkeletonBox height={20} width="60%" />
      <SkeletonBox height={14} width="40%" />
      <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
        <SkeletonBox width={32} height={32} borderRadius="50%" />
        <SkeletonBox width={32} height={32} borderRadius="50%" />
        <SkeletonBox height={8} width={100} style={{ marginLeft: 'auto' }} />
      </div>
      <SkeletonBox height={6} borderRadius={99} />
    </div>
  )
}

export function KanbanTaskSkeleton() {
  return (
    <div
      style={{
        background: 'var(--color-card)',
        border: '1px solid var(--color-border)',
        borderRadius: 12,
        padding: 14,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <SkeletonBox height={16} width="80%" />
      <SkeletonBox height={12} width="55%" />
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
        <SkeletonBox width={60} height={22} borderRadius={99} />
        <SkeletonBox width={28} height={28} borderRadius="50%" />
      </div>
    </div>
  )
}

export function BriefHistorySkeleton() {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        padding: 16,
        borderBottom: '1px solid var(--color-border)',
      }}
    >
      <SkeletonBox width={40} height={40} borderRadius={10} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <SkeletonBox height={15} width="45%" />
        <SkeletonBox height={12} width="30%" />
      </div>
      <SkeletonBox width={80} height={30} borderRadius={8} />
    </div>
  )
}

export function BillingRowSkeleton() {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        padding: 16,
        borderBottom: '1px solid var(--color-border)',
      }}
    >
      <SkeletonBox height={14} width={100} />
      <SkeletonBox height={14} width={80} />
      <SkeletonBox height={14} width={60} />
      <SkeletonBox width={70} height={28} borderRadius={8} style={{ marginLeft: 'auto' }} />
    </div>
  )
}

export function TeamMemberSkeleton() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12 }}>
      <SkeletonBox width={40} height={40} borderRadius="50%" />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <SkeletonBox height={14} width="35%" />
        <SkeletonBox height={11} width="50%" />
      </div>
      <SkeletonBox width={60} height={24} borderRadius={99} />
    </div>
  )
}

export function BuildQueueSkeleton() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px' }}>
      <SkeletonBox width={8} height={8} borderRadius="50%" />
      <SkeletonBox height={14} width="70%" />
      <SkeletonBox width={50} height={20} borderRadius={99} style={{ marginLeft: 'auto' }} />
    </div>
  )
}
