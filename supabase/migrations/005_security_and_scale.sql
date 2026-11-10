-- Security and scale fixes from the code review. Run once in Supabase Dashboard -> SQL Editor.
-- Safe to re-run. Does not change or delete any data.

-- ------------------------------------------------------------
-- 1. Roles can no longer be chosen at sign-up.
--    user_metadata is writable by the person signing up, so the role now comes from
--    app_metadata, which only the server (manage-users edge function) can set.
-- ------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  requested text := new.raw_app_meta_data ->> 'role';
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(new.email, '@', 1)),
    case when requested in ('admin', 'team_lead', 'member') then requested else 'member' end
  );
  return new;
end;
$$;

-- ------------------------------------------------------------
-- 2. Members: read-only campaigns, notes-only contacts, status-only recipients.
--    Deactivated users lose access immediately (not when their token expires).
-- ------------------------------------------------------------
drop policy if exists "campaigns: member update" on public.campaigns;

drop policy if exists "campaigns: member read" on public.campaigns;
create policy "campaigns: member read" on public.campaigns
  for select using (
    public.is_active_user()
    and exists (select 1 from public.campaign_recipients r where r.campaign_id = campaigns.id and r.assigned_to = auth.uid())
  );

drop policy if exists "contacts: member read" on public.contacts;
create policy "contacts: member read" on public.contacts
  for select using (
    public.is_active_user()
    and (owner_id = auth.uid()
         or exists (select 1 from public.campaign_recipients r where r.contact_id = contacts.id and r.assigned_to = auth.uid()))
  );

drop policy if exists "contacts: member update" on public.contacts;
create policy "contacts: member update" on public.contacts
  for update using (
    public.is_active_user()
    and (owner_id = auth.uid()
         or exists (select 1 from public.campaign_recipients r where r.contact_id = contacts.id and r.assigned_to = auth.uid()))
  );

drop policy if exists "recipients: member read" on public.campaign_recipients;
create policy "recipients: member read" on public.campaign_recipients
  for select using (public.is_active_user() and assigned_to = auth.uid());

drop policy if exists "recipients: member update" on public.campaign_recipients;
create policy "recipients: member update" on public.campaign_recipients
  for update using (public.is_active_user() and assigned_to = auth.uid())
  with check (assigned_to = auth.uid());

-- Column guards: RLS decides which rows a member may update; these decide which columns.
create or replace function public.guard_member_contact_update()
returns trigger language plpgsql as $$
begin
  if public.can_manage() then return new; end if;
  if (to_jsonb(new) - 'notes' - 'updated_at') is distinct from (to_jsonb(old) - 'notes' - 'updated_at') then
    raise exception 'Only notes can be changed. Ask a team lead to update other client details.';
  end if;
  return new;
end;
$$;

drop trigger if exists contacts_member_guard on public.contacts;
create trigger contacts_member_guard before update on public.contacts
  for each row execute function public.guard_member_contact_update();

create or replace function public.guard_member_recipient_update()
returns trigger language plpgsql as $$
begin
  if public.can_manage() then return new; end if;
  if (to_jsonb(new) - 'status' - 'sent_at' - 'sent_by' - 'updated_at')
     is distinct from (to_jsonb(old) - 'status' - 'sent_at' - 'sent_by' - 'updated_at') then
    raise exception 'Only the sent status of a greeting can be changed.';
  end if;
  -- The server, not the browser, records who sent it and when
  if new.status = 'pending' then
    new.sent_at := null;
    new.sent_by := null;
  else
    new.sent_at := now();
    new.sent_by := auth.uid();
  end if;
  return new;
end;
$$;

drop trigger if exists recipients_member_guard on public.campaign_recipients;
create trigger recipients_member_guard before update on public.campaign_recipients
  for each row execute function public.guard_member_recipient_update();

-- ------------------------------------------------------------
-- 3. Create a campaign and its recipients in one transaction (all or nothing).
--    Runs with the caller's permissions, so RLS still applies.
-- ------------------------------------------------------------
create or replace function public.create_campaign(p_campaign jsonb, p_recipients jsonb)
returns uuid
language plpgsql
security invoker set search_path = public
as $$
declare
  new_id uuid;
begin
  if not public.can_manage() then
    raise exception 'Only admins and team leads can create campaigns.';
  end if;

  insert into public.campaigns
    (name, type, description, image_base64, message, layout, send_date, period_month, period_year, created_by)
  values (
    p_campaign ->> 'name',
    p_campaign ->> 'type',
    p_campaign ->> 'description',
    p_campaign ->> 'image_base64',
    coalesce(p_campaign ->> 'message', ''),
    nullif(p_campaign -> 'layout', 'null'::jsonb),
    (p_campaign ->> 'send_date')::date,
    (p_campaign ->> 'period_month')::smallint,
    (p_campaign ->> 'period_year')::integer,
    auth.uid()
  )
  returning id into new_id;

  insert into public.campaign_recipients (campaign_id, contact_id, assigned_to, due_date)
  select new_id, (r ->> 'contact_id')::uuid, (r ->> 'assigned_to')::uuid, (r ->> 'due_date')::date
  from jsonb_array_elements(p_recipients) r;

  -- Contacts without a relationship owner adopt the person assigned to them
  update public.contacts c
  set owner_id = (r ->> 'assigned_to')::uuid
  from jsonb_array_elements(p_recipients) r
  where c.id = (r ->> 'contact_id')::uuid and c.owner_id is null;

  return new_id;
end;
$$;

-- Add one tag to many contacts in a single statement (bulk action on the Contacts page)
create or replace function public.add_tag_to_contacts(p_ids uuid[], p_tag text)
returns void
language sql
security invoker set search_path = public
as $$
  update public.contacts
  set tags = array(select distinct t from unnest(tags || array[trim(p_tag)]) as t)
  where id = any(p_ids) and not (trim(p_tag) = any(tags));
$$;

-- ------------------------------------------------------------
-- 4. Per-campaign totals computed in the database, so the Campaigns page doesn't
--    have to download every recipient row (and isn't cut off at 1,000 rows).
--    "Overdue" uses India time, matching the app's default country.
-- ------------------------------------------------------------
create or replace view public.campaign_stats
with (security_invoker = true) as
select
  campaign_id,
  count(*)::int                                                      as total,
  count(*) filter (where status = 'sent')::int                       as sent,
  count(*) filter (where status = 'skipped')::int                    as skipped,
  count(*) filter (where status = 'pending')::int                    as pending,
  count(*) filter (where status = 'pending'
                   and due_date < (now() at time zone 'Asia/Kolkata')::date)::int as overdue
from public.campaign_recipients
group by campaign_id;

grant select on public.campaign_stats to authenticated;
