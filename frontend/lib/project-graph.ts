import { getBranchHistory, listProjectBranches } from "./api-client";
import type { Branch, BranchHistoryCommit } from "./api-client";

export interface HistoryBatch {
  commits: Map<string, BranchHistoryCommit>;
  failed: boolean;
}

export async function fetchHistories(branches: Branch[]): Promise<HistoryBatch> {
  const results = await Promise.allSettled(branches.map((b) => getBranchHistory(b.id)));
  const commits = new Map<string, BranchHistoryCommit>();
  let failed = false;
  for (const r of results) {
    if (r.status === "fulfilled") {
      for (const c of r.value.commits) commits.set(c.id, c);
    } else {
      failed = true;
    }
  }
  return { commits, failed };
}

export async function loadProjectGraph(projectId: string): Promise<HistoryBatch & { branches: Branch[] }> {
  const branches = await listProjectBranches(projectId);
  return { branches, ...(await fetchHistories(branches)) };
}
