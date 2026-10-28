import {
  BadRequestException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import {
  createSupabaseMock,
  type SupabaseMockOptions,
} from '../test-utils/supabase-mock';
import {
  NotificationInboxService,
  notificationHref,
} from './notification-inbox.service';

const userId = '44444444-4444-4444-8444-444444444444';
const notificationId = '55555555-5555-4555-8555-555555555555';

function makeService(tables: SupabaseMockOptions['tables'] = {}) {
  const mock = createSupabaseMock([], { tables });
  return { service: new NotificationInboxService(mock.client), ...mock };
}

function row(index: number, overrides: Record<string, unknown> = {}) {
  return {
    id: `00000000-0000-4000-8000-00000000000${index}`,
    type: 'comment.new',
    payload: { title: 't', body: 'b' },
    read_at: null,
    created_at: `2026-10-2${index}T00:00:00.000Z`,
    ...overrides,
  };
}

describe('notificationHref', () => {
  it.each([
    ['comment.new', { projectId: 'p1' }, '/projects/p1'],
    [
      'pr.merged',
      { pullRequestId: 'r1', projectId: 'p1' },
      '/pull-requests/r1',
    ],
    ['jam.started', { eventId: 'e1' }, '/jam/e1'],
    ['collab.invite', { invitationId: 'i1' }, '/invitations'],
    ['billing.payment_success', {}, '/plans'],
    ['security.google_connected', {}, '/profile'],
    ['report.reviewed', {}, null],
  ])('%s %j maps to %s', (type, payload, expected) => {
    expect(notificationHref(type, payload)).toBe(expected);
  });
});

describe('NotificationInboxService.list', () => {
  it('returns the page and a cursor when there are more rows', async () => {
    const { service } = makeService({
      notifications: [{ data: [row(3), row(2), row(1)] }],
    });
    const result = await service.list(userId, { filter: 'all', limit: 2 });
    expect(result.items.map((r) => r.id)).toEqual([
      '00000000-0000-4000-8000-000000000003',
      '00000000-0000-4000-8000-000000000002',
    ]);
    expect(result.nextCursor).not.toBeNull();
  });

  it('has no cursor on the last page', async () => {
    const { service } = makeService({
      notifications: [{ data: [row(2), row(1)] }],
    });
    const result = await service.list(userId, { filter: 'all', limit: 5 });
    expect(result.items).toHaveLength(2);
    expect(result.nextCursor).toBeNull();
  });

  it('applies the unread and mentions filters', async () => {
    const unread = makeService({ notifications: [{ data: [] }] });
    await unread.service.list(userId, { filter: 'unread', limit: 30 });
    expect(unread.builders.notifications.is).toHaveBeenCalledWith(
      'read_at',
      null,
    );

    const mentions = makeService({ notifications: [{ data: [] }] });
    await mentions.service.list(userId, { filter: 'mentions', limit: 30 });
    expect(mentions.builders.notifications.in).toHaveBeenCalledWith('type', [
      'comment.reply',
      'pr.comment',
    ]);
  });

  it('only ever reads the caller rows', async () => {
    const { service, builders } = makeService({
      notifications: [{ data: [] }],
    });
    await service.list(userId, { filter: 'all', limit: 30 });
    expect(builders.notifications.eq).toHaveBeenCalledWith('user_id', userId);
  });

  it('continues from a cursor', async () => {
    const first = makeService({
      notifications: [{ data: [row(3), row(2), row(1)] }],
    });
    const page = await first.service.list(userId, { filter: 'all', limit: 2 });

    const second = makeService({ notifications: [{ data: [row(1)] }] });
    await second.service.list(userId, {
      filter: 'all',
      limit: 2,
      cursor: page.nextCursor!,
    });
    expect(second.builders.notifications.or).toHaveBeenCalledWith(
      expect.stringContaining('created_at.lt.2026-10-22T00:00:00.000Z'),
    );
  });

  it.each([
    ['not-a-cursor'],
    [
      Buffer.from(
        JSON.stringify({ createdAt: 'x),user_id.neq.0,(a.eq.1', id: 'y' }),
      ).toString('base64url'),
    ],
    [
      Buffer.from(
        JSON.stringify({
          createdAt: '2026-10-22T00:00:00.000Z',
          id: 'not-a-uuid',
        }),
      ).toString('base64url'),
    ],
  ])(
    'rejects a cursor that is not a timestamp and uuid pair (%#)',
    async (cursor) => {
      const { service } = makeService({ notifications: [{ data: [] }] });
      await expect(
        service.list(userId, { filter: 'all', limit: 30, cursor }),
      ).rejects.toBeInstanceOf(BadRequestException);
    },
  );

  it('rejects a malformed cursor', async () => {
    const { service } = makeService({ notifications: [{ data: [] }] });
    await expect(
      service.list(userId, {
        filter: 'all',
        limit: 30,
        cursor: 'not-a-cursor',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('reports a database failure', async () => {
    const { service } = makeService({
      notifications: [{ data: null, error: { message: 'x' } }],
    });
    await expect(
      service.list(userId, { filter: 'all', limit: 30 }),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
  });
});

describe('NotificationInboxService.unreadCount', () => {
  it('returns the count of unread rows', async () => {
    const { service } = makeService({
      notifications: [{ data: null, count: 4 }],
    });
    await expect(service.unreadCount(userId)).resolves.toEqual({ count: 4 });
  });
});

describe('NotificationInboxService.open', () => {
  it('marks the notification read and returns the href when the target exists', async () => {
    const { service, builders } = makeService({
      notifications: [
        {
          data: {
            id: notificationId,
            type: 'fork.created',
            payload: { projectId: 'p1' },
            read_at: null,
          },
        },
        { data: null, error: null },
      ],
      projects: [{ data: { id: 'p1' } }],
    });
    await expect(service.open(userId, notificationId)).resolves.toEqual({
      ok: true,
      href: '/projects/p1',
    });
    expect(builders.notifications.update).toHaveBeenCalledWith({
      read_at: expect.any(String),
    });
  });

  it('still marks it read but reports ok false when the target is gone', async () => {
    const { service, builders } = makeService({
      notifications: [
        {
          data: {
            id: notificationId,
            type: 'fork.created',
            payload: { projectId: 'gone' },
            read_at: null,
          },
        },
        { data: null, error: null },
      ],
      projects: [{ data: null }],
    });
    await expect(service.open(userId, notificationId)).resolves.toEqual({
      ok: false,
    });
    expect(builders.notifications.update).toHaveBeenCalled();
  });

  it('does not rewrite read_at for an already read notification', async () => {
    const { service, builders } = makeService({
      notifications: [
        {
          data: {
            id: notificationId,
            type: 'jam.started',
            payload: {},
            read_at: '2026-10-20T00:00:00Z',
          },
        },
      ],
    });
    await expect(service.open(userId, notificationId)).resolves.toEqual({
      ok: true,
      href: null,
    });
    expect(builders.notifications.update).not.toHaveBeenCalled();
  });

  it('answers not found for a notification of someone else', async () => {
    const { service } = makeService({ notifications: [{ data: null }] });
    await expect(service.open(userId, notificationId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe('NotificationInboxService.readAll', () => {
  it('marks every unread row of the caller', async () => {
    const { service, builders } = makeService({
      notifications: [{ data: null, error: null }],
    });
    await expect(service.readAll(userId)).resolves.toEqual({ ok: true });
    expect(builders.notifications.eq).toHaveBeenCalledWith('user_id', userId);
    expect(builders.notifications.is).toHaveBeenCalledWith('read_at', null);
  });
});

describe('NotificationInboxService preferences', () => {
  it('lists every type with stored values and forces mandatory types on', async () => {
    const { service } = makeService({
      notification_preferences: [
        {
          data: [
            { type: 'comment.new', channel: 'in_app', enabled: false },
            {
              type: 'billing.payment_success',
              channel: 'in_app',
              enabled: false,
            },
          ],
        },
      ],
    });
    const items = await service.getPreferences(userId);
    expect(items).toHaveLength(28);
    expect(items.find((i) => i.type === 'comment.new')?.channels).toEqual({
      in_app: false,
      email: true,
    });
    expect(
      items.find((i) => i.type === 'billing.payment_success')?.channels,
    ).toEqual({ in_app: true, email: true });
  });

  it('saves a change for the caller keyed by type and channel', async () => {
    const { service, builders } = makeService({
      notification_preferences: [{ data: null, error: null }],
    });
    await service.setPreference(userId, {
      type: 'comment.new',
      channel: 'email',
      enabled: false,
    });
    expect(builders.notification_preferences.upsert).toHaveBeenCalledWith(
      {
        user_id: userId,
        type: 'comment.new',
        channel: 'email',
        enabled: false,
      },
      { onConflict: 'user_id,type,channel' },
    );
  });

  it('refuses to turn off a mandatory type', async () => {
    const { service, builders } = makeService({
      notification_preferences: [],
    });
    await expect(
      service.setPreference(userId, {
        type: 'security.google_connected',
        channel: 'in_app',
        enabled: false,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(builders.notification_preferences.upsert).not.toHaveBeenCalled();
  });

  it('refuses an unknown type', async () => {
    const { service } = makeService({ notification_preferences: [] });
    await expect(
      service.setPreference(userId, {
        type: 'nope',
        channel: 'in_app',
        enabled: true,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('reports a save failure', async () => {
    const { service } = makeService({
      notification_preferences: [{ data: null, error: { message: 'x' } }],
    });
    await expect(
      service.setPreference(userId, {
        type: 'comment.new',
        channel: 'in_app',
        enabled: true,
      }),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
  });
});
