import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';

import { CommitsService } from './commits.service';
import { DiffService } from './diff.service';
import { createMockSupabaseClient } from '../test-utils/supabase-mock';
import type { MockResponseMap } from '../test-utils/supabase-mock';

// =============================================================================
// Fixtures
// =============================================================================

const USER = 'user-1';
const OTHER = 'user-2';
const PROJECT = 'project-1';

const snapshot = (over: Record<string, any> = {}) => ({
  schemaVersion: 3,
  meta: { tempo: 120, timeSignature: [4, 4], ppq: 480 },
  tracks: [],
  notes: [],
  ...over,
});

const buildService = (responses: MockResponseMap) => {
  const { client, calls, rpcCalls } = createMockSupabaseClient(responses);
  const service = new CommitsService(
    client as any,
    {} as any,
    new DiffService(),
  );
  return { service, calls, rpcCalls };
};

/**
 * Các helper là `private` trong TypeScript nhưng vẫn là hàm thường ở runtime.
 * Truy cập qua index signature để test được mà không cần đổi code backend.
 */
const priv = (service: CommitsService, name: string) =>
  (service as unknown as Record<string, (...args: any[]) => any>)[name].bind(
    service,
  );

// =============================================================================
// BE-CMT-09 — verifyCommitOwnership
// =============================================================================

describe('BE-CMT-09 CommitsService.verifyCommitOwnership', () => {
  it('BE-CMT-09 UTCID01 (N): returns the project id of a commit owned by the user', async () => {
    const { service } = buildService({
      commits: [{ data: { id: 'c1', branch: { project_id: PROJECT } } }],
      projects: [{ data: { id: PROJECT, owner_id: USER } }],
    });

    const result = await priv(service, 'verifyCommitOwnership')('c1', USER);

    expect(result).toBe(PROJECT);
  });

  it('BE-CMT-09 UTCID02 (A): throws NotFoundException when the commit query errors', async () => {
    const { service } = buildService({
      commits: [{ data: null, error: { message: 'boom' } }],
    });

    const promise = priv(service, 'verifyCommitOwnership')('c1', USER);

    await expect(promise).rejects.toThrow(NotFoundException);
    await expect(promise).rejects.toThrow(
      new NotFoundException('Commit not found'),
    );
  });

  it('BE-CMT-09 UTCID03 (A): throws NotFoundException when the commit row is null', async () => {
    const { service } = buildService({
      commits: [{ data: null, error: null }],
    });

    const promise = priv(service, 'verifyCommitOwnership')('c1', USER);

    await expect(promise).rejects.toThrow(
      new NotFoundException('Commit not found'),
    );
  });

  it('BE-CMT-09 UTCID04 (A): throws NotFoundException when the commit has no branch join', async () => {
    const { service } = buildService({
      commits: [{ data: { id: 'c1', branch: null } }],
    });

    const promise = priv(service, 'verifyCommitOwnership')('c1', USER);

    await expect(promise).rejects.toThrow(
      new NotFoundException('Commit not found'),
    );
  });

  it('BE-CMT-09 UTCID05 (A): throws NotFoundException when the project does not exist', async () => {
    const { service } = buildService({
      commits: [{ data: { id: 'c1', branch: { project_id: PROJECT } } }],
      projects: [{ data: null, error: null }],
    });

    const promise = priv(service, 'verifyCommitOwnership')('c1', USER);

    await expect(promise).rejects.toThrow(
      new NotFoundException('Project not found'),
    );
  });

  it('BE-CMT-09 UTCID06 (A): throws ForbiddenException when the project belongs to another user', async () => {
    const { service } = buildService({
      commits: [{ data: { id: 'c1', branch: { project_id: PROJECT } } }],
      projects: [{ data: { id: PROJECT, owner_id: OTHER } }],
    });

    const promise = priv(service, 'verifyCommitOwnership')('c1', USER);

    await expect(promise).rejects.toThrow(ForbiddenException);
    await expect(promise).rejects.toThrow(
      new ForbiddenException('You do not have access to this project'),
    );
  });

  it.failing(
    'BE-CMT-09 UTCID07 (N): allows a collaborator to pass the ownership check [DFID021]',
    async () => {
      const { service } = buildService({
        commits: [{ data: { id: 'c1', branch: { project_id: PROJECT } } }],
        projects: [{ data: { id: PROJECT, owner_id: OTHER } }],
      });

      const result = await priv(service, 'verifyCommitOwnership')('c1', USER);

      expect(result).toBe(PROJECT);
    },
  );
});

