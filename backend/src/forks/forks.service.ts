import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_ADMIN_CLIENT } from '../supabase/supabase.constants';
import { NotificationsService } from '../notifications/notifications.service';
import { SEEDED_JAM_EVENTS } from '../jam/jam.service';

const MAX_NAME_LENGTH = 100;

interface SourceProject {
  id: string;
  name: string;
  owner_id: string;
  visibility: string;
  archived_at: string | null;
  moderation_hidden_at: string | null;
}

@Injectable()
export class ForksService {
  constructor(
    @Inject(SUPABASE_ADMIN_CLIENT)
    private readonly supabase: SupabaseClient,
    private readonly notifications: NotificationsService,
  ) {}

  async fork(projectId: string, userId: string): Promise<{ id: string }> {
    const source = await this.loadSource(projectId);

    if (source.visibility !== 'public' || source.archived_at) {
      // UC-68 / BR-76 & POST-4: a jam event's result project is created
      // private and archived on end — but it is exactly the kind of
      // project the "Sao chép về dự án của tôi" button exists to fork.
      // Every OTHER private/archived project still refuses.
      const jamResult = await this.isJamResultProject(projectId);
      if (!jamResult) {
        throw new ConflictException('Project is no longer available');
      }
    }
    if (source.owner_id === userId) {
      throw new BadRequestException('You cannot fork your own project');
    }

    const { data: newId, error } = await this.supabase.rpc('fork_project', {
      p_source: source.id,
      p_new_owner: userId,
      p_name: source.name.slice(0, MAX_NAME_LENGTH),
    });
    if (error || !newId) {
      throw new InternalServerErrorException('Could not fork project');
    }

    await this.notifications.notify(source.owner_id, 'fork.created', {
      forkerName: await this.displayName(userId),
      projectName: source.name,
      projectId: source.id,
    });

    return { id: newId as string };
  }

  /**
   * True when `projectId` is the `resulting_project_id` of an ENDED
   * `jam_events` row — the only private/archived source the fork rule
   * (UC-68 / BR-76, POST-4) must let through. Read-only check: it never
   * mutates the jam event.
   */
  private async isJamResultProject(projectId: string): Promise<boolean> {
    try {
      const { data } = await this.supabase
        .from('jam_events')
        .select('id')
        .eq('resulting_project_id', projectId)
        .eq('status', 'ended')
        .limit(1);
      if ((data?.length ?? 0) > 0) return true;
    } catch {
      // Pre-migration DB without the table: check seeded events below
    }
    return SEEDED_JAM_EVENTS.some(
      (e) => e.resulting_project_id === projectId && e.status === 'ended',
    );
  }

  private async loadSource(projectId: string): Promise<SourceProject> {
    const { data, error } = await this.supabase
      .from('projects')
      .select(
        'id, name, owner_id, visibility, archived_at, moderation_hidden_at',
      )
      .eq('id', projectId)
      .maybeSingle<SourceProject>();

    if (error || !data || data.moderation_hidden_at) {
      throw new NotFoundException('Project not found');
    }

    const { data: owner } = await this.supabase
      .from('users')
      .select('status')
      .eq('id', data.owner_id)
      .maybeSingle<{ status: string }>();
    if (owner?.status !== 'active') {
      throw new NotFoundException('Project not found');
    }
    return data;
  }

  private async displayName(userId: string): Promise<string> {
    const { data } = await this.supabase
      .from('users')
      .select('display_name, username')
      .eq('id', userId)
      .maybeSingle<{ display_name: string | null; username: string | null }>();
    return data?.display_name ?? data?.username ?? 'Một người dùng';
  }
}
