import { useContext, useState, useEffect } from 'react';
import AppContext from '../../context/AppContext';
import Sidebar from './Sidebar';
import Toast from '../ui/Toast';
import AIErrorToast from '../ui/AIErrorToast';
import useProximity from '../../hooks/useProximity';

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  useEffect(() => {
    function onResize() { setIsMobile(window.innerWidth < 768); }
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return isMobile;
}

// Same icon used by the desktop sidebar expand button
function PanelLeftOpen() {
  return (
    <svg width={17} height={17} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect width="18" height="18" x="3" y="3" rx="2" />
      <path d="M9 3v18" />
      <path d="m14 9 3 3-3 3" />
    </svg>
  )
}

export default function AppShell({ children }) {
  const { notification, workspace, aiError, clearAIError } = useContext(AppContext);

  // Global proximity for any .proximity-btn anywhere in the app.
  // Mounted once here so every action button inherits the dock effect
  // without each page wiring its own hook. The MutationObserver inside
  // initProximityEffect picks up buttons as they mount.
  useProximity('.proximity-btn', {
    distance: 80,
    maxScale: 1.06,
    maxLift: -3,
    speed: 0.22,
    glow: true,
    tilt: false, // rectangular CTAs look weird tilting
  }, []);
  const isMobile = useIsMobile();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [displayed, setDisplayed] = useState(null);
  const [exiting, setExiting] = useState(false);

  // ── Workspace switch transition ─────────────────────────────────────────
  // Remount the page content under a fresh key when workspace.id flips so
  // every child component starts in a clean state AND a CSS animation
  // plays. We flip the key IMMEDIATELY (no fade-out hold) so the user
  // never sees the previous workspace's content lingering — the new
  // content takes over on the next frame with a quick fadeIn.
  const currentWsKey = workspace?.id || 'none';

  useEffect(() => {
    if (!isMobile) setMobileSidebarOpen(false);
  }, [isMobile]);

  // Keep toast in DOM during exit animation before unmounting
  useEffect(() => {
    if (notification) {
      setExiting(false);
      setDisplayed(notification);
    } else if (displayed) {
      setExiting(true);
      const t = setTimeout(() => { setDisplayed(null); setExiting(false); }, 320);
      return () => clearTimeout(t);
    }
  }, [notification]);

  return (
    <div style={{ display: 'flex', height: '100dvh', overflow: 'hidden', background: 'var(--color-bg)' }}>

      {isMobile ? (
        <>
          {mobileSidebarOpen && (
            <div
              onClick={() => setMobileSidebarOpen(false)}
              style={{
                position: 'fixed', inset: 0, zIndex: 501,
                background: 'rgba(0,0,0,0.45)',
                backdropFilter: 'blur(2px)',
              }}
            />
          )}
          <Sidebar
            isMobile={true}
            mobileSidebarOpen={mobileSidebarOpen}
            setMobileSidebarOpen={setMobileSidebarOpen}
          />
        </>
      ) : (
        <Sidebar isMobile={false} />
      )}

      <main style={{
        flex: 1,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        minWidth: 0,
        position: 'relative',
      }}>

        {/* Mobile expand button — floats over the page gradient, no background bar */}
        {isMobile && !mobileSidebarOpen && (
          <button
            onClick={() => setMobileSidebarOpen(true)}
            style={{
              position: 'absolute',
              top: 14,
              left: 14,
              zIndex: 10,
              width: 30,
              height: 30,
              minHeight: 'unset',
              borderRadius: 8,
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--color-text-muted)',
            }}
          >
            <PanelLeftOpen />
          </button>
        )}

        <div
          key={currentWsKey}
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            minWidth: 0,
            minHeight: 0,
            animation: 'fadeUp 220ms cubic-bezier(0.16, 1, 0.3, 1)',
          }}
        >
          {children}
        </div>
      </main>

      {displayed && <Toast message={displayed.msg} type={displayed.type} exiting={exiting} />}
      <AIErrorToast error={aiError} onDismiss={clearAIError} />
    </div>
  );
}