// =============================================================================
// BE-CMT-10 — verifyBranchAccess
// =============================================================================

describe('BE-CMT-10 CommitsService.verifyBranchAccess', () => {
  it('BE-CMT-10 UTCID01 (N): returns the BranchDbRow including head_commit_id', async () => {
    const { service } = buildService({
      branches: [
        {
          data: {
            id: 'branch-1',
            project_id: PROJECT,
            name: 'main',
            is_default: true,
            created_by: USER,
            created_at: '2026-01-01T00:00:00.000Z',
            base_commit_id: null,
            head_commit_id: 'head-1',
            project: { id: PROJECT, owner_id: USER },
          },
        },
      ],
    });

    const result = await priv(service, 'verifyBranchAccess')('branch-1', USER);

    expect(result.id).toBe('branch-1');
    expect(result.head_commit_id).toBe('head-1');
  });

  it('BE-CMT-10 UTCID02 (A): throws NotFoundException when the branch query errors', async () => {
    const { service } = buildService({
      branches: [{ data: null, error: { message: 'boom' } }],
    });

    const promise = priv(service, 'verifyBranchAccess')('branch-1', USER);

    await expect(promise).rejects.toThrow(NotFoundException);
    await expect(promise).rejects.toThrow(
      new NotFoundException('Branch not found'),
    );
  });

  it('BE-CMT-10 UTCID03 (A): throws NotFoundException when the branch row is null', async () => {
    const { service } = buildService({
      branches: [{ data: null, error: null }],
    });

    const promise = priv(service, 'verifyBranchAccess')('branch-1', USER);

    await expect(promise).rejects.toThrow(
      new NotFoundException('Branch not found'),
    );
  });

  it('BE-CMT-10 UTCID04 (A): throws BadRequestException when the project join is null', async () => {
    const { service } = buildService({
      branches: [
        {
          data: {
            id: 'branch-1',
            project_id: PROJECT,
            name: 'main',
            is_default: true,
            created_by: USER,
            created_at: '2026-01-01T00:00:00.000Z',
            base_commit_id: null,
            head_commit_id: null,
            project: null,
          },
        },
      ],
    });

    const promise = priv(service, 'verifyBranchAccess')('branch-1', USER);

    await expect(promise).rejects.toThrow(
      new BadRequestException('You do not have access to this branch'),
    );
  });

  it('BE-CMT-10 UTCID05 (A): throws BadRequestException when the project owner differs', async () => {
    const { service } = buildService({
      branches: [
        {
          data: {
            id: 'branch-1',
            project_id: PROJECT,
            name: 'main',
            is_default: true,
            created_by: OTHER,
            created_at: '2026-01-01T00:00:00.000Z',
            base_commit_id: null,
            head_commit_id: null,
            project: { id: PROJECT, owner_id: OTHER },
          },
        },
      ],
    });

    const promise = priv(service, 'verifyBranchAccess')('branch-1', USER);

    await expect(promise).rejects.toThrow(
      new BadRequestException('You do not have access to this branch'),
    );
  });

  it.failing(
    'BE-CMT-10 UTCID06 (N): allows an edit collaborator to pass the access check [DFID022]',
    async () => {
      const { service } = buildService({
        branches: [
          {
            data: {
              id: 'branch-1',
              project_id: PROJECT,
              name: 'main',
              is_default: true,
              created_by: OTHER,
              created_at: '2026-01-01T00:00:00.000Z',
              base_commit_id: null,
              head_commit_id: 'head-1',
              project: { id: PROJECT, owner_id: OTHER },
            },
          },
        ],
      });

      const result = await priv(service, 'verifyBranchAccess')(
        'branch-1',
        USER,
      );

      expect(result.head_commit_id).toBe('head-1');
    },
  );
});

