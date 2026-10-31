import {
  IsISO8601,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * UC-94 — body của `PATCH /admin/jam/events/:id`. Mọi trường optional:
 * PATCH semantics — chỉ gán lại trường nào admin truyền lên (whitelist: true
 * → trường thiếu decorator bị xoá im lặng, nên khai đủ).
 *
 * Constraint nghiệp vụ (status-based) do `JamService.configureEvent` kiểm:
 * sự kiện `active` chỉ nhận `scheduledEndAt` (kéo dài) + `editCooldownSec`
 * (2.E1); `scheduled` nhận tất cả; `ended` từ chối mọi cấu hình (2.E2).
 */
export class ConfigureJamEventDto {
  /** Tên sự kiện (2.E1: khoá khi `active`). */
  @IsOptional()
  @IsString({ message: 'Tên sự kiện phải là chuỗi' })
  @MaxLength(120, { message: 'Tên sự kiện không được vượt quá 120 ký tự' })
  name?: string;

  /** Mô tả (2.E1: khoá khi `active`). */
  @IsOptional()
  @IsString({ message: 'Mô tả phải là chuỗi' })
  @MaxLength(2000, { message: 'Mô tả không được vượt quá 2000 ký tự' })
  description?: string;

  /** ISO 8601 (2.E1: khoá khi `active`). */
  @IsOptional()
  @IsISO8601({}, { message: 'Thời gian bắt đầu không đúng định dạng' })
  scheduledStartAt?: string;

  /** ISO 8601 — 4.E1: không được trong quá khứ. */
  @IsOptional()
  @IsISO8601({}, { message: 'Thời gian kết thúc không đúng định dạng' })
  scheduledEndAt?: string;

  /** Dự án công khai khởi đầu (2.E1: khoá khi `active`). */
  @IsOptional()
  @IsUUID('4', { message: 'ID dự án bắt đầu không hợp lệ' })
  startingProjectId?: string;

  /** Cooldown riêng 1..3600 giây (3.1: hiệu lực ngay cho lượt sửa kế tiếp). */
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Thời gian chờ phải là số nguyên' })
  @Min(1, { message: 'Thời gian chờ tối thiểu là 1 giây' })
  @Max(3600, { message: 'Thời gian chờ tối đa là 3600 giây' })
  editCooldownSec?: number;
}
