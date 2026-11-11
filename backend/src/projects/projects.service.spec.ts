import {
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import {
  createSupabaseMock,
  type SupabaseMockOptions,
} from '../test-utils/supabase-mock';
import { ProjectsService, DEFAULT_BRANCH_NAME } from './projects.service';
import type { CustomSoundsService } from '../custom-sounds/custom-sounds.service';
import type { ProjectAccessService } from '../project-access/project-access.service';
import type { ActiveBranchService } from '../active-branch/active-branch.service';
import type { AudioSketchesService } from '../audio-sketches/audio-sketches.service';
import type { BranchRow, ProjectRow } from './project-row.type';

const ownerId = '11111111-1111-4111-8111-111111111111';
const otherOwnerId = '22222222-2222-4222-8222-222222222222';
const projectId = '33333333-3333-4333-8333-333333333333';
const branchId = '44444444-4444-4444-8444-444444444444';
const otherBranchId = '55555555-5555-4555-8555-555555555555';

function makeProject(overrides: Partial<ProjectRow> = {}): ProjectRow {
  return {
    id: projectId,
    owner_id: ownerId,
    name: 'Song A',
    description: 'Chill song',
    genre: 'Pop',
    visibility: 'private',
    license: null,
    forked_from_project_id: null,
    moderation_hidden_at: null,
    moderation_hidden_reason: null,
    play_count: 0,
    active_branch_id: null,
    created_at: '2026-10-21T00:00:00.000Z',
    updated_at: '2026-10-21T00:00:00.000Z',
    archived_at: null,
    ...overrides,
  };
}

function makeBranch(overrides: Partial<BranchRow> = {}): BranchRow {
  return {
    id: branchId,
    project_id: projectId,
    name: DEFAULT_BRANCH_NAME,
    is_default: true,
    created_by: ownerId,
    created_at: '2026-10-21T00:00:00.000Z',
    base_commit_id: null,
    head_commit_id: null,
    ...overrides,
  };
}

function makeService(
  results: Parameters<typeof createSupabaseMock>[0] = [],
  options: SupabaseMockOptions = {},
  customSoundsMock: { collectGarbage?: jest.Mock } = {},
  deps: {
    activeBranchId?: string | null;
    assertCanView?: jest.Mock;
    purgeProjectFiles?: jest.Mock;
  } = {},
) {
  const mock = createSupabaseMock(results, options);
  const collectGarbage =
    customSoundsMock.collectGarbage ?? jest.fn().mockResolvedValue(undefined);
  const customSounds = {
    collectGarbage,
  } as unknown as CustomSoundsService;
  const access = {
    assertCanView: deps.assertCanView ?? jest.fn().mockResolvedValue(undefined),
  };
  const activeBranch = {
    getActiveBranchId: jest.fn().mockResolvedValue(deps.activeBranchId ?? null),
  };
  const audioSketches = {
    purgeProjectFiles:
      deps.purgeProjectFiles ?? jest.fn().mockResolvedValue(undefined),
  };
  const service = new ProjectsService(
    mock.client,
    customSounds,
    access as unknown as ProjectAccessService,
    activeBranch as unknown as ActiveBranchService,
    audioSketches as unknown as AudioSketchesService,
  );
  return {
    service,
    customSounds,
    collectGarbage,
    access,
    activeBranch,
    audioSketches,
    ...mock,
  };
}

describe('BE-PRJ-06 ProjectsService.create(ownerId, dto)', () => {
  it('UTCID01 creates a project and default main branch', async () => {
    const project = makeProject();
    const { service, builder } = makeService([
      { data: project }, // projects.insert
      { data: null }, // branches.insert
    ]);

    const result = await service.create(ownerId, {
      name: 'Song A',
      description: 'Chill song',
      genre: 'Pop',
    });

    expect(result).toEqual(project);
    expect(builder.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        owner_id: ownerId,
        name: 'Song A',
        description: 'Chill song',
        genre: 'Pop',
      }),
    );
    expect(builder.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        project_id: projectId,
        name: DEFAULT_BRANCH_NAME,
        is_default: true,
        created_by: ownerId,
      }),
    );
  });

  it('UTCID02 sets null for omitted optional fields', async () => {
    const project = makeProject({ description: null, genre: null });
    const { service, builder } = makeService([
      { data: project },
      { data: null },
    ]);

    const result = await service.create(ownerId, { name: 'Song A' });

    expect(result).toEqual(project);
    expect(builder.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Song A',
        description: null,
        genre: null,
      }),
    );
  });

  it('UTCID03 accepts a project name already used by another project (BR-16)', async () => {
    const project = makeProject();
    const { service } = makeService([
      { data: project },
      { data: makeBranch() },
    ]);
    await expect(service.create(ownerId, { name: 'Song A' })).resolves.toEqual(
      project,
    );
  });

  it('UTCID04 throws 500 when project insert fails with other error', async () => {
    const { service } = makeService([
      { data: null, error: { code: '42P01', message: 'db error' } },
    ]);

    await expect(service.create(ownerId, { name: 'Song A' })).rejects.toThrow(
      new InternalServerErrorException('Could not create project'),
    );
  });

  it('UTCID05 throws 500 when project insert returns no row', async () => {
    const { service } = makeService([{ data: null, error: null }]);

    await expect(service.create(ownerId, { name: 'Song A' })).rejects.toThrow(
      new InternalServerErrorException('Could not create project'),
    );
  });

  it('UTCID06 rolls back project when branch creation fails (SRS UC-18 7.E1)', async () => {
    const project = makeProject();
    const { service, builder } = makeService([
      { data: project },
      { data: null, error: { code: '23503', message: 'foreign key error' } },
      { data: null, error: null },
    ]);
    await expect(service.create(ownerId, { name: 'Song A' })).rejects.toThrow(
      'Project creation rolled back',
    );
    expect(builder.delete).toHaveBeenCalled();
    expect(builder.eq).toHaveBeenCalledWith('id', projectId);
  });
});

