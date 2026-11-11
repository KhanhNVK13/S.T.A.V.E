# Tiến độ của Hải — thanh toán STAVE+, theme từ ảnh, quản trị gói

Nguồn: `./hai-setup.md` (hai.md > team-workload.md > hai-prompts.md). File này, `hai-setup.md`, `hai-notes/` nằm trong `.git/info/exclude`.

## Trạng thái ban đầu của main

- `main` = `5031821` (Merge PR #112), kéo ngày 06/11/2026. Đã `npm install` (lockfile không đổi).
- Backend `npm test`: **73 suite / 1542 test pass**. `npm run build`: **pass**.
- Frontend `npm run build`: **pass**. `npx vitest run`: **28 file / 608 test pass**.
- Trước khi làm, working tree có phần làm dở cũ (refactor editor + bản billing cũ chưa commit). Toàn bộ đã cất vào **`stash@{0}`** ("hai: local work before pulling main 2026-11-06"), có thêm bản sao ở scratchpad phiên. Không dùng lại trong P1.
- `PROJECT_STATE.md` ở gốc là file chưa track còn sót sau PR #106 (đã gỡ khỏi git). Để nguyên, không phải của tôi.

## Tóm tắt khảo sát repo

**Backend**
- `custom-sounds/`: module khai `controllers` + `providers` + `exports` service. Controller dùng `@UseGuards(JwtAuthGuard, SessionAuthGuard)` ở cấp class, có comment một khối mô tả UC ở đầu, `req: AuthenticatedRequest` → `req.user.id`, `ParseUUIDPipe` cho `:id`. DTO dùng class-validator, message lỗi viết trong decorator.
- `branches/branches.service.spec.ts`: `createSupabaseMock({ tables, rpc })` từ `test-utils/supabase-mock` (khai sẵn kết quả theo bảng, theo thứ tự gọi), dựng service bằng `new`, assert exception Nest (`NotFoundException`…), validate DTO bằng `plainToInstance` + `validate`.
- `common/guards/`: `JwtAuthGuard` (export type `AuthenticatedRequest`), `SessionAuthGuard`, `AdminGuard` (đọc `users.role`, ném `ForbiddenException('Admin privileges required')`; phải chạy sau JWT guard), `UserThrottlerGuard`.
- `supabase/supabase.constants.ts`: `SUPABASE_ADMIN_CLIENT = Symbol(...)`.
- `notifications/notification-types.ts`: các loại `billing.*` đã khai, bắt buộc (không tắt được), tham số: `payment_success`/`payment_failed` {planName, amount}; `plan_changed` {planName, effectiveDate}; `canceled` {planName, endDate}; `renewal_due` {planName, dueDate}; `price_change` {planName, newPrice, effectiveDate}; `issue_resolved` {summary}.
- `admin/admin.service.ts`: `writeAuditLog(adminId, action, targetId, reason)` private, insert `admin_audit_log` (`target_type` cố định `'user'`), lỗi chỉ `logger.error`, không ném.
- `platform-settings/`: `PlatformSettingsService.get<T>(key, fallback)`, cache 30 giây, có `invalidate`.
- `jam/jam.service.ts`: bộ quét `setInterval(() => void this.sweep(), 5000)` trong `onModuleInit`, `clearInterval` trong `onModuleDestroy`.
- Migration: tên `<ts>_<ten>.sql`, comment đầu tiếng Việt, viết idempotent. Hàm SECURITY DEFINER dùng `set search_path = public` + `revoke all ... from public, anon, authenticated` + `grant execute ... to service_role`. Policy RLS dùng `(select auth.uid())`, `TO authenticated`. Migration FK xoá tài khoản `20261026000003` **không** đụng `transactions.user_id`/`subscriptions.user_id` (chỉ `payment_issues.resolved_by` → SET NULL). Ghi chú §99 (archive 05) ghi `transactions.user_id` vốn CASCADE.

**Frontend**
- `AGENTS.md`: Next.js bản có thay đổi phá vỡ, phải đọc `node_modules/next/dist/docs/` trước khi viết route.
- `lib/api-client.ts`: `apiFetch<T>`, `ApiError`. `lib/api-jam.ts`: mẫu file API riêng, import kiểu từ `@stave/shared-types`.
- `lib/error-message.ts`: `API_MESSAGES: Record<string, Record<Lang, string>>`, **mỗi câu có cả `en` và `vi`**; `apiErrorMessage(err, fallback)`.
- `lib/format-date.ts`: `APP_LOCALE`, `formatDate`, `formatDateTime`, `formatRelativeTime`. `lib/safe-redirect.ts`: `safeRedirectPath`. `lib/use-api-resource.ts`: hook `useApiResource(fetcher, deps)`; câu lỗi qua `tNow`.
- **Frontend đã có i18n** (`lib/i18n/{vi,en}.ts`, `useI18n().t(key)`, `tNow`). Trang admin dùng key i18n.
- `components/ui/`: avatar, badge, button, card, confirm-dialog, dialog, empty-state, form, logo, page-header, project-thumb, row-list, switch, tabs, toast.
- `app/rankings/layout.tsx`: server component chỉ khai `metadata = { title }`, trả `children`.
- `app/admin/layout.tsx`: client, `RequireAuth` + kiểm `profile.role` ở client; menu admin nằm ở **`components/shell/nav-items.ts` (`ADMIN_NAV`)**.
- **`components/admin/admin-nav-items.ts` KHÔNG tồn tại.**
- `shared-types`: `main`/`types` trỏ `src/index.ts` (không build). Module khác export bằng `export type *`.

## Bảng tiến độ

| Prompt | Nội dung | Trạng thái | Nhánh | Commit |
|---|---|---|---|---|
| P1 | Migration đợt 1 + gói mẫu | **Xong** | `feature/billing-migration-batch-one` | `a58b20e` |
| P2 | Cổng thanh toán, cổng giả, getEffective | **Xong** | `feature/stave-plus-plans-and-checkout` | `8da7ec8`, `d8a7fc3` |
| P3 | UC-73 `/plans` | **Xong** | (nhánh P2) | `b728b02` |
| P4 | UC-74 checkout, webhook, sync | **Xong** | (nhánh P2) | `59bb620` (trên nhánh P1, đã merge vào P2: `4e5fc03`), `ae5aa79`, `57860f9` |
| P5 | UC-77 lịch sử giao dịch | **Xong** | `feature/stave-plus-history-change-cancel` | `adef369` |
| P6 | UC-75 + UC-76 | **Xong** | (nhánh P5) | `5108e75`, `166419a` |
| P7 | Gia hạn, ân hạn, bộ quét + migration đợt 2 | Chưa làm | `feature/billing-renewal-grace-sweeper` | |
| P8 | UC-79 theme từ ảnh | Chưa làm | `feature/theme-from-image-palette` | |
| P9 | UC-104 | Chưa làm | `feature/admin-billing-transactions-view` | |
| P10 | UC-105/106/107 | Chưa làm | `feature/admin-subscription-plan-management` | |
| P11 | UC-108 | **Xong** | `feature/admin-payment-issue-resolution` | (xem mục P11) |
| P12 | Rà soát + mô tả PR | Chưa làm | — | |

## Checklist theo UC

### P1 — Migration (hai.md mục "Migration")

- [x] ALTER `subscription_plans` (4 cột + 2 unique index) — `backend/supabase/migrations/20261025140000_hai_billing.sql:5-11`
- [x] ALTER `subscriptions` (3 cột + unique `user_id`) — `:13-17`
- [x] ALTER `transactions` (7 cột) — `:19-26`
- [x] Đổi FK `transactions.user_id` → SET NULL (bỏ NOT NULL) — `:47-49`; `subscriptions.user_id` → CASCADE — `:51-52`; dọn FK khác tên trên `user_id` — `:28-45`
- [x] Partial unique index `payment_issues(transaction_id) WHERE status = 'open'` — `:54-56`
- [x] Gói mẫu Free + STAVE+ (`ON CONFLICT DO NOTHING`, comment "giá mẫu") — `:58-66`
- [x] RLS 4 bảng, policy SELECT, không policy ghi, `DROP POLICY IF EXISTS` trước `CREATE` — `:68-95`
- [x] `billing_complete_order` idempotent, SECURITY DEFINER, `search_path`, REVOKE/GRANT — `:97-185`
- [x] `PLAN_FEATURES` + `PlanFeatureKey` — `shared-types/src/billing.ts:2-7`; export — `shared-types/src/index.ts` (dòng cuối)
- [x] Ghi chú PR — `hai-notes/hai-pr-migration.md`
- [x] Chạy lại 2 lần không lỗi — đã chạy thật trên Postgres 17 tạm (xem Kết quả kiểm tra)

### P2 — Cổng thanh toán, cổng giả, gói đang dùng (hai.md "Nguyên tắc để không bị chặn", "Cách xác định gói đang dùng")

- [x] Interface `PaymentGateway` đúng chữ ký hai.md + token `PAYMENT_GATEWAY` — `backend/src/billing/payment-gateway.ts:1,13`
- [x] `PayosGateway` theo SDK `@payos/node` 2.0.5 (`paymentRequests.create/get`, `webhooks.verify`) — `backend/src/billing/payos.gateway.ts`: description ≤ 25 ký tự không dấu `:20`; timeout 10s, không retry, tắt log SDK `:55`; chữ ký sai → null `:79-93`; map trạng thái `:33`
- [x] `FakeGateway` — `backend/src/billing/fake.gateway.ts:16-17` (URL, `fake-<n>`), `:25` (trạng thái đọc DB)
- [x] `PAYMENT_PROVIDER=fake|payos`, trống → fake + warn; payos thiếu khoá → lỗi khởi động — `backend/src/billing/payment-gateway.factory.ts:17,37-59`
- [x] Endpoint + trang giả chỉ tồn tại khi `PAYMENT_PROVIDER=fake` và không production — backend `billing.module.ts:23` + `payment-gateway.factory.ts:26`; frontend `app/dev/fake-payment/page.tsx:11-12`. Test: `billing.module.spec.ts` (BE-BIL-12, BE-BIL-15), `billing-format.test.ts` (FE-BIL-02); đo thật: build production → status 404, dev không biến → 404, dev có biến → 200
- [x] 3 nút trang giả gọi `completeOrder` (cùng RPC với webhook) — `dev-fake-payment.controller.ts:31`; chỉ chủ đơn — `payments.service.ts` `getOrderForUser`, test BE-BIL-14 UTCID03
- [x] `.env.example` chỉ thêm tên biến trống — `backend/.env.example:12-13`
- [x] `getEffective` / `resolveEffectivePlan` — `backend/src/billing/effective-plan.ts:51-84`, `subscriptions.service.ts:25`
- [x] `hasPaidAccess = !plan.is_default` — `effective-plan.ts:68,81`; hiệu lực theo thời gian (không job)
- [x] `GET /subscriptions/me` — `subscriptions.controller.ts:13`; export — `billing.module.ts:35` (module `global`)
- [x] Unit test: BE-BIL-01..15 (64 test) + FE-BIL-01..03

### P3 — UC-73 Xem các gói (hai.md mục UC-73, Bắt buộc xử lý)

- [x] API `GET /subscription-plans` — `backend/src/billing/subscription-plans.controller.ts:13`, `subscriptions.service.ts:41` (`listPlans`), ghép danh sách `effective-plan.ts:101` (`listVisiblePlans`: `is_active` theo `sort_order` → giá → tên, cộng gói hiện tại đã tắt, cờ `isCurrent`)
- [x] Trang `/plans` — `frontend/app/plans/layout.tsx` (tiêu đề "Gói dịch vụ"), `app/plans/page.tsx` (`RequireAuth`), `components/billing/plans-view.tsx`
- [x] Thông điệp "Quản lý phiên bản luôn miễn phí" — `plans-view.tsx:67`
- [x] Card mỗi gói: giá `formatVnd` `:136`, điểm cộng từ `PLAN_FEATURES` `:116`, chu kỳ + điều khoản huỷ `:163`, Badge "Gói hiện tại" `:127`
- [x] 1.1 `?feature=` — chọn gói `:32`, cuộn tới card `:39` (đo: màn 390px cuộn 151px), viền + badge "Có tính năng bạn cần"
- [x] 5.1 — gói miễn phí: "Nâng cấp lên <tên>" `:169`; gói trả phí: "Đổi gói" `:170` / "Huỷ gói" `:173`. Nút đang `disabled`, TODO nối ở P4/P6 `:168`
- [x] 2.E1 — khung lỗi `role="alert"` + "Thử lại" `:78-84`, không hiện giá (đo: `hasPrice=false`); skeleton `:76`
- [x] 2.E2 — ghi chú "Gói này không còn mở bán, bạn vẫn dùng đến <ngày>" `:157`; backend không trả gói đã tắt cho người khác (BE-BIL-16 UTCID03)
- [x] `?canceled=1` — `plans-view.tsx:60` (`role="status"`)
- [x] "Lịch sử giao dịch" → `/billing` — `:49`
- [x] `site-header.tsx` không sửa → câu hỏi 12
- [x] Test: BE-BIL-16 (4), BE-BIL-17 (4), FE-BIL-01 `formatVnd` (2), FE-BIL-04/05 (4)

### P4 — UC-74 Đăng ký STAVE+ (hai.md mục UC-74)

- [x] `POST /subscriptions/checkout` + `UserThrottlerGuard` — `backend/src/billing/subscriptions.controller.ts:24-26`; `createCheckout(userId, planId, purpose, returnTo?)` dùng chung — `payments.service.ts:132` (kiểm subscribe/upgrade/renew ở `assertPurpose` `:291`)
- [x] Bước 1: `active` → 403 `:140,329`; gói không có → 404, đã tắt → 409 `:144`; đang có gói trả phí → 409 `:297`; giá > 0 `:149`
- [x] Bước 2: `orderCode = Date.now()*100 + 0..99` (`generateOrderCode`), thử lại tối đa 3 lần khi trùng `:375-392`; INSERT pending đủ cột `:155-163`
- [x] 4.E3: cổng lỗi → xoá đúng dòng pending `:181`, 502 `:182`; dịch "Hiện chưa thanh toán được, vui lòng thử lại sau." (`frontend/lib/error-message.ts`)
- [x] Bước 4: chuyển trình duyệt — `frontend/components/billing/plans-view.tsx:59` (`window.location.assign`)
- [x] Bước 5: `completeOrder` duy nhất `payments.service.ts:195` (webhook, sync, cổng giả đều gọi); kích hoạt trong `billing_complete_order` (migration `:97-219`); thông báo `:233`
- [x] 4.E1: thất bại → `failed` + `billing.payment_failed` (BE-BIL-10 UTCID02)
- [x] 5.E1: kích hoạt lỗi → giao dịch vẫn `success` + `payment_issues` "Thanh toán thành công nhưng chưa kích hoạt gói" (migration `:205`, cùng 1 giao dịch DB); trang kết quả báo "sự cố đã được ghi nhận" (`payment-result-view.tsx`, `activationMissing`)
- [x] Webhook — `payments.controller.ts:31-44`: không guard đăng nhập (repo không có throttler toàn cục nên không cần `@SkipThrottle`), chữ ký sai → 400 `:38`, đúng → 200 `{ ok: true }`; idempotent nhờ `FOR UPDATE` + `status='pending'` (đo SQL: 2 phiên đồng thời → 1 kích hoạt)
- [x] `GET /payments/orders/:orderCode` — `payments.controller.ts:47`, chỉ chủ đơn (khác → 404) `payments.service.ts:244`; trả `expired` khi pending > 30 phút
- [x] `POST /payments/orders/:orderCode/sync` — `payments.controller.ts:56`, `payments.service.ts:271`: chỉ đơn pending, 1 lần/3 giây/đơn `:277`, cổng lỗi → 502 `:284`
- [x] `ConfirmDialog` giá + chu kỳ + điều khoản — `plans-view.tsx:127-148`; nút bị khoá khi đang gọi (`loading`); lỗi hiện trong hộp (đo thật)
- [x] `returnUrl` / `cancelUrl` — `payments.service.ts:174-175`
- [x] `/billing/result` — `frontend/lib/payment-result-poller.ts` (2 giây, 30 giây, sync đúng 1 lần ở giây 6, dọn timer), `components/billing/payment-result-view.tsx` (thành công `:75`, thất bại/hết hạn `:102`, đang chờ + "Kiểm tra lại" `:120`); chỉ tin backend (đo: URL có `status=PAID&code=00` mà backend nói failed → hiện thất bại)
- [x] 6.1 `returnTo` — backend `return-to.ts` (`isSafeReturnTo`), frontend `parseReturnTo` (`lib/billing-format.ts`); "Tiếp tục" về `returnTo` hợp lệ, `//evil.com` → `/plans` (đo thật)
- [x] 4.E2: pending không kích hoạt gì; pending > 30 phút → `expired` ("Chưa hoàn tất"); đánh dấu `failed` bởi bộ quét — **để P7**
- [x] `retry_of` — `payments.service.ts` `findRetryTarget` (failed gần nhất cùng user + gói + `kind='charge'`, chưa được retry)
- [x] Tiền integer (DTO/SQL/`Number.isSafeInteger`); không lưu thẻ; webhook không log body (chỉ log mã đơn); SDK PayOS `logLevel: 'off'`
- [x] Đã `failed` mà cổng báo thành công muộn → không sửa giao dịch, tạo `payment_issues` (migration `:120-130`, BE-BIL-10 UTCID07, đo SQL)
- [x] Test: BE-BIL-10 (8), 11 (5), 18 (3), 19 (12), 20 (5), 21 (3 kết quả cổng giả), 22 (2), 23 (webhook, 4); FE-BIL-06 (2), FE-BIL-07 poll (9)


### P5 — UC-77 Lịch sử giao dịch (hai.md mục UC-77)

- [x] `GET /billing/transactions` — `backend/src/billing/billing.controller.ts:28`, `billing-history.service.ts:37`: lọc `user_id` người gọi, `created_at desc, id desc`, cursor `(created_at, id)` mã hoá base64url và kiểm chặt (chống chèn bộ lọc PostgREST); trả `displayStatus`, `planName`, `kind`, `retryOf { id, createdAt }`, `hasOpenIssue`
- [x] `GET /billing/transactions/:id/receipt` — `billing.controller.ts:40`, `billing-history.service.ts:95`; lọc cả `id` lẫn `user_id` → người khác 404
- [x] Trang `/billing` — `frontend/app/billing/layout.tsx` (`{ default: "Thanh toán", template }` vì là layout cha của `result`/`receipts`), `app/billing/page.tsx` (`RequireAuth`), `components/billing/billing-history-view.tsx:176` (`RowList`: ngày, mô tả, số tiền, kết quả `Badge`); nhãn "Hoàn tiền"/"Đền bù" `:190`
- [x] Gói hiện tại + "Thanh toán kế tiếp" / "Hiệu lực đến" / "Sẽ chuyển sang <gói> vào <ngày>" — `billing-history-view.tsx:133`, `lib/billing-history.ts` (`subscriptionSummary`); link `/plans`
- [x] 2.E1 — `EmptyState` "Bản ghi sẽ xuất hiện khi bạn bắt đầu đăng ký gói trả phí." + nút tới `/plans` `:164`
- [x] 2.E2 — lỗi `role="alert"` + "Thử lại" `:155`; lỗi "Tải thêm" hiện ngay cạnh nút `:224`
- [x] 3.1 — dòng phụ "Thử lại sau lần thất bại <ngày>" `:193` (đo: hiện "05/11/2026")
- [x] Bước 5 — `/billing/receipts/[id]` (`receipt-view.tsx`): mã, ngày, gói, người trả, số tiền; nút "In" → `window.print()` `:35`; `@media print` ẩn thanh bên/nav/header/footer/nút `:14` (đo bằng `emulateMedia('print')`: thanh bên và nút ẩn)
- [x] 5.E1 — không đủ dữ liệu / không thành công → vẫn hiện chi tiết + "Biên lai không có cho giao dịch này." `:61` (backend `canIssueReceipt`, không trả 500)
- [x] "Báo sự cố" — `report-issue-dialog.tsx` (đếm x/500, kiểm bằng code + câu tiếng Việt, lỗi trong hộp, chữ đang gõ giữ ở cha); backend `billing-history.service.ts:114` (chỉ chủ, đã có sự cố mở → 409 `:132`, bắt cả lỗi unique `:145`, `UserThrottlerGuard` `billing.controller.ts:48`); `hasOpenIssue` → nút disabled "Đã có sự cố đang xử lý" `:208`. `reported_by` để TODO(P7) `:135`
- [x] Test: BE-BIL-24 (4), BE-BIL-25 DTO (3), BE-BIL-26 (5), BE-BIL-27 (4), BE-BIL-28 (5); FE-BIL-08 (2), FE-BIL-09 (4)

### P6 — UC-75 Đổi gói (hai.md mục UC-75)

- [x] API — `backend/src/billing/subscriptions.controller.ts` (`change-preview`, `change`, `cancel-downgrade`, `UserThrottlerGuard` cho thao tác ghi); `subscription-changes.service.ts:42,61,99`
- [x] Gói đích khác gói hiện tại `:182`, đang bán `:185` (409 "Plan is no longer available", không đổi gì); phải có gói trả phí `:178`
- [x] Nâng cấp — phân loại `plan-change.ts:3` (so với `price_vnd` **hiện tại** của gói đang dùng); `createCheckout(..., 'upgrade')` `:67` thu toàn bộ giá gói mới; hoàn tất qua `billing_complete_order` (khác gói → `plan_id` mới, kỳ mới từ lúc trả, `price_locked_vnd` mới, `active`, xoá lịch hạ cấp — đo SQL thật)
- [x] 5.E1 từ chối → giữ gói cũ, giao dịch `failed` (đo SQL); 5.E2 cổng lỗi → 502 từ `createCheckout` (BE-BIL-31 UTCID02)
- [x] Hạ cấp — `pending_plan_id` `:77` (chỉ khi `active`), không thu tiền; `/plans` hiện "Sẽ chuyển sang <gói> vào <ngày>" `plans-view.tsx:236`
- [x] 5.1 huỷ lịch — `cancelDowngrade` `:99` (không có lịch → 409 `:110`); nút "Huỷ lịch hạ cấp" `plans-view.tsx:251`
- [x] Bước 3 — preview `plans-view.tsx:152` → hộp nêu chi phí + thời điểm `:302-344`; 4.1 đóng hộp `:283` không gọi API (đo: 0 request)
- [x] `billing.plan_changed { planName, effectiveDate }` `:88` (ngày `dd/mm/yyyy` giờ Việt Nam)
- [x] Test: BE-BIL-29 (3), BE-BIL-30 (4), BE-BIL-31 (5), BE-BIL-32 (2); SQL nâng cấp + từ chối (Docker tạm)

### P6 — UC-76 Huỷ gói (hai.md mục UC-76)

- [x] API — `subscriptions.controller.ts` (`cancel-preview`, `cancel`, `resume`); `subscription-changes.service.ts:114,123,146`
- [x] Bước 2, 3 — hộp nêu ngày quay về Free + "Không dự án hay dữ liệu nào bị xoá" `plans-view.tsx:350`
- [x] 3.E1 — `cancel-preview` trả "Theme tạo từ ảnh" khi `users.active_theme_id` trỏ tới `themes.type = 'custom'` `:235` (query riêng, không dùng module `users`); hộp nói thiết lập về mặc định khi hết kỳ, bảng màu vẫn giữ `plans-view.tsx:353`
- [x] `status = 'canceled'`, giữ `current_period_end`, xoá `pending_plan_id` `:129` (test khẳng định không đụng `current_period_end`); không hoàn tiền
- [x] 6.1 — `resume` `:146-156` chỉ khi `canceled` còn hạn → `active`, không thu tiền; trạng thái đã huỷ hiện "Đã huỷ, hiệu lực đến <ngày>" `plans-view.tsx:430` + "Tiếp tục gói" `:458`
- [x] 5.E1 — lỗi lưu hiện trong hộp, giao diện vẫn là đang gia hạn (không cập nhật lạc quan; đo thật: nút "Huỷ gói" vẫn còn) `plans-view.tsx:124`
- [x] `billing.canceled { planName, endDate }` `:139`
- [x] Test: BE-BIL-33 (5), BE-BIL-34 (3)

### P6 — Rà soát đợt 1

- [x] Guard: 5 controller — mọi route có `JwtAuthGuard` + `SessionAuthGuard` ở cấp class hoặc method, trừ `POST /payments/payos/webhook` (xác minh chữ ký); mọi thao tác ghi có `UserThrottlerGuard`
- [x] IDOR: mọi `:id` / `:orderCode` lọc theo `user_id` người gọi hoặc so `user_id` sau khi đọc (trả 404); mọi `update` trên `subscriptions` có `.eq('user_id', userId)`
- [x] Không `console.log`; TODO còn lại: `TODO(P7)` ở `billing-history.service.ts` (`reported_by`) và `payments.service.ts` (giá gia hạn)
- [x] Checklist UC-73…77: 0 mục chưa tick
- [x] `hai-notes/hai-pr-dot1.md`

### P7 — Gia hạn và hết hạn (hai.md mục "Gia hạn và hết hạn" + migration UC-108)

- [ ] Migration đợt 2: `payment_issues` thêm `remedy` (`extend`/`refund`/`activate`/`dismiss`), `note`, `reported_by`; idempotent
- [ ] `reported_by` ghi khi người dùng báo sự cố (bỏ TODO ở P5)
- [ ] Bộ quét `setInterval` mỗi giờ trong `OnModuleInit`, không thư viện cron; tắt được bằng biến môi trường, tự tắt khi test
- [ ] Nhắc `billing.renewal_due` một lần mỗi mốc: T-3 ngày, đúng ngày hết hạn, mỗi ngày trong ân hạn (`renewal_notified_at` chống gửi lặp); dẫn tới `/plans`
- [ ] Thanh toán gia hạn thành công: `current_period_end = max(now, current_period_end) + 1 tháng`
- [ ] Quá hạn mà chưa trả: `grace_until = current_period_end + 3 ngày` (BR-86); hết ân hạn tự về Free (theo thời gian)
- [ ] Hạ cấp đã đặt lịch: hết kỳ → `plan_id` sang gói đích (Free thì kỳ hết là xong)
- [ ] Giao dịch `pending` quá 30 phút → `failed`
- [ ] Giá gia hạn: `price_effective_at` đã qua → `plan.price_vnd`, ngược lại `price_locked_vnd` (UC-106, BR-119)
- [ ] `/plans`: nút "Gia hạn ngay" (tạo checkout mới) khi còn ≤ 3 ngày hoặc đang ân hạn; cảnh báo khi đang ân hạn
- [ ] An toàn nhiều instance: UPDATE có điều kiện, chỉ thông báo cho dòng thật sự được cập nhật; mỗi bước try/catch riêng
- [ ] Test: `computeRenewalPrice`, `computeNewPeriodEnd` (ngày 31), `currentReminderMilestone`; mỗi bước quét 1 ca chính + 1 ca không làm gì
- [ ] `hai-notes/hai-pr-dot2-notes.md`

### P8 — UC-79 Theme tạo từ ảnh (hai.md mục "UC-79 Tạo theme từ ảnh (STAVE+)")

Nhánh: `feature/theme-from-image-palette` (rẽ từ `feature/billing-renewal-grace-sweeper`).

**Khác biệt so với bản đặc tả P8 gốc** (đã hỏi và được trưởng nhóm xác nhận):

- Bản đặc tả bảo chép L/C từ preset `"unleashed"` trong `globals.css`, và gắn UI vào khối PLACEHOLDER của `theme-picker.tsx`. Cả hai **không còn tồn tại** trên `main`: commit `657b6b0` (04/11/2026) đã gỡ toàn bộ hệ preset (`theme-picker.tsx`, `theme-context.tsx`, `getMyTheme()`, các khối `[data-theme=…]`). Trên `main` chỉ còn bảng màu tối "space" ở `:root`.
  - Quyết định: chép L/C từ `:root` hiện hành (space) — bảng màu custom là 1 phiên bản nhuộm sắc của bảng màu tối đang dùng.
  - Quyết định: UI đặt ở tab mới "Cá nhân hoá" (`profile.tabPersonalisation`) của `/profile`, vì khối PLACEHOLDER cũ không còn.
- `getMyTheme()`/`setMyTheme()` của module `users` **không** dùng lại (preset đã bị gỡ khỏi frontend); UC-79 có endpoint riêng `backend/src/custom-themes`.

**Phần 1 — shared-types**

- [x] `PALETTE_KEYS` đúng 10 khoá, không có khoá `--accent*`/`--success*`/`--warning*`/`--danger*` — `shared-types/src/theme.ts:12`
- [x] `OKLCH_STRICT_REGEX` chỉ nhận `oklch(L C H)` với L ∈ [0,1], C ∈ [0,0.4], H ∈ [0,360) hoặc `none` — `shared-types/src/theme.ts:41`
- [x] `isValidOklch` kiểm tra khoảng giá trị (regex chặt cú pháp, khoảng kiểm riêng) — `shared-types/src/theme.ts:50`
- [x] `isValidPalette` — đủ 10 khoá, không thừa, mọi giá trị OKLCH hợp lệ — `shared-types/src/theme.ts:72`
- [x] `EffectiveTheme` / `SaveCustomThemeRequest` / `SaveCustomThemeResponse` — `shared-types/src/theme.ts:97`, `:105`, `:109`
- [x] Export từ `shared-types/src/index.ts`

**Phần 2 — thư viện lõi frontend**

- [x] `srgbToOklch` / `oklchToSrgb` (Oklab chuẩn Ottosson, M1/M2) — `frontend/lib/theme-from-image.ts:65`, `:89`
- [x] `relativeLuminance` (WCAG 2.1) — `frontend/lib/theme-from-image.ts:121`
- [x] `contrastRatio` (1…21) — `frontend/lib/theme-from-image.ts:133`
- [x] `clusterColors(pixels, k=5)` — k-means tay, không thư viện — `frontend/lib/theme-from-image.ts:147`
- [x] `pickHues` — h1 theo (chroma × share), h2 cách h1 ≥ 30°, mặc định h1+30° — `frontend/lib/theme-from-image.ts:211`
- [x] `THEME_REFERENCE_TOKENS` — L/C tham chiếu lấy từ `:root` hiện hành (space) — `frontend/lib/theme-from-image.ts:241`
- [x] `formatOklch` (L/C 4 chữ số thập phân, H 2) — `frontend/lib/theme-from-image.ts:255`
- [x] `buildPalette(h1, h2)` — 8 biến trung tính dùng h1, 2 biến kim loại dùng h2 — `frontend/lib/theme-from-image.ts:264`
- [x] `ensureContrast` — 3 cặp ≥ 4.5:1 (foreground/background, muted-foreground/background, foreground/surface) — `frontend/lib/theme-from-image.ts:282`
- [x] `extractPalette` + `ThemeFromImageError('not_enough_color')` — cụm lớn > 85%, mọi cụm chroma < 0.03, hoặc chênh hue < 15° — `frontend/lib/theme-from-image.ts:335`, `:19`
- [x] `loadImagePixels` — canvas 64×64, bỏ alpha < 128, thu hồi object URL — `frontend/lib/load-image-pixels.ts:16`

**Phần 3 — backend `backend/src/custom-themes/`**

- [x] `SaveCustomThemeDto` + `validatePalettePayload` — `backend/src/custom-themes/dto/save-custom-theme.dto.ts:16`, `:26`
- [x] `PaletteValidationPipe` — chặn ở biên HTTP, 400 — `backend/src/custom-themes/dto/palette-validation.pipe.ts:15`
- [x] `PUT /themes/me/custom` — `JwtAuthGuard` + `SessionAuthGuard` + `UserThrottlerGuard`, kiểm `hasPaidAccess` → 403, upsert 1 dòng `themes` type `custom`, set `users.active_theme_id` — `backend/src/custom-themes/custom-themes.controller.ts:13`, `custom-themes.service.ts:47`
- [x] `GET /themes/me/effective` — trả `{ type, presetKey, palette, hasPaidAccess }`; hết quyền vẫn trả palette và KHÔNG xoá `generated_palette` — `backend/src/custom-themes/custom-themes.service.ts:104`
- [x] `CustomThemesModule` + khai báo trong `app.module.ts` — `backend/src/custom-themes/custom-themes.module.ts:8`, `backend/src/app.module.ts:63`

**Phần 4 — frontend UI & tích hợp**

- [x] `getMyEffectiveTheme()` / `saveMyCustomTheme()` — `frontend/lib/api-billing.ts:23`, `:28`
- [x] `theme-context.tsx` mới — `ThemeProvider` nạp theme có hiệu lực, `applyCustomPalette` gán/gỡ 10 biến, `canApplyTheme` kiểm quyền + palette hợp lệ — `frontend/context/theme-context.tsx:17`, `:27`, `:41`
- [x] Mount `ThemeProvider` trong `app/layout.tsx` (trong `AuthProvider`) — `frontend/app/layout.tsx:46`
- [x] Component `theme-from-image.tsx` — dropzone kéo thả + chọn file, PNG/JPEG/WebP ≤ 5 MB, xem trước tạm trên `documentElement`, "Áp dụng và lưu" / "Quay về preset", gỡ biến tạm khi unmount — `frontend/components/settings/theme-from-image.tsx:28`
- [x] Gói Free: vùng thả bị disable + giải thích + link `/plans?feature=theme_from_image&returnTo=…` — `frontend/components/settings/theme-from-image.tsx:40`
- [x] Báo lỗi riêng cho ảnh không đủ màu — `frontend/components/settings/theme-from-image.tsx:52`
- [x] Tab "Cá nhân hoá" trên `/profile` — `frontend/app/profile/page.tsx:589`
- [x] Key i18n đủ cả `en` và `vi` — `frontend/lib/i18n/en.ts:458`, `frontend/lib/i18n/vi.ts:460`
- [x] Thông điệp lỗi backend trong `API_MESSAGES` — `frontend/lib/error-message.ts:166`

**Phần 5 — kiểm thử**

- [x] `frontend/lib/__tests__/theme-from-image.test.ts` — 23 ca: chuyển đổi màu, tương phản 21:1, đủ 10 khoá, không khoá cấm, `ensureContrast` đạt ≥ 4.5 với hue 0–359, ảnh đơn sắc bị từ chối
- [x] `backend/src/custom-themes/dto/palette-validation.spec.ts` — 21 ca: thiếu/thừa khoá, khoá cấm, chuỗi injection, ngoài ngưỡng L/C/H
- [x] `backend/src/custom-themes/custom-themes.service.spec.ts` — 10 ca: 403 gói Free, upsert, `GET /themes/me/effective`, không mất dữ liệu khi hết quyền
- [x] `npx vitest run` — 48 file / 872 test pass
- [x] `npx jest src/custom-themes` — 2 suite / 30 test pass
- [x] `tsc --noEmit` (frontend + backend) — pass
- [x] ESLint — 0 lỗi ở file UC-79
- [x] `code-review` (skill) — đã sửa 9 phát hiện

### P9 — UC-104 Admin xem & tra cứu giao dịch (hai.md mục "UC-104")

Nhánh: `feature/admin-billing-transactions-view` (rẽ từ `feature/theme-from-image-palette`).

**Phần 1 — Migration & RPC tổng hợp**

- [x] Migration mới `admin_billing_transactions_summary` — hàm RPC `public.admin_billing_summary(p_from, p_to, p_outcome, p_plan_id)` trả `total_charge_amount`, `total_refund_amount`, `success_count`, `failed_count` — `backend/supabase/migrations/20261109000001_admin_billing_transactions_summary.sql:17`
- [x] RPC `SECURITY DEFINER` + `set search_path = public` + `REVOKE`/`GRANT` cho `service_role` — `:30`, `:50-53`
- [x] Bộ lọc trong RPC khớp đúng bộ lọc của endpoint danh sách (from/to/outcome/plan_id), không lọc `cursor`/`limit` — `:44-47`
- [x] Tổng tiền charge = `kind='charge' AND status='success'`; tổng tiền refund = `kind='refund'` (tách riêng khỏi charge); đếm success/failed theo `status` — `:35-42`
- [x] Index hỗ trợ: `transactions (created_at desc, id desc)`, `transactions (plan_id)`, `transactions (status)`, `payment_issues (transaction_id)` — `:4`, `:6`, `:8`, `:12`
- [x] `total_refund_amount` chỉ tính giao dịch refund đã hoàn tất (`status='success'`), không tính refund đang pending — `:38-40`

**Phần 2 — Backend `backend/src/admin-billing/`**

- [x] `AdminBillingModule` + khai báo trong `backend/src/app.module.ts` — `backend/src/admin-billing/admin-billing.module.ts:9`; `backend/src/app.module.ts:10`, `:47`
- [x] Controller `@UseGuards(JwtAuthGuard, SessionAuthGuard, AdminGuard)` — chỉ `role='admin'` — `backend/src/admin-billing/admin-billing.controller.ts:15`
- [x] `AdminTransactionsQueryDto`: `from` (ISO 8601 optional), `to` (ISO 8601 optional), `outcome` (enum optional), `planId` (uuid optional), `limit` (int 1–100, mặc định 20), `cursor` (string optional) — `backend/src/admin-billing/dto/admin-transactions-query.dto.ts:24`, `:28`, `:32`, `:36`, `:41-44`, `:48`
- [x] `GET /admin/transactions` — danh sách phân trang cursor `(created_at, id)` + block `summary` — `backend/src/admin-billing/admin-billing.controller.ts:20`; `admin-billing.service.ts:61`, `:105-117`, `:88-93`
- [x] Account bị xoá → `account: null`, giữ snapshot `payerName`, `payerEmail`, `plan`, `providerRef` — `admin-billing.service.ts:189`, `:196`, `:198-199`
- [x] `GET /admin/transactions/:id` — chi tiết + giao dịch liên quan (refund tương ứng, retry, giao dịch gốc) + sự cố `payment_issues` liên quan — `admin-billing.controller.ts:25`; `admin-billing.service.ts:124`, `:137-141`, `:147`, `:150-156`
- [x] Chỉ đọc: không có `PATCH`/`PUT`/`DELETE` cho giao dịch — `admin-billing.controller.ts:20`, `:25` (chỉ 2 route `@Get`)
- [x] Không trả dữ liệu nhạy cảm (PAN, số tài khoản, CVV, token cổng) — chỉ `provider_ref`/`order_code` — `backend/src/admin-billing/admin-billing.types.ts:23-24`; test khẳng định không lộ `pan`/`cvv` — `admin-billing.service.spec.ts:155-158`
- [x] Ghi `admin_audit_log` khi admin xem chi tiết giao dịch — **KHÔNG làm**: `admin_audit_log` trong repo chỉ có `target_type` cố định `'user'` (`admin/admin.service.ts`), mục 4.3 của CLAUDE.md cấm UPDATE/DELETE nhưng cho phép INSERT. Chưa chốt được `target_type` mới cho giao dịch → để lại P11 (UC-105/106/107) để quyết cùng trưởng nhóm.

**Phần 3 — Thư viện CSV `frontend/lib/to-csv.ts`**

- [x] `exportToCsv<T>(data, columns, filename)` — BOM UTF-8 `﻿` ở byte đầu — `frontend/lib/to-csv.ts:12`, `:56-58`, `:67-83`
- [x] Escape ô chứa `,` / `\n` / `\r` / `"` bằng cặp ngoặc kép, `"` → `""` — `frontend/lib/to-csv.ts:34-42`
- [x] Chống CSV injection: ô bắt đầu bằng `=`, `+`, `-`, `@`, `\t`, `\r` → prefix `'` — `frontend/lib/to-csv.ts:17`, `:27-31`
- [x] Lặp trang cursor, chặn tối đa 10.000 dòng — `frontend/lib/to-csv.ts:15`, `:98-118`
- [x] `frontend/lib/__tests__/to-csv.test.ts` — BOM, escape, injection, mảng rỗng — 33 test pass

**Phần 4 — Frontend**

- [x] `ADMIN_NAV` thêm "Giao dịch" → `/admin/transactions`, icon `Receipt` — `frontend/components/shell/nav-items.ts:33`; key i18n `nav.transactions` — `frontend/lib/i18n/en.ts:32`, `vi.ts:34`
- [x] Trang `frontend/app/admin/transactions/page.tsx` — bộ lọc đồng bộ 2 chiều với URL search params, đổi bộ lọc reset cursor — `:348-350`, `:435-452`
- [x] 4 thẻ summary; API lỗi → ẩn thẻ + banner lỗi + nút "Thử lại" — `:97-133`, `:618-630`, `:642`
- [x] Bảng: mã/Provider ref, khách hàng, gói, loại, số tiền, trạng thái, thời gian — `:672-701`
- [x] Nhãn "Tài khoản đã xoá" + tên/email lúc thanh toán khi account null — `:135-158`, `:252-256`
- [x] Trạng thái rỗng giải thích rõ (bộ lọc không khớp vs chưa có giao dịch) — `:641-664`
- [x] Lọc `outcome=failed` → gợi ý link tới `/admin/payment-issues` — `:602-613` (route thuộc P11 — UC-108, chưa có trong repo)
- [x] Bấm dòng → modal chi tiết (giao dịch liên quan + sự cố) — `:161-327`, `:735`
- [x] Nút "Xuất CSV" — lặp trang theo bộ lọc, chặn tối đa 10.000 dòng, có loading indicator — `:484-505`, `:518-531`, `:728-732`
- [x] `layout.tsx` server component khai `metadata.title` cho route mới — `frontend/app/admin/transactions/layout.tsx:3`

**Phần 5 — Kiểm thử & nghiệm thu**

- [x] Backend test: guard admin, tính tổng, phân trang cursor, không lộ số thẻ — `backend/src/admin-billing/admin-billing.service.spec.ts:60`, `:113`, `:264` (14 test pass)
- [x] Frontend `npx vitest run` pass — 49 file / 905 test pass (`to-csv.test.ts` 33 test)
- [x] `tsc --noEmit` (frontend) pass — backend có lỗi CŨ ở `src/billing/renewal.spec.ts` (`grace_until` chưa khai), không thuộc UC-104
- [x] ESLint 0 lỗi ở file UC-104 — frontend: `lib/to-csv.ts`, `lib/__tests__/to-csv.test.ts`, `lib/api-admin-billing.ts`, `app/admin/transactions/`, `components/shell/nav-items.ts`, `lib/i18n/{en,vi}.ts`; backend: `src/admin-billing/**`, `src/app.module.ts`
- [x] `code-review` (skill) — 6 phát hiện, đã sửa 5 (URL ngày không hợp lệ làm vỡ trang; chi tiết retry thiếu giao dịch gốc; thiếu index `payment_issues.transaction_id`; hardcode locale `vi-VN` → `appLocale()`; chuỗi chưa có i18n key). Chưa sửa: link `/admin/payment-issues` (route thuộc P11)
- [x] `security-review` — không có phát hiện HIGH/MEDIUM (confidence ≥ 8)
- [ ] `hai-notes/hai-pr-dot2-notes.md` bổ sung phần UC-104 — **chưa làm** (ghi chú PR viết ở P12)

### P11 — UC-108 Xử lý sự cố thanh toán (11/11/2026, nhánh `feature/admin-payment-issue-resolution`)

**Rà soát trước khi làm:** phần backend P11 đã được merge sẵn vào `main` (commit `d0d93e9`): migration `20261110000001_admin_payment_issue_resolution.sql` (hàm `resolve_payment_issue` + đủ 4 remedy, mọi ghi trong 1 transaction ⇒ lỗi ⇒ rollback toàn bộ), `admin-payment-issues.service.ts`, `admin-payment-issues.controller.ts`, `dto/resolve-payment-issue.dto.ts`, `dto/admin-payment-issues-query.dto.ts`. Phần còn thiếu: **frontend hoàn toàn** (nav, i18n, API client, 2 trang) + **module chưa đăng ký controller/service** ⇒ endpoint trả 404.

- [x] Migration `resolve_payment_issue` — đủ 4 remedy (`extend`/`refund`/`activate`/`dismiss`), `FOR UPDATE` + 1 transaction ⇒ lỗi ⇒ rollback toàn bộ, sự cố giữ `'open'` — **GIỮ NGUYÊN, không sửa**
- [x] `GET /admin/payment-issues?status=&cursor=` — cursor base64url `[created_at, id]`, snapshot `payer_name`/`payer_email` khi tài khoản đã xoá — **GIỮ NGUYÊN**
- [x] `GET /admin/payment-issues/:id` — timeline giao dịch (theo `user_id`, tài khoản đã xoá thì theo `payer_email`), verification `match`/`mismatch`/`skipped`/`unavailable` qua `PaymentGateway.getPaymentStatus` — **GIỮ NGUYÊN**
- [x] `POST /admin/payment-issues/:id/resolve` — verify bắt buộc cho `extend`/`refund`/`activate` (trừ cổng giả) ⇒ `'unavailable'` → **409 "Payment provider unavailable, issue stays open"**; `dismiss` không cần verify — **GIỮ NGUYÊN**
- [x] Notification `billing.issue_resolved` (chỉ khi tài khoản còn) + audit log `payment_issue.resolve` (`target_type = 'payment_issue'`) — **GIỮ NGUYÊN**
- [x] **ĐĂNG KÝ MODULE** — `AdminPaymentIssuesController` + `AdminPaymentIssuesService` **chưa** có trong `AdminBillingModule` ⇒ endpoint 404. Đã thêm (`backend/src/admin-billing/admin-billing.module.ts`)
- [x] Sửa 2 lỗi compile backend có sẵn trong file đã merge: `AdminPaymentIssueStatus` không tồn tại (type thật là `PaymentIssueStatus`); `reporters.get(issueRow.reported_by)` với `string | null`
- [x] Dọn lint trong file P11: `AdminIssueTransaction` + `ACCOUNT_COLUMNS` không dùng, `buildSummary`/`writeAuditLog` nhận tham số thừa
- [x] Nav: `ADMIN_NAV` thêm `{ href: '/admin/payment-issues', icon: AlertTriangle }` (`components/shell/nav-items.ts`)
- [x] i18n: `nav.payment_issues` + nhóm `pi.*` (~70 key) trong **cả** `lib/i18n/en.ts` và `lib/i18n/vi.ts` — test `i18n.test.ts` xác nhận 2 file có đúng bộ key giống nhau
- [x] API client `frontend/lib/api-admin-payment-issues.ts` — `listAdminPaymentIssues` / `getAdminPaymentIssue` / `resolveAdminPaymentIssue`
- [x] Trang danh sách `/admin/payment-issues` — Tabs "Đang mở"/"Đã xử lý" đồng bộ `?status=` qua `useSearchParams` + `router.replace`; bảng: mã sự cố, giao dịch, khách hàng (badge "Tài khoản đã xoá" + snapshot payer), người báo, ngày tạo; phân trang cursor ("Tải thêm")
- [x] Trang chi tiết `/admin/payment-issues/[id]` — header, timeline giao dịch, badge đối chiếu cổng, form biện pháp dynamic (days / refundAmount+refundRef / duplicateOfIssueId), ghi chú bắt buộc + đếm ký tự `/1000`, `ConfirmDialog` trước khi gửi, lỗi hiện trong hộp và **giữ nguyên form**
- [x] Khi verification = `unavailable`: hiện nút "Đối chiếu lại", **disable 3 remedy còn lại** (chỉ cho `dismiss`) + giải thích
- [x] `API_MESSAGES` trong `lib/error-message.ts` — thêm 8 thông điệp lỗi backend của P11 (409 unavailable, 409 đã resolved, 400 note…)
- [x] Test backend `admin-payment-issues.service.spec.ts` — 32 test: DTO (note rỗng / > 1000 / biên 1000, remedy lạ, days 1–90, refundRef), cursor codec, list (snapshot tài khoản đã xoá, nextCursor, cursor rác → 400), detail (404, skipped/match/mismatch/unavailable, tài khoản đã xoá), resolve (4 remedy, note rỗng → 400 không gọi RPC, unavailable → 409 không gọi RPC, RPC ST001/ST002/ST004/lạ, tài khoản đã xoá → không gửi thông báo)
- [x] Test frontend `lib/api-admin-payment-issues.test.ts` — 4 test (query string, GET chi tiết, POST resolve + payload)

**Kiểm tra:** backend `tsc --noEmit` pass · frontend `tsc --noEmit` pass · ESLint 0 lỗi ở **tất cả file P11** (backend + frontend) · backend `npx jest src/admin-billing` 46/46 pass · backend `npx jest` 2207/2208 pass (1 fail **có sẵn trên main**: `src/billing/renewal.spec.ts:166`, không thuộc P11 — đã xác nhận bằng `git stash` + chạy lại trên main sạch) · frontend `npx vitest run` 50 file / 909 test pass.

**Lưu ý phạm vi:** `npm run lint` của backend chạy `eslint --fix` nên nó **tự reformat 6 file ngoài P11** (`admin-plans.service.ts`, `admin-plans.types.ts`, `billing/payments.service.ts`, `billing/renewal.ts`, `billing/subscription-changes.service.spec.ts`, `custom-themes.service.spec.ts`) — thay đổi **chỉ là format**, không đổi logic. Không revert được (lệnh `git checkout --`/`git restore` bị chặn bởi policy) nên đã giữ trong commit. 12 lỗi lint còn lại ở 3 file đó là **có sẵn trên main** (P7/P8/P10) — để P12 xử lý.

## Kết quả kiểm tra

### P1 (06/11/2026, nhánh `feature/billing-migration-batch-one`)

- **SQL** (Postgres 17-alpine trong Docker, schema giả theo cột hai.md, 2 biến thể `status` enum/text; container đã xoá, Docker đã tắt):
  - Áp 2 lần liên tiếp: không lỗi; vẫn đúng 2 gói.
  - FK cuối: `transactions_user_id_fkey ON DELETE SET NULL`, `subscriptions_user_id_fkey ON DELETE CASCADE`; FK cũ khác tên bị bỏ.
  - Hàm: thành công → kích hoạt 1 tháng; gọi lại → `processed:false`; thất bại → `failed`; order không có → `processed:false`; kích hoạt lỗi → giao dịch vẫn `success`, `activated:false` + `activation_error`; **2 phiên đồng thời → chỉ 1 phiên xử lý**.
  - Sự cố mở thứ 2 cùng giao dịch → bị chặn. RLS `authenticated`: chỉ thấy gói bật + dữ liệu của mình; gọi hàm → `insufficient_privilege`.
  - Xoá tài khoản → giao dịch còn (`user_id` NULL), đăng ký bị xoá.
  - Lần chạy đầu bắt được lỗi: hàm ghi `transactions.subscription_id` làm xoá tài khoản bị chặn → đã bỏ (xem Quyết định 3).
- `tsc --noEmit` shared-types: pass. ESLint: shared-types không có cấu hình lint (cả 2 config báo "File ignored because outside of base path", 0 lỗi).
- Backend `npm test`: 73/73 suite, 1542/1542 test pass. `npm run build`: pass.
- Frontend `npx vitest run`: 28/28 file, 608/608 test pass. `npm run build`: pass.

### P2 (06/11/2026, nhánh `feature/stave-plus-plans-and-checkout`)

- Cài `@payos/node@2.0.5` (`npm i @payos/node@latest --workspace=backend`); lockfile chỉ thêm đúng gói này.
- Backend `npx eslint src/billing src/app.module.ts`: 0 lỗi (đã chạy `prettier --write` riêng cho `src/billing`). `npm test`: **81 suite / 1603 test pass** (billing: 8 suite, 61 test). `npm run build`: pass.
- Frontend `npx eslint` (các file đã đổi): 0 lỗi. `npx vitest run`: **29 file / 612 test pass**. `npm run build`: pass.
- Đo thật trang giả: build production → `/dev/fake-payment` prerender **status 404**; `next dev` không có `NEXT_PUBLIC_PAYMENT_PROVIDER` → 404; có `=fake` → 200. Server đã tắt, cổng 3000/3001/3005 sạch. `frontend/AGENTS.md` bị `next dev` tự sửa → đã khôi phục.
- **Chưa chạy được luồng thật từ giao diện tới DB**: migration chưa được áp lên DB test/local nào; không chạy backend vì bộ quét Jam truy vấn DB production. Cần làm khi có DB test.

### P3 (06/11/2026, nhánh `feature/stave-plus-plans-and-checkout`)

- Backend `npx eslint src/billing`: 0 lỗi. `npm test`: **81 suite / 1611 test pass**. `npm run build`: pass.
- Frontend `npx eslint` (file đã đổi): 0 lỗi. `tsc --noEmit`: pass. `npx vitest run`: **31 file / 617 test pass**. `npm run build`: pass (`/plans` là route động).
- **Tự xem 4 trạng thái** (Playwright tạm ở scratchpad, `next dev` cổng 3005, `NEXT_PUBLIC_API_URL` trỏ cổng trống, đăng nhập giả như `e2e/support/mock-auth.ts`, **mọi response API là dữ liệu giả**, chặn mọi request ghi — đếm được 0 request ghi; server đã tắt, `frontend/AGENTS.md` đã khôi phục):
  - Free: "Gói hiện tại" ở Free, nút "Nâng cấp lên STAVE+" ở STAVE+.
  - Đã đăng ký STAVE+: "Đổi gói" ở Free, "Huỷ gói" ở STAVE+.
  - Gói đã tắt còn hạn: card gói đó có "Gói hiện tại" + "Gói này không còn mở bán, bạn vẫn dùng đến 20/11/2026."
  - API lỗi 500: chỉ khung lỗi + "Thử lại", không có giá nào.
  - `?feature=theme_from_image&canceled=1`: thông báo huỷ, card STAVE+ có viền + badge, dòng "Theme tạo từ ảnh" in đậm màu accent; màn 390px cuộn tới card.
  - Lần đo đầu nút lỗi hiện "Try again" (key i18n `ui.retry`, ngôn ngữ mặc định của app là EN) → đổi sang chữ tiếng Việt viết thẳng.

### P4 (06/11/2026, nhánh `feature/stave-plus-plans-and-checkout`)

- **SQL** (sửa `billing_complete_order` trong migration P1, commit `59bb620` trên `feature/billing-migration-batch-one`, rồi merge vào nhánh P2): Postgres 17 tạm trong Docker, schema giả, 2 biến thể enum/text — áp 2 lần không lỗi; bộ kiểm P1 vẫn qua; thêm: kích hoạt lỗi → giao dịch `success` + 1 sự cố mở; đơn đã `failed` mà báo thành công → giao dịch giữ `failed` + 1 sự cố (gọi lần 2 không tạo thêm); gia hạn cùng gói còn hạn → kỳ mới nối từ ngày hết hạn cũ, xoá `renewal_notified_at`; giao dịch mất `user_id` → `success` + sự cố; 2 phiên đồng thời → 1 kích hoạt. Container đã xoá, Docker đã tắt.
- Backend `npx eslint src/billing src/app.module.ts`: 0 lỗi. `npm test`: **83 suite / 1646 test pass** (billing 10 suite / 104 test). `npm run build`: pass.
- Frontend `npx eslint` (file đã đổi): 0 lỗi. `tsc --noEmit`: pass. `npx vitest run`: **32 file / 628 test pass**. `npm run build`: pass.
- **Đo trên trình duyệt** (Playwright tạm, `next dev` cổng 3005, đăng nhập giả + **mọi response API giả**, không request nào tới backend/DB thật; server đã tắt, `frontend/AGENTS.md` đã khôi phục):
  - `/plans` → "Nâng cấp lên STAVE+" → hộp xác nhận nêu 49.000 ₫, 1 tháng, điều khoản huỷ. Body gửi đi `{ planId, returnTo: "/profile?tab=theme" }`. 502 → lỗi hiện **trong hộp**, hộp vẫn mở. Thành công → trình duyệt chuyển tới `checkoutUrl`.
  - `/billing/result`: thành công → "Tiếp tục" trỏ `/profile?tab=theme`; thành công mà `hasPaidAccess=false` → khung "chưa được kích hoạt… sự cố đã được ghi nhận"; URL có `status=PAID&code=00` nhưng backend nói `failed` → hiện thất bại; 404 → "Không tìm thấy đơn"; `returnTo=//evil.com` → "Tiếp tục" về `/plans`; pending suốt → sau ~30 giây "Đang chờ xác nhận", **sync đúng 1 lần**. (Dev mode React StrictMode chạy effect 2 lần nên đếm được 1 lần GET thừa; bản production không có.)
- **Chưa chạy được với PayOS thật / DB thật** (cần khoá + DB test đã áp migration).

### P5 (06/11/2026, nhánh `feature/stave-plus-history-change-cancel`, tạo từ nhánh P2)

- Backend `npx eslint src/billing`: 0 lỗi. `npm test`: **84 suite / 1667 test pass** (billing 11 suite / 125 test). `npm run build`: pass.
- Frontend `npx eslint` (file đã đổi): 0 lỗi. `tsc --noEmit`: pass. `npx vitest run`: **33 file / 634 test pass**. `npm run build`: pass (`/billing` tĩnh, `/billing/receipts/[id]` và `/billing/result` động).
- **Đo trên trình duyệt** (Playwright tạm, `next dev` cổng 3005, đăng nhập giả + **mọi response API giả**; server đã tắt, `frontend/AGENTS.md` đã khôi phục):
  - `/billing`: "Gói hiện tại: STAVE+ / Đã huỷ gia hạn. Hiệu lực đến 06/12/2026."; 4 dòng (thành công + dòng phụ thử lại, thất bại có sự cố mở → nút khoá "Đã có sự cố đang xử lý", chưa hoàn tất, đền bù 0 ₫ có nhãn); chỉ 1 link "Biên lai" (giao dịch thành công loại charge); "Tải thêm" gửi `?cursor=` rồi biến mất khi hết.
  - Hộp báo sự cố: bấm gửi khi trống → "Hãy mô tả sự cố bạn gặp."; 501 ký tự → bộ đếm "501/500" + "Mô tả tối đa 500 ký tự."; Esc rồi mở lại → chữ vẫn còn; gửi → body `{ description }` đã trim, thông báo "Đã gửi sự cố…", nút chuyển sang khoá.
  - Rỗng → `EmptyState` + nút "Xem các gói"; lỗi 500 → khung lỗi + "Thử lại".
  - Biên lai: chế độ in (`emulateMedia print`) → thanh bên và nút "In" ẩn; màn hình → nút "In" hiện; không có biên lai → "Biên lai không có cho giao dịch này." + chi tiết, không nút In; 404 → lỗi + "Thử lại"; `/billing/receipts/not-a-uuid` → 404.
  - Ngày định dạng theo ngôn ngữ đang chọn của app (`formatDate` dùng `appLocale()`): lần đo đầu ra `11/05/2026` ở chế độ EN.

### P6 (06/11/2026, nhánh `feature/stave-plus-history-change-cancel`)

- Backend `npx eslint src/billing`: 0 lỗi. `npm test`: **85 suite / 1689 test pass** (billing 12 suite / 147 test). `npm run build`: pass.
- Frontend `npx eslint` (file đã đổi): 0 lỗi. `tsc --noEmit`: pass. `npx vitest run`: **33 file / 634 test pass**. `npm run build`: pass.
- **SQL nâng cấp** (Postgres 17 tạm trong Docker, schema giả; container đã xoá, Docker đã tắt): STAVE+ đã huỷ + có lịch hạ cấp, còn 20 ngày → trả Pro 99.000 → gói Pro, `active`, `price_locked_vnd` 99.000, kỳ mới ~1 tháng từ lúc trả (không cộng 20 ngày cũ), `started_at` mới, lịch hạ cấp bị xoá; đơn tiếp theo bị từ chối → vẫn Pro. Hàm SQL hiện có đã đúng, không cần sửa.
- **Trình duyệt** (Playwright tạm, `next dev` cổng 3005, đăng nhập giả + backend giả có trạng thái trong script, không request nào tới backend/DB thật; server đã tắt, `frontend/AGENTS.md` đã khôi phục) — kịch bản Free → STAVE+ → huỷ → tiếp tục → hạ cấp về Free → huỷ lịch:
  1. Nâng cấp → STAVE+ là "Gói hiện tại", có nút "Huỷ gói".
  2. Huỷ: hộp nêu "đến 06/12/2026… quay về gói miễn phí", "Không dự án hay dữ liệu nào bị xoá", "Theme tạo từ ảnh… Bảng màu vẫn được giữ". Lần 1 backend lỗi 500 → lỗi trong hộp, trang vẫn còn nút "Huỷ gói" (vẫn gia hạn). Lần 2 → "Đã huỷ, hiệu lực đến 06/12/2026" + "Tiếp tục gói".
  3. Tiếp tục → nút "Huỷ gói" trở lại.
  4. "Đổi gói" sang Free → hộp "Không thu tiền… chuyển sang Free vào 06/12/2026"; bấm "Để sau" → **0 request ghi**; đặt lịch → khung "Sẽ chuyển sang Free vào 06/12/2026".
  5. "Huỷ lịch hạ cấp" → khung biến mất.
- Rà soát đợt 1: xem checklist "P6 — Rà soát đợt 1".

## Quyết định

1. **(P1)** Không xác minh được tên FK trên DB thật (không được đụng production). Các FK khác trong `20261026000003` đều theo tên mặc định `<bảng>_<cột>_fkey` và đã áp được bằng `DROP CONSTRAINT` không `IF EXISTS`, nên giữ nguyên văn đặc tả. Thêm 1 khối `DO` bỏ FK khác tên trên `user_id` của 2 bảng, để không còn FK cũ (vd CASCADE) chạy song song làm mất tác dụng của SET NULL.
2. **(P1)** Gói mẫu chèn kèm `id = gen_random_uuid()` và `created_at = now()` tường minh, vì không biết cột có default không.
3. **(P1)** `billing_complete_order` **không** ghi `transactions.subscription_id`: FK có sẵn `transactions_subscription_id_fkey` không có `ON DELETE`, ghi vào thì việc xoá tài khoản bị chặn (đã tái hiện). Đặc tả không yêu cầu cột này.
4. **(P1)** Kích hoạt lỗi (UC-74 5.E1): hàm bắt lỗi upsert trong khối con, giao dịch vẫn `success`, trả `activated:false` + `activation_error` để P4 tạo `payment_issues`. Khoá dòng bằng `SELECT ... FOR UPDATE` (gọi đồng thời vẫn chỉ xử lý 1 lần). Trạng thái gán bằng literal riêng từng nhánh để chạy được dù cột là enum hay text.
5. **(P1)** `price_locked_vnd` = `amount_vnd` của giao dịch (số đã thu, theo hai-prompts P1).
6. **(P1)** Tên policy: `subscription_plans_select_active`, `subscriptions_select_own`, `transactions_select_own`, `payment_issues_select_own`; dùng `(select auth.uid())` theo quy ước repo.
7. **(P1)** `shared-types/src/index.ts` dùng `export *` (không phải `export type *` như module khác) vì `PLAN_FEATURES` là giá trị runtime.
8. **(P1)** Ghi chú PR đặt ở `hai-notes/` (theo yêu cầu của Hải, thay cho `docs/tasks/`).
9. **(Lưu ý cho P2+)** `subscriptions` có 2 FK tới `subscription_plans` → truy vấn nhúng phải ghi `subscription_plans!subscriptions_plan_id_fkey`, tránh `PGRST201`.
10. **(P2)** Trang/endpoint giả bật chỉ khi `PAYMENT_PROVIDER` **ghi rõ** `fake` (và `NODE_ENV !== 'production'`). Để trống thì backend vẫn dùng FakeGateway, nhưng **không** có endpoint giả. Lý do: Railway có thể không đặt `NODE_ENV`; nếu bật theo giá trị mặc định, ai cũng tự đánh dấu đơn của mình là đã thanh toán được. Frontend tương tự: chỉ khi `NEXT_PUBLIC_PAYMENT_PROVIDER=fake`. Chạy local phải đặt cả 2 biến.
11. **(P2)** `BillingModule.register()` (dynamic, `global: true`): mảng `controllers` tính lúc gọi, sau `ConfigModule.forRoot()` (đã kiểm: `forRoot` nạp `.env` đồng bộ trước `await` đầu tiên). Module khác (UC-79) inject `SubscriptionsService` mà không cần import lại.
12. **(P2)** Map trạng thái PayOS: `PAID` → success; `CANCELLED`/`EXPIRED`/**`FAILED`** → failed (SDK có thêm `FAILED`, đặc tả không nhắc nhưng rõ là thất bại); `PENDING`/`PROCESSING`/`UNDERPAID` → pending.
13. **(P2)** PayOS client: `timeout 10000`, `maxRetries: 0` (để người dùng chờ tối đa ~10s, đúng ý "không phản hồi" ở 4.E3), `logLevel: 'off'` (SDK không log body có thông tin người trả). Webhook `success` khi cả `code` ngoài lẫn `data.code` là `'00'`.
14. **(P2)** `FakeGateway.verifyWebhook` luôn trả null (cổng giả không có webhook có chữ ký; đường hoàn tất là endpoint giả). `getPaymentStatus` của đơn không tồn tại → `failed`.
15. **(P2)** `status` của `/subscriptions/me` có thêm giá trị `'none'` (không có đăng ký còn hiệu lực → gói mặc định), để giao diện không phải đoán từ `null`.
16. **(P2)** `FRONTEND_URL` trống → `http://localhost:3000`. Repo chưa có chỗ nào đọc biến này.
17. **(P2)** Chữ giao diện của tôi viết thẳng tiếng Việt (không thêm key vào `lib/i18n/*`, file ngoài phạm vi); dùng lại key có sẵn `ui.loading`, `ui.retry`. `API_MESSAGES` thêm câu có cả `en` và `vi` theo kiểu của bảng.
18. **(P2)** Mã test `BE-BIL-xx` / `FE-BIL-xx` + `UTCIDxx` theo quy ước file spec hiện có; mã chưa có trong file xls Report 5.
19. **(P3)** Nút trên `/plans`: người ở gói miễn phí thấy "Nâng cấp lên <tên>" trên các gói trả phí; người ở gói trả phí thấy "Huỷ gói" trên gói hiện tại (ẩn nếu đã huỷ) và "Đổi gói" trên các gói khác (kể cả Free). Đến khi nối P4/P6 các nút để `disabled` (không để nút bấm mà không làm gì).
20. **(P3)** Gói miễn phí hiện "Miễn phí" thay cho "0 ₫", không có dòng chu kỳ/điều khoản huỷ.
21. **(P3)** `formatVnd` nằm ở `frontend/lib/format-vnd.ts` (dùng `APP_LOCALE` = `vi-VN` của `format-date.ts`, không ghi cứng locale). Xử lý tham số URL ở server `page.tsx` rồi truyền xuống client component, không dùng `useSearchParams`.
22. **(P3)** Trang của tôi viết toàn bộ chữ tiếng Việt (kể cả "Thử lại", "Đang tải…"), không lẫn key i18n — xem câu hỏi 7.
23. **(P4)** Sửa `billing_complete_order` ngay trong migration P1 (chưa merge, theo hai-prompts P4) — commit trên nhánh P1 rồi merge nhánh P1 vào nhánh P2 (không rebase). Hàm giờ: (a) tạo `payment_issues` **trong cùng giao dịch DB** khi kích hoạt lỗi (khối `EXCEPTION`), (b) đơn đã `failed` mà cổng báo thành công → không sửa giao dịch, tạo sự cố "Cổng thanh toán báo thành công sau khi giao dịch đã bị đánh dấu thất bại" (câu do tôi đặt, hai.md không ghi), (c) cùng gói còn hạn/ân hạn → kỳ mới = `max(now, current_period_end) + 1 tháng` (sẵn cho gia hạn P7); khác gói → kỳ mới từ lúc thanh toán (BR-88), (d) trả thêm `plan_name`, `amount_vnd`, `issue_created`.
24. **(P4)** Thông báo `billing.payment_success` vẫn gửi khi kích hoạt lỗi (tiền đã trừ thật); trang kết quả báo riêng "gói chưa được kích hoạt, sự cố đã được ghi nhận" (đọc `/subscriptions/me`). Đơn không tồn tại (vd webhook thử của PayOS) → log, trả OK.
25. **(P4)** Webhook hợp lệ nhưng DB lỗi khi hoàn tất → trả 500 (không nuốt lỗi) để PayOS gửi lại; "luôn 200" áp cho mọi trường hợp đã xử lý xong (kể cả đã xử lý trước đó).
26. **(P4)** `sync` gọi lại trong 3 giây → trả trạng thái hiện tại, không hỏi cổng (không báo lỗi). Đơn `expired` (DB vẫn pending) vẫn được sync.
27. **(P4)** `upgrade`/`renew` đã có kiểm tra trong `createCheckout` nhưng chưa mở endpoint (P6/P7). Gói đã tắt chỉ cho `renew` (BR-120). Giá gia hạn để TODO(P7).
28. **(P4)** Cổng giả: "Huỷ" = `completeOrder(false)` (theo P2) nên cũng gửi `billing.payment_failed`; với PayOS thật, huỷ không có webhook, đơn để pending tới khi bộ quét (P7) đánh dấu.
29. **(P4)** Câu lỗi trong hộp thoại/`apiErrorMessage` theo ngôn ngữ đang chọn của app (mặc định EN) nên có thể lẫn tiếng Anh trên trang tiếng Việt; nút "Đang xử lý" của `ConfirmDialog` dùng chung cũng vậy — thuộc câu hỏi 13.
30. **(P5)** Biên lai trả `{ available, details, receipt }` (`receipt` null khi không lập được) thay cho dạng phẳng trong hai-prompts, để giao diện luôn có `details`. Biên lai chỉ lập cho giao dịch `success`, `kind = 'charge'`, có `order_code`, tên gói và số tiền > 0 (hoàn tiền/đền bù không có biên lai — biên lai hoàn tiền nằm ở PayOS). Người thanh toán = `payer_name`, thiếu thì `payer_email`.
31. **(P5)** Cursor = base64url của `[created_at, id]`, giải mã xong phải khớp mẫu timestamp + UUID mới đưa vào `or()` của PostgREST (chống chèn bộ lọc). `limit` 1–50, mặc định 20.
32. **(P5)** In: thêm thẻ `<style>` `@media print` trong component biên lai (không sửa `globals.css`), ẩn `#app-sidebar`, `aside`, `nav`, `header`, `footer`, `[data-print-hide]`, bỏ giới hạn chiều cao của `main`.
33. **(P5)** "Báo sự cố" có trên mọi dòng (kể cả thất bại/chưa hoàn tất) — người dùng hay cần báo đúng các giao dịch đó. Chữ đang gõ giữ ở trang cha theo từng giao dịch.
34. **(P6)** Phân loại đổi gói so giá gói đích với `price_vnd` **hiện tại** của gói đang dùng (không so `price_locked_vnd`), theo mặc định của master prompt. Giá đích **bằng** giá hiện tại → coi là hạ cấp (không thu tiền, áp dụng hết kỳ) — câu hỏi cho trưởng nhóm.
35. **(P6)** Hoàn tất nâng cấp không cần sửa SQL: `billing_complete_order` đã phân biệt cùng gói (gia hạn, nối kỳ) và khác gói (kỳ mới từ lúc trả, `price_locked_vnd` mới, `active`, xoá `pending_plan_id`). Nâng cấp không gửi thêm `billing.plan_changed` (đã có `billing.payment_success`); `billing.plan_changed` gửi khi đặt lịch hạ cấp.
36. **(P6)** Hạ cấp bị từ chối khi gói đã huỷ ("Resume your plan before scheduling a change") hoặc đang trong ân hạn ("Renew your plan…"); nâng cấp vẫn được (thanh toán xong gói tự `active` lại). Hạ cấp chỉ ghi khi dòng `subscriptions` còn đúng gói và `active` (chống ghi đè khi trạng thái vừa đổi).
37. **(P6)** Huỷ gói xoá luôn lịch hạ cấp (`pending_plan_id = NULL`) theo hai-prompts. "Tiếp tục gói" và "Huỷ lịch hạ cấp" chạy ngay, không hộp xác nhận (không mất tiền, không mất gì); lỗi hiện ở khung `role="alert"` đầu trang.
38. **(P6)** Ngày trong thông báo backend định dạng `dd/mm/yyyy` theo giờ `Asia/Ho_Chi_Minh` (`billing-format.ts`).

## Câu hỏi cho trưởng nhóm

1. **(P1)** Trước khi áp: kiểm `pg_policies` của 4 bảng billing. Nếu có policy cũ rộng hơn thì phải bỏ, vì policy cộng dồn theo OR.
2. **(P1)** Đổi `transactions_subscription_id_fkey` thành `ON DELETE SET NULL` không? Hiện nó sẽ chặn xoá tài khoản nếu có code ghi cột này.
3. **(P1)** Nếu bảng thật đã có `UNIQUE(name)` mang tên mặc định `subscription_plans_name_key` thì chỉ mục `lower(name)` của đặc tả bị bỏ qua im lặng. Kiểm `\d subscription_plans`.
4. **(P1)** hai.md ghi 2 FK hiện "chặn xoá tài khoản"; ghi chú §99 ghi `transactions.user_id` vốn CASCADE. Xác nhận hiện trạng thật.
5. Chốt giá STAVE+ (49.000đ là giá mẫu).
6. **(P9)** `frontend/components/admin/admin-nav-items.ts` không tồn tại; menu admin ở `frontend/components/shell/nav-items.ts` (`ADMIN_NAV`), file này không nằm trong danh sách được sửa. Cho phép thêm mục vào đó không?
7. **(P3+)** Frontend đã i18n: chữ giao diện lấy từ `lib/i18n/vi.ts` + `en.ts`, `API_MESSAGES` cần cả `en` và `vi`. Hai file i18n không nằm trong danh sách được sửa. Trang mới của tôi viết chữ tiếng Việt trực tiếp, hay được thêm key vào `vi.ts`/`en.ts`?
8. Phần làm dở cũ trong `stash@{0}` (refactor editor + bản billing cũ): giữ hay bỏ?
9. **(P2)** `frontend/.env.example` có sẵn nhưng không nằm trong danh sách được sửa → chưa thêm `NEXT_PUBLIC_PAYMENT_PROVIDER=`. Cho phép thêm 1 dòng không? (Thiếu biến thì trang giả trả 404 — an toàn.)
10. **(P2)** Trên Railway/Vercel bản thật: đặt `PAYMENT_PROVIDER=payos` + 3 khoá + `FRONTEND_URL`; **không** đặt `PAYMENT_PROVIDER=fake` ở môi trường công khai.
11. **(P2)** Cần DB test (hoặc stack local) đã áp migration để chạy thử luồng trang giả từ giao diện tới DB.
12. **(P3)** Cần thêm link "Gói dịch vụ" → `/plans` vào menu người dùng. Tôi không sửa `site-header.tsx` (của Trí). Lưu ý: app hiện dùng thanh bên `components/shell/nav-items.ts` (Settings, EN/VI, Sign out…), có thể chỗ hợp lý là ở đó.
13. **(P3, bổ sung câu 7)** `main` hiện có nút chuyển **EN/VI** và mặc định **EN**. Chữ tiếng Việt viết thẳng trong trang billing sẽ không đổi theo nút này. Cần quyết: cho tôi thêm key vào `lib/i18n/{vi,en}.ts`, hay chấp nhận trang billing chỉ tiếng Việt? (CLAUDE.md §4.7 "không dark mode" cũng đã lỗi thời: app đang nền tối; trang của tôi chỉ dùng token màu nên hiển thị đúng.)
14. **(P6)** Đổi sang gói cùng giá: đang coi là hạ cấp (không thu tiền, áp dụng hết kỳ). Đúng ý không?

## Thứ tự merge

1. `feature/billing-migration-batch-one` (P1) — PR migration, trưởng nhóm áp migration sau khi merge.
2. `feature/stave-plus-plans-and-checkout` (P2–P4, tạo từ nhánh P1) — merge sau P1. Nhánh này đã merge lại nhánh P1 sau commit `59bb620` (sửa hàm SQL); PR migration phải gồm commit đó.
3. `feature/stave-plus-history-change-cancel` (P5–P6, tạo từ nhánh P2) — merge sau nhánh P2.
4. (các nhánh sau xếp chồng theo bảng tiến độ)
