-- Commits are append-only. Their content (id, message, snapshot, created_at) can never
-- change, even for service_role which bypasses RLS. Allowed updates:
--   * branch_id: deleteBranch re-homes commits that another branch still reaches;
--   * author_id, parent_commit_id, merged_from_branch_id, merged_from_commit_id: only
--     to NULL, which is what the ON DELETE SET NULL foreign keys do.

create or replace function public.commits_guard_immutable()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.id is distinct from old.id
     or new.message is distinct from old.message
     or new.snapshot is distinct from old.snapshot
     or new.created_at is distinct from old.created_at then
    raise exception 'commits are immutable' using errcode = '23001';
  end if;
  if (new.author_id is distinct from old.author_id and new.author_id is not null)
     or (new.parent_commit_id is distinct from old.parent_commit_id and new.parent_commit_id is not null)
     or (new.merged_from_branch_id is distinct from old.merged_from_branch_id and new.merged_from_branch_id is not null)
     or (new.merged_from_commit_id is distinct from old.merged_from_commit_id and new.merged_from_commit_id is not null) then
    raise exception 'commit links can only be cleared' using errcode = '23001';
  end if;
  return new;
end;
$$;

revoke all on function public.commits_guard_immutable() from public, anon, authenticated;

drop trigger if exists commits_immutable on public.commits;
create trigger commits_immutable
  before update on public.commits
  for each row execute function public.commits_guard_immutable();
