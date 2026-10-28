import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';

jest.mock('uuid', () => ({
  v4: jest.fn(() => 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
}));

import {
  createSupabaseMock,
  type SupabaseMockOptions,
} from '../test-utils/supabase-mock';
import type { MergeService } from '../merge/merge.service';
import type { NotificationsService } from '../notifications/notifications.service';
import type { PullRequestAnalysisService } from './pull-request-analysis.service';
import type { PullRequestsService } from './pull-requests.service';
import { PullRequestMergeService } from './pull-request-merge.service';

const author = '33333333-3333-4333-8333-333333333333';
const owner = '44444444-4444-4444-8444-444444444444';
const prId = '66666666-6666-4666-8666-666666666666';

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: prId,
    number: 7,
    source_project_id: 'fork',
    source_branch_id: 'sb',
    target_project_id: 'orig',
    target_branch_id: 'tb',
    author_id: author,
    title: 'Thêm bè',
    status: 'open',
    merge_branch_id: null,
    target_project_name: 'Gốc',
    ...overrides,
  };
}

function setup(options: {
  tables?: SupabaseMockOptions['tables'];
  row?: Record<string, unknown>;
  canMerge?: boolean;
  newCommits?: Array<{ id: string }>;
  mergeResult?: unknown;
  resolveResult?: unknown;
}) {
  const mock = createSupabaseMock([], { tables: options.tables ?? {} });
  const pr = options.row ?? row();
  const loadForUser = jest.fn().mockResolvedValue({
    row: pr,
    targetProject: { id: 'orig' },
    permissions: {
      canMerge: options.canMerge ?? true,
      canClose: true,
      canComment: true,
    },
  });
  const markMerged = jest.fn().mockResolvedValue(undefined);
  const setMergeBranch = jest.fn().mockResolvedValue(undefined);
  const isApplicable = jest.fn(
    (r: { source_branch_id: unknown; target_branch_id: unknown }) =>
      !!(r.source_branch_id && r.target_branch_id),
  );
  const analyze = jest.fn().mockResolvedValue({
    baseCommitId: 'base',
    newCommits: options.newCommits ?? [{ id: 'f2' }, { id: 'f1' }],
  });
  const mergeBranch = jest.fn().mockResolvedValue(
    options.mergeResult ?? {
      hasConflicts: false,
      commit: { id: 'merge-commit' },
    },
  );
  const resolveConflictsAndMerge = jest.fn().mockResolvedValue(
    options.resolveResult ?? {
      hasConflicts: false,
      commit: { id: 'resolved' },
    },
  );
  const notify = jest.fn().mockResolvedValue(undefined);
  const service = new PullRequestMergeService(
    mock.client,
    {
      loadForUser,
      markMerged,
      setMergeBranch,
      isApplicable,
    } as unknown as PullRequestsService,
    { analyze } as unknown as PullRequestAnalysisService,
    { mergeBranch, resolveConflictsAndMerge } as unknown as MergeService,
    { notify } as unknown as NotificationsService,
  );
  return {
    service,
    markMerged,
    setMergeBranch,
    mergeBranch,
    resolveConflictsAndMerge,
    notify,
    ...mock,
  };
}

const importTables = (extra: SupabaseMockOptions['tables'] = {}) =>
  ({
    branches: [
      { data: { id: 'merge-branch' }, error: null },
      { data: null, error: null },
    ],
    commits: [
      { data: [] },
      {
        data: {
          author_id: 'u1',
          message: 'm1',
          snapshot: {},
          created_at: '2026-10-20T00:00:00Z',
        },
      },
      { data: { id: 'n1' }, error: null },
      {
        data: {
          author_id: 'u2',
          message: 'm2',
          snapshot: {},
          created_at: '2026-10-21T00:00:00Z',
        },
      },
      { data: { id: 'n2' }, error: null },
    ],
    commit_lineage: [
      { data: null, error: null },
      { data: null, error: null },
    ],
    ...extra,
  }) as SupabaseMockOptions['tables'];

