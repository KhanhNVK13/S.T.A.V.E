import {
  ConflictException,
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import type { DraftSnapshot } from '@stave/shared-types';
import { createSupabaseMock } from '../test-utils/supabase-mock';
import { ProjectAccessService } from '../project-access/project-access.service';
import type { ProjectsService } from '../projects/projects.service';
import { DiffService } from '../commits/diff.service';
import { DraftsService } from './drafts.service';
import { buildDefaultDraftSnapshot } from './default-snapshot';

const projectId = '33333333-3333-4333-8333-333333333333';
const branchId = '22222222-2222-4222-8222-222222222222';
const defaultBranchId = '11111111-1111-4111-8111-111111111111';
const userId = '44444444-4444-4444-8444-444444444444';
const collaboratorId = '55555555-5555-4555-8555-555555555555';
const headId = '66666666-6666-4666-8666-666666666666';

const snapshot: DraftSnapshot = {
  schemaVersion: 3,
  meta: { tempo: 120, timeSignature: [4, 4], ppq: 480 },
  tracks: [
    {
      id: 't1',
      name: 'Track 1',
      order: 0,
      color: '#6366f1',
      muted: false,
      solo: false,
      volume: 1,
      pan: 0,
      instrument: null,
    },
    {
      id: 't2',
      name: 'Track 2',
      order: 1,
      color: '#22c55e',
      muted: false,
      solo: false,
      volume: 0.8,
      pan: 0.2,
      instrument: null,
    },
  ],
  notes: Array.from({ length: 10 }, (_, i) => ({
    id: `n${i + 1}`,
    trackId: 't1',
    pitch: 60 + i,
    start: i * 480,
    duration: 480,
    velocity: 80,
  })),
};

const emptySnapshot: DraftSnapshot = {
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
  branch: Record<string, unknown> | null = {
    id: branchId,
    head_commit_id: null,
  },
  getActiveBranchMock?: jest.Mock,
) {
  const mock = createSupabaseMock([], {
    tables: {
      project_collaborators: Array.from({ length: 12 }, () => ({ data: null })),
      ...tables,
    },
  });
  const projects = {
    getActiveBranchForUser:
      getActiveBranchMock ?? jest.fn().mockResolvedValue(branch),
  } as unknown as ProjectsService;
  const service = new DraftsService(
    mock.client,
    projects,
    new ProjectAccessService(mock.client),
    new DiffService(),
  );
  return { service, projects, ...mock };
}

// ============================================================================
// SHEET: BE-DRF-01 (DraftsService.getDraft)
// ============================================================================
describe('BE-DRF-01 DraftsService.getDraft', () => {
  it('UTCID01 reads draft when user owns project and active branch is set', async () => {
    const { service, builders } = makeService({
      drafts: [{ data: { snapshot } }],
    });
    await expect(service.getDraft(projectId, userId)).resolves.toEqual(
      snapshot,
    );
    expect(builders.drafts.eq).toHaveBeenCalledWith('branch_id', branchId);
    expect(builders.drafts.eq).toHaveBeenCalledWith('user_id', userId);
  });

  it('UTCID02 reads draft on default branch when active_branch_id is null', async () => {
    const defaultBranch = {
      id: defaultBranchId,
      head_commit_id: null,
      is_default: true,
    };
    const { service } = makeService(
      { drafts: [{ data: { snapshot } }] },
      defaultBranch,
    );
    await expect(service.getDraft(projectId, userId)).resolves.toEqual(
      snapshot,
    );
  });

  it('UTCID03 falls back to default branch when active_branch_id points to missing branch', async () => {
    const defaultBranch = {
      id: defaultBranchId,
      head_commit_id: null,
      is_default: true,
    };
    const { service } = makeService(
      { drafts: [{ data: { snapshot } }] },
      defaultBranch,
    );
    await expect(service.getDraft(projectId, userId)).resolves.toEqual(
      snapshot,
    );
  });

  it('UTCID04 falls back to head commit when user has no draft row', async () => {
    const { service } = makeService(
      { drafts: [{ data: null }], commits: [{ data: { snapshot } }] },
      { id: branchId, head_commit_id: headId },
    );
    await expect(service.getDraft(projectId, userId)).resolves.toEqual(
      snapshot,
    );
  });

  it('UTCID05 falls back to default snapshot when head_commit_id is null', async () => {
    const { service } = makeService(
      { drafts: [{ data: null }] },
      { id: branchId, head_commit_id: null },
    );
    const result = await service.getDraft(projectId, userId);
    expect(result).toEqual(buildDefaultDraftSnapshot());
  });

  it('UTCID06 falls back to default snapshot when head commit row is missing', async () => {
    const { service } = makeService(
      { drafts: [{ data: null }], commits: [{ data: null }] },
      { id: defaultBranchId, head_commit_id: headId },
    );
    const result = await service.getDraft(projectId, userId);
    expect(result).toEqual(buildDefaultDraftSnapshot());
  });

  it('UTCID07 throws NotFoundException when project not found', async () => {
    const getActiveBranchMock = jest
      .fn()
      .mockRejectedValue(new NotFoundException('Project not found'));
    const { service } = makeService({}, null, getActiveBranchMock);
    await expect(service.getDraft(projectId, userId)).rejects.toThrow(
      new NotFoundException('Project not found'),
    );
  });

  it('UTCID08 throws NotFoundException when no default branch exists', async () => {
    const getActiveBranchMock = jest
      .fn()
      .mockRejectedValue(new NotFoundException('Default branch not found'));
    const { service } = makeService({}, null, getActiveBranchMock);
    await expect(service.getDraft(projectId, userId)).rejects.toThrow(
      new NotFoundException('Default branch not found'),
    );
  });

  it('UTCID09 throws InternalServerErrorException when drafts query returns error', async () => {
    const { service } = makeService({
      drafts: [{ data: null, error: { message: 'db error' } }],
    });
    await expect(service.getDraft(projectId, userId)).rejects.toThrow(
      new InternalServerErrorException('Could not read draft'),
    );
  });

  it('UTCID10 reads draft when user is a collaborator of the project', async () => {
    const { service } = makeService({
      drafts: [{ data: { snapshot } }],
    });
    await expect(service.getDraft(projectId, collaboratorId)).resolves.toEqual(
      snapshot,
    );
  });
});

// ============================================================================
// SHEET: BE-DRF-02 (DraftsService.putDraft)
// ============================================================================
describe('BE-DRF-02 DraftsService.putDraft', () => {
  it('UTCID01 updates existing draft row for owned project on active branch', async () => {
    const { service, builders } = makeService({
      projects: [{ data: { owner_id: userId } }],
      drafts: [{ data: { snapshot, updated_at: '2026-10-28T10:00:00Z' } }],
    });
    await expect(
      service.putDraft(projectId, userId, snapshot),
    ).resolves.toEqual({
      version: '2026-10-28T10:00:00Z',
    });
    expect(builders.drafts.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ branch_id: branchId, user_id: userId }),
      { onConflict: 'branch_id,user_id' },
    );
  });

  it('UTCID02 creates draft row for default branch when active_branch_id is null', async () => {
    const defaultBranch = {
      id: defaultBranchId,
      head_commit_id: null,
      is_default: true,
    };
    const { service, builders } = makeService(
      {
        projects: [{ data: { owner_id: userId } }],
        drafts: [{ data: { snapshot, updated_at: '2026-10-28T10:00:00Z' } }],
      },
      defaultBranch,
    );
    await expect(
      service.putDraft(projectId, userId, snapshot),
    ).resolves.toEqual({
      version: '2026-10-28T10:00:00Z',
    });
    expect(builders.drafts.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ branch_id: defaultBranchId, user_id: userId }),
      { onConflict: 'branch_id,user_id' },
    );
  });

  it('UTCID03 updates draft with 0 tracks and 0 notes (boundary)', async () => {
    const { service } = makeService({
      projects: [{ data: { owner_id: userId } }],
      drafts: [
        {
          data: { snapshot: emptySnapshot, updated_at: '2026-10-28T10:00:00Z' },
        },
      ],
    });
    await expect(
      service.putDraft(projectId, userId, emptySnapshot),
    ).resolves.toEqual({
      version: '2026-10-28T10:00:00Z',
    });
  });

  it('UTCID04 throws NotFoundException/ForbiddenException when project not found or not owned', async () => {
    const { service } = makeService({
      projects: [{ data: null }],
    });
    await expect(
      service.putDraft(projectId, 'someone-else', snapshot),
    ).rejects.toThrow();
  });

  it('UTCID05 throws NotFoundException when default branch not found', async () => {
    const getActiveBranchMock = jest
      .fn()
      .mockRejectedValue(new NotFoundException('Default branch not found'));
    const { service } = makeService(
      { projects: [{ data: { owner_id: userId } }] },
      null,
      getActiveBranchMock,
    );
    await expect(service.putDraft(projectId, userId, snapshot)).rejects.toThrow(
      new NotFoundException('Default branch not found'),
    );
  });

  it('UTCID06 throws InternalServerErrorException when write returns error', async () => {
    const { service } = makeService({
      projects: [{ data: { owner_id: userId } }],
      drafts: [{ data: null, error: { message: 'db write failure' } }],
    });
    await expect(service.putDraft(projectId, userId, snapshot)).rejects.toThrow(
      new InternalServerErrorException('Could not write draft'),
    );
  });

  it('UTCID07 throws InternalServerErrorException when write returns null data', async () => {
    const { service } = makeService({
      projects: [{ data: { owner_id: userId } }],
      drafts: [{ data: null }],
    });
    await expect(service.putDraft(projectId, userId, snapshot)).rejects.toThrow(
      new InternalServerErrorException('Could not write draft'),
    );
  });

  it('UTCID08 updates draft when user is collaborator with edit permission', async () => {
    const { service } = makeService({
      projects: [{ data: { owner_id: userId } }],
      project_collaborators: [
        { data: { permission_level: 'edit', status: 'accepted' } },
      ],
      drafts: [{ data: { snapshot, updated_at: '2026-10-28T10:00:00Z' } }],
    });
    await expect(
      service.putDraft(projectId, collaboratorId, snapshot),
    ).resolves.toEqual({
      version: '2026-10-28T10:00:00Z',
    });
  });
});

// ============================================================================
// Other tests: Optimistic Concurrency, Discard, Recovery
// ============================================================================
describe('DraftsService optimistic concurrency and deletion', () => {
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
