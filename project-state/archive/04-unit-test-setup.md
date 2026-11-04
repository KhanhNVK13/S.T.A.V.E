# Archive — Hạ tầng và phân công unit test (16–21/10/2026)

> Nhật ký bất biến, giữ nguyên văn từ PROJECT_STATE gốc. Số §N giữ nguyên để tra chéo với CLAUDE.md.

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

## §69 — Unit test backend/frontend: mẫu đầu tiên, hướng dẫn nhóm, phân công, kế hoạch (16–20/10/2026)

Ghi để phiên/tài khoản Claude mới nắm được toàn bộ bối cảnh. Người dùng là Nguyen Viet Khanh (test lead). Hạn mức Claude Pro của họ gần hết nên phiên mới cần tiết kiệm token: đọc đúng sheet/hàm cần làm, không quét cả repo.

### 69.1. Đã làm
- **Sửa lỗi "Could not provision profile"** (đăng nhập lần đầu): race condition do `onAuthStateChange` bắn nhiều lần → `ensureBusinessSession` chạy song song → insert `public.users` trùng khoá. Sửa `AuthService.syncProfile` (insert lỗi thì đọc lại theo id, có thì trả về) và `frontend/context/auth-context.tsx` (dùng chung 1 promise đang chạy). Đã commit `6ccdce0`, push nhánh `bugfix/auth-profile-provision-race`, người dùng tự tạo PR và merge. Chưa có log xác nhận nguyên nhân; kết luận từ code + DB (tài khoản mới nhất đã có profile).
- **Mẫu unit test đầu tiên** cho sheet BE-AUTH-03: `backend/src/auth/auth.service.spec.ts` (UTCID01–06 theo sheet + UTCID07 đề xuất cho bản sửa race) và helper `backend/src/test-utils/supabase-mock.ts` (mock query builder: hàm chuỗi trả chính builder, `.maybeSingle()/.single()` lấy kết quả từ hàng đợi). 7/7 pass, `tsc --noEmit` sạch. **Chưa commit.** Mock chưa hỗ trợ `.rpc()`, `.storage`, `.auth.*` và `await` thẳng query nhiều dòng — cần mở rộng trước khi làm các sheet SND/SKT/BRN/MRG.
- **Hướng dẫn cho nhóm:** `docs/testing/unit-test-guide.md` (quy tắc UTCIDxx, quy trình, cách dùng mock, mục 2.1 nhóm 14 hàm rủi ro cao bắt buộc "làm hỏng code để test phải fail", lệnh, ghi Excel, Git). **Chưa commit.**
- **Cài Vitest cho frontend:** `vitest@^3`, `jsdom@^26`, `@testing-library/react@^16`, `@testing-library/dom@^10`, `msw@^2` vào `frontend/package.json` + `package-lock.json`, thêm script `"test": "vitest run"` và `frontend/vitest.config.ts` (jsdom, alias `@`, chỉ chạy `*.test.ts(x)`). Đã chạy thử 1 test tạm (pass, đã xoá). **Chưa commit.** Lưu ý: `npm test` báo lỗi khi chưa có file test nào (thêm `--passWithNoTests` khi đưa vào CI). Quy ước: test FE là `*.test.ts(x)`, BE là `*.spec.ts`.
- Người dùng đã nhận lệnh git để tự chạy (nhánh gợi ý `test/frontend-vitest-setup`, message `Add Vitest setup for frontend unit tests`, chỉ add `frontend/package.json`, `frontend/vitest.config.ts`, `package-lock.json`). Claude không tự commit/push.

### 69.2. Kết luận quan trọng
- Tài liệu Report 5 (Test Documentation + 2 file Excel) là **kế hoạch/thiết kế case**, mọi kết quả đang Untested/Pending. Việc còn lại: viết code test, commit code test lên git, chạy, rồi điền Excel (kết quả lấy từ output Jest/Vitest vì tên test chứa `UTCIDxx`).
- 187 hàm trong sheet Unit Test (1.532 test case) đều **đã tồn tại trong code** (đối chiếu `main @ 788e077`, 186/187 khớp tên, 1 là tên ghép BE-PRJ-12). Module chưa code (Collaboration, Jam, AI, Payment, Notifications, Pull Requests, một số Admin) chưa có sheet unit test.
- **Unit test không cần DB** (Supabase bị mock). DB test riêng chỉ cần cho integration/pgTAP/Playwright ghi dữ liệu; chưa dựng (cần `supabase db dump`, repo chỉ có 2/34 migration). Unit test không bắt được lỗi lệch schema.
- AI hay viết test pass theo đúng code nên bước "làm hỏng code" là bắt buộc cho 14 hàm: `createCommit`, `restoreCommit`, `putDraft`, `switchBranch`, `deleteBranch`, `mergeBranch`, `resolveConflictsAndMerge`, `deleteOwned`, `changePassword`, `deleteAccount`, `removeUser`, 3 guard (Jwt/Session/Admin). Số "8 hàm" nói miệng trước đó là sai, danh sách đúng là 14.

