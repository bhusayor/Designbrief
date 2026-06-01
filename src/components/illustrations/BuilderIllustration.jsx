// Magic wand with three particles orbiting the star tip. Below, a
// website wireframe rect draws itself, then three content lines
// reveal sequentially. A dashed circuit links the wand to the
// wireframe. Build-style "AI is generating" feel.
export default function BuilderIllustration() {
  return (
    <svg
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ width: '100%', height: '100%', overflow: 'visible' }}
    >
      <defs>
        <style>{`
          @keyframes builder-wandGlow { 0%,100% { filter: drop-shadow(0 0 4px rgba(139,92,246,0.4));  } 50% { filter: drop-shadow(0 0 12px rgba(139,92,246,0.9)); } }
          @keyframes builder-orbit1   { from { transform: rotate(0deg)   translateX(24px) rotate(0deg);    } to { transform: rotate(360deg) translateX(24px) rotate(-360deg); } }
          @keyframes builder-orbit2   { from { transform: rotate(120deg) translateX(24px) rotate(-120deg); } to { transform: rotate(480deg) translateX(24px) rotate(-480deg); } }
          @keyframes builder-orbit3   { from { transform: rotate(240deg) translateX(24px) rotate(-240deg); } to { transform: rotate(600deg) translateX(24px) rotate(-600deg); } }
          @keyframes builder-rectDraw { from { stroke-dashoffset: 220; } to { stroke-dashoffset: 0; } }
          @keyframes builder-lineDraw60 { from { stroke-dashoffset: 60; } to { stroke-dashoffset: 0; } }
          @keyframes builder-lineDraw40 { from { stroke-dashoffset: 40; } to { stroke-dashoffset: 0; } }

          .builder-wand-glow  { animation: builder-wandGlow 2s ease-in-out infinite; }
          .builder-orbit-1    { animation: builder-orbit1 5s linear infinite; transform-origin: 72px 20px; }
          .builder-orbit-2    { animation: builder-orbit2 5s linear infinite; animation-delay: -1.67s; transform-origin: 72px 20px; }
          .builder-orbit-3    { animation: builder-orbit3 5s linear infinite; animation-delay: -3.33s; transform-origin: 72px 20px; }
          .builder-rect-draw  { stroke-dasharray: 220; stroke-dashoffset: 220; animation: builder-rectDraw 1.2s cubic-bezier(0.77,0,0.175,1) 0.5s forwards; }
          .builder-line-1     { stroke-dasharray: 60;  stroke-dashoffset: 60;  animation: builder-lineDraw60 0.5s cubic-bezier(0.77,0,0.175,1) 1.8s forwards; }
          .builder-line-2     { stroke-dasharray: 60;  stroke-dashoffset: 60;  animation: builder-lineDraw60 0.5s cubic-bezier(0.77,0,0.175,1) 2.2s forwards; }
          .builder-line-3     { stroke-dasharray: 40;  stroke-dashoffset: 40;  animation: builder-lineDraw40 0.5s cubic-bezier(0.77,0,0.175,1) 2.6s forwards; }
        `}</style>
      </defs>

      {/* Wand */}
      <g className="builder-wand-glow">
        <line x1="30" y1="70" x2="70" y2="22" stroke="#8B5CF6" strokeWidth="3" strokeLinecap="round" />
        {/* Star tip at (72,20) */}
        <path d="M72 13 L74 18 L80 18 L75 22 L77 28 L72 24 L67 28 L69 22 L64 18 L70 18 Z" fill="rgba(139,92,246,0.3)" stroke="#8B5CF6" strokeWidth="1.5" strokeLinejoin="round" />
        {/* Wand handle */}
        <circle cx="35" cy="65" r="4" fill="rgba(139,92,246,0.2)" stroke="#8B5CF6" strokeWidth="1.5" />
      </g>

      {/* Orbiting particles around (72, 20) */}
      <g className="builder-orbit-1">
        <circle cx="72" cy="20" r="4" fill="rgba(139,92,246,0.3)" stroke="#8B5CF6" strokeWidth="1.5" />
      </g>
      <g className="builder-orbit-2">
        <path d="M72 16 L73 19 L76 19 L74 21 L75 24 L72 22 L69 24 L70 21 L68 19 L71 19 Z" fill="#C4B5FD" opacity="0.8" />
      </g>
      <g className="builder-orbit-3">
        <circle cx="72" cy="20" r="3" fill="rgba(167,139,250,0.5)" stroke="#A78BFA" strokeWidth="1" />
      </g>

      {/* Dashed connector wand-tip → wireframe */}
      <path d="M68 26 L52 76" stroke="#8B5CF6" strokeOpacity="0.4" strokeWidth="1.5" strokeDasharray="3 2" strokeLinecap="round" fill="none" />

      {/* Website wireframe rect */}
      <rect
        x="14" y="76" width="86" height="36" rx="6"
        fill="rgba(139,92,246,0.06)"
        stroke="#8B5CF6" strokeOpacity="0.6" strokeWidth="1.5"
        className="builder-rect-draw"
      />

      {/* Content lines */}
      <line x1="22" y1="88"  x2="68" y2="88"  stroke="#8B5CF6" strokeWidth="2"   strokeLinecap="round" className="builder-line-1" />
      <line x1="22" y1="96"  x2="80" y2="96"  stroke="#8B5CF6" strokeWidth="1.5" strokeLinecap="round" strokeOpacity="0.6" className="builder-line-2" />
      <line x1="22" y1="104" x2="58" y2="104" stroke="#8B5CF6" strokeWidth="1.5" strokeLinecap="round" strokeOpacity="0.4" className="builder-line-3" />

      {/* Decoration */}
      <circle cx="10"  cy="50" r="1.5" fill="#C4B5FD" opacity="0.5" />
      <circle cx="108" cy="54" r="1.5" fill="#C4B5FD" opacity="0.4" />
      <circle cx="14"  cy="76" r="2"   fill="#8B5CF6" opacity="0.6" />
      <circle cx="100" cy="76" r="2"   fill="#8B5CF6" opacity="0.4" />
    </svg>
  )
}
