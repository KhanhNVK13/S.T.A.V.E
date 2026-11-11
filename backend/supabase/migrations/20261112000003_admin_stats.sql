-- Aggregate platform statistics for the admin dashboard. Counts only: no
-- function here returns a user id, a project name or any project content.
-- Periods are [p_from, p_to) in UTC. Called only by the backend (service_role).

create or replace function public.admin_stats_summary(
  p_from timestamptz,
  p_to timestamptz
)
returns table (
  o_total_users bigint,
  o_first_user_at timestamptz,
  o_new_users bigint,
  o_active_users bigint,
  o_projects bigint,
  o_commits bigint,
  o_branches bigint,
  o_merges bigint,
  o_forks bigint,
  o_pull_requests bigint,
  o_revenue_vnd bigint,
  o_failed_transactions bigint,
  o_open_reports bigint,
  o_open_payment_issues bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    (select count(*) from public.users),
    (select min(u.created_at) from public.users u),
    (select count(*) from public.users u where u.created_at >= p_from and u.created_at < p_to),
    (select count(distinct l.user_id) from public.activity_log l
       where l.action = 'auth.sign_in' and l.created_at >= p_from and l.created_at < p_to),
    (select count(*) from public.projects p where p.created_at >= p_from and p.created_at < p_to),
    (select count(*) from public.commits c where c.created_at >= p_from and c.created_at < p_to),
    (select count(*) from public.branches b where b.created_at >= p_from and b.created_at < p_to),
    (select count(*) from public.commits c
       where c.merged_from_branch_id is not null
         and c.created_at >= p_from and c.created_at < p_to),
    (select count(*) from public.projects p
       where p.forked_from_project_id is not null
         and p.created_at >= p_from and p.created_at < p_to),
    (select count(*) from public.pull_requests r where r.created_at >= p_from and r.created_at < p_to),
    (select coalesce(sum(t.amount_vnd), 0) from public.transactions t
       where t.status::text = 'success' and t.created_at >= p_from and t.created_at < p_to),
    (select count(*) from public.transactions t
       where t.status::text = 'failed' and t.created_at >= p_from and t.created_at < p_to),
    (select count(*) from public.reports r where r.status::text = 'pending'),
    (select count(*) from public.payment_issues i where i.status::text = 'open');
$$;

create or replace function public.admin_stats_series(
  p_from timestamptz,
  p_to timestamptz,
  p_bucket text
)
returns table (
  o_bucket timestamptz,
  o_new_users bigint,
  o_active_users bigint,
  o_new_projects bigint,
  o_commits bigint,
  o_branches bigint,
  o_merges bigint,
  o_forks bigint,
  o_pull_requests bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_bucket not in ('day', 'week', 'month') then
    raise exception 'INVALID_BUCKET' using errcode = '22023';
  end if;

  return query
  with buckets as (
    select g as b
    from generate_series(
      date_trunc(p_bucket, p_from at time zone 'UTC'),
      date_trunc(p_bucket, (p_to - interval '1 microsecond') at time zone 'UTC'),
      ('1 ' || p_bucket)::interval
    ) as g
  ),
  new_users as (
    select date_trunc(p_bucket, u.created_at at time zone 'UTC') as b, count(*) as n
    from public.users u
    where u.created_at >= p_from and u.created_at < p_to
    group by 1
  ),
  active_users as (
    select date_trunc(p_bucket, l.created_at at time zone 'UTC') as b,
           count(distinct l.user_id) as n
    from public.activity_log l
    where l.action = 'auth.sign_in' and l.created_at >= p_from and l.created_at < p_to
    group by 1
  ),
  new_projects as (
    select date_trunc(p_bucket, p.created_at at time zone 'UTC') as b, count(*) as n
    from public.projects p
    where p.created_at >= p_from and p.created_at < p_to
    group by 1
  ),
  forks as (
    select date_trunc(p_bucket, p.created_at at time zone 'UTC') as b, count(*) as n
    from public.projects p
    where p.forked_from_project_id is not null
      and p.created_at >= p_from and p.created_at < p_to
    group by 1
  ),
  commit_counts as (
    select date_trunc(p_bucket, c.created_at at time zone 'UTC') as b,
           count(*) as n,
           count(*) filter (where c.merged_from_branch_id is not null) as merges
    from public.commits c
    where c.created_at >= p_from and c.created_at < p_to
    group by 1
  ),
  new_branches as (
    select date_trunc(p_bucket, br.created_at at time zone 'UTC') as b, count(*) as n
    from public.branches br
    where br.created_at >= p_from and br.created_at < p_to
    group by 1
  ),
  pull_counts as (
    select date_trunc(p_bucket, r.created_at at time zone 'UTC') as b, count(*) as n
    from public.pull_requests r
    where r.created_at >= p_from and r.created_at < p_to
    group by 1
  )
  select (bk.b at time zone 'UTC')::timestamptz,
         coalesce(nu.n, 0),
         coalesce(au.n, 0),
         coalesce(np.n, 0),
         coalesce(cc.n, 0),
         coalesce(nb.n, 0),
         coalesce(cc.merges, 0),
         coalesce(fk.n, 0),
         coalesce(pc.n, 0)
  from buckets bk
  left join new_users nu on nu.b = bk.b
  left join active_users au on au.b = bk.b
  left join new_projects np on np.b = bk.b
  left join commit_counts cc on cc.b = bk.b
  left join new_branches nb on nb.b = bk.b
  left join forks fk on fk.b = bk.b
  left join pull_counts pc on pc.b = bk.b
  order by bk.b;
end;
$$;

create or replace function public.admin_stats_plans()
returns table (o_plan_name text, o_count bigint)
language sql
stable
security definer
set search_path = public
as $$
  select sp.name, count(*)
  from public.subscriptions s
  join public.subscription_plans sp on sp.id = s.plan_id
  where s.status::text = 'active'
  group by sp.name, sp.sort_order
  order by sp.sort_order, sp.name;
$$;

revoke all on function public.admin_stats_summary(timestamptz, timestamptz)
  from public, anon, authenticated;
revoke all on function public.admin_stats_series(timestamptz, timestamptz, text)
  from public, anon, authenticated;
revoke all on function public.admin_stats_plans()
  from public, anon, authenticated;
grant execute on function public.admin_stats_summary(timestamptz, timestamptz) to service_role;
grant execute on function public.admin_stats_series(timestamptz, timestamptz, text) to service_role;
grant execute on function public.admin_stats_plans() to service_role;
