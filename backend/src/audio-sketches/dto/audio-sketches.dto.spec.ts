import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AttachSketchDto } from './attach-sketch.dto';
import { CreateUploadUrlDto } from './create-upload-url.dto';

const validUuidV4 = '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d';
const uuidV1 = '2f58e170-ef1d-11f0-9111-2b6388435d82';

async function validateAttach(value: Record<string, unknown>) {
  return validate(plainToInstance(AttachSketchDto, value));
}

async function validateUploadUrl(value: Record<string, unknown>) {
  return validate(plainToInstance(CreateUploadUrlDto, value));
}

describe('BE-SKT-01 AttachSketchDto.validate(dto)', () => {
  it('UTCID01 accepts a standard valid sketch without trim points', async () => {
    await expect(
      validateAttach({
        sketchId: validUuidV4,
        name: 'Idea 1',
        durationSec: 45.5,
        sizeBytes: 2097152,
      }),
    ).resolves.toHaveLength(0);
  });

  it('UTCID02 accepts lower boundary duration 0.1s, size 1 byte and trim points', async () => {
    await expect(
      validateAttach({
        sketchId: validUuidV4,
        name: 'a',
        durationSec: 0.1,
        sizeBytes: 1,
        trimStartSec: 0,
        trimEndSec: 10,
      }),
    ).resolves.toHaveLength(0);
  });

  it('UTCID03 accepts upper boundary 100 char name, 180s duration and 20MB size', async () => {
    await expect(
      validateAttach({
        sketchId: validUuidV4,
        name: 'a'.repeat(100),
        durationSec: 180,
        sizeBytes: 20971520,
        trimStartSec: 2.5,
      }),
    ).resolves.toHaveLength(0);
  });

  it('UTCID04 rejects a non-v4 UUID (UUID v1)', async () => {
    const errors = await validateAttach({
      sketchId: uuidV1,
      name: 'Idea 1',
      durationSec: 45.5,
      sizeBytes: 2097152,
    });
    expect(errors).toHaveLength(1);
    expect(errors[0].constraints).toEqual(
      expect.objectContaining({
        isUuid: 'sketchId must be a UUID',
      }),
    );
  });

  it('UTCID05 accepts empty name with default date-time name (SRS UC-55 1.1; code requires @MinLength(1))', async () => {
    const errors = await validateAttach({
      sketchId: validUuidV4,
      name: '',
      durationSec: 45.5,
      sizeBytes: 2097152,
    });
    expect(errors).toHaveLength(0);
  });

  it('UTCID06 rejects a 101-character sketch name', async () => {
    const errors = await validateAttach({
      sketchId: validUuidV4,
      name: 'a'.repeat(101),
      durationSec: 45.5,
      sizeBytes: 2097152,
    });
    expect(errors).toHaveLength(1);
    expect(errors[0].constraints).toEqual(
      expect.objectContaining({
        maxLength: 'name must be shorter than or equal to 100 characters',
      }),
    );
  });

  it('UTCID07 rejects duration below 0.1s (0.09s)', async () => {
    const errors = await validateAttach({
      sketchId: validUuidV4,
      name: 'Idea 1',
      durationSec: 0.09,
      sizeBytes: 2097152,
    });
    expect(errors).toHaveLength(1);
    expect(errors[0].constraints).toEqual(
      expect.objectContaining({
        min: 'durationSec must not be less than 0.1',
      }),
    );
  });

  it('UTCID08 rejects duration above 180s (180.01s)', async () => {
    const errors = await validateAttach({
      sketchId: validUuidV4,
      name: 'Idea 1',
      durationSec: 180.01,
      sizeBytes: 2097152,
    });
    expect(errors).toHaveLength(1);
    expect(errors[0].constraints).toEqual(
      expect.objectContaining({
        max: 'durationSec must not be greater than 180',
      }),
    );
  });

  it('UTCID09 rejects sizeBytes 0 (less than 1)', async () => {
    const errors = await validateAttach({
      sketchId: validUuidV4,
      name: 'Idea 1',
      durationSec: 45.5,
      sizeBytes: 0,
    });
    expect(errors).toHaveLength(1);
    expect(errors[0].constraints).toEqual(
      expect.objectContaining({
        min: 'sizeBytes must not be less than 1',
      }),
    );
  });

  it('UTCID10 rejects sizeBytes exceeding 20MB (20971521)', async () => {
    const errors = await validateAttach({
      sketchId: validUuidV4,
      name: 'Idea 1',
      durationSec: 45.5,
      sizeBytes: 20971521,
    });
    expect(errors).toHaveLength(1);
    expect(errors[0].constraints).toEqual(
      expect.objectContaining({
        max: 'sizeBytes must not be greater than 20971520',
      }),
    );
  });

  it('UTCID11 rejects non-integer sizeBytes', async () => {
    const errors = await validateAttach({
      sketchId: validUuidV4,
      name: 'Idea 1',
      durationSec: 45.5,
      sizeBytes: 1.5,
    });
    expect(errors).toHaveLength(1);
    expect(errors[0].constraints).toEqual(
      expect.objectContaining({
        isInt: 'sizeBytes must be an integer number',
      }),
    );
  });

  it('UTCID12 rejects negative trimStartSec (-0.1)', async () => {
    const errors = await validateAttach({
      sketchId: validUuidV4,
      name: 'Idea 1',
      durationSec: 45.5,
      sizeBytes: 2097152,
      trimStartSec: -0.1,
    });
    expect(errors).toHaveLength(1);
    expect(errors[0].constraints).toEqual(
      expect.objectContaining({
        min: 'trimStartSec must not be less than 0',
      }),
    );
  });

  it('UTCID13 rejects negative trimEndSec (-1)', async () => {
    const errors = await validateAttach({
      sketchId: validUuidV4,
      name: 'Idea 1',
      durationSec: 45.5,
      sizeBytes: 2097152,
      trimEndSec: -1,
    });
    expect(errors).toHaveLength(1);
    expect(errors[0].constraints).toEqual(
      expect.objectContaining({
        min: 'trimEndSec must not be less than 0',
      }),
    );
  });
});

