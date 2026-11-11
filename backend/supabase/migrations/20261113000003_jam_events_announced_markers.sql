alter table public.jam_events
  add column if not exists started_announced_at timestamptz,
  add column if not exists ended_announced_at timestamptz;

update public.jam_events
  set started_announced_at = coalesce(started_at, now())
  where status in ('active', 'ended') and started_announced_at is null;

update public.jam_events
  set ended_announced_at = coalesce(ended_at, now())
  where status = 'ended' and ended_announced_at is null;
