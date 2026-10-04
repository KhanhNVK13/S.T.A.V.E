alter table public.sound_mappings
  drop constraint if exists sound_mappings_project_id_track_id_pitch_key;
alter table public.sound_mappings
  drop constraint if exists sound_mappings_custom_sound_id_fkey;

alter table public.sound_mappings
  add column if not exists branch_id uuid references public.branches(id) on delete cascade,
  add column if not exists commit_id uuid references public.commits(id) on delete cascade;

create index if not exists sound_mappings_branch_draft_idx
  on public.sound_mappings (branch_id) where commit_id is null;
create index if not exists sound_mappings_commit_idx
  on public.sound_mappings (commit_id) where commit_id is not null;
create index if not exists sound_mappings_project_idx
  on public.sound_mappings (project_id);

drop policy if exists "sound_mappings_insert" on public.sound_mappings;
drop policy if exists "sound_mappings_update" on public.sound_mappings;
drop policy if exists "sound_mappings_delete" on public.sound_mappings;

create or replace function public.sync_sound_mappings_from_snapshot()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project uuid;
  v_commit uuid;
begin
  select b.project_id into v_project from public.branches b where b.id = new.branch_id;
  if v_project is null then
    return new;
  end if;

  if tg_table_name = 'commits' then
    v_commit := new.id;
  else
    v_commit := null;
    delete from public.sound_mappings sm
    where sm.branch_id = new.branch_id and sm.commit_id is null;
  end if;

  insert into public.sound_mappings (project_id, branch_id, commit_id, track_id, pitch, custom_sound_id)
  select v_project, new.branch_id, v_commit, e.track_id, e.pitch, e.sound_id
  from (
    select
      t->>'id' as track_id,
      case when m.key ~ '^[0-9]{1,3}$' then m.key::integer end as pitch,
      case
        when m.value ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          then m.value::uuid
      end as sound_id
    from jsonb_array_elements(
      case when jsonb_typeof(new.snapshot->'tracks') = 'array' then new.snapshot->'tracks' else '[]'::jsonb end
    ) t
    cross join lateral jsonb_each_text(
      case when jsonb_typeof(t->'soundMap') = 'object' then t->'soundMap' else '{}'::jsonb end
    ) m
  ) e
  where e.track_id is not null
    and e.pitch between 0 and 127
    and e.sound_id is not null
    and exists (select 1 from public.custom_sounds s where s.id = e.sound_id);

  return new;
end;
$$;

revoke all on function public.sync_sound_mappings_from_snapshot() from public, anon, authenticated;

drop trigger if exists drafts_sync_sound_mappings on public.drafts;
create trigger drafts_sync_sound_mappings
after insert or update of snapshot on public.drafts
for each row execute function public.sync_sound_mappings_from_snapshot();

drop trigger if exists commits_sync_sound_mappings on public.commits;
create trigger commits_sync_sound_mappings
after insert on public.commits
for each row execute function public.sync_sound_mappings_from_snapshot();
