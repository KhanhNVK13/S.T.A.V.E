import 'reflect-metadata';
import type { JamService } from '../jam/jam.service';
import { AiRateLimiter } from './ai-rate-limiter';
import type { GeminiClient } from './gemini-client';
import { JamRecapService } from './jam-recap.service';

const userId = '11111111-1111-4111-8111-111111111111';
const eventId = '22222222-2222-4222-8222-222222222222';

describe('JamRecapService', () => {
  it('returns null recap & stats when the Jam ended without contributions', async () => {
    const generateText = jest.fn();
    const service = new JamRecapService(
      {
        getJamResult: jest.fn().mockResolvedValue({
          eventId,
          name: 'Empty Jam',
          status: 'ended',
          hasContributions: false,
          snapshot: null,
          contributors: [],
        }),
      } as unknown as JamService,
      { generateText } as unknown as GeminiClient,
      new AiRateLimiter(),
    );

    await expect(service.recap(userId, eventId)).resolves.toEqual({
      recap: null,
      stats: null,
    });
    expect(generateText).not.toHaveBeenCalled();
  });

  it('builds factual Jam stats and caches Gemini recap per event & language', async () => {
    const getJamResult = jest.fn().mockResolvedValue({
      eventId,
      name: 'Night Session',
      status: 'ended',
      hasContributions: true,
      contributors: [
        {
          userId: 'u1',
          username: 'alice',
          displayName: 'Alice',
          avatarUrl: null,
          actionCount: 14,
        },
        {
          userId: 'u2',
          username: 'bob',
          displayName: 'Bob',
          avatarUrl: null,
          actionCount: 8,
        },
      ],
      snapshot: {
        schemaVersion: 3,
        meta: { tempo: 120, timeSignature: [4, 4], ppq: 480 },
        tracks: [
          {
            id: 't1',
            name: 'Piano',
            order: 0,
            color: '#111',
            volume: 1,
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
            duration: 480,
            velocity: 90,
          },
          {
            id: 'n2',
            trackId: 't1',
            pitch: 64,
            start: 480,
            duration: 480,
            velocity: 90,
          },
          {
            id: 'n3',
            trackId: 't1',
            pitch: 67,
            start: 960,
            duration: 480,
            velocity: 90,
          },
          {
            id: 'n4',
            trackId: 't1',
            pitch: 72,
            start: 1440,
            duration: 480,
            velocity: 90,
          },
        ],
      },
    });
    const generateText = jest
      .fn()
      .mockResolvedValue(
        'Night Session brought 2 contributors together across 22 edits.',
      );
    const service = new JamRecapService(
      { getJamResult } as unknown as JamService,
      { generateText } as unknown as GeminiClient,
      new AiRateLimiter(),
    );

    const first = await service.recap(userId, eventId, 'en');
    const second = await service.recap(userId, eventId, 'en');
    expect(first.stats?.contributorCount).toBe(2);
    expect(first.stats?.totalActions).toBe(22);
    expect(first.recap).toBe(
      'Night Session brought 2 contributors together across 22 edits.',
    );
    expect(second).toEqual(first);
    expect(generateText).toHaveBeenCalledTimes(1);
  });
});
