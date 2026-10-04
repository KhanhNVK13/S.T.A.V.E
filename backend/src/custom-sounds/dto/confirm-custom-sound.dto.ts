import { IsIn, IsString, IsUUID, MaxLength } from 'class-validator';

export const CUSTOM_SOUND_SOURCES = ['uploaded', 'recorded'] as const;
export type CustomSoundSource = (typeof CUSTOM_SOUND_SOURCES)[number];

export class ConfirmCustomSoundDto {
  @IsUUID()
  soundId!: string;

  @IsString()
  @MaxLength(100, { message: 'Tên âm thanh tối đa 100 ký tự' })
  name!: string;

  @IsIn(CUSTOM_SOUND_SOURCES)
  source!: CustomSoundSource;
}
