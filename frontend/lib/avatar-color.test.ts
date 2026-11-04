/**
 * FE-LIB-08 — avatar-color.colorFromId(id)
 *
 * Hàm thuần: băm id bằng hash đơn giản (không Math.random) nên cùng 1 id luôn
 * ra cùng 1 màu. Chỉ dùng token semantic theo theme (accent/success/warning/
 * danger/metal) — không có bảng màu Tailwind cố định.
 */
import { describe, expect, it } from 'vitest';
import { colorFromId } from './avatar-color';

describe('FE-LIB-08 colorFromId(id)', () => {
  it('returns the accent slot for an empty id', () => {
    expect(colorFromId('')).toEqual({
      bg: 'bg-accent-muted',
      text: 'text-accent',
    });
  });

  it('returns the warning slot for id "a"', () => {
    expect(colorFromId('a')).toEqual({
      bg: 'bg-warning-muted',
      text: 'text-warning',
    });
  });

  it('returns the danger slot for id "b"', () => {
    expect(colorFromId('b')).toEqual({
      bg: 'bg-danger-muted',
      text: 'text-danger',
    });
  });

  it('returns the metal slot for id "c"', () => {
    expect(colorFromId('c')).toEqual({
      bg: 'bg-metal-muted',
      text: 'text-metal',
    });
  });

  it('returns the success slot for id "e"', () => {
    expect(colorFromId('e')).toEqual({
      bg: 'bg-success-muted',
      text: 'text-success',
    });
  });

  it('returns the same palette entry when called twice with a UUID', () => {
    const id = 'f81d4fae-7dec-4170-bfe8-00e020acac87';
    const first = colorFromId(id);
    const second = colorFromId(id);

    expect(second).toStrictEqual(first);
  });

  it('always returns one of the five semantic palette entries', () => {
    const allowed = new Set([
      'bg-accent-muted',
      'bg-success-muted',
      'bg-warning-muted',
      'bg-danger-muted',
      'bg-metal-muted',
    ]);

    for (const id of ['', 'a', 'b', 'c', 'd', 'e', 'user-1', 'project-42']) {
      expect(allowed.has(colorFromId(id).bg)).toBe(true);
    }
  });

  it('never returns a fixed Tailwind colour outside the token palette', () => {
    // Guard: avatar phải bám theo theme người dùng chọn (UC-79), nên không
    // được trả màu cố định kiểu bg-blue-500.
    const result = colorFromId('anything');

    expect(result.bg).toMatch(/^bg-(accent|success|warning|danger|metal)-muted$/);
    expect(result.text).toMatch(/^text-(accent|success|warning|danger|metal)$/);
  });
});
