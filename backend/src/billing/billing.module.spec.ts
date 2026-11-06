import { Global, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { BillingModule } from './billing.module';
import { DevFakePaymentController } from './dev-fake-payment.controller';
import { FakePaymentResultParamsDto } from './dto/fake-payment.dto';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionsService } from './subscriptions.service';
import { PaymentsService } from './payments.service';
import { PAYMENT_GATEWAY } from './payment-gateway';
import { FakeGateway } from './fake.gateway';
import { PayosGateway } from './payos.gateway';
import { SUPABASE_ADMIN_CLIENT } from '../supabase/supabase.constants';
import { createSupabaseMock } from '../test-utils/supabase-mock';

const controllersFor = (env: Record<string, string | undefined>) =>
  BillingModule.register(env).controllers ?? [];

describe('BE-BIL-12 BillingModule.register', () => {
  it('UTCID01 registers the fake payment controller for PAYMENT_PROVIDER=fake outside production', () => {
    expect(
      controllersFor({ PAYMENT_PROVIDER: 'fake', NODE_ENV: 'development' }),
    ).toEqual([SubscriptionsController, DevFakePaymentController]);
  });

  it('UTCID02 never registers the fake payment controller in production', () => {
    expect(
      controllersFor({ PAYMENT_PROVIDER: 'fake', NODE_ENV: 'production' }),
    ).toEqual([SubscriptionsController]);
  });

  it('UTCID03 does not register it for PayOS or when PAYMENT_PROVIDER is not set', () => {
    expect(controllersFor({ PAYMENT_PROVIDER: 'payos' })).not.toContain(
      DevFakePaymentController,
    );
    expect(controllersFor({})).not.toContain(DevFakePaymentController);
  });
});

describe('BE-BIL-13 FakePaymentResultParamsDto', () => {
  const check = (params: Record<string, string>) =>
    validate(plainToInstance(FakePaymentResultParamsDto, params));

  it('UTCID01 accepts a positive order code and a known result', async () => {
    await expect(
      check({ orderCode: '1730000000000123', result: 'cancel' }),
    ).resolves.toHaveLength(0);
  });

  it('UTCID02 rejects an unknown result', async () => {
    const errors = await check({ orderCode: '5', result: 'refund' });
    expect(errors.map((e) => e.property)).toEqual(['result']);
  });

  it('UTCID03 rejects a non-numeric or non-positive order code', async () => {
    for (const orderCode of ['abc', '0', '-3', '1.5', '99999999999999999999']) {
      const errors = await check({ orderCode, result: 'success' });
      expect(errors.map((e) => e.property)).toEqual(['orderCode']);
    }
  });
});

@Global()
@Module({
  providers: [
    { provide: SUPABASE_ADMIN_CLIENT, useValue: createSupabaseMock().client },
  ],
  exports: [SUPABASE_ADMIN_CLIENT],
})
class TestSupabaseModule {}

describe('BE-BIL-15 BillingModule wiring', () => {
  async function compile(env: Record<string, string | undefined>) {
    return Test.createTestingModule({
      imports: [TestSupabaseModule, BillingModule.register(env)],
    }).compile();
  }

  it('UTCID01 resolves the services and the fake gateway', async () => {
    const moduleRef = await compile({ PAYMENT_PROVIDER: 'fake' });
    expect(moduleRef.get(SubscriptionsService)).toBeInstanceOf(
      SubscriptionsService,
    );
    expect(moduleRef.get(PaymentsService)).toBeInstanceOf(PaymentsService);
    expect(moduleRef.get(PAYMENT_GATEWAY)).toBeInstanceOf(FakeGateway);
    expect(moduleRef.get(DevFakePaymentController)).toBeInstanceOf(
      DevFakePaymentController,
    );
  });

  it('UTCID02 resolves the PayOS gateway when configured', async () => {
    const moduleRef = await compile({
      PAYMENT_PROVIDER: 'payos',
      PAYOS_CLIENT_ID: 'client',
      PAYOS_API_KEY: 'api',
      PAYOS_CHECKSUM_KEY: 'checksum',
    });
    expect(moduleRef.get(PAYMENT_GATEWAY)).toBeInstanceOf(PayosGateway);
    expect(() => moduleRef.get(DevFakePaymentController)).toThrow();
  });

  it('UTCID03 refuses to start with PayOS but no keys', async () => {
    await expect(compile({ PAYMENT_PROVIDER: 'payos' })).rejects.toThrow(
      'PAYMENT_PROVIDER=payos requires',
    );
  });
});
