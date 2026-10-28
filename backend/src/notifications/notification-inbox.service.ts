import {
  BadRequestException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_ADMIN_CLIENT } from '../supabase/supabase.constants';
import { NOTIFICATION_TYPES, getNotificationType } from './notification-types';
import type { ListNotificationsQueryDto } from './dto/list-notifications-query.dto';
import type {
  NotificationChannel,
  SetPreferenceDto,
} from './dto/set-preference.dto';

const MENTION_TYPES = ['comment.reply', 'pr.comment'];
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T[\d:.]+(?:Z|[+-]\d{2}:\d{2})$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface NotificationRow {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
}

export interface NotificationList {
  items: NotificationRow[];
  nextCursor: string | null;
}

export interface NotificationPreferenceItem {
  type: string;
  label: string;
  category: string;
  mandatory: boolean;
  channels: Record<NotificationChannel, boolean>;
}

interface Cursor {
  createdAt: string;
  id: string;
}

function encodeCursor(row: NotificationRow): string {
  const cursor: Cursor = { createdAt: row.created_at, id: row.id };
  return Buffer.from(JSON.stringify(cursor)).toString('base64url');
}

function decodeCursor(value: string): Cursor {
  try {
    const parsed = JSON.parse(
      Buffer.from(value, 'base64url').toString('utf8'),
    ) as Partial<Cursor>;
    if (
      typeof parsed.createdAt === 'string' &&
      typeof parsed.id === 'string' &&
      ISO_TIMESTAMP.test(parsed.createdAt) &&
      UUID.test(parsed.id)
    ) {
      return { createdAt: parsed.createdAt, id: parsed.id };
    }
  } catch {
    // fall through to the error below
  }
  throw new BadRequestException('Invalid cursor');
}

export function notificationHref(
  type: string,
  payload: Record<string, unknown>,
): string | null {
  const text = (key: string): string | null => {
    const value = payload[key];
    return typeof value === 'string' && value.length > 0 ? value : null;
  };
  const pullRequestId = text('pullRequestId');
  if (pullRequestId) return `/pull-requests/${pullRequestId}`;
  const projectId = text('projectId');
  if (projectId) return `/projects/${projectId}`;
  const eventId = text('eventId');
  if (eventId) return `/jam/${eventId}`;
  if (text('invitationId')) return '/invitations';
  if (type.startsWith('billing.')) return '/plans';
  if (type.startsWith('security.')) return '/profile';
  return null;
}

@Injectable()
export class NotificationInboxService {
  constructor(
    @Inject(SUPABASE_ADMIN_CLIENT)
    private readonly supabase: SupabaseClient,
  ) {}

  async list(
    userId: string,
    query: ListNotificationsQueryDto,
  ): Promise<NotificationList> {
    const limit = query.limit ?? 30;

    let builder = this.supabase
      .from('notifications')
      .select('id, type, payload, read_at, created_at')
      .eq('user_id', userId);

    if (query.filter === 'unread') builder = builder.is('read_at', null);
    if (query.filter === 'mentions')
      builder = builder.in('type', MENTION_TYPES);

    if (query.cursor) {
      const cursor = decodeCursor(query.cursor);
      builder = builder.or(
        `created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`,
      );
    }

    const { data, error } = await builder
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(limit + 1);

    if (error) {
      throw new InternalServerErrorException('Could not list notifications');
    }

    const rows = (data ?? []) as NotificationRow[];
    const items = rows.slice(0, limit);
    const nextCursor =
      rows.length > limit ? encodeCursor(items[items.length - 1]) : null;
    return { items, nextCursor };
  }

  async unreadCount(userId: string): Promise<{ count: number }> {
    const { count, error } = await this.supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .is('read_at', null);

    if (error) {
      throw new InternalServerErrorException('Could not count notifications');
    }
    return { count: count ?? 0 };
  }

  async open(
    userId: string,
    id: string,
  ): Promise<{ ok: true; href: string | null } | { ok: false }> {
    const { data, error } = await this.supabase
      .from('notifications')
      .select('id, type, payload, read_at')
      .eq('id', id)
      .eq('user_id', userId)
      .maybeSingle<
        Pick<NotificationRow, 'id' | 'type' | 'payload' | 'read_at'>
      >();

    if (error) {
      throw new InternalServerErrorException('Could not open notification');
    }
    if (!data) throw new NotFoundException('Notification not found');

    if (!data.read_at) {
      const { error: markError } = await this.supabase
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('id', id)
        .eq('user_id', userId);
      if (markError) {
        throw new InternalServerErrorException('Could not open notification');
      }
    }

    const href = notificationHref(data.type, data.payload ?? {});
    if (href === null) return { ok: true, href: null };
    return (await this.targetExists(data.payload ?? {}))
      ? { ok: true, href }
      : { ok: false };
  }

  async readAll(userId: string): Promise<{ ok: true }> {
    const { error } = await this.supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('user_id', userId)
      .is('read_at', null);

    if (error) {
      throw new InternalServerErrorException(
        'Could not mark notifications read',
      );
    }
    return { ok: true };
  }

  async getPreferences(userId: string): Promise<NotificationPreferenceItem[]> {
    const { data, error } = await this.supabase
      .from('notification_preferences')
      .select('type, channel, enabled')
      .eq('user_id', userId);

    if (error) {
      throw new InternalServerErrorException('Could not read preferences');
    }

    const stored = new Map<string, boolean>();
    for (const row of (data ?? []) as Array<{
      type: string;
      channel: NotificationChannel;
      enabled: boolean;
    }>) {
      stored.set(`${row.type}|${row.channel}`, row.enabled);
    }

    return NOTIFICATION_TYPES.map((def) => ({
      type: def.type,
      label: def.defaultSubject,
      category: def.category,
      mandatory: def.mandatory,
      channels: {
        in_app: def.mandatory
          ? true
          : (stored.get(`${def.type}|in_app`) ?? true),
        email: def.mandatory ? true : (stored.get(`${def.type}|email`) ?? true),
      },
    }));
  }

  async setPreference(
    userId: string,
    dto: SetPreferenceDto,
  ): Promise<{ type: string; channel: NotificationChannel; enabled: boolean }> {
    const definition = getNotificationType(dto.type);
    if (!definition) throw new BadRequestException('Unknown notification type');
    if (definition.mandatory && !dto.enabled) {
      throw new BadRequestException('This notification cannot be turned off');
    }

    const { error } = await this.supabase
      .from('notification_preferences')
      .upsert(
        {
          user_id: userId,
          type: dto.type,
          channel: dto.channel,
          enabled: dto.enabled,
        },
        { onConflict: 'user_id,type,channel' },
      );

    if (error) {
      throw new InternalServerErrorException('Could not save preference');
    }
    return { type: dto.type, channel: dto.channel, enabled: dto.enabled };
  }

  private async targetExists(
    payload: Record<string, unknown>,
  ): Promise<boolean> {
    const text = (key: string): string | null => {
      const value = payload[key];
      return typeof value === 'string' && value.length > 0 ? value : null;
    };
    const checks: Array<[string, string | null]> = [
      ['pull_requests', text('pullRequestId')],
      ['projects', text('projectId')],
      ['jam_events', text('eventId')],
      ['project_collaborators', text('invitationId')],
    ];
    const [table, id] = checks.find(([, value]) => value !== null) ?? [];
    if (!table || !id) return true;

    const { data } = await this.supabase
      .from(table)
      .select('id')
      .eq('id', id)
      .maybeSingle();
    return data !== null;
  }
}
