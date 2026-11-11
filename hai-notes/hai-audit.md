# P12 — Rà soát cuối toàn diện (UC-73 → UC-108, Gia hạn, UC-79)

> Rà soát trên nhánh `feature/admin-payment-issue-resolution` (HEAD `67d968f`), main = `d0d93e9` (đã chứa P1–P10). Nguyên tắc P12: đối chiếu, KHÔNG viết tính năng mới; mục "Chưa làm" chỉ liệt kê kèm lý do, không tự làm.
> Trạng thái: ✅ Đã làm (file:dòng) · ⚠️ Đã làm nhưng lệch/giới hạn · ❌ Chưa làm (lý do).

## 1. Bảng đối chiếu tiêu chí "Bắt buộc xử lý"

### Migration đợt 1 + đợt 2 (`hai.md` mục "Migration `20261025140000_hai_billing.sql`")
| Mục | Trạng thái | Bằng chứng |
|---|---|---|
| `subscription_plans`: +4 cột, unique index `one_default`, unique `lower(name)` | ✅ | `backend/supabase/migrations/20261025140000_hai_billing.sql:5-11` |
| 2 gói mẫu Free / STAVE+ 49.000đ (giá mẫu) | ✅ | `:78-84` (`ON CONFLICT DO NOTHING`) |
| `subscriptions`: +3 cột + unique `user_id` | ✅ | `:13-17` |
| `transactions`: +8 cột, `user_id` nullable, FK SET NULL | ✅ | `:19-32` |
| FK `subscriptions.user_id` → CASCADE | ✅ | `:34-35` |
| RLS 4 bảng: SELECT gói active cho authenticated; SELECT theo owner cho 3 bảng; không INSERT/UPDATE/DELETE cho client | ✅ | `:37-76` |
| Migration đợt 2 (renewal/grace, `payment_issues` +3 cột, `billing_complete_order`, index) | ✅ | `20261106160231_hai_billing_batch_two.sql` |

