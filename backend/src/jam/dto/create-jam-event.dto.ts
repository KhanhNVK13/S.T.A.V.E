import {
  IsBoolean,
  IsISO8601,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * UC-93 — body của `POST /admin/jam`: tạo sự kiện Community Jam (admin).
 *
 * 4.E1: tên + 2 mốc thời gian bắt buộc (lỗi inline phía frontend, không tạo).
 * 4.E3: `confirmOverlap` — lần gửi đầu tiên bỏ trống; khi backend trả
 * 409 `JAM_OVERLAP_CONFLICT` frontend gửi lại kèm `confirmOverlap: true`.
 */
export class CreateJamEventDto {
  @IsNotEmpty({ message: 'Tên sự kiện không được để trống' })
  @IsString()
  @MaxLength(120, { message: 'Tên sự kiện không được vượt quá 120 ký tự' })
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsNotEmpty({ message: 'Thời gian bắt đầu không được để trống' })
  @IsISO8601({}, { message: 'Thời gian bắt đầu không đúng định dạng' })
  scheduledStartAt: string;

  @IsNotEmpty({ message: 'Thời gian kết thúc không được để trống' })
  @IsISO8601({}, { message: 'Thời gian kết thúc không đúng định dạng' })
  scheduledEndAt: string;

  @IsOptional()
  @IsUUID('4', { message: 'ID dự án bắt đầu không hợp lệ' })
  startingProjectId?: string;

  @IsOptional()
  @IsInt({ message: 'Thời gian chờ phải là số nguyên' })
  @Min(1, { message: 'Thời gian chờ tối thiểu là 1 giây' })
  @Max(3600, { message: 'Thời gian chờ tối đa là 3600 giây' })
  editCooldownSec?: number;

  @IsOptional()
  @IsBoolean()
  confirmOverlap?: boolean;
}
