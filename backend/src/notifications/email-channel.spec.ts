import { createSupabaseMock } from '../test-utils/supabase-mock';
import {
  DisabledEmailSender,
  SmtpEmailSender,
  buildEmailContent,
  createEmailSender,
  escapeHtml,
  readSmtpConfig,
  type EmailSender,
} from './email-sender';
import { NotificationsService } from './notifications.service';

const userId = '44444444-4444-4444-8444-444444444444';
const SMTP_ENV = {
  SMTP_HOST: 'smtp.example.test',
  SMTP_PORT: '587',
  SMTP_USER: 'user',
  SMTP_PASS: 'secret',
  SMTP_FROM: 'STAVE <no-reply@example.test>',
};

function fakeSender(sendImpl?: () => Promise<void>) {
  const send = jest.fn(sendImpl ?? (() => Promise.resolve()));
  const sender: EmailSender = { enabled: true, send };
  return { sender, send };
}

const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

function make(
  sender: EmailSender,
  tables: Parameters<typeof createSupabaseMock>[1] extends infer O
    ? O extends { tables?: infer T }
      ? T
      : never
    : never,
) {
  const mock = createSupabaseMock([], { tables });
  return { service: new NotificationsService(mock.client, sender), ...mock };
}

const account = { data: { email: 'a@example.test', status: 'active' } };

describe('BE-EML-01 SMTP configuration', () => {
  it('UTCID01 is off when NODE_ENV is test', () => {
    expect(readSmtpConfig({ ...SMTP_ENV, NODE_ENV: 'test' })).toBeNull();
    expect(createEmailSender({ ...SMTP_ENV, NODE_ENV: 'test' }).enabled).toBe(
      false,
    );
  });

  it.each(['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM'])(
    'UTCID02 is off when %s is missing',
    (key) => {
      const env = { ...SMTP_ENV, NODE_ENV: 'production', [key]: '' };
      expect(readSmtpConfig(env)).toBeNull();
      expect(createEmailSender(env)).toBeInstanceOf(DisabledEmailSender);
    },
  );

  it('UTCID03 reads the config and defaults the port to 587', () => {
    expect(
      readSmtpConfig({ ...SMTP_ENV, SMTP_PORT: '', NODE_ENV: 'production' }),
    ).toMatchObject({ host: 'smtp.example.test', port: 587 });
    expect(
      readSmtpConfig({ ...SMTP_ENV, SMTP_PORT: 'abc', NODE_ENV: 'production' }),
    ).toBeNull();
  });

  it('UTCID04 builds a real sender when fully configured', () => {
    const sender = createEmailSender({ ...SMTP_ENV, NODE_ENV: 'production' });
    expect(sender).toBeInstanceOf(SmtpEmailSender);
    expect(sender.enabled).toBe(true);
  });

  it('UTCID05 passes the message to the transport with the configured sender', async () => {
    const sendMail = jest.fn().mockResolvedValue(undefined);
    const config = readSmtpConfig({ ...SMTP_ENV, NODE_ENV: 'production' })!;
    await new SmtpEmailSender(config, { sendMail }).send({
      to: 'a@example.test',
      subject: 's',
      text: 't',
      html: 'h',
    });
    expect(sendMail).toHaveBeenCalledWith({
      from: 'STAVE <no-reply@example.test>',
      to: 'a@example.test',
      subject: 's',
      text: 't',
      html: 'h',
    });
  });
});

