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
  const [activeSection, setActiveSectionState] = useState('dashboard');
  const [history, setHistory] = useState([]);
  const [activeChat, setActiveChat] = useState(null);
  const [notification, setNotification] = useState(null);
  const [activeIntakeId, setActiveIntakeId] = useState(null);
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
  const [workspaceLoading, setWorkspaceLoading] = useState(() => {
    // If we have a cached workspace, don't show a loading spinner on return visits
    try { return !localStorage.getItem('db-workspace'); } catch { return true; }
  });
  const [workspaceLoadError, setWorkspaceLoadError] = useState(false);

  // ── Credits state ─────────────────────────────────────────────────────────
  const FREE_DAILY_LIMIT = 50;
  const [creditsUsed, setCreditsUsed] = useState(0);
  const [creditsLimit] = useState(FREE_DAILY_LIMIT);

  // ── Template state ────────────────────────────────────────────────────────
  const [selectedBriefTemplate, setSelectedBriefTemplate] = useState('agency-deck');
  const [selectedWebsiteTemplate, setSelectedWebsiteTemplate] = useState('saas-landing');
  const [activeProjectBriefResult, setActiveProjectBriefResult] = useState(null);

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
          localStorage.removeItem('db-workspace');
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

      const updatedUser = {
        id: supabaseUser.id,
        name: fullName,
        firstName,
        email: supabaseUser.email || '',
        plan: profile?.plan || 'Free',
        avatarUrl: profile?.avatar_url || null,
      };

      setUser(updatedUser);
      localStorage.setItem('db-user', JSON.stringify(updatedUser));

      await loadProjectsFromDB(supabaseUser.id);

      // Skip loadWorkspace when a workspace invite is being accepted — doAccept will set the
      // workspace directly after the member insert commits, avoiding a race condition.
      let foundWorkspace = null;
      if (localStorage.getItem('db-invite-token')) {
        setWorkspaceLoading(false);
      } else {
        foundWorkspace = await loadWorkspace(supabaseUser.id);
      }

      loadCreditsUsed(supabaseUser.id);

      // Redirect to join page only if the user already has a workspace.
      // New users (no workspace) must complete WorkspaceSetup first — App.jsx's
      // onComplete callback will navigate them to 'join' after their workspace is created.
      const storedToken = localStorage.getItem('db-join-token');
      if (storedToken && foundWorkspace) {
        setActiveSectionState('join');
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
      const ws = body.workspace;

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

  async function loadProjectsFromDB(userId) {
    try {
      // 1. Projects this user owns
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

      const ownFormatted = (data || []).map(p => formatProjectRow(p));
      const ownIds = new Set(ownFormatted.map(p => p.id));

      // 2. Shared projects — where this user is a team_member but not the owner.
      //    Requires the "Team members can view invited projects" RLS policy on projects.
      const { data: memberData } = await supabase
        .from('team_members')
        .select('project_id, job_role, projects(*)')
        .eq('user_id', userId)
        .eq('status', 'active');

      const sharedFormatted = (memberData || [])
        .filter(m => m.projects && !ownIds.has(m.project_id))
        .map(m => formatProjectRow(m.projects, { isShared: true, myRole: m.job_role }));

      const allFormatted = [...ownFormatted, ...sharedFormatted];

      // Skip the setState entirely if nothing changed — otherwise every 5s poll
      // re-assigns the array (new reference) and re-renders every consumer of
      // ctxProjects, including TeamCollab. That re-render redefines components
      // declared inside TeamCollab (InlineAddTask etc.) and wipes their local
      // input state, making typing 'disappear' for slow typists.
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
        }
        return true;
      };
      setProjects(prev => sameAsPrev(prev) ? prev : allFormatted);
      setHistory(prev => sameAsPrev(prev) ? prev : allFormatted);
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
  useEffect(() => {
    if (!authUser?.id) return;

    const channel = supabase
      .channel(`projects-sync-${authUser.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'projects',
      }, (payload) => {
        console.log('[projects realtime] event:', payload.eventType, payload.new?.id || payload.old?.id, payload);
        if (payload.eventType === 'INSERT') {
          const incoming = formatProjectRow(payload.new);
          setProjects(prev => prev.some(p => p.id === incoming.id) ? prev : [incoming, ...prev]);
          setHistory(prev => prev.some(p => p.id === incoming.id) ? prev : [incoming, ...prev]);
        } else if (payload.eventType === 'UPDATE') {
          const incoming = formatProjectRow(payload.new);
          setProjects(prev => prev.map(p => p.id === incoming.id ? { ...p, ...incoming } : p));
          setHistory(prev => prev.map(p => p.id === incoming.id ? { ...p, ...incoming } : p));
          setActiveProjectState(prev => prev?.id === incoming.id ? { ...prev, ...incoming } : prev);
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
        loadProjectsFromDB(authUser.id);
      })
      .on('postgres_changes', {
        event: 'DELETE',
        schema: 'public',
        table: 'team_members',
        filter: `user_id=eq.${authUser.id}`,
      }, (payload) => {
        const goneProjectId = payload.old?.project_id;
        if (!goneProjectId) return;
        setProjects(prev => prev.filter(p => !(p.isShared && p.id === goneProjectId)));
        setHistory(prev => prev.filter(p => !(p.isShared && p.id === goneProjectId)));
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

    let cancelled = false;

    const poll = () => {
      if (document.hidden || cancelled) return;
      loadProjectsFromDB(authUser.id);
    };

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
  }, [authUser?.id]);

  // ── Intake forms ──────────────────────────────────────────────────────────

  async function loadIntakeForms() {
    if (!authUser) return [];
    setLoadingForms(true);
    let result = [];
    try {
      const { data } = await supabase
        .from('intake_forms')
        .select(`
          *,
          intake_submissions (
            id,
            status,
            result,
            scoring,
            submitted_at,
            created_at
          )
        `)
        .eq('user_id', authUser.id)
        .order('created_at', { ascending: false });

      result = data || [];
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
  }, [authUser?.id]);

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

  // ── Sign Out ──────────────────────────────────────────────────────────────

  function signOut() {
    // Fire-and-forget — never await a network call inside signOut.
    // If signOut() hangs the user is stuck forever; clearing storage is enough.
    supabase.auth.signOut().catch(() => {});

    // Remove the exact key Supabase uses (storageKey: 'designbrief-auth-v1')
    // plus any legacy sb-* keys and app state.
    ['designbrief-auth-v1', 'db-workspace', 'db-workspace-history'].forEach(k =>
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

  // ── Navigation ────────────────────────────────────────────────────────────

  const setActiveSection = useCallback((section) => {
    setActiveSectionState(section);
  }, []);

  const navigate = setActiveSection;

  const openProject = useCallback((project) => {
    const normalized = {
      ...project,
      result:  project.result  ?? project.data?.result  ?? null,
      scoring: project.scoring ?? project.data?.scoring ?? null,
      title:   project.title   ?? project.data?.projectName ?? 'Untitled',
    };
    setActiveProjectState(normalized);
    setActiveSectionState('document');
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
            body: JSON.stringify({ project_id: id, updates }),
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
            body: JSON.stringify({ project_id: id, updates: { title, section: 'translator' } }),
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

    // Theme
    theme,
    setTheme,
    toggleTheme,

    // User
    user,
    updateUser,

    // Auth
    authUser,
    session,
    authLoading,
    signOut,

    // Workspace
    workspace,
    setWorkspace,
    loadWorkspace,
    workspaceLoading,
    workspaceLoadError,

    // Credits
    creditsUsed,
    creditsLimit,
    setCreditsUsed,

    // Templates
    selectedBriefTemplate,
    setSelectedBriefTemplate,
    selectedWebsiteTemplate,
    setSelectedWebsiteTemplate,
    activeProjectBriefResult,
    setActiveProjectBriefResult,

    // Connector data
    connectorData,
    setConnectorData,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export default AppContext;
