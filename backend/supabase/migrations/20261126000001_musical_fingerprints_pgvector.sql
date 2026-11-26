create extension if not exists vector with schema extensions;

create table if not exists public.project_musical_fingerprints (
  project_id uuid primary key references public.projects(id) on delete cascade,
  embedding extensions.vector(24) not null,
  tempo integer not null,
  tonality_tonic text,
  tonality_mode text check (tonality_mode in ('major', 'minor')),
  note_density real not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.project_musical_fingerprints enable row level security;

revoke all on public.project_musical_fingerprints from public, anon, authenticated;
grant select, insert, update, delete on public.project_musical_fingerprints to service_role;

create index if not exists project_musical_fingerprints_embedding_hnsw_idx
  on public.project_musical_fingerprints
  using hnsw (embedding extensions.vector_cosine_ops);

create index if not exists project_musical_fingerprints_tempo_idx
  on public.project_musical_fingerprints (tempo);

create index if not exists project_musical_fingerprints_mode_idx
  on public.project_musical_fingerprints (tonality_mode);

create or replace function public.match_similar_projects(
  p_project_id uuid,
  p_limit integer default 6
)
returns table (
  project_id uuid,
  similarity double precision,
  tempo integer,
  tonality_tonic text,
  tonality_mode text
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  with src as (
    select f.embedding
    from public.project_musical_fingerprints f
    join public.projects p on p.id = f.project_id
    join public.users o on o.id = p.owner_id
    where f.project_id = p_project_id
      and p.visibility = 'public'
      and p.archived_at is null
      and p.moderation_hidden_at is null
      and o.status = 'active'
  )
  select
    f.project_id,
    (1 - (f.embedding <=> src.embedding))::double precision as similarity,
    f.tempo,
    f.tonality_tonic,
    f.tonality_mode
  from src
  join public.project_musical_fingerprints f on f.project_id <> p_project_id
  join public.projects p on p.id = f.project_id
  join public.users o on o.id = p.owner_id
  where p.visibility = 'public'
    and p.archived_at is null
    and p.moderation_hidden_at is null
    and o.status = 'active'
  order by f.embedding <=> src.embedding asc
  limit least(greatest(coalesce(p_limit, 6), 1), 12);
$$;

revoke all on function public.match_similar_projects(uuid, integer) from public, anon, authenticated;
grant execute on function public.match_similar_projects(uuid, integer) to service_role;
