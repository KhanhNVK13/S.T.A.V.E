import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { ConflictResolution } from '../../merge/dto/resolve-conflict.dto';

export const PULL_REQUEST_STATUSES = ['open', 'merged', 'closed'] as const;
export type PullRequestStatus = (typeof PULL_REQUEST_STATUSES)[number];

export class PreviewPullRequestQueryDto {
  @IsUUID('4')
  sourceBranchId!: string;

  @IsUUID('4')
  targetBranchId!: string;
}

export class CreatePullRequestDto {
  @IsUUID('4')
  sourceBranchId!: string;

  @IsUUID('4')
  targetBranchId!: string;

  @IsString()
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;
}

export class ListPullRequestsQueryDto {
  @IsOptional()
  @IsIn(['incoming', 'created'])
  view?: 'incoming' | 'created' = 'incoming';

  @IsOptional()
  @IsIn(PULL_REQUEST_STATUSES)
  status?: PullRequestStatus;
}

export class ProjectPullRequestsQueryDto {
  @IsOptional()
  @IsIn(PULL_REQUEST_STATUSES)
  status?: PullRequestStatus;
}

export class CommentPullRequestDto {
  @IsString()
  body!: string;
}

export class ClosePullRequestDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;
}

export class MergePullRequestDto {
  @IsOptional()
  @IsUUID('4')
  expectedTargetHeadCommitId?: string;
}

export class ResolvePullRequestDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ConflictResolution)
  resolutions!: ConflictResolution[];

  @IsOptional()
  @IsString()
  @MaxLength(200)
  message?: string;

  @IsOptional()
  @IsUUID('4')
  expectedTargetHeadCommitId?: string;
}