describe('BE-EML-02 email content', () => {
  it('UTCID01 escapes HTML in title and body', () => {
    const { html, text } = buildEmailContent(
      '<b>Hi</b>',
      'Tom & "Jerry" <script>x</script>\nline2',
    );
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<b>Hi</b>');
    expect(html).toContain('&lt;b&gt;Hi&lt;/b&gt;');
    expect(html).toContain('Tom &amp; &quot;Jerry&quot;');
    expect(html).toContain('line2');
    expect(text).toContain('<b>Hi</b>');
  });

  it('UTCID02 escapeHtml covers the five special characters', () => {
    expect(escapeHtml(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&#39;');
  });
});

describe('BE-EML-03 NotificationsService email channel', () => {
  it('UTCID01 emails the account address when the channel is on', async () => {
    const { sender, send } = fakeSender();
    const { service, builders } = make(sender, {
      notification_preferences: [{ data: null }, { data: { enabled: true } }],
      notification_templates: [{ data: null }],
      notifications: [{ data: null, error: null }],
      users: [account],
    });
    await service.notify(userId, 'fork.created', {
      forkerName: 'An',
      projectName: 'Bài hát',
    });
    await flush();
    expect(builders.notifications.insert).toHaveBeenCalled();
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'a@example.test',
        subject: 'Dự án của bạn được fork',
        text: expect.stringContaining('An đã fork dự án "Bài hát" của bạn.'),
      }),
    );
  });

  it('UTCID02 does not email when the user turned the email channel off', async () => {
    const { sender, send } = fakeSender();
    const { service, builders } = make(sender, {
      notification_preferences: [{ data: null }, { data: { enabled: false } }],
      notification_templates: [{ data: null }],
      notifications: [{ data: null, error: null }],
      users: [account],
    });
    await service.notify(userId, 'fork.created', {
      forkerName: 'An',
      projectName: 'P',
    });
    expect(builders.notifications.insert).toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it('UTCID03 still emails when only the in-app channel is muted', async () => {
    const { sender, send } = fakeSender();
    const { service, builders } = make(sender, {
      notification_preferences: [
        { data: { enabled: false } },
        { data: { enabled: true } },
      ],
      notification_templates: [{ data: null }],
      notifications: [],
      users: [account],
    });
    await service.notify(userId, 'fork.created', {
      forkerName: 'An',
      projectName: 'P',
    });
    await flush();
    expect(builders.notifications.insert).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('UTCID03b does not email a non-mandatory type without an explicit opt-in', async () => {
    const { sender, send } = fakeSender();
    const { service, builders } = make(sender, {
      notification_preferences: [{ data: null }, { data: null }],
      notification_templates: [{ data: null }],
      notifications: [{ data: null, error: null }],
      users: [account],
    });
    await service.notify(userId, 'fork.created', {
      forkerName: 'An',
      projectName: 'P',
    });
    await flush();
    expect(builders.notifications.insert).toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it('UTCID04 sends nothing when both channels are muted', async () => {
    const { sender, send } = fakeSender();
    const { service, builders } = make(sender, {
      notification_preferences: [
        { data: { enabled: false } },
        { data: { enabled: false } },
      ],
      notification_templates: [],
      notifications: [],
      users: [account],
    });
    await service.notify(userId, 'comment.new', {
      authorName: 'An',
      projectName: 'P',
    });
    expect(builders.notifications.insert).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it('UTCID05 emails mandatory types without reading preferences', async () => {
    const { sender, send } = fakeSender();
    const { service, builders } = make(sender, {
      notification_preferences: [],
      notification_templates: [{ data: null }],
      notifications: [{ data: null, error: null }],
      users: [account],
    });
    await service.notify(userId, 'billing.price_change', {
      planName: 'PLUS',
      newPrice: 59000,
      effectiveDate: '2026-12-06T10:00:00.000Z',
    });
    expect(builders.notification_preferences.select).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('UTCID06 skips the email when the sender is disabled', async () => {
    const send = jest.fn();
    const sender: EmailSender = { enabled: false, send };
    const { service, builders } = make(sender, {
      notification_preferences: [{ data: null }],
      notification_templates: [{ data: null }],
      notifications: [{ data: null, error: null }],
      users: [account],
    });
    await service.notify(userId, 'fork.created', {
      forkerName: 'An',
      projectName: 'P',
    });
    expect(builders.notifications.insert).toHaveBeenCalled();
    expect(builders.users.select).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it('UTCID07 does not email suspended accounts or accounts without an address', async () => {
    for (const row of [
      { data: { email: 'a@example.test', status: 'suspended' } },
      { data: { email: null, status: 'active' } },
      { data: null },
    ]) {
      const { sender, send } = fakeSender();
      const { service } = make(sender, {
        notification_preferences: [{ data: null }, { data: null }],
        notification_templates: [{ data: null }],
        notifications: [{ data: null, error: null }],
        users: [row],
      });
      await service.notify(userId, 'fork.created', {
        forkerName: 'An',
        projectName: 'P',
      });
      expect(send).not.toHaveBeenCalled();
    }
  });

  it('UTCID08 a failing send neither throws nor leaks the address into the log', async () => {
    const { sender } = fakeSender(() =>
      Promise.reject(
        Object.assign(new Error('rejected a@example.test'), {
          code: 'EENVELOPE',
        }),
      ),
    );
    const { service } = make(sender, {
      notification_preferences: [{ data: null }, { data: { enabled: true } }],
      notification_templates: [{ data: null }],
      notifications: [{ data: null, error: null }],
      users: [account],
    });
    const logged: string[] = [];
    const spy = jest
      .spyOn(
        (service as unknown as { logger: { error: (m: string) => void } })
          .logger,
        'error',
      )
      .mockImplementation((m: string) => {
        logged.push(m);
      });
    await expect(
      service.notify(userId, 'fork.created', {
        forkerName: 'An',
        projectName: 'P',
      }),
    ).resolves.toBeUndefined();
    await flush();
    expect(logged).toHaveLength(1);
    expect(logged[0]).toContain('EENVELOPE');
    expect(logged[0]).not.toContain('a@example.test');
    spy.mockRestore();
  });
});