// =============================================================================
// BE-CMT-11 — isSnapshotIdenticalToHead
// =============================================================================

describe('BE-CMT-11 CommitsService.isSnapshotIdenticalToHead', () => {
  it('BE-CMT-11 UTCID01 (N): returns true when the snapshot equals the head snapshot', async () => {
    const { service } = buildService({
      commits: [{ data: { id: 'head-1', snapshot: snapshot() } }],
    });

    const result = await priv(service, 'isSnapshotIdenticalToHead')(
      'head-1',
      snapshot(),
    );

    expect(result).toBe(true);
  });

  it('BE-CMT-11 UTCID02 (N): returns false when one note velocity changed', async () => {
    const head = snapshot({
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
    });
    const changed = snapshot({
      notes: [
        {
          id: 'n1',
          trackId: 't1',
          pitch: 60,
          start: 0,
          duration: 480,
          velocity: 64,
        },
      ],
    });

    const { service } = buildService({
      commits: [{ data: { id: 'head-1', snapshot: head } }],
    });

    const result = await priv(service, 'isSnapshotIdenticalToHead')(
      'head-1',
      changed,
    );

    expect(result).toBe(false);
  });

  it('BE-CMT-11 UTCID03 (N): returns false when only the tempo changed', async () => {
    const head = snapshot({
      meta: { tempo: 120, timeSignature: [4, 4], ppq: 480 },
    });
    const changed = snapshot({
      meta: { tempo: 140, timeSignature: [4, 4], ppq: 480 },
    });

    const { service } = buildService({
      commits: [{ data: { id: 'head-1', snapshot: head } }],
    });

    const result = await priv(service, 'isSnapshotIdenticalToHead')(
      'head-1',
      changed,
    );

    expect(result).toBe(false);
  });

  it('BE-CMT-11 UTCID04 (A): returns false when the head commit query errors', async () => {
    const { service } = buildService({
      commits: [{ data: null, error: { message: 'boom' } }],
    });

    const result = await priv(service, 'isSnapshotIdenticalToHead')(
      'head-1',
      snapshot(),
    );

    expect(result).toBe(false);
  });

  it('BE-CMT-11 UTCID05 (A): returns false when the head commit row is null', async () => {
    const { service } = buildService({
      commits: [{ data: null, error: null }],
    });

    const result = await priv(service, 'isSnapshotIdenticalToHead')(
      'head-1',
      snapshot(),
    );

    expect(result).toBe(false);
  });
});

// =============================================================================
// BE-CMT-12 — normalizeSnapshot
// =============================================================================

