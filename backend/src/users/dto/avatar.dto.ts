import { IsIn, IsString, Matches } from 'class-validator';

export const AVATAR_CONTENT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

export class CreateAvatarUploadDto {
  @IsIn(AVATAR_CONTENT_TYPES)
  contentType!: (typeof AVATAR_CONTENT_TYPES)[number];
}

export class ConfirmAvatarDto {
  @IsString()
  @Matches(/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|png|webp)$/, {
    message: 'Invalid avatar path',
  })
  path!: string;
}
