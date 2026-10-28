import { randomUUID } from 'crypto';

/**
 * Shim CJS cho package `uuid` v14.
 *
 * `uuid` v14 chỉ xuất bản ESM (`export { default as v4 } from './v4.js'`), còn
 * Jest chạy CommonJS nên không parse được → `SyntaxError: Unexpected token
 * 'export'`. Ở production, Node 24 `require()` được ESM nên chạy bình thường;
 * chỉ môi trường test là cần shim.
 *
 * `randomUUID()` của Node sinh đúng UUID v4 (4-4-4-4-12, version 4, variant
 * 8/9/a/b) — khớp với `uuid.v4()` nên test assert được format, và không làm
 * lệch hành vi so với code thật.
 */
export const v4 = (): string => randomUUID();
export const v1 = (): string => randomUUID();
export const v3 = (): string => randomUUID();
export const v5 = (): string => randomUUID();
export const v6 = (): string => randomUUID();
export const v7 = (): string => randomUUID();
export const NIL = '00000000-0000-0000-0000-000000000000';
export const MAX = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
export const parse = (uuid: string): Uint8Array =>
  Uint8Array.from(Buffer.from(uuid.replace(/-/g, ''), 'hex'));
export const stringify = (bytes: Uint8Array): string =>
  Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5');
export const validate = (uuid: string): boolean =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uuid);
export const version = (uuid: string): number =>
  parseInt(uuid.replace(/-/g, '')[14], 16);
