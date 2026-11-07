-- Server-enforced AI credit operations.
-- One logical paid action may contain a bounded number of model calls
-- (for example, the 22 V3 brief chapters) while charging exactly once.

create table if not exists public.credit_usage_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null,
  credits integer not null,
  created_at timestamptz not null default now()
);

alter table public.credit_usage_log enable row level security;
drop policy if exists "Users view own credits" on public.credit_usage_log;
create policy "Users view own credits"
  on public.credit_usage_log for select
  using (auth.uid() = user_id);
drop policy if exists "Users insert own credits" on public.credit_usage_log;

create table if not exists public.ai_credit_operations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  operation_id uuid not null,
  action text not null,
  cost integer not null check (cost > 0),
  call_count integer not null default 0 check (call_count >= 0),
  max_calls integer not null check (max_calls > 0),
  created_at timestamptz not null default now(),
  last_used_at timestamptz not null default now(),
  unique (user_id, operation_id)
);

create index if not exists ai_credit_operations_user_created_idx
  on public.ai_credit_operations(user_id, created_at desc);

alter table public.ai_credit_operations enable row level security;
-- No browser policies. Only the service role and this SECURITY DEFINER
-- function may read or mutate operation state.

create or replace function public.consume_ai_credit_operation(
  p_user_id uuid,
  p_operation_id uuid,
  p_action text
)
returns table (
  ok boolean,
  reason text,
  credits_remaining integer,
  charged boolean,
  calls_remaining integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '');
  v_cost integer;
  v_max_calls integer;
  v_operation public.ai_credit_operations%rowtype;
  v_credits integer;
  v_charged boolean := false;
begin
  if v_role <> 'service_role' then
    return query select false, 'service_role_required'::text, 0, false, 0;
    return;
  end if;

  select x.cost, x.max_calls
    into v_cost, v_max_calls
  from (values
    ('brief_translation',    10, 32),
    ('kanban_generation',     8,  3),
    ('backlog_generation',    8,  4),
    ('ai_task_prompt',        3,  2),
    ('moodboard_refresh',     3,  4),
    ('red_flag_analysis',     3,  3),
    ('questions_generation',  3,  3),
    ('client_intake',         5, 32)
  ) as x(action, cost, max_calls)
  where x.action = p_action;

  if v_cost is null then
    return query select false, 'unknown_action'::text, 0, false, 0;
    return;
  end if;

  insert into public.ai_credit_operations (
    user_id, operation_id, action, cost, max_calls
  ) values (
    p_user_id, p_operation_id, p_action, v_cost, v_max_calls
  ) on conflict (user_id, operation_id) do nothing;

  select * into v_operation
    from public.ai_credit_operations
   where user_id = p_user_id and operation_id = p_operation_id
   for update;

  if v_operation.action <> p_action then
    return query select false, 'operation_action_mismatch'::text, 0, false, 0;
    return;
  end if;

  if v_operation.created_at < now() - interval '30 minutes' then
    return query select false, 'operation_expired'::text, 0, false, 0;
    return;
  end if;

  if v_operation.call_count >= v_operation.max_calls then
    select coalesce(credits, 0) into v_credits from public.profiles where id = p_user_id;
    return query select false, 'operation_call_limit'::text, coalesce(v_credits, 0), false, 0;
    return;
  end if;

  if v_operation.call_count = 0 then
    perform set_config('app.allow_credit_write', 'on', true);
    update public.profiles
       set credits = greatest(0, coalesce(credits, 0) - v_cost),
           credits_used = coalesce(credits_used, 0) + v_cost
     where id = p_user_id
       and coalesce(credits, 0) >= v_cost
    returning credits into v_credits;

    if not found then
      if exists (select 1 from public.profiles where id = p_user_id) then
        select coalesce(credits, 0) into v_credits from public.profiles where id = p_user_id;
        return query select false, 'insufficient_credits'::text, v_credits, false, v_operation.max_calls;
      end if;
      return query select false, 'profile_not_found'::text, 0, false, v_operation.max_calls;
      return;
    end if;

    v_charged := true;
    insert into public.credit_usage_log(user_id, action, credits)
    values (p_user_id, p_action, v_cost);
  else
    select coalesce(credits, 0) into v_credits from public.profiles where id = p_user_id;
  end if;

  update public.ai_credit_operations
     set call_count = call_count + 1,
         last_used_at = now()
   where id = v_operation.id
   returning call_count into v_operation.call_count;

  return query select
    true,
    null::text,
    coalesce(v_credits, 0),
    v_charged,
    greatest(0, v_operation.max_calls - v_operation.call_count);
end;
$$;

revoke all on function public.consume_ai_credit_operation(uuid, uuid, text) from public;
revoke all on function public.consume_ai_credit_operation(uuid, uuid, text) from anon;
revoke all on function public.consume_ai_credit_operation(uuid, uuid, text) from authenticated;
grant execute on function public.consume_ai_credit_operation(uuid, uuid, text) to service_role;

comment on table public.ai_credit_operations is
  'Server-only idempotency and call-budget records for paid AI operations.';