### 69.3. Phân công đề xuất 5 người (~306 case/người, chưa được xác nhận)
| Người | Phần việc | Case |
|---|---|---|
| Đức (Ducctde180199) | BE-CMT + BE-DRF + SH-TYP + FE-LIB-15,16,17 | 311 |
| **Khanh (người dùng)** | BE-BRN (16 hàm) + BE-MRG (11 hàm) + BE-USR (6 hàm) | 306 |
| Vũ (Vunhde180850) | BE-AUTH (BE-AUTH-03 đã xong) + BE-ADM + BE-COM + BE-EXP + FE-LIB-01,08,12,13,14 | 305 |
| Trí (Trinvde180786) | BE-PRJ + BE-SND + BE-SKT + FE-LIB-02–05,09–11,19 | 308 |
| Hải (Haidnde180202) | FE-EDT (12 hàm) + FE-LIB còn lại (audio, MIDI parser/exporter, SoundFontKitVoice, tone-synth-engine, recorder, wav-encoder…) | 302 |

Review chéo theo vòng: Đức→Khanh duyệt, Khanh→Vũ, Vũ→Trí, Trí→Hải, Hải→Đức duyệt. Ghép tên với tài khoản suy từ Test Documentation bảng nhân sự, chưa xác nhận. Phân công này lệch vai trò gốc trong tài liệu (Vũ/Trí vốn là tester hệ thống/hiệu năng).

### 69.4. Kế hoạch ngày (đề xuất, ước lượng của Claude)
- 20/10: merge PR sửa race; Hải làm PR Vitest; Khanh hoặc Trí làm PR mở rộng `supabase-mock.ts`.
- 21/10: hai PR đó merge vào `main`, cả nhóm bắt đầu viết.
- 21–23/10: viết và chạy test phần của mình (mỗi PR một nhóm sheet).
- 24/10: review chéo, merge hết PR.
- 25/10: chạy toàn bộ, điền Excel (Khanh).
- Đề xuất thêm: script đọc output test rồi điền Excel tự động; thêm bước `npm test` vào `ci.yml`. Mốc kế hoạch Report 5: unit xong trước hết Iteration 3 (01/11), system test từ 02/11.

### 69.5. Việc người dùng cần làm / còn treo
1. Tự chạy lệnh git để push nhánh Vitest (xem 69.1), tạo PR, nhờ người khác duyệt.
2. Commit `auth.service.spec.ts`, `test-utils/`, `docs/testing/unit-test-guide.md` (nhánh `test/...` riêng, sau khi PR sửa race merge vì UTCID07 phụ thuộc bản sửa).
3. Xác nhận phân công 69.3 (ghép tên, vai trò) và gửi cho nhóm kèm hướng dẫn.
4. Phần của chính Khanh: BE-BRN + BE-MRG + BE-USR. Bắt đầu từ hàm ★ ít nhánh nhất `BranchesService.deleteBranch` (BE-BRN, 9 nhánh), rồi `switchBranch` (11), `mergeBranch` (17), `resolveConflictsAndMerge` (19). Mỗi hàm: đọc đúng sheet `BE-xxx-yy` + code, đối chiếu, viết test, làm hỏng code kiểm chứng, chạy `npx jest <file>`.
5. Chưa quyết: có commit file Excel không (mặc định gửi riêng); dựng DB test khi nào; sửa sheet BE-AUTH-03 (thêm cột UTCID07 → 7 case, ghi lần đọc lại sau insert lỗi); thêm `--passWithNoTests` vào CI.
6. Quy tắc làm việc giữ nguyên: Claude không tự commit/push, không tự tạo nhánh; chỉ đưa lệnh; không cài thư viện mới khi chưa hỏi; test không bao giờ ghi vào DB production `gwbiwweeznbuqfgawywv`.
7. Lỗi ngày thứ trong 69.4: 20/10/2026 là thứ Ba, 25/10/2026 là Chủ nhật (Claude từng ghi nhầm thứ trong câu trả lời), nên dùng ngày dương lịch.

## §70 — Rà soát rủi ro khi 5 người viết unit test song song + kế hoạch hạ tầng trước khi chia (20/10/2026)

Ghi để chốt được những gì đã kiểm chứng bằng code thật trước khi cả nhóm bắt tay viết test. Mọi khẳng định dưới đây đều đã chạy/đọc file thật, không suy đoán. Người dùng đã chốt hướng xử lý cho từng điểm (xem 70.4).

### 70.1. Hạ tầng dùng chung — chặn cả nhóm nếu không xử lý trước

**A1. `backend/src/test-utils/supabase-mock.ts` thiếu API — 4/5 người bị chặn.**
File hiện chỉ 34 dòng, mock đúng 12 hàm chain cơ bản (`select/insert/update/delete/upsert/eq/neq/is/in/order/range/limit` + `maybeSingle/single`). Còn thiếu, đã grep ra từng chỗ code thật cần:

