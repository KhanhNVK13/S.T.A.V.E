import { ArrayMaxSize, IsArray, IsString, MaxLength } from 'class-validator';

export const MAX_PROJECT_TAGS = 5;
export const MAX_TAG_LENGTH = 30;

export class SetProjectTagsDto {
  @IsArray()
  @ArrayMaxSize(MAX_PROJECT_TAGS)
  @IsString({ each: true })
  @MaxLength(MAX_TAG_LENGTH, { each: true })
  tags!: string[];
}
