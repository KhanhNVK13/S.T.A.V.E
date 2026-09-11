import {
  IsUUID,
  IsNotEmpty,
  IsString,
  IsOptional,
  IsArray,
  ValidateNested,
  IsEnum,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Choice for resolving a conflict
 */
export enum ConflictChoice {
  PICK_SOURCE = 'PICK_SOURCE',
  PICK_TARGET = 'PICK_TARGET',
  PICK_CUSTOM = 'PICK_CUSTOM',
}

/**
 * A single conflict resolution
 */
export class ConflictResolution {
  @IsString()
  noteId!: string;

  @IsEnum(ConflictChoice)
  choice!: ConflictChoice;

  /**
   * Custom note data if choice is PICK_CUSTOM
   */
  @IsOptional()
  customNote?: {
    id?: string;
    trackId: string;
    pitch: number;
    startTime: number;
    start?: number;
    duration: number;
    velocity: number;
  };
}

/**
 * UC-51: Resolve Merge Conflicts DTO
 *
 * Business Rules:
 * - BR-52: All conflicts must be resolved
 * - After resolution, creates merge commit
 */
export class ResolveConflictDto {
  @IsNotEmpty({ message: 'Source branch ID is required' })
  @IsUUID('4', { message: 'Source branch ID must be a valid UUID' })
  sourceBranchId!: string;

  @IsNotEmpty({ message: 'Target branch ID is required' })
  @IsUUID('4', { message: 'Target branch ID must be a valid UUID' })
  targetBranchId!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ConflictResolution)
  resolutions!: ConflictResolution[];

  /**
   * Optional commit message (defaults to auto-generated)
   */
  @IsOptional()
  @IsString()
  message?: string;

  /**
   * UC-51 Exception 8.E1: if provided, must match the target branch's
   * current head_commit_id at the time the merge is finally applied.
   */
  @IsOptional()
  @IsUUID('4')
  expectedTargetHeadCommitId?: string;
}
