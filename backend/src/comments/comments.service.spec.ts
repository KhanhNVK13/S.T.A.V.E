import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { CommentsService } from './comments.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import type { DraftSnapshot } from '@stave/shared-types';

/**
 * In-RAM mock of the SupabaseClient surface CommentsService uses.
 * Same approach as `collaboration.service.spec.ts`: rows stored per table,
 * select/insert/update/delete + eq/in/order + maybeSingle/single. No DB, no
 * network.
 */
type Row = Record<string, unknown>;

function mockSupabase(rows: Record<string, Row[]>) {
  let idCounter = 0;

  const filterRow = (row: Row, preds: Array<(row: Row) => boolean>) =>
    preds.every((p) => p(row));

  const build = (table: string): any => {
    const preds: Array<(row: Row) => boolean> = [];
    let mode: 'select' | 'insert' | 'update' | 'delete' = 'select';
    let payload: Row = {};

    const q: any = {};
    q.select = (...args: unknown[]) => {
      // `.insert().select('*')` keeps insert mode; only a leading `.select`
      // (the default) starts a read.
      void args;
      return q;
    };
    q.insert = (row: Row) => {
      mode = 'insert';
      payload = row;
      return q;
    };
    q.update = (row: Row) => {
      mode = 'update';
      payload = row;
      return q;
    };
    q.delete = () => {
      mode = 'delete';
      return q;
    };
    q.eq = (col: string, val: unknown) => {
      preds.push((row) => row[col] === val);
      return q;
    };
    q.in = (col: string, vals: unknown[]) => {
      preds.push((row) => vals.includes(row[col]));
      return q;
    };
    q.order = () => q;
    q.limit = () => q;
    q.ilike = (col: string, val: string) => {
      preds.push(
        (row) =>
          typeof row[col] === 'string' &&
          row[col].toLowerCase() === val.toLowerCase(),
      );
      return q;
    };

    const run = (): {
      data: Row | Row[] | null;
      count: number | null;
      error: null;
    } => {
      const tableRows = (rows[table] ??= []);
      const matched = tableRows.filter((row) => filterRow(row, preds));
      switch (mode) {
        case 'select': {
          return { data: matched, count: null, error: null };
        }
        case 'insert': {
          const id = (payload.id as string) || `gen-${++idCounter}`;
          const inserted = {
            ...payload,
            id,
            created_at: '2026-10-26T00:00:00Z',
          };
          tableRows.push(inserted);
          return { data: inserted, count: null, error: null };
        }
        case 'update': {
          for (const row of matched) Object.assign(row, payload);
          return { data: matched, count: null, error: null };
        }
        case 'delete': {
          rows[table] = tableRows.filter((row) => !filterRow(row, preds));
          return { data: null, count: null, error: null };
        }
      }
    };

    // The chain itself is awaited (`await ...select().eq()...`), so it must
    // be thenable — that's the real Supabase surface.
    const thenable = {
      then: (
        res: (v: ReturnType<typeof run>) => unknown,
        rej?: (e: unknown) => unknown,
      ) => Promise.resolve(run()).then(res, rej),
      catch: (rej: (e: unknown) => unknown) =>
        Promise.resolve(run()).catch(rej),
    };
    Object.assign(q, thenable);

    // Terminal helpers collapse to a single row, like the real client.
    const asSingle = (data: Row | Row[] | null): Row | null =>
      Array.isArray(data) ? (data[0] ?? null) : data;

    q.maybeSingle = () =>
      Promise.resolve(run()).then(({ data, error }) => ({
        data: asSingle(data),
        error,
      }));
    q.single = () =>
      Promise.resolve(run()).then(({ data, error }) => {
        const single = asSingle(data);
        if (error || single == null) {
          return Promise.reject(new Error(`single: no row for ${table}`));
        }
        return { data: single, error: null };
      });

    return q;
  };

  return { from: (table: string) => build(table) } as never;
}

