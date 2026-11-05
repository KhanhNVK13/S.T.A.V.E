# PROJECT_STATE — STAVE

> Trạng thái hiện hành của dự án. File này **ngắn có chủ đích**: chỉ ghi hiện tại đang ở đâu, việc đang mở, quyết định còn hiệu lực. Lịch sử chi tiết nằm ở `archive/` (nguyên văn, bất biến, số §N giữ nguyên để tra chéo với CLAUDE.md và code). Cập nhật cuối: **05/11/2026**.
>
> **Quy tắc ghi:** phiên mới chỉ sửa mục 1–5 của file này cho đúng hiện tại. Khi một giai đoạn kết thúc, chuyển phần chi tiết sang file `archive/` mới (hoặc cuối file cùng giai đoạn) rồi chỉ giữ một dòng tóm tắt ở đây. Trung thực: ghi rõ mức đã verify (typecheck / gọi API thật / chạy E2E / người tự kiểm), không làm tròn lên. Quy ước ổn định nằm ở `CLAUDE.md`, không lặp lại ở đây.
>
> **Bản đầy đủ trước khi dọn (4.682 dòng):** `PROJECT_STATE.full-2026-11-05.md` trong thư mục sao lưu cá nhân của người dùng (ngoài repo). 49 mục đã loại vì lỗi thời hoặc bị thay thế, danh sách ở mục 7.

## 1. Đang ở đâu (05/11/2026)

