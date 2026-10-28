create table if not exists public.commit_lineage (
  commit_id uuid primary key references public.commits(id) on delete cascade,
  origin_commit_id uuid not null
);

alter table public.commit_lineage enable row level security;

create index if not exists commit_lineage_origin_idx
  on public.commit_lineage (origin_commit_id);

grant all on public.commit_lineage to service_role;

create or replace function public.fork_project(
  p_source uuid,
  p_new_owner uuid,
  p_name text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source public.projects%rowtype;
  v_new_project uuid;
  v_branch record;
  v_commit record;
  v_new_id uuid;
  v_default_branch uuid;
  v_branch_map jsonb := '{}'::jsonb;
  v_commit_map jsonb := '{}'::jsonb;
begin
  select * into v_source from public.projects where id = p_source;
  if not found then
    raise exception 'source project not found';
  end if;

  insert into public.projects (
    owner_id, name, description, genre, license, visibility, forked_from_project_id
  )
  values (
    p_new_owner, p_name, v_source.description, v_source.genre, v_source.license,
    'private', p_source
  )
  returning id into v_new_project;

  for v_branch in
    select * from public.branches
    where project_id = p_source
    order by created_at, id
  loop
    insert into public.branches (project_id, name, is_default, created_by, created_at)
    values (v_new_project, v_branch.name, v_branch.is_default, p_new_owner, v_branch.created_at)
    returning id into v_new_id;

    v_branch_map := v_branch_map || jsonb_build_object(v_branch.id::text, v_new_id::text);

    if v_branch.is_default then
      v_default_branch := v_new_id;
    end if;
  end loop;

  for v_commit in
    select c.*
    from public.commits c
    join public.branches b on b.id = c.branch_id
    where b.project_id = p_source
    order by c.created_at, c.id
  loop
    insert into public.commits (
      branch_id, author_id, message, snapshot, parent_commit_id,
      merged_from_branch_id, merged_from_commit_id, created_at
    )
    values (
      (v_branch_map ->> v_commit.branch_id::text)::uuid,
      v_commit.author_id,
      v_commit.message,
      v_commit.snapshot,
      (v_commit_map ->> v_commit.parent_commit_id::text)::uuid,
      (v_branch_map ->> v_commit.merged_from_branch_id::text)::uuid,
      (v_commit_map ->> v_commit.merged_from_commit_id::text)::uuid,
      v_commit.created_at
    )
    returning id into v_new_id;

    v_commit_map := v_commit_map || jsonb_build_object(v_commit.id::text, v_new_id::text);

    insert into public.commit_lineage (commit_id, origin_commit_id)
    values (v_new_id, v_commit.id);
  end loop;

  for v_branch in
    select * from public.branches where project_id = p_source
  loop
    update public.branches
    set head_commit_id = (v_commit_map ->> v_branch.head_commit_id::text)::uuid,
        base_commit_id = (v_commit_map ->> v_branch.base_commit_id::text)::uuid
    where id = (v_branch_map ->> v_branch.id::text)::uuid;
  end loop;

  update public.projects
  set active_branch_id = v_default_branch
  where id = v_new_project;

  return v_new_project;
end;
$$;

revoke all on function public.fork_project(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.fork_project(uuid, uuid, text) to service_role;
