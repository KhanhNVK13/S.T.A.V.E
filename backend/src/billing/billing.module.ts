import { Logger, Module, type DynamicModule } from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import { NotificationsModule } from '../notifications/notifications.module';
import { SUPABASE_ADMIN_CLIENT } from '../supabase/supabase.constants';
import { BillingHistoryService } from './billing-history.service';
import {
  BillingSchedulerService,
  BILLING_PAYMENT_PROVIDER,
} from './billing-scheduler.service';
import { BillingController } from './billing.controller';
import { DevFakePaymentController } from './dev-fake-payment.controller';
import { PAYMENT_GATEWAY } from './payment-gateway';
import {
  createPaymentGateway,
  frontendUrl,
  isFakePaymentEnabled,
  resolvePaymentProvider,
  type BillingEnv,
} from './payment-gateway.factory';
import { PaymentsController } from './payments.controller';
import { BILLING_FRONTEND_URL, PaymentsService } from './payments.service';
import { SubscriptionChangesService } from './subscription-changes.service';
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
        BillingController,
        ...(isFakePaymentEnabled(env) ? [DevFakePaymentController] : []),
      ],
      providers: [
        SubscriptionsService,
        PaymentsService,
        BillingHistoryService,
        SubscriptionChangesService,
        BillingSchedulerService,
        { provide: BILLING_FRONTEND_URL, useValue: frontendUrl(env) },
        {
          provide: BILLING_PAYMENT_PROVIDER,
          useValue: resolvePaymentProvider(env),
        },
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
