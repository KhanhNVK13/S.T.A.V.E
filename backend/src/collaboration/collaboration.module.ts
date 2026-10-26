import { Module } from '@nestjs/common';
import { CollaborationController } from './collaboration.controller';
import { CollaborationService } from './collaboration.service';
import { ProjectAccessModule } from '../project-access/project-access.module';

/**
 * UC-60/61/62: collaborator invitations, permission levels, removal.
 * ProjectAccessService is injected for the owner/accepted/pending checks.
 */
@Module({
  imports: [ProjectAccessModule],
  controllers: [CollaborationController],
  providers: [CollaborationService],
  exports: [CollaborationService],
})
export class CollaborationModule {}
