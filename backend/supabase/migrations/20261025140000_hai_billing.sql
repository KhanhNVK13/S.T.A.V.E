-- UC-73..77 (Đợt 1) — Thanh toán STAVE+: bổ sung cột cho 4 bảng billing, gói mẫu, RLS
-- và hàm hoàn tất đơn `billing_complete_order`.
-- An toàn khi chạy lại (IF NOT EXISTS / DROP ... IF EXISTS / ON CONFLICT DO NOTHING / CREATE OR REPLACE).

ALTER TABLE public.subscription_plans
  ADD COLUMN IF NOT EXISTS description text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS is_default boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS price_effective_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS subscription_plans_one_default ON public.subscription_plans ((true)) WHERE is_default;
CREATE UNIQUE INDEX IF NOT EXISTS subscription_plans_name_key ON public.subscription_plans (lower(name));

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS pending_plan_id uuid REFERENCES public.subscription_plans(id),
  ADD COLUMN IF NOT EXISTS grace_until timestamptz,
  ADD COLUMN IF NOT EXISTS renewal_notified_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_user_key ON public.subscriptions (user_id);

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS plan_id uuid REFERENCES public.subscription_plans(id),
  ADD COLUMN IF NOT EXISTS order_code bigint UNIQUE,
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'charge' CHECK (kind IN ('charge','refund','compensation')),
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS payer_name text,
  ADD COLUMN IF NOT EXISTS payer_email text,
  ADD COLUMN IF NOT EXISTS retry_of uuid REFERENCES public.transactions(id);

-- Giao dịch phải còn sau khi xoá tài khoản (UC-104 3.E1); gói đăng ký xoá theo tài khoản.
-- Bỏ mọi FK khác tên trên cột user_id (nếu có) để không còn FK cũ chạy song song với FK mới.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.conrelid::regclass AS tbl, c.conname
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
    WHERE c.contype = 'f'
      AND cardinality(c.conkey) = 1
      AND a.attname = 'user_id'
      AND c.conrelid IN ('public.transactions'::regclass, 'public.subscriptions'::regclass)
      AND c.conname NOT IN ('transactions_user_id_fkey', 'subscriptions_user_id_fkey')
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', r.tbl, r.conname);
  END LOOP;
END $$;

ALTER TABLE public.transactions ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_user_id_fkey,
  ADD CONSTRAINT transactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE public.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_user_id_fkey,
  ADD CONSTRAINT subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

-- Mỗi giao dịch tối đa một sự cố đang mở (UC-77).
CREATE UNIQUE INDEX IF NOT EXISTS payment_issues_one_open_per_transaction
  ON public.payment_issues (transaction_id) WHERE status = 'open';

INSERT INTO public.subscription_plans
  (id, name, price_vnd, features, is_active, is_default, sort_order, description, created_at)
VALUES
  (gen_random_uuid(), 'Free', 0, '{}'::jsonb, true, true, 0,
   'Toàn bộ chức năng quản lý phiên bản, miễn phí không giới hạn.', now()),
  -- giá mẫu, trưởng nhóm chốt
  (gen_random_uuid(), 'STAVE+', 49000, '{"theme_from_image": true, "extra_storage": true}'::jsonb, true, false, 1,
   'Tạo theme giao diện từ ảnh của bạn và tăng thêm dung lượng lưu trữ.', now())
ON CONFLICT DO NOTHING;

-- RLS: lớp phòng thủ phụ (backend chạy bằng service_role bypass RLS). Không có policy ghi cho client.
ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_issues ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS subscription_plans_select_active ON public.subscription_plans;
CREATE POLICY subscription_plans_select_active
  ON public.subscription_plans FOR SELECT TO authenticated
  USING (is_active);

DROP POLICY IF EXISTS subscriptions_select_own ON public.subscriptions;
CREATE POLICY subscriptions_select_own
  ON public.subscriptions FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS transactions_select_own ON public.transactions;
CREATE POLICY transactions_select_own
  ON public.transactions FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS payment_issues_select_own ON public.payment_issues;
CREATE POLICY payment_issues_select_own
  ON public.payment_issues FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.transactions t
    WHERE t.id = payment_issues.transaction_id AND t.user_id = (select auth.uid())
  ));

-- UC-74: hoàn tất đơn theo order_code, idempotent (chỉ đơn còn 'pending' mới được xử lý).
-- Kích hoạt gói lỗi thì giao dịch vẫn 'success' và trả activated = false để backend ghi sự cố (5.E1).
CREATE OR REPLACE FUNCTION public.billing_complete_order(p_order_code bigint, p_success boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tx public.transactions%ROWTYPE;
  v_sub_id uuid;
  v_activated boolean := false;
  v_activation_error text;
BEGIN
  SELECT * INTO v_tx FROM public.transactions
  WHERE order_code = p_order_code AND status = 'pending'
  FOR UPDATE;

  IF NOT FOUND THEN
    SELECT * INTO v_tx FROM public.transactions WHERE order_code = p_order_code;
    RETURN jsonb_build_object(
      'processed', false,
      'status', v_tx.status,
      'user_id', v_tx.user_id,
      'plan_id', v_tx.plan_id,
      'transaction_id', v_tx.id,
      'subscription_id', null,
      'activated', null,
      'activation_error', null
    );
  END IF;

  IF NOT p_success THEN
    UPDATE public.transactions SET status = 'failed' WHERE id = v_tx.id;
    RETURN jsonb_build_object(
      'processed', true,
      'status', 'failed',
      'user_id', v_tx.user_id,
      'plan_id', v_tx.plan_id,
      'transaction_id', v_tx.id,
      'subscription_id', null,
      'activated', false,
      'activation_error', null
    );
  END IF;

  IF v_tx.user_id IS NOT NULL AND v_tx.plan_id IS NOT NULL THEN
    BEGIN
      INSERT INTO public.subscriptions AS s
        (id, user_id, plan_id, status, price_locked_vnd, started_at, current_period_end,
         pending_plan_id, grace_until, renewal_notified_at)
      VALUES
        (gen_random_uuid(), v_tx.user_id, v_tx.plan_id, 'active', v_tx.amount_vnd, now(),
         now() + interval '1 month', NULL, NULL, NULL)
      ON CONFLICT (user_id) DO UPDATE SET
        plan_id = EXCLUDED.plan_id,
        status = EXCLUDED.status,
        price_locked_vnd = EXCLUDED.price_locked_vnd,
        started_at = EXCLUDED.started_at,
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
  END IF;

  UPDATE public.transactions SET status = 'success' WHERE id = v_tx.id;

  RETURN jsonb_build_object(
    'processed', true,
    'status', 'success',
    'user_id', v_tx.user_id,
    'plan_id', v_tx.plan_id,
    'transaction_id', v_tx.id,
    'subscription_id', v_sub_id,
    'activated', v_activated,
    'activation_error', v_activation_error
  );
END;
$$;

REVOKE ALL ON FUNCTION public.billing_complete_order(bigint, boolean) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.billing_complete_order(bigint, boolean) TO service_role;
