import { useContext, useState, useEffect } from 'react';
import AppContext from '../../context/AppContext';
import Sidebar from './Sidebar';
import Toast from '../ui/Toast';

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
  const { notification } = useContext(AppContext);
  const isMobile = useIsMobile();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [displayed, setDisplayed] = useState(null);
  const [exiting, setExiting] = useState(false);

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

        {children}
      </main>

      {displayed && <Toast message={displayed.msg} type={displayed.type} exiting={exiting} />}
    </div>
  );
}
