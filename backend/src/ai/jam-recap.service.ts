import { Injectable, Logger } from '@nestjs/common';
import { JamService } from '../jam/jam.service';
import { AiRateLimiter } from './ai-rate-limiter';
import type { SuggestionLang } from './commit-message.service';
import { GeminiClient } from './gemini-client';
import { analyzeTheory } from './theory-analysis';

export interface JamRecapStats {
  eventName: string;
  contributorCount: number;
  totalActions: number;
  topContributors: Array<{ name: string; actionCount: number }>;
  noteCount: number;
  trackCount: number;
  instruments: string[];
  tempo: number;
  timeSignature: [number, number];
  totalBars: number;
  key: string | null;
}

export interface JamRecapResult {
  recap: string | null;
  stats: JamRecapStats | null;
}

const MAX_CACHE_ENTRIES = 100;
const RECAP_MAX_LENGTH = 600;

function cleanName(value: string | null | undefined): string {
  const cleaned = (value ?? 'Participant').replace(/\s+/g, ' ').trim();
  return cleaned.length > 40
    ? `${cleaned.slice(0, 39)}…`
    : cleaned || 'Participant';
}

const JAM_RECAP_PROMPTS: Record<SuggestionLang, string> = {
  vi:
    'Bạn tóm tắt khách quan kết quả một phiên sáng tác chung (Community Jam) đã kết thúc dựa trên JSON bên dưới. ' +
    'Hãy viết 2 đến 3 câu tiếng Việt ngắn gọn nêu tên sự kiện, số người tham gia/lượt đóng góp, nhịp/tempo/nhạc cụ và giọng nếu có. ' +
    'Không bình luận hay/dở, không bịa cảm xúc, không dùng dấu ngoặc kép. ',
  en:
    'You objectively summarize a finished Community Jam session using only the JSON below. ' +
    'Write 2 to 3 concise English sentences stating the event name, contributor/action counts, tempo/time signature/instruments, and key if present. ' +
    'Do not judge artistic quality, invent emotions, or use quotation marks. ',
};

@Injectable()
export class JamRecapService {
  private readonly logger = new Logger(JamRecapService.name);
  private readonly cache = new Map<string, JamRecapResult>();

  constructor(
    private readonly jam: JamService,
    private readonly gemini: GeminiClient,
    private readonly rateLimiter: AiRateLimiter,
  ) {}

  async recap(
    userId: string,
    eventId: string,
    lang: SuggestionLang = 'vi',
  ): Promise<JamRecapResult> {
    const cacheKey = `jam:${eventId}:${lang}`;
    const hit = this.cache.get(cacheKey);
    if (hit) {
      this.cache.delete(cacheKey);
      this.cache.set(cacheKey, hit);
      return hit;
    }

    const jamResult = await this.jam.getJamResult(eventId);
    if (
      !jamResult.hasContributions ||
      !jamResult.snapshot ||
      jamResult.snapshot.notes.length === 0
    ) {
      return { recap: null, stats: null };
    }

    const theory = analyzeTheory(jamResult.snapshot);
    const contributors = [...jamResult.contributors].sort(
      (a, b) => b.actionCount - a.actionCount,
    );
    const instruments = [
      ...new Set(
        (jamResult.snapshot.tracks ?? [])
          .map((t) => t.instrument?.trim())
          .filter((name): name is string => !!name && name.length > 0),
      ),
    ].slice(0, 10);

    const stats: JamRecapStats = {
      eventName: cleanName(jamResult.name),
      contributorCount: contributors.length,
      totalActions: contributors.reduce((sum, c) => sum + c.actionCount, 0),
      topContributors: contributors.slice(0, 3).map((c) => ({
        name: cleanName(c.displayName ?? c.username),
        actionCount: c.actionCount,
      })),
      noteCount: jamResult.snapshot.notes.length,
      trackCount: jamResult.snapshot.tracks.length,
      instruments,
      tempo: theory.profile.tempo,
      timeSignature: theory.profile.timeSignature,
      totalBars: theory.profile.totalBars,
      key: theory.tonality
        ? `${theory.tonality.tonic} ${theory.tonality.mode}`
        : null,
    };

    let recap: string | null = null;
    if (this.rateLimiter.tryConsume(userId)) {
      try {
        const raw = await this.gemini.generateText(
          `${JAM_RECAP_PROMPTS[lang]}\n${JSON.stringify(stats)}`,
        );
        const cleaned =
          raw
            ?.replace(/["“”«»]/g, '')
            .replace(/\s+/g, ' ')
            .trim() ?? '';
        recap = cleaned ? cleaned.slice(0, RECAP_MAX_LENGTH).trim() : null;
      } catch (err) {
        this.logger.warn(
          `Jam recap failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    const result: JamRecapResult = { recap, stats };
    if (recap !== null) {
      this.cache.set(cacheKey, result);
      if (this.cache.size > MAX_CACHE_ENTRIES) {
        const oldest = this.cache.keys().next().value;
        if (oldest !== undefined) this.cache.delete(oldest);
      }
    }
    return result;
  }
}
