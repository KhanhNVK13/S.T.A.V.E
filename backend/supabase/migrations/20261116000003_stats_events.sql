-- Platform statistics must not change when an account or project is deleted
-- (UC-112 5.E1, UC-113 5.E1). Every counted event is appended to stats_events
-- by a trigger and is never deleted; the dashboard functions read from it.
-- Backend only (service_role). Counts only, no ids or names.

create table if not exists public.stats_events (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('user', 'project', 'commit', 'merge', 'branch', 'fork', 'pull_request')),
  created_at timestamptz not null
);

create index if not exists stats_events_kind_time_idx on public.stats_events (kind, created_at);

alter table public.stats_events enable row level security;
revoke all on table public.stats_events from public, anon, authenticated;
grant select, insert on table public.stats_events to service_role;

insert into public.stats_events (kind, created_at)
select 'user', created_at from public.users
union all select 'project', created_at from public.projects
union all select 'fork', created_at from public.projects where forked_from_project_id is not null
union all select 'commit', created_at from public.commits
union all select 'merge', created_at from public.commits where merged_from_branch_id is not null
union all select 'branch', created_at from public.branches
union all select 'pull_request', created_at from public.pull_requests;

create or replace function public.record_stats_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_table_name = 'users' then
    insert into public.stats_events (kind, created_at) values ('user', new.created_at);
  elsif tg_table_name = 'projects' then
    insert into public.stats_events (kind, created_at) values ('project', new.created_at);
    if new.forked_from_project_id is not null then
      insert into public.stats_events (kind, created_at) values ('fork', new.created_at);
    end if;
  elsif tg_table_name = 'commits' then
    insert into public.stats_events (kind, created_at) values ('commit', new.created_at);
    if new.merged_from_branch_id is not null then
      insert into public.stats_events (kind, created_at) values ('merge', new.created_at);
    end if;
  elsif tg_table_name = 'branches' then
    insert into public.stats_events (kind, created_at) values ('branch', new.created_at);
  elsif tg_table_name = 'pull_requests' then
    insert into public.stats_events (kind, created_at) values ('pull_request', new.created_at);
  end if;
  return new;
end;
$$;

revoke all on function public.record_stats_event() from public, anon, authenticated;

drop trigger if exists stats_event_users on public.users;
create trigger stats_event_users after insert on public.users
  for each row execute function public.record_stats_event();
drop trigger if exists stats_event_projects on public.projects;
create trigger stats_event_projects after insert on public.projects
  for each row execute function public.record_stats_event();
drop trigger if exists stats_event_commits on public.commits;
create trigger stats_event_commits after insert on public.commits
  for each row execute function public.record_stats_event();
drop trigger if exists stats_event_branches on public.branches;
create trigger stats_event_branches after insert on public.branches
  for each row execute function public.record_stats_event();
drop trigger if exists stats_event_pull_requests on public.pull_requests;
create trigger stats_event_pull_requests after insert on public.pull_requests
  for each row execute function public.record_stats_event();

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
    (select min(e.created_at) from public.stats_events e where e.kind = 'user'),
    (select count(*) from public.stats_events e where e.kind = 'user' and e.created_at >= p_from and e.created_at < p_to),
    (select count(distinct l.user_id) from public.activity_log l
       where l.action = 'auth.sign_in' and l.created_at >= p_from and l.created_at < p_to),
    (select count(*) from public.stats_events e where e.kind = 'project' and e.created_at >= p_from and e.created_at < p_to),
    (select count(*) from public.stats_events e where e.kind = 'commit' and e.created_at >= p_from and e.created_at < p_to),
    (select count(*) from public.stats_events e where e.kind = 'branch' and e.created_at >= p_from and e.created_at < p_to),
    (select count(*) from public.stats_events e where e.kind = 'merge' and e.created_at >= p_from and e.created_at < p_to),
    (select count(*) from public.stats_events e where e.kind = 'fork' and e.created_at >= p_from and e.created_at < p_to),
    (select count(*) from public.stats_events e where e.kind = 'pull_request' and e.created_at >= p_from and e.created_at < p_to),
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
  counted as (
    select date_trunc(p_bucket, e.created_at at time zone 'UTC') as b, e.kind, count(*) as n
    from public.stats_events e
    where e.created_at >= p_from and e.created_at < p_to
    group by 1, 2
  ),
  active_users as (
    select date_trunc(p_bucket, l.created_at at time zone 'UTC') as b,
           count(distinct l.user_id) as n
    from public.activity_log l
    where l.action = 'auth.sign_in' and l.created_at >= p_from and l.created_at < p_to
    group by 1
  )
  select (bk.b at time zone 'UTC')::timestamptz,
         coalesce((select c.n from counted c where c.b = bk.b and c.kind = 'user'), 0),
         coalesce(au.n, 0),
         coalesce((select c.n from counted c where c.b = bk.b and c.kind = 'project'), 0),
         coalesce((select c.n from counted c where c.b = bk.b and c.kind = 'commit'), 0),
         coalesce((select c.n from counted c where c.b = bk.b and c.kind = 'branch'), 0),
         coalesce((select c.n from counted c where c.b = bk.b and c.kind = 'merge'), 0),
         coalesce((select c.n from counted c where c.b = bk.b and c.kind = 'fork'), 0),
         coalesce((select c.n from counted c where c.b = bk.b and c.kind = 'pull_request'), 0)
  from buckets bk
  left join active_users au on au.b = bk.b
  order by bk.b;
end;
$$;

revoke all on function public.admin_stats_summary(timestamptz, timestamptz)
  from public, anon, authenticated;
revoke all on function public.admin_stats_series(timestamptz, timestamptz, text)
  from public, anon, authenticated;
grant execute on function public.admin_stats_summary(timestamptz, timestamptz) to service_role;
grant execute on function public.admin_stats_series(timestamptz, timestamptz, text) to service_role;
