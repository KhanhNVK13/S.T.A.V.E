import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { DiffService } from '../commits/diff.service';
import type { DraftSnapshot } from '@stave/shared-types';
import { CollaborationService } from './collaboration.service';
import { InviteCollaboratorDto } from './dto/invite-collaborator.dto';
import { PatchCollaboratorDto } from './dto/patch-collaborator.dto';

// `uuid` v14 is ESM-only and Jest (CJS) cannot parse it. The factory below
// keeps every mock in this spec self-contained (no shared config change)
// and produces real v4-format ids so assertions stay format-accurate.
jest.mock('uuid', () => ({
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  v4: () => require('crypto').randomUUID(),
}));

type Row = Record<string, unknown>;

/**
 * In-RAM mock of the SupabaseClient surface CollaborationService uses.
 * Stores rows per table; supports select + eq/ilike/in + maybeSingle/single,
 * count queries, insert, update, delete. No DB, no network.
 */
function mockSupabase(rows: Record<string, Row[]>) {
  let idCounter = 0;

  const filterRow = (row: Row, preds: Array<(row: Row) => boolean>) =>
    preds.every((p) => p(row));

  const build = (table: string): any => {
    const preds: Array<(row: Row) => boolean> = [];
    let mode: 'select' | 'insert' | 'update' | 'delete' = 'select';
    let payload: Row = {};
    let countOptions = false;
    let orderCol: string | null = null;
    let orderAsc = true;
    let limitN: number | null = null;

    const q: any = {};
    q.select = (...args: unknown[]) => {
      // `.insert().select('*')` keeps insert mode; only a leading `.select`
      // (the default) starts a read.
      if (mode === 'select') {
        countOptions =
          args.length === 2 &&
          typeof args[1] === 'object' &&
          !!(args[1] as { head?: boolean }).head;
      }
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
    q.ilike = (col: string, val: string) => {
      preds.push(
        (row) =>
          typeof row[col] === 'string' &&
          row[col].toLowerCase() === val.toLowerCase(),
      );
      return q;
    };
    q.in = (col: string, vals: unknown[]) => {
      preds.push((row) => vals.includes(row[col]));
      return q;
    };
    // UC-65: time-window + cap support for the contributions query. Only
    // `created_at` (string) is ever compared here, so stringify defensively.
    const asString = (v: unknown): string | null =>
      typeof v === 'string' ? v : null;
    q.gte = (col: string, val: unknown) => {
      preds.push((row) => {
        const a = asString(row[col]);
        if (a === null) return false;
        return a >= (typeof val === 'string' ? val : '');
      });
      return q;
    };
    q.lte = (col: string, val: unknown) => {
      preds.push((row) => {
        const a = asString(row[col]);
        if (a === null) return false;
        return a <= (typeof val === 'string' ? val : '');
      });
      return q;
    };
    q.limit = (n: number) => {
      limitN = n;
      return q;
    };
    q.order = (col: string, opts?: { ascending?: boolean }) => {
      orderCol = col;
      orderAsc = opts?.ascending ?? true;
      return q;
    };

    const run = (): {
      data: Row | Row[] | null;
      count: number | null;
      error: null;
    } => {
      const tableRows = (rows[table] ??= []);
      let matched = tableRows.filter((row) => filterRow(row, preds));
      const col = orderCol;
      if (col) {
        matched = [...matched].sort((a, b) => {
          const av = a[col] as string | number | null;
          const bv = b[col] as string | number | null;
          if (av === bv) return 0;
          if (av === null || av === undefined) return 1;
          if (bv === null || bv === undefined) return -1;
          const cmp = av < bv ? -1 : 1;
          return orderAsc ? cmp : -cmp;
        });
      }
      if (limitN !== null) matched = matched.slice(0, limitN);
      switch (mode) {
        case 'select': {
          // A bare awaited `.select(...)` resolves to the full row array.
          return {
            data: matched,
            count: countOptions ? matched.length : null,
            error: null,
          };
        }
        case 'insert': {
          const id = (payload.id as string) || `gen-${++idCounter}`;
          const inserted = { ...payload, id };
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

    // Collapse an array down to its first row (single-row terminals).
    const asSingle = (data: Row | Row[] | null): Row | null =>
      Array.isArray(data) ? (data[0] ?? null) : data;

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

/** UC-64: the gateway only *emits* here; its real behavior has its own spec. */
function fakeGateway() {
  return {
    emitPermissionChanged: jest.fn(),
    revokeUserAccess: jest.fn(),
    emitBranchMoved: jest.fn(),
  };
}

function makeService(
  rows: Record<string, Row[]> = {},
  access = fakeProjectAccess(),
  gateway = fakeGateway(),
) {
  return new CollaborationService(
    mockSupabase(rows),
    access as never,
    gateway as never,
    new DiffService(),
  );
}

const OWNER = 'owner-1';
const VIEWER = 'user-view';
const PENDING = 'user-pending';
const OTHER = 'user-other';

function collabRows(): Row[] {
  return [
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
  ];
}

describe('CollaborationService — UC-60 inviteCollaborator', () => {
  const users: Row[] = [
    {
      id: VIEWER,
      username: 'viewer',
      email: 'viewer@x.com',
      display_name: 'V',
    },
    { id: OTHER, username: 'other', email: 'other@x.com', display_name: 'O' },
    {
      id: OWNER,
      username: 'owner',
      email: 'owner@x.com',
      display_name: 'Owner',
    },
  ];

  it('creates a pending invitation row', async () => {
    const rows: Record<string, Row[]> = {
      users,
      projects: [{ id: 'p-1', owner_id: OWNER, name: 'My Project' }],
      project_collaborators: [],
    };
    const service = makeService(rows);
    const dto: InviteCollaboratorDto = {
      identifier: 'viewer',
      permissionLevel: 'edit',
    };

    const item = await service.inviteCollaborator('p-1', dto, OWNER);
    expect(item.status).toBe('pending');
    expect(item.userId).toBe(VIEWER);
    expect(item.permissionLevel).toBe('edit');
    expect(rows.project_collaborators).toHaveLength(1);
  });

  it('refuses inviting oneself (400)', async () => {
    const rows: Record<string, Row[]> = {
      users,
      projects: [{ id: 'p-1', owner_id: OWNER, name: 'P' }],
      project_collaborators: [],
    };
    const service = makeService(rows);
    const dto: InviteCollaboratorDto = {
      identifier: 'owner',
      permissionLevel: 'edit',
    };
    await expect(service.inviteCollaborator('p-1', dto, OWNER)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('returns 404 with a neutral message when no account matches', async () => {
    const rows: Record<string, Row[]> = {
      users,
      projects: [{ id: 'p-1', owner_id: OWNER, name: 'P' }],
      project_collaborators: [],
    };
    const service = makeService(rows);
    const dto: InviteCollaboratorDto = {
      identifier: 'ghost@x.com',
      permissionLevel: 'view',
    };
    await expect(service.inviteCollaborator('p-1', dto, OWNER)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('rejects a duplicate pending invitation with 409', async () => {
    const rows: Record<string, Row[]> = {
      users,
      projects: [{ id: 'p-1', owner_id: OWNER, name: 'P' }],
      project_collaborators: [
        {
          id: 'col-p',
          project_id: 'p-1',
          user_id: OTHER,
          permission_level: 'view',
          invited_by: OWNER,
          created_at: '2026-10-25T00:00:00Z',
          status: 'pending',
          responded_at: null,
        },
      ],
    };
    const service = makeService(rows);
    const dto: InviteCollaboratorDto = {
      identifier: 'other',
      permissionLevel: 'edit',
    };
    await expect(service.inviteCollaborator('p-1', dto, OWNER)).rejects.toThrow(
      ConflictException,
    );
  });

  it('rejects when the cap of 10 is reached (counting pending)', async () => {
    const full: Row[] = Array.from({ length: 10 }, (_, i) => ({
      id: `c-${i}`,
      project_id: 'p-1',
      user_id: `u-${i}`,
      permission_level: 'view',
      invited_by: OWNER,
      created_at: '2026-10-25T00:00:00Z',
      status: i === 0 ? 'pending' : 'accepted',
      responded_at: null,
    }));
    const rows: Record<string, Row[]> = {
      users,
      projects: [{ id: 'p-1', owner_id: OWNER, name: 'P' }],
      project_collaborators: full,
    };
    const service = makeService(rows);
    const dto: InviteCollaboratorDto = {
      identifier: 'viewer',
      permissionLevel: 'edit',
    };
    await expect(service.inviteCollaborator('p-1', dto, OWNER)).rejects.toThrow(
      ConflictException,
    );
  });

  it('finds a user by case-insensitive email', async () => {
    const rows: Record<string, Row[]> = {
      users,
      projects: [{ id: 'p-1', owner_id: OWNER, name: 'P' }],
      project_collaborators: [],
    };
    const service = makeService(rows);
    const dto: InviteCollaboratorDto = {
      identifier: 'OTHER@X.COM',
      permissionLevel: 'view',
    };
    const item = await service.inviteCollaborator('p-1', dto, OWNER);
    expect(item.userId).toBe(OTHER);
  });
});

describe('CollaborationService — UC-60 list + accept/decline', () => {
  it('lists collaborators for the owner', async () => {
    const rows: Record<string, Row[]> = {
      users: [
        { id: VIEWER, username: 'viewer', display_name: 'V', avatar_url: null },
      ],
      projects: [{ id: 'p-1', owner_id: OWNER, name: 'P' }],
      project_collaborators: collabRows(),
    };
    const service = makeService(rows);
    const items = await service.listCollaborators('p-1', OWNER);
    expect(items).toHaveLength(1);
    expect(items[0].user.username).toBe('viewer');
    expect(items[0].status).toBe('accepted');
  });

  it('accepts an invitation and stamps responded_at', async () => {
    const rows: Record<string, Row[]> = {
      users: [{ id: PENDING, username: 'p', display_name: 'P' }],
      projects: [{ id: 'p-1', owner_id: OWNER, name: 'P' }],
      project_collaborators: [
        {
          id: 'inv-1',
          project_id: 'p-1',
          user_id: PENDING,
          permission_level: 'edit',
          invited_by: OWNER,
          created_at: '2026-10-25T00:00:00Z',
          status: 'pending',
          responded_at: null,
        },
      ],
    };
    const service = makeService(rows);
    await service.acceptInvitation('inv-1', PENDING);
    const row = rows.project_collaborators[0];
    expect(row.status).toBe('accepted');
    expect(row.responded_at).toBeTruthy();
  });

  it('declining removes the invitation row', async () => {
    const rows: Record<string, Row[]> = {
      users: [{ id: PENDING, username: 'p', display_name: 'P' }],
      projects: [{ id: 'p-1', owner_id: OWNER, name: 'P' }],
      project_collaborators: [
        {
          id: 'inv-1',
          project_id: 'p-1',
          user_id: PENDING,
          permission_level: 'edit',
          invited_by: OWNER,
          created_at: '2026-10-25T00:00:00Z',
          status: 'pending',
          responded_at: null,
        },
      ],
    };
    const service = makeService(rows);
    await service.declineInvitation('inv-1', PENDING);
    expect(rows.project_collaborators).toHaveLength(0);
  });

  it('cannot accept an invitation that belongs to someone else', async () => {
    const rows: Record<string, Row[]> = {
      users: [{ id: PENDING, username: 'p', display_name: 'P' }],
      projects: [{ id: 'p-1', owner_id: OWNER, name: 'P' }],
      project_collaborators: [
        {
          id: 'inv-1',
          project_id: 'p-1',
          user_id: PENDING,
          permission_level: 'edit',
          invited_by: OWNER,
          created_at: '2026-10-25T00:00:00Z',
          status: 'pending',
          responded_at: null,
        },
      ],
    };
    const service = makeService(rows);
    await expect(service.acceptInvitation('inv-1', OTHER)).rejects.toThrow(
      NotFoundException,
    );
  });
});

describe('CollaborationService — UC-61 patchCollaborator', () => {
  it('updates the permission level of a collaborator', async () => {
    const rows: Record<string, Row[]> = {
      users: [
        { id: VIEWER, username: 'viewer', display_name: 'V', avatar_url: null },
      ],
      projects: [{ id: 'p-1', owner_id: OWNER, name: 'P' }],
      project_collaborators: collabRows(),
    };
    const service = makeService(rows);
    const dto: PatchCollaboratorDto = { permissionLevel: 'edit' };
    const item = await service.patchCollaborator('p-1', 'col-1', dto, OWNER);
    expect(item.permissionLevel).toBe('edit');
    expect(rows.project_collaborators[0].permission_level).toBe('edit');
  });

  it('throws when the collaborator is not in the project', async () => {
    const rows: Record<string, Row[]> = {
      users: [{ id: VIEWER, username: 'viewer', display_name: 'V' }],
      projects: [{ id: 'p-1', owner_id: OWNER, name: 'P' }],
      project_collaborators: collabRows(),
    };
    const service = makeService(rows);
    const dto: PatchCollaboratorDto = { permissionLevel: 'view' };
    await expect(
      service.patchCollaborator('p-1', 'nope', dto, OWNER),
    ).rejects.toThrow(NotFoundException);
  });
});

describe('CollaborationService — UC-62 removeCollaborator', () => {
  it('removes an accepted collaborator', async () => {
    const rows: Record<string, Row[]> = {
      users: [{ id: VIEWER, username: 'viewer', display_name: 'V' }],
      projects: [{ id: 'p-1', owner_id: OWNER, name: 'P' }],
      project_collaborators: collabRows(),
    };
    const service = makeService(rows);
    await service.removeCollaborator('p-1', 'col-1', OWNER);
    expect(rows.project_collaborators).toHaveLength(0);
  });

  it('refuses to remove the owner if a row exists', async () => {
    const rows: Record<string, Row[]> = {
      users: [{ id: OWNER, username: 'owner', display_name: 'O' }],
      projects: [{ id: 'p-1', owner_id: OWNER, name: 'P' }],
      project_collaborators: [
        {
          id: 'col-owner',
          project_id: 'p-1',
          user_id: OWNER,
          permission_level: 'edit',
          invited_by: 'someone',
          created_at: '2026-10-25T00:00:00Z',
          status: 'accepted',
          responded_at: null,
        },
      ],
    };
    const service = makeService(rows);
    await expect(
      service.removeCollaborator('p-1', 'col-owner', OWNER),
    ).rejects.toThrow(BadRequestException);
  });

  it('leaves pending invitations without notification when removed', async () => {
    const rows: Record<string, Row[]> = {
      users: [{ id: PENDING, username: 'p', display_name: 'P' }],
      projects: [{ id: 'p-1', owner_id: OWNER, name: 'P' }],
      project_collaborators: [
        {
          id: 'col-p',
          project_id: 'p-1',
          user_id: PENDING,
          permission_level: 'view',
          invited_by: OWNER,
          created_at: '2026-10-25T00:00:00Z',
          status: 'pending',
          responded_at: null,
        },
      ],
    };
    const service = makeService(rows);
    await service.removeCollaborator('p-1', 'col-p', OWNER);
    expect(rows.project_collaborators).toHaveLength(0);
  });
});

// ===========================================================================
// UC-65: listContributions — derived contribution stats (BR-72)
// ===========================================================================

/** Minimal but schema-valid snapshot with one track and N notes on it. */
function snap(
  trackName: string,
  noteCount: number,
  trackId = 't-1',
): DraftSnapshot {
  const notes = Array.from({ length: noteCount }, (_, i) => ({
    id: `n-${i}`,
    trackId,
    pitch: 60,
    start: i * 480,
    duration: 240,
    velocity: 100,
  }));
  return {
    schemaVersion: 3,
    meta: { tempo: 120, timeSignature: [4, 4], ppq: 480 },
    tracks: [
      {
        id: trackId,
        name: trackName,
        order: 0,
        color: '#111827',
        muted: false,
        solo: false,
        volume: 1,
        pan: 0,
        instrument: null,
      },
    ],
    notes,
  };
}

function commitRow(
  id: string,
  author: string,
  snapshot: DraftSnapshot,
  opts: {
    parent?: string | null;
    mergedFrom?: string | null;
    createdAt?: string;
    branch?: string;
  } = {},
): Row {
  return {
    id,
    branch_id: opts.branch ?? 'b-main',
    author_id: author,
    message: `msg-${id}`,
    snapshot,
    parent_commit_id: opts.parent ?? null,
    merged_from_branch_id: opts.mergedFrom ?? null,
    created_at: opts.createdAt ?? '2026-10-01T00:00:00Z',
  };
}

function uc65Rows(overrides: Record<string, Row[]> = {}) {
  return {
    users: [
      { id: OWNER, username: 'owner', display_name: 'Owner', avatar_url: null },
      { id: VIEWER, username: 'viewer', display_name: 'V', avatar_url: null },
    ],
    projects: [{ id: 'p-1', owner_id: OWNER }],
    project_collaborators: collabRows(),
    branches: [
      { id: 'b-main', project_id: 'p-1' },
      { id: 'b-feature', project_id: 'p-1' },
    ],
    commits: [],
    ...overrides,
  };
}

describe('CollaborationService — UC-65 listContributions', () => {
  it('aggregates commits + note stats + track distribution for owner and collaborator', async () => {
    const rows = uc65Rows({
      commits: [
        // main: owner, 2 notes added on track t-1.
        commitRow('c-1', OWNER, snap('Melody', 2), {
          createdAt: '2026-10-01T00:00:00Z',
        }),
        // main: owner modifies one note + removes the other (0 net on t-1? no:
        // removed 1 + modified 1 against c-1's two notes).
        commitRow(
          'c-2',
          OWNER,
          {
            ...snap('Melody', 1),
            notes: [
              {
                id: 'n-0',
                trackId: 't-1',
                pitch: 61,
                start: 0,
                duration: 240,
                velocity: 100,
              },
            ],
          },
          { parent: 'c-1', createdAt: '2026-10-02T00:00:00Z' },
        ),
        // feature: collaborator adds 3 notes on a new second track.
        commitRow(
          'c-3',
          VIEWER,
          {
            ...snap('Melody', 2),
            tracks: [
              ...snap('Melody', 2).tracks,
              { ...snap('', 0, 't-2').tracks[0], name: 'Bass' },
            ],
            notes: [
              ...snap('Melody', 2).notes,
              ...Array.from({ length: 3 }, (_, i) => ({
                id: `b-${i}`,
                trackId: 't-2',
                pitch: 40,
                start: i * 480,
                duration: 240,
                velocity: 90,
              })),
            ],
          },
          {
            parent: 'c-1',
            branch: 'b-feature',
            createdAt: '2026-10-03T00:00:00Z',
          },
        ),
      ],
    });
    const service = makeService(rows);

    const result = await service.listContributions('p-1', OWNER, {});

    expect(result.projectId).toBe('p-1');
    const owner = result.contributors.find((c) => c.userId === OWNER)!;
    expect(owner.totalCommits).toBe(2);
    expect(owner.notesAdded).toBe(2);
    expect(owner.notesRemoved).toBe(1);
    expect(owner.notesModified).toBe(1);
    expect(owner.isOwner).toBe(true);
    expect(owner.isRemoved).toBe(false);
    expect(owner.isDeletedAccount).toBe(false);
    expect(owner.displayName).toBe('Owner');
    // c-1: +2 notes with the track itself (3 changes); c-2: 1 modified +
    // 1 removed (2 changes) — all on Melody.
    expect(owner.trackDistribution).toHaveLength(1);
    expect(owner.trackDistribution[0]).toEqual({
      trackId: 't-1',
      trackName: 'Melody',
      changeCount: 5,
      percentage: 100,
    });
    expect(owner.lastActivityAt).toBe('2026-10-02T00:00:00Z');

    const viewer = result.contributors.find((c) => c.userId === VIEWER)!;
    expect(viewer.totalCommits).toBe(1);
    expect(viewer.notesAdded).toBe(3);
    expect(viewer.notesRemoved).toBe(0);
    expect(viewer.notesModified).toBe(0);
    expect(viewer.isOwner).toBe(false);
    expect(viewer.isRemoved).toBe(false);
    expect(viewer.isDeletedAccount).toBe(false);
    expect(viewer.trackDistribution).toHaveLength(1);
    expect(viewer.trackDistribution[0].trackName).toBe('Bass');
    // 3 notes on the new track + the track addition itself.
    expect(viewer.trackDistribution[0].changeCount).toBe(4);
    expect(viewer.trackDistribution[0].percentage).toBe(100);

    // Recent commits: newest first, merge-inclusive, owner's c-2 carries its own diff.
    expect(result.recentCommits.map((c) => c.id)).toEqual([
      'c-3',
      'c-2',
      'c-1',
    ]);
    const c2 = result.recentCommits.find((c) => c.id === 'c-2')!;
    expect(c2.notesRemoved).toBe(1);
    expect(c2.notesModified).toBe(1);
  });

  it('excludes merge commits from note stats but counts them (BR-72)', async () => {
    const rows = uc65Rows({
      commits: [
        commitRow('c-1', OWNER, snap('Melody', 2), {
          createdAt: '2026-10-01T00:00:00Z',
        }),
        commitRow('c-2', VIEWER, snap('Melody', 3), {
          parent: 'c-1',
          branch: 'b-feature',
          createdAt: '2026-10-02T00:00:00Z',
        }),
        // Merge of b-feature into main: same snapshot as c-2, owned by the
        // mering owner.
        commitRow('c-3', OWNER, snap('Melody', 3), {
          parent: 'c-1',
          mergedFrom: 'b-feature',
          createdAt: '2026-10-03T00:00:00Z',
        }),
      ],
    });
    const service = makeService(rows);

    const result = await service.listContributions('p-1', OWNER, {});

    const owner = result.contributors.find((c) => c.userId === OWNER)!;
    expect(owner.totalCommits).toBe(2); // c-1 + the merge commit
    // The merge commit contributes 0 notes → owner's numbers come from c-1 only.
    expect(owner.notesAdded).toBe(2);
    expect(owner.notesRemoved).toBe(0);
    expect(owner.notesModified).toBe(0);

    const viewer = result.contributors.find((c) => c.userId === VIEWER)!;
    expect(viewer.notesAdded).toBe(1);

    // The merge commit row shows zeroed note stats.
    const merge = result.recentCommits.find((c) => c.id === 'c-3')!;
    expect(merge.notesAdded).toBe(0);
    expect(merge.notesRemoved).toBe(0);
    expect(merge.notesModified).toBe(0);
  });

  it('flags a removed collaborator (3.E1) while keeping their numbers', async () => {
    // VIEWER was an author but no longer has an accepted row.
    const rows = uc65Rows({
      project_collaborators: [],
      commits: [
        commitRow('c-1', OWNER, snap('Melody', 1), {
          createdAt: '2026-10-01T00:00:00Z',
        }),
        commitRow('c-2', VIEWER, snap('Melody', 2), {
          parent: 'c-1',
          createdAt: '2026-10-02T00:00:00Z',
        }),
      ],
    });
    const service = makeService(rows);

    const result = await service.listContributions('p-1', OWNER, {});
    const viewer = result.contributors.find((c) => c.userId === VIEWER)!;
    expect(viewer.isRemoved).toBe(true);
    expect(viewer.isOwner).toBe(false);
    expect(viewer.isDeletedAccount).toBe(false);
    // BR-67: history is preserved, not scrubbed.
    expect(viewer.totalCommits).toBe(1);
    expect(viewer.notesAdded).toBe(1);
  });

  it('marks a deleted account as "Người dùng đã xoá" (3.E2)', async () => {
    const GHOST = 'ghost-1';
    const rows = uc65Rows({
      users: [{ id: OWNER, username: 'owner', display_name: 'Owner' }],
      commits: [
        commitRow('c-1', GHOST, snap('Melody', 1), {
          createdAt: '2026-10-01T00:00:00Z',
        }),
      ],
    });
    const service = makeService(rows);

    const result = await service.listContributions('p-1', OWNER, {});
    const ghost = result.contributors.find((c) => c.userId === GHOST)!;
    expect(ghost.isDeletedAccount).toBe(true);
    expect(ghost.displayName).toBeNull();
    expect(ghost.username).toBeNull();
    expect(ghost.avatarUrl).toBeNull();
    expect(ghost.totalCommits).toBe(1);
    expect(ghost.notesAdded).toBe(1);
  });

  it('returns empty (no 500) when the project has no commits (4.E1)', async () => {
    const rows = uc65Rows();
    const service = makeService(rows);

    const result = await service.listContributions('p-1', OWNER, {});
    expect(result).toEqual({
      projectId: 'p-1',
      contributors: [],
      recentCommits: [],
    });
  });

  it('rejects pending collaborators and outsiders (1.E1 → 403)', async () => {
    const pendingAccess = fakeProjectAccess({
      assertCanView: jest
        .fn()
        .mockRejectedValue(
          new ForbiddenException('You do not have access to this project'),
        ),
    });

    // Pending collaborator (BR-65) — assertCanView rejects.
    const servicePending = makeService(uc65Rows(), pendingAccess);
    await expect(
      servicePending.listContributions('p-1', PENDING, {}),
    ).rejects.toThrow(ForbiddenException);

    // The assert is called with the right arguments.
    expect(pendingAccess.assertCanView).toHaveBeenCalledWith('p-1', PENDING);

    // An outsider is rejected the same way by the same guard.
    await expect(
      servicePending.listContributions('p-1', OTHER, {}),
    ).rejects.toThrow(ForbiddenException);

    // An accepted collaborator gets through the guard.
    const serviceOk = makeService(uc65Rows());
    await expect(
      serviceOk.listContributions('p-1', VIEWER, {}),
    ).resolves.not.toThrow();
  });

  it('rejects a branchId that does not belong to the project (404)', async () => {
    const rows = uc65Rows({
      commits: [commitRow('c-1', OWNER, snap('Melody', 1))],
    });
    const service = makeService(rows);

    await expect(
      service.listContributions('p-1', OWNER, { branchId: 'b-other' }),
    ).rejects.toThrow(NotFoundException);
  });

  it('filters by a time window and a single author (5.1)', async () => {
    const rows = uc65Rows({
      commits: [
        commitRow('c-1', OWNER, snap('Melody', 1), {
          createdAt: '2026-09-01T00:00:00Z',
        }),
        commitRow('c-2', OWNER, snap('Melody', 2), {
          parent: 'c-1',
          createdAt: '2026-10-01T00:00:00Z',
        }),
        commitRow(
          'c-3',
          VIEWER,
          {
            ...snap('Melody', 2),
            notes: [
              ...snap('Melody', 2).notes,
              { ...snap('Melody', 3).notes[2] },
            ],
            tracks: [...snap('Melody', 2).tracks],
          },
          { parent: 'c-2', createdAt: '2026-10-02T00:00:00Z' },
        ),
      ],
    });
    const service = makeService(rows);

    const result = await service.listContributions('p-1', OWNER, {
      from: '2026-10-01T00:00:00.000Z',
      to: '2026-10-02T23:59:59.999Z',
    });
    // c-1 (September) is excluded by the window.
    expect(result.recentCommits.map((c) => c.id)).toEqual(['c-3', 'c-2']);
    const owner = result.contributors.find((c) => c.userId === OWNER)!;
    expect(owner.totalCommits).toBe(1);
    expect(owner.notesAdded).toBe(1);

    // Single-author filter: only the viewer's numbers + their commits.
    const onlyViewer = await service.listContributions('p-1', OWNER, {
      userId: VIEWER,
    });
    expect(onlyViewer.contributors.map((c) => c.userId)).toEqual([VIEWER]);
    expect(onlyViewer.recentCommits.map((c) => c.id)).toEqual(['c-3']);
  });
});
