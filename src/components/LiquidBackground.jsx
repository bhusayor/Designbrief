import { LIQUID_DEFAULTS } from '../lib/motion'

// ────────────────────────────────────────────────────────────────────
// LiquidBackground, three slow-moving blobs you drop behind hero
// content. Pure CSS, no scripts, no Pexels round-trip. Default palette
// uses the DesignBrief purple gradient; pass color1 / color2 to match
// a brief's brand.
//
// Mount inside a position: relative parent and place your real content
// in a sibling that wins on z-index (>= 1). The component itself is
// pointer-events: none so it never intercepts clicks.
// ────────────────────────────────────────────────────────────────────

export default function LiquidBackground({
  color1 = LIQUID_DEFAULTS.color1,
  color2 = LIQUID_DEFAULTS.color2,
  opacity = LIQUID_DEFAULTS.opacity,
  className,
  style,
}) {
  return (
    <div
      aria-hidden
      className={className}
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        pointerEvents: 'none',
        zIndex: 0,
        ...style,
      }}
    >
      <style>{`
        @keyframes liquidBlob1 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33%      { transform: translate(60px, 40px) scale(1.15); }
          66%      { transform: translate(-30px, 60px) scale(0.9); }
        }
        @keyframes liquidBlob2 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33%      { transform: translate(-50px, -30px) scale(1.1); }
          66%      { transform: translate(40px, -50px) scale(0.95); }
        }
        @keyframes liquidBlob3 {
          0%, 100% { transform: translate(-50%, -50%) scale(1) rotate(0deg); }
          50%      { transform: translate(-50%, -50%) scale(1.18) rotate(180deg); }
        }
        @media (prefers-reduced-motion: reduce) {
          .liquid-blob { animation: none !important; }
        }
      `}</style>

      <div className="liquid-blob" style={{
        position: 'absolute',
        width: 500, height: 500, borderRadius: '50%',
        background: color1, opacity, filter: 'blur(80px)',
        top: -150, left: -100,
        animation: 'liquidBlob1 12s ease-in-out infinite',
      }} />

      <div className="liquid-blob" style={{
        position: 'absolute',
        width: 400, height: 400, borderRadius: '50%',
        background: color2, opacity: opacity * 0.8, filter: 'blur(60px)',
        bottom: -100, right: -80,
        animation: 'liquidBlob2 16s ease-in-out infinite',
      }} />

      <div className="liquid-blob" style={{
        position: 'absolute',
        width: 300, height: 300,
        borderRadius: '40% 60% 70% 30% / 40% 50% 60% 50%',
        background: color1, opacity: opacity * 0.5, filter: 'blur(50px)',
        top: '40%', left: '40%',
        transform: 'translate(-50%, -50%)',
        animation: 'liquidBlob3 10s ease-in-out infinite',
      }} />
    </div>
  )
}
