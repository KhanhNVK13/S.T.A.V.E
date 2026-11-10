# HAI SETUP: thêm tài liệu của Hải vào repo S.T.A.V.E

Hướng dẫn cho Claude: file này gói 4 tài liệu. Hãy đặt chúng vào repo như sau.

1. Kiểm tra đang ở thư mục gốc repo S.T.A.V.E (có package.json với workspaces frontend, backend, shared-types). Nếu không phải, dừng và báo.
2. Nếu ĐÃ tồn tại docs/team/hai.md hoặc docs/team-workload.md thì KHÔNG ghi đè: so sánh nội dung, báo khác biệt và hỏi tôi.
3. Tạo các file, nội dung lấy NGUYÊN VĂN giữa dòng `=====BEGIN FILE: <đường dẫn>=====` và dòng `=====END FILE=====` tương ứng
   (không gồm hai dòng đánh dấu, không sửa một ký tự nào):
   - docs/team/hai.md
   - docs/team-workload.md
   - docs/tasks/hai-prompts.md
   - docs/tasks/hai-master-prompt.md
   Cách làm:
   - Nếu file này đang nằm trên đĩa (vd ./hai-setup.md), tách bằng script (python/node) đọc file và ghi từng khối, KHÔNG gõ lại nội dung.
     Xong thì xoá ./hai-setup.md.
   - Nếu nội dung được dán vào chat, dùng công cụ Write để ghi từng file đúng nguyên văn.
4. Thêm 3 dòng sau vào .git/info/exclude (nếu chưa có) để các tài liệu này không bị commit; KHÔNG sửa .gitignore:
   docs/team/
   docs/team-workload.md
   docs/tasks/
5. Kiểm tra: `ls -R docs`, đếm số dòng mỗi file (`wc -l`), và `git status --short` (không được thấy file nào trong docs/ hay hai-setup.md).
   Báo kết quả bằng tiếng Việt. Không làm gì khác, không commit.

=====BEGIN FILE: docs/team/hai.md=====
# Hải: Thanh toán STAVE+ (đợt 1) và theme từ ảnh, quản trị gói (đợt 2)

Đọc trước [../team-workload.md](../team-workload.md) (lịch, quy ước, phạm vi file được sửa).

| Đợt | UC | Mốc |
|---|---|---|
| 1 (25–28/10) | UC-73 xem gói, UC-74 đăng ký STAVE+, UC-75 đổi gói, UC-76 huỷ gói, UC-77 lịch sử giao dịch | PR migration trước 22:00 CN 25/10; draft PR có code trước 21:00 T3 27/10; Ready trước 23:59 T4 28/10 |
| 2 (29/10–1/11) | Gia hạn và hết hạn tự động, UC-79 theme từ ảnh, UC-104 xem giao dịch (admin), UC-105 tạo gói, UC-106 sửa giá, UC-107 tắt gói, UC-108 xử lý sự cố thanh toán | Draft PR có code trước 21:00 T7 31/10; Ready trước 23:59 CN 1/11 |

Thứ tự đề xuất đợt 1: 25/10 xong migration, dữ liệu gói mẫu, cổng thanh toán giả; 26/10 làm UC-73 và bắt đầu UC-74 (backend); 27/10 xong UC-74 cùng webhook, giao diện, UC-77; 28/10 làm UC-75, UC-76 và rà soát.

## Đọc trước (không quá 90 phút)

1. Report 3, mục 3.2.73–77, 3.2.79, 3.2.104–108; màn hình #35, #36, #42–44 ở mục 3.1.2.
2. Tài liệu chính thức của PayOS (payos.vn/docs): tạo link thanh toán, webhook, xác minh chữ ký, truy vấn trạng thái. **Dùng phiên bản mới nhất của gói `@payos/node`** và làm theo tài liệu của đúng phiên bản đó (tên hàm có thể khác nhau giữa các bản).
3. `frontend/components/settings/theme-picker.tsx`, `frontend/context/theme-context.tsx`, `frontend/app/globals.css` (các khối `[data-theme=...]`).
4. `backend/src/users/` (cách đang lưu và đọc theme), `backend/src/admin/admin.service.ts` (mẫu ghi nhật ký quản trị).

---

## Nguyên tắc để không bị chặn

Khoá PayOS và cách thử có thể chưa sẵn khi bạn bắt đầu. Vì vậy **viết một lớp trừu tượng cổng thanh toán** và một bản giả:

```ts
interface PaymentGateway {
  createCheckout(order: { orderCode: number; amountVnd: number; description: string;
                          returnUrl: string; cancelUrl: string }): Promise<{ checkoutUrl: string; providerRef: string }>;
  verifyWebhook(body: unknown, headers: Record<string, string>): Promise<{ orderCode: number; success: boolean } | null>;
  getPaymentStatus(orderCode: number): Promise<'success' | 'failed' | 'pending'>;
}
```

- `PayosGateway` dùng SDK thật. `FakeGateway` trả `checkoutUrl` dẫn tới trang giả `/dev/fake-payment?orderCode=...` có ba nút "Thành công", "Thất bại", "Huỷ", mỗi nút gọi một endpoint chạy đúng cùng đường hoàn tất như webhook thật.
- Biến môi trường `PAYMENT_PROVIDER=fake|payos` quyết định (mặc định `fake` khi chưa có khoá). Endpoint và trang giả **chỉ tồn tại** khi `PAYMENT_PROVIDER=fake` và `NODE_ENV !== 'production'`.
- Khoá thật nằm trong `backend/.env` (đã bị gitignore): `PAYOS_CLIENT_ID`, `PAYOS_API_KEY`, `PAYOS_CHECKSUM_KEY`, `FRONTEND_URL`. Chỉ thêm **tên biến để trống** vào `backend/.env.example`. Không bao giờ commit giá trị thật.
- Hỏi trưởng nhóm cách thử PayOS thật khi tới lúc: thường chỉ cần chuyển khoản số tiền nhỏ vào kênh thanh toán đã đăng ký. Webhook thật cần địa chỉ công khai (bản Railway). Chạy local thì dùng endpoint đồng bộ (mục UC-74).

---

## Migration `20261025140000_hai_billing.sql`

Bảng hiện có:
- `subscription_plans`: `id`, `name`, `price_vnd`, `features` (jsonb), `is_active`, `created_at`.
- `subscriptions`: `id`, `user_id`, `plan_id`, `status` (`active`/`canceled`), `price_locked_vnd`, `started_at`, `current_period_end`.
- `transactions`: `id`, `user_id`, `subscription_id`, `amount_vnd`, `status` (`success`/`failed`/`pending`), `provider_ref`, `created_at`.
- `payment_issues`: `id`, `transaction_id`, `description`, `status` (`open`/`resolved`), `resolved_by`, `resolved_at`, `created_at`.

Cả bốn bảng hiện **0 dòng**. Cần thêm:

```sql
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
ALTER TABLE public.transactions ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_user_id_fkey,
  ADD CONSTRAINT transactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE public.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_user_id_fkey,
  ADD CONSTRAINT subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
```

Lý do hai thay đổi khoá ngoại: bản ghi giao dịch phải còn sau khi tài khoản bị xoá (UC-104 3.E1), còn gói đăng ký thì xoá theo tài khoản. Hiện cả hai khoá ngoại chặn việc xoá tài khoản; ghi chú vào PR để trưởng nhóm biết.

Gói mẫu (chèn trong cùng migration, dùng `ON CONFLICT DO NOTHING`):
- `Free`: `price_vnd = 0`, `is_default = true`, `features = '{}'`, mô tả "Toàn bộ chức năng quản lý phiên bản, miễn phí không giới hạn."
- `STAVE+`: `price_vnd = 49000` (**giá mẫu, trưởng nhóm sẽ chốt**), `features = '{"theme_from_image": true, "extra_storage": true}'`, mô tả nêu hai điểm cộng: theme từ ảnh và dung lượng lưu trữ tăng thêm.

Danh mục tính năng (hằng số trong code, dùng ở UC-105): `[{ key: 'theme_from_image', label: 'Theme tạo từ ảnh' }, { key: 'extra_storage', label: 'Tăng dung lượng lưu trữ' }]`.

Bật RLS cho bảng mới/đổi. `subscription_plans`: policy cho phép mọi người dùng đăng nhập SELECT các gói `is_active`; `subscriptions`, `transactions`, `payment_issues`: chỉ cho người sở hữu SELECT. Không policy INSERT/UPDATE/DELETE cho client (mọi thay đổi qua backend sau khi xác minh webhook).

---

## Cách xác định gói đang dùng

Hàm `SubscriptionsService.getEffective(userId)`:
- Lấy dòng `subscriptions` của người dùng (mỗi người tối đa một dòng).
- Nếu `current_period_end > now()` (hoặc `grace_until > now()`) thì gói là `plan_id` của dòng đó, **kể cả khi `status = 'canceled'`** (đã huỷ nhưng còn hạn trả tiền đến hết kỳ).
- Ngược lại gói là gói `is_default`.
- Trả `{ plan, status, currentPeriodEnd, cancelAtPeriodEnd, pendingPlan, hasPaidAccess }`.

`hasPaidAccess = plan.is_default === false`. Việc hết hạn do vậy **tự có hiệu lực theo thời gian**, không cần job đổi trạng thái. Endpoint `GET /subscriptions/me` trả kết quả này. Giao diện và các UC khác (UC-79) dùng nó để biết có quyền hay không.

---

# Đợt 1

## UC-73 Xem các gói

**API:** `GET /subscription-plans` (người đăng nhập; chỉ gói `is_active`, hoặc gói người dùng đang dùng nếu đã bị tắt, 2.E2), `GET /subscriptions/me`.

**Giao diện:** trang `/plans` (route mới, `layout.tsx` đặt tiêu đề). Mỗi gói một `Card`: tên, giá định dạng VND (`Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' })`), danh sách điểm cộng, điều khoản huỷ (BR-84: huỷ thì còn hiệu lực đến hết kỳ, không hoàn tiền), nút. Gói đang dùng được đánh dấu. Điểm cần nói rõ: **quản lý phiên bản luôn miễn phí** (BR-83): đây là thông điệp của trang.

**Bắt buộc xử lý:**
- Đến từ một tính năng cần gói trả phí (1.1): trang nhận `?feature=theme_from_image` và làm nổi bật tính năng đó.
- Đã đăng ký (5.1): thay nút "Nâng cấp" bằng "Đổi gói" / "Huỷ gói".
- Không tải được (2.E1): báo lỗi kèm "Thử lại", **không** hiện giá cũ hoặc trống.
- Gói người dùng đang dùng bị admin tắt (2.E2): vẫn hiện như gói của họ đến hết kỳ, không hiện cho người mới.
- Thêm liên kết "Gói dịch vụ" vào menu người dùng ở `site-header.tsx` nếu dễ; nếu không, báo trưởng nhóm.

---

## UC-74 Đăng ký STAVE+

**API:**
- `POST /subscriptions/checkout` body `{ planId, returnTo? }`: trả `{ checkoutUrl, orderCode }`.
- `POST /payments/payos/webhook`: không có guard đăng nhập, **bắt buộc** xác minh chữ ký qua `PaymentGateway.verifyWebhook`; chữ ký sai thì 400; đúng thì xử lý và luôn trả 200 (kể cả khi giao dịch đã xử lý trước đó). Phải **idempotent**: cùng `orderCode` gửi hai lần không được kích hoạt hai lần.
- `GET /payments/orders/:orderCode`: trạng thái giao dịch (chỉ của chính người gọi).
- `POST /payments/orders/:orderCode/sync`: hỏi cổng thanh toán trạng thái thật và hoàn tất giao dịch nếu thành công. Dùng khi webhook không tới (đặc biệt lúc chạy local).

**Quy trình:**
1. Kiểm: người dùng đang ở gói miễn phí (PRE-2), tài khoản `status = 'active'` (PRE-3), gói tồn tại và `is_active`.
2. Sinh `orderCode` (số nguyên duy nhất; `Date.now()` cộng vài chữ số ngẫu nhiên là đủ), chèn `transactions` trạng thái `pending` (ghi `plan_id`, `payer_name`, `payer_email`, `order_code`, `amount_vnd`, `description`).
3. Gọi `createCheckout`. Cổng không phản hồi (4.E3): **xoá** dòng `pending` vừa tạo, trả 502 với thông điệp "Hiện chưa thanh toán được", không đổi gì.
4. Trả `checkoutUrl`; giao diện chuyển trình duyệt tới đó.
5. Khi thanh toán xong (webhook hoặc `sync`): trong cùng một hàm `completeOrder(orderCode, success)`:
   - Thành công: giao dịch `success`; tạo hoặc cập nhật dòng `subscriptions` (`plan_id`, `status = 'active'`, `price_locked_vnd` = giá gói lúc này, `started_at`, `current_period_end = now() + 1 tháng`); thông báo `billing.payment_success`.
   - Thất bại (4.E1): giao dịch `failed`, thông báo `billing.payment_failed`; **không** kích hoạt gì.
6. Nếu thanh toán thành công nhưng kích hoạt lỗi (5.E1): giao dịch vẫn ghi `success`, **tự tạo dòng `payment_issues`** (`description`: "Thanh toán thành công nhưng chưa kích hoạt gói") để admin thấy ở UC-108; trả thông báo cho người dùng rằng sự cố đã được ghi nhận.

**Giao diện:**
- Bấm "Nâng cấp lên STAVE+" → `ConfirmDialog` nêu giá, điều khoản (2) → gọi checkout → chuyển hướng.
- `returnUrl` của cổng thanh toán là `${FRONTEND_URL}/billing/result?orderCode=...`; `cancelUrl` là `${FRONTEND_URL}/plans?canceled=1`.
- Trang `/billing/result` hỏi `GET /payments/orders/:orderCode` mỗi 2 giây tối đa 30 giây (gọi thêm `sync` một lần ở giây thứ 6 nếu vẫn `pending`); hiện thành công, thất bại, hoặc "đang chờ xác nhận" kèm hướng dẫn. **Không tin tham số trên URL** để quyết định thành công; chỉ tin trạng thái từ backend.
- `returnTo` (6.1): đường dẫn tương đối của tính năng đã khiến người dùng tới đây. Phải kiểm: bắt đầu bằng một dấu `/` và **không** bắt đầu bằng `//` hoặc có `://` (chống chuyển hướng ra ngoài). Hợp lệ thì quay lại đó sau khi thành công.

**Bắt buộc xử lý:**
- Người dùng bỏ giữa chừng (4.E2): giao dịch `pending` không kích hoạt gì. Giao dịch `pending` quá 30 phút coi là chưa hoàn tất: hiển thị "Chưa hoàn tất" ở lịch sử và đánh dấu `failed` bởi bộ quét (xem Gia hạn). Gọi checkout lại sau lần thất bại thì ghi `retry_of` bằng giao dịch thất bại gần nhất của cùng gói (để UC-77 liên kết hai bản ghi).
- Mọi số tiền là **số nguyên VND**. Không lưu thẻ hay thông tin thanh toán nào (BR-85).
- Kiểm tra: ở chế độ giả, chạy đủ ba trường hợp (thành công, thất bại, huỷ); gọi webhook hai lần vẫn chỉ một lần kích hoạt.

---

## UC-75 Đổi gói