describe('PullRequestMergeService.mergePullRequest', () => {
  it('imports the commits oldest first, merges and records the result', async () => {
    const {
      service,
      builders,
      mergeBranch,
      markMerged,
      notify,
      setMergeBranch,
    } = setup({ tables: importTables() });

    await expect(
      service.mergePullRequest(prId, owner, {
        expectedTargetHeadCommitId: undefined,
      }),
    ).resolves.toEqual({
      ok: true,
      status: 'merged',
      mergeCommitId: 'merge-commit',
    });

    expect(setMergeBranch).toHaveBeenCalledWith(prId, 'merge-branch');
    expect(builders.commits.insert).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        branch_id: 'merge-branch',
        author_id: 'u1',
        parent_commit_id: 'base',
        created_at: '2026-10-20T00:00:00Z',
      }),
    );
    expect(builders.commits.insert).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ author_id: 'u2', parent_commit_id: 'n1' }),
    );
    expect(builders.commit_lineage.insert).toHaveBeenNthCalledWith(1, {
      commit_id: 'n1',
      origin_commit_id: 'f1',
    });
    expect(builders.branches.update).toHaveBeenCalledWith({
      head_commit_id: 'n2',
    });
    expect(mergeBranch).toHaveBeenCalledWith(
      owner,
      expect.objectContaining({
        sourceBranchId: 'merge-branch',
        targetBranchId: 'tb',
      }),
    );
    expect(markMerged).toHaveBeenCalledWith(prId, 'merge-commit');
    expect(notify).toHaveBeenCalledWith(
      author,
      'pr.merged',
      expect.objectContaining({ title: 'Thêm bè', pullRequestId: prId }),
    );
  });

  it('reuses commits already imported by an earlier attempt', async () => {
    const { service, builders } = setup({
      row: row({ merge_branch_id: 'merge-branch' }),
      tables: {
        branches: [
          { data: { id: 'merge-branch' } },
          { data: null, error: null },
        ],
        commits: [
          { data: [{ id: 'n1' }] },
          {
            data: {
              author_id: 'u2',
              message: 'm2',
              snapshot: {},
              created_at: '2026-10-21T00:00:00Z',
            },
          },
          { data: { id: 'n2' }, error: null },
        ],
        commit_lineage: [
          { data: [{ commit_id: 'n1', origin_commit_id: 'f1' }] },
          { data: null, error: null },
        ],
      },
    });
    await service.mergePullRequest(prId, owner, {});
    expect(builders.commits.insert).toHaveBeenCalledTimes(1);
    expect(builders.commits.insert).toHaveBeenCalledWith(
      expect.objectContaining({ parent_commit_id: 'n1' }),
    );
  });

  it('never adopts an existing branch that already has the pull request name', async () => {
    const { service, builders } = setup({
      tables: importTables({
        branches: [
          { data: null, error: { code: '23505', message: 'duplicate' } },
          { data: { id: 'merge-branch' }, error: null },
          { data: null, error: null },
        ],
      }),
    });
    await service.mergePullRequest(prId, owner, {});
    expect(builders.branches.insert).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ name: 'pr-7' }),
    );
    expect(builders.branches.insert).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ name: 'pr-7-2' }),
    );
  });

  it('reports conflicts without marking the pull request merged', async () => {
    const { service, markMerged, notify } = setup({
      tables: importTables(),
      mergeResult: {
        hasConflicts: true,
        conflictsCount: 2,
        conflictsByBar: {},
      },
    });
    await expect(
      service.mergePullRequest(prId, owner, {}),
    ).rejects.toMatchObject({
      response: { conflicts: { hasConflicts: true, conflictsCount: 2 } },
    });
    expect(markMerged).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });

  it('refuses a pull request that is no longer open', async () => {
    const { service, mergeBranch } = setup({ row: row({ status: 'closed' }) });
    await expect(
      service.mergePullRequest(prId, owner, {}),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(mergeBranch).not.toHaveBeenCalled();
  });

  it('refuses someone without permission to merge', async () => {
    const { service } = setup({ canMerge: false });
    await expect(
      service.mergePullRequest(prId, author, {}),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('refuses when the fork or its branch no longer exists', async () => {
    const { service } = setup({ row: row({ source_branch_id: null }) });
    await expect(
      service.mergePullRequest(prId, owner, {}),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('refuses when there is nothing left to merge', async () => {
    const { service } = setup({ newCommits: [] });
    await expect(
      service.mergePullRequest(prId, owner, {}),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('PullRequestMergeService.resolvePullRequest', () => {
  it('needs the merge to have been started first', async () => {
    const { service } = setup({});
    await expect(
      service.resolvePullRequest(prId, owner, { resolutions: [] }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('completes the merge with the chosen resolutions', async () => {
    const { service, resolveConflictsAndMerge, markMerged } = setup({
      row: row({ merge_branch_id: 'merge-branch' }),
    });
    await service.resolvePullRequest(prId, owner, {
      resolutions: [],
      message: 'Giải quyết',
    });
    expect(resolveConflictsAndMerge).toHaveBeenCalledWith(
      owner,
      expect.objectContaining({
        sourceBranchId: 'merge-branch',
        targetBranchId: 'tb',
        message: 'Giải quyết',
      }),
    );
    expect(markMerged).toHaveBeenCalledWith(prId, 'resolved');
  });
});
