import { Inject, Injectable, Logger } from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_ADMIN_CLIENT } from '../supabase/supabase.constants';
import { getNotificationType, renderTemplate } from './notification-types';
import { fallbackValues } from './notification-params';
import {
  buildEmailContent,
  EMAIL_SENDER,
  type EmailSender,
} from './email-sender';

type Channel = 'in_app' | 'email';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @Inject(SUPABASE_ADMIN_CLIENT)
    private readonly supabase: SupabaseClient,
    @Inject(EMAIL_SENDER)
    private readonly email: EmailSender,
  ) {}

  async notify(
    userId: string,
    type: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    try {
      const definition = getNotificationType(type);
      if (!definition) {
        this.logger.warn(`Unknown notification type: ${type}`);
      }

      const mandatory = definition?.mandatory === true;
      const inApp = mandatory || !(await this.isMuted(userId, type, 'in_app'));
      const byEmail =
        this.email.enabled &&
        (mandatory || (await this.isEmailOptedIn(userId, type)));
      if (!inApp && !byEmail) return;

      const template = await this.loadTemplate(type);
      const subject = template?.subject ?? definition?.defaultSubject ?? type;
      const body = template?.body ?? definition?.defaultBody ?? '';

      const values = fallbackValues(payload);
      const title = renderTemplate(subject, values);
      const text = renderTemplate(body, values);

      if (inApp) {
        const { error } = await this.supabase.from('notifications').insert({
          user_id: userId,
          type,
          payload: {
            ...payload,
            params: payload,
            title,
            body: text,
            ...(template ? { customText: true } : {}),
          },
        });

        if (error) {
          this.logger.error(
            `Could not write notification ${type}: ${error.message}`,
          );
        }
      }

      if (byEmail) {
        void this.sendEmail(userId, type, payload, {
          title,
          text,
          customText: template !== null,
        });
      }
    } catch (err) {
      this.logger.error(`Could not send notification ${type}: ${String(err)}`);
    }
  }

  private async sendEmail(
    userId: string,
    type: string,
    payload: Record<string, unknown>,
    rendered: { title: string; text: string; customText: boolean },
  ): Promise<void> {
    try {
      const { data, error } = await this.supabase
        .from('users')
        .select('email, status, language')
        .eq('id', userId)
        .maybeSingle<{
          email: string | null;
          status: string;
          language: 'en' | 'vi' | null;
        }>();
      if (error || !data?.email || data.status !== 'active') return;
      let { title, text } = rendered;
      const definition = getNotificationType(type);
      if (data.language === 'en' && !rendered.customText && definition) {
        const values = fallbackValues(payload, 'en');
        title = renderTemplate(definition.defaultSubjectEn, values);
        text = renderTemplate(definition.defaultBodyEn, values);
      }
      await this.email.send({
        to: data.email,
        subject: title,
        ...buildEmailContent(title, text),
      });
    } catch (err) {
      const code =
        typeof err === 'object' && err !== null && 'code' in err
          ? String((err as { code: unknown }).code)
          : 'unknown';
      this.logger.error(`Could not email notification ${type}: ${code}`);
    }
  }

  private async isEmailOptedIn(userId: string, type: string): Promise<boolean> {
    const { data } = await this.supabase
      .from('notification_preferences')
      .select('enabled')
      .eq('user_id', userId)
      .eq('type', type)
      .eq('channel', 'email')
      .maybeSingle<{ enabled: boolean }>();
    return data?.enabled === true;
  }

  private async isMuted(
    userId: string,
    type: string,
    channel: Channel,
  ): Promise<boolean> {
    const { data } = await this.supabase
      .from('notification_preferences')
      .select('enabled')
      .eq('user_id', userId)
      .eq('type', type)
      .eq('channel', channel)
      .maybeSingle<{ enabled: boolean }>();
    return data?.enabled === false;
  }

  private async loadTemplate(
    type: string,
  ): Promise<{ subject: string; body: string } | null> {
    const { data } = await this.supabase
      .from('notification_templates')
      .select('subject, body_template')
      .eq('type', type)
      .maybeSingle<{ subject: string; body_template: string }>();
    return data ? { subject: data.subject, body: data.body_template } : null;
  }
}
