import { BadRequestException } from '@nestjs/common';
import { PayOS, type WebhookData } from '@payos/node';
import { PaymentsController } from './payments.controller';
import type { PaymentsService } from './payments.service';
import { PayosGateway } from './payos.gateway';

const credentials = {
  clientId: 'client',
  apiKey: 'api',
  checksumKey: 'checksum',
};

const data: WebhookData = {
  orderCode: 173000000000012,
  amount: 49000,
  description: 'STAVE 173000000000012',
  accountNumber: '12345678',
  reference: 'REF1',
  transactionDateTime: '2026-11-06 18:25:00',
  currency: 'VND',
  paymentLinkId: 'link-1',
  code: '00',
  desc: 'Thành công',
};

async function signed(key = credentials.checksumKey) {
  const signer = new PayOS({
    ...credentials,
    checksumKey: key,
    logLevel: 'off',
  });
  return {
    code: '00',
    desc: 'success',
    success: true,
    data,
    signature: await signer.crypto.createSignatureFromObj(data, key),
  };
}

function makeController() {
  const payments = { completeOrder: jest.fn().mockResolvedValue({}) };
  const controller = new PaymentsController(
    payments as unknown as PaymentsService,
    new PayosGateway(credentials),
  );
  return { controller, payments };
}

describe('BE-BIL-23 PaymentsController.payosWebhook', () => {
  it('UTCID01 completes a correctly signed payment and answers ok', async () => {
    const { controller, payments } = makeController();
    await expect(controller.payosWebhook(await signed(), {})).resolves.toEqual({
      ok: true,
    });
    expect(payments.completeOrder).toHaveBeenCalledWith(data.orderCode, true);
  });

  it('UTCID02 answers 400 for a wrong signature and changes nothing', async () => {
    const { controller, payments } = makeController();
    await expect(
      controller.payosWebhook(await signed('attacker-key'), {}),
    ).rejects.toThrow(new BadRequestException('Invalid webhook signature'));
    expect(payments.completeOrder).not.toHaveBeenCalled();
  });

  it('UTCID03 answers ok again when the same webhook is delivered twice', async () => {
    const { controller, payments } = makeController();
    payments.completeOrder
      .mockResolvedValueOnce({ processed: true })
      .mockResolvedValueOnce({ processed: false });
    const body = await signed();
    await controller.payosWebhook(body, {});
    await expect(controller.payosWebhook(body, {})).resolves.toEqual({
      ok: true,
    });
  });

  it('UTCID04 answers 400 for a body that is not a webhook', async () => {
    const { controller } = makeController();
    await expect(controller.payosWebhook({ hello: 1 }, {})).rejects.toThrow(
      BadRequestException,
    );
  });
});
