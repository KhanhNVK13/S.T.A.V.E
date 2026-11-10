-- UC-108 — Xử lý sự cố thanh toán.
-- Toàn bộ hiệu chỉnh của một lần xử lý sự cố nằm trong MỘT hàm Postgres
-- (`resolve_payment_issue`) để lỗi bất kỳ => rollback toàn bộ, sự cố vẫn
-- giữ trạng thái 'open'. Không sửa/xoá giao dịch cũ — mọi hiệu chỉnh là dòng
-- giao dịch MỚI (BR-121, BR-87).
-- An toàn khi chạy lại: CREATE OR REPLACE + ADD COLUMN IF NOT EXISTS.

-- Liên kết dòng giao dịch mới với dòng giao dịch gốc (bù đền / hoàn tiền).
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS related_transaction_id uuid
    REFERENCES public.transactions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS transactions_related_transaction_id_idx
  ON public.transactions (related_transaction_id);

-- Cột trạng thái xử lý của sự cố (bảng gốc đã có `resolved_by`).
ALTER TABLE public.payment_issues
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz;

CREATE INDEX IF NOT EXISTS payment_issues_status_created_idx
  ON public.payment_issues (status, created_at DESC, id DESC);

-- ============================================================================
-- Hàm kích hoạt gói DÙNG CHUNG
-- ============================================================================
-- Tách từ `billing_complete_order` để biện pháp 'activate' của UC-108 dùng
-- đúng logic kích hoạt như hoàn tất đơn (không tự viết lại lần nữa).
-- Trả về id của dòng `subscriptions` sau khi kích hoạt.
CREATE OR REPLACE FUNCTION public.billing_apply_subscription(
  p_user_id uuid,
  p_plan_id uuid,
  p_amount_vnd bigint
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sub public.subscriptions%ROWTYPE;
  v_sub_id uuid;
  v_period_start timestamptz;
  v_is_renew boolean := false;
BEGIN
  IF p_user_id IS NULL OR p_plan_id IS NULL THEN
    RAISE EXCEPTION 'transaction has no user or plan' USING ERRCODE = 'ST009';
  END IF;

  SELECT * INTO v_sub FROM public.subscriptions WHERE user_id = p_user_id FOR UPDATE;
  v_period_start := now();
  IF FOUND AND v_sub.plan_id = p_plan_id AND v_sub.status = 'active' THEN
    v_is_renew := true;
    v_period_start := greatest(now(), coalesce(v_sub.current_period_end, now()));
  END IF;

  INSERT INTO public.subscriptions AS s
    (id, user_id, plan_id, status, price_locked_vnd, started_at, current_period_end,
     pending_plan_id, grace_until, renewal_notified_at)
  VALUES
    (gen_random_uuid(), p_user_id, p_plan_id, 'active', p_amount_vnd, now(),
     v_period_start + interval '1 month', NULL, NULL, NULL)
  ON CONFLICT (user_id) DO UPDATE SET
    plan_id = EXCLUDED.plan_id,
    status = EXCLUDED.status,
    price_locked_vnd = EXCLUDED.price_locked_vnd,
    started_at = CASE WHEN v_is_renew THEN s.started_at ELSE EXCLUDED.started_at END,
    current_period_end = EXCLUDED.current_period_end,
    pending_plan_id = NULL,
    grace_until = NULL,
    renewal_notified_at = NULL
  RETURNING s.id INTO v_sub_id;

  RETURN v_sub_id;
END;
$$;

REVOKE ALL ON FUNCTION public.billing_apply_subscription(uuid, uuid, bigint)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.billing_apply_subscription(uuid, uuid, bigint)
  TO service_role;

-- Hoàn tất đơn dùng lại hàm kích hoạt chung (hành vi giữ nguyên).
CREATE OR REPLACE FUNCTION public.billing_complete_order(p_order_code bigint, p_success boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tx public.transactions%ROWTYPE;
  v_plan_name text;
  v_sub_id uuid;
  v_activated boolean := false;
  v_activation_error text;
  v_issue_created boolean := false;
BEGIN
  SELECT * INTO v_tx FROM public.transactions
  WHERE order_code = p_order_code AND status = 'pending'
  FOR UPDATE;

  IF NOT FOUND THEN
    SELECT * INTO v_tx FROM public.transactions WHERE order_code = p_order_code FOR UPDATE;
    IF FOUND AND p_success AND v_tx.status = 'failed' THEN
      INSERT INTO public.payment_issues (id, transaction_id, description, status, created_at)
      VALUES (gen_random_uuid(), v_tx.id,
              'Cổng thanh toán báo thành công sau khi giao dịch đã bị đánh dấu thất bại', 'open', now())
      ON CONFLICT DO NOTHING;
      v_issue_created := FOUND;
    END IF;
    SELECT name INTO v_plan_name FROM public.subscription_plans WHERE id = v_tx.plan_id;
    RETURN jsonb_build_object(
      'processed', false,
      'status', v_tx.status,
      'user_id', v_tx.user_id,
      'plan_id', v_tx.plan_id,
      'plan_name', v_plan_name,
      'amount_vnd', v_tx.amount_vnd,
      'transaction_id', v_tx.id,
      'subscription_id', null,
      'activated', null,
      'activation_error', null,
      'issue_created', v_issue_created
    );
  END IF;

  SELECT name INTO v_plan_name FROM public.subscription_plans WHERE id = v_tx.plan_id;

  IF NOT p_success THEN
    UPDATE public.transactions SET status = 'failed' WHERE id = v_tx.id;
    RETURN jsonb_build_object(
      'processed', true,
      'status', 'failed',
      'user_id', v_tx.user_id,
      'plan_id', v_tx.plan_id,
      'plan_name', v_plan_name,
      'amount_vnd', v_tx.amount_vnd,
      'transaction_id', v_tx.id,
      'subscription_id', null,
      'activated', false,
      'activation_error', null,
      'issue_created', false
    );
  END IF;

  UPDATE public.transactions SET status = 'success' WHERE id = v_tx.id;

  BEGIN
    v_sub_id := public.billing_apply_subscription(v_tx.user_id, v_tx.plan_id, v_tx.amount_vnd);
    v_activated := true;
  EXCEPTION WHEN OTHERS THEN
    v_sub_id := NULL;
    v_activated := false;
    v_activation_error := SQLERRM;
  END;

  IF NOT v_activated THEN
    INSERT INTO public.payment_issues (id, transaction_id, description, status, created_at)
    VALUES (gen_random_uuid(), v_tx.id, 'Thanh toán thành công nhưng chưa kích hoạt gói', 'open', now())
      ON CONFLICT DO NOTHING;
    v_issue_created := FOUND;
  END IF;

  RETURN jsonb_build_object(
    'processed', true,
    'status', 'success',
    'user_id', v_tx.user_id,
    'plan_id', v_tx.plan_id,
    'plan_name', v_plan_name,
    'amount_vnd', v_tx.amount_vnd,
    'transaction_id', v_tx.id,
    'subscription_id', v_sub_id,
    'activated', v_activated,
    'activation_error', v_activation_error,
    'issue_created', v_issue_created
  );
END;
$$;

REVOKE ALL ON FUNCTION public.billing_complete_order(bigint, boolean) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.billing_complete_order(bigint, boolean) TO service_role;

-- ============================================================================
-- Xử lý sự cố thanh toán — MỘT hàm, mọi thay đổi cùng giao dịch DB
-- ============================================================================
-- Mã lỗi (SQLSTATE) để backend dịch sang HTTP:
--   ST001 sự cố không tồn tại
--   ST002 sự cố đã được xử lý (409)
--   ST003 biện pháp không hợp lệ
--   ST004 ghi chú trống / quá dài
--   ST005 số ngày đền bù không hợp lệ
--   ST006 thông tin hoàn tiền không hợp lệ
--   ST007 sự cố trùng không hợp lệ
--   ST008 giao dịch gốc chưa thanh toán thành công
--   ST009 giao dịch gốc thiếu người dùng / gói
--   ST010 người dùng chưa có gói đăng ký để đền bù
CREATE OR REPLACE FUNCTION public.resolve_payment_issue(
  p_issue_id uuid,
  p_remedy text,
  p_note text,
  p_admin_id uuid DEFAULT NULL,
  p_days integer DEFAULT NULL,
  p_refund_amount_vnd bigint DEFAULT NULL,
  p_refund_ref text DEFAULT NULL,
  p_duplicate_of_issue_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_issue public.payment_issues%ROWTYPE;
  v_tx public.transactions%ROWTYPE;
  v_new_tx_id uuid;
  v_subscription_id uuid;
  v_period_end timestamptz;
  v_note text;
  v_refund_ref text;
  v_tx_user_id uuid;
  v_tx_plan_id uuid;
BEGIN
  IF p_issue_id IS NULL THEN
    RAISE EXCEPTION 'payment issue not found' USING ERRCODE = 'ST001';
  END IF;

  SELECT * INTO v_issue FROM public.payment_issues WHERE id = p_issue_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'payment issue not found' USING ERRCODE = 'ST001';
  END IF;

  IF v_issue.status IS DISTINCT FROM 'open' THEN
    RAISE EXCEPTION 'payment issue already resolved' USING ERRCODE = 'ST002';
  END IF;

  IF p_remedy IS NULL OR p_remedy NOT IN ('extend', 'refund', 'activate', 'dismiss') THEN
    RAISE EXCEPTION 'invalid remedy' USING ERRCODE = 'ST003';
  END IF;

  v_note := btrim(coalesce(p_note, ''));
  IF v_note = '' OR length(v_note) > 1000 THEN
    RAISE EXCEPTION 'note is required' USING ERRCODE = 'ST004';
  END IF;

  SELECT * INTO v_tx FROM public.transactions WHERE id = v_issue.transaction_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'transaction not found' USING ERRCODE = 'ST009';
  END IF;
  v_tx_user_id := v_tx.user_id;
  v_tx_plan_id := v_tx.plan_id;

  IF p_remedy = 'extend' THEN
    IF p_days IS NULL OR p_days < 1 OR p_days > 90 THEN
      RAISE EXCEPTION 'invalid compensation days' USING ERRCODE = 'ST005';
    END IF;
    IF v_tx_user_id IS NULL THEN
      RAISE EXCEPTION 'transaction has no user' USING ERRCODE = 'ST009';
    END IF;

    INSERT INTO public.transactions
      (id, user_id, plan_id, amount_vnd, kind, status, description, payer_name, payer_email,
       related_transaction_id, created_at)
    VALUES
      (gen_random_uuid(), v_tx_user_id, v_tx_plan_id, 0, 'compensation', 'success',
       'Đền bù ' || p_days::text || ' ngày', v_tx.payer_name, v_tx.payer_email,
       v_tx.id, now())
    RETURNING id INTO v_new_tx_id;

    UPDATE public.subscriptions
    SET current_period_end = greatest(now(), coalesce(current_period_end, now()))
                            + make_interval(days => p_days)
    WHERE user_id = v_tx_user_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'no subscription to compensate' USING ERRCODE = 'ST010';
    END IF;

    SELECT current_period_end INTO v_period_end FROM public.subscriptions WHERE user_id = v_tx_user_id;
  ELSIF p_remedy = 'refund' THEN
    v_refund_ref := btrim(coalesce(p_refund_ref, ''));
    IF v_refund_ref = '' OR length(v_refund_ref) > 200 THEN
      RAISE EXCEPTION 'refund reference is required' USING ERRCODE = 'ST006';
    END IF;
    IF p_refund_amount_vnd IS NULL
       OR p_refund_amount_vnd < 1
       OR p_refund_amount_vnd > v_tx.amount_vnd THEN
      RAISE EXCEPTION 'invalid refund amount' USING ERRCODE = 'ST006';
    END IF;

    INSERT INTO public.transactions
      (id, user_id, plan_id, amount_vnd, kind, status, provider_ref, description,
       payer_name, payer_email, related_transaction_id, created_at)
    VALUES
      (gen_random_uuid(), v_tx_user_id, v_tx_plan_id, p_refund_amount_vnd, 'refund', 'success',
       v_refund_ref, 'Hoàn tiền ' || v_refund_ref, v_tx.payer_name, v_tx.payer_email,
       v_tx.id, now())
    RETURNING id INTO v_new_tx_id;
  ELSIF p_remedy = 'activate' THEN
    IF v_tx.status <> 'success' THEN
      RAISE EXCEPTION 'transaction is not successful' USING ERRCODE = 'ST008';
    END IF;
    IF v_tx_user_id IS NULL OR v_tx_plan_id IS NULL THEN
      RAISE EXCEPTION 'transaction has no user or plan' USING ERRCODE = 'ST009';
    END IF;

    -- Dùng lại đúng logic kích hoạt của hoàn tất đơn; không tạo dòng giao
    -- dịch mới vì không có tiền mới được thu (giao dịch gốc đã thành công).
    v_subscription_id := public.billing_apply_subscription(v_tx_user_id, v_tx_plan_id, v_tx.amount_vnd);
  ELSIF p_remedy = 'dismiss' THEN
    IF p_duplicate_of_issue_id IS NULL OR p_duplicate_of_issue_id = p_issue_id THEN
      RAISE EXCEPTION 'duplicate issue is required' USING ERRCODE = 'ST007';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.payment_issues WHERE id = p_duplicate_of_issue_id) THEN
      RAISE EXCEPTION 'duplicate issue not found' USING ERRCODE = 'ST007';
    END IF;
  END IF;

  UPDATE public.payment_issues
  SET status = 'resolved',
      remedy = p_remedy,
      note = v_note,
      resolved_at = now(),
      resolved_by = p_admin_id
  WHERE id = p_issue_id;

  RETURN jsonb_build_object(
    'issue_id', p_issue_id,
    'status', 'resolved',
    'remedy', p_remedy,
    'transaction_id', v_issue.transaction_id,
    'created_transaction_id', v_new_tx_id,
    'subscription_id', v_subscription_id,
    'current_period_end', v_period_end,
    'user_id', v_tx_user_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_payment_issue(
  uuid, text, text, uuid, integer, bigint, text, uuid
) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_payment_issue(
  uuid, text, text, uuid, integer, bigint, text, uuid
) TO service_role;
