// Pure persistence and normalization helpers used by AppContext. Keeping
// these outside the provider makes the stateful module easier to audit and
// lets future tests exercise cache behavior without mounting the whole app.

const HISTORY_CACHE_MAX = 60
const HISTORY_CACHE_KEY = (workspaceId) => `db-history-cache:${workspaceId || 'none'}`

export function upsertByKey(list, item, key = 'id') {
  const index = list.findIndex(entry => entry[key] === item[key])
  if (index === -1) return [item, ...list]
  const updated = [...list]
  updated[index] = { ...updated[index], ...item }
  return updated
}

export function loadHistoryCache() {
  try {
    const workspaceRaw = localStorage.getItem('db-workspace')
    const workspace = workspaceRaw ? JSON.parse(workspaceRaw) : null
    if (!workspace?.id) return []
    const raw = localStorage.getItem(HISTORY_CACHE_KEY(workspace.id))
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveHistoryCache(workspaceId, list) {
  if (!workspaceId || !Array.isArray(list)) return
  try {
    const slim = list.slice(0, HISTORY_CACHE_MAX).map(project => ({
      id: project.id,
      title: project.title,
      section: project.section,
      source: project.source,
      ts: project.ts,
      pinned: project.pinned,
      isShared: project.isShared,
      status: project.status,
      currentUserRole: project.currentUserRole,
      branding: project.branding,
    }))
    localStorage.setItem(HISTORY_CACHE_KEY(workspaceId), JSON.stringify(slim))
  } catch {
    // Cache writes are best-effort and must not interrupt app state.
  }
}

export function generateShareId() {
  return Math.random().toString(36).slice(2, 10)
}

export function formatProjectRow(project, extra = {}) {
  return {
    id: project.id,
    workspace_id: project.workspace_id || null,
    title: project.title,
    section: project.section,
    ts: new Date(project.updated_at).getTime(),
    pinned: project.pinned || false,
    data: {
      brief: project.brief_text,
      projectName: project.title,
      scoring: project.scoring,
      result: project.result,
    },
    teamMembers: project.team_members || [],
    kanban: project.kanban,
    kanbanColumns: project.kanban_columns || null,
    approvalStatus: project.approval_status || {},
    comments: project.comments || {},
    locked: project.locked || false,
    shareId: project.share_id,
    ...extra,
  }
}
