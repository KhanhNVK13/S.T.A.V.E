import { IsIn, IsOptional, IsUUID } from 'class-validator';
import type { SuggestionLang } from '../commit-message.service';

export class TheoryInsightDto {
  @IsUUID('4', { message: 'Project ID must be a valid UUID' })
  projectId!: string;

  @IsOptional()
  @IsUUID('4', { message: 'Commit ID must be a valid UUID' })
  commitId?: string;

  @IsOptional()
  @IsIn(['en', 'vi'])
  lang?: SuggestionLang;
}
