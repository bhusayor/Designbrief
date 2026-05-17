-- ── WORKSPACES ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS workspaces (
  id             uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name           text NOT NULL,
  slug           text UNIQUE,
  owner_id       uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  plan           text DEFAULT 'free' CHECK (plan IN ('free', 'pro', 'business')),
  credits_used_today  integer DEFAULT 0,
  credits_reset_at    timestamptz,
  created_at     timestamptz DEFAULT now(),
  updated_at     timestamptz DEFAULT now()
);

-- ── WORKSPACE MEMBERS ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS workspace_members (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id  uuid REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id       uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  role          text DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
  created_at    timestamptz DEFAULT now(),
  UNIQUE(workspace_id, user_id)
);

-- ── INDEXES ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS workspaces_owner_id_idx     ON workspaces(owner_id);
CREATE INDEX IF NOT EXISTS workspace_members_user_id_idx ON workspace_members(user_id);

-- ── ROW LEVEL SECURITY ────────────────────────────────────────────────────────
ALTER TABLE workspaces        ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_members ENABLE ROW LEVEL SECURITY;

-- Drop policies if they exist so this script is safe to re-run
DROP POLICY IF EXISTS "workspace_select"        ON workspaces;
DROP POLICY IF EXISTS "workspace_insert"        ON workspaces;
DROP POLICY IF EXISTS "workspace_update"        ON workspaces;
DROP POLICY IF EXISTS "workspace_delete"        ON workspaces;
DROP POLICY IF EXISTS "workspace_members_select" ON workspace_members;
DROP POLICY IF EXISTS "workspace_members_insert" ON workspace_members;
DROP POLICY IF EXISTS "workspace_members_delete" ON workspace_members;

-- Owners and members can SELECT their workspace
CREATE POLICY "workspace_select"
  ON workspaces FOR SELECT
  USING (
    owner_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM workspace_members
      WHERE workspace_id = workspaces.id
        AND user_id = auth.uid()
    )
  );

-- Only the API (service-role key) inserts workspaces; this policy is a safety
-- net that also allows a user to insert their own workspace directly.
CREATE POLICY "workspace_insert"
  ON workspaces FOR INSERT
  WITH CHECK (owner_id = auth.uid());

-- Only the owner can update
CREATE POLICY "workspace_update"
  ON workspaces FOR UPDATE
  USING (owner_id = auth.uid());

-- Only the owner can delete
CREATE POLICY "workspace_delete"
  ON workspaces FOR DELETE
  USING (owner_id = auth.uid());

-- Members can read the workspace_members rows they belong to
CREATE POLICY "workspace_members_select"
  ON workspace_members FOR SELECT
  USING (
    user_id = auth.uid()
    OR workspace_id IN (
      SELECT id FROM workspaces WHERE owner_id = auth.uid()
    )
  );

-- The API (service-role) inserts members; this allows users to add themselves
-- (needed for invite acceptance flows that use the client key)
CREATE POLICY "workspace_members_insert"
  ON workspace_members FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Members can remove themselves; owners can remove anyone in their workspace
CREATE POLICY "workspace_members_delete"
  ON workspace_members FOR DELETE
  USING (
    user_id = auth.uid()
    OR workspace_id IN (
      SELECT id FROM workspaces WHERE owner_id = auth.uid()
    )
  );