describe('BE-PRJ-07 ProjectsService.listMine(ownerId)', () => {
  it('UTCID01 returns multiple projects ordered by created_at desc', async () => {
    const p1 = makeProject({ id: 'p1', created_at: '2026-10-22T00:00:00Z' });
    const p2 = makeProject({ id: 'p2', created_at: '2026-10-21T00:00:00Z' });
    const { service, builder } = makeService([{ data: [p1, p2] }]);

    const result = await service.listMine(ownerId);

    expect(result).toEqual([p1, p2]);
    expect(builder.eq).toHaveBeenCalledWith('owner_id', ownerId);
    expect(builder.order).toHaveBeenCalledWith('created_at', {
      ascending: false,
    });
  });

  it('UTCID02 returns 1 project', async () => {
    const p1 = makeProject();
    const { service } = makeService([{ data: [p1] }]);

    const result = await service.listMine(ownerId);
    expect(result).toEqual([p1]);
  });

  it('UTCID03 returns empty array when owner has no projects', async () => {
    const { service } = makeService([{ data: [] }]);

    const result = await service.listMine(ownerId);
    expect(result).toEqual([]);
  });

  it('UTCID04 throws 500 when list query fails', async () => {
    const { service } = makeService([
      { data: null, error: { code: '500', message: 'db error' } },
    ]);

    await expect(service.listMine(ownerId)).rejects.toThrow(
      new InternalServerErrorException('Could not list projects'),
    );
  });
});

