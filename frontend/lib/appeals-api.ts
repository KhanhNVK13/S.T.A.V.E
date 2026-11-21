import type { AppealListResponse, AppealStatus, RemovedProject } from "@stave/shared-types";
import { apiFetch } from "./api-client";

export const ADMIN_APPEALS_PAGE_SIZE = 20;

export function listRemovedProjects(): Promise<RemovedProject[]> {
  return apiFetch<RemovedProject[]>("/moderation/removed-projects");
}

export function appealRemoval(projectId: string, statement: string): Promise<{ id: string }> {
  return apiFetch<{ id: string }>(`/moderation/removed-projects/${encodeURIComponent(projectId)}/appeal`, {
    method: "POST",
    body: JSON.stringify({ statement }),
  });
}

export function listAppeals(
  status: AppealStatus,
  page: number,
  limit: number = ADMIN_APPEALS_PAGE_SIZE,
): Promise<AppealListResponse> {
  const params = new URLSearchParams({ status, page: String(page), limit: String(limit) });
  return apiFetch<AppealListResponse>(`/admin/appeals?${params.toString()}`);
}

export function resolveAppeal(
  appealId: string,
  decision: "uphold" | "reject",
  note: string,
): Promise<{ status: "upheld" | "rejected"; restoredForks: number }> {
  return apiFetch<{ status: "upheld" | "rejected"; restoredForks: number }>(
    `/admin/appeals/${encodeURIComponent(appealId)}/${decision}`,
    { method: "POST", body: JSON.stringify({ note }) },
  );
}
