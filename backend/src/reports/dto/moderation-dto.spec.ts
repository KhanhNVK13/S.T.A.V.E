import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { MODERATION_NOTE_MAX_LENGTH } from '@stave/shared-types';
import { DismissReportsDto } from './dismiss-reports.dto';
import { RemoveProjectDto } from './remove-project.dto';

const REPORT_ID = '44444444-4444-4444-8444-444444444444';
const SOUND_ID = '55555555-5555-4555-8555-555555555555';

describe('BE-RPT-09 moderation decision validation (RemoveProjectDto, DismissReportsDto)', () => {
  const pipe = new ValidationPipe({ whitelist: true, transform: true });

  const remove = (body: unknown) =>
    pipe.transform(body, { type: 'body', metatype: RemoveProjectDto });
  const dismiss = (body: unknown) =>
    pipe.transform(body, { type: 'body', metatype: DismissReportsDto });

  const validRemove = {
    reason: 'Copied a commercial track note for note',
    policy: 'copyright',
  };

  it('UTCID01 chấp nhận quyết định gỡ dự án có lý do và chính sách', async () => {
    await expect(remove(validRemove)).resolves.toEqual(validRemove);
  });

  it('UTCID02 từ chối gỡ dự án khi thiếu lý do', async () => {
    await expect(remove({ policy: 'copyright' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('UTCID03 từ chối gỡ dự án khi lý do chỉ có khoảng trắng', async () => {
    await expect(
      remove({ ...validRemove, reason: '            ' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('UTCID04 từ chối gỡ dự án khi lý do ngắn hơn mức tối thiểu', async () => {
    await expect(
      remove({ ...validRemove, reason: 'too short' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('UTCID05 từ chối gỡ dự án khi lý do dài hơn mức tối đa', async () => {
    await expect(
      remove({
        ...validRemove,
        reason: 'x'.repeat(MODERATION_NOTE_MAX_LENGTH + 1),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('UTCID06 từ chối chính sách không nằm trong danh mục', async () => {
    await expect(
      remove({ ...validRemove, policy: 'because' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('UTCID07 từ chối id âm thanh không phải UUID khi gỡ dự án', async () => {
    await expect(
      remove({ ...validRemove, removeSoundIds: ['abc'] }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      remove({ ...validRemove, removeSoundIds: [SOUND_ID] }),
    ).resolves.toMatchObject({ removeSoundIds: [SOUND_ID] });
  });

  it('UTCID08 chấp nhận bỏ qua báo cáo có danh sách và lý do hợp lệ', async () => {
    const body = {
      reportIds: [REPORT_ID],
      reason: 'Does not break any rule',
    };
    await expect(dismiss(body)).resolves.toEqual(body);
  });

  it('UTCID09 từ chối bỏ qua báo cáo khi thiếu hoặc trống lý do', async () => {
    await expect(dismiss({ reportIds: [REPORT_ID] })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(
      dismiss({ reportIds: [REPORT_ID], reason: '           ' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('UTCID10 từ chối bỏ qua báo cáo khi danh sách báo cáo rỗng hoặc sai id', async () => {
    await expect(
      dismiss({ reportIds: [], reason: 'Does not break any rule' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      dismiss({ reportIds: ['abc'], reason: 'Does not break any rule' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
