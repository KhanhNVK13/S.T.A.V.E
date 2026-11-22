import {
  COPYRIGHT_CLAIM_LIMITS,
  type CopyrightClaim,
  type CopyrightClaimantRole,
} from "@stave/shared-types";

export interface ClaimDraft {
  claimantName: string;
  claimantRole: CopyrightClaimantRole | "";
  workDescription: string;
  evidence: string;
  goodFaith: boolean;
  accuracy: boolean;
}

export const EMPTY_CLAIM: ClaimDraft = {
  claimantName: "",
  claimantRole: "",
  workDescription: "",
  evidence: "",
  goodFaith: false,
  accuracy: false,
};

function within(value: string, limit: { min: number; max: number }): boolean {
  const length = value.trim().length;
  return length >= limit.min && length <= limit.max;
}

export function isClaimComplete(draft: ClaimDraft): boolean {
  return (
    within(draft.claimantName, COPYRIGHT_CLAIM_LIMITS.claimantName) &&
    draft.claimantRole !== "" &&
    within(draft.workDescription, COPYRIGHT_CLAIM_LIMITS.workDescription) &&
    within(draft.evidence, COPYRIGHT_CLAIM_LIMITS.evidence) &&
    draft.goodFaith &&
    draft.accuracy
  );
}

export function toClaim(draft: ClaimDraft): CopyrightClaim | null {
  if (!isClaimComplete(draft) || draft.claimantRole === "") return null;
  return {
    claimantName: draft.claimantName.trim(),
    claimantRole: draft.claimantRole,
    workDescription: draft.workDescription.trim(),
    evidence: draft.evidence.trim(),
    goodFaith: true,
    accuracy: true,
  };
}
