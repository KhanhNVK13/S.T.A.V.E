import { IsIn, IsOptional } from 'class-validator';

export class DeleteCustomSoundQueryDto {
  @IsOptional()
  @IsIn(['self', 'hard'])
  mode?: 'self' | 'hard';
}
