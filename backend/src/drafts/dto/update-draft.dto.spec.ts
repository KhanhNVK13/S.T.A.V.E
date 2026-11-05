import { BadRequestException, ValidationPipe } from '@nestjs/common';
import {
  DraftNoteDto,
  DraftTrackDto,
  UpdateDraftDto,
} from './update-draft.dto';

describe('Drafts DTOs validation', () => {
  const pipe = new ValidationPipe({ whitelist: true, transform: true });

  const transformTrack = (body: unknown) =>
    pipe.transform(body, { type: 'body', metatype: DraftTrackDto });

  const transformNote = (body: unknown) =>
    pipe.transform(body, { type: 'body', metatype: DraftNoteDto });

  const transformDraft = (body: unknown) =>
    pipe.transform(body, { type: 'body', metatype: UpdateDraftDto });

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

  const validTrack = {
    id: 't1',
    name: 'Piano',
    order: 0,
    color: '#6366f1',
    muted: false,
    solo: false,
    volume: 0.8,
    pan: 0,
    instrument: 'Acoustic Grand Piano',
  };

  const validNote = {
    id: 'n1',
    trackId: 't1',
    pitch: 60,
    start: 0,
    duration: 480,
    velocity: 100,
  };

  const validMeta = {
    tempo: 120,
    timeSignature: [4, 4],
    ppq: 480,
  };

  // ============================================================================
  // SHEET: BE-DRF-03 (DraftTrackDto.validate)
  // ============================================================================
  describe('BE-DRF-03 DraftTrackDto.validate(dto)', () => {
    it('UTCID01 accepts a valid track', async () => {
      await expect(transformTrack(validTrack)).resolves.toMatchObject({
        id: 't1',
        name: 'Piano',
      });
    });

    it('UTCID02 rejects empty name', async () => {
      await expectValidationRejection(
        transformTrack({ ...validTrack, name: '' }),
        'name must be longer than or equal to 1 characters',
      );
    });

    it('UTCID03 accepts name with 50 characters boundary', async () => {
      const name50 = 'A'.repeat(50);
      await expect(
        transformTrack({ ...validTrack, name: name50 }),
      ).resolves.toMatchObject({ name: name50 });
    });

    it('UTCID04 rejects name with 51 characters', async () => {
      const name51 = 'A'.repeat(51);
      await expectValidationRejection(
        transformTrack({ ...validTrack, name: name51 }),
        'name must be shorter than or equal to 50 characters',
      );
    });

    it('UTCID05 rejects invalid hex color "red"', async () => {
      await expectValidationRejection(
        transformTrack({ ...validTrack, color: 'red' }),
        'color must match /^#[0-9a-fA-F]{6}$/ regular expression',
      );
    });

    it('UTCID06 rejects non-GM instrument "Kazoo X"', async () => {
      await expectValidationRejection(
        transformTrack({ ...validTrack, instrument: 'Kazoo X' }),
        'instrument must be one of the following values',
      );
    });

    it('UTCID07 rejects soundMap with out-of-range key "128"', async () => {
      await expectValidationRejection(
        transformTrack({
          ...validTrack,
          soundMap: { '128': '11111111-2222-3333-4444-555555555555' },
        }),
        'soundMap must map pitches 0-127 to custom sound ids',
      );
    });

    it('UTCID08 accepts boundary values volume 1 and pan -1', async () => {
      await expect(
        transformTrack({ ...validTrack, volume: 1, pan: -1 }),
      ).resolves.toMatchObject({ volume: 1, pan: -1 });
    });

    it('UTCID09 rejects volume 1.5 exceeding 1', async () => {
      await expectValidationRejection(
        transformTrack({ ...validTrack, volume: 1.5 }),
        'volume must not be greater than 1',
      );
    });

    it('UTCID10 rejects pan -1.5 less than -1', async () => {
      await expectValidationRejection(
        transformTrack({ ...validTrack, pan: -1.5 }),
        'pan must not be less than -1',
      );
    });
  });

  // ============================================================================
  // SHEET: BE-DRF-04 (DraftNoteDto.validate)
  // ============================================================================
  describe('BE-DRF-04 DraftNoteDto.validate(dto)', () => {
    it('UTCID01 accepts valid note (pitch 60, velocity 100)', async () => {
      await expect(transformNote(validNote)).resolves.toMatchObject({
        pitch: 60,
        velocity: 100,
      });
    });

    it('UTCID02 rejects non-integer pitch 60.5', async () => {
      await expectValidationRejection(
        transformNote({ ...validNote, pitch: 60.5 }),
        'pitch must be an integer number',
      );
    });

    it('UTCID03 rejects missing id', async () => {
      const { id, ...noId } = validNote;
      await expectValidationRejection(
        transformNote(noId),
        'id must be a string',
      );
    });

    it('UTCID04 rejects pitch -1', async () => {
      await expectValidationRejection(
        transformNote({ ...validNote, pitch: -1 }),
        'pitch must not be less than 0',
      );
    });

    it('UTCID05 accepts min pitch 0 boundary', async () => {
      await expect(
        transformNote({ ...validNote, pitch: 0 }),
      ).resolves.toMatchObject({ pitch: 0 });
    });

    it('UTCID06 accepts max pitch 127 boundary', async () => {
      await expect(
        transformNote({ ...validNote, pitch: 127 }),
      ).resolves.toMatchObject({ pitch: 127 });
    });

    it('UTCID07 rejects pitch 128', async () => {
      await expectValidationRejection(
        transformNote({ ...validNote, pitch: 128 }),
        'pitch must not be greater than 127',
      );
    });

    it('UTCID08 rejects velocity 0', async () => {
      await expectValidationRejection(
        transformNote({ ...validNote, velocity: 0 }),
        'velocity must not be less than 1',
      );
    });

    it('UTCID09 accepts min velocity 1 boundary', async () => {
      await expect(
        transformNote({ ...validNote, velocity: 1 }),
      ).resolves.toMatchObject({ velocity: 1 });
    });

    it('UTCID10 accepts max velocity 127 boundary', async () => {
      await expect(
        transformNote({ ...validNote, velocity: 127 }),
      ).resolves.toMatchObject({ velocity: 127 });
    });

    it('UTCID11 rejects velocity 128', async () => {
      await expectValidationRejection(
        transformNote({ ...validNote, velocity: 128 }),
        'velocity must not be greater than 127',
      );
    });

    it('UTCID12 rejects negative start -1', async () => {
      await expectValidationRejection(
        transformNote({ ...validNote, start: -1 }),
        'start must not be less than 0',
      );
    });

    it('UTCID13 accepts min start 0 boundary', async () => {
      await expect(
        transformNote({ ...validNote, start: 0 }),
      ).resolves.toMatchObject({ start: 0 });
    });

    it('UTCID14 rejects duration 0', async () => {
      await expectValidationRejection(
        transformNote({ ...validNote, duration: 0 }),
        'duration must not be less than 1',
      );
    });

    it('UTCID15 accepts min duration 1 boundary', async () => {
      await expect(
        transformNote({ ...validNote, duration: 1 }),
      ).resolves.toMatchObject({ duration: 1 });
    });
  });

  // ============================================================================
  // SHEET: BE-DRF-05 (UpdateDraftDto.validate)
  // ============================================================================
  describe('BE-DRF-05 UpdateDraftDto.validate(dto)', () => {
    it('UTCID01 accepts snapshot with 1 track and 1 note', async () => {
      await expect(
        transformDraft({
          schemaVersion: 3,
          meta: validMeta,
          tracks: [validTrack],
          notes: [validNote],
        }),
      ).resolves.toMatchObject({ schemaVersion: 3 });
    });

    it('UTCID02 accepts snapshot with 1 track and 0 notes', async () => {
      await expect(
        transformDraft({
          schemaVersion: 3,
          meta: validMeta,
          tracks: [validTrack],
          notes: [],
        }),
      ).resolves.toMatchObject({ schemaVersion: 3, notes: [] });
    });

    it('UTCID03 rejects snapshot with 0 tracks', async () => {
      await expectValidationRejection(
        transformDraft({
          schemaVersion: 3,
          meta: validMeta,
          tracks: [],
          notes: [],
        }),
        'tracks must contain at least 1 elements',
      );
    });

    it('UTCID04 accepts snapshot with 32 tracks (max limit boundary)', async () => {
      const tracks32 = Array.from({ length: 32 }, (_, i) => ({
        ...validTrack,
        id: `t${i + 1}`,
        order: i,
      }));
      await expect(
        transformDraft({
          schemaVersion: 3,
          meta: validMeta,
          tracks: tracks32,
          notes: [validNote],
        }),
      ).resolves.toMatchObject({ schemaVersion: 3 });
    });

    it('UTCID05 rejects snapshot with 33 tracks (over max limit)', async () => {
      const tracks33 = Array.from({ length: 33 }, (_, i) => ({
        ...validTrack,
        id: `t${i + 1}`,
        order: i,
      }));
      await expectValidationRejection(
        transformDraft({
          schemaVersion: 3,
          meta: validMeta,
          tracks: tracks33,
          notes: [validNote],
        }),
        'tracks must contain no more than 32 elements',
      );
    });

    it('UTCID06 rejects non-integer schemaVersion 3.5', async () => {
      await expectValidationRejection(
        transformDraft({
          schemaVersion: 3.5,
          meta: validMeta,
          tracks: [validTrack],
          notes: [validNote],
        }),
        'schemaVersion must be an integer number',
      );
    });

    it('UTCID07 rejects string schemaVersion "3"', async () => {
      await expectValidationRejection(
        transformDraft({
          schemaVersion: '3',
          meta: validMeta,
          tracks: [validTrack],
          notes: [validNote],
        }),
        'schemaVersion must be an integer number',
      );
    });

    it('UTCID08 rejects meta.timeSignature with 3 elements', async () => {
      await expectValidationRejection(
        transformDraft({
          schemaVersion: 3,
          meta: { ...validMeta, timeSignature: [4, 4, 4] },
          tracks: [validTrack],
          notes: [validNote],
        }),
        'meta.timeSignature must contain no more than 2 elements',
      );
    });

    it('UTCID09 rejects non-integer meta.ppq 480.5', async () => {
      await expectValidationRejection(
        transformDraft({
          schemaVersion: 3,
          meta: { ...validMeta, ppq: 480.5 },
          tracks: [validTrack],
          notes: [validNote],
        }),
        'meta.ppq must be an integer number',
      );
    });

    it('UTCID10 rejects missing meta object', async () => {
      await expectValidationRejection(
        transformDraft({
          schemaVersion: 3,
          tracks: [validTrack],
          notes: [validNote],
        }),
        'nested property meta must be either object or array',
      );
    });

    it('UTCID11 rejects nested track with empty name', async () => {
      await expectValidationRejection(
        transformDraft({
          schemaVersion: 3,
          meta: validMeta,
          tracks: [{ ...validTrack, name: '' }],
          notes: [validNote],
        }),
        'tracks.0.name must be longer than or equal to 1 characters',
      );
    });

    it('UTCID12 rejects nested note with velocity 128', async () => {
      await expectValidationRejection(
        transformDraft({
          schemaVersion: 3,
          meta: validMeta,
          tracks: [validTrack],
          notes: [{ ...validNote, velocity: 128 }],
        }),
        'notes.0.velocity must not be greater than 127',
      );
    });
  });
});
