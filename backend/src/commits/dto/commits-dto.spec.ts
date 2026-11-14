import { BadRequestException, ValidationPipe } from '@nestjs/common';

import { CompareCommitsDto } from './compare-commits.dto';
import { CreateCommitDto } from './create-commit.dto';
import { GetCommitHistoryDto } from './get-commit-history.dto';
import { RestoreCommitDto } from './restore-commit.dto';
import { TagCommitDto } from './tag-commit.dto';

// =============================================================================
// Helpers
// =============================================================================

/** ValidationPipe giống hệt `main.ts` (whitelist + transform). */
const pipe = new ValidationPipe({ whitelist: true, transform: true });

const validate = (metatype: any, dto: unknown) =>
  pipe.transform(dto as any, { type: 'body', metatype });

const UUID_V4 = '3f0d1b6e-9a44-4d1b-8f0a-1c2d3e4f5a6b';
const UUID_V4_B = '7b2e5c11-4a3d-4f8e-9c0a-2b3c4d5e6f70';
const UUID_V1 = '3f0d1b6e-9a44-1d1b-8f0a-1c2d3e4f5a6b';

const validSnapshot = () => ({
  schemaVersion: 3,
  meta: { tempo: 120, timeSignature: [4, 4] as [number, number], ppq: 480 },
  tracks: [
    {
      id: 'track-1',
      name: 'Piano',
      order: 0,
      color: '#6366f1',
      volume: 1,
      pan: 0,
    },
  ],
  notes: [
    {
      id: 'note-1',
      trackId: 'track-1',
      pitch: 60,
      start: 0,
      duration: 480,
      velocity: 100,
    },
  ],
});

/** Trả về danh sách message validation; ném Error nếu không có lỗi nào. */
const validationMessages = async (
  promise: Promise<unknown>,
): Promise<string[]> => {
  try {
    await promise;
  } catch (e) {
    expect(e).toBeInstanceOf(BadRequestException);
    const response = (e as BadRequestException).getResponse() as {
      message: string | string[];
    };
    return Array.isArray(response.message)
      ? response.message
      : [response.message];
  }
  throw new Error('Expected validation to fail, but it passed');
};

/** Không được có lỗi validation nào. */
const expectNoValidationError = async (
  promise: Promise<unknown>,
): Promise<void> => {
  await expect(promise).resolves.toBeDefined();
};

// =============================================================================
// BE-CMT-20 — CompareCommitsDto.validate(dto)
// =============================================================================

describe('BE-CMT-20 CompareCommitsDto.validate(dto)', () => {
  it('UTCID01 (N): accepts two valid UUID v4 ids', async () => {
    await expectNoValidationError(
      validate(CompareCommitsDto, {
        baseCommitId: UUID_V4,
        targetCommitId: UUID_V4_B,
      }),
    );
  });

  it('UTCID02 (A): rejects a non-UUID baseCommitId with the custom message', async () => {
    const messages = await validationMessages(
      validate(CompareCommitsDto, {
        baseCommitId: 'abc',
        targetCommitId: UUID_V4_B,
      }),
    );

    expect(messages).toContain('Base commit ID must be a valid UUID');
  });

  it('UTCID03 (A): rejects a missing baseCommitId with the custom message', async () => {
    const messages = await validationMessages(
      validate(CompareCommitsDto, { targetCommitId: UUID_V4_B }),
    );

    expect(messages).toContain('Base commit ID must be a valid UUID');
  });

  it('UTCID04 (A): rejects a UUID v1 baseCommitId with the custom message', async () => {
    const messages = await validationMessages(
      validate(CompareCommitsDto, {
        baseCommitId: UUID_V1,
        targetCommitId: UUID_V4_B,
      }),
    );

    expect(messages).toContain('Base commit ID must be a valid UUID');
  });

  it('UTCID05 (A): rejects an empty targetCommitId with the custom message', async () => {
    const messages = await validationMessages(
      validate(CompareCommitsDto, {
        baseCommitId: UUID_V4,
        targetCommitId: '',
      }),
    );

    expect(messages).toContain('Target commit ID must be a valid UUID');
  });
});

// =============================================================================
// BE-CMT-21 — CreateCommitDto.validate(dto)
// =============================================================================

