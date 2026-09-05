import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsNumber,
  IsString,
  ValidateNested,
} from 'class-validator';
import type {
  DraftMeta,
  DraftNote,
  DraftSnapshot,
  DraftTrack,
} from '@stave/shared-types';

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

  @IsString()
  name!: string;

  @IsInt()
  order!: number;

  @IsString()
  color!: string;

  @IsBoolean()
  muted!: boolean;

  @IsBoolean()
  solo!: boolean;

  @IsNumber()
  volume!: number;

  @IsNumber()
  pan!: number;
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
  @ValidateNested({ each: true })
  @Type(() => DraftTrackDto)
  tracks!: DraftTrackDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DraftNoteDto)
  notes!: DraftNoteDto[];
}
