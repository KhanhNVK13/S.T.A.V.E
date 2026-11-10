import type { CreateReportResponse, ReportReason } from "@stave/shared-types";
import { apiFetch } from "./api-client";

export interface ReportProjectPayload {
  reason: ReportReason;
  details?: string;
}

export function reportProject(
  projectId: string,
  payload: ReportProjectPayload,
): Promise<CreateReportResponse> {
  return apiFetch<CreateReportResponse>(`/projects/${encodeURIComponent(projectId)}/reports`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
