import { IsUUID } from 'class-validator';

export class PlanIdDto {
  @IsUUID()
  planId!: string;
}
