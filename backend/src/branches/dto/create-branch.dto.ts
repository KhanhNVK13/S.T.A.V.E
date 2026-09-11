import {
  IsString,
  IsUUID,
  IsOptional,
  MinLength,
  MaxLength,
  IsNotEmpty,
} from 'class-validator';

/**
 * UC-47: Create Branch DTO
 *
 * Business Rules:
 * - BR-48: Branch name must be 1-50 characters
 * - BR-49: Optional startCommitId for branch start point
 */
export class CreateBranchDto {
  @IsNotEmpty({ message: 'Branch name is required' })
  @IsString({ message: 'Branch name must be a string' })
  @MinLength(1, { message: 'Branch name must be at least 1 character' })
  @MaxLength(50, { message: 'Branch name must not exceed 50 characters' })
  name!: string;

  /**
   * Optional starting commit for the new branch
   * If not provided, uses the current head commit of the source branch
   */
  @IsOptional()
  @IsUUID('4', { message: 'Start commit ID must be a valid UUID' })
  startCommitId?: string;

  /**
   * Optional source branch ID to branch from
   * If not provided, uses the default branch
   */
  @IsOptional()
  @IsUUID('4', { message: 'Source branch ID must be a valid UUID' })
  sourceBranchId?: string;
}
