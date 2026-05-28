-- ─────────────────────────────────────────────────────────────────────
-- FREE PLAN LIMITS — profiles columns + new-user trigger
-- ─────────────────────────────────────────────────────────────────────
-- Safe to run multiple times. Adds the columns the client expects on
-- the profiles row (plan, credits, credits_used, plan_started_at) and
-- ensures every new auth.users row is mirrored into profiles with the
-- free-plan defaults (plan='free', credits=50, credits_used=0).
-- ─────────────────────────────────────────────────────────────────────

alter table profiles
  add column if not exists plan text default 'free',
  add column if not exists credits integer default 50,
  add column if not exists credits_used integer default 0,
  add column if not exists plan_started_at timestamptz default now();

-- Trigger: when a new auth user signs up, insert a matching profiles
-- row with the free-plan defaults. Idempotent — existing rows are
-- left alone (no overwrite of an already-set plan/credits).
create or replace function handle_new_user_plan()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into profiles (id, plan, credits, credits_used)
  values (new.id, 'free', 50, 0)
  on conflict (id) do update
    set plan = coalesce(profiles.plan, 'free'),
        credits = coalesce(profiles.credits, 50),
        credits_used = coalesce(profiles.credits_used, 0);
  return new;
end;
$$;

-- Re-create the trigger so it always points at the latest function body.
drop trigger if exists on_auth_user_created_plan on auth.users;
create trigger on_auth_user_created_plan
  after insert on auth.users
  for each row execute function handle_new_user_plan();

-- Backfill: anyone already in profiles without these fields gets the
-- defaults so existing accounts don't break the new gates.
update profiles
   set plan = coalesce(plan, 'free'),
       credits = coalesce(credits, 50),
       credits_used = coalesce(credits_used, 0)
 where plan is null or credits is null or credits_used is null;
