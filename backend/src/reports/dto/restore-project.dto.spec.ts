import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { RestoreProjectDto } from './restore-project.dto';

describe('RestoreProjectDto', () => {
  const pipe = new ValidationPipe({ whitelist: true, transform: true });
  const transform = (body: unknown) =>
    pipe.transform(body, { type: 'body', metatype: RestoreProjectDto });

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

  it('hợp lệ: lý do đủ dài', async () => {
    await expect(transform({ reason: 'Restored by mistake' })).resolves.toEqual(
      { reason: 'Restored by mistake' },
    );
  });

  it('lý do rỗng bị từ chối', async () => {
    const messages = await rejectionMessages({ reason: '   ' });
    expect(messages.some((m) => m.includes('reason'))).toBe(true);
  });

  it('thiếu lý do bị từ chối', async () => {
    const messages = await rejectionMessages({});
    expect(messages.some((m) => m.includes('reason'))).toBe(true);
  });

  it('lý do được trim hai đầu', async () => {
    await expect(transform({ reason: '  restored  ' })).resolves.toEqual({
      reason: 'restored',
    });
  });

  it('trường lạ bị loại (whitelist)', async () => {
    const result = (await transform({
      reason: 'ok',
      admin_id: 'someone',
      closedReports: 9,
    })) as object;
    expect(result).toEqual({ reason: 'ok' });
  });
});
