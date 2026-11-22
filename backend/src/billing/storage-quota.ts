import {
  EXTRA_STORAGE_KEY,
  MAX_EXTRA_STORAGE_MB,
} from '../admin-billing/dto/create-plan.dto';

const BYTES_PER_MB = 1024 * 1024;

export function extraStorageBytes(
  features: Record<string, unknown> | null | undefined,
): number {
  const value = Number(features?.[EXTRA_STORAGE_KEY]);
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.min(Math.floor(value), MAX_EXTRA_STORAGE_MB) * BYTES_PER_MB;
}
