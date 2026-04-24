-- Add status tracking to intake_submissions
ALTER TABLE intake_submissions
  ADD COLUMN IF NOT EXISTS status
  TEXT DEFAULT 'pending';

ALTER TABLE intake_submissions
  ADD COLUMN IF NOT EXISTS translated_result
  JSONB;

ALTER TABLE intake_submissions
  ADD COLUMN IF NOT EXISTS scoring
  JSONB;

ALTER TABLE intake_submissions
  ADD COLUMN IF NOT EXISTS completed_at
  TIMESTAMPTZ;

-- Add status to intake_forms
ALTER TABLE intake_forms
  ADD COLUMN IF NOT EXISTS status
  TEXT DEFAULT 'sent';

ALTER TABLE intake_forms
  ADD COLUMN IF NOT EXISTS client_name
  TEXT;

ALTER TABLE intake_forms
  ADD COLUMN IF NOT EXISTS client_email
  TEXT;

ALTER TABLE intake_forms
  ADD COLUMN IF NOT EXISTS completed_at
  TIMESTAMPTZ;
