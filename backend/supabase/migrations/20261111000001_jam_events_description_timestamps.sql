-- Community Jam: `JamService.createEvent` ghi 3 cột này nhưng không migration nào tạo chúng.
-- An toàn khi chạy lại (IF NOT EXISTS).

ALTER TABLE public.jam_events
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

NOTIFY pgrst, 'reload schema';
