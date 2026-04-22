-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ── PROFILES ──────────────────────────────────
create table if not exists profiles (
  id uuid references auth.users(id)
     on delete cascade primary key,
  email text unique not null,
  full_name text,
  first_name text,
  plan text default 'free',
  avatar_url text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table profiles enable row level security;

create policy "Users can view own profile"
  on profiles for select
  using (auth.uid() = id);

create policy "Users can update own profile"
  on profiles for update
  using (auth.uid() = id);

create policy "Users can insert own profile"
  on profiles for insert
  with check (auth.uid() = id);

-- ── PROJECTS ──────────────────────────────────
create table if not exists projects (
  id text primary key,
  user_id uuid references auth.users(id)
          on delete cascade not null,
  title text not null default 'Untitled Project',
  section text default 'translator',
  brief_text text,
  scoring jsonb,
  result jsonb,
  team_members jsonb default '[]',
  kanban jsonb,
  approval_status jsonb default '{}',
  comments jsonb default '{}',
  locked boolean default false,
  pinned boolean default false,
  share_id text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table projects enable row level security;

create policy "Users can manage own projects"
  on projects for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── INTAKE FORMS ──────────────────────────────
create table if not exists intake_forms (
  id text primary key,
  user_id uuid references auth.users(id)
          on delete cascade not null,
  project_name text not null,
  project_type text,
  sections jsonb default '[]',
  status text default 'pending',
  created_at timestamptz default now()
);

alter table intake_forms enable row level security;

create policy "Users can manage own intake forms"
  on intake_forms for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Public read for client intake page
create policy "Anyone can read intake forms by id"
  on intake_forms for select
  using (true);

-- ── INTAKE SUBMISSIONS ────────────────────────
create table if not exists intake_submissions (
  id text primary key,
  intake_form_id text references intake_forms(id)
                      on delete cascade,
  answers jsonb default '{}',
  mood_urls text,
  brief_text text,
  scoring jsonb,
  result jsonb,
  submitted_at timestamptz default now()
);

alter table intake_submissions enable row level security;

create policy "Anyone can insert intake submissions"
  on intake_submissions for insert
  with check (true);

create policy "Form owners can read submissions"
  on intake_submissions for select
  using (
    intake_form_id in (
      select id from intake_forms
      where user_id = auth.uid()
    )
  );

-- ── FUNCTION: auto-create profile on signup ───
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into profiles (id, email, full_name, first_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(
      split_part(
        coalesce(new.raw_user_meta_data->>'full_name', ''),
        ' ', 1
      ),
      ''
    )
  );
  return new;
end;
$$ language plpgsql security definer;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- ── INDEXES ───────────────────────────────────
create index if not exists projects_user_id_idx
  on projects(user_id);
create index if not exists projects_updated_at_idx
  on projects(updated_at desc);
create index if not exists intake_forms_user_id_idx
  on intake_forms(user_id);
