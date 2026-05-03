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
  const [authLoading, setAuthLoading] = useState(true);

  // ── Workspace state ───────────────────────────────────────────────────────
  const [workspace, setWorkspace] = useState(null);
  const [workspaceLoading, setWorkspaceLoading] = useState(true);

  // ── Credits state ─────────────────────────────────────────────────────────
  const FREE_DAILY_LIMIT = 50;
  const [creditsUsed, setCreditsUsed] = useState(0);
  const [creditsLimit] = useState(FREE_DAILY_LIMIT);

  // ── Template state ────────────────────────────────────────────────────────
  const [selectedBriefTemplate, setSelectedBriefTemplate] = useState('agency-deck');
  const [selectedWebsiteTemplate, setSelectedWebsiteTemplate] = useState('saas-landing');
  const [activeProjectBriefResult, setActiveProjectBriefResult] = useState(null);

  const toastTimer = useRef(null);

  // ── Theme sync ────────────────────────────────────────────────────────────

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('db-theme', theme);
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
          await handleAuthUser(session.user);
        } else if (event === 'SIGNED_OUT') {
          setAuthUser(null);
          setWorkspace(null);
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
      await loadWorkspace(supabaseUser.id);
      loadCreditsUsed(supabaseUser.id);

      // Redirect to join page if there's a stored invite token
      const storedToken = localStorage.getItem('db-join-token');
      if (storedToken) {
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
    setWorkspaceLoading(true);
    try {
      const { data } = await supabase
        .from('workspaces')
        .select('*')
        .eq('owner_id', userId)
        .order('created_at', { ascending: true })
        .limit(1)
        .single();

      setWorkspace(data || null);
    } catch (e) {
      setWorkspace(null);
    } finally {
      setWorkspaceLoading(false);
    }
  }

  async function loadProjectsFromDB(userId) {
    try {
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false });

      if (error) {
        console.error('[AppContext] loadProjectsFromDB error:', error);
        return;
      }

      if (data) {
        const formatted = data.map(p => ({
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
        }));

        setHistory(formatted);
        setProjects(formatted);
      }
    } catch (e) {
      console.error('[AppContext] loadProjectsFromDB exception:', e);
    }
  }

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
    setTheme(t => (t === 'dark' ? 'light' : 'dark'));
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

  async function signOut() {
    try {
      await supabase.auth.signOut({ scope: 'local' });
    } catch (e) {
      console.error('[AppContext] signOut error:', e);
    }
    // Manually purge every sb-* key so a background token refresh
    // cannot silently re-authenticate the user before the reload.
    Object.keys(localStorage).forEach(key => {
      if (key.startsWith('sb-')) localStorage.removeItem(key);
    });
    // Hard reload guarantees clean React state and a fresh getSession() call
    // that will find no session and land on the Auth page.
    window.location.reload();
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
    setProjects(prev => prev.filter(p => p.id !== id));
    setActiveProjectState(prev => (prev?.id === id ? null : prev));
    // Fire-and-forget Supabase delete
    if (authUser) {
      supabase.from('projects').delete().eq('id', id).eq('user_id', authUser.id)
        .then(({ error }) => { if (error) console.error('[AppContext] deleteProject:', error); });
    }
  }, [authUser]);

  const pinProject = useCallback((id) => {
    setProjects(prev =>
      prev.map(p => p.id === id ? { ...p, pinned: !p.pinned } : p)
    );
  }, []);

  const renameProject = useCallback((id, title) => {
    setProjects(prev =>
      prev.map(p => p.id === id ? { ...p, title } : p)
    );
    setActiveProjectState(prev => prev?.id === id ? { ...prev, title } : prev);
  }, []);

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
    setActiveChat(prev => (prev === id ? null : prev));
    // Fire-and-forget Supabase delete
    if (authUser) {
      supabase.from('projects').delete().eq('id', id).eq('user_id', authUser.id)
        .then(({ error }) => { if (error) console.error('[AppContext] deleteHistory:', error); });
    }
  }, [authUser]);

  const pinHistory = useCallback((id) => {
    setHistory(prev =>
      prev.map(h => h.id === id ? { ...h, pinned: !h.pinned } : h)
    );
  }, []);

  const renameHistory = useCallback((id, title) => {
    setHistory(prev =>
      prev.map(h => h.id === id ? { ...h, title } : h)
    );
  }, []);

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
    toggleTheme,

    // User
    user,
    updateUser,

    // Auth
    authUser,
    authLoading,
    signOut,

    // Workspace
    workspace,
    setWorkspace,
    workspaceLoading,

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
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export default AppContext;
