-- UC-101/102/103 (Vũ, 25/10): moderation report columns + reporter FK fix.
--
-- The `reports` table already exists with: id, project_id, reporter_id,
-- reason, status ('pending'/'resolved'), resolved_by, resolved_at,
-- created_at. `projects.moderation_hidden_at` and
-- `projects.moderation_hidden_reason` already exist, and the Explore
-- queries already filter `moderation_hidden_at IS NULL` (explorer filters
-- public projects that have not been hidden).
--
-- This migration adds the resolution columns needed by UC-102/UC-103 and
-- loosens the reporter FK so removing a reporter's account does not
-- cascade-break their historical reports.

ALTER TABLE public.reports
  ADD COLUMN IF NOT EXISTS details text,
  ADD COLUMN IF NOT EXISTS resolution text CHECK (resolution IN ('upheld', 'dismissed')),
  ADD COLUMN IF NOT EXISTS resolution_note text;

ALTER TABLE public.reports ALTER COLUMN reporter_id DROP NOT NULL;

ALTER TABLE public.reports DROP CONSTRAINT IF EXISTS reports_reporter_id_fkey,
  ADD CONSTRAINT reports_reporter_id_fkey FOREIGN KEY (reporter_id) REFERENCES public.users(id) ON DELETE SET NULL;

-- A reporter may have at most one open report per project. Partial unique
-- index so resolved/dismissed rows do not block a fresh report.
CREATE UNIQUE INDEX IF NOT EXISTS reports_one_pending_per_reporter
  ON public.reports (project_id, reporter_id) WHERE status = 'pending';
