-- ────────────────────────────────────────────────────────────────────
-- intake-page-zero.sql — Page 0 (the intro form) on the public
-- client intake.
--
-- Adds two new columns on intake_submissions:
--   client_name    — the human filling out the form
--   business_name  — what we substitute into every personalised
--                    question + the brief + the designer's
--                    notification subject. The most load-bearing
--                    field on Page 0.
-- (client_email already shipped in intake-public-tracking.sql.)
--
-- Updates submit_intake_anon RPC so the public form can pass these
-- two new fields in alongside the answers blob. Old callers that
-- still pass only the existing four args continue to work because
-- the new parameters have safe defaults.
--
-- Safe to run more than once.
-- ────────────────────────────────────────────────────────────────────

alter table intake_submissions
  add column if not exists client_name   text,
  add column if not exists business_name text;

-- Drop the previous signature explicitly so the CREATE OR REPLACE
-- below can ship a new argument list. Postgres can't replace a
-- function with a different signature in one statement.
drop function if exists submit_intake_anon(text, jsonb, text, text);
drop function if exists submit_intake_anon(text, jsonb, text, text, text, text);

create or replace function submit_intake_anon(
  p_form_id        text,
  p_answers        jsonb,
  p_client_email   text default null,
  p_mood_urls      text default null,
  p_client_name    text default null,
  p_business_name  text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id text;
begin
  -- Refuse if the form is expired or no longer active. Same guard
  -- as the previous version of this RPC.
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
    id, intake_form_id, answers,
    client_email, client_name, business_name,
    mood_urls, status, submitted_at
  ) values (
    new_id, p_form_id, coalesce(p_answers, '{}'::jsonb),
    p_client_email, p_client_name, p_business_name,
    p_mood_urls, 'pending', now()
  );

  update intake_forms
     set submission_count = coalesce(submission_count, 0) + 1
   where id = p_form_id;

  return new_id;
end;
$$;

revoke all on function submit_intake_anon(text, jsonb, text, text, text, text) from public;
grant execute on function submit_intake_anon(text, jsonb, text, text, text, text) to anon, authenticated;
