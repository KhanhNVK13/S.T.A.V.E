import { Logger } from '@nestjs/common';
import { createTransport, type Transporter } from 'nodemailer';

export const EMAIL_SENDER = Symbol('EMAIL_SENDER');

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface EmailSender {
  readonly enabled: boolean;
  send(message: EmailMessage): Promise<void>;
}

export interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
}

const SEND_TIMEOUT_MS = 10_000;

export function readSmtpConfig(
  env: NodeJS.ProcessEnv = process.env,
): SmtpConfig | null {
  if (env.NODE_ENV === 'test') return null;
  const host = env.SMTP_HOST?.trim();
  const user = env.SMTP_USER?.trim();
  const pass = env.SMTP_PASS;
  const from = env.SMTP_FROM?.trim();
  const port = Number(env.SMTP_PORT?.trim() || '587');
  if (!host || !user || !pass || !from) return null;
  if (!Number.isInteger(port) || port <= 0 || port > 65535) return null;
  return { host, port, user, pass, from };
}

export class DisabledEmailSender implements EmailSender {
  readonly enabled = false;

  send(): Promise<void> {
    return Promise.resolve();
  }
}

export class SmtpEmailSender implements EmailSender {
  readonly enabled = true;

  constructor(
    private readonly config: SmtpConfig,
    private readonly transport: Pick<Transporter, 'sendMail'>,
  ) {}

  async send(message: EmailMessage): Promise<void> {
    await this.transport.sendMail({
      from: this.config.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
  }
}

export function createEmailSender(
  env: NodeJS.ProcessEnv = process.env,
): EmailSender {
  const config = readSmtpConfig(env);
  if (!config) {
    if (env.NODE_ENV !== 'test') {
      new Logger('EmailSender').log(
        'SMTP is not configured; email notifications are off',
      );
    }
    return new DisabledEmailSender();
  }
  const transport = createTransport({
    host: config.host,
    port: config.port,
    secure: config.port === 465,
    auth: { user: config.user, pass: config.pass },
    connectionTimeout: SEND_TIMEOUT_MS,
    greetingTimeout: SEND_TIMEOUT_MS,
    socketTimeout: SEND_TIMEOUT_MS,
  });
  return new SmtpEmailSender(config, transport);
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function buildEmailContent(
  title: string,
  body: string,
): { text: string; html: string } {
  const text = `${title}\n\n${body}\n\n— STAVE`;
  const html =
    `<div style="font-family:Arial,Helvetica,sans-serif;line-height:1.5">` +
    `<h2 style="margin:0 0 12px">${escapeHtml(title)}</h2>` +
    `<p style="margin:0 0 16px">${escapeHtml(body).replace(/\n/g, '<br>')}</p>` +
    `<p style="color:#666;font-size:12px;margin:0">STAVE</p></div>`;
  return { text, html };
}
