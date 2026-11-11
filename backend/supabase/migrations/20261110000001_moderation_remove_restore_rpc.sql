-- UC-102: the multi-write part of removing a violating project, done in one
-- Postgres transaction so the project is never hidden while its pending
-- reports stay open (5.E2: on any failure the project still shows). Called
-- only by the backend (service_role); the frontend never calls it directly.
--
-- The 404/409/410 decision and the audit/notification/sound-deletion steps
-- stay in `ModerationRemovalService` (testable with mocks); the RPC is just
-- the write part, matching the project's "multi-step write = RPC" rule.
--
-- NOTE: created as a file only — apply after team-lead sign-off, then verify
-- `has_function_privilege('service_role', '<fn>(<args>)', 'execute')` for each.

create or replace function public.moderation_remove_project(
  p_admin_id uuid,
  p_project_id uuid,
  p_reason text
)
returns table (status text, closed_reports integer, hidden_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_closed integer;
  v_hidden timestamptz;
begin
  -- Conditional hide: 0 rows means the project does not exist or another
  -- admin hid it first (race). Return a status instead of raising, so the
  -- caller maps 'not_removable' to 409 and a real DB error to 500.
  update public.projects
    set moderation_hidden_at = now(),
        moderation_hidden_reason = p_reason
    where id = p_project_id
      and moderation_hidden_at is null
    returning now() into v_hidden;

  if v_hidden is null then
    status := 'not_removable';
    closed_reports := 0;
    hidden_at := null;
    return next;
  end if;

  -- Close every pending report of the project in the same transaction.
  update public.reports
    set status = 'resolved',
        resolution = 'upheld',
        resolution_note = p_reason,
        resolved_by = p_admin_id,
        resolved_at = now()
    where project_id = p_project_id
      and status = 'pending';
  get diagnostics v_closed = row_count;

  status := 'removed';
  closed_reports := v_closed;
  hidden_at := v_hidden;
  return next;
end;
$$;

revoke all on function public.moderation_remove_project(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.moderation_remove_project(uuid, uuid, text)
  to service_role;

create or replace function public.moderation_restore_project(
  p_admin_id uuid,
  p_project_id uuid
)
returns table (status text)
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.projects
    set moderation_hidden_at = null,
        moderation_hidden_reason = null
    where id = p_project_id
      and moderation_hidden_at is not null;

  if found then
    status := 'restored';
  else
    status := 'not_removable';
  end if;
  return next;
end;
$$;

revoke all on function public.moderation_restore_project(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.moderation_restore_project(uuid, uuid)
  to service_role;

-- Distinct custom sounds of the project that belong to the project owner and
-- are still playable. DISTINCT runs server-side, so the 1000-row PostgREST
-- cap never truncates it. Self-deleted sounds (deleted_at set) are excluded
-- per the Q5 decision in docs/plan-uc102.md; flip `s.deleted_at is null` to
-- include them if that decision changes.
create or replace function public.moderation_project_owner_sound_ids(
  p_project_id uuid
)
returns table (sound_id uuid, sound_name text)
language sql
stable
security definer
set search_path = public
as $$
  select distinct sm.custom_sound_id, s.name
  from public.sound_mappings sm
  join public.custom_sounds s on s.id = sm.custom_sound_id
  where sm.project_id = p_project_id
    and s.owner_id = (select owner_id from public.projects where id = p_project_id)
    and s.deleted_at is null
  order by s.name;
$$;

revoke all on function public.moderation_project_owner_sound_ids(uuid)
  from public, anon, authenticated;
grant execute on function public.moderation_project_owner_sound_ids(uuid)
  to service_role;
