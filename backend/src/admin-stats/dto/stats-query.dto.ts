import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, Matches } from 'class-validator';

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export class StatsQueryDto {
  @IsOptional()
  @Matches(DAY_PATTERN)
  from?: string;

  @IsOptional()
  @Matches(DAY_PATTERN)
  to?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  compare?: boolean;
}
