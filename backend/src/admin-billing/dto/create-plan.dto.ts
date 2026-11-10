import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/** Trạng thái gói khi admin tạo: nháp (chưa mở bán) hoặc mở bán ngay. */
export const PLAN_CREATE_STATUSES = ['draft', 'active'] as const;
export type PlanCreateStatus = (typeof PLAN_CREATE_STATUSES)[number];

/** Dung lượng lưu trữ tối đa (MB) mà một gói được cấp thêm. */
export const MAX_EXTRA_STORAGE_MB = 102400;

export class CreatePlanDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  name!: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  priceVnd!: number;

  /** Chỉ nhận các khoá tính năng hợp lệ — kiểm tra kỹ trong service. */
  @IsObject()
  features!: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsIn(PLAN_CREATE_STATUSES)
  status?: PlanCreateStatus;
}

/** Khoá số dung lượng lưu trữ trong `features` (không phải cờ boolean). */
export const EXTRA_STORAGE_KEY = 'extra_storage_mb';
