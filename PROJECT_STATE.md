# PROJECT_STATE.md — STAVE

> Nhật ký từng phiên code, theo thời gian. Mỗi phiên thêm 1 mục §N mới, KHÔNG sửa/xoá mục cũ. Trung thực tuyệt đối — ghi rõ % thật đã làm, verify ở mức nào (typecheck / gọi API thật / click tay qua UI), không "làm tròn lên".
>
> **Muốn biết tiến độ hiện tại thì đọc §36** (bảng trạng thái tổng hợp: đã làm / chưa làm / việc người dùng phải tự làm / cái gì chưa được verify). §36 là mục DUY NHẤT được cập nhật tại chỗ khi tiến độ đổi — mọi mục §N khác vẫn giữ nguyên là nhật ký bất biến.
>
> **Mở phiên mới — đọc tối thiểu để tiết kiệm token:** (1) **§36** (trạng thái hiện hành; thứ tự ưu tiên §36-I; bẫy/quyết định treo §36-H; Custom Sound §36-J; công cụ test + Report 5 §36-K; việc sửa tài liệu §36-A); (2) **mục §N cuối file** (phiên gần nhất). **Nếu làm việc về UX/UI (audit + sửa giao diện): đọc §53 trước (mục lục §41–§52, quyết định, việc treo, cách tiếp tục).** Các mục §0→§35 chỉ đọc khi cần chi tiết lịch sử của một việc cụ thể — tra bằng `grep -n "UC-xx" PROJECT_STATE.md` thay vì đọc cả file (file > 250KB, Read tool không mở nổi 1 lần).

---

## §0 — Trạng thái trước khi code (27/08/2026, tổng hợp từ Claude Web)

**Đã có, đã verify thật (không phải kế hoạch trên giấy):**
- Database schema thật trên Supabase (project `S.T.A.V.E`, id `gwbiwweeznbuqfgawywv`): 29 bảng, RLS + policy đầy đủ cho toàn bộ (xem `docs/decisions/STAVE_NhomF_JSONB_RLS_DaChot.md`). Đã chạy `get_advisors` (security + performance) — sạch, không còn cảnh báo chưa xử lý.
- Cột `public.users.role` (`user`/`admin`) + 10 helper function RLS đã tồn tại trong DB thật.
- SRS đầy đủ 119 UC / 135 BR (`Report3_Software_Requirement_Specification.docx`).
- Report 1, Report 2 (WBS 8 sprint, 558 man-day) đã hoàn thiện.

**Chưa có gì (code = 0%):**
- Chưa có repo/monorepo nào được khởi tạo.
- Chưa có dòng code frontend/backend nào.
- Chưa có CI/CD pipeline.

**Việc tiếp theo (Sprint 3, theo Report 2 WBS 3.1.2):** khởi tạo project structure (Next.js + NestJS monorepo) + CI/CD cơ bản. Xem prompt chi tiết Claude Web đã soạn cho việc này (đính kèm cùng lúc với file này).

---

<!-- Mẫu cho phiên tiếp theo:

## §1 — [Tên việc] (ngày)

**Đã làm:**
- ...

**Verify:**
- [ ] Chỉ typecheck/build sạch
- [ ] Đã gọi API/DB thật, kết quả hợp lý
- [ ] Đã tự tay click qua UI thật

**Còn dở/chưa làm:**
- ...

**Quyết định thiết kế phát sinh (nếu có) — đã chốt cùng người dùng:**
- ...

-->

---

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

## §8 — Fix grid không co giãn đúng theo tỉ lệ màn hình thật (10/09/2026)

**Bối cảnh:** Người dùng phản hồi sau §7: 4 file `.dc.html` mockup dùng để tham khảo phong cách thực chất là artboard **tĩnh, cố định 1 độ rộng** (đã tự grep xác nhận `width:1240px`, 0 media query trong source) — không phải trang responsive thật. Việc nhìn PNG render từ PDF (cũng chỉ 1 tỷ lệ cố định) khiến các trang card-grid (Explore/Projects/Creator/Home) bị giới hạn cứng ở `sm:grid-cols-2 lg:grid-cols-3` bên trong container `max-w-4xl/5xl` — hợp lý trên màn hình mockup nhưng để trắng rất nhiều 2 bên và không thêm cột trên màn ultra-wide 21:9/31:9 thật mà đa số người dùng dùng.

**Đã sửa (`frontend/`):**

- `components/ui/card-grid.ts` (mới) — `CARD_GRID_CLASS = 'grid gap-4 grid-cols-[repeat(auto-fill,minmax(260px,1fr))]'`: cột tự thêm theo độ rộng khả dụng (CSS `auto-fill`/`minmax`), không phụ thuộc breakpoint đoán trước — co giãn mượt từ điện thoại tới bất kỳ tỷ lệ màn nào (16:9/21:9/31:9) mà không cần đoán thêm breakpoint `xl`/`2xl`.
- Áp dụng thay `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3` cũ ở: `app/explore/page.tsx` (2 chỗ — grid thật + skeleton), `app/projects/page.tsx` (3 chỗ — grid thật + 2 skeleton), `app/creator/[id]/page.tsx` (1 chỗ), `app/page.tsx` (2 chỗ — trending + featured).
- Nới container các trang card-grid từ `max-w-5xl` → `max-w-7xl` (`explore`, `projects`, `creator/[id]`, 2 section grid ở home); `rankings` (list, không phải grid) nới nhẹ `max-w-4xl` → `max-w-5xl`; `SiteHeader`/`SiteFooter` nới theo `max-w-6xl` → `max-w-7xl` để thẳng hàng viền trái/phải với nội dung bên dưới.
- **Cố ý giữ nguyên hẹp** các trang dạng form/đọc tuyến tính (`/profile`, `/profile/sessions`, `/projects/new`, `/projects/[id]/edit`, `/projects/[id]/settings`, `/explore/[id]`, `/admin/users`) — đây là thiết kế đúng cho khả năng đọc (line-length), không phải phần bị "cố định tỷ lệ sai" cần sửa.
- Ghi lại bài học + quy ước mới vào `CLAUDE.md` mục 4.7 (thêm 2 gạch đầu dòng: cảnh báo về bản chất tĩnh của `.dc.html`, và quy ước `CARD_GRID_CLASS`).

**Verify:**

- [x] `npx tsc --noEmit`, `npx eslint .` (0 lỗi, 2 warning có sẵn không đổi), `npm run build` sạch — đủ 17 route như cũ.
- [x] Tự grep CSS đã build (`.next/static/chunks/*.css`) xác nhận rule `grid-template-columns:repeat(auto-fill,minmax(260px,1fr))` được Tailwind 4 sinh ra đúng từ class arbitrary (không bị nuốt do dấu phẩy trong `[...]`).
- [x] `npm run dev` + `curl` lại `/`, `/explore`, `/rankings` → vẫn `200`, không lỗi. Đã tắt dev server ngay sau đó (CLAUDE.md mục 9).
- [ ] **Chưa test tay UI thật ở nhiều tỷ lệ màn hình khác nhau** (Claude Code không có trình duyệt/không đổi được kích thước cửa sổ thật) — người dùng cần tự thử resize trình duyệt hoặc mở trên máy có màn ultra-wide/điện thoại thật để xác nhận card grid thêm/bớt cột mượt, không giật/vỡ layout.

**Còn dở/chưa làm:**
- Verify mức 3 (đa tỷ lệ màn hình thật) — chưa làm, cần người dùng.
- Chưa commit — thay đổi §8 đang nằm trên working tree của nhánh `feature/design-system-ui-polish` (tiếp theo commit `d6d74bc`), chờ người dùng review rồi tự commit.

---

## §9 — Chuyển card-grid sang GitHub-style row list để hết "trống trải" (10/09/2026)

**Bối cảnh:** Người dùng gửi 4 ảnh chụp màn hình thật (trình duyệt full-width ~1920px) sau §8 — tuy grid đã co giãn được nhưng vẫn nhìn "trống trải, dư thừa không gian" vì dữ liệu test chỉ có 1-2 project (seed từ §3), khiến card-grid `auto-fill` để lại rất nhiều khoảng trắng rỗng bên phải. Người dùng gợi ý học thiết kế GitHub (dự án này là "GitHub cho nhạc"). Nhận ra `/rankings` (đã là list, không phải grid) là trang duy nhất KHÔNG bị cảm giác trống trải trong 4 ảnh — xác nhận đúng hướng: GitHub tự thân dùng row-list đầy đủ chiều ngang cho repo list/Explore/trending (không phải card-grid) — 1 row luôn full-width bất kể có bao nhiêu item, khác card-grid để trống phần dư khi ít item.

**Đã làm (`frontend/`):**

- `components/ui/project-thumb.tsx` — thêm prop `size?: 'sm' | 'lg'` (`sm` = 48×48 icon vuông dùng trong row; `lg` = banner cũ 100%×96px, vẫn dùng ở `/explore/[id]` chi tiết 1 project).
- `components/ui/card-grid.ts` — thêm `CARD_LIST_CLASS = 'flex flex-col gap-3'` (danh sách dọc, mỗi item full-width) làm lựa chọn ưu tiên cho listing project; giữ `CARD_GRID_CLASS` (auto-fill) cho các trường hợp không phải danh sách project.
- `components/project-card.tsx` (dùng chung ở Explore + Creator) — viết lại từ card dọc → row ngang: thumb nhỏ trái, tên+badge+mô tả+stats ở giữa (full-width), avatar chủ sở hữu bên phải.
- `app/explore/page.tsx`, `app/creator/[id]/page.tsx` — đổi `CARD_GRID_CLASS` → `CARD_LIST_CLASS`; skeleton loading cũng đổi hình dạng theo row.
- `app/projects/page.tsx` ("Dự án của tôi") — `ProjectCard` nội bộ (khác component dùng chung, có nút Editor/Chỉnh sửa/Lưu trữ/Cài đặt) viết lại thành row: trái là tên+badge+mô tả+thời gian cập nhật, phải là cụm nút hành động (`sm:flex-row` — xếp dọc trên mobile, ngang từ `sm` trở lên). Đổi cả 3 chỗ grid (danh sách thật + 2 skeleton) sang `CARD_LIST_CLASS`.
- `app/page.tsx` (Home): 2 section "Dự án thịnh hành"/"Dự án mới" đổi từ card-grid sang row list (thumb nhỏ + tên + stats/genre, dùng lại `ProjectThumb size="sm"`). Đồng thời giảm khoảng trắng: hero `py-24→py-14` + rút gọn container/text size, stats band thêm `bg-slate-50` (tạo dải màu chia đoạn thay vì mảng trắng thuần), section trending/featured `py-12→py-10`, Features section `py-16→py-14` (giữ `bg-slate-50` cho nhịp xen kẽ), CTA `py-16→py-14`.

**Verify:**

- [x] `npx tsc --noEmit`, `npx eslint .` (0 lỗi, 2 warning có sẵn không đổi, không phát sinh mới), `npm run build` sạch — đủ 17 route.
- [x] Backend `start:dev` + frontend `dev` thật, `curl /`, `/explore`, `/rankings`, `/projects` → `200`, không lỗi; gọi thẳng `GET /explore/projects` xác nhận data thật vẫn đúng (không hỏng logic khi đổi layout).
- [ ] **Chưa test tay UI thật** — cần người dùng tự mở lại 4 trang đã chụp ảnh để xác nhận cảm giác "trống trải" đã giảm rõ rệt, đặc biệt khi có nhiều hơn 1-2 project thật (hiện DB test chỉ có seed ít dữ liệu — layout row-list sẽ càng đầy hơn khi có thêm project thật).

**Gotcha phát sinh trong lúc verify (đã thêm vào CLAUDE.md mục 10):** `pkill -f "next dev"`/`pkill -f "nest start"` qua Git Bash **không kill được** tiến trình `node.exe` thật trên máy Windows này (server vẫn `Listen` sau khi `pkill` báo thành công) — phải dùng PowerShell `Get-NetTCPConnection -LocalPort 3000,3001` lấy đúng PID rồi `Stop-Process -Id <pid> -Force`, và luôn verify lại bằng `Get-NetTCPConnection ... -State Listen` (rỗng = sạch) trước khi coi là đã tắt server theo CLAUDE.md mục 9. Phát hiện được vì trước đó có 2 tiến trình dev server cũ từ §7/§8 vẫn treo cổng 3000/3001 dù đã "tắt" theo báo cáo — đã dọn sạch.

**Còn dở/chưa làm:**
- Verify mức 3 (người dùng tự xem lại UI thật, đặc biệt với nhiều dữ liệu hơn) — chưa làm.
- Chưa commit — thay đổi §9 đang nằm trên working tree nhánh `feature/design-system-ui-polish` (tiếp theo `d6d74bc`), chờ người dùng review rồi tự commit.

---

## §10 — Nới container thật sự (max-w-page token) sau phản hồi ảnh chụp màn hình (10/09/2026)

**Bối cảnh:** Người dùng gửi lại 4 ảnh chụp UI thật (trình duyệt full-width 1920px) sau §9: xác nhận chiều dọc đã đỡ trống trải nhiều, nhưng **chiều ngang "vẫn không có gì khác biệt"**. Nguyên nhân: `max-w-7xl` (1280px, đặt ở §8) vẫn để trắng ~320px mỗi bên trên màn 1920px thật — độ nới trước đó (từ `max-w-5xl` 1024px lên `max-w-7xl`) quá nhỏ để nhận ra bằng mắt trên màn hình lớn thật.

**Đã làm (`frontend/app/globals.css`):**

- Thêm token `--container-page: 105rem` (~1680px) vào `:root` + re-export trong `@theme inline` → Tailwind 4 tự sinh utility `max-w-page` (đã tự grep CSS build ra xác nhận `max-width:var(--container-page)` và `--container-page:105rem` đúng như khai báo, không bị nuốt).
- Thay toàn bộ `max-w-7xl` (12 chỗ: `SiteHeader`, `SiteFooter`, `explore/page.tsx`, `projects/page.tsx` ×2, `creator/[id]/page.tsx` ×3, `page.tsx` (home) ×3) → `max-w-page`. Đồng thời nới luôn `rankings/page.tsx` từ `max-w-5xl` (896px, còn sót lại từ §7) → `max-w-page` cho nhất quán vì đây cùng họ trang list kiểu GitHub.
- **Vẫn giữ nguyên hẹp** các trang form/đọc tuyến tính (auth, `/profile`, `/projects/new`, `/projects/[id]/edit`, `/projects/[id]/settings`, `/explore/[id]`, `/admin/users`, và phần hero/text-centric của Home) — dùng 1 token riêng cho "trang nội dung rộng" thay vì đổi hàng loạt tránh làm hẹp nhầm các khu vực cố ý hẹp để dễ đọc.

**Verify:**

- [x] `npx tsc --noEmit`, `npx eslint .` (0 lỗi, 2 warning có sẵn không đổi), `npm run build` sạch — đủ 17 route.
- [x] Grep CSS build (`.next/static/chunks/*.css`) xác nhận cả `.max-w-page{max-width:var(--container-page)}` và `--container-page:105rem` đều sinh đúng.
- [x] `start:dev` + `dev` thật, `curl /`, `/explore`, `/rankings`, `/projects` → `200`, không lỗi. Tắt dev server đúng cách bằng PowerShell `Get-NetTCPConnection`+`Stop-Process` theo gotcha mới ghi ở CLAUDE.md mục 10 (không dùng `pkill` qua Git Bash — đã verify không còn tiến trình nào `Listen` ở cổng 3000/3001 sau khi tắt).
- [ ] **Chưa test tay UI thật ở màn 1920px+/ultra-wide thật** — cần người dùng tự xem lại đúng 4 trang đã chụp ảnh để xác nhận lần này thấy khác biệt rõ ràng theo chiều ngang.

**Còn dở/chưa làm:**
- Verify mức 3 — chưa làm, cần người dùng tự xem lại.
- Chưa commit — thay đổi §10 đang nằm trên working tree nhánh `feature/design-system-ui-polish` (tiếp theo `d6d74bc`), chờ người dùng review rồi tự commit.

---

## §11 — Dừng phiên polish UI: xác nhận phần "thiếu nội dung" là do backend chưa làm, không tự build thêm (10/09/2026)

**Bối cảnh:** Người dùng so sánh mockup `docs/STAVE design component sample/STAVE design component nhóm 1.pdf` (trang chủ khách/Explore/trang chi tiết project) với web thật, thấy web "ít nội dung để lấp đầy màn hình" hơn hẳn mockup, hỏi có phải do chưa làm tới.

**Đã điều tra (không đoán, tự kiểm tra thật):**
- Grep `backend/src/` — chỉ có 8 module: `admin`, `auth`, `common`, `drafts`, `explore`, `projects`, `supabase`, `users`. Không có module comment/star/collaborator/follow/version-control nào.
- Gọi `mcp Supabase list_tables` xác nhận **DB thật đã có sẵn bảng `comments`, `project_collaborators`, `project_stars`, `commits`, `branches`, `pull_requests`** (RLS đã bật, đúng theo §F) nhưng **toàn bộ đều 0 rows và không có 1 dòng backend code nào đọc/ghi các bảng này** — schema đã được thiết kế sẵn từ đầu (Nhóm F) nhưng chưa có ai wire API+business logic.

**Kết luận đã báo lại người dùng:** phần "trang chi tiết project" (`/explore/[id]`) trong mockup nhóm 1 có Comments, Star, Collaborators, Version history sidebar, Notes preview (piano-roll đọc từ draft), phát nhạc thật, download `.mid` — **tất cả đều chưa build** (không phải quyết định thiết kế, mà là tính năng thật sự chưa tồn tại, đúng ranh giới đã chốt từ đầu ở mục 6 prompt gốc: "không thêm bảng/tính năng backend mới"). Tương tự: "Recommended for you" ở Explore (không có logic gợi ý), filter theo nhạc cụ (CLAUDE.md mục 5 — chưa chốt cơ chế), Follow/followers/activity feed ở Creator (không có bảng `follows`/activity log).

**Quyết định (người dùng chốt):** **Dừng phiên polish UI tại đây** — không tự xây UI cho các tính năng chưa có backend thật (Comments/Star/Collaborators/Version-history/Notes-preview/playback thật) vì sẽ vi phạm ranh giới đã giới hạn từ đầu (cần module backend mới hoàn toàn: endpoint, DTO, RLS-aware query, business logic — không phải chỉ đổi lớp trình bày). Không có thay đổi code nào trong §11 — chỉ dừng đúng lúc và ghi lại phát hiện.

**Trạng thái cuối phiên polish UI (§0→§11):** Toàn bộ trang đã code+verify theo §1→§6 đã được áp design system + polish UI/UX (xem §7→§10). Còn lại 2 việc treo, không phải do quên mà do đã dừng đúng phạm vi:
1. Verify mức 3 (click tay UI thật qua trình duyệt) cho tất cả các thay đổi §7→§10 — Claude Code không có trình duyệt, cần người dùng tự làm.
2. Comments/Star/Collaborators/Version-history UI/Notes-preview/playback thật — **không thuộc phạm vi phiên này**, cần 1 phiên riêng có phê duyệt rõ ràng để build backend trước (bắt đầu từ Star vì đơn giản nhất — không phụ thuộc module khác — rồi tới Comments; Version-history/Notes-preview phụ thuộc toàn bộ module Version Control/MIDI Editor chưa ai làm).

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

## §26 — Thiết kế lại UI: port hệ token semantic + khung app + bộ component dùng chung (16/09/2026)

**Bối cảnh:** người dùng đánh giá UI cũ "xấu, màu mè với 1 web về âm nhạc", yêu cầu thiết kế lại gần như từ đầu (bao gồm cả MIDI Editor; ý tưởng nền tối tạm gác). Đã dựng bản thiết kế mới bằng **Lovable** qua nhiều vòng hỏi-đáp, chốt: cấu trúc **Top Bar + Panels** (không sidebar cố định), font giữ nguyên Inter + JetBrains Mono (mono chỉ cho giá trị kỹ thuật, không cho tiêu đề), bảng màu lấy ý tưởng từ **bảng pha màu Gundam PG Unleashed RX-78-2** (mỗi màu gốc rực đều có bản "muted/shadow" pha thêm đen/tím-xám/nâu đỏ dùng cho diện tích lớn; màu thuần chỉ dùng "small dose"). Code thật của bản Lovable: repo `KhanhNVK13/midi-branch-studio` (1 file `src/routes/index.tsx` + `src/styles.css`), đã clone về scratchpad để port chính xác, **không** đoán từ ảnh chụp.

**Sửa IA đã phát hiện & áp dụng:** `History` và `Compare` từng là tab toàn cục trong bản Lovable — sai, vì cả 2 luôn cần 1 project cụ thể (đúng GitHub: không có tab commits/compare ở cấp global). Đã bỏ khỏi nav toàn cục; chúng thuộc về trang project + thanh công cụ MIDI Editor.

**Bước 1 — hệ token (`frontend/app/globals.css` viết lại):** bỏ bảng hex phẳng kiểu `accent-600:#2563eb`, thay bằng **token semantic theo vai trò** (oklch, port nguyên giá trị từ Lovable): `background/surface/surface-subtle/surface-muted`, `foreground/muted-foreground`, `border/border-strong`, `accent/accent-hover/accent-muted/accent-foreground`, `success|warning|danger` + bản `-muted`, `metal/metal-muted`, `track-*`. Bắt buộc phải semantic vì UC-79 (STAVE+) cho phép sinh theme từ ảnh upload — chỉ đổi giá trị biến, không sửa component. Thêm 2 preset miễn phí `[data-theme="moss"]`, `[data-theme="claret"]` (đổi theme bằng `data-theme` trên `<html>`). `--radius-card` 1rem → 0.5rem; `--shadow-card` → `none` (thiết kế dùng viền 1px thay vì đổ bóng). Giữ tạm alias `accent-600`… trong `@theme inline` để trang chưa chuyển không vỡ — **nhưng toàn bộ trang đã chuyển xong trong phiên này, alias giờ không còn chỗ dùng, có thể xoá.**

**Bước 2 — khung app + component dùng chung:** `site-header.tsx` (top bar 56px sticky, nav pill `bg-accent-muted text-accent`, nút "Dự án mới", dropdown avatar, hamburger mobile — nav còn Khám phá/Bảng xếp hạng/Dự án của tôi, logo → trang chủ), `site-footer.tsx`, `ui/logo.tsx` (brand mark 3 thanh thay icon `AudioLines`), `ui/button.tsx` (h-32px, text 12px, viền 1px — 4 variant), `ui/badge.tsx` (pill 10px, thêm variant `metal`, bỏ uppercase), `ui/card.tsx`, `ui/page-header.tsx` (breadcrumb trình bày kiểu "eyebrow" chữ hoa nhỏ màu accent, phân cách "/"), `ui/empty-state.tsx`, `ui/form.tsx`, `ui/tabs.tsx`, `ui/toast.tsx`, `ui/confirm-dialog.tsx`, `ui/project-thumb.tsx`, `lib/avatar-color.ts` (palette avatar đổi từ bảng Tailwind cố định sang token, để avatar cũng đổi theo theme). Thêm `ui/mini-roll.tsx` — hình piano roll **thuần trang trí** cho trang auth; comment trong file ghi rõ KHÔNG dùng để "xem trước" project thật (bịa nốt = bịa dữ liệu). `auth-card.tsx` dựng lại thành layout 2 cột (cột trái brand + MiniRoll, ẩn dưới `lg`).

**Bước 3 — quét sạch màu ngoài hệ token:** thay toàn bộ `slate-*`, `bg-white`, `text-white`, và các lớp đánh số cũ (`accent-600`, `danger-50`, `success-700`…) trong 18 file `app/**` + `components/**` sang tên semantic. Còn 0 chỗ dùng `slate-` ngoài `components/midi-editor/*` (đang dùng `zinc-*` cho canvas nền tối — chưa đụng, thuộc bước sau). Huy chương rank 1/2/3 ở `/rankings` đổi từ amber/slate cố định sang `metal`/`border-strong`/`warning`.

**Verify đã làm:** `tsc --noEmit` sạch; eslint 0 error (6 warning cũ); dev server thật — `/`, `/explore`, `/rankings`, `/login`, `/register`, `/projects`, `/profile`, `/projects/new` đều 200, log dev không có lỗi; đọc CSS build ra để xác nhận Tailwind sinh đủ utility mới (`bg-surface`, `text-muted`, `border-border`, `bg-accent-muted`…), token `--accent` biên dịch thành `#374dc6` (xanh trầm) thay vì `#2563eb` cũ, và 2 preset `data-theme` có mặt. **Chưa xem bằng mắt trên trình duyệt** (máy không có Playwright, không tự cài thêm dependency) — cần người dùng tự chạy `npm run dev` và xem.

**Chưa làm (bước tiếp theo):** bố cục thật của từng trang vẫn là bố cục cũ, mới chỉ đổi hệ màu/typography/component — chưa dựng lại theo mẫu Lovable (row-list kiểu bảng có cột Project/Branch/Last commit/Δ/Status, trang project có tab Overview/Commits/Branches/Pull requests, Personalization + upload ảnh sinh theme, và **toàn bộ MIDI Editor**). Alias token cũ trong `globals.css` chờ xoá. Chưa có UI chuyển theme (token đã sẵn sàng, thiếu màn Personalization).

**Chưa commit/push.**

---

## §27 — Danh sách việc còn lại của đợt thiết kế lại UI (A/B/C/D) + thứ tự thực hiện đã chốt (16/09/2026)

**Thứ tự người dùng chốt: làm A trước (ưu tiên chất lượng cao vì A là nền cho phần còn lại) → sau đó C (tính năng) → cuối cùng B và D (khối lượng lớn).**

**A — Dựng lại bố cục từng trang** (hiện mới đổi màu/typography/component, layout vẫn của bản cũ):
1. Trang danh sách `/explore`, `/projects`, `/rankings`, `/creator/[id]` → bảng row-list có hàng tiêu đề cột (PROJECT / GENRE / STARS / UPDATED; `/projects` thêm STATE + visibility), toolbar tìm kiếm + select, mỗi hàng: avatar + tên + `tên_file.mid` mono.
2. Trang chủ `/` → bỏ hero gradient tối kiểu marketing; thay bằng eyebrow + tiêu đề + khối "Featured project" 2 cột + danh sách Trending dạng row-list.
3. `/explore/[id]` → head Fork/Star/Play + tab Overview/Commits/Branches/Pull requests + khối preview file + lưới About/Latest commit.
4. `/profile` (+ `/profile/sessions`) → layout settings 2 cột (nav trái Profile/Security/Personalization + panel phải), thay 2 tab hiện tại.
5. 5 trang auth → khung 2 cột đã xong ở §26; còn truyền `eyebrow`/`description` và chỉnh nội dung từng trang.
6. `/projects/new`, `/projects/[id]/settings`, `/admin/users` → chỉnh mật độ (input 37px, nút 32px), bảng admin theo kiểu table mới. `components/project-card.tsx` nhiều khả năng bỏ hẳn khi chuyển sang row-list.

**B — MIDI Editor (khối lớn nhất: 9 file, ~4.400 dòng):** `redesign/tokens.ts` đang là bảng màu **hex cố định** riêng (lấy từ mockup `.dc.html` cũ, 208 chỗ dùng) + ~30 mã hex rải rác trong `piano-roll.tsx`/`midi-editor.tsx` → phải thay hết bằng biến CSS semantic, **nếu không editor sẽ không đổi theo theme, tức hỏng đúng tính năng bán tiền (UC-79)**. Kèm dựng lại bố cục 3 cột (track panel 220px / piano area / version activity 280px), transport bar, velocity lane, project bar có branch selector. **CLAUDE.md 4.7 vẫn ghi ngoại lệ "canvas MIDI Editor dùng nền tối" — ĐÃ LỖI THỜI**, editor thật hiện là nền sáng (`DC.pageBg = #F7F7F5`); sửa CLAUDE.md khi làm B.

**C — Là TÍNH NĂNG mới, không phải việc UI (người dùng dự kiến làm sau A):**
- Personalization: UC-78 preset theme (Free) + UC-79 sinh theme từ ảnh (STAVE+). Token đã sẵn sàng; còn thiếu UI, chỗ lưu lựa chọn (localStorage hay DB), thuật toán trích palette, phân biệt Free/STAVE+.
- Tab Commits / Branches / Pull requests trên trang project: version control hiện chỉ nằm trong editor, chưa có trang độc lập; Pull request chưa build (UC-87..92).
- Global search ⌘K trong mockup: chưa có chức năng tìm kiếm → cố tình chưa thêm vào header.

**Quyết định kiến trúc trang project (người dùng chốt, dùng khi làm C):** **một trang overview duy nhất dùng chung cho mọi người xem** — chủ dự án và người ngoài thấy cùng một trang; khác nhau chỉ ở **hành động khả dụng**: chủ dự án có thêm mở Editor + các thao tác version control theo đúng quyền (BR-26), người ngoài dừng ở mức quyền của thiết kế ban đầu (fork/star/play/xem). Đây đúng mô hình GitHub: một trang repo chung, các nút ghi (Settings/push/merge/Delete) bị ẩn hoặc khoá theo quyền. **Không làm 2 trang riêng cho 2 nhóm người dùng.**

**Quy trình bắt buộc khi làm tính năng mới (người dùng yêu cầu):** trước khi code phải đối chiếu `docs/Report3_Software Requirement Specification.docx` (đang làm UC nào, flow/BR nào) và **Report 2 — Project Schedule** trong `docs/` để biết chức năng đó thuộc sprint nào. **Hiện đang ở Sprint 4** — nếu phải làm chức năng thuộc sprint khác thì ghi chú lại rõ ràng (kéo sớm/kéo trễ), không âm thầm làm lệch kế hoạch.

**D — Dọn dẹp & xác nhận:** xoá alias token cũ (`accent-600`, `danger-50`…) trong `globals.css` (đã không còn chỗ dùng); cập nhật CLAUDE.md 4.7 cho khớp hệ token mới; xem bằng mắt + kiểm tra responsive từ mobile tới ultra-wide (chưa làm được — máy không có Playwright).

---

## §28 — Hoàn thành mục A: dựng lại bố cục toàn bộ trang theo thiết kế mới (16/09/2026)

**Component mới dùng chung:** `frontend/components/ui/row-list.tsx` — `RowList` / `RowHeader` / `RowItem` / `RowTitle` / `RowStat` / `RowTime`. Hàng tiêu đề và hàng dữ liệu **bắt buộc dùng chung một chuỗi grid-template** truyền qua prop `cols` (mỗi trang khai 1 hằng `COLS`) — đây là lý do cột thẳng hàng; đừng canh cột bằng padding tay như bản mockup gốc. Dưới `md` grid tự xếp chồng 1 cột. `RowTitle` cố tình chỉ có **một** phần tử tương tác (tên dự án là link, dòng phụ là text) để không lồng link/button vào nhau — lỗi từng phải sửa ở `project-card.tsx` cũ.

**A1 — 4 trang danh sách chuyển sang row-list:** `/explore` (Dự án | Thể loại | Lượt nghe | Fork | Cập nhật, toolbar = ô tìm + 2 select thay cho pill emoji), `/projects` (thêm cột Trạng thái + Hiển thị + cụm thao tác; **bỏ nút "Chỉnh sửa"/"Xem" trùng URL với "Mở Editor"** — đúng lỗi dư thừa đã ghi ở §25; dialog lưu trữ chuyển sang `ConfirmDialog` dùng chung), `/rankings` (cột hạng + huy chương token), `/creator/[id]` (header hồ sơ gọn + 2 ô số liệu + row-list).

**A2 — Trang chủ `/`:** bỏ hero gradient tối kiểu marketing. Thay bằng eyebrow "Không gian cộng đồng" + tiêu đề + khối **Dự án nổi bật** 2 cột + dải 3 số liệu + row-list "Thịnh hành tuần này" (có cột hạng 01/02…) + row-list "Dự án mới". Khối giới thiệu "Vì sao dùng STAVE?" và CTA đăng ký **chỉ hiện với khách chưa đăng nhập** — người đã đăng nhập không phải đọc lại quảng cáo mỗi lần vào trang chủ.

**A3 — `/explore/[id]` thành trang tổng quan dự án:** đầu trang = eyebrow `{tác giả} / Dự án công khai` + tên + mô tả, bên phải là cụm hành động **theo quyền**: ai cũng thấy Fork (PLACEHOLDER) và Nghe thử (PLACEHOLDER), **riêng chủ dự án** có thêm "Mở trình soạn nhạc" (`user.id === project.owner.id`) — đúng mô hình GitHub đã chốt ở §27. Thân trang: thanh tab (Tổng quan thật; Commit/Nhánh/Pull request để disabled kèm chữ PLACEHOLDER vì thuộc mục C), khối xem trước file, mục "Về dự án này" + tag, cột phải là thẻ tác giả + 2 ô số liệu + lời mời đăng nhập cho khách.

**A4 — `/profile`:** đổi từ 2 tab sang layout settings 2 cột (nav trái Hồ sơ / Bảo mật / Cá nhân hoá-PLACEHOLDER + panel phải). Tab Bảo mật dựng theo mẫu `SettingRow` (mô tả trái – hành động phải) cho: đổi mật khẩu (form bung ra khi bấm), thiết bị đang đăng nhập, xoá tài khoản.

**A5 — 4 trang auth:** dùng khung 2 cột `AuthCard` đã dựng ở §26, bổ sung `eyebrow` + `description` riêng cho từng trang (đăng nhập / đăng ký / quên mật khẩu / đặt lại mật khẩu).

**A6 — trang phụ:** `/admin/users` bỏ `<table>` chuyển sang row-list (nút thao tác đổi từ link chữ sang `Button`, nhãn tiếng Việt), `/profile/sessions` + `/projects/new` + `/projects/[id]/settings` chỉnh mật độ (input 37px, ô lọc 34px, container `px-5 py-8`).

**Đã xoá:** `components/project-card.tsx` (không còn nơi dùng — trong đó có đoạn **vẽ waveform giả suy từ hash id**, vi phạm đúng quy ước "không bịa dữ liệu" ở CLAUDE.md 4.7) và `components/ui/card-grid.ts` (`CARD_LIST_CLASS`/`CARD_GRID_CLASS` không còn ai dùng sau khi chuyển row-list).

**Verify:** `tsc --noEmit` sạch; eslint 0 error (6 warning cũ); dev server thật — 11 route (`/`, `/explore`, `/rankings`, `/projects`, `/profile`, `/profile/sessions`, `/projects/new`, `/login`, `/register`, `/forgot-password`, `/admin/users`) đều 200, log dev không có lỗi; **đọc CSS build ra để xác nhận Tailwind sinh đủ mọi `grid-template-columns` của row-list** (điểm dễ hỏng nhất vì là class động — đã xác nhận đủ 6 biến thể). **Chưa xem bằng mắt** (máy không có Playwright) — cần người dùng chạy `cd frontend && npm run dev` rồi xem/chụp lại.

**Lưu ý khi làm mục C:** các chỗ đã cắm sẵn PLACEHOLDER chờ tính năng thật: tab Commit/Nhánh/Pull request ở `/explore/[id]`, mục "Cá nhân hoá" ở `/profile`, nút Fork và Nghe thử. Xoá chữ PLACEHOLDER khi tính năng tương ứng xong.

**Chưa commit/push.**

---

## §29 — Mục C (đợt 1): trang tổng quan dự án + tab Commit + tab Nhánh/Merge + UC-78 preset theme (16/09/2026)

**Đối chiếu lịch trước khi code (theo yêu cầu người dùng).** Report 2 dùng mốc sprint: **Sprint 4 = Iteration 1 (31/08 – 20/09)** gồm *Auth & Account, Project Management, Version Control (start: commit, history, tag), MIDI Editor (start)*; **Sprint 5 = Iteration 2 (21/09 – 11/10)** gồm *Branch Management (incl. merge conflict resolution), Audio Sketch & Custom Sound, Collaboration, Pull Requests*; **Sprint 6 = Iteration 3 (12/10 – 01/11)** gồm *Community & Discovery, AI Assistance, Subscription & Payment, Notifications, Admin*. Đối chiếu với việc đã làm trong phiên này:

| Việc | UC | Sprint theo Report 2 | Ghi chú |
|---|---|---|---|
| Lịch sử commit cấp project + gắn tag + khôi phục | UC-43, UC-44, UC-46 | **Sprint 4 — đúng hạn** | — |
| Tạo/xoá nhánh, xem độ lệch, hợp nhất + giải quyết xung đột | UC-47, UC-49, UC-51, UC-52, UC-86 | **Sprint 5 — KÉO SỚM ~5 ngày** | Backend đã có sẵn từ trước, phiên này chỉ làm frontend + wrapper API |
| Chọn preset theme | UC-78 | **Sprint 4** (thuộc Account Settings) | — |
| Sinh theme từ ảnh | UC-79 | **Sprint 6** (phụ thuộc Subscription & Payment) | CHƯA làm — để PLACEHOLDER |
| Pull request | UC-87…92 | **Sprint 5** | CHƯA làm |

**1. Gộp trang tổng quan dự án về `/projects/[id]` (mới).** Trước đây `/explore/[id]` chỉ phục vụ dự án công khai còn chủ dự án không có trang tổng quan nào. Nay **một route duy nhất** cho mọi người xem (đúng quyết định §27): thử `GET /explore/projects/:id` (công khai, chạy cho cả khách) trước, thất bại thì thử `GET /projects/:id` (là `getOwned()` — gọi được nghĩa là đúng chủ, nên cũng mở được dự án riêng tư). `/explore/[id]` chuyển thành redirect 307 để link đã chia sẻ không chết; mọi link ở Home/Explore/Rankings/Creator đã trỏ sang route mới. Tab chọn qua query `?tab=` để chia sẻ/refresh được.

**2. Tab Commit (`components/project/commit-history.tsx`).** Danh sách commit của **nhánh mặc định** dạng row-list: message + tag + đánh dấu "Mới nhất", tác giả, mã 7 ký tự mono, thời điểm, nút *Gắn tag* (UC-44, form inline) và *Khôi phục* (UC-46, `ConfirmDialog` nói rõ "lịch sử không bị xoá, hệ thống tạo commit mới"), phân trang 20/lần. **Chỉ chủ dự án thấy tab này** — không phải lựa chọn giao diện mà do backend: `CommitsService` ném `ForbiddenException` nếu `project.owner_id !== userId`, và SRS cũng vậy (UC-43 actor là User; UC-09 cho Guest chỉ có playback/mô tả/thống kê). **Khác GitHub** ở điểm này (GitHub cho xem commit của repo public) — nếu muốn đổi thì phải sửa SRS + thêm endpoint công khai, không phải sửa UI.

**3. Tab Nhánh (`components/project/branch-list.tsx` + `merge-conflict-dialog.tsx`).** Danh sách nhánh + badge mặc định/đã hợp nhất + độ lệch `+ahead -behind` (gọi `GET /branches/:id` song song bằng `Promise.allSettled`), tạo nhánh (UC-47), xoá nhánh có xem trước số commit sẽ mất (UC-52, dùng `delete-preview`), hợp nhất vào nhánh mặc định (UC-51) và **màn giải quyết xung đột note-level gom theo ô nhịp** (UC-86) — mặc định chọn "giữ bên ta" cho mọi nốt để bấm nhầm không làm mất thay đổi của nhánh đích.
- **Sửa hạ tầng cần thiết:** `ApiError` nay giữ nguyên `body` của response lỗi. Bắt buộc vì `POST /branches/merge` khi có xung đột **không trả 200 mà ném 409 với toàn bộ dữ liệu xung đột nằm trong body** — trước đó body bị vứt đi nên không thể dựng màn resolve. `mergeBranches()` tự bóc body 409 thành giá trị trả về bình thường (`hasConflicts: true`) để nơi gọi không phải bắt lỗi mới đọc được dữ liệu nghiệp vụ.
- **CỐ Ý chưa làm UC-48 (chuyển nhánh đang mở):** `SwitchBranchDto` bắt buộc gửi kèm snapshot bản nháp hiện hành, tức thao tác đó thuộc MIDI Editor chứ không phải trang project — để lại cho mục B.

**4. UC-78 — preset theme (có backend thật).** DB đã có sẵn từ thiết kế ban đầu: bảng `themes` (`type` enum `preset|custom`, `preset_key`, `generated_palette` jsonb) + `users.active_theme_id`; đã tra `information_schema` và `has_table_privilege` (service_role có đủ SELECT/INSERT/UPDATE — không dính lỗi thiếu GRANT như gotcha CLAUDE.md mục 10).
- Backend: `GET /users/me/theme` + `PUT /users/me/theme` trong module `users` (`SetThemeDto` chốt danh sách preset hợp lệ). Mỗi người dùng chỉ giữ **đúng 1 dòng `themes` kiểu preset** và cập nhật lại dòng đó — nếu insert mới mỗi lần bấm thì bảng phình vô hạn (bảng không có unique constraint để dựa vào).
- Frontend: `context/theme-context.tsx` (`ThemeProvider` bọc trong `AuthProvider` ở layout) đặt `data-theme` lên thẻ `<html>`; `components/settings/theme-picker.tsx` là tab "Cá nhân hoá" thật ở `/profile`. Bám đúng luồng SRS: xem trước ngay khi bấm nhưng **chưa lưu** (bước 4 + luồng 4.1), nút *Huỷ thay đổi* trả về bản đã lưu (luồng 5.1), lưu hỏng thì báo lỗi **và** trả giao diện về theme cũ (ngoại lệ 6.E1). Lưu theo tài khoản chứ không localStorage vì POST-3 yêu cầu bền qua mọi thiết bị/phiên.

**⚠️ Phát hiện xung đột thiết kế vs SRS — ĐÃ SỬA CODE THEO SRS, cần người dùng xác nhận:** bản thiết kế Lovable có 3 preset đổi luôn màu accent (Unleashed xanh dương / Moss Circuit xanh lá / Claret Studio đỏ). Nhưng **BR-90** (Report 3) ghi rõ: *"A theme may change decorative colours only. The colours that carry system meaning — the primary blue for actions, red for warnings and conflicts, and yellow for modified content — are never overridden"*, và UC-79 POST-4 nhắc lại điều tương tự. Vì vậy 2 preset `moss`/`claret` trong `globals.css` đã được sửa để **chỉ retint nhóm nền/bề mặt/viền/chữ + metal**, không còn đụng `--accent*`, `--success*`, `--warning*`, `--danger*`. Hệ quả nhìn thấy được: 3 ô xem trước theme chỉ khác nhau ở tông nền, thanh accent giống hệt nhau — **đúng thiết kế theo SRS, không phải lỗi**. Nếu muốn preset đổi cả accent như bản Lovable thì phải **sửa BR-90 trong Report 3 trước**, không sửa ngầm ở code.

**Verify:** `tsc --noEmit` sạch cả frontend lẫn backend; eslint 0 error (6 warning cũ); chạy full stack thật — backend map đúng 2 route `/users/me/theme` (GET/PUT) và cả hai trả 401 khi chưa đăng nhập; frontend `/`, `/explore`, `/profile`, `/projects/:id`, `?tab=commits`, `?tab=branches` đều 200, `/explore/:id` trả 307 redirect; đã đối chiếu hình dạng dữ liệu thật của `GET /explore/projects/:id` khớp với view-model của trang. **CHƯA kiểm thử với tài khoản đăng nhập thật** (không có credential trong phiên) — tức luồng commit/tag/khôi phục/tạo nhánh/merge/lưu theme **chưa chạy thật lần nào**, cần người dùng tự đăng nhập kiểm tra.

**Chưa commit/push.**

---

## §30 — Mục B (phần token): MIDI Editor đổi màu theo theme (16/09/2026)

**Vì sao làm ngay sau UC-78:** editor đang giữ bảng màu hex riêng nên người dùng đổi theme xong mở trình soạn nhạc vẫn thấy màu cũ — tính năng vừa ship hỏng ở đúng màn hình quan trọng nhất (và là màn sẽ bán tiền với UC-79). Phần **bố cục** 3 cột của mục B thì CHƯA làm, cố ý để sau UC-53/54/55 vì nặng và dễ vỡ.

**Phát hiện quan trọng khi khảo sát: piano roll vẽ bằng `<canvas>`.** `ctx.fillStyle = "var(--surface)"` KHÔNG chạy — canvas không có ngữ cảnh phần tử để resolve biến CSS, và khi gán giá trị không hợp lệ thì **canvas im lặng giữ nguyên màu trước đó** (không ném lỗi). Đây là lý do trước đây file này hardcode hex. Cách xử lý: thêm `frontend/lib/resolve-css-colors.ts` — gắn 1 div ẩn vào DOM, đặt `background-color` bằng biểu thức cần resolve rồi đọc `getComputedStyle`; giá trị trả về là màu đã tính xong do chính engine trình duyệt sinh ra nên canvas chắc chắn parse được (không phải tự viết parser oklch).

**Đã sửa:**
- `redesign/tokens.ts`: toàn bộ `DC.*` từ hex cố định → biểu thức token (`var(--…)`, `color-mix(...)`). 208 chỗ dùng ở 6 file redesign tự động theo, không phải sửa từng chỗ. `DC.mono` → `var(--font-stave-mono)`.
- `piano-roll.tsx`: tách `PAL` cũ thành `PAL_METRICS` (kích thước, không liên quan theme) + `PAL_COLOR_SPEC` (biểu thức CSS). Màu resolve lúc chạy, và **theo dõi `data-theme` trên `<html>` bằng MutationObserver** để vẽ lại khi đổi theme — cố ý không dùng context theme vì piano roll là component lá, không nên phụ thuộc provider (và cách này bắt được cả lần đổi theme từ nơi khác). `pal` thành `useMemo` nên effect vẽ sẵn có tự repaint.
- `export-dialog.tsx`: file này **vẫn còn nguyên theme tối cũ** (zinc `#18181b`/`#27272a` + emerald `#059669`) trong khi phần còn lại của editor đã sáng — đã ánh xạ hết 30 mã hex + 8 chuỗi `rgba()` sang token theo đúng vai trò từng màu.
- `midi-editor.tsx` (spinner), `redesign/editor-redesign.tsx` (màu icon khi nút vô hiệu), `redesign/track-panel.tsx` (viền input): tokenize nốt.

**CỐ Ý giữ nguyên hex — không phải sót:** `TRACK_COLORS` / `TRACK_COLOR_PALETTE` (midi-editor.tsx, track-panel.tsx) và màu fallback `#6366f1` khi vẽ note trong piano-roll. Đây là **dữ liệu nghiệp vụ** (UC-34, người dùng chọn màu track, lưu trong snapshot) chứ không phải màu giao diện — đổi theme không được làm đổi màu track người dùng đã đặt. Đã ghi comment ngay tại chỗ để lần sau không ai "dọn nhầm".

**Verify:** `tsc --noEmit` sạch; eslint 0 error (5 warning cũ); **`next build` production chạy xong, 19 route compile được** (gồm `/projects/[id]` mới); grep xác nhận không còn hex/rgba nào trong editor ngoài bảng màu track, và không có chuỗi `var(...)` nào chảy vào API canvas (chỉ `piano-roll.tsx` dùng canvas, và nó đi qua `resolveCssColors`). **CHƯA xem bằng mắt** — trang editor nằm sau `RequireAuth` nên không mở được nếu không đăng nhập; cần người dùng mở editor, đổi theme ở `/profile` → tab Cá nhân hoá và xác nhận piano roll đổi màu theo.

**Chưa commit/push.**

---

## §31 — Audit DB trước khi làm UC-53/54/55 + 2 migration chuẩn bị (16/09/2026)

**Bối cảnh:** người dùng chốt "đi theo thiết kế gốc" cho Audio Sketch (signed URL thẳng lên Supabase Storage, không proxy qua backend — Bible mục 30 dòng 876), và yêu cầu kiểm tra xem đồng nghiệp làm dở có lỡ sửa DB không.

**Kết quả audit — project Supabase chung KHÔNG hề bị đụng vào:**
- Migration mới nhất là `20260911134404` (11/09), tức trước thời điểm họ gặp lỗi RLS (14-16/09). Không có migration lạ.
- `storage.buckets` **rỗng hoàn toàn** — chưa từng có bucket `audio-sketches` ở đây.
- `pg_policies` schema `storage` **rỗng** — mấy đoạn SQL mở `anon + true` mà AI kia gợi ý **chưa từng chạy trên project này**.
- Vẫn đúng **29 bảng**, RLS bật 29/29; `audio_sketches`, `custom_sounds`, `storage.objects` đều 0 dòng.
→ Kết luận: họ làm trên một Supabase project khác (của riêng họ). Không cần dọn dẹp gì.

**Phát hiện quan trọng: phần RLS từng bị nghi thiếu ở §25 thì thiết kế gốc đã có sẵn.** Bảng `audio_sketches` có đủ 3 policy, dựa trên các hàm helper đã tồn tại trong DB: `INSERT` = `can_edit_project(project_id) AND created_by = auth.uid()` (BR-26), `SELECT` = `can_view_project(project_id)` (chủ + collaborator + project công khai — đúng UC-55 POST-2), `DELETE` = người tạo / chủ dự án / admin (sẵn cho UC-117). Các hàm `can_view_project()` / `can_edit_project()` / `project_is_owned_by_me()` / `is_admin()` dùng lại được nguyên vẹn cho policy của bucket → không phải tự nghĩ cơ chế phân quyền mới.

**Migration 1 — `add_audio_sketch_trim_points`.** Bảng `audio_sketches` thiết kế ban đầu KHÔNG có chỗ lưu điểm cắt, trong khi SRS đòi: UC-55 POST-1 *"stored against the project with its name **and trim points**"* và UC-54 POST-2 *"The full recording is retained, so the trim can be adjusted or removed later"*. Nếu giữ nguyên schema thì chỉ còn cách cắt huỷ hoại file trước khi upload — vi phạm thẳng POST-2. Đã thêm `trim_start_sec numeric not null default 0` + `trim_end_sec numeric null` (NULL = phát tới hết) kèm check constraint (`trim_start_sec >= 0`, `trim_end_sec > trim_start_sec`, `trim_end_sec <= duration_sec`).

**Migration 2 — `create_audio_sketches_bucket_and_policies`.**
- Bucket `audio-sketches`: **private** (`public = false`), `file_size_limit = 10485760` (10MB, BR-56), `allowed_mime_types = audio/wav, audio/x-wav, audio/wave`.
- **Quy ước đường dẫn: `{project_id}/{sketch_id}.wav`** — phân quyền theo PROJECT chứ không theo người upload, vì collaborator cũng phải nghe được sketch (UC-55 POST-2). Đây là lý do KHÔNG dùng path `{user_id}/…` như gợi ý của AI ngoài ở §25.
- Hàm `public.storage_sketch_project_id(text)`: bóc project id từ path, có regex chặn — đoạn đầu không phải UUID thì trả NULL, và mọi hàm quyền đều false với NULL nên policy tự động từ chối (không ném lỗi cast). Cố ý để `immutable`, **không** SECURITY DEFINER, và đã `revoke execute … from anon` → advisor không phát sinh cảnh báo mới.
- 3 policy trên `storage.objects`, đều giới hạn `to authenticated`: INSERT cần `can_edit_project(...)`, SELECT cần `can_view_project(...)`, DELETE cho người upload / chủ dự án / admin.

**Chốt thêm 1 điểm kiến trúc (không hỏi lại vì SRS đã đủ rõ): convert WAV làm ở TRÌNH DUYỆT.** Bible mục 30 từng ghi "Server convert", nhưng điều đó mâu thuẫn với chính quyết định "file không đi qua Railway". BR-56 trong Report 3 chỉ nói *"The browser-captured recording is converted to WAV before storage"* — không nói ai convert. Vì file upload thẳng từ trình duyệt lên Storage nên bản ghi MediaRecorder (webm/opus) phải được decode bằng Web Audio rồi encode WAV ngay ở client; bucket vì thế chỉ nhận mime WAV. Không cần ffmpeg, không cần thêm xử lý ở backend.

**Verify:** đã đọc lại DB sau khi chạy — bucket đúng cấu hình; 3 policy `audio_sketches_objects_*` tồn tại đúng `{authenticated}`; 2 cột trim có mặt đúng kiểu/default; `storage_sketch_project_id()` trả đúng UUID với path hợp lệ và NULL với path rác; advisor security **không phát sinh cảnh báo mới** (4 mục còn lại đều là cũ: 2 bảng RLS-không-policy do cố ý chỉ cho backend dùng, 10 hàm SECURITY DEFINER gọi được qua RPC, và Auth chưa bật leaked-password protection).

**Chưa làm:** toàn bộ code UC-53/54/55 (ghi âm, cắt, upload, danh sách sketch). DB giờ đã sẵn sàng.

---

## §32 — UC-53/54/55 Audio Sketch: code thật (16/09/2026)

**Sprint:** UC-53/54/55 thuộc **Sprint 5** ("Implement Audio Sketch & Custom Sound", 21/09–11/10) theo Report 2 → **kéo sớm ~5 ngày** so với lịch. Ghi lại theo đúng yêu cầu của người dùng về việc note khi làm lệch sprint.

**Kiến trúc (theo thiết kế gốc, người dùng đã chốt không hỏi thêm):** file đi **thẳng từ trình duyệt lên Supabase Storage** bằng signed URL; backend chỉ quyết định quyền và giới hạn, không nhận byte file.
- `POST /projects/:projectId/audio-sketches/upload-url` → kiểm quyền edit (BR-26) + BR-56 rồi trả `{ sketchId, path, token }`.
- `POST /projects/:projectId/audio-sketches` → sau khi client upload xong mới ghi bản ghi vào DB. **Bắt buộc kiểm file có thật trong bucket trước khi insert**, nếu không client gọi thẳng endpoint này là tạo được dòng trỏ tới file không tồn tại.
- `GET /projects/:projectId/audio-sketches` → danh sách, kèm signed URL nghe lại hạn 1 giờ (bucket private).
- Backend tự kiểm quyền (dùng `service_role` nên bỏ qua RLS): `assertCanEdit` / `assertCanView` viết **khớp đúng ngữ nghĩa** với `can_edit_project()` / `can_view_project()` mà RLS đang dùng, để 2 tầng không nói hai điều khác nhau.

**Frontend:** `lib/use-audio-recorder.ts` (MediaRecorder + đồng hồ + đo mức tín hiệu để vẽ dạng sóng trực tiếp), `lib/wav-encoder.ts` (decode / encode WAV / rút peak vẽ sóng), `components/audio-sketch/audio-sketch-panel.tsx` (ghi → cắt → đặt tên → đính kèm → danh sách), gắn vào **thanh công cụ MIDI Editor** đúng trigger của UC-53 ("User selects 'Audio sketch' in the MIDI Editor").
- Đã xử lý đủ ngoại lệ SRS: 2.E1 từ chối quyền micro, 2.E2 không có micro, 4.E1 micro bị ngắt giữa chừng (giữ phần đã ghi + báo), 5.1 tự dừng ở 3 phút, 6.E1 vượt giới hạn dung lượng (báo rõ số MB, giữ bản ghi lại).
- UC-54 cắt **không phá huỷ**: file WAV lưu nguyên bản ghi đầy đủ, điểm cắt lưu ở `trim_start_sec`/`trim_end_sec`, phát lại tự dừng đúng điểm cắt — đúng POST-2 "the full recording is retained".

**⚠️ Lỗi thiết kế trong BR-56 — phát hiện khi code, đã tự sửa (người dùng yêu cầu chủ động sửa):** BR-56 cùng lúc cho phép **3 phút**, giới hạn **10MB**, và bắt lưu **WAV**. WAV là PCM không nén: stereo 48 kHz 16-bit ≈ 192 KB/s ⇒ 3 phút ≈ **34MB**, tức ba yêu cầu này **không thể cùng đúng**. Nếu code y theo chữ thì mọi bản ghi dài hơn ~52 giây đều bị từ chối — tính năng coi như vô dụng. Cách xử lý: `normalizeForStorage()` hạ về **mono 22.05 kHz** trước khi encode (≈44 KB/s ⇒ 3 phút ≈ 7,6MB, vừa khít 10MB). Chấp nhận được vì BR-57 định nghĩa audio sketch là *reference material* — không trộn vào bản phối, không nằm trong bản xuất. **Không sửa Report 3**; nếu muốn tài liệu khớp code thì nên thêm 1 câu vào BR-56 nói rõ bản ghi được chuẩn hoá mono 22.05 kHz khi lưu.

**Sửa thêm trong lúc code (code smell / bug tiềm ẩn):**
- Tách `decodeRecording` khỏi `encodeWav` để **chỉ giải mã một lần** — bản đầu giải mã 2 lần (một cho dạng sóng, một cho WAV), tốn gấp đôi thời gian trên bản ghi dài.
- Thẻ `<audio>` dùng chung cho 2 nguồn (bản ghi đang xem lại và sketch đã lưu): **bỏ bind `src` qua JSX**, gán tay ở cả 2 nhánh — để React quản `src` thì mỗi lần `previewUrl` đổi là nó ghi đè nguồn đang phát dở.
- `previewTrimmed()` xoá `playingId` trước khi phát, nếu không hàm `onTimeUpdate` sẽ dừng theo điểm cắt của **sketch nghe trước đó** thay vì bản ghi đang chỉnh.
- `discardRecording()` dừng phát trước khi bỏ object URL, tránh thẻ audio trỏ vào URL đã revoke.
- Hook ghi âm nhả micro trong cleanup của `useEffect` — không có thì đèn micro của trình duyệt vẫn sáng sau khi rời trang.
- Encode WAV kẹp mẫu về [-1, 1] trước khi nhân: mẫu vượt biên không kẹp sẽ tràn số nguyên 16-bit thành tiếng rè rất to.
- BR-56 kiểm **ở cả tầng service** chứ không chỉ decorator DTO, để quy tắc còn hiệu lực nếu sau này service được gọi từ nơi khác không qua ValidationPipe.

**Verify:** tsc sạch cả 2 phía; eslint 0 error (frontend 6 warning cũ, backend sạch); chạy full stack thật — 3 route `/projects/:projectId/audio-sketches*` map đúng, đều trả **401 khi chưa đăng nhập**, trang editor vẫn 200, backend compile 0 lỗi. **CHƯA chạy thật luồng ghi âm→upload** (cần trình duyệt có micro + tài khoản đăng nhập) — đây là phần bắt buộc người dùng tự kiểm: mở project → MIDI Editor → nút "Audio sketch".

**Chưa làm:** UC-117 xoá sketch (đã có policy DELETE sẵn ở cả bảng lẫn storage, chỉ thiếu endpoint + nút).

**Chưa commit/push.**

---

## §33 — Chốt lại chất lượng & giới hạn Audio Sketch: mono 44.1 kHz, 20MB (16/09/2026)

**Bối cảnh:** sau khi §32 chỉ ra BR-56 tự mâu thuẫn, người dùng hỏi "nâng giới hạn lên 50MB và giữ chất lượng gốc thì sao". Đã tra: organization Supabase đang ở **gói free** (`plan: free`).

**Số liệu đưa ra để quyết định** (WAV PCM 16-bit, không nén):

| Cấu hình | Tốc độ | 3 phút | Số sketch trong 1GB của gói free |
|---|---|---|---|
| Stereo 48 kHz (chất lượng thu gốc) | 187,5 KB/s | 33,8 MB | ~30 cho TOÀN nền tảng |
| Mono 48 kHz | 93,8 KB/s | 16,9 MB | ~60 |
| **Mono 44,1 kHz (đã chọn)** | 86,1 KB/s | 15,5 MB | ~66 |
| Mono 22,05 kHz (bản §32) | 43,1 KB/s | 7,6 MB | ~135 |

Hai lý do loại phương án 50MB/stereo: (1) gói free chỉ có **1GB storage + 5GB egress/tháng**, mà bucket là private nên mỗi lần nghe là tải lại cả file ⇒ stereo 48 kHz chỉ chứa nổi ~30 sketch và ~150 lượt nghe/tháng cho toàn nền tảng; (2) micro laptop/tai nghe gần như luôn là nguồn **mono**, nên thu stereo chỉ nhân đôi dung lượng để lưu một kênh trùng lặp, không thêm thông tin nào. 50MB cũng đúng bằng trần upload của gói free, không còn dư địa.

**Đã áp dụng (4 chỗ, giữ khớp nhau):**
1. `frontend/lib/wav-encoder.ts` — `STORAGE_SAMPLE_RATE` 22050 → **44100**.
2. `frontend/components/audio-sketch/audio-sketch-panel.tsx` — `MAX_SIZE_BYTES` → **20MB** (+ sửa câu báo lỗi).
3. `backend/src/audio-sketches/dto/create-upload-url.dto.ts` — `MAX_SKETCH_SIZE_BYTES` → **20MB** (+ message).
4. Migration `raise_audio_sketches_bucket_limit_to_20mb` — `storage.buckets.file_size_limit` → 20971520. Đã đọc lại DB xác nhận.

**Tài liệu đã sửa trong repo:** `docs/STAVE_PROJECT_BIBLE.md` — bảng giới hạn file (dòng 885) ghi 20MB + mono 44.1 kHz; 2 dòng checklist cũ (mục 11 và mục 27) được đánh dấu lỗi thời. **Custom Sound (BR-60) giữ nguyên 10MB** vì chỉ dài 30 giây (30s mono 44.1 kHz ≈ 2,6MB, thừa sức).

**Tài liệu NGƯỜI DÙNG phải tự sửa — `docs/Report3_Software Requirement Specification.docx` (Claude không sửa file .docx):** cụm mô tả BR-56 xuất hiện **3 lần** (trong UC-53, trong UC-55, và trong bảng tổng hợp §5.1). Câu hiện tại:

> *An audio sketch may be up to 3 minutes long and 10 MB in size. Recording requires the user to grant the browser permission to use their microphone. The browser-captured recording is converted to WAV before storage, ensuring consistent playback across browsers regardless of native MediaRecorder format support.*

Thay bằng:

> *An audio sketch may be up to 3 minutes long and 20 MB in size. Recording requires the user to grant the browser permission to use their microphone. The browser-captured recording is converted to a single-channel 44.1 kHz WAV before storage, ensuring consistent playback across browsers regardless of native MediaRecorder format support while keeping a three-minute sketch within the size limit.*

Câu thay thế cố ý nói rõ **mono 44.1 kHz**: nếu chỉ sửa con số 10→20 thì tài liệu vẫn mâu thuẫn (WAV stereo 48 kHz 3 phút = 34MB, vẫn vượt 20MB). **Các chỗ ghi "10 MB" của Custom Sound (UC-56/57/118, BR-60) giữ nguyên, không đụng tới.**

---

## §34 — Mục D: dọn dẹp sau đợt thiết kế lại UI (16/09/2026)

**Đã xoá alias token cũ khỏi `globals.css`** — 16 dòng `--color-accent-600`, `--color-danger-50`… Trước khi xoá đã grep xác nhận **0 nơi còn dùng** trong `app/` và `components/`. `next build` production chạy lại sạch (19 route) sau khi xoá.

**Đã cập nhật CLAUDE.md mục 4.7 cho khớp thực tế** (trước đó mô tả sai hoàn toàn so với code):
- Viết lại phần token: nay là **hệ semantic theo vai trò** (`background`/`surface`/`foreground`/`muted`/`border`/`accent`/`success|warning|danger`/`metal`), không còn bảng đánh số `accent-50..900`. `rounded-card` 0.5rem, `shadow-card: none`.
- Thêm nguyên tắc **"accent là small dose"** (diện tích lớn dùng trung tính) — gốc rễ của phản hồi "UI cũ màu mè".
- Thêm mục theme đổi lúc chạy (UC-78, `data-theme` + `ThemeProvider`) kèm ràng buộc **BR-90** (preset chỉ đổi màu trang trí) và nhắc phải sửa cả `globals.css` lẫn `PRESET_THEME_KEYS` ở backend khi thêm preset.
- **Huỷ điều khoản "canvas MIDI Editor dùng nền tối zinc-900/950"** (11/09/2026) — sai thực tế: bản redesign đang dùng là nền sáng và từ §30 thì màu editor đã trỏ vào token chung. Ghi rõ ngoại lệ duy nhất còn hex cố định là **bảng màu track** (dữ liệu người dùng, UC-34), kèm cảnh báo canvas không parse được `var()`/`color-mix()` nên phải đi qua `lib/resolve-css-colors.ts`.
- Cập nhật dòng row-list: trỏ sang `components/ui/row-list.tsx` + quy tắc "hàng tiêu đề và hàng dữ liệu dùng chung chuỗi grid-template"; ghi nhận `card-grid.ts` và `project-card.tsx` đã xoá.
- Cập nhật IA `/profile` (nay 3 tab, layout 2 cột) và danh sách trang giữ container hẹp.

**Tình trạng 4 mục A/B/C/D sau phiên này:**
- **A (bố cục từng trang) — XONG** (§28).
- **B (MIDI Editor) — xong phần token** (§30). Còn lại: **velocity lane** dưới piano roll (có trong mẫu Lovable, code chưa có) và **branch selector trên project bar** (chính là UC-48 switch branch, cần snapshot của editor nên phải làm cùng editor). Bố cục 3 cột (track panel | piano roll | history) thì **đã có sẵn từ bản redesign cũ**, không phải dựng lại như ước tính ban đầu ở §27.
- **C (tính năng) — làm 3/6**: xong tab Commit, tab Nhánh + merge, preset theme UC-78. Còn Pull request (UC-87…92), UC-79 sinh theme từ ảnh (chờ Subscription), global search ⌘K.
- **D (dọn dẹp) — XONG phần code/tài liệu**. Còn **chưa xem bằng mắt và chưa kiểm responsive** (máy không có Playwright) — việc này phải do người dùng làm.

**Chưa commit/push.**

---

## §35 — UC-48 chuyển nhánh trong editor + dải velocity (16/09/2026)

Làm 2 mục còn lại của **B** theo thứ tự đã chốt. **Chưa commit/push.**

### 1. UC-48 — Switch Active Branch (Sprint 5, kéo sớm cùng cụm Branch Management ở §29)

**Lỗ hổng đã vá:** §29 ship được nút tạo nhánh/merge/xoá ở trang tổng quan project, nhưng nhánh tạo ra **không mở được**: `drafts.service.ts` gọi `getDefaultBranchForOwner` cho cả GET lẫn PUT nên editor luôn làm việc trên branch mặc định, và frontend chưa có wrapper nào gọi `POST /branches/switch` (endpoint backend thì đã có sẵn từ trước).

**Backend**
- `ProjectsService.getActiveBranchForOwner(projectId, ownerId)` mới: đọc `projects.active_branch_id`, rơi về branch mặc định khi NULL **hoặc** khi cột trỏ tới branch không còn/không thuộc project (dữ liệu hỏng vẫn phải mở được editor). Tách `loadDefaultBranch` dùng chung để không gọi `getOwned` hai lần.
- `drafts.service.ts` GET/PUT chuyển sang dùng hàm trên.
- `getDraft` thêm lớp dự phòng: branch chưa có row `drafts` thì lấy snapshot của **head commit**, chỉ trả bản rỗng khi branch cũng chưa có commit. Trước đây luôn trả rỗng — kể từ UC-48 branch đang mở có thể là branch bất kỳ, trả rỗng cho branch đã có nội dung sẽ hiện ra như "project trống" rồi autosave ghi đúng cái trống đó xuống DB.
- `getProjectBranches` trả thêm cờ `is_active` (đọc `projects.active_branch_id`, cùng quy tắc fallback).
- `ProjectRow` bổ sung `active_branch_id`, `BranchRow` bổ sung `head_commit_id` — 2 cột đã có thật trong DB nhưng type tự khai còn thiếu.

**Frontend**
- `api-client.ts`: `switchBranch()` + `SwitchBranchResult`; `Branch.is_active?`.
- `use-version-control.ts`: giữ cả danh sách `branches`, chọn branch mở theo `is_active` (không còn mặc định cứng `is_default`), thêm `switchTo` / `switching` / `switchError`.
- `editor-redesign.tsx`: chip nhánh ở header thành **dropdown chọn nhánh** (nhãn "mặc định", lớp phủ trong suốt để bấm ra ngoài là đóng, vô hiệu khi project chỉ có 1 nhánh).
- `midi-editor.tsx`: thêm `readSnapshot` (đọc từ `snapshotRef`, hàm ổn định) để gửi kèm lời gọi chuyển nhánh. Draft của nhánh mới nạp lại qua chính `applyRestoredSnapshot` của UC-46 — nó đã xoá undo/redo, reset selection và huỷ autosave đang chờ, đúng thứ cần cho việc đổi nhánh.
- `branch-list.tsx`: badge **"Đang mở"** + khoá nút xoá cho nhánh đang mở (backend vốn đã chặn; trước đây người dùng chỉ thấy lỗi sau khi bấm).

**Race đã xử lý (quan trọng):** autosave của editor là `PUT /projects/:id/draft` debounce 2s, mà endpoint đó ghi vào branch **đang active**. Nếu timer còn treo và nổ đúng lúc backend vừa đổi `active_branch_id`, nó ghi snapshot branch CŨ đè lên draft branch MỚI. `switchTo` vì vậy **bắt buộc gọi `flushDraft()` trước** khi gọi API (huỷ timer + ghi ngay), dù payload `currentDraft` gửi kèm cũng đã là một bản lưu.

**Bug thật đã tìm ra và sửa luôn:** `normalizeSnapshot` trong `branches.service.ts` đọc `t.isMuted` / `t.isSolo`, nhưng `DraftTrack` ở `shared-types` dùng `muted` / `solo`. Hệ quả: **mỗi lần chuyển nhánh, mọi track đang mute/solo của nhánh vừa rời bị âm thầm reset về false.** Đã sửa cả DTO (khai đúng `muted`/`solo`, giữ tên cũ làm alias để không vỡ payload cũ) lẫn hàm normalize. Đây là code chưa từng chạy thật lần nào vì endpoint switch chưa có UI — đúng kiểu lỗi mà chỉ đọc TypeScript không bắt được (CLAUDE.md mục 10).

**Bẫy UX mới xuất hiện (đã giảm nhẹ, chưa xoá hẳn):** trước đây `active_branch_id` luôn NULL vì không có đường nào gọi switch. Giờ nó có giá trị thật, nên nhánh đang mở **không xoá được** (backend chặn từ trước). Đã làm rõ bằng badge + nút xoá bị khoá + sửa câu lỗi backend thành "switch to another branch first". Người dùng vẫn phải vào editor chuyển về `main` rồi mới xoá được nhánh vừa merge.

### 2. Dải velocity dưới piano roll — `components/midi-editor/velocity-lane.tsx` (mới)

**ĐỐI CHIẾU TÀI LIỆU — cần người dùng quyết:** đã tra toàn bộ Report 3, **không có UC nào cho việc chỉnh velocity**. UC-26 (Edit note) chỉ nói pitch/timing/length. Nhưng 2 business rule lại mặc định là có:
- **BR-27**: "a note must have ... a velocity between 1 and 127".
- **BR-28**: "Any operation that changes an existing note in place — moving, resizing, quantising, or **adjusting its velocity** — keeps the note's identifier".

Kết luận: đây là **lỗ hổng trong danh sách UC**, không phải chức năng bị loại bỏ (note import từ file MIDI mang velocity thật, không có dải này thì vĩnh viễn không sửa được). Đã làm theo đúng BR-27/BR-28. **Việc người dùng cần làm: bổ sung 1 UC vào Report 3** (VD "Adjust note velocity", thuộc nhóm MIDI Editing cùng UC-25…27, Sprint 4) — nếu không thì có code mà không có requirement tương ứng khi đối chiếu lúc bảo vệ.

**Thiết kế:** canvas riêng, cao 104px, đặt trong `rollWrap` ngay dưới piano roll. **Không có thanh cuộn ngang riêng** — bám theo `scrollX` mà piano roll báo ra qua prop mới `onScrollXChange`, nên hai lưới luôn thẳng cột. Piano roll export `PIANO_ROLL_KEY_WIDTH` và `pxPerTickFor(zoom)` để hai bên dùng chung một công thức (hardcode lại 72 / `0.06 * zoom` ở file kia là mầm lệch khi sửa mockup). Màu đi qua `resolveCssColors` + MutationObserver `data-theme` y như piano roll.

**Tương tác:** bấm/kéo dọc trên cột của note để đặt velocity; kéo note nằm trong vùng đang chọn thì các note còn lại **dịch theo độ lệch** (giữ nguyên đường cong to-nhỏ) chứ không bị gán bằng nhau, mỗi note tự kẹp về 1..127. Velocity gốc được chụp lại lúc bấm chuột — cộng dồn trên giá trị đang đổi sẽ làm sai lệch tăng dần theo từng mousemove. Nút bật/tắt dải nằm cạnh nhóm zoom trên tool strip, mặc định BẬT.

### Trạng thái mục B/C sau phiên này
- **B — XONG** (token §30 + UC-48 + velocity lane).
- **C — còn 3**: Pull request (UC-87…92, **chặn bởi Fork UC-69 chưa build**: UC-87 PRE-2 đòi "the user owns a fork of another user's project"), UC-79 sinh theme từ ảnh (chờ Subscription), global search ⌘K (Sprint 6).
- **Chưa ai đăng nhập chạy thử**: toàn bộ luồng commit/tag/restore, tạo/merge/xoá nhánh, **chuyển nhánh**, lưu theme, và record→trim→upload audio sketch đều chưa được kiểm chứng đầu-cuối bằng tài khoản thật.

---

## §36 — Bảng trạng thái tổng hợp: đã làm / chưa làm / việc người dùng phải tự làm (cập nhật lần cuối 08/10/2026, sau §68 — mục D, I, K)

> Mục này **thay thế bảng ước lượng ở §20** (12/09/2026, đã lỗi thời). Số liệu lấy từ việc đọc code thật (`grep` mã UC trong `frontend/`+`backend/`, đọc controller), đọc Report 3 thật và tra DB thật — không suy đoán từ nhật ký. Khi tiến độ thay đổi, **cập nhật mục này** thay vì thêm bảng mới ở cuối file. Lịch sử của chính mục này: tạo ở phiên §36, viết lại toàn bộ ở phiên §37, bổ sung J/K + cập nhật B/G/H/I ở phiên §38, chốt J1-J3 ở phiên §39.

---

### A. VIỆC TÀI LIỆU NGƯỜI DÙNG TỰ LÀM SAU — Claude không sửa file `.docx`/`.xlsx`

Người dùng đã nói rõ (16/09/2026): **gom hết lại, sửa tài liệu một đợt sau**. Claude chỉ ghi vào đây, không giục làm ngay.

| # | Việc | File | Trạng thái | Nguồn |
|---|---|---|---|---|
| A1 | Bổ sung UC "Adjust note velocity" (nội dung soạn sẵn ở A1 bên dưới) | Report 3 + Master xlsx | ❗ Chưa làm | §35 |
| A2 | Sửa BR-56 (3 phút / 20 MB / WAV mono 44.1 kHz) | Report 3 | ✅ Xong, Claude verify 3/3 chỗ | §33 |
| A3 | **D1 đã chốt cách (a)**: dời UC-69 Fork từ Code Iteration 3 lên Iteration 2 (để Pull Request UC-87→92 làm được trong Iteration 2) | Report 2 + `Report2_Project_Schedule.xlsx/.pdf` | ❗ Chưa làm | §37 |
| A4 | Ghi nhận làm SỚM hơn lịch khi báo cáo tiến độ: Branch Mgmt (UC-47→52, 86), Audio Sketch (UC-53→55), UC-78, và nay thêm UC-45/UC-50 (vốn thuộc "Complete Version Control" của Iteration 2) | Báo cáo tiến độ | ❗ Chưa làm | §36-D2, §37 |
| A5 | **Treo quyết định MP3 cho UC-38** (mục C). NẾU bỏ MP3 phải sửa đồng loạt: tên + Trigger + Normal Flow bước 2 của UC-38; Screen #18 ("WAV/MP3"); UC-119 Other Information ("alongside WAV, MP3, and MIDI"); bảng hiệu năng 4.2.3 dòng 7 ("WAV/MP3/MIDI"); **Report 1 FE-04** ("export it to WAV/MP3"); Bible §15.3. Riêng **BR-60** (Custom Sound nhận file WAV/MP3 khi UPLOAD) là chuyện khác — bỏ MP3 ở export KHÔNG kéo theo sửa BR-60 | Report 1, Report 3, Bible | ⏸ Chờ quyết định | §37 |
| A6 | Report 3 §4.1 bảng Software Interfaces ghi chung "AI Service Provider" (REST/HTTPS) — **đã khớp** quyết định dùng Gemini, KHÔNG cần sửa Report 3. Chỉ cần ghi đích danh Gemini API khi viết Report 4 (SDD) | Report 4 | Ghi chú | §37 |
| A7 | **Thêm Custom Sound (UC-56→59, 118, 119) vào lịch Report 2** — hiện **không nằm trong iteration nào**. Người dùng xác nhận tự sửa lịch sau (16/09/2026) | Report 2 + `Report2_Project_Schedule.xlsx/.pdf` | ❗ Chưa làm | §37, §38 |
| A8 | **Sửa đặc tả Custom Sound theo mô hình ĐÃ CHỐT ở J** — danh sách từng chỗ ở **J.4** | Report 3 (UC-17, 57, 58, 59, 99, 102; BR-61, 62, 63; 3.1.5 ERD + Entities) | ❗ Chưa làm — người dùng gộp sửa sau | §38, §39 |

#### A1 — chi tiết (nội dung để người dùng chép vào Report 3)

**Vấn đề:** dải velocity đã code (`frontend/components/midi-editor/velocity-lane.tsx`, §35) nhưng **Report 3 không có UC nào cho việc chỉnh velocity**:

- **UC-26 "Edit note (move/resize)"** — Description chỉ đổi *"pitch, timing, or length"*; Normal Flow bước 2 chỉ có kéo thân note và tay nắm cạnh.
- Nhưng **BR-27** giới hạn *"a velocity between 1 and 127"*, **BR-28** viết *"… quantising, or **adjusting its velocity** — keeps the note's identifier"*, và **BR-46** (UC-45) viết *"a note whose pitch, timing, or **velocity** changed is reported as modified"*.

⇒ **Lỗ hổng trong danh sách UC**, không phải chức năng bị cố ý loại bỏ. Note nhập từ file MIDI (UC-24) mang velocity thật; thiếu màn này thì velocity đó vĩnh viễn không sửa được, note vẽ tay kẹt ở 80.

**Đề xuất UC mới** (nhóm MIDI Editing, cạnh UC-25→27):

> **UC-xxx Adjust note velocity** — *User* — Change how loud one or more notes sound.
>
> **Trigger:** User drags a note's bar up or down in the velocity lane below the piano roll.
>
> **Preconditions:** PRE-1 User is logged in. PRE-2 A project is open in the MIDI Editor. PRE-3 User is the project owner or a collaborator with edit permission. PRE-4 At least one note exists.
>
> **Postconditions:** POST-1 The note's velocity is updated. POST-2 The note keeps its original identifier, so a later comparison reports it as modified rather than as one note removed and another added (BR-28). POST-3 The change is held in the working draft until the user commits.
>
> **Normal Flow:** 1. User opens the velocity lane. 2. User presses the pointer on a note's velocity bar. 3. System sets that note's velocity from the vertical position of the pointer. 4. User drags up or down; the system keeps updating the value. 5. System clamps the result to the allowed range (BR-27) and redraws the bar.
>
> **Alternative Flows:** 2.1 The note being dragged is part of the current selection — the system shifts every selected note by the same amount, preserving the relative shape of the phrase, clamping each note individually.
>
> **Exceptions:** 5.E1 The drag would push a note below 1 or above 127 — the system stops that note at the boundary instead of rejecting the whole gesture.
>
> **Business Rules:** BR-27, BR-28.

**Đánh số ở CUỐI dãy** (UC-120), **không chèn giữa** — chèn giữa làm lệch mọi mã UC đã trích trong code và §0→§37.

---

### B. ĐÃ LÀM — theo nhóm chức năng

Mức verify: **V3** = người dùng tự bấm tay xác nhận · **V2** = script/Playwright/jest chạy logic thật · **V1** = chỉ `tsc`/`eslint`/build sạch.

| Nhóm | UC | Mức | Ghi chú |
|---|---|---|---|
| Auth & Account | UC-01→07, 13→17, 84, 85, 96→99 | **V3** | §2. **Thiếu UC-82/83** — xem C |
| Project Management | UC-18→23 | **V3** | §3, §4 |
| Explore / Guest | UC-08→12 | **V3** | §5, §12 |
| MIDI Editor — soạn nhạc | UC-24→35, 41 | **V2** | UC-36 mới một phần; UC-33 chưa đối chiếu Alternative flow — xem C |
| MIDI Editor — phát nhạc | UC-37 | **V3** | **Người dùng xác nhận 16/09/2026: nghe bình thường từ vài phiên trước** — bug câm tiếng §21/§23 đã đóng |
| MIDI Editor — xuất file | UC-38 (WAV), UC-39 (.mid) | **V2** | MP3 treo quyết định (A5) |
| MIDI Editor — velocity | *(chưa có mã UC — A1)* | **V1** | Đã vào `main` (PR #34) |
| Version Control | UC-42, 43, 44, 46 | **V2** | Ở editor (§16) và tab Commit trang project (§29) |
| Version Control | **UC-45 Compare** | **V1**, riêng logic diff **V2** | §37, đã vào `main` (PR #33). Thiếu bước 6 (nghe thử 2 phiên bản ngay trong màn so sánh) |
| Branch Management | UC-47, 49, 51, 52, 86 | **V1** | §29. Chưa ai chạy thật đầu-cuối |
| Branch Management | UC-48 | **V1** | Backend PR #32 + editor PR #34 — đủ cả hai phía trên `main` |
| Branch Management | **UC-50 View branch history** | **V1** | §37, đã vào `main` (PR #33) |
| Audio Sketch | UC-53, 54, 55 | **V1** | §32, §33 |
| Personalization | UC-78 | **V1** | §29 |

**Hạ tầng không tính là UC:** hệ token semantic + component dùng chung (§26, §28, §34), 2 lớp session auth (§2), RLS 29 bảng (§0), sample 17 nhạc cụ + trống GM kênh 10 (§24), CI/CD.

---

### C. CHƯA LÀM — và vì sao

⚠️ **Đính chính bản §36 cũ:** bản cũ ghi "UC-70→77 AI Assistance" và "UC-80→83 Subscription, Notifications, Google connect" — **sai nhóm**. Đúng theo Report 3: AI = **UC-70→72**; Subscription & Payment = **UC-73→77**; Personalization = UC-78/79; Notifications = **UC-80/81**; Connected accounts = **UC-82/83**.

| UC | Tên | Tình trạng thật | Chặn bởi |
|---|---|---|---|
| **UC-82, 83** | Connect / Disconnect Google account | **Chưa có code.** Report 2 ghi đích danh Iteration 1 = *"Auth & Account (incl. **connected accounts**, …)"* — **bản §36 cũ bỏ sót**, đây là việc Sprint 4 thật sự còn thiếu | Người dùng phải bật **manual linking** trong Supabase Dashboard → Authentication (`linkIdentity`/`unlinkIdentity` của supabase-js chỉ chạy khi bật). UC-82 bước 7 / UC-83 POST-3 đòi **email thông báo** (BR-93) — chưa có hạ tầng notification. UC-83 Alt 2.1: tài khoản chỉ có Google phải đặt mật khẩu trước khi gỡ (BR-94) |
| **UC-117** | Delete audio sketch | Policy DELETE có sẵn ở bảng + storage; thiếu endpoint + nút | Không |
| **UC-36** | Metronome + loop playback | Metronome xong; loop đang lặp cả bài, đặc tả đòi **kéo chọn vùng trên thước** (Alt 2.1 "không chọn vùng thì lặp cả bài" thì đã đúng) | Không |
| **UC-45 bước 6** | Nghe thử từng phiên bản trong màn so sánh | Engine phát nhạc chỉ sống trong MIDI Editor | Cần tách engine ra dùng chung |
| **UC-33** | Paste pattern | Clipboard là state React trong editor → **nghi** chưa đáp ứng Alt 1.1 (dán sang project KHÁC), Alt 3.1 (nhiều track), 3.E1 (cắt note chồng) — **chưa đối chiếu kỹ, phải audit trước khi kết luận** | Không |
| **UC-38 MP3** | Export MP3 | Chỉ có WAV | ⏸ Quyết định giữ/bỏ (A5). Giữ thì cần thư viện encode MP3 |
| **UC-69** | Fork public project | Nút là PLACEHOLDER | **Đã chốt làm trước PR** (D1 cách a) |
| **UC-87→92** | Pull Request (6 UC) | Tab là PLACEHOLDER | Cần UC-69 xong trước |
| **UC-79** | Theme từ ảnh (STAVE+) | Nút là PLACEHOLDER | ⛔ **Người dùng xác nhận tạm chặn** (16/09/2026) tới khi xong UC-73→77 |
| **UC-56→59, 118, 119** | Custom Sound + Export bundle | Chưa có code; DB có sẵn `custom_sounds`, `sound_mappings` (phải migrate theo J.3); **chưa có bucket storage** | Không còn bị chặn về thiết kế — **mô hình đã chốt đủ (J)**; còn hạ tầng J6 (chỉ gấp khi gần đầy 1GB) |
| **UC-60→65** | Collaboration | Chưa có code | — |
| **UC-66→68, 93→95** | Community Jam | Chưa có code | — |
| **UC-70→72** | AI (commit message, merge risk, Theory Insight) | Chưa có code | Provider **đã chốt Gemini API** (§37); Theory Insight có cần RAG không — chưa chốt |
| **UC-73→77** | Subscription & Payment (PayOS) | Chưa có code | — |
| **UC-80, 81** | Notifications | Chưa có code | — |
| **UC-100→114** | Admin nâng cao, thống kê, template thông báo | Chưa có code | — |
| **UC-115, 116** | Role-based authorization, Autosave (System) | Phần lớn có sẵn qua guard (`admin.guard`, 2 lớp session) và autosave draft — **chưa audit riêng theo đặc tả** | — |

---

### D. ĐỐI CHIẾU REPORT 2 (Project Schedule)

Phạm vi iteration (nguyên văn `docs/Report2_Project_Schedule.xlsx`):
- **Code Iteration 1 (31/08→20/09):** Auth & Account (incl. connected accounts, session mgmt), Project Mgmt, Version Control (start), MIDI Editor (start). Kèm *"Unit test core modules"* 16/09→20/09.
- **Code Iteration 2 (21/09→11/10):** Complete Version Control & MIDI Editor; Branch Mgmt (incl. conflict resolution), Pull Requests, Audio Sketch, Collaboration; start Community Jam. Kèm integration test VC + Branch 07/10→11/10.
- **Code Iteration 3 (12/10→01/11):** Complete Jam; Community & Discovery, AI, Subscription & Payment, Notifications, Admin.

**Người dùng (16/09/2026): lịch Report 2 chỉ là kế hoạch ban đầu, nhóm linh hoạt thời gian** → thứ tự làm việc theo mục I, không bám cứng ngày.

- **D1 — ✅ ĐÃ CHỐT cách (a):** làm UC-69 Fork ngay trước Pull Request. Lý do: UC-87 PRE-2/PRE-3 đòi đã có fork chứa commit mà bản gốc chưa có — không có Fork thì PR không có dữ liệu để test. Việc sửa Report 2 tương ứng: A3.
- **D2 — làm sớm hơn lịch:** xem A4.
- **D3 — lỗ hổng lịch:** Custom Sound (UC-56→59, 118, 119) **không có trong mô tả iteration nào** của Report 2. Xem J.
- **Unit test:** người dùng tự lên kế hoạch sau (16/09/2026). Công cụ gợi ý: **§36-K**.
- **08/10/2026: nhóm tạm dừng code để làm testing + Report 5** (Software Test Documentation). Yêu cầu template, công cụ theo từng loại test, phân loại tự động/thủ công: **§36-K** (viết lại), log phiên §68.

---

### E. QUY TRÌNH KHI LÀM CHỨC NĂNG MỚI (người dùng yêu cầu ở §27)

1. Tra **Report 3** đúng UC, đọc Preconditions/Postconditions/Alternative/Exceptions/Business Rules **trước khi code**.
2. Tra **Report 2** xem UC thuộc iteration nào — làm việc của giai đoạn khác thì **ghi lại** (A4).
3. Code ra thứ **không có UC phủ** → ghi vào mục A. **Không tự bịa số UC mới.**
4. Thấy bug / code smell / lỗi thiết kế trong lúc code → **sửa ngay và ghi lại**, không cần hỏi trước (§32).
5. Việc sửa tài liệu → ghi vào mục A, **không giục người dùng làm ngay** (chỉ thị 16/09/2026).
6. **Không chạy `next build`** khi người dùng có thể đang mở dev server (build ghi đè `.next` mà dev server đang dùng) — dùng `tsc --noEmit` + `eslint` cho frontend, hỏi trước nếu thật sự cần build.

---

### F. CHƯA KIỂM CHỨNG BẰNG TÀI KHOẢN THẬT

Người dùng đang tự kiểm tra giao diện + chức năng (16/09/2026). Danh sách cần bấm tay:

1. **Branch Management đầu-cuối**: tạo nhánh → chuyển nhánh → sửa → commit → merge → xung đột → giải quyết → xoá nhánh.
2. **Version Control**: commit, tag, khôi phục.
3. **UC-45 so sánh (mới §37)**: tích 2 commit → So sánh; "So với mới nhất"; Đảo chiều; lọc track; 2 commit giống hệt; đổi nhạc cụ/tempo; thêm/xoá nguyên track; bấm Esc đóng.
4. **UC-50 lịch sử nhánh (mới §37)**: tab Nhánh → "Lịch sử"; đổi nhánh ở dropdown tab Commit; nhánh chưa có commit riêng; badge Riêng nhánh/Kế thừa; gắn tag + khôi phục trên nhánh không mặc định.
5. **Audio Sketch**: micro → ghi → cắt → đặt tên → upload signed URL → nghe lại.
6. **UC-78 lưu theme**: đổi preset → tải lại trang → thử lỗi lưu.
7. **Dải velocity**: kéo 1 note, kéo nhiều note, kẹp 1..127.
8. **Toàn bộ giao diện mới** + responsive từ điện thoại tới màn siêu rộng.
9. ~~Nghe thử âm thanh~~ — ✅ **người dùng xác nhận nghe bình thường (16/09/2026).**

---

### G. TRẠNG THÁI GIT (16/09/2026, cuối phiên §38)

- `main` local = `origin/main` = **`8c8b906`**, working tree **sạch**. Đã gồm PR #32 (redesign + Branch/Audio Sketch/UC-78), **PR #33** (UC-45/UC-50 + 3 bug, `feature/compare-versions-branch-history`), **PR #34** (commit F7 bị sót ở §37: chuyển nhánh trong editor + dải velocity, `feature/editor-branch-switch-velocity-lane`).
- Sự cố F7 bị sót (§37) **đã khép lại**.
- Local còn **~30 nhánh cũ** đã merge (`bugfix/*`, `feature/*`, `review/*`, `work/*`). Không ảnh hưởng gì; dọn khi rảnh theo CLAUDE.md 8.7 (`git branch -d <tên>` — `-d` tự từ chối xoá nhánh chưa merge).
- Claude **không commit/push/tạo nhánh** (CLAUDE.md mục 9).

---

### H. BẪY / QUYẾT ĐỊNH ĐANG TREO

- **Không xoá được nhánh đang mở trong editor** (backend chặn). Muốn xoá nhánh vừa merge phải vào editor chuyển về `main` trước. Xem §35 và mục I #5.
- **Xoá nhánh xoá luôn commit của nhánh đó** (`commits_branch_id_fkey … ON DELETE CASCADE`, tra DB thật §37), còn `parent_commit_id` của commit con chỉ `SET NULL`. Hệ quả: nhánh B tạo từ 1 commit nằm trên nhánh A, xoá A → lịch sử B **bị cắt cụt âm thầm** tại điểm rẽ. Delete-preview (BR-55) chỉ đếm commit chưa merge của A, không cảnh báo nhánh con phụ thuộc. Chưa sửa — cần quyết (chặn xoá / cảnh báo / chấp nhận).
- **`getAncestorIds`/`findMergeBase` tốn 1 truy vấn cho MỖI commit trên chuỗi** — vẫn dùng cho merge, chi tiết nhánh, delete-preview. §37 chỉ tối ưu riêng `getBranchHistory`. Nợ kỹ thuật (mục I #8).
- **[BUG có sẵn, phát hiện §38 — người dùng chọn TẠM ĐỂ ĐÓ (§39)] File audio sketch mồ côi trong Storage.** `ProjectsService.deleteOwned` (UC-21), `AuthService.deleteAccount` (UC-17), `AdminService.removeUser` (UC-99) chỉ xoá dòng DB; `audio_sketches.project_id … ON DELETE CASCADE` xoá dòng sketch nhưng **khoá ngoại DB không bao giờ xoá file trong Supabase Storage** → WAV nằm lại vĩnh viễn trong bucket `audio-sketches`, ăn vào 1GB free. Hiện bucket có **0 file** (tra §31/§37) nên chưa tốn thật. Chưa sửa theo quyết định người dùng; khi làm UC-117 thì hỏi lại có gộp sửa luôn không (mục I #2). Cùng loại lỗi sẽ xảy ra với Custom Sound (J.3 điểm 4).
- **[Gotcha kỹ thuật, §38] `ValidationPipe({ whitelist: true })`** ở `backend/src/main.ts` xoá âm thầm mọi trường không khai decorator trong DTO → thêm trường mới vào snapshot mà quên DTO là dữ liệu biến mất không báo lỗi. Đã ghi CLAUDE.md mục 10.
- **BR-90**: preset theme không được đổi màu hệ thống. Thêm preset mới sửa cả `globals.css` lẫn `PRESET_THEME_KEYS` backend.
- **Supabase gói free, 1GB storage** dùng chung cho audio sketch (tối đa 20MB/file) và Custom Sound sau này — xem J.
- **Ghi công soundfont**: đã đúng (FluidR3_GM = Frank Wen; GeneralUser GS = S. Christian Collins). Không còn treo.
- **Việc chưa chốt** (CLAUDE.md mục 5): license hiển thị, Theory Insight có dùng RAG không, lọc Explore theo nhạc cụ, EN/VI, MP3, Custom Sound (J).

---

### I. THỨ TỰ ƯU TIÊN CÒN LẠI (chốt 16/09/2026 — không bám lịch Report 2)

> **08/10/2026: tạm dừng.** Nhóm ngưng code để làm testing + Report 5 (§36-K, §68). Bảng dưới giữ nguyên để quay lại sau.

**Phạm vi** (yêu cầu người dùng): chỉ module của Sprint 4 (Auth & Account, Project Mgmt, Version Control, MIDI Editor) và phần Sprint 5 đã kéo sớm (Branch Mgmt, Audio Sketch). Chức năng mới không liên quan (Collaboration, Jam, AI, Subscription, Admin, Custom Sound…) **không tính** ở đây.

| # | Việc | Lý do đứng ở vị trí này | Trạng thái |
|---|---|---|---|
| 0 | Người dùng commit F7 lên nhánh riêng + PR | Editor trên `main` thiếu chuyển nhánh + velocity | ✅ Xong (PR #34) |
| 1 | UC-45 Compare + UC-50 Branch history | Priority **High** trong Report 3; backend có sẵn; là tính năng phân biệt STAVE với "lưu nhiều bản copy" | ✅ Trên `main` (PR #33), V1 |
| 2 | UC-117 Delete audio sketch (bug file sketch mồ côi ở H: người dùng **tạm để đó**, hỏi lại khi làm UC-117 vì cùng service, cùng bucket) | Nhỏ, không bị chặn; storage free rất chật | Chưa làm |
| 3 | UC-82/83 Connect/Disconnect Google | Thuộc đích danh phạm vi Iteration 1 mà bị sót | Chưa làm — cần người dùng bật manual linking trên Supabase trước |
| 4 | UC-36 loop theo vùng chọn | Hoàn thiện MIDI Editor (#0 đã xong, không còn bị chặn) | Chưa làm |
| 5 | Tab Nhánh: nút "chuyển về nhánh mặc định" + cảnh báo xoá nhánh có nhánh con (H) | Gỡ 2 bẫy UX/dữ liệu của Branch Mgmt | Chưa làm |
| 6 | Audit UC-33 Alt 1.1/3.1/3.E1 rồi sửa phần thiếu | Chưa biết thiếu thật hay không — audit trước | Chưa làm |
| 7 | UC-45 bước 6: nghe thử trong màn so sánh | Phải tách engine phát nhạc khỏi editor — việc lớn nhất danh sách | Chưa làm |
| 8 | Tối ưu `getAncestorIds` cho merge (H) | Chỉ đau khi lịch sử dài | Chưa làm |
| 9 | UC-38 MP3 | Treo tới khi quyết giữ/bỏ (A5) | ⏸ |
| — | Sau danh sách: **UC-69 Fork → UC-87→92 Pull Request** | D1 (a) — ngoài phạm vi xếp hạng nhưng là việc kế tiếp | — |

---

### J. CUSTOM SOUND — THIẾT KẾ & QUYẾT ĐỊNH (cập nhật 16/09/2026, phiên §38)

Nguồn đã tra thật: Report 3 UC-56→59, 118, 119 + BR-60→63, 133, 134. DB thật: `custom_sounds(id, owner_id → users ON DELETE CASCADE, name, file_url, duration_sec, size_bytes, source enum uploaded|recorded, created_at)`; `sound_mappings(id, project_id → projects ON DELETE CASCADE, track_id, pitch, custom_sound_id → custom_sounds ON DELETE CASCADE, UNIQUE(project_id, track_id, pitch))`. **Chưa có bucket storage** cho custom sound. **Chưa có dòng code Custom Sound nào.**

> **Cập nhật 04/10/2026 (§66):** code Custom Sound đã viết lại theo J.0–J.3 ở PR #40 (`bugfix/custom-sound-library-fixes`: UC-56/58/59/118) và PR #41 (`bugfix/custom-sound-mapping-snapshot`: UC-57, base = #40). **Chưa merge** — chờ áp 2 migration `backend/supabase/migrations/20261004000001_*.sql` và `…000002_*.sql` lên Supabase (Claude bị chặn áp, xem §66.4). Mọi mô tả "chưa có" ở đoạn trên vẫn đúng với DB thật cho tới khi áp migration.

> **Cập nhật 04/10/2026 (§67): ĐÃ ÁP cả 2 migration lên DB thật và ĐÃ MERGE PR #40 + #41 vào `main` (`788e077`).** DB thật giờ: `custom_sounds.deleted_at`; bucket `custom-sounds` (private, 10MB, chỉ WAV) + 3 policy storage; 4 hàm RPC chỉ `service_role` gọi được; `platform_settings.custom_sound_quota_bytes = 52428800`; `sound_mappings` thêm `branch_id`/`commit_id`, bỏ `UNIQUE(project_id, track_id, pitch)` và FK tới `custom_sounds`, chỉ còn policy SELECT, do trigger `drafts_sync_sound_mappings`/`commits_sync_sound_mappings` duy trì. Đoạn "DB thật / chưa có bucket / chưa có dòng code" ở trên là trạng thái 16/09, đã lỗi thời.

#### J.0 Bảng trạng thái quyết định

| # | Điểm | Trạng thái |
|---|---|---|
| J1 | Mapping lưu trong snapshot hay bảng | ✅ **ĐÃ CHỐT (§39): trong snapshot** — `tracks[].soundMap` (J.1) |
| J2 | Xoá sound thì lịch sử/draft ra sao | ✅ **ĐÃ CHỐT (§39):** commit cũ giữ nguyên mapping, phát không được thì rơi về nhạc cụ + UI báo rõ; draft chọn **phương án (b)** — không sửa draft, phân giải lúc phát (J.2) |
| J3 | File dùng chung giữa chủ sound và người fork | ✅ **ĐÃ CHỐT (§39): theo hướng người dùng** — 1 file dùng chung + chủ chọn **"xoá cho bản thân"** (xoá mềm) hoặc **"xoá hoàn toàn"** (xoá cứng) + tự dọn khi hết tham chiếu của người khác (J.3) |
| J4 | Hạn mức tổng mỗi người | ✅ **ĐÃ CHỐT 04/10/2026 (§66): 50MB/người**, lưu ở `platform_settings.custom_sound_quota_bytes` (mặc định 52428800), sound đã "xoá cho bản thân" không tính. **Không** phân biệt Free/STAVE+. **Việc sau:** admin chỉnh con số này trong giao diện admin — chưa có màn admin cho `platform_settings`, phải làm khi xây phần admin (§66.6) |
| J5 | Định dạng + kiểm tra phía server | ✅ **Chốt tạm (người dùng):** UC-118 dùng lại pipeline WAV mono 44.1 kHz của Audio Sketch (§33); upload nhận WAV/MP3 (BR-60); server đọc header audio để kiểm 30 giây |
| J6 | Hạ tầng khi 1GB đầy (Supabase Pro / Cloudflare R2) | ⏸ Chưa bàn — chỉ gấp khi dung lượng thật gần đầy |
| J7 | Xếp lịch (Report 2 không có Custom Sound) | ✅ **Người dùng tự sửa lịch sau**, gộp vào đợt sửa tài liệu (A7) |
| J8 | Cách phát âm | ✅ **Chốt (người dùng):** 1 sound ↔ **1 cao độ trên 1 track**, phát nguyên mẫu kiểu pad trống — KHÔNG phải nhạc cụ đổi cao độ theo phím |

#### J.1 Mapping nằm trong snapshot (J1) — ✅ ĐÃ CHỐT §39

**Bảng `sound_mappings` hỏng ở đâu — 5 tình huống cụ thể**, tất cả đều do khoá của bảng là `project_id` chứ không phải commit/nhánh:

1. **Nhánh:** `main` map `kick.wav` vào C2 của track Drums; nhánh `thu-nghiem` muốn map `clap.wav` vào đúng C2 đó. `UNIQUE(project_id, track_id, pitch)` chỉ cho 1 dòng → sửa ở nhánh này là đổi luôn nhánh kia. Trái mô hình "mỗi nhánh 1 hướng phối riêng".
2. **Khôi phục (UC-46):** commit v1 dùng kick, sau đó đổi sang clap rồi commit v2. Khôi phục v1 → nốt quay về v1 nhưng C2 **vẫn phát clap** vì bảng không có lịch sử. Bản khôi phục nghe sai mà không ai biết.
3. **So sánh (UC-45):** không thể báo "C2: kick → clap" vì không có bản cũ nào để so.
4. **Merge (UC-51/86):** merge 3 chiều chạy trên snapshot; mapping nằm ngoài snapshot thì không được merge, và 2 nhánh map khác nhau cùng 1 cao độ không bao giờ bị phát hiện là xung đột.
5. **Draft:** UC-57 POST-3 nói mapping "captured in the next commit" — tức phải nằm trong draft chờ commit. Bảng ghi thẳng xuống DB lúc bấm map, bỏ qua draft.

⇒ Bảng này **trái BR-62** và trái CLAUDE.md 4.1 ("1 commit = 1 JSON document").

**Hình dạng đề xuất** — đặt trong từng track, không phải mảng phẳng ở gốc như `notes[]`:

```json
"tracks": [{
  "id": "…", "name": "Drums", "instrument": "…", "volume": 1, "pan": 0, "…": "…",
  "soundMap": { "36": "<custom_sound_id kick>", "38": "<custom_sound_id snare>" }
}]
```

Lý do chọn dạng object trong track:
- **Khoá JSON là duy nhất** → tự đảm bảo "1 cao độ trên 1 track chỉ có 1 sound" (UC-57 Alt 4.1 "thay thế"), không cần ràng buộc riêng.
- **Xoá track là mapping đi theo**, không có mapping mồ côi.
- **Mapping là cài đặt của track** (cùng loại với instrument/volume/pan, BR-33) — tối đa 128 mục mỗi track, không phải dữ liệu hàng nghìn phần tử cần diff theo id như `notes[]`. Diff/merge xử lý như một thuộc tính track: so từng khoá, báo "thêm / gỡ / đổi sound ở cao độ X".
- Khoá là chuỗi (JSON bắt buộc), phải validate là số nguyên 0..127.

**`schemaVersion` 2 → 3:** commit cũ bất biến, **không migrate**. Code đọc coi thiếu `soundMap` là `{}`.

**Checklist chỗ phải sửa khi code** (đã grep thật 16/09/2026 — bỏ sót 1 chỗ là mapping biến mất âm thầm):
- ⚠️ **`backend/src/main.ts` dùng `ValidationPipe({ whitelist: true })`** → trường nào không khai decorator class-validator trong DTO sẽ bị **xoá âm thầm** khỏi body. Phải thêm `soundMap` (có validate) vào **cả 3 DTO**: `commits/dto/create-commit.dto.ts`, `drafts/dto/update-draft.dto.ts`, `branches/dto/switch-branch.dto.ts`. Quên 1 cái là autosave/commit/chuyển nhánh lặng lẽ xoá mapping.
- Chỗ **chép snapshot bằng cách liệt kê tay từng trường**: `branches.service.ts` `normalizeSnapshot`, `commits.service.ts` (khối dựng `tracks` quanh dòng 745-765), `merge.service.ts` (dựng snapshot kết quả, quanh dòng 350 và 573).
- `diff.service.ts` (`isTrackModified` + báo chi tiết), `merge.service.ts` (phát hiện xung đột mapping cùng track+cao độ), `shared-types` (`DraftTrack.soundMap?`, `DRAFT_SCHEMA_VERSION = 3`).
- Frontend: engine phát nhạc (cao độ có mapping → phát buffer sound thay vì nhạc cụ), `components/project/commit-compare.tsx` (`trackFieldChanges`), `components/midi-editor/redesign/change-summary.ts`, `lib/midi-exporter.ts` (BR-37: cảnh báo MIDI không mang được custom sound).
- **Nợ có sẵn phải dọn TRƯỚC khi tăng version**: nhiều chỗ vẫn ghi cứng `schemaVersion: 1` cho snapshot rỗng hoặc fallback `?? 1` (`branches.service.ts` `getEmptySnapshot`/`normalizeSnapshot`, `commits.service.ts` ~729/751, `merge.service.ts` ~350/573/713), trong khi version thật hiện là 2 (tăng từ UC-34). Hiện chưa chỗ nào đọc rẽ nhánh theo version nên chưa lỗi, nhưng tăng lên 3 mà không dọn thì số version mất ý nghĩa.
- **Bảng `sound_mappings`**: không còn là nguồn dữ liệu. Đề xuất **dùng lại làm bảng chỉ mục tham chiếu** (xem J.3) thay vì xoá.

#### J.2 Xoá sound thì draft và lịch sử ra sao (J2) — ✅ ĐÃ CHỐT §39: commit giữ nguyên, draft theo phương án (b)

- **Lịch sử (commit):** mapping nằm trong snapshot bất biến → commit cũ tự giữ nguyên mapping, đúng BR-63 mà không cần làm gì. Khi file không còn phát được: engine rơi về nhạc cụ của track (UC-57 5.E1 đã mô tả đúng hành vi này) và UI ghi rõ "sound đã bị xoá" (BR-63 "the system states this").
- **Draft — vấn đề thật:** mỗi nhánh có 1 draft riêng. UC-59 POST-2 đòi "gỡ mọi mapping". 2 cách:
  - **(a) Sửa draft của mọi nhánh mọi project** có dùng sound. **Có lỗi race thật:** nếu editor đang mở project đó, nó giữ snapshot cũ trong bộ nhớ và lần autosave kế tiếp (`PUT /projects/:id/draft` ghi đè TOÀN BỘ snapshot) sẽ **ghi mapping trở lại**. Muốn đúng phải thêm cơ chế báo editor nạp lại — phức tạp.
  - **(b) Không sửa draft nào — phân giải lúc phát** — ✅ **NGƯỜI DÙNG CHỌN (§39)**: mapping trỏ tới sound không còn phát được thì coi như "tắt", nốt rơi về nhạc cụ; editor hiện cảnh báo trên track + nút "gỡ mapping". Không race, không phải quét dữ liệu, và hợp tự nhiên với mô hình xoá mềm ở J.3.
  - Chọn (b) thì phải **sửa chữ UC-59**: POST-2 "every mapping … is removed" → "every mapping becomes inactive and the notes fall back…"; Exception 2.E1 (không gỡ được mapping ở project không sở hữu) không còn cần.

#### J.3 Mô hình 1 file dùng chung + xoá mềm/xoá cứng + dọn khi hết tham chiếu (J3) — ✅ ĐÃ CHỐT §39 theo hướng người dùng

**Người dùng chốt từng điểm (§39):** làm theo hướng H3; "đang dùng" chỉ tính project của người khác; bảng chỉ mục, RPC atomic, thứ tự xoá DB → file: đồng ý như phân tích; **quyền riêng tư: chủ sound được CHỌN "xoá cho bản thân" hoặc "xoá hoàn toàn"** — vừa là quyền của người dùng, vừa bảo vệ bản quyền khi họ không muốn công khai sound nữa; file giữ cho người fork **không tính** vào hạn mức của chủ; tài liệu sửa sau (J.4).

Phân tích gốc (giữ nguyên để hiểu lý do):

**Các hướng có thể làm:**

| Hướng | Cách làm | Được | Mất |
|---|---|---|---|
| H1. Tham chiếu chung, xoá là xoá thật | Fork trỏ tới đúng file gốc; chủ xoá → xoá file | Đơn giản nhất, 1 file | Bản fork **mất tiếng** ngay khi chủ xoá |
| H2. Copy khi fork | Lúc fork, sao chép mọi file được map sang thư viện người fork | Bản fork độc lập hoàn toàn | Tốn storage theo số lần fork; fork chậm (copy file); thư viện "riêng tư" của người fork chứa sound họ không tải lên; chủ không thu hồi được bản copy |
| **H3. Đề xuất của người dùng** | 1 file; chủ xoá → **ẩn/vô hiệu với chủ**, file còn cho người fork; khi **không còn project nào của người khác tham chiếu** → xoá hẳn | 1 file; fork không mất tiếng; chủ vẫn thấy "đã xoá" | Phải theo dõi tham chiếu + có tiến trình dọn; các lưu ý bên dưới |

**Kết luận: H3 khả thi.** Không có lỗi thiết kế nào chặn, nhưng **bắt buộc** giải quyết 7 điểm sau, nếu không sẽ sinh lỗi thật:

1. **"Đang dùng" nghĩa là gì — phải định nghĩa chính xác.** Một sound có thể được tham chiếu ở: draft của mọi nhánh, và **mọi commit** (bất biến, gồm cả lịch sử fork chép từ bản gốc theo BR-43).
   - Nếu tính **cả commit của chính chủ sound** → commit cũ của chủ không bao giờ mất → **file không bao giờ bị xoá** dù chủ đã bấm xoá. Sai ý định.
   - **Quy tắc (ĐÃ CHỐT):** file được giữ khi còn **ít nhất 1 tham chiếu (draft HOẶC commit) từ project mà chủ project KHÁC chủ sound**. Tham chiếu từ project của chính chủ sound không giữ file sống.
   - **Quy tắc phát:** sound phát được trong project P ⇔ dòng `custom_sounds` còn tồn tại **VÀ** (`deleted_at IS NULL` **HOẶC** chủ của P ≠ chủ sound). Với chủ sound, mọi project của họ rơi về nhạc cụ ngay khi bấm xoá, đúng cảm giác "đã xoá".
2. **Cần bảng chỉ mục tham chiếu** — không thể quét JSONB mỗi lần. Hỏi "sound X đang được dùng ở đâu" cần cho 4 việc: UC-58 hiện trạng thái "đang map", UC-59 liệt kê project bị ảnh hưởng, **phân quyền cấp signed URL** (chỉ cấp cho người đọc được 1 project có tham chiếu sound), và tiến trình dọn. Quét toàn bộ snapshot của mọi draft + commit mỗi lần là O(toàn bộ dữ liệu).
   - Đề xuất **dùng lại bảng `sound_mappings`** thành chỉ mục phái sinh (không phải nguồn dữ liệu): thêm `branch_id` (tham chiếu từ draft) / `commit_id` (tham chiếu từ commit), bỏ `UNIQUE(project_id, track_id, pitch)`, các khoá ngoại tới branch/commit/project `ON DELETE CASCADE` để xoá nhánh/project tự dọn chỉ mục.
   - Phải cập nhật chỉ mục ở **mọi đường ghi snapshot**: autosave draft, tạo commit, khôi phục, merge, chuyển nhánh, tạo nhánh (gieo draft), fork. Bỏ sót 1 đường là chỉ mục sai → hoặc xoá nhầm file còn dùng, hoặc từ chối cấp quyền nghe.
3. **Atomic — supabase-js không có transaction nhiều câu lệnh.** Việc dọn ("kiểm còn tham chiếu không → xoá dòng") và việc fork ("chép snapshot → thêm tham chiếu") chạy đồng thời có thể giẫm nhau: fork thêm tham chiếu đúng lúc dọn vừa kiểm xong → xoá mất file bản fork vừa dùng. **Phải viết thành hàm Postgres gọi qua RPC** (khoá dòng `custom_sounds` bằng `FOR UPDATE` khi dọn, `FOR SHARE` khi fork thêm tham chiếu), không làm nhiều lệnh rời rạc từ NestJS.
4. **Thứ tự xoá: dòng DB trước, file storage sau, cộng quét định kỳ.** Khoá ngoại DB **không xoá được file trong Storage**. Xoá file trước mà xoá dòng lỗi → dòng trỏ vào file không tồn tại (hỏng). Xoá dòng trước mà xoá file lỗi → chỉ còn file mồ côi, vô hại → cần 1 tác vụ quét định kỳ so danh sách object trong bucket với các dòng còn tồn tại.
5. **Quyền riêng tư & pháp lý — rủi ro lớn nhất của H3.** UC-118 cho ghi âm bằng micro → sound có thể là **giọng nói thật** của người dùng. Bấm "xoá" mà file vẫn phục vụ người khác thì:
   - **Chữ trên UI phải nói thật**, VD: "Sound sẽ bị gỡ khỏi thư viện và các dự án của bạn. Các bản fork của người khác đang dùng sound này vẫn giữ lại." Không được ghi "đã xoá vĩnh viễn".
   - ✅ **ĐÃ CHỐT §39 — chủ sound có 2 lựa chọn khi xoá:**
     - **"Xoá cho bản thân"** (xoá mềm, `deleted_at`): biến mất khỏi thư viện + vô hiệu trong mọi project của chủ; bản fork của người khác vẫn nghe được; file tự xoá hẳn khi không còn project nào của người khác tham chiếu.
     - **"Xoá hoàn toàn"** (xoá cứng): xoá dòng + file ngay, **bỏ qua mọi tham chiếu**; bản fork của người khác cũng rơi về nhạc cụ của track. Trước khi xác nhận phải báo có bao nhiêu project của người khác đang dùng và sẽ mất tiếng. Dùng khi người dùng muốn thu hồi hẳn (quyền riêng tư, bản quyền, không muốn công khai nữa).
   - **Ngoài ra, hệ thống luôn xoá cứng (bỏ qua tham chiếu)** — bản fork rơi về nhạc cụ: (i) **xoá tài khoản** UC-17 ("permanently delete … associated data") và admin xoá user UC-99; (ii) **admin gỡ nội dung vi phạm** UC-102 (VD khiếu nại bản quyền). Hiện `custom_sounds.owner_id … ON DELETE CASCADE` → xoá tài khoản sẽ xoá dòng (đúng hướng xoá cứng) **nhưng bỏ lại file mồ côi** trong storage (điểm 4).
   - Nên gắn với **license của project** (Bible 20.2: CC-BY / CC-BY-SA / CC-BY-NC chọn lúc publish): người fork một project công khai được dùng nội dung theo license đó → giữ file cho họ có cơ sở. Vẫn nên cân nhắc kỹ với sound ghi âm giọng nói.
6. **Hạn mức (khi đặt sau này, J4):** file đã "xoá cho bản thân" nhưng còn giữ cho người fork **không tính** vào hạn mức của chủ — ✅ người dùng đồng ý (§39).
7. **Tài liệu phải sửa:** xem danh sách đầy đủ ở **J.4** (người dùng gộp sửa sau).

**MÔ HÌNH ĐÃ CHỐT (J1 + J2 + J3, §39):**
- Mapping trong `tracks[].soundMap` của snapshot (`schemaVersion` 3).
- `custom_sounds.deleted_at` cho "xoá cho bản thân"; nút "xoá hoàn toàn" xoá cứng ngay, có cảnh báo số project của người khác bị ảnh hưởng.
- `sound_mappings` đổi vai thành **chỉ mục tham chiếu phái sinh** (thêm `branch_id`/`commit_id`, bỏ unique theo project), cập nhật ở mọi đường ghi snapshot.
- Không sửa draft khi xoá sound; phân giải lúc phát theo quy tắc ở điểm 1.
- Dọn file bằng hàm Postgres (RPC, khoá dòng) khi xoá sound/project/nhánh + quét định kỳ file mồ côi; xoá dòng DB trước, file sau.
- Luôn xoá cứng khi xoá tài khoản (UC-17/99) và admin gỡ vi phạm (UC-102).
- File giữ cho người fork không tính vào hạn mức của chủ.

#### J.4 Danh sách sửa tài liệu cho mô hình đã chốt (người dùng gộp sửa sau — A8)

Report 3 (trích nguyên văn chỗ cần đổi để dễ tìm):

| Chỗ | Hiện đang ghi | Cần đổi thành (ý) |
|---|---|---|
| **UC-59** Trigger / Description | Một lựa chọn "Delete"; *"Removes an uploaded sound from the user's library"* | 2 lựa chọn: **"Remove from my library"** (xoá cho bản thân) và **"Delete permanently"** (xoá hoàn toàn) |
| **UC-59 POST-1** | *"The sound is removed from the library and its stored file is deleted."* | Xoá cho bản thân: gỡ khỏi thư viện, file bị xoá hẳn khi không còn project nào của người dùng khác dùng. Xoá hoàn toàn: file bị xoá ngay |
| **UC-59 POST-2** | *"Every mapping of that sound is removed, and the affected notes fall back to their track's instrument."* | Mapping **không bị gỡ khỏi dữ liệu** mà trở nên **không hoạt động** trong các project của chủ sound (và trong mọi project nếu xoá hoàn toàn); nốt rơi về nhạc cụ; editor báo và cho phép tự gỡ mapping |
| **UC-59 POST-3** | Commit cũ giữ mapping nhưng không nghe được | Giữ ý; bổ sung: project của người khác vẫn nghe được, trừ khi chủ chọn xoá hoàn toàn |
| **UC-59 Normal Flow** bước 2-5 | Xác định project đang map → xác nhận → *"removes the mappings, deletes the stored file"* | Thêm bước chọn 1 trong 2 kiểu xoá; câu xác nhận nói rõ bản fork của người khác có giữ hay không; bỏ hành động "removes the mappings" |
| **UC-59 Alternative Flows** | Chỉ có 3.1 (không map ở đâu) và 4.1 (huỷ) | Thêm luồng **xoá hoàn toàn**: báo số project của người dùng khác bị ảnh hưởng, xác nhận riêng |
| **UC-59 Exception 2.E1** | *"mapped in a project the user no longer owns … cannot be removed … contact the project owner"* | **Bỏ** — mô hình mới không gỡ mapping ở project không sở hữu |
| **UC-59 Exception 5.E1** | Lỗi server thì giữ nguyên cả file và mapping | Giữ ý; thêm: xoá dòng thành công mà xoá file lỗi thì file được quét dọn sau, người dùng không bị ảnh hưởng |
| **BR-61** The Sound Library Is Personal | Thư viện riêng, người khác không duyệt được | Giữ; thêm: người khác vẫn **nghe** được sound khi nó được map trong project họ có quyền đọc (collaborate/fork) — nghe được ≠ duyệt được thư viện |
| **BR-62** Custom Sound Mapping Is Project State | Mapping nằm trong commit, đi theo fork; collaborator nghe được | Giữ; thêm: người fork cũng nghe được; mapping thuộc riêng từng nhánh |
| **BR-63** Deleting a Sound Leaves History Intact | Xoá sound gỡ khỏi mọi project; commit cũ giữ mapping nhưng không nghe được | Viết lại theo 2 kiểu xoá + quy tắc "chỉ tính project của người khác" + file tự dọn khi hết tham chiếu |
| **UC-58** POST-1 / Alt 3.1 | Trạng thái "đang map" | Trạng thái tính theo nhánh/commit của project; sound đã "xoá cho bản thân" không hiện trong thư viện |
| **UC-57** Exception 4.E1 | *"The mapping cannot be stored because of a server error"* | Mapping lưu vào **draft** chờ commit — lỗi lưu là lỗi autosave draft, không phải lỗi ghi riêng mapping |
| **UC-17** Delete account, **UC-99** Remove user account | Xoá dữ liệu liên quan | Thêm: custom sound của người đó bị **xoá hoàn toàn**, bản fork của người khác rơi về nhạc cụ |
| **UC-102** Remove violating project | Gỡ project vi phạm | Thêm: admin xoá hoàn toàn được custom sound vi phạm (VD khiếu nại bản quyền) |
| **3.1.5 ERD + bảng Entities Description** | `sound_mappings` là bảng mapping theo project | `sound_mappings` = **chỉ mục tham chiếu** (thêm `branch_id`/`commit_id`, bỏ unique theo project); `custom_sounds` thêm `deleted_at`. Cập nhật cả hình ERD |
| **Hạn mức** (khi đặt) | BR-60 chỉ giới hạn từng file | Nếu thêm quota: file đã "xoá cho bản thân" không tính vào hạn mức |

Report 2: thêm Custom Sound vào lịch (A7).

---

### K. TESTING + REPORT 5 — CÔNG CỤ ĐỀ XUẤT, YÊU CẦU TEMPLATE (ghi 16/09/2026, viết lại 08/10/2026 ở §68)

> Đây vẫn là **đề xuất của Claude**, nhóm **chưa chốt** bộ công cụ (CLAUDE.md §5). Khi nhóm chốt, ghi lại ở đây và ở CLAUDE.md.

Hiện trạng thật (08/10/2026): backend **đã cài** `jest ^30`, `ts-jest ^29`, `@nestjs/testing ^11`, `supertest ^7` (`npm test --workspace=backend`, `testRegex .*\.spec\.ts$`; e2e: `test/jest-e2e.json`, `testRegex .e2e-spec.ts$`). Test thật mới có **1 file**: `backend/src/custom-sounds/wav-info.spec.ts`; còn lại là 2 file mẫu NestJS (`app.controller.spec.ts`, `test/app.e2e-spec.ts`). Frontend **chưa cài gì**. CI (`.github/workflows/ci.yml`) chỉ build + lint, **chưa chạy test**. Backend **chưa có Socket.IO** (Jam/Collaboration còn To Do).

#### K1. Report 5 gồm 3 file (`docs/`), StudentGuide SEP490 Fall 2023

| File | Nội dung bắt buộc |
|---|---|
| `Report5_Test Documentation.docx` | I. Record of Changes. II.1 Scope (feature/NFR test và không test, các mức Unit/Integration/System kèm in-charge, input/time, focus, acceptance criteria, constraints/assumptions). II.2.1 Testing Types (mỗi loại: **objective / technique / completion criteria**). II.2.2 ma trận Test Type × Level (Unit/Integration/System/Acceptance). II.2.3 Supporting Tools (Purpose/Tool/Vendor/**Version**). II.3.1 Human Resources, 3.2 Test Environment, 3.3 Milestones. II.4 Test Cases (trỏ sang 2 file xls). II.5 Test Reports (kết quả, thống kê, phân tích) |
| `Report5_Unit Test.xls` | Sheet Guideline/Cover/Functions/Statistics + **mỗi hàm 1 sheet**: ma trận Condition (precondition + giá trị input) × Confirm (Return / Exception / Log message), mỗi cột 1 `UTCIDxx`, loại **N/A/B** (Normal/Abnormal/Boundary), P/F, ngày chạy, Defect ID (`DFIDxxx`), số LOC, định mức "Normal number of TC/KLOC" (mặc định 100, nhóm tự đặt được, giải thích nếu thiếu) |
| `Report5_Test Report.xlsx` | Dùng cho **IT, ST, AT**. Sheet Cover / Test Cases (danh sách function + môi trường) / Test Statistics + **mỗi feature 1 sheet**: Test Case ID, Description, Procedure, Expected Results, Pre-conditions, **3 vòng** (Passed/Failed/Pending/N/A + ngày + tester) |

- Lịch theo StudentGuide: tuần 5 nộp Report 5 **trừ II.4–II.5**; tuần 7/9/11 (mỗi Software Package) cần **UT + IT + Defects List**; tuần 13 cần **ST + IT + Defects List**. Testing = 18% OGA + 10% TDA.
- **"Test coverage" trong template = tỉ lệ test case đã chạy** ((Passed+Failed)/(Total−N/A)), "Test successful coverage" = Passed/(Total−N/A). Không phải code coverage. Code coverage của Jest/Vitest chỉ là số liệu phụ cho II.5.
- Defects List lấy theo sheet Defects của `Report3_Project Tracking` (StudentGuide III.2.2).

#### K2. Công cụ theo từng loại test (đề xuất 08/10/2026)

| Loại | Công cụ | Ghi chú / bắt đầu từ đâu |
|---|---|---|
| Unit backend | **Jest + ts-jest + `@nestjs/testing`** (có sẵn) | Logic thuần: `commits/diff.service.ts` (`calculateBarNumber`, `isNoteModified`, `soundMapsEqual`…), phát hiện conflict trong `merge/merge.service.ts`, `readWavInfo`, `common/utils`, 3 guard. Mock `SUPABASE_ADMIN_CLIENT` bằng `overrideProvider`. `jest 30` + `ts-jest 29`: để ý khi nâng version |
| Unit frontend | **Vitest + React Testing Library + jsdom** (+ MSW nếu test component gọi API) | Chỉ hàm thuần: `midi-parser` (có case lọc ký tự NUL), `midi-exporter`, `wav-encoder`, `error-message`, `format-date`, `avatar-color`, `collectSoundIds`, `change-summary`. **Không** unit test Tone.js/Web Audio/canvas piano roll, để cho Playwright |
| API / Integration | **Supertest** (có sẵn, khởi động `AppModule` thật) + **Postman/Newman** (test tay có ảnh chụp cho báo cáo, chạy lại bằng CLI) | Đi qua `ValidationPipe` + 2 guard (JWT + `X-Session-Id`). Cần 1 helper đăng nhập dùng chung (tạo user test, lấy JWT + session) |
| DB / RLS | **pgTAP** (`supabase test db`) | Chứng minh `commits`/`admin_audit_log` không UPDATE/DELETE được, client không ghi `transactions`/`subscriptions` |
| System / E2E | **Playwright** (+ `@axe-core/playwright` cho accessibility, `toHaveScreenshot` cho hồi quy giao diện) | Không xác nhận được có nghe thấy âm thanh (CLAUDE.md §10) |
| Performance | **k6** (API: autosave, commit, merge), **Lighthouse** (trang) | |
| Security | **OWASP ZAP** baseline, `npm audit`, gitleaks (đã có) | |
| Compatibility | Playwright chromium/firefox/webkit, nhiều viewport | Web MIDI chỉ Chromium, ghi vào Constraints |
| Acceptance | Test tay theo checklist trong Test Report.xlsx (vòng 3), GVHD/"khách hàng" chạy | |
| Defect | **GitHub Issues** (label `bug`), xuất sang sheet Defects | Lấy mã `DFID` điền vào Unit Test.xls |
| CI | Thêm `npm test` vào `ci.yml` | CI `rm -f package-lock.json && npm install` → dependency test phải nằm trong `package.json` đã commit (CLAUDE.md §10) |

**Ma trận Test Level đề xuất (II.2.2):** Functional: Unit/Integration/System/Acceptance. UI/Usability: System/Acceptance. Security (authz, RLS): Integration/System. Performance: Integration/System. Compatibility: System. Regression: Unit/Integration/System.

**DB cho integration test (sửa so với bản 16/09):** bản cũ ghi "Supabase CLI local, dựng DB từ migration" — **không làm được với repo hiện tại**. DB thật có **34 migration** (tra `list_migrations` 08/10/2026, từ `01_extensions_and_enums` 26/08 tới `sound_mappings_index_from_snapshot` 04/10), nhưng `backend/supabase/migrations/` chỉ chứa **2 file cuối**. Hai hướng: (a) tạo 1 Supabase project miễn phí riêng (vd `stave-test`) rồi chép schema bằng `supabase db dump` → restore; (b) kéo đủ lịch sử migration về repo (`supabase db pull`) rồi `supabase start` local bằng Docker. Chưa chọn. Dù chọn hướng nào cũng **không bao giờ ghi dữ liệu test vào `gwbiwweeznbuqfgawywv`**: `commits` không xoá được, test sẽ để rác vĩnh viễn.

Đặt tên test trùng mã test case trong xls (`it('UTCID01 …')`, `test('PRJ-05 …')`) để đếm Passed/Failed từ kết quả JSON của Jest/Playwright, không phải gõ tay. Test tự động vẫn phải ghi vào xls, cột Procedure ghi `Automated – <đường dẫn file spec>`.

#### K3. Phần nào tự động, phần nào test tay

- **Tự động hoàn toàn:** unit backend/frontend; validation input (commit message > 200, tag > 30, tick âm/lẻ, `soundMap` sai); phân quyền (401/403, session đã thu hồi); luồng API (tạo project sinh `main`, autosave đúng branch đang mở, commit/restore/branch/switch/merge/xoá); RLS (pgTAP); luồng UI theo kịch bản (login email, project CRUD, visibility, Explore/Rankings, theme, sessions, admin suspend); editor: import `.mid` rồi kiểm snapshot, export `.mid` rồi parse lại file, commit/history/hộp conflict; hồi quy ảnh; axe; k6/Lighthouse; ZAP/npm audit; 3 trình duyệt.
- **Bán tự động** (máy kiểm kỹ thuật, người kết luận):
  - Playback: tự động kiểm không exception, `AudioContext.state`, request sample 200; người kiểm nghe đúng nhạc cụ, cao độ, nhịp.
  - Export WAV: tự động kiểm header, độ dài, RMS > 0; người nghe có méo, thiếu track không.
  - Ghi âm sketch: Chromium `--use-fake-device-for-media-stream --use-file-for-fake-audio-capture=x.wav`; micro thật và từ chối quyền thì test tay.
  - Custom sound: tự động kiểm upload, hạn mức, `soundMap`, fallback; người nghe phát đúng mẫu.
  - Email xác thực/reset: link lấy qua `auth.admin.generateLink` (hoặc Mailpit nếu chạy local); thư thật tới hộp thư thì test tay.
  - Kéo/resize note: `mouse.down/move/up` theo toạ độ canvas; cảm giác thao tác thì test tay.
  - RAM/FPS editor: `performance.memory` qua CDP.
  - Ảnh chuẩn theme: lần đầu cần người duyệt.
- **Bắt buộc test tay:** chất lượng âm thanh (độ trễ Play, metronome khớp nhịp, loop); Google OAuth (Google chặn trình duyệt tự động); thiết bị thật (iOS Safari, mobile, MIDI phần cứng nếu có); usability/UAT; exploratory (2 tab cùng sửa, mất mạng giữa autosave…); bước trả tiền thật trên sandbox PayOS khi có (webhook thì tự động được bằng payload có chữ ký).

Report 3 §4.2.2 đã cam kết mục tiêu tỉ lệ lỗi: ≤5% ở unit test logic lõi, ≤8% integration, ≤10% system, ≤5% acceptance.

---

## §37 — PR #32 đã merge, phát hiện commit F7 bị sót; chốt loạt quyết định; code UC-45 Compare + UC-50 Branch history + sửa 4 bug (16/09/2026)

**Bối cảnh:** Người dùng tách 67 thay đổi thành các commit theo kế hoạch Claude soạn (10 commit B1→F7), mở PR #32, đã merge. Yêu cầu phiên này: (1) kéo `main` mới nhất; (2) xác nhận âm thanh đã nghe bình thường từ vài phiên trước; (3) xếp lại ưu tiên KHÔNG bám lịch Report 2, chỉ trong phạm vi module Sprint 4 + phần Sprint 5 đã làm sớm; (4) gợi ý công cụ unit test (người dùng tự lên kế hoạch sau); (5) mọi việc sửa tài liệu ghi vào đây, làm sau; (6) phân tích kỹ các quyết định Custom Sound; (7) code tiếp việc ưu tiên cao nhất trong lúc người dùng tự kiểm tra giao diện; (8) cập nhật PROJECT_STATE + Bible chi tiết để làm "bộ nhớ" cho phiên sau, đỡ tốn token mô tả lại ngữ cảnh.

### 1. Sự cố git: commit F7 chưa từng được tạo

- Lúc bắt đầu, nhánh local `feature/ui-redesign-branch-switch-audio-sketch` còn **4 file staged chưa commit** (đúng 4 file của F7), trong khi PR #32 đã merge với 9 commit B1→F6. Kiểm tra: `git diff HEAD origin/main` rỗng (cây merge trùng nhánh), và không commit mới nào trên `origin/main` đụng 4 file đó → checkout sang `main` an toàn.
- Đã lưu patch dự phòng (`git diff --cached --binary` → `f7-backup.patch`, scratchpad) rồi `git checkout main && git pull origin main`: fast-forward `13fbe07 → 171292a`, 4 file F7 vẫn staged nguyên vẹn.
- Hệ quả: trên `main` hiện **thiếu** chuyển nhánh trong editor (UC-48 phía frontend), dải velocity, và việc gắn panel Audio Sketch vào editor. Backend UC-48 đã có trên `main` nhưng không gây lỗi vì `active_branch_id` chỉ đổi khi gọi `POST /branches/switch`, và chưa UI nào trên `main` gọi nó. Chi tiết + lệnh commit gợi ý: mục 7 bên dưới và §36-G.

### 2. Quyết định chốt trong phiên (người dùng)

| Quyết định | Nội dung | Ghi ở đâu |
|---|---|---|
| Âm thanh | Nghe bình thường từ vài phiên trước — đóng bug câm tiếng §21/§23 | §36-B, §36-F |
| Lịch Report 2 | Chỉ là kế hoạch ban đầu, nhóm linh hoạt thời gian | §36-D |
| D1 | **Cách (a)**: làm UC-69 Fork trước Pull Request | §36-A3, §36-D |
| AI provider | **Gemini API** (đủ mạnh, có free tier để test). Nguyên tắc CLAUDE.md 4.4 giữ nguyên: rule-based quyết định kết quả, Gemini chỉ viết câu diễn giải | CLAUDE.md §2/§5/§7, Bible §46 |
| MP3 (UC-38) | Treo; nếu bỏ thì gom sửa tài liệu cùng đợt | §36-A5 |
| UC-79 | Xác nhận tạm chặn tới khi xong Subscription & Payment | §36-C |
| Tài liệu | Gom sửa một đợt sau, Claude chỉ ghi lại | §36-A, §36-E5 |
| Unit test | Người dùng tự lên kế hoạch sau | mục 6 bên dưới |

**Lưu ý khi triển khai Gemini** (Claude ghi theo hiểu biết hiện có — **phải tự kiểm tra lại điều khoản và hạn mức thật lúc code**, chúng thay đổi theo thời gian):
- Theo điều khoản Gemini API mà Claude biết, ở **gói miễn phí** Google có thể dùng nội dung gửi lên để cải thiện sản phẩm. Vì vậy BR-80 (chỉ gửi tóm tắt thay đổi + metadata, không gửi audio/sound/thông tin tài khoản) càng phải tuân thủ chặt. Cân nhắc gói trả phí trước khi mở cho người dùng thật.
- Free tier có giới hạn request/phút và /ngày theo từng model → cần cache kết quả + giới hạn tần suất ở backend (Bible §19.5 đã cảnh báo chi phí AI).
- Report 3 §4.2.2 "Degraded mode": Gemini lỗi/hết hạn mức thì bỏ qua phần AI, **không bao giờ chặn commit/merge**.
- Key `GEMINI_API_KEY` chỉ đặt ở Railway (backend). Không gọi Gemini từ frontend, không có biến `NEXT_PUBLIC_` nào cho nó.

### 3. Code: UC-45 Compare versions + UC-50 View branch history

Chọn làm trước vì: Report 3 đặt UC-45 Priority **High** ("the capability that distinguishes STAVE from simply keeping numbered copies of a file"); backend `GET /commits/diff` và `GET /branches/:id/history` đã có sẵn, chỉ thiếu UI; cả hai cùng nằm trong tab Commit nên làm chung; và **không đụng 4 file F7**, nên tách PR được sạch.

**Backend**
- `backend/src/commits/diff.service.ts`:
  - **[Bug] Số tick mỗi ô nhịp bỏ qua mẫu số nhịp** (`numerator * ppq`) → sai với mọi nhịp không phải x/4 (6/8 @480 ra 2880 thay vì 1440), và lệch với `MergeService.groupConflictsByBar` (vốn tính đúng) — cùng 1 note nằm ở ô nhịp khác nhau giữa màn Compare và màn xung đột. Sửa thành `ppq * (num/den) * 4`, cùng công thức với merge.
  - **[Bug] Đổi nhạc cụ không được coi là sửa track** — `isTrackModified` bỏ sót `instrument` (BR-33 ghi rõ gán nhạc cụ "appear in version comparisons"). Thêm `instrument` và `order`.
  - **[Bug] Đổi tempo/nhịp không được báo** — `areIdentical` so sâu cả snapshot nên trả `false`, nhưng không có trường nào nói đổi gì → UI sẽ hiện "có thay đổi" với 0 thay đổi. Thêm `metaChanges[]` (tempo, timeSignature, ppq).
  - **UC-45 3.E2**: track thêm/xoá nguyên cả track thì báo 1 dòng kèm `tracksDiff.noteCounts[trackId]`, các note của track đó KHÔNG còn nằm trong `changesByBar`/`summary.notes`. Note cũ (cùng id) bị chuyển sang track mới thêm vẫn được tính là **sửa**, không phải thêm (BR-28).
  - `areIdentical` **vẫn giữ** so sâu cả snapshot — `CommitsService` dùng nó cho BR-40 (chặn commit không có thay đổi), đổi ngữ nghĩa sẽ ảnh hưởng tạo commit.
- `backend/src/branches/branches.service.ts` — `getBranchHistory`:
  - Response thêm `author` và `tags` cho từng commit (UC-50 bước 4-5: hiện tác giả, gắn tag/so sánh/khôi phục "exactly as in the main history view").
  - **[Hiệu năng]** Bản cũ gọi `getAncestorIds` + `findMergeBase` = khoảng 3 lượt đi chuỗi, **mỗi commit 1 truy vấn**. Bản mới tải toàn bộ commit của project bằng 1 truy vấn rồi đi chuỗi cha trong bộ nhớ (khoảng 7 truy vấn cố định — nhánh, quyền, nhánh mặc định, danh sách nhánh, commit, tác giả, tag — bất kể lịch sử dài bao nhiêu). Tương đương về kết quả vì `commits.branch_id` là `ON DELETE CASCADE` (tra DB thật) → mọi commit còn tồn tại đều thuộc 1 nhánh còn tồn tại của project. Merge/details/delete-preview **chưa đổi** (§36-H).

**Frontend**
- `frontend/components/project/commit-compare.tsx` (mới): dialog so sánh. Tóm tắt số nốt thêm/xoá/sửa + số track; danh sách thay đổi meta và track (liệt kê từng thuộc tính đổi: tên, nhạc cụ, âm lượng %, pan, tắt tiếng, solo, màu, thứ tự); lưới piano-roll chỉ đọc bằng **SVG** tô màu thêm/xoá/sửa/không đổi (nốt sửa có viền nét đứt ở vị trí cũ); lọc theo track (bước 5); đảo chiều (Alt 5.1); 2 bản giống hệt → câu "không có thay đổi" thay vì lưới trống (3.E1); tải lỗi → nói rõ phiên bản nào không đọc được + nút thử lại (2.E1); danh sách chi tiết gom theo ô nhịp (CLAUDE.md 4.1); Esc để đóng. Dùng SVG thay canvas để màu lấy thẳng class token `fill-*`, đổi theme tự đổi theo (không cần `resolve-css-colors`). Diff do backend tính, frontend chỉ tải thêm 2 snapshot để vẽ nốt không đổi — không tính diff lần hai ở client.
- `frontend/components/project/commit-history.tsx` (viết lại): dropdown chọn nhánh (UC-50 Alt 1.1); mọi nhánh đọc qua `GET /branches/:id/history` để luôn thấy cả commit kế thừa (POST-1); badge **Riêng nhánh / Kế thừa** với nhánh không mặc định (bước 3); nhánh chưa có commit riêng → câu giải thích (2.E1); lỗi → nút Thử lại (2.E2); ô tích chọn tối đa 2 commit + nút So sánh; nút "So với mới nhất" trên từng commit (Trigger của UC-45); chỉ hiện thao tác so sánh khi có ≥ 2 commit (PRE-3). Khôi phục ghi vào **đúng nhánh đang xem**. Phân trang chuyển sang client vì endpoint lịch sử nhánh không phân trang.
- `frontend/components/project/branch-list.tsx`: thêm nút **"Lịch sử"** trên mỗi nhánh → `/projects/:id?tab=commits&branch=:branchId` (Trigger của UC-50).
- `frontend/app/projects/[id]/page.tsx`: truyền `?branch=` vào `CommitHistory` (có `key` theo nhánh để nạp lại sạch).
- `frontend/lib/api-client.ts`: `compareCommits`, `getBranchHistory` + type `SnapshotDiff`, `BranchHistory`, `BranchHistoryCommit`.
- **[Bug] `merge-conflict-dialog.tsx` hiện số ô nhịp lệch +1** — backend đã đánh số từ 1 (`Math.floor(start / ticksPerBar) + 1`) mà dialog lại `Number(bar) + 1`. Sửa hiện đúng `bar`.

### 4. Verify — mức đạt được, không làm tròn

- [x] `tsc --noEmit` backend sạch; `tsc --noEmit` frontend sạch; `eslint` các file frontend đã đổi sạch (có sửa 2 lỗi `react-hooks/set-state-in-effect` do chính code mới gây ra).
- [x] **Logic diff chạy thật** bằng 1 spec jest tạm (đã xoá sau khi chạy), dữ liệu nhịp 6/8 @480: nốt ở tick 1440 rơi đúng ô nhịp 2, tick 2880 rơi ô nhịp 3; 2 nốt của track bị xoá gom vào `noteCounts`, không nằm trong danh sách nốt; nốt chuyển sang track mới tính là sửa; đổi nhạc cụ → 1 track sửa; đổi tempo → `metaChanges`; 2 snapshot giống hệt → `areIdentical: true`.
- [x] Tên cột `commits` (`author_id`, `parent_commit_id`…) và `commit_tags` (`id`, `commit_id`, `name`) đối chiếu `information_schema` thật trước khi dùng (CLAUDE.md mục 10).
- [ ] **Chưa gọi API thật bằng tài khoản thật**, chưa bấm UI → UC-45/UC-50 ở mức **V1** (riêng logic diff V2). Danh sách bấm tay: §36-F mục 3-4.
- [ ] **Không chạy `next build`** — người dùng đang mở dev server để kiểm tra giao diện, build ghi đè `.next` sẽ làm hỏng dev server đang chạy (quy tắc mới §36-E6).

**Còn dở của UC-45/UC-50:**
- UC-45 bước 6 (nghe thử từng phiên bản trong màn so sánh) — chưa làm, phải tách engine phát nhạc khỏi editor.
- UC-50 bước 4 đòi hiện "change counts" (số thay đổi) của từng commit trong danh sách — chưa hiện (màn UC-43 cũ cũng chưa từng có). Tính sẵn sẽ tốn 1 phép diff/commit; muốn có nên cân nhắc lưu tóm tắt lúc tạo commit.

### 5. Phân tích mới (ghi chi tiết ở §36)

- **UC-82/83 Connect/Disconnect Google thuộc đích danh Iteration 1 nhưng chưa có code** — bản §36 cũ gộp nhầm vào nhóm Subscription/Notifications và ghi sai dải UC (AI là UC-70→72, không phải 70→77). Đã đính chính ở §36-C.
- **Bảng `sound_mappings` mâu thuẫn BR-62** (mapping phải nằm trong commit) — điểm quyết định số 1 của Custom Sound, §36-J.
- **Xoá nhánh cascade xoá commit**, có thể cắt cụt âm thầm lịch sử nhánh con — §36-H.
- **UC-33 có thể chưa đáp ứng Alternative flow dán sang project khác** — nghi vấn, cần audit (§36-I #6).

### 6. Gợi ý công cụ test (người dùng tự lên kế hoạch)

| Lớp | Công cụ | Ghi chú thực tế trong repo |
|---|---|---|
| Unit backend | **Jest + `@nestjs/testing`** | **Đã cài sẵn** (`npm test --workspace=backend`, `testRegex .*\.spec\.ts$`). Chỉ có 2 file mẫu NestJS, chưa có test thật. Nên bắt đầu từ logic thuần không cần DB: `DiffService`, 3-way merge + gom xung đột của `MergeService`, validate snapshot (BR-27), `SessionAuthGuard`. Mock `SUPABASE_ADMIN_CLIENT` bằng provider giả. ⚠️ `jest ^30` đi cùng `ts-jest ^29` — hiện vẫn chạy được (§37 đã chạy thật), lưu ý nếu gặp lỗi lạ khi nâng version |
| Integration / API backend | **Supertest** (đã cài) + **Supabase CLI chạy local bằng Docker** (`supabase start`) | **Không test ghi dữ liệu vào project Supabase thật** `gwbiwweeznbuqfgawywv` — dùng DB local dựng lại từ migration. Phù hợp mục "Integration test Version Control + Branch" của Report 2 |
| Unit frontend | **Vitest + React Testing Library + jsdom** | Chưa cài. Next.js có hướng dẫn chính thức cho Vitest. Ưu tiên hàm thuần: `lib/midi-parser.ts`, `lib/midi-exporter.ts`, `lib/wav-encoder.ts`, `components/midi-editor/redesign/change-summary.ts` |
| Mock API ở frontend | **MSW** (Mock Service Worker) | Test component gọi `api-client` mà không cần backend chạy |
| E2E | **Playwright** | Máy dev hiện chưa cài. Giới hạn đã ghi ở CLAUDE.md mục 10: xác nhận được network + JS, **không** xác nhận được có nghe thấy âm thanh |
| Coverage + CI | `jest --coverage` / `@vitest/coverage-v8`, chạy trong `.github/workflows/ci.yml` | CI hiện chỉ build + lint, chưa chạy test |

### 7. Lệnh git gợi ý (người dùng tự chạy — Claude không tự commit)

Staged (F7) và unstaged (§37) không dùng chung file → 2 nhánh, 2 PR riêng:

```powershell
# Nhánh 1 — F7 (chỉ commit phần đang staged)
git checkout -b feature/editor-branch-switch-velocity-lane
git commit -m "Add branch switching and velocity lane to MIDI Editor (UC-48)"
git push -u origin feature/editor-branch-switch-velocity-lane

# Nhánh 2 — §37 (phần unstaged đi theo khi checkout)
git checkout main
git checkout -b feature/compare-versions-branch-history
git add backend/src/commits/diff.service.ts
git commit -m "Fix bar length and report instrument, tempo and whole-track changes in diff"
git add backend/src/branches/branches.service.ts
git commit -m "Return authors and tags in branch history with a single commit query (UC-50)"
git add frontend/components/project/merge-conflict-dialog.tsx
git commit -m "Fix off-by-one bar number in merge conflict dialog"
git add frontend/lib/api-client.ts frontend/components/project/commit-compare.tsx frontend/components/project/commit-history.tsx frontend/components/project/branch-list.tsx ':(literal)frontend/app/projects/[id]/page.tsx'
git commit -m "Add version compare view and per-branch commit history (UC-45, UC-50)"
git status
git push -u origin feature/compare-versions-branch-history
```

### 8. Tiến trình nền

Không khởi động dev server/tiến trình nền nào trong phiên này (chỉ chạy `tsc`, `eslint`, 1 lần `jest`, đều tự kết thúc).

---

## §38 — Kéo `main` sau PR #33/#34; phân tích sâu Custom Sound + đánh giá mô hình xoá mềm của người dùng; ghi công cụ test; phát hiện bug file sketch mồ côi (16/09/2026)

**Bối cảnh:** người dùng tự tách + merge 2 PR theo lệnh ở §37-7: **PR #33** (`feature/compare-versions-branch-history`, UC-45/UC-50 + 3 bug) và **PR #34** (`feature/editor-branch-switch-velocity-lane`, commit F7 bị sót). Yêu cầu phiên: (1) kéo `main`; (2) ghi công cụ test vào PROJECT_STATE + Bible; (3) giải thích kỹ 3 điểm Custom Sound (mapping trong snapshot, xoá sound với draft/lịch sử, file dùng chung) và **đánh giá mô hình người dùng tự nghĩ**; ghi các quyết định còn lại; (4) cập nhật tài liệu; (5) trả lời: đọc file tài liệu dài 500 / 1000 / 1500 dòng tốn token khác nhau thế nào.

### 1. Git

- Nhánh local đứng ở `feature/compare-versions-branch-history`, working tree sạch. `git checkout main && git pull origin main`: fast-forward `171292a → 8c8b906` (12 file). Đã kiểm `velocity-lane.tsx` và `commit-compare.tsx` có mặt. Working tree sạch sau khi kéo.
- Sự cố F7 (§37) khép lại. §36-G đã cập nhật.

### 2. Quyết định người dùng chốt trong phiên

| Điểm | Quyết định | Ghi ở |
|---|---|---|
| Hạn mức Custom Sound | Quyết lúc làm thực tế; **không** phân biệt Free/STAVE+ — tinh thần cộng đồng, chỉ cá nhân hoá (theme custom UC-79) là tính phí | §36-J4 |
| Lịch Custom Sound | Người dùng tự sửa Report 2 sau, gộp đợt sửa tài liệu | §36-A7, J7 |
| Cách phát âm | Đúng ý: 1 sound ↔ 1 cao độ trên 1 track, kiểu pad trống | §36-J8 |
| Định dạng | Tạm theo hướng: UC-118 dùng pipeline WAV mono 44.1 kHz; server đọc header để kiểm 30 giây | §36-J5 |
| Công cụ test | Ghi lại để người dùng tự lên kế hoạch | §36-K, Bible §47 |

**Chưa chốt (chờ người dùng):** J1 mapping trong snapshot, J2 không sửa draft khi xoá sound, J3 mô hình xoá mềm. Phân tích đầy đủ ở §36-J.1→J.3 — không chép lại ở đây.

### 3. Tra cứu thật phục vụ phân tích (không phải suy đoán)

- `backend/src/main.ts`: `ValidationPipe({ whitelist: true, transform: true })` → trường không có decorator trong DTO bị xoá âm thầm. Là rủi ro số 1 khi thêm `soundMap` vào snapshot.
- Chỗ chép snapshot bằng tay từng trường: `branches.service.ts` `normalizeSnapshot`, `commits.service.ts` (~dòng 745-765), `merge.service.ts` (~350, 573).
- `schemaVersion`: `DRAFT_SCHEMA_VERSION = 2` (tăng từ UC-34, commit `eaaec95`), nhưng còn nhiều chỗ ghi cứng `1` hoặc fallback `?? 1`; chưa chỗ nào đọc rẽ nhánh theo version.
- Khoá ngoại DB thật: `custom_sounds.owner_id → users ON DELETE CASCADE`; `audio_sketches.project_id → projects ON DELETE CASCADE`; `projects.owner_id → users ON DELETE CASCADE`; `drafts.branch_id → branches ON DELETE CASCADE`.
- `ProjectsService.deleteOwned`, `AuthService.deleteAccount`, `AdminService.removeUser` **không gọi Storage** → phát hiện bug file sketch mồ côi (§36-H). **Chưa sửa** — phiên này người dùng yêu cầu cập nhật tài liệu, không yêu cầu code; đã xếp sửa cùng UC-117 (§36-I #2).

### 4. Kết luận đánh giá mô hình của người dùng (tóm tắt — chi tiết §36-J.3)

**Khả thi, không có lỗi thiết kế chặn**, với 7 điều kiện bắt buộc: định nghĩa "đang dùng" chỉ tính project của **người khác** (không thì file của chủ không bao giờ bị xoá vì commit cũ của chính họ); bảng chỉ mục tham chiếu (dùng lại `sound_mappings`) cập nhật ở mọi đường ghi snapshot; dọn file bằng hàm Postgres/RPC vì supabase-js không có transaction; xoá dòng DB trước, file sau, kèm quét định kỳ; **chữ UI nói thật** + **đường xoá cứng** cho xoá tài khoản và admin gỡ vi phạm (sound ghi âm có thể là giọng nói thật); không tính file đã "xoá" vào hạn mức; sửa UC-59/BR-61/62/63.

### 5. Câu hỏi về token khi đọc tài liệu dài

Số đo thật lúc ghi (trước khi thêm §38): `PROJECT_STATE.md` 1748 dòng / ~260 nghìn ký tự / ~304KB; `docs/STAVE_PROJECT_BIBLE.md` 1371 dòng / ~168 nghìn ký tự; `CLAUDE.md` 236 dòng / ~30 nghìn ký tự; riêng §36 ~200 dòng / ~20 nghìn ký tự. Trung bình ~120-150 ký tự/dòng, dòng dài nhất >1000 ký tự (bảng markdown). Câu trả lời cho người dùng ở phần trả lời chat, điểm chính ghi vào Bible §47.4 để các phiên sau áp dụng.

### 6. Tài liệu đã cập nhật

- PROJECT_STATE: §36 (A7 viết lại, thêm A8; B cập nhật trạng thái trên `main`; F bỏ ghi chú F7; G viết lại; H thêm bug file mồ côi + gotcha whitelist; I cập nhật #0/#1/#2/#4; C cập nhật UC-36 và Custom Sound; **J viết lại toàn bộ**; **thêm K** công cụ test), dòng hướng dẫn đọc đầu file, §38 này.
- Bible: mục 47 mới; mục 15.6 thêm con trỏ tới thiết kế Custom Sound.
- CLAUDE.md: mục 5 (Custom Sound — phần đã chốt/chưa chốt), mục 10 (2 gotcha mới: whitelist DTO, Storage không bị xoá theo khoá ngoại).

### 7. Verify / tiến trình nền

Phiên này không sửa code. Không chạy dev server, build hay tiến trình nền nào.

---

## §39 — Chốt thiết kế Custom Sound (J1-J3), tạm kết thúc chuỗi phiên 16/09/2026

**Bối cảnh:** người dùng đọc phân tích ở §38 và chốt. Phiên này chỉ cập nhật tài liệu, **không sửa code**.

**Quyết định** (chi tiết + lý do: §36-J):
- **J1 — mapping nằm trong snapshot** (`tracks[].soundMap`, `schemaVersion` 3); bảng `sound_mappings` không còn là nguồn dữ liệu.
- **J2 — commit cũ** giữ nguyên mapping, không phát được thì rơi về nhạc cụ và UI báo rõ; **draft theo phương án (b)**: không sửa draft khi xoá sound, phân giải lúc phát.
- **J3 — theo hướng người dùng:** 1 file dùng chung; "đang dùng" chỉ tính project của người khác; bảng chỉ mục tham chiếu; dọn file bằng RPC atomic; xoá dòng DB trước, file sau. **Bổ sung mới của người dùng:** chủ sound được chọn **"xoá cho bản thân"** (xoá mềm) hoặc **"xoá hoàn toàn"** (xoá cứng, cả bản fork cũng mất tiếng) — bảo vệ quyền riêng tư và bản quyền khi không muốn công khai nữa. File giữ cho người fork không tính vào hạn mức của chủ.
- **Sửa tài liệu:** danh sách từng chỗ ở §36-J.4 (A8), người dùng gộp sửa sau.
- **Bug file audio sketch mồ côi (§38):** người dùng chọn **tạm để đó**; hỏi lại khi làm UC-117.

**Tài liệu đã cập nhật:** §36 (header, A8, C, H, I, J.0→J.4), §39 này; Bible mục 47.2 (đổi thành đã chốt) + 47.5; CLAUDE.md thêm **4.8** (quy tắc khoá cho Custom Sound — code sau này phải tuân thủ nên đặt ở mục nguyên tắc) và rút gọn dòng Custom Sound ở mục 5.

**Trạng thái cuối chuỗi phiên:** `main` = `8c8b906`, working tree sạch, không tiến trình nền nào đang chạy. Việc kế tiếp theo §36-I: #2 UC-117, #3 UC-82/83 (cần bật manual linking trên Supabase trước), #4 UC-36.

---

## §40 — Điều tra RAM MIDI Editor (không phải do đợt thiết kế lại UI) + sửa bug import MIDI vỡ commit do byte NUL (17/09/2026)

**Bối cảnh:** người dùng nhận thấy RAM trình duyệt đo được ở giai đoạn debug âm thanh §21-§24 (1.6-1.7GB, gần như không đổi dù mở project nhẹ hay nặng) khác hẳn số đo hôm nay (sau đợt thiết kế lại UI §26-§39: <200MB lúc chưa mở gì, hơn 200MB một chút với project 2 track) — nghi vấn ban đầu là do đợt sửa UI, đã điều tra và loại trừ.

**1. Điều tra RAM — kết luận: KHÔNG phải do đợt thiết kế lại UI, do đặc tính cache đã có từ §21:**
- Đọc `frontend/lib/sample-buffer-cache.ts`: `bufferCache` là 1 `Map` cấp module, sống suốt vòng đời tab, **không giới hạn dung lượng, không có cơ chế xoá** — mọi sample đã `fetch()`+`decodeAudioData()` (PCM, nặng hơn nhiều lần file nén gốc) nằm lại trong bộ nhớ tới khi đóng/reload hẳn tab. File này đứng yên từ §21 tới nay, đợt UI (§26-§39) không đụng tới.
- Xác nhận bằng thực nghiệm theo yêu cầu người dùng (không đoán mò): mở project nặng (23 track/17 nhạc cụ) ở 1 tab mới → RAM ~1.6GB → điều hướng sang project 2 track rất nhẹ **trong cùng tab, không reload** → RAM **vẫn ~1.5GB, không tụt** — đúng dự đoán từ đọc code.
- **Kết luận:** RAM cao ở §21-§24 là do trong chuỗi phiên debug âm thanh lúc đó, project nặng bị Play đi Play lại rất nhiều lần trong cùng 1 tab (bisection, test Stop/Play liên tục...), nạp sẵn ~1.6GB vào cache và không bao giờ được giải phóng trong suốt phiên đó. Số đo hôm nay thấp hơn chỉ vì bắt đầu từ tab sạch chưa từng đụng file nặng, không phải vì code RAM đã được sửa.
- **Đề xuất đã bàn với người dùng, CHƯA CODE (để dành quyết định sau):** đổi `bufferCache` thành LRU có trần dung lượng (ước lượng ~300-400MB, tính bằng số kênh × số mẫu × 4 byte mỗi `AudioBuffer`) — vượt trần thì xoá bớt entry lâu không dùng, vẫn giữ lợi ích "1 URL chỉ tải 1 lần" trong phạm vi trần. Đánh đổi: bật qua bật lại nhiều project rất nặng vượt trần sẽ phải tải lại. Đã ghi thành gotcha ở CLAUDE.md mục 10.

**2. Bug thật đã sửa — commit đầu tiên sau khi import MIDI vào project có sẵn báo lỗi "Could not write draft":**
- Backend không log lý do lỗi thật ở đâu cả (`DraftsService.putDraft` chỉ `throw new InternalServerErrorException('Could not write draft')` khi Supabase trả `error`, không global exception filter nào bắt lại) — thêm tạm `console.error` kiểu `DEBUG-TEMP` để lộ ra lỗi Postgres thật: `code: '22P05', message: 'unsupported Unicode escape sequence', details: '0x00 cannot be converted to text.'`
- **Nguyên nhân:** file MIDI import có track tên bị nhúng ký tự NUL (`0x00`) trong meta event tên track (phổ biến ở file MIDI đệm chuỗi độ dài cố định bằng byte 0). `@tonejs/midi` đọc nguyên xi; `frontend/lib/midi-parser.ts` gán thẳng `midiTrack.name` vào track không lọc; qua lọt validation backend (`@IsString` chấp nhận NUL là 1 ký tự JS hợp lệ) rồi vỡ khi Postgres ghi `jsonb` — Postgres cấm tuyệt đối `0x00` trong `text`/`jsonb` dù là UTF-8 hợp lệ.
- **Fix:** `midi-parser.ts` — lọc bỏ mọi ký tự có mã từ 0x00 đến 0x1F và mã 0x7F khỏi `midiTrack.name` trước khi gán vào track, rơi về `Track N` nếu tên rỗng sau khi lọc.
- **Đã gỡ log tạm** khỏi `drafts.service.ts` sau khi có kết luận.

**Verify:** `tsc --noEmit` + `eslint` sạch cả frontend/backend sau khi sửa `midi-parser.ts` và gỡ log tạm. **Người dùng cần tự thử lại import + commit đúng project bị lỗi để xác nhận hết** — chưa có xác nhận verify mức 3.

**Không đụng server đang chạy của người dùng** (cổng 3000/3001 đã có sẵn tiến trình của người dùng từ trước phiên này, không phải do phiên này khởi động nên không tắt).

**Chưa commit/push.** File đổi: `frontend/lib/midi-parser.ts`. `backend/src/drafts/drafts.service.ts` không đổi gì so với trước phiên (log tạm đã thêm rồi gỡ).

---

## §41 — Kế hoạch rà soát UI toàn frontend theo module + kết quả Bước A (quét cơ học) (29/09/2026)

**Bối cảnh:** người dùng thử 3 skill audit UI (`web-design-guidelines`, `frontend-design-audit`, `impeccable`) trên frontend, muốn rà soát cả chương trình nhưng chưa sửa ngay trong phiên này (sẽ sửa ở chat khác, ngày khác). Mọi kết quả rà soát được ghi vào đây để chat sau đọc lại mà không phải rà lại. **Phiên này CHỈ audit — không sửa file code nào, không commit.**

### 41.1. Kế hoạch (các bước A–F và 7 module)

| Bước | Skill | Mục đích | Trạng thái |
|---|---|---|---|
| A | `web-design-guidelines` | Quét cơ học toàn frontend bằng grep | **Xong** (§41.3) |
| B | `frontend-design-audit` (chỉ báo cáo) | Đánh giá luồng + a11y theo từng module | Module 0 **xong** (§42); còn 1–6 |
| C | `impeccable critique` | Đánh giá thiết kế tổng thể — chạy **một lần** cho module 0 + 2-3 màn chính, sau khi đã sửa nền tảng | **Xong** — §52 (chạy TRƯỚC khi sửa, theo yêu cầu người dùng) |
| D | `impeccable audit` | Chấm 5 chiều (a11y/perf/responsive/theming/integrity) trước khi nộp | **Xong** lần 1 — §52 (điểm cơ sở 11/20; chạy lại sau Bước E để so sánh) |
| E | `impeccable` (`typeset`, `harden`, `clarify`, `onboard`…) | Sửa, mỗi lệnh một PR | Chưa (chờ người dùng duyệt) |
| F | Chạy app + trình duyệt/Playwright | Đo tương phản, thứ tự Tab, responsive thật | **Xong** — §51 (kèm đính chính B1, M6-7) |

| # | Module | File chính | Trạng thái B |
|---|---|---|---|
| 0 | Nền tảng dùng chung | `app/layout.tsx`, `app/globals.css`, `components/ui/*`, `site-header`, `site-footer`, `auth-card`, `require-auth`, `settings/theme-picker`, `context/theme-context` | **Xong** — §42 |
| 5 | Chi tiết dự án + version control | `app/projects/[id]/page.tsx`, `components/project/*` (branch-list, commit-history, commit-compare, merge-conflict-dialog) | **Xong** — §43 |
| 3 | Quản lý dự án | `projects`, `projects/new`, `projects/[id]/edit`, `projects/[id]/settings` | **Xong** — §44 |
| 1 | Xác thực | login, register, forgot-password, reset-password, auth/callback | **Xong** — §46 |
| 4 | Khám phá | `app/page.tsx` (home), explore, rankings, `creator/[id]` | **Xong** — §45 |
| 2 | Hồ sơ + quản trị | profile, profile/sessions, admin/users | **Xong** — §47 |
| 6 | Editor | `components/midi-editor/*`, `audio-sketch` | **Xong** — §48 (vỏ + thanh công cụ), §49 (panel + hộp thoại), §50 (piano roll + velocity lane). inline style + canvas, cần cách kiểm tra riêng; **âm thanh phải để người dùng tự nghe** (CLAUDE.md §10) |

Thứ tự đã đề xuất: **0 → 5 → 3 → 1 → 4 → 2 → 6**. Lý do: module 0 sửa một lần lợi mọi trang; module 5 là giá trị cốt lõi (commit/branch/merge); editor để cuối vì khác hẳn.

### 41.2. Ràng buộc khi sửa (nhắc lại từ CLAUDE.md §4.7, để chat sau không vi phạm)
- Không dark mode; màu chỉ dùng token semantic (`accent`, `surface`, `muted`…); không tạo bảng màu đánh số; chỉ preset theme UC-78 được đổi màu (BR-90: không đè `accent/success/warning/danger`).
- Không thêm icon library thứ 2. Không thêm thư viện mới (vd `tailwind-merge`) mà không hỏi.
- Component dùng chung ở `frontend/components/ui/`; chữ PLACEHOLDER cho tính năng chưa xây.
- Git: người dùng tự tạo nhánh + commit. Gợi ý tên nhánh khi sửa: `bugfix/ui-focus-dialog-accessibility`, `bugfix/ui-form-autocomplete-copy`, `bugfix/ui-type-scale-contrast`.

### 41.3. Kết quả Bước A — quét grep toàn `frontend/**/*.tsx`

**Giới hạn:** grep không kiểm được nhãn `<label>` của input nằm trong `Field`/`AuthField` và không kiểm được hành vi thật. Chưa chạy app.

| Kiểm tra | Kết quả |
|---|---|
| `<input>` có `autoComplete` | **0 / 40** (20 file) |
| `focus-visible` | **0** lần ở mọi `.tsx` (chỉ có `focus:ring` ở `ui/form.tsx:4`, `auth-card.tsx:62`) |
| Chuỗi tải dùng `...` thay `…` | **14 chuỗi**, 5 file + 1 ở phân trang |
| `outline: "none"` inline (không có thay thế) | 4: `track-panel.tsx:489`, `:606`; `history-panel.tsx:479`; `commit-dialog.tsx:228` |
| `toLocale*("vi-VN")` khai cứng | 18 chỗ / 10 file |
| `tabular-nums`, `text-balance/pretty`, `spellCheck`, `inputMode`, `translate="no"` | 0 |
| `type="text"` cho ô tìm kiếm | `explore/page.tsx:114`, `projects/page.tsx:332` |
| 72 `<button>` / 18 file | `aria-*`/`role` chỉ 26 lần / 14 file; `editor-redesign.tsx` 24 nút chỉ có `title=` (0 `aria-label`) |
| Không có | `user-scalable=no`, `onPaste` chặn dán, `transition-all`, `dark:` |
| Đạt | `avatar.tsx` có `alt` + kích thước cố định bằng class; footer link ngoài có `rel="noreferrer"` |

**Chuỗi `...` cần đổi thành `…`:** `projects/new/page.tsx:103`; `projects/[id]/edit/page.tsx:97,148,201,212`; `profile/page.tsx:105`; `ui/confirm-dialog.tsx:59`; `projects/[id]/settings/page.tsx:136,227,247,256,300,328,370`; phân trang `projects/page.tsx:305,309` (`login/page.tsx:69` và `projects/page.tsx:128` đã dùng `…` đúng — lấy làm chuẩn).

**Danh sách "sửa một chỗ, lợi nhiều chỗ" (chưa sửa):**
1. Focus-visible cho `Button`, `INPUT_CLASS`, `AUTH_INPUT_CLASS`, `Tabs`, `GoogleButton` (hoặc một quy tắc toàn cục — xem B1 ở §42).
2. `autoComplete` + `name` cho 40 input (auth 11 ô + profile) + `type="search"` cho 2 ô tìm.
3. `lang="vi"` ở `layout.tsx:28`.
4. Thay 14 chuỗi `...` → `…`.
5. Một helper locale thay 18 chỗ `"vi-VN"` (đã có `lib/format-date.ts`).
6. Skip link + `id` cho `<main>`.
7. Editor tách riêng (nút chỉ có `title`, inline style không có hover/focus) — bước cuối.

**Nhận định về skill:** `web-design-guidelines` phủ rộng/rẻ nhất, bắt lỗi kỹ thuật lặp lại; không hiểu ngữ cảnh (bỏ qua quy tắc dark mode và Title Case cho tiếng Việt). Nên chạy lại sau mỗi đợt sửa để chống lùi.

**Sửa lại nhận định cũ:** từng nghi toast/dialog `z-50` bị header sticky `z-50` đè — thực tế không xảy ra vì dialog/toast render sau header trong DOM nên nằm trên. Không cần xử lý.

---

## §42 — Bước B, module 0 (nền tảng dùng chung): báo cáo audit, CHƯA sửa (29/09/2026)

**Đã đọc:** `app/layout.tsx`, `app/globals.css`, `components/ui/{avatar,badge,button,card,confirm-dialog,empty-state,form,logo,mini-roll,page-header,project-thumb,row-list,tabs,toast}.tsx`, `site-header.tsx`, `site-footer.tsx`, `auth-card.tsx`, `require-auth.tsx`, `settings/theme-picker.tsx`, `context/theme-context.tsx`. **Chưa đọc:** `context/auth-context.tsx` (logic), `lib/avatar-color.ts`. Phân tích tĩnh, các con số tương phản là ước lượng từ giá trị oklch — **chưa đo bằng công cụ**.

**Chấm nhanh 5 chiều (thang 0–4):** Truy cập 2 · Hiệu năng 3 (chưa đo) · Responsive 2 · Theming 3 · Toàn vẹn 3. **Số lỗi:** P1 = 4, P2 = 7, P3 = 5 (16 mục).

### P1 — sửa trước

**B1. Không có trạng thái focus cho phần lớn phần tử tương tác dùng chung.** *[ĐÍNH CHÍNH sau Bước F, §51.2: đo thật cho thấy nút và liên kết vẫn hiện viền focus mặc định của trình duyệt (`outline: auto`); B1 hạ từ P1 xuống P2 — vấn đề còn lại là không đồng bộ thương hiệu/tương phản, không phải "không có focus".]*
- Chỉ input/textarea có ring (`ui/form.tsx:4`, `auth-card.tsx:62`, và dùng `focus:` chứ không phải `focus-visible:`). Thiếu ở: `Button` (`ui/button.tsx:26`), `Tabs` (`ui/tabs.tsx:20`), `Logo` link, nav link + nút avatar + nút mobile ở `site-header.tsx` (68, 87, 116, 143), `GoogleButton` (`auth-card.tsx:76`), nút đóng `Toast` (`toast.tsx:53`), swatch `theme-picker.tsx:67`, `RowTitle` link (`row-list.tsx:69`).
- Tác động: người dùng bàn phím không thấy mình đang ở đâu.
- **Đề xuất:** một quy tắc toàn cục trong `globals.css` (`:focus-visible` outline 2px bằng `var(--accent)`, offset 2px) rồi đổi `focus:` → `focus-visible:` ở 2 class input. Một chỗ sửa, dùng token nên đổi theo theme, không dark mode.

**B2. `ConfirmDialog` không dùng được bằng bàn phím và thiếu ngữ nghĩa.** `ui/confirm-dialog.tsx:43-51`: không Escape, không focus trap/không đưa focus vào khi mở/không trả focus khi đóng, thiếu `aria-labelledby`/`aria-describedby` (chỉ có `role="alertdialog" aria-modal`), không khoá cuộn nền (`<main>` là vùng cuộn — CLAUDE.md §10). Ba dialog nội tuyến ở `projects/[id]/settings/page.tsx:275-375`, `admin/users`, `merge-conflict-dialog` lặp lại cùng lỗi và lệch nhau (độ rộng, màu tiêu đề, không đóng khi bấm nền). `redesign/modal.tsx` có Escape nhưng thiếu trap/`aria-labelledby`.
- **Đề xuất:** một primitive `Dialog` (cân nhắc phần tử `<dialog>` + `showModal()` cho focus trap/Escape/inert có sẵn) rồi `ConfirmDialog` và các dialog nội tuyến dùng chung; `Modal` của editor giữ style riêng nhưng thêm cùng hành vi. Thêm prop `children` cho ô nhập tên khi xoá dự án.

**B3. Màu chữ trạng thái không đủ tương phản.** `--warning` (L≈0.70) và `--metal` (L≈0.73) dùng làm **chữ** trên nền `-muted` sáng (L≈0.94–0.95): ước lượng ~2–2.5:1 (< 4.5:1). Xuất hiện ở `Badge` warning/metal (`ui/badge.tsx:9,11` — nhãn "Đã lưu trữ", "Dự án nổi bật", "STAVE+"), `Toast` warning (`toast.tsx:26`), `settings/page.tsx:245,278`.
- **Đề xuất:** thêm token chữ tối hơn `--warning-foreground`, `--metal-foreground` (khai cho cả `unleashed`, `moss`, `claret` vì preset retint `--metal`). Giữ nguyên `--warning`/`--metal` cho nền/viền → không đụng BR-90.

**B4. Thang chữ dẹt và quá nhỏ.** Tiêu đề trang 26px nhưng mọi thứ còn lại 9–13px: `Badge` 10px (`badge.tsx:23`), `RowHeader`/`RowTime`/eyebrow 10px, `RowStat`/meta 11px, `theme-picker.tsx:79,82` **9px**, `Button`/input 12px (`button.tsx:26`, `form.tsx:4`), nhãn `Field` 11px (`form.tsx:9`). Input dưới 16px làm iOS tự phóng to khi focus; vùng bấm nút `h-8` = 32px < 44px.
- **Đề xuất:** khai thang chữ trong `@theme` (sàn 12px cho chữ người dùng phải đọc; chỉ nhãn viết hoa mới được 10–11px), input `text-base` trên mobile (`text-base sm:text-xs`), vùng bấm ≥44px trên mobile (`min-h-11 sm:h-8`). Đây là chỗ cần cân nhắc với người dùng vì đổi mật độ toàn app.

### P2

**B5. Ngữ nghĩa điều hướng.** `site-header.tsx`: `<nav>` (66, 154) không `aria-label`; link đang mở có tính `isActive` (dòng 53) nhưng chỉ đổi màu, **không `aria-current="page"`**; nút avatar thiếu `aria-expanded`/`aria-haspopup`, dropdown không đóng bằng Escape và không trả focus; nút mobile thiếu `aria-expanded`/`aria-controls`. **"Dự án mới" bị ẩn dưới `sm`** (dòng 81 `hidden … sm:flex`) và không có trong menu mobile (154-165) → trên điện thoại nút hành động chính không có ở header. `PageHeader` (`page-header.tsx:26`): breadcrumb `<nav>` thiếu `aria-label`, mục cuối thiếu `aria-current`, dấu `/` nên `aria-hidden`.

**B6. Khung trang.** `layout.tsx:28` `lang="en"` nhưng UI tiếng Việt; không có skip link, `<main>` không `id`; `metadata` chưa có `viewport`/`themeColor`. **Cần kiểm chứng bằng chạy thật:** vì `<main>` là vùng cuộn thay cho `window` (`layout.tsx:50`), Next.js đưa `window` về đầu trang khi chuyển route nhưng không đụng `<main>` → có thể trang mới mở ở vị trí cuộn cũ.

**B7. `Toast`.** (a) `useEffect` phụ thuộc `[duration, onDismiss]` (`toast.tsx:37-41`) mà 3 nơi gọi truyền mũi tên nội tuyến (`branch-list.tsx:217`, `commit-history.tsx:218`, `projects/[id]/page.tsx:221`) → **hẹn giờ bị đặt lại mỗi lần cha render lại**, toast có thể tồn tại lâu hơn 4s. Sửa bằng giữ `onDismiss` trong ref. (b) Không tạm dừng khi rê chuột/focus; 4s ngắn với người đọc chậm. (c) `role="status"` cho mọi variant — `danger`/`warning` nên `role="alert"`. (d) Icon thiếu `aria-hidden`; nút đóng thiếu focus style (B1).

**B8. `Tabs`** (`ui/tabs.tsx`): không `role="tablist/tab"`, không `aria-selected`, không phím mũi tên, nút thiếu `type="button"`; `TabPanel` chưa liên kết `aria-labelledby`. Ở `projects/page.tsx` tab thực chất là điều hướng URL — cân nhắc để là link.

**B9. `Button`** (`ui/button.tsx`): không mặc định `type` (trong `<form>` sẽ là submit — các form hiện tại đã đặt `type` tường minh, nhưng dễ vấp); không có variant `warning` nên nơi dùng phải ghi đè className và **xung đột lớp** vì không có cơ chế merge (`settings/page.tsx:298` `bg-warning hover:bg-warning` chồng `bg-accent` của variant primary; 245/254 `border-danger` chồng `border-border` — thắng/thua tuỳ thứ tự CSS sinh ra, và `hover:bg-warning` trùng màu nền nên không có phản hồi hover). Đề xuất thêm variant `warning`, hoặc hỏi người dùng về `tailwind-merge`.

**B10. `RequireAuth`** (`require-auth.tsx:14`) chuyển về `/login` mà **không giữ đường dẫn quay lại**; `login/page.tsx:30` luôn `router.push("/")` → người dùng bị đá ra từ `/projects/x/settings` sẽ rơi về trang chủ sau khi đăng nhập. Đề xuất tham số quay lại (chỉ chấp nhận đường dẫn nội bộ). **Cập nhật ở §43 (M5-8):** trang chi tiết dự án đã ghi sẵn `/login?redirect=…` nhưng trang đăng nhập không đọc — dùng luôn tên `redirect`, đừng đặt thêm `next`. Vòng xoay tải (dòng 21) thiếu `role="status"`.

**B11 → chuyển sang P2:** `theme-picker.tsx` — 3 nút swatch là lựa chọn một-trong-nhiều nhưng không có `role="radiogroup"/radio` hoặc `aria-pressed`; dòng "Đang xem trước — chưa lưu" (104) không `aria-live`; chữ 9px (B4).

### P3

- **B12.** `ThemeProvider` dùng preset mặc định lúc tải đầu rồi đổi sau khi API trả (`theme-context.tsx:42-48` tự ghi nhận) → người dùng Moss/Claret thấy nháy sai màu mỗi lần tải lại. Có thể lưu gợi ý preset ở `localStorage` (chỉ là tiện ích per-viewer, nguồn sự thật vẫn là tài khoản theo POST-3), áp bằng script trước hydration.
- **B13.** `EmptyState` (`empty-state.tsx:15`): tiêu đề là `<p>` không phải heading; icon thiếu `aria-hidden`. `Avatar` (`avatar.tsx:22`): `alt={label}` trùng với tên hiển thị ngay cạnh trong header (`site-header.tsx:91-92`) → screen reader đọc hai lần; nên `alt=""` khi có chữ bên cạnh; ảnh chưa `loading="lazy"`.
- **B14.** Không có `prefers-reduced-motion` (`animate-pulse` ở header, `animate-spin` ở `RequireAuth`, xoay chevron) — thêm `@media (prefers-reduced-motion: reduce)` ở `globals.css`.
- **B15.** `globals.css` chưa khai `color-scheme: light` (phòng hờ scrollbar/`<select>` native lệch theo dark mode của hệ điều hành trong khi UI cố định sáng).
- **B16.** Typography rải rác: `PageHeader` h1 26px cố định (không co theo màn nhỏ); chưa dùng `text-balance`; `Huỷ` (ConfirmDialog) so với `Xóa` (settings) lệch kiểu đặt dấu.

### Điểm mạnh (đừng đổi)
Hệ token semantic + kỷ luật "accent small dose" (`globals.css`); `ConfirmDialog` khoá đóng-bằng-nền khi đang `loading`; xoá dự án bắt gõ đúng tên; skeleton ở header khi đang tải; `MiniRoll` `aria-hidden` (thuần trang trí, có chú thích cấm dùng làm xem trước thật); `ProjectThumb` tất định thay vì vẽ giả dữ liệu; `ThemeSwatch` tự đặt `data-theme` nên xem trước đúng preset; nhánh lỗi UC-78 6.E1 (trả giao diện về theme cũ); quy ước PLACEHOLDER; `RowList` dùng chung chuỗi grid để cột thẳng hàng; footer ghi công giấy phép (CC BY 3.0) đầy đủ.

### Gợi ý thứ tự sửa cho module 0 (khi người dùng duyệt, mỗi cụm một nhánh/PR)
1. **A11y nền tảng:** B1 (focus toàn cục) + B2 (Dialog dùng chung) + B7 (Toast) + B8 (Tabs) + B5/B6 (nav, `lang="vi"`, skip link, `id` main).
2. **Chữ + tương phản:** B3 (token chữ warning/metal) + B4 (thang chữ, input 16px mobile) — cần người dùng chốt mức thay đổi mật độ.
3. **Form + copy:** `autoComplete`/`name` 40 input, `…`, `type="search"`, helper locale (từ §41.3), B10 (`?next=`), B9 (variant `warning`).
4. **Dọn nhỏ:** B11–B16.

### Cách tiếp tục ở chat mới
Đọc §41 + §42 trước. Muốn sửa: nói rõ cụm nào ở "Gợi ý thứ tự sửa" và có thể dùng `/impeccable harden` (dialog/lỗi/luồng), `/impeccable typeset` (thang chữ), `/impeccable clarify` (copy). Muốn tiếp tục rà soát: làm **module 5** (Bước B). Sau mỗi đợt sửa: chạy lại Bước A (grep §41.3) để so số liệu (autoComplete 0/40, focus-visible 0, `...` 14 chuỗi).

**Trạng thái cuối phiên:** không sửa code, không commit/push, không tiến trình nền. Có 1 file tạm ngoài dự án (scratchpad `detect.json`).

---

## §43 — Bước B, module 5 (chi tiết dự án + version control): báo cáo audit, CHƯA sửa (29/09/2026)

**Đã đọc đủ:** `app/projects/[id]/page.tsx`, `components/project/{branch-list,commit-history,commit-compare,merge-conflict-dialog}.tsx`, `context/auth-context.tsx` (để kiểm chứng M5-6). **Chưa đọc:** `lib/api-client.ts` (kiểu `MergeNoteConflict` — không biết có trả tên track không), backend. Phân tích tĩnh; các mục ghi "cần xác minh" phải chạy app thật mới kết luận. Đây là luồng cốt lõi của STAVE (commit/branch/merge/compare/restore), nên mức nghiêm trọng chấm chặt hơn module khác.

**Số lỗi:** P1 = 5, P2 = 11, P3 = 4 (20 mục). Nhiều lỗi ở đây là **hệ quả của lỗi nền tảng module 0** (B2 dialog, B3 tương phản, B4 cỡ chữ) — sửa module 0 trước sẽ giải quyết một phần.

### P1

**M5-1. Lỗi thao tác hiện phía SAU lớp phủ dialog → người dùng không thấy thất bại.** `branch-list.tsx:136-150` (`handleDelete`) và `commit-history.tsx:157-172` (`handleRestore`): khi API lỗi chỉ `setError(...)` — banner nằm trong trang, còn `deleteTarget`/`restoreTarget` vẫn giữ nên `ConfirmDialog` vẫn mở và che banner (chỉ mờ dưới `bg-foreground/40`). `handleResolve` (`branch-list.tsx:176-194`) cùng lỗi với `MergeConflictDialog`. `ConfirmDialog` không có chỗ hiện lỗi. Tác động: bấm "Khôi phục"/"Xoá nhánh"/"Xác nhận và hợp nhất", nút quay về trạng thái thường, không có gì xảy ra. **Đề xuất:** thêm prop `error` vào `ConfirmDialog`/dialog dùng chung (cùng B2), hiện ngay trong hộp với `role="alert"`; hoặc đóng dialog rồi hiện Toast `danger`.

**M5-2. Hộp xoá nhánh nói "an toàn" khi chưa biết gì.** `branch-list.tsx:364-376`: điều kiện `deletePreview && unmergedCommitsCount > 0 ? cảnh báo : "Mọi commit của nhánh này đã có ở nhánh mặc định, xoá nhánh sẽ không làm mất nội dung nào."`. Khi `deletePreview` còn `null` (đang tải — `openDelete` mở dialog trước rồi mới gọi API, dòng 126-134) **hoặc tải lỗi** (catch nuốt lỗi, dòng 131) thì rơi vào câu trấn an → người dùng có thể xoá nhánh còn commit chưa hợp nhất mà tin là an toàn. **Đề xuất:** 3 trạng thái rõ ràng — đang kiểm tra (nút xoá vô hiệu + "Đang kiểm tra các commit chưa hợp nhất…"), có preview, lỗi preview (nói "không kiểm tra được, xoá có thể làm mất commit", nút xoá vẫn cho nhưng cảnh báo).

**M5-3. "Hợp nhất" chạy ngay khi bấm, không xác nhận, kể cả khi vô nghĩa.** `branch-list.tsx:331-340` gọi `handleMerge` trực tiếp → tạo commit hợp nhất trên nhánh mặc định. Hàng đã `merged[branch.id]` (badge "Đã hợp nhất") hoặc `divergence.ahead === 0` vẫn hiện nút. Rollback tạo commit mới nên khôi phục được, nhưng vẫn là thay đổi lên `main`. **Đề xuất:** hộp xác nhận nêu "N commit từ A sẽ vào B" (đã có `divergence`); ẩn/vô hiệu nút khi không còn gì để hợp nhất.

**M5-4. Hộp thoại xung đột merge không dùng được bằng bàn phím/screen reader.** `merge-conflict-dialog.tsx`: (a) các cặp `<input type="radio">` (105, 130) **không có `name`** → không phải một nhóm, phím mũi tên không chuyển lựa chọn, screen reader không đọc "1/2"; (b) không `fieldset/legend` cho mỗi nốt; (c) khung ngoài (54-55) không `role="dialog"`, `aria-modal`, `aria-labelledby`, không Escape, không focus trap; (d) chữ 10–11px. Đây là màn hình rủi ro cao nhất của sản phẩm. **Đề xuất:** `name={\`conflict-${noteId}\`}`, `<fieldset><legend>`, dùng Dialog dùng chung (B2).

**M5-6. (cần xác minh) Trang chi tiết dự án tải lại từ đầu mỗi khi phiên đăng nhập phát sự kiện.** `projects/[id]/page.tsx:76-151` effect phụ thuộc `[id, user, profile, authLoading]` và mở đầu bằng `setLoading(true)` → hiện skeleton, **gỡ `CommitHistory`/`BranchList`/`CommitCompare` khỏi cây** (mất lựa chọn commit, trang, hộp so sánh đang mở). `auth-context.tsx:68-92`: `onAuthStateChange` với mọi sự kiện (không lọc `TOKEN_REFRESHED`/`SIGNED_IN`) gán `session` mới (→ `user` là object mới) rồi `refreshProfile()` gán `profile` object mới. Nếu Supabase phát `SIGNED_IN` khi tab lấy lại focus (hành vi từng gặp ở supabase-js v2) hoặc khi làm mới token, người dùng đang so sánh hai commit rồi chuyển tab qua lại có thể thấy trang nháy về skeleton. **Cách xác minh:** mở tab Commit, chọn 2 commit, chuyển sang tab khác ≥1 phút rồi quay lại. **Đề xuất nếu đúng:** phụ thuộc theo `user?.id` (giá trị nguyên thuỷ) và chỉ `setLoading(true)` ở lần tải đầu; hoặc lọc sự kiện ở `auth-context`. (Cũng ảnh hưởng mọi trang dùng `useAuth()` làm phụ thuộc effect — cần grep khi sửa.)

### P2

**M5-7. `<Link><Button>` lồng nhau — ít nhất 13 chỗ, 7 file** (`creator/[id]/page.tsx:68`, `branch-list.tsx:324`, `app/page.tsx:45,83,233`, `projects/new:105`, `projects/page.tsx:320,435`, `profile/page.tsx:355`, `projects/[id]/page.tsx:192,276,281,344`): phần tử tương tác lồng trong `<a>` là HTML không hợp lệ; bàn phím Tab dừng **hai lần** cho một hành động, screen reader đọc "liên kết, nút". **Đề xuất:** thêm `ButtonLink` vào `components/ui/button.tsx` (dùng chung lớp với `Button`, render `Link`), thay dần. Thuộc cụm sửa module 0.

**M5-8. Tham số `redirect` không có người đọc.** `projects/[id]/page.tsx:163,423` chuyển tới `/login?redirect=…` nhưng `login/page.tsx:30` luôn `router.push("/")` và không đọc `searchParams`. Khách bấm "Đăng nhập để fork" xong về trang chủ, không về dự án. Gộp với B10 (`RequireAuth`): dùng tên `redirect`, chỉ nhận đường dẫn nội bộ bắt đầu bằng `/` (chống open redirect).

**M5-9. Ngôn ngữ vị trí không phải của nhạc sĩ.** `merge-conflict-dialog.tsx:50`, `commit-compare.tsx:89-91`: "tick 1920 · dài 480 · velocity 90" — nhạc sĩ đọc "ô nhịp 2, phách 1, dài 1 phách". Khung xung đột còn hiện mã `noteId.slice(0, 8)` (dòng 93-94) — vô nghĩa với người dùng; không hiện tên track (không rõ `MergeNoteConflict` có trường này không — cần đọc `api-client.ts`), không có liên kết "mở tại ô nhịp này trong editor". **Đề xuất:** hàm `formatPosition(tick, ppq, timeSignature)` → "ô nhịp.phách"; thay UUID bằng tên track + tên nốt.

**M5-10. Xung đột nhiều nốt không có thao tác hàng loạt.** `merge-conflict-dialog.tsx:72-152` dựng radio cho từng nốt, không có "Giữ tất cả bên ta / Lấy tất cả bên kia", không đếm tiến độ đã xem, danh sách dài không ảo hoá. Mặc định `PICK_TARGET` an toàn (điểm mạnh) nhưng người dùng có thể xác nhận cả trăm nốt mà không xem. **Đề xuất:** 2 nút hàng loạt theo ô nhịp và toàn bộ + dòng tóm tắt "N nốt sẽ giữ bên ta, M nốt lấy bên kia" sát nút xác nhận.

**M5-11. Độ lệch nhánh khó hiểu.** `branch-list.tsx:304-315` hiện `+3 -1` (xanh/đỏ) dưới cột "So với mặc định": không giải thích ahead/behind; màu đỏ cho "behind" gợi ý là lỗi; chỉ khác nhau bằng màu + dấu. **Đề xuất:** chữ rõ "3 commit mới · 1 commit bị bỏ lại" hoặc `title`/chú thích; bỏ màu đỏ cho `behind` (đây không phải lỗi).

**M5-12. Gắn tag: lỗi hiện xa hàng đang sửa, không Escape.** `commit-history.tsx:140-155,374-402`: `handleTag` gọi `setError` → banner ở đầu trang, còn form tag nằm ở hàng có thể cách 20 hàng; không Escape huỷ; không kiểm tra độ dài/ký tự; tag trùng chỉ báo lỗi chung. **Đề xuất:** lỗi ngay dưới ô nhập (`aria-describedby`), Escape huỷ, `maxLength`.

**M5-13. Không thể đọc đủ commit message.** `commit-history.tsx:341` `truncate` không `title`; `commit-compare.tsx:454` chip cũng `truncate`. Commit message dài (đặc biệt do AI gợi ý sau này — CLAUDE.md §4.4) không xem được ở đâu. **Đề xuất:** `title` + cho xuống dòng (`line-clamp-2`) và hiện đủ khi mở rộng hàng.

**M5-14. Đổi nhánh nhanh có thể hiện lịch sử nhánh cũ.** `commit-history.tsx:83-97,131-138`: `loadHistory` không huỷ/không đối chiếu id → hai lần gọi chồng, phản hồi cũ đến sau ghi đè. **Đề xuất:** id yêu cầu tăng dần hoặc `AbortController`.

**M5-15. Trang chi tiết: mọi lỗi đều thành "Không tìm thấy".** `projects/[id]/page.tsx:137-141,186-199`: lỗi mạng/500 cũng hiện "Không tìm thấy dự án này, hoặc bạn không có quyền xem." không phân biệt 404/403/mạng, không nút "Thử lại" (khác `commit-history`/`commit-compare` đã có). **Đề xuất:** dùng `ApiError.status` để chọn thông điệp; thêm "Thử lại" cho lỗi tạm thời.

**M5-16. `CommitCompare` chưa tiếp cận được.** `commit-compare.tsx`: (a) lưới SVG (`DiffGrid`, 511-553) không có `role="img"`/`aria-label` — nhưng danh sách `<details>` theo ô nhịp đã là bản văn bản tương đương (điểm mạnh), nên có thể `aria-hidden` cho SVG + `aria-label` tóm tắt; (b) nốt thêm/xoá/sửa/không đổi chỉ khác **màu** (`KIND_FILL`, 33-38) — mù màu không phân biệt được ở lưới (chỉ nốt sửa có nét đứt); (c) `<summary className="list-none">` (411) xoá dấu mũi tên nên không thấy có thể mở; lớp `group` không dùng; (d) `role="dialog" aria-modal` (248-249) nhưng thiếu `aria-labelledby`, không focus trap/trả focus, không khoá cuộn nền; (e) `Escape` đăng ký ở `window` (164-170) — nếu sau này lồng dialog khác sẽ đóng cả hai. **Đề xuất:** dùng Dialog dùng chung; thêm mẫu tô (gạch chéo) hoặc viền khác nhau cho từng loại; thêm chevron cho `<summary>`.

**M5-17. Lý do nút Xoá bị vô hiệu chỉ nằm trong `title`.** `branch-list.tsx:341-352`: nhánh đang mở trong editor không xoá được, giải thích chỉ hiện khi rê chuột — không hiện với bàn phím/cảm ứng, và nút disabled thường không nhận focus. Badge "Đang mở" đã có (điểm mạnh) nhưng chưa nối với lý do. **Đề xuất:** dòng phụ dưới hàng "Không xoá được nhánh đang mở — mở editor và chuyển nhánh khác trước" hoặc `aria-describedby`.

### P3

- **M5-18.** Thời gian không có năm: `commit-history.tsx:365` và `commit-compare.tsx:41` (hàm `formatTime` lặp lại cùng logic) → commit cũ hơn một năm mơ hồ. Gom thành helper trong `lib/format-date.ts` (cùng việc "gom locale" ở §41.3).
- **M5-19.** Thanh tab của trang dự án tự dựng (`projects/[id]/page.tsx:291-317`) thay vì dùng `ui/Tabs`; bổ sung vào B8 (ARIA tablist). `router.push` cho mỗi lần đổi tab đẩy lịch sử trình duyệt (chấp nhận được nếu chủ đích).
- **M5-20.** Nhãn "Đem so" (`commit-compare.tsx:263`) tối nghĩa; đề xuất "Bản so sánh"/"Bản mới hơn". Dòng `{data.name}.mid` (`page.tsx:337`) là tên tệp tự ghép từ tên dự án — tên có `/` hoặc ký tự đặc biệt sẽ trông như tệp không tồn tại.
- **M5-21.** `branch-list.tsx:83-85` gọi 1 request độ lệch cho mỗi nhánh (N+1) — ổn với vài nhánh, chậm khi nhiều; chọn commit thứ 3 lặng lẽ bỏ commit đầu (`commit-history.tsx:176`) mà không báo.

### Điểm mạnh (đừng đổi)
- Hộp xác nhận khôi phục nói đúng ngữ nghĩa quyết định §4.1 ("lịch sử KHÔNG bị xoá — tạo commit mới") và toast xác nhận sau đó.
- `CommitCompare`: đủ trạng thái (đang tải, lỗi kèm "Thử lại" chỉ đúng phiên bản nào đọc không được, hai phiên bản giống hệt, track không có nốt), đảo chiều, danh sách văn bản theo ô nhịp với ký hiệu `+ − ~` (không chỉ dựa màu).
- Merge: mặc định giữ bên ta (`PICK_TARGET`) — lựa chọn an toàn; ghi chú giải thích ở chân hộp; `conflictsByBar` gom theo ô nhịp đúng CLAUDE.md §4.1.
- `commit-history`: ghi chú nhánh chưa có commit riêng (UC-50 2.E1), huy hiệu "Mới nhất/Riêng nhánh/Kế thừa" (không chỉ chấm màu), checkbox có `aria-label`, `key` theo nhánh để nạp lại sạch.
- Khung xoay tải không nháy sau thao tác (`branch-list.tsx:196` chỉ hiện skeleton khi chưa có dữ liệu); quy tắc ẩn tab theo quyền chủ dự án có chú thích lý do.
- Toàn module dùng token, không hex cứng.

### Gợi ý thứ tự sửa cho module 5
1. **Lỗi im lặng và an toàn dữ liệu (làm trước, ít phụ thuộc):** M5-1, M5-2, M5-3 — chỉ cần thêm `error` vào dialog + hai trạng thái xác nhận.
2. **A11y luồng merge/compare:** M5-4, M5-16, M5-17 — nên làm cùng cụm Dialog dùng chung của module 0 (B2).
3. **Xác minh M5-6** bằng chạy app; nếu đúng, sửa `user?.id` (ảnh hưởng nhiều trang).
4. **Ngôn ngữ nhạc + thao tác hàng loạt:** M5-9, M5-10, M5-11, M5-13.
5. **Dọn nhỏ:** M5-7 (`ButtonLink`), M5-8, M5-12, M5-14, M5-15, M5-18–21.

### Cách tiếp tục
Module kế tiếp trong kế hoạch (§41.1): **3 (đã xong — §44) → 1 → 4 → 2 → 6**. Sau đợt sửa: chạy lại Bước A (§41.3) và kiểm tra tay M5-6.

**Trạng thái cuối phiên:** không sửa code, không commit/push, không tiến trình nền.

---

## §44 — Bước B, module 3 (quản lý dự án): báo cáo audit, CHƯA sửa (29/09/2026)

**Đã đọc đủ:** `app/projects/page.tsx` (toàn bộ), `app/projects/new/page.tsx`, `app/projects/[id]/edit/page.tsx`, `app/projects/[id]/settings/page.tsx` (toàn bộ), cộng grep `GENRE_FILTERS` và liên kết tới `/projects/[id]`. **Chưa đọc:** `lib/api-client.ts` (không biết `createProject` trả gì), backend. Phân tích tĩnh; chưa chạy app.

**Số lỗi:** P1 = 4, P2 = 10, P3 = 5 (19 mục). Mục M3-4, M3-13, M3-19 vốn được ghi ở chat đánh giá bằng `frontend-design-audit` nhưng **chưa nằm trong file này** — nay ghi lại để không mất.

### P1

**M3-1. Lưu thông tin dự án thất bại KHÔNG hiện lỗi.** `projects/[id]/edit/page.tsx:205` chỉ hiện lỗi khi `error && submitting`, nhưng `handleSubmit` (dòng 78-81) gọi `setError(...)` **rồi** `setSubmitting(false)` → điều kiện luôn sai. Ví dụ tên trùng (409) hoặc mất mạng: nút quay về "Lưu thay đổi", không có thông báo nào. **Đề xuất:** hiện lỗi khi `error` (bỏ `&& submitting`), có `role="alert"`, gắn với ô tên khi là lỗi trùng tên.

**M3-2. Lưu trữ / khôi phục ở danh sách thất bại không báo gì.** `projects/page.tsx:89-91` (`catch { setArchiving(false); }`) và `:98-100` (`catch { setRestoring(false); }`) nuốt lỗi; `showConfirm` chỉ đóng khi thành công (dòng 88) nên hộp xác nhận vẫn mở, chỉ nút hết trạng thái "đang xử lý". Cùng gốc với M5-1 (`ConfirmDialog` không có chỗ hiện lỗi). **Đề xuất:** dùng chung giải pháp M5-1 (prop `error` cho dialog) + Toast `danger`.

**M3-3. Chủ dự án không có đường vào trang Commit/Nhánh từ "Dự án của tôi".** Đã xác minh bằng grep: dòng và nút trong `projects/page.tsx` chỉ trỏ tới `/projects/:id/edit` (107, 120) và `/settings` (137). Liên kết tới `/projects/:id` (trang có tab Commit/Nhánh, nơi duy nhất có **hợp nhất, so sánh, xoá nhánh** — `branch-list.tsx` docstring) chỉ có ở home, explore, rankings, creator — tức chỉ với dự án **công khai**. Dự án riêng tư của chính chủ không có nút nào dẫn tới; phải tự gõ URL. Editor (`components/midi-editor/*`) cũng không có liên kết `/projects/:id?tab=`. Đây là tính năng cốt lõi của STAVE bị "mồ côi" về điều hướng. **Đề xuất:** tên dự án ở danh sách trỏ tới `/projects/:id`; nút riêng "Mở Editor" trỏ tới `/edit`; thêm liên kết "Lịch sử & nhánh" trong trang cài đặt/editor.

**M3-4. Chuyển dự án sang công khai có hiệu lực ngay khi chọn radio, không xác nhận.** `projects/[id]/settings/page.tsx:187,208` (`onChange` gọi API luôn). Bản nhạc dở dang lên trang Khám phá chỉ vì bấm nhầm. **Đề xuất:** khi chọn "Công khai" hiện `ConfirmDialog` nêu hệ quả; đổi ngược sang riêng tư thì không cần.

### P2

**M3-5. Ô "Mô tả" chỉ cao 37px.** `projects/new/page.tsx:85` `className={`${INPUT_CLASS} h-[37px]`}` đè `rows={4}` → `<textarea>` trông như một dòng, người dùng không đoán được có thể nhập nhiều dòng (trang edit không lỗi vì không đặt `h-[37px]`). **Đề xuất:** bỏ `h-[37px]` khỏi textarea (hoặc `min-h`).

**M3-6. Nút "Tạo dự án" bật lại ngay cả khi thành công → có thể gửi hai lần.** `new/page.tsx:42-45`: `finally { setSubmitting(false) }` chạy cả lúc thành công (chú thích ngay trên ghi "Only re-enable on error" nhưng mã không làm vậy) trong khi `router.push` còn đang điều hướng; bấm lần hai sẽ tạo trùng và nhận 409 "đã tồn tại" dù lần đầu thành công. **Đề xuất:** chỉ `setSubmitting(false)` trong `catch`.

**M3-7. Không có phản hồi thành công; sau khi tạo/sửa/xoá đều quay về danh sách.** `router.push("/projects")` ở `new:35`, `edit:77`, `settings:71,83,95` — không Toast dù `Toast` có sẵn. Tạo dự án xong không được đưa tới dự án mới (không rõ bước tiếp theo — thuộc cụm onboarding). Sửa thông tin xong bị đá ra khỏi editor. **Đề xuất:** truyền thông điệp qua một `ToastProvider` chung (cũng giải quyết B7); tạo xong đi tới `/projects/:id` hoặc editor.

**M3-8. Trang edit ghép hai việc và có vấn đề cấu trúc.** `edit/page.tsx:86-126,129-226`: (a) ba lớp header chồng nhau (site header 56px + khối tiêu đề/tab của trang + header riêng của editor 60px) — giảm chiều cao vùng làm việc của editor (cần xem thực tế); (b) tab "Trình soạn nhạc/Thông tin" tự dựng lần thứ 3 (sau `ui/Tabs` và tab của trang dự án), không ARIA, không focus; (c) `MidiEditor` bị **gỡ khỏi cây** khi sang tab Thông tin (`activeTab === "editor" ? … : …`) → mất lịch sử hoàn tác, vị trí cuộn, zoom, trạng thái phát (cần xác minh: bản nháp có autosave nên dữ liệu không mất, nhưng trải nghiệm bị đứt); (d) thông tin dự án sửa ở đây còn "Cài đặt" xem ở trang khác nhưng không sửa được tên. **Đề xuất (hướng cấu trúc):** chuyển form sửa tên/mô tả/thể loại vào trang Cài đặt, trang edit chỉ còn editor + thanh tiêu đề mỏng → xoá M3-8a–d và M3-9 một lượt. Nếu giữ tab: dùng `TabPanel hidden` để giữ editor mounted.

**M3-9. Dự án đã lưu trữ: nhãn "Xem" không dẫn tới chỗ để xem, ô nhập trông sửa được nhưng không lưu được.** `projects/page.tsx:123` `isArchived ? 'Xem' : 'Mở Editor'` → `/edit` mà tab mặc định (editor) chỉ hiện hộp khoá (`edit:132-142`), muốn xem thông tin phải sang tab "Thông tin". Ở tab đó (`edit:171-216`) các `<input>` không `disabled`/`readOnly`, nút Lưu bị ẩn, bấm Enter → `handleSubmit` `return` im lặng (dòng 67). **Đề xuất:** `disabled` các ô khi lưu trữ, nút "Xem" trỏ tới trang chi tiết `/projects/:id` (xem cả lịch sử ở chế độ đọc).

**M3-10. Thể loại: ô tự do nhưng bộ lọc là danh sách cố định.** `new:90-98`, `edit:195-203` cho gõ tự do (placeholder "Ví dụ: Pop, Rock, Jazz" / "Lo-Fi, Jazz,..." gợi ý nhập nhiều thể loại vào một ô), còn Khám phá lọc theo 7 giá trị cố định khớp chính xác (`explore/page.tsx:18-27`) và "Dự án của tôi" lọc theo tập giá trị duy nhất (`projects/page.tsx:229-234`) → "lo-fi", "Lo-Fi", "Lofi" thành ba thể loại khác nhau; dự án gõ "Hip hop" không bao giờ xuất hiện khi lọc "Hip-Hop". **Đề xuất:** `<select>` hoặc `<input list>` (datalist) với danh sách chuẩn dùng chung `lib/genres.ts` cho cả 3 nơi; hỏi người dùng có cho "Khác…" tự do hay không (quyết định sản phẩm).

**M3-11. Trạng thái rỗng lẫn tiếng Anh.** `projects/page.tsx:416` tạo chuỗi `Không tìm thấy dự án nào matching "abc" #Jazz` — từ "matching" tiếng Anh, dùng ngoặc kép thẳng. **Đề xuất:** "Không có dự án nào khớp “abc”." (ngoặc kép cong) + gợi ý xoá bộ lọc (đã có nút).

**M3-12. Phân trang thiếu ngữ nghĩa.** `projects/page.tsx:485-519`: hai nút chỉ có icon `ChevronLeft/Right` **không `aria-label`**; không bọc `<nav aria-label="Phân trang">`; trang hiện tại không `aria-current="page"`; vùng bấm 32px; dấu `'...'` (đã nêu §41.3).

**M3-13. Bộ lọc, sắp xếp, tìm kiếm không nằm trên URL.** `projects/page.tsx:167-170,217-226,346,364`: `search`, `genre`, `sort` là state cục bộ, chỉ `tab`/`page` nằm trên URL; đổi `sort` không đưa về trang 1 (đang ở trang 3 đổi sắp xếp vẫn ở trang 3); `router.push` cho mỗi thao tác làm nút Back đi qua từng bước lọc; tải lại mất bộ lọc. **Đề xuất:** đưa `q/genre/sort` lên URL bằng `router.replace`, luôn reset `page` khi đổi. (Ô tìm kiếm cũng thiếu `<label>`/`type="search"` — §41.3.)

**M3-14. Lỗi tạo dự án nằm ngoài ngữ cảnh.** `new/page.tsx:37-41,59-63`: lỗi 409 "tên đã tồn tại" hiện ở banner trên card, không gắn với ô tên (`aria-invalid`/`aria-describedby`), không chuyển focus, không `role="alert"`.

### P3
- **M3-15.** Không cảnh báo rời trang khi đã nhập dở ở `new`/`edit` (guideline "unsaved changes").
- **M3-16.** Lặt vặt: "Tên dự án *" dấu sao trong nhãn (screen reader đọc "sao") — nên `required` + `aria-required`; `maxLength` (120/2000/60) không có bộ đếm; số trong tab "Tất cả (n)" không đổi theo bộ lọc nhưng dòng đếm bên dưới có (`projects/page.tsx:378,454`) nên hai con số lệch nhau; hẹn giờ `setTimeout` ở `settings:115` không dọn, bật/tắt nhanh làm thông báo mới bị xoá sớm; cặp radio hiển thị không bọc `<fieldset><legend>`; ô nhập tên khi xoá (`settings:348`) thiếu `autoComplete="off"`, `spellCheck={false}`.
- **M3-17.** Nút thô `<button>` với lớp tự đặt thay vì `Button` ở `projects/page.tsx:402-407,424-432,441-446,485-519`; `Link` bọc `Button` (M5-7) ở `new:105`, `projects:320,435`.
- **M3-18.** `edit:72-76` gửi `description`/`genre` là chuỗi rỗng khi xoá, trong khi `new:32-33` gửi `null` → dữ liệu không đồng nhất (`""` so với `NULL`).
- **M3-19.** Sắp xếp mặc định "Công khai trước" (`projects/page.tsx:40,271-276`) không khớp kỳ vọng "mới cập nhật trước" cho danh sách việc của chính mình.

### Điểm mạnh (đừng đổi)
Xoá dự án bắt gõ đúng tên và nêu rõ hậu quả (lịch sử phiên bản, bản nháp, thành viên); các dialog trong trang Cài đặt hiện lỗi **ngay trong hộp** (`settings:283,315,356` — tốt hơn `ConfirmDialog` dùng chung); cập nhật lạc quan khi lưu trữ; trạng thái rỗng phân biệt ba tình huống (lọc không ra / chưa có dự án / mục trống) và mỗi cái có hành động phù hợp; tab + trang nằm trên URL; skeleton cho danh sách; lỗi 409 được dịch sang câu thân thiện (`new:37-38`); cảnh báo rõ ràng cho dự án lưu trữ; khoá gửi lặp `if (!name.trim() || submitting) return`; toàn bộ module dùng token, không hex cứng.

### Gợi ý thứ tự sửa cho module 3
1. **Lỗi im lặng (nhanh, ít rủi ro):** M3-1, M3-2, M3-6, M3-5, M3-11, M3-14.
2. **Điều hướng cốt lõi:** M3-3 (đường vào Commit/Nhánh) + M3-9 (nút "Xem") — cần người dùng chốt: tên dự án trỏ tới trang chi tiết hay editor?
3. **An toàn:** M3-4 (xác nhận công khai).
4. **Cấu trúc (quyết định sản phẩm):** M3-8 (chuyển form sửa vào Cài đặt, giữ editor mounted), M3-10 (danh sách thể loại chuẩn), M3-7 (`ToastProvider` + điều hướng sau khi tạo).
5. **Dọn nhỏ:** M3-12, M3-13, M3-15–19.

### Việc cần người dùng quyết trước khi sửa
1. Tên dự án ở "Dự án của tôi" trỏ tới đâu (trang chi tiết `/projects/:id` hay editor)?
2. Thể loại: chỉ chọn từ danh sách, hay cho phép "Khác…" tự nhập?
3. Có chuyển form sửa thông tin vào trang Cài đặt (bỏ tab "Thông tin" khỏi editor) không?

### Cách tiếp tục
Module kế tiếp: **4 (đã xong — §45)** → 1 → 2 → 6. Sau đợt sửa: chạy lại Bước A (§41.3).

**Trạng thái cuối phiên:** không sửa code, không commit/push, không tiến trình nền.

---

## §45 — Bước B, module 4 (khám phá): báo cáo audit, CHƯA sửa (29/09/2026)

**Đã đọc đủ:** `app/page.tsx` (home), `app/explore/page.tsx`, `app/rankings/page.tsx`, `app/creator/[id]/page.tsx`, `lib/use-api-resource.ts`, `lib/format-date.ts`, `components/ui/row-list.tsx`; cộng phần backend liên quan để kiểm chứng ý nghĩa số liệu: `backend/src/explore/explore.service.ts` (dòng 123-149, 215-270, 291-323). **Chưa đọc:** `lib/api-client.ts`, controller. Phân tích tĩnh, chưa chạy app.

**Số lỗi:** P1 = 2, P2 = 11, P3 = 5 (18 mục). Điểm khác biệt của module này: phát hiện quan trọng nhất **nằm ở ý nghĩa dữ liệu hiển thị**, không phải ở mã giao diện.

### P1 — số liệu công khai mang ý nghĩa sai

**M4-1. "Lượt nghe" thực chất là lượt tải trang chi tiết, và dùng để xếp hạng.**
- `explore.service.ts:123-149` (`getPublicProject`): mỗi lần `GET` chi tiết dự án công khai gọi RPC `increment_project_play_count` — tăng bất kể ai xem, kể cả chủ dự án, kể cả tải lại trang. Chưa hề có phát nhạc (nút "Nghe thử" là PLACEHOLDER). Frontend gọi đúng endpoint này nên **mọi lần trang chi tiết tự tải lại (M5-6, `React StrictMode` ở dev) cũng cộng thêm một "lượt nghe"**.
- Hệ quả: nhãn "Lượt nghe" (home, explore, rankings, creator, trang dự án) sai nghĩa; `play_count` lại là khoá xếp hạng "Xu hướng"/"Nghe nhiều nhất"/"Thịnh hành" nên có thể bị thổi phồng chỉ bằng cách F5.
- **Đề xuất (cần người dùng quyết):** đổi nhãn thành "Lượt xem" cho tới khi có phát nhạc thật; cân nhắc chống đếm trùng (không đếm chủ dự án, một người/khoảng thời gian) — phần này là backend nhưng nhãn UI nên đổi ngay cùng lúc. Thuộc phạm vi tài liệu: kiểm tra lại use case UC-09/UC-11 trong SRS để biết "play" được định nghĩa thế nào.

**M4-2. Hai tab "Xu hướng" và "Nghe nhiều nhất" trả về cùng một danh sách; "Thịnh hành tuần này" không có mốc tuần.**
- `explore.service.ts:262` (`trending` và `top_played` dùng chung nhánh `order('play_count', desc).limit(10)`; chú thích dòng 222 xác nhận) → hai tab giống hệt. `getFeatured` (dòng 298) lấy `trending_projects` cũng chỉ là `play_count` toàn thời gian, trong khi `app/page.tsx:128` ghi "Thịnh hành tuần này". Không có cửa sổ thời gian nào.
- Người dùng chuyển tab thấy không đổi gì → tưởng lỗi; tuyên bố "tuần này" là sai.
- **Đề xuất:** hoặc định nghĩa "xu hướng" thật (lượt xem 7 ngày gần nhất — cần bảng sự kiện, việc backend), hoặc tạm bỏ tab "Xu hướng" / đổi tiêu đề home thành "Xem nhiều nhất". Cũng ghi rõ "Top 10" (backend giới hạn `limit = 10`, dòng 231) trong mô tả trang.

### P2

**M4-3. Trên điện thoại, số liệu trong hàng danh sách không có nhãn.** `ui/row-list.tsx:25` ẩn `RowHeader` dưới `md` (`hidden … md:grid`) còn `RowStat` (dòng 89) chỉ có `title` (tooltip, không có trên cảm ứng) và icon — người dùng thấy "▶ 1.204  ⑂ 3" mà không biết nghĩa. Ảnh hưởng home, explore, creator, projects. **Đề xuất:** thêm `sr-only` hoặc nhãn ngắn hiển thị dưới `md`; `aria-label` trên `RowStat`.

**M4-4. Tiêu đề tab trình duyệt luôn là "STAVE".** Chỉ `app/layout.tsx:19` có `metadata`; mọi trang khác là `'use client'` và không có `document.title` (đã grep). Hậu quả: nhiều tab STAVE không phân biệt được, lịch sử trình duyệt toàn "STAVE", screen reader không nghe tên trang khi chuyển route, và trang **công khai** (dự án, tác giả, bảng xếp hạng) không có tiêu đề/mô tả cho chia sẻ và tìm kiếm. **Đề xuất:** với trang công khai, tách phần dữ liệu thành server component + `generateMetadata` (Next.js hỗ trợ), trang cần đăng nhập dùng `document.title` từ một hook `usePageTitle`. Đọc `node_modules/next/dist/docs/` trước khi sửa (AGENTS.md của frontend cảnh báo phiên bản Next lệch kiến thức cũ).

**M4-5. Trang chủ nuốt lỗi API và trông như "nền tảng trống".** `app/page.tsx:19-21` bỏ qua `error` có chủ đích; nếu `getFeaturedContent` lỗi, `data === null` → mọi khối (nổi bật, số liệu, thịnh hành, mới) biến mất, chỉ còn tiêu đề mặc định và nút đăng ký, không có thông báo/thử lại. Ngoài ra `h1` đổi từ "STAVE" sang tiêu đề hero khi tải xong (`app/page.tsx:36`) → nhảy bố cục và đổi nội dung tiêu đề. **Đề xuất:** hiện dải lỗi nhỏ "Không tải được nội dung cộng đồng — Thử lại"; giữ `h1` ổn định (skeleton cho hero).

**M4-6. Người dùng đã đăng nhập không có lối "tiếp tục dự án của tôi" ở trang chủ.** `app/page.tsx` chỉ có nội dung cộng đồng và nút "Bắt đầu dự án"; khối giới thiệu chỉ ẩn đi với người đã đăng nhập (dòng 199) nhưng không thay bằng gì. Người quay lại phải bấm sang "Dự án của tôi". **Đề xuất:** hàng "Dự án gần đây của bạn" (3-5 dự án cập nhật gần nhất, dùng `listProjects`) đặt trên cùng khi đã đăng nhập.

**M4-7. "Thử lại" là tải lại cả trang.** `explore/page.tsx:164`, `rankings/page.tsx:80`: `window.location.reload()`; ở Bảng xếp hạng, tab đang chọn là state cục bộ nên reload đưa về tab "Xu hướng". **Đề xuất:** `useApiResource` trả thêm `refetch()` (hiện chỉ có `data/loading/error`), dùng cho mọi nút "Thử lại".

**M4-8. Bảng xếp hạng: tab không nằm trên URL.** `rankings/page.tsx:38` `useState('trending')` → không chia sẻ được liên kết tới "Fork nhiều nhất", Back/Forward không đổi tab, reload mất lựa chọn. Cùng cụm với B8 (`Tabs` ARIA).

**M4-9. Huy hiệu hạng không đủ tương phản.** `rankings/page.tsx:22-29`: chữ `text-background` (L≈0.98) trên `bg-border-strong` (hạng 2, L≈0.81 → ước lượng ~1.5:1), `bg-metal` (hạng 1, ~2.2:1), `bg-warning` (hạng 3, ~2.3:1); chỉ hạng ≥4 (`text-muted` trên `surface-subtle`) đạt. Số hạng 2 gần như không đọc được. Số ước lượng, chưa đo. **Đề xuất:** chữ dùng token foreground tối cho nền sáng (`text-foreground`) hoặc token `-foreground` mới ở B3.

**M4-10. Đổi trang/bộ lọc làm danh sách biến mất và không cuộn lên đầu.** `explore/page.tsx:159-160`: `loading` (từ `use-api-resource.ts:48`, `key` khác) thay cả danh sách bằng skeleton; bấm "Sau" ở cuối trang (`:235-255`) xong vẫn đứng ở cuối vùng cuộn `<main>` (CLAUDE.md §10: `window.scrollTo` không có tác dụng). Cũng làm nhảy chiều cao. **Đề xuất:** giữ dữ liệu cũ mờ đi trong lúc tải (`data` trước + cờ `isFetching`), và `mainRef.scrollTo({top:0})` khi đổi trang.

**M4-11. Ô tìm kiếm Khám phá lệch với URL khi Back/Forward.** `explore/page.tsx:98-104`: `searchInput` chỉ khởi tạo một lần từ URL; bấm Back thay `search` trên URL nhưng ô nhập giữ chữ cũ, kết quả và ô nhập không khớp nhau. **Đề xuất:** đồng bộ `searchInput` khi `search` từ URL đổi (ngoài lúc người dùng đang gõ). Thêm `<label>`/`type="search"` (§41.3).

**M4-12. Trạng thái rỗng không dẫn đi đâu.** `explore/page.tsx:169-185` (không có bộ lọc mà vẫn rỗng, tức chưa có dự án công khai nào): chỉ "Không tìm thấy dự án nào." không có hành động; `rankings/page.tsx:85` tương tự. **Đề xuất:** khi chưa có gì, mời "Chia sẻ dự án đầu tiên của bạn" (đăng nhập → tạo dự án).

**M4-13. Trang tác giả: mọi lỗi đều thành "Không tìm thấy người dùng này".** `creator/[id]/page.tsx:36` là thông báo lỗi duy nhất cho `useApiResource`; `Promise.all` (dòng 32-34) khiến một API lỗi làm hỏng cả trang dù hồ sơ tải được; không có nút thử lại. Cùng dạng M5-15. **Đề xuất:** phân biệt 404 và lỗi mạng; dùng `Promise.allSettled` và hiện danh sách dự án lỗi riêng.

### P3
- **M4-14.** Tham số URL không kiểm tra: `explore/page.tsx:57` `parseInt(page)` cho `NaN` khi `?page=abc` rồi gửi thẳng vào API; `sort` ép kiểu không kiểm (`:58`). Nên chuẩn hoá `Math.max(1, …)` và whitelist `sort`.
- **M4-15.** `Link` tác giả nằm trong ô `meta` của `RowTitle` (`explore/page.tsx:212`) trong khi chú thích `row-list.tsx:50-53` nói ô chỉ nên chứa một phần tử tương tác → hai điểm bấm sát nhau; chip lọc thẻ `#tag ×` (`explore:148-156`) không có nhãn "Bỏ lọc thẻ" nên người dùng screen reader không biết đây là nút xoá.
- **M4-16.** Trang tác giả: hiện `@unknown` khi thiếu username (`creator:93`) — tên tự bịa; không có liên kết "Chỉnh sửa hồ sơ" khi xem chính mình; danh sách dự án không phân trang/sắp xếp (dài dần).
- **M4-17.** Nhãn: dự án "nổi bật" (`app/page.tsx:57`) thực chất chỉ là dự án **mới nhất** (`explore.service.ts:297` `order('created_at', desc)`), không phải được chọn lọc; "Thịnh hành" (home) và "Xu hướng" (rankings) là hai tên cho cùng một khái niệm.
- **M4-18.** Ngoặc kép thẳng `"${search}"` (`explore:190`), `...` ở ba nơi (§41.3); mô tả trang Khám phá "để nghe, học hỏi và fork" (`explore:268`) hứa hai tính năng vẫn là PLACEHOLDER.

### Điểm mạnh (đừng đổi)
Bộ lọc Khám phá nằm trên URL (chia sẻ được); tìm kiếm có debounce 400ms; `useApiResource` có cờ `cancelled` nên không dính race như M5-14; khách xem được mọi thứ không cần đăng nhập; trạng thái rỗng phân biệt "có bộ lọc" và "không có gì"; khối giới thiệu trang chủ chỉ hiện cho khách; bố cục `RowList` nhất quán trên 4 trang; quy ước PLACEHOLDER được tôn trọng; skeleton cho mọi danh sách; toàn bộ dùng token.

### Gợi ý thứ tự sửa cho module 4
1. **Quyết định sản phẩm trước (M4-1, M4-2):** đổi nhãn "Lượt nghe" → "Lượt xem"? định nghĩa "Xu hướng"? — sửa nhãn rất rẻ nhưng cần người dùng chốt và đối chiếu SRS UC-09/UC-11.
2. **Nền tảng dùng chung:** M4-3 (`RowStat` mobile), M4-4 (`usePageTitle`/`generateMetadata`), M4-7 (`refetch`), M4-10.
3. **Trang chủ:** M4-5, M4-6.
4. **Dọn nhỏ:** M4-8, M4-9 (cùng B3), M4-11–18.

### Việc cần người dùng quyết
1. Đổi nhãn "Lượt nghe" thành "Lượt xem" ngay bây giờ (chưa có phát nhạc), hay giữ và sửa backend (đếm lượt phát thật) trước?
2. "Xu hướng" định nghĩa thế nào (7 ngày? cần bảng sự kiện phía backend) — hay bỏ tab tạm thời?
3. Có thêm khối "Dự án gần đây của bạn" cho người đã đăng nhập ở trang chủ không?

### Cách tiếp tục
Module kế tiếp: **1 (đã xong — §46)** → 2 → 6.

**Trạng thái cuối phiên:** không sửa code, không commit/push, không tiến trình nền.

---

## §46 — Bước B, module 1 (xác thực): báo cáo audit, CHƯA sửa (29/09/2026)

**Đã đọc đủ:** `app/login/page.tsx`, `register`, `forgot-password`, `reset-password`, `auth/callback`, `components/auth-card.tsx`, `lib/supabase-browser.ts`, `context/auth-context.tsx`, và đoạn đổi mật khẩu ở `app/profile/page.tsx:143-165` để đối chiếu M1-2. Đã grep toàn frontend: **không có** `auth.resend`, `PASSWORD_RECOVERY`, đọc `error_description`/`location.hash`, hay `noValidate`. **Chưa đọc:** backend `auth` (không biết thông điệp lỗi backend là tiếng gì), cấu hình Supabase Auth (email rate limit, "Secure password change"). Phân tích tĩnh, chưa chạy app.

**Số lỗi:** P1 = 3, P2 = 10, P3 = 5 (18 mục).

### P1

**M1-1. Liên kết xác nhận email / đăng nhập Google hỏng → xoay "Đang đăng nhập…" mãi mãi.** `app/auth/callback/page.tsx:12-23`: chỉ `router.replace("/")` khi có `session`; không có nhánh lỗi, không hết thời gian chờ, không đọc lỗi trong URL (Supabase trả `#error=access_denied&error_code=otp_expired` khi link hết hạn hoặc người dùng huỷ trên màn Google). So sánh: `reset-password/page.tsx:19-24,57` đã có mốc chờ 3 giây rồi báo "Link không hợp lệ". Người dùng vừa đăng ký, mở email quá hạn → kẹt ở màn quay, không biết làm gì. **Đề xuất:** đọc tham số lỗi (hash và query), sau ~5 giây không có phiên thì hiện "Liên kết không hợp lệ hoặc đã hết hạn" kèm nút "Đăng nhập" và "Gửi lại email xác nhận".

**M1-2. (cần xác minh, liên quan bảo mật) Trang `/reset-password` cho đổi mật khẩu với BẤT KỲ phiên đăng nhập nào, không cần mật khẩu hiện tại.** `reset-password/page.tsx:14,57-76,40` chỉ kiểm `session` rồi gọi `supabase.auth.updateUser({ password })` thẳng từ trình duyệt; không kiểm phiên đó đến từ liên kết khôi phục (sự kiện `PASSWORD_RECOVERY` — grep không thấy ở đâu). Trong khi trang Hồ sơ đổi mật khẩu **phải** nhập mật khẩu hiện tại và đi qua backend (`profile/page.tsx:160-162`, `/auth/change-password`; CLAUDE.md §4.6 cũng mô tả đường này). Nghĩa là ai đó ngồi vào một trình duyệt đang đăng nhập có thể vào `/reset-password` và đổi mật khẩu mà không biết mật khẩu cũ, qua mặt lớp bảo vệ ở trang Hồ sơ. Mức độ thật phụ thuộc cấu hình Supabase ("Secure password change" có thể buộc xác thực lại) — **cần xác minh trên project Supabase trước khi kết luận.** **Đề xuất:** chỉ hiện form khi phiên bắt nguồn từ sự kiện `PASSWORD_RECOVERY` (đặt cờ ở `auth-context`), còn không chuyển hướng về `/profile`. Kiểm tra lại các quy tắc ở CLAUDE.md §4.6 khi sửa (backend đang cố tình không dùng `supabase.auth.admin.updateUserById` cho người gọi).

**M1-3. Lỗi đăng nhập/đăng ký/khôi phục hiện thông điệp tiếng Anh thô, kèm ngõ cụt "chưa xác nhận email".** `login/page.tsx:27`, `register:40`, `forgot-password:26`, `reset-password:45` đều `setError(x.message)` từ Supabase: "Invalid login credentials", "Email not confirmed", "New password should be different from the old password", "For security purposes, you can only request this after 60 seconds"… Trường hợp nghiêm trọng nhất: người đã đăng ký nhưng chưa bấm link xác nhận sẽ nhận "Email not confirmed" — chuỗi tiếng Anh và **không có cách gửi lại email** (grep xác nhận không có `resend` ở đâu). Người đó không biết nguyên nhân, cũng không có đường đi tiếp. **Đề xuất:** một hàm `authErrorMessage(error)` dùng chung (ánh xạ mã lỗi/`error.code` → câu Việt có hướng xử lý); với "chưa xác nhận" hiện nút "Gửi lại email xác nhận" (`supabase.auth.resend`); lỗi đặt trong vùng `role="alert"`.

### P2

**M1-4. Kiểm tra bằng trình duyệt chặn trước thông điệp tiếng Việt.** Các form không có `noValidate` và input có `required`/`minLength={8}`/`type="email"` → trình duyệt tự chặn submit và hiện tooltip theo ngôn ngữ của hệ điều hành (thường tiếng Anh). Đoạn kiểm tra độ dài 8 ký tự bằng JS (`register:22-25`, `reset-password:30-33`) **không bao giờ chạy** cho trường hợp này (chỉ kiểm tra "không khớp" là chạy được). **Đề xuất:** `noValidate` + tự kiểm tra bằng thông điệp Việt, hiện lỗi từng ô, `aria-invalid`/`aria-describedby`, chuyển focus tới ô lỗi đầu tiên.

**M1-5. 8 ô nhập không có `autoComplete`/`name`/`spellCheck`** (login 2, register 3, forgot 1, reset 2; cộng 3 ô ở Hồ sơ — chi tiết ở §41.3): email `autoComplete="email"`, mật khẩu đăng nhập `current-password`, mật khẩu mới `new-password`. Trình quản lý mật khẩu không đề xuất/lưu đúng, người dùng phải gõ lại.

**M1-6. Không có nút hiện/ẩn mật khẩu** ở cả 5 ô mật khẩu (login 1, register 2, reset 2) — đặc biệt tệ ở ô "nhập lại". Dùng `Eye`/`EyeOff` của `lucide-react` sẵn có, không thêm thư viện.

**M1-7. Yêu cầu mật khẩu chỉ nằm trong placeholder** ("Tối thiểu 8 ký tự", `register:96`, `reset-password:90`) nên biến mất khi bắt đầu gõ; không có gợi ý cố định bên dưới ô, không chỉ báo độ mạnh. Thêm dòng gợi ý `text-xs text-muted` gắn `aria-describedby`.

**M1-8. Sau khi gửi email không có "Gửi lại", không có đếm ngược, không sửa được email gõ sai.** Màn "Kiểm tra email" của `register:56-72` và `forgot-password:32-50`: không có nút gửi lại (Supabase giới hạn ~1 email/60 giây, người dùng bấm lại sẽ gặp lỗi tiếng Anh ở M1-3); màn đăng ký cũng không có liên kết trở lại đăng nhập hay "đổi email".

**M1-9. Đăng nhập Google: chỉ có ở trang đăng nhập, không xử lý lỗi hay trạng thái chờ.** `login/page.tsx:33-38` bỏ qua giá trị trả về của `signInWithOAuth` (nếu nhà cung cấp lỗi/chưa bật thì không có gì xảy ra), nút không vô hiệu hoá khi đang chuyển hướng; trang đăng ký không có nút này (`GoogleButton` nhãn "Đăng nhập với Google"), người mới phải đoán rằng dùng nút ở trang đăng nhập cũng tạo tài khoản. **Đề xuất (cần người dùng quyết):** thêm nút "Đăng ký với Google" vào trang đăng ký, hay để nguyên nhưng ghi chú.

**M1-10. Link đặt lại hết hạn: ngõ cụt.** `reset-password/page.tsx:68-76`: nói "Yêu cầu 1 link đặt lại mật khẩu mới ở trang Quên mật khẩu" nhưng không có liên kết/nút nào tới trang đó.

**M1-11. Đổi mật khẩu xong: không xác nhận, và lỗi thu hồi phiên bị nuốt.** `reset-password:49-54`: `revoke-others` `.catch(() => undefined)` — BR-10 là điều khiển bảo mật, thất bại mà không báo khiến người dùng tin rằng các thiết bị khác đã bị đăng xuất; rồi `router.push("/")` không có toast "Đã đổi mật khẩu". **Đề xuất:** nếu thu hồi lỗi, hiện cảnh báo "Không đăng xuất được các thiết bị khác — vào Hồ sơ → Phiên đăng nhập để thu hồi thủ công".

**M1-12. Sau đăng nhập luôn về trang chủ; bị đá ra không có lời giải thích.** `login/page.tsx:30` bỏ qua `?redirect=` mà trang dự án đã gửi (M5-8) và `RequireAuth` không gửi kèm đường dẫn (B10); khi phiên hết hạn giữa chừng người dùng bị chuyển về `/login` không một dòng "Phiên đã hết hạn, đăng nhập lại". Gộp với B10/M5-8: tên tham số `redirect`, chỉ nhận đường dẫn nội bộ bắt đầu bằng `/` (và không bắt đầu bằng `//`).

**M1-13. Liên kết chân form nhỏ và nhãn không phải hành động.** `login/page.tsx:76-83`: hai liên kết chữ `text-[11px]` không đệm, cao khoảng 14px (dưới 44px rất xa); "Chưa có tài khoản?" là câu hỏi chứ không phải nhãn hành động, trong khi trang đăng ký làm đúng ("Đã có tài khoản?" + liên kết "Đăng nhập" ở `register:117-122`). **Đề xuất:** thống nhất kiểu "Chưa có tài khoản? **Đăng ký**", tăng vùng bấm.

### P3
- **M1-14.** Màn "Kiểm tra email" (`register`, `forgot-password`) dùng `AuthCard` không có `title` nên trang **không có `<h1>`**, chỉ có `<h2>`. Cho `AuthCard` một prop `title` và bỏ `h2`.
- **M1-15.** `forgot-password/page.tsx:56-60`: mô tả bị lặp hai lần ("Nhập email đã đăng ký, chúng tôi sẽ gửi liên kết…" rồi ngay bên dưới "Nhập email, mình sẽ gửi link…"), lẫn giọng "chúng tôi"/"mình" và "liên kết"/"link" (cũng "Mình đã gửi" ở `register:65`).
- **M1-16.** Trang xác thực vẫn hiện `SiteHeader` (nút Đăng nhập/Đăng ký lặp lại) và logo hai lần trên màn rộng (header + `AuthCard`); `h1` 23px (`auth-card.tsx:38`) khác 26px của `PageHeader`; người đã đăng nhập vẫn vào được `/login`, `/register`, `/forgot-password` mà không bị chuyển hướng.
- **M1-17.** SVG Google (`auth-card.tsx:81`) thiếu `aria-hidden`; placeholder `••••••••` ở ô nhập lại dễ bị hiểu là giá trị điền sẵn.
- **M1-18.** Trang đăng ký không có điều khoản/chính sách quyền riêng tư (cân nhắc theo phạm vi đồ án).

### Điểm mạnh (đừng đổi)
Thông điệp quên mật khẩu không tiết lộ email có tồn tại hay không ("Nếu … đã đăng ký"); phát hiện email đã đăng ký khi Supabase không báo lỗi (`register:44-51`, bằng `identities` rỗng) và nói rõ bước tiếp theo; `reset-password` có mốc chờ 3 giây thay vì quay mãi; ghi rõ "hiệu lực 1 giờ, dùng được 1 lần"; BR-10 thu hồi phiên khác được nghĩ tới; nhãn nút đổi sang "Đang …" và vô hiệu khi gửi; `emailRedirectTo` trỏ đúng `/auth/callback`; bố cục hai cột với câu giá trị đặc thù cho sản phẩm ("Quản lý phiên bản cho bản nhạc đang hình thành.") và `MiniRoll` trang trí có `aria-hidden`; dùng token màu, không hex cứng (ngoài logo Google).

### Gợi ý thứ tự sửa cho module 1
1. **Không bị kẹt:** M1-1 (callback), M1-10 (link hết hạn), M1-3 (dịch lỗi + gửi lại email xác nhận) — một hàm `authErrorMessage` + một khối "gửi lại".
2. **Bảo mật:** M1-2 sau khi xác minh cấu hình Supabase; M1-11.
3. **Form chuẩn:** M1-4, M1-5, M1-6, M1-7 — sửa `AuthField`/`AUTH_INPUT_CLASS` một lần, dùng cho 4 trang (gộp với cụm "Form + copy" ở §42).
4. **Luồng:** M1-8, M1-9, M1-12 (theo B10/M5-8).
5. **Dọn nhỏ:** M1-13–18.

### Quyết định của người dùng (29/09/2026)
1. **Không thêm nút Google vào trang đăng ký** — đăng ký và đăng nhập bằng Google dùng chung nút ở trang đăng nhập. Phần còn lại của M1-9 (xử lý lỗi, trạng thái chờ khi bấm nút Google) vẫn cần làm; có thể cân nhắc đổi nhãn nút thành "Tiếp tục với Google" để người mới hiểu là dùng cho cả đăng ký (chưa quyết, tuỳ chọn).
2. **M1-2 (đổi mật khẩu qua `/reset-password` bằng phiên bất kỳ) — TẠM BỎ QUA.** Vẫn ghi lại ở trên như một rủi ro đã biết; không xác minh cấu hình Supabase, không sửa trong đợt tới. Khi chạy đánh giá bảo mật sau này, xem lại mục này.
3. **Điều khoản / chính sách riêng tư khi đăng ký (M1-18): CÓ CẦN, làm sau.** Chưa có nội dung; không làm trong đợt sửa hiện tại.

### Cách tiếp tục
Module kế tiếp: **2 (đã xong — §47)** rồi 6 (editor).

**Trạng thái cuối phiên:** không sửa code, không commit/push, không tiến trình nền.

---

## §47 — Bước B, module 2 (hồ sơ + quản trị): báo cáo audit, CHƯA sửa (29/09/2026)

**Đã đọc đủ:** `app/profile/page.tsx`, `app/profile/sessions/page.tsx`, `app/admin/users/page.tsx`; đối chiếu backend để xác minh: `backend/src/auth/auth.service.ts` (`verifyPassword`, `changePassword`, `deleteAccount`), `backend/src/admin/admin.service.ts` + `dto/list-users-query.dto.ts` (phân trang). **Chưa đọc:** `theme-picker` chi tiết đã có ở B, `lib/api-client.ts`, backend `users` (không biết `PATCH /users/me` xử lý trường thiếu thế nào). Phân tích tĩnh.

**Số lỗi:** P1 = 3, P2 = 11, P3 = 4 (18 mục).

### P1

**M2-1. Tài khoản đăng nhập bằng Google không thể đổi mật khẩu và KHÔNG THỂ XOÁ TÀI KHOẢN.** Backend xác thực cả hai thao tác bằng `verifyPassword(email, password)` (`auth.service.ts:36-60,231-241,250-257`, gọi `grant_type=password`), còn tài khoản Google không có mật khẩu (backend chỉ lưu `google_id`, `auth.service.ts:102-115`). Frontend không hề phân nhánh theo nhà cung cấp: `profile/page.tsx:196` hỏi "Mật khẩu hiện tại" và `:268` "Nhập mật khẩu để xác nhận xoá vĩnh viễn". Người dùng Google (nay là con đường chính để đăng ký — quyết định §46) nhập gì cũng nhận "Current password is incorrect"/"Password is incorrect" (tiếng Anh). Hệ quả: không có cách nào xoá tài khoản (quyền xoá dữ liệu cá nhân) và không thể đặt mật khẩu. **Đề xuất (cần quyết cách xác nhận cho tài khoản không mật khẩu):** phát hiện nhà cung cấp (`user.app_metadata.provider`/`identities`), ẩn ô mật khẩu với tài khoản Google và thay bằng xác nhận khác (đăng nhập lại bằng Google trước khi xoá — re-auth — hoặc gõ chữ "XOÁ"/email); cho phép "Đặt mật khẩu" để dùng cả hai cách. Phần này cần cả backend.

**M2-2. Một lần thu hồi thiết bị bị lỗi làm cả danh sách biến mất.** `profile/sessions/page.tsx:44`: `if (error) return <p …>{error}</p>;` chạy trước `return` danh sách; `handleRevoke` (dòng 37-38) gọi `setError` khi lỗi → danh sách `sessions` đã tải vẫn còn trong state nhưng không được vẽ nữa, chỉ còn một dòng chữ đỏ, không nút thử lại. Cùng dạng "lỗi che mất giao diện" như M5-1. **Đề xuất:** tách `loadError` (thay danh sách) khỏi `actionError` (banner/Toast trên danh sách).

**M2-3. Quản trị viên chỉ thấy được 20 người dùng đầu tiên.** `admin/users/page.tsx:152-164` gọi `/admin/users?…` không truyền `page`/`limit`, không có phân trang, bỏ phí `total`/`page`/`limit` trả về (dòng 27-32); backend mặc định `limit = 20` (`admin.service.ts:25-26`, `list-users-query.dto.ts:17,24`). Người thứ 21 trở đi chỉ tìm ra khi biết chính xác username/email; màn hình không hề nói còn bao nhiêu người. **Đề xuất:** phân trang + hiện "1–20 / N", đưa `page/search/status` lên URL.

### P2

**M2-4. Không thể gỡ ảnh đại diện.** `profile/page.tsx:46` gửi `avatarUrl: avatarUrl || undefined`; `JSON.stringify` bỏ khoá có giá trị `undefined`, nên xoá trống ô "Avatar URL" rồi Lưu thì trường không được gửi (cần xác minh backend có coi thiếu = giữ nguyên — thường là vậy với DTO `whitelist`). Người dùng không có cách bỏ ảnh. **Đề xuất:** gửi `null` khi rỗng và cho backend nhận `null`.

**M2-5. Lỗi từ backend hiện nguyên văn tiếng Anh — vấn đề hệ thống, không chỉ ở form xác thực.** Backend ném các thông điệp như `'Current password is incorrect'`, `'Password is incorrect'`, `'Could not update password'`, `'Project not found'` (`auth.service.ts:88,241,257`, `explore.service.ts:135`), còn frontend hầu như luôn `setError(err.message)` (`profile:52,169,247`, `sessions:23,38`, `admin:83,162`, `branch-list.tsx:36` `messageOf`, …). Chuỗi "Có lỗi xảy ra" chỉ là dự phòng khi lỗi không phải `ApiError`. **Đề xuất:** một hàm `apiErrorMessage(err)` trong `lib/` ánh xạ theo `status` + mã/thông điệp đã biết sang tiếng Việt có hướng xử lý; thay thế toàn bộ `err.message` trần. Cùng gốc với M1-3 — làm một lần cho cả hai module.

**M2-6. Đổi mật khẩu không có ô nhập lại, không có nút hiện/ẩn.** `profile/page.tsx:194-223`: chỉ một ô "Mật khẩu mới" ẩn dấu chấm; gõ nhầm là bị khoá khỏi tài khoản (phải dùng "Quên mật khẩu"). Đăng ký thì có ô nhập lại. Cùng lỗi `minLength` chặn trước thông báo Việt (M1-4), gợi ý mật khẩu chỉ ở placeholder (M1-7).

**M2-7. Xoá tài khoản: các chi tiết còn thiếu.** `profile/page.tsx:228-293`: ô mật khẩu chỉ có placeholder, không `<label>`, không nằm trong `<form>` (Enter không gửi), thiếu `autoComplete="current-password"`; sau khi xoá thành công chỉ `signOut()` rồi về trang chủ, không có thông báo "Tài khoản đã được xoá"; bấm "Huỷ" không xoá mật khẩu đã gõ khỏi state; mô tả nói "toàn bộ dự án và lịch sử" nhưng không cho biết là bao nhiêu dự án. Điểm tốt: có bước nhập mật khẩu, có mô tả hậu quả. **Đề xuất:** dùng dialog dùng chung (B2), có `<label>`, thông báo sau xoá.

**M2-8. Trang Thiết bị: tên thiết bị khó đọc và thiếu thao tác hàng loạt.** `auth-context.tsx:38-41` lưu `deviceLabel: navigator.userAgent` nên danh sách hiện chuỗi như "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 …" (`sessions/page.tsx:65`); không có "Đăng xuất tất cả thiết bị khác" dù API `revoke-others` đã có sẵn (dùng ở `reset-password`); thu hồi không hỏi lại và không báo kết quả. **Đề xuất:** rút gọn "Chrome · Windows" (parse ở frontend khi hiển thị, không đổi dữ liệu lưu) + nút hàng loạt có xác nhận + toast.

**M2-9. Quản trị: thuật ngữ lẫn Anh–Việt và ba tên cho một khái niệm.** `admin/users/page.tsx:39-43` nhãn trạng thái "Active/Suspended/Removed", vai trò "Admin/User"; nút "Tạm khoá"/"Mở khoá" (dòng 241-247); tiêu đề hộp thoại "Đình chỉ @…"/"Kích hoạt lại @…" (dòng 91-93); bộ lọc "Active/Suspended". Cùng một hành động gọi là "Tạm khoá", "Đình chỉ" và "Suspended". **Đề xuất:** chốt một bộ từ vựng (ví dụ Hoạt động / Tạm khoá / Đã xoá) dùng cho nhãn, nút, tiêu đề hộp thoại và bộ lọc.

**M2-10. Quản trị: nút "Xoá" hiện với cả người dùng đã bị xoá, và không lọc được "Đã xoá".** `admin/users/page.tsx:253` (không điều kiện theo `status`), bộ lọc (dòng 196-199) chỉ có Active/Suspended dù `StatusBadge` có nhánh `removed` (dòng 42). Quản trị viên có thể bấm xoá lại một người đã xoá và không thể liệt kê những người đã xoá.

**M2-11. Quản trị: hộp thoại thao tác và trạng thái tải/lỗi.** `ActionPanel` (dòng 96-138) là hộp thoại tự dựng thứ N (B2): không role/`aria-modal`/Escape/focus trap; textarea "Lý do" và ô gõ lại username chỉ có placeholder (không `<label>`); `load()` (dòng 152-164) không có trạng thái tải (bảng trống lúc đầu) và **không xoá `error` khi lần tải sau thành công** nên lỗi cũ nằm mãi; xử lý xong không có toast.

**M2-12. Tìm kiếm quản trị chỉ khớp chính xác** (placeholder nói vậy, dòng 184) nên không thể duyệt/tìm gần đúng theo tên. Có thể là chủ ý bảo vệ dữ liệu cá nhân (email đã được che, `maskedEmail`) — **cần người dùng xác nhận** trước khi coi là lỗi; nếu là chủ ý thì việc M2-3 (không xem được người thứ 21+) càng cần phân trang theo username.

**M2-13. Trang Hồ sơ: tab không nằm trên URL và thiếu ARIA.** `profile/page.tsx:297,299-335`: `useState` cục bộ nên không có liên kết trực tiếp tới `?tab=security`, reload quay về "Hồ sơ"; nút điều hướng dạng tab không `aria-current`/`role`; thanh tab cuộn ngang trên điện thoại (`overflow-x-auto`) không có dấu hiệu còn nội dung. Gộp với B8.

**M2-14. Form hồ sơ.** `profile/page.tsx:78-116`: "Avatar URL" bắt dán liên kết ngoài (không tải ảnh lên; dùng Supabase Storage là hướng của kiến trúc, CLAUDE.md §2) — `Avatar` (`ui/avatar.tsx:21`) không có `onError` nên liên kết hỏng hiện biểu tượng ảnh vỡ khắp app (header, danh sách) và xem trước tải ảnh theo từng phím gõ; "Username" và "Tên hiển thị" không có gợi ý định dạng/độ dài (`maxLength`), lỗi (409 trùng username) hiện ở cuối form, xa ô nhập; không `autoComplete`/`name`.

### P3
- **M2-15.** "Đã lưu." (`profile:110`) không phải vùng thông báo (`role="status"`) và vẫn hiển thị khi người dùng đã sửa tiếp; không cảnh báo rời trang khi sửa dở.
- **M2-16.** Nếu `GET /users/me` lỗi (`auth-context.tsx:57-62` đặt `profile = null`), `ProfileForm` khởi tạo các ô trống (`profile/page.tsx:26-29`) và Lưu sẽ ghi đè hồ sơ bằng giá trị rỗng. Nên chặn form khi không có `profile`.
- **M2-17.** Nút "Đăng xuất" đang chạy hiện "Đang xoá…" (`sessions/page.tsx:81`) — nhãn lệch động từ; ngày giờ dùng `toLocaleString("vi-VN")` khai cứng (§41.3).
- **M2-18.** Quản trị: nút "Xoá" màu đỏ lặp ở mọi hàng (nhiễu thị giác, dễ bấm nhầm) — cân nhắc gom vào menu hàng; cột ngày tạo (`createdAt`) đã lấy về nhưng không hiển thị.

### Điểm mạnh (đừng đổi)
Email được che (`maskedEmail`) và ghi rõ "Email không thể thay đổi"; xoá người dùng bắt gõ lại username và bắt buộc lý do (phục vụ nhật ký kiểm toán); không có nút thu hồi cho thiết bị hiện tại, huy hiệu "Thiết bị này"; quản trị viên không thể thao tác lên tài khoản admin khác; đổi mật khẩu bắt nhập mật khẩu hiện tại và nói rõ hệ quả (các thiết bị khác bị đăng xuất); tách 3 nhóm Hồ sơ / Bảo mật / Cá nhân hoá đúng thiết kế đã chốt (CLAUDE.md §4.7); cổng vai trò ở giao diện + `RequireAuth`; toàn bộ dùng token.

### Gợi ý thứ tự sửa cho module 2
1. **Không bị chặn quyền lợi cơ bản:** M2-1 (người dùng Google xoá/đổi mật khẩu — cần cả backend, nên quyết định cách xác nhận trước), M2-2, M2-3.
2. **Hàm lỗi dùng chung:** M2-5 + M1-3 → `apiErrorMessage` một lần.
3. **Form:** M2-4, M2-6, M2-7, M2-14 (gộp cụm "Form + copy" §42).
4. **Quản trị:** M2-9, M2-10, M2-11, M2-12 (sau khi người dùng xác nhận ý đồ tìm kiếm).
5. **Dọn nhỏ:** M2-8, M2-13, M2-15–18.

### Việc cần người dùng quyết
1. Tài khoản Google (không có mật khẩu): xác nhận xoá tài khoản bằng cách nào (đăng nhập lại Google / gõ chữ "XOÁ" / gõ email) và có cho "Đặt mật khẩu" không?
2. Ảnh đại diện: giữ ô nhập liên kết hay chuyển sang tải ảnh lên (Supabase Storage)?
3. Tìm kiếm khớp chính xác ở trang quản trị là chủ ý (bảo vệ dữ liệu cá nhân) hay chỉ do làm nhanh?

### Cách tiếp tục
Còn **module 6 (editor)** — `components/midi-editor/*` và `audio-sketch`. Editor dùng inline style + canvas nên quy tắc Tailwind không áp dụng; âm thanh phải để người dùng tự nghe (CLAUDE.md §10). Sau đó: Bước C (`impeccable critique` cho module 0 + màn chính), D, E (sửa theo cụm), F (chạy app thật).

**Trạng thái cuối phiên:** không sửa code, không commit/push, không tiến trình nền.

---

## §48 — Bước B, module 6 (editor) PHẦN 1/3: vỏ editor, thanh công cụ, phím tắt, lưu tự động — báo cáo audit, CHƯA sửa (29/09/2026)

**Kế hoạch chia 3 phần cho editor:** 1/3 (mục này) = `redesign/editor-redesign.tsx` (header, tool strip, footer, bố cục 3 cột) + phần "vỏ" của `midi-editor.tsx` (tải nháp, phím tắt, tự lưu, hộp xác nhận xoá track) + `redesign/tokens.ts`; 2/3 = các panel và hộp thoại (`track-panel`, `history-panel`, `commit-dialog`, `restore-dialog`, `modal`, `export-dialog`, `audio-sketch-panel`); 3/3 = `piano-roll.tsx` + `velocity-lane.tsx` (canvas, bàn phím, tiếp cận được).

**Đã đọc:** `editor-redesign.tsx` (toàn bộ), `redesign/tokens.ts`, các đoạn của `midi-editor.tsx`: state (dòng 61-127), tải nháp (218-236), phím tắt (238-279), tự lưu (320-336) và `flushDraft` (400-419), phần render (1023-1146); grep phím tắt/`beforeunload` toàn thư mục `midi-editor`. **Chưa đọc:** phần phát nhạc/Tone.js của `midi-editor.tsx` (dòng 310-1000, nằm ngoài phạm vi giao diện; ghi chú CLAUDE.md §10 về kiểm tra âm thanh), `piano-roll`/`velocity-lane` (phần 3). Phân tích tĩnh; các con số kích thước là **ước lượng**, cần đo trên trình duyệt thật.

**Số lỗi:** P1 = 4, P2 = 10, P3 = 4 (18 mục). Hai lỗi P1 đầu là rủi ro **mất dữ liệu người dùng**.

### P1

**M6-1. Tải bản nháp thất bại → editor mở ra với bản nháp RỖNG, và lần chỉnh sửa đầu tiên tự lưu đè lên bản nháp thật.** `midi-editor.tsx:63-68` khởi tạo `snapshot` là bản rỗng (0 track, 0 note), `:219-232` `getDraft(...).catch(console.error).finally(() => setLoading(false))` nuốt lỗi rồi vẫn hiện editor. Người dùng thấy dự án "trống" như thể mất hết; chỉ cần vẽ một nốt, `updateSnapshot` → `scheduleSave` (dòng 321-336) sau 2 giây `putDraft` ghi bản (rỗng + 1 nốt) đè lên nháp thật trên server. Kích hoạt bằng một lỗi mạng thoáng qua lúc mở trang. Bản nháp chưa commit sẽ mất hẳn (commit đã lưu vẫn còn nhưng nháp thì không). **Đề xuất:** thêm trạng thái `loadError`; khi lỗi hiện màn "Không tải được bản nháp — Thử lại" và **không** cho render editor cũng như không bật tự lưu; chỉ `setSnapshot` từ dữ liệu server. Cần kiểm tra thêm `getDraft` với dự án chưa có nháp (404?) có trả bản mặc định không để không nhầm với lỗi.

**M6-2. Lưu tự động thất bại im lặng, không thử lại, không cảnh báo khi đóng tab.** `midi-editor.tsx:325-333`: debounce 2 giây, `catch { setSaveStatus("unsaved") }` — chỉ đổi một chấm nhỏ ở chân trang, không thử lại (chỉ lần chỉnh sửa tiếp theo mới lưu lại), không thông báo. `grep beforeunload|pagehide` toàn thư mục: không có. Dọn dẹp lúc unmount (`:285-292`) chỉ chạy khi chuyển route trong app, **không chạy khi đóng tab, reload hoặc mất kết nối**; do đó khoảng 2 giây chỉnh sửa cuối (hoặc mọi thứ sau một lần lỗi mạng) mất mà không cảnh báo. **Đề xuất:** (a) thử lại có lùi dần (vd 2s → 5s → 15s) và Toast/thanh cảnh báo "Không lưu được — đang thử lại" khi thất bại; (b) `beforeunload` khi `saveStatus !== "saved"`; (c) khi `pagehide`, gửi `putDraft` bằng `fetch(..., { keepalive: true })`; (d) phân biệt trạng thái "chờ lưu" và "lưu lỗi" (hiện cùng nhãn "Chưa lưu").

**M6-3. Vỏ trang chiếm phần lớn chiều cao trên laptop (ước lượng ~430px).** Từ trên xuống: `SiteHeader` 56px + khối tiêu đề/tab của trang edit (`edit/page.tsx:86-126`, gồm liên kết "Quay lại" + `PageHeader` có `mb-6` + tab) ~140px + header editor 60px (`DC_SIZE.headerH`) + tool strip 48px + footer editor 34px + `SiteFooter` (giấy phép nhiều dòng, `site-footer.tsx`) ~90px ≈ **430px cố định**. Trên màn 1366×768 (vùng trình duyệt khoảng 650px) còn khoảng 220px cho cả piano roll lẫn dải velocity — gần như không thao tác được. Số liệu chỉ là ước lượng từ mã; **cần đo thật** (DevTools) trước khi chốt. **Đề xuất:** chế độ "editor toàn màn hình" — trang edit không hiện `PageHeader`/tab/`SiteFooter` (gộp với M3-8: chuyển form thông tin sang trang Cài đặt), thu `SiteHeader` còn thanh mỏng; đảm bảo `main` vẫn là vùng cuộn đúng như CLAUDE.md §10.

**M6-4. Thanh công cụ 25+ điều khiển nhồi vào một dải 48px cuộn ngang; các nút quan trọng bị đẩy ra ngoài.** `editor-redesign.tsx:408-614` (`toolStrip` `overflowX: "auto"`, cao cố định 48px, dòng 887-897) chứa Select/Draw/Erase, 4 Grid, Quantize, Zoom ±, Velocity, BPM, SPEED, âm lượng chung, All/Copy/Paste, Undo/Redo, Import MIDI, Export MIDI, Export Audio, Audio sketch: ước lượng ~1900-2100px nội dung. Màn dưới ~2000px sẽ phải cuộn ngang; nhóm Import/Export/Audio sketch nằm cuối bên phải (sau `flex: 1`) nên biến mất khỏi tầm nhìn, không có dấu hiệu nào cho biết còn nội dung (thanh cuộn của hệ điều hành lại chiếm chiều cao 48px và có thể che nút). Vượt xa giới hạn ~7 lựa chọn cùng lúc. **Đề xuất:** gom theo nhóm chức năng: (1) công cụ vẽ + lưới + quantize (giữ ngoài), (2) chỉnh sửa (Undo/Redo giữ; Copy/Paste/All chuyển thành icon hoặc menu), (3) nhóm "Tệp" một nút menu chứa Import/Export MIDI/Export Audio/Audio sketch, (4) BPM/Speed/Master volume vào popover "Phát". Giữ nguyên chức năng, đổi cách trình bày.

### P2

**M6-5. Thiếu phím tắt chuẩn của phần mềm nhạc.** `midi-editor.tsx:240-279` chỉ có Ctrl/Cmd + C, V, A, Z, Y (và Shift+Z). Không có: **Space** phát/tạm dừng, **Delete/Backspace** xoá note đã chọn (grep `piano-roll`/`velocity-lane` không thấy xử lý phím nào → xoá note chỉ bằng công cụ Erase), chọn công cụ nhanh, mở commit (Ctrl+Enter/Ctrl+S), về đầu bài. Người chơi thành thạo (persona Alex) sẽ phải với chuột cho mọi thao tác lặp lại.

**M6-6. Nút chỉ có biểu tượng chỉ dựa vào `title`; trạng thái bật/tắt không được truyền tới công nghệ hỗ trợ.** Play/Pause/Stop/Loop/Metronome (`:322-381`), Zoom ± (`:455-461`), nút dải velocity (`:467-482`) không có `aria-label`/nhãn chữ. Loop và Metronome là nút bật/tắt nhưng không có `aria-pressed` (chỉ nút velocity có, `:474`); bộ chọn công cụ (Select/Draw/Erase) và Grid không có `aria-pressed` hay `role="radiogroup"`, trạng thái đang chọn chỉ khác nhau bằng nền/màu chữ. Các nút bị vô hiệu giải thích lý do chỉ bằng `title` (không hiện trên bàn phím/cảm ứng). Đã nêu tổng quát ở §41.3; đây là bản chi tiết cho editor.

**M6-7. Không có trạng thái hover/focus cho toàn bộ nút.** *[ĐÍNH CHÍNH sau Bước F, §51.2: phần "focus" SAI cho nút — đo thật, các nút inline-style vẫn có viền focus mặc định `outline: auto`; chỉ phần hover (không thể có với inline style) còn đúng. Các ô nhập/thanh trượt không thấy focus xem M6-22.]* Mọi nút dùng `style={...}` (inline) nên không thể có `:hover`/`:focus-visible` (CLAUDE.md §4.7 chưa có quy ước cho editor). Người dùng bàn phím không thấy đang ở nút nào; chuột không có phản hồi khi rê. Đề xuất: đưa kiểu tương tác (hover/focus/active/disabled) ra một lớp CSS dùng chung (`.stave-tool-btn`) trong `globals.css`, giữ nguyên phần bố cục inline nếu muốn.

**M6-8. Điều khiển phát nhạc: Play và Pause là hai nút riêng, không có chỉ báo vị trí.** `:322-358` — Play bị vô hiệu khi đang phát, Pause bị vô hiệu khi không phát (mỗi lúc một nút "chết"); chuẩn thường là một nút bật/tắt cộng phím Space (M6-5). Header và footer không hiện **vị trí phát** dạng ô nhịp.phách hoặc thời gian (footer chỉ có BPM, nhịp, số note/track, `:676-696`) — người dùng chỉ biết vị trí qua vạch đỏ trong piano roll (chưa đọc, phần 3).

**M6-9. Menu chọn nhánh chưa hoàn chỉnh về bàn phím.** `:273-311`: có `aria-haspopup`/`aria-expanded` (tốt hơn `site-header`), `role="listbox"` + `role="option"`, nhưng không có phím mũi tên, không Escape, focus không chuyển vào menu, lớp phủ đóng là `<div onClick>` (`:277-280`, `branchBackdrop` `position: fixed`). Với `role="listbox"` trình duyệt/screen reader kỳ vọng hành vi listbox. Dùng mẫu `menu` đơn giản hoặc bổ sung phím.

**M6-10. Trạng thái lưu — tín hiệu quan trọng nhất — nằm ở chân trang, chữ nhỏ.** `:676-686`: chấm màu + "Đã lưu nháp/Đang lưu…/Chưa lưu" cỡ 11.5px, xa nút Commit và vùng làm việc; không `role="status"`/`aria-live`; nhãn "Chưa lưu" gộp cả "đang chờ 2 giây" và "lưu lỗi" (M6-2). Người dùng đang lo dữ liệu sẽ khó biết an toàn hay chưa. Đề xuất: đặt chỉ báo cạnh nút Commit ở header, có `aria-live="polite"`.

**M6-11. Không thích ứng với màn hình nhỏ.** `DC_SIZE.trackPanelW = 262`, `historyPanelW = 322` (`tokens.ts:56-57`) cố định, không thu gọn được: ở 1280px piano roll còn ~696px, ở 1024px còn ~440px, ở tablet/điện thoại gần như không dùng được và không có thông báo nào. Cần người dùng quyết: editor **chỉ dành cho máy tính** (hiện thông báo "Trình soạn nhạc cần màn hình rộng hơn" dưới ~1024px) hay hỗ trợ ẩn/hiện từng panel (ưu tiên panel Lịch sử).

**M6-12. Ngôn ngữ lẫn lộn trên cùng một thanh.** Nhãn tiếng Anh: "Commit Changes" (`:402`), "Select/Draw/Erase" (`:61-65`), "Quantize", "All/Copy/Paste/Undo/Redo" (`:544-586`), "Import MIDI/Export MIDI/Export Audio/Audio sketch" (`:594-613`), "Loading draft…" (`midi-editor.tsx:1028`); còn tooltip tiếng Việt ("Hoàn tác", "Xuất project…") và chân trang tiếng Việt ("Đã lưu nháp", "NHỊP"). Thuật ngữ âm nhạc (BPM, Quantize, Grid) giữ tiếng Anh có thể chấp nhận, nhưng nhãn hành động nên thống nhất. Cần người dùng chốt quy ước.

**M6-13. Phím tắt toàn cục tác động lên editor phía sau hộp thoại.** `midi-editor.tsx:277` gắn ở `window`, chỉ bỏ qua khi `target` là INPUT/TEXTAREA/contentEditable (dòng 244-251). Khi một hộp thoại đang mở mà focus ở nền (vd sau khi bấm khoảng trống của hộp thoại), Ctrl+Z/Ctrl+V/Ctrl+A vẫn hoàn tác/dán/chọn tất cả trong editor phía sau; hộp thoại cũng không đặt lại khoá. Ngoài ra tooltip luôn ghi "Ctrl" kể cả Mac (`:551,560,572,581`), trong khi mã dò Mac bằng `navigator.platform` đã lỗi thời (`:253`).

**M6-14. Ô nhập BPM không cho gõ số mới từ đầu.** `:489-499`: ô `<input type="number" value={tempo}>` là điều khiển có kiểm soát; `onChange` chỉ áp dụng khi 20 ≤ giá trị ≤ 300 (`:495-496`). Chọn hết chữ trong ô rồi gõ "9" (mong muốn 90): 9 nằm ngoài khoảng nên không được áp dụng, React trả ô về giá trị cũ → không thể xoá sạch để gõ số hai/ba chữ số từ đầu (chỉ sửa được từng chữ số tại chỗ). Cần trạng thái cục bộ dạng chuỗi, áp dụng khi `blur`/Enter và kẹp giá trị; thêm `aria-label="Tempo (BPM)"`.

### P3
- **M6-15.** Màu cứng `#fff` ở nút hành động (`editor-redesign.tsx:329,366,377,880`; `modal.tsx:73,86`) và `rgba(0,0,0,.08)` cho bóng — dùng `var(--accent-foreground)`/token, đúng CLAUDE.md §4.7.
- **M6-16.** Nhãn "Commit Changes" không khớp hành động thật ("Ghi lại phiên bản", theo tooltip); đổi thành "Tạo commit".
- **M6-17.** Màn tải "Loading draft…" tiếng Anh, vòng quay CSS `animation: spin` không có `prefers-reduced-motion` (`midi-editor.tsx:1027-1029,1138-1145`).
- **M6-18.** `projectName` bị cắt ở 260px (`editor-redesign.tsx:764-772`) chỉ hiện tên đầy đủ qua `title` — dự án tên dài (vd có ghi chú phiên bản) không đọc được đầy đủ.

### Điểm mạnh (đừng đổi)
Hộp xác nhận xoá track nêu rõ hậu quả (`midi-editor.tsx:1108-1122`); undo/redo tới 100 bước có gộp thao tác kéo thả thành một lần lùi (`:205-216`), không cướp phím khi đang gõ trong ô nhập; `flushDraft` ghi bản nháp **trước** khi commit và ném lỗi để không commit nhầm bản cũ (`:406-419`); các nút bị vô hiệu đều kèm `title` giải thích lý do (Commit, Copy, Paste, Undo, Redo); nhánh: `role="alert"` cho lỗi chuyển nhánh; âm lượng chung chỉ ảnh hưởng phát, không ghi vào dữ liệu (ghi chú rõ lý do ở `:93-99`); màu editor qua token `DC` (đổi theo theme); dải velocity có thể ẩn để lấy lại chiều cao; footer chỉ hiện số liệu thật.

### Việc cần người dùng quyết
1. Editor **chỉ dành cho máy tính** (hiện thông báo dưới ~1024px) hay hỗ trợ thu gọn panel?
2. Quy ước ngôn ngữ nhãn nút trong editor (Việt hoá nhãn hành động, giữ thuật ngữ nhạc BPM/Quantize/Grid)?
3. Bảng phím tắt cần có: Space, Delete/Backspace, chọn công cụ, Ctrl+Enter/S? (cần đồng ý phím nào cho tính năng nào).
4. Chế độ "editor toàn màn hình" (ẩn header/tab/footer trang, gỡ `PageHeader` khỏi trang edit) — cùng quyết định với M3-8.

### Gợi ý thứ tự sửa cho phần 1
1. **Chặn mất dữ liệu (làm đầu tiên):** M6-1, M6-2 — độc lập với mọi thứ khác, ít rủi ro giao diện.
2. **Không gian làm việc:** M6-3 (đo thật trước) + M6-4 (gom thanh công cụ) + M6-11.
3. **Bàn phím và trợ năng:** M6-5, M6-6, M6-7, M6-9, M6-13, M6-14.
4. **Dọn nhỏ:** M6-8, M6-10, M6-12, M6-15–18.

### Cách tiếp tục
Làm **phần 2/3** (panel + hộp thoại): `track-panel.tsx`, `history-panel.tsx`, `commit-dialog.tsx`, `restore-dialog.tsx`, `modal.tsx`, `export-dialog.tsx`, `audio-sketch-panel.tsx`; sau đó **phần 3/3** (`piano-roll.tsx`, `velocity-lane.tsx`). Xong module 6 → Bước C/D/E/F (§41.1). Kiểm tra bằng tay M6-1/M6-2 (ngắt mạng lúc mở/khi sửa) khi có điều kiện.

**Trạng thái cuối phiên:** không sửa code, không commit/push, không tiến trình nền.

---

## §49 — Bước B, module 6 (editor) PHẦN 2/3: panel Track, panel Lịch sử, hộp thoại Commit/Khôi phục/Xuất âm thanh, Audio sketch — báo cáo audit, CHƯA sửa (29/09/2026)

**Đã đọc đủ:** `redesign/track-panel.tsx`, `redesign/history-panel.tsx`, `redesign/commit-dialog.tsx`, `redesign/restore-dialog.tsx`, `redesign/modal.tsx` (đọc ở §48), `redesign/use-version-control.ts`, `export-dialog.tsx`, `components/audio-sketch/audio-sketch-panel.tsx`, `lib/use-audio-recorder.ts`; grep mã đặc tả `(UC-xx)/(BR-xx)` toàn frontend. **Chưa đọc:** `redesign/change-summary.ts` (biết là có `summarizeChanges`), `lib/audio-exporter.ts`, `lib/wav-encoder.ts`. Phân tích tĩnh; chưa nghe/không chạy âm thanh (CLAUDE.md §10).

**Số lỗi:** P1 = 3, P2 = 12, P3 = 5 (20 mục). Số thứ tự tiếp nối §48 (M6-19 trở đi).

### P1

**M6-19. Khôi phục phiên bản có thể xoá công việc chưa commit mà không cảnh báo mạnh.** `restore-dialog.tsx:66-71` chỉ hiện khối đỏ khi `hasUnsavedChanges`; `editor-redesign.tsx:713` truyền `hasUnsavedChanges={saveStatus !== "saved"}` — tức chỉ "chưa lưu **xuống server**". Nhưng bản nháp thường đã được tự lưu mà vẫn **khác commit mới nhất** (công việc chưa commit, tình huống bình thường nhất khi đang soạn nhạc). Khôi phục ghi đè bản nháp đó (đúng như gạch đầu dòng 2 của chính hộp thoại, dòng 61-63, nhưng chỉ ở dạng chữ thường) và bản nháp cũ không lấy lại được. Người dùng thấy chấm "Đã lưu nháp" xanh sẽ hiểu nhầm là an toàn. **Đề xuất:** so sánh bản nháp với snapshot HEAD (đã có `summarizeChanges` dùng cho hộp Commit) — nếu khác thì hiện khối đỏ nêu số thay đổi sẽ mất và cho chọn "Commit thay đổi hiện tại rồi khôi phục" hoặc đổi nút thành "Bỏ thay đổi và khôi phục".

**M6-20. Đóng hộp thoại Audio sketch làm mất bản ghi âm (tới 3 phút) không cảnh báo.** `editor-redesign.tsx:730-737` mở `AudioSketchPanel` trong `Modal` mà không truyền `closeDisabled`; `Esc` hoặc bấm nền đều đóng (`modal.tsx:31-47`) → panel unmount → `useAudioRecorder` nhả micro (`use-audio-recorder.ts:68`) và bản ghi đang thu hoặc đang chờ cắt/đặt tên/đính kèm biến mất; đóng giữa lúc `attaching` (đang tải lên) cũng vậy. Bản ghi là dữ liệu người dùng không tái tạo được (một ý tưởng hát/đàn). **Đề xuất:** truyền `closeDisabled` khi `recording || attaching`, và khi đang xem lại bản ghi chưa đính kèm thì hỏi xác nhận trước khi đóng.

**M6-21. Lịch sử trong editor chỉ hiện 20 commit gần nhất, không có cách xem thêm.** `use-version-control.ts:33` `HISTORY_PAGE_SIZE = 20`, `getCommitHistory({ branchId, limit })` không có `offset/cursor`; `history-panel.tsx:280-285` chỉ ghi "Đang hiện 20 phiên bản mới nhất trên tổng số N" mà không có nút "Xem thêm". Thêm vào đó M3-3 (chủ dự án riêng tư không có lối vào trang dự án có tab Commit) → commit cũ hơn 20 gần như **không khôi phục/gắn tag được** từ giao diện. **Đề xuất:** nút "Xem thêm" (phân trang bằng `offset`) hoặc liên kết "Xem toàn bộ lịch sử" tới `/projects/:id?tab=commits&branch=…` (sau khi sửa M3-3).

### P2

**M6-22. Nhiều ô nhập và thanh trượt không hiện dấu focus.** Inline style `outline: "none"` mà không có thay thế: ô nhập nội dung commit (`commit-dialog.tsx:228`), ô nhập tag (`history-panel.tsx:479`), ô tìm nhạc cụ (`track-panel.tsx:606`); riêng thanh VOL/PAN dùng `<input type="range">` phủ `opacity: 0` (`track-panel.tsx:558-565`) nên dù dùng phím mũi tên được, người dùng không thấy thanh nào đang được chọn. (Ô đổi tên track có viền accent nên ổn, `:489`.) Cùng cụm với M6-7.

**M6-23. Thẻ track là `<div onClick>`.** `track-panel.tsx:123-130`: chọn track — quyết định nốt mới vẽ vào track nào — không dùng được bằng bàn phím; ba khối con phải `stopPropagation()` (dòng 134,167,180,195,210,227,239,261). **Đề xuất:** thẻ là phần tử tương tác thật (nút chọn track chiếm tên/vùng nhãn) hoặc `role="button" tabIndex={0}` + `onKeyDown`; tốt hơn là tách vùng chọn track khỏi các nút điều khiển bên trong.

**M6-24. Nút điều khiển track không có nhãn và mục tiêu quá nhỏ.** "M"/"S" 27×27px chỉ có `title` (`aria-label` thiếu) và không `aria-pressed`; nút xoá là ký tự "✕" (`:221`); chấm màu 10×10px đóng vai nút đổi màu (`:133-140`) — không có dấu hiệu bấm được; 12 ô màu chỉ có `title={hex}` (không tên màu) và ô đang chọn chỉ khác viền 2px (`:371-385`). Ghi chú CLAUDE.md §4.7: bảng màu track là dữ liệu người dùng, giữ nguyên hex.

**M6-25. Bộ chọn nhạc cụ 128 mục thiếu điều hướng bàn phím.** `track-panel.tsx:281-359`: có tìm + Enter chọn kết quả đầu + Esc đóng (điểm tốt) nhưng các nhạc cụ là 128 nút Tab lần lượt, không phím mũi tên, không `aria-selected`; nút đóng "✕" không nhãn; đóng xong không trả focus về nút mở.

**M6-26. Khung `Modal` dùng chung chưa hoàn chỉnh (cùng cụm B2).** `redesign/modal.tsx`: không focus trap, thiếu `aria-modal`, tiêu đề dùng `aria-label` thay vì `aria-labelledby` + tiêu đề là `div` không phải heading, không trả focus khi đóng; `RestoreDialog` không đặt focus ban đầu nên focus ở lại nút "Khôi phục" phía sau lớp phủ (Tab đi tiếp trong thanh công cụ phía sau); bấm nền/`Esc` đóng và **mất luôn nội dung commit đang gõ** (state ở trong `CommitDialog`, đóng là unmount). `Esc` dùng `window.addEventListener` + `stopPropagation()` (không ngăn được listener khác trên `window` như phím tắt editor, xem M6-13). **Đề xuất:** dùng Dialog dùng chung ở module 0 (B2); giữ nội dung commit trong state của cha hoặc hỏi trước khi đóng nếu đã gõ.

**M6-27. Hộp thoại Xuất âm thanh.** `export-dialog.tsx`: (a) lớp phủ `onClick={onClose}` (`:97`) đóng hộp thoại **kể cả khi đang render** (chỉ nút bị vô hiệu), không Escape, không có nút Huỷ khi đang render (`:218`, `disabled` khi rendering) nên project dài phải chờ hết; (b) `<label>` "Sample rate" (`:152`) không gắn với control nào, ba lựa chọn là nút thường không `aria-pressed`/không nhóm `radiogroup`; (c) thanh tiến trình không `role="progressbar"` / `aria-valuenow`, phần trăm cập nhật không thông báo; (d) `zIndex: 1000/1001` khác 50 của `Modal`/`ConfirmDialog`. Điểm tốt: có `role="dialog" aria-modal aria-labelledby`.

**M6-28. Tên file xuất làm hỏng tiếng Việt.** `export-dialog.tsx:54,72`: `projectName.replace(/[^a-z0-9_\-. ]/gi, "_")` thay MỌI ký tự có dấu bằng `_` — dự án "Bài hát mới" thành `B_i h_t m_i.wav` (tương tự tên track khi xuất riêng). Hệ điều hành hiện đại cho phép dấu tiếng Việt trong tên file. **Đề xuất:** chỉ loại các ký tự bị cấm (`\ / : * ? " < > |` và ký tự điều khiển), giữ chữ có dấu.

**M6-29. Emoji và ký tự làm biểu tượng, và màu `success` cho nút chính.** `export-dialog.tsx:104` (🎵), `:112` (✕), `:141,146` (⚠️), `:202` (✅), `:208` (❌), `:238-242` (↓); `track-panel.tsx:221,297,366` (✕), `:404` ("+ Add Track"). Lệch với `lucide-react` ở toàn app (CLAUDE.md §4.7 chọn thư viện icon duy nhất), hiển thị khác nhau theo hệ điều hành, screen reader đọc "dấu nhân/cảnh báo…". Nút chính "Xuất WAV" và lựa chọn đang chọn dùng màu `--success` (xanh lá), trong khi mọi hộp thoại khác dùng `--accent` — `success` mang nghĩa hệ thống "thành công" (BR-90).

**M6-30. Cắt audio sketch chỉ dùng được bằng con trỏ.** `audio-sketch-panel.tsx:125-138`: hai tay cầm chỉ có `onPointerDown` + lắng nghe `pointermove` trên `window` — không `role="slider"`, không `aria-valuenow`, không phím mũi tên, không ô nhập giây bắt đầu/kết thúc; chưa đặt `touch-action: none` nên trên cảm ứng trình duyệt sẽ cuộn thay vì kéo. Nút phát mỗi sketch chỉ có biểu tượng (`:479-486`), không nhãn; lỗi/cảnh báo (`:338-347`) không `role="alert"`; `error` cũ không xoá khi "Bỏ bản ghi" (`discardRecording`, `:218-226`).

**M6-31. Mã đặc tả nội bộ lộ ra giao diện người dùng.** Có 52 lần xuất hiện `(UC-xx)`/`(BR-xx)` trong 12 file; ít nhất 15 chỗ hiển thị thật: tooltip (`editor-redesign.tsx:448,594,598,602,608`, `track-panel.tsx:138,172,214`, `history-panel.tsx:250`), cảnh báo giới hạn **"Tối đa 32 track (BR-29)"** (`editor-redesign.tsx:591`), "…tự dừng (BR-56)" (`use-audio-recorder.ts:158`), "…(BR-57)" và "(UC-54)" (`audio-sketch-panel.tsx:385,427`). Người dùng cuối không biết BR-29 nghĩa là gì. **Đề xuất:** chỉ giữ mã trong chú thích mã nguồn, gỡ khỏi chuỗi hiển thị.

**M6-32. Panel Lịch sử nói sai và lặp thông tin.** `history-panel.tsx:99-102`: chip nhánh "tĩnh" có tooltip **"Branch mặc định của project"** trong khi UC-48 đã cho chọn nhánh đang mở (tên hiển thị là nhánh đang mở, có thể không phải nhánh mặc định) — tooltip sai; khối chú thích đầu file (`:12-14`) cũng lỗi thời ("chip TĨNH … chưa có dropdown"); nhãn trạng thái ở đây "Có thay đổi chưa lưu" (`:40`) khác "Chưa lưu" ở chân trang cho cùng một trạng thái (`M6-10`). Điểm tốt: panel này là chỗ thứ hai hiện trạng thái lưu, giảm phần nào M6-10.

**M6-33. Lỗi backend tiếng Anh trong các hộp thoại version control.** `use-version-control.ts:35-39` và `audio-sketch-panel.tsx:35-39` (`messageOf`) đưa nguyên `ApiError.message` — 409 commit trùng, 403… — vào `ModalError`/`tagError`/banner. Cùng gốc M2-5: cần hàm `apiErrorMessage` dùng chung.

### P3
- **M6-34.** Đổi tên track thành chuỗi rỗng bị bỏ qua lặng lẽ (`track-panel.tsx:89-94`, chỉ khi `trimmed` mới gọi); tên dài bị cắt và `title` của nút là "Đổi tên track (UC-35)" nên rê chuột không hiện tên đầy đủ.
- **M6-35.** Cỡ chữ 9-10px ở panel: bộ đếm nhãn (`:492` 9px), nhãn `HIỆN TẠI` và khoá chi tiết `ID/NỘI DUNG` (`history-panel.tsx:380,418` 9px), danh mục nhạc cụ (`track-panel.tsx:615` 9px), VOL/PAN (10px), chip nhạc cụ (10px).
- **M6-36.** Thanh trượt pan không có "nhấp đôi về giữa", hiển thị "0" thay vì "Giữa"; số track ở tiêu đề panel chỉ là con số không kèm `/tối đa`; "TRACKS", "+ Add Track", "Project History" là tiếng Anh (gộp M6-12).
- **M6-37.** Hộp Xuất: dòng chờ có thuật ngữ nội bộ "OfflineAudioContext" (`export-dialog.tsx:195`); xuất riêng nhiều track tự tải nhiều tệp cách nhau 300ms (`:70-74`) — trình duyệt có thể hỏi/chặn nhiều tệp nhưng thông báo "đã được tải về" vẫn hiện; lỗi hiển thị `err.message` thô.
- **M6-38.** Thông báo thành công của panel Lịch sử (`history-panel.tsx:105`) không `role="status"`; lỗi tải nhánh (`:122-126`) không có nút "Thử lại" trong khi lỗi lịch sử có.

### Điểm mạnh (đừng đổi)
**Hộp Commit** rất tốt: tóm tắt số nốt/track thêm-xoá-sửa so với commit gần nhất, giải thích rõ commit đầu tiên, cảnh báo khi không có thay đổi, nhãn `htmlFor`, bộ đếm ký tự, Ctrl+Enter, lỗi hiện tại chỗ và giữ nguyên nội dung đã gõ. **Hộp Khôi phục:** giải thích "lịch sử không bị xoá", nút nguy hiểm đúng kiểu, khoá đóng khi đang gửi, lỗi trong hộp. **Panel Lịch sử:** đủ trạng thái tải/lỗi có thử lại/rỗng có hướng dẫn, tag inline có ví dụ (`v1-demo`) + bộ đếm + lỗi tại chỗ + Enter/Esc, nút Khôi phục vô hiệu ở HEAD kèm lý do, nội dung commit hiển thị đủ (`wordBreak`, không bị cắt như trang dự án). **Panel Track:** `aria-label` theo tên track cho VOL/PAN, tìm nhạc cụ + Enter/Esc, đổi tên có bộ đếm 50 ký tự và xử lý Enter/Esc/blur không lưu đè, thẻ được chọn có vạch accent + nền. **Audio sketch:** báo kích thước thật khi vượt 20MB, giữ bản ghi khi tải lên lỗi để thử lại, chặn hai tay cầm cắt giao nhau, phân loại lỗi micro rõ ràng, nhả micro khi đóng. **Hộp Xuất:** cảnh báo khi không có nốt / đang Solo, đổi nhãn nút theo giai đoạn, dùng token màu (`var(--…)`).

### Việc cần người dùng quyết
1. **Khôi phục khi còn thay đổi chưa commit:** tự tạo một commit "lưu tự động trước khi khôi phục" (an toàn nhất, không mất gì), hay chỉ cảnh báo đỏ + bắt xác nhận?
2. **Lịch sử quá 20 commit:** thêm "Xem thêm" ngay trong editor, hay chỉ liên kết sang trang dự án (cần sửa M3-3 trước)?
3. **Mã UC/BR trong giao diện:** đồng ý gỡ toàn bộ khỏi chuỗi hiển thị (giữ trong chú thích mã)?
4. **Emoji → `lucide-react`:** đồng ý thay hết và đổi nút chính của hộp Xuất sang màu accent?
5. **Đóng hộp thoại Audio sketch khi có bản ghi chưa đính kèm:** chặn đóng, hay hỏi xác nhận?

### Gợi ý thứ tự sửa cho phần 2
1. **Chặn mất dữ liệu:** M6-19, M6-20 (+ M6-26 phần mất nội dung commit đang gõ).
2. **Khả năng dùng bản lịch sử:** M6-21 (sau/cùng M3-3), M6-32.
3. **Hộp thoại dùng chung + bàn phím:** M6-26 (gộp B2), M6-22, M6-23, M6-24, M6-25, M6-27, M6-30.
4. **Nội dung hiển thị:** M6-31 (gỡ mã UC/BR), M6-28 (tên file tiếng Việt), M6-29 (emoji → icon), M6-33 (hàm lỗi dùng chung).
5. **Dọn nhỏ:** M6-34–38.

### Cách tiếp tục
Làm **phần 3/3** (`piano-roll.tsx`, `velocity-lane.tsx`): canvas, thao tác chuột, bàn phím, và cách cung cấp lối thay thế cho người dùng bàn phím/screen reader. Sau đó Bước C/D/E/F (§41.1). Thử tay M6-19 (tạo thay đổi chưa commit, để tự lưu xong, rồi khôi phục một commit cũ) và M6-20 (ghi âm rồi bấm nền hộp thoại) khi có điều kiện.

**Trạng thái cuối phiên:** không sửa code, không commit/push, không tiến trình nền.

---

## §50 — Bước B, module 6 (editor) PHẦN 3/3: piano roll + dải velocity — báo cáo audit, CHƯA sửa; TỔNG KẾT toàn bộ Bước B (29/09/2026)

**Đã đọc đủ:** `components/midi-editor/piano-roll.tsx` (750 dòng), `components/midi-editor/velocity-lane.tsx` (317 dòng); grep `setPlayheadTick`/`scrollToTick` trong `midi-editor.tsx` (vòng lặp phát nhạc 16ms, dòng 935-952). Phân tích tĩnh — **không đo hiệu năng, không nghe âm thanh** (CLAUDE.md §10). Các mục hiệu năng ghi là "cần đo".

**Số lỗi:** P1 = 2, P2 = 11, P3 = 5 (18 mục), đánh số tiếp từ M6-39.

### P1

**M6-39. Piano roll và dải velocity chỉ dùng được bằng chuột.** Cả hai là `<canvas>` không `role`/`aria-label`/`tabIndex`, chỉ có `onMouseDown`/`onMouseMove` (+ `mouseup` trên `window`); không có xử lý phím nào (grep `keydown` không thấy trong hai file) và không có sự kiện cảm ứng/con trỏ (`touch-action` chưa đặt; trên tablet/điện thoại kéo vẽ, kéo nốt, kéo velocity không hoạt động), không có bản thay thế văn bản cho nội dung nốt. Đây là toàn bộ chức năng soạn nhạc cốt lõi. **Cần người dùng quyết phạm vi** (xem cuối mục): chấp nhận "chỉ dành cho chuột/máy tính" và ghi rõ trong tài liệu, hay làm lối thay thế tối thiểu (chọn nốt bằng phím, mũi tên nudge, Delete, hộp danh sách/bảng nốt cho screen reader). Nếu chấp nhận, thêm thông báo cho thiết bị cảm ứng (M6-11).

**M6-40. Bấm vào cột phím đàn khi đã cuộn ngang sẽ tạo nốt vô hình.** `piano-roll.tsx:491-523` (công cụ Pencil): chỉ kiểm `tick < 0` chứ không kiểm `cx < KEY_WIDTH`. Khi `scrollX > 0`, `tick = snap((cx - 72 + scrollX) / pxPerTick)` vẫn dương cho `cx` nằm trong cột phím → nốt được tạo và thêm vào dữ liệu, nhưng vị trí vẽ của nó nằm sau cột phím (`nx + nw < KEY_WIDTH` bị bỏ qua khi vẽ, dòng 355) nên **không nhìn thấy**. Người dùng bấm phím đàn để "nghe thử" (thói quen ở mọi phần mềm nhạc) sẽ âm thầm tích luỹ nốt ẩn: chúng tính vào số nốt ở chân trang, vào commit, bản xuất MIDI/WAV và tăng dung lượng. Cùng lỗi với hộp chọn khi bắt đầu kéo ở vùng phím (`:527-531`) và nhận vạch phát (`:465-472`). **Đề xuất:** thoát sớm khi `cx < KEY_WIDTH` (kể cả cho công cụ vẽ); nếu muốn, coi bấm cột phím là nghe thử nốt (M6-46). Nên thử tay: cuộn ngang, chọn Draw, bấm vào cột phím, xem số nốt ở chân trang.

### P2

**M6-41. Nốt ngắn gần như toàn bộ là vùng đổi độ dài, không kéo để di chuyển được.** `piano-roll.tsx:29,232-241`: vùng resize rộng `RESIZE_HANDLE_PX = 6` tính từ mép phải, còn chiều rộng nốt tối thiểu là 4px (`Math.max(4, …)`). Ở lưới 1/16 và zoom 100% một nốt rộng ~7px, vậy chỉ ~1px ở bên trái là "thân nốt"; ở lưới 1/32 (~3.6px, làm tròn thành 4px) **không có vùng thân nào**. Người dùng phải phóng to nhiều mới di chuyển được nốt ngắn. **Đề xuất:** vùng resize = `min(6px, 40% chiều rộng nốt)` và chỉ hiện tay cầm khi nốt đủ rộng (ví dụ ≥ 12px).

**M6-42. Bấm gần vạch phát luôn kéo vạch phát thay vì vẽ nốt.** `:465-472`: kiểm `Math.abs(cx - playheadX) <= 4` trước mọi công cụ. Vạch phát mặc định ở tick 0 (`x = 72`, mép cột phím); ô lưới đầu tiên ở lưới 1/16 chỉ rộng ~7px → phần lớn bấm để đặt nốt đầu bài rơi vào vùng bắt vạch phát. Người dùng nhấp vẽ nốt ở phách đầu và thấy bản nhạc "nhảy" thay vì có nốt. **Đề xuất:** chỉ bắt vạch phát ở thước thời gian (`cy < HEADER_H`), hoặc khi giữ phím bổ trợ; ngoài ra bỏ "grab" khi công cụ là Draw/Erase.

**M6-43. Chọn nhiều nốt: kéo chỉ di chuyển nốt đang cầm, và không thể bỏ chọn bằng cách bấm vùng trống.** Kéo/đổi độ dài (`:600-627`) cập nhật đúng một nốt (`n.id === drag.noteId`) dù nhiều nốt đang được chọn — người dùng chọn cả đoạn giai điệu rồi kéo sẽ thấy chỉ một nốt di chuyển (dải velocity thì áp dụng theo nhóm, nên hai công cụ cư xử khác nhau). Bấm vùng trống chỉ bắt đầu hộp chọn (`:527-531`); nếu kéo ≤ 3px thì không làm gì (`:646`) → không bỏ chọn; cũng không có Escape để bỏ chọn. **Đề xuất:** di chuyển/đổi độ dài cả nhóm theo cùng độ lệch (giống cách velocity làm), bấm trống thì `onSelectedNotesChange(new Set())`, Escape bỏ chọn.

**M6-44. Không có khung chọn khi kéo.** `boxSelectRef` chỉ được dùng ở `handleMouseUp` (`:636-661`); `draw()` không vẽ hình chữ nhật chọn, nên người dùng kéo chuột trong vùng trống mà không thấy gì cho tới khi thả. **Đề xuất:** vẽ khung chọn (viền `--accent`, nền `color-mix` trong suốt) trong `draw()` theo `boxSelectRef` + vị trí chuột hiện tại.

**M6-45. Không tự cuộn theo vạch phát khi phát nhạc.** `PianoRollHandle.scrollToTick` được định nghĩa (`:99-102,209-216`) nhưng grep `scrollToTick` trong `midi-editor.tsx` không thấy nơi gọi. Khi vạch phát vượt mép phải vùng nhìn, người dùng không còn thấy nhạc đang chạy tới đâu (phải tự cuộn). **Đề xuất:** khi `isPlaying`, nếu vạch phát ra ngoài vùng nhìn thì cuộn (dạng "trang" hoặc bám giữa), có công tắc "Theo dõi" ở thanh công cụ.

**M6-46. Không có phản hồi khi đặt/kéo nốt: không nghe, không thấy tên nốt.** Piano roll không gọi bộ phát nhạc nào — đặt hoặc kéo nốt hoàn toàn im lặng, cột phím không bấm nghe được; nhãn cao độ chỉ có ở nốt C (`:330-334`, chữ 9px), các hàng khác không nhãn nên phải đếm hàng để biết đang ở nốt nào; không hiện tooltip cao độ/vị trí/độ dài/velocity khi rê hoặc kéo, không hiện "F#4" khi kéo. **Đề xuất (cần quyết nối với bộ phát Tone.js):** nghe thử nốt khi đặt/di chuyển/bấm cột phím; hiện nhãn tên nốt cạnh con trỏ khi kéo; hiện tên nốt khi rê vào hàng.

**M6-47. Track đang chọn không nổi bật hơn các track khác.** Trong `draw()` mọi nốt của track không tắt tiếng đều vẽ với `globalAlpha` 0.85 (`:364`) và chỉ nốt được chọn/đang phát là 1; nốt của track khác không mờ đi dù nốt mới chỉ vào `selectedTrackId`; với tới 32 track chồng nhau, khó thấy đang soạn track nào. Dải velocity cũng hiện nốt của mọi track cùng lúc (`velocity-lane.tsx:169-185`). **Đề xuất:** làm mờ nốt không thuộc track đang chọn (tuỳ chọn "chỉ hiện track đang chọn"), áp cho cả dải velocity.

**M6-48. Bản nhạc bị giới hạn cứng 128 ô nhịp, nốt vượt quá không xem/sửa được.** `piano-roll.tsx:203-205` `totalTicks = ppq * 4 * 128`; nốt nhập từ file MIDI dài hơn (~4,3 phút ở 120 BPM) nằm ngoài vùng cuộn: vẫn có trong dữ liệu, số nốt ở chân trang, khi phát và xuất, nhưng không nhìn thấy/chọn/xoá được, cũng không có cảnh báo khi nhập. **Đề xuất:** độ dài vùng cuộn = `max(128 ô nhịp, ô nhịp cuối cùng có nốt + đệm)`; hoặc cảnh báo rõ khi import vượt giới hạn.

**M6-49. Dải velocity: hợp âm chồng cột, bấm là đổi dữ liệu, không có số hiển thị.** (a) Nốt cùng vị trí bắt đầu (mọi hợp âm) có cột trùng vị trí X (`barRect`, `:116-126`); nốt vẽ sau che nốt trước và `hitBar` chọn nốt trên cùng (`:220-229`) → không chỉnh được velocity riêng từng nốt trong hợp âm trừ khi kéo theo nhóm; (b) `handleMouseDown` gọi `applyVelocity` ngay theo độ cao chuột (`:253-265`), nên một cú bấm chỉ để "xem" cũng đổi velocity của nốt; bấm ở dải cũng không chọn nốt; (c) khi kéo không hiện con số (chỉ có vạch 127/64/1 ở lề); (d) cột rộng tối thiểu 3px khó nhắm trúng (`BAR_MIN_W`). **Đề xuất:** cột chia ngang khi trùng vị trí (hoặc lọc theo track đang chọn), chỉ đổi velocity khi kéo > vài px, hiện nhãn số cạnh con trỏ.

**M6-50. Canvas không tính `devicePixelRatio` nên mờ trên màn hình HiDPI/zoom.** `piano-roll.tsx:443-446` và `velocity-lane.tsx:204-208`: `canvas.width = clientWidth` (đơn vị CSS), không nhân với `window.devicePixelRatio` và không co `ctx.scale`. Trên màn hình Retina/4K hoặc khi phóng to trình duyệt, đường lưới, nốt và nhất là chữ 9-10px monospace đều nhoè. **Đề xuất:** đặt kích thước bộ đệm = kích thước CSS × dpr, `ctx.setTransform(dpr,0,0,dpr,0,0)`, giữ `style.width/height` theo CSS.

**M6-51. (cần đo) Hiệu năng khi phát và khi kéo.** `midi-editor.tsx:936-952` gọi `setPlayheadTick` mỗi 16ms → ~60 lần/giây cả cây `MidiEditor → EditorRedesign → TrackPanel (tới 32 track) / HistoryPanel / PianoRoll / VelocityLane` render lại; `PianoRoll` vẽ lại toàn canvas mỗi lần (`draw` phụ thuộc `playheadTick`, `piano-roll.tsx:430`), và trong vòng lặp vẽ nốt gọi `tracks.find(...)` cho mọi nốt trước khi loại bỏ nốt ngoài vùng nhìn (`:348-360`, độ phức tạp N×T); dải velocity cũng `tracks.find` trong `forEach` (`velocity-lane.tsx:173`). Khi kéo nốt, mỗi `mousemove` tạo mảng `notes` mới (`piano-roll.tsx:605-611`) qua `updateSnapshot` → render lại cả cây và hẹn lại lưu tự động. Thêm nữa `rollScrollX` lưu ở `EditorRedesign` (`editor-redesign.tsx:197`) khiến mỗi sự kiện cuộn render lại cả cây. Trên dự án lớn (nhiều nghìn nốt, 20+ track) có thể giật; **chưa có số đo.** **Đề xuất khi có số đo:** tách `playheadTick` ra khỏi state gốc (vẽ vạch phát bằng ref/canvas lớp riêng), `React.memo` cho `TrackPanel`/`HistoryPanel`, dùng `Map` id→track, vẽ nốt sau khi đã lọc vùng nhìn.

### P3
- **M6-52.** Xoá bằng chuột phải (`:474-481`) là thao tác ẩn — không có chú giải; kéo qua nhiều nốt để xoá liên tục (drag-erase) chưa có; xoá không xác nhận nhưng có Undo (điểm tốt).
- **M6-53.** Màu cứng trong canvas: `#6366f1` làm màu dự phòng cho track (`piano-roll.tsx:350`, `velocity-lane.tsx:175`) và `rgba(255,255,255,0.18)` cho vạch sáng nốt (`:377`) — màu track là dữ liệu (được phép, CLAUDE.md §4.7) nhưng highlight nên đi qua token.
- **M6-54.** `readOnly` của `VelocityLane` chưa được dùng ở đâu, và piano roll không có chế độ chỉ đọc (xem lịch sử/khách) — nhắc lại khi làm phần cộng tác.
- **M6-55.** Không có chú giải thao tác cho người mới: chuột phải xoá, Shift+click thêm/bớt chọn, kéo trong vùng trống để chọn hộp, Ctrl+A, kéo thước thời gian để tua, nhấp đôi… (Trợ giúp: điểm thấp nhất của hệ thống, xem module 0).
- **M6-56.** Vạch phát dùng màu `--danger` (`piano-roll.tsx:70`) — đỏ mang nghĩa lỗi/nguy hiểm (BR-90) nhưng ở đây là màu trang trí; chữ số ô nhịp 10px monospace (`:310`).

### Điểm mạnh (đừng đổi)
Màu canvas đi qua token: `PAL_COLOR_SPEC` + `resolveCssColors()` + `MutationObserver` theo dõi `data-theme` — đúng cách CLAUDE.md §4.7 yêu cầu; công thức px/tick và độ rộng cột phím dùng chung (`pxPerTickFor`, `PIANO_ROLL_KEY_WIDTH`) nên hai lưới thẳng cột; chỉ vẽ phần nằm trong vùng nhìn (loại hàng, vạch lưới, nốt ngoài viewport) và vùng cuộn ảo dùng canvas `sticky` thay vì dựng hàng nghìn phần tử DOM; nghe `mouseup` trên `window` tránh kẹt trạng thái kéo (chú thích rõ lý do); snap theo lưới; giữ nguyên `id` nốt khi sửa (BR-28); velocity kẹp 1..127 (BR-27) và nhóm chọn dịch theo độ lệch từ giá trị gốc chụp lúc bấm (không cộng dồn sai); con trỏ đổi theo ngữ cảnh (ew-resize, grab, crosshair, cell, ns-resize); hạn chế tần suất tua khi kéo thước thời gian (`SEEK_RESTART_THROTTLE_MS`).

### Việc cần người dùng quyết
1. **Phạm vi trợ năng của editor:** ghi nhận "chỉ dùng chuột, chỉ dành cho máy tính" như một giới hạn đã biết (rẻ, chỉ cần thông báo), hay làm lối thay thế tối thiểu (Delete/mũi tên/Tab chọn nốt)?
2. **Cảm ứng (tablet)** có nằm trong phạm vi sản phẩm không?
3. **Nghe thử nốt khi đặt/kéo/bấm phím đàn:** có làm không (cần nối piano roll với bộ phát Tone.js)?
4. **Nốt vượt 128 ô nhịp:** nới độ dài tự động hay giới hạn + cảnh báo khi import?

### Gợi ý thứ tự sửa cho phần 3
1. **Sai dữ liệu:** M6-40 (nốt vô hình) — sửa nhỏ, nên làm ngay.
2. **Dùng được hằng ngày:** M6-41, M6-42, M6-43, M6-44, M6-45 (các lỗi khiến thao tác cơ bản khó chịu).
3. **Cảm giác nhạc cụ:** M6-46 (nghe thử/tên nốt), M6-47, M6-49.
4. **Hình ảnh và giới hạn:** M6-50 (dpr), M6-48 (128 ô nhịp).
5. **Đo rồi mới sửa:** M6-51.
6. **Sau khi chốt phạm vi trợ năng:** M6-39.

---

### TỔNG KẾT BƯỚC B (toàn bộ frontend, phân tích tĩnh 29/09/2026)

| Module | Mục | P1 | P2 | P3 | Tổng | Chi tiết |
|---|---|---|---|---|---|---|
| 0 Nền tảng dùng chung | §42 | 4 | 7 | 5 | 16 | B1–B16 |
| 5 Chi tiết dự án + version control | §43 | 5 | 11 | 4 | 20 | M5-1…21 |
| 3 Quản lý dự án | §44 | 4 | 10 | 5 | 19 | M3-1…19 |
| 4 Khám phá | §45 | 2 | 11 | 5 | 18 | M4-1…18 |
| 1 Xác thực | §46 | 3 | 10 | 5 | 18 | M1-1…18 |
| 2 Hồ sơ + quản trị | §47 | 3 | 11 | 4 | 18 | M2-1…18 |
| 6 Editor (3 phần) | §48-§50 | 9 | 33 | 14 | 56 | M6-1…56 |
| **Tổng** | | **30** | **93** | **42** | **165** | |

*Ghi chú:* số liệu §43 khớp với §43; P1 của module 5 gồm cả M5-6 (cần xác minh). Một số mục trùng gốc nên sửa một lần được lợi nhiều chỗ (xem cụm bên dưới). Mọi con số tương phản, kích thước và hiệu năng là **ước lượng tĩnh**, chưa đo — cần Bước F.

### Các cụm gốc chung (sửa một lần, giải quyết nhiều mục)
1. **Hộp thoại dùng chung** (Escape, focus trap, `aria-labelledby`, trả focus, ô `error`/`role="alert"` trong hộp): B2, M5-1, M5-4, M5-16, M3-2, M6-26, M6-27 — thay `ConfirmDialog`, 3 hộp thoại ở trang cài đặt, `MergeConflictDialog`, `CommitCompare`, `Modal` editor, `ExportDialog`, `ActionPanel`.
2. **Focus và trợ năng toàn cục:** B1, B5–B9, M1-4…M1-6, M6-6, M6-7, M6-22 (một quy tắc `:focus-visible` trong `globals.css`, `ButtonLink`, `aria-*` cho nút biểu tượng).
3. **Hàm lỗi tiếng Việt dùng chung `apiErrorMessage`:** M1-3, M2-5, M6-33 (+ mọi nơi `setError(err.message)`).
4. **Chữ và tương phản token:** B3, B4, M4-9, M6-35 (thêm `--warning-foreground`, `--metal-foreground`; thang chữ ≥12px; input 16px trên mobile).
5. **Mất dữ liệu / im lặng thất bại:** M6-1, M6-2, M6-19, M6-20, M6-40, M5-2, M5-3, M3-1, M3-2, M2-2.
6. **Số liệu công khai sai nghĩa:** M4-1, M4-2.
7. **Quyền lợi cơ bản của người dùng Google:** M2-1 (xoá tài khoản/đổi mật khẩu).
8. **Điều hướng cốt lõi bị mồ côi:** M3-3 (Commit/Nhánh), M6-21.
9. **Cấu trúc trang edit + bố cục editor:** M3-8, M6-3, M6-4, M6-11 (trang edit toàn màn hình, gom thanh công cụ).
10. **Nội dung hiển thị:** M6-31 (mã UC/BR), M4-4 (tiêu đề tab), M6-12 (ngôn ngữ nhãn), M6-28 (tên file tiếng Việt).

### Bước tiếp theo trong kế hoạch (§41.1)
- **C** — `impeccable critique` cho module 0 + 2-3 màn chính (đánh giá thiết kế/đặc thù, không trùng lặp với B).
- **D** — `impeccable audit` (5 chiều) trước khi nộp; **F** — chạy app thật + trình duyệt để đo M3-3/M6-3/M6-4 (không gian), tương phản (B3, M4-9), hiệu năng (M6-51), và thử tay M6-1/M6-2/M6-19/M6-20/M6-40/M5-6.
- **E** — sửa theo cụm ở trên; mỗi cụm một nhánh (`bugfix/…` theo CLAUDE.md §8) do người dùng tự tạo và commit. Gợi ý thứ tự: (5) mất dữ liệu → (1) hộp thoại + (2) focus → (3) lỗi tiếng Việt → (4) chữ/tương phản → còn lại.
- Việc người dùng đã chốt trong đợt này: Google đăng ký/đăng nhập dùng chung nút ở trang đăng nhập; M1-2 tạm bỏ qua; điều khoản/chính sách quyền riêng tư làm sau (§46).

**Trạng thái cuối phiên:** không sửa code, không commit/push, không tiến trình nền. Toàn bộ kết quả Bước A và Bước B đã nằm trong §41–§50 của file này.

---

## §51 — Bước F: đo thật bằng trình duyệt (Playwright) — xác nhận / đính chính các phát hiện của Bước B (29/09/2026)

### 51.1. Cách làm và giới hạn
- **Công cụ:** Playwright + Chromium 153 headless cài vào thư mục tạm ngoài dự án (scratchpad, **không đụng `package.json` hay `node_modules` của dự án**); khởi động `backend` (`start:dev`, cổng 3001) và `frontend` (`dev`, cổng 3000) bằng `.env` sẵn có.
- **Tài khoản:** tài khoản test dùng chung ở §3 (`stave-test-…@example.com`) và các project seed 1 & 3.
- **An toàn dữ liệu:** mọi lệnh `PUT/POST/PATCH/DELETE` tới backend (trừ `/auth/*`) bị chặn ở tầng trình duyệt bằng route giả (trả `200 {}`), **0 lệnh ghi lọt xuống DB**; điểm cuối công khai `/explore/projects/:id` bị giả `404` khi test M5-6 để không tăng `play_count`. Bản nháp "hỏng" (M6-1) và "lưu lỗi" (M6-2) được mô phỏng bằng chặn/huỷ request, không đụng dữ liệu thật. Đăng nhập test tạo 13 dòng phiên; đã thu hồi 12 dòng còn sót qua trang Thiết bị + đăng xuất dòng cuối (còn 0 phiên hoạt động của tài khoản test do phiên này tạo).
- **Dọn:** đã tắt cả 2 server (`Get-NetTCPConnection -LocalPort 3000,3001` sạch; đã kill thêm tiến trình watcher của Nest); script và ảnh chụp nằm ở scratchpad. `git status` sạch (nhánh `bugfix/midi-track-name-nul-byte-crash`, không sửa gì).
- **Giới hạn của phép đo:** headless dùng bộ vẽ phần mềm (không GPU) nên **số tuyệt đối về hiệu năng bị phóng đại**, chỉ dùng để so sánh tương đối; **không nghe/đo được âm thanh** (CLAUDE.md §10); không thử OAuth Google (M2-1), không thử màn hình cảm ứng thật, không tạo/xoá dữ liệu thật (M3-6, M2-x).
- **Lưu ý về file này:** `PROJECT_STATE.md` nằm trong `.gitignore` (dòng 29) — **không được git theo dõi**, nên toàn bộ ghi chép §41–§51 chỉ nằm trên máy bạn, đồng đội không thấy và không có bản sao lưu qua git. Muốn chia sẻ, hãy sao chép sang chỗ khác (vd `docs/`, hoặc xuất báo cáo).

### 51.2. ĐÍNH CHÍNH các nhận định sai ở Bước B
1. **B1 / M6-7 (focus):** khẳng định "nút/liên kết không có trạng thái focus" **SAI**. Duyệt Tab trên `/login`, `/explore` và thanh công cụ editor: mọi nút, liên kết đều hiện viền focus mặc định của trình duyệt (`outline: auto`), ô nhập có vòng focus (box-shadow). **B1 hạ P1 → P2**; M6-7 chỉ còn đúng ở phần "không có hover" (không thể có với inline style). Vấn đề thật còn lại là viền mặc định không đồng bộ thương hiệu và ở chỗ có `outline: none`, xem 51.3 (M6-22).
2. **M5-6 (mô phỏng lần 1):** lần thử đầu cho kết quả "không tái tạo" vì tôi phát sự kiện `visibilitychange` không nổi bọt lên `window` (supabase-js lắng nghe ở `window`, `GoTrueClient.js:4722`). Sau khi sửa (đọc mã thư viện và bắn sự kiện có `bubbles: true`) thì **tái tạo được** — xem 51.3. Ghi lại để không ai tin kết luận "không lỗi" của lần đầu.

### 51.3. Kết quả đo — bảng đối chiếu (✅ xác nhận · ⚠️ đã đo, có sắc thái · ❌ chưa đo được)

**Tương phản (B3, M4-9)** ✅ — đo bằng canvas trên cả 3 theme (unleashed / moss / claret):

| Cặp màu | Tỉ lệ đo | Ngưỡng 4.5:1 |
|---|---|---|
| chữ `warning` trên `warning-muted` (Badge/Toast) | **2.33** | Trượt |
| chữ `warning` trên `surface` | 2.63 | Trượt |
| chữ `metal` trên `metal-muted` (Badge "Dự án nổi bật", STAVE+) | **1.99 – 2.36** | Trượt |
| Hạng 1: `background` trên `metal` | 2.23 – 2.67 | Trượt |
| Hạng 2: `background` trên `border-strong` | **1.69 – 1.86** | Trượt (gần như không đọc được) |
| Hạng 3: `background` trên `warning` | 2.46 – 2.52 | Trượt |
| chữ `success` trên `success-muted` (Toast/Badge success) | **4.09** | **Trượt — MỚI** (chưa từng ghi ở Bước B) |
| `muted-foreground` trên `surface-muted` | 4.22 (unleashed) / 4.36 (moss) / 4.58 (claret) | Trượt ở 2 theme — MỚI |
| `accent` trên `background` | 6.3 – 6.5 | Đạt |
| `danger` trên `danger-muted` | 5.82 | Đạt |
| `foreground` trên `background` | 14.5 – 15.2 | Đạt |
| `accent-foreground` trên `accent` (nút chính) | 6.69 | Đạt |
| `#fff` trên `success` (nút Xuất) | 4.84 | Đạt |

**Thang chữ và vùng bấm (B4)** ✅ — trang `/explore` (1366px): **70%** phần tử có chữ cỡ dưới 12px (10px: 39 phần tử, 11px: 80, **12px: chỉ 2**, 13px: 25, 14px: 21); **44/54** phần tử tương tác cao/rộng dưới 32px, **54/54** dưới 44px. `/login` trên điện thoại (390px): **14/14** phần tử tương tác dưới 44px; ô nhập cao 37px, chữ 12px. Không có tràn ngang ở 390px.

**Trang và khung** ✅ — tiêu đề tab của cả 6 route `/`, `/explore`, `/rankings`, `/login`, `/register`, `/forgot-password` đều là **"STAVE"** (M4-4); `<html lang="en">` (B6); cần **7 lần Tab** qua header trước khi tới ô email ở `/login` (chưa có skip link).

**Xác thực** ✅ —
- 100% ô nhập ở `/login` (2), `/register` (3), `/forgot-password` (1) **không có** `name`, `autocomplete`, `spellcheck` (M1-5).
- `/register` với mật khẩu 3 ký tự: trình duyệt chặn bằng thông điệp tiếng **Anh** "Please lengthen this text to 8 characters or more (you are currently using 3 characters)."; **thông điệp tiếng Việt của mã không hề hiện**, không có request nào tới Supabase (M1-4).
- `/auth/callback#error=access_denied&error_code=otp_expired…`: sau **8 giây** vẫn hiện "Đang đăng nhập…" (M1-1).

**Danh sách và trang tạo** ✅ — trang "Dự án của tôi" chỉ có liên kết `/projects/new`, `/projects/<id>/edit`, `/projects/<id>/settings` — **không có liên kết tới `/projects/<id>`** (M3-3); textarea "Mô tả" ở `/projects/new` có `rows=4` nhưng cao **37px** (M3-5). Trên điện thoại (390px) `/explore`: `RowHeader` `display: none`, ô "Lượt nghe" chỉ hiện số "4" không nhãn (M4-3).

**Bố cục editor (M6-3, M6-4, M6-11, M6-50)** ✅ — đo bằng `getBoundingClientRect`:

| Khung nhìn | Phần "vỏ" phía trên vùng nhạc | Chiều cao vùng piano roll | Rộng vùng piano roll | Nút Import/Export MIDI/Audio, Audio sketch nhìn thấy |
|---|---|---|---|---|
| 1366×657 (laptop 768p thực tế) | 302px | **148px (~6,7 hàng ≈ nửa quãng tám)** | 782px | Cả 4 nút ngoài màn hình |
| 1366×768 | 302px | **259px (~11,8 hàng ≈ 1 quãng tám)** | 782px | Cả 4 ngoài màn hình |
| 1280×720 | 302px | 211px | 696px | Cả 4 ngoài màn hình |
| 1024×768 | 302px | 242px | **440px** | Cả 4 ngoài màn hình |
| 1920×1080 | 302px | 571px | 1336px | Chỉ 2/4 nhìn thấy (Export Audio, Audio sketch bị che) |
| 2560×1300 | 302px | 791px | 1976px | Cả 4 nhìn thấy |

Chi tiết phần "vỏ": header trang 57px + khối tiêu đề/tab trang sửa dự án ~137px + header editor 60px + tool strip 48px = 302px phía trên; phía dưới thêm footer editor 34px + footer trang 70px (87px ở 1024px) → **~406px cố định** (ước lượng 430px ở Bước B, sai lệch nhỏ). Dải velocity luôn 104px. Thanh công cụ rộng **2111px** (`scrollWidth`), phải rộng ≥2111px mới hiện đủ. Ảnh `editor_1366x657.png` cho thấy rõ thanh công cụ cắt ngang nút "Paste". `canvas.width == clientWidth` khi `deviceScaleFactor = 2` → **mờ trên màn HiDPI** (M6-50).

**Tương tác canvas (không ghi DB, đọc payload autosave đã chặn)**:
- **M6-40 ✅** — cuộn ngang 1500px rồi bấm vào cột phím: số nốt 2 → 3, payload có nốt `start = 24120, pitch = 120` (nốt vô hình).
- **M6-42 ✅** — bấm tại x=74 (cách vạch phát 2px) với công cụ Draw: 0 nốt; bấm tại x=78: có nốt.
- **M6-41 ✅** — nốt 1/16 rộng 7,2px, vùng thân chỉ 1,2px: kéo từ 0,6px → **di chuyển** (`start` 2160 → 3120); kéo từ 3px → **đổi độ dài** (120 → 1080).
- **M6-43 ✅** — chọn cả 2 nốt rồi kéo một nốt: chỉ **1/2 nốt** dịch chuyển.
- **M6-5 ✅** — chọn tất cả rồi nhấn `Delete` và `Backspace`: số nốt không đổi; `Space`: không phát nhạc.
- **M6-14 ⚠️ tệ hơn dự đoán** — ô BPM: sau khi chọn hết rồi gõ "9", "90", "1", "4", "0" giá trị **luôn quay về "120"**; không thể gõ số mới bằng bàn phím (chỉ dùng nút tăng giảm hoặc sửa đè từng chữ số tại chỗ).

**Mất dữ liệu (chặn ghi bằng route giả)**:
- **M6-1 ✅** — huỷ `GET /projects/:id/draft`: editor **vẫn hiện**, chân trang ghi "**Đã lưu nháp** … 0 note" (chấm xanh), không có báo lỗi; thêm 1 track + 1 nốt → autosave gửi `PUT` với `tracks: 1, notes: 1` (nếu backend thật nhận sẽ **ghi đè** bản nháp seed 1). Console chỉ có `TypeError: Failed to fetch`.
- **M6-2 ✅** — huỷ mọi `PUT /draft`: trong 17 giây chỉ có **1** lần thử (không thử lại), chân trang giữ "Chưa lưu", **không** có phần tử `role=status/alert` nào, **không** có handler `beforeunload` (`defaultPrevented = false`), đóng trang không hiện hộp thoại.
- **M6-13 ✅** — mở hộp Commit rồi bấm vào chữ trong hộp và nhấn Ctrl+Z: số nốt 1 → **0** (đã hoàn tác trong editor phía sau) trong khi hộp thoại **vẫn mở**.
- **M6-26 ✅** — gõ nội dung vào hộp Commit rồi bấm nền: hộp đóng, mở lại thì ô **trống** (mất nội dung).
- **M6-20 ✅** — thu âm bằng micro giả: `Esc` khi đang thu → hộp Audio sketch đóng; thu lại, dừng, vào màn cắt, bấm nền → đóng; mở lại thì là màn "Ghi âm" mới (**mất bản ghi**).

**Điều hướng dữ liệu (M5-6)** ✅ — một lần chuyển tab ẩn → hiện làm số request về project tăng **4 → 10** (trang tải lại 2 lần: mỗi lần gồm cả điểm cuối công khai và điểm cuối của chủ), skeleton xuất hiện lại và phần tử `<select>` chọn nhánh bị **gỡ khỏi DOM** (state mất). Đọc mã xác nhận nguyên nhân: `_recoverAndRefresh` phát `SIGNED_IN` ở mỗi lần tab hiện lại (`GoTrueClient.js:4152`). **Hệ quả với M4-1:** với dự án công khai, mỗi lần quay lại tab làm điểm cuối tăng `play_count` chạy 2 lần → "Lượt nghe" phồng lên (bị chặn trong lúc test để không sửa dữ liệu thật).

**Hiệu năng (M6-51)** ⚠️ đã đo, chỉ dùng so sánh tương đối (headless không GPU), khung nhìn 1920×1080, 16ms/tick; nháp "nhân tạo" trả về từ route giả (không ghi DB):

| Mẫu | Phát 3,2 giây: CPU script | fps | p95 khung | Khung dài nhất | Cuộn ngang 2 giây: CPU script | fps |
|---|---|---|---|---|---|---|
| 1 track · 50 nốt | 1779 ms | 60 | 17 ms | 17 ms | 1244 ms | 51 |
| 8 track · 2000 nốt | 1951 ms | 57.8 | 17 ms | 67 ms | 1680 ms | 45 |
| 16 track · 6000 nốt | 2212 ms | 53.4 | 33 ms | 100 ms | 2334 ms | 33.5 |

Nhận xét: khi **nhàn rỗi CPU ≈ 0** (3 ms/2 s) nhưng chỉ cần **phát nhạc hoặc cuộn** thì kể cả dự án nhỏ nhất đã tốn ~55–60% thời gian luồng chính vào script; chi phí chủ yếu theo **số lần render lại**, không theo số nốt, rồi cộng thêm khi nhiều nốt (cuộn 6000 nốt tụt còn 33 fps). Đúng dự đoán M6-51 (render lại cả cây mỗi 16ms/mỗi sự kiện cuộn). Chưa có số đo kéo nốt hay so với máy có GPU.

**Focus (M6-22)** ✅ (đã hẹp lại):
- Ô nội dung commit (`#commit-message`): `outline: none`, không box-shadow, màu viền **không đổi** khi focus → **không có dấu hiệu focus**.
- Ô tìm nhạc cụ: `outline: none`, không box-shadow → không có dấu hiệu focus (viền không đổi).
- Thanh VOL của track: `opacity: 0` (đo được) → viền focus của trình duyệt **vô hình**.
- Ô tag lịch sử (`history-panel.tsx:479`): cùng kiểu `outline: none`, **chưa đo trực tiếp**.
- Kích thước điều khiển track đo được: chấm màu **10×10px**; M / S / ✕ **27×27px**; nút Play 34×34; Zoom 28×28.

**Lỗi MỚI phát hiện khi xem ảnh chụp và số đo (chưa có trong Bước B)**:
- **F-1 (P3)** — Dải velocity: nhãn "VELOCITY" và số "127" vẽ chồng lên nhau ở góc trên bên trái (`velocity-lane.tsx:152,165` — cùng toạ độ y≈13). Nhìn thấy rõ ở `editor_1366x657.png`.
- **F-2 (P3)** — Ô BPM rộng 48px làm chữ "120" bị nút tăng giảm cắt (xem cùng ảnh).
- **F-3 (P3)** — Chữ `success` trên `success-muted` chỉ 4.09:1 và `muted-foreground` trên `surface-muted` 4.22–4.36:1 (bảng tương phản ở trên).
- **F-4 (P2)** — Khi tải bản nháp lỗi (M6-1) chân trang vẫn hiện "**Đã lưu nháp**" chấm xanh — trạng thái sai làm người dùng tin dữ liệu đã an toàn.

**Chưa đo/chưa tái tạo được (giữ nguyên kết luận đọc mã)**: M6-19 (cần dự án có commit), M6-44/45/46/48, M2-1 (Google), M3-6 (cần tạo dự án thật), M6-21, mọi mục về âm thanh, cảm ứng thật, GPU thật.

### 51.4. Điều chỉnh số liệu tổng kết sau Bước F
- B1: P1 → P2 (module 0: P1 4 → **3**, P2 7 → **8**).
- Thêm F-1, F-2, F-3 (P3) và F-4 (P2): **P3 +3, P2 +1**.
- Tổng mới: **P1 29, P2 95 (93 + 1 chuyển từ B1 + 1 từ F-4), P3 45 (42 + F-1, F-2, F-3), tổng 169** (165 cũ + 4 mục mới). Các mục M5-x, M6-x khác không đổi mức độ.
- Nâng độ chắc chắn (đã đo) cho: M5-6, M6-1, M6-2, M6-3, M6-4, M6-13, M6-14 (nặng hơn), M6-20, M6-26, M6-40, M6-41, M6-42, M6-43, M6-50, M6-51, M1-1, M1-4, M3-3, M3-5, M4-3, M4-4, B3, B4, M4-9.

### 51.5. Việc nên làm tiếp
- **Bước E (sửa)** — thứ tự đề xuất giữ nguyên §50 (mất dữ liệu → hộp thoại dùng chung → hàm lỗi tiếng Việt → chữ/tương phản), nay có số đo để đặt **tiêu chí nghiệm thu** (vd vùng piano roll ≥ 400px cao ở 1366×768; thanh công cụ không cần cuộn ngang ở 1366px; tương phản ≥ 4.5:1 cho mọi cặp chữ; `document.title` khác nhau theo trang).
- **Bước C, D** (`impeccable critique`, `impeccable audit`) vẫn chưa làm.
- Có thể tái sử dụng bộ script đo (scratchpad `pw/`) sau khi sửa để so số trước/sau — script không nằm trong repo; nếu muốn giữ, sao chép ra ngoài trước khi phiên kết thúc.

**Trạng thái cuối phiên:** không sửa code dự án, không commit/push, hai server đã tắt, cổng 3000/3001 sạch, 0 lệnh ghi dữ liệu thật.

---

## §52 — Bước C (`impeccable critique`) + Bước D (`impeccable audit`) — điểm cơ sở TRƯỚC khi sửa (29/09/2026)

**Phương pháp (khai báo trung thực):** ⚠️ *degraded: single-context* — quy trình critique yêu cầu hai sub-agent tách biệt (A: đánh giá thiết kế, B: detector + trình duyệt); phiên này không tạo sub-agent nên tôi chạy tuần tự trong một ngữ cảnh: đánh giá thiết kế **trước**, xem kết quả detector **sau**. Bằng chứng: 22 ảnh chụp thật (desktop 1440×900 & 1920×1080, mobile 390×844, 3 theme) từ `pw/shots/` ở scratchpad; detector `impeccable detect` (1 phát hiện, xem §41-42); số đo Bước F (§51). Không lưu snapshot vào `.impeccable/` (tránh tạo file mới trong repo; người dùng không chia sẻ tài liệu này với nhóm). Không có `PRODUCT.md`/`DESIGN.md` — dùng CLAUDE.md §4.7 và các mockup trong `docs/` làm "brief đã chốt" (quy tắc của skill: **brief thắng**; các chỗ dưới đây đụng vào brief được đánh dấu là *quyết định bản sắc*, không tự coi là lỗi).

### 52.1. Bước C — Critique (thiết kế và UX)

**Phạm vi:** vỏ ứng dụng (header/footer/tokens), Trang chủ, Dự án của tôi, Tổng quan dự án, Đăng nhập, MIDI Editor (kèm hộp Commit).

**Design Health Score (Nielsen, 0–4)** — chấm lại có số đo, mức Operate:

| # | Heuristic | Điểm | Vấn đề chính (đã đo/đã thấy) |
|---|---|---|---|
| 1 | Hiển thị trạng thái | 2 | Trạng thái lưu nằm chân trang 11.5px; báo "Đã lưu nháp" xanh cả khi tải nháp lỗi (M6-1) |
| 2 | Khớp thế giới thực | 2 | "Lượt nghe" thực chất là lượt tải trang (M4-1); "tick", UUID, mã UC/BR lộ ra giao diện; lỗi backend tiếng Anh |
| 3 | Kiểm soát & tự do | 2 | Hộp thoại không Escape/trap; bấm nền mất nội dung commit và bản ghi âm |
| 4 | Nhất quán & chuẩn | 3 | Token/nút/thẻ rất đồng nhất; trừ 7 kiểu hộp thoại, cột danh sách lệch (52.3), nhãn lẫn Anh–Việt |
| 5 | Ngăn lỗi | 2 | Công khai/hợp nhất/khôi phục không xác nhận đủ; điểm tốt: xoá phải gõ tên |
| 6 | Nhận diện hơn ghi nhớ | 3 | Nhãn rõ ở trang thường; editor dày nút biểu tượng, 25+ điều khiển, 4 nút tệp bị che |
| 7 | Linh hoạt & hiệu quả | 2 | Không Space/Delete; gõ BPM không được; chỉ Ctrl+C/V/A/Z/Y |
| 8 | Tối giản thẩm mỹ | 3 | Tiết chế màu tốt; chữ 10–11px chiếm 70%; vỏ editor ~406px |
| 9 | Nhận biết & khôi phục lỗi | 2 | "Có lỗi xảy ra"/lỗi Anh; thất bại im lặng dưới hộp thoại |
| 10 | Trợ giúp | 1 | Không trợ giúp ngữ cảnh/hướng dẫn lần đầu cho commit-branch-merge |
| **Tổng** | | **22/40** | **Chấp nhận được (55%)** |

**Design Specificity Verdict — *nửa đặc thù, nửa mặc định SaaS.***
- *Đặc thù thật:* hệ token semantic + quy tắc "accent liều nhỏ"; màn Đăng nhập là khoảnh khắc mạnh nhất (khối `MiniRoll` với vạch phát, nốt màu theo token — chạm đúng chất "sheet nhạc/piano roll"); trạng thái rỗng và cách viết Việt tự nhiên; 3 theme đổi màu tốt (đã xem ảnh moss/claret); ProjectThumb tất định thay vì vẽ giả.
- *Mặc định/hoán đổi được:* Trang chủ, Dự án của tôi, Tổng quan dự án là danh sách hàng + thẻ viền 1px như mọi SaaS; **không có chi tiết thị giác nào nói "nhạc"** ngoài trang đăng nhập (không lưới ô nhịp, không vạch phát, không khuông); Tổng quan dự án dành nửa màn hình cho một khối gradient rỗng với một nốt nhạc (`ProjectThumb size="lg"`) trong khi thông tin cốt lõi của sản phẩm version control (commit mới nhất, số nhánh, người đóng góp) **không hề xuất hiện ở tab Tổng quan** (nằm ở tab khác).
- *Detector:* 1 phát hiện (`transition: width`, `export-dialog.tsx:413`), không dương tính giả; không bắt được các vấn đề dưới đây (phạm vi hẹp).

**Ấn tượng chung:** nền tảng chắc, kỷ luật và sạch, nhưng **biểu đạt thiếu bản sắc ngoài trang đăng nhập** và **editor — nơi người dùng dành 90% thời gian — bị đối xử như một trang web thường**, mất phần lớn diện tích vào vỏ.

**Điểm mạnh (giữ nguyên):** (1) trang Đăng nhập với `MiniRoll`; (2) token + 3 theme nhất quán, editor cũng đổi màu theo theme; (3) hộp Commit rõ ràng: tóm tắt thay đổi, bộ đếm, lỗi tại chỗ; (4) Tổng quan editor khi có dữ liệu thật (ảnh `d_editor_1440x900.png`): thẻ track, thanh VOL/PAN, dải velocity đọc rất rõ, sạch, ít nhiễu.

**Vấn đề ưu tiên (P0–P3 theo thang critique):**
1. **[P1] Editor bị "vỏ web" ăn diện tích** — tiêu đề trang + tab + header editor + thanh công cụ + hai footer chiếm ~406px; trên 1366×657 vùng piano roll còn 148px; tên dự án xuất hiện 2 lần liền nhau (ảnh `d_editor_*`). *Sửa:* chế độ editor toàn màn hình (bỏ tiêu đề/tab trang, footer trang), gom thanh công cụ vào nhóm, tiêu chí: vùng piano roll ≥ 400px ở 1366×768. *Lệnh:* `/impeccable layout`, `/impeccable distill`.
2. **[P1] Tín hiệu tin cậy của tự lưu/phiên bản yếu và đôi khi sai** — trạng thái nằm chân trang nhỏ; sai khi tải lỗi; không cảnh báo khi mất kết nối/đóng tab (M6-1, M6-2, M6-19, M6-20). Đây là *bản sắc* của một sản phẩm "version control cho nhạc": người dùng phải TIN dữ liệu an toàn. *Lệnh:* `/impeccable harden`, `/impeccable clarify`.
3. **[P2] Tổng quan dự án và Trang chủ không nói được điều quan trọng nhất** — Tổng quan không có thông tin phiên bản; Trang chủ dùng khối stat "21 · 10 · 0" (mẫu hero-metric) và thẻ "nổi bật" với gradient rỗng chiếm 60% chiều rộng; hero lấy từ API là câu chung chung. *Lệnh:* `/impeccable shape` (cho Tổng quan: cho thấy commit mới nhất, nhánh, dòng thời gian) và `/impeccable onboard` (giải thích commit/branch/merge bằng ví dụ nhạc).
4. **[P2] Thang chữ phẳng và quá nhỏ** — 70% phần tử chữ dưới 12px, chỉ 2 phần tử đúng 12px; tiêu đề trang 26px so với nội dung 10–13px; đo: 54/54 mục tiêu bấm dưới 44px. *Lệnh:* `/impeccable typeset`, sau đó `/impeccable adapt` cho điện thoại.
5. **[P2] Tính toàn vẹn thị giác của danh sách bị phá bởi cột `auto`** — xem 52.3 (đo được: tiêu đề lệch 233px so với dữ liệu ở "Dự án của tôi", 88px ở Nhánh); người dùng đọc nhãn "THỂ LOẠI" nằm trên chữ "Riêng tư". *Lệnh:* `/impeccable polish`.

**Persona red flags (rút từ số đo):**
- **Alex (nhạc sĩ thạo phần mềm):** Space không phát, Delete không xoá nốt, không gõ được BPM, nốt 1/16 không kéo di chuyển được, chọn nhiều nốt kéo chỉ một nốt, nút Import/Export nằm ngoài màn hình ở ≤1920px.
- **Jordan (lần đầu, không biết Git):** "commit / branch / merge / restore" không giải thích trong ứng dụng; nhãn `(PLACEHOLDER)` nằm giữa giao diện thật; trang Tổng quan không cho biết bước tiếp theo.
- **Sam (bàn phím/đọc màn hình):** editor canvas hoàn toàn chỉ dùng chuột; focus vô hình ở ô commit/ô tìm nhạc cụ/thanh VOL; 7 lần Tab trước khi vào ô email; tương phản trượt ở Badge cảnh báo và số hạng bảng xếp hạng.
- **Casey (điện thoại, một tay):** editor trên 390px vỡ hoàn toàn — nút Commit và thanh chuyển động bị cắt, không thấy piano roll (ảnh `m_editor.png`); mọi mục tiêu bấm < 44px.

**Quan sát nhỏ:** biểu tượng nốt nhạc trong khối gradient rỗng ở Tổng quan/Trang chủ giống nhau đến mức thành "logo ẩn"; căn dọc hai cột màn Đăng nhập lệch (chữ bên trái ở giữa, form bên phải sát trên); thanh chuyển động (transport) bị cắt trên mobile; email chủ dự án bị viết HOA và gạch dưới trong eyebrow ("STAVE_TEST_178861205") — dữ liệu người dùng bị biến đổi kiểu chữ.

**Các mẫu trong "danh sách từ chối" của skill mà giao diện đang dùng — đều là *quyết định bản sắc kế thừa từ mockup*, nên KHÔNG tự sửa, chỉ hỏi người dùng:**
- *Eyebrow* chữ hoa nhỏ phía trên tiêu đề (`PageHeader`, `AuthCard`, Trang chủ, Tổng quan dự án) — skill coi là *cấm* ("tiêu đề tự có sức nặng").
- *Hero-metric* (số lớn + nhãn nhỏ): dải "21 · 10 · 0" ở Trang chủ và khối "Lượt nghe · Lượt fork" ở Tổng quan.
- *Ba mục icon + tiêu đề + đoạn chữ cùng cỡ* ("Vì sao dùng STAVE?").
- *Vạch màu bên trái > 1px* trên thẻ: thẻ track đang chọn dùng `box-shadow: inset 3px 0 0 accent` (`track-panel.tsx:128`).
- *Chữ hoa monospace làm "trang phục kỹ thuật"* cho nhãn ở vài chỗ ngoài dữ liệu (`stripLabel`, tiêu đề cột).
- *Ký tự emoji/glyph thay icon* (`✕ ✅ ❌ ⚠️ 🎵 ↓`) — đây thì là vi phạm CLAUDE.md §4.7 (icon library), không phải quyết định bản sắc.
- *Khối gradient/rounded rectangle đại diện nội dung* (`ProjectThumb`): người dùng đã chốt là placeholder trung thực; chỉ nên **thu nhỏ**, không phải bỏ.

**Câu hỏi để cân nhắc:** Nếu chỉ một chi tiết duy nhất nói "đây là công cụ cho người làm nhạc", nó nên là gì — lưới ô nhịp mờ sau tiêu đề? một vạch phát chạy khi tải? Editor toàn màn hình có nên là "trang chủ thứ hai" của sản phẩm? Tab Tổng quan dự án có nên là dòng thời gian phiên bản thay vì ảnh bìa rỗng?

### 52.2. Bước D — Audit kỹ thuật (5 chiều, thang 0–4)

| # | Chiều | Điểm | Bằng chứng chính |
|---|---|---|---|
| 1 | Khả năng truy cập | **2** | Tương phản trượt (warning 2.33, metal 1.99, hạng 2 = 1.69, success/muted 4.09–4.36); tiêu đề tab đều "STAVE", `lang="en"`; 0/6 input có autocomplete; canvas chỉ dùng chuột; focus vô hình ở 3 loại điều khiển; hộp thoại thiếu Escape/trap; đạt: focus UA cho nút/link, ô nhập có vòng focus, nhiều `aria-label` ở select |
| 2 | Hiệu năng | **2** | Nhàn rỗi ≈ 0 nhưng chỉ cần phát nhạc/cuộn đã ~55–60% luồng chính ngay ở dự án nhỏ; 6000 nốt cuộn 33 fps (headless, chỉ tương đối); chưa đo bundle/Lighthouse; điểm tốt: canvas chỉ vẽ vùng nhìn, cache sample có hàng đợi giới hạn |
| 3 | Responsive | **2** | Trang thường không tràn ngang ở 390px; nhưng chữ < 12px, 0 mục tiêu ≥ 44px; editor vỡ ở mobile, thanh công cụ 2111px, vùng piano roll 440px ở 1024px |
| 4 | Theming | **3** | 3 theme hoạt động đúng, editor đổi màu theo token; hex còn lại là dữ liệu (màu track) hoặc `#fff` nút; cặp màu `warning`/`metal` trượt trên cả 3 theme (cần token chữ riêng) |
| 5 | Toàn vẹn triển khai | **2** | 7 kiểu hộp thoại; `RowList` phá hợp đồng "chung một grid" ở 4 danh sách; emoji thay icon; mã UC/BR lộ ra UI; hai tab tự dựng ngoài `Tabs`; chỉ 1 phát hiện detector |
| **Tổng** | | **11/20** | **Chấp nhận được (10–13)** — *điểm cơ sở trước khi sửa; chạy lại sau Bước E để so* |

**Implementation Integrity — kết luận:** *đạt có điều kiện.* Hệ token và thành phần nền (`Button`, `Card`, `Badge`, `RowList`) mạch lạc và có chủ ý; nhưng các thành phần phức hợp (hộp thoại, danh sách có cột hành động, tab, hộp Xuất) được dựng lặp lại thay vì tái dùng, đó là nguồn của phần lớn lỗi ở Bước B.

**Số lỗi (tính lại sau Bước F + C/D):** P0 = 0; P1 = 29; P2 = 97 (95 + D-1 + D-2); P3 = 48 (45 + D-3, D-4, D-5) → **tổng 174**.

### 52.3. Phát hiện MỚI từ Bước C/D (chưa có ở B/F)
- **D-1 (P2) — `RowList` bị lệch cột do cột cuối `auto`.** Đo trên `/projects` (1440px): lề trái tiêu đề cột `[35, 975, 1091, 1211, 1315, 1405]` so với ô dữ liệu `[35, 742, 858, 978, 1082, 1172]` → **tiêu đề lệch 233px sang phải** (nhãn "THỂ LOẠI" nằm trên chữ "Riêng tư", "HIỂN THỊ" nằm trên nút "Mở Editor"). `gridTemplateColumns`: tiêu đề `928px 104px 108px 92px 78px 0px`, hàng `694.859px 104px 108px 92px 78px 233.141px`. Cùng lỗi ở tab Nhánh: lệch **88px**. Trang Khám phá và Bảng xếp hạng **không lỗi** (không có cột `auto`). Nguyên nhân: cột hành động `auto` co về 0 ở hàng tiêu đề nhưng giãn ở hàng dữ liệu, còn cột đầu `1fr` bù lại. Khả năng cao cùng lỗi ở `commit-history.tsx` (`COLS` kết thúc bằng `auto`) và `admin/users` (chưa đo). CLAUDE.md §4.7 nói hai hàng "bắt buộc dùng chung một chuỗi grid-template" để cột thẳng hàng — hợp đồng bị phá vì `auto`. *Sửa:* đặt độ rộng cố định cho cột hành động (vd `minmax(220px, auto)` không đủ; dùng px cố định hoặc `subgrid`) và gộp thành hằng dùng chung. *Lệnh:* `/impeccable polish` hoặc `/impeccable extract`.
- **D-2 (P2) — Tab "Tổng quan" của dự án không có thông tin phiên bản.** Ảnh `d_project_overview.png`: khối ảnh gradient rỗng 240px, "Lượt nghe 0 / Lượt fork —" cho dự án riêng tư của chính chủ, "Chưa có mô tả" — không có commit mới nhất, số commit, số nhánh, người đóng góp cuối. Ghi trong 52.1 mục 3.
- **D-3 (P3) — mẫu thiết kế "danh sách từ chối" (eyebrow, hero-metric, ba mục icon+chữ, vạch trái 3px)** — xem 52.1; chờ người dùng quyết định.
- **D-4 (P3) — Thẻ track đang chọn dùng vạch trái 3px màu accent** (`track-panel.tsx:128`, `inset 3px 0 0`).
- **D-5 (P3) — Màn Đăng nhập:** hai cột lệch trục dọc (khối trái căn giữa, form phải sát trên); logo xuất hiện 2 lần cùng lúc (header + khối trái).

### 52.4. Hướng dẫn sửa theo thứ tự (kết hợp §50, §51)
1. **Chặn mất dữ liệu** (M6-1, M6-2, M6-19, M6-20, M6-26, M6-40) — `/impeccable harden`.
2. **Editor: không gian + thanh công cụ** (M6-3, M6-4, M3-8, M6-11) — `/impeccable layout`, `/impeccable distill`.
3. **Hộp thoại dùng chung + focus + lỗi tiếng Việt** (B2, B1, M5-1, M1-3/M2-5) — `/impeccable harden`, `/impeccable clarify`.
4. **Thang chữ + token tương phản** (B3, B4, F-3) — `/impeccable typeset`, `/impeccable colorize` (chỉ token chữ `warning-foreground`/`metal-foreground`, giữ BR-90).
5. **`RowList` + Tổng quan dự án** (D-1, D-2) — `/impeccable polish`, `/impeccable shape`.
6. **Hướng dẫn người mới** (10/40 điểm trợ giúp) — `/impeccable onboard`.
7. Cuối cùng: `/impeccable polish` rồi chạy lại **D** để so với điểm cơ sở 11/20 và **critique** để so với 22/40.

### 52.5. Việc cần người dùng quyết (thiết kế, không phải sửa lỗi)
1. *Eyebrow chữ hoa phía trên tiêu đề* (kế thừa mockup) — giữ hay bỏ?
2. *Dải stat 3 cột và khối "Lượt nghe · Lượt fork"* — giữ hay thay bằng nội dung phiên bản?
3. *Khối gradient của `ProjectThumb`* — thu nhỏ hay giữ nguyên?
4. *Bản sắc "nhạc"* — có muốn thêm một chi tiết chữ ký (lưới ô nhịp/vạch phát) cho vỏ ứng dụng không?
5. *Editor toàn màn hình* — chấp nhận bỏ tiêu đề/tab trang và footer trang trong màn soạn nhạc?

**Trạng thái cuối phiên:** không sửa code dự án, không commit/push, không tạo file trong repo (`git status` sạch), hai server đã tắt, 0 lệnh ghi dữ liệu thật, các phiên đăng nhập test đã đăng xuất.

---

## §53 — Kết thúc phiên rà soát UX/UI 29/09/2026: mục lục, quyết định, việc treo, cách tiếp tục, báo cáo hiệu quả skill

> Phần này dành cho chat sau: đọc mục này TRƯỚC, sau đó §50 (tổng kết + cụm gốc) và §52.4 (thứ tự sửa). Các mục §42–§51 chỉ mở khi cần chi tiết `file:line`. **File này nằm trong `.gitignore` — không đồng đội nào thấy; người dùng chỉ gửi những phần cần thiết.**

### 53.1. Mục lục kết quả (tất cả đã ghi đầy đủ)
| Mục | Nội dung |
|---|---|
| §41 | Kế hoạch A–F, 7 module, ràng buộc khi sửa, **Bước A** (quét cơ học toàn frontend) |
| §42 | Bước B module 0 — nền tảng dùng chung (16 mục, B1–B16) |
| §43 | Module 5 — chi tiết dự án + version control (M5-1…21) |
| §44 | Module 3 — quản lý dự án (M3-1…19) |
| §45 | Module 4 — khám phá (M4-1…18); phát hiện "Lượt nghe = lượt tải trang" |
| §46 | Module 1 — xác thực (M1-1…18) + quyết định của người dùng |
| §47 | Module 2 — hồ sơ + quản trị (M2-1…18); tài khoản Google không xoá được tài khoản |
| §48–§50 | Module 6 — editor, 3 phần (M6-1…56); §50 kèm **tổng kết Bước B và 10 cụm nguyên nhân gốc** |
| §51 | **Bước F** — đo thật bằng Playwright: bảng xác nhận/đính chính, số đo bố cục, tương phản, hiệu năng |
| §52 | **Bước C + D** — critique (Nielsen 22/40), audit 5 chiều (11/20), phát hiện D-1…D-5, thứ tự sửa §52.4 |
| §53 | Mục này |

**Con số tại thời điểm kết thúc:** 174 phát hiện — P0: 0 · P1: 29 · P2: 97 · P3: 48 (chưa đo lại cho từng mục sau khi sửa; các mục M5-x, M6-x giữ nguyên mức độ ngoài các điều chỉnh ghi ở §51.4 và §52.2). **Điểm cơ sở để so sau khi sửa:** Nielsen **22/40**; audit **11/20**.

### 53.2. Quyết định của người dùng trong đợt này
- Đăng ký và đăng nhập bằng Google **dùng chung nút ở trang đăng nhập** (không thêm nút vào trang đăng ký). Phần xử lý lỗi/đang chờ của nút Google vẫn cần làm (M1-9).
- **M1-2** (đổi mật khẩu qua `/reset-password` bằng phiên bất kỳ): **tạm bỏ qua** (không xác minh cấu hình Supabase, không sửa).
- **Điều khoản / chính sách riêng tư khi đăng ký:** cần, **làm sau**.
- **Editor toàn màn hình** (bỏ tiêu đề/tab của trang edit, bỏ footer trang, header site thu mỏng ở màn soạn nhạc): **ĐỒNG Ý** — gắn với M3-8 (chuyển form thông tin sang trang Cài đặt), M6-3, M6-4, M6-11. Tiêu chí nghiệm thu: vùng piano roll ≥ 400px cao ở 1366×768; thanh công cụ không cuộn ngang ở 1366px.
- **Mẫu kế thừa từ mockup** (eyebrow chữ hoa, dải stat "21 · 10 · 0", vạch trái 3px ở thẻ track, khối gradient `ProjectThumb` lớn): **để sau** — không tự sửa.
- **Bước E (sửa): CHƯA LÀM**, kết thúc phiên rà soát tại đây. Việc cải thiện UX/UI chung là việc riêng của người dùng, không chia sẻ tài liệu với nhóm.

### 53.3. Câu hỏi còn treo (chưa được trả lời — hỏi lại khi bắt đầu Bước E)
1. Khôi phục khi còn thay đổi chưa commit: tự tạo commit "lưu trước khi khôi phục" hay chỉ cảnh báo đỏ? (§49)
2. Lịch sử quá 20 commit: "Xem thêm" trong editor hay chỉ liên kết sang trang dự án? (§49; phụ thuộc M3-3)
3. Gỡ mã `(UC-xx)/(BR-xx)` khỏi chuỗi hiển thị? Thay emoji bằng `lucide-react` và đổi nút Xuất sang màu accent? (§49)
4. Đóng hộp Audio sketch khi có bản ghi chưa đính kèm: chặn hay hỏi xác nhận? (§49)
5. Trợ năng của piano roll: chấp nhận "chỉ chuột, chỉ máy tính" hay làm lối thay thế bàn phím? Có hỗ trợ cảm ứng không? Nghe thử nốt khi đặt/kéo? Nốt vượt 128 ô nhịp? (§50)
6. "Lượt nghe" → "Lượt xem" ngay, hay sửa backend đếm lượt phát trước? "Xu hướng" định nghĩa ra sao? Có khối "Dự án gần đây" ở trang chủ? (§45)
7. Tên dự án ở "Dự án của tôi" trỏ tới trang chi tiết hay editor? Thể loại: danh sách chuẩn hay tự do? (§44)
8. Tài khoản Google xác nhận xoá tài khoản bằng cách nào? Ảnh đại diện: URL hay tải lên? Tìm kiếm admin khớp chính xác là chủ ý? (§47)
9. Ngôn ngữ nhãn nút trong editor (Việt hoá hành động, giữ thuật ngữ BPM/Quantize/Grid?) và bảng phím tắt cần có. (§48)

### 53.4. Cách tiếp tục ở chat mới (chạy được ngay)
1. Đọc §53 → §50 (tổng kết + 10 cụm gốc) → §52.4 (thứ tự sửa). Cụm nên làm đầu: **chặn mất dữ liệu** (M6-1, M6-2, M6-19, M6-20, M6-26, M6-40), vì đã tái tạo được và nghiệm thu được.
2. Mỗi cụm một nhánh `bugfix/…` do người dùng tự tạo (CLAUDE.md §8, §9); Claude không tự tạo nhánh hay commit.
3. Trước khi sửa `frontend/`, đọc `frontend/AGENTS.md` (phiên bản Next.js lệch kiến thức cũ) và `node_modules/next/dist/docs/` cho các thay đổi metadata/`generateMetadata` (M4-4).
4. **Cách đo lại** (script không nằm trong repo, đã mất cùng scratchpad — dựng lại theo cách này): cài `playwright` vào thư mục tạm ngoài dự án; khởi động `npm run start:dev` (backend, cổng 3001) và `npm run dev` (frontend, cổng 3000); đăng nhập bằng tài khoản test ở §3 (project seed 1 = `55e4451d-…`, seed 3 = `10cd5e9f-…`); **chặn mọi lệnh ghi** (PUT/POST/PATCH/DELETE) tới backend bằng route giả, trừ `/auth/*`; giả `404` cho `GET /explore/projects/*` để không tăng `play_count`; mô phỏng nháp lớn bằng cách trả JSON giả cho `GET /projects/:id/draft`; sau cùng thu hồi các phiên test ở `/profile/sessions`, tắt hai server (`Get-NetTCPConnection -LocalPort 3000,3001`, kèm kill watcher của Nest), kiểm tra `git status` sạch.
5. Sau khi sửa: chạy lại **Bước F** (số đo), **critique** (so với 22/40) và **audit** (so với 11/20).

### 53.5. Ghi chú trung thực về chính file này
- Quy ước đầu file là "không sửa mục cũ". Trong đợt này tôi **có sửa tại chỗ** ba chỗ để tránh người đọc sau bị dẫn sai: (1) bảng kế hoạch ở §41.1 (cột trạng thái các bước B–F); (2) đính chính bằng chữ nghiêng ở tiêu đề **B1** (§42) và **M6-7** (§48) trỏ tới §51.2; (3) một câu bổ sung ở B10 (§42) về tham số `redirect`. Không có nội dung phân tích nào bị xoá.
- Mọi con số hiệu năng đo trên Chromium headless không GPU nên chỉ dùng để so sánh tương đối; tương phản đo bằng canvas trên 3 theme; chưa nghe được âm thanh; chưa thử OAuth Google, cảm ứng thật, cấu hình Supabase.

### 53.6. Báo cáo ngắn: hiệu quả của việc bổ sung các skill vào quy trình làm việc với AI
**Đã dùng:** `web-design-guidelines` (rà quy tắc cơ học), `frontend-design-audit` (đánh giá theo 15 nguyên tắc, thang 0–4, tác động người dùng), `impeccable` (`critique` + `audit`, kèm detector), cộng `claude-api` (chỉ để tra thông số model), Playwright tạm cho phép đo thật.

**Kết quả cụ thể:** rà 7 module (~70 file) → **174 phát hiện** có `file:line`, xếp P0–P3 và gom thành **10 cụm nguyên nhân gốc**; **25 trên ~27 hạng mục đo được đã được xác nhận bằng số**, **1 nhận định sai đã bị đo bác bỏ** (focus — B1/M6-7) và **1 sai sót của chính phép thử** (M5-6 lần đầu) đã sửa; Bước F, C, D thêm **9 phát hiện mới** không skill nào đọc mã tĩnh bắt được (cột danh sách lệch 233px, ô BPM không gõ được, nốt vô hình khi bấm cột phím, "Đã lưu nháp" xanh dù tải lỗi, tương phản `success` 4.09…).

**Skill nào đóng góp gì:**
- *web-design-guidelines* — rẻ và nhanh, tốt nhất cho mẫu lặp lại (0/40 input có autocomplete, 14 chuỗi `...`, `lang="en"`); mù ngữ cảnh, có quy tắc không hợp dự án (dark mode, Title Case), giá trị nền.
- *frontend-design-audit* — mạnh ở "ảnh hưởng người dùng" và xếp hạng để ưu tiên; thiếu file tham chiếu `heuristics.md` trên máy; mặc định muốn tự sửa nên phải chặn bằng chỉ dẫn.
- *impeccable* — cho góc nhìn thiết kế mà hai skill kia không có: đặc thù so với mặc định, persona, bản sắc kế thừa từ mockup, đòi bằng chứng thị giác; detector chỉ tìm ra 1 điều (phạm vi hẹp); nặng và cần "brief" (ở đây dùng CLAUDE.md §4.7 và mockup thay `PRODUCT.md`).
- *Playwright + đo thật (Bước F)* — không phải skill nhưng là **phần có giá trị cao nhất**: biến ước lượng thành số, bác bỏ một khẳng định sai, và bắt lỗi chỉ hiện khi chạy.

**Hạn chế phải nói rõ:**
1. Phân tích tĩnh **có thể sai** (B1) — không skill nào tự chạy ứng dụng; muốn đo phải tự dựng môi trường.
2. **Số lượng dễ gây quá tải:** 174 mục; giá trị thật nằm ở ~10 cụm gốc và ~10 lỗi mất dữ liệu/điều hướng; nhiều mục P3 là ý kiến thiết kế.
3. **Thang điểm khác nhau** giữa các skill (P0–P3, 0–4, điểm Nielsen, 0–4 theo chiều) nên số liệu không cộng gộp chặt chẽ; điểm 22/40 và 11/20 chỉ có ý nghĩa để so **cùng phương pháp** trước/sau.
4. Một số skill chạy ở chế độ **degraded** (critique không có sub-agent tách biệt) — kết quả có thể bị "neo" bởi thứ tự.
5. Chưa sửa dòng code nào: **giá trị chỉ được hiện thực khi làm Bước E**; chi phí của phiên này là toàn bộ công đọc + đo, chưa có cải thiện trong sản phẩm.

**Khuyến nghị dùng sau này (3 lớp):** (1) `web-design-guidelines` cho mỗi PR có giao diện — rẻ; (2) `frontend-design-audit` theo module khi thêm tính năng lớn — lấy tác động người dùng; (3) đo thật bằng Playwright cho các mục rủi ro (mất dữ liệu, bố cục, tương phản) và `impeccable critique` mỗi vài tuần hoặc sau mỗi đợt sửa để theo dõi điểm — luôn kèm bước đo, đừng dừng ở đọc mã.

**Trạng thái cuối phiên:** không sửa code dự án, không commit/push, không tạo file trong repo; hai server đã tắt (cổng 3000/3001 sạch); 0 lệnh ghi dữ liệu thật; các phiên đăng nhập test đã đăng xuất. Ghi nhớ cho phiên sau lưu ở bộ nhớ Claude (2 mục: quy trình audit và vị trí kết quả).

---

## §54 — Bước E: kế hoạch sửa đã duyệt + quyết định của người dùng (30/09/2026)

**Kiểm tra trước khi sửa:** `origin/main` chỉ thêm PR #35 (merge chính nhánh `bugfix/midi-track-name-nul-byte-crash`) — code frontend không đổi so với lúc rà soát 29/09, các `file:line` ở §42–§52 còn đúng (đã tra lại `midi-editor.tsx:221-229,323,331`, `editor-redesign.tsx:713,736`, `restore-dialog.tsx:66`).

### 54.1. Quyết định của người dùng
- **Cách chia:** KHÔNG chia nhiều PR — toàn bộ thay đổi Bước E để chung **một commit**; người dùng tự tạo nhánh, tự commit, tự merge. Claude chỉ sửa file tại chỗ, không tạo nhánh/commit.
- **Câu 1 (M6-19):** khôi phục khi còn thay đổi chưa commit → **chỉ cảnh báo đỏ** (không tự tạo commit "lưu trước khi khôi phục"). Cảnh báo phải dựa vào "nháp khác commit HEAD", không chỉ "chưa lưu xuống server".
- **Câu 4 (M6-20):** đóng hộp Audio sketch khi có bản ghi chưa đính kèm → **hỏi xác nhận** (không chặn hẳn). Đang thu/đang tải lên thì vẫn không cho đóng.
- **Câu 7 (M3-3):** như GitHub — tên dự án ở "Dự án của tôi" trỏ tới **trang chi tiết** `/projects/:id` (thông tin chung); có nút riêng để sang MIDI editor.
- Các câu 2, 3, 5, 6, 8, 9 (§53.3) hỏi khi chạm tới.

### 54.2. Thứ tự làm (các nhóm, cùng một commit)
| # | Nhóm | Mục | Nghiệm thu (Playwright) |
|---|---|---|---|
| E0 | Dựng lại bộ đo | tái tạo M6-1, M6-2, M6-13, M6-20, M6-26, M6-40 | tái tạo được |
| E1 | Mất dữ liệu editor | M6-1 + F-4, M6-2, M6-40, M6-19 | tải lỗi → 0 PUT; lưu lỗi → thử lại + `role=alert` + `beforeunload`; bấm cột phím → số nốt không đổi |
| E2 | Hộp thoại dùng chung + focus | B2, M5-1, M5-4, M5-16, M6-26, M6-27, M6-20, M6-13, M6-22 | Esc/nền không mất nội dung; Ctrl+Z khi hộp mở không đổi nốt; Tab không thoát hộp |
| E3 | Thất bại im lặng + lỗi tiếng Việt | M1-3, M2-5, M6-33, M3-1, M3-2, M2-2, M5-2, M5-3 | giả 409/500 luôn có thông báo tiếng Việt |
| E4 | Nền tảng a11y | §41.3 (lang, autocomplete, `…`, locale, skip link, focus-visible), M4-4, M1-4, M1-1 | tiêu đề tab khác nhau; 1 Tab tới nội dung |
| E5 | Editor toàn màn hình | M3-8, M6-3, M6-4, M6-11, M6-14, F-1, F-2 | piano roll ≥ 400px ở 1366×768; toolbar không cuộn ngang ở 1366 |
| E6 | Chữ + tương phản | B3, B4, F-3 | mọi cặp chữ ≥ 4.5:1 trên 3 theme |
| E7 | RowList + trang chi tiết | D-1, M3-3, D-2 | lệch cột 0px |
| E8 | Tương tác editor | M6-5, M6-41, M6-42, M6-43, M6-50 | các phép thử §51.3 đạt |
| E9 | Sau | onboard, M6-51, P3 còn lại | |
| Cuối | Đo lại F, critique (22/40), audit (11/20) | | |

Kết quả từng nhóm ghi thành §55 trở đi.

---

## §55 — Bước E: E0 (dựng lại bộ đo) + E1 (chặn mất dữ liệu editor) — ĐÃ SỬA, đã đo (30/09/2026)

**Nhánh:** sửa tại chỗ trên `bugfix/midi-track-name-nul-byte-crash` (nhánh này đã merge qua PR #35, nội dung trùng `main`). Người dùng tự tạo nhánh mới + commit chung một lần cho toàn Bước E (§54.1). Chưa commit.

### 55.1. E0 — bộ đo
- Playwright 1.63 ở scratchpad `pw/` (ngoài repo): `h.js` (đăng nhập 1 lần, lưu `state.json`; chặn mọi lệnh ghi trừ `/auth/*`; giả 404 `/explore/projects/*`; tuỳ chọn `abortDraftGet`, `abortDraftPut`, `fakeCommits`), `e1.js` (m61, m62, m640, m619, commitDlg, m620), `e1b.js` (hồi phục sau lỗi lưu, thử tải lại). Script mất khi scratchpad bị xoá — dựng lại theo mô tả này.
- **Không project test nào có commit** (tra DB chỉ đọc: 3 seed, nhánh `main`, 0 commit) → M6-19 đo bằng lịch sử giả: `GET /projects/:id/branches` trả `head_commit_id = 'c-head'`, `GET /commits` trả 2 commit giả (HEAD = đúng bản nháp vừa tải, 1 commit cũ rỗng).
- Selector cần nhớ: nút dừng thu âm phải dùng tên chính xác `'Dừng'` (nút transport có title "Dừng, đưa playhead về đầu" cũng khớp regex `/Dừng/`); nút Audio sketch ở 1920px nằm ngoài vùng nhìn → click bằng `evaluate`; nút "Khôi phục" chỉ hiện khi đã mở thẻ commit.

### 55.2. Số đo trước / sau
| Mục | Trước (E0) | Sau (E1) |
|---|---|---|
| M6-1 tải nháp lỗi | editor rỗng hiện ra, chân trang "Đã lưu nháp", thêm track + nốt → 1 `PUT` (tracks 1, notes 1) sẽ ghi đè nháp thật | màn "Không tải được bản nháp" (`role=alert`) + nút Thử lại, không có canvas, **0 PUT**; bấm Thử lại khi mạng ổn → editor mở đúng 1 nốt |
| F-4 | "Đã lưu nháp" xanh dù tải lỗi | hết (editor không mở) |
| M6-2 lưu lỗi | 1 lần thử trong 12–17 giây, chân trang "Chưa lưu", 0 alert, không có `beforeunload` | 3 lần thử trong 12 giây (2s → 2s → 5s, tiếp 15s, 30s), thanh cảnh báo `role=alert` "Không lưu được bản nháp. Sẽ tự thử lại sau N giây…" + "Thử lại ngay", chân trang "Không lưu được", **có** hộp hỏi khi đóng tab; mạng trở lại + Thử lại ngay → "Đã lưu nháp", hết cảnh báo, hết `beforeunload` |
| M6-40 bấm cột phím sau khi cuộn ngang | 1 → 2 nốt (nốt vô hình), có PUT | 1 → 1, 0 PUT |
| M6-19 khôi phục khi nháp đã lưu nhưng khác HEAD | không cảnh báo | "Bản nháp đang có 1 thay đổi chưa commit — khôi phục sẽ ghi đè…" (`role=alert`) |
| M6-13/M6-26/focus trap (baseline cho E2) | bấm nền đóng hộp Commit, mở lại ô trống; Tab thoát khỏi hộp | chưa sửa (E2) |
| M6-20 (baseline cho E2) | Esc khi đang thu → hộp đóng | chưa sửa (E2) |

### 55.3. Thay đổi code
- `midi-editor.tsx`: `loadError` + `retryLoad` (effect tải nháp phụ thuộc `loadAttempt`); `SaveStatus` thêm `"error"` (export type); `runSave` / `scheduleRetry` / `retrySaveNow` với `SAVE_RETRY_DELAYS_MS = [2000, 5000, 15000, 30000]`; `editVersionRef` chặn request cũ báo "Đã lưu" cho nội dung nó không mang; `mountedRef` chặn thử lại sau unmount; unmount flush khi `saveStatus !== "saved"`; `beforeunload` khi chưa lưu; `flushDraft` lỗi thì vào chu trình thử lại; `applyRestoredSnapshot` tăng `editVersionRef`. Chuỗi "Loading draft…" → "Đang tải bản nháp…".
- `redesign/editor-redesign.tsx`: prop `saveRetryInSec`, `onRetrySave`; thanh cảnh báo lỗi lưu dưới header; chân trang có trạng thái "Không lưu được"; `uncommittedCount` (dùng `summarizeChanges(HEAD, nháp)`, không có HEAD thì tính số track + nốt) truyền cho `RestoreDialog`.
- `redesign/restore-dialog.tsx`: prop `uncommittedCount`, cảnh báo đỏ `role=alert` khi chưa lưu **hoặc** chưa commit (quyết định câu 1: chỉ cảnh báo).
- `redesign/history-panel.tsx`: dùng `SaveStatus`, nhãn "Không lưu được".
- `piano-roll.tsx`: `handleMouseDown` thoát sớm khi `cx < KEY_WIDTH`.
- Theo yêu cầu người dùng: không thêm comment giải thích vào code (lý do ghi ở đây).

### 55.4. Verify
- `tsc --noEmit` sạch; `eslint` 5 cảnh báo `exhaustive-deps` ở effect phím tắt — **có sẵn từ trước** (đã so bằng `git stash`), không phải do E1.
- Mức đo: Playwright headless, mọi lệnh ghi bị chặn/giả; chưa thử backend thật trả lỗi thật, chưa thử tay trên trình duyệt thật. Giới hạn đã biết: một request `PUT` cũ đang bay lúc khôi phục vẫn có thể tới server sau (race có sẵn, không đổi).
- Còn lại theo §54.2: E2 → E8.

---

## §56 — Bước E: E2 (hộp thoại dùng chung + focus) — ĐÃ SỬA, đã đo (30/09/2026)

**Chưa commit** (gộp chung một commit Bước E, §54.1). Server 3000/3001 **để chạy tiếp** theo yêu cầu người dùng (chỉ trong phiên 30/09).

### 56.1. Thiết kế
- `frontend/lib/use-dialog.ts` — hook `useDialog({ open, onClose, closeDisabled })` trả ref gắn vào khung hộp (`tabIndex={-1}`): ngăn xếp hộp thoại (chỉ hộp trên cùng nhận phím), `Escape` (listener `document` pha capture + `stopPropagation`), giữ Tab/Shift+Tab trong hộp, focus ban đầu `[data-autofocus]` → phần tử focus được đầu tiên → khung, khoá cuộn `<main>` (CLAUDE.md §10), trả focus về phần tử cũ khi đóng. `isDialogOpen()` cho phím tắt editor.
- `frontend/components/ui/dialog.tsx` — `Dialog` (Tailwind: lớp phủ + khung, `role` dialog/alertdialog, `aria-modal`, `aria-labelledby` → `<h2>`), `DialogError` (`role="alert"`), `DialogActions`.
- Áp dụng: `ConfirmDialog` (thêm prop `error`), 3 hộp ở `projects/[id]/settings`, `ActionPanel` ở `admin/users` (thêm nhãn "Lý do"/"Username xác nhận", thứ tự nút Huỷ → Xác nhận), `MergeConflictDialog` (hook + `name` cho cặp radio + `fieldset/legend` + prop `error`), `CommitCompare` (hook thay listener `window`), `redesign/modal.tsx` (hook, `<h2>`, `aria-modal`, `ModalError` có `role="alert"`), `ExportDialog` (hook, lớp phủ không đóng khi đang render, z-index 50/51, `aria-pressed` + nhóm có nhãn cho sample rate, `role="progressbar"`).
- **M5-1 / M3-2 (phần có hộp thoại):** lỗi xoá nhánh, hợp nhất sau xung đột, khôi phục ở trang dự án, lưu trữ ở "Dự án của tôi" hiện **trong** hộp. (Khôi phục dự án đã lưu trữ ở danh sách không có hộp → để E3 cùng Toast.)
- **M6-13:** `handleKeyDown` của editor bỏ qua khi `isDialogOpen()`.
- **M6-26:** nội dung commit giữ ở `editor-redesign` (`commitMessage`), chỉ xoá sau khi commit thành công; `CommitDialog` nhận `message`/`onMessageChange`, focus bằng `data-autofocus`.
- **M6-20 (câu 4: hỏi xác nhận):** `AudioSketchPanel` báo `onStateChange` (`idle | recording | reviewing | attaching`, "đang xin quyền micro" tính là recording); `Modal` có `closeDisabled` khi recording/attaching; khi có bản ghi chưa đính kèm thì Esc/nền/✕ mở `ConfirmDialog` "Bỏ bản ghi chưa đính kèm?".
- **M6-22:** bỏ `outline: none` ở ô commit, ô tag, ô tìm nhạc cụ (dùng viền focus mặc định; viền thương hiệu thống nhất để E4); thanh VOL/PAN: class `stave-range-track` + quy tắc `:has(> input:focus-visible)` trong `globals.css`.
- Đổi nhỏ kèm theo: "Đang xử lý..." → "…" ở các chuỗi đã chạm; hộp "Khôi phục dự án" ở settings bỏ màu `warning` cho tiêu đề/nút (tương phản trượt, B3) → nút primary.

### 56.2. Số đo (Playwright, mọi lệnh ghi bị chặn/giả; `failWrites` trả 500 để thử lỗi)
| Kiểm tra | Trước (E0/§51) | Sau |
|---|---|---|
| Hộp Commit: focus khi mở | có (effect riêng) | vào `#commit-message` |
| Ctrl+Z khi hộp Commit mở (focus ở khung hộp) | hoàn tác nốt trong editor (1 → 0) | số nốt giữ nguyên (2 → 2) |
| Tab trong hộp Commit / Xuất âm thanh / Lưu trữ (settings) | thoát ra thanh công cụ phía sau | giữ trong hộp (20/12/8 lần Tab) |
| Esc đóng + trả focus | Esc đóng, focus không trả | đóng, focus về nút "Commit Changes" / "Lưu trữ dự án" |
| Nội dung commit sau Esc / bấm nền rồi mở lại | trống | giữ nguyên |
| Audio sketch: Esc + bấm nền khi đang thu | hộp đóng, mất bản ghi | vẫn mở, đang thu |
| Audio sketch: Esc khi có bản ghi chưa đính kèm | hộp đóng, mất bản ghi | hộp xác nhận; Esc huỷ xác nhận thì hộp sketch vẫn mở; "Bỏ bản ghi" thì đóng |
| Lưu trữ (settings + danh sách) API lỗi | không thấy lỗi (bị lớp phủ che / nuốt) | "Loi gia lap tu test" `role=alert` trong hộp |
| `<main>` khi hộp mở | cuộn được | `overflow: hidden`, trả lại `""` khi đóng |
| Thanh VOL focus bằng bàn phím | vô hình (`opacity: 0`) | viền `solid 2px` accent trên thanh |
| Ô commit focus | `outline: none` | `outline: auto` |
| E1 hồi quy (m61, m640, m619) | — | vẫn đạt |

Ảnh chụp: `pw/e2_settings_delete.png`, `pw/e2_projects_archive.png` (scratchpad).

### 56.3. Ghi chú trung thực
- Ctrl+Z khi focus ở khung hộp Commit vẫn xoá chữ cuối trong ô commit — đó là **undo gốc của Chrome** cho ô vừa gõ, không phải phím tắt editor (đã tách bằng script: số nốt không đổi). Không sửa.
- Chưa đo: `MergeConflictDialog`, xoá nhánh, khôi phục ở trang dự án, `CommitCompare` (cần dữ liệu có commit/nhánh — test account không có); `admin/users` (cần tài khoản admin). Các hộp này dùng chung hook đã đo ở hộp khác, nhưng chưa có số đo riêng.
- `tsc` sạch; `eslint` 6 cảnh báo đều có từ trước (5 `exhaustive-deps` ở editor, 1 `no-img-element`).
- Còn theo §54.2: E3 → E8. M5-2 (hộp xoá nhánh nói "an toàn" khi chưa có preview) thuộc E3.

---

## §57 — Bước E: E3 (thất bại im lặng + lỗi tiếng Việt) — ĐÃ SỬA, đã đo (30/09/2026)

**Chưa commit** (chung commit Bước E). Server 3000/3001 vẫn chạy (theo yêu cầu người dùng trong phiên này).

### 57.1. Thay đổi
- **`frontend/lib/error-message.ts` (mới):**
  - `apiErrorMessage(err, fallback)`: bảng ánh xạ ~60 thông điệp backend thật (tra bằng grep `new *Exception(` + thông điệp DTO trong `backend/src`) sang tiếng Việt có hướng xử lý. Thông điệp backend đã là tiếng Việt thì giữ nguyên (nhận diện bằng dấu tiếng Việt). Còn lại theo status: 401 hết phiên, 403 không có quyền, 404/409 "tải lại trang", 413, 429, ≥500 "máy chủ đang gặp sự cố". Riêng `TypeError` (fetch không tới được) → "Không kết nối được máy chủ". Các chuỗi dạng `Failed to …: ${error.message}` (lỗi Supabase thô) rơi vào nhánh 500, không còn lộ ra UI.
  - `authErrorMessage(error)`: ánh xạ `error.code` của Supabase Auth (`invalid_credentials`, `email_not_confirmed`, `user_already_exists`, `weak_password`, `same_password`, `over_email_send_rate_limit`, `otp_expired`…).
- **M1-3:** login/register/forgot-password/reset-password dùng `authErrorMessage`, vùng lỗi `role="alert"`. Login: lỗi `email_not_confirmed` hiện nút **"Gửi lại email xác nhận"** (`supabase.auth.resend({ type: "signup", emailRedirectTo: /auth/callback })`, có trạng thái đang gửi/đã gửi).
- **M2-5 / M6-33:** bỏ 4 hàm `messageOf` cục bộ (`branch-list`, `commit-history`, `use-version-control`, `audio-sketch-panel`) và mọi `err instanceof ApiError ? err.message : "Có lỗi xảy ra"` ở admin, profile, sessions, projects, projects/new, edit, settings, commit-compare → `apiErrorMessage` với câu dự phòng theo ngữ cảnh ("Không lưu được hồ sơ.", "Không xoá được dự án."…). Gỡ các import `ApiError` không còn dùng.
- **M3-1:** trang edit tách `saveError` khỏi lỗi tải; bỏ điều kiện `error && submitting` (luôn sai) → lỗi lưu hiện ra, `role="alert"`.
- **M3-2 (phần còn lại):** khôi phục dự án đã lưu trữ ở danh sách lỗi → Toast `danger` (không tự tắt). `Toast` variant `danger` dùng `role="alert"`.
- **M2-2:** trang Thiết bị tách `loadError` (thay danh sách + nút Thử lại) và `actionError` (dải báo lỗi phía trên, danh sách vẫn còn).
- **M5-2:** hộp xoá nhánh 3 trạng thái: đang kiểm tra (nút Xoá vô hiệu, "Đang kiểm tra các commit chưa hợp nhất…"), lỗi preview (cảnh báo đỏ "Không kiểm tra được… có thể làm mất commit", vẫn cho xoá), có preview (như cũ). `ConfirmDialog` thêm prop `confirmDisabled`.
- **M5-3:** nút "Hợp nhất vào …" mở hộp xác nhận ("N commit của nhánh A sẽ được đưa vào B" + giải thích xung đột), lỗi hiện trong hộp; nút bị vô hiệu khi `divergence.ahead === 0` (title giải thích).
- Dọn: `globals.css` bị lẫn LF/CRLF do dòng thêm ở E2 → đã chuẩn hoá CRLF như phần còn lại.

### 57.2. Số đo (Playwright; lệnh ghi bị chặn/giả; Supabase Auth thật cho sai mật khẩu, giả cho chưa xác nhận)
| Kiểm tra | Trước | Sau |
|---|---|---|
| Đăng nhập sai mật khẩu (Supabase thật) | "Invalid login credentials" | "Email hoặc mật khẩu không đúng." (`role=alert`) |
| Đăng nhập email chưa xác nhận (giả `error_code`) | "Email not confirmed", không có lối đi tiếp | câu tiếng Việt + nút "Gửi lại email xác nhận" → gọi `POST /auth/v1/resend` (`type: signup`, đã chặn không gửi thật) → "Đã gửi lại thư xác nhận" |
| Lưu thông tin dự án trùng tên (409 giả) | không có thông báo (M3-1) | "Bạn đã có một dự án trùng tên. Hãy đặt tên khác." |
| Lưu trữ dự án lỗi 500 | thông điệp thô | "Không lưu trữ được dự án. Máy chủ đang gặp sự cố, hãy thử lại sau." (trong hộp) |
| Thu hồi thiết bị lỗi (thiết bị thứ 2 giả) | danh sách biến mất, còn một dòng đỏ | danh sách còn, dải lỗi `role=alert` |
| Khôi phục dự án đã lưu trữ ở danh sách lỗi (giả `archived_at`) | im lặng | Toast `role=alert` "Không khôi phục được dự án…" |
| Xoá nhánh khi preview đang tải / lỗi (nhánh giả, preview trễ 1,5s rồi 500) | câu trấn an "không làm mất nội dung nào" | "Đang kiểm tra…" + nút Xoá vô hiệu → cảnh báo đỏ "Không kiểm tra được…", nút Xoá bật lại |
| Bấm "Hợp nhất vào main" | gọi API ngay | 0 request cho tới khi xác nhận; hộp nêu "2 commit…"; lỗi 500 hiện trong hộp |
| Hồi quy E1/E2 (m62, commitDlg, sketch, settingsArchive) | — | vẫn đạt |

### 57.3. Ghi chú
- Chưa thử: hộp admin (không có tài khoản admin), `reset-password`/`forgot-password` với lỗi thật (chỉ đổi cách hiển thị, cùng hàm đã đo ở login), luồng hợp nhất có xung đột thật.
- Lỗi test của chính mình: lần đầu bài thu hồi thiết bị dùng selector `/Đăng xuất/` khớp nhầm nút ở header; tài khoản test chỉ có 1 phiên nên không có nút thu hồi → viết lại bằng thiết bị giả. Đã kiểm tra lại: phiên test vẫn hoạt động, không bị đăng xuất.
- `tsc` sạch; `eslint` còn 6 cảnh báo cũ.
- Còn theo §54.2: E4 → E8.

---

## §58 — Bước E: E4 (nền tảng a11y) — ĐÃ SỬA, đã đo (30/09/2026)

**Chưa commit** (chung commit Bước E). Server 3000/3001 vẫn chạy.

### 58.1. Thay đổi
- **M4-4 tiêu đề tab:** Next 16 chỉ cho `metadata` ở Server Component (tra `node_modules/next/dist/docs/01-app/01-getting-started/14-metadata-and-og-images.md`, `03-api-reference/04-functions/generate-metadata.md`) mà mọi `page.tsx` đều là client → thêm 16 file `layout.tsx` server "chuyển tiếp" (chỉ `return children`, không thêm DOM) khai `metadata.title` cho từng route; root dùng `title: { template: "%s · STAVE", default: "STAVE — Quản lý phiên bản cho dự án nhạc MIDI" }`. **Bẫy đã gặp:** layout cha đặt `title` là chuỗi thì con **mất** template gốc (đo được "Dự án" thay vì "Dự án · STAVE") → layout cha (`projects`, `projects/[id]`, `profile`) phải khai `{ default, template: "%s · STAVE" }`. Tiêu đề route động là chữ tĩnh ("Dự án", "Trình soạn nhạc", "Người sáng tác") — chưa có tên dự án/người dùng.
- **B6:** `<html lang="vi">`.
- **Skip link + `<main id="main" tabIndex={-1}>`** ở `app/layout.tsx` ("Bỏ qua tới nội dung chính", `sr-only` → hiện khi focus).
- **B1 focus thống nhất:** `@layer base { :focus-visible { outline: 2px solid var(--accent); outline-offset: 2px } }` trong `globals.css` (đặt trong `@layer base` để các utility Tailwind như `focus:outline-none` + ring của ô nhập vẫn thắng).
- **M1-5 / §41.3:** `name` + `autoComplete` cho ô nhập ở login/register/forgot/reset/profile (email, current-password, new-password, name, username, url), `autoComplete="off"` + `spellCheck={false}` cho tên dự án/thể loại/tên nhánh/tag/tìm kiếm; 3 ô tìm kiếm → `type="search"`; ô URL ảnh đại diện `inputMode="url"`.
- **M1-4:** bỏ `minLength={8}` ở register/reset/profile (trình duyệt chặn bằng câu tiếng Anh trước khi kiểm tra tiếng Việt trong code chạy; code đã tự kiểm độ dài).
- **M1-1:** `/auth/callback` đọc `error`/`error_code` từ hash/query → màn "Không đăng nhập được" + câu tiếng Việt (`authErrorMessage`) + liên kết "Về trang đăng nhập"/"Gửi liên kết mới"; không có lỗi nhưng quá 15 giây vẫn chưa có phiên → cũng hiện màn này.
- **§41.3 chuỗi:** `...` → `…` ở 13 chuỗi hiển thị (tải/lưu/khôi phục, placeholder, dấu chấm lửng phân trang).
- **§41.3 locale:** `APP_LOCALE` trong `lib/format-date.ts`, thay 18 chỗ `"vi-VN"` ở 10 file.

### 58.2. Số đo
| Kiểm tra | Trước (§51) | Sau |
|---|---|---|
| Tiêu đề tab 12 route | đều "STAVE" | khác nhau, dạng "Khám phá · STAVE", "Trình soạn nhạc · STAVE"… |
| `document.documentElement.lang` | en | vi |
| `/login`: phím để tới ô email | 7 lần Tab | Tab (skip link) → Enter → 2 Tab (qua logo trong thẻ) |
| Viền focus liên kết header | viền mặc định trình duyệt | `solid 2px` màu accent (ảnh `pw/e4_focus_header.png`) |
| `name:autocomplete` ở login/register/forgot | 0/6 | 6/6 (`email:email`, `password:current-password`, `new-password:new-password`…) |
| Ô tìm ở /explore | `type=text` | `type=search` |
| Đăng ký mật khẩu 3 ký tự | câu tiếng Anh của trình duyệt, không gọi Supabase | "Mật khẩu phải có ít nhất 8 ký tự." (`role=alert`), 0 lần gọi signup |
| `/auth/callback#…error_code=otp_expired` | "Đang đăng nhập…" mãi | "Không đăng nhập được — Liên kết đã hết hạn…" + 2 liên kết |
| Hồi quy E1/E2/E3 (m640, commitDlg, loginWrong) | — | vẫn đạt |

### 58.3. Ghi chú
- Lỗi của chính script: lần đầu chèn thuộc tính, phép kiểm "đã có `name=`" khớp nhầm `className=` và cả thuộc tính của ô kế tiếp → 6 ô thiếu `name`/`autoComplete`; đã quét lại toàn bộ bằng regex theo từng thẻ và bổ sung.
- Nút chỉ có biểu tượng trong editor (24 nút chỉ có `title`) chưa đụng — để E5 (editor toàn màn hình, gom thanh công cụ).
- `tsc` sạch; `eslint` còn 6 cảnh báo cũ.
- Còn theo §54.2: E5 → E8.

---

## §59 — Bước E: E5 (editor toàn màn hình + thanh công cụ) — ĐÃ SỬA, đã đo (30/09/2026)

**Chưa commit** (chung commit Bước E). Server 3000/3001 vẫn chạy.

### 59.1. Quyết định của người dùng (30/09)
- **M6-11 (màn hẹp):** thu gọn panel + báo khi quá hẹp.
- **M6-12 / câu 9 §53.3 (ngôn ngữ nhãn nút editor):** **giữ tiếng Anh toàn bộ** nhãn nút (Select/Draw/Erase, Copy, Undo, Import MIDI, Commit Changes…). Tooltip/thông báo/chân trang vẫn tiếng Việt như cũ.

### 59.2. Thay đổi
- **M3-8:** `app/projects/[id]/edit/page.tsx` chỉ còn editor (bỏ link "Quay lại", `PageHeader`, tab "Trình soạn nhạc/Thông tin", form). Dự án đã lưu trữ → thẻ "đã lưu trữ" + liên kết "Khôi phục trong Cài đặt dự án". Form sửa tên/mô tả/thể loại chuyển thành `ProjectInfoCard` ở `projects/[id]/settings` (thay khối xem-chỉ-đọc cũ): nút Lưu chỉ bật khi có thay đổi, "Đã lưu." `role=status`, lỗi `role=alert`, chỉ đọc khi đã lưu trữ.
- **M6-3 vỏ trang:** `SiteFooter` thành client component, trả `null` ở route `/projects/:id/edit`; `SiteHeader` cao `h-11` (thay `h-14`) ở route đó. Header editor thêm nút ← "Về trang dự án" (`/projects/:id` — nơi có tab Commit/Nhánh/Cài đặt; giảm M6-21).
- **M6-4 thanh công cụ:** gỡ `overflowX: auto`, cho `flexWrap: wrap` (không bao giờ giấu nút sau thanh cuộn); master volume chuyển lên header editor (cạnh Commit); Select all/Copy/Paste/Undo/Redo thành nút biểu tượng có `aria-label`; Import MIDI/Export MIDI/Export Audio/Audio sketch gom vào menu **File ▾** (`aria-haspopup="menu"`, `role=menu/menuitem`, focus vào mục đầu, Esc/bấm ngoài đóng); bỏ một vạch chia bị lặp; khoảng cách 6→5px, vạch chia 6→3px, padding 20→16px.
- **M6-11:** 2 nút ẩn/hiện panel Tracks và panel lịch sử (header editor, `aria-pressed`); panel lịch sử mặc định ẩn khi cửa sổ < 1280px; ≤ 767px: panel Tracks mặc định ẩn + dải báo "Trình soạn nhạc cần màn hình rộng hơn…" đầu editor (nút "Vẫn tiếp tục").
- **M6-14 ô BPM:** ô chữ `inputMode="numeric"` + trạng thái nháp dạng chuỗi, chỉ áp dụng khi Enter/rời ô, kẹp 20–300; Esc huỷ; ↑/↓ tăng giảm 1; `aria-label="Tempo (BPM)"`; chọn hết khi focus. **F-2:** rộng 52px, căn giữa (không còn nút tăng giảm che chữ).
- **F-1:** dải velocity vẽ số 127/64/1 căn phải trong cột nhãn → không còn chồng lên chữ "VELOCITY".
- Sửa theo: `aria-label` cho ô chọn Speed, thanh master volume.

### 59.3. Số đo (Playwright; "rollH" = chiều cao vùng cuộn piano roll, chưa gồm dải velocity 104px)
| Khung nhìn | Trước (§51): roll H / W | Sau: roll H / W | Thanh công cụ | Nút File/Commit thấy được |
|---|---|---|---|---|
| 1366×657 | 148 / 782 | **361** / 782 | 1 hàng (53px) | có / có |
| **1366×768** | 259 / 782 | **472** / 782 (tiêu chí ≥ 400 ✅) | 1 hàng, không cuộn ngang ✅ | có / có |
| 1280×720 | 211 / 696 | **424** / 696 | 1 hàng | có / có |
| 1024×768 | 242 / 440 | **434** / 762 (panel lịch sử tự ẩn) | 2 hàng (91px), không cuộn | có / có |
| 1920×1080 | 571 / 1336 | 784 / 1336 | 1 hàng | có / có (trước: 2/4 nút tệp bị che) |
| 2560×1300 | 791 / 1976 | 1004 / 1976 | 1 hàng | có / có |
| 390×844 | vỡ | 359 / 390 (panel Tracks tự ẩn) + dải báo màn hẹp | 4 hàng | File có; Commit bị header đè (chấp nhận theo quyết định "báo khi quá hẹp") |
- Vỏ trang còn lại: header site 45px + header editor 60px + thanh công cụ 53px + chân editor 34px (không còn khối tiêu đề/tab ~137px và footer site 70px).
- Ẩn cả 2 panel ở 1366px: vùng piano roll 782 → **1366px** rộng.
- BPM: gõ "90"+Enter → 90; gõ "999"+Tab → 300; gõ rồi Esc → giữ giá trị cũ; ↑ ở 300 → 300; có 1 lần autosave sau khi đổi.
- Menu File: 4 mục, focus vào "Import MIDI", Esc đóng, "Export Audio" mở đúng hộp xuất.
- Cài đặt: tên nạp đúng, nút Lưu vô hiệu khi chưa đổi, sửa mô tả → `PATCH /projects/:id` (giả) → "Đã lưu."; trang edit không còn tab "Thông tin".
- Hồi quy E1/E2 (m61, m640, m619, commitDlg, sketch, exportDlg) vẫn đạt — script E2 đổi sang mở Audio sketch/Export Audio qua menu File.
- Ảnh: `pw/e5_editor_1366x768.png`, `e5_editor_1024x768.png`, `e5_editor_390.png`, `e5_editor_panels_hidden.png`.

### 59.4. Ghi chú
- Chưa thử tay trên trình duyệt thật; chưa nghe âm thanh (không đổi logic phát).
- `tsc` sạch; `eslint` còn 6 cảnh báo cũ.
- Bản sao `editor-redesign.tsx` trước E5 ở scratchpad (`editor-redesign.before-e5.tsx`) — mất khi xoá scratchpad; git diff là nguồn chính.
- Còn theo §54.2: E6 → E8.

---

## §60 — Bước E: E6 (chữ + tương phản) — ĐÃ SỬA, đã đo (30/09/2026)

**Chưa commit** (chung commit Bước E). Server 3000/3001 vẫn chạy.

### 60.1. Thay đổi
- **B3 / F-3 token chữ riêng** (`globals.css`, chỉ ở `:root` — preset không ghi đè nên BR-90 giữ nguyên; `--warning`/`--success` dạng nền **không đổi**): `--warning-foreground: oklch(0.5 0.1 70)`, `--success-foreground: oklch(0.47 0.085 150)`, `--metal-foreground: oklch(0.5 0.05 80)` + đăng ký `--color-*-foreground` trong `@theme inline`. 17 lớp `text-warning|success|metal` → `text-*-foreground` (Badge, Toast, settings, profile, branch-list, commit-compare, merge-conflict, audio-sketch); `export-dialog` chữ `var(--warning|success)` → `-foreground`.
- **`--muted-foreground`** tối hơn: unleashed 0.54 → 0.50, moss 0.52 → 0.49, claret 0.51 → 0.49 (chữ phụ trên `surface-muted` từng trượt 4.22).
- **M4-9 huy hiệu hạng 1–3:** `text-background` → `text-foreground` trên nền `metal`/`border-strong`/`warning`.
- **B4 thang chữ:** 80 lớp `text-[9px|10px|11px]` → `text-xs` (12px) toàn app; `Button` 12 → 13px; `INPUT_CLASS` và `AUTH_INPUT_CLASS` `text-base` (16px, chống iOS tự phóng to) → `sm:text-[13px]`, ô auth cao 40px trên mobile; `RowTime` thêm `whitespace-nowrap` (chữ 12px làm "2 tuần trước" xuống 2 dòng). Editor (inline style) chỉ nâng 9/10/10.5px → 11px (13 chỗ) để giữ thanh công cụ 1 hàng; chữ vẽ trên canvas (nhãn phím, thước, velocity) để E8 cùng sửa dpr.
- Công cụ: `scratchpad/contrast.js` tính tương phản OKLCH → sRGB (khớp số đo §51: 4.23 vs 4.22) để chọn giá trị trước khi sửa.

### 60.2. Số đo (Playwright, màu lấy từ trình duyệt qua canvas, 3 theme)
| Cặp | Trước (§51) | Sau (unleashed / moss / claret) |
|---|---|---|
| chữ cảnh báo trên `warning-muted` | 2.33 | 5.28 / 5.28 / 5.28 |
| chữ metal trên `metal-muted` | 1.99–2.36 | 5.06 / 4.93 / 5.08 |
| chữ success trên `success-muted` | 4.09 | 5.54 / 5.54 / 5.54 |
| `muted-foreground` trên `surface-muted` | 4.22 / 4.36 / 4.58 | 4.98 / 4.92 / 5.00 |
| hạng 1 (chữ trên `metal`) | 2.23–2.67 | 6.53 / 5.44 / 5.97 |
| hạng 2 (chữ trên `border-strong`) | 1.69–1.86 | 8.62 / 7.94 / 8.19 |
| hạng 3 (chữ trên `warning`) | 2.46–2.52 | 5.78 / 5.84 / 6.17 |
| accent / danger / nút chính | đạt | vẫn đạt (6.3–6.7, 5.82) |
**14 cặp × 3 theme: 0 cặp dưới 4.5:1.**

| Cỡ chữ (phần tử có chữ trong `<main>`, 1366px) | Trước | Sau |
|---|---|---|
| /explore | 70% dưới 12px | 0/158 dưới 12px |
| /projects, /projects/:id, /rankings | — | 0% dưới 12px |
| Ô email /login ở 390px | 12px, cao 37px | 16px, cao 40px |
| Thanh công cụ editor 1280 / 1366 | — | vẫn 1 hàng; piano roll 424 / 472px |

### 60.3. Ghi chú trung thực
- **Lỗi của chính script, đã sửa:** thay `font: \`700 10px` bằng regex trong heredoc bash làm `\1` thành ký tự điều khiển `\x01` → 11 nhãn editor mất đậm (CSS vẫn chấp nhận nên không lỗi, chỉ đo thấy thanh công cụ rộng ra và tràn 2 hàng ở 1280). Khôi phục đúng trọng lượng từ `git show HEAD` theo thứ tự; quét lại toàn `app/components/lib`: 0 file còn ký tự điều khiển. Thêm: file `scratchpad/locale.py` (E4) che module chuẩn `locale` của Python — đã đổi tên.
- **Chưa làm ở B4:** vùng bấm ≥ 44px (nút vẫn `h-8` = 32px trên desktop; chỉ ô nhập auth lên 40px ở mobile). Tăng chiều cao nút toàn app làm đổi bố cục nhiều trang — để sau nếu người dùng muốn.
- Chữ nhỏ hơn 12px còn lại có chủ đích: một số nhãn editor 11px (mật độ thanh công cụ), chữ canvas.
- `tsc` sạch; `eslint` 6 cảnh báo cũ.
- Còn theo §54.2: E7, E8.

---

## §61 — Bước E: E7 (RowList + trang chi tiết dự án) — ĐÃ SỬA, đã đo (30/09/2026)

**Chưa commit** (chung commit Bước E). Server 3000/3001 vẫn chạy.

### 61.1. Thay đổi
- **D-1 lệch cột — sửa tận gốc bằng CSS subgrid** (thay vì đặt px cố định cho cột hành động): `RowList` nhận `cols` và là grid duy nhất (`md:grid md:gap-x-3 md:[&>*]:col-span-full ${cols}`); `RowHeader`/`RowItem` bỏ prop `cols`, dùng `md:grid-cols-subgrid md:gap-x-3` → cột `auto` được tính chung cho tiêu đề + mọi hàng. Đổi 15 chỗ `<RowList>` ở 8 file sang `<RowList cols={COLS}>`, bỏ `cols` ở mọi `RowHeader`/`RowItem`. Dưới `md` không đổi (danh sách xếp chồng).
  - Bẫy gặp khi đo: `RowItem` có `gap-2` (cho mobile) ghi đè khoảng cách cột kế thừa trong subgrid → trình duyệt chia đôi chênh lệch → lệch **2px** mọi cột. Sửa bằng `md:gap-x-3` tường minh ở cả tiêu đề và hàng.
  - **CLAUDE.md §4.7 đang mô tả API cũ** ("truyền `cols` cho `RowHeader`/`RowItem`") — cần người dùng cập nhật (file dùng chung với nhóm, Claude không tự sửa). Nội dung đề xuất: "`cols` đặt trên `RowList`; `RowHeader`/`RowItem` dùng subgrid, không nhận `cols`."
- **Cột thời gian 78px → 96px** ở 8 hằng `COLS` (chữ 12px của E6 làm "3 tuần trước" tràn khỏi cột 78px).
- **M3-3 (quyết định câu 7):** tên dự án ở "Dự án của tôi" → `/projects/:id` (trang chi tiết, có tab Commit/Nhánh/Cài đặt); nút "Mở Editor" riêng vẫn trỏ `/edit`; dự án đã lưu trữ không còn nút "Xem" vào editor (chỉ còn Khôi phục + Cài đặt).
- **D-2:** component mới `components/project/version-summary.tsx` — khối "Phiên bản" ở tab Tổng quan (chỉ chủ dự án): commit mới nhất trên nhánh mặc định (nội dung, tác giả, thời điểm), nút "N commit" / "N nhánh" chuyển sang tab tương ứng; chưa có commit → câu hướng dẫn commit lần đầu; lỗi → `role=alert`. Dùng API có sẵn (`listProjectBranches`, `getBranchHistory`). Khối gradient `ProjectThumb` và "Lượt nghe · Lượt fork" **giữ nguyên** (quyết định "để sau" ở §53.2).

### 61.2. Số đo (1440×900; nhánh giả + lịch sử giả qua route — test account không có commit/nhánh phụ)
| Danh sách | Lệch cột lớn nhất trước | Sau |
|---|---|---|
| Dự án của tôi | 233px (§52) / 241px (đo lại hôm nay) | **0px** |
| Tab Nhánh | 88px (§52) / 306px (với tên nhánh dài) | **0px** |
| Tab Commit (lịch sử giả) | chưa đo được | **0px** |
| Khám phá, Bảng xếp hạng | 0 | 0 |
- 390px: `/projects`, `/explore`, `/` không tràn ngang.
- Tên dự án ở danh sách → `href="/projects/55e4451d-…"`.
- Tổng quan: dữ liệu giả → "Phiên bản · 2 commit · 2 nhánh · [commit mới nhất] · Mới nhất trên main · Tester · 1 ngày trước"; dữ liệu thật (0 commit) → "0 commit · 1 nhánh · Chưa có phiên bản nào…"; bấm "nhánh" → `?tab=branches`.
- Ảnh: `pw/e7_projects.png`, `e7_branches.png`, `e7_overview.png`.

### 61.3. Ghi chú
- **Dev server bỏ sót file sửa bằng `sed -i`**: Tailwind không sinh lớp `…_96px_auto]` cho 2 file (ảnh chụp thấy danh sách vỡ thành 1 cột) cho tới khi ghi lại file bằng Python. Chỉ ảnh hưởng `next dev` đang chạy (build production quét lại toàn bộ). Nếu thấy lớp Tailwind mới "không có tác dụng" khi dev, lưu lại file để watcher bắt.
- Hộp admin/users cũng đổi sang subgrid nhưng chưa đo (không có tài khoản admin).
- `tsc` sạch; `eslint` 6 cảnh báo cũ.
- Còn theo §54.2: E8.

---

## §62 — CLAUDE.md cập nhật + Bước E: E8 (tương tác editor) — ĐÃ SỬA, đã đo (30/09/2026)

**Chưa commit** (chung commit Bước E). Server 3000/3001 vẫn chạy (bước "Cuối" — đo lại F/critique/audit — còn cần).

### 62.1. CLAUDE.md (file cá nhân, trong `.gitignore` — người dùng xác nhận 30/09)
Đã sửa trực tiếp: ghi chú đầu file là file cá nhân; §4.7 thêm token `*-foreground`, `Dialog`/`useDialog`, quy tắc lỗi (`apiErrorMessage`/`authErrorMessage`), cỡ chữ/ô nhập/`autoComplete`/không `minLength`/`…`/`APP_LOCALE`, focus `@layer base` + skip link, tiêu đề tab qua `layout.tsx`, `RowList cols` + subgrid (thay mô tả cũ), editor toàn màn hình + nhãn nút tiếng Anh + menu File, tên dự án → trang chi tiết; §9 thêm "không comment không cần thiết"; §10 thêm 2 bẫy (watcher `next dev` bỏ sót file sửa bằng `sed`; backreference `\1` trong heredoc → `\x01`, file scratchpad trùng tên module Python); §11 thêm trạng thái Bước E + cách đo bằng dữ liệu giả.

### 62.2. Thay đổi E8
- **M6-5 phím tắt** (`midi-editor.tsx`, bỏ qua khi đang gõ ô nhập hoặc có hộp thoại mở): **Space** phát/tạm dừng (không kích hoạt khi focus đang ở nút/`select` để tránh bấm 2 lần); **Delete/Backspace** xoá các nốt đang chọn (một bước hoàn tác); **Esc** bỏ chọn. Mảng phụ thuộc của effect thêm `handlePlay`, `handlePause`, `updateSnapshot`, `isPlaying`, `selectedNoteIds`.
- **M6-41:** vùng đổi độ dài = `min(6px, 40% bề rộng nốt)` (`resizeZonePx`); chỉ vẽ tay cầm khi nốt ≥ 12px.
- **M6-42:** bắt vạch phát ở vùng lưới chỉ khi công cụ **Select** và không trúng nốt; thước thời gian vẫn tua được với mọi công cụ; con trỏ `ew-resize` theo cùng quy tắc (và không hiện trên cột phím).
- **M6-43:** `DragState.group` lưu vị trí gốc của mọi nốt đang chọn → kéo di chuyển cả nhóm cùng độ lệch (kẹp để không nốt nào < tick 0 hay ra ngoài 0–127), kéo mép đổi độ dài cả nhóm cùng lượng (mỗi nốt ≥ 1 ô lưới); bấm vùng trống không kéo → bỏ chọn.
- **M6-50:** piano roll + dải velocity: bộ đệm canvas = kích thước CSS × `devicePixelRatio`, `ctx.setTransform(dpr…)`, vẽ theo đơn vị CSS; `style.width/height` đặt tường minh; kiểm tra trúng của dải velocity dùng `clientHeight` (4 chỗ). Chữ canvas piano roll 9/10px → 11px (thước + nhãn phím); nhãn dải velocity giữ 9px (cột nhãn 72px không đủ chỗ cho "VELOCITY" + "127" lớn hơn).

### 62.3. Số đo (Playwright, bản nháp giả 2 nốt 1/16 — mọi lệnh ghi giả, đọc payload autosave)
| Kiểm tra | Trước (§51) | Sau |
|---|---|---|
| M6-5: chọn tất cả → Delete | số nốt không đổi | 2 → **0** (payload autosave `notes: []`) |
| M6-5: Space | không phát | phát sau 51ms; Space lần 2 → tạm dừng (hiện nút "Phát tiếp") — **chỉ kiểm trạng thái, không nghe được âm thanh** (CLAUDE.md §10) |
| M6-42: Draw, bấm cách vạch phát 2px (x=74) | 0 nốt | nốt mới ở tick 0 |
| M6-41: kéo nốt 1/16 từ 1.5px trong thân | đổi độ dài | **di chuyển** (start 480 → 1440, dài giữ 120) |
| M6-41: kéo mép phải nốt 1/16 | — | đổi độ dài (120 → 600), start giữ 480 |
| M6-43: chọn cả 2 nốt, kéo 1 nốt | chỉ 1/2 nốt di chuyển | **cả 2** dịch +480 tick, +1 cao độ |
| M6-43: bấm vùng trống | không bỏ chọn | bỏ chọn (nút Copy vô hiệu) |
| M6-50: `deviceScaleFactor = 2` | `canvas.width == clientWidth` | 1564×944 bộ đệm / 782×472 CSS; dải velocity 1564×206 / 782×103; ảnh `pw/e8_hidpi.png` nét |
| Hồi quy E1/E2/E5/E6 (m61, m62, m640, m619, commitDlg, sketch, exportDlg, bpm, File menu, thanh công cụ 1 hàng ở 1280/1366) | — | vẫn đạt |

### 62.4. Ghi chú
- `eslint` 9 cảnh báo (0 lỗi): 8 `exhaustive-deps` kiểu "hàm tạo lại mỗi lần render làm đổi phụ thuộc" (trước E8 là 5 cùng loại — tăng vì thêm `handlePlay/handlePause/updateSnapshot` vào mảng phụ thuộc cho đúng) + 1 `no-img-element` cũ. `tsc` sạch.
- Chưa thử tay: âm thanh khi Space, cảm ứng, màn hình Retina thật.

### 62.5. Tình trạng Bước E sau E8
- Xong E1–E8 theo §54.2 (kết quả §55–§62). **Còn:** bước "Cuối" — đo lại toàn bộ Bước F, chạy lại `impeccable critique` (so 22/40) và `audit` (so 11/20); E9 (hướng dẫn người mới, M6-51 hiệu năng, P3 còn lại); các câu hỏi còn treo §53.3 số 2, 3, 5, 6, 8; vùng bấm ≥ 44px (§60.3); thu hồi phiên đăng nhập test (1 phiên từ `pw/state.json`) khi kết thúc đo.

---

## §63 — Bước "Cuối": đo lại + chấm điểm lại bằng skill + đánh giá hiệu quả (30/09/2026)

**Không sửa code trong bước này.** Server 3000/3001 vẫn chạy (người dùng cho phép giữ trong phiên này); phiên test (`pw/state.json`) chưa thu hồi.

### 63.1. Phương pháp (khác §52 — ghi rõ để không so sánh sai)
- **Critique chạy đúng chuẩn skill (dual-agent):** Assessment A (đánh giá thiết kế) và B (detector + overlay trình duyệt) là **2 sub-agent tách biệt, song song**; A không đọc PROJECT_STATE, không thấy điểm cũ, không chạy detector. §52 là **degraded single-context** do chính Claude chấm sau khi đã viết 170+ phát hiện → điểm 22/40 cũ có thể bị neo. Chênh lệch điểm critique vì vậy chỉ là **xấp xỉ**.
- **Audit (5 chiều)** do Claude chấm, dựa trên số đo thật (dưới) + detector của B.
- **Không lưu snapshot `.impeccable/critique/`** (người dùng không muốn tạo file trong repo); B chạy live-server từ scratchpad nên thư mục trạng thái nằm ngoài repo, đã tắt (cổng 8400 sạch).
- Phạm vi giống §52: vỏ app, Home, Dự án của tôi, Tổng quan dự án, Đăng nhập, Editor + hộp Commit; 1440/1366/390px; 3 theme. Ảnh của A ở `scratchpad/pw/critiqueA/`, JSON detector của B ở `scratchpad/pw/critiqueB/`.

### 63.2. Bước A (web-design-guidelines) — quét lại cơ học
| Chỉ số | §41.3 (29/09) | 30/09 |
|---|---|---|
| Ô nhập có `autoComplete` | 0/40 | 27/35 (8 còn lại là textarea hoặc ô xác nhận) |
| Quy tắc `:focus-visible` | 0 | 1 quy tắc toàn cục (`@layer base`) |
| Chuỗi `...` hiển thị | 14 | 0 |
| `outline: "none"` inline | 4 | 3 (2 khung hộp thoại nhận focus lập trình + ô đổi tên track có viền accent) |
| `"vi-VN"` ghi cứng | 18 | 0 (`APP_LOCALE`) |
| Ô tìm kiếm `type="text"` | 2 | 0 |
| `lang` | en | vi |
| `text-[9/10/11px]` | 80 | 0 |
| `set…Error(err.message)` trần | ≥ 14 | 0 |
| Nút editor có `aria-label` | 0/24 | 11/29 (phần còn lại có chữ) |
| Emoji thay icon | có | 9 chỗ (câu hỏi §53.3-3 chưa trả lời) |

### 63.3. Bước F — tổng hợp số đo trước/sau (chi tiết §55–§62)
| Hạng mục | Trước | Sau |
|---|---|---|
| Piano roll ở 1366×768 | 259px cao | 472px |
| Nút tệp nhìn thấy ở 1920px | 2/4 | 4/4 (menu File) |
| Lệch cột danh sách | 233px | 0px |
| Cặp token tương phản < 4.5:1 (14 cặp × 3 theme) | 8 cặp trượt | 0 — overlay tìm thêm chữ trong avatar header 4.09:1 (màu hash `lib/avatar-color.ts`, **mới, chưa sửa**) |
| Chữ < 12px ở /explore | 70% | 0% |
| Tiêu đề tab | đều "STAVE" | 12/12 route khác nhau |
| Phím tới ô email /login | 7 Tab | skip link + 2 Tab |
| Lỗi mất dữ liệu (M6-1/2/19/20/26/40) | 6/6 tái tạo được | 0/6 |
| Lỗi thao tác bị che/nuốt (M5-1, M3-1, M3-2, M2-2) | im lặng | có thông báo tiếng Việt |
| Vùng bấm < 44px | 54/54 (/explore) | 55/55 — **không đổi** (chờ người dùng quyết, §60.3) |
| Hiệu năng editor (headless, tương đối) | §51: 16 track·6000 nốt phát 53 fps, cuộn 33.5 fps | phát 28 fps, cuộn 32 fps; bản nhỏ 54/42 fps — **không so được** (script §51 đã mất, cách đo khác, vùng vẽ ở 1920×1080 cao hơn 37%); M6-51 chưa làm, coi đây là mốc mới (`scratchpad/pw/perf.js`) |

### 63.4. Critique (Assessment A, dual-agent) — **23/40** (§52: 22/40, degraded)
| # | Heuristic | §52 | Nay | Ghi chú |
|---|---|---|---|---|
| 1 | Trạng thái hệ thống | 2 | 3 | lưu nháp/lỗi lưu rõ; còn: lỗi tải trang edit không có nút thử lại |
| 2 | Khớp thế giới thực | 2 | 2 | thuật ngữ Git thô; **mã UC-xx/BR-xx lộ trong tooltip và tên trợ năng** (12 file) |
| 3 | Kiểm soát & tự do | 2 | 3 | Esc/trap/giữ nội dung; còn: màn lỗi editor là ngõ cụt |
| 4 | Nhất quán | 3 | 2 | 3 nhãn khác nhau cho "mở editor", "Dự án mới"/"Tạo dự án mới", editor dùng hệ style inline riêng |
| 5 | Ngăn lỗi | 2 | 3 | cảnh báo khôi phục, xác nhận hợp nhất, preview xoá nhánh; còn: nút "Tạo commit" mờ không nói lý do |
| 6 | Nhận diện | 3 | 2 | **cụm 5 nút biểu tượng không nhãn (hệ quả của E5)**, phím tắt không liệt kê ở đâu |
| 7 | Linh hoạt | 2 | 2 | có Space/Delete/Esc nhưng không phát hiện được; canvas không dùng bàn phím |
| 8 | Tối giản | 3 | 3 | footer tín dụng chiếm 16% màn điện thoại; thumbnail rỗng 240px |
| 9 | Khôi phục lỗi | 2 | 2 | câu lỗi tiếng Việt tốt nhưng thiếu hành động khôi phục ở vài màn |
| 10 | Trợ giúp | 1 | 1 | chưa có hướng dẫn commit/nhánh/merge (E9 chưa làm) |

- **Đặc thù thiết kế:** editor, hộp Commit, trang đăng nhập mang bản sắc riêng; vỏ app/Home/danh sách vẫn "SaaS chung"; preset moss khó nhận ra.
- **Ưu tiên mới:** [P1] mã UC/BR lộ ra UI & trợ năng · [P1] editor trên điện thoại sau "Vẫn tiếp tục" vỡ (Commit ngoài màn hình) · [P1] piano roll không dùng bàn phím + phím tắt ẩn · [P2] không có trợ giúp khái niệm version control · [P2] màn lỗi thiếu hành động khôi phục, nút vô hiệu không nói lý do.
- **Detector (B):** CLI 1 phát hiện (`export-dialog.tsx:432` animate `width`, thật, tác động thấp — giống §52). Overlay 5 trang: avatar 4.1:1 (thật), độ dài dòng (hero, footer, empty-state phiên bản), `kicker-above-heading` + font Inter (quyết định bản sắc), `nested-cards` ở hàng tiêu đề RowList (dương tính giả), `cramped-padding` nút `h-8` (dương tính giả — căn giữa bằng flex).
- **Cần kiểm lại:** A gặp 1 lần trang edit báo "Không tải được thông tin dự án" ở 1440px (tải lại thì bình thường) — cùng kiểu chập chờn đã gặp ở §61 khi đo trang dự án; nguyên nhân chưa rõ (backend dev/nhiều request song song?).

### 63.5. Audit (5 chiều) — **13/20** (§52: 11/20)
| # | Chiều | §52 | Nay | Bằng chứng |
|---|---|---|---|---|
| 1 | Khả năng truy cập | 2 | **3** | 0 cặp token trượt trên 3 theme; focus toàn cục + skip link; `lang="vi"`; autocomplete; hộp thoại trap/Esc/`aria-labelledby`; lỗi `role=alert`. Còn: canvas chỉ chuột (M6-39), mã UC/BR trong tên trợ năng, avatar 4.09:1, vùng bấm < 44px |
| 2 | Hiệu năng | 2 | 2 | không đổi (M6-51 chưa làm); canvas nay vẽ ×dpr (nét hơn, tốn hơn trên HiDPI); 1 animate `width` |
| 3 | Responsive | 2 | 2 | trang thường không tràn ở 390px, ô nhập 16px, thanh công cụ xuống hàng, panel ẩn/hiện; còn: 100% phần tử bấm < 44px, editor điện thoại vỡ sau "Vẫn tiếp tục" |
| 4 | Theming | 3 | 3 | token `-foreground` mới, BR-90 giữ; còn: cặp màu avatar hash chưa kiểm tương phản, hệ `DC` inline của editor song song với Tailwind |
| 5 | Toàn vẹn triển khai | 2 | **3** | 7 kiểu hộp thoại → 1 hook dùng chung; `RowList` subgrid giữ đúng hợp đồng cột; 1 hàm lỗi; còn: mã UC/BR, 9 emoji glyph, nhãn CTA không thống nhất |

Băng điểm: 10–13 "Acceptable" → vẫn trong băng, ở mép trên.

### 63.6. Đánh giá hiệu quả việc bổ sung skill
- **Trước đây (trước 29/09):** giao diện làm theo mockup + CLAUDE.md, không có quy trình rà soát; lỗi chỉ lộ khi người dùng tự gặp.
- **29/09 (chỉ skill, chưa sửa):** 174 phát hiện, 10 cụm gốc, điểm cơ sở 22/40 và 11/20 — 0 cải thiện trong sản phẩm.
- **30/09 (skill → kế hoạch → sửa → đo):** xử lý ~50/174 phát hiện (~29%) nhưng **21/30 P1 (70%)**: 20 xong hẳn + B4, M6-21 một phần; M1-2 bỏ qua theo quyết định. P1 còn mở: M5-6, M3-4, M4-1, M4-2, M2-1, M2-3, M6-39. 6/6 lỗi mất dữ liệu đã tái tạo được → 0.
- **Điểm tăng ít (critique +1, audit +2) dù số đo cải thiện lớn:** (1) thang 0–4 thô — một heuristic chỉ lên 1 điểm khi hết cả nhóm lỗi; (2) các heuristic yếu nhất (trợ giúp, thuật ngữ, linh hoạt) thuộc E9/câu hỏi treo, chưa làm; (3) người chấm A độc lập & nghiêm hơn, và chấm cả hệ quả của chính đợt sửa (nút biểu tượng không nhãn → H6 giảm).
- **Skill đóng góp:** `web-design-guidelines` + `frontend-design-audit` tìm & xếp hạng (định hướng đúng: 70% P1 đã xử lý); `impeccable critique` dual-agent **tìm thêm 6 vấn đề mới** mà lần single-context bỏ sót (mã UC/BR trong tên trợ năng, editor mobile không tới được Commit, cụm nút không nhãn, màn lỗi ngõ cụt, avatar 4.09:1, footer 16% màn điện thoại) — tách người chấm có giá trị thật; detector ổn định nhưng phạm vi hẹp (1 phát hiện CLI cả 2 lần).
- **Đo thật (Playwright) là phần quyết định:** đặt tiêu chí nghiệm thu bằng số và **bắt 7 lỗi do chính Claude gây ra** trước khi tới tay người dùng (selector sai, 6 ô thiếu `name`, `\x01` làm mất chữ đậm, `locale.py` che module, watcher bỏ sót file, lệch 2px subgrid, cột thời gian tràn sau khi tăng cỡ chữ).
- **Chi phí:** 1 phiên rà soát + 1 phiên sửa; critique dual-agent ~195k token sub-agent (A ~115k, B ~80k); nhiều mục chỉ đo được bằng dữ liệu giả (test account không có commit/nhánh/admin).
- **Kết luận:** skill hiệu quả nhất ở khâu *tìm và ưu tiên*; điểm số skill không phải KPI tốt cho từng đợt sửa — theo dõi bằng số đo cụ thể + số P1 còn mở. Giữ quy trình 3 lớp (§53.6), bổ sung: critique luôn dual-agent; mỗi nhóm sửa có số đo "trước/sau" + chạy lại bài đo cũ.
- **Điểm cơ sở mới cho lần sau:** Nielsen **23/40** (dual-agent), audit **13/20**.

### 63.7. Việc còn lại (gợi ý thứ tự)
1. Gỡ mã UC/BR khỏi tooltip/aria-label/nội dung (cần trả lời §53.3-3) — `/impeccable clarify`.
2. Màn lỗi tải trang edit: "Thử lại" + "Về trang dự án"; nút "Tạo commit" vô hiệu nói lý do — `/impeccable harden`.
3. Trợ giúp khái niệm commit/nhánh/merge + bảng phím tắt ("?") — `/impeccable onboard` (E9).
4. Editor trên điện thoại: chỉ xem hoặc bố cục gọn — `/impeccable adapt`; quyết định vùng bấm 44px.
5. Piano roll bàn phím (M6-39, câu hỏi §53.3-5), hiệu năng M6-51 — `/impeccable optimize`.
6. P1 nghiệp vụ còn mở: M5-6 (tải lại trang khi đổi tab), M3-4 (công khai không xác nhận), M4-1/M4-2 ("Lượt nghe"/"Xu hướng"), M2-1 (tài khoản Google), M2-3 (phân trang admin).
7. Cuối cùng: `/impeccable polish` rồi critique/audit lại (so 23/40, 13/20).

---

## §64 — Sau bước "Cuối": gỡ mã UC/BR khỏi giao diện + màn lỗi có lối khôi phục (30/09/2026)

**Chưa commit** (gộp vào commit Bước E). Server 3000/3001 vẫn chạy.

### 64.1. Quyết định của người dùng (trả lời câu hỏi cuối §63)
- Thứ tự: (1) mã UC/BR + màn lỗi, (2) trợ giúp + phím tắt (E9); **editor trên điện thoại tạm bỏ qua**.
- Mã UC/BR (câu §53.3-3): phạm vi **frontend + chuỗi backend hiển thị**; **giữ** các tham chiếu UC/BR trong comment vì dùng để truy ngược về tài liệu (SRS); dọn comment không cần thiết; **người dùng không được thấy mã ở bất kỳ đâu**.
- Vùng bấm ≥ 44px (§60.3): **giữ nguyên** 32px.

### 64.2. Thay đổi
- Quét bằng TypeScript scanner (`scratchpad/scan_codes.js`: chỉ duyệt string literal, template, JSX text — bỏ qua comment) trên `frontend/{app,components,lib,context}`, `backend/src`, `shared-types/src`: **28 chỗ hiển thị** trong 10 file (25 frontend: tooltip `title`, nhãn, câu chữ; 3 backend: thông điệp lỗi Audio sketch "(BR-56)" ở `audio-sketches.service.ts:133`, `create-upload-url.dto.ts:15,21`). Đã gỡ phần `(UC-xx)`/`(BR-xx)`; viết lại 2 câu: phụ đề hộp Xuất âm thanh "UC-38 · Export Audio (WAV)" → "Định dạng WAV, không nén"; cảnh báo commit trùng "…server sẽ từ chối commit trùng (BR-40)" → "Bản nháp chưa có thay đổi nào so với commit gần nhất — hãy sửa bản nhạc trước khi commit." Comment chứa mã UC/BR giữ nguyên (khoảng 260 chỗ frontend, 185 backend).
- **Màn lỗi có lối khôi phục:** trang edit (lỗi tải dự án) → "Thử lại" + "Về trang dự án"; Cài đặt dự án (tải lỗi) → "Thử lại"; trang dự án → tiêu đề "Không mở được dự án" + "Thử lại" + "Về Dự án của tôi"/"Quay lại Khám phá", và chỉ nói "không tìm thấy" khi 404/403 (lỗi mạng dùng `apiErrorMessage`).
- **Hộp Commit:** dòng gợi ý `#commit-message-hint` (`aria-describedby`) — ô trống: "Nhập nội dung để bật nút Tạo commit."; đã có nội dung: "Ctrl+Enter để tạo commit nhanh."; chỉ khoảng trắng: câu lỗi đỏ như cũ.
- "Dọn comment không cần thiết": không phát sinh comment thừa từ các sửa đổi này; comment truy vết giữ theo yêu cầu. (Chưa làm đợt dọn comment toàn frontend — nếu người dùng muốn sẽ làm riêng.)

### 64.3. Số đo
- Mã nguồn: 28 → **0** chỗ hiển thị (scanner).
- DOM thật (text + `title` + `aria-label` + `placeholder` + `alt`) trên 13 trang + editor + hộp Commit, Khôi phục (lịch sử giả), menu File, Xuất âm thanh, Audio sketch, login/register/forgot: **0** mã.
- Màn lỗi (giả lỗi mạng cho `GET /projects/:id`): edit → alert + "Thử lại" (bấm lại khi mạng ổn → editor mở, có canvas) + liên kết `/projects/:id`; Cài đặt → "Thử lại" → form nạp đúng tên; trang dự án → "Không mở được dự án · Không tải được dự án. Không kết nối được máy chủ — kiểm tra mạng rồi thử lại · Thử lại · Về Dự án của tôi".
- `tsc` sạch; `eslint` 9 cảnh báo cũ.

---

## §65 — Bước E9 (một phần): trợ giúp khái niệm + phím tắt (30/09/2026)

**Chưa commit** (gộp vào commit Bước E). Server 3000/3001 vẫn chạy. Theo skill `impeccable onboard` (ngữ cảnh hơn nghi thức: dạy tại chỗ cần dùng, có thể bỏ qua, ngắn gọn) + `craft-floor` (icon từ lucide, không emoji; hộp thoại chỉ mở khi người dùng yêu cầu).

### 65.1. Thay đổi
- **`components/midi-editor/redesign/help-dialog.tsx` (mới)** — hộp "Trợ giúp" (dùng `Modal`/`useDialog`): phần **Khái niệm** (Bản nháp, Commit, Nhánh, Hợp nhất, Khôi phục — lời giải thích ngắn, ví dụ âm nhạc, so sánh "đặt tên phiên bản" của Google Docs) và bảng **Phím tắt** với `<kbd>` (Space, Delete/Backspace, Esc, Ctrl/⌘+Z, Ctrl/⌘+Shift+Z / Ctrl/⌘+Y, Ctrl/⌘+A/C/V, Shift+bấm, chuột phải, ↑/↓ ở ô BPM, Ctrl/⌘+Enter trong hộp Commit, ?). Phím bổ trợ tự đổi ⌘ trên Mac.
- **Editor:** nút "?" ở header (`aria-label="Help"`, title "Trợ giúp: khái niệm và phím tắt (?)"); phím **?** mở trợ giúp (bỏ qua khi đang gõ hoặc có hộp thoại mở); **dải gợi ý lần đầu** (`role="note"`) dưới header: "Mới dùng STAVE? Bản nháp tự lưu; bấm Commit Changes để lưu thành một phiên bản có thể quay lại. Nhấn ? …" + "Xem trợ giúp" + nút ẩn — ghi nhớ đã ẩn trong `localStorage` (`stave-editor-help-tip-dismissed`, bọc try/catch; chỉ là tiện ích theo trình duyệt). Tooltip Phát/Tạm dừng ghi "(Space)".
- **Giải thích tại chỗ:** panel lịch sử trống thêm "Mỗi commit là một mốc bạn có thể quay lại bất cứ lúc nào."; tab Nhánh thêm dòng "Nhánh là bản làm thử song song…"; tab Commit trống giải thích commit là gì.

### 65.2. Số đo
| Kiểm tra | Kết quả |
|---|---|
| Dải gợi ý lần đầu | hiện; "Xem trợ giúp" mở hộp; ẩn rồi tải lại → không hiện nữa |
| Hộp trợ giúp | tiêu đề "Trợ giúp", 5 khái niệm, 25 `<kbd>`; mở bằng nút header, phím ?, nút trong dải gợi ý; Esc đóng (ảnh `pw/e9_help.png`) |
| Piano roll 1366×768 | 428px khi có dải gợi ý (lần đầu), 472px sau khi ẩn — vẫn ≥ 400; thanh công cụ 1 hàng. 1280×720 lần đầu: 380px |
| Tab Nhánh / Commit | có câu giải thích |
| Hồi quy E1/E2/E8 + thanh công cụ + 0 mã UC/BR trong DOM | vẫn đạt (script test đổi selector sang `title^=` vì tooltip thêm "(Space)") |

### 65.3. Chưa làm trong E9
- Nhãn chữ cho cụm 5 nút biểu tượng (Select all/Copy/Paste/Undo/Redo) — thanh công cụ ở 1280px chỉ còn dư vài px; phím tắt nay đã được liệt kê trong trợ giúp và tooltip. Hiệu năng M6-51, các P3 còn lại, editor điện thoại (người dùng tạm bỏ qua).
- Nên chạy lại critique dual-agent để đo tác động lên H6/H10 (hiện 2 và 1).

### 65.4. Kết thúc phiên 30/09/2026 (người dùng dừng tại đây)
- **Trạng thái repo:** toàn bộ thay đổi Bước E (§55–§65) **chưa commit**, nằm trên working tree của nhánh `bugfix/midi-track-name-nul-byte-crash` (đã merge vào `main` qua PR #35, nội dung trùng `main`). 21 file mới chưa được git theo dõi (16 `layout.tsx`, `help-dialog.tsx`, `version-summary.tsx`, `ui/dialog.tsx`, `lib/error-message.ts`, `lib/use-dialog.ts`) — cần `git add`. Backend có 2 file đổi chuỗi thông báo (`audio-sketches.service.ts`, `create-upload-url.dto.ts`). Người dùng tự tạo nhánh + commit một lần.
- **Dọn dẹp:** phiên đăng nhập test đã đăng xuất qua giao diện, `pw/state.json` đã xoá; tra DB (chỉ đọc): tài khoản test còn **0 phiên hoạt động**. Server 3000/3001 đã tắt, live-server detector (8400) đã tắt — cả 3 cổng sạch. Không còn tiến trình nền.
- **Quan sát cần xem sau:** bảng `sessions` ghi **23 dòng** cho tài khoản test trong ngày 30/09, trong khi bộ đo chỉ đăng nhập 1 lần rồi dùng lại `state.json` — có thể app đăng ký phiên mới ở mỗi lần tải lại / đổi tab (liên quan M5-6, `onAuthStateChange` phát `SIGNED_IN`). Chưa điều tra.
- **Tiếp tục ở phiên sau:** đọc §63 (điểm cơ sở 23/40 · 13/20, danh sách việc §63.7), §64, §65. Việc gợi ý tiếp: chạy lại critique dual-agent để đo H6/H10 sau E9; sau đó các P1 nghiệp vụ còn mở (M5-6, M3-4, M4-1/M4-2, M2-1, M2-3), piano roll bàn phím (M6-39), hiệu năng (M6-51). Bộ script đo nằm ở scratchpad `pw/` (mất khi xoá scratchpad) — dựng lại theo §53.4 + §55.1.

---

## §66 — Rà soát các nhánh có commit "ahead", sửa 3 nhánh Custom Sound theo 4.8 (04/10/2026)

**Yêu cầu người dùng:** cập nhật `main`, kiểm tra từng nhánh có commit ahead (bug, code smell, lỗi thiết kế — không mặc định người dùng/đồng đội luôn đúng), mỗi nhánh có lỗi thì tạo 1 nhánh `bugfix/` để sửa, xong thì commit/push/merge (phiên này cho phép Claude tự làm git, PR không cần review chéo). Trong phiên, người dùng quyết thêm: hạn mức Custom Sound 50MB/người (admin chỉnh sau); **không bao giờ xoá nhánh** (đã ghi CLAUDE.md §8.7); Claude được tự sửa DB khi cần; đi theo hướng sửa 2 nhánh `bugfix/custom-sound-*`.

### 66.1. Kết quả rà soát (main = `7c4efd0`, PR #39 Bước E đã merge)
| Nhánh | Ahead | Kết luận |
|---|---|---|
| `feature/UC36-metronome-loop-playback`, `feature/UC38-Export-project-audio`, `feature/UC40-adjust-track-volume`, `feature/copy-pattern-uc32`, `vantri` | 1–2 | **Đã thay thế** — tính năng đã có trên `main` qua các nhánh `bugfix/` trước đó (§19 cho UC-36/38/40, §13 cho `vantri`). Không merge, không xoá (quy tắc mới). |
| `feature/upload-custom-sound-uc56`, `feature/record-custom-sound-uc118`, `feature/map-custom-sound-uc57` (hoangvu6104, 28–29/09) | 1–2 | **Không an toàn merge** — 8 điểm ở 66.2. Đã sửa ở 2 nhánh mới. |

### 66.2. 8 vấn đề của 3 nhánh Custom Sound (đã tra DB thật, không chỉ đọc code)
1. **Bug chặn:** ghi cột không tồn tại `storage_path`/`original_filename`/`mime_type` (thật: `file_url`, `source`) → upload luôn 500. Đúng gotcha CLAUDE.md §10 "type tự khai không khớp schema".
2. **Bug chặn:** bucket `custom-sounds` không tồn tại.
3. **Bug chặn (UC-57):** ghi `sound_mappings.owner_id`/`sound_id` (không tồn tại, thật là `custom_sound_id`), `onConflict` không khớp unique thật, route xoá ở frontend không khớp controller. Commit message tự ghi "bảng + RLS cần được tạo" — đồng đội có quyền dev Supabase nhưng **chưa áp gì** (migration mới nhất trên DB là 16/09).
4. **Lùi tính năng:** chuột phải trên nốt đổi từ "xoá nốt" sang "gán sound".
5. **Lỗi thiết kế:** mapping ở bảng riêng theo project — trái 4.8/J1; và **mapping không được dùng khi phát nhạc** (gán xong không nghe thấy gì).
6. **Lỗi thiết kế:** chỉ xoá cứng, xoá file trước dòng DB, không `deleted_at`, không kiểm tham chiếu — trái J3.
7. **Bug:** server tin thời lượng/dung lượng do client khai (trái J5); ghi âm UC-118 chạy tới 3 phút (hook dùng chung với Audio Sketch) rồi mới bị từ chối lúc lưu.
8. **Code smell:** class Tailwind không có trong hệ token (`bg-destructive`, `text-muted-foreground`), `alert()`, hiện "BR-60" cho người dùng, ghi cứng `"vi-VN"`, nút chỉ có icon thiếu `aria-label`.

### 66.3. Đã sửa
**PR #40 — `bugfix/custom-sound-library-fixes`** (merge `feature/record-custom-sound-uc118` — chứa luôn uc56 — rồi sửa; 1 xung đột ở `editor-redesign.tsx`: nút "Custom sounds" đưa vào menu File để thanh công cụ vẫn 1 hàng):
- Backend `custom-sounds`: đúng cột thật; upload bằng signed URL token (`uploadToSignedUrl`); khi xác nhận, server **tải file về đọc header WAV** (`wav-info.ts` + `wav-info.spec.ts`) để kiểm ≤10MB, ≤30 giây, hạn mức 50MB; file sai bị xoá ngay. Trình duyệt luôn chuyển file upload (WAV/MP3) và bản ghi về WAV mono 44.1 kHz (`normalizeForStorage`) → bucket chỉ nhận WAV.
- Xoá 2 kiểu qua RPC `delete_custom_sound` (khoá dòng, xoá dòng trước, trả path để xoá file sau); `GET :id/usage` đếm project của người khác để cảnh báo; `collect_custom_sound_garbage()` dọn sound xoá mềm hết tham chiếu + file mồ côi > 1 giờ — gọi sau khi xoá sound, xoá project (`ProjectsService.deleteOwned`), admin xoá user (`AdminService.removeUser`, kèm xoá cả thư mục file của user).
- Frontend: `sound-library-panel.tsx` viết lại theo design system (Dialog 2 kiểu xoá, token, `apiErrorMessage`, `aria-label`, thanh dung lượng); `useAudioRecorder(maxSec)` nhận giới hạn — Custom Sound dừng ở 30 giây.

**PR #41 — `bugfix/custom-sound-mapping-snapshot`** (base #40; merge `feature/map-custom-sound-uc57` rồi thay):
- `DraftTrack.soundMap` + `DRAFT_SCHEMA_VERSION = 3` (`shared-types`, kèm `sanitizeSoundMap`/`isValidSoundMap`); khai ở **cả 3 DTO** (`@IsSoundMap`) + 2 hàm chép tay (`branches.service`, `commits.service`); bỏ `schemaVersion: 1` ghi cứng ở 3 chỗ; merge ghi `DRAFT_SCHEMA_VERSION`.
- Bỏ module `sound-mappings` của nhánh gốc. Bảng `sound_mappings` thành **chỉ mục do trigger duy trì** trên `drafts` (insert/update snapshot) và `commits` (insert) — 1 chỗ phủ mọi đường ghi (autosave, commit, restore, merge, switch, tạo nhánh, RPC). Bỏ FK tới `custom_sounds` (để autosave không bao giờ hỏng vì đang xoá sound cùng lúc), thêm `branch_id`/`commit_id`, bỏ policy ghi của client.
- `GET /projects/:id/custom-sounds?ids=` phân giải theo quy tắc phát 4.8; editor nạp buffer trước khi phát (`lib/custom-sound-buffers.ts`), engine phát nguyên mẫu qua `Tone.ToneBufferSource` vào panner của track; export WAV cũng có. Sound không phát được → nhạc cụ của track + cảnh báo trong hộp "Custom sounds".
- Diff backend coi đổi `soundMap` là thay đổi (không bị từ chối "giống hệt commit trước"); màn so sánh hiện dòng "Âm thanh riêng".
- Trả lại chuột phải = xoá nốt. Gán sound: hộp File → Custom sounds, chọn track + nốt, bấm "Gán vào …".
- Sửa kèm: commit gửi kèm snapshot đầy đủ từng làm mất `muted`/`solo` (DTO không khai `muted`/`solo`, hàm chép đọc `isMuted`).

### 66.4. Mức đã verify — trung thực
- ✅ `tsc` backend + frontend, eslint (0 lỗi mới; 8 cảnh báo `exhaustive-deps` ở `midi-editor.tsx` có từ trước), `nest build`, jest 4/4, `next build`.
- ❌ **Chưa chạy thật với DB** — `apply_migration` qua MCP trả `declined` 2 lần (auto mode chặn lần đầu, sau đó hộp xác nhận không được duyệt). Không thử vòng qua. Vì vậy **chưa merge** PR #40/#41: merge khi DB chưa có `deleted_at`/RPC thì mọi API Custom Sound trên `main` trả 500.
- ❌ Chưa nghe thử (âm thanh phải người dùng tự nghe — gotcha §10). Người dùng yêu cầu không test thêm trong phiên này; đã tắt 2 tiến trình cũ ở cổng 3000/3001.

### 66.5. Để merge (người dùng hoặc phiên sau)
1. Áp `backend/supabase/migrations/20261004000001_custom_sounds_soft_delete_bucket_and_cleanup.sql` rồi `…20261004000002_sound_mappings_index_from_snapshot.sql` (SQL Editor, hoặc duyệt `apply_migration`). Cả 2 bảng đang 0 dòng; chỉ thêm, không xoá dữ liệu.
2. Kiểm nhanh theo mục "How to verify" trong mô tả PR #40, #41.
3. Merge #40 → `gh pr edit 41 --base main` → merge #41. Không xoá nhánh.
4. Báo đồng đội (hoangvu6104) 8 điểm ở 66.2 — 3 nhánh gốc giữ nguyên, không xoá.

### 66.6. Việc treo mới
- **Màn admin chỉnh `platform_settings`** (gồm hạn mức Custom Sound 50MB): chưa có giao diện admin nào cho bảng này — làm khi xây phần Admin. Backend đã đọc giá trị từ bảng, không cần sửa code khi admin đổi số.
- Dọn sound xoá mềm/file mồ côi chỉ chạy khi có thao tác xoá (không có pg_cron) — chấp nhận ở quy mô capstone.
- Commit cũ của người khác giữ file sống mãi khi chủ chỉ "xoá cho bản thân" (đúng J3, hệ quả: dung lượng chỉ tăng).
- Fork chưa có — khi làm UC-69 kiểm lại đếm tham chiếu "của người khác".
- Hộp "Custom sounds" đóng giữa lúc đang ghi âm thì mất bản ghi không hỏi lại (Audio Sketch có hỏi) — nhỏ, chưa sửa.
- Bug cũ vẫn còn: file audio sketch mồ côi khi xoá project/tài khoản (§38) — không đụng trong phiên này.

### 66.7. Cập nhật cuối phiên 04/10/2026 — vì sao chưa áp được migration
- `apply_migration` (connector Supabase của claude.ai) trả `{"status":"declined"}` **5 lần**, kể cả sau 3 bước người dùng đã làm: (1) thêm `mcp__claude_ai_Supabase__apply_migration` vào `.claude/settings.local.json` (allow, file gitignored); (2) đổi trên claude.ai → Connectors → Supabase → **Write/delete tools = Always allow**, riêng dòng "Apply migration" cũng Always allow (người dùng chụp màn hình xác nhận); (3) tắt/mở lại VS Code (extension có thể đã tự cập nhật giữa phiên). `execute_sql` (đọc) vẫn chạy bình thường suốt phiên.
- Nguyên nhân: lúc đầu là "Needs approval" ở nhóm Write/delete — yêu cầu duyệt đó **không hiện được trong VS Code** nên tự thành `declined`. Sau khi đổi Always allow, phiên đang chạy có thể vẫn giữ quyền cũ → **thử ở phiên Claude Code mới hoàn toàn**. Nếu vẫn `declined` thì dán tay 2 file SQL vào Supabase SQL Editor.
- DB thật lúc kết thúc: `custom_sounds.deleted_at` **chưa có**, bucket `custom-sounds` **chưa có** (đã tra bằng `execute_sql`). Không có gì bị áp dở.
- Trạng thái git: đang ở `main` (= `7c4efd0`, sạch). PR #40 (`bugfix/custom-sound-library-fixes`, base `main`) và PR #41 (`bugfix/custom-sound-mapping-snapshot`, base #40) đã push, **chưa merge**. File migration 1 nằm ở cả 2 nhánh, migration 2 chỉ ở nhánh #41.
- Việc của phiên sau (theo thứ tự): áp migration 1 → tra lại (`deleted_at`, bucket, 4 hàm, dòng `platform_settings.custom_sound_quota_bytes`) → áp migration 2 → tra lại (cột `branch_id`/`commit_id`, 2 trigger, không còn unique/FK cũ) → merge #40 → `gh pr edit 41 --base main` → merge #41 → `git checkout main && git pull` → ghi kết quả vào §36-J + mục §67. Không xoá nhánh nào (CLAUDE.md §8.7). Phiên này người dùng cho phép Claude tự làm git (commit/push/merge, PR không cần review chéo) — **phải hỏi lại xác nhận ở phiên mới**, quyền đó chỉ áp cho phiên 04/10.

## §67 — Áp 2 migration Custom Sound, merge PR #40/#41 (04/10/2026)

**Yêu cầu người dùng:** làm tiếp §66.5/§66.7 ở phiên mới: kiểm tool `mcp__supabase__*` → áp migration 1, tra lại → áp migration 2, tra lại → merge #40, đổi base #41 sang `main`, merge #41 → ghi kết quả. Phiên này cho phép Claude tự sửa DB và tự làm git (PR không cần review chéo); không xoá nhánh. Claude đã hỏi xác nhận lại trước khi ghi DB/merge (theo §66.7) — người dùng chọn "Làm hết".

### 67.1. Đường ghi DB mới: Supabase MCP server local
- Connector claude.ai (`mcp__claude_ai_Supabase__*`) vẫn bị coi là chỉ đọc — không dùng để ghi.
- Server local tên `supabase` (`npx @supabase/mcp-server-supabase --project-ref=gwbiwweeznbuqfgawywv`, token ở biến môi trường `SUPABASE_ACCESS_TOKEN`) cung cấp `mcp__supabase__*`. Phiên trước nó không nạp vì đăng ký **scope local** gắn theo đường dẫn dự án `C:/Users/...` trong `~/.claude.json`, còn VS Code mở thư mục là `c:\Users\...` — khoá đường dẫn lệch chữ hoa/thường ổ đĩa nên không khớp. Người dùng đã đăng ký thêm ở **scope user** → phiên này tool có ngay (`ToolSearch select:mcp__supabase__apply_migration,…` trả schema), `apply_migration` chạy không bị `declined`.

### 67.2. Migration đã áp (qua `mcp__supabase__apply_migration`, cả 2 trả `success`)
1. `custom_sounds_soft_delete_bucket_and_cleanup` — nội dung đúng file `backend/supabase/migrations/20261004000001_…sql` (giống hệt ở 2 nhánh).
2. `sound_mappings_index_from_snapshot` — đúng file `…20261004000002_…sql`.

### 67.3. Tra lại DB sau khi áp (bằng `execute_sql`)
- Migration 1: cột `custom_sounds.deleted_at timestamptz` ✅; bucket `custom-sounds` public=false, limit 10485760, mime `audio/wav,audio/x-wav,audio/wave` ✅; 3 policy `custom_sounds_objects_insert|select|delete` trên `storage.objects` ✅; 4 hàm `custom_sound_external_project_count`, `delete_custom_sound`, `collect_custom_sound_garbage`, `custom_sound_usage_bytes` — đều `security definer`, `service_role` gọi được, `authenticated`/`anon` không ✅; `platform_settings.custom_sound_quota_bytes = 52428800` ✅; 3 index mới ✅.
- Migration 2: `sound_mappings` có `branch_id`/`commit_id` (nullable, FK `ON DELETE CASCADE` tới `branches`/`commits`) ✅; constraint còn lại chỉ `pkey` + 3 FK (`project_id`, `branch_id`, `commit_id`) — **unique `(project_id, track_id, pitch)` và FK tới `custom_sounds` đã bỏ** ✅; trigger `drafts_sync_sound_mappings` (drafts) và `commits_sync_sound_mappings` (commits) ✅; policy chỉ còn `sound_mappings_select` ✅; 0 dòng.
- Chạy thử trigger: `UPDATE drafts SET snapshot = snapshot` trên 1 draft thật trong khối `DO` rồi `RAISE` để rollback → trigger chạy không lỗi (0 mapping vì draft chưa có `soundMap`). Không ghi dữ liệu thật nào.

### 67.4. Git
- `gh pr merge 40 --merge` → `bfece4f`; `gh pr edit 41 --base main`; `gh pr merge 41 --merge` → `788e077`. Không dùng `--delete-branch`: `bugfix/custom-sound-library-fixes`, `bugfix/custom-sound-mapping-snapshot` và 3 nhánh gốc `feature/*-custom-sound-*` vẫn còn trên GitHub.
- Local: `main` = `origin/main` = `788e077`, sạch.

### 67.5. Mức đã verify — trung thực
- ✅ Schema DB khớp migration (tra thật); trigger chạy được trên draft thật (rollback).
- ❌ **Chưa chạy end-to-end** upload/ghi âm/gán/phát/xoá Custom Sound với backend + DB thật, chưa nghe thử. Việc tiếp: chạy app, làm theo "How to verify" trong mô tả PR #40/#41.
- Còn treo: các mục §66.6; báo đồng đội (hoangvu6104) 8 điểm §66.2 (§66.5 bước 4).

## §68 — Bắt đầu giai đoạn testing: đọc template Report 5, đề xuất công cụ cho từng loại test, phân loại tự động / test tay (08/10/2026)

**Bối cảnh:** nhóm **tạm dừng code** để làm phần testing và Report 5. Người dùng nhờ đọc 3 template Report 5 cùng `SEP490 StudentGuide_Fall 2023.docx` (tất cả ở `docs/`) và trả lời 2 câu: (1) mỗi loại test (unit backend/frontend, API/integration…) dùng công cụ gì để làm đủ yêu cầu tài liệu; (2) phần nào tự động hoá được, phần nào phải test tay. Phiên này **chỉ tư vấn**: không sửa code, không cài thư viện, không đụng file `.docx`/`.xls`.

### 68.1. Đã làm
- Đọc `Report5_Test Documentation.docx`, `Report5_Unit Test.xls`, `Report5_Test Report.xlsx`, StudentGuide (trích text bằng Python, cài tạm `xlrd` cho file `.xls`) và `STAVE_Feature_Function_UseCase.xlsx` (trạng thái UC: khoảng 55 UC Done; Collaboration, Jam, AI, Subscription, PR, phần lớn Admin còn To Do).
- Đối chiếu code: `backend/package.json` đã có Jest/Supertest, frontend chưa có test runner, CI chưa chạy test, chỉ 1 file test thật.
- Tra `list_migrations` (chỉ đọc): DB thật có 34 migration, repo chỉ có 2. Vì vậy hướng "Supabase CLI local dựng từ migration" ghi ở §36-K bản 16/09 **không chạy được** với repo hiện tại.
- Kết quả ghi vào **§36-K (viết lại)**: K1 yêu cầu từng file template, K2 công cụ theo loại test + ma trận Test Level + chuyện DB test, K3 phân loại tự động / bán tự động / test tay. §36-D và §36-I thêm ghi chú "tạm dừng code từ 08/10".

### 68.2. Điểm chính cần nhớ
- "Test coverage" trong template là tỉ lệ test case đã chạy, không phải code coverage.
- Mẫu Unit Test.xls là ma trận N/A/B theo **từng hàm** → hợp nhất với logic thuần (diff, merge conflict, parser), không hợp với service gọi DB.
- Âm thanh, Google OAuth và cảm nhận UX luôn cần người. Playwright chỉ chứng minh lớp network + JS (bài học CLAUDE.md §10).

### 68.3. Chưa quyết / việc tiếp
- Nhóm **chưa chốt** bộ công cụ (vẫn là đề xuất) và chưa chọn cách dựng DB test (project Supabase riêng hay `db pull` về local). Đã ghi vào CLAUDE.md §5.
- Claude đã đề nghị (chưa làm): dựng sẵn cấu hình Vitest + Playwright kèm test mẫu; viết mẫu unit test `diff.service.ts` đặt tên theo `UTCID`; soạn bản nháp tiếng Anh mục II.1–II.3 của Test Documentation; lập danh sách test case theo từng UC Done kèm nhãn Auto/Semi/Manual.
- Verify: chỉ đọc tài liệu và tra DB. Không chạy test, không khởi động server, `git status` sạch (PROJECT_STATE/CLAUDE.md/Bible đều nằm trong `.gitignore`).
