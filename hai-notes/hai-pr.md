# PR — Đợt tính năng billing STAVE+ (UC-73 → UC-108, P1–P12)

> Tài liệu tổng hợp bàn giao cho Trưởng nhóm. Các file chi tiết theo đợt nằm cạnh file này:
> `hai-pr-migration.md` (đợt 1), `hai-pr-dot1.md` (UC-73→UC-77), `hai-pr-dot2-notes.md` (gia hạn/ân hạn), `hai-audit.md` (rà soát P12).
> Các commit liên quan đã nằm trên các nhánh `feature/billing-*`, `feature/admin-*`, `feature/theme-from-image-palette` — xem `hai-progress.md` để lấy commit theo từng prompt (P1–P12).

## 1. Tổng quan & danh sách UC đã thực hiện

| Nhóm | UC | Tính năng |
|---|---|---|
| Đợt 1 — nền tảng | Migration | 4 bảng billing + RLS + hàm `billing_complete_order` (idempotent, tự tạo sự cố khi kích hoạt lỗi) + 2 gói mẫu |
| | UC-73 | Trang `/plans`: danh sách gói, gói hiện tại, `?feature=` nổi bật, điều khoản huỷ (BR-84) |
| | UC-74 | Checkout STAVE+ (PayOS/cổng giả), webhook ký HMAC, `/billing/result` poll 30s + sync, idempotent, `retry_of`, kiểm `returnTo` chống open-redirect |
| | UC-75 | Đổi gói: nâng cấp thu toàn bộ giá gói mới (kỳ mới từ lúc trả); hạ cấp đặt lịch `pending_plan_id` áp dụng hết kỳ; huỷ hạ cấp |
| | UC-76 | Huỷ gói (giữ quyền đến hết kỳ, không hoàn tiền), tiếp tục gói, preview nêu ngày + dữ liệu không bị xoá |
| | UC-77 | Lịch sử giao dịch `/billing` (cursor), biên lai in được `/billing/receipts/[id]`, nút "Báo sự cố" (1 sự cố mở/giao dịch) |
| Đợt 2 — vận hành | Gia hạn/ân hạn | Bộ quét 1 giờ: nhắc `billing.renewal_due` (T-3, đúng hạn, mỗi ngày ân hạn), `grace_until = cpe+3d`, hết ân hạn tự về Free, hạ cấp đặt lịch, quét pending >30p → failed; giá gia hạn BR-119 |
| | UC-79 | Theme từ ảnh: k-means 5 cụm trên trình duyệt, chỉ 10 biến trang trí, oklch chặt (BR-90/91), `PUT /themes/me/custom`, BR-89 giữ palette khi hết gói |
| Admin | UC-104 | `/admin/transactions`: lọc + cursor + tổng kỳ, snapshot tài khoản đã xoá, retry liên kết, CSV, link tới `/admin/payment-issues` |
| | UC-105 | Tạo gói (tên duy nhất case-insensitive, danh mục tính năng + `extra_storage_mb`, nháp/mở bán) |
| | UC-106 | Đổi giá hẹn ngày (báo trước ≥ N ngày từ `platform_settings`), thông báo `billing.price_change`, người dùng giữ giá cũ đến hết kỳ (BR-120) |
| | UC-107 | Tắt/mở bán gói; không tắt gói Free; nêu số người đang dùng; không ảnh hưởng kỳ hiện tại (BR-120) |
| | UC-108 | Xử lý sự cố: đối chiếu cổng (match/mismatch/skipped/unavailable), 4 biện pháp `extend`/`refund`/`activate`/`dismiss` trong 1 transaction Postgres (lỗi ⇒ rollback, sự cố giữ mở), note ≤1000, `billing.issue_resolved`, audit log |

## 2. Migration & thứ tự áp dụng

Chạy **theo thứ tự tên file** (Supabase tự sắp theo timestamp); đây là phần thuộc PR này (các file khác là của các đợt khác):

