import { IsInt, IsNumber, IsString, Max, MaxLength, Min } from 'class-validator';

/**
 * BR-60 — giới hạn thật của 1 custom sound.
 * Kiểm ở server chứ không chỉ ở client: trình duyệt upload thẳng lên
 * Storage nên nếu chỉ chặn ở client thì mở devtools là qua được.
 */
export const MAX_SOUND_DURATION_SEC = 30; // 30 giây
export const MAX_SOUND_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

export class CreateCustomSoundUploadUrlDto {
  @IsNumber()
  @Min(0.1, { message: 'Âm thanh quá ngắn' })
  @Max(MAX_SOUND_DURATION_SEC, {
    message: `Custom sound tối đa ${MAX_SOUND_DURATION_SEC} giây (BR-60)`,
  })
  durationSec!: number;

  @IsInt()
  @Min(1)
  @Max(MAX_SOUND_SIZE_BYTES, {
    message: `Custom sound tối đa ${MAX_SOUND_SIZE_BYTES / 1024 / 1024}MB (BR-60)`,
  })
  sizeBytes!: number;

  @IsString()
  @MaxLength(255)
  name!: string;

  @IsString()
  @MaxLength(50)
  mimeType!: string;
}
