-- ────────────────────────────────────────────────────────────────────
-- Scope projects + intake forms to a workspace so a freshly-created
-- workspace starts empty. Existing rows are backfilled to the owner's
-- earliest workspace.
-- ────────────────────────────────────────────────────────────────────

-- 1. Add nullable workspace_id columns
alter table projects     add column if not exists workspace_id uuid references workspaces(id) on delete cascade;
alter table intake_forms add column if not exists workspace_id uuid references workspaces(id) on delete cascade;

-- 2. Backfill: every existing project / intake gets pinned to its owner's
--    earliest workspace. New rows after this point must set workspace_id
--    explicitly (the API + client are updated to do so).
update projects p
   set workspace_id = w.id
  from (
    select distinct on (owner_id) id, owner_id
      from workspaces
     order by owner_id, created_at asc
  ) w
 where p.workspace_id is null
   and p.user_id = w.owner_id;

update intake_forms i
   set workspace_id = w.id
  from (
    select distinct on (owner_id) id, owner_id
      from workspaces
     order by owner_id, created_at asc
  ) w
 where i.workspace_id is null
   and i.user_id = w.owner_id;

-- 3. Indexes for the new lookup path
create index if not exists projects_workspace_idx     on projects(workspace_id);
create index if not exists intake_forms_workspace_idx on intake_forms(workspace_id);
