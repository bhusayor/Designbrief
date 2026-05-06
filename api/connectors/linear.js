import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
)

const LINEAR_API = 'https://api.linear.app/graphql'

async function linearQuery(token, query, variables = {}) {
  const res = await fetch(LINEAR_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': token,
    },
    body: JSON.stringify({ query, variables }),
  })
  if (!res.ok) throw new Error('Linear API error: ' + res.status)
  const data = await res.json()
  if (data.errors) throw new Error(data.errors[0]?.message || 'Linear GraphQL error')
  return data.data
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).end()

  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) return res.status(401).json({ error: 'Unauthorised' })

  const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
  if (authErr || !user) return res.status(401).json({ error: 'Invalid session' })

  const { linearToken, workspaceId, action, teamId, tasks, projectName } = req.body

  if (!workspaceId || !action)
    return res.status(400).json({ error: 'workspaceId and action required' })

  try {
    if (action === 'disconnect') {
      await supabase.from('connectors').upsert({
        workspace_id: workspaceId,
        user_id: user.id,
        type: 'linear',
        status: 'disconnected',
        config: {},
        extracted_data: {},
        updated_at: new Date().toISOString(),
      }, { onConflict: 'workspace_id,type' })
      return res.json({ success: true })
    }

    if (!linearToken)
      return res.status(400).json({ error: 'linearToken required' })

    if (action === 'connect' || action === 'sync') {
      const data = await linearQuery(
        linearToken,
        `query {
          teams {
            nodes {
              id name key
              states {
                nodes { id name type color }
              }
            }
          }
          viewer { id name email }
        }`
      )

      const extractedData = {
        viewer: data.viewer,
        teams: data.teams?.nodes?.map(t => ({
          id: t.id,
          name: t.name,
          key: t.key,
          states: t.states?.nodes || [],
        })) || [],
        syncedAt: new Date().toISOString(),
      }

      // linearToken is NEVER stored in Supabase
      await supabase.from('connectors').upsert({
        workspace_id: workspaceId,
        user_id: user.id,
        type: 'linear',
        status: 'connected',
        config: {
          viewerName: data.viewer?.name,
          viewerEmail: data.viewer?.email,
        },
        extracted_data: extractedData,
        last_synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'workspace_id,type' })

      return res.json({ success: true, data: extractedData })
    }

    if (action === 'push_tasks') {
      if (!teamId || !tasks?.length)
        return res.status(400).json({ error: 'teamId and tasks required' })

      const teamData = await linearQuery(
        linearToken,
        `query($teamId: String!) {
          team(id: $teamId) {
            states {
              nodes { id name type }
            }
          }
        }`,
        { teamId }
      )

      const states = teamData.team?.states?.nodes || []

      const stateMap = {
        'todo': states.find(s =>
          s.type === 'unstarted' ||
          s.name.toLowerCase().includes('todo') ||
          s.name.toLowerCase().includes('backlog')
        )?.id,
        'inprogress': states.find(s =>
          s.type === 'started' ||
          s.name.toLowerCase().includes('progress') ||
          s.name.toLowerCase().includes('doing')
        )?.id,
        'review': states.find(s =>
          s.name.toLowerCase().includes('review') ||
          s.name.toLowerCase().includes('testing')
        )?.id,
        'done': states.find(s =>
          s.type === 'completed' ||
          s.name.toLowerCase().includes('done') ||
          s.name.toLowerCase().includes('complete')
        )?.id,
      }

      // Linear priority: 0=none, 1=urgent, 2=high, 3=medium, 4=low
      const priorityMap = { 'HIGH': 2, 'MEDIUM': 3, 'LOW': 4 }

      const results = []
      for (const task of tasks) {
        try {
          const stateId = stateMap[task.column] || stateMap['todo']
          const data = await linearQuery(
            linearToken,
            `mutation CreateIssue($input: IssueCreateInput!) {
              issueCreate(input: $input) {
                success
                issue { id identifier url title }
              }
            }`,
            {
              input: {
                teamId,
                title: task.title,
                description: task.description || '',
                priority: priorityMap[task.priority?.toUpperCase()] || 3,
                ...(stateId && { stateId }),
              },
            }
          )
          if (data.issueCreate?.success) {
            results.push({ taskId: task.id, issue: data.issueCreate.issue, success: true })
          }
        } catch (taskErr) {
          results.push({ taskId: task.id, error: taskErr.message, success: false })
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
    console.error('[linear connector]', e)
    return res.status(500).json({ error: e.message })
  }
}