describe('BE-CMT-12 CommitsService.normalizeSnapshot', () => {
  it('BE-CMT-12 UTCID01 (N): keeps schemaVersion 3 and the meta block', () => {
    const { service } = buildService({});

    const result = priv(
      service,
      'normalizeSnapshot',
    )({
      schemaVersion: 3,
      meta: { tempo: 90, timeSignature: [3, 4], ppq: 480 },
      tracks: [],
      notes: [],
    });

    expect(result.schemaVersion).toBe(3);
    expect(result.meta).toEqual({ tempo: 90, timeSignature: [3, 4], ppq: 480 });
  });

  it('BE-CMT-12 UTCID02 (N): falls back to schemaVersion 1 and a default meta block', () => {
    const { service } = buildService({});

    const result = priv(service, 'normalizeSnapshot')({});

    expect(result.schemaVersion).toBe(1);
    expect(result.meta).toEqual({
      tempo: 120,
      timeSignature: [4, 4],
      ppq: 480,
    });
    expect(result.tracks).toEqual([]);
    expect(result.notes).toEqual([]);
  });

  it('BE-CMT-12 UTCID03 (N): keeps an empty track list and note list', () => {
    const { service } = buildService({});

    const result = priv(
      service,
      'normalizeSnapshot',
    )({
      schemaVersion: 3,
      meta: { tempo: 90, timeSignature: [3, 4], ppq: 480 },
      tracks: [],
      notes: [],
    });

    expect(result.tracks).toEqual([]);
    expect(result.notes).toEqual([]);
  });

  it('BE-CMT-12 UTCID04 (N): applies track defaults for a missing id, order, color, volume and pan', () => {
    const { service } = buildService({});

    const result = priv(
      service,
      'normalizeSnapshot',
    )({
      schemaVersion: 3,
      meta: { tempo: 90, timeSignature: [3, 4], ppq: 480 },
      tracks: [{ name: 'Piano' }],
      notes: [{ trackId: 't1', pitch: 60 }],
    });

    const track = result.tracks[0];
    expect(track.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(track.order).toBe(0);
    expect(track.color).toBe('#6366f1');
    expect(track.volume).toBe(1);
    expect(track.pan).toBe(0);
  });

  it('BE-CMT-12 UTCID05 (N): maps isMuted/isSolo onto muted/solo', () => {
    const { service } = buildService({});

    const result = priv(
      service,
      'normalizeSnapshot',
    )({
      schemaVersion: 3,
      meta: { tempo: 90, timeSignature: [3, 4], ppq: 480 },
      tracks: [{ name: 'Piano', isMuted: true, isSolo: true }],
      notes: [],
    });

    expect(result.tracks[0].muted).toBe(true);
    expect(result.tracks[0].solo).toBe(true);
  });

  it('BE-CMT-12 UTCID06 (N): sanitizes a soundMap entry with an out-of-range pitch', () => {
    const { service } = buildService({});

    const result = priv(
      service,
      'normalizeSnapshot',
    )({
      schemaVersion: 3,
      meta: { tempo: 90, timeSignature: [3, 4], ppq: 480 },
      tracks: [{ name: 'Piano', soundMap: { '200': 's1' } }],
      notes: [],
    });

    // Pitch 200 nằm ngoài 0-127 nên bị loá khỏi soundMap; vì không còn entry
    // hợp lệ nào, `sanitizeSoundMap` trả `undefined`.
    expect(result.tracks[0].soundMap).toBeUndefined();
  });

  it('BE-CMT-12 UTCID07 (N): copies note fields unchanged when all are set', () => {
    const { service } = buildService({});

    const result = priv(
      service,
      'normalizeSnapshot',
    )({
      schemaVersion: 3,
      meta: { tempo: 90, timeSignature: [3, 4], ppq: 480 },
      tracks: [{ name: 'Piano' }],
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
    });

    expect(result.notes[0]).toEqual(
      expect.objectContaining({
        id: 'n1',
        trackId: 't1',
        pitch: 60,
        start: 0,
        duration: 480,
        velocity: 100,
      }),
    );
  });

  it('BE-CMT-12 UTCID08 (N): applies note defaults for a missing id, start, duration and velocity', () => {
    const { service } = buildService({});

    const result = priv(
      service,
      'normalizeSnapshot',
    )({
      schemaVersion: 3,
      meta: { tempo: 90, timeSignature: [3, 4], ppq: 480 },
      tracks: [{ name: 'Piano' }],
      notes: [{ trackId: 't1', pitch: 60 }],
    });

    const note = result.notes[0];
    expect(note.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(note.start).toBe(0);
    expect(note.velocity).toBe(80);
  });
});

// =============================================================================
// BE-CMT-13 — getTagsForCommits
// =============================================================================

describe('BE-CMT-13 CommitsService.getTagsForCommits', () => {
  it('BE-CMT-13 UTCID01 (N): returns an empty Map and sends no query for an empty id list', async () => {
    const { service, calls } = buildService({});

    const result = await priv(service, 'getTagsForCommits')([]);

    expect(result.size).toBe(0);
    expect(calls.find((c) => c.table === 'commit_tags')).toBeUndefined();
  });

  it('BE-CMT-13 UTCID02 (N): groups the tags of each commit into the Map', async () => {
    const { service, calls } = buildService({
      commit_tags: [
        {
          data: [
            {
              id: 't1',
              commit_id: 'c1',
              name: 'v1-0',
              created_by: USER,
              created_at: '2026-01-01T00:00:00.000Z',
            },
            {
              id: 't2',
              commit_id: 'c1',
              name: 'v1-1',
              created_by: USER,
              created_at: '2026-01-02T00:00:00.000Z',
            },
            {
              id: 't3',
              commit_id: 'c2',
              name: 'v2-0',
              created_by: USER,
              created_at: '2026-01-03T00:00:00.000Z',
            },
          ],
        },
      ],
    });

    const result = await priv(service, 'getTagsForCommits')(['c1', 'c2']);

    expect(result.get('c1')).toHaveLength(2);
    expect(result.get('c2')).toHaveLength(1);
    expect(calls.find((c) => c.table === 'commit_tags')?.inFilter).toEqual({
      column: 'commit_id',
      values: ['c1', 'c2'],
    });
  });

  it('BE-CMT-13 UTCID03 (N): returns an empty Map when the query returns no rows', async () => {
    const { service } = buildService({ commit_tags: [{ data: [] }] });

    const result = await priv(service, 'getTagsForCommits')(['c1', 'c2']);

    expect(result.size).toBe(0);
  });

  it('BE-CMT-13 UTCID04 (A): returns an empty Map and logs when the query errors', async () => {
    const spy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const { service } = buildService({
      commit_tags: [{ data: null, error: { message: 'boom' } }],
    });

    const result = await priv(service, 'getTagsForCommits')(['c1']);

    expect(result.size).toBe(0);
    expect(spy).toHaveBeenCalledWith('Failed to fetch tags:', {
      message: 'boom',
    });
    spy.mockRestore();
  });

  it('BE-CMT-13 UTCID05 (A): returns an empty Map when the query returns null data', async () => {
    const { service } = buildService({
      commit_tags: [{ data: null, error: null }],
    });

    const result = await priv(service, 'getTagsForCommits')(['c1']);

    expect(result.size).toBe(0);
  });
});

// =============================================================================
// BE-CMT-14 — getAuthorsInfo
// =============================================================================

describe('BE-CMT-14 CommitsService.getAuthorsInfo', () => {
  it('BE-CMT-14 UTCID01 (N): returns an empty Map and sends no query for an empty id list', async () => {
    const { service, calls } = buildService({});

    const result = await priv(service, 'getAuthorsInfo')([]);

    expect(result.size).toBe(0);
    expect(calls.find((c) => c.table === 'users')).toBeUndefined();
  });

  it('BE-CMT-14 UTCID02 (N): maps each user id to its author info', async () => {
    const { service, calls } = buildService({
      users: [
        {
          data: [
            {
              id: 'u1',
              username: 'alice',
              display_name: 'Alice',
              avatar_url: 'a.png',
            },
            {
              id: 'u2',
              username: 'bob',
              display_name: 'Bob',
              avatar_url: null,
            },
          ],
        },
      ],
    });

    const result = await priv(service, 'getAuthorsInfo')(['u1', 'u2']);

    expect(result.get('u1')).toEqual({
      id: 'u1',
      username: 'alice',
      display_name: 'Alice',
      avatar_url: 'a.png',
    });
    expect(result.get('u2')?.username).toBe('bob');
    expect(calls.find((c) => c.table === 'users')?.inFilter).toEqual({
      column: 'id',
      values: ['u1', 'u2'],
    });
  });

  it('BE-CMT-14 UTCID03 (N): contains only the returned user when only one row comes back', async () => {
    const { service } = buildService({
      users: [
        {
          data: [
            {
              id: 'u1',
              username: 'alice',
              display_name: 'Alice',
              avatar_url: null,
            },
          ],
        },
      ],
    });

    const result = await priv(service, 'getAuthorsInfo')(['u1', 'u2']);

    expect(result.has('u1')).toBe(true);
    expect(result.has('u2')).toBe(false);
  });

  it('BE-CMT-14 UTCID04 (A): returns an empty Map and logs when the query errors', async () => {
    const spy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const { service } = buildService({
      users: [{ data: null, error: { message: 'boom' } }],
    });

    const result = await priv(service, 'getAuthorsInfo')(['u1']);

    expect(result.size).toBe(0);
    expect(spy).toHaveBeenCalledWith('Failed to fetch authors:', {
      message: 'boom',
    });
    spy.mockRestore();
  });

  it('BE-CMT-14 UTCID05 (N): maps missing profile fields to null', async () => {
    const { service } = buildService({
      users: [{ data: [{ id: 'u1' }] }],
    });

    const result = await priv(service, 'getAuthorsInfo')(['u1']);

    expect(result.get('u1')).toEqual({
      id: 'u1',
      username: null,
      display_name: null,
      avatar_url: null,
    });
  });
});

// =============================================================================
// BE-CMT-15 — verifyProjectOwnership
// =============================================================================

describe('BE-CMT-15 CommitsService.verifyProjectOwnership', () => {
  it('BE-CMT-15 UTCID01 (N): resolves void when the user owns the project', async () => {
    const { service } = buildService({
      projects: [{ data: { id: PROJECT, owner_id: USER } }],
    });

    await expect(
      priv(service, 'verifyProjectOwnership')(PROJECT, USER),
    ).resolves.toBeUndefined();
  });

  it('BE-CMT-15 UTCID02 (A): throws NotFoundException when the project row is null', async () => {
    const { service } = buildService({
      projects: [{ data: null, error: null }],
    });

    const promise = priv(service, 'verifyProjectOwnership')(PROJECT, USER);

    await expect(promise).rejects.toThrow(NotFoundException);
    await expect(promise).rejects.toThrow(
      new NotFoundException('Project not found'),
    );
  });

  it('BE-CMT-15 UTCID03 (A): throws NotFoundException when the project query errors', async () => {
    const { service } = buildService({
      projects: [{ data: null, error: { message: 'boom' } }],
    });

    const promise = priv(service, 'verifyProjectOwnership')(PROJECT, USER);

    await expect(promise).rejects.toThrow(
      new NotFoundException('Project not found'),
    );
  });

  it('BE-CMT-15 UTCID04 (A): throws ForbiddenException when the project owner differs', async () => {
    const { service } = buildService({
      projects: [{ data: { id: PROJECT, owner_id: OTHER } }],
    });

    const promise = priv(service, 'verifyProjectOwnership')(PROJECT, USER);

    await expect(promise).rejects.toThrow(ForbiddenException);
    await expect(promise).rejects.toThrow(
      new ForbiddenException('You do not have access to this project'),
    );
  });

  it.failing(
    'BE-CMT-15 UTCID05 (N): allows an edit collaborator to pass the ownership check [DFID023]',
    async () => {
      const { service } = buildService({
        projects: [{ data: { id: PROJECT, owner_id: OTHER } }],
      });

      await expect(
        priv(service, 'verifyProjectOwnership')(PROJECT, USER),
      ).resolves.toBeUndefined();
    },
  );
});
