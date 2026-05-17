-- ─────────────────────────────────────────────────────────────────────────────
-- COMPLETE MIGRATION FOR CROSS-DEVICE / CROSS-USER PROJECT SYNC
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New query).
-- Safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Break the projects ↔ team_members RLS recursion ──────────────────────
-- Without this, every SELECT on projects (or tasks, which reads team_members
-- inside its policy) returns 500. Result: invited team members can't see
-- anything, and cross-device task sync silently fails.

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

DROP POLICY IF EXISTS "Project members can view team"  ON team_members;
DROP POLICY IF EXISTS "Project owners can manage team" ON team_members;
DROP POLICY IF EXISTS "Members can update own record"  ON team_members;
DROP POLICY IF EXISTS "team_members_select"            ON team_members;
DROP POLICY IF EXISTS "team_members_insert"            ON team_members;
DROP POLICY IF EXISTS "team_members_update"            ON team_members;
DROP POLICY IF EXISTS "team_members_delete"            ON team_members;

CREATE POLICY "team_members_select"
  ON team_members FOR SELECT
  USING (user_id = auth.uid() OR is_project_owner(project_id, auth.uid()));

CREATE POLICY "team_members_insert"
  ON team_members FOR INSERT
  WITH CHECK (user_id = auth.uid() OR is_project_owner(project_id, auth.uid()));

CREATE POLICY "team_members_update"
  ON team_members FOR UPDATE
  USING (user_id = auth.uid() OR is_project_owner(project_id, auth.uid()));

CREATE POLICY "team_members_delete"
  ON team_members FOR DELETE
  USING (user_id = auth.uid() OR is_project_owner(project_id, auth.uid()));

-- ── 2. Enable Supabase Realtime on collaboration tables ─────────────────────
-- Without these, postgres_changes subscriptions in TeamCollab never fire,
-- so device B never sees device A's task additions until a manual refresh.

DO $$
BEGIN
  -- tasks
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'tasks'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE tasks;
  END IF;

  -- subtasks
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'subtasks'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE subtasks;
  END IF;

  -- task_comments
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'task_comments'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE task_comments;
  END IF;

  -- task_activity
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'task_activity'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE task_activity;
  END IF;

  -- projects (for team_members jsonb updates etc.)
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'projects'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE projects;
  END IF;
END $$;

-- Ensure REPLICA IDENTITY FULL so DELETE events include the old row
ALTER TABLE tasks         REPLICA IDENTITY FULL;
ALTER TABLE subtasks      REPLICA IDENTITY FULL;
ALTER TABLE task_comments REPLICA IDENTITY FULL;
ALTER TABLE task_activity REPLICA IDENTITY FULL;
ALTER TABLE projects      REPLICA IDENTITY FULL;

-- ── 3. Missing columns referenced by the dashboard query ────────────────────
ALTER TABLE intake_submissions
  ADD COLUMN IF NOT EXISTS status            text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS translated_result jsonb,
  ADD COLUMN IF NOT EXISTS scoring           jsonb,
  ADD COLUMN IF NOT EXISTS completed_at      timestamptz;

ALTER TABLE intake_forms
  ADD COLUMN IF NOT EXISTS status        text DEFAULT 'sent',
  ADD COLUMN IF NOT EXISTS client_name   text,
  ADD COLUMN IF NOT EXISTS client_email  text,
  ADD COLUMN IF NOT EXISTS completed_at  timestamptz;
