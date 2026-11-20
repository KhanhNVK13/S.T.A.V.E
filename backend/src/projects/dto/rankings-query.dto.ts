import { IsOptional, IsIn } from 'class-validator';

export class RankingsQueryDto {
  @IsOptional()
  @IsIn(['trending', 'top_forked', 'top_played'])
  type?: 'trending' | 'top_forked' | 'top_played' = 'trending';

  @IsOptional()
  @IsIn(['week', 'month', 'all'])
  period?: 'week' | 'month' | 'all' = 'all';
}
