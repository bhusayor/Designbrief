// AI-written document — page floats while lines reveal sequentially
// left-to-right, a sparkle wand orbits the top edge, and an AI dot
// pulses overhead. Class names namespaced with `brief-` so the inline
// <style> block can't collide with other illustrations in the DOM.
export default function BriefIllustration() {
  return (
    <svg
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ width: '100%', height: '100%', overflow: 'visible' }}
    >
      <defs>
        <style>{`
          @keyframes brief-float    { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-5px); } }
          @keyframes brief-reveal   { from { stroke-dashoffset: 60; } to { stroke-dashoffset: 0; } }
          @keyframes brief-reveal40 { from { stroke-dashoffset: 40; } to { stroke-dashoffset: 0; } }
          @keyframes brief-reveal50 { from { stroke-dashoffset: 50; } to { stroke-dashoffset: 0; } }
          @keyframes brief-orbit    { from { transform: rotate(0deg)   translateX(28px) rotate(0deg);    } to { transform: rotate(360deg) translateX(28px) rotate(-360deg); } }
          @keyframes brief-aiPulse  { 0%,100% { transform: scale(1); opacity: 0.7; } 50% { transform: scale(1.2); opacity: 1; } }
          .brief-float      { animation: brief-float 5s ease-in-out infinite; transform-origin: 60px 70px; }
          .brief-line-1     { stroke-dasharray: 60; stroke-dashoffset: 60; animation: brief-reveal   0.6s cubic-bezier(0.77,0,0.175,1) 0.5s forwards; }
          .brief-line-2     { stroke-dasharray: 60; stroke-dashoffset: 60; animation: brief-reveal   0.6s cubic-bezier(0.77,0,0.175,1) 0.9s forwards; }
          .brief-line-3     { stroke-dasharray: 60; stroke-dashoffset: 60; animation: brief-reveal   0.6s cubic-bezier(0.77,0,0.175,1) 1.3s forwards; }
          .brief-line-4     { stroke-dasharray: 40; stroke-dashoffset: 40; animation: brief-reveal40 0.6s cubic-bezier(0.77,0,0.175,1) 1.7s forwards; }
          .brief-wand-orbit { animation: brief-orbit 8s linear infinite; transform-origin: 60px 58px; }
          .brief-ai-pulse   { animation: brief-aiPulse 2s ease-in-out infinite; transform-origin: 60px 18px; }
        `}</style>
      </defs>

      {/* Document */}
      <g className="brief-float">
        <rect x="26" y="34" width="68" height="80" rx="10" fill="rgba(139,92,246,0.06)" />
        <rect x="22" y="30" width="68" height="80" rx="10" fill="rgba(139,92,246,0.12)" stroke="#8B5CF6" strokeWidth="2" />
        <path d="M78 30 L90 30 L90 42 Z" fill="rgba(139,92,246,0.2)" stroke="#8B5CF6" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M78 30 L78 42 L90 42" stroke="#8B5CF6" strokeWidth="1.5" fill="none" />

        {/* Heading */}
        <line x1="32" y1="46" x2="72" y2="46" stroke="#8B5CF6" strokeWidth="2.5" strokeLinecap="round" className="brief-line-1" />
        {/* Divider */}
        <line x1="32" y1="54" x2="80" y2="54" stroke="#8B5CF6" strokeWidth="0.75" strokeOpacity="0.3" />
        {/* Body */}
        <line x1="32" y1="62" x2="80" y2="62" stroke="#8B5CF6" strokeWidth="1.5" strokeLinecap="round" strokeOpacity="0.7" className="brief-line-2" />
        <line x1="32" y1="72" x2="80" y2="72" stroke="#8B5CF6" strokeWidth="1.5" strokeLinecap="round" strokeOpacity="0.7" className="brief-line-3" />
        <line x1="32" y1="82" x2="62" y2="82" stroke="#8B5CF6" strokeWidth="1.5" strokeLinecap="round" strokeOpacity="0.5" className="brief-line-4" />

        {/* Color swatches */}
        <circle cx="36" cy="96" r="5" fill="#8B5CF6" opacity="0.8" />
        <circle cx="50" cy="96" r="5" fill="#A78BFA" opacity="0.6" />
        <circle cx="64" cy="96" r="5" fill="#C4B5FD" opacity="0.4" />
      </g>

      {/* Orbiting wand */}
      <g className="brief-wand-orbit">
        <circle cx="60" cy="30" r="5" fill="rgba(139,92,246,0.2)" stroke="#8B5CF6" strokeWidth="1.5" />
        <path d="M57 25 L60 20 L63 25" stroke="#C4B5FD" strokeWidth="1.5" fill="none" />
      </g>

      {/* AI pulse */}
      <g className="brief-ai-pulse">
        <circle cx="60" cy="18" r="6"   fill="rgba(139,92,246,0.15)" stroke="#8B5CF6" strokeWidth="1.5" />
        <circle cx="60" cy="18" r="2.5" fill="#8B5CF6" />
      </g>

      {/* Sparkles */}
      <g opacity="0.6">
        <circle cx="18"  cy="50" r="1.5" fill="#C4B5FD" />
        <circle cx="104" cy="38" r="1.5" fill="#C4B5FD" />
        <circle cx="108" cy="90" r="1"   fill="#8B5CF6" />
        <circle cx="16"  cy="88" r="1"   fill="#8B5CF6" />
      </g>
    </svg>
  )
}
