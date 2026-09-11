import {
  IsUUID,
  IsNotEmpty,
  IsOptional,
  IsObject,
  ValidateNested,
  IsNumber,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Draft snapshot structure for switching branches
 */
export class DraftSnapshotDto {
  @IsOptional()
  @IsNumber()
  schemaVersion?: number;

  @IsOptional()
  @IsObject()
  meta?: {
    tempo: number;
    timeSignature: [number, number];
    ppq: number;
  };

  @IsOptional()
  tracks?: Array<{
    id?: string;
    name: string;
    order: number;
    color: string;
    volume: number;
    pan: number;
    isMuted?: boolean;
    isSolo?: boolean;
    instrument?: string | null;
  }>;

  @IsOptional()
  notes?: Array<{
    id?: string;
    trackId: string;
    pitch: number;
    startTime: number;
    start?: number;
    duration: number;
    velocity: number;
  }>;
}

/**
 * UC-48: Switch Active Branch DTO
 *
 * Business Rules:
 * - BR-50: Save current draft before switching, restore target branch draft
 */
export class SwitchBranchDto {
  @IsNotEmpty({ message: 'Current branch ID is required' })
  @IsUUID('4', { message: 'Current branch ID must be a valid UUID' })
  currentBranchId!: string;

  @IsNotEmpty({ message: 'Target branch ID is required' })
  @IsUUID('4', { message: 'Target branch ID must be a valid UUID' })
  targetBranchId!: string;

  /**
   * Current draft snapshot from the branch being switched away from
   * This will be saved before switching
   */
  @IsOptional()
  @ValidateNested()
  @Type(() => DraftSnapshotDto)
  currentDraft?: DraftSnapshotDto;
}
