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

  /**
   * GET /projects/:id/draft — draft của branch ĐANG MỞ (UC-48), không phải
   * luôn luôn branch mặc định.
   *
   * Branch chưa có row `drafts` thì lấy snapshot của head commit, chỉ khi
   * branch cũng chưa có commit nào mới trả về bản rỗng. Quan trọng vì kể từ
   * UC-48, branch đang mở có thể là branch bất kỳ: trả bản rỗng cho một
   * branch đã có nội dung sẽ hiện ra như "project trống", và autosave ngay
   * sau đó ghi đúng cái trống ấy xuống DB. Branch tạo qua UC-47 luôn được
   * `initializeDraftForBranch` gieo sẵn draft — nhánh này là lưới an toàn cho
   * dữ liệu cũ/bất thường, không phải đường đi thường ngày.
   */
  async getDraft(projectId: string, ownerId: string): Promise<DraftSnapshot> {
    const branch = await this.projectsService.getActiveBranchForOwner(
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
    if (data) return data.snapshot;

    if (branch.head_commit_id) {
      const { data: commit } = await this.supabase
        .from('commits')
        .select('snapshot')
        .eq('id', branch.head_commit_id)
        .maybeSingle<{ snapshot: DraftSnapshot }>();
      if (commit) return commit.snapshot;
    }

    return buildDefaultDraftSnapshot();
  }

  /** PUT /projects/:id/draft — ghi đè toàn bộ snapshot của branch ĐANG MỞ (UC-48). */
  async putDraft(
    projectId: string,
    ownerId: string,
    dto: UpdateDraftDto,
  ): Promise<DraftSnapshot> {
    const branch = await this.projectsService.getActiveBranchForOwner(
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