| API còn thiếu | Chỗ code thật cần | Người bị chặn |
|---|---|---|
| `.rpc()` | `merge/merge.service.ts:649` (`create_commit_atomic`), `commits/commits.service.ts:138,540` | Khanh (BE-MRG), Đức (BE-CMT) |
| `.storage.from()` | `custom-sounds/custom-sounds.service.ts:226,246,407,420,430`, `audio-sketches/audio-sketches.service.ts:140,178,239` | Trí (BE-SND, BE-SKT) |
| `.auth.admin.*` | `admin/admin.service.ts:139,163,187` (`updateUserById`, `deleteUser`), `auth/auth.service.ts:161,233,273` (`signOut`, `deleteUser`) | Vũ (BE-ADM) |
| `.auth.getUser()` | `common/guards/jwt-auth.guard.ts:33` | Vũ (BE-COM) |
| await thẳng query nhiều dòng (không qua `.single()`) | `branches/branches.service.ts` ~20 lần `.from().select().eq()` rồi `await` thẳng | Khanh (BE-BRN) |

Đây là **file duy nhất trong repo mà 4 người cùng phải sửa** → chắc chắn conflict khi merge 4 nhánh song song. Tự viết mock riêng trong từng file test thì vi phạm mục 4 hướng dẫn và tạo 4 bản khác nhau.

**A2. `shared-types` không có test runner.** SH-TYP-01/02/03 test `sanitizeSoundMap` / `isValidSoundMap` / `isDrumKitInstrument` trong `shared-types/src/index.ts`, nhưng package này không có jest, không có vitest, không có script `test`. Backend Jest có `rootDir: "src"` (của backend) nên không quét tới; frontend Vitest chạy từ `frontend/` cũng không chạm.

**A3. `docs/` bị `.gitignore` → cả nhóm không thấy hướng dẫn.**
`.gitignore:30` có `docs/`; `git ls-files docs/` trả về **0 file**. `docs/testing/unit-test-guide.md` (171 dòng) và `docs/testing/unit-test-inventory.md` (1040 dòng) là tài liệu duy nhất quy định quy ước UTCID, quy trình, cách làm hỏng code để verify. 5 người clone repo sẽ không có gì đọc.

**A4. CI không chạy test.** `.github/workflows/ci.yml` chỉ có `npm run build` + `npm run lint` (2 job: frontend, backend). Test hỏng vẫn merge vào `main` không ai hay.

**A5. `next build` typecheck file test → test hỏng break CI của cả nhóm.**
`frontend/tsconfig.json` có `include: ["**/*.ts","**/*.tsx"]`, `exclude: ["node_modules"]` → file `.test.ts(x)` **có** được typecheck khi `next build`. Một lỗi type trong test của ai đó → job frontend đỏ → chặn merge cả nhóm. Backend an toàn hơn: `backend/tsconfig.build.json` có `exclude: [..., "**/*spec.ts"]` nên `npm run build` của backend không vướng spec. ESLint thì không vướng (đã chạy thử `npx eslint lib/__probe2.test.ts` → exit 0, sạch).

**A6. Tone.js treo trong jsdom — ảnh hưởng FE-EDT + FE-LIB.**
Đã verify: `await import("tone")` trong test Vitest → **timeout 5000ms** (Tone.js khởi tạo AudioContext chết trong jsdom). Workaround có sẵn và đã test pass: `vi.mock("tone", () => ({...}))` → 7ms. Cần ghi vào hướng dẫn, không ai tự mò trong deadline.

### 70.2. Trùng lặp giữa 2 người (đã map 187 sheet → class → người)
| File source | Người A | Người B |
|---|---|---|
| `frontend/lib/api-client.ts` | Vũ (FE-LIB-01 `apiFetch`) | Trí (FE-LIB-02/03/04/05) |
| `frontend/lib/format-date.ts` | Vũ (FE-LIB-14 `formatRelativeTime`) | Đức (FE-LIB-15/16 `formatMonthYear`, `formatDate`) |

Nếu cả hai đặt tên theo quy ước "đặt cạnh file code" (`api-client.test.ts`) → hai người tạo cùng một đường dẫn → conflict không giải được bằng merge thường. Cần quy ước tên file phân biệt. Ngoài 2 điểm này, phần còn lại của phân công 69.3 **không trùng file source**.

### 70.3. Rủi ro vận hành khi chạy song song (không chặn viết, nhưng chặn verify)
- **C1.** Backend Jest `rootDir: "src"`, `testRegex: ".*\\.spec\\.ts$"` → `npm test` chạy **toàn bộ** spec trong `backend/src`. Người chạy full suite sẽ thấy fail của người khác. Quy ước: verify bằng `npx jest <file>` (đúng hướng dẫn mục 8), chỉ chạy full suite ở bước tổng hợp.
- **C2. UTCID trùng tên giữa các sheet — KHÔNG phải bug, nhưng dễ đếm sai.** Mỗi sheet đánh số lại từ `UTCID02` (đã verify: BE-BRN-01 có 17 UTCID, BE-BRN-02 có 11, cả hai bắt đầu từ UTCID02). Nên `npx jest -t "UTCID05"` khớp nhiều test ở nhiều sheet. Khi đếm số Passed điền Excel phải đếm **theo `describe` (theo sheet)**, không theo tên UTCID. Quy tắc: `describe` bắt buộc có mã sheet, VD `describe('BE-BRN-02 BranchesService.switchBranch')`.
- **C3. Nguy cơ ghi vào DB production — điểm nguy hiểm nhất, không phải về tiến độ.** Vì mock chưa chặn đúng `.rpc()`/`.storage`/`.auth.*`, người viết test có thể **vô tình gọi client thật** khi mock không bắt được đường đi. Thêm nữa, hàm `next()` hiện tại khi **hết hàng trả `{ data: null, error: null }`** → lỗi bị nuốt im lặng, test có thể "pass" vì mọi thứ trả null mà không hề chạm DB. → Buộc phải **deny-by-default**: mọi đường lạ thì throw, không trả null.

