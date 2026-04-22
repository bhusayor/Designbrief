import { useContext, useEffect } from 'react';
import { AppProvider } from './context/AppContext';
import AppContext from './context/AppContext';
import { AppShell } from './components/layout';
import Dashboard from './pages/Dashboard';
import BriefTranslator from './pages/BriefTranslator';
import IntakeBuilder from './pages/IntakeBuilder';
import ClientIntakePage from './pages/ClientIntakePage';
import JoinPage from './pages/JoinPage';
import ProjectDocument from './pages/ProjectDocument';
import TeamCollab from './pages/TeamCollab';
import ProjectLibrary from './pages/ProjectLibrary';
import Auth from './pages/Auth';

function AppRouter() {
  const {
    activeSection, setActiveIntakeId, navigate,
    authUser, authLoading,
  } = useContext(AppContext);

  useEffect(() => {
    const path = window.location.pathname;

    const intakeMatch = path.match(/^\/intake\/([a-z0-9]+)$/);
    if (intakeMatch) {
      setActiveIntakeId(intakeMatch[1]);
      navigate('client-intake');
      return;
    }

    const joinMatch = path.match(/^\/join\/([a-z0-9]+)$/);
    if (joinMatch) {
      localStorage.setItem('db-join-token', joinMatch[1]);
      navigate('join');
    }
  }, []);

  const pages = {
    dashboard:       <Dashboard />,
    translator:      <BriefTranslator />,
    intake:          <IntakeBuilder />,
    'client-intake': <ClientIntakePage />,
    join:            <JoinPage />,
    document:        <ProjectDocument />,
    team:            <TeamCollab />,
    library:         <ProjectLibrary />,
    auth:            <Auth />,
  };

  // Loading — checking session
  if (authLoading) {
    return (
      <div style={{
        height: '100vh', display: 'flex', alignItems: 'center',
        justifyContent: 'center', background: 'var(--color-bg)',
        flexDirection: 'column', gap: 16,
      }}>
        <div className="spin" style={{
          width: 36, height: 36,
          border: '3px solid var(--color-border)',
          borderTopColor: 'var(--color-accent)',
          borderRadius: '50%',
        }} />
        <div style={{
          fontFamily: "'DM Mono', monospace", fontSize: 12,
          color: 'var(--color-text-muted)',
        }}>Loading DesignBrief AI...</div>
      </div>
    );
  }

  const publicSections = ['auth', 'client-intake', 'join'];

  // Unauthenticated → show Auth page
  if (!authUser && !publicSections.includes(activeSection)) {
    return <Auth />;
  }

  // Authenticated + on auth page → redirect to dashboard
  if (authUser && activeSection === 'auth') {
    return (
      <AppShell>
        <Dashboard />
      </AppShell>
    );
  }

  // Client intake is public — no AppShell
  if (activeSection === 'client-intake') {
    return <ClientIntakePage />;
  }

  // Join page is public — no AppShell
  if (activeSection === 'join') {
    return <JoinPage />;
  }

  return (
    <AppShell>
      {pages[activeSection] || <Dashboard />}
    </AppShell>
  );
}

export default function App() {
  return (
    <AppProvider>
      <AppRouter />
    </AppProvider>
  );
}
