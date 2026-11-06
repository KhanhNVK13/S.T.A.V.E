/**
 * UC-71 — đánh giá mức rủi ro khi hợp nhất hai nhánh.
 *
 * Toàn bộ phép tính nằm ở đây bằng code thuần (BR-81): AI chỉ viết câu
 * giải thích sau khi mức đã được quyết định.
 *
 * Ngưỡng đặt thành hằng số có tên ở đầu file để chỉnh được khi cần.
 */

/** Mức rủi ro hợp nhất. */
export type MergeRiskLevel = 'low' | 'medium' | 'high';

/**
 * Số xung đột từ đây trở lên là rủi ro cao.
 * (vu.md: "cao nếu conflictsCount >= 5")
 */
export const HIGH_RISK_CONFLICTS_THRESHOLD = 5;

/**
 * Tỉ lệ nốt chồng chéo so với phía thay đổi nhiều hơn, từ đây trở lên là
 * rủi ro cao. (vu.md: "overlap / max(sourceChanged, targetChanged) >= 0.5")
 */
export const HIGH_RISK_OVERLAP_RATIO = 0.5;

/**
 * Số nốt chồng chéo tối thiểu để tính là rủi ro vừa.
 * (vu.md: "vừa nếu ... overlap >= 3")
 */
export const MEDIUM_RISK_OVERLAP_THRESHOLD = 3;

/**
 * Số commit mới mỗi phía tối thiểu để tính là rủi ro vừa.
 * (vu.md: "cả hai phía mỗi bên có từ 10 commit mới trở lên")
 */
export const MEDIUM_RISK_COMMIT_THRESHOLD = 10;

/** Đầu vào của hàm đánh giá — tất cả đều là số đếm, không có nội dung nốt. */
export interface MergeRiskInput {
  /** Tổng nốt thêm + xoá + sửa ở nhánh nguồn so với điểm gốc chung. */
  sourceChanged: number;
  /** Tổng nốt thêm + xoá + sửa ở nhánh đích so với điểm gốc chung. */
  targetChanged: number;
  /** Số nốt bị đổi ở cả hai phía (đếm theo id nốt). */
  overlap: number;
  /** Số xung đột merge tìm được. */
  conflictsCount: number;
  /** Số commit nhánh nguồn có thêm kể từ điểm gốc chung. */
  sourceCommits: number;
  /** Số commit nhánh đích có thêm kể từ điểm gốc chung. */
  targetCommits: number;
}

/**
 * Xác định mức rủi ro hợp nhất.
 *
 * - **cao**: `conflictsCount >= 5` HOẶC `overlap / max(sourceChanged, targetChanged) >= 0.5`
 * - **vừa**: `conflictsCount >= 1` HOẶC `overlap >= 3` HOẶC cả hai phía mỗi bên
 *   từ 10 commit mới trở lên
 * - **thấp**: còn lại
 */
export function assessMergeRisk(input: MergeRiskInput): MergeRiskLevel {
  const {
    sourceChanged,
    targetChanged,
    overlap,
    conflictsCount,
    sourceCommits,
    targetCommits,
  } = input;

  // Cao: nhiều xung đột, hoặc chồng chéo chiếm từ một nửa phía thay đổi
  // nhiều hơn. max = 0 thì không có phía nào thay đổi gì → tỉ lệ = 0.
  const maxChanged = Math.max(sourceChanged, targetChanged);
  const overlapRatio = maxChanged > 0 ? overlap / maxChanged : 0;

  if (
    conflictsCount >= HIGH_RISK_CONFLICTS_THRESHOLD ||
    overlapRatio >= HIGH_RISK_OVERLAP_RATIO
  ) {
    return 'high';
  }

  // Vừa: có xung đột, hoặc chồng chéo đáng kể, hoặc hai nhánh đều đi xa
  if (
    conflictsCount >= 1 ||
    overlap >= MEDIUM_RISK_OVERLAP_THRESHOLD ||
    (sourceCommits >= MEDIUM_RISK_COMMIT_THRESHOLD &&
      targetCommits >= MEDIUM_RISK_COMMIT_THRESHOLD)
  ) {
    return 'medium';
  }

  return 'low';
}
