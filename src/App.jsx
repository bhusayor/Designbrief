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
import Connectors from './pages/Connectors';
import ProjectBuilder from './pages/ProjectBuilder';
import Auth from './pages/Auth';
import WorkspaceSetup from './pages/WorkspaceSetup';

function AppRouter() {
  const {
    activeSection, setActiveIntakeId, navigate,
    authUser, authLoading,
    workspace, setWorkspace, workspaceLoading,
  } = useContext(AppContext);

  useEffect(() => {
    const path = window.location.pathname;

    const intakeMatch = path.match(/^\/intake\/([a-z0-9-]+)$/i);
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
    connectors:      <Connectors />,
    builder:         <ProjectBuilder />,
    auth:            <Auth />,
  };

  // Loading — checking session or workspace
  if (authLoading || (authUser && workspaceLoading)) {
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

  // Workspace gate — show setup screen for new users with no workspace
  if (authUser && !workspace && !publicSections.includes(activeSection)) {
    return (
      <WorkspaceSetup
        user={authUser}
        onComplete={(ws) => setWorkspace(ws)}
      />
    );
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