**API:** `POST /subscriptions/change` body `{ planId }`, `POST /subscriptions/cancel-downgrade`.

**Bắt buộc xử lý:**
- Gói đích phải khác gói hiện tại và đang `is_active` (2.E1: bị tắt trong lúc đang mở trang → 409 "Plan is no longer available"; giao diện báo, không đổi gì).
- **Nâng cấp** (giá gói đích cao hơn): thu tiền **toàn bộ giá gói mới** qua cổng thanh toán (cùng đường checkout của UC-74), thành công thì `plan_id` đổi ngay và `current_period_end` bắt đầu kỳ mới từ lúc thanh toán (BR-88, không tính tiền theo tỷ lệ). Thanh toán bị từ chối (5.E1): giữ gói cũ, ghi giao dịch thất bại. Cổng không phản hồi (5.E2): báo, không đổi gì.
- **Hạ cấp** (giá gói đích thấp hơn, hoặc về gói miễn phí): **không thu tiền**; ghi `pending_plan_id`, áp dụng khi hết kỳ đã trả (BR-88). Trang `/plans` ghi rõ "Sẽ chuyển sang <gói> vào <ngày>".
- Huỷ hạ cấp đã đặt lịch (5.1): xoá `pending_plan_id`.
- Trước khi xác nhận, hiện khi nào có hiệu lực và chi phí (3). Người dùng huỷ hộp xác nhận (4.1): không đổi gì.
- Thông báo `billing.plan_changed`.

---

## UC-76 Huỷ gói

**API:** `POST /subscriptions/cancel`, `POST /subscriptions/resume`.

**Bắt buộc xử lý:**
- `ConfirmDialog` nêu **ngày** tài khoản quay về gói miễn phí, và nói rõ không có dự án hay dữ liệu nào bị xoá (2, 3).
- Nếu tài khoản đang dùng thiết lập chỉ có ở gói trả phí (ví dụ theme tạo từ ảnh), hộp xác nhận nói cái gì sẽ quay về mặc định khi hết kỳ (3.E1, BR-89).
- Đặt `status = 'canceled'`, **giữ nguyên** `current_period_end`; quyền trả phí vẫn còn đến hết kỳ (xem "Cách xác định gói đang dùng"). Không hoàn tiền (BR-84).
- Đăng ký lại trước khi hết kỳ (6.1): `resume` đặt `status = 'active'`, không thu thêm tiền, tiếp tục bình thường.
- Lỗi lưu (5.E1): báo lỗi, gói **vẫn gia hạn** (người dùng có thể thử lại, đừng để họ tưởng đã huỷ).
- Thông báo `billing.canceled`.

---

## UC-77 Lịch sử giao dịch

**API:** `GET /billing/transactions` (của chính người gọi, mới nhất trước) và `GET /billing/transactions/:id/receipt`.

**Giao diện:** trang `/billing` (route mới). Danh sách `RowList`: ngày, mô tả, số tiền VND, kết quả ("Thành công" / "Thất bại" / "Chưa hoàn tất"). Phía trên hiện gói hiện tại và ngày thanh toán kế tiếp nếu đăng ký còn hiệu lực. Liên kết trang `/billing` từ trang `/plans`.

**Bắt buộc xử lý:**
- Chưa từng bị trừ tiền (2.E1): `EmptyState` giải thích bản ghi xuất hiện khi bắt đầu đăng ký. Không tải được (2.E2): lỗi kèm "Thử lại".
- Thất bại rồi thử lại thành công (3.1): hiện cả hai dòng, dòng thành công ghi "Thử lại sau lần thất bại <ngày>" dựa trên `retry_of`.
- Biên lai (bước 5): trang in được `/billing/receipts/[id]` cho giao dịch `success` (mã, ngày, gói, số tiền, nút "In" gọi `window.print()`). Giao dịch chưa có thông tin đủ để lập biên lai (5.E1): vẫn hiện chi tiết, nói biên lai không có.
- Nút "Báo sự cố" (Nên làm) trên một giao dịch: tạo dòng `payment_issues` (`description` do người dùng nhập, tối đa 500 ký tự) để admin xử lý ở UC-108. Chống trùng: mỗi giao dịch tối đa một sự cố đang mở.

---

# Đợt 2

## Gia hạn và hết hạn (làm đầu đợt 2)

PayOS là thanh toán bằng mã QR/chuyển khoản, **không thể tự trừ tiền định kỳ**. Cách làm phù hợp, và ghi rõ trong PR để trưởng nhóm đưa vào báo cáo:

- Một bộ quét (`setInterval` mỗi giờ, trong `OnModuleInit`, không cần thư viện cron) tìm đăng ký `active` sắp hết kỳ:
  - Cách `current_period_end` 3 ngày (và thêm lần nhắc vào đúng ngày hết hạn): gửi `billing.renewal_due` một lần mỗi mốc (dùng `renewal_notified_at` để không gửi lặp). Thông báo dẫn tới `/plans`, nơi có nút "Gia hạn ngay" tạo checkout mới.
  - Thanh toán gia hạn thành công: `current_period_end = max(now, current_period_end) + 1 tháng`.
  - Quá hạn mà chưa trả: đặt `grace_until = current_period_end + 3 ngày`, nhắc mỗi ngày trong thời gian ân hạn (BR-86: thất bại gia hạn không kết thúc ngay), hết ân hạn thì không gia hạn nữa; vì gói được xác định theo thời gian, tài khoản tự quay về gói miễn phí.
- Hạ cấp đã đặt lịch (`pending_plan_id`): khi hết kỳ chuyển `plan_id` sang gói đích (gói miễn phí thì kỳ hết là xong).
- Quét giao dịch `pending` quá 30 phút: đánh dấu `failed`.
- Giá gia hạn: nếu đến ngày gia hạn mà `plan.price_effective_at` đã qua thì dùng `plan.price_vnd` hiện tại, ngược lại dùng `subscription.price_locked_vnd` (UC-106).

---

## UC-79 Tạo theme từ ảnh (STAVE+)

**Làm gì:** trong tab "Cá nhân hoá" của `/profile`, thay hai nút "(PLACEHOLDER)" ở `frontend/components/settings/theme-picker.tsx` (khoảng dòng 117–124) bằng vùng thả ảnh. Ảnh được xử lý **hoàn toàn trên trình duyệt**; chỉ bảng màu kết quả gửi lên server. Ảnh không được tải lên hay lưu (BR-91).

**Cách sinh theme an toàn (đề xuất):**
1. Đọc ảnh vào canvas thu nhỏ (khoảng 64×64), thu thập điểm ảnh, gom thành 5 cụm màu (median cut hoặc k-means, khoảng 50 dòng, **không cần thư viện**).
2. Chọn **sắc độ (hue)** từ cụm có độ bão hoà cao và chiếm nhiều nhất làm `h1`; cụm thứ hai làm `h2`.
3. **Không lấy độ sáng từ ảnh.** Dùng các giá trị độ sáng và độ bão hoà của preset `unleashed` trong `globals.css` và chỉ thay sắc độ `h1` cho nhóm trung tính, `h2` cho `--metal`/`--metal-muted`. Cách này đảm bảo độ tương phản đạt chuẩn ngay từ thiết kế (đúng BR-91: "colour nào gây mất tương phản được điều chỉnh").
4. Vẫn tính tương phản WCAG cho các cặp `foreground/background`, `muted-foreground/background`, `foreground/surface`; cặp nào dưới 4,5:1 thì chỉnh độ sáng tới khi đạt (hàm tiện ích trong `lib/theme-from-image.ts`, có unit test).
5. **Chỉ được tạo các biến trang trí** theo đúng danh sách của các preset: `--background`, `--surface`, `--surface-subtle`, `--surface-muted`, `--foreground`, `--muted-foreground`, `--border`, `--border-strong`, `--metal`, `--metal-muted`. **Không bao giờ đụng** `--accent*`, `--success*`, `--warning*`, `--danger*` (BR-90).

**Bắt buộc xử lý:**
- Gói miễn phí (1.E1): hiện vùng thả ảnh ở trạng thái **vô hiệu hoá** kèm giải thích và liên kết `/plans?feature=theme_from_image`, không ẩn đi.
- Loại tệp: chỉ PNG, JPEG, WebP; tối đa 5 MB (2.E1). Thông báo nói rõ cái được chấp nhận.
- Ảnh gần như một màu, quá ít biến thiên (3.E1): báo "Ảnh này không đủ màu để tạo theme, hãy thử ảnh khác" thay vì tạo bảng màu vô dụng. Tiêu chí: cụm lớn nhất chiếm hơn 85% điểm ảnh hoặc độ chênh sắc độ giữa các cụm dưới ngưỡng bạn chọn.
- Xem trước bằng cách gán biến CSS lên `document.documentElement` tạm thời, có nút "Áp dụng và lưu" và "Quay về preset" (5.1, 6.1 xoá bảng màu vừa tạo, không lưu gì).
- Lưu (6–7): `PUT /themes/me/custom` body `{ palette: { "--background": "oklch(...)", ... } }`. Backend phải: (a) kiểm `hasPaidAccess`, không thì 403; (b) **chỉ nhận đúng 10 tên biến ở trên**; (c) mỗi giá trị khớp mẫu `oklch(<số> <số> <số>)` (chặt chẽ bằng biểu thức chính quy, không chuỗi tuỳ ý, chống chèn CSS); (d) ghi một dòng `themes` (`type = 'custom'`, `generated_palette`) và đặt `users.active_theme_id`. Lỗi lưu (7.E1): giữ theme cũ, báo lỗi.
- BR-89 khi hết gói: `GET /themes/me/effective` trả `{ type, presetKey, palette, hasPaidAccess }`. Nếu `type = 'custom'` mà không còn quyền trả phí thì giao diện áp preset mặc định, **giữ nguyên** `generated_palette` trong DB để khôi phục khi đăng ký lại.

**Phạm vi file được sửa thêm cho UC này:** `frontend/components/settings/theme-picker.tsx` (chỗ PLACEHOLDER) và `frontend/context/theme-context.tsx` (nhánh theme `custom`; đoạn comment hiện ghi "chưa xây dựng" ngay trên chỗ cần sửa). `ThemeProvider` hiện gọi `getMyTheme()` có sẵn trong `api-client.ts`. Tạo hàm gọi `GET /themes/me/effective` ở file API riêng của bạn và đổi `ThemeProvider` sang dùng nó; không sửa `api-client.ts` hay module `users` ở backend.

---

## UC-104 Xem giao dịch (admin)

**API và trang:** `GET /admin/transactions?from=&to=&outcome=&planId=&limit=&cursor=`, trang `/admin/transactions` (`AdminGuard`). Thêm mục menu vào `frontend/components/admin/admin-nav-items.ts` (Vũ tạo file ngày 25/10; chưa có thì tạo bản tạm, kéo `main` sau). Admin thấy: ngày, tài khoản, gói, số tiền VND, kết quả, mã tham chiếu cổng thanh toán (`provider_ref`).

**Bắt buộc xử lý:**
- Tổng của kỳ: tổng tiền thành công, số giao dịch thành công và thất bại (4).
- Lọc theo khoảng ngày, kết quả, gói (5); lọc "thất bại" dẫn tới UC-108 (5.1).
- Xuất file CSV các dòng đang lọc (6): tạo CSV ngay trên trình duyệt. Mở một giao dịch xem toàn bộ (6.1).
- Tài khoản đã xoá (3.E1): hiện "Tài khoản đã xoá" cùng `payer_name`/`payer_email` đã lưu lúc giao dịch.
- Kỳ không có giao dịch (2.E1): nói rõ. Không tải được (2.E2): báo lỗi, không hiện tổng sai.
- **Không bao giờ** hiện hoặc lưu thông tin thẻ/thanh toán (BR-117). Không có thao tác sửa hay xoá giao dịch.

---

## UC-105 Tạo gói dịch vụ

**API và trang:** `POST /admin/plans`, `GET /admin/plans`; trang `/admin/plans`.

**Bắt buộc xử lý:**
- Tên: không rỗng và không trùng gói khác (không phân biệt hoa thường) (4.E1). Giá: số nguyên ≥ 0 (4.E2).
- Chu kỳ thanh toán cố định 1 tháng (BR-86); hiển thị chỉ đọc.
- Chọn tính năng từ danh mục (mục Migration) và dung lượng đi kèm.
- Tuỳ chọn "Lưu nháp" (3.1) tạo gói với `is_active = false`.
- Cấp cho gói mới một tính năng mà gói miễn phí đã có (3.E1): cho phép nhưng ghi chú rằng nó không phân biệt hai gói.
- Tạo gói **không đụng** người đang đăng ký (BR-118). Ghi `admin_audit_log` (`action: 'plan.create'`, `target_type: 'plan'`).

---

## UC-106 Sửa giá gói

**API:** `PATCH /admin/plans/:id/price` body `{ priceVnd, effectiveAt }`.

**Bắt buộc xử lý:**
- Hộp thoại cho thấy giá hiện tại và số người đang đăng ký (2).
- Giá mới là số nguyên ≥ 0 (4.E1). Ngày áp dụng cho kỳ gia hạn phải cách hiện tại ít nhất bằng số ngày báo trước `price_change_notice_days` (mặc định 7, đọc qua `PlatformSettingsService.get('price_change_notice_days', 7)` của Vũ; chưa có thì đọc bảng `platform_settings` trực tiếp) (4.E2); nếu ít hơn thì từ chối và nói rõ tối thiểu.
- Áp dụng giá mới cho **người mua mới ngay** (cập nhật `price_vnd`, ghi `price_effective_at`); người đang đăng ký giữ `price_locked_vnd` đến kỳ gia hạn có ngày ≥ `price_effective_at` (BR-119, **không bao giờ áp dụng ngược**).
- Giảm giá xử lý cùng cách (3.1). Đổi tính năng của gói (5.1) cũng áp dụng từ kỳ gia hạn sau.
- Thông báo `billing.price_change` cho các người đăng ký bị ảnh hưởng. Ghi `admin_audit_log` kèm giá cũ và giá mới trong `reason`.

---

## UC-107 Tắt gói dịch vụ

**API:** `POST /admin/plans/:id/deactivate`, `POST /admin/plans/:id/activate`.

**Bắt buộc xử lý:**
- Không cho tắt gói miễn phí `is_default` (1.E1): không có nút, backend từ chối.
- Hộp xác nhận nêu số người đang dùng và xác nhận họ không bị ảnh hưởng (2); gói không có ai dùng thì xác nhận đơn giản (2.E1).
- Tắt = `is_active = false`: biến mất khỏi trang `/plans` với người mới; người đang đăng ký vẫn giữ nguyên với giá cũ cho tới khi huỷ hoặc đổi gói (BR-120). **Không bao giờ xoá gói** (giao dịch cũ vẫn trỏ tới).
- Bật lại (4.1): gói hiện lại với giá đã lưu. Ghi `admin_audit_log`.

---

## UC-108 Xử lý sự cố thanh toán

**API và trang:** `GET /admin/payment-issues?status=`, `POST /admin/payment-issues/:id/resolve`; trang `/admin/payment-issues`.

Bảng `payment_issues` cần thêm: `remedy text` (`extend`/`refund`/`activate`/`dismiss`), `note text`, `reported_by uuid`. Migration đợt 2 của bạn.

