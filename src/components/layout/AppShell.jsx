import { useContext, useState, useEffect } from 'react';
import AppContext from '../../context/AppContext';
import Sidebar from './Sidebar';
import Toast from '../ui/Toast';
import { Bars3Icon, SparklesIcon } from '@heroicons/react/24/outline';

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  useEffect(() => {
    function onResize() { setIsMobile(window.innerWidth < 768); }
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return isMobile;
}

export default function AppShell({ children }) {
  const { notification } = useContext(AppContext);
  const isMobile = useIsMobile();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // Close sidebar when switching to desktop
  useEffect(() => {
    if (!isMobile) setMobileSidebarOpen(false);
  }, [isMobile]);

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--color-bg)' }}>

      {/* ── Mobile: sidebar as fixed overlay drawer ── */}
      {isMobile ? (
        <>
          {/* Backdrop */}
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
          {/* Drawer — not in flex flow, position:fixed */}
          <Sidebar
            isMobile={true}
            mobileSidebarOpen={mobileSidebarOpen}
            setMobileSidebarOpen={setMobileSidebarOpen}
          />
        </>
      ) : (
        /* ── Desktop/Tablet: sidebar as normal flex item ── */
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

        {/* Mobile top bar */}
        {isMobile && (
          <div style={{
            height: 52,
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            padding: '0 16px',
            background: 'var(--color-sidebar)',
            borderBottom: '1px solid var(--color-sidebar-border)',
            gap: 12,
          }}>
            <button
              onClick={() => setMobileSidebarOpen(true)}
              style={{
                width: 36, height: 36,
                borderRadius: 9,
                background: 'transparent',
                border: '1px solid var(--color-border)',
                cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'var(--color-text-soft)',
                flexShrink: 0,
              }}
            >
              <Bars3Icon style={{ width: 18, height: 18 }} />
            </button>

            {/* Logo wordmark */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, flex: 1, justifyContent: 'center' }}>
              <div style={{
                width: 22, height: 22, borderRadius: 7,
                background: 'linear-gradient(135deg, #7C3AED 0%, #A855F7 100%)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 2px 6px rgba(124,58,237,0.3)',
              }}>
                <SparklesIcon style={{ width: 12, height: 12, color: 'white' }} />
              </div>
              <span style={{
                fontFamily: 'var(--font-sans)',
                fontWeight: 800,
                fontSize: 15,
                letterSpacing: '-0.03em',
                color: 'var(--color-text)',
              }}>
                DesignBrief
              </span>
            </div>

            {/* Spacer to balance hamburger */}
            <div style={{ width: 36, flexShrink: 0 }} />
          </div>
        )}

        {children}
      </main>

      {notification && <Toast message={notification.msg} type={notification.type} />}
    </div>
  );
}
