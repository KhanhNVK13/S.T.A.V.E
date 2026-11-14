import { ForbiddenException } from '@nestjs/common';
import type { SupabaseMockOptions } from '../test-utils/supabase-mock';
import { createSupabaseMock } from '../test-utils/supabase-mock';
import { ProjectAccessService } from '../project-access/project-access.service';
import { ActiveBranchService } from '../active-branch/active-branch.service';
import { BranchesService } from './branches.service';

/**
 * Phần D — các ca còn "Untested" trong workbook là ca kiểm tra **cộng tác
 * viên** được quyền (BR-26 / PRE-2: cộng tác viên đã accept với
 * `permission_level` = 'edit' thì được quyền như owner; 'view' thì chỉ xem).
 *
 * Các ca này được tách file riêng để không làm xáo trộn thứ tự UTCID trong
 * file spec gốc (file gốc đã gắn mã theo đúng thứ tự cột của sheet). Cơ sở
 * mock (makeService + RPC-ancestry split) sao chép y nguyên từ
 * branches.service.spec.ts, chỉ thay owner → một người khác và thêm hàng
 * project_collaborators 'accepted'.
 */

const branchId = '11111111-1111-4111-8111-111111111111';
const otherBranchId = '22222222-2222-4222-8222-222222222222';
const projectId = '33333333-3333-4333-8333-333333333333';
const ownerId = '44444444-4444-4444-8444-444444444444';
const callerId = '55555555-5555-4555-8555-555555555555';
const commitId = '66666666-6666-4666-8666-666666666666';

jest.mock('uuid', () => ({
  v4: jest.fn(() => '77777777-7777-4777-8777-777777777777'),
}));

function isAncestryRows(entry: { data?: unknown }): boolean {
  return (
    Array.isArray(entry.data) &&
    entry.data.length > 0 &&
    entry.data.every(
      (row) =>
        typeof row === 'object' &&
        row !== null &&
        'merged_from_commit_id' in row,
    )
  );
}

function collabRow(permission: 'edit' | 'view') {
  return {
    data: {
      id: 'collab-1',
      project_id: projectId,
      user_id: callerId,
      permission_level: permission,
      invited_by: ownerId,
      created_at: '2026-10-25T00:00:00.000Z',
      status: 'accepted',
      responded_at: '2026-10-26T00:00:00.000Z',
    },
  };
}

function makeBranch(overrides: Record<string, unknown> = {}) {
  return {
    id: branchId,
    project_id: projectId,
    name: 'feature-x',
    is_default: false,
    created_by: ownerId,
    created_at: '2026-10-21T00:00:00.000Z',
    base_commit_id: null,
    head_commit_id: null,
    ...overrides,
  };
}

function makeService(
  tables: SupabaseMockOptions['tables'],
  rpc: SupabaseMockOptions['rpc'] = undefined,
) {
  const commitEntries = tables?.commits ?? [];
  const ancestryRows = commitEntries
    .filter(isAncestryRows)
    .flatMap((entry) => entry.data as unknown[]);
  const rpcOptions =
    rpc ??
    (ancestryRows.length > 0
      ? { commit_ancestry: { data: ancestryRows } }
      : undefined);
  const splitTables = tables
    ? { ...tables, commits: commitEntries.filter((e) => !isAncestryRows(e)) }
    : tables;
  const mock = createSupabaseMock([], {
    tables: {
      // default: an accepted 'edit' collaborator on this project. Tests that
      // target a specific permission override via their own `project_collaborators`.
      project_collaborators: [collabRow('edit')],
      ...splitTables,
    },
    rpc: rpcOptions,
  });
  const service = new BranchesService(
    mock.client,
    new ProjectAccessService(mock.client),
    new ActiveBranchService(mock.client),
  );
  return { service, ...mock };
}

/** Project owned by someone else, so `callerId` reaches the collaborator path. */
function ownerProject() {
  return { owner_id: ownerId, archived_at: null };
}

