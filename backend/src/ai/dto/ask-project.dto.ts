import { Transform } from 'class-transformer';
import {
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import type { SuggestionLang } from '../commit-message.service';

export class AskProjectDto {
  @IsUUID()
  projectId!: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(2)
  @MaxLength(400)
  question!: string;

  @IsOptional()
  @IsIn(['vi', 'en'])
  lang?: SuggestionLang;
}
