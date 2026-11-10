-- UC-104 — truy vấn tổng hợp giao dịch cho quản trị viên.
-- Hàm chỉ được gọi từ backend bằng service_role; không mở quyền cho client.

CREATE INDEX IF NOT EXISTS transactions_admin_created_id_idx
  ON public.transactions (created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS transactions_admin_plan_idx
  ON public.transactions (plan_id);
CREATE INDEX IF NOT EXISTS transactions_admin_status_idx
  ON public.transactions (status);

-- Truy vấn sự cố theo giao dịch (màn chi tiết giao dịch của admin).
CREATE INDEX IF NOT EXISTS payment_issues_transaction_id_idx
  ON public.payment_issues (transaction_id);

-- Tổng hợp theo đúng bộ lọc của endpoint danh sách (không tính cursor/limit).
-- `to` là mốc độc (exclusive) để khớp với `.lt('created_at', to)` của truy vấn danh sách.
CREATE OR REPLACE FUNCTION public.admin_billing_summary(
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL,
  p_outcome text DEFAULT NULL,
  p_plan_id uuid DEFAULT NULL
)
RETURNS TABLE (
  total_charge_amount bigint,
  total_refund_amount bigint,
  success_count bigint,
  failed_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE(SUM(t.amount_vnd) FILTER (
      WHERE t.kind = 'charge' AND t.status = 'success'
    ), 0)::bigint,
    COALESCE(SUM(t.amount_vnd) FILTER (
      WHERE t.kind = 'refund' AND t.status = 'success'
    ), 0)::bigint,
    COUNT(*) FILTER (WHERE t.status = 'success')::bigint,
    COUNT(*) FILTER (WHERE t.status = 'failed')::bigint
  FROM public.transactions AS t
  WHERE (p_from IS NULL OR t.created_at >= p_from)
    AND (p_to IS NULL OR t.created_at < p_to)
    AND (p_outcome IS NULL OR t.status::text = p_outcome)
    AND (p_plan_id IS NULL OR t.plan_id = p_plan_id);
$$;

REVOKE ALL ON FUNCTION public.admin_billing_summary(timestamptz, timestamptz, text, uuid)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_billing_summary(timestamptz, timestamptz, text, uuid)
  TO service_role;
