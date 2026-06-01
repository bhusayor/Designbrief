// Three avatars connected by dashed lines that draw themselves, a
// pulsing ring behind the central avatar, and a "+" badge bouncing
// above. Dropped the unreferenced `dotTravel1` keyframe from the
// original spec.
export default function TeamIllustration() {
  return (
    <svg
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ width: '100%', height: '100%', overflow: 'visible' }}
    >
      <defs>
        <style>{`
          @keyframes team-pulseA  { 0%,100% { transform: scale(1); } 50% { transform: scale(1.06); } }
          @keyframes team-pulseB  { 0%,100% { transform: scale(1); } 50% { transform: scale(1.04); } }
          @keyframes team-lineDraw { from { stroke-dashoffset: 80; } to { stroke-dashoffset: 0; } }
          @keyframes team-bounce  { 0%,100% { transform: translateY(0) scale(1); } 50% { transform: translateY(-5px) scale(1.1); } }
          @keyframes team-ring    { 0% { transform: scale(1); opacity: 0.4; } 100% { transform: scale(2); opacity: 0; } }
          .team-avatar-1 { animation: team-pulseA 4s   ease-in-out infinite; transform-origin: 60px 58px; }
          .team-avatar-2 { animation: team-pulseB 5s   ease-in-out infinite; animation-delay: -1.5s; transform-origin: 24px 82px; }
          .team-avatar-3 { animation: team-pulseB 4.5s ease-in-out infinite; animation-delay: -3s;   transform-origin: 96px 82px; }
          .team-line-1   { stroke-dasharray: 80; stroke-dashoffset: 80; animation: team-lineDraw 0.8s cubic-bezier(0.77,0,0.175,1) 0.3s forwards; }
          .team-line-2   { stroke-dasharray: 80; stroke-dashoffset: 80; animation: team-lineDraw 0.8s cubic-bezier(0.77,0,0.175,1) 0.6s forwards; }
          .team-plus     { animation: team-bounce 3s ease-in-out infinite; transform-origin: 60px 24px; }
          .team-ring     { animation: team-ring 3s ease-out infinite; transform-origin: 60px 58px; }
        `}</style>
      </defs>

      {/* Connection lines */}
      <line x1="60" y1="68" x2="34" y2="78" stroke="#8B5CF6" strokeWidth="1.5" strokeOpacity="0.4" strokeLinecap="round" strokeDasharray="4 3" className="team-line-1" />
      <line x1="60" y1="68" x2="86" y2="78" stroke="#8B5CF6" strokeWidth="1.5" strokeOpacity="0.4" strokeLinecap="round" strokeDasharray="4 3" className="team-line-2" />
      <line x1="34" y1="82" x2="86" y2="82" stroke="#8B5CF6" strokeWidth="1"   strokeOpacity="0.2" strokeLinecap="round" strokeDasharray="3 4" />

      {/* Pulse ring */}
      <circle cx="60" cy="58" r="20" fill="none" stroke="#8B5CF6" strokeWidth="1" strokeOpacity="0.3" className="team-ring" />

      {/* Central avatar */}
      <g className="team-avatar-1">
        <circle cx="60" cy="58" r="18" fill="rgba(139,92,246,0.15)" stroke="#8B5CF6" strokeWidth="2" />
        <circle cx="60" cy="52" r="6"  fill="rgba(139,92,246,0.4)" stroke="#8B5CF6" strokeWidth="1.5" />
        <path d="M46 72 C46 64 52 60 60 60 C68 60 74 64 74 72" fill="rgba(139,92,246,0.3)" stroke="#8B5CF6" strokeWidth="1.5" />
      </g>

      {/* Left avatar */}
      <g className="team-avatar-2">
        <circle cx="24" cy="82" r="13"  fill="rgba(139,92,246,0.1)" stroke="#8B5CF6" strokeWidth="1.5" strokeOpacity="0.6" />
        <circle cx="24" cy="77" r="4.5" fill="rgba(139,92,246,0.3)" stroke="#8B5CF6" strokeWidth="1.2" strokeOpacity="0.6" />
        <path d="M14 94 C14 88 18 85 24 85 C30 85 34 88 34 94" fill="rgba(139,92,246,0.15)" stroke="#8B5CF6" strokeWidth="1.2" strokeOpacity="0.5" />
      </g>

      {/* Right avatar */}
      <g className="team-avatar-3">
        <circle cx="96" cy="82" r="13"  fill="rgba(139,92,246,0.1)" stroke="#8B5CF6" strokeWidth="1.5" strokeOpacity="0.6" />
        <circle cx="96" cy="77" r="4.5" fill="rgba(139,92,246,0.3)" stroke="#8B5CF6" strokeWidth="1.2" strokeOpacity="0.6" />
        <path d="M86 94 C86 88 90 85 96 85 C102 85 106 88 106 94" fill="rgba(139,92,246,0.15)" stroke="#8B5CF6" strokeWidth="1.2" strokeOpacity="0.5" />
      </g>

      {/* Plus */}
      <g className="team-plus">
        <circle cx="60" cy="24" r="10" fill="rgba(139,92,246,0.15)" stroke="#8B5CF6" strokeWidth="1.5" />
        <line x1="60" y1="19" x2="60" y2="29" stroke="#8B5CF6" strokeWidth="2" strokeLinecap="round" />
        <line x1="55" y1="24" x2="65" y2="24" stroke="#8B5CF6" strokeWidth="2" strokeLinecap="round" />
      </g>

      {/* Sparkles */}
      <circle cx="10"  cy="60"  r="2"   fill="#8B5CF6" opacity="0.3" />
      <circle cx="110" cy="60"  r="2"   fill="#8B5CF6" opacity="0.3" />
      <circle cx="60"  cy="110" r="1.5" fill="#C4B5FD" opacity="0.4" />
    </svg>
  )
}
