import type { PlanChangeKind } from '@stave/shared-types';

export function classifyChange(
  currentPriceVnd: number,
  targetPriceVnd: number,
): PlanChangeKind {
  return targetPriceVnd > currentPriceVnd ? 'upgrade' : 'downgrade';
}
