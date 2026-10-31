import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { DraftTrack } from '@stave/shared-types';
import { JAM_MAX_FLUSH_FAILURES } from '@stave/shared-types';
import { JamService, JamSocketUser } from './jam.service';
import type { EditJamNoteRequestDto } from './dto/edit-jam-note.dto';

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
function createInMemorySupabase(
  tables: Record<string, Row[]>,
  options: {
    failUpsertTables?: Set<string>;
    /** select() on these tables returns a non-null error (UC-68 2.E2 hook). */
    failSelectTables?: Set<string>;
  } = {},
): SupabaseClient {
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
    let limitCount: number | null = null;
    q.limit = (count: number) => {
      limitCount = count;
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

    const run = (): {
      data: Row | Row[] | null;
      error: { message: string } | null;
    } => {
      switch (mode) {
        case 'select': {
          // UC-68 2.E2 test hook: a table in `failSelectTables` always
          // returns an error instead of rows.
          if (options.failSelectTables?.has(table)) {
            return {
              data: [],
              error: { message: `select failed on ${table} (simulated)` },
            };
          }
          const matched = rows.filter((r) => filterRow(r, preds));
          return {
            data: limitCount != null ? matched.slice(0, limitCount) : matched,
            error: null,
          };
        }
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
          // 12.E1 test hook: a table in `failUpsertTables` always rejects.
          if (options.failUpsertTables?.has(table)) {
            return {
              data: null,
              error: { message: `upsert rejected on ${table} (simulated)` },
            };
          }
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
      Promise.resolve(run()).then(({ data, error }) => ({
        data: Array.isArray(data) ? (data[0] ?? null) : data,
        error,
      }));
    q.single = () =>
      Promise.resolve(run()).then(({ data, error }) => {
        const single = Array.isArray(data) ? data[0] : data;
        if (single == null) {
          return Promise.reject(
            new Error(error?.message ?? `single: no row for ${table}`),
          );
        }
        return { data: single, error };
      });

    return q;
  };

  return {
    from: (table: string) => build(table),
    auth: { getUser: jest.fn() },
    // Test hook: the in-memory rows so a spec can assert `edit_count` etc.
    _state: state,
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

// ── UC-67 helpers ────────────────────────────────────────────────────────────

/**
 * A clock-safe active event that owns a jam project, so `getOrCreateRoom`
 * hydrates its snapshot from the `drafts` table (which carries a real track
 * + a real note) instead of the empty default. `edit_cooldown_sec` is pinned
 * so the cooldown test is deterministic.
 */
function jamEventRow(overrides: Row = {}): Row {
  return activeEventRow({
    jam_project_id: 'proj-1',
    edit_cooldown_sec: 5,
    ...overrides,
  });
}

const JAM_TRACK: DraftTrack = {
  id: 'track-1',
  name: 'Piano',
  order: 0,
  color: '#000000',
  muted: false,
  solo: false,
  volume: 1,
  pan: 0,
  instrument: 'Acoustic Grand Piano',
};

const JAM_SEED_NOTE = {
  id: 'note-1',
  trackId: 'track-1',
  pitch: 60,
  start: 480,
  duration: 480,
  velocity: 80,
};

function jamTables(
  overrides: {
    events?: Row[];
    users?: Row[];
    jamParticipants?: Row[];
  } = {},
) {
  return {
    jam_events: overrides.events ?? [jamEventRow()],
    users: overrides.users ?? [
      userRow(ALICE),
      userRow(BOB),
      userRow('admin-1'),
    ],
    jam_participants: overrides.jamParticipants ?? [],
    projects: [{ id: 'proj-1', owner_id: 'admin-1' }],
    branches: [{ id: 'br-1', project_id: 'proj-1', is_default: true }],
    drafts: [
      {
        branch_id: 'br-1',
        user_id: 'admin-1',
        snapshot: {
          schemaVersion: 3,
          meta: { tempo: 120, timeSignature: [4, 4], ppq: 480 },
          tracks: [JAM_TRACK],
          notes: [{ ...JAM_SEED_NOTE }],
        },
      },
    ],
  };
}

/**
 * Build a service + expose the in-memory DB so a spec can assert on the
 * persisted `jam_participants.edit_count` (Post-condition #5) and drive the
 * 12.E1 flush-failure scenarios. `state` is the live row store the mock
 * mutates; `failTables` is the Set the mock consults for upsert rejections,
 * and is itself mutable so a test can recover on demand.
 */
function makeJamService(
  tables: ReturnType<typeof jamTables>,
  options?: { failUpsertTables?: Set<string> },
) {
  const failTables = options?.failUpsertTables ?? new Set<string>();
  const db = createInMemorySupabase(tables, { failUpsertTables: failTables });
  const service = new JamService(db);
  const state = (db as unknown as { _state: Record<string, Row[]> })._state;
  return { service, state, failTables };
}

/** A valid `EditJamNoteRequestDto`-shaped object for UC-67 tests. */
function editDto(overrides: Partial<EditJamNoteRequestDto> = {}) {
  return {
    jamId: 'event-1',
    action: 'add' as const,
    note: {
      id: 'note-2',
      trackId: 'track-1',
      midi: 64,
      startTick: 0,
      durationTicks: 480,
      velocity: 80,
    },
    clientTimestamp: 0,
    ...overrides,
  };
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

// ── UC-67 — handleEditNote (LWW note ops, BR-68/69/71, 12.E1 sweep) ────────

describe('JamService — UC-67 handleEditNote', () => {
  it('add: note lands in the RAM snapshot, room goes dirty, edit_count bumps', async () => {
    const { service, state } = makeJamService(jamTables());

    const payload = await service.handleEditNote(
      aliceUser(),
      editDto({ action: 'add', note: { ...editDto().note, id: 'note-2' } }),
    );

    expect(payload).toMatchObject({
      jamId: 'event-1',
      action: 'add',
      note: {
        id: 'note-2',
        trackId: 'track-1',
        midi: 64,
        startTick: 0,
        durationTicks: 480,
        velocity: 80,
      },
      userId: ALICE,
      username: 'alice',
    });
    expect(typeof payload.timestamp).toBe('number');

    const room = service.getRoom('event-1')!;
    // The snapshot now carries the seeded note + the new one (LWW applied).
    const ids = room.snapshot.notes.map((n) => n.id).sort();
    expect(ids).toEqual(['note-1', 'note-2']);
    // Post-condition #3/#4: cooldown stamped + room flagged dirty for the sweep.
    expect(room.lastEditAtByUser[ALICE]).toBeGreaterThan(0);
    expect(room.isDirty).toBe(true);
    // Post-condition #5: the DB counter was bumped (in-memory table).
    expect(state.jam_participants).toContainEqual(
      expect.objectContaining({
        event_id: 'event-1',
        user_id: ALICE,
        edit_count: 1,
      }),
    );
    // An activity line was appended for the feed.
    expect(room.recentActivities.some((a) => a.op === 'add')).toBe(true);
  });

  it('update: overwrites the matching note in place (LWW)', async () => {
    const { service } = makeJamService(jamTables());

    const payload = await service.handleEditNote(
      aliceUser(),
      editDto({
        action: 'update',
        note: {
          id: 'note-1',
          trackId: 'track-1',
          midi: 72,
          startTick: 960,
          durationTicks: 240,
          velocity: 100,
        },
      }),
    );

    expect(payload.note).toMatchObject({
      midi: 72,
      startTick: 960,
      durationTicks: 240,
      velocity: 100,
    });
    const room = service.getRoom('event-1')!;
    const updated = room.snapshot.notes.find((n) => n.id === 'note-1')!;
    expect(updated).toMatchObject({
      pitch: 72,
      start: 960,
      duration: 240,
      velocity: 100,
    });
    // The note array did not grow — a real in-place update.
    expect(room.snapshot.notes).toHaveLength(1);
  });

  it('delete: removes the note from the RAM snapshot', async () => {
    const { service } = makeJamService(jamTables());

    await service.handleEditNote(
      aliceUser(),
      editDto({
        action: 'delete',
        note: {
          id: 'note-1',
          trackId: 'track-1',
          midi: 60,
          startTick: 480,
          durationTicks: 480,
          velocity: 80,
        },
      }),
    );

    const room = service.getRoom('event-1')!;
    expect(room.snapshot.notes).toHaveLength(0);
    expect(room.isDirty).toBe(true);
  });

  it('an empty snapshot (no jam project) gets a seeded piano track so notes can land', async () => {
    const { service } = makeJamService(
      jamTables({
        events: [jamEventRow({ jam_project_id: null })],
      }),
    );

    // The default snapshot has `tracks: []` — the room must be seeded with a
    // piano track or every edit is rejected by 7.E2.
    const room = service.getRoom('event-1');
    expect(room).toBeUndefined(); // not created until an op or join

    // An add against the seeded track id succeeds end-to-end.
    const payload = await service.handleEditNote(
      aliceUser(),
      editDto({
        note: {
          id: 'note-seed',
          trackId: '00000000-0000-4000-8000-000000000001',
          midi: 60,
          startTick: 0,
          durationTicks: 480,
          velocity: 80,
        },
      }),
    );

    expect(payload.note.id).toBe('note-seed');
    const created = service.getRoom('event-1')!;
    expect(created.snapshot.tracks).toHaveLength(1);
    expect(created.snapshot.tracks[0]).toMatchObject({
      instrument: 'Acoustic Grand Piano',
    });
    expect(created.snapshot.notes).toHaveLength(1);
  });

  it('8.E1 (LWW concurrency): two users editing the same note — last write wins, nobody is rejected', async () => {
    const { service } = makeJamService(jamTables());

    const bobUser: JamSocketUser = {
      id: BOB,
      username: 'bob',
      displayName: 'Bob',
      avatarUrl: null,
    };
    await service.handleEditNote(
      aliceUser(),
      editDto({
        action: 'update',
        note: {
          id: 'note-1',
          trackId: 'track-1',
          midi: 60,
          startTick: 480,
          durationTicks: 480,
          velocity: 90,
        },
      }),
    );
    // Alice's cooldown is now armed; Bob's is not, and his write must still
    // land (3.1 — no queue, no block, LWW by server timestamp).
    const payload = await service.handleEditNote(
      bobUser,
      editDto({
        action: 'update',
        note: {
          id: 'note-1',
          trackId: 'track-1',
          midi: 60,
          startTick: 480,
          durationTicks: 480,
          velocity: 120,
        },
      }),
    );

    const room = service.getRoom('event-1')!;
    expect(room.snapshot.notes[0].velocity).toBe(120); // Bob's value won
    expect(payload.userId).toBe(BOB);
  });

  it('2.E1: editing inside the cooldown window → ConflictException COOLDOWN_ACTIVE with remainingSeconds', async () => {
    const { service } = makeJamService(jamTables());

    await service.handleEditNote(aliceUser(), editDto());

    const caught = await service
      .handleEditNote(
        aliceUser(),
        editDto({ note: { ...editDto().note, id: 'note-3' } }),
      )
      .then(
        () => null,
        (err: unknown) => err,
      );

    expect(caught).toBeInstanceOf(ConflictException);
    const body = (caught as ConflictException).getResponse() as Record<
      string,
      unknown
    >;
    expect(body.code).toBe('COOLDOWN_ACTIVE');
    expect(typeof body.remainingSeconds).toBe('number');
    // The snapshot did NOT change — the second op was rejected.
    expect(service.getRoom('event-1')!.snapshot.notes.map((n) => n.id)).toEqual(
      ['note-1', 'note-2'],
    );
  });

  it('5.E1: an ended event refuses every edit with JAM_EVENT_ENDED', async () => {
    const { service } = makeJamService(
      jamTables({
        events: [
          jamEventRow({ status: 'ended', ended_at: '2026-01-02T00:00:00Z' }),
        ],
      }),
    );

    const caught = await service.handleEditNote(aliceUser(), editDto()).then(
      () => null,
      (err: unknown) => err,
    );

    expect(caught).toBeInstanceOf(ConflictException);
    expect((caught as ConflictException).getResponse()).toMatchObject({
      code: 'JAM_EVENT_ENDED',
    });
    // No room was created for an ended event — the write path is closed
    // before hydration (BR-70).
    expect(service.getRoom('event-1')).toBeUndefined();
  });

  it('7.E1: out-of-range MIDI data → BadRequestException INVALID_NOTE_DATA', async () => {
    const { service } = makeJamService(jamTables());

    const caught = await service
      .handleEditNote(
        aliceUser(),
        editDto({
          note: { ...editDto().note, midi: 130, durationTicks: 0 },
        }),
      )
      .then(
        () => null,
        (err: unknown) => err,
      );

    expect(caught).toBeInstanceOf(BadRequestException);
    expect((caught as BadRequestException).getResponse()).toMatchObject({
      code: 'INVALID_NOTE_DATA',
    });
  });

  it('7.E2: a note on a missing track → NotFoundException TRACK_NOT_FOUND', async () => {
    const { service } = makeJamService(jamTables());

    const caught = await service
      .handleEditNote(
        aliceUser(),
        editDto({ note: { ...editDto().note, trackId: 'no-such-track' } }),
      )
      .then(
        () => null,
        (err: unknown) => err,
      );

    expect(caught).toBeInstanceOf(NotFoundException);
    expect((caught as NotFoundException).getResponse()).toMatchObject({
      code: 'TRACK_NOT_FOUND',
    });
  });

  it('5.E2: an unknown event → NotFoundException JAM_ROOM_NOT_FOUND (reload path)', async () => {
    const { service } = makeJamService(jamTables());

    const caught = await service
      .handleEditNote(aliceUser(), editDto({ jamId: 'missing' }))
      .then(
        () => null,
        (err: unknown) => err,
      );

    expect(caught).toBeInstanceOf(NotFoundException);
    expect((caught as NotFoundException).getResponse()).toMatchObject({
      code: 'JAM_ROOM_NOT_FOUND',
    });
  });
});

describe('JamService — UC-67 sweep + flush failures (BR-116, 12.E1)', () => {
  it('12.E1: a failing flush stays dirty, retries, and warns past the threshold', async () => {
    const { service, state, failTables } = makeJamService(jamTables(), {
      failUpsertTables: new Set(['drafts']),
    });

    // An edit makes the room dirty (the flush target is the drafts upsert).
    await service.handleEditNote(aliceUser(), editDto());
    const room = service.getRoom('event-1')!;
    expect(room.isDirty).toBe(true);

    const events: Array<{
      endedEvents: unknown[];
      storageWarnings: Array<{
        jamId: string;
        consecutiveFlushFailures: number;
      }>;
    }> = [];
    service.settleJamSweep((batch) => events.push(batch));

    // Three failing sweeps → the counter climbs and the warning fires at 3.
    await service.sweep();
    await service.sweep();
    expect(room.isDirty).toBe(true); // 12.E1: retry, never lose contributions
    expect(room.consecutiveFlushFailures).toBe(2);
    await service.sweep();
    expect(room.consecutiveFlushFailures).toBe(3);
    expect(events.at(-1)!.storageWarnings).toEqual([
      { jamId: 'event-1', consecutiveFlushFailures: 3 },
    ]);
    expect(JAM_MAX_FLUSH_FAILURES).toBe(3);

    // The snapshot is still NOT persisted while the DB is down.
    const persisted = state.drafts[0] as unknown as {
      snapshot: { notes: Array<{ id: string }> };
    };
    expect(persisted.snapshot.notes.map((n) => n.id)).toEqual(['note-1']);

    // Recovery: the DB comes back, the next flush succeeds and the counter
    // resets — the client's banner clears with a `0` warning.
    failTables.delete('drafts');
    await service.sweep();
    expect(room.isDirty).toBe(false);
    expect(room.consecutiveFlushFailures).toBe(0);
    expect(events.at(-1)!.storageWarnings).toEqual([
      { jamId: 'event-1', consecutiveFlushFailures: 0 },
    ]);
    // And the finally-written snapshot now carries the contribution.
    expect(
      (
        state.drafts[0] as unknown as {
          snapshot: { notes: Array<{ id: string }> };
        }
      ).snapshot.notes
        .map((n) => n.id)
        .sort(),
    ).toEqual(['note-1', 'note-2']);
  });
});

// ── UC-68 helpers ────────────────────────────────────────────────────────────

/**
 * Tables for an ended event whose result project carries a frozen snapshot:
 * head commit on the default branch (the UC-95 commit) plus a draft
 * fallback row. Clock-safe: everything is far in the past, so
 * `ensureStatus` is a no-op.
 */
function endedResultTables(
  overrides: {
    event?: Row;
    participants?: Row[];
    branches?: Row[];
    commits?: Row[];
    drafts?: Row[];
  } = {},
) {
  const snapshot = {
    schemaVersion: 3,
    meta: { tempo: 120, timeSignature: [4, 4], ppq: 480 },
    tracks: [JAM_TRACK],
    notes: [{ ...JAM_SEED_NOTE }],
  };
  return {
    jam_events: [
      {
        ...activeEventRow({
          status: 'ended',
          started_at: '2026-01-01T00:00:00Z',
          ended_at: '2026-01-01T01:00:00Z',
          scheduled_start_at: '2026-01-01T00:00:00Z',
          scheduled_end_at: '2026-01-01T01:00:00Z',
          resulting_project_id: 'proj-result',
        }),
        ...overrides.event,
      },
    ],
    users: [userRow(ALICE), userRow(BOB)],
    jam_participants: overrides.participants ?? [
      // 2.E1 — a join with edit_count 0 must NOT appear as a contributor.
      {
        event_id: 'event-1',
        user_id: 'user-carol',
        edit_count: 0,
        joined_at: '2026-01-01T00:00:00Z',
      },
      {
        event_id: 'event-1',
        user_id: ALICE,
        edit_count: 3,
        joined_at: '2026-01-01T00:00:00Z',
      },
      {
        event_id: 'event-1',
        user_id: BOB,
        edit_count: 5,
        joined_at: '2026-01-01T00:01:00Z',
      },
    ],
    projects: [{ id: 'proj-result', owner_id: 'admin-1' }],
    branches: overrides.branches ?? [
      {
        id: 'br-res',
        project_id: 'proj-result',
        is_default: true,
        head_commit_id: 'commit-res',
      },
    ],
    commits: overrides.commits ?? [{ id: 'commit-res', snapshot }],
    drafts: overrides.drafts ?? [
      { branch_id: 'br-res', user_id: 'admin-1', snapshot },
    ],
  };
}

function makeResultService(
  tables: Record<string, Row[]>,
  options: { failSelectTables?: Set<string> } = {},
) {
  const db = createInMemorySupabase(tables, options);
  return new JamService(db);
}

describe('JamService — UC-68 getJamResult', () => {
  it('happy path: ended event → frozen head-commit snapshot + ranked contributors', async () => {
    const service = makeResultService(endedResultTables());
    const result = await service.getJamResult('event-1');

    expect(result.eventId).toBe('event-1');
    expect(result.status).toBe('ended');
    expect(result.resultingProjectId).toBe('proj-result');
    expect(result.hasContributions).toBe(true);
    // The snapshot is the UC-95 head commit's, not the live room's.
    expect(result.snapshot).toEqual({
      schemaVersion: 3,
      meta: { tempo: 120, timeSignature: [4, 4], ppq: 480 },
      tracks: [JAM_TRACK],
      notes: [{ ...JAM_SEED_NOTE }],
    });
    // Ranked by most edits first; the zero-edit joiner is excluded (2.E1).
    expect(result.contributors.map((c) => c.userId)).toEqual([BOB, ALICE]);
    expect(result.contributors[0]).toMatchObject({ actionCount: 5 });
    expect(result.contributors[1]).toMatchObject({ actionCount: 3 });
  });

  it('2.E3: unknown event → NotFoundException', async () => {
    const service = makeResultService(endedResultTables());
    await expect(service.getJamResult('nope')).rejects.toThrow(
      NotFoundException,
    );
    await expect(service.getJamResult('nope')).rejects.toThrow(
      'Jam event not found',
    );
  });

  it('2.E4: event still active → BadRequestException', async () => {
    const service = makeResultService(
      endedResultTables({
        // Far-future end so `ensureStatus` cannot promote it to ended.
        event: {
          status: 'active',
          ended_at: null,
          resulting_project_id: null,
          scheduled_end_at: '2999-01-01T00:00:00Z',
        },
      }),
    );
    await expect(service.getJamResult('event-1')).rejects.toThrow(
      BadRequestException,
    );
    await expect(service.getJamResult('event-1')).rejects.toThrow(
      'Jam event has not ended yet',
    );
  });

  it('2.E1 (no_result): ended but flagged → hasContributions false, empty payload', async () => {
    const service = makeResultService(
      endedResultTables({ event: { no_result: true } }),
    );
    const result = await service.getJamResult('event-1');
    expect(result.hasContributions).toBe(false);
    expect(result.snapshot).toBeNull();
    expect(result.contributors).toEqual([]);
  });

  it('2.E1 (no contributors): nobody edited → hasContributions false', async () => {
    const service = makeResultService(endedResultTables({ participants: [] }));
    const result = await service.getJamResult('event-1');
    expect(result.hasContributions).toBe(false);
    expect(result.snapshot).toBeNull();
    expect(result.contributors).toEqual([]);
  });

  it('2.E1 (empty snapshot): no head commit, draft is empty → hasContributions false but contributors stay listed', async () => {
    const emptySnapshot = {
      schemaVersion: 3,
      meta: { tempo: 120, timeSignature: [4, 4], ppq: 480 },
      tracks: [],
      notes: [],
    };
    const service = makeResultService(
      endedResultTables({
        branches: [
          {
            id: 'br-res',
            project_id: 'proj-result',
            is_default: true,
            head_commit_id: null,
          },
        ],
        drafts: [
          { branch_id: 'br-res', user_id: 'admin-1', snapshot: emptySnapshot },
        ],
      }),
    );
    const result = await service.getJamResult('event-1');
    expect(result.hasContributions).toBe(false);
    expect(result.snapshot).toBeNull();
    // The two real editors are still credited even without a playable result.
    expect(result.contributors.map((c) => c.userId)).toEqual([BOB, ALICE]);
  });

  it('draft fallback: no head commit → the default-branch draft is the frozen snapshot', async () => {
    const service = makeResultService(
      endedResultTables({
        branches: [
          {
            id: 'br-res',
            project_id: 'proj-result',
            is_default: true,
            head_commit_id: null,
          },
        ],
      }),
    );
    const result = await service.getJamResult('event-1');
    expect(result.hasContributions).toBe(true);
    expect(result.snapshot?.notes.map((n) => n.id)).toEqual([JAM_SEED_NOTE.id]);
  });

  it('2.E2: DB failure while reading → InternalServerErrorException', async () => {
    const service = makeResultService(endedResultTables(), {
      failSelectTables: new Set(['jam_participants']),
    });
    await expect(service.getJamResult('event-1')).rejects.toThrow(
      InternalServerErrorException,
    );
    await expect(service.getJamResult('event-1')).rejects.toThrow(
      'Failed to load jam result',
    );
  });
});
