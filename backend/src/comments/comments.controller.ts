import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { SessionAuthGuard } from '../common/guards/session-auth.guard';
import { CurrentUser } from '../common/decorators';
import { CommentsService } from './comments.service';
import { CreateCommentDto } from './dto/create-comment.dto';

/**
 * Comments Controller — UC-63 (pinned comment). Guarded like every other
 * logged-in endpoint; access itself is checked per operation inside the
 * service (assertCanView / author-or-owner delete).
 */
@Controller()
@UseGuards(JwtAuthGuard, SessionAuthGuard)
export class CommentsController {
  constructor(private readonly commentsService: CommentsService) {}

  /** GET /projects/:projectId/comments — flat list (newest reply info inline). */
  @Get('projects/:projectId/comments')
  listComments(
    @CurrentUser() userId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
  ) {
    return this.commentsService.listComments(projectId, userId);
  }

  /** POST /projects/:projectId/comments — any viewer can comment (BR-69). */
  @Post('projects/:projectId/comments')
  @HttpCode(HttpStatus.CREATED)
  createComment(
    @CurrentUser() userId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() dto: CreateCommentDto,
  ) {
    return this.commentsService.createComment(projectId, dto, userId);
  }

  /**
   * DELETE /projects/:projectId/comments/:commentId — the author may delete
   * their own comment; the owner may delete any (BR-69).
   */
  @Delete('projects/:projectId/comments/:commentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteComment(
    @CurrentUser() userId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('commentId', ParseUUIDPipe) commentId: string,
  ): Promise<void> {
    return this.commentsService.deleteComment(projectId, commentId, userId);
  }
}
