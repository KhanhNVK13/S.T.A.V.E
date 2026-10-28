import {
  createBranch,
  getDraft,
  listProjectBranches,
  switchBranch,
  type Branch,
} from "./api-client";

export interface CreateBranchOutcome {
  branch: Branch;
  switched: boolean;
  switchError?: unknown;
}

export async function createAndActivateBranch(
  projectId: string,
  payload: { name: string; startCommitId?: string },
): Promise<CreateBranchOutcome> {
  const branch = await createBranch(projectId, payload);
  try {
    const branches = await listProjectBranches(projectId);
    const current = branches.find((b) => b.is_active) ?? branches.find((b) => b.is_default);
    if (!current || current.id === branch.id) return { branch, switched: !!current };
    const currentDraft = await getDraft(projectId);
    await switchBranch({
      currentBranchId: current.id,
      targetBranchId: branch.id,
      currentDraft,
    });
    return { branch, switched: true };
  } catch (switchError) {
    return { branch, switched: false, switchError };
  }
}
