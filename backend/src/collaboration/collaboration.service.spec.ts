import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { CollaborationService } from './collaboration.service';
import { InviteCollaboratorDto } from './dto/invite-collaborator.dto';
import { PatchCollaboratorDto } from './dto/patch-collaborator.dto';

// `uuid` v14 is ESM-only and Jest (CJS) cannot parse it. The factory below
// keeps every mock in this spec self-contained (no shared config change)
// and produces real v4-format ids so assertions stay format-accurate.
jest.mock('uuid', () => ({
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
    q.order = () => q;

    const run = (): {
      data: Row | Row[] | null;
      count: number | null;
      error: null;
    } => {
      const tableRows = (rows[table] ??= []);
      const matched = tableRows.filter((row) => filterRow(row, preds));
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

function makeService(
  rows: Record<string, Row[]> = {},
  access = fakeProjectAccess(),
) {
  return new CollaborationService(mockSupabase(rows), access as never);
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
