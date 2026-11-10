import { BadRequestException } from '@nestjs/common';
import { isIPv6 } from 'node:net';
import { ACTIVITY_TYPES } from '@stave/shared-types';
import type { ActivityType } from '@stave/shared-types';

export const DEFAULT_ACTIVITY_LIMIT = 50;
export const MAX_ACTIVITY_LIMIT = 100;
export const DEFAULT_ACTIVITY_WINDOW_DAYS = 30;

const ACTIVITY_TYPE_PREFIXES: Record<ActivityType, string[]> = {
  signin: ['auth.'],
  projects: ['project.'],
  subscription: ['subscription.'],
  community: ['community.'],
};

export interface ActivityCursor {
  createdAt: string;
  id: string;
}

export interface ParsedActivityQuery {
  from: string;
  to: string;
  type: ActivityType | undefined;
  limit: number;
  cursor: ActivityCursor | null;
}

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
const IPV4_WITH_PORT = /^(\d{1,3}(?:\.\d{1,3}){3}):(\d*)$/;
const BRACKETED_IPV6 = /^\[([^\]]+)\](?::(\d*))?$/;
const CIDR_SUFFIX = /^(.+)\/(\d{1,3})$/;
const PORT = /^\d{1,5}$/;
const MAX_PORT = 65535;
const MAX_IPV4_PREFIX = 32;
const MAX_IPV6_PREFIX = 128;

const CURSOR_TOKEN = /^[A-Za-z0-9_-]+$/;
const MAX_CURSOR_LENGTH = 512;
const CURSOR_TIMESTAMP =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
const DIGITS = /^\d+$/;

function maskIpv4(value: string): string | null {
  const match = IPV4.exec(value);
  if (!match) return null;
  const octets = match.slice(1, 5).map(Number);
  if (octets.some((octet) => octet > 255)) return null;
  return `${octets[0]}.${octets[1]}.${octets[2]}.*`;
}

function expandIpv6(value: string): number[] | null {
  const [head, tail, ...rest] = value.split('::');
  if (rest.length > 0) return null;
  const toGroups = (part: string | undefined): string[] =>
    part ? part.split(':') : [];
  const headGroups = toGroups(head);
  const tailGroups = toGroups(tail);
  const missing = 8 - headGroups.length - tailGroups.length;
  if (tail === undefined ? missing !== 0 : missing < 1) return null;
  const groups = [
    ...headGroups,
    ...(tail === undefined ? [] : Array<string>(missing).fill('0')),
    ...tailGroups,
  ];
  const numbers = groups.map((group) => parseInt(group, 16));
  return numbers.length === 8 && numbers.every((n) => !Number.isNaN(n))
    ? numbers
    : null;
}

function maskIpv6(value: string): string | null {
  const withoutZone = value.split('%')[0];
  if (!isIPv6(withoutZone)) return null;
  const groups = expandIpv6(withoutZone);
  if (!groups) return null;
  const mapped =
    groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff;
  if (mapped) {
    return `${groups[6] >> 8}.${groups[6] & 0xff}.${groups[7] >> 8}.*`;
  }
  return `${groups[0].toString(16)}:${groups[1].toString(16)}:${groups[2].toString(16)}::*`;
}

function isValidPort(port: string): boolean {
  return PORT.test(port) && Number(port) <= MAX_PORT;
}

function maskHost(host: string): string | null {
  let address = host;
  let prefix: number | null = null;
  if (host.includes('/')) {
    const cidr = CIDR_SUFFIX.exec(host);
    if (!cidr) return null;
    address = cidr[1];
    prefix = Number(cidr[2]);
  }

  const mappedDotted = /^::ffff:(.+)$/i.exec(address);
  if (mappedDotted && IPV4.test(mappedDotted[1])) {
    if (prefix !== null && prefix > MAX_IPV6_PREFIX) return null;
    return maskIpv4(mappedDotted[1]);
  }

  if (IPV4.test(address)) {
    if (prefix !== null && prefix > MAX_IPV4_PREFIX) return null;
    return maskIpv4(address);
  }

  if (prefix !== null && prefix > MAX_IPV6_PREFIX) return null;
  return maskIpv6(address);
}

