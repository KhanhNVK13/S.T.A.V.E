import {
  ConflictException,
  Inject,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { DraftSnapshot } from '@stave/shared-types';
import { SUPABASE_ADMIN_CLIENT } from '../supabase/supabase.constants';
import { ProjectsService } from '../projects/projects.service';
import { ProjectAccessService } from '../project-access/project-access.service';
import { DiffService } from '../commits/diff.service';
import { buildDefaultDraftSnapshot } from './default-snapshot';
import type { DraftRow } from './draft-row.type';
import type { UpdateDraftDto } from './dto/update-draft.dto';

@Injectable()
export class DraftsService {
  constructor(
    @Inject(SUPABASE_ADMIN_CLIENT)
    private readonly supabase: SupabaseClient,
    private readonly projectsService: ProjectsService,
    private readonly access: ProjectAccessService,
    private readonly diffService: DiffService,
  ) {}

  /**
   * GET /projects/:id/draft — draft của chính người gọi trên branch ĐANG MỞ
   * (UC-48). Mỗi người có một draft riêng trên mỗi branch.
   *
   * Người dùng chưa có row `drafts` thì lấy snapshot của head commit, chỉ khi
   * branch cũng chưa có commit nào mới trả về bản rỗng. Quan trọng vì trả bản
   * rỗng cho một branch đã có nội dung sẽ hiện ra như "project trống", và
   * autosave ngay sau đó ghi đúng cái trống ấy xuống DB. Cộng tác viên lần
   * đầu mở project, hoặc sau khi bị gỡ nháp (UC-62), đi qua nhánh này.
   */
  async getDraft(projectId: string, userId: string): Promise<DraftSnapshot> {
    const branch = await this.projectsService.getActiveBranchForUser(
      projectId,
      userId,
    );

    const { data, error } = await this.supabase
      .from('drafts')
      .select('*')
      .eq('branch_id', branch.id)
      .eq('user_id', userId)
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

  async getRecovery(
    projectId: string,
    userId: string,
  ): Promise<{
    recovered: boolean;
    savedAt: string | null;
    version: string | null;
  }> {
    const branch = await this.projectsService.getActiveBranchForUser(
      projectId,
      userId,
    );

    const { data: draft, error } = await this.supabase
      .from('drafts')
      .select('snapshot, updated_at')
      .eq('branch_id', branch.id)
      .eq('user_id', userId)
      .maybeSingle<Pick<DraftRow, 'snapshot' | 'updated_at'>>();

    if (error) {
      throw new InternalServerErrorException('Could not read draft');
    }
    if (!draft) return { recovered: false, savedAt: null, version: null };

    let headSnapshot: DraftSnapshot = buildDefaultDraftSnapshot();
    if (branch.head_commit_id) {
      const { data: commit } = await this.supabase
        .from('commits')
        .select('snapshot')
        .eq('id', branch.head_commit_id)
        .maybeSingle<{ snapshot: DraftSnapshot }>();
      if (commit) headSnapshot = commit.snapshot;
    }

    const identical = this.diffService.compareSnapshots(
      headSnapshot,
      draft.snapshot,
    ).areIdentical;
    return identical
      ? { recovered: false, savedAt: null, version: draft.updated_at }
      : {
          recovered: true,
          savedAt: draft.updated_at,
          version: draft.updated_at,
        };
  }

  /**
   * PUT /projects/:id/draft — ghi đè snapshot draft của người gọi trên branch
   * ĐANG MỞ (UC-48).
   *
   * `expectedVersion` là khoá lạc quan giữa các tab của cùng một người: giá
   * trị `updated_at` của draft mà tab này đã đọc/ghi lần cuối (hoặc `none`
   * nếu lúc đọc chưa có dòng draft). Lệch thì 409 `DRAFT_STALE` và KHÔNG ghi.
   * Bỏ trống = ghi đè không kiểm tra (đường "ghi đè bản của tôi").
   */
  async putDraft(
    projectId: string,
    userId: string,
    dto: UpdateDraftDto,
    expectedVersion?: string,
  ): Promise<{ version: string }> {
    await this.access.assertCanEdit(projectId, userId);
    const branch = await this.projectsService.getActiveBranchForUser(
      projectId,
      userId,
      { accessChecked: true },
    );
    const updatedAt = new Date().toISOString();
    const stale = () =>
      new ConflictException({
        message: 'Draft was changed elsewhere',
        code: 'DRAFT_STALE',
      });

    if (expectedVersion === undefined) {
      const { data, error } = await this.supabase
        .from('drafts')
        .upsert(
          {
            branch_id: branch.id,
            user_id: userId,
            snapshot: dto,
            updated_at: updatedAt,
          },
          { onConflict: 'branch_id,user_id' },
        )
        .select('updated_at')
        .single<{ updated_at: string }>();
      if (error || !data) {
        throw new InternalServerErrorException('Could not write draft');
      }
      return { version: data.updated_at };
    }

    if (expectedVersion === 'none') {
      const { data, error } = await this.supabase
        .from('drafts')
        .insert({
          branch_id: branch.id,
          user_id: userId,
          snapshot: dto,
          updated_at: updatedAt,
        })
        .select('updated_at')
        .single<{ updated_at: string }>();
      if (error?.code === '23505') throw stale();
      if (error || !data) {
        throw new InternalServerErrorException('Could not write draft');
      }
      return { version: data.updated_at };
    }

    const { data, error } = await this.supabase
      .from('drafts')
      .update({ snapshot: dto, updated_at: updatedAt })
      .eq('branch_id', branch.id)
      .eq('user_id', userId)
      .eq('updated_at', expectedVersion)
      .select('updated_at')
      .maybeSingle<{ updated_at: string }>();
    if (error) {
      throw new InternalServerErrorException('Could not write draft');
    }
    if (!data) throw stale();
    return { version: data.updated_at };
  }

  /**
   * Xoá mọi draft của một người trong một project (dùng khi gỡ quyền cộng tác,
   * UC-62). Lần mở sau, người đó (nếu còn quyền) lại bắt đầu từ head commit.
   */
  async discardUserDraft(projectId: string, userId: string): Promise<void> {
    const { data: branches, error: branchError } = await this.supabase
      .from('branches')
      .select('id')
      .eq('project_id', projectId);

    if (branchError) {
      throw new InternalServerErrorException('Could not discard draft');
    }

    const branchIds = (branches ?? []).map((b: { id: string }) => b.id);
    if (branchIds.length === 0) return;

    const { error } = await this.supabase
      .from('drafts')
      .delete()
      .eq('user_id', userId)
      .in('branch_id', branchIds);

    if (error) {
      throw new InternalServerErrorException('Could not discard draft');
    }
  }
}
