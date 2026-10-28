import { Inject, Injectable, Logger } from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_ADMIN_CLIENT } from '../supabase/supabase.constants';
import { getNotificationType, renderTemplate } from './notification-types';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @Inject(SUPABASE_ADMIN_CLIENT)
    private readonly supabase: SupabaseClient,
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

      if (!definition?.mandatory && (await this.isMuted(userId, type))) {
        return;
      }

      const template = await this.loadTemplate(type);
      const subject = template?.subject ?? definition?.defaultSubject ?? type;
      const body = template?.body ?? definition?.defaultBody ?? '';

      const { error } = await this.supabase.from('notifications').insert({
        user_id: userId,
        type,
        payload: {
          ...payload,
          title: renderTemplate(subject, payload),
          body: renderTemplate(body, payload),
        },
      });

      if (error) {
        this.logger.error(
          `Could not write notification ${type}: ${error.message}`,
        );
      }
    } catch (err) {
      this.logger.error(`Could not send notification ${type}: ${String(err)}`);
    }
  }

  private async isMuted(userId: string, type: string): Promise<boolean> {
    const { data } = await this.supabase
      .from('notification_preferences')
      .select('enabled')
      .eq('user_id', userId)
      .eq('type', type)
      .eq('channel', 'in_app')
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
