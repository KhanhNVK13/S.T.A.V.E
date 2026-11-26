import { IsIn, IsOptional } from 'class-validator';
import type { SuggestionLang } from '../commit-message.service';

export class PrRiskExplainDto {
  @IsOptional()
  @IsIn(['en', 'vi'])
  lang?: SuggestionLang;
}
