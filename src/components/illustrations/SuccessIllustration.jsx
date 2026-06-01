// Green check inside a circle that scales in with spring on load,
// the checkmark draws itself after, six confetti particles burst
// outward (one-shot), then the circle floats gently while two
// alternating rings expand outward and stars twinkle in the corners.
//
// Confetti per-particle direction uses CSS custom properties (--tx,
// --ty) substituted into the keyframe's translate(). Each particle
// gets its own inline style.
export default function SuccessIllustration() {
  return (
    <svg
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ width: '100%', height: '100%', overflow: 'visible' }}
    >
      <defs>
        <style>{`
          @keyframes success-ringExpand    { 0% { transform: scale(0.6); opacity: 0.8; } 100% { transform: scale(1.6); opacity: 0; } }
          @keyframes success-checkAppear   { 0% { transform: scale(0);    opacity: 0; } 60% { transform: scale(1.15); opacity: 1; } 100% { transform: scale(1); opacity: 1; } }
          @keyframes success-checkDraw     { from { stroke-dashoffset: 50; } to { stroke-dashoffset: 0; } }
          @keyframes success-float         { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-4px); } }
          @keyframes success-confettiBurst { 0% { transform: translate(0,0) scale(1); opacity: 1; } 100% { transform: translate(var(--tx), var(--ty)) scale(0); opacity: 0; } }
          @keyframes success-starTwinkle   { 0%,100% { opacity: 0.3; transform: scale(0.8); } 50% { opacity: 1; transform: scale(1.2); } }

          .success-ring          { animation: success-ringExpand 3s ease-out infinite; transform-origin: 60px 58px; }
          .success-ring-2        { animation: success-ringExpand 3s ease-out infinite; animation-delay: -1.5s; transform-origin: 60px 58px; }
          .success-check-appear  { animation: success-checkAppear 0.5s cubic-bezier(0.34,1.56,0.64,1) 0.3s both; transform-origin: 60px 58px; }
          .success-check-draw    { stroke-dasharray: 50; stroke-dashoffset: 50; animation: success-checkDraw 0.4s cubic-bezier(0.77,0,0.175,1) 0.6s forwards; }
          .success-float         { animation: success-float 4s ease-in-out 1s infinite; transform-origin: 60px 58px; }
          .success-confetti      { animation: success-confettiBurst 1s ease-out both; transform-origin: 60px 58px; }
          .success-star-1        { animation: success-starTwinkle 2s ease-in-out infinite; transform-origin: 18px 30px; }
          .success-star-2        { animation: success-starTwinkle 2s ease-in-out infinite; animation-delay: -1s; transform-origin: 100px 26px; }
        `}</style>
      </defs>

      {/* Expanding rings */}
      <circle cx="60" cy="58" r="30" fill="none" stroke="rgba(34,197,94,0.4)" strokeWidth="1.5" className="success-ring" />
      <circle cx="60" cy="58" r="30" fill="none" stroke="rgba(34,197,94,0.4)" strokeWidth="1.5" className="success-ring-2" />

      {/* Float wraps the appearing check */}
      <g className="success-float">
        <g className="success-check-appear">
          {/* Depth */}
          <circle cx="60" cy="58" r="22" fill="rgba(34,197,94,0.08)" />
          {/* Main circle */}
          <circle cx="60" cy="58" r="28" fill="rgba(34,197,94,0.1)" stroke="rgba(34,197,94,0.6)" strokeWidth="2.5" />
          {/* Checkmark */}
          <path d="M44 58 L54 68 L76 46" stroke="rgba(34,197,94,0.9)" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" className="success-check-draw" />
        </g>
      </g>

      {/* Confetti burst — each particle carries its own direction
          via inline --tx / --ty custom properties consumed by the
          keyframe's translate(). */}
      <circle cx="60" cy="58" r="5"   fill="#8B5CF6"             className="success-confetti" style={{ '--tx': '-30px', '--ty': '-25px', animationDelay: '0.6s' }} />
      <rect   x="57" y="55"  width="6" height="6"   rx="1" fill="#C4B5FD" className="success-confetti" style={{ '--tx':  '30px', '--ty': '-25px', animationDelay: '0.7s' }} />
      <circle cx="60" cy="58" r="4"   fill="#A78BFA"             className="success-confetti" style={{ '--tx': '-38px', '--ty':  '10px', animationDelay: '0.65s' }} />
      <rect   x="57.5" y="55.5" width="5" height="5" rx="1" fill="rgba(34,197,94,0.6)" className="success-confetti" style={{ '--tx':  '38px', '--ty':  '10px', animationDelay: '0.75s' }} />
      <circle cx="60" cy="58" r="3"   fill="#C4B5FD"             className="success-confetti" style={{ '--tx': '-10px', '--ty': '-38px', animationDelay: '0.8s' }} />
      <circle cx="60" cy="58" r="3.5" fill="#8B5CF6"             className="success-confetti" style={{ '--tx':  '10px', '--ty': '-38px', animationDelay: '0.85s' }} />

      {/* Corner stars */}
      <g className="success-star-1">
        <path d="M18 24 L19 28 L23 28 L20 30 L21 34 L18 32 L15 34 L16 30 L13 28 L17 28 Z" fill="#C4B5FD" opacity="0.6" />
      </g>
      <g className="success-star-2">
        <path d="M100 20 L101 24 L105 24 L102 26 L103 30 L100 28 L97 30 L98 26 L95 24 L99 24 Z" fill="#A78BFA" opacity="0.7" />
      </g>

      {/* Green accent dots */}
      <circle cx="14"  cy="80" r="3"   fill="rgba(34,197,94,0.4)" />
      <circle cx="106" cy="76" r="2.5" fill="rgba(34,197,94,0.3)" />
    </svg>
  )
}
