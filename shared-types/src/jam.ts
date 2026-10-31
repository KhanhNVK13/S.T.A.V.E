// =============================================================================
// Community Jam (UC-66/67/93..95, BR-74/75) — shapes shared between
// `backend/src/jam/` and `frontend/{lib,app,components}/jam/`.
//
// BR-74: version control is frozen inside a jam — no commit/branch/merge;
// the snapshot lives in server RAM and flushes to `drafts` every 5s (BR-75).
// =============================================================================

import type { DraftNote, DraftSnapshot } from './index';

/**
 * Trạng thái sự kiện. `scheduled`/`active`/`ended` khớp enum Postgres
 * `jam_events.status`; `cancelled` dành cho sự kiện bị admin huỷ trước giờ
 * chạy (UC-94 — chưa có DB migration riêng, giữ trong type chung).
 */
export type JamEventStatus = 'scheduled' | 'active' | 'ended' | 'cancelled';

/** Dạng trả về của `GET /jam/events` và `GET /jam/events/:id` (UC-66). */
export interface JamEvent {
  id: string;
  name: string;
  description: string | null;
  status: JamEventStatus;
  /** Giờ dự kiến bắt đầu/kết thúc (timestamptz → ISO string). */
  scheduled_start_at: string | null;
  scheduled_end_at: string | null;
  /** Trạng thái thật: điểm đã bắt đầu/kết thúc. */
  started_at: string | null;
  ended_at: string | null;
  /** Dự án riêng của sự kiện (tạo bởi admin, visibility=private). */
  jam_project_id: string | null;
  /** Dự án công khai được sao chép làm điểm khởi đầu (BR-106). */
  starting_project_id: string | null;
  /** Cooldown riêng của sự kiện (1..3600 giây); null = dùng platform_settings. */
  edit_cooldown_sec: number | null;
  /** UC-95 3.E1: kết thúc mà không ai đóng góp → không tạo commit. */
  no_result: boolean;
  /** Mốc tối đa 50 (phạm vi tối thiểu duc.md); null/undefined = mặc định. */
  max_participants: number | null;
  created_at: string;
  updated_at: string;
}

/** `GET /jam/events` — sự kiện kèm số người hiện có mặt (phòng trong RAM). */
export interface JamEventListItem extends JamEvent {
  currentParticipantCount: number;
}

/** Một người đang có mặt trong phòng Jam (gửi qua socket). */
export interface JamParticipant {
  userId: string;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  /** Socket id hiện tại của user (1 user có thể nhiều tab — mỗi tab 1 socket). */
  socketId: string;
  joinedAt: string;
  lastActiveAt: string;
}

/**
 * Trạng thái sống của 1 phòng Jam — nằm TRONG RAM của server (không phải
 * thứ đi qua mạng), mỗi sự kiện 1 bản. `snapshot` giữ đúng shape
 * `DraftSnapshot` của shared-types.
 */
export interface JamRoomState {
  jamId: string;
  projectId: string | null;
  /** Chủ sở hữu dự án Jam (admin tạo sự kiện) — khoá `user_id` của draft. */
  ownerId: string | null;
  status: 'active' | 'frozen';
  snapshot: DraftSnapshot;
  participants: Record<string, JamParticipant>;
  /** userId → lastEditAt (ms) cho kiểm cooldown (UC-67). */
  lastEditAtByUser: Record<string, number>;
  lastFlushedAt: number;
  isDirty: boolean;
  /**
   * BR-116/12.E1 — số chu kỳ sweep 5s liên tiếp flush `drafts` THẤT BẠI.
   * Khi flush lỗi, giữ `isDirty` để thử lại chu kỳ sau; đếm này tăng dần và
   * về 0 khi một lần flush thành công. Vượt `JamRoomState.MAX_FLUSH_FAILURES`
   * (3 chu kỳ ≈ 15s) → server phát `jam:storage_warning` cho client.
   */
  consecutiveFlushFailures: number;
  /** Tối đa 50 mục — hoạt động gần đây (client + server cùng giữ). */
  recentActivities: JamActivityItem[];
}

/** BR-116/12.E1: 3 chu kỳ flush liên tiếp thất bại (15s) → cảnh báo client. */
export const JAM_MAX_FLUSH_FAILURES = 3;

