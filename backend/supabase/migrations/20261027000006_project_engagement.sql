insert into public.platform_settings (key, value)
values
  ('ranking_weight_play', '1'::jsonb),
  ('ranking_weight_fork', '5'::jsonb),
  ('ranking_weight_comment', '3'::jsonb),
  ('ranking_window_days', '7'::jsonb)
on conflict (key) do nothing;

create or replace view public.project_engagement
with (security_invoker = true)
as
with cfg as (
  select
    coalesce((select (s.value #>> '{}')::numeric from public.platform_settings s where s.key = 'ranking_weight_play'), 1) as w_play,
    coalesce((select (s.value #>> '{}')::numeric from public.platform_settings s where s.key = 'ranking_weight_fork'), 5) as w_fork,
    coalesce((select (s.value #>> '{}')::numeric from public.platform_settings s where s.key = 'ranking_weight_comment'), 3) as w_comment,
    now() - make_interval(days => coalesce((select (s.value #>> '{}')::int from public.platform_settings s where s.key = 'ranking_window_days'), 7)) as since
),
plays as (
  select pp.project_id,
         count(distinct pp.user_id)::int as total,
         (count(distinct pp.user_id) filter (where pp.created_at >= (select since from cfg)))::int as recent
  from public.project_plays pp
  join public.projects p on p.id = pp.project_id
  join public.users u on u.id = pp.user_id and u.status = 'active'
  where pp.user_id <> p.owner_id
  group by pp.project_id
),
forks as (
  select f.forked_from_project_id as project_id,
         count(distinct f.owner_id)::int as total,
         (count(distinct f.owner_id) filter (where f.created_at >= (select since from cfg)))::int as recent
  from public.projects f
  join public.projects p on p.id = f.forked_from_project_id
  join public.users u on u.id = f.owner_id and u.status = 'active'
  where f.owner_id <> p.owner_id
  group by f.forked_from_project_id
),
remarks as (
  select c.project_id,
         count(distinct c.author_id)::int as total,
         (count(distinct c.author_id) filter (where c.created_at >= (select since from cfg)))::int as recent
  from public.comments c
  join public.projects p on p.id = c.project_id
  join public.users u on u.id = c.author_id and u.status = 'active'
  where c.author_id <> p.owner_id
  group by c.project_id
)
select
  p.id as project_id,
  p.name,
  p.genre,
  p.created_at,
  (p.visibility = 'public' and p.archived_at is null and p.moderation_hidden_at is null and o.status = 'active') as is_visible,
  coalesce(pl.total, 0) as plays,
  coalesce(fk.total, 0) as forks,
  coalesce(rm.total, 0) as comments,
  (cfg.w_play * coalesce(pl.total, 0) + cfg.w_fork * coalesce(fk.total, 0) + cfg.w_comment * coalesce(rm.total, 0))::numeric as score_all,
  (cfg.w_play * coalesce(pl.recent, 0) + cfg.w_fork * coalesce(fk.recent, 0) + cfg.w_comment * coalesce(rm.recent, 0))::numeric as score_recent,
  ((cfg.w_play * coalesce(pl.recent, 0) + cfg.w_fork * coalesce(fk.recent, 0) + cfg.w_comment * coalesce(rm.recent, 0))
    / ln((cfg.w_play * coalesce(pl.total, 0) + cfg.w_fork * coalesce(fk.total, 0) + cfg.w_comment * coalesce(rm.total, 0)) + 10))::numeric as trending_score
from public.projects p
join public.users o on o.id = p.owner_id
cross join cfg
left join plays pl on pl.project_id = p.id
left join forks fk on fk.project_id = p.id
left join remarks rm on rm.project_id = p.id;

revoke all on public.project_engagement from public, anon, authenticated;
grant select on public.project_engagement to service_role;
