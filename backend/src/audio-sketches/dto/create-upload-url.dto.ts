import { IsInt, IsNumber, Max, Min } from 'class-validator';

/**
 * BR-56 — giới hạn thật của 1 audio sketch. Kiểm ở server chứ không chỉ ở
 * client: trình duyệt upload thẳng lên Storage nên nếu chỉ chặn ở client thì
 * mở devtools là qua được.
 */
export const MAX_SKETCH_DURATION_SEC = 180; // 3 phút
export const MAX_SKETCH_SIZE_BYTES = 20 * 1024 * 1024; // 20MB

export class CreateUploadUrlDto {
  @IsNumber()
  @Min(0.1, { message: 'Bản ghi quá ngắn' })
  @Max(MAX_SKETCH_DURATION_SEC, {
    message: 'Audio sketch tối đa 3 phút (BR-56)',
  })
  durationSec!: number;

  @IsInt()
  @Min(1)
  @Max(MAX_SKETCH_SIZE_BYTES, { message: 'Audio sketch tối đa 20MB (BR-56)' })
  sizeBytes!: number;
}
