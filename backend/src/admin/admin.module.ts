import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AccountRemovalModule } from '../account-removal/account-removal.module';
import { JamModule } from '../jam/jam.module';
import { createEmailSender, EMAIL_SENDER } from '../notifications/email-sender';

@Module({
  imports: [AccountRemovalModule, JamModule],
  controllers: [AdminController],
  providers: [
    AdminService,
    { provide: EMAIL_SENDER, useFactory: () => createEmailSender() },
  ],
})
export class AdminModule {}
