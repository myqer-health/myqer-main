-- MYQER Schema with updated_at fix

-- Profiles (1:1 with auth.users)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  date_of_birth date,
  country text,
  locale text default 'en',
  time_zone text,
  plan_tier text default 'ESSENTIAL',
  updated_at timestamptz default now()
);

-- Health profiles
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

-- ICE contacts
create table if not exists public.ice_contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade,
  name text,
  relation text,
  phone text,
  alt_phone text,
  notes text,
  is_primary bool default true,
  unique(user_id, is_primary) where is_primary = true
);

-- QR codes
create table if not exists public.qr_codes (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  short_code text unique not null,
  active bool default true,
  last_regenerated_at timestamptz,
  scan_ttl_seconds int default 300
);

-- TTS assets
create table if not exists public.tts_assets (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  lang text,
  status text,
  asset_path text,
  last_build_at timestamptz,
  error text
);

-- Access logs
create table if not exists public.access_logs (
  id bigserial primary key,
  user_id uuid,
  kind text,
  context jsonb,
  created_at timestamptz default now()
);

-- Orgs
create table if not exists public.orgs (
  id uuid primary key default gen_random_uuid(),
  name text,
  country text,
  created_by uuid references public.profiles(id),
  created_at timestamptz default now()
);

create table if not exists public.org_members (
  org_id uuid references public.orgs(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  role text check (role in ('admin','clinician')),
  primary key (org_id, user_id)
);

create table if not exists public.org_patients (
  org_id uuid references public.orgs(id) on delete cascade,
  patient_id uuid references public.profiles(id) on delete cascade,
  consent bool default false,
  granted_at timestamptz default now(),
  primary key (org_id, patient_id)
);

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

-- Profiles: each user can manage only their own
drop policy if exists "profiles_self" on public.profiles;
create policy "profiles_self" on public.profiles
  for all using (id = auth.uid());

-- Health profiles: only owner
drop policy if exists "health_self" on public.health_profiles;
create policy "health_self" on public.health_profiles
  for all using (user_id = auth.uid());

-- ICE contacts
drop policy if exists "ice_self" on public.ice_contacts;
create policy "ice_self" on public.ice_contacts
  for all using (user_id = auth.uid());

-- QR codes
drop policy if exists "qr_self" on public.qr_codes;
create policy "qr_self" on public.qr_codes
  for all using (user_id = auth.uid());

-- TTS assets
drop policy if exists "tts_self" on public.tts_assets;
create policy "tts_self" on public.tts_assets
  for all using (user_id = auth.uid());

-- Access logs (only service role can insert)
drop policy if exists "access_logs_insert" on public.access_logs;
create policy "access_logs_insert" on public.access_logs
  for insert to service_role using (true);

-- Orgs & members
drop policy if exists "orgs_self" on public.orgs;
create policy "orgs_self" on public.orgs
  for all using (created_by = auth.uid());

drop policy if exists "org_members_self" on public.org_members;
create policy "org_members_self" on public.org_members
  for all using (user_id = auth.uid());

drop policy if exists "org_patients_access" on public.org_patients;
create policy "org_patients_access" on public.org_patients
  for select using (
    exists(select 1 from public.org_members m where m.org_id = org_id and m.user_id = auth.uid())
  );

-- Indexes
create index if not exists idx_profiles_updated_at
on public.profiles(updated_at desc);
