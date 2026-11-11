import type {
  AdminReportListResponse,
  DismissReportsResponse,
  ModerationPolicy,
  RemoveReportedProjectResponse,
  ReportDetail,
  ReportPreview,
  ReportRemovalContext,
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

export function getRemovalContext(projectId: string): Promise<ReportRemovalContext> {
  return apiFetch<ReportRemovalContext>(`/admin/reports/${encodeURIComponent(projectId)}/removal-context`);
}

export function removeReportedProject(
  projectId: string,
  body: { reason: string; policy: ModerationPolicy; removeSoundIds: string[] },
): Promise<RemoveReportedProjectResponse> {
  return apiFetch<RemoveReportedProjectResponse>(`/admin/reports/${encodeURIComponent(projectId)}/remove`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function dismissReports(
  projectId: string,
  body: { reportIds: string[]; reason: string },
): Promise<DismissReportsResponse> {
  return apiFetch<DismissReportsResponse>(`/admin/reports/${encodeURIComponent(projectId)}/dismiss`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function restoreReportedProject(projectId: string): Promise<RestoreProjectResponse> {
  return apiFetch<RestoreProjectResponse>(`/admin/reports/${encodeURIComponent(projectId)}/restore`, {
    method: "POST",
  });
}
