-- Security hardening, part 2. Run once in Supabase Dashboard -> SQL Editor. Safe to re-run.

-- ------------------------------------------------------------
-- 1. Image library: only signed-in team members can LIST files.
--    The bucket stays public for direct image links, so cards keep loading everywhere
--    (public object URLs don't use this policy), but strangers can no longer browse the file list.
-- ------------------------------------------------------------
drop policy if exists "media files: read" on storage.objects;
create policy "media files: read" on storage.objects
  for select to authenticated using (bucket_id = 'media' and public.is_active_user());

-- ------------------------------------------------------------
-- 2. Audit log: who created, changed or deleted what, and when.
--    Written only by database triggers; admins can read it; nobody can edit or delete it.
-- ------------------------------------------------------------
create table if not exists public.audit_log (
  id           bigint generated always as identity primary key,
  happened_at  timestamptz not null default now(),
  actor        uuid,
  actor_email  text,
  table_name   text not null,
  record_id    text,
  action       text not null check (action in ('insert', 'update', 'delete')),
  changes      jsonb
);
create index if not exists audit_log_time_idx on public.audit_log (happened_at desc);
create index if not exists audit_log_record_idx on public.audit_log (table_name, record_id);

alter table public.audit_log enable row level security;
drop policy if exists "audit: admin read" on public.audit_log;
create policy "audit: admin read" on public.audit_log for select using (public.is_admin());
-- Deliberately no insert/update/delete policies: the log can't be written or altered from the app.

create or replace function public.write_audit()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  row_data jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  diff     jsonb;
begin
  if tg_op = 'UPDATE' then
    -- Only the fields that changed, as { field: { from, to } }; large image data is left out
    select jsonb_object_agg(key, jsonb_build_object('from', to_jsonb(old) -> key, 'to', value))
      into diff
      from jsonb_each(to_jsonb(new))
     where to_jsonb(old) -> key is distinct from value
       and key not in ('updated_at', 'image_base64');
    if diff is null then return new; end if;
  elsif tg_op = 'INSERT' then
    diff := row_data - 'image_base64';
  else
    diff := to_jsonb(old) - 'image_base64';
  end if;

  insert into public.audit_log (actor, actor_email, table_name, record_id, action, changes)
  values (auth.uid(), (select email from public.profiles where id = auth.uid()),
          tg_table_name, row_data ->> 'id', lower(tg_op), diff);
  return coalesce(new, old);
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['profiles', 'contacts', 'campaigns', 'templates', 'org_settings', 'media'] loop
    execute format('drop trigger if exists %I_audit on public.%I', t, t);
    execute format('create trigger %I_audit after insert or update or delete on public.%I for each row execute function public.write_audit()', t, t);
  end loop;
end $$;

-- Greetings: log status changes and removals (not the bulk inserts when a campaign is created)
drop trigger if exists campaign_recipients_audit on public.campaign_recipients;
create trigger campaign_recipients_audit after update or delete on public.campaign_recipients
  for each row execute function public.write_audit();
