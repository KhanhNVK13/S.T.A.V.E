import { BadRequestException } from '@nestjs/common';
import { normalizeTags } from './project-tags';

describe('BE-PRJ-TAG normalizeTags', () => {
  it('UTCID01 trims, lowercases, collapses spaces and drops duplicates', () => {
    expect(normalizeTags(['  Lo-Fi ', 'lo-fi', 'Piano   Solo', ''])).toEqual([
      'lo-fi',
      'piano solo',
    ]);
  });

  it('UTCID02 keeps Vietnamese letters and digits', () => {
    expect(normalizeTags(['Nhạc Việt', '80s'])).toEqual(['nhạc việt', '80s']);
  });

  it('UTCID03 rejects characters outside letters, digits, hyphen and space', () => {
    for (const bad of ['rock!', '<b>', '#tag', '-lead', 'a_b']) {
      expect(() => normalizeTags([bad])).toThrow(BadRequestException);
    }
  });

  it('UTCID04 rejects a tag longer than 30 characters', () => {
    expect(() => normalizeTags(['a'.repeat(31)])).toThrow(BadRequestException);
    expect(normalizeTags(['a'.repeat(30)])).toHaveLength(1);
  });

  it('UTCID05 rejects more than 5 distinct tags but counts duplicates once', () => {
    expect(() => normalizeTags(['a', 'b', 'c', 'd', 'e', 'f'])).toThrow(
      BadRequestException,
    );
    expect(normalizeTags(['a', 'A', 'b', 'c', 'd', 'e'])).toHaveLength(5);
  });

  it('UTCID06 accepts an empty list to clear all tags', () => {
    expect(normalizeTags([])).toEqual([]);
  });
});
