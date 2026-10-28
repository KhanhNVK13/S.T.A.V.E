import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { PresenceUser } from '@stave/shared-types';
import { CollaborationGateway } from './collaboration.gateway';
import { PresenceRegistry } from './presence-registry';

type Row = Record<string, unknown>;

const OWNER = 'owner-1';
const COLLAB = 'user-collab';
const PENDING = 'user-pending';
const OUTSIDER = 'user-outside';

/** Presence profile for a test user. */
function profile(id: string, name: string): PresenceUser {
  return {
    id,
    username: name,
    displayName: name,
    avatarUrl: null,
  };
}

/**
 * In-RAM mock of the SupabaseClient surface the gateway's handshake auth
 * touches (auth.getUser + a couple of table reads). No DB, no network.
 */
function mockSupabase(rows: Record<string, Row[]>) {
  const build = (table: string) => {
    const q: any = {};
    q.select = () => q;
    q.eq = (col: string, val: unknown) => {
      q._preds = q._preds || [];
      q._preds.push((r: Row) => r[col] === val);
      return q;
    };
    q.maybeSingle = () =>
      Promise.resolve({
        data:
          (rows[table] ?? []).find((r: Row) =>
            (q._preds ?? []).every((p) => p(r)),
          ) ?? null,
        error: null,
      });
    return q;
  };

  return {
    auth: {
      getUser: jest.fn((token: string) => {
        const ok = typeof token === 'string' && token.startsWith('valid-');
        return Promise.resolve({
          data: ok
            ? { user: { id: token.slice('valid-'.length), email: 'a@b.c' } }
            : { user: null },
          error: ok ? null : new Error('bad token'),
        });
      }),
    },
    from: build,
  } as never;
}

function fakeAccess(overrides: Record<string, unknown> = {}) {
  return {
    assertCanView: jest.fn((projectId: string, userId: string) => {
      // Outsiders and pending users → Forbidden; unknown project → 404.
      // Thrown synchronously: the gateway awaits it either way.
      if (projectId === 'missing') {
        throw new NotFoundException('Project not found');
      }
      if (userId === PENDING || userId === OUTSIDER) {
        throw new ForbiddenException('You do not have access to this project');
      }
      return Promise.resolve();
    }),
    getAccess: jest.fn(),
    ...overrides,
  };
}

function makeGateway(
  supabase: never = mockSupabase({}),
  access = fakeAccess(),
) {
  return new CollaborationGateway(supabase, access as never);
}

/** A fake Socket carrying the handshake auth + per-socket `data`. */
function fakeSocket(
  socketId: string,
  auth: Record<string, string | undefined> = {},
) {
  const emitted: Array<{ event: string; payload: unknown }> = [];
  const socket: any = {
    id: socketId,
    handshake: { auth },
    data: undefined,
    emit: jest.fn((event: string, payload: unknown) => {
      emitted.push({ event, payload });
    }),
    join: jest.fn().mockResolvedValue(undefined),
    leave: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn(),
    _emitted: emitted,
  };
  return socket;
}

describe('PresenceRegistry (in-RAM, BR-70)', () => {
  it('counts multiple tabs of one user as a single avatar', () => {
    const r = new PresenceRegistry();
    r.addSocket('p-1', 'u1', 's1', profile('u1', 'One'));
    r.addSocket('p-1', 'u1', 's2', profile('u1', 'One'));
    r.addSocket('p-1', 'u2', 's3', profile('u2', 'Two'));
    expect(
      r
        .users('p-1')
        .map((u) => u.id)
        .sort(),
    ).toEqual(['u1', 'u2']);
  });

  it('removing a non-last tab keeps the avatar; removing the last one drops it', () => {
    const r = new PresenceRegistry();
    r.addSocket('p-1', 'u1', 's1', profile('u1', 'One'));
    r.addSocket('p-1', 'u1', 's2', profile('u1', 'One'));

    expect(r.removeSocket('p-1', 'u1', 's1')).toBe(false);
    expect(r.users('p-1').map((u) => u.id)).toEqual(['u1']);

    expect(r.removeSocket('p-1', 'u1', 's2')).toBe(true);
    expect(r.users('p-1')).toHaveLength(0);
  });

  it('roomsOf / forgetSocket let a disconnect clean every room at once', () => {
    const r = new PresenceRegistry();
    r.addSocket('p-1', 'u1', 's1', profile('u1', 'One'));
    r.addSocket('p-2', 'u1', 's1', profile('u1', 'One'));
    expect(r.roomsOf('s1').sort()).toEqual(['p-1', 'p-2']);
    r.forgetSocket('s1');
    expect(r.roomsOf('s1')).toHaveLength(0);
  });

  it('removeUser returns the socket ids so the gateway can kick each tab', () => {
    const r = new PresenceRegistry();
    r.addSocket('p-1', 'u1', 's1', profile('u1', 'One'));
    r.addSocket('p-1', 'u1', 's2', profile('u1', 'One'));
    const kicked = r.removeUser('p-1', 'u1');
    expect(kicked.sort()).toEqual(['s1', 's2']);
    expect(r.users('p-1')).toHaveLength(0);
  });
});

