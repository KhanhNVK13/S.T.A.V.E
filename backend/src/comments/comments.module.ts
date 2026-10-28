import { Module } from '@nestjs/common';
import { CommentsController } from './comments.controller';
import { CommentsService } from './comments.service';
import { ProjectAccessModule } from '../project-access/project-access.module';

/**
 * UC-63: pinned comments. ProjectAccessService (assertCanView / getAccess)
 * is injected for the view/owner checks; the drafts & commits tables are
 * read directly (read-only) to compute `noteMissing`.
 */
@Module({
  imports: [ProjectAccessModule],
  controllers: [CommentsController],
  providers: [CommentsService],
  exports: [CommentsService],
})
export class CommentsModule {}
