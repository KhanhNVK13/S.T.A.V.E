import { Logger, Module, type DynamicModule } from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_ADMIN_CLIENT } from '../supabase/supabase.constants';
import { DevFakePaymentController } from './dev-fake-payment.controller';
import { PAYMENT_GATEWAY } from './payment-gateway';
import {
  createPaymentGateway,
  isFakePaymentEnabled,
  type BillingEnv,
} from './payment-gateway.factory';
import { PaymentsService } from './payments.service';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionsService } from './subscriptions.service';

@Module({})
export class BillingModule {
  static register(env: BillingEnv = process.env): DynamicModule {
    return {
      module: BillingModule,
      global: true,
      controllers: [
        SubscriptionsController,
        ...(isFakePaymentEnabled(env) ? [DevFakePaymentController] : []),
      ],
      providers: [
        SubscriptionsService,
        PaymentsService,
        {
          provide: PAYMENT_GATEWAY,
          inject: [SUPABASE_ADMIN_CLIENT],
          useFactory: (supabase: SupabaseClient) =>
            createPaymentGateway(env, supabase, new Logger('BillingModule')),
        },
      ],
      exports: [SubscriptionsService, PaymentsService, PAYMENT_GATEWAY],
    };
  }
}
