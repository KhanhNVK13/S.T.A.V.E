# Archive — Test Report Round 1 (làm lại) và bắt đầu chuyển thiết kế Staff Universe (04–05/11/2026)

> Nhật ký bất biến, giữ nguyên văn từ PROJECT_STATE gốc. Số §N giữ nguyên để tra chéo với CLAUDE.md.

## §136 — Làm lại Round 1 của Test Report: Bước 0 và 1 (04/11/2026)

- **Quyết định của người dùng:** Round 1 phải phản ánh toàn bộ chương trình hiện có; ca cần người tự kiểm (âm thanh, micro, Google, thiết bị, PayOS, hiệu năng) để **Pending, không ghi lý do vào Excel**, chỉ ghi danh sách ở PROJECT_STATE; chức năng chỉ có nền xem như chưa có (Pending); lỗi thật ghi Failed kèm DFID, **không sửa code trong đợt này** (sửa rồi chạy lại ở Round 2); DB test đồng bộ sạch.
- **Bước 0 xong:** làm việc trên `main` (87da5fa); `sync-schema.sh --reset` thành công (DB test `drevszfpovyinzauwuou`, 34 bảng, đã seed bucket và platform_settings). `docs/Report5_Test Report.xlsx`: Round 2 (I/J/K) và Round 1 cũ (F/G) của cả 806 ca đã đưa về `Pending` / để trống, giữ nguyên cột tester (H) và Note (O). Sửa trực tiếp XML. Bản gốc: `C:\Users\MYPC\Downloads\stave-backups\Report5_Test Report.before-round1-redo.xlsx`.
- **Bước 1 (phân loại 806 ca, chờ người dùng duyệt):** A1 đã có test E2E/API (268, gồm ca email dùng stack local), A2 chức năng có nhưng chưa có test (269), B cần người kiểm (127), C chưa có chức năng hoặc chỉ có nền (142: UC-70/71, 73–77, 79, 100–114). Danh sách từng ca ở `C:\Users\MYPC\Downloads\stave-backups\test-report-classification.csv`.
- **Ca nhóm B (Pending, người dùng tự kiểm):** nghe âm thanh 43, micro 31, Google/OAuth 24, thiết bị/trình duyệt 18, hiệu năng k6/Lighthouse 7, PayOS 3, ghi chú "(Manual)" khác 10 (một ca có thể thuộc nhiều loại).

## §140 — Chuyển toàn bộ thiết kế prototype sang bản chính thức: G0 (04/11/2026)

- **Quyết định của người dùng:** (1) trang sau đăng nhập dùng **thanh bên**, trang công khai giữ thanh ngang, editor không dùng thanh bên mà có **thanh ngang mới riêng**; (2) **bỏ hẳn** hệ đổi theme và các preset `unleashed`/`moss`/`claret` (làm lại sau dưới dạng theme tuỳ chỉnh từ ảnh, UC-79); (3) mọi thiết kế cũ phải biến mất hoàn toàn, không để hai hệ song song.
- **Đối chiếu code (G0):**
  - `globals.css`: `:root, [data-theme="unleashed"]` là bộ sáng cũ; `[data-theme="moss"]` (dòng 86), `[data-theme="claret"]` (99), `[data-theme="space"]` (120). `layout.tsx` đã gắn cứng `data-theme="space"`, nên mọi người dùng đang thấy bộ space; bộ sáng chỉ hiện khi chọn preset khác.
  - Frontend dính theme: `context/theme-context.tsx` (`ThemeProvider`, `useTheme`), `components/settings/theme-picker.tsx`, `app/profile/page.tsx` (tab Cá nhân hoá), `lib/api-client.ts` (`getMyTheme`/`setMyTheme`/`PresetThemeKey`), khoá i18n `theme.*`, `ui/dialog.tsx` (biến thể `[[data-theme=space]_&]`), và 4 chỗ `MutationObserver` theo dõi `data-theme` (`galaxy/palette.ts`, `jam/jam-sky.tsx`, `midi-editor/piano-roll.tsx`, `midi-editor/velocity-lane.tsx`).
  - Backend: `users.controller` (`GET|PUT me/theme`), `users.service` (bảng `themes`, `users.active_theme_id`), `set-theme.dto.ts` (`PRESET_THEME_KEYS = space|unleashed|moss|claret`) và spec tương ứng. **Quyết định: để nguyên, ngủ đông** cho UC-79 (không đổi hành vi backend nên không lệch Round 1; không migration). Người dùng có thể đã lưu `moss`/`claret`: frontend phải bỏ qua mọi giá trị đã lưu.
  - E2E bị ảnh hưởng: `auth.spec.ts` AUTH-054 (tab Cá nhân hoá + 3 preset) sẽ hỏng khi gỡ tab. Việc sửa test thuộc chat testing; không sửa trong các PR redesign.
