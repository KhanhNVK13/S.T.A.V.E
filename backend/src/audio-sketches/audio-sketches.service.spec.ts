import {
  BadRequestException,
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import {
  createSupabaseMock,
  type SupabaseMockOptions,
} from '../test-utils/supabase-mock';
import {
  AudioSketchesService,
  type AudioSketchRow,
} from './audio-sketches.service';

const projectId = '11111111-1111-4111-8111-111111111111';
const ownerId = '22222222-2222-4222-8222-222222222222';
const editorId = '33333333-3333-4333-8333-333333333333';
const viewerId = '44444444-4444-4444-8444-444444444444';
const strangerId = '55555555-5555-4555-8555-555555555555';
const sketchId = '66666666-6666-4666-8666-666666666666';

function makeSketchRow(
  overrides: Partial<AudioSketchRow> = {},
): AudioSketchRow {
  return {
    id: sketchId,
    project_id: projectId,
    created_by: ownerId,
    name: 'Chorus idea',
    file_url: `${projectId}/${sketchId}.wav`,
    duration_sec: 30,
    size_bytes: 1048576,
    trim_start_sec: 0,
    trim_end_sec: null,
    created_at: '2026-10-25T00:00:00.000Z',
    ...overrides,
  };
}

function makeService(
  results: Parameters<typeof createSupabaseMock>[0] = [],
  options: SupabaseMockOptions = {},
) {
  const mock = createSupabaseMock(results, options);
  const service = new AudioSketchesService(mock.client);
  return { service, ...mock };
}

describe('BE-SKT-03 AudioSketchesService.createUploadUrl(projectId, userId, dto) + assertCanEdit', () => {
  const defaultDto = { durationSec: 60, sizeBytes: 5242880 };

  it('UTCID01 allows project owner and returns token with path', async () => {
    const { service } = makeService([], {
      tables: {
        projects: [{ data: { owner_id: ownerId } }],
      },
      storage: {
        'audio-sketches': {
          createSignedUploadUrl: { data: { token: 'tok-abc' }, error: null },
        },
      },
    });

    const result = await service.createUploadUrl(
      projectId,
      ownerId,
      defaultDto,
    );

    expect(result).toEqual(
      expect.objectContaining({
        sketchId: expect.any(String),
        path: expect.stringMatching(
          new RegExp(`^${projectId}/[a-f0-9-]+\\.wav$`),
        ),
        token: 'tok-abc',
      }),
    );
  });

  it('UTCID02 allows collaborator with edit permission', async () => {
    const { service } = makeService([], {
      tables: {
        projects: [{ data: { owner_id: ownerId } }],
        project_collaborators: [{ data: { permission_level: 'edit' } }],
      },
      storage: {
        'audio-sketches': {
          createSignedUploadUrl: { data: { token: 'tok-edit' }, error: null },
        },
      },
    });

    const result = await service.createUploadUrl(
      projectId,
      editorId,
      defaultDto,
    );

    expect(result.token).toBe('tok-edit');
  });

  it('UTCID03 allows upper boundary 180s duration and 20MB size', async () => {
    const { service } = makeService([], {
      tables: {
        projects: [{ data: { owner_id: ownerId } }],
      },
      storage: {
        'audio-sketches': {
          createSignedUploadUrl: { data: { token: 'tok-bound' }, error: null },
        },
      },
    });

    const result = await service.createUploadUrl(projectId, ownerId, {
      durationSec: 180,
      sizeBytes: 20971520,
    });

    expect(result.token).toBe('tok-bound');
  });

  it('UTCID04 rejects duration exceeding 180s (180.01s)', async () => {
    const { service } = makeService([], {
      tables: {
        projects: [{ data: { owner_id: ownerId } }],
      },
    });

    await expect(
      service.createUploadUrl(projectId, ownerId, {
        durationSec: 180.01,
        sizeBytes: 5242880,
      }),
    ).rejects.toThrow(
      new BadRequestException('Audio sketch tối đa 3 phút và 20MB'),
    );
  });

  it('UTCID05 rejects size exceeding 20MB (20971521)', async () => {
    const { service } = makeService([], {
      tables: {
        projects: [{ data: { owner_id: ownerId } }],
      },
    });

    await expect(
      service.createUploadUrl(projectId, ownerId, {
        durationSec: 60,
        sizeBytes: 20971521,
      }),
    ).rejects.toThrow(
      new BadRequestException('Audio sketch tối đa 3 phút và 20MB'),
    );
  });

  it('UTCID06 rejects collaborator with view-only permission', async () => {
    const { service } = makeService([], {
      tables: {
        projects: [{ data: { owner_id: ownerId } }],
        project_collaborators: [{ data: { permission_level: 'view' } }],
      },
    });

    await expect(
      service.createUploadUrl(projectId, viewerId, defaultDto),
    ).rejects.toThrow(
      new ForbiddenException('You do not have edit access to this project'),
    );
  });

  it('UTCID07 rejects user who is not a collaborator', async () => {
    const { service } = makeService([], {
      tables: {
        projects: [{ data: { owner_id: ownerId } }],
        project_collaborators: [{ data: null }],
      },
    });

    await expect(
      service.createUploadUrl(projectId, strangerId, defaultDto),
    ).rejects.toThrow(
      new ForbiddenException('You do not have edit access to this project'),
    );
  });

  it('UTCID08 throws 404 when project does not exist', async () => {
    const { service } = makeService([], {
      tables: {
        projects: [{ data: null }],
      },
    });

    await expect(
      service.createUploadUrl(projectId, ownerId, defaultDto),
    ).rejects.toThrow(new NotFoundException('Project not found'));
  });

  it('UTCID09 throws 500 when project query fails', async () => {
    const { service } = makeService([], {
      tables: {
        projects: [{ data: null, error: { code: '500', message: 'db error' } }],
      },
    });

    await expect(
      service.createUploadUrl(projectId, ownerId, defaultDto),
    ).rejects.toThrow(
      new InternalServerErrorException('Could not read project'),
    );
  });

  it('UTCID10 throws 500 when storage createSignedUploadUrl fails', async () => {
    const { service } = makeService([], {
      tables: {
        projects: [{ data: { owner_id: ownerId } }],
      },
      storage: {
        'audio-sketches': {
          createSignedUploadUrl: {
            data: null,
            error: { message: 'storage error' },
          },
        },
      },
    });

    await expect(
      service.createUploadUrl(projectId, ownerId, defaultDto),
    ).rejects.toThrow(
      new InternalServerErrorException('Could not create upload URL'),
    );
  });
});

describe('BE-SKT-04 AudioSketchesService.attach(projectId, userId, dto)', () => {
  const fileName = `${sketchId}.wav`;
  const defaultAttachDto = {
    sketchId,
    name: 'Chorus idea',
    durationSec: 30,
    sizeBytes: 1048576,
  };
  const signedUrl = 'https://cdn.stave.io/sketch.wav';

  it('UTCID01 attaches sketch for owner with default trim values', async () => {
    const sketchRow = makeSketchRow();
    const { service, builders } = makeService([], {
      tables: {
        projects: [{ data: { owner_id: ownerId } }],
        audio_sketches: [{ data: sketchRow }],
      },
      storage: {
        'audio-sketches': {
          list: { data: [{ name: fileName }], error: null },
          createSignedUrl: { data: { signedUrl }, error: null },
        },
      },
    });

    const result = await service.attach(projectId, ownerId, defaultAttachDto);

    expect(result).toEqual(
      expect.objectContaining({
        id: sketchId,
        playbackUrl: signedUrl,
      }),
    );
    expect(builders.audio_sketches.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        trim_start_sec: 0,
        trim_end_sec: null,
      }),
    );
  });

  it('UTCID02 attaches sketch for editor with valid trim range', async () => {
    const sketchRow = makeSketchRow({ trim_start_sec: 2, trim_end_sec: 10 });
    const { service, builders } = makeService([], {
      tables: {
        projects: [{ data: { owner_id: ownerId } }],
        project_collaborators: [{ data: { permission_level: 'edit' } }],
        audio_sketches: [{ data: sketchRow }],
      },
      storage: {
        'audio-sketches': {
          list: { data: [{ name: fileName }], error: null },
          createSignedUrl: { data: { signedUrl }, error: null },
        },
      },
    });

    const result = await service.attach(projectId, editorId, {
      ...defaultAttachDto,
      trimStartSec: 2,
      trimEndSec: 10,
    });

    expect(result.trim_start_sec).toBe(2);
    expect(result.trim_end_sec).toBe(10);
    expect(builders.audio_sketches.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        trim_start_sec: 2,
        trim_end_sec: 10,
      }),
    );
  });

  it('UTCID03 accepts trimEndSec equal to durationSec', async () => {
    const sketchRow = makeSketchRow({ trim_end_sec: 30 });
    const { service, builders } = makeService([], {
      tables: {
        projects: [{ data: { owner_id: ownerId } }],
        audio_sketches: [{ data: sketchRow }],
      },
      storage: {
        'audio-sketches': {
          list: { data: [{ name: fileName }], error: null },
          createSignedUrl: { data: { signedUrl }, error: null },
        },
      },
    });

    const result = await service.attach(projectId, ownerId, {
      ...defaultAttachDto,
      trimEndSec: 30,
    });

    expect(result.trim_end_sec).toBe(30);
    expect(builders.audio_sketches.insert).toHaveBeenCalledWith(
      expect.objectContaining({ trim_end_sec: 30 }),
    );
  });

  it('UTCID04 rejects when trimEndSec equals trimStartSec', async () => {
    const { service } = makeService([], {
      tables: {
        projects: [{ data: { owner_id: ownerId } }],
      },
    });

    await expect(
      service.attach(projectId, ownerId, {
        ...defaultAttachDto,
        trimStartSec: 5,
        trimEndSec: 5,
      }),
    ).rejects.toThrow(
      new BadRequestException('Điểm cắt kết thúc phải sau điểm bắt đầu'),
    );
  });

  it('UTCID05 rejects when trimEndSec is less than trimStartSec', async () => {
    const { service } = makeService([], {
      tables: {
        projects: [{ data: { owner_id: ownerId } }],
      },
    });

    await expect(
      service.attach(projectId, ownerId, {
        ...defaultAttachDto,
        trimStartSec: 5,
        trimEndSec: 4,
      }),
    ).rejects.toThrow(
      new BadRequestException('Điểm cắt kết thúc phải sau điểm bắt đầu'),
    );
  });

  it('UTCID06 rejects when trimEndSec exceeds durationSec', async () => {
    const { service } = makeService([], {
      tables: {
        projects: [{ data: { owner_id: ownerId } }],
      },
    });

    await expect(
      service.attach(projectId, ownerId, {
        ...defaultAttachDto,
        durationSec: 30,
        trimEndSec: 30.01,
      }),
    ).rejects.toThrow(
      new BadRequestException('Điểm cắt vượt quá độ dài bản ghi'),
    );
  });

  it('UTCID07 accepts trimStartSec past duration when trimEndSec is omitted', async () => {
    const sketchRow = makeSketchRow({ trim_start_sec: 40 });
    const { service } = makeService([], {
      tables: {
        projects: [{ data: { owner_id: ownerId } }],
        audio_sketches: [{ data: sketchRow }],
      },
      storage: {
        'audio-sketches': {
          list: { data: [{ name: fileName }], error: null },
          createSignedUrl: { data: { signedUrl }, error: null },
        },
      },
    });

    const result = await service.attach(projectId, ownerId, {
      ...defaultAttachDto,
      durationSec: 30,
      trimStartSec: 40,
    });

    expect(result.trim_start_sec).toBe(40);
  });

  it('UTCID08 rejects user without edit access', async () => {
    const { service } = makeService([], {
      tables: {
        projects: [{ data: { owner_id: ownerId } }],
        project_collaborators: [{ data: { permission_level: 'view' } }],
      },
    });

    await expect(
      service.attach(projectId, viewerId, defaultAttachDto),
    ).rejects.toThrow(
      new ForbiddenException('You do not have edit access to this project'),
    );
  });

  it('UTCID09 throws 404 when project does not exist', async () => {
    const { service } = makeService([], {
      tables: {
        projects: [{ data: null }],
      },
    });

    await expect(
      service.attach(projectId, ownerId, defaultAttachDto),
    ).rejects.toThrow(new NotFoundException('Project not found'));
  });

  it('UTCID10 throws 500 when project check fails', async () => {
    const { service } = makeService([], {
      tables: {
        projects: [{ data: null, error: { code: '500', message: 'error' } }],
      },
    });

    await expect(
      service.attach(projectId, ownerId, defaultAttachDto),
    ).rejects.toThrow(
      new InternalServerErrorException('Could not read project'),
    );
  });

  it('UTCID11 throws 500 when storage list query fails', async () => {
    const { service } = makeService([], {
      tables: {
        projects: [{ data: { owner_id: ownerId } }],
      },
      storage: {
        'audio-sketches': {
          list: { data: null, error: { message: 'bucket list error' } },
        },
      },
    });

    await expect(
      service.attach(projectId, ownerId, defaultAttachDto),
    ).rejects.toThrow(
      new InternalServerErrorException('Could not verify uploaded file'),
    );
  });

  it('UTCID12 rejects when uploaded file is missing from bucket (empty list)', async () => {
    const { service } = makeService([], {
      tables: {
        projects: [{ data: { owner_id: ownerId } }],
      },
      storage: {
        'audio-sketches': {
          list: { data: [], error: null },
        },
      },
    });

    await expect(
      service.attach(projectId, ownerId, defaultAttachDto),
    ).rejects.toThrow(
      new BadRequestException('Chưa thấy file đã tải lên cho sketch này'),
    );
  });

  it('UTCID13 rejects when storage list returns similar prefix instead of exact match', async () => {
    const { service } = makeService([], {
      tables: {
        projects: [{ data: { owner_id: ownerId } }],
      },
      storage: {
        'audio-sketches': {
          list: { data: [{ name: `${sketchId}-copy.wav` }], error: null },
        },
      },
    });

    await expect(
      service.attach(projectId, ownerId, defaultAttachDto),
    ).rejects.toThrow(
      new BadRequestException('Chưa thấy file đã tải lên cho sketch này'),
    );
  });

  it('UTCID14 throws 500 when database insert fails', async () => {
    const { service } = makeService([], {
      tables: {
        projects: [{ data: { owner_id: ownerId } }],
        audio_sketches: [
          { data: null, error: { code: '23505', message: 'insert error' } },
        ],
      },
      storage: {
        'audio-sketches': {
          list: { data: [{ name: fileName }], error: null },
        },
      },
    });

    await expect(
      service.attach(projectId, ownerId, defaultAttachDto),
    ).rejects.toThrow(
      new InternalServerErrorException('Could not save audio sketch'),
    );
  });

  it('UTCID15 sets playbackUrl to null when createSignedUrl fails', async () => {
    const sketchRow = makeSketchRow();
    const { service } = makeService([], {
      tables: {
        projects: [{ data: { owner_id: ownerId } }],
        audio_sketches: [{ data: sketchRow }],
      },
      storage: {
        'audio-sketches': {
          list: { data: [{ name: fileName }], error: null },
          createSignedUrl: { data: null, error: { message: 'sign error' } },
        },
      },
    });

    const result = await service.attach(projectId, ownerId, defaultAttachDto);

    expect(result.id).toBe(sketchId);
    expect(result.playbackUrl).toBeNull();
  });
});

