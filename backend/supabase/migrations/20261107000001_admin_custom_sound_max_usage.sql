create or replace function public.admin_custom_sound_max_usage()
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(max(per_owner.total), 0)::bigint
  from (
    select sum(s.size_bytes) as total
    from public.custom_sounds s
    where s.deleted_at is null
    group by s.owner_id
  ) per_owner;
$$;

revoke all on function public.admin_custom_sound_max_usage() from public, anon, authenticated;
grant execute on function public.admin_custom_sound_max_usage() to service_role;
