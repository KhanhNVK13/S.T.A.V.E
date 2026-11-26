import type { ReportReason, ReportStatusFilter } from "@stave/shared-types";
import { apiFetch } from "./api-client";
import type { Lang } from "./i18n";

export type ModerationTriagePriority = "low" | "medium" | "high";

export type ModerationTriageCategory =
  | "copyright_claim"
  | "abusive_language"
  | "inappropriate_content"
  | "spam"
  | "insufficient_info"
  | "other";

export interface ModerationTriageMetrics {
  reportCount: number;
  reporterCount: number;
  hasCopyrightClaim: boolean;
  reasonCounts: Record<ReportReason, number>;
}

export interface ModerationTriageResult {
  priority: ModerationTriagePriority;
  categories: ModerationTriageCategory[];
  summary: string | null;
  recommendedCheck: string | null;
  explanationSource: "ai" | "rule";
  metrics: ModerationTriageMetrics;
}

export async function requestModerationTriage(
  payload: {
    projectId: string;
    status?: ReportStatusFilter;
    lang?: Lang;
  },
  signal?: AbortSignal,
): Promise<ModerationTriageResult> {
  return apiFetch<ModerationTriageResult>("/ai/moderation-triage", {
    method: "POST",
    body: JSON.stringify(payload),
    signal,
  });
}
