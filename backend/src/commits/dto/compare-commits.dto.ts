import { IsUUID } from 'class-validator';

/**
 * UC-45: Compare Versions DTO
 *
 * Query params for comparing two commits.
 * Both commits must exist and belong to the same project.
 */
export class CompareCommitsDto {
  @IsUUID('4', { message: 'Base commit ID must be a valid UUID' })
  baseCommitId!: string;

  @IsUUID('4', { message: 'Target commit ID must be a valid UUID' })
  targetCommitId!: string;
}
