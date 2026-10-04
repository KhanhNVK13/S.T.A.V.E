import { IsInt, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

export class ConfirmCustomSoundDto {
  @IsUUID()
  soundId!: string;

  @IsString()
  @MaxLength(255)
  name!: string;

  @IsString()
  @MaxLength(255)
  originalFilename!: string;

  @IsNumber()
  @Min(0.1)
  @Max(30)
  durationSec!: number;

  @IsInt()
  @Min(1)
  @Max(10 * 1024 * 1024)
  sizeBytes!: number;

  @IsString()
  @MaxLength(50)
  mimeType!: string;
}
