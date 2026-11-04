import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { sanitizeTrackName } from './sanitize-track-name.util';
import { DraftTrackDto as UpdateDraftTrackDto } from '../../drafts/dto/update-draft.dto';
import { DraftTrackDto as CreateCommitTrackDto } from '../../commits/dto/create-commit.dto';
import { SwitchBranchTrackDto } from '../../branches/dto/switch-branch.dto';

const ch = (...codes: number[]) => String.fromCharCode(...codes);

describe('sanitizeTrackName', () => {
  it('removes NUL and other C0 controls, DEL and C1', () => {
    expect(sanitizeTrackName(`a${ch(0)}b${ch(0x1f)}c${ch(0x7f)}d${ch(0x85)}e`)).toBe(
      'abcde',
    );
  });

  it('removes bidi controls and line/paragraph separators', () => {
    const bad = ch(
      0x200e, 0x200f, 0x202a, 0x202b, 0x202c, 0x202d, 0x202e, 0x2066, 0x2067,
      0x2068, 0x2069, 0x2028, 0x2029,
    );
    expect(sanitizeTrackName(`x${bad}y`)).toBe('xy');
  });

  it('removes lone surrogates but keeps valid pairs', () => {
    const emoji = String.fromCodePoint(0x1f3b9);
    expect(sanitizeTrackName(`a${ch(0xd800)}b${ch(0xdc00)}c${emoji}`)).toBe(
      `abc${emoji}`,
    );
  });

  it('keeps Vietnamese text with diacritics and normal punctuation', () => {
    const name = 'Đàn piano – Điệp khúc (ố ề ữ) #1';
    expect(sanitizeTrackName(name)).toBe(name);
    const decomposed = name.normalize('NFD');
    expect(sanitizeTrackName(decomposed)).toBe(decomposed);
  });

  it('passes non-strings through untouched', () => {
    expect(sanitizeTrackName(42)).toBe(42);
    expect(sanitizeTrackName(undefined)).toBeUndefined();
    expect(sanitizeTrackName(null)).toBeNull();
  });
});

describe.each([
  ['update-draft', UpdateDraftTrackDto],
  ['create-commit', CreateCommitTrackDto],
  ['switch-branch', SwitchBranchTrackDto],
] as const)('%s track name', (_label, Dto) => {
  const base = {
    id: 't1',
    order: 0,
    color: '#6366f1',
    muted: false,
    solo: false,
    volume: 1,
    pan: 0,
    instrument: null,
  };
  const run = async (name: unknown) => {
    const dto = plainToInstance(Dto, { ...base, name });
    const errors = await validate(dto as object, { whitelist: true });
    return { dto: dto as { name: unknown }, errors };
  };

  it('strips NUL and bidi characters', async () => {
    const { dto, errors } = await run(`Bass${ch(0)}${ch(0x202e)}Line`);
    expect(errors).toHaveLength(0);
    expect(dto.name).toBe('BassLine');
  });

  it('accepts exactly 50 characters', async () => {
    const { dto, errors } = await run('a'.repeat(50));
    expect(errors).toHaveLength(0);
    expect(dto.name).toBe('a'.repeat(50));
  });

  it('rejects 51 characters', async () => {
    const { errors } = await run('a'.repeat(51));
    expect(errors.map((e) => e.property)).toContain('name');
  });

  it('measures length after stripping control characters', async () => {
    const { errors } = await run('a'.repeat(50) + ch(0).repeat(10));
    expect(errors).toHaveLength(0);
  });

  it('keeps a Vietnamese name intact', async () => {
    const { dto, errors } = await run('Trống đệm – Ê a');
    expect(errors).toHaveLength(0);
    expect(dto.name).toBe('Trống đệm – Ê a');
  });

  it('rejects a non-string name', async () => {
    const { errors } = await run(123);
    expect(errors.map((e) => e.property)).toContain('name');
  });
});
