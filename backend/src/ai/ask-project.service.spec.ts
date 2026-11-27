import 'reflect-metadata';
import { ForbiddenException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import type { DraftSnapshot } from '@stave/shared-types';
import { SubscriptionsService } from '../billing/subscriptions.service';
import { DiffService } from '../commits/diff.service';
import { ProjectAccessService } from '../project-access/project-access.service';
import {
  createSupabaseMock,
  type QueryResult,
} from '../test-utils/supabase-mock';
import { AiRateLimiter } from './ai-rate-limiter';
import { AskProjectController } from './ask-project.controller';
import { ASK_STAVE_TOOL_NAMES, AskProjectService } from './ask-project.service';
import { AskProjectDto } from './dto/ask-project.dto';
import { GeminiClient, type GenerateWithToolsParams } from './gemini-client';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const PROJECT_ID = '22222222-2222-4222-8222-222222222222';
const MAIN_BRANCH_ID = '33333333-3333-4333-8333-333333333333';
const ALT_BRANCH_ID = '44444444-4444-4444-8444-444444444444';
const MAIN_HEAD_ID = '55555555-5555-4555-8555-555555555555';
const ALT_HEAD_ID = '66666666-6666-4666-8666-666666666666';
const TRACK_PIANO_ID = '77777777-7777-4777-8777-777777777777';
const TRACK_BASS_ID = '88888888-8888-4888-8888-888888888888';

const targetSnapshot: DraftSnapshot = {
  schemaVersion: 3,
  meta: { tempo: 120, timeSignature: [4, 4], ppq: 480 },
  tracks: [
    {
      id: TRACK_PIANO_ID,
      name: 'Grand Piano',
      order: 0,
      color: '#fff',
      muted: false,
      solo: false,
      volume: 0.8,
      pan: 0,
      instrument: 'Acoustic Grand Piano',
    },
  ],
  notes: [
    {
      id: 'n1',
      trackId: TRACK_PIANO_ID,
      pitch: 60,
      start: 0,
      duration: 1920,
      velocity: 90,
    },
    {
      id: 'n2',
      trackId: TRACK_PIANO_ID,
      pitch: 64,
      start: 0,
      duration: 1920,
      velocity: 90,
    },
    {
      id: 'n3',
      trackId: TRACK_PIANO_ID,
      pitch: 67,
      start: 0,
      duration: 1920,
      velocity: 90,
    },
    {
      id: 'n4',
      trackId: TRACK_PIANO_ID,
      pitch: 67,
      start: 1920,
      duration: 1920,
      velocity: 90,
    },
    {
      id: 'n5',
      trackId: TRACK_PIANO_ID,
      pitch: 71,
      start: 1920,
      duration: 1920,
      velocity: 90,
    },
    {
      id: 'n6',
      trackId: TRACK_PIANO_ID,
      pitch: 74,
      start: 1920,
      duration: 1920,
      velocity: 90,
    },
    {
      id: 'n7',
      trackId: TRACK_PIANO_ID,
      pitch: 60,
      start: 3840,
      duration: 1920,
      velocity: 90,
    },
    {
      id: 'n8',
      trackId: TRACK_PIANO_ID,
      pitch: 64,
      start: 3840,
      duration: 1920,
      velocity: 90,
    },
    {
      id: 'n9',
      trackId: TRACK_PIANO_ID,
      pitch: 67,
      start: 3840,
      duration: 1920,
      velocity: 90,
    },
  ],
};

const sourceSnapshot: DraftSnapshot = {
  schemaVersion: 3,
  meta: { tempo: 128, timeSignature: [4, 4], ppq: 480 },
  tracks: [
    ...targetSnapshot.tracks,
    {
      id: TRACK_BASS_ID,
      name: 'Synth Bass',
      order: 1,
      color: '#0ff',
      muted: false,
      solo: false,
      volume: 0.8,
      pan: 0,
      instrument: 'Synth Bass 1',
    },
  ],
  notes: [
    ...targetSnapshot.notes.slice(0, 8),
    {
      id: 'n9',
      trackId: TRACK_PIANO_ID,
      pitch: 67,
      start: 3840,
      duration: 1920,
      velocity: 110,
    },
    {
      id: 'n10',
      trackId: TRACK_PIANO_ID,
      pitch: 72,
      start: 5760,
      duration: 960,
      velocity: 95,
    },
    {
      id: 'n11',
      trackId: TRACK_BASS_ID,
      pitch: 36,
      start: 5760,
      duration: 960,
      velocity: 100,
    },
  ],
};

function makeService(
  options: {
    tables?: Record<string, QueryResult[]>;
    denyRead?: boolean;
    hasPaidAccess?: boolean;
    accessLevel?: 'owner' | 'edit' | 'view' | null;
    rateLimited?: boolean;
    generateWithTools?: jest.Mock;
  } = {},
) {
  const mock = createSupabaseMock([], { tables: options.tables ?? {} });
  const assertCanRead = options.denyRead
    ? jest
        .fn()
        .mockRejectedValue(new ForbiddenException('You do not have access'))
    : jest.fn().mockResolvedValue(undefined);
  const getAccess = jest
    .fn()
    .mockResolvedValue(
      options.accessLevel === undefined ? 'owner' : options.accessLevel,
    );
  const access = {
    assertCanRead,
    getAccess,
  } as unknown as ProjectAccessService;

  const getEffective = jest.fn().mockResolvedValue({
    hasPaidAccess: options.hasPaidAccess ?? true,
  });
  const subscriptions = {
    getEffective,
  } as unknown as SubscriptionsService;

  const generateWithTools =
    options.generateWithTools ??
    jest.fn().mockResolvedValue({ text: 'Grounded answer.', toolsUsed: [] });
  const gemini = { generateWithTools } as unknown as GeminiClient;

  const tryConsume = jest.fn().mockReturnValue(!options.rateLimited);
  const rateLimiter = { tryConsume } as unknown as AiRateLimiter;

  const service = new AskProjectService(
    mock.client,
    access,
    subscriptions,
    new DiffService(),
    gemini,
    rateLimiter,
  );

  return {
    service,
    mock,
    assertCanRead,
    getAccess,
    getEffective,
    generateWithTools,
    tryConsume,
  };
}

describe('AskProjectService', () => {
  it('enforces project read access before subscription or AI', async () => {
    const { service, getEffective, generateWithTools } = makeService({
      denyRead: true,
    });
    await expect(
      service.ask(USER_ID, PROJECT_ID, 'List branches', 'en'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(getEffective).not.toHaveBeenCalled();
    expect(generateWithTools).not.toHaveBeenCalled();
  });

  it('rejects free users with ForbiddenException("Paid access required")', async () => {
    const { service, tryConsume, generateWithTools } = makeService({
      hasPaidAccess: false,
    });
    await expect(
      service.ask(USER_ID, PROJECT_ID, 'List branches', 'en'),
    ).rejects.toThrow(new ForbiddenException('Paid access required'));
    expect(tryConsume).not.toHaveBeenCalled();
    expect(generateWithTools).not.toHaveBeenCalled();
  });

  it('returns rateLimited: true with null answer when quota is exhausted', async () => {
    const { service, tryConsume, generateWithTools } = makeService({
      rateLimited: true,
    });
    const result = await service.ask(
      USER_ID,
      PROJECT_ID,
      'List branches',
      'vi',
    );
    expect(tryConsume).toHaveBeenCalledWith(USER_ID, {
      limit: 10,
      windowMs: 60_000,
    });
    expect(result).toEqual({
      answer: null,
      toolsUsed: [],
      rateLimited: true,
    });
    expect(generateWithTools).not.toHaveBeenCalled();
  });

  it('executes list_branches and get_recent_commits scoped to verified projectId without UUIDs', async () => {
    const branchesData = [
      {
        id: MAIN_BRANCH_ID,
        name: 'main',
        is_default: true,
        head_commit_id: MAIN_HEAD_ID,
        created_at: '2026-11-20T00:00:00Z',
      },
      {
        id: ALT_BRANCH_ID,
        name: 'chorus-v2',
        is_default: false,
        head_commit_id: ALT_HEAD_ID,
        created_at: '2026-11-21T00:00:00Z',
      },
    ];

    const toolOutputs: Record<string, unknown> = {};
    const generateWithTools = jest.fn(
      async (params: GenerateWithToolsParams) => {
        expect(params.declarations.map((d) => d.name)).toEqual([
          ...ASK_STAVE_TOOL_NAMES,
        ]);
        toolOutputs.branches = await params.executeTool('list_branches', {
          projectId: '99999999-9999-4999-8999-999999999999',
        });
        toolOutputs.commits = await params.executeTool('get_recent_commits', {
          branchName: 'chorus-v2',
          limit: 50,
        });
        return {
          text: `Main (${MAIN_BRANCH_ID}) has 1 commit and chorus-v2 has 1 merge commit. UC-70`,
          toolsUsed: ['list_branches', 'get_recent_commits'],
        };
      },
    );

    const { service, mock } = makeService({
      generateWithTools,
      tables: {
        branches: [{ data: branchesData }, { data: branchesData }],
        commits: [
          {
            data: [
              {
                id: MAIN_HEAD_ID,
                branch_id: MAIN_BRANCH_ID,
                message: 'Initial chord sketch',
                created_at: '2026-11-20T10:00:00Z',
              },
              {
                id: ALT_HEAD_ID,
                branch_id: ALT_BRANCH_ID,
                message: `Merge ${MAIN_BRANCH_ID} chorus`,
                created_at: '2026-11-22T10:00:00Z',
              },
            ],
          },
          {
            data: [
              {
                id: ALT_HEAD_ID,
                branch_id: ALT_BRANCH_ID,
                author_id: USER_ID,
                message: 'Merge chorus arrangement',
                created_at: '2026-11-22T10:00:00Z',
                merged_from_commit_id: MAIN_HEAD_ID,
                merged_from_branch_id: MAIN_BRANCH_ID,
              },
            ],
          },
        ],
        users: [
          {
            data: [{ id: USER_ID, username: 'khanh', display_name: 'Khanh' }],
          },
        ],
      },
    });

    const res = await service.ask(
      USER_ID,
      PROJECT_ID,
      'What branches exist?',
      'en',
    );

    expect(mock.builders.branches.eq).toHaveBeenCalledWith(
      'project_id',
      PROJECT_ID,
    );
    expect(mock.builders.branches.eq).not.toHaveBeenCalledWith(
      'project_id',
      '99999999-9999-4999-8999-999999999999',
    );
    expect(mock.builders.commits.limit).toHaveBeenCalledWith(10);

    expect(toolOutputs.branches).toEqual({
      branches: [
        {
          name: 'main',
          isDefault: true,
          commitCount: 1,
          latestCommitMessage: 'Initial chord sketch',
          latestCommitAt: '2026-11-20T10:00:00Z',
        },
        {
          name: 'chorus-v2',
          isDefault: false,
          commitCount: 1,
          latestCommitMessage: 'Merge chorus',
          latestCommitAt: '2026-11-22T10:00:00Z',
        },
      ],
    });
    expect(JSON.stringify(toolOutputs.branches)).not.toContain(MAIN_BRANCH_ID);

    expect(toolOutputs.commits).toEqual({
      branchName: 'chorus-v2',
      commits: [
        {
          message: 'Merge chorus arrangement',
          createdAt: '2026-11-22T10:00:00Z',
          authorName: 'Khanh',
          isMerge: true,
        },
      ],
    });

    expect(res).toEqual({
      answer: 'Main has 1 commit and chorus-v2 has 1 merge commit.',
      toolsUsed: ['list_branches', 'get_recent_commits'],
      rateLimited: false,
    });
    expect(res.answer).not.toContain(MAIN_BRANCH_ID);
    expect(res.answer).not.toMatch(/\b(?:UC|BR)-\d+\b/i);
  });

  it('compares branches via DiffService.compareSnapshots and analyzes theory range', async () => {
    const branchesData = [
      {
        id: MAIN_BRANCH_ID,
        name: 'main',
        is_default: true,
        head_commit_id: MAIN_HEAD_ID,
      },
      {
        id: ALT_BRANCH_ID,
        name: 'chorus-v2',
        is_default: false,
        head_commit_id: ALT_HEAD_ID,
      },
    ];

    let compareOut: Record<string, unknown> = {};
    let theoryOut: Record<string, unknown> = {};

    const generateWithTools = jest.fn(
      async (params: GenerateWithToolsParams) => {
        compareOut = await params.executeTool('compare_branches', {
          sourceBranchName: 'chorus-v2',
          targetBranchName: 'main',
        });
        theoryOut = await params.executeTool('get_theory_range', {
          fromBar: 1,
          toBar: 2,
        });
        return {
          text: 'Tempo increased from 120 to 128; bars 1–2 show C and G.',
          toolsUsed: ['compare_branches', 'get_theory_range'],
        };
      },
    );

    const { service } = makeService({
      generateWithTools,
      tables: {
        branches: [{ data: branchesData }, { data: branchesData }],
        commits: [
          {
            data: [
              { id: MAIN_HEAD_ID, snapshot: targetSnapshot },
              { id: ALT_HEAD_ID, snapshot: sourceSnapshot },
            ],
          },
          {
            data: { snapshot: targetSnapshot },
          },
        ],
      },
    });

    const result = await service.ask(
      USER_ID,
      PROJECT_ID,
      'Compare main and chorus-v2 and check chords in bars 1-2',
      'en',
    );

    expect(compareOut).toMatchObject({
      areIdentical: false,
      sourceBranch: 'chorus-v2',
      targetBranch: 'main',
      notes: { added: 1, removed: 0, modified: 1, totalChanges: 2 },
      tracks: { added: 1, removed: 0, modified: 0 },
      tracksAdded: [
        { name: 'Synth Bass', instrument: 'Synth Bass 1', noteCount: 1 },
      ],
      barRange: { fromBar: 3, toBar: 4 },
      tempoChange: { from: 120, to: 128 },
      timeSignatureChange: null,
    });
    expect(compareOut.affectedTrackNames).toEqual(
      expect.arrayContaining(['Grand Piano', 'Synth Bass']),
    );
    expect(JSON.stringify(compareOut)).not.toContain(TRACK_PIANO_ID);

    expect(theoryOut).toMatchObject({
      branchName: 'main',
      fromBar: 1,
      toBar: 2,
      tempo: 120,
      timeSignature: [4, 4],
      totalBars: 3,
      totalNotes: 9,
      midiIntegrity: { duplicateCount: 0, overlapCount: 0 },
    });
    expect(
      (theoryOut.chords as Array<{ bar: number }>).map((c) => c.bar),
    ).toEqual([1, 2]);
    expect(result.toolsUsed).toEqual(['compare_branches', 'get_theory_range']);
  });

  it('blocks summarize_comments for public non-collaborators without querying comments', async () => {
    let commentOut: Record<string, unknown> = {};
    const generateWithTools = jest.fn(
      async (params: GenerateWithToolsParams) => {
        commentOut = await params.executeTool('summarize_comments', {});
        return {
          text: 'Comments are only visible to project collaborators.',
          toolsUsed: ['summarize_comments'],
        };
      },
    );

    const { service, mock } = makeService({
      accessLevel: null,
      generateWithTools,
      tables: {
        comments: [
          {
            data: [
              {
                body: 'secret',
                bar: 1,
                track_id: null,
                created_at: '2026-11-22T00:00:00Z',
              },
            ],
          },
        ],
      },
    });

    const res = await service.ask(
      USER_ID,
      PROJECT_ID,
      'Summarize comments',
      'en',
    );
    expect(commentOut).toEqual({
      available: false,
      reason: 'collaborator_only',
    });
    expect(mock.builders.comments.select).not.toHaveBeenCalled();
    expect(res.answer).toBe(
      'Comments are only visible to project collaborators.',
    );
  });

  it('summarizes comments with anonymized excerpts and strips emails/UUIDs for collaborators', async () => {
    let commentOut: Record<string, unknown> = {};
    const generateWithTools = jest.fn(
      async (params: GenerateWithToolsParams) => {
        commentOut = await params.executeTool('summarize_comments', {});
        return {
          text: 'Bar 4 has 2 comments on Grand Piano.',
          toolsUsed: ['summarize_comments'],
        };
      },
    );

    const longBody = `${'A'.repeat(130)} end`;
    const { service } = makeService({
      accessLevel: 'view',
      generateWithTools,
      tables: {
        comments: [
          {
            data: [
              {
                body: `Check with alice@example.com about ${TRACK_PIANO_ID} in bar 4`,
                track_id: TRACK_PIANO_ID,
                bar: 4,
                anchor_ref: null,
                created_at: '2026-11-23T12:00:00Z',
              },
              {
                body: longBody,
                track_id: null,
                bar: 4,
                anchor_ref: null,
                created_at: '2026-11-23T11:00:00Z',
              },
              {
                body: 'Tighten snare fill',
                track_id: null,
                bar: 8,
                anchor_ref: null,
                created_at: '2026-11-23T10:00:00Z',
              },
            ],
          },
        ],
        branches: [
          {
            data: [
              {
                id: MAIN_BRANCH_ID,
                name: 'main',
                is_default: true,
                head_commit_id: MAIN_HEAD_ID,
              },
            ],
          },
        ],
        commits: [{ data: { snapshot: targetSnapshot } }],
      },
    });

    await service.ask(USER_ID, PROJECT_ID, 'Most commented bars', 'en');

    expect(commentOut).toEqual({
      available: true,
      totalCount: 3,
      topBars: [
        { bar: 4, count: 2 },
        { bar: 8, count: 1 },
      ],
      trackNames: ['Grand Piano'],
      recentExcerpts: [
        {
          bar: 4,
          trackName: 'Grand Piano',
          createdAt: '2026-11-23T12:00:00Z',
          excerpt: 'Check with [redacted] about in bar 4',
        },
        {
          bar: 4,
          trackName: null,
          createdAt: '2026-11-23T11:00:00Z',
          excerpt: `${'A'.repeat(119)}…`,
        },
        {
          bar: 8,
          trackName: null,
          createdAt: '2026-11-23T10:00:00Z',
          excerpt: 'Tighten snare fill',
        },
      ],
    });
    expect(JSON.stringify(commentOut)).not.toContain('alice@example.com');
    expect(JSON.stringify(commentOut)).not.toContain(TRACK_PIANO_ID);
  });

  it('returns null answer cleanly when Gemini fails or returns null', async () => {
    const { service } = makeService({
      generateWithTools: jest.fn().mockRejectedValue(new Error('network')),
    });
    await expect(
      service.ask(USER_ID, PROJECT_ID, 'What key is this?', 'vi'),
    ).resolves.toEqual({
      answer: null,
      toolsUsed: [],
      rateLimited: false,
    });
  });

  it('validates AskProjectDto trimming/bounds and delegates in AskProjectController', async () => {
    const valid = plainToInstance(AskProjectDto, {
      projectId: PROJECT_ID,
      question: '   Compare branches   ',
      lang: 'en',
    });
    expect(valid.question).toBe('Compare branches');
    await expect(validate(valid)).resolves.toHaveLength(0);

    const tooShort = plainToInstance(AskProjectDto, {
      projectId: PROJECT_ID,
      question: '  a  ',
    });
    await expect(validate(tooShort)).resolves.not.toHaveLength(0);

    const tooLong = plainToInstance(AskProjectDto, {
      projectId: PROJECT_ID,
      question: 'x'.repeat(401),
    });
    await expect(validate(tooLong)).resolves.not.toHaveLength(0);

    const badUuid = plainToInstance(AskProjectDto, {
      projectId: 'not-a-uuid',
      question: 'What key is this?',
    });
    await expect(validate(badUuid)).resolves.not.toHaveLength(0);

    const ask = jest.fn().mockResolvedValue({
      answer: 'C major',
      toolsUsed: ['get_theory_range'],
      rateLimited: false,
    });
    const controller = new AskProjectController({
      ask,
    } as unknown as AskProjectService);
    await expect(controller.ask(valid, USER_ID)).resolves.toEqual({
      answer: 'C major',
      toolsUsed: ['get_theory_range'],
      rateLimited: false,
    });
    expect(ask).toHaveBeenCalledWith(
      USER_ID,
      PROJECT_ID,
      'Compare branches',
      'en',
    );
  });
});
