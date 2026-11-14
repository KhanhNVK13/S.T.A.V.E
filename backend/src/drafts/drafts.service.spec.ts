import {
  ConflictException,
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import type { DraftSnapshot } from '@stave/shared-types';
import {
  createSupabaseMock,
  type QueryResult,
} from '../test-utils/supabase-mock';
import { ProjectAccessService } from '../project-access/project-access.service';
import { ProjectsService } from '../projects/projects.service';
import { ActiveBranchService } from '../active-branch/active-branch.service';
import type { CustomSoundsService } from '../custom-sounds/custom-sounds.service';
import type { AudioSketchesService } from '../audio-sketches/audio-sketches.service';
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

const ownerProject = { id: projectId, owner_id: userId };
const defaultBranchId = '77777777-7777-4777-8777-777777777777';
const ownerId = '55555555-5555-4555-8555-555555555555';
const otherProject = { id: projectId, owner_id: ownerId };

function branchRow(id: string, head: string | null = null) {
  return {
    id,
    project_id: projectId,
    head_commit_id: head,
    is_default: id === defaultBranchId,
  };
}

function richDraft(): DraftSnapshot {
  return {
    schemaVersion: 3,
    meta: { tempo: 120, timeSignature: [4, 4], ppq: 480 },
    tracks: [
      {
        id: 't1',
        name: 'Piano',
        instrument: 'piano',
        order: 0,
        color: '#6366f1',
        volume: 1,
        pan: 0,
        muted: false,
        solo: false,
      },
      {
        id: 't2',
        name: 'Bass',
        instrument: 'bass',
        order: 1,
        color: '#22c55e',
        volume: 0.8,
        pan: 0,
        muted: false,
        solo: false,
      },
    ],
    notes: Array.from({ length: 10 }, (_, i) => ({
      id: `n${i}`,
      trackId: i % 2 === 0 ? 't1' : 't2',
      pitch: 60 + i,
      start: i * 480,
      duration: 480,
      velocity: 90,
    })),
  };
}

function makeRealService(tables: Record<string, QueryResult[]>) {
  const mock = createSupabaseMock([], { tables });
  const access = new ProjectAccessService(mock.client);
  const projects = new ProjectsService(
    mock.client,
    {} as CustomSoundsService,
    access,
    new ActiveBranchService(mock.client),
    {} as AudioSketchesService,
  );
  const service = new DraftsService(
    mock.client,
    projects,
    access,
    new DiffService(),
  );
  return { service, ...mock };
}

describe('BE-DRF-01 DraftsService.getDraft', () => {
  it('UTCID01 returns the calling user draft on the valid active branch', async () => {
    const { service, builders } = makeRealService({
      projects: [
        { data: ownerProject },
        { data: { owner_id: userId, active_branch_id: branchId } },
      ],
      branches: [{ data: branchRow(branchId) }],
      drafts: [{ data: { snapshot } }],
    });

    await expect(service.getDraft(projectId, userId)).resolves.toBe(snapshot);
    expect(builders.drafts.eq).toHaveBeenCalledWith('branch_id', branchId);
    expect(builders.drafts.eq).toHaveBeenCalledWith('user_id', userId);
  });

  it('UTCID02 reads the draft of the default branch when no active branch is set', async () => {
    const { service, builders } = makeRealService({
      projects: [
        { data: ownerProject },
        { data: { owner_id: userId, active_branch_id: null } },
      ],
      branches: [{ data: branchRow(defaultBranchId) }],
      drafts: [{ data: { snapshot } }],
    });

    await expect(service.getDraft(projectId, userId)).resolves.toBe(snapshot);
    expect(builders.branches.eq).toHaveBeenCalledWith('is_default', true);
    expect(builders.drafts.eq).toHaveBeenCalledWith(
      'branch_id',
      defaultBranchId,
    );
  });

  it('UTCID03 falls back to the default branch draft when the active branch no longer exists', async () => {
    const { service, builders } = makeRealService({
      projects: [
        { data: ownerProject },
        { data: { owner_id: userId, active_branch_id: branchId } },
      ],
      branches: [{ data: null }, { data: branchRow(defaultBranchId) }],
      drafts: [{ data: { snapshot } }],
    });

    await expect(service.getDraft(projectId, userId)).resolves.toBe(snapshot);
    expect(builders.drafts.eq).toHaveBeenCalledWith(
      'branch_id',
      defaultBranchId,
    );
  });

  it('UTCID04 returns the head commit snapshot when the user has no draft yet', async () => {
    const headSnapshot = richDraft();
    const { service, builders } = makeRealService({
      projects: [
        { data: ownerProject },
        { data: { owner_id: userId, active_branch_id: branchId } },
      ],
      branches: [{ data: branchRow(branchId, headId) }],
      drafts: [{ data: null }],
      commits: [{ data: { snapshot: headSnapshot } }],
    });

    await expect(service.getDraft(projectId, userId)).resolves.toBe(
      headSnapshot,
    );
    expect(builders.commits.eq).toHaveBeenCalledWith('id', headId);
  });

  it('UTCID05 returns the default snapshot when the branch has no draft and no commit', async () => {
    const { service, builders } = makeRealService({
      projects: [
        { data: ownerProject },
        { data: { owner_id: userId, active_branch_id: branchId } },
      ],
      branches: [{ data: branchRow(branchId, null) }],
      drafts: [{ data: null }],
    });

    await expect(service.getDraft(projectId, userId)).resolves.toEqual({
      schemaVersion: 3,
      meta: { tempo: 120, timeSignature: [4, 4], ppq: 480 },
      tracks: [],
      notes: [],
    });
    expect(builders.commits).toBeUndefined();
  });

  it('UTCID06 returns the default snapshot when the head commit row is missing', async () => {
    const { service } = makeRealService({
      projects: [
        { data: ownerProject },
        { data: { owner_id: userId, active_branch_id: null } },
      ],
      branches: [{ data: branchRow(defaultBranchId, headId) }],
      drafts: [{ data: null }],
      commits: [{ data: null }],
    });

    await expect(service.getDraft(projectId, userId)).resolves.toEqual({
      schemaVersion: 3,
      meta: { tempo: 120, timeSignature: [4, 4], ppq: 480 },
      tracks: [],
      notes: [],
    });
  });

  it('UTCID07 throws NotFoundException "Project not found" when the project does not exist', async () => {
    const { service, builders } = makeRealService({
      projects: [{ data: null }],
    });

    await expect(service.getDraft(projectId, userId)).rejects.toThrow(
      new NotFoundException('Project not found'),
    );
    expect(builders.drafts).toBeUndefined();
  });

  it('UTCID08 throws NotFoundException "Default branch not found" without an active or default branch', async () => {
    const { service } = makeRealService({
      projects: [
        { data: ownerProject },
        { data: { owner_id: userId, active_branch_id: null } },
      ],
      branches: [{ data: null }],
    });

    await expect(service.getDraft(projectId, userId)).rejects.toThrow(
      new NotFoundException('Default branch not found'),
    );
  });

  it('UTCID09 throws InternalServerErrorException "Could not read draft" when the drafts query errors', async () => {
    const { service } = makeRealService({
      projects: [
        { data: ownerProject },
        { data: { owner_id: userId, active_branch_id: branchId } },
      ],
      branches: [{ data: branchRow(branchId) }],
      drafts: [{ data: null, error: { message: 'relation missing' } }],
    });

    await expect(service.getDraft(projectId, userId)).rejects.toThrow(
      new InternalServerErrorException('Could not read draft'),
    );
  });

  it('UTCID10 returns the collaborator own draft on their active branch', async () => {
    const { service, builders } = makeRealService({
      projects: [
        { data: otherProject },
        { data: { owner_id: ownerId, active_branch_id: defaultBranchId } },
      ],
      project_collaborators: [
        { data: { permission_level: 'view', status: 'accepted' } },
      ],
      project_member_active_branches: [{ data: { branch_id: branchId } }],
      branches: [{ data: branchRow(branchId) }],
      drafts: [{ data: { snapshot } }],
    });

    await expect(service.getDraft(projectId, userId)).resolves.toBe(snapshot);
    expect(builders.drafts.eq).toHaveBeenCalledWith('branch_id', branchId);
    expect(builders.drafts.eq).toHaveBeenCalledWith('user_id', userId);
  });

  it('refuses a user who is neither the owner nor an accepted collaborator', async () => {
    const { service, builders } = makeRealService({
      projects: [{ data: otherProject }],
      project_collaborators: [
        { data: { permission_level: 'edit', status: 'pending' } },
      ],
    });

    await expect(service.getDraft(projectId, userId)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(builders.drafts).toBeUndefined();
  });
});

describe('BE-DRF-02 DraftsService.putDraft', () => {
  const savedAt = '2026-11-12T10:00:00.000Z';

  it('UTCID01 overwrites the existing draft row of the active branch and returns the new version', async () => {
    const dto = richDraft();
    const { service, builders } = makeRealService({
      projects: [
        { data: ownerProject },
        { data: { owner_id: userId, active_branch_id: branchId } },
      ],
      branches: [{ data: branchRow(branchId) }],
      drafts: [{ data: { updated_at: savedAt } }],
    });

    await expect(service.putDraft(projectId, userId, dto)).resolves.toEqual({
      version: savedAt,
    });
    expect(builders.drafts.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        branch_id: branchId,
        user_id: userId,
        snapshot: dto,
        updated_at: expect.any(String),
      }),
      { onConflict: 'branch_id,user_id' },
    );
  });

  it('UTCID02 creates the first draft row on the default branch when no active branch is set', async () => {
    const dto = richDraft();
    const { service, builders } = makeRealService({
      projects: [
        { data: ownerProject },
        { data: { owner_id: userId, active_branch_id: null } },
      ],
      branches: [{ data: branchRow(defaultBranchId) }],
      drafts: [{ data: { updated_at: savedAt } }],
    });

    await expect(service.putDraft(projectId, userId, dto)).resolves.toEqual({
      version: savedAt,
    });
    expect(builders.drafts.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ branch_id: defaultBranchId, user_id: userId }),
      { onConflict: 'branch_id,user_id' },
    );
  });

  it('UTCID03 saves an empty snapshot with 0 tracks and 0 notes', async () => {
    const { service, builders } = makeRealService({
      projects: [
        { data: ownerProject },
        { data: { owner_id: userId, active_branch_id: branchId } },
      ],
      branches: [{ data: branchRow(branchId) }],
      drafts: [{ data: { updated_at: savedAt } }],
    });

    await expect(
      service.putDraft(projectId, userId, snapshot),
    ).resolves.toEqual({ version: savedAt });
    expect(builders.drafts.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ snapshot }),
      { onConflict: 'branch_id,user_id' },
    );
  });

  it('UTCID04 throws NotFoundException "Project not found" when the project does not exist', async () => {
    const { service, builders } = makeRealService({
      projects: [{ data: null }],
    });

    await expect(
      service.putDraft(projectId, userId, richDraft()),
    ).rejects.toThrow(new NotFoundException('Project not found'));
    expect(builders.drafts).toBeUndefined();
  });

  it('UTCID05 throws NotFoundException "Default branch not found" without an active or default branch', async () => {
    const { service, builders } = makeRealService({
      projects: [
        { data: ownerProject },
        { data: { owner_id: userId, active_branch_id: null } },
      ],
      branches: [{ data: null }],
    });

    await expect(
      service.putDraft(projectId, userId, richDraft()),
    ).rejects.toThrow(new NotFoundException('Default branch not found'));
    expect(builders.drafts).toBeUndefined();
  });

  it('UTCID06 throws InternalServerErrorException "Could not write draft" when the upsert errors', async () => {
    const { service } = makeRealService({
      projects: [
        { data: ownerProject },
        { data: { owner_id: userId, active_branch_id: branchId } },
      ],
      branches: [{ data: branchRow(branchId) }],
      drafts: [{ data: null, error: { message: 'boom' } }],
    });

    await expect(
      service.putDraft(projectId, userId, richDraft()),
    ).rejects.toThrow(
      new InternalServerErrorException('Could not write draft'),
    );
  });

  it('UTCID07 throws InternalServerErrorException "Could not write draft" when the upsert returns no row', async () => {
    const { service } = makeRealService({
      projects: [
        { data: ownerProject },
        { data: { owner_id: userId, active_branch_id: branchId } },
      ],
      branches: [{ data: branchRow(branchId) }],
      drafts: [{ data: null, error: null }],
    });

    await expect(
      service.putDraft(projectId, userId, richDraft()),
    ).rejects.toThrow(
      new InternalServerErrorException('Could not write draft'),
    );
  });

  it('UTCID08 saves the draft of an accepted edit collaborator under their own user id', async () => {
    const dto = richDraft();
    const { service, builders } = makeRealService({
      projects: [
        { data: otherProject },
        { data: { owner_id: ownerId, active_branch_id: defaultBranchId } },
      ],
      project_collaborators: [
        { data: { permission_level: 'edit', status: 'accepted' } },
      ],
      project_member_active_branches: [{ data: { branch_id: branchId } }],
      branches: [{ data: branchRow(branchId) }],
      drafts: [{ data: { updated_at: savedAt } }],
    });

    await expect(service.putDraft(projectId, userId, dto)).resolves.toEqual({
      version: savedAt,
    });
    expect(builders.drafts.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ branch_id: branchId, user_id: userId }),
      { onConflict: 'branch_id,user_id' },
    );
  });

  it('UTCID09 updates only the row still at the expected version', async () => {
    const { service, builders } = makeRealService({
      projects: [
        { data: ownerProject },
        { data: { owner_id: userId, active_branch_id: branchId } },
      ],
      branches: [{ data: branchRow(branchId) }],
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

  it('UTCID10 answers 409 DRAFT_STALE when another tab changed the draft', async () => {
    const { service } = makeRealService({
      projects: [
        { data: ownerProject },
        { data: { owner_id: userId, active_branch_id: branchId } },
      ],
      branches: [{ data: branchRow(branchId) }],
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

  it('UTCID11 inserts only when no draft exists yet for the "none" version', async () => {
    const { service, builders } = makeRealService({
      projects: [
        { data: ownerProject },
        { data: { owner_id: userId, active_branch_id: branchId } },
      ],
      branches: [{ data: branchRow(branchId) }],
      drafts: [{ data: { updated_at: savedAt } }],
    });

    await expect(
      service.putDraft(projectId, userId, snapshot, 'none'),
    ).resolves.toEqual({ version: savedAt });
    expect(builders.drafts.insert).toHaveBeenCalled();
    expect(builders.drafts.upsert).not.toHaveBeenCalled();
  });

  it('UTCID12 answers 409 DRAFT_STALE when a draft appeared meanwhile for "none"', async () => {
    const { service } = makeRealService({
      projects: [
        { data: ownerProject },
        { data: { owner_id: userId, active_branch_id: branchId } },
      ],
      branches: [{ data: branchRow(branchId) }],
      drafts: [{ data: null, error: { code: '23505', message: 'dup' } }],
    });

    const error = await service
      .putDraft(projectId, userId, snapshot, 'none')
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getResponse()).toMatchObject({
      code: 'DRAFT_STALE',
    });
  });

  it('UTCID13 refuses a write from a view-only collaborator', async () => {
    const { service, builders } = makeRealService({
      projects: [{ data: otherProject }],
      project_collaborators: [
        { data: { permission_level: 'view', status: 'accepted' } },
      ],
    });

    await expect(
      service.putDraft(projectId, userId, richDraft()),
    ).rejects.toThrow(
      new ForbiddenException('You do not have edit permission on this project'),
    );
    expect(builders.drafts).toBeUndefined();
  });

  it('UTCID14 writes only the draft and never touches the commit history', async () => {
    const { service, builders } = makeRealService({
      projects: [
        { data: ownerProject },
        { data: { owner_id: userId, active_branch_id: branchId } },
      ],
      branches: [{ data: branchRow(branchId) }],
      drafts: [{ data: { updated_at: savedAt } }],
    });

    await service.putDraft(projectId, userId, richDraft());

    expect(builders.drafts.upsert).toHaveBeenCalledTimes(1);
    expect(builders.commits).toBeUndefined();
    expect(builders.commit_lineage).toBeUndefined();
  });
});

describe('DraftsService.discardUserDraft', () => {
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

describe('BE-DRF-06 DraftsService.getRecovery', () => {
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

  it('UTCID01 reports nothing to recover when the user has no draft', async () => {
    const { service } = makeService({ drafts: [{ data: null }] });
    await expect(service.getRecovery(projectId, userId)).resolves.toEqual({
      recovered: false,
      savedAt: null,
      version: null,
    });
  });

  it('UTCID02 reports a recovered draft with its save time when it differs from the head commit', async () => {
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

  it('UTCID03 reports nothing to recover when the draft equals the head commit', async () => {
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

  it('UTCID04 reports a draft as recovered when the branch has no commit yet and the draft is not empty', async () => {
    const { service } = makeService({
      drafts: [
        { data: { snapshot: edited, updated_at: '2026-10-26T10:00:00Z' } },
      ],
    });
    await expect(service.getRecovery(projectId, userId)).resolves.toEqual({
      recovered: true,
      savedAt: '2026-10-26T10:00:00Z',
      version: '2026-10-26T10:00:00Z',
    });
  });

  it('UTCID05 reports a failure when the draft cannot be read', async () => {
    const { service } = makeService({
      drafts: [{ data: null, error: { message: 'db' } }],
    });
    await expect(service.getRecovery(projectId, userId)).rejects.toBeInstanceOf(
      InternalServerErrorException,
    );
  });
});
