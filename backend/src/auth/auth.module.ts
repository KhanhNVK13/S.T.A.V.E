import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AccountRemovalModule } from '../account-removal/account-removal.module';
import { createEmailSender, EMAIL_SENDER } from '../notifications/email-sender';

@Module({
  imports: [AccountRemovalModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    { provide: EMAIL_SENDER, useFactory: () => createEmailSender() },
  ],
  exports: [AuthService],
})
export class AuthModule {}
