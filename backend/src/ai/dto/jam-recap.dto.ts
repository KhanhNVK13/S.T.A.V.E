import { IsIn, IsOptional, IsUUID } from 'class-validator';
import type { SuggestionLang } from '../commit-message.service';

export class JamRecapDto {
  @IsUUID('4')
  eventId!: string;

  @IsOptional()
  @IsIn(['en', 'vi'])
  lang?: SuggestionLang;
}
