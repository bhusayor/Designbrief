import { createClient } from '@supabase/supabase-js'

/*
 * Run in Supabase SQL Editor before deploying:
 *
 * CREATE TABLE IF NOT EXISTS workspaces (
 *   id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
 *   name text NOT NULL,
 *   slug text UNIQUE,
 *   owner_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
 *   plan text DEFAULT 'free' CHECK (plan IN ('free','pro','business')),
 *   credits_used_today integer DEFAULT 0,
 *   credits_reset_at timestamptz,
 *   created_at timestamptz DEFAULT now(),
 *   updated_at timestamptz DEFAULT now()
 * );
 *
 * CREATE TABLE IF NOT EXISTS workspace_members (
 *   id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
 *   workspace_id uuid REFERENCES workspaces(id) ON DELETE CASCADE,
 *   user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
 *   role text DEFAULT 'member' CHECK (role IN ('owner','admin','member')),
 *   created_at timestamptz DEFAULT now(),
 *   UNIQUE(workspace_id, user_id)
 * );
 *
 * ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
 * ALTER TABLE workspace_members ENABLE ROW LEVEL SECURITY;
 *
 * CREATE POLICY "Members can read their workspaces"
 *   ON workspaces FOR SELECT
 *   USING (
 *     owner_id = auth.uid() OR
 *     EXISTS (
 *       SELECT 1 FROM workspace_members
 *       WHERE workspace_id = workspaces.id
 *       AND user_id = auth.uid()
 *     )
 *   );
 *
 * CREATE POLICY "Members can read workspace_members"
 *   ON workspace_members FOR SELECT
 *   USING (user_id = auth.uid());
 */

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
)

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
}

export default async function handler(req, res) {
  setCors(res)

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).end()

  const { userId, workspaceName, plan } = req.body

  if (!userId || !workspaceName) {
    return res.status(400).json({ error: 'userId and workspaceName required' })
  }

  try {
    const { data: workspace, error } = await supabase
      .from('workspaces')
      .insert({
        name: workspaceName.trim(),
        owner_id: userId,
        plan: plan || 'free',
        credits_used_today: 0,
        credits_reset_at: new Date(
          new Date().setUTCHours(24, 0, 0, 0)
        ).toISOString(),
      })
      .select('*')
      .single()

    if (error) throw error

    await supabase
      .from('workspace_members')
      .insert({
        workspace_id: workspace.id,
        user_id: userId,
        role: 'owner',
      })

    return res.json({ workspace })
  } catch (e) {
    console.error('[create-workspace]', e)
    return res.status(500).json({ error: e.message })
  }
}
