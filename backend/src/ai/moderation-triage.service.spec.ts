import 'reflect-metadata';
import {
  ForbiddenException,
  HttpStatus,
  InternalServerErrorException,
  NotFoundException,
  ValidationPipe,
} from '@nestjs/common';
import type { ReportDetail, ReportPreview } from '@stave/shared-types';
import { AdminGuard } from '../common/guards/admin.guard';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { SessionAuthGuard } from '../common/guards/session-auth.guard';
import type { AdminReportsService } from '../reports/admin-reports.service';
import { AiRateLimiter } from './ai-rate-limiter';
import { ModerationTriageDto } from './dto/moderation-triage.dto';
import type { GeminiClient } from './gemini-client';
import { ModerationTriageController } from './moderation-triage.controller';
import {
  computeRuleModerationTriage,
  MODERATION_TRIAGE_CATEGORIES,
  ModerationTriageService,
  parseTriageAiJson,
  TRIAGE_CACHE_MAX_ENTRIES,
  TRIAGE_CACHE_TTL_MS,
} from './moderation-triage.service';

const ADMIN_ID = '11111111-1111-4111-8111-111111111111';
const PROJECT_ID = '22222222-2222-4222-8222-222222222222';
const REPORTER_1 = '33333333-3333-4333-8333-333333333333';
const REPORTER_2 = '44444444-4444-4444-8444-444444444444';
const REPORT_ID_1 = '55555555-5555-4555-8555-555555555555';

function makeDetail(over: Partial<ReportDetail> = {}): ReportDetail {
  return {
    id: REPORT_ID_1,
    reason: 'spam',
    details: 'Suspicious spam link',
    createdAt: '2026-11-20T10:00:00.000Z',
    reporter: { id: REPORTER_1, displayName: 'SecretReporterName' },
    status: 'pending',
    resolution: null,
    ...over,
  };
}

function makePreview(over: Partial<ReportPreview> = {}): ReportPreview {
  return {
    project: {
      id: PROJECT_ID,
      name: 'Midnight Track',
      description: 'An ambient synth track.',
      genre: 'Electronic',
    },
    hasCommit: true,
    trackCount: 3,
    noteCount: 128,
    tracks: [{ name: 'Synth', instrument: 'Pad 1 (new age)' }],
    ...over,
  };
}

function makeService(
  options: {
    details?: ReportDetail[];
    preview?: ReportPreview | Error;
    generateText?: jest.Mock;
    rateLimiter?: AiRateLimiter;
  } = {},
) {
  const getDetails = jest
    .fn()
    .mockResolvedValue(options.details ?? [makeDetail()]);
  const getPreview =
    options.preview instanceof Error
      ? jest.fn().mockRejectedValue(options.preview)
      : jest.fn().mockResolvedValue(options.preview ?? makePreview());

  const adminReports = {
    getDetails,
    getPreview,
  } as unknown as AdminReportsService;

  const generateText =
    options.generateText ??
    jest.fn().mockResolvedValue(
      JSON.stringify({
        priority: 'medium',
        categories: ['spam'],
        summary: 'Reported for repetitive promotional content.',
        recommendedCheck: 'Inspect project description and track names.',
      }),
    );
  const gemini = { generateText } as unknown as GeminiClient;
  const rateLimiter = options.rateLimiter ?? new AiRateLimiter();

  const service = new ModerationTriageService(
    adminReports,
    gemini,
    rateLimiter,
  );

  return { service, getDetails, getPreview, generateText, rateLimiter };
}

