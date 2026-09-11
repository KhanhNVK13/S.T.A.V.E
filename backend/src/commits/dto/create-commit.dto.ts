import { Type } from 'class-transformer';
import {
  IsString,
  IsUUID,
  IsOptional,
  ValidateNested,
  IsArray,
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

  @IsNumber()
  @Min(0)
  startTime!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  start?: number;

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

/** Full snapshot structure sent from client */
export class DraftSnapshotDto {
  @IsNumber()
  schemaVersion!: number;

  meta!: {
    tempo: number;
    timeSignature: [number, number];
    ppq: number;
  };

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
