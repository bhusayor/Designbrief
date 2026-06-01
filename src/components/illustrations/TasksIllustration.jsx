// Three kanban columns drawing themselves in sequence, cards floating
// inside, dashed arrows flowing between columns, and a green check on
// the done card. The orphaned `cardTravel` keyframe from the original
// spec was unused (no element referenced it) so it's omitted.
export default function TasksIllustration() {
  return (
    <svg
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ width: '100%', height: '100%', overflow: 'visible' }}
    >
      <defs>
        <style>{`
          @keyframes task-cardFloat1 { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-4px); } }
          @keyframes task-cardFloat2 { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-5px); } }
          @keyframes task-colDraw  { from { stroke-dashoffset: 300; } to { stroke-dashoffset: 0; } }
          @keyframes task-arrowDraw { from { stroke-dashoffset: 80; } to { stroke-dashoffset: 0; } }
          .task-float-1 { animation: task-cardFloat1 5s ease-in-out infinite; transform-origin: 23px 50px; }
          .task-float-2 { animation: task-cardFloat2 6s ease-in-out infinite; animation-delay: -2s; transform-origin: 23px 68px; }
          .task-float-3 { animation: task-cardFloat1 7s ease-in-out infinite; animation-delay: -3s; transform-origin: 60px 50px; }
          .task-col-draw { stroke-dasharray: 300; animation: task-colDraw 1.5s cubic-bezier(0.77,0,0.175,1) forwards; }
          .task-arrow    { stroke-dasharray: 80;  stroke-dashoffset: 80; animation: task-arrowDraw 1s cubic-bezier(0.77,0,0.175,1) 1s forwards; }
        `}</style>
      </defs>

      {/* Column 1 — To Do */}
      <g>
        <rect x="8" y="24" width="30" height="80" rx="8" fill="rgba(139,92,246,0.06)" stroke="#8B5CF6" strokeWidth="1.5" strokeOpacity="0.3" className="task-col-draw" />
        <circle cx="16" cy="32" r="3" fill="rgba(139,92,246,0.4)" />
        <line x1="22" y1="32" x2="32" y2="32" stroke="#8B5CF6" strokeWidth="1.5" strokeOpacity="0.4" strokeLinecap="round" />
        <g className="task-float-1">
          <rect x="12" y="42" width="22" height="14" rx="4" fill="rgba(139,92,246,0.15)" stroke="#8B5CF6" strokeWidth="1.5" strokeOpacity="0.5" />
          <line x1="16" y1="48" x2="30" y2="48" stroke="#8B5CF6" strokeWidth="1.5" strokeLinecap="round" strokeOpacity="0.6" />
          <line x1="16" y1="52" x2="26" y2="52" stroke="#8B5CF6" strokeWidth="1"   strokeLinecap="round" strokeOpacity="0.3" />
        </g>
        <g className="task-float-2">
          <rect x="12" y="60" width="22" height="14" rx="4" fill="rgba(139,92,246,0.1)" stroke="#8B5CF6" strokeWidth="1.5" strokeOpacity="0.3" />
          <line x1="16" y1="66" x2="28" y2="66" stroke="#8B5CF6" strokeWidth="1.5" strokeLinecap="round" strokeOpacity="0.4" />
        </g>
      </g>

      {/* Column 2 — In Progress */}
      <g>
        <rect x="45" y="24" width="30" height="80" rx="8" fill="rgba(139,92,246,0.06)" stroke="#8B5CF6" strokeWidth="1.5" strokeOpacity="0.3" className="task-col-draw" style={{ animationDelay: '0.2s' }} />
        <circle cx="53" cy="32" r="3" fill="rgba(139,92,246,0.6)" />
        <line x1="59" y1="32" x2="69" y2="32" stroke="#8B5CF6" strokeWidth="1.5" strokeOpacity="0.5" strokeLinecap="round" />
        <g className="task-float-3">
          <rect x="49" y="42" width="22" height="14" rx="4" fill="rgba(139,92,246,0.2)" stroke="#8B5CF6" strokeWidth="2" />
          <line x1="53" y1="48" x2="67" y2="48" stroke="#8B5CF6" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="53" y1="52" x2="61" y2="52" stroke="#8B5CF6" strokeWidth="1"   strokeLinecap="round" strokeOpacity="0.5" />
        </g>
      </g>

      {/* Column 3 — Done */}
      <g>
        <rect x="82" y="24" width="30" height="80" rx="8" fill="rgba(139,92,246,0.06)" stroke="#8B5CF6" strokeWidth="1.5" strokeOpacity="0.3" className="task-col-draw" style={{ animationDelay: '0.4s' }} />
        <circle cx="90" cy="32" r="3" fill="rgba(34,197,94,0.6)" />
        <line x1="96" y1="32" x2="106" y2="32" stroke="#8B5CF6" strokeWidth="1.5" strokeOpacity="0.3" strokeLinecap="round" />
        <rect x="86" y="42" width="22" height="14" rx="4" fill="rgba(34,197,94,0.1)" stroke="rgba(34,197,94,0.5)" strokeWidth="1.5" />
        <path d="M92 49 L95 52 L101 46" stroke="rgba(34,197,94,0.8)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </g>

      {/* Arrows between columns */}
      <path d="M38 50 C40 50 42 50 45 50" stroke="#8B5CF6" strokeWidth="1.5" strokeOpacity="0.5" strokeLinecap="round" strokeDasharray="3 2" className="task-arrow" />
      <path d="M43 47 L46 50 L43 53" stroke="#8B5CF6" strokeWidth="1.5" strokeOpacity="0.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M75 50 C77 50 79 50 82 50" stroke="#8B5CF6" strokeWidth="1.5" strokeOpacity="0.5" strokeLinecap="round" strokeDasharray="3 2" className="task-arrow" style={{ animationDelay: '1.5s' }} />
      <path d="M80 47 L83 50 L80 53" stroke="#8B5CF6" strokeWidth="1.5" strokeOpacity="0.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
