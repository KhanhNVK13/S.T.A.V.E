import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ConfirmCustomSoundDto } from './confirm-custom-sound.dto';
import { CreateCustomSoundUploadUrlDto } from './create-upload-url.dto';
import { DeleteCustomSoundQueryDto } from './delete-custom-sound.dto';

const validSoundId = '11111111-1111-4111-8111-111111111111';

async function validateConfirm(value: Record<string, unknown>) {
  return validate(plainToInstance(ConfirmCustomSoundDto, value));
}

async function validateCreateUploadUrl(value: Record<string, unknown>) {
  return validate(plainToInstance(CreateCustomSoundUploadUrlDto, value));
}

async function validateDeleteQuery(value: Record<string, unknown>) {
  return validate(plainToInstance(DeleteCustomSoundQueryDto, value));
}

describe('BE-SND-01 ConfirmCustomSoundDto.validate(dto)', () => {
  it('UTCID01 accepts a standard uploaded sound', async () => {
    await expect(
      validateConfirm({
        soundId: validSoundId,
        name: 'Kick 01',
        source: 'uploaded',
      }),
    ).resolves.toHaveLength(0);
  });

  it('UTCID02 accepts a recorded sound source', async () => {
    await expect(
      validateConfirm({
        soundId: validSoundId,
        name: 'Kick 01',
        source: 'recorded',
      }),
    ).resolves.toHaveLength(0);
  });

  it('UTCID03 accepts a 100-character sound name', async () => {
    await expect(
      validateConfirm({
        soundId: validSoundId,
        name: 'a'.repeat(100),
        source: 'uploaded',
      }),
    ).resolves.toHaveLength(0);
  });

  it('UTCID04 rejects a 101-character sound name', async () => {
    const errors = await validateConfirm({
      soundId: validSoundId,
      name: 'a'.repeat(101),
      source: 'uploaded',
    });
    expect(errors).toHaveLength(1);
    expect(errors[0].constraints).toEqual(
      expect.objectContaining({
        maxLength: 'Tên âm thanh tối đa 100 ký tự',
      }),
    );
  });

  it('UTCID05 accepts an empty string name (code lacks @IsNotEmpty)', async () => {
    await expect(
      validateConfirm({
        soundId: validSoundId,
        name: '',
        source: 'uploaded',
      }),
    ).resolves.toHaveLength(0);
  });

  it('UTCID06 rejects a non-UUID soundId', async () => {
    const errors = await validateConfirm({
      soundId: 'abc',
      name: 'Kick 01',
      source: 'uploaded',
    });
    expect(errors).toHaveLength(1);
    expect(errors[0].constraints).toEqual(
      expect.objectContaining({
        isUuid: 'soundId must be a UUID',
      }),
    );
  });

  it('UTCID07 rejects a non-string name', async () => {
    const errors = await validateConfirm({
      soundId: validSoundId,
      name: 123,
      source: 'uploaded',
    });
    expect(errors).toHaveLength(1);
    expect(errors[0].constraints).toEqual(
      expect.objectContaining({
        isString: 'name must be a string',
      }),
    );
  });

  it('UTCID08 rejects an invalid source', async () => {
    const errors = await validateConfirm({
      soundId: validSoundId,
      name: 'Kick 01',
      source: 'sampled',
    });
    expect(errors).toHaveLength(1);
    expect(errors[0].constraints).toEqual(
      expect.objectContaining({
        isIn: 'source must be one of the following values: uploaded, recorded',
      }),
    );
  });
});

