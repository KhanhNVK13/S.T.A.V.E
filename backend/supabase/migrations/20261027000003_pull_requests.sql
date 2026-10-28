alter table public.pull_requests
  add column if not exists number bigint generated always as identity,
  add column if not exists description text not null default '',
  add column if not exists merge_branch_id uuid references public.branches(id) on delete set null,
  add column if not exists source_project_name text,
  add column if not exists target_project_name text,
  add column if not exists source_branch_name text,
  add column if not exists target_branch_name text;

alter table public.pull_requests
  alter column source_project_id drop not null,
  alter column source_branch_id drop not null,
  alter column target_project_id drop not null,
  alter column target_branch_id drop not null;

alter table public.pull_requests
  drop constraint if exists pull_requests_source_project_id_fkey,
  add constraint pull_requests_source_project_id_fkey
    foreign key (source_project_id) references public.projects(id) on delete set null;
alter table public.pull_requests
  drop constraint if exists pull_requests_target_project_id_fkey,
  add constraint pull_requests_target_project_id_fkey
    foreign key (target_project_id) references public.projects(id) on delete set null;
alter table public.pull_requests
  drop constraint if exists pull_requests_source_branch_id_fkey,
  add constraint pull_requests_source_branch_id_fkey
    foreign key (source_branch_id) references public.branches(id) on delete set null;
alter table public.pull_requests
  drop constraint if exists pull_requests_target_branch_id_fkey,
  add constraint pull_requests_target_branch_id_fkey
    foreign key (target_branch_id) references public.branches(id) on delete set null;

create unique index if not exists pull_requests_one_open_key
  on public.pull_requests (source_branch_id, target_branch_id)
  where status = 'open';

create index if not exists pull_requests_target_project_idx
  on public.pull_requests (target_project_id, status);
create index if not exists pull_requests_author_idx
  on public.pull_requests (author_id, status);
create index if not exists pull_request_comments_pr_idx
  on public.pull_request_comments (pull_request_id, created_at);
