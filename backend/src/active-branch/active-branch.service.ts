import {
  Inject,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_ADMIN_CLIENT } from '../supabase/supabase.constants';

@Injectable()
export class ActiveBranchService {
  constructor(
    @Inject(SUPABASE_ADMIN_CLIENT)
    private readonly supabase: SupabaseClient,
  ) {}

  async getActiveBranchId(
    projectId: string,
    userId: string,
  ): Promise<string | null> {
    const { data: project } = await this.supabase
      .from('projects')
      .select('owner_id, active_branch_id')
      .eq('id', projectId)
      .maybeSingle<{ owner_id: string; active_branch_id: string | null }>();

    if (!project) return null;
    if (project.owner_id === userId) return project.active_branch_id;

    const { data } = await this.supabase
      .from('project_member_active_branches')
      .select('branch_id')
      .eq('project_id', projectId)
      .eq('user_id', userId)
      .maybeSingle<{ branch_id: string }>();

    return data?.branch_id ?? null;
  }

  async setActiveBranch(
    projectId: string,
    userId: string,
    branchId: string,
  ): Promise<void> {
    const { data: project } = await this.supabase
      .from('projects')
      .select('owner_id')
      .eq('id', projectId)
      .maybeSingle<{ owner_id: string }>();

    const query =
      project?.owner_id === userId
        ? this.supabase
            .from('projects')
            .update({ active_branch_id: branchId })
            .eq('id', projectId)
        : this.supabase.from('project_member_active_branches').upsert(
            {
              project_id: projectId,
              user_id: userId,
              branch_id: branchId,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'project_id,user_id' },
          );

    const { error } = await query;
    if (error) {
      throw new InternalServerErrorException(
        `Failed to record active branch: ${error.message}`,
      );
    }
  }
}
