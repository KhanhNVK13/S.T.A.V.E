import { Injectable, Logger } from '@nestjs/common';
import { GM_INSTRUMENT_NAMES } from '@stave/shared-types';
import { MAX_INSTRUMENT_FILTERS } from '../projects/dto/public-projects-query.dto';
import { PROJECT_GENRES } from '../projects/project-genres';
import { AiRateLimiter } from './ai-rate-limiter';
import type { SuggestionLang } from './commit-message.service';
import { GeminiClient } from './gemini-client';

export type ExploreSearchSource = 'ai' | 'rule';

export interface ExploreSearchResult {
  instruments: string[];
  genre: string | null;
  tempoMin: number | null;
  tempoMax: number | null;
  mode: 'major' | 'minor' | null;
  search: string | null;
  explanation: string;
  source: ExploreSearchSource;
}

const MIN_BPM = 20;
const MAX_BPM = 300;
const MAX_SEARCH_LENGTH = 80;
const MAX_EXPLANATION_LENGTH = 240;

const GM_BY_LOWER = new Map<string, string>(
  GM_INSTRUMENT_NAMES.map((name) => [name.toLowerCase(), name]),
);

const GENRE_BY_LOWER = new Map<string, string>(
  PROJECT_GENRES.map((genre) => [genre.toLowerCase(), genre]),
);

const INSTRUMENT_ALIASES: Array<{ pattern: RegExp; gmName: string }> = [
  { pattern: /electric grand piano/giu, gmName: 'Electric Grand Piano' },
  {
    pattern: /(?:electric piano|rhodes|e-?piano)/giu,
    gmName: 'Electric Piano 1',
  },
  { pattern: /bright(?: acoustic)? piano/giu, gmName: 'Bright Acoustic Piano' },
  {
    pattern:
      /(?:acoustic grand piano|acoustic piano|dương cầm|duong cam|piano)/giu,
    gmName: 'Acoustic Grand Piano',
  },
  { pattern: /distortion guitar/giu, gmName: 'Distortion Guitar' },
  { pattern: /overdriven guitar/giu, gmName: 'Overdriven Guitar' },
  { pattern: /jazz guitar/giu, gmName: 'Electric Guitar (jazz)' },
  {
    pattern: /(?:electric guitar|guitar điện|guitar dien)/giu,
    gmName: 'Electric Guitar (clean)',
  },
  {
    pattern: /(?:acoustic guitar|guitar gỗ|guitar go|guitar mộc|guitar moc)/giu,
    gmName: 'Acoustic Guitar (nylon)',
  },
  { pattern: /guitar/giu, gmName: 'Acoustic Guitar (nylon)' },
  { pattern: /synth bass/giu, gmName: 'Synth Bass 1' },
  { pattern: /slap bass/giu, gmName: 'Slap Bass 1' },
  { pattern: /fretless bass/giu, gmName: 'Fretless Bass' },
  { pattern: /(?:acoustic bass|upright bass)/giu, gmName: 'Acoustic Bass' },
  { pattern: /bass/giu, gmName: 'Electric Bass (finger)' },
  { pattern: /(?:violin|vĩ cầm|vi cam)/giu, gmName: 'Violin' },
  { pattern: /viola/giu, gmName: 'Viola' },
  { pattern: /cello/giu, gmName: 'Cello' },
  {
    pattern: /(?:string ensemble|strings|dàn dây|dan day|đàn dây)/giu,
    gmName: 'String Ensemble 1',
  },
  { pattern: /orchestra(?:l)?(?: drum)? kit/giu, gmName: 'Orchestra Drum Kit' },
  {
    pattern:
      /(?:drum kit|drums|drum|bộ trống|bo trong|trống|trong|percussion)/giu,
    gmName: 'Standard Drum Kit',
  },
  { pattern: /(?:trumpet|kèn trumpet)/giu, gmName: 'Trumpet' },
  { pattern: /trombone/giu, gmName: 'Trombone' },
  { pattern: /(?:brass|kèn đồng|ken dong)/giu, gmName: 'Brass Section' },
  { pattern: /(?:saxophone|sax)/giu, gmName: 'Alto Sax' },
  { pattern: /clarinet/giu, gmName: 'Clarinet' },
  { pattern: /oboe/giu, gmName: 'Oboe' },
  { pattern: /(?:flute|sáo|sao)/giu, gmName: 'Flute' },
  { pattern: /(?:harp|đàn hạc|dan hac)/giu, gmName: 'Orchestral Harp' },
  { pattern: /organ/giu, gmName: 'Drawbar Organ' },
  { pattern: /(?:choir|hợp xướng|hop xuong)/giu, gmName: 'Choir Aahs' },
  { pattern: /(?:synth pad|pad)/giu, gmName: 'Pad 2 (warm)' },
  { pattern: /(?:synth lead|lead)/giu, gmName: 'Lead 2 (sawtooth)' },
  { pattern: /(?:synthesizer|synth)/giu, gmName: 'Pad 2 (warm)' },
  { pattern: /marimba/giu, gmName: 'Marimba' },
  { pattern: /vibraphone/giu, gmName: 'Vibraphone' },
  { pattern: /kalimba/giu, gmName: 'Kalimba' },
];

