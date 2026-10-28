import { BadRequestException } from '@nestjs/common';

jest.mock('uuid', () => ({
  v4: jest.fn(() => 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
}));

import {
  createSupabaseMock,
  type SupabaseMockOptions,
} from '../test-utils/supabase-mock';
import { DiffService } from '../commits/diff.service';
import type { BranchesService } from '../branches/branches.service';
import type { MergeService } from '../merge/merge.service';
import { PullRequestAnalysisService } from './pull-request-analysis.service';

const snapshot = (notes: unknown[] = []) => ({
  schemaVersion: 3,
  meta: { tempo: 120, timeSignature: [4, 4], ppq: 480 },
  tracks: [],
  notes,
});

const commit = (id: string, parent: string | null) => ({
  id,
  branch_id: 'fb',
  author_id: 'u1',
  message: `commit ${id}`,
  created_at: '2026-10-20T00:00:00Z',
  parent_commit_id: parent,
});

function makeService(options: {
  tables: SupabaseMockOptions['tables'];
  targetAncestors: string[];
}) {
  const mock = createSupabaseMock([], { tables: options.tables });
  const branches = {
    getAncestorIds: jest.fn().mockResolvedValue(options.targetAncestors),
  } as unknown as BranchesService;
  const previewMerge = jest
    .fn()
    .mockReturnValue({ conflictsCount: 2, conflictsByBar: { 1: [] } });
  const merge = { previewMerge } as unknown as MergeService;
  const service = new PullRequestAnalysisService(
    mock.client,
    branches,
    new DiffService(),
    merge,
  );
  return { service, branches, previewMerge };
}

const sourceBranch = {
  id: 'sb',
  project_id: 'fork',
  name: 'main',
  head_commit_id: 'f3',
};
const targetBranch = {
  id: 'tb',
  project_id: 'orig',
  name: 'main',
  head_commit_id: 't1',
};

function tables(
  chain: ReturnType<typeof commit>[],
  origins: Array<{ commit_id: string; origin_commit_id: string }>,
  importedRows: Array<{ commit_id: string; origin_commit_id: string }>,
): SupabaseMockOptions['tables'] {
  return {
    branches: [
      { data: sourceBranch },
      { data: targetBranch },
      { data: [{ id: 'fb' }] },
    ],
    commits: [
      { data: chain },
      { data: { snapshot: snapshot() } },
      { data: { snapshot: snapshot() } },
      { data: { snapshot: snapshot() } },
    ],
    commit_lineage: [{ data: origins }, { data: importedRows }],
  };
}

describe('PullRequestAnalysisService.analyze', () => {
  it('finds the commits of the fork that the original does not have', async () => {
    const { service, previewMerge } = makeService({
      tables: tables(
        [commit('f3', 'f2'), commit('f2', 'f1'), commit('f1', null)],
        [{ commit_id: 'f1', origin_commit_id: 'o1' }],
        [],
      ),
      targetAncestors: ['t1', 'o1', 'o0'],
    });
    const result = await service.analyze('sb', 'tb');
    expect(result.baseCommitId).toBe('o1');
    expect(result.newCommits.map((c) => c.id)).toEqual(['f3', 'f2']);
    expect(result.conflictsCount).toBe(2);
    expect(previewMerge).toHaveBeenCalled();
  });

  it('treats commits already imported into the original as the base', async () => {
    const { service } = makeService({
      tables: tables(
        [commit('f3', 'f2'), commit('f2', 'f1'), commit('f1', null)],
        [{ commit_id: 'f1', origin_commit_id: 'o1' }],
        [{ commit_id: 't2', origin_commit_id: 'f2' }],
      ),
      targetAncestors: ['t2', 't1', 'o1'],
    });
    const result = await service.analyze('sb', 'tb');
    expect(result.baseCommitId).toBe('t2');
    expect(result.newCommits.map((c) => c.id)).toEqual(['f3']);
  });

  it('reports no new commits when the fork has nothing the original lacks', async () => {
    const { service } = makeService({
      tables: tables(
        [commit('f3', null)],
        [{ commit_id: 'f3', origin_commit_id: 'o1' }],
        [],
      ),
      targetAncestors: ['o1'],
    });
    const result = await service.analyze('sb', 'tb');
    expect(result.newCommits).toEqual([]);
    expect(result.baseCommitId).toBe('o1');
  });

  it('rejects branches that share no history', async () => {
    const { service } = makeService({
      tables: tables([commit('f3', null)], [], []),
      targetAncestors: ['t1'],
    });
    await expect(service.analyze('sb', 'tb')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