describe('CollaborationGateway — handshake auth (1.E1)', () => {
  it('disconnects when handshake auth is missing', async () => {
    const gateway = makeGateway();
    const client = fakeSocket('s1');
    await gateway.handleConnection(client);
    expect(client.disconnect).toHaveBeenCalledWith(true);
    expect(client.data).toBeUndefined();
  });

  it('disconnects on an invalid access token', async () => {
    const gateway = makeGateway();
    const client = fakeSocket('s1', {
      accessToken: 'garbage',
      sessionId: 'ses-1',
    });
    await gateway.handleConnection(client);
    expect(client.disconnect).toHaveBeenCalledWith(true);
    expect(client.data).toBeUndefined();
  });

  it('accepts a valid token + live session and stores the identity', async () => {
    const rows: Record<string, Row[]> = {
      sessions: [
        {
          id: 'ses-1',
          user_id: OWNER,
          revoked_at: null,
          created_at: 'now',
          last_active_at: 'now',
          device_label: null,
          ip_address: null,
        },
      ],
      users: [
        {
          id: OWNER,
          username: 'owner',
          display_name: 'Owner',
          avatar_url: null,
        },
      ],
    };
    const gateway = makeGateway(mockSupabase(rows));
    const client = fakeSocket('s1', {
      accessToken: `valid-${OWNER}`,
      sessionId: 'ses-1',
    });

    await gateway.handleConnection(client);

    expect(client.disconnect).not.toHaveBeenCalled();
    expect(client.data.user.id).toBe(OWNER);
    expect(client.data.sessionId).toBe('ses-1');
    expect(client.data.profile.displayName).toBe('Owner');
  });

  it('disconnects when the session was revoked', async () => {
    const rows: Record<string, Row[]> = {
      sessions: [
        {
          id: 'ses-1',
          user_id: OWNER,
          revoked_at: '2026-01-01T00:00:00Z',
          created_at: 'now',
          last_active_at: 'now',
          device_label: null,
          ip_address: null,
        },
      ],
      users: [{ id: OWNER, username: 'owner', display_name: 'Owner' }],
    };
    const gateway = makeGateway(mockSupabase(rows));
    const client = fakeSocket('s1', {
      accessToken: `valid-${OWNER}`,
      sessionId: 'ses-1',
    });

    await gateway.handleConnection(client);
    expect(client.disconnect).toHaveBeenCalledWith(true);
  });

  it('disconnects when the session belongs to a different user', async () => {
    const rows: Record<string, Row[]> = {
      sessions: [
        {
          id: 'ses-1',
          user_id: COLLAB, // not the token owner
          revoked_at: null,
          created_at: 'now',
          last_active_at: 'now',
          device_label: null,
          ip_address: null,
        },
      ],
      users: [{ id: OWNER, username: 'owner', display_name: 'Owner' }],
    };
    const gateway = makeGateway(mockSupabase(rows));
    const client = fakeSocket('s1', {
      accessToken: `valid-${OWNER}`,
      sessionId: 'ses-1',
    });

    await gateway.handleConnection(client);
    expect(client.disconnect).toHaveBeenCalledWith(true);
  });
});

