import { IsISO8601, IsOptional, IsUUID } from 'class-validator';

/**
 * Query params of GET /projects/:projectId/contributions (UC-65).
 * The global ValidationPipe runs with `whitelist: true` + `transform: true`,
 * so every param the service accepts has to carry a decorator here —
 * undeclared params are silently stripped.
 */
export class ListContributionsQueryDto {
  /** Restrict to one branch of the project. */
  @IsOptional()
  @IsUUID()
  branchId?: string;

  /** ISO 8601 lower bound on commit created_at. */
  @IsOptional()
  @IsISO8601()
  from?: string;

  /** ISO 8601 upper bound on commit created_at. */
  @IsOptional()
  @IsISO8601()
  to?: string;

  /** Restrict the response to one author. */
  @IsOptional()
  @IsUUID()
  userId?: string;
}
