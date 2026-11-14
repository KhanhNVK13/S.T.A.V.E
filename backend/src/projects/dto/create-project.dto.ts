import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { PROJECT_LICENSES } from '../project-license';
import type { ProjectLicense } from '../project-row.type';

export class CreateProjectDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  genre?: string;

  @IsOptional()
  @IsIn(['public', 'private'])
  visibility?: 'public' | 'private';

  @IsOptional()
  @IsIn(PROJECT_LICENSES)
  license?: ProjectLicense;
}