describe('CollaborationGateway — presence:join (1.E2/1.E3/1.E4)', () => {
  async function authorizedClient(socketId: string, userId: string) {
    const client = fakeSocket(socketId, {
      accessToken: `valid-${userId}`,
      sessionId: 'ses-1',
    });
    // Run the handshake so `client.data` is populated as in production.
    const supabase = mockSupabase({
      sessions: [
        {
          id: 'ses-1',
          user_id: userId,
          revoked_at: null,
          created_at: 'now',
          last_active_at: 'now',
          device_label: null,
          ip_address: null,
        },
      ],
      users: [{ id: userId, username: userId, display_name: userId }],
    });
    const g = new CollaborationGateway(supabase, fakeAccess() as never);
    await g.handleConnection(client);
    return { gateway: g, client };
  }

  it('joins the room and stays for an authorized user', async () => {
    const { gateway, client } = await authorizedClient('s1', OWNER);
    await gateway.handleJoin(client, { projectId: 'p-1' });

    expect(client.join).toHaveBeenCalledWith('project:p-1');
    expect(
      gateway
        .getRegistry()
        .users('p-1')
        .map((u) => u.id),
    ).toContain(OWNER);
  });

  it('rejects an unknown project with presence:denied (1.E2)', async () => {
    const { gateway, client } = await authorizedClient('s1', OWNER);
    await gateway.handleJoin(client, { projectId: 'missing' });

    expect(client.join).not.toHaveBeenCalled();
    expect(client._emitted).toContainEqual(
      expect.objectContaining({ event: 'presence:denied' }),
    );
    expect(gateway.getRegistry().users('missing')).toHaveLength(0);
  });

  it('rejects a pending collaborator (BR-65 / 1.E4)', async () => {
    const { gateway, client } = await authorizedClient('s1', PENDING);
    await gateway.handleJoin(client, { projectId: 'p-1' });

    expect(client.join).not.toHaveBeenCalled();
    expect(client._emitted).toContainEqual(
      expect.objectContaining({ event: 'presence:denied' }),
    );
    expect(gateway.getRegistry().users('p-1')).toHaveLength(0);
  });

  it('rejects an outsider with presence:denied (1.E3)', async () => {
    const { gateway, client } = await authorizedClient('s1', OUTSIDER);
    await gateway.handleJoin(client, { projectId: 'p-1' });

    expect(client.join).not.toHaveBeenCalled();
    expect(client._emitted).toContainEqual(
      expect.objectContaining({ event: 'presence:denied' }),
    );
  });
});

describe('CollaborationGateway — leave + disconnect cleanup (4.E1)', () => {
  it('presence:leave drops the user only when it was their last tab', () => {
    const gateway = makeGateway();
    const a = fakeSocket('s1', {
      accessToken: `valid-${OWNER}`,
      sessionId: 'ses-1',
    });
    a.data = {
      user: { id: OWNER },
      profile: profile(OWNER, 'Owner'),
      sessionId: 'ses-1',
    };

    // Same user, two tabs.
    gateway.getRegistry().addSocket('p-1', OWNER, 's1', a.data.profile);
    gateway.getRegistry().addSocket('p-1', OWNER, 's2', a.data.profile);

    gateway.handleLeave(a, { projectId: 'p-1' });
    // s1 is gone, but the avatar survives (s2 still open).
    expect(
      gateway
        .getRegistry()
        .users('p-1')
        .map((u) => u.id),
    ).toEqual([OWNER]);

    const b = fakeSocket('s2', {
      accessToken: `valid-${OWNER}`,
      sessionId: 'ses-1',
    });
    b.data = a.data;
    gateway.handleLeave(b, { projectId: 'p-1' });
    // Last tab left → empty roster.
    expect(gateway.getRegistry().users('p-1')).toHaveLength(0);
  });

  it('handleDisconnect cleans every room the socket was in', () => {
    const gateway = makeGateway();
    const client = fakeSocket('s1', {
      accessToken: `valid-${OWNER}`,
      sessionId: 'ses-1',
    });
    client.data = {
      user: { id: OWNER },
      profile: profile(OWNER, 'Owner'),
      sessionId: 'ses-1',
    };

    gateway.getRegistry().addSocket('p-1', OWNER, 's1', client.data.profile);
    gateway.getRegistry().addSocket('p-2', OWNER, 's1', client.data.profile);

    gateway.handleDisconnect(client);

    expect(gateway.getRegistry().users('p-1')).toHaveLength(0);
    expect(gateway.getRegistry().users('p-2')).toHaveLength(0);
  });

  it('revokeUserAccess kicks every open tab of the removed user (UC-62)', () => {
    const gateway = makeGateway();
    const registry = gateway.getRegistry();
    registry.addSocket('p-1', COLLAB, 'c1', profile(COLLAB, 'Collab'));
    registry.addSocket('p-1', COLLAB, 'c2', profile(COLLAB, 'Collab'));

    // No server attached in the unit test — revokeUserAccess must not throw.
    expect(() =>
      gateway.revokeUserAccess('p-1', COLLAB, 'col-1'),
    ).not.toThrow();

    // The collaborator is gone from the room even though their two sockets
    // are what triggered the kick.
    expect(registry.users('p-1')).toHaveLength(0);
  });
});
