-- ────────────────────────────────────────────────────────────────────
-- intake-pipeline.sql — Phase 4 of the Client Intake Form rebuild.
--
-- Adds the columns the 8-step automated processing pipeline writes
-- to. Status semantics on intake_submissions become more granular
-- so the designer review screen can show exactly which step is
-- running.
--
-- Status values used by the pipeline (in order):
--   pending                    — queued, no work started
--   enriching                  — 4b running
--   translating                — 4d running (5 parallel section
--                                 calls + analysis depending on
--                                 progress)
--   extracting_design_system   — 4e running
--   building_kanban            — 4f deterministic step
--   notifying                  — 4h sending emails
--   complete                   — pipeline finished successfully
--   failed                     — failure_step + failure_message
--                                 populated so the designer can
--                                 retry from that step
--
-- Safe to run more than once — every column add uses IF NOT EXISTS.
-- ────────────────────────────────────────────────────────────────────

alter table intake_submissions
  -- Brief assembly intermediate output. Stored so the review screen
  -- can show "what the AI saw before translation" + so a retry of
  -- step 4d can skip ahead without re-doing 4b/4c.
  add column if not exists enriched_answers jsonb,
  add column if not exists assembled_brief  text,

  -- Phase 5 approval timestamp. Null = unlocked (designer can still
  -- edit + the AI builder is not yet authorised for this brief's
  -- kanban cards). Non-null = locked, brief is the source of truth.
  -- Unlock writes it back to null after a confirm modal.
  add column if not exists approved_at timestamptz,

  -- All flags surfaced by the pipeline (red flags + assumptions +
  -- questions), captured here in one place so the Phase 5 review
  -- screen can render them without re-deriving from the translation.
  add column if not exists flags jsonb default '[]'::jsonb,

  -- Failure tracking. processing_status (legacy field) is kept for
  -- back-compat. failure_step + failure_message let the designer
  -- retry from the right point.
  add column if not exists failure_step    text,
  add column if not exists failure_message text,

  -- updated_at touch column + trigger so the review screen can poll
  -- and see real-time progress as the pipeline advances.
  add column if not exists updated_at timestamptz default now();

-- ── updated_at touch trigger ───────────────────────────────────────
create or replace function intake_submissions_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists intake_submissions_touch_trigger on intake_submissions;
create trigger intake_submissions_touch_trigger
  before update on intake_submissions
  for each row execute function intake_submissions_touch();

-- ── trigger_pipeline RPC ───────────────────────────────────────────
-- Kicks the pipeline by flipping status from 'pending' to
-- 'enriching'. The actual processing runs on Render via the
-- /api/process-intake endpoint; this RPC exists so the public
-- client form can fire-and-forget the trigger without leaking
-- the server endpoint into the public RLS surface.
--
-- (The endpoint is also callable directly from the designer's
-- review screen if they hit Retry; this RPC isn't required for
-- that path.)
create or replace function mark_intake_processing(p_submission_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update intake_submissions
     set status = 'enriching'
   where id = p_submission_id
     and status in ('pending', 'failed');
end;
$$;

revoke all on function mark_intake_processing(text) from public;
grant execute on function mark_intake_processing(text) to anon, authenticated;
