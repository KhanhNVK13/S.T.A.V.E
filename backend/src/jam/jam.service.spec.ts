import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import { JamService, JamSocketUser } from './jam.service';

type Row = Record<string, unknown>;

/**
 * In-RAM mock of the SupabaseClient surface JamService uses. Supports the
 * `select().eq().maybeSingle()`, `update().eq()`, `upsert(..., {onConflict})`
 * and `insert()` chains against in-memory rows. No DB, no network.
 *
 * Mirrors the proven shape in `collaboration.service.spec.ts`: the builder is
 * thenable so `await client.from(t).update(...).eq(...)` and
 * `await client.from(t).upsert(...)` resolve, and `.maybeSingle()` returns a
 * promise when called explicitly.
 */
function createInMemorySupabase(tables: Record<string, Row[]>): SupabaseClient {
  const state: Record<string, Row[]> = {};
  for (const key of Object.keys(tables)) {
    state[key] = (tables[key] ?? []).map((row) => ({ ...row }));
  }

  const filterRow = (row: Row, preds: Array<(row: Row) => boolean>) =>
    preds.every((p) => p(row));

  const build = (table: string): any => {
    const rows = (state[table] ??= []);
    const preds: Array<(row: Row) => boolean> = [];
    let mode: 'select' | 'update' | 'insert' | 'upsert' = 'select';
    let payload: Row = {};
    let onConflict: string | undefined;

    const upsertKeys = (): string[] =>
      (onConflict ?? '')
        .split(',')
        .map((k) => k.trim())
        .filter(Boolean);

    const q: any = {};
    q.select = () => q;
    q.eq = (col: string, val: unknown) => {
      preds.push((row) => row[col] === val);
      return q;
    };
    q.neq = (col: string, val: unknown) => {
      preds.push((row) => row[col] !== val);
      return q;
    };
    q.in = (col: string, vals: unknown[]) => {
      preds.push((row) => vals.includes(row[col]));
      return q;
    };
    q.order = () => q;
    q.update = (p: Row) => {
      mode = 'update';
      payload = p;
      return q;
    };
    q.insert = (p: Row) => {
      mode = 'insert';
      payload = p;
      return q;
    };
    q.upsert = (p: Row, opts?: { onConflict?: string }) => {
      mode = 'upsert';
      payload = p;
      onConflict = opts?.onConflict;
      return q;
    };

    const run = (): { data: Row | Row[] | null; error: null } => {
      switch (mode) {
        case 'select':
          return {
            data: rows.filter((r) => filterRow(r, preds)),
            error: null,
          };
        case 'update': {
          for (const row of rows) {
            if (filterRow(row, preds)) Object.assign(row, payload);
          }
          return { data: null, error: null };
        }
        case 'insert': {
          const inserted = { ...payload };
          rows.push(inserted);
          return { data: inserted, error: null };
        }
        case 'upsert': {
          const keys = upsertKeys();
          const existing = keys.length
            ? rows.find((row) => keys.every((k) => row[k] === payload[k]))
            : undefined;
          if (existing) {
            Object.assign(existing, payload);
            return { data: existing, error: null };
          }
          const inserted = { ...payload };
          rows.push(inserted);
          return { data: inserted, error: null };
        }
      }
    };

    // The chain itself is awaited (`await ...update().eq()`), so it must be
    // thenable — that is the real Supabase surface.
    const thenable = {
      then: (
        res: (v: ReturnType<typeof run>) => unknown,
        rej?: (e: unknown) => unknown,
      ) => Promise.resolve(run()).then(res, rej),
      catch: (rej: (e: unknown) => unknown) =>
        Promise.resolve(run()).catch(rej),
    };
    Object.assign(q, thenable);

    q.maybeSingle = () =>
      Promise.resolve(run()).then(({ data }) => ({
        data: Array.isArray(data) ? (data[0] ?? null) : data,
        error: null,
      }));
    q.single = () =>
      Promise.resolve(run()).then(({ data }) => {
        const single = Array.isArray(data) ? data[0] : data;
        if (single == null) {
          return Promise.reject(new Error(`single: no row for ${table}`));
        }
        return { data: single, error: null };
      });

    return q;
  };

  return {
    from: (table: string) => build(table),
    auth: { getUser: jest.fn() },
  } as unknown as SupabaseClient;
}

