-- ────────────────────────────────────────────────────────────────────
-- Phase 2: AI Builder — generate websites section-by-section from a
-- project's kanban TODO tasks with human approval, then publish to a
-- live subdomain.
--
-- One ai_builds row per (project, attempt). Each row owns N
-- build_sections (one per task) so we can stream-build, approve,
-- request changes, and resume from anywhere in the queue.
-- ────────────────────────────────────────────────────────────────────

create table if not exists ai_builds (
  id            uuid primary key default gen_random_uuid(),
  project_id    text references projects(id) on delete cascade,
  workspace_id  uuid,
  user_id       uuid references auth.users(id),
  status        text default 'idle',         -- idle | running | paused | complete
  build_mode    text default 'task_by_task', -- task_by_task | build_all
  current_task  integer default 0,
  slug          text unique,
  published_url text,
  published_at  timestamptz,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

create table if not exists build_sections (
  id             uuid primary key default gen_random_uuid(),
  build_id       uuid references ai_builds(id) on delete cascade,
  -- tasks.id is text in this schema (see supabase/schema.sql)
  task_id        text references tasks(id) on delete set null,
  task_title     text not null,
  position       integer not null,
  status         text default 'queued',      -- queued | building | review | changes | approved | skipped
  generated_code text,
  approved_code  text,
  change_request text,
  built_at       timestamptz,
  approved_at    timestamptz,
  approved_by    uuid references auth.users(id),
  created_at     timestamptz default now()
);

create index if not exists ai_builds_project_idx       on ai_builds(project_id);
create index if not exists ai_builds_status_idx        on ai_builds(status);
create index if not exists build_sections_build_idx    on build_sections(build_id, position);
create index if not exists build_sections_task_idx     on build_sections(task_id);

-- ── RLS ─────────────────────────────────────────────────────────────
alter table ai_builds      enable row level security;
alter table build_sections enable row level security;

drop policy if exists "Users manage own builds"    on ai_builds;
drop policy if exists "Users manage own sections"  on build_sections;

create policy "Users manage own builds"
  on ai_builds for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Users manage own sections"
  on build_sections for all
  using (build_id in (select id from ai_builds where user_id = auth.uid()))
  with check (build_id in (select id from ai_builds where user_id = auth.uid()));

-- ── Realtime ────────────────────────────────────────────────────────
alter table ai_builds      replica identity full;
alter table build_sections replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'ai_builds'
  ) then
    alter publication supabase_realtime add table ai_builds;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'build_sections'
  ) then
    alter publication supabase_realtime add table build_sections;
  end if;
end $$;

-- ── Trigger: keep ai_builds.updated_at fresh ────────────────────────
create or replace function ai_builds_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists ai_builds_touch_trigger on ai_builds;
create trigger ai_builds_touch_trigger
  before update on ai_builds
  for each row execute function ai_builds_touch();
