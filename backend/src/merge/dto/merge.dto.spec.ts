import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  ConflictChoice,
  ConflictResolution,
  ResolveConflictDto,
} from './resolve-conflict.dto';
import { MergeBranchDto } from './merge-branch.dto';

const sourceBranchId = '11111111-1111-4111-8111-111111111111';
const targetBranchId = '22222222-2222-4222-8222-222222222222';
const expectedHeadCommitId = '33333333-3333-4333-8333-333333333333';

async function mergeErrors(value: Record<string, unknown>) {
  return validate(plainToInstance(MergeBranchDto, value));
}

async function resolveErrors(value: Record<string, unknown>) {
  return validate(plainToInstance(ResolveConflictDto, value));
}

describe('BE-MRG-01 MergeBranchDto.validate(dto)', () => {
  it('UTCID01 accepts valid branch ids without an expected head', async () => {
    await expect(
      mergeErrors({ sourceBranchId, targetBranchId }),
    ).resolves.toHaveLength(0);
  });

  it('UTCID02 accepts a valid expected target head', async () => {
    await expect(
      mergeErrors({
        sourceBranchId,
        targetBranchId,
        expectedTargetHeadCommitId: expectedHeadCommitId,
      }),
    ).resolves.toHaveLength(0);
  });

  it('UTCID03 rejects an empty source branch id', async () => {
    const errors = await mergeErrors({ sourceBranchId: '', targetBranchId });
    expect(errors).toHaveLength(1);
    expect(errors[0].constraints).toEqual(
      expect.objectContaining({
        isNotEmpty: 'Source branch ID is required',
        isUuid: 'Source branch ID must be a valid UUID',
      }),
    );
  });

  it('UTCID04 rejects a non-UUID source branch id', async () => {
    const errors = await mergeErrors({ sourceBranchId: 'abc', targetBranchId });
    expect(errors).toHaveLength(1);
    expect(errors[0].constraints).toEqual(
      expect.objectContaining({
        isUuid: 'Source branch ID must be a valid UUID',
      }),
    );
  });

  it('UTCID05 rejects an empty target branch id', async () => {
    const errors = await mergeErrors({ sourceBranchId, targetBranchId: '' });
    expect(errors).toHaveLength(1);
    expect(errors[0].constraints).toEqual(
      expect.objectContaining({
        isNotEmpty: 'Target branch ID is required',
        isUuid: 'Target branch ID must be a valid UUID',
      }),
    );
  });

  it('UTCID06 rejects a non-UUID target branch id', async () => {
    const errors = await mergeErrors({ sourceBranchId, targetBranchId: 'def' });
    expect(errors).toHaveLength(1);
    expect(errors[0].constraints).toEqual(
      expect.objectContaining({
        isUuid: 'Target branch ID must be a valid UUID',
      }),
    );
  });

  it('UTCID07 rejects a non-UUID expected target head', async () => {
    const errors = await mergeErrors({
      sourceBranchId,
      targetBranchId,
      expectedTargetHeadCommitId: '123',
    });
    expect(errors).toHaveLength(1);
    expect(errors[0].constraints).toEqual(
      expect.objectContaining({
        isUuid: 'expectedTargetHeadCommitId must be a UUID',
      }),
    );
  });
});

