import { Transform } from 'class-transformer';
import { Equals, IsIn, IsString, MaxLength, MinLength } from 'class-validator';
import {
  COPYRIGHT_CLAIMANT_ROLES,
  COPYRIGHT_CLAIM_LIMITS,
  type CopyrightClaimantRole,
} from '@stave/shared-types';
import { sanitizeReportDetails } from '../reports.logic';

const clean = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? (sanitizeReportDetails(value) ?? '') : value;

export class CopyrightClaimDto {
  @Transform(clean)
  @IsString()
  @MinLength(COPYRIGHT_CLAIM_LIMITS.claimantName.min)
  @MaxLength(COPYRIGHT_CLAIM_LIMITS.claimantName.max)
  claimantName!: string;

  @IsIn(COPYRIGHT_CLAIMANT_ROLES)
  claimantRole!: CopyrightClaimantRole;

  @Transform(clean)
  @IsString()
  @MinLength(COPYRIGHT_CLAIM_LIMITS.workDescription.min)
  @MaxLength(COPYRIGHT_CLAIM_LIMITS.workDescription.max)
  workDescription!: string;

  @Transform(clean)
  @IsString()
  @MinLength(COPYRIGHT_CLAIM_LIMITS.evidence.min)
  @MaxLength(COPYRIGHT_CLAIM_LIMITS.evidence.max)
  evidence!: string;

  @Equals(true)
  goodFaith!: true;

  @Equals(true)
  accuracy!: true;
}
