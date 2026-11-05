import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import type { DraftSnapshot } from '@stave/shared-types';

jest.mock('uuid', () => ({
  v4: jest.fn(() => '77777777-7777-4777-8777-777777777777'),
}));

import {
  createSupabaseMock,
  type SupabaseMockOptions,
} from '../test-utils/supabase-mock';
import { ProjectAccessService } from '../project-access/project-access.service';
import type { ProjectsService } from '../projects/projects.service';
import { DiffService } from './diff.service';
import { CommitsService } from './commits.service';

const projectId = '11111111-1111-4111-8111-111111111111';
const branchId = '22222222-2222-4222-8222-222222222222';
const userId = '33333333-3333-4333-8333-333333333333';
const otherUserId = '44444444-4444-4444-8444-444444444444';
const commitId1 = '55555555-5555-4555-8555-555555555555';
const commitId2 = '66666666-6666-4666-8666-666666666666';

const baseSnapshot: DraftSnapshot = {
  schemaVersion: 3,
  meta: { tempo: 120, timeSignature: [4, 4], ppq: 480 },
  tracks: [
    {
      id: 't1',
      name: 'Piano',
      order: 0,
      color: '#6366f1',
      muted: false,
      solo: false,
      volume: 0.8,
      pan: 0,
      instrument: null,
    },
  ],
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
};

const diffSnapshot: DraftSnapshot = {
  ...baseSnapshot,
  notes: [
    {
      ...baseSnapshot.notes[0],
      pitch: 62,
    },
  ],
};

function makeService(options: SupabaseMockOptions = {}) {
  const defaultTables = {
    projects: [
      {
        data: {
          id: projectId,
          owner_id: userId,
          moderation_hidden_at: null,
          archived_at: null,
        },
      },
    ],
    project_collaborators: Array.from({ length: 20 }, () => ({
      data: null,
    })),
    users: Array.from({ length: 20 }, () => ({
      data: [],
    })),
    commit_tags: Array.from({ length: 20 }, () => ({
      data: [],
    })),
  };

  const mergedTables = {
    ...defaultTables,
    ...(options.tables ?? {}),
  };

  const mock = createSupabaseMock([], {
    ...options,
    tables: mergedTables,
  });

  const projectsService = {} as ProjectsService;
  const diffService = new DiffService();
  const access = new ProjectAccessService(mock.client);
  const service = new CommitsService(
    mock.client,
    projectsService,
    diffService,
    access,
  );

  return { service, diffService, access, ...mock };
}

