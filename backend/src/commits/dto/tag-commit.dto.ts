import {
  IsString,
  MinLength,
  MaxLength,
  Matches,
  IsOptional,
} from 'class-validator';

/**
 * UC-44: Tag Commit DTO
 *
 * Business Rules:
 * - BR-44: Tag names must be alphanumeric with hyphens, max 30 chars (updated from 50)
 * - Tag colors are optional, defaults to '#6366f1' (indigo)
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

  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, {
    message: 'Color must be a valid hex color (e.g., #ff0000)',
  })
  color?: string;
}
