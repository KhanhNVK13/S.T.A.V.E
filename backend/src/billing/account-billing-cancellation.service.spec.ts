import {
  InternalServerErrorException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  createSupabaseMock,
  type QueryResult,
} from '../test-utils/supabase-mock';
import { AccountBillingCancellation } from './account-billing-cancellation.service';
import type { PaymentGateway } from './payment-gateway';

describe('AccountBillingCancellation.cancelAll(userId, failureMessage)', () => {
  const ok: QueryResult = { data: null, error: null };

  const make = (
    transactions: QueryResult[],
    subscriptions: QueryResult[] = [ok],
    cancelPayment: jest.Mock = jest.fn().mockResolvedValue(undefined),
  ) => {
    const mock = createSupabaseMock([], {
      tables: { transactions, subscriptions },
    });
    const service = new AccountBillingCancellation(mock.client, {
      cancelPayment,
    } as unknown as PaymentGateway);
    return { service, mock, cancelPayment };
  };

  it('does not call the gateway when the user has no pending order, and cancels the active subscription', async () => {
    const { service, mock, cancelPayment } = make([{ data: [], error: null }]);

    await expect(service.cancelAll('usr_1', 'failed')).resolves.toBeUndefined();

    expect(cancelPayment).not.toHaveBeenCalled();
    expect(mock.builders.subscriptions.update).toHaveBeenCalledWith({
      status: 'canceled',
      pending_plan_id: null,
    });
    expect(mock.builders.subscriptions.eq).toHaveBeenCalledWith(
      'status',
      'active',
    );
  });

  it('cancels every pending order at the gateway and marks them failed', async () => {
    const { service, mock, cancelPayment } = make([
      {
        data: [
          { id: 't1', order_code: 11 },
          { id: 't2', order_code: 22 },
        ],
        error: null,
      },
      ok,
    ]);

    await service.cancelAll('usr_1', 'failed');

    expect(cancelPayment).toHaveBeenCalledTimes(2);
    expect(mock.builders.transactions.update).toHaveBeenCalledWith({
      status: 'failed',
    });
  });

  it('throws ServiceUnavailableException and cancels nothing when the gateway fails', async () => {
    const { service, mock } = make(
      [{ data: [{ id: 't1', order_code: 11 }], error: null }],
      [ok],
      jest.fn().mockRejectedValue(new Error('offline')),
    );

    await expect(service.cancelAll('usr_1', 'failed')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );

    expect(mock.builders.subscriptions.update).not.toHaveBeenCalled();
    expect(mock.builders.transactions.update).not.toHaveBeenCalled();
  });

  it('reports the failure message when the subscription update fails', async () => {
    const { service } = make(
      [{ data: [], error: null }],
      [{ data: null, error: { message: 'db' } }],
    );

    await expect(
      service.cancelAll('usr_1', 'Could not delete account'),
    ).rejects.toThrow(
      new InternalServerErrorException('Could not delete account'),
    );
  });

  it('reports the failure message when the pending orders cannot be read', async () => {
    const { service } = make([{ data: null, error: { message: 'db' } }]);

    await expect(
      service.cancelAll('usr_1', 'Could not delete account'),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
  });
});
