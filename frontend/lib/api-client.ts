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

export interface ProjectDeletePreview {
  branchCount: number;
  commitCount: number;
}

export async function getProjectDeletePreview(id: string): Promise<ProjectDeletePreview> {
  return apiFetch<ProjectDeletePreview>(`/projects/${id}/delete-preview`);
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

/** GET /projects/:id/draft/recovery — nháp có phải thay đổi chưa commit được khôi phục không. */
export async function getDraftRecovery(
  projectId: string,
): Promise<{ recovered: boolean; savedAt: string | null; version: string | null }> {
  return apiFetch<{ recovered: boolean; savedAt: string | null; version: string | null }>(
    `/projects/${projectId}/draft/recovery`,
  );
}

/**
 * PUT /projects/:id/draft — lưu nháp (autosave).
 * `expectedVersion`: phiên bản nháp tab này đã biết (`null` = lúc đọc chưa có
 * nháp); lệch thì backend trả 409 `DRAFT_STALE`. Bỏ trống = ghi đè không kiểm tra.
 */
export async function putDraft(
  projectId: string,
  snapshot: DraftSnapshot,
  expectedVersion?: string | null,
): Promise<{ version: string | undefined }> {
  const headers: Record<string, string> = {};
  if (expectedVersion !== undefined) headers["X-Draft-Version"] = expectedVersion ?? "none";
  const result = await apiFetch<{ version?: string } | undefined>(`/projects/${projectId}/draft`, {
    method: "PUT",
    headers,
    body: JSON.stringify(snapshot),
  });
  return { version: result?.version };
}

export function isDraftStaleError(err: unknown): boolean {
  return (
    err instanceof ApiError &&
    err.status === 409 &&
    (err.body as { code?: string } | undefined)?.code === "DRAFT_STALE"
  );
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
      const body = err.body as
        | { hasConflicts?: boolean; conflicts?: MergeConflictResult }
        | undefined;
      // 409 cũng được dùng cho "head đã đổi" (optimistic lock) — chỉ bóc body
      // khi đúng là kết quả xung đột note-level. Backend đặt kết quả trong
      // khoá `conflicts`; vẫn nhận body phẳng để không phụ thuộc hình dạng cũ.
      if (body?.conflicts?.hasConflicts) return body.conflicts;
      if (body?.hasConflicts) return body as unknown as MergeConflictResult;
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
  parent_commit_id: string | null;
  merged_from_commit_id?: string | null;
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

export type AvatarContentType = "image/jpeg" | "image/png" | "image/webp";

export async function createAvatarUploadUrl(
  contentType: AvatarContentType,
): Promise<{ path: string; token: string }> {
  return apiFetch("/users/me/avatar/upload-url", {
    method: "POST",
    body: JSON.stringify({ contentType }),
  });
}

export async function confirmAvatar(path: string): Promise<{ avatar_url: string | null }> {
  return apiFetch("/users/me/avatar/confirm", {
    method: "POST",
    body: JSON.stringify({ path }),
  });
}

export async function removeAvatar(): Promise<void> {
  await apiFetch("/users/me/avatar", { method: "DELETE" });
}

/** DELETE /commits/:id/tags/:tagName — UC-44. */
export async function deleteCommitTag(commitId: string, tagName: string): Promise<void> {
  await apiFetch<void>(`/commits/${commitId}/tags/${encodeURIComponent(tagName)}`, {
    method: "DELETE",
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

/** UC-117 — xoá vĩnh viễn một sketch cùng file ghi âm. */
export async function deleteAudioSketch(projectId: string, sketchId: string): Promise<void> {
  await apiFetch<void>(`/projects/${projectId}/audio-sketches/${sketchId}`, {
    method: "DELETE",
  });
}

/** Danh sách sketch của project (kèm link nghe có thời hạn). */
export async function listAudioSketches(projectId: string): Promise<AudioSketch[]> {
  return apiFetch(`/projects/${projectId}/audio-sketches`);
}

// ============================================
// Custom Sound — UC-56/58/59/118
// ============================================

export interface CustomSound {
  id: string;
  name: string;
  durationSec: number;
  sizeBytes: number;
  source: "uploaded" | "recorded";
  createdAt: string;
  playbackUrl: string | null;
}

export interface CustomSoundLibrary {
  items: CustomSound[];
  usedBytes: number;
  quotaBytes: number;
}

export async function createCustomSoundUploadUrl(payload: {
  durationSec: number;
  sizeBytes: number;
}): Promise<{ soundId: string; path: string; token: string }> {
  return apiFetch("/users/me/custom-sounds/upload-url", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function confirmCustomSoundUpload(payload: {
  soundId: string;
  name: string;
  source: "uploaded" | "recorded";
}): Promise<CustomSound> {
  return apiFetch("/users/me/custom-sounds", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function listCustomSounds(): Promise<CustomSoundLibrary> {
  return apiFetch("/users/me/custom-sounds");
}

export interface CustomSoundUsage {
  externalProjectCount: number;
  externalProjects: { id: string; name: string }[];
  privateProjectCount: number;
}

export async function getCustomSoundUsage(
  soundId: string,
): Promise<CustomSoundUsage> {
  return apiFetch(`/users/me/custom-sounds/${soundId}/usage`);
}

export async function renameCustomSound(soundId: string, name: string): Promise<CustomSound> {
  return apiFetch<CustomSound>(`/users/me/custom-sounds/${soundId}`, {
    method: "PATCH",
    body: JSON.stringify({ name }),
  });
}

export async function deleteCustomSound(
  soundId: string,
  mode: "self" | "hard",
): Promise<{ removed: boolean; affectedProjects: number }> {
  return apiFetch(`/users/me/custom-sounds/${soundId}?mode=${mode}`, {
    method: "DELETE",
  });
}

export interface ResolvedCustomSound {
  id: string;
  name: string | null;
  playable: boolean;
  reason: "missing" | "deleted" | null;
  playbackUrl: string | null;
}

export async function resolveProjectCustomSounds(
  projectId: string,
  ids: string[],
): Promise<ResolvedCustomSound[]> {
  if (ids.length === 0) return [];
  return apiFetch(`/projects/${projectId}/custom-sounds?ids=${ids.map(encodeURIComponent).join(",")}`);
}

export interface NotificationItem {
  id: string;
  type: string;
  payload: { title?: string; body?: string } & Record<string, unknown>;
  read_at: string | null;
  created_at: string;
}

export type NotificationFilter = "all" | "unread" | "mentions";

export async function listNotifications(params: {
  filter: NotificationFilter;
  cursor?: string | null;
}): Promise<{ items: NotificationItem[]; nextCursor: string | null }> {
  const query = new URLSearchParams({ filter: params.filter });
  if (params.cursor) query.set("cursor", params.cursor);
  return apiFetch(`/notifications?${query.toString()}`);
}

export async function getUnreadNotificationCount(): Promise<number> {
  const result = await apiFetch<{ count: number }>("/notifications/unread-count");
  return result.count;
}

export async function openNotification(
  id: string,
): Promise<{ ok: true; href: string | null } | { ok: false }> {
  return apiFetch(`/notifications/${id}/open`, { method: "POST" });
}

export async function markAllNotificationsRead(): Promise<void> {
  await apiFetch("/notifications/read-all", { method: "POST" });
}

export type NotificationChannel = "in_app" | "email";

export interface NotificationPreference {
  type: string;
  label: string;
  category: string;
  mandatory: boolean;
  channels: Record<NotificationChannel, boolean>;
}

export async function getNotificationPreferences(): Promise<NotificationPreference[]> {
  return apiFetch("/notifications/preferences");
}

export async function setNotificationPreference(payload: {
  type: string;
  channel: NotificationChannel;
  enabled: boolean;
}): Promise<void> {
  await apiFetch("/notifications/preferences", {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function forkProject(projectId: string): Promise<{ id: string }> {
  return apiFetch(`/projects/${projectId}/fork`, { method: "POST" });
}

// ---------------------------------------------------------------------------
// Pull request
// ---------------------------------------------------------------------------

export type PullRequestStatus = "open" | "merged" | "closed";

export interface PullRequestUser {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
}

export interface PullRequestListItem {
  id: string;
  number: number;
  title: string;
  status: PullRequestStatus;
  author: PullRequestUser | null;
  sourceProjectName: string | null;
  targetProjectName: string | null;
  sourceBranchName: string | null;
  targetBranchName: string | null;
  createdAt: string;
  closedAt: string | null;
  newCommitCount: number;
  hasConflicts: boolean;
  applicable: boolean;
}

export interface PullRequestPreview {
  targetProjectName: string;
  newCommitCount: number;
  notes: { added: number; removed: number; modified: number; totalChanges: number };
  tracks: { added: number; removed: number; modified: number };
  conflictsCount: number;
  hasConflicts: boolean;
}

export interface PullRequestComment {
  id: string;
  pull_request_id: string;
  author_id: string;
  body: string;
  created_at: string;
  author: PullRequestUser | null;
}

export interface PullRequestDetail {
  pullRequest: {
    id: string;
    number: number;
    title: string;
    description: string;
    status: PullRequestStatus;
    created_at: string;
    closed_at: string | null;
    merge_branch_id: string | null;
    source_project_id: string | null;
    target_project_id: string | null;
    source_project_name: string | null;
    target_project_name: string | null;
    source_branch_name: string | null;
    target_branch_name: string | null;
    author: PullRequestUser | null;
    applicable: boolean;
    targetOwnerId: string | null;
  };
  analysis: {
    baseCommitId: string;
    newCommits: {
      id: string;
      message: string;
      createdAt: string;
      author: PullRequestUser | null;
    }[];
    summary: SnapshotDiff;
    targetChanges: SnapshotDiff;
    conflictsCount: number;
    conflictsByBar: Record<string, MergeNoteConflict[]>;
  } | null;
  analysisError: string | null;
  comments: PullRequestComment[];
  permissions: { canMerge: boolean; canClose: boolean; canComment: boolean };
}

export async function previewPullRequest(
  projectId: string,
  sourceBranchId: string,
  targetBranchId: string,
): Promise<PullRequestPreview> {
  const query = new URLSearchParams({ sourceBranchId, targetBranchId });
  return apiFetch(`/projects/${projectId}/pull-requests/preview?${query.toString()}`);
}

export async function createPullRequest(
  projectId: string,
  payload: { sourceBranchId: string; targetBranchId: string; title: string; description: string },
): Promise<{ id: string; number: number }> {
  return apiFetch(`/projects/${projectId}/pull-requests`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function listProjectPullRequests(
  projectId: string,
  status?: PullRequestStatus,
): Promise<PullRequestListItem[]> {
  const query = status ? `?status=${status}` : "";
  return apiFetch(`/projects/${projectId}/pull-requests${query}`);
}

export async function listPullRequests(params: {
  view: "incoming" | "created";
  status?: PullRequestStatus;
}): Promise<PullRequestListItem[]> {
  const query = new URLSearchParams({ view: params.view });
  if (params.status) query.set("status", params.status);
  return apiFetch(`/pull-requests?${query.toString()}`);
}

export async function getPullRequest(id: string): Promise<PullRequestDetail> {
  return apiFetch(`/pull-requests/${id}`);
}

export async function commentPullRequest(id: string, body: string): Promise<PullRequestComment> {
  return apiFetch(`/pull-requests/${id}/comments`, {
    method: "POST",
    body: JSON.stringify({ body }),
  });
}

export async function deletePullRequestComment(id: string, commentId: string): Promise<void> {
  await apiFetch(`/pull-requests/${id}/comments/${commentId}`, { method: "DELETE" });
}

export async function closePullRequest(id: string, comment?: string): Promise<void> {
  await apiFetch(`/pull-requests/${id}/close`, {
    method: "POST",
    body: JSON.stringify({ comment }),
  });
}

export async function mergePullRequest(
  id: string,
): Promise<{ ok: true; mergeCommitId: string } | MergeConflictResult> {
  try {
    return await apiFetch(`/pull-requests/${id}/merge`, { method: "POST", body: JSON.stringify({}) });
  } catch (err) {
    if (err instanceof ApiError && err.status === 409) {
      const body = err.body as { conflicts?: MergeConflictResult } | undefined;
      if (body?.conflicts?.hasConflicts) return body.conflicts;
    }
    throw err;
  }
}

export async function resolvePullRequestConflicts(
  id: string,
  resolutions: { noteId: string; choice: ConflictChoice }[],
): Promise<void> {
  await apiFetch(`/pull-requests/${id}/merge/resolve`, {
    method: "POST",
    body: JSON.stringify({ resolutions }),
  });
}

export async function getPullRequestTargetBranches(projectId: string): Promise<{
  targetProjectId: string;
  targetProjectName: string;
  branches: { id: string; name: string; is_default: boolean }[];
}> {
  return apiFetch(`/projects/${projectId}/pull-requests/target-branches`);
}
