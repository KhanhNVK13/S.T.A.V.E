import 'reflect-metadata';
import { ForbiddenException } from '@nestjs/common';
import type { DraftSnapshot } from '@stave/shared-types';
import { createSupabaseMock } from '../test-utils/supabase-mock';
import type { DraftsService } from '../drafts/drafts.service';
import type { ProjectAccessService } from '../project-access/project-access.service';
import { AiRateLimiter } from './ai-rate-limiter';
import type { GeminiClient } from './gemini-client';
import {
  parsePublishAiJson,
  PublishSuggestService,
  sanitizeSuggestedTags,
} from './publish-suggest.service';

const userId = '11111111-1111-4111-8111-111111111111';
const projectId = '22222222-2222-4222-8222-222222222222';

const SNAPSHOT: DraftSnapshot = {
  schemaVersion: 3,
  meta: { tempo: 110, timeSignature: [4, 4], ppq: 480 },
  tracks: [
    {
      id: 't1',
      name: 'Grand Piano',
      order: 0,
      color: '#111',
      volume: 0.9,
      pan: 0,
      muted: false,
      solo: false,
      instrument: 'Acoustic Grand Piano',
    },
  ],
  notes: [
    {
      id: 'n1',
      trackId: 't1',
      pitch: 60,
      start: 0,
      duration: 960,
      velocity: 90,
    },
    {
      id: 'n2',
      trackId: 't1',
      pitch: 64,
      start: 960,
      duration: 960,
      velocity: 90,
    },
    {
      id: 'n3',
      trackId: 't1',
      pitch: 67,
      start: 1920,
      duration: 960,
      velocity: 90,
    },
    {
      id: 'n4',
      trackId: 't1',
      pitch: 60,
      start: 2880,
      duration: 960,
      velocity: 90,
    },
  ],
};

describe('PublishSuggestService', () => {
  it('sanitizes tags to match project tag constraints', () => {
    expect(
      sanitizeSuggestedTags([
        '#Piano',
        'Lo-Fi ',
        'bad@tag!',
        'PIANO',
        '110bpm',
        'extra-one',
        'extra-two',
      ]),
    ).toEqual(['piano', 'lo-fi', '110bpm', 'extra-one', 'extra-two']);
  });

  it('parses fenced JSON responses from Gemini', () => {
    const parsed = parsePublishAiJson(
      '```json\n{"description": "Piano piece at 110 BPM.", "tags": ["piano", "110bpm"]}\n```',
    );
    expect(parsed).toEqual({
      description: 'Piano piece at 110 BPM.',
      tags: ['piano', '110bpm'],
    });
  });

  it('requires project ownership before suggesting metadata', async () => {
    const mock = createSupabaseMock([], { tables: {} });
    const service = new PublishSuggestService(
      mock.client,
      {
        assertOwner: jest
          .fn()
          .mockRejectedValue(new ForbiddenException('nope')),
      } as unknown as ProjectAccessService,
      {} as DraftsService,
      { generateText: jest.fn() } as unknown as GeminiClient,
      new AiRateLimiter(),
    );
    await expect(service.suggest(userId, projectId)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('returns parsed objective suggestions and aiAvailable=true when Gemini succeeds', async () => {
    const mock = createSupabaseMock([], {
      tables: {
        projects: [
          { data: { id: projectId, name: 'Sketch 1', genre: 'Classical' } },
        ],
        branches: [{ data: { head_commit_id: 'c1' } }],
        commits: [{ data: { snapshot: SNAPSHOT } }],
      },
    });
    const service = new PublishSuggestService(
      mock.client,
      {
        assertOwner: jest.fn().mockResolvedValue(undefined),
      } as unknown as ProjectAccessService,
      {} as DraftsService,
      {
        generateText: jest.fn().mockResolvedValue(
          JSON.stringify({
            description: 'Piano piece in 4/4 at 110 BPM.',
            tags: ['piano', 'classical', '110bpm'],
          }),
        ),
      } as unknown as GeminiClient,
      new AiRateLimiter(),
    );

    const out = await service.suggest(userId, projectId, 'en');
    expect(out.aiAvailable).toBe(true);
    expect(out.description).toBe('Piano piece in 4/4 at 110 BPM.');
    expect(out.tags).toEqual(['piano', 'classical', '110bpm']);
    expect(out.facts.instruments).toEqual(['Acoustic Grand Piano']);
  });
});
