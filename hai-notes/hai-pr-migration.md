# PR: Billing migration đợt 1 + gói mẫu

Nhánh: `feature/billing-migration-batch-one` (từ `main` 5031821)

## Thay đổi

- `backend/supabase/migrations/20261025140000_hai_billing.sql`
  - `subscription_plans`: thêm `description`, `is_default`, `sort_order`, `price_effective_at`; chỉ 1 gói mặc định (`subscription_plans_one_default`); tên gói duy nhất không phân biệt hoa thường (`subscription_plans_name_key` trên `lower(name)`).
  - `subscriptions`: thêm `pending_plan_id`, `grace_until`, `renewal_notified_at`; mỗi người tối đa 1 dòng (`subscriptions_user_key`).
  - `transactions`: thêm `plan_id`, `order_code` (unique), `kind` (`charge`/`refund`/`compensation`), `description`, `payer_name`, `payer_email`, `retry_of`; `user_id` bỏ NOT NULL.
  - Đổi 2 khoá ngoại (xem dưới).
  - `payment_issues`: mỗi giao dịch tối đa 1 sự cố đang mở (`payment_issues_one_open_per_transaction`, partial unique index `WHERE status = 'open'`).
  - Gói mẫu: `Free` (0đ, mặc định) và `STAVE+` (49.000đ).
  - RLS bật cho 4 bảng. Chỉ có policy SELECT cho `authenticated`: gói đang bật; đăng ký/giao dịch của chính mình; sự cố của giao dịch của chính mình. Không có policy ghi.
  - Hàm `public.billing_complete_order(p_order_code bigint, p_success boolean) → jsonb` (SECURITY DEFINER, chỉ `service_role` được gọi).
- `shared-types/src/billing.ts`: `PLAN_FEATURES`, `PlanFeatureKey`; 1 dòng `export * from "./billing"` trong `shared-types/src/index.ts`.

## Lý do đổi 2 khoá ngoại

- `transactions.user_id` → `ON DELETE SET NULL`: bản ghi giao dịch phải còn sau khi tài khoản bị xoá (admin vẫn thấy giao dịch kèm `payer_name`/`payer_email` đã lưu lúc giao dịch).
- `subscriptions.user_id` → `ON DELETE CASCADE`: gói đăng ký xoá theo tài khoản.
- Đặc tả ghi hiện cả hai FK chặn việc xoá tài khoản. Ghi chú §99 trong `project-state/archive/05-collaboration-and-hardening.md` lại ghi `transactions.user_id` vốn đã CASCADE (tức xoá tài khoản thì mất luôn giao dịch). Dù hiện trạng là cái nào, sau migration hành vi là SET NULL / CASCADE như trên. Trưởng nhóm kiểm giúp FK thật trước khi áp.
- Migration bỏ mọi FK khác tên đang nằm trên cột `user_id` của 2 bảng này trước khi tạo FK mới, để không còn FK cũ (vd CASCADE) chạy song song.

## Giá mẫu

`STAVE+` = 49.000đ là **giá mẫu**, trưởng nhóm chốt. Đổi giá sau khi áp: sửa qua trang quản trị gói (UC-106) hoặc `UPDATE` tay. Không sửa file migration đã áp.

## Hàm `billing_complete_order`

- Khoá dòng giao dịch `pending` theo `order_code` (`FOR UPDATE`). Không có dòng `pending` thì trả `processed: false` kèm trạng thái hiện tại, không đổi gì. Gọi lại hoặc gọi đồng thời 2 lần chỉ kích hoạt 1 lần.
- `p_success = false`: giao dịch `failed`, không kích hoạt gì.
- `p_success = true`: đặt giao dịch `success`, rồi (trong khối con có `EXCEPTION`) upsert `subscriptions`: gói của giao dịch, `active`, `price_locked_vnd` = số tiền giao dịch, xoá `pending_plan_id`/`grace_until`/`renewal_notified_at`. Kỳ mới: cùng gói còn hạn/ân hạn → `max(now, current_period_end) + 1 tháng` (gia hạn); khác gói hoặc đã hết → `now + 1 tháng`.
- Kích hoạt lỗi → giao dịch vẫn `success`, tạo `payment_issues` mở "Thanh toán thành công nhưng chưa kích hoạt gói" trong cùng giao dịch DB.
- Đơn đã `failed` mà cổng báo thành công muộn → không sửa giao dịch, tạo `payment_issues` mở "Cổng thanh toán báo thành công sau khi giao dịch đã bị đánh dấu thất bại" (mỗi giao dịch tối đa 1 sự cố mở).
- Trả: `{ processed, status, user_id, plan_id, plan_name, amount_vnd, transaction_id, subscription_id, activated, activation_error, issue_created }`.