**Bắt buộc xử lý:**
- Xem dòng thời gian giao dịch của tài khoản và đối chiếu mã tham chiếu cổng thanh toán với bản ghi thực của cổng (bước 2): dùng `PaymentGateway.getPaymentStatus`. Cổng không phản hồi (2.E1): **giữ sự cố mở**, không cho áp dụng biện pháp dựa trên thông tin chưa kiểm chứng. Ở chế độ giả bỏ qua bước đối chiếu.
- Các biện pháp: gia hạn đền bù thêm N ngày (`compensation`: dòng giao dịch mới, `amount_vnd = 0`, `kind = 'compensation'`); ghi nhận hoàn tiền (`refund`: dòng giao dịch mới kèm mã hoàn tiền do admin nhập; hoàn tiền thật làm ở trang quản trị của PayOS, STAVE chỉ ghi nhận); kích hoạt trực tiếp gói (3.1, khi thanh toán thành công mà chưa kích hoạt); bỏ qua sự cố trùng kèm tham chiếu sự cố cũ (3.2).
- **Bắt buộc có ghi chú giải thích** (4.E1); không có thì từ chối đóng.
- Mọi hiệu chỉnh là **giao dịch mới**; không sửa giao dịch cũ (BR-121, BR-87).
- Lỗi áp dụng (5.E1): giữ sự cố mở, đừng báo đã xử lý.
- Thông báo `billing.issue_resolved` cho người dùng. Ghi `admin_audit_log`.
- Tài khoản đã xoá (1.E1): vẫn xử lý được dựa trên bản ghi giao dịch.
=====END FILE=====

=====BEGIN FILE: docs/team-workload.md=====
# STAVE: phân công 4 thành viên (25/10 → 1/11/2026)

Đọc file này trước, sau đó đọc file riêng của mình:

| Người | Phần việc | File hướng dẫn |
|---|---|---|
| Đức | Cộng tác (UC-60–65) rồi Community Jam (UC-66–68, 93–95) | [team/duc.md](team/duc.md) |
| Trí | Fork và Thông báo (UC-69, 80, 81), kết nối Google (UC-82, 83), rồi Pull Request (UC-87–92) | [team/tri.md](team/tri.md) |
| Hải | Thanh toán STAVE+ (UC-73–77), rồi theme từ ảnh và quản trị gói (UC-79, 104–108) | [team/hai.md](team/hai.md) |
| Vũ | AI (UC-70–72) và báo cáo vi phạm (UC-101–103), rồi quản trị hệ thống (UC-100, 109–114) | [team/vu.md](team/vu.md) |

Tổng cộng 47 UC mới hoàn toàn. 


## 1. Lịch

| Mốc | Thời điểm | Yêu cầu |
|---|---|---|
| Bắt đầu | Chủ nhật 25/10 | Đọc tài liệu (không quá 2 giờ), tạo nhánh, bắt đầu code |
| **Mốc 0** | CN 25/10, 22:00 | Mở **PR migration** (file `.sql` cho phần đợt 1 của mình) và **PR nền tảng** nếu có (xem mục 6). PR nháp (draft) cũng được. |
| Áp migration | T2 26/10, trước 12:00 | Trưởng nhóm áp migration lên DB. Từ đó chạy được API thật. |
| **Mốc 1** | T3 27/10, 21:00 | Mỗi UC đợt 1 phải có **draft PR chứa code chạy được** (ít nhất luồng chính). |
| **Mốc 2** | T4 28/10, 23:59 | Toàn bộ UC đợt 1 ở trạng thái **Ready for review**, mô tả PR có đủ bước tự test. |
| Bắt đầu đợt 2 | T5 29/10 | Migration đợt 2 mở PR trong ngày 29/10. |
| **Mốc 3** | T7 31/10, 21:00 | Mỗi UC đợt 2 có draft PR chạy được luồng chính. |
| **Hạn cuối** | CN 1/11, 23:59 | Toàn bộ PR **Ready for review**. Lỗi sau review sửa trong ngày. |


## 2. Cách làm một UC

1. Đọc mục 3.2.N trong Report 3 (Trigger → Exceptions) và mục UC trong file riêng của mình.
2. Mở nhánh, viết migration (nếu cần), viết backend, viết giao diện.
3. Đối chiếu từng dòng **Exceptions** trong đặc tả: mỗi dòng phải có xử lý thật (xem file riêng, đã liệt kê sẵn).
4. Tự test theo các bước ghi trong mục "Kiểm tra" của UC. Chụp ảnh màn hình đính kèm PR.
5. Mở PR. Mô tả PR gồm: UC nào, đã làm gì, cách test từng bước, có đổi bảng DB hay API nào dùng chung không.

### Một UC chỉ được coi là xong khi

- [ ] Luồng chính chạy từ giao diện tới DB, không chỉ gọi API bằng công cụ.
- [ ] Mọi dòng Exceptions của UC có xử lý, thông báo bằng tiếng Việt, hiện trong hộp/khu vực lỗi (không im lặng).
- [ ] Quyền truy cập kiểm ở backend (không chỉ ẩn nút ở giao diện).
- [ ] Mọi Business Rule được UC nhắc đến đã được thực thi.
- [ ] Trạng thái đang tải, rỗng, lỗi (có nút "Thử lại") đều có.
- [ ] `npm run build` ở frontend và backend không lỗi, ESLint không lỗi (dùng `npx eslint <file>`, không dùng `npm run lint` ở backend vì lệnh đó tự sửa file).
- [ ] Có unit test (Jest) cho logic dịch vụ chính: luồng chính cộng ít nhất 2 trường hợp lỗi.
- [ ] Không đụng file ngoài phạm vi cho phép (mục 5).

### Dùng AI cho đúng cách

- Đưa cho AI đủ 4 thứ: **mục UC trong Report 3** (dán nguyên văn), **mục UC trong file riêng** của bạn, **file mẫu trong code** (mục 3), và câu "không sửa file ngoài danh sách cho phép".
- Bắt AI liệt kê lại danh sách Exceptions rồi tick từng dòng sau khi viết xong.
- **Không tin kiểu dữ liệu AI tự đoán cho bảng DB.** Mở file migration và danh sách cột ở file riêng của bạn. Lỗi này đã gặp thật ở dự án (code dùng cột không tồn tại mà không ai phát hiện).
- AI hay thêm chức năng ngoài đặc tả. Bất cứ thứ gì không có trong UC của bạn thì xoá.
- Chạy thật trên trình duyệt. Code build qua không có nghĩa là chạy đúng.

Prompt mẫu (thay phần trong ngoặc):

```
Làm UC-[số] cho dự án STAVE. Đây là đặc tả (dán nguyên văn mục 3.2.[số] của Report 3):
[dán]
Đây là hướng dẫn riêng cho UC này (dán mục UC từ file docs/team/[tên].md):
[dán]
Mẫu code cần bám theo: backend/src/custom-sounds (module, controller, service, DTO) và
frontend/components/custom-sound (giao diện). Quy ước bắt buộc nằm ở docs/team-workload.md mục 3.
Chỉ tạo/sửa các file thuộc phạm vi của tôi; không sửa file nào khác. Sau khi xong, liệt kê từng dòng
Exceptions của đặc tả và chỉ ra code xử lý nó ở đâu.
```

---

## 3. Quy ước kỹ thuật bắt buộc

File mẫu để bám theo: `backend/src/custom-sounds/` (cấu trúc module, controller, DTO) và `frontend/components/custom-sound/` (giao diện).

### Backend (NestJS)

- Mọi endpoint cần đăng nhập: `@UseGuards(JwtAuthGuard, SessionAuthGuard)`. Endpoint admin thêm `AdminGuard` sau hai guard đó. ID người dùng lấy từ `req.user.id`, không nhận từ body.
- Truy cập DB qua `@Inject(SUPABASE_ADMIN_CLIENT)` (đã bypass RLS). **Không bao giờ** dùng khoá `service_role` ở frontend.
- Mọi trường trong DTO phải có decorator `class-validator`. Hệ thống dùng `whitelist: true` nên trường không có decorator **bị xoá im lặng**.
- Lỗi trả về dùng exception chuẩn của Nest (`NotFoundException`, `ForbiddenException`...) với câu tiếng Anh ngắn. Frontend dịch sang tiếng Việt (mục dưới).
- Bảng `commits` và `admin_audit_log` chỉ cho INSERT và SELECT. Không thêm migration để sửa hoặc xoá hai bảng này.
- Mỗi lần gọi Supabase có `error` phải kiểm và ném lỗi. Không bỏ qua `error`.
- Thêm module mới thì đăng ký đúng một dòng trong `backend/src/app.module.ts`.
- Test: file `*.spec.ts` cạnh service, bám mẫu `backend/src/branches/branches.service.spec.ts`.
- Cài thư viện mới (Socket.IO, PayOS, Gemini, JSZip...) **chỉ khi file riêng của bạn yêu cầu**. Thư viện khác thì hỏi trưởng nhóm.

### Frontend (Next.js + Tailwind 4)

- Gọi API qua `apiFetch` trong `frontend/lib/api-client.ts` (tự gắn token và `X-Session-Id`). **Mỗi người tạo file API riêng** (ví dụ `lib/api-collab.ts`), import `apiFetch` từ `api-client.ts`; không thêm hàm vào `api-client.ts`.
- Kiểu dữ liệu dùng chung FE/BE đặt trong file riêng `shared-types/src/<module>.ts`, thêm đúng một dòng `export *` vào `shared-types/src/index.ts`.
- Lỗi từ backend: `apiErrorMessage(err, "câu dự phòng theo ngữ cảnh")` trong `lib/error-message.ts`. **Không bao giờ** `setError(err.message)`. Câu tiếng Anh mới của backend thêm vào bảng `API_MESSAGES` trong file đó (thêm ở cuối bảng, chỉ thêm, không sửa dòng cũ).
- Giao diện: chỉ dùng token màu (`bg-surface`, `text-muted`, `border-border`, `bg-accent`...), **không** viết mã hex, **không** dùng `dark:`. Màu `accent` chỉ cho nút chính và trạng thái đang chọn.
- Dùng sẵn component trong `frontend/components/ui/`: `Button`, `Card`, `Badge`, `Avatar`, `Dialog`, `ConfirmDialog`, `EmptyState`, `PageHeader`, `Tabs`, `toast`, `RowList` (danh sách), `form.tsx` (`Field`, `INPUT_CLASS`). Icon chỉ dùng `lucide-react`.
- Chữ tối thiểu 12px. Ô nhập phải có `name` và `autoComplete`. Không dùng thuộc tính `minLength`/`maxLength` để báo lỗi (trình duyệt hiện câu tiếng Anh): kiểm bằng code và hiện câu tiếng Việt. Dấu tải dùng `…` (một ký tự).
- Hộp thoại dùng `Dialog`/`ConfirmDialog`. Lỗi của thao tác trong hộp hiện **trong hộp** (`DialogError`). Chữ người dùng đang gõ giữ ở state của component cha để đóng mở lại không mất.
- Vùng báo lỗi có `role="alert"`. Không để `catch {}` rỗng.
- Mỗi route mới có `layout.tsx` (server component) chỉ để khai `metadata.title`; mẫu: `frontend/app/rankings/layout.tsx`.
- **Không bao giờ** hiển thị mã UC-xx hay BR-xx cho người dùng (trong chữ, `title`, `aria-label`, thông báo lỗi). Mã chỉ nằm trong comment.
- Ngày giờ dùng hàm trong `lib/format-date.ts`. Trang yêu cầu đăng nhập bọc bằng `RequireAuth`.
- Chữ hiển thị là tiếng Việt, không viết hoa tuỳ tiện, câu ngắn và nói rõ phải làm gì tiếp.

### Cơ sở dữ liệu

- Migration là file `.sql` trong `backend/supabase/migrations/`, tên `<yyyymmddHHMMSS>_<ten>_<noi-dung>.sql`, ví dụ `20261025120000_duc_collaborator_status.sql`.
- **Không tự áp migration.** Đưa vào PR migration, trưởng nhóm áp. Viết an toàn khi chạy lại (`IF NOT EXISTS`, `DROP ... IF EXISTS`).
- Bảng mới bắt buộc `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` và có policy phù hợp (backend dùng `service_role` nên không bị chặn, nhưng RLS là lớp phòng thủ thứ hai).
- Thêm khoá ngoại mới giữa hai bảng đã có quan hệ ngược lại có thể làm truy vấn nhúng của PostgREST báo `PGRST201`. Khi thêm FK, tự test lại các truy vấn `select('*, x:bang!inner(...)')` đang có.
- **Không chạy test tự động hoặc thử nghiệm làm rác trên DB production** (`gwbiwweeznbuqfgawywv`). Hỏi trưởng nhóm DB test hoặc đọc `docs/testing/local-stack-guide.md`.

### Git

- Không bao giờ push thẳng `main`. Luôn tạo nhánh từ `main` mới nhất: `git checkout main && git pull origin main && git checkout -b <nhánh>`.
- Tên nhánh: `feature/<mô-tả-kebab-case-3-đến-6-từ>` (ví dụ `feature/collab-invite-flow`). Mỗi nhánh một việc. Không dùng tên chung chung (`feature/update`).
- Commit message tiếng Anh, thì hiện tại: `Add collaborator invitation endpoints`. Không `wip`, `fix`, `update`.
- Trước khi mở PR: `git pull origin main` vào nhánh của mình và tự giải quyết xung đột.
- PR nhỏ (một UC hoặc 2–3 UC liên quan) dễ review và dễ merge hơn một PR khổng lồ. Mở PR sớm ở dạng draft.
- Người tạo PR không tự merge PR của mình. Không `--no-verify`. Không xoá nhánh nào.
- **Không commit khoá, token, mật khẩu thật.** Repo công khai. Giá trị thật chỉ nằm trong `.env` (đã bị gitignore); `.env.example` để trống.
- Không viết comment giải thích dài dòng trong code. Một dòng mô tả UC ở đầu controller là đủ.

---

## 4. Dữ liệu và quyền hiện có

DB hiện có 29 bảng, nhiều bảng đã có sẵn cho phần việc tiếp theo nhưng **chưa có dòng code nào dùng** (ví dụ `project_collaborators`, `comments`, `pull_requests`, `jam_events`, `subscription_plans`, `reports`, `notification_templates`). Nhiều bảng thiếu cột so với đặc tả; file riêng của bạn liệt kê chính xác cột cần thêm. Danh sách đầy đủ: `list_tables` trên dự án Supabase hoặc hỏi trưởng nhóm.

Quy tắc quyền hiện tại: mọi service cũ kiểm `projects.owner_id`. Sẽ thay bằng `ProjectAccessService` (Đức viết) để cộng tác viên dùng được. Đến lúc đó mới test đầy đủ luồng cộng tác viên mở editor. Trong thời gian chờ, test bằng cách đóng vai chủ dự án.

---

## 5. Phạm vi file được sửa

**Được tạo mới:** toàn bộ thư mục module backend của mình, thư mục route/component frontend của mình, file API riêng, file shared-types riêng, migration của mình, spec test của mình.

**Được sửa (mỗi chỗ chỉ thêm, không đổi logic có sẵn), tối đa vài dòng:**

