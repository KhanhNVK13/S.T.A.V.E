import { IsIn, IsOptional, IsUUID } from 'class-validator';
import {
  REPORT_STATUS_FILTERS,
  type ReportStatusFilter,
} from '@stave/shared-types';
import type { SuggestionLang } from '../commit-message.service';

export class ModerationTriageDto {
  @IsUUID()
  projectId!: string;

  @IsOptional()
  @IsIn(REPORT_STATUS_FILTERS)
  status?: ReportStatusFilter = 'open';

  @IsOptional()
  @IsIn(['vi', 'en'])
  lang?: SuggestionLang = 'vi';
}
