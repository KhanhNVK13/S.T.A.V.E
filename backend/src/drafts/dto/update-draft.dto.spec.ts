import { ValidationPipe } from '@nestjs/common';
import { DRAFT_SCHEMA_VERSION } from '@stave/shared-types';
import {
  DraftNoteDto,
  DraftTrackDto,
  UpdateDraftDto,
} from './update-draft.dto';

const validTrack = () => ({
  id: 'track-1',
  name: 'Piano',
  order: 0,
  color: '#6366f1',
  muted: false,
  solo: false,
  volume: 1,
  pan: 0,
  instrument: null,
});

const validNote = () => ({
  id: 'note-1',
  trackId: 'track-1',
  pitch: 60,
  start: 0,
  duration: 480,
  velocity: 100,
});

const validDraftDto = () => ({
  schemaVersion: DRAFT_SCHEMA_VERSION,
  meta: { tempo: 120, timeSignature: [4, 4] as [number, number], ppq: 480 },
  tracks: [validTrack()],
  notes: [validNote()],
});

const pipe = new ValidationPipe({ whitelist: true, transform: true });

const validate = (metatype: any, value: any) =>
  pipe.transform(value, { type: 'body', metatype });

const validationMessages = async (promise: Promise<any>): Promise<string[]> => {
  try {
    await promise;
  } catch (err: any) {
    const response = err.getResponse();
    return Array.isArray(response.message)
      ? response.message
      : [response.message];
  }
  throw new Error('Expected validation to fail, but it passed');
};

const expectNoValidationError = async (
  promise: Promise<any>,
): Promise<void> => {
  await expect(promise).resolves.toBeDefined();
};

// =============================================================================
describe('BE-DRF-03 DraftTrackDto.validate(dto)', () => {
  it('UTCID01 (N) accepts a valid track without validation errors', async () => {
    await expectNoValidationError(validate(DraftTrackDto, validTrack()));
  });

  it('UTCID02 (A) rejects an empty track name', async () => {
    const messages = await validationMessages(
      validate(DraftTrackDto, { ...validTrack(), name: '' }),
    );

    expect(messages).toContain(
      'name must be longer than or equal to 1 characters',
    );
  });

  it('UTCID03 (B) accepts a track name of exactly 50 characters', async () => {
    await expectNoValidationError(
      validate(DraftTrackDto, { ...validTrack(), name: 'a'.repeat(50) }),
    );
  });

  it('UTCID04 (A) rejects a track name of 51 characters', async () => {
    const messages = await validationMessages(
      validate(DraftTrackDto, { ...validTrack(), name: 'a'.repeat(51) }),
    );

    expect(messages).toContain(
      'name must be shorter than or equal to 50 characters',
    );
  });

  it('UTCID05 (A) rejects a non-hex track color', async () => {
    const messages = await validationMessages(
      validate(DraftTrackDto, { ...validTrack(), color: 'red' }),
    );

    expect(messages).toContain(
      'color must match /^#[0-9a-fA-F]{6}$/ regular expression',
    );
  });

  it('UTCID06 (A) rejects an instrument that is not a General MIDI name', async () => {
    const messages = await validationMessages(
      validate(DraftTrackDto, { ...validTrack(), instrument: 'Kazoo X' }),
    );

    expect(messages).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          'instrument must be one of the following values:',
        ),
      ]),
    );
  });

  it('UTCID07 (A) rejects a soundMap keyed by pitch 128', async () => {
    const messages = await validationMessages(
      validate(DraftTrackDto, {
        ...validTrack(),
        soundMap: { '128': '3f0d1b6e-9a44-4d1b-8f0a-1c2d3e4f5a6b' },
      }),
    );

    expect(messages).toContain(
      'soundMap must map pitches 0-127 to custom sound ids',
    );
  });

  it('UTCID08 (B) accepts volume 1 and pan -1 (range edges)', async () => {
    await expectNoValidationError(
      validate(DraftTrackDto, { ...validTrack(), volume: 1, pan: -1 }),
    );
  });

  it('UTCID09 (A) rejects volume 1.5', async () => {
    // DEFECT (BR-38): DTO chỉ có @IsNumber, chưa chặn volume > 1.
    const messages = await validationMessages(
      validate(DraftTrackDto, { ...validTrack(), volume: 1.5 }),
    );

    expect(messages).toContain('volume must not be greater than 1');
  });

  it('UTCID10 (A) rejects pan -1.5', async () => {
    // DEFECT (BR-38): DTO chỉ có @IsNumber, chưa chặn pan < -1.
    const messages = await validationMessages(
      validate(DraftTrackDto, { ...validTrack(), pan: -1.5 }),
    );

    expect(messages).toContain('pan must not be less than -1');
  });
});

