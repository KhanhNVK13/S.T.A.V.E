import {
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { createSupabaseMock } from '../test-utils/supabase-mock';
import { PaymentsService } from './payments.service';

const userId = '44444444-4444-4444-8444-444444444444';
const otherUserId = '55555555-5555-4555-8555-555555555555';
const orderCode = 1730000000000123;

const orderRow = {
  order_code: orderCode,
  user_id: userId,
  amount_vnd: 49000,
  status: 'pending',
  plan: { name: 'STAVE+' },
};

describe('BE-BIL-10 PaymentsService.completeOrder', () => {
  it('UTCID01 completes the order through billing_complete_order', async () => {
    const mock = createSupabaseMock([], {
      rpc: {
        billing_complete_order: {
          data: {
            processed: true,
            status: 'success',
            user_id: userId,
            plan_id: 'plus',
            transaction_id: 'tx-1',
            subscription_id: 'sub-1',
            activated: true,
            activation_error: null,
          },
          error: null,
        },
      },
    });
    const service = new PaymentsService(mock.client);

    await expect(service.completeOrder(orderCode, true)).resolves.toEqual({
      processed: true,
      status: 'success',
      userId,
      planId: 'plus',
      transactionId: 'tx-1',
      subscriptionId: 'sub-1',
      activated: true,
      activationError: null,
    });
    expect(mock.rpc).toHaveBeenCalledWith('billing_complete_order', {
      p_order_code: orderCode,
      p_success: true,
    });
  });

  it('UTCID02 reports an order that was already processed', async () => {
    const mock = createSupabaseMock([], {
      rpc: {
        billing_complete_order: {
          data: {
            processed: false,
            status: 'success',
            user_id: userId,
            plan_id: 'plus',
            transaction_id: 'tx-1',
            subscription_id: null,
            activated: null,
            activation_error: null,
          },
          error: null,
        },
      },
    });
    const result = await new PaymentsService(mock.client).completeOrder(
      orderCode,
      false,
    );
    expect(result.processed).toBe(false);
    expect(mock.rpc).toHaveBeenCalledWith('billing_complete_order', {
      p_order_code: orderCode,
      p_success: false,
    });
  });

  it('UTCID03 throws when the RPC fails', async () => {
    const mock = createSupabaseMock([], {
      rpc: {
        billing_complete_order: { data: null, error: { message: 'down' } },
      },
    });
    await expect(
      new PaymentsService(mock.client).completeOrder(orderCode, true),
    ).rejects.toThrow(
      new InternalServerErrorException('Could not complete the order'),
    );
  });
});

describe('BE-BIL-11 PaymentsService.getOrderForUser', () => {
  function serviceWith(result: { data: unknown; error: unknown }) {
    const mock = createSupabaseMock([], { tables: { transactions: [result] } });
    return { service: new PaymentsService(mock.client), mock };
  }

  it('UTCID01 returns the caller own order', async () => {
    const { service, mock } = serviceWith({ data: orderRow, error: null });
    await expect(service.getOrderForUser(userId, orderCode)).resolves.toEqual({
      orderCode,
      planName: 'STAVE+',
      amountVnd: 49000,
      status: 'pending',
    });
    expect(mock.builders.transactions.eq).toHaveBeenCalledWith(
      'order_code',
      orderCode,
    );
  });

  it('UTCID02 hides an order that belongs to someone else', async () => {
    const { service } = serviceWith({ data: orderRow, error: null });
    await expect(
      service.getOrderForUser(otherUserId, orderCode),
    ).rejects.toThrow(new NotFoundException('Order not found'));
  });

  it('UTCID03 throws not found for an unknown order', async () => {
    const { service } = serviceWith({ data: null, error: null });
    await expect(service.getOrderForUser(userId, orderCode)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('UTCID04 throws when the order cannot be read', async () => {
    const { service } = serviceWith({ data: null, error: { message: 'down' } });
    await expect(service.getOrderForUser(userId, orderCode)).rejects.toThrow(
      'Could not read the order',
    );
  });
});
