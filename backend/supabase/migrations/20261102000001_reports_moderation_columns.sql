-- Moderation report resolution columns.
--
-- `reports.reporter_id` is already nullable with ON DELETE SET NULL (see
-- account_deletion_foreign_keys), so only the missing columns and the
-- one-open-report-per-reporter guard are added here.

ALTER TABLE public.reports
  ADD COLUMN IF NOT EXISTS details text,
  ADD COLUMN IF NOT EXISTS resolution text CHECK (resolution IN ('upheld', 'dismissed')),
  ADD COLUMN IF NOT EXISTS resolution_note text;

-- A reporter may have at most one open report per project. Partial unique
-- index so resolved/dismissed rows do not block a fresh report.
CREATE UNIQUE INDEX IF NOT EXISTS reports_one_pending_per_reporter
  ON public.reports (project_id, reporter_id) WHERE status = 'pending';
