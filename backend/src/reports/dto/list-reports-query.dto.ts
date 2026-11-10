import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { ReportStatusQueryDto } from './report-status-query.dto';

export const MAX_REPORT_PAGE_SIZE = 50;
const MAX_REPORT_PAGE = 100000;

export class ListReportsQueryDto extends ReportStatusQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_REPORT_PAGE)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_REPORT_PAGE_SIZE)
  limit?: number = 20;
}
