-- WishDesk database schema (v2: multi-occasion campaign platform)
-- Fresh install: run this whole file once in Supabase Dashboard -> SQL Editor,
-- then run every file in supabase/migrations/ in number order (003, 004, 005, ...).

-- ============================================================
-- 1. PROFILES (one row per login, linked to auth.users)
-- ============================================================
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null,
  full_name   text not null default '',
  role        text not null default 'member',
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('admin', 'team_lead', 'member'));

-- Auto-create a profile whenever a new auth user is created
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    -- Role comes from app_metadata (server-only), never from user_metadata (set by whoever signs up)
    case when new.raw_app_meta_data ->> 'role' in ('admin', 'team_lead', 'member') then new.raw_app_meta_data ->> 'role' else 'member' end
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Role helpers used by security policies (SECURITY DEFINER avoids policy recursion)
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin' and is_active);
$$;

create or replace function public.can_manage()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role in ('admin', 'team_lead') and is_active);
$$;

create or replace function public.is_active_user()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and is_active);
$$;

-- Lets any user rename themselves without being able to change their role
create or replace function public.update_my_name(new_name text)
returns void language sql security definer set search_path = public as $$
  update public.profiles set full_name = trim(new_name)
  where id = auth.uid() and length(trim(new_name)) > 0;
$$;

-- ============================================================
-- 2. ORGANISATION SETTINGS (single row)
-- ============================================================
create table if not exists public.org_settings (
  id                    smallint primary key default 1 check (id = 1),
  company_name          text not null default 'Our Company',
  default_country_code  text not null default '91',
  signature             text not null default '',
  updated_at            timestamptz not null default now()
);
insert into public.org_settings (id) values (1) on conflict do nothing;

