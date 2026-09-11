import { IsUUID, IsNotEmpty } from 'class-validator';

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
}
