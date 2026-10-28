import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export const NOTIFICATION_FILTERS = ['all', 'unread', 'mentions'] as const;
export type NotificationFilter = (typeof NOTIFICATION_FILTERS)[number];

export class ListNotificationsQueryDto {
  @IsOptional()
  @IsIn(NOTIFICATION_FILTERS)
  filter?: NotificationFilter = 'all';

  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 30;
}
