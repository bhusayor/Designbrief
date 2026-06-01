// Three-peak crown with a center gem, two base gems, and a base
// rectangle. A pulsing radial glow behind it. A star and a circle
// orbit on opposite sides. A lightning bolt below pulses in opacity.
// Two corner sparkles twinkle. Crown bobs gently.
export default function UpgradeIllustration() {
  return (
    <svg
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ width: '100%', height: '100%', overflow: 'visible' }}
    >
      <defs>
        <style>{`
          @keyframes upgrade-crownFloat  { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
          @keyframes upgrade-glowExpand  { 0%,100% { transform: scale(1);   opacity: 0.15; } 50% { transform: scale(1.2); opacity: 0.25; } }
          @keyframes upgrade-starOrbit   { from { transform: rotate(0deg)   translateX(36px) rotate(0deg);    } to { transform: rotate(360deg) translateX(36px) rotate(-360deg); } }
          @keyframes upgrade-circleOrbit { from { transform: rotate(180deg) translateX(36px) rotate(-180deg); } to { transform: rotate(540deg) translateX(36px) rotate(-540deg); } }
          @keyframes upgrade-boltPulse   { 0%,100% { opacity: 0.6; } 50% { opacity: 1; } }
          @keyframes upgrade-sparkle     { 0%,100% { transform: translateY(0)    scale(1);   opacity: 0.6; } 50% { transform: translateY(-4px) scale(1.3); opacity: 1; } }

          .upgrade-crown-float  { animation: upgrade-crownFloat 4s ease-in-out infinite; transform-origin: 60px 52px; }
          .upgrade-glow         { animation: upgrade-glowExpand 3s ease-in-out infinite; transform-origin: 60px 52px; }
          .upgrade-star-orbit   { animation: upgrade-starOrbit 8s linear infinite; transform-origin: 60px 52px; }
          .upgrade-circle-orbit { animation: upgrade-circleOrbit 8s linear infinite; transform-origin: 60px 52px; }
          .upgrade-bolt         { animation: upgrade-boltPulse 2s ease-in-out infinite; }
          .upgrade-sparkle-1    { animation: upgrade-sparkle 3s   ease-in-out infinite; transform-origin: 22px 40px; }
          .upgrade-sparkle-2    { animation: upgrade-sparkle 3.5s ease-in-out infinite; animation-delay: -1.5s; transform-origin: 98px 44px; }
        `}</style>
      </defs>

      {/* Background glow */}
      <circle cx="60" cy="52" r="40" fill="rgba(139,92,246,0.12)" className="upgrade-glow" />

      {/* Crown */}
      <g className="upgrade-crown-float">
        {/* Crown body */}
        <path d="M24 62 L24 38 L40 52 L60 28 L80 52 L96 38 L96 62 Z" fill="rgba(139,92,246,0.2)" stroke="#8B5CF6" strokeWidth="2" strokeLinejoin="round" />
        {/* Base rectangle */}
        <rect x="24" y="62" width="72" height="14" rx="4" fill="rgba(139,92,246,0.25)" stroke="#8B5CF6" strokeWidth="2" />
        {/* Center gem */}
        <circle cx="60" cy="36" r="6" fill="rgba(139,92,246,0.5)" stroke="#8B5CF6" strokeWidth="1.5" />
        <circle cx="60" cy="36" r="3" fill="#8B5CF6" />
        {/* Base gems */}
        <circle cx="30" cy="62" r="4" fill="rgba(139,92,246,0.4)" stroke="#8B5CF6" strokeWidth="1.5" />
        <circle cx="90" cy="62" r="4" fill="rgba(139,92,246,0.4)" stroke="#8B5CF6" strokeWidth="1.5" />
        {/* Inner highlight */}
        <path d="M34 54 C32 50 32 44 34 40" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5" strokeLinecap="round" fill="none" />
      </g>

      {/* Lightning bolt */}
      <path d="M56 82 L50 96 L58 94 L54 110 L70 92 L62 94 Z" fill="rgba(139,92,246,0.3)" stroke="#8B5CF6" strokeWidth="1.5" strokeLinejoin="round" className="upgrade-bolt" />

      {/* Orbiting star — centered on (60,52), drawn at origin so the orbit
          translation displaces it cleanly. */}
      <g className="upgrade-star-orbit">
        <path d="M60 46 L61.5 50 L66 50 L62.5 52.5 L64 57 L60 54 L56 57 L57.5 52.5 L54 50 L58.5 50 Z" fill="#C4B5FD" opacity="0.9" />
      </g>

      {/* Orbiting circle */}
      <g className="upgrade-circle-orbit">
        <circle cx="60" cy="52" r="4" fill="rgba(167,139,250,0.6)" stroke="#A78BFA" strokeWidth="1" />
      </g>

      {/* Corner sparkles */}
      <g className="upgrade-sparkle-1">
        <path d="M22 35 L23 39 L27 39 L24 41 L25 45 L22 43 L19 45 L20 41 L17 39 L21 39 Z" fill="#C4B5FD" opacity="0.7" />
      </g>
      <g className="upgrade-sparkle-2">
        <path d="M98 39 L99 43 L103 43 L100 45 L101 49 L98 47 L95 49 L96 45 L93 43 L97 43 Z" fill="#C4B5FD" opacity="0.6" />
      </g>
    </svg>
  )
}
