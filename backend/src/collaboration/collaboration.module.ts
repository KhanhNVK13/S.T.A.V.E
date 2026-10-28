import { Module } from '@nestjs/common';
import { CollaborationController } from './collaboration.controller';
import { CollaborationService } from './collaboration.service';
import { CollaborationGateway } from './collaboration.gateway';
import { ProjectAccessModule } from '../project-access/project-access.module';

/**
 * UC-60/61/62/64: collaborator invitations, permission levels, removal,
 * and the real-time presence gateway. ProjectAccessService is injected for
 * the owner/accepted/pending checks; SUPABASE_ADMIN_CLIENT is a global
 * provider the gateway's handshake auth uses.
 */
@Module({
  imports: [ProjectAccessModule],
  controllers: [CollaborationController],
  providers: [CollaborationService, CollaborationGateway],
  exports: [CollaborationService, CollaborationGateway],
})
export class CollaborationModule {}
