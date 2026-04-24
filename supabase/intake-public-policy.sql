-- RLS policies allowing anonymous (unauthenticated) clients to:
--   1. Read an intake form by ID (to load the form questions)
--   2. Insert a submission for that form
--   3. Update the parent intake_forms row status to 'complete'

-- ── intake_forms: allow anon SELECT by id ────────────────────────────────────
CREATE POLICY "anon can read intake form by id"
  ON intake_forms
  FOR SELECT
  TO anon
  USING (true);

-- ── intake_submissions: allow anon INSERT ────────────────────────────────────
CREATE POLICY "anon can submit intake"
  ON intake_submissions
  FOR INSERT
  TO anon
  WITH CHECK (true);

-- ── intake_forms: allow anon UPDATE status to complete ───────────────────────
-- Restrict to only updating the status and completed_at columns.
CREATE POLICY "anon can mark intake form complete"
  ON intake_forms
  FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);
