-- RLS policies for authenticated designers on intake_forms
-- Run this in the Supabase SQL editor

-- Allow designers to create their own intake forms
CREATE POLICY "designers can insert intake forms"
  ON intake_forms
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Allow designers to read their own intake forms
CREATE POLICY "designers can read their own intake forms"
  ON intake_forms
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Allow designers to update their own intake forms
CREATE POLICY "designers can update their own intake forms"
  ON intake_forms
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Allow designers to read submissions for their own forms
CREATE POLICY "designers can read their intake submissions"
  ON intake_submissions
  FOR SELECT
  TO authenticated
  USING (
    intake_form_id IN (
      SELECT id FROM intake_forms WHERE user_id = auth.uid()
    )
  );
