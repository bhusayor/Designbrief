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
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none"
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

  useEffect(() => {
    if (!isMobile) setMobileSidebarOpen(false);
  }, [isMobile]);

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--color-bg)' }}>

      {/* ── Mobile: sidebar as fixed overlay drawer ── */}
      {isMobile ? (
        <>
          {mobileSidebarOpen && (
            <div
              onClick={() => setMobileSidebarOpen(false)}
              style={{
                position: 'fixed', inset: 0, zIndex: 498,
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

      {/* ── Main content ── */}
      <main style={{
        flex: 1,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        minWidth: 0,
      }}>

        {/* Mobile top bar — expand button only, no branding */}
        {isMobile && (
          <div style={{
            height: 52,
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            padding: '0 14px',
            background: 'var(--color-sidebar)',
            borderBottom: '1px solid var(--color-sidebar-border)',
          }}>
            <button
              onClick={() => setMobileSidebarOpen(true)}
              style={{
                width: 30, height: 30,
                borderRadius: 8,
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'var(--color-text-muted)',
              }}
            >
              <PanelLeftOpen />
            </button>
          </div>
        )}

        {children}
      </main>

      {notification && <Toast message={notification.msg} type={notification.type} />}
    </div>
  );
}
