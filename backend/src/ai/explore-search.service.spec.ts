import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AiRateLimiter } from './ai-rate-limiter';
import { ExploreParseDto } from './dto/explore-parse.dto';
import {
  ExploreSearchService,
  parseExploreAiJson,
  parseExploreQueryRuleBased,
} from './explore-search.service';
import type { GeminiClient } from './gemini-client';

const USER_ID = '11111111-1111-4111-8111-111111111111';

describe('parseExploreQueryRuleBased', () => {
  it('parses Vietnamese natural-language query with BPM bound, mood hint, instrument, and genre', () => {
    const res = parseExploreQueryRuleBased(
      'nhạc jazz piano buồn dưới 85 BPM',
      'vi',
    );
    expect(res.source).toBe('rule');
    expect(res.instruments).toEqual(['Acoustic Grand Piano']);
    expect(res.genre).toBe('Jazz');
    expect(res.tempoMin).toBeNull();
    expect(res.tempoMax).toBe(85);
    expect(res.mode).toBe('minor');
    expect(res.search).toBeNull();
    expect(res.explanation).toContain('85 BPM');
  });

  it('parses English BPM ranges, lower bounds, and multiple instruments', () => {
    const rangeRes = parseExploreQueryRuleBased(
      '80-110 bpm Lo-Fi with electric piano and violin',
      'en',
    );
    expect(rangeRes.tempoMin).toBe(80);
    expect(rangeRes.tempoMax).toBe(110);
    expect(rangeRes.genre).toBe('Lo-Fi');
    expect(rangeRes.instruments).toHaveLength(2);
    expect(rangeRes.instruments).toEqual(
      expect.arrayContaining(['Electric Piano 1', 'Violin']),
    );
    expect(rangeRes.search).toBeNull();

    const lowerRes = parseExploreQueryRuleBased(
      'major > 120 bpm acoustic guitar',
      'en',
    );
    expect(lowerRes.tempoMin).toBe(120);
    expect(lowerRes.mode).toBe('major');
    expect(lowerRes.instruments).toEqual(['Acoustic Guitar (nylon)']);
  });

  it('maps slow and fast hints to default tempo bounds and keeps remaining title keywords', () => {
    const slowRes = parseExploreQueryRuleBased('moonlight slow cello', 'en');
    expect(slowRes.tempoMax).toBe(90);
    expect(slowRes.instruments).toEqual(['Cello']);
    expect(slowRes.search).toBe('moonlight');

    const fastRes = parseExploreQueryRuleBased('nhạc rock nhanh vui', 'vi');
    expect(fastRes.tempoMin).toBe(125);
    expect(fastRes.mode).toBe('major');
    expect(fastRes.genre).toBe('Rock');
    expect(fastRes.search).toBeNull();
  });

  it('preserves plain keyword queries when no musical filters exist', () => {
    const res = parseExploreQueryRuleBased('starlight nocturne', 'en');
    expect(res.instruments).toEqual([]);
    expect(res.genre).toBeNull();
    expect(res.tempoMin).toBeNull();
    expect(res.tempoMax).toBeNull();
    expect(res.mode).toBeNull();
    expect(res.search).toBe('starlight nocturne');
  });
});

describe('parseExploreAiJson', () => {
  it('validates against GM instrument and STAVE genre allowlists and BPM bounds', () => {
    const parsed = parseExploreAiJson(
      '```json\n' +
        JSON.stringify({
          instruments: ['violin', 'Fake Instrument', 'Cello'],
          genre: 'classical',
          tempoMin: 70,
          tempoMax: 95,
          mode: 'minor',
          search: null,
          explanation:
            'Filtered for Violin and Cello in Minor mode at 70-95 BPM.',
        }) +
        '\n```',
      'en',
    );
    expect(parsed).toEqual({
      instruments: ['Violin', 'Cello'],
      genre: 'Classical',
      tempoMin: 70,
      tempoMax: 95,
      mode: 'minor',
      search: null,
      explanation: 'Filtered for Violin and Cello in Minor mode at 70-95 BPM.',
    });
  });

  it('drops out-of-range BPM, invalid mode, and returns null when nothing valid remains', () => {
    expect(
      parseExploreAiJson(
        JSON.stringify({
          instruments: ['Unknown Synth'],
          genre: 'Hyperpop',
          tempoMin: 999,
          tempoMax: 5,
          mode: 'dorian',
          search: '',
        }),
        'en',
      ),
    ).toBeNull();
  });
});