function fakeProjectAccess(overrides: Record<string, unknown> = {}) {
  return {
    getAccess: jest.fn().mockResolvedValue('owner'),
    assertCanView: jest.fn().mockResolvedValue(undefined),
    assertCanEdit: jest.fn().mockResolvedValue(undefined),
    assertOwner: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeService(
  rows: Record<string, Row[]> = {},
  access = fakeProjectAccess(),
) {
  return new CommentsService(mockSupabase(rows), access as never);
}

// ── shared fixture builders ─────────────────────────────────

const OWNER = 'owner-1';
const VIEWER = 'viewer-1';
const TRACK_A = 'track-a';
const NOTE_1 = 'note-1';
const NOTE_2 = 'note-2';

function baseRows(): Record<string, Row[]> {
  const draft: DraftSnapshot = {
    schemaVersion: 3,
    meta: { tempo: 120, timeSignature: [4, 4], ppq: 480 },
    tracks: [
      {
        id: TRACK_A,
        name: 'Piano',
        order: 0,
        color: '#fff',
        muted: false,
        solo: false,
        volume: 1,
        pan: 0,
        instrument: null,
      },
    ],
    notes: [
      {
        id: NOTE_1,
        trackId: TRACK_A,
        pitch: 60,
        start: 0,
        duration: 480,
        velocity: 100,
      },
      {
        id: NOTE_2,
        trackId: TRACK_A,
        pitch: 64,
        start: 480,
        duration: 480,
        velocity: 90,
      },
    ],
  };
  return {
    projects: [
      { id: 'p-1', owner_id: OWNER, active_branch_id: null, name: 'P' },
    ],
    branches: [
      {
        id: 'b-main',
        project_id: 'p-1',
        head_commit_id: null,
        is_default: true,
      },
    ],
    drafts: [{ id: 'd-1', branch_id: 'b-main', snapshot: draft }],
    commits: [],
    users: [
      {
        id: OWNER,
        username: 'owner',
        email: 'owner@x.com',
        display_name: 'Owner',
        avatar_url: null,
      },
      {
        id: VIEWER,
        username: 'viewer',
        email: 'viewer@x.com',
        display_name: 'Viewer',
        avatar_url: null,
      },
    ],
    project_collaborators: [
      {
        id: 'col-1',
        project_id: 'p-1',
        user_id: VIEWER,
        permission_level: 'view',
        invited_by: OWNER,
        created_at: '2026-10-25T00:00:00Z',
        status: 'accepted',
        responded_at: '2026-10-25T01:00:00Z',
      },
    ],
    comments: [],
  };
}

// ==========================================================================
// UC-63: listComments + noteMissing (BR-68)
// ==========================================================================

describe('CommentsService — UC-63 listComments', () => {
  it('returns the flat list with author info and noteMissing=false when the note exists', async () => {
    const rows = baseRows();
    rows.comments = [
      {
        id: 'c-1',
        project_id: 'p-1',
        author_id: VIEWER,
        body: 'Check this bar',
        track_id: TRACK_A,
        bar: 2,
        note_id: NOTE_2,
        parent_id: null,
        created_at: '2026-10-26T01:00:00Z',
      },
    ];
    const service = makeService(rows);
    const items = await service.listComments('p-1', VIEWER);

    expect(items).toHaveLength(1);
    expect(items[0].body).toBe('Check this bar');
    expect(items[0].noteMissing).toBe(false);
    expect(items[0].author.username).toBe('viewer');
    expect(items[0].bar).toBe(2);
    expect(items[0].trackId).toBe(TRACK_A);
  });

  it('marks noteMissing=true when the anchored note is gone from the draft (BR-68)', async () => {
    const rows = baseRows();
    // Simulate the note being deleted: only NOTE_1 remains in the draft.
    rows.drafts[0].snapshot = {
      ...(rows.drafts[0].snapshot as DraftSnapshot),
      notes: [
        {
          id: NOTE_1,
          trackId: TRACK_A,
          pitch: 60,
          start: 0,
          duration: 480,
          velocity: 100,
        },
      ],
    };
    rows.comments = [
      {
        id: 'c-1',
        project_id: 'p-1',
        author_id: OWNER,
        body: 'This note is gone',
        track_id: TRACK_A,
        bar: 2,
        note_id: 'note-deleted',
        parent_id: null,
        created_at: '2026-10-26T01:00:00Z',
      },
    ];
    const service = makeService(rows);
    const items = await service.listComments('p-1', OWNER);

    // The comment itself is NOT deleted — only flagged.
    expect(items).toHaveLength(1);
    expect(items[0].noteMissing).toBe(true);
    expect(items[0].noteId).toBe('note-deleted');
  });

  it('falls back to the head commit snapshot when no draft exists', async () => {
    const rows = baseRows();
    rows.drafts = [];
    const commitSnapshot: DraftSnapshot = {
      schemaVersion: 3,
      meta: { tempo: 120, timeSignature: [4, 4], ppq: 480 },
      tracks: [],
      notes: [
        {
          id: 'commit-note',
          trackId: TRACK_A,
          pitch: 60,
          start: 0,
          duration: 1,
          velocity: 80,
        },
      ],
    };
    rows.commits = [
      { id: 'commit-1', branch_id: 'b-main', snapshot: commitSnapshot },
    ];
    rows.branches[0].head_commit_id = 'commit-1';
    rows.comments = [
      {
        id: 'c-1',
        project_id: 'p-1',
        author_id: OWNER,
        body: 'x',
        track_id: null,
        bar: null,
        note_id: 'commit-note',
        parent_id: null,
        created_at: '2026-10-26T01:00:00Z',
      },
    ];
    const service = makeService(rows);
    const items = await service.listComments('p-1', OWNER);
    expect(items[0].noteMissing).toBe(false);
  });

  it('rejects a user with no access', async () => {
    const rows = baseRows();
    const forbidden = new ForbiddenException('no access');
    const service = makeService(rows, {
      ...fakeProjectAccess(),
      assertCanView: jest.fn().mockRejectedValue(forbidden),
    });
    await expect(service.listComments('p-1', 'stranger-1')).rejects.toThrow(
      ForbiddenException,
    );
  });
});

// ==========================================================================
// UC-63: createComment
// ==========================================================================

describe('CommentsService — UC-63 createComment', () => {
  it('stores a top-level comment with no anchor as project-wide (1.1)', async () => {
    const rows = baseRows();
    const service = makeService(rows);
    const dto: CreateCommentDto = { body: '  Overall the chorus is good ' };

    const item = await service.createComment('p-1', dto, OWNER);

    expect(item.body).toBe('Overall the chorus is good'); // trimmed
    expect(item.trackId).toBeNull();
    expect(item.bar).toBeNull();
    expect(item.noteId).toBeNull();
    expect(item.parentId).toBeNull();
    const stored = rows.comments.find((c) => c.id === item.id);
    expect(stored).toMatchObject({
      body: 'Overall the chorus is good',
      track_id: null,
      bar: null,
      note_id: null,
      parent_id: null,
    });
  });

  it('rejects an empty-after-trim body (4.E1)', async () => {
    const rows = baseRows();
    const service = makeService(rows);
    await expect(
      service.createComment('p-1', { body: '   ' }, OWNER),
    ).rejects.toThrow(BadRequestException);
    expect(rows.comments).toHaveLength(0);
  });

  it('anchors a comment to a bar + track + note', async () => {
    const rows = baseRows();
    const service = makeService(rows);
    const item = await service.createComment(
      'p-1',
      { body: 'This note stabs me', trackId: TRACK_A, bar: 1, noteId: NOTE_1 },
      VIEWER,
    );
    expect(item).toMatchObject({
      trackId: TRACK_A,
      bar: 1,
      noteId: NOTE_1,
    });
    expect(item.author.username).toBe('viewer');
  });

  it('a reply inherits the parent anchor (2.1) and is stored with parentId', async () => {
    const rows = baseRows();
    rows.comments = [
      {
        id: 'parent-1',
        project_id: 'p-1',
        author_id: VIEWER,
        body: 'parent',
        track_id: TRACK_A,
        bar: 3,
        note_id: NOTE_2,
        parent_id: null,
        created_at: '2026-10-26T01:00:00Z',
      },
    ];
    const service = makeService(rows);
    // The client does NOT send its own position — the server copies the
    // parent's.
    const item = await service.createComment(
      'p-1',
      { body: 'Agreed, reply', parentId: 'parent-1' },
      OWNER,
    );
    expect(item.parentId).toBe('parent-1');
    expect(item.trackId).toBe(TRACK_A);
    expect(item.bar).toBe(3);
    expect(item.noteId).toBe(NOTE_2);
  });

  it('refuses to reply to a reply — one level only (2.1)', async () => {
    const rows = baseRows();
    rows.comments = [
      {
        id: 'top-1',
        project_id: 'p-1',
        author_id: OWNER,
        body: 'top',
        track_id: null,
        bar: null,
        note_id: null,
        parent_id: null,
        created_at: '2026-10-26T01:00:00Z',
      },
      {
        id: 'mid-1',
        project_id: 'p-1',
        author_id: VIEWER,
        body: 'a reply',
        track_id: null,
        bar: null,
        note_id: null,
        parent_id: 'top-1',
        created_at: '2026-10-26T01:05:00Z',
      },
    ];
    const service = makeService(rows);
    await expect(
      service.createComment(
        'p-1',
        { body: 'a reply to a reply', parentId: 'mid-1' },
        OWNER,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('404s when the parent comment is not in this project', async () => {
    const rows = baseRows();
    rows.comments = [
      {
        id: 'other-1',
        project_id: 'p-other',
        author_id: OWNER,
        body: 'elsewhere',
        track_id: null,
        bar: null,
        note_id: null,
        parent_id: null,
        created_at: '2026-10-26T01:00:00Z',
      },
    ];
    const service = makeService(rows);
    await expect(
      service.createComment(
        'p-1',
        { body: 'orphan reply', parentId: 'other-1' },
        OWNER,
      ),
    ).rejects.toThrow(NotFoundException);
  });
});

// ==========================================================================
// UC-63: deleteComment (BR-69)
// ==========================================================================

describe('CommentsService — UC-63 deleteComment', () => {
  function deleteRows(): Record<string, Row[]> {
    const rows = baseRows();
    rows.comments = [
      {
        id: 'c-own',
        project_id: 'p-1',
        author_id: VIEWER,
        body: 'mine',
        track_id: null,
        bar: null,
        note_id: null,
        parent_id: null,
        created_at: '2026-10-26T01:00:00Z',
      },
      {
        id: 'c-other',
        project_id: 'p-1',
        author_id: OWNER,
        body: "owner's",
        track_id: null,
        bar: null,
        note_id: null,
        parent_id: null,
        created_at: '2026-10-26T01:10:00Z',
      },
    ];
    return rows;
  }

  it('the author can delete their own comment', async () => {
    const rows = deleteRows();
    const service = makeService(rows, {
      ...fakeProjectAccess(),
      getAccess: jest.fn().mockResolvedValue('view'),
    });
    await service.deleteComment('p-1', 'c-own', VIEWER);
    expect(rows.comments.find((c) => c.id === 'c-own')).toBeUndefined();
    expect(rows.comments).toHaveLength(1);
  });

  it('the owner can delete any comment (BR-69)', async () => {
    const rows = deleteRows();
    const service = makeService(rows, {
      ...fakeProjectAccess(),
      getAccess: jest.fn().mockResolvedValue('owner'),
    });
    await service.deleteComment('p-1', 'c-own', OWNER);
    expect(rows.comments.find((c) => c.id === 'c-own')).toBeUndefined();
  });

  it('a non-author, non-owner viewer is refused (403)', async () => {
    const rows = deleteRows();
    const service = makeService(rows, {
      ...fakeProjectAccess(),
      getAccess: jest.fn().mockResolvedValue('view'),
    });
    // viewer-1 owns c-own, not c-other:
    await expect(
      service.deleteComment('p-1', 'c-other', VIEWER),
    ).rejects.toThrow(ForbiddenException);
    expect(rows.comments).toHaveLength(2); // nothing deleted
  });

  it('404s for a comment that does not exist in the project', async () => {
    const rows = deleteRows();
    const service = makeService(rows);
    await expect(service.deleteComment('p-1', 'nope', OWNER)).rejects.toThrow(
      NotFoundException,
    );
  });
});
