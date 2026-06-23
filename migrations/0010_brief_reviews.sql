-- ───────────────────────────────────────────────────────────────────
-- Brief reviews — client-facing approval flow for translated briefs.
--
-- A designer creates a brief_review row when they want to send a
-- brief to their client for sign-off. The row carries a long random
-- share_token used in the public /review/:token URL. The client
-- opens that URL with no auth, reads the read-only brief, leaves
-- optional comments per section, and submits an approve / request-
-- changes decision.
--
-- Apply via Supabase Dashboard → SQL editor. Idempotent (every
-- create uses IF NOT EXISTS).
-- ───────────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── brief_reviews ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.brief_reviews (
  id                    uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id            uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  intake_submission_id  uuid REFERENCES public.intake_submissions(id) ON DELETE CASCADE,
  user_id               uuid NOT NULL REFERENCES auth.users(id),
  share_token           text UNIQUE NOT NULL,
  client_email          text NOT NULL,
  client_name           text,
  designer_message      text,
  status                text NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending', 'approved', 'changes_requested')),
  approved_at           timestamptz,
  decision_note         text,
  opened_at             timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_brief_reviews_token   ON public.brief_reviews(share_token);
CREATE INDEX IF NOT EXISTS idx_brief_reviews_project ON public.brief_reviews(project_id);
CREATE INDEX IF NOT EXISTS idx_brief_reviews_user    ON public.brief_reviews(user_id);

-- ── brief_review_comments ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.brief_review_comments (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  review_id   uuid NOT NULL REFERENCES public.brief_reviews(id) ON DELETE CASCADE,
  section_id  text NOT NULL,
  item_key    text,
  body        text NOT NULL,
  status      text NOT NULL DEFAULT 'open'
                CHECK (status IN ('open', 'resolved')),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_brief_review_comments_review ON public.brief_review_comments(review_id);

-- ── updated_at trigger on brief_reviews ────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS brief_reviews_updated_at ON public.brief_reviews;
CREATE TRIGGER brief_reviews_updated_at
  BEFORE UPDATE ON public.brief_reviews
  FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

-- ── RLS ────────────────────────────────────────────────────────────
-- All access via the share_token goes through the service-role API
-- (server.js), so RLS only needs to gate designer-side reads + writes.
ALTER TABLE public.brief_reviews         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brief_review_comments ENABLE ROW LEVEL SECURITY;

-- Designers can do anything with their own reviews.
DROP POLICY IF EXISTS brief_reviews_owner_all ON public.brief_reviews;
CREATE POLICY brief_reviews_owner_all
  ON public.brief_reviews
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Designers can read comments on their own reviews.
DROP POLICY IF EXISTS brief_review_comments_owner_select ON public.brief_review_comments;
CREATE POLICY brief_review_comments_owner_select
  ON public.brief_review_comments
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.brief_reviews r
      WHERE r.id = brief_review_comments.review_id
        AND r.user_id = auth.uid()
    )
  );

-- Designers can update comment status (mark resolved) on their reviews.
DROP POLICY IF EXISTS brief_review_comments_owner_update ON public.brief_review_comments;
CREATE POLICY brief_review_comments_owner_update
  ON public.brief_review_comments
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.brief_reviews r
      WHERE r.id = brief_review_comments.review_id
        AND r.user_id = auth.uid()
    )
  );
