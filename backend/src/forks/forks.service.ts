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

const UNIQUE_VIOLATION = '23505';
const MAX_NAME_LENGTH = 100;
const MAX_NAME_ATTEMPTS = 6;

interface SourceProject {
  id: string;
  name: string;
  owner_id: string;
  visibility: string;
  archived_at: string | null;
  moderation_hidden_at: string | null;
}

export function forkNameCandidate(base: string, attempt: number): string {
  if (attempt === 0) return base.slice(0, MAX_NAME_LENGTH);
  const suffix = attempt === 1 ? ' (fork)' : ` (fork ${attempt})`;
  return `${base.slice(0, MAX_NAME_LENGTH - suffix.length)}${suffix}`;
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
      throw new ConflictException('Project is no longer available');
    }
    if (source.owner_id === userId) {
      throw new BadRequestException('You cannot fork your own project');
    }

    const takenNames = await this.loadTakenNames(userId, source.name);

    let newId: string | null = null;
    for (let attempt = 0; attempt < MAX_NAME_ATTEMPTS && !newId; attempt++) {
      const name = forkNameCandidate(source.name, attempt);
      if (takenNames.has(name)) continue;

      const { data, error } = await this.supabase.rpc('fork_project', {
        p_source: source.id,
        p_new_owner: userId,
        p_name: name,
      });

      if (error) {
        if (error.code === UNIQUE_VIOLATION) {
          takenNames.add(name);
          continue;
        }
        throw new InternalServerErrorException('Could not fork project');
      }
      newId = data as string;
    }

    if (!newId)
      throw new InternalServerErrorException('Could not fork project');

    await this.notifications.notify(source.owner_id, 'fork.created', {
      forkerName: await this.displayName(userId),
      projectName: source.name,
      projectId: source.id,
    });

    return { id: newId };
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

  private async loadTakenNames(
    userId: string,
    baseName: string,
  ): Promise<Set<string>> {
    const { data } = await this.supabase
      .from('projects')
      .select('name')
      .eq('owner_id', userId)
      .ilike('name', `${baseName.replace(/[%_\\]/g, '\\$&')}%`);
    return new Set((data ?? []).map((row: { name: string }) => row.name));
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
