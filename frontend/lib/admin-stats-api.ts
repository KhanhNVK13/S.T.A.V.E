import type { AdminOverviewStats } from "@stave/shared-types";
import { apiFetch } from "./api-client";

export function getAdminOverview(from: string, to: string, compare: boolean): Promise<AdminOverviewStats> {
  const params = new URLSearchParams({ from, to, compare: String(compare) });
  return apiFetch<AdminOverviewStats>(`/admin/stats/overview?${params.toString()}`);
}
