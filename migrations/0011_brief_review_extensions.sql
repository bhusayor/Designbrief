-- ───────────────────────────────────────────────────────────────────
-- Brief reviews — extensions for quick-link sharing + per-section
-- approval flow.
--
--  - client_email becomes nullable. The "Copy link" path on the
--    share modal creates a review row without ever asking the
--    designer for an email; the email column gets populated later
--    only if they decide to send the email too.
--
--  - section_decisions is a JSONB map keyed by section_id holding
--    each section's per-section decision:
--      {
--        "understand":  { "status": "approved",          "decided_at": "..." },
--        "interrogate": { "status": "changes_requested", "note": "...", "decided_at": "..." }
--      }
--    Stored on the review row itself (rather than as separate rows
--    in brief_review_comments) so the client review page can fetch
--    everything in one query and the designer's approval banner can
--    render the per-section state at a glance.
--
-- Apply via Supabase Dashboard → SQL editor. Idempotent.
-- ───────────────────────────────────────────────────────────────────

ALTER TABLE public.brief_reviews
  ALTER COLUMN client_email DROP NOT NULL;

ALTER TABLE public.brief_reviews
  ADD COLUMN IF NOT EXISTS section_decisions jsonb NOT NULL DEFAULT '{}'::jsonb;