describe('BE-SKT-02 CreateUploadUrlDto.validate(dto)', () => {
  it('UTCID01 accepts standard duration and size', async () => {
    await expect(
      validateUploadUrl({
        durationSec: 60,
        sizeBytes: 5242880,
      }),
    ).resolves.toHaveLength(0);
  });

  it('UTCID02 accepts lower boundary duration 0.1s and size 1 byte', async () => {
    await expect(
      validateUploadUrl({
        durationSec: 0.1,
        sizeBytes: 1,
      }),
    ).resolves.toHaveLength(0);
  });

  it('UTCID03 accepts upper boundary duration 180s and size 20MB', async () => {
    await expect(
      validateUploadUrl({
        durationSec: 180,
        sizeBytes: 20971520,
      }),
    ).resolves.toHaveLength(0);
  });

  it('UTCID04 rejects duration below 0.1s (0.09s)', async () => {
    const errors = await validateUploadUrl({
      durationSec: 0.09,
      sizeBytes: 5242880,
    });
    expect(errors).toHaveLength(1);
    expect(errors[0].constraints).toEqual(
      expect.objectContaining({
        min: 'Bản ghi quá ngắn',
      }),
    );
  });

  it('UTCID05 rejects duration above 180s (181s)', async () => {
    const errors = await validateUploadUrl({
      durationSec: 181,
      sizeBytes: 5242880,
    });
    expect(errors).toHaveLength(1);
    expect(errors[0].constraints).toEqual(
      expect.objectContaining({
        max: 'Audio sketch tối đa 3 phút',
      }),
    );
  });

  it('UTCID06 rejects sizeBytes 0 (less than 1)', async () => {
    const errors = await validateUploadUrl({
      durationSec: 60,
      sizeBytes: 0,
    });
    expect(errors).toHaveLength(1);
    expect(errors[0].constraints).toEqual(
      expect.objectContaining({
        min: 'sizeBytes must not be less than 1',
      }),
    );
  });

  it('UTCID07 rejects sizeBytes exceeding 20MB (20971521)', async () => {
    const errors = await validateUploadUrl({
      durationSec: 60,
      sizeBytes: 20971521,
    });
    expect(errors).toHaveLength(1);
    expect(errors[0].constraints).toEqual(
      expect.objectContaining({
        max: 'Audio sketch tối đa 20MB',
      }),
    );
  });
});