describe('CommitsService unit tests', () => {
  // ============================================================================
  // SHEET: BE-CMT-01 (CommitsService.createCommit)
  // ============================================================================
  describe('BE-CMT-01 CommitsService.createCommit(userId, dto)', () => {
    it('UTCID01 creates commit when head is null and draft row exists', async () => {
      const commitRow = {
        id: commitId1,
        branch_id: branchId,
        author_id: userId,
        message: 'Initial commit',
        created_at: '2026-10-28T10:00:00Z',
        snapshot: baseSnapshot,
      };
      const { service } = makeService({
        tables: {
          branches: [
            {
              data: {
                id: branchId,
                project_id: projectId,
                head_commit_id: null,
                project: { id: projectId },
              },
            },
          ],
          drafts: [{ data: { snapshot: baseSnapshot } }],
        },
        rpc: {
          create_commit_atomic: { data: commitRow },
        },
      });

      const res = await service.createCommit(userId, {
        branch_id: branchId,
        message: 'Initial commit',
      });
      expect(res).toMatchObject({
        id: commitId1,
        branch_id: branchId,
        message: 'Initial commit',
        created_by: userId,
      });
    });

    it('UTCID02 creates commit when expectedHeadCommitId matches head and snapshot differs', async () => {
      const commitRow = {
        id: commitId2,
        branch_id: branchId,
        author_id: userId,
        message: 'Second commit',
        created_at: '2026-10-28T10:05:00Z',
        snapshot: diffSnapshot,
      };
      const { service } = makeService({
        tables: {
          branches: [
            {
              data: {
                id: branchId,
                project_id: projectId,
                head_commit_id: commitId1,
                project: { id: projectId },
              },
            },
          ],
          commits: [{ data: { snapshot: baseSnapshot } }],
        },
        rpc: {
          create_commit_atomic: { data: commitRow },
        },
      });

      const res = await service.createCommit(userId, {
        branch_id: branchId,
        message: 'Second commit',
        expectedHeadCommitId: commitId1,
        snapshot: diffSnapshot,
      });
      expect(res).toMatchObject({
        id: commitId2,
        branch_id: branchId,
        message: 'Second commit',
        created_by: userId,
      });
    });

    it('UTCID03 commits empty default snapshot when no draft exists and head is null', async () => {
      const commitRow = {
        id: commitId1,
        branch_id: branchId,
        author_id: userId,
        message: 'Empty start',
        created_at: '2026-10-28T10:00:00Z',
        snapshot: baseSnapshot,
      };
      const { service } = makeService({
        tables: {
          branches: [
            {
              data: {
                id: branchId,
                project_id: projectId,
                head_commit_id: null,
                project: { id: projectId },
              },
            },
          ],
          drafts: [{ data: null }],
        },
        rpc: {
          create_commit_atomic: { data: commitRow },
        },
      });

      const res = await service.createCommit(userId, {
        branch_id: branchId,
        message: 'Empty start',
      });
      expect(res).toMatchObject({
        id: commitId1,
        branch_id: branchId,
        message: 'Empty start',
        created_by: userId,
      });
    });

    it('UTCID04 auto-generates note UUIDs when provided without id', async () => {
      const commitRow = {
        id: commitId1,
        branch_id: branchId,
        author_id: userId,
        message: 'Auto ids',
        created_at: '2026-10-28T10:00:00Z',
        snapshot: baseSnapshot,
      };
      const snapshotNoIds = {
        ...baseSnapshot,
        notes: [{ pitch: 60, start: 0, duration: 480, velocity: 100 }],
      };
      const { service } = makeService({
        tables: {
          branches: [
            {
              data: {
                id: branchId,
                project_id: projectId,
                head_commit_id: null,
                project: { id: projectId },
              },
            },
          ],
        },
        rpc: {
          create_commit_atomic: { data: commitRow },
        },
      });

      const res = await service.createCommit(userId, {
        branch_id: branchId,
        message: 'Auto ids',
        snapshot: snapshotNoIds as any,
      });
      expect(res).toMatchObject({
        id: commitId1,
        branch_id: branchId,
        message: 'Auto ids',
        created_by: userId,
      });
    });

    it('UTCID05 throws NotFoundException when branch is not found', async () => {
      const { service } = makeService({
        tables: {
          branches: [{ data: null }],
        },
      });
      await expect(
        service.createCommit(userId, {
          branch_id: branchId,
          message: 'msg',
        }),
      ).rejects.toThrow(new NotFoundException('Branch not found'));
    });

    it('UTCID06 throws ForbiddenException/BadRequestException when branch project owned by another user', async () => {
      const { service } = makeService({
        tables: {
          branches: [
            {
              data: {
                id: branchId,
                project_id: projectId,
                head_commit_id: null,
                project: { id: projectId },
              },
            },
          ],
          projects: [
            {
              data: {
                id: projectId,
                owner_id: otherUserId,
                moderation_hidden_at: null,
                archived_at: null,
              },
            },
          ],
        },
      });
      await expect(
        service.createCommit(userId, {
          branch_id: branchId,
          message: 'msg',
        }),
      ).rejects.toThrow();
    });

    it('UTCID07 throws ConflictException when expectedHeadCommitId does not match head H1', async () => {
      const { service } = makeService({
        tables: {
          branches: [
            {
              data: {
                id: branchId,
                project_id: projectId,
                head_commit_id: commitId1,
                project: { id: projectId },
              },
            },
          ],
        },
      });
      await expect(
        service.createCommit(userId, {
          branch_id: branchId,
          message: 'msg',
          expectedHeadCommitId: commitId2,
        }),
      ).rejects.toThrow(
        new ConflictException(
          'Branch has moved on with new commits. Please review changes.',
        ),
      );
    });

    it('UTCID08 throws ConflictException when head is null but expectedHeadCommitId is given', async () => {
      const { service } = makeService({
        tables: {
          branches: [
            {
              data: {
                id: branchId,
                project_id: projectId,
                head_commit_id: null,
                project: { id: projectId },
              },
            },
          ],
        },
      });
      await expect(
        service.createCommit(userId, {
          branch_id: branchId,
          message: 'msg',
          expectedHeadCommitId: commitId2,
        }),
      ).rejects.toThrow(
        new ConflictException(
          'Branch has moved on with new commits. Please review changes.',
        ),
      );
    });

    it('UTCID09 throws BadRequestException when snapshot is identical to head', async () => {
      const { service } = makeService({
        tables: {
          branches: [
            {
              data: {
                id: branchId,
                project_id: projectId,
                head_commit_id: commitId1,
                project: { id: projectId },
              },
            },
          ],
          commits: [{ data: { snapshot: baseSnapshot } }],
        },
      });
      await expect(
        service.createCommit(userId, {
          branch_id: branchId,
          message: 'msg',
          snapshot: baseSnapshot,
        }),
      ).rejects.toThrow(
        new BadRequestException(
          'Working draft is identical to the most recent commit',
        ),
      );
    });

    it('UTCID10 throws InternalServerErrorException when create_commit_atomic RPC fails', async () => {
      const { service } = makeService({
        tables: {
          branches: [
            {
              data: {
                id: branchId,
                project_id: projectId,
                head_commit_id: null,
                project: { id: projectId },
              },
            },
          ],
          drafts: [{ data: { snapshot: baseSnapshot } }],
        },
        rpc: {
          create_commit_atomic: {
            error: { message: 'db error in atomic rpc' },
          },
        },
      });
      await expect(
        service.createCommit(userId, {
          branch_id: branchId,
          message: 'msg',
        }),
      ).rejects.toThrow(
        new InternalServerErrorException(
          'Failed to create commit: db error in atomic rpc',
        ),
      );
    });

    it('UTCID11 creates commit when user is collaborator with edit permission', async () => {
      const commitRow = {
        id: commitId2,
        branch_id: branchId,
        author_id: otherUserId,
        message: 'Collaborator commit',
        created_at: '2026-10-28T10:10:00Z',
        snapshot: diffSnapshot,
      };
      const { service } = makeService({
        tables: {
          branches: [
            {
              data: {
                id: branchId,
                project_id: projectId,
                head_commit_id: commitId1,
                project: { id: projectId },
              },
            },
          ],
          projects: [
            {
              data: {
                id: projectId,
                owner_id: userId,
                moderation_hidden_at: null,
                archived_at: null,
              },
            },
          ],
          project_collaborators: [
            { data: { permission_level: 'edit', status: 'accepted' } },
          ],
          commits: [{ data: { snapshot: baseSnapshot } }],
        },
        rpc: {
          create_commit_atomic: { data: commitRow },
        },
      });

      const res = await service.createCommit(otherUserId, {
        branch_id: branchId,
        message: 'Collaborator commit',
        snapshot: diffSnapshot,
      });
      expect(res).toMatchObject({
        id: commitId2,
        branch_id: branchId,
        message: 'Collaborator commit',
        created_by: otherUserId,
      });
    });
  });

  // ============================================================================
  // SHEET: BE-CMT-02 (CommitsService.getCommitHistory)
  // ============================================================================
  describe('BE-CMT-02 CommitsService.getCommitHistory(dto, userId)', () => {
    it('UTCID01 returns paginated commits with authors and tags for owned branch', async () => {
      const commitData = [
        {
          id: commitId1,
          branch_id: branchId,
          author_id: userId,
          message: 'Init',
          created_at: '2026-10-28T10:00:00Z',
        },
      ];
      const { service } = makeService({
        tables: {
          branches: [
            {
              data: {
                id: branchId,
                project_id: projectId,
                project: { id: projectId },
              },
            },
          ],
          commits: [{ data: commitData, count: 1 }],
          commit_tags: [
            {
              data: [
                {
                  id: 't1',
                  commit_id: commitId1,
                  name: 'v1.0',
                  created_at: '2026-10-28T10:00:00Z',
                },
              ],
            },
          ],
          users: [
            {
              data: [
                {
                  id: userId,
                  username: 'alice',
                  display_name: 'Alice',
                  avatar_url: null,
                },
              ],
            },
          ],
        },
      });

      const res = await service.getCommitHistory(
        { branch_id: branchId },
        userId,
      );
      expect(res.total).toBe(1);
      expect(res.totalPages).toBe(1);
      expect(res.items).toHaveLength(1);
      expect(res.items[0].author.username).toBe('alice');
      expect(res.items[0].tags).toHaveLength(1);
    });

    it('UTCID02 queries user owned projects branches when branch_id is undefined', async () => {
      const { service, builders } = makeService({
        tables: {
          projects: [{ data: [{ id: projectId }] }],
          branches: [{ data: [{ id: branchId }] }],
          commits: [{ data: [], count: 0 }],
        },
      });

      const res = await service.getCommitHistory(
        { page: 3, limit: 20 },
        userId,
      );
      expect(res.items).toEqual([]);
      expect(builders.commits.range).toHaveBeenCalledWith(40, 59);
    });

    it('UTCID03 returns empty page when user owns no projects and branch_id omitted', async () => {
      const { service } = makeService({
        tables: {
          projects: [{ data: [] }],
        },
      });

      const res = await service.getCommitHistory({}, userId);
      expect(res.items).toEqual([]);
      expect(res.total).toBe(0);
      expect(res.totalPages).toBe(0);
    });

    it('UTCID04 handles limit 1 boundary correctly', async () => {
      const { service } = makeService({
        tables: {
          branches: [
            {
              data: {
                id: branchId,
                project_id: projectId,
                project: { id: projectId },
              },
            },
          ],
          commits: [{ data: [], count: 5 }],
        },
      });

      const res = await service.getCommitHistory(
        { branch_id: branchId, page: 1, limit: 1 },
        userId,
      );
      expect(res.totalPages).toBe(5);
    });

    it('UTCID05 handles limit 100 boundary correctly', async () => {
      const { service, builders } = makeService({
        tables: {
          branches: [
            {
              data: {
                id: branchId,
                project_id: projectId,
                project: { id: projectId },
              },
            },
          ],
          commits: [{ data: [], count: 5 }],
        },
      });

      await service.getCommitHistory(
        { branch_id: branchId, page: 1, limit: 100 },
        userId,
      );
      expect(builders.commits.range).toHaveBeenCalledWith(0, 99);
    });

    it('UTCID06 throws NotFoundException when branch is not found', async () => {
      const { service } = makeService({
        tables: {
          branches: [{ data: null }],
        },
      });
      await expect(
        service.getCommitHistory({ branch_id: branchId }, userId),
      ).rejects.toThrow(new NotFoundException('Branch not found'));
    });

    it('UTCID07 throws BadRequestException/ForbiddenException when accessing foreign branch', async () => {
      const { service } = makeService({
        tables: {
          branches: [
            {
              data: {
                id: branchId,
                project_id: projectId,
                project: { id: projectId },
              },
            },
          ],
          projects: [
            {
              data: {
                id: projectId,
                owner_id: otherUserId,
                moderation_hidden_at: null,
                archived_at: null,
              },
            },
          ],
        },
      });
      await expect(
        service.getCommitHistory({ branch_id: branchId }, userId),
      ).rejects.toThrow();
    });

    it('UTCID08 throws InternalServerErrorException when commits query fails', async () => {
      const { service } = makeService({
        tables: {
          branches: [
            {
              data: {
                id: branchId,
                project_id: projectId,
                project: { id: projectId },
              },
            },
          ],
          commits: [{ data: null, error: { message: 'db timeout' } }],
        },
      });
      await expect(
        service.getCommitHistory({ branch_id: branchId }, userId),
      ).rejects.toThrow(
        new InternalServerErrorException(
          'Failed to fetch commit history: db timeout',
        ),
      );
    });

    it('UTCID09 returns empty items when query returns data null and count null', async () => {
      const { service } = makeService({
        tables: {
          branches: [
            {
              data: {
                id: branchId,
                project_id: projectId,
                project: { id: projectId },
              },
            },
          ],
          commits: [{ data: null, count: null }],
        },
      });

      const res = await service.getCommitHistory(
        { branch_id: branchId },
        userId,
      );
      expect(res.items).toEqual([]);
      expect(res.total).toBe(0);
      expect(res.totalPages).toBe(0);
    });

    it('UTCID10 falls back to null username when author row is missing', async () => {
      const commitData = [
        {
          id: commitId1,
          branch_id: branchId,
          author_id: otherUserId,
          message: 'No author',
          created_at: '2026-10-28T10:00:00Z',
        },
      ];
      const { service } = makeService({
        tables: {
          branches: [
            {
              data: {
                id: branchId,
                project_id: projectId,
                project: { id: projectId },
              },
            },
          ],
          commits: [{ data: commitData, count: 1 }],
          users: [{ data: [] }],
        },
      });

      const res = await service.getCommitHistory(
        { branch_id: branchId },
        userId,
      );
      expect(res.items[0].author.username).toBeNull();
    });

    it('UTCID11 allows collaborator with view permission to list commit history', async () => {
      const commitData = [
        {
          id: commitId1,
          branch_id: branchId,
          author_id: userId,
          message: 'Collab list',
          created_at: '2026-10-28T10:00:00Z',
        },
      ];
      const { service } = makeService({
        tables: {
          branches: [
            {
              data: {
                id: branchId,
                project_id: projectId,
                project: { id: projectId },
              },
            },
          ],
          projects: [
            {
              data: {
                id: projectId,
                owner_id: otherUserId,
                moderation_hidden_at: null,
                archived_at: null,
              },
            },
          ],
          project_collaborators: [
            { data: { permission_level: 'view', status: 'accepted' } },
          ],
          commits: [{ data: commitData, count: 1 }],
        },
      });

      const res = await service.getCommitHistory(
        { branch_id: branchId },
        userId,
      );
      expect(res.items).toHaveLength(1);
    });
  });

  // ============================================================================
  // SHEET: BE-CMT-03 (CommitsService.getCommitById)
  // ============================================================================
  describe('BE-CMT-03 CommitsService.getCommitById(commitId, userId)', () => {
    it('UTCID01 returns commit with author info and tags when owned by user', async () => {
      const commitData = {
        id: commitId1,
        branch_id: branchId,
        author_id: userId,
        message: 'Detailed commit',
        created_at: '2026-10-28T10:00:00Z',
        branch: { project_id: projectId },
      };
      const { service } = makeService({
        tables: {
          commits: [{ data: commitData }],
          commit_tags: [
            {
              data: [
                {
                  id: 't1',
                  commit_id: commitId1,
                  name: 'v1.0',
                  created_at: '2026-10-28T10:00:00Z',
                },
              ],
            },
          ],
          users: [
            {
              data: {
                id: userId,
                username: 'alice',
                display_name: 'Alice',
                avatar_url: null,
              },
            },
          ],
        },
      });

      const res = await service.getCommitById(commitId1, userId);
      expect(res.id).toBe(commitId1);
      expect(res.author.username).toBe('alice');
      expect(res.tags).toHaveLength(1);
    });

    it('UTCID02 falls back to author id when user profile row is missing', async () => {
      const commitData = {
        id: commitId1,
        branch_id: branchId,
        author_id: userId,
        message: 'Fallback author',
        created_at: '2026-10-28T10:00:00Z',
        branch: { project_id: projectId },
      };
      const { service } = makeService({
        tables: {
          commits: [{ data: commitData }],
          users: [{ data: null }],
        },
      });

      const res = await service.getCommitById(commitId1, userId);
      expect(res.author.id).toBe(userId);
      expect(res.author.username).toBeNull();
      expect(res.tags).toEqual([]);
    });

    it('UTCID03 throws NotFoundException when commits query returns error', async () => {
      const { service } = makeService({
        tables: {
          commits: [{ data: null, error: { message: 'not found' } }],
        },
      });
      await expect(service.getCommitById(commitId1, userId)).rejects.toThrow(
        new NotFoundException('Commit not found'),
      );
    });

    it('UTCID04 throws NotFoundException when commit returns null', async () => {
      const { service } = makeService({
        tables: {
          commits: [{ data: null }],
        },
      });
      await expect(service.getCommitById(commitId1, userId)).rejects.toThrow(
        new NotFoundException('Commit not found'),
      );
    });

    it('UTCID05 throws NotFoundException when project is not found', async () => {
      const commitData = {
        id: commitId1,
        branch: { project_id: projectId },
      };
      const { service } = makeService({
        tables: {
          commits: [{ data: commitData }],
          projects: [{ data: null }],
        },
      });
      await expect(service.getCommitById(commitId1, userId)).rejects.toThrow(
        new NotFoundException('Project not found'),
      );
    });

    it('UTCID06 throws ForbiddenException when project is owned by someone else', async () => {
      const commitData = {
        id: commitId1,
        branch: { project_id: projectId },
      };
      const { service } = makeService({
        tables: {
          commits: [{ data: commitData }],
          projects: [
            {
              data: {
                id: projectId,
                owner_id: otherUserId,
                moderation_hidden_at: null,
                archived_at: null,
              },
            },
          ],
        },
      });
      await expect(service.getCommitById(commitId1, userId)).rejects.toThrow(
        new ForbiddenException('You do not have access to this project'),
      );
    });

    it('UTCID07 throws NotFoundException when branch is null in commit record', async () => {
      const commitData = {
        id: commitId1,
        branch: null,
      };
      const { service } = makeService({
        tables: {
          commits: [{ data: commitData }],
        },
      });
      await expect(service.getCommitById(commitId1, userId)).rejects.toThrow(
        new NotFoundException('Commit not found'),
      );
    });

    it('UTCID08 allows collaborator with view permission to get commit by id', async () => {
      const commitData = {
        id: commitId1,
        branch_id: branchId,
        author_id: otherUserId,
        message: 'Collab commit',
        created_at: '2026-10-28T10:00:00Z',
        branch: { project_id: projectId },
      };
      const { service } = makeService({
        tables: {
          commits: [{ data: commitData }],
          projects: [
            {
              data: {
                id: projectId,
                owner_id: otherUserId,
                moderation_hidden_at: null,
                archived_at: null,
              },
            },
          ],
          project_collaborators: [
            { data: { permission_level: 'view', status: 'accepted' } },
          ],
          users: [
            {
              data: {
                id: otherUserId,
                username: 'bob',
                display_name: 'Bob',
                avatar_url: null,
              },
            },
          ],
        },
      });

      const res = await service.getCommitById(commitId1, userId);
      expect(res.id).toBe(commitId1);
    });
  });

  // ============================================================================
  // SHEET: BE-CMT-04 (CommitsService.tagCommit)
  // ============================================================================
  describe('BE-CMT-04 CommitsService.tagCommit(commitId, userId, dto)', () => {
    it('UTCID01 creates tag for owned commit with name "v1-0"', async () => {
      const tagRow = {
        id: 't1',
        commit_id: commitId1,
        name: 'v1-0',
        created_by: userId,
        created_at: '2026-10-28T10:00:00Z',
      };
      const { service } = makeService({
        tables: {
          commits: [{ data: { branch: { project_id: projectId } } }],
          commit_tags: [{ data: tagRow }],
        },
      });

      const res = await service.tagCommit(commitId1, userId, { tag: 'v1-0' });
      expect(res).toEqual(tagRow);
    });

    it('UTCID02 creates tag with 1 char "a" boundary', async () => {
      const tagRow = {
        id: 't1',
        commit_id: commitId1,
        name: 'a',
        created_by: userId,
        created_at: '2026-10-28T10:00:00Z',
      };
      const { service } = makeService({
        tables: {
          commits: [{ data: { branch: { project_id: projectId } } }],
          commit_tags: [{ data: tagRow }],
        },
      });

      const res = await service.tagCommit(commitId1, userId, { tag: 'a' });
      expect(res).toEqual(tagRow);
    });

    it('UTCID03 creates tag with 30 chars boundary', async () => {
      const tag30 = 'a'.repeat(30);
      const tagRow = {
        id: 't1',
        commit_id: commitId1,
        name: tag30,
        created_by: userId,
        created_at: '2026-10-28T10:00:00Z',
      };
      const { service } = makeService({
        tables: {
          commits: [{ data: { branch: { project_id: projectId } } }],
          commit_tags: [{ data: tagRow }],
        },
      });

      const res = await service.tagCommit(commitId1, userId, { tag: tag30 });
      expect(res).toEqual(tagRow);
    });

    it('UTCID04 replaces existing tag when commit is already tagged', async () => {
      const replacedTag = {
        id: 't1',
        commit_id: commitId1,
        name: 'v2-0',
        created_by: userId,
        created_at: '2026-10-28T10:10:00Z',
      };
      const { service } = makeService({
        tables: {
          commits: [{ data: { branch: { project_id: projectId } } }],
          commit_tags: [{ data: replacedTag }],
        },
      });

      const res = await service.tagCommit(commitId1, userId, { tag: 'v2-0' });
      expect(res.name).toBe('v2-0');
    });

    it('UTCID05 throws NotFoundException when commit is not found', async () => {
      const { service } = makeService({
        tables: {
          commits: [{ data: null }],
        },
      });
      await expect(
        service.tagCommit(commitId1, userId, { tag: 'v1-0' }),
      ).rejects.toThrow(new NotFoundException('Commit not found'));
    });

    it('UTCID06 throws NotFoundException when commit branch has no project', async () => {
      const { service } = makeService({
        tables: {
          commits: [{ data: { branch: null } }],
        },
      });
      await expect(
        service.tagCommit(commitId1, userId, { tag: 'v1-0' }),
      ).rejects.toThrow(new NotFoundException('Commit not found'));
    });

    it('UTCID07 throws ForbiddenException when project is owned by someone else', async () => {
      const { service } = makeService({
        tables: {
          commits: [{ data: { branch: { project_id: projectId } } }],
          projects: [
            {
              data: {
                id: projectId,
                owner_id: otherUserId,
                moderation_hidden_at: null,
                archived_at: null,
              },
            },
          ],
        },
      });
      await expect(
        service.tagCommit(commitId1, userId, { tag: 'v1-0' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('UTCID08 throws ConflictException when error code is 23505 (duplicate tag name)', async () => {
      const { service } = makeService({
        tables: {
          commits: [{ data: { branch: { project_id: projectId } } }],
          commit_tags: [
            {
              data: null,
              error: { code: '23505', message: 'duplicate key value' },
            },
          ],
        },
      });
      await expect(
        service.tagCommit(commitId1, userId, { tag: 'v1-0' }),
      ).rejects.toThrow(
        new ConflictException('Tag name already exists in this project'),
      );
    });

    it('UTCID09 throws InternalServerErrorException on database error with other code', async () => {
      const { service } = makeService({
        tables: {
          commits: [{ data: { branch: { project_id: projectId } } }],
          commit_tags: [{ data: null, error: { message: 'db error' } }],
        },
      });
      await expect(
        service.tagCommit(commitId1, userId, { tag: 'v1-0' }),
      ).rejects.toThrow(
        new InternalServerErrorException('Failed to create tag: db error'),
      );
    });

    it('UTCID10 throws InternalServerErrorException when tag data is null', async () => {
      const { service } = makeService({
        tables: {
          commits: [{ data: { branch: { project_id: projectId } } }],
          commit_tags: [{ data: null }],
        },
      });
      await expect(
        service.tagCommit(commitId1, userId, { tag: 'v1-0' }),
      ).rejects.toThrow(
        new InternalServerErrorException('Tag was not created'),
      );
    });

    it('UTCID11 creates tag when user is collaborator with edit permission', async () => {
      const tagRow = {
        id: 't1',
        commit_id: commitId1,
        name: 'v1-0',
        created_by: otherUserId,
        created_at: '2026-10-28T10:00:00Z',
      };
      const { service } = makeService({
        tables: {
          commits: [{ data: { branch: { project_id: projectId } } }],
          projects: [
            {
              data: {
                id: projectId,
                owner_id: userId,
                moderation_hidden_at: null,
                archived_at: null,
              },
            },
          ],
          project_collaborators: [
            { data: { permission_level: 'edit', status: 'accepted' } },
          ],
          commit_tags: [{ data: tagRow }],
        },
      });

      const res = await service.tagCommit(commitId1, otherUserId, {
        tag: 'v1-0',
      });
      expect(res).toEqual(tagRow);
    });
  });

  // ============================================================================
  // SHEET: BE-CMT-05 (CommitsService.getTagsForCommit)
  // ============================================================================
  describe('BE-CMT-05 CommitsService.getTagsForCommit(commitId, userId)', () => {
    it('UTCID01 returns 2 tags sorted ascending by created_at', async () => {
      const tags = [
        {
          id: 't1',
          commit_id: commitId1,
          name: 'tag1',
          created_at: '2026-10-28T10:00:00Z',
        },
        {
          id: 't2',
          commit_id: commitId1,
          name: 'tag2',
          created_at: '2026-10-28T11:00:00Z',
        },
      ];
      const { service } = makeService({
        tables: {
          commits: [{ data: { branch: { project_id: projectId } } }],
          commit_tags: [{ data: tags }],
        },
      });

      const res = await service.getTagsForCommit(commitId1, userId);
      expect(res).toEqual(tags);
    });

    it('UTCID02 returns empty array when no tags exist', async () => {
      const { service } = makeService({
        tables: {
          commits: [{ data: { branch: { project_id: projectId } } }],
          commit_tags: [{ data: [] }],
        },
      });

      const res = await service.getTagsForCommit(commitId1, userId);
      expect(res).toEqual([]);
    });

    it('UTCID03 returns empty array when query returns data null', async () => {
      const { service } = makeService({
        tables: {
          commits: [{ data: { branch: { project_id: projectId } } }],
          commit_tags: [{ data: null }],
        },
      });

      const res = await service.getTagsForCommit(commitId1, userId);
      expect(res).toEqual([]);
    });

    it('UTCID04 throws NotFoundException when commit is not found', async () => {
      const { service } = makeService({
        tables: {
          commits: [{ data: null }],
        },
      });
      await expect(service.getTagsForCommit(commitId1, userId)).rejects.toThrow(
        new NotFoundException('Commit not found'),
      );
    });

    it('UTCID05 throws ForbiddenException when project owned by another user', async () => {
      const { service } = makeService({
        tables: {
          commits: [{ data: { branch: { project_id: projectId } } }],
          projects: [
            {
              data: {
                id: projectId,
                owner_id: otherUserId,
                moderation_hidden_at: null,
                archived_at: null,
              },
            },
          ],
        },
      });
      await expect(service.getTagsForCommit(commitId1, userId)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('UTCID06 throws InternalServerErrorException on tags query error', async () => {
      const { service } = makeService({
        tables: {
          commits: [{ data: { branch: { project_id: projectId } } }],
          commit_tags: [{ data: null, error: { message: 'db error' } }],
        },
      });
      await expect(service.getTagsForCommit(commitId1, userId)).rejects.toThrow(
        new InternalServerErrorException('Failed to fetch tags: db error'),
      );
    });

    it('UTCID07 allows collaborator to read tags for commit', async () => {
      const tags = [
        {
          id: 't1',
          commit_id: commitId1,
          name: 'tag1',
          created_at: '2026-10-28T10:00:00Z',
        },
      ];
      const { service } = makeService({
        tables: {
          commits: [{ data: { branch: { project_id: projectId } } }],
          projects: [
            {
              data: {
                id: projectId,
                owner_id: userId,
                moderation_hidden_at: null,
                archived_at: null,
              },
            },
          ],
          project_collaborators: [
            { data: { permission_level: 'view', status: 'accepted' } },
          ],
          commit_tags: [{ data: tags }],
        },
      });

      const res = await service.getTagsForCommit(commitId1, otherUserId);
      expect(res).toEqual(tags);
    });
  });

  // ============================================================================
  // SHEET: BE-CMT-06 (CommitsService.deleteTag)
  // ============================================================================
  describe('BE-CMT-06 CommitsService.deleteTag(commitId, tagName, userId)', () => {
    it('UTCID01 successfully deletes existing tag', async () => {
      const { service, builders } = makeService({
        tables: {
          commits: [{ data: { branch: { project_id: projectId } } }],
          commit_tags: [{ data: null }],
        },
      });

      await expect(
        service.deleteTag(commitId1, 'v1-0', userId),
      ).resolves.toBeUndefined();
      expect(builders.commit_tags.delete).toHaveBeenCalled();
    });

    it('UTCID02 succeeds as silent no-op when tag name does not match', async () => {
      const { service } = makeService({
        tables: {
          commits: [{ data: { branch: { project_id: projectId } } }],
          commit_tags: [{ data: null }],
        },
      });

      await expect(
        service.deleteTag(commitId1, 'missing', userId),
      ).resolves.toBeUndefined();
    });

    it('UTCID03 throws NotFoundException when commit is not found', async () => {
      const { service } = makeService({
        tables: {
          commits: [{ data: null }],
        },
      });
      await expect(
        service.deleteTag(commitId1, 'v1-0', userId),
      ).rejects.toThrow(new NotFoundException('Commit not found'));
    });

    it('UTCID04 throws ForbiddenException when project is owned by someone else', async () => {
      const { service } = makeService({
        tables: {
          commits: [{ data: { branch: { project_id: projectId } } }],
          projects: [
            {
              data: {
                id: projectId,
                owner_id: otherUserId,
                moderation_hidden_at: null,
                archived_at: null,
              },
            },
          ],
        },
      });
      await expect(
        service.deleteTag(commitId1, 'v1-0', userId),
      ).rejects.toThrow(ForbiddenException);
    });

    it('UTCID05 throws InternalServerErrorException when delete fails', async () => {
      const { service } = makeService({
        tables: {
          commits: [{ data: { branch: { project_id: projectId } } }],
          commit_tags: [{ data: null, error: { message: 'delete failed' } }],
        },
      });
      await expect(
        service.deleteTag(commitId1, 'v1-0', userId),
      ).rejects.toThrow(
        new InternalServerErrorException('Failed to delete tag: delete failed'),
      );
    });

    it('UTCID06 deletes tag when user is collaborator with edit permission', async () => {
      const { service } = makeService({
        tables: {
          commits: [{ data: { branch: { project_id: projectId } } }],
          projects: [
            {
              data: {
                id: projectId,
                owner_id: userId,
                moderation_hidden_at: null,
                archived_at: null,
              },
            },
          ],
          project_collaborators: [
            { data: { permission_level: 'edit', status: 'accepted' } },
          ],
          commit_tags: [{ data: null }],
        },
      });

      await expect(
        service.deleteTag(commitId1, 'v1-0', otherUserId),
      ).resolves.toBeUndefined();
    });
  });

  // ============================================================================
  // SHEET: BE-CMT-07 (CommitsService.compareCommits)
  // ============================================================================
  describe('BE-CMT-07 CommitsService.compareCommits(baseCommitId, targetCommitId, userId)', () => {
    it('UTCID01 returns diff between two different commits of same project', async () => {
      const { service } = makeService({
        tables: {
          commits: [
            {
              data: {
                snapshot: baseSnapshot,
                branch: { project_id: projectId },
              },
            },
            {
              data: {
                snapshot: diffSnapshot,
                branch: { project_id: projectId },
              },
            },
          ],
        },
      });

      const res = await service.compareCommits(commitId1, commitId2, userId);
      expect(res.areIdentical).toBe(false);
      expect(res.summary.notes.modified).toBe(1);
    });

    it('UTCID02 returns areIdentical true when comparing same commit id', async () => {
      const { service } = makeService({
        tables: {
          commits: [
            {
              data: {
                snapshot: baseSnapshot,
                branch: { project_id: projectId },
              },
            },
            {
              data: {
                snapshot: baseSnapshot,
                branch: { project_id: projectId },
              },
            },
          ],
        },
      });

      const res = await service.compareCommits(commitId1, commitId1, userId);
      expect(res.areIdentical).toBe(true);
    });

    it('UTCID03 throws NotFoundException when base commit is not found', async () => {
      const { service } = makeService({
        tables: {
          commits: [
            { data: null },
            {
              data: {
                snapshot: diffSnapshot,
                branch: { project_id: projectId },
              },
            },
          ],
        },
      });
      await expect(
        service.compareCommits(commitId1, commitId2, userId),
      ).rejects.toThrow(new NotFoundException('Base commit not found'));
    });

    it('UTCID04 throws NotFoundException when target commit is not found', async () => {
      const { service } = makeService({
        tables: {
          commits: [
            {
              data: {
                snapshot: baseSnapshot,
                branch: { project_id: projectId },
              },
            },
            { data: null },
          ],
        },
      });
      await expect(
        service.compareCommits(commitId1, commitId2, userId),
      ).rejects.toThrow(new NotFoundException('Target commit not found'));
    });

    it('UTCID05 throws BadRequestException when commits belong to different projects', async () => {
      const { service } = makeService({
        tables: {
          commits: [
            {
              data: {
                snapshot: baseSnapshot,
                branch: { project_id: projectId },
              },
            },
            {
              data: {
                snapshot: diffSnapshot,
                branch: { project_id: 'other-proj' },
              },
            },
          ],
        },
      });
      await expect(
        service.compareCommits(commitId1, commitId2, userId),
      ).rejects.toThrow(
        new BadRequestException(
          'Cannot compare commits from different projects',
        ),
      );
    });

    it('UTCID06 throws NotFoundException when project is not found', async () => {
      const { service } = makeService({
        tables: {
          commits: [
            {
              data: {
                snapshot: baseSnapshot,
                branch: { project_id: projectId },
              },
            },
            {
              data: {
                snapshot: diffSnapshot,
                branch: { project_id: projectId },
              },
            },
          ],
          projects: [{ data: null }],
        },
      });
      await expect(
        service.compareCommits(commitId1, commitId2, userId),
      ).rejects.toThrow(new NotFoundException('Project not found'));
    });

    it('UTCID07 throws ForbiddenException when project is owned by someone else', async () => {
      const { service } = makeService({
        tables: {
          commits: [
            {
              data: {
                snapshot: baseSnapshot,
                branch: { project_id: projectId },
              },
            },
            {
              data: {
                snapshot: diffSnapshot,
                branch: { project_id: projectId },
              },
            },
          ],
          projects: [
            {
              data: {
                id: projectId,
                owner_id: otherUserId,
                moderation_hidden_at: null,
                archived_at: null,
              },
            },
          ],
        },
      });
      await expect(
        service.compareCommits(commitId1, commitId2, userId),
      ).rejects.toThrow(ForbiddenException);
    });

    it('UTCID08 returns diff without project access check when both branches are null', async () => {
      const { service } = makeService({
        tables: {
          commits: [
            { data: { snapshot: baseSnapshot, branch: null } },
            { data: { snapshot: diffSnapshot, branch: null } },
          ],
        },
      });

      const res = await service.compareCommits(commitId1, commitId2, userId);
      expect(res.areIdentical).toBe(false);
    });

    it('UTCID09 allows collaborator to compare commits in the project', async () => {
      const { service } = makeService({
        tables: {
          commits: [
            {
              data: {
                snapshot: baseSnapshot,
                branch: { project_id: projectId },
              },
            },
            {
              data: {
                snapshot: diffSnapshot,
                branch: { project_id: projectId },
              },
            },
          ],
          projects: [
            {
              data: {
                id: projectId,
                owner_id: userId,
                moderation_hidden_at: null,
                archived_at: null,
              },
            },
          ],
          project_collaborators: [
            { data: { permission_level: 'view', status: 'accepted' } },
          ],
        },
      });

      const res = await service.compareCommits(
        commitId1,
        commitId2,
        otherUserId,
      );
      expect(res.areIdentical).toBe(false);
    });
  });

  // ============================================================================
  // SHEET: BE-CMT-08 (CommitsService.restoreCommit)
  // ============================================================================
  describe('BE-CMT-08 CommitsService.restoreCommit(commitId, userId, dto)', () => {
    it('UTCID01 restores commit with default generated message', async () => {
      const restoredRow = {
        id: commitId2,
        branch_id: branchId,
        author_id: userId,
        message: `Khôi phục phiên bản "" (${commitId1.substring(0, 8)})`,
        created_at: '2026-10-28T10:00:00Z',
        snapshot: baseSnapshot,
      };
      const { service } = makeService({
        tables: {
          branches: [
            {
              data: {
                id: branchId,
                project_id: projectId,
                head_commit_id: 'some-other-head',
                project: { id: projectId },
              },
            },
          ],
          commits: [
            {
              data: {
                id: commitId1,
                snapshot: baseSnapshot,
                branch: { project_id: projectId },
              },
            },
          ],
        },
        rpc: {
          create_commit_atomic: { data: restoredRow },
        },
      });

      const res = await service.restoreCommit(commitId1, userId, {
        branch_id: branchId,
      });
      expect(res).toMatchObject({ id: commitId2, branch_id: branchId });
      expect(res.message).toContain(commitId1.substring(0, 8));
    });

    it('UTCID02 restores commit with custom message "Back to chorus"', async () => {
      const restoredRow = {
        id: commitId2,
        branch_id: branchId,
        author_id: userId,
        message: 'Back to chorus',
        created_at: '2026-10-28T10:00:00Z',
        snapshot: baseSnapshot,
      };
      const { service } = makeService({
        tables: {
          branches: [
            {
              data: {
                id: branchId,
                project_id: projectId,
                head_commit_id: 'some-other-head',
                project: { id: projectId },
              },
            },
          ],
          commits: [
            {
              data: {
                id: commitId1,
                snapshot: baseSnapshot,
                branch: { project_id: projectId },
              },
            },
          ],
        },
        rpc: {
          create_commit_atomic: { data: restoredRow },
        },
      });

      const res = await service.restoreCommit(commitId1, userId, {
        branch_id: branchId,
        message: 'Back to chorus',
      });
      expect(res.message).toBe('Back to chorus');
    });

    it('UTCID03 restores commit with 200-char message boundary', async () => {
      const msg200 = 'R'.repeat(200);
      const restoredRow = {
        id: commitId2,
        branch_id: branchId,
        author_id: userId,
        message: msg200,
        created_at: '2026-10-28T10:00:00Z',
        snapshot: baseSnapshot,
      };
      const { service } = makeService({
        tables: {
          branches: [
            {
              data: {
                id: branchId,
                project_id: projectId,
                head_commit_id: 'some-other-head',
                project: { id: projectId },
              },
            },
          ],
          commits: [
            {
              data: {
                id: commitId1,
                snapshot: baseSnapshot,
                branch: { project_id: projectId },
              },
            },
          ],
        },
        rpc: {
          create_commit_atomic: { data: restoredRow },
        },
      });

      const res = await service.restoreCommit(commitId1, userId, {
        branch_id: branchId,
        message: msg200,
      });
      expect(res.message).toBe(msg200);
    });

    it('UTCID04 restores commit when head is null', async () => {
      const restoredRow = {
        id: commitId2,
        branch_id: branchId,
        author_id: userId,
        message: `Khôi phục phiên bản "" (${commitId1.substring(0, 8)})`,
        created_at: '2026-10-28T10:00:00Z',
        snapshot: baseSnapshot,
      };
      const { service } = makeService({
        tables: {
          branches: [
            {
              data: {
                id: branchId,
                project_id: projectId,
                head_commit_id: null,
                project: { id: projectId },
              },
            },
          ],
          commits: [
            {
              data: {
                id: commitId1,
                snapshot: baseSnapshot,
                branch: { project_id: projectId },
              },
            },
          ],
        },
        rpc: {
          create_commit_atomic: { data: restoredRow },
        },
      });

      const res = await service.restoreCommit(commitId1, userId, {
        branch_id: branchId,
      });
      expect(res).toMatchObject({ id: commitId2, branch_id: branchId });
    });

    it('UTCID05 throws NotFoundException when branch is not found', async () => {
      const { service } = makeService({
        tables: {
          branches: [{ data: null }],
        },
      });
      await expect(
        service.restoreCommit(commitId1, userId, { branch_id: branchId }),
      ).rejects.toThrow(new NotFoundException('Branch not found'));
    });

    it('UTCID06 throws ForbiddenException/BadRequestException when branch project is not accessible', async () => {
      const { service } = makeService({
        tables: {
          branches: [
            {
              data: {
                id: branchId,
                project_id: projectId,
                head_commit_id: null,
                project: { id: projectId },
              },
            },
          ],
          projects: [
            {
              data: {
                id: projectId,
                owner_id: otherUserId,
                moderation_hidden_at: null,
                archived_at: null,
              },
            },
          ],
        },
      });
      await expect(
        service.restoreCommit(commitId1, userId, { branch_id: branchId }),
      ).rejects.toThrow();
    });

    it('UTCID07 throws NotFoundException when commit to restore is not found', async () => {
      const { service } = makeService({
        tables: {
          branches: [
            {
              data: {
                id: branchId,
                project_id: projectId,
                head_commit_id: 'head-1',
                project: { id: projectId },
              },
            },
          ],
          commits: [{ data: null }],
        },
      });
      await expect(
        service.restoreCommit(commitId1, userId, { branch_id: branchId }),
      ).rejects.toThrow(new NotFoundException('Commit to restore not found'));
    });

    it('UTCID08 throws ForbiddenException when restoring commit from different project', async () => {
      const { service } = makeService({
        tables: {
          branches: [
            {
              data: {
                id: branchId,
                project_id: projectId,
                head_commit_id: 'head-1',
                project: { id: projectId },
              },
            },
          ],
          commits: [
            {
              data: {
                id: commitId1,
                snapshot: baseSnapshot,
                branch: { project_id: 'foreign-proj' },
              },
            },
          ],
        },
      });
      await expect(
        service.restoreCommit(commitId1, userId, { branch_id: branchId }),
      ).rejects.toThrow(
        new ForbiddenException(
          'Cannot restore a commit from a different project',
        ),
      );
    });

    it('UTCID09 throws BadRequestException when commit is already the head commit', async () => {
      const { service } = makeService({
        tables: {
          branches: [
            {
              data: {
                id: branchId,
                project_id: projectId,
                head_commit_id: commitId1,
                project: { id: projectId },
              },
            },
          ],
          commits: [
            {
              data: {
                id: commitId1,
                snapshot: baseSnapshot,
                branch: { project_id: projectId },
              },
            },
          ],
        },
      });
      await expect(
        service.restoreCommit(commitId1, userId, { branch_id: branchId }),
      ).rejects.toThrow(
        new BadRequestException(
          'Selected commit is already the most recent version on this branch',
        ),
      );
    });

    it('UTCID10 throws InternalServerErrorException when restore RPC fails', async () => {
      const { service } = makeService({
        tables: {
          branches: [
            {
              data: {
                id: branchId,
                project_id: projectId,
                head_commit_id: 'head-other',
                project: { id: projectId },
              },
            },
          ],
          commits: [
            {
              data: {
                id: commitId1,
                snapshot: baseSnapshot,
                branch: { project_id: projectId },
              },
            },
          ],
        },
        rpc: {
          create_commit_atomic: {
            error: { message: 'atomic restore failed' },
          },
        },
      });
      await expect(
        service.restoreCommit(commitId1, userId, { branch_id: branchId }),
      ).rejects.toThrow(
        new InternalServerErrorException(
          'Failed to create restore commit: atomic restore failed',
        ),
      );
    });

    it('UTCID11 restores commit when user is collaborator with edit permission', async () => {
      const restoredRow = {
        id: commitId2,
        branch_id: branchId,
        author_id: otherUserId,
        message: `Khôi phục phiên bản "" (${commitId1.substring(0, 8)})`,
        created_at: '2026-10-28T10:00:00Z',
        snapshot: baseSnapshot,
      };
      const { service } = makeService({
        tables: {
          branches: [
            {
              data: {
                id: branchId,
                project_id: projectId,
                head_commit_id: 'head-other',
                project: { id: projectId },
              },
            },
          ],
          projects: [
            {
              data: {
                id: projectId,
                owner_id: userId,
                moderation_hidden_at: null,
                archived_at: null,
              },
            },
          ],
          project_collaborators: [
            { data: { permission_level: 'edit', status: 'accepted' } },
          ],
          commits: [
            {
              data: {
                id: commitId1,
                snapshot: baseSnapshot,
                branch: { project_id: projectId },
              },
            },
          ],
        },
        rpc: {
          create_commit_atomic: { data: restoredRow },
        },
      });

      const res = await service.restoreCommit(commitId1, otherUserId, {
        branch_id: branchId,
      });
      expect(res).toMatchObject({ id: commitId2, branch_id: branchId });
    });
  });

  // ============================================================================
  // SHEET: BE-CMT-09 (CommitsService.verifyCommitOwnership)
  // ============================================================================
  describe('BE-CMT-09 CommitsService.verifyCommitOwnership(commitId, userId)', () => {
    it('UTCID01 returns projectId when commit belongs to owned project', async () => {
      const { service } = makeService({
        tables: {
          commits: [{ data: { branch: { project_id: projectId } } }],
        },
      });

      await expect(
        service.verifyCommitOwnership(commitId1, userId),
      ).resolves.toBe(projectId);
    });

    it('UTCID02 throws NotFoundException on commits query error', async () => {
      const { service } = makeService({
        tables: {
          commits: [{ data: null, error: { message: 'error' } }],
        },
      });
      await expect(
        service.verifyCommitOwnership(commitId1, userId),
      ).rejects.toThrow(new NotFoundException('Commit not found'));
    });

    it('UTCID03 throws NotFoundException when commit returns null', async () => {
      const { service } = makeService({
        tables: {
          commits: [{ data: null }],
        },
      });
      await expect(
        service.verifyCommitOwnership(commitId1, userId),
      ).rejects.toThrow(new NotFoundException('Commit not found'));
    });

    it('UTCID04 throws NotFoundException when branch is null in commit record', async () => {
      const { service } = makeService({
        tables: {
          commits: [{ data: { branch: null } }],
        },
      });
      await expect(
        service.verifyCommitOwnership(commitId1, userId),
      ).rejects.toThrow(new NotFoundException('Commit not found'));
    });

    it('UTCID05 throws NotFoundException when project is not found', async () => {
      const { service } = makeService({
        tables: {
          commits: [{ data: { branch: { project_id: projectId } } }],
          projects: [{ data: null }],
        },
      });
      await expect(
        service.verifyCommitOwnership(commitId1, userId),
      ).rejects.toThrow(new NotFoundException('Project not found'));
    });

    it('UTCID06 throws ForbiddenException when project is owned by another user', async () => {
      const { service } = makeService({
        tables: {
          commits: [{ data: { branch: { project_id: projectId } } }],
          projects: [
            {
              data: {
                id: projectId,
                owner_id: otherUserId,
                moderation_hidden_at: null,
                archived_at: null,
              },
            },
          ],
        },
      });
      await expect(
        service.verifyCommitOwnership(commitId1, userId),
      ).rejects.toThrow(ForbiddenException);
    });

    it('UTCID07 returns projectId when user is collaborator with edit permission', async () => {
      const { service } = makeService({
        tables: {
          commits: [{ data: { branch: { project_id: projectId } } }],
          projects: [
            {
              data: {
                id: projectId,
                owner_id: userId,
                moderation_hidden_at: null,
                archived_at: null,
              },
            },
          ],
          project_collaborators: [
            { data: { permission_level: 'edit', status: 'accepted' } },
          ],
        },
      });

      await expect(
        service.verifyCommitOwnership(commitId1, otherUserId),
      ).resolves.toBe(projectId);
    });
  });

  // ============================================================================
  // SHEET: BE-CMT-10 (CommitsService.verifyBranchAccess)
  // ============================================================================
  describe('BE-CMT-10 CommitsService.verifyBranchAccess(branchId, userId)', () => {
    it('UTCID01 returns branch db row when user owns project', async () => {
      const branchDbRow = {
        id: branchId,
        project_id: projectId,
        name: 'main',
        is_default: true,
        created_by: userId,
        created_at: '2026-10-28T10:00:00Z',
        base_commit_id: null,
        head_commit_id: commitId1,
        project: { id: projectId },
      };
      const { service } = makeService({
        tables: {
          branches: [{ data: branchDbRow }],
        },
      });

      const res = await (service as any).verifyBranchAccess(
        branchId,
        userId,
        'edit',
      );
      expect(res.id).toBe(branchId);
      expect(res.head_commit_id).toBe(commitId1);
    });

    it('UTCID02 throws NotFoundException on branch query error', async () => {
      const { service } = makeService({
        tables: {
          branches: [{ data: null, error: { message: 'not found' } }],
        },
      });
      await expect(
        (service as any).verifyBranchAccess(branchId, userId, 'edit'),
      ).rejects.toThrow(new NotFoundException('Branch not found'));
    });

    it('UTCID03 throws NotFoundException when branch returns null', async () => {
      const { service } = makeService({
        tables: {
          branches: [{ data: null }],
        },
      });
      await expect(
        (service as any).verifyBranchAccess(branchId, userId, 'edit'),
      ).rejects.toThrow(new NotFoundException('Branch not found'));
    });

    it('UTCID04 throws NotFoundException/BadRequestException when project is null', async () => {
      const { service } = makeService({
        tables: {
          branches: [
            {
              data: {
                id: branchId,
                project_id: projectId,
                project: null,
              },
            },
          ],
          projects: [{ data: null }],
        },
      });
      await expect(
        (service as any).verifyBranchAccess(branchId, userId, 'edit'),
      ).rejects.toThrow();
    });

    it('UTCID05 throws ForbiddenException/BadRequestException when project owned by someone else', async () => {
      const { service } = makeService({
        tables: {
          branches: [
            {
              data: {
                id: branchId,
                project_id: projectId,
                project: { id: projectId },
              },
            },
          ],
          projects: [
            {
              data: {
                id: projectId,
                owner_id: otherUserId,
                moderation_hidden_at: null,
                archived_at: null,
              },
            },
          ],
        },
      });
      await expect(
        (service as any).verifyBranchAccess(branchId, userId, 'edit'),
      ).rejects.toThrow();
    });

    it('UTCID06 returns branch db row when user is edit collaborator', async () => {
      const branchDbRow = {
        id: branchId,
        project_id: projectId,
        name: 'main',
        is_default: true,
        created_by: userId,
        created_at: '2026-10-28T10:00:00Z',
        base_commit_id: null,
        head_commit_id: commitId1,
        project: { id: projectId },
      };
      const { service } = makeService({
        tables: {
          branches: [{ data: branchDbRow }],
          projects: [
            {
              data: {
                id: projectId,
                owner_id: userId,
                moderation_hidden_at: null,
                archived_at: null,
              },
            },
          ],
          project_collaborators: [
            { data: { permission_level: 'edit', status: 'accepted' } },
          ],
        },
      });

      const res = await (service as any).verifyBranchAccess(
        branchId,
        otherUserId,
        'edit',
      );
      expect(res.id).toBe(branchId);
    });
  });

  // ============================================================================
  // SHEET: BE-CMT-11 (CommitsService.isSnapshotIdenticalToHead)
  // ============================================================================
  describe('BE-CMT-11 CommitsService.isSnapshotIdenticalToHead(headCommitId, newSnapshot)', () => {
    it('UTCID01 returns true when snapshots are identical', async () => {
      const { service } = makeService({
        tables: {
          commits: [{ data: { snapshot: baseSnapshot } }],
        },
      });

      const res = await (service as any).isSnapshotIdenticalToHead(
        commitId1,
        baseSnapshot,
      );
      expect(res).toBe(true);
    });

    it('UTCID02 returns false when note velocity is changed', async () => {
      const { service } = makeService({
        tables: {
          commits: [{ data: { snapshot: baseSnapshot } }],
        },
      });

      const res = await (service as any).isSnapshotIdenticalToHead(commitId1, {
        ...baseSnapshot,
        notes: [{ ...baseSnapshot.notes[0], velocity: 80 }],
      });
      expect(res).toBe(false);
    });

    it('UTCID03 returns false when tempo is changed', async () => {
      const { service } = makeService({
        tables: {
          commits: [{ data: { snapshot: baseSnapshot } }],
        },
      });

      const res = await (service as any).isSnapshotIdenticalToHead(commitId1, {
        ...baseSnapshot,
        meta: { ...baseSnapshot.meta, tempo: 140 },
      });
      expect(res).toBe(false);
    });

    it('UTCID04 returns false when commits query returns error', async () => {
      const { service } = makeService({
        tables: {
          commits: [{ data: null, error: { message: 'db error' } }],
        },
      });

      const res = await (service as any).isSnapshotIdenticalToHead(
        commitId1,
        baseSnapshot,
      );
      expect(res).toBe(false);
    });

    it('UTCID05 returns false when commit row is null', async () => {
      const { service } = makeService({
        tables: {
          commits: [{ data: null }],
        },
      });

      const res = await (service as any).isSnapshotIdenticalToHead(
        commitId1,
        baseSnapshot,
      );
      expect(res).toBe(false);
    });
  });

  // ============================================================================
  // SHEET: BE-CMT-12 (CommitsService.normalizeSnapshot)
  // ============================================================================
  describe('BE-CMT-12 CommitsService.normalizeSnapshot(dto)', () => {
    const { service } = makeService();

    it('UTCID01 preserves schemaVersion 3 and meta and copies all fields unchanged', () => {
      const input = {
        schemaVersion: 3,
        meta: { tempo: 90, timeSignature: [3, 4], ppq: 480 },
        tracks: [baseSnapshot.tracks[0]],
        notes: [baseSnapshot.notes[0]],
      };
      const res = (service as any).normalizeSnapshot(input);
      expect(res.schemaVersion).toBe(3);
      expect(res.meta).toEqual({ tempo: 90, timeSignature: [3, 4], ppq: 480 });
      expect(res.tracks[0].id).toBe('t1');
    });

    it('UTCID02 returns schemaVersion 1 and default meta with empty tracks/notes for undefined input', () => {
      const res = (service as any).normalizeSnapshot(undefined);
      expect(res.schemaVersion).toBe(1);
      expect(res.meta).toEqual({ tempo: 120, timeSignature: [4, 4], ppq: 480 });
      expect(res.tracks).toEqual([]);
      expect(res.notes).toEqual([]);
    });

    it('UTCID03 returns empty tracks and notes when empty arrays are provided', () => {
      const input = {
        schemaVersion: 3,
        meta: { tempo: 90, timeSignature: [3, 4], ppq: 480 },
        tracks: [],
      };
      const res = (service as any).normalizeSnapshot(input);
      expect(res.tracks).toEqual([]);
      expect(res.notes).toEqual([]);
    });

    it('UTCID04 applies documented defaults for missing track and note fields', () => {
      const input = {
        schemaVersion: 3,
        meta: { tempo: 90, timeSignature: [3, 4], ppq: 480 },
        tracks: [{ name: 'Solo Synth' }],
        notes: [{ pitch: 60 }],
      };
      const res = (service as any).normalizeSnapshot(input);
      expect(res.tracks[0].order).toBe(0);
      expect(res.tracks[0].color).toBe('#6366f1');
      expect(res.tracks[0].volume).toBe(1);
      expect(res.tracks[0].pan).toBe(0);
      expect(res.tracks[0].id).toBeDefined();

      expect(res.notes[0].start).toBe(0);
      expect(res.notes[0].velocity).toBe(80);
      expect(res.notes[0].duration).toBe(0);
      expect(res.notes[0].id).toBeDefined();
    });

    it('UTCID05 maps isMuted and isSolo to muted and solo', () => {
      const input = {
        schemaVersion: 3,
        meta: { tempo: 90, timeSignature: [3, 4], ppq: 480 },
        tracks: [{ name: 'Track', isMuted: true, isSolo: true }],
      };
      const res = (service as any).normalizeSnapshot(input);
      expect(res.tracks[0].muted).toBe(true);
      expect(res.tracks[0].solo).toBe(true);
    });

    it('UTCID06 sanitizes soundMap dropping out-of-range pitches like 200', () => {
      const input = {
        schemaVersion: 3,
        meta: { tempo: 90, timeSignature: [3, 4], ppq: 480 },
        tracks: [
          {
            name: 'Drums',
            soundMap: {
              '60': '11111111-2222-3333-4444-555555555555',
              '200': '11111111-2222-3333-4444-555555555555',
            },
          },
        ],
      };
      const res = (service as any).normalizeSnapshot(input);
      expect(res.tracks[0].soundMap?.['60']).toBeDefined();
      expect(res.tracks[0].soundMap?.['200']).toBeUndefined();
    });
  });

  // ============================================================================
  // SHEET: BE-CMT-13 (CommitsService.getTagsForCommits)
  // ============================================================================
  describe('BE-CMT-13 CommitsService.getTagsForCommits(commitIds)', () => {
    it('UTCID01 returns empty Map and does not send query when input is empty', async () => {
      const { service, client } = makeService();
      const res = await (service as any).getTagsForCommits([]);
      expect(res.size).toBe(0);
      expect(client.from).not.toHaveBeenCalled();
    });

    it('UTCID02 groups tags correctly for multiple commits', async () => {
      const tagsData = [
        { id: 't1', commit_id: commitId1, name: 'v1.0' },
        { id: 't2', commit_id: commitId1, name: 'alpha' },
        { id: 't3', commit_id: commitId2, name: 'v2.0' },
      ];
      const { service } = makeService({
        tables: {
          commit_tags: [{ data: tagsData }],
        },
      });

      const res = await (service as any).getTagsForCommits([
        commitId1,
        commitId2,
      ]);
      expect(res.get(commitId1)).toEqual([tagsData[0], tagsData[1]]);
      expect(res.get(commitId2)).toEqual([tagsData[2]]);
    });

    it('UTCID03 returns empty Map when query returns empty rows', async () => {
      const { service } = makeService({
        tables: {
          commit_tags: [{ data: [] }],
        },
      });

      const res = await (service as any).getTagsForCommits([
        commitId1,
        commitId2,
      ]);
      expect(res.size).toBe(0);
    });

    it('UTCID04 logs error and returns empty Map on query error', async () => {
      const { service } = makeService({
        tables: {
          commit_tags: [{ data: null, error: { message: 'db error' } }],
        },
      });

      const res = await (service as any).getTagsForCommits([
        commitId1,
        commitId2,
      ]);
      expect(res.size).toBe(0);
    });

    it('UTCID05 returns empty Map when query returns data null', async () => {
      const { service } = makeService({
        tables: {
          commit_tags: [{ data: null }],
        },
      });

      const res = await (service as any).getTagsForCommits([
        commitId1,
        commitId2,
      ]);
      expect(res.size).toBe(0);
    });
  });

  // ============================================================================
  // SHEET: BE-CMT-14 (CommitsService.getAuthorsInfo)
  // ============================================================================
  describe('BE-CMT-14 CommitsService.getAuthorsInfo(userIds)', () => {
    it('UTCID01 returns empty Map and does not send query when input is empty', async () => {
      const { service, client } = makeService();
      const res = await (service as any).getAuthorsInfo([]);
      expect(res.size).toBe(0);
      expect(client.from).not.toHaveBeenCalled();
    });

    it('UTCID02 maps returned author rows into Map', async () => {
      const usersData = [
        {
          id: userId,
          username: 'alice',
          display_name: 'Alice',
          avatar_url: 'a.png',
        },
        {
          id: otherUserId,
          username: 'bob',
          display_name: 'Bob',
          avatar_url: null,
        },
      ];
      const { service } = makeService({
        tables: {
          users: [{ data: usersData }],
        },
      });

      const res = await (service as any).getAuthorsInfo([userId, otherUserId]);
      expect(res.get(userId)?.username).toBe('alice');
      expect(res.get(otherUserId)?.username).toBe('bob');
    });

    it('UTCID03 contains only found users when some are missing', async () => {
      const usersData = [
        {
          id: userId,
          username: 'alice',
          display_name: 'Alice',
          avatar_url: 'a.png',
        },
      ];
      const { service } = makeService({
        tables: {
          users: [{ data: usersData }],
        },
      });

      const res = await (service as any).getAuthorsInfo([userId, otherUserId]);
      expect(res.has(userId)).toBe(true);
      expect(res.has(otherUserId)).toBe(false);
    });

    it('UTCID04 logs error and returns empty Map when query returns error', async () => {
      const { service } = makeService({
        tables: {
          users: [{ data: null, error: { message: 'db error' } }],
        },
      });

      const res = await (service as any).getAuthorsInfo([userId, otherUserId]);
      expect(res.size).toBe(0);
    });

    it('UTCID05 maps missing username and avatar_url to null', async () => {
      const usersData = [{ id: userId, display_name: 'Alice' }];
      const { service } = makeService({
        tables: {
          users: [{ data: usersData }],
        },
      });

      const res = await (service as any).getAuthorsInfo([userId]);
      expect(res.get(userId)?.username).toBeNull();
      expect(res.get(userId)?.avatar_url).toBeNull();
    });
  });

  // ============================================================================
  // SHEET: BE-CMT-15 (CommitsService.verifyProjectOwnership)
  // ============================================================================
  describe('BE-CMT-15 CommitsService.verifyProjectOwnership(projectId, userId)', () => {
    it('UTCID01 resolves void when user owns the project', async () => {
      const { service } = makeService({
        tables: {
          projects: [
            {
              data: {
                id: projectId,
                owner_id: userId,
                moderation_hidden_at: null,
                archived_at: null,
              },
            },
          ],
        },
      });

      await expect(
        service.verifyProjectOwnership(projectId, userId),
      ).resolves.toBeUndefined();
    });

    it('UTCID02 throws NotFoundException when project is null', async () => {
      const { service } = makeService({
        tables: {
          projects: [{ data: null }],
        },
      });

      await expect(
        service.verifyProjectOwnership(projectId, userId),
      ).rejects.toThrow(new NotFoundException('Project not found'));
    });

    it('UTCID03 throws NotFoundException when project query returns error', async () => {
      const { service } = makeService({
        tables: {
          projects: [{ data: null, error: { message: 'db error' } }],
        },
      });

      await expect(
        service.verifyProjectOwnership(projectId, userId),
      ).rejects.toThrow(InternalServerErrorException);
    });

    it('UTCID04 throws ForbiddenException when project is owned by someone else', async () => {
      const { service } = makeService({
        tables: {
          projects: [
            {
              data: {
                id: projectId,
                owner_id: otherUserId,
                moderation_hidden_at: null,
                archived_at: null,
              },
            },
          ],
        },
      });

      await expect(
        service.verifyProjectOwnership(projectId, userId),
      ).rejects.toThrow(ForbiddenException);
    });

    it('UTCID05 resolves void when user is collaborator with edit permission', async () => {
      const { service } = makeService({
        tables: {
          projects: [
            {
              data: {
                id: projectId,
                owner_id: otherUserId,
                moderation_hidden_at: null,
                archived_at: null,
              },
            },
          ],
          project_collaborators: [
            { data: { permission_level: 'edit', status: 'accepted' } },
          ],
        },
      });

      await expect(
        service.verifyProjectOwnership(projectId, userId),
      ).resolves.toBeUndefined();
    });
  });
});
