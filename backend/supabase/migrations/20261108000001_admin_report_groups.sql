-- Admin report list: one row per reported project, paginated in SQL so the
-- PostgREST 1000-row cap never truncates a group. Called only by the backend
-- (service_role) through AdminReportsService.listGroups.
--
-- `status` / `reason` are compared as text so the function works whether the
-- columns are text or enums. A NULL project_id (reports whose project row no
-- longer exists, if reports.project_id is ON DELETE SET NULL) forms one group.

create or replace function public.admin_report_groups(
  p_status text,
  p_resolution text,
  p_limit integer,
  p_offset integer
)
returns table (
  project_id uuid,
  report_count integer,
  latest_at timestamptz,
  reasons jsonb,
  resolution text,
  resolution_note text,
  resolved_at timestamptz,
  total_groups bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with filtered as (
    select r.project_id, r.reason::text as reason, r.created_at,
           r.resolution, r.resolution_note, r.resolved_at
    from public.reports r
    where r.status::text = p_status
      and (p_resolution is null or r.resolution = p_resolution)
  ),
  grouped as (
    select f.project_id,
           count(*)::integer as report_count,
           max(f.created_at) as latest_at,
           max(f.resolved_at) as resolved_at
    from filtered f
    group by f.project_id
  ),
  paged as (
    select g.project_id, g.report_count, g.latest_at, g.resolved_at,
           count(*) over () as total_groups
    from grouped g
    order by g.latest_at desc, g.project_id
    limit least(greatest(p_limit, 1), 100)
    offset greatest(p_offset, 0)
  ),
  reason_counts as (
    select f.project_id, f.reason, count(*) as reason_count
    from filtered f
    where exists (
      select 1 from paged p where p.project_id is not distinct from f.project_id
    )
    group by f.project_id, f.reason
  ),
  reason_json as (
    select rc.project_id,
           jsonb_agg(
             jsonb_build_object('reason', rc.reason, 'count', rc.reason_count)
             order by rc.reason_count desc, rc.reason
           ) as reasons
    from reason_counts rc
    group by rc.project_id
  ),
  latest_decision as (
    select distinct on (f.project_id)
           f.project_id, f.resolution, f.resolution_note
    from filtered f
    where exists (
      select 1 from paged p where p.project_id is not distinct from f.project_id
    )
    order by f.project_id, f.resolved_at desc nulls last, f.created_at desc
  )
  select p.project_id,
         p.report_count,
         p.latest_at,
         j.reasons,
         d.resolution,
         d.resolution_note,
         p.resolved_at,
         p.total_groups
  from paged p
  left join reason_json j on j.project_id is not distinct from p.project_id
  left join latest_decision d on d.project_id is not distinct from p.project_id
  order by p.latest_at desc, p.project_id;
$$;

revoke all on function public.admin_report_groups(text, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.admin_report_groups(text, text, integer, integer)
  to service_role;
