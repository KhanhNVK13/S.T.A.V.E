import { IsOptional, IsIn } from 'class-validator';

export class ListProjectsQueryDto {
  @IsOptional()
  @IsIn([
    'public_first',
    'updated_desc',
    'updated_asc',
    'name_asc',
    'name_desc',
  ])
  sort?:
    'public_first' | 'updated_desc' | 'updated_asc' | 'name_asc' | 'name_desc' =
    'public_first';

  @IsOptional()
  @IsIn(['all', 'public', 'private'])
  visibility?: 'all' | 'public' | 'private' = 'all';
}
