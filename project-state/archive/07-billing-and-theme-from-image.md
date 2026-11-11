# Archive 07 — Thanh toán STAVE+, theme từ ảnh, quản trị gói (06/11–11/11/2026)

> Nhật ký lịch sử, bất biến. Tóm tắt từ ghi chú PR và tiến độ của Hải (bản gốc đã chuyển ra `docs/`, bị `.gitignore` chặn). Nội dung dưới đây ghi mức verify thật: đã typecheck, test đơn vị và (cho phần UC-108) kiểm backend khởi động với DB test; **chưa** thử PayOS sandbox/thật và chưa kiểm tay trên giao diện.

## §146 — Billing STAVE+ (UC-73–77, 104–108) và theme từ ảnh (UC-79) (06/11–11/11/2026)

**Phạm vi đã có trên `main` (PR đợt 1, đợt 2 và `feature/admin-*`, gộp bằng #113, #114):**
- UC-73 xem gói (`GET /subscription-plans`, `GET /subscriptions/me`, trang `/plans`); UC-74 đăng ký STAVE+ (`POST /subscriptions/checkout`, webhook `POST /payments/payos/webhook`, `GET /payments/orders/:orderCode`, `POST .../sync`, trang `/billing/result`); UC-75 đổi gói (nâng cấp trả đủ giá gói mới, hạ cấp áp dụng hết kỳ); UC-76 huỷ/khôi phục gói (giữ quyền tới hết kỳ, không hoàn tiền); UC-77 lịch sử giao dịch, biên lai in được, báo sự cố.
- Gia hạn: PayOS không có trừ tiền định kỳ nên người dùng tự gia hạn; `BillingSchedulerService` nhắc ở T-3 ngày, ngày hết hạn và mỗi ngày trong 3 ngày ân hạn; quá ân hạn thì hiệu lực tự rơi về gói Free theo thời gian (`resolveEffectivePlan`), không có job xoá. Giá gia hạn: giá mới của gói nếu đã có hiệu lực, nếu không thì giá đã khoá của người dùng (`computeRenewalPrice`).
- UC-79 theme từ ảnh (chỉ STAVE+): `PUT /themes/me/custom`, `GET /themes/me/effective`, palette đúng 10 biến oklch ở `shared-types/src/theme.ts`, validator `isValidPalette` dùng chung FE/BE chống chèn CSS (BR-90, BR-91).
- UC-104–107 admin: xem và xuất CSV giao dịch (chống CSV injection), tạo gói (nháp hoặc mở bán, cảnh báo trùng tính năng với Free), đổi giá có hiệu lực sau `price_change_notice_days` kèm thông báo, ngừng/mở bán lại gói. UC-108: xử lý sự cố thanh toán (đền bù ngày, hoàn tiền, kích hoạt thủ công, bỏ qua trùng) trong MỘT hàm Postgres `resolve_payment_issue`.

**Quyết định còn hiệu lực:**
1. Cổng thanh toán là interface (`PaymentGateway`) với `PayosGateway` và `FakeGateway`. Endpoint giả `/dev/fake-payment/*` chỉ bật khi `PAYMENT_PROVIDER=fake` ghi rõ và `NODE_ENV!=production`. Từ 11/11 backend còn từ chối khởi động nếu `NODE_ENV=production` mà không phải `payos`.
2. Mọi thay đổi trạng thái thanh toán đi qua hàm `billing_complete_order` (khoá dòng, idempotent). Kích hoạt lỗi thì giao dịch vẫn `success`, tự mở `payment_issues`; đơn đã `failed` mà cổng báo thành công thì không sửa giao dịch, chỉ mở sự cố.
3. `transactions.user_id` là `ON DELETE SET NULL` (giao dịch phải còn sau khi xoá tài khoản, kèm `payer_name`/`payer_email`), `subscriptions.user_id` là `CASCADE`. Không ghi `transactions.subscription_id` vì FK đó chặn xoá tài khoản.
4. Truy vấn nhúng từ `subscriptions` phải chỉ đích danh `subscription_plans!subscriptions_plan_id_fkey` (2 FK, tránh `PGRST201`).
5. Webhook hợp lệ nhưng DB lỗi thì trả 500 để PayOS gửi lại; đơn đã xử lý hoặc không tồn tại thì trả 200. `sync` gọi lại trong 3 giây trả trạng thái hiện tại, không hỏi cổng.
6. Hoàn tiền và đền bù không sửa hay xoá giao dịch cũ: luôn thêm dòng mới (`kind` = `refund`/`compensation`, `related_transaction_id`). Hoàn tiền chỉ cho giao dịch `charge` đã `success`, tổng hoàn không vượt số gốc (chỉ tính hoàn tiền `success`). Kích hoạt thủ công chỉ khi PayOS xác nhận `success` (backend gửi `p_provider_confirmed`).
7. Đổi sang gói cùng giá được coi là hạ cấp (không thu tiền, áp dụng hết kỳ); chưa được trưởng nhóm xác nhận.

**Migration (đã áp lên production ngày 11/11/2026 qua Supabase MCP):** `20261025140000_hai_billing`, `20261029120000_duc_jam`, `20261106000001_activity_log`, `20261106160231_hai_billing_batch_two`, `20261107000001_admin_custom_sound_max_usage`, `20261108000001_admin_report_groups`, `20261109000001_admin_billing_transactions_summary`, `20261110000001_admin_payment_issue_resolution`. Gói mẫu: Free 0đ và STAVE+ 49.000đ (giá giữ nguyên theo chủ dự án). Bảng liên quan đều rỗng trước khi áp.

**Thứ tự merge đã dùng:** P1 migration, rồi P2–P4 (cổng và checkout), P5–P6 (lịch sử, đổi, huỷ), đợt 2 (gia hạn, theme, admin).

**Chưa verify / còn treo:** PayOS sandbox hoặc thật (webhook, `sync`); thanh toán và biên lai trên giao diện thật; câu hỏi cho trưởng nhóm về `transactions_subscription_id_fkey`, policy cũ trên 4 bảng billing và `UNIQUE(name)` có sẵn của `subscription_plans` (kiểm `pg_policies` và `\d subscription_plans` trên production). Giao diện billing/admin đã được chuyển sang i18n EN/VI ngày 11/11/2026 (chưa có test render cho `plans-view`, `billing-history-view`).
