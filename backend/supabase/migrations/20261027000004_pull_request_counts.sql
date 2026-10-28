alter table public.pull_requests
  add column if not exists new_commit_count integer not null default 0,
  add column if not exists has_conflicts boolean not null default false;
