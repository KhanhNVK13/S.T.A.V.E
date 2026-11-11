-- Keyset-paged read of the sound index of one project (every draft and every
-- commit of every branch). Used by the admin removal context so the custom
-- sounds used anywhere in the history are listed, not only the branch heads.
-- Called only by the backend (service_role).

create or replace function public.sound_mappings_page(
  p_project_id uuid,
  p_limit integer,
  p_after uuid default null
)
returns table (
  o_id uuid,
  o_custom_sound_id uuid
)
language sql
stable
security definer
set search_path = public
as $$
  select sm.id, sm.custom_sound_id
  from public.sound_mappings sm
  where sm.project_id = p_project_id
    and (p_after is null or sm.id > p_after)
  order by sm.id
  limit greatest(1, least(coalesce(p_limit, 500), 1000));
$$;

revoke all on function public.sound_mappings_page(uuid, integer, uuid)
  from public, anon, authenticated;
grant execute on function public.sound_mappings_page(uuid, integer, uuid)
  to service_role;
