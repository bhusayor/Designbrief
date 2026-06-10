-- ────────────────────────────────────────────────────────────────────
-- intake-followups.sql — Phase 6 of the Client Intake Form rebuild.
--
-- The designer's review screen has a flags panel that surfaces
-- blocking questions. Each question can be sent back to the client
-- as a single-question email; the client replies via a public
-- /followup/:token page (no login). Their answer lands here, the
-- designer is notified, and the answer can be incorporated into
-- the brief.
--
-- Safe to run more than once — table create uses IF NOT EXISTS,
-- RPCs use CREATE OR REPLACE.
-- ────────────────────────────────────────────────────────────────────

create extension if not exists "pgcrypto";

create table if not exists intake_followups (
  -- Token shared in the URL. UUID-style so it's unguessable per the
  -- same share-link security model the public form already uses.
  token            text primary key default substr(replace(gen_random_uuid()::text, '-', ''), 1, 24),

  -- Which submission this follow-up belongs to. Cascade-deletes
  -- when the submission goes (rare but cleans up correctly).
  submission_id    text not null references intake_submissions(id) on delete cascade,

  -- The form id is denormalised here too so the public response
  -- page can show the right branding without joining through the
  -- submission. Cascade-deletes from the form side.
  form_id          text not null references intake_forms(id) on delete cascade,

  -- The question + the optional contextual paragraph the designer
  -- wrote when sending. Stored separately so the public page can
  -- render the question prominently and the paragraph below it.
  question_text    text not null,
  context_text     text,

  -- Where the client should reply to. Pulled from
  -- intake_submissions.client_email when sending; persisted here
  -- so a later change on the submission doesn't break the routing.
  recipient_email  text,

  -- Lifecycle.
  status           text not null default 'sent'  -- sent | answered | expired
                   check (status in ('sent', 'answered', 'expired')),
  sent_at          timestamptz default now(),
  answered_at      timestamptz,
  answer_text      text,

  -- Soft expiry — when the parent submission's approved_at is
  -- non-null, follow-ups should refuse new answers and the public
  -- page should show "the brief is locked, contact your designer".
  -- We don't store an expires_at; the submission row is the source
  -- of truth.

  created_at       timestamptz default now()
);

create index if not exists intake_followups_submission_idx on intake_followups(submission_id);
create index if not exists intake_followups_status_idx on intake_followups(status);

alter table intake_followups enable row level security;

-- Designer ownership: only the user who owns the parent form can
-- read or modify their follow-ups. Public response page uses the
-- RPC below which runs SECURITY DEFINER so it bypasses RLS.
drop policy if exists "Designer reads own follow-ups" on intake_followups;
create policy "Designer reads own follow-ups"
  on intake_followups for select
  using (
    exists (
      select 1 from intake_forms f
       where f.id = intake_followups.form_id
         and f.user_id = auth.uid()
    )
  );

drop policy if exists "Designer writes own follow-ups" on intake_followups;
create policy "Designer writes own follow-ups"
  on intake_followups for insert
  with check (
    exists (
      select 1 from intake_forms f
       where f.id = form_id
         and f.user_id = auth.uid()
    )
  );

drop policy if exists "Designer updates own follow-ups" on intake_followups;
create policy "Designer updates own follow-ups"
  on intake_followups for update
  using (
    exists (
      select 1 from intake_forms f
       where f.id = intake_followups.form_id
         and f.user_id = auth.uid()
    )
  );

-- ── Public-read RPC by token ───────────────────────────────────────
-- The /followup/:token public page calls this to load the question.
-- Returns a small projection so we don't leak designer email etc.
-- to the public.
create or replace function load_followup_public(p_token text)
returns table (
  token          text,
  question_text  text,
  context_text   text,
  status         text,
  answered_at    timestamptz,
  brief_locked   boolean,
  form_id        text,
  branding       jsonb
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select
    f.token,
    f.question_text,
    f.context_text,
    f.status,
    f.answered_at,
    (s.approved_at is not null) as brief_locked,
    f.form_id,
    form.branding
  from intake_followups f
  join intake_submissions s on s.id = f.submission_id
  join intake_forms form on form.id = f.form_id
  where f.token = p_token;
end;
$$;

revoke all on function load_followup_public(text) from public;
grant execute on function load_followup_public(text) to anon, authenticated;

-- ── Public-submit RPC ──────────────────────────────────────────────
-- Writes the answer + flips status to 'answered'. Refuses if the
-- parent brief is already approved (locked) — the public page
-- catches the error and shows the "brief is locked" message
-- mandated by the spec's error handling block.
create or replace function submit_followup_anon(p_token text, p_answer text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_submission_id text;
  v_approved      timestamptz;
begin
  select submission_id into v_submission_id
    from intake_followups
   where token = p_token
     and status <> 'answered';

  if v_submission_id is null then
    raise exception 'followup_not_found_or_already_answered' using errcode = 'P0001';
  end if;

  select approved_at into v_approved
    from intake_submissions
   where id = v_submission_id;

  if v_approved is not null then
    raise exception 'brief_locked' using errcode = 'P0001';
  end if;

  update intake_followups
     set status      = 'answered',
         answer_text = p_answer,
         answered_at = now()
   where token = p_token;
end;
$$;

revoke all on function submit_followup_anon(text, text) from public;
grant execute on function submit_followup_anon(text, text) to anon, authenticated;
