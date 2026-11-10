import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module';
import { CustomThemesController } from './custom-themes.controller';
import { CustomThemesService } from './custom-themes.service';

@Module({
  imports: [BillingModule.register()],
  controllers: [CustomThemesController],
  providers: [CustomThemesService],
})
export class CustomThemesModule {}
