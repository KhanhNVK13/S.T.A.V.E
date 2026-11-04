# Archive — Nền tảng, Auth, Projects, Version Control, MIDI Editor, audio (27/08–16/09/2026)

> Nhật ký bất biến, giữ nguyên văn từ PROJECT_STATE gốc. Số §N giữ nguyên để tra chéo với CLAUDE.md.

## §1 — Khởi tạo project structure (27/08/2026)

**Đã làm:**
- Tạo monorepo: `frontend/` (Next.js 16 App Router + TypeScript + TailwindCSS 4, Turbopack), `backend/` (NestJS 11 + TypeScript), `shared-types/` (package TS rỗng, chỉ export `{}`).
- `frontend`: cài `@supabase/supabase-js`. Trang chủ (`app/page.tsx`) chỉ hiển thị chữ "STAVE". Xoá `CLAUDE.md`/`AGENTS.md`/`package-lock.json` do `create-next-app` tự sinh (tránh xung đột với root).
- `backend`: cài `@nestjs/config` + `@supabase/supabase-js`. Thêm route `GET /health` trả `{ status: 'ok' }` (`app.controller.ts`), đăng ký `ConfigModule.forRoot({ isGlobal: true })`. Đổi port mặc định 3000 → 3001 (tránh đụng frontend). **Không** wire `SupabaseClient` thật vào DI ở bước này — thử nghiệm ban đầu dùng `config.getOrThrow(...)` làm app crash lúc khởi động vì `.env` chưa có giá trị thật (đúng theo ranh giới phạm vi "không kết nối Supabase thật"), nên đã bỏ code đó, để dành cho sprint viết feature thật.
- `docker-compose.yml`: 2 service `frontend` (port 3000) + `backend` (port 3001), mỗi service build từ `Dockerfile` riêng, đọc env qua `env_file` (không có service database — Supabase managed).
- `.github/workflows/ci.yml`: on push/PR vào `main` → `npm install` + `npm run build` + `npm run lint` cho cả `frontend` và `backend` (2 job riêng), Node 22, chưa có deploy step.
- Bí mật: root `.gitignore` (`.env`, `.env.*`, `!.env.example`) + `.env.example` ở cả 2 app (biến đúng như CLAUDE.md mục 7, để trống giá trị) + sửa lại `.gitignore` tự sinh của `frontend` (thiếu `!.env.example`, đã bổ sung).
- Pre-commit hook **gitleaks** qua husky (`.husky/pre-commit`): tự tìm binary ở `.tools/gitleaks.exe` (tải về máy, **không commit vào repo** — nằm trong `.gitignore`) hoặc `gitleaks` trong PATH; nếu không có thì cảnh báo và bỏ qua (không chặn dev chưa cài). Thêm `scripts/setup-gitleaks.sh` để mỗi dev tự tải gitleaks 1 lần (hỗ trợ Windows/macOS/Linux). **Quyết định phát sinh, chưa hỏi lại người dùng** vì thuộc phạm vi kỹ thuật thuần: máy dev hiện tại không có `choco`/`gitleaks` sẵn, nên đã tự tải binary gitleaks v8.30.1 về `.tools/` (không phải cài đặt hệ thống/không cần quyền admin) thay vì cài qua Chocolatey (sẽ cần quyền admin, ảnh hưởng toàn máy) — mỗi dev khác trong nhóm 5 người cần tự chạy `bash scripts/setup-gitleaks.sh` để có hook hoạt động, nếu không hook chỉ cảnh báo chứ không chặn.

**Quyết định đã chốt cùng người dùng:**
- Workspace tool: **npm workspaces** (không phải pnpm/Turborepo) — máy đã có sẵn npm 11, đủ dùng quy mô hiện tại.
- Chạy song song 2 dev server: **npm workspaces + `concurrently`** (không dùng Turborepo `--parallel`) — người dùng ưu tiên tối giản, không muốn thêm cache/công cụ mới ở bước này. Script `npm run dev` ở root gọi `concurrently` chạy cả `frontend` (`next dev`) và `backend` (`nest start --watch`) trong 1 terminal.

**Verify:**
- [x] Đã gọi API/DB thật, kết quả hợp lý — cụ thể:
  - `frontend`: `npm run build` sạch (Next.js 16, Turbopack, 0 lỗi TypeScript). Chưa tự tay click qua `npm run dev` trên trình duyệt thật (chỉ verify build, chưa mở UI).
  - `backend`: `npm run build` sạch. Đã `npm run start:dev` thật, `curl -v localhost:3001/health` trả đúng `HTTP/1.1 200 OK` + `{"status":"ok"}` — verify bằng lệnh gọi thật, không phải suy đoán.
  - `npm run lint` sạch cho cả 2 app (0 lỗi/warning sau khi sửa `main.ts` dùng `void bootstrap()` và xoá file scaffold `supabase.provider.ts` chưa dùng gây lỗi lint).
  - `.gitignore`: test thật bằng cách tạo `.env` chứa `SUPABASE_SERVICE_ROLE_KEY=test123`, `git status` xác nhận không track; `git check-ignore -v .env` xác nhận đúng dòng match. `git add .env.example` add được bình thường. File test đã xoá sau khi verify.
  - **gitleaks pre-commit hook**: verify thật bằng cách stage 1 file chứa fake GitHub PAT hợp lệ định dạng (`ghp_` + 36 ký tự) → `git commit` bị husky chặn (`pre-commit script failed (code 1)`), file vẫn ở trạng thái staged chứ không vào lịch sử commit. (Lưu ý: thử lần đầu với AWS example key `AKIAIOSFODNN7EXAMPLE` KHÔNG bị chặn — đây là secret mẫu nổi tiếng trong tài liệu AWS, gitleaks/nhiều tool coi là false-positive quen thuộc nên không phải lỗi cấu hình. Đã dọn sạch commit test đó bằng `git reset --soft HEAD~1` trước khi verify lại với PAT.) Tất cả file/commit test đã dọn sạch, `git status` cuối cùng chỉ còn đúng các file thật của §1.
- [ ] **Chưa verify**: `docker-compose up` — máy hiện tại **không có Docker cài đặt** (`where docker` không tìm thấy). Chỉ verify được cú pháp YAML hợp lệ (`docker-compose.yml` và `ci.yml` parse sạch bằng `js-yaml`), chưa build/run container thật. Cần người dùng tự kiểm trên máy có Docker.
- [ ] **Chưa verify**: CI workflow chạy thật trên GitHub Actions (đúng theo phạm vi — cần người dùng tự push và xem tab Actions).
- [ ] **Chưa verify**: bật Secret scanning + Push protection trên GitHub (cần người dùng tự vào Settings, Claude Code không truy cập được).

**Còn dở/chưa làm:**
- Chưa mở `frontend` qua trình duyệt thật (`npm run dev` + xem UI) — mới chỉ verify `npm run build`.
- `shared-types` chưa có nội dung thật, chỉ export rỗng — đúng phạm vi, để dành bước tiếp theo (khớp schema Supabase).
- Chưa commit/push gì — toàn bộ đang ở working tree, chờ người dùng review diff rồi tự commit.

---

## §2 — Module Auth & Account: UC-01..07, 13-17, 84-85, 96-99 (03/09/2026)

**Bối cảnh:** Report 4 (SDD, hạn 13/09/2026) yêu cầu demo Login/Register/Home/User Profile/User Management CRUD. Rà lại SRS thật theo yêu cầu người dùng thì phát hiện UC-96 View user list, UC-97 Suspend, UC-98 Reactivate, UC-99 Remove user account (Admin) **đã có sẵn số trong SRS gốc**, chỉ bị thiếu trong bảng UC soạn cho prompt này — không phải UC mới tự thêm, dùng đúng số có sẵn.

**Đã làm — Backend (`backend/src/`):**

- `supabase/` — module global cấp `SUPABASE_ADMIN_CLIENT` (service_role, `persistSession:false`).
- `common/guards/`: `jwt-auth.guard.ts` (validate JWT qua `getUser()` — gọi mạng, không decode local), `session-auth.guard.ts` (validate header `X-Session-Id` khớp row `public.sessions` còn `revoked_at IS NULL`), `admin.guard.ts` (đọc `role` từ `public.users`).
- `auth/` — `sync-profile`, `sessions` (register/list/revoke/revoke-others), `change-password`, `DELETE /auth/account`.
- `users/` — `GET/PATCH /users/me` (UC-14/15).
- `admin/` — `GET /admin/users` (UC-96, search+filter+mask email), `POST /:id/suspend` (UC-97), `POST /:id/reactivate` (UC-98), `DELETE /:id` (UC-99, xác nhận gõ lại username).
- `main.ts` — `ValidationPipe` global (`whitelist`+`transform`) + CORS.

**Đã làm — Frontend (`frontend/`):**

- `context/auth-context.tsx` — React Context tự viết (`AuthProvider`/`useAuth`, đã chốt với người dùng — không thêm dependency state-mgmt).
- `lib/supabase-browser.ts`, `lib/api-client.ts` (tự gắn `Authorization`+`X-Session-Id`).
- Trang: `/login`, `/register`, `/forgot-password`, `/reset-password`, `/auth/callback`, `/profile` (view+edit+đổi mật khẩu+xoá tài khoản), `/profile/sessions` (UC-84/85), `/admin/users` (UC-96..99).
- `app/page.tsx` → Home thật (header/footer thật, nội dung blank), sửa `<title>` từ "Create Next App" mặc định thành "STAVE".
- Xoá `frontend/CLAUDE.md`/`AGENTS.md` do `next dev` tự sinh lại (giống §1, tránh xung đột với root).

**Phát hiện hạ tầng quan trọng (không phải bug của module này, nhưng chặn toàn bộ backend):**

1. **`service_role` không có GRANT nào trên bất kỳ bảng nào trong 29 bảng** (khác RLS — RLS đã đúng từ §F, nhưng thiếu quyền Postgres gốc khiến mọi query của `service_role` bị `permission denied`). Đã xin phép người dùng và chạy migration `grant_service_role_privileges_public_schema` (GRANT + `ALTER DEFAULT PRIVILEGES` để bảng mới sau này tự động có quyền). Đã verify bằng `has_table_privilege` trước/sau — từ toàn `false` sang `true`.
2. **`supabase.auth.admin.updateUserById(id, {password})` tự thu hồi luôn access token hiện tại của chính người gọi** (verify thật bằng script cô lập) — nếu dùng cách này cho UC-16 sẽ vi phạm BR-10 ("chỉ giữ lại session vừa thao tác"). Đã sửa: dùng endpoint self-service `PUT /auth/v1/user` (scope theo access token của chính user) thay vì admin API — giữ được session hiện tại, verify bằng script.
3. **Không dùng `auth.signInWithPassword` trên client `SUPABASE_ADMIN_CLIENT` dùng chung (singleton)** — vì gọi hàm này làm rò rỉ session của user vừa verify vào state nội bộ của client, ảnh hưởng các request khác dùng chung client (bug tiềm ẩn dưới tải đồng thời). Đã sửa: verify password bằng gọi thẳng REST `/auth/v1/token?grant_type=password`, không đụng tới client dùng chung.

**Verify — mức 2 (đã gọi API/DB thật, không phải chỉ build sạch):**

- [x] `npx tsc --noEmit` + `npx eslint` sạch cả 2 workspace (không dùng được `npm run build` do bị auto-mode classifier chặn lặp lại không rõ lý do — đã build sạch bằng `npm run build --workspace=*` nhiều lần trước đó trong phiên, mã nguồn không đổi từ lúc đó ngoài 1 dòng title + xoá 2 file .md).
- [x] Script test tự động (`node` + `@supabase/supabase-js` service_role, gọi thẳng backend thật đang chạy `localhost:3001` + Supabase project thật) — **34/34 check PASS**:
  - UC-01/04 (tạo user qua Admin API + `signInWithPassword` thật) → `auth.users` và `public.users` (qua `sync-profile`) đều có row đúng.
  - UC-84 (list đúng số session khi login 2 nơi), UC-85 (revoke 1 session cụ thể → session đó gọi API bị 401 ngay, session khác không ảnh hưởng).
  - UC-16 + BR-02 (đổi password <8 ký tự bị 400) + BR-10 (đổi password xong: session khác trong DB có `revoked_at`, gọi API bằng session khác → 401; **session hiện tại vẫn sống**; login bằng password cũ thất bại, password mới thành công).
  - UC-96 (admin tìm đúng user theo email chính xác, email bị mask đúng định dạng); non-admin gọi `/admin/users` → 403.
  - UC-97 (suspend: DB `status=suspended`, session hiện có của nạn nhân bị 401 ngay lập tức, `signInWithPassword` sau đó bị chặn "User is banned").
  - UC-98 (reactivate: login lại được ngay).
  - BR-110 (admin không tự suspend chính mình → 403).
  - UC-99 (remove: sai `confirmUsername` bị 400; đúng thì xoá — `public.users` và `auth.users` đều biến mất).
  - BR-107 (audit log có đủ 3 dòng suspend/reactivate/remove, đúng thứ tự, không sửa/xoá được theo RLS đã có).
- [x] Đã dọn sạch toàn bộ dữ liệu test khỏi Supabase thật sau khi verify xong (`execute_sql` xác nhận count=0).
- [x] Click tay qua UI thật trên trình duyệt — người dùng đã tự test và xác nhận: UC-01 (đăng ký email thật, nhận đúng email xác nhận từ Supabase Auth, bấm link xong tự tạo `public.users` với username/display_name tự sinh đúng như thiết kế — ví dụ tài khoản `awml300`), UC-14/15 (trang profile hiển thị đúng dữ liệu thật), UC-84 (trang "Thiết bị đang đăng nhập" hiển thị đúng device/IP/thời gian thật), UC-04 (đăng nhập email thường), UC-13 (logout đổi header đúng), và **UC-02/05 Google OAuth chạy được thật** sau khi người dùng tự bật provider — người dùng xác nhận "đã login đúng với Google và login với email thường, các phần khác đều hoạt động đúng".
- [x] Người dùng xác nhận đã tự test tay **hoàn chỉnh toàn bộ UC** trong scope module này qua UI thật (bao gồm cả các mục trước đó còn ghi "chưa test tay": UC-06/07 quên/đặt lại mật khẩu, UC-17 xoá tài khoản, UC-85 đăng xuất 1 thiết bị cụ thể qua UI, trang `/admin/users` qua UI thật). Không có phản hồi lỗi/behaviour sai nào được báo lại — coi là đạt mức verify 3 (click tay qua UI thật) cho toàn bộ UC-01..07, 13-17, 84-85, 96-99.
- [ ] **Chưa verify**: minimum password length ở tầng Supabase Dashboard — người dùng xác nhận mặc định đã là 8, khớp BR-02 (đã tự kiểm, không cần mình làm gì thêm).

**Thu hẹp phạm vi có chủ đích (đã nêu trong lúc code, chưa hỏi lại từng cái):**

- UC-97 POST-2 ("ẩn project public") và UC-99 POST-4 ("huỷ subscription"): bỏ qua vì `projects`/`subscriptions` chưa có nghiệp vụ nào được code — sẽ cần bổ sung khi 2 module đó tồn tại.
- UC-99 "thông báo cho account holder": bỏ qua bước ghi `notifications` khi remove (khác với suspend/reactivate có ghi) vì tài khoản bị xoá ngay sau đó, ghi in-app notification cho user đã xoá không có ý nghĩa; hệ thống hiện chưa có email service để gửi thật.
- `password_hash`/`google_id` trên `public.users`: để `password_hash` luôn `NULL` (Supabase Auth là nguồn thật duy nhất), `google_id` chỉ điền cơ hội khi đăng nhập Google thành công — đã verify hoạt động thật (người dùng login Google thành công sau khi tự bật provider).

**Quyết định thiết kế phát sinh — đã chốt cùng người dùng trong phiên:**

