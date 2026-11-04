# Archive — Rà soát UX/UI và Bước E sửa lỗi (29–30/09/2026), Custom Sound merge (04/10/2026)

> Nhật ký bất biến, giữ nguyên văn từ PROJECT_STATE gốc. Số §N giữ nguyên để tra chéo với CLAUDE.md.

> **Lưu ý:** báo cáo audit trước khi sửa (§41–§50) đã được loại bỏ vì bị thay thế bởi kết quả đo và sửa thật (§51–§65). Nhãn nút editor tiếng Anh ở §59 đã bị người dùng thay đổi (§139: nhãn tiếng Việt hợp lệ).

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