describe('BE-PRJ-08 ProjectsService.getOwned(projectId, ownerId)', () => {
  it('UTCID01 returns project row when found for owner', async () => {
    const project = makeProject();
    const { service } = makeService([{ data: project }]);

    const result = await service.getOwned(projectId, ownerId);
    expect(result).toEqual(project);
  });

  it('UTCID02 throws 404 when project does not exist', async () => {
    const { service } = makeService([{ data: null }]);

    await expect(service.getOwned(projectId, ownerId)).rejects.toThrow(
      new NotFoundException('Project not found'),
    );
  });

  it('UTCID03 throws 404 when project belongs to another owner', async () => {
    const { service } = makeService([{ data: null }]);

    await expect(service.getOwned(projectId, otherOwnerId)).rejects.toThrow(
      new NotFoundException('Project not found'),
    );
  });

  it('UTCID04 throws 404 on database query error', async () => {
    const { service } = makeService([
      {
        data: null,
        error: { code: '42P01', message: 'relation does not exist' },
      },
    ]);

    await expect(service.getOwned(projectId, ownerId)).rejects.toThrow(
      new NotFoundException('Project not found'),
    );
  });
});

describe('BE-PRJ-09 ProjectsService.getDefaultBranchForOwner(projectId, ownerId)', () => {
  it('UTCID01 returns default branch when project is owned and default branch exists', async () => {
    const project = makeProject();
    const branch = makeBranch();
    const { service } = makeService([
      { data: project }, // getOwned
      { data: branch }, // branches.select (default)
    ]);

    const result = await service.getDefaultBranchForOwner(projectId, ownerId);
    expect(result).toEqual(branch);
  });

  it('UTCID02 throws 404 when project is not found or not owned', async () => {
    const { service } = makeService([{ data: null }]); // getOwned fails

    await expect(
      service.getDefaultBranchForOwner(projectId, ownerId),
    ).rejects.toThrow(new NotFoundException('Project not found'));
  });

  it('UTCID03 throws 404 when default branch is missing', async () => {
    const project = makeProject();
    const { service } = makeService([
      { data: project }, // getOwned
      { data: null }, // default branch missing
    ]);

    await expect(
      service.getDefaultBranchForOwner(projectId, ownerId),
    ).rejects.toThrow(new NotFoundException('Default branch not found'));
  });

  it('UTCID04 throws 404 when branch query returns an error', async () => {
    const project = makeProject();
    const { service } = makeService([
      { data: project },
      { data: null, error: { code: '42P01', message: 'error' } },
    ]);

    await expect(
      service.getDefaultBranchForOwner(projectId, ownerId),
    ).rejects.toThrow(new NotFoundException('Default branch not found'));
  });
});

describe('BE-PRJ-10 ProjectsService.getActiveBranchForUser(projectId, userId)', () => {
  it('UTCID01 falls back to default branch when there is no active branch', async () => {
    const defaultBranch = makeBranch();
    const { service, access } = makeService([{ data: defaultBranch }]);

    const result = await service.getActiveBranchForUser(projectId, ownerId);
    expect(result).toEqual(defaultBranch);
    expect(access.assertCanView).toHaveBeenCalledWith(projectId, ownerId);
  });

  it('UTCID02 returns active branch when the recorded branch is found', async () => {
    const activeBranch = makeBranch({ id: otherBranchId, is_default: false });
    const { service } = makeService(
      [{ data: activeBranch }],
      {},
      {},
      {
        activeBranchId: otherBranchId,
      },
    );

    const result = await service.getActiveBranchForUser(projectId, ownerId);
    expect(result).toEqual(activeBranch);
  });

  it('UTCID03 falls back to default branch when the recorded branch is stale (not found)', async () => {
    const defaultBranch = makeBranch();
    const { service } = makeService(
      [{ data: null }, { data: defaultBranch }],
      {},
      {},
      { activeBranchId: otherBranchId },
    );

    const result = await service.getActiveBranchForUser(projectId, ownerId);
    expect(result).toEqual(defaultBranch);
  });

  it('UTCID04 rejects when the user cannot view the project', async () => {
    const { service } = makeService(
      [],
      {},
      {},
      {
        assertCanView: jest
          .fn()
          .mockRejectedValue(new NotFoundException('Project not found')),
      },
    );

    await expect(
      service.getActiveBranchForUser(projectId, ownerId),
    ).rejects.toThrow(new NotFoundException('Project not found'));
  });

  it('UTCID05 throws 404 when there is no active branch and the default branch is missing', async () => {
    const { service } = makeService([{ data: null }]);

    await expect(
      service.getActiveBranchForUser(projectId, ownerId),
    ).rejects.toThrow(new NotFoundException('Default branch not found'));
  });

  it('UTCID06 throws 404 when the recorded branch is stale and the default branch is also missing', async () => {
    const { service } = makeService(
      [{ data: null }, { data: null }],
      {},
      {},
      {
        activeBranchId: otherBranchId,
      },
    );

    await expect(
      service.getActiveBranchForUser(projectId, ownerId),
    ).rejects.toThrow(new NotFoundException('Default branch not found'));
  });

  it('UTCID07 skips the access check when the caller already verified access', async () => {
    const { service, access } = makeService([{ data: makeBranch() }]);

    await service.getActiveBranchForUser(projectId, ownerId, {
      accessChecked: true,
    });
    expect(access.assertCanView).not.toHaveBeenCalled();
  });
});

