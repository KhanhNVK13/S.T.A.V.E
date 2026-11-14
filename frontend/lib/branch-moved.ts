export const BRANCH_POLL_INTERVAL_MS = 20_000;

export function isBranchAhead(input: {
  openBranchId: string | null;
  movedBranchId: string;
  knownHeadId: string | null;
  newHeadId: string | null;
}): boolean {
  if (!input.openBranchId || input.openBranchId !== input.movedBranchId) return false;
  if (!input.newHeadId) return false;
  return input.newHeadId !== input.knownHeadId;
}
