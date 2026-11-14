import { PayOS, type PaymentLinkStatus, type Webhook } from '@payos/node';
import type {
  CheckoutOrder,
  GatewayPaymentStatus,
  PaymentGateway,
} from './payment-gateway';

export const PAYOS_DESCRIPTION_MAX = 25;
export const PAYOS_TIMEOUT_MS = 10_000;
const PAYOS_SUCCESS_CODE = '00';

export interface PayosCredentials {
  clientId: string;
  apiKey: string;
  checksumKey: string;
}

type PayosClient = Pick<PayOS, 'paymentRequests' | 'webhooks'>;

export function toPayosDescription(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/[^A-Za-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, PAYOS_DESCRIPTION_MAX)
    .trim();
}

export function mapPayosStatus(
  status: PaymentLinkStatus,
): GatewayPaymentStatus {
  if (status === 'PAID') return 'success';
  if (status === 'CANCELLED' || status === 'EXPIRED' || status === 'FAILED') {
    return 'failed';
  }
  return 'pending';
}

function isPositiveSafeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

export class PayosGateway implements PaymentGateway {
  private readonly client: PayosClient;

  constructor(credentials: PayosCredentials, client?: PayosClient) {
    this.client =
      client ??
      new PayOS({
        ...credentials,
        timeout: PAYOS_TIMEOUT_MS,
        maxRetries: 0,
        logLevel: 'off',
      });
  }

  async createCheckout(order: CheckoutOrder) {
    if (!isPositiveSafeInteger(order.orderCode)) {
      throw new Error('Invalid order code');
    }
    if (!isPositiveSafeInteger(order.amountVnd)) {
      throw new Error('Invalid amount');
    }
    const link = await this.client.paymentRequests.create({
      orderCode: order.orderCode,
      amount: order.amountVnd,
      description:
        toPayosDescription(order.description) || `STAVE ${order.orderCode}`,
      returnUrl: order.returnUrl,
      cancelUrl: order.cancelUrl,
    });
    return { checkoutUrl: link.checkoutUrl, providerRef: link.paymentLinkId };
  }

  async verifyWebhook(body: unknown) {
    if (!body || typeof body !== 'object') return null;
    const webhook = body as Webhook;
    try {
      const data = await this.client.webhooks.verify(webhook);
      if (!isPositiveSafeInteger(data.orderCode)) return null;
      return {
        orderCode: data.orderCode,
        success:
          webhook.code === PAYOS_SUCCESS_CODE &&
          data.code === PAYOS_SUCCESS_CODE,
      };
    } catch {
      return null;
    }
  }

  async getPaymentStatus(orderCode: number): Promise<GatewayPaymentStatus> {
    const link = await this.client.paymentRequests.get(orderCode);
    return mapPayosStatus(link.status);
  }

  async cancelPayment(orderCode: number, reason?: string): Promise<void> {
    try {
      await this.client.paymentRequests.cancel(orderCode, reason);
    } catch (error) {
      const status = await this.getPaymentStatus(orderCode);
      if (status !== 'failed') throw error;
    }
  }
}
