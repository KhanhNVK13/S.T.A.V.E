# Archive — Đợt thiết kế lại UI đầu (16/09/2026), Audio Sketch, Custom Sound, bảng trạng thái §36

> Nhật ký bất biến, giữ nguyên văn từ PROJECT_STATE gốc. Số §N giữ nguyên để tra chéo với CLAUDE.md.

> **Lưu ý:** §26–§30 mô tả hệ theme đổi được lúc chạy (preset unleashed/moss/claret). Hệ đó đã bị gỡ hoàn toàn (xem §140, 04/11/2026). Chỉ còn một bộ màu "space". §36 là bảng trạng thái chụp ngày 16/09/2026, số liệu tiến độ đã cũ; chỉ giữ để tra cứu các mục treo J/K.

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