- **`main`** đã gồm Round 1 của Test Report (PR #92, E2E mới và sửa test theo giao diện hiện tại), PR #89 (3 lỗi bảo mật F1, F2, F9) và PR #90 (file mồ côi Storage F5–F8).
- **CI trên `main` đang đỏ** (job frontend): `next build` kiểm kiểu cả thư mục `frontend/e2e/`, và `e2e/editor-extra.spec.ts` import `fflate` 0.6.11 không có kiểu tương thích `moduleResolution: "bundler"` (lỗi TS7016). Backend xanh. **Cách sửa đã làm tại máy, chưa vào `main`:** thêm `"e2e"` và `"playwright.config.ts"` vào `exclude` của `frontend/tsconfig.json`. Cần một PR riêng vào `main` (`bugfix/exclude-e2e-from-app-typecheck`).
- **Redesign "Staff Universe" đang chuyển sang bản thật** trên nhánh tích hợp `feature/redesign-integration` (không vào `main` cho tới khi xong cả chương trình, rồi chạy Round 2). Tiến độ ở mục 2.
- **Cloud credit** hết hạn **05/11/2026 14:59 (GMT+7)**. Hai phiên G2 và G4 đã được gửi ngày 05/11, chưa có PR khi ghi dòng này.

## 2. Kế hoạch chuyển thiết kế (G0–G7)

Quyết định của người dùng (04/11/2026): một bộ màu tối duy nhất ở `:root`; trang sau đăng nhập dùng thanh bên (`AppShell`), trang công khai dùng thanh ngang, editor có thanh ngang mới riêng; **gỡ hẳn hệ theme và các preset unleashed/moss/claret** (theme tuỳ chỉnh từ ảnh, UC-79, làm lại sau); thiết kế cũ phải biến mất hoàn toàn, không để hai hệ song song; bản đồ sao Galaxy và `StarPrint` là hình giả sinh từ hash id nên bị thay (Explore bỏ bản đồ sao, trang project dùng đồ thị commit thật).

| Giai đoạn | Nội dung | Trạng thái |
|---|---|---|
| G0 | Khảo sát mã theme, cập nhật CLAUDE.md 4.7 | Xong |
| G1 | Một bộ màu, gỡ theme, `components/shell/*` (AppShell, PublicShell, EditorBar), viết lại `components/ui/*` tại chỗ, i18n `shell.*` | **PR #91 đã merge vào nhánh tích hợp**; vitest 460/460 |
| G2 | `/projects`, `/projects/new`, `/projects/[id]`, settings; đồ thị commit thật; xoá `StarPrint`; dọn comment thừa của G1 | Cloud đang chạy (gửi 05/11) |
| G3 | Compare, Merge thành trang, `/pull-requests/*` | Chưa; làm tại máy hoặc phiên cloud thứ ba |
| G4 | `/explore*`, `/rankings` (sửa tràn ngang 433px ở 390px), `/creator/*`, `/jam/*`; xoá `components/galaxy/*` | Cloud đang chạy (gửi 05/11) |
| G5 | `/profile`, `/profile/sessions`, `/notifications`, `/invitations`, 4 trang auth, `/admin/*` | Chưa; làm tại máy |
| G6 | `EditorBar` hoàn thiện, hộp trợ giúp editor, đo piano roll ≥ 400px ở 1366×768 và thanh công cụ một hàng ≥ 1280px | Chưa |
| G7 | Dọn cuối: xoá `frontend/redesign/`, `ideas/`, `react-lab/`, hai dòng cấu hình trong `tsconfig.json`/`eslint.config.mjs`; grep `data-theme=`, `StarPrint`, `GalaxyMap`, `PRESET_THEME_KEYS` ngoài backend phải ra 0 | Chưa |

**Quyết định G1 đã chốt:** giữ Quick find Ctrl+K; không thêm mục Help (app chưa có route trợ giúp, hộp trợ giúp chỉ ở editor, để G6); EditorBar không hiện tên dự án/nhánh vì thanh công cụ MidiEditor đã hiện; không thêm font Onest/Be Vietnam Pro của prototype. Người dùng đã đăng nhập luôn thấy AppShell, kể cả ở Explore/Rankings/Creator/Jam.

**Tồn đọng khung G1:** `components/shell/*` và `ui/*` còn comment giải thích thừa (giao G2 dọn); cần kiểm `SiteFooter` còn được render trong route editor ở khung nào không (ghi công SoundFont không được nằm dưới piano roll).

**Backend theme để nguyên, ngủ đông:** `GET|PUT /users/me/theme`, bảng `themes`, `users.active_theme_id`, `PRESET_THEME_KEYS`. Frontend không gọi và bỏ qua mọi theme đã lưu.

**E2E có thể hỏng vì G1 (chat testing sở hữu `frontend/e2e/`, không sửa trong PR redesign):** `auth.spec.ts` AUTH-054 (tab Cá nhân hoá); `account-more.spec.ts` (`logOutFromMenu`, nút `/user a/i`); `sessions.spec.ts` (đếm nút "Đăng xuất"); `editing-tools.spec.ts` ~dòng 445 (link "Dự án của tôi" trong editor); các bài chờ footer hoặc tìm nút theo site-header cũ.

## 3. Test Report (Round 1 xong 05/11/2026)

- Mốc đo: `main` tại `87da5fa`. Kết quả `docs/Report5_Test Report.xlsx`: **352 Passed / 165 Failed / 289 Pending** trên 806 ca. Lỗi thật mới DFID117–DFID171 ghi ở `docs/testing/defects-list.md`.
- **116 ca Pending chờ người dùng tự test** (âm thanh, micro, thiết bị thật, đăng nhập Google, email thật, k6/Lighthouse, PayOS sandbox, các ca "(Manual)"); danh sách mã ca đầy đủ ở `archive/06-round1-and-redesign.md` §145. 173 ca Pending khác không do người dùng (142 chưa có chức năng, 23 thiếu đúng hành vi, 4 cần giả lỗi máy chủ, 4 cần môi trường triển khai); số theo sheet ở `docs/testing/test-report-plan.md`.
- **Round 2 = chạy lại cả chương trình sau khi redesign vào `main`.** Cột Round 2 (I/J/K) hiện toàn Pending.
- DFID135 (avatar nhận tới 10MB thay vì 2MB): người dùng chốt 05/11/2026 theo SRS (2MB), giữ là lỗi, sửa ở Round 2; AUTH-063 giữ Failed. Việc nhóm: cập nhật workbook Unit Test theo UTCID04/05 của BE-EXP-06; chạy lại 80 ca Failed cũ; viết spec cho 11 sheet thiết kế (BE-JAM-11/12, BE-SKT-06, FE-LIB-49, FE-EDT-13–19); spec cho `CommitsService`/`DiffService` (module commits chỉ phủ 22%).
- `docs/Report5_Unit Test.xlsx` không sửa nếu nhóm đang điền. `docs/Report5_Test Report.xlsx` sửa tự do (giữ tên tester Round 1 từng hàng).

**Quyết định test còn hiệu lực:**
- Nhãn nút editor theo ngôn ngữ đang chọn, tiếng Việt như "Hoàn tác" là hợp lệ (người dùng chốt 04–05/11; CLAUDE.md 4.7 và mục 5 đã sửa theo).
- Đăng nhập xong về `/` (trang chủ người đã đăng nhập) là hành vi có chủ ý; test theo hướng này (DFID009 chỉ còn AUTH-041, bỏ qua `?redirect=`).
- E2E chạy bằng giao diện tiếng Việt: `playwright.config.ts` đặt `storageState` `stave-lang = vi` (mặc định app là tiếng Anh). Chưa kiểm bản tiếng Anh bằng E2E.
- Test giả backend của đồng đội (`uc60-62`, `uc66-68`, `uc94-95`) không làm bằng chứng Round 1; bằng chứng thật là các spec dùng backend thật.

**Chạy E2E:** `cd frontend && PLAYWRIGHT_JSON_OUTPUT_NAME=<file.json> npx playwright test <spec> --workers=3 --reporter=line,json`. Trước khi chạy đảm bảo cổng 3000/3001/3100/3101 trống (tắt tiến trình `playwright|next|nest` qua PowerShell lọc `CommandLine`, loại `modelcontextprotocol`; `npx playwright test` tắt không sạch). DB test ở cloud nên mỗi test 1–3 phút. `jam.spec.ts` chạy `serial` (chỉ được 1 sự kiện Jam cùng lúc). Dọn dữ liệu bằng `cleanupE2eUsers()`. Sau lượt chạy: `git checkout -- frontend/AGENTS.md`.

**DB test** (`drevszfpovyinzauwuou`): đồng bộ bằng `scripts/test-db/sync-schema.sh --reset` (cần Docker Desktop và `SUPABASE_ACCESS_TOKEN`; xoá sạch dữ liệu). Hai bảng `tags`/`project_tags` có trong production từ 28/10, DB test cần đồng bộ lại. **Sau mỗi lần sync phải áp lại** migration Jam `backend/supabase/migrations/20261029120000_duc_jam.sql` cùng 3 cột `jam_events.description text`, `created_at timestamptz NOT NULL DEFAULT now()`, `updated_at timestamptz NOT NULL DEFAULT now()` rồi `NOTIFY pgrst, 'reload schema'` (ghi nhận 04/11; migration Jam chưa áp production và `JamService.createEvent` ghi cột không migration nào tạo, DFID162). Production không đụng.

## 4. Việc mở (theo thứ tự nên làm)

1. **Sửa CI đỏ trên `main`:** PR nhỏ đưa dòng `exclude` ở mục 1 vào `main`.
2. **Hoàn tất chuyển thiết kế:** nhận PR G2, G4 (review bằng grep "đã gỡ sạch", `web-design-guidelines`, `security-review` nếu chạm đăng xuất/điều hướng), rồi G3, G5, G6, G7. Chưa hết credit thì ưu tiên các phiên song song không trùng tập file.
3. **Bible lệch thực tế:** `docs/STAVE_PROJECT_BIBLE.md` chưa ghi ngược Staff Universe/một bộ màu/thanh bên, điều hướng và trang chủ, EN/VI, Custom Sound, UC-38 xuất MP3, khoá lạc quan của nháp (`DRAFT_STALE`), Gemini thay Ollama, hạn mức 50MB, mục 19.7 deploy. Lập bảng chênh lệch rồi mới sửa (docs/ bị `.gitignore`, chỉ người dùng thấy).
4. **Bảo mật còn lại** (từ rà soát 04/11; F1, F2, F5–F9 đã sửa ở PR #89/#90): **F4** `branches.service.ts` ~619 `UPDATE commits SET branch_id` khi xoá nhánh, trái nguyên tắc commit bất biến (cần tra DB thật có trigger/REVOKE UPDATE không); **F3** RLS các bảng gốc không xác minh được từ repo (chạy `get_advisors` security hoặc tra `pg_class.relrowsecurity`; phụ: `verifyPassword`/`selfUpdatePassword` gửi `service_role` làm `apikey`, nên dùng anon key); **F10** regex lọc ký tự điều khiển phía client thiếu C1/bidi/U+2028/2029/surrogate lẻ. **Chưa xác nhận người dùng đã rotate `SUPABASE_SERVICE_ROLE_KEY` từng bị lộ ở nhánh `vantri`** (DFID116); quyết `npm audit` (DFID115); bật branch protection (DFID111).
5. **Deploy** (chỉ tư vấn 31/10, chưa sửa): frontend Netlify Free, backend Railway Hobby (~$5–7/tháng demo). Cần: Dockerfile build context ở gốc repo vì `@stave/shared-types` là workspace nội bộ (chưa xác minh bằng build thật); `backend/.env.example` thiếu `GEMINI_API_KEY`; `app.set('trust proxy', 1)` ở `main.ts`; CORS đọc `FRONTEND_URL` (hiện `origin: true` ở `main.ts:20` và `collaboration.gateway.ts:57`); CSP `connect-src` thiếu `wss://` cho Socket.IO; `netlify.toml`; Supabase Auth Site URL và Redirect URLs; PayOS webhook trỏ domain Railway (chưa có code PayOS). **Cloudflare R2** để người dùng nghiên cứu (sample nhạc cụ và/hoặc Custom Sound khi Supabase 1GB đầy).
6. **Tính năng còn thiếu:** 96/119 UC đã có code; chưa làm UC-70/71 (mới có nền AI), UC-73–77, UC-79 (theme tuỳ chỉnh từ ảnh), UC-100–114. File Project Tracking còn ghi 7 UC "Doing" và UC-72 "To Do", cần cập nhật. Endpoint ghi tag chưa có nên thẻ Explore luôn rỗng (cần quyết chỗ gắn tag). Music Theory (UC-72) chưa có bước Gemini viết câu diễn giải và tô sáng ô nhịp. Điều hướng và trang chủ, switch EN/VI: bản thật đã làm (PR #82/#83/#87/#88). Còn treo: phiên Supabase chỉ ở trình duyệt nên `/` chỉ đổi sau khi client đọc phiên (có nháy; muốn sạch phải đổi sang cookie SSR, đụng đường xác thực, cần quyết riêng).
7. **Cần xác minh nếu còn nhớ:** hai nhánh bản vá `bugfix/collab-contributions-perf-filters` (UC-65: gộp truy vấn snapshot cha theo lô 50, thanh lọc luôn hiện, múi giờ from/to, chữ ≥ 12px) và `bugfix/vitest-include-tsx` (khôi phục `include: *.test.{ts,tsx}`) đã được đẩy chưa (bản vá gốc ở scratchpad phiên cũ, có thể đã mất; làm lại theo `archive/05-collaboration-and-hardening.md` §131). UC-65 chưa có E2E hay kiểm bằng trình duyệt.
8. **RAM MIDI Editor 1,5–1,6GB khi mở project nặng:** là cache sample đã giải mã của trình duyệt (`lib/sample-buffer-cache.ts`, không giới hạn, xem gotcha CLAUDE.md mục 10 và `archive/01-foundation-and-modules.md` §21, §23, §40). Hướng giảm chưa làm: chỉ nạp nốt thực dùng, LRU + trần dung lượng, mono/hạ sample rate, cảnh báo mềm.
9. **Việc người dùng tự làm (không giao cloud):** tạo/merge PR; rotate key; `npm audit`; branch protection; test tay 116 ca Pending; xác nhận DFID135; chạy `sync-schema.sh` sau mỗi migration production.

## 5. Quy trình làm việc đang dùng

- Không bao giờ push thẳng `main`; mọi thay đổi qua PR có người khác review (CLAUDE.md mục 8). Claude không tự commit/push, không tạo nhánh/worktree, không xoá nhánh; sửa tại chỗ trên nhánh người dùng đang đứng và đưa lệnh git để người dùng tự chạy.
- Phiên cloud không thấy CLAUDE.md: mỗi prompt cloud phải lặp lại khối quy tắc chung (token màu, tương phản ≥ 4.5:1, màu diff bất biến, i18n EN/VI, Dialog, `apiErrorMessage`, không UC/BR hiển thị, không thư viện mới, không comment thừa, cấm sửa `frontend/e2e/`, `backend/`, `docs/`, `package.json`/lockfile) và đặt base PR là `feature/redesign-integration`. Review một PR cloud: chạy grep "đã gỡ sạch", kiểm `package.json`/lockfile không đổi, đọc `shell-switch` và đường đăng xuất, chạy `web-design-guidelines`.
- Mọi thay đổi giao diện: `web-design-guidelines` làm cổng cuối; thay đổi lớn thêm `design-taste-frontend`/`ui-ux-pro-max`/`impeccable` (dual-agent) theo CLAUDE.md mục 5; kiểm tương phản và bố cục bằng Playwright với mạng giả (không bao giờ trỏ vào DB production `gwbiwweeznbuqfgawywv`). Điểm cơ sở UX sau Bước E (30/09): Nielsen 23/40, audit 13/20 (`archive/03-ux-audit-and-fixes.md` §63).
- Người dùng chạy PowerShell: biến Bash kiểu `$D` và `2>/dev/null` không dùng được trong lệnh đưa cho họ (dùng `2>$null`); `git merge` thêm `--no-edit` vì trình soạn git trỏ tới NetBeans không tồn tại. File `.xlsx` đang mở trong Excel thì `cp` báo "Device or resource busy". Sửa `.xlsx` bằng XML trực tiếp (openpyxl làm hỏng file/biểu đồ).

## 6. Mục lục lưu trữ

| File | Số § | Nội dung |
|---|---|---|
| `archive/01-foundation-and-modules.md` | §1–§7, §12–§25 | Khởi tạo monorepo; Auth & Account; Projects + Drafts; review/sửa các nhánh Explore, track, version-control engine; UI Version Control (commit/history/tag/restore); MIDI Editor redesign (UI cũ đã xoá ở §22); tìm nhạc cụ; bug câm tiếng và pipeline audio (§21, §23: bài học `Tone.Sampler`/`AudioContext`); bộ trống GM (§24); hoãn Audio Sketch (§25) |
| `archive/02-ui-redesign-and-custom-sound.md` | §26–§40 | Đợt thiết kế lại UI 16/09 (hệ token semantic, row-list, theme preset: **phần theme đã bị gỡ ở §140**); Audio Sketch (§31–§33); UC-48 chuyển nhánh (§35); **§36 bảng trạng thái cũ 16/09 (số liệu đã lỗi thời)**; Compare UC-45 (§37); thiết kế Custom Sound J1–J3 (§38–§39, quyết định còn hiệu lực ở CLAUDE.md 4.8); điều tra RAM (§40) |
| `archive/03-ux-audit-and-fixes.md` | §51–§67 | Đo thật bằng Playwright (§51), điểm cơ sở critique/audit (§52), mục lục & việc treo audit (§53), kế hoạch và 8 nhóm sửa E1–E8 (§54–§62), đo lại 23/40 · 13/20 (§63), gỡ mã UC/BR khỏi giao diện (§64), trợ giúp editor (§65), Custom Sound migration + PR #40/#41 (§66–§67) |
| `archive/04-unit-test-setup.md` | §68–§76 | Chọn công cụ test, mẫu unit test, phân công 5 người, hạ tầng DB test, unit test BE-BRN/MRG/USR, điền Report 5 |
| `archive/05-collaboration-and-hardening.md` | §98–§135 | Phân công 47 UC; quyền cộng tác viên; đồ thị commit hai cha; thông báo, Fork, Google, Pull Request; kiểm tra đầu vào, hộp thoại, xuất .zip; xếp hạng (§112–§115); "đợt 2" §117–§124 (tên dự án trùng, khoá lạc quan nháp, so sánh theo tag/nhánh, đồ thị nhánh, waveform, MP3); E2E trên DB test; review nhánh đồng đội §131–§132, §135; deploy §133; **rà soát bảo mật F1–F10 §134** |
| `archive/06-round1-and-redesign.md` | §136, §140, §145 | Làm lại Round 1 (Bước 0–1, phân loại 806 ca), G0 chuyển thiết kế, kết quả Round 1 và danh sách 116 ca Pending |

**49 mục đã loại** (có trong bản sao lưu đầy đủ): §0 và khung mẫu (trước khi code); §8–§11 (chỉnh grid/container/row-list, đã thành quy tắc ở CLAUDE.md 4.7); §41–§50 (báo cáo audit "CHƯA sửa", bị thay bởi kết quả đo và sửa thật §51–§65); §71, §103, §107, §116 (ghi chú tạm dừng phiên, đã quá hạn); §77–§97 (nhật ký điền Test Report lần đầu, đã làm lại hoàn toàn ở Round 1 §136+); §137–§139, §141–§144 và §140 thứ hai (nhật ký trung gian của Round 1, hợp nhất vào mục 3 và §145).