describe('BE-CMT-21 CreateCommitDto.validate(dto)', () => {
  const validDto = (over: Record<string, unknown> = {}) => ({
    branch_id: UUID_V4,
    message: 'Add bass',
    ...over,
  });

  it('UTCID01 (N): accepts a valid branch id and message without a snapshot', async () => {
    await expectNoValidationError(validate(CreateCommitDto, validDto()));
  });

  it('UTCID02 (B): accepts a 1-character message', async () => {
    await expectNoValidationError(
      validate(CreateCommitDto, validDto({ message: 'a' })),
    );
  });

  it('UTCID03 (B): accepts a 200-character message', async () => {
    await expectNoValidationError(
      validate(CreateCommitDto, validDto({ message: 'a'.repeat(200) })),
    );
  });

  it('UTCID04 (A): rejects an empty message with "Message is required"', async () => {
    const messages = await validationMessages(
      validate(CreateCommitDto, validDto({ message: '' })),
    );

    expect(messages).toContain('Message is required');
  });

  it('UTCID05 (A): rejects a 201-character message', async () => {
    const messages = await validationMessages(
      validate(CreateCommitDto, validDto({ message: 'a'.repeat(201) })),
    );

    expect(messages).toContain('Message must not exceed 200 characters');
  });

  it('UTCID06 (A): rejects a numeric message with "Message must be a string"', async () => {
    const messages = await validationMessages(
      validate(CreateCommitDto, validDto({ message: 123 })),
    );

    expect(messages).toContain('Message must be a string');
  });

  it('UTCID07 (A): rejects a non-UUID branch_id', async () => {
    const messages = await validationMessages(
      validate(CreateCommitDto, validDto({ branch_id: 'not-a-uuid' })),
    );

    expect(messages).toContain('branch_id must be a UUID');
  });

  it('UTCID08 (N): accepts a valid snapshot and expectedHeadCommitId', async () => {
    await expectNoValidationError(
      validate(
        CreateCommitDto,
        validDto({ snapshot: validSnapshot(), expectedHeadCommitId: UUID_V4 }),
      ),
    );
  });

  it('UTCID09 (A): rejects a non-UUID expectedHeadCommitId', async () => {
    const messages = await validationMessages(
      validate(CreateCommitDto, validDto({ expectedHeadCommitId: 'head-1' })),
    );

    expect(messages).toContain('expectedHeadCommitId must be a UUID');
  });

  it('UTCID10 (A): rejects a note velocity of 0 (must not be less than 1)', async () => {
    const messages = await validationMessages(
      validate(
        CreateCommitDto,
        validDto({
          snapshot: {
            ...validSnapshot(),
            notes: [{ ...validSnapshot().notes[0], velocity: 0 }],
          },
        }),
      ),
    );

    expect(messages).toContain(
      'snapshot.notes.0.velocity must not be less than 1',
    );
  });

  it('UTCID11 (B): accepts a note velocity of 1', async () => {
    await expectNoValidationError(
      validate(
        CreateCommitDto,
        validDto({
          snapshot: {
            ...validSnapshot(),
            notes: [{ ...validSnapshot().notes[0], velocity: 1 }],
          },
        }),
      ),
    );
  });

  it('UTCID12 (B): accepts a note velocity of 127', async () => {
    await expectNoValidationError(
      validate(
        CreateCommitDto,
        validDto({
          snapshot: {
            ...validSnapshot(),
            notes: [{ ...validSnapshot().notes[0], velocity: 127 }],
          },
        }),
      ),
    );
  });

  it('UTCID13 (A): rejects a note velocity of 128', async () => {
    const messages = await validationMessages(
      validate(
        CreateCommitDto,
        validDto({
          snapshot: {
            ...validSnapshot(),
            notes: [{ ...validSnapshot().notes[0], velocity: 128 }],
          },
        }),
      ),
    );

    expect(messages).toContain(
      'snapshot.notes.0.velocity must not be greater than 127',
    );
  });

  it('UTCID14 (A): rejects a note pitch of -1 (must not be less than 0)', async () => {
    const messages = await validationMessages(
      validate(
        CreateCommitDto,
        validDto({
          snapshot: {
            ...validSnapshot(),
            notes: [{ ...validSnapshot().notes[0], pitch: -1 }],
          },
        }),
      ),
    );

    expect(messages).toContain(
      'snapshot.notes.0.pitch must not be less than 0',
    );
  });

  it('UTCID15 (B): accepts a note pitch of 0', async () => {
    await expectNoValidationError(
      validate(
        CreateCommitDto,
        validDto({
          snapshot: {
            ...validSnapshot(),
            notes: [{ ...validSnapshot().notes[0], pitch: 0 }],
          },
        }),
      ),
    );
  });

  it('UTCID16 (B): accepts a note pitch of 127', async () => {
    await expectNoValidationError(
      validate(
        CreateCommitDto,
        validDto({
          snapshot: {
            ...validSnapshot(),
            notes: [{ ...validSnapshot().notes[0], pitch: 127 }],
          },
        }),
      ),
    );
  });

  it('UTCID17 (A): rejects a note pitch of 128', async () => {
    const messages = await validationMessages(
      validate(
        CreateCommitDto,
        validDto({
          snapshot: {
            ...validSnapshot(),
            notes: [{ ...validSnapshot().notes[0], pitch: 128 }],
          },
        }),
      ),
    );

    expect(messages).toContain(
      'snapshot.notes.0.pitch must not be greater than 127',
    );
  });

  it('UTCID18 (A): rejects a note duration of 0', async () => {
    const messages = await validationMessages(
      validate(
        CreateCommitDto,
        validDto({
          snapshot: {
            ...validSnapshot(),
            notes: [{ ...validSnapshot().notes[0], duration: 0 }],
          },
        }),
      ),
    );

    expect(messages).toContain(
      'snapshot.notes.0.duration must not be less than 1',
    );
  });

  it('UTCID19 (B): accepts a snapshot with 0 tracks (a new project starts empty)', async () => {
    await expectNoValidationError(
      validate(
        CreateCommitDto,
        validDto({
          snapshot: { ...validSnapshot(), tracks: [] },
        }),
      ),
    );
  });

  it('UTCID20 (A): rejects a snapshot with 33 tracks (no more than 32 elements)', async () => {
    const tracks = Array.from({ length: 33 }, (_, i) => ({
      ...validSnapshot().tracks[0],
      id: `track-${i + 1}`,
    }));

    const messages = await validationMessages(
      validate(
        CreateCommitDto,
        validDto({
          snapshot: { ...validSnapshot(), tracks },
        }),
      ),
    );

    expect(messages).toContain(
      'snapshot.tracks must contain no more than 32 elements',
    );
  });
});

