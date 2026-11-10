# PR đợt 1: Thanh toán STAVE+ (UC-73 → UC-77)

## Nhánh và thứ tự merge

| Thứ tự | Nhánh | Nội dung | Tạo từ |
|---|---|---|---|
| 1 | `feature/billing-migration-batch-one` | Migration `20261025140000_hai_billing.sql`, gói mẫu, `PLAN_FEATURES` | `main` |
| 2 | `feature/stave-plus-plans-and-checkout` | Cổng thanh toán (PayOS + giả), UC-73, UC-74 | nhánh 1 |
| 3 | `feature/stave-plus-history-change-cancel` | UC-77, UC-75, UC-76 | nhánh 2 |

Các nhánh xếp chồng: merge theo đúng thứ tự trên. Nhánh 2 đã merge lại nhánh 1 sau commit `59bb620` (sửa hàm SQL), nên PR migration phải gồm commit đó. Sau khi nhánh 1 merge, trưởng nhóm áp migration rồi mới chạy được luồng thật.

## Đã làm

| UC | Tóm tắt |
|---|---|
| UC-73 Xem các gói | `GET /subscription-plans`, `GET /subscriptions/me`; trang `/plans`: thông điệp "Quản lý phiên bản luôn miễn phí", card từng gói, gói hiện tại, `?feature=` làm nổi bật + cuộn tới, gói đã tắt vẫn hiện cho người đang dùng kèm ngày hết. |
| UC-74 Đăng ký STAVE+ | `POST /subscriptions/checkout`, webhook `POST /payments/payos/webhook` (xác minh chữ ký, idempotent), `GET /payments/orders/:orderCode`, `POST /payments/orders/:orderCode/sync`; hàm SQL `billing_complete_order` (khoá dòng, kích hoạt, tự tạo sự cố khi kích hoạt lỗi); trang `/billing/result` (hỏi trạng thái 30 giây, sync 1 lần). |
| UC-75 Đổi gói | `GET /subscriptions/change-preview`, `POST /subscriptions/change`, `POST /subscriptions/cancel-downgrade`. Nâng cấp = thanh toán toàn bộ giá gói mới, kỳ mới từ lúc trả. Hạ cấp = đặt lịch tới hết kỳ, không thu tiền. |
| UC-76 Huỷ gói | `GET /subscriptions/cancel-preview`, `POST /subscriptions/cancel`, `POST /subscriptions/resume`. Huỷ giữ nguyên ngày hết kỳ, không hoàn tiền. |
| UC-77 Lịch sử giao dịch | `GET /billing/transactions` (phân trang), `GET /billing/transactions/:id/receipt`, `POST /billing/transactions/:id/issues`; trang `/billing`, biên lai in được `/billing/receipts/[id]`, báo sự cố. |

## Đổi bảng DB / API dùng chung

- Migration `20261025140000_hai_billing.sql` (xem `hai-pr-migration.md`): thêm cột cho 4 bảng billing, đổi 2 FK (`transactions.user_id` → SET NULL, `subscriptions.user_id` → CASCADE), RLS, gói mẫu, hàm `billing_complete_order`.
- Dòng thêm vào file dùng chung: `backend/src/app.module.ts` (`BillingModule.register()`), `shared-types/src/index.ts` (`export * from "./billing"`), cuối `API_MESSAGES` trong `frontend/lib/error-message.ts`, `backend/.env.example` (`PAYMENT_PROVIDER=`, `FRONTEND_URL=`), `backend/package.json` + `package-lock.json` (`@payos/node` 2.0.5).
- `BillingModule` là module global, export `SubscriptionsService` (để UC-79 kiểm `hasPaidAccess`), `PaymentsService`, `PAYMENT_GATEWAY`.

## Cách test với PAYMENT_PROVIDER=fake

Cần: DB test đã áp migration, `backend/.env` có `PAYMENT_PROVIDER=fake` (ghi rõ chữ `fake`, để trống thì trang thanh toán giả không bật), `frontend/.env.local` có `NEXT_PUBLIC_PAYMENT_PROVIDER=fake`. Chạy `npm run start:dev` (backend) và `npm run dev` (frontend), đăng nhập bằng tài khoản thử.

1. **Free → STAVE+**: vào `/plans` → card STAVE+ có nút "Nâng cấp lên STAVE+" → hộp xác nhận nêu 49.000 ₫, 1 tháng, điều khoản huỷ → "Tiếp tục thanh toán" → trang `/dev/fake-payment` → bấm "Thành công" → `/billing/result` hiện "Thanh toán thành công" → "Tiếp tục" → `/plans` có "Gói hiện tại" ở STAVE+. Kiểm `/billing`: 1 dòng "Thành công" có link "Biên lai"; chuông thông báo có "Thanh toán thành công".
   - Thử thêm: "Thất bại" trên trang giả → "Thanh toán không thành công"; nâng cấp lại → dòng mới có "Thử lại sau lần thất bại <ngày>". "Huỷ" trên trang giả → `/plans?canceled=1` có "Bạn đã huỷ thanh toán, chưa có gì thay đổi."
