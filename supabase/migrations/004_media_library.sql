-- Image library: card images stored as files in Supabase Storage (bucket "media"),
-- with one row per image in public.media. Run once in Supabase Dashboard -> SQL Editor.

-- Public bucket: card images are greetings, not private data, and public links let
-- WhatsApp and the browser load them directly. 5 MB per file, images only.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create table if not exists public.media (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  path        text not null unique,      -- object path inside the "media" bucket
  url         text not null,             -- public URL
  width       integer,
  height      integer,
  bytes       integer,
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists media_created_idx on public.media (created_at desc);

alter table public.media enable row level security;

drop policy if exists "media: read" on public.media;
create policy "media: read" on public.media
  for select using (public.is_active_user());

drop policy if exists "media: add" on public.media;
create policy "media: add" on public.media
  for insert with check (public.is_active_user() and created_by = auth.uid());

drop policy if exists "media: manager edit" on public.media;
create policy "media: manager edit" on public.media
  for update using (public.can_manage()) with check (public.can_manage());

drop policy if exists "media: manager delete" on public.media;
create policy "media: manager delete" on public.media
  for delete using (public.can_manage());

-- Storage permissions for the bucket
drop policy if exists "media files: read" on storage.objects;
create policy "media files: read" on storage.objects
  for select using (bucket_id = 'media');

drop policy if exists "media files: upload" on storage.objects;
create policy "media files: upload" on storage.objects
  for insert to authenticated with check (bucket_id = 'media' and public.is_active_user());

drop policy if exists "media files: manager delete" on storage.objects;
create policy "media files: manager delete" on storage.objects
  for delete to authenticated using (bucket_id = 'media' and public.can_manage());

-- Note: templates.image_base64 and campaigns.image_base64 now hold either an old
-- base64 data URL or a Storage URL; the app handles both.
