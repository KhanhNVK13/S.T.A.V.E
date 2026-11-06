# CLAUDE.md — STAVE

> Quy ước ổn định của dự án. Đọc file này đầu mỗi phiên Claude Code. **File này được commit vào repo công khai (từ 05/11/2026)** — mọi thay đổi đi qua PR như file khác; không ghi bí mật, tài khoản test hay thông tin cá nhân vào đây. `docs/` vẫn bị `.gitignore` chặn, nên các đường dẫn `docs/...` nhắc trong file này chỉ tồn tại trên máy người dùng. Cập nhật hiếm khi — chỉ khi có quyết định/pattern mới thực sự lâu dài. Trạng thái hiện hành nằm ở `project-state/PROJECT_STATE.md`; nhật ký lịch sử theo số §N ở `project-state/archive/` (mọi chỗ ghi "PROJECT_STATE §N" tra theo mục lục ở cuối file chính).

## 1. Dự án là gì

STAVE — Source Tracking and Version Control Environment for Development and Management of MIDI Music Projects. Web app áp dụng tư tưởng Version Control (Git-style: commit/branch/merge/compare/rollback) vào phát triển dự án nhạc MIDI. Nguyên tắc định hình sản phẩm quan trọng nhất: **"STAVE là Google Docs, không phải MS Word"** — tập trung thao tác thiết yếu, không cố làm DAW chuyên sâu.

Chi tiết đầy đủ tầm nhìn/phạm vi/actor: xem `docs/STAVE_PROJECT_BIBLE.md` (không đưa vào Report nộp — chỉ dùng nội bộ khi code).

**Repo:** https://github.com/KhanhNVK13/S.T.A.V.E — public. Xem mục 7 (Biến môi trường & bí mật) trước khi commit bất cứ gì liên quan tới key/token.

## 2. Tech stack đã chốt

| Nhóm | Công nghệ |
|---|---|
| Frontend | Next.js, TailwindCSS, Tone.js |
| Backend | NestJS, Socket.IO |
| Database | Supabase (PostgreSQL) — project `S.T.A.V.E`, id `gwbiwweeznbuqfgawywv`, region ap-southeast-1 |
| Auth & Storage | Supabase Auth, Supabase Storage |
| Audio | Web Audio API, Web MIDI API, MediaRecorder API |
| Deployment | Docker; Netlify Free (frontend, dự kiến, chưa deploy), Railway Hobby (backend) |
| CI/CD | GitHub Actions |
| AI | **Gemini API** (chốt 16/09/2026) — chỉ gọi từ backend, chỉ để viết câu diễn giải (mục 4.4) |

## 3. Cấu trúc thư mục (monorepo)

```
S.T.A.V.E/
├── backend/           # NestJS
├── frontend/          # Next.js
├── shared-types/      # TypeScript type dùng chung FE/BE (khớp schema Supabase)
├── docs/
│   ├── STAVE_PROJECT_BIBLE.md
│   └── decisions/     # Các quyết định kỹ thuật lẻ (VD: JSONB snapshot, RLS)
├── .github/workflows/
├── docker-compose.yml
├── CLAUDE.md
└── project-state/
    ├── PROJECT_STATE.md   # trạng thái hiện hành + việc mở (ngắn)
    └── archive/           # nhật ký lịch sử theo giai đoạn, giữ số §N
```

## 4. Nguyên tắc thiết kế đã chốt — KHÔNG tự ý đổi khi code

