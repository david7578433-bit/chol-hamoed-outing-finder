-- Run this once in Supabase: Dashboard -> SQL Editor -> New query -> paste -> Run.
-- It creates the table the daily checker writes to and the website reads from.

create table if not exists public.checks (
  place_id   integer primary key,
  checked_at timestamptz not null default now(),
  url        text,
  site_hours text not null default '',
  site_price text not null default '',
  hours      text not null default 'not_found' check (hours in ('same', 'different', 'not_found')),
  price      text not null default 'not_found' check (price in ('same', 'different', 'not_found')),
  note       text not null default ''
);

alter table public.checks enable row level security;

-- Anyone visiting the website may read the results; only the checker (service key) can write.
drop policy if exists "Anyone can read checks" on public.checks;
create policy "Anyone can read checks" on public.checks for select to anon, authenticated using (true);
