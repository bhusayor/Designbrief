-- ────────────────────────────────────────────────────────────────────
-- intake-public-tracking.sql — Phase 3 of the Client Intake Form
-- rebuild.
--
-- Two pieces:
--   1. increment_intake_open(form_id) RPC — bumps open_count on
--      intake_forms by 1. Runs with SECURITY DEFINER so the
--      anonymous client form viewer can call it without needing
--      an UPDATE policy on the table itself.
--   2. submit_intake_anon(...) RPC — atomically inserts the
--      submission row + bumps submission_count on the form row.
--      Same SECURITY DEFINER pattern so the public form can submit
--      without an INSERT policy that would otherwise let any anon
--      client write arbitrary rows.
--
-- Safe to run more than once — both use CREATE OR REPLACE.
-- ────────────────────────────────────────────────────────────────────

-- ── 1. Open-count incrementer ──────────────────────────────────────
create or replace function increment_intake_open(form_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update intake_forms
     set open_count = coalesce(open_count, 0) + 1
   where id = form_id;
end;
$$;

revoke all on function increment_intake_open(text) from public;
grant execute on function increment_intake_open(text) to anon, authenticated;

-- ── 2. Anonymous submission RPC ────────────────────────────────────
-- Inserts an intake_submissions row and bumps submission_count on
-- the corresponding intake_forms row in one transaction. Returns the
-- new submission id so the client can navigate to a thank-you screen
-- or poll for processing status later.
--
-- This is the only write path the public client form needs. The
-- existing service-role api/submit-intake.js still works for the
-- AI-translation pipeline; this RPC is the anon-friendly equivalent
-- of the row insert that endpoint does.
create or replace function submit_intake_anon(
  p_form_id     text,
  p_answers     jsonb,
  p_client_email text default null,
  p_mood_urls   text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id text;
begin
  -- Refuse if the form is expired or no longer active.
  if exists (
    select 1 from intake_forms
     where id = p_form_id
       and (
         (expires_at is not null and expires_at < now())
         or status = 'expired'
       )
  ) then
    raise exception 'form_expired' using errcode = 'P0001';
  end if;

  new_id := 'sub_' || substr(md5(random()::text || clock_timestamp()::text), 1, 14);

  insert into intake_submissions (
    id, intake_form_id, answers, client_email, mood_urls, status, submitted_at
  ) values (
    new_id, p_form_id, coalesce(p_answers, '{}'::jsonb), p_client_email, p_mood_urls, 'pending', now()
  );

  update intake_forms
     set submission_count = coalesce(submission_count, 0) + 1
   where id = p_form_id;

  return new_id;
end;
$$;

revoke all on function submit_intake_anon(text, jsonb, text, text) from public;
grant execute on function submit_intake_anon(text, jsonb, text, text) to anon, authenticated;