### 4.1. Version Control (mục 16 Bible — KHÓA)
- **Full Snapshot per commit**, không lưu delta. Diff tính on-the-fly.
- **Note có UUID bền vững** qua mọi lần sửa — điều kiện tiên quyết để diff/merge chính xác.
- **Conflict**: phát hiện note-level, hiển thị gom theo bar.
- **1 commit = 1 JSON document duy nhất** trong cột `commits.snapshot` (jsonb) — không tách mỗi note thành 1 record.
- **Rollback = tạo commit mới** (revert), không xoá lịch sử.
- **Quyền đọc (chốt 05/11/2026, PR #105):** `ProjectAccessService.assertCanRead` cho phép chủ, cộng tác viên đã chấp nhận, hoặc BẤT KỲ người đã đăng nhập khi project công khai, chưa lưu trữ, không bị kiểm duyệt ẩn và chủ còn hoạt động. Chỉ dùng cho endpoint ĐỌC lịch sử (nhánh, commit, tag, diff, đóng góp); nháp, ghi/sửa/xoá, cộng tác viên, bình luận và audio vẫn dùng `assertCanView`/`assertCanEdit`/`assertOwner`. Project riêng tư chỉ chủ và cộng tác viên thấy, không lên Explore/ranking. Khách chưa đăng nhập chưa đọc được lịch sử (chỉ có endpoint đồ thị công khai).

### 4.2. Cấu trúc `commits.snapshot` / `drafts.snapshot` (jsonb)
Xem chi tiết đầy đủ + lý do: `docs/decisions/STAVE_NhomF_JSONB_RLS_DaChot.md`. Tóm tắt:
- `notes[]` là **mảng phẳng** (không lồng trong track), mỗi note có `trackId` tham chiếu ra track.
- `start`/`duration` là **số nguyên tick** (không dùng float giây/beat) — bắt buộc để diff so sánh `===` chính xác.
- Luôn có `schemaVersion` ở gốc — commit cũ bất biến vĩnh viễn, code đọc phải biết version.
- `volume` (0–1) / `pan` (-1..1) khớp convention `Tone.Gain`/`Tone.Panner`.
- **Giới hạn đầu vào (DTO `update-draft` và `create-commit`, chốt 06/11/2026):** note `velocity` 1–127, `start` ≥ 0, `duration` ≥ 1; track `volume` 0–1 và `pan` −1…1; tối đa 32 track. **Số track tối thiểu là 0**: project mới bắt đầu với `tracks: []` (mặc định ở backend và editor), nên KHÔNG thêm `@ArrayMinSize(1)` vào `tracks` (làm hỏng tự động lưu nháp).
- **Draft scoped theo `branch_id`, không phải `project_id` trực tiếp** — mỗi branch có 1 draft riêng, chuyển branch = lưu draft cũ, khôi phục draft branch mới (business rule đã chốt từ soạn SRS). Project mới tạo tự động có sẵn 1 branch `main` mặc định (tạo trong module `projects`, xem PROJECT_STATE.md §3). **`GET|PUT /projects/:id/draft` thao tác trên branch ĐANG MỞ, không phải luôn luôn `main`** (đổi 16/09/2026 khi làm UC-48, xem PROJECT_STATE §35): branch đang mở = `projects.active_branch_id`, rơi về branch mặc định khi cột đó NULL — quy tắc này nằm ở `ProjectsService.getActiveBranchForOwner` và được lặp lại ở `BranchesService.getProjectBranches` (cờ `is_active`), sửa một chỗ phải sửa cả chỗ kia nếu không editor sẽ commit nhầm nhánh. Chỉ `POST /branches/switch` được ghi `active_branch_id`. Branch tạo qua UC-47 được `initializeDraftForBranch` gieo sẵn 1 draft từ commit gốc — KHÔNG tạo branch `main` mới cho project đã có sẵn, chỉ tạo thêm branch khác. **Khoá lạc quan của nháp (chốt 28/10/2026, PROJECT_STATE §119, §125):** phiên bản nháp = `drafts.updated_at`; `PUT /projects/:id/draft` và `POST /branches/switch` nhận phiên bản tab đã biết (header `X-Draft-Version` / trường `expectedDraftVersion`, `none` = chưa có nháp), lệch thì 409 `DRAFT_STALE` và không ghi (logic chung ở `backend/src/drafts/draft-write.ts`). Mọi đường ghi nháp phía máy chủ phải giữ phiên bản nhất quán: `create_commit_atomic` chỉ đổi `updated_at` khi nội dung nháp đổi; restore/chuyển nhánh/tạo nhánh trả phiên bản mới để editor đọc lại.

### 4.3. Database access pattern
- Backend NestJS dùng **`service_role` key** (bypass RLS) cho mọi nghiệp vụ chính.
- RLS trên toàn bộ 29 bảng là **lớp phòng thủ phụ** — đã áp dụng đầy đủ (xem `docs/decisions/STAVE_NhomF_JSONB_RLS_DaChot.md`). Không tắt RLS, không dùng `service_role` key ở frontend.
- **`commits` và `admin_audit_log` chỉ có policy SELECT + INSERT** — không có UPDATE/DELETE cho bất kỳ role nào. Đừng cố thêm migration để "sửa" 2 bảng này; nếu cần sửa dữ liệu sai, tạo bản ghi mới.
- `transactions`/`subscriptions` **không có policy INSERT/UPDATE cho client** — mọi thay đổi trạng thái thanh toán phải qua backend sau khi xác minh webhook PayOS.
- Cột `public.users.role` (`'user' | 'admin'`) là nguồn xác thực Admin duy nhất — không tạo cơ chế phân quyền song song khác.

### 4.4. AI trong dự án (mục 15.5, 10.6 Bible)
- **AI không sáng tác nhạc** — không tự tạo melody/chord/harmony.
- AI được phép: gợi ý commit message từ diff, cảnh báo merge risk, tóm tắt version, diễn giải quy tắc nhạc lý đã nhận diện bằng logic rule-based.
- **Toán học rule-based trước, AI chỉ viết câu giải thích sau** — không bao giờ để LLM tự quyết định điểm số/kết quả nghiệp vụ.
- **Gợi ý commit message (UC-70, `POST /ai/commit-message`, đã làm 06/11/2026):** server tự tính diff từ nháp và commit đầu nhánh (không nhận tóm tắt từ trình duyệt), chỉ gửi Gemini số lượng thay đổi, tên track (cắt 40 ký tự) và phạm vi ô nhịp (BR-80). Tham số tuỳ chọn `lang` (`en`|`vi`) chọn ngôn ngữ của prompt và của câu "cập nhật lớn" do code sinh; mặc định `vi`. Lỗi, thiếu khoá, quá hạn hoặc chạm trần tần suất thì trả `suggestion: null` với HTTP 200, không bao giờ chặn commit; trên 300 nốt hoặc 5 track thì không gọi AI.

### 4.5. Community Jam (mục 20.4 Bible)

- Chỉ 1 sự kiện tồn tại tại 1 thời điểm, chỉ Admin tạo.
- **Không áp version control trong lúc jam** — không commit/branch/merge cho tới khi kết thúc (đóng băng 1 lần).
- Đồng bộ dùng last-write-wins (không cần OT/CRDT) — sự hỗn loạn là chủ đích, không phải bug.
- Tham số (độ dài, cooldown...) đọc từ bảng `platform_settings` (RLS: SELECT công khai, ghi chỉ Admin).

### 4.6. Auth & Session pattern (chốt từ module Auth & Account — áp dụng cho mọi endpoint cần đăng nhập sau này)

- Auth provider là **Supabase Auth** — không tự viết JWT/bcrypt. Backend không bao giờ đọc/lưu plaintext password; `public.users.password_hash` luôn để `NULL` (cột legacy, không dùng).
- **"2 lớp session"**: Supabase JWT (access token) không thể thu hồi tức thời theo từng thiết bị qua API public. Vì vậy mỗi lần đăng nhập thật, backend tạo thêm 1 row `public.sessions` ("business session" riêng của STAVE, độc lập với refresh-token nội bộ Supabase). Mọi endpoint cần đăng nhập bắt buộc qua 2 guard theo thứ tự: `JwtAuthGuard` (validate token qua `getUser()` — gọi mạng, không decode local) rồi `SessionAuthGuard` (validate header `X-Session-Id` khớp row `sessions` còn `revoked_at IS NULL`). Revoke 1 thiết bị = set `revoked_at`, không xoá row.
- **Không bao giờ gọi `supabase.auth.signInWithPassword` (hay bất kỳ hàm nào làm thay đổi session nội bộ của GoTrueClient) trên `SUPABASE_ADMIN_CLIENT`** — đây là client dùng chung (DI singleton) cho toàn bộ request; gọi hàm đó sẽ rò session của 1 user vào state dùng chung, ảnh hưởng các request đồng thời khác. Muốn verify password: gọi thẳng REST `POST {url}/auth/v1/token?grant_type=password` bằng `fetch`, không đụng client dùng chung.
- **Không dùng `supabase.auth.admin.updateUserById(id, {password})` để đổi password của chính người đang gọi** — API này tự thu hồi luôn access token hiện tại của người gọi (đã verify thật), phá vỡ yêu cầu "giữ lại session vừa thao tác". Dùng `PUT {url}/auth/v1/user` (self-service, header `Authorization: Bearer <access_token của chính user>`) để đổi password mà vẫn giữ session hiện tại sống.
- Admin suspend/remove tài khoản người khác (không có JWT của họ): set `revoked_at` toàn bộ session của họ trong `public.sessions` (chặn app ngay lập tức) + `admin.updateUserById(id, {ban_duration: '87600h'})` (chặn đăng nhập mới). Giới hạn kỹ thuật thật: JWT access token đã phát hành trước đó của họ có thể còn "hợp lệ" ở tầng Supabase thuần tới khi hết hạn tự nhiên — chấp nhận được vì app luôn enforce qua `SessionAuthGuard` ở tầng business.

### 4.7. Design system (chốt từ phiên polish UI/UX 10/09/2026 — áp dụng cho mọi trang mới)

Nguồn cảm hứng phong cách: `docs/STAVE design component sample/*.pdf` (4 file mockup — chỉ tham khảo bố cục/màu/component, **không** copy tính năng/text tiếng Anh trong đó, xem giải thích đầy đủ trong prompt phiên đó). Muốn xem lại mockup: không có `pdftoppm`/ImageMagick sẵn trên máy dev — cài nhanh bằng `python3 -m pip install --user pymupdf` rồi `fitz.open(...).load_page(i).get_pixmap(dpi=110).save(...)` (đã dùng cách này để tự xem qua Read tool).

- **Token màu — hệ SEMANTIC theo vai trò, KHÔNG phải bảng màu đánh số** (viết lại 16/09/2026, xem PROJECT_STATE §26): định nghĩa ở `frontend/app/globals.css`, giá trị oklch trong khối `:root`, re-export sang Tailwind ở `@theme inline` (Tailwind 4, không có `tailwind.config.js` — sửa token thì sửa file này). Tên token mô tả VAI TRÒ: `background` / `surface` / `surface-subtle` / `surface-muted` (nền & bề mặt), `foreground` / `muted` (chữ), `border` / `border-strong` (viền), `accent` / `accent-hover` / `accent-muted` / `accent-foreground`, `success|warning|danger` (+ bản `-muted`), `metal` / `metal-muted` (trang trí), và **token chữ riêng** `success-foreground` / `warning-foreground` / `metal-foreground` (thêm 30/09/2026, PROJECT_STATE §60). **Chữ** đặt trên nền sáng/`-muted` dùng bản `-foreground` (`text-warning-foreground`…); bản gốc `success|warning|metal` chỉ dùng làm **nền/viền/chấm** — dùng làm chữ thì trượt tương phản (đo được 2.0–2.3:1). Mọi cặp chữ/nền phải ≥ 4.5:1 trên cả 3 theme; chọn giá trị oklch mới bằng cách tính trước (công thức OKLCH→sRGB→WCAG) rồi đo lại trong trình duyệt. Dùng `bg-surface`, `text-muted`, `border-border`… **Bảng cũ `accent-600`/`danger-50`… đã xoá hẳn — không dùng lại.** `rounded-card` (0.5rem) và `shadow-card` (`none` — thiết kế dùng viền 1px thay đổi bóng) là token riêng cho card.
- **Nguyên tắc dùng màu — accent là "small dose"**: diện tích lớn (nền trang, card, sidebar) LUÔN dùng nhóm trung tính; `accent` chỉ cho CTA chính, link, trạng thái đang chọn. Đây là bài học rút từ phản hồi thật của người dùng ("UI cũ màu mè") và từ kỹ thuật pha màu của bảng sơn Gundam PG Unleashed — xem PROJECT_STATE §26.
- **CHỈ CÒN MỘT GIAO DIỆN (chốt 04/11/2026, thay cho "theme đổi được lúc chạy UC-78"):** bộ màu "space" (nền tối) là bộ màu DUY NHẤT của app và là giá trị gốc của `:root` trong `globals.css`. Các preset cũ `unleashed` / `moss` / `claret` và tính năng chọn theme (thẻ "Cá nhân hoá" ở `/profile`, `theme-picker.tsx`) bị **loại bỏ hoàn toàn khỏi frontend**; không giữ lớp tương thích. Lý do: người dùng muốn làm lại tính năng tạo theme tuỳ chỉnh từ ảnh (UC-79) sau này, nên không giữ hệ preset cũ. Backend (`PATCH/PUT /users/me/theme`, bảng `themes`, cột `users.active_theme_id`, `PRESET_THEME_KEYS`) **để nguyên, ngủ đông** cho UC-79; frontend không còn gọi và bỏ qua mọi giá trị theme đã lưu. Bảng màu track (`TRACK_COLORS`) và màu diff bất biến vẫn giữ nguyên. BR-90 vẫn là ràng buộc cho theme tuỳ chỉnh sau này: chỉ đổi màu trang trí, không ghi đè `accent`/`success`/`warning`/`danger`.
- **Khung điều hướng (chốt 04/11/2026):** trang công khai (landing, đăng nhập, Explore, Rankings, Creator) dùng thanh ngang; **trang sau đăng nhập dùng thanh bên** (`AppShell`; < 900px thành ngăn kéo); **trình soạn nhạc không có thanh bên**, dùng một thanh ngang thiết kế mới của riêng nó (xem bullet editor). Danh sách mục điều hướng nằm ở MỘT file duy nhất.
- **Nền tối (chốt 04/11/2026, đã làm xong 05/11/2026).** Hướng thiết kế là **Staff Universe**: nền vũ trụ tối, commit là sao, nhánh là chòm sao. Prototype `frontend/redesign/` đã **xoá** sau khi chuyển hết sang app thật (PR #98–#104); nguồn chuẩn là `frontend/app/globals.css`. Bộ màu tối là giá trị gốc của `:root`; **không có** thuộc tính `data-theme`, không class `dark:`, không công tắc sáng/tối. `gsap` 3.12.5 và `three` 0.160 (tải động) đã được duyệt. Màu `accent`/`success`/`warning`/`danger` giữ nguyên sắc và ý nghĩa, chỉ chỉnh độ sáng để đạt tương phản ≥ 4.5:1. Màu diff bất biến, dùng **token `--diff-add` / `--diff-remove` / `--diff-modify`** (kèm `-muted`, `-foreground`) mặc định trỏ tới `success` (xanh lá, thêm), `danger` (đỏ, nét đứt, bỏ), `warning` (hổ phách, đổi velocity); mọi nơi hiển thị diff phải dùng token diff, không dùng `success`/`danger`/`warning` trực tiếp (các bản ghi cũ ghi "xanh dương = thêm" là sai so với code). Ngoại lệ DUY NHẤT: công tắc "Chế độ cho người mù màu" (xem bullet IA `/profile`) đặt `data-cvd="on"` lên `<html>` và chỉ ghi đè 9 token diff sang xanh dương / cam đỏ / vàng. Hex cố định chỉ được phép ở: bảng màu track (dữ liệu người dùng) và logo Google (gói trong một component `GoogleLogo`). Cảnh 3D chỉ ở trang giới thiệu, Explore và đồ thị nhánh; editor và hợp nhất dùng nền sao nhẹ (Canvas 2D), có bản dự phòng khi không WebGL, màn dưới 900px và `prefers-reduced-motion`.
  - **Điều khoản "canvas MIDI Editor dùng nền tối zinc-900/950" (11/09/2026) ĐÃ HUỶ (16/09/2026).** Thực tế bản redesign đang dùng là nền SÁNG, và từ PROJECT_STATE §30 thì toàn bộ màu của editor đã trỏ vào hệ token chung nên nó đổi theo theme như phần còn lại của app. **Ngoại lệ duy nhất còn giữ hex cố định: bảng màu track** (`TRACK_COLORS` / `TRACK_COLOR_PALETTE`) — đó là DỮ LIỆU người dùng chọn (UC-34), không phải màu giao diện, đổi theme không được làm đổi màu track họ đã đặt.
  - Canvas (piano roll) không parse được `var()`/`color-mix()`: màu phải đi qua `lib/resolve-css-colors.ts` rồi mới gán cho `ctx.fillStyle`. Gán thẳng biểu thức CSS thì canvas **im lặng giữ màu cũ**, lỗi hiện ra dưới dạng "màu sai" chứ không phải exception.
- **Font**: `next/font/google` — `Inter` (`--font-stave-sans`, dùng cho toàn bộ UI text) và `JetBrains Mono` (`--font-stave-mono`, dùng riêng cho: tên file `.mid`, ID/UUID, timestamp kỹ thuật, số liệu thống kê nổi bật kiểu `24.1k`). Set ở `frontend/app/layout.tsx`. Yêu cầu mạng lúc build (font tải về self-host, không phải CDN runtime) — chấp nhận được vì Vercel/CI đều có mạng lúc build.
- **Icon**: `lucide-react` (đã thêm dependency, đã hỏi & được đồng ý — trước đó chưa có thư viện icon nào). Không tự thêm icon library thứ 2 mà không hỏi.
- **Component dùng chung** ở `frontend/components/ui/`: `Card`, `Badge` (variant `neutral/info/success/warning/danger`), `Button` (variant `primary/secondary/ghost/danger`), `Avatar` (màu suy ra tất định từ hash id qua `lib/avatar-color.ts` — **không** `Math.random()`), `PageHeader` (title + breadcrumb + action), `EmptyState`, `Tabs`/`TabPanel`, `ProjectThumb` (placeholder màu/icon tất định theo id project — không phải waveform giả), `Logo`, `form.tsx` (`Field` + `INPUT_CLASS` dùng chung mọi input/textarea/select), `dialog.tsx` (`Dialog` / `DialogError` / `DialogActions`), `confirm-dialog.tsx` (`ConfirmDialog`, có prop `error`, `confirmDisabled`), `toast.tsx` (variant `danger` tự là `role="alert"`).
- **Hộp thoại (chốt 30/09/2026, PROJECT_STATE §56):** mọi hộp modal dùng `Dialog` (Tailwind) hoặc `redesign/modal.tsx` (editor, inline style) — cả hai dựa trên hook `lib/use-dialog.ts` (`useDialog`: Esc chỉ đóng hộp trên cùng, giữ Tab trong hộp, focus ban đầu `[data-autofocus]`, trả focus, khoá cuộn `<main>`). Hộp tự dựng (vd `MergeConflictDialog`, `CommitCompare`, `ExportDialog`) phải gắn ref của `useDialog` + `role="dialog"` + `aria-modal` + `aria-labelledby` + `tabIndex={-1}`. Lỗi của thao tác trong hộp hiện **trong hộp** (`DialogError`/`ModalError`), không đặt ở trang phía sau. Phím tắt toàn cục (editor) phải bỏ qua khi `isDialogOpen()`. Nội dung người dùng đang gõ trong hộp (vd nội dung commit) giữ ở state của cha để đóng/mở lại không mất.
- **Thông báo lỗi (chốt 30/09/2026, §57):** không bao giờ `setError(err.message)` trần. Lỗi từ backend dùng `apiErrorMessage(err, "<câu dự phòng theo ngữ cảnh>")`, lỗi Supabase Auth dùng `authErrorMessage(error)` — cả hai ở `lib/error-message.ts`. Backend thêm thông điệp mới → thêm vào bảng `API_MESSAGES` trong file đó. Vùng hiện lỗi có `role="alert"`; thao tác thất bại không bao giờ im lặng (`catch {}` nuốt lỗi là bug).
- **Chữ và ô nhập (chốt 30/09/2026, §60):** chữ giao diện tối thiểu 12px (`text-xs`) — không dùng `text-[9px|10px|11px]`; riêng thanh công cụ editor cho phép 11px để giữ 1 hàng. `Button` 13px. `INPUT_CLASS`/`AUTH_INPUT_CLASS` là `text-base sm:text-[13px]` (16px trên mobile để iOS không tự phóng to). Ô nhập có `name` + `autoComplete` đúng loại (`email`, `current-password`, `new-password`… hoặc `off`), ô tìm kiếm `type="search"`. Kiểm tra độ dài/định dạng bằng code + câu tiếng Việt, **không** dùng `minLength` (trình duyệt chặn bằng câu tiếng Anh trước). Chuỗi đang tải dùng `…` (một ký tự), không `...`. Locale lấy từ `APP_LOCALE` (`lib/format-date.ts`), không ghi cứng `"vi-VN"`.
- **Focus:** `globals.css` có quy tắc `:focus-visible` toàn cục (viền 2px accent) trong `@layer base` — đừng đặt nó ngoài layer (sẽ đè các utility `focus:outline-none` của Tailwind). Không viết `outline: "none"` inline mà không có thay thế. Layout gốc có skip link "Bỏ qua tới nội dung chính" → `<main id="main">`.
- **Tiêu đề tab (chốt 30/09/2026, §58):** Next 16 chỉ cho `metadata` ở Server Component, mà mọi `page.tsx` đều là client → mỗi route có 1 `layout.tsx` server chỉ để khai `metadata.title` (`return children`). Root dùng template `"%s · STAVE"`; layout **cha** của route con (vd `projects`, `projects/[id]`, `profile`) phải khai `{ default, template: "%s · STAVE" }`, nếu khai chuỗi thường thì route con mất đuôi "· STAVE". Route mới → thêm `layout.tsx` tương tự. Auth 4 trang dùng riêng `frontend/components/auth-card.tsx` (`AuthCard`/`AuthField`/`AuthDivider`/`GoogleButton`) vì layout khác hẳn phần còn lại của app (card căn giữa full-height, không phải nội dung trong `PageHeader`).
- **Placeholder ảnh project card**: đã chốt cùng người dùng — block gradient màu nhạt tất định theo hash id project (`ProjectThumb`, cùng cơ chế hash với `Avatar`), **không** vẽ waveform/bar-chart giả (mockup dùng ảnh bar-chart ngẫu nhiên làm placeholder — project thật chưa có dữ liệu âm thanh nào để biểu diễn, vẽ giả sẽ là bịa dữ liệu).
- **Quy ước placeholder có text**: bất kỳ chỗ nào UI hiển thị cho 1 tính năng CHƯA xây dựng thật (nút Fork ở `/explore/[id]`, nút "Mở Editor" ở project card, khối "Nghe thử") — text phải ghi rõ chữ **PLACEHOLDER** (VD: "Fork / Remix (PLACEHOLDER)", "PLACEHOLDER — tính năng phát nhạc chưa được xây dựng") để xoá dễ sau này, không viết câu văn hoa mỹ che giấu việc đó là placeholder.
- **IA `/profile`**: layout settings 2 cột (nav trái + panel phải) với 2 tab — Hồ sơ (info + avatar), Bảo mật (đổi mật khẩu + link `/profile/sessions` + xoá tài khoản); tab Cá nhân hoá đã bỏ (04/11/2026). **Accessibility (chốt 05/11/2026):** trang cài đặt có thêm mục Accessibility, bắt đầu bằng công tắc "Chế độ cho người mù màu" (đổi màu diff sang bộ an toàn cho mù màu đỏ-lục, kèm dấu +/− không phụ thuộc màu); **đã làm** (tab thứ ba của `/profile`, công tắc `role="switch"`, `components/ui/switch.tsx`, `context/accessibility-context.tsx`, `lib/color-vision.ts`). Giá trị lưu ở trình duyệt (`localStorage`), chưa đồng bộ theo tài khoản; đây KHÔNG phải theme và không dùng lại hệ preset đã gỡ. Đã chốt cùng người dùng, không tự đổi lại thành 1 trang dài.
- **Trình soạn nhạc toàn màn hình (chốt 30/09/2026, §59):** `/projects/:id/edit` chỉ chứa `MidiEditor` — không `PageHeader`, không tab; form sửa tên/mô tả/thể loại nằm ở trang **Cài đặt dự án**. Route editor được nhận diện bằng `isEditorPath` ở `components/shell/nav-items.ts` (regex `^/projects/[^/]+/edit$`, một chỗ duy nhất) và dùng `EditorBar` thay cho mọi thanh điều hướng khác (từ G1, 05/11/2026). Thanh công cụ editor: `flexWrap: "wrap"`, **không** `overflowX: auto` (không bao giờ giấu nút sau thanh cuộn); nhóm tệp nằm trong menu **File ▾**, nhóm chỉnh sửa (Select all, Copy, Cut, Paste, Quantize) nằm trong menu **Edit ▾** cạnh Undo/Redo (đổi 28/10/2026 khi thanh công cụ bị xuống 2 hàng ở 1280px, PROJECT_STATE §130); nút chỉ có biểu tượng phải có `aria-label`. Thêm nút mới vào thanh công cụ thì đo lại ở 1280px; không vừa 1 hàng thì đưa vào menu thay vì để xuống hàng. Nhãn nút editor theo ngôn ngữ đang chọn (EN | VI) qua `useT`, **không** còn quy định giữ tiếng Anh (người dùng chốt 05/11/2026: nhãn tiếng Việt như "Hoàn tác" là hợp lệ); thuật ngữ commit, MIDI, velocity, quantize, piano roll, track có thể giữ nguyên tiếng Anh trong bản VI. Tiêu chí bố cục: piano roll ≥ 400px cao ở 1366×768, thanh công cụ 1 hàng ở ≥ 1280px. Panel Tracks/Lịch sử ẩn/hiện được; < 768px hiện dải báo "cần màn hình rộng hơn". **Cập nhật 04/11/2026:** editor KHÔNG dùng thanh bên của `AppShell`; thay `SiteHeader` thấp bằng một thanh ngang mới thiết kế riêng cho editor (tên dự án, nhánh, trạng thái lưu, thoát về dự án), vẫn nhận diện theo regex `^/projects/[^/]+/edit$`.
- Tên dự án trong mọi danh sách trỏ tới trang chi tiết `/projects/:id` (kiểu GitHub); vào editor bằng nút riêng "Mở Editor".
- **Không bao giờ hiển thị mã UC-xx / BR-xx cho người dùng** (chốt 30/09/2026, §64): không trong chữ, `title`, `aria-label`, `placeholder`, thông điệp lỗi backend. Mã chỉ được nằm trong **comment** (giữ để truy ngược SRS). Kiểm bằng scanner TypeScript chỉ duyệt string/JSX text (cách làm ở PROJECT_STATE §64).
- **Trợ giúp editor** ở `components/midi-editor/redesign/help-dialog.tsx` (khái niệm + bảng phím tắt, mở bằng nút ? hoặc phím ?). Thêm/đổi phím tắt ở `midi-editor.tsx` thì cập nhật bảng trong file này và tooltip tương ứng. Màn lỗi tải dữ liệu luôn có hành động khôi phục ("Thử lại" + lối về trang trước).
- Không dùng `tailwind.config.js`/`.ts` — Tailwind 4 dùng CSS-first config (`@theme` trong `globals.css`). Nếu thấy ai thêm file config JS song song, đó là dư thừa/xung đột, không phải chuẩn dự án.
- **Cảnh báo đã gặp thật (10/09/2026):** các file `.dc.html` trong `docs/STAVE design component sample/` là artboard **tĩnh, kích thước cố định** (VD `width:1240px`, `viewport` meta có nhưng **0 media query** — đã tự grep xác nhận). Đây chỉ là 1 khung ảnh chụp ở 1 độ rộng, KHÔNG phải trang responsive thật — không suy ra tỷ lệ cột/container từ đó. Layout thật của app phải tự chạy mượt từ điện thoại tới màn ultra-wide (16:9/21:9/31:9), không neo theo đúng bề ngang ảnh mockup.
- **Mọi danh sách project dùng row-list kiểu GitHub, KHÔNG dùng card-grid.** Dùng `frontend/components/ui/row-list.tsx` (`RowList` / `RowHeader` / `RowItem` / `RowTitle` / `RowStat` / `RowTime`). Mỗi trang khai 1 hằng `COLS` và truyền cho **`RowList cols={COLS}`** — `RowList` là grid duy nhất, `RowHeader`/`RowItem` dùng CSS `subgrid` và **không nhận `cols`** (đổi 30/09/2026, §61: trước đó mỗi hàng là 1 grid riêng nên cột `auto` co giãn khác nhau giữa tiêu đề và dữ liệu, lệch tới 233px). Cột `auto` (cột nút hành động) nhờ vậy được tính chung cho cả danh sách. Không đặt `gap` riêng cho hàng ở `md` khác `md:gap-x-3` (subgrid chia đôi chênh lệch gap → lệch 2px). Cột thời gian (`RowTime`) rộng 96px. Đừng canh cột bằng padding tay. `RowTitle` cố ý chỉ chứa MỘT phần tử tương tác (tên là link, dòng phụ là text) để không lồng link/button vào nhau. File `card-grid.ts` cũ (`CARD_LIST_CLASS`/`CARD_GRID_CLASS`) và `project-card.tsx` **đã xoá** (xem PROJECT_STATE §28).
- **Container trang nội dung rộng dùng token `max-w-page`** (`--container-page: 105rem` ~1680px, khai ở `globals.css`) — áp cho `SiteHeader`/`SiteFooter`/`explore`/`projects`/`creator/[id]`/`rankings`/2 section list ở Home. **KHÔNG dùng `max-w-7xl`/`max-w-5xl` tay cho các trang này nữa** — từng thử `max-w-7xl` (1280px) trước, người dùng phản hồi thật trên màn 1920px vẫn thấy "không khác biệt" vì độ nới quá nhỏ so với màn hình thật; `max-w-page` nới rõ rệt hơn hẳn. Trang dạng form/đọc tuyến tính (`/profile`, `/projects/new`, `/projects/[id]/settings`, phần giới thiệu của Home) **vẫn giữ nguyên hẹp** (`max-w-sm/3xl/5xl`) — chủ đích cho dễ đọc, không phải lỗi cần nới giống các trang list.

### 4.8. Custom Sound (chốt 16/09/2026 — chi tiết + lý do: `PROJECT_STATE.md` §36-J)

- **Mapping nằm trong snapshot**: `tracks[].soundMap: { "<cao độ 0-127>": "<custom_sound_id>" }`, `schemaVersion` 3. 1 sound ↔ 1 cao độ trên 1 track, phát nguyên mẫu (kiểu pad trống). **Bảng `sound_mappings` KHÔNG phải nguồn dữ liệu** — chỉ là chỉ mục tham chiếu phái sinh (thêm `branch_id`/`commit_id`), cập nhật ở mọi đường ghi snapshot (autosave, commit, restore, merge, switch, tạo nhánh, fork).
- Thêm `soundMap` phải khai ở **cả 3 DTO** ghi snapshot + mọi chỗ chép snapshot bằng tay (xem gotcha `whitelist` ở mục 10), và dọn các chỗ còn ghi cứng `schemaVersion: 1` trước khi tăng version.
- **Xoá sound không sửa draft/commit nào** — phân giải lúc phát: sound phát được trong project P ⇔ sound còn tồn tại VÀ (`deleted_at IS NULL` HOẶC chủ P ≠ chủ sound); không phát được thì rơi về nhạc cụ của track + UI báo.
- **2 kiểu xoá do chủ chọn:** "xoá cho bản thân" (set `deleted_at`, file giữ cho project của NGƯỜI KHÁC, tự dọn khi hết tham chiếu từ người khác — tham chiếu từ project của chính chủ không giữ file sống) và "xoá hoàn toàn" (xoá ngay, bản fork cũng mất tiếng, báo trước số project bị ảnh hưởng). Xoá tài khoản / admin gỡ vi phạm luôn xoá hoàn toàn.
- Dọn file bằng **hàm Postgres gọi qua RPC** (khoá dòng), không ghép nhiều lệnh supabase-js. Xoá dòng DB trước, file Storage sau, kèm quét file mồ côi. File đã "xoá cho bản thân" không tính hạn mức của chủ.
- Không phân biệt Free/STAVE+ cho Custom Sound — thứ duy nhất tính phí là cá nhân hoá (UC-79).
- **Hạn mức 50MB/người** (chốt 04/10/2026), đọc từ `platform_settings.custom_sound_quota_bytes` — không ghi cứng trong code. Admin sẽ chỉnh qua giao diện admin (chưa làm). Chỉ mục `sound_mappings` do **trigger** trên `drafts`/`commits` duy trì — không ghi bảng này từ backend. Migration SQL lưu ở `backend/supabase/migrations/` (PROJECT_STATE §66).

## 5. Việc chưa chốt — hỏi lại người dùng khi code chạm tới

- ~~License hiển thị~~ — **đã chốt (05/11/2026)** theo mục 20.2 Bible: người dùng tự chọn CC-BY / CC-BY-SA / CC-BY-NC khi publish. Backend có kiểu `ProjectLicense`; giao diện chọn license chưa làm.
- ~~Kiến trúc AI Music Theory Insight (rule-based + RAG + Ollama tự host)~~ — **provider đã chốt Gemini API (16/09/2026)**, bỏ Ollama. Còn treo: Theory Insight có cần RAG hay chỉ rule-based + Gemini viết câu. Gemini lỗi/hết hạn mức thì bỏ qua phần AI, không bao giờ chặn commit/merge (Report 3 §4.2.2); tuân thủ chặt BR-80 (chỉ gửi tóm tắt diff + metadata).
- **Custom Sound** — thiết kế đã chốt đủ (xem 4.8, hạn mức 50MB đã chốt 04/10/2026). Còn treo duy nhất: hạ tầng khi 1GB free đầy (Supabase Pro hay Cloudflare R2).
- **UC-38 xuất MP3** — **đã làm** (28/10/2026, PROJECT_STATE §124) bằng `@breezystack/lamejs` (LGPL-3.0, người dùng đã chọn; ghi ghi công ở `frontend/public/instruments/CREDITS.txt`). Muốn đổi thư viện thì hỏi trước.
- Lọc Explore theo nhạc cụ — cơ chế chưa quyết (quét JSONB hay denormalize).
- Switch ngôn ngữ EN/VI — **đã làm ở bản chính thức (PR #82/#83/#87/#88, không dùng thư viện):** giao diện mặc định tiếng Anh, có nút chuyển sang tiếng Việt, từ điển `frontend/lib/i18n/{en,vi}.ts`, hook `useT`, khoá lưu `stave-lang`. Thuật ngữ commit, MIDI, velocity, quantize, piano roll, track, fork, pull request giữ nguyên tiếng Anh được; nhãn nút editor cũng theo ngôn ngữ (không còn ngoại lệ). Thêm chuỗi mới phải có ở cả hai file.
- **Điều hướng và trang chủ (chốt 04/11/2026, đã làm ở bản chính thức):** logo STAVE luôn trỏ tới `/`. Route `/` đổi nội dung theo đăng nhập: chưa đăng nhập = landing giới thiệu; đã đăng nhập = homepage trung tâm điều hướng (tiếp tục làm việc, dự án gần đây, thông báo, Explore, Jam, lối tắt); đã đăng nhập vẫn xem lại landing qua "Take the tour" (`/welcome`). Sau đăng nhập chuyển về `/` thay vì `/projects`. Ràng buộc kỹ thuật: phiên Supabase hiện chỉ ở trình duyệt (không `middleware`/cookie SSR), nên `/` chỉ đổi được sau khi client đọc phiên (có nháy); muốn sạch phải đổi cách lưu phiên sang cookie, việc đó đụng đường xác thực nên cần quyết riêng. **Gọi API ngay sau đăng nhập phải chờ phiên nghiệp vụ** (`X-Session-Id`, `stave_session_id`) bằng `lib/use-session-ready.ts`, nếu không GET đầu tiên trả 401; cờ chờ tối đa 8 giây rồi vẫn gọi để trang không kẹt. Các trang gọi API ngay khi mount sau đăng nhập (vd qua `?next=`) chưa được chặn; muốn gọn hơn cần phát tín hiệu từ `context/auth-context.tsx`.
- **Testing / Report 5 (cập nhật 28/10/2026, PROJECT_STATE §128–§129):** DB test **đã có** (project `drevszfpovyinzauwuou`, cấu hình ở `backend/.env.test` và `frontend/.env.test.local`, bị `.gitignore` chặn); đồng bộ schema từ production bằng `scripts/test-db/sync-schema.sh --reset` (cần Docker Desktop và `SUPABASE_ACCESS_TOKEN`; xoá toàn bộ dữ liệu DB test). Sau mỗi migration mới áp lên production phải chạy lại script này. E2E: `cd frontend && npx playwright test [file] [-g "<mã ca>"]` (Playwright tự dựng backend 3101 và frontend 3100; toàn bộ 24 file mất ~2 giờ, chạy nền). Công cụ Jest/Vitest/Playwright đã dùng; `@nestjs/throttler` đã được thêm (người dùng duyệt). Thêm thư viện test hay tạo project Supabase mới vẫn phải hỏi trước. **`docs/Report5_Unit Test.xlsx` KHÔNG sửa** (nhóm đang điền; thay đổi cần gộp ghi vào file tạm ngoài repo để người dùng tự gộp); `docs/Report5_Unit Test.xls` là file hỏng, bỏ qua; `docs/Report5_Test Report.xlsx` được sửa tự do (ghi Round 2/3 ở cột I–K, giữ tên tester Round 1 từng hàng).
- **Skill cải thiện giao diện — ĐÃ CÀI, ĐƯỢC DÙNG** (người dùng chốt 27/10/2026): `design-taste-frontend` (từ https://github.com/Leonxlnx/taste-skill.git, thư mục `skills/taste-skill`) và `ui-ux-pro-max` (từ https://github.com/nextlevelbuilder/ui-ux-pro-max-skill, thư mục `.claude/skills/ui-ux-pro-max`), cài ở `~/.claude/skills/` (ngoài repo). Đã đọc và kiểm tra nội dung trước khi cài (không có gì đáng ngờ). Thứ tự dùng khi làm giao diện, **xịn nhất trước, giảm dần** (xếp hạng tạm theo năng lực đọc từ SKILL.md, chưa đo trong dự án; điều chỉnh sau lần dùng thật): 1) `impeccable`, 2) `design-taste-frontend`, 3) `ui-ux-pro-max`, 4) `frontend-design-audit`, 5) `web-design-guidelines` (rẻ nhất, luôn chạy làm cổng cuối cho mọi thay đổi giao diện). Thay đổi nhỏ không bắt buộc chạy hết cả 5; chạy từ trên xuống tới mức đủ cho quy mô thay đổi và ghi vào PROJECT_STATE skill nào đã chạy.
  - **Quy tắc phá design system 4.7 (thay cho quy tắc cấm cũ):** các skill này ĐƯỢC PHÉP đề xuất thay đổi design system, nhưng trước khi sửa phải trình cho người dùng: (a) điểm xấu của thiết kế cũ, (b) điểm tiên tiến hơn của thiết kế mới, (c) chờ người dùng **xác nhận** rõ ràng. Chưa có xác nhận thì không sửa token, component dùng chung hay bản sắc đã chốt. Khi được xác nhận thì cập nhật luôn mục 4.7 cho khớp.

## 6. Lệnh chạy dev (điền khi setup xong)

```bash
# Frontend
cd frontend && npm run dev

# Backend
cd backend && npm run start:dev

# Docker (toàn bộ stack local)
docker-compose up
```

## 7. Biến môi trường & bí mật — REPO NÀY LÀ PUBLIC

Repo public (không private) — `.gitignore` chặn `.env` là điều kiện cần nhưng KHÔNG đủ (chặn được lỡ tay `git add .`, không chặn được lỡ tay `git add -f` hay paste nhầm key thật vào file khác). Bắt buộc đủ 3 lớp:

1. **`.gitignore` (đã có ở gốc repo từ lúc khởi tạo):**
   ```
   .env
   .env.*
   !.env.example
   ```
   Chỉ `.env.example` (giá trị để trống) được commit — KHÔNG BAO GIỜ file `.env`/`.env.local` chứa giá trị thật.

2. **Secret thật đặt ở nơi quản lý riêng, không nằm trong bất kỳ file nào trong repo:**

   | Secret | Đặt ở đâu |
   |---|---|
   | `SUPABASE_SERVICE_ROLE_KEY`, `PAYOS_CLIENT_ID`, `PAYOS_API_KEY`, `PAYOS_CHECKSUM_KEY`, `GEMINI_API_KEY` | Railway → Environment Variables |
   | Biến build-time cho frontend | Netlify → Environment variables (dự kiến; trước đó dự định Vercel) |
   | Biến dùng trong CI (`.github/workflows/ci.yml`) | GitHub repo → Settings → Secrets and variables → Actions, gọi qua `${{ secrets.TEN_BIEN }}`, không hardcode |

3. **Bật ở GitHub (Settings → Code security):** **Secret scanning** + **Push protection** — chặn thẳng ở lệnh `git push` nếu phát hiện pattern giống key/token, thay vì phát hiện sau khi đã lên public.

   Khuyến nghị thêm (không bắt buộc): cài **gitleaks** qua pre-commit hook (husky) để chặn ngay tại máy dev trước khi kịp push — hữu ích cho nhóm 5 người, tránh trường hợp ai đó paste nhầm giá trị thật vào `.env.example`.

**Ngoại lệ — biến này ĐƯỢC PHÉP public, không phải lỗi:** `NEXT_PUBLIC_SUPABASE_ANON_KEY` thiết kế để lộ ra trong bundle JS gửi tới trình duyệt người dùng — an toàn nhờ RLS đã áp dụng đầy đủ (xem `docs/decisions/STAVE_NhomF_JSONB_RLS_DaChot.md`). Đừng nhầm lẫn giấu luôn biến này.

Danh sách biến cần điền (giá trị thật KHÔNG bao giờ vào file):

```
# frontend/.env.local (ví dụ .env.example — để trống)
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_API_URL=

# backend/.env (ví dụ .env.example — để trống)
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
PAYOS_CLIENT_ID=
PAYOS_API_KEY=
PAYOS_CHECKSUM_KEY=
GEMINI_API_KEY=
```

`GEMINI_API_KEY` **chỉ ở backend** — không bao giờ tạo biến `NEXT_PUBLIC_GEMINI_*`, không gọi Gemini từ trình duyệt.

## 8. Quy tắc Git (nguồn: `STAVE_Git_Rules.docx`, bắt buộc cho toàn bộ nhóm, không ngoại lệ)

### 8.1. Nguyên tắc tối cao
- **KHÔNG bao giờ push thẳng lên `main`** — mọi thay đổi vào `main` chỉ qua Pull Request đã được review.
- Luôn `pull main` mới nhất **VỀ TRƯỚC** khi tạo nhánh mới cho task tiếp theo.
- Mỗi nhánh chỉ phục vụ đúng 1 task — không gộp nhiều việc không liên quan vào 1 nhánh.
- PR phải có ít nhất 1 người KHÁC review & approve — **người tạo PR không tự merge PR của mình** (kể cả PR 1 dòng, kể cả sát deadline — đây là cơ chế QA duy nhất của nhóm 5 người).
- Secret thật (API key, `service_role` key...) không bao giờ được commit — repo public.

### 8.2. Đặt tên nhánh
Đúng 1 trong 3 tiền tố sau, viết thường + `/` + mô tả kebab-case tiếng Anh (3-6 từ, đủ hiểu task mà không cần mở PR):

| Tiền tố | Dùng khi nào | Ví dụ |
|---|---|---|
| `feature/` | Xây chức năng mới, chưa từng có trước đó | `feature/branch-merge-algorithm`, `feature/user-profile-page` |
| `bugfix/` | Sửa lỗi trên chức năng đã tồn tại | `bugfix/commit-timestamp-wrong-timezone`, `bugfix/login-form-validation-crash` |
| `test/` | Chỉ thêm/sửa test, không đổi logic nghiệp vụ | `test/version-control-unit-tests`, `test/auth-integration-tests` |

- KHÔNG dùng tên chung chung: `feature/update`, `bugfix/fix`, `test/test1`.
- KHÔNG tự thêm tiền tố khác (`release/`, `hotfix/`, `chore/`, `docs/`...) trừ khi cả nhóm thống nhất bổ sung — giữ đúng 3 tiền tố đã chốt.

### 8.3. Trước khi bắt đầu code (mỗi lần, kể cả quay lại task cũ)
- Tạo nhánh mới: `git checkout main && git pull origin main && git checkout -b feature/ten-mo-ta`.
- Đang code tiếp trên nhánh đã có sẵn: **KHÔNG** checkout `main` trước — merge `main` mới nhất vào nhánh đang code (mục 8.5). Lý do: 5 người code song song, tạo nhánh từ `main` cũ dễ conflict nặng hoặc ghi đè mất code người khác lúc merge ngược.

### 8.4. Commit
- 1 commit = 1 đơn vị thay đổi logic hoàn chỉnh, không dồn nhiều việc không liên quan.
- Message mô tả đúng hành động, thì hiện tại/mệnh lệnh (`Add`, `Fix`, `Implement` — không viết `Added`, `Fixed`).
- Không commit message rỗng nghĩa (`update`, `fix`, `wip`, `asdf`) kể cả commit tạm.

### 8.5. Pull Request & xử lý conflict
- Trước khi mở PR: `git checkout feature/ten-nhanh && git pull origin main` — xử lý conflict tại đây, không để reviewer/GitHub tự báo.
- Mô tả PR bắt buộc: task làm gì, cách reviewer tự test/verify, có ảnh hưởng schema DB/API contract module khác không.
- Conflict: xoá 3 dòng đánh dấu (`<<<<<<<`/`=======`/`>>>>>>>`) sau khi tự sửa đúng, `git add . && git commit -m "Resolve conflict with main" && git push`. Conflict trong business logic phức tạp (không chỉ khác import/format) → hỏi trực tiếp người đã merge phần gây conflict trước khi tự quyết định giữ đoạn nào.

### 8.6. Bảo mật (repo public)
- Secret thật chỉ đặt ở Railway/Netlify Environment Variables hoặc GitHub Actions Secrets — không bao giờ trong file nào của repo (khớp mục 7 ở trên).
- Không dùng `git add -f` để ép add file `.env`.
- Bị gitleaks pre-commit hook chặn là tín hiệu đúng — không tìm cách vượt qua (VD: `--no-verify`).
- Lỡ commit secret thật: báo ngay cả nhóm, **rotate key ngay lập tức** trên Supabase/Railway/PayOS — xoá dòng code ở commit sau KHÔNG đủ vì key cũ đã lộ vẫn dùng được tới khi bị thu hồi.

### 8.7. Sau khi merge — KHÔNG xoá nhánh
**Không bao giờ xoá nhánh nào** (local lẫn GitHub, kể cả nhánh đã merge hoặc nhánh cũ đã bị thay thế) — quyết định của người dùng 04/10/2026, thay cho quy tắc "Delete branch" cũ. Claude không tự xoá và không đề xuất xoá. Sau khi merge chỉ cần `git checkout main && git pull origin main`. Nhánh cũ có commit "ahead" nhưng tính năng đã có trên `main` (vd `feature/UC36…`, `UC38…`, `UC40…`, `copy-pattern-uc32`, `vantri`) thì ghi nhận là "đã thay thế", để nguyên.

## 9. Quy tắc chạy/test khi làm việc với Claude Code

- Sau khi code xong và tự test xong (dev server, `npm run dev`/`start:dev`, docker-compose, bất kỳ tiến trình nền nào Claude tự khởi động để test), **Claude phải tự kill toàn bộ tiến trình đó trước khi kết thúc lượt trả lời** — không để server/process chạy nền lại cho người dùng. Người dùng sẽ tự chạy lại thủ công khi cần test tiếp.
- **Claude KHÔNG tự `git commit`/`git push`, kể cả khi người dùng nhờ "cho lệnh để commit/push"** — mặc định luôn hiểu là đưa ra đoạn lệnh (text) để người dùng tự copy và tự chạy, không phải tự thực thi. Chỉ thực thi git commit/push khi người dùng ra lệnh rõ ràng, dứt khoát là muốn Claude tự chạy (VD: "commit giúp tôi", "push đi") — không suy diễn từ câu chung chung. Đã có bài học thật: hiểu nhầm "cho tôi set lệnh để commit và push" thành yêu cầu tự thực thi, tự tạo nhánh + 4 commit + push lên GitHub dù người dùng chỉ muốn nhận lệnh để tự chạy — phải revert lại bằng `git reset --soft`/xoá nhánh remote.
- **Test tự động không bao giờ ghi vào DB production `gwbiwweeznbuqfgawywv`** (integration/E2E tạo user, project, commit — `commits` không xoá được nên rác nằm vĩnh viễn). Chạy trên DB test riêng; E2E chạm tới production (nếu bắt buộc) thì chặn mọi request ghi như quy trình đo UX ở mục 11. Đặt tên test trùng mã test case trong file xls Report 5 (`UTCIDxx`, `PRJ-05`…) để đếm kết quả từ output, không gõ tay.
- **Dùng các skill đã cài khi chúng nâng được chất lượng đầu ra** (chốt 26/10/2026): xem danh sách skill hiện có trong phiên và gọi qua `Skill` khi khớp việc đang làm, không chờ người dùng nhắc. Mặc định: sau mỗi nhóm thay đổi lớn chạy `code-review` (và `security-review` nếu chạm auth, phiên, quyền, DB, file/Storage); thay đổi giao diện chạy `web-design-guidelines`; viết/sửa test hoặc bổ sung kiểm thử tham khảo `engineering:testing-strategy`; lỗi khó tìm nguyên nhân dùng `engineering:debug`; thay đổi schema/quyết định kiến trúc lớn dùng `engineering:architecture` hoặc `engineering:system-design`. Skill chỉ để nâng chất lượng, không thay các quy tắc ở file này (không tự commit, không tạo nhánh, không thêm thư viện khi chưa hỏi). Ghi vào PROJECT_STATE skill nào đã dùng và phát hiện nào đã sửa.
- **Không thêm comment không cần thiết vào code** (yêu cầu của người dùng 30/09/2026): không đoạn giải thích lý do, không mã phát hiện kiểu `M6-40`/`§51`, không doc-comment chỉ nhắc lại tên prop. Lý do/bối cảnh ghi vào PROJECT_STATE hoặc câu trả lời. Comment có sẵn giữ nguyên, trừ khi đã sai.
- **Claude KHÔNG bao giờ tự tạo nhánh/worktree mới, kể cả khi người dùng nhờ code/fix trực tiếp** — đã đổi so với quy tắc cũ ("hỏi trước hoặc dùng lại nhánh có sẵn"): giờ mặc định luôn là **code thẳng tại chỗ, trên đúng nhánh/thư mục hiện tại đang đứng** (`git branch --show-current` ra gì thì sửa file ngay trên đó), không tự `git worktree add`/`git checkout -b` dưới bất kỳ lý do gì (kể cả "để tách biệt an toàn"). Người dùng sẽ tự tạo nhánh mới và tự `git add`/`commit`/`push` khi họ muốn — Claude chỉ đưa lệnh gợi ý (tên nhánh, commit message) khi được hỏi, không tự thực thi git commit/push (giữ nguyên quy tắc ở gạch đầu dòng trên).

## 10. Gotcha (cập nhật dần khi gặp)

- **`pkill -f "next dev"` / `pkill -f "nest start"` qua Git Bash KHÔNG đáng tin trên máy Windows này** — đã gặp thật: sau khi gọi `pkill`, server vẫn còn sống (verify bằng `Get-NetTCPConnection -LocalPort 3000,3001` qua PowerShell vẫn thấy `Listen`). Lý do: `npm run dev`/`start:dev` spawn qua `cmd.exe /c`, tiến trình `node.exe` con không khớp pattern regex của `pkill` theo cách Git Bash nhìn thấy process tree. **Cách kill đáng tin cậy**: PowerShell — `Get-NetTCPConnection -LocalPort 3000,3001 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique` để lấy đúng PID đang nghe cổng, rồi `Stop-Process -Id <pid> -Force`. Luôn verify lại bằng `Get-NetTCPConnection -LocalPort ... -State Listen` (không có output = đã sạch) trước khi coi là xong theo CLAUDE.md mục 9 — đừng chỉ tin vào exit code của `pkill`.
- **`service_role` có thể thiếu GRANT ở tầng Postgres dù RLS đúng.** RLS bypass và GRANT bảng là 2 cơ chế độc lập — từng gặp cả 29 bảng bị `permission denied for table X` dù RLS đã cấu hình đúng từ đầu, vì role `service_role` chưa từng được `GRANT` trên schema `public`. Nếu backend đột nhiên báo `permission denied` dù RLS/policy trông đúng, kiểm tra `has_table_privilege('service_role', 'public.<table>', 'SELECT')` trước khi nghi ngờ RLS.
- **Các client Supabase khởi tạo ở module scope (top-level, VD `frontend/lib/supabase-browser.ts`) sẽ crash cả build** nếu dùng `process.env.X!` (non-null assertion) mà biến env vắng mặt lúc build (CI không có `.env.local`, hoặc Vercel preview chưa cấu hình env) — Next.js evaluate module của mọi client component lúc prerender tĩnh. Luôn fallback giá trị placeholder thay vì `!`.
- **CI (`ci.yml`) chạy `rm -f package-lock.json && npm install` (resolve fresh, không dùng lockfile)** — nghĩa là cài package bằng `npm install <pkg> --workspace=<ws>` ở máy dev là chưa đủ để chắc CI pass; phải kiểm tra `git show HEAD:<path>/package.json` sau khi commit để chắc chắn `dependencies` thật sự được stage đúng (từng có lần `package.json` trên máy đã đúng nhưng bản commit thiếu do stage trước khi cài xong).
- **Type TypeScript tự viết trong code (`interface XxxDbRow`, DTO...) không đảm bảo khớp schema DB thật — đừng bao giờ review/tin theo chỉ bằng cách đọc code.** Gặp thật ở module Version Control (11/09/2026): code dùng `commits.created_by` (cột thật là `author_id`), bảng `tags` (thật là `commit_tags`, không có cột `color`), và `branches.head_commit_id` được dùng 47 lần dù **chưa từng được tạo trong DB** — 6 agent review 2 vòng trước đều không bắt được vì chỉ đọc TypeScript. Trước khi review/sửa bất kỳ code nào thao tác DB trực tiếp (đặc biệt code chưa từng chạy thật lần nào), luôn tra `list_tables`/`information_schema.columns` thật trước, không suy diễn từ type code tự khai.
- **Thêm cột FK mới có thể tạo quan hệ 2 chiều gây ambiguous embed cho PostgREST.** Gặp thật khi thêm `projects.active_branch_id` (trỏ tới `branches`) trong khi `branches.project_id` đã trỏ tới `projects` — mọi query dạng `select('*, project:projects!inner(...)')` từ bảng `branches` bắt đầu lỗi `PGRST201` (nhiều hơn 1 đường quan hệ giữa 2 bảng). Tương tự khi bảng đã có sẵn nhiều FK cùng trỏ 1 chiều (VD `commits.branch_id` và `commits.merged_from_branch_id` cùng trỏ `branches.id`). Sau khi thêm cột FK mới, luôn tự test thử các query embed hiện có bằng cách gọi trực tiếp PostgREST (`curl .../rest/v1/<table>?select=*,x:othertable!inner(...)`) trước khi coi migration là xong — nếu ambiguous, sửa bằng cách chỉ đích danh tên constraint: `x:othertable!ten_fk_constraint(...)`.
- **`Tone.Sampler({ urls, baseUrl })` tự `fetch()` HẾT mọi file ngay khi tạo, không giới hạn số request đồng thời.** Gặp thật (12-13/09/2026): project 17 nhạc cụ khác nhau (mỗi nhạc cụ ~88 file sample) → mỗi track tự dựng 1 Sampler riêng → bấm Play bắn ~1670 request cùng lúc → vượt giới hạn kết nối đồng thời của Chrome → hàng loạt `net::ERR_INSUFFICIENT_RESOURCES`. **Hệ quả nặng hơn cả việc mất vài note:** gọi `triggerAttackRelease` trên 1 Sampler có buffer lỗi **ném exception** (`buffer is either not set or not loaded`) — nếu vòng lặp lên lịch note không có try/catch quanh mỗi lần gọi, 1 note lỗi làm dừng luôn toàn bộ phần còn lại của vòng lặp (mọi track khác cũng câm theo). Đã sửa bằng `frontend/lib/sample-buffer-cache.ts`: tự `fetch()`+`decodeAudioData()` qua hàng đợi giới hạn ~6 request đồng thời, cache theo URL dùng chung giữa mọi track (nhiều track cùng 1 nhạc cụ không tải lặp lại), rồi `sampler.add(note, buffer)` từng nốt — không đưa `urls` thẳng cho Sampler tự lo nữa. Kèm bọc try/catch quanh mỗi `triggerAttackRelease` làm lớp phòng thủ thứ 2 (1 note lỗi chỉ mất đúng note đó). Xem `docs/PROJECT_STATE.md` §21 mục 7 cho chi tiết điều tra.
- **Playwright (headless Chromium) xác nhận được lớp network + JS logic của audio (request 200, không exception, `triggerAttackRelease` không ném lỗi) — KHÔNG xác nhận được có thật sự nghe được âm thanh hay không.** Headless không cần thiết bị âm thanh thật để tính "thành công" ở mức code. Gặp thật (13/09/2026): Playwright báo 100% request thành công, 0 lỗi console, nhưng người dùng test tay qua trình duyệt thật vẫn không nghe được gì — kết luận "đã sửa xong" chỉ dựa vào Playwright cho bug **âm thanh** là sai. Với bug loại này, phải đợi người dùng tự nghe (verify mức 3) hoặc tự đọc trực tiếp trạng thái Web Audio thật (`AudioContext.state`, giá trị gain thực tế...) trước khi báo đã xong — không dừng ở "không còn lỗi console" cho riêng audio.
- **`<main>` trong `app/layout.tsx` là vùng cuộn của trang, không phải `window`.** `body` cao đúng viewport, `main` là `min-h-0 flex-1 overflow-y-auto` (chiều cao bị chặn là để MIDI Editor cuộn nội bộ). Gặp thật (13/09/2026): trước khi có `overflow-y-auto`, mọi trang dài hơn viewport tràn ra khỏi `main` và vẽ đè lên footer. Hệ quả khi code trang mới: muốn trang cao bằng vùng nội dung thì dùng `min-h-full`, KHÔNG dùng `min-h-screen`/`100vh`/`calc(100vh - …)` (cao hơn `main` → luôn thừa thanh cuộn); đừng viết code dựa vào `window.scrollY`/`window.scrollTo`.
- **`ValidationPipe({ whitelist: true })` (`backend/src/main.ts`) xoá ÂM THẦM mọi trường không có decorator class-validator trong DTO** — không báo lỗi, dữ liệu chỉ biến mất. Thêm trường mới vào snapshot (VD `soundMap`) phải khai trong **cả 3 DTO** ghi snapshot: `commits/dto/create-commit.dto.ts`, `drafts/dto/update-draft.dto.ts`, `branches/dto/switch-branch.dto.ts` — và sửa luôn các chỗ chép snapshot bằng tay từng trường (`branches.service.ts` `normalizeSnapshot`, `commits.service.ts`, `merge.service.ts`). Tra ngày 16/09/2026.
- **Khoá ngoại `ON DELETE CASCADE` chỉ xoá dòng DB, KHÔNG BAO GIỜ xoá file trong Supabase Storage.** Gặp thật (16/09/2026): xoá project/tài khoản xoá dòng `audio_sketches` nhưng file WAV nằm lại vĩnh viễn trong bucket. Mọi tính năng có file (audio sketch, custom sound, avatar) phải tự xoá object storage ở mọi đường xoá (kể cả xoá dây chuyền từ project/user), theo thứ tự **xoá dòng DB trước, file sau**, kèm quét dọn file mồ côi.
- **`frontend/lib/sample-buffer-cache.ts` cache buffer PCM đã decode ở cấp module, sống suốt vòng đời tab, KHÔNG có giới hạn dung lượng và KHÔNG có cơ chế tự xoá** — thiết kế có chủ đích (tránh tải lặp khi nhiều track cùng nhạc cụ, xem gotcha `Tone.Sampler` ở trên) nhưng hệ quả là RAM trình duyệt của tab đó **chỉ tăng, không bao giờ tự giảm**, cho tới khi đóng/reload hẳn tab. Gặp thật (17/09/2026): mở project nặng (17 nhạc cụ, ~1.6GB) rồi điều hướng sang project 2 track rất nhẹ **trong cùng tab, không reload** — RAM không tụt, vẫn ~1.5GB. Khi đo/báo cáo RAM MIDI Editor, luôn hỏi rõ tab đó trước đó đã từng mở project nào chưa — số đo phản ánh cộng dồn của cả phiên tab, không phải riêng project đang mở. Muốn giới hạn thật cần thêm LRU + trần dung lượng (tính bằng số kênh × số mẫu × 4 byte mỗi buffer) — **chưa làm, mới chỉ bàn hướng**, xem `docs/PROJECT_STATE.md` §40.
- **Text đọc trực tiếp từ file nhị phân người dùng tải lên (VD tên track trong file `.mid` do `@tonejs/midi` parse) có thể chứa ký tự điều khiển, kể cả NUL (`0x00`) — Postgres từ chối thẳng `0x00` trong mọi cột `text`/`jsonb` (lỗi `22P05 unsupported Unicode escape sequence`), dù chuỗi vẫn là UTF-8 hợp lệ và qua lọt `@IsString` (NUL là 1 ký tự JS bình thường, class-validator không chặn).** Gặp thật (17/09/2026): import 1 file MIDI có track name bị đệm NUL (phổ biến ở file đệm chuỗi độ dài cố định) → bấm commit lần đầu vỡ ngay ở bước ghi draft, chỉ hiện lỗi chung chung "Could not write draft". Đã sửa bằng lọc bỏ mọi ký tự có mã từ 0x00 đến 0x1F và mã 0x7F khỏi `midiTrack.name` trong `frontend/lib/midi-parser.ts` trước khi đưa vào snapshot. Bất kỳ chuỗi nào lấy trực tiếp từ nội dung file người dùng (không phải do STAVE tự sinh) đều nên lọc tương tự trước khi ghi `jsonb`. **Lưu ý phụ quan trọng hơn cả bug này:** nguyên nhân thật chỉ lộ ra sau khi thêm tạm `console.error(error)` ngay trước dòng `throw` trong `drafts.service.ts` — pattern `if (error) throw new InternalServerErrorException(...)` lặp lại ở hầu hết service trong `backend/src/**` **không log lý do Supabase trả về ở bất kỳ đâu**, không có global exception filter nào bắt lại. Gặp lỗi 500 chung chung dạng "Could not X" thì luôn thêm log tạm (đánh dấu `DEBUG-TEMP`, gỡ ngay sau khi có kết luận) trước khi đoán mò nguyên nhân.
- **`next dev` có lúc không bắt file sửa bằng `sed -i` / công cụ ghi ngoài editor** (gặp 30/09/2026): Tailwind không sinh lớp mới (vd `md:grid-cols-[…_96px_auto]`) nên trang hiện như thiếu CSS, trong khi file đã đúng. Lưu lại file (ghi lại nội dung) để watcher bắt trước khi kết luận là lỗi code. Build production không bị.
- **Sửa file hàng loạt bằng Python viết trong heredoc bash:** backreference `\1` trong chuỗi thay thế có thể bị ghi thành ký tự điều khiển `\x01` (gặp 30/09/2026: 11 nhãn editor mất chữ đậm, CSS vẫn "hợp lệ" nên không báo lỗi). Viết script ra file `.py` ở scratchpad, dùng hàm thay thế (`lambda m: …`) thay vì chuỗi `\1`, và quét ký tự điều khiển sau khi sửa. Đừng đặt tên file scratchpad trùng module chuẩn Python (`locale.py` từng che module `locale`).
- **`apply_migration` (connector Supabase claude.ai) trả `{"status":"declined"}` mà không hiện hộp hỏi** (gặp 04/10/2026): quyền tool đặt ở claude.ai → Connectors → Supabase; "Needs approval" không duyệt được trong VS Code. Đổi "Always allow" + mở phiên mới vẫn `declined`; `execute_sql` ghi DDL cũng `declined` (chỉ đọc chạy được). **Cách đã sửa (04/10/2026):** thêm Supabase MCP server chạy local, scope `local` (trong `~/.claude.json`, không vào repo): `cmd /c npx -y @supabase/mcp-server-supabase@latest --project-ref=gwbiwweeznbuqfgawywv`, token ở biến môi trường người dùng `SUPABASE_ACCESS_TOKEN`, quyền `mcp__supabase__apply_migration`/`execute_sql`… trong `.claude/settings.local.json`. **Ghi DB dùng `mcp__supabase__*`, không dùng `mcp__claude_ai_Supabase__*`.** Thêm qua Git Bash phải dùng `MSYS_NO_PATHCONV=1 claude mcp add-json …` (không thì `/c` bị đổi thành `C:/`). Server mới chỉ có tool ở phiên mở sau khi thêm. **Đăng ký ở scope `user`, không phải `local`** (sửa 04/10/2026, PROJECT_STATE §67): scope `local` khoá theo đường dẫn dự án, đăng ký từ Git Bash ghi `C:/Users/...` còn VS Code mở `c:\Users\...` (khác chữ hoa ổ đĩa) → không khớp, tool không nạp. Scope `user` đã chạy: 2 migration Custom Sound áp thành công qua `mcp__supabase__apply_migration`.
- **`backend/supabase/migrations/` KHÔNG phải lịch sử schema đầy đủ** (tra 08/10/2026): DB thật có 34 migration (`list_migrations`, từ `01_extensions_and_enums` 26/08), repo chỉ có 2 file cuối (Custom Sound 04/10) — 32 migration trước đó áp thẳng qua MCP/dashboard, không lưu file. `supabase start` + `db reset` từ repo sẽ ra DB thiếu gần hết bảng. Cần schema đầy đủ thì `supabase db dump`/`db pull` từ project thật (chỉ đọc). Migration mới từ nay vẫn lưu file vào thư mục này.
- **E2E (28/10/2026):** (1) ca `test.fail(true, …)` mà lỗi đã sửa sẽ báo "Expected to fail, but passed" — gỡ marker khi sửa lỗi, đừng để tồn đọng; (2) Node `fetch` dùng lại kết nối đã bị máy chủ đóng nên có lúc `ECONNRESET` khi chạy nối tiếp lâu (`UserApi.call` đã thử lại với lệnh không phải POST); (3) `loginThroughUi` chờ rời `/login` (đăng nhập vào thẳng `/projects`), đừng chờ `/`; (4) test dựa toạ độ pixel cố định rất dễ vỡ khi bố cục đổi — dùng `scrollGrid`/`point`/`velocityLaneBox` ở `e2e/support/piano-roll.ts`; (5) `next dev` tự ghi lại `frontend/AGENTS.md` mỗi lần chạy: `git checkout -- frontend/AGENTS.md` trước khi commit; (6) dọn dữ liệu test bằng `cleanupE2eUsers()` ở `afterEach/afterAll`, không bao giờ trỏ E2E vào production (`e2e/support/env.ts` có hàng rào).
- **Viết file/patch dài bằng Python trong heredoc bash dễ vỡ** (dấu nháy lẫn trong chuỗi làm bash báo "unexpected EOF", ký tự `\U` trong chuỗi Python bị hiểu là escape). Dùng công cụ Write ra file `.py`/`.md` ở scratchpad rồi chạy; khi sửa hàng loạt luôn giữ kiểu xuống dòng gốc của file và `assert old in s` trước khi thay.
- Xem thêm `docs/decisions/` khi cần chi tiết đầy đủ 1 quyết định; mục 4 ở đây chỉ tóm tắt.

## 11. Quy trình rà soát UX/UI (chốt 29/09/2026 — chi tiết & kết quả: PROJECT_STATE §41–§53)

- Mặc định chỉ **báo cáo, không sửa file** cho tới khi người dùng nói rõ "sửa". Kết quả mỗi bước ghi vào `project-state/PROJECT_STATE.md` theo mục 12; không tạo file audit trong repo (`.impeccable/`, `docs/`).
- **Bước E (sửa) đang làm từ 30/09/2026** theo kế hoạch PROJECT_STATE §54 (E1–E8, kết quả §55 trở đi). Toàn bộ thay đổi Bước E để chung **một commit** do người dùng tự tạo nhánh/commit/merge — Claude sửa tại chỗ, không chia PR. Mỗi nhóm: đo "trước" → sửa → đo "sau" bằng Playwright với tiêu chí nghiệm thu ghi trong §54.2 → chạy lại bài đo của các nhóm trước để chống lùi → ghi §N.
- Test account không có commit/nhánh phụ/tài khoản admin: để đo các màn đó, giả dữ liệu ở tầng route trình duyệt (vd trả `head_commit_id` + `GET /commits` / `GET /branches/:id/history` giả), không ghi dữ liệu thật; ghi rõ trong §N là "đo bằng dữ liệu giả".
- **3 lớp, dùng theo thứ tự:** (1) `web-design-guidelines` cho mỗi thay đổi giao diện — rẻ, bắt lỗi lặp lại; (2) `frontend-design-audit` theo module khi thêm tính năng lớn — lấy tác động người dùng; (3) **đo thật bằng Playwright** cho mọi mục rủi ro (mất dữ liệu, bố cục, tương phản, hiệu năng) và `impeccable critique`/`audit` mỗi vài tuần hoặc sau mỗi đợt sửa để so với điểm cơ sở (29/09: Nielsen 22/40 single-context, audit 11/20; **30/09 sau Bước E: Nielsen 23/40 dual-agent, audit 13/20** — PROJECT_STATE §63). Critique luôn chạy **dual-agent** (A thiết kế, B detector, 2 sub-agent tách biệt) — lần single-context bị neo và bỏ sót vấn đề.
- **Đừng tin phân tích tĩnh cho khẳng định về hành vi** (vd "không có focus") khi chưa đo — phiên 29/09 có 1 khẳng định sai bị đo bác bỏ. Kết luận về hiệu năng/âm thanh ghi rõ mức đã verify (mục 10).
- **Đo an toàn:** Playwright cài tạm ngoài dự án; chặn mọi PUT/POST/PATCH/DELETE tới backend trừ `/auth/*`; giả 404 cho `GET /explore/projects/*` (tránh tăng `play_count`); thu hồi phiên test ở `/profile/sessions`; tắt server ở cổng 3000/3001 và kiểm tra `git status` sạch.
- Mẫu kế thừa từ mockup (eyebrow, dải stat, gradient ProjectThumb) là quyết định bản sắc — không tự sửa khi chưa hỏi.

## 12. Cách ghi trạng thái dự án (chốt 05/11/2026)

Trạng thái nằm ở `project-state/`, không còn là một file nhật ký dài ở gốc repo:

- **`project-state/PROJECT_STATE.md` — file duy nhất đọc đầu phiên, giữ ngắn (dưới ~150 dòng).** Chỉ chứa: đang ở đâu (nhánh, PR, CI), kế hoạch/tiến độ giai đoạn đang chạy, quyết định còn hiệu lực chưa nằm ở CLAUDE.md, việc mở theo thứ tự ưu tiên, quy trình làm việc đang dùng, mục lục archive. Cuối mỗi phiên **sửa tại chỗ** các mục này cho đúng hiện tại (khác với kiểu cũ là thêm mục §N cuối file). Không dán lại thứ code, git hay CLAUDE.md đã ghi.
- **`project-state/archive/NN-<giai-đoạn>.md` — nhật ký lịch sử, bất biến.** Khi một đợt việc kết thúc, chuyển phần chi tiết của nó sang file archive cùng giai đoạn (hoặc file mới) dưới dạng mục `## §N — <tên> (<ngày>)`, **số §N tiếp tục tăng, không dùng lại số cũ**; ở file chính chỉ để lại 1–3 dòng tóm tắt. Mục đã chuyển vào archive không sửa nữa trừ khi sai sự thật (khi đó ghi chú ngay đầu mục, không xoá lịch sử).
- **Mục lục ở cuối file chính** phải khớp: mỗi § thuộc file nào. Mọi chỗ ghi "PROJECT_STATE §N" (CLAUDE.md, code, PR) tra bằng mục lục này. Mục đã bị thay thế hoặc lỗi thời thì **loại khỏi archive** (đánh dấu trong danh sách "mục đã loại" ở mục lục) thay vì để lại thông tin sai; nhật ký trung gian của một việc đã xong được gộp thành một mục tổng kết.
- **Nội dung mỗi mục phải trung thực về mức verify:** ghi rõ đã typecheck / gọi API thật / chạy E2E / hay chỉ đọc code; số liệu ghi số thật; việc chưa kiểm được (âm thanh, GPU, thiết bị, dữ liệu thật) nói thẳng. Lý do và bối cảnh của thay đổi code ghi ở đây, không ghi thành comment trong code (mục 9).
- **Repo công khai:** không ghi key, token, mật khẩu, tài khoản test, đường dẫn máy cá nhân hay danh sách lỗ hổng chưa sửa chi tiết đủ để khai thác. Chi tiết nhạy cảm (danh sách lỗi `defects-list.md`, khối lượng việc từng thành viên, báo cáo test) ở `docs/` (bị `.gitignore` chặn); trong project-state chỉ nêu ngắn gọn và trỏ tới đó.
- **Bản gốc 4.682 dòng trước khi dọn** (05/11/2026) được giữ ngoài repo; đừng đưa trở lại vào repo.
