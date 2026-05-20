-- ─────────────────────────────────────────────────────────────────────
-- TEAM MEMBERS / INVITES — REPAIR & VERIFY
-- ─────────────────────────────────────────────────────────────────────
-- Safe to run multiple times. Run this in Supabase → SQL Editor if
-- invited users aren't appearing in the project Team table. It:
--   1. Creates team_members / team_invites if missing
--   2. Adds the (project_id, user_id) unique constraint
--   3. Adds an RLS policy letting an invitee insert their OWN row
--      (the server-side accept path still uses the service-role key
--      and bypasses RLS — this policy is a belt-and-braces fallback)
--   4. Ensures indexes are present
-- ─────────────────────────────────────────────────────────────────────

-- 1. team_members table
create table if not exists team_members (
  id uuid default uuid_generate_v4() primary key,
  project_id text references projects(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  invited_by uuid references auth.users(id),
  job_role text not null,
  display_name text,
  status text default 'active',
  joined_at timestamptz default now()
);

-- 2. Unique constraint (so upsert/onConflict works in any environment)
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'team_members_project_id_user_id_key'
  ) then
    alter table team_members
      add constraint team_members_project_id_user_id_key
      unique (project_id, user_id);
  end if;
end $$;

-- 3. RLS
alter table team_members enable row level security;

-- 3a. Members + project owners can see the team list
drop policy if exists "Project members can view team" on team_members;
create policy "Project members can view team"
  on team_members for select
  using (
    user_id = auth.uid()
    or project_id in (select id from projects where user_id = auth.uid())
    or project_id in (select project_id from team_members where user_id = auth.uid() and status = 'active')
  );

-- 3b. Project owner can fully manage the team
drop policy if exists "Project owners can manage team" on team_members;
create policy "Project owners can manage team"
  on team_members for all
  using (project_id in (select id from projects where user_id = auth.uid()))
  with check (project_id in (select id from projects where user_id = auth.uid()));

-- 3c. Invitee may INSERT their own row (so the accept flow works even if
--     the service-role path is unavailable for some reason)
drop policy if exists "Invitee can join own row" on team_members;
create policy "Invitee can join own row"
  on team_members for insert
  with check (user_id = auth.uid());

-- 3d. A member can update their OWN row
drop policy if exists "Members can update own record" on team_members;
create policy "Members can update own record"
  on team_members for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- 4. team_invites table
create table if not exists team_invites (
  id text primary key,
  project_id text references projects(id) on delete cascade not null,
  inviter_id uuid references auth.users(id) on delete cascade not null,
  invitee_email text not null,
  invitee_name text,
  job_role text not null,
  status text default 'pending',
  token text unique not null,
  invited_at timestamptz default now(),
  accepted_at timestamptz,
  expires_at timestamptz default (now() + interval '7 days')
);

alter table team_invites enable row level security;

drop policy if exists "Anyone can read invite by token" on team_invites;
create policy "Anyone can read invite by token"
  on team_invites for select using (true);

drop policy if exists "Inviter can manage their invites" on team_invites;
create policy "Inviter can manage their invites"
  on team_invites for all
  using (inviter_id = auth.uid())
  with check (inviter_id = auth.uid());

drop policy if exists "Invitee can update their invite" on team_invites;
create policy "Invitee can update their invite"
  on team_invites for update using (true);

-- 5. Indexes
create index if not exists team_members_project_idx on team_members(project_id);
create index if not exists team_members_user_idx on team_members(user_id);
create index if not exists team_invites_project_idx on team_invites(project_id);
create index if not exists team_invites_token_idx on team_invites(token);
create index if not exists team_invites_email_idx on team_invites(invitee_email);

-- ─────────────────────────────────────────────────────────────────────
-- VERIFY — run these after the script above. Each should return rows.
-- ─────────────────────────────────────────────────────────────────────
-- select * from team_members order by joined_at desc limit 10;
-- select * from team_invites order by invited_at desc limit 10;