| File | Ai được sửa | Việc |
|---|---|---|
| `backend/src/app.module.ts` | tất cả | thêm một dòng đăng ký module |
| `frontend/lib/error-message.ts` | tất cả | thêm dòng vào cuối bảng `API_MESSAGES` |
| `shared-types/src/index.ts` | tất cả | thêm một dòng `export *` |
| `frontend/components/site-header.tsx` | Trí | chuông thông báo |
| `frontend/components/admin/admin-nav-items.ts` | Đức, Hải, Vũ | thêm mục menu của mình (Vũ tạo file ngày 1) |
| `frontend/app/projects/[id]/page.tsx` | Trí (nút Fork, tab Pull request), Đức (tab Đóng góp), Vũ (nút Báo cáo) | thay chỗ PLACEHOLDER hoặc thêm component của mình. Trang này dùng chung cho chủ dự án và người ngoài; `explore/[id]` chỉ chuyển hướng về đây |
| `frontend/components/midi-editor/redesign/editor-redesign.tsx` | Đức (bình luận, hiện người đang online), Vũ (Insight) | chỉ gắn component mới, không đụng logic hiện có |
| `frontend/components/midi-editor/redesign/commit-dialog.tsx` | Vũ | gắn gợi ý AI |
| `frontend/components/project/branch-list.tsx` | Vũ | gắn cảnh báo rủi ro vào hộp xác nhận merge |
| `frontend/components/settings/theme-picker.tsx`, `frontend/context/theme-context.tsx` | Hải | thay chỗ PLACEHOLDER và nhánh theme tuỳ chỉnh |
| `frontend/app/profile/page.tsx` | Trí | mục "Tài khoản liên kết" trong tab Bảo mật |
| `frontend/app/admin/users/page.tsx` | Vũ | liên kết "Xem hoạt động" ở mỗi dòng người dùng |
| `backend/.env.example` | Hải, Vũ | chỉ thêm **tên** biến để trống |

Ngoài bảng trên, **không sửa file có sẵn nào khác**. Cần sửa thêm thì nhắn nhóm, nêu file và lý do. Hai người cùng sửa một file (editor, `projects/[id]/page.tsx`): kéo `main` về thường xuyên, người merge sau tự xử lý xung đột.

---

## 6. Nền tảng chung (làm sớm để người khác dùng)

Mỗi mục là một PR nhỏ, mở trong ngày 25/10, trưởng nhóm merge ngay. Người khác **không chờ**: viết code gọi hàm theo đúng chữ ký, nếu PR chưa merge thì để dòng gọi hàm làm bước cuối rồi bổ sung sau.

| Nền tảng | Người làm | Chữ ký / nội dung |
|---|---|---|
| `ProjectAccessService` (`backend/src/project-access/`) | Đức | `getAccess(projectId, userId)` trả `'owner' \| 'edit' \| 'view' \| null`; `assertCanView(projectId, userId)`; `assertCanEdit(projectId, userId)`; `assertOwner(projectId, userId)`. Cộng tác viên đang `pending` **không** có quyền. |
| `NotificationsService.notify` (`backend/src/notifications/`) | Trí | `notify(userId: string, type: string, payload: Record<string, unknown>): Promise<void>`. Bản đầu chỉ ghi bảng `notifications`; Trí bổ sung tuỳ chọn (UC-81) và mẫu (UC-110/111) sau. |
| Khung trang quản trị + `PlatformSettingsService.get(key, fallback)` | Vũ | `frontend/app/admin/layout.tsx` kèm menu (danh sách mục ở `admin-nav-items.ts`); `backend/src/platform-settings/` đọc bảng `platform_settings`, cache 30 giây. |
| `MergeService.previewMerge` | Trưởng nhóm | Hàm thuần `(baseSnapshot, sourceSnapshot, targetSnapshot) → { conflictsCount, conflictsByBar }` không ghi DB. Vũ (UC-71) và Trí (UC-89) cần. Tới khi có, tự đếm xung đột bằng `DiffService` như file riêng hướng dẫn. |
| Bản nháp theo từng người, quyền cộng tác viên trong service cũ | Trưởng nhóm | Đức không cần chờ, nhưng chỉ test được đầy đủ sau bước này. |

### Quy ước loại thông báo (`type`)

Dùng đúng các chuỗi sau để không lệch nhau. Loại bắt đầu bằng `security.` và `billing.` **không tắt được** (quy tắc BR-93).

`collab.invite`, `collab.invite_accepted`, `collab.invite_declined`, `collab.permission_changed`, `collab.access_removed`, `comment.new`, `comment.reply`, `fork.created`, `pr.opened`, `pr.comment`, `pr.merged`, `pr.closed`, `jam.started`, `jam.ended`, `jam.end_extended`, `jam.cancelled`, `billing.payment_success`, `billing.payment_failed`, `billing.plan_changed`, `billing.canceled`, `billing.renewal_due`, `billing.price_change`, `billing.issue_resolved`, `security.google_connected`, `security.google_disconnected`, `moderation.project_removed`, `moderation.project_restored`, `report.reviewed`.

`payload` luôn có `projectId` (hoặc `pullRequestId`, `eventId`, `invitationId`) để mở đúng trang khi bấm vào thông báo, cộng các trường chữ để hiển thị. **Tên các trường bắt buộc cho từng loại** nằm trong bảng ở [team/tri.md](team/tri.md) (mục `notification-types.ts`). Gọi `notify` thiếu một trường trong bảng thì thông báo sẽ hiện chỗ trống, nên điền đủ.

### Ghi nhật ký quản trị

Mọi hành động quản trị (UC-93–95, 102, 103, 105–108, 109, 110, 111) ghi một dòng vào bảng `admin_audit_log` (`admin_id`, `action`, `target_type`, `target_id`, `reason`). Mỗi người tự viết một hàm riêng 8 dòng ghi dòng này, mẫu là `AdminService.writeAuditLog` trong `backend/src/admin/admin.service.ts`. Bảng này không sửa và không xoá được.

---

## 7. Phụ thuộc chéo giữa bốn người

| Việc | Cần | Nếu chưa có |
|---|---|---|
| Đức: Jam, kết quả cho phép fork | Trí (UC-69) chấp nhận dự án kết quả Jam | Đức làm xong Jam trước, nút Fork nối sau cùng |
| Trí: duyệt PR | Quyền "edit" từ Đức (UC-61) | Tạm: chỉ chủ dự án được duyệt |
| Trí: PR hiển thị rủi ro merge | Vũ (UC-71) | Tạm bỏ qua, gắn sau cùng |
| Đức, Hải, Vũ: gửi thông báo | Trí (`notify`) | Gọi ở bước cuối mỗi UC |
| Vũ: UC-110/111 dùng thông báo, UC-112–114 đọc dữ liệu | Trí, Hải, Đức | Đọc thẳng bảng DB |
| Hải: nút nâng cấp, UC-79 | Hải tự đủ | không phụ thuộc |

---

## 8. Chuẩn bị trước khi bắt đầu (trưởng nhóm lo)

| Việc | Cho ai |
|---|---|
| Khoá và quy trình test của PayOS | Hải |
| `GEMINI_API_KEY` (đặt ở `backend/.env`, không commit) | Vũ |
| Bật manual linking trong Supabase Auth | Trí |
| Gửi thư: Supabase mặc định giới hạn tần suất; đợt 1 chỉ hiển thị thông báo trong ứng dụng, chưa cần gửi thư | tất cả |
| DB test hoặc stack local (Docker) để thử nghiệm | tất cả |

---

## 9. Backlog nhận thêm (khi xong sớm)

- UC-117: xoá bản ghi âm (audio sketch). Bảng đã có policy DELETE, thiếu endpoint, nút, và dọn file Storage.
- UC-119: xuất dự án thành file `.zip` (MIDI, WAV, custom sound).
- Viết test E2E Playwright cho UC của mình, đặt tên test bắt đầu bằng mã UC (xem `frontend/e2e/` làm mẫu).

=====END FILE=====

=====BEGIN FILE: docs/tasks/hai-prompts.md=====
# Prompt từng phần cho Claude: nhiệm vụ của Hải (khớp repo S.T.A.V.E)

## Cách dùng

1. Tài liệu nằm trong repo (không commit, đã thêm vào `.git/info/exclude`):
   `docs/team/hai.md` (đặc tả), `docs/team-workload.md` (quy ước nhóm), `docs/tasks/hai-prompts.md` (file này).
2. Mỗi phần dùng một phiên Claude: dán Prompt 0, rồi dán đúng một prompt của phần đó. Hoặc dùng `docs/tasks/hai-master-prompt.md` để chạy tự động.
3. Thứ tự: P1 → P6 (đợt 1), P7 → P11 (đợt 2), P12 rà soát.

| Phần | Nội dung | Nhánh (tạo từ nhánh của phần trước, trừ P1 tạo từ main) |
|---|---|---|
| P1 | Migration đợt 1 + gói mẫu | feature/billing-migration-batch-one |
| P2 | Cổng thanh toán, cổng giả, `getEffective`, `GET /subscriptions/me` | feature/stave-plus-plans-and-checkout |
| P3 | UC-73 `/plans` | (cùng nhánh P2) |
| P4 | UC-74 checkout, webhook, sync, `/billing/result` | (cùng nhánh P2) |
| P5 | UC-77 lịch sử giao dịch | feature/stave-plus-history-change-cancel |
| P6 | UC-75 đổi gói + UC-76 huỷ gói | (cùng nhánh P5) |
| P7 | Gia hạn, ân hạn, bộ quét + migration đợt 2 | feature/billing-renewal-grace-sweeper |
| P8 | UC-79 theme từ ảnh | feature/theme-from-image-palette |
| P9 | UC-104 giao dịch (admin) | feature/admin-billing-transactions-view |
| P10 | UC-105/106/107 quản trị gói | feature/admin-subscription-plan-management |
| P11 | UC-108 sự cố thanh toán | feature/admin-payment-issue-resolution |
| P12 | Rà soát + mô tả PR | — |

---

## Prompt 0: Bối cảnh chung (dán đầu MỖI phiên)

```
Bạn làm việc trong repo S.T.A.V.E (monorepo npm workspaces: backend NestJS 11 + Supabase JS, frontend Next.js 16 + React + Tailwind 4,
shared-types). Tôi là Hải. Phần việc: thanh toán STAVE+ qua PayOS, theme tạo từ ảnh, quản trị gói/giao dịch/sự cố.

NGUỒN CHUẨN (đọc hết trước khi làm):
- docs/team/hai.md: đặc tả của tôi. Mã UC/BR/bước (vd "UC-74 4.E3") tham chiếu file này. Kế hoạch và hai.md lệch nhau → hai.md thắng.
- docs/team-workload.md: quy ước BẮT BUỘC (mục 2 "UC chỉ coi là xong khi", mục 3 quy ước kỹ thuật, mục 5 phạm vi file, mục 6 thông báo và audit log).
  Mọi quy tắc ở đó áp dụng, kể cả khi prompt này không nhắc lại.
- Report 3 không có trong repo: chỉ dựa vào hai.md.

SỰ THẬT VỀ REPO (đã khảo sát):
- Mẫu bám theo: backend/src/custom-sounds (module/controller/service/DTO), test bám backend/src/branches/branches.service.spec.ts,
  giao diện bám frontend/components/custom-sound, layout route bám frontend/app/rankings/layout.tsx (chỉ khai metadata.title).
- Migration: backend/supabase/migrations/<yyyymmddHHMMSS>_hai_<noi-dung>.sql, chạy lại an toàn. Schema gốc KHÔNG nằm trong thư mục migration;
  cột thật của 4 bảng billing liệt kê ở hai.md mục Migration. Không đoán cột. KHÔNG tự áp migration, KHÔNG đụng DB production
  (gwbiwweeznbuqfgawywv); chỉ viết file SQL và tự rà.
- Backend: @Inject(SUPABASE_ADMIN_CLIENT) (backend/src/supabase/supabase.constants); guard @UseGuards(JwtAuthGuard, SessionAuthGuard)
  (+ AdminGuard cho admin) từ backend/src/common/guards; userId lấy từ req.user.id (AuthenticatedRequest), không nhận từ body;
  UserThrottlerGuard để chặn spam. Mọi trường DTO có decorator class-validator (whitelist xoá im lặng trường thiếu decorator).
  Mọi lời gọi Supabase phải kiểm `error` và ném lỗi. Lỗi dùng exception chuẩn Nest với CÂU TIẾNG ANH NGẮN; câu mới thì thêm bản dịch
  tiếng Việt vào CUỐI bảng API_MESSAGES trong frontend/lib/error-message.ts (chỉ thêm).
  Module mới đăng ký đúng một dòng trong backend/src/app.module.ts.
- Thông báo: NotificationsService.notify(userId, type, payload). Các loại billing.* đã có trong
  backend/src/notifications/notification-types.ts với tham số bắt buộc:
    billing.payment_success / payment_failed: { planName, amount }   billing.plan_changed: { planName, effectiveDate }
    billing.canceled: { planName, endDate }   billing.renewal_due: { planName, dueDate }
    billing.price_change: { planName, newPrice, effectiveDate }   billing.issue_resolved: { summary }
  Điền đủ (amount/newPrice đã định dạng VND, ngày định dạng vi-VN). Không thêm loại mới.
- Audit: bảng admin_audit_log (admin_id, action, target_type, target_id, reason), chỉ INSERT. Tự viết hàm riêng ~8 dòng theo mẫu
  writeAuditLog trong backend/src/admin/admin.service.ts (không sửa file đó).
- PlatformSettingsService.get(key, fallback) ở backend/src/platform-settings. Bộ quét định kỳ: mẫu setInterval trong
  onModuleInit ở backend/src/jam/jam.service.ts.
- backend/.env.example đã có PAYOS_CLIENT_ID, PAYOS_API_KEY, PAYOS_CHECKSUM_KEY; chỉ được thêm TÊN biến để trống.
- Frontend: đọc frontend/AGENTS.md (Next.js bản mới có thay đổi phá vỡ; đọc node_modules/next/dist/docs trước khi viết route).
  API: import apiFetch từ frontend/lib/api-client.ts, hàm của tôi ở file mới frontend/lib/api-billing.ts. Lỗi:
  apiErrorMessage(err, "câu dự phòng"), không bao giờ setError(err.message). Ngày: frontend/lib/format-date.ts.
  Chống chuyển hướng ngoài: safeRedirectPath (frontend/lib/safe-redirect.ts). Hook tải: frontend/lib/use-api-resource.ts.
  Component: Button, Card, Badge, Dialog (+DialogError), ConfirmDialog, EmptyState, PageHeader, Tabs, toast, RowList, form.tsx (Field, INPUT_CLASS).
  Icon chỉ lucide-react. Chỉ dùng token màu (bg-surface, text-muted...), không mã hex, không `dark:`; accent chỉ cho nút chính.
  Chữ ≥ 12px; ô nhập có name + autoComplete; không dùng thuộc tính minLength/maxLength (kiểm bằng code, báo tiếng Việt);
  dấu tải dùng "…"; vùng lỗi role="alert"; không catch {} rỗng; lỗi thao tác trong hộp thoại hiện trong hộp (DialogError);
  trang cần đăng nhập bọc RequireAuth; mỗi route mới có layout.tsx chỉ khai metadata.title.
  KHÔNG BAO GIỜ hiện mã UC-xx/BR-xx cho người dùng (chữ, title, aria-label, lỗi); mã chỉ nằm trong comment.
  Menu admin: thêm mục vào ADMIN_NAV_ITEMS (frontend/components/admin/admin-nav-items.ts).
- Kiểu dùng chung: shared-types/src/billing.ts + đúng một dòng `export *` trong shared-types/src/index.ts.

PHẠM VI FILE (team-workload.md mục 5): được tạo mới module/route/component/file API/shared-types/migration/spec của tôi.
Được sửa (chỉ thêm vài dòng): backend/src/app.module.ts, frontend/lib/error-message.ts (cuối API_MESSAGES), shared-types/src/index.ts,
frontend/components/admin/admin-nav-items.ts, frontend/components/settings/theme-picker.tsx và frontend/context/theme-context.tsx
(chỉ chỗ PLACEHOLDER và nhánh custom), backend/.env.example. KHÔNG sửa file nào khác, kể cả site-header.tsx (của Trí),
api-client.ts, backend/src/users/**, admin.service.ts. Cần sửa thêm thì ghi vào "câu hỏi cho trưởng nhóm", không sửa.

QUY TẮC:
1. Tiền là số nguyên VND. Không lưu/log thông tin thẻ hay tài khoản ngân hàng (BR-85, BR-117).
2. Không sửa giao dịch cũ để hiệu chỉnh; hiệu chỉnh = giao dịch mới (BR-87, BR-121). Chỉ được chuyển pending → success/failed.
3. Không thêm chức năng ngoài đặc tả. Không viết comment dài; một dòng mô tả UC ở đầu controller là đủ.
4. Unit test Jest cho mỗi service chính: luồng chính + ít nhất 2 trường hợp lỗi. Logic thuần (ngày, giá, validate, màu, CSV) có test riêng.
   Frontend logic thuần test bằng vitest.
5. Kiểm tra cuối phần: backend `npx eslint <các file đã đổi>` (KHÔNG dùng `npm run lint` ở backend vì nó tự sửa file), `npm test`,
   `npm run build`; frontend `npx eslint <các file đã đổi>`, `npx vitest run`, `npm run build`. Báo kết quả THẬT.
6. Cuối mỗi UC: liệt kê từng dòng Exceptions/"Bắt buộc xử lý" của UC trong hai.md và chỉ ra file:dòng xử lý nó.
7. Git: nhánh theo bảng trong docs/tasks/hai-prompts.md (feature/<3–6 từ kebab-case>). Commit message tiếng Anh, thì hiện tại
   (vd "Add billing migration and seed plans"), không "wip"/"fix"/"update", không --no-verify. KHÔNG push, KHÔNG tạo PR, không xoá nhánh.
8. Trả lời bằng tiếng Việt. Chỉ làm đúng phần được giao.

Bây giờ chỉ xác nhận đã đọc hai tài liệu và tóm tắt phạm vi file được sửa, rồi chờ prompt phần việc.
```

