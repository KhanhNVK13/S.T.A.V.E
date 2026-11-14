import {
  ConflictException,
  Inject,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_ADMIN_CLIENT } from '../supabase/supabase.constants';

@Injectable()
export class JamLockService {
  constructor(
    @Inject(SUPABASE_ADMIN_CLIENT)
    private readonly supabase: SupabaseClient,
  ) {}

  async assertNoActiveJam(projectId: string): Promise<void> {
    const { data, error } = await this.supabase
      .from('jam_events')
      .select('id')
      .eq('jam_project_id', projectId)
      .eq('status', 'active')
      .limit(1)
      .maybeSingle<{ id: string }>();
    if (error) {
      throw new InternalServerErrorException(
        'Could not check the Community Jam status',
      );
    }
    if (data) {
      throw new ConflictException({
        code: 'JAM_ACTIVE',
        message:
          'Commits, branches and merges are unavailable while a Community Jam is running on this project',
      });
    }
  }
}
