import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';

import { CommitsService } from './commits.service';
import { DiffService } from './diff.service';
import { ProjectAccessService } from '../project-access/project-access.service';
import { createMockSupabaseClient } from '../test-utils/supabase-mock';
import type { MockResponseMap } from '../test-utils/supabase-mock';

// =============================================================================
// Fixtures
// =============================================================================

const USER = 'user-1';
const OTHER = 'user-2';
const PROJECT = 'project-1';
const BRANCH = 'branch-1';
const BRANCH_2 = 'branch-2';
const HEAD = 'head-commit-1';
const STALE_HEAD = 'head-commit-2';

const snapshot = (over: Record<string, any> = {}) => ({
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
      volume: 1,
      pan: 0,
      instrument: null,
      // `normalizeSnapshot` luôn gán khoá `soundMap` (kể cả khi undefined),
      // nên snapshot đầu vào phải có khoá này để deep-equal với kết quả
      // normalize — nếu không, "identical to head" sẽ không bao giờ true.
      soundMap: undefined,
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
  ...over,
});

/** Nhánh thuộc project của `ownerId`. */
const branchRow = (
  ownerId: string,
  head: string | null = null,
  over: Record<string, any> = {},
) => ({
  id: BRANCH,
  project_id: PROJECT,
  name: 'main',
  is_default: true,
  created_by: ownerId,
  created_at: '2026-01-01T00:00:00.000Z',
  base_commit_id: null,
  head_commit_id: head,
  project: { id: PROJECT, owner_id: ownerId },
  ...over,
});

/** Row của bảng `commits` kèm join `branch.project_id`. */
const commitRow = (id: string, over: Record<string, any> = {}) => ({
  id,
  branch_id: BRANCH,
  author_id: USER,
  message: 'Add bass',
  snapshot: snapshot(),
  parent_commit_id: null,
  merged_from_branch_id: null,
  created_at: '2026-01-01T00:00:00.000Z',
  ...over,
});

/** Cộng tác viên đã chấp nhận của PROJECT (USER không phải chủ). */
const collaboratorRows = (permission: 'view' | 'edit') => [
  {
    data: {
      project_id: PROJECT,
      user_id: USER,
      permission_level: permission,
      status: 'accepted',
    },
  },
];

/** Row trả về từ RPC `create_commit_atomic`. */
const rpcCommit = (over: Record<string, any> = {}) => ({
  id: 'new-commit-id',
  branch_id: BRANCH,
  author_id: USER,
  message: 'Add bass',
  snapshot: snapshot(),
  created_at: '2026-01-02T00:00:00.000Z',
  ...over,
});

/**
 * `ProjectAccessService` đọc chủ dự án từ bảng `projects`. Các fixture dưới đây
 * chỉ khai chủ ở phép nối `branches.project.owner_id`, nên khi test không tự
 * khai `projects` thì suy ra từ đó: chủ → các lần kiểm quyền đều qua; người
 * khác → không phải cộng tác viên và không thấy được dự án công khai.
 */
const withProjectAccessRows = (responses: MockResponseMap): MockResponseMap => {
  if (responses.projects) return responses;
  const branchData = responses.branches?.[0]?.data as
    { project?: { owner_id?: string } | null } | null | undefined;
  const owner = branchData?.project?.owner_id;
  if (!owner) return responses;
  const row = {
    data: {
      id: PROJECT,
      owner_id: owner,
      moderation_hidden_at: null,
      archived_at: null,
    },
  };
  return owner === USER
    ? { ...responses, projects: [row, row, row, row] }
    : {
        ...responses,
        projects: [row, { data: null }],
        project_collaborators: responses.project_collaborators ?? [
          { data: null },
        ],
      };
};

const buildService = (responses: MockResponseMap) => {
  const { client, calls, rpcCalls } = createMockSupabaseClient(
    withProjectAccessRows(responses),
  );
  const service = new CommitsService(
    client as any,
    {} as any,
    new DiffService(),
    new ProjectAccessService(client as any),
  );
  return { service, calls, rpcCalls };
};

/** Select call đầu tiên của một bảng. */
const selectCallOf = (calls: any[], table: string) =>
  calls.find((c) => c.table === table && c.op === 'select');

// =============================================================================
// BE-CMT-01 — CommitsService.createCommit
// =============================================================================