describe('BE-BRN-01 BranchesService.createBranch — collaborator access', () => {
  it('UTCID17 lets an accepted edit collaborator create a branch (BR-26)', async () => {
    const { service } = makeService({
      projects: [{ data: ownerProject() }],
      branches: [
        { data: [{ id: otherBranchId }] },
        { data: null },
        { data: { project_id: projectId } },
        {
          data: makeBranch({
            head_commit_id: commitId,
            base_commit_id: commitId,
          }),
        },
      ],
      commits: [
        { data: [{ id: commitId }] },
        { data: { id: commitId, branch_id: otherBranchId } },
        {
          data: {
            snapshot: { schemaVersion: 3, meta: {}, tracks: [], notes: [] },
          },
        },
      ],
      drafts: [{ data: null, error: null }],
      users: [{ data: { id: ownerId, username: 'owner' } }],
    });

    const result = await service.createBranch(
      projectId,
      { name: 'feature-x', startCommitId: commitId },
      callerId,
    );

    expect(result.head_commit_id).toBe(commitId);
    expect(result.base_commit_id).toBe(commitId);
  });
});

describe('BE-BRN-03 BranchesService.getBranchDetails — collaborator access', () => {
  it('UTCID09 lets an accepted edit collaborator read branch details (BR-26)', async () => {
    const { service } = makeService({
      branches: [
        { data: makeBranch({ head_commit_id: commitId }) },
        { data: makeBranch({ id: otherBranchId, is_default: true }) },
      ],
      projects: [{ data: ownerProject() }],
      commits: [
        { data: [{ id: commitId, merged_from_commit_id: null }] },
        { data: [] },
      ],
      users: [{ data: { id: ownerId, username: 'owner' } }],
    });

    const result = await service.getBranchDetails(branchId, callerId);

    expect(result.branchInfo.id).toBe(branchId);
  });

  it('UTCID10 lets an accepted view collaborator read branch details (BR-43)', async () => {
    const { service } = makeService({
      project_collaborators: [collabRow('view')],
      branches: [
        { data: makeBranch({ head_commit_id: commitId }) },
        { data: makeBranch({ id: otherBranchId, is_default: true }) },
      ],
      projects: [{ data: ownerProject() }],
      commits: [
        { data: [{ id: commitId, merged_from_commit_id: null }] },
        { data: [] },
      ],
      users: [{ data: { id: ownerId, username: 'owner' } }],
    });

    const result = await service.getBranchDetails(branchId, callerId);

    expect(result.branchInfo.id).toBe(branchId);
    expect(result.isMerged).toBe(false);
  });
});

describe('BE-BRN-04 BranchesService.getBranchHistory — collaborator access', () => {
  const defaultId = '88888888-8888-4888-8888-888888888888';
  const headId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

  function tables(permission: 'edit' | 'view') {
    return {
      project_collaborators: [collabRow(permission)],
      branches: [
        { data: makeBranch({ head_commit_id: headId }) },
        { data: makeBranch({ id: defaultId, is_default: true }) },
        { data: [{ id: branchId }, { id: defaultId }] },
      ],
      projects: [{ data: ownerProject() }],
      commits: [
        {
          data: [
            {
              id: headId,
              branch_id: branchId,
              author_id: ownerId,
              message: 'feature',
              created_at: '2026-10-21T00:00:00.000Z',
              parent_commit_id: null,
            },
          ],
        },
      ],
      users: [{ data: [{ id: ownerId, username: 'owner' }] }],
      commit_tags: [{ data: [] }],
    };
  }

  it('UTCID13 lets an accepted edit collaborator read the branch history (BR-26)', async () => {
    const { service } = makeService(tables('edit'));

    const result = await service.getBranchHistory(branchId, callerId);

    expect(result.commits.map((commit) => commit.id)).toEqual([headId]);
  });

  it('UTCID14 lets an accepted view collaborator read the branch history (BR-43)', async () => {
    const { service } = makeService(tables('view'));

    const result = await service.getBranchHistory(branchId, callerId);

    expect(result.commits.map((commit) => commit.id)).toEqual([headId]);
  });
});

describe('BE-BRN-05 BranchesService.getDeletePreview — collaborator access', () => {
  it('UTCID10 lets an accepted edit collaborator preview the deletion (BR-26)', async () => {
    const { service } = makeService({
      branches: [{ data: makeBranch() }, { data: [] }],
      projects: [{ data: ownerProject() }],
      commits: [{ data: [{ id: 'commit-a' }] }],
    });

    const result = await service.getDeletePreview(branchId, callerId);

    expect(result).toEqual(
      expect.objectContaining({
        branchId,
        unmergedCommitsCount: 1,
        unmergedCommitIds: ['commit-a'],
      }),
    );
  });
});

