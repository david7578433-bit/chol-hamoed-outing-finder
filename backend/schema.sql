-- Outing Finder: "Add your place" + "Advertise" backend.
-- Run once in a NEW, separate Supabase project (SQL Editor -> paste -> Run).
-- Then: insert into public.admins(email) values ('YOUR-ADMIN-EMAIL');

create extension if not exists pgcrypto;

-- ---------- who is admin ----------
create table if not exists public.admins (
  email text primary key check (email = lower(email))
);
alter table public.admins enable row level security;   -- no policies: nobody reads it over the API

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.admins
    where email = lower(coalesce(auth.jwt() ->> 'email', ''))
  ) and coalesce((auth.jwt() ->> 'role'), '') = 'authenticated';
$$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

-- ---------- submissions (private) ----------
-- type 'sponsor' = an "Advertise with us" request (always reviewed by admin).
create table if not exists public.listings_pending (
  id             uuid primary key default gen_random_uuid(),
  created_at     timestamptz not null default now(),
  type           text not null check (type in ('hotel','shul','restaurant','mikvah_men','mikvah_women','chabad','car_service','sponsor')),
  name           text not null check (char_length(name) between 2 and 120),
  city_id        text not null check (char_length(city_id) between 2 and 60),
  address        text check (char_length(address) <= 200),
  phone          text check (char_length(phone) <= 40),
  website        text check (website is null or (website ~* '^https?://' and char_length(website) <= 300)),
  contact_email  text not null check (contact_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(contact_email) <= 200),
  description    text check (char_length(description) <= 600),
  minyan_times   text check (char_length(minyan_times) <= 400),
  kashrus        text check (char_length(kashrus) <= 120),
  -- set by the verify-listing function / admin only:
  status         text not null default 'pending' check (status in ('pending','awaiting_email','approved','rejected')),
  checks         jsonb not null default '{}'::jsonb,          -- every check and its result
  failed_checks  jsonb not null default '[]'::jsonb,          -- [{check, note}] shown to admin
  email_confirmed_at timestamptz,
  checked_at     timestamptz,
  decided_at     timestamptz,
  live_id        uuid,
  -- women's mikvah: never store a street address
  constraint no_address_womens_mikvah check (type <> 'mikvah_women' or address is null)
);
create index if not exists listings_pending_status_idx on public.listings_pending(status, created_at desc);
create index if not exists listings_pending_email_idx on public.listings_pending(lower(contact_email), created_at desc);
alter table public.listings_pending enable row level security;

-- ---------- published listings (public) ----------
create table if not exists public.listings_live (
  id            uuid primary key default gen_random_uuid(),
  pending_id    uuid unique references public.listings_pending(id) on delete set null,
  created_at    timestamptz not null default now(),
  type          text not null check (type in ('hotel','shul','restaurant','mikvah_men','mikvah_women','chabad','car_service')),
  name          text not null,
  city_id       text not null,
  address       text,
  phone         text,
  website       text,
  description   text,
  minyan_times  text,
  kashrus       text,
  verified      boolean not null default false,
  verified_at   date,
  verified_by   text check (verified_by in ('auto_website_email','auto_godaven','admin')),
  constraint live_no_address_womens_mikvah check (type <> 'mikvah_women' or address is null)
);
create index if not exists listings_live_city_idx on public.listings_live(city_id, type);
alter table public.listings_live enable row level security;

-- ---------- sponsors (public when active) ----------
create table if not exists public.sponsors (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  name        text not null check (char_length(name) between 1 and 120),
  city_id     text not null default 'all',              -- a city id, or 'all'
  text        text not null check (char_length(text) between 1 and 120),
  url         text check (url is null or url ~* '^https?://'),
  active      boolean not null default false,
  start_date  date,
  end_date    date,
  request_id  uuid references public.listings_pending(id) on delete set null,
  check (end_date is null or start_date is null or end_date >= start_date)
);
alter table public.sponsors enable row level security;

-- ---------- one-time email confirmation tokens (private) ----------
create table if not exists public.email_confirmations (
  token_hash  text primary key,                          -- sha256 hex of the token in the link
  pending_id  uuid not null references public.listings_pending(id) on delete cascade,
  email       text not null,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '48 hours',
  used_at     timestamptz
);
alter table public.email_confirmations enable row level security;   -- no policies: service role only

-- ---------- grants: anon can only INSERT the submitter's own fields ----------
revoke all on public.listings_pending, public.listings_live, public.sponsors, public.email_confirmations, public.admins from anon, authenticated;

grant insert (type, name, city_id, address, phone, website, contact_email, description, minyan_times, kashrus)
  on public.listings_pending to anon, authenticated;
grant select (id, type, name, city_id, address, phone, website, description, minyan_times, kashrus, verified, verified_at)
  on public.listings_live to anon;
grant select (name, city_id, text, url, active, start_date, end_date) on public.sponsors to anon;

-- admin (authenticated + is_admin()) gets full table rights; RLS below gates them
grant select, insert, update, delete on public.listings_pending, public.listings_live, public.sponsors to authenticated;

-- ---------- RLS policies ----------
drop policy if exists "public submit" on public.listings_pending;
create policy "public submit" on public.listings_pending for insert to anon, authenticated
  with check (status = 'pending' and checks = '{}'::jsonb and failed_checks = '[]'::jsonb
              and email_confirmed_at is null and live_id is null);

drop policy if exists "admin all pending" on public.listings_pending;
create policy "admin all pending" on public.listings_pending for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "public read live" on public.listings_live;
create policy "public read live" on public.listings_live for select to anon, authenticated using (true);

drop policy if exists "admin all live" on public.listings_live;
create policy "admin all live" on public.listings_live for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "public read active sponsors" on public.sponsors;
create policy "public read active sponsors" on public.sponsors for select to anon
  using (active and (start_date is null or start_date <= current_date) and (end_date is null or end_date >= current_date));

drop policy if exists "admin all sponsors" on public.sponsors;
create policy "admin all sponsors" on public.sponsors for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------- publish: one atomic step, used by admin (Approve) and by the function ----------
create or replace function public.publish_listing(p_id uuid, p_by text default 'admin')
returns uuid language plpgsql security definer set search_path = public as $$
declare r public.listings_pending; new_id uuid;
begin
  if not (public.is_admin() or coalesce(auth.jwt() ->> 'role', '') = 'service_role') then
    raise exception 'not allowed';
  end if;
  if p_by not in ('admin','auto_website_email','auto_godaven') then raise exception 'bad p_by'; end if;
  select * into r from public.listings_pending where id = p_id for update;
  if not found then raise exception 'not found'; end if;
  if r.type = 'sponsor' then raise exception 'sponsor requests are added under Sponsors'; end if;
  if r.type = 'mikvah_women' and p_by <> 'admin' then raise exception 'women''s mikvah needs admin'; end if;
  if r.live_id is not null then return r.live_id; end if;
  insert into public.listings_live (pending_id, type, name, city_id, address, phone, website, description,
                                    minyan_times, kashrus, verified, verified_at, verified_by)
  values (r.id, r.type, r.name, r.city_id,
          case when r.type = 'mikvah_women' then null else r.address end,
          r.phone, r.website, r.description,
          case when r.type = 'shul' then r.minyan_times end,
          case when r.type = 'restaurant' then r.kashrus end,
          true, current_date, p_by)
  returning id into new_id;
  update public.listings_pending set status = 'approved', decided_at = now(), live_id = new_id where id = r.id;
  return new_id;
end $$;
revoke all on function public.publish_listing(uuid, text) from public, anon;
grant execute on function public.publish_listing(uuid, text) to authenticated, service_role;
