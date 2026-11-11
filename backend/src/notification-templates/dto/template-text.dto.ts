import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';
import {
  NOTIFICATION_TEMPLATE_BODY_MAX_LENGTH,
  NOTIFICATION_TEMPLATE_NAME_MAX_LENGTH,
  NOTIFICATION_TEMPLATE_SUBJECT_MAX_LENGTH,
} from '@stave/shared-types';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class SaveTemplateDto {
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(NOTIFICATION_TEMPLATE_NAME_MAX_LENGTH)
  name!: string;

  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(NOTIFICATION_TEMPLATE_SUBJECT_MAX_LENGTH)
  subject!: string;

  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(NOTIFICATION_TEMPLATE_BODY_MAX_LENGTH)
  body!: string;
}

export class PreviewTemplateDto {
  @IsString()
  @MaxLength(100)
  type!: string;

  @IsString()
  @MaxLength(NOTIFICATION_TEMPLATE_SUBJECT_MAX_LENGTH)
  subject!: string;

  @IsString()
  @MaxLength(NOTIFICATION_TEMPLATE_BODY_MAX_LENGTH)
  body!: string;
}