const GENRE_ALIASES: Array<{ pattern: RegExp; genre: string }> = [
  { pattern: /lo-?fi/giu, genre: 'Lo-Fi' },
  { pattern: /(?:hip-?hop|hip hop|rap)/giu, genre: 'Hip-Hop' },
  { pattern: /(?:r&b|rnb|soul)/giu, genre: 'R&B / Soul' },
  { pattern: /(?:electronic|edm)/giu, genre: 'Electronic / EDM' },
  { pattern: /(?:drum\s*&\s*bass|drum and bass|dnb)/giu, genre: 'Drum & Bass' },
  {
    pattern: /(?:soundtrack|cinematic|nhạc phim|nhac phim)/giu,
    genre: 'Soundtrack / Cinematic',
  },
  { pattern: /(?:folk|nhạc mộc|nhac moc)/giu, genre: 'Folk / Acoustic' },
  {
    pattern:
      /(?:world|traditional|dân tộc|dan toc|truyền thống|truyen thong)/giu,
    genre: 'World / Traditional',
  },
  { pattern: /(?:classical|cổ điển|co dien)/giu, genre: 'Classical' },
  { pattern: /(?:orchestral|giao hưởng|giao huong)/giu, genre: 'Orchestral' },
  { pattern: /(?:bossa nova|bossa)/giu, genre: 'Bossa Nova' },
  { pattern: /synthwave/giu, genre: 'Synthwave' },
  { pattern: /alternative/giu, genre: 'Alternative' },
  { pattern: /dubstep/giu, genre: 'Dubstep' },
  { pattern: /ambient/giu, genre: 'Ambient' },
  { pattern: /country/giu, genre: 'Country' },
  { pattern: /techno/giu, genre: 'Techno' },
  { pattern: /trance/giu, genre: 'Trance' },
  { pattern: /reggae/giu, genre: 'Reggae' },
  { pattern: /gospel/giu, genre: 'Gospel' },
  { pattern: /house/giu, genre: 'House' },
  { pattern: /blues/giu, genre: 'Blues' },
  { pattern: /disco/giu, genre: 'Disco' },
  { pattern: /indie/giu, genre: 'Indie' },
  { pattern: /metal/giu, genre: 'Metal' },
  { pattern: /latin/giu, genre: 'Latin' },
  { pattern: /jazz/giu, genre: 'Jazz' },
  { pattern: /rock/giu, genre: 'Rock' },
  { pattern: /funk/giu, genre: 'Funk' },
  { pattern: /punk/giu, genre: 'Punk' },
  { pattern: /trap/giu, genre: 'Trap' },
  { pattern: /pop/giu, genre: 'Pop' },
];

const BOUNDARY_START = '(?:^|[\\s,.;:!?/()[\\]"\'])';
const BOUNDARY_END = '(?=$|[\\s,.;:!?/()[\\]"\'])';

const MINOR_TERMS =
  '(?:minor|giọng thứ|giong thu|thứ|thu|buồn|buon|sad|melancholy|melancholic|dark|somber)';
const MAJOR_TERMS =
  '(?:major|giọng trưởng|giong truong|trưởng|truong|vui|happy|bright|cheerful|upbeat)';
const SLOW_TERMS = '(?:chậm|cham|slow|ballad|downtempo|relaxed|calm)';
const FAST_TERMS = '(?:nhanh|fast|uptempo|energetic|sôi động|soi dong|driving)';

