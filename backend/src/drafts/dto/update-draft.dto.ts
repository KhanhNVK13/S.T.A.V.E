import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { GM_INSTRUMENT_NAMES } from '@stave/shared-types';
import type {
  DraftMeta,
  DraftNote,
  DraftSnapshot,
  DraftTrack,
} from '@stave/shared-types';

/** BR-29: a project may have at most this many tracks. */
export const MAX_DRAFT_TRACKS = 16;

export class DraftMetaDto implements DraftMeta {
  @IsNumber()
  tempo!: number;

  @IsArray()
  @ArrayMaxSize(2)
  @IsInt({ each: true })
  timeSignature!: [number, number];

  @IsInt()
  ppq!: number;
}

export class DraftTrackDto implements DraftTrack {
  @IsString()
  id!: string;

  /** UC-35 normal flow step 4 / exception 4.E1-4.E2: 1-50 chars, never empty. */
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  name!: string;

  @IsInt()
  order!: number;

  /** Hex color, e.g. `#6366f1` — client only offers a fixed palette, but validate here too (BR-style defense-in-depth, CLAUDE.md 4.3). */
  @Matches(/^#[0-9a-fA-F]{6}$/)
  color!: string;

  @IsBoolean()
  muted!: boolean;

  @IsBoolean()
  solo!: boolean;

  @IsNumber()
  volume!: number;

  @IsNumber()
  pan!: number;

  @IsOptional()
  @IsIn(GM_INSTRUMENT_NAMES)
  instrument!: string | null;
}

export class DraftNoteDto implements DraftNote {
  @IsString()
  id!: string;

  @IsString()
  trackId!: string;

  @IsInt()
  pitch!: number;

  @IsInt()
  start!: number;

  @IsInt()
  duration!: number;

  @IsInt()
  velocity!: number;
}

export class UpdateDraftDto implements DraftSnapshot {
  @IsInt()
  schemaVersion!: number;

  @ValidateNested()
  @Type(() => DraftMetaDto)
  meta!: DraftMetaDto;

  @IsArray()
  @ArrayMaxSize(MAX_DRAFT_TRACKS)
  @ValidateNested({ each: true })
  @Type(() => DraftTrackDto)
  tracks!: DraftTrackDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DraftNoteDto)
  notes!: DraftNoteDto[];
}
