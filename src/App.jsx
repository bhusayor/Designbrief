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
import AcceptInvite from './pages/AcceptInvite';

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
      return;
    }

    const inviteMatch = path.match(/^\/invite\/([a-zA-Z0-9_-]+)$/);
    if (inviteMatch) {
      localStorage.setItem('db-invite-token', inviteMatch[1]);
      navigate('accept-invite');
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
    'accept-invite': <AcceptInvite />,
  };

  // Loading — checking session or workspace.
  // Skip the workspace spinner if we already have a cached workspace.
  const hasCachedWorkspace = !!workspace;
  if (authLoading || (authUser && workspaceLoading && !hasCachedWorkspace)) {
    return (
      <div style={{
        height: '100dvh', display: 'flex', alignItems: 'center',
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

  const publicSections = ['auth', 'client-intake', 'join', 'accept-invite'];

  // Unauthenticated → show Auth page
  if (!authUser && !publicSections.includes(activeSection)) {
    return <Auth />;
  }

  // Workspace gate — only show setup if workspace is definitively absent
  // (not loading, no cache). Auto-creation in the API handles most cases,
  // so this screen should rarely appear for returning users.
  if (authUser && !workspaceLoading && !workspace && !publicSections.includes(activeSection)) {
    return (
      <WorkspaceSetup
        user={authUser}
        onComplete={(ws) => {
          localStorage.setItem('db-workspace', JSON.stringify(ws));
          setWorkspace(ws);
        }}
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

  // Accept invite is public — no AppShell
  if (activeSection === 'accept-invite') {
    return <AcceptInvite />;
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
