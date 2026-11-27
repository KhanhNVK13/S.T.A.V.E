import { IsIn, IsOptional, IsUUID } from 'class-validator';
import type { SuggestionLang } from '../commit-message.service';

export class PrSummaryDto {
  @IsUUID('4')
  pullRequestId!: string;

  @IsOptional()
  @IsIn(['en', 'vi'])
  lang?: SuggestionLang;
}
