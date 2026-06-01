// Clock face with rotating hands (24s hour, 6s minute) and three
// document cards orbiting at 120° offsets. Tick marks generated
// programmatically. Original spec had `x="51" cy="14"` then `x="51" y="14"`
// on one rect — the dup `x` + stray `cy` are fixed here.
export default function HistoryIllustration() {
  const ticks = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330]

  return (
    <svg
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ width: '100%', height: '100%', overflow: 'visible' }}
    >
      <defs>
        <style>{`
          @keyframes hist-rotate { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
          @keyframes hist-orbit1 { from { transform: rotate(0deg)   translateX(42px) rotate(0deg);    } to { transform: rotate(360deg) translateX(42px) rotate(-360deg); } }
          @keyframes hist-orbit2 { from { transform: rotate(120deg) translateX(42px) rotate(-120deg); } to { transform: rotate(480deg) translateX(42px) rotate(-480deg); } }
          @keyframes hist-orbit3 { from { transform: rotate(240deg) translateX(42px) rotate(-240deg); } to { transform: rotate(600deg) translateX(42px) rotate(-600deg); } }
          @keyframes hist-pulse  { 0%,100% { opacity: 0.12; } 50% { opacity: 0.2; } }
          .hist-hour-hand   { animation: hist-rotate 24s linear infinite; transform-origin: 60px 60px; }
          .hist-minute-hand { animation: hist-rotate 6s  linear infinite; transform-origin: 60px 60px; }
          .hist-orbit-1     { animation: hist-orbit1 12s linear infinite; transform-origin: 60px 60px; }
          .hist-orbit-2     { animation: hist-orbit2 12s linear infinite; transform-origin: 60px 60px; }
          .hist-orbit-3     { animation: hist-orbit3 12s linear infinite; transform-origin: 60px 60px; }
          .hist-bg-pulse    { animation: hist-pulse  3s  ease-in-out infinite; }
        `}</style>
      </defs>

      {/* Orbit path */}
      <circle cx="60" cy="60" r="42" stroke="#8B5CF6" strokeWidth="1" strokeOpacity="0.15" strokeDasharray="4 3" fill="none" />

      {/* Clock face */}
      <circle cx="60" cy="60" r="28" fill="rgba(139,92,246,0.08)" className="hist-bg-pulse" />
      <circle cx="60" cy="60" r="26" fill="rgba(139,92,246,0.1)" stroke="#8B5CF6" strokeWidth="2" />

      {/* Tick marks */}
      {ticks.map((angle, i) => {
        const rad = (angle * Math.PI) / 180
        const isMajor = i % 3 === 0
        const outer = 24
        const inner = isMajor ? 18 : 21
        const x1 = 60 + outer * Math.sin(rad)
        const y1 = 60 - outer * Math.cos(rad)
        const x2 = 60 + inner * Math.sin(rad)
        const y2 = 60 - inner * Math.cos(rad)
        return (
          <line
            key={angle}
            x1={x1} y1={y1} x2={x2} y2={y2}
            stroke="#8B5CF6"
            strokeWidth={isMajor ? 2 : 1}
            strokeOpacity={isMajor ? 0.7 : 0.3}
            strokeLinecap="round"
          />
        )
      })}

      {/* Hands */}
      <g className="hist-hour-hand">
        <line x1="60" y1="60" x2="60" y2="44" stroke="#8B5CF6" strokeWidth="2.5" strokeLinecap="round" />
      </g>
      <g className="hist-minute-hand">
        <line x1="60" y1="60" x2="60" y2="39" stroke="#A78BFA" strokeWidth="1.5" strokeLinecap="round" />
      </g>

      {/* Center */}
      <circle cx="60" cy="60" r="3.5" fill="#8B5CF6" />
      <circle cx="60" cy="60" r="1.5" fill="white" opacity="0.5" />

      {/* Orbiting cards */}
      <g className="hist-orbit-1">
        <rect x="51" y="14" width="18" height="22" rx="4" fill="rgba(139,92,246,0.2)" stroke="#8B5CF6" strokeWidth="1.5" />
        <line x1="55" y1="21" x2="65" y2="21" stroke="#8B5CF6" strokeWidth="1.5" strokeLinecap="round" strokeOpacity="0.7" />
        <line x1="55" y1="27" x2="63" y2="27" stroke="#8B5CF6" strokeWidth="1"   strokeLinecap="round" strokeOpacity="0.4" />
      </g>
      <g className="hist-orbit-2">
        <rect x="51" y="14" width="18" height="22" rx="4" fill="rgba(139,92,246,0.12)" stroke="#8B5CF6" strokeWidth="1.5" strokeOpacity="0.6" />
        <line x1="55" y1="21" x2="65" y2="21" stroke="#8B5CF6" strokeWidth="1.5" strokeLinecap="round" strokeOpacity="0.5" />
        <line x1="55" y1="27" x2="61" y2="27" stroke="#8B5CF6" strokeWidth="1"   strokeLinecap="round" strokeOpacity="0.3" />
      </g>
      <g className="hist-orbit-3">
        <rect x="51" y="14" width="18" height="22" rx="4" fill="rgba(139,92,246,0.08)" stroke="#8B5CF6" strokeWidth="1.5" strokeOpacity="0.4" />
        <line x1="55" y1="21" x2="64" y2="21" stroke="#8B5CF6" strokeWidth="1.5" strokeLinecap="round" strokeOpacity="0.4" />
      </g>
    </svg>
  )
}
