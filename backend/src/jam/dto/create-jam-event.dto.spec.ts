import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { CreateJamEventDto } from './create-jam-event.dto';

// ============================================================================
// SHEET: BE-JAM-12 (CreateJamEventDto.validate(dto))
// ============================================================================
describe('BE-JAM-12 CreateJamEventDto.validate(dto)', () => {
  const pipe = new ValidationPipe({ whitelist: true, transform: true });

  const transform = (body: unknown) =>
    pipe.transform(body, { type: 'body', metatype: CreateJamEventDto });

  const expectValidationRejection = async (
    promise: Promise<unknown>,
    expectedMessage: string,
  ) => {
    let caught: unknown;
    try {
      await promise;
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(BadRequestException);
    const response = (caught as BadRequestException).getResponse() as {
      message: string | string[];
    };
    const messages = Array.isArray(response.message)
      ? response.message
      : [response.message];
    expect(messages.some((m) => m.includes(expectedMessage))).toBe(true);
  };

  const baseDto = {
    name: 'Community Jam #1',
    scheduledStartAt: '2026-12-01T10:00:00.000Z',
    scheduledEndAt: '2026-12-01T12:00:00.000Z',
  };

  it('UTCID01 accepts minimal valid body with required fields only', async () => {
    await expect(transform(baseDto)).resolves.toMatchObject({
      name: 'Community Jam #1',
      scheduledStartAt: '2026-12-01T10:00:00.000Z',
      scheduledEndAt: '2026-12-01T12:00:00.000Z',
    });
  });

  it('UTCID02 accepts body with all valid optional fields included', async () => {
    const fullDto = {
      ...baseDto,
      description: 'Mô tả sự kiện',
      startingProjectId: 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d',
      editCooldownSec: 15,
      confirmOverlap: true,
    };
    await expect(transform(fullDto)).resolves.toMatchObject(fullDto);
  });

  it('UTCID04 accepts name at exactly 120 characters boundary', async () => {
    const name120 = 'A'.repeat(120);
    await expect(
      transform({ ...baseDto, name: name120 }),
    ).resolves.toMatchObject({
      name: name120,
    });
  });

  it('UTCID05 rejects name exceeding 120 characters (121 chars)', async () => {
    const name121 = 'A'.repeat(121);
    await expectValidationRejection(
      transform({ ...baseDto, name: name121 }),
      'Tên sự kiện không được vượt quá 120 ký tự',
    );
  });

  it('UTCID03 rejects empty name string', async () => {
    await expectValidationRejection(
      transform({ ...baseDto, name: '' }),
      'Tên sự kiện không được để trống',
    );
  });

  it('rejects missing name field', async () => {
    const withoutName: Partial<typeof baseDto> = { ...baseDto };
    delete withoutName.name;
    await expectValidationRejection(
      transform(withoutName),
      'Tên sự kiện không được để trống',
    );
  });

  it('UTCID07 rejects missing scheduledStartAt field', async () => {
    const withoutStart: Partial<typeof baseDto> = { ...baseDto };
    delete withoutStart.scheduledStartAt;
    await expectValidationRejection(
      transform(withoutStart),
      'Thời gian bắt đầu không được để trống',
    );
  });

  it('UTCID08 rejects invalid scheduledStartAt ISO format', async () => {
    await expectValidationRejection(
      transform({ ...baseDto, scheduledStartAt: '10/11/2026' }),
      'Thời gian bắt đầu không đúng định dạng',
    );
  });

  it('UTCID09 rejects missing scheduledEndAt field', async () => {
    const withoutEnd: Partial<typeof baseDto> = { ...baseDto };
    delete withoutEnd.scheduledEndAt;
    await expectValidationRejection(
      transform(withoutEnd),
      'Thời gian kết thúc không được để trống',
    );
  });

  it('UTCID10 rejects invalid scheduledEndAt ISO format', async () => {
    await expectValidationRejection(
      transform({ ...baseDto, scheduledEndAt: 'tomorrow' }),
      'Thời gian kết thúc không đúng định dạng',
    );
  });

  it('UTCID11 rejects invalid startingProjectId (non-UUID v4 format)', async () => {
    await expectValidationRejection(
      transform({ ...baseDto, startingProjectId: 'not-a-uuid-string' }),
      'ID dự án bắt đầu không hợp lệ',
    );
  });

  it('UTCID12 accepts editCooldownSec at lower boundary of 1 second', async () => {
    await expect(
      transform({ ...baseDto, editCooldownSec: 1 }),
    ).resolves.toMatchObject({ editCooldownSec: 1 });
  });

  it('UTCID14 rejects editCooldownSec below minimum (0 second)', async () => {
    await expectValidationRejection(
      transform({ ...baseDto, editCooldownSec: 0 }),
      'Thời gian chờ tối thiểu là 1 giây',
    );
  });

  it('UTCID13 accepts editCooldownSec at upper boundary of 3600 seconds', async () => {
    await expect(
      transform({ ...baseDto, editCooldownSec: 3600 }),
    ).resolves.toMatchObject({ editCooldownSec: 3600 });
  });

  it('UTCID15 rejects editCooldownSec exceeding maximum (3601 seconds)', async () => {
    await expectValidationRejection(
      transform({ ...baseDto, editCooldownSec: 3601 }),
      'Thời gian chờ tối đa là 3600 giây',
    );
  });

  it('UTCID16 rejects non-integer editCooldownSec (1.5 seconds)', async () => {
    await expectValidationRejection(
      transform({ ...baseDto, editCooldownSec: 1.5 }),
      'Thời gian chờ phải là số nguyên',
    );
  });

  it('rejects string editCooldownSec', async () => {
    await expectValidationRejection(
      transform({ ...baseDto, editCooldownSec: 'abc' }),
      'Thời gian chờ phải là số nguyên',
    );
  });

  it('UTCID06 rejects a description of 2001 characters', async () => {
    await expectValidationRejection(
      transform({ ...baseDto, description: 'd'.repeat(2001) }),
      'description must be shorter than or equal to 2000 characters',
    );
  });

  it('UTCID17 rejects confirmOverlap that is not a boolean', async () => {
    await expectValidationRejection(
      transform({ ...baseDto, confirmOverlap: 'yes' }),
      'confirmOverlap must be a boolean value',
    );
  });
});
