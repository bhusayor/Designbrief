-- ─────────────────────────────────────────────────────────────────────
-- FLUTTERWAVE BILLING — audit table
-- ─────────────────────────────────────────────────────────────────────
-- The Flutterwave webhook writes one row here for each charge.completed
-- event so we can (a) make plan grants idempotent (tx_ref unique check)
-- and (b) reconcile plan state against Flutterwave history.
-- Safe to run multiple times.
-- ─────────────────────────────────────────────────────────────────────

create table if not exists billing_events (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) on delete cascade,
  plan text,
  amount numeric,
  currency text,
  tx_ref text unique,
  flw_id text,
  raw jsonb,
  created_at timestamptz default now()
);

alter table billing_events enable row level security;

-- Only the service role (used by the webhook) writes to this table.
-- Users can read their own rows so future "Billing history" UI works.
drop policy if exists "users_read_own_billing" on billing_events;
create policy "users_read_own_billing" on billing_events for select
  using (user_id = auth.uid());

create index if not exists billing_events_user_idx on billing_events(user_id);
create index if not exists billing_events_tx_idx on billing_events(tx_ref);
