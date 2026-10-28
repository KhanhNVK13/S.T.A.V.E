import {
  createSupabaseMock,
  type SupabaseMockOptions,
} from '../test-utils/supabase-mock';
import {
  NOTIFICATION_TYPES,
  getNotificationType,
  isMandatoryType,
  renderTemplate,
} from './notification-types';
import { NotificationsService } from './notifications.service';

const userId = '44444444-4444-4444-8444-444444444444';

function makeService(tables: SupabaseMockOptions['tables'] = {}) {
  const mock = createSupabaseMock([], { tables });
  return { service: new NotificationsService(mock.client), ...mock };
}

describe('notification types', () => {
  it('defines 28 unique types', () => {
    const types = NOTIFICATION_TYPES.map((t) => t.type);
    expect(types).toHaveLength(28);
    expect(new Set(types).size).toBe(28);
  });

  it('marks only security and billing types as mandatory', () => {
    for (const def of NOTIFICATION_TYPES) {
      const expected =
        def.type.startsWith('security.') || def.type.startsWith('billing.');
      expect(def.mandatory).toBe(expected);
    }
    expect(isMandatoryType('billing.payment_success')).toBe(true);
    expect(isMandatoryType('comment.new')).toBe(false);
    expect(isMandatoryType('not.a.type')).toBe(false);
  });

  it('uses every placeholder of a type in its default body or subject', () => {
    for (const def of NOTIFICATION_TYPES) {
      for (const key of def.placeholders) {
        expect(`${def.defaultSubject} ${def.defaultBody}`).toContain(
          `{{${key}}}`,
        );
      }
    }
  });

  it('only references declared placeholders', () => {
    for (const def of NOTIFICATION_TYPES) {
      const used = [
        ...`${def.defaultSubject} ${def.defaultBody}`.matchAll(
          /\{\{(\w+)\}\}/g,
        ),
      ].map((m) => m[1]);
      for (const key of used) expect(def.placeholders).toContain(key);
    }
  });

  it('renders placeholders and blanks missing values', () => {
    expect(
      renderTemplate('Chào {{name}} ({{ missing }})', { name: 'An' }),
    ).toBe('Chào An ()');
    expect(getNotificationType('fork.created')?.category).toBe('Fork');
  });
});

describe('NotificationsService.notify', () => {
  it('writes the rendered title and body into the payload', async () => {
    const { service, builders } = makeService({
      notification_preferences: [{ data: null }],
      notification_templates: [{ data: null }],
      notifications: [{ data: null, error: null }],
    });
    await service.notify(userId, 'fork.created', {
      forkerName: 'An',
      projectName: 'Bài hát',
      projectId: 'p1',
    });
    expect(builders.notifications.insert).toHaveBeenCalledWith({
      user_id: userId,
      type: 'fork.created',
      payload: {
        forkerName: 'An',
        projectName: 'Bài hát',
        projectId: 'p1',
        title: 'Dự án của bạn được fork',
        body: 'An đã fork dự án "Bài hát" của bạn.',
      },
    });
  });

  it('does not send an optional type the user muted', async () => {
    const { service, builders } = makeService({
      notification_preferences: [{ data: { enabled: false } }],
      notifications: [],
    });
    await service.notify(userId, 'comment.new', {
      authorName: 'An',
      projectName: 'P',
    });
    expect(builders.notifications.insert).not.toHaveBeenCalled();
  });

  it('always sends a mandatory type and never reads preferences', async () => {
    const { service, builders } = makeService({
      notification_preferences: [],
      notification_templates: [{ data: null }],
      notifications: [{ data: null, error: null }],
    });
    await service.notify(userId, 'billing.payment_success', {
      planName: 'STAVE+',
      amount: '49.000 VND',
    });
    expect(builders.notifications.insert).toHaveBeenCalled();
    expect(builders.notification_preferences.select).not.toHaveBeenCalled();
  });

  it('uses the stored template when one exists', async () => {
    const { service, builders } = makeService({
      notification_preferences: [{ data: null }],
      notification_templates: [
        {
          data: {
            subject: 'Tiêu đề {{forkerName}}',
            body_template: 'Nội dung {{projectName}}',
          },
        },
      ],
      notifications: [{ data: null, error: null }],
    });
    await service.notify(userId, 'fork.created', {
      forkerName: 'An',
      projectName: 'P',
    });
    expect(builders.notifications.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          title: 'Tiêu đề An',
          body: 'Nội dung P',
        }),
      }),
    );
  });

  it('still records an unknown type with the type as its title', async () => {
    const { service, builders } = makeService({
      notification_preferences: [{ data: null }],
      notification_templates: [{ data: null }],
      notifications: [{ data: null, error: null }],
    });
    await service.notify(userId, 'account_suspended', { reason: 'x' });
    expect(builders.notifications.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'account_suspended',
        payload: expect.objectContaining({
          title: 'account_suspended',
          body: '',
        }),
      }),
    );
  });

  it('never throws when the write fails', async () => {
    const { service } = makeService({
      notification_preferences: [{ data: null }],
      notification_templates: [{ data: null }],
      notifications: [{ data: null, error: { message: 'db down' } }],
    });
    await expect(
      service.notify(userId, 'fork.created', {
        forkerName: 'An',
        projectName: 'P',
      }),
    ).resolves.toBeUndefined();
  });

  it('never throws when a lookup throws', async () => {
    const { service } = makeService({});
    await expect(
      service.notify(userId, 'comment.new', {
        authorName: 'An',
        projectName: 'P',
      }),
    ).resolves.toBeUndefined();
  });
});
