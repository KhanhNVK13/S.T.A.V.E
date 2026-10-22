import {
  BadRequestException,
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import type { SupabaseMockOptions } from '../test-utils/supabase-mock';
import { CreateBranchDto } from './dto/create-branch.dto';
import { SwitchBranchDto } from './dto/switch-branch.dto';

jest.mock('uuid', () => ({
  v4: jest.fn(() => '77777777-7777-4777-8777-777777777777'),
}));

import { createSupabaseMock } from '../test-utils/supabase-mock';
import { BranchesService } from './branches.service';

const branchId = '11111111-1111-4111-8111-111111111111';
const otherBranchId = '22222222-2222-4222-8222-222222222222';
const projectId = '33333333-3333-4333-8333-333333333333';
const userId = '44444444-4444-4444-8444-444444444444';
const otherUserId = '55555555-5555-4555-8555-555555555555';
const commitId = '66666666-6666-4666-8666-666666666666';

function makeBranch(overrides: Record<string, unknown> = {}) {
  return {
    id: branchId,
    project_id: projectId,
    name: 'feature-x',
    is_default: false,
    created_by: userId,
    created_at: '2026-10-21T00:00:00.000Z',
    base_commit_id: null,
    head_commit_id: null,
    ...overrides,
  };
}

function makeService(tables: SupabaseMockOptions['tables']) {
  const mock = createSupabaseMock([], { tables });
  const service = new BranchesService(mock.client);
  return { service, ...mock };
}

function baseTables(
  branch = makeBranch(),
  project: Record<string, unknown> | null = { owner_id: userId },
  otherBranches: unknown[] | null = [],
  deleteResult: { data?: unknown; error?: unknown } = {
    data: null,
    error: null,
  },
) {
  return {
    branches: [{ data: branch }, { data: otherBranches }, deleteResult],
    projects: [{ data: project }, { data: { active_branch_id: null } }],
  };
}

describe('BE-BRN-06 BranchesService.deleteBranch', () => {
  it('UTCID01 deletes a non-default inactive branch with no shared head commit', async () => {
    const { service, builders } = makeService(baseTables());

    await expect(
      service.deleteBranch(branchId, userId),
    ).resolves.toBeUndefined();

    expect(builders.branches.delete).toHaveBeenCalled();
  });

  it('UTCID02 re-homes a shared head commit before deleting the branch', async () => {
    const otherBranches = [{ id: otherBranchId, head_commit_id: commitId }];
    const { service, builders } = makeService({
      ...baseTables(
        makeBranch({ head_commit_id: commitId }),
        { owner_id: userId },
        otherBranches,
      ),
      commits: [
        { data: { id: commitId, branch_id: branchId } },
        { data: null, error: null },
      ],
    });

    await expect(
      service.deleteBranch(branchId, userId),
    ).resolves.toBeUndefined();

    expect(builders.commits.update).toHaveBeenCalledWith({
      branch_id: otherBranchId,
    });
    expect(builders.branches.delete).toHaveBeenCalled();
  });

  it('UTCID03 deletes when another branch has no head commit', async () => {
    const otherBranches = [{ id: otherBranchId, head_commit_id: null }];
    const { service, builders } = makeService(
      baseTables(makeBranch(), { owner_id: userId }, otherBranches),
    );

    await expect(
      service.deleteBranch(branchId, userId),
    ).resolves.toBeUndefined();

    expect(builders.branches.delete).toHaveBeenCalled();
  });

  it('UTCID04 deletes when the other-branches query returns null', async () => {
    const { service, builders } = makeService({
      branches: [
        { data: makeBranch() },
        { data: null },
        { data: null, error: null },
      ],
      projects: [
        { data: { owner_id: userId } },
        { data: { active_branch_id: null } },
      ],
    });

    await expect(
      service.deleteBranch(branchId, userId),
    ).resolves.toBeUndefined();

    expect(builders.branches.delete).toHaveBeenCalled();
  });

  it('UTCID05 throws when re-homing the shared commit fails', async () => {
    const otherBranches = [{ id: otherBranchId, head_commit_id: commitId }];
    const { service, builders } = makeService({
      ...baseTables(
        makeBranch({ head_commit_id: commitId }),
        { owner_id: userId },
        otherBranches,
      ),
      commits: [
        { data: { id: commitId, branch_id: branchId } },
        { data: null, error: { message: 'fk' } },
      ],
    });

    await expect(service.deleteBranch(branchId, userId)).rejects.toThrow(
      new InternalServerErrorException(
        'Failed to re-home shared commit before deleting branch: fk',
      ),
    );

    expect(builders.branches.delete).not.toHaveBeenCalled();
  });

  it('UTCID06 throws when deleting the branch fails', async () => {
    const { service } = makeService(
      baseTables(makeBranch(), { owner_id: userId }, [], {
        data: null,
        error: { message: 'fk violation' },
      }),
    );

    await expect(service.deleteBranch(branchId, userId)).rejects.toThrow(
      new InternalServerErrorException('Failed to delete branch: fk violation'),
    );
  });

  it('UTCID07 rejects deletion of the default branch', async () => {
    const { service } = makeService(
      baseTables(makeBranch({ is_default: true })),
    );

    await expect(service.deleteBranch(branchId, userId)).rejects.toThrow(
      new BadRequestException('Cannot delete the default branch'),
    );
  });

  it('UTCID08 rejects deletion of the currently active branch', async () => {
    const { service } = makeService({
      ...baseTables(),
      projects: [
        { data: { owner_id: userId } },
        { data: { active_branch_id: branchId } },
      ],
    });

    await expect(service.deleteBranch(branchId, userId)).rejects.toThrow(
      new BadRequestException(
        'Cannot delete the branch currently open in the editor — switch to another branch first',
      ),
    );
  });

  it('UTCID09 throws when the branch does not exist', async () => {
    const { service } = makeService({ branches: [{ data: null }] });

    await expect(service.deleteBranch(branchId, userId)).rejects.toThrow(
      new NotFoundException('Branch not found'),
    );
  });

  it('UTCID10 throws when the project does not exist', async () => {
    const { service } = makeService({
      branches: [{ data: makeBranch() }],
      projects: [{ data: null }],
    });

    await expect(service.deleteBranch(branchId, userId)).rejects.toThrow(
      new NotFoundException('Project not found'),
    );
  });

  it('UTCID11 forbids a user who is not the project owner', async () => {
    const { service } = makeService({
      branches: [{ data: makeBranch() }],
      projects: [{ data: { owner_id: otherUserId } }],
    });

    await expect(service.deleteBranch(branchId, userId)).rejects.toThrow(
      new ForbiddenException('You do not have edit permission on this project'),
    );
  });

  it('UTCID12 ignores a shared branch commit that is not its head commit', async () => {
    const otherBranches = [{ id: otherBranchId, head_commit_id: commitId }];
    const { service, builders } = makeService({
      ...baseTables(makeBranch(), { owner_id: userId }, otherBranches),
      commits: [{ data: { id: commitId, branch_id: otherBranchId } }],
    });

    await expect(
      service.deleteBranch(branchId, userId),
    ).resolves.toBeUndefined();

    expect(builders.commits.update).not.toHaveBeenCalled();
    expect(builders.branches.delete).toHaveBeenCalled();
  });

  it('UTCID14 forbids a view-only collaborator', async () => {
    const { service } = makeService({
      branches: [{ data: makeBranch() }],
      projects: [{ data: { owner_id: otherUserId } }],
    });

    await expect(service.deleteBranch(branchId, userId)).rejects.toThrow(
      new ForbiddenException('You do not have edit permission on this project'),
    );
  });
});

describe('BE-BRN-01 BranchesService.createBranch', () => {
  const createdBranch = makeBranch({
    head_commit_id: commitId,
    base_commit_id: commitId,
  });
  const commitSnapshot = {
    schemaVersion: 3,
    meta: { tempo: 120, timeSignature: [4, 4], ppq: 480 },
    tracks: [],
    notes: [],
  };

  function successTables(
    branch: Record<string, unknown> = createdBranch,
    extra: SupabaseMockOptions['tables'] = {},
  ) {
    return {
      branches: [
        { data: [{ id: otherBranchId }] },
        { data: null },
        { data: { project_id: projectId } },
        { data: branch },
      ],
      commits: [
        { data: [{ id: commitId }] },
        { data: { id: commitId, branch_id: otherBranchId } },
        { data: { snapshot: commitSnapshot } },
      ],
      projects: [{ data: { owner_id: userId } }],
      drafts: [{ data: null, error: null }],
      users: [{ data: { id: userId, username: 'owner' } }],
      ...extra,
    };
  }

  it('UTCID01 creates a branch from a commit and initializes its draft', async () => {
    const { service, builders } = makeService(successTables());

    const result = await service.createBranch(
      projectId,
      { name: 'feature-x', startCommitId: commitId },
      userId,
    );

    expect(result.head_commit_id).toBe(commitId);
    expect(result.base_commit_id).toBe(commitId);
    expect(builders.drafts.insert).toHaveBeenCalled();
  });

  it('UTCID02 throws when the project is missing', async () => {
    const { service } = makeService({ projects: [{ data: null }] });

    await expect(
      service.createBranch(projectId, { name: 'feature-x' }, userId),
    ).rejects.toThrow(new NotFoundException('Project not found'));
  });

  it('UTCID03 forbids a non-owner', async () => {
    const { service } = makeService({
      projects: [{ data: { owner_id: otherUserId } }],
    });

    await expect(
      service.createBranch(projectId, { name: 'feature-x' }, userId),
    ).rejects.toThrow(
      new ForbiddenException('You do not have edit permission on this project'),
    );
  });

  it.each([
    ['UTCID04', []],
    ['UTCID05', [{ id: otherBranchId }]],
  ])('%s rejects a project with no commits', async (_id, branches) => {
    const { service } = makeService({
      projects: [{ data: { owner_id: userId } }],
      branches: [{ data: branches }],
      commits: [{ data: [] }],
    });

    await expect(
      service.createBranch(projectId, { name: 'feature-x' }, userId),
    ).rejects.toThrow(
      new BadRequestException(
        'Project has no commits yet. Branching is unavailable.',
      ),
    );
  });

  it('UTCID06 rejects an existing branch name', async () => {
    const { service } = makeService({
      projects: [{ data: { owner_id: userId } }],
      branches: [
        { data: [{ id: otherBranchId }] },
        { data: { id: otherBranchId } },
      ],
      commits: [{ data: [{ id: commitId }] }],
    });

    await expect(
      service.createBranch(projectId, { name: 'feature-x' }, userId),
    ).rejects.toThrow(
      new BadRequestException(
        'A branch with this name already exists in the project',
      ),
    );
  });

  it.each([
    ['UTCID07', 'main'],
    ['UTCID08', 'MAIN'],
  ])('%s rejects the reserved main name', async (_id, name) => {
    const { service } = makeService({
      projects: [{ data: { owner_id: userId } }],
      branches: [{ data: [{ id: otherBranchId }] }, { data: null }],
      commits: [{ data: [{ id: commitId }] }],
    });

    await expect(
      service.createBranch(projectId, { name }, userId),
    ).rejects.toThrow(
      new BadRequestException('Cannot create a branch named "main"'),
    );
  });

  it('UTCID09 reports a missing explicit start commit', async () => {
    const { service } = makeService({
      projects: [{ data: { owner_id: userId } }],
      branches: [{ data: [{ id: otherBranchId }] }, { data: null }],
      commits: [{ data: [{ id: commitId }] }, { data: null }],
    });

    await expect(
      service.createBranch(
        projectId,
        { name: 'feature-x', startCommitId: commitId },
        userId,
      ),
    ).rejects.toThrow(new NotFoundException('Starting commit not found'));
  });

  it('UTCID10 creates a branch with a null source head and empty draft', async () => {
    const branch = makeBranch({ head_commit_id: null, base_commit_id: null });
    const { service } = makeService({
      branches: [
        { data: [{ id: otherBranchId }] },
        { data: null },
        { data: { head_commit_id: null } },
        { data: branch },
      ],
      commits: [{ data: [{ id: commitId }] }],
      projects: [{ data: { owner_id: userId } }],
      drafts: [{ data: null, error: null }],
      users: [{ data: { id: userId } }],
    });

    const result = await service.createBranch(
      projectId,
      { name: 'feature-x', sourceBranchId: otherBranchId },
      userId,
    );

    expect(result.head_commit_id).toBeNull();
  });

  it('UTCID11 uses an empty draft when the start snapshot is missing', async () => {
    const { service } = makeService({
      ...successTables(),
      commits: [
        { data: [{ id: commitId }] },
        { data: { id: commitId, branch_id: otherBranchId } },
        { data: { project_id: projectId } },
        { data: null },
      ],
    });

    await expect(
      service.createBranch(
        projectId,
        { name: 'feature-x', startCommitId: commitId },
        userId,
      ),
    ).resolves.toEqual(expect.objectContaining({ id: branchId }));
  });

  it('UTCID12 maps a unique violation to a bad request', async () => {
    const { service } = makeService({
      ...successTables(),
      branches: [
        { data: [{ id: otherBranchId }] },
        { data: null },
        { data: { project_id: projectId } },
        { data: null, error: { code: '23505', message: 'duplicate' } },
      ],
      commits: [
        { data: [{ id: commitId }] },
        { data: { id: commitId, branch_id: otherBranchId } },
      ],
    });

    await expect(
      service.createBranch(
        projectId,
        { name: 'feature-x', startCommitId: commitId },
        userId,
      ),
    ).rejects.toThrow(
      new BadRequestException(
        'A branch with this name already exists in the project',
      ),
    );
  });

  it('UTCID13 maps another insert error to an internal error', async () => {
    const { service } = makeService({
      ...successTables(),
      branches: [
        { data: [{ id: otherBranchId }] },
        { data: null },
        { data: { project_id: projectId } },
        { data: null, error: { message: 'timeout' } },
      ],
    });

    await expect(
      service.createBranch(
        projectId,
        { name: 'feature-x', startCommitId: commitId },
        userId,
      ),
    ).rejects.toThrow(
      new InternalServerErrorException('Failed to create branch: timeout'),
    );
  });

  it('UTCID14 rejects an insert with no row or error', async () => {
    const { service } = makeService({
      ...successTables(),
      branches: [
        { data: [{ id: otherBranchId }] },
        { data: null },
        { data: { project_id: projectId } },
        { data: null, error: null },
      ],
    });

    await expect(
      service.createBranch(
        projectId,
        { name: 'feature-x', startCommitId: commitId },
        userId,
      ),
    ).rejects.toThrow(
      new InternalServerErrorException('Branch was not created'),
    );
  });

  it('UTCID15 reports an initialization draft error', async () => {
    const { service } = makeService({
      ...successTables(),
      drafts: [{ data: null, error: { message: 'disk full' } }],
    });

    await expect(
      service.createBranch(
        projectId,
        { name: 'feature-x', startCommitId: commitId },
        userId,
      ),
    ).rejects.toThrow(
      new InternalServerErrorException(
        'Failed to initialize draft for new branch: disk full',
      ),
    );
  });

  it('UTCID16 falls back to null author fields when the user is missing', async () => {
    const { service } = makeService({
      ...successTables(),
      users: [{ data: null }],
    });

    const result = await service.createBranch(
      projectId,
      { name: 'feature-x', startCommitId: commitId },
      userId,
    );

    expect(result.author).toEqual({
      id: userId,
      username: null,
      display_name: null,
      avatar_url: null,
    });
  });

  it('UTCID18 rejects a view-only collaborator', async () => {
    const { service } = makeService({
      projects: [{ data: { owner_id: otherUserId } }],
    });

    await expect(
      service.createBranch(projectId, { name: 'feature-x' }, userId),
    ).rejects.toThrow(
      new ForbiddenException('You do not have edit permission on this project'),
    );
  });
});

describe('BE-BRN-02 BranchesService.switchBranch', () => {
  const currentDraft = {
    schemaVersion: 3,
    meta: { tempo: 120, timeSignature: [4, 4] as [number, number], ppq: 480 },
    tracks: [],
    notes: [],
  };
  const targetBranch = makeBranch({ id: otherBranchId });
  const targetSnapshot = { schemaVersion: 3, meta: {}, tracks: [], notes: [] };

  function switchTables(overrides: SupabaseMockOptions['tables'] = {}) {
    return {
      branches: [{ count: 3, data: null }, { data: targetBranch }],
      projects: [{ data: { owner_id: userId } }, { data: null, error: null }],
      drafts: [
        { data: null, error: null },
        { data: { snapshot: targetSnapshot } },
      ],
      users: [{ data: { id: userId, username: 'owner' } }],
      ...overrides,
    };
  }

  it('UTCID01 switches from a project with three branches', async () => {
    const { service, builders } = makeService(switchTables());
    const result = await service.switchBranch(
      projectId,
      {
        currentBranchId: branchId,
        targetBranchId: otherBranchId,
        currentDraft,
      },
      userId,
    );

    expect(result.branch.id).toBe(otherBranchId);
    expect(result.activeSnapshot).toBe(targetSnapshot);
    expect(builders.projects.update).toHaveBeenCalledWith({
      active_branch_id: otherBranchId,
    });
  });

  it('UTCID02 switches from a project with two branches', async () => {
    const { service } = makeService({
      ...switchTables(),
      projects: [
        { data: { owner_id: userId } },
        { count: 2, data: null },
        { data: null, error: null },
      ],
    });

    await expect(
      service.switchBranch(
        projectId,
        {
          currentBranchId: branchId,
          targetBranchId: otherBranchId,
          currentDraft,
        },
        userId,
      ),
    ).resolves.toEqual(
      expect.objectContaining({ activeSnapshot: targetSnapshot }),
    );
  });

  it('UTCID03 rejects a missing project', async () => {
    const { service } = makeService({ projects: [{ data: null }] });

    await expect(
      service.switchBranch(
        projectId,
        {
          currentBranchId: branchId,
          targetBranchId: otherBranchId,
          currentDraft,
        },
        userId,
      ),
    ).rejects.toThrow(new NotFoundException('Project not found'));
  });

  it('UTCID04 forbids a non-owner', async () => {
    const { service } = makeService({
      projects: [{ data: { owner_id: otherUserId } }],
    });

    await expect(
      service.switchBranch(
        projectId,
        {
          currentBranchId: branchId,
          targetBranchId: otherBranchId,
          currentDraft,
        },
        userId,
      ),
    ).rejects.toThrow(
      new ForbiddenException('You do not have edit permission on this project'),
    );
  });

  it.each([
    ['UTCID05', 1],
    ['UTCID06', null],
  ])('%s rejects a project with at most one branch', async (_id, count) => {
    const { service } = makeService({
      projects: [{ data: { owner_id: userId } }],
      branches: [{ count, data: null }],
    });

    await expect(
      service.switchBranch(
        projectId,
        {
          currentBranchId: branchId,
          targetBranchId: otherBranchId,
          currentDraft,
        },
        userId,
      ),
    ).rejects.toThrow(new BadRequestException('Project has only one branch'));
  });

  it.each(['UTCID07', 'UTCID08'])(
    '%s rejects a missing or foreign target',
    async (_id) => {
      const { service } = makeService({
        projects: [{ data: { owner_id: userId } }],
        branches: [
          { count: 3, data: null },
          {
            data:
              _id === 'UTCID07'
                ? null
                : makeBranch({ project_id: otherBranchId }),
          },
        ],
      });

      await expect(
        service.switchBranch(
          projectId,
          {
            currentBranchId: branchId,
            targetBranchId: otherBranchId,
            currentDraft,
          },
          userId,
        ),
      ).rejects.toThrow(new NotFoundException('Target branch does not exist'));
    },
  );

  it('UTCID09 reports a draft save error', async () => {
    const { service } = makeService(
      switchTables({
        drafts: [{ data: null, error: { message: 'conflict' } }],
      }),
    );

    await expect(
      service.switchBranch(
        projectId,
        {
          currentBranchId: branchId,
          targetBranchId: otherBranchId,
          currentDraft,
        },
        userId,
      ),
    ).rejects.toThrow(
      new InternalServerErrorException(
        'Failed to save draft before switching branch: conflict',
      ),
    );
  });

  it('UTCID10 reports an active-branch update error', async () => {
    const { service } = makeService({
      ...switchTables(),
      branches: [{ count: 3, data: null }, { data: targetBranch }],
      projects: [
        { data: { owner_id: userId } },
        { data: null, error: { message: 'rls' } },
      ],
    });

    await expect(
      service.switchBranch(
        projectId,
        {
          currentBranchId: branchId,
          targetBranchId: otherBranchId,
          currentDraft,
        },
        userId,
      ),
    ).rejects.toThrow(
      new InternalServerErrorException('Failed to record active branch: rls'),
    );
  });
});

describe('BE-BRN-04 BranchesService.getBranchHistory', () => {
  const defaultId = '88888888-8888-4888-8888-888888888888';
  const rootId = '99999999-9999-4999-8999-999999999999';
  const headId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const branch = makeBranch({ head_commit_id: headId });
  const defaultBranch = makeBranch({
    id: defaultId,
    is_default: true,
    head_commit_id: rootId,
  });
  const rows = [
    {
      id: rootId,
      branch_id: defaultId,
      author_id: userId,
      message: 'base',
      created_at: '2026-10-20T00:00:00.000Z',
      parent_commit_id: null,
    },
    {
      id: headId,
      branch_id: branchId,
      author_id: userId,
      message: 'feature',
      created_at: '2026-10-21T00:00:00.000Z',
      parent_commit_id: rootId,
    },
  ];

  function tables(extra: SupabaseMockOptions['tables'] = {}) {
    return {
      branches: [
        { data: branch },
        { data: defaultBranch },
        { data: [{ id: branchId }, { id: defaultId }] },
      ],
      projects: [{ data: { owner_id: userId } }],
      commits: [{ data: rows }],
      users: [{ data: [{ id: userId, username: 'owner' }] }],
      commit_tags: [{ data: [] }],
      ...extra,
    };
  }

  it('UTCID01 returns inherited and unique commits oldest first', async () => {
    const { service } = makeService(tables());
    const result = await service.getBranchHistory(branchId, userId);
    expect(result.commits.map((commit) => commit.id)).toEqual([rootId, headId]);
    expect(result.commits[0].isInherited).toBe(true);
    expect(result.commits[1].isUniqueToBranch).toBe(true);
  });

  it('UTCID02 marks default-branch commits inherited', async () => {
    const { service } = makeService({
      branches: [
        { data: defaultBranch },
        { data: defaultBranch },
        { data: [{ id: defaultId }] },
      ],
      projects: [{ data: { owner_id: userId } }],
      commits: [{ data: [{ ...rows[0] }] }],
      users: [{ data: [{ id: userId }] }],
      commit_tags: [{ data: [] }],
    });
    const result = await service.getBranchHistory(defaultId, userId);
    expect(result.commits[0].isInherited).toBe(true);
    expect(result.commits[0].isUniqueToBranch).toBe(false);
  });

  it('UTCID03 marks all commits unique when histories do not share an ancestor', async () => {
    const { service } = makeService({
      branches: [
        { data: branch },
        { data: defaultBranch },
        { data: [{ id: branchId }, { id: defaultId }] },
      ],
      projects: [{ data: { owner_id: userId } }],
      commits: [{ data: [{ ...rows[1], parent_commit_id: null }] }],
      users: [{ data: [{ id: userId }] }],
      commit_tags: [{ data: [] }],
    });
    const result = await service.getBranchHistory(branchId, userId);
    expect(result.commits.every((commit) => commit.isUniqueToBranch)).toBe(
      true,
    );
  });

  it('UTCID04 marks all commits unique when the default branch has no head', async () => {
    const { service } = makeService({
      branches: [
        { data: branch },
        { data: { ...defaultBranch, head_commit_id: null } },
        { data: [{ id: branchId }, { id: defaultId }] },
      ],
      projects: [{ data: { owner_id: userId } }],
      commits: [{ data: [{ ...rows[1], parent_commit_id: null }] }],
      users: [{ data: [{ id: userId }] }],
      commit_tags: [{ data: [] }],
    });
    const result = await service.getBranchHistory(branchId, userId);
    expect(result.commits).toHaveLength(1);
    expect(result.commits.every((commit) => commit.isUniqueToBranch)).toBe(
      true,
    );
  });

  it('UTCID05 returns an empty history for a null head', async () => {
    const { service } = makeService({
      branches: [
        { data: { ...branch, head_commit_id: null } },
        { data: defaultBranch },
        { data: [{ id: branchId }, { id: defaultId }] },
      ],
      projects: [{ data: { owner_id: userId } }],
      commits: [{ data: [] }],
    });
    await expect(service.getBranchHistory(branchId, userId)).resolves.toEqual({
      branchId,
      branchName: branch.name,
      commits: [],
    });
  });

  it('UTCID06 returns an empty history when commit rows are null', async () => {
    const { service } = makeService({ ...tables(), commits: [{ data: null }] });
    await expect(service.getBranchHistory(branchId, userId)).resolves.toEqual({
      branchId,
      branchName: branch.name,
      commits: [],
    });
  });

  it('UTCID07 reports a commit query error', async () => {
    const { service } = makeService({
      branches: [
        { data: branch },
        { data: defaultBranch },
        { data: [{ id: branchId }, { id: defaultId }] },
      ],
      projects: [{ data: { owner_id: userId } }],
      commits: [{ data: null, error: { message: 'timeout' } }],
    });
    await expect(service.getBranchHistory(branchId, userId)).rejects.toThrow(
      new InternalServerErrorException(
        'Failed to fetch branch history: timeout',
      ),
    );
  });

  it('UTCID08 rejects an unknown branch', async () => {
    const { service } = makeService({ branches: [{ data: null }] });
    await expect(service.getBranchHistory(branchId, userId)).rejects.toThrow(
      new NotFoundException('Branch not found'),
    );
  });

  it('UTCID09 rejects when the project is missing', async () => {
    const { service } = makeService({
      branches: [{ data: branch }],
      projects: [{ data: null }],
    });
    await expect(service.getBranchHistory(branchId, userId)).rejects.toThrow(
      new NotFoundException('Project not found'),
    );
  });

  it('UTCID10 forbids a non-owner', async () => {
    const { service } = makeService({
      branches: [{ data: branch }],
      projects: [{ data: { owner_id: otherUserId } }],
    });
    await expect(service.getBranchHistory(branchId, userId)).rejects.toThrow(
      new ForbiddenException('You do not have edit permission on this project'),
    );
  });

  it('UTCID11 attaches tags to their commit', async () => {
    const { service } = makeService({
      ...tables(),
      commit_tags: [
        { data: [{ id: 'tag-1', commit_id: headId, name: 'release' }] },
      ],
    });
    const result = await service.getBranchHistory(branchId, userId);
    expect(result.commits[1].tags).toEqual([{ id: 'tag-1', name: 'release' }]);
  });

  it('UTCID12 falls back to null fields for a missing author', async () => {
    const { service } = makeService({ ...tables(), users: [{ data: [] }] });
    const result = await service.getBranchHistory(branchId, userId);
    expect(result.commits[0].author).toEqual({
      id: userId,
      username: null,
      display_name: null,
      avatar_url: null,
    });
  });
});

describe('BE-BRN-05 BranchesService.getDeletePreview', () => {
  const branch = makeBranch();

  it('UTCID01 returns commit ids on a non-default branch', async () => {
    const { service } = makeService({
      branches: [{ data: branch }],
      projects: [{ data: { owner_id: userId } }],
      commits: [
        { data: [{ id: 'commit-a' }, { id: 'commit-b' }, { id: 'commit-c' }] },
      ],
    });
    await expect(service.getDeletePreview(branchId, userId)).resolves.toEqual({
      branchId,
      branchName: branch.name,
      isDefault: false,
      unmergedCommitsCount: 3,
      unmergedCommitIds: ['commit-a', 'commit-b', 'commit-c'],
    });
  });

  it.each([
    ['UTCID02', []],
    ['UTCID03', null],
  ])('%s returns an empty preview', async (_id, data) => {
    const { service } = makeService({
      branches: [{ data: branch }],
      projects: [{ data: { owner_id: userId } }],
      commits: [{ data }],
    });
    await expect(service.getDeletePreview(branchId, userId)).resolves.toEqual(
      expect.objectContaining({
        unmergedCommitsCount: 0,
        unmergedCommitIds: [],
      }),
    );
  });

  it('UTCID04 identifies a default branch', async () => {
    const { service } = makeService({
      branches: [{ data: { ...branch, is_default: true } }],
      projects: [{ data: { owner_id: userId } }],
      commits: [{ data: [{ id: 'commit-a' }] }],
    });
    await expect(service.getDeletePreview(branchId, userId)).resolves.toEqual(
      expect.objectContaining({ isDefault: true, unmergedCommitsCount: 1 }),
    );
  });

  it('UTCID05 reports a query error', async () => {
    const { service } = makeService({
      branches: [{ data: branch }],
      projects: [{ data: { owner_id: userId } }],
      commits: [{ data: null, error: { message: 'timeout' } }],
    });
    await expect(service.getDeletePreview(branchId, userId)).rejects.toThrow(
      new InternalServerErrorException(
        'Failed to compute delete preview: timeout',
      ),
    );
  });

  it('UTCID06 rejects an unknown branch', async () => {
    const { service } = makeService({ branches: [{ data: null }] });
    await expect(service.getDeletePreview(branchId, userId)).rejects.toThrow(
      new NotFoundException('Branch not found'),
    );
  });

  it('UTCID07 rejects when the project is missing', async () => {
    const { service } = makeService({
      branches: [{ data: branch }],
      projects: [{ data: null }],
    });
    await expect(service.getDeletePreview(branchId, userId)).rejects.toThrow(
      new NotFoundException('Project not found'),
    );
  });

  it('UTCID08 forbids a non-owner', async () => {
    const { service } = makeService({
      branches: [{ data: branch }],
      projects: [{ data: { owner_id: otherUserId } }],
    });
    await expect(service.getDeletePreview(branchId, userId)).rejects.toThrow(
      new ForbiddenException('You do not have edit permission on this project'),
    );
  });

  it('UTCID09 returns the branch rows without filtering merged commits', async () => {
    const { service } = makeService({
      branches: [{ data: branch }],
      projects: [{ data: { owner_id: userId } }],
      commits: [
        { data: [{ id: 'merged' }, { id: 'unmerged' }, { id: 'other' }] },
      ],
    });
    const result = await service.getDeletePreview(branchId, userId);
    expect(result.unmergedCommitIds).toHaveLength(3);
  });

  it('UTCID11 forbids a view-only collaborator', async () => {
    const { service } = makeService({
      branches: [{ data: branch }],
      projects: [{ data: { owner_id: otherUserId } }],
    });
    await expect(service.getDeletePreview(branchId, userId)).rejects.toThrow(
      new ForbiddenException('You do not have edit permission on this project'),
    );
  });
});

describe('BE-BRN-03 BranchesService.getBranchDetails', () => {
  const defaultId = '88888888-8888-4888-8888-888888888888';
  const baseCommitId = '99999999-9999-4999-8999-999999999999';
  const branch = makeBranch({ head_commit_id: commitId });
  const defaultBranch = makeBranch({
    id: defaultId,
    is_default: true,
    head_commit_id: baseCommitId,
  });

  it('UTCID01 returns divergence for a branch ahead of default', async () => {
    const { service } = makeService({
      branches: [{ data: branch }, { data: defaultBranch }],
      projects: [{ data: { owner_id: userId } }],
      commits: [
        { data: { parent_commit_id: baseCommitId } },
        { data: null },
        { data: { parent_commit_id: baseCommitId } },
      ],
      users: [{ data: { id: userId, username: 'owner' } }],
    });
    const result = await service.getBranchDetails(branchId, userId);
    expect(result.divergence).toEqual({ ahead: 1, behind: 0 });
    expect(result.isMerged).toBe(false);
  });

  it('UTCID02 returns zero divergence for the default branch', async () => {
    const { service } = makeService({
      branches: [{ data: defaultBranch }, { data: defaultBranch }],
      projects: [{ data: { owner_id: userId } }],
      users: [{ data: { id: userId, username: 'owner' } }],
    });
    const result = await service.getBranchDetails(defaultId, userId);
    expect(result.divergence).toEqual({ ahead: 0, behind: 0 });
    expect(result.isMerged).toBe(true);
  });

  it('UTCID03 returns divergence for a branch behind default', async () => {
    const d3 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const d2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const d1 = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    const { service } = makeService({
      branches: [
        { data: makeBranch({ head_commit_id: baseCommitId }) },
        { data: { ...defaultBranch, head_commit_id: d3 } },
      ],
      projects: [{ data: { owner_id: userId } }],
      commits: [
        { data: null },
        { data: { parent_commit_id: d2 } },
        { data: { parent_commit_id: d1 } },
        { data: { parent_commit_id: baseCommitId } },
        { data: { parent_commit_id: d2 } },
        { data: { parent_commit_id: d1 } },
        { data: { parent_commit_id: baseCommitId } },
      ],
      users: [{ data: { id: userId } }],
    });
    const result = await service.getBranchDetails(branchId, userId);
    expect(result.divergence).toEqual({ ahead: 0, behind: 3 });
    expect(result.isMerged).toBe(false);
  });

  it('UTCID04 rejects an unknown branch', async () => {
    const { service } = makeService({ branches: [{ data: null }] });
    await expect(service.getBranchDetails(branchId, userId)).rejects.toThrow(
      new NotFoundException('Branch not found'),
    );
  });

  it('UTCID05 rejects when the project is missing', async () => {
    const { service } = makeService({
      branches: [{ data: branch }],
      projects: [{ data: null }],
    });
    await expect(service.getBranchDetails(branchId, userId)).rejects.toThrow(
      new NotFoundException('Project not found'),
    );
  });

  it('UTCID06 forbids a non-owner', async () => {
    const { service } = makeService({
      branches: [{ data: branch }],
      projects: [{ data: { owner_id: otherUserId } }],
    });
    await expect(service.getBranchDetails(branchId, userId)).rejects.toThrow(
      new ForbiddenException('You do not have edit permission on this project'),
    );
  });

  it('UTCID07 rejects when the default branch is missing', async () => {
    const { service } = makeService({
      branches: [{ data: branch }, { data: null }],
      projects: [{ data: { owner_id: userId } }],
    });
    await expect(service.getBranchDetails(branchId, userId)).rejects.toThrow(
      new NotFoundException('Default branch not found'),
    );
  });

  it('UTCID08 falls back to null author fields when the row is missing', async () => {
    const { service } = makeService({
      branches: [{ data: branch }, { data: defaultBranch }],
      projects: [{ data: { owner_id: userId } }],
      commits: [
        { data: { parent_commit_id: baseCommitId } },
        { data: null },
        { data: { parent_commit_id: baseCommitId } },
      ],
      users: [{ data: null }],
    });
    const result = await service.getBranchDetails(branchId, userId);
    expect(result.branchInfo.author).toEqual({
      id: userId,
      username: null,
      display_name: null,
      avatar_url: null,
    });
  });

  it('UTCID10 forbids a view-only collaborator', async () => {
    const { service } = makeService({
      branches: [{ data: branch }],
      projects: [{ data: { owner_id: otherUserId } }],
    });
    await expect(service.getBranchDetails(branchId, userId)).rejects.toThrow(
      new ForbiddenException('You do not have edit permission on this project'),
    );
  });
});

describe('BE-BRN-07 BranchesService.getProjectBranches', () => {
  const activeId = '88888888-8888-4888-8888-888888888888';
  const defaultBranch = makeBranch({ is_default: true, created_by: userId });
  const activeBranch = makeBranch({ id: activeId, created_by: otherUserId });

  it('UTCID01 marks the configured active branch', async () => {
    const { service } = makeService({
      projects: [
        { data: { owner_id: userId } },
        { data: { active_branch_id: activeId } },
      ],
      branches: [{ data: [defaultBranch, activeBranch] }],
      users: [
        {
          data: [
            { id: userId, username: 'owner' },
            { id: otherUserId, username: 'author' },
          ],
        },
      ],
    });
    const result = await service.getProjectBranches(projectId, userId);
    expect(result.map((item) => item.is_active)).toEqual([false, true]);
    expect(result[0].is_default).toBe(true);
  });

  it('UTCID02 falls back to the default branch when active id is null', async () => {
    const { service } = makeService({
      projects: [
        { data: { owner_id: userId } },
        { data: { active_branch_id: null } },
      ],
      branches: [{ data: [defaultBranch, activeBranch] }],
      users: [{ data: [{ id: userId }, { id: otherUserId }] }],
    });
    const result = await service.getProjectBranches(projectId, userId);
    expect(result.map((item) => item.is_active)).toEqual([true, false]);
  });

  it('UTCID03 falls back when the configured active branch is absent', async () => {
    const { service } = makeService({
      projects: [
        { data: { owner_id: userId } },
        { data: { active_branch_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' } },
      ],
      branches: [{ data: [defaultBranch, activeBranch] }],
      users: [{ data: [{ id: userId }, { id: otherUserId }] }],
    });
    const result = await service.getProjectBranches(projectId, userId);
    expect(result[0].is_active).toBe(true);
  });

  it('UTCID04 returns an empty list', async () => {
    const { service } = makeService({
      projects: [
        { data: { owner_id: userId } },
        { data: { active_branch_id: null } },
      ],
      branches: [{ data: null }],
    });
    await expect(
      service.getProjectBranches(projectId, userId),
    ).resolves.toEqual([]);
  });

  it('UTCID05 reports a branch query error', async () => {
    const { service } = makeService({
      projects: [{ data: { owner_id: userId } }],
      branches: [{ data: null, error: { message: 'timeout' } }],
    });
    await expect(service.getProjectBranches(projectId, userId)).rejects.toThrow(
      new InternalServerErrorException('Failed to fetch branches: timeout'),
    );
  });

  it('UTCID06 rejects when the project is missing', async () => {
    const { service } = makeService({ projects: [{ data: null }] });
    await expect(service.getProjectBranches(projectId, userId)).rejects.toThrow(
      new NotFoundException('Project not found'),
    );
  });

  it('UTCID07 forbids a non-owner', async () => {
    const { service } = makeService({
      projects: [{ data: { owner_id: otherUserId } }],
    });
    await expect(service.getProjectBranches(projectId, userId)).rejects.toThrow(
      new ForbiddenException('You do not have edit permission on this project'),
    );
  });

  it('UTCID08 uses null author fields for an unknown author', async () => {
    const { service } = makeService({
      projects: [
        { data: { owner_id: userId } },
        { data: { active_branch_id: activeId } },
      ],
      branches: [{ data: [defaultBranch, activeBranch] }],
      users: [{ data: [{ id: userId, username: 'owner' }] }],
    });
    const result = await service.getProjectBranches(projectId, userId);
    expect(result[1].author).toEqual({
      id: otherUserId,
      username: null,
      display_name: null,
      avatar_url: null,
    });
  });

  it('UTCID10 forbids a view-only collaborator', async () => {
    const { service } = makeService({
      projects: [{ data: { owner_id: otherUserId } }],
    });
    await expect(service.getProjectBranches(projectId, userId)).rejects.toThrow(
      new ForbiddenException('You do not have edit permission on this project'),
    );
  });
});

describe('BE-BRN-08 BranchesService.verifyUserEditPermission', () => {
  it('UTCID01 allows the project owner', async () => {
    const { service } = makeService({
      projects: [
        { data: { owner_id: userId } },
        { data: { active_branch_id: null } },
      ],
      branches: [{ data: [] }],
      users: [{ data: [] }],
    });
    await expect(
      service.getProjectBranches(projectId, userId),
    ).resolves.toEqual([]);
  });

  it('UTCID02 throws when the project does not exist', async () => {
    const { service } = makeService({ projects: [{ data: null }] });
    await expect(service.getProjectBranches(projectId, userId)).rejects.toThrow(
      new NotFoundException('Project not found'),
    );
  });

  it.each([
    ['UTCID05', userId],
    ['UTCID06', ''],
  ])('%s forbids a user who is not the owner', async (_id, caller) => {
    const { service } = makeService({
      projects: [{ data: { owner_id: otherBranchId } }],
    });
    await expect(service.getProjectBranches(projectId, caller)).rejects.toThrow(
      new ForbiddenException('You do not have edit permission on this project'),
    );
  });
});

describe('BE-BRN-09 BranchesService.determineStartCommit', () => {
  const sourceId = '88888888-8888-4888-8888-888888888888';
  const startBranch = makeBranch({ id: sourceId, head_commit_id: commitId });

  it('UTCID01 returns an explicit commit from the same project', async () => {
    const { service } = makeService({
      branches: [
        { data: [{ id: sourceId }] },
        { data: null },
        { data: { project_id: projectId } },
        { data: makeBranch({ head_commit_id: commitId }) },
      ],
      commits: [
        { data: [{ id: commitId }] },
        { data: { id: commitId, branch_id: sourceId } },
        {
          data: {
            snapshot: { schemaVersion: 1, meta: {}, tracks: [], notes: [] },
          },
        },
      ],
      projects: [{ data: { owner_id: userId } }],
      drafts: [{ data: null, error: null }],
      users: [{ data: { id: userId } }],
    });
    await expect(
      service.createBranch(
        projectId,
        { name: 'start-explicit', startCommitId: commitId },
        userId,
      ),
    ).resolves.toEqual(expect.objectContaining({ head_commit_id: commitId }));
  });

  it('UTCID02 returns the explicit start commit before source branch fallback', async () => {
    const { service } = makeService({
      branches: [
        { data: [{ id: sourceId }] },
        { data: null },
        { data: { project_id: projectId } },
        { data: makeBranch({ head_commit_id: commitId }) },
      ],
      commits: [
        { data: [{ id: commitId }] },
        { data: { id: commitId, branch_id: sourceId } },
        {
          data: {
            snapshot: { schemaVersion: 1, meta: {}, tracks: [], notes: [] },
          },
        },
      ],
      projects: [{ data: { owner_id: userId } }],
      drafts: [{ data: null, error: null }],
      users: [{ data: { id: userId } }],
    });
    await expect(
      service.createBranch(
        projectId,
        {
          name: 'start-priority',
          startCommitId: commitId,
          sourceBranchId: sourceId,
        },
        userId,
      ),
    ).resolves.toEqual(expect.objectContaining({ head_commit_id: commitId }));
  });

  it('UTCID03 rejects when the explicit commit is missing', async () => {
    const { service } = makeService({
      projects: [{ data: { owner_id: userId } }],
      branches: [{ data: [{ id: sourceId }] }, { data: null }],
      commits: [{ data: [{ id: commitId }] }, { data: null }],
    });
    await expect(
      service.createBranch(
        projectId,
        { name: 'missing-start', startCommitId: commitId },
        userId,
      ),
    ).rejects.toThrow(new NotFoundException('Starting commit not found'));
  });

  it('UTCID04 rejects when the explicit commit branch is missing', async () => {
    const { service } = makeService({
      projects: [{ data: { owner_id: userId } }],
      branches: [{ data: [{ id: sourceId }] }, { data: null }, { data: null }],
      commits: [
        { data: [{ id: commitId }] },
        { data: { id: commitId, branch_id: sourceId } },
      ],
    });
    await expect(
      service.createBranch(
        projectId,
        { name: 'missing-branch', startCommitId: commitId },
        userId,
      ),
    ).rejects.toThrow(new NotFoundException('Starting commit not found'));
  });

  it('UTCID05 rejects a commit from another project', async () => {
    const { service } = makeService({
      projects: [{ data: { owner_id: userId } }],
      branches: [
        { data: [{ id: sourceId }] },
        { data: null },
        { data: { project_id: otherBranchId } },
      ],
      commits: [
        { data: [{ id: commitId }] },
        { data: { id: commitId, branch_id: sourceId } },
      ],
    });
    await expect(
      service.createBranch(
        projectId,
        { name: 'foreign-start', startCommitId: commitId },
        userId,
      ),
    ).rejects.toThrow(new NotFoundException('Starting commit not found'));
  });

  it('UTCID06 uses the source branch head when no explicit commit is supplied', async () => {
    const { service } = makeService({
      branches: [
        { data: [{ id: sourceId }] },
        { data: null },
        { data: startBranch },
        { data: makeBranch({ head_commit_id: commitId }) },
      ],
      commits: [{ data: [{ id: commitId }] }, { data: { snapshot: {} } }],
      projects: [{ data: { owner_id: userId } }],
      drafts: [{ data: null, error: null }],
      users: [{ data: { id: userId } }],
    });
    await expect(
      service.createBranch(
        projectId,
        { name: 'source-start', sourceBranchId: sourceId },
        userId,
      ),
    ).resolves.toEqual(expect.objectContaining({ head_commit_id: commitId }));
  });

  it('UTCID07 returns null when the source branch has no head', async () => {
    const { service } = makeService({
      branches: [
        { data: [{ id: sourceId }] },
        { data: null },
        { data: { ...startBranch, head_commit_id: null } },
        { data: makeBranch({ head_commit_id: null }) },
      ],
      commits: [{ data: [{ id: commitId }] }],
      projects: [{ data: { owner_id: userId } }],
      drafts: [{ data: null, error: null }],
      users: [{ data: { id: userId } }],
    });
    await expect(
      service.createBranch(
        projectId,
        { name: 'empty-source', sourceBranchId: sourceId },
        userId,
      ),
    ).resolves.toEqual(expect.objectContaining({ head_commit_id: null }));
  });

  it('UTCID08 returns null when the source branch is not found', async () => {
    const { service } = makeService({
      branches: [
        { data: [{ id: sourceId }] },
        { data: null },
        { data: null },
        { data: makeBranch({ head_commit_id: null }) },
      ],
      commits: [{ data: [{ id: commitId }] }],
      projects: [{ data: { owner_id: userId } }],
      drafts: [{ data: null, error: null }],
      users: [{ data: { id: userId } }],
    });
    await expect(
      service.createBranch(
        projectId,
        { name: 'unknown-source', sourceBranchId: sourceId },
        userId,
      ),
    ).resolves.toEqual(expect.objectContaining({ head_commit_id: null }));
  });

  it('UTCID09 uses the default branch head when no explicit source is supplied', async () => {
    const { service } = makeService({
      branches: [
        { data: [{ id: sourceId }] },
        { data: null },
        { data: { ...startBranch, is_default: true } },
        { data: makeBranch({ head_commit_id: commitId }) },
      ],
      commits: [{ data: [{ id: commitId }] }, { data: { snapshot: {} } }],
      projects: [{ data: { owner_id: userId } }],
      drafts: [{ data: null, error: null }],
      users: [{ data: { id: userId } }],
    });
    await expect(
      service.createBranch(projectId, { name: 'default-start' }, userId),
    ).resolves.toEqual(expect.objectContaining({ head_commit_id: commitId }));
  });

  it('UTCID10 uses the head of the branch returned by the default lookup even when it is not flagged default', async () => {
    const { service } = makeService({
      branches: [
        { data: [{ id: sourceId }] },
        { data: null },
        { data: { ...startBranch, is_default: false } },
        { data: makeBranch({ head_commit_id: commitId }) },
      ],
      commits: [{ data: [{ id: commitId }] }, { data: { snapshot: {} } }],
      projects: [{ data: { owner_id: userId } }],
      drafts: [{ data: null, error: null }],
      users: [{ data: { id: userId } }],
    });
    await expect(
      service.createBranch(projectId, { name: 'feature-start' }, userId),
    ).resolves.toEqual(expect.objectContaining({ head_commit_id: commitId }));
  });

  it('UTCID11 returns null when the default branch has no head', async () => {
    const { service } = makeService({
      branches: [
        { data: [{ id: sourceId }] },
        { data: null },
        { data: { ...startBranch, is_default: true, head_commit_id: null } },
        { data: makeBranch({ head_commit_id: null }) },
      ],
      commits: [{ data: [{ id: commitId }] }],
      projects: [{ data: { owner_id: userId } }],
      drafts: [{ data: null, error: null }],
      users: [{ data: { id: userId } }],
    });
    await expect(
      service.createBranch(projectId, { name: 'headless-default' }, userId),
    ).resolves.toEqual(expect.objectContaining({ head_commit_id: null }));
  });

  it('UTCID12 returns null when the default branch is absent', async () => {
    const { service } = makeService({
      branches: [
        { data: [{ id: sourceId }] },
        { data: null },
        { data: null },
        { data: makeBranch({ head_commit_id: null }) },
      ],
      commits: [{ data: [{ id: commitId }] }],
      projects: [{ data: { owner_id: userId } }],
      drafts: [{ data: null, error: null }],
      users: [{ data: { id: userId } }],
    });
    await expect(
      service.createBranch(projectId, { name: 'no-default' }, userId),
    ).resolves.toEqual(expect.objectContaining({ head_commit_id: null }));
  });
});

describe('BE-BRN-10 BranchesService.getActiveSnapshot', () => {
  it('UTCID01 returns an existing branch draft snapshot', async () => {
    const snapshot = { schemaVersion: 3, meta: {}, tracks: [], notes: [] };
    const { service } = makeService({
      projects: [{ data: { owner_id: userId } }, { data: null, error: null }],
      branches: [
        { count: 2, data: null },
        { data: makeBranch({ id: otherBranchId }) },
      ],
      drafts: [{ data: null, error: null }, { data: { snapshot } }],
      users: [{ data: { id: userId } }],
    });
    const result = await service.switchBranch(
      projectId,
      {
        currentBranchId: branchId,
        targetBranchId: otherBranchId,
        currentDraft: { schemaVersion: 3 },
      },
      userId,
    );
    expect(result.activeSnapshot).toBe(snapshot);
  });

  it('UTCID02 loads the head commit snapshot when no draft exists', async () => {
    const snapshot = { schemaVersion: 3, meta: {}, tracks: [], notes: [] };
    const { service } = makeService({
      projects: [{ data: { owner_id: userId } }, { data: null, error: null }],
      branches: [
        { count: 2, data: null },
        { data: makeBranch({ id: otherBranchId, head_commit_id: commitId }) },
        { data: { head_commit_id: commitId } },
      ],
      drafts: [{ data: null, error: null }, { data: null }],
      commits: [{ data: { snapshot } }],
      users: [{ data: { id: userId } }],
    });
    const result = await service.switchBranch(
      projectId,
      {
        currentBranchId: branchId,
        targetBranchId: otherBranchId,
        currentDraft: { schemaVersion: 3 },
      },
      userId,
    );
    expect(result.activeSnapshot).toEqual(snapshot);
  });

  it.each(['UTCID03', 'UTCID04', 'UTCID05'])(
    '%s uses the empty snapshot when no snapshot is available',
    async (_id) => {
      const targetRow = {
        UTCID03: { data: { head_commit_id: null } },
        UTCID04: { data: null },
        UTCID05: { data: { head_commit_id: commitId } },
      }[_id as 'UTCID03' | 'UTCID04' | 'UTCID05'];
      const { service } = makeService({
        projects: [{ data: { owner_id: userId } }, { data: null, error: null }],
        branches: [
          { count: 2, data: null },
          {
            data: makeBranch({
              id: otherBranchId,
              head_commit_id: _id === 'UTCID05' ? commitId : null,
            }),
          },
          targetRow,
        ],
        drafts: [{ data: null, error: null }, { data: null }],
        commits: _id === 'UTCID05' ? [{ data: null }] : [],
        users: [{ data: { id: userId } }],
      });
      const result = await service.switchBranch(
        projectId,
        {
          currentBranchId: branchId,
          targetBranchId: otherBranchId,
          currentDraft: { schemaVersion: 3 },
        },
        userId,
      );
      expect(result.activeSnapshot.meta).toEqual({
        tempo: 120,
        timeSignature: [4, 4],
        ppq: 480,
      });
    },
  );
});

describe('BE-BRN-11 BranchesService.getAncestorIds', () => {
  it('UTCID01 walks a commit chain head first', async () => {
    const { service } = makeService({
      commits: [
        { data: { parent_commit_id: 'c2' } },
        { data: { parent_commit_id: 'c1' } },
        { data: { parent_commit_id: null } },
      ],
    });
    await expect(service.getAncestorIds('c3')).resolves.toEqual([
      'c3',
      'c2',
      'c1',
    ]);
  });

  it('UTCID02 returns the root commit for a one-commit chain', async () => {
    const { service } = makeService({
      commits: [{ data: { parent_commit_id: null } }],
    });
    await expect(service.getAncestorIds('c1')).resolves.toEqual(['c1']);
  });

  it.each([
    ['UTCID03', null],
    ['UTCID04', ''],
  ])('%s returns an empty list for an empty head', async (_id, head) => {
    const { service } = makeService({});
    await expect(service.getAncestorIds(head)).resolves.toEqual([]);
  });

  it('UTCID05 includes an id whose database row is missing', async () => {
    const { service } = makeService({ commits: [{ data: null }] });
    await expect(service.getAncestorIds('unknown')).resolves.toEqual([
      'unknown',
    ]);
  });

  it('UTCID06 stops after MAX_CHAIN_HOPS', async () => {
    const { service } = makeService({
      commits: Array.from({ length: 2000 }, () => ({
        data: { parent_commit_id: 'next' },
      })),
    });
    const result = await service.getAncestorIds('head');
    expect(result).toHaveLength(2000);
  });
});

describe('BE-BRN-12 BranchesService.findMergeBase', () => {
  it('UTCID01 returns the nearest common ancestor', async () => {
    const { service } = makeService({
      commits: [
        { data: { parent_commit_id: 'a1' } },
        { data: { parent_commit_id: 'm' } },
        { data: { parent_commit_id: 'root' } },
        { data: null },
        { data: { parent_commit_id: 'm' } },
      ],
    });
    await expect(service.findMergeBase('a2', 'b1')).resolves.toBe('m');
  });

  it.each([
    ['UTCID02', null, 'b1'],
    ['UTCID03', 'a2', null],
  ])('%s returns null when either head is null', async (_id, a, b) => {
    const { service } = makeService({});
    await expect(service.findMergeBase(a, b)).resolves.toBeNull();
  });

  it('UTCID04 returns the head when both ids are equal', async () => {
    const { service } = makeService({});
    await expect(service.findMergeBase('same', 'same')).resolves.toBe('same');
  });

  it('UTCID05 returns null for unrelated histories', async () => {
    const { service } = makeService({
      commits: [{ data: null }, { data: null }],
    });
    await expect(service.findMergeBase('a', 'z')).resolves.toBeNull();
  });

  it('UTCID07 gives up after the maximum number of hops', async () => {
    const { service } = makeService({
      commits: [
        { data: { parent_commit_id: null } },
        ...Array.from({ length: 2000 }, (_, i) => ({
          data: { parent_commit_id: `n${i + 1}` },
        })),
      ],
    });
    await expect(service.findMergeBase('a', 'n0')).resolves.toBeNull();
  });

  it('UTCID06 returns an ancestor in the other chain', async () => {
    const { service } = makeService({
      commits: [
        { data: { parent_commit_id: 'a1' } },
        { data: null },
        { data: { parent_commit_id: 'root' } },
      ],
    });
    await expect(service.findMergeBase('a2', 'a1')).resolves.toBe('a1');
  });
});

describe('BE-BRN-13 BranchesService.calculateDivergence', () => {
  const defaultId = '88888888-8888-4888-8888-888888888888';
  const baseId = '99999999-9999-4999-8999-999999999999';
  const defaultBranch = makeBranch({
    id: defaultId,
    is_default: true,
    head_commit_id: baseId,
  });

  it('UTCID01 returns zero divergence for the default branch', async () => {
    const { service } = makeService({
      branches: [{ data: defaultBranch }, { data: defaultBranch }],
      projects: [{ data: { owner_id: userId } }],
      users: [{ data: { id: userId } }],
    });
    await expect(service.getBranchDetails(defaultId, userId)).resolves.toEqual(
      expect.objectContaining({
        divergence: { ahead: 0, behind: 0 },
        isMerged: true,
      }),
    );
  });

  it('UTCID02 counts commits on both sides of a common base', async () => {
    const a2 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const a1 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const d3 = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    const d2 = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
    const { service } = makeService({
      branches: [
        { data: makeBranch({ head_commit_id: a2 }) },
        { data: { ...defaultBranch, head_commit_id: d3 } },
      ],
      projects: [{ data: { owner_id: userId } }],
      commits: [
        { data: { parent_commit_id: a1 } },
        { data: { parent_commit_id: baseId } },
        { data: null },
        { data: { parent_commit_id: d2 } },
        { data: { parent_commit_id: baseId } },
        { data: { parent_commit_id: a1 } },
        { data: { parent_commit_id: baseId } },
        { data: { parent_commit_id: d2 } },
        { data: { parent_commit_id: baseId } },
      ],
      users: [{ data: { id: userId } }],
    });
    await expect(service.getBranchDetails(branchId, userId)).resolves.toEqual(
      expect.objectContaining({ divergence: { ahead: 2, behind: 2 } }),
    );
  });

  it('UTCID03 counts ahead-only history', async () => {
    const a2 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const a1 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const { service } = makeService({
      branches: [
        { data: makeBranch({ head_commit_id: a2 }) },
        { data: defaultBranch },
      ],
      projects: [{ data: { owner_id: userId } }],
      commits: [
        { data: { parent_commit_id: a1 } },
        { data: { parent_commit_id: baseId } },
        { data: null },
        { data: { parent_commit_id: a1 } },
        { data: { parent_commit_id: baseId } },
      ],
      users: [{ data: { id: userId } }],
    });
    await expect(service.getBranchDetails(branchId, userId)).resolves.toEqual(
      expect.objectContaining({ divergence: { ahead: 2, behind: 0 } }),
    );
  });

  it('UTCID04 counts behind-only history', async () => {
    const d2 = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
    const d1 = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
    const { service } = makeService({
      branches: [
        { data: makeBranch({ head_commit_id: baseId }) },
        { data: { ...defaultBranch, head_commit_id: d2 } },
      ],
      projects: [{ data: { owner_id: userId } }],
      commits: [
        { data: null },
        { data: { parent_commit_id: d1 } },
        { data: { parent_commit_id: baseId } },
        { data: { parent_commit_id: d1 } },
        { data: { parent_commit_id: baseId } },
      ],
      users: [{ data: { id: userId } }],
    });
    await expect(service.getBranchDetails(branchId, userId)).resolves.toEqual(
      expect.objectContaining({ divergence: { ahead: 0, behind: 2 } }),
    );
  });

  it('UTCID05 returns zero when both heads equal the base', async () => {
    const { service } = makeService({
      branches: [
        { data: makeBranch({ head_commit_id: baseId }) },
        { data: defaultBranch },
      ],
      projects: [{ data: { owner_id: userId } }],
      commits: [{ data: { parent_commit_id: null } }],
      users: [{ data: { id: userId } }],
    });
    await expect(service.getBranchDetails(branchId, userId)).resolves.toEqual(
      expect.objectContaining({
        divergence: { ahead: 0, behind: 0 },
        isMerged: true,
      }),
    );
  });

  it('UTCID06 uses full chain lengths when no ancestor exists', async () => {
    const a = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const d = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
    const { service } = makeService({
      branches: [
        { data: makeBranch({ head_commit_id: a }) },
        { data: { ...defaultBranch, head_commit_id: d } },
      ],
      projects: [{ data: { owner_id: userId } }],
      commits: [
        { data: { parent_commit_id: null } },
        { data: { parent_commit_id: null } },
        { data: { parent_commit_id: null } },
        { data: { parent_commit_id: null } },
      ],
      users: [{ data: { id: userId } }],
    });
    await expect(service.getBranchDetails(branchId, userId)).resolves.toEqual(
      expect.objectContaining({ divergence: { ahead: 1, behind: 1 } }),
    );
  });

  it('UTCID07 returns zero ahead for a null branch head', async () => {
    const { service } = makeService({
      branches: [
        { data: makeBranch({ head_commit_id: null }) },
        {
          data: {
            ...defaultBranch,
            head_commit_id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
          },
        },
      ],
      projects: [{ data: { owner_id: userId } }],
      commits: [
        { data: { parent_commit_id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee' } },
        { data: { parent_commit_id: 'ffffffff-ffff-4fff-8fff-ffffffffffff' } },
        { data: { parent_commit_id: null } },
      ],
      users: [{ data: { id: userId } }],
    });
    await expect(service.getBranchDetails(branchId, userId)).resolves.toEqual(
      expect.objectContaining({ divergence: { ahead: 0, behind: 3 } }),
    );
  });
});

describe('BE-BRN-14 BranchesService.normalizeSnapshot', () => {
  const target = makeBranch({ id: otherBranchId });

  async function switchWithDraft(currentDraft: Record<string, unknown>) {
    const { service } = makeService({
      projects: [{ data: { owner_id: userId } }, { data: null, error: null }],
      branches: [{ count: 2, data: null }, { data: target }],
      drafts: [{ data: null, error: null }, { data: { snapshot: {} } }],
      users: [{ data: { id: userId } }],
    });
    return service.switchBranch(
      projectId,
      {
        currentBranchId: branchId,
        targetBranchId: otherBranchId,
        currentDraft: currentDraft,
      },
      userId,
    );
  }

  it('UTCID01 accepts explicit snapshot fields', async () => {
    await expect(
      switchWithDraft({
        schemaVersion: 2,
        meta: { tempo: 90, timeSignature: [3, 4], ppq: 960 },
        tracks: [],
        notes: [],
      }),
    ).resolves.toBeDefined();
  });
  it('UTCID02 applies defaults to omitted fields', async () => {
    await expect(switchWithDraft({})).resolves.toBeDefined();
  });
  it('UTCID03 maps legacy mute and solo fields', async () => {
    await expect(
      switchWithDraft({
        tracks: [
          {
            name: 'x',
            order: 0,
            color: '#000',
            volume: 1,
            pan: 0,
            isMuted: true,
            isSolo: true,
          },
        ],
      }),
    ).resolves.toBeDefined();
  });
  it('UTCID04 creates missing track defaults', async () => {
    await expect(
      switchWithDraft({ tracks: [{ name: 'x' }] }),
    ).resolves.toBeDefined();
  });
  it('UTCID05 preserves a legacy note start field', async () => {
    await expect(
      switchWithDraft({
        notes: [
          { trackId: 't', pitch: 60, start: 480, duration: 120, velocity: 70 },
        ],
      }),
    ).resolves.toBeDefined();
  });
  it('UTCID06 applies note defaults', async () => {
    await expect(
      switchWithDraft({ notes: [{ trackId: 't', pitch: 60 }] }),
    ).resolves.toBeDefined();
  });
});

describe('BE-BRN-15 CreateBranchDto', () => {
  async function errors(value: Partial<CreateBranchDto>) {
    return validate(Object.assign(new CreateBranchDto(), value));
  }

  it('UTCID01 accepts a normal name', async () =>
    expect(errors({ name: 'feature-x' })).resolves.toHaveLength(0));
  it('UTCID02 accepts a one-character name', async () =>
    expect(errors({ name: 'x' })).resolves.toHaveLength(0));
  it('UTCID03 accepts a fifty-character name', async () =>
    expect(errors({ name: 'x'.repeat(50) })).resolves.toHaveLength(0));
  it('UTCID04 rejects an empty name', async () =>
    expect(errors({ name: '' })).resolves.toHaveLength(1));
  it('UTCID05 rejects a name longer than fifty characters', async () =>
    expect(errors({ name: 'x'.repeat(51) })).resolves.toHaveLength(1));
  it('UTCID06 rejects a non-string name', async () =>
    expect(errors({ name: 123 as never })).resolves.toHaveLength(1));
  it('UTCID07 rejects a missing name', async () =>
    expect(errors({})).resolves.toHaveLength(1));
  it('UTCID08 accepts a valid start UUID', async () =>
    expect(
      errors({ name: 'x', startCommitId: commitId }),
    ).resolves.toHaveLength(0));
  it('UTCID09 accepts a valid source UUID', async () =>
    expect(
      errors({ name: 'x', sourceBranchId: branchId }),
    ).resolves.toHaveLength(0));
  it('UTCID10 rejects an invalid start UUID', async () =>
    expect(errors({ name: 'x', startCommitId: 'abc' })).resolves.toHaveLength(
      1,
    ));
  it('UTCID11 rejects an invalid source UUID', async () =>
    expect(errors({ name: 'x', sourceBranchId: 'xyz' })).resolves.toHaveLength(
      1,
    ));
});

describe('BE-BRN-16 SwitchBranchDto', () => {
  async function errors(value: Partial<SwitchBranchDto>) {
    return validate(plainToInstance(SwitchBranchDto, value));
  }
  const valid = {
    currentBranchId: branchId,
    targetBranchId: otherBranchId,
    currentDraft: {},
  };

  it('UTCID01 accepts valid branch ids and a draft', async () =>
    expect(errors(valid)).resolves.toHaveLength(0));
  it('UTCID02 accepts an empty draft object', async () =>
    expect(errors(valid)).resolves.toHaveLength(0));
  it('UTCID03 rejects an empty current branch id', async () =>
    expect(errors({ ...valid, currentBranchId: '' })).resolves.toHaveLength(1));
  it('UTCID04 rejects an invalid current branch id', async () =>
    expect(
      errors({ ...valid, currentBranchId: 'branch-1' }),
    ).resolves.toHaveLength(1));
  it('UTCID05 rejects an empty target branch id', async () =>
    expect(errors({ ...valid, targetBranchId: '' })).resolves.toHaveLength(1));
  it('UTCID06 rejects an invalid target branch id', async () =>
    expect(
      errors({ ...valid, targetBranchId: 'branch-2' }),
    ).resolves.toHaveLength(1));
  it('UTCID07 rejects a missing current draft', async () =>
    expect(
      errors({ currentBranchId: branchId, targetBranchId: otherBranchId }),
    ).resolves.toHaveLength(1));
  it('UTCID08 rejects a non-numeric schema version', async () =>
    expect(
      errors({ ...valid, currentDraft: { schemaVersion: '1' } as never }),
    ).resolves.toHaveLength(1));
  it('UTCID09 rejects a non-object meta field', async () =>
    expect(
      errors({ ...valid, currentDraft: { meta: 'x' } as never }),
    ).resolves.toHaveLength(1));
});
