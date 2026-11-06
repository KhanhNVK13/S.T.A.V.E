import {
  IsUUID,
  IsString,
  IsOptional,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * UC-46: Restore Previous Version DTO
 *
 * Business Rules:
 * - BR-47: Restore never deletes history - creates a NEW commit
 * - Message is optional, defaults to a message naming the restored version
 */
export class RestoreCommitDto {
  @IsUUID('4', { message: 'Branch ID must be a valid UUID' })
  branch_id!: string;

  @IsOptional()
  @IsString({ message: 'Message must be a string' })
  @MinLength(1, { message: 'Message must be at least 1 character' })
  @MaxLength(200, { message: 'Message must not exceed 200 characters' })
  message?: string;
}
