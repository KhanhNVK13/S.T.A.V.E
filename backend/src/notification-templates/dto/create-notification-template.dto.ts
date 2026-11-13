import { Transform } from 'class-transformer';
import { IsISO8601, IsOptional, IsString, MaxLength } from 'class-validator';
import {
  TEMPLATE_BODY_MAX_LENGTH,
  TEMPLATE_NAME_MAX_LENGTH,
  TEMPLATE_SUBJECT_MAX_LENGTH,
} from '@stave/shared-types';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class CreateNotificationTemplateDto {
  @Transform(trim)
  @IsString()
  @MaxLength(TEMPLATE_NAME_MAX_LENGTH)
  name!: string;

  @Transform(trim)
  @IsString()
  @MaxLength(TEMPLATE_SUBJECT_MAX_LENGTH)
  subject!: string;

  @Transform(trim)
  @IsString()
  @MaxLength(TEMPLATE_BODY_MAX_LENGTH)
  bodyTemplate!: string;

  /**
   * Khoá đồng thời (UC-111, Q3): `updated_at` của mẫu đang mở trên giao diện.
   * Lệch với giá trị hiện tại trong DB → 409, nghĩa là có admin khác vừa sửa.
   */
  @IsOptional()
  @IsISO8601()
  expectedUpdatedAt?: string;
}
