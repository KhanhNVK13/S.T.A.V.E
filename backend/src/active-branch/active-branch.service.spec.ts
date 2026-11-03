import { InternalServerErrorException } from '@nestjs/common';
import { createSupabaseMock } from '../test-utils/supabase-mock';
import { ActiveBranchService } from './active-branch.service';

const projectId = '33333333-3333-4333-8333-333333333333';
const ownerId = '44444444-4444-4444-8444-444444444444';
const memberId = '55555555-5555-4555-8555-555555555555';
const branchId = '22222222-2222-4222-8222-222222222222';

function makeService(tables: Record<string, Array<Record<string, unknown>>>) {
  const mock = createSupabaseMock([], { tables });
  return { service: new ActiveBranchService(mock.client), ...mock };
}

describe('BE-ACB-01 ActiveBranchService.getActiveBranchId', () => {
  it('UTCID01 reads the project column for the owner', async () => {
    const { service, builders } = makeService({
      projects: [{ data: { owner_id: ownerId, active_branch_id: branchId } }],
    });
    await expect(service.getActiveBranchId(projectId, ownerId)).resolves.toBe(
      branchId,
    );
    expect(builders.project_member_active_branches).toBeUndefined();
  });

  it('UTCID02 reads the per-user row for a collaborator', async () => {
    const { service, builders } = makeService({
      projects: [{ data: { owner_id: ownerId, active_branch_id: 'owner-b' } }],
      project_member_active_branches: [{ data: { branch_id: branchId } }],
    });
    await expect(service.getActiveBranchId(projectId, memberId)).resolves.toBe(
      branchId,
    );
    expect(builders.project_member_active_branches.eq).toHaveBeenCalledWith(
      'user_id',
      memberId,
    );
  });

  it('UTCID03 returns null when a collaborator never switched', async () => {
    const { service } = makeService({
      projects: [{ data: { owner_id: ownerId, active_branch_id: null } }],
      project_member_active_branches: [{ data: null }],
    });
    await expect(
      service.getActiveBranchId(projectId, memberId),
    ).resolves.toBeNull();
  });

  it('UTCID04 returns null for a missing project', async () => {
    const { service } = makeService({ projects: [{ data: null }] });
    await expect(
      service.getActiveBranchId(projectId, ownerId),
    ).resolves.toBeNull();
  });
});

describe('BE-ACB-02 ActiveBranchService.setActiveBranch', () => {
  it('UTCID01 updates the project column for the owner', async () => {
    const { service, builders } = makeService({
      projects: [{ data: { owner_id: ownerId } }, { data: null, error: null }],
    });
    await service.setActiveBranch(projectId, ownerId, branchId);
    expect(builders.projects.update).toHaveBeenCalledWith({
      active_branch_id: branchId,
    });
  });

  it('UTCID02 upserts a per-user row for a collaborator', async () => {
    const { service, builders } = makeService({
      projects: [{ data: { owner_id: ownerId } }],
      project_member_active_branches: [{ data: null, error: null }],
    });
    await service.setActiveBranch(projectId, memberId, branchId);
    expect(builders.project_member_active_branches.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        project_id: projectId,
        user_id: memberId,
        branch_id: branchId,
      }),
      { onConflict: 'project_id,user_id' },
    );
    expect(builders.projects.update).not.toHaveBeenCalled();
  });

  it('UTCID03 reports a write error', async () => {
    const { service } = makeService({
      projects: [{ data: { owner_id: ownerId } }],
      project_member_active_branches: [
        { data: null, error: { message: 'rls' } },
      ],
    });
    await expect(
      service.setActiveBranch(projectId, memberId, branchId),
    ).rejects.toThrow(
      new InternalServerErrorException('Failed to record active branch: rls'),
    );
  });
});
