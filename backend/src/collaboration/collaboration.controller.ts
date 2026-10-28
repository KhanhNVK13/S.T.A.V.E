import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { SessionAuthGuard } from '../common/guards/session-auth.guard';
import { CurrentUser } from '../common/decorators';
import { CollaborationService } from './collaboration.service';
import { InviteCollaboratorDto } from './dto/invite-collaborator.dto';
import { PatchCollaboratorDto } from './dto/patch-collaborator.dto';

/**
 * Collaboration Controller — UC-60 (invite), UC-61 (permission level),
 * UC-62 (remove). One line per the project rule: what this controller
 * covers, nothing more.
 */
@Controller()
@UseGuards(JwtAuthGuard, SessionAuthGuard)
export class CollaborationController {
  constructor(private readonly collaborationService: CollaborationService) {}

  // ==========================================================================
  // UC-60: Invite / list
  // ==========================================================================

  /** GET /projects/:projectId/collaborators — list the team. */
  @Get('projects/:projectId/collaborators')
  listCollaborators(
    @CurrentUser() userId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
  ) {
    return this.collaborationService.listCollaborators(projectId, userId);
  }

  /** POST /projects/:projectId/collaborators — owner invites someone. */
  @Post('projects/:projectId/collaborators')
  @HttpCode(HttpStatus.CREATED)
  inviteCollaborator(
    @CurrentUser() userId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() dto: InviteCollaboratorDto,
  ) {
    return this.collaborationService.inviteCollaborator(projectId, dto, userId);
  }

  // ==========================================================================
  // UC-60: My invitations
  // ==========================================================================

  /** GET /users/me/collaboration-invitations — pending invitations for me. */
  @Get('users/me/collaboration-invitations')
  getMyInvitations(@CurrentUser() userId: string) {
    return this.collaborationService.getMyInvitations(userId);
  }

  /** POST /users/me/collaboration-invitations/:id/accept */
  @Post('users/me/collaboration-invitations/:id/accept')
  @HttpCode(HttpStatus.OK)
  acceptInvitation(
    @CurrentUser() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.collaborationService.acceptInvitation(id, userId);
  }

  /** POST /users/me/collaboration-invitations/:id/decline */
  @Post('users/me/collaboration-invitations/:id/decline')
  @HttpCode(HttpStatus.OK)
  declineInvitation(
    @CurrentUser() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.collaborationService.declineInvitation(id, userId);
  }

  // ==========================================================================
  // UC-61: Change permission level
  // ==========================================================================

  /** PATCH /projects/:projectId/collaborators/:collaboratorId */
  @Patch('projects/:projectId/collaborators/:collaboratorId')
  patchCollaborator(
    @CurrentUser() userId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('collaboratorId', ParseUUIDPipe) collaboratorId: string,
    @Body() dto: PatchCollaboratorDto,
  ) {
    return this.collaborationService.patchCollaborator(
      projectId,
      collaboratorId,
      dto,
      userId,
    );
  }

  // ==========================================================================
  // UC-62: Remove collaborator
  // ==========================================================================

  /** DELETE /projects/:projectId/collaborators/:collaboratorId */
  @Delete('projects/:projectId/collaborators/:collaboratorId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeCollaborator(
    @CurrentUser() userId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('collaboratorId', ParseUUIDPipe) collaboratorId: string,
  ): Promise<void> {
    return this.collaborationService.removeCollaborator(
      projectId,
      collaboratorId,
      userId,
    );
  }
}
