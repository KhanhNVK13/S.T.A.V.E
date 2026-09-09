import { IsIn, IsNotEmpty, IsString } from 'class-validator';

export class UpdateProjectVisibilityDto {
  @IsNotEmpty()
  @IsString()
  @IsIn(['public', 'private'])
  visibility: 'public' | 'private';
}
