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
    throw new ApiError(res.status, message);
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
import type { DraftSnapshot } from "@stave/shared-types";

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
