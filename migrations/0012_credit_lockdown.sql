-- ─────────────────────────────────────────────────────────────────────
-- 0012 CREDIT LOCKDOWN
-- ─────────────────────────────────────────────────────────────────────
-- Fixes two exploitable holes + one race:
--
--   1. The "Users can update own profile" RLS policy had no column
--      restrictions, so any logged-in user could run
--      supabase.from('profiles').update({ credits: 99999, plan: 'pro' })
--      from the browser console. A BEFORE UPDATE trigger now rejects
--      client-side changes to the money columns.
--
--   2. deductCredits() in the client did read-then-write: two parallel
--      translations both read 50 credits and both wrote 40, making one
--      free. Replaced by an atomic single-UPDATE RPC with the cost
--      looked up SERVER-side (so a tampered client can't undercharge).
--
--   3. check_and_reset_credits(user_id) accepted an arbitrary user id
--      from the client. It now derives the user from auth.uid() when a
--      JWT is present.
--
-- Mechanism: trusted paths (the RPCs below, service role, SQL editor)
-- set a transaction-local GUC flag before writing; the trigger allows
-- writes only when that flag is set or the caller is service role.
--
-- Safe to run multiple times.
-- ─────────────────────────────────────────────────────────────────────

-- ── 1. Guard trigger ─────────────────────────────────────────────────
create or replace function public.protect_profile_credits()
returns trigger
language plpgsql
as $$
declare
  jwt_role text := coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '');
  rpc_flag text := coalesce(current_setting('app.allow_credit_write', true), '');
begin
  -- Trusted callers pass through:
  --   service_role  : server-side code using the service key
  --   ''            : SQL editor / migrations / cron (no JWT at all)
  --   rpc_flag='on' : the SECURITY DEFINER RPCs below
  if jwt_role = 'service_role' or jwt_role = '' or rpc_flag = 'on' then
    return new;
  end if;

  if new.credits          is distinct from old.credits
     or new.credits_used  is distinct from old.credits_used
     or new.plan          is distinct from old.plan
     or new.monthly_credits  is distinct from old.monthly_credits
     or new.credits_reset_at is distinct from old.credits_reset_at
  then
    raise exception 'credits, credits_used, plan and related columns can only be changed server-side'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_protect_profile_credits on public.profiles;
create trigger trg_protect_profile_credits
  before update on public.profiles
  for each row execute function public.protect_profile_credits();

-- ── 2. Atomic deduction RPC ──────────────────────────────────────────
-- Cost table lives HERE, not in the client, so a tampered client can
-- not undercharge. Add new actions in the CASE below and in
-- src/lib/credits.js CREDIT_COSTS (client copy is display-only now).
create or replace function public.deduct_credits(p_action text)
returns table (ok boolean, reason text, credits_remaining integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_cost integer;
  v_credits integer;
begin
  if v_user is null then
    return query select false, 'not_authenticated'::text, 0;
    return;
  end if;

  v_cost := case p_action
    when 'brief_translation'    then 10
    when 'deep_analysis'        then 4
    when 'kanban_generation'    then 8
    when 'backlog_generation'   then 8
    when 'ai_task_prompt'       then 3
    when 'moodboard_refresh'    then 3
    when 'red_flag_analysis'    then 3
    when 'questions_generation' then 3
    when 'client_intake'        then 5
    else null
  end;
  if v_cost is null then
    return query select false, 'unknown_action'::text, 0;
    return;
  end if;

  -- Let this transaction through the guard trigger.
  perform set_config('app.allow_credit_write', 'on', true);

  -- Single conditional UPDATE = atomic. Paid plans are never blocked
  -- on shortage (usage still recorded); free plans must have balance.
  update profiles
     set credits      = greatest(0, coalesce(credits, 0) - v_cost),
         credits_used = coalesce(credits_used, 0) + v_cost
   where id = v_user
     and (coalesce(credits, 0) >= v_cost or coalesce(plan, 'free') <> 'free')
  returning credits into v_credits;

  if found then
    return query select true, null::text, v_credits;
  elsif exists (select 1 from profiles where id = v_user) then
    return query select false, 'insufficient_credits'::text,
      (select coalesce(credits, 0) from profiles where id = v_user);
  else
    return query select false, 'profile_not_found'::text, 0;
  end if;
end;
$$;

revoke all on function public.deduct_credits(text) from public;
grant execute on function public.deduct_credits(text) to authenticated;

-- ── 3. Harden check_and_reset_credits ────────────────────────────────
-- Same signature (the client passes user_id on every auth event) but
-- the parameter is now ignored whenever a JWT is present: the reset
-- applies to auth.uid() only. Also sets the guard flag so its UPDATE
-- passes the new trigger.
create or replace function check_and_reset_credits(user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := coalesce(auth.uid(), user_id);
  profile_row profiles%ROWTYPE;
  plan_credits integer;
begin
  select * into profile_row from profiles where id = v_user;
  if not found then
    return;
  end if;

  if profile_row.plan = 'starter' then
    plan_credits := 300;
  elsif profile_row.plan = 'pro' then
    plan_credits := 1000;
  else
    plan_credits := 0;  -- Free plan never refreshes
  end if;

  if profile_row.plan <> 'free'
     and (profile_row.credits_reset_at is null
          or profile_row.credits_reset_at < now() - interval '30 days')
  then
    perform set_config('app.allow_credit_write', 'on', true);
    update profiles
       set credits = plan_credits,
           credits_used = 0,
           credits_reset_at = now()
     where id = v_user;
  end if;
end;
$$;
