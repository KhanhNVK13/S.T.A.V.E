import { createSupabaseMock } from '../test-utils/supabase-mock';
import { NOTIFICATION_TYPES, renderTemplate } from './notification-types';
import { ENGLISH_DEFAULTS } from './notification-types.en';
import { fallbackValues } from './notification-params';
import type { EmailSender } from './email-sender';
import { NotificationsService } from './notifications.service';

const userId = '44444444-4444-4444-8444-444444444444';

type Tables = NonNullable<Parameters<typeof createSupabaseMock>[1]>['tables'];

const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

function make(language: 'en' | 'vi' | null, template: unknown = null) {
  const send = jest.fn().mockResolvedValue(undefined);
  const sender: EmailSender = { enabled: true, send };
  const tables = {
    notification_templates: [{ data: template }],
    notifications: [{ data: null, error: null }],
    users: [{ data: { email: 'a@example.test', status: 'active', language } }],
  } as Tables;
  const mock = createSupabaseMock([], { tables });
  return { service: new NotificationsService(mock.client, sender), send };
}

const payload = {
  planName: 'STAVE+',
  newPrice: 99000,
  effectiveDate: '2026-12-06T10:00:00.000Z',
};

describe('BE-EML-LANG English defaults', () => {
  it('UTCID01 every notification type has an English subject and body', () => {
    for (const def of NOTIFICATION_TYPES) {
      expect(ENGLISH_DEFAULTS[def.type]).toBeDefined();
      expect(def.defaultSubjectEn).toBe(ENGLISH_DEFAULTS[def.type].subject);
      expect(def.defaultBodyEn).toBe(ENGLISH_DEFAULTS[def.type].body);
      expect(def.defaultBodyEn).not.toBe(def.defaultBody);
    }
    expect(Object.keys(ENGLISH_DEFAULTS).sort()).toEqual(
      NOTIFICATION_TYPES.map((d) => d.type).sort(),
    );
  });

  it('UTCID02 the English text uses exactly the placeholders of the type', () => {
    for (const def of NOTIFICATION_TYPES) {
      const used = [
        ...`${def.defaultSubjectEn} ${def.defaultBodyEn}`.matchAll(
          /\{\{(\w+)\}\}/g,
        ),
      ].map((m) => m[1]);
      for (const key of used) expect(def.placeholders).toContain(key);
      for (const key of def.placeholders) {
        expect(`${def.defaultSubjectEn} ${def.defaultBodyEn}`).toContain(
          `{{${key}}}`,
        );
      }
    }
  });

  it('UTCID03 English values format money and dates in English', () => {
    const values = fallbackValues(payload, 'en');
    expect(String(values.newPrice)).toMatch(/99,000/);
    expect(String(values.effectiveDate)).toMatch(/Dec 6, 2026/);
    expect(renderTemplate('{{newPrice}}', fallbackValues(payload))).toMatch(
      /99\.000/,
    );
  });
});

describe('BE-EML-LANG email follows users.language', () => {
  it('UTCID01 an English user gets the English default text', async () => {
    const { service, send } = make('en');
    await service.notify(userId, 'billing.price_change', payload);
    await flush();
    expect(send).toHaveBeenCalledTimes(1);
    const message = send.mock.calls[0][0] as { subject: string; text: string };
    expect(message.subject).toBe('Plan price change');
    expect(message.text).toContain('The STAVE+ plan price will change to');
    expect(message.text).toMatch(/Dec 6, 2026/);
  });

  it('UTCID02 a Vietnamese user (or no language yet) keeps the Vietnamese text', async () => {
    for (const language of ['vi', null] as const) {
      const { service, send } = make(language);
      await service.notify(userId, 'billing.price_change', payload);
      await flush();
      const message = send.mock.calls[0][0] as { subject: string };
      expect(message.subject).toBe('Giá gói dịch vụ sẽ đổi');
    }
  });

  it('UTCID03 an admin-edited template is sent verbatim whatever the language', async () => {
    const { service, send } = make('en', {
      subject: 'Tiêu đề riêng',
      body_template: 'Giá mới {{newPrice}}',
    });
    await service.notify(userId, 'billing.price_change', payload);
    await flush();
    const message = send.mock.calls[0][0] as { subject: string; text: string };
    expect(message.subject).toBe('Tiêu đề riêng');
    expect(message.text).toContain('Giá mới');
    expect(message.text).not.toContain('Plan price');
  });
});
