# Ghi chú PR đợt 2 — Gia hạn, ân hạn và bộ quét billing

## Vì sao không có "trừ tiền định kỳ"

PayOS chỉ là cổng QR code / chuyển khoản, không có chức năng lưu thẻ hay tự trừ
tiền định kỳ (khác Stripe/CBTS). Vì vậy mô hình vận hành của STAVE+ là:

1. **Nhắc gia hạn** — bộ quét `BillingSchedulerService` gửi thông báo
   `billing.renewal_due` ở các mốc: T-3 ngày trước khi hết hạn, đúng ngày hết
   hạn, và mỗi ngày trong 3 ngày ân hạn.
2. **Người dùng tự gia hạn** — nút "Gia hạn ngay" ở `/plans` (hiện khi còn ≤ 3
   ngày hoặc đang ân hạn) tạo đơn mới qua `POST /subscriptions/renew` và chuyển
   tới trang thanh toán.
3. **Ân hạn 3 ngày (BR-86)** — quá ngày hết hạn mà chưa trả thì bộ quét đặt
   `grace_until = current_period_end + 3 ngày`; trong lúc đó người dùng vẫn giữ
   quyền gói trả phí. Hết ân hạn mà vẫn chưa trả thì hiệu lực tự rơi về gói
   miễn phí theo thời gian (`resolveEffectivePlan`), không cần job xoá.

## Giá gia hạn (BR-119)

`computeRenewalPrice` (mô-đun thuần `backend/src/billing/renewal.ts`):

- `plan.price_effective_at` là `null` hoặc đã ≤ hôm nay → thu **giá mới**
  `plan.price_vnd`.
- Giá mới chưa có hiệu lực → giữ **giá đã khoá** `price_locked_vnd` (số tiền
  kỳ trước người dùng thực trả).

Khi thanh toán thành công, RPC `billing_complete_order` (mở rộng trong migration
đợt 2) nối kỳ: `current_period_end = GREATEST(now(), current_period_end) + 1
tháng` (gia hạn sớm nối tiếp kỳ cũ; gia hạn trong ân hạn tính từ lúc trả),
đặt lại `price_locked_vnd = amount_vnd`, xoá `grace_until` và
`renewal_notified_at`.

## Bộ quét định kỳ

`BillingSchedulerService` (mẫu `jam.service.ts`): chạy 1 lần khi khởi động rồi
mỗi giờ; `clearInterval` khi module destroy. Tắt bằng
`BILLING_SCHEDULER_ENABLED=false` (đã thêm vào `backend/.env.example`) và tự
tắt khi `NODE_ENV=test`. Mỗi bước (mở ân hạn → nhắc gia hạn → áp dụng lịch
chuyển gói → đánh dấu đơn pending quá 30 phút) bọc try/catch riêng. Mọi ghi
đều là UPDATE có điều kiện nên an toàn khi chạy nhiều instance; với cổng PayOS,
đơn pending quá 30 phút được hỏi lại cổng trước khi quyết định.

## Hạ cấp đã đặt lịch

Hết kỳ, bộ quét áp dụng `pending_plan_id`: về gói Free thì chỉ gỡ lịch; sang
gói trả phí thì đổi `plan_id` và khoá giá gói mới, rồi thông báo
`billing.plan_changed`.

## Cần áp migration

`backend/supabase/migrations/20261106160231_hai_billing_batch_two.sql` — thêm
`remedy`/`note`/`reported_by` cho `payment_issues`, 2 index cho bộ quét và viết
lại `billing_complete_order` (thêm nhánh gia hạn). Trưởng nhóm áp lên production
như migration đợt 1.