- Frontend state auth: React Context tự viết, không thêm Zustand.
- UC-96..99 dùng đúng số có sẵn trong SRS, không tạo số nối tiếp mới (vì hoá ra không phải UC mới).
- Cho phép chạy migration GRANT (mục "Phát hiện hạ tầng quan trọng" #1) sau khi hỏi ý kiến rõ ràng.

**Việc người dùng cần tự làm tiếp:**

- ~~Bật toggle "Enable Sign in with Google"~~ — đã làm, đã verify login Google thật thành công.
- ~~Test toàn bộ UI bằng tay qua trình duyệt~~ — đã làm cho UC-01/02/04/05/13/14/15/84 (xem mục Verify).
- Xác nhận `SUPABASE_SERVICE_ROLE_KEY` trong `backend/.env` (đã điền, đã verify hoạt động qua test script) không bị lộ ra ngoài — file này đã confirm nằm trong `.gitignore`.
- ~~Test tay UC-06/07, UC-17, UC-85 (1 thiết bị cụ thể), `/admin/users`~~ — đã làm, người dùng xác nhận toàn bộ UC trong scope module này đã test tay hoàn chỉnh.

---

**Git/CI:** Code đã commit + push lên branch `feature/auth-account` (2 commit: `8db3b90` module chính, `37d71e8` fix CI). Người dùng đã tự mở PR #1 rồi **tự đóng lại** (không merge) sau khi thấy CI fail. CI fail do 2 lỗi hạ tầng phát hiện được nhờ chính PR đó (không phải lỗi nghiệp vụ UC): (1) `backend/package.json` bản commit đầu thiếu `class-validator`/`class-transformer` dù máy dev có sẵn trong `node_modules` — CI resolve fresh (`rm -f package-lock.json && npm install`) nên fail; (2) `frontend/lib/supabase-browser.ts` dùng `process.env.X!` khiến build crash khi CI không có `NEXT_PUBLIC_SUPABASE_*` (không commit `.env.local` — đúng thiết kế). Cả 2 đã sửa ở `37d71e8`, đã tự verify lại bằng cách build frontend với `.env.local` tạm thời gỡ đi (mô phỏng đúng môi trường CI) — build qua. **Chưa có PR nào đang mở** để CI chạy lại xác nhận xanh — cần người dùng tự mở lại PR #1 hoặc tạo PR mới nếu muốn thấy CI pass trên GitHub.

**Kết luận module:** Auth & Account **hoàn thiện** — đủ code cho toàn bộ UC trong scope (01-07, 13-17, 84-85, 96-99), đã verify mức 2 (script gọi API/DB thật) cho toàn bộ, và **verify mức 3 (click tay qua UI thật) cho toàn bộ UC** theo xác nhận cuối cùng của người dùng (04/09/2026). Còn 2 việc thuần hạ tầng chưa xong, không liên quan tính đúng của module: (1) `SUPABASE_SERVICE_ROLE_KEY` cần double-check không lộ, (2) chưa có PR mở để CI GitHub Actions chạy lại xác nhận xanh (đã tự verify build tương đương ở local).

---

## §3 — Nền tảng Projects + Drafts (05/09/2026)

**Đính chính so với §2:** PR Auth đã merge vào `main` ngày 05/09/2026 (`7f3a24b`, merge PR #2), xác nhận qua `git log` thật — không chỉ tin lời prompt. Nhánh `feature/projects-drafts` rẽ từ `main` sau merge đó (đã có đủ `auth/`, `admin/`, `users/`, `common/guards/`).

**Bối cảnh:** Việc này chỉ dựng phần nền tảng API `projects`/`drafts` để Version Control và MIDI Editor (4 thành viên khác) không phải tự đoán cách đọc/ghi `drafts.snapshot`. Không phải toàn bộ Project Management (UC-19/20/21/23 chưa làm).

**Phát hiện schema quan trọng (đã hỏi lại người dùng trước khi code, không tự quyết):** `drafts` khoá bằng `branch_id` (unique), **không có cột `project_id`** — khác giả định ban đầu của prompt. Quan hệ thật: `projects` → nhiều `branches` (có cờ `is_default`) → mỗi `branch` có tối đa 1 `draft`. Đã chốt với người dùng: `POST /projects` tự tạo kèm 1 branch `main` (`is_default=true`); `/projects/:id/draft` đọc/ghi draft của branch mặc định đó. Không đổi schema Supabase.

**Đã làm — Backend (`backend/src/`):**

- `projects/` — `POST /projects` (tạo project + branch `main` mặc định), `GET /projects` (list theo `owner_id`), `GET /projects/:id` (chỉ owner, không owner → 404 không lộ thông tin). `ProjectsService.getDefaultBranchForOwner()` export cho module khác dùng (verify ownership + lấy branch mặc định).
- `drafts/` — `GET /projects/:id/draft` (trả `drafts.snapshot` của branch mặc định; snapshot rỗng đúng schema nếu chưa từng ghi, không insert khi chỉ đọc), `PUT /projects/:id/draft` (upsert theo `branch_id`, validate nested đầy đủ qua `class-validator`/`class-transformer`: `schemaVersion`, `meta.{tempo,timeSignature,ppq}`, `tracks[]`, `notes[]` — thiếu field bắt buộc → 400, không ghi rác). Dùng đúng pattern 2 guard `JwtAuthGuard`+`SessionAuthGuard` như Auth.
- `shared-types/src/index.ts` — thêm `DraftSnapshot`/`DraftMeta`/`DraftTrack`/`DraftNote`/`DRAFT_SCHEMA_VERSION` (khớp đúng `docs/decisions/STAVE_NhomF_JSONB_RLS_DaChot.md`) để FE/BE và các module sau (Version Control, MIDI Editor) import chung, tránh lệch cấu trúc. Backend đã thêm `@stave/shared-types` vào `dependencies`.

**Verify — mức 2 (đã gọi API/DB thật, không phải chỉ build sạch):**

- [x] `npx tsc --noEmit`, `npm run build` (root, cả 2 workspace), `npm run lint` (backend) sạch.
- [x] Script test tự động (`node` + `fetch` thật gọi `localhost:3001` đang chạy + Supabase project thật, tạo user thật qua Admin API) — **16/16 check PASS** (1 "FAIL" ban đầu là false-negative của chính script test — so sánh `JSON.stringify` bị lệch thứ tự key do JSONB không giữ thứ tự chèn; đã xác nhận lại bằng `util.isDeepStrictEqual` → `true`, nội dung giống hệt):
  - `GET /projects` không kèm token → 401.
  - `POST /projects` tạo được 3 project thật, mỗi project có `id` thật.
  - `GET /projects/:id` trả đúng project vừa tạo; `GET /projects` list đủ cả 3.
  - `GET /projects/:id/draft` lần đầu (chưa từng ghi) → snapshot rỗng đúng schema (`schemaVersion:1, meta:{tempo:120,timeSignature:[4,4],ppq:480}, tracks:[], notes:[]`), không lỗi 500.
  - `PUT /projects/:id/draft` payload hợp lệ → ghi thành công → `GET` lại đọc đúng y hệt (deep-equal).
  - `PUT` payload thiếu field bắt buộc → 400, `GET` lại xác nhận draft cũ (rỗng) không bị ghi rác.
  - `GET /projects/:id/draft` không kèm token → 401.
  - User khác (tạo mới, tách biệt) gọi `GET /projects/:id` của user đầu → 404 (không lộ thông tin tồn tại/không tồn tại).
  - Đã dọn sạch user + data dùng riêng cho test cross-access (404) khỏi Supabase; **user + 3 project seed chính giữ lại có chủ đích** (xem bảng dưới) cho 4 thành viên khác dùng.

**Seed project test thật — giữ lại cho cả nhóm dùng ngay, không cần tự tạo lại:**

| # | project_id | name | owner (email) |
|---|---|---|---|
| 1 | `55e4451d-5d70-43f9-907c-3e4f2f2723e1` | STAVE Seed Project 1 (có sẵn 1 draft mẫu: track "Piano" + 1 note) | `stave-test-1788612055654@example.com` |
| 2 | `b485c531-5301-4189-8e99-e007334e2db3` | STAVE Seed Project 2 (draft rỗng mặc định) | `stave-test-1788612055654@example.com` |
| 3 | `10cd5e9f-ac26-433f-a3fd-63f98fe73e16` | STAVE Seed Project 3 (draft rỗng mặc định) | `stave-test-1788612055654@example.com` |

Mật khẩu tài khoản test dùng chung: `TestPass123!` (tài khoản test thuần, không phải tài khoản thật của ai — thành viên khác có thể tự login lấy JWT để gọi API qua 3 project trên, hoặc query `drafts`/`branches` trực tiếp bằng `service_role` không phụ thuộc quyền sở hữu).

**Còn dở/chưa làm (đúng phạm vi đã giới hạn từ đầu, không phải thiếu sót):**

- UC-19/20/21/23 (Edit info, Archive, Delete, Set visibility) — chưa làm, để người khác.
- Version Control thật (commit/branch/merge UC-42..46) — chưa làm, `drafts` ở đây chỉ là bản nháp đang sửa.
- UI cho Projects/Drafts — chưa làm, chỉ API JSONB thô như phạm vi yêu cầu.
- Chưa mở PR, chưa merge — chờ người dùng duyệt.

---

## §4 — Review PR `feature/project-visibility-unarchive` + fix lỗi UX đăng ký/Google OAuth trùng email trên `main` (09/09/2026)

**Bối cảnh:** Người dùng nhờ review nhánh `feature/project-visibility-unarchive` (UC-23 Set visibility + UC-20 Unarchive, do Thành viên 1 làm, xem kế hoạch §38) trước khi tự merge, đồng thời báo lỗi UX thật gặp khi tự test tay trên `main`: đăng ký lại bằng email đã có tài khoản (qua flow email/OTP) vẫn hiện "Kiểm tra email" dù không có email nào được gửi thật; đăng nhập/"đăng ký" bằng Google với email đã có tài khoản thì tự động login vào tài khoản cũ mà không báo gì. Người dùng yêu cầu sửa lỗi UX này trước khi merge nhánh khác.

**1. Review `feature/project-visibility-unarchive` (`code-review` skill, effort medium) — không có gì chặn merge, nhưng 2 điểm nên sửa trước khi merge:**

- `frontend/components/site-header.tsx:100` — avatar initial dùng `??` fallback, không bắt được `display_name === ""` (backend không có `@IsNotEmpty()` chặn rỗng) → `""[0]` là `undefined` → `.toUpperCase()` throw → crash `SiteHeader` (render ở mọi trang đã login, không có ErrorBoundary bắt).
- `frontend/components/site-header.tsx:92` — link nav mới "Khám phá" trỏ `/explore`, route này chưa tồn tại → 404.
- 2 điểm không chặn merge (đã báo người dùng, để làm sau nếu muốn): `backend/src/projects/projects.service.ts` check trùng tên project là check-then-insert không atomic (TOCTOU — nên chuyển sang unique constraint `(owner_id, name)` + bắt lỗi Postgres `23505`); `unarchiveOwned`/`setVisibility`/`archiveOwned` lặp code gần y hệt (nên gộp 1 helper `updateOwnedProject`).
- **Không tự merge PR này** — người dùng tự merge và tự comment trên GitHub, Claude chỉ review.

**2. Fix lỗi UX đăng ký/Google OAuth trùng email — trên `main`, đã sửa xong (chưa commit, chờ người dùng duyệt diff):**

Nguyên nhân xác định qua agent điều tra: registration đi thẳng từ frontend tới Supabase Auth (`supabase.auth.signUp()`), không qua NestJS backend. Supabase cố tình trả `error: null` cả khi email đã có tài khoản xác nhận (chống dò email — cùng triết lý với pattern REST verify password đã chốt ở CLAUDE.md 4.6), nhưng có tín hiệu phân biệt được: `data.user.identities` rỗng `[]` nếu là email đã tồn tại (không gửi email thật), khác rỗng nếu là tài khoản mới thật. Code cũ ở `frontend/app/register/page.tsx` chỉ check `signUpError`, bỏ qua hẳn `data` → luôn hiện "Kiểm tra email" bất kể trùng hay không.

- `frontend/app/register/page.tsx`: đọc `data.user.identities.length === 0` → nếu đúng, hiện thông báo "Email này đã được đăng ký..." thay vì màn "Kiểm tra email".
- `frontend/app/auth/callback/page.tsx`: **đã thử sửa rồi revert theo yêu cầu người dùng** — bản đầu so sánh `created_at`/`last_sign_in_at` để phát hiện login Google vào tài khoản đã tồn tại và hiện thông báo, nhưng người dùng nhắc lại app chỉ có 1 nút "Đăng nhập với Google" duy nhất (không có nút "Đăng ký với Google" riêng), nên hành vi "Google trùng tài khoản → tự đăng nhập vào tài khoản cũ, không báo gì" **là đúng thiết kế login bình thường**, không phải bug — thông báo đó gây hiểu nhầm hơn là giúp ích. Đã revert file này về nguyên trạng (chỉ redirect thẳng `/` sau khi có session, không phân biệt user mới/cũ).
- **Verify:** `npx tsc --noEmit` + `npx eslint` sạch trên `register/page.tsx` (fix giữ lại) và `auth/callback/page.tsx` (đã revert, khớp lại bản gốc). **Chưa test tay qua UI thật** phần đăng ký trùng email — cần người dùng tự thử lại kịch bản đã báo lỗi để verify mức 3.

**3. Thêm quy tắc mới vào `CLAUDE.md` (mục 8, các mục Gotcha cũ dịch xuống mục 9):** sau khi code + tự test xong (dev server, docker-compose, tiến trình nền bất kỳ), Claude phải tự kill toàn bộ trước khi kết thúc lượt — không để chạy nền lại, người dùng tự chạy khi cần test tiếp.

**Còn dở/chưa làm:**
- Chưa commit/push gì trong §4 — toàn bộ đang ở working tree `main`, chờ người dùng review diff rồi tự commit.
- Chưa test tay qua UI thật kịch bản đăng ký trùng email đã sửa.
- 2 điểm code smell không chặn merge ở `feature/project-visibility-unarchive` (mục 1) — người dùng xác nhận sẽ tự làm sau khi merge xong PR đó, không cần Claude làm ngay.

---

## §5 — Review + sửa toàn bộ bug/regression/code smell trên `feature/explore-discovery` (09/09/2026)

**Bối cảnh:** `feature/project-visibility-unarchive` đã được merge vào `main` (PR #6, `f3411fe`). PR tiếp theo `feature/explore-discovery` (Thành viên 1, UC-08→12: Explore/Rankings/Creator profile/Featured) mở lên — review kỹ (8 finder song song qua `code-review` skill) phát hiện nhiều bug thật + 2 regression so với `main`. Người dùng yêu cầu hoãn merge, lấy thẳng nhánh này để Claude sửa toàn bộ (bug, regression, và code smell — sửa ngay, không dồn về sau).

**1. Đồng bộ nhánh trước khi sửa (đúng CLAUDE.md 8.5):** `git checkout feature/explore-discovery` (rẽ từ trước khi merge `bugfix/register-duplicate-email-notice` + `feature/project-visibility-unarchive`) → `git merge origin/main` sạch, không conflict.

**2. Phát hiện quan trọng nhất — schema DB thật không khớp code:** dùng `mcp Supabase execute_sql` kiểm tra trực tiếp `information_schema.columns` của bảng `projects` (project `gwbiwweeznbuqfgawywv`): **chỉ có `play_count`, KHÔNG có `fork_count`/`like_count`/`view_count`** như `backend/src/projects/project-row.type.ts` khai báo sai (branch trước đó tự thêm 3 cột này vào type mà chưa từng có migration tạo cột thật). Code cũ `select(...fork_count, like_count...)` lẽ ra phải lỗi 500 ngay khi gọi thật — nhưng finder review chỉ đọc code tĩnh nên không phát hiện được, phải chạy backend thật (`npm run start:dev` + `curl`) mới lộ ra `column projects.fork_count does not exist`. Tra thêm SRS (`docs/Report3_Software Requirement Specification.docx`, đọc bằng cách giải nén XML vì không có tool đọc .docx trực tiếp): **không có UC/tính năng "lượt thích" nào được định nghĩa** trong toàn bộ 119 UC — "like" chỉ xuất hiện trong câu văn không liên quan (VD "Unlike..."). Kết luận: `like_count` không phải placeholder có chủ đích, là dữ liệu giả — đã **bỏ hẳn khỏi API + UI** (không hiện "❤️ 0" giả mãi mãi) thay vì giữ lại. `fork_count` thì có thật (quan hệ `forked_from_project_id`, được nhắc tới trong UC Fork thật) — đã tính lại bằng query đếm thật thay vì cột ảo.

**3. Bug đã sửa (`backend/src/explore/explore.service.ts`, viết lại gần như toàn bộ):**
- `GET /explore/rankings` bỏ qua `type` query param → thêm `RankingsQueryDto` (`backend/src/projects/dto/rankings-query.dto.ts`, mới) + controller đọc đúng; `top_forked` sort theo fork count tính thật (không có cột nên tính trong app, chấp nhận được ở quy mô hiện tại — ghi rõ trong comment code là cần cột đếm + trigger nếu catalog lớn hơn); `trending`/`top_played` vẫn sort DB-level theo `play_count`.
- `fork_count` luôn 0 → tính thật qua helper `getForkCounts()` (đếm `forked_from_project_id` nhóm theo id), dùng chung cho `enrichProjectCards` và ranking `top_forked`.
- `total_forks` ở `getPublicUserProfile` luôn 0 (`.in('forked_from_project_id', [])` mảng rỗng cứng) → sửa: lấy id project công khai của user trước, rồi đếm thật theo id đó.
- `tag` filter bị bỏ qua ở `listPublicProjects` → thêm `getProjectIdsForTag()` (query `project_tags` join `tag_id!inner(name)`), lọc `.in('id', ids)`.
- Project archived/bị ẩn moderation lọt vào Explore/trang chủ → thêm `.is('archived_at', null).is('moderation_hidden_at', null)` nhất quán ở `listPublicProjects` và cả 2 query trong `getFeatured` (trước đó thiếu).
- `play_count` off-by-one → response giờ trả đúng giá trị đã +1 thay vì giá trị cũ. **Chưa sửa race condition** (2 request đồng thời có thể ghi đè nhau) — cần RPC atomic increment ở DB mới sửa triệt để được, ngoài phạm vi 1 lần sửa code không migration; chấp nhận được vì play_count vốn chỉ là số liệu tham khảo (không phải nghiệp vụ core).

**4. Regression đã sửa:**
- Project đã archive mất link "Xem" → thêm lại link `👁 Xem` (trỏ `/projects/:id/edit`) song song "Khôi phục"; trang edit (`frontend/app/projects/[id]/edit/page.tsx`) giờ có chế độ read-only khi `archived_at` khác null (banner cảnh báo + `<fieldset disabled>` + ẩn nút "Lưu thay đổi") — xem được nội dung mà **không cần unarchive trước**, đúng yêu cầu người dùng.
- Logo header về `/` khi đã login: **giữ nguyên, không sửa** — người dùng xác nhận hành vi này hợp lý (không phải regression).

**5. Code smell đã sửa (sửa ngay theo yêu cầu, không dồn về sau):**
- `PROJECT_CARD_COLUMNS` const gộp chuỗi `.select()` lặp 6 lần thành 1 nơi.
- `getFeatured()` gộp 5 query độc lập vào 1 `Promise.all` (trước đó 2 query đầu chạy tuần tự).
- `PublicProject`/`PublicProjectCard`/`PublicUserProfile`/`FeaturedContent` bị định nghĩa tay riêng ở FE (`frontend/lib/api-client.ts`) và BE (`explore.service.ts`, `public-user-profile.dto.ts`) → chuyển vào `shared-types/src/index.ts` (đúng CLAUDE.md §3), cả 2 phía import lại — thêm `@stave/shared-types` vào `frontend/package.json` (trước đó chỉ backend dùng), `npm install --workspace=frontend` để link workspace.
- Logic lấy chữ cái đầu avatar copy 3 nơi → gộp `frontend/lib/format-name.ts` (`getInitials`, mới).
- `new Date(...).toLocaleDateString('vi-VN', {...})` viết tay ở `creator/[id]/page.tsx` thay vì dùng helper chung → thêm `formatMonthYear()` vào `frontend/lib/format-date.ts`, dùng lại.
- `handleUnarchive` dùng `dynamic import()` + `window.location.reload()` → đổi sang static import (đã có sẵn ở top-level) + cập nhật state lạc quan giống hệt pattern `handleArchive` (không reload cả trang).
- **Chưa làm** (cân nhắc rủi ro/effort, không phải bị quên): gộp `useState+useEffect+fetch` lặp lại ở 4 trang (`explore`, `rankings`, `creator/[id]`, home) thành 1 hook `useApiResource`; gộp skeleton loading markup lặp lại — cả 2 đụng nhiều file cùng lúc, để lại làm sau nếu người dùng muốn.

**Verify:**
- [x] `npx tsc --noEmit` + `npx eslint` sạch cả 2 workspace (nhiều vòng, kể cả sau khi phát hiện lỗi cột ảo).
- [x] `npm run build` sạch cả `backend` (`nest build`) và `frontend` (`next build`, prerender đủ 16 route tĩnh).
- [x] Gọi API thật (`npm run start:dev` + `curl` vào Supabase project thật): `listPublicProjects`, `rankings?type=trending`, `rankings?type=top_forked` (thứ tự khác `trending` khi fork count khác nhau), `featured`, `getPublicUserProfile`, `tag` filter (tag không tồn tại → rỗng đúng), `getPublicProject` gọi 2 lần liên tiếp → `play_count` trả về `1` rồi `2` (đúng, không lệch 1 như trước). Đã tắt hẳn dev server sau khi verify xong (theo CLAUDE.md mục 9 mới thêm).
- [ ] **Chưa test tay qua UI thật trên trình duyệt** — chỉ verify build + API. Cần người dùng tự mở `/explore`, `/rankings`, `/creator/:id`, `/projects` (tab đã lưu trữ → bấm "Xem") để xác nhận UI hiển thị đúng.

**Còn dở/chưa làm:**
- Chưa commit/push — đang ở working tree branch `feature/explore-discovery`, chờ xác nhận trước khi push (theo CLAUDE.md 8.1: không tự merge PR, chỉ push commit sửa lên nhánh đã có).
- `useApiResource` hook + gộp skeleton (mục 5) chưa làm, để tuỳ chọn sau.
- Race condition thật của `play_count` (2 request đồng thời) chưa sửa triệt để — cần RPC Postgres atomic increment (yêu cầu migration, chưa xin phép làm trong phiên này).

---

## §6 — Dọn nốt 3 việc để dành: TOCTOU project name, race condition play_count, gộp hook/skeleton frontend (09-10/09/2026)

**Bối cảnh:** `bugfix/explore-data-integrity` đã merge vào `main` (PR #7, `7837733`). `feature/project-visibility-unarchive` đã merge từ trước (`f3411fe`). Lấy `main` mới nhất về, tạo nhánh `bugfix/projects-and-explore-followups`, làm nốt 3 việc đã để dành từ 2 lần review trước (theo đúng thứ tự người dùng yêu cầu).

**1. Migration DB thật — đã hỏi & được cho phép trước khi làm** (2 lựa chọn: TOCTOU cần unique constraint, race condition cần RPC atomic increment — cả 2 đều đổi schema Supabase thật, không chỉ sửa code):
- Kiểm tra trước: `select owner_id, name, count(*) ... having count(*) > 1` trên `projects` → không có dữ liệu trùng sẵn, an toàn thêm constraint.
- `apply_migration` (`projects_unique_owner_name`): `ALTER TABLE projects ADD CONSTRAINT projects_owner_id_name_key UNIQUE (owner_id, name)`.
- `apply_migration` (`increment_project_play_count_fn`): tạo function SQL `increment_project_play_count(p_project_id uuid) RETURNS integer` — `UPDATE ... SET play_count = play_count + 1 WHERE id = ... RETURNING play_count`, `GRANT EXECUTE` cho `service_role`.
- Chạy `get_advisors(type=security)` ngay sau — phát hiện 1 warning mới do chính migration (`function_search_path_mutable` trên function vừa tạo) → vá ngay bằng `SET search_path = public` trong function. Chạy lại advisor xác nhận sạch, các warning còn lại đều pre-existing không liên quan.

**2. Sửa code backend khớp migration:**
- `backend/src/projects/projects.service.ts`: bỏ hẳn check-then-insert (SELECT trước rồi mới INSERT) — giờ INSERT thẳng, bắt lỗi Postgres `23505` (unique_violation) convert thành `ConflictException`, áp dụng cả cho `create()` và `updateOwned()` (đổi tên cũng có thể trùng). Gộp `archiveOwned`/`unarchiveOwned`/`setVisibility` thành 1 helper `updateOwnedProject()` dùng chung — lưu ý hệ quả phụ: `archiveOwned` giờ cũng set `updated_at` (trước đây không set, không nhất quán với 2 hàm kia).
- `backend/src/explore/explore.service.ts`: `getPublicProject()` gọi `supabase.rpc('increment_project_play_count', ...)` thay vì đọc-rồi-ghi — atomic thật ở tầng DB, không còn race giữa 2 request đồng thời.

**3. Gộp hook `useApiResource` + skeleton dùng chung ở frontend:**
- `frontend/lib/use-api-resource.ts` (mới) — hook chung thay cho 4 lần tự viết `useState(loading/error/data)+useEffect(fetch)`. **Gặp đúng lỗi lint đã gặp ở phiên sửa `auth/callback/page.tsx` trước đó** (`react-hooks/set-state-in-effect` — không được gọi `setState` đồng bộ ngay trong thân effect): giải quyết bằng cách suy ra `loading` từ so sánh `key` (JSON.stringify của `deps`) hiện tại với `key` của lần fetch hoàn tất gần nhất, thay vì set `loading=true` trực tiếp — `setState` chỉ gọi bên trong `.then()/.catch()` (bất đồng bộ), không vi phạm rule.
- Áp dụng ở `frontend/app/explore/page.tsx` (kèm gộp thêm 1 component `ProjectCardSkeletonGrid` nội bộ file — trước đó lặp y hệt 2 lần: loading state + Suspense fallback), `frontend/app/rankings/page.tsx`, `frontend/app/creator/[id]/page.tsx` (2 fetch song song gộp thành 1 `Promise.all` trong 1 fetcher), `frontend/app/page.tsx` (trang chủ, error bị bỏ qua có chủ đích — trang này vốn không hiện lỗi, chỉ hiện placeholder cứng khi `data === null`, giữ nguyên hành vi cũ).
- **Không gộp skeleton xuyên suốt 4 trang** (chỉ gộp trong nội bộ `explore/page.tsx`) — 4 trang có hình dạng skeleton khác hẳn nhau (grid card, list row, profile header, project-management card), gộp chung sẽ cần nhiều prop hơn giá trị mang lại.

**Verify:**
- [x] `npx tsc --noEmit` + `npx eslint` sạch cả 2 workspace, `npm run build` sạch cả `backend`/`frontend` (đủ 16 route).
- [x] Gọi API thật (`start:dev` + `curl`, login thật qua tài khoản test seed ở §3): tạo project trùng tên → `409 Conflict` đúng message; archive/unarchive/setVisibility qua helper gộp vẫn hoạt động đúng (đã dọn sạch project test tạo ra khỏi Supabase ngay sau khi verify); gọi `getPublicProject` 2 lần liên tiếp → `play_count` tăng đúng tuần tự (3→4), xác nhận RPC hoạt động.
- [x] Frontend: `npm run dev` + `curl` các route `/`, `/explore`, `/rankings`, `/creator/:id`, `/projects` → đều `200`, không có text lỗi ("Application error"/"Internal Server Error") trong HTML trả về. **Chưa test tay thật trên trình duyệt** (chỉ verify HTTP-level, chưa click tương tác thật — filter, đổi trang, đổi tab ranking).
- [x] Đã tắt cả 2 dev server (backend + frontend) sau khi verify xong, đúng CLAUDE.md mục 9.
- [x] Xoá `frontend/AGENTS.md` do `next dev` tự sinh lại (artifact quen thuộc từ §1/§2, không phải thay đổi thật).

**Còn dở/chưa làm:**
- Chưa test tay qua UI thật trên trình duyệt cho cả 3 việc trong phiên này — cần người dùng tự làm.

**Cập nhật đóng phiên (10/09/2026):** người dùng đã tự push `bugfix/projects-and-explore-followups` (`801ed15`) và merge vào `main` (PR #8, merge commit `cfe05ba`). Đã `git checkout main && git pull` xác nhận local đồng bộ đúng. **Toàn bộ 3 mục tồn đọng liệt kê xuyên suốt §4/§5/§6 (2 code smell `projects.service.ts`, race condition `play_count`, gộp hook/skeleton frontend) coi như đã khép lại** — không còn việc "để dành" nào từ chuỗi review 3 PR (`feature/project-visibility-unarchive` → `feature/explore-discovery` → theo dõi tiếp) tính đến thời điểm này.

---

## §7 — Design system + polish UI/UX toàn bộ trang đã verify (10/09/2026)

**Bối cảnh:** Prompt Claude Web yêu cầu dựng design system từ 4 file PDF mockup (`docs/STAVE design component sample/`) rồi áp UI/UX hoàn thiện cho các trang đã code+verify theo §1→§6, không đụng MIDI Editor/Branch/Merge/PR (chưa ai làm). Bắt đầu từ `main` mới nhất (`cfe05ba`).

**Sai lệch phát hiện so với prompt — đã tự xác nhận qua repo thật trước khi code (không đoán):**

1. Prompt liệt kê route dựa trên log, nhưng grep thật `frontend/app/` phát hiện 3 route **có code thật + API thật, không phải scaffold** mà prompt không biết tới: `explore/[id]/page.tsx` (trang chi tiết project công khai, nút Fork là stub `TODO`), `projects/new/page.tsx` (form tạo project, đã wire `createProject` + xử lý 409), `projects/[id]/settings/page.tsx` (trang cài đặt riêng — archive/unarchive/delete/visibility — tách khỏi `edit`). Đã hỏi lại người dùng qua `AskUserQuestion`: quyết định **đưa cả 3 vào phạm vi polish** (đúng tinh thần "đã code thật" dù chưa được ghi log).
2. Trang `/` (Home) — prompt nói "nội dung để trắng", nhưng code thật đã có đầy đủ hero + stats + trending + featured + features section, wire vào `GET /explore/featured` thật (không phải blank). Không hỏi lại (cùng hướng quyết định #1: đã có code+API thật → đưa vào polish), chỉ ghi nhận lại đây.
3. Không có `pdftoppm`/ImageMagick trên máy để tự xem PDF — đã tự cài `pymupdf` qua `pip install --user` (không cần quyền admin) để render PDF ra PNG và xem trực tiếp qua Read tool, thay vì suy đoán phong cách chỉ từ mô tả chữ trong prompt.

**Quyết định đã chốt cùng người dùng (qua `AskUserQuestion`, mục 5 của prompt):**

- IA `/profile`: tách 2 tab **Profile / Security** (đúng mockup, không giữ 1 trang dài).
- Placeholder ảnh project card: **block gradient màu nhạt tất định theo hash id** (không icon nhạc cụ, không để trống).
- Icon library: thêm **`lucide-react`** (trước đó chưa có icon lib nào).
- Font: mặc định `next/font/google` Inter (sans) + JetBrains Mono (mono) — không hỏi riêng vì rủi ro thấp, nêu rõ trong báo cáo cho người dùng veto.
- Rankings cột "CHANGE": grep xác nhận `explore.service.ts`/`rankings-query.dto.ts` **không có dữ liệu lịch sử hạng** → bỏ cột này (đúng fallback đã ghi sẵn trong prompt khi không có dữ liệu thật).

**Đã làm — Design system (`frontend/`):**

- `app/globals.css`: token màu (`accent-50..900`, `success/warning/danger-50/600/700`), `radius-card`, `shadow-card` trong khối `@theme inline` (Tailwind 4 CSS-first, không có `tailwind.config.js`). Gỡ toàn bộ `dark:` class cũ (không nhất quán, chỉ 1 theme sáng — quyết định chốt trong phiên, ghi ở CLAUDE.md 4.7).
- `app/layout.tsx`: đổi font `Geist`/`Geist Mono` → `Inter`/`JetBrains Mono` qua `next/font/google`.
- `components/ui/`: `card.tsx`, `badge.tsx`, `button.tsx`, `avatar.tsx` (+ `lib/avatar-color.ts` — hash tất định, không `Math.random()`), `page-header.tsx`, `empty-state.tsx`, `tabs.tsx`, `logo.tsx`, `project-thumb.tsx` (placeholder gradient tất định theo id), `form.tsx` (`Field` + `INPUT_CLASS` dùng chung).
- `components/auth-card.tsx` — layout riêng cho 4 trang auth (card căn giữa, khác `PageHeader` pattern của phần còn lại).
- Đầy đủ chi tiết token/quy ước: xem `CLAUDE.md` mục 4.7 (mới thêm phiên này).

**Đã áp dụng — theo đúng thứ tự mục 4 của prompt, giữ nguyên 100% logic/nghiệp vụ, chỉ đổi lớp trình bày:**

`SiteHeader`, `SiteFooter`, `ProjectCard` (dùng chung), `RequireAuth` → `/login`, `/register`, `/forgot-password`, `/reset-password`, `/auth/callback` → `/profile` (tách tab), `/profile/sessions` → `/admin/users` → `/projects`, `/projects/[id]/edit` (banner khoá rõ ràng bằng `Lock` icon + nền xám, không chỉ mờ opacity), `/projects/[id]/settings`, `/projects/new` (3 route phát hiện thêm) → `/explore`, `/explore/[id]` (nút Fork + khối "Nghe thử" đổi text thành ghi rõ **PLACEHOLDER** theo yêu cầu người dùng) → `/rankings` (đổi từ card-list sang bảng, bỏ cột CHANGE) → `/creator/[id]` → `/` (Home).

**Verify:**

- [x] Mức 1: `npx tsc --noEmit` sạch, `npx eslint .` — 0 lỗi (2 warning có sẵn từ trước, không liên quan thay đổi: `no-img-element` ở `Avatar`, 1 eslint-disable thừa ở `edit/page.tsx`). `npm run build` sạch, đủ 17 route tĩnh/động (kể cả 3 route phát hiện thêm) — không giảm route nào.
- [x] Mức 2: `npm run start:dev` (backend) + `npm run dev` (frontend) thật, `curl` toàn bộ route công khai + auth-gated (`/`, `/explore`, `/rankings`, `/login`, `/register`, `/forgot-password`, `/reset-password`, `/auth/callback`, `/projects/new`, `/projects`, `/profile`, `/profile/sessions`, `/admin/users`) → toàn bộ `200`, không có text lỗi. Test riêng 2 route dynamic (`/explore/[id]`, `/creator/[id]`) bằng project/user id thật từ DB (`8474a3d3-...`, `afb0cc5f-...`) → `200`, không lỗi. Gọi thẳng API backend (`/explore/projects`, `/explore/rankings?type=trending`, `/explore/rankings?type=top_forked`, `/explore/featured`) xác nhận vẫn trả đúng dữ liệu thật như trước khi sửa UI (không hỏng logic khi tách component).
- [ ] **Mức 3 — cần người dùng tự mở trình duyệt xác nhận** (Claude Code không có trình duyệt thật): toàn bộ 17 trang, đặc biệt — đối chiếu màu/bố cục có khớp mockup ở mức hợp lý không (Claude chỉ tự xem mockup qua PNG render, không phải xem trong Figma/trình duyệt thật); responsive ở màn hình hẹp (chưa test tay); dropdown avatar ở `SiteHeader`; modal xác nhận archive/delete ở `/projects`, `/admin/users`, `/projects/[id]/settings`; toggle tab `/profile`; banner "chỉ xem" ở `/projects/[id]/edit` khi đã archive.
- [x] Đã tắt cả 2 dev server (backend + frontend) trước khi kết thúc lượt, đúng CLAUDE.md mục 9.

**Còn dở/chưa làm:**

- Verify mức 3 (click tay UI thật) — chưa làm, liệt kê ở trên.
- Không đụng tới MIDI Editor/Branch/Merge/PR/Comment/Star/Follow/Notification/Subscription/Personalization — đúng phạm vi đã giới hạn, các trang mockup tương ứng chỉ dùng tham khảo phong cách.

**Cập nhật:** người dùng đã tự commit toàn bộ §7 lên nhánh mới `feature/design-system-ui-polish` (`d6d74bc`), tách từ `main` (`cfe05ba`). Chưa mở PR/merge.

---

## §12 — Review merge-readiness 6 nhánh Giai đoạn 1 + sửa `feature/explore-grid-ux` (11/09/2026)

**Bối cảnh:** Sau khi §7→§11 đóng lại (`feature/design-system-ui-polish` đã merge — PR #9/#10, `417a49f`/`788dd71`), 6 nhánh từ Giai đoạn 1 (mục 38.5 Bible: Hải/Đức/Vũ/Trí) đã có PR mở chờ merge: `feature/set-track-color-uc34`, `feature/assign-instrument-uc30`, `feature/remove-track-uc29`, `feature/add-track-uc28`, `feature/explore-grid-ux`, `vantri`. Người dùng yêu cầu review code (không merge hộ) trước khi tự bấm merge trên web.

**1. Review 6 nhánh (6 agent song song, mỗi nhánh 1 agent độc lập, `git diff origin/main...origin/<branch>` + đọc file thật):**

- **`vantri`, `feature/add-track-uc28`, `feature/assign-instrument-uc30`, `feature/remove-track-uc29`, `feature/set-track-color-uc34` — KHÔNG AN TOÀN MERGE, cùng 1 nguyên nhân gốc:** cả 5 nhánh đều tự viết lại **từ đầu** cùng 1 bộ khung MIDI editor mới (`midi-editor.tsx`, `piano-roll.tsx` — giống hệt byte-for-byte giữa các nhánh, `midi-toolbar.tsx`, `track-list.tsx`, `frontend/lib/midi-parser.ts`, viết lại `frontend/app/projects/[id]/edit/page.tsx`), thay vì 4 nhánh UC branch ra từ `vantri` rồi mỗi nhánh chỉ diff phần UC của mình. Suy đoán nguyên nhân (khớp phân công ở Bible mục 38.5 — Trí được giao đúng UC-28/29/30/34/33/35): `vantri` nhiều khả năng là bản nháp gốc do Trí tự build 1 lần đủ cả track-management, sau đó tách thành 4 nhánh riêng cho từng PR theo đúng convention "1 nhánh = 1 task" (CLAUDE.md 8.1), nhưng tách bằng cách copy toàn bộ thư mục thay vì `git branch`/rebase từ 1 điểm chung — mỗi bản copy lệch nhau vài chục-vài trăm dòng. Hệ quả: chỉ 1 trong 5 nhánh merge sạch được như "file mới", 4 nhánh còn lại sẽ conflict nguyên file khi merge sau, dễ mất tính năng âm thầm nếu resolve conflict không cẩn thận.
  - Bug/quy tắc dùng chung phát hiện xuyên suốt cả 5 nhánh: **archived project bị bypass** — tab "Editor" mới render `<MidiEditor>` không kiểm tra `isArchived` (tab "Info" bên cạnh vẫn disable đúng), cho phép sửa/autosave project đã archive qua piano-roll dù đáng lẽ chỉ-đọc; **rule chỉ check client, không check server** — giới hạn 16 track (UC-28 BR-29), giá trị instrument (UC-30, nên validate theo danh sách GM instrument có sẵn `frontend/lib/instruments.ts`), màu track (UC-34, nên validate hex regex) đều thiếu validate lại ở DTO backend; `shared-types` `DRAFT_SCHEMA_VERSION` 1→2 bị bump độc lập ở cả `assign-instrument-uc30` và `set-track-color-uc34` (2 nhánh sẽ tự đụng nhau ở đúng dòng đó); toàn bộ component mới dùng màu hex cứng theo dark theme qua inline `style`, không dùng token/`components/ui/*` — vi phạm CLAUDE.md 4.7 (dự án chỉ 1 theme sáng, đã gỡ hết `dark:` từ §7).
  - **Khuyến nghị đã báo người dùng:** đây là vấn đề tổ chức nhánh (branching), không sửa được bằng review code đơn thuần — cần quyết định 1 nhánh làm nền chính thức, rebase/diff lại các nhánh còn lại lên đúng nền đó, rồi mới review lại từng nhánh như 1 diff thực sự nhỏ.
- **`feature/explore-grid-ux` — KHÔNG AN TOÀN MERGE (lý do khác hẳn):** đổi layout Explore từ row-list (`CARD_LIST_CLASS`, chốt ở §9) sang card-grid — **vi phạm quyết định đã khoá ở CLAUDE.md 4.7**. Người dùng xác nhận: **đổi sang card-grid là chủ đích thật** (không phải lỗi) — chỉ phần code đi kèm mới cần sửa: waveform giả vẽ từ `project.id.charCodeAt(...)` (bịa dữ liệu âm thanh không tồn tại — đúng loại lỗi CLAUDE.md 4.7 đã cấm rõ), màu hex cứng thay vì token, container hardcode thay vì `max-w-page`, field `search` được thêm vào DTO nhưng backend không hề đọc (chỉ lọc client-side trên 12 item của trang hiện tại — sai model, mất kết quả nằm ở trang khác), pagination bị ẩn khi đang search.

**2. Người dùng merge `feature/explore-grid-ux` vào `main` trước (PR #14, `12a9a86`)** — chỉ nhánh này, 5 nhánh MIDI Editor giữ nguyên chưa merge chờ xử lý vấn đề branching ở trên.

**3. Sửa toàn bộ bug/code smell trên `main` sau merge, theo đúng thứ tự người dùng yêu cầu (lỗi thiết kế hệ thống → bug thật → code smell), nhánh `bugfix/explore-search-and-card-links`:**

- **Lỗi thiết kế hệ thống #1 — search sai tầng thực thi:** `backend/src/explore/explore.service.ts` thêm `.ilike('name', ...)` vào `queryBuilder` (cùng chỗ xử lý `genre`) — search giờ chạy thật ở server, tôn trọng đúng `page`/`limit`/`total` như genre/sort, không còn lọc trên 12 item đã fetch sẵn. `frontend/app/explore/page.tsx`: bỏ `filteredItems` client-side, thêm debounce 400ms cho ô input (tránh gọi API mỗi phím gõ), bỏ điều kiện ẩn pagination khi có search.
- **Lỗi thiết kế hệ thống #2 — nested interactive elements:** `frontend/components/project-card.tsx` viết lại cấu trúc — bỏ pattern "cả card là 1 `<Link>` phủ tuyệt đối" lồng thêm `<Link>`/`<button>` con bên trong (vi phạm HTML semantics, phải chặn bằng `stopPropagation` mới không double-navigate — hỏng Tab/Enter/right-click/mở-tab-mới thật). Thumbnail/tiêu đề/owner/tag giờ là các `<Link>` độc lập (sibling), Play/Fork là `<button>` sibling, không còn `stopPropagation` nào.
- **Code smell:** xoá `backend/src/projects/dto/list-projects-query.dto.ts` (file DTO chết, không ai import); đổi toàn bộ màu hex cứng (`#1D4ED8`/`#E3E4E8`/`#1F2126`) sang token (`accent-600`/`slate-200`/`slate-900`/`rounded-card`/`shadow-card`/`max-w-page`); gắn nhãn `(PLACEHOLDER)` đúng quy ước cho nút Play/Fork thay vì `TODO` mơ hồ; bỏ import `Eye` chưa dùng, sửa icon gắn sai ngữ nghĩa (từng gắn cho "thời gian đăng").
- **Hoàn thiện luôn field `tag`** (người dùng chọn qua `AskUserQuestion` — "wire UI ngay" thay vì để dở/xoá): backend `getProjectIdsForTag`/filter `tag` vốn đã đúng nhưng chưa có UI nào gọi — giờ các chip `#tag` trên `ProjectCard` là `<Link href="/explore?tag=...">`, `explore/page.tsx` đọc `tag` từ URL, hiển thị 1 chip filter đang active kèm nút bỏ.

**Verify:**
- [x] `npx tsc --noEmit` + `npx eslint` sạch (2 file sửa: `explore/page.tsx`, `project-card.tsx`) qua nhiều vòng sửa.
- [x] Gọi API thật (`start:dev` + `curl` vào Supabase project thật, 15 project công khai sẵn có — nhiều hơn 1 trang `limit=12`): `search=gió` trả đúng "sóng gió" dù project đó nằm ở trang 2 — xác nhận trực tiếp bug đã hết (bản cũ không bao giờ tìm ra được); `tag=lofi` (tag không tồn tại trong seed data) trả `200`, `items:[]`, không lỗi — không test được số dương vì dataset test hiện chưa có project nào gắn tag thật.
- [x] Đã tắt cả 2 dev server đúng cách (PowerShell `Get-NetTCPConnection`+`Stop-Process`) sau mỗi vòng test, theo CLAUDE.md mục 9.
- [ ] **Chưa test tay UI thật qua trình duyệt** (không có Playwright/Cypress trong repo, Claude Code không có trình duyệt) — cần người dùng tự mở `/explore` kiểm tra search/tag/click card trước khi merge tiếp.

**Đóng phiên:** người dùng đã tự push (`735bb94`, `b03b5ef`) + merge `bugfix/explore-search-and-card-links` vào `main` (PR #15, `6455872`) — xác nhận qua `git log origin/main` thật.

**Trạng thái UC thật tính đến hết phiên này (đối chiếu `STAVE_Feature_Function_UseCase.xlsx` sheet "Project Tracking" + `git log`/`find` thật trên `main`, không chỉ tin sheet cũ):**

- **Done, đã verify (không đổi so với sheet trước đó):** UC-01→07, 13→17 (Auth), 18→23 (Project Management), 84/85 (Sessions), 96→99 (Admin User Mgmt).
- **Done, verify mức 2 + vừa thêm 1 vòng sửa bug hôm nay (UC-08 Browse Explore):** search/tag giờ chạy đúng qua nhiều trang, card không còn nested-link — nhưng **vẫn chưa verify mức 3 (click tay UI thật)** như các UC khác trong nhóm Community & Discovery.
- **VẪN LÀ To Do trên `main`, dù code đã tồn tại (chỉ trên nhánh chưa merge):** UC-24→41 (MIDI Editor & Playback) — đã verify thật `main` **không có** `frontend/components/midi-editor/` nào (`find frontend/app frontend/components` xác nhận), `frontend/app/projects/[id]/edit/page.tsx` trên `main` vẫn chỉ là form sửa thông tin project (UC-19), không có piano-roll. Backend `drafts` API (GET/PUT snapshot thô, có từ §3) chỉ là hạ tầng lưu trữ, không tự thân hoàn thành UC nào trong nhóm này. Code cho nhóm UC này **có tồn tại thật**, nhưng nằm ở 5 nhánh chưa merge (`vantri`/`feature/add-track-uc28`/`feature/assign-instrument-uc30`/`feature/remove-track-uc29`/`feature/set-track-color-uc34`) và **không an toàn merge ngay** (xem mục 1 ở trên) — không tính là Done cho tới khi vấn đề trùng lặp nhánh được giải quyết và merge thật.
- **To Do, không đổi:** toàn bộ UC-42→119 còn lại (Version Control, Branch Management, Audio Sketch, Collaboration, Community Jam, Fork thật (UC-69, hiện chỉ nút PLACEHOLDER), AI Assistance, Subscription/Payment, Notifications, Connect/Disconnect Google (UC-82/83), Pull Requests, phần lớn Admin nhóm Moderation/Payment/System Settings/Statistics, UC-115/116 System) — grep xác nhận không có module backend nào (`branches`/`commits`/`collaboration`/`jam`/`subscription`/`notification`/`pull-request`) tồn tại trên `main`, khớp phát hiện đã ghi ở §11.

**Còn dở/chưa làm:**
- Verify mức 3 (UI thật) cho phần Explore vừa sửa hôm nay.
- 5 nhánh MIDI Editor (Giai đoạn 1, Hải/Đức/Vũ/Trí) cần được nhóm tự quyết định lại cách reconcile trước khi merge — không phải việc Claude tự làm được (quyết định tổ chức code/quy trình team).
- Đã cập nhật `docs/STAVE_PROJECT_BIBLE.md` mục 42 (log ngắn, trỏ về đây) theo đúng yêu cầu "cập nhật hiếm khi" ở đầu file đó.

---

## §13 — Sửa `feature/set-track-color-uc34` (bug archived-bypass + validate server-side) rồi merge — MIDI Editor scaffold vào `main` lần đầu (11/09/2026)

**Bối cảnh:** Tiếp theo §12 — người dùng chọn hướng "chỉ merge `feature/set-track-color-uc34`" (đã xác nhận qua diff thật là superset của `feature/add-track-uc28`/`feature/remove-track-uc29`/`feature/assign-instrument-uc30`/`vantri` — cùng file, cùng handler, chỉ hơn không thiếu) và đóng 4 nhánh còn lại. Trước khi merge, người dùng yêu cầu Claude checkout thẳng nhánh, sửa các bug đã liệt kê ở §12, không merge trước sửa sau.

**Phát hiện thêm khi checkout `origin/vantri` để so sánh (không liên quan trực tiếp tới `uc34`, đã báo ngay):** `backend/.env.example` trên `vantri` bị điền `SUPABASE_SERVICE_ROLE_KEY` **thật** (JWT thật, đúng project ref `gwbiwweeznbuqfgawywv`) thay vì để trống — vi phạm trực tiếp CLAUDE.md §7. Đã báo người dùng rotate key ngay theo đúng quy trình §8.6 (xoá code sau không đủ, key cũ vẫn dùng được tới khi thu hồi). **Chưa xác nhận người dùng đã rotate xong** — cần hỏi lại đầu phiên sau nếu chưa thấy xác nhận.

**Quyết định chốt qua `AskUserQuestion`:** 4 file component MIDI Editor (`midi-editor.tsx`/`midi-toolbar.tsx`/`piano-roll.tsx`/`track-list.tsx`) dùng nền tối (zinc) nhất quán, khác hẳn phần còn lại của app (chỉ 1 theme sáng, khoá ở CLAUDE.md 4.7). Người dùng chọn **giữ nguyên nền tối, ghi ngoại lệ vào CLAUDE.md** (giống quy ước ngành DAW — Ableton/FL Studio/Logic) thay vì viết lại toàn bộ sang theme sáng. Đã cập nhật CLAUDE.md §4.7 thêm đoạn ngoại lệ (chỉ áp dụng phạm vi hẹp 4 file này, không phải tiền lệ cho chỗ khác).

**Đã sửa trên nhánh `bugfix/uc34-archived-and-validation` (rẽ từ `feature/set-track-color-uc34`):**

1. **Bug thật — archived-project bypass** (`frontend/app/projects/[id]/edit/page.tsx`): tab "Editor" render `<MidiEditor>` không kiểm tra `isArchived` → có thể sửa/autosave project đã lưu trữ qua piano-roll dù đáng lẽ chỉ-đọc. Phát hiện thêm bug thứ 2 trong lúc sửa: tab "Info" bị `disabled` hoàn toàn khi archived — khiến phần UI chỉ-đọc vốn đã code đúng (banner + fieldset disabled) không bao giờ xem được. Đã sửa cả 2: bỏ disable nút "Thông tin", thêm banner khoá khi vào tab "Editor" lúc archived thay vì render `<MidiEditor>`.
2. **Thiếu validate server-side** (`backend/src/drafts/dto/update-draft.dto.ts`): thêm `@ArrayMaxSize(16)` cho `tracks` (BR-29), `@Matches(/^#[0-9a-fA-F]{6}$/)` cho `color`, `@IsIn(GM_INSTRUMENT_NAMES)` cho `instrument`. `GM_INSTRUMENTS` (128 nhạc cụ GM) chuyển từ `frontend/lib/instruments.ts` sang `shared-types/src/index.ts` để backend dùng chung đúng danh sách với frontend thay vì chép tay dễ lệch — **gặp 1 vấn đề kỹ thuật khi thử tách `instruments.ts` thành file riêng trong `shared-types`**: package này không có build step (`main`/`types` trỏ thẳng `src/index.ts`, chạy runtime qua Node type-stripping trực tiếp từ TypeScript), nên import tương đối nội bộ giữa 2 file gặp lỗi `ERR_MODULE_NOT_FOUND` ở runtime (dù `tsc --noEmit` báo sạch) — thử cả bare specifier, `.js`, `.ts` đều không ổn định giữa tsc (nodenext) và Node runtime resolver. Giải pháp cuối: **gộp hẳn vào `index.ts`** (1 file phẳng, đúng convention gốc của `shared-types` — không có file nào khác trong package này), tránh hẳn vấn đề resolution thay vì cố vá.
3. **Autosave debounce không dọn khi unmount** (`midi-editor.tsx`): thêm cleanup `clearTimeout` + flush 1 lần `putDraft` cuối cùng (best-effort, không await) thay vì chỉ huỷ timer (sẽ làm mất luôn edit cuối cùng nếu unmount trong lúc debounce 2s).
4. Dọn `void trackIdx` dead code ở `frontend/lib/midi-parser.ts` (đổi thành bỏ tên tham số không dùng).

**Verify:**
- [x] `npx tsc --noEmit`, `npx eslint`, `npm run build` sạch cả `backend`/`frontend` (đủ 17 route, thêm dependency `@tonejs/midi` cần `npm install` lại ở root do nhánh mới thêm).
- [x] **Test API thật** (script `node` + `fetch`, login qua tài khoản test seed ở §3, project seed `55e4451d-...`): PUT draft 17 track → `400` (đúng, chặn > BR-29); màu không đúng hex → `400`; instrument không có trong danh sách GM → `400`; payload hợp lệ → `200`. Cả 4 case đúng kỳ vọng. Đã restore lại draft seed về đúng nội dung gốc (track "Piano" + 1 note) sau khi test xong.
- [x] Đã tắt dev server đúng cách (PowerShell) sau khi test.
- [ ] **Chưa verify mức 3** — tương tác chuột trên canvas piano-roll (vẽ/kéo/resize note) cần người dùng tự test tay, Claude Code không có trình duyệt.

**Đóng phiên:** người dùng đã tự push 2 commit (`98535cb` validate server-side, `5ed025d` fix archived-bypass) + mở PR + merge `bugfix/uc34-archived-and-validation` vào `main` (PR #16, `7cb2a2e`) — xác nhận qua `git log origin/main` thật. `git pull --ff-only` local đồng bộ đúng. Build lại `main` sau merge (`nest build` + `next build`) sạch, đủ 17 route.

**Trạng thái UC thật trên `main` ngay sau merge này:**

- **29 UC Done như §12** (Auth 01-07/13-17, Project Mgmt 18-23, Sessions 84/85, Admin User Mgmt 96-99, Community & Discovery 08-12) — không đổi.
- **+10 UC mới có code thật lần đầu trên `main`** (MIDI Editor scaffold từ `uc34`, đã verify build + phần validate/archived-bypass, **chưa verify mức 3**): UC-24 (Import MIDI), UC-25/26/27 (Add/Edit/Delete note qua piano-roll canvas — vẽ/kéo di chuyển/kéo cạnh resize/xoá), UC-28 (Add track), UC-29 (Remove track), UC-30 (Assign instrument — **chỉ lưu lựa chọn, chưa ảnh hưởng âm thanh phát ra thật**, xem hạn chế bên dưới), UC-31 (Quantize), UC-34 (Set track color), UC-37 (Playback project — **rất cơ bản**, oscillator sine đơn giản qua Web Audio, không phải soundfont/GM instrument thật).
- **2 hạn chế kỹ thuật đáng ghi nhận trong code vừa merge (không phải bug chặn merge, nhưng cần biết khi đánh giá "hoàn thiện"):** toggle Solo trên track có UI + lưu data nhưng `handlePlay()` không đọc `track.solo` khi phát (chỉ Mute có tác dụng thật — Solo là tính năng "chết" về mặt phát nhạc); UC-30 assign instrument không nối vào synth engine thật, mọi track phát ra cùng 1 dạng sóng bất kể đã gán nhạc cụ gì.
- **Vẫn KHÔNG có code** dù cùng nhóm MIDI Editor & Playback, cùng nằm trong phân công mục 38.5 Bible: UC-32 (Copy pattern), UC-33 (Paste pattern), UC-35 (Set track label — `DraftTrack.name` hiển thị tĩnh, không có UI đổi tên), UC-36 (Metronome + loop), UC-38 (Export audio), UC-39 (Export MIDI), UC-40 (Volume — field có sẵn trong data model, không có slider UI), UC-41 (Pan — tương tự).
- **Tổng UC có code trên `main` sau merge này: 39** (29 cũ + 10 mới) — nhưng **10 UC mới chỉ nên tính "Done, chờ verify mức 3"**, chưa nên đánh dấu Done tuyệt đối trong tracking sheet chính thức cho tới khi người dùng tự test tay qua UI thật (đặc biệt tương tác chuột trên canvas, điều Claude Code không tự kiểm được).

**Còn dở/chưa làm:**
- Xác nhận người dùng đã rotate `SUPABASE_SERVICE_ROLE_KEY` bị lộ ở `vantri` hay chưa (đã báo, chưa thấy xác nhận lại) — **cần hỏi lại đầu phiên sau nếu quên**.
- Verify mức 3 cho 10 UC MIDI Editor vừa merge.
- Đóng 4 PR/nhánh còn lại (`feature/add-track-uc28` #11, `feature/remove-track-uc29` #12, `feature/assign-instrument-uc30` #13, `vantri` không PR) — người dùng xác nhận sẽ tự đóng, cần double-check đã đóng thật chưa.
- 8 UC còn thiếu code trong nhóm MIDI Editor (32/33/35/36/38/39/40/41) — thuộc phân công gốc Vũ/Trí, chưa ai làm tiếp.
- Đã cập nhật `docs/STAVE_PROJECT_BIBLE.md` mục 43 (log ngắn, trỏ về đây).

---

## §14 — Sửa `feature/music-version-control-engine` + `feature/set-track-label-uc35`, merge cả 2 vào `main`, verify lại toàn bộ (11/09/2026)

**Bối cảnh:** Tiếp §13 — người dùng bàn giao lại nhánh `feature/music-version-control-engine` (Version Control, do Đức phụ trách) để tự sửa thay vì trả cho Đức, và nhờ review thêm 1 nhánh mới `feature/set-track-label-uc35` (Trí, UC-35).

**1. `feature/music-version-control-engine` — phiên sửa lớn nhất từ đầu dự án, 3 lớp lỗi chồng lên nhau:**

- **Lỗi build/schema nghiêm trọng hơn cả review trước phát hiện** (không agent nào trong 6 agent review 2 vòng trước bắt được, vì chỉ đọc TypeScript không đối chiếu DB thật):
  - `commits.author_id` bị code toàn bộ gọi nhầm `created_by` — cột không tồn tại, mọi thao tác commit crash thật.
  - `branches.head_commit_id` được code dùng 47 lần nhưng **chưa từng tồn tại trong DB** — đã xin phép và thêm cột.
  - Bảng thật tên `commit_tags` (code gọi nhầm `tags`), không có cột `color`.
  - **Ambiguous foreign key do chính 2 migration của tôi gây ra** (`active_branch_id`, `head_commit_id`) — PostgREST từ chối thẳng các query join kiểu `select('*, project:projects!inner(...)')` vì giờ có nhiều hơn 1 đường quan hệ giữa 2 bảng; phải sửa lại bằng cách chỉ đích danh tên FK constraint (`!branches_project_id_fkey`...). Đây là bài học kỹ thuật mới, đã ghi thêm vào CLAUDE.md mục 10 (xem bên dưới).
  - Bug phát hiện qua test thật (không đoán): fast-forward merge khiến branch khác trỏ `head_commit_id` vào 1 commit vẫn mang `branch_id` của nhánh nguồn → xoá nhánh nguồn vỡ FK. Sửa bằng cách "re-home" (đổi `branch_id`) commit đó sang nhánh đang cần nó trước khi xoá — đúng tinh thần POST-2 SRS UC-52 ("commit đã merge vẫn phải còn truy cập được").
- **Migration đã áp dụng (đều xin phép trước):** `projects.active_branch_id`, `branches.head_commit_id`, `commit_tags.project_id` + trigger + 2 unique constraint (tên tag/project, 1 tag/commit), RPC `create_commit_atomic` (ghi commit + cập nhật head + reset draft trong 1 transaction — tránh lệch dữ liệu nếu 1 bước lỗi giữa chừng, cùng pattern RPC atomic increment đã dùng cho `play_count` trước đây).
- **Sửa toàn bộ theo danh sách đã liệt kê ở §12/13** (12 bug + code smell + 4 lỗi thiết kế hệ thống) — bao gồm cả commit graph thật dùng `parent_commit_id`/`merged_from_branch_id` (hoá ra 2 cột này **đã có sẵn trong DB** do Nhóm F thiết kế đúng từ đầu, không cần migration lớn như tưởng ban đầu) thay cho `base_commit_id` tĩnh; đối chiếu SRS UC-51 thật xác nhận thiết kế commit graph là **đúng yêu cầu SRS**, không phải overengineering ("System determines the point at which the two branches diverged", "refers to both contributing versions").
- **Verify:** `tsc`/`eslint`/`nest build` sạch. Test API thật (script `node`+`fetch`, tài khoản seed): tạo commit → tag → tạo branch → commit → fast-forward merge → xem chi tiết/lịch sử branch → xoá branch (kèm re-home) — tất cả pass sau khi sửa. **Chưa verify được** kiểm tra quyền sở hữu giữa 2 user thật (Supabase chặn rate-limit lúc tạo tài khoản test thứ 2) — đã verify thay thế bằng cách đọc lại toàn bộ code xác nhận mọi endpoint đã liệt kê đều gọi đúng hàm kiểm tra quyền.
- Đã dọn sạch dữ liệu test, khôi phục project seed về đúng trạng thái §3.
- Người dùng đã tự push (`ad1e6d4`) + merge PR #18 vào `main` (`c31c73e`).

**2. `feature/set-track-label-uc35` — sửa nhỏ hơn nhiều, đối chiếu đúng SRS UC-35 trước khi sửa:**

- SRS xác nhận đúng nghi ngờ ở §13: alt-flow 3.1 yêu cầu Escape phải **khôi phục tên cũ** (không phải chỉ đóng UI); exception 4.E2 yêu cầu **hiển thị giới hạn ký tự**.
- Sửa: thêm cờ `labelIntentHandledRef` để `onBlur` không "cướp" lưu sau khi Enter/Escape đã xử lý xong (nguyên nhân gốc: input bị unmount sau Enter/Escape khiến blur tự fire, và code cũ không phân biệt được "blur vì lý do gì"); thêm `@MinLength(1) @MaxLength(50)` server-side (`update-draft.dto.ts`, trước đó chỉ validate ở client); xoá style `trackName` chết; gộp số `50` thành hằng `MAX_LABEL_LENGTH`; thêm bộ đếm ký tự khi đang sửa (đúng yêu cầu 4.E2, trước đó chưa làm).
- **Xung đột merge thật khi người dùng tự merge trên GitHub:** nhánh PR Version Control (`#18`) merge vào `main` trước, mang theo 1 commit dọn dẹp xoá hẳn 2 prop chết `noteRowHeight`/`pitchCount` khỏi `TrackList` — đúng lúc PR uc35 cũng sửa gần đúng chỗ đó (thêm `onSetTrackLabel`). Đã hướng dẫn người dùng tự resolve conflict thủ công trên GitHub web editor (không dùng nút "Accept both" vì sẽ hồi sinh nhầm 2 prop chết — phía `main` ở đúng đoạn đó "rỗng" do là 1 phép xoá thuần, git không tự hiểu ý đồ xoá có chủ đích).
- Người dùng đã tự push (`1da83e6`) + resolve conflict + merge PR #19 vào `main` (`b9b1938`).

**3. Verify lại toàn bộ `main` sau khi merge cả 2 PR (yêu cầu riêng của người dùng, không phải đoán là ổn):**

- `git pull --ff-only` đồng bộ đúng (`b9b1938`).
- `npm install` lại (dependency `uuid` mới từ nhánh VC).
- `tsc --noEmit` sạch cả 2 workspace, `eslint` sạch (chỉ còn 1 warning cũ đã biết — `no-img-element` ở `Avatar`, không liên quan phiên này), `nest build` + `next build` sạch (đủ 17 route).
- Test API thật kết hợp cả 2 nhánh cùng lúc (script `node`+`fetch`, backend thật + Supabase thật): PUT draft tên track 50 ký tự → 200; tên rỗng → 400; tên 51 ký tự → 400 (xác nhận validate UC-35 hoạt động đúng trên `main` đã merge); tạo commit qua Version Control engine → 201; lấy lịch sử commit theo branch → 200 — **cả 5 case đều pass, xác nhận 2 nhánh không đụng độ nhau về mặt runtime** dù cùng sửa các file liên quan tới track/draft.
- Đã dọn sạch dữ liệu test, khôi phục project seed. Dev server đã tắt đúng cách.

**Cập nhật CLAUDE.md mục 10 (Gotcha):** thêm 2 bài học mới — (1) khi thêm cột FK mới, luôn kiểm tra xem có tạo ra quan hệ 2 chiều gây ambiguous embed cho PostgREST không (`select('*, x:table!inner(...)')` sẽ lỗi `PGRST201` nếu có >1 đường quan hệ, phải chỉ đích danh tên constraint); (2) không tin tưởng type TypeScript tự viết trong code phản ánh đúng schema DB thật — luôn đối chiếu trực tiếp qua `list_tables`/`information_schema` trước khi review/sửa code liên quan tới tên bảng/cột, đặc biệt với code chưa từng chạy thật lần nào.

**Trạng thái UC trên `main` sau phiên này:**

- **Không đổi so với §13:** UC-01→23, 84/85, 96-99 (29 UC, verify đầy đủ) + UC-08→12 (Explore, đã sửa bug). UC-24→41 nhóm MIDI Editor vẫn như §13 (10 UC có code+UI thật, phần lớn "Done chờ verify mức 3"; 8 UC còn thiếu code hoàn toàn: 32/33/36/38/39/40/41, và giờ UC-35 cũng đã có code+UI thật, verify mức API).
- **Mới lần đầu có code thật trên `main`: UC-42→52 (Version Control + Branch Management, 11 UC)** — nhưng **chỉ ở tầng backend/API, hoàn toàn CHƯA có UI** cho người dùng thật thao tác (không có màn hình commit history, branch switcher, merge conflict resolver nào trên frontend) — không nên tính "Done" theo nghĩa đầy đủ, chỉ nên ghi "API đã đúng + verify thật, chờ UI". UC-86 (Resolve merge conflicts) cũng có code backend (`resolveConflictsAndMerge`) nhưng cùng tình trạng — chưa có UI.
- **Tổng UC có code thật (kể cả chỉ API) trên `main`: 51** (29 + 10 MIDI Editor có UI + UC-35 có UI + 11 Version Control chỉ API) — nhưng chỉ nên báo cáo tiến độ thật là **29 UC hoàn thiện đầy đủ (verify mức 3) + 11 UC có code+UI chờ verify mức 3 (nhóm MIDI Editor) + 11 UC có API đúng nhưng chưa có UI (nhóm Version Control)**, tránh gộp chung 1 con số gây hiểu nhầm mức độ hoàn thiện.

**Còn dở/chưa làm:**
- UI cho toàn bộ nhóm Version Control/Branch Management (UC-42→52, 86) — module tiếp theo cần làm, có thể là việc của Hải hoặc phân công lại.
- Verify mức 3 cho nhóm MIDI Editor (UC-24→41) và UC-35 — vẫn chưa ai test tay qua trình duyệt thật.
- 7 UC MIDI Editor còn thiếu code hoàn toàn (32/33/36/38/39/40/41).
- Đã cập nhật `docs/STAVE_PROJECT_BIBLE.md` mục 44 (log ngắn, trỏ về đây).

---

## §15 — UI thứ 2 cho MIDI Editor (redesign theo mockup) + cơ chế toggle (12/09/2026)

**Bối cảnh:** Người dùng thấy `/projects/[id]/edit` "lạc quẻ" so với bộ thiết kế. Lần thử trước trong cùng phiên **đã làm sai** — chỉ đổi token màu nền trong khi giữ nguyên cấu trúc 2 vùng/toolbar/tên nút của UI gốc (reskin, không phải redesign); bản đó đã được `git stash` (`stash@{0}`), không dùng.

**Nguồn thiết kế — tìm bằng nội dung file, không đoán theo tên thư mục:**

- Grep `dc-import` toàn bộ 5 thư mục con trong `docs/STAVE design component sample/`: các file `*-print.dc.html` chỉ là harness in ấn; export tên **STAVE** (`STAVE.dc.html`) mới chứa 3 screen `dashboard | editor | compare`.
- `md5sum` xác nhận **cả 5 bản `STAVE.dc.html` giống hệt nhau** (`92468ee6…`, 49593 bytes) → chỉ có đúng 1 nguồn editor, không có chuyện chọn nhầm nhóm. Screen `editor` = dòng 156–317, đọc trực tiếp HTML (màu/spacing/DOM thật) thay vì suy từ ảnh PDF.

**Khác biệt cấu trúc so với UI gốc (lý do lần trước sai):** UI gốc 2 vùng (Tracks | piano roll). Mockup 3 vùng + header + footer riêng: header 60px (branch chip + transport segmented + Commit Changes), Tracks 262px (mỗi track: chấm màu + tên + M/S vuông 27px + thanh VOL có thumb tròn), piano roll (hàng 22px, cột phím 72px, ruler 34px, note bo góc 4px viền `#0F2A5C`, playhead `#B3242E`), panel phải **Project History 322px** (không tồn tại trong UI gốc), footer 34px.

**Đã làm — file MỚI hoàn toàn (`frontend/components/midi-editor/redesign/`):**

- `tokens.ts` — màu/kích thước trích thẳng từ `STAVE.dc.html` (có ghi rõ dòng nguồn).
- `editor-redesign.tsx` — shell 3 vùng + header + tool strip + footer.
- `track-panel.tsx` — panel Tracks theo mockup.
- `history-panel.tsx` — panel Project History.
- `ui-variant.ts` — store localStorage cho toggle.

**Sửa file cũ — tối thiểu, KHÔNG đổi hành vi UI gốc:**

- `midi-editor.tsx` + `midi-toolbar.tsx`: **112 dòng thêm vào, 0 dòng sửa/xoá** (`git diff --stat` xác nhận) — chỉ thêm state biến thể, nhánh render redesign, handler `handleSetTrackVolume`, và 1 nút "◧ Xem giao diện mới" ở cuối toolbar gốc.
- `track-list.tsx`: **không đụng gì**.
- `piano-roll.tsx`: tham số hoá `theme` (`classic | redesign`) gồm cả bảng màu lẫn hình học. Toàn bộ dòng bị xoá chỉ là hằng số/màu cứng chuyển vào `THEMES.classic` **giữ nguyên giá trị** (14/36/24, cùng mã màu) → classic vẽ y hệt trước. **Không đụng một dòng nào** của hit-test/kéo-thả/resize/box-select — đúng chủ trương không nhân bản logic (bài học từ bug playback ở PR #20).

**Toggle:** `localStorage["stave:editor-ui-variant"]` (`classic | redesign`), mặc định **classic**; đọc qua `useSyncExternalStore` (không `setState` trong effect — ESLint `react-hooks/set-state-in-effect` chặn; cũng tránh lệch hydration vì server snapshot luôn trả `classic`). Tab ẩn danh/storage bị chặn → fallback `classic`. Cùng 1 route, không tạo route mới, không API/migration.

**Trung thực về dữ liệu — KHÔNG bịa Version Control:**

- Panel Project History giữ đúng vị trí/kích thước mockup nhưng nội dung là: card "Bản nháp hiện tại" (dữ liệu **thật**: trạng thái autosave + số track/note) + empty-state "Chưa có lịch sử phiên bản — commit/branch/merge sẽ có ở bản cập nhật sau". Không vẽ danh sách commit giả, không vẽ card "Merge Conflict" giả.
- Branch hiện dạng **chip tĩnh** `main` (đúng invariant CLAUDE.md 4.2: project nào cũng có sẵn branch `main`), **không** làm dropdown giả vờ có nhiều lựa chọn.
- Nút "Commit Changes" giữ đúng vị trí mockup nhưng **disabled** + tooltip "Version Control chưa khả dụng" (backend đã có `POST /commits` nhưng `lib/api-client.ts` chưa có hàm nào gọi tới).
- Footer chỉ hiện số liệu thật (trạng thái lưu, BPM, nhịp, số note/track). **Bỏ hẳn** "Connected · Synced" và "KEY C Minor" của mockup vì không có nguồn dữ liệu thật.
- Nav "Dashboard / MIDI Editor / Branches" trong mockup **không đưa vào** — app đã có `SiteHeader` + tabs riêng ở trang cha, và màn "Branches" chưa tồn tại.

**Một điểm mới so với UI gốc (cần biết):** thanh VOL là control **thật** (ghi vào `track.volume`, trường này vốn đã có trong snapshot và đã được `startPlayback` dùng) — UI gốc trước giờ không có chỗ nào chỉnh volume. Chọn làm thật thay vì vẽ thanh chết để không tạo affordance giả.

**Verify:**

- [x] Mức 1: `tsc --noEmit` sạch; `eslint components/midi-editor` sạch (chỉ còn 3 warning `exhaustive-deps` có sẵn từ trước trên `main`, không liên quan); `npm run build` sạch, đủ 18 route như cũ.
- [x] Mức 2 (thay cho việc không lái được trình duyệt): dựng 1 route preview **tạm** rồi render thật qua Next dev → `HTTP 200`, HTML chứa đủ mốc của cả 3 vùng ("Project History", "TRACKS", "Add Track", "Commit Changes", "Chưa có lịch sử phiên bản", "Quantize", "Import MIDI", "BPM", canvas piano roll). Kiểm tra 14 chỗ khớp chữ "error" → **đều là scaffolding `global-error` mặc định của Next** (`"error":"$undefined"`), không có lỗi runtime. **Đã xoá route tạm** sau khi verify.
- [ ] **Mức 3 — cần người dùng tự mở trình duyệt**: bấm nút toggle qua lại (kiểm tra không mất note/track đang sửa), vẽ/kéo/resize note trong UI mới (hàng 22px cao hơn UI gốc — cần xác nhận hit-test vẫn "đúng tay"), kéo thanh VOL, phát nhạc, và đối chiếu mắt thường với `STAVE design component.pdf` trang editor.
- [x] Đã tắt dev server (verify `Get-NetTCPConnection -LocalPort 3000` không còn listen), đúng CLAUDE.md mục 9.

**Còn dở/chưa làm:**

- Verify mức 3 (ở trên) — chưa làm, cần người dùng.
- Panel Project History vẫn là placeholder trung thực cho tới khi có UI Version Control thật (UC-42→52, 86 — backend đã xong từ §14, frontend chưa nối).
- Chưa commit — toàn bộ §15 đang nằm trên working tree của `main` (từ `bca1fc2`), chờ người dùng review rồi tự tạo nhánh/commit.
- Bản reskin sai của lần thử trước vẫn nằm ở `git stash@{0}` — xoá bằng `git stash drop` nếu không cần nữa.

---

## §16 — UI thật cho Version Control: UC-42 Commit, UC-43 History, UC-44 Tag, UC-46 Restore (12/09/2026)

**Bối cảnh:** Backend Version Control xong + verify từ §14, nhưng `lib/api-client.ts` chưa có hàm nào gọi tới; nút "Commit Changes" ở bản redesign (§15) đang disabled, panel History là empty-state. Phiên này nối UI thật cho đúng 4 UC trên. **Không đụng** Compare/Diff (UC-45), Branch Management (UC-47→52), Merge/Conflict (UC-51/86); không migration DB; không sửa logic hit-test/kéo-thả/resize của piano roll.

**Đối chiếu code + schema thật trước khi viết (bài học §14):** đọc `commits.controller.ts`, `branches.controller.ts`, toàn bộ DTO + `commits.service.ts`; tra `information_schema.columns` (commits/commit_tags/branches/drafts/projects) và `pg_get_functiondef('create_commit_atomic')` — khớp code. Endpoint tag thật là `POST /commits/:id/tag` (số ít, body `{ tag }`, không có `color`). Branch id lấy qua `GET /projects/:id/branches` (chọn `is_default`) — cùng branch mà `GET|PUT /projects/:id/draft` đang dùng.

**Phát hiện lỗi backend thật (đã kiểm chứng bằng test, CHƯA sửa — ngoài phạm vi):** `DraftSnapshotDto.meta` trong `backend/src/commits/dto/create-commit.dto.ts` không có decorator validate nào → `ValidationPipe({ whitelist: true })` **cắt bỏ `meta`** khỏi payload. Test thật: gửi `snapshot` với tempo 99, nhịp 3/4 → commit lưu thành tempo 120, 4/4 (giá trị mặc định). `DraftNoteDto` còn đòi `startTime` trong khi snapshot thật dùng `start`. **Frontend né lỗi này bằng thiết kế:** không bao giờ gửi `snapshot` vào `POST /commits` — flush draft trước (`PUT /projects/:id/draft`, DTO validate đầy đủ), rồi commit không kèm snapshot để backend đọc từ bảng `drafts`. Nên sửa DTO backend ở 1 PR `bugfix/` riêng (thêm `@ValidateNested() @Type(() => DraftMetaDto)` cho `meta`, bỏ `startTime`) trước khi có code nào khác gửi snapshot trực tiếp.

**Đã làm — file mới trong `frontend/components/midi-editor/redesign/`:**

- `use-version-control.ts` — hook giữ toàn bộ state/lời gọi API: nạp branch mặc định → lịch sử (20 commit mới nhất, hiện `total` thật); `commit` (flush draft → `POST /commits` kèm `expectedHeadCommitId` → 409 thì tự nạp lại head + lịch sử); `tag`; `restore`; thông báo ngắn tự ẩn 4s.
- `commit-dialog.tsx` (UC-42) — message bắt buộc, bộ đếm `x/200` (cùng kiểu bộ đếm UC-35), Ctrl/Cmd+Enter gửi; tóm tắt số note/track thêm/xoá/sửa + đổi tempo/nhịp so với commit gần nhất. Branch chưa có commit → hiện "Bản ghi phiên bản đầu tiên", không hiện số so sánh. Lỗi hiện tại chỗ, không mất message đã gõ.
- `change-summary.ts` — đếm thay đổi theo `id` note/track (CLAUDE.md 4.1). Chỉ đếm, không vẽ diff (UC-45 để phiên sau).
- `restore-dialog.tsx` (UC-46) — xác nhận bắt buộc: nói rõ tạo commit mới, lịch sử giữ nguyên; thêm cảnh báo đỏ "thay đổi chưa lưu sẽ bị ghi đè" **chỉ khi** draft đang thật sự có thay đổi chưa lưu.
- `modal.tsx` — khung dialog dùng chung (Escape/bấm nền để đóng, bị chặn khi đang gửi request).
- `history-panel.tsx` — viết lại: danh sách commit thật (message, tác giả, thời gian tương đối qua `formatRelativeTime`, tag, badge "HIỆN TẠI" cho head); trạng thái đang tải / lỗi + "Thử lại" / empty-state (giữ làm fallback khi chưa có commit). Bấm 1 commit → mở chi tiết (id, số track/note, BPM) + nút "Gắn tag" (ô nhập + bộ đếm `x/30`, lỗi thật từ backend) + "Khôi phục" (khoá khi commit đó đang là head).

**Sửa file cũ — chỉ thêm, không sửa/xoá dòng nào có sẵn:**

- `lib/api-client.ts` — thêm `listProjectBranches`, `createCommit`, `getCommitHistory`, `getCommit`, `restoreCommit`, `tagCommit`, type `Branch`, hằng `COMMIT_MESSAGE_MAX_LENGTH`/`TAG_NAME_MAX_LENGTH`. Đi qua `apiFetch` có sẵn (tự gắn `Authorization` + `X-Session-Id`). Không thêm hàm cho Compare/Branch/Merge.
- `midi-editor.tsx` — thêm `flushDraft` (huỷ debounce, PUT ngay, ném lỗi để không commit nhầm bản cũ) và `applyRestoredSnapshot` (huỷ autosave đang chờ — nó mang snapshot CŨ và sẽ ghi đè ngược lên draft vừa khôi phục; nạp snapshot từ response; xoá chọn note; giữ track đang chọn nếu còn tồn tại). Truyền thêm `projectId`/`snapshot`/2 handler trên vào `EditorRedesign`. UI gốc (classic) không đổi, không có commit.
- `redesign/editor-redesign.tsx` — nút "Commit Changes" bỏ `disabled` + tooltip cũ (chỉ khoá khi đang tải/lỗi branch, tooltip nói rõ lý do); chip branch ở header + panel hiện tên branch thật từ API; gắn 2 dialog.

**Kiểm tra nhánh `feature/UC36-metronome-loop-playback` (theo yêu cầu người dùng giữa phiên):** 1 commit `8841230`, chỉ sửa `midi-editor.tsx`/`midi-toolbar.tsx`/`piano-roll.tsx` (metronome, vùng loop, chỉnh BPM) — **không trùng** gì với Version Control. Nhưng nhánh fork từ `b9b1938` (trước PR #20 và #21): viết lại `handlePlay`/`handleStop` theo bản cũ và tự thêm state `loopOn` thứ 2 trong khi `main` đã có `loopOn` + `loopAnchorRef` từ PR #20 → khi merge sẽ conflict nặng ở vùng playback và bị trùng tính năng loop. Người review PR đó cần yêu cầu merge `main` vào trước và dùng lại `loopOn` có sẵn.

**Verify:**

- [x] Mức 1: `tsc --noEmit` sạch; `eslint components/midi-editor lib/api-client.ts` 0 error (còn đúng 3 warning `exhaustive-deps` có sẵn trên `main`); `npm run build` sạch, đủ 18 route.
- [x] Mức 2: script `node`+`fetch`, backend thật + Supabase thật, tài khoản seed §3, project seed 3 (`10cd5e9f-…`) — **30/30 PASS**: lấy branch mặc định; PUT draft; message rỗng → 400; 201 ký tự → 400; đúng 200 ký tự → 201; commit qua đường draft giữ đúng tempo 140 + 2 note + 1 track; commit lại khi không đổi → 400 (BR-40); gửi snapshot trực tiếp làm mất meta (xác nhận lỗi backend ở trên); lịch sử đủ 3 commit, mới nhất trước, đúng shape (author + tags); `GET /commits/:id` đúng; tag → 201; tag trùng tên trong project → 409 ("Tag name already exists in this project" — UI hiện nguyên câu này); tag 31 ký tự → 400; tag hiện đúng commit trong lịch sử; restore commit đang là head → 400; restore → 201, commit mới mang đúng snapshot cũ, lịch sử còn đủ 3 commit cũ + 1 mới ở đầu, draft sau restore deep-equal snapshot đã khôi phục; `expectedHeadCommitId` cũ → 409.
- [x] Đã dọn: xoá commit/tag/draft test, `head_commit_id` về `NULL`, xoá session test `vc-api-test` → project seed 3 về đúng trạng thái trước test (0 commit, 0 draft, head null, `active_branch_id` null — đã query xác nhận).
- [x] Đã tắt backend (dừng tiến trình đang nghe cổng + các wrapper `nest start --watch`), `Get-NetTCPConnection -LocalPort 3000,3001` không còn listen — đúng CLAUDE.md mục 9.
- [ ] **Mức 3 — cần người dùng bấm tay trên trình duyệt** (chưa ai làm): mở dialog Commit, xem tóm tắt thay đổi đúng/sai; commit lần đầu hiện "Bản ghi phiên bản đầu tiên"; sửa note rồi commit **ngay** (trong vòng 2s autosave) → commit phải có thay đổi vừa sửa; lịch sử hiển thị đúng, bấm mở chi tiết; gắn tag, thử tag trùng; khôi phục khi đang có thay đổi chưa lưu → phải thấy cảnh báo đỏ; bấm **Huỷ** ở dialog khôi phục → note đang vẽ dở không mất; khôi phục thật → piano roll đổi đúng về bản cũ và không bị autosave cũ ghi đè lại sau 2s.

**Trạng thái UC sau phiên này:** UC-42/43/44/46 lên mức "có code + UI thật, verify mức 2 (API), chờ verify mức 3" — **chỉ ở bản UI redesign** (UI classic không có commit). UC-45, 47→52, 51/86 vẫn "API đúng, chưa có UI".

**Còn dở/chưa làm:**

- Verify mức 3 ở trên.
- UI cho Compare/Diff (UC-45) → Branch Management (UC-47→52) → Merge/Conflict (UC-51/86) — các phiên sau, theo đúng thứ tự đã thống nhất với Claude Web.
- ~~Lỗi DTO `meta` của `POST /commits`~~ — **đã sửa, xem §16.1 ngay dưới.**
- Lịch sử mới tải 20 commit gần nhất (có ghi "đang hiện N trên tổng M"); chưa có nút tải thêm.
- Chưa commit — toàn bộ §15 + §16 đang nằm trên working tree của `main`, chờ người dùng review rồi tự tạo nhánh/commit.

---

### §16.1 — Sửa lỗi DTO `meta` bị `ValidationPipe` cắt mất trong `POST /commits` (12/09/2026)

**Bối cảnh:** §16 đã phát hiện nhưng chưa sửa: `DraftSnapshotDto.meta` trong `backend/src/commits/dto/create-commit.dto.ts` là field không có decorator validate nào, nên `ValidationPipe({ whitelist: true })` (`backend/src/main.ts`) coi nó là property lạ và **âm thầm cắt bỏ** khỏi payload — bất kỳ request nào gửi `snapshot.meta` trực tiếp vào `POST /commits` sẽ mất tempo/timeSignature/ppq thật, rơi về mặc định 120/[4,4]/480. Đã sửa theo đúng yêu cầu, không tạo nhánh/commit — nằm chung working tree với §15/§16 chờ người dùng tự commit.

**Đã sửa (`backend/src/commits/dto/create-commit.dto.ts`):**

- Thêm class `DraftMetaDto` (tempo/timeSignature/ppq với đủ decorator — cùng convention với `DraftMetaDto` đã có sẵn ở `backend/src/drafts/dto/update-draft.dto.ts`).
- `DraftSnapshotDto.meta` đổi từ object literal không kiểu sang `@ValidateNested() @Type(() => DraftMetaDto) meta!: DraftMetaDto` — giờ `ValidationPipe` nhận diện đúng, không còn whitelist-strip.
- `DraftNoteDto`: bỏ field `startTime` (required, sai tên so với schema thật) và field `start` (optional, chỉ là fallback chết) — gộp lại thành đúng 1 field `start!: number` khớp `DraftNote.start` thật (CLAUDE.md 4.2 — tick nguyên).
- `commits.service.ts` (`normalizeSnapshot`): sửa `n.startTime ?? n.start ?? 0` → `n.start ?? 0` cho khớp DTO mới (bắt buộc phải sửa cùng lúc để build không vỡ — không phải thay đổi phạm vi ngoài yêu cầu).

**Verify:**

- [x] `npx tsc --noEmit` (backend) sạch, `eslint src/commits` 0 lỗi, `nest build` sạch.
- [x] Script `node`+`fetch` mới (backend thật + Supabase thật, tài khoản + project seed §3, branch mặc định đang sạch) — **9/9 PASS**: `POST /commits` kèm `snapshot.meta = { tempo: 99, timeSignature: [3,4], ppq: 480 }` → commit trả về **đúng y hệt** tempo 99 / [3,4] / 480 (trước khi sửa test tương tự ở §16 đã ghi nhận bị cắt về 120/[4,4]/480); `note.start` giữ đúng giá trị gửi lên qua field `start`; đồng thời xác nhận **validate vẫn hoạt động đúng** — snapshot thiếu `timeSignature`/`ppq` trong `meta` vẫn bị chặn 400 (không phải giờ cho qua luôn vì lỏng lẻo).
- [x] Đã dọn dữ liệu test (commit/draft/session) khỏi Supabase, branch mặc định của project seed 3 về lại `head_commit_id = NULL`, 0 commit, 0 draft — đã query xác nhận.
- [x] Đã tắt backend đúng cách (dừng tiến trình đang nghe cổng 3001 + wrapper `nest start --watch`), `Get-NetTCPConnection -LocalPort 3000,3001` không còn listen.

**Ghi chú:** frontend (`lib/api-client.ts` ở §16) vẫn cố tình KHÔNG gửi `snapshot` trực tiếp vào `POST /commits` (đi đường flush draft → server đọc từ bảng `drafts`) — đó là quyết định thiết kế đúng đắn độc lập với bug này (tránh gửi lại toàn bộ snapshot qua 1 DTO validate lỏng hơn `UpdateDraftDto`), không phải chỉ để né bug, nên không cần đổi lại bây giờ dù DTO đã an toàn hơn.

---

## §17 — Sửa layout tràn trang + loạt cải tiến MIDI Editor theo phản hồi trực tiếp (12/09/2026)

**Bối cảnh:** Người dùng gửi ảnh chụp trang `/projects/:id/edit` bị kéo dài bất thường xuống dưới (khoảng trắng khổng lồ trước khi tới footer site), rồi lần lượt yêu cầu thêm 4 việc nhỏ ngay trong lúc đang xử lý: (1) thay `window.confirm`/`window.alert` bằng popup trong app, (2) master volume chỉnh đồng bộ mọi track, (3) cho phép xoá track cuối cùng, (4) Ctrl+C/V/Z/A hoạt động đầy đủ (Ctrl+Z chưa từng có).

**1. Sửa lỗi layout tràn trang (`frontend/app/layout.tsx`):**

- Nguyên nhân thật: `body` chỉ có `min-h-full` (không phải `h-full`) và `main` là `flex-1` nhưng thiếu `min-h-0`. Theo spec flexbox, min-height mặc định của 1 flex item là `auto` (co theo nội dung) trừ khi item đó có `overflow` khác `visible` — `main` không có, nên nó không bao giờ co lại đúng theo phần còn lại của viewport. MIDI Editor (cả 2 biến thể) dùng `height: "100%"` để tự bó gọn trong viewport và cuộn nội bộ; khi `main` không resolve về 1 giá trị px thật, chuỗi `height:100%` đó suy biến thành `auto`, khiến nội dung editor tràn tự nhiên xuống dưới thay vì cuộn nội bộ, đẩy `SiteFooter` xuống rất xa.
- Sửa: `body` đổi `min-h-full` → `h-full`; `main` thêm `min-h-0`. An toàn cho các trang nội dung thường (không dựa vào chiều cao chính xác, vẫn cuộn bình thường khi nội dung dài hơn viewport — overflow mặc định `visible` của `html`/`body` vẫn cho phép trang cuộn dù kích thước box đã cố định).
- Verify: script Playwright (`chromium` headless, đăng nhập bằng tài khoản seed, mở `/projects/10cd5e9f-.../edit`) đo `document.body.scrollHeight` — cả UI gốc và UI redesign đều bằng đúng chiều cao viewport (900px), không còn tràn. Ảnh chụp toàn trang xác nhận footer nằm đúng vị trí ngay dưới editor.

**2. Thay `window.confirm()`/`window.alert()` bằng popup trong app:**

- Grep toàn bộ `frontend` chỉ ra đúng 2 chỗ dùng dialog gốc trình duyệt: `handleDeleteTrack` (UC-29, `midi-editor.tsx`) dùng `window.confirm`, và nút Fork placeholder (`app/explore/[id]/page.tsx`) dùng `window.alert`.
- Thêm `components/ui/confirm-dialog.tsx` (`ConfirmDialog`) — theo đúng convention overlay đã có sẵn ở `app/projects/page.tsx`/`app/admin/users/page.tsx` (`bg-slate-900/40` + `Card` + `Button`), không phát minh pattern mới. `handleDeleteTrack` giờ mở dialog qua state `pendingDeleteTrack`, xoá thật xảy ra ở `confirmDeleteTrack()`. Áp dụng cho cả 2 biến thể UI (dialog dùng chung, chỉ đổi tiếng Anh/Việt cho khớp ngôn ngữ từng UI).
- Thêm `components/ui/toast.tsx` (`Toast`) — popup thông báo ngắn tự ẩn sau 4s, thay cho `alert()` ở nút Fork placeholder.
- Verify: script Playwright gắn `page.on('dialog', ...)` — nếu bất kỳ dialog gốc nào của trình duyệt còn xuất hiện, test tự fail ngay. Toàn bộ luồng xoá track (nhiều lần liên tiếp) chạy qua mà **không có native dialog nào bật lên** — xác nhận đã thay hoàn toàn.

**3. Master Volume — chỉnh âm lượng đồng bộ cho tất cả track (yêu cầu mới):**

- Thêm 1 `GainNode` chung (`masterGainRef` trong `midi-editor.tsx`) chèn giữa mọi `panner` và `ctx.destination` trong `startPlayback` — kéo 1 slider chỉnh âm lượng của toàn bộ track cùng lúc, thay vì phải chỉnh từng thanh VOL riêng.
- **Quyết định thiết kế quan trọng:** giá trị này CHỈ ảnh hưởng output lúc phát (runtime, giữ ở React state cục bộ `masterVolume`), **không ghi vào `track.volume` của từng track và không thêm field mới vào snapshot** — vì cấu trúc `commits.snapshot`/`drafts.snapshot` đã khoá theo CLAUDE.md 4.2, thêm field hoặc mutate hàng loạt sẽ biến 1 thao tác "nghe thử tổng thể" thành thay đổi dữ liệu thật cần commit, sai bản chất.
- Effect riêng đảm bảo kéo slider **trong lúc đang phát** cũng có tác dụng ngay (không cần dừng/phát lại).
- UI: thêm slider `🔊`/`Volume2`/`VolumeX` + % vào cả toolbar UI gốc (`midi-toolbar.tsx`) và tool strip UI redesign (`redesign/editor-redesign.tsx`).
- Verify: Playwright kéo slider xuống 50% qua DOM input event → label cập nhật đúng "50%".

**4. Cho phép xoá track cuối cùng (bỏ BR-30 cũ, yêu cầu mới — đổi ý sản phẩm, không phải bug):**

- Trước đây `handleDeleteTrack`/nút xoá bị khoá khi `tracks.length <= 1` (comment "BR-30: Project must have at least 1 track"). Người dùng yêu cầu bỏ hẳn giới hạn này. Đã gỡ điều kiện chặn ở cả 3 chỗ: `midi-editor.tsx` (`handleDeleteTrack`), `track-list.tsx` (UI gốc), `redesign/track-panel.tsx` (UI redesign). Cả 2 UI đã có sẵn empty-state "No tracks yet"/"Chưa có track nào" cho đúng trường hợp 0 track, không cần thêm gì.
- **Lưu ý ghi lại, không tự sửa thêm:** đây là thay đổi ngược với business rule đã tài liệu hoá trước đó (BR-30) theo yêu cầu trực tiếp của người dùng — nếu SRS gốc còn tham chiếu BR-30 ở chỗ khác, cần đối chiếu lại khi làm Compare/Diff hoặc bất kỳ chỗ nào giả định "luôn có ít nhất 1 track".
- Verify: Playwright xoá liên tiếp tới khi còn 0 track (qua đúng `ConfirmDialog` ở mục 2, không phải native confirm) — không bị chặn ở track cuối, empty-state hiển thị đúng.

**5. Undo/Redo — Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y (tính năng mới hoàn toàn, trước đây chưa từng có):**

- Ctrl+C/V/A (copy/paste/select-all, UC-32/33) đã hoạt động sẵn từ trước — chỉ thiếu Undo. Thêm 2 stack `undoStackRef`/`redoStackRef` (giới hạn 100 bước) tại đúng 1 điểm nghẽn `updateSnapshot()` — mọi chỉnh sửa (note, track, quantize, paste...) đều đi qua hàm này nên không cần sửa gì trong `piano-roll.tsx` (đúng ràng buộc "không đụng logic kéo/thả/resize", bài học từ bug PR #20).
- **Vấn đề phải xử lý:** kéo/resize note trên piano roll bắn `onNotesChange` liên tục theo từng pixel di chuột — nếu ghi 1 điểm khôi phục cho MỖI lần gọi, 1 lần Ctrl+Z chỉ lùi được vài pixel thay vì lùi nguyên thao tác kéo. Giải quyết bằng cách gộp mọi lần gọi liên tiếp trong 1 khoảng lặng ngắn (500ms không có thay đổi mới) thành đúng 1 điểm khôi phục (`historyBurstActiveRef` + timer) — không cần biết piano-roll khi nào bắt đầu/kết thúc kéo.
- Restore (UC-46) xoá sạch lịch sử undo/redo cũ (khôi phục về 1 commit là mốc mới, không phải tiếp nối các sửa cục bộ trước đó — tránh Ctrl+Z lùi ngược qua điểm khôi phục).
- UI: thêm nút Undo/Redo (có disable đúng theo `canUndo`/`canRedo`) cạnh Copy/Paste ở cả 2 biến thể.
- Verify: Playwright — Add Track → Undo (số track về lại như cũ) → Redo (tăng lại) — đúng cả 2 chiều; nút Undo tự động disable khi vừa load trang (chưa có gì để undo) và sau khi undo hết lịch sử.

**Verify tổng hợp (mức 2 — script tự động, KHÔNG phải mức 3 người dùng tự bấm):**

- [x] `npx tsc --noEmit`, `npx eslint .` (toàn bộ `frontend`) — 0 lỗi, chỉ còn 6 warning đã biết từ trước (3 `exhaustive-deps` cũ + 2 mới cùng loại cho `handleUndo`/`handleRedo` + 1 `no-img-element` ở `Avatar`), không phải lỗi mới. `npm run build` sạch, đủ 18 route.
- [x] Playwright (`chromium` headless, cài tạm bằng `npm install --no-save playwright` — không sửa `package.json`, đã gỡ lại sau khi xong) chạy trên chính dev server thật của người dùng ở `localhost:3000` (không tự khởi động thêm 1 server trùng — phát hiện `next dev` đã chạy sẵn, dùng lại thay vì spawn thêm) + backend do phiên này tự khởi động — **15/15 PASS**: layout không tràn (2 biến thể), master volume, xoá track tới 0 (qua dialog trong app, không native dialog nào xuất hiện suốt test), Undo/Redo qua Add Track.
- [x] Trước khi chạy Playwright: backup draft project seed 3 qua API (đang là 0 track/0 note); sau khi test xong, query lại xác nhận draft **về đúng lại 0 track/0 note**, 0 commit phát sinh trên branch mặc định — không cần ghi đè thủ công vì trạng thái test kết thúc trùng khớp trạng thái ban đầu.
- [x] Đã dọn session test (`snapshot-draft-backup`, 2 session HeadlessChrome từ Playwright login) khỏi Supabase.
- [x] Đã tắt backend do phiên này tự khởi động (dừng đúng theo PID nghe cổng 3001 + toàn bộ wrapper `nest start --watch` còn sót từ các lần khởi động trước đó trong phiên) — `Get-NetTCPConnection -LocalPort 3001` sạch. **Không đụng** frontend `localhost:3000` — đó là dev server của người dùng tự chạy từ trước, không phải tiến trình do phiên này khởi động (theo đúng CLAUDE.md mục 9: chỉ tắt tiến trình mình tự khởi động).

**Còn dở/chưa làm:**

- Chưa có verify mức 3 (người dùng tự bấm tay) cho riêng 5 việc ở §17 — Playwright đã lái qua UI thật nên độ tin cậy cao hơn "chỉ đọc code", nhưng vẫn khuyến khích người dùng tự thử qua lại UI gốc/redesign, kéo note thật (không chỉ Add Track) rồi Ctrl+Z, và thử slider Master Volume trong lúc nhạc đang phát để nghe hiệu ứng thật.
- BR-30 cũ (giới hạn "ít nhất 1 track") đã bỏ theo yêu cầu — cần đối chiếu lại SRS nếu có chỗ khác trong hệ thống giả định điều này (chưa rà soát toàn bộ, chỉ sửa đúng 3 chỗ tìm thấy qua grep).
- Chưa commit — §15/§16/§16.1/§17 đều đang nằm chung trên working tree của `main`, chờ người dùng review rồi tự tạo nhánh/commit (nên cân nhắc tách thành nhiều nhánh nhỏ theo đúng quy tắc Git mục 8.2, vì đây là nhiều task khác nhau gộp lại 1 phiên).

---

## §18 — Tìm nhạc cụ theo tên (UC-30) — 128 nhạc cụ cuộn tay quá mất thời gian (12/09/2026)

**Bối cảnh:** Người dùng phản hồi: dropdown gán nhạc cụ cho track (`GM_INSTRUMENTS`, 128 nhạc cụ chia theo nhóm) chỉ có 1 hộp cao 240px cuộn tay, không có cách nào tìm nhanh — phải kéo lên xuống rất mất thời gian để tìm đúng nhạc cụ.

**Đã làm — cả 2 biến thể UI (`track-list.tsx` UI gốc, `redesign/track-panel.tsx` UI redesign):**

- Thêm ô tìm (`<input>`) ngay dưới tiêu đề dropdown, tự động focus khi mở dropdown (kể cả đổi track khác hoặc mở lại) qua `useEffect` — chỉ lo mỗi việc focus, KHÔNG `setState` trong effect (tránh lỗi ESLint `react-hooks/set-state-in-effect` đã gặp ở §16); việc xoá ô tìm về rỗng làm ngay tại nút bấm mở dropdown, không phải trong effect.
- Lọc theo `name` HOẶC `category` (không phân biệt hoa/thường) — gõ "guitar" ra mọi guitar, gõ "strings" ra cả nhóm dây. Chỉ hiện nhóm (category) còn ít nhất 1 kết quả khớp, ẩn hẳn nhóm rỗng thay vì hiện tiêu đề nhóm trống.
- Enter chọn luôn kết quả khớp đầu tiên và đóng dropdown ngay (gõ + Enter là xong, không cần rời tay khỏi bàn phím để click chuột). Escape đóng dropdown như cũ.
- Option "None (Default)"/"Không gán (mặc định)" ẩn đi khi đang gõ tìm (không có nghĩa để lọc theo tên) và hiện lại khi ô tìm rỗng.
- Gõ tên không khớp bất kỳ nhạc cụ nào → hiện "Không tìm thấy nhạc cụ nào" thay vì để trống im lặng.
- Không đổi cấu trúc dữ liệu (`GM_INSTRUMENTS`), không đổi hành vi `onAssignInstrument` — chỉ thêm lớp lọc hiển thị phía client.

**Verify:**

- [x] Mức 1: `tsc --noEmit`, `eslint` (2 file đổi) — 0 lỗi. `npm run build` sạch, đủ 18 route.
- [x] Mức 2: Playwright (`chromium` headless) trên dev server thật (backend + frontend do phiên này tự khởi động, đã tắt cả 2 sau khi xong) — **9/9 PASS** cho cả 2 biến thể: ô tìm có mặt + tự focus; gõ "violin" lọc đúng, ẩn các nhạc cụ không khớp (VD "Piano" biến mất); gõ tên không tồn tại hiện đúng thông báo rỗng; Enter chọn luôn kết quả đầu + đóng dropdown; UI gốc gõ "guitar" lọc đúng.
- [x] Trước/sau test: backup + khôi phục lại draft project seed 3 qua API PUT (test có bấm "Add Track" + gán nhạc cụ Violin, đã ghi đè lại đúng bằng snapshot rỗng gốc — xác nhận lại 0 track/0 note). Đã xoá toàn bộ session test (kể cả các session HeadlessChrome từ Playwright login) khỏi Supabase.
- [x] Đã tắt cả 2 dev server phiên này tự khởi động (backend cổng 3001, frontend cổng 3000 — do server gốc của người dùng đã tắt sẵn từ trước khi vào việc này); verify lại bằng `Get-NetTCPConnection -LocalPort 3000,3001` không còn listen. Đã gỡ `playwright` cài tạm (`--no-save`, không đụng `package.json`).
- [ ] Mức 3 (người dùng tự bấm tay) — chưa làm, khuyến khích thử thêm với các nhạc cụ có tên tiếng Việt hoá gần giống (không có, tên toàn bộ là tiếng Anh GM chuẩn) và bàn phím có dấu.

**Còn dở/chưa làm:** không có — việc này gọn, đã xong trong 1 lượt. Vẫn nằm chung working tree với §15/§16/§16.1/§17, chưa commit.

---

## §19 — Review merge-readiness 3 nhánh chưa merge (UC-36/38/40) + tự fix, tách sang 3 nhánh `bugfix/` (12/09/2026)

**Bối cảnh:** Người dùng gửi ảnh chụp GitHub cho thấy 3 nhánh đang mở (`feature/UC40-adjust-track-volume`, `feature/UC38-Export-project-audio`, `feature/UC36-metronome-loop-playback`), nhờ review code trước khi tự merge (không merge/commit hộ), liệt kê theo thứ tự bug/code smell/lỗi thiết kế hệ thống. Sau đó người dùng nhờ tự fix và đẩy sang nhánh mới tiền tố `bugfix/`, đảm bảo merge sạch vào `main` mới nhất.

**Review ban đầu (không sửa gì) — phát hiện chính:**

- `feature/UC38-Export-project-audio`: base ngang `main` lúc đó, không conflict, nhưng có 2 bug thật — export bỏ qua `track.solo` (khác hẳn playback thật), và luôn tổng hợp `osc.type = "sine"` bất kể nhạc cụ track (playback thật map theo họ nhạc cụ qua `getOscillatorType`). Lỗi thiết kế nghiêm trọng hơn: chọn "MP3" vẫn âm thầm xuất file WAV đổi tên `.mp3`, không có nhãn PLACEHOLDER — vi phạm thẳng quy ước CLAUDE.md §4.7.
- `feature/UC40-adjust-track-volume`: sạch, xây trên UC38, không bug đáng kể — chỉ là slider volume UI gốc chưa từng được nối dây (bản redesign đã có).
- `feature/UC36-metronome-loop-playback`: base **cũ hơn `main` 7 commit** (tách trước cả UC-32/33 và trước commit `78dc85c` — chính commit sửa bug "playback loop/seek stopping silently" trên `main`). `git merge-tree` xác nhận 20 điểm conflict trải trên 3 file. Bug cụ thể trong nhánh: không có auto-stop khi hết bài (không loop), metronome không đồng bộ theo vị trí bắt đầu phát thật (luôn coi tiếng click đầu là phách 1), hardcode 4/4 bỏ qua `snapshot.meta.timeSignature` có sẵn, bật/tắt Loop giữa lúc phát không có tác dụng ngay (đúng loại bug closure mà `78dc85c` vừa fix cho code khác). Nếu merge nguyên trạng còn có nguy cơ xoá mất Copy/Paste/Pause/Undo-Redo đã có trên `main` (base quá cũ, không có các nút này).

**Đã fix — dùng `git worktree` (không đụng working tree chính, không tự commit/merge):**

- Tạo 3 worktree từ `origin/main` mới nhất (lúc đó `b408e0f`, đã có PR #24 redesign merge) + branch mới tại chỗ: `bugfix/export-project-audio-realism`, `bugfix/adjust-track-volume`, `bugfix/metronome-loop-playback`.
- **UC-38 fix:** tách `getOscillatorType` ra `frontend/lib/instrument-waveform.ts` dùng chung giữa playback (`midi-editor.tsx`) và export (`lib/audio-exporter.ts`) — export giờ tôn trọng solo + đúng waveform theo nhạc cụ. Bỏ hẳn lựa chọn MP3 giả (chỉ còn WAV thật, trung thực) thay vì gắn nhãn PLACEHOLDER — quyết định tự đưa ra vì thêm dependency encoder MP3 thật (lamejs) là quyết định về scope cần hỏi riêng.
- **UC-40 fix:** nối `onSetTrackVolume`/`handleSetTrackVolume` (đã có sẵn trên `main` cho bản redesign) vào `TrackList` UI gốc, thêm đúng 1 slider VOL dưới track đang chọn.
- **UC-36 fix:** viết lại metronome trên đúng kiến trúc `startPlayback(fromTick)` hợp nhất hiện tại của `main` (không đụng lại phần Loop — đã tự đúng từ `78dc85c`). Lookahead scheduler tính downbeat từ `fromTick` (không phải luôn từ 0), dùng `timeSignature[0]` thay vì hardcode 4, có `metronomeOnRef` để bật/tắt có tác dụng ngay giữa lúc đang phát. Thêm luôn BPM input (thuộc scope gốc UC-36). Cố ý **không** thêm nút Metronome vào bản UI redesign (giữ đúng tiền lệ UC-40/CLAUDE.md §5 — redesign đang trễ hơn 1 số UC).
- Verify mức 1: tạo junction `node_modules` (PowerShell, không phải symlink — Windows) trỏ về `node_modules` đã cài sẵn ở repo chính để chạy `tsc --noEmit` + `eslint` trực tiếp trong từng worktree mà không cần `npm install` lại — sạch cả 3 nhánh (chỉ còn warning `exhaustive-deps` có sẵn từ trước).
- `git merge-tree` xác nhận cả 3 nhánh **0 conflict** với `origin/main` tại thời điểm hoàn thành.

**Người dùng đã tự commit + push cả 3 nhánh lên GitHub** (đã cho gợi ý tên nhánh/commit message, không phải Claude tự commit). Sau đó đã dọn 3 worktree (`git worktree remove` + xoá junction `node_modules` trước khi remove — junction khiến `git worktree remove` báo "Directory not empty" trên Windows, phải tự xoá junction bằng `(Get-Item ...).Delete()` rồi mới remove/prune được).

**Còn dở/chưa làm:**

- 3 nhánh `bugfix/...` đã push, **chưa mở PR / chưa merge** — người dùng tự làm tiếp theo đúng quy tắc Git mục 8 (review chéo, không tự merge PR của mình).
- Chưa verify mức 2/3 (gọi API/DB thật hoặc tự bấm tay qua UI) cho riêng phần fix này — mới dừng ở mức 1 (`tsc`/`eslint` sạch + xác nhận merge-tree không conflict), vì nhiệm vụ được giao là "fix trước khi merge", không phải "verify đầy đủ rồi merge luôn".
- Chưa quyết định MP3 thật (cần thêm dependency `lamejs` hoặc tương đương) — để dành hỏi lại khi nào cần.

---

## §20 — Cả 3 PR `bugfix/` từ §19 đã merge vào `main` + ước lượng lại tiến độ 119 UC theo Report 3 (12/09/2026)

> ⚠️ **Bảng tiến độ 119 UC trong mục này đã LỖI THỜI** (đứng ở 12/09/2026, trước §21→§35). Số liệu hiện hành ở **§36**. Giữ mục này nguyên vẹn vì nó là nhật ký, không phải bảng tra cứu.

**Bối cảnh:** Người dùng tự resolve conflict (2 file `midi-editor.tsx`/`midi-toolbar.tsx`, do PR #25 export-audio merge trước làm PR #27 metronome lệch vị trí chèn prop — thuần cộng dồn, không xung đột logic thật) rồi tự merge cả 3 PR #25/#26/#27. Nhờ Claude: (1) kéo `main` mới nhất về máy, (2) đọc `docs/Report3_Software Requirement Specification.docx` để ước lượng số UC đã hoàn thiện, (3) cập nhật file này, (4) kết thúc phiên.

**Sự cố xử lý trước khi kéo `main`:** thư mục làm việc chính (`S.T.A.V.E`, không phải worktree) bị mất sạch nội dung `backend/`/`frontend/` trên đĩa (git status báo ~145 file "deleted") — nghi do thao tác dọn 3 worktree tạm ở §19 (xoá junction `node_modules` bằng PowerShell) ảnh hưởng nhầm, hoặc do VSCode đang mở đúng lúc 1 nhánh vừa bị thao tác. **Không mất dữ liệu thật**: commit hiện tại đã push lên `origin` và đã nằm trong `main` từ trước, xác nhận qua `git branch -r --contains`. Đã xin phép người dùng trước khi chạy `git checkout HEAD -- .` (bị auto-mode chặn tự động vì phân loại "irreversible local destruction") — người dùng xác nhận đã tự chuyển VSCode sang `main`, chạy lại thành công, khôi phục đủ file, sau đó `git pull origin main` fast-forward `bca1fc2 → 64fcd66` sạch.

**Đối chiếu `docs/Report3_...docx`** (trích xuất text bằng script `python3` + `zipfile`/`xml.etree` — máy không có `pandoc`/`python-docx`, không cần cài gì thêm): xác nhận đúng **119 UC** (UC-01 → UC-119), khớp §0. Danh sách đầy đủ ID + tên đã trích ra `report3.txt` trong scratchpad (không commit vào repo, chỉ dùng tạm).

**Ước lượng tiến độ (dựa trên module backend đã tồn tại + lịch sử §2→§19 — ƯỚC LƯỢNG, chưa phải audit từng UC 1-1 qua UI thật):**

| Mức độ | Số UC | Chi tiết |
|---|---|---|
| ✅ Hoàn thiện, verify mức 3 (người dùng tự bấm tay xác nhận) | **29** | Auth & Account (UC-01→07, 13-17, 84-85, 96-99) + Projects/Drafts (UC-18→23) + Explore Guest (UC-08→12, đã sửa bug) |
| 🟡 Có code + UI thật, verify mức 2 (script/Playwright), CHƯA mức 3 | **17** | MIDI Editor core: UC-24,25,26,27,28,29,30,31,32,33,34,35,37 (13) + Version Control có UI (chỉ bản redesign): UC-42,43,44,46 (4) |
| 🟠 Có code, mới verify mức 1 (tsc/eslint), chưa chạy script/UI thật, có phần chưa khớp 100% đặc tả | **3** | UC-36 (Metronome đúng, nhưng **Loop hiện là "lặp lại từ điểm bắt đầu phát" chứ chưa phải "loop 1 vùng do người dùng tự chọn" như đặc tả SRS** — cần thêm UI chọn vùng lặp nếu muốn khớp 100%), UC-38 (chỉ WAV thật, MP3 chưa làm — quyết định có chủ đích, xem §19), UC-40 (UI gốc mới xong, redesign đã có từ trước) |
| ⚪ Có API backend đúng (đã xác nhận qua controller thật: `commits.controller.ts` có `GET diff`; `branches.controller.ts` có đủ create/list/switch/detail/history/delete-preview/delete; `merge.controller.ts` có `merge`+`merge/resolve`), CHƯA có UI nào | **8** | UC-45 (Compare/diff), 47-52 (Branch Management: Create/Switch/View detail/View history/Merge/Delete), 86 (Resolve merge conflicts) |
| ❌ Chưa có code (0% — xác nhận qua `ls backend/src`: không có module audio-sketch/custom-sound/collaboration/subscription/notification/AI/jam) | **61** | UC-39 (Export MIDI file), UC-41 (Adjust track pan — field `track.pan` đã có trong data model + đã dùng trong playback, nhưng chưa có UI slider nào cho user tự chỉnh), UC-53→83 (Audio sketch, Custom sound, Collaboration, Fork, AI insight, Subscription, Personalization, Notifications, Google connect), UC-87→95 (Pull Request workflow, Community Jam Admin), UC-100→119 trừ 96-99 đã tính ở trên (Admin nâng cao, thống kê, RBAC, autosave riêng, v.v.) |

**Tổng kiểm tra:** 29 + 17 + 3 + 8 + 61 = 119 ✓ (khớp Report 3, không thiếu/thừa UC nào).

**Lưu ý quan trọng khi dùng bảng này về sau:**
- Đây là **ước lượng nhanh** dựa trên: (a) module/route backend nào tồn tại thật (đã tự `ls`/`grep` xác nhận, không suy đoán), (b) lịch sử verify đã ghi ở §2→§19. **Không phải** kết quả tự bấm tay qua UI thật cho toàn bộ 119 UC trong phiên này.
- 2 cột "🟡" và "🟠" chỉ nên báo cáo là "có code, đang chờ verify mức 3", **không** nên gộp vào con số "hoàn thiện" khi báo cáo tiến độ cho việc chấm điểm/nộp bài — tránh lặp lại đúng lỗi đã tự cảnh báo ở §14 (gộp chung 1 con số gây hiểu nhầm).
- UC-36 loop-theo-vùng-chọn là gap thật cần quay lại nếu muốn UC-36 khớp 100% đặc tả SRS, không phải điểm trừ nghiêm trọng (loop nguyên bài từ điểm bắt đầu vẫn là 1 dạng "loop playback" hợp lý, chỉ chưa đúng chữ "selected section").

**Đã kiểm tra trước khi kết thúc phiên:** không có tiến trình dev server nào còn chạy nền (`netstat` cổng 3000/3001 sạch) — không có gì cần tự tắt theo CLAUDE.md mục 9 (phiên này không tự khởi động server nào, chỉ dùng `tsc`/`eslint` qua `node_modules` junction tạm ở các worktree, đã xoá sạch).

**Còn dở/chưa làm (để dành phiên sau):**

- Verify mức 3 thật cho 17 UC nhóm 🟡 + xác nhận lại 3 UC nhóm 🟠 sau khi người dùng tự bấm tay.
- UI cho 8 UC nhóm ⚪ (Compare/Diff, Branch Management, Merge/Conflict) — đã có API, đúng thứ tự ưu tiên đã thống nhất trước đó (xem §16 "còn dở").
- UC-39 (Export MIDI), UC-41 (Adjust pan) — 2 UC còn lại trong nhóm MIDI Editor chưa có code, dễ làm nhất trong số 61 UC còn thiếu (không cần module/hạ tầng mới, chỉ thêm slider tương tự UC-40 cho pan, và 1 hàm encode MIDI tương tự `midi-parser.ts` ngược lại cho export).
- UC-36 loop-theo-vùng-chọn (loopStart/loopEnd người dùng tự kéo chọn) nếu muốn khớp 100% đặc tả thay vì loop nguyên bài.

---

## §21 — Merge PR #28/#29, BR-29 nới lên 32 track, sửa 2 bug hiệu năng/âm thanh nghiêm trọng — **vẫn còn câm tiếng thật, chưa xong** (12-13/09/2026)

**Bối cảnh:** Phiên dài, nhiều vòng qua lại với người dùng test tay qua UI thật. Tóm tắt theo thứ tự thời gian.

**1. Merge `feature/tone-js-synth-engine` (PR #28) + `feature/tone-sampler-instruments` (PR #29) vào `main`, kéo về máy chính.** Cả 2 branch làm ở §19/§20 (Tone.js thay oscillator thô, UC-39 Export MIDI, auto-gán nhạc cụ khi import, xuất theo track, kéo-tua, tốc độ playback, 17 nhạc cụ sample thật FluidR3_GM) giờ đã ở `main`.

**2. Quy tắc mới, người dùng tự chốt:** từ phiên này **Claude không tự tạo worktree/nhánh mới nữa** — luôn code thẳng trên nhánh/thư mục hiện tại đang đứng, người dùng tự tạo nhánh + commit + push. Đã ghi vào CLAUDE.md mục 9 (xem mục đó, không lặp lại ở đây).

**3. Sự cố hạ tầng vặt đã sửa xong:**
- `frontend/node_modules` thiếu hẳn package `next` sau vài vòng worktree/pull → `npm ci` lại là xong.
- `.next` (cache Turbopack) bị stale gây lỗi giả `Cannot find module '@vercel/turbopack/postcss'` → xoá `frontend/.next` rồi chạy lại là hết, không phải bug code.
- Đã verify bằng script `@tonejs/midi` trực tiếp: cả 4 file `.mid` test (`unicorn-gundam-wip`, `Valse di Fantasica`, `Gundam Unicorn - EGO`, `Cage`) đều chỉ dùng đúng 17 nhạc cụ đã có sample + 2 track percussion (rơi về oscillator, chấp nhận được — percussion GM dùng cơ chế map khác hẳn, chưa làm).

**4. BR-29 nới từ 16 → 32 track** (người dùng yêu cầu để commit được file `unicorn-gundam-wip.mid`, 23 track). Sửa cả 2 nơi thật thực thi giới hạn: `frontend/components/midi-editor/midi-editor.tsx` (`MAX_TRACKS`) và `backend/src/drafts/dto/update-draft.dto.ts` (`MAX_DRAFT_TRACKS`, dùng trong `@ArrayMaxSize`) — không chỉ sửa 1 chỗ rồi tưởng xong. Sửa thêm 2 chỗ hardcode chữ "16" trong tooltip (`track-list.tsx` UI gốc, `redesign/track-panel.tsx`) để không lệch số hiển thị so với giới hạn thật. **Người dùng tự cập nhật lại câu chữ BR-29 trong `Report3_...docx`** (Claude không sửa file `.docx`).

**5. Backend body-size limit** — `PUT /projects/:id/draft` từng trả `413 request entity too large` cho project nhiều note (Express mặc định giới hạn JSON body 100KB, project 23 track/4387 note dễ vượt). Sửa `backend/src/main.ts`: `app.useBodyParser('json', { limit: '25mb' })` (cần `NestExpressApplication` từ `@nestjs/platform-express` thay vì `INestApplication` mặc định để có method này).

**6. Bug hiệu năng — "lag" khi Play/kéo tua (đã sửa):** kiến trúc cũ tạo mới hoàn toàn `Tone.Sampler` (mỗi cái mang ~88 file sample) cho MỌI track ở MỖI lần Play, và kéo thanh đỏ khi đang phát gọi lại y hệt trên MỖI mousemove. Sửa bằng **cache voice bền theo track id** (`VoiceCache` trong `tone-synth-engine.ts`, giữ trong `useRef` ở `midi-editor.tsx`, chỉ tạo lại đúng track nào đổi nhạc cụ) + **throttle kéo tua** (`seekThrottleRef`, tối đa ~8 lần restart audio/giây khi kéo, vị trí cuối luôn được áp dụng đúng). `stopAudio()` đổi từ `dispose()` toàn bộ sang `releaseAll()` (im lặng, giữ sống để dùng lại).

**7. Bug âm thanh nghiêm trọng — "im lặng hoàn toàn" với project nhiều nhạc cụ (đã tìm ra nguyên nhân + sửa, nhưng CHƯA XONG — xem mục 8):**

Điều tra bằng Playwright thật (tạo user + project test tạm qua Supabase Admin API, dọn sạch sau khi xong) — không đoán mò:
- File chỉ 1 nhạc cụ (piano): Play → 176 request MP3, 100% OK, không lỗi. Không phải cách phát hiện được bug.
- File `unicorn-gundam-wip.mid` (17 nhạc cụ khác nhau): Play → **1672 request MP3 bắn đồng thời** (17 × 88, cũ: mỗi track tự dựng `Tone.Sampler({urls, baseUrl})` riêng, để Tone tự fetch hết ngay khi tạo, không giới hạn concurrency) → vượt giới hạn kết nối đồng thời của Chrome → hàng loạt `net::ERR_INSUFFICIENT_RESOURCES` → `Tone.Sampler` có buffer lỗi ném `Error: buffer is either not set or not loaded` khi bị trigger → vòng lặp `triggerNotes` (không có try/catch) **dừng hẳn giữa chừng**, mọi note sau đó (kể cả track khác) không bao giờ được lên lịch → cả bài câm.

Sửa 2 lớp:
- `triggerNotes` (`tone-synth-engine.ts`): bọc try/catch quanh mỗi `triggerAttackRelease` — 1 note lỗi chỉ mất đúng note đó, không kéo sập phần còn lại.
- `frontend/lib/sample-buffer-cache.ts` (file mới): thay vì để `Tone.Sampler` tự fetch qua `urls`/`baseUrl`, giờ tự `fetch()` + `decodeAudioData()` qua **hàng đợi tối đa 6 request đồng thời**, **cache theo URL dùng chung giữa mọi track** (nhiều track cùng 1 nhạc cụ — VD "String Ensemble 1" dùng ở 4 track trong file test — giờ chỉ tải đúng 1 lần), rồi `sampler.add(note, buffer)` từng nốt khi sẵn sàng thay vì đưa thẳng `urls` cho Sampler tự lo. `prepareVoices` đổi từ chờ `Tone.loaded()` sang chờ đúng `Promise.allSettled` các buffer vừa yêu cầu.
- Verify lại đúng file nặng nhất bằng Playwright: **1144/1144 request thành công (100%, giảm từ 1672 nhờ dedup), 0 lỗi console, 0 note bị bỏ, 0 lần chạm giới hạn kết nối.**

**8. ⚠️ TÌNH TRẠNG THẬT KHI KẾT THÚC PHIÊN — CHƯA XONG, người dùng xác nhận trực tiếp:**

Dù Playwright báo 100% thành công (không lỗi, mọi note trigger đúng), **người dùng test tay qua trình duyệt thật vẫn KHÔNG nghe được âm thanh**. Đồng thời RAM trình duyệt vẫn cao — **1.7-2.5GB** (có giảm so với **3.5-3.7GB trước khi sửa mục 6/7** — chứng tỏ code mới ở mục 6/7 THẬT SỰ đang chạy, không phải fix vô tác dụng — nhưng vẫn còn cao, chưa hợp lý cho 1 project MIDI).

**Bài học quan trọng cho phiên sau — đừng lặp lại sai lầm đo lường:** Playwright headless Chromium xác nhận được lớp **network + JS logic** (request thành công, không exception, `triggerAttackRelease` không ném lỗi) — **KHÔNG xác nhận được** có thật sự phát ra âm thanh nghe được tới loa hay không (headless không cần thiết bị âm thanh thật để "thành công" ở mức code). Coi 100% Playwright pass là "đã sửa xong" ở phiên này là **kết luận sai** — đây chính là lý do báo cáo "đã sửa xong" trước khi người dùng test tay, rồi bị phản hồi lại là vẫn câm tiếng.

**Việc cần làm ở phiên sau (ưu tiên hàng đầu, trước khi làm việc khác):**
- Không tin vào Playwright cho riêng bug âm thanh này nữa — cần thêm bước đọc trực tiếp trạng thái Web Audio thật (VD `Tone.getContext().rawContext.state`, giá trị `masterGainRef`/`masterVolume` thực tế, hoặc yêu cầu người dùng tự mở DevTools Console đọc giúp) trước khi kết luận "đã sửa".
- Nghi vấn cụ thể cần loại trừ theo thứ tự: (a) `AudioContext` có đang ở trạng thái `running` không sau khi bấm Play thật (không phải `suspended`) — (b) giá trị `masterGain.gain.value` thực tế lúc đang phát có đúng bằng `masterVolume` (không phải 0/NaN) — (c) có phải do kiến trúc "master bus persistent, tạo 1 lần duy nhất" mới thêm ở mục 6 làm nó bị đứt kết nối (`disconnect`) ở đâu đó mà không tạo lại — (d) thiết bị/tab âm thanh thật của người dùng (loa, âm lượng hệ thống, tab bị mute) — ít khả năng nhưng cần hỏi lại cho chắc trước khi đào sâu code thêm.
- RAM 1.7-2.5GB cho 1 project MIDI (dù đã giảm) vẫn đáng ngờ — kiểm tra xem có Sampler/buffer nào không được giải phóng đúng lúc (đặc biệt sau khi đổi kiến trúc "voice cache bền" ở mục 6 — voice không còn bị dispose mỗi lần Stop nữa, chỉ dispose lúc unmount hoặc đổi nhạc cụ; nếu người dùng test nhiều project khác nhau trong cùng 1 tab mà không unmount đúng cách, cache có thể tích luỹ không giới hạn).

**Đã dọn trước khi kết thúc phiên:** 3 script chẩn đoán tạm (`_diag_*.cjs`), gỡ Playwright (`npm uninstall playwright --no-save`, xác nhận không đụng `package.json`/`package-lock.json`), xoá 2 project test + 1 user test khỏi Supabase qua Admin API, tắt dev server (cổng 3000/3001 sạch), xoá cache `frontend/.next`.

**File thay đổi trong phiên, chưa commit (đang ở `main`, đúng quy tắc mới mục 2):**
`frontend/lib/tone-synth-engine.ts`, `frontend/lib/sample-buffer-cache.ts` (mới), `frontend/lib/audio-exporter.ts`, `frontend/components/midi-editor/midi-editor.tsx`, `frontend/components/midi-editor/track-list.tsx`, `frontend/components/midi-editor/redesign/editor-redesign.tsx`, `frontend/components/midi-editor/redesign/track-panel.tsx`, `backend/src/drafts/dto/update-draft.dto.ts`, `backend/src/main.ts`.

---

## §22 — Xoá hoàn toàn UI MIDI Editor cũ, chốt dùng bản redesign làm UI duy nhất (13/09/2026)

**Yêu cầu người dùng:** "trong chương trình có 1 bản UI midi cũ, hãy xóa sạch toàn bộ nó đi vì không dùng nữa, bỏ cả nút chuyển giữa 2 bản UI, chốt sử dụng bản mới." Đây là dọn dẹp UI/kiến trúc — **không liên quan tới bug câm tiếng/RAM cao ở §21 mục 8, bug đó VẪN CHƯA SỬA**, xem lại mục đó ở đầu phiên sau.

**Bối cảnh:** Từ §15, MIDI Editor có 2 UI song song — "classic" (UI gốc, `midi-toolbar.tsx` + `track-list.tsx`, nền `#09090b`) và "redesign" (dựng theo mockup thật, 3 cột Tracks/Piano roll/History). Chuyển qua lại bằng nút toggle, lưu lựa chọn ở `localStorage` (`redesign/ui-variant.ts`), mặc định "classic". Người dùng xác nhận đã hài lòng với bản redesign và muốn dứt điểm.

**Đã xoá hẳn 3 file:**
- `frontend/components/midi-editor/midi-toolbar.tsx` (toolbar UI gốc)
- `frontend/components/midi-editor/track-list.tsx` (track panel UI gốc)
- `frontend/components/midi-editor/redesign/ui-variant.ts` (cơ chế lưu/đọc lựa chọn UI qua `localStorage` + `useSyncExternalStore`)

**`midi-editor.tsx`:** bỏ state `uiVariant` và toàn bộ nhánh `if (uiVariant === "redesign") {...} return (<div style={styles.root}>...UI gốc...)`; giờ luôn render thẳng `<EditorRedesign>` không điều kiện. Xoá luôn style object của UI gốc (`root`, `statusBar`, `statusDot`, `statusText`, `warningText`, `statusMeta`, `body`) và helper `saveStatusColor` không còn ai gọi — chỉ giữ `loading`/`spinner` (màn hình loading vẫn dùng chung).

**Vấn đề phát hiện khi xoá — UI redesign trước đó THIẾU một số UC so với UI gốc** (do lúc dựng redesign ở §15 chưa làm hết, và UI gốc vẫn còn sống nên không ai để ý): Metronome toggle (UC-36), chỉnh Tempo/BPM, Playback speed preview (UC-37), Export MIDI (UC-39), Export Audio/WAV kể cả xuất riêng từng track (UC-38). Xoá thẳng UI gốc mà không bù lại các nút này sẽ làm **mất tính năng thật**, không phải chỉ dọn code chết — nên đã chủ động bổ sung toàn bộ vào `redesign/editor-redesign.tsx` thay vì chỉ xoá:
- Thêm nút Metronome (icon `Timer`, cùng cụm với nút Loop trong transport ở header).
- Thêm ô nhập BPM + dropdown Speed (0.5×–2×) vào tool strip, giữ đúng hành vi cũ (BPM ghi thẳng `snapshot.meta.tempo`, Speed chỉ preview không đổi tempo thật).
- Thêm nút "Export MIDI" (gọi `onExportMidi` có sẵn từ `midi-editor.tsx`, chỉ là chưa được UI redesign gọi tới) và nút "Export Audio" (mở lại đúng `ExportDialog` sẵn có ở `export-dialog.tsx` — component này tự chứa cả style, dùng được ngay cho cả 2 UI, không cần viết lại).
- Bỏ nút "Quay lại giao diện gốc" (`onBackToClassic`) — không còn ý nghĩa khi chỉ còn 1 UI.

**`piano-roll.tsx`:** trước đây có 1 bảng màu/kích thước riêng cho từng theme (`THEMES.classic` và `THEMES.redesign`, chọn qua prop `theme?: "classic" | "redesign"`) vì canvas piano-roll dùng chung cho cả 2 UI. Giờ chỉ còn 1 UI nên xoá hẳn `THEMES.classic` và prop `theme`, gộp `THEMES.redesign` thành 1 hằng số cố định duy nhất (`PAL`). Đồng thời **chuyển định nghĩa type `ToolMode`/`GridDivision`** (trước ở `midi-toolbar.tsx`, file vừa xoá) sang khai báo ngay tại `piano-roll.tsx` — mọi nơi khác (`midi-editor.tsx`, `redesign/editor-redesign.tsx`) đổi sang `import ... from "./piano-roll"` / `"../piano-roll"`.

**Verify:** `npx tsc --noEmit` sạch, `npx eslint components/midi-editor` chỉ còn đúng 5 warning `react-hooks/exhaustive-deps` đã có từ trước (không liên quan thay đổi này), 0 error. Không có file nào khác trong repo còn tham chiếu `midi-toolbar`/`track-list`/`ui-variant`/`onBackToClassic`/`onOpenRedesign` (đã grep xác nhận).

**Chưa commit/push** (đúng quy tắc CLAUDE.md mục 9) — file đổi: `frontend/components/midi-editor/midi-editor.tsx`, `frontend/components/midi-editor/piano-roll.tsx`, `frontend/components/midi-editor/redesign/editor-redesign.tsx`, `frontend/components/midi-editor/redesign/track-panel.tsx` (chỉ sửa 1 dòng comment cũ nhắc tới `track-list.tsx`); xoá: `frontend/components/midi-editor/midi-toolbar.tsx`, `frontend/components/midi-editor/track-list.tsx`, `frontend/components/midi-editor/redesign/ui-variant.ts`.

**⚠️ Nhắc lại cho phiên sau:** việc này KHÔNG đụng tới bug câm tiếng/RAM cao ở §21 mục 8 — bug đó vẫn còn nguyên, vẫn là ưu tiên hàng đầu cần điều tra tiếp (đọc `AudioContext.state`/`masterGain.gain.value` thật, không chỉ tin Playwright).

---

## §23 — Bug câm tiếng (§21 mục 8): đã LOẠI TRỪ HOÀN TOÀN toàn bộ chuỗi audio custom của STAVE bằng bisection thật trên project thật — vẫn CHƯA XONG, cần hướng điều tra mới (13/09/2026)

**Tiếp nối §21 mục 8.** Người dùng tự xác nhận qua tai thật (không phải Playwright): với `Tone.getContext().rawContext.state = "running"`, `masterGain.gain.value` đúng giá trị, không node nào `disposed`, mọi sample `loaded=88/88`, `triggerNotes` báo `scheduled=4387 failed=0` — build với log chi tiết mỗi 2s trong lúc phát — **vẫn hoàn toàn không nghe được gì**. Kết luận trước đó (review tĩnh bằng đọc code/grep) không lộ ra giá trị sai (`Tone.Filter(6000, "lowpass")` hằng số cố định; `track.pan` luôn là `0` — không có UI chỉnh pan; `Tone.Limiter(-1)` hợp lệ; công thức velocity `(n.velocity/127) * (track.volume ?? 1)` đúng chuẩn Tone.js 0-1, không phải truyền thô 0-127).

**Bisection thật đã làm:** thêm tạm `window.__debugPlayNote(variant)` (gắn qua `useEffect` trong `midi-editor.tsx`, xoá sau khi dùng xong phiên này) cho phép trigger 1 note thật (440Hz, 0.6s, full velocity) trên đúng 1 voice **đang cache thật** của project `unicorn-gundam-wip`, qua 4 điểm nối (connect() cộng thêm, không thay chuỗi thật đang dùng khi Play bình thường):
- (a) Sampler nối THẲNG `Tone.getDestination()` — bỏ qua Filter/Panner/masterGain/Limiter hoàn toàn.
- (b) Sampler → masterGain thật (bỏ qua Filter/Panner).
- (c) Sampler → masterLimiter thật (bỏ qua Filter/Panner/masterGain).
- (d) không nối gì thêm — dùng đúng chuỗi thật hiện có (control).

**Kết quả: cả 4 biến thể (a)(b)(c)(d) ĐỀU câm hoàn toàn**, kể cả (a) — bypass 100% chuỗi custom của STAVE (Filter/Panner/masterGain/Limiter), nối thẳng synth vào đúng `Tone.getDestination()` của context đang `running`. `.connect()` không ném lỗi nào ở bất kỳ biến thể nào — quan trọng vì Web Audio API native sẽ throw ngay lập tức nếu 2 node thuộc 2 `AudioContext` khác nhau, nên điều này loại trừ khả năng có 2 `AudioContext`/2 instance Tone.js song song bị lẫn giữa các node.

**KẾT LUẬN CHẮC CHẮN (không phải "có thể"):** nguyên nhân câm tiếng KHÔNG nằm trong `Filter`/`Panner`/`masterGain`/`Limiter`/công thức velocity/cách kết nối chuỗi audio custom của STAVE — toàn bộ phần này đã bị loại trừ bằng thực nghiệm trực tiếp trên project thật, không phải suy đoán từ đọc code. Vấn đề nằm ở lớp thấp hơn những gì Tone.js/Web Audio API JS-level cho phép quan sát (context "running" + gain đúng + node kết nối đúng vẫn không tạo ra âm thanh nghe được) — ngoài phạm vi mà việc sửa code JS trong `tone-synth-engine.ts`/`midi-editor.tsx` có thể giải quyết thêm.

**Nghi vấn ưu tiên cho phiên sau (chưa kiểm chứng, cần người dùng tự làm, không phải code):**
1. **Chrome site-level mute** (khác `AudioContext.state`, khác icon loa trên tab — đây là permission theo origin, độc lập hoàn toàn với JS): mở `chrome://settings/content/sound`, kiểm tra `localhost:3000` (hoặc origin thật đang dùng) có nằm trong danh sách "Không được phép phát âm thanh" không. Click chuột phải ngay trên tab đang mở STAVE xem có dòng "Bỏ tắt tiếng trang web" (site đang bị mute) không.
2. Mở đúng URL đó trong cửa sổ Ẩn danh (Incognito) — profile sạch, permission mặc định — nếu nghe được ở đó thì xác nhận chắc chắn nguyên nhân là site permission bị mute ở profile chính, không phải code.
3. Windows Volume Mixer: Chrome có bị kéo về 0 riêng (độc lập với volume hệ thống) không — đã hỏi ở phiên trước nhưng chưa có xác nhận rõ ràng.
4. Nếu cả 3 mục trên đều bình thường (không mute ở đâu) → vượt quá phạm vi debug JS thông thường, cần kiểm tra ở tầng `chrome://media-internals` (xem entry audio render có thật sự chạy không) hoặc nghi ngờ driver/thiết bị âm thanh Windows có đang bị ứng dụng khác (VD OBS, Discord, ứng dụng ảo hoá audio) chiếm độc quyền exclusive-mode.

**Đã gỡ hết code DEBUG-TEMP của bisection này** (`window.__debugPlayNote` trong `midi-editor.tsx`) sau khi có kết luận — chỉ còn lại phần log định kỳ 2s từ §21 mục 8 (chưa gỡ, vẫn đang hữu ích để so sánh state trước/sau khi người dùng thử các bước 1-4 ở trên). Chưa sửa code thật nào trong phiên này vì **chưa có nguyên nhân chắc chắn ở tầng code** để sửa — cố tình dừng lại đúng theo yêu cầu, không đoán mò vá bừa.

**Cập nhật cùng ngày — cả 4 nghi vấn browser/OS ở trên đã được kiểm tra, kết quả loại trừ THÊM cả lớp site-permission lẫn per-app volume, và lộ ra bằng chứng OS-level đầu tiên:**

1. `chrome://settings/content/sound`: chế độ mặc định "Các trang web có thể phát âm thanh" (cho phép), danh sách "Không được phép phát âm thanh" **rỗng** — `localhost:3000` không bị chặn ở cấp site. **Loại trừ site-mute.**
2. Mở lại đúng URL ở cửa sổ **Ẩn danh — vẫn hoàn toàn không nghe được gì.** Loại trừ luôn khả năng do 1 site-permission/extension nào đó chỉ tồn tại ở profile chính.
3. Windows Volume Mixer: Chrome không bị kéo riêng về 0. **Loại trừ per-app mute.**
4. `chrome://media-internals` (khi đang Play project `unicorn-gundam-wip` thật) — đây là bằng chứng quan trọng nhất, ở tầng THẤP HƠN bất kỳ thứ gì JS/Tone.js có thể thấy:
   - Tab **Audio Focus** → "Active Sessions": `STAVE - http://localhost:3000/projects/.../edit` — **`Ambient Active Playing`**. Chrome tự nhận đúng là tab đang phát âm thanh.
   - Tab **Audio** → 1 Output Controller (`Controller 139:0`) + 1 Output Stream (`Stream 120:63`) thật, gắn với `render_process_id` khớp đúng tiến trình render STAVE. Properties của Stream: `device_id = "{0.0.0.00000000}.{44d2e46b-2055-4719-a3e2-09d20c20c844}"` (Windows Core Audio endpoint ID thật của 1 thiết bị output cụ thể), `status = "started"`, **`volume = 1`**, `sample_rate = 48000`, `channels = 2 (STEREO)`, `effects = "NO_EFFECTS"`.

**Kết luận chắc chắn (cập nhật):** không chỉ tầng JS/Tone.js (đã loại trừ ở bisection trên) mà cả tầng **audio pipeline nội bộ của Chrome** đều xác nhận: có 1 audio stream thật, đang `started`, `volume=1`, gắn đúng vào 1 thiết bị output thật theo GUID, không bị site-mute/app-mute nào chặn. Về logic, "âm thanh" đã ra khỏi tiến trình Chrome renderer thành công. Vùng nghi vấn còn lại duy nhất, nằm hoàn toàn ngoài phạm vi sửa được bằng code STAVE: **thiết bị output mà Windows/Chrome đang thật sự ghi PCM vào (đúng GUID ở trên) có phải là thiết bị người dùng đang nghe hay không** — VD Windows đang có nhiều thiết bị playback (loa, tai nghe, HDMI, virtual audio cable...), "mặc định hệ thống" khác với thiết bị Chrome đã bind từ lúc mở, hoặc Windows "App volume and device preferences" (Cài đặt → Hệ thống → Âm thanh → Âm lượng ứng dụng và tùy chọn thiết bị) đang gán riêng Chrome vào 1 thiết bị khác với thiết bị người dùng đang thực sự nghe.

**Việc cần làm ở phiên sau — quyết định nhị phân, không cần code thêm:**
- Mở **bất kỳ** trang nào khác (YouTube, v.v.) trên **cùng cửa sổ Chrome, cùng thời điểm** và thử phát thử — nếu **cũng không nghe được**, bug 100% nằm ở tầng Windows/thiết bị âm thanh, không liên quan gì tới code STAVE nữa (dừng điều tra code, chuyển hướng dẫn người dùng qua Windows Settings → Âm thanh → Âm lượng ứng dụng và tùy chọn thiết bị, kiểm tra Chrome có bị gán nhầm thiết bị output không so với default hệ thống).
- Nếu YouTube **nghe được bình thường** trong khi STAVE vẫn câm dù `media-internals` báo `status=started, volume=1` y hệt — đây sẽ là phát hiện cực kỳ bất thường (matched hết mọi chỉ số nhưng khác biệt hành vi), cần báo ngay, không đoán mò tiếp.

**Kết quả thật: YouTube nghe bình thường** trên cùng cửa sổ/thiết bị → loại trừ hoàn toàn giả thuyết Windows/thiết bị output sai. Bisection tiếp theo (chạy `new Audio("http://localhost:3000/instruments/piccolo/A4.mp3").play()` trong Console — phát file mẫu thật, nhưng qua **HTML5 `<audio>` element**, hoàn toàn không đụng tới Tone.js/AudioContext): **nghe được** file mẫu Piccolo bình thường.

**KHOANH VÙNG CHÍNH XÁC (xác nhận bằng thực nghiệm, không suy đoán):** file mẫu tốt, thiết bị/driver tốt, OS/Chrome audio pipeline tốt (media-internals xác nhận), HTML5 `<audio>` phát bình thường trên đúng origin/tab/thiết bị đó — CHỈ RIÊNG đường **Web Audio API** (`AudioContext` mà Tone.js dùng, kể cả khi bypass thẳng `Tone.getDestination()` ở bisection trước) là câm. Đây là phạm vi hẹp nhất có thể khoanh được bằng thực nghiệm thuần (không code) — nghi vấn giờ dồn về đúng 1 điểm: **bản thân đối tượng `AudioContext` mà Tone.js đang dùng có bị "hỏng ngầm"/không thật sự bind vào phần cứng dù báo `state: "running"`, do được tạo ra SỚM hơn cử chỉ người dùng (Tone.js tự tạo Context/Transport mặc định ngay lúc `import "tone"` ở module-scope — xem cảnh báo "The AudioContext was not allowed to start... must be resumed after a user gesture" xuất hiện ngay lúc `audio-exporter.ts` được import, TRƯỚC khi người dùng bấm gì) — sau đó `Tone.start()` chỉ gọi `.resume()` trên đúng context "sinh non" đó thay vì tạo mới. Đây là 1 dạng lỗi/quirk đã biết của Chromium: context tạo trước gesture, dù `resume()` "thành công" về mặt promise/state, đôi khi không thật sự bind audio-render-thread vào thiết bị.**

**Việc cần làm ở phiên sau — 1 test cuối để xác nhận trước khi sửa code (không cần code trong repo):** yêu cầu người dùng chạy trong Console, rồi bấm 1 cú click bất kỳ vào trang ngay sau khi paste (để đảm bảo tính là user gesture thật, không phải chỉ paste vào Console):
```js
document.body.addEventListener('click', function once() {
  document.body.removeEventListener('click', once);
  const rawCtx = new (window.AudioContext || window.webkitAudioContext)();
  const osc = rawCtx.createOscillator();
  osc.frequency.value = 440;
  osc.connect(rawCtx.destination);
  osc.start();
  setTimeout(() => osc.stop(), 1000);
  console.log('raw ctx state:', rawCtx.state);
}, { once: true });
```
- Nếu nghe được: xác nhận đúng giả thuyết — 1 `AudioContext` HOÀN TOÀN MỚI, tạo SAU gesture, hoạt động bình thường. Fix thật: sửa `midi-editor.tsx`/`audio-exporter.ts` để không dựa vào Tone.js tự tạo context mặc định ở module-scope nữa — gọi `Tone.setContext(new Tone.Context())` (tạo context mới) ngay trong `startPlayback()`/lần đầu người dùng bấm Play, TRƯỚC `Tone.start()`, thay vì resume context "sinh non" cũ.
- Nếu vẫn câm: giả thuyết sai, quay lại từ đầu — báo cáo lại, không đoán mò tiếp.

**Kết quả thật: nghe được.** Test raw `new AudioContext()` + oscillator, tạo bên trong 1 real click handler (không phải Tone.js), phát bình thường trên đúng máy/thiết bị/tab mà mọi đường Tone.js đều câm. **Xác nhận đúng giả thuyết — đây LÀ nguyên nhân gốc, không phải suy đoán.**

**FIX ĐÃ ÁP DỤNG (`frontend/components/midi-editor/midi-editor.tsx`):**
- Thêm `contextReplacedRef` (useRef, khởi tạo `false`) cạnh `masterGainRef`/`masterLimiterRef`.
- Trong `startPlayback()`, ngay đầu hàm, TRƯỚC `await Tone.start()`: nếu `!contextReplacedRef.current`, gọi `Tone.setContext(new Tone.Context())` rồi set `contextReplacedRef.current = true`. Chỉ chạy đúng 1 lần cho cả phiên editor (lần đầu bấm Play) — mọi `Sampler`/`Gain`/`Limiter`/`Panner`/`Filter` được tạo SAU thời điểm này (toàn bộ `masterGainRef`/`voiceCacheRef` đều tạo lazy trong `startPlayback`, chưa có gì tạo trước đó) nên tự động bind đúng vào context mới — không cần sửa `tone-synth-engine.ts`/`sample-buffer-cache.ts`.
- Trong effect dọn dẹp lúc unmount (đã có sẵn, dispose `voiceCache`/`masterGain`/`masterLimiter`): thêm nhánh `if (contextReplacedRef.current) { Tone.getContext().dispose(); contextReplacedRef.current = false; }` — đóng đúng context đã tạo riêng cho phiên này, tránh rò rỉ 1 `AudioContext` thật mỗi lần vào/ra Editor.
- `audio-exporter.ts` **không cần sửa** — `Tone.Offline(...)` đã luôn tự tạo 1 `OfflineAudioContext` hoàn toàn mới cho mỗi lần export, không liên quan gì tới context mặc định bị "sinh non" của live playback.

**Đã gỡ sạch toàn bộ code DEBUG-TEMP** dùng để chẩn đoán xuyên suốt §21/§23 (grep `DEBUG-TEMP` toàn repo ra 0 kết quả) — gồm: log summary trong `triggerNotes`/sampler-ready ở `tone-synth-engine.ts`, log `Tone.start()`/masterGain lúc khởi động playback, khối `setInterval` dump Web Audio state mỗi 2s, và `debugTimerRef` trong `midi-editor.tsx`. Chỉ giữ lại phần code sửa thật (contextReplacedRef + đoạn setContext + đoạn dispose khi unmount).

**Verify đã làm:** `npx tsc --noEmit` sạch, `npx eslint components/midi-editor lib/tone-synth-engine.ts lib/audio-exporter.ts` chỉ còn đúng 5 warning `react-hooks/exhaustive-deps` đã có từ §22 (không liên quan), 0 error.

**⚠️ CHƯA ĐỦ ĐIỀU KIỆN BÁO "XONG" — còn thiếu đúng 1 bước:** người dùng cần tự bấm Play qua UI thật (không phải qua Console) trên project `unicorn-gundam-wip`, xác nhận **nghe được** — đây là mức verify duy nhất được chấp nhận cho bug này (đã ghi rõ ở §21: Playwright/test tự động không đáng tin cho riêng bug âm thanh). Đồng thời nên thử: đóng hẳn tab/mở lại project 1 lần nữa (đảm bảo context mới thật sự được tạo lại đúng ở mọi lần vào Editor, không chỉ lần đầu của phiên debug này), và kiểm tra RAM có còn cao bất thường không (nghi vấn RAM ở §21 mục 8 chưa đụng tới trong phiên này).

**Kết quả verify thật — Play lần đầu nghe được (fix context ở trên ĐÚNG), nhưng lộ ra 1 BUG THỨ HAI, khác hẳn, trước đây không thể phát hiện được vì chưa bao giờ có âm thanh thật để nghe:**

Người dùng báo: bấm Stop → UI đổi trạng thái đúng (nút đổi lại Play) nhưng **nhạc vẫn tiếp tục chạy thật**. Bấm Play thêm 1 lần trong lúc đó → **chồng thêm 1 lớp nhạc mới đè lên lớp cũ vẫn đang kêu** (không phải audio bị lặp/giật — là 2 bản ghi khác thời điểm phát cùng lúc). Lặp lại lần 3 → rè/nhiễu nhẹ 1 tiếng rồi **toàn bộ âm thanh tắt hẳn** (nhiều khả năng do 3 lớp overlap đẩy `Limiter` vào chế độ nén cực mạnh/quá tải). F5 lại thì bình thường, lặp lại thao tác thì lại lỗi y hệt. Test riêng "sau khi Commit thì Play thế nào" cũng cho kết quả **y hệt trước khi commit** — xác nhận **Commit không phải nguyên nhân**, báo cáo "commit xong thì câm" ở lượt trước thực ra chính là bug này (bấm Play/Stop vài lần trong lúc thao tác Commit → chồng lớp → quá tải → có vẻ "câm").

**NGUYÊN NHÂN CHẮC CHẮN (đọc code xác nhận, không suy đoán):** trước đây `startPlayback()` gọi `triggerNotes({..., toTick: null, ...})` **đúng 1 lần duy nhất** cho MỖI LẦN Play — hàm này lặp qua TOÀN BỘ note còn lại trong bài và gọi `triggerAttackRelease(freq, dur, mộtThờiĐiểmTuyệtĐốiTrongTươngLai, vel)` cho từng note **ngay lập tức**, tức là lên lịch sẵn cho Web Audio API mọi note của cả bài hát cùng 1 lúc. Tone.js **không có API nào để huỷ 1 `triggerAttackRelease` đã gọi** (đã commit thẳng vào automation của node). `stopAudio()` gọi `voice.synth.releaseAll?.()` — hàm này **chỉ tắt các note ĐANG kêu ngay lúc gọi**, không đụng được tới note đã lên lịch cho tương lai (VD note ở giây thứ 40 của bài, đã "chốt" vào node lúc Play, dù Stop ở giây thứ 5). Kết quả: nhạc cứ chạy tiếp tới hết bài bất kể Stop, và Play lần 2 chồng thêm 1 bộ lịch mới lên trên.

Bug này **luôn tồn tại** kể từ khi chuyển sang Tone.js (§19/20) — chỉ không ai phát hiện được vì cho tới tận session này (§23), chưa từng có Play nào thực sự tạo ra âm thanh nghe được để nhận ra "Stop không dừng".

**FIX ĐÃ ÁP DỤNG (`frontend/components/midi-editor/midi-editor.tsx`):** thêm hàm `scheduleNotes(...)` — bộ lập lịch lookahead theo đúng pattern đã có sẵn và đã được validate cho metronome (`scheduleMetronome`/`scheduleBeat`, cũng ở file này): thay vì gọi `triggerNotes` 1 lần cho cả bài, giờ gọi lặp lại mỗi 50ms (`SCHEDULE_INTERVAL_MS`), mỗi lần chỉ lên lịch đúng phần note rơi vào 150ms tới (`LOOKAHEAD_SEC`) tính từ đồng hồ audio thật, dùng con trỏ `scheduledUpToTick` để không lên lịch trùng. Timer này (`noteScheduleTimerRef`, ref mới) được `clearTimeout` trong `stopAudio()` giống hệt `metronomeTimerRef` — Stop giờ chặn đứng việc lên lịch thêm note mới, độ trễ tắt tiếng còn lại tối đa ~150ms (chấp nhận được, giống hệt độ trễ đã có sẵn và được chấp nhận của metronome). `triggerNotes`/`prepareVoices` trong `tone-synth-engine.ts` **không đổi gì** — vẫn dùng nguyên, chỉ đổi CÁCH GỌI ở `midi-editor.tsx`; `audio-exporter.ts` (dùng `Tone.Offline`, không có nút Stop, không cần huỷ lịch) **không đổi gì**.

**Verify đã làm:** `npx tsc --noEmit` sạch, `npx eslint components/midi-editor/midi-editor.tsx lib/tone-synth-engine.ts` chỉ còn đúng 5 warning cũ từ §22, 0 error. Đã đọc lại `handleStop`/`handlePause`/`handleSeek` xác nhận cả 3 đều đi qua `stopAudio()`/`startPlayback()` nên đều tự động được hưởng fix này, không cần sửa riêng.

**Đã gỡ sạch code DEBUG-TEMP** dùng để chẩn đoán câu hỏi "context có bị Fast Refresh thay ngầm không" (grep `DEBUG-TEMP` toàn repo ra 0 kết quả) — hoá ra không cần tới kết luận đó, vì bug thật nằm ở tầng lập lịch note, không phải context.

**⚠️ VẪN CHƯA ĐỦ ĐIỀU KIỆN BÁO "XONG" — cần người dùng verify lại đúng kịch bản vừa lỗi:** bấm Play → đợi vài giây → bấm Stop → xác nhận **nhạc tắt hẳn** (không còn tiếp tục chạy ngầm) → bấm Play lại → xác nhận **không bị chồng lớp** → lặp lại 3-4 lần liên tục để chắc chắn không còn rè/tắt tiếng như trước. Nếu qua được kịch bản này, coi như bug chính (§21 mục 8) đã đóng — vẫn còn nghi vấn RAM cao (§21 mục 8) và cần thêm 1 vòng test loop/seek trong lúc phát để chắc chắn `scheduleNotes` không có edge case bỏ sót note khi tua/loop.

**Kết quả verify: gặp thêm 1 bug thứ 3, khác hẳn — báo lỗi hàng loạt trong Console trong lúc test đúng kịch bản Play/Stop/Play liên tiếp vừa yêu cầu:**

```
tone-synth-engine.ts:244 triggerAttackRelease failed for one note, skipping it:
Error: No available buffers for note: 61
    at Sampler._findClosest (Sampler.ts:183:9)
    ...
    at scheduleChunk (midi-editor.tsx:806:21)
```

Lặp lại liên tục cho rất nhiều note/nhạc cụ khác nhau (61, 65, 54, 72, 69, 41, 48, 53, 57, 67, 70, 74, 43, 55, 58, 62...) trong lúc phát — đã đọc thẳng source `node_modules/tone/build/esm/instrument/Sampler.js` (`_findClosest`, dòng 85-99) để xác nhận: hàm này chỉ throw `"No available buffers"` khi `this._buffers` (tập sample đã `.add()` vào Sampler) **HOÀN TOÀN RỖNG** ở thời điểm được gọi — nó tìm trong phạm vi 96 semitone (8 quãng 8) quanh note trước khi bỏ cuộc, nên với bộ 88 note đầy đủ mà `instrument-samples.ts` cung cấp, lỗi này CHỈ xảy ra khi Sampler đó **chưa được `.add()` bất kỳ sample nào cả**, tức đang giữa quá trình tải, chưa xong.

**NGUYÊN NHÂN CHẮC CHẮN (đọc code xác nhận, không suy đoán) — race condition có sẵn từ trước, không phải do fix `scheduleNotes` vừa thêm gây ra, chỉ là giờ mới bị lộ vì người dùng được yêu cầu bấm Play/Stop/Play liên tiếp nhanh:** trong `prepareVoices()` (`tone-synth-engine.ts`), nhánh tạo voice MỚI ghi vào cache **NGAY SAU KHI GỌI CONSTRUCTOR, TRƯỚC KHI `await` xong việc tải sample** (`cache.set(track.id, { voice, instrument })` chạy đồng bộ ngay sau `createTrackVoiceWithReady()`, còn `ready` — promise theo dõi tiến trình tải — chỉ được `push` vào `pendingLoads` của LẦN GỌI ĐÓ). Nếu người dùng bấm Play lần 2 (VD Stop rồi Play lại) **trong lúc lần Play đầu tiên của 1 nhạc cụ nào đó vẫn còn đang tải dở** (dự án 17 nhạc cụ tải khá lâu, đã ghi nhận ở §21), lần `prepareVoices()` thứ 2 nhìn thấy `cache.get(track.id)` đã tồn tại với `instrument` khớp → coi là "đã sẵn sàng, dùng lại luôn" → **không hề đưa promise `ready` của lần tải đó vào `pendingLoads` của lần gọi thứ 2** → `await Promise.allSettled(pendingLoads)` của lần Play thứ 2 hoàn tất ngay lập tức dù Sampler thật sự vẫn rỗng → `scheduleNotes`/`triggerAttackRelease` chạy trên 1 Sampler chưa có sample nào, ném lỗi liên tục cho tới khi lần tải gốc (chạy ngầm) thực sự xong.

**FIX ĐÃ ÁP DỤNG (`frontend/lib/tone-synth-engine.ts`):**
- `VoiceCache` đổi từ `Map<string, { voice, instrument }>` thành `Map<string, { voice, instrument, ready }>` — lưu luôn promise `ready` vào cache entry, không chỉ giữ trong biến cục bộ của lần gọi tạo ra nó.
- Nhánh cache-hit trong `prepareVoices()` (khi `cached.instrument === track.instrument`, tái dùng voice) giờ **luôn `pendingLoads.push(cached.ready)`** thay vì bỏ qua hoàn toàn — nếu voice đó đã tải xong từ lâu, `await` trên 1 promise đã resolve gần như miễn phí (1 microtask), không có phí tổn hiệu năng thật; nếu voice đó VẪN đang tải dở (đúng race condition ở trên), lần gọi thứ 2 giờ **chờ đúng cho tới khi tải xong** trước khi trả về, thay vì trả về ngay 1 Sampler rỗng.
- Cập nhật lại docstring của `prepareVoices` cho khớp hành vi mới (không còn nói "reuse = no wait" tuyệt đối).

**Verify đã làm:** `npx tsc --noEmit` sạch, `npx eslint components/midi-editor/midi-editor.tsx lib/tone-synth-engine.ts lib/audio-exporter.ts` chỉ còn đúng 5 warning cũ từ §22, 0 error. Đã đọc trực tiếp source Tone.js (`node_modules/tone`) để xác nhận cơ chế `_findClosest`/`ToneAudioBuffers`, không suy đoán.

**⚠️ VẪN CHƯA ĐỦ ĐIỀU KIỆN BÁO "XONG" — cần verify lại LẦN NỮA đúng kịch bản đã gây lỗi:** mở 1 project nhiều nhạc cụ (VD `unicorn-gundam-wip`), bấm Play **ngay khi vừa mở** (đừng đợi tải xong), rồi Stop/Play liên tục vài lần trong lúc sample vẫn đang tải — xác nhận KHÔNG còn thấy lỗi `"No available buffers"` trong Console, và nghe được đúng nhạc cụ (không bị câm/rè do dùng nhầm Sampler rỗng). Sau đó lặp lại kịch bản Stop-thật-sự-dừng-nhạc đã yêu cầu ở lượt trước (Play → đợi → Stop → xác nhận tắt hẳn → Play lại → không chồng lớp).

**Kết quả verify: gặp thêm 1 bug thứ 4 — với file NHỎ (project `Mobile Suit Gundam Narrative - Cage`, chỉ 2 track, cùng nhạc cụ Acoustic Grand Piano, 541 note), Play chỉ nghe được vài note đầu rồi im hẳn — TỆ HƠN cả kịch bản Play/Stop liên tục ở bug thứ 3. Người dùng xác nhận: đã F5 (chạy code mới), Console KHÔNG có lỗi gì (chỉ có 2 dòng cảnh báo bình thường `"AudioContext was not allowed to start... must be resumed after a user gesture"` xuất hiện ngay lúc `import "tone"`, y hệt mọi lần trước — không phải lỗi mới).**

**NGUYÊN NHÂN (suy luận có căn cứ từ bằng chứng, CHƯA được xác nhận trực tiếp bằng cách đọc `AudioContext.state` tại đúng thời điểm câm — ghi rõ ở đây để phiên sau biết đây là giả thuyết mạnh, không phải đã chốt):** piano roll của bài này có nhiều đoạn note thưa, có khoảng lặng thật giữa các cụm note (nhìn thấy rõ trong ảnh chụp UI người dùng gửi). Chrome có tính năng tự động **suspend** 1 `AudioContext` đang "im lặng" (không có audio node nào thực sự phát) trong 1 khoảng thời gian, để tiết kiệm pin/tài nguyên. `scheduleChunk`/`scheduleBeat` (bộ lập lịch lookahead vừa thêm ở bug thứ 2) tính toán note cần lên lịch dựa trên `Tone.now()` — nếu context bị Chrome tự suspend giữa 1 khoảng lặng của bài, `Tone.now()` NGỪNG TĂNG; vòng lặp `setTimeout` vẫn tự chạy đều đặn mỗi 50ms (không có lỗi gì, không throw gì) nhưng `targetTick` tính ra không bao giờ vượt qua giá trị đã đạt được lúc suspend, nên `if (targetTick > scheduledUpToTick)` mãi mãi false → không note nào được lên lịch thêm nữa, dù vòng lặp bản thân nó vẫn "sống" (polling vô ích tới hết bài). Đây khớp hoàn toàn với triệu chứng "không lỗi gì, tự nhiên im" và giải thích tại sao 1 file NHỎ, ÍT note, NHIỀU khoảng lặng lại dễ trúng bug này hơn 1 file 17 nhạc cụ dày đặc note liên tục (khó có khoảng lặng đủ dài để Chrome quyết định suspend).

**FIX ĐÃ ÁP DỤNG (phòng thủ, chưa xác nhận 100% đúng gốc rễ):** cả `scheduleChunk` (note scheduler) và `scheduleBeat` (metronome, cùng kiến trúc/cùng rủi ro) trong `frontend/components/midi-editor/midi-editor.tsx` giờ tự kiểm tra `Tone.getContext().rawContext.state !== "running"` ở ĐẦU MỖI LẦN CHẠY (mỗi ~50ms), và tự gọi `.resume()` nếu phát hiện không phải `running` — resume 1 context đã `running` sẵn là no-op vô hại, nên thêm bước này không có tác dụng phụ kể cả nếu giả thuyết trên sai.

**Verify đã làm:** `npx tsc --noEmit` sạch, `npx eslint components/midi-editor/midi-editor.tsx lib/tone-synth-engine.ts` chỉ còn 5 warning cũ từ §22, 0 error.

**⚠️ VẪN CHƯA ĐỦ ĐIỀU KIỆN BÁO "XONG" — bug này CHƯA được xác nhận qua thực nghiệm (chỉ là suy luận mạnh), khác các bug trước đã đọc code/log xác nhận chắc chắn:** nhờ người dùng test lại đúng project 2-track vừa lỗi (`Mobile Suit Gundam Narrative - Cage`) — bấm Play, để chạy hết khoảng lặng đầu tiên, xác nhận note ở CỤM TIẾP THEO (sau khoảng lặng) có tự động vang lên hay không. Nếu fix đúng → nghe được hết bài. Nếu VẪN im sau khoảng lặng → giả thuyết auto-suspend sai, cần nhờ người dùng tự đọc trực tiếp `Tone.getContext().rawContext.state` ngay tại thời điểm câm (mở Console, gõ lệnh đó) để có bằng chứng thật thay vì suy luận.

**⚠️ ĐÍNH CHÍNH — giả thuyết auto-suspend ở trên là SAI, fix đó đã bị gỡ.** Người dùng báo thêm: vạch đỏ (playhead) vẫn chạy bình thường khi câm — nếu context bị suspend thật thì `Tone.now()` (thứ điều khiển playhead) phải đứng yên. Các vòng chẩn đoán sau đó (log tạm, đều đã gỡ) loại trừ lần lượt: scheduler vẫn chạy + `triggerNotes` vẫn gọi `triggerAttackRelease` thành công liên tục; `masterGain=1`, `ctxState=running` suốt; `chrome://media-internals` báo stream vẫn `started`/`volume=1` ngay lúc câm; YouTube tab khác vẫn nghe được cùng lúc; raw `OscillatorNode` 8 giây nghe trọn vẹn (loại trừ phần cứng/driver); `Tone.Limiter.reduction` về ~0 dB (Limiter không kẹt); bỏ `Tone.Filter` khỏi chuỗi Sampler → không đổi gì (đã hoàn nguyên). Manh mối quyết định từ người dùng: "Pause rồi Play lại thì nghe thêm được đúng 1 nhịp".

**NGUYÊN NHÂN THẬT (đọc code xác nhận + mô phỏng số khớp log thật): bug do chính `scheduleNotes` (fix bug thứ 2) gây ra.** `triggerNotes` tính `time = startTime + (n.start - fromTick) * secPerTick` — `fromTick` vừa là đầu cửa sổ lọc note, vừa là mốc thời gian. `scheduleChunk` truyền `fromTick: scheduledUpToTick` (đầu cửa sổ của từng đợt) nhưng `startTime` là thời điểm của tick bắt đầu phát ban đầu → từ đợt thứ 2 trở đi, mọi note bị lên lịch vào QUÁ KHỨ, lệch đúng bằng thời gian đã phát (mô phỏng với các cửa sổ lấy từ log thật: lệch 0.23s, 0.46s, 1.45s, ... 6.24s). Note nhận thời điểm quá khứ bắt đầu và release gần như ngay lập tức → câm, và `triggerAttackRelease` không hề ném lỗi nên mọi log đều "khỏe". Đợt đầu có `fromTick` = tick bắt đầu nên đúng → nghe vài note đầu; Pause/Play tạo phiên mới → đợt đầu của phiên mới đúng → nghe thêm 1 nhịp. Khớp toàn bộ triệu chứng. File 17 nhạc cụ trước đó không bị lộ rõ vì lúc test đó vẫn chạy code cũ (lên lịch 1 lần cả bài).

**FIX:** thêm tham số tuỳ chọn `anchorTick` vào `TriggerNotesParams` (`tone-synth-engine.ts`) — tick phát đúng tại `startTime`, mặc định `= fromTick` (nên `audio-exporter.ts` gọi 1 lần cả bài không đổi hành vi). `scheduleChunk` truyền `anchorTick: fromTick` (tick bắt đầu của cả phiên), còn `fromTick` vẫn là đầu cửa sổ đợt. Đồng thời gỡ 2 thay đổi suy đoán đã được chứng minh không phải nguyên nhân: guard `rawContext.resume()` trong `scheduleChunk`/`scheduleBeat`, và việc bỏ `Tone.Filter` khỏi chuỗi Sampler (hoàn nguyên chuỗi `synth → filter → panner` gốc). `tsc --noEmit` sạch, eslint 0 error (5 warning cũ từ §22), grep `DEBUG-TEMP` = 0.

**Bài học cho phiên sau:** 4 vòng "thêm log → nghi phạm mới" (auto-suspend, Limiter, Filter, phần cứng) đều nhắm vào tầng audio graph/Chrome trong khi lỗi nằm ở phép tính thời gian trong đúng đoạn code vừa viết. Khi log báo "mọi thứ được gọi đúng, không lỗi" mà vẫn câm, kiểm tra ngay **giá trị tham số `time` truyền vào `triggerAttackRelease` so với `Tone.now()`** trước khi nghi ngờ tầng thấp hơn.

**Kết quả verify (người dùng nghe thật): phát mượt, Pause không còn chồng lớp** — fix `anchorTick` đúng. Còn 2 vấn đề:

**(a) Stop/Pause trễ rõ rệt mới dừng — ĐÃ SỬA.** Nguyên nhân (đọc source `node_modules/tone/build/esm/instrument/Sampler.js`, `triggerRelease`): `Sampler.triggerAttackRelease` gọi `triggerRelease` ngay lúc lên lịch — hàm này đặt sẵn `source.stop(thờiĐiểmTương Lai)` rồi `this._activeSources.set(midi, [])`, tức xoá note khỏi danh sách "đang phát" NGAY LẬP TỨC. `stopAudio()` gọi `releaseAll()` — hàm chỉ duyệt đúng danh sách đó → không tắt được gì; note đã bắt đầu vang tới hết độ dài tự nhiên (note dài cả ô nhịp ≈ 2s ở bài Cage). Fix: `stopAudio()` gọi `disposeVoiceCache(voiceCacheRef.current)` thay vì `releaseAll()`. `Sampler.dispose` → `ToneAudioNode.dispose` → dispose/ngắt `output` → mọi note đi qua voice đó im ngay. Đã kiểm tra `ToneAudioBuffer.dispose` chỉ gán `this._buffer = undefined` trên wrapper, không đụng `AudioBuffer` gốc đang cache trong `sample-buffer-cache.ts` → dựng lại voice ở lần Play sau chỉ `.add()` lại buffer đã decode, không fetch/decode lại (thứ gây lag ở §21 mục 6). Thêm guard `if (toneSampler.disposed) return;` trong `.then` tải sample (Stop giữa lúc đang tải). Cập nhật các comment cũ nói "voice giữ sống xuyên Play/Stop" (giờ sai). **⚠️ Chưa verify hiệu năng kéo tua** trên project 17 nhạc cụ: mỗi lần restart khi kéo (tối đa ~8 lần/giây) giờ dựng lại 23 Sampler × 88 buffer — cần người dùng thử kéo thanh đỏ lúc đang phát xem có lag lại không.

**(b) Track 12-15 của `unicorn-gundam-wip.mid` không tự gán nhạc cụ — KHÔNG phải bug, là hành vi cố ý chưa làm.** Đọc file bằng `@tonejs/midi`: 4 track đó là bộ gõ kênh 10 GM (`standard kit` ×2, `orchestra kit` ×2, `percussion: true`). `midi-parser.ts` cố ý để `instrument: null` cho percussion (comment trong code + §21 mục 3). Hệ quả hiện tại: 4 track này rơi về oscillator PolySynth, phát số note trống (35=kick, 38=snare, 42=hi-hat…) thành cao độ "tút" — nghe sai. Hỗ trợ trống thật cần bộ sample drum kit + map từng note → sample riêng (tính năng mới, cần chọn nguồn sample/license) — **chưa làm, chờ người dùng quyết định.**

`tsc --noEmit` sạch, eslint 0 error (5 warning cũ từ §22).

**Kết quả verify (người dùng nghe thật):** Pause/Stop im ngay; kéo thanh đỏ lúc đang phát trên `unicorn-gundam-wip` (dựng lại 23 voice mỗi lần restart) vẫn mượt — cả 2 đạt. Người dùng chọn làm tiếp **hỗ trợ trống thật** (xem §24).

**Chưa commit/push.**

---

## §24 — Hỗ trợ bộ trống GM thật (kênh 10) (13/09/2026)

**Yêu cầu người dùng:** track 12-15 của `unicorn-gundam-wip.mid` (4 track trống kênh 10: `standard kit` ×2, `orchestra kit` ×2) không có âm thanh trống thật — trước đây `midi-parser.ts` cố ý để `instrument: null`, rơi về oscillator và phát số note trống thành tiếng "tút" có cao độ.

**Nguồn sample (đã kiểm tra, không đoán):** `gleitz/midi-js-soundfonts` (nguồn 17 nhạc cụ hiện tại) **không có** bộ trống kênh 10 — 641 mục trong `FluidR3_GM` = đúng 128 nhạc cụ có cao độ × 5 file. Dùng fork `paulrosen/midi-js-soundfonts`, README ghi rõ lý do fork là bản gốc thiếu kênh 10: `FluidR3_GM/percussion-mp3` — cùng soundfont FluidR3_GM, cùng CC-BY 3.0 (code repo: MIT). 61 file MP3 (128kbps, giống bộ hiện tại), MIDI 27 (Eb1) – 87 (Eb6) liền mạch, phủ toàn bộ key map GM/GM2 kênh 10; tổng ~740KB. Tải về `frontend/public/instruments/percussion/`. Chỉ có bộ Standard — Orchestra kit trong file được map sang cùng bộ Standard (xấp xỉ, chấp nhận được).

**Thay đổi:**
- `shared-types/src/index.ts`: hằng `DRUM_KIT_INSTRUMENT_NAME = "Standard Drum Kit"` + mục `{ id: 128, name: DRUM_KIT_INSTRUMENT_NAME, category: "Drum Kit" }` trong `GM_INSTRUMENTS` (id 128 theo quy ước SoundFont bank 128 = percussion). Backend DTO dùng `@IsIn(GM_INSTRUMENT_NAMES)` → tự nhận tên mới, ô chọn nhạc cụ (`track-panel.tsx`) tự hiện nhóm "Drum Kit". Không đổi `schemaVersion` — `instrument` vẫn là string, chỉ thêm 1 giá trị hợp lệ mới.
- `frontend/lib/instrument-samples.ts`: `DRUM_SAMPLE_NOTES` (61 note) riêng cho slug `percussion`, thay vì bộ 88 note của nhạc cụ có cao độ.
- `frontend/lib/tone-synth-engine.ts`: `TrackVoice.oneShot`. Voice trống gọi `triggerAttack` (không `triggerAttackRelease`) — mỗi tiếng trống vang hết sample, giống mọi synth GM (note-off kênh 10 bị bỏ qua; note trống trong MIDI thường chỉ vài tick, tôn trọng độ dài sẽ cắt cymbal thành tiếng "tách"). Voice trống không đi qua `Tone.Filter` lowpass 6kHz (làm đục cymbal/hi-hat). Stop vẫn cắt ngay nhờ dispose voice (§23).
- `frontend/lib/midi-parser.ts`: track `percussion` → tự gán `DRUM_KIT_INSTRUMENT_NAME`.
- `frontend/lib/midi-exporter.ts`: track trống → `midiTrack.channel = 9` (kênh 10). Đã test round-trip bằng `@tonejs/midi`: export → import lại → `percussion: true`.
- `frontend/public/instruments/CREDITS.txt`: thêm mục ghi công nguồn percussion.

**Verify đã làm:** `tsc --noEmit` frontend + backend sạch; eslint 0 error (5 warning cũ §22); script node xác nhận 61 tên note ↔ 61 file trên đĩa ↔ MIDI 27-87 liền mạch, GM đúng (35=B1, 36=C2, 38=D2, 42=Gb2); UI track 12-15 của file test đúng là 4 track trống. **Chưa nghe thử bằng tai** — cần người dùng verify.

**Lưu ý cho phiên sau:**
- Project đã import TRƯỚC thay đổi này: track trống vẫn `instrument: null` — phải tự chọn "Standard Drum Kit" trong ô nhạc cụ, hoặc import lại file.
- Backend dev server phải restart để nạp danh sách tên nhạc cụ mới (nếu không, `PUT /projects/:id/draft` với "Standard Drum Kit" sẽ bị `@IsIn` từ chối).
- Chưa làm hi-hat choke (hi-hat đóng cắt hi-hat mở) — synth GM thật có, ở đây chưa.
- **Nghi vấn ghi công sai (chưa sửa, chờ người dùng xác nhận):** `CREDITS.txt`, comment đầu `instrument-samples.ts` và `components/site-footer.tsx` ghi tác giả FluidR3_GM là "S. Christian Collins (GeneralUser GS)". README của gleitz không nhắc tên này; Collins là tác giả GeneralUser GS, soundfont khác. CC-BY yêu cầu ghi công đúng tác giả — cần kiểm lại trước khi nộp.
- Vấn đề có sẵn, chưa đụng: `midi-exporter.ts` xuất mọi track có cao độ trên cùng kênh 0 (mặc định của `@tonejs/midi`) — trình phát MIDI ngoài sẽ áp program change cuối cùng cho tất cả, các track có thể nghe cùng 1 nhạc cụ.

**Phản hồi người dùng: trống nghe "âm sắc sai / rẻ".** Điều tra bằng số liệu (không nghe được): cả 61 file FluidR3 percussion đều dài đúng 10089 byte = ~0,63s ở 128kbps CBR — **mọi tiếng trống bị render cắt cứng ở 0,63s** (61 hash khác nhau, không phải file trùng; chỉ là render cố định độ dài). Crash cymbal lẽ ra vang ~7s bị chặt ngang → nghe "rẻ". Bộ thay thế duy nhất: `paulrosen/.../MusyngKite/percussion-mp3` — vang tự nhiên (kick 2,4s, snare 2,5s, crash 6,3–7,4s), 60 file MIDI 28-87, ~2,9MB. **Nhưng:** (1) license CC BY-SA 3.0 (ShareAlike), khác CC-BY đang dùng; (2) thư mục `FatBoy/percussion-mp3` giống hệt từng byte (cùng md5), cùng được thêm trong 1 commit `285acae` "Add percussion font" 17/01/2022 → không xác định được render từ soundfont nào để ghi công chính xác. **Chưa đổi — người dùng hỏi lại "nếu chỉ đọc file MIDI thì các track đó dùng trống gì" trước khi chọn, quyết định vẫn đang chờ.** Thông tin đã trả lời: file MIDI không chứa âm thanh, chỉ chỉ định kênh 10 + kit (program 0 "standard kit" ở UI track 12 & 15, program 48 "orchestra kit" ở UI track 13 & 14) + số note (35, 36, 38, 42, 44-50, 53, 57). Theo bảng GS Orchestra Set (hiểu biết của Claude, chưa đối chiếu tài liệu Roland): trong orchestra kit, 35 = concert bass drum, 57 = concert cymbal — tức file muốn trống/cymbal giao hưởng, bộ Standard (pop/rock) chỉ là xấp xỉ.

**Theo yêu cầu người dùng: thêm sample thật cho Steel Drums / Taiko Drum / Synth Drum** (3 nhạc cụ GM có cao độ, nhóm Percussive — trước đó rơi về oscillator). Tải 88 file mỗi nhạc cụ từ `gleitz.github.io/midi-js-soundfonts/FluidR3_GM/<slug>-mp3/` (cùng nguồn/CC-BY 3.0 với 17 nhạc cụ cũ, đã có trong CREDITS.txt chung) vào `frontend/public/instruments/{steel_drums,taiko_drum,synth_drum}/` — 88/88 file, 88 hash khác nhau, MP3 128kbps, tổng ~4,3MB. Thêm 3 dòng vào `INSTRUMENT_SAMPLE_SLUGS` (`instrument-samples.ts`). Script node xác nhận mọi tên trong bảng slug khớp tên trong `GM_INSTRUMENTS` và đủ 88 file.

**Giới hạn còn lại — người dùng chọn KHÔNG sửa (chỉ cần biết thông tin):** piano roll của track trống vẫn hiện tên nốt (C2, D2…), không hiện tên trống GM. Kit kênh 10 khác Standard/Orchestra (Room, Power, Jazz, Brush…) vẫn gộp về Standard khi import → export ghi lại program 0, không giữ kit gốc. (Việc import/export giữ đúng Standard vs Orchestra đã được giải quyết như hệ quả của việc thêm bộ Orchestra — người dùng yêu cầu thêm bộ Orchestra, không phải yêu cầu hiển thị thông tin.) Đừng tự làm các mục còn lại nếu không được yêu cầu lại.

**Lưu ý vận hành:** restart backend dev server để nạp tên "Orchestra Drum Kit" cho `@IsIn`; project đã import trước đó phải tự chọn lại "Orchestra Drum Kit" cho track orchestra kit (hoặc import lại file).

**Tham chiếu so sánh — SpessaSynth (https://spessasus.github.io/SpessaSynth/, repo `spessasus/SpessaSynth`, Apache-2.0), người dùng dùng để đối chiếu tiếng:** là bộ tổng hợp SoundFont2 chạy thời gian thực trong trình duyệt (khác STAVE: STAVE phát sample MP3/WAV render sẵn qua Tone.Sampler). Soundfont mặc định đóng gói: `soundfonts/GeneralUserGS.sf3` (8,4MB). Đọc trực tiếp header RIFF của file (INFO + `phdr`): `INAM` "GeneralUser GS 2.0.3 BETA", `IENG`/`ICOP` "S. Christian Collins" (1997-2025), 287 preset; bank 128 (drum kits): 0 Standard 1, 1 Standard 2, 2 Standard 3, 8 Room, 16 Power, 24 Electronic, 25 808/909, 26 Dance, 32 Jazz, 40 Brush, **48 Orchestral**, 56 SFX, 127 CM-64/32L. → Với `unicorn-gundam-wip`, SpessaSynth phát UI track 12/15 bằng "Standard 1" (bank 128 prog 0), track 13/14 bằng "Orchestral" (bank 128 prog 48). License trong `ICMT` ("License v2.0"): tự do dùng để làm nhạc, cá nhân hoặc thương mại; được dùng trong dự án phần mềm và sửa đổi bank/đóng gói; sample bên trong cho phép dùng đầy đủ kể cả thu lợi từ bản thu.

**⇒ Ghi công sai — ĐÃ SỬA (người dùng yêu cầu "đảm bảo các thông tin ghi công đều đầy đủ"):** S. Christian Collins là tác giả GeneralUser GS, không phải FluidR3_GM. Tác giả FluidR3_GM đã kiểm chứng qua file copyright gói Debian `fluid-soundfont` (https://metadata.ftp-master.debian.org/changelogs/main/f/fluid-soundfont/unstable_copyright): "Copyright 2000-2002, 2008 Frank Wen; 2008 Toby Smithe", license gốc MIT (gleitz phân phối bản MP3 render theo CC BY 3.0). Đã sửa: `CREDITS.txt` (mục melodic: tác giả Frank Wen + license gốc MIT + link CC BY 3.0 + link nguồn Debian; thống nhất cách viết "CC BY 3.0"), comment đầu `instrument-samples.ts`, `components/site-footer.tsx` (FluidR3_GM by Frank Wen · Drum kit via paulrosen CC BY-SA 3.0 · Orchestral percussion VCSL CC0 · link "Full credits" tới `/instruments/CREDITS.txt`). grep xác nhận "Christian Collins" chỉ còn ở dòng ghi nhận công thức phối GeneralUser GS (đúng ngữ cảnh).

**Chỉnh bộ Orchestra theo GeneralUser GS (người dùng yêu cầu "chỉnh để tôi nghe thử"):** đọc toàn bộ zone phím 35-59 của preset Orchestral (bank 128 prog 48) trong `GeneralUserGS.sf3`, kèm dải velocity + initialAttenuation. Ở velocity 112 (velocity duy nhất của UI track 13), phím 35 = Jazz Bass Drum (att 10dB, thân chính) + Taiko Drum (27,5dB) + Timpani Hard (27,5dB) + Standard Kick 1 (26dB) → các lớp phụ nhỏ hơn thân 16-17,5dB. Phím 57 = "Crash Cymbal 2" (Crash + Ride pha theo velocity), giống bộ Standard.
- Engine (`tone-synth-engine.ts`): `TrackVoice.layers` — mỗi lớp là 1 `Tone.Sampler` 1-sample riêng, chỉ trigger đúng phím của nó, gain = `Tone.dbToGain(gainDb)` nhân vào velocity; dispose cùng voice; tải qua `loadSampleBuffer` và gộp vào `ready`.
- `instrument-samples.ts`: `SampleLayer`, `InstrumentSamplerOptions.layers`. Bộ Orchestra: phím 35 bỏ VCSL, thân chính = `percussion/B1.mp3` + lớp `taiko_drum/B1.mp3` −17,5dB, `timpani/B1.mp3` −17,5dB, `percussion/C2.mp3` −16dB (chỉ chép **công thức**, mọi sample là của STAVE; không mô phỏng crossfade theo velocity). Phím 57 bỏ override → `percussion/A3.mp3`. Đã xoá `orchestra_kit/concert_cymbal_2.wav` (không còn dùng) + dòng ghi công của nó. Giữ VCSL cho 36/38/40/59, timpani FluidR3 cho 41-53.
- Verify: tsc sạch, eslint 0 error; script node xác nhận mọi đường dẫn chính + 3 lớp của bộ Orchestra tồn tại, không còn tham chiếu file đã xoá. **Chưa nghe thử.**

**⚠️ TOÀN BỘ các phương án bộ trống ở trên (FluidR3 percussion, MusyngKite "vang dài", Orchestra = VCSL + công thức phối phím 35) ĐÃ BỊ THAY — người dùng chọn "lấy thẳng sample thật của GeneralUser GS cho cả hai bộ trống" (13/09/2026). Thư mục `percussion/` và `orchestra_kit/` đã xoá; cơ chế `layers` trong engine đã gỡ.**

**Hiện trạng bộ trống (chốt):** cả "Standard Drum Kit" và "Orchestra Drum Kit" phát bằng chính sample + dữ liệu vùng (zone) của GeneralUser GS 2.0.3 BETA (S. Christian Collins, GeneralUser GS License v2.0 — cho phép dùng trong phần mềm và "modify the SoundFont bank or its packaging"), preset "Standard 1" (bank 128 prog 0) và "Orchestral" (bank 128 prog 48), lấy từ `GeneralUserGS.sf3` đóng gói trong SpessaSynth.
- **Tách dữ liệu:** `frontend/scripts/extract-generaluser-drums.mjs <GeneralUserGS.sf3>` (chỉ dùng Node built-in). SF3 lưu mỗi sample là một stream Ogg Vorbis độc lập trong chunk `smpl` (đã xác nhận: 100% sample của 2 kit có cờ nén 0x10 và bắt đầu bằng `OggS`, đều mono) → ghi nguyên byte ra `.ogg`, không giải mã/mã hoá lại. Tính generator hiệu dụng mỗi vùng theo SF2 2.04: mặc định → global zone instrument → zone instrument; generator của preset (global + zone) cộng dồn, trừ nhóm chỉ-dành-cho-instrument; key/vel range = giao của instrument và preset. Kết quả: `frontend/public/instruments/generaluser_drums/` — 72 file `.ogg` (~1MB) + `kits.json` (116KB; Standard 175 vùng / 64 sample, Orchestral 134 vùng / 52 sample). File `.sf3` gốc KHÔNG nằm trong repo (đang ở scratchpad phiên này) — muốn tạo lại thì tải `soundfonts/GeneralUserGS.sf3` từ repo spessasus/SpessaSynth.
- **Phát (runtime):** `frontend/lib/soundfont-kit.ts` — class `SoundFontKitVoice` (fetch `kits.json` 1 lần, cache theo module; buffer qua `loadSampleBuffer`). Mỗi note: chọn mọi vùng có key + velocity khớp; mỗi vùng tạo `Tone.ToneBufferSource` (playbackRate = 2^(((key−root)×scaleTuning + tune)/1200), scaleTuning 0 = không đổi cao độ theo phím) → [Tone.Filter lowpass 12dB nếu fc < 13500 cents hoặc có modEnvToFilterFc, cutoff chạy theo modulation envelope] → Tone.Gain (volume envelope SF2: delay, attack tuyến tính, hold, decay dB-tuyến-tính tới sustain, release từ note-off; có keynumToVolEnvHold/Decay) → [Tone.Panner nếu pan ≠ 0] → panner của track. Gain = (velocity/127)² × 10^(−attenuation/200) × track.volume. Exclusive class: note mới fast-release các hit cùng class bắt đầu trước nó (hi-hat đóng cắt hi-hat mở). Không gọi `source.stop()` — envelope làm im, sample tự hết (native source chỉ stop được 1 lần). Bám theo spessasynth_core (đọc mã nguồn thật): `cbAttenuationToGain = 10^(−cB/200)` (không nhân 0,4 kiểu EMU/FluidSynth), sàn im lặng envelope 960 cB, đường cong velocity mặc định concave 960 cB ⇒ (v/127)², exclusive cutoff −2320 timecents; kênh trống vẫn nhận note-off và đi vào release (không bị kill) — release của GeneralUser thường rất dài nên gần như one-shot, riêng vài vùng như triangle "mute" (phím 80) release ~0,5s. **Không mô phỏng:** loop sample (các vùng loop đều nằm ở đuôi sample — phát hết sample là đủ), LFO, reverb/chorus send (SpessaSynth có hiệu ứng → STAVE nghe khô hơn).
- **Engine:** `tone-synth-engine.ts` — `TrackVoice` giờ `{ synth | null, kit | null, filter, panner }`; kit dùng `SoundFontKitVoice` (không qua filter 6kHz); `triggerNotes` sắp note theo thời gian bắt đầu (cần cho exclusive class) và gọi `kit.trigger(pitch, velocity MIDI thô, track.volume, time, durSec)`. `instrument-samples.ts` về lại chỉ nhạc cụ có cao độ. `shared-types`: `isDrumKitInstrument` thành type guard (`name is string`). `midi-parser`/`midi-exporter`/`GM_INSTRUMENTS` giữ nguyên như phần Orchestra ở trên.
- **Ghi công:** `CREDITS.txt` viết lại — mục melodic (FluidR3_GM by Frank Wen, CC BY 3.0 qua gleitz, license gốc MIT theo Debian) + mục drum kits (GeneralUser GS, nguồn file, cách repackage, **toàn văn license v2.0** lấy từ trường ICMT, ghi nhận spessasynth_core Apache-2.0 là tham chiếu hành vi, không chép code). Footer: "Drum kits: GeneralUser GS by S. Christian Collins, schristiancollins.com (GeneralUser GS License v2.0)" — link tới trang web tác giả, đúng yêu cầu "đừng link thẳng file tải" trong license; bỏ paulrosen/VCSL.
- **Verify:** tsc frontend + backend sạch, eslint 0 error (5 warning cũ §22); script node: mọi file trong `kits.json` tồn tại, không giá trị non-finite; phím 35 Orchestral = 12 vùng (taiko/timpani hard/jazz BD/standard kick) đúng attenuation đã phân tích; phím 42/46 Orchestral = timpani (đúng bố cục GS); grep không còn tham chiếu `percussion/`, `orchestra_kit`, `layers`, `oneShot`, `paulrosen`, `VCSL`. **Chưa nghe thử bằng tai; chưa kiểm chứng Safari giải mã được Ogg Vorbis** (Report 3 đã ghi Safari chỉ hỗ trợ best-effort).

**Người dùng hỏi: các thay đổi có ảnh hưởng nội dung Report 3 (`docs/Report3_Software Requirement Specification.docx`) không?** Đã trích 8818 đoạn văn bản và dò: Report chỉ mô tả ở mức chức năng ("hệ thống tải sample nhạc cụ", "Web Audio API / Tone.js", timing do Web Audio scheduler qua Tone.js, không nạp cả thư viện sample lớn một lần, Chrome/Edge/Firefox + Safari best-effort) — mọi thay đổi vẫn khớp, không câu nào bị sai; UC-39 xuất MIDI kèm nhạc cụ còn khớp hơn (xuất đúng kênh 10 + program kit). Report không có mục ghi công/license tài nguyên âm thanh bên thứ ba (có thể cân nhắc bổ sung). Lệch có sẵn từ trước, không do phiên này: UC-38 hứa xuất MP3 (code mới WAV); UC-37 2.E1 hứa báo track nào câm khi sample lỗi (code mới `console.warn`).

**Ghi chú từ người dùng:** trang MuseScore của bản gốc cho thấy 4 track trống là 4 dòng nhạc riêng — Snare Drum (UI track 12), Bass Drum (13), Cymbal (14), Drumset (15) — khớp dữ liệu kênh 10 (13/14 dùng orchestra kit). Người dùng sẽ thử thêm file MIDI khác.

**Người dùng hỏi "chưa có chức năng xóa project à" — ĐÃ CÓ (UC-21), đã kiểm chứng:** backend `DELETE /projects/:id` (`projects.controller.ts`, `deleteOwned` chỉ owner) + frontend nút "Xóa dự án" ở `/projects/[id]/settings` (mục "Vùng nguy hiểm"), hộp thoại bắt gõ đúng tên project mới bật nút (đúng UC-21 bước 4 / BR-23); tới được từ nút "Cài đặt" trên card ở `/projects`. Tra DB thật (`pg_constraint`, chỉ đọc): xoá `projects` → CASCADE branches (→ commits, drafts → commit_tags), comments, collaborators, stars, pull_requests, reports, sound_mappings, audio_sketches; fork chỉ bị SET NULL `forked_from_project_id` (đúng BR-19); 3 FK NO ACTION (`projects.active_branch_id`, `branches.head_commit_id`, `commit_tags.project_id`) không chặn vì Postgres kiểm NO ACTION cuối câu lệnh, sau khi cascade đã xoá hết dòng tham chiếu; không có trigger chặn DELETE (trigger duy nhất public: `commit_tags_set_project_id_trigger`, BEFORE INSERT); `service_role` có quyền DELETE trên `projects`. **Chưa test xoá thật** (không xoá dữ liệu người dùng để thử). Lệch nhỏ so với UC-21, chưa làm: nút Delete không nằm trong menu project ở Project Dashboard (UC-21 trigger), hộp thoại chưa liệt kê số commit/branch sẽ mất (bước 3), chưa có lựa chọn "Lưu trữ thay vì xoá" (3.1); PR đang mở nhắm tới project bị xoá theo cascade chứ không "đóng" (POST-2); file Storage của audio sketch (nếu có) không bị xoá theo.

**Lỗi UI người dùng báo (ảnh chụp `/projects/[id]/settings`): footer đè lên khối "Vùng nguy hiểm" — ĐÃ SỬA.** Nguyên nhân (`app/layout.tsx`): `body` `h-full flex flex-col`, `main` `min-h-0 flex-1` (bị chặn đúng chiều cao viewport − header − footer, cố ý cho MIDI Editor) nhưng không có overflow → mọi trang dài hơn viewport tràn nội dung ra khỏi `main` và vẽ đè footer (không riêng trang Settings). Sửa: `main` thêm `overflow-y-auto` (thành vùng cuộn; editor vẫn có chiều cao chặn như cũ). Grep xác nhận không có code nào phụ thuộc cuộn của `window`. Đổi 3 chỗ đang đặt chiều cao theo viewport sang `min-h-full` (vừa khít `main`): `app/page.tsx` (`min-h-screen`), `components/auth-card.tsx` và `app/auth/callback/page.tsx` (`min-h-[calc(100vh-8.5rem)]` — 8.5rem là ước lượng header+footer đã sai vì footer giờ dài hơn). tsc/eslint sạch. **Chưa kiểm tra trên trình duyệt** — cần người dùng xem lại: trang Settings, trang chủ, trang đăng nhập, và MIDI Editor (không được tự nhiên xuất hiện thanh cuộn ngoài).

**Quyết định cuối của người dùng (13/09/2026, thay quyết định "tạm giữ FluidR3" trước đó): (1) tạm thời ĐỔI bộ Standard sang bộ vang dài; (2) THÊM bộ Orchestra.**

**(1) Standard Drum Kit → bộ vang dài — ĐÃ LÀM.** `frontend/public/instruments/percussion/` giờ là 60 file từ `paulrosen/.../MusyngKite/percussion-mp3` (MIDI 28-87, 60 hash khác nhau, ~3MB) — bộ FluidR3 cũ (61 file, cắt 0,63s) đã bị thay hẳn. `DRUM_SAMPLE_NOTES` bỏ `"Eb1"` (bộ mới không có note 27), comment cập nhật nguồn. `CREDITS.txt`: mục percussion ghi CC BY-SA 3.0 + cảnh báo nguồn gốc (MusyngKite/FatBoy giống hệt, commit `285acae`). `site-footer.tsx`: thêm dòng "Drum kit: percussion samples via paulrosen/midi-js-soundfonts (CC BY-SA 3.0)".

**(2) Orchestra Drum Kit — ĐÃ LÀM.** Nguồn: **VCSL** (`sgossner/VCSL`, Versilian Studios, **CC0-1.0** — đã xác nhận qua GitHub API + README: không cần ghi công, không ShareAlike). Repo ~4GB WAV không nén → chỉ lấy lẻ 4 hit, lưu ở `frontend/public/instruments/orchestra_kit/` (đổi tên, không sửa nội dung; nguồn gốc từng file ghi trong `CREDITS.txt`): `concert_bass_drum.wav` (Bass Drum 2 `bassdrum_hit_f`, 16-bit), `concert_snare.wav` (Snare Drum Rope Tension `Hi/RopeSnare_hi_sn_Main_vl3_rr1`, **24-bit**), `concert_cymbal_1.wav` (Clash Cymbals 1 `cymbal_crash1_mf2`), `concert_cymbal_2.wav` (Clash Cymbals 2 `cymbal_crash2_f1`) — tổng ~6,7MB. Bố cục phím theo Roland GS Orchestra Set (**theo hiểu biết của Claude, chưa đối chiếu tài liệu Roland gốc**): nền là bộ Standard (`percussion/`), đè 35/36 → concert bass drum, 38/40 → concert snare, 57 → cymbal 2, 59 → cymbal 1, và 41-53 → timpani F2-F3 dùng lại `timpani/` FluidR3 đã có (không tải thêm).

Code: `shared-types` thêm `ORCHESTRA_KIT_INSTRUMENT_NAME = "Orchestra Drum Kit"`, `DRUM_KIT_ID_OFFSET = 128`, `isDrumKitInstrument()`; kit nằm trong `GM_INSTRUMENTS` với id = 128 + program kênh 10 (Standard 128, Orchestra 176). `instrument-samples.ts`: `orchestraKitSamplerOptions()` (baseUrl `/instruments/`, đường dẫn trộn nhiều thư mục). `tone-synth-engine.ts`: one-shot + bỏ filter cho MỌI kit (`isDrumKitInstrument`). `midi-parser.ts`: kênh 10 → `getInstrumentById(128 + program)`, kit không có (Room, Power…) rơi về Standard. `midi-exporter.ts`: kit → kênh 9 + program = id − 128.

Verify: tsc frontend + backend sạch, eslint 0 error. Script node **biên dịch thật** `shared-types` qua `typescript.transpileModule` (một script dò regex trước đó báo sai do bash nuốt ký tự `\` — không phải lỗi code): 2 mục kit đúng id, "Orchestra Drum Kit" có trong `GM_INSTRUMENT_NAMES` (`@IsIn`); UI track 12/15 → Standard, 13/14 → Orchestra; round-trip export→import giữ đúng kit (prog 0 / 48 trên kênh 9); 60 phím của bộ Orchestra đều trỏ tới file có thật. **Chưa nghe thử bằng tai; chưa verify trình duyệt giải mã được WAV 24-bit của snare** (Chrome thường hỗ trợ — cần người dùng xác nhận).

**Chưa commit/push.**

---

## §25 — UC-53/54/55 (Audio Sketch) hoãn lại; kiểm tra 2 nhánh chờ merge (16/09/2026)

**UC-53/54/55 (Record/Trim/Attach audio sketch) — HOÃN, làm sau.** Thành viên phụ trách gặp lỗi `new row violates row-level security policy` khi test upload lên bucket `audio-sketches`, và nhận liên tiếp 3 gợi ý vá RLS từ AI khác (mở `anon`+`true` → scope `authenticated`+`true` → scope theo `auth.uid()` trong path) — cả 3 bản đều bị chỉ ra vấn đề trong phiên chat (xem lịch sử hội thoại, chưa ghi thành file riêng): bản 1-2 mở quyền quá rộng (ai cũng đọc/ghi được sketch người khác); bản 3 (scope `auth.uid()`) tuy đúng hướng nhưng **chỉ cho phép đúng người upload đọc lại sketch của chính họ — chặn luôn collaborator hợp lệ**, vi phạm thẳng POST-2 của UC-55 ("can be played by the owner and collaborators", Report 3). Kiến trúc đúng theo Bible mục 30 (dòng 876): **signed URL đi thẳng frontend → Supabase Storage, không qua backend/Railway** — nhưng RLS bảo vệ bucket vẫn phải join sang bảng project/collaborator (chưa xác định đúng tên bảng — cần `list_tables` khi quay lại, đừng đoán theo tên biến TypeScript, xem gotcha CLAUDE.md mục 10 về vụ `branches.head_commit_id`). **Khi quay lại làm UC-53/54/55: bắt buộc tự kiểm tra kỹ policy RLS thật trên Supabase (SELECT phải cho cả owner lẫn collaborator, không chỉ người upload; INSERT nên kiểm thêm quyền edit theo BR-26), không áp nguyên bản gợi ý AI đã đưa trước đó.**

**Kiểm tra 2 việc chờ merge vào `main` — cả hai đều ổn, không thấy lỗi chặn merge:**

1. **Commit `38dc82d` "fix(frontend): enable Open Editor button in projects list" (đã ở trên `main`, do thành viên khác + Claude Opus 5 làm, đã pull về)** — đổi nút "Mở Editor" ở `/projects` từ disabled-placeholder thành `<Link href="/projects/[id]/edit">` thật. Xác nhận `/projects/[id]/edit` đúng là trang chứa `MidiEditor` (2 tab "Trình soạn nhạc"/"Thông tin", mặc định mở tab editor) — không phải trang form riêng như tên gọi "edit" dễ gây nhầm. tsc sạch. **Lưu ý nhỏ (không chặn, có thể dọn sau):** nút mới "Mở Editor" trỏ **cùng URL hệt** nút "Chỉnh sửa" (project chưa lưu trữ) / "Xem" (project đã lưu trữ) đã có sẵn — 2 nút cạnh nhau giờ làm y hệt 1 việc (page không đọc query param để phân biệt tab, `activeTab` luôn khởi tạo `"editor"`). Dư thừa UI, không phải bug chức năng.
2. **Nhánh `feature/adjust-track-pan-uc41` (`a828c26`, chưa merge)** — thêm slider Pan cho track trong `TrackPanel` (redesign), tái dùng đúng field `pan` đã có sẵn trong snapshot + đã được `tone-synth-engine.ts` đọc từ trước (Panner cập nhật live theo `track.pan`) — chỉ thiếu UI, code chỉnh đúng chỗ, không cần đổi schema/shared-types. Pattern `handleSetTrackPan` giống hệt `handleSetTrackVolume` đã có (clamp -1..1, cùng cách gọi `updateSnapshot`). `tsc --noEmit` sạch trên nhánh này. Không phát hiện lỗi — **đủ điều kiện để merge**, người dùng tự bấm merge.

Đã tự checkout nhánh `feature/adjust-track-pan-uc41` để chạy `tsc` rồi quay lại `main`, xoá branch pointer local sau khi xong (không tạo/xoá gì trên remote, không commit/push).

---
