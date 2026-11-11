import 'reflect-metadata';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { DraftNote, DraftSnapshot } from '@stave/shared-types';
import { createSupabaseMock } from '../test-utils/supabase-mock';
import {
  THEORY_CACHE_MAX_ENTRIES,
  TheoryInsightService,
} from './theory-insight.service';
import { GeminiClient } from './gemini-client';
import { AiRateLimiter } from './ai-rate-limiter';
import { ProjectAccessService } from '../project-access/project-access.service';
import { DraftsService } from '../drafts/drafts.service';

const userId = '11111111-1111-4111-8111-111111111111';
const projectId = '22222222-2222-4222-8222-222222222222';
const commitId = '33333333-3333-4333-8333-333333333333';
const branchId = '44444444-4444-4444-8444-444444444444';

function n(id: string, pitch: number): DraftNote {
  return { id, trackId: 't1', pitch, start: 0, duration: 1920, velocity: 90 };
}

const cMajor: DraftSnapshot = {
  schemaVersion: 3,
  meta: { tempo: 120, timeSignature: [4, 4], ppq: 480 },
  tracks: [],
  notes: [n('a', 60), n('b', 64), n('c', 67)],
};

function build(opts: {
  commitReads?: number;
  assertCanRead?: jest.Mock;
  getAccess?: jest.Mock;
  getDraft?: jest.Mock;
  generateText?: jest.Mock;
  tables?: Record<string, Array<{ data: unknown }>>;
}) {
  const reads = opts.commitReads ?? 1;
  const mock = createSupabaseMock([], {
    tables: opts.tables ?? {
      commits: Array.from({ length: reads }, () => ({
        data: { snapshot: cMajor, branch_id: branchId },
      })),
      branches: Array.from({ length: reads }, () => ({
        data: { id: branchId },
      })),
    },
  });
  const assertCanRead =
    opts.assertCanRead ?? jest.fn().mockResolvedValue(undefined);
  const access = {
    assertCanRead,
    getAccess: opts.getAccess ?? jest.fn().mockResolvedValue(null),
  } as unknown as ProjectAccessService;
  const drafts = {
    getDraft: opts.getDraft ?? jest.fn().mockResolvedValue(cMajor),
  } as unknown as DraftsService;
  const generateText =
    opts.generateText ?? jest.fn().mockResolvedValue('Hợp âm Đô trưởng.');
  const service = new TheoryInsightService(
    mock.client,
    access,
    drafts,
    { generateText } as unknown as GeminiClient,
    { tryConsume: jest.fn().mockReturnValue(true) } as unknown as AiRateLimiter,
  );
  return { service, assertCanRead, generateText, mock };
}

describe('TheoryInsightService commit cache', () => {
  it('serves a repeated commit from memory without re-reading or calling Gemini', async () => {
    const { service, generateText, mock } = build({});
    const first = await service.insight(userId, projectId, commitId, 'vi');
    const second = await service.insight(userId, projectId, commitId, 'vi');
    expect(second).toEqual(first);
    expect(generateText).toHaveBeenCalledTimes(1);
    expect(mock.builders.commits.select).toHaveBeenCalledTimes(1);
  });

  it('checks read access on every call, including cache hits', async () => {
    const assertCanRead = jest
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new ForbiddenException('no'));
    const { service } = build({ assertCanRead });
    await service.insight(userId, projectId, commitId, 'vi');
    await expect(
      service.insight(
        '99999999-9999-4999-8999-999999999999',
        projectId,
        commitId,
        'vi',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(assertCanRead).toHaveBeenCalledTimes(2);
  });

  it('keeps languages apart', async () => {
    const { service, generateText } = build({ commitReads: 2 });
    await service.insight(userId, projectId, commitId, 'vi');
    await service.insight(userId, projectId, commitId, 'en');
    expect(generateText).toHaveBeenCalledTimes(2);
  });

  it('does not let a commit cached for one project answer for another', async () => {
    const otherProject = '55555555-5555-4555-8555-555555555555';
    const { service } = build({
      tables: {
        commits: [
          { data: { snapshot: cMajor, branch_id: branchId } },
          { data: { snapshot: cMajor, branch_id: branchId } },
        ],
        branches: [{ data: { id: branchId } }, { data: null }],
      },
    });
    await service.insight(userId, projectId, commitId, 'vi');
    await expect(
      service.insight(userId, otherProject, commitId, 'vi'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('does not cache a result whose explanation failed, so it can be retried', async () => {
    const generateText = jest
      .fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce('Hợp âm Đô trưởng.');
    const { service } = build({ commitReads: 2, generateText });
    const first = await service.insight(userId, projectId, commitId, 'vi');
    expect(first.explanation).toBeNull();
    const second = await service.insight(userId, projectId, commitId, 'vi');
    expect(second.explanation).toBe('Hợp âm Đô trưởng.');
  });

  it('never caches the draft (no commit id)', async () => {
    const getDraft = jest.fn().mockResolvedValue(cMajor);
    const { service } = build({
      getAccess: jest.fn().mockResolvedValue('owner'),
      getDraft,
    });
    await service.insight(userId, projectId, null, 'vi');
    await service.insight(userId, projectId, null, 'vi');
    expect(getDraft).toHaveBeenCalledTimes(2);
  });

  it('evicts the least recently used entry beyond the size limit', async () => {
    const total = THEORY_CACHE_MAX_ENTRIES + 1;
    const { service, generateText } = build({ commitReads: total + 1 });
    const ids = Array.from(
      { length: total },
      (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    );
    for (const id of ids) await service.insight(userId, projectId, id, 'vi');
    expect(generateText).toHaveBeenCalledTimes(total);
    await service.insight(userId, projectId, ids[1], 'vi');
    expect(generateText).toHaveBeenCalledTimes(total);
    await service.insight(userId, projectId, ids[0], 'vi');
    expect(generateText).toHaveBeenCalledTimes(total + 1);
  });
});

describe('TheoryInsightService current snapshot for limited readers', () => {
  it('falls back to the default branch head when the draft read is forbidden', async () => {
    const getDraft = jest
      .fn()
      .mockRejectedValue(new ForbiddenException('no draft access'));
    const { service } = build({
      getAccess: jest.fn().mockResolvedValue('view'),
      getDraft,
      tables: {
        branches: [
          { data: { head_commit_id: commitId } },
          { data: { id: branchId } },
        ],
        commits: [{ data: { snapshot: cMajor, branch_id: branchId } }],
      },
    });
    const result = await service.insight(userId, projectId, null, 'vi');
    expect(getDraft).toHaveBeenCalledTimes(1);
    expect(result.chords).toEqual([{ bar: 1, chord: 'C' }]);
  });

  it('still reads the active branch draft or head for a view-only collaborator', async () => {
    const getDraft = jest.fn().mockResolvedValue(cMajor);
    const { service } = build({
      getAccess: jest.fn().mockResolvedValue('view'),
      getDraft,
    });
    const result = await service.insight(userId, projectId, null, 'vi');
    expect(getDraft).toHaveBeenCalledWith(projectId, userId);
    expect(result.chords).toEqual([{ bar: 1, chord: 'C' }]);
  });

  it('does not swallow other draft errors', async () => {
    const { service } = build({
      getAccess: jest.fn().mockResolvedValue('view'),
      getDraft: jest.fn().mockRejectedValue(new Error('db down')),
    });
    await expect(
      service.insight(userId, projectId, null, 'vi'),
    ).rejects.toThrow('db down');
  });
});
