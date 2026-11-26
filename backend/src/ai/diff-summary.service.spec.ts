import 'reflect-metadata';
import { BadRequestException } from '@nestjs/common';
import type { DraftNote, DraftSnapshot } from '@stave/shared-types';
import { DiffService } from '../commits/diff.service';
import type { CommitsService } from '../commits/commits.service';
import type { PullRequestAnalysisService } from '../pull-requests/pull-request-analysis.service';
import type { PullRequestsService } from '../pull-requests/pull-requests.service';
import { AiRateLimiter } from './ai-rate-limiter';
import {
  buildDiffStoryFacts,
  DiffSummaryService,
} from './diff-summary.service';
import type { GeminiClient } from './gemini-client';
import type { MergeRiskService } from './merge-risk.service';

const userId = '11111111-1111-4111-8111-111111111111';
const prId = '22222222-2222-4222-8222-222222222222';
const c1 = '33333333-3333-4333-8333-333333333333';
const c2 = '44444444-4444-4444-8444-444444444444';

function n(id: string, pitch: number, start: number): DraftNote {
  return { id, trackId: 't1', pitch, start, duration: 480, velocity: 90 };
}

const BASE: DraftSnapshot = {
  schemaVersion: 3,
  meta: { tempo: 120, timeSignature: [4, 4], ppq: 480 },
  tracks: [
    {
      id: 't1',
      name: 'Piano',
      order: 0,
      color: '#111',
      volume: 0.8,
      pan: 0,
      muted: false,
      solo: false,
      instrument: 'Acoustic Grand Piano',
    },
  ],
  notes: [n('n1', 60, 0), n('n2', 64, 480)],
};

const TARGET: DraftSnapshot = {
  ...BASE,
  meta: { tempo: 132, timeSignature: [4, 4], ppq: 480 },
  notes: [
    n('n1', 60, 0),
    n('n2', 64, 480),
    n('n3', 67, 1920),
    n('n4', 72, 1920),
  ],
};

describe('DiffSummaryService', () => {
  it('extracts objective hotspot bars and tempo/range facts without note UUIDs', () => {
    const diff = new DiffService().compareSnapshots(BASE, TARGET);
    const facts = buildDiffStoryFacts(BASE, TARGET, diff, ['Add bar 2 chord']);
    expect(facts.notesAdded).toBe(2);
    expect(facts.topHotspotBars[0]).toEqual({
      bar: 2,
      added: 2,
      removed: 0,
      modified: 0,
    });
    expect(facts.metaChanges).toEqual([{ field: 'tempo', from: 120, to: 132 }]);
    expect(facts.pitchRangeChange).toEqual({ from: 'C4-E4', to: 'C4-C5' });
    expect(JSON.stringify(facts)).not.toContain('n3');
  });

  it('summarizes a PR and caches repeated requests by branch heads', async () => {
    const loadForUser = jest.fn().mockResolvedValue({
      row: { id: prId, source_branch_id: 'b-src', target_branch_id: 'b-tgt' },
    });
    const analyze = jest.fn().mockResolvedValue({
      sourceBranch: { id: 'b-src', head_commit_id: c2 },
      targetBranch: { id: 'b-tgt', head_commit_id: c1 },
      baseSnapshot: BASE,
      sourceSnapshot: TARGET,
      summary: new DiffService().compareSnapshots(BASE, TARGET),
      newCommits: [{ id: c2, message: 'Add chorus' }],
      risk: { level: 'low', metrics: {} },
    });
    const generateText = jest.fn().mockResolvedValue('- Added bar 2 notes.');
    const service = new DiffSummaryService(
      { loadForUser } as unknown as PullRequestsService,
      { analyze } as unknown as PullRequestAnalysisService,
      { getCommitById: jest.fn() } as unknown as CommitsService,
      new DiffService(),
      { explainFromMetrics: jest.fn() } as unknown as MergeRiskService,
      { generateText } as unknown as GeminiClient,
      new AiRateLimiter(),
    );

    const first = await service.summarizePullRequest(userId, prId, 'en');
    const second = await service.summarizePullRequest(userId, prId, 'en');
    expect(first.summary).toBe('- Added bar 2 notes.');
    expect(second).toEqual(first);
    expect(generateText).toHaveBeenCalledTimes(1);
  });

  it('summarizes commit diff and supports release-notes style', async () => {
    const getCommitById = jest
      .fn()
      .mockResolvedValueOnce({ id: c1, snapshot: BASE })
      .mockResolvedValueOnce({ id: c2, snapshot: TARGET });
    const generateText = jest
      .fn()
      .mockResolvedValue('- Tempo updated to 132 BPM');
    const service = new DiffSummaryService(
      { loadForUser: jest.fn() } as unknown as PullRequestsService,
      { analyze: jest.fn() } as unknown as PullRequestAnalysisService,
      { getCommitById } as unknown as CommitsService,
      new DiffService(),
      { explainFromMetrics: jest.fn() } as unknown as MergeRiskService,
      { generateText } as unknown as GeminiClient,
      new AiRateLimiter(),
    );

    const out = await service.summarizeCommitDiff(
      userId,
      c1,
      c2,
      'en',
      'release-notes',
    );
    expect(out.style).toBe('release-notes');
    expect(out.summary).toBe('- Tempo updated to 132 BPM');
  });

  it('instructs Vietnamese summary and release-notes prompts to treat notes as MIDI notes, not memo notes', async () => {
    const getCommitById = jest
      .fn()
      .mockResolvedValue({ id: c1, snapshot: BASE })
      .mockResolvedValueOnce({ id: c1, snapshot: BASE })
      .mockResolvedValueOnce({ id: c2, snapshot: TARGET })
      .mockResolvedValueOnce({ id: c1, snapshot: BASE })
      .mockResolvedValueOnce({ id: c2, snapshot: TARGET });
    const generateText = jest.fn().mockResolvedValue('- Thêm 2 nốt nhạc.');
    const service = new DiffSummaryService(
      { loadForUser: jest.fn() } as unknown as PullRequestsService,
      { analyze: jest.fn() } as unknown as PullRequestAnalysisService,
      { getCommitById } as unknown as CommitsService,
      new DiffService(),
      { explainFromMetrics: jest.fn() } as unknown as MergeRiskService,
      { generateText } as unknown as GeminiClient,
      new AiRateLimiter(),
    );

    await service.summarizeCommitDiff(userId, c1, c2, 'vi', 'summary');
    await service.summarizeCommitDiff(userId, c1, c2, 'vi', 'release-notes');

    expect(generateText.mock.calls[0][0] as string).toContain('NỐT NHẠC MIDI');
    expect(generateText.mock.calls[1][0] as string).toContain('NỐT NHẠC MIDI');
  });

  it('throws 400 when PR branches were deleted', async () => {
    const service = new DiffSummaryService(
      {
        loadForUser: jest.fn().mockResolvedValue({
          row: { id: prId, source_branch_id: null, target_branch_id: 'b-tgt' },
        }),
      } as unknown as PullRequestsService,
      { analyze: jest.fn() } as unknown as PullRequestAnalysisService,
      { getCommitById: jest.fn() } as unknown as CommitsService,
      new DiffService(),
      { explainFromMetrics: jest.fn() } as unknown as MergeRiskService,
      { generateText: jest.fn() } as unknown as GeminiClient,
      new AiRateLimiter(),
    );
    await expect(
      service.summarizePullRequest(userId, prId),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
