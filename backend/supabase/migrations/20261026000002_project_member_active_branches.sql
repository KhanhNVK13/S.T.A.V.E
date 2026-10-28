create table if not exists public.project_member_active_branches (
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  updated_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

create index if not exists project_member_active_branches_branch_idx
  on public.project_member_active_branches (branch_id);

alter table public.project_member_active_branches enable row level security;

create policy "project_member_active_branches_select_own"
  on public.project_member_active_branches for select
  using (user_id = (select auth.uid()));
create policy "project_member_active_branches_insert_own"
  on public.project_member_active_branches for insert
  with check (user_id = (select auth.uid()));
create policy "project_member_active_branches_update_own"
  on public.project_member_active_branches for update
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "project_member_active_branches_delete_own"
  on public.project_member_active_branches for delete
  using (user_id = (select auth.uid()));

grant all on public.project_member_active_branches to service_role;
