-- UC-60..65 Collaboration: invitation status for project_collaborators + comment anchors.
-- project_collaborators already has UNIQUE (project_id, user_id) and
-- user_id ON DELETE CASCADE / invited_by ON DELETE SET NULL; those are left untouched.

DO $$ BEGIN
  CREATE TYPE public.collaborator_status_enum AS ENUM ('pending', 'accepted');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Existing rows were collaborators before invitations existed: backfill them as
-- accepted, then make 'pending' the default for new invitations.
ALTER TABLE public.project_collaborators
  ADD COLUMN IF NOT EXISTS status public.collaborator_status_enum NOT NULL DEFAULT 'accepted',
  ADD COLUMN IF NOT EXISTS responded_at timestamptz;

ALTER TABLE public.project_collaborators
  ALTER COLUMN status SET DEFAULT 'pending';

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
