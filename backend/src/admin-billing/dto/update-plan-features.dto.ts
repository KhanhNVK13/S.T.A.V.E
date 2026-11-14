import { IsDateString, IsObject } from 'class-validator';

export class UpdatePlanFeaturesDto {
  @IsObject()
  features!: Record<string, unknown>;

  @IsDateString()
  effectiveAt!: string;
}
