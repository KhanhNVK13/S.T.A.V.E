import { Transform } from 'class-transformer';
import { IsString, MaxLength } from 'class-validator';
import {
  TEMPLATE_BODY_MAX_LENGTH,
  TEMPLATE_SUBJECT_MAX_LENGTH,
} from '@stave/shared-types';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class PreviewNotificationTemplateDto {
  @Transform(trim)
  @IsString()
  type!: string;

  @Transform(trim)
  @IsString()
  @MaxLength(TEMPLATE_SUBJECT_MAX_LENGTH)
  subject!: string;

  @Transform(trim)
  @IsString()
  @MaxLength(TEMPLATE_BODY_MAX_LENGTH)
  bodyTemplate!: string;
}
