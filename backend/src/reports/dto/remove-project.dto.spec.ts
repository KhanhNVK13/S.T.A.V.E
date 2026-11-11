import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { RemoveProjectDto } from './remove-project.dto';

const sound = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

describe('RemoveProjectDto', () => {
  const pipe = new ValidationPipe({ whitelist: true, transform: true });
  const transform = (body: unknown) =>
    pipe.transform(body, { type: 'body', metatype: RemoveProjectDto });

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

  it('hợp lệ: lý do đủ dài, điều khoản trong danh mục, không có sound', async () => {
    await expect(
      transform({ reason: 'x'.repeat(10), policy: 'copyright' }),
    ).resolves.toEqual({ reason: 'x'.repeat(10), policy: 'copyright' });
  });

  it('lý do rỗng bị từ chối; lý do 9 ký tự vẫn qua DTO để service loại với thông điệp tiếng Việt', async () => {
    const messages = await rejectionMessages({
      reason: '',
      policy: 'copyright',
    });
    expect(messages.some((m) => m.includes('reason'))).toBe(true);
    await expect(
      transform({ reason: 'x'.repeat(9), policy: 'copyright' }),
    ).resolves.toMatchObject({ reason: 'x'.repeat(9) });
  });

  it('lý do 10 khoảng trắng rồi 1 chữ qua DTO (đã trim còn 1 ký tự), service mới loại', async () => {
    await expect(
      transform({ reason: '          x', policy: 'copyright' }),
    ).resolves.toMatchObject({ reason: 'x' });
  });

  it('lý do được trim hai đầu', async () => {
    await expect(
      transform({ reason: '  ' + 'x'.repeat(10) + '  ', policy: 'other' }),
    ).resolves.toMatchObject({ reason: 'x'.repeat(10) });
  });

  it('policy lạ hoặc thiếu bị từ chối', async () => {
    const messages = await rejectionMessages({
      reason: 'x'.repeat(10),
      policy: 'nonsense',
    });
    expect(messages.some((m) => m.includes('policy'))).toBe(true);
    await rejectionMessages({ reason: 'x'.repeat(10) });
  });

  it('removeSoundIds: 51 phần tử bị từ chối, đúng 50 được nhận', async () => {
    const fifty = Array.from({ length: 50 }, (_, i) => sound(i + 1));
    await expect(
      transform({
        reason: 'x'.repeat(10),
        policy: 'copyright',
        removeSoundIds: fifty,
      }),
    ).resolves.toBeDefined();
    const messages = await rejectionMessages({
      reason: 'x'.repeat(10),
      policy: 'copyright',
      removeSoundIds: [...fifty, sound(51)],
    });
    expect(messages.some((m) => m.includes('removeSoundIds'))).toBe(true);
  });

  it('removeSoundIds: phần tử không phải UUID bị từ chối', async () => {
    const messages = await rejectionMessages({
      reason: 'x'.repeat(10),
      policy: 'copyright',
      removeSoundIds: ['not-a-uuid'],
    });
    expect(messages.some((m) => m.includes('removeSoundIds'))).toBe(true);
  });

  it('removeSoundIds trùng lặp được khử, giữ thứ tự xuất hiện đầu tiên', async () => {
    await expect(
      transform({
        reason: 'x'.repeat(10),
        policy: 'copyright',
        removeSoundIds: [sound(2), sound(1), sound(2)],
      }),
    ).resolves.toMatchObject({ removeSoundIds: [sound(2), sound(1)] });
  });

  it('trường lạ bị loại (whitelist), trường khai vẫn giữ nguyên', async () => {
    const result = (await transform({
      reason: 'x'.repeat(10),
      policy: 'copyright',
      removeSoundIds: [sound(1)],
      hiddenAt: 'fake',
      closedReports: 99,
      admin_id: 'someone',
    })) as object;
    expect(result).toEqual({
      reason: 'x'.repeat(10),
      policy: 'copyright',
      removeSoundIds: [sound(1)],
    });
  });
});