// =============================================================================
// BE-CMT-22 — GetCommitHistoryDto.validate(dto)
// =============================================================================

describe('BE-CMT-22 GetCommitHistoryDto.validate(dto)', () => {
  it('UTCID01 (N): applies the defaults page = 1 and limit = 20', async () => {
    const result = await validate(GetCommitHistoryDto, {});

    expect(result).toEqual(expect.objectContaining({ page: 1, limit: 20 }));
  });

  it('UTCID02 (N): converts a valid branch_id, page and limit to their values', async () => {
    const result = await validate(GetCommitHistoryDto, {
      branch_id: UUID_V4,
      page: '1',
      limit: '100',
    });

    expect(result).toEqual(
      expect.objectContaining({ branch_id: UUID_V4, page: 1, limit: 100 }),
    );
  });

  it('UTCID03 (B): accepts a limit of exactly 100', async () => {
    const result = await validate(GetCommitHistoryDto, { limit: '100' });

    expect(result).toEqual(expect.objectContaining({ limit: 100 }));
  });

  it('UTCID04 (A): rejects a non-UUID branch_id', async () => {
    const messages = await validationMessages(
      validate(GetCommitHistoryDto, { branch_id: 'xyz' }),
    );

    expect(messages).toContain('branch_id must be a UUID');
  });

  it('UTCID05 (A): rejects a page of 0', async () => {
    const messages = await validationMessages(
      validate(GetCommitHistoryDto, { page: '0' }),
    );

    expect(messages).toContain('page must not be less than 1');
  });

  it('UTCID06 (A): rejects a non-numeric page', async () => {
    const messages = await validationMessages(
      validate(GetCommitHistoryDto, { page: 'abc' }),
    );

    expect(messages).toContain(
      'page must be a number conforming to the specified constraints',
    );
  });

  it('UTCID07 (A): rejects a limit of 101', async () => {
    const messages = await validationMessages(
      validate(GetCommitHistoryDto, { limit: '101' }),
    );

    expect(messages).toContain('limit must not be greater than 100');
  });

  it('UTCID08 (A): rejects a limit of 0', async () => {
    const messages = await validationMessages(
      validate(GetCommitHistoryDto, { limit: '0' }),
    );

    expect(messages).toContain('limit must not be less than 1');
  });
});

// =============================================================================
// BE-CMT-23 — RestoreCommitDto.validate(dto)
// =============================================================================