-- ============================================================
-- 3. CONTACTS (client directory, shared by all campaigns)
-- ============================================================
create table if not exists public.contacts (
  id           uuid primary key default gen_random_uuid(),
  full_name    text not null,
  phone        text not null unique,          -- digits with country code, e.g. 919876543210
  email        text,
  dob          date,
  anniversary  date,
  city         text,
  company      text,
  tags         text[] not null default '{}',
  owner_id     uuid references public.profiles (id) on delete set null,  -- relationship owner
  notes        text,
  opted_out    boolean not null default false, -- do not message
  created_by   uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists contacts_owner_idx on public.contacts (owner_id);
create index if not exists contacts_tags_idx on public.contacts using gin (tags);

-- ============================================================
-- 4. TEMPLATES (reusable greeting cards + messages)
-- ============================================================
create table if not exists public.templates (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  category      text not null default 'custom'
                check (category in ('birthday', 'anniversary', 'festival', 'offer', 'announcement', 'custom')),
  image_base64  text,
  message       text not null default '',
  created_by    uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ============================================================
-- 5. CAMPAIGNS
--   birthday / anniversary: recurring by each contact's date in period_month/period_year
--   festival / offer / announcement / custom: everyone on send_date
-- ============================================================
create table if not exists public.campaigns (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  type          text not null
                check (type in ('birthday', 'anniversary', 'festival', 'offer', 'announcement', 'custom')),
  status        text not null default 'active' check (status in ('active', 'paused', 'archived')),
  description   text,
  image_base64  text,
  message       text not null default '',
  send_date     date,
  period_month  smallint check (period_month between 1 and 12),
  period_year   integer check (period_year between 2000 and 2100),
  created_by    uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint campaigns_timing_check check (
    (type in ('birthday', 'anniversary') and period_month is not null and period_year is not null)
    or (type not in ('birthday', 'anniversary') and send_date is not null)
  )
);

-- ============================================================
-- 6. CAMPAIGN RECIPIENTS (one message to send = one row)
-- ============================================================
create table if not exists public.campaign_recipients (
  id           uuid primary key default gen_random_uuid(),
  campaign_id  uuid not null references public.campaigns (id) on delete cascade,
  contact_id   uuid not null references public.contacts (id) on delete cascade,
  assigned_to  uuid references public.profiles (id) on delete set null,
  due_date     date not null,
  status       text not null default 'pending' check (status in ('pending', 'sent', 'skipped')),
  sent_at      timestamptz,
  sent_by      uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (campaign_id, contact_id)
);
create index if not exists recipients_assigned_due_idx on public.campaign_recipients (assigned_to, due_date);
create index if not exists recipients_campaign_idx on public.campaign_recipients (campaign_id);
create index if not exists recipients_contact_idx on public.campaign_recipients (contact_id);
create index if not exists recipients_due_idx on public.campaign_recipients (due_date);

-- Card designer layout: text boxes drawn on the card for each client (see migrations/003)
alter table public.templates add column if not exists layout jsonb;
alter table public.campaigns add column if not exists layout jsonb;

-- ============================================================
-- 7. updated_at triggers
-- ============================================================
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['org_settings', 'contacts', 'templates', 'campaigns', 'campaign_recipients'] loop
    execute format('drop trigger if exists %I_touch on public.%I', t, t);
    execute format('create trigger %I_touch before update on public.%I for each row execute function public.touch_updated_at()', t, t);
  end loop;
end $$;

-- ============================================================
-- 8. ROW LEVEL SECURITY
--   Admin: everything. Team lead: campaigns, contacts, templates.
--   Member: only contacts/messages assigned to them.
-- ============================================================
alter table public.profiles            enable row level security;
alter table public.org_settings        enable row level security;
alter table public.contacts            enable row level security;
alter table public.templates           enable row level security;
alter table public.campaigns           enable row level security;
alter table public.campaign_recipients enable row level security;

-- PROFILES: the whole (small) team is visible to active users; only admins edit
drop policy if exists "profiles: read own or admin" on public.profiles;
drop policy if exists "profiles: read own or manager" on public.profiles;
drop policy if exists "profiles: read team" on public.profiles;
create policy "profiles: read team" on public.profiles
  for select using (id = auth.uid() or public.is_active_user());

drop policy if exists "profiles: admin update" on public.profiles;
create policy "profiles: admin update" on public.profiles
  for update using (public.is_admin()) with check (public.is_admin());

-- ORG SETTINGS
drop policy if exists "settings: read" on public.org_settings;
create policy "settings: read" on public.org_settings
  for select using (auth.uid() is not null);

drop policy if exists "settings: admin update" on public.org_settings;
create policy "settings: admin update" on public.org_settings
  for update using (public.is_admin()) with check (public.is_admin());

-- CONTACTS
drop policy if exists "contacts: manager all" on public.contacts;
create policy "contacts: manager all" on public.contacts
  for all using (public.can_manage()) with check (public.can_manage());

drop policy if exists "contacts: member read" on public.contacts;
create policy "contacts: member read" on public.contacts
  for select using (
    owner_id = auth.uid()
    or exists (select 1 from public.campaign_recipients r where r.contact_id = contacts.id and r.assigned_to = auth.uid())
  );

drop policy if exists "contacts: member update" on public.contacts;
create policy "contacts: member update" on public.contacts
  for update using (
    owner_id = auth.uid()
    or exists (select 1 from public.campaign_recipients r where r.contact_id = contacts.id and r.assigned_to = auth.uid())
  );

-- TEMPLATES
drop policy if exists "templates: read" on public.templates;
create policy "templates: read" on public.templates
  for select using (public.is_active_user());

drop policy if exists "templates: manager all" on public.templates;
create policy "templates: manager all" on public.templates
  for all using (public.can_manage()) with check (public.can_manage());

-- CAMPAIGNS (members can only read the campaigns they work on)
drop policy if exists "campaigns: admin all" on public.campaigns;
drop policy if exists "campaigns: manager all" on public.campaigns;
create policy "campaigns: manager all" on public.campaigns
  for all using (public.can_manage()) with check (public.can_manage());

drop policy if exists "campaigns: member read" on public.campaigns;
create policy "campaigns: member read" on public.campaigns
  for select using (
    exists (select 1 from public.campaign_recipients r where r.campaign_id = campaigns.id and r.assigned_to = auth.uid())
  );

drop policy if exists "campaigns: member update" on public.campaigns;

-- CAMPAIGN RECIPIENTS
drop policy if exists "recipients: manager all" on public.campaign_recipients;
create policy "recipients: manager all" on public.campaign_recipients
  for all using (public.can_manage()) with check (public.can_manage());

drop policy if exists "recipients: member read" on public.campaign_recipients;
create policy "recipients: member read" on public.campaign_recipients
  for select using (assigned_to = auth.uid());

drop policy if exists "recipients: member update" on public.campaign_recipients;
create policy "recipients: member update" on public.campaign_recipients
  for update using (assigned_to = auth.uid()) with check (assigned_to = auth.uid());

-- ============================================================
-- 9. MAKE YOURSELF ADMIN (after creating your user in Authentication -> Users)
--   update public.profiles set role = 'admin' where email = 'you@company.com';
-- ============================================================
