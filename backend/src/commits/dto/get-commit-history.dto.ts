import { Type } from 'class-transformer';
import { IsUUID, IsOptional, IsNumber, Min, Max } from 'class-validator';

/**
 * UC-43: Get Commit History DTO
 * Supports pagination and filtering by branch
 */
export class GetCommitHistoryDto {
  @IsOptional()
  @IsUUID('4')
  branch_id?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
