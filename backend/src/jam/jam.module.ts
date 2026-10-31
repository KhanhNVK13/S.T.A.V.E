import { Module } from '@nestjs/common';
import { JamController } from './jam.controller';
import { JamService } from './jam.service';
import { JamGateway } from './jam.gateway';
import { NotificationsModule } from '../notifications/notifications.module';

/**
 * UC-66/67/68 — Community Jam: HTTP listing/join/result surface + the live
 * `/jam` Socket.IO room. `JamService` owns the in-RAM room state; the gateway
 * translates sockets to it. No version control inside a jam (BR-74).
 *
 * `NotificationsModule` provides `NotificationsService` (in-app
 * notices, CLAUDE.md §4.6).
 */
@Module({
  imports: [NotificationsModule],
  controllers: [JamController],
  providers: [JamService, JamGateway],
  exports: [JamService],
})
export class JamModule {}
