import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { GM_INSTRUMENT_NAMES } from '@stave/shared-types';

export const MAX_INSTRUMENT_FILTERS = 5;

function toInstrumentList(value: unknown): unknown {
  const raw = Array.isArray(value) ? value : [value];
  const out: unknown[] = [];
  for (const entry of raw) {
    if (typeof entry !== 'string') {
      out.push(entry);
      continue;
    }
    for (const part of entry.split(',')) {
      const name = part.trim();
      if (name !== '' && !out.includes(name)) out.push(name);
    }
  }
  return out;
}

export class PublicProjectsQueryDto {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => parseInt(String(value), 10))
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => parseInt(String(value), 10))
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 20;

  @IsOptional()
  @IsString()
  genre?: string;

  @IsOptional()
  @IsString()
  tag?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => toInstrumentList(value))
  @IsArray()
  @ArrayMaxSize(MAX_INSTRUMENT_FILTERS)
  @IsIn(GM_INSTRUMENT_NAMES, { each: true })
  instrument?: string[];

  @IsOptional()
  @IsIn(['newest', 'popular', 'most_played'])
  sort?: 'newest' | 'popular' | 'most_played' = 'newest';
}