describe('BE-CMT-01 CommitsService.createCommit', () => {
  it('BE-CMT-01 UTCID01 (N): creates a commit on an owned branch and returns the CommitRow', async () => {
    const { service, rpcCalls } = buildService({
      branches: [{ data: branchRow(USER) }],
      rpc: [{ data: rpcCommit() }],
    });

    const result = await service.createCommit(USER, {
      branch_id: BRANCH,
      message: 'Add bass',
      snapshot: snapshot(),
    } as any);

    expect(result).toEqual(
      expect.objectContaining({
        id: 'new-commit-id',
        branch_id: BRANCH,
        message: 'Add bass',
        created_by: USER,
      }),
    );
    expect(rpcCalls[0].fnName).toBe('create_commit_atomic');
    expect(rpcCalls[0].params.p_branch_id).toBe(BRANCH);
    expect(rpcCalls[0].params.p_author_id).toBe(USER);
  });

  it('BE-CMT-01 UTCID02 (N): creates a commit when expectedHeadCommitId matches the branch head', async () => {
    const { service, rpcCalls } = buildService({
      branches: [{ data: branchRow(USER, HEAD) }],
      commits: [{ data: { id: HEAD, snapshot: snapshot({ notes: [] }) } }],
      rpc: [{ data: rpcCommit() }],
    });

    const result = await service.createCommit(USER, {
      branch_id: BRANCH,
      message: 'Add bass',
      expectedHeadCommitId: HEAD,
      snapshot: snapshot(),
    } as any);

    expect(result.id).toBe('new-commit-id');
    expect(rpcCalls[0].params.p_parent_commit_id).toBe(HEAD);
  });

  it('BE-CMT-01 UTCID03 (B): falls back to an empty default snapshot when no draft row exists', async () => {
    const { service, rpcCalls } = buildService({
      branches: [{ data: branchRow(USER) }],
      drafts: [{ data: null, error: null }],
      rpc: [{ data: rpcCommit() }],
    });

    await service.createCommit(USER, {
      branch_id: BRANCH,
      message: 'Add bass',
    });

    expect(rpcCalls[0].params.p_snapshot).toEqual({
      schemaVersion: 3,
      meta: { tempo: 120, timeSignature: [4, 4], ppq: 480 },
      tracks: [],
      notes: [],
    });
  });

  it('BE-CMT-01 UTCID12 (A): throws InternalServerErrorException when the draft query errors', async () => {
    const { service } = buildService({
      branches: [{ data: branchRow(USER) }],
      drafts: [{ data: null, error: { message: 'boom' } }],
    });

    const promise = service.createCommit(USER, {
      branch_id: BRANCH,
      message: 'Add bass',
    });

    await expect(promise).rejects.toThrow(
      new InternalServerErrorException('Could not read draft'),
    );
  });

  it('BE-CMT-01 UTCID04 (N): injects generated UUID ids into notes that have none', async () => {
    const { service, rpcCalls } = buildService({
      branches: [{ data: branchRow(USER) }],
      rpc: [{ data: rpcCommit() }],
    });

    await service.createCommit(USER, {
      branch_id: BRANCH,
      message: 'Add bass',
      snapshot: snapshot({
        notes: [
          { trackId: 't1', pitch: 60, start: 0, duration: 480, velocity: 100 },
        ],
      }),
    } as any);

    const committed = rpcCalls[0].params.p_snapshot.notes[0];
    expect(committed.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    // Toàn bộ nội dung snapshot phải được ghi xuống, không rút gọn.
    expect(rpcCalls[0].params.p_snapshot.tracks).toHaveLength(1);
    expect(rpcCalls[0].params.p_snapshot.tracks[0].name).toBe('Piano');
    expect(rpcCalls[0].params.p_snapshot.meta).toEqual({
      tempo: 120,
      timeSignature: [4, 4],
      ppq: 480,
    });
  });

  it('BE-CMT-01 UTCID05 (A): throws NotFoundException when the branch does not exist', async () => {
    const { service } = buildService({
      branches: [{ data: null, error: { message: 'not found' } }],
    });

    const promise = service.createCommit(USER, {
      branch_id: BRANCH,
      message: 'Add bass',
      snapshot: snapshot(),
    } as any);

    await expect(promise).rejects.toThrow(NotFoundException);
    await expect(promise).rejects.toThrow(
      new NotFoundException('Branch not found'),
    );
  });

  it('BE-CMT-01 UTCID06 (A): throws ForbiddenException when the branch belongs to another user', async () => {
    const { service } = buildService({
      branches: [{ data: branchRow(OTHER) }],
    });

    const promise = service.createCommit(USER, {
      branch_id: BRANCH,
      message: 'Add bass',
      snapshot: snapshot(),
    } as any);

    await expect(promise).rejects.toThrow(ForbiddenException);
    await expect(promise).rejects.toThrow(
      new ForbiddenException('You do not have edit permission on this project'),
    );
  });

  it('BE-CMT-01 UTCID07 (A): throws ConflictException when expectedHeadCommitId is stale', async () => {
    const { service } = buildService({
      branches: [{ data: branchRow(USER, HEAD) }],
    });

    const promise = service.createCommit(USER, {
      branch_id: BRANCH,
      message: 'Add bass',
      expectedHeadCommitId: STALE_HEAD,
      snapshot: snapshot(),
    } as any);

    await expect(promise).rejects.toThrow(ConflictException);
    await expect(promise).rejects.toThrow(
      new ConflictException(
        'Branch has moved on with new commits. Please review changes.',
      ),
    );
  });

  it('BE-CMT-01 UTCID08 (A): throws ConflictException when expectedHeadCommitId does not match the head', async () => {
    const { service } = buildService({
      branches: [{ data: branchRow(USER, HEAD) }],
    });

    const promise = service.createCommit(USER, {
      branch_id: BRANCH,
      message: 'Add bass',
      expectedHeadCommitId: STALE_HEAD,
      snapshot: snapshot(),
    } as any);

    await expect(promise).rejects.toThrow(
      new ConflictException(
        'Branch has moved on with new commits. Please review changes.',
      ),
    );
  });

  it('BE-CMT-01 UTCID09 (A): throws BadRequestException when the snapshot is identical to the head', async () => {
    const { service } = buildService({
      branches: [{ data: branchRow(USER, HEAD) }],
      commits: [{ data: { id: HEAD, snapshot: snapshot() } }],
    });

    const promise = service.createCommit(USER, {
      branch_id: BRANCH,
      message: 'Add bass',
      snapshot: snapshot(),
    } as any);

    await expect(promise).rejects.toThrow(BadRequestException);
    await expect(promise).rejects.toThrow(
      new BadRequestException(
        'Working draft is identical to the most recent commit',
      ),
    );
  });

  it('BE-CMT-01 UTCID10 (A): throws InternalServerErrorException when the RPC returns an error', async () => {
    const { service } = buildService({
      branches: [{ data: branchRow(USER, HEAD) }],
      commits: [{ data: { id: HEAD, snapshot: snapshot({ notes: [] }) } }],
      rpc: [{ data: null, error: { message: 'boom' } }],
    });

    const promise = service.createCommit(USER, {
      branch_id: BRANCH,
      message: 'Add bass',
      snapshot: snapshot(),
    } as any);

    await expect(promise).rejects.toThrow(InternalServerErrorException);
    await expect(promise).rejects.toThrow(
      new InternalServerErrorException('Failed to create commit: boom'),
    );
  });

  it('BE-CMT-01 UTCID11 (N): allows a collaborator with edit permission to create a commit', async () => {
    const { service } = buildService({
      project_collaborators: collaboratorRows('edit'),
      branches: [{ data: branchRow(OTHER) }],
      rpc: [{ data: rpcCommit() }],
    });

    const result = await service.createCommit(USER, {
      branch_id: BRANCH,
      message: 'Add bass',
      snapshot: snapshot(),
    } as any);

    expect(result.id).toBe('new-commit-id');
  });
});

// =============================================================================
// BE-CMT-02 — CommitsService.getCommitHistory
// =============================================================================

describe('BE-CMT-02 CommitsService.getCommitHistory', () => {
  it('BE-CMT-02 UTCID01 (N): returns items enriched with author and tags plus total and totalPages', async () => {
    const { service } = buildService({
      branches: [{ data: branchRow(USER) }],
      commits: [{ data: [commitRow('c1')], count: 1 }],
      commit_tags: [
        {
          data: [
            {
              id: 'tag-1',
              commit_id: 'c1',
              name: 'v1-0',
              created_by: USER,
              created_at: '2026-01-01T00:00:00.000Z',
            },
          ],
        },
      ],
      users: [
        {
          data: [
            {
              id: USER,
              username: 'alice',
              display_name: 'Alice',
              avatar_url: null,
            },
          ],
        },
      ],
    });

    const result = await service.getCommitHistory({ branch_id: BRANCH }, USER);

    expect(result.total).toBe(1);
    expect(result.page).toBe(1);
    expect(result.limit).toBe(20);
    expect(result.totalPages).toBe(1);
    expect(result.items[0].id).toBe('c1');
    expect(result.items[0].author.username).toBe('alice');
    expect(result.items[0].tags.map((t) => t.name)).toEqual(['v1-0']);
  });

  it('BE-CMT-02 UTCID02 (N): requests range(40, 59) for page 3 with limit 20', async () => {
    const { service, calls } = buildService({
      projects: [{ data: [{ id: PROJECT, owner_id: USER }] }],
      branches: [{ data: [{ id: BRANCH, project_id: PROJECT }] }],
      commits: [{ data: [], count: 0 }],
    });

    const result = await service.getCommitHistory({ page: 3, limit: 20 }, USER);

    expect(result.page).toBe(3);
    expect(result.limit).toBe(20);
    expect(result.totalPages).toBe(0);
    expect(selectCallOf(calls, 'commits')?.range).toEqual([40, 59]);
  });

  it('BE-CMT-02 UTCID03 (N): returns an empty page when the user owns no projects', async () => {
    const { service } = buildService({
      projects: [{ data: [] }],
    });

    const result = await service.getCommitHistory({}, USER);

    expect(result).toEqual({
      items: [],
      total: 0,
      page: 1,
      totalPages: 0,
      limit: 20,
    });
  });

  it('BE-CMT-02 UTCID04 (B): requests range(0, 0) for page 1 with limit 1', async () => {
    const { service, calls } = buildService({
      branches: [{ data: branchRow(USER) }],
      commits: [{ data: [], count: 0 }],
    });

    const result = await service.getCommitHistory(
      { branch_id: BRANCH, page: 1, limit: 1 },
      USER,
    );

    expect(result.limit).toBe(1);
    expect(selectCallOf(calls, 'commits')?.range).toEqual([0, 0]);
  });

  it('BE-CMT-02 UTCID05 (B): requests range(0, 99) for limit 100', async () => {
    const { service, calls } = buildService({
      branches: [{ data: branchRow(USER) }],
      commits: [{ data: [], count: 0 }],
    });

    const result = await service.getCommitHistory(
      { branch_id: BRANCH, limit: 100 },
      USER,
    );

    expect(result.limit).toBe(100);
    expect(selectCallOf(calls, 'commits')?.range).toEqual([0, 99]);
  });

  it('BE-CMT-02 UTCID06 (A): throws NotFoundException when the branch does not exist', async () => {
    const { service } = buildService({
      branches: [{ data: null, error: { message: 'not found' } }],
    });

    const promise = service.getCommitHistory({ branch_id: BRANCH }, USER);

    await expect(promise).rejects.toThrow(NotFoundException);
    await expect(promise).rejects.toThrow(
      new NotFoundException('Branch not found'),
    );
  });

  it('BE-CMT-02 UTCID07 (A): throws ForbiddenException for a branch of another user', async () => {
    const { service } = buildService({
      branches: [{ data: branchRow(OTHER) }],
    });

    const promise = service.getCommitHistory({ branch_id: BRANCH }, USER);

    await expect(promise).rejects.toThrow(ForbiddenException);
    await expect(promise).rejects.toThrow(
      new ForbiddenException('You do not have access to this project'),
    );
  });

  it('BE-CMT-02 UTCID08 (A): throws InternalServerErrorException when the commits query errors', async () => {
    const { service } = buildService({
      branches: [{ data: branchRow(USER) }],
      commits: [{ data: null, error: { message: 'boom' } }],
    });

    const promise = service.getCommitHistory({ branch_id: BRANCH }, USER);

    await expect(promise).rejects.toThrow(InternalServerErrorException);
    await expect(promise).rejects.toThrow(
      new InternalServerErrorException('Failed to fetch commit history: boom'),
    );
  });

  it('BE-CMT-02 UTCID09 (A): returns an empty page when the query returns null data and null count', async () => {
    const { service } = buildService({
      branches: [{ data: branchRow(USER) }],
      commits: [{ data: null, error: null }],
    });

    const result = await service.getCommitHistory({ branch_id: BRANCH }, USER);

    expect(result.items).toEqual([]);
    expect(result.total).toBe(0);
    expect(result.totalPages).toBe(0);
  });

  it('BE-CMT-02 UTCID10 (N): falls back to a null author profile when the author row is missing', async () => {
    const { service } = buildService({
      branches: [{ data: branchRow(USER) }],
      commits: [{ data: [commitRow('c1')], count: 1 }],
      commit_tags: [{ data: [] }],
      users: [{ data: null, error: null }],
    });

    const result = await service.getCommitHistory({ branch_id: BRANCH }, USER);

    expect(result.items[0].author).toEqual({
      id: USER,
      username: null,
      display_name: null,
      avatar_url: null,
    });
    expect(result.items[0].tags).toEqual([]);
  });

  it('BE-CMT-02 UTCID11 (N): allows a collaborator to read the commit history of the project', async () => {
    const { service } = buildService({
      project_collaborators: collaboratorRows('view'),
      branches: [{ data: branchRow(OTHER) }],
      commits: [{ data: [commitRow('c1')], count: 1 }],
      commit_tags: [{ data: [] }],
      users: [{ data: [{ id: USER, username: 'alice' }] }],
    });

    const result = await service.getCommitHistory({ branch_id: BRANCH }, USER);

    expect(result.items).toHaveLength(1);
  });
});

// =============================================================================
// BE-CMT-03 — CommitsService.getCommitById
// =============================================================================

describe('BE-CMT-03 CommitsService.getCommitById', () => {
  it('BE-CMT-03 UTCID01 (N): returns a CommitWithAuthor with author info and tags', async () => {
    const { service } = buildService({
      commits: [
        {
          data: commitRow('c1', { branch: { project_id: PROJECT } }),
        },
      ],
      projects: [{ data: { id: PROJECT, owner_id: USER } }],
      commit_tags: [
        {
          data: [
            {
              id: 'tag-1',
              commit_id: 'c1',
              name: 'v1-0',
              created_by: USER,
              created_at: '2026-01-01T00:00:00.000Z',
            },
          ],
        },
      ],
      users: [
        {
          data: {
            id: USER,
            username: 'alice',
            display_name: 'Alice',
            avatar_url: 'a.png',
          },
        },
      ],
    });

    const result = await service.getCommitById('c1', USER);

    expect(result.id).toBe('c1');
    expect(result.author.username).toBe('alice');
    expect(result.author.avatar_url).toBe('a.png');
    expect(result.tags.map((t) => t.name)).toEqual(['v1-0']);
  });

  it('BE-CMT-03 UTCID02 (N): falls back to a null author profile when the author row is missing', async () => {
    const { service } = buildService({
      commits: [
        {
          data: commitRow('c1', { branch: { project_id: PROJECT } }),
        },
      ],
      projects: [{ data: { id: PROJECT, owner_id: USER } }],
      commit_tags: [{ data: [] }],
      users: [{ data: null, error: null }],
    });

    const result = await service.getCommitById('c1', USER);

    expect(result.author).toEqual({
      id: USER,
      username: null,
      display_name: null,
      avatar_url: null,
    });
    expect(result.tags).toEqual([]);
  });

  it('BE-CMT-03 UTCID03 (A): throws NotFoundException when the commit query errors', async () => {
    const { service } = buildService({
      commits: [{ data: null, error: { message: 'boom' } }],
    });

    const promise = service.getCommitById('c1', USER);

    await expect(promise).rejects.toThrow(NotFoundException);
    await expect(promise).rejects.toThrow(
      new NotFoundException('Commit not found'),
    );
  });

  it('BE-CMT-03 UTCID04 (A): throws NotFoundException when the commit is null', async () => {
    const { service } = buildService({
      commits: [{ data: null, error: null }],
    });

    const promise = service.getCommitById('c1', USER);

    await expect(promise).rejects.toThrow(
      new NotFoundException('Commit not found'),
    );
  });

  it('BE-CMT-03 UTCID05 (A): throws NotFoundException when the project does not exist', async () => {
    const { service } = buildService({
      commits: [
        {
          data: commitRow('c1', { branch: { project_id: PROJECT } }),
        },
      ],
      projects: [{ data: null, error: null }],
    });

    const promise = service.getCommitById('c1', USER);

    await expect(promise).rejects.toThrow(
      new NotFoundException('Project not found'),
    );
  });

  it('BE-CMT-03 UTCID06 (A): throws ForbiddenException when the project belongs to another user', async () => {
    const { service } = buildService({
      commits: [
        {
          data: commitRow('c1', { branch: { project_id: PROJECT } }),
        },
      ],
      projects: [{ data: { id: PROJECT, owner_id: OTHER } }],
    });

    const promise = service.getCommitById('c1', USER);

    await expect(promise).rejects.toThrow(ForbiddenException);
    await expect(promise).rejects.toThrow(
      new ForbiddenException('You do not have access to this project'),
    );
  });

  it('BE-CMT-03 UTCID07 (A): returns the commit without an ownership check when the row has no branch join', async () => {
    const { service } = buildService({
      commits: [{ data: commitRow('c1', { branch: null }) }],
      commit_tags: [{ data: [] }],
      users: [
        {
          data: [
            {
              id: USER,
              username: 'alice',
              display_name: 'Alice',
              avatar_url: null,
            },
          ],
        },
      ],
    });

    const result = await service.getCommitById('c1', USER);

    expect(result.id).toBe('c1');
    expect(result.author.username).toBe('alice');
    expect(result.tags).toEqual([]);
  });

  it('BE-CMT-03 UTCID08 (N): allows a collaborator to read a commit of the project', async () => {
    const { service } = buildService({
      project_collaborators: collaboratorRows('view'),
      commits: [
        {
          data: commitRow('c1', { branch: { project_id: PROJECT } }),
        },
      ],
      projects: [{ data: { id: PROJECT, owner_id: OTHER } }],
      commit_tags: [{ data: [] }],
      users: [{ data: [{ id: USER, username: 'alice' }] }],
    });

    const result = await service.getCommitById('c1', USER);

    expect(result.id).toBe('c1');
  });
});

// =============================================================================
// BE-CMT-04 — CommitsService.tagCommit
// =============================================================================

describe('BE-CMT-04 CommitsService.tagCommit', () => {
  const tagDto = (tag: string) => ({ tag }) as any;

  it('BE-CMT-04 UTCID01 (N): creates a tag and returns the new TagRow', async () => {
    const { service, calls } = buildService({
      commits: [{ data: { id: 'c1', branch: { project_id: PROJECT } } }],
      projects: [{ data: { id: PROJECT, owner_id: USER } }],
      commit_tags: [
        {
          data: {
            id: 'tag-1',
            commit_id: 'c1',
            name: 'v1-0',
            created_by: USER,
            created_at: '2026-01-01T00:00:00.000Z',
          },
        },
      ],
    });

    const result = await service.tagCommit('c1', USER, tagDto('v1-0'));

    expect(result).toEqual(
      expect.objectContaining({ id: 'tag-1', commit_id: 'c1', name: 'v1-0' }),
    );
    const upsert = calls.find((c) => c.op === 'upsert');
    expect(upsert?.table).toBe('commit_tags');
    expect(upsert?.payload.name).toBe('v1-0');
  });

  it('BE-CMT-04 UTCID02 (B): creates a tag with a 1-character name', async () => {
    const { service } = buildService({
      commits: [{ data: { id: 'c1', branch: { project_id: PROJECT } } }],
      projects: [{ data: { id: PROJECT, owner_id: USER } }],
      commit_tags: [
        {
          data: {
            id: 'tag-1',
            commit_id: 'c1',
            name: 'a',
            created_by: USER,
            created_at: '2026-01-01T00:00:00.000Z',
          },
        },
      ],
    });

    const result = await service.tagCommit('c1', USER, tagDto('a'));

    expect(result.name).toBe('a');
  });

  it('BE-CMT-04 UTCID03 (B): creates a tag with a 30-character name', async () => {
    const name = 'a'.repeat(30);
    const { service } = buildService({
      commits: [{ data: { id: 'c1', branch: { project_id: PROJECT } } }],
      projects: [{ data: { id: PROJECT, owner_id: USER } }],
      commit_tags: [
        {
          data: {
            id: 'tag-1',
            commit_id: 'c1',
            name,
            created_by: USER,
            created_at: '2026-01-01T00:00:00.000Z',
          },
        },
      ],
    });

    const result = await service.tagCommit('c1', USER, tagDto(name));

    expect(result.name).toBe(name);
  });

  it('BE-CMT-04 UTCID04 (N): replaces the previous tag of an already tagged commit', async () => {
    const { service, calls } = buildService({
      commits: [{ data: { id: 'c1', branch: { project_id: PROJECT } } }],
      projects: [{ data: { id: PROJECT, owner_id: USER } }],
      commit_tags: [
        {
          data: {
            id: 'tag-2',
            commit_id: 'c1',
            name: 'v2-0',
            created_by: USER,
            created_at: '2026-01-02T00:00:00.000Z',
          },
        },
      ],
    });

    const result = await service.tagCommit('c1', USER, tagDto('v2-0'));

    expect(result.name).toBe('v2-0');
    const upsert = calls.find((c) => c.op === 'upsert');
    expect(upsert?.payload).toEqual(
      expect.objectContaining({ commit_id: 'c1', name: 'v2-0' }),
    );
  });

  it('BE-CMT-04 UTCID05 (A): throws NotFoundException when the commit does not exist', async () => {
    const { service } = buildService({
      commits: [{ data: null, error: { message: 'boom' } }],
    });

    const promise = service.tagCommit('c1', USER, tagDto('v1-0'));

    await expect(promise).rejects.toThrow(NotFoundException);
    await expect(promise).rejects.toThrow(
      new NotFoundException('Commit not found'),
    );
  });

  it('BE-CMT-04 UTCID06 (A): throws NotFoundException when the commit branch has no project', async () => {
    const { service } = buildService({
      commits: [{ data: { id: 'c1', branch: null } }],
    });

    const promise = service.tagCommit('c1', USER, tagDto('v1-0'));

    await expect(promise).rejects.toThrow(
      new NotFoundException('Commit not found'),
    );
  });

  it('BE-CMT-04 UTCID07 (A): throws ForbiddenException when the project belongs to another user', async () => {
    const { service } = buildService({
      commits: [{ data: { id: 'c1', branch: { project_id: PROJECT } } }],
      projects: [{ data: { id: PROJECT, owner_id: OTHER } }],
    });

    const promise = service.tagCommit('c1', USER, tagDto('v1-0'));

    await expect(promise).rejects.toThrow(ForbiddenException);
    await expect(promise).rejects.toThrow(
      new ForbiddenException('You do not have edit permission on this project'),
    );
  });

  it('BE-CMT-04 UTCID08 (A): throws ConflictException on unique-violation error 23505', async () => {
    const { service } = buildService({
      commits: [{ data: { id: 'c1', branch: { project_id: PROJECT } } }],
      projects: [{ data: { id: PROJECT, owner_id: USER } }],
      commit_tags: [{ data: null, error: { code: '23505', message: 'dup' } }],
    });

    const promise = service.tagCommit('c1', USER, tagDto('v1-0'));

    await expect(promise).rejects.toThrow(ConflictException);
    await expect(promise).rejects.toThrow(
      new ConflictException('Tag name already exists in this project'),
    );
  });

  it('BE-CMT-04 UTCID09 (A): throws InternalServerErrorException on any other error code', async () => {
    const { service } = buildService({
      commits: [{ data: { id: 'c1', branch: { project_id: PROJECT } } }],
      projects: [{ data: { id: PROJECT, owner_id: USER } }],
      commit_tags: [{ data: null, error: { code: '42501', message: 'boom' } }],
    });

    const promise = service.tagCommit('c1', USER, tagDto('v1-0'));

    await expect(promise).rejects.toThrow(InternalServerErrorException);
    await expect(promise).rejects.toThrow(
      new InternalServerErrorException('Failed to create tag: boom'),
    );
  });

  it('BE-CMT-04 UTCID10 (A): throws InternalServerErrorException when the upsert returns no row', async () => {
    const { service } = buildService({
      commits: [{ data: { id: 'c1', branch: { project_id: PROJECT } } }],
      projects: [{ data: { id: PROJECT, owner_id: USER } }],
      commit_tags: [{ data: null, error: null }],
    });

    const promise = service.tagCommit('c1', USER, tagDto('v1-0'));

    await expect(promise).rejects.toThrow(InternalServerErrorException);
    await expect(promise).rejects.toThrow(
      new InternalServerErrorException('Tag was not created'),
    );
  });

  it('BE-CMT-04 UTCID11 (N): allows a collaborator to tag a commit of the project', async () => {
    const { service } = buildService({
      project_collaborators: collaboratorRows('edit'),
      commits: [{ data: { id: 'c1', branch: { project_id: PROJECT } } }],
      projects: [{ data: { id: PROJECT, owner_id: OTHER } }],
      commit_tags: [
        {
          data: {
            id: 'tag-1',
            commit_id: 'c1',
            name: 'v1-0',
            created_by: USER,
            created_at: '2026-01-01T00:00:00.000Z',
          },
        },
      ],
    });

    const result = await service.tagCommit('c1', USER, tagDto('v1-0'));

    expect(result.name).toBe('v1-0');
  });
});

// =============================================================================
// BE-CMT-05 — CommitsService.getTagsForCommit
// =============================================================================

describe('BE-CMT-05 CommitsService.getTagsForCommit', () => {
  it('BE-CMT-05 UTCID01 (N): returns the tags of a commit ordered by created_at ascending', async () => {
    const { service, calls } = buildService({
      commits: [{ data: { id: 'c1', branch: { project_id: PROJECT } } }],
      projects: [{ data: { id: PROJECT, owner_id: USER } }],
      commit_tags: [
        {
          data: [
            {
              id: 'tag-1',
              commit_id: 'c1',
              name: 'v1-0',
              created_by: USER,
              created_at: '2026-01-01T00:00:00.000Z',
            },
            {
              id: 'tag-2',
              commit_id: 'c1',
              name: 'v2-0',
              created_by: USER,
              created_at: '2026-01-02T00:00:00.000Z',
            },
          ],
        },
      ],
    });

    const result = await service.getTagsForCommit('c1', USER);

    expect(result.map((t) => t.name)).toEqual(['v1-0', 'v2-0']);
    expect(selectCallOf(calls, 'commit_tags')?.order).toEqual({
      column: 'created_at',
      ascending: true,
    });
  });

  it('BE-CMT-05 UTCID02 (N): returns an empty array when the commit has no tags', async () => {
    const { service } = buildService({
      commits: [{ data: { id: 'c1', branch: { project_id: PROJECT } } }],
      projects: [{ data: { id: PROJECT, owner_id: USER } }],
      commit_tags: [{ data: [] }],
    });

    const result = await service.getTagsForCommit('c1', USER);

    expect(result).toEqual([]);
  });

  it('BE-CMT-05 UTCID03 (N): returns an empty array when the query returns null data', async () => {
    const { service } = buildService({
      commits: [{ data: { id: 'c1', branch: { project_id: PROJECT } } }],
      projects: [{ data: { id: PROJECT, owner_id: USER } }],
      commit_tags: [{ data: null, error: null }],
    });

    const result = await service.getTagsForCommit('c1', USER);

    expect(result).toEqual([]);
  });

  it('BE-CMT-05 UTCID04 (A): throws NotFoundException when the commit does not exist', async () => {
    const { service } = buildService({
      commits: [{ data: null, error: { message: 'boom' } }],
    });

    const promise = service.getTagsForCommit('c1', USER);

    await expect(promise).rejects.toThrow(NotFoundException);
    await expect(promise).rejects.toThrow(
      new NotFoundException('Commit not found'),
    );
  });

  it('BE-CMT-05 UTCID05 (A): throws ForbiddenException when the project belongs to another user', async () => {
    const { service } = buildService({
      commits: [{ data: { id: 'c1', branch: { project_id: PROJECT } } }],
      projects: [{ data: { id: PROJECT, owner_id: OTHER } }],
    });

    const promise = service.getTagsForCommit('c1', USER);

    await expect(promise).rejects.toThrow(ForbiddenException);
    await expect(promise).rejects.toThrow(
      new ForbiddenException('You do not have access to this project'),
    );
  });

  it('BE-CMT-05 UTCID06 (A): throws InternalServerErrorException when the tags query errors', async () => {
    const { service } = buildService({
      commits: [{ data: { id: 'c1', branch: { project_id: PROJECT } } }],
      projects: [{ data: { id: PROJECT, owner_id: USER } }],
      commit_tags: [{ data: null, error: { message: 'boom' } }],
    });

    const promise = service.getTagsForCommit('c1', USER);

    await expect(promise).rejects.toThrow(InternalServerErrorException);
    await expect(promise).rejects.toThrow(
      new InternalServerErrorException('Failed to fetch tags: boom'),
    );
  });

  it('BE-CMT-05 UTCID07 (N): allows a collaborator to list the tags of a commit', async () => {
    const { service } = buildService({
      project_collaborators: collaboratorRows('view'),
      commits: [{ data: { id: 'c1', branch: { project_id: PROJECT } } }],
      projects: [{ data: { id: PROJECT, owner_id: OTHER } }],
      commit_tags: [
        {
          data: [
            {
              id: 'tag-1',
              commit_id: 'c1',
              name: 'v1-0',
              created_by: USER,
              created_at: '2026-01-01T00:00:00.000Z',
            },
          ],
        },
      ],
    });

    const result = await service.getTagsForCommit('c1', USER);

    expect(result).toHaveLength(1);
  });
});

// =============================================================================
// BE-CMT-06 — CommitsService.deleteTag
// =============================================================================

describe('BE-CMT-06 CommitsService.deleteTag', () => {
  it('BE-CMT-06 UTCID01 (N): deletes the tag of a commit and resolves void', async () => {
    const { service, calls } = buildService({
      commits: [{ data: { id: 'c1', branch: { project_id: PROJECT } } }],
      projects: [{ data: { id: PROJECT, owner_id: USER } }],
      commit_tags: [{ data: null, error: null }],
    });

    await expect(
      service.deleteTag('c1', 'v1-0', USER),
    ).resolves.toBeUndefined();

    const del = calls.find(
      (c) => c.op === 'delete' && c.table === 'commit_tags',
    );
    expect(del?.filters).toEqual(
      expect.objectContaining({ commit_id: 'c1', name: 'v1-0' }),
    );
  });

  it('BE-CMT-06 UTCID02 (N): resolves void when no tag matches the name', async () => {
    const { service } = buildService({
      commits: [{ data: { id: 'c1', branch: { project_id: PROJECT } } }],
      projects: [{ data: { id: PROJECT, owner_id: USER } }],
      commit_tags: [{ data: null, error: null }],
    });

    await expect(
      service.deleteTag('c1', 'missing', USER),
    ).resolves.toBeUndefined();
  });

  it('BE-CMT-06 UTCID03 (A): throws NotFoundException when the commit does not exist', async () => {
    const { service } = buildService({
      commits: [{ data: null, error: { message: 'boom' } }],
    });

    const promise = service.deleteTag('c1', 'v1-0', USER);

    await expect(promise).rejects.toThrow(NotFoundException);
    await expect(promise).rejects.toThrow(
      new NotFoundException('Commit not found'),
    );
  });

  it('BE-CMT-06 UTCID04 (A): throws ForbiddenException when the project belongs to another user', async () => {
    const { service } = buildService({
      commits: [{ data: { id: 'c1', branch: { project_id: PROJECT } } }],
      projects: [{ data: { id: PROJECT, owner_id: OTHER } }],
    });

    const promise = service.deleteTag('c1', 'v1-0', USER);

    await expect(promise).rejects.toThrow(ForbiddenException);
    await expect(promise).rejects.toThrow(
      new ForbiddenException('You do not have edit permission on this project'),
    );
  });

  it('BE-CMT-06 UTCID05 (A): throws InternalServerErrorException when the delete errors', async () => {
    const { service } = buildService({
      commits: [{ data: { id: 'c1', branch: { project_id: PROJECT } } }],
      projects: [{ data: { id: PROJECT, owner_id: USER } }],
      commit_tags: [{ data: null, error: { message: 'boom' } }],
    });

    const promise = service.deleteTag('c1', 'v1-0', USER);

    await expect(promise).rejects.toThrow(InternalServerErrorException);
    await expect(promise).rejects.toThrow(
      new InternalServerErrorException('Failed to delete tag: boom'),
    );
  });

  it('BE-CMT-06 UTCID06 (N): allows a collaborator to delete a tag of the project', async () => {
    const { service } = buildService({
      project_collaborators: collaboratorRows('edit'),
      commits: [{ data: { id: 'c1', branch: { project_id: PROJECT } } }],
      projects: [{ data: { id: PROJECT, owner_id: OTHER } }],
      commit_tags: [{ data: null, error: null }],
    });

    await expect(
      service.deleteTag('c1', 'v1-0', USER),
    ).resolves.toBeUndefined();
  });
});

// =============================================================================
// BE-CMT-07 — CommitsService.compareCommits
// =============================================================================

describe('BE-CMT-07 CommitsService.compareCommits', () => {
  it('BE-CMT-07 UTCID01 (N): returns the SnapshotDiff of two commits of the same project', async () => {
    const { service } = buildService({
      commits: [
        { data: { id: 'c1', branch_id: BRANCH, snapshot: snapshot() } },
        {
          data: {
            id: 'c2',
            branch_id: BRANCH,
            snapshot: snapshot({
              notes: [
                {
                  id: 'n1',
                  trackId: 't1',
                  pitch: 60,
                  start: 0,
                  duration: 480,
                  velocity: 100,
                },
                {
                  id: 'n2',
                  trackId: 't1',
                  pitch: 62,
                  start: 0,
                  duration: 480,
                  velocity: 100,
                },
              ],
            }),
          },
        },
      ],
      branches: [
        { data: { id: BRANCH, project_id: PROJECT } },
        { data: { id: BRANCH, project_id: PROJECT } },
      ],
      projects: [{ data: { id: PROJECT, owner_id: USER } }],
    });

    const result = await service.compareCommits('c1', 'c2', USER);

    expect(result.areIdentical).toBe(false);
    expect(result.summary.notes.added).toBe(1);
  });

  it('BE-CMT-07 UTCID02 (N): returns an identical diff when the same commit id is given twice', async () => {
    const { service } = buildService({
      commits: [
        { data: { id: 'c1', branch_id: BRANCH, snapshot: snapshot() } },
        { data: { id: 'c1', branch_id: BRANCH, snapshot: snapshot() } },
      ],
      branches: [
        { data: { id: BRANCH, project_id: PROJECT } },
        { data: { id: BRANCH, project_id: PROJECT } },
      ],
      projects: [{ data: { id: PROJECT, owner_id: USER } }],
    });

    const result = await service.compareCommits('c1', 'c1', USER);

    expect(result.areIdentical).toBe(true);
  });

  it('BE-CMT-07 UTCID03 (A): throws NotFoundException when the base commit is not found', async () => {
    const { service } = buildService({
      commits: [{ data: null, error: { message: 'boom' } }],
    });

    const promise = service.compareCommits('c1', 'c2', USER);

    await expect(promise).rejects.toThrow(NotFoundException);
    await expect(promise).rejects.toThrow(
      new NotFoundException('Base commit not found'),
    );
  });

  it('BE-CMT-07 UTCID04 (A): throws NotFoundException when the target commit is not found', async () => {
    const { service } = buildService({
      commits: [
        { data: { id: 'c1', branch_id: BRANCH, snapshot: snapshot() } },
        { data: null, error: { message: 'boom' } },
      ],
    });

    const promise = service.compareCommits('c1', 'c2', USER);

    await expect(promise).rejects.toThrow(
      new NotFoundException('Target commit not found'),
    );
  });

  it('BE-CMT-07 UTCID05 (A): throws BadRequestException when the commits belong to different projects', async () => {
    const { service } = buildService({
      commits: [
        { data: { id: 'c1', branch_id: BRANCH, snapshot: snapshot() } },
        { data: { id: 'c2', branch_id: BRANCH_2, snapshot: snapshot() } },
      ],
      branches: [
        { data: { id: BRANCH, project_id: PROJECT } },
        { data: { id: BRANCH_2, project_id: 'project-2' } },
      ],
    });

    const promise = service.compareCommits('c1', 'c2', USER);

    await expect(promise).rejects.toThrow(BadRequestException);
    await expect(promise).rejects.toThrow(
      new BadRequestException('Cannot compare commits from different projects'),
    );
  });

  it('BE-CMT-07 UTCID06 (A): throws NotFoundException when the project does not exist', async () => {
    const { service } = buildService({
      commits: [
        { data: { id: 'c1', branch_id: BRANCH, snapshot: snapshot() } },
        { data: { id: 'c2', branch_id: BRANCH, snapshot: snapshot() } },
      ],
      branches: [
        { data: { id: BRANCH, project_id: PROJECT } },
        { data: { id: BRANCH, project_id: PROJECT } },
      ],
      projects: [{ data: null, error: null }],
    });

    const promise = service.compareCommits('c1', 'c2', USER);

    await expect(promise).rejects.toThrow(
      new NotFoundException('Project not found'),
    );
  });

  it('BE-CMT-07 UTCID07 (A): throws ForbiddenException when the project belongs to another user', async () => {
    const { service } = buildService({
      commits: [
        { data: { id: 'c1', branch_id: BRANCH, snapshot: snapshot() } },
        { data: { id: 'c2', branch_id: BRANCH, snapshot: snapshot() } },
      ],
      branches: [
        { data: { id: BRANCH, project_id: PROJECT } },
        { data: { id: BRANCH, project_id: PROJECT } },
      ],
      projects: [{ data: { id: PROJECT, owner_id: OTHER } }],
    });

    const promise = service.compareCommits('c1', 'c2', USER);

    await expect(promise).rejects.toThrow(ForbiddenException);
    await expect(promise).rejects.toThrow(
      new ForbiddenException('You do not have access to this project'),
    );
  });

  it('BE-CMT-07 UTCID08 (N): returns the diff without an ownership check when both branches are missing', async () => {
    const { service, calls } = buildService({
      commits: [
        { data: { id: 'c1', branch_id: BRANCH, snapshot: snapshot() } },
        { data: { id: 'c2', branch_id: BRANCH, snapshot: snapshot() } },
      ],
      branches: [
        { data: null, error: null },
        { data: null, error: null },
      ],
    });

    const result = await service.compareCommits('c1', 'c2', USER);

    expect(result.areIdentical).toBe(true);
    expect(selectCallOf(calls, 'projects')).toBeUndefined();
  });

  it('BE-CMT-07 UTCID09 (N): allows a collaborator to compare commits of the project', async () => {
    const { service } = buildService({
      project_collaborators: collaboratorRows('view'),
      commits: [
        { data: { id: 'c1', branch_id: BRANCH, snapshot: snapshot() } },
        {
          data: {
            id: 'c2',
            branch_id: BRANCH,
            snapshot: snapshot({
              notes: [
                {
                  id: 'n1',
                  trackId: 't1',
                  pitch: 60,
                  start: 0,
                  duration: 480,
                  velocity: 100,
                },
                {
                  id: 'n2',
                  trackId: 't1',
                  pitch: 62,
                  start: 0,
                  duration: 480,
                  velocity: 100,
                },
              ],
            }),
          },
        },
      ],
      branches: [
        { data: { id: BRANCH, project_id: PROJECT } },
        { data: { id: BRANCH, project_id: PROJECT } },
      ],
      projects: [{ data: { id: PROJECT, owner_id: OTHER } }],
    });

    const result = await service.compareCommits('c1', 'c2', USER);

    expect(result.areIdentical).toBe(false);
  });
});

// =============================================================================
// BE-CMT-08 — CommitsService.restoreCommit
// =============================================================================

describe('BE-CMT-08 CommitsService.restoreCommit', () => {
  it('BE-CMT-08 UTCID01 (N): restores a commit with the default "Khôi phục phiên bản" message', async () => {
    const { service, rpcCalls } = buildService({
      branches: [{ data: branchRow(USER, 'head-9999') }],
      commits: [
        {
          data: commitRow('abcdef123456', {
            branch: { project_id: PROJECT },
          }),
        },
      ],
      rpc: [
        {
          data: rpcCommit({
            id: 'restored-1',
            message: 'Khôi phục phiên bản "Add bass" (abcdef12)',
          }),
        },
      ],
    });

    const result = await service.restoreCommit('abcdef123456', USER, {
      branch_id: BRANCH,
    });

    expect(result.id).toBe('restored-1');
    expect(rpcCalls[0].params.p_message).toBe(
      'Khôi phục phiên bản "Add bass" (abcdef12)',
    );
    expect(rpcCalls[0].params.p_parent_commit_id).toBe('head-9999');
    // Snapshot của commit cũ phải được ghi nguyên vẹn vào commit khôi phục —
    // nếu ghi sai nội dung thì "revert" sẽ mất dữ liệu (BR-41/BR-47).
    expect(rpcCalls[0].params.p_snapshot).toEqual(snapshot());
  });

  it('BE-CMT-08 UTCID02 (N): restores a commit with a custom message', async () => {
    const { service, rpcCalls } = buildService({
      branches: [{ data: branchRow(USER, 'head-9999') }],
      commits: [
        {
          data: commitRow('abcdef123456', {
            branch: { project_id: PROJECT },
          }),
        },
      ],
      rpc: [{ data: rpcCommit({ id: 'restored-1' }) }],
    });

    const result = await service.restoreCommit('abcdef123456', USER, {
      branch_id: BRANCH,
      message: 'Back to chorus',
    });

    expect(rpcCalls[0].params.p_message).toBe('Back to chorus');
    expect(result.id).toBe('restored-1');
  });

  it('BE-CMT-08 UTCID03 (B): restores a commit with a 200-character message', async () => {
    const message = 'a'.repeat(200);
    const { service, rpcCalls } = buildService({
      branches: [{ data: branchRow(USER, 'head-9999') }],
      commits: [
        {
          data: commitRow('abcdef123456', {
            branch: { project_id: PROJECT },
          }),
        },
      ],
      rpc: [{ data: rpcCommit({ id: 'restored-1' }) }],
    });

    await service.restoreCommit('abcdef123456', USER, {
      branch_id: BRANCH,
      message,
    });

    expect(rpcCalls[0].params.p_message).toBe(message);
  });

  it('BE-CMT-08 UTCID04 (N): restores a commit onto a branch that has no head yet', async () => {
    const { service, rpcCalls } = buildService({
      branches: [{ data: branchRow(USER, null) }],
      commits: [
        {
          data: commitRow('abcdef123456', {
            branch: { project_id: PROJECT },
          }),
        },
      ],
      rpc: [{ data: rpcCommit({ id: 'restored-1' }) }],
    });

    const result = await service.restoreCommit('abcdef123456', USER, {
      branch_id: BRANCH,
    });

    expect(result.id).toBe('restored-1');
    expect(rpcCalls[0].params.p_parent_commit_id).toBeNull();
  });

  it('BE-CMT-08 UTCID05 (A): throws NotFoundException when the branch does not exist', async () => {
    const { service } = buildService({
      branches: [{ data: null, error: { message: 'boom' } }],
    });

    const promise = service.restoreCommit('abcdef123456', USER, {
      branch_id: BRANCH,
    });

    await expect(promise).rejects.toThrow(NotFoundException);
    await expect(promise).rejects.toThrow(
      new NotFoundException('Branch not found'),
    );
  });

  it('BE-CMT-08 UTCID06 (A): throws ForbiddenException when the branch belongs to another user', async () => {
    const { service } = buildService({
      branches: [{ data: branchRow(OTHER) }],
    });

    const promise = service.restoreCommit('abcdef123456', USER, {
      branch_id: BRANCH,
    });

    await expect(promise).rejects.toThrow(ForbiddenException);
    await expect(promise).rejects.toThrow(
      new ForbiddenException('You do not have edit permission on this project'),
    );
  });

  it('BE-CMT-08 UTCID07 (A): throws NotFoundException when the commit to restore is not found', async () => {
    const { service } = buildService({
      branches: [{ data: branchRow(USER, 'head-9999') }],
      commits: [{ data: null, error: { message: 'boom' } }],
    });

    const promise = service.restoreCommit('abcdef123456', USER, {
      branch_id: BRANCH,
    });

    await expect(promise).rejects.toThrow(NotFoundException);
    await expect(promise).rejects.toThrow(
      new NotFoundException('Commit to restore not found'),
    );
  });

  it('BE-CMT-08 UTCID08 (A): throws ForbiddenException when the commit belongs to a different project', async () => {
    const { service } = buildService({
      branches: [{ data: branchRow(USER, 'head-9999') }],
      commits: [
        {
          data: commitRow('abcdef123456', {
            branch: { project_id: 'project-2' },
          }),
        },
      ],
    });

    const promise = service.restoreCommit('abcdef123456', USER, {
      branch_id: BRANCH,
    });

    await expect(promise).rejects.toThrow(ForbiddenException);
    await expect(promise).rejects.toThrow(
      new ForbiddenException(
        'Cannot restore a commit from a different project',
      ),
    );
  });

  it('BE-CMT-08 UTCID09 (A): throws BadRequestException when the commit is already the branch head', async () => {
    const { service } = buildService({
      branches: [{ data: branchRow(USER, 'abcdef123456') }],
      commits: [
        {
          data: commitRow('abcdef123456', {
            branch: { project_id: PROJECT },
          }),
        },
      ],
    });

    const promise = service.restoreCommit('abcdef123456', USER, {
      branch_id: BRANCH,
    });

    await expect(promise).rejects.toThrow(BadRequestException);
    await expect(promise).rejects.toThrow(
      new BadRequestException(
        'Selected commit is already the most recent version on this branch',
      ),
    );
  });

  it('BE-CMT-08 UTCID10 (A): throws InternalServerErrorException when the RPC returns an error', async () => {
    const { service } = buildService({
      branches: [{ data: branchRow(USER, 'head-9999') }],
      commits: [
        {
          data: commitRow('abcdef123456', {
            branch: { project_id: PROJECT },
          }),
        },
      ],
      rpc: [{ data: null, error: { message: 'boom' } }],
    });

    const promise = service.restoreCommit('abcdef123456', USER, {
      branch_id: BRANCH,
    });

    await expect(promise).rejects.toThrow(InternalServerErrorException);
    await expect(promise).rejects.toThrow(
      new InternalServerErrorException('Failed to create restore commit: boom'),
    );
  });

  it('BE-CMT-08 UTCID11 (N): allows a collaborator with edit permission to restore a commit', async () => {
    const { service } = buildService({
      project_collaborators: collaboratorRows('edit'),
      branches: [{ data: branchRow(OTHER, 'head-9999') }],
      commits: [
        {
          data: commitRow('abcdef123456', {
            branch: { project_id: PROJECT },
          }),
        },
      ],
      rpc: [{ data: rpcCommit({ id: 'restored-1' }) }],
    });

    const result = await service.restoreCommit('abcdef123456', USER, {
      branch_id: BRANCH,
    });

    expect(result.id).toBe('restored-1');
  });
});
