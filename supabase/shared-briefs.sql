-- ────────────────────────────────────────────────────────────────────
-- shared_briefs — public read-only snapshots of a translated brief.
--
-- Hitting Share on the brief result page inserts a snapshot of the
-- current result + scoring + inspirations into this table with a
-- random UUID token. The token shows up in the share URL
-- (/share/<token>) and the public viewer page reads the row back
-- via anon SELECT — same security model as Google Doc share links
-- (the unguessability of the 128-bit UUID is the access control).
-- ────────────────────────────────────────────────────────────────────

create extension if not exists "pgcrypto";

create table if not exists shared_briefs (
  token         uuid primary key default gen_random_uuid(),
  title         text not null,
  result        jsonb not null,
  scoring       jsonb,
  inspirations  jsonb default '[]'::jsonb,
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz default now()
);

create index if not exists shared_briefs_created_by_idx
  on shared_briefs(created_by);

-- ── RLS ─────────────────────────────────────────────────────────────
alter table shared_briefs enable row level security;

-- Anyone (including anon) can SELECT. The token in the URL is the
-- only access control; rows with no token leaked publicly can never
-- be enumerated because clients always query by primary key.
drop policy if exists "Anyone can read shared briefs" on shared_briefs;
create policy "Anyone can read shared briefs"
  on shared_briefs for select
  using (true);

-- Only authenticated users can INSERT, and only their own user_id
-- can be the created_by — prevents writing on behalf of someone else.
drop policy if exists "Authenticated users can create shares" on shared_briefs;
create policy "Authenticated users can create shares"
  on shared_briefs for insert
  with check (auth.uid() = created_by);

-- Owners can DELETE their own shares (revoke). Anon viewers cannot.
drop policy if exists "Owners can revoke their shares" on shared_briefs;
create policy "Owners can revoke their shares"
  on shared_briefs for delete
  using (auth.uid() = created_by);
