create or replace function public.commit_ancestry(p_heads uuid[], p_limit integer default 2000)
returns table (
  id uuid,
  parent_commit_id uuid,
  merged_from_commit_id uuid,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with recursive walk(id, parent_commit_id, merged_from_commit_id, created_at) as (
    select c.id, c.parent_commit_id, c.merged_from_commit_id, c.created_at
    from public.commits c
    where c.id = any(p_heads)
    union
    select c.id, c.parent_commit_id, c.merged_from_commit_id, c.created_at
    from public.commits c
    join walk w on c.id = w.parent_commit_id or c.id = w.merged_from_commit_id
  )
  select walk.id, walk.parent_commit_id, walk.merged_from_commit_id, walk.created_at
  from walk
  limit greatest(p_limit, 1);
$$;

revoke all on function public.commit_ancestry(uuid[], integer) from public, anon, authenticated;
grant execute on function public.commit_ancestry(uuid[], integer) to service_role;