2. **Huỷ**: card STAVE+ → "Huỷ gói" → hộp nêu ngày quay về Free, "Không dự án hay dữ liệu nào bị xoá" (nếu đang dùng theme từ ảnh thì có thêm dòng thiết lập về mặc định) → "Huỷ gói" → card hiện "Đã huỷ, hiệu lực đến <ngày>" + nút "Tiếp tục gói"; `/billing` hiện "Đã huỷ gia hạn. Hiệu lực đến <ngày>."
3. **Tiếp tục**: "Tiếp tục gói" → card quay về nút "Huỷ gói", không phát sinh giao dịch mới ở `/billing`.
4. **Hạ cấp về Free**: card Free → "Đổi gói" → hộp "Không thu tiền… chuyển sang Free vào <ngày>" → bấm "Để sau" thì không đổi gì → mở lại → "Đặt lịch chuyển gói" → khung "Sẽ chuyển sang Free vào <ngày>" + nút "Huỷ lịch hạ cấp".
5. **Huỷ lịch**: "Huỷ lịch hạ cấp" → khung biến mất, vẫn dùng STAVE+.
6. **Báo sự cố**: `/billing` → "Báo sự cố" trên một dòng → nhập mô tả → "Gửi sự cố" → nút đổi thành "Đã có sự cố đang xử lý".
7. **Biên lai**: link "Biên lai" → `/billing/receipts/<id>` → "In" mở hộp in của trình duyệt, bản in không có thanh bên và nút.

## Cách bật PayOS thật

1. Railway → Environment Variables: `PAYMENT_PROVIDER=payos`, `PAYOS_CLIENT_ID`, `PAYOS_API_KEY`, `PAYOS_CHECKSUM_KEY` (lấy ở kênh thanh toán trên my.payos.vn), `FRONTEND_URL=<địa chỉ Vercel>`. Thiếu khoá nào thì backend dừng ngay lúc khởi động và báo tên khoá thiếu.
2. Không đặt `PAYMENT_PROVIDER=fake` ở môi trường công khai. Vercel không cần `NEXT_PUBLIC_PAYMENT_PROVIDER` (thiếu thì trang giả trả 404).
3. Trên my.payos.vn đặt URL webhook: `https://<backend Railway>/payments/payos/webhook`. PayOS gửi webhook thử khi lưu URL: backend trả 200 cho mã đơn không tồn tại.
4. Thử bằng một khoản nhỏ: tạm tạo gói giá thấp (hoặc đổi giá STAVE+ trên DB test), thanh toán bằng QR, kiểm `/billing/result` và `/billing`.
5. Chạy local không có địa chỉ công khai cho webhook: trang `/billing/result` tự gọi `sync` ở giây thứ 6, backend hỏi PayOS trạng thái thật và hoàn tất đơn.

## Mô hình gia hạn

PayOS là thanh toán QR / chuyển khoản, không tự trừ tiền định kỳ. Đợt 1 mỗi lần thanh toán cho 1 tháng. Nhắc gia hạn, ân hạn 3 ngày và bộ quét đơn `pending` quá 30 phút làm ở đợt 2 (P7). Hàm SQL đã sẵn cho gia hạn: cùng gói còn hạn thì kỳ mới nối từ ngày hết hạn cũ.

## Đã kiểm

- Backend: `npx eslint src/billing` 0 lỗi; `npm test` 85 suite / 1689 test pass (billing 12 suite / 147 test); `npm run build` pass.
- Frontend: `npx eslint` các file đã đổi 0 lỗi; `tsc --noEmit` pass; `npx vitest run` 33 file / 634 test pass; `npm run build` pass.
- SQL: Postgres 17 tạm trong Docker với schema giả theo cột đặc tả (không đụng DB thật): áp migration 2 lần; webhook 2 lần và 2 phiên đồng thời chỉ kích hoạt 1 lần; kích hoạt lỗi → sự cố; nâng cấp đúng ngày; xoá tài khoản giữ giao dịch.
- Trình duyệt: Playwright với dữ liệu API giả cho từng màn hình (gói, hộp xác nhận, kết quả thanh toán, lịch sử, biên lai, đổi/huỷ gói).
- **Chưa chạy**: luồng thật từ giao diện tới DB (cần DB test đã áp migration), PayOS thật (cần khoá).

## Câu hỏi cho trưởng nhóm

1. Trước khi áp migration: kiểm `pg_policies` của 4 bảng billing (policy cũ rộng hơn phải bỏ vì policy cộng dồn theo OR); kiểm `\d subscription_plans` (nếu đã có `UNIQUE(name)` mang tên `subscription_plans_name_key` thì chỉ mục `lower(name)` bị bỏ qua); xác nhận FK hiện tại của `transactions.user_id` (đặc tả nói chặn xoá, ghi chú §99 nói CASCADE).
2. Có đổi `transactions_subscription_id_fkey` thành `ON DELETE SET NULL` không? Hiện hàm hoàn tất đơn không ghi cột này để không chặn xoá tài khoản.
3. Chốt giá STAVE+ (49.000 ₫ là giá mẫu).
4. Link "Gói dịch vụ" → `/plans` trong menu: tôi không sửa `site-header.tsx` (của Trí). App hiện dùng thanh bên `components/shell/nav-items.ts`, có thể hợp lý hơn ở đó (file không nằm trong danh sách tôi được sửa).
5. Frontend đã có EN/VI (mặc định EN): trang billing viết thẳng tiếng Việt, câu lỗi từ `API_MESSAGES` thì theo ngôn ngữ đang chọn. Cho tôi thêm key vào `lib/i18n/{vi,en}.ts` không?
6. `frontend/.env.example` không nằm trong danh sách được sửa: cho thêm dòng `NEXT_PUBLIC_PAYMENT_PROVIDER=` không?
7. Đổi sang gói cùng giá: tôi coi là hạ cấp (không thu tiền, áp dụng hết kỳ). Đúng ý không?
8. Phần làm dở cũ của Hải trong `stash@{0}`: giữ hay bỏ?
