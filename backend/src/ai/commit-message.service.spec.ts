import { CommitMessageService } from './commit-message.service';
import type { GeminiClient } from './gemini-client';
import { AiRateLimiter } from './ai-rate-limiter';
import type { ProjectAccessService } from '../project-access/project-access.service';
import type { ProjectsService } from '../projects/projects.service';
import type { DraftsService } from '../drafts/drafts.service';
import { DiffService } from '../commits/diff.service';
import {
  createSupabaseMock,
  type QueryResult,
} from '../test-utils/supabase-mock';
import type { DraftSnapshot, DraftTrack, DraftNote } from '@stave/shared-types';

// ============================================================================
// SHEET: BE-AI-01 (UC-70 CommitMessageService.suggest)
// ============================================================================

const PROJECT = 'p-1';
const USER = 'u-1';

const ACTIVE_BRANCH = {
  id: 'b-active',
  project_id: PROJECT,
  name: 'main',
  is_default: true,
  created_by: USER,
  created_at: '2026-11-01T00:00:00Z',
  base_commit_id: null,
  head_commit_id: 'c-head',
};

function snapshot(overrides: Partial<DraftSnapshot> = {}): DraftSnapshot {
  return {
    schemaVersion: 1,
    meta: { tempo: 120, timeSignature: [4, 4], ppq: 480 },
    tracks: [track('t1', 'Piano')],
    notes: [],
    ...overrides,
  };
}

function track(id: string, name: string): DraftTrack {
  return {
    id,
    name,
    order: 0,
    color: '#222',
    volume: 0.8,
    pan: 0,
    muted: false,
    solo: false,
    instrument: null,
  };
}

function note(
  id: string,
  trackId = 't1',
  start = 0,
  overrides: Partial<DraftNote> = {},
): DraftNote {
  return {
    id,
    trackId,
    pitch: 60,
    start,
    duration: 480,
    velocity: 100,
    ...overrides,
  };
}

interface BuildOptions {
  /** Snapshot of the head commit (`commits` table). */
  head: DraftSnapshot | null;
  /** The caller's current draft. */
  draft: DraftSnapshot;
  /** Rows for `branches` lookups (used when the box is on another branch). */
  branchRows?: QueryResult[];
  /** How many `commits` rows to queue (default 1; the rate-limit test
   * needs one per call since every suggest() re-reads the head). */
  commitsRowCount?: number;
  gemini?: jest.Mock;
  draftFactory?: jest.Mock;
  access?: jest.Mock;
  activeBranch?: QueryResult;
}

function buildService(options: BuildOptions) {
  const gemini = options.gemini ?? jest.fn().mockResolvedValue('Gợi ý mẫu');
  const access = options.access ?? jest.fn();
  const projects = jest.fn(() =>
    options.activeBranch !== undefined
      ? options.activeBranch.data
      : ACTIVE_BRANCH,
  );
  const draftFactory = options.draftFactory ?? jest.fn(() => options.draft);

  const commitsRows: QueryResult[] = Array.from(
    { length: options.commitsRowCount ?? 1 },
    () => ({ data: { snapshot: options.head }, error: null }),
  );
  const tables: Record<string, QueryResult[]> = {
    commits: commitsRows,
    branches: options.branchRows ?? [],
  };
  const mock = createSupabaseMock([], { tables });

  const service = new CommitMessageService(
    { generateText: gemini } as unknown as GeminiClient,
    new AiRateLimiter(),
    { assertCanEdit: access } as unknown as ProjectAccessService,
    { getActiveBranchForUser: projects } as unknown as ProjectsService,
    { getDraft: draftFactory } as unknown as DraftsService,
    new DiffService(),
    mock.client,
  );

  return { service, mock, gemini, access, projects, draftFactory };
}

function headWith(overrides: Partial<DraftSnapshot> = {}) {
  return { ...snapshot(), ...overrides };
}