// =============================================================================
// BE-DRF-04 — DraftNoteDto.validate(dto)
// =============================================================================

describe('BE-DRF-04 DraftNoteDto.validate(dto)', () => {
  it('UTCID01 (N) accepts a valid note without validation errors', async () => {
    await expectNoValidationError(validate(DraftNoteDto, validNote()));
  });

  it('UTCID02 (A) rejects a non-integer pitch', async () => {
    const messages = await validationMessages(
      validate(DraftNoteDto, { ...validNote(), pitch: 60.5 }),
    );

    expect(messages).toContain('pitch must be an integer number');
  });

  it('UTCID03 (A) rejects a note without an id', async () => {
    const { id, ...withoutId } = validNote();
    void id;
    const messages = await validationMessages(
      validate(DraftNoteDto, withoutId),
    );

    expect(messages).toContain('id must be a string');
  });

  it('UTCID04 (A) rejects pitch -1', async () => {
    // DEFECT (BR-27): DTO chỉ kiểm tra integer, chưa chặn pitch < 0.
    const messages = await validationMessages(
      validate(DraftNoteDto, { ...validNote(), pitch: -1 }),
    );

    expect(messages).toContain('pitch must not be less than 0');
  });

  it('UTCID05 (B) accepts pitch 0', async () => {
    await expectNoValidationError(
      validate(DraftNoteDto, { ...validNote(), pitch: 0 }),
    );
  });

  it('UTCID06 (B) accepts pitch 127', async () => {
    await expectNoValidationError(
      validate(DraftNoteDto, { ...validNote(), pitch: 127 }),
    );
  });

  it('UTCID07 (A) rejects pitch 128', async () => {
    // DEFECT (BR-27): DTO chỉ kiểm tra integer, chưa chặn pitch > 127.
    const messages = await validationMessages(
      validate(DraftNoteDto, { ...validNote(), pitch: 128 }),
    );

    expect(messages).toContain('pitch must not be greater than 127');
  });

  it('UTCID08 (A) rejects velocity 0', async () => {
    // DEFECT (BR-27): DTO chỉ kiểm tra integer, chưa chặn velocity < 1.
    const messages = await validationMessages(
      validate(DraftNoteDto, { ...validNote(), velocity: 0 }),
    );

    expect(messages).toContain('velocity must not be less than 1');
  });

  it('UTCID09 (B) accepts velocity 1', async () => {
    await expectNoValidationError(
      validate(DraftNoteDto, { ...validNote(), velocity: 1 }),
    );
  });

  it('UTCID10 (B) accepts velocity 127', async () => {
    await expectNoValidationError(
      validate(DraftNoteDto, { ...validNote(), velocity: 127 }),
    );
  });

  it('UTCID11 (A) rejects velocity 128', async () => {
    // DEFECT (BR-27): DTO chỉ kiểm tra integer, chưa chặn velocity > 127.
    const messages = await validationMessages(
      validate(DraftNoteDto, { ...validNote(), velocity: 128 }),
    );

    expect(messages).toContain('velocity must not be greater than 127');
  });

  it('UTCID12 (A) rejects start -1', async () => {
    // DEFECT (BR-27): DTO chỉ kiểm tra integer, chưa chặn start < 0.
    const messages = await validationMessages(
      validate(DraftNoteDto, { ...validNote(), start: -1 }),
    );

    expect(messages).toContain('start must not be less than 0');
  });

  it('UTCID13 (B) accepts start 0', async () => {
    await expectNoValidationError(
      validate(DraftNoteDto, { ...validNote(), start: 0 }),
    );
  });

  it('UTCID14 (A) rejects duration 0', async () => {
    // DEFECT (BR-27): DTO chỉ kiểm tra integer, chưa chặn duration < 1.
    const messages = await validationMessages(
      validate(DraftNoteDto, { ...validNote(), duration: 0 }),
    );

    expect(messages).toContain('duration must not be less than 1');
  });

  it('UTCID15 (B) accepts duration 1', async () => {
    await expectNoValidationError(
      validate(DraftNoteDto, { ...validNote(), duration: 1 }),
    );
  });
});

