import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { REPORT_REASONS } from '@stave/shared-types';
import { CreateReportDto } from './create-report.dto';

describe('CreateReportDto', () => {
  const pipe = new ValidationPipe({ whitelist: true, transform: true });

  const transform = (body: unknown) =>
    pipe.transform(body, { type: 'body', metatype: CreateReportDto });

  const rejection = async (body: unknown): Promise<string[]> => {
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

  it.each(REPORT_REASONS.map((r) => r.key))(
    'chấp nhận lý do %s',
    async (reason) => {
      await expect(transform({ reason })).resolves.toEqual({ reason });
    },
  );

  it('reason lạ bị từ chối', async () => {
    const messages = await rejection({ reason: 'boring' });
    expect(messages.some((m) => m.includes('reason'))).toBe(true);
  });

  it('thiếu reason bị từ chối', async () => {
    const messages = await rejection({ details: 'x' });
    expect(messages.some((m) => m.includes('reason'))).toBe(true);
  });

  it('reason không phải chuỗi bị từ chối', async () => {
    await rejection({ reason: 5 });
    await rejection({ reason: null });
  });

  it('details đúng 500 ký tự hợp lệ', async () => {
    const details = 'x'.repeat(500);
    await expect(transform({ reason: 'spam', details })).resolves.toEqual({
      reason: 'spam',
      details,
    });
  });

  it('details 501 ký tự bị từ chối', async () => {
    const messages = await rejection({
      reason: 'spam',
      details: 'x'.repeat(501),
    });
    expect(messages.some((m) => m.includes('details'))).toBe(true);
  });

  it('details có ký tự điều khiển được làm sạch', async () => {
    await expect(
      transform({ reason: 'spam', details: '  a\u0000b\r\nc  ' }),
    ).resolves.toEqual({ reason: 'spam', details: 'ab\nc' });
  });

  it('details chỉ khoảng trắng thành null', async () => {
    await expect(
      transform({ reason: 'spam', details: '   \n  ' }),
    ).resolves.toEqual({ reason: 'spam', details: null });
  });

  it('details null hoặc vắng đều hợp lệ', async () => {
    await expect(transform({ reason: 'spam', details: null })).resolves.toEqual(
      { reason: 'spam', details: null },
    );
    await expect(transform({ reason: 'spam' })).resolves.toEqual({
      reason: 'spam',
    });
  });

  it('details không phải chuỗi bị từ chối', async () => {
    await rejection({ reason: 'spam', details: 42 });
    await rejection({ reason: 'spam', details: { a: 1 } });
  });

  it('trường lạ bị loại, kể cả reporter_id và status', async () => {
    await expect(
      transform({
        reason: 'spam',
        reporter_id: 'someone-else',
        status: 'resolved',
        project_id: 'x',
      }),
    ).resolves.toEqual({ reason: 'spam' });
  });
});
