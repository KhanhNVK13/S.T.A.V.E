-- Terms of Use acceptance, copyright claims, copyright take-downs that also
-- hide every fork, and appeals against a removal. Functions are called only by
-- the backend (service_role).

alter table public.users
  add column if not exists terms_accepted_version text,
  add column if not exists terms_accepted_at timestamptz;

update public.users
set terms_accepted_version = 'pre-terms',
    terms_accepted_at = created_at
where terms_accepted_at is null;

create table if not exists public.moderation_appeals (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  appellant_id uuid references public.users (id) on delete set null,
  statement text not null check (char_length(statement) between 20 and 1000),
  status text not null default 'pending'
    check (status in ('pending', 'upheld', 'rejected')),
  created_at timestamptz not null default now(),
  resolved_by uuid references public.users (id) on delete set null,
  resolved_at timestamptz,
  resolution_note text
);

create unique index if not exists moderation_appeals_one_pending_per_project
  on public.moderation_appeals (project_id) where status = 'pending';

create index if not exists moderation_appeals_status_created
  on public.moderation_appeals (status, created_at desc);

alter table public.moderation_appeals enable row level security;

revoke all on public.moderation_appeals from public, anon, authenticated;
grant select, insert, update, delete on public.moderation_appeals to service_role;

alter table public.reports
  add column if not exists copyright_claim jsonb;

alter table public.projects
  add column if not exists moderation_root_id uuid;

create index if not exists projects_moderation_root_id_idx
  on public.projects (moderation_root_id)
  where moderation_root_id is not null;

drop function if exists public.admin_remove_copyright_project(uuid, uuid, text, uuid[]);

create function public.admin_remove_copyright_project(
  p_admin_id uuid,
  p_project_id uuid,
  p_reason text,
  p_sound_ids uuid[]
)
returns table (
  o_owner_id uuid,
  o_project_name text,
  o_reporter_ids uuid[],
  o_file_urls text[],
  o_closed_count integer,
  o_forks jsonb
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
  v_forks jsonb;
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
    where r.project_id = p_project_id
      and r.status::text = 'pending'
      and r.reason::text = 'copyright'
  ) then
    raise exception 'NO_OPEN_REPORTS' using errcode = 'P0001';
  end if;

  with recursive tree as (
    select f.id, array[f.id] as path
    from public.projects f
    where f.forked_from_project_id = p_project_id
    union all
    select c.id, t.path || c.id
    from public.projects c
    join tree t on c.forked_from_project_id = t.id
    where not (c.id = any (t.path))
  ),
  hidden as (
    update public.projects p
    set moderation_hidden_at = now(),
        moderation_hidden_reason = p_reason,
        moderation_policy = 'copyright',
        moderation_root_id = p_project_id
    where p.id in (select t.id from tree t)
      and p.id <> p_project_id
      and p.moderation_hidden_at is null
    returning p.id, p.owner_id, p.name
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'projectId', h.id, 'ownerId', h.owner_id, 'name', h.name)),
         '[]'::jsonb)
    into v_forks
  from hidden h;

  update public.projects
  set moderation_hidden_at = now(),
      moderation_hidden_reason = p_reason,
      moderation_policy = 'copyright',
      moderation_root_id = p_project_id
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
  values (p_admin_id, 'project.copyright_takedown', 'project', p_project_id,
          'copyright: ' || p_reason || ' (forks hidden: '
            || jsonb_array_length(v_forks) || ')');

  return query select v_owner, v_name, v_reporters, v_files, v_closed, v_forks;
end;
$$;

