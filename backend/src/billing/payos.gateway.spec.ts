import { PayOS, type WebhookData } from '@payos/node';
import {
  PAYOS_DESCRIPTION_MAX,
  PayosGateway,
  mapPayosStatus,
  toPayosDescription,
} from './payos.gateway';

const credentials = {
  clientId: 'client',
  apiKey: 'api',
  checksumKey: 'checksum',
};

const webhookData: WebhookData = {
  orderCode: 1730000000000123,
  amount: 49000,
  description: 'STAVE 1730000000000123',
  accountNumber: '12345678',
  reference: 'TF230204212323',
  transactionDateTime: '2026-11-06 18:25:00',
  currency: 'VND',
  paymentLinkId: 'link-1',
  code: '00',
  desc: 'Thành công',
  counterAccountBankId: '',
  counterAccountBankName: '',
  counterAccountName: '',
  counterAccountNumber: '',
  virtualAccountName: '',
  virtualAccountNumber: '',
};

async function signedWebhook(data: WebhookData, key = credentials.checksumKey) {
  const signer = new PayOS({
    ...credentials,
    checksumKey: key,
    logLevel: 'off',
  });
  const signature = await signer.crypto.createSignatureFromObj(data, key);
  return { code: '00', desc: 'success', success: true, data, signature };
}

function fakeClient() {
  return {
    paymentRequests: { create: jest.fn(), get: jest.fn() },
    webhooks: { verify: jest.fn() },
  };
}

describe('BE-BIL-03 PayosGateway.verifyWebhook', () => {
  const gateway = new PayosGateway(credentials);

  it('UTCID01 accepts a correctly signed successful payment', async () => {
    await expect(
      gateway.verifyWebhook(await signedWebhook(webhookData)),
    ).resolves.toEqual({ orderCode: webhookData.orderCode, success: true });
  });

  it('UTCID02 returns null for a signature made with another key', async () => {
    await expect(
      gateway.verifyWebhook(await signedWebhook(webhookData, 'wrong-key')),
    ).resolves.toBeNull();
  });

  it('UTCID03 returns null when the data was changed after signing', async () => {
    const body = await signedWebhook(webhookData);
    body.data = { ...body.data, amount: 1 };
    await expect(gateway.verifyWebhook(body)).resolves.toBeNull();
  });

  it('UTCID04 returns null when the signature or body is missing', async () => {
    const body = await signedWebhook(webhookData);
    await expect(
      gateway.verifyWebhook({ ...body, signature: '' }),
    ).resolves.toBeNull();
    await expect(gateway.verifyWebhook(null)).resolves.toBeNull();
    await expect(gateway.verifyWebhook('text')).resolves.toBeNull();
  });

  it('UTCID05 reports a correctly signed non-success code as not successful', async () => {
    await expect(
      gateway.verifyWebhook(
        await signedWebhook({ ...webhookData, code: '01' }),
      ),
    ).resolves.toEqual({ orderCode: webhookData.orderCode, success: false });
  });
});

describe('BE-BIL-04 PayosGateway.createCheckout and getPaymentStatus', () => {
  const order = {
    orderCode: 1730000000000123,
    amountVnd: 49000,
    description: 'Nâng cấp STAVE+ cho tài khoản Đức',
    returnUrl: 'http://localhost:3000/billing/result?orderCode=1',
    cancelUrl: 'http://localhost:3000/plans?canceled=1',
  };

  it('UTCID01 creates a payment link with a short ASCII description', async () => {
    const client = fakeClient();
    client.paymentRequests.create.mockResolvedValue({
      checkoutUrl: 'https://pay.payos.vn/web/abc',
      paymentLinkId: 'abc',
    });
    const gateway = new PayosGateway(credentials, client as never);

    await expect(gateway.createCheckout(order)).resolves.toEqual({
      checkoutUrl: 'https://pay.payos.vn/web/abc',
      providerRef: 'abc',
    });
    const sent = client.paymentRequests.create.mock.calls[0][0];
    expect(sent).toMatchObject({
      orderCode: order.orderCode,
      amount: 49000,
      returnUrl: order.returnUrl,
      cancelUrl: order.cancelUrl,
    });
    expect(sent.description.length).toBeLessThanOrEqual(PAYOS_DESCRIPTION_MAX);
    expect(sent.description).toMatch(/^[A-Za-z0-9 ]+$/);
  });

  it('UTCID02 rejects a non-integer amount without calling PayOS', async () => {
    const client = fakeClient();
    const gateway = new PayosGateway(credentials, client as never);
    await expect(
      gateway.createCheckout({ ...order, amountVnd: 49000.5 }),
    ).rejects.toThrow('Invalid amount');
    await expect(
      gateway.createCheckout({ ...order, orderCode: -1 }),
    ).rejects.toThrow('Invalid order code');
    expect(client.paymentRequests.create).not.toHaveBeenCalled();
  });

  it('UTCID03 lets a network error from PayOS propagate', async () => {
    const client = fakeClient();
    client.paymentRequests.create.mockRejectedValue(new Error('timeout'));
    const gateway = new PayosGateway(credentials, client as never);
    await expect(gateway.createCheckout(order)).rejects.toThrow('timeout');
  });

  it('UTCID04 maps the payment link status', async () => {
    const client = fakeClient();
    client.paymentRequests.get.mockResolvedValue({ status: 'PAID' });
    const gateway = new PayosGateway(credentials, client as never);
    await expect(gateway.getPaymentStatus(5)).resolves.toBe('success');
    expect(client.paymentRequests.get).toHaveBeenCalledWith(5);
  });

  it('UTCID05 throws when PayOS cannot be reached for the status', async () => {
    const client = fakeClient();
    client.paymentRequests.get.mockRejectedValue(new Error('offline'));
    const gateway = new PayosGateway(credentials, client as never);
    await expect(gateway.getPaymentStatus(5)).rejects.toThrow('offline');
  });
});

describe('BE-BIL-05 PayOS helpers', () => {
  it('UTCID01 maps every PayOS status', () => {
    expect(mapPayosStatus('PAID')).toBe('success');
    expect(mapPayosStatus('CANCELLED')).toBe('failed');
    expect(mapPayosStatus('EXPIRED')).toBe('failed');
    expect(mapPayosStatus('FAILED')).toBe('failed');
    expect(mapPayosStatus('PENDING')).toBe('pending');
    expect(mapPayosStatus('PROCESSING')).toBe('pending');
    expect(mapPayosStatus('UNDERPAID')).toBe('pending');
  });

  it('UTCID02 strips Vietnamese marks and symbols and caps the length', () => {
    expect(toPayosDescription('Đăng ký STAVE+ #12')).toBe('Dang ky STAVE 12');
    expect(toPayosDescription('a'.repeat(40))).toHaveLength(
      PAYOS_DESCRIPTION_MAX,
    );
    expect(toPayosDescription('STAVE 1730000000000123')).toBe(
      'STAVE 1730000000000123',
    );
  });
});