describe('computeRuleModerationTriage', () => {
  it('handles empty details safely as low priority and insufficient_info', () => {
    const res = computeRuleModerationTriage([]);
    expect(res).toEqual({
      priority: 'low',
      categories: ['insufficient_info'],
      reportCount: 0,
      reporterCount: 0,
      hasCopyrightClaim: false,
      reasonCounts: {
        copyright: 0,
        inappropriate: 0,
        spam: 0,
        harassment: 0,
        other: 0,
      },
    });
  });

  it('computes high priority when a copyright report has populated copyrightClaim evidence', () => {
    const res = computeRuleModerationTriage([
      makeDetail({
        reason: 'copyright',
        copyrightClaim: {
          claimantName: 'Original Artist',
          claimantRole: 'owner',
          workDescription: 'Original Melody 2024',
          evidence: 'https://example.com/original-track',
          goodFaith: true,
          accuracy: true,
        },
      }),
    ]);

    expect(res.priority).toBe('high');
    expect(res.hasCopyrightClaim).toBe(true);
    expect(res.categories).toEqual(['copyright_claim']);
    expect(res.reportCount).toBe(1);
    expect(res.reporterCount).toBe(1);
  });

  it('computes medium priority for copyright report without copyrightClaim evidence', () => {
    const res = computeRuleModerationTriage([
      makeDetail({ reason: 'copyright', copyrightClaim: null }),
    ]);

    expect(res.priority).toBe('medium');
    expect(res.hasCopyrightClaim).toBe(false);
    expect(res.categories).toEqual(['copyright_claim']);
  });

  it('computes high priority for harassment/inappropriate with >= 2 distinct reporters', () => {
    const twoInappropriate = computeRuleModerationTriage([
      makeDetail({
        id: 'r1',
        reason: 'inappropriate',
        reporter: { id: REPORTER_1, displayName: 'A' },
      }),
      makeDetail({
        id: 'r2',
        reason: 'inappropriate',
        reporter: { id: REPORTER_2, displayName: 'B' },
      }),
    ]);
    expect(twoInappropriate.priority).toBe('high');
    expect(twoInappropriate.reporterCount).toBe(2);
    expect(twoInappropriate.categories).toEqual(['inappropriate_content']);

    const mixedSevere = computeRuleModerationTriage([
      makeDetail({
        id: 'r1',
        reason: 'harassment',
        reporter: { id: REPORTER_1, displayName: 'A' },
      }),
      makeDetail({
        id: 'r2',
        reason: 'inappropriate',
        reporter: { id: REPORTER_2, displayName: 'B' },
      }),
    ]);
    expect(mixedSevere.priority).toBe('high');
    expect(mixedSevere.categories).toEqual([
      'abusive_language',
      'inappropriate_content',
    ]);
  });

  it('does not escalate to high when harassment/inappropriate reporters are null or only 1 distinct reporter', () => {
    const singleHarassmentPlusSpam = computeRuleModerationTriage([
      makeDetail({
        id: 'r1',
        reason: 'harassment',
        reporter: { id: REPORTER_1, displayName: 'A' },
      }),
      makeDetail({
        id: 'r2',
        reason: 'spam',
        reporter: { id: REPORTER_2, displayName: 'B' },
      }),
    ]);
    expect(singleHarassmentPlusSpam.priority).toBe('medium');

    const nullReportersInappropriate = computeRuleModerationTriage([
      makeDetail({ id: 'r1', reason: 'inappropriate', reporter: null }),
      makeDetail({ id: 'r2', reason: 'inappropriate', reporter: null }),
    ]);
    expect(nullReportersInappropriate.reporterCount).toBe(0);
    expect(nullReportersInappropriate.priority).toBe('medium');
  });

  it('computes high priority when reportCount >= 5 regardless of reason', () => {
    const fiveSpam = Array.from({ length: 5 }, (_, idx) =>
      makeDetail({
        id: `r-${idx}`,
        reason: 'spam',
        reporter: { id: `rep-${idx}`, displayName: `User ${idx}` },
      }),
    );
    const res = computeRuleModerationTriage(fiveSpam);
    expect(res.priority).toBe('high');
    expect(res.reportCount).toBe(5);
    expect(res.categories).toEqual(['spam']);
  });

  it('computes medium for >= 2 low-severity reports or 1 harassment, and low for single spam/inappropriate/other', () => {
    expect(
      computeRuleModerationTriage([makeDetail({ reason: 'spam' })]).priority,
    ).toBe('low');
    expect(
      computeRuleModerationTriage([makeDetail({ reason: 'inappropriate' })])
        .priority,
    ).toBe('low');
    expect(
      computeRuleModerationTriage([makeDetail({ reason: 'other' })]).priority,
    ).toBe('low');
    expect(
      computeRuleModerationTriage([makeDetail({ reason: 'harassment' })])
        .priority,
    ).toBe('medium');
    expect(
      computeRuleModerationTriage([
        makeDetail({ id: 'r1', reason: 'spam' }),
        makeDetail({
          id: 'r2',
          reason: 'other',
          reporter: { id: REPORTER_2, displayName: 'B' },
        }),
      ]).priority,
    ).toBe('medium');
  });

  it('maps all report reasons into allow-listed categories', () => {
    const res = computeRuleModerationTriage([
      makeDetail({ id: 'r1', reason: 'copyright' }),
      makeDetail({ id: 'r2', reason: 'harassment' }),
      makeDetail({ id: 'r3', reason: 'inappropriate' }),
      makeDetail({ id: 'r4', reason: 'spam' }),
      makeDetail({ id: 'r5', reason: 'other' }),
    ]);

    expect(res.categories).toEqual([
      'copyright_claim',
      'abusive_language',
      'inappropriate_content',
      'spam',
      'other',
    ]);
    for (const cat of res.categories) {
      expect(MODERATION_TRIAGE_CATEGORIES).toContain(cat);
    }
  });
});

