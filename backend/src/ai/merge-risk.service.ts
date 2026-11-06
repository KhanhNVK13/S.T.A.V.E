import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { DraftNote, DraftSnapshot } from '@stave/shared-types';
import { SUPABASE_ADMIN_CLIENT } from '../supabase/supabase.constants';
import { BranchesService } from '../branches/branches.service';
import { ProjectAccessService } from '../project-access/project-access.service';
import { DiffService } from '../commits/diff.service';
import { MergeService } from '../merge/merge.service';
import { GeminiClient } from './gemini-client';
import { AiRateLimiter } from './ai-rate-limiter';
import { assessMergeRisk, type MergeRiskLevel } from './merge-risk';

/** Hàng của bảng `branches`. */
interface BranchDbRow {
  id: string;
  project_id: string;
  name: string;
  is_default: boolean;
  created_by: string;
  created_at: string;
  base_commit_id: string | null;
  head_commit_id: string | null;
}

/** Số liệu trả về cho giao diện — không chứa nội dung nốt. */
export interface MergeRiskMetrics {
  /** Tổng nốt thay đổi ở nhánh nguồn so với điểm gốc chung. */
  sourceChanged: number;
  /** Tổng nốt thay đổi ở nhánh đích so với điểm gốc chung. */
  targetChanged: number;
  /** Số nốt bị đổi ở cả hai phía. */
  overlap: number;
  /** Số xung đột merge tìm được. */
  conflictsCount: number;
  /** Số commit nhánh nguồn có thêm kể từ điểm gốc chung. */
  sourceCommits: number;
  /** Số commit nhánh đích có thêm kể từ điểm gốc chung. */
  targetCommits: number;
}

/** Kết quả trả về của `GET /ai/merge-risk`. */
export interface MergeRiskResult {
  level: MergeRiskLevel;
  metrics: MergeRiskMetrics;
  /**
   * Một–hai câu giải thích do Gemini viết từ các con số ở trên.
   * `null` khi mức thấp (không tạo cảnh báo giả) hoặc khi AI lỗi/quá hạn —
   * giao diện vẫn hiện đủ số liệu (BR-79).
   */
  explanation: string | null;
}

/** Câu giải thích cố định cho mức thấp — không gọi AI. */
export const LOW_RISK_EXPLANATION =
  'Hợp nhất đơn giản, ít chồng chéo và không có xung đột.';

/** Lời nhắc cố định — chỉ nhận các con số, không nhận nội dung nốt (BR-80). */
const EXPLANATION_PROMPT = [
  'Bạn viết một đoạn giải thích ngắn bằng tiếng Việt cho người dùng về rủi ro khi hợp nhất hai nhánh.',
  'Dưới đây là các con số ở dạng JSON. Hãy viết đúng một hoặc hai câu, nêu thật những số liệu đã có,',
  'không thêm chi tiết nào không có trong dữ liệu, không dùng dấu ngoặc kép và không giải thích thêm.',
].join(' ');

/**
 * UC-71 — cảnh báo rủi ro merge.
 *
 * Toán học và luật làm trước (BR-81): mức rủi ro và các con số do code quyết
 * định. Gemini chỉ viết một–hai câu giải thích từ những con số đó, và
 * luôn là phần tuỳ chọn (BR-79): AI lỗi hay quá hạn thì `explanation` là
 * `null` còn số liệu vẫn trả về đầy đủ.
 */
@Injectable()
export class MergeRiskService {
  private readonly logger = new Logger(MergeRiskService.name);

  constructor(
    @Inject(SUPABASE_ADMIN_CLIENT)
    private readonly supabase: SupabaseClient<any, 'public', any>,
    private readonly branchesService: BranchesService,
    private readonly access: ProjectAccessService,
    private readonly diffService: DiffService,
    private readonly mergeService: MergeService,
    private readonly gemini: GeminiClient,
    private readonly rateLimiter: AiRateLimiter,
  ) {}