create or replace function public.admin_restore_project_tree(
  p_admin_id uuid,
  p_project_id uuid,
  p_retention_days integer
)
returns table (
  o_status text,
  o_owner_id uuid,
  o_project_name text,
  o_restored_forks jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_name text;
  v_hidden timestamptz;
  v_root uuid;
  v_forks jsonb := '[]'::jsonb;
  v_restored uuid[];
begin
  select p.owner_id, p.name, p.moderation_hidden_at, p.moderation_root_id
    into v_owner, v_name, v_hidden, v_root
  from public.projects p
  where p.id = p_project_id
  for update;

  if not found then
    raise exception 'PROJECT_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_hidden is null then
    return query select 'not_removed'::text, v_owner, v_name, v_forks;
    return;
  end if;
  if v_hidden + make_interval(days => greatest(p_retention_days, 0)) < now() then
    return query select 'expired'::text, v_owner, v_name, v_forks;
    return;
  end if;

  if v_root = p_project_id then
    with restored as (
      update public.projects f
      set moderation_hidden_at = null,
          moderation_hidden_reason = null,
          moderation_policy = null,
          moderation_root_id = null
      where f.moderation_root_id = p_project_id
        and f.id <> p_project_id
        and f.moderation_hidden_at is not null
        and not exists (
          select 1 from public.moderation_appeals a
          where a.project_id = f.id
            and a.status = 'rejected'
            and a.created_at >= f.moderation_hidden_at
        )
      returning f.id, f.owner_id, f.name
    )
    select coalesce(jsonb_agg(jsonb_build_object(
             'projectId', r.id, 'ownerId', r.owner_id, 'name', r.name)),
           '[]'::jsonb),
           coalesce(array_agg(r.id), '{}')
      into v_forks, v_restored
    from restored r;
  end if;

  update public.projects
  set moderation_hidden_at = null,
      moderation_hidden_reason = null,
      moderation_policy = null,
      moderation_root_id = null
  where id = p_project_id;

  update public.moderation_appeals
  set status = 'upheld',
      resolved_by = p_admin_id,
      resolved_at = now(),
      resolution_note = 'Restored by an administrator.'
  where status = 'pending'
    and project_id = any (array_append(coalesce(v_restored, '{}'), p_project_id));

  insert into public.admin_audit_log (admin_id, action, target_type, target_id, reason)
  values (p_admin_id, 'project.restore', 'project', p_project_id,
          case when jsonb_array_length(v_forks) > 0
               then 'forks restored: ' || jsonb_array_length(v_forks)
               else null end);

  return query select 'restored'::text, v_owner, v_name, v_forks;
end;
$$;

create or replace function public.admin_resolve_appeal(
  p_admin_id uuid,
  p_appeal_id uuid,
  p_decision text,
  p_note text
)
returns table (
  o_status text,
  o_appellant_id uuid,
  o_project_id uuid,
  o_project_name text,
  o_restored_forks jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project uuid;
  v_appellant uuid;
  v_status text;
  v_created timestamptz;
  v_name text;
  v_root uuid;
  v_hidden timestamptz;
  v_forks jsonb := '[]'::jsonb;
  v_restored uuid[];
begin
  if p_decision not in ('uphold', 'reject') then
    raise exception 'BAD_DECISION' using errcode = 'P0001';
  end if;

  select a.project_id, a.appellant_id, a.status, a.created_at
    into v_project, v_appellant, v_status, v_created
  from public.moderation_appeals a
  where a.id = p_appeal_id
  for update;

  if not found then
    raise exception 'APPEAL_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_status <> 'pending' then
    raise exception 'ALREADY_RESOLVED' using errcode = 'P0001';
  end if;

  select p.name, p.moderation_root_id, p.moderation_hidden_at
    into v_name, v_root, v_hidden
  from public.projects p
  where p.id = v_project
  for update;

  if v_hidden is null or v_created < v_hidden then
    update public.moderation_appeals
    set status = 'upheld',
        resolved_by = p_admin_id,
        resolved_at = now(),
        resolution_note = 'Closed: this removal no longer applies.'
    where id = p_appeal_id;
    return query select 'stale'::text, v_appellant, v_project, v_name, v_forks;
    return;
  end if;

  if p_decision = 'uphold' then
    if v_root = v_project then
      with restored as (
        update public.projects f
        set moderation_hidden_at = null,
            moderation_hidden_reason = null,
            moderation_policy = null,
            moderation_root_id = null
        where f.moderation_root_id = v_project
          and f.id <> v_project
          and f.moderation_hidden_at is not null
          and not exists (
            select 1 from public.moderation_appeals a2
            where a2.project_id = f.id
              and a2.status = 'rejected'
              and a2.created_at >= f.moderation_hidden_at
          )
        returning f.id, f.owner_id, f.name
      )
      select coalesce(jsonb_agg(jsonb_build_object(
               'projectId', r.id, 'ownerId', r.owner_id, 'name', r.name)),
             '[]'::jsonb),
             coalesce(array_agg(r.id), '{}')
        into v_forks, v_restored
      from restored r;

      update public.moderation_appeals
      set status = 'upheld',
          resolved_by = p_admin_id,
          resolved_at = now(),
          resolution_note = 'Restored together with the original project.'
      where status = 'pending'
        and project_id = any (coalesce(v_restored, '{}'));
    end if;

    update public.projects
    set moderation_hidden_at = null,
        moderation_hidden_reason = null,
        moderation_policy = null,
        moderation_root_id = null
    where id = v_project;
  end if;

  update public.moderation_appeals
  set status = case when p_decision = 'uphold' then 'upheld' else 'rejected' end,
      resolved_by = p_admin_id,
      resolved_at = now(),
      resolution_note = p_note
  where id = p_appeal_id;

  insert into public.admin_audit_log (admin_id, action, target_type, target_id, reason)
  values (p_admin_id,
          case when p_decision = 'uphold' then 'appeal.uphold' else 'appeal.reject' end,
          'project', v_project, p_note);

  return query select
    case when p_decision = 'uphold' then 'upheld' else 'rejected' end,
    v_appellant, v_project, v_name, v_forks;
end;
$$;

revoke all on function public.admin_remove_copyright_project(uuid, uuid, text, uuid[])
  from public, anon, authenticated;
grant execute on function public.admin_remove_copyright_project(uuid, uuid, text, uuid[])
  to service_role;

revoke all on function public.admin_restore_project_tree(uuid, uuid, integer)
  from public, anon, authenticated;
revoke all on function public.admin_resolve_appeal(uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.admin_restore_project_tree(uuid, uuid, integer)
  to service_role;
grant execute on function public.admin_resolve_appeal(uuid, uuid, text, text)
  to service_role;
