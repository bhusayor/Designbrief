// Three stacked folder cards floating at staggered tempos, with a
// "+" badge fading above and a sparkle pulsing at the corner. The
// design system: #8B5CF6 primary, viewBox 120x120, 1.5/2px strokes,
// outlined + filled shapes only, CSS-keyframe driven (no JS).
export default function ProjectsIllustration() {
  return (
    <svg
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ width: '100%', height: '100%', overflow: 'visible' }}
    >
      <defs>
        <style>{`
          @keyframes proj-floatA { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
          @keyframes proj-floatB { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }
          @keyframes proj-floatC { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-5px); } }
          @keyframes proj-sparkle { 0%,100% { transform: scale(1); opacity: 0.6; } 50% { transform: scale(1.4); opacity: 1; } }
          @keyframes proj-plus { 0%,100% { opacity: 0.4; transform: scale(0.9); } 50% { opacity: 1; transform: scale(1.1); } }
          .proj-float-a { animation: proj-floatA 6s ease-in-out infinite; transform-origin: 60px 46px; }
          .proj-float-b { animation: proj-floatB 7s ease-in-out infinite; animation-delay: -2s; transform-origin: 60px 65px; }
          .proj-float-c { animation: proj-floatC 8s ease-in-out infinite; animation-delay: -4s; transform-origin: 60px 85px; }
          .proj-sparkle { animation: proj-sparkle 3s ease-in-out infinite; transform-origin: 95px 23px; }
          .proj-plus    { animation: proj-plus    4s ease-in-out infinite; transform-origin: 60px 18px; }
        `}</style>
      </defs>

      {/* Back card */}
      <g className="proj-float-c">
        <rect x="22" y="72" width="76" height="44" rx="8" fill="rgba(139,92,246,0.08)" stroke="#8B5CF6" strokeWidth="1.5" strokeOpacity="0.3" />
        <line x1="32" y1="86" x2="76" y2="86" stroke="#8B5CF6" strokeWidth="1.5" strokeOpacity="0.3" strokeLinecap="round" />
        <line x1="32" y1="94" x2="64" y2="94" stroke="#8B5CF6" strokeWidth="1.5" strokeOpacity="0.2" strokeLinecap="round" />
      </g>

      {/* Mid card */}
      <g className="proj-float-b">
        <rect x="18" y="52" width="76" height="44" rx="8" fill="rgba(139,92,246,0.12)" stroke="#8B5CF6" strokeWidth="1.5" strokeOpacity="0.5" />
        <path d="M18 62 C18 62 26 52 38 52" stroke="#8B5CF6" strokeWidth="1.5" strokeOpacity="0.5" fill="none" />
        <line x1="28" y1="66" x2="72" y2="66" stroke="#8B5CF6" strokeWidth="1.5" strokeOpacity="0.4" strokeLinecap="round" />
        <line x1="28" y1="74" x2="58" y2="74" stroke="#8B5CF6" strokeWidth="1.5" strokeOpacity="0.3" strokeLinecap="round" />
      </g>

      {/* Front card */}
      <g className="proj-float-a">
        <rect x="14" y="28" width="76" height="48" rx="10" fill="rgba(139,92,246,0.18)" stroke="#8B5CF6" strokeWidth="2" />
        <path d="M14 42 C14 42 24 28 42 28" stroke="#8B5CF6" strokeWidth="2" fill="none" />
        <line x1="24" y1="46" x2="70" y2="46" stroke="#8B5CF6" strokeWidth="2" strokeLinecap="round" />
        <line x1="24" y1="56" x2="60" y2="56" stroke="#8B5CF6" strokeWidth="2" strokeLinecap="round" strokeOpacity="0.7" />
        <line x1="24" y1="66" x2="50" y2="66" stroke="#8B5CF6" strokeWidth="2" strokeLinecap="round" strokeOpacity="0.4" />
      </g>

      {/* Sparkle */}
      <g className="proj-sparkle">
        <path d="M95 18 L96 22 L100 22 L97 24 L98 28 L95 26 L92 28 L93 24 L90 22 L94 22 Z" fill="#C4B5FD" opacity="0.8" />
      </g>

      {/* Plus badge */}
      <g className="proj-plus">
        <circle cx="60" cy="18" r="8" fill="rgba(139,92,246,0.15)" stroke="#8B5CF6" strokeWidth="1.5" />
        <line x1="60" y1="14" x2="60" y2="22" stroke="#8B5CF6" strokeWidth="2" strokeLinecap="round" />
        <line x1="56" y1="18" x2="64" y2="18" stroke="#8B5CF6" strokeWidth="2" strokeLinecap="round" />
      </g>

      {/* Decoration */}
      <circle cx="16"  cy="44" r="2"   fill="#8B5CF6" opacity="0.3" />
      <circle cx="104" cy="70" r="2"   fill="#8B5CF6" opacity="0.2" />
      <circle cx="100" cy="40" r="1.5" fill="#C4B5FD" opacity="0.5" />
    </svg>
  )
}
