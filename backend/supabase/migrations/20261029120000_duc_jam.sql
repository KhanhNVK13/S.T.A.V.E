-- UC-66/93..95 (Đợt 2) — Community Jam: mở rộng `jam_events` + bảng `jam_participants`.
-- An toàn khi chạy lại (IF NOT EXISTS / DROP ... IF EXISTS / EXCEPTION).

-- `max_duration_sec` bị thay bằng cặp giờ `scheduled_start_at`/`scheduled_end_at`.
ALTER TABLE public.jam_events DROP COLUMN IF EXISTS max_duration_sec;

ALTER TABLE public.jam_events
  ADD COLUMN IF NOT EXISTS name text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS scheduled_start_at timestamptz,
  ADD COLUMN IF NOT EXISTS scheduled_end_at timestamptz,
  ADD COLUMN IF NOT EXISTS starting_project_id uuid,
  ADD COLUMN IF NOT EXISTS jam_project_id uuid,
  ADD COLUMN IF NOT EXISTS edit_cooldown_sec integer,
  ADD COLUMN IF NOT EXISTS no_result boolean NOT NULL DEFAULT false;

-- FK `starting_project_id`/`jam_project_id` → `projects` (idempotent: chỉ tạo khi chưa có).
ALTER TABLE public.jam_events
  DROP CONSTRAINT IF EXISTS jam_events_starting_project_id_fkey,
  ADD CONSTRAINT jam_events_starting_project_id_fkey
    FOREIGN KEY (starting_project_id) REFERENCES public.projects(id) ON DELETE SET NULL;

ALTER TABLE public.jam_events
  DROP CONSTRAINT IF EXISTS jam_events_jam_project_id_fkey,
  ADD CONSTRAINT jam_events_jam_project_id_fkey
    FOREIGN KEY (jam_project_id) REFERENCES public.projects(id) ON DELETE SET NULL;

-- `edit_cooldown_sec` (nếu có) phải nằm trong 1..3600.
ALTER TABLE public.jam_events
  DROP CONSTRAINT IF EXISTS jam_events_edit_cooldown_sec_check,
  ADD CONSTRAINT jam_events_edit_cooldown_sec_check
    CHECK (edit_cooldown_sec IS NULL OR edit_cooldown_sec BETWEEN 1 AND 3600);

-- Người tham gia sự kiện: mỗi (sự kiện, user) 1 dòng, đếm số lần edit (UC-95/68).
CREATE TABLE IF NOT EXISTS public.jam_participants (
  event_id uuid NOT NULL,
  user_id uuid NOT NULL,
  joined_at timestamptz NOT NULL DEFAULT now(),
  edit_count integer NOT NULL DEFAULT 0,
  PRIMARY KEY (event_id, user_id)
);

ALTER TABLE public.jam_participants
  DROP CONSTRAINT IF EXISTS jam_participants_event_id_fkey,
  ADD CONSTRAINT jam_participants_event_id_fkey
    FOREIGN KEY (event_id) REFERENCES public.jam_events(id) ON DELETE CASCADE,
  DROP CONSTRAINT IF EXISTS jam_participants_user_id_fkey,
  ADD CONSTRAINT jam_participants_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

-- RLS: lớp phòng thủ phụ (backend chạy bằng service_role bypass RLS).
ALTER TABLE public.jam_participants ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY jam_participants_select_authenticated
    ON public.jam_participants FOR SELECT TO authenticated
    USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
