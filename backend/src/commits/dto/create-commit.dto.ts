import { Type } from 'class-transformer';
import {
  IsString,
  IsUUID,
  IsOptional,
  ValidateNested,
  IsArray,
  ArrayMaxSize,
  IsInt,
  IsNumber,
  Min,
  Max,
  MinLength,
  MaxLength,
  IsNotEmpty,
} from 'class-validator';

/** Note structure within snapshot - supports both UUID and auto-generated IDs */
export class DraftNoteDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsString()
  trackId!: string;

  @IsNumber()
  pitch!: number;

  /**
   * Integer tick — matches the real `DraftNote.start` field (CLAUDE.md 4.2:
   * "start"/"duration" là số nguyên tick). Was wrongly named `startTime`
   * (required) with `start` as a dead optional fallback — fixed here to
   * match the actual snapshot shape used everywhere else (drafts DTO,
   * shared-types).
   */
  @IsNumber()
  @Min(0)
  start!: number;

  @IsNumber()
  @Min(1)
  duration!: number;

  @IsNumber()
  @Min(0)
  @Max(127)
  velocity!: number;
}

/** Track structure within snapshot */
export class DraftTrackDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsString()
  name!: string;

  @IsNumber()
  @Min(0)
  order!: number;

  @IsString()
  color!: string;

  @IsNumber()
  @Min(0)
  @Max(1)
  volume!: number;

  @IsNumber()
  @Min(-1)
  @Max(1)
  pan!: number;

  @IsOptional()
  isMuted?: boolean;

  @IsOptional()
  isSolo?: boolean;

  /** UC-30: General MIDI instrument name, null = default (sine oscillator) */
  @IsOptional()
  @IsString()
  instrument?: string | null;
}

/**
 * Meta block of a snapshot (tempo/timeSignature/ppq).
 *
 * BUG FIX (12/09/2026): this used to be an untyped inline object literal with
 * no validator decorators on `DraftSnapshotDto.meta` below — under
 * `ValidationPipe({ whitelist: true })` (see `backend/src/main.ts`) that made
 * `meta` an unknown/non-whitelisted property, so it was silently STRIPPED
 * from any request that included `snapshot` directly. Verified by test: a
 * commit with `snapshot.meta.tempo = 99` was persisted with `tempo: 120`
 * (schema default) instead. Frontend works around this today by never
 * sending `snapshot` (it flushes the draft first and lets the server load it
 * from `drafts`), so no user-facing corruption has happened yet — but any
 * future caller that posts `snapshot` directly would still be silently
 * corrupted without this fix.
 */
export class DraftMetaDto {
  @IsNumber()
  tempo!: number;

  @IsArray()
  @ArrayMaxSize(2)
  @IsInt({ each: true })
  timeSignature!: [number, number];

  @IsInt()
  ppq!: number;
}

/** Full snapshot structure sent from client */
export class DraftSnapshotDto {
  @IsNumber()
  schemaVersion!: number;

  @ValidateNested()
  @Type(() => DraftMetaDto)
  meta!: DraftMetaDto;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DraftTrackDto)
  tracks!: DraftTrackDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DraftNoteDto)
  notes!: DraftNoteDto[];
}

/**
 * UC-42: Create Commit DTO
 *
 * Business Rules:
 * - BR-39: message must be 1-200 characters (validated below)
 * - UC-42 Exception 6.E1: expectedHeadCommitId for concurrency protection
 */
export class CreateCommitDto {
  @IsUUID('4')
  branch_id!: string;

  @IsNotEmpty({ message: 'Message is required' })
  @IsString({ message: 'Message must be a string' })
  @MinLength(1, { message: 'Message must be at least 1 character' })
  @MaxLength(200, { message: 'Message must not exceed 200 characters' })
  message!: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => DraftSnapshotDto)
  snapshot?: DraftSnapshotDto;

  /**
   * UC-42 Exception 6.E1: Concurrency Protection
   * If provided, must match current head_commit_id of the branch.
   * If mismatched, throw ConflictException.
   */
  @IsOptional()
  @IsUUID('4')
  expectedHeadCommitId?: string;
}
