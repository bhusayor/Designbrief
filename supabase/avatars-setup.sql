-- ─────────────────────────────────────────────────────────────────────
-- AVATARS STORAGE BUCKET — one-shot setup
-- ─────────────────────────────────────────────────────────────────────
-- Run once in Supabase → SQL Editor. Safe to re-run.
-- Creates a public-read 'avatars' bucket and policies that let an
-- authenticated user upload / update / delete files inside their own
-- folder (user-id/<filename>). Everyone can read so the avatar URL
-- works in <img> tags on every device.
-- ─────────────────────────────────────────────────────────────────────

-- 1. Create the bucket (id=name=avatars, public read enabled)
insert into storage.buckets (id, name, public)
  values ('avatars', 'avatars', true)
  on conflict (id) do update set public = true;

-- 2. Policies. Drop legacy first so re-run is idempotent.
drop policy if exists "avatars_public_read" on storage.objects;
drop policy if exists "avatars_self_insert" on storage.objects;
drop policy if exists "avatars_self_update" on storage.objects;
drop policy if exists "avatars_self_delete" on storage.objects;

-- Anyone (including unauthenticated visitors of a shared invite link)
-- can read avatars — they're meant to be displayed publicly.
create policy "avatars_public_read"
  on storage.objects for select
  using (bucket_id = 'avatars');

-- An authenticated user can upload to their OWN folder only.
-- Path convention: <auth.uid()>/<anything>.<ext>
create policy "avatars_self_insert"
  on storage.objects for insert
  with check (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "avatars_self_update"
  on storage.objects for update
  using (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  )
  with check (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "avatars_self_delete"
  on storage.objects for delete
  using (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
