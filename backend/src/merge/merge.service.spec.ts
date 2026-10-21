import 'reflect-metadata';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import {
  createSupabaseMock,
  type SupabaseMockOptions,
} from '../test-utils/supabase-mock';
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
}));

import { BranchesService } from '../branches/branches.service';
import { MergeService } from './merge.service';
import { ConflictChoice } from './dto/resolve-conflict.dto';
import type {
  DraftMeta,
  DraftNote,
  DraftSnapshot,
  DraftTrack,
} from '@stave/shared-types';

const sourceId = '11111111-1111-4111-8111-111111111111';
const targetId = '22222222-2222-4222-8222-222222222222';
const projectId = '33333333-3333-4333-8333-333333333333';
const userId = '44444444-4444-4444-8444-444444444444';
const otherUserId = '55555555-5555-4555-8555-555555555555';
const baseId = '66666666-6666-4666-8666-666666666666';
const sourceHeadId = '77777777-7777-4777-8777-777777777777';
const targetHeadId = '88888888-8888-4888-8888-888888888888';
const emptySnapshot: DraftSnapshot = {
  schemaVersion: 3,
  meta: { tempo: 120, timeSignature: [4, 4], ppq: 480 },
  tracks: [],
  notes: [],
};

function branch(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    project_id: projectId,
    name: id === sourceId ? 'feat' : 'main',
    is_default: id === targetId,
    created_by: userId,
    created_at: '2026-10-21T00:00:00.000Z',
    base_commit_id: baseId,
    head_commit_id: id === sourceId ? sourceHeadId : targetHeadId,
    ...overrides,
  };
}

function commitRow(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    branch_id: targetId,
    message: 'merge message',
    snapshot: emptySnapshot,
    author_id: userId,
    created_at: '2026-10-21T00:00:00.000Z',
    ...overrides,
  };
}

function makeService(
  tables: SupabaseMockOptions['tables'] = {},
  rpc: SupabaseMockOptions['rpc'] = {},
  mergeBase: string | null = baseId,
) {
  const mock = createSupabaseMock([], { tables, rpc });
  const findMergeBase = jest.fn().mockResolvedValue(mergeBase);
  const branchesService = {
    findMergeBase,
  } as unknown as BranchesService;
  const service = new MergeService(mock.client, branchesService);
  return { service, branchesService, findMergeBase, ...mock };
}

function ownerTables(
  branchRows: Array<Record<string, unknown> | { data: unknown }>,
  extra: SupabaseMockOptions['tables'] = {},
) {
  return {
    branches: branchRows.map((row) => ('data' in row ? row : { data: row })),
    projects: [{ data: { owner_id: userId } }],
    ...extra,
  };
}

function snapshot(
  noteRows: DraftNote[] = [],
  trackRows: DraftTrack[] = [],
  meta: DraftMeta = emptySnapshot.meta,
): DraftSnapshot {
  return { schemaVersion: 3, meta, tracks: trackRows, notes: noteRows };
}

function note(id: string, overrides: Partial<DraftNote> = {}): DraftNote {
  return {
    id,
    trackId: 'track-1',
    pitch: 60,
    start: 0,
    duration: 120,
    velocity: 80,
    ...overrides,
  };
}

function track(id: string, overrides: Partial<DraftTrack> = {}): DraftTrack {
  return {
    id,
    name: id,
    order: 0,
    color: '#000000',
    muted: false,
    solo: false,
    volume: 1,
    pan: 0,
    instrument: null,
    ...overrides,
  };
}