## Cách chạy lại an toàn

Mọi lệnh đều chạy lại được: `ADD COLUMN IF NOT EXISTS`, `CREATE UNIQUE INDEX IF NOT EXISTS`, `DROP CONSTRAINT IF EXISTS` trước `ADD CONSTRAINT`, `DROP POLICY IF EXISTS` trước `CREATE POLICY`, `INSERT ... ON CONFLICT DO NOTHING`, `CREATE OR REPLACE FUNCTION`.

## Cách tự kiểm (đã làm, không đụng DB thật)

Đã chạy trên Postgres 17 tạm trong Docker, với schema giả dựng theo đúng cột trong đặc tả (2 biến thể: cột `status` kiểu enum và kiểu text; FK cũ tên khác, đang CASCADE):

1. Áp migration 2 lần liên tiếp: không lỗi, vẫn đúng 2 gói.
2. FK sau migration: `transactions_user_id_fkey ... ON DELETE SET NULL`, `subscriptions_user_id_fkey ... ON DELETE CASCADE`. FK cũ khác tên đã bị bỏ.
3. `billing_complete_order`: thành công → 1 dòng `subscriptions` hết hạn sau 1 tháng. Gọi lại → `processed: false`. Thất bại → `failed`. `order_code` không tồn tại → `processed: false`. Kích hoạt lỗi → giao dịch vẫn `success`, `activated: false`. 2 phiên gọi đồng thời → chỉ 1 phiên xử lý.
4. Tạo sự cố mở thứ 2 cho cùng giao dịch → bị chặn.
5. RLS với vai trò `authenticated`: chỉ thấy gói đang bật và dữ liệu của chính mình. Gọi hàm → bị từ chối.
6. Xoá tài khoản → giao dịch còn (`user_id` NULL), đăng ký bị xoá.

## Ảnh hưởng bảng / API dùng chung

- Không có code cũ nào đọc 4 bảng này, nên không có truy vấn cũ bị ảnh hưởng.
- `subscriptions` giờ có 2 FK tới `subscription_plans` (`plan_id`, `pending_plan_id`). Truy vấn nhúng từ `subscriptions` phải chỉ đích danh: `plan:subscription_plans!subscriptions_plan_id_fkey(...)`, nếu không PostgREST báo `PGRST201`.

## Câu hỏi cho trưởng nhóm

1. Trước khi áp, chạy `select tablename, policyname, cmd, roles, qual from pg_policies where tablename in ('subscription_plans','subscriptions','transactions','payment_issues');`. Nếu đã có policy cũ rộng hơn (vd SELECT mọi gói, kể cả gói đã tắt) thì cần bỏ, vì policy cộng dồn theo OR.
2. FK `transactions.subscription_id → subscriptions` hiện không có `ON DELETE`. Nếu sau này có code ghi cột này, việc xoá tài khoản sẽ bị chặn (CASCADE xoá `subscriptions` nhưng giao dịch còn trỏ tới). Hàm hoàn tất đơn vì vậy **không** ghi cột này. Có nên đổi FK đó thành `ON DELETE SET NULL` không?
3. Nếu bảng thật đã có ràng buộc `UNIQUE(name)` (tên mặc định trùng `subscription_plans_name_key`), lệnh tạo chỉ mục `lower(name)` sẽ bị bỏ qua và tên gói vẫn phân biệt hoa thường. Kiểm `\d subscription_plans` trước khi áp.
4. Chốt giá STAVE+ (đang là 49.000đ mẫu).