export function maskIp(ip: string | null | undefined): string | null {
  if (typeof ip !== 'string') return null;
  const value = ip.trim();
  if (value === '') return null;

  const bracketed = BRACKETED_IPV6.exec(value);
  if (bracketed) {
    if (bracketed[2] !== undefined && !isValidPort(bracketed[2])) return null;
    return maskHost(bracketed[1]);
  }

  const withPort = IPV4_WITH_PORT.exec(value);
  if (withPort) return isValidPort(withPort[2]) ? maskHost(withPort[1]) : null;

  return maskHost(value);
}

export function prefixesForType(type?: ActivityType): string[] | null {
  if (type === undefined) return null;
  return [...ACTIVITY_TYPE_PREFIXES[type]];
}

function isRealTimestamp(value: string): boolean {
  const match = CURSOR_TIMESTAMP.exec(value);
  if (!match) return false;
  const [year, month, day, hour, minute, second] = match
    .slice(1, 7)
    .map(Number);
  if (month < 1 || month > 12 || hour > 23 || minute > 59 || second > 59) {
    return false;
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function encodeCursor(cursor: ActivityCursor): string {
  return Buffer.from(
    JSON.stringify({ createdAt: cursor.createdAt, id: cursor.id }),
  ).toString('base64url');
}

export function decodeCursor(cursor: string): ActivityCursor {
  const invalid = () => new BadRequestException('Activity cursor is invalid');
  if (
    typeof cursor !== 'string' ||
    cursor.length > MAX_CURSOR_LENGTH ||
    !CURSOR_TOKEN.test(cursor)
  ) {
    throw invalid();
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    throw invalid();
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw invalid();
  }
  const { createdAt, id } = parsed as Record<string, unknown>;
  if (
    typeof createdAt !== 'string' ||
    typeof id !== 'string' ||
    !isRealTimestamp(createdAt) ||
    !UUID.test(id)
  ) {
    throw invalid();
  }
  return { createdAt, id };
}

function singleValue(
  query: Record<string, unknown>,
  key: string,
  error: string,
): string | undefined {
  const value = query[key];
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw new BadRequestException(error);
  return value;
}

function parseBound(value: string, edge: 'start' | 'end', error: string): Date {
  const dateOnly = DATE_ONLY.exec(value);
  if (dateOnly) {
    const [year, month, day] = dateOnly.slice(1, 4).map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (
      date.getUTCFullYear() !== year ||
      date.getUTCMonth() !== month - 1 ||
      date.getUTCDate() !== day
    ) {
      throw new BadRequestException(error);
    }
    if (edge === 'end') date.setUTCHours(23, 59, 59, 999);
    return date;
  }
  if (!isRealTimestamp(value)) throw new BadRequestException(error);
  return new Date(value);
}

export function parseActivityQuery(
  query: Record<string, unknown>,
  now: Date = new Date(),
): ParsedActivityQuery {
  const rangeError = 'Activity date range is invalid';
  const rawFrom = singleValue(query, 'from', rangeError);
  const rawTo = singleValue(query, 'to', rangeError);

  const to = rawTo === undefined ? now : parseBound(rawTo, 'end', rangeError);
  const from =
    rawFrom === undefined
      ? new Date(to.getTime() - DEFAULT_ACTIVITY_WINDOW_DAYS * 86_400_000)
      : parseBound(rawFrom, 'start', rangeError);
  if (from.getTime() > to.getTime()) throw new BadRequestException(rangeError);

  const limitError = 'Activity limit is invalid';
  const rawLimit = singleValue(query, 'limit', limitError);
  let limit = DEFAULT_ACTIVITY_LIMIT;
  if (rawLimit !== undefined) {
    if (!DIGITS.test(rawLimit)) throw new BadRequestException(limitError);
    limit = Number(rawLimit);
    if (limit < 1 || limit > MAX_ACTIVITY_LIMIT) {
      throw new BadRequestException(limitError);
    }
  }

  const typeError = 'Activity type is invalid';
  const rawType = singleValue(query, 'type', typeError);
  let type: ActivityType | undefined;
  if (rawType !== undefined) {
    if (!(ACTIVITY_TYPES as readonly string[]).includes(rawType)) {
      throw new BadRequestException(typeError);
    }
    type = rawType as ActivityType;
  }

  const rawCursor = singleValue(query, 'cursor', 'Activity cursor is invalid');
  return {
    from: from.toISOString(),
    to: to.toISOString(),
    type,
    limit,
    cursor: rawCursor === undefined ? null : decodeCursor(rawCursor),
  };
}
