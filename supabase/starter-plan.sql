-- ─────────────────────────────────────────────────────────────────────
-- STARTER PLAN — monthly credits refresh
-- ─────────────────────────────────────────────────────────────────────
-- Safe to run multiple times. Adds the credits_reset_at column +
-- check_and_reset_credits(user_id) RPC that resets monthly. The
-- client calls this RPC on every auth event; the function is a no-op
-- for Free plans and idempotent (only resets after 30 days).
-- ─────────────────────────────────────────────────────────────────────

alter table profiles
  add column if not exists credits_reset_at timestamptz default now(),
  add column if not exists monthly_credits  integer     default 50;

create or replace function check_and_reset_credits(user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  profile_row profiles%ROWTYPE;
  plan_credits integer;
begin
  select * into profile_row from profiles where id = user_id;
  if not found then
    return;
  end if;

  -- Plan caps. Add new tiers here when more launch.
  if profile_row.plan = 'starter' then
    plan_credits := 300;
  elsif profile_row.plan = 'pro' then
    plan_credits := 1000;
  else
    plan_credits := 0;  -- Free plan never refreshes
  end if;

  -- Only reset paid plans whose last refresh was ≥30 days ago.
  if profile_row.plan <> 'free'
     and (profile_row.credits_reset_at is null
          or profile_row.credits_reset_at < now() - interval '30 days')
  then
    update profiles
       set credits = plan_credits,
           credits_used = 0,
           credits_reset_at = now()
     where id = user_id;
  end if;
end;
$$;

-- Backfill: every existing profile gets a credits_reset_at if it's null.
update profiles
   set credits_reset_at = coalesce(credits_reset_at, now())
 where credits_reset_at is null;