1. `20261025140000_hai_billing.sql` — cột 4 bảng, RLS, 2 gói mẫu, đổi 2 FK (`transactions.user_id` SET NULL, `subscriptions.user_id` CASCADE), hàm `billing_complete_order`.
2. `20261106160231_hai_billing_batch_two.sql` — mở rộng `billing_complete_order` (gia hạn nối kỳ `max(now,cpe)+1m`, khác gói, tự tạo sự cố trong cùng transaction), `payment_issues` +3 cột, chỉ mục cần cho bộ quét.
3. `20261109000001_admin_billing_transactions_summary.sql` — tổng hợp kỳ cho UC-104.
4. `20261110000001_admin_payment_issue_resolution.sql` — hàm `resolve_payment_issue` (4 remedy, `FOR UPDATE`, 1 transaction), `payment_issues` +3 cột (mốc xử lý), audit `payment_issue.resolve`.

**Lưu ý trước khi áp** (đã xác nhận bằng Docker Postgres 17 ở P1): áp 2 lần không lỗi; trước khi áp kiểm `pg_policies` của 4 bảng billing — nếu có policy cũ rộng hơn thì bỏ (policy cộng dồn theo OR). Xem `hai-pr-migration.md` cho chi tiết.

## 3. API backend & route frontend mới

**API (bảo vệ: tất cả có `JwtAuthGuard` + `SessionAuthGuard`; nhóm `/admin/*` thêm `AdminGuard`; chỉ webhook không guard):**

- `GET /subscription-plans`, `GET /subscriptions/me` (UC-73)
- `POST /subscriptions/checkout` · `GET /payments/orders/:orderCode` · `POST /payments/orders/:orderCode/sync` (UC-74)
- `POST /payments/payos/webhook` — không guard, xác minh chữ ký PayOS trước, luôn trả 200 nếu xử lý xong, idempotent theo `order_code`
- `GET /subscriptions/change-preview` · `POST /subscriptions/change` · `POST /subscriptions/cancel-downgrade` (UC-75)
- `GET /subscriptions/cancel-preview` · `POST /subscriptions/cancel` · `POST /subscriptions/resume` (UC-76)
- `GET /subscriptions/renew` → checkout gia hạn (gia hạn)
- `GET /billing/transactions` · `GET /billing/transactions/:id/receipt` · `POST /billing/transactions/:id/issues` (UC-77)
- `GET /themes/me/effective` · `PUT /themes/me/custom` (UC-79)
- `GET /admin/transactions` · `GET /admin/transactions/:id` (UC-104)
- `GET/POST /admin/plans` · `PATCH /admin/plans/:id/price` · `POST /admin/plans/:id/activate|deactivate` (UC-105/106/107)
- `GET /admin/payment-issues` · `GET /admin/payment-issues/:id` · `POST /admin/payment-issues/:id/resolve` (UC-108)
- `GET/POST /dev/fake-payment/:orderCode...` — **chỉ đăng ký khi `PAYMENT_PROVIDER=fake` và `NODE_ENV !== 'production'`**

**Route frontend mới:** `/plans` · `/billing` · `/billing/receipts/[id]` · `/billing/result` · `/dev/fake-payment` (chỉ dev) · `/admin/transactions` · `/admin/plans` · `/admin/payment-issues` · `/admin/payment-issues/[id]`.

**Thông báo nội bộ mới:** `billing.payment_success/failed`, `billing.plan_changed`, `billing.canceled`, `billing.renewal_due`, `billing.price_change`, `billing.issue_resolved`.

## 4. Hướng dẫn test môi trường dev/fake

Cài đặt: DB test đã áp 4 migration ở mục 2; `backend/.env` có `PAYMENT_PROVIDER=fake` (viết chữ "fake" — để trống cổng giả **không** bật); `frontend/.env.local` có `NEXT_PUBLIC_PAYMENT_PROVIDER=fake`. Chạy backend `npm run start:dev`, frontend `npm run dev`, đăng nhập tài khoản `role = 'user'`.

