create table if not exists public.tags (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 50),
  created_at timestamptz not null default now()
);

create unique index if not exists tags_name_lower_key on public.tags (lower(name));

create table if not exists public.project_tags (
  project_id uuid not null references public.projects(id) on delete cascade,
  tag_id uuid not null references public.tags(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (project_id, tag_id)
);

create index if not exists project_tags_tag_id_idx on public.project_tags (tag_id);

alter table public.tags enable row level security;
alter table public.project_tags enable row level security;

grant select, insert, update, delete on public.tags to service_role;
grant select, insert, update, delete on public.project_tags to service_role;

create policy tags_select on public.tags for select using (true);

create policy project_tags_select on public.project_tags for select
  using (can_view_project(project_id));
create policy project_tags_insert on public.project_tags for insert
  with check (can_edit_project(project_id));
create policy project_tags_delete on public.project_tags for delete
  using (can_edit_project(project_id));
