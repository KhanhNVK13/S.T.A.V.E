-- Moderation actions on reported projects. Each admin action is one function
-- so the project flag, report closure, sound removal and audit entry commit or
-- roll back together. Called only by the backend (service_role).

alter table public.projects
  add column if not exists moderation_policy text;

create or replace function public.admin_remove_reported_project(
  p_admin_id uuid,
  p_project_id uuid,
  p_reason text,
  p_policy text,
  p_sound_ids uuid[]
)
returns table (
  o_owner_id uuid,
  o_project_name text,
  o_reporter_ids uuid[],
  o_file_urls text[],
  o_closed_count integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_name text;
  v_hidden timestamptz;
  v_reporters uuid[];
  v_sound_ids uuid[];
  v_files text[];
  v_closed integer;
begin
  select p.owner_id, p.name, p.moderation_hidden_at
    into v_owner, v_name, v_hidden
  from public.projects p
  where p.id = p_project_id
  for update;

  if not found then
    raise exception 'PROJECT_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_hidden is not null then
    raise exception 'ALREADY_REMOVED' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from public.reports r
    where r.project_id = p_project_id and r.status::text = 'pending'
  ) then
    raise exception 'NO_OPEN_REPORTS' using errcode = 'P0001';
  end if;

  update public.projects
  set moderation_hidden_at = now(),
      moderation_hidden_reason = p_reason,
      moderation_policy = p_policy
  where id = p_project_id;

  select coalesce(array_agg(s.id), '{}'), coalesce(array_agg(s.file_url), '{}')
    into v_sound_ids, v_files
  from public.custom_sounds s
  where s.owner_id = v_owner
    and s.id = any (coalesce(p_sound_ids, '{}'));

  if cardinality(v_sound_ids) > 0 then
    delete from public.sound_mappings sm
    where sm.custom_sound_id = any (v_sound_ids);
    delete from public.custom_sounds s
    where s.id = any (v_sound_ids);
  end if;

  with closed as (
    update public.reports r
    set status = 'resolved',
        resolution = 'upheld',
        resolution_note = p_reason,
        resolved_by = p_admin_id,
        resolved_at = now()
    where r.project_id = p_project_id and r.status::text = 'pending'
    returning r.reporter_id
  )
  select coalesce(array_agg(distinct c.reporter_id)
           filter (where c.reporter_id is not null), '{}'),
         count(*)::integer
    into v_reporters, v_closed
  from closed c;

  insert into public.admin_audit_log (admin_id, action, target_type, target_id, reason)
  values (p_admin_id, 'project.remove', 'project', p_project_id,
          p_policy || ': ' || p_reason);

  return query select v_owner, v_name, v_reporters, v_files, v_closed;
end;
$$;

create or replace function public.admin_dismiss_reports(
  p_admin_id uuid,
  p_project_id uuid,
  p_report_ids uuid[],
  p_note text
)
returns table (
  o_status text,
  o_project_name text,
  o_reporter_ids uuid[],
  o_pending_ids uuid[]
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_pending uuid[];
  v_reporters uuid[];
begin
  select p.name into v_name from public.projects p where p.id = p_project_id
  for update;
  if not found then
    raise exception 'PROJECT_NOT_FOUND' using errcode = 'P0002';
  end if;

  perform 1 from public.reports r
  where r.project_id = p_project_id and r.status::text = 'pending'
  for update;

  select coalesce(array_agg(r.id order by r.id), '{}')
    into v_pending
  from public.reports r
  where r.project_id = p_project_id and r.status::text = 'pending';

  if cardinality(v_pending) = 0 then
    return query select 'none'::text, v_name, '{}'::uuid[], v_pending;
    return;
  end if;

  if v_pending is distinct from (
    select coalesce(array_agg(distinct x order by x), '{}')
    from unnest(p_report_ids) as x
  ) then
    return query select 'stale'::text, v_name, '{}'::uuid[], v_pending;
    return;
  end if;

  with closed as (
    update public.reports r
    set status = 'resolved',
        resolution = 'dismissed',
        resolution_note = p_note,
        resolved_by = p_admin_id,
        resolved_at = now()
    where r.id = any (v_pending)
    returning r.reporter_id
  )
  select coalesce(array_agg(distinct c.reporter_id)
           filter (where c.reporter_id is not null), '{}')
    into v_reporters
  from closed c;

  insert into public.admin_audit_log (admin_id, action, target_type, target_id, reason)
  values (p_admin_id, 'report.dismiss', 'project', p_project_id, p_note);

  return query select 'dismissed'::text, v_name, v_reporters, v_pending;
end;
$$;

create or replace function public.admin_restore_project(
  p_admin_id uuid,
  p_project_id uuid,
  p_retention_days integer
)
returns table (
  o_status text,
  o_owner_id uuid,
  o_project_name text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_name text;
  v_hidden timestamptz;
begin
  select p.owner_id, p.name, p.moderation_hidden_at
    into v_owner, v_name, v_hidden
  from public.projects p
  where p.id = p_project_id
  for update;

  if not found then
    raise exception 'PROJECT_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_hidden is null then
    return query select 'not_removed'::text, v_owner, v_name;
    return;
  end if;
  if v_hidden + make_interval(days => greatest(p_retention_days, 0)) < now() then
    return query select 'expired'::text, v_owner, v_name;
    return;
  end if;

  update public.projects
  set moderation_hidden_at = null,
      moderation_hidden_reason = null,
      moderation_policy = null
  where id = p_project_id;

  insert into public.admin_audit_log (admin_id, action, target_type, target_id, reason)
  values (p_admin_id, 'project.restore', 'project', p_project_id, null);

  return query select 'restored'::text, v_owner, v_name;
end;
$$;

revoke all on function public.admin_remove_reported_project(uuid, uuid, text, text, uuid[])
  from public, anon, authenticated;
revoke all on function public.admin_dismiss_reports(uuid, uuid, uuid[], text)
  from public, anon, authenticated;
revoke all on function public.admin_restore_project(uuid, uuid, integer)
  from public, anon, authenticated;
grant execute on function public.admin_remove_reported_project(uuid, uuid, text, text, uuid[])
  to service_role;
grant execute on function public.admin_dismiss_reports(uuid, uuid, uuid[], text)
  to service_role;
grant execute on function public.admin_restore_project(uuid, uuid, integer)
  to service_role;
