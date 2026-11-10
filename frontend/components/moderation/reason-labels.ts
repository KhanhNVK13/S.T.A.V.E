import type { ReportReason } from "@stave/shared-types";
import type { TKey } from "../../lib/i18n";

export const REPORT_REASON_LABEL_KEYS = {
  copyright: "rpt.reason.copyright",
  inappropriate: "rpt.reason.inappropriate",
  spam: "rpt.reason.spam",
  harassment: "rpt.reason.harassment",
  other: "rpt.reason.other",
} as const satisfies Record<ReportReason, TKey>;
