import { useContext, useEffect, lazy, Suspense } from 'react';
import { AppProvider } from './context/AppContext';
import AppContext from './context/AppContext';
import { AppShell } from './components/layout';
// Dashboard + Auth stay eager: they are the two first-paint routes
// (returning users land on Dashboard, logged-out users on Auth) and
// lazy-loading them would just add a spinner to every session start.
import Dashboard from './pages/Dashboard';
import Auth from './pages/Auth';
// Everything else is code-split. Before this, the app shipped one
// 2.3MB chunk containing TeamCollab (5.9k lines), IntakeBuilder,
// Billing-adjacent settings, the PDF stack, and every page a user
// might never open.
const BriefTranslator    = lazy(() => import('./pages/BriefTranslator'));
const IntakeBuilder      = lazy(() => import('./pages/IntakeBuilder'));
const ClientIntakePage   = lazy(() => import('./pages/ClientIntakePage'));
const JoinPage           = lazy(() => import('./pages/JoinPage'));
const ProjectDocument    = lazy(() => import('./pages/ProjectDocument'));
const ProjectOverview    = lazy(() => import('./pages/ProjectOverview'));
const TeamCollab         = lazy(() => import('./pages/TeamCollab'));
const ProjectLibrary     = lazy(() => import('./pages/ProjectLibrary'));
// Connectors hidden from the live site for now, re-enable by
// uncommenting this import + the route entry below.
// const Connectors      = lazy(() => import('./pages/Connectors'));
const ProjectBuilder     = lazy(() => import('./pages/ProjectBuilder'));
const WorkspaceSetup     = lazy(() => import('./pages/WorkspaceSetup'));
const AcceptInvite       = lazy(() => import('./pages/AcceptInvite'));
const SharedBrief        = lazy(() => import('./pages/SharedBrief'));
const IntakeBriefReview  = lazy(() => import('./pages/IntakeBriefReview'));
const ClientFollowupPage = lazy(() => import('./pages/ClientFollowupPage'));
const ClientBriefReview  = lazy(() => import('./pages/ClientBriefReview'));