describe('BE-MRG-02 ResolveConflictDto.validate(dto)', () => {
  const validResolution = {
    noteId: 'n1',
    choice: ConflictChoice.PICK_SOURCE,
  };

  it('UTCID01 accepts a source resolution', async () => {
    await expect(
      resolveErrors({
        sourceBranchId,
        targetBranchId,
        resolutions: [validResolution],
      }),
    ).resolves.toHaveLength(0);
  });

  it('UTCID02 accepts an empty resolution array', async () => {
    await expect(
      resolveErrors({ sourceBranchId, targetBranchId, resolutions: [] }),
    ).resolves.toHaveLength(0);
  });

  it('UTCID03 accepts a custom resolution, message, and expected head', async () => {
    await expect(
      resolveErrors({
        sourceBranchId,
        targetBranchId,
        resolutions: [
          {
            noteId: 'n1',
            choice: ConflictChoice.PICK_CUSTOM,
            customNote: {
              trackId: 'track-1',
              pitch: 60,
              startTime: 480,
              duration: 120,
              velocity: 80,
            },
          },
        ],
        message: 'Merge feat',
        expectedTargetHeadCommitId: expectedHeadCommitId,
      }),
    ).resolves.toHaveLength(0);
  });

  it('UTCID04 rejects an empty source branch id', async () => {
    const errors = await resolveErrors({
      sourceBranchId: '',
      targetBranchId,
      resolutions: [],
    });
    expect(errors[0].constraints).toEqual(
      expect.objectContaining({ isNotEmpty: 'Source branch ID is required' }),
    );
  });

  it('UTCID05 rejects a non-UUID source branch id', async () => {
    const errors = await resolveErrors({
      sourceBranchId: 'abc',
      targetBranchId,
      resolutions: [],
    });
    expect(errors[0].constraints).toEqual(
      expect.objectContaining({
        isUuid: 'Source branch ID must be a valid UUID',
      }),
    );
  });

  it('UTCID06 rejects an empty target branch id', async () => {
    const errors = await resolveErrors({
      sourceBranchId,
      targetBranchId: '',
      resolutions: [],
    });
    expect(errors[0].constraints).toEqual(
      expect.objectContaining({ isNotEmpty: 'Target branch ID is required' }),
    );
  });

  it('UTCID07 rejects a non-UUID target branch id', async () => {
    const errors = await resolveErrors({
      sourceBranchId,
      targetBranchId: 'def',
      resolutions: [],
    });
    expect(errors[0].constraints).toEqual(
      expect.objectContaining({
        isUuid: 'Target branch ID must be a valid UUID',
      }),
    );
  });

  it('UTCID08 rejects an omitted resolutions array', async () => {
    const errors = await resolveErrors({ sourceBranchId, targetBranchId });
    expect(errors[0].constraints).toEqual(
      expect.objectContaining({ isArray: 'resolutions must be an array' }),
    );
  });

  it('UTCID09 rejects an invalid enum choice', async () => {
    const errors = await resolveErrors({
      sourceBranchId,
      targetBranchId,
      resolutions: [{ noteId: 'n1', choice: 'KEEP' }],
    });
    expect(errors[0]?.children?.[0]?.children?.[0]?.constraints).toEqual(
      expect.objectContaining({
        isEnum: expect.stringContaining('choice must be one of'),
      }),
    );
  });

  it('UTCID10 rejects KEEP_BOTH as an unsupported choice', async () => {
    const errors = await resolveErrors({
      sourceBranchId,
      targetBranchId,
      resolutions: [{ noteId: 'n1', choice: 'KEEP_BOTH' }],
    });
    expect(errors[0]?.children?.[0]?.children?.[0]?.constraints).toEqual(
      expect.objectContaining({
        isEnum: expect.stringContaining('choice must be one of'),
      }),
    );
  });

  it('UTCID11 rejects a non-string note id', async () => {
    const errors = await resolveErrors({
      sourceBranchId,
      targetBranchId,
      resolutions: [{ noteId: 5, choice: ConflictChoice.PICK_TARGET }],
    });
    expect(errors[0]?.children?.[0]?.children?.[0]?.constraints).toEqual(
      expect.objectContaining({ isString: 'noteId must be a string' }),
    );
  });

  it('UTCID12 rejects a non-string message', async () => {
    const errors = await resolveErrors({
      sourceBranchId,
      targetBranchId,
      resolutions: [validResolution],
      message: 123,
    });
    expect(errors[0].constraints).toEqual(
      expect.objectContaining({ isString: 'message must be a string' }),
    );
  });

  it('UTCID13 rejects a non-UUID expected target head', async () => {
    const errors = await resolveErrors({
      sourceBranchId,
      targetBranchId,
      resolutions: [validResolution],
      expectedTargetHeadCommitId: '123',
    });
    expect(errors[0].constraints).toEqual(
      expect.objectContaining({
        isUuid: 'expectedTargetHeadCommitId must be a UUID',
      }),
    );
  });
});

void ConflictResolution;
