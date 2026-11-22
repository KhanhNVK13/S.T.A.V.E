export const TERMS_VERSION = "2026-11-21";

const GRANDFATHERED_TERMS: Record<string, string> = { "pre-terms": "2026-11-21" };

export function needsTermsAcceptance(acceptedVersion: string | null | undefined): boolean {
  if (!acceptedVersion) return true;
  if (acceptedVersion === TERMS_VERSION) return false;
  return GRANDFATHERED_TERMS[acceptedVersion] !== TERMS_VERSION;
}

export const COPYRIGHT_CLAIMANT_ROLES = ["owner", "agent"] as const;
export type CopyrightClaimantRole = (typeof COPYRIGHT_CLAIMANT_ROLES)[number];

export const COPYRIGHT_CLAIM_LIMITS = {
  claimantName: { min: 2, max: 120 },
  workDescription: { min: 10, max: 500 },
  evidence: { min: 10, max: 500 },
} as const;

export interface CopyrightClaim {
  claimantName: string;
  claimantRole: CopyrightClaimantRole;
  workDescription: string;
  evidence: string;
  goodFaith: true;
  accuracy: true;
}

export interface CopyrightForkInfo {
  projectId: string;
  ownerId: string;
  name: string;
}

export interface CopyrightTakedownContext {
  claims: (CopyrightClaim & { reportId: string; createdAt: string })[];
  forks: { projectId: string; name: string; ownerDisplayName: string | null }[];
  forksTruncated: boolean;
  priorTakedowns: number;
  sounds: { id: string; name: string }[];
  truncated: boolean;
  retentionDays: number;
}

export interface CopyrightTakedownResponse {
  closedReports: number;
  removedSounds: number;
  removedForks: number;
  retainUntil: string;
}

export const APPEAL_STATEMENT_MIN_LENGTH = 20;
export const APPEAL_STATEMENT_MAX_LENGTH = 1000;

export const APPEAL_STATUSES = ["pending", "upheld", "rejected"] as const;
export type AppealStatus = (typeof APPEAL_STATUSES)[number];

export interface RemovedProject {
  projectId: string;
  name: string;
  reason: string | null;
  policy: string | null;
  removedAt: string;
  appealDeadline: string;
  canAppeal: boolean;
  appealStatus: AppealStatus | null;
  appealNote: string | null;
}

export interface ModerationAppeal {
  id: string;
  projectId: string;
  projectName: string | null;
  appellantDisplayName: string | null;
  statement: string;
  status: AppealStatus;
  createdAt: string;
  removalReason: string | null;
  removalPolicy: string | null;
  resolutionNote: string | null;
  resolvedAt: string | null;
}

export interface AppealListResponse {
  items: ModerationAppeal[];
  total: number;
  page: number;
  limit: number;
}
