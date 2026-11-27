import { IsIn, IsOptional, IsUUID } from 'class-validator';
import type { SuggestionLang } from '../commit-message.service';

export type DiffSummaryStyle = 'summary' | 'release-notes';

export class DiffSummaryDto {
  @IsUUID('4')
  baseCommitId!: string;

  @IsUUID('4')
  targetCommitId!: string;

  @IsOptional()
  @IsIn(['en', 'vi'])
  lang?: SuggestionLang;

  @IsOptional()
  @IsIn(['summary', 'release-notes'])
  style?: DiffSummaryStyle;
}
