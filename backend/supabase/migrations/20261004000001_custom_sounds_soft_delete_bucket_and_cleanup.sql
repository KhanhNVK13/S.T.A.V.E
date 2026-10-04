alter table public.custom_sounds add column if not exists deleted_at timestamptz;

create index if not exists custom_sounds_owner_active_idx
  on public.custom_sounds (owner_id, created_at desc) where deleted_at is null;
create index if not exists custom_sounds_deleted_idx
  on public.custom_sounds (deleted_at) where deleted_at is not null;
create index if not exists sound_mappings_custom_sound_idx
  on public.sound_mappings (custom_sound_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('custom-sounds', 'custom-sounds', false, 10485760, array['audio/wav', 'audio/x-wav', 'audio/wave'])
on conflict (id) do update
set file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types,
    public = excluded.public;

drop policy if exists "custom_sounds_objects_insert" on storage.objects;
drop policy if exists "custom_sounds_objects_select" on storage.objects;
drop policy if exists "custom_sounds_objects_delete" on storage.objects;

create policy "custom_sounds_objects_insert"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'custom-sounds'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "custom_sounds_objects_select"
on storage.objects for select to authenticated
using (
  bucket_id = 'custom-sounds'
  and ((storage.foldername(name))[1] = (select auth.uid())::text or public.is_admin())
);

create policy "custom_sounds_objects_delete"
on storage.objects for delete to authenticated
using (
  bucket_id = 'custom-sounds'
  and ((storage.foldername(name))[1] = (select auth.uid())::text or public.is_admin())
);

create or replace function public.custom_sound_external_project_count(p_sound_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(distinct sm.project_id)::integer
  from public.sound_mappings sm
  join public.projects p on p.id = sm.project_id
  join public.custom_sounds s on s.id = sm.custom_sound_id
  where sm.custom_sound_id = p_sound_id
    and p.owner_id <> s.owner_id;
$$;

create or replace function public.delete_custom_sound(p_sound_id uuid, p_owner_id uuid, p_hard boolean)
returns table (removed boolean, file_url text, affected_projects integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_file text;
  v_refs integer;
begin
  select s.file_url into v_file
  from public.custom_sounds s
  where s.id = p_sound_id and s.owner_id = p_owner_id
  for update;

  if not found then
    return;
  end if;

  v_refs := public.custom_sound_external_project_count(p_sound_id);

  if p_hard or v_refs = 0 then
    delete from public.sound_mappings sm where sm.custom_sound_id = p_sound_id;
    delete from public.custom_sounds s where s.id = p_sound_id;
    return query select true, v_file, v_refs;
  else
    update public.custom_sounds s
    set deleted_at = coalesce(s.deleted_at, now())
    where s.id = p_sound_id;
    return query select false, null::text, v_refs;
  end if;
end;
$$;

create or replace function public.collect_custom_sound_garbage()
returns table (file_url text)
language plpgsql
security definer
set search_path = public, storage
as $$
begin
  return query
  with doomed as (
    select s.id
    from public.custom_sounds s
    where s.deleted_at is not null
      and public.custom_sound_external_project_count(s.id) = 0
    for update skip locked
  ),
  gone as (
    delete from public.custom_sounds s
    using doomed d
    where s.id = d.id
    returning s.file_url
  )
  select g.file_url from gone g
  union
  select o.name
  from storage.objects o
  where o.bucket_id = 'custom-sounds'
    and o.created_at < now() - interval '1 hour'
    and not exists (select 1 from public.custom_sounds s where s.file_url = o.name);
end;
$$;

insert into public.platform_settings (key, value)
select 'custom_sound_quota_bytes', to_jsonb(52428800)
where not exists (select 1 from public.platform_settings where key = 'custom_sound_quota_bytes');

create or replace function public.custom_sound_usage_bytes(p_owner_id uuid)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(s.size_bytes), 0)::bigint
  from public.custom_sounds s
  where s.owner_id = p_owner_id and s.deleted_at is null;
$$;

revoke all on function public.custom_sound_usage_bytes(uuid) from public, anon, authenticated;
grant execute on function public.custom_sound_usage_bytes(uuid) to service_role;

revoke all on function public.custom_sound_external_project_count(uuid) from public, anon, authenticated;
revoke all on function public.delete_custom_sound(uuid, uuid, boolean) from public, anon, authenticated;
revoke all on function public.collect_custom_sound_garbage() from public, anon, authenticated;
grant execute on function public.custom_sound_external_project_count(uuid) to service_role;
grant execute on function public.delete_custom_sound(uuid, uuid, boolean) to service_role;
grant execute on function public.collect_custom_sound_garbage() to service_role;
