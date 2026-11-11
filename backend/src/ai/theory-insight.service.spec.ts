import 'reflect-metadata';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { DraftNote, DraftSnapshot } from '@stave/shared-types';
import { createSupabaseMock } from '../test-utils/supabase-mock';
import { TheoryInsightService } from './theory-insight.service';
import { GeminiClient } from './gemini-client';
import { AiRateLimiter } from './ai-rate-limiter';
import { ProjectAccessService } from '../project-access/project-access.service';
import { DraftsService } from '../drafts/drafts.service';

const userId = '11111111-1111-4111-8111-111111111111';
const projectId = '22222222-2222-4222-8222-222222222222';
const commitId = '33333333-3333-4333-8333-333333333333';
const branchId = '44444444-4444-4444-8444-444444444444';

function n(id: string, pitch: number): DraftNote {
  return {
    id,
    trackId: 't1',
    pitch,
    start: 0,
    duration: 1920,
    velocity: 90,
  };
}

const cMajorChord: DraftSnapshot = {
  schemaVersion: 3,
  meta: { tempo: 120, timeSignature: [4, 4], ppq: 480 },
  tracks: [],
  notes: [n('a', 60), n('b', 64), n('c', 67)],
};

function makeService(options: {
  commit?: { snapshot: DraftSnapshot; branch_id: string } | null;
  branch?: { id: string } | null;
  denyRead?: boolean;
  generateText?: jest.Mock;
  rateLimited?: boolean;
  draft?: DraftSnapshot;
  accessLevel?: 'owner' | 'edit' | 'view' | null;
  defaultBranchHead?: string | null;
}) {
  const tables: Record<string, Array<{ data: unknown }>> = {
    commits: [
      {
        data:
          options.commit === undefined
            ? { snapshot: cMajorChord, branch_id: branchId }
            : options.commit,
      },
    ],
    branches: [
      {
        data:
          options.defaultBranchHead !== undefined
            ? { head_commit_id: options.defaultBranchHead }
            : options.branch === undefined
              ? { id: branchId }
              : options.branch,
      },
    ],
  };
  if (options.defaultBranchHead !== undefined) {
    tables.branches.push({ data: { id: branchId } });
    tables.commits = [{ data: { snapshot: cMajorChord, branch_id: branchId } }];
  }
  const mock = createSupabaseMock([], { tables });

  const assertCanRead = options.denyRead
    ? jest.fn().mockRejectedValue(new ForbiddenException('no'))
    : jest.fn().mockResolvedValue(undefined);
  const getAccess = jest.fn().mockResolvedValue(options.accessLevel ?? null);
  const access = {
    assertCanRead,
    getAccess,
  } as unknown as ProjectAccessService;
  const getDraft = jest.fn().mockResolvedValue(options.draft ?? cMajorChord);
  const drafts = { getDraft } as unknown as DraftsService;

  const generateText =
    options.generateText ??
    jest.fn().mockResolvedValue('Đây là hợp âm Đô trưởng.');
  const gemini = { generateText } as unknown as GeminiClient;
  const rateLimiter = {
    tryConsume: jest.fn().mockReturnValue(!options.rateLimited),
  } as unknown as AiRateLimiter;

  const service = new TheoryInsightService(
    mock.client,
    access,
    drafts,
    gemini,
    rateLimiter,
  );
  return { service, assertCanRead, getDraft, generateText };
}

describe('TheoryInsightService', () => {
  it('analyses a commit and attaches the Gemini explanation', async () => {
    const { service, generateText } = makeService({});
    const result = await service.insight(userId, projectId, commitId, 'vi');
    expect(result.chords).toEqual([{ bar: 1, chord: 'C' }]);
    expect(result.explanation).toBe('Đây là hợp âm Đô trưởng.');
    const prompt = generateText.mock.calls[0][0] as string;
    expect(prompt).toContain('"chord":"C"');
  });

  it('rejects a stranger on a private project and never touches data', async () => {
    const { service, generateText } = makeService({ denyRead: true });
    await expect(
      service.insight(userId, projectId, commitId),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(generateText).not.toHaveBeenCalled();
  });

  it('returns 404 when the commit belongs to another project', async () => {
    const { service } = makeService({ branch: null });
    await expect(
      service.insight(userId, projectId, commitId),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns 404 when the commit does not exist', async () => {
    const { service } = makeService({ commit: null });
    await expect(
      service.insight(userId, projectId, commitId),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('still returns the analysis with explanation null when Gemini throws', async () => {
    const { service } = makeService({
      generateText: jest.fn().mockRejectedValue(new Error('boom')),
    });
    const result = await service.insight(userId, projectId, commitId);
    expect(result.explanation).toBeNull();
    expect(result.chords).toHaveLength(1);
  });

  it('returns explanation null when Gemini has no key (null text)', async () => {
    const { service } = makeService({
      generateText: jest.fn().mockResolvedValue(null),
    });
    expect(
      (await service.insight(userId, projectId, commitId)).explanation,
    ).toBeNull();
  });

  it('skips Gemini when the rate limit is reached', async () => {
    const { service, generateText } = makeService({ rateLimited: true });
    const result = await service.insight(userId, projectId, commitId);
    expect(result.explanation).toBeNull();
    expect(generateText).not.toHaveBeenCalled();
  });

  it('does not call Gemini when there is nothing to explain', async () => {
    const { service, generateText } = makeService({
      commit: {
        snapshot: { ...cMajorChord, notes: [] },
        branch_id: branchId,
      },
    });
    const result = await service.insight(userId, projectId, commitId);
    expect(result).toEqual({
      tonality: null,
      chords: [],
      truncated: false,
      explanation: null,
    });
    expect(generateText).not.toHaveBeenCalled();
  });

  it('never sends track names or the project id to Gemini', async () => {
    const snapshot: DraftSnapshot = {
      ...cMajorChord,
      tracks: [
        {
          id: 't1',
          name: 'Secret Lead Track',
          order: 0,
          color: '#000',
          muted: false,
          solo: false,
          volume: 1,
          pan: 0,
          instrument: null,
        },
      ],
    };
    const { service, generateText } = makeService({
      commit: { snapshot, branch_id: branchId },
    });
    await service.insight(userId, projectId, commitId);
    const prompt = generateText.mock.calls[0][0] as string;
    expect(prompt).not.toContain('Secret Lead Track');
    expect(prompt).not.toContain(projectId);
  });

  it('uses the caller draft when no commit is given and the caller has access', async () => {
    const { service, getDraft } = makeService({ accessLevel: 'owner' });
    const result = await service.insight(userId, projectId, null);
    expect(getDraft).toHaveBeenCalledWith(projectId, userId);
    expect(result.chords).toEqual([{ bar: 1, chord: 'C' }]);
  });

  it('falls back to the default branch head for a public-project reader', async () => {
    const { service, getDraft } = makeService({
      accessLevel: null,
      defaultBranchHead: commitId,
    });
    const result = await service.insight(userId, projectId, null);
    expect(getDraft).not.toHaveBeenCalled();
    expect(result.chords).toEqual([{ bar: 1, chord: 'C' }]);
  });

  it('returns an empty analysis for a public project whose default branch has no commit', async () => {
    const { service } = makeService({
      accessLevel: null,
      defaultBranchHead: null,
    });
    const result = await service.insight(userId, projectId, null);
    expect(result).toEqual({
      tonality: null,
      chords: [],
      truncated: false,
      explanation: null,
    });
  });
});