describe('BE-AI-01 CommitMessageService.suggest (UC-70)', () => {
  it('builds a suggestion from the server-side diff and sends only the summary (BR-80)', async () => {
    const { service, gemini } = buildService({
      head: headWith({
        tracks: [track('t1', 'Piano')],
        notes: [note('n1')],
      }),
      draft: headWith({
        tracks: [track('t1', 'Piano'), track('t2', 'Bass')],
        notes: [
          note('n1', 't1', 0, { velocity: 120 }), // modified, bar 1
          note('n2', 't2', 0), // added ON the new track -> 3.E2 bucket
          note('n3', 't1', 3840), // added on the old track, bar 3
        ],
      }),
    });

    const result = await service.suggest(PROJECT, null, USER);
    expect(result.suggestion).toBe('Gợi ý mẫu');

    const [prompt] = gemini.mock.calls[0];
    expect(prompt.startsWith('Bạn viết lời nhắn commit')).toBe(true);
    const json = prompt.slice(prompt.lastIndexOf(' {'));
    const summary = JSON.parse(json) as Record<string, unknown>;
    // Only counts + track names + bars + tempo. n2 (on the new track) is
    // counted on the track (3.E2), not as a loose added note.
    expect(summary).toMatchObject({
      notesAdded: 1,
      notesModified: 1,
      notesRemoved: 0,
      tracksAdded: ['Bass'],
      tracksRemoved: [],
      barsRange: [1, 3],
      tempoChange: null,
    });
    const flat = JSON.stringify(prompt);
    expect(flat).not.toContain('"pitch"'); // no note data
    expect(flat).not.toContain('u-1'); // no user ids
    expect(flat).not.toContain('email'); // no personal data
  });

  it('includes the tempo change in the summary when meta changed', async () => {
    const { service, gemini } = buildService({
      head: headWith(),
      draft: snapshot({
        meta: { tempo: 128, timeSignature: [4, 4], ppq: 480 },
        notes: [note('n1')],
      }),
    });
    await service.suggest(PROJECT, null, USER);
    const summary = JSON.parse(
      gemini.mock.calls[0][0].slice(
        (gemini.mock.calls[0][0] as string).lastIndexOf(' {'),
      ) as string,
    ) as { tempoChange: { from: number; to: number } | null };
    expect(summary.tempoChange).toEqual({ from: 120, to: 128 });
  });

  it('skips the AI and returns the code-generated sentence for a huge diff (1.E1)', async () => {
    const bigDraft = snapshot({
      notes: Array.from({ length: 301 }, (_, i) =>
        note(`n${i}`, 't1', i * 480),
      ),
    });
    const { service, gemini } = buildService({
      head: headWith(),
      draft: bigDraft,
    });
    const result = await service.suggest(PROJECT, null, USER);
    expect(result.suggestion).toBe('Cập nhật lớn: 301 nốt, 0 track thay đổi');
    expect(gemini).not.toHaveBeenCalled();
  });

  it('skips the AI when more than 5 tracks changed (1.E1)', async () => {
    const manyTracks = snapshot({
      tracks: [
        track('t1', 'Piano'),
        ...Array.from({ length: 6 }, (_, i) =>
          track(`t${i + 2}`, `Track ${i + 2}`),
        ),
      ],
      // 6 new notes on the pre-existing track (so they are counted as
      // notes, not as "the track added with its notes" per 3.E2).
      notes: Array.from({ length: 6 }, (_, i) => note(`n${i}`, 't1', i * 480)),
    });
    const { service, gemini } = buildService({
      head: headWith(),
      draft: manyTracks,
    });
    const result = await service.suggest(PROJECT, null, USER);
    expect(result.suggestion).toBe('Cập nhật lớn: 6 nốt, 6 track thay đổi');
    expect(gemini).not.toHaveBeenCalled();
  });

  it('returns null when Gemini errors, is empty, or times out (BR-79)', async () => {
    const failing = buildService({
      head: headWith(),
      draft: snapshot({ notes: [note('n1')] }),
      gemini: jest.fn().mockResolvedValue(null),
    });
    await expect(failing.service.suggest(PROJECT, null, USER)).resolves.toEqual(
      { suggestion: null },
    );
    expect(failing.gemini).toHaveBeenCalledTimes(1);
  });

  it('sanitizes model output: no quotes, one line, at most 200 chars (BR-39)', async () => {
    const { service } = buildService({
      head: headWith(),
      draft: snapshot({ notes: [note('n1')] }),
      gemini: jest.fn().mockResolvedValue(`"${'x'.repeat(250)}".\nDòng phụ`),
    });
    const { suggestion } = await service.suggest(PROJECT, null, USER);
    expect(suggestion).toHaveLength(200);
    expect(suggestion).not.toContain('"');
    expect(suggestion).not.toContain('\n');
    expect(suggestion).not.toContain('Dòng phụ');
  });

  it('drops a whitespace-only model answer to null', async () => {
    const { service } = buildService({
      head: headWith(),
      draft: snapshot({ notes: [note('n1')] }),
      gemini: jest.fn().mockResolvedValue('   '),
    });
    await expect(service.suggest(PROJECT, null, USER)).resolves.toEqual({
      suggestion: null,
    });
  });

  it('returns null for a first commit (no head to diff against)', async () => {
    const { service, gemini } = buildService({
      head: headWith(),
      draft: snapshot({ notes: [note('n1')] }),
      activeBranch: {
        data: { ...ACTIVE_BRANCH, head_commit_id: null },
        error: null,
      },
    });
    await expect(service.suggest(PROJECT, null, USER)).resolves.toEqual({
      suggestion: null,
    });
    expect(gemini).not.toHaveBeenCalled();
  });

  it('returns null when the draft matches the head commit', async () => {
    const same = headWith({ notes: [note('n1')] });
    const { service, gemini } = buildService({
      head: same,
      draft: same,
    });
    await expect(service.suggest(PROJECT, null, USER)).resolves.toEqual({
      suggestion: null,
    });
    expect(gemini).not.toHaveBeenCalled();
  });

  it('reads the other branch head from the DB when the box opens elsewhere', async () => {
    const { service, gemini, mock } = buildService({
      head: headWith(),
      draft: snapshot({ notes: [note('n1')] }),
      branchRows: [{ data: { head_commit_id: 'c-other' }, error: null }],
    });
    await expect(service.suggest(PROJECT, 'b-other', USER)).resolves.toEqual({
      suggestion: 'Gợi ý mẫu',
    });
    expect(gemini).toHaveBeenCalledTimes(1);
    expect(mock.builders.branches.maybeSingle).toHaveBeenCalledTimes(1);
  });

  it('reports a 404 for a branch that is not in the project', async () => {
    const { service } = buildService({
      head: headWith(),
      draft: snapshot({ notes: [note('n1')] }),
      branchRows: [{ data: null, error: null }],
    });
    await expect(service.suggest(PROJECT, 'b-unknown', USER)).rejects.toThrow(
      'Branch not found in this project',
    );
  });

  it('keeps the per-user rate limit: the AI is bypassed, never an error', async () => {
    const { service, gemini } = buildService({
      head: headWith(),
      draft: snapshot({ notes: [note('n1')] }),
      commitsRowCount: 15,
    });
    let last = { suggestion: null as string | null };
    for (let i = 0; i < 15; i += 1) {
      last = await service.suggest(PROJECT, null, USER);
    }
    // Default limiter: 10 per minute -> only the first 10 reach the model.
    expect(gemini).toHaveBeenCalledTimes(10);
    expect(last.suggestion).toBeNull();
  });

  it('enforces edit permission before anything else', async () => {
    const { service, gemini } = buildService({
      head: headWith(),
      draft: snapshot({ notes: [note('n1')] }),
      access: jest.fn().mockRejectedValue(new Error('no edit permission')),
    });
    await expect(service.suggest(PROJECT, null, USER)).rejects.toThrow(
      'no edit permission',
    );
    expect(gemini).not.toHaveBeenCalled();
  });
});
