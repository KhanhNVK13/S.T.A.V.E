import { Transform } from 'class-transformer';
import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import type { SuggestionLang } from '../commit-message.service';

export class ExploreParseDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  query!: string;

  @IsOptional()
  @IsIn(['en', 'vi'])
  lang?: SuggestionLang;
}