describe('BE-SND-02 CreateCustomSoundUploadUrlDto.validate(dto)', () => {
  it('UTCID01 accepts normal sound duration and size', async () => {
    await expect(
      validateCreateUploadUrl({
        durationSec: 5.5,
        sizeBytes: 1048576,
      }),
    ).resolves.toHaveLength(0);
  });

  it('UTCID02 accepts lower boundary duration 0.05s and size 1 byte', async () => {
    await expect(
      validateCreateUploadUrl({
        durationSec: 0.05,
        sizeBytes: 1,
      }),
    ).resolves.toHaveLength(0);
  });

  it('UTCID03 accepts upper boundary duration 30s and size 10MB', async () => {
    await expect(
      validateCreateUploadUrl({
        durationSec: 30,
        sizeBytes: 10485760,
      }),
    ).resolves.toHaveLength(0);
  });

  it('UTCID04 rejects duration below 0.05s (0.04s)', async () => {
    const errors = await validateCreateUploadUrl({
      durationSec: 0.04,
      sizeBytes: 1048576,
    });
    expect(errors).toHaveLength(1);
    expect(errors[0].constraints).toEqual(
      expect.objectContaining({
        min: 'Âm thanh quá ngắn',
      }),
    );
  });

  it('UTCID05 rejects duration above 30s (30.01s)', async () => {
    const errors = await validateCreateUploadUrl({
      durationSec: 30.01,
      sizeBytes: 1048576,
    });
    expect(errors).toHaveLength(1);
    expect(errors[0].constraints).toEqual(
      expect.objectContaining({
        max: 'Âm thanh tối đa 30 giây',
      }),
    );
  });

  it('UTCID06 rejects a string durationSec', async () => {
    const errors = await validateCreateUploadUrl({
      durationSec: '5',
      sizeBytes: 1048576,
    });
    expect(errors).toHaveLength(1);
    expect(errors[0].constraints).toEqual(
      expect.objectContaining({
        isNumber:
          'durationSec must be a number conforming to the specified constraints',
      }),
    );
  });

  it('UTCID07 rejects sizeBytes 0 (less than 1)', async () => {
    const errors = await validateCreateUploadUrl({
      durationSec: 5.5,
      sizeBytes: 0,
    });
    expect(errors).toHaveLength(1);
    expect(errors[0].constraints).toEqual(
      expect.objectContaining({
        min: 'sizeBytes must not be less than 1',
      }),
    );
  });

  it('UTCID08 rejects sizeBytes exceeding 10MB (10485761)', async () => {
    const errors = await validateCreateUploadUrl({
      durationSec: 5.5,
      sizeBytes: 10485761,
    });
    expect(errors).toHaveLength(1);
    expect(errors[0].constraints).toEqual(
      expect.objectContaining({
        max: 'Âm thanh tối đa 10MB',
      }),
    );
  });

  it('UTCID09 rejects non-integer sizeBytes', async () => {
    const errors = await validateCreateUploadUrl({
      durationSec: 5.5,
      sizeBytes: 1.5,
    });
    expect(errors).toHaveLength(1);
    expect(errors[0].constraints).toEqual(
      expect.objectContaining({
        isInt: 'sizeBytes must be an integer number',
      }),
    );
  });
});

describe('BE-SND-03 DeleteCustomSoundQueryDto.validate(query)', () => {
  it('UTCID01 accepts omitted mode', async () => {
    await expect(validateDeleteQuery({})).resolves.toHaveLength(0);
  });

  it('UTCID02 accepts mode "self"', async () => {
    await expect(validateDeleteQuery({ mode: 'self' })).resolves.toHaveLength(
      0,
    );
  });

  it('UTCID03 accepts mode "hard"', async () => {
    await expect(validateDeleteQuery({ mode: 'hard' })).resolves.toHaveLength(
      0,
    );
  });

  it('UTCID04 rejects invalid mode "soft"', async () => {
    const errors = await validateDeleteQuery({ mode: 'soft' });
    expect(errors).toHaveLength(1);
    expect(errors[0].constraints).toEqual(
      expect.objectContaining({
        isIn: 'mode must be one of the following values: self, hard',
      }),
    );
  });

  it('UTCID05 rejects empty string mode', async () => {
    const errors = await validateDeleteQuery({ mode: '' });
    expect(errors).toHaveLength(1);
    expect(errors[0].constraints).toEqual(
      expect.objectContaining({
        isIn: 'mode must be one of the following values: self, hard',
      }),
    );
  });
});
