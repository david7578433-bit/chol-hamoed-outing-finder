-- Feedback & help inbox for the website.
-- Visitors can only ADD feedback (and upload one picture with it). Nobody can read, change or delete it
-- through the website; the project owner reads it in the Supabase dashboard (Table editor -> feedback,
-- Storage -> feedback). Run once in the SQL editor.

create table if not exists public.feedback (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  kind        text not null check (kind in ('problem', 'idea', 'question')),
  message     text not null check (char_length(message) between 3 and 4000),
  contact     text check (char_length(contact) <= 200),
  place_id    integer,
  place_name  text check (char_length(place_name) <= 200),
  view        text check (char_length(view) <= 40),
  page_url    text check (char_length(page_url) <= 500),
  screen      text check (char_length(screen) <= 60),
  agent       text check (char_length(agent) <= 400),
  shot_path   text check (char_length(shot_path) <= 200),
  status      text not null default 'new' check (status in ('new', 'reviewed', 'fixed', 'wont_fix'))
);

alter table public.feedback enable row level security;

drop policy if exists "Visitors can send feedback" on public.feedback;
create policy "Visitors can send feedback" on public.feedback
  for insert to anon, authenticated
  with check (status = 'new');
-- No select / update / delete policies: only the dashboard (project owner) can read feedback.

-- Private bucket for the page pictures (3 MB max, images only).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('feedback', 'feedback', false, 3145728, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Visitors can upload a feedback picture" on storage.objects;
create policy "Visitors can upload a feedback picture" on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'feedback');