  /**
   * Đánh giá rủi ro hợp nhất nhánh nguồn vào nhánh đích.
   *
   * Ném `BadRequestException('Branches cannot be compared')` khi hai nhánh
   * không có điểm gốc chung — đó là lỗi merge, không phải đánh giá rủi ro.
   */
  async assess(
    userId: string,
    sourceBranchId: string,
    targetBranchId: string,
  ): Promise<MergeRiskResult> {
    const [source, target] = await Promise.all([
      this.getBranch(sourceBranchId),
      this.getBranch(targetBranchId),
    ]);

    if (!source || !target) {
      throw new NotFoundException('Branch not found');
    }
    if (source.project_id !== target.project_id) {
      throw new BadRequestException('Branches cannot be compared');
    }

    // Quyền chỉnh sửa dự án — ai hợp nhất được thì mới được xem đánh giá.
    await this.access.assertCanEdit(source.project_id, userId);

    const baseCommitId = await this.branchesService.findMergeBase(
      source.head_commit_id,
      target.head_commit_id,
    );
    if (!baseCommitId) {
      throw new BadRequestException('Branches cannot be compared');
    }

    const [baseSnapshot, sourceSnapshot, targetSnapshot] = await Promise.all([
      this.getCommitSnapshot(baseCommitId),
      this.getCommitSnapshot(source.head_commit_id),
      this.getCommitSnapshot(target.head_commit_id),
    ]);

    // Không có snapshot ở một phía thì không đủ dữ liệu để so sánh.
    if (!baseSnapshot || !sourceSnapshot || !targetSnapshot) {
      throw new BadRequestException('Branches cannot be compared');
    }

    const sourceDiff = this.diffService.compareSnapshots(
      baseSnapshot,
      sourceSnapshot,
    );
    const targetDiff = this.diffService.compareSnapshots(
      baseSnapshot,
      targetSnapshot,
    );

    const sourceChanged = sourceDiff.summary.notes.totalChanges;
    const targetChanged = targetDiff.summary.notes.totalChanges;

    // Chồng chéo: nốt bị đổi ở CẢ HAI phía, đếm theo id nốt.
    const sourceTouched = this.touchedNoteIds(baseSnapshot, sourceSnapshot);
    const targetTouched = this.touchedNoteIds(baseSnapshot, targetSnapshot);
    let overlap = 0;
    for (const id of sourceTouched) {
      if (targetTouched.has(id)) overlap++;
    }

    // Xung đột: dùng đúng thuật toán merge 3 phía của hệ thống
    // (MergeService.previewMerge) — không tự đếm lại.
    const { conflictsCount } = this.mergeService.previewMerge(
      baseSnapshot,
      sourceSnapshot,
      targetSnapshot,
    );

    // Độ lệch: số commit mỗi nhánh có thêm kể từ điểm gốc chung, đi ngược
    // chuỗi `parent_commit_id`.
    const [sourceCommits, targetCommits] = await Promise.all([
      this.countCommitsSince(source.head_commit_id, baseCommitId),
      this.countCommitsSince(target.head_commit_id, baseCommitId),
    ]);

    const level = assessMergeRisk({
      sourceChanged,
      targetChanged,
      overlap,
      conflictsCount,
      sourceCommits,
      targetCommits,
    });

    const metrics: MergeRiskMetrics = {
      sourceChanged,
      targetChanged,
      overlap,
      conflictsCount,
      sourceCommits,
      targetCommits,
    };

    // Mức thấp: trả lời cố định, KHÔNG gọi AI, không tạo cảnh báo giả.
    if (level === 'low') {
      return { level, metrics, explanation: LOW_RISK_EXPLANATION };
    }

    const explanation = await this.explain(userId, metrics);
    return { level, metrics, explanation };
  }

