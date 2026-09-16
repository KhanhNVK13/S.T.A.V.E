import { supabase } from "./supabase-browser";
import type {
  PublicProjectCard,
  PublicUserProfile as SharedPublicUserProfile,
  PublicFeaturedContent,
} from "@stave/shared-types";

const API_URL = process.env.NEXT_PUBLIC_API_URL!;
const SESSION_ID_KEY = "stave_session_id";

export function getStoredSessionId(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(SESSION_ID_KEY);
}

export function setStoredSessionId(sessionId: string): void {
  window.localStorage.setItem(SESSION_ID_KEY, sessionId);
}

export function clearStoredSessionId(): void {
  window.localStorage.removeItem(SESSION_ID_KEY);
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    /**
     * Nguyên body JSON của response lỗi. Cần cho những endpoint dùng chính
     * body lỗi làm dữ liệu nghiệp vụ — rõ nhất là `POST /branches/merge`:
     * khi có xung đột, backend ném `ConflictException(result)` nên toàn bộ
     * danh sách conflict nằm trong body 409 chứ không phải trong `message`.
     */
    public body?: unknown,
  ) {
    super(message);
  }
}

/** Calls the NestJS backend, attaching the Supabase access token + STAVE session id. */
export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const accessToken = data.session?.access_token;
  const sessionId = getStoredSessionId();

  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
  if (sessionId) headers.set("X-Session-Id", sessionId);

  const res = await fetch(`${API_URL}${path}`, { ...options, headers });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    const message = Array.isArray(body.message)
      ? body.message.join(", ")
      : (body.message ?? `Request failed (${res.status})`);
    throw new ApiError(res.status, message, body);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export interface UpdateProjectPayload {
  name?: string;
  description?: string;
  genre?: string;
}

export interface CreateProjectPayload {
  name: string;
  description?: string | null;
  genre?: string | null;
}

export async function listProjects(): Promise<unknown[]> {
  return apiFetch<unknown[]>("/projects");
}

export async function getProject(id: string): Promise<unknown> {
  return apiFetch<unknown>(`/projects/${id}`);
}

