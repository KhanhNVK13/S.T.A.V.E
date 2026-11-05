import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { CompareCommitsDto } from './compare-commits.dto';
import { CreateCommitDto } from './create-commit.dto';
import { GetCommitHistoryDto } from './get-commit-history.dto';
import { RestoreCommitDto } from './restore-commit.dto';
import { TagCommitDto } from './tag-commit.dto';

const VALID_UUID_1 = '11111111-2222-4333-8444-555555555555';
const VALID_UUID_2 = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

describe('Commits DTOs validation', () => {
  const pipe = new ValidationPipe({ whitelist: true, transform: true });

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

  // ============================================================================
  // SHEET: BE-CMT-20 (CompareCommitsDto.validate)
  // ============================================================================
  describe('BE-CMT-20 CompareCommitsDto.validate(dto)', () => {
    const transform = (body: unknown) =>
      pipe.transform(body, { type: 'body', metatype: CompareCommitsDto });

    it('UTCID01 accepts two valid UUID v4', async () => {
      await expect(
        transform({
          baseCommitId: VALID_UUID_1,
          targetCommitId: VALID_UUID_2,
        }),
      ).resolves.toEqual({
        baseCommitId: VALID_UUID_1,
        targetCommitId: VALID_UUID_2,
      });
    });

    it('UTCID02 rejects non-UUID baseCommitId "abc"', async () => {
      await expectValidationRejection(
        transform({
          baseCommitId: 'abc',
          targetCommitId: VALID_UUID_2,
        }),
        'Base commit ID must be a valid UUID',
      );
    });

    it('UTCID03 rejects undefined baseCommitId', async () => {
      await expectValidationRejection(
        transform({
          targetCommitId: VALID_UUID_2,
        }),
        'Base commit ID must be a valid UUID',
      );
    });

    it('UTCID04 rejects UUID v1 as baseCommitId', async () => {
      // UUID v1 has version digit 1 instead of 4
      const uuidV1 = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';
      await expectValidationRejection(
        transform({
          baseCommitId: uuidV1,
          targetCommitId: VALID_UUID_2,
        }),
        'Base commit ID must be a valid UUID',
      );
    });

    it('UTCID05 rejects empty string targetCommitId', async () => {
      await expectValidationRejection(
        transform({
          baseCommitId: VALID_UUID_1,
          targetCommitId: '',
        }),
        'Target commit ID must be a valid UUID',
      );
    });
  });

  // ============================================================================
  // SHEET: BE-CMT-21 (CreateCommitDto.validate)
  // ============================================================================
  describe('BE-CMT-21 CreateCommitDto.validate(dto)', () => {
    const transform = (body: unknown) =>
      pipe.transform(body, { type: 'body', metatype: CreateCommitDto });

    const baseSnapshot = {
      schemaVersion: 3,
      meta: { tempo: 120, timeSignature: [4, 4], ppq: 480 },
      tracks: [
        {
          id: 't1',
          name: 'Bass',
          order: 0,
          color: '#6366f1',
          volume: 0.8,
          pan: 0,
        },
      ],
      notes: [
        {
          id: 'n1',
          trackId: 't1',
          pitch: 60,
          start: 0,
          duration: 480,
          velocity: 100,
        },
      ],
    };

    it('UTCID01 accepts valid commit with message (8 chars)', async () => {
      await expect(
        transform({
          branch_id: VALID_UUID_1,
          message: 'Add bass',
        }),
      ).resolves.toMatchObject({
        branch_id: VALID_UUID_1,
        message: 'Add bass',
      });
    });

    it('UTCID02 accepts 1-char message boundary', async () => {
      await expect(
        transform({
          branch_id: VALID_UUID_1,
          message: 'A',
        }),
      ).resolves.toMatchObject({ message: 'A' });
    });

    it('UTCID03 accepts 200-char message boundary', async () => {
      const msg200 = 'M'.repeat(200);
      await expect(
        transform({
          branch_id: VALID_UUID_1,
          message: msg200,
        }),
      ).resolves.toMatchObject({ message: msg200 });
    });

    it('UTCID04 rejects empty message ""', async () => {
      await expectValidationRejection(
        transform({
          branch_id: VALID_UUID_1,
          message: '',
        }),
        'Message is required',
      );
    });

    it('UTCID05 rejects 201-char message', async () => {
      const msg201 = 'M'.repeat(201);
      await expectValidationRejection(
        transform({
          branch_id: VALID_UUID_1,
          message: msg201,
        }),
        'Message must not exceed 200 characters',
      );
    });

    it('UTCID06 rejects non-string message 123', async () => {
      await expectValidationRejection(
        transform({
          branch_id: VALID_UUID_1,
          message: 123,
        }),
        'Message must be a string',
      );
    });

    it('UTCID07 rejects non-UUID branch_id "not-a-uuid"', async () => {
      await expectValidationRejection(
        transform({
          branch_id: 'not-a-uuid',
          message: 'Add bass',
        }),
        'branch_id must be a UUID',
      );
    });

    it('UTCID08 accepts full valid snapshot with expectedHeadCommitId', async () => {
      await expect(
        transform({
          branch_id: VALID_UUID_1,
          message: 'Add bass',
          expectedHeadCommitId: VALID_UUID_2,
          snapshot: baseSnapshot,
        }),
      ).resolves.toMatchObject({
        branch_id: VALID_UUID_1,
        expectedHeadCommitId: VALID_UUID_2,
      });
    });

    it('UTCID09 rejects non-UUID expectedHeadCommitId "head-1"', async () => {
      await expectValidationRejection(
        transform({
          branch_id: VALID_UUID_1,
          message: 'Add bass',
          expectedHeadCommitId: 'head-1',
        }),
        'expectedHeadCommitId must be a UUID',
      );
    });

    it('UTCID10 rejects note velocity 0', async () => {
      await expectValidationRejection(
        transform({
          branch_id: VALID_UUID_1,
          message: 'Add bass',
          snapshot: {
            ...baseSnapshot,
            notes: [{ ...baseSnapshot.notes[0], velocity: 0 }],
          },
        }),
        'snapshot.notes.0.velocity must not be less than 1',
      );
    });

    it('UTCID11 accepts min note velocity 1 boundary', async () => {
      await expect(
        transform({
          branch_id: VALID_UUID_1,
          message: 'Add bass',
          snapshot: {
            ...baseSnapshot,
            notes: [{ ...baseSnapshot.notes[0], velocity: 1 }],
          },
        }),
      ).resolves.toMatchObject({ message: 'Add bass' });
    });

    it('UTCID12 accepts max note velocity 127 boundary', async () => {
      await expect(
        transform({
          branch_id: VALID_UUID_1,
          message: 'Add bass',
          snapshot: {
            ...baseSnapshot,
            notes: [{ ...baseSnapshot.notes[0], velocity: 127 }],
          },
        }),
      ).resolves.toMatchObject({ message: 'Add bass' });
    });

    it('UTCID13 rejects note velocity 128', async () => {
      await expectValidationRejection(
        transform({
          branch_id: VALID_UUID_1,
          message: 'Add bass',
          snapshot: {
            ...baseSnapshot,
            notes: [{ ...baseSnapshot.notes[0], velocity: 128 }],
          },
        }),
        'snapshot.notes.0.velocity must not be greater than 127',
      );
    });

    it('UTCID14 rejects note pitch -1', async () => {
      await expectValidationRejection(
        transform({
          branch_id: VALID_UUID_1,
          message: 'Add bass',
          snapshot: {
            ...baseSnapshot,
            notes: [{ ...baseSnapshot.notes[0], pitch: -1 }],
          },
        }),
        'snapshot.notes.0.pitch must not be less than 0',
      );
    });

    it('UTCID15 accepts min note pitch 0 boundary', async () => {
      await expect(
        transform({
          branch_id: VALID_UUID_1,
          message: 'Add bass',
          snapshot: {
            ...baseSnapshot,
            notes: [{ ...baseSnapshot.notes[0], pitch: 0 }],
          },
        }),
      ).resolves.toMatchObject({ message: 'Add bass' });
    });

    it('UTCID16 accepts max note pitch 127 boundary', async () => {
      await expect(
        transform({
          branch_id: VALID_UUID_1,
          message: 'Add bass',
          snapshot: {
            ...baseSnapshot,
            notes: [{ ...baseSnapshot.notes[0], pitch: 127 }],
          },
        }),
      ).resolves.toMatchObject({ message: 'Add bass' });
    });

    it('UTCID17 rejects note pitch 128', async () => {
      await expectValidationRejection(
        transform({
          branch_id: VALID_UUID_1,
          message: 'Add bass',
          snapshot: {
            ...baseSnapshot,
            notes: [{ ...baseSnapshot.notes[0], pitch: 128 }],
          },
        }),
        'snapshot.notes.0.pitch must not be greater than 127',
      );
    });

    it('UTCID18 rejects note duration 0', async () => {
      await expectValidationRejection(
        transform({
          branch_id: VALID_UUID_1,
          message: 'Add bass',
          snapshot: {
            ...baseSnapshot,
            notes: [{ ...baseSnapshot.notes[0], duration: 0 }],
          },
        }),
        'snapshot.notes.0.duration must not be less than 1',
      );
    });

    it('UTCID19 rejects snapshot with 0 tracks', async () => {
      await expectValidationRejection(
        transform({
          branch_id: VALID_UUID_1,
          message: 'Add bass',
          snapshot: {
            ...baseSnapshot,
            tracks: [],
          },
        }),
        'snapshot.tracks must contain at least 1 elements',
      );
    });

    it('UTCID20 rejects snapshot with 33 tracks', async () => {
      const tracks33 = Array.from({ length: 33 }, (_, i) => ({
        ...baseSnapshot.tracks[0],
        id: `t${i + 1}`,
        order: i,
      }));
      await expectValidationRejection(
        transform({
          branch_id: VALID_UUID_1,
          message: 'Add bass',
          snapshot: {
            ...baseSnapshot,
            tracks: tracks33,
          },
        }),
        'snapshot.tracks must contain no more than 32 elements',
      );
    });
  });

  // ============================================================================
  // SHEET: BE-CMT-22 (GetCommitHistoryDto.validate)
  // ============================================================================
  describe('BE-CMT-22 GetCommitHistoryDto.validate(dto)', () => {
    const transform = (body: unknown) =>
      pipe.transform(body, { type: 'body', metatype: GetCommitHistoryDto });

    it('UTCID01 uses default page 1 and limit 20 when undefined', async () => {
      await expect(transform({})).resolves.toEqual({
        page: 1,
        limit: 20,
      });
    });

    it('UTCID02 converts string "1" for page and limit to numbers', async () => {
      await expect(
        transform({
          branch_id: VALID_UUID_1,
          page: '1',
          limit: '1',
        }),
      ).resolves.toEqual({
        branch_id: VALID_UUID_1,
        page: 1,
        limit: 1,
      });
    });

    it('UTCID03 accepts limit boundary 100 as string', async () => {
      await expect(
        transform({
          branch_id: VALID_UUID_1,
          page: '1',
          limit: '100',
        }),
      ).resolves.toEqual({
        branch_id: VALID_UUID_1,
        page: 1,
        limit: 100,
      });
    });

    it('UTCID04 rejects non-UUID branch_id "xyz"', async () => {
      await expectValidationRejection(
        transform({ branch_id: 'xyz' }),
        'branch_id must be a UUID',
      );
    });

    it('UTCID05 rejects page 0 less than 1', async () => {
      await expectValidationRejection(
        transform({ page: '0' }),
        'page must not be less than 1',
      );
    });

    it('UTCID06 rejects non-numeric page "abc"', async () => {
      await expectValidationRejection(
        transform({ page: 'abc' }),
        'page must be a number conforming to the specified constraints',
      );
    });

    it('UTCID07 rejects limit 101 greater than 100', async () => {
      await expectValidationRejection(
        transform({ limit: '101' }),
        'limit must not be greater than 100',
      );
    });

    it('UTCID08 rejects limit 0 less than 1', async () => {
      await expectValidationRejection(
        transform({ limit: '0' }),
        'limit must not be less than 1',
      );
    });
  });

  // ============================================================================
  // SHEET: BE-CMT-23 (RestoreCommitDto.validate)
  // ============================================================================
  describe('BE-CMT-23 RestoreCommitDto.validate(dto)', () => {
    const transform = (body: unknown) =>
      pipe.transform(body, { type: 'body', metatype: RestoreCommitDto });

    it('UTCID01 accepts valid branch_id without message', async () => {
      await expect(transform({ branch_id: VALID_UUID_1 })).resolves.toEqual({
        branch_id: VALID_UUID_1,
      });
    });

    it('UTCID02 accepts valid branch_id with message', async () => {
      await expect(
        transform({
          branch_id: VALID_UUID_1,
          message: 'Back to chorus',
        }),
      ).resolves.toEqual({
        branch_id: VALID_UUID_1,
        message: 'Back to chorus',
      });
    });

    it('UTCID03 rejects empty message ""', async () => {
      await expectValidationRejection(
        transform({
          branch_id: VALID_UUID_1,
          message: '',
        }),
        'Message must be at least 1 character',
      );
    });

    it('UTCID04 accepts 200-char message boundary', async () => {
      const msg200 = 'R'.repeat(200);
      await expect(
        transform({
          branch_id: VALID_UUID_1,
          message: msg200,
        }),
      ).resolves.toMatchObject({ message: msg200 });
    });

    it('UTCID05 rejects 201-char message', async () => {
      const msg201 = 'R'.repeat(201);
      await expectValidationRejection(
        transform({
          branch_id: VALID_UUID_1,
          message: msg201,
        }),
        'Message must not exceed 200 characters',
      );
    });

    it('UTCID06 rejects non-string message 42', async () => {
      await expectValidationRejection(
        transform({
          branch_id: VALID_UUID_1,
          message: 42,
        }),
        'Message must be a string',
      );
    });

    it('UTCID07 rejects non-UUID branch_id "123"', async () => {
      await expectValidationRejection(
        transform({ branch_id: '123' }),
        'Branch ID must be a valid UUID',
      );
    });

    it('UTCID08 rejects undefined branch_id', async () => {
      await expectValidationRejection(
        transform({}),
        'Branch ID must be a valid UUID',
      );
    });
  });

  // ============================================================================
  // SHEET: BE-CMT-24 (TagCommitDto.validate)
  // ============================================================================
  describe('BE-CMT-24 TagCommitDto.validate(dto)', () => {
    const transform = (body: unknown) =>
      pipe.transform(body, { type: 'body', metatype: TagCommitDto });

    it('UTCID01 accepts valid tag "v1-0"', async () => {
      await expect(transform({ tag: 'v1-0' })).resolves.toEqual({
        tag: 'v1-0',
      });
    });

    it('UTCID02 accepts single-character tag "a"', async () => {
      await expect(transform({ tag: 'a' })).resolves.toEqual({ tag: 'a' });
    });

    it('UTCID03 accepts 30-character tag boundary', async () => {
      const tag30 = 'a'.repeat(30);
      await expect(transform({ tag: tag30 })).resolves.toEqual({ tag: tag30 });
    });

    it('UTCID04 rejects empty tag ""', async () => {
      await expectValidationRejection(
        transform({ tag: '' }),
        'Tag name is required',
      );
    });

    it('UTCID05 rejects 31-character tag', async () => {
      const tag31 = 'a'.repeat(31);
      await expectValidationRejection(
        transform({ tag: tag31 }),
        'Tag name must not exceed 30 characters',
      );
    });

    it('UTCID06 rejects tag with leading hyphen "-v1"', async () => {
      await expectValidationRejection(
        transform({ tag: '-v1' }),
        'Tag name must be alphanumeric with hyphens (no leading/trailing hyphens)',
      );
    });

    it('UTCID07 rejects tag with trailing hyphen "v1-"', async () => {
      await expectValidationRejection(
        transform({ tag: 'v1-' }),
        'Tag name must be alphanumeric with hyphens (no leading/trailing hyphens)',
      );
    });

    it('UTCID08 rejects tag with dot "v1.0"', async () => {
      await expectValidationRejection(
        transform({ tag: 'v1.0' }),
        'Tag name must be alphanumeric with hyphens (no leading/trailing hyphens)',
      );
    });

    it('UTCID09 rejects tag with space "v 1"', async () => {
      await expectValidationRejection(
        transform({ tag: 'v 1' }),
        'Tag name must be alphanumeric with hyphens (no leading/trailing hyphens)',
      );
    });

    it('UTCID10 rejects non-string tag 123', async () => {
      await expectValidationRejection(
        transform({ tag: 123 }),
        'Tag name must be a string',
      );
    });
  });
});
