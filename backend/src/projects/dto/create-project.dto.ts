import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { PROJECT_GENRES } from '../project-genres';
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
  @ValidateIf((dto) => dto.genre !== null)
  @IsIn(PROJECT_GENRES)
  genre?: string | null;

  @IsOptional()
  @IsIn(['public', 'private'])
  visibility?: 'public' | 'private';

  @IsOptional()
  @IsIn(PROJECT_LICENSES)
  license?: ProjectLicense;
}