describe('BE-PRJ-11 ProjectsService.updateOwned(projectId, ownerId, dto)', () => {
  it('UTCID01 updates project name only', async () => {
    const project = makeProject();
    const updated = makeProject({ name: 'Song B' });
    const { service, builder } = makeService([
      { data: project }, // getOwned
      { data: updated }, // update
    ]);

    const result = await service.updateOwned(projectId, ownerId, {
      name: 'Song B',
    });
    expect(result).toEqual(updated);
    expect(builder.update).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Song B' }),
    );
  });

  it('UTCID02 updates description and genre', async () => {
    const project = makeProject();
    const updated = makeProject({ description: 'New desc', genre: 'Rock' });
    const { service, builder } = makeService([
      { data: project },
      { data: updated },
    ]);

    const result = await service.updateOwned(projectId, ownerId, {
      description: 'New desc',
      genre: 'Rock',
    });
    expect(result).toEqual(updated);
    expect(builder.update).toHaveBeenCalledWith(
      expect.objectContaining({ description: 'New desc', genre: 'Rock' }),
    );
  });

  it('UTCID03 returns project unchanged when patch has no defined fields', async () => {
    const project = makeProject();
    const { service, builder } = makeService([
      { data: project }, // getOwned
      { data: project }, // update
    ]);

    const result = await service.updateOwned(projectId, ownerId, {});
    expect(result).toEqual(project);
    expect(builder.update).toHaveBeenCalledWith({});
  });

  it('UTCID04 throws 404 when project not found or not owned', async () => {
    const { service } = makeService([{ data: null }]);

    await expect(
      service.updateOwned(projectId, ownerId, { name: 'Song B' }),
    ).rejects.toThrow(new NotFoundException('Project not found'));
  });

  it('UTCID05 accepts a name already used by another project (BR-16)', async () => {
    const project = makeProject();
    const renamed = makeProject({ name: 'Song B' });
    const { service } = makeService([{ data: project }, { data: renamed }]);
    await expect(
      service.updateOwned(projectId, ownerId, { name: 'Song B' }),
    ).resolves.toEqual(renamed);
  });

  it('UTCID06 throws 500 when update query fails with other error', async () => {
    const project = makeProject();
    const { service } = makeService([
      { data: project },
      { data: null, error: { code: '42P01', message: 'update failed' } },
    ]);

    await expect(
      service.updateOwned(projectId, ownerId, { name: 'Song B' }),
    ).rejects.toThrow(
      new InternalServerErrorException('Could not update project'),
    );
  });

  it('UTCID07 throws 500 when update returns no row', async () => {
    const project = makeProject();
    const { service } = makeService([
      { data: project },
      { data: null, error: null },
    ]);

    await expect(
      service.updateOwned(projectId, ownerId, { name: 'Song B' }),
    ).rejects.toThrow(
      new InternalServerErrorException('Could not update project'),
    );
  });

  it('UTCID08 rejects updating an archived project (SRS UC-19 1.E1)', async () => {
    const archivedProject = makeProject({
      archived_at: '2026-10-20T00:00:00Z',
    });
    const { service } = makeService([
      { data: archivedProject },
      { data: archivedProject },
    ]);
    await expect(
      service.updateOwned(projectId, ownerId, { name: 'Song B' }),
    ).rejects.toThrow(ConflictException);
  });
});