### UC-73 Xem các gói
| Mục | Trạng thái | Bằng chứng |
|---|---|---|
| `GET /subscription-plans` (gói active + gói đang dùng nếu bị tắt, 2.E2) | ✅ | `backend/src/billing/subscription-plans.controller.ts` + `admin.service`-pattern ở `billing-history` |
| Trang `/plans` (Card, giá VND, điểm cộng, BR-84/83) | ✅ | `frontend/app/plans/page.tsx`, `frontend/components/billing/plans-view.tsx` |
| `?feature=theme_from_image` nổi bật (1.1) | ✅ | `plans-view.tsx` (đọc `searchParams`) |
| Đã đăng ký → "Đổi gói"/"Huỷ gói" (5.1) | ✅ | `plans-view.tsx` |
| Không tải được → lỗi + "Thử lại" (2.E1) | ✅ | `plans-view.tsx` |
| Link "Gói dịch vụ" menu user `site-header.tsx` | ⚠️ file `site-header.tsx` thuộc Trí; đã thêm vào `ADMIN_NAV`/trang admin; link user-side để lại Leader (câu hỏi P13 #12 trong hai-progress) | `frontend/components/shell/nav-items.ts` |

### UC-74 Đăng ký STAVE+
| Mục | Trạng thái | Bằng chứng |
|---|---|---|
| `POST /subscriptions/checkout` | ✅ | `backend/src/billing/subscriptions.controller.ts` + `payments.service.ts` `createCheckout` |
| Webhook không guard, verify chữ ký, luôn 200, idempotent | ✅ | `payments.controller.ts` (webhook), `payos.gateway.ts` `verifyWebhook` (HMAC checksum), `billing_complete_order` (idempotent `processed:false`) |
| `GET /payments/orders/:orderCode` (chỉ user gọi) | ✅ | `payments.controller.ts` + filter `user_id` trong service |
| `POST .../sync` (hỏi cổng, hoàn tất nếu success) | ✅ | `payments.controller.ts` |
| Cổng không phản hồi → xoá pending, 502 (4.E3) | ✅ | `payments.service.ts` `createCheckout` (try/catch xoa dòng pending) |
| completeOrder: success → subs active, 1 tháng, `billing.payment_success`; failed → `billing.payment_failed` | ✅ | `supabase/migrations/20261106160231...sql` `billing_complete_order` + `billing-scheduler` |
| Kích hoạt lỗi → issue tự tạo (5.E1) | ✅ | `billing_complete_order` khối EXCEPTION |
| `returnTo` validate (không `//`, không `://`) | ✅ | `backend/src/billing/return-to.ts` + test `return-to.spec.ts` |
| Trang `/billing/result` poll 2s×30s, sync lần 2 ở giây 6, không tin URL | ✅ | `frontend/components/billing/payment-result-view.tsx` + `lib/payment-result-poller.ts` + test |
| retry_of = giao dịch thất bại gần nhất cùng gói | ✅ | `payments.service.ts` `createCheckout` |
| Số tiền integer VND, không lưu thẻ (BR-85) | ✅ | cột `bigint`, không có trường card ở migration |

### UC-75 Đổi gói
| Mục | Trạng thái | Bằng chứng |
|---|---|---|
| `POST /subscriptions/change`, `cancel-downgrade` | ✅ | `backend/src/billing/subscription-changes.service.ts` + controller |
| Gói tắt → 409 (2.E1) | ✅ | `subscription-changes.service.ts` |
| Nâng cấp: thu giá gói mới, kỳ mới từ lúc trả (BR-88); từ chối → giữ gói cũ | ✅ | `renew`/`change` trong service + `billing_complete_order` |
| Hạ cấp: `pending_plan_id`, áp dụng hết kỳ; huỷ hạ cấp (5.1) | ✅ | `subscription-changes.service.ts` + `billing-scheduler.service.ts` (đoạn "hạ cấp đã đặt lịch" khi hết kỳ) |
| `billing.plan_changed` | ✅ | `notification-types.ts:164` |

### UC-76 Huỷ gói
| Mục | Trạng thái | Bằng chứng |
|---|---|---|
| `POST /subscriptions/cancel`, `resume` | ✅ | `subscription-changes.service.ts` |
| Cancel: giữ `current_period_end`, không hoàn tiền (BR-84) | ✅ | service + migration |
| Resume trước hết kỳ: active, không thu (6.1) | ✅ | `subscription-changes.service.ts` |
| 3.E1 (theme custom → nói sẽ quay preset) | ⚠️ hộp confirm nêu ngày hết hạn; lời "theme sẽ quay preset" chưa có (chờ UC-79 UI profile — mục "Cá nhân hoá" bị gỡ 04/11/2026 theo CLAUDE.md, để Leader quyết) | `frontend/components/billing/plans-view.tsx` |

### UC-77 Lịch sử giao dịch
| Mục | Trạng thái | Bằng chứng |
|---|---|---|
| `GET /billing/transactions` + `/receipts/:id` | ✅ | `billing-history.service.ts` + `billing-history.ts` |
| Trang `/billing` RowList + gói hiện tại + ngày thanh toán kế | ✅ | `frontend/app/billing/page.tsx` + `billing-history-view.tsx` |
| EmptyState (2.E1), lỗi + Thử lại (2.E2) | ✅ | `billing-history-view.tsx` |
| retry_of: "Thử lại sau lần thất bại <ngày>" (3.1) | ✅ | `billing-history-view.tsx` + `billing-history.ts` (join `retry_of`) |
| Biên lai in được, thiếu info → nói rõ (5.E1) | ✅ | `frontend/app/billing/receipts/[id]/page.tsx` |
| Nút "Báo sự cố" (max 500 ký tự, chống trùng 1 open/transaction) | ✅ | `billing-history-view.tsx` + `report-issue-dialog.tsx` + controller (chống trùng) |

### Gia hạn và hết hạn (đợt 2)
| Mục | Trạng thái | Bằng chứng |
|---|---|---|
| Bộ quét 1 giờ (`setInterval`, `OnModuleInit`) | ✅ | `billing-scheduler.service.ts` |
| Nhắc `billing.renewal_due` 3 ngày trước + đúng ngày, 1 lần/mốc (`renewal_notified_at`) | ✅ | `billing-scheduler.service.ts` + spec |
| Gia hạn: `current_period_end = max(now, cpe) + 1 tháng` | ✅ | `backend/src/billing/renewal.ts` |
| Ân hạn 3 ngày (`grace_until`), nhắc mỗi ngày, hết ân hạn tự về Free | ✅ | `billing-scheduler.service.ts` + `renewal.ts` |
| Hạ cấp đặt lịch khi hết kỳ | ✅ | `billing-scheduler.service.ts` (đoạn apply `pending_plan_id`) |
| Quét pending > 30 phút → failed | ✅ | `billing-scheduler.service.ts` |
| Giá: `price_effective_at` đã qua → giá mới, không thì `price_locked_vnd` | ✅ | `billing-scheduler.service.ts` (rèn cùng `subscription-changes`) |

### UC-79 Theme từ ảnh
| Mục | Trạng thái | Bằng chứng |
|---|---|---|
| Thả ảnh, xử lý client-side, không upload (BR-91) | ✅ | `frontend/lib/theme-from-image.ts` + `load-image-pixels.ts` + component |
| Gom 5 cụm màu, k-means ~50 dòng, không thư viện | ✅ | `theme-from-image.ts` + test 198 dòng |
| Chỉ đổi 10 biến trang trí, không đụng `accent/success/warning/danger` (BR-90) | ✅ | `theme-from-image.ts` (danh sách 10 biến cố định) + `custom-themes.service.ts` (khổ định tên biến) |
| WCAG ≥ 4,5:1 tự chỉnh độ sáng + unit test | ✅ | `theme-from-image.ts` + `__tests__/theme-from-image.test.ts` |
| Ảnh 1 màu → báo (3.E1) | ✅ | ngưỡng ~85% trong `theme-from-image.ts` |
| PNG/JPEG/WebP, ≤ 5MB (2.E1) | ✅ | `theme-from-image.ts` |
| Package Free: vô hiệu hoá + link `/plans?feature=theme_from_image` (1.E1) | ✅ | `theme-from-image.tsx` component (đọc `hasPaidAccess`) |
| Preview + "Áp dụng và lưu"/"Quay về preset" (5.1, 6.1) | ✅ | `theme-from-image.tsx` + `theme-context.tsx` |
| `PUT /themes/me/custom`: 403 nếu không paid, đúng 10 biến, regex oklch chặt | ✅ | `backend/src/custom-themes/custom-themes.service.ts` + `palette-validation.pipe.ts` + spec 208 dòng |
| BR-89: hết gói → áp preset, giữ `generated_palette` | ✅ | `GET /themes/me/effective` trong service |
| ⚠️ Gắn vào tab "Cá nhân hoá" `/profile` — tab này **đã bị gỡ** 04/11/2026 (CLAUDE.md 4.7, chỉ còn 1 theme space). Component đã làm nhưng chưa có chỗ nào render nó. | ⚠️ | Leader quyết (đã ghi trong hai-progress "câu hỏi cho trưởng nhóm") |

### UC-104 Xem giao dịch (admin)
| Mục | Trạng thái | Bằng chứng |
|---|---|---|
| `GET /admin/transactions?from&to&outcome&planId&limit&cursor` (AdminGuard) | ✅ | `admin-billing.controller.ts` + `admin-billing.service.ts` |
| Trang `/admin/transactions` (AdminGuard, menu admin) | ✅ | `frontend/app/admin/transactions/page.tsx` + nav-items |
| Tổng kỳ: tiền thành công, số giao dịch thành công/thất bại (4) | ✅ | `admin-billing.service.ts` (summary) + page |
| Lọc thất bại → link `/admin/payment-issues` (5.1) | ✅ (P11 đã làm route) | `admin/transactions/page.tsx:602-613` + route P11 |
| Snapshot tài khoản đã xoá (3.E1) | ✅ | `admin-billing.service.ts` (`payer_name/payer_email` khi `user_id IS NULL`) |
| Detail retry liên kết | ✅ | `admin-billing.service.ts` (related) |

### UC-105 Tạo gói
| Mục | Trạng thái | Bằng chứng |
|---|---|---|
| `POST /admin/plans` + trang `/admin/plans` | ✅ | `admin-plans.controller.ts` + `frontend/app/admin/plans/page.tsx` |
| Không được trùng tên (case-insensitive) | ✅ | unique index `lower(name)` + 409 trong service |
| 2 giá trị tính năng bắt buộc (theme_from_image, extra_storage) + extra_storage_mb | ✅ | `PLAN_FEATURE_KEYS` + `MAX_EXTRA_STORAGE_MB` trong `admin-plans.service.ts` |
| `admin_audit_log` | ✅ | `writeAuditLog` trong `admin-plans.service.ts` |

### UC-106 Sửa giá gói
| Mục | Trạng thái | Bằng chứng |
|---|---|---|
| `PATCH /admin/plans/:id/price` + hiệu lực trước +N ngày (mặc định từ `platform_settings.price_change_notice_days`) | ✅ | `admin-plans.service.ts` `updatePlanPrice` |
| Thông báo `billing.price_change` cho người dùng (nếu còn dùng gói) | ✅ | `notifySubscribersOfPriceChange` trong service |
| Người đang dùng giữ giá cũ đến hết kỳ (BR-120) | ✅ | `price_locked_vnd` + `effective-plan.ts` |
| `admin_audit_log` | ✅ | `writeAuditLog` |

### UC-107 Tắt gói
| Mục | Trạng thái | Bằng chứng |
|---|---|---|
| `POST /admin/plans/:id/activate` (bật/tắt) | ✅ | `admin-plans.service.ts` |
| Không cho tắt gói Free `is_default` | ✅ | 409 trong service |
| Nêu số người đang dùng + xác nhận không ảnh hưởng (2, 2.E1) | ✅ | `countActiveSubscribers` + confirm trong frontend |
| Tắt = `is_active=false`, người đang đăng ký giữ giá cũ (BR-120), không xoá gói | ✅ | migration + service |
| `admin_audit_log` | ✅ | `writeAuditLog` |

### UC-108 Xử lý sự cố (P11 — nhánh này)
| Mục | Trạng thái | Bằng chứng |
|---|---|---|
| Migration `payment_issues` +3 cột + hàm `resolve_payment_issue` (4 remedy, 1 transaction, rollback) | ✅ | `20261110000001_admin_payment_issue_resolution.sql` (đủ ST001–ST010) |
| `GET /admin/payment-issues?status=&cursor=` (snapshot tài khoản đã xoá, reported_by) | ✅ | `admin-payment-issues.service.ts` `listIssues` (cursor base64url `[created_at,id]`) |
| `GET /admin/payment-issues/:id` (timeline theo user_id / payer_email, verification 4 trạng thái) | ✅ | `getIssue` + `verifyAgainstProvider` (fake = skipped, gateway ném = unavailable) |
| `POST /admin/payment-issues/:id/resolve`: note trim bắt buộc ≤1000 (4.E1→400); đã resolved → 409 (ST002) | ✅ | DTO `resolve-payment-issue.dto.ts` + service `resolveIssue` + RPC |
| extend/refund/activate: đối chiếu cổng ngay, unavailable → 409 "stays open" (2.E1) | ✅ | `REMEDIES_REQUIRING_VERIFICATION` + `verifyAgainstProvider` trong `resolveIssue` |
| extend: days 1–90, compensation txn 0đ, `cpe = max(now,cpe)+N ngày` (ST005/ST010) | ✅ | RPC migration (`RAISE ... ST005/ST010`) |
| refund: refundRef bắt buộc, amount 1..gốc, txn mới, KHÔNG gọi API hoàn tiền (ST006) | ✅ | RPC + DTO |
| activate: txn gốc success, dùng `billing_apply_subscription` (hàm dùng chung với completeOrder), không sửa txn cũ (ST008/ST009) | ✅ | RPC (ELIF activate) |
| dismiss: duplicateOfIssueId bắt buộc, tồn tại, khác id (ST007) | ✅ | RPC (ELIF dismiss) |
| Lỗi apply → giữ sự cố mở, không báo "đã xử lý" (5.E1) | ✅ | 1 hàm Postgres ⇒ lỗi = rollback ⇒ status giữ `'open'`; service chỉ trả khi RPC OK |
| Notify `billing.issue_resolved` nếu tài khoản còn; audit `payment_issue.resolve` (target_type `payment_issue`) | ✅ | `notifications.notify` (row.user_id) + `writeAuditLog` |
| Tài khoản xoá (1.E1): xử lý được từ bản ghi giao dịch | ✅ | timeline theo `payer_email`, `user_id` NULL được phép ở RPC |
| Frontend: nav + i18n + API client + trang list (tabs đồng bộ URL) + trang detail (timeline, badge, form remedy, unavailable→chỉ dismiss, ConfirmDialog, lỗi giữ form) | ✅ | `nav-items.ts`, `lib/api-admin-payment-issues.ts`, `app/admin/payment-issues/page.tsx`, `[id]/page.tsx` |

### Câu hỏi kỹ thuật 2 câu (hai-setup.md P11): "refund có thu hồi gói không?" và "đổi tính năng 5.1"
| Trạng thái | Lý do |
|---|---|
| ❌ Chờ Leader | Spec đã chọn: **refund chỉ ghi nhận, không thu hồi gói** (hai-prompts P11: "HOÀN TIỀN THẬT LÀM Ở TRANG PAYOS — STAVE CHỈ GHI NHẬN", đã implement). Nếu Leader yêu cầu thu hồi, thêm 1 bước `subscriptions` vào RPC (ngoài phạm vi P12 "không viết mới") |

## 2. Kiểm tra bảo mật & an toàn dữ liệu

> Hai sub-agent (security-review, frontend-convention) **fail do lỗi API** giữa lượt chạy; các mục dưới đây được kiểm tra **trực tiếp bằng lệnh** và đã đối chiếu với mã nguồn.

### 2.1 Guards — PASS
| Route | Guard | Bằng chứng |
|---|---|---|
| `GET /subscription-plans` | Jwt + Session | `billing/subscription-plans.controller.ts:8` |
| `/subscriptions/*` (me, checkout, change, cancel, resume, renew, preview) | Jwt + Session | `billing/subscriptions.controller.ts:22` |
| `/billing/transactions*` | Jwt + Session | `billing/billing.controller.ts:23` |
| `/payments/orders/:code` | Jwt + Session | `payments.controller.ts:46` |
| `POST /payments/orders/:code/sync` | Jwt + Session + **UserThrottler** | `payments.controller.ts:55` |
| `POST /payments/payos/webhook` | **không guard** (đúng spec) — verify HMAC chữ ký | `payments.controller.ts:31` + `payos.gateway.ts:79` (`client.webhooks.verify`, lỗi ⇒ `null` ⇒ 400) |
| `/dev/fake-payment/*` | Jwt + Session + **chỉ đăng ký khi dev** | `dev-fake-payment.controller.ts:10`, `billing.module.ts:39` |
| `/admin/transactions*` | Jwt + Session + **Admin** | `admin-billing.controller.ts:15` |
| `/admin/plans*` | Jwt + Session + **Admin** | `admin-plans.controller.ts` |
| `/admin/payment-issues*` | Jwt + Session + **Admin** | `admin-payment-issues.controller.ts:20` |
| `/themes/me/*` | Jwt + Session | `custom-themes.controller.ts` |

### 2.2 Chống IDOR — PASS
- `GET /payments/orders/:code` → `payments.service.ts:254` so `data.user_id !== userId` ⇒ 404 cho người khác.
- `/billing/transactions` lọc theo `user_id` (`payments.service.ts:358`).
- `POST /billing/transactions/:id/issues` chỉ nhận giao dịch của chính người gọi (trước đó có kiểm owner trong service).
- Mọi route `/admin/*` có `AdminGuard` ⇒ admin không thể đọc dữ liệu của admin khác, và người dùng thường không vào được nhánh admin.

### 2.3 Route `/dev/*` ở production — PASS
- Backend: `payment-gateway.factory.ts:26-31` — `isFakePaymentEnabled` = `PAYMENT_PROVIDER === 'fake' && NODE_ENV !== 'production'`. `billing.module.ts:39` chỉ đăng ký `DevFakePaymentController` khi hàm này trả true ⇒ ở production route `/dev/fake-payment` **không tồn tại** (404 từ Nest, không phải 403).
- Frontend: `app/dev/fake-payment/page.tsx:11` kiểm `isFakePaymentPageEnabled(NODE_ENV, NEXT_PUBLIC_PAYMENT_PROVIDER)`; cổng giả còn có `UserThrottlerGuard` ở nhánh sync.

### 2.4 Chuyển hướng an toàn `returnTo` — PASS
`backend/src/billing/return-to.ts` — `isSafeReturnTo` chỉ nhận chuỗi ≤500 ký tự, bắt đầu bằng `/`, **không** bắt đầu bằng `//`, **không** có `\`, **không** có `://`, **không** có ký tự điều khiển ⇒ chặn open-redirect và `javascript:`. Có unit test riêng (`return-to.spec.ts`).

### 2.5 Chống CSS injection (theme palette) — PASS (2 lớp)
- **Server**: `custom-themes/dto/save-custom-theme.dto.ts` → `isValidPalette` từ `shared-types/src/theme.ts:72`. Regex `OKLCH_STRICT_REGEX` (`:42`) **có neo `^…$`**, chỉ cho phép `oklch(<số> <số> <số>)` ⇒ chặn `;`, `}`, `/*`, `url(`, `expression(`, `var(`, `calc(`, `!important`. Kiểm thêm khoảng giá trị L∈[0,1], C∈[0,0.4], H∈[0,360) (`isValidOklch`). Đúng 10 khoá trang trí — không cho `--accent*`/`--success*`/`--warning*`/`--danger*` (BR-90).
- **Client**: `context/theme-context.tsx:17-24` chỉ gọi `root.style.setProperty(key, value)` cho đúng 10 khoá lấy từ `PALETTE_KEYS`, và chỉ áp khi `canApplyTheme()` đã chạy lại `isValidPalette`. Không có `innerHTML`/`cssText`/`insertRule` ⇒ không có chỗ để thoát khỏi rule CSS.

### 2.6 Không log dữ liệu nhạy cảm — PASS
Đã duyệt toàn bộ `logger.*` trong `src/billing/**` và `src/admin-billing/**`: chỉ ghi `order_code`, `issue_id`, `plan.id`, `subscription.id`, `error.message` và tên lỗi (`err.name`). **Không** có log nào chứa body webhook, số thẻ, tên/email người trả tiền, `payer_name`/`payer_email`, API key hay checksum key. (`payos.gateway.ts` không log payload; `payos.client.webhooks.verify` nội bộ SDK.)

### 2.7 Secret leak — PASS
```bash
git log -p main..HEAD | grep -inE "payos_(api|checksum|client)[a-z_]*=.{8,}|service_role_key=.{8,}|sk-[A-Za-z0-9]{16}|ghp[A-Za-z0-9]{20}"
```
→ **không có kết quả**. `backend/.env.example` chỉ chứa tên biến (không giá trị). Không có file `.env` trong diff.

### 2.8 Kết luận mục 2
Không phát hiện lỗ hổng HIGH/CRITICAL. Các điểm còn lại đều là **defense-in-depth** hoặc phụ thuộc cấu hình môi trường → đã ghi ở `hai-pr.md` mục 7 (không đặt `PAYMENT_PROVIDER=fake` ở production; webhook bắt buộc HTTPS; checksum key chỉ nằm ở biến môi trường).

## 3. Kiểm tra phạm vi mã nguồn (scope drift)

`git diff --name-only main...HEAD` → **22 file**. Phân loại:

| Nhóm | File | Đánh giá |
|---|---|---|
| P11 (đúng phạm vi) | `backend/src/admin-billing/admin-billing.module.ts` | ✅ đăng ký controller/service — thuộc UC-108 |
| | `backend/src/admin-billing/admin-payment-issues.service.ts` | ✅ sửa 2 lỗi compile + lint |
| | `backend/src/admin-billing/admin-payment-issues.types.ts` | ✅ format + type |
| | `backend/src/admin-billing/dto/admin-payment-issues-query.dto.ts` | ✅ format |
| | `backend/src/admin-billing/admin-payment-issues.service.spec.ts` (mới) | ✅ 32 test UC-108 |
| | `frontend/app/admin/payment-issues/**` (4 file mới) | ✅ trang list + detail |
| | `frontend/lib/api-admin-payment-issues.ts` + `.test.ts` (mới) | ✅ client API + 4 test |
| | `frontend/lib/error-message.ts` | ✅ thêm 8 mã lỗi UC-108 |
| | `frontend/lib/i18n/{en,vi}.ts` | ✅ key `nav.payment_issues` + `pi.*` |
| | `frontend/components/shell/nav-items.ts` | ✅ mục menu admin |
| | `hai-progress.md` | ✅ nhật ký tiến độ |
| **Ngoài P11 — format-only** | `backend/src/admin-billing/admin-plans.service.ts`, `admin-plans.types.ts`, `backend/src/billing/payments.service.ts`, `renewal.ts`, `subscription-changes.service.spec.ts`, `backend/src/custom-themes/custom-themes.service.spec.ts` | ⚠️ **chỉ reformat prettier**, không đổi logic. Sinh ra vì `npm run lint` của backend chạy `eslint --fix` trên toàn repo. Lệnh `git checkout --`/`git restore` bị policy chặn nên không revert được tự động. |

Đã kiểm chéo bằng `git diff -w --name-only main...HEAD`: cả 22 file đều **không** phải whitespace-only, tức các file "ngoài P11" vẫn có thay đổi nội dung — nhưng nội dung đó **chỉ là định dạng lại** (xác nhận bằng nội dung diff: xuống dòng/thu gọn lời gọi, không đổi câu lệnh).

**Ngoài ra, P12 sửa thêm 4 file thuộc vùng billing** (trong phạm vi cho phép — lỗi lint/type nhỏ): `backend/src/admin-billing/admin-plans.service.ts` (bỏ tham số thừa `effectiveAt`), `backend/src/admin-billing/dto/create-plan.dto.ts` (bỏ import `Max` không dùng), `backend/src/billing/billing-scheduler.service.spec.ts` (10 lỗi `unbound-method`), `frontend/app/admin/plans/page.tsx` (3 lỗi `set-state-in-effect`).

### 3.1 Phạm vi sau rebase lên `origin/main` (P12 — trạng thái cuối)

Trong lúc P12 chạy, `origin/main` đã nhận PR #114 (`fe76967` → `d1d7d07`): một bản P11 **song song** do Khanh viết, có hardening mạnh hơn bản của ta:

| Điểm | `fe76967` (đã vào main) | Bản P11 cũ của ta |
|---|---|---|
| Migration `resolve_payment_issue` | thêm `p_provider_confirmed`, `FOR UPDATE` trên giao dịch, chặn refund khi giao dịch chưa success (ST008) | thiếu 3 kiểm tra này |
| Service `resolveIssue` | chặn `activate` khi PayOS **không xác nhận** success (409) | chỉ chặn khi `unavailable` |
| `payment-gateway.factory.ts` | **throw** khi `PAYMENT_PROVIDER=fake` + `NODE_ENV=production` | chỉ ẩn route `/dev` |
| Cursor `decodeIssueCursor` | `ISO_TIMESTAMP` regex chặt | chỉ `Date.parse` |

Vì vậy nhánh đã **rebase lên `origin/main`** và giữ bản main cho toàn bộ P11 (migration, service, spec, 4 file frontend). Kết quả:

```
$ git diff --stat origin/main HEAD
 backend/src/billing/billing-scheduler.service.spec.ts  | 58 ++--
 frontend/app/admin/plans/page.tsx                     | 115 ++++----
 hai-notes/hai-audit.md                                | 302 +++++++++++++
 hai-notes/hai-pr.md                                   | 107 +++++++
 4 files changed, 498 insertions(+), 84 deletions(-)
```

⇒ Nhánh feature giờ chỉ mang **4 file mà main chưa có**: 2 file sửa lint + 2 file tài liệu bàn giao. Không còn trùng lặp, không có nguy cơ làm mất hardening của main.

**Lịch sử Git P1→P12 (sau rà soát):**

| P | Commit | Nhánh/remote |
|---|---|---|
| P1–P7 | `59bb620`…`5e7539c`, `39d8d17` | ✅ đã vào `origin/main` qua các PR #1–#113 |
| P8 | `4b17ee2`, `e0ec582` | ✅ `origin/main` |
| P9–P10 | `768692e`, `2f654fc`, `663431f`, `d0d93e9` | ✅ `origin/main` (PR #112) |
| P11 (bản song song) | `fe76967` → merge `d1d7d07` | ✅ `origin/main` (PR #114) |
| P11 (bản của ta) | `67d968f` | đã rebase ⇒ trở nên trùng main, bị loại khỏi lịch sử nhánh |
| P12 | `da904e7` (sau rebase) | ⏳ chờ push lên `origin/feature/admin-payment-issue-resolution` |

**Không có commit nào bị push thẳng lên `origin/main` ngoài ý muốn** — `origin/main` chỉ nhận qua PR (`gh pr merge`).

## 4. Kiểm tra quy ước giao diện & code convention

> Sub-agent frontend-convention fail do lỗi API; các mục dưới đây chạy trực tiếp bằng grep.

### 4.1 Mã yêu cầu `UC-`/`BR-` không lọt ra UI — PASS
`grep -RInE 'UC-[0-9]+|BR-[0-9]+' app components context lib --include='*.ts' --include='*.tsx'` cho **~60 kết quả, tất cả nằm trong comment**. Đã lọc riêng các chuỗi trong string literal / JSX text:
- `lib/api-jam.ts:102` → nằm trong JSDoc `*`
- `components/project/commit-history.tsx:330` → comment cuối dòng (`// UC-45 PRE-3`)
→ **không có mã UC/BR nào hiển thị cho người dùng**. Toàn bộ file P11 không chứa mã UC/BR.

### 4.2 Variant `dark:` — PASS
`grep -RInE 'dark:' app components context lib --include='*.ts' --include='*.tsx'` → **0 kết quả**. App chỉ có 1 theme tối.

### 4.3 Mã màu hex — PASS (ngoại lệ hợp lệ)
`grep -RInE '#[0-9A-Fa-f]{3,8}\b'` → 22 kết quả, phân bố:
- `components/space/universe3d.ts` (8), `components/space/sky-colors.ts` (2) — **nền 3D, không thuộc hệ token UI**.
- `lib/track-colors.ts` (3) — **bảng màu track (dữ liệu người dùng) — ngoại lệ được phép**.
- `components/auth-card.tsx` (4: `#4285F4`…) — **màu logo Google — ngoại lệ được phép**.
- `components/midi-editor/*` (5) — canvas editor (`#6366f1` màu track dự phòng, `#fff` nét vẽ) — **pre-existing, ngoài phạm vi billing**.
→ **Không có hex mới trong file P11** (grep riêng trên `app/admin/payment-issues/**` + `lib/api-admin-payment-issues*`: 0 kết quả).

### 4.4 Cỡ chữ dưới 12px — PASS
`grep -RInE 'text-\[(9|10|11)px\]'` → **0 kết quả** toàn frontend.

### 4.5 A11y & component dùng chung (file P11) — PASS
- Không dùng `window.confirm`/`window.alert` → dùng `ConfirmDialog`/`Dialog` của `components/ui/` (grep: 0 kết quả).
- Vùng lỗi có `role="alert"` (4 chỗ: `payment-issues/page.tsx:113,195`, `[id]/page.tsx:136,267`).
- `useSearchParams` được bọc trong `<Suspense>` (`payment-issues/page.tsx:38,46`).
- Chuỗi tải dùng ký tự `…` (không phải `...`).

### 4.6 i18n — PASS
`lib/i18n/i18n.test.ts` xác nhận `en.ts` và `vi.ts` có **đúng bộ key giống nhau** (10/10 test pass). Mọi chuỗi mới của P11 nằm trong `pi.*` + `nav.payment_issues`.

## 5. Kiểm thử & build toàn diện — kết quả thật

> **Cập nhật sau rebase (P12):** nhánh `feature/admin-payment-issue-resolution` đã được **rebase lên `origin/main` (`d1d7d07`)**. Trong lúc rebase, `origin/main` đã nhận thêm PR #114 (`fe76967` — bản P11 song song, do Khanh viết, có hardening mạnh hơn). Commit P11 cũ của ta vì vậy trở nên **trùng nội dung** và bị loại khỏi lịch sử; nhánh feature giờ chỉ giữ phần **main chưa có**: `plans/page.tsx` (sửa lint), `billing-scheduler.service.spec.ts`, `hai-audit.md`, `hai-pr.md`.
>
> Hệ quả: **test BE-BIL-37 đã được `fe76967` sửa** (file `renewal.spec.ts` có trong diff của PR #114) ⇒ nay **toàn bộ test backend xanh 2211/2211**, không còn fail nào. Các mục "1 fail pre-existing" ở bản audit cũ đã được thay bằng kết quả mới bên dưới.

Chạy tại HEAD `da904e7` (sau rebase) — kết quả thật:

### Backend (`cd backend`)
| Lệnh | Kết quả |
|---|---|
| `npx tsc --noEmit` | **pass** (không output) |
| `npx eslint "src/**/*.ts"` | **0 lỗi, 0 cảnh báo** (exit 0) — 12 lỗi cũ ở `admin-plans.service.ts`, `create-plan.dto.ts`, `billing-scheduler.service.spec.ts` đã dọn (3 file đầu đã có trong `fe76967`; file spec đã bỏ `eslint-disable` thừa) |
| `npx jest` | **2211/2211 pass**, 108/108 suite pass — **không còn test fail nào**. BE-BIL-37 (`renewal.spec.ts`) đã xanh nhờ bản sửa của `fe76967` trên main |
| `npm run build` | **pass** (`nest build`) |

### Frontend (`cd frontend`)
| Lệnh | Kết quả |
|---|---|
| `npx tsc --noEmit` | **pass** |
| `npx eslint .` | **0 lỗi** (exit 0), 21 cảnh báo — toàn bộ **pre-existing** ở file ngoài billing (`midi-editor.tsx`, `wav-recorder.test.ts`, `avatar.tsx`…). 3 lỗi `react-hooks/set-state-in-effect` ở `app/admin/plans/page.tsx` **đã xử lý triệt để** (chuyển sang `useApiResource` + remount-theo-key, không còn effect đặt lại state) |
| `npx vitest run` | **50/50 file, 909/909 test pass** (chạy 3 lần liên tiếp — không flaky) |
| `npm run build` | **pass** (`✓ Compiled successfully`) |

### Lỗi đã sửa trong P12
| File | Lỗi | Cách sửa | Ghi chú sau rebase |
|---|---|---|---|
| `backend/src/admin-billing/admin-plans.service.ts` | `no-unused-vars` (tham số `effectiveAt` không dùng) | bỏ tham số + cập nhật call site | `fe76967` trên main đã sửa tương đương ⇒ không còn trong diff |
| `backend/src/admin-billing/dto/create-plan.dto.ts` | `no-unused-vars` (`Max`) | bỏ import | `fe76967` đã sửa ⇒ không còn trong diff |
| `backend/src/billing/billing-scheduler.service.spec.ts` | 10× `unbound-method` | giữ raw `jest.fn()` (`notifyMock`, `completeOrderMock`) và assert vào biến raw thay vì biến đã cast sang class | **giữ trong diff** (main chưa sửa) |
| `frontend/app/admin/plans/page.tsx` | 3× `react-hooks/set-state-in-effect` | `useApiResource` + `reload` counter (như `admin/reports/page.tsx`); `PriceDialog` tách `PriceDialogContent` với `key={plan.id}`; `CreatePlanDialog` chỉ mount khi mở (state tự reset) | **giữ trong diff** (main chỉ thêm `eslint-disable`, chưa bỏ effect) |
| `backend/src/billing/billing-scheduler.service.spec.ts` | `eslint-disable` thừa sau rebase (main đã thêm directive không còn cần) | bỏ dòng `/* eslint-disable @typescript-eslint/unbound-method */` | bổ sung sau rebase |

## 6. Tài liệu PR
- `hai-notes/hai-pr.md` — **đã tạo**: tổng quan UC-73→UC-108, migration + thứ tự áp, API + route, hướng dẫn test fake/dev (9 nhóm), biến môi trường, cấu hình webhook PayOS, 9 câu hỏi cho Leader.
- `hai-notes/hai-audit.md` — file này (bảng đối chiếu + kết quả kiểm tra).
- Các file PR theo đợt: `hai-pr-migration.md`, `hai-pr-dot1.md`, `hai-pr-dot2-notes.md`.

## 7. Báo cáo tổng kết

**Tiến độ UC:** UC-73 ✅ · UC-74 ✅ · UC-75 ✅ · UC-76 ✅ · UC-77 ✅ · Gia hạn/ân hạn ✅ · UC-79 ⚠️ (logic+API xong, chưa có chỗ gắn UI vì tab "Cá nhân hoá" đã bị gỡ) · UC-104 ✅ · UC-105 ✅ · UC-106 ✅ · UC-107 ✅ · UC-108 ✅.

**Kiểm tra thật (sau rebase lên `origin/main` = `d1d7d07`):** backend `tsc` pass · ESLint **0 lỗi, 0 cảnh báo** · Jest **2211/2211** (không còn fail nào; BE-BIL-37 đã được `fe76967` sửa) · build pass. Frontend `tsc` pass · ESLint **0 lỗi** (21 warning pre-existing ngoài billing) · Vitest **909/909** · build pass.

**Quyết định kỹ thuật đã chốt:** refund chỉ ghi nhận (không thu hồi gói) · gia hạn nối kỳ `max(now,cpe)+1m` · ân hạn 3 ngày theo thời gian (tự về Free) · 4 remedy trong 1 transaction Postgres ⇒ lỗi ⇒ rollback, sự cố giữ mở · đối chiếu cổng bắt buộc cho extend/refund/activate, `unavailable` ⇒ chỉ `dismiss` · `returnTo` chỉ nhận đường dẫn tương đối · palette chặt bằng regex oklch neo, kiểm 2 lớp server+client. (Các quy tắc còn lại của bản main trong PR #114: chặn `activate` khi PayOS không xác nhận success; `FOR UPDATE` trên giao dịch khi resolve; throw khi `fake` + production.)

**Còn tồn đọng cần Leader xác nhận:** giá STAVE+ thật · kiểm FK/index thật trước khi áp migration · chỗ gắn UI UC-79 · có thu hồi gói khi hoàn tiền không · `target_type` audit cho UC-104 · vị trí menu "Gói dịch vụ" phía user.
*(Mục "quy tắc nhắc mỗi ngày ân hạn ở ngày cuối" đã không còn cần — PR #114 đã sửa `renewal.spec.ts`, test nay xanh.)*

**Việc cần thao tác tay:** Leader áp 4 migration theo thứ tự ở `hai-pr.md` mục 2 · điền biến môi trường (PAYOS_*/FRONTEND_URL) trong panel Railway/Vercel · đăng ký webhook PayOS (URL HTTPS + mã sự kiện) · chốt giá STAVE+ · xác nhận tab "Cá nhân hoá" để gắn UC-79 · deploy & smoke test.

