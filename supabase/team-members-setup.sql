-- ─────────────────────────────────────────────────────────────────────
-- TEAM RBAC + CROSS-USER VISIBILITY — ONE-SHOT SETUP
-- ─────────────────────────────────────────────────────────────────────
-- Safe to run multiple times.
--
-- This script:
--   1. Defines two SECURITY DEFINER helpers (is_project_owner /
--      is_project_member) that bypass RLS when checking project access.
--      Using them in policies AVOIDS the 42P17 "infinite recursion"
--      error you get when projects' policy queries team_members and
--      team_members' policy queries projects.
--   2. Repairs / creates team_members + team_invites
--   3. Adds kanban_columns to projects + lets active members read /
--      Editors update the shared project row
--   4. Repairs RLS on tasks / subtasks / task_comments / task_activity
--   5. Adds every cross-user table to the supabase_realtime publication
--   6. Sets REPLICA IDENTITY FULL on those tables so UPDATE events
--      broadcast the full row (jsonb included) — required for kanban
--      column renames to propagate without a refresh.
-- ─────────────────────────────────────────────────────────────────────


-- ═════════════════════════════════════════════════════════════════════
-- 0. SECURITY DEFINER HELPERS — break RLS recursion
-- ═════════════════════════════════════════════════════════════════════

create or replace function is_project_owner(p_project_id text, p_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from projects
    where id = p_project_id and user_id = p_user_id
  );
$$;

create or replace function is_project_member(p_project_id text, p_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from team_members
    where project_id = p_project_id
      and user_id = p_user_id
      and status = 'active'
  );
$$;


-- ═════════════════════════════════════════════════════════════════════
-- 1. TEAM_MEMBERS + TEAM_INVITES TABLES
-- ═════════════════════════════════════════════════════════════════════

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

-- Per-project AI credit ceiling, set by the project Admin from the
-- Project Members table. NULL = no limit assigned yet.
alter table team_members add column if not exists credit_limit integer;

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

alter table team_members enable row level security;
alter table team_invites enable row level security;

-- ── team_members policies (no self-reference, no cross-reference) ──
-- Drop ALL prior names so we start clean
drop policy if exists "Project members can view team" on team_members;
drop policy if exists "Project owners can manage team" on team_members;
drop policy if exists "Invitee can join own row" on team_members;
drop policy if exists "Members can update own record" on team_members;
drop policy if exists "team_members_select" on team_members;
drop policy if exists "team_members_insert" on team_members;
drop policy if exists "team_members_update" on team_members;
drop policy if exists "team_members_delete" on team_members;

create policy "team_members_select" on team_members for select
  using (
    user_id = auth.uid()
    or is_project_owner(project_id, auth.uid())
    or is_project_member(project_id, auth.uid())
  );

create policy "team_members_insert" on team_members for insert
  with check (
    user_id = auth.uid()
    or is_project_owner(project_id, auth.uid())
  );

create policy "team_members_update" on team_members for update
  using (
    user_id = auth.uid()
    or is_project_owner(project_id, auth.uid())
  );

create policy "team_members_delete" on team_members for delete
  using (
    user_id = auth.uid()
    or is_project_owner(project_id, auth.uid())
  );

-- ── team_invites policies ──
drop policy if exists "Anyone can read invite by token" on team_invites;
drop policy if exists "Inviter can manage their invites" on team_invites;
drop policy if exists "Invitee can update their invite" on team_invites;
drop policy if exists "team_invites_select" on team_invites;
drop policy if exists "team_invites_all" on team_invites;
drop policy if exists "team_invites_update" on team_invites;

create policy "team_invites_select" on team_invites for select
  using (true);  -- public read by token; client filters by token=...

create policy "team_invites_all" on team_invites for all
  using (inviter_id = auth.uid())
  with check (inviter_id = auth.uid());

create policy "team_invites_update" on team_invites for update
  using (true);

create index if not exists team_members_project_idx on team_members(project_id);
create index if not exists team_members_user_idx on team_members(user_id);
create index if not exists team_invites_project_idx on team_invites(project_id);
create index if not exists team_invites_token_idx on team_invites(token);
create index if not exists team_invites_email_idx on team_invites(invitee_email);


-- ═════════════════════════════════════════════════════════════════════
-- 2. PROJECTS — column for kanban layout + RLS for team members
-- ═════════════════════════════════════════════════════════════════════

alter table projects add column if not exists kanban_columns jsonb;

-- Existing "Users can manage own projects" stays (defined in schema.sql)
-- We just add the policies for invited team members. Drop legacy names first.
drop policy if exists "Team members can view invited projects" on projects;
drop policy if exists "Team members can edit shared projects" on projects;
drop policy if exists "projects_select_member" on projects;
drop policy if exists "projects_update_member" on projects;

create policy "projects_select_member" on projects for select
  using (is_project_member(id, auth.uid()));

-- Editors (any active member; Viewer block is enforced in the API/app)
-- may update jsonb fields like brief_text / kanban / kanban_columns.
create policy "projects_update_member" on projects for update
  using (is_project_member(id, auth.uid()))
  with check (is_project_member(id, auth.uid()));


-- ═════════════════════════════════════════════════════════════════════
-- 3. TASKS / SUBTASKS / COMMENTS / ACTIVITY
-- ═════════════════════════════════════════════════════════════════════

