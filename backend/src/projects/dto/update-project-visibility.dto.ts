import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { PROJECT_LICENSES } from '../project-license';
import type { ProjectLicense } from '../project-row.type';

export class UpdateProjectVisibilityDto {
  @IsNotEmpty()
  @IsString()
  @IsIn(['public', 'private'])
  visibility: 'public' | 'private';

  @IsOptional()
  @IsIn(PROJECT_LICENSES)
  license?: ProjectLicense;
}