---

## P1: Migration đợt 1 + gói mẫu

```
PHẦN P1: migration đợt 1. Đọc mục "Migration 20261025140000_hai_billing.sql" trong docs/team/hai.md.

Tạo backend/supabase/migrations/20261025140000_hai_billing.sql. Comment đầu file viết tiếng Việt như các migration khác.
1. Chép nguyên các khối ALTER trong đặc tả cho subscription_plans, subscriptions, transactions và hai khoá ngoại.
   - Trước khi viết, tìm tên constraint FK thật của transactions.user_id và subscriptions.user_id (xem
     20261026000003_account_deletion_foreign_keys.sql và grep toàn repo). Nếu migration đó đã đổi FK một trong hai bảng
     thì nói cho tôi biết và chỉ giữ phần còn thiếu.
   - Thêm: partial unique index payment_issues (transaction_id) WHERE status = 'open' (UC-77: mỗi giao dịch tối đa 1 sự cố mở).
2. Gói mẫu: INSERT ... ON CONFLICT DO NOTHING (dựa trên unique index lower(name)):
   - Free: price_vnd 0, is_default true, is_active true, sort_order 0, features '{}',
     description 'Toàn bộ chức năng quản lý phiên bản, miễn phí không giới hạn.'
   - STAVE+: price_vnd 49000 (comment "-- giá mẫu, trưởng nhóm chốt"), is_active true, sort_order 1,
     features '{"theme_from_image": true, "extra_storage": true}', mô tả nêu theme từ ảnh và tăng dung lượng lưu trữ.
   Lưu ý: ON CONFLICT trên expression index phải viết ON CONFLICT DO NOTHING (không target), kiểm cú pháp cẩn thận.
3. RLS: ENABLE cho subscription_plans, subscriptions, transactions, payment_issues. DROP POLICY IF EXISTS rồi CREATE:
   - subscription_plans: authenticated SELECT USING (is_active).
   - subscriptions, transactions: authenticated SELECT USING (user_id = auth.uid()).
   - payment_issues: SELECT khi EXISTS (transactions t WHERE t.id = transaction_id AND t.user_id = auth.uid()).
   - Không tạo policy INSERT/UPDATE/DELETE.
   Kiểm xem repo có quy ước users.id = auth.uid() không (grep "auth.uid()" trong migrations). Nếu khác, theo quy ước repo.
4. Hàm Postgres cho UC-74 (để P4 dùng, có thể tạo ngay): `public.billing_complete_order(p_order_code bigint, p_success boolean)`.
   Trong MỘT transaction: UPDATE transactions SET status = ... WHERE order_code = p_order_code AND status = 'pending' RETURNING;
   không có dòng → trả {processed:false}. success → upsert subscriptions (unique user_id): plan_id, status 'active',
   price_locked_vnd = amount_vnd của giao dịch, started_at now(), current_period_end now() + interval '1 month',
   pending_plan_id NULL, grace_until NULL, renewal_notified_at NULL. Trả jsonb {processed, status, user_id, plan_id, transaction_id}.
   SECURITY DEFINER, SET search_path = public, REVOKE EXECUTE khỏi anon và authenticated (chỉ service role gọi).
   (P4 sẽ mở rộng nhánh nâng cấp/gia hạn. Nếu muốn hoãn hàm này sang P4 thì nói rõ.)
5. Danh mục tính năng: thêm vào shared-types/src/billing.ts và export ở index.ts:
   PLAN_FEATURES = [{ key: 'theme_from_image', label: 'Theme tạo từ ảnh' }, { key: 'extra_storage', label: 'Tăng dung lượng lưu trữ' }] as const,
   cùng type PlanFeatureKey.

Viết thêm docs/tasks/hai-pr-migration.md (KHÔNG commit, để tôi dán vào PR): tóm tắt thay đổi, lý do đổi hai FK
(giao dịch còn sau khi xoá tài khoản theo UC-104 3.E1; gói đăng ký xoá theo tài khoản; hiện cả hai FK chặn xoá tài khoản),
giá 49.000đ là giá mẫu, cách chạy lại an toàn.

Tiêu chí hoàn thành: đọc lại file SQL từ đầu tới cuối, tự kiểm idempotent (chạy 2 lần không lỗi); không đụng file nào khác
ngoài migration, shared-types và file ghi chú. Commit: "Add billing migration and seed plans".
```

---

## P2: Cổng thanh toán, cổng giả, gói đang dùng

```
PHẦN P2: nền backend + trang giả. Đọc các mục "Nguyên tắc để không bị chặn" và "Cách xác định gói đang dùng" trong docs/team/hai.md.

Backend: tạo module backend/src/billing (BillingModule, đăng ký trong app.module.ts, đây là thay đổi duy nhất ở file đó).
1. payment-gateway.ts: interface PaymentGateway đúng như đặc tả + token PAYMENT_GATEWAY.
2. PayosGateway: `npm i @payos/node@latest --workspace=backend`. ĐỌC typings và README trong
   node_modules/@payos/node của bản vừa cài để lấy đúng tên hàm (các bản khác nhau đặt tên khác nhau), không đoán.
   - createCheckout: ràng buộc PayOS là description ngắn (≤ 25 ký tự, nên không dấu, vd "STAVE <orderCode>")
     và orderCode là số nguyên dương nằm trong giới hạn của PayOS. Đặt timeout khoảng 10 giây.
   - verifyWebhook: chữ ký sai trả null (không throw); trả { orderCode, success } với success khi mã trạng thái là thanh toán thành công.
   - getPaymentStatus: PAID → 'success'; CANCELLED/EXPIRED → 'failed'; còn lại → 'pending'. Lỗi mạng thì throw (để bên gọi phân biệt "không phản hồi").
3. FakeGateway: checkoutUrl = `${FRONTEND_URL}/dev/fake-payment?orderCode=<n>`, providerRef = `fake-<n>`.
   getPaymentStatus đọc trạng thái hiện tại của giao dịch trong DB.
4. Provider factory theo PAYMENT_PROVIDER: thiếu biến hoặc thiếu khoá PayOS → 'fake'. 'payos' mà thiếu khoá → lỗi khởi động rõ ràng.
   Cảnh báo (log warn) khi chạy fake.
5. DevFakePaymentController: POST /dev/fake-payment/:orderCode/:result (success|fail|cancel) và GET /dev/fake-payment/:orderCode
   (trả số tiền và tên gói để trang giả hiển thị). Cần đăng nhập, và chỉ chủ đơn được gọi.
   CHỈ ĐĂNG KÝ controller khi PAYMENT_PROVIDER là fake VÀ NODE_ENV khác 'production'
   (đăng ký có điều kiện trong mảng controllers của module, không chặn trong handler). Cả ba kết quả gọi
   PaymentsService.completeOrder (P2 tạo khung: gọi RPC billing_complete_order; P4 bổ sung thông báo, sự cố...).
   cancel = completeOrder(orderCode, false).
6. backend/.env.example: thêm PAYMENT_PROVIDER= và FRONTEND_URL= (để trống, có comment ngắn).
   Kiểm tra FRONTEND_URL đã được đọc ở chỗ khác chưa (grep), nếu có thì dùng chung tên.
7. SubscriptionsService.getEffective(userId):
   - Hàm thuần resolveEffectivePlan(subRow | null, plansById, defaultPlan, now) → { plan, status, currentPeriodEnd,
     cancelAtPeriodEnd, pendingPlan, hasPaidAccess, inGrace }. Còn hiệu lực khi current_period_end > now hoặc grace_until > now,
     KỂ CẢ status 'canceled'. Ngược lại dùng gói is_default.
     cancelAtPeriodEnd = status 'canceled' và còn hiệu lực. hasPaidAccess = !plan.is_default.
   - Unit test đủ các ca: chưa có dòng, còn hạn, hết hạn, canceled còn hạn, canceled hết hạn, trong ân hạn, hết ân hạn,
     gói đã bị tắt nhưng còn hạn (vẫn là gói đó).
   - Export SubscriptionsService để UC-79 dùng.
8. GET /subscriptions/me (JwtAuthGuard + SessionAuthGuard) trả kết quả trên (camelCase; giá dạng priceVnd).
   Kiểu response đặt trong shared-types/src/billing.ts.

Frontend:
9. frontend/lib/api-billing.ts: getMySubscription() và các hàm cho trang giả.
10. Trang /dev/fake-payment (đọc docs Next trong node_modules trước): bọc RequireAuth; hiện orderCode, gói, số tiền;
    ba nút Thành công / Thất bại / Huỷ. Thành công và Thất bại gọi API rồi chuyển tới /billing/result?orderCode=...;
    Huỷ gọi API cancel rồi chuyển tới /plans?canceled=1.
    Gọi notFound() khi process.env.NODE_ENV === 'production' hoặc NEXT_PUBLIC_PAYMENT_PROVIDER khác 'fake'
    (thêm biến này vào frontend .env.example nếu có file đó).

Tiêu chí hoàn thành: unit test resolveEffectivePlan pass; có test (hoặc kiểm bằng code) rằng controller /dev không được đăng ký
khi NODE_ENV=production; lint + test pass. Commit: "Add payment gateway abstraction, fake gateway and effective plan endpoint".
```

---

## P3: UC-73 Xem các gói

```
PHẦN P3: UC-73. Đọc mục UC-73 trong docs/team/hai.md.

Backend (trong BillingModule):
- GET /subscription-plans (đăng nhập): các gói is_active theo sort_order, CỘNG THÊM gói hiệu lực của người gọi nếu gói đó
  đã bị tắt (2.E2). Trả { id, name, description, priceVnd, features, isDefault, isActive, isCurrent }.
  Unit test cho phần ghép danh sách.

Frontend:
- Route /plans (đọc docs Next trước khi tạo layout/page; layout đặt tiêu đề "Gói dịch vụ"). Bọc RequireAuth.
- Dùng useApiResource tải song song /subscription-plans và /subscriptions/me.
- Đầu trang (PageHeader): thông điệp chính "Quản lý phiên bản luôn miễn phí" (BR-83).
- Mỗi gói một Card: tên, giá qua Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }) (viết formatVnd trong
  frontend/lib/format-vnd.ts, có test), mô tả, điểm cộng (map key sang label từ PLAN_FEATURES của @stave/shared-types),
  điều khoản huỷ (BR-84: huỷ vẫn dùng đến hết kỳ, không hoàn tiền), chu kỳ "1 tháng".
- Đánh dấu "Gói hiện tại" bằng Badge. Gói đã bị tắt mà người dùng còn dùng: thêm ghi chú "Gói này không còn mở bán, bạn vẫn dùng đến <ngày>".
- ?feature=theme_from_image (1.1): làm nổi bật tính năng đó trong card của gói có nó (viền hoặc badge) và cuộn tới card.
- Người dùng đang có gói trả phí (5.1): thay nút "Nâng cấp" bằng "Đổi gói" và "Huỷ gói". Ở phần này nút chỉ cần render;
  handler để TODO rõ ràng, nối ở P6.
- Gói miễn phí: nút "Nâng cấp lên <tên>" trên gói trả phí, handler nối ở P4.
- Lỗi tải (2.E1): khung lỗi + nút "Thử lại", KHÔNG hiện giá cũ hay danh sách rỗng. Đang tải: skeleton.
- ?canceled=1: toast hoặc thông báo "Bạn đã huỷ thanh toán, chưa có gì thay đổi."
- Liên kết "Lịch sử giao dịch" tới /billing.
- KHÔNG sửa frontend/components/site-header.tsx (chỉ Trí được sửa). Ghi vào câu hỏi cho trưởng nhóm: cần thêm link "Gói dịch vụ" → /plans vào menu người dùng.

Tiêu chí hoàn thành: test formatVnd và test ghép danh sách gói pass; tsc + lint pass. Mô tả cách tôi tự xem 4 trạng thái
(free, đã đăng ký, gói đã tắt còn hạn, API lỗi). Commit: "Add plans page".
```

---

## P4: UC-74 Đăng ký STAVE+ (phần quan trọng nhất)

