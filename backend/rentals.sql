-- Outing Finder: "Rentals / Dira" backend.
-- Run once in the SAME Supabase project as backend/schema.sql, AFTER schema.sql
-- (it uses public.admins and public.is_admin() from there). SQL Editor -> paste -> Run.
-- Adds 2 tables (rentals_pending, rentals_live) and 1 function (publish_rental). Touches nothing else.
-- Every submission waits for the admin. Nothing goes live by itself.

-- ---------- submissions from landlords / brokers (private) ----------
create table if not exists public.rentals_pending (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),
  title           text not null check (char_length(title) between 3 and 120),
  town            text not null check (town in ('monroe_kj','williamsburg','monsey','boro_park','lakewood','catskills','other')),
  kind            text not null check (kind in ('yomtov','bungalow','apt_rent','house_sale')),
  beds            smallint check (beds between 0 and 20),
  price           integer check (price between 0 and 50000000),          -- whole dollars
  price_per       text check (price_per in ('night','week','month','season','yomtov','total')),
  date_from       date,
  date_to         date,
  near_shul       text check (char_length(near_shul) <= 160),
  description     text check (char_length(description) <= 1200),
  contact_name    text check (char_length(contact_name) <= 80),
  contact_phone   text check (char_length(contact_phone) <= 40),
  contact_email   text check (contact_email is null or (contact_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(contact_email) <= 200)),
  photo_url       text check (photo_url is null or (photo_url ~* '^https://' and char_length(photo_url) <= 400)),
  wants_featured  boolean not null default false,                        -- "I'm interested in a featured spot"
  -- set by the admin only:
  status          text not null default 'pending' check (status in ('pending','approved','rejected')),
  decided_at      timestamptz,
  live_id         uuid,
  constraint rentals_pending_contact check (contact_phone is not null or contact_email is not null),
  constraint rentals_pending_dates check (date_to is null or date_from is null or date_to >= date_from)
);
create index if not exists rentals_pending_status_idx on public.rentals_pending(status, created_at desc);
alter table public.rentals_pending enable row level security;

-- ---------- approved rentals (public) ----------
create table if not exists public.rentals_live (
  id              uuid primary key default gen_random_uuid(),
  pending_id      uuid unique references public.rentals_pending(id) on delete set null,
  created_at      timestamptz not null default now(),
  title           text not null check (char_length(title) between 3 and 120),
  town            text not null check (town in ('monroe_kj','williamsburg','monsey','boro_park','lakewood','catskills','other')),
  kind            text not null check (kind in ('yomtov','bungalow','apt_rent','house_sale')),
  beds            smallint check (beds between 0 and 20),
  price           integer check (price between 0 and 50000000),
  price_per       text check (price_per in ('night','week','month','season','yomtov','total')),
  date_from       date,
  date_to         date,
  near_shul       text,
  description     text,
  contact_name    text,
  contact_phone   text,
  contact_email   text,
  photo_url       text check (photo_url is null or photo_url ~* '^https://'),
  featured        boolean not null default false,                       -- admin only: shows first, with a badge
  featured_until  date,                                                 -- optional end date for a featured spot
  constraint rentals_live_dates check (date_to is null or date_from is null or date_to >= date_from)
);
create index if not exists rentals_live_list_idx on public.rentals_live(featured desc, created_at desc);
alter table public.rentals_live enable row level security;

-- ---------- grants: anon can only INSERT the submitter's own fields, and READ live rentals ----------
revoke all on public.rentals_pending, public.rentals_live from anon, authenticated;

grant insert (title, town, kind, beds, price, price_per, date_from, date_to, near_shul, description,
              contact_name, contact_phone, contact_email, photo_url, wants_featured)
  on public.rentals_pending to anon, authenticated;
grant select (id, created_at, title, town, kind, beds, price, price_per, date_from, date_to, near_shul, description,
              contact_name, contact_phone, contact_email, photo_url, featured, featured_until)
  on public.rentals_live to anon;

-- admin (authenticated + is_admin()) gets full table rights; RLS below gates them
grant select, insert, update, delete on public.rentals_pending, public.rentals_live to authenticated;

-- ---------- RLS policies ----------
drop policy if exists "public submit rental" on public.rentals_pending;
create policy "public submit rental" on public.rentals_pending for insert to anon, authenticated
  with check (status = 'pending' and decided_at is null and live_id is null);

drop policy if exists "admin all rentals pending" on public.rentals_pending;
create policy "admin all rentals pending" on public.rentals_pending for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "public read live rentals" on public.rentals_live;
create policy "public read live rentals" on public.rentals_live for select to anon, authenticated using (true);

drop policy if exists "admin all rentals live" on public.rentals_live;
create policy "admin all rentals live" on public.rentals_live for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------- approve: one atomic step (admin "Approve" button) ----------
create or replace function public.publish_rental(p_id uuid, p_featured boolean default false)
returns uuid language plpgsql security definer set search_path = public as $$
declare r public.rentals_pending; new_id uuid;
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  select * into r from public.rentals_pending where id = p_id for update;
  if not found then raise exception 'not found'; end if;
  if r.live_id is not null then return r.live_id; end if;
  insert into public.rentals_live (pending_id, title, town, kind, beds, price, price_per, date_from, date_to, near_shul,
                                   description, contact_name, contact_phone, contact_email, photo_url, featured)
  values (r.id, r.title, r.town, r.kind, r.beds, r.price, r.price_per, r.date_from, r.date_to, r.near_shul,
          r.description, r.contact_name, r.contact_phone, r.contact_email, r.photo_url, coalesce(p_featured, false))
  returning id into new_id;
  update public.rentals_pending set status = 'approved', decided_at = now(), live_id = new_id where id = r.id;
  return new_id;
end $$;
revoke all on function public.publish_rental(uuid, boolean) from public, anon;
grant execute on function public.publish_rental(uuid, boolean) to authenticated;
