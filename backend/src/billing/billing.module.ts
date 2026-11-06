import { Logger, Module, type DynamicModule } from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import { NotificationsModule } from '../notifications/notifications.module';
import { SUPABASE_ADMIN_CLIENT } from '../supabase/supabase.constants';
import { DevFakePaymentController } from './dev-fake-payment.controller';
import { PAYMENT_GATEWAY } from './payment-gateway';
import {
  createPaymentGateway,
  frontendUrl,
  isFakePaymentEnabled,
  type BillingEnv,
} from './payment-gateway.factory';
import { PaymentsController } from './payments.controller';
import { BILLING_FRONTEND_URL, PaymentsService } from './payments.service';
import { SubscriptionPlansController } from './subscription-plans.controller';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionsService } from './subscriptions.service';

@Module({})
export class BillingModule {
  static register(env: BillingEnv = process.env): DynamicModule {
    return {
      module: BillingModule,
      global: true,
      imports: [NotificationsModule],
      controllers: [
        SubscriptionsController,
        SubscriptionPlansController,
        PaymentsController,
        ...(isFakePaymentEnabled(env) ? [DevFakePaymentController] : []),
      ],
      providers: [
        SubscriptionsService,
        PaymentsService,
        { provide: BILLING_FRONTEND_URL, useValue: frontendUrl(env) },
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
