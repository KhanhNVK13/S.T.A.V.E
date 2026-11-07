import {
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ActivityItem, ActivityPage } from '@stave/shared-types';
import { SUPABASE_ADMIN_CLIENT } from '../supabase/supabase.constants';
import {
  encodeCursor,
  maskIp,
  parseActivityQuery,
  prefixesForType,
} from './activity-log.logic';

export interface ActivityRecordInput {
  userId: string;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  targetName?: string | null;
  ip?: string | null;
}

interface ActivityRow {
  id: string;
  action: string;
  target_type: string | null;
  target_id: string | null;
  target_name: string | null;
  ip_address: string | null;
  created_at: string;
}

const MAX_TARGET_NAME_LENGTH = 200;

@Injectable()
export class ActivityLogService {
  private readonly logger = new Logger(ActivityLogService.name);

  constructor(
    @Inject(SUPABASE_ADMIN_CLIENT)
    private readonly supabase: SupabaseClient,
  ) {}

  async record(input: ActivityRecordInput): Promise<void> {
    try {
      const { error } = await this.supabase.from('activity_log').insert({
        user_id: input.userId,
        action: input.action,
        target_type: input.targetType ?? null,
        target_id: input.targetId ?? null,
        target_name: input.targetName?.slice(0, MAX_TARGET_NAME_LENGTH) ?? null,
        ip_address: input.ip ?? null,
      });
      if (error) {
        this.logger.warn(
          `Could not record activity ${input.action}: ${error.message}`,
        );
      }
    } catch (err) {
      this.logger.warn(
        `Could not record activity ${input.action}: ${String(err)}`,
      );
    }
  }

  async list(
    userId: string,
    query: Record<string, unknown>,
  ): Promise<ActivityPage> {
    const parsed = parseActivityQuery(query);

    const { data: user, error: userError } = await this.supabase
      .from('users')
      .select('id')
      .eq('id', userId)
      .maybeSingle();
    if (userError) {
      this.logger.error(`Could not look up user: ${userError.message}`);
      throw new InternalServerErrorException('Could not load activity');
    }
    if (!user) throw new NotFoundException('User not found');

    const { data, error } = await this.supabase.rpc('admin_user_activity', {
      p_user_id: userId,
      p_from: parsed.from,
      p_to: parsed.to,
      p_prefixes: prefixesForType(parsed.type),
      p_limit: parsed.limit + 1,
      p_cursor_created_at: parsed.cursor?.createdAt ?? null,
      p_cursor_id: parsed.cursor?.id ?? null,
    });
    if (error) {
      this.logger.error(`Could not load activity: ${error.message}`);
      throw new InternalServerErrorException('Could not load activity');
    }

    const rows = (data ?? []) as ActivityRow[];
    const page = rows.slice(0, parsed.limit);
    const last = page[page.length - 1];
    const nextCursor =
      rows.length > parsed.limit && last
        ? encodeCursor({ createdAt: last.created_at, id: last.id })
        : null;

    const existingProjects = await this.findExistingProjects(page);
    const items = page.map((row) => this.toItem(row, existingProjects));
    return { items, nextCursor };
  }

  private async findExistingProjects(
    rows: ActivityRow[],
  ): Promise<Set<string>> {
    const ids = [
      ...new Set(
        rows
          .filter((row) => row.target_type === 'project' && row.target_id)
          .map((row) => row.target_id as string),
      ),
    ];
    if (ids.length === 0) return new Set();

    const { data, error } = await this.supabase
      .from('projects')
      .select('id')
      .in('id', ids);
    if (error) {
      this.logger.warn(`Could not check deleted projects: ${error.message}`);
      return new Set(ids);
    }
    return new Set(((data ?? []) as Array<{ id: string }>).map((p) => p.id));
  }

  private toItem(
    row: ActivityRow,
    existingProjects: Set<string>,
  ): ActivityItem {
    const isProject = row.target_type === 'project' && row.target_id !== null;
    return {
      id: row.id,
      action: row.action,
      targetType: row.target_type,
      targetName: row.target_name,
      targetDeleted:
        isProject && !existingProjects.has(row.target_id as string),
      occurredAt: row.created_at,
      ipMasked: maskIp(row.ip_address),
      locationApprox: null,
    };
  }
}
