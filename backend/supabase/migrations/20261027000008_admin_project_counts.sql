create or replace function public.admin_project_counts(p_owner_ids uuid[])
returns table (owner_id uuid, project_count integer)
language sql
stable
security definer
set search_path = public
as $$
  select p.owner_id, count(*)::integer
  from public.projects p
  where p.owner_id = any(p_owner_ids)
  group by p.owner_id;
$$;

revoke all on function public.admin_project_counts(uuid[]) from public, anon, authenticated;
grant execute on function public.admin_project_counts(uuid[]) to service_role;