  /**
   * Nhờ Gemini viết một–hai câu giải thích từ các con số.
   *
   * Chỉ gửi số đếm — không gửi nốt, tên người dùng hay email (BR-80).
   * Lỗi / quá hạn / vượt hạn mức → `null`, không ném lỗi (BR-79).
   */
  private async explain(
    userId: string,
    metrics: MergeRiskMetrics,
  ): Promise<string | null> {
    if (!this.rateLimiter.tryConsume(userId)) {
      this.logger.warn(
        'AI rate limit reached — skipping merge-risk explanation',
      );
      return null;
    }

    try {
      const text = await this.gemini.generateText(
        `${EXPLANATION_PROMPT}\n${JSON.stringify(metrics)}`,
      );
      if (!text) return null;
      // Gộp về một dòng và cắt độ dài để giao diện hiển thị gọn.
      const cleaned = text.replace(/\s+/g, ' ').trim();
      return cleaned ? cleaned.slice(0, 400) : null;
    } catch (error) {
      this.logger.warn(
        `Merge-risk explanation failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  /** Id các nốt bị thêm / xoá / sửa giữa `base` và `side`. */
  private touchedNoteIds(
    base: DraftSnapshot,
    side: DraftSnapshot,
  ): Set<string> {
    const touched = new Set<string>();
    const baseNotes = new Map(base.notes.map((n) => [n.id, n]));
    const sideNotes = new Map(side.notes.map((n) => [n.id, n]));

    for (const note of side.notes) {
      const before = baseNotes.get(note.id);
      if (!before || !this.sameNote(before, note)) touched.add(note.id);
    }
    for (const note of base.notes) {
      if (!sideNotes.has(note.id)) touched.add(note.id);
    }
    return touched;
  }

  /** Hai nốt có cùng nội dung hay không — theo đúng tiêu chí của diff.service. */
  private sameNote(a: DraftNote, b: DraftNote): boolean {
    return (
      a.pitch === b.pitch &&
      a.start === b.start &&
      a.duration === b.duration &&
      a.velocity === b.velocity &&
      a.trackId === b.trackId
    );
  }

  /**
   * Số commit của nhánh kể từ `baseCommitId` trở đi, đi ngược chuỗi
   * `parent_commit_id` (và `merged_from_commit_id`).
   */
  private async countCommitsSince(
    headCommitId: string | null,
    baseCommitId: string,
  ): Promise<number> {
    if (!headCommitId) return 0;
    if (headCommitId === baseCommitId) return 0;

    const { data, error } = await this.supabase.rpc('commit_ancestry', {
      p_heads: [headCommitId],
      p_limit: 2000,
    });
    if (error) {
      this.logger.warn(`Failed to read ancestry: ${error.message}`);
      return 0;
    }

    const rows = (data ?? []) as Array<{
      id: string;
      parent_commit_id: string | null;
      merged_from_commit_id: string | null;
    }>;
    const parents = new Map<string, string[]>();
    for (const row of rows) {
      parents.set(
        row.id,
        [row.parent_commit_id, row.merged_from_commit_id].filter(
          (id): id is string => !!id,
        ),
      );
    }

    // Đếm các commit đi từ head về gốc, dừng khi gặp điểm gốc chung.
    const seen = new Set<string>();
    const queue = [headCommitId];
    let count = 0;
    while (queue.length > 0) {
      const id = queue.shift()!;
      if (seen.has(id)) continue;
      seen.add(id);
      if (id === baseCommitId) continue;
      count++;
      for (const parent of parents.get(id) ?? []) queue.push(parent);
    }
    return count;
  }

  private async getBranch(branchId: string): Promise<BranchDbRow | null> {
    const { data } = await this.supabase
      .from('branches')
      .select('*')
      .eq('id', branchId)
      .single();
    return data as BranchDbRow | null;
  }

  private async getCommitSnapshot(
    commitId: string | null,
  ): Promise<DraftSnapshot | null> {
    if (!commitId) return null;
    const { data } = await this.supabase
      .from('commits')
      .select('snapshot')
      .eq('id', commitId)
      .single();
    return data?.snapshot ?? null;
  }
}
