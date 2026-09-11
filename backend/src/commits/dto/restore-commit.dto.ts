import { IsUUID, IsString, IsOptional, MaxLength } from 'class-validator';

/**
 * UC-46: Restore Previous Version DTO
 *
 * Business Rules:
 * - BR-47: Restore never deletes history - creates a NEW commit
 * - Message is optional, defaults to "Revert to commit <short_id>"
 */
export class RestoreCommitDto {
  @IsUUID('4', { message: 'Branch ID must be a valid UUID' })
  branch_id!: string;

  @IsOptional()
  @IsString({ message: 'Message must be a string' })
  @MaxLength(200, { message: 'Message must not exceed 200 characters' })
  message?: string;
}
