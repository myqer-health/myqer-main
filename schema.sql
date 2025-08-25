
-- MYQER schema.sql
-- Supabase Postgres schema, RLS policies, and helper triggers
-- Run with: supabase db reset --local OR psql via the SQL editor

create extension if not exists "pgcrypto";
create extension if not exists "uuid-ossp";

-- ENUMS
do $$ begin
  if not exists (select 1 from pg_type where typname = 'plan_tier') then
    create type plan_tier as enum ('ESSENTIAL','PLUS');
  end if;
end $$;

-- USERS / PROFILES
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  date_of_birth date,
  country text,
  locale text not null default 'en',
  time_zone text,
  plan plan_tier not null default 'ESSENTIAL',
  updated_at timestamptz not null default now()
);

-- HEALTH PROFILE
create table if not exists public.health_profiles (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  allergies text,
  conditions text,
  meds text,
  blood_type text,
  organ_donor boolean default false,
  life_support_pref text,           -- allow | limited | do_not
  resuscitation text,               -- allow | do_not | unknown
  care_notes text,
  show_allergies boolean default true,
  show_conditions boolean default true,
  show_meds boolean default true,
  show_ice boolean default true,
  show_blood boolean default true,
  show_prefs boolean default true,
  show_notes boolean default false,
  updated_at timestamptz not null default now()
);

-- ICE CONTACTS
create table if not exists public.ice_contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  relation text,
  phone text,
  alt_phone text,
  notes text,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists uniq_primary_ice_per_user on public.ice_contacts(user_id) where is_primary = true;

-- QR CODES
create table if not exists public.qr_codes (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  short_code text unique not null,
  active boolean not null default true,
  last_regenerated_at timestamptz,
  scan_ttl_seconds int not null default 300
);
create index if not exists idx_qr_short on public.qr_codes(short_code);

-- TTS ASSETS
create table if not exists public.tts_assets (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  lang text not null default 'en',
  status text not null default 'pending', -- pending | ready | error
  asset_path text,                        -- storage path voices/{user}/{lang}.mp3
  last_build_at timestamptz,
  error text
);

-- ACCESS LOGS (service role insert only)
create table if not exists public.access_logs (
  id bigserial primary key,
  user_id uuid,
  kind text not null,            -- responder | dispatch | qr_regen | tts_build
  context jsonb,
  created_at timestamptz not null default now()
);

-- MYQER+ ORGS
create table if not exists public.orgs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  country text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.org_members (
  org_id uuid references public.orgs(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  role text not null, -- admin | clinician
  primary key (org_id, user_id)
);

create table if not exists public.org_patients (
  org_id uuid references public.orgs(id) on delete cascade,
  patient_id uuid references public.profiles(id) on delete cascade,
  consent boolean not null default false,
  granted_at timestamptz,
  primary key (org_id, patient_id)
);

-- TRIGGERS
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_profiles_updated on public.profiles;
create trigger trg_profiles_updated before update on public.profiles
for each row execute procedure public.set_updated_at();

drop trigger if exists trg_health_updated on public.health_profiles;
create trigger trg_health_updated before update on public.health_profiles
for each row execute procedure public.set_updated_at();

drop trigger if exists trg_ice_updated on public.ice_contacts;
create trigger trg_ice_updated before update on public.ice_contacts
for each row execute procedure public.set_updated_at();

-- BOOTSTRAP NEW USER
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles(id, full_name, locale) values (new.id, coalesce(new.raw_user_meta_data->>'full_name',''), coalesce(new.raw_user_meta_data->>'locale','en'))
  on conflict (id) do nothing;

  insert into public.health_profiles(user_id) values (new.id)
  on conflict (user_id) do nothing;

  insert into public.qr_codes(user_id, short_code) values (new.id, substr(encode(digest(gen_random_uuid()::text, 'sha256'),'base64'),1,8))
  on conflict (user_id) do nothing;

  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

-- RLS
alter table public.profiles enable row level security;
alter table public.health_profiles enable row level security;
alter table public.ice_contacts enable row level security;
alter table public.qr_codes enable row level security;
alter table public.tts_assets enable row level security;
alter table public.access_logs enable row level security;
alter table public.orgs enable row level security;
alter table public.org_members enable row level security;
alter table public.org_patients enable row level security;

-- Profiles: owner only
drop policy if exists "profiles_owner_rw" on public.profiles;
create policy "profiles_owner_rw" on public.profiles
  for all using (id = auth.uid()) with check (id = auth.uid());

-- Health: owner only
drop policy if exists "health_owner_rw" on public.health_profiles;
create policy "health_owner_rw" on public.health_profiles
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ICE: owner only
drop policy if exists "ice_owner_rw" on public.ice_contacts;
create policy "ice_owner_rw" on public.ice_contacts
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- QR: owner read/write (functions will use service key for admin ops as needed)
drop policy if exists "qr_owner_rw" on public.qr_codes;
create policy "qr_owner_rw" on public.qr_codes
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- TTS: owner rw
drop policy if exists "tts_owner_rw" on public.tts_assets;
create policy "tts_owner_rw" on public.tts_assets
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- access_logs: no direct access; only service role inserts
drop policy if exists "access_logs_none" on public.access_logs;
create policy "access_logs_none" on public.access_logs for select to authenticated using (false);
create policy "access_logs_insert_service" on public.access_logs for insert to service_role with check (true);

-- ORGS
drop policy if exists "orgs_member_read" on public.orgs;
create policy "orgs_member_read" on public.orgs
  for select using (exists(select 1 from public.org_members m where m.org_id = id and m.user_id = auth.uid()));

drop policy if exists "orgs_admin_write" on public.orgs;
create policy "orgs_admin_write" on public.orgs
  for all using (exists(select 1 from public.org_members m where m.org_id = id and m.user_id = auth.uid() and m.role='admin'))
  with check (exists(select 1 from public.org_members m where m.org_id = id and m.user_id = auth.uid() and m.role='admin'));

drop policy if exists "org_members_self" on public.org_members;
create policy "org_members_self" on public.org_members
  for all using (user_id = auth.uid() or exists(select 1 from public.org_members m where m.org_id = org_id and m.user_id = auth.uid() and m.role='admin'))
  with check (user_id = auth.uid() or exists(select 1 from public.org_members m where m.org_id = org_id and m.user_id = auth.uid() and m.role='admin'));

drop policy if exists "org_patients_access" on public.org_patients;
create policy "org_patients_access" on public.org_patients
  for select using (exists(select 1 from public.org_members m where m.org_id = org_id and m.user_id = auth.uid()))
  ;

-- Indexes
create index if not exists idx_profiles_updated_at on public.profiles(updated_at desc);
