-- ─────────────────────────────────────────────────────────────────────
-- TEAM RBAC + CROSS-USER VISIBILITY — ONE-SHOT SETUP
-- ─────────────────────────────────────────────────────────────────────
-- Safe to run multiple times. Run this in Supabase → SQL Editor if
-- invited users can't see the project, the kanban board, tasks,
-- subtasks, comments, or activity.
--
-- What it does:
--   1. Creates / repairs team_members and team_invites tables
--   2. Grants invited members SELECT on the project they were invited to
--   3. Grants invited members read + manage on tasks / subtasks /
--      comments / activity for that project
--   4. Enables Supabase Realtime on the cross-user tables so changes
--      appear live for all collaborators
-- ─────────────────────────────────────────────────────────────────────

-- ═════════════════════════════════════════════════════════════════════
-- 1. TEAM_MEMBERS  + TEAM_INVITES TABLES
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

-- team_members policies
drop policy if exists "Project members can view team" on team_members;
create policy "Project members can view team"
  on team_members for select
  using (
    user_id = auth.uid()
    or project_id in (select id from projects where user_id = auth.uid())
    or project_id in (
      select project_id from team_members
      where user_id = auth.uid() and status = 'active'
    )
  );

drop policy if exists "Project owners can manage team" on team_members;
create policy "Project owners can manage team"
  on team_members for all
  using (project_id in (select id from projects where user_id = auth.uid()))
  with check (project_id in (select id from projects where user_id = auth.uid()));

drop policy if exists "Invitee can join own row" on team_members;
create policy "Invitee can join own row"
  on team_members for insert
  with check (user_id = auth.uid());

drop policy if exists "Members can update own record" on team_members;
create policy "Members can update own record"
  on team_members for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- team_invites policies
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

create index if not exists team_members_project_idx on team_members(project_id);
create index if not exists team_members_user_idx on team_members(user_id);
create index if not exists team_invites_project_idx on team_invites(project_id);
create index if not exists team_invites_token_idx on team_invites(token);
create index if not exists team_invites_email_idx on team_invites(invitee_email);


-- ═════════════════════════════════════════════════════════════════════
-- 2a. PROJECTS — add kanban_columns column so column layout syncs
-- ═════════════════════════════════════════════════════════════════════

alter table projects add column if not exists kanban_columns jsonb;

-- ═════════════════════════════════════════════════════════════════════
-- 2b. PROJECTS — let team members READ projects they were invited to
-- ═════════════════════════════════════════════════════════════════════
-- Without this, loadProjectsFromDB returns null for shared projects,
-- and the invitee sees an empty board.

drop policy if exists "Team members can view invited projects" on projects;
create policy "Team members can view invited projects"
  on projects for select
  using (
    id in (
      select project_id from team_members
      where user_id = auth.uid() and status = 'active'
    )
  );

-- Allow Editor-level members to UPDATE shared projects (brief / kanban
-- jsonb columns the legacy code writes to). Viewer/Admin gating is
-- enforced at the API layer; this just removes the RLS block.
drop policy if exists "Team members can edit shared projects" on projects;
create policy "Team members can edit shared projects"
  on projects for update
  using (
    id in (
      select project_id from team_members
      where user_id = auth.uid() and status = 'active'
    )
  )
  with check (
    id in (
      select project_id from team_members
      where user_id = auth.uid() and status = 'active'
    )
  );


-- ═════════════════════════════════════════════════════════════════════
-- 3. TASKS / SUBTASKS / COMMENTS / ACTIVITY — visible to all members
-- ═════════════════════════════════════════════════════════════════════

-- ── TASKS ──
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
create policy "Project members can view tasks"
  on tasks for select using (
    user_id = auth.uid()
    or project_id in (select id from projects where user_id = auth.uid())
    or project_id in (
      select project_id from team_members
      where user_id = auth.uid() and status = 'active'
    )
  );

drop policy if exists "Project members can manage tasks" on tasks;
create policy "Project members can manage tasks"
  on tasks for all using (
    project_id in (select id from projects where user_id = auth.uid())
    or project_id in (
      select project_id from team_members
      where user_id = auth.uid() and status = 'active'
    )
  ) with check (
    project_id in (select id from projects where user_id = auth.uid())
    or project_id in (
      select project_id from team_members
      where user_id = auth.uid() and status = 'active'
    )
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
create policy "Task access grants subtask access"
  on subtasks for all using (
    project_id in (select id from projects where user_id = auth.uid())
    or project_id in (
      select project_id from team_members
      where user_id = auth.uid() and status = 'active'
    )
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
create policy "Project members can manage comments"
  on task_comments for all using (
    project_id in (select id from projects where user_id = auth.uid())
    or project_id in (
      select project_id from team_members
      where user_id = auth.uid() and status = 'active'
    )
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
create policy "Project members can view activity"
  on task_activity for select using (
    project_id in (select id from projects where user_id = auth.uid())
    or project_id in (
      select project_id from team_members
      where user_id = auth.uid() and status = 'active'
    )
  );

drop policy if exists "Authenticated users can log activity" on task_activity;
create policy "Authenticated users can log activity"
  on task_activity for insert with check (auth.uid() is not null);


-- ═════════════════════════════════════════════════════════════════════
-- 4. REALTIME — broadcast inserts/updates/deletes to all members
-- ═════════════════════════════════════════════════════════════════════
-- The client subscribes to postgres_changes on these tables; Supabase
-- only forwards events if the table is in the supabase_realtime
-- publication.

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
    -- add table to publication if not already there
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table %I', t);
    end if;
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
-- VERIFY — run any of these after the script. Should each return rows
-- ─────────────────────────────────────────────────────────────────────
-- select tablename, policyname from pg_policies
--   where tablename in ('projects','tasks','subtasks','task_comments','task_activity','team_members','team_invites')
--   order by tablename, policyname;
-- select tablename from pg_publication_tables where pubname = 'supabase_realtime' order by tablename;
-- select * from team_members order by joined_at desc limit 10;