describe('ModerationTriageService.triage', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('handles NotFoundException and ForbiddenException from getPreview gracefully', async () => {
    const notFoundCase = makeService({
      preview: new NotFoundException('Project not found'),
    });
    const res1 = await notFoundCase.service.triage(
      ADMIN_ID,
      PROJECT_ID,
      'open',
      'en',
    );
    expect(res1.explanationSource).toBe('ai');
    expect(res1.summary).toBe('Reported for repetitive promotional content.');

    const forbiddenCase = makeService({
      preview: new ForbiddenException('This project has no open reports'),
    });
    const res2 = await forbiddenCase.service.triage(
      ADMIN_ID,
      PROJECT_ID,
      'dismissed',
      'en',
    );
    expect(res2.explanationSource).toBe('ai');
  });

  it('propagates unexpected errors from getDetails', async () => {
    const { service } = makeService();
    (service as unknown as { adminReports: AdminReportsService }).adminReports =
      {
        getDetails: jest
          .fn()
          .mockRejectedValue(new InternalServerErrorException('db error')),
        getPreview: jest.fn().mockResolvedValue(makePreview()),
      } as unknown as AdminReportsService;

    await expect(
      service.triage(ADMIN_ID, PROJECT_ID, 'open', 'en'),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
  });

  it('never leaks reporter IDs, display names, claimant names, emails, or UUIDs to Gemini and truncates inputs', async () => {
    const longDesc = `Desc ${'a'.repeat(300)} contact owner@secret.com ref ${PROJECT_ID}`;
    const longDetails = `Please email reporter@private.org about ${REPORTER_1} ${'z'.repeat(300)}`;
    const details = Array.from({ length: 20 }, (_, i) =>
      makeDetail({
        id: `99999999-9999-4999-8999-9999999999${String(i).padStart(2, '0')}`,
        reason: i === 0 ? 'copyright' : 'spam',
        details: `${i}:${longDetails}`,
        reporter: {
          id: REPORTER_1,
          displayName: `ConfidentialReporter${i}`,
        },
        copyrightClaim:
          i === 0
            ? {
                claimantName: 'PrivateClaimantPerson',
                claimantRole: 'owner',
                workDescription: `Work ${'w'.repeat(250)}`,
                evidence: `Proof at claimant@hidden.net id ${REPORT_ID_1}`,
                goodFaith: true,
                accuracy: true,
              }
            : null,
      }),
    );

    const generateText = jest.fn().mockResolvedValue(
      JSON.stringify({
        priority: 'high',
        categories: ['copyright_claim'],
        summary: 'Multiple reports including a copyright claim.',
        recommendedCheck: 'Verify original work evidence.',
      }),
    );

    const { service } = makeService({
      details,
      preview: makePreview({
        project: {
          id: PROJECT_ID,
          name: 'Track Name',
          description: longDesc,
          genre: 'Pop',
        },
      }),
      generateText,
    });

    await service.triage(ADMIN_ID, PROJECT_ID, 'open', 'en');

    expect(generateText).toHaveBeenCalledTimes(1);
    const prompt = generateText.mock.calls[0][0] as string;
    const jsonText = prompt.slice(prompt.indexOf('\n') + 1);
    const payload = JSON.parse(jsonText) as {
      project: { descriptionExcerpt: string };
      reports: Array<{
        details?: string;
        workDescription?: string;
        evidence?: string;
      }>;
    };

    expect(prompt).not.toContain(PROJECT_ID);
    expect(prompt).not.toContain(REPORTER_1);
    expect(prompt).not.toContain(REPORT_ID_1);
    expect(prompt).not.toContain('ConfidentialReporter');
    expect(prompt).not.toContain('PrivateClaimantPerson');
    expect(prompt).not.toContain('owner@secret.com');
    expect(prompt).not.toContain('reporter@private.org');
    expect(prompt).not.toContain('claimant@hidden.net');
    expect(prompt).not.toMatch(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
    );

    expect(payload.project.descriptionExcerpt.length).toBeLessThanOrEqual(200);
    expect(payload.reports.length).toBeLessThanOrEqual(15);
    for (const r of payload.reports) {
      if (r.details) expect(r.details.length).toBeLessThanOrEqual(200);
      if (r.workDescription) {
        expect(r.workDescription.length).toBeLessThanOrEqual(200);
      }
      if (r.evidence) expect(r.evidence.length).toBeLessThanOrEqual(200);
    }
  });

  it('validates Gemini JSON strictly, keeps rule priority as floor, strips UUIDs, and caps output lengths', async () => {
    const rule = computeRuleModerationTriage([
      makeDetail({
        reason: 'copyright',
        copyrightClaim: {
          claimantName: 'Artist',
          claimantRole: 'owner',
          workDescription: 'Original song',
          evidence: 'https://example.com/song',
          goodFaith: true,
          accuracy: true,
        },
      }),
    ]);
    expect(rule.priority).toBe('high');

    const longSummary = `Summary for ${PROJECT_ID} and user@example.com ${'x'.repeat(450)}`;
    const longCheck = `Check ${REPORTER_1} ${'y'.repeat(250)}`;
    const generateText = jest.fn().mockResolvedValue(
      `\`\`\`json\n${JSON.stringify({
        priority: 'low',
        categories: ['invalid_category', 'copyright_claim', 'copyright_claim'],
        summary: longSummary,
        recommendedCheck: longCheck,
      })}\n\`\`\``,
    );

    const { service } = makeService({
      details: [
        makeDetail({
          reason: 'copyright',
          copyrightClaim: {
            claimantName: 'Artist',
            claimantRole: 'owner',
            workDescription: 'Original song',
            evidence: 'https://example.com/song',
            goodFaith: true,
            accuracy: true,
          },
        }),
      ],
      generateText,
    });

    const result = await service.triage(ADMIN_ID, PROJECT_ID, 'open', 'en');
    expect(result.explanationSource).toBe('ai');
    expect(result.priority).toBe('high');
    expect(result.categories).toEqual(['copyright_claim']);
    expect(result.summary).not.toBeNull();
    expect(result.summary!.length).toBeLessThanOrEqual(400);
    expect(result.summary).not.toContain(PROJECT_ID);
    expect(result.summary).not.toContain('user@example.com');
    expect(result.recommendedCheck).not.toBeNull();
    expect(result.recommendedCheck!.length).toBeLessThanOrEqual(200);
    expect(result.recommendedCheck).not.toContain(REPORTER_1);
  });

  it('falls back to deterministic rule baseline on Gemini null, thrown error, or invalid JSON', async () => {
    const cases = [
      jest.fn().mockResolvedValue(null),
      jest.fn().mockRejectedValue(new Error('timeout')),
      jest.fn().mockResolvedValue('not-json-at-all'),
      jest.fn().mockResolvedValue('{"priority": "high"}'),
    ];

    for (const generateText of cases) {
      const { service } = makeService({
        details: [makeDetail({ reason: 'harassment' })],
        generateText,
      });
      const res = await service.triage(ADMIN_ID, PROJECT_ID, 'open', 'vi');
      expect(res.priority).toBe('medium');
      expect(res.categories).toEqual(['abusive_language']);
      expect(res.summary).toBeNull();
      expect(res.recommendedCheck).toBeNull();
      expect(res.explanationSource).toBe('rule');
    }
  });

  it('enforces AiRateLimiter(15 per 60s) and returns rule baseline when exceeded', async () => {
    const rateLimiter = new AiRateLimiter();
    const spy = jest.spyOn(rateLimiter, 'tryConsume');
    const generateText = jest.fn().mockResolvedValue(
      JSON.stringify({
        priority: 'low',
        categories: ['spam'],
        summary: 'Single spam report.',
        recommendedCheck: 'Check metadata.',
      }),
    );

    const { service } = makeService({ generateText, rateLimiter });

    for (let i = 0; i < 15; i++) {
      const res = await service.triage(
        ADMIN_ID,
        `22222222-2222-4222-8222-0000000000${String(i).padStart(2, '0')}`,
        'open',
        'en',
      );
      expect(res.explanationSource).toBe('ai');
    }

    expect(spy).toHaveBeenCalledWith(ADMIN_ID, {
      limit: 15,
      windowMs: 60_000,
    });

    const overLimit = await service.triage(
      ADMIN_ID,
      '22222222-2222-4222-8222-000000000099',
      'open',
      'en',
    );
    expect(overLimit.explanationSource).toBe('rule');
    expect(overLimit.summary).toBeNull();
    expect(overLimit.recommendedCheck).toBeNull();
    expect(generateText).toHaveBeenCalledTimes(15);
  });

  it('skips Gemini and returns rule baseline when there are no reports', async () => {
    const generateText = jest.fn();
    const { service } = makeService({ details: [], generateText });

    const res = await service.triage(ADMIN_ID, PROJECT_ID, 'open', 'vi');
    expect(res.explanationSource).toBe('rule');
    expect(res.priority).toBe('low');
    expect(res.categories).toEqual(['insufficient_info']);
    expect(generateText).not.toHaveBeenCalled();
  });

  it('caches successful AI results for 5 minutes keyed by projectId:status:count:latestAt:lang and skips caching rule failures', async () => {
    let now = 1_700_000_000_000;
    jest.spyOn(Date, 'now').mockImplementation(() => now);

    const generateText = jest
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(
        JSON.stringify({
          priority: 'medium',
          categories: ['spam'],
          summary: 'Cached summary EN.',
          recommendedCheck: 'Check tracks.',
        }),
      )
      .mockResolvedValueOnce(
        JSON.stringify({
          priority: 'medium',
          categories: ['spam'],
          summary: 'Summary VI.',
          recommendedCheck: 'Kiểm tra track.',
        }),
      )
      .mockResolvedValueOnce(
        JSON.stringify({
          priority: 'medium',
          categories: ['spam'],
          summary: 'Refreshed after TTL.',
          recommendedCheck: 'Check again.',
        }),
      );

    const { service } = makeService({ generateText });

    // 1st call fails -> NOT cached
    const first = await service.triage(ADMIN_ID, PROJECT_ID, 'open', 'en');
    expect(first.explanationSource).toBe('rule');

    // 2nd call succeeds -> cached
    const second = await service.triage(ADMIN_ID, PROJECT_ID, 'open', 'en');
    expect(second.explanationSource).toBe('ai');
    expect(second.summary).toBe('Cached summary EN.');

    // 3rd call hits cache -> Gemini NOT called again
    const third = await service.triage(ADMIN_ID, PROJECT_ID, 'open', 'en');
    expect(third.summary).toBe('Cached summary EN.');
    expect(generateText).toHaveBeenCalledTimes(2);

    // Different lang misses cache
    const viRes = await service.triage(ADMIN_ID, PROJECT_ID, 'open', 'vi');
    expect(viRes.summary).toBe('Summary VI.');
    expect(generateText).toHaveBeenCalledTimes(3);

    // Advance past 5 min TTL -> expires
    now += TRIAGE_CACHE_TTL_MS + 1;
    const expired = await service.triage(ADMIN_ID, PROJECT_ID, 'open', 'en');
    expect(expired.summary).toBe('Refreshed after TTL.');
    expect(generateText).toHaveBeenCalledTimes(4);
  });

  it('evicts oldest cache entry when exceeding max 100 entries', async () => {
    const generateText = jest.fn().mockResolvedValue(
      JSON.stringify({
        priority: 'low',
        categories: ['spam'],
        summary: 'Valid summary.',
        recommendedCheck: 'Check track.',
      }),
    );
    const rateLimiter = new AiRateLimiter();
    jest.spyOn(rateLimiter, 'tryConsume').mockReturnValue(true);

    const { service } = makeService({ generateText, rateLimiter });

    for (let i = 0; i <= TRIAGE_CACHE_MAX_ENTRIES; i++) {
      await service.triage(
        ADMIN_ID,
        `22222222-2222-4222-8222-${String(i).padStart(12, '0')}`,
        'open',
        'en',
      );
    }
    expect(generateText).toHaveBeenCalledTimes(TRIAGE_CACHE_MAX_ENTRIES + 1);

    // First entry should have been evicted; latest entry should still hit cache
    await service.triage(
      ADMIN_ID,
      `22222222-2222-4222-8222-${String(TRIAGE_CACHE_MAX_ENTRIES).padStart(12, '0')}`,
      'open',
      'en',
    );
    expect(generateText).toHaveBeenCalledTimes(TRIAGE_CACHE_MAX_ENTRIES + 1);

    await service.triage(
      ADMIN_ID,
      `22222222-2222-4222-8222-${String(0).padStart(12, '0')}`,
      'open',
      'en',
    );
    expect(generateText).toHaveBeenCalledTimes(TRIAGE_CACHE_MAX_ENTRIES + 2);
  });
});

