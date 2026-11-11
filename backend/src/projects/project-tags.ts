import { BadRequestException } from '@nestjs/common';
import { MAX_PROJECT_TAGS, MAX_TAG_LENGTH } from './dto/set-project-tags.dto';

const TAG_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N}\- ]*$/u;

export function normalizeTags(input: readonly string[]): string[] {
  const seen = new Set<string>();
  for (const raw of input) {
    const tag = raw.normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();
    if (tag === '') continue;
    if (tag.length > MAX_TAG_LENGTH || !TAG_PATTERN.test(tag)) {
      throw new BadRequestException(
        'Tags may only contain letters, numbers, hyphens and spaces',
      );
    }
    seen.add(tag);
  }
  if (seen.size > MAX_PROJECT_TAGS) {
    throw new BadRequestException(
      `A project can have at most ${MAX_PROJECT_TAGS} tags`,
    );
  }
  return [...seen];
}
