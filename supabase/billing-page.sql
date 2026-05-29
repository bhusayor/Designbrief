-- ─────────────────────────────────────────────────────────────────────
-- BILLING PAGE — supporting tables
-- ─────────────────────────────────────────────────────────────────────
-- Safe to run multiple times.
--
-- billing_history       one row per successful charge (Billing History
--                       table on the Billing page)
-- credit_usage_log      one row per AI action consumed (powers the
--                       "Credit Breakdown" widget)
-- profiles columns      plan_status / cancellation_reason / access_until
--                       so the Cancellation flow can stamp pending
--                       downgrades without losing the access window
-- ─────────────────────────────────────────────────────────────────────

create extension if not exists "pgcrypto";

-- ── billing_history ──────────────────────────────────────────────────
create table if not exists billing_history (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users(id) on delete cascade,
  plan          text not null,
  amount        numeric not null,
  currency      text default 'USD',
  status        text default 'successful',
  payment_ref   text,
  billing_cycle text default 'monthly',
  created_at    timestamptz default now()
);

alter table billing_history enable row level security;

drop policy if exists "Users view own billing" on billing_history;
create policy "Users view own billing"
  on billing_history for select
  using (user_id = auth.uid());

create index if not exists billing_history_user_idx on billing_history(user_id);
create index if not exists billing_history_created_idx on billing_history(created_at desc);


-- ── credit_usage_log ────────────────────────────────────────────────
create table if not exists credit_usage_log (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete cascade,
  action      text not null,
  credits     integer not null,
  project_id  text,
  created_at  timestamptz default now()
);

alter table credit_usage_log enable row level security;

drop policy if exists "Users view own credits" on credit_usage_log;
create policy "Users view own credits"
  on credit_usage_log for select
  using (user_id = auth.uid());

drop policy if exists "Users insert own credits" on credit_usage_log;
create policy "Users insert own credits"
  on credit_usage_log for insert
  with check (user_id = auth.uid());

create index if not exists credit_usage_log_user_idx on credit_usage_log(user_id, created_at desc);


-- ── profiles: cancellation columns ──────────────────────────────────
alter table profiles
  add column if not exists plan_status text default 'active',
  add column if not exists cancellation_reason text,
  add column if not exists access_until timestamptz,
  -- Timestamp the user removed their card. Compared against the most
  -- recent billing_history.created_at so the UI flips back to "No
  -- payment method on file" until the next successful charge.
  add column if not exists payment_method_removed_at timestamptz;
