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
}): Promise<PublicProjectsResponse> {
  const searchParams = new URLSearchParams();
  if (params?.page) searchParams.set('page', String(params.page));
  if (params?.limit) searchParams.set('limit', String(params.limit));
  if (params?.genre) searchParams.set('genre', params.genre);
  if (params?.tag) searchParams.set('tag', params.tag);
  if (params?.sort) searchParams.set('sort', params.sort);

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
