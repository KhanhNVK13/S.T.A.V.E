import 'reflect-metadata';
import { BadRequestException } from '@nestjs/common';
import type { DraftSnapshot } from '@stave/shared-types';
import { createSupabaseMock } from '../test-utils/supabase-mock';
import type { BranchesService } from '../branches/branches.service';
import type { MergeService } from '../merge/merge.service';
import type { ProjectAccessService } from '../project-access/project-access.service';
import type { PullRequestAnalysisService } from '../pull-requests/pull-request-analysis.service';
import type { PullRequestsService } from '../pull-requests/pull-requests.service';
import { AiRateLimiter } from './ai-rate-limiter';
import {
  buildConflictBarFacts,
  ConflictAdviceService,
} from './conflict-advice.service';
import type { GeminiClient } from './gemini-client';

const userId = '11111111-1111-4111-8111-111111111111';
const projectId = '22222222-2222-4222-8222-222222222222';
const srcBranchId = '33333333-3333-4333-8333-333333333333';
const tgtBranchId = '44444444-4444-4444-8444-444444444444';
const baseId = '55555555-5555-4555-8555-555555555555';
const srcHeadId = '66666666-6666-4666-8666-666666666666';
const tgtHeadId = '77777777-7777-4777-8777-777777777777';

const snap: DraftSnapshot = {
  schemaVersion: 3,
  meta: { tempo: 120, timeSignature: [4, 4], ppq: 480 },
  tracks: [
    {
      id: 't1',
      name: 'Lead Synth',
      order: 0,
      color: '#111',
      volume: 1,
      pan: 0,
      muted: false,
      solo: false,
      instrument: null,
    },
  ],
  notes: [],
};

describe('ConflictAdviceService', () => {
  it('computes bar-level deltas without sending raw note UUIDs', () => {
    const out = buildConflictBarFacts(
      {
        1: [
          {
            noteId: 'secret-uuid',
            type: 'MODIFIED_DIFFERENTLY',
            baseNote: {
              id: 'secret-uuid',
              trackId: 't1',
              pitch: 60,
              start: 0,
              duration: 480,
              velocity: 80,
            },
            targetNote: {
              id: 'secret-uuid',
              trackId: 't1',
              pitch: 60,
              start: 0,
              duration: 480,
              velocity: 90,
            },
            sourceNote: {
              id: 'secret-uuid',
              trackId: 't1',
              pitch: 64,
              start: 480,
              duration: 480,
              velocity: 110,
            },
          },
        ],
      },
      snap.tracks,
      480,
    );
    expect(out.barCount).toBe(1);
    expect(out.bars[0].items[0]).toMatchObject({
      track: 'Lead Synth',
      targetPitch: 'C4',
      sourcePitch: 'E4',
      pitchDelta: 4,
      startBeatsDelta: 1,
      velocityDelta: 20,
    });
    expect(JSON.stringify(out)).not.toContain('secret-uuid');
  });

  it('rejects requests missing both pullRequestId and branch pair', async () => {
    const mock = createSupabaseMock([], { tables: {} });
    const service = new ConflictAdviceService(
      mock.client,
      {} as BranchesService,
      {} as ProjectAccessService,
      {} as MergeService,
      {} as PullRequestsService,
      {} as PullRequestAnalysisService,
      { generateText: jest.fn() } as unknown as GeminiClient,
      new AiRateLimiter(),
    );
    await expect(service.advise(userId, {})).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  function makeBranchConflictService(
    reply = '- Bar 1: source raised pitch by 4 semitones.',
  ) {
    const mock = createSupabaseMock([], {
      tables: {
        branches: [
          {
            data: {
              id: srcBranchId,
              project_id: projectId,
              head_commit_id: srcHeadId,
            },
          },
          {
            data: {
              id: tgtBranchId,
              project_id: projectId,
              head_commit_id: tgtHeadId,
            },
          },
        ],
        commits: [
          { data: { snapshot: snap } },
          { data: { snapshot: snap } },
          { data: { snapshot: snap } },
        ],
      },
    });
    const generateText = jest.fn().mockResolvedValue(reply);
    const service = new ConflictAdviceService(
      mock.client,
      {
        findMergeBase: jest.fn().mockResolvedValue(baseId),
      } as unknown as BranchesService,
      {
        assertCanEdit: jest.fn().mockResolvedValue(undefined),
      } as unknown as ProjectAccessService,
      {
        previewMerge: jest.fn().mockReturnValue({
          conflictsCount: 1,
          conflictsByBar: {
            1: [
              {
                noteId: 'n1',
                type: 'MODIFIED_DIFFERENTLY',
                baseNote: {
                  id: 'n1',
                  trackId: 't1',
                  pitch: 60,
                  start: 0,
                  duration: 480,
                  velocity: 80,
                },
                targetNote: {
                  id: 'n1',
                  trackId: 't1',
                  pitch: 60,
                  start: 0,
                  duration: 480,
                  velocity: 80,
                },
                sourceNote: {
                  id: 'n1',
                  trackId: 't1',
                  pitch: 64,
                  start: 0,
                  duration: 480,
                  velocity: 80,
                },
              },
            ],
          },
        }),
      } as unknown as MergeService,
      {} as PullRequestsService,
      {} as PullRequestAnalysisService,
      { generateText } as unknown as GeminiClient,
      new AiRateLimiter(),
    );
    return { service, generateText };
  }

  it('loads branch conflicts and generates cached objective explanation', async () => {
    const { service, generateText } = makeBranchConflictService();
    const out = await service.advise(userId, {
      sourceBranchId: srcBranchId,
      targetBranchId: tgtBranchId,
      lang: 'en',
    });
    expect(out.conflictCount).toBe(1);
    expect(out.advice).toBe('- Bar 1: source raised pitch by 4 semitones.');
    expect(generateText.mock.calls[0][0] as string).toContain(
      'source minus target',
    );
  });

  it('specifies source-minus-target sign convention in Vietnamese prompt as well', async () => {
    const { service, generateText } = makeBranchConflictService(
      '- Ô nhịp 1: nhánh nguồn tăng cao độ 4 bán âm.',
    );
    await service.advise(userId, {
      sourceBranchId: srcBranchId,
      targetBranchId: tgtBranchId,
      lang: 'vi',
    });
    expect(generateText.mock.calls[0][0] as string).toContain(
      'source trừ target',
    );
  });
});
