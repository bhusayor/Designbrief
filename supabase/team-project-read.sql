-- Allow team members to SELECT projects they have been invited to.
-- The existing "Users can manage own projects" policy only allows the project
-- owner (user_id = auth.uid()) to read. Without this, invited collaborators
-- cannot read the project data, load tasks, or appear in TeamCollab.
--
-- Run this once in the Supabase SQL editor:
-- https://supabase.com/dashboard/project/xsqpkratkxaaqxgaigrk/sql/new
--
create policy "Team members can view invited projects"
  on projects for select
  using (
    id in (
      select project_id from team_members
      where user_id = auth.uid()
        and status = 'active'
    )
  );
