create or replace function public.set_project_tags(p_project_id uuid, p_names text[])
returns text[]
language plpgsql
security definer
set search_path = public
as $$
declare
  v_names text[];
begin
  select coalesce(array_agg(distinct lower(btrim(n))), '{}')
    into v_names
    from unnest(coalesce(p_names, '{}')) as n
    where btrim(n) <> '';

  if cardinality(v_names) > 5 then
    raise exception 'too many tags' using errcode = '22023';
  end if;

  perform 1 from public.projects where id = p_project_id for update;
  if not found then
    raise exception 'project not found' using errcode = 'P0002';
  end if;

  insert into public.tags (name)
    select unnest(v_names)
    on conflict ((lower(name))) do nothing;

  delete from public.project_tags
    where project_id = p_project_id
      and tag_id not in (
        select id from public.tags where lower(name) = any (v_names)
      );

  insert into public.project_tags (project_id, tag_id)
    select p_project_id, id from public.tags where lower(name) = any (v_names)
    on conflict do nothing;

  return v_names;
end;
$$;

revoke all on function public.set_project_tags(uuid, text[]) from public, anon, authenticated;
grant execute on function public.set_project_tags(uuid, text[]) to service_role;
