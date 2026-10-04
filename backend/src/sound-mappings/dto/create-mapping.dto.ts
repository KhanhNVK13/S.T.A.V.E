import { IsInt, IsString, IsUUID, Max, Min } from 'class-validator';

export class CreateSoundMappingDto {
  @IsUUID()
  projectId!: string;

  @IsUUID()
  trackId!: string;

  @IsInt()
  @Min(0)
  @Max(127)
  pitch!: number;

  @IsUUID()
  soundId!: string;
}
