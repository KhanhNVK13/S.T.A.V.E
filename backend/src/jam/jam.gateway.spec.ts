import type {
  SupabaseClient,
  User as SupabaseUser,
} from '@supabase/supabase-js';
import { JamGateway } from './jam.gateway';
import { JamService } from './jam.service';

type Row = Record<string, unknown>;

/**
 * UC-67 — gateway-level tests for the edit pipeline. The service is a real
 * `JamService` fed by the same in-RAM Supabase mock as `jam.service.spec.ts`
 * (duplicated here on purpose: each spec file is self-contained, the shared
 * mock shape is proven). A fake socket carries `data` exactly as
 * `handleConnection` builds it, so only the socket plumbing is faked.
 */

function createInMemorySupabase(tables: Record<string, Row[]>): SupabaseClient {
  const state: Record<string, Row[]> = {};
  for (const key of Object.keys(tables)) {
    state[key] = (tables[key] ?? []).map((row) => ({ ...row }));
  }

  const build = (table: string): any => {
    const rows = (state[table] ??= []);
    const preds: Array<(row: Row) => boolean> = [];
    let mode: 'select' | 'update' | 'insert' | 'upsert' = 'select';
    let payload: Row = {};
    let onConflict: string | undefined;

    const q: any = {};
    q.select = () => q;
    q.eq = (col: string, val: unknown) => {
      preds.push((row: Row) => row[col] === val);
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
            data: rows.filter((r) => preds.every((p) => p(r))),
            error: null,
          };
        case 'update':
          for (const row of rows) {
            if (preds.every((p) => p(row))) Object.assign(row, payload);
          }
          return { data: null, error: null };
        case 'insert':
          rows.push({ ...payload });
          return { data: payload, error: null };
        case 'upsert': {
          const keys = (onConflict ?? '')
            .split(',')
            .map((k) => k.trim())
            .filter(Boolean);
          const existing = keys.length
            ? rows.find((row) => keys.every((k) => row[k] === payload[k]))
            : undefined;
          if (existing) {
            Object.assign(existing, payload);
            return { data: existing, error: null };
          }
          rows.push({ ...payload });
          return { data: payload, error: null };
        }
      }
    };

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

    return q;
  };

  return {
    from: (table: string) => build(table),
    auth: { getUser: jest.fn() },
    _state: state,
  } as unknown as SupabaseClient;
}

const ALICE = 'user-alice';
// The gateway runs class-validator on socket payloads (`@IsUUID()` on
// `jamId` / `note.id` / `note.trackId` — see edit-jam-note.dto.ts), so every
// fixture id below is a real UUID, matching what the socket layer sees in
// production (event ids are Postgres `uuid` columns).
const EVENT_ID = 'e0000000-0000-4000-8000-000000000001';
const OTHER_EVENT_ID = 'e0000000-0000-4000-8000-000000000002';
const NOTE_ID = 'c3333333-3333-4333-8333-333333333333';
const OTHER_NOTE_ID = 'd5555555-5555-4555-8555-555555555555';
const GHOST_TRACK_ID = 'd4444444-4444-4444-8444-444444444444';
const TRACK_ID = 'a1111111-1111-4111-8111-111111111111';

const TRACK: Row = {
  id: TRACK_ID,
  name: 'Piano',
  order: 0,
  color: '#000000',
  muted: false,
  solo: false,
  volume: 1,
  pan: 0,
  instrument: 'Acoustic Grand Piano',
};

