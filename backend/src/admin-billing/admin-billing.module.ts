import { Module } from '@nestjs/common';
import { AdminBillingController } from './admin-billing.controller';
import { AdminBillingService } from './admin-billing.service';

@Module({
  controllers: [AdminBillingController],
  providers: [AdminBillingService],
})
export class AdminBillingModule {}