```
PHẦN P4: UC-74. Đọc kỹ mục UC-74 trong docs/team/hai.md.

Backend:
1. PaymentsService.createCheckout(userId, planId, purpose, returnTo?), dùng chung cho UC-74 (purpose 'subscribe'),
   UC-75 ('upgrade') và gia hạn ('renew'). Ở phần này chỉ mở endpoint cho 'subscribe', nhưng KHÔNG khoá cứng logic.
   POST /subscriptions/checkout { planId, returnTo? } → { checkoutUrl, orderCode }. Thêm UserThrottlerGuard.
   Kiểm tra theo thứ tự:
   - Tài khoản status 'active' (PRE-3): đọc bảng users bằng query riêng, KHÔNG gọi hay sửa UsersService. Sai → 403.
   - Gói tồn tại và is_active: sai → 404 hoặc 409.
   - Người dùng đang ở gói miễn phí theo getEffective (PRE-2): sai → 409, gợi ý dùng "Đổi gói".
   - Giá gói > 0.
   Sinh orderCode: Date.now() * 100 + số ngẫu nhiên 0–99, phải ≤ Number.MAX_SAFE_INTEGER. Gặp lỗi trùng unique thì thử lại tối đa 3 lần.
   INSERT transactions: status 'pending', kind 'charge', user_id, plan_id, order_code, amount_vnd, description,
   payer_name và payer_email (chụp lại lúc này từ users), retry_of = id giao dịch failed gần nhất của cùng user và cùng plan
   (nếu có và chưa được giao dịch nào khác retry).
   Gọi gateway.createCheckout với:
   - returnUrl `${FRONTEND_URL}/billing/result?orderCode=<n>`, kèm &returnTo=<encode> nếu returnTo hợp lệ
     (kiểm phía backend bằng hàm isSafeReturnTo tự viết, logic giống frontend/lib/safe-redirect.ts và chặn thêm "://";
     unit test các ca //evil.com, /\evil.com, https://x, javascript:alert(1), /plans, /profile?tab=x);
   - cancelUrl `${FRONTEND_URL}/plans?canceled=1`.
   Cổng lỗi hoặc timeout (4.E3): DELETE đúng dòng pending vừa tạo, trả 502 (BadGatewayException 'Payment provider unavailable'; thêm bản dịch 'Hiện chưa thanh toán được, vui lòng thử lại sau.' vào cuối API_MESSAGES).
   Thành công: UPDATE provider_ref.
2. PaymentsService.completeOrder(orderCode, success): hàm DUY NHẤT hoàn tất đơn, dùng cho webhook, sync và cổng giả.
   - Gọi RPC billing_complete_order (P1). processed false nghĩa là đã xử lý trước đó: không làm gì, trả OK (idempotent).
     Nếu cần bổ sung hàm SQL (vd nhánh upgrade/renew) thì sửa trong migration P1 nếu chưa merge, ngược lại tạo migration mới
     và nói cho tôi biết.
   - Không tìm thấy đơn (vd webhook thử của PayOS khi đăng ký URL): log info và trả OK.
   - Thành công: notify billing.payment_success { planName, amount }.
   - Thất bại (4.E1): notify billing.payment_failed. Không kích hoạt gì.
   - Thanh toán thành công nhưng kích hoạt lỗi (5.E1): giao dịch phải vẫn là success. Vì vậy tách hai bước: (a) chuyển
     giao dịch sang success một cách nguyên tử, (b) kích hoạt; nếu (b) lỗi thì INSERT payment_issues (transaction_id,
     description 'Thanh toán thành công nhưng chưa kích hoạt gói', status 'open'). Hãy cân nhắc RPC hiện tại và đề xuất
     cách đúng (vd RPC dùng EXCEPTION block: cập nhật giao dịch, kích hoạt trong sub-block, lỗi thì tạo issue).
   - Giao dịch đã failed (do bộ quét) mà cổng báo success đến muộn: KHÔNG sửa giao dịch, tạo payment_issues để admin xử lý.
3. POST /payments/payos/webhook: KHÔNG gắn guard đăng nhập; đặt @SkipThrottle nếu ThrottlerGuard toàn cục áp vào
   (kiểm app.module.ts). verifyWebhook trả null → 400. Hợp lệ → completeOrder → LUÔN 200 { ok: true }.
   Không log toàn bộ body (có thông tin tài khoản người trả).
4. GET /payments/orders/:orderCode: chỉ chủ đơn, người khác nhận 404 (không 403, để không lộ việc đơn tồn tại).
   Trả { orderCode, status: 'success'|'failed'|'pending'|'expired', planName, amountVnd, createdAt }.
   'expired' = pending quá 30 phút.
5. POST /payments/orders/:orderCode/sync: chỉ chủ đơn và chỉ khi đơn pending; gọi gateway.getPaymentStatus;
   success hoặc failed thì completeOrder. Giới hạn 1 lần mỗi 3 giây mỗi đơn (bộ nhớ là đủ). Cổng lỗi → 502, không đổi gì.

Frontend:
6. /plans: nút "Nâng cấp lên STAVE+" mở ConfirmDialog nêu giá, chu kỳ 1 tháng, điều khoản BR-84. Xác nhận thì gọi checkout
   rồi window.location.assign(checkoutUrl). Nút disabled khi đang gọi. 502 → hiện "Hiện chưa thanh toán được, thử lại sau".
   Đọc ?returnTo= trên /plans, lọc bằng safeRedirectPath rồi truyền xuống.
7. Trang /billing/result: poll GET /payments/orders/:orderCode mỗi 2 giây, tối đa 30 giây. Ở giây thứ 6 nếu vẫn pending
   thì gọi sync ĐÚNG MỘT lần. Dọn timer khi unmount.
   - success: "Thanh toán thành công", nút "Tiếp tục" về returnTo (đã qua safeRedirectPath) hoặc /plans.
   - failed hoặc expired: "Thanh toán không thành công", nút "Thử lại" về /plans.
   - Hết 30 giây vẫn pending: "Đang chờ xác nhận", hướng dẫn kiểm tra lại ở /billing sau vài phút, nút "Kiểm tra lại".
   - KHÔNG dùng các tham số PayOS gắn lên URL (status, code, cancel...) để quyết định; chỉ tin backend.
   Tách logic poll thành hook hoặc hàm thuần có test (vitest với fake timers).

Kiểm thử bắt buộc (backend unit test với Supabase client mock theo cách các spec hiện có đang mock):
- Ba trường hợp ở chế độ giả: thành công, thất bại, huỷ.
- completeOrder gọi 2 lần (và 2 lần song song bằng Promise.all) → chỉ 1 thông báo, 1 lần kích hoạt.
- Webhook chữ ký sai → 400; người khác xem orderCode của tôi → 404.
- Cổng lỗi → dòng pending bị xoá, trả 502.
- Thất bại rồi checkout lại → retry_of trỏ đúng giao dịch failed.
- Kích hoạt lỗi → giao dịch success và có 1 payment_issues mở.
Commit: "Add STAVE+ checkout, PayOS webhook and order sync".
```

---

## P5: UC-77 Lịch sử giao dịch

```
PHẦN P5: UC-77. Đọc mục UC-77 trong docs/team/hai.md.

Backend:
- GET /billing/transactions?limit=&cursor=: giao dịch của người gọi, mới nhất trước, phân trang theo cursor (created_at, id).
  Mỗi dòng: id, createdAt, description, amountVnd, kind, displayStatus ('success' | 'failed' | 'incomplete';
  pending hoặc pending quá 30 phút đều hiển thị là 'incomplete'; viết hàm thuần có test), planName,
  retryOf { id, createdAt } | null, hasOpenIssue.
- GET /billing/transactions/:id/receipt: chỉ chủ sở hữu (người khác 404). Giao dịch success và đủ dữ liệu → { available: true,
  orderCode, createdAt, planName, amountVnd, payerName }. Không đủ hoặc không phải success (5.E1) → { available: false, details }
  (không trả 500).
- POST /billing/transactions/:id/issues { description }: DTO trim, 1–500 ký tự; chỉ chủ sở hữu; ghi reported_by nếu cột đã có
  (cột thêm ở migration đợt 2; nếu chưa có thì bỏ qua và để TODO tham chiếu P7). Đã có sự cố mở → 409
  (kiểm trước, đồng thời bắt lỗi unique index của P1). Thêm UserThrottlerGuard.

Frontend:
- Route /billing (RequireAuth, layout title "Thanh toán").
  * Phía trên: gói hiện tại (từ /subscriptions/me) và "Thanh toán kế tiếp: <ngày>" nếu còn hiệu lực; đã huỷ thì
    "Hiệu lực đến <ngày>"; nếu có pendingPlan thì "Sẽ chuyển sang <gói> vào <ngày>". Liên kết tới /plans.
  * RowList: ngày (formatDate), mô tả, số tiền (formatVnd), kết quả "Thành công" / "Thất bại" / "Chưa hoàn tất" dùng Badge.
    Kind refund hoặc compensation hiển thị nhãn riêng ("Hoàn tiền", "Đền bù").
  * Dòng có retryOf: dòng phụ "Thử lại sau lần thất bại <ngày>" (3.1).
  * Không có giao dịch (2.E1): EmptyState "Bản ghi sẽ xuất hiện khi bạn bắt đầu đăng ký gói trả phí", kèm nút tới /plans.
  * Lỗi tải (2.E2): báo lỗi kèm "Thử lại". Có "Tải thêm" nếu còn cursor.
  * Mỗi dòng success có link "Biên lai"; mỗi dòng có nút "Báo sự cố" mở Dialog nhập mô tả (đếm x/500).
    hasOpenIssue → nút disabled, ghi "Đã có sự cố đang xử lý".
- Route /billing/receipts/[id]: trang in được. CSS @media print ẩn site header, footer và các nút.
  Nút "In" gọi window.print(). available false → vẫn hiện chi tiết và câu "Biên lai không có cho giao dịch này".
  Đọc docs Next về dynamic params trong node_modules trước khi viết.

Tiêu chí hoàn thành: test displayStatus và DTO; tsc + lint + test pass. Commit: "Add transaction history, receipts and issue reporting".
```

---

## P6: UC-75 Đổi gói và UC-76 Huỷ gói (hết đợt 1)

```
PHẦN P6: UC-75 và UC-76. Đọc hai mục này trong docs/team/hai.md.

UC-75:
- POST /subscriptions/change { planId }:
  * Gói đích phải khác gói hiệu lực hiện tại; không còn is_active → 409 'Plan is no longer available' (dịch trong API_MESSAGES) (2.E1),
    không đổi gì.
  * Phải đang có gói trả phí còn hiệu lực; nếu không → 409, hướng tới checkout.
  * Nâng cấp (giá đích > giá đang khoá price_locked_vnd hoặc giá gói hiện tại; hãy nêu rõ bạn chọn so sánh với giá nào):
    gọi createCheckout purpose 'upgrade' với toàn bộ giá gói mới, trả { checkoutUrl, orderCode }. Hoàn tất thành công:
    plan_id đổi ngay, started_at = now, current_period_end = now + 1 tháng (BR-88, không tính tỷ lệ), price_locked_vnd = giá mới,
    status 'active', pending_plan_id NULL. Mở rộng RPC hoặc completeOrder: phân biệt bằng việc transactions.plan_id khác
    plan_id hiện tại của subscriptions. Bị từ chối (5.E1) → giữ gói cũ, giao dịch failed. Cổng lỗi (5.E2) → 502, không đổi gì.
  * Hạ cấp (giá đích thấp hơn, gồm cả về Free): không thu tiền, UPDATE pending_plan_id; trả { scheduledAt: current_period_end }.
    notify billing.plan_changed { planName, effectiveDate }.
- POST /subscriptions/cancel-downgrade: xoá pending_plan_id (5.1). Không có lịch thì 409.
- GET /subscriptions/change-preview?planId=: trả { kind: 'upgrade'|'downgrade', chargeVnd, effectiveAt } để dialog nêu
  thời điểm hiệu lực và chi phí (bước 3). Phân loại viết thành hàm thuần có test.
- Frontend /plans: nút "Đổi gói" trên card gói khác → gọi preview → ConfirmDialog ("Thanh toán <x>đ ngay, gói mới có hiệu lực
  ngay và kỳ mới bắt đầu hôm nay" hoặc "Không thu tiền, chuyển sang <gói> vào <ngày>"). Đóng dialog (4.1) không gọi API.
  Đã có lịch hạ cấp: hiện "Sẽ chuyển sang <gói> vào <ngày>" và nút "Huỷ lịch hạ cấp".

UC-76:
- POST /subscriptions/cancel: chỉ khi có gói trả phí còn hiệu lực và status 'active'. Đặt status 'canceled', GIỮ
  current_period_end, xoá pending_plan_id. Không hoàn tiền. notify billing.canceled { planName, endDate }.
- POST /subscriptions/resume (6.1): chỉ khi status 'canceled' và còn hiệu lực → status 'active', không thu tiền.
  Hết hạn rồi → 409, hướng tới checkout.
- GET /subscriptions/cancel-preview: { endDate, paidOnlySettings: string[] }. Nếu users.active_theme_id trỏ tới themes
  có type 'custom' thì thêm 'Theme tạo từ ảnh' (đọc bằng query riêng, không dùng hay sửa UsersService).
- Frontend: ConfirmDialog huỷ gói nêu: ngày tài khoản quay về Free; "Không dự án hay dữ liệu nào bị xoá";
  danh sách thiết lập sẽ quay về mặc định khi hết kỳ (3.E1, BR-89) và câu "bảng màu vẫn được giữ để khôi phục khi đăng ký lại".
  Lỗi lưu (5.E1): báo lỗi, UI vẫn hiển thị là đang gia hạn (không cập nhật lạc quan trước khi API thành công).
  Trạng thái đã huỷ: "Đã huỷ, hiệu lực đến <ngày>" và nút "Tiếp tục gói".

Test: phân loại upgrade/downgrade; cancel/resume theo trạng thái; upgrade hoàn tất đúng ngày.
Kịch bản tự chạy ở chế độ giả (viết thành checklist trong báo cáo): Free → STAVE+ → huỷ → tiếp tục → hạ cấp về Free → huỷ lịch.

Cuối phần (hết đợt 1): rà soát toàn bộ đợt 1.
- Mọi endpoint ngoài webhook đều có guard; không có IDOR; không còn console.log hoặc TODO ngoài các TODO trỏ tới P7–P11.
- Viết docs/tasks/hai-pr-dot1.md (không commit): UC đã làm, cách test với PAYMENT_PROVIDER=fake từng bước,
  cách bật PayOS thật (biến môi trường, URL webhook /payments/payos/webhook trên bản Railway), các câu hỏi cho trưởng nhóm.
Commit: "Add plan change and subscription cancellation".
```

---

## P7: Gia hạn, hết hạn, bộ quét + migration đợt 2

