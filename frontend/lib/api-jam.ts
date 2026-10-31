import { apiFetch } from "./api-client";
import type {
  AvailableJamProjectDto,
  ConfigureJamEventDto,
  JamEndEventResponse,
  JamEvent,
  JamEventListItem,
  JamEventStatus,
  JamResultResponseDto,
  JamStatePayload,
} from "@stave/shared-types";

/**
 * UC-66 — Community Jam API. Một file riêng cho module (quy tắc: không thêm
 * hàm vào `api-client.ts`); shape trả về lấy đúng từ `@stave/shared-types`
 * (mirror của `JamService` phía backend). `apiFetch` tự kèm Bearer token +
 * `X-Session-Id`.
 */

/**
 * GET /jam/events — danh sách sự kiện (mở công khai cho cả khách).
 * `status` lọc theo trạng thái HIỆU LỰC (backend đã chạy `ensureStatus`).
 */
export async function getJamEvents(
  status?: JamEventStatus,
): Promise<JamEventListItem[]> {
  const qs = status ? `?status=${status}` : "";
  return apiFetch<JamEventListItem[]>(`/jam/events${qs}`);
}

/** GET /jam/events/:id — chi tiết 1 sự kiện (khung giờ, tình trạng phòng). */
export async function getJamEvent(id: string): Promise<JamEvent> {
  return apiFetch<JamEvent>(`/jam/events/${id}`);
}

/**
 * POST /jam/events/:id/join — kiểm tra mọi điều kiện (cửa sổ thời gian, tài
 * khoản active, sức chứa) TRƯỚC khi nối socket; trả payload trạng thái đầu
 * để client vào phòng nóng. `record: false` phía server → không ghi
 * participant ảo; lượt `jam:join` thật trên socket mới là nơi ghi.
 */
export async function joinJamEvent(id: string): Promise<JamStatePayload> {
  return apiFetch<JamStatePayload>(`/jam/events/${id}/join`, {
    method: "POST",
  });
}

/**
 * GET /jam/events/:id/result (UC-68) — kết quả đóng băng của sự kiện đã
 * kết thúc: snapshot + danh sách người đóng góp. Mở công khai cho cả khách
 * (khách chỉ KHÔNG được fork — kiểm ở tầng frontend + BR-12 phía
 * backend UC-69). 404 (2.E3), 400 (2.E4 chưa kết thúc), 500 (2.E2).
 */
export async function getJamResult(
  id: string,
): Promise<JamResultResponseDto> {
  return apiFetch<JamResultResponseDto>(`/jam/events/${id}/result`);
}

// ── UC-94 — admin: cấu hình / huỷ sự kiện Jam ─────────────────────────────
// Chỉ Admin tới được (guard 3 lớp phía server). Dùng `apiFetch` trực tiếp
// (không gọi lại các hàm public trên) vì prefix là `/admin/...`.

/**
 * GET /admin/jam/events — danh sách sự kiện cho màn hình admin (kèm status
 * filter tuỳ chọn; `cancelled` hiển thị riêng trên tab "Đã huỷ").
 */
export async function adminListJamEvents(
  status?: JamEventStatus,
): Promise<JamEventListItem[]> {
  const qs = status ? `?status=${status}` : "";
  return apiFetch<JamEventListItem[]>(`/admin/jam/events${qs}`);
}

/**
 * GET /admin/jam/events/:id — chi tiết sự kiện (trường cấu hình đầy đủ).
 */
export async function adminGetJamEvent(id: string): Promise<JamEvent> {
  return apiFetch<JamEvent>(`/admin/jam/events/${id}`);
}

/**
 * PATCH /admin/jam/events/:id — cấu hình sự kiện.
 *  - `scheduled`: sửa mọi trường (name / description / start / end /
 *    starting project / cooldown).
 *  - `active`: chỉ kéo dài `scheduledEndAt` (phải ở tương lai) + cooldown
 *    (2.E1) — server broadcast `jam:end_extended` cho room đang chạy.
 *  - `ended`/`cancelled`: từ chối mọi cấu hình (2.E2).
 */
export async function adminConfigureJamEvent(
  id: string,
  patch: ConfigureJamEventDto,
): Promise<JamEvent> {
  return apiFetch<JamEvent>(`/admin/jam/events/${id}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

/**
 * DELETE /admin/jam/events/:id — huỷ một sự kiện CHƯA BẮT ĐẦU (`scheduled`).
 * Sự kiện `active` phải dùng "Kết thúc ngay" (UC-95); `ended` không huỷ được.
 */
export async function adminCancelJamEvent(id: string): Promise<{
  success: boolean;
  message: string;
}> {
  return apiFetch<{ success: boolean; message: string }>(
    `/admin/jam/events/${id}`,
    { method: "DELETE" },
  );
}

/**
 * GET /admin/jam/available-projects — danh sách dự án công khai có thể làm điểm
 * bắt đầu (BR-106).
 */
export async function adminGetAvailableJamProjects(): Promise<
  AvailableJamProjectDto[]
> {
  return apiFetch<AvailableJamProjectDto[]>("/admin/jam/available-projects");
}

// ── UC-95 — admin: kết thúc sự kiện Jam ─────────────────────────────────────

/**
 * POST /admin/jam-events/:id/end (UC-95) — force-end: đóng băng phòng, flush
 * snapshot cuối xuống `drafts`, chuyển sự kiện `ended`, ghi nhật ký quản trị
 * và phát `jam:ended` cho cả room. Chỉ Admin tới được (guard 3 lớp phía
 * server). Ngoại lệ: 3.E1 (404) / 3.E2 (409) / 3.E3 (400) / 4.E1 (500) —
 * thông báo tiếng Việt được map trong `error-message.ts`.
 */
export async function adminEndJamEvent(
  id: string,
): Promise<JamEndEventResponse> {
  return apiFetch<JamEndEventResponse>(`/admin/jam-events/${id}/end`, {
    method: "POST",
  });
}