/**
 * A base active event row. The window is deliberately clock-safe: the start
 * is far in the past and the end far in the future, so `ensureStatus` is a
 * no-op regardless of the real system clock (a test must never depend on
 * "what time it is").
 */
function activeEventRow(overrides: Row = {}): Row {
  return {
    id: 'event-1',
    created_by: 'admin-1',
    status: 'active',
    started_at: '2026-01-01T00:00:00Z',
    ended_at: null,
    resulting_project_id: null,
    name: 'Open Jam',
    description: 'A public jam',
    scheduled_start_at: '2026-01-01T00:00:00Z',
    scheduled_end_at: '2999-01-01T00:00:00Z',
    starting_project_id: null,
    jam_project_id: null,
    edit_cooldown_sec: null,
    no_result: false,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function userRow(userId: string, status = 'active'): Row {
  return {
    id: userId,
    email: `${userId}@x.com`,
    username: userId.replace('-', ''),
    display_name: userId,
    status,
  };
}

const ALICE = 'user-alice';
const BOB = 'user-bob';

function makeTables(
  overrides: {
    events?: Row[];
    users?: Row[];
    jamParticipants?: Row[];
  } = {},
) {
  return {
    jam_events: overrides.events ?? [activeEventRow()],
    users: overrides.users ?? [userRow(ALICE), userRow(BOB)],
    jam_participants: overrides.jamParticipants ?? [],
  };
}

function makeService(tables: ReturnType<typeof makeTables>) {
  return new JamService(createInMemorySupabase(tables));
}

function aliceUser(): JamSocketUser {
  return {
    id: ALICE,
    username: 'alice',
    displayName: 'Alice',
    avatarUrl: null,
  };
}

describe('JamService — UC-66 handleUserJoin', () => {
  it('happy path: active event + active account → full JamStatePayload', async () => {
    const service = makeService(makeTables());

    const state = await service.handleUserJoin(
      'event-1',
      aliceUser(),
      'socket-a',
    );

    expect(state.endsAt).toBe('2999-01-01T00:00:00Z');
    expect(state.cooldownSec).toBe(JamService.DEFAULT_COOLDOWN_SEC);
    expect(state.snapshot.notes).toEqual([]);
    expect(state.snapshot.schemaVersion).toBeDefined();
    // The socket is now the room's participant.
    expect(state.participants).toHaveLength(1);
    expect(state.participants[0]).toMatchObject({
      userId: ALICE,
      username: 'alice',
      socketId: 'socket-a',
    });
    // A `join` activity entry is recorded.
    expect(state.activity).toHaveLength(1);
    expect(state.activity[0].op).toBe('join');
    // The participant row was persisted (in-memory jam_participants table).
    expect(service.participantCount('event-1')).toBe(1);
  });

  it('2.E1: unknown event → NotFoundException', async () => {
    const service = makeService(makeTables());
    await expect(
      service.handleUserJoin('missing', aliceUser(), 'socket-a'),
    ).rejects.toThrow(NotFoundException);
    await expect(
      service.handleUserJoin('missing', aliceUser(), 'socket-a'),
    ).rejects.toThrow('Jam event not found');
  });

  it('2.E2: event not started yet → ConflictException code EVENT_NOT_STARTED', async () => {
    const service = makeService(
      makeTables({
        events: [
          activeEventRow({
            status: 'scheduled',
            scheduled_start_at: '2099-01-01T00:00:00Z',
            started_at: null,
          }),
        ],
      }),
    );

    const caught = await service
      .handleUserJoin('event-1', aliceUser(), 'socket-a')
      .then(
        () => null,
        (err: unknown) => err,
      );
    expect(caught).toBeInstanceOf(ConflictException);
    expect((caught as ConflictException).getResponse()).toEqual({
      code: 'EVENT_NOT_STARTED',
      message: 'The jam has not started yet',
    });
  });

  it('2.E3: event already ended → ConflictException code EVENT_COMPLETED', async () => {
    const service = makeService(
      makeTables({
        events: [
          activeEventRow({
            status: 'ended',
            scheduled_end_at: '2026-01-01T00:00:00Z',
            ended_at: '2026-01-01T00:00:00Z',
          }),
        ],
      }),
    );

    const caught = await service
      .handleUserJoin('event-1', aliceUser(), 'socket-a')
      .then(
        () => null,
        (err: unknown) => err,
      );
    expect(caught).toBeInstanceOf(ConflictException);
    expect((caught as ConflictException).getResponse()).toEqual({
      code: 'EVENT_COMPLETED',
      message: 'The jam has already ended',
    });
  });

  it('3.E1: suspended account → ForbiddenException code ACCOUNT_NOT_ACTIVE', async () => {
    const service = makeService(
      makeTables({
        users: [userRow(ALICE, 'suspended')],
      }),
    );

    const caught = await service
      .handleUserJoin('event-1', aliceUser(), 'socket-a')
      .then(
        () => null,
        (err: unknown) => err,
      );
    expect(caught).toBeInstanceOf(ForbiddenException);
    expect(caught).toMatchObject({
      status: 403,
      response: { code: 'ACCOUNT_NOT_ACTIVE' },
    });
  });

  it('4.E1: room at the participant cap → ConflictException code ROOM_FULL', async () => {
    // Pre-fill the room up to the cap, then a NEW user is refused.
    const filled = Array.from(
      { length: JamService.MAX_JAM_PARTICIPANTS },
      (_, i) => userRow(`user-${i}`),
    );
    const service = makeService(
      makeTables({ users: [...filled, userRow(ALICE)] }),
    );

    const seedUser = (i: number): JamSocketUser => ({
      id: `user-${i}`,
      username: `u${i}`,
      displayName: `U${i}`,
      avatarUrl: null,
    });

    // Seed the room's participants up to the cap without Alice.
    for (let i = 0; i < JamService.MAX_JAM_PARTICIPANTS; i += 1) {
      await service.handleUserJoin('event-1', seedUser(i), `socket-${i}`);
    }

    const caught = await service
      .handleUserJoin('event-1', aliceUser(), 'socket-alice')
      .then(
        () => null,
        (err: unknown) => err,
      );
    expect(caught).toBeInstanceOf(ConflictException);
    expect((caught as ConflictException).getResponse()).toEqual({
      code: 'ROOM_FULL',
      message: 'The jam room is full',
    });

    // A REJOIN of a current participant (5.1) is still allowed — distinct
    // user count stays at the cap, so capacity is measured per user, not tab.
    await expect(
      service.handleUserJoin('event-1', seedUser(0), 'socket-0-rejoin'),
    ).resolves.toBeDefined();
  });
});

describe('JamService — UC-66 listEvents / getEventById / ensureStatus', () => {
  it('lists events and returns the live participant count', async () => {
    const service = makeService(makeTables());
    const events = await service.listEvents({});
    expect(events).toHaveLength(1);
    expect(events[0].id).toBe('event-1');
    expect(events[0].currentParticipantCount).toBe(0);
  });

  it('getEventById → NotFoundException when missing', async () => {
    const service = makeService(makeTables());
    await expect(service.getEventById('nope')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('ensureStatus promotes a scheduled event past its start to active', async () => {
    const service = makeService(
      makeTables({
        events: [
          activeEventRow({
            status: 'scheduled',
            scheduled_start_at: '2020-01-01T00:00:00Z',
            scheduled_end_at: '2020-01-01T01:00:00Z',
            started_at: null,
          }),
        ],
      }),
    );

    const event = await service.getEventById('event-1');
    // Past its start AND its end → it should have advanced all the way to ended.
    expect(event.status).toBe('ended');
    expect(event.ended_at).not.toBeNull();
  });

  it('errorPayload maps NotFoundException to EVENT_NOT_FOUND', () => {
    expect(
      JamService.errorPayload(new NotFoundException('Jam event not found')),
    ).toEqual({
      code: 'EVENT_NOT_FOUND',
      message: 'Jam event not found',
    });
  });
});
