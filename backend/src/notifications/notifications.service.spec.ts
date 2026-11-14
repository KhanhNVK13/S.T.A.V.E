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
import { DisabledEmailSender } from './email-sender';

const userId = '44444444-4444-4444-8444-444444444444';

function makeService(tables: SupabaseMockOptions['tables'] = {}) {
  const mock = createSupabaseMock([], { tables });
  return {
    service: new NotificationsService(mock.client, new DisabledEmailSender()),
    ...mock,
  };
}

describe('BE-NTF-01 notification types', () => {
  it('UTCID01 defines 28 unique types', () => {
    const types = NOTIFICATION_TYPES.map((t) => t.type);
    expect(types).toHaveLength(28);
    expect(new Set(types).size).toBe(28);
  });

  it('UTCID02 marks only security and billing types as mandatory', () => {
    for (const def of NOTIFICATION_TYPES) {
      const expected =
        def.type.startsWith('security.') || def.type.startsWith('billing.');
      expect(def.mandatory).toBe(expected);
    }
    expect(isMandatoryType('billing.payment_success')).toBe(true);
    expect(isMandatoryType('comment.new')).toBe(false);
    expect(isMandatoryType('not.a.type')).toBe(false);
  });

  it('UTCID03 uses every placeholder of a type in its default body or subject', () => {
    for (const def of NOTIFICATION_TYPES) {
      for (const key of def.placeholders) {
        expect(`${def.defaultSubject} ${def.defaultBody}`).toContain(
          `{{${key}}}`,
        );
      }
    }
  });

  it('UTCID04 only references declared placeholders', () => {
    for (const def of NOTIFICATION_TYPES) {
      const used = [
        ...`${def.defaultSubject} ${def.defaultBody}`.matchAll(
          /\{\{(\w+)\}\}/g,
        ),
      ].map((m) => m[1]);
      for (const key of used) expect(def.placeholders).toContain(key);
    }
  });

  it('UTCID05 renders placeholders and blanks missing values', () => {
    expect(
      renderTemplate('Chào {{name}} ({{ missing }})', { name: 'An' }),
    ).toBe('Chào An ()');
    expect(getNotificationType('fork.created')?.category).toBe('Fork');
  });
});

describe('BE-NTF-02 NotificationsService.notify', () => {
  it('keeps raw params and formats money and dates only in the fallback text', async () => {
    const { service, builders } = makeService({
      notification_preferences: [{ data: null }],
      notification_templates: [{ data: null }],
      notifications: [{ data: null, error: null }],
    });
    await service.notify(userId, 'billing.price_change', {
      planName: 'PLUS',
      newPrice: 59000,
      effectiveDate: '2026-12-06T10:00:00.000Z',
    });
    const call = builders.notifications.insert.mock.calls[0][0] as {
      payload: Record<string, unknown>;
    };
    expect(call.payload.params).toEqual({
      planName: 'PLUS',
      newPrice: 59000,
      effectiveDate: '2026-12-06T10:00:00.000Z',
    });
    expect(call.payload.body).toContain('06/12/2026');
    expect(call.payload.body).toMatch(/59\.000/);
    expect(call.payload.customText).toBeUndefined();
  });

  it('marks the payload as custom text when an admin template exists', async () => {
    const { service, builders } = makeService({
      notification_preferences: [{ data: null }],
      notification_templates: [
        {
          data: {
            subject: 'Tiêu đề riêng',
            body_template: 'Chào {{forkerName}}',
          },
        },
      ],
      notifications: [{ data: null, error: null }],
    });
    await service.notify(userId, 'fork.created', {
      forkerName: 'An',
      projectName: 'P',
      projectId: 'p1',
    });
    const call = builders.notifications.insert.mock.calls[0][0] as {
      payload: Record<string, unknown>;
    };
    expect(call.payload).toMatchObject({
      customText: true,
      title: 'Tiêu đề riêng',
      body: 'Chào An',
    });
  });

  it('UTCID01 writes the rendered title and body into the payload', async () => {
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
        params: { forkerName: 'An', projectName: 'Bài hát', projectId: 'p1' },
        title: 'Dự án của bạn được fork',
        body: 'An đã fork dự án "Bài hát" của bạn.',
      },
    });
  });

  it('UTCID02 does not send an optional type the user muted', async () => {
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

  it('UTCID03 always sends a mandatory type and never reads preferences', async () => {
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

  it('UTCID04 uses the stored template when one exists', async () => {
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

  it('UTCID05 still records an unknown type with the type as its title', async () => {
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

  it('UTCID06 never throws when the write fails', async () => {
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

  it('UTCID07 never throws when a lookup throws', async () => {
    const { service } = makeService({});
    await expect(
      service.notify(userId, 'comment.new', {
        authorName: 'An',
        projectName: 'P',
      }),
    ).resolves.toBeUndefined();
  });
});
