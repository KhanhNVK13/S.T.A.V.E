import { IsIn, IsOptional, IsUUID } from 'class-validator';
import type { SuggestionLang } from '../commit-message.service';

export class ConflictAdviceDto {
  @IsOptional()
  @IsUUID('4')
  sourceBranchId?: string;

  @IsOptional()
  @IsUUID('4')
  targetBranchId?: string;

  @IsOptional()
  @IsUUID('4')
  pullRequestId?: string;

  @IsOptional()
  @IsIn(['en', 'vi'])
  lang?: SuggestionLang;
}
