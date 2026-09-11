import { IsUUID, IsNotEmpty, IsOptional } from 'class-validator';

/**
 * UC-51: Merge Branch DTO
 *
 * Business Rules:
 * - BR-52: Source and target must belong to the same project
 * - BR-53: Conflicts are returned if detected
 */
export class MergeBranchDto {
  @IsNotEmpty({ message: 'Source branch ID is required' })
  @IsUUID('4', { message: 'Source branch ID must be a valid UUID' })
  sourceBranchId!: string;

  @IsNotEmpty({ message: 'Target branch ID is required' })
  @IsUUID('4', { message: 'Target branch ID must be a valid UUID' })
  targetBranchId!: string;

  /**
   * UC-51 Exception 8.E1: if provided, must match the target branch's
   * current head_commit_id. Mismatch means someone else committed to the
   * target while this merge was being prepared — the caller should restart.
   */
  @IsOptional()
  @IsUUID('4')
  expectedTargetHeadCommitId?: string;
}