describe('BE-BRN-06 BranchesService.deleteBranch — collaborator access', () => {
  it('UTCID13 lets an accepted edit collaborator delete a branch (BR-26)', async () => {
    const { service, builders } = makeService({
      projects: [
        { data: { owner_id: ownerId, active_branch_id: null } },
        { data: { owner_id: ownerId, active_branch_id: null } },
      ],
      branches: [
        { data: makeBranch() },
        { data: [] },
        { data: null, error: null },
      ],
      commits: [{ data: [] }],
      project_member_active_branches: [{ data: [] }],
    });

    await expect(
      service.deleteBranch(branchId, callerId),
    ).resolves.toBeUndefined();

    expect(builders.branches.delete).toHaveBeenCalled();
  });
});

describe('BE-BRN-07 BranchesService.getProjectBranches — collaborator access', () => {
  it('UTCID09 lets an accepted edit collaborator list the project branches (BR-26)', async () => {
    const { service } = makeService({
      projects: [
        { data: ownerProject() },
        { data: { owner_id: ownerId, active_branch_id: null } },
      ],
      branches: [{ data: [makeBranch({ is_default: true })] }],
      users: [{ data: [{ id: ownerId, username: 'owner' }] }],
      project_member_active_branches: [{ data: null }],
    });

    const result = await service.getProjectBranches(projectId, callerId);

    expect(result.map((branch) => branch.id)).toEqual([branchId]);
    expect(result[0].is_default).toBe(true);
  });
});

describe('BE-BRN-08 BranchesService verifyUserEditPermission — collaborator', () => {
  it('UTCID03 lets an accepted edit collaborator create a branch (BR-26)', async () => {
    const { service } = makeService({
      projects: [{ data: ownerProject() }],
      branches: [
        { data: [{ id: otherBranchId }] },
        { data: null },
        { data: { project_id: projectId } },
        {
          data: makeBranch({
            head_commit_id: commitId,
            base_commit_id: commitId,
          }),
        },
      ],
      commits: [
        { data: [{ id: commitId }] },
        { data: { id: commitId, branch_id: otherBranchId } },
        {
          data: {
            snapshot: { schemaVersion: 3, meta: {}, tracks: [], notes: [] },
          },
        },
      ],
      drafts: [{ data: null, error: null }],
      users: [{ data: { id: ownerId, username: 'owner' } }],
    });

    // Reaches the insert (not Forbidden) — i.e. the edit collaborator passes
    // verifyUserEditPermission.
    await expect(
      service.createBranch(
        projectId,
        { name: 'feature-x', startCommitId: commitId },
        callerId,
      ),
    ).resolves.toBeDefined();
  });

  it('UTCID04 refuses an accepted view collaborator (edit required)', async () => {
    const { service } = makeService({
      project_collaborators: [collabRow('view')],
      projects: [{ data: ownerProject() }],
    });

    await expect(
      service.createBranch(projectId, { name: 'feature-x' }, callerId),
    ).rejects.toThrow(
      new ForbiddenException('You do not have edit permission on this project'),
    );
  });
});

