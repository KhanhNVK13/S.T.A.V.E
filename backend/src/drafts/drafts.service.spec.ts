import { ConflictException, ForbiddenException } from '@nestjs/common';
import type { DraftSnapshot } from '@stave/shared-types';
import { createSupabaseMock } from '../test-utils/supabase-mock';
import { ProjectAccessService } from '../project-access/project-access.service';
import type { ProjectsService } from '../projects/projects.service';
import { DiffService } from '../commits/diff.service';
import { DraftsService } from './drafts.service';

const projectId = '33333333-3333-4333-8333-333333333333';
const branchId = '22222222-2222-4222-8222-222222222222';
const userId = '44444444-4444-4444-8444-444444444444';
const headId = '66666666-6666-4666-8666-666666666666';
const snapshot: DraftSnapshot = {
  schemaVersion: 3,
  meta: { tempo: 120, timeSignature: [4, 4], ppq: 480 },
  tracks: [],
  notes: [],
};

function makeService(
  tables: Parameters<typeof createSupabaseMock>[1] extends infer O
    ? O extends { tables?: infer T }
      ? T
      : never
    : never,
  branch: Record<string, unknown> = { id: branchId, head_commit_id: null },
) {
  const mock = createSupabaseMock([], {
    tables: {
      project_collaborators: Array.from({ length: 12 }, () => ({ data: null })),
      ...tables,
    },
  });
  const projects = {
    getActiveBranchForUser: jest.fn().mockResolvedValue(branch),
  } as unknown as ProjectsService;
  const service = new DraftsService(
    mock.client,
    projects,
    new ProjectAccessService(mock.client),
    new DiffService(),
  );
  return { service, projects, ...mock };
}

describe('DraftsService per-user drafts', () => {
  it('reads the draft of the calling user on the active branch', async () => {
    const { service, builders } = makeService({
      drafts: [{ data: { snapshot } }],
    });
    await expect(service.getDraft(projectId, userId)).resolves.toBe(snapshot);
    expect(builders.drafts.eq).toHaveBeenCalledWith('branch_id', branchId);
    expect(builders.drafts.eq).toHaveBeenCalledWith('user_id', userId);
  });

  it('falls back to the head commit when the user has no draft yet', async () => {
    const { service } = makeService(
      { drafts: [{ data: null }], commits: [{ data: { snapshot } }] },
      { id: branchId, head_commit_id: headId },
    );
    await expect(service.getDraft(projectId, userId)).resolves.toBe(snapshot);
  });

  it('writes the draft keyed by branch and user', async () => {
    const { service, builders } = makeService({
      projects: [{ data: { owner_id: userId } }],
      drafts: [{ data: { snapshot, updated_at: '2026-10-28T10:00:00Z' } }],
    });
    await expect(
      service.putDraft(projectId, userId, snapshot),
    ).resolves.toEqual({ version: '2026-10-28T10:00:00Z' });
    expect(builders.drafts.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ branch_id: branchId, user_id: userId }),
      { onConflict: 'branch_id,user_id' },
    );
  });

  it('updates only the row still at the expected version', async () => {
    const { service, builders } = makeService({
      projects: [{ data: { owner_id: userId } }],
      drafts: [{ data: { updated_at: '2026-10-28T10:05:00Z' } }],
    });
    await expect(
      service.putDraft(projectId, userId, snapshot, '2026-10-28T10:00:00Z'),
    ).resolves.toEqual({ version: '2026-10-28T10:05:00Z' });
    expect(builders.drafts.eq).toHaveBeenCalledWith(
      'updated_at',
      '2026-10-28T10:00:00Z',
    );
    expect(builders.drafts.upsert).not.toHaveBeenCalled();
  });

  it('answers 409 DRAFT_STALE when another tab changed the draft', async () => {
    const { service } = makeService({
      projects: [{ data: { owner_id: userId } }],
      drafts: [{ data: null }],
    });
    const error = await service
      .putDraft(projectId, userId, snapshot, '2026-10-28T10:00:00Z')
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getResponse()).toMatchObject({
      code: 'DRAFT_STALE',
    });
  });

  it('inserts only when no draft exists yet for the "none" version', async () => {
    const { service, builders } = makeService({
      projects: [{ data: { owner_id: userId } }],
      drafts: [{ data: { updated_at: '2026-10-28T10:00:00Z' } }],
    });
    await service.putDraft(projectId, userId, snapshot, 'none');
    expect(builders.drafts.insert).toHaveBeenCalled();
  });

  it('answers 409 DRAFT_STALE when a draft appeared meanwhile for "none"', async () => {
    const { service } = makeService({
      projects: [{ data: { owner_id: userId } }],
      drafts: [{ data: null, error: { code: '23505', message: 'dup' } }],
    });
    await expect(
      service.putDraft(projectId, userId, snapshot, 'none'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('refuses a write from someone without edit access', async () => {
    const { service, builders } = makeService({
      projects: [{ data: { owner_id: 'someone-else' } }],
    });
    await expect(
      service.putDraft(projectId, userId, snapshot),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(builders.drafts).toBeUndefined();
  });

  it('discards only the given user drafts across the project branches', async () => {
    const { service, builders } = makeService({
      branches: [{ data: [{ id: branchId }] }],
      drafts: [{ data: null }],
    });
    await service.discardUserDraft(projectId, userId);
    expect(builders.drafts.delete).toHaveBeenCalled();
    expect(builders.drafts.eq).toHaveBeenCalledWith('user_id', userId);
    expect(builders.drafts.in).toHaveBeenCalledWith('branch_id', [branchId]);
  });
});

describe('DraftsService.getRecovery', () => {
  const edited = {
    ...snapshot,
    notes: [
      {
        id: 'n1',
        trackId: 't',
        pitch: 60,
        start: 0,
        duration: 10,
        velocity: 80,
      },
    ],
  };

  it('reports nothing to recover when the user has no draft', async () => {
    const { service } = makeService({ drafts: [{ data: null }] });
    await expect(service.getRecovery(projectId, userId)).resolves.toEqual({
      recovered: false,
      savedAt: null,
      version: null,
    });
  });

  it('reports a recovered draft with its save time when it differs from the head commit', async () => {
    const { service } = makeService(
      {
        drafts: [
          { data: { snapshot: edited, updated_at: '2026-10-26T10:00:00Z' } },
        ],
        commits: [{ data: { snapshot } }],
      },
      { id: branchId, head_commit_id: headId },
    );
    await expect(service.getRecovery(projectId, userId)).resolves.toEqual({
      recovered: true,
      savedAt: '2026-10-26T10:00:00Z',
      version: '2026-10-26T10:00:00Z',
    });
  });

  it('reports nothing to recover when the draft equals the head commit', async () => {
    const { service } = makeService(
      {
        drafts: [{ data: { snapshot, updated_at: '2026-10-26T10:00:00Z' } }],
        commits: [{ data: { snapshot } }],
      },
      { id: branchId, head_commit_id: headId },
    );
    await expect(service.getRecovery(projectId, userId)).resolves.toEqual({
      recovered: false,
      savedAt: null,
      version: '2026-10-26T10:00:00Z',
    });
  });
});
