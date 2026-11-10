import { createSupabaseMock } from '../test-utils/supabase-mock';
import { FakeGateway } from './fake.gateway';

const order = {
  orderCode: 1730000000000123,
  amountVnd: 49000,
  description: 'STAVE 1730000000000123',
  returnUrl: 'http://localhost:3000/billing/result?orderCode=1730000000000123',
  cancelUrl: 'http://localhost:3000/plans?canceled=1',
};

describe('BE-BIL-08 FakeGateway', () => {
  it('UTCID01 sends the browser to the fake payment page', async () => {
    const gateway = new FakeGateway(
      createSupabaseMock().client,
      'http://localhost:3000',
    );
    await expect(gateway.createCheckout(order)).resolves.toEqual({
      checkoutUrl:
        'http://localhost:3000/dev/fake-payment?orderCode=1730000000000123',
      providerRef: 'fake-1730000000000123',
    });
  });

  it('UTCID02 never accepts a webhook', async () => {
    const gateway = new FakeGateway(createSupabaseMock().client, 'x');
    await expect(gateway.verifyWebhook()).resolves.toBeNull();
  });

  it('UTCID03 reads the payment status from the transaction row', async () => {
    const mock = createSupabaseMock([], {
      tables: { transactions: [{ data: { status: 'success' }, error: null }] },
    });
    const gateway = new FakeGateway(mock.client, 'x');
    await expect(gateway.getPaymentStatus(7)).resolves.toBe('success');
    expect(mock.builders.transactions.eq).toHaveBeenCalledWith('order_code', 7);
  });

  it('UTCID04 reports an unknown order as failed', async () => {
    const mock = createSupabaseMock([], {
      tables: { transactions: [{ data: null, error: null }] },
    });
    await expect(
      new FakeGateway(mock.client, 'x').getPaymentStatus(7),
    ).resolves.toBe('failed');
  });

  it('UTCID05 throws when the status cannot be read', async () => {
    const mock = createSupabaseMock([], {
      tables: { transactions: [{ data: null, error: { message: 'down' } }] },
    });
    await expect(
      new FakeGateway(mock.client, 'x').getPaymentStatus(7),
    ).rejects.toThrow('Could not read payment status');
  });
});
