import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDefined,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class SettingChangeDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  key!: string;

  @IsDefined()
  value!: unknown;
}

export class UpdateSettingsDto {
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => SettingChangeDto)
  changes!: SettingChangeDto[];

  @IsOptional()
  @IsBoolean()
  confirmReduction?: boolean;
}