describe('BE-PRJ-12 ProjectsService.archiveOwned / unarchiveOwned / setVisibility', () => {
  it('UTCID01 archiveOwned sets archived_at timestamp', async () => {
    const project = makeProject();
    const archived = makeProject({ archived_at: '2026-10-26T00:00:00Z' });
    const { service, builder } = makeService([
      { data: project },
      { data: archived },
    ]);

    const result = await service.archiveOwned(projectId, ownerId);
    expect(result).toEqual(archived);
    expect(builder.update).toHaveBeenCalledWith(
      expect.objectContaining({ archived_at: expect.any(String) }),
    );
  });

  it('UTCID02 unarchiveOwned clears archived_at', async () => {
    const project = makeProject({ archived_at: '2026-10-26T00:00:00Z' });
    const unarchived = makeProject({ archived_at: null });
    const { service, builder } = makeService([
      { data: project },
      { data: unarchived },
    ]);

    const result = await service.unarchiveOwned(projectId, ownerId);
    expect(result).toEqual(unarchived);
    expect(builder.update).toHaveBeenCalledWith(
      expect.objectContaining({ archived_at: null }),
    );
  });

  it('UTCID03 setVisibility sets visibility to public', async () => {
    const project = makeProject({ visibility: 'private' });
    const updated = makeProject({ visibility: 'public' });
    const { service, builder } = makeService([
      { data: project },
      { data: updated },
    ]);

    const result = await service.setVisibility(
      projectId,
      ownerId,
      'public',
      'CC-BY',
    );
    expect(result).toEqual(updated);
    expect(builder.update).toHaveBeenCalledWith(
      expect.objectContaining({ visibility: 'public', license: 'CC-BY' }),
    );
  });

  it('UTCID04 setVisibility sets visibility to private', async () => {
    const project = makeProject({ visibility: 'public' });
    const updated = makeProject({ visibility: 'private' });
    const { service, builder } = makeService([
      { data: project },
      { data: updated },
    ]);

    const result = await service.setVisibility(projectId, ownerId, 'private');
    expect(result).toEqual(updated);
    expect(builder.update).toHaveBeenCalledWith(
      expect.objectContaining({ visibility: 'private' }),
    );
  });

  it('UTCID05 archiveOwned throws 404 when project not found', async () => {
    const { service } = makeService([{ data: null }]);

    await expect(service.archiveOwned(projectId, ownerId)).rejects.toThrow(
      new NotFoundException('Project not found'),
    );
  });

  it('UTCID06 archiveOwned throws 500 when update fails', async () => {
    const project = makeProject();
    const { service } = makeService([
      { data: project },
      { data: null, error: { code: '500', message: 'error' } },
    ]);

    await expect(service.archiveOwned(projectId, ownerId)).rejects.toThrow(
      new InternalServerErrorException('Could not archive project'),
    );
  });

  it('UTCID07 unarchiveOwned throws 500 when update returns no row', async () => {
    const project = makeProject({ archived_at: '2026-10-26T00:00:00Z' });
    const { service } = makeService([
      { data: project },
      { data: null, error: null },
    ]);

    await expect(service.unarchiveOwned(projectId, ownerId)).rejects.toThrow(
      new InternalServerErrorException('Could not unarchive project'),
    );
  });

  it('UTCID08 setVisibility throws 500 when update fails', async () => {
    const project = makeProject();
    const { service } = makeService([
      { data: project },
      { data: null, error: { code: '500', message: 'error' } },
    ]);

    await expect(
      service.setVisibility(projectId, ownerId, 'public', 'CC-BY'),
    ).rejects.toThrow(
      new InternalServerErrorException('Could not update project visibility'),
    );
  });

  it.failing(
    'UTCID09 rejects setting public on unverified account (SRS BR-03; code lacks check)',
    async () => {
      const project = makeProject();
      const { service } = makeService([{ data: project }, { data: project }]);
      await expect(
        service.setVisibility(projectId, ownerId, 'public'),
      ).rejects.toThrow('Unverified account cannot make project public');
    },
  );

  it('UTCID10 rejects visibility change on archived project (SRS UC-23 1.E1)', async () => {
    const archived = makeProject({ archived_at: '2026-10-26T00:00:00Z' });
    const { service, builder } = makeService([{ data: archived }]);
    await expect(
      service.setVisibility(projectId, ownerId, 'public'),
    ).rejects.toThrow(ConflictException);
    expect(builder.update).not.toHaveBeenCalled();
  });
});

