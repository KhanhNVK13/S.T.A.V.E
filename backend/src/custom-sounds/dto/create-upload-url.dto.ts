import { IsInt, IsNumber, Max, Min } from 'class-validator';

export const MAX_SOUND_DURATION_SEC = 30;
export const MAX_SOUND_SIZE_BYTES = 10 * 1024 * 1024;

export class CreateCustomSoundUploadUrlDto {
  @IsNumber()
  @Min(0.05, { message: 'Âm thanh quá ngắn' })
  @Max(MAX_SOUND_DURATION_SEC, { message: 'Âm thanh tối đa 30 giây' })
  durationSec!: number;

  @IsInt()
  @Min(1)
  @Max(MAX_SOUND_SIZE_BYTES, { message: 'Âm thanh tối đa 10MB' })
  sizeBytes!: number;
}