describe('BE-SKT-05 AudioSketchesService.list(projectId, userId) + assertCanView', () => {
  const signedUrl = 'https://cdn.stave.io/sketch.wav';

  it('UTCID01 allows project owner and returns sketches with signed playback URLs', async () => {
    const s1 = makeSketchRow({ id: 's1', created_at: '2026-10-25T01:00:00Z' });
    const s2 = makeSketchRow({ id: 's2', created_at: '2026-10-25T00:00:00Z' });
    const { service, builders } = makeService([], {
      tables: {
        projects: [{ data: { owner_id: ownerId, visibility: 'private' } }],
        audio_sketches: [{ data: [s1, s2] }],
      },
      storage: {
        'audio-sketches': {
          createSignedUrl: [
            { data: { signedUrl }, error: null },
            { data: { signedUrl }, error: null },
          ],
        },
      },
    });

    const result = await service.list(projectId, ownerId);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual(
      expect.objectContaining({ id: 's1', playbackUrl: signedUrl }),
    );
    expect(result[1]).toEqual(
      expect.objectContaining({ id: 's2', playbackUrl: signedUrl }),
    );
    expect(builders.audio_sketches.order).toHaveBeenCalledWith('created_at', {
      ascending: false,
    });
  });

  it('UTCID02 allows any user to view sketches of a public project', async () => {
    const s1 = makeSketchRow();
    const { service } = makeService([], {
      tables: {
        projects: [{ data: { owner_id: ownerId, visibility: 'public' } }],
        audio_sketches: [{ data: [s1] }],
      },
      storage: {
        'audio-sketches': {
          createSignedUrl: { data: { signedUrl }, error: null },
        },
      },
    });

    const result = await service.list(projectId, strangerId);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(sketchId);
  });

  it('UTCID03 allows a collaborator to view sketches of a private project', async () => {
    const s1 = makeSketchRow();
    const { service } = makeService([], {
      tables: {
        projects: [{ data: { owner_id: ownerId, visibility: 'private' } }],
        project_collaborators: [{ data: { permission_level: 'view' } }],
        audio_sketches: [{ data: [s1] }],
      },
      storage: {
        'audio-sketches': {
          createSignedUrl: { data: { signedUrl }, error: null },
        },
      },
    });

    const result = await service.list(projectId, viewerId);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(sketchId);
  });

  it('UTCID04 returns empty array when project has no sketches', async () => {
    const { service } = makeService([], {
      tables: {
        projects: [{ data: { owner_id: ownerId, visibility: 'private' } }],
        audio_sketches: [{ data: [] }],
      },
    });

    const result = await service.list(projectId, ownerId);

    expect(result).toEqual([]);
  });

  it('UTCID05 returns empty array when database returns null data', async () => {
    const { service } = makeService([], {
      tables: {
        projects: [{ data: { owner_id: ownerId, visibility: 'private' } }],
        audio_sketches: [{ data: null }],
      },
    });

    const result = await service.list(projectId, ownerId);

    expect(result).toEqual([]);
  });

  it('UTCID06 sets playbackUrl to null for each sketch when signPlayback fails', async () => {
    const s1 = makeSketchRow({ id: 's1' });
    const s2 = makeSketchRow({ id: 's2' });
    const { service } = makeService([], {
      tables: {
        projects: [{ data: { owner_id: ownerId, visibility: 'private' } }],
        audio_sketches: [{ data: [s1, s2] }],
      },
      storage: {
        'audio-sketches': {
          createSignedUrl: [
            { data: null, error: { message: 'sign error' } },
            { data: null, error: { message: 'sign error' } },
          ],
        },
      },
    });

    const result = await service.list(projectId, ownerId);

    expect(result).toHaveLength(2);
    expect(result[0].playbackUrl).toBeNull();
    expect(result[1].playbackUrl).toBeNull();
  });

  it('UTCID07 rejects non-collaborator from private project', async () => {
    const { service } = makeService([], {
      tables: {
        projects: [{ data: { owner_id: ownerId, visibility: 'private' } }],
        project_collaborators: [{ data: null }],
      },
    });

    await expect(service.list(projectId, strangerId)).rejects.toThrow(
      new ForbiddenException('You do not have access to this project'),
    );
  });

  it('UTCID08 throws 404 when project is not found', async () => {
    const { service } = makeService([], {
      tables: {
        projects: [{ data: null }],
      },
    });

    await expect(service.list(projectId, ownerId)).rejects.toThrow(
      new NotFoundException('Project not found'),
    );
  });

  it('UTCID09 throws 500 when project check returns error', async () => {
    const { service } = makeService([], {
      tables: {
        projects: [{ data: null, error: { code: '500', message: 'db error' } }],
      },
    });

    await expect(service.list(projectId, ownerId)).rejects.toThrow(
      new InternalServerErrorException('Could not read project'),
    );
  });

  it('UTCID10 throws 500 when audio_sketches select fails', async () => {
    const { service } = makeService([], {
      tables: {
        projects: [{ data: { owner_id: ownerId, visibility: 'private' } }],
        audio_sketches: [
          { data: null, error: { code: '500', message: 'query error' } },
        ],
      },
    });

    await expect(service.list(projectId, ownerId)).rejects.toThrow(
      new InternalServerErrorException('Could not list audio sketches'),
    );
  });
});
