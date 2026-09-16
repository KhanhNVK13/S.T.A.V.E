import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import {
  MAX_SKETCH_DURATION_SEC,
  MAX_SKETCH_SIZE_BYTES,
} from './create-upload-url.dto';

/** UC-55 — ghi sketch đã upload vào project. */
export class AttachSketchDto {
  /** Id do bước xin upload URL cấp; cũng là tên file trong bucket. */
  @IsUUID('4')
  sketchId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @IsNumber()
  @Min(0.1)
  @Max(MAX_SKETCH_DURATION_SEC)
  durationSec!: number;

  @IsInt()
  @Min(1)
  @Max(MAX_SKETCH_SIZE_BYTES)
  sizeBytes!: number;

  /** UC-54 — điểm cắt; KHÔNG cắt file, chỉ lưu mốc để phát lại đúng đoạn. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  trimStartSec?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  trimEndSec?: number;
}