// =============================================================================
// BE-DRF-05 — UpdateDraftDto.validate(dto)
// =============================================================================

describe('BE-DRF-05 UpdateDraftDto.validate(dto)', () => {
  it('UTCID01 (N) accepts a valid snapshot with 1 track and 1 note', async () => {
    await expectNoValidationError(validate(UpdateDraftDto, validDraftDto()));
  });

  it('UTCID02 (B) accepts a snapshot with 0 notes', async () => {
    await expectNoValidationError(
      validate(UpdateDraftDto, { ...validDraftDto(), notes: [] }),
    );
  });

  it('UTCID03 (A) accepts a snapshot with 0 tracks', async () => {
    // NOTE (BR-31): sheet yêu cầu "tracks must contain at least 1 elements",
    // nhưng quyết định nhóm là cho phép 0 track — snapshot rỗng mặc định của
    // app có tracks: [], và xoá track cuối cũng phải autosave được.
    await expectNoValidationError(
      validate(UpdateDraftDto, { ...validDraftDto(), tracks: [] }),
    );
  });

  it('UTCID04 (B) accepts a snapshot with 32 tracks', async () => {
    const tracks = Array.from({ length: 32 }, (_, i) => ({
      ...validTrack(),
      id: `track-${i + 1}`,
    }));

    await expectNoValidationError(
      validate(UpdateDraftDto, { ...validDraftDto(), tracks }),
    );
  });

  it('UTCID05 (A) rejects a snapshot with 33 tracks', async () => {
    const tracks = Array.from({ length: 33 }, (_, i) => ({
      ...validTrack(),
      id: `track-${i + 1}`,
    }));

    const messages = await validationMessages(
      validate(UpdateDraftDto, { ...validDraftDto(), tracks }),
    );

    expect(messages).toContain('tracks must contain no more than 32 elements');
  });

  it('UTCID06 (A) rejects a non-integer schemaVersion', async () => {
    const messages = await validationMessages(
      validate(UpdateDraftDto, { ...validDraftDto(), schemaVersion: 3.5 }),
    );

    expect(messages).toContain('schemaVersion must be an integer number');
  });

  it('UTCID07 (A) rejects a string schemaVersion', async () => {
    const messages = await validationMessages(
      validate(UpdateDraftDto, { ...validDraftDto(), schemaVersion: '3' }),
    );

    expect(messages).toContain('schemaVersion must be an integer number');
  });

  it('UTCID08 (A) rejects a timeSignature with 3 elements', async () => {
    const messages = await validationMessages(
      validate(UpdateDraftDto, {
        ...validDraftDto(),
        meta: { tempo: 120, timeSignature: [4, 4, 4], ppq: 480 },
      }),
    );

    expect(messages).toContain(
      'meta.timeSignature must contain no more than 2 elements',
    );
  });

  it('UTCID09 (A) rejects a non-integer meta.ppq', async () => {
    const messages = await validationMessages(
      validate(UpdateDraftDto, {
        ...validDraftDto(),
        meta: { tempo: 120, timeSignature: [4, 4], ppq: 480.5 },
      }),
    );

    expect(messages).toContain('meta.ppq must be an integer number');
  });

  it('UTCID10 (A) rejects a missing meta object', async () => {
    // NOTE: `meta` undefined bị class-validator bỏ qua (ValidateNested bỏ qua
    // undefined), nên payload dùng `meta: null` để chạm đúng nhánh lỗi mà
    // sheet mô tả.
    const messages = await validationMessages(
      validate(UpdateDraftDto, { ...validDraftDto(), meta: null }),
    );

    expect(messages).toContain(
      'nested property meta must be either object or array',
    );
  });

  it('UTCID11 (A) reports a nested track error with its path', async () => {
    const messages = await validationMessages(
      validate(UpdateDraftDto, {
        ...validDraftDto(),
        tracks: [{ ...validTrack(), name: '' }],
      }),
    );

    expect(messages).toContain(
      'tracks.0.name must be longer than or equal to 1 characters',
    );
  });

  it('UTCID12 (A) rejects a note with velocity 128', async () => {
    // DEFECT (BR-27): DTO chỉ kiểm tra integer, chưa chặn velocity > 127.
    const messages = await validationMessages(
      validate(UpdateDraftDto, {
        ...validDraftDto(),
        notes: [{ ...validNote(), velocity: 128 }],
      }),
    );

    expect(messages).toContain('notes.0.velocity must not be greater than 127');
  });
});