const STOP_WORDS = new Set([
  'với',
  'voi',
  'cùng',
  'cung',
  'có',
  'co',
  'và',
  'va',
  'hay',
  'hoặc',
  'hoac',
  'nhạc',
  'nhac',
  'bài',
  'bai',
  'bản',
  'ban',
  'dự',
  'án',
  'tìm',
  'tim',
  'kiếm',
  'kiem',
  'giọng',
  'giong',
  'nhịp',
  'nhip',
  'tốc',
  'độ',
  'nhạc',
  'cụ',
  'thể',
  'loại',
  'cho',
  'từ',
  'đến',
  'ở',
  'trong',
  'with',
  'and',
  'or',
  'for',
  'in',
  'at',
  'by',
  'of',
  'the',
  'a',
  'an',
  'music',
  'song',
  'songs',
  'track',
  'tracks',
  'project',
  'projects',
  'find',
  'search',
  'tempo',
  'key',
  'mode',
  'bpm',
]);

function clampBpm(value: number): number | null {
  if (!Number.isFinite(value)) return null;
  const rounded = Math.round(value);
  if (rounded < MIN_BPM || rounded > MAX_BPM) return null;
  return rounded;
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildBoundaryRegex(innerSource: string, flags = 'giu'): RegExp {
  return new RegExp(
    `(${BOUNDARY_START})(${innerSource})(?=${BOUNDARY_END})`,
    flags,
  );
}

function consumeMatches(
  text: string,
  regex: RegExp,
  onMatch: (match: RegExpMatchArray) => void,
  preserveLeadingGroup = false,
): string {
  const globalFlags = regex.flags.includes('g')
    ? regex.flags
    : `${regex.flags}g`;
  const re = new RegExp(regex.source, globalFlags);
  let output = '';
  let lastIndex = 0;
  for (const m of text.matchAll(re)) {
    const idx = m.index ?? 0;
    output += text.slice(lastIndex, idx);
    onMatch(m);
    output += preserveLeadingGroup && m[1] ? `${m[1]} ` : ' ';
    lastIndex = idx + m[0].length;
  }
  output += text.slice(lastIndex);
  return output;
}

export function buildObjectiveExplanation(
  filters: Omit<ExploreSearchResult, 'explanation' | 'source'>,
  lang: SuggestionLang,
): string {
  const parts: string[] = [];
  if (filters.instruments.length > 0) {
    parts.push(filters.instruments.join(', '));
  }
  if (filters.genre) {
    parts.push(filters.genre);
  }
  if (filters.mode) {
    parts.push(
      lang === 'vi'
        ? filters.mode === 'minor'
          ? 'giọng thứ'
          : 'giọng trưởng'
        : filters.mode === 'minor'
          ? 'Minor mode'
          : 'Major mode',
    );
  }
  if (filters.tempoMin !== null && filters.tempoMax !== null) {
    parts.push(`${filters.tempoMin}–${filters.tempoMax} BPM`);
  } else if (filters.tempoMin !== null) {
    parts.push(`>= ${filters.tempoMin} BPM`);
  } else if (filters.tempoMax !== null) {
    parts.push(`<= ${filters.tempoMax} BPM`);
  }
  if (filters.search) {
    parts.push(
      lang === 'vi'
        ? `từ khóa: ${filters.search}`
        : `keyword: ${filters.search}`,
    );
  }

  if (parts.length === 0) {
    return lang === 'vi'
      ? 'Không trích xuất được bộ lọc cụ thể.'
      : 'No specific musical filters extracted.';
  }

  return lang === 'vi'
    ? `Đã chuyển truy vấn thành bộ lọc kỹ thuật: ${parts.join(' · ')}.`
    : `Mapped query to objective filters: ${parts.join(' · ')}.`;
}

export function parseExploreQueryRuleBased(
  query: string,
  lang: SuggestionLang = 'vi',
): ExploreSearchResult {
  let working = query.trim();
  let tempoMin: number | null = null;
  let tempoMax: number | null = null;
  let mode: 'major' | 'minor' | null = null;
  let genre: string | null = null;
  const instruments: string[] = [];

  const addInstrument = (gmName: string) => {
    if (
      GM_BY_LOWER.has(gmName.toLowerCase()) &&
      !instruments.includes(gmName) &&
      instruments.length < MAX_INSTRUMENT_FILTERS
    ) {
      instruments.push(gmName);
    }
  };

  // 1. BPM range: "80-110 bpm", "từ 80 đến 110 bpm"
  working = consumeMatches(
    working,
    /(?:từ|tu|between|from)?\s*(\d{2,3})\s*(?:-|–|~|to|đến|den|and)\s*(\d{2,3})\s*(?:bpm)?/giu,
    (m) => {
      const a = clampBpm(Number(m[1]));
      const b = clampBpm(Number(m[2]));
      if (a !== null && b !== null) {
        tempoMin = Math.min(a, b);
        tempoMax = Math.max(a, b);
      }
    },
  );

  // 2. Upper BPM bound: "dưới 85 BPM", "under 90 bpm", "<= 100 bpm"
  working = consumeMatches(
    working,
    /(?:dưới|duoi|under|below|less\s+than|max|tối\s*đa|toi\s*da|<=|<)\s*(\d{2,3})\s*(?:bpm)?/giu,
    (m) => {
      const bpm = clampBpm(Number(m[1]));
      if (bpm !== null) tempoMax = bpm;
    },
  );
  working = consumeMatches(
    working,
    /(\d{2,3})\s*bpm\s*(?:or\s*less|or\s*lower|trở\s*xuống|tro\s*xuong)/giu,
    (m) => {
      const bpm = clampBpm(Number(m[1]));
      if (bpm !== null) tempoMax = bpm;
    },
  );

  // 3. Lower BPM bound: "trên 120 BPM", "> 120 bpm", ">= 120 bpm"
  working = consumeMatches(
    working,
    /(?:trên|tren|over|above|more\s+than|min|tối\s*thiểu|toi\s*thieu|>=|>)\s*(\d{2,3})\s*(?:bpm)?/giu,
    (m) => {
      const bpm = clampBpm(Number(m[1]));
      if (bpm !== null) tempoMin = bpm;
    },
  );
  working = consumeMatches(
    working,
    /(\d{2,3})\s*bpm\s*(?:or\s*more|or\s*higher|trở\s*lên|tro\s*len|\+)/giu,
    (m) => {
      const bpm = clampBpm(Number(m[1]));
      if (bpm !== null) tempoMin = bpm;
    },
  );

  // 4. Single explicit BPM: "at 120 bpm", "khoảng 95 bpm"
  if (tempoMin === null && tempoMax === null) {
    working = consumeMatches(
      working,
      /(?:around|about|khoảng|khoang|at|tempo)?\s*(\d{2,3})\s*bpm/giu,
      (m) => {
        const bpm = clampBpm(Number(m[1]));
        if (bpm !== null) {
          tempoMin = Math.max(MIN_BPM, bpm - 10);
          tempoMax = Math.min(MAX_BPM, bpm + 10);
        }
      },
    );
  }

  // 5. Mode hints (minor / major)
  let sawMinor = false;
  let sawMajor = false;
  working = consumeMatches(
    working,
    buildBoundaryRegex(MINOR_TERMS),
    () => {
      sawMinor = true;
    },
    true,
  );
  working = consumeMatches(
    working,
    buildBoundaryRegex(MAJOR_TERMS),
    () => {
      sawMajor = true;
    },
    true,
  );
  if (sawMinor && !sawMajor) mode = 'minor';
  else if (sawMajor && !sawMinor) mode = 'major';

  // 6. Slow / fast tempo hints (only when explicit numeric BPM didn't set that bound)
  working = consumeMatches(
    working,
    buildBoundaryRegex(SLOW_TERMS),
    () => {
      if (tempoMax === null) tempoMax = 90;
    },
    true,
  );
  working = consumeMatches(
    working,
    buildBoundaryRegex(FAST_TERMS),
    () => {
      if (tempoMin === null) tempoMin = 125;
    },
    true,
  );
  if (tempoMin !== null && tempoMax !== null && tempoMin > tempoMax) {
    [tempoMin, tempoMax] = [tempoMax, tempoMin];
  }

  // 7. Exact GM instrument names (longest first)
  const sortedGm = [...GM_INSTRUMENT_NAMES].sort((a, b) => b.length - a.length);
  for (const gmName of sortedGm) {
    if (working.toLowerCase().includes(gmName.toLowerCase())) {
      const exactRe = buildBoundaryRegex(escapeRegExp(gmName));
      working = consumeMatches(
        working,
        exactRe,
        () => addInstrument(gmName),
        true,
      );
    }
  }

  // 8. Bilingual instrument aliases
  for (const alias of INSTRUMENT_ALIASES) {
    working = consumeMatches(
      working,
      buildBoundaryRegex(alias.pattern.source),
      () => addInstrument(alias.gmName),
      true,
    );
  }

  // 9. Genres
  for (const alias of GENRE_ALIASES) {
    working = consumeMatches(
      working,
      buildBoundaryRegex(alias.pattern.source),
      () => {
        if (!genre) genre = alias.genre;
      },
      true,
    );
  }

  // 10. Remaining meaningful keywords (if any)
  const remainingTokens = working
    .replace(/[,.;:!?/()[\]"']/g, ' ')
    .split(/\s+/)
    .map((tok) => tok.trim())
    .filter((tok) => tok.length > 1 && !STOP_WORDS.has(tok.toLowerCase()));

  const hasStructuredFilters =
    instruments.length > 0 ||
    genre !== null ||
    tempoMin !== null ||
    tempoMax !== null ||
    mode !== null;

  const searchRaw =
    remainingTokens.length > 0
      ? remainingTokens.join(' ')
      : hasStructuredFilters
        ? ''
        : query.trim();
  const search =
    searchRaw.length > 0 ? searchRaw.slice(0, MAX_SEARCH_LENGTH).trim() : null;

  const base = {
    instruments,
    genre,
    tempoMin,
    tempoMax,
    mode,
    search,
  };

  return {
    ...base,
    explanation: buildObjectiveExplanation(base, lang),
    source: 'rule',
  };
}

export function parseExploreAiJson(
  raw: string | null,
  lang: SuggestionLang = 'vi',
): Omit<ExploreSearchResult, 'source'> | null {
  if (!raw) return null;
  const stripped = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  const start = stripped.indexOf('{');
  const end = stripped.lastIndexOf('}');
  if (start < 0 || end <= start) return null;

  try {
    const parsed = JSON.parse(stripped.slice(start, end + 1)) as {
      instruments?: unknown;
      genre?: unknown;
      tempoMin?: unknown;
      tempoMax?: unknown;
      mode?: unknown;
      search?: unknown;
      explanation?: unknown;
    };

    const instruments: string[] = [];
    if (Array.isArray(parsed.instruments)) {
      for (const entry of parsed.instruments) {
        if (typeof entry !== 'string') continue;
        const canonical = GM_BY_LOWER.get(entry.trim().toLowerCase());
        if (canonical && !instruments.includes(canonical)) {
          instruments.push(canonical);
          if (instruments.length >= MAX_INSTRUMENT_FILTERS) break;
        }
      }
    }

    const genre =
      typeof parsed.genre === 'string'
        ? (GENRE_BY_LOWER.get(parsed.genre.trim().toLowerCase()) ?? null)
        : null;

    let tempoMin =
      typeof parsed.tempoMin === 'number' ? clampBpm(parsed.tempoMin) : null;
    let tempoMax =
      typeof parsed.tempoMax === 'number' ? clampBpm(parsed.tempoMax) : null;
    if (tempoMin !== null && tempoMax !== null && tempoMin > tempoMax) {
      [tempoMin, tempoMax] = [tempoMax, tempoMin];
    }

    const modeRaw =
      typeof parsed.mode === 'string' ? parsed.mode.trim().toLowerCase() : null;
    const mode: 'major' | 'minor' | null =
      modeRaw === 'major' || modeRaw === 'minor' ? modeRaw : null;

    const search =
      typeof parsed.search === 'string' && parsed.search.trim().length > 0
        ? parsed.search.trim().slice(0, MAX_SEARCH_LENGTH)
        : null;

    if (
      instruments.length === 0 &&
      genre === null &&
      tempoMin === null &&
      tempoMax === null &&
      mode === null &&
      search === null
    ) {
      return null;
    }

    const cleanedExplanation =
      typeof parsed.explanation === 'string'
        ? parsed.explanation
            .replace(/["“”«»]/g, '')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, MAX_EXPLANATION_LENGTH)
        : '';

    const base = {
      instruments,
      genre,
      tempoMin,
      tempoMax,
      mode,
      search,
    };

    return {
      ...base,
      explanation:
        cleanedExplanation.length > 0
          ? cleanedExplanation
          : buildObjectiveExplanation(base, lang),
    };
  } catch {
    return null;
  }
}

const EXPLORE_PARSE_PROMPTS: Record<SuggestionLang, string> = {
  vi:
    'Bạn chuyển truy vấn tìm kiếm dự án MIDI sang bộ lọc kỹ thuật khách quan cho trang Explore. ' +
    'CHỈ trả về ĐÚNG MỘT JSON hợp lệ dạng: ' +
    '{"instruments": string[], "genre": string|null, "tempoMin": number|null, "tempoMax": number|null, "mode": "major"|"minor"|null, "search": string|null, "explanation": string}. ' +
    'Quy tắc: ' +
    '1) instruments: tối đa 5 tên nhạc cụ CHÍNH XÁC trong danh sách GM cho phép. ' +
    '2) genre: CHÍNH XÁC 1 thể loại trong danh sách thể loại cho phép hoặc null. ' +
    '3) tempoMin/tempoMax: số nguyên trong [20, 300] hoặc null (ví dụ chậm <= 90, nhanh >= 125). ' +
    '4) mode: "major", "minor", hoặc null (chỉ gán khi truy vấn gợi ý rõ điệu trưởng/thứ). ' +
    '5) search: từ khóa tên dự án còn lại nếu có, ngược lại null (không lặp lại từ khóa bộ lọc). ' +
    '6) explanation: 1 câu tiếng Việt ngắn giải thích các thông số khách quan đã ánh xạ; KHÔNG phán xét chất lượng hay khẳng định cảm xúc như sự thật. ',
  en:
    'You translate a MIDI project search query into objective technical filters for the Explore page. ' +
    'Return EXACTLY ONE valid JSON object: ' +
    '{"instruments": string[], "genre": string|null, "tempoMin": number|null, "tempoMax": number|null, "mode": "major"|"minor"|null, "search": string|null, "explanation": string}. ' +
    'Rules: ' +
    '1) instruments: up to 5 EXACT names from the allowed GM list. ' +
    '2) genre: EXACTLY 1 value from the allowed genre list or null. ' +
    '3) tempoMin/tempoMax: integer in [20, 300] or null (e.g. slow <= 90, fast >= 125). ' +
    '4) mode: "major", "minor", or null. ' +
    '5) search: remaining project-title keywords only, otherwise null (do not echo filter words). ' +
    '6) explanation: 1 concise English sentence explaining the objective filter mapping; NEVER claim artistic quality or state subjective emotion as fact. ',
};

@Injectable()
export class ExploreSearchService {
  private readonly logger = new Logger(ExploreSearchService.name);

  constructor(
    private readonly gemini: GeminiClient,
    private readonly rateLimiter: AiRateLimiter,
  ) {}

  async parse(
    userId: string,
    query: string,
    lang: SuggestionLang = 'vi',
  ): Promise<ExploreSearchResult> {
    const trimmed = query.trim().slice(0, 200);
    const ruleFallback = parseExploreQueryRuleBased(trimmed, lang);

    if (!trimmed) {
      return ruleFallback;
    }

    if (!this.rateLimiter.tryConsume(userId)) {
      return ruleFallback;
    }

    try {
      const prompt =
        `${EXPLORE_PARSE_PROMPTS[lang]}\n` +
        `Allowed genres: ${JSON.stringify(PROJECT_GENRES)}\n` +
        `Allowed GM instruments: ${JSON.stringify(GM_INSTRUMENT_NAMES)}\n` +
        `User query: ${JSON.stringify(trimmed)}`;

      const raw = await this.gemini.generateText(prompt);
      const parsed = parseExploreAiJson(raw, lang);
      if (!parsed) {
        return ruleFallback;
      }
      return {
        ...parsed,
        source: 'ai',
      };
    } catch (err) {
      this.logger.warn(
        `Explore search AI parse failed, falling back to rules: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return ruleFallback;
    }
  }
}
