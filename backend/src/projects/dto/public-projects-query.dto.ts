import { IsOptional, IsInt, Min, Max, IsIn, IsString } from 'class-validator';
import { Transform } from 'class-transformer';

export class PublicProjectsQueryDto {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => parseInt(String(value), 10))
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => parseInt(String(value), 10))
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 12;

  @IsOptional()
  @IsString()
  genre?: string;

  @IsOptional()
  @IsString()
  tag?: string;

  @IsOptional()
  @IsIn(['newest', 'popular', 'most_played'])
  sort?: 'newest' | 'popular' | 'most_played' = 'newest';
}
