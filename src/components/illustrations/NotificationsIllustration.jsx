// Swinging bell with floating notification dots and a green
// "all caught up" check below. Stars twinkle in the corners.
export default function NotificationsIllustration() {
  return (
    <svg
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ width: '100%', height: '100%', overflow: 'visible' }}
    >
      <defs>
        <style>{`
          @keyframes notif-swing { 0%,100% { transform: rotate(0deg); } 20% { transform: rotate(8deg); } 40% { transform: rotate(-6deg); } 60% { transform: rotate(4deg); } 80% { transform: rotate(-2deg); } }
          @keyframes notif-dot   { 0%,100% { opacity: 0; transform: translateY(0) scale(0.5); } 50% { opacity: 1; transform: translateY(-8px) scale(1); } }
          @keyframes notif-check { from { stroke-dashoffset: 40; } to { stroke-dashoffset: 0; } }
          @keyframes notif-star  { 0%,100% { opacity: 0.3; transform: scale(0.8); } 50% { opacity: 1; transform: scale(1.2); } }
          .notif-bell    { animation: notif-swing 4s ease-in-out infinite; transform-origin: 60px 28px; }
          .notif-dot-1   { animation: notif-dot 3s ease-in-out infinite; transform-origin: 30px 52px; }
          .notif-dot-2   { animation: notif-dot 3s ease-in-out infinite; animation-delay: -1s; transform-origin: 90px 48px; }
          .notif-dot-3   { animation: notif-dot 3s ease-in-out infinite; animation-delay: -2s; transform-origin: 20px 70px; }
          .notif-check   { stroke-dasharray: 40; stroke-dashoffset: 40; animation: notif-check 0.6s cubic-bezier(0.77,0,0.175,1) 1s forwards; }
          .notif-star-1  { animation: notif-star 2s   ease-in-out infinite; transform-origin: 20px 38px; }
          .notif-star-2  { animation: notif-star 2.5s ease-in-out infinite; animation-delay: -0.8s; transform-origin: 100px 42px; }
        `}</style>
      </defs>

      {/* Bell */}
      <g className="notif-bell">
        <path d="M60 28 C44 28 34 40 34 58 L34 72 L86 72 L86 58 C86 40 76 28 60 28 Z" fill="rgba(139,92,246,0.15)" stroke="#8B5CF6" strokeWidth="2" strokeLinejoin="round" />
        <rect x="28" y="72" width="64" height="6" rx="3" fill="rgba(139,92,246,0.2)" stroke="#8B5CF6" strokeWidth="2" />
        <circle cx="60" cy="82" r="5" fill="rgba(139,92,246,0.3)" stroke="#8B5CF6" strokeWidth="2" />
        <line x1="60" y1="78" x2="60" y2="82" stroke="#8B5CF6" strokeWidth="2" strokeLinecap="round" />
        <path d="M50 38 C48 44 46 52 47 60" stroke="rgba(255,255,255,0.2)" strokeWidth="2" strokeLinecap="round" fill="none" />
      </g>

      {/* Floating dots */}
      <circle cx="30" cy="52" r="5" fill="#8B5CF6" className="notif-dot-1" />
      <circle cx="90" cy="48" r="4" fill="#A78BFA" className="notif-dot-2" />
      <circle cx="20" cy="70" r="3" fill="#C4B5FD" className="notif-dot-3" />

      {/* Check */}
      <circle cx="60" cy="104" r="10" fill="rgba(34,197,94,0.1)" stroke="rgba(34,197,94,0.4)" strokeWidth="1.5" />
      <path d="M54 104 L58 108 L66 100" stroke="rgba(34,197,94,0.8)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="notif-check" />

      {/* Stars */}
      <g className="notif-star-1">
        <path d="M20 34 L21 38 L25 38 L22 40 L23 44 L20 42 L17 44 L18 40 L15 38 L19 38 Z" fill="#C4B5FD" opacity="0.7" />
      </g>
      <g className="notif-star-2">
        <path d="M100 38 L101 41 L104 41 L102 43 L103 46 L100 44 L97 46 L98 43 L96 41 L99 41 Z" fill="#C4B5FD" opacity="0.6" />
      </g>
    </svg>
  )
}
