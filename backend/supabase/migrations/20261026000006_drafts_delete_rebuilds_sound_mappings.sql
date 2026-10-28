create or replace function public.rebuild_sound_mappings_after_draft_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project uuid;
begin
  delete from public.sound_mappings sm
  where sm.branch_id = old.branch_id and sm.commit_id is null;

  select b.project_id into v_project from public.branches b where b.id = old.branch_id;
  if v_project is null then
    return old;
  end if;

  insert into public.sound_mappings (project_id, branch_id, commit_id, track_id, pitch, custom_sound_id)
  select distinct v_project, d.branch_id, null::uuid, e.track_id, e.pitch, e.sound_id
  from public.drafts d
  cross join lateral public.sound_mapping_entries(d.snapshot) e
  where d.branch_id = old.branch_id
    and exists (select 1 from public.custom_sounds s where s.id = e.sound_id);

  return old;
end;
$$;

revoke all on function public.rebuild_sound_mappings_after_draft_delete() from public, anon, authenticated;

drop trigger if exists drafts_rebuild_sound_mappings_on_delete on public.drafts;
create trigger drafts_rebuild_sound_mappings_on_delete
after delete on public.drafts
for each row execute function public.rebuild_sound_mappings_after_draft_delete();
