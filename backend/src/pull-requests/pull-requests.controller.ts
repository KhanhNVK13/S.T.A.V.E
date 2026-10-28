import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { SessionAuthGuard } from '../common/guards/session-auth.guard';
import type { AuthenticatedRequest } from '../common/guards/jwt-auth.guard';
import { PullRequestsService } from './pull-requests.service';
import { PullRequestMergeService } from './pull-request-merge.service';
import {
  ClosePullRequestDto,
  CommentPullRequestDto,
  CreatePullRequestDto,
  ListPullRequestsQueryDto,
  MergePullRequestDto,
  PreviewPullRequestQueryDto,
  ProjectPullRequestsQueryDto,
  ResolvePullRequestDto,
} from './dto/pull-request.dto';

@UseGuards(JwtAuthGuard, SessionAuthGuard)
@Controller()
export class PullRequestsController {
  constructor(
    private readonly pullRequests: PullRequestsService,
    private readonly merges: PullRequestMergeService,
  ) {}

  @Get('projects/:projectId/pull-requests/target-branches')
  targetBranches(
    @Req() req: AuthenticatedRequest,
    @Param('projectId', ParseUUIDPipe) projectId: string,
  ) {
    return this.pullRequests.targetBranches(projectId, req.user.id);
  }

  @Get('projects/:projectId/pull-requests/preview')
  preview(
    @Req() req: AuthenticatedRequest,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query() query: PreviewPullRequestQueryDto,
  ) {
    return this.pullRequests.preview(
      projectId,
      req.user.id,
      query.sourceBranchId,
      query.targetBranchId,
    );
  }

  @Post('projects/:projectId/pull-requests')
  create(
    @Req() req: AuthenticatedRequest,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() dto: CreatePullRequestDto,
  ) {
    return this.pullRequests.create(projectId, req.user.id, dto);
  }

  @Get('projects/:projectId/pull-requests')
  listForProject(
    @Req() req: AuthenticatedRequest,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query() query: ProjectPullRequestsQueryDto,
  ) {
    return this.pullRequests.listForProject(
      projectId,
      req.user.id,
      query.status,
    );
  }

  @Get('pull-requests')
  list(
    @Req() req: AuthenticatedRequest,
    @Query() query: ListPullRequestsQueryDto,
  ) {
    return this.pullRequests.list(req.user.id, query);
  }

  @Get('pull-requests/:id')
  get(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.pullRequests.get(id, req.user.id);
  }

  @Post('pull-requests/:id/comments')
  comment(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CommentPullRequestDto,
  ) {
    return this.pullRequests.addComment(id, req.user.id, dto);
  }

  @Delete('pull-requests/:id/comments/:commentId')
  deleteComment(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('commentId', ParseUUIDPipe) commentId: string,
  ) {
    return this.pullRequests.deleteComment(id, commentId, req.user.id);
  }

  @Post('pull-requests/:id/merge')
  merge(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MergePullRequestDto,
  ) {
    return this.merges.mergePullRequest(id, req.user.id, dto);
  }

  @Post('pull-requests/:id/merge/resolve')
  resolve(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResolvePullRequestDto,
  ) {
    return this.merges.resolvePullRequest(id, req.user.id, dto);
  }

  @Post('pull-requests/:id/close')
  close(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ClosePullRequestDto,
  ) {
    return this.pullRequests.close(id, req.user.id, dto);
  }
}
