-- =========================
-- MYQER SCHEMA (consolidated)
-- =========================

-- PROFILES (1:1 with auth.users)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  date_of_birth date,
  country text,
  locale text default 'en',
  time_zone text,
  plan_tier text default 'ESSENTIAL',
  triage_override text,
  triage_auto text,
  updated_at timestamptz default now()
);
alter table public.profiles enable row level security;

-- HEALTH PROFILES (owner-scoped)
create table if not exists public.health_profiles (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  allergies text,
  conditions text,
  meds text,
  blood_type text,
  organ_donor bool,
  life_support_pref text,
  resuscitation text,
  care_notes text,
  show_allergies bool default true,
  show_conditions bool default true,
  show_meds bool default true,
  show_ice bool default true,
  show_blood bool default true,
  show_prefs bool default true,
  show_notes bool default false,
  updated_at timestamptz default now()
);
alter table public.health_profiles enable row level security;

-- ICE CONTACTS (owner-scoped)
create table if not exists public.ice_contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade,
  name text,
  relation text,
  phone text,
  alt_phone text,
  notes text,
  is_primary bool default true
);
alter table public.ice_contacts enable row level security;

-- one primary ICE per user (partial unique index)
drop index if exists public.uniq_primary_ice_contact;
create unique index if not exists uniq_primary_ice_contact
  on public.ice_contacts(user_id)
  where (is_primary);

-- QR CODES (owner-scoped)
create table if not exists public.qr_codes (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  short_code text unique not null,
  active bool default true,
  last_regenerated_at timestamptz,
  scan_ttl_seconds int default 300
);
alter table public.qr_codes enable row level security;

-- TTS ASSETS (owner-scoped)
create table if not exists public.tts_assets (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  lang text,
  status text,         -- pending | ready | error
  asset_path text,
  last_build_at timestamptz,
  error text
);
alter table public.tts_assets enable row level security;

-- ACCESS LOGS (service role inserts only)
create table if not exists public.access_logs (
  id bigserial primary key,
  user_id uuid,
  kind text,           -- responder|dispatch|qr_regen|tts_build
  context jsonb,
  created_at timestamptz default now()
);
alter table public.access_logs enable row level security;

-- ORGS (MYQER+)
create table if not exists public.orgs (
  id uuid primary key default gen_random_uuid(),
  name text,
  country text,
  created_by uuid references public.profiles(id),
  created_at timestamptz default now()
);
alter table public.orgs enable row level security;

create table if not exists public.org_members (
  org_id uuid references public.orgs(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  role text check (role in ('admin','clinician')),
  primary key (org_id, user_id)
);
alter table public.org_members enable row level security;

create table if not exists public.org_patients (
  org_id uuid references public.orgs(id) on delete cascade,
  patient_id uuid references public.profiles(id) on delete cascade,
  consent bool default false,
  granted_at timestamptz default now(),
  primary key (org_id, patient_id)
);
alter table public.org_patients enable row level security;

-- ===============
-- RLS POLICIES
-- ===============

-- PROFILES (granular policies)
drop policy if exists profiles_select on public.profiles;
drop policy if exists profiles_update on public.profiles;
drop policy if exists profiles_insert on public.profiles;
drop policy if exists profiles_delete on public.profiles;

create policy profiles_select on public.profiles
  for select using (id = auth.uid());
create policy profiles_update on public.profiles
  for update using (id = auth.uid());
create policy profiles_insert on public.profiles
  for insert with check (id = auth.uid());
create policy profiles_delete on public.profiles
  for delete using (id = auth.uid());

-- HEALTH
drop policy if exists health_select on public.health_profiles;
drop policy if exists health_update on public.health_profiles;
drop policy if exists health_insert on public.health_profiles;
drop policy if exists health_delete on public.health_profiles;

create policy health_select on public.health_profiles
  for select using (user_id = auth.uid());
create policy health_update on public.health_profiles
  for update using (user_id = auth.uid());
create policy health_insert on public.health_profiles
  for insert with check (user_id = auth.uid());
create policy health_delete on public.health_profiles
  for delete using (user_id = auth.uid());

-- ICE
drop policy if exists ice_select on public.ice_contacts;
drop policy if exists ice_update on public.ice_contacts;
drop policy if exists ice_insert on public.ice_contacts;
drop policy if exists ice_delete on public.ice_contacts;

create policy ice_select on public.ice_contacts
  for select using (user_id = auth.uid());
create policy ice_update on public.ice_contacts
  for update using (user_id = auth.uid());
create policy ice_insert on public.ice_contacts
  for insert with check (user_id = auth.uid());
create policy ice_delete on public.ice_contacts
  for delete using (user_id = auth.uid());

-- QR
drop policy if exists qr_select on public.qr_codes;
drop policy if exists qr_update on public.qr_codes;
drop policy if exists qr_insert on public.qr_codes;
drop policy if exists qr_delete on public.qr_codes;

create policy qr_select on public.qr_codes
  for select using (user_id = auth.uid());
create policy qr_update on public.qr_codes
  for update using (user_id = auth.uid());
create policy qr_insert on public.qr_codes
  for insert with check (user_id = auth.uid());
create policy qr_delete on public.qr_codes
  for delete using (user_id = auth.uid());

-- TTS
drop policy if exists tts_select on public.tts_assets;
drop policy if exists tts_update on public.tts_assets;
drop policy if exists tts_insert on public.tts_assets;
drop policy if exists tts_delete on public.tts_assets;

create policy tts_select on public.tts_assets
  for select using (user_id = auth.uid());
create policy tts_update on public.tts_assets
  for update using (user_id = auth.uid());
create policy tts_insert on public.tts_assets
  for insert with check (user_id = auth.uid());
create policy tts_delete on public.tts_assets
  for delete using (user_id = auth.uid());

-- ACCESS LOGS (service-role only insert; readable by owner if you want, here: none)
drop policy if exists access_logs_insert on public.access_logs;
create policy access_logs_insert on public.access_logs
  for insert to service_role using (true);

-- ORGS (basic gating; you can extend later)
drop policy if exists orgs_self on public.orgs;
create policy orgs_self on public.orgs
  for all using (created_by = auth.uid());

drop policy if exists org_members_self on public.org_members;
create policy org_members_self on public.org_members
  for all using (user_id = auth.uid());

drop policy if exists org_patients_access on public.org_patients;
create policy org_patients_access on public.org_patients
  for select using (
    exists(select 1 from public.org_members m where m.org_id = org_id and m.user_id = auth.uid())
  );

-- Useful index
create index if not exists idx_profiles_updated_at
  on public.profiles(updated_at desc);