// Shared suspense fallback: minimal centered spinner matching the
// app shell so route transitions don't flash white.
function RouteFallback() {
  return (
    <div style={{
      height: '100%', minHeight: 200,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        width: 28, height: 28, borderRadius: '50%',
        border: '3px solid var(--color-border)',
        borderTopColor: 'var(--color-accent)',
        animation: 'spin 0.8s linear infinite',
      }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  );
}
import UpgradeModal from './components/UpgradeModal';
import { supabase } from './lib/supabase';
import PageTransition from './components/PageTransition';

function AppRouter() {
  const {
    activeSection, setActiveIntakeId, setActiveShareToken, setActiveFollowupToken, setActiveReviewToken, navigate,
    authUser, authLoading,
    workspace, setWorkspace, workspaceLoading, workspaceLoadError, loadWorkspace,
    showToast, refreshAuthUser, refreshUserPlan,
    activeChat,
  } = useContext(AppContext);

  // Handle the Flutterwave redirect (?flw_callback=1&status=…&tx_ref=…&transaction_id=…).
  // We verify the payment server-side, refresh authUser so the new plan
  // lights up immediately, and strip the params from the URL so a
  // refresh doesn't re-trigger this flow.
  useEffect(() => {
    if (!authUser?.id) return;
    const sp = new URLSearchParams(window.location.search);
    if (!sp.has('flw_callback')) return;
    const status = sp.get('status');
    const tx_ref = sp.get('tx_ref') || (() => {
      try { return JSON.parse(localStorage.getItem('db-pending-payment') || 'null')?.tx_ref || null } catch { return null }
    })();
    const transaction_id = sp.get('transaction_id');

    // Clean the URL right away so a manual refresh on this page doesn't
    // re-run verification.
    try { window.history.replaceState(null, '', window.location.pathname); } catch {}

    if (status !== 'successful' && status !== 'completed') {
      showToast?.('Payment was not completed.', 'info');
      try { localStorage.removeItem('db-pending-payment') } catch {}
      return;
    }

    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) throw new Error('Not signed in');
        const res = await fetch('/api/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
          body: JSON.stringify({ action: 'verify_payment', tx_ref, transaction_id }),
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) {
          showToast?.('Payment received. Could not verify: ' + (j.error || 'try refreshing'), 'error');
        } else {
          showToast?.('Plan activated 🎉', 'success');
          // refreshAuthUser re-pulls auth.users; refreshUserPlan re-pulls
          // profiles.plan / credits, the auth-user fetch alone does NOT
          // see the column updates the webhook just wrote.
          try { await Promise.all([refreshAuthUser?.(), refreshUserPlan?.()]) } catch {}
        }
      } catch (e) {
        console.error('[flw redirect]', e);
        showToast?.('Payment received. Please refresh to see your new plan.', 'info');
      } finally {
        try { localStorage.removeItem('db-pending-payment') } catch {}
      }
    })();
  }, [authUser?.id, showToast, refreshAuthUser]);

  // After workspace setup, redirect the user back to a pending project invite if one exists.
  function handleWorkspaceSetupComplete(ws) {
    localStorage.setItem('db-workspace', JSON.stringify(ws));
    setWorkspace(ws);
    if (localStorage.getItem('db-join-token')) {
      navigate('join');
    }
  }

  useEffect(() => {
    const path = window.location.pathname;

    // /intake/<form-id>, the new builder generates IDs as
    // "intake_<12 chars>", so the matcher has to allow underscores
    // alongside alphanumeric + hyphen. Legacy IDs that only used
    // hyphens still match. Case-insensitive for hand-typed URLs.
    const intakeMatch = path.match(/^\/intake\/([A-Za-z0-9_-]+)$/);
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
      return;
    }

    // Public follow-up response page, /followup/<token>. Token is
    // up to 24 char alphanumeric per the SQL column. Public, no
    // auth required.
    const followupMatch = path.match(/^\/followup\/([A-Za-z0-9_-]+)$/);
    if (followupMatch) {
      setActiveFollowupToken(followupMatch[1]);
      navigate('client-followup');
      return;
    }

    // Public share viewer: /share/<uuid> → render SharedBrief
    // without requiring auth. UUID format only, the SQL column is
    // typed uuid so anything else would 400 the supabase call.
    const shareMatch = path.match(/^\/share\/([a-f0-9-]{30,})$/i);
    if (shareMatch) {
      setActiveShareToken(shareMatch[1]);
      navigate('shared');
      return;
    }

    // Public client review page, /review/<token>. Tokens are 32 hex
    // chars (128 bits of entropy) per server-lib/briefReviews.js.
    // No auth required; the page hits the public token-gated API.
    const reviewMatch = path.match(/^\/review\/([a-f0-9]{16,64})$/i);
    if (reviewMatch) {
      setActiveReviewToken(reviewMatch[1]);
      navigate('client-review');
    }
  }, []);

  const pages = {
    // Key Dashboard by activeChat so that switching chats — or
    // clicking "New Chat" (activeChat=null) — fully remounts the
    // component with fresh local state. Without the key, Dashboard's
    // local `result` + `phase` persist across switches and the user
    // stays stuck on the previously-loaded brief.
    dashboard:       <Dashboard key={activeChat || 'new-chat'} />,
    translator:      <BriefTranslator />,
    intake:          <IntakeBuilder />,
    'client-intake': <ClientIntakePage />,
    join:            <JoinPage />,
    document:        <ProjectDocument />,
    'project-overview': <ProjectOverview />,
    team:            <TeamCollab />,
    library:         <ProjectLibrary />,
    // connectors:      <Connectors />,  // hidden from live site
    builder:         <ProjectBuilder />,
    auth:            <Auth />,
    'accept-invite': <AcceptInvite />,
    shared:          <SharedBrief />,
    'intake-review': <IntakeBriefReview />,
    'client-followup': <ClientFollowupPage />,
    'client-review':   <ClientBriefReview />,
  };

  // Show spinner while auth initialises, or while workspace is loading for a
  // user with no cached workspace (e.g. first login). If there IS a cached
  // workspace the dashboard renders immediately from cache while the
  // background refresh runs silently.
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
          fontFamily: "'Urbanist', sans-serif", fontSize: 12,
          color: 'var(--color-text-muted)',
        }}>Loading DesignBrief AI...</div>
      </div>
    );
  }

  const publicSections = ['auth', 'client-intake', 'join', 'accept-invite', 'shared', 'client-followup', 'client-review'];

  // Unauthenticated → show Auth page
  if (!authUser && !publicSections.includes(activeSection)) {
    return <Auth />;
  }

  // Workspace DB error, show retry screen instead of WorkspaceSetup.
  // This fires when the workspaces query failed (RLS misconfigured, table
  // missing, network blip) so we never falsely ask a returning user to create
  // a workspace they already have.
  if (authUser && workspaceLoadError && !publicSections.includes(activeSection)) {
    return (
      <div style={{
        height: '100dvh', display: 'flex', alignItems: 'center',
        justifyContent: 'center', background: 'var(--color-bg)',
        flexDirection: 'column', gap: 16, padding: 24,
      }}>
        <div style={{
          width: 48, height: 48, borderRadius: '50%',
          background: 'rgba(220,38,38,0.1)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 22,
        }}>⚠️</div>
        <div style={{
          fontFamily: "'Urbanist', sans-serif", fontSize: 16, fontWeight: 700,
          color: 'var(--color-text)', textAlign: 'center',
        }}>Couldn't load your workspace</div>
        <div style={{
          fontFamily: "'Urbanist', sans-serif", fontSize: 13,
          color: 'var(--color-text-muted)', textAlign: 'center', maxWidth: 340,
        }}>
          There was a problem connecting to the database. Check your connection and try again.
        </div>
        <button
          onClick={() => loadWorkspace(authUser.id)}
          style={{
            padding: '10px 24px',
            background: 'var(--color-accent)',
            color: 'white',
            border: 'none',
            borderRadius: 8,
            fontFamily: "'Urbanist', sans-serif",
            fontWeight: 700,
            fontSize: 14,
            cursor: 'pointer',
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  // Workspace gate, only show setup when the DB query succeeded and confirmed
  // zero workspaces exist for this user. Never shown on DB errors (above).
  if (authUser && !workspaceLoading && !workspace && !workspaceLoadError && !publicSections.includes(activeSection)) {
    return (
      <WorkspaceSetup
        user={authUser}
        onComplete={handleWorkspaceSetupComplete}
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

  // Client intake is public, no AppShell
  if (activeSection === 'client-intake') {
    return <ClientIntakePage />;
  }

  // Client brief review (/review/<token>) is public, no AppShell.
  // The page hits the token-gated server endpoint directly.
  if (activeSection === 'client-review') {
    return <ClientBriefReview />;
  }

  // Join page is public, no AppShell
  if (activeSection === 'join') {
    return <JoinPage />;
  }

  // Accept invite is public, no AppShell
  if (activeSection === 'accept-invite') {
    return <AcceptInvite />;
  }

  // Shared brief viewer:
  //   - Unauthenticated visitor → bare page, no sidebar. We don't want to
  //     show the app chrome (Recent, Library, etc.) to someone who just
  //     wants to read the shared brief.
  //   - Authenticated user → fall through to the default AppShell
  //     wrapping below so the sidebar + Save-to-history button work.
  if (activeSection === 'shared' && !authUser) {
    return <SharedBrief />;
  }

  // Public client follow-up response, always renders bare (no
  // AppShell). The client never has an account; even if they
  // somehow do, they shouldn't see app chrome on this page.
  if (activeSection === 'client-followup') {
    return <ClientFollowupPage />;
  }

  return (
    <>
      <AppShell>
        <PageTransition pageKey={activeSection}>
          {pages[activeSection] || <Dashboard />}
        </PageTransition>
      </AppShell>
      <GlobalUpgradeModal />
    </>
  );
}

// Renders the global UpgradeModal driven by AppContext.upgradeReason
// so any page can call openUpgradeModal('credits' | 'projects' | …).
function GlobalUpgradeModal() {
  const { upgradeReason, closeUpgradeModal } = useContext(AppContext);
  return (
    <UpgradeModal
      open={!!upgradeReason}
      reason={upgradeReason}
      onClose={closeUpgradeModal}
    />
  );
}

export default function App() {
  return (
    <AppProvider>
      {/* One Suspense above the router covers every lazy page,
          including the bare public routes that return early without
          the AppShell (client intake, review, join, etc). */}
      <Suspense fallback={<RouteFallback />}>
        <AppRouter />
      </Suspense>
    </AppProvider>
  );
}
