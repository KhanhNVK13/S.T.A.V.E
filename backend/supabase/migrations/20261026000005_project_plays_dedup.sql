create table if not exists public.project_plays (
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

alter table public.project_plays enable row level security;

create policy "project_plays_select_own"
  on public.project_plays for select
  using (user_id = (select auth.uid()));

grant all on public.project_plays to service_role;

create or replace function public.record_project_play(p_project_id uuid, p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_count integer;
begin
  select owner_id, play_count into v_owner, v_count
  from public.projects
  where id = p_project_id
    and visibility = 'public'
    and archived_at is null
    and moderation_hidden_at is null;

  if not found then
    return null;
  end if;

  if v_owner = p_user_id then
    return v_count;
  end if;

  insert into public.project_plays (project_id, user_id)
  values (p_project_id, p_user_id)
  on conflict do nothing;

  if found then
    update public.projects set play_count = play_count + 1
    where id = p_project_id
    returning play_count into v_count;
  end if;

  return v_count;
end;
$$;

revoke all on function public.record_project_play(uuid, uuid) from public, anon, authenticated;
grant execute on function public.record_project_play(uuid, uuid) to service_role;