### 70.4. Quyết định của người dùng (20/10/2026)
1. **Giữ nguyên `.gitignore`** (`docs/` vẫn bị ignore). Người dùng sẽ **gửi riêng** file cần cho nhóm (hướng dẫn + inventory) qua kênh ngoài repo. → Không sửa `.gitignore`, không commit `docs/`.
2. **Chia phần theo sheet** (giữ nguyên cách chia 69.3), không chia lại theo file source.
3. Thêm `npm test` vào `ci.yml` (backend + frontend) với `--passWithNoTests` cho tới khi có test.
4. Loại `**/*.test.ts(x)` khỏi phạm vi typecheck của `next build` (thêm `exclude` trong `frontend/tsconfig.json`).
5. `shared-types`: chọn hướng **chuyển 3 sheet SH-TYP sang test qua backend** (backend đã import được `@stave/shared-types`) để khỏi dựng thêm 1 test runner. → Đính chính 69.5 mục 1: việc "push nhánh Vitest" **đã xong** (PR #43 merge vào `main` @ `819d473`).
6. Ghi vào hướng dẫn: test FE nào import `tone` thì phải `vi.mock("tone")`.

### 70.5. Kế hoạch thực thi đã chốt
- **PR hạ tầng (1 PR, chia tay Khanh làm):** mở rộng `supabase-mock.ts` (thêm `.rpc()`, `.storage.from()`, `.auth.admin.*`, `.auth.getUser()`, await nhiều dòng, chuyển sang deny-by-default) + cập nhật `docs/testing/unit-test-guide.md` cho khớp + vá `ci.yml` + `frontend/tsconfig.json`. Không đụng `.gitignore`.
- **Sau khi PR hạ tầng merge:** 5 người bắt đầu viết theo phân công 69.3, mỗi người 1 nhánh `test/...`, verify bằng `npx jest <file>` / `npx vitest run <file>`.
- **Quy ước tên file FE (2 file trùng):** `api-client` → Vũ dùng `api-client.api-fetch.test.ts`, Trí dùng `api-client.public.test.ts`; `format-date` → Vũ dùng `format-date.relative.test.ts`, Đức dùng `format-date.absolute.test.ts`.
- **Trước khi chia:** gửi riêng `unit-test-guide.md` + `unit-test-inventory.md` cho nhóm qua kênh ngoài repo (vì `docs/` bị ignore).

### 70.6. Trạng thái repo tại thời điểm ghi
- Nhánh local: `test/frontend-vitest-setup` (đã merge, không còn việc).
- `origin/main` = `819d473` (merge PR #43). PR #42 (sửa race profile) đã merge @ `7b0a495`.
- Chưa commit: `backend/src/auth/auth.service.spec.ts`, `backend/src/test-utils/supabase-mock.ts`, `docs/testing/unit-test-guide.md`, `docs/testing/unit-test-inventory.md` (2 file sau nằm trong `docs/` bị ignore nên `git status` không hiện).
- `npx jest` toàn bộ backend hiện tại: **3 suite / 11 test pass** (`app.controller.spec.ts`, `auth/auth.service.spec.ts`, `custom-sounds/wav-info.spec.ts`).
- Verify trong phiên này: React TSX test chạy được dưới Vitest (pass 1 test trong 40ms); `import("tone")` timeout 5s trong jsdom; `vi.mock("tone")` pass 7ms; eslint không soi file test.

## §72 — Hoàn tất setup unit-test trước khi chia nhóm (21/10/2026)

Người dùng yêu cầu triển khai tiếp kế hoạch §70, sau đó tạm dừng để đổi model sang Sonnet 5 nhằm tiết kiệm token. Sonnet 5 đủ cho phần còn lại của công việc: chỉnh cấu hình, tài liệu, chạy test/lint/build và ghi trạng thái; phần logic mock đã được triển khai trước đó.

### 72.1. Đã hoàn thành trong lượt này
- Cập nhật cục bộ `docs/testing/unit-test-guide.md` (vẫn bị `.gitignore`, không commit):
  - thay mô tả mock cũ bằng API hiện tại `createSupabaseMock(results, options)`, gồm `tables`, `rpc`, `storage`, `getUser`, `authAdmin`;
  - ghi rõ await query trực tiếp;
  - ghi rõ deny-by-default khi thiếu kết quả/API;
  - thêm hướng dẫn mock Tone.js bằng `vi.mock('tone', ...)` trong jsdom;
  - sửa khoảng trắng Markdown giữa heading và nội dung.
- `.github/workflows/ci.yml`: thêm test step cho frontend và backend với `--passWithNoTests` sau build/lint.
- `frontend/tsconfig.json`: thêm `**/*.test.ts` và `**/*.test.tsx` vào `exclude`; không đổi `vitest.config.ts`.
- Dọn format 4 lỗi Prettier trong `backend/src/test-utils/supabase-mock.spec.ts`.

### 72.2. Đã verify
- Backend `npx jest`: **4 suite / 23 test pass**.
- Backend `npx tsc --noEmit`: pass.
- Targeted ESLint cho `src/test-utils/**/*.ts` và `src/auth/**/*.ts`: pass sau khi dọn format.
- Frontend `npm test -- --passWithNoTests`: pass, không có test file và exit code 0.
- Frontend `npm run lint`: exit code 0, có 9 warning có sẵn (8 React Hook dependency warnings trong `components/midi-editor/midi-editor.tsx`, 1 `no-img-element` trong `components/ui/avatar.tsx`), không có error.
- Frontend `npm run build`: pass, Next 16.3.3 compile/typecheck/static generation thành công.
- JSON `frontend/tsconfig.json` hợp lệ; CI chứa đủ hai test command.

### 72.3. Còn lại sau khi tạm dừng
- Chưa chạy full backend lint; hiện có một lỗi Prettier có sẵn ở `backend/src/audio-sketches/audio-sketches.service.ts:132`, không thuộc setup test.
- Chưa tạo nhánh mới, commit hoặc push; người dùng sẽ tự thực hiện.
- Chưa viết các sheet unit test BE-BRN/BE-MRG/BE-USR và các phần được phân công khác.
- Cần kiểm tra lại `git diff`/`git status`, sau đó cung cấp lệnh bàn giao Git. Không sửa `.gitignore`, không commit `docs/`.

### 72.4. Git state lúc tạm dừng
- Nhánh: `test/frontend-vitest-setup`.
- Tracked modifications: `.github/workflows/ci.yml`, `frontend/tsconfig.json`.
- Untracked: `backend/src/auth/auth.service.spec.ts`, `backend/src/test-utils/`.
- `docs/testing/unit-test-guide.md` đã cập nhật cục bộ nhưng không xuất hiện trong `git status` do `docs/` bị ignore.

### 72.5. Trạng thái hoàn tất setup (21/10/2026)
- Đã chạy lại targeted ESLint sau khi dọn format: **pass, 0 error** cho `backend/src/test-utils/**/*.ts` và `backend/src/auth/**/*.ts`.
- Đã chạy full `cd backend && npm run lint`: lệnh có `--fix` từng format một dòng trong `audio-sketches.service.ts` và khi đó pass; sau đó đã khôi phục file để không đưa thay đổi ngoài phạm vi vào setup, nên full lint hiện vẫn còn lỗi format có sẵn ở dòng đó. Targeted lint cho các file setup vẫn pass.
- `git diff --check`: pass.
- Working tree cuối: chỉ còn `.github/workflows/ci.yml`, `frontend/tsconfig.json` là tracked modifications; `backend/src/auth/auth.service.spec.ts` và `backend/src/test-utils/` là untracked; không có thay đổi `.gitignore` hoặc file nghiệp vụ audio.
- Setup hạ tầng unit test đã sẵn sàng để nhóm bắt đầu viết test theo sheet. Các test sheet BE-BRN/BE-MRG/BE-USR và phần phân công còn lại chưa được viết.
- Lệnh bàn giao đề xuất, người dùng tự chạy (không chạy trong phiên này): nhánh `test/unit-test-infrastructure`; commit `Set up unit test infrastructure`; chỉ stage các file tracked/untracked thuộc setup, không stage `docs/`.

## §73 — Unit test BE-BRN và BE-MRG đã viết xong, BE-USR chưa làm (21/10/2026)

### 73.1. Trạng thái
- Hạ tầng (§72) đã merge vào `main` (PR #43, #44). Từ đó viết test theo sheet trong `docs/Report5_Unit Test.xlsx`, kết quả trung gian ghi vào `docs/testing/unit-test-results.txt` (TSV, bị `.gitignore` ẩn). Chưa sửa Excel.
- **BE-BRN-01…16: xong**, 141 test chạy, 141 pass, 9 case collaborator-edit không test (chức năng chưa cài). File `backend/src/branches/branches.service.spec.ts`.
- **BE-MRG-01…11: xong**, 104/106 case chạy. Files: `backend/src/merge/dto/merge.dto.spec.ts` (01, 02), `backend/src/merge/merge.service.spec.ts` (03–11). `backend/src/test-utils/supabase-mock.ts` được thêm hỗ trợ `count`.
- Không test: BE-MRG-03 UTCID12 và BE-MRG-05 UTCID13 (collaborator có quyền edit, BR-26 chưa cài; cùng quyết định với BE-BRN).
- Toàn backend: 7 suite, 268 test pass; `tsc --noEmit` và ESLint file mới sạch.
- **BE-USR (6 sheet) chưa làm.** Người dùng tạm dừng sau BE-MRG. Còn các hàm rủi ro cao: `changePassword`, `deleteAccount`, `removeUser` (cần bước làm hỏng code).

### 73.2. 5 lỗi nghiệp vụ mà sheet dự báo, test ghi bằng `it.failing`
Test viết theo hành vi đúng của SRS và đánh dấu `it.failing` (Jest 30) để lỗi được ghi nhận mà suite vẫn xanh. Khi sửa code, các test này sẽ đỏ, lúc đó đổi thành `it`.
- BE-MRG-05 UTCID10: `resolveConflictsAndMerge` gộp khi không có tổ tiên chung (dùng base rỗng), SRS UC-51 2.E1 yêu cầu từ chối.
- BE-MRG-05 UTCID11: conflict chưa giải quyết bị lặng lẽ chọn bản target (BR-53/BR-97).
- BE-MRG-09 UTCID07: `PICK_CUSTOM` không có `customNote` làm note biến mất thay vì báo lỗi.
- BE-MRG-09 UTCID08: conflict không có resolution mặc định chọn target.
- BE-MRG-09 UTCID11: code chỉ đọc `customNote.start`, bỏ qua `startTime` mà DTO khai báo.
- Ghi chú: `groupConflictsByBar` với `timeSignature` mẫu số 0 chia cho 0, mọi conflict rơi vào bar 1. Chưa có sheet đòi hỏi, chưa sửa.

### 73.3. Bước làm hỏng code (mutation) cho mergeBranch/resolveConflictsAndMerge
10 mutation, đều bị test bắt: bỏ kiểm tra quyền (cả 2 hàm), bỏ kiểm tra head cũ (cả 2), bỏ kiểm tra cùng project (cả 2), bỏ kiểm tra không có tổ tiên chung, bỏ kiểm tra nothing-to-merge, không bao giờ fast-forward, đổi message mặc định. `merge.service.ts` đã khôi phục, không có diff. Script ở scratchpad phiên, không nằm trong repo.

### 73.4. Gotcha gặp trong phiên
- Test `fast-forward` cần thêm 1 kết quả `branches` cho lệnh `update` (queue của mock dùng chung theo bảng): thiếu thì báo "ran out of results".
- Sheet BE-MRG-03 UTCID03 ghi "fast-forward khi source = target head", nhưng code ném `Nothing to merge`: test đã đổi theo code.
- Mặc định `= 4` của destructuring chỉ áp dụng cho `undefined`, không cho `0`.
- Heredoc bash chứa nhiều dấu nháy trong file test lớn bị lỗi phân tích: ghi file bằng công cụ Write rồi `cat >>`.
- Python console Windows lỗi `cp1252` khi in ký tự `●`: chạy `python -I -X utf8`.

### 73.5. Còn treo
- Chưa commit file nào (theo yêu cầu: chưa quan tâm commit cho tới khi xong phần test của người dùng). Working tree: `M backend/src/test-utils/supabase-mock.ts`, untracked 3 spec (branches, merge dto, merge service).
- Việc tiếp: BE-USR, đối chiếu giai đoạn 5 (chạy tổng hợp), giai đoạn 6 (điền Excel sau review chéo).

## §74 — Unit test BE-USR đã viết xong (21/10/2026)

- Thêm 3 file spec: `backend/src/users/users.service.spec.ts` (BE-USR-01..04), `backend/src/users/dto/set-theme.dto.spec.ts` (BE-USR-05), `backend/src/users/dto/update-profile.dto.spec.ts` (BE-USR-06). 42 test, mã `UTCIDxx` đúng sheet.
- 2 case dùng `it.failing` vì code lệch SRS (BE-USR-06 UTCID07: regex username chỉ cho chữ thường; UTCID11: displayName rỗng vẫn hợp lệ). Báo cáo là "expected Failed" như sheet ghi, chờ quyết định sửa code hay sửa SRS.
- Sheet BE-USR không có case collaborator nên không có case Untested.
- Làm hỏng thử `users.service.ts` (đổi mã 23505, đổi giá trị liên kết `active_theme_id`): 3 test fail đúng kỳ vọng. File đã khôi phục, `git diff` sạch. `changePassword`/`deleteAccount`/`removeUser` thuộc BE-AUTH/BE-ADM, chưa làm.
- Tổng hợp: `tsc --noEmit` sạch, `jest --runInBand` 10 suite / 310 test pass, ESLint sạch trên spec mới. Kết quả ghi ở `docs/testing/unit-test-results.txt`.
- Chưa làm: điền Excel (giai đoạn 6) — chờ review chéo, cần bản sao Excel và xin phép trước. Không commit/push.

## §75 — Điền Excel Report5 cho BE-BRN / BE-MRG / BE-USR (21/10/2026)

- Điền thẳng vào `docs/Report5_Unit Test.xlsx` theo yêu cầu người dùng (không tạo bản sao trong repo; bản lưu an toàn nằm ở scratchpad). Sửa trực tiếp XML từng sheet nên giữ nguyên 2 biểu đồ Statistics, công thức, data validation; bật `fullCalcOnLoad` để Excel tự tính lại khi mở.
- Mỗi sheet: Executed By (L3), hàng Passed/Failed (P/F), Executed Date (`21/10/2026`, ghi dạng chữ vì định dạng ngày khác nhau giữa các ô), Defect ID. Số liệu lấy từ `jest --json`, không gõ tay. Kết quả: 280 Passed, 7 Failed.
- 7 Failed (`it.failing`): DFID001-002 = BE-MRG-05 UTCID10, 11; DFID003-005 = BE-MRG-09 UTCID07, 08, 11; DFID006-007 = BE-USR-06 UTCID07, 11.
- Phát hiện khi đối chiếu: bảng cũ trong `unit-test-results.txt` ghi số sai ở một số sheet BRN. Đã ghi lại theo số thật. Case chưa có test thật trong sheet BRN: BRN-04 UTCID04; BRN-08 UTCID04-06 (view-only, non-member, userId rỗng); BRN-09 UTCID10; BRN-10 UTCID04; BRN-12 UTCID07. Các case này để Untested trong Excel, cần viết bổ sung. Case collaborator edit (BRN-01/02/03/04/05/06/07/08, MRG-03/05) bỏ qua theo quyết định.
- Chưa review chéo; giá trị trong Excel là sơ bộ.

## §76 — Quyết định công cụ test cho Integration/System và hạ tầng DB test (21/10/2026)

- **Đã merge vào `main`:** unit test BE-BRN/MRG/USR (PR người dùng tự tạo). Phần còn lại của Report 5: Integration/System/Acceptance (`Report5_Test Report.xlsx`, 19 sheet module) và `Report5_Test Documentation.docx`.
- **Công cụ lấy theo mục 2.3 Supporting Tools của `Report5_Test Documentation.docx`.** Đã có sẵn trong repo, không cần cài: Jest 30 + ts-jest, Supertest 7 (đã có `backend/test/jest-e2e.json`), Vitest 3 + React Testing Library + jsdom, MSW 2, `@nestjs/config`.
- **Quyết định của người dùng:**
  - **Nhóm A (cài ngay):** chỉ cài `supabase` CLI (`^2.121.0`, devDependency ở `package.json` gốc, dùng cho `db dump` và `supabase test db`/pgTAP). **Không cài `dotenv`** vì `@nestjs/config` đã đủ nạp `.env.test`; cần thì thêm sau.
  - **Nhóm B (hoãn):** `@playwright/test`, `@axe-core/playwright` — người làm System test cài khi tới lượt (tải trình duyệt nặng, chậm CI nếu cài sớm).
  - **Nhóm C (không vào `package.json`):** Postman/Newman, k6, Lighthouse, OWASP ZAP — ai cần tự cài trên máy.
- **DB test:** người dùng tự tạo Supabase project mới (còn chỗ trong tổ chức, tạo sau). **Cách chép schema: chép 1 lần** từ DB thật bằng `supabase db dump` (chỉ đọc DB production). Hệ quả: schema DB test có thể lệch nếu production đổi, khi đó chép lại. Không kéo 34 migration về repo.
- **Đã làm:** `npm install -D supabase` → `supabase@2.121.0`. `package.json` gốc có thêm 1 dòng, `package-lock.json` đổi (+235/-12). Kiểm tra sau cài: backend `tsc --noEmit` sạch, Jest 10 suite / 310 test pass. Lưu ý CI chạy `rm -f package-lock.json && npm install` nên phải xác nhận `package.json` được stage đúng khi commit (CLAUDE.md §10).
- **Chưa làm (chờ người dùng đưa project ref DB test):** script chép schema, hàng rào chặn chạy khi `SUPABASE_URL` trỏ tới `gwbiwweeznbuqfgawywv`, helper đăng nhập (JWT + `X-Session-Id`), dữ liệu mẫu + script dọn, cấu hình Jest integration, `.env.test.example`, bước chạy test trong `ci.yml`, ví dụ mẫu + hướng dẫn. Secret DB test để ở `backend/.env.test` (bị `.gitignore` chặn), không đưa vào repo.
- **Quy ước đã đề xuất cho cả nhóm:** chia theo sheet module; tên test trùng mã case trong Excel; cột Procedure ghi `Automated – <spec>`; chỉ một người điền file xlsx (file nhị phân, không gộp được qua git).

### §76 — Tiến độ DB test (21/10/2026, cuối phiên)

- Project Supabase test đã tạo: `drevszfpovyinzauwuou` (tên "S.T.A.V.E - testing db", org S.T.A.V.E free, Asia-Pacific). Key/secret đặt ở `backend/.env.test` và `frontend/.env.test.local` (cả hai bị `.gitignore` chặn, đã xác nhận bằng `git check-ignore`). `backend/.env.test.example` (để trống) được commit; `.gitignore` gốc thêm `!.env.test.example` vì `.env.*` chặn cả file này.
- Lưu ý bảo mật: người dùng đã dán key + mật khẩu DB test vào khung chat nên chúng nằm trong transcript. Chấp nhận được vì là DB test không có dữ liệu thật; nếu muốn sạch hơn thì rotate key trên dashboard test sau khi xong.
- Chép schema: đã thử `supabase link` (workdir ở scratchpad, không ghi vào repo) + `supabase db dump --linked --schema public` từ DB thật (chỉ đọc; CLI tạo role đăng nhập tạm ở production). **Bị chặn: Docker Desktop chưa chạy** (CLI dump qua Docker). Việc tiếp theo: bật Docker Desktop, chạy lại dump, rồi áp schema vào DB test. Không dùng MCP `mcp__supabase__*` để ghi vào DB test vì server đó trỏ production (`gwbiwweeznbuqfgawywv`).

### §76 — Hạ tầng integration test đã xong (21/10/2026, cuối phiên)

- **DB test** `drevszfpovyinzauwuou`: đã áp schema `public` từ production bằng `supabase db dump` (qua Docker, chỉ đọc production) rồi `psql` vào pooler Tokyo `aws-0-ap-northeast-1.pooler.supabase.com` (host trực tiếp `db.<ref>.supabase.co` chỉ có IPv6 nên Docker Desktop không tới được). Kết quả khớp bản dump: 29 bảng, 29 bảng bật RLS, 80 policy, 20 hàm, 3 trigger, `service_role` có SELECT trên mọi bảng. Đã tạo thủ công 2 bucket Storage (`audio-sketches` 20MB, `custom-sounds` 10MB, chỉ WAV) và 1 dòng `platform_settings` (`custom_sound_quota_bytes` = 52428800). Dump không có dữ liệu người dùng.
- **Script làm mới:** `scripts/test-db/sync-schema.sh [--reset]` (cần Docker + `SUPABASE_ACCESS_TOKEN`). Từ chối chạy nếu ref test trùng production; thư mục làm việc `.tools/test-db-work` (gitignore) tự xoá khi xong. Đã chạy thật với `--reset`, ra lại đúng 29 bảng. Sự cố trong lúc làm: lần đầu `--reset` xoá schema rồi áp lỗi vì thư mục `mktemp` của Git Bash không mount được vào Docker; đã sửa sang `.tools` + `pwd -W` và khôi phục DB test.
- **Hàng rào chống chạm production:** `backend/src/test-utils/test-database-guard.ts` (+ `.spec.ts`, 9 test) từ chối nếu thiếu `TEST_DB_PROJECT_REF`, ref hoặc URL là production, URL không khớp ref, hoặc service key (giải mã JWT) cấp cho project khác / không phải `service_role`. `backend/test/support/load-test-env.ts` nạp `backend/.env.test` đè `process.env` rồi gọi hàng rào. Lưu ý: `AppModule` vẫn đọc `backend/.env` (production) nhưng biến đã có trong `process.env` thắng. **Không dùng `npm run test:e2e` cũ** (không có hàng rào).
- **Helper dùng chung** ở `backend/test/support/`: `test-app.ts`, `test-users.ts` (`createTestUser` đi qua luồng thật: Auth admin → đăng nhập REST → `/auth/sync-profile` → `/auth/sessions`; `cleanupTestUsers`), `test-api.ts` (`asUser`, `createProject`), `test-admin-client.ts`, `uuid-shim.ts` (`uuid` 14 chỉ có ESM nên Jest map sang `crypto.randomUUID`). Email test luôn `it-<tag>-<random>@stave-test.invalid`; `TEST_RUN_TAG` để mỗi người có tiền tố riêng.
- **Chạy:** `cd backend && npm run test:int` (cấu hình `backend/test/jest-integration.json`, `*.int-spec.ts`, `--runInBand`). Mẫu: `backend/test/users.int-spec.ts` (6 case `IT-USR-01..06`, chạy thật trên DB test: 6/6 pass, DB test sạch sau khi chạy). Hướng dẫn cho nhóm: `docs/testing/integration-test-guide.md`.
- **Kiểm tra cuối:** backend `tsc --noEmit` sạch, ESLint sạch trên file mới, Jest unit 11 suite / 319 test pass, integration 1 suite / 6 test pass.
- **File cấu hình:** `backend/.env.test` và `frontend/.env.test.local` (gitignore); `backend/.env.test.example` thêm `TEST_RUN_TAG`, `TEST_DB_POOLER_HOST`; `.gitignore` gốc thêm `!.env.test.example`; `backend/package.json` thêm script `test:int`.
- **Chưa làm / việc treo:** bước integration test trong `ci.yml` (cần đưa key DB test vào GitHub Secrets, chưa làm); chưa có test dọn file Storage; nên rotate key + mật khẩu DB test vì đã lộ trong chat (DB test không có dữ liệu thật); mã `IT-xxx` trong test mẫu là tạm, cần đối chiếu với ID thật khi nhóm điền `Report5_Test Report.xlsx`.
- **CI integration (21/10/2026, theo yêu cầu người dùng):** `ci.yml` có job `backend-integration` chạy `npm run test:int`. Job tự bỏ qua (xanh) nếu chưa có secret. Cần đặt 4 GitHub Secrets: `TEST_SUPABASE_URL`, `TEST_SUPABASE_SERVICE_ROLE_KEY`, `TEST_SUPABASE_ANON_KEY`, `TEST_DB_PROJECT_REF`. `load-test-env.ts` chấp nhận biến từ môi trường khi không có file `.env.test` (hàng rào vẫn chạy). PR từ fork không có secret nên job bị bỏ qua. Người dùng quyết định không cần rotate key DB test.