describe('BE-PRJ-13 ProjectsService.deleteOwned(projectId, ownerId)', () => {
  it('UTCID01 deletes project owned by caller and triggers collectGarbage', async () => {
    const project = makeProject();
    const { service, builder, collectGarbage, audioSketches } = makeService([
      { data: project }, // getOwned
      { data: null, error: null }, // delete
    ]);

    await service.deleteOwned(projectId, ownerId);
    expect(audioSketches.purgeProjectFiles).toHaveBeenCalledWith([projectId]);

    expect(builder.delete).toHaveBeenCalled();
    expect(builder.eq).toHaveBeenCalledWith('id', projectId);
    expect(builder.eq).toHaveBeenCalledWith('owner_id', ownerId);
    expect(collectGarbage).toHaveBeenCalledTimes(1);
  });

  it('UTCID02 completes successfully even when collectGarbage finishes without throwing', async () => {
    const project = makeProject();
    const { service, collectGarbage } = makeService(
      [{ data: project }, { data: null, error: null }],
      {},
      { collectGarbage: jest.fn().mockResolvedValue(undefined) },
    );

    await expect(
      service.deleteOwned(projectId, ownerId),
    ).resolves.toBeUndefined();
    expect(collectGarbage).toHaveBeenCalledTimes(1);
  });

  it('UTCID03 throws 404 and does not delete when project is not found or not owned', async () => {
    const { service, builder, collectGarbage } = makeService([
      { data: null }, // getOwned fails
    ]);

    await expect(service.deleteOwned(projectId, ownerId)).rejects.toThrow(
      new NotFoundException('Project not found'),
    );
    expect(builder.delete).not.toHaveBeenCalled();
    expect(collectGarbage).not.toHaveBeenCalled();
  });

  it('UTCID04 throws 500 and does not trigger collectGarbage when delete query fails', async () => {
    const project = makeProject();
    const { service, collectGarbage } = makeService([
      { data: project }, // getOwned
      {
        data: null,
        error: { code: '500', message: 'foreign key or db error' },
      },
    ]);

    await expect(service.deleteOwned(projectId, ownerId)).rejects.toThrow(
      new InternalServerErrorException('Could not delete project'),
    );
    expect(collectGarbage).not.toHaveBeenCalled();
  });
});

