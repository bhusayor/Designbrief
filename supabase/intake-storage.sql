-- ────────────────────────────────────────────────────────────────────
-- intake-storage.sql — Final polish for the Client Intake Form.
--
-- Replaces data-URL file uploads with real Supabase Storage. The
-- public intake form is anonymous (no auth session), so the bucket
-- has to accept anon writes; we keep the blast radius small with:
--   1. a file-size cap (10 MB enforced at the bucket)
--   2. an allow-list of safe mime types
--   3. a public read policy (uploads land at unguessable paths
--      seeded with the form id + a random suffix)
--
-- Safe to run more than once.
-- ────────────────────────────────────────────────────────────────────

-- ── Bucket ────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'intake-uploads',
  'intake-uploads',
  true,
  10485760,   -- 10 MB
  array[
    'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif',
    'application/pdf'
  ]
)
on conflict (id) do update set
  public               = excluded.public,
  file_size_limit      = excluded.file_size_limit,
  allowed_mime_types   = excluded.allowed_mime_types;

-- ── Policies ──────────────────────────────────────────────────────
-- Anyone (including anon) can insert into intake-uploads. The
-- bucket-level mime + size caps above are the actual gatekeepers.
drop policy if exists "Anyone can upload to intake-uploads" on storage.objects;
create policy "Anyone can upload to intake-uploads"
  on storage.objects for insert
  to public
  with check (bucket_id = 'intake-uploads');

-- Anyone can read intake-uploads. Files live at unguessable paths
-- (form_id / timestamp-random-filename) and are only useful to the
-- designer who already has access to the submission row.
drop policy if exists "Anyone can read intake-uploads" on storage.objects;
create policy "Anyone can read intake-uploads"
  on storage.objects for select
  to public
  using (bucket_id = 'intake-uploads');
