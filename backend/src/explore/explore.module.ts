import { Module } from '@nestjs/common';
import { ExploreController } from './explore.controller';
import { ExploreService } from './explore.service';
import { PublicHistoryController } from './public-history.controller';
import { MemberPreviewController } from './member-preview.controller';
import { PublicHistoryService } from './public-history.service';
import { DiffService } from '../commits/diff.service';
import { ProjectAccessModule } from '../project-access/project-access.module';
import { MusicalFingerprintModule } from '../musical-fingerprint/musical-fingerprint.module';

@Module({
  imports: [ProjectAccessModule, MusicalFingerprintModule],
  controllers: [
    ExploreController,
    PublicHistoryController,
    MemberPreviewController,
  ],
  providers: [ExploreService, PublicHistoryService, DiffService],
  exports: [ExploreService],
})
export class ExploreModule {}
