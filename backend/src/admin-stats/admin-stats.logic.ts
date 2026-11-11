import { BadRequestException } from '@nestjs/common';
import {
  STATS_MAX_RANGE_DAYS,
  type StatsGranularity,
  type StatsPeriod,
} from '@stave/shared-types';

const DAY_MS = 86_400_000;
const DEFAULT_RANGE_DAYS = 30;
const DAILY_MAX_DAYS = 31;
const WEEKLY_MAX_DAYS = 180;

export interface ResolvedPeriod {
  period: StatsPeriod;
  fromTs: string;
  toTs: string;
  previousFromTs: string;
  previousToTs: string;
}

function startOfUtcDay(ms: number): number {
  return Math.floor(ms / DAY_MS) * DAY_MS;
}

function parseDay(value: string): number {
  const ms = Date.parse(`${value}T00:00:00.000Z`);
  if (Number.isNaN(ms)) throw new BadRequestException('Invalid date');
  return ms;
}

function isoDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function granularityFor(days: number): StatsGranularity {
  if (days <= DAILY_MAX_DAYS) return 'day';
  if (days <= WEEKLY_MAX_DAYS) return 'week';
  return 'month';
}

export function resolvePeriod(
  from: string | undefined,
  to: string | undefined,
  now: number = Date.now(),
): ResolvedPeriod {
  const today = startOfUtcDay(now);
  const toDay = to ? parseDay(to) : today;
  const fromDay = from
    ? parseDay(from)
    : toDay - (DEFAULT_RANGE_DAYS - 1) * DAY_MS;

  if (fromDay > toDay) {
    throw new BadRequestException(
      'The start date must not be after the end date',
    );
  }
  const days = Math.round((toDay - fromDay) / DAY_MS) + 1;
  if (days > STATS_MAX_RANGE_DAYS) {
    throw new BadRequestException(
      `The period can be at most ${STATS_MAX_RANGE_DAYS} days`,
    );
  }

  const toExclusive = toDay + DAY_MS;
  return {
    period: {
      from: isoDay(fromDay),
      to: isoDay(toDay),
      granularity: granularityFor(days),
    },
    fromTs: new Date(fromDay).toISOString(),
    toTs: new Date(toExclusive).toISOString(),
    previousFromTs: new Date(fromDay - days * DAY_MS).toISOString(),
    previousToTs: new Date(fromDay).toISOString(),
  };
}
