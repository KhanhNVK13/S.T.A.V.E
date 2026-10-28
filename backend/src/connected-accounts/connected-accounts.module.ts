import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { ConnectedAccountsController } from './connected-accounts.controller';
import { ConnectedAccountsService } from './connected-accounts.service';

@Module({
  imports: [NotificationsModule],
  controllers: [ConnectedAccountsController],
  providers: [ConnectedAccountsService],
})
export class ConnectedAccountsModule {}
