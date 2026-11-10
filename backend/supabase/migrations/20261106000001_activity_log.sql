-- Nhật ký hoạt động người dùng (chỉ siêu dữ liệu) cho trang quản trị.
-- An toàn khi chạy lại: bảng và dữ liệu điền chỉ được tạo một lần (to_regclass),
-- hàm RPC dùng CREATE OR REPLACE. `target_id` KHÔNG có khoá ngoại để sự kiện về
-- dự án đã xoá vẫn còn trong nhật ký.

DO $$
BEGIN
  IF to_regclass('public.activity_log') IS NULL THEN
    CREATE TABLE public.activity_log (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
      action text NOT NULL,
      target_type text,
      target_id uuid,
      target_name text,
      ip_address text,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX activity_log_user_created_idx
      ON public.activity_log (user_id, created_at DESC, id DESC);

    ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;

    REVOKE ALL ON public.activity_log FROM anon, authenticated;
    GRANT SELECT, INSERT ON public.activity_log TO service_role;

    -- Điền lịch sử có sẵn. Mỗi nguồn chỉ chạy khi bảng nguồn tồn tại.
    IF to_regclass('public.sessions') IS NOT NULL THEN
      INSERT INTO public.activity_log (user_id, action, ip_address, created_at)
      SELECT s.user_id, 'auth.sign_in', split_part(s.ip_address::text, '/', 1), s.created_at
      FROM public.sessions s
      WHERE EXISTS (SELECT 1 FROM public.users u WHERE u.id = s.user_id);
    END IF;

    IF to_regclass('public.projects') IS NOT NULL THEN
      INSERT INTO public.activity_log
        (user_id, action, target_type, target_id, target_name, created_at)
      SELECT p.owner_id, 'project.created', 'project', p.id, p.name, p.created_at
      FROM public.projects p
      WHERE EXISTS (SELECT 1 FROM public.users u WHERE u.id = p.owner_id);
    END IF;

    -- CHƯA LÀM: điền 'subscription.started' từ public.subscriptions.
    -- Chưa có danh sách cột thật của bảng này nên không đoán tên cột. Khi có,
    -- thêm khối sau vào đây (thay <user_col>, <started_col>) rồi áp lại trên
    -- DB mới hoặc chạy riêng một lần:
    --
    -- IF to_regclass('public.subscriptions') IS NOT NULL THEN
    --   INSERT INTO public.activity_log (user_id, action, created_at)
    --   SELECT s.<user_col>, 'subscription.started', s.<started_col>
    --   FROM public.subscriptions s
    --   WHERE EXISTS (SELECT 1 FROM public.users u WHERE u.id = s.<user_col>);
    -- END IF;
  END IF;
END $$;

-- Phân trang keyset (created_at DESC, id DESC). Tham số hoá hoàn toàn, không
-- ghép chuỗi. `p_prefixes` NULL nghĩa là mọi loại hành động. Số dòng do
-- backend kẹp (MAX_ACTIVITY_LIMIT) và luôn gửi limit + 1; hàm không tự kẹp.
CREATE OR REPLACE FUNCTION public.admin_user_activity(
  p_user_id uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_prefixes text[],
  p_limit integer,
  p_cursor_created_at timestamptz,
  p_cursor_id uuid
)
RETURNS TABLE (
  id uuid,
  action text,
  target_type text,
  target_id uuid,
  target_name text,
  ip_address text,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT a.id, a.action, a.target_type, a.target_id, a.target_name,
         a.ip_address, a.created_at
  FROM public.activity_log a
  WHERE a.user_id = p_user_id
    AND a.created_at >= p_from
    AND a.created_at <= p_to
    AND (
      p_prefixes IS NULL
      OR EXISTS (
        SELECT 1 FROM unnest(p_prefixes) AS prefix
        WHERE starts_with(a.action, prefix)
      )
    )
    AND (
      p_cursor_created_at IS NULL
      OR (a.created_at, a.id) < (p_cursor_created_at, p_cursor_id)
    )
  ORDER BY a.created_at DESC, a.id DESC
  LIMIT p_limit;
$$;

REVOKE ALL ON FUNCTION public.admin_user_activity(
  uuid, timestamptz, timestamptz, text[], integer, timestamptz, uuid
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_user_activity(
  uuid, timestamptz, timestamptz, text[], integer, timestamptz, uuid
) TO service_role;
