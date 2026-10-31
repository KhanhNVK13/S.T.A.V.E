import { apiFetch } from "./api-client";
import type {
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
