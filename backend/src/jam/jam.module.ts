import { Module } from '@nestjs/common';
import { JamController } from './jam.controller';
import { JamService } from './jam.service';
import { JamGateway } from './jam.gateway';

/**
 * UC-66 — Community Jam: HTTP listing/join surface + the live `/jam`
 * Socket.IO room. `JamService` owns the in-RAM room state; the gateway
 * translates sockets to it. No version control inside a jam (BR-74).
 */
@Module({
  controllers: [JamController],
  providers: [JamService, JamGateway],
  exports: [JamService],
})
export class JamModule {}
