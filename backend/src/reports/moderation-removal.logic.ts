import {
  DEFAULT_MODERATION_RETENTION_DAYS,
  REMOVAL_REASON_MAX_LENGTH,
  REMOVAL_REASON_MIN_LENGTH,
  REMOVAL_POLICIES,
  REMOVE_SOUND_IDS_MAX,
  type RemovalPolicy,
} from '@stave/shared-types';

export const MODERATION_RETENTION_DEFAULT_DAYS =
  DEFAULT_MODERATION_RETENTION_DAYS;

function asMillis(value: unknown): number {
  const parsed = Date.parse(String(value));
  return Number.isNaN(parsed) ? 0 : parsed;
}

function retentionDaysOf(days: unknown): number {
  return Number.isInteger(days) && (days as number) > 0
    ? (days as number)
    : MODERATION_RETENTION_DEFAULT_DAYS;
}

export function retainedUntil(hiddenAt: string | Date, days: unknown): Date {
  const base = typeof hiddenAt === 'string' ? new Date(hiddenAt) : hiddenAt;
  return new Date(base.getTime() + retentionDaysOf(days) * 86_400_000);
}

/** Restorable while `now <= hiddenAt + days`, inclusive of the exact deadline. */
export function isWithinRetention(
  now: Date | string,
  hiddenAt: Date | string,
  days: unknown,
): boolean {
  const nowMillis = typeof now === 'string' ? asMillis(now) : now.getTime();
  return nowMillis <= retainedUntil(hiddenAt, days).getTime();
}

export interface RemoveRequestBody {
  reason: string;
  policy: RemovalPolicy;
  removeSoundIds: string[];
}

export interface RemoveBodyValidation {
  ok: boolean;
  errors: string[];
  body?: RemoveRequestBody;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function validateRemoveBody(
  raw:
    | {
        reason?: unknown;
        policy?: unknown;
        removeSoundIds?: unknown;
      }
    | null
    | undefined,
): RemoveBodyValidation {
  if (!raw || typeof raw !== 'object') {
    return { ok: false, errors: ['Body không hợp lệ.'] };
  }
  const errors: string[] = [];

  const reason = typeof raw.reason === 'string' ? raw.reason.trim() : '';
  if (reason.length < REMOVAL_REASON_MIN_LENGTH) {
    errors.push(
      `Lý do phải dài ít nhất ${REMOVAL_REASON_MIN_LENGTH} ký tự sau khi bỏ khoảng trắng.`,
    );
  } else if (reason.length > REMOVAL_REASON_MAX_LENGTH) {
    errors.push(`Lý do không được quá ${REMOVAL_REASON_MAX_LENGTH} ký tự.`);
  }

  const policy = raw.policy;
  if (
    typeof policy !== 'string' ||
    !(REMOVAL_POLICIES as readonly string[]).includes(policy)
  ) {
    errors.push(
      `Điều khoản phải là một trong: ${REMOVAL_POLICIES.join(', ')}.`,
    );
  }

  let removeSoundIds: string[] = [];
  if (raw.removeSoundIds !== undefined && raw.removeSoundIds !== null) {
    if (!Array.isArray(raw.removeSoundIds)) {
      errors.push('Danh sách âm thanh phải là một mảng.');
    } else {
      const unique = [...new Set(raw.removeSoundIds)];
      if (unique.length > REMOVE_SOUND_IDS_MAX) {
        errors.push(`Tối đa ${REMOVE_SOUND_IDS_MAX} âm thanh.`);
      }
      for (const id of unique) {
        if (typeof id !== 'string' || !UUID_PATTERN.test(id)) {
          errors.push(`Mã âm thanh không hợp lệ: ${String(id)}`);
          break;
        }
      }
      if (
        unique.length <= REMOVE_SOUND_IDS_MAX &&
        unique.every((id) => typeof id === 'string' && UUID_PATTERN.test(id))
      ) {
        removeSoundIds = unique;
      }
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    errors: [],
    body: { reason, policy: policy as RemovalPolicy, removeSoundIds },
  };
}

export interface SoundSplit {
  accepted: string[];
  rejected: string[];
}

/** Keeps only ids that belong to the owner-sound set; order-preserving, deduplicated. */
export function splitSoundsToRemove(
  requestedIds: readonly string[],
  ownerSoundIds: readonly string[],
): SoundSplit {
  const owner = new Set(ownerSoundIds);
  const accepted: string[] = [];
  const rejected: string[] = [];
  for (const id of new Set(requestedIds)) {
    if (owner.has(id)) accepted.push(id);
    else rejected.push(id);
  }
  return { accepted, rejected };
}
