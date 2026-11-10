import { IsIn, IsOptional, IsUUID } from 'class-validator';
import type { SuggestionLang } from '../commit-message.service';

/**
 * UC-71: Đánh giá rủi ro hợp nhất — DTO query.
 *
 * Hai nhánh phải cùng thuộc một dự án và người gọi phải có quyền chỉnh
 * sửa dự án đó.
 */
export class MergeRiskDto {
  @IsUUID('4', { message: 'Source branch ID must be a valid UUID' })
  sourceBranchId!: string;

  @IsUUID('4', { message: 'Target branch ID must be a valid UUID' })
  targetBranchId!: string;

  @IsOptional()
  @IsIn(['en', 'vi'])
  lang?: SuggestionLang;
}
