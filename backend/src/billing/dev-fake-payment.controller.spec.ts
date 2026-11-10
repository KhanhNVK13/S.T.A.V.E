import { NotFoundException } from '@nestjs/common';
import type { AuthenticatedRequest } from '../common/guards/jwt-auth.guard';
import { DevFakePaymentController } from './dev-fake-payment.controller';
import type { PaymentsService } from './payments.service';

const req = { user: { id: 'user-1' } } as AuthenticatedRequest;
const order = {
  orderCode: 9,
  planName: 'STAVE+',
  amountVnd: 49000,
  status: 'pending',
};

function makeController() {
  const payments = {
    getOrderForUser: jest.fn().mockResolvedValue(order),
    completeOrder: jest.fn().mockResolvedValue({ processed: true }),
  };
  const controller = new DevFakePaymentController(
    payments as unknown as PaymentsService,
  );
  return { controller, payments };
}

describe('BE-BIL-14 DevFakePaymentController', () => {
  it('UTCID01 completes a successful payment through completeOrder', async () => {
    const { controller, payments } = makeController();
    await controller.complete(req, { orderCode: 9, result: 'success' });
    expect(payments.getOrderForUser).toHaveBeenCalledWith('user-1', 9);
    expect(payments.completeOrder).toHaveBeenCalledWith(9, true);
  });

  it('UTCID02 treats fail and cancel as an unsuccessful payment', async () => {
    const { controller, payments } = makeController();
    await controller.complete(req, { orderCode: 9, result: 'fail' });
    await controller.complete(req, { orderCode: 9, result: 'cancel' });
    expect(payments.completeOrder.mock.calls).toEqual([
      [9, false],
      [9, false],
    ]);
  });

  it('UTCID03 never completes an order the caller does not own', async () => {
    const { controller, payments } = makeController();
    payments.getOrderForUser.mockRejectedValue(
      new NotFoundException('Order not found'),
    );
    await expect(
      controller.complete(req, { orderCode: 9, result: 'success' }),
    ).rejects.toThrow(NotFoundException);
    expect(payments.completeOrder).not.toHaveBeenCalled();
  });
});
