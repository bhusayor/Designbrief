// Magnifying glass with a pulsing "?" in the lens, two alternating
// radar rings expanding outward, four scatter dots representing items
// being scanned, and a lens highlight arc for depth.
export default function SearchIllustration() {
  return (
    <svg
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ width: '100%', height: '100%', overflow: 'visible' }}
    >
      <defs>
        <style>{`
          @keyframes search-glassFloat   { 0%,100% { transform: translateY(0) rotate(0deg); } 50% { transform: translateY(-5px) rotate(3deg); } }
          @keyframes search-radarPulse   { 0% { transform: scale(0.8); opacity: 0.8; } 100% { transform: scale(1.8); opacity: 0; } }
          @keyframes search-dotScatter   { 0%,100% { opacity: 0.3; transform: scale(1); } 50% { opacity: 0.8; transform: scale(1.3); } }
          @keyframes search-questionPulse { 0%,100% { opacity: 0.5; } 50% { opacity: 1; } }

          .search-glass-float    { animation: search-glassFloat 5s ease-in-out infinite; transform-origin: 52px 52px; }
          .search-radar          { animation: search-radarPulse 3s ease-out infinite; transform-origin: 52px 52px; }
          .search-radar-2        { animation: search-radarPulse 3s ease-out infinite; animation-delay: -1.5s; transform-origin: 52px 52px; }
          .search-question       { animation: search-questionPulse 2s ease-in-out infinite; transform-origin: 52px 50px; }
          .search-dot-1          { animation: search-dotScatter 2s ease-in-out infinite; transform-origin: 14px 30px; }
          .search-dot-2          { animation: search-dotScatter 2s ease-in-out infinite; animation-delay: -0.7s; transform-origin: 100px 22px; }
          .search-dot-3          { animation: search-dotScatter 2s ease-in-out infinite; animation-delay: -1.4s; transform-origin: 20px 90px; }
          .search-dot-4          { animation: search-dotScatter 2s ease-in-out infinite; animation-delay: -0.3s; transform-origin: 106px 78px; }
        `}</style>
      </defs>

      {/* Radar rings */}
      <circle cx="52" cy="52" r="30" fill="none" stroke="#8B5CF6" strokeWidth="1" strokeOpacity="0.3" className="search-radar" />
      <circle cx="52" cy="52" r="30" fill="none" stroke="#8B5CF6" strokeWidth="1" strokeOpacity="0.3" className="search-radar-2" />

      {/* Magnifying glass */}
      <g className="search-glass-float">
        <circle cx="50" cy="50" r="26" fill="rgba(139,92,246,0.1)"  stroke="#8B5CF6" strokeWidth="2.5" />
        <circle cx="50" cy="50" r="20" fill="rgba(139,92,246,0.06)" stroke="#8B5CF6" strokeWidth="1" strokeOpacity="0.3" />
        <line x1="70" y1="70" x2="86" y2="86" stroke="#8B5CF6" strokeWidth="4" strokeLinecap="round" />
        <circle cx="88" cy="88" r="3" fill="rgba(139,92,246,0.4)" stroke="#8B5CF6" strokeWidth="1.5" />
        {/* Lens highlight */}
        <path d="M38 34 C34 38 32 44 33 50" stroke="rgba(255,255,255,0.15)" strokeWidth="2" strokeLinecap="round" fill="none" />
        {/* Question mark */}
        <text
          x="50" y="58"
          fontFamily="Urbanist, sans-serif"
          fontWeight="700"
          fontSize="22"
          fill="#8B5CF6"
          textAnchor="middle"
          opacity="0.7"
          className="search-question"
        >?</text>
      </g>

      {/* Scatter dots */}
      <circle cx="14"  cy="30" r="4"   fill="rgba(139,92,246,0.3)" stroke="#8B5CF6" strokeWidth="1.5" className="search-dot-1" />
      <circle cx="100" cy="22" r="3"   fill="rgba(139,92,246,0.2)" stroke="#8B5CF6" strokeWidth="1"   className="search-dot-2" />
      <circle cx="20"  cy="90" r="3"   fill="rgba(167,139,250,0.3)" stroke="#A78BFA" strokeWidth="1"  className="search-dot-3" />
      <circle cx="106" cy="78" r="2.5" fill="rgba(196,181,253,0.4)" className="search-dot-4" />

      {/* Extra accent */}
      <circle cx="92" cy="104" r="2" fill="#8B5CF6" opacity="0.3" />
    </svg>
  )
}
