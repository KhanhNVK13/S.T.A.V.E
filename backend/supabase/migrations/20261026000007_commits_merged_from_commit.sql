alter table public.commits
  add column if not exists merged_from_commit_id uuid references public.commits(id) on delete set null;

create index if not exists commits_merged_from_commit_idx
  on public.commits (merged_from_commit_id)
  where merged_from_commit_id is not null;

create or replace function public.create_merge_commit_atomic(
  p_branch_id uuid,
  p_author_id uuid,
  p_message text,
  p_snapshot jsonb,
  p_parent_commit_id uuid,
  p_merged_from_branch_id uuid,
  p_merged_from_commit_id uuid
)
returns commits
language plpgsql
set search_path to 'public'
as $function$
declare
  v_commit public.commits;
begin
  insert into public.commits (branch_id, author_id, message, snapshot, parent_commit_id, merged_from_branch_id, merged_from_commit_id)
  values (p_branch_id, p_author_id, p_message, p_snapshot, p_parent_commit_id, p_merged_from_branch_id, p_merged_from_commit_id)
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

revoke all on function public.create_merge_commit_atomic(uuid, uuid, text, jsonb, uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.create_merge_commit_atomic(uuid, uuid, text, jsonb, uuid, uuid, uuid) to service_role;
