import { supabase } from "./supabase-browser";
import type { DraftSnapshot } from "@stave/shared-types";

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

export async function deleteProject(id: string): Promise<void> {
  await apiFetch<void>(`/projects/${id}`, {
    method: "DELETE",
  });
}

export async function getDraft(projectId: string): Promise<DraftSnapshot> {
  return apiFetch<DraftSnapshot>(`/projects/${projectId}/draft`);
}

export async function putDraft(
  projectId: string,
  snapshot: DraftSnapshot,
): Promise<DraftSnapshot> {
  return apiFetch<DraftSnapshot>(`/projects/${projectId}/draft`, {
    method: "PUT",
    body: JSON.stringify(snapshot),
  });
}
