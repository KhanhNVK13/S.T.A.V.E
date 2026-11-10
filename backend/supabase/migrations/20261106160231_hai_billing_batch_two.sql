-- UC-108 (Đợt 2) — Gia hạn, ân hạn và bộ quét billing.
-- Sự cố thanh toán: biện pháp xử lý, ghi chú của admin, người báo.
-- An toàn khi chạy lại (IF NOT EXISTS / DROP ... IF EXISTS / ON CONFLICT DO NOTHING).

ALTER TABLE public.payment_issues
  ADD COLUMN IF NOT EXISTS remedy text,
  ADD COLUMN IF NOT EXISTS note text,
  ADD COLUMN IF NOT EXISTS reported_by uuid;

ALTER TABLE public.payment_issues
  DROP CONSTRAINT IF EXISTS payment_issues_remedy_check,
  ADD CONSTRAINT payment_issues_remedy_check
    CHECK (remedy IS NULL OR remedy IN ('extend', 'refund', 'activate', 'dismiss'));

ALTER TABLE public.payment_issues
  DROP CONSTRAINT IF EXISTS payment_issues_reported_by_fkey,
  ADD CONSTRAINT payment_issues_reported_by_fkey
    FOREIGN KEY (reported_by) REFERENCES public.users(id) ON DELETE SET NULL;

-- Bộ quét tìm đăng ký sắp hết hạn / quá hạn và giao dịch pending cũ.
CREATE INDEX IF NOT EXISTS subscriptions_period_end_idx
  ON public.subscriptions (current_period_end) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS transactions_pending_created_idx
  ON public.transactions (created_at) WHERE status = 'pending';

-- Hoàn tất đơn (đợt 2).
--   - Gia hạn (giao dịch cùng gói với gói đang dùng, subscription 'active'):
--     kỳ mới = GREATEST(now(), current_period_end) + 1 tháng, nên gia hạn sớm
--     nối tiếp kỳ cũ, còn gia hạn trong ân hạn bắt đầu từ lúc trả.
--   - price_locked_vnd = số tiền vừa thu (giá gia hạn đã tính ở API theo BR-119).
--   - grace_until và renewal_notified_at được xoá để kỳ mới bắt đầu sạch.
--   - Đăng ký mới / nâng cấp: kỳ hạn mới tính từ now().
--   - Vẫn idempotent (chỉ đơn 'pending' mới xử lý) và vẫn tạo payment_issues khi
--     kích hoạt lỗi.
CREATE OR REPLACE FUNCTION public.billing_complete_order(p_order_code bigint, p_success boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tx public.transactions%ROWTYPE;
  v_sub public.subscriptions%ROWTYPE;
  v_plan_name text;
  v_sub_id uuid;
  v_period_start timestamptz;
  v_is_renew boolean := false;
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
    IF v_tx.user_id IS NULL OR v_tx.plan_id IS NULL THEN
      RAISE EXCEPTION 'transaction has no user or plan';
    END IF;

    SELECT * INTO v_sub FROM public.subscriptions WHERE user_id = v_tx.user_id FOR UPDATE;
    v_period_start := now();
    IF FOUND AND v_sub.plan_id = v_tx.plan_id AND v_sub.status = 'active' THEN
      v_is_renew := true;
      v_period_start := greatest(now(), coalesce(v_sub.current_period_end, now()));
    END IF;

    INSERT INTO public.subscriptions AS s
      (id, user_id, plan_id, status, price_locked_vnd, started_at, current_period_end,
       pending_plan_id, grace_until, renewal_notified_at)
    VALUES
      (gen_random_uuid(), v_tx.user_id, v_tx.plan_id, 'active', v_tx.amount_vnd, now(),
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
