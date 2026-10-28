alter table public.drafts
  add column if not exists user_id uuid references public.users(id) on delete cascade;

update public.drafts d
set user_id = p.owner_id
from public.branches b
join public.projects p on p.id = b.project_id
where b.id = d.branch_id
  and d.user_id is null;

alter table public.drafts alter column user_id set not null;

alter table public.drafts drop constraint if exists drafts_branch_id_key;

alter table public.drafts
  add constraint drafts_branch_id_user_id_key unique (branch_id, user_id);

create index if not exists drafts_user_id_idx on public.drafts (user_id);

create or replace function public.sync_sound_mappings_from_snapshot()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project uuid;
begin
  select b.project_id into v_project from public.branches b where b.id = new.branch_id;
  if v_project is null then
    return new;
  end if;

  if tg_table_name = 'commits' then
    insert into public.sound_mappings (project_id, branch_id, commit_id, track_id, pitch, custom_sound_id)
    select v_project, new.branch_id, new.id, e.track_id, e.pitch, e.sound_id
    from public.sound_mapping_entries(new.snapshot) e
    where exists (select 1 from public.custom_sounds s where s.id = e.sound_id);
  else
    delete from public.sound_mappings sm
    where sm.branch_id = new.branch_id and sm.commit_id is null;

    insert into public.sound_mappings (project_id, branch_id, commit_id, track_id, pitch, custom_sound_id)
    select distinct v_project, d.branch_id, null::uuid, e.track_id, e.pitch, e.sound_id
    from public.drafts d
    cross join lateral public.sound_mapping_entries(d.snapshot) e
    where d.branch_id = new.branch_id
      and exists (select 1 from public.custom_sounds s where s.id = e.sound_id);
  end if;

  return new;
end;
$$;

create or replace function public.sound_mapping_entries(p_snapshot jsonb)
returns table (track_id text, pitch integer, sound_id uuid)
language sql
immutable
as $$
  select e.track_id, e.pitch, e.sound_id
  from (
    select
      t->>'id' as track_id,
      case when m.key ~ '^[0-9]{1,3}$' then m.key::integer end as pitch,
      case
        when m.value ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          then m.value::uuid
      end as sound_id
    from jsonb_array_elements(
      case when jsonb_typeof(p_snapshot->'tracks') = 'array' then p_snapshot->'tracks' else '[]'::jsonb end
    ) t
    cross join lateral jsonb_each_text(
      case when jsonb_typeof(t->'soundMap') = 'object' then t->'soundMap' else '{}'::jsonb end
    ) m
  ) e
  where e.track_id is not null
    and e.pitch between 0 and 127
    and e.sound_id is not null;
$$;

revoke all on function public.sync_sound_mappings_from_snapshot() from public, anon, authenticated;
revoke all on function public.sound_mapping_entries(jsonb) from public, anon, authenticated;

create or replace function public.create_commit_atomic(
  p_branch_id uuid,
  p_author_id uuid,
  p_message text,
  p_snapshot jsonb,
  p_parent_commit_id uuid,
  p_merged_from_branch_id uuid
)
returns commits
language plpgsql
set search_path to 'public'
as $function$
declare
  v_commit public.commits;
begin
  insert into public.commits (branch_id, author_id, message, snapshot, parent_commit_id, merged_from_branch_id)
  values (p_branch_id, p_author_id, p_message, p_snapshot, p_parent_commit_id, p_merged_from_branch_id)
  returning * into v_commit;

  update public.branches
  set head_commit_id = v_commit.id
  where id = p_branch_id;

  insert into public.drafts (branch_id, user_id, snapshot, updated_at)
  values (p_branch_id, p_author_id, p_snapshot, now())
  on conflict (branch_id, user_id)
  do update set snapshot = excluded.snapshot, updated_at = excluded.updated_at;

  return v_commit;
end;
$function$;

alter policy drafts_select on public.drafts
  using (user_id = (select auth.uid()) and can_edit_project(branch_project_id(branch_id)));
alter policy drafts_insert on public.drafts
  with check (user_id = (select auth.uid()) and can_edit_project(branch_project_id(branch_id)));
alter policy drafts_update on public.drafts
  using (user_id = (select auth.uid()) and can_edit_project(branch_project_id(branch_id)))
  with check (user_id = (select auth.uid()) and can_edit_project(branch_project_id(branch_id)));
alter policy drafts_delete on public.drafts
  using (user_id = (select auth.uid()) and can_edit_project(branch_project_id(branch_id)));

alter function public.sound_mapping_entries(jsonb) set search_path = public;
