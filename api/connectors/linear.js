import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
)

const LINEAR_API = 'https://api.linear.app/graphql'

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
}

async function linearQuery(token, query, variables = {}) {
  const res = await fetch(LINEAR_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': token },
    body: JSON.stringify({ query, variables }),
  })
  if (!res.ok) throw new Error('Linear API error: ' + res.status)
  const data = await res.json()
  if (data.errors) throw new Error(data.errors[0]?.message || 'Linear error')
  return data.data
}

export default async function handler(req, res) {
  setCors(res)
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).end()

  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) return res.status(401).json({ error: 'Unauthorised' })

  const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
  if (authErr || !user) return res.status(401).json({ error: 'Invalid session' })

  const { action, linearToken, projectId, workspaceId, teamId, tasks } = req.body
  if (!workspaceId) return res.status(400).json({ error: 'workspaceId required' })

  try {
    if (action === 'install') {
      if (!linearToken) return res.status(400).json({ error: 'linearToken required' })

      const data = await linearQuery(linearToken, `query { viewer { id name email } }`)

      await supabase.from('workspace_tokens').upsert({
        workspace_id: workspaceId,
        user_id: user.id,
        linear_token_hint: linearToken.slice(-4),
        linear_installed: true,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'workspace_id' })

      return res.json({ success: true, installed: true, user: data.viewer?.email || data.viewer?.name })
    }

    if (action === 'uninstall') {
      await supabase.from('workspace_tokens')
        .update({ linear_installed: false, linear_token_hint: null, updated_at: new Date().toISOString() })
        .eq('workspace_id', workspaceId)

      await supabase.from('project_connectors')
        .update({ linear_team_id: null, linear_team_name: null, linear_synced_at: null, updated_at: new Date().toISOString() })
        .eq('workspace_id', workspaceId)

      return res.json({ success: true })
    }

    if (action === 'disconnect') {
      if (!projectId) return res.status(400).json({ error: 'projectId required' })
      await supabase.from('project_connectors').upsert({
        project_id: projectId, workspace_id: workspaceId, user_id: user.id,
        linear_team_id: null, linear_team_name: null,
        linear_synced_at: null, updated_at: new Date().toISOString(),
      }, { onConflict: 'project_id,workspace_id' })
      return res.json({ success: true })
    }

    if (!linearToken) return res.status(400).json({ error: 'linearToken required' })

    if (action === 'get_teams') {
      const data = await linearQuery(linearToken, `query {
        teams { nodes { id name key states { nodes { id name type color } } } }
        viewer { id name email }
      }`)
      const teams = data.teams?.nodes?.map(t => ({
        id: t.id, name: t.name, key: t.key, states: t.states?.nodes || [],
      })) || []

      await supabase.from('workspace_tokens').upsert({
        workspace_id: workspaceId, user_id: user.id,
        linear_token_hint: linearToken.slice(-4), updated_at: new Date().toISOString(),
      }, { onConflict: 'workspace_id' })

      return res.json({ success: true, data: { viewer: data.viewer, teams } })
    }

    if (action === 'save_team') {
      if (!projectId) return res.status(400).json({ error: 'projectId required' })
      await supabase.from('project_connectors').upsert({
        project_id: projectId, workspace_id: workspaceId, user_id: user.id,
        linear_team_id: teamId, linear_team_name: req.body.teamName || null,
        linear_synced_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      }, { onConflict: 'project_id,workspace_id' })
      return res.json({ success: true })
    }

    if (action === 'push_tasks') {
      if (!projectId) return res.status(400).json({ error: 'projectId required' })
      if (!teamId || !tasks?.length) return res.status(400).json({ error: 'teamId and tasks required' })

      const teamData = await linearQuery(linearToken,
        `query($teamId: String!) { team(id: $teamId) { states { nodes { id name type } } } }`,
        { teamId }
      )
      const states = teamData.team?.states?.nodes || []
      const stateMap = {
        'todo': states.find(s => s.type === 'unstarted' || s.name.toLowerCase().includes('todo'))?.id,
        'inprogress': states.find(s => s.type === 'started' || s.name.toLowerCase().includes('progress'))?.id,
        'review': states.find(s => s.name.toLowerCase().includes('review'))?.id,
        'done': states.find(s => s.type === 'completed' || s.name.toLowerCase().includes('done'))?.id,
      }
      const priorityMap = { HIGH: 2, MEDIUM: 3, LOW: 4 }
      const results = []

      for (const task of tasks) {
        try {
          const stateId = stateMap[task.column?.toLowerCase()] || stateMap['todo']
          const data = await linearQuery(linearToken,
            `mutation CreateIssue($input: IssueCreateInput!) { issueCreate(input: $input) { success issue { id identifier url title } } }`,
            { input: { teamId, title: task.title, description: task.description || '', priority: priorityMap[task.priority?.toUpperCase()] || 3, ...(stateId && { stateId }) } }
          )
          if (data.issueCreate?.success)
            results.push({ taskId: task.id, issue: data.issueCreate.issue, success: true })
        } catch (e) {
          results.push({ taskId: task.id, error: e.message, success: false })
        }
      }

      return res.json({
        success: true,
        pushed: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length,
        results,
      })
    }

    return res.status(400).json({ error: 'Unknown action: ' + action })
  } catch (e) {
    console.error('[connectors/linear]', e)
    return res.status(500).json({ error: e.message })
  }
}