describe('BE-BRN-02 BranchesService.switchBranch — collaborator access', () => {
  const currentDraft = {
    schemaVersion: 3,
    meta: { tempo: 120, timeSignature: [4, 4] as [number, number], ppq: 480 },
    tracks: [],
    notes: [],
  };
  const targetSnapshot = { schemaVersion: 3, meta: {}, tracks: [], notes: [] };
  const branchTables = () => [
    { count: 3, data: null },
    { data: makeBranch({ id: otherBranchId }) },
    { data: makeBranch() },
  ];

  it('UTCID11 lets an accepted edit collaborator switch branches and saves their outgoing draft', async () => {
    const { service, builders } = makeService({
      projects: [{ data: ownerProject() }, { data: { owner_id: ownerId } }],
      project_collaborators: [collabRow('edit')],
      branches: branchTables(),
      drafts: [
        { data: { updated_at: '2026-11-12T00:00:00Z' } },
        {
          data: {
            snapshot: targetSnapshot,
            updated_at: '2026-11-12T01:00:00Z',
          },
        },
      ],
      users: [{ data: { id: ownerId, username: 'owner' } }],
      project_member_active_branches: [{ data: null, error: null }],
    });

    const result = await service.switchBranch(
      projectId,
      {
        currentBranchId: branchId,
        targetBranchId: otherBranchId,
        currentDraft,
      },
      callerId,
    );

    expect(result.branch.id).toBe(otherBranchId);
    expect(result.activeSnapshot).toBe(targetSnapshot);
    expect(builders.drafts.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ branch_id: branchId, user_id: callerId }),
      { onConflict: 'branch_id,user_id' },
    );
    expect(builders.project_member_active_branches.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        project_id: projectId,
        user_id: callerId,
        branch_id: otherBranchId,
      }),
      { onConflict: 'project_id,user_id' },
    );
  });

  it('UTCID12 lets an accepted view collaborator switch branches without writing a draft (UC-48 PRE-2)', async () => {
    const { service, builders } = makeService({
      projects: [
        { data: ownerProject() },
        { data: ownerProject() },
        { data: { owner_id: ownerId } },
      ],
      project_collaborators: [collabRow('view'), collabRow('view')],
      branches: branchTables(),
      drafts: [
        {
          data: {
            snapshot: targetSnapshot,
            updated_at: '2026-11-12T01:00:00Z',
          },
        },
      ],
      users: [{ data: { id: ownerId, username: 'owner' } }],
      project_member_active_branches: [{ data: null, error: null }],
    });

    const result = await service.switchBranch(
      projectId,
      {
        currentBranchId: branchId,
        targetBranchId: otherBranchId,
        currentDraft,
      },
      callerId,
    );

    expect(result.branch.id).toBe(otherBranchId);
    expect(result.activeSnapshot).toBe(targetSnapshot);
    expect(builders.drafts.upsert).not.toHaveBeenCalled();
    expect(builders.drafts.update).not.toHaveBeenCalled();
    expect(builders.project_member_active_branches.upsert).toHaveBeenCalled();
  });

  it('still refuses a user who is not a member of the project', async () => {
    const { service } = makeService({
      projects: [{ data: ownerProject() }, { data: ownerProject() }],
      project_collaborators: [{ data: null }, { data: null }],
    });

    await expect(
      service.switchBranch(
        projectId,
        {
          currentBranchId: branchId,
          targetBranchId: otherBranchId,
          currentDraft,
        },
        callerId,
      ),
    ).rejects.toThrow(
      new ForbiddenException('You do not have edit permission on this project'),
    );
  });
});

describe('BE-BRN-05 BranchesService.getDeletePreview — view collaborator', () => {
  it('UTCID11 refuses an accepted view collaborator', async () => {
    const { service } = makeService({
      project_collaborators: [collabRow('view')],
      branches: [{ data: makeBranch() }],
      projects: [{ data: ownerProject() }],
    });

    await expect(service.getDeletePreview(branchId, callerId)).rejects.toThrow(
      new ForbiddenException('You do not have edit permission on this project'),
    );
  });
});

describe('BE-BRN-06 BranchesService.deleteBranch — view collaborator', () => {
  it('UTCID14 refuses an accepted view collaborator', async () => {
    const { service, builders } = makeService({
      project_collaborators: [collabRow('view')],
      branches: [{ data: makeBranch() }],
      projects: [{ data: ownerProject() }],
    });

    await expect(service.deleteBranch(branchId, callerId)).rejects.toThrow(
      new ForbiddenException('You do not have edit permission on this project'),
    );
    expect(builders.branches.delete).not.toHaveBeenCalled();
  });
});

describe('BE-BRN-07 BranchesService.getProjectBranches — view collaborator', () => {
  it('UTCID10 lets an accepted view collaborator list the project branches (BR-43)', async () => {
    const { service } = makeService({
      project_collaborators: [collabRow('view')],
      projects: [
        { data: ownerProject() },
        { data: { owner_id: ownerId, active_branch_id: null } },
      ],
      branches: [{ data: [makeBranch({ is_default: true })] }],
      users: [{ data: [{ id: ownerId, username: 'owner' }] }],
      project_member_active_branches: [{ data: null }],
    });

    const result = await service.getProjectBranches(projectId, callerId);

    expect(result.map((branch) => branch.id)).toEqual([branchId]);
    expect(result[0].is_active).toBe(true);
  });
});
