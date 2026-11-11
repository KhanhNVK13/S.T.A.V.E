import type {
  AdminReportListResponse,
  RemovalImpact,
  RemoveProjectResult,
  ReportDetail,
  ReportPreview,
  ReportStatusFilter,
  RestoreProjectResponse,
} from "@stave/shared-types";
import { apiFetch } from "./api-client";

export const ADMIN_REPORTS_PAGE_SIZE = 20;

export function listReportGroups(
  status: ReportStatusFilter,
  page: number,
  limit: number = ADMIN_REPORTS_PAGE_SIZE,
): Promise<AdminReportListResponse> {
  const params = new URLSearchParams({ status, page: String(page), limit: String(limit) });
  return apiFetch<AdminReportListResponse>(`/admin/reports?${params.toString()}`);
}

export function getReportDetails(projectId: string, status: ReportStatusFilter): Promise<ReportDetail[]> {
  const params = new URLSearchParams({ status });
  return apiFetch<ReportDetail[]>(`/admin/reports/${encodeURIComponent(projectId)}?${params.toString()}`);
}

export function getReportPreview(projectId: string): Promise<ReportPreview> {
  return apiFetch<ReportPreview>(`/admin/reports/${encodeURIComponent(projectId)}/preview`);
}

export function getRemovalImpact(projectId: string): Promise<RemovalImpact> {
  return apiFetch<RemovalImpact>(`/admin/reports/${encodeURIComponent(projectId)}/removal-impact`);
}

export interface RemoveProjectPayload {
  reason: string;
  policy: string;
  removeSoundIds?: string[];
}

export function removeProject(projectId: string, payload: RemoveProjectPayload): Promise<RemoveProjectResult> {
  return apiFetch<RemoveProjectResult>(`/admin/reports/${encodeURIComponent(projectId)}/remove`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function restoreProject(projectId: string, reason: string): Promise<RestoreProjectResponse> {
  return apiFetch<RestoreProjectResponse>(`/admin/projects/${encodeURIComponent(projectId)}/restore`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}