describe('parseTriageAiJson', () => {
  it('falls back to rule priority and categories when AI returns out-of-allow-list enum values', () => {
    const rule = computeRuleModerationTriage([
      makeDetail({ reason: 'inappropriate' }),
    ]);
    const parsed = parseTriageAiJson(
      JSON.stringify({
        priority: 'CRITICAL',
        categories: ['made_up'],
        summary: 'Valid summary.',
        recommendedCheck: 'Inspect track.',
      }),
      rule,
    );
    expect(parsed).toEqual({
      priority: 'low',
      categories: ['inappropriate_content'],
      summary: 'Valid summary.',
      recommendedCheck: 'Inspect track.',
    });
  });
});

describe('ModerationTriageController & ModerationTriageDto', () => {
  it('requires JwtAuthGuard, SessionAuthGuard, and AdminGuard in order on /ai/moderation-triage with HTTP 200', () => {
    const handler = Object.getOwnPropertyDescriptor(
      ModerationTriageController.prototype,
      'triage',
    )?.value as object;

    expect(Reflect.getMetadata('path', ModerationTriageController)).toBe('ai');
    expect(
      Reflect.getMetadata('__guards__', ModerationTriageController),
    ).toEqual([JwtAuthGuard, SessionAuthGuard, AdminGuard]);
    expect(Reflect.getMetadata('path', handler)).toBe('moderation-triage');
    expect(Reflect.getMetadata('__httpCode__', handler)).toBe(HttpStatus.OK);
  });

  it('validates DTO and applies default status=open and lang=vi', async () => {
    const pipe = new ValidationPipe({ whitelist: true, transform: true });
    const valid = await pipe.transform(
      { projectId: PROJECT_ID, extra: 'ignored' },
      { type: 'body', metatype: ModerationTriageDto },
    );
    expect(valid).toEqual({
      projectId: PROJECT_ID,
      status: 'open',
      lang: 'vi',
    });

    await expect(
      pipe.transform(
        { projectId: 'not-a-uuid' },
        { type: 'body', metatype: ModerationTriageDto },
      ),
    ).rejects.toThrow();

    await expect(
      pipe.transform(
        { projectId: PROJECT_ID, status: 'invalid' },
        { type: 'body', metatype: ModerationTriageDto },
      ),
    ).rejects.toThrow();
  });

  it('forwards adminUserId, projectId, status, and lang to ModerationTriageService', async () => {
    const triage = jest.fn().mockResolvedValue({ priority: 'low' });
    const controller = new ModerationTriageController({
      triage,
    } as unknown as ModerationTriageService);

    await controller.triage({ projectId: PROJECT_ID }, ADMIN_ID);
    expect(triage).toHaveBeenCalledWith(ADMIN_ID, PROJECT_ID, 'open', 'vi');
  });
});
