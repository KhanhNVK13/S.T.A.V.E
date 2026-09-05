import {
  Inject,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { DraftSnapshot } from '@stave/shared-types';
import { SUPABASE_ADMIN_CLIENT } from '../supabase/supabase.constants';
import { ProjectsService } from '../projects/projects.service';
import { buildDefaultDraftSnapshot } from './default-snapshot';
import type { DraftRow } from './draft-row.type';
import type { UpdateDraftDto } from './dto/update-draft.dto';

@Injectable()
export class DraftsService {
  constructor(
    @Inject(SUPABASE_ADMIN_CLIENT)
    private readonly supabase: SupabaseClient,
    private readonly projectsService: ProjectsService,
  ) {}

  /** GET /projects/:id/draft — draft của branch mặc định; snapshot rỗng nếu chưa từng ghi. */
  async getDraft(projectId: string, ownerId: string): Promise<DraftSnapshot> {
    const branch = await this.projectsService.getDefaultBranchForOwner(
      projectId,
      ownerId,
    );

    const { data, error } = await this.supabase
      .from('drafts')
      .select('*')
      .eq('branch_id', branch.id)
      .maybeSingle<DraftRow>();

    if (error) {
      throw new InternalServerErrorException('Could not read draft');
    }
    return data ? data.snapshot : buildDefaultDraftSnapshot();
  }

  /** PUT /projects/:id/draft — ghi đè toàn bộ snapshot của branch mặc định. */
  async putDraft(
    projectId: string,
    ownerId: string,
    dto: UpdateDraftDto,
  ): Promise<DraftSnapshot> {
    const branch = await this.projectsService.getDefaultBranchForOwner(
      projectId,
      ownerId,
    );

    const { data, error } = await this.supabase
      .from('drafts')
      .upsert(
        {
          branch_id: branch.id,
          snapshot: dto,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'branch_id' },
      )
      .select('*')
      .single<DraftRow>();

    if (error || !data) {
      throw new InternalServerErrorException('Could not write draft');
    }
    return data.snapshot;
  }
}