1. **Thanh toán thành công:** `/plans` → card STAVE+ → "Nâng cấp lên STAVE+" → hộp xác nhận (giá, 1 tháng, điều khoản) → "Tiếp tục" → `/dev/fake-payment/<orderCode>` → "Thành công" → `/billing/result` hiện "Thanh toán thành công" → "Tiếp tục" về `/plans` (gói hiện tại = STAVE+). `/billing` có dòng "Thành công" + link "Biên lai". Chuông thông báo có "Thanh toán thành công".
2. **Thất bại:** trang giả → "Thất bại" → `/billing/result` "Thanh toán không thành công". Nâng cấp lại → dòng mới ghi "Thử lại sau lần thất bại <ngày>" (liên kết `retry_of`).
3. **Huỷ đơn:** trang giả → "Huỷ" → quay `/plans?canceled=1` hiện "Bạn đã huỷ thanh toán, chưa có gì thay đổi." Đơn để pending; bộ quét đánh dấu failed sau 30 phút (test: chờ hoặc hạ thấp ngưỡng trong code).
4. **Webhook lặp (idempotency):** gọi lại `POST /payments/payos/webhook` (hoặc bấm "Thành công" lần 2 trên trang giả rồi gọi `sync`) — kích hoạt **một lần duy nhất**; giao dịch sau trả "đã xử lý trước đó" nhưng vẫn HTTP 200.
5. **Nâng cấp / hạ cấp / huỷ / tiếp tục:** có các gói ≥2 (tạo thêm bằng `/admin/plans` của admin) → "Đổi gói" trên card → nâng cấp thu tiền (kỳ mới từ lúc trả); hạ cấp về Free đặt lịch "Sẽ chuyển sang Free vào <ngày>" + nút "Huỷ lịch hạ cấp". "Huỷ gói" → hộp nêu ngày hết hiệu lực → "Đã huỷ, hiệu lực đến <ngày>" + "Tiếp tục gói" (kỳ vẫn còn, không thu tiền).
6. **Gia hạn / ân hạn:** sửa `current_period_end` của subscription về trong 3 ngày (hoặc chạy bộ quét với clock giả) → nhận `billing.renewal_due`; nút "Gia hạn ngay" ở `/plans` → thanh toán xong kỳ nối tiếp (`max(now,cpe)+1m`). Để quá hạn → bộ quét mở ân hạn 3 ngày, nhắc mỗi ngày; hết ân hạn → tự về Free.
7. **Đổi giá hẹn ngày (admin):** `/admin/plans` → "Đổi giá" → nhập giá + ngày (ít nhất +7 ngày, đọc từ `platform_settings.price_change_notice_days`) → người dùng gói đó nhận `billing.price_change`; giá thật đổi chỉ khi đến `price_effective_at`, đến đó gia hạn sẽ thu giá mới (BR-119), người dùng giữ `price_locked_vnd` đến hết kỳ (BR-120).
8. **Tắt gói (admin):** "Tắt gói" → hộp nêu số người đang dùng + "quyền lợi hiện tại không bị ảnh hưởng" → gói biến khỏi `/plans` của người mới, vẫn hiện cho người đang dùng kèm ngày hết.
9. **Xử lý sự cố (admin):** `/admin/payment-issues` (từ link "Xem sự cố thanh toán" của `/admin/transactions` khi lọc "Thất bại" hoặc khi kích hoạt lỗi tạo sự cố tự động) → chi tiết: timeline giao dịch, badge "Đối chiếu cổng: khớp/không khớp/bỏ qua (cổng giả)/không kiểm tra được" → chọn biện pháp:
   - `extend`: gia hạn N ngày (1–90) + tạo giao dịch bù 0đ — chỉ khi cổng báo success.
   - `refund`: ghi nhận hoàn tiền (tiền thật hoàn ở PayOS, STAVE chỉ ghi nhận) — số tiền ≤ tiền gốc, có `refundRef`.
   - `activate`: kích hoạt gói cho giao dịch success chưa kích hoạt — gói từ **giao dịch gốc** (ST008).
   - `dismiss`: lặp sự cố — bắt buộc chọn sự cố gốc.
   - Ghi chú 1–1000 ký tự bắt buộc. Khi cổng không phản hồi: chỉ `dismiss` khả dụng + nút "Đối chiếu lại".

## 5. Biến môi trường cần bàn giao

`backend/.env` (đã có trong `backend/.env.example`):

| Biến | Ghi chú |
|---|---|
| `PAYMENT_PROVIDER` | `fake` (dev) hoặc `payos` (sản xuất). Để trống = fake nhưng **không bật trang `/dev/fake-payment`** (chỉ bật khi viết đúng `fake`). |
| `PAYOS_CLIENT_ID` | Client ID từ PayOS Dashboard. |
| `PAYOS_API_KEY` | API key (secret) — **không commit, không log**. |
| `PAYOS_CHECKSUM_KEY` | Secret ký HMAC webhook — **không commit, không log**. |
| `FRONTEND_URL` | e.g. `https://stave.vercel.app` — dựng `returnUrl`/`cancelUrl` cho cổng PayOS (default `http://localhost:3000`). |
| `BILLING_SCHEDULER_ENABLED` | Mặc định bật ngoài môi trường test; đặt `false` để tắt bộ quét (rắc nếu cần đóng băng nhắc nhở). |