```
PHẦN P7: đọc mục "Gia hạn và hết hạn" và phần migration trong mục UC-108 của docs/team/hai.md.

1. Migration backend/supabase/migrations/<timestamp hiện tại>_hai_billing_2.sql (idempotent):
   payment_issues thêm remedy text CHECK (remedy IS NULL OR remedy IN ('extend','refund','activate','dismiss')),
   note text, reported_by uuid REFERENCES public.users(id) ON DELETE SET NULL.
   Nếu cần thì thêm hàm advisory lock cho bộ quét (vd billing_try_lock() trả boolean dùng pg_try_advisory_xact_lock;
   lưu ý lock theo transaction không giữ qua nhiều lệnh REST, nên ưu tiên cách UPDATE có điều kiện bên dưới).
   Bật lại phần reported_by ở P5 nếu đã để TODO.
2. BillingSchedulerService (theo mẫu jam.service.ts): onModuleInit chạy một lần ngay rồi setInterval mỗi giờ;
   onModuleDestroy clearInterval. Tắt được bằng BILLING_SCHEDULER_ENABLED=false (thêm vào .env.example) và tự tắt khi NODE_ENV=test.
   Mỗi bước bọc try/catch riêng để một bước lỗi không chặn bước khác.
   An toàn khi có nhiều instance: mọi thay đổi dùng UPDATE ... WHERE <điều kiện cũ> ... .select() và chỉ gửi thông báo
   cho các dòng thật sự được cập nhật.
   a) Nhắc gia hạn billing.renewal_due { planName, dueDate } cho đăng ký status 'active', không có pending_plan_id:
      các mốc là T-3 ngày, ngày hết hạn, và mỗi ngày trong ân hạn. Viết hàm thuần currentReminderMilestone(sub, now) → Date | null
      (mốc gần nhất đã tới); gửi khi renewal_notified_at là NULL hoặc nhỏ hơn mốc, rồi đặt renewal_notified_at = now. Có unit test.
   b) Quá current_period_end, status 'active', grace_until NULL, không có pending_plan_id → grace_until = current_period_end + 3 ngày (BR-86).
      Hết ân hạn: không làm gì (getEffective tự trả Free).
   c) Hạ cấp đã đặt lịch, current_period_end <= now: pending là gói trả phí → plan_id = pending_plan_id,
      price_locked_vnd = giá gói đích, pending_plan_id NULL, và kỳ mới phải được thanh toán (hỏi tôi nếu đặc tả không rõ:
      hạ sang gói trả phí rẻ hơn có cần checkout không). Pending là gói Free → chỉ xoá pending_plan_id (kỳ hết là xong).
      notify billing.plan_changed.
   d) Giao dịch pending quá 30 phút: chế độ payos thì hỏi getPaymentStatus trước (success → completeOrder(true);
      cổng lỗi → bỏ qua lượt này); còn lại UPDATE status 'failed' WHERE status = 'pending'.
3. Gia hạn bằng thanh toán:
   - Hàm thuần computeRenewalPrice(plan, sub, now): dùng plan.price_vnd khi plan.price_effective_at là NULL hoặc <= now,
     ngược lại dùng sub.price_locked_vnd. computeNewPeriodEnd(sub, now) = max(now, current_period_end) + 1 tháng
     (cộng tháng theo lịch, xử lý ngày 31). Unit test: gia hạn sớm, trong ân hạn, trước và sau ngày đổi giá, tăng và giảm giá.
   - POST /subscriptions/renew: chỉ khi gói trả phí, status 'active', không có lịch hạ cấp; createCheckout purpose 'renew'
     với giá ở trên. completeOrder nhánh renew: current_period_end = computeNewPeriodEnd, price_locked_vnd = giá vừa thu,
     grace_until NULL, renewal_notified_at NULL (mở rộng RPC trong migration đợt 2).
     Gói đã bị admin tắt vẫn được gia hạn (BR-120).
   - /plans: nút "Gia hạn ngay" khi còn ≤ 3 ngày hoặc đang trong ân hạn; banner đỏ nhẹ khi đang trong ân hạn.
4. Viết docs/tasks/hai-pr-dot2-notes.md (không commit): PayOS là QR/chuyển khoản nên không tự trừ tiền định kỳ; mô hình là
   nhắc + người dùng tự gia hạn + 3 ngày ân hạn; giá gia hạn theo BR-119.
Commit: "Add subscription renewal, grace period and billing sweeper".
```

---

## P8: UC-79 Theme tạo từ ảnh

```
PHẦN P8: UC-79. Đọc mục UC-79 trong docs/team/hai.md. Sau đó đọc:
- frontend/components/settings/theme-picker.tsx: khối PLACEHOLDER ở khoảng dòng 112–131
  (comment "UC-79 ... chưa xây dựng", Badge STAVE+, nút "Tải ảnh lên (PLACEHOLDER)").
- frontend/context/theme-context.tsx: khoảng dòng 70–80 (getMyTheme và comment về type 'custom').
- frontend/app/globals.css: preset "unleashed" (mặc định khi không có data-theme) cùng các khối moss, claret...
- backend/src/users/users.service.ts: kiểu ThemeRow và hàm đọc theme (khoảng dòng 18–200). CHỈ ĐỌC để biết cột bảng themes;
  không sửa và không import service này.
PHẠM VI: chỉ được sửa khối PLACEHOLDER của theme-picker.tsx và nhánh custom của theme-context.tsx. Còn lại là file mới.

A. frontend/lib/theme-from-image.ts (thuần, có frontend/lib/theme-from-image.test.ts):
   - srgbToOklch / oklchToSrgb (tự viết theo công thức chuẩn của Björn Ottosson), relativeLuminance, contrastRatio (WCAG 2.x).
   - clusterColors(pixels, k = 5): median cut hoặc k-means khoảng 50 dòng, không dùng thư viện. Trả cụm { color, share }.
   - pickHues(clusters): h1 là hue của cụm có (chroma × share) lớn nhất; h2 là cụm kế tiếp có hue cách h1 ít nhất 30°
     (không có thì h1 + 30°).
   - Ảnh không đủ màu (3.E1): cụm lớn nhất > 85% điểm ảnh, HOẶC mọi cụm có chroma < 0.03, HOẶC độ chênh hue giữa các cụm
     có chroma đáng kể < 15°. Khi đó ném ThemeFromImageError('not_enough_color').
   - buildPalette(h1, h2): chép L và C của 10 biến trong preset unleashed thành hằng số (comment ghi nguồn globals.css),
     chỉ thay H: h1 cho 8 biến trung tính, h2 cho --metal và --metal-muted. Đúng 10 khoá: --background, --surface,
     --surface-subtle, --surface-muted, --foreground, --muted-foreground, --border, --border-strong, --metal, --metal-muted.
     Nếu biến nào trong preset không phải dạng oklch thì chuyển đổi và báo tôi.
   - ensureContrast(palette): với các cặp foreground/background, muted-foreground/background, foreground/surface,
     nếu tỷ lệ < 4.5 thì chỉnh L của màu chữ theo hướng xa nền cho đến khi đạt.
   - formatOklch: `oklch(L C H)`, L và C tối đa 4 chữ số thập phân, H tối đa 2.
   - PALETTE_KEYS và isValidPalette(p): dùng chung cho client. Đặt regex vào shared-types để backend dùng cùng.
   - Test: chuyển đổi trắng/đen/đỏ thuần, contrastRatio(đen, trắng) = 21, palette luôn đủ đúng 10 khoá, không có khoá
     --accent/--success/--warning/--danger, ensureContrast luôn đạt ≥ 4.5 với nhiều hue (0–359), ảnh một màu bị từ chối.
B. frontend/lib/load-image-pixels.ts: đọc File vào canvas 64×64 (createImageBitmap), bỏ điểm ảnh alpha < 128,
   không giữ ảnh lại; thu hồi object URL nếu có dùng.
C. Component mới frontend/components/settings/theme-from-image.tsx, gắn vào CHỖ PLACEHOLDER (giữ Badge STAVE+ và tiêu đề,
   bỏ chữ PLACEHOLDER):
   - hasPaidAccess từ getMySubscription(). Free (1.E1): vùng thả ảnh vẫn hiện nhưng disabled, giải thích, và link
     "/plans?feature=theme_from_image&returnTo=/profile" (kiểm tra đúng đường dẫn tab Cá nhân hoá).
   - Kéo thả và chọn file. Chấp nhận image/png, image/jpeg, image/webp, ≤ 5 MB (2.E1). Thông báo lỗi nêu rõ
     "Chỉ nhận PNG, JPEG, WebP, tối đa 5 MB".
   - Sau khi tạo: xem trước bằng cách gán 10 biến lên document.documentElement.style, kèm dải màu mẫu.
     Hai nút "Áp dụng và lưu" và "Quay về preset" (6.1: gỡ biến tạm, không gọi API). Unmount khi chưa lưu → gỡ biến tạm.
   - Lưu lỗi (7.E1): gỡ xem trước, khôi phục theme cũ, báo lỗi.
D. Backend: module mới backend/src/custom-themes (không sửa module users):
   - PUT /themes/me/custom { palette } (JwtAuthGuard + SessionAuthGuard + UserThrottlerGuard):
     (a) SubscriptionsService.getEffective().hasPaidAccess, không có → 403;
     (b) đúng 10 khoá, không thiếu không thừa; (c) mỗi giá trị khớp regex chặt dùng chung từ shared-types
         và kiểm khoảng L ∈ [0,1], C ∈ [0,0.4], H ∈ [0,360);
     (d) upsert MỘT dòng themes type 'custom' của user (generated_palette = palette; xem ThemeRow để biết cột sở hữu và
         các cột bắt buộc khác), rồi UPDATE users.active_theme_id. Ghi thẳng bảng users từ module khác: kiểm team-workload.md
         có cho phép không; không rõ thì HỎI TÔI trước khi làm bước này.
     Unit test validator với các chuỗi tấn công: "oklch(1 0 0); } body { display:none", "oklch(1 0 0) !important",
     "var(--x)", "url(x)", khoá "--accent".
   - GET /themes/me/effective → { type: 'preset'|'custom'|null, presetKey, palette, hasPaidAccess }.
     type custom mà hết quyền (BR-89): vẫn trả palette, hasPaidAccess false; KHÔNG xoá generated_palette.
E. theme-context.tsx: thêm getMyEffectiveTheme() vào frontend/lib/api-billing.ts (KHÔNG sửa api-client.ts); ThemeProvider
   dùng hàm này thay cho getMyTheme khi đọc theme ban đầu (setMyTheme giữ nguyên). Nhánh custom: hasPaidAccess và
   isValidPalette → bỏ data-theme và gán 10 biến; ngược lại áp preset mặc định. Chọn preset khác → gỡ 10 biến custom.
   Giữ nguyên hành vi hiện có cho preset.

Tiêu chí hoàn thành: vitest theme-from-image pass; test validator backend pass; tsc + lint pass. Liệt kê các ca để tôi tự thử:
ảnh nhiều màu, ảnh một màu, file GIF, file 6 MB, tài khoản Free, tài khoản STAVE+, STAVE+ đã hết hạn nhưng có theme custom.
Commit: "Add theme generation from image".
```

---

## P9: UC-104 Xem giao dịch (admin)

```
PHẦN P9: UC-104. Đọc mục UC-104 trong docs/team/hai.md, cùng backend/src/admin/admin.controller.ts và
frontend/app/admin/users (mẫu trang admin) để làm theo cùng kiểu.

Backend: module backend/src/admin-billing (controller @UseGuards(JwtAuthGuard, SessionAuthGuard, AdminGuard)).
- GET /admin/transactions?from=&to=&outcome=&planId=&limit=&cursor=: DTO class-validator (from, to là ISO date và from ≤ to;
  outcome thuộc success|failed|pending; planId là uuid; limit 1–100, mặc định 50). Mới nhất trước, cursor (created_at, id).
  Mỗi dòng: id, createdAt, orderCode, kind, status, amountVnd, providerRef, plan { id, name },
  account: { id, displayName, email } | null (null = tài khoản đã xoá), payerName, payerEmail.
- Tổng theo bộ lọc (không theo trang): tổng tiền success của kind 'charge', tổng refund (hiện riêng), số giao dịch success,
  số failed. Tính bằng SQL: tạo hàm RPC trong migration đợt 2 hoặc migration mới (nói rõ bạn chọn cách nào). Không cộng ở client.
- GET /admin/transactions/:id: chi tiết + giao dịch liên quan (retry_of hai chiều, các refund/compensation cùng user và plan)
  + sự cố của giao dịch.
- Không có endpoint sửa hay xoá. Không trả bất cứ trường nào về thẻ hoặc tài khoản ngân hàng (BR-117).

Frontend:
- Thêm vào ADMIN_NAV_ITEMS: { href: '/admin/transactions', label: 'Giao dịch', icon: Receipt } (lucide-react).
- Trang /admin/transactions: bộ lọc khoảng ngày, kết quả, gói (đồng bộ với query string). Lọc "Thất bại" thì hiện link
  "Xem sự cố thanh toán" → /admin/payment-issues (5.1; trang làm ở P11).
- Thẻ tổng phía trên; bảng hoặc RowList; bấm dòng mở Dialog chi tiết (6.1).
- Tài khoản đã xoá (3.E1): "Tài khoản đã xoá" + payer_name / payer_email.
- Kỳ không có giao dịch (2.E1): EmptyState nói rõ "Không có giao dịch trong khoảng này". Lỗi (2.E2): báo lỗi + Thử lại,
  ẩn thẻ tổng.
- "Xuất CSV": frontend/lib/to-csv.ts (có test): BOM UTF-8; escape dấu phẩy, ngoặc kép, xuống dòng; ô bắt đầu bằng = + - @
  hoặc tab thì thêm tiền tố '. Trước khi xuất, tải hết các trang theo bộ lọc (lặp cursor, giới hạn 10.000 dòng và báo nếu vượt).
  Cột: ngày, mã đơn, tài khoản, email, gói, loại, số tiền, kết quả, mã tham chiếu.

Tiêu chí hoàn thành: test DTO và to-csv pass; tsc + lint pass. Commit: "Add admin transactions view".
```

---

## P10: UC-105, UC-106, UC-107 Quản trị gói

