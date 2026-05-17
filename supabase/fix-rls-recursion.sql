-- ─────────────────────────────────────────────────────────────────────────────
-- Fix #1: RLS recursion between projects and team_members
--
-- Symptom:  GET /rest/v1/projects?...&order=updated_at.desc returns 500
-- Cause:    projects.SELECT policy reads team_members, team_members.SELECT
--           policy reads projects → Postgres infinite-recursion error.
-- Fix:      Use a SECURITY DEFINER helper that checks project ownership
--           WITHOUT going through RLS, so team_members policy no longer
--           recurses back into projects.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION is_project_owner(p_project_id text, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM projects
    WHERE id = p_project_id AND user_id = p_user_id
  );
$$;

-- Replace the recursive team_members policies
DROP POLICY IF EXISTS "Project members can view team"     ON team_members;
DROP POLICY IF EXISTS "Project owners can manage team"    ON team_members;
DROP POLICY IF EXISTS "Members can update own record"     ON team_members;

CREATE POLICY "team_members_select"
  ON team_members FOR SELECT
  USING (
    user_id = auth.uid()
    OR is_project_owner(project_id, auth.uid())
  );

CREATE POLICY "team_members_insert"
  ON team_members FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    OR is_project_owner(project_id, auth.uid())
  );

CREATE POLICY "team_members_update"
  ON team_members FOR UPDATE
  USING (
    user_id = auth.uid()
    OR is_project_owner(project_id, auth.uid())
  );

CREATE POLICY "team_members_delete"
  ON team_members FOR DELETE
  USING (
    user_id = auth.uid()
    OR is_project_owner(project_id, auth.uid())
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- Fix #2: Ensure intake_submissions.status (and friends) exist
--
-- Symptom:  GET /rest/v1/intake_forms?...&order=created_at.desc returns 400
-- Cause:    embedded select on intake_submissions references columns that
--           do not yet exist on the table.
-- Fix:      Idempotently add the columns this app uses.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE intake_submissions
  ADD COLUMN IF NOT EXISTS status         text DEFAULT 'pending';
ALTER TABLE intake_submissions
  ADD COLUMN IF NOT EXISTS translated_result jsonb;
ALTER TABLE intake_submissions
  ADD COLUMN IF NOT EXISTS scoring        jsonb;
ALTER TABLE intake_submissions
  ADD COLUMN IF NOT EXISTS completed_at   timestamptz;

ALTER TABLE intake_forms
  ADD COLUMN IF NOT EXISTS status         text DEFAULT 'sent';
ALTER TABLE intake_forms
  ADD COLUMN IF NOT EXISTS client_name    text;
ALTER TABLE intake_forms
  ADD COLUMN IF NOT EXISTS client_email   text;
ALTER TABLE intake_forms
  ADD COLUMN IF NOT EXISTS completed_at   timestamptz;
