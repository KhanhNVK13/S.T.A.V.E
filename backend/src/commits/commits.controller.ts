import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import type {
  CommitRow,
  PaginatedCommitHistory,
  TagRow,
  CommitWithAuthor,
} from '@stave/shared-types';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { SessionAuthGuard } from '../common/guards/session-auth.guard';
import { CurrentUser } from '../common/decorators';
import { CommitsService } from './commits.service';
import { DiffService, SnapshotDiff } from './diff.service';
import {
  CreateCommitDto,
  GetCommitHistoryDto,
  TagCommitDto,
  RestoreCommitDto,
  CompareCommitsDto,
} from './dto';

/**
 * Commits Controller - UC-42, UC-43, UC-44, UC-45, UC-46
 *
 * Endpoints:
 * POST   /commits           - Create a new commit (UC-42)
 * GET    /commits           - Get commit history with pagination (UC-43)
 * GET    /commits/diff      - Compare two commits (UC-45)
 * GET    /commits/:id       - Get single commit by ID (UC-43)
 * POST   /commits/:id/restore - Restore a previous commit (UC-46)
 * POST   /commits/:id/tag   - Tag a commit (UC-44)
 * GET    /commits/:id/tags  - Get tags for a commit (UC-44)
 * DELETE /commits/:id/tags/:tagName - Delete a tag (UC-44)
 *
 * Guards: JwtAuthGuard + SessionAuthGuard (both required)
 */
@Controller('commits')
@UseGuards(JwtAuthGuard, SessionAuthGuard)
export class CommitsController {
  constructor(
    private readonly commitsService: CommitsService,
    private readonly diffService: DiffService,
  ) {}

  // ==========================================================================
  // UC-42: Create Commit
  // ==========================================================================

  /**
   * POST /commits
   *
   * Create a new commit with full snapshot.
   *
   * Body: CreateCommitDto
   * - branch_id: UUID of target branch
   * - message: commit message (1-200 chars)
   * - snapshot: optional, if omitted uses current draft
   * - expectedHeadCommitId: optional, for concurrency protection
   *
   * Returns: CommitRow
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createCommit(
    @CurrentUser() userId: string,
    @Body() dto: CreateCommitDto,
  ): Promise<CommitRow> {
    return this.commitsService.createCommit(userId, dto);
  }

  // ==========================================================================
  // UC-43: Get Commit History
  // ==========================================================================

  /**
   * GET /commits
   *
   * Get paginated commit history.
   *
   * Query params:
   * - branch_id: filter by branch (optional)
   * - page: page number (default: 1)
   * - limit: items per page (default: 20, max: 100)
   *
   * Returns: PaginatedCommitHistory
   */
  @Get()
  async getCommitHistory(
    @CurrentUser() userId: string,
    @Query() dto: GetCommitHistoryDto,
  ): Promise<PaginatedCommitHistory> {
    return this.commitsService.getCommitHistory(dto, userId);
  }

  // ==========================================================================
  // UC-45: Compare Versions
  // ==========================================================================

  /**
   * GET /commits/diff
   *
   * Compare two commits and return detailed diff.
   *
   * Query params:
   * - baseCommitId: UUID of base commit (mandatory)
   * - targetCommitId: UUID of target commit (mandatory)
   *
   * Both commits must belong to the same project (BR-46).
   *
   * Returns: SnapshotDiff with notes/tracks changes grouped by bar
   */
  @Get('diff')
  async compareCommits(
    @CurrentUser() userId: string,
    @Query() dto: CompareCommitsDto,
  ): Promise<SnapshotDiff> {
    return this.commitsService.compareCommits(
      dto.baseCommitId,
      dto.targetCommitId,
      userId,
    );
  }

  // ==========================================================================
  // UC-43: Get Single Commit
  // ==========================================================================

  /**
   * GET /commits/:id
   *
   * Get single commit by ID with author info and tags.
   *
   * Returns: CommitWithAuthor
   */
  @Get(':id')
  async getCommitById(
    @CurrentUser() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<CommitWithAuthor> {
    return this.commitsService.getCommitById(id, userId);
  }

  // ==========================================================================
  // UC-46: Restore Previous Version
  // ==========================================================================

  /**
   * POST /commits/:id/restore
   *
   * Restore a previous commit by creating a new commit with that snapshot.
   *
   * BR-47: Restore never deletes history - creates a NEW commit
   * PRE-3: If selected commit is already the head, returns error
   * POST-4: Draft is updated to match restored state
   *
   * Body: RestoreCommitDto
   * - branch_id: UUID of target branch (mandatory)
   * - message: optional, defaults to "Revert to commit <short_id>"
   *
   * Returns: CommitRow (the newly created restore commit)
   */
  @Post(':id/restore')
  @HttpCode(HttpStatus.CREATED)
  async restoreCommit(
    @CurrentUser() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RestoreCommitDto,
  ): Promise<CommitRow> {
    return this.commitsService.restoreCommit(id, userId, dto);
  }

  // ==========================================================================
  // UC-44: Tag Commit
  // ==========================================================================

  /**
   * POST /commits/:id/tag
   *
   * Create or update a tag for a commit.
   *
   * BR-44: Tag name must be unique within the same project
   *
   * Body: TagCommitDto
   * - tag: tag name (alphanumeric with hyphens, 1-30 chars)
   * - color: optional hex color
   *
   * Returns: TagRow
   */
  @Post(':id/tag')
  @HttpCode(HttpStatus.CREATED)
  async tagCommit(
    @CurrentUser() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TagCommitDto,
  ): Promise<TagRow> {
    return this.commitsService.tagCommit(id, userId, dto);
  }

  /**
   * GET /commits/:id/tags
   *
   * Get all tags for a specific commit.
   *
   * Returns: TagRow[]
   */
  @Get(':id/tags')
  async getTagsForCommit(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<TagRow[]> {
    return this.commitsService.getTagsForCommit(id);
  }

  /**
   * DELETE /commits/:id/tags/:tagName
   *
   * Delete a specific tag from a commit.
   *
   * Returns: 204 No Content
   */
  @Delete(':id/tags/:tagName')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteTag(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('tagName') tagName: string,
  ): Promise<void> {
    return this.commitsService.deleteTag(id, tagName);
  }
}