```
PHẦN P10: UC-105/106/107. Đọc ba mục này trong docs/team/hai.md.

Backend (module admin-billing, AdminGuard). Viết hàm writeAuditLog riêng theo mẫu admin.service.ts với target_type 'plan';
không sửa file của Vũ.
- GET /admin/plans: mọi gói, kể cả tắt, theo sort_order; kèm subscriberCount (số dòng subscriptions còn hiệu lực theo plan_id,
  gồm cả canceled còn hạn) và priceEffectiveAt.

UC-105 POST /admin/plans { name, description, priceVnd, features: PlanFeatureKey[], extraStorageMb?, draft? }:
- name trim, 1–60 ký tự, không trùng lower(name) với gói khác (kiểm trước và bắt lỗi unique 23505 → 409 'Plan name already exists' (dịch trong API_MESSAGES)) (4.E1).
- priceVnd: số nguyên ≥ 0 (@IsInt @Min(0)) (4.E2). features chỉ nhận khoá trong PLAN_FEATURES. Chu kỳ 1 tháng (BR-86),
  không nhận trường chu kỳ.
- Dung lượng đi kèm: lưu trong features JSON (vd { extra_storage: true, extra_storage_mb: N }). Đơn vị và giới hạn chưa rõ
  trong đặc tả: hỏi tôi trước khi chốt.
- draft → is_active false (3.1). Gói mới luôn is_default false; sort_order = max + 1.
- Trả kèm warnings: tính năng mà gói Free cũng có (3.E1) → cảnh báo "không phân biệt với gói miễn phí", vẫn cho tạo.
- Không đụng subscriptions nào (BR-118). Audit 'plan.create'.

UC-106 PATCH /admin/plans/:id/price { priceVnd, effectiveAt }:
- priceVnd số nguyên ≥ 0 (4.E1). noticeDays = PlatformSettingsService.get('price_change_notice_days', 7).
  effectiveAt phải ≥ now + noticeDays ngày; sai → 400 nêu ngày sớm nhất hợp lệ (4.E2). Viết hàm thuần validateEffectiveAt có test.
- UPDATE price_vnd và price_effective_at. Người mua mới dùng giá mới ngay; người đang đăng ký giữ price_locked_vnd tới kỳ
  gia hạn có ngày ≥ price_effective_at (BR-119; logic ở computeRenewalPrice P7, thêm test tăng và giảm giá cho đúng ca này (3.1)).
- notify billing.price_change { planName, newPrice, effectiveDate } cho mọi người đang dùng gói (còn hiệu lực).
- Audit 'plan.price_change', reason "Giá <cũ> → <mới>, áp dụng từ <ngày>".
- Đổi tính năng (5.1, áp dụng từ kỳ gia hạn sau): cần cột pending_features và áp dụng khi gia hạn, nên vượt phạm vi đặc tả gốc.
  HỎI TÔI trước khi làm; nếu tôi đồng ý thì thêm migration và nối vào nhánh renew.
- Dialog frontend cho thấy giá hiện tại và số người đang đăng ký (2).

UC-107 POST /admin/plans/:id/deactivate và /activate:
- Gói is_default: không hiện nút; backend từ chối 400 'Default plan cannot be deactivated' (dịch trong API_MESSAGES) (1.E1).
- Tắt là is_active false; không có đường xoá gói. Người đang dùng giữ nguyên gói và giá (BR-120). Bật lại (4.1) giữ giá đã lưu.
- Audit 'plan.deactivate' / 'plan.activate'.
- Dialog: subscriberCount > 0 → "<n> người đang dùng gói này sẽ không bị ảnh hưởng, gói chỉ ẩn với người mua mới" (2);
  = 0 → xác nhận đơn giản (2.E1).

Frontend: thêm { href: '/admin/plans', label: 'Gói dịch vụ', icon: Package } vào ADMIN_NAV_ITEMS. Trang /admin/plans:
danh sách gói (giá, trạng thái Bản nháp/Đang bán/Đã tắt, số người dùng, giá chờ áp dụng), nút "Tạo gói" (Dialog: tên, mô tả,
giá, tính năng dạng checkbox từ PLAN_FEATURES, dung lượng, "Chu kỳ: 1 tháng" chỉ đọc, hai nút "Lưu nháp" và "Tạo và mở bán"),
"Đổi giá" (Dialog có date picker, gợi ý ngày sớm nhất), "Tắt" / "Bật lại".

Tiêu chí hoàn thành: test DTO, validateEffectiveAt, cảnh báo 3.E1; tsc + lint + test pass.
Commit: "Add admin plan management".
```

---

## P11: UC-108 Xử lý sự cố thanh toán

```
PHẦN P11: UC-108. Đọc mục UC-108 trong docs/team/hai.md.

Backend (module admin-billing, AdminGuard):
- GET /admin/payment-issues?status=open|resolved&cursor=: kèm giao dịch (orderCode, số tiền, trạng thái, gói, providerRef),
  tài khoản hoặc "đã xoá" + payer_name / payer_email (1.E1), người báo (reported_by; null = hệ thống tự tạo).
- GET /admin/payment-issues/:id: chi tiết + dòng thời gian mọi giao dịch của tài khoản (user_id; nếu tài khoản đã xoá thì theo
  payer_email) + verification:
  'match' | 'mismatch' | 'skipped' (chế độ fake) | 'unavailable' (cổng không phản hồi, 2.E1), dùng
  PaymentGateway.getPaymentStatus(order_code) so với status trong DB.
- POST /admin/payment-issues/:id/resolve { remedy, note, days?, refundAmountVnd?, refundRef?, duplicateOfIssueId? }:
  * note trim, bắt buộc, ≤ 1000 ký tự (4.E1) → 400 nếu rỗng.
  * Sự cố đã resolved → 409.
  * remedy extend, refund hoặc activate: đối chiếu cổng NGAY trong request (trừ fake); 'unavailable' → 409
    'Payment provider unavailable, issue stays open' (dịch: "Chưa đối chiếu được với cổng thanh toán, sự cố vẫn mở") (2.E1).
  * extend: days nguyên 1–90; INSERT transactions kind 'compensation', amount_vnd 0, status 'success', user_id, plan_id,
    description "Đền bù N ngày"; current_period_end = max(now, current_period_end) + N ngày.
  * refund: refundRef bắt buộc; refundAmountVnd nguyên, 1 ≤ x ≤ amount_vnd gốc; INSERT kind 'refund', provider_ref = refundRef.
    KHÔNG gọi API hoàn tiền (hoàn tiền thật làm trên trang PayOS). Có thu hồi gói hay không: HỎI TÔI.
  * activate (3.1): giao dịch gốc phải success và gói chưa kích hoạt từ giao dịch đó; kích hoạt bằng cùng logic kích hoạt
    của completeOrder (tách thành hàm SQL dùng chung). Không sửa giao dịch cũ.
  * dismiss (3.2): duplicateOfIssueId bắt buộc, phải tồn tại và khác id hiện tại.
  * Mọi thay đổi + UPDATE payment_issues (status 'resolved', remedy, note, resolved_by, resolved_at) chạy trong MỘT hàm Postgres
    (migration đợt 2 hoặc migration mới), để lỗi (5.E1) thì rollback toàn bộ và sự cố vẫn mở. Không được báo "đã xử lý" khi lỗi.
  * Thành công: notify billing.issue_resolved { summary } nếu tài khoản còn; audit 'payment_issue.resolve' với reason gồm remedy
    và note (target_type 'payment_issue').

Frontend: thêm { href: '/admin/payment-issues', label: 'Sự cố thanh toán', icon: AlertTriangle } vào ADMIN_NAV_ITEMS.
Trang /admin/payment-issues: Tabs "Đang mở" / "Đã xử lý". Trang chi tiết /admin/payment-issues/[id]:
dòng thời gian giao dịch, badge đối chiếu (Khớp / Không khớp / Bỏ qua (chế độ giả) / Cổng không phản hồi).
Khi 'unavailable' thì disable mọi biện pháp trừ dismiss và hiện nút "Đối chiếu lại".
Form chọn biện pháp (trường phụ thuộc remedy), ghi chú bắt buộc, ConfirmDialog trước khi áp dụng. Lỗi → giữ form, báo lỗi.

Test: DTO và các điều kiện từng remedy (unit test với mock); mô tả kịch bản tự thử: mỗi remedy một lần, ghi chú rỗng,
cổng không phản hồi, tài khoản đã xoá. Commit: "Add admin payment issue resolution".
```

---

## P12: Rà soát cuối và mô tả PR

```
PHẦN P12: rà soát toàn bộ việc của tôi trên các nhánh billing (theo bảng ở đầu file) so với main.

1. Lập bảng đối chiếu từng mục "Bắt buộc xử lý" của mọi UC trong docs/team/hai.md: UC / mục / trạng thái
   (xong, thiếu, lệch) / file:dòng chứng minh. Mục thiếu thì liệt kê, KHÔNG tự làm thêm khi chưa hỏi tôi.
2. Bảo mật: guard trên mọi endpoint (trừ webhook, có xác minh chữ ký); không IDOR (mọi :id và :orderCode lọc theo người gọi
   hoặc AdminGuard); /dev/* không tồn tại ở production (cả backend lẫn frontend); returnTo chống chuyển hướng ra ngoài;
   palette chống chèn CSS ở cả server và client; không log body webhook hay thông tin người trả;
   `git log -p main..HEAD | grep -iE "payos_(api|checksum|client)[a-z_]*=.+"` không ra giá trị thật nào.
3. Đúng đắn: completeOrder idempotent; tiền là integer ở mọi chỗ (DTO, SQL, hiển thị); ngày hiển thị theo vi-VN.
4. Phạm vi: `git diff --stat main...HEAD` và đối chiếu team-workload.md. Liệt kê mọi file nằm ngoài phạm vi và lý do.
5. Chạy: backend lint + test + build; frontend lint + vitest + tsc + build. Dán kết quả thật.
6. Viết docs/tasks/hai-pr.md (không commit) bằng tiếng Việt, gồm: tóm tắt; danh sách UC; migration (lý do đổi FK);
   cách test với PAYMENT_PROVIDER=fake; cách bật PayOS thật (biến môi trường, URL webhook); mô hình gia hạn thủ công
   + 3 ngày ân hạn; câu hỏi chờ trưởng nhóm chốt (giá STAVE+, đơn vị dung lượng, refund có thu hồi gói không,
   đổi tính năng 5.1, link menu header (site-header.tsx của Trí), thứ tự merge các nhánh xếp chồng).
```
=====END FILE=====

=====BEGIN FILE: docs/tasks/hai-master-prompt.md=====
Bạn sẽ TỰ ĐỘNG triển khai toàn bộ phần việc của Hải (thanh toán STAVE+, theme từ ảnh, quản trị gói) trong repo này, từ đầu đến cuối, không cần chờ tôi xác nhận giữa các bước.

## Tài liệu (đọc hết trước khi làm)
- docs/team/hai.md: đặc tả, là NGUỒN CHUẨN.
- docs/team-workload.md: quy ước BẮT BUỘC của nhóm (mục 2, 3, 5, 6).
- docs/tasks/hai-prompts.md: kế hoạch chi tiết, gồm "Prompt 0" (sự thật về repo + quy tắc) và các phần P1 → P12, kèm bảng tên nhánh.
Thứ tự ưu tiên khi mâu thuẫn: hai.md > team-workload.md > hai-prompts.md.

## Cách làm
1. Tạo file theo dõi docs/tasks/hai-progress.md (docs/tasks/ đã nằm trong .git/info/exclude, không commit), gồm:
   bảng P1–P12 (chưa làm / đang làm / xong + nhánh + commit), quyết định đã chọn, câu hỏi cho trưởng nhóm, kết quả kiểm tra từng phần.
   Cập nhật SAU MỖI PHẦN. Nếu phiên bị ngắt hoặc context bị nén, đọc lại file này để làm tiếp, KHÔNG làm lại phần đã xong.
2. Nhánh: theo bảng trong hai-prompts.md. P1 tạo từ main mới nhất (`git checkout main && git pull origin main`);
   các nhánh sau tạo từ nhánh của phần trước (xếp chồng, vì phụ thuộc nhau). Ghi thứ tự merge vào progress.
3. Dùng task list cho P1 → P12, làm TUẦN TỰ. Mỗi phần:
   a. Đọc lại đúng mục của phần đó trong hai-prompts.md và mục UC tương ứng trong hai.md.
   b. Khảo sát code mẫu trước khi viết (custom-sounds, branches.service.spec.ts, rankings/layout.tsx, các file nêu trong Prompt 0).
   c. Viết code + unit test (mỗi service: luồng chính + ít nhất 2 trường hợp lỗi).
   d. Kiểm tra: backend `npx eslint <file đã đổi>` (KHÔNG dùng `npm run lint` ở backend), `npm test`, `npm run build`;
      frontend `npx eslint <file đã đổi>`, `npx vitest run`, `npm run build`. Lỗi thì sửa tới khi qua.
      Lỗi có sẵn trên main không do tôi gây ra thì ghi vào progress, không sửa file người khác.
   e. Đối chiếu từng dòng "Bắt buộc xử lý" / Exceptions của UC, ghi file:dòng xử lý vào progress.
   f. Tự review diff: guard và IDOR, idempotent, tiền là integer, không lộ thông tin thanh toán, không hiện mã UC/BR cho người dùng,
      chỉ token màu, đúng phạm vi file (team-workload.md mục 5).
   g. Commit (tiếng Anh, thì hiện tại, đúng message trong kế hoạch; không wip/fix/update; không --no-verify), cập nhật progress.
4. Không hỏi tôi giữa chừng. Gặp điểm mơ hồ thì chọn phương án an toàn nhất trong phạm vi đặc tả, ghi vào "Quyết định" và
   "Câu hỏi cho trưởng nhóm", rồi làm tiếp. Mặc định cho các câu hỏi đã biết:
   - users.active_theme_id: hai.md yêu cầu đặt cột này → UPDATE đúng cột đó từ module của tôi qua SUPABASE_ADMIN_CLIENT,
     không sửa module users.
   - Dung lượng đi kèm: số nguyên MB ở features.extra_storage_mb (0–102400).
   - Hoàn tiền (UC-108): chỉ ghi nhận giao dịch refund, KHÔNG tự thu hồi gói.
   - UC-106 mục 5.1 (đổi tính năng từ kỳ sau): không làm, ghi vào câu hỏi.
   - Hạ cấp sang gói trả phí rẻ hơn: hết kỳ thì đổi plan_id và price_locked_vnd sang gói đích, không gia hạn kỳ;
     người dùng gia hạn qua luồng renew (có ân hạn 3 ngày).
   - Link "Gói dịch vụ" trong site-header.tsx: KHÔNG sửa (file của Trí), ghi vào câu hỏi.
   - Nâng cấp hay hạ cấp: so giá gói đích với price_vnd hiện tại của gói đang dùng.
5. Giới hạn môi trường:
   - KHÔNG áp migration, không chạy `supabase db push`/`db reset` lên project thật, không đụng DB production (gwbiwweeznbuqfgawywv).
   - Không chạy `npm run test:int` hay Playwright e2e nếu cần DB hoặc khoá thật; ghi "chưa chạy, cần môi trường".
   - Không đọc, in ra hay commit nội dung .env thật. Chỉ thêm tên biến trống vào backend/.env.example.
   - Thư viện mới: chỉ `@payos/node@latest` cho backend (hai.md cho phép). Không cài thêm gì khác.
   - Trước khi viết route Next.js, đọc frontend/AGENTS.md và tài liệu trong node_modules/next/dist/docs.
   - Không push, không tạo PR, không xoá nhánh.
6. Các file ghi chú PR (hai-pr-migration.md, hai-pr-dot1.md, hai-pr-dot2-notes.md, hai-pr.md) viết trong docs/tasks/, không commit.

## Điểm dừng
Chỉ dừng trước khi hết P12 nếu:
(a) build/test hỏng do code của tôi mà sửa 3 lần không được;
(b) bắt buộc phải sửa file ngoài phạm vi mới làm tiếp được;
(c) cần khoá hoặc dịch vụ thật.
Khi dừng: KHÔNG commit code hỏng (để nguyên thay đổi trong working tree), cập nhật progress và báo rõ lý do.

## Báo cáo cuối (bằng tiếng Việt)
- Bảng P1–P12: trạng thái, nhánh, commit hash, thứ tự merge.
- Kết quả eslint, test, build thật của backend và frontend.
- Bảng đối chiếu Exceptions của từng UC.
- Danh sách quyết định đã tự chọn và câu hỏi cho trưởng nhóm.
- Việc tôi cần tự làm: mở PR (migration trước), nhờ trưởng nhóm áp migration, đặt biến môi trường, cấu hình webhook PayOS,
  chạy e2e, kiểm tra thủ công trên trình duyệt ở chế độ PAYMENT_PROVIDER=fake và chụp màn hình cho PR.

Bắt đầu ngay: đọc ba tài liệu, tạo hai-progress.md, rồi làm P1.
=====END FILE=====

