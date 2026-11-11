import type {
  AdminReportListResponse,
  DismissReportsResponse,
  ReportDetail,
  ReportPreview,
  ReportStatusFilter,
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

export interface DismissReportsPayload {
  reportIds: string[];
  reason: string;
}

export function dismissReports(projectId: string, payload: DismissReportsPayload): Promise<DismissReportsResponse> {
  return apiFetch<DismissReportsResponse>(`/admin/reports/${encodeURIComponent(projectId)}/dismiss`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getReportPreview(projectId: string): Promise<ReportPreview> {
  return apiFetch<ReportPreview>(`/admin/reports/${encodeURIComponent(projectId)}/preview`);
}
