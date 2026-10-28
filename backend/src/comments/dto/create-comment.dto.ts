import {
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * UC-63: create a pinned comment.
 *
 * `body` is mandatory (1–1000 chars after trim). The anchor fields
 * (`trackId`, `bar`, `noteId`) are optional: when all are omitted the comment
 * anchors to the whole project (stored as null). `parentId` marks a reply,
 * which inherits its anchor from the parent comment (one level only).
 *
 * The ValidationPipe is `whitelist:true`, so any field without a decorator
 * here is silently stripped — every shape the API accepts has one.
 */
export class CreateCommentDto {
  @IsString({ message: 'Comment body must be a string' })
  @MinLength(1, { message: 'Comment body must not be empty' })
  @MaxLength(1000, { message: 'Comment body must not exceed 1000 characters' })
  body!: string;

  @IsOptional()
  @IsString({ message: 'Track id must be a string' })
  trackId?: string | null;

  @ValidateIf((o) => o.bar !== undefined && o.bar !== null)
  @Type(() => Number)
  @IsInt({ message: 'Bar must be an integer' })
  @Min(1, { message: 'Bar must be at least 1' })
  bar?: number | null;

  @IsOptional()
  @IsString({ message: 'Note id must be a string' })
  noteId?: string | null;

  @IsOptional()
  @IsString({ message: 'Parent id must be a string (uuid)' })
  parentId?: string;
}
