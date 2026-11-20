-- Deleting a project (or its owner) failed when any commit had a tag, because
-- commit_tags.project_id referenced projects without ON DELETE CASCADE.
ALTER TABLE public.commit_tags
  DROP CONSTRAINT commit_tags_project_id_fkey,
  ADD CONSTRAINT commit_tags_project_id_fkey
    FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;
