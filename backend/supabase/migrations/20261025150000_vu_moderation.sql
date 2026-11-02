-- Moderation schema (vu_moderation), created 25/10 per vu.md §Migration.
--
-- CREATED, NOT APPLIED. This is the canonical migration for the UC-101/102/103
-- moderation flow. It is idempotent (every DDL is IF-not-exists / drop-then-add)
-- so it can be applied on a fresh DB or alongside the rows already added on main:
--   - 20261026000003 already made reporter_id nullable with ON DELETE SET NULL,
--     so the FK lines here are safe no-ops on current main and only matter on
--     a fresh build where the original NOT NULL FK still exists.
--   - 20261102000001 already added the details/resolution/resolution_note columns
--     and the one-pending-per-reporter index, so on current main those sections
--     are no-ops.
--
-- The unique partial index guards UC-101 1.E1 (a reporter cannot open two
-- pending reports for the same project).

ALTER TABLE public.reports
  ADD COLUMN IF NOT EXISTS details text,
  ADD COLUMN IF NOT EXISTS resolution text CHECK (resolution IN ('upheld', 'dismissed')),
  ADD COLUMN IF NOT EXISTS resolution_note text;

ALTER TABLE public.reports ALTER COLUMN reporter_id DROP NOT NULL;

ALTER TABLE public.reports DROP CONSTRAINT IF EXISTS reports_reporter_id_fkey,
  ADD CONSTRAINT reports_reporter_id_fkey
  FOREIGN KEY (reporter_id) REFERENCES public.users(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS reports_one_pending_per_reporter
  ON public.reports (project_id, reporter_id) WHERE status = 'pending';