describe('BE-MRG-03 MergeService.mergeBranch', () => {
  it('UTCID01 runs a divergent clean merge and creates a merge commit', async () => {
    const resultCommit = commitRow('merge-1');
    const { service, findMergeBase, rpc } = makeService(
      ownerTables([branch(sourceId), branch(targetId)], {
        commits: [
          { data: { snapshot: emptySnapshot } },
          { data: { snapshot: emptySnapshot } },
          { data: { snapshot: emptySnapshot } },
        ],
      }),
      { create_commit_atomic: { data: resultCommit, error: null } },
    );
    const result = await service.mergeBranch(userId, {
      sourceBranchId: sourceId,
      targetBranchId: targetId,
    });
    expect(result).toEqual({
      hasConflicts: false,
      commit: expect.objectContaining({ id: 'merge-1', created_by: userId }),
    });
    expect(findMergeBase.mock.calls).toContainEqual([
      sourceHeadId,
      targetHeadId,
    ]);
    expect(rpc).toHaveBeenCalledWith(
      'create_commit_atomic',
      expect.objectContaining({
        p_branch_id: targetId,
        p_author_id: userId,
        p_parent_commit_id: targetHeadId,
        p_merged_from_branch_id: sourceId,
      }),
    );
  });

  it('UTCID02 fast-forwards when the source head is the merge base', async () => {
    const resultCommit = commitRow(sourceHeadId, { branch_id: sourceId });
    const { service, builders } = makeService(
      ownerTables(
        [
          branch(sourceId),
          branch(targetId, { head_commit_id: baseId }),
          { data: null, error: null },
        ],
        {
          commits: [
            { data: { snapshot: emptySnapshot } },
            { data: resultCommit },
          ],
          drafts: [{ data: null, error: null }],
        },
      ),
      {},
      baseId,
    );
    const result = await service.mergeBranch(userId, {
      sourceBranchId: sourceId,
      targetBranchId: targetId,
    });
    expect(result).toEqual({
      hasConflicts: false,
      commit: expect.objectContaining({ id: sourceHeadId }),
    });
    expect(builders.branches.update).toHaveBeenCalledWith({
      head_commit_id: sourceHeadId,
    });
    expect(builders.drafts.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ branch_id: targetId, snapshot: emptySnapshot }),
      { onConflict: 'branch_id' },
    );
  });

  it('UTCID03 rejects when source head equals target head', async () => {
    const { service } = makeService(
      ownerTables([
        branch(sourceId),
        branch(targetId, { head_commit_id: sourceHeadId }),
      ]),
      {},
      sourceHeadId,
    );
    await expect(
      service.mergeBranch(userId, {
        sourceBranchId: sourceId,
        targetBranchId: targetId,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('UTCID04 rejects a missing source branch', async () => {
    const { service } = makeService(
      ownerTables([{ data: null }, branch(targetId)]),
    );
    await expect(
      service.mergeBranch(userId, {
        sourceBranchId: sourceId,
        targetBranchId: targetId,
      }),
    ).rejects.toThrow(new NotFoundException('Source branch not found'));
  });

  it('UTCID05 rejects a missing target branch', async () => {
    const { service } = makeService(
      ownerTables([branch(sourceId), { data: null }]),
    );
    await expect(
      service.mergeBranch(userId, {
        sourceBranchId: sourceId,
        targetBranchId: targetId,
      }),
    ).rejects.toThrow(new NotFoundException('Target branch not found'));
  });

  it('UTCID06 rejects branches from different projects', async () => {
    const { service } = makeService(
      ownerTables([
        branch(sourceId),
        branch(targetId, { project_id: otherUserId }),
      ]),
    );
    await expect(
      service.mergeBranch(userId, {
        sourceBranchId: sourceId,
        targetBranchId: targetId,
      }),
    ).rejects.toThrow(
      new BadRequestException('Branches must belong to the same project'),
    );
  });

  it('UTCID07 rejects a missing project', async () => {
    const { service } = makeService({
      branches: [{ data: branch(sourceId) }, { data: branch(targetId) }],
      projects: [{ data: null }],
    });
    await expect(
      service.mergeBranch(userId, {
        sourceBranchId: sourceId,
        targetBranchId: targetId,
      }),
    ).rejects.toThrow(new NotFoundException('Project not found'));
  });

  it('UTCID08 forbids a non-owner', async () => {
    const { service } = makeService({
      branches: [{ data: branch(sourceId) }, { data: branch(targetId) }],
      projects: [{ data: { owner_id: otherUserId } }],
    });
    await expect(
      service.mergeBranch(userId, {
        sourceBranchId: sourceId,
        targetBranchId: targetId,
      }),
    ).rejects.toThrow(
      new ForbiddenException('You do not have edit permission on this project'),
    );
  });

  it('UTCID09 rejects a stale expected target head', async () => {
    const { service } = makeService(
      ownerTables([branch(sourceId), branch(targetId)]),
    );
    await expect(
      service.mergeBranch(userId, {
        sourceBranchId: sourceId,
        targetBranchId: targetId,
        expectedTargetHeadCommitId: baseId,
      }),
    ).rejects.toThrow(
      new ConflictException(
        'Target branch has moved on since this merge was started. Please restart the merge.',
      ),
    );
  });

  it('UTCID10 rejects branches without a common ancestor', async () => {
    const { service } = makeService(
      ownerTables([branch(sourceId), branch(targetId)]),
      {},
      null,
    );
    await expect(
      service.mergeBranch(userId, {
        sourceBranchId: sourceId,
        targetBranchId: targetId,
      }),
    ).rejects.toThrow(
      new BadRequestException('Branches have no common ancestor'),
    );
  });

  it('UTCID11 rejects a source already contained by the target', async () => {
    const { service } = makeService(
      ownerTables([branch(sourceId), branch(targetId)]),
      {},
      sourceHeadId,
    );
    await expect(
      service.mergeBranch(userId, {
        sourceBranchId: sourceId,
        targetBranchId: targetId,
      }),
    ).rejects.toThrow(
      new BadRequestException(
        'Nothing to merge. Source branch has no commits the target does not already contain.',
      ),
    );
  });

  it('UTCID13 forbids a view-only collaborator', async () => {
    const { service } = makeService({
      branches: [{ data: branch(sourceId) }, { data: branch(targetId) }],
      projects: [{ data: { owner_id: otherUserId } }],
    });
    await expect(
      service.mergeBranch(userId, {
        sourceBranchId: sourceId,
        targetBranchId: targetId,
      }),
    ).rejects.toThrow(
      new ForbiddenException('You do not have edit permission on this project'),
    );
  });
});

describe('BE-MRG-04 MergeService.fastForward', () => {
  it('UTCID01 advances the target and returns the source commit', async () => {
    const sourceCommit = commitRow(sourceHeadId, { branch_id: sourceId });
    const { service } = makeService(
      ownerTables(
        [
          branch(sourceId),
          branch(targetId, { head_commit_id: baseId }),
          { data: null, error: null },
        ],
        {
          commits: [
            { data: { snapshot: emptySnapshot } },
            { data: sourceCommit },
          ],
          drafts: [{ data: null, error: null }],
        },
      ),
      {},
      baseId,
    );
    await expect(
      service.mergeBranch(userId, {
        sourceBranchId: sourceId,
        targetBranchId: targetId,
      }),
    ).resolves.toEqual({
      hasConflicts: false,
      commit: expect.objectContaining({
        id: sourceHeadId,
        branch_id: sourceId,
        created_by: userId,
      }),
    });
  });

  it('UTCID02 rejects a source without a head', async () => {
    const { service } = makeService(
      ownerTables([
        branch(sourceId, { head_commit_id: null }),
        branch(targetId, { head_commit_id: baseId }),
      ]),
      {},
      baseId,
    );
    await expect(
      service.mergeBranch(userId, {
        sourceBranchId: sourceId,
        targetBranchId: targetId,
      }),
    ).rejects.toThrow(
      new InternalServerErrorException(
        'Source branch has no head commit to fast-forward to',
      ),
    );
  });

  it('UTCID03 rejects a missing source snapshot', async () => {
    const { service } = makeService(
      ownerTables(
        [branch(sourceId), branch(targetId, { head_commit_id: baseId })],
        {
          commits: [
            { data: null },
            { data: { snapshot: emptySnapshot } },
            { data: { snapshot: emptySnapshot } },
          ],
        },
      ),
      {},
      baseId,
    );
    await expect(
      service.mergeBranch(userId, {
        sourceBranchId: sourceId,
        targetBranchId: targetId,
      }),
    ).rejects.toThrow(
      new InternalServerErrorException('Source head commit has no snapshot'),
    );
  });

  it('UTCID04 reports a target branch update error', async () => {
    const { service } = makeService(
      ownerTables(
        [branch(sourceId), branch(targetId, { head_commit_id: baseId })],
        {
          commits: [
            { data: { snapshot: emptySnapshot } },
            { data: { snapshot: emptySnapshot } },
            { data: null },
          ],
          branches: [
            { data: branch(sourceId) },
            { data: branch(targetId, { head_commit_id: baseId }) },
            { data: null, error: { message: 'rls' } },
          ],
        },
      ),
      {},
      baseId,
    );
    await expect(
      service.mergeBranch(userId, {
        sourceBranchId: sourceId,
        targetBranchId: targetId,
      }),
    ).rejects.toThrow(
      new InternalServerErrorException('Failed to fast-forward branch: rls'),
    );
  });

  it('UTCID05 reports a draft upsert error', async () => {
    const { service } = makeService(
      ownerTables(
        [branch(sourceId), branch(targetId, { head_commit_id: baseId })],
        {
          commits: [
            { data: { snapshot: emptySnapshot } },
            { data: { snapshot: emptySnapshot } },
            { data: null },
          ],
          branches: [
            { data: branch(sourceId) },
            { data: branch(targetId, { head_commit_id: baseId }) },
            { data: null, error: null },
          ],
          drafts: [{ data: null, error: { message: 'timeout' } }],
        },
      ),
      {},
      baseId,
    );
    await expect(
      service.mergeBranch(userId, {
        sourceBranchId: sourceId,
        targetBranchId: targetId,
      }),
    ).rejects.toThrow(
      new InternalServerErrorException(
        'Failed to update draft after fast-forward: timeout',
      ),
    );
  });

  it('UTCID06 reports a failed commit reload', async () => {
    const { service } = makeService(
      ownerTables(
        [branch(sourceId), branch(targetId, { head_commit_id: baseId })],
        {
          commits: [
            { data: { snapshot: emptySnapshot } },
            { data: null, error: { message: 'db error' } },
          ],
          branches: [
            { data: branch(sourceId) },
            { data: branch(targetId, { head_commit_id: baseId }) },
            { data: null, error: null },
          ],
          drafts: [{ data: null, error: null }],
        },
      ),
      {},
      baseId,
    );
    await expect(
      service.mergeBranch(userId, {
        sourceBranchId: sourceId,
        targetBranchId: targetId,
      }),
    ).rejects.toThrow(
      new InternalServerErrorException('Failed to load fast-forwarded commit'),
    );
  });

  it('UTCID07 reports an empty commit reload', async () => {
    const { service } = makeService(
      ownerTables(
        [branch(sourceId), branch(targetId, { head_commit_id: baseId })],
        {
          commits: [
            { data: { snapshot: emptySnapshot } },
            { data: null, error: null },
          ],
          branches: [
            { data: branch(sourceId) },
            { data: branch(targetId, { head_commit_id: baseId }) },
            { data: null, error: null },
          ],
          drafts: [{ data: null, error: null }],
        },
      ),
      {},
      baseId,
    );
    await expect(
      service.mergeBranch(userId, {
        sourceBranchId: sourceId,
        targetBranchId: targetId,
      }),
    ).rejects.toThrow(
      new InternalServerErrorException('Failed to load fast-forwarded commit'),
    );
  });
});

describe('BE-MRG-06 MergeService.perform3WayMerge', () => {
  const conflictBase = snapshot([note('n1')]);
  const sourceChanged = snapshot([note('n1', { pitch: 61 })]);
  const targetChanged = snapshot([note('n1', { pitch: 62 })]);
  const rpcSuccess = { create_commit_atomic: { data: commitRow('merged') } };

  function fullMerge(
    base: DraftSnapshot | null,
    source: DraftSnapshot | null,
    target: DraftSnapshot | null,
    rpc: SupabaseMockOptions['rpc'] = rpcSuccess,
    metaSource?: Record<string, unknown>,
  ) {
    const src = branch(sourceId, {
      ...(metaSource ? { name: 'feat', ...metaSource } : {}),
    });
    const tgt = branch(targetId);
    const result = makeService(
      ownerTables([src, tgt], {
        commits: [
          { data: { snapshot: base } },
          { data: { snapshot: source } },
          { data: { snapshot: target } },
        ],
      }),
      rpc,
    );
    return result;
  }

  it('UTCID01 creates a clean merged snapshot using source metadata', async () => {
    const srcMeta = {
      tempo: 100,
      timeSignature: [3, 4] as [number, number],
      ppq: 960,
    };
    const { service, rpc } = fullMerge(
      snapshot([], [], emptySnapshot.meta),
      snapshot([], [], srcMeta),
      snapshot(),
      rpcSuccess,
    );
    const result = await service.mergeBranch(userId, {
      sourceBranchId: sourceId,
      targetBranchId: targetId,
    });
    expect(result).toMatchObject({ hasConflicts: false });
    expect(rpc).toHaveBeenCalledWith(
      'create_commit_atomic',
      expect.objectContaining({
        p_snapshot: expect.objectContaining({
          meta: srcMeta,
          schemaVersion: 3,
        }),
      }),
    );
  });

  it('UTCID02 returns conflicts without writing a merge commit', async () => {
    const { service, rpc } = fullMerge(
      conflictBase,
      sourceChanged,
      targetChanged,
    );
    const result = await service.mergeBranch(userId, {
      sourceBranchId: sourceId,
      targetBranchId: targetId,
    });
    expect(result).toMatchObject({ hasConflicts: true, conflictsCount: 1 });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('UTCID03 substitutes an empty base snapshot', async () => {
    const { service } = fullMerge(null, snapshot([note('s1')]), snapshot());
    await expect(
      service.mergeBranch(userId, {
        sourceBranchId: sourceId,
        targetBranchId: targetId,
      }),
    ).resolves.toMatchObject({ hasConflicts: false });
  });

  it('UTCID04 substitutes empty snapshots when all commit snapshots are missing', async () => {
    const { service, rpc } = fullMerge(null, null, null);
    await expect(
      service.mergeBranch(userId, {
        sourceBranchId: sourceId,
        targetBranchId: targetId,
      }),
    ).resolves.toMatchObject({ hasConflicts: false });
    expect(rpc).toHaveBeenCalledWith(
      'create_commit_atomic',
      expect.objectContaining({
        p_snapshot: expect.objectContaining({
          meta: emptySnapshot.meta,
          notes: [],
          tracks: [],
        }),
      }),
    );
  });

  it('UTCID05 falls back to target metadata when source metadata is absent', async () => {
    const targetMeta = {
      tempo: 80,
      timeSignature: [5, 4] as [number, number],
      ppq: 960,
    };
    const sourceWithoutMeta = {
      ...snapshot(),
      meta: undefined,
    } as unknown as DraftSnapshot;
    const { service, rpc } = fullMerge(
      snapshot(),
      sourceWithoutMeta,
      snapshot([], [], targetMeta),
    );
    await service.mergeBranch(userId, {
      sourceBranchId: sourceId,
      targetBranchId: targetId,
    });
    expect(rpc).toHaveBeenCalledWith(
      'create_commit_atomic',
      expect.objectContaining({
        p_snapshot: expect.objectContaining({ meta: targetMeta }),
      }),
    );
  });

  it('UTCID06 uses default metadata when all snapshots omit metadata', async () => {
    const { service, rpc } = fullMerge(null, null, null);
    await service.mergeBranch(userId, {
      sourceBranchId: sourceId,
      targetBranchId: targetId,
    });
    expect(rpc).toHaveBeenCalledWith(
      'create_commit_atomic',
      expect.objectContaining({
        p_snapshot: expect.objectContaining({ meta: emptySnapshot.meta }),
      }),
    );
  });

  it('UTCID07 propagates an atomic commit RPC error', async () => {
    const { service } = fullMerge(snapshot(), snapshot(), snapshot(), {
      create_commit_atomic: { data: null, error: { message: 'rpc error' } },
    });
    await expect(
      service.mergeBranch(userId, {
        sourceBranchId: sourceId,
        targetBranchId: targetId,
      }),
    ).rejects.toThrow(
      new InternalServerErrorException(
        'Failed to create merge commit: rpc error',
      ),
    );
  });
});

describe('BE-MRG-07 MergeService.mergeNotes', () => {
  function pureMerge(
    baseNotes: DraftNote[],
    sourceNotes: DraftNote[],
    targetNotes: DraftNote[],
  ) {
    const { service } = makeService();
    return (
      service as unknown as {
        mergeNotes: (
          b: DraftNote[],
          s: DraftNote[],
          t: DraftNote[],
        ) => { merged: DraftNote[]; conflicts: unknown[] };
      }
    ).mergeNotes(baseNotes, sourceNotes, targetNotes);
  }
  const base = note('n1');

  it('UTCID01 keeps a note equal on source and target', () =>
    expect(pureMerge([base], [base], [base])).toEqual({
      merged: [base],
      conflicts: [],
    }));
  it('UTCID02 chooses source when only source changed', () =>
    expect(
      pureMerge([base], [note('n1', { pitch: 61 })], [base]).merged,
    ).toEqual([note('n1', { pitch: 61 })]));
  it('UTCID03 chooses target when only target changed', () =>
    expect(
      pureMerge([base], [base], [note('n1', { pitch: 62 })]).merged,
    ).toEqual([note('n1', { pitch: 62 })]));
  it('UTCID04 conflicts when both sides changed differently', () =>
    expect(
      pureMerge(
        [base],
        [note('n1', { pitch: 61 })],
        [note('n1', { pitch: 62 })],
      ).conflicts,
    ).toMatchObject([{ noteId: 'n1', type: 'MODIFIED_DIFFERENTLY' }]));
  it('UTCID05 conflicts for divergent additions with the same id', () =>
    expect(
      pureMerge([], [note('n1', { pitch: 61 })], [note('n1', { pitch: 62 })])
        .conflicts,
    ).toMatchObject([{ noteId: 'n1', type: 'MODIFIED_DIFFERENTLY' }]));
  it('UTCID06 keeps an addition made only on source', () =>
    expect(pureMerge([], [note('n2')], []).merged).toEqual([note('n2')]));
  it('UTCID07 conflicts when source modifies and target deletes', () =>
    expect(
      pureMerge([base], [note('n1', { pitch: 61 })], []).conflicts,
    ).toMatchObject([{ noteId: 'n1', type: 'DELETE_VS_MODIFY' }]));
  it('UTCID08 drops a source note unchanged from base when target deletes it', () =>
    expect(pureMerge([base], [base], []).merged).toEqual([]));
  it('UTCID09 keeps an addition made only on target', () =>
    expect(pureMerge([], [], [note('n2')]).merged).toEqual([note('n2')]));
  it('UTCID10 conflicts when target modifies and source deletes', () =>
    expect(
      pureMerge([base], [], [note('n1', { pitch: 62 })]).conflicts,
    ).toMatchObject([{ noteId: 'n1', type: 'DELETE_VS_MODIFY' }]));
  it('UTCID11 drops a target note unchanged from base when source deletes it', () =>
    expect(pureMerge([base], [], [base]).merged).toEqual([]));
  it('UTCID12 drops a note deleted on both sides', () =>
    expect(pureMerge([base], [], []).merged).toEqual([]));
  it('UTCID13 handles three empty arrays', () =>
    expect(pureMerge([], [], [])).toEqual({ merged: [], conflicts: [] }));
});

describe('BE-MRG-08 MergeService.mergeTracks', () => {
  function pureTracks(
    base: DraftTrack[],
    source: DraftTrack[],
    target: DraftTrack[],
  ) {
    const { service } = makeService();
    return (
      service as unknown as {
        mergeTracks: (
          b: DraftTrack[],
          s: DraftTrack[],
          t: DraftTrack[],
        ) => DraftTrack[];
      }
    ).mergeTracks(base, source, target);
  }

  it('UTCID01 prefers a changed source track', () =>
    expect(
      pureTracks(
        [track('t')],
        [track('t', { name: 'source' })],
        [track('t', { name: 'target' })],
      ),
    ).toEqual([track('t', { name: 'source' })]));
  it('UTCID02 currently prefers source when only target changed', () =>
    expect(
      pureTracks([track('t')], [track('t')], [track('t', { name: 'target' })]),
    ).toEqual([track('t')]));
  it('UTCID03 keeps a source-deleted track when target is unchanged', () =>
    expect(pureTracks([track('t')], [], [track('t')])).toEqual([track('t')]));
  it('UTCID04 keeps a target-deleted track when source is unchanged', () =>
    expect(pureTracks([track('t')], [track('t')], [])).toEqual([track('t')]));
  it('UTCID05 resurrects a base track deleted on both sides', () =>
    expect(pureTracks([track('t')], [], [])).toEqual([track('t')]));
  it('UTCID06 keeps a track added only on target', () =>
    expect(pureTracks([], [], [track('t')])).toEqual([track('t')]));
  it('UTCID07 returns an empty list when all inputs are empty', () =>
    expect(pureTracks([], [], [])).toEqual([]));
});

describe('BE-MRG-10 MergeService.groupConflictsByBar', () => {
  function group(
    conflicts: Array<{
      noteId: string;
      type: 'MODIFIED_DIFFERENTLY' | 'DELETE_VS_MODIFY';
      targetNote?: DraftNote;
      sourceNote?: DraftNote;
      baseNote?: DraftNote;
    }>,
    meta?: DraftMeta,
  ) {
    const { service } = makeService();
    return (
      service as unknown as {
        groupConflictsByBar: (
          c: typeof conflicts,
          m?: DraftMeta,
        ) => Record<number, unknown[]>;
      }
    ).groupConflictsByBar(conflicts, meta);
  }
  const conflict = (n?: DraftNote) => ({
    noteId: n?.id ?? 'missing',
    type: 'MODIFIED_DIFFERENTLY' as const,
    ...(n ? { targetNote: n } : {}),
  });

  it('UTCID01 returns an empty object for no conflicts', () =>
    expect(group([])).toEqual({}));
  it('UTCID02 puts a note at tick zero in bar one', () =>
    expect(group([conflict(note('n', { start: 0 }))])).toHaveProperty('1'));
  it('UTCID03 puts tick 1919 in bar one', () =>
    expect(group([conflict(note('n', { start: 1919 }))])).toHaveProperty('1'));
  it('UTCID04 puts tick 1920 in bar two', () =>
    expect(group([conflict(note('n', { start: 1920 }))])).toHaveProperty('2'));
  it('UTCID05 uses source note when target note is absent', () =>
    expect(
      group([
        {
          noteId: 's',
          type: 'DELETE_VS_MODIFY',
          sourceNote: note('s', { start: 3840 }),
        },
      ]),
    ).toHaveProperty('3'));
  it('UTCID06 uses base note when target and source are absent', () =>
    expect(
      group([
        {
          noteId: 'b',
          type: 'DELETE_VS_MODIFY',
          baseNote: note('b', { start: 1920 }),
        },
      ]),
    ).toHaveProperty('2'));
  it('UTCID07 skips a conflict without any note payload', () =>
    expect(group([{ noteId: 'x', type: 'MODIFIED_DIFFERENTLY' }])).toEqual({}));
  it('UTCID08 derives bar size from ppq and meter', () =>
    expect(
      group([conflict(note('n', { start: 2880 }))], {
        tempo: 120,
        ppq: 960,
        timeSignature: [3, 4],
      }),
    ).toHaveProperty('2'));
  it('UTCID09 defaults a missing denominator to four', () =>
    expect(
      group([conflict(note('n', { start: 1920 }))], {
        tempo: 120,
        ppq: 480,
        timeSignature: [4] as unknown as [number, number],
      }),
    ).toHaveProperty('2'));
});

describe('BE-MRG-11 MergeService.createMergeCommit', () => {
  it('UTCID01 maps the commit row and records both parents', async () => {
    const row = commitRow('merge-1');
    const { service, rpc } = makeService(
      {},
      { create_commit_atomic: { data: row } },
    );
    const target = branch(targetId) as never;
    const result = await (
      service as unknown as {
        createMergeCommit: (
          u: string,
          t: never,
          s: string,
          snap: DraftSnapshot,
          m: string,
        ) => Promise<unknown>;
      }
    ).createMergeCommit(userId, target, sourceId, emptySnapshot, 'merged');
    expect(result).toEqual({
      id: row.id,
      branch_id: row.branch_id,
      message: row.message,
      snapshot: row.snapshot,
      created_by: userId,
      created_at: row.created_at,
    });
    expect(rpc).toHaveBeenCalledWith('create_commit_atomic', {
      p_branch_id: targetId,
      p_author_id: userId,
      p_message: 'merged',
      p_snapshot: emptySnapshot,
      p_parent_commit_id: targetHeadId,
      p_merged_from_branch_id: sourceId,
    });
  });

  it('UTCID02 passes a null target parent to the RPC', async () => {
    const { service, rpc } = makeService(
      {},
      {
        create_commit_atomic: {
          data: commitRow('merge-2', { branch_id: targetId }),
        },
      },
    );
    const target = branch(targetId, { head_commit_id: null }) as never;
    await (
      service as unknown as {
        createMergeCommit: (
          u: string,
          t: never,
          s: string,
          snap: DraftSnapshot,
          m: string,
        ) => Promise<unknown>;
      }
    ).createMergeCommit(userId, target, sourceId, emptySnapshot, 'message');
    expect(rpc).toHaveBeenCalledWith(
      'create_commit_atomic',
      expect.objectContaining({ p_parent_commit_id: null }),
    );
  });

  it('UTCID03 throws on RPC error', async () => {
    const { service } = makeService(
      {},
      {
        create_commit_atomic: {
          data: null,
          error: { message: 'permission denied' },
        },
      },
    );
    await expect(
      (
        service as unknown as {
          createMergeCommit: (
            u: string,
            t: never,
            s: string,
            snap: DraftSnapshot,
            m: string,
          ) => Promise<unknown>;
        }
      ).createMergeCommit(
        userId,
        branch(targetId) as never,
        sourceId,
        emptySnapshot,
        'message',
      ),
    ).rejects.toThrow(
      new InternalServerErrorException(
        'Failed to create merge commit: permission denied',
      ),
    );
  });

  it('UTCID04 passes a null parent and propagates RPC errors', async () => {
    const { service } = makeService(
      {},
      {
        create_commit_atomic: {
          data: null,
          error: { message: 'permission denied' },
        },
      },
    );
    await expect(
      (
        service as unknown as {
          createMergeCommit: (
            u: string,
            t: never,
            s: string,
            snap: DraftSnapshot,
            m: string,
          ) => Promise<unknown>;
        }
      ).createMergeCommit(
        userId,
        branch(targetId, { head_commit_id: null }) as never,
        sourceId,
        emptySnapshot,
        'message',
      ),
    ).rejects.toThrow(
      new InternalServerErrorException(
        'Failed to create merge commit: permission denied',
      ),
    );
  });
});

describe('BE-MRG-05 MergeService.resolveConflictsAndMerge', () => {
  const conflictBase = snapshot([note('n1')]);
  const sourceChanged = snapshot([note('n1', { pitch: 61 })]);
  const targetChanged = snapshot([note('n1', { pitch: 62 })]);
  const rpcSuccess = { create_commit_atomic: { data: commitRow('resolved') } };
  const pickSource = [{ noteId: 'n1', choice: ConflictChoice.PICK_SOURCE }];

  function resolveSetup(
    options: {
      rpc?: SupabaseMockOptions['rpc'];
      mergeBase?: string | null;
      snapshots?: Array<DraftSnapshot | null>;
    } = {},
  ) {
    const mergeBase =
      options.mergeBase === undefined ? baseId : options.mergeBase;
    const snapshots = options.snapshots ?? [
      conflictBase,
      sourceChanged,
      targetChanged,
    ];
    return makeService(
      ownerTables([branch(sourceId), branch(targetId)], {
        commits: snapshots.map((snap) => ({ data: { snapshot: snap } })),
      }),
      options.rpc ?? rpcSuccess,
      mergeBase,
    );
  }

  const dtoBase = { sourceBranchId: sourceId, targetBranchId: targetId };

  it('UTCID01 creates a commit with the user message and chosen note', async () => {
    const { service, rpc } = resolveSetup();
    const result = await service.resolveConflictsAndMerge(userId, {
      ...dtoBase,
      resolutions: pickSource,
      message: 'Resolve merge',
    });
    expect(result).toEqual({
      hasConflicts: false,
      commit: expect.objectContaining({ id: 'resolved' }),
    });
    expect(rpc).toHaveBeenCalledWith(
      'create_commit_atomic',
      expect.objectContaining({
        p_message: 'Resolve merge',
        p_branch_id: targetId,
        p_merged_from_branch_id: sourceId,
        p_snapshot: expect.objectContaining({
          notes: [note('n1', { pitch: 61 })],
        }),
      }),
    );
  });

  it('UTCID02 uses the default commit message when none is given', async () => {
    const { service, rpc } = resolveSetup();
    await service.resolveConflictsAndMerge(userId, {
      ...dtoBase,
      resolutions: pickSource,
    });
    expect(rpc).toHaveBeenCalledWith(
      'create_commit_atomic',
      expect.objectContaining({ p_message: "Merge branch 'feat' into main" }),
    );
  });

  it('UTCID03 accepts an expected target head equal to the current head', async () => {
    const { service } = resolveSetup();
    await expect(
      service.resolveConflictsAndMerge(userId, {
        ...dtoBase,
        resolutions: pickSource,
        message: 'Resolve merge',
        expectedTargetHeadCommitId: targetHeadId,
      }),
    ).resolves.toMatchObject({ hasConflicts: false });
  });

  it('UTCID04 rejects a missing source branch', async () => {
    const { service } = makeService(
      ownerTables([{ data: null }, branch(targetId)]),
    );
    await expect(
      service.resolveConflictsAndMerge(userId, {
        ...dtoBase,
        resolutions: [],
      }),
    ).rejects.toThrow(new NotFoundException('Branch not found'));
  });

  it('UTCID05 rejects a missing target branch', async () => {
    const { service } = makeService(
      ownerTables([branch(sourceId), { data: null }]),
    );
    await expect(
      service.resolveConflictsAndMerge(userId, {
        ...dtoBase,
        resolutions: [],
      }),
    ).rejects.toThrow(new NotFoundException('Branch not found'));
  });

  it('UTCID06 rejects branches from different projects', async () => {
    const { service } = makeService(
      ownerTables([
        branch(sourceId),
        branch(targetId, { project_id: otherUserId }),
      ]),
    );
    await expect(
      service.resolveConflictsAndMerge(userId, {
        ...dtoBase,
        resolutions: [],
      }),
    ).rejects.toThrow(
      new BadRequestException('Branches must belong to the same project'),
    );
  });

  it('UTCID07 rejects a missing project', async () => {
    const { service } = makeService({
      branches: [{ data: branch(sourceId) }, { data: branch(targetId) }],
      projects: [{ data: null }],
    });
    await expect(
      service.resolveConflictsAndMerge(userId, {
        ...dtoBase,
        resolutions: [],
      }),
    ).rejects.toThrow(new NotFoundException('Project not found'));
  });

  it('UTCID08 forbids a user who is not a project member', async () => {
    const { service } = makeService({
      branches: [{ data: branch(sourceId) }, { data: branch(targetId) }],
      projects: [{ data: { owner_id: otherUserId } }],
    });
    await expect(
      service.resolveConflictsAndMerge(userId, {
        ...dtoBase,
        resolutions: [],
      }),
    ).rejects.toThrow(
      new ForbiddenException('You do not have edit permission on this project'),
    );
  });

  it('UTCID09 rejects a stale expected target head', async () => {
    const { service } = makeService(
      ownerTables([branch(sourceId), branch(targetId)]),
    );
    await expect(
      service.resolveConflictsAndMerge(userId, {
        ...dtoBase,
        resolutions: [],
        expectedTargetHeadCommitId: baseId,
      }),
    ).rejects.toThrow(
      new ConflictException(
        'Target branch has moved on since this merge was started. Please restart the merge.',
      ),
    );
  });

  it.failing(
    'UTCID10 rejects branches without a common ancestor (SRS 2.E1; code merges against an empty base)',
    async () => {
      const { service } = resolveSetup({
        mergeBase: null,
        snapshots: [sourceChanged, targetChanged],
      });
      await expect(
        service.resolveConflictsAndMerge(userId, {
          ...dtoBase,
          resolutions: pickSource,
          message: 'Resolve merge',
        }),
      ).rejects.toThrow(
        new BadRequestException('Branches have no common ancestor'),
      );
    },
  );

  it.failing(
    'UTCID11 rejects an unresolved conflict (BR-53/BR-97; code silently picks the target)',
    async () => {
      const { service } = resolveSetup();
      await expect(
        service.resolveConflictsAndMerge(userId, {
          ...dtoBase,
          resolutions: [],
          message: 'Resolve merge',
        }),
      ).rejects.toThrow(BadRequestException);
    },
  );

  it('UTCID12 propagates a commit RPC failure', async () => {
    const { service } = resolveSetup({
      rpc: {
        create_commit_atomic: { data: null, error: { message: 'rpc error' } },
      },
    });
    await expect(
      service.resolveConflictsAndMerge(userId, {
        ...dtoBase,
        resolutions: pickSource,
        message: 'Resolve merge',
      }),
    ).rejects.toThrow(
      new InternalServerErrorException(
        'Failed to create merge commit: rpc error',
      ),
    );
  });

  it('UTCID14 forbids a view-only collaborator', async () => {
    const { service } = makeService({
      branches: [{ data: branch(sourceId) }, { data: branch(targetId) }],
      projects: [{ data: { owner_id: otherUserId } }],
    });
    await expect(
      service.resolveConflictsAndMerge(userId, {
        ...dtoBase,
        resolutions: pickSource,
      }),
    ).rejects.toThrow(
      new ForbiddenException('You do not have edit permission on this project'),
    );
  });
});

describe('BE-MRG-09 MergeService.applyResolutionsWithMergedNotes', () => {
  type Conflict = {
    noteId: string;
    type: 'MODIFIED_DIFFERENTLY' | 'DELETE_VS_MODIFY';
    baseNote?: DraftNote;
    sourceNote?: DraftNote;
    targetNote?: DraftNote;
  };
  type Resolution = {
    noteId: string;
    choice: ConflictChoice;
    customNote?: Partial<DraftNote>;
  };

  const pre = [note('p1'), note('p2', { pitch: 62 })];
  const baseNote = note('n', {
    trackId: 'base-track',
    pitch: 50,
    start: 10,
    duration: 20,
    velocity: 30,
  });
  const sourceNote = note('n', { pitch: 61 });
  const targetNote = note('n', { pitch: 62 });
  const modified: Conflict = {
    noteId: 'n',
    type: 'MODIFIED_DIFFERENTLY',
    baseNote,
    sourceNote,
    targetNote,
  };

  function apply(
    conflicts: Conflict[],
    resolutions: Resolution[],
    options: {
      preMerged?: DraftNote[];
      source?: DraftSnapshot;
      target?: DraftSnapshot;
    } = {},
  ): DraftSnapshot {
    const { service } = makeService();
    return (
      service as unknown as {
        applyResolutionsWithMergedNotes: (
          b: DraftSnapshot,
          s: DraftSnapshot,
          t: DraftSnapshot,
          p: DraftNote[],
          c: Conflict[],
          r: Resolution[],
        ) => DraftSnapshot;
      }
    ).applyResolutionsWithMergedNotes(
      snapshot(),
      options.source ?? snapshot(),
      options.target ?? snapshot(),
      options.preMerged ?? pre,
      conflicts,
      resolutions,
    );
  }

  it('UTCID01 keeps pre-merged notes and merges tracks without conflicts', () => {
    const source = snapshot([], [track('t', { name: 'source' })], {
      tempo: 90,
      timeSignature: [3, 4],
      ppq: 480,
    });
    const result = apply([], [], { source });
    expect(result.notes).toEqual(pre);
    expect(result.tracks).toEqual([track('t', { name: 'source' })]);
    expect(result.meta).toEqual(source.meta);
    expect(result.schemaVersion).toBe(3);
  });

  it('UTCID02 adds the source note for PICK_SOURCE', () =>
    expect(
      apply([modified], [{ noteId: 'n', choice: ConflictChoice.PICK_SOURCE }])
        .notes,
    ).toEqual([...pre, sourceNote]));

  it('UTCID03 adds the target note for PICK_TARGET', () =>
    expect(
      apply([modified], [{ noteId: 'n', choice: ConflictChoice.PICK_TARGET }])
        .notes,
    ).toEqual([...pre, targetNote]));

  it('UTCID04 builds a custom note from a full customNote', () => {
    const custom = {
      trackId: 'custom-track',
      pitch: 70,
      start: 100,
      duration: 200,
      velocity: 90,
    };
    expect(
      apply(
        [modified],
        [
          {
            noteId: 'n',
            choice: ConflictChoice.PICK_CUSTOM,
            customNote: custom,
          },
        ],
      ).notes,
    ).toEqual([...pre, { id: 'n', ...custom }]);
  });

  it('UTCID05 fills missing custom fields from the base note', () =>
    expect(
      apply(
        [modified],
        [
          {
            noteId: 'n',
            choice: ConflictChoice.PICK_CUSTOM,
            customNote: { pitch: 70 },
          },
        ],
      ).notes,
    ).toEqual([
      ...pre,
      {
        id: 'n',
        trackId: 'base-track',
        pitch: 70,
        start: 10,
        duration: 20,
        velocity: 30,
      },
    ]));

  it('UTCID06 falls back to defaults when there is no base note', () =>
    expect(
      apply(
        [{ ...modified, baseNote: undefined }],
        [
          {
            noteId: 'n',
            choice: ConflictChoice.PICK_CUSTOM,
            customNote: { trackId: 'track-1' },
          },
        ],
        { preMerged: [] },
      ).notes,
    ).toEqual([
      {
        id: 'n',
        trackId: 'track-1',
        pitch: 60,
        start: 0,
        duration: 480,
        velocity: 80,
      },
    ]));

  it.failing(
    'UTCID07 rejects PICK_CUSTOM without a customNote (BR-53; code drops the note)',
    () =>
      expect(() =>
        apply(
          [modified],
          [{ noteId: 'n', choice: ConflictChoice.PICK_CUSTOM }],
        ),
      ).toThrow(BadRequestException),
  );

  it.failing(
    'UTCID08 rejects a conflict without a resolution (BR-53/BR-97; code picks the target)',
    () => expect(() => apply([modified], [])).toThrow(BadRequestException),
  );

  it('UTCID09 drops the note when the target deleted it and the target is picked', () =>
    expect(
      apply(
        [{ noteId: 'n', type: 'DELETE_VS_MODIFY', baseNote, sourceNote }],
        [{ noteId: 'n', choice: ConflictChoice.PICK_TARGET }],
      ).notes,
    ).toEqual(pre));

  it('UTCID10 drops the note when the source deleted it and the source is picked', () =>
    expect(
      apply(
        [{ noteId: 'n', type: 'DELETE_VS_MODIFY', baseNote, targetNote }],
        [{ noteId: 'n', choice: ConflictChoice.PICK_SOURCE }],
      ).notes,
    ).toEqual(pre));

  it.failing(
    'UTCID11 maps customNote.startTime to the note start (DTO field; code reads only start)',
    () => {
      const result = apply(
        [modified],
        [
          {
            noteId: 'n',
            choice: ConflictChoice.PICK_CUSTOM,
            customNote: { startTime: 555 } as unknown as Partial<DraftNote>,
          },
        ],
      );
      expect(result.notes.find((n) => n.id === 'n')?.start).toBe(555);
    },
  );

  it('UTCID12 takes meta from the target when the source has none', () => {
    const targetMeta = {
      tempo: 70,
      timeSignature: [6, 8] as [number, number],
      ppq: 960,
    };
    const result = apply([], [], {
      source: { ...snapshot(), meta: undefined } as unknown as DraftSnapshot,
      target: snapshot([], [], targetMeta),
    });
    expect(result.meta).toEqual(targetMeta);
  });
});
