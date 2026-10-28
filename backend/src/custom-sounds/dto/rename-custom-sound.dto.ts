import { IsString, MaxLength } from 'class-validator';

export class RenameCustomSoundDto {
  @IsString()
  @MaxLength(100, { message: 'Tên âm thanh tối đa 100 ký tự' })
  name!: string;
}