describe('BE-CMT-23 RestoreCommitDto.validate(dto)', () => {
  it('UTCID01 (N): accepts a valid branch id', async () => {
    await expectNoValidationError(
      validate(RestoreCommitDto, { branch_id: UUID_V4 }),
    );
  });

  it('UTCID02 (N): accepts a custom message', async () => {
    await expectNoValidationError(
      validate(RestoreCommitDto, {
        branch_id: UUID_V4,
        message: 'Back to chorus',
      }),
    );
  });

  it('UTCID03 (A): rejects an empty message (must be at least 1 character)', async () => {
    const messages = await validationMessages(
      validate(RestoreCommitDto, { branch_id: UUID_V4, message: '' }),
    );

    expect(messages).toContain('Message must be at least 1 character');
  });

  it('UTCID04 (B): accepts a 200-character message', async () => {
    await expectNoValidationError(
      validate(RestoreCommitDto, {
        branch_id: UUID_V4,
        message: 'a'.repeat(200),
      }),
    );
  });

  it('UTCID05 (A): rejects a 201-character message', async () => {
    const messages = await validationMessages(
      validate(RestoreCommitDto, {
        branch_id: UUID_V4,
        message: 'a'.repeat(201),
      }),
    );

    expect(messages).toContain('Message must not exceed 200 characters');
  });

  it('UTCID06 (A): rejects a numeric message', async () => {
    const messages = await validationMessages(
      validate(RestoreCommitDto, { branch_id: UUID_V4, message: 42 }),
    );

    expect(messages).toContain('Message must be a string');
  });

  it('UTCID07 (A): rejects a non-UUID branch id', async () => {
    const messages = await validationMessages(
      validate(RestoreCommitDto, { branch_id: '123' }),
    );

    expect(messages).toContain('Branch ID must be a valid UUID');
  });

  it('UTCID08 (A): rejects a missing branch id', async () => {
    const messages = await validationMessages(validate(RestoreCommitDto, {}));

    expect(messages).toContain('Branch ID must be a valid UUID');
  });
});

// =============================================================================
// BE-CMT-24 — TagCommitDto.validate(dto)
// =============================================================================

describe('BE-CMT-24 TagCommitDto.validate(dto)', () => {
  it('UTCID01 (N): accepts a valid tag name', async () => {
    await expectNoValidationError(validate(TagCommitDto, { tag: 'v1-0' }));
  });

  it('UTCID02 (B): accepts a 1-character tag name', async () => {
    await expectNoValidationError(validate(TagCommitDto, { tag: 'a' }));
  });

  it('UTCID03 (B): accepts a 30-character tag name', async () => {
    await expectNoValidationError(
      validate(TagCommitDto, { tag: 'a'.repeat(30) }),
    );
  });

  it('UTCID04 (A): rejects an empty tag name', async () => {
    const messages = await validationMessages(
      validate(TagCommitDto, { tag: '' }),
    );

    expect(messages).toContain('Tag name is required');
  });

  it('UTCID05 (A): rejects a 31-character tag name', async () => {
    const messages = await validationMessages(
      validate(TagCommitDto, { tag: 'a'.repeat(31) }),
    );

    expect(messages).toContain('Tag name must not exceed 30 characters');
  });

  it('UTCID06 (A): rejects a tag name with a leading hyphen', async () => {
    const messages = await validationMessages(
      validate(TagCommitDto, { tag: '-v1' }),
    );

    expect(messages).toContain(
      'Tag name must be alphanumeric with hyphens (no leading/trailing hyphens)',
    );
  });

  it('UTCID07 (A): rejects a tag name with a trailing hyphen', async () => {
    const messages = await validationMessages(
      validate(TagCommitDto, { tag: 'v1-' }),
    );

    expect(messages).toContain(
      'Tag name must be alphanumeric with hyphens (no leading/trailing hyphens)',
    );
  });

  it('UTCID08 (A): rejects a tag name containing a dot', async () => {
    const messages = await validationMessages(
      validate(TagCommitDto, { tag: 'v1.0' }),
    );

    expect(messages).toContain(
      'Tag name must be alphanumeric with hyphens (no leading/trailing hyphens)',
    );
  });

  it('UTCID09 (A): rejects a tag name containing a space', async () => {
    const messages = await validationMessages(
      validate(TagCommitDto, { tag: 'v 1' }),
    );

    expect(messages).toContain(
      'Tag name must be alphanumeric with hyphens (no leading/trailing hyphens)',
    );
  });

  it('UTCID10 (A): rejects a numeric tag name', async () => {
    const messages = await validationMessages(
      validate(TagCommitDto, { tag: 123 }),
    );

    expect(messages).toContain('Tag name must be a string');
  });
});
