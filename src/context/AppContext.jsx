import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { supabase } from '../lib/supabase';

// ─── Context ──────────────────────────────────────────────────────────────────

const AppContext = createContext(null);

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function upsert(list, item, key = 'id') {
  const idx = list.findIndex(i => i[key] === item[key]);
  if (idx === -1) return [item, ...list];
  const updated = [...list];
  updated[idx] = { ...updated[idx], ...item };
  return updated;
}

function generateShareId() {
  return Math.random().toString(36).slice(2, 10);
}

// Maps a raw Supabase projects row → app project shape used in state.
// Shared with realtime payload.new rows so INSERT/UPDATE produce the same
// object structure as the initial fetch.
function formatProjectRow(p, extra = {}) {
  return {
    id: p.id,
    workspace_id: p.workspace_id || null,
    title: p.title,
    section: p.section,
    ts: new Date(p.updated_at).getTime(),
    pinned: p.pinned || false,
    data: {
      brief: p.brief_text,
      projectName: p.title,
      scoring: p.scoring,
      result: p.result,
    },
    teamMembers: p.team_members || [],
    kanban: p.kanban,
    kanbanColumns: p.kanban_columns || null,
    approvalStatus: p.approval_status || {},
    comments: p.comments || {},
    locked: p.locked || false,
    shareId: p.share_id,
    ...extra,
  };
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function AppProvider({ children }) {
  const [projects, setProjects] = useState([]);
  const [activeProject, setActiveProjectState] = useState(null);
  // Remember the active project's id across refreshes — we restore the full
  // object from ctxProjects once they load. Cleared when activeProject is
  // explicitly set to null (project deleted or user kicked out).
  const [activeProjectId, setActiveProjectId] = useState(() => {
    try { return localStorage.getItem('db-active-project-id') || null } catch { return null }
  });
  // Persist activeSection across refreshes so the user lands back on the
  // page they were on (Team / Document / Library / Connectors / etc.) rather
  // than being kicked to the dashboard. Sections tied to special URLs
  // (auth / join / accept-invite / client-intake) are NEVER persisted —
  // App.jsx's path matcher already handles those on load.
  const NON_PERSISTABLE_SECTIONS = new Set(['auth', 'join', 'accept-invite', 'client-intake']);
  const [activeSection, setActiveSectionState] = useState(() => {
    try {
      const saved = localStorage.getItem('db-active-section');
      if (saved && !NON_PERSISTABLE_SECTIONS.has(saved)) return saved;
    } catch {}
    return 'dashboard';
  });
  const [history, setHistory] = useState([]);
  const [activeChat, setActiveChat] = useState(null);
  const [notification, setNotification] = useState(null);
  // AI error banner — distinct from regular toast because it carries an
  // optional retry callback and (for rate_limited) a countdown.
  const [aiError, setAiError] = useState(null);
  const [activeIntakeId, setActiveIntakeId] = useState(null);
  // Phase 5 — submission id of the brief currently being reviewed.
  // Set from IntakeDelivery's View Brief button on a submission row;
  // read by the new IntakeBriefReview page.
  const [activeIntakeSubmissionId, setActiveIntakeSubmissionId] = useState(null);
  // Phase 6 — token in the URL when a client is responding to a
  // designer follow-up question via the public /followup/:token page.
  const [activeFollowupToken, setActiveFollowupToken] = useState(null);
  // Token from a /share/:token URL — read by the public SharedBriefPage
  // to fetch the snapshot row out of supabase.shared_briefs.
  const [activeShareToken, setActiveShareToken] = useState(null);
  const [intakeForms, setIntakeForms] = useState([]);
  const [loadingForms, setLoadingForms] = useState(false);
  const knownCompleteIdsRef = useRef(null); // null = not yet seeded
  const [joinToken, setJoinToken] = useState(
    () => localStorage.getItem('db-join-token') || null
  );
  const [theme, setTheme] = useState(
    () => localStorage.getItem('db-theme') || 'dark'
  );
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('db-user');
    return saved ? JSON.parse(saved) : {
      name: 'Designer',
      firstName: 'Designer',
      email: '',
      plan: 'Free',
    };
  });

  // ── Auth state ────────────────────────────────────────────────────────────
  const [authUser, setAuthUser] = useState(null);
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  // ── Workspace state — seeded from localStorage so refresh never flickers ──
  const [workspace, setWorkspace] = useState(() => {
    try {
      const cached = localStorage.getItem('db-workspace');
      return cached ? JSON.parse(cached) : null;
    } catch { return null; }
  });
  const [workspaces, setWorkspaces] = useState(() => {
    try {
      const cached = localStorage.getItem('db-workspaces');
      const parsed = cached ? JSON.parse(cached) : null;
      return Array.isArray(parsed) ? parsed : [];
    } catch { return []; }
  });
  const [workspaceLoading, setWorkspaceLoading] = useState(() => {
    // If we have a cached workspace, don't show a loading spinner on return visits
    try { return !localStorage.getItem('db-workspace'); } catch { return true; }
  });
  const [workspaceLoadError, setWorkspaceLoadError] = useState(false);

  // ── Plan + credits state ──────────────────────────────────────────────────
  // userPlan: 'free' | 'starter' | 'pro' — single source of truth read from
  // profiles.plan on auth. userCredits is the remaining balance; the sidebar
  // bar and every gate read from these.
  // Seeded from db-plan-state so a refresh doesn't flicker "Free + Upgrade"
  // before the Supabase profile fetch resolves.
  const FREE_DAILY_LIMIT = 50;
  const cachedPlanState = (() => {
    try {
      const raw = localStorage.getItem('db-plan-state');
      if (!raw) return null;
      const p = JSON.parse(raw);
      const planKey = ['free', 'starter', 'pro'].includes(String(p?.plan || '').toLowerCase())
        ? String(p.plan).toLowerCase() : null;
      if (!planKey) return null;
      return { ...p, plan: planKey };
    } catch { return null; }
  })();
  const seededPlan = cachedPlanState?.plan || 'free';
  const seededCap = seededPlan === 'pro' ? 1000 : seededPlan === 'starter' ? 300 : FREE_DAILY_LIMIT;
  const [userPlan, setUserPlan] = useState(seededPlan);
  const [userCredits, setUserCredits] = useState(
    typeof cachedPlanState?.credits === 'number' ? cachedPlanState.credits : seededCap
  );
  const [creditsUsed, setCreditsUsed] = useState(cachedPlanState?.creditsUsed ?? 0);
  const [creditsLimit, setCreditsLimit] = useState(cachedPlanState?.creditsLimit ?? seededCap);
  const [creditsResetAt, setCreditsResetAt] = useState(cachedPlanState?.creditsResetAt || null);
  const [planStatus, setPlanStatus] = useState(cachedPlanState?.planStatus || 'active');
  const [accessUntil, setAccessUntil] = useState(cachedPlanState?.accessUntil || null);
  const [planStartedAt, setPlanStartedAt] = useState(cachedPlanState?.planStartedAt || null);

  // ── Upgrade modal global trigger ──────────────────────────────────────────
  // Any page can call openUpgradeModal('projects' | 'credits' | …) and the
  // root-level UpgradeModal will render with the matching message.
  const [upgradeReason, setUpgradeReason] = useState(null);
  const openUpgradeModal = useCallback((reason) => setUpgradeReason(reason || 'general'), []);
  const closeUpgradeModal = useCallback(() => setUpgradeReason(null), []);

  // consumeCredits is declared further down, AFTER showToast so its deps
  // array can reference it without a temporal-dead-zone error. We hold a
  // ref here so anything that closes over the context object on the very
  // first render still gets a stable reference. The assignment happens
  // in a useEffect below once the real callback is built.

  // ── Template state ────────────────────────────────────────────────────────
  const [selectedBriefTemplate, setSelectedBriefTemplate] = useState('agency-deck');
  const [selectedWebsiteTemplate, setSelectedWebsiteTemplate] = useState('saas-landing');
  const [activeProjectBriefResult, setActiveProjectBriefResult] = useState(null);
  // Paired scoring for the brief loaded into Dashboard from
  // Sidebar history / Project Library — Dashboard's ResultView
  // expects a scoring object alongside the result, so this carries
  // it through the navigation hop.
  const [activeProjectScoring, setActiveProjectScoring] = useState(null);

  // ── Connector data ────────────────────────────────────────────────────────
  const [connectorData, setConnectorData] = useState({ figma: null, github: null, linear: null });

  const toastTimer = useRef(null);

  // ── Theme sync ────────────────────────────────────────────────────────────

  useEffect(() => {
    localStorage.setItem('db-theme', theme);

    if (theme === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      const apply = () => document.documentElement.setAttribute('data-theme', mq.matches ? 'dark' : 'light');
      apply();
      mq.addEventListener('change', apply);
      return () => mq.removeEventListener('change', apply);
    }

    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // ── Auth: init + listener ─────────────────────────────────────────────────

  useEffect(() => {
    let mounted = true;

    // Safety timeout — if Supabase takes more than 5 seconds, stop the spinner
    const timeout = setTimeout(() => {
      if (mounted) {
        console.warn('Supabase getSession timed out');
        setAuthLoading(false);
        setWorkspaceLoading(false);
      }
    }, 5000);

    const initAuth = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();

        if (!mounted) return;

        if (error) {
          console.error('getSession error:', error);
          setAuthLoading(false);
          return;
        }

        if (session?.user) {
          setSession(session);
          await handleAuthUser(session.user);
        } else {
          setWorkspaceLoading(false);
        }
      } catch (err) {
        console.error('Auth init error:', err);
        setWorkspaceLoading(false);
      } finally {
        if (mounted) {
          clearTimeout(timeout);
          setAuthLoading(false);
        }
      }
    };

    initAuth();

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!mounted) return;

        if (event === 'SIGNED_IN' && session?.user) {
          setSession(session);
          await handleAuthUser(session.user);
        } else if (event === 'TOKEN_REFRESHED' && session) {
          setSession(session);
        } else if (event === 'SIGNED_OUT') {
          setAuthUser(null);
          setSession(null);
          setWorkspace(null);
          setWorkspaces([]);
          localStorage.removeItem('db-workspace');
          localStorage.removeItem('db-workspaces');
          localStorage.removeItem('db-plan-state');
          setWorkspaceLoading(false);
          setCreditsUsed(0);
          setUser({
            name: 'Designer',
            firstName: 'Designer',
            email: '',
            plan: 'Free',
          });
          setProjects([]);
          setHistory([]);
        }
        if (mounted) setAuthLoading(false);
      }
    );

    return () => {
      mounted = false;
      clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, []);

  // ── Auth helpers ──────────────────────────────────────────────────────────

  async function handleAuthUser(supabaseUser) {
    // Mark workspace as loading BEFORE setting authUser so React batches both
    // into one render. Without this, the render after setAuthUser sees
    // authUser=user + workspace=null + workspaceLoading=false and briefly
    // shows WorkspaceSetup even for users who already have a workspace.
    setWorkspaceLoading(true);
    setAuthUser(supabaseUser);

    try {
      // Best-effort monthly credits reset for paid plans. The RPC is a
      // no-op for Free and idempotent (only resets after 30 days). It
      // exists on Pro Supabase projects after the migration in
      // supabase/starter-plan.sql is applied; if it isn't there yet,
      // the call fails silently and we just read the existing row.
      try {
        await supabase.rpc('check_and_reset_credits', { user_id: supabaseUser.id })
      } catch {}

      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', supabaseUser.id)
        .single();

      const fullName =
        profile?.full_name ||
        supabaseUser.user_metadata?.full_name ||
        supabaseUser.email?.split('@')[0] ||
        'Designer';

      const firstName = profile?.first_name || fullName.split(' ')[0] || 'Designer';

      // Normalise plan to lower-case keys ('free' | 'starter' | 'pro') so
      // every consumer can look it up in PLANS without branching.
      const rawPlan = (profile?.plan || 'free').toString().toLowerCase();
      const planKey = ['free', 'starter', 'pro'].includes(rawPlan) ? rawPlan : 'free';

      const updatedUser = {
        id: supabaseUser.id,
        name: fullName,
        firstName,
        email: supabaseUser.email || '',
        plan: planKey,
        avatarUrl: profile?.avatar_url || null,
      };

      setUser(updatedUser);
      setUserPlan(planKey);
      // PLANS.<plan>.credits is the cap; profile.credits is the live balance.
      // Fall back to the free cap when the column hasn't been added yet.
      const planCap = planKey === 'pro' ? 1000 : planKey === 'starter' ? 300 : 50;
      const credits = typeof profile?.credits === 'number' ? profile.credits : planCap;
      const creditsUsedVal = profile?.credits_used ?? 0;
      setCreditsLimit(planCap);
      setUserCredits(credits);
      setCreditsUsed(creditsUsedVal);
      setCreditsResetAt(profile?.credits_reset_at || null);
      setPlanStatus(profile?.plan_status || 'active');
      setAccessUntil(profile?.access_until || null);
      setPlanStartedAt(profile?.plan_started_at || null);
      localStorage.setItem('db-user', JSON.stringify(updatedUser));
      try {
        localStorage.setItem('db-plan-state', JSON.stringify({
          plan: planKey,
          credits,
          creditsUsed: creditsUsedVal,
          creditsLimit: planCap,
          creditsResetAt: profile?.credits_reset_at || null,
          planStatus: profile?.plan_status || 'active',
          accessUntil: profile?.access_until || null,
          planStartedAt: profile?.plan_started_at || null,
        }));
      } catch {}

      // NOTE: do NOT pre-load projects here. The polling effect (which
      // depends on workspace?.id) fires loadProjectsFromDB with the correct
      // workspace_id once loadWorkspace below resolves it. Pre-loading with
      // null workspaceId would briefly populate projects from EVERY
      // workspace, and the hydrate effect could lock activeProject onto
      // a row that doesn't belong to the active workspace.

      // Skip loadWorkspace when a workspace invite is being accepted — doAccept will set the
      // workspace directly after the member insert commits, avoiding a race condition.
      let foundWorkspace = null;
      if (localStorage.getItem('db-invite-token')) {
        setWorkspaceLoading(false);
      } else {
        foundWorkspace = await loadWorkspace(supabaseUser.id);
      }

      loadCreditsUsed(supabaseUser.id);

      // Redirect to join page only if the user already has a workspace AND
      // they actually arrived via an invite link (URL starts with /join/).
      // A stale db-join-token left over from a failed/abandoned attempt
      // must NOT trap an existing user on the join screen forever.
      const storedToken = localStorage.getItem('db-join-token');
      const onJoinUrl = typeof window !== 'undefined'
        && window.location.pathname.startsWith('/join/');
      if (storedToken && foundWorkspace && onJoinUrl) {
        setActiveSectionState('join');
      } else if (storedToken && !onJoinUrl) {
        // Clean up the stale token so future auth events don't bounce here.
        localStorage.removeItem('db-join-token');
      }
    } catch (e) {
      console.error('[AppContext] handleAuthUser error:', e);
    }
  }

  async function loadCreditsUsed(userId) {
    try {
      const startOfDay = new Date();
      startOfDay.setUTCHours(0, 0, 0, 0);

      const { count } = await supabase
        .from('ai_usage')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .gte('created_at', startOfDay.toISOString());

      setCreditsUsed(count || 0);
    } catch (e) {
      setCreditsUsed(0);
    }
  }

  async function loadWorkspace(userId) {
    // Seed from localStorage so returning users never see a flash of WorkspaceSetup
    const cached = (() => {
      try { return JSON.parse(localStorage.getItem('db-workspace')); } catch { return null; }
    })();
    if (!cached) setWorkspaceLoading(true);
    setWorkspaceLoadError(false);

    try {
      // Server-side lookup using SERVICE_ROLE_KEY — bypasses RLS so the
      // workspace is always returned if it exists, regardless of how the
      // workspaces SELECT policy is configured.
      const { data: { session } } = await supabase.auth.getSession();
      const accessToken = session?.access_token;
      if (!accessToken) throw new Error('No active session');

      const res = await fetch('/api/create-workspace', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        console.error('[loadWorkspace] HTTP error', res.status, errBody);
        throw new Error(errBody.error || `workspace lookup failed (${res.status})`);
      }

      const body = await res.json();
      console.log('[loadWorkspace] client userId:', userId);
      console.log('[loadWorkspace] server response:', body);
      const list = Array.isArray(body.workspaces) ? body.workspaces : (body.workspace ? [body.workspace] : []);

      try {
        localStorage.setItem('db-workspaces', JSON.stringify(list));
      } catch {}
      setWorkspaces(list);

      // Pick the active workspace: prefer the one cached in db-workspace, else
      // the first one in the list. This keeps the user on whichever workspace
      // they last switched to across refreshes.
      let activeId = null;
      try { activeId = JSON.parse(localStorage.getItem('db-workspace') || 'null')?.id; } catch {}
      const ws = list.find(w => w.id === activeId) || list[0] || null;

      if (ws) {
        localStorage.setItem('db-workspace', JSON.stringify(ws));
        setWorkspace(ws);
        loadConnectorData(ws.id);
        try {
          const hist = JSON.parse(localStorage.getItem('db-workspace-history') || '[]');
          localStorage.setItem(
            'db-workspace-history',
            JSON.stringify([ws.id, ...hist.filter(id => id !== ws.id)].slice(0, 20))
          );
        } catch {}
      } else {
        // DB confirmed: this user has no workspace. Show WorkspaceSetup.
        localStorage.removeItem('db-workspace');
        setWorkspace(null);
      }
      return ws;
    } catch (e) {
      console.error('[loadWorkspace]', e);
      // On transient/network/server error: keep cached workspace so returning
      // users are never bounced to WorkspaceSetup by a network blip.
      if (cached) {
        setWorkspace(cached);
        return cached;
      }
      // No cache + server error → show retry screen, NOT WorkspaceSetup.
      setWorkspaceLoadError(true);
      setWorkspace(null);
      return null;
    } finally {
      setWorkspaceLoading(false);
    }
  }

  async function loadConnectorData(workspaceId) {
    // Reset first so switching to a new workspace doesn't carry over the
    // previous one's connector data.
    setConnectorData({ figma: null, github: null, linear: null });
    try {
      const { data } = await supabase
        .from('connectors')
        .select('type, extracted_data, status')
        .eq('workspace_id', workspaceId)
        .eq('status', 'connected');

      if (data) {
        const map = {};
        data.forEach(c => { map[c.type] = c.extracted_data; });
        setConnectorData(prev => ({ ...prev, ...map }));
      }
    } catch (e) {
      console.error('[connectors load]', e);
    }
  }

  async function loadProjectsFromDB(userId, workspaceId) {
    try {
      // 1. Projects this user owns in the active workspace.
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false });

      if (error) {
        // Auth lock collision is transient — skip silently, next poll succeeds
        if (error.message?.includes('Lock') && error.message?.includes('stole')) {
          return;
        }
        console.error('[AppContext] loadProjectsFromDB error:', error);
        console.error('[AppContext] If you see code 42P17 (recursive policy) or 500 — run supabase/cross-device-sync.sql in Supabase SQL Editor.');
        return;
      }
      console.log('[loadProjectsFromDB] fetched', data?.length || 0, 'owned projects');

      // Normalise legacy roles (Team Member / Collaborator / PM / etc.)
      // into the Admin/Editor/Viewer hierarchy used by the new RBAC.
      function normaliseRole(r) {
        const v = String(r || '').toLowerCase()
        if (v === 'admin') return 'Admin'
        if (v === 'viewer' || v === 'guest') return 'Viewer'
        return 'Editor'
      }

      // Filter projects to the active workspace. Rows with workspace_id=null
      // were created before the schema migration — treat them as belonging to
      // the user's primary workspace (the first one in the list) so existing
      // data doesn't disappear on upgrade.
      const primaryWsId = workspaces[0]?.id || null;
      const inActiveWorkspace = (p) => {
        if (!workspaceId) return true; // no active ws yet — show everything
        if (p.workspace_id === workspaceId) return true;
        if (p.workspace_id == null && workspaceId === primaryWsId) return true;
        return false;
      };

      const ownFormatted = (data || [])
        .filter(inActiveWorkspace)
        .map(p => formatProjectRow(p, { currentUserRole: 'Admin' }));
      const ownIds = new Set(ownFormatted.map(p => p.id));

      // 2. Shared projects — where this user is a team_member but not the owner.
      //    Requires the "Team members can view invited projects" RLS policy on projects.
      const { data: memberData } = await supabase
        .from('team_members')
        .select('project_id, job_role, projects(*)')
        .eq('user_id', userId)
        .eq('status', 'active');

      const sharedFormatted = (memberData || [])
        .filter(m => m.projects && !ownIds.has(m.project_id) && inActiveWorkspace(m.projects))
        .map(m => formatProjectRow(m.projects, {
          isShared: true,
          myRole: m.job_role,
          currentUserRole: normaliseRole(m.job_role),
        }));

      const allFormatted = [...ownFormatted, ...sharedFormatted];

      // Skip the setState entirely if nothing changed — otherwise every 5s poll
      // re-assigns the array (new reference) and re-renders every consumer of
      // ctxProjects, including TeamCollab. That re-render redefines components
      // declared inside TeamCollab (InlineAddTask etc.) and wipes their local
      // input state, making typing 'disappear' for slow typists.
      const sameColumns = (a, b) => {
        if (a === b) return true;
        if (!Array.isArray(a) || !Array.isArray(b)) return false;
        if (a.length !== b.length) return false;
        for (let i = 0; i < a.length; i++) {
          if (a[i]?.id !== b[i]?.id || a[i]?.label !== b[i]?.label || a[i]?.color !== b[i]?.color) return false;
        }
        return true;
      };
      const sameAsPrev = (prev) => {
        if (!Array.isArray(prev) || prev.length !== allFormatted.length) return false;
        for (let i = 0; i < allFormatted.length; i++) {
          const a = prev[i];
          const b = allFormatted[i];
          if (a.id !== b.id) return false;
          if (a.title !== b.title) return false;
          if (a.section !== b.section) return false;
          if (a.pinned !== b.pinned) return false;
          if (a.ts !== b.ts) return false;
          // kanban_columns changes are written to projects.updated_at so
          // `ts` should differ — but check explicitly to survive any
          // server-side clock skew or skipped touched_at update.
          if (!sameColumns(a.kanbanColumns, b.kanbanColumns)) return false;
        }
        return true;
      };
      setProjects(prev => sameAsPrev(prev) ? prev : allFormatted);
      setHistory(prev => sameAsPrev(prev) ? prev : allFormatted);

      // Also refresh activeProject so consumers watching it
      // (TeamCollab's customCols / projectTitle / brief sync) pick up
      // changes that arrive via the polling fallback, not just realtime.
      setActiveProjectState(prev => {
        if (!prev?.id) return prev;
        const incoming = allFormatted.find(p => p.id === prev.id);
        if (!incoming) return prev;
        // Identical? leave reference alone to avoid unnecessary re-renders.
        if (prev.ts === incoming.ts
          && prev.title === incoming.title
          && sameColumns(prev.kanbanColumns, incoming.kanbanColumns)
        ) {
          return prev;
        }
        return { ...prev, ...incoming, currentUserRole: prev.currentUserRole, isShared: prev.isShared };
      });
    } catch (e) {
      console.error('[AppContext] loadProjectsFromDB exception:', e);
    }
  }

  // ── Realtime: projects sync across devices + invited members ──────────────
  // Subscribes to ALL changes on the projects table. Supabase Realtime applies
  // RLS to the change stream, so each client only receives rows it is allowed
  // to read (own projects + projects the user is a team_member of).
  //
  // Requires the projects table to be in the supabase_realtime publication
  // (handled by supabase/cross-device-sync.sql).
  //
  // We use a ref for the active workspace so handlers always read the
  // current value without resubscribing on every workspace switch. Events
  // whose row.workspace_id doesn't match are skipped — otherwise a change
  // in workspace A would briefly populate the local state on a client
  // viewing workspace B and lock activeProject onto the wrong row.
  const activeWorkspaceIdRef = useRef(workspace?.id);
  useEffect(() => { activeWorkspaceIdRef.current = workspace?.id; }, [workspace?.id]);
  useEffect(() => {
    if (!authUser?.id) return;

    const channel = supabase
      .channel(`projects-sync-${authUser.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'projects',
      }, (payload) => {
        const eventWsId = payload.new?.workspace_id ?? payload.old?.workspace_id;
        const activeWsId = activeWorkspaceIdRef.current;
        if (activeWsId && eventWsId && eventWsId !== activeWsId) {
          // Cross-workspace event — ignore so this tab's state stays
          // scoped to the workspace the user is actually viewing.
          return;
        }
        console.log('[projects realtime] event:', payload.eventType, payload.new?.id || payload.old?.id, payload);
        if (payload.eventType === 'INSERT') {
          // For owned projects we can immediately tag the role as Admin.
          // For shared projects the team_members realtime listener triggers
          // a full refetch which assigns the correct role.
          const extra = payload.new?.user_id === authUser.id ? { currentUserRole: 'Admin' } : {};
          const incoming = formatProjectRow(payload.new, extra);
          setProjects(prev => prev.some(p => p.id === incoming.id) ? prev : [incoming, ...prev]);
          setHistory(prev => prev.some(p => p.id === incoming.id) ? prev : [incoming, ...prev]);
        } else if (payload.eventType === 'UPDATE') {
          // Preserve currentUserRole / isShared (not on the projects payload)
          // by merging incoming onto prev.
          const incoming = formatProjectRow(payload.new);
          setProjects(prev => prev.map(p => p.id === incoming.id ? { ...p, ...incoming, currentUserRole: p.currentUserRole, isShared: p.isShared } : p));
          setHistory(prev => prev.map(p => p.id === incoming.id ? { ...p, ...incoming, currentUserRole: p.currentUserRole, isShared: p.isShared } : p));
          setActiveProjectState(prev => prev?.id === incoming.id ? { ...prev, ...incoming, currentUserRole: prev.currentUserRole, isShared: prev.isShared } : prev);
        } else if (payload.eventType === 'DELETE') {
          const goneId = payload.old?.id;
          if (!goneId) return;
          setProjects(prev => prev.filter(p => p.id !== goneId));
          setHistory(prev => prev.filter(p => p.id !== goneId));
          setActiveProjectState(prev => prev?.id === goneId ? null : prev);
        }
      })
      .subscribe((status, err) => {
        console.log('[projects realtime] subscription status:', status, err || '');
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          console.error('[projects realtime] subscription failed — most likely the projects table is NOT in the supabase_realtime publication. Run cross-device-sync.sql in Supabase SQL Editor.');
        }
      });

    return () => { supabase.removeChannel(channel); };
  }, [authUser?.id]);

  // ── Realtime: team_members so invited users see new shared projects ───────
  // When a row is inserted that grants this user access to a new project,
  // refetch projects so the shared one appears in their sidebar.
  useEffect(() => {
    if (!authUser?.id) return;

    const channel = supabase
      .channel(`team-members-sync-${authUser.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'team_members',
        filter: `user_id=eq.${authUser.id}`,
      }, () => {
        loadProjectsFromDB(authUser.id, workspace?.id);
      })
      .on('postgres_changes', {
        event: 'DELETE',
        schema: 'public',
        table: 'team_members',
        filter: `user_id=eq.${authUser.id}`,
      }, (payload) => {
        const goneProjectId = payload.old?.project_id;
        if (!goneProjectId) return;
        // Remove the shared project from sidebar lists
        setProjects(prev => prev.filter(p => !(p.isShared && p.id === goneProjectId)));
        setHistory(prev => prev.filter(p => !(p.isShared && p.id === goneProjectId)));
        // If the kicked user was viewing this project, drop it from
        // activeProject — TeamCollab's switch-to-most-recent effect
        // takes over from there. Also scrub the localStorage caches so
        // the board state + columns don't linger.
        setActiveProjectState(prev => prev?.id === goneProjectId ? null : prev);
        try {
          if (localStorage.getItem('teamcollab-active-project') === goneProjectId) {
            localStorage.removeItem('teamcollab-active-project');
          }
          localStorage.removeItem('tc-project-' + goneProjectId);
          localStorage.removeItem('tc-cols-' + goneProjectId);
          const list = JSON.parse(localStorage.getItem('teamcollab-projects') || '[]');
          if (Array.isArray(list)) {
            const filtered = list.filter(p => p.id !== goneProjectId);
            localStorage.setItem('teamcollab-projects', JSON.stringify(filtered));
          }
        } catch {}
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [authUser?.id]);

  // ── Polling fallback for cross-device sync ────────────────────────────────
  // Realtime can fail silently if the projects table isn't in the
  // supabase_realtime publication or if a connection drops mid-session.
  // We poll every 5s while the tab is visible, and immediately on visibility
  // change. Cheap query (single SELECT filtered by user_id) — no perf concern.
  useEffect(() => {
    if (!authUser?.id) return;
    // Wait until the workspace is resolved before fetching projects.
    // Loading with a null workspaceId would pull in projects from every
    // workspace and a stale activeProject from another browser would lock
    // onto the wrong row.
    if (!workspace?.id) return;

    let cancelled = false;

    const poll = () => {
      if (document.hidden || cancelled) return;
      loadProjectsFromDB(authUser.id, workspace.id);
    };

    // Fire once immediately so switching workspaces shows the new contents
    // before the next 5s tick.
    poll();

    const interval = setInterval(poll, 5000);
    const onVisibility = () => { if (!document.hidden) poll(); };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', poll);

    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', poll);
    };
  }, [authUser?.id, workspace?.id]);

  // ── Intake forms ──────────────────────────────────────────────────────────

  async function loadIntakeForms() {
    if (!authUser) return [];
    setLoadingForms(true);
    let result = [];
    try {
      // Wildcard on intake_submissions so the query never fails when a
      // newer pipeline column hasn't been applied to this DB yet
      // (e.g. translated_result / approved_at / failure_* / flags /
      // client_name / business_name). Missing columns are just absent
      // from the row — the IntakeFormCard already falls back gracefully.
      const { data, error: selErr } = await supabase
        .from('intake_forms')
        .select('*, intake_submissions(*)')
        .eq('user_id', authUser.id)
        .order('created_at', { ascending: false });
      if (selErr) {
        console.error('[AppContext] loadIntakeForms select error:', selErr.message);
        setLoadingForms(false);
        return [];
      }

      // Scope to the active workspace. Legacy rows (workspace_id=null) belong
      // to the user's earliest workspace by the backfill convention.
      const primaryWsId = workspaces[0]?.id || null;
      const activeWsId = workspace?.id || null;
      const inActiveWorkspace = (f) => {
        if (!activeWsId) return true;
        if (f.workspace_id === activeWsId) return true;
        if (f.workspace_id == null && activeWsId === primaryWsId) return true;
        return false;
      };

      result = (data || []).filter(inActiveWorkspace);
      setIntakeForms(result);
    } catch (e) {
      console.error('[AppContext] loadIntakeForms error:', e);
    }
    setLoadingForms(false);
    return result;
  }

  useEffect(() => {
    if (authUser) {
      loadIntakeForms().then(forms => {
        // Seed known-complete IDs on first load so we don't toast for existing completions
        if (knownCompleteIdsRef.current === null) {
          knownCompleteIdsRef.current = new Set(
            forms.filter(f => f.status === 'complete').map(f => f.id)
          );
        }
      });
    }
  }, [authUser?.id, workspace?.id]);

  // Poll every 60 seconds for new completed submissions
  useEffect(() => {
    if (!authUser) return;

    const interval = setInterval(async () => {
      const freshForms = await loadIntakeForms();

      if (knownCompleteIdsRef.current === null) return;

      const newComplete = freshForms.filter(f =>
        f.status === 'complete' &&
        !knownCompleteIdsRef.current.has(f.id)
      );

      if (newComplete.length > 0) {
        showToast(
          '🎉 ' + newComplete[0].project_name +
          ' — client submitted their brief!'
        );
        newComplete.forEach(f => knownCompleteIdsRef.current.add(f.id));
      }
    }, 60000);

    return () => clearInterval(interval);
  }, [authUser?.id]);

  // ── Theme ─────────────────────────────────────────────────────────────────

  function toggleTheme() {
    setTheme(t => t === 'light' ? 'dark' : t === 'dark' ? 'system' : 'light');
  }

  function updateUser(updates) {
    setUser(prev => {
      const next = { ...prev, ...updates };
      if (updates.name && !updates.firstName) {
        next.firstName = updates.name.trim().split(' ')[0];
      }
      localStorage.setItem('db-user', JSON.stringify(next));
      return next;
    });
  }

  // Force a fresh fetch of the auth user (NOT just the session). Important
  // after server-side user_metadata edits — refreshSession() only renews
  // tokens, it doesn't always rebuild the user object with the new metadata.
  // Calling getUser() pulls the latest row from auth.users and we then
  // overwrite our local authUser so every consumer re-renders with the new
  // avatar_url / name / etc.
  const refreshAuthUser = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) setAuthUser(user);
      return user || null;
    } catch (e) {
      console.error('[refreshAuthUser]', e);
      return null;
    }
  }, []);

  // Refetch profiles.plan + credits + reset timestamp and update the
  // matching context state. Called after a successful upgrade payment so
  // the sidebar plan badge, credits bar, and every plan-gated screen
  // reflect the new plan without a page refresh.
  const refreshUserPlan = useCallback(async () => {
    if (!authUser?.id) return null;
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('plan, credits, credits_used, credits_reset_at, plan_status, access_until, plan_started_at')
        .eq('id', authUser.id)
        .single();
      if (!profile) return null;
      const rawPlan = String(profile.plan || 'free').toLowerCase();
      const planKey = ['free', 'starter', 'pro'].includes(rawPlan) ? rawPlan : 'free';
      const planCap = planKey === 'pro' ? 1000 : planKey === 'starter' ? 300 : 50;
      const credits = typeof profile.credits === 'number' ? profile.credits : planCap;
      const creditsUsedVal = profile.credits_used ?? 0;
      setUserPlan(planKey);
      setCreditsLimit(planCap);
      setUserCredits(credits);
      setCreditsUsed(creditsUsedVal);
      setCreditsResetAt(profile.credits_reset_at || null);
      setPlanStatus(profile.plan_status || 'active');
      setAccessUntil(profile.access_until || null);
      setPlanStartedAt(profile.plan_started_at || null);
      // Also bump the cached user object's plan so anything reading
      // user.plan (rare but legacy) stays consistent.
      setUser(prev => prev ? { ...prev, plan: planKey } : prev);
      try {
        localStorage.setItem('db-plan-state', JSON.stringify({
          plan: planKey,
          credits,
          creditsUsed: creditsUsedVal,
          creditsLimit: planCap,
          creditsResetAt: profile.credits_reset_at || null,
          planStatus: profile.plan_status || 'active',
          accessUntil: profile.access_until || null,
          planStartedAt: profile.plan_started_at || null,
        }));
      } catch {}
      return profile;
    } catch (e) {
      console.error('[refreshUserPlan]', e);
      return null;
    }
  }, [authUser?.id]);

  // Multi-workspace callbacks are declared below, AFTER showToast, to avoid
  // a TDZ ReferenceError on render.

  // ── Sign Out ──────────────────────────────────────────────────────────────

  function signOut() {
    // Fire-and-forget — never await a network call inside signOut.
    // If signOut() hangs the user is stuck forever; clearing storage is enough.
    supabase.auth.signOut().catch(() => {});

    // Remove the exact key Supabase uses (storageKey: 'designbrief-auth-v1')
    // plus any legacy sb-* keys and app state.
    ['designbrief-auth-v1', 'db-workspace', 'db-workspaces', 'db-workspace-history', 'db-plan-state'].forEach(k =>
      localStorage.removeItem(k)
    );
    Object.keys(localStorage).forEach(k => {
      if (k.startsWith('sb-')) localStorage.removeItem(k);
    });

    // Force a full navigation to root — the fresh page will find no session
    // and render <Auth />.
    window.location.replace('/');
  }

  // ── Toast ─────────────────────────────────────────────────────────────────

  const showToast = useCallback((msg, type = 'info') => {
    setNotification({ msg, type });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setNotification(null), 3000);
  }, []);

  // showAIError(error, onRetry?) — surface a user-safe AI error banner.
  // The error object must come from our client wrappers (post() in
  // src/lib/api.js or aiBuildEngine.buildSection) so the .code and
  // .message fields are already mapped to user-safe values by the
  // server-side mapClaudeError helper.
  const showAIError = useCallback((error, onRetry) => {
    const code = (error && error.code) || 'unexpected';
    const message = (error && error.message)
      || 'Something interrupted the AI. Your work is safe — please try again.';
    setAiError({
      code,
      message,
      retryAfter: error?.retryAfter || null,
      onRetry: typeof onRetry === 'function' ? onRetry : null,
      key: Date.now(),
    });
  }, []);

  const clearAIError = useCallback(() => setAiError(null), []);

  // ── Multi-workspace: create + switch ──────────────────────────────────────
  // Paid plans can host multiple workspaces. The API enforces the per-plan
  // cap; we surface a friendly toast + open the upgrade modal on 403.
  // Declared AFTER showToast so the deps array doesn't hit TDZ.
  const createWorkspace = useCallback(async (name) => {
    const trimmed = String(name || '').trim();
    if (!trimmed) return { ok: false, reason: 'empty_name' };
    if (!session?.access_token) return { ok: false, reason: 'no_session' };
    try {
      const res = await fetch('/api/create-workspace', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ workspaceName: trimmed, plan: userPlan }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (body?.error === 'workspace_limit_reached') {
          setUpgradeReason('workspaces');
          showToast?.(body.message || 'Workspace limit reached.', 'warning');
        } else {
          showToast?.(body.error || 'Failed to create workspace', 'error');
        }
        return { ok: false, reason: body?.error || 'http_' + res.status };
      }
      const ws = body.workspace;
      if (!ws) return { ok: false, reason: 'no_workspace' };
      setWorkspaces(prev => {
        const next = [...prev, ws];
        try { localStorage.setItem('db-workspaces', JSON.stringify(next)); } catch {}
        return next;
      });
      localStorage.setItem('db-workspace', JSON.stringify(ws));
      setWorkspace(ws);
      // Brand-new workspace = empty UI. The polling effect refetches once
      // workspace?.id flips (it will find no rows for this workspace yet),
      // and the per-workspace activeProjectId map has no entry for this
      // brand-new id so activeProject stays null until the user opens one.
      setProjects([]);
      setHistory([]);
      setActiveProjectState(null);
      setIntakeForms([]);
      loadConnectorData(ws.id);
      showToast?.(`Workspace "${ws.name}" created`, 'success');
      return { ok: true, workspace: ws };
    } catch (e) {
      console.error('[createWorkspace]', e);
      showToast?.('Failed to create workspace', 'error');
      return { ok: false, reason: 'exception' };
    }
  }, [session, userPlan, showToast]);

  const leaveWorkspace = useCallback(async (id) => {
    const targetId = id || workspace?.id;
    if (!targetId) return { ok: false, reason: 'no_workspace' };
    if (!session?.access_token) return { ok: false, reason: 'no_session' };
    if ((workspaces?.length ?? 0) <= 1) {
      showToast?.('You must keep at least one workspace.', 'warning');
      return { ok: false, reason: 'last_workspace' };
    }
    try {
      const res = await fetch('/api/create-workspace', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ kind: 'workspace', workspace_id: targetId }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast?.(body.message || body.error || 'Failed to leave workspace', 'error');
        return { ok: false, reason: body?.error || 'http_' + res.status };
      }
      // Drop the workspace from local state and switch to whichever is left.
      const remaining = (workspaces || []).filter(w => w.id !== targetId);
      try { localStorage.setItem('db-workspaces', JSON.stringify(remaining)); } catch {}
      setWorkspaces(remaining);
      const next = remaining[0] || null;
      if (next) {
        localStorage.setItem('db-workspace', JSON.stringify(next));
      } else {
        localStorage.removeItem('db-workspace');
      }
      // Drop the leaving workspace from the per-workspace project map so
      // it doesn't haunt the user if they later re-join.
      try {
        const m = JSON.parse(localStorage.getItem('db-workspace-projects') || '{}') || {};
        if (m[targetId]) { delete m[targetId]; localStorage.setItem('db-workspace-projects', JSON.stringify(m)); }
      } catch {}
      setWorkspace(next);
      setProjects([]);
      setHistory([]);
      setActiveProjectState(null);
      setIntakeForms([]);
      if (next?.id) loadConnectorData(next.id);
      showToast?.(body.role === 'owner' ? 'Workspace deleted' : 'You left the workspace', 'success');
      return { ok: true };
    } catch (e) {
      console.error('[leaveWorkspace]', e);
      showToast?.('Failed to leave workspace', 'error');
      return { ok: false, reason: 'exception' };
    }
  }, [session, workspace?.id, workspaces, showToast]);

  const switchWorkspace = useCallback((id) => {
    const ws = workspaces.find(w => w.id === id);
    if (!ws) return false;
    localStorage.setItem('db-workspace', JSON.stringify(ws));
    setWorkspace(ws);
    // Clear the old workspace's view immediately. The polling effect (gated
    // on workspace?.id) refetches for the new workspace right away, and the
    // workspace-scoped activeProjectId effect rehydrates the last-viewed
    // project for the destination workspace so the user lands back on it
    // without having to click through.
    setProjects([]);
    setHistory([]);
    setActiveProjectState(null);
    setIntakeForms([]);
    loadConnectorData(ws.id);
    return true;
  }, [workspaces]);

  // ── consumeCredits ────────────────────────────────────────────────────────
  // Centralised credit-deduction wrapper that every AI action calls before
  // firing. Declared AFTER showToast so its deps array can read showToast
  // without hitting TDZ.
  const consumeCredits = useCallback(async (action) => {
    try {
      const mod = await import('../lib/credits.js')
      const { deductCredits } = mod
      const r = await deductCredits(supabase, authUser?.id, action)
      if (!r.success) {
        if (r.reason === 'insufficient_credits') {
          setUpgradeReason('credits')
          showToast?.('No credits remaining. Upgrade to continue.', 'error')
        } else {
          console.error('[consumeCredits] failed:', r.reason)
        }
        return { ok: false, reason: r.reason }
      }
      const remaining = r.creditsRemaining ?? 0
      setUserCredits(remaining)
      setCreditsUsed(prev => {
        const next = r.used ?? prev
        try {
          const cur = JSON.parse(localStorage.getItem('db-plan-state') || '{}')
          localStorage.setItem('db-plan-state', JSON.stringify({ ...cur, credits: remaining, creditsUsed: next }))
        } catch {}
        return next
      })
      // Log into credit_usage_log so the Billing page can group by action.
      // RLS lets the user insert their own rows; failures here must NOT
      // block the AI action that just succeeded.
      try {
        const { CREDIT_COSTS } = mod
        await supabase.from('credit_usage_log').insert({
          user_id: authUser?.id,
          action,
          credits: CREDIT_COSTS?.[action] || 0,
        })
      } catch {}
      if (remaining === 0) {
        showToast?.('No credits remaining. Upgrade to continue.', 'error')
        setUpgradeReason('credits')
      } else if (remaining === 5) {
        showToast?.('Only 5 credits left.', 'warning')
      } else if (remaining === 10) {
        showToast?.('10 credits remaining — upgrade to get more.', 'warning')
      }
      return { ok: true, creditsRemaining: remaining }
    } catch (e) {
      console.error('[consumeCredits]', e)
      return { ok: false, reason: 'unknown' }
    }
  }, [authUser?.id, showToast]);

  // ── Navigation ────────────────────────────────────────────────────────────

  const setActiveSection = useCallback((section) => {
    setActiveSectionState(section);
  }, []);

  // Persist the active section any time it changes, regardless of which
  // code path triggered the change (setActiveSection vs direct
  // setActiveSectionState calls inside this file).
  useEffect(() => {
    try {
      if (activeSection && !NON_PERSISTABLE_SECTIONS.has(activeSection)) {
        localStorage.setItem('db-active-section', activeSection);
      }
    } catch {}
  }, [activeSection]);

  // Persist the active project's id whenever it changes. We write a
  // workspace-scoped map (db-workspace-projects = { wsId: projId }) so each
  // workspace remembers its last-viewed project, AND mirror to the legacy
  // db-active-project-id key for code paths that haven't migrated yet.
  useEffect(() => {
    try {
      const wsId = workspace?.id || null;
      let map = {};
      try { map = JSON.parse(localStorage.getItem('db-workspace-projects') || '{}') || {}; } catch {}
      if (activeProject?.id) {
        localStorage.setItem('db-active-project-id', activeProject.id);
        if (wsId) {
          map[wsId] = activeProject.id;
          localStorage.setItem('db-workspace-projects', JSON.stringify(map));
        }
        if (activeProjectId !== activeProject.id) setActiveProjectId(activeProject.id);
      } else {
        localStorage.removeItem('db-active-project-id');
        if (wsId && map[wsId]) {
          delete map[wsId];
          localStorage.setItem('db-workspace-projects', JSON.stringify(map));
        }
        if (activeProjectId !== null) setActiveProjectId(null);
      }
    } catch {}
  }, [activeProject?.id]);

  // When the workspace flips, restore activeProjectId from the workspace-
  // scoped map so the hydrate effect below can re-open the project the
  // user was last viewing in this workspace.
  useEffect(() => {
    const wsId = workspace?.id;
    if (!wsId) return;
    try {
      const map = JSON.parse(localStorage.getItem('db-workspace-projects') || '{}') || {};
      const remembered = map[wsId] || null;
      if (remembered !== activeProjectId) setActiveProjectId(remembered);
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace?.id]);

  // After projects load, hydrate activeProject from the persisted id so a
  // refresh on /document or /team lands back on the same project the user
  // was viewing. Only fires when activeProject is null AND we have a
  // remembered id AND the matching project exists in ctxProjects.
  useEffect(() => {
    if (activeProject) return;
    if (!activeProjectId) return;
    if (!Array.isArray(projects) || projects.length === 0) return;
    const found = projects.find(p => p.id === activeProjectId);
    if (found) {
      setActiveProjectState(found);
    }
  }, [activeProject, activeProjectId, projects]);

  const navigate = setActiveSection;

  const openProject = useCallback((project) => {
    const normalized = {
      ...project,
      result:  project.result  ?? project.data?.result  ?? null,
      scoring: project.scoring ?? project.data?.scoring ?? null,
      title:   project.title   ?? project.data?.projectName ?? 'Untitled',
    };
    setActiveProjectState(normalized);
    // Routing rules:
    //  - team kanban projects (section='team') land on ProjectOverview
    //  - projects with no translated brief land on ProjectOverview too
    //  - translated briefs are loaded into the Dashboard's ResultView
    //    (same view that renders after a fresh translation)
    const hasResult = !!normalized.result;
    const isManual = normalized.section === 'team' || !hasResult;
    if (isManual) {
      setActiveSectionState('project-overview');
    } else {
      setActiveProjectBriefResult(normalized.result);
      setActiveProjectScoring(normalized.scoring || null);
      setActiveSectionState('dashboard');
    }
  }, []);

  // ── Projects ──────────────────────────────────────────────────────────────

  const setActiveProject = useCallback((project) => {
    setActiveProjectState(project);
  }, []);

  const saveProject = useCallback((project) => {
    const item = {
      id: project.id ?? `proj_${Date.now()}`,
      title: project.title ?? 'Untitled Project',
      section: project.section ?? 'brief-translator',
      brief: project.brief ?? '',
      scoring: project.scoring ?? null,
      result: project.result ?? null,
      teamMembers: project.teamMembers ?? [],
      kanban: project.kanban ?? null,
      pinned: project.pinned ?? false,
      ts: project.ts ?? Date.now(),
      shareId: project.shareId ?? generateShareId(),
      ...project,
    };
    setProjects(prev => upsert(prev, item));
    setActiveProjectState(item);
    // Fire-and-forget Supabase update for team + kanban
    if (authUser && item.id) {
      supabase.from('projects').update({
        team_members: item.teamMembers || [],
        kanban: item.kanban || null,
        updated_at: new Date().toISOString(),
      }).eq('id', item.id).eq('user_id', authUser.id)
        .then(({ error }) => { if (error) console.error('[AppContext] saveProject:', error); });
    }
    return item;
  }, [authUser]);

  const deleteProject = useCallback((id) => {
    console.log('[deleteProject] called', { id });
    setProjects(prev => prev.filter(p => p.id !== id));
    setHistory(prev => prev.filter(h => h.id !== id));
    setActiveProjectState(prev => (prev?.id === id ? null : prev));
    if (!authUser) return;
    const accessToken = session?.access_token;
    if (!accessToken) {
      console.warn('[deleteProject] no session in state, skipping DB write');
      return;
    }
    (async () => {
      try {
        const res = await Promise.race([
          fetch('/api/create-workspace', {
            method: 'DELETE',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify({ project_id: id }),
          }),
          new Promise((_, rj) => setTimeout(() => rj(new Error('DELETE timed out after 10s')), 10000)),
        ]);
        const body = await res.json().catch(() => ({}));
        console.log('[deleteProject] HTTP', res.status, body);
        if (!res.ok) showToast?.('Failed to delete: ' + (body.error || res.status), 'error');
      } catch (e) {
        console.error('[deleteProject] FAILED:', e.message);
        showToast?.('Failed to delete project', 'error');
      }
    })();
  }, [authUser, session, showToast]);

  const pinProject = useCallback((id) => {
    let nextPinned = false;
    setProjects(prev =>
      prev.map(p => {
        if (p.id === id) { nextPinned = !p.pinned; return { ...p, pinned: nextPinned }; }
        return p;
      })
    );
    setHistory(prev =>
      prev.map(p => p.id === id ? { ...p, pinned: nextPinned } : p)
    );
    if (!authUser) return;
    (async () => {
      try {
        const res = await supabase.from('projects')
          .update({ pinned: nextPinned, updated_at: new Date().toISOString() })
          .eq('id', id).eq('user_id', authUser.id)
          .select('id');
        console.log('[pinProject] result:', res);
        if (res.error) console.error('[pinProject] error:', res.error);
      } catch (e) {
        console.error('[pinProject] exception:', e);
      }
    })();
  }, [authUser]);

  const renameProject = useCallback((id, title, sectionOverride = null) => {
    console.log('[renameProject] called', { id, title, sectionOverride, hasAuthUser: !!authUser });
    // sectionOverride lets the caller force a specific section value
    // (e.g. TeamCollab always sends 'team' so a renamed TC board can never
    // accidentally become a brief-translator entry, even if a prior bad
    // row exists in DB with section='translator').
    let preservedSection = sectionOverride;

    // Optimistic update — IMPORTANT: handle both "exists" (rename) and
    // "doesn't exist yet" (create-via-handleNewProject) cases. Without the
    // upsert behaviour here, a brand-new TC project never landed in
    // AppContext.projects on Device A, so its realtime echo on Device B
    // couldn't be cross-referenced and the polling fallback also missed it.
    const newRow = {
      id,
      title,
      section: sectionOverride || 'team',
      ts: Date.now(),
      pinned: false,
      data: { brief: null, projectName: title, scoring: null, result: null },
      teamMembers: [],
      kanban: null,
      approvalStatus: {},
      comments: {},
      locked: false,
      shareId: null,
    };
    setProjects(prev => {
      const idx = prev.findIndex(p => p.id === id);
      if (idx === -1) return [newRow, ...prev];
      if (!preservedSection) {
        const existing = prev[idx];
        if (existing?.section) preservedSection = existing.section;
      }
      return prev.map(p => p.id === id ? { ...p, title, ...(sectionOverride ? { section: sectionOverride } : {}) } : p);
    });
    setHistory(prev => {
      const idx = prev.findIndex(p => p.id === id);
      if (idx === -1) return [newRow, ...prev];
      return prev.map(p => p.id === id ? { ...p, title, ...(sectionOverride ? { section: sectionOverride } : {}) } : p);
    });
    setActiveProjectState(prev => prev?.id === id ? { ...prev, title, ...(sectionOverride ? { section: sectionOverride } : {}) } : prev);
    if (!authUser) return;

    (async () => {
      // Use the cached session from state — calling supabase.auth.getSession()
      // can hang on subsequent calls due to internal token-refresh races.
      const accessToken = session?.access_token;
      if (!accessToken) {
        console.warn('[renameProject] no session in state, skipping DB write');
        return;
      }

      try {
        const updates = { title };
        if (preservedSection) updates.section = preservedSection;
        console.log('[renameProject] sending PATCH', { id, updates });
        const t0 = performance.now();
        const res = await Promise.race([
          fetch('/api/create-workspace', {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify({ project_id: id, updates, workspace_id: workspace?.id }),
          }),
          new Promise((_, rj) => setTimeout(() => rj(new Error('PATCH timed out after 10s')), 10000)),
        ]);
        console.log('[renameProject] HTTP', res.status, `(${Math.round(performance.now() - t0)}ms)`);
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          console.error('[renameProject] server error:', body);
          showToast?.('Failed to rename: ' + (body.error || res.status), 'error');
        } else {
          console.log('[renameProject] saved:', body.project?.id, body.project?.title);
        }
      } catch (e) {
        console.error('[renameProject] FAILED:', e.message);
        showToast?.('Failed: ' + e.message, 'error');
      }
    })();
  }, [authUser, session, showToast]);

  // touchProject: bump projects.updated_at WITHOUT changing any owner-only
  // fields (title / pinned / locked / section). The API allows any active
  // member to fire this — used by handleSwitchProject so the user's "most
  // recently viewed" project syncs across their own devices regardless of
  // whether they're Admin / Editor / Viewer on it.
  const touchProject = useCallback(async (id) => {
    if (!id || id === 'default') return;
    const accessToken = session?.access_token;
    if (!accessToken) return;
    try {
      await fetch('/api/create-workspace', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ project_id: id, updates: {} }),
      });
    } catch {}
  }, [session]);

  const shareProject = useCallback((project) => {
    const url = `${window.location.origin}/project/${project.shareId}`;
    navigator.clipboard.writeText(url).then(() => {
      showToast('Share link copied to clipboard', 'success');
    }).catch(() => {
      showToast('Could not copy link', 'error');
    });
  }, [showToast]);

  // ── History ───────────────────────────────────────────────────────────────

  const saveHistory = useCallback(async (item) => {
    const entry = {
      id: item.id ?? `hist_${Date.now()}`,
      section: item.section ?? 'brief-translator',
      title: item.title ?? 'Untitled',
      ts: item.ts ?? Date.now(),
      pinned: item.pinned ?? false,
      data: item.data ?? {},
      ...item,
    };

    // Update local state immediately (instant UI)
    setHistory(prev => upsert(prev, entry));
    setActiveChat(entry.id);

    // Persist to Supabase if logged in
    if (authUser) {
      try {
        const record = {
          id: entry.id,
          user_id: authUser.id,
          workspace_id: workspace?.id || null,
          title: entry.title || 'Untitled',
          section: entry.section || 'translator',
          brief_text: entry.data?.brief || '',
          scoring: entry.data?.scoring || null,
          result: entry.data?.result || null,
          team_members: entry.teamMembers || [],
          kanban: entry.kanban || null,
          pinned: entry.pinned || false,
          updated_at: new Date().toISOString(),
        };

        const { error } = await supabase
          .from('projects')
          .upsert(record, { onConflict: 'id' });

        if (error) console.error('[AppContext] saveHistory Supabase error:', error);
      } catch (e) {
        console.error('[AppContext] saveHistory exception:', e);
      }
    }

    return entry;
  }, [authUser]);

  const deleteHistory = useCallback((id) => {
    setHistory(prev => prev.filter(h => h.id !== id));
    setProjects(prev => prev.filter(p => p.id !== id));
    setActiveChat(prev => (prev === id ? null : prev));
    setActiveProjectState(prev => (prev?.id === id ? null : prev));
    if (authUser) {
      supabase.from('projects').delete().eq('id', id).eq('user_id', authUser.id)
        .then(({ error }) => { if (error) console.error('[AppContext] deleteHistory:', error); });
    }
  }, [authUser]);

  const pinHistory = useCallback((id) => {
    let nextPinned = false;
    setHistory(prev =>
      prev.map(h => {
        if (h.id === id) { nextPinned = !h.pinned; return { ...h, pinned: nextPinned }; }
        return h;
      })
    );
    setProjects(prev =>
      prev.map(p => p.id === id ? { ...p, pinned: nextPinned } : p)
    );
    if (authUser) {
      supabase.from('projects')
        .update({ pinned: nextPinned, updated_at: new Date().toISOString() })
        .eq('id', id).eq('user_id', authUser.id)
        .then(({ error }) => { if (error) console.error('[AppContext] pinHistory:', error); });
    }
  }, [authUser]);

  const renameHistory = useCallback((id, title) => {
    // Translator/brief projects exist in DB already (created via the
    // translator flow). Use the same server-side PATCH path as renameProject
    // for consistency — direct .update() was also subject to the hang.
    setHistory(prev => prev.map(h => h.id === id ? { ...h, title } : h));
    setProjects(prev => prev.map(p => p.id === id ? { ...p, title } : p));
    setActiveProjectState(prev => prev?.id === id ? { ...prev, title } : prev);
    if (!authUser) return;
    const accessToken = session?.access_token;
    if (!accessToken) return;
    (async () => {
      try {
        const res = await Promise.race([
          fetch('/api/create-workspace', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
            body: JSON.stringify({ project_id: id, updates: { title, section: 'translator' }, workspace_id: workspace?.id }),
          }),
          new Promise((_, rj) => setTimeout(() => rj(new Error('PATCH timed out')), 10000)),
        ]);
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          console.error('[renameHistory] server error:', body);
          showToast?.('Failed to rename: ' + (body.error || res.status), 'error');
        }
      } catch (e) {
        console.error('[renameHistory] FAILED:', e.message);
      }
    })();
  }, [authUser, session, showToast]);

  const shareHistory = useCallback((item) => {
    const url = `${window.location.origin}/share/${item.id}`;
    navigator.clipboard.writeText(url).then(() => {
      showToast('Share link copied to clipboard', 'success');
    }).catch(() => {
      showToast('Could not copy link', 'error');
    });
  }, [showToast]);

  // ── Value ─────────────────────────────────────────────────────────────────

  const value = {
    // State
    projects,
    activeProject,
    activeSection,
    history,
    activeChat,
    notification,

    // Project actions
    setActiveProject,
    saveProject,
    deleteProject,
    pinProject,
    renameProject,
    touchProject,
    shareProject,

    // History actions
    setActiveChat,
    saveHistory,
    deleteHistory,
    pinHistory,
    renameHistory,
    shareHistory,

    // Intake
    activeIntakeId,
    setActiveIntakeId,
    activeIntakeSubmissionId,
    setActiveIntakeSubmissionId,
    activeFollowupToken,
    setActiveFollowupToken,
    activeShareToken,
    setActiveShareToken,
    intakeForms,
    loadingForms,
    loadIntakeForms,

    // Join
    joinToken,
    setJoinToken,

    // Navigation
    setActiveSection,
    navigate,
    openProject,

    // Toast
    showToast,
    aiError,
    showAIError,
    clearAIError,

    // Theme
    theme,
    setTheme,
    toggleTheme,

    // User
    user,
    updateUser,
    refreshAuthUser,
    refreshUserPlan,

    // Auth
    authUser,
    session,
    authLoading,
    signOut,

    // Workspace
    workspace,
    setWorkspace,
    workspaces,
    loadWorkspace,
    createWorkspace,
    switchWorkspace,
    leaveWorkspace,
    workspaceLoading,
    workspaceLoadError,

    // Plan + credits
    userPlan,
    setUserPlan,
    userCredits,
    setUserCredits,
    creditsUsed,
    creditsLimit,
    creditsResetAt,
    planStatus,
    accessUntil,
    planStartedAt,
    setCreditsUsed,

    // Upgrade modal
    upgradeReason,
    openUpgradeModal,
    closeUpgradeModal,
    consumeCredits,

    // Templates
    selectedBriefTemplate,
    setSelectedBriefTemplate,
    selectedWebsiteTemplate,
    setSelectedWebsiteTemplate,
    activeProjectBriefResult,
    setActiveProjectBriefResult,
    activeProjectScoring,
    setActiveProjectScoring,

    // Connector data
    connectorData,
    setConnectorData,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export default AppContext;
