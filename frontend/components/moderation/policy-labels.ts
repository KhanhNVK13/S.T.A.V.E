import type { ModerationPolicy } from "@stave/shared-types";
import type { TKey } from "../../lib/i18n";

export const MODERATION_POLICY_LABEL_KEYS = {
  copyright: "rpt.policy.copyright",
  hateful_content: "rpt.policy.hateful_content",
  sexual_content: "rpt.policy.sexual_content",
  harassment: "rpt.policy.harassment",
  spam: "rpt.policy.spam",
  other: "rpt.policy.other",
} as const satisfies Record<ModerationPolicy, TKey>;
