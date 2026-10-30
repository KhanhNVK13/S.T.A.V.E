// =============================================================================
// Community Jam (UC-66/67/93..95, BR-74/75) — shapes shared between
// `backend/src/jam/` and `frontend/{lib,app,components}/jam/`.
//
// BR-74: version control is frozen inside a jam — no commit/branch/merge;
// the snapshot lives in server RAM and flushes to `drafts` every 5s (BR-75).
// =============================================================================

import type { DraftSnapshot } from './index';

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
  /** Tối đa 50 mục — hoạt động gần đây (client + server cùng giữ). */
  recentActivities: JamActivityItem[];
}

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
    | 'JAM_CONNECTION_FAILED';
  message: string;
}