/** 1 dòng "ai làm gì" hiện ở cột hoạt động gần đây (UC-66, tối đa 50 mục). */
export interface JamActivityItem {
  id: string;
  userId: string;
  displayName: string | null;
  at: string;
  /** Việc đã xảy ra — `add`/`update`/`remove` là thao tác nốt (UC-67), `join`/`leave` là ra/vào phòng. */
  op: 'join' | 'leave' | 'add' | 'update' | 'remove';
  /** Chi tiết ngắn để hiển thị (tên nốt, pitch...); null nếu không có. */
  detail: string | null;
}

// ── DTOs WebSocket (namespace /jam) ──────────────────────────────────────────

/** Inbound `jam:join`. */
export interface JamJoinPayload {
  eventId: string;
}

/** Outbound `jam:state` — trạng thái đầy đủ khi vào phòng / reconnect. */
export interface JamStatePayload {
  snapshot: DraftSnapshot;
  endsAt: string | null;
  cooldownSec: number;
  participants: JamParticipant[];
  activity: JamActivityItem[];
}

/** Outbound `jam:user_joined` — broadcast cho các client khác. */
export interface JamUserJoinedPayload {
  user: JamParticipant;
  totalParticipants: number;
}

/** Outbound `jam:user_left` — broadcast cho các client khác. */
export interface JamUserLeftPayload {
  userId: string;
  totalParticipants: number;
}

/** Outbound `jam:error` — mã + thông báo (frontend hiện tiếng Việt). */
export interface JamErrorPayload {
  code:
    | 'EVENT_NOT_FOUND'
    | 'EVENT_NOT_STARTED'
    | 'EVENT_COMPLETED'
    | 'ACCOUNT_NOT_ACTIVE'
    | 'ROOM_FULL'
    | 'JAM_CONNECTION_FAILED'
    // UC-67 — các mã do thao tác chỉnh sửa vi phạm (xem bảng Exceptions):
    | 'COOLDOWN_ACTIVE' // 2.E1: gửi thao tác khi chưa hết cooldown
    | 'UNAUTHORIZED' // 3.E1: phiên/JWT hết hạn → server ngắt kết nối
    | 'JAM_EVENT_ENDED' // 5.E1: sự kiện đã kết thúc → phòng khoá chỉ đọc
    | 'JAM_ROOM_NOT_FOUND' // 5.E2: phòng không có trong RAM lẫn DB
    | 'INVALID_NOTE_DATA' // 7.E1: nốt vi phạm quy chuẩn MIDI
    | 'TRACK_NOT_FOUND'; // 7.E2: trackId không tồn tại trong snapshot
  message: string;
  /** 2.E1 — số giây cooldown còn lại (client vẽ lại đồng hồ đếm ngược). */
  remainingSeconds?: number;
  /** Tên trường bị lỗi (7.E1/7.E2) — client dùng để chọn thông báo chính xác. */
  detail?: string;
}

// ── UC-67: collaborative real-time editing ─────────────────────────────────

/**
 * Nốt nhạc theo dạng wire của UC-67. Ánh xạ 1:1 với `DraftNote` của
 * `DraftSnapshot` (bắt buộc để diff/LWW so `===` chính xác, CLAUDE.md §4.2)
 * nhưng dùng tên "tick" cho rõ ràng ở tầng socket:
 * `midi` ↔ `pitch`, `startTick` ↔ `start`, `durationTicks` ↔ `duration`.
 */
export interface JamNoteDto {
  /** UUID bền vững của nốt (CLAUDE.md §4.1) — server tự cấp khi `add`. */
  id: string;
  trackId: string;
  /** Cao độ MIDI 0–127 (DUY NHẤT trong khoảng này, BR-71). */
  midi: number;
  /** Tick bắt đầu, số nguyên ≥ 0 (BR-71). */
  startTick: number;
  /** Độ dài, số nguyên tick ≥ 1 (BR-71). */
  durationTicks: number;
  /** Velocity MIDI 1–127 (BR-71). */
  velocity: number;
}

/** Inbound `jam:edit_note` (alias `jam:edit`) — payload khách gửi lên. */
export interface EditJamNoteDto {
  /** Event id của phòng đang tham gia. */
  jamId: string;
  action: 'add' | 'update' | 'delete';
  note: JamNoteDto;
  /** Mốc client (ms) — chỉ để log; LWW dùng SERVER timestamp (BR-69). */
  clientTimestamp: number;
}

/** Outbound `jam:note_updated` — broadcast tới TOÀN bộ client trong phòng. */
export interface JamNoteUpdatedPayload {
  jamId: string;
  action: 'add' | 'update' | 'delete';
  note: JamNoteDto;
  userId: string;
  username: string | null;
  displayName: string | null;
  /** SERVER timestamp (ms) — mốc LWW (BR-69). */
  timestamp: number;
}

