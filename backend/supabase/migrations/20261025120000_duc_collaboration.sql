-- UC-60..65 Collaboration: thêm cột cho project_collaborators + comments.
-- An toàn khi chạy lại (IF NOT EXISTS / EXCEPTION / DROP ... IF EXISTS).

DO $$ BEGIN
  CREATE TYPE public.collaborator_status_enum AS ENUM ('pending', 'accepted');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.project_collaborators
  ADD COLUMN IF NOT EXISTS status public.collaborator_status_enum NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS responded_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS project_collaborators_project_user_key
  ON public.project_collaborators (project_id, user_id);

ALTER TABLE public.project_collaborators
  DROP CONSTRAINT IF EXISTS project_collaborators_user_id_fkey,
  ADD CONSTRAINT project_collaborators_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE,
  DROP CONSTRAINT IF EXISTS project_collaborators_invited_by_fkey,
  ADD CONSTRAINT project_collaborators_invited_by_fkey
    FOREIGN KEY (invited_by) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE public.comments
  ALTER COLUMN anchor_ref DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS track_id text,
  ADD COLUMN IF NOT EXISTS bar integer CHECK (bar >= 1),
  ADD COLUMN IF NOT EXISTS note_id text,
  ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES public.comments(id) ON DELETE CASCADE;

ALTER TABLE public.comments
  DROP CONSTRAINT IF EXISTS comments_body_length,
  ADD CONSTRAINT comments_body_length CHECK (char_length(body) BETWEEN 1 AND 1000);

CREATE INDEX IF NOT EXISTS comments_project_created_idx ON public.comments (project_id, created_at);
