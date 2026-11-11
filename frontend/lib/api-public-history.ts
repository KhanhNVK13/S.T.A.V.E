import { apiFetch } from "./api-client";
import type { SnapshotDiff } from "./api-client";

export interface PublicHistoryAuthor {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
}

export interface PublicBranch {
  id: string;
  name: string;
  is_default: boolean;
  head_commit_id: string | null;
}

export interface PublicCommitItem {
  id: string;
  branch_id: string;
  parent_commit_id: string | null;
  merged_from_commit_id: string | null;
  message: string;
  created_at: string;
  author: PublicHistoryAuthor;
}

export interface PublicCommitPage {
  items: PublicCommitItem[];
  total: number;
  page: number;
  totalPages: number;
  limit: number;
}

export async function getPublicBranches(projectId: string): Promise<PublicBranch[]> {
  return apiFetch<PublicBranch[]>(`/explore/projects/${projectId}/branches`);
}

export async function getPublicCommits(
  projectId: string,
  params: { branchId?: string; page?: number; limit?: number } = {},
): Promise<PublicCommitPage> {
  const query = new URLSearchParams();
  if (params.branchId) query.set("branchId", params.branchId);
  if (params.page) query.set("page", String(params.page));
  if (params.limit) query.set("limit", String(params.limit));
  const qs = query.toString();
  return apiFetch<PublicCommitPage>(`/explore/projects/${projectId}/commits${qs ? `?${qs}` : ""}`);
}

export async function getPublicDiff(projectId: string, base: string, target: string): Promise<SnapshotDiff> {
  const query = new URLSearchParams({ base, target });
  return apiFetch<SnapshotDiff>(`/explore/projects/${projectId}/diff?${query.toString()}`);
}
