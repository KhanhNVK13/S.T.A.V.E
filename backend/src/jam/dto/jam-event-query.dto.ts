import { IsEnum, IsOptional } from 'class-validator';
import type { JamEventStatus } from '@stave/shared-types';

/**
 * UC-66: query params của GET /jam/events.
 * `whitelist: true` → mọi trường không có decorator bị xoá im lặng,
 * nên khai đầy đủ mọi tham số service nhận.
 */
export class JamEventQueryDto {
  /** Lọc theo trạng thái (scheduled | active | ended | cancelled). */
  @IsOptional()
  @IsEnum(['scheduled', 'active', 'ended', 'cancelled'], {
    message: 'Invalid status filter',
  })
  status?: JamEventStatus;
}
