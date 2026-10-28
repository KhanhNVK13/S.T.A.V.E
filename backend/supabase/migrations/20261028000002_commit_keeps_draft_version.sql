create or replace function public.create_commit_atomic(
  p_branch_id uuid,
  p_author_id uuid,
  p_message text,
  p_snapshot jsonb,
  p_parent_commit_id uuid,
  p_merged_from_branch_id uuid
)
returns public.commits
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
  do update set
    snapshot = excluded.snapshot,
    updated_at = case
      when public.drafts.snapshot is distinct from excluded.snapshot
        then excluded.updated_at
      else public.drafts.updated_at
    end;

  return v_commit;
end;
$function$;