export async function createProject(payload: CreateProjectPayload): Promise<unknown> {
  return apiFetch<unknown>("/projects", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateProject(
  id: string,
  payload: UpdateProjectPayload,
): Promise<void> {
  await apiFetch<void>(`/projects/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function archiveProject(id: string): Promise<void> {
  await apiFetch<void>(`/projects/${id}/archive`, {
    method: "PATCH",
  });
}

export async function unarchiveProject(id: string): Promise<void> {
  await apiFetch<void>(`/projects/${id}/unarchive`, {
    method: "PATCH",
  });
}

export async function deleteProject(id: string): Promise<void> {
  await apiFetch<void>(`/projects/${id}`, {
    method: "DELETE",
  });
}

export type ProjectVisibility = 'private' | 'public';

export interface Project {
  id: string;
  owner_id: string;
  name: string;
  description: string | null;
  visibility: ProjectVisibility;
  license: string | null;
  forked_from_project_id: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  moderation_hidden_at: string | null;
  moderation_hidden_reason: string | null;
  play_count: number;
  genre: string | null;
}

export async function setProjectVisibility(
  id: string,
  visibility: ProjectVisibility,
): Promise<Project> {
  return apiFetch<Project>(`/projects/${id}/visibility`, {
    method: "PATCH",
    body: JSON.stringify({ visibility }),
  });
}

// ============================================
// Public API (no auth required)
// ============================================

export type PublicProject = PublicProjectCard;

export interface PublicProjectsResponse {
  items: PublicProject[];
  total: number;
  page: number;
  totalPages: number;
  limit: number;
}

export type PublicUserProfile = SharedPublicUserProfile;

export type FeaturedContent = PublicFeaturedContent;

/** UC-08: Browse public projects with filters */
export async function listPublicProjects(params?: {
  page?: number;
  limit?: number;
  genre?: string;
  tag?: string;
  sort?: 'newest' | 'popular' | 'most_played';
  search?: string;
}): Promise<PublicProjectsResponse> {
  const searchParams = new URLSearchParams();
  if (params?.page) searchParams.set('page', String(params.page));
  if (params?.limit) searchParams.set('limit', String(params.limit));
  if (params?.genre) searchParams.set('genre', params.genre);
  if (params?.tag) searchParams.set('tag', params.tag);
  if (params?.sort) searchParams.set('sort', params.sort);
  if (params?.search) searchParams.set('search', params.search);

  const query = searchParams.toString();
  return apiFetch<PublicProjectsResponse>(`/explore/projects${query ? `?${query}` : ''}`);
}

/** UC-09: Get public project detail */
export async function getPublicProject(id: string): Promise<PublicProject> {
  return apiFetch<PublicProject>(`/explore/projects/${id}`);
}

/** UC-10: Get public user profile */
export async function getPublicUserProfile(id: string): Promise<PublicUserProfile> {
  return apiFetch<PublicUserProfile>(`/explore/users/${id}`);
}

/** UC-10: Get public projects of a user */
export async function getUserPublicProjects(id: string): Promise<PublicProject[]> {
  return apiFetch<PublicProject[]>(`/explore/users/${id}/projects`);
}

/** UC-11: Get project rankings */
export async function getProjectRankings(type?: 'trending' | 'top_forked' | 'top_played'): Promise<PublicProject[]> {
  const query = type ? `?type=${type}` : '';
  return apiFetch<PublicProject[]>(`/explore/rankings${query}`);
}

/** UC-12: Get featured content for landing page */
export async function getFeaturedContent(): Promise<FeaturedContent> {
  return apiFetch<FeaturedContent>('/explore/featured');
}

// ============================================
// Draft API (MIDI Editor)
// ============================================
import type { DraftNote, DraftSnapshot, DraftTrack } from "@stave/shared-types";

export type { DraftSnapshot };

/** GET /projects/:id/draft — load draft snapshot */
export async function getDraft(projectId: string): Promise<DraftSnapshot> {
  return apiFetch<DraftSnapshot>(`/projects/${projectId}/draft`);
}

/** PUT /projects/:id/draft — save draft snapshot (auto-save) */
export async function putDraft(projectId: string, snapshot: DraftSnapshot): Promise<void> {
  await apiFetch<void>(`/projects/${projectId}/draft`, {
    method: "PUT",
    body: JSON.stringify(snapshot),
  });
}

// ============================================
// Version Control API (UC-42, UC-43, UC-44, UC-46)
// ============================================
import type {
  CommitRow,
  CommitWithAuthor,
  PaginatedCommitHistory,
  TagRow,
} from "@stave/shared-types";

export type { CommitRow, CommitWithAuthor, PaginatedCommitHistory, TagRow };

/**
 * Giới hạn mirror lại DTO backend (`create-commit.dto.ts` BR-39,
 * `tag-commit.dto.ts` BR-44) để UI hiện bộ đếm ký tự / chặn sớm.
 * Server vẫn là nơi xác thực cuối cùng — client chỉ chặn cho đỡ 1 vòng mạng.
 */
export const COMMIT_MESSAGE_MAX_LENGTH = 200;
export const TAG_NAME_MAX_LENGTH = 30;

/**
 * 1 branch của project. Hình dạng lấy đúng từ `BranchesService.getProjectBranches`
 * (cột thật của bảng `branches` + author lồng vào) — không có `head_commit_id`
 * ở mọi branch cũ nào chưa từng commit (null).
 */
export interface Branch {
  id: string;
  project_id: string;
  name: string;
  is_default: boolean;
  created_by: string;
  created_at: string;
  base_commit_id: string | null;
  head_commit_id: string | null;
  /**
   * UC-48: branch editor đang mở. CHỈ `listProjectBranches` trả về trường này
   * — các endpoint trả 1 branch lẻ (`createBranch`, `switchBranch`) để
   * undefined, đừng dựa vào nó ở đó.
   */
  is_active?: boolean;
  author: {
    id: string;
    username: string | null;
    display_name: string | null;
    avatar_url: string | null;
  };
}

/** GET /projects/:projectId/branches — danh sách branch (branch mặc định đứng đầu). */
export async function listProjectBranches(projectId: string): Promise<Branch[]> {
  return apiFetch<Branch[]>(`/projects/${projectId}/branches`);
}

// ---------------------------------------------------------------------------
// Branch Management — UC-47…52 (hình dạng lấy đúng từ `BranchesService`)
// ---------------------------------------------------------------------------

/** Số commit nhánh này đi trước/đi sau nhánh mặc định. */
export interface BranchDivergence {
  ahead: number;
  behind: number;
}

export interface BranchDetails {
  branchInfo: Branch;
  divergence: BranchDivergence;
  isMerged: boolean;
}

export interface BranchDeletePreview {
  branchId: string;
  branchName: string;
  isDefault: boolean;
  unmergedCommitsCount: number;
  unmergedCommitIds: string[];
}

/**
 * POST /projects/:projectId/branches — UC-47.
 * `startCommitId`/`sourceBranchId` đều tuỳ chọn: bỏ trống thì backend tạo từ
 * head của branch mặc định.
 */
export async function createBranch(
  projectId: string,
  payload: { name: string; startCommitId?: string; sourceBranchId?: string },
): Promise<Branch> {
  return apiFetch<Branch>(`/projects/${projectId}/branches`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/** GET /branches/:id — UC-49, kèm ahead/behind so với nhánh mặc định. */
export async function getBranchDetails(branchId: string): Promise<BranchDetails> {
  return apiFetch<BranchDetails>(`/branches/${branchId}`);
}

/** GET /branches/:id/delete-preview — UC-52, cho biết sẽ mất bao nhiêu commit. */
export async function getBranchDeletePreview(
  branchId: string,
): Promise<BranchDeletePreview> {
  return apiFetch<BranchDeletePreview>(`/branches/${branchId}/delete-preview`);
}

/** DELETE /branches/:id — UC-52. Backend từ chối nhánh mặc định / nhánh đang active. */
export async function deleteBranch(branchId: string): Promise<void> {
  await apiFetch<void>(`/branches/${branchId}`, { method: "DELETE" });
}

/** Kết quả `POST /branches/switch` — branch mới + draft của chính nó. */
export interface SwitchBranchResult {
  branch: Branch;
  /**
   * Draft của branch vừa chuyển tới. Branch chưa từng có draft thì backend
   * dựng từ snapshot của head commit, không phải trả về rỗng.
   */
  activeSnapshot: DraftSnapshot;
}

/**
 * POST /branches/switch — UC-48.
 *
 * `currentDraft` là BẮT BUỘC: CLAUDE.md §4.2 chốt "chuyển branch = lưu draft
 * cũ, khôi phục draft branch mới", nên backend lưu bản nháp đang mở xuống
 * branch cũ ngay trong lời gọi này — bỏ trống là mất mọi sửa đổi chưa commit.
 * Cũng vì vậy KHÔNG cần `flushDraft()` trước: chính payload này là bản lưu.
 */
export async function switchBranch(payload: {
  currentBranchId: string;
  targetBranchId: string;
  currentDraft: DraftSnapshot;
}): Promise<SwitchBranchResult> {
  return apiFetch<SwitchBranchResult>("/branches/switch", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

// ---------------------------------------------------------------------------
// Merge — UC-51 + UC-86 (giải quyết xung đột note-level)
// ---------------------------------------------------------------------------

export interface MergeNoteConflict {
  noteId: string;
  baseNote?: DraftNote;
  sourceNote?: DraftNote;
  targetNote?: DraftNote;
  type: "MODIFIED_DIFFERENTLY" | "DELETE_VS_MODIFY";
}

/** Body của response 409 khi merge có xung đột — gom theo số ô nhịp (bar). */
export interface MergeConflictResult {
  hasConflicts: true;
  conflictsCount: number;
  conflictsByBar: Record<string, MergeNoteConflict[]>;
}

export interface MergeSuccessResult {
  hasConflicts: false;
  commit: CommitRow;
}

export type ConflictChoice = "PICK_SOURCE" | "PICK_TARGET" | "PICK_CUSTOM";

/**
 * POST /branches/merge — UC-51.
 *
 * Khi có xung đột backend KHÔNG trả 200 mà ném 409 với nguyên kết quả xung đột
 * trong body, nên hàm này tự bóc body 409 ra thành giá trị trả về bình thường
 * (`hasConflicts: true`) — nơi gọi chỉ phải phân nhánh theo `hasConflicts`,
 * không phải bắt lỗi để đọc dữ liệu nghiệp vụ.
 */
export async function mergeBranches(payload: {
  sourceBranchId: string;
  targetBranchId: string;
  expectedTargetHeadCommitId?: string;
}): Promise<MergeSuccessResult | MergeConflictResult> {
  try {
    return await apiFetch<MergeSuccessResult>("/branches/merge", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  } catch (err) {
    if (err instanceof ApiError && err.status === 409) {
      const body = err.body as { hasConflicts?: boolean } | undefined;
      // 409 cũng được dùng cho "head đã đổi" (optimistic lock) — chỉ bóc body
      // khi đúng là kết quả xung đột note-level.
      if (body?.hasConflicts) return body as MergeConflictResult;
    }
    throw err;
  }
}

/** POST /branches/merge/resolve — UC-86, gửi lựa chọn cho từng note xung đột. */
export async function resolveMergeConflicts(payload: {
  sourceBranchId: string;
  targetBranchId: string;
  resolutions: { noteId: string; choice: ConflictChoice }[];
  message?: string;
  expectedTargetHeadCommitId?: string;
}): Promise<MergeSuccessResult> {
  return apiFetch<MergeSuccessResult>("/branches/merge/resolve", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export interface CreateCommitPayload {
  branch_id: string;
  message: string;
  /**
   * UC-42 exception 6.E1: head_commit_id mà client tin là hiện tại. Nếu lệch
   * (tab khác/người khác vừa commit) backend trả 409 thay vì ghi đè ngầm.
   */
  expectedHeadCommitId?: string;
}

/**
 * POST /commits — UC-42.
 *
 * CỐ Ý KHÔNG gửi `snapshot`: backend sẽ lấy snapshot từ bảng `drafts` của
 * branch. Lý do thật (không phải suy đoán): `DraftSnapshotDto.meta` trong
 * `create-commit.dto.ts` không có decorator validate nào, nên
 * `ValidationPipe({ whitelist: true })` sẽ **cắt bỏ** `meta` khỏi payload và
 * commit sẽ mất tempo/ppq/timeSignature thật (rơi về mặc định 120/4-4/480);
 * `DraftNoteDto` cũng đòi `startTime` trong khi snapshot thật dùng `start`.
 * Đường đi qua draft (`PUT /projects/:id/draft`, DTO validate đầy đủ) là
 * đường duy nhất giữ nguyên vẹn snapshot → phải flush draft TRƯỚC khi gọi hàm này.
 */
export async function createCommit(payload: CreateCommitPayload): Promise<CommitRow> {
  return apiFetch<CommitRow>("/commits", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/** GET /commits?branch_id=…&page=…&limit=… — UC-43, mới nhất trước. */
export async function getCommitHistory(params: {
  branchId: string;
  page?: number;
  limit?: number;
}): Promise<PaginatedCommitHistory> {
  const search = new URLSearchParams({ branch_id: params.branchId });
  if (params.page) search.set("page", String(params.page));
  if (params.limit) search.set("limit", String(params.limit));
  return apiFetch<PaginatedCommitHistory>(`/commits?${search.toString()}`);
}

/** GET /commits/:id — UC-43, chi tiết 1 commit (kèm author + tag + snapshot). */
export async function getCommit(commitId: string): Promise<CommitWithAuthor> {
  return apiFetch<CommitWithAuthor>(`/commits/${commitId}`);
}

// ---------------------------------------------------------------------------
// UC-45 Compare versions — hình dạng lấy đúng từ `backend/src/commits/diff.service.ts`
// ---------------------------------------------------------------------------

export interface SnapshotMetaChange {
  field: "tempo" | "timeSignature" | "ppq";
  old: unknown;
  new: unknown;
}

export interface SnapshotDiff {
  areIdentical: boolean;
  metaChanges: SnapshotMetaChange[];
  summary: {
    notes: { added: number; removed: number; modified: number; totalChanges: number };
    tracks: { added: number; removed: number; modified: number };
  };
  tracksDiff: {
    added: DraftTrack[];
    removed: DraftTrack[];
    modified: { old: DraftTrack; new: DraftTrack }[];
    /** Số note của track thêm/xoá nguyên cả track — các note đó KHÔNG nằm trong `changesByBar` (3.E2). */
    noteCounts: Record<string, number>;
  };
  /** Khoá là số ô nhịp, ĐÃ đánh số từ 1. */
  changesByBar: Record<
    string,
    {
      added: DraftNote[];
      removed: DraftNote[];
      modified: { old: DraftNote; new: DraftNote }[];
    }
  >;
}

/** GET /commits/diff — UC-45. `base` là mốc, `target` là bản đem ra so. */
export async function compareCommits(
  baseCommitId: string,
  targetCommitId: string,
): Promise<SnapshotDiff> {
  const search = new URLSearchParams({ baseCommitId, targetCommitId });
  return apiFetch<SnapshotDiff>(`/commits/diff?${search.toString()}`);
}

// ---------------------------------------------------------------------------
// UC-50 View branch history
// ---------------------------------------------------------------------------

export interface BranchHistoryCommit {
  id: string;
  branch_id: string;
  message: string;
  created_at: string;
  /** Commit sinh ra trên nhánh này, sau điểm rẽ khỏi nhánh mặc định. */
  isUniqueToBranch: boolean;
  /** Commit kế thừa từ trước điểm rẽ nhánh. Với nhánh mặc định luôn là `true`. */
  isInherited: boolean;
  author: {
    id: string;
    username: string | null;
    display_name: string | null;
    avatar_url: string | null;
  };
  tags: { id: string; name: string }[];
}

export interface BranchHistory {
  branchId: string;
  branchName: string;
  /** Cũ nhất trước. */
  commits: BranchHistoryCommit[];
}

/** GET /branches/:id/history — UC-50, gồm cả commit kế thừa từ điểm rẽ nhánh. */
export async function getBranchHistory(branchId: string): Promise<BranchHistory> {
  return apiFetch<BranchHistory>(`/branches/${branchId}/history`);
}

/**
 * POST /commits/:id/restore — UC-46.
 * BR-47: KHÔNG xoá lịch sử — tạo commit MỚI mang snapshot của commit cũ,
 * đồng thời backend reset draft của branch về đúng snapshot đó.
 * Trả về commit mới (đã kèm `snapshot` để client đồng bộ lại editor).
 */
export async function restoreCommit(
  commitId: string,
  payload: { branch_id: string; message?: string },
): Promise<CommitRow> {
  return apiFetch<CommitRow>(`/commits/${commitId}/restore`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/**
 * POST /commits/:id/tag — UC-44.
 * BR-44: tên tag unique trong phạm vi project và mỗi commit chỉ mang tối đa 1
 * tag — cả 2 đều do unique constraint dưới DB quyết định, client KHÔNG tự đoán
 * trùng (không đủ dữ liệu), cứ gọi và hiện lỗi 409 thật nếu có.
 */
export async function tagCommit(commitId: string, tag: string): Promise<TagRow> {
  return apiFetch<TagRow>(`/commits/${commitId}/tag`, {
    method: "POST",
    body: JSON.stringify({ tag }),
  });
}

// ============================================
// Personalization — UC-78 (preset theme)
// ============================================

/**
 * Khoá preset phải khớp đúng các khối `[data-theme="…"]` trong `app/globals.css`
 * VÀ danh sách `PRESET_THEME_KEYS` phía backend (`users/dto/set-theme.dto.ts`).
 */
export type PresetThemeKey = "unleashed" | "moss" | "claret";

export interface ActiveTheme {
  type: "preset" | "custom";
  presetKey: string | null;
  generatedPalette: Record<string, string> | null;
}

/** GET /users/me/theme — `null` nghĩa là chưa từng chọn, dùng preset mặc định. */
export async function getMyTheme(): Promise<ActiveTheme | null> {
  return apiFetch<ActiveTheme | null>("/users/me/theme");
}

/** PUT /users/me/theme — UC-78, lưu theo tài khoản nên bền qua mọi thiết bị (POST-3). */
export async function setMyTheme(presetKey: PresetThemeKey): Promise<ActiveTheme> {
  return apiFetch<ActiveTheme>("/users/me/theme", {
    method: "PUT",
    body: JSON.stringify({ presetKey }),
  });
}

// ============================================
// Audio Sketch — UC-53/54/55
// ============================================

export interface AudioSketch {
  id: string;
  project_id: string;
  created_by: string;
  name: string;
  /** Đường dẫn trong bucket (`{project_id}/{sketch_id}.wav`), không phải URL công khai. */
  file_url: string;
  duration_sec: number;
  size_bytes: number;
  /** UC-54 — mốc phát lại; file gốc luôn được giữ nguyên. */
  trim_start_sec: number;
  trim_end_sec: number | null;
  created_at: string;
  /** Link nghe có thời hạn (bucket là private). */
  playbackUrl: string | null;
}

/**
 * Xin quyền upload 1 sketch mới. Backend kiểm quyền edit (BR-26) + giới hạn
 * 3 phút/10MB (BR-56) rồi mới cấp token; file sau đó đi THẲNG từ trình duyệt
 * lên Supabase Storage, không qua backend.
 */
export async function createSketchUploadUrl(
  projectId: string,
  payload: { durationSec: number; sizeBytes: number },
): Promise<{ sketchId: string; path: string; token: string }> {
  return apiFetch(`/projects/${projectId}/audio-sketches/upload-url`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/** UC-55 — gắn sketch đã upload vào project. */
export async function attachAudioSketch(
  projectId: string,
  payload: {
    sketchId: string;
    name: string;
    durationSec: number;
    sizeBytes: number;
    trimStartSec?: number;
    trimEndSec?: number;
  },
): Promise<AudioSketch> {
  return apiFetch(`/projects/${projectId}/audio-sketches`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/** Danh sách sketch của project (kèm link nghe có thời hạn). */
export async function listAudioSketches(projectId: string): Promise<AudioSketch[]> {
  return apiFetch(`/projects/${projectId}/audio-sketches`);
}
