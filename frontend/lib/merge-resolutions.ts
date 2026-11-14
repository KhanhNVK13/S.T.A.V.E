import type { MergeResolutionRecord } from "@stave/shared-types";
import type { TKey } from "./i18n";

export type ResolutionChoice = MergeResolutionRecord["choice"];

export const RESOLUTION_ORDER: ResolutionChoice[] = ["PICK_SOURCE", "PICK_TARGET", "PICK_CUSTOM", "KEEP_BOTH"];

export const RESOLUTION_KEYS: Record<ResolutionChoice, TKey> = {
  PICK_SOURCE: "mres.PICK_SOURCE",
  PICK_TARGET: "mres.PICK_TARGET",
  PICK_CUSTOM: "mres.PICK_CUSTOM",
  KEEP_BOTH: "mres.KEEP_BOTH",
};

export function summarizeResolutions(
  records: readonly MergeResolutionRecord[] | null | undefined,
): { total: number; counts: { choice: ResolutionChoice; n: number }[] } {
  const list = records ?? [];
  const counts = RESOLUTION_ORDER.map((choice) => ({
    choice,
    n: list.filter((r) => r.choice === choice).length,
  })).filter((c) => c.n > 0);
  return { total: list.length, counts };
}
