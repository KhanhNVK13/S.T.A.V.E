import 'reflect-metadata';
import { BadRequestException } from '@nestjs/common';
import type { DraftNote, DraftSnapshot } from '@stave/shared-types';
import { createSupabaseMock } from '../test-utils/supabase-mock';
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
}));

import { MergeRiskService, LOW_RISK_EXPLANATION } from './merge-risk.service';
import { GeminiClient } from './gemini-client';
import { AiRateLimiter } from './ai-rate-limiter';
import { DiffService } from '../commits/diff.service';
import { BranchesService } from '../branches/branches.service';
import { ProjectAccessService } from '../project-access/project-access.service';
import { MergeService } from '../merge/merge.service';

/**
 * UC-71 — MergeRiskService.
 *
 * Trọng tâm: AI không được là điều kiện để có kết quả (BR-79), mức thấp
 * không gọi AI, và hai nhánh không so sánh được thì 400.
 */

const userId = '11111111-1111-4111-8111-111111111111';
const projectId = '22222222-2222-4222-8222-222222222222';
const sourceBranchId = '33333333-3333-4333-8333-333333333333';
const targetBranchId = '44444444-4444-4444-8444-444444444444';
const baseCommitId = '55555555-5555-4555-8555-555555555555';
const sourceHeadId = '66666666-6666-4666-8666-666666666666';
const targetHeadId = '77777777-7777-4777-8777-777777777777';

function note(id: string, overrides: Partial<DraftNote> = {}): DraftNote {
  return {
    id,
    trackId: 't1',
    pitch: 60,
    start: 0,
    duration: 480,
    velocity: 100,
    ...overrides,
  };
}

function snapshot(notes: DraftNote[]): DraftSnapshot {
  return {
    schemaVersion: 1,
    meta: { tempo: 120, timeSignature: [4, 4], ppq: 480 },
    tracks: [],
    notes,
  };
}

const EMPTY = snapshot([]);

/**
 * Dựng service với các phụ thuộc giả.
 *
 * `gemini` là mock thật của `GeminiClient` (generateText) để test kiểm tra
 * được "mức thấp không gọi AI" và "AI lỗi → explanation null".
 */
function makeService(options: {
  base?: DraftSnapshot;
  source?: DraftSnapshot;
  target?: DraftSnapshot;
  mergeBase?: string | null;
  /** Bảng `commits` trả về theo thứ tự truy vấn. */
  commitSnapshots?: Array<DraftSnapshot | null>;
  conflictsCount?: number;
  generateText?: jest.Mock;
  /** Kết quả của `commit_ancestry` cho mỗi lần gọi. */
  ancestry?: Array<Array<{ id: string; parent_commit_id: string | null }>>;
}) {
  const mock = createSupabaseMock([], {
    tables: {
      branches: [
        {
          data: {
            id: sourceBranchId,
            project_id: projectId,
            head_commit_id: sourceHeadId,
          },
        },
        {
          data: {
            id: targetBranchId,
            project_id: projectId,
            head_commit_id: targetHeadId,
          },
        },
      ],
      commits: (options.commitSnapshots ?? []).map((snap) => ({
        data: snap ? { snapshot: snap } : null,
      })),
    },
    rpc: {
      commit_ancestry: (options.ancestry ?? []).map((rows) => ({ data: rows })),
    },
  });

  const findMergeBase = jest
    .fn()
    .mockResolvedValue(
      options.mergeBase === undefined ? baseCommitId : options.mergeBase,
    );

  const branchesService = {
    findMergeBase,
  } as unknown as BranchesService;

  const assertCanEdit = jest.fn().mockResolvedValue(undefined);
  const access = {
    assertCanEdit,
  } as unknown as ProjectAccessService;

  const diffService = new DiffService();

  const previewMerge = jest.fn().mockReturnValue({
    conflictsCount: options.conflictsCount ?? 0,
    conflictsByBar: {},
  });
  const mergeService = {
    previewMerge,
  } as unknown as MergeService;

  const generateText =
    options.generateText ??
    jest.fn().mockResolvedValue('Hai nhánh cùng sửa 4 nốt.');

  const gemini = { generateText } as unknown as GeminiClient;

  const service = new MergeRiskService(
    mock.client,
    branchesService,
    access,
    diffService,
    mergeService,
    gemini,
    new AiRateLimiter(),
  );

  return {
    service,
    findMergeBase,
    generateText,
    previewMerge,
    assertCanEdit,
    mock,
  };
}

