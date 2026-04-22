-- ── TASKS ─────────────────────────────────────
create table if not exists tasks (
  id text primary key,
  project_id text references projects(id)
             on delete cascade not null,
  user_id uuid references auth.users(id)
          on delete cascade not null,
  title text not null,
  description text,
  column_name text default 'To Do',
  assigned_role text,
  assigned_name text,
  assigned_user_id uuid references auth.users(id),
  priority text default 'MEDIUM',
  estimated_days integer default 1,
  due_date date,
  completed boolean default false,
  completed_at timestamptz,
  blocked_by text[],
  position integer default 0,
  phase text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table tasks enable row level security;

create policy "Project members can view tasks"
  on tasks for select
  using (
    user_id = auth.uid() or
    project_id in (
      select id from projects
      where user_id = auth.uid()
    ) or
    project_id in (
      select project_id from team_members
      where user_id = auth.uid()
    )
  );

create policy "Project members can manage tasks"
  on tasks for all
  using (
    project_id in (
      select id from projects
      where user_id = auth.uid()
    ) or
    project_id in (
      select project_id from team_members
      where user_id = auth.uid()
    )
  )
  with check (
    project_id in (
      select id from projects
      where user_id = auth.uid()
    ) or
    project_id in (
      select project_id from team_members
      where user_id = auth.uid()
    )
  );

-- ── SUBTASKS ──────────────────────────────────
create table if not exists subtasks (
  id text primary key,
  task_id text references tasks(id)
          on delete cascade not null,
  project_id text not null,
  title text not null,
  completed boolean default false,
  completed_at timestamptz,
  created_at timestamptz default now()
);

alter table subtasks enable row level security;

create policy "Task access grants subtask access"
  on subtasks for all
  using (
    project_id in (
      select id from projects
      where user_id = auth.uid()
    ) or
    project_id in (
      select project_id from team_members
      where user_id = auth.uid()
    )
  );

-- ── TASK COMMENTS ─────────────────────────────
create table if not exists task_comments (
  id text primary key,
  task_id text references tasks(id)
          on delete cascade not null,
  project_id text not null,
  user_id uuid references auth.users(id)
          on delete cascade not null,
  author_name text not null,
  content text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table task_comments enable row level security;

create policy "Project members can manage comments"
  on task_comments for all
  using (
    project_id in (
      select id from projects
      where user_id = auth.uid()
    ) or
    project_id in (
      select project_id from team_members
      where user_id = auth.uid()
    )
  );

-- ── TASK ACTIVITY ─────────────────────────────
create table if not exists task_activity (
  id text primary key,
  task_id text references tasks(id)
          on delete cascade not null,
  project_id text not null,
  user_id uuid references auth.users(id),
  actor_name text not null,
  action text not null,
  old_value text,
  new_value text,
  created_at timestamptz default now()
);

alter table task_activity enable row level security;

create policy "Project members can view activity"
  on task_activity for select
  using (
    project_id in (
      select id from projects
      where user_id = auth.uid()
    ) or
    project_id in (
      select project_id from team_members
      where user_id = auth.uid()
    )
  );

create policy "Authenticated users can log activity"
  on task_activity for insert
  with check (auth.uid() is not null);

-- ── INDEXES ───────────────────────────────────
create index if not exists tasks_project_idx
  on tasks(project_id);
create index if not exists tasks_column_idx
  on tasks(project_id, column_name);
create index if not exists subtasks_task_idx
  on subtasks(task_id);
create index if not exists comments_task_idx
  on task_comments(task_id);
create index if not exists activity_task_idx
  on task_activity(task_id);
