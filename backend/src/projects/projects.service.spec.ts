import {
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import {
  createSupabaseMock,
  type SupabaseMockOptions,
} from '../test-utils/supabase-mock';
import { ProjectsService, DEFAULT_BRANCH_NAME } from './projects.service';
import type { CustomSoundsService } from '../custom-sounds/custom-sounds.service';
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
) {
  const mock = createSupabaseMock(results, options);
  const collectGarbage =
    customSoundsMock.collectGarbage ?? jest.fn().mockResolvedValue(undefined);
  const customSounds = {
    collectGarbage,
  } as unknown as CustomSoundsService;
  const service = new ProjectsService(mock.client, customSounds);
  return { service, customSounds, collectGarbage, ...mock };
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

  it('UTCID03 accepts duplicate project name (SRS BR-16; code throws 409 on 23505)', async () => {
    const { service } = makeService([
      { data: null, error: { code: '23505', message: 'duplicate key' } },
    ]);
    // SRS says names do not need to be unique, but code throws ConflictException
    await expect(
      service.create(ownerId, { name: 'Song A' }),
    ).resolves.toBeDefined();
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

  it('UTCID06 rolls back project when branch creation fails (SRS UC-18 7.E1; code leaves partial project)', async () => {
    const project = makeProject();
    const { service } = makeService([
      { data: project },
      { data: null, error: { code: '23503', message: 'foreign key error' } },
    ]);
    // Currently code leaves the project row and throws 500
    await expect(service.create(ownerId, { name: 'Song A' })).rejects.toThrow(
      'Project creation rolled back',
    );
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

describe('BE-PRJ-10 ProjectsService.getActiveBranchForOwner(projectId, ownerId)', () => {
  it('UTCID01 falls back to default branch when active_branch_id is null', async () => {
    const project = makeProject({ active_branch_id: null });
    const defaultBranch = makeBranch();
    const { service } = makeService([
      { data: project }, // getOwned
      { data: defaultBranch }, // loadDefaultBranch
    ]);

    const result = await service.getActiveBranchForOwner(projectId, ownerId);
    expect(result).toEqual(defaultBranch);
  });

  it('UTCID02 returns active branch when active_branch_id is valid and found', async () => {
    const activeBranch = makeBranch({ id: branchId, is_default: false });
    const project = makeProject({ active_branch_id: branchId });
    const { service } = makeService([
      { data: project }, // getOwned
      { data: activeBranch }, // branch by id
    ]);

    const result = await service.getActiveBranchForOwner(projectId, ownerId);
    expect(result).toEqual(activeBranch);
  });

  it('UTCID03 falls back to default branch when active_branch_id is stale (not found)', async () => {
    const project = makeProject({ active_branch_id: otherBranchId });
    const defaultBranch = makeBranch();
    const { service } = makeService([
      { data: project }, // getOwned
      { data: null }, // stale branch lookup returns null
      { data: defaultBranch }, // loadDefaultBranch
    ]);

    const result = await service.getActiveBranchForOwner(projectId, ownerId);
    expect(result).toEqual(defaultBranch);
  });

  it('UTCID04 throws 404 when project is not found or not owned', async () => {
    const { service } = makeService([{ data: null }]);

    await expect(
      service.getActiveBranchForOwner(projectId, ownerId),
    ).rejects.toThrow(new NotFoundException('Project not found'));
  });

  it('UTCID05 throws 404 when active_branch_id is null and default branch is missing', async () => {
    const project = makeProject({ active_branch_id: null });
    const { service } = makeService([
      { data: project },
      { data: null }, // loadDefaultBranch missing
    ]);

    await expect(
      service.getActiveBranchForOwner(projectId, ownerId),
    ).rejects.toThrow(new NotFoundException('Default branch not found'));
  });

  it('UTCID06 throws 404 when active_branch_id is stale and default branch is also missing', async () => {
    const project = makeProject({ active_branch_id: otherBranchId });
    const { service } = makeService([
      { data: project },
      { data: null }, // stale branch lookup
      { data: null }, // loadDefaultBranch missing
    ]);

    await expect(
      service.getActiveBranchForOwner(projectId, ownerId),
    ).rejects.toThrow(new NotFoundException('Default branch not found'));
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

  it('UTCID05 accepts duplicate name on update (SRS BR-16; code throws 409 on 23505)', async () => {
    const project = makeProject();
    const { service } = makeService([
      { data: project },
      { data: null, error: { code: '23505', message: 'duplicate key' } },
    ]);
    await expect(
      service.updateOwned(projectId, ownerId, { name: 'Song B' }),
    ).resolves.toBeDefined();
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

  it('UTCID08 rejects updating an archived project (SRS UC-19 1.E1; code lacks archived check)', async () => {
    const archivedProject = makeProject({
      archived_at: '2026-10-20T00:00:00Z',
    });
    const { service } = makeService([
      { data: archivedProject },
      { data: archivedProject },
    ]);
    await expect(
      service.updateOwned(projectId, ownerId, { name: 'Song B' }),
    ).rejects.toThrow('Archived project cannot be updated');
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

    const result = await service.setVisibility(projectId, ownerId, 'public');
    expect(result).toEqual(updated);
    expect(builder.update).toHaveBeenCalledWith(
      expect.objectContaining({ visibility: 'public' }),
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
      service.setVisibility(projectId, ownerId, 'public'),
    ).rejects.toThrow(
      new InternalServerErrorException('Could not update project visibility'),
    );
  });

  it('UTCID09 rejects setting public on unverified account (SRS BR-03; code lacks check)', async () => {
    const project = makeProject();
    const { service } = makeService([{ data: project }, { data: project }]);
    await expect(
      service.setVisibility(projectId, ownerId, 'public'),
    ).rejects.toThrow('Unverified account cannot make project public');
  });

  it('UTCID10 rejects visibility change on archived project (SRS UC-23 1.E1; code lacks check)', async () => {
    const archived = makeProject({ archived_at: '2026-10-26T00:00:00Z' });
    const { service } = makeService([{ data: archived }, { data: archived }]);
    await expect(
      service.setVisibility(projectId, ownerId, 'public'),
    ).rejects.toThrow('Archived project visibility cannot be changed');
  });
});

describe('BE-PRJ-13 ProjectsService.deleteOwned(projectId, ownerId)', () => {
  it('UTCID01 deletes project owned by caller and triggers collectGarbage', async () => {
    const project = makeProject();
    const { service, builder, collectGarbage } = makeService([
      { data: project }, // getOwned
      { data: null, error: null }, // delete
    ]);

    await service.deleteOwned(projectId, ownerId);

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
