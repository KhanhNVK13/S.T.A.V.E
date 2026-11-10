import type { ActivityPage, ActivityType } from "@stave/shared-types";
import { apiFetch } from "./api-client";

export interface ActivityQuery {
  from?: string;
  to?: string;
  type?: ActivityType;
  limit?: number;
  cursor?: string | null;
}

export function getUserActivity(
  userId: string,
  query: ActivityQuery = {},
  signal?: AbortSignal,
): Promise<ActivityPage> {
  const params = new URLSearchParams();
  if (query.from) params.set("from", query.from);
  if (query.to) params.set("to", query.to);
  if (query.type) params.set("type", query.type);
  if (query.limit !== undefined) params.set("limit", String(query.limit));
  if (query.cursor) params.set("cursor", query.cursor);
  const search = params.toString();
  return apiFetch<ActivityPage>(
    `/admin/users/${encodeURIComponent(userId)}/activity${search ? `?${search}` : ""}`,
    { signal },
  );
}
