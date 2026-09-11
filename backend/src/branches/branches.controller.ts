import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
  NotFoundException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { SessionAuthGuard } from '../common/guards/session-auth.guard';
import { CurrentUser } from '../common/decorators';
import { BranchesService } from './branches.service';
import { CreateBranchDto } from './dto/create-branch.dto';
import { SwitchBranchDto } from './dto/switch-branch.dto';

/**
 * Branches Controller - UC-47, UC-48, UC-49, UC-50
 *
 * Endpoints:
 * POST   /projects/:projectId/branches - Create a new branch (UC-47)
 * GET    /projects/:projectId/branches - List all branches in project
 * POST   /branches/switch              - Switch active branch (UC-48)
 * GET    /branches/:id                - Get branch details (UC-49)
 * GET    /branches/:id/history        - Get branch history (UC-50)
 *
 * Guards: JwtAuthGuard + SessionAuthGuard (both required)
 */
@Controller()
@UseGuards(JwtAuthGuard, SessionAuthGuard)
export class BranchesController {
  constructor(private readonly branchesService: BranchesService) {}

  // ==========================================================================
  // UC-47: Create Branch
  // ==========================================================================

  /**
   * POST /projects/:projectId/branches
   *
   * Create a new branch for a project.
   *
   * Preconditions:
   * - PRE-1: Authentication required
   * - PRE-2: User must have Edit permission on project
   * - PRE-3: Project must have at least 1 commit
   *
   * Body: CreateBranchDto
   * - name: branch name (1-50 chars)
   * - startCommitId: optional starting commit
   * - sourceBranchId: optional source branch
   *
   * Returns: BranchWithAuthor
   */
  @Post('projects/:projectId/branches')
  @HttpCode(HttpStatus.CREATED)
  async createBranch(
    @CurrentUser() userId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() dto: CreateBranchDto,
  ) {
    return this.branchesService.createBranch(projectId, dto, userId);
  }

  /**
   * GET /projects/:projectId/branches
   *
   * List all branches in a project.
   *
   * Returns: BranchWithAuthor[]
   */
  @Get('projects/:projectId/branches')
  async getProjectBranches(
    @Param('projectId', ParseUUIDPipe) projectId: string,
  ) {
    return this.branchesService.getProjectBranches(projectId);
  }

  // ==========================================================================
  // UC-48: Switch Active Branch
  // ==========================================================================

  /**
   * POST /branches/switch
   *
   * Switch from one branch to another.
   *
   * Preconditions:
   * - PRE-3: Project must have more than 1 branch
   *
   * Body: SwitchBranchDto
   * - currentBranchId: branch to switch from
   * - targetBranchId: branch to switch to
   * - currentDraft: optional draft to save
   *
   * Returns: SwitchBranchResponse with activeSnapshot
   */
  @Post('branches/switch')
  @HttpCode(HttpStatus.OK)
  async switchBranch(
    @CurrentUser() userId: string,
    @Body() dto: SwitchBranchDto,
  ) {
    // Extract projectId from current branch for permission check
    const projectId = await this.getProjectIdFromBranch(dto.currentBranchId);
    return this.branchesService.switchBranch(projectId, dto, userId);
  }

  // ==========================================================================
  // UC-49: View Branch Details & Divergence
  // ==========================================================================

  /**
   * GET /branches/:id
   *
   * Get detailed information about a branch including divergence.
   *
   * Returns: BranchDetails with divergence info
   */
  @Get('branches/:id')
  async getBranchDetails(@Param('id', ParseUUIDPipe) id: string) {
    return this.branchesService.getBranchDetails(id);
  }

  // ==========================================================================
  // UC-50: View Branch History
  // ==========================================================================

  /**
   * GET /branches/:id/history
   *
   * Get commit history for a branch.
   *
   * Returns: BranchHistory with commits marked as unique/inherited
   */
  @Get('branches/:id/history')
  async getBranchHistory(@Param('id', ParseUUIDPipe) id: string) {
    return this.branchesService.getBranchHistory(id);
  }

  // ==========================================================================
  // Private Helper Methods
  // ==========================================================================

  /**
   * Helper to get project ID from branch ID
   */
  private async getProjectIdFromBranch(branchId: string): Promise<string> {
    const branch = await this.branchesService.getBranchById(branchId);
    if (!branch) {
      throw new NotFoundException('Current branch not found');
    }
    return branch.project_id;
  }
}