describe('BE-AIR-01 MergeRiskService.assess', () => {
  it('UTCID01 returns 400 when the branches have no common ancestor', async () => {
    const { service } = makeService({ mergeBase: null });

    // Gọi một lần: mock đọc bảng `branches` theo hàng đợi nên gọi lại lần
    // hai sẽ hết dữ liệu và báo lỗi của mock chứ không phải lỗi nghiệp vụ.
    const error = await service
      .assess(userId, sourceBranchId, targetBranchId)
      .then(() => null)
      .catch((err: unknown) => err);

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as Error).message).toContain('Branches cannot be compared');
  });

  it('UTCID02 returns 404 when a branch does not exist', async () => {
    const mock = createSupabaseMock([], {
      tables: {
        branches: [{ data: null }, { data: null }],
      },
    });
    const service = new MergeRiskService(
      mock.client,
      { findMergeBase: jest.fn() } as unknown as BranchesService,
      { assertCanEdit: jest.fn() } as unknown as ProjectAccessService,
      new DiffService(),
      { previewMerge: jest.fn() } as unknown as MergeService,
      { generateText: jest.fn() } as unknown as GeminiClient,
      new AiRateLimiter(),
    );

    await expect(
      service.assess(userId, sourceBranchId, targetBranchId),
    ).rejects.toThrow('Branch not found');
  });

  it('UTCID03 returns low risk with a fixed explanation and never calls the AI', async () => {
    const { service, generateText } = makeService({
      base: EMPTY,
      source: EMPTY,
      target: EMPTY,
      commitSnapshots: [EMPTY, EMPTY, EMPTY],
      ancestry: [[], []],
    });

    const result = await service.assess(userId, sourceBranchId, targetBranchId);

    expect(result.level).toBe('low');
    expect(result.explanation).toBe(LOW_RISK_EXPLANATION);
    expect(generateText).not.toHaveBeenCalled();
  });

  it('UTCID04 returns explanation null when the AI call fails', async () => {
    const generateText = jest.fn().mockRejectedValue(new Error('gemini down'));
    const { service } = makeService({
      base: EMPTY,
      source: snapshot([note('n1'), note('n2'), note('n3'), note('n4')]),
      target: EMPTY,
      commitSnapshots: [
        EMPTY,
        snapshot([note('n1'), note('n2'), note('n3'), note('n4')]),
        EMPTY,
      ],
      conflictsCount: 2,
      ancestry: [[], []],
      generateText,
    });

    const result = await service.assess(userId, sourceBranchId, targetBranchId);

    expect(result.level).toBe('medium');
    expect(result.explanation).toBeNull();
  });

  it('UTCID05 returns explanation null when the AI returns null (timeout)', async () => {
    const generateText = jest.fn().mockResolvedValue(null);
    const { service } = makeService({
      base: EMPTY,
      source: snapshot([note('n1'), note('n2'), note('n3'), note('n4')]),
      target: EMPTY,
      commitSnapshots: [
        EMPTY,
        snapshot([note('n1'), note('n2'), note('n3'), note('n4')]),
        EMPTY,
      ],
      conflictsCount: 2,
      ancestry: [[], []],
      generateText,
    });

    const result = await service.assess(userId, sourceBranchId, targetBranchId);

    expect(result.level).toBe('medium');
    expect(result.explanation).toBeNull();
  });

  it('UTCID06 counts the notes changed on both sides as the overlap', async () => {
    // cả hai phía đổi n1 và n2 → overlap = 2; chỉ nguồn đổi n3.
    const source = snapshot([
      note('n1', { pitch: 61 }),
      note('n2', { pitch: 62 }),
      note('n3'),
    ]);
    const target = snapshot([
      note('n1', { pitch: 63 }),
      note('n2', { pitch: 64 }),
    ]);
    const { service } = makeService({
      base: EMPTY,
      source,
      target,
      commitSnapshots: [EMPTY, source, target],
      conflictsCount: 0,
      ancestry: [[], []],
    });

    const result = await service.assess(userId, sourceBranchId, targetBranchId);

    expect(result.metrics.sourceChanged).toBe(3);
    expect(result.metrics.targetChanged).toBe(2);
    expect(result.metrics.overlap).toBe(2);
  });

  it('UTCID07 uses MergeService.previewMerge for the conflict count', async () => {
    const source = snapshot([
      note('n1'),
      note('n2'),
      note('n3'),
      note('n4'),
      note('n5'),
    ]);
    const { service, previewMerge } = makeService({
      base: EMPTY,
      source,
      target: EMPTY,
      commitSnapshots: [EMPTY, source, EMPTY],
      conflictsCount: 5,
      ancestry: [[], []],
    });

    const result = await service.assess(userId, sourceBranchId, targetBranchId);

    expect(previewMerge).toHaveBeenCalled();
    expect(result.metrics.conflictsCount).toBe(5);
    expect(result.level).toBe('high');
  });

  it('UTCID08 counts the commits each branch added since the merge base', async () => {
    const { service } = makeService({
      base: EMPTY,
      source: EMPTY,
      target: EMPTY,
      commitSnapshots: [EMPTY, EMPTY, EMPTY],
      ancestry: [
        [
          { id: sourceHeadId, parent_commit_id: baseCommitId },
          { id: baseCommitId, parent_commit_id: null },
        ],
        [
          { id: targetHeadId, parent_commit_id: baseCommitId },
          { id: baseCommitId, parent_commit_id: null },
        ],
      ],
    });

    const result = await service.assess(userId, sourceBranchId, targetBranchId);

    expect(result.metrics.sourceCommits).toBe(1);
    expect(result.metrics.targetCommits).toBe(1);
  });

  it('UTCID09 returns 400 when a snapshot is missing so the branches cannot be compared', async () => {
    const { service } = makeService({
      base: EMPTY,
      source: EMPTY,
      target: EMPTY,
      commitSnapshots: [EMPTY, null, EMPTY],
      ancestry: [[], []],
    });

    await expect(
      service.assess(userId, sourceBranchId, targetBranchId),
    ).rejects.toThrow('Branches cannot be compared');
  });

  it('UTCID10 checks edit permission on the project before assessing', async () => {
    const { service, assertCanEdit } = makeService({
      base: EMPTY,
      source: EMPTY,
      target: EMPTY,
      commitSnapshots: [EMPTY, EMPTY, EMPTY],
      ancestry: [[], []],
    });

    await service.assess(userId, sourceBranchId, targetBranchId);

    expect(assertCanEdit).toHaveBeenCalledWith(projectId, userId);
  });
});
