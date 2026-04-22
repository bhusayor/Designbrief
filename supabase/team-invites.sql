-- ── TEAM MEMBERS ──────────────────────────────
-- Stores accepted team members for each project
create table if not exists team_members (
  id uuid default uuid_generate_v4() primary key,
  project_id text references projects(id)
             on delete cascade not null,
  user_id uuid references auth.users(id)
          on delete cascade not null,
  invited_by uuid references auth.users(id),
  job_role text not null,
  display_name text,
  status text default 'active',
  joined_at timestamptz default now(),
  unique(project_id, user_id)
);

alter table team_members enable row level security;

create policy "Project members can view team"
  on team_members for select
  using (
    user_id = auth.uid() or
    project_id in (
      select id from projects
      where user_id = auth.uid()
    )
  );

create policy "Project owners can manage team"
  on team_members for all
  using (
    project_id in (
      select id from projects
      where user_id = auth.uid()
    )
  )
  with check (
    project_id in (
      select id from projects
      where user_id = auth.uid()
    )
  );

create policy "Members can update own record"
  on team_members for update
  using (user_id = auth.uid());

-- ── TEAM INVITES ──────────────────────────────
-- Stores pending invitations
create table if not exists team_invites (
  id text primary key,
  project_id text references projects(id)
             on delete cascade not null,
  inviter_id uuid references auth.users(id)
             on delete cascade not null,
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

create policy "Inviters can manage their invites"
  on team_invites for all
  using (inviter_id = auth.uid())
  with check (inviter_id = auth.uid());

create policy "Anyone can read invite by token"
  on team_invites for select
  using (true);

create policy "Invitee can update their invite"
  on team_invites for update
  using (true);

-- ── INDEXES ───────────────────────────────────
create index if not exists team_members_project_idx
  on team_members(project_id);
create index if not exists team_invites_project_idx
  on team_invites(project_id);
create index if not exists team_invites_token_idx
  on team_invites(token);
create index if not exists team_invites_email_idx
  on team_invites(invitee_email);