- **CLAUDE.md 4.7 đã cập nhật** (bullet "Chỉ còn một giao diện", "Khung điều hướng", IA `/profile` còn 2 tab, editor có thanh ngang riêng).
- **Quy trình nhánh:** người dùng tạo nhánh tích hợp (đề xuất `feature/redesign-integration`); các phiên cloud mở PR vào nhánh tích hợp, không vào `main`; chỉ merge vào `main` sau Round 1, rồi chạy Round 2 cho cả chương trình.
- **Kế hoạch G1–G7:** G1 nền tảng (token một bộ màu, `AppShell` + shell công khai + thanh ngang editor, viết lại `components/ui/*` tại chỗ, gỡ theme), G2 project/projects/new/settings, G3 compare+merge thành trang + pull request, G4 công khai (explore, rankings, creator, jam), G5 tài khoản/auth/admin/notifications, G6 editor+help, G7 dọn cuối (xoá component cũ, `frontend/redesign/`, kiểm bằng grep).

## §145 — Test Report Round 1: xong Bước 4–6 (05/11/2026)

- **Lượt chạy cuối:** pha A 483 kết quả, lệch 6; pha B 34, lệch 1. Chạy lại các ca lệch:
  - BRN-007 và PR-021 là lỗi locator của test, đã sửa.
  - NFR-039: test chọn file trước khi editor gắn xong trình xử lý. Đã sửa bằng cách chọn lại file trong `toPass`; logic chặn 5 MB của app vẫn đúng.
  - COL-039 và PR-038 hết giờ do DB test chậm; chạy lại thì đạt.
  - DISC-010 không tạo được fork, chạy lại thì đạt. Đây là cùng lỗi chập chờn DFID170, nên ghi Failed và gộp vào DFID170 cùng DISC-028.
  - JAM-014 (kỳ vọng lỗi DFID167) hết giờ thay vì báo lỗi, ghi Failed.
- **AUTH-102 và AUTH-103:** kiểm bằng Jest `backend/test/authorization.int-spec.ts`, 3/3 đạt, ghi Passed.
- **Excel `docs/Report5_Test Report.xlsx`:** điền cột F/G ngày 05/11/2026, được **352 Passed / 165 Failed / 289 Pending** (806 ca).
  - Sửa cột kỳ vọng của AUTH-021, AUTH-028, DISC-025, DISC-026 và PRJ-029.
  - Cover thêm dòng 1.1 "Round 1 results", tham chiếu DFID008–DFID171.
  - Bản trước khi điền: `scratchpad/Report5_Test Report.backup-before-round1.xlsx`.
  - Lệnh điền lại: `python scratchpad/fill_round1.py <xlsx> 05/11/2026 <report> final-A.json final-B.json rerun-final.json rerun-nfr039.json`. Kết quả ở file sau ghi đè file trước; ca ghi tay nằm trong bảng `MANUAL`.
- **Số theo từng sheet và lý do Pending:** xem `docs/testing/test-report-plan.md`, mục "Round 1 re-run".
- **`defects-list.md`:**
  - DFID009 giờ chỉ còn AUTH-041 (bỏ qua `?redirect=`), vì về Home sau khi đăng nhập là thiết kế có chủ ý.
  - DFID170 thêm DISC-010.
  - DFID135 (ảnh đại diện nhận tới 10 MB thay vì 2 MB) có thể là thay đổi có chủ ý, **chờ người dùng xác nhận**.
- **Ca Pending chờ người dùng tự test (116 ca), theo loại:**
  - **Nghe âm thanh (32):** AUD-009, 011, 021, 030, 036, 043; AUTH-106; BRN-042; COL-035; DISC-009; EDT-042, 073–076, 078, 080–082, 084, 086, 095–098, 100, 103; JAM-013; NFR-010, 031; NOT-007; PR-015.
  - **Nghe âm thanh + micro (5):** AUD-001, 002, 003, 006; EDT-108.
  - **Micro (17):** AUD-004, 005, 007, 008, 015, 016, 017, 019, 020, 054–058; AUTH-072; JAM-038; NFR-002.
  - **Thiết bị/trình duyệt thật (iOS, Safari, mobile, bàn phím MIDI) (13):**
    - AUD-028, 033, 052; AUTH-092, 093, 094, 097; EDT-017; PR-018.
    - NFR-027, 028, 029 (kèm nghe âm thanh).
    - NFR-030 (kèm micro).
  - **Đăng nhập Google (24):** AUTH-002, 011, 012, 013, 014, 022, 027, 030–034, 039, 076, 078–087. Trong đó AUTH-011, 039, 078, 083 cần cả email thật.
  - **Email thật (2):** AUTH-066; PRJ-038.
  - **Hiệu năng/tải bằng k6 hoặc Lighthouse (7):** NFR-001, 003 (kèm micro), 004–008.
  - **PayOS sandbox (3):** ADM-USR-026; AUTH-075; NFR-021.
  - **Nhóm ghi chú "(Manual)" (9):** AI-020; AUD-034, 048; DISC-029; EDT-009, 043, 079; NFR-023, 024.
  - **Khác (4):**
    - AUD-012, AUD-013 và NFR-020: cần nghe hoặc đo thật.
    - ADM-USR-028: cần một bản fork bị người khác báo cáo.
- **Pending không do người dùng (173 ca):**
  - 142 ca chưa có chức năng.
  - 23 ca chức năng có nhưng thiếu đúng hành vi mà ca cần.
  - 4 ca cần giả lỗi máy chủ.
  - 4 ca cần môi trường đã triển khai.
  - Danh sách đầy đủ ở `test-report-plan.md`.
- **Chưa commit.** Người dùng tự commit sau khi xem lại.