describe('BE-PRJ-LIC license when publishing', () => {
  it('UTCID01 refuses to publish without any license', async () => {
    const { service, builder } = makeService([
      { data: makeProject({ license: null }) },
    ]);
    await expect(
      service.setVisibility(projectId, ownerId, 'public'),
    ).rejects.toThrow(BadRequestException);
    expect(builder.update).not.toHaveBeenCalled();
  });

  it('UTCID02 publishes with the license already stored', async () => {
    const { service, builder } = makeService([
      { data: makeProject({ license: 'CC-BY-SA' }) },
      { data: makeProject({ visibility: 'public', license: 'CC-BY-SA' }) },
    ]);
    await service.setVisibility(projectId, ownerId, 'public');
    expect(builder.update).toHaveBeenCalledWith(
      expect.objectContaining({ visibility: 'public', license: 'CC-BY-SA' }),
    );
  });

  it('UTCID03 a license chosen in the request wins over the stored one', async () => {
    const { service, builder } = makeService([
      { data: makeProject({ license: 'CC-BY-SA' }) },
      { data: makeProject({ visibility: 'public', license: 'CC-BY-NC' }) },
    ]);
    await service.setVisibility(projectId, ownerId, 'public', 'CC-BY-NC');
    expect(builder.update).toHaveBeenCalledWith(
      expect.objectContaining({ license: 'CC-BY-NC' }),
    );
  });

  it('UTCID04 going private never asks for or touches the license', async () => {
    const { service, builder } = makeService([
      { data: makeProject({ visibility: 'public', license: 'CC-BY' }) },
      { data: makeProject({ visibility: 'private', license: 'CC-BY' }) },
    ]);
    await service.setVisibility(projectId, ownerId, 'private');
    const patch = builder.update.mock.calls[0][0] as Record<string, unknown>;
    expect(patch).not.toHaveProperty('license');
  });

  it('UTCID05 updateOwned can change the license', async () => {
    const { service, builder } = makeService([
      { data: makeProject({ visibility: 'public', license: 'CC-BY' }) },
      { data: makeProject({ visibility: 'public', license: 'CC-BY-NC' }) },
    ]);
    await service.updateOwned(projectId, ownerId, { license: 'CC-BY-NC' });
    expect(builder.update).toHaveBeenCalledWith({ license: 'CC-BY-NC' });
  });
});

describe('BE-PRJ-TAG ProjectsService tags', () => {
  it('UTCID01 setTags normalizes then replaces the set through one RPC', async () => {
    const { service, rpc } = makeService([{ data: makeProject() }], {
      rpc: { set_project_tags: { data: ['lo-fi', 'piano'], error: null } },
    });
    const result = await service.setTags(projectId, ownerId, [
      ' Lo-Fi ',
      'Piano',
      'piano',
    ]);
    expect(result).toEqual(['lo-fi', 'piano']);
    expect(rpc).toHaveBeenCalledWith('set_project_tags', {
      p_project_id: projectId,
      p_names: ['lo-fi', 'piano'],
    });
  });

  it('UTCID02 setTags is owner-only: someone else gets 404 and no RPC runs', async () => {
    const { service, rpc } = makeService([{ data: null }]);
    await expect(
      service.setTags(projectId, otherOwnerId, ['a']),
    ).rejects.toThrow(NotFoundException);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('UTCID03 setTags refuses an archived project', async () => {
    const { service, rpc } = makeService([
      { data: makeProject({ archived_at: '2026-10-26T00:00:00Z' }) },
    ]);
    await expect(service.setTags(projectId, ownerId, ['a'])).rejects.toThrow(
      ConflictException,
    );
    expect(rpc).not.toHaveBeenCalled();
  });

  it('UTCID04 setTags surfaces an RPC failure instead of pretending success', async () => {
    const { service } = makeService([{ data: makeProject() }], {
      rpc: { set_project_tags: { data: null, error: { message: 'x' } } },
    });
    await expect(service.setTags(projectId, ownerId, ['a'])).rejects.toThrow(
      InternalServerErrorException,
    );
  });

  it('UTCID05 setTags rejects invalid input before touching the database', async () => {
    const { service, rpc } = makeService([]);
    await expect(
      service.setTags(projectId, ownerId, ['<script>']),
    ).rejects.toThrow(BadRequestException);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('UTCID06 getTags returns the tag names of the owner project', async () => {
    const { service } = makeService([
      { data: makeProject() },
      { data: [{ tag: { name: 'jazz' } }, { tag: [{ name: 'lo-fi' }] }] },
    ]);
    await expect(service.getTags(projectId, ownerId)).resolves.toEqual([
      'jazz',
      'lo-fi',
    ]);
  });
});
