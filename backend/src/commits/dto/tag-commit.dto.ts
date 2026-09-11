import { IsString, MinLength, MaxLength, Matches } from 'class-validator';

/**
 * UC-44: Tag Commit DTO
 *
 * BR-44: tag name is 1-30 chars, unique within the project, and a commit
 * carries at most one tag (both enforced by DB constraints on `commit_tags`).
 * No `color` field — the real `commit_tags` table has no such column.
 */
export class TagCommitDto {
  @IsString({ message: 'Tag name must be a string' })
  @MinLength(1, { message: 'Tag name is required' })
  @MaxLength(30, { message: 'Tag name must not exceed 30 characters' })
  @Matches(/^[a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9]$|^[a-zA-Z0-9]$/, {
    message:
      'Tag name must be alphanumeric with hyphens (no leading/trailing hyphens)',
  })
  tag!: string;
}