function gatewayTables(): Record<string, Row[]> {
  return {
    jam_events: [
      {
        id: EVENT_ID,
        created_by: 'admin-1',
        status: 'active',
        started_at: '2026-01-01T00:00:00Z',
        ended_at: null,
        resulting_project_id: null,
        name: 'Open Jam',
        description: null,
        scheduled_start_at: '2026-01-01T00:00:00Z',
        scheduled_end_at: '2999-01-01T00:00:00Z',
        starting_project_id: null,
        jam_project_id: 'proj-1',
        edit_cooldown_sec: 5,
        no_result: false,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
    ],
    users: [
      {
        id: ALICE,
        email: 'alice@x.com',
        username: 'alice',
        display_name: 'Alice',
        status: 'active',
      },
    ],
    jam_participants: [],
    projects: [{ id: 'proj-1', owner_id: 'admin-1' }],
    branches: [{ id: 'br-1', project_id: 'proj-1', is_default: true }],
    drafts: [
      {
        branch_id: 'br-1',
        user_id: 'admin-1',
        snapshot: {
          schemaVersion: 3,
          meta: { tempo: 120, timeSignature: [4, 4], ppq: 480 },
          tracks: [TRACK],
          notes: [],
        },
      },
    ],
  };
}

function makeGateway() {
  const tables = gatewayTables();
  const supabase = createInMemorySupabase(tables);
  const service = new JamService(supabase);
  const gateway = new JamGateway(supabase, service);
  const roomEmits: Array<{ room: string; event: string; payload: unknown }> =
    [];
  (gateway as unknown as { server: unknown }).server = {
    to: (room: string) => ({
      except: jest.fn().mockReturnThis(),
      emit: jest.fn((event: string, payload: unknown) => {
        roomEmits.push({ room, event, payload });
      }),
    }),
  };
  const state = (supabase as unknown as { _state: Record<string, Row[]> })
    ._state;
  return { gateway, service, roomEmits, state };
}

function fakeJammedSocket(overrides: { eventId?: string | null } = {}): any {
  const emitted: Array<{ event: string; payload: unknown }> = [];
  const user = {
    id: ALICE,
    email: 'alice@x.com',
  } as unknown as SupabaseUser;
  // `eventId` defaults to the live event; an explicit `null` (the "never
  // joined" case) must stay null — hence `in` rather than `??`.
  const eventId = 'eventId' in overrides ? overrides.eventId : EVENT_ID;
  const socket: any = {
    id: 'socket-alice',
    data: {
      user,
      participant: {
        userId: ALICE,
        username: 'alice',
        displayName: 'Alice',
        avatarUrl: null,
        socketId: 'socket-alice',
        joinedAt: new Date().toISOString(),
        lastActiveAt: new Date().toISOString(),
      },
      eventId,
      sessionId: 'session-1',
    },
    emit: jest.fn((event: string, payload: unknown) => {
      emitted.push({ event, payload });
    }),
    disconnect: jest.fn(),
    _emitted: emitted,
  };
  return socket;
}

const NEW_NOTE = {
  id: NOTE_ID,
  trackId: TRACK_ID,
  midi: 64,
  startTick: 0,
  durationTicks: 480,
  velocity: 80,
};

describe('JamGateway — UC-67 handleEditNote / handleEditAlias', () => {
  it('applies a valid note and broadcasts `jam:note_updated` to the whole room', async () => {
    const { gateway, service, roomEmits } = makeGateway();
    const socket = fakeJammedSocket();

    await gateway.handleEditNote(socket, {
      jamId: EVENT_ID,
      action: 'add',
      note: NEW_NOTE,
      clientTimestamp: 123,
    });

    expect(socket.emit).not.toHaveBeenCalled(); // no error on the sender path
    expect(roomEmits).toHaveLength(1);
    const [broadcast] = roomEmits;
    expect(broadcast.room).toBe(`jam:${EVENT_ID}`);
    expect(broadcast.event).toBe('jam:note_updated');
    expect(broadcast.payload).toMatchObject({
      jamId: EVENT_ID,
      action: 'add',
      note: NEW_NOTE,
      userId: ALICE,
      username: 'alice',
    });
    // The room's RAM snapshot carries the note.
    expect(service.getRoom(EVENT_ID)!.snapshot.notes).toHaveLength(1);
    expect(service.getRoom(EVENT_ID)!.snapshot.notes[0]).toMatchObject({
      id: NOTE_ID,
      pitch: 64,
    });
  });

  it('drops an edit aimed at a room the socket is not in (JAM_ROOM_NOT_FOUND)', async () => {
    const { gateway } = makeGateway();
    const socket = fakeJammedSocket();

    await gateway.handleEditNote(socket, {
      jamId: OTHER_EVENT_ID,
      action: 'add',
      note: NEW_NOTE,
      clientTimestamp: 123,
    });

    expect(socket.emit).toHaveBeenCalledWith(
      'jam:error',
      expect.objectContaining({ code: 'JAM_ROOM_NOT_FOUND' }),
    );
  });

  it('a socket that never joined any room gets a neutral error, not a crash', async () => {
    const { gateway } = makeGateway();
    const socket = fakeJammedSocket({ eventId: null });

    await gateway.handleEditNote(socket, {
      jamId: EVENT_ID,
      action: 'add',
      note: NEW_NOTE,
      clientTimestamp: 123,
    });

    expect(socket.emit).toHaveBeenCalledWith(
      'jam:error',
      expect.objectContaining({ code: 'JAM_ROOM_NOT_FOUND' }),
    );
  });

  it('3.E1: an unauthenticated socket is rejected and disconnected', async () => {
    const { gateway } = makeGateway();
    const socket: any = {
      id: 'socket-x',
      data: undefined,
      emit: jest.fn(),
      disconnect: jest.fn(),
      _emitted: [] as unknown[],
    };
    socket.emit.mockImplementation((event: string, payload: unknown) =>
      socket._emitted.push({ event, payload }),
    );

    await gateway.handleEditNote(socket, {
      jamId: EVENT_ID,
      action: 'add',
      note: NEW_NOTE,
      clientTimestamp: 123,
    });

    expect(socket.emit).toHaveBeenCalledWith(
      'jam:error',
      expect.objectContaining({ code: 'UNAUTHORIZED' }),
    );
    expect(socket.disconnect).toHaveBeenCalledWith(true);
  });

  it('2.E1: a cooldown rejection emits `jam:cooldown_active` to the sender only', async () => {
    const { gateway, service, roomEmits } = makeGateway();
    const socket = fakeJammedSocket();

    // Prime Alice's cooldown with a first accepted edit (service-level,
    // same room instance the gateway will use).
    await service.handleEditNote(
      { id: ALICE, username: 'alice', displayName: 'Alice', avatarUrl: null },
      {
        jamId: EVENT_ID,
        action: 'add',
        note: NEW_NOTE,
        clientTimestamp: 1,
      },
    );

    await gateway.handleEditNote(socket, {
      jamId: EVENT_ID,
      action: 'add',
      note: { ...NEW_NOTE, id: OTHER_NOTE_ID },
      clientTimestamp: 2,
    });

    const cooldown = socket._emitted.find(
      (e: { event: string }) => e.event === 'jam:cooldown_active',
    );
    expect(cooldown).toBeDefined();
    expect(cooldown.payload).toMatchObject({
      jamId: EVENT_ID,
      remainingSeconds: expect.any(Number),
    });
    // No new note was applied to the room and nothing was re-broadcast.
    expect(roomEmits).toHaveLength(0);
    expect(service.getRoom(EVENT_ID)!.snapshot.notes).toHaveLength(1);
  });

  it('5.E1: an ended event → `jam:event_ended` is broadcast + sender gets the error', async () => {
    const { gateway, state, roomEmits } = makeGateway();
    const socket = fakeJammedSocket();

    // Force the event row to ended, as the admin ending the jam does.
    state.jam_events[0].status = 'ended';

    await gateway.handleEditNote(socket, {
      jamId: EVENT_ID,
      action: 'add',
      note: NEW_NOTE,
      clientTimestamp: 3,
    });

    expect(
      socket._emitted.some(
        (e: { event: string; payload: unknown }) =>
          e.event === 'jam:error' &&
          (e.payload as { code?: string }).code === 'JAM_EVENT_ENDED',
      ),
    ).toBe(true);
    const ended = roomEmits.find((e) => e.event === 'jam:event_ended');
    expect(ended).toBeDefined();
    expect(ended!.room).toBe(`jam:${EVENT_ID}`);
  });

  it('7.E1: malformed note data is rejected with INVALID_NOTE_DATA (no note lands)', async () => {
    const { gateway, service } = makeGateway();
    const socket = fakeJammedSocket();

    // midi out of the 0–127 range (BR-71).
    await gateway.handleEditNote(socket, {
      jamId: EVENT_ID,
      action: 'add',
      note: { ...NEW_NOTE, midi: 200 },
      clientTimestamp: 4,
    });
    expect(
      socket._emitted.some((e: { event: string }) => e.event === 'jam:error'),
    ).toBe(true);
    // The gateway's DTO validation rejects 7.E1 BEFORE the service runs,
    // so the room was never hydrated at all.
    expect(service.getRoom(EVENT_ID)).toBeUndefined();

    // And the alias handler is the same pipeline.
    const socket2 = fakeJammedSocket();
    await gateway.handleEditAlias(socket2, {
      jamId: EVENT_ID,
      action: 'add',
      note: { ...NEW_NOTE, durationTicks: 0 }, // duration < 1 → 7.E1
      clientTimestamp: 5,
    });
    expect(
      socket2._emitted.some(
        (e: { event: string; payload: unknown }) =>
          e.event === 'jam:error' &&
          (e.payload as { code?: string }).code === 'INVALID_NOTE_DATA',
      ),
    ).toBe(true);
    expect(service.getRoom(EVENT_ID)).toBeUndefined();
  });

  it('7.E2: a note on a track not in the snapshot is rejected with TRACK_NOT_FOUND', async () => {
    const { gateway, service } = makeGateway();
    const socket = fakeJammedSocket();

    // A well-formed UUID that is NOT one of the room's tracks → the service
    // rejects it as TRACK_NOT_FOUND (7.E2), and nothing is written.
    await gateway.handleEditNote(socket, {
      jamId: EVENT_ID,
      action: 'add',
      note: { ...NEW_NOTE, trackId: GHOST_TRACK_ID },
      clientTimestamp: 6,
    });

    expect(
      socket._emitted.some(
        (e: { event: string; payload: unknown }) =>
          e.event === 'jam:error' &&
          (e.payload as { code?: string }).code === 'TRACK_NOT_FOUND',
      ),
    ).toBe(true);
    expect(service.getRoom(EVENT_ID)!.snapshot.notes).toHaveLength(0);
  });
});

describe('JamGateway — onModuleInit wires the sweep listener (12.E1)', () => {
  it('broadcasts `jam:storage_warning` for each warning the sweep reports', () => {
    const { gateway, service } = makeGateway();
    const emits: Array<{ room: string; event: string; payload: unknown }> = [];
    (gateway as unknown as { server: unknown }).server = {
      to: (room: string) => ({
        emit: jest.fn((event: string, payload: unknown) => {
          emits.push({ room, event, payload });
        }),
      }),
    };

    gateway.onModuleInit();

    // Drive the exact callback the gateway attached.
    const listener = (
      service as unknown as {
        sweepListener:
          | ((e: {
              endedEvents: unknown[];
              storageWarnings: unknown[];
            }) => void)
          | null;
      }
    ).sweepListener;
    expect(listener).not.toBeNull();
    listener!({
      endedEvents: [],
      storageWarnings: [{ jamId: EVENT_ID, consecutiveFlushFailures: 3 }],
    });

    expect(emits).toEqual([
      {
        room: `jam:${EVENT_ID}`,
        event: 'jam:storage_warning',
        payload: { jamId: EVENT_ID, consecutiveFlushFailures: 3 },
      },
    ]);
  });
});