do $$ begin
  if not exists (select 1 from pg_tables where tablename = 'tasks') then
    create table tasks (
      id text primary key,
      project_id text references projects(id) on delete cascade not null,
      user_id uuid references auth.users(id) on delete cascade not null,
      title text not null,
      description text,
      column_name text default 'To Do',
      assigned_role text,
      assigned_name text,
      assigned_user_id uuid references auth.users(id),
      priority text default 'MEDIUM',
      estimated_days integer default 1,
      due_date date,
      start_date date,
      completed boolean default false,
      completed_at timestamptz,
      blocked_by text[],
      position integer default 0,
      phase text,
      labels text[],
      ai_prompt text,
      created_at timestamptz default now(),
      updated_at timestamptz default now()
    );
  end if;
end $$;

alter table tasks enable row level security;

drop policy if exists "Project members can view tasks" on tasks;
drop policy if exists "Project members can manage tasks" on tasks;
drop policy if exists "tasks_select" on tasks;
drop policy if exists "tasks_all" on tasks;

create policy "tasks_select" on tasks for select using (
  user_id = auth.uid()
  or is_project_owner(project_id, auth.uid())
  or is_project_member(project_id, auth.uid())
);

create policy "tasks_all" on tasks for all using (
  is_project_owner(project_id, auth.uid())
  or is_project_member(project_id, auth.uid())
) with check (
  is_project_owner(project_id, auth.uid())
  or is_project_member(project_id, auth.uid())
);

-- ── SUBTASKS ──
do $$ begin
  if not exists (select 1 from pg_tables where tablename = 'subtasks') then
    create table subtasks (
      id text primary key,
      task_id text references tasks(id) on delete cascade not null,
      project_id text not null,
      title text not null,
      completed boolean default false,
      completed_at timestamptz,
      created_at timestamptz default now()
    );
  end if;
end $$;

alter table subtasks enable row level security;
drop policy if exists "Task access grants subtask access" on subtasks;
drop policy if exists "subtasks_all" on subtasks;

create policy "subtasks_all" on subtasks for all using (
  is_project_owner(project_id, auth.uid())
  or is_project_member(project_id, auth.uid())
);

-- ── TASK COMMENTS ──
do $$ begin
  if not exists (select 1 from pg_tables where tablename = 'task_comments') then
    create table task_comments (
      id text primary key,
      task_id text references tasks(id) on delete cascade not null,
      project_id text not null,
      user_id uuid references auth.users(id) on delete cascade not null,
      author_name text not null,
      content text not null,
      parent_id text,
      created_at timestamptz default now(),
      updated_at timestamptz default now()
    );
  end if;
end $$;

alter table task_comments enable row level security;
drop policy if exists "Project members can manage comments" on task_comments;
drop policy if exists "comments_all" on task_comments;

create policy "comments_all" on task_comments for all using (
  is_project_owner(project_id, auth.uid())
  or is_project_member(project_id, auth.uid())
);

-- ── TASK ACTIVITY ──
do $$ begin
  if not exists (select 1 from pg_tables where tablename = 'task_activity') then
    create table task_activity (
      id text primary key,
      task_id text references tasks(id) on delete cascade not null,
      project_id text not null,
      user_id uuid references auth.users(id),
      actor_name text not null,
      action text not null,
      old_value text,
      new_value text,
      created_at timestamptz default now()
    );
  end if;
end $$;

alter table task_activity enable row level security;
drop policy if exists "Project members can view activity" on task_activity;
drop policy if exists "Authenticated users can log activity" on task_activity;
drop policy if exists "activity_select" on task_activity;
drop policy if exists "activity_insert" on task_activity;

create policy "activity_select" on task_activity for select using (
  is_project_owner(project_id, auth.uid())
  or is_project_member(project_id, auth.uid())
);

create policy "activity_insert" on task_activity for insert
  with check (auth.uid() is not null);


-- ═════════════════════════════════════════════════════════════════════
-- 4. REALTIME PUBLICATION + REPLICA IDENTITY FULL
-- ═════════════════════════════════════════════════════════════════════
-- REPLICA IDENTITY FULL is required so UPDATE events carry the whole
-- new row (jsonb columns included). Without this, payload.new for
-- kanban_columns arrives undefined and column renames look like a
-- no-op until the user refreshes.

do $$
declare
  t text;
begin
  for t in
    select unnest(array[
      'projects', 'tasks', 'subtasks', 'task_comments', 'task_activity',
      'team_members', 'team_invites'
    ])
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table %I', t);
    end if;

    execute format('alter table %I replica identity full', t);
  end loop;
end $$;


-- ═════════════════════════════════════════════════════════════════════
-- 5. INDEXES
-- ═════════════════════════════════════════════════════════════════════

create index if not exists tasks_project_idx on tasks(project_id);
create index if not exists tasks_column_idx on tasks(project_id, column_name);
create index if not exists subtasks_task_idx on subtasks(task_id);
create index if not exists comments_task_idx on task_comments(task_id);
create index if not exists activity_task_idx on task_activity(task_id);


-- ─────────────────────────────────────────────────────────────────────
-- VERIFY (uncomment to run)
-- ─────────────────────────────────────────────────────────────────────
-- select tablename, policyname from pg_policies
--   where tablename in ('projects','tasks','subtasks','task_comments','task_activity','team_members','team_invites')
--   order by tablename, policyname;
-- select tablename, relreplident from pg_publication_tables pt
--   join pg_class c on c.relname = pt.tablename
--   where pubname = 'supabase_realtime' order by tablename;
-- select * from team_members order by joined_at desc limit 10;