Frontend: `NEXT_PUBLIC_PAYMENT_PROVIDER=fake` (chỉ dev, để hiện menu "Thanh toán giả"; **không** set ở môi trường công khai).

## 6. Cấu hình webhook trên PayOS Dashboard

1. PayOS Dashboard → **Webhooks** → thêm webhook `POST {backend}/payments/payos/webhook` cho sự kiện `PAYMENT_LINK.PAYMENT_REQUEST_COMPLETED`.
2. Khi xem webhook, PayOS gửi mẫu: `order_code`, `code` (mã kết quả), `event`, `timestamp`, `checksum`. Backend xác minh bằng HMAC SHA512 trên chuỗi có `PAYOS_CHECKSUM_KEY` (`payos.client.webhooks.verify`); checksum sai → 400. **Đường dẫn tuyệt đối phải có HTTPS** và backend phải công khai.
3. Trả lời webhook: backend luôn trả 200 khi xử lý xong (kể cả đã xử lý trước đó) để PayOS không gửi lại vô hạn; khi DB lỗi → 500 để PayOS retry.

## 7. Câu hỏi & lưu ý cho Trưởng nhóm

1. **Giá STAVE+ 49.000đ là giá mẫu** — chốt giá thật rồi sửa qua `/admin/plans` (UC-106), **không** sửa lại migration đã áp.
2. **Kiểm FK trước khi áp migration đợt 1**: nếu DB thật đã có `UNIQUE(name)` mặc định của Postgres (`subscription_plans_name_key`) thì chỉ mục `lower(name)` của đặc tả sẽ bị bỏ qua im lặng — xem `\d subscription_plans`. Hiện trạng ghi chú §99 ghi FK `transactions.user_id` vốn CASCADE; đặc tả nói "chặn xoá" — hành vi cuối: SET NULL / CASCADE như migration.
3. **UC-79 chưa có chỗ gắn UI**: tab "Cá nhân hoá" của `/profile` đã bị gỡ (04/11/2026). Toàn bộ logic + API + trang (component `theme-from-image`) đã làm, chỉ thiếu chỗ render trong UI profile — cần Quyết định UI sẽ đặt ở đâu.
4. **Refund không thu hồi gói** (quyết định spec: hoàn tiền thật ở PayOS, STAVE chỉ ghi nhận). Nếu Leader yêu cầu thu hồi quyền trả phí khi hoàn tiền, phải thêm bước vào RPC `resolve_payment_issue`.
5. ~~Test có sẵn 1 fail (`billing/renewal.spec.ts` UTCID04)~~ — **ĐÃ XONG**: PR #114 (`fe76967`) đã sửa `renewal.spec.ts` và chốt quy tắc "ngày cuối ân hạn (trùng `grace_until`) **không** nhắc". Backend nay **2211/2211 test xanh**.
6. **`admin_audit_log` cho UC-104**: mục 4.3 CLAUDE.md cho phép INSERT; table hiện chỉ có `target_type` cố định `user` — xem UC-108 đã thêm `target_type = 'payment_issue'`. Nếu muốn log "xem chi tiết giao dịch" (P9) thì phải thêm target_type mới — chờ Leader.
7. **Menu user "Gói dịch vụ"**: `site-header.tsx` thuộc Trí; đã đề xuất vị trí menu, cần xác nhận.
8. **Chống log nhạy cảm**: mọi log billing chỉ ghi `order_code`/`issue_id`/lỗi, không ghi body webhook, tên/email người trả tiền. Webhook có `@Public` + verify HMAC; kiểm tra lại nếu đổi cấu hình API version.
9. **Không commit secret**: đã chạy secret-scan; `.env.example` chỉ có tên biến. Khi deploy, điền giá trị thật trong panel môi trường (Railway/Vercel), **không** đặt `PAYMENT_PROVIDER=fake` ở môi trường công khai.
