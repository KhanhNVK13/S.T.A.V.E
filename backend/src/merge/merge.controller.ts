import {
  Controller,
  Post,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  HttpException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { SessionAuthGuard } from '../common/guards/session-auth.guard';
import { CurrentUser } from '../common/decorators';
import {
  MergeService,
  MergeConflictResult,
  MergeSuccessResult,
} from './merge.service';
import { MergeBranchDto } from './dto/merge-branch.dto';
import { ResolveConflictDto } from './dto/resolve-conflict.dto';

/**
 * Custom exception for merge conflicts
 */
class ConflictException extends HttpException {
  constructor(private readonly conflictResult: MergeConflictResult) {
    super(
      {
        statusCode: HttpStatus.CONFLICT,
        message: 'Merge conflicts detected',
        conflicts: conflictResult,
      },
      HttpStatus.CONFLICT,
    );
  }
}

/**
 * Merge Controller - UC-51
 *
 * Endpoints:
 * POST   /branches/merge              - Initiate merge (UC-51)
 * POST   /branches/merge/resolve     - Resolve conflicts and complete merge (UC-51)
 *
 * UC-52 (delete-preview / delete branch) lives in BranchesController instead —
 * it's a branch-lifecycle concern, not a merge concern.
 *
 * Guards: JwtAuthGuard + SessionAuthGuard (both required)
 */
@Controller('branches')
@UseGuards(JwtAuthGuard, SessionAuthGuard)
export class MergeController {
  constructor(private readonly mergeService: MergeService) {}

  // ==========================================================================
  // UC-51: Merge Branch
  // ==========================================================================

  /**
   * POST /branches/merge
   *
   * Initiate a merge from source branch to target branch.
   *
   * Business Rules:
   * - BR-52: Source and target must belong to the same project
   * - BR-53: Returns conflicts if detected
   * - 7.1: Fast-forward if target hasn't diverged
   *
   * Body: MergeBranchDto
   * - sourceBranchId: UUID of source branch
   * - targetBranchId: UUID of target branch
   *
   * Returns:
   * - 200 OK with commit if auto-merged successfully
   * - 409 Conflict with conflict details if conflicts detected
   */
  @Post('merge')
  @HttpCode(HttpStatus.OK)
  async mergeBranch(
    @CurrentUser() userId: string,
    @Body() dto: MergeBranchDto,
  ): Promise<MergeSuccessResult> {
    const result = await this.mergeService.mergeBranch(userId, dto);

    // If conflicts exist, return 409 Conflict
    if (result.hasConflicts) {
      throw new ConflictException(result);
    }

    // Type guard - after checking hasConflicts, this is MergeSuccessResult
    return result as MergeSuccessResult;
  }

  /**
   * POST /branches/merge/resolve
   *
   * Resolve conflicts and complete the merge.
   *
   * Business Rules:
   * - All conflicts must be resolved
   * - Creates merge commit after resolution
   *
   * Body: ResolveConflictDto
   * - sourceBranchId, targetBranchId: Branch identifiers
   * - resolutions: Array of conflict resolutions
   * - message: Optional custom commit message
   *
   * Returns: MergeSuccessResult with created commit
   */
  @Post('merge/resolve')
  @HttpCode(HttpStatus.CREATED)
  async resolveConflicts(
    @CurrentUser() userId: string,
    @Body() dto: ResolveConflictDto,
  ): Promise<MergeSuccessResult> {
    return this.mergeService.resolveConflictsAndMerge(userId, dto);
  }
}
