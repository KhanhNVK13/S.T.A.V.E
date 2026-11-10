import {
  assessMergeRisk,
  HIGH_RISK_CONFLICTS_THRESHOLD,
  HIGH_RISK_OVERLAP_RATIO,
  MEDIUM_RISK_COMMIT_THRESHOLD,
  MEDIUM_RISK_OVERLAP_THRESHOLD,
  type MergeRiskInput,
} from './merge-risk';

/**
 * UC-71 — hàm thuần đánh giá mức rủi ro merge (BR-81).
 *
 * Ngưỡng nằm trong hằng số có tên ở đầu file; test bám sát từng điều kiện
 * biên để đổi ngưỡng không làm hỏng hàm.
 */
describe('assessMergeRisk', () => {
  const base: MergeRiskInput = {
    sourceChanged: 0,
    targetChanged: 0,
    overlap: 0,
    conflictsCount: 0,
    sourceCommits: 0,
    targetCommits: 0,
  };

  // ==========================================================================
  // Mức thấp
  // ==========================================================================

  it('returns low when nothing changed on either side', () => {
    expect(assessMergeRisk(base)).toBe('low');
  });

  it('returns low when there are no conflicts, little overlap and few commits', () => {
    expect(
      assessMergeRisk({
        sourceChanged: 10,
        targetChanged: 4,
        overlap: 0,
        conflictsCount: 0,
        sourceCommits: 2,
        targetCommits: 1,
      }),
    ).toBe('low');
  });

  // ==========================================================================
  // Biên: số xung đột (4 / 5)
  // ==========================================================================

  it('returns medium at 4 conflicts (just below the high threshold)', () => {
    expect(
      assessMergeRisk({
        ...base,
        sourceChanged: 10,
        targetChanged: 10,
        conflictsCount: HIGH_RISK_CONFLICTS_THRESHOLD - 1,
      }),
    ).toBe('medium');
  });

  it('returns high at 5 conflicts (the high threshold)', () => {
    expect(
      assessMergeRisk({
        ...base,
        sourceChanged: 10,
        targetChanged: 10,
        conflictsCount: HIGH_RISK_CONFLICTS_THRESHOLD,
      }),
    ).toBe('high');
  });

  // ==========================================================================
  // Biên: tỉ lệ chồng chéo (0.49 / 0.5)
  // ==========================================================================

  it('returns medium at overlap ratio 0.49', () => {
    // overlap 49 / max 100 = 0.49 — dưới ngưỡng 0.5, và chỉ có 49 nốt
    // chồng nên vẫn không đủ để lên "vừa" theo ngưỡng overlap >= 3.
    expect(
      assessMergeRisk({
        sourceChanged: 49,
        targetChanged: 100,
        overlap: 49,
        conflictsCount: 0,
        sourceCommits: 1,
        targetCommits: 1,
      }),
    ).toBe('medium');
  });

  it('returns high at overlap ratio 0.5', () => {
    expect(
      assessMergeRisk({
        sourceChanged: 50,
        targetChanged: 100,
        overlap: 50,
        conflictsCount: 0,
        sourceCommits: 1,
        targetCommits: 1,
      }),
    ).toBe('high');
  });

  it('treats an overlap ratio of exactly 0.5 as high', () => {
    // 5 / 10 = 0.5 đúng bằng ngưỡng → cao
    expect(
      assessMergeRisk({
        sourceChanged: 10,
        targetChanged: 5,
        overlap: 5,
        conflictsCount: 0,
        sourceCommits: 0,
        targetCommits: 0,
      }),
    ).toBe('high');
  });

  // ==========================================================================
  // Biên: số nốt chồng chéo (2 / 3)
  // ==========================================================================

  it('returns low at 2 overlapping notes', () => {
    // Tỉ lệ chồng chéo 2/10 = 0.2 (< 0.5) nên không lên cao; 2 nốt < 3 nên
    // cũng không lên vừa → thấp.
    expect(
      assessMergeRisk({
        sourceChanged: 10,
        targetChanged: 10,
        overlap: MEDIUM_RISK_OVERLAP_THRESHOLD - 1,
        conflictsCount: 0,
        sourceCommits: 1,
        targetCommits: 1,
      }),
    ).toBe('low');
  });

  it('returns medium at 3 overlapping notes', () => {
    expect(
      assessMergeRisk({
        sourceChanged: 10,
        targetChanged: 10,
        overlap: MEDIUM_RISK_OVERLAP_THRESHOLD,
        conflictsCount: 0,
        sourceCommits: 1,
        targetCommits: 1,
      }),
    ).toBe('medium');
  });

  // ==========================================================================
  // Biên: số commit mới mỗi phía (9 / 10)
  // ==========================================================================

  it('returns low when both sides have 9 new commits', () => {
    expect(
      assessMergeRisk({
        sourceChanged: 1,
        targetChanged: 1,
        overlap: 0,
        conflictsCount: 0,
        sourceCommits: MEDIUM_RISK_COMMIT_THRESHOLD - 1,
        targetCommits: MEDIUM_RISK_COMMIT_THRESHOLD - 1,
      }),
    ).toBe('low');
  });

  it('returns medium when both sides have 10 new commits', () => {
    expect(
      assessMergeRisk({
        sourceChanged: 1,
        targetChanged: 1,
        overlap: 0,
        conflictsCount: 0,
        sourceCommits: MEDIUM_RISK_COMMIT_THRESHOLD,
        targetCommits: MEDIUM_RISK_COMMIT_THRESHOLD,
      }),
    ).toBe('medium');
  });

  it('returns low when only one side has 10 new commits', () => {
    // Điều kiện "cả hai phía" — một phía có 10 commit chưa đủ để lên vừa.
    expect(
      assessMergeRisk({
        sourceChanged: 1,
        targetChanged: 1,
        overlap: 0,
        conflictsCount: 0,
        sourceCommits: MEDIUM_RISK_COMMIT_THRESHOLD,
        targetCommits: 1,
      }),
    ).toBe('low');
  });

  // ==========================================================================
  // Thứ tự ưu tiên: cao thắng vừa
  // ==========================================================================

  it('returns high when both the conflict count and the overlap ratio are high', () => {
    expect(
      assessMergeRisk({
        sourceChanged: 10,
        targetChanged: 10,
        overlap: 8,
        conflictsCount: HIGH_RISK_CONFLICTS_THRESHOLD,
        sourceCommits: 20,
        targetCommits: 20,
      }),
    ).toBe('high');
  });

  it('returns medium for a single conflict', () => {
    expect(
      assessMergeRisk({
        sourceChanged: 2,
        targetChanged: 2,
        overlap: 0,
        conflictsCount: 1,
        sourceCommits: 0,
        targetCommits: 0,
      }),
    ).toBe('medium');
  });

  it('does not divide by zero when neither side changed', () => {
    expect(
      assessMergeRisk({
        sourceChanged: 0,
        targetChanged: 0,
        overlap: 0,
        conflictsCount: 0,
        sourceCommits: 0,
        targetCommits: 0,
      }),
    ).toBe('low');
  });

  it('keeps the documented thresholds', () => {
    expect(HIGH_RISK_CONFLICTS_THRESHOLD).toBe(5);
    expect(HIGH_RISK_OVERLAP_RATIO).toBe(0.5);
    expect(MEDIUM_RISK_OVERLAP_THRESHOLD).toBe(3);
    expect(MEDIUM_RISK_COMMIT_THRESHOLD).toBe(10);
  });
});
