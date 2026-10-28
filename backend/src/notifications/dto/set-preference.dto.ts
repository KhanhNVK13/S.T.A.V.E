import { IsBoolean, IsIn, IsString } from 'class-validator';

export const NOTIFICATION_CHANNELS = ['in_app', 'email'] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export class SetPreferenceDto {
  @IsString()
  type!: string;

  @IsIn(NOTIFICATION_CHANNELS)
  channel!: NotificationChannel;

  @IsBoolean()
  enabled!: boolean;
}