describe('ExploreSearchService', () => {
  it('returns AI-parsed filters when Gemini succeeds with valid JSON', async () => {
    const gemini = {
      generateText: jest.fn().mockResolvedValue(
        JSON.stringify({
          instruments: ['Acoustic Grand Piano'],
          genre: 'Lo-Fi',
          tempoMin: null,
          tempoMax: 85,
          mode: 'minor',
          search: null,
          explanation:
            'Mapped to Lo-Fi, Acoustic Grand Piano, Minor mode, <= 85 BPM.',
        }),
      ),
    } as unknown as GeminiClient;
    const service = new ExploreSearchService(gemini, new AiRateLimiter());

    const result = await service.parse(
      USER_ID,
      'lofi piano buồn dưới 85 bpm',
      'en',
    );
    expect(result.source).toBe('ai');
    expect(result.genre).toBe('Lo-Fi');
    expect(result.instruments).toEqual(['Acoustic Grand Piano']);
    expect(result.tempoMax).toBe(85);
    expect(result.mode).toBe('minor');
  });

  it('falls back to deterministic rule parser when Gemini fails, returns bad JSON, or rate limit is hit', async () => {
    const limiter = new AiRateLimiter();
    const gemini = {
      generateText: jest
        .fn()
        .mockResolvedValueOnce(null)
        .mockRejectedValueOnce(new Error('timeout'))
        .mockResolvedValueOnce('not json'),
    } as unknown as GeminiClient;
    const service = new ExploreSearchService(gemini, limiter);

    const res1 = await service.parse(USER_ID, 'piano under 90 bpm', 'en');
    expect(res1.source).toBe('rule');
    expect(res1.instruments).toEqual(['Acoustic Grand Piano']);
    expect(res1.tempoMax).toBe(90);

    const res2 = await service.parse(USER_ID, 'nhanh rock', 'vi');
    expect(res2.source).toBe('rule');
    expect(res2.genre).toBe('Rock');
    expect(res2.tempoMin).toBe(125);

    const res3 = await service.parse(USER_ID, 'minor cello', 'en');
    expect(res3.source).toBe('rule');
    expect(res3.mode).toBe('minor');
    expect(res3.instruments).toEqual(['Cello']);

    // Exhaust rate limiter and verify fallback without calling Gemini.
    for (let i = 0; i < 10; i++) {
      limiter.tryConsume(USER_ID);
    }
    const callsBefore = (gemini.generateText as jest.Mock).mock.calls.length;
    const res4 = await service.parse(USER_ID, 'jazz bass', 'en');
    expect(res4.source).toBe('rule');
    expect((gemini.generateText as jest.Mock).mock.calls.length).toBe(
      callsBefore,
    );
  });
});

describe('ExploreParseDto', () => {
  it('accepts valid 1..200 query and rejects blank or >200 char queries', async () => {
    expect(
      await validate(
        plainToInstance(ExploreParseDto, {
          query: '  jazz piano  ',
          lang: 'en',
        }),
      ),
    ).toHaveLength(0);

    expect(
      await validate(plainToInstance(ExploreParseDto, { query: '   ' })),
    ).not.toHaveLength(0);

    expect(
      await validate(
        plainToInstance(ExploreParseDto, { query: 'a'.repeat(201) }),
      ),
    ).not.toHaveLength(0);
  });
});
