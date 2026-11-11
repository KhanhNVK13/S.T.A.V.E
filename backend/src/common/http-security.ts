import { isIP } from 'node:net';
import { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import type { ServerOptions } from 'socket.io';

type Env = Record<string, string | undefined>;
type OriginCallback = (error: Error | null, allow?: boolean) => void;
export type CorsOrigin =
  boolean | ((origin: string | undefined, callback: OriginCallback) => void);

const DEFAULT_PROXY_HOPS = 1;

function originOf(value: string): string | null {
  try {
    return new URL(value.trim()).origin;
  } catch {
    return null;
  }
}

export function allowedOrigins(env: Env): string[] {
  const listed = (env.CORS_ORIGINS ?? '')
    .split(',')
    .map((value) => originOf(value))
    .filter((value): value is string => Boolean(value));
  const frontend = env.FRONTEND_URL ? originOf(env.FRONTEND_URL) : null;
  return [...new Set(frontend ? [...listed, frontend] : listed)];
}

export function resolveCorsOrigin(env: Env): CorsOrigin {
  if (env.NODE_ENV !== 'production') return true;
  const allowed = new Set(allowedOrigins(env));
  return (origin, callback) => {
    callback(null, !origin || allowed.has(origin));
  };
}

export function resolveTrustProxy(env: Env): number | string | false {
  const raw = env.TRUST_PROXY?.trim();
  if (!raw) return env.NODE_ENV === 'production' ? DEFAULT_PROXY_HOPS : false;
  if (raw === 'false' || raw === '0') return false;
  if (raw === 'true') return DEFAULT_PROXY_HOPS;
  if (/^\d+$/.test(raw)) return Number(raw);
  const entries = raw.split(',').map((entry) => entry.trim());
  if (!entries.every(isValidProxyEntry)) {
    throw new Error(
      `TRUST_PROXY must be a hop count, "true", or a list of loopback/linklocal/uniquelocal/IP/CIDR entries, got "${raw}"`,
    );
  }
  return raw;
}

const PROXY_KEYWORDS = new Set(['loopback', 'linklocal', 'uniquelocal']);

function isValidProxyEntry(entry: string): boolean {
  if (PROXY_KEYWORDS.has(entry)) return true;
  const [address, prefix, ...rest] = entry.split('/');
  if (rest.length > 0 || isIP(address) === 0) return false;
  if (prefix === undefined) return true;
  const max = isIP(address) === 4 ? 32 : 128;
  return /^\d+$/.test(prefix) && Number(prefix) <= max;
}

export function resolvePort(env: Env): number {
  const port = Number(env.PORT?.trim());
  return Number.isInteger(port) && port > 0 && port < 65536 ? port : 3001;
}

export class CorsIoAdapter extends IoAdapter {
  constructor(
    app: INestApplicationContext,
    private readonly origin: CorsOrigin,
  ) {
    super(app);
  }

  createIOServer(port: number, options?: ServerOptions) {
    return super.createIOServer(port, {
      ...options,
      cors: { origin: this.origin, credentials: true },
    });
  }
}
