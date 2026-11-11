import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { DismissReportsDto } from './dismiss-reports.dto';

const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

describe('DismissReportsDto', () => {
  const pipe = new ValidationPipe({ whitelist: true, transform: true });
  const transform = (body: unknown) =>
    pipe.transform(body, { type: 'body', metatype: DismissReportsDto });

  const rejectionMessages = async (body: unknown): Promise<string[]> => {
    let caught: unknown;
    try {
      await transform(body);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(BadRequestException);
    const response = (caught as BadRequestException).getResponse() as {
      message: string | string[];
    };
    return Array.isArray(response.message)
      ? response.message
      : [response.message];
  };

  it('hợp lệ: một id và lý do', async () => {
    await expect(
      transform({ reportIds: [id(1)], reason: 'Not a violation' }),
    ).resolves.toEqual({ reportIds: [id(1)], reason: 'Not a violation' });
  });

  it('reportIds rỗng bị từ chối', async () => {
    const messages = await rejectionMessages({ reportIds: [], reason: 'ok' });
    expect(messages.some((m) => m.includes('reportIds'))).toBe(true);
  });

  it('thiếu reportIds bị từ chối', async () => {
    const messages = await rejectionMessages({ reason: 'ok' });
    expect(messages.some((m) => m.includes('reportIds'))).toBe(true);
  });

  it('reportIds không phải mảng bị từ chối', async () => {
    await rejectionMessages({ reportIds: id(1), reason: 'ok' });
    await rejectionMessages({ reportIds: null, reason: 'ok' });
  });

  it('đúng 100 phần tử hợp lệ, 101 phần tử bị từ chối', async () => {
    const hundred = Array.from({ length: 100 }, (_, i) => id(i + 1));
    await expect(
      transform({ reportIds: hundred, reason: 'ok' }),
    ).resolves.toMatchObject({ reportIds: hundred });
    const messages = await rejectionMessages({
      reportIds: [...hundred, id(101)],
      reason: 'ok',
    });
    expect(messages.some((m) => m.includes('reportIds'))).toBe(true);
  });

  it('phần tử không phải UUID bị từ chối', async () => {
    await rejectionMessages({ reportIds: [id(1), 'not-a-uuid'], reason: 'ok' });
    await rejectionMessages({ reportIds: [123], reason: 'ok' });
    await rejectionMessages({ reportIds: [null], reason: 'ok' });
  });

  it('id trùng được khử, giữ thứ tự xuất hiện đầu tiên', async () => {
    await expect(
      transform({
        reportIds: [id(2), id(1), id(2), id(1)],
        reason: 'ok',
      }),
    ).resolves.toMatchObject({ reportIds: [id(2), id(1)] });
  });

  it('lý do rỗng hoặc toàn khoảng trắng bị từ chối', async () => {
    for (const reason of ['', '   ', '\n\t ']) {
      const messages = await rejectionMessages({
        reportIds: [id(1)],
        reason,
      });
      expect(messages.some((m) => m.includes('reason'))).toBe(true);
    }
  });

  it('thiếu hoặc sai kiểu reason bị từ chối', async () => {
    await rejectionMessages({ reportIds: [id(1)] });
    await rejectionMessages({ reportIds: [id(1)], reason: 5 });
    await rejectionMessages({ reportIds: [id(1)], reason: null });
  });

  it('lý do được trim', async () => {
    await expect(
      transform({ reportIds: [id(1)], reason: '  hợp lệ  ' }),
    ).resolves.toMatchObject({ reason: 'hợp lệ' });
  });

  it('lý do đúng 1000 ký tự hợp lệ, 1001 bị từ chối', async () => {
    await expect(
      transform({ reportIds: [id(1)], reason: 'x'.repeat(1000) }),
    ).resolves.toMatchObject({ reason: 'x'.repeat(1000) });
    const messages = await rejectionMessages({
      reportIds: [id(1)],
      reason: 'x'.repeat(1001),
    });
    expect(messages.some((m) => m.includes('reason'))).toBe(true);
  });

  it('trường lạ bị loại (whitelist)', async () => {
    const result = (await transform({
      reportIds: [id(1)],
      reason: 'ok',
      resolution: 'upheld',
      admin_id: 'someone',
      status: 'resolved',
    })) as object;
    expect(result).toEqual({ reportIds: [id(1)], reason: 'ok' });
  });
});