/**
 * Outbound `jam:cooldown_active` — 2.E1: thao tác bị từ chối vì chưa hết
 * cooldown (chỉ người gửi, kèm `remainingSeconds` để client đếm ngược).
 */
export interface JamCooldownActivePayload {
  jamId: string;
  remainingSeconds: number;
}

/** Outbound `jam:event_ended` — 5.E1/BR-70: sự kiện kết thúc, khoá chỉ đọc. */
export interface JamEventEndedPayload {
  jamId: string;
  endedAt: string;
}

/**
 * Outbound `jam:storage_warning` — 12.E1: tiến trình nền flush `drafts`
 * thất bại liên tiếp quá `JAM_MAX_FLUSH_FAILURES` chu kỳ. Bản nhạc vẫn an
 * toàn trên RAM, nhưng client phải biết. Tự hết cảnh báo khi flush thành công.
 */
export interface JamStorageWarningPayload {
  jamId: string;
  consecutiveFlushFailures: number;
}

// ── Mapping 2 chiều JamNoteDto ↔ DraftNote (BR-71, CLAUDE.md §4.2) ────────

/** `JamNoteDto` (wire) → `DraftNote` (snapshot) để áp dụng LWW vào RAM. */
export function jamNoteToDraftNote(note: JamNoteDto): DraftNote {
  return {
    id: note.id,
    trackId: note.trackId,
    pitch: note.midi,
    start: note.startTick,
    duration: note.durationTicks,
    velocity: note.velocity,
  };
}

/** `DraftNote` (snapshot) → `JamNoteDto` (wire) để broadcast `jam:note_updated`. */
export function draftNoteToJamNote(note: DraftNote): JamNoteDto {
  return {
    id: note.id,
    trackId: note.trackId,
    midi: note.pitch,
    startTick: note.start,
    durationTicks: note.duration,
    velocity: note.velocity,
  };
}

// ── UC-94: admin configuration ──────────────────────────────────────────────

/**
 * Body của `PATCH /admin/jam/events/:id` — mọi trường là optional; PATCH
 * semantics = chỉ gán lại trường admin truyền lên. Backend validate (DTO
 * class-validator phía server), frontend giữ hình mirror này để type-safe.
 */
export interface ConfigureJamEventDto {
  /** Tên sự kiện (2.E1: khoá cứng khi sự kiện đang `active`). */
  name?: string;
  description?: string;
  /** ISO 8601 (2.E1: khoá cứng khi sự kiện đang `active`). */
  scheduledStartAt?: string;
  /** ISO 8601 — 4.E1: không được trong quá khứ; sự kiện `active` chỉ cho KÉO DÀI (BR-75). */
  scheduledEndAt?: string;
  /** Dự án công khai khởi đầu (2.E1: khoá cứng khi `active`). */
  startingProjectId?: string;
  /** Cooldown riêng 1..3600 giây; null = dùng `platform_settings` (3.1: hiệu lực ngay). */
  editCooldownSec?: number;
}

/**
 * Outbound `jam:end_extended` — UC-94 BR-75: admin kéo dài giờ kết thúc sự
 * kiện đang chạy, room nhận payload để chạy lại đồng hồ đếm ngược.
 */
export interface JamEndExtendedPayload {
  eventId: string;
  newEndAt: string;
  extendedMinutes: number;
}

// ── UC-68 — Xem kết quả Jam (GET /jam/events/:id/result) ────────────────────

/** Người đóng góp vào sự kiện (từ `jam_participants.edit_count > 0`). */
export interface JamContributorDto {
  userId: string;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  /** Số thao tác nốt đã áp dụng thành công trong phiên. */
  actionCount: number;
}

/**
 * Dạng trả về của `GET /jam/events/:id/result` (UC-68). Chỉ được gọi khi sự
 * kiện đã `ended`; `hasContributions = false` kèm `snapshot: null` là tình
 * huống 2.E1 (kết thúc mà không có đóng góp — UC-95 3.E1: `no_result = true`,
 * không tạo commit).
 */
export interface JamResultResponseDto {
  eventId: string;
  name: string;
  status: 'ended';
  startedAt: string | null;
  endedAt: string | null;
  /** Dự án kết quả (archived, read-only) — đích của nút Fork (BR-76/POST-4). */
  resultingProjectId: string | null;
  hasContributions: boolean;
  snapshot: DraftSnapshot | null;
  contributors: JamContributorDto[];
}
