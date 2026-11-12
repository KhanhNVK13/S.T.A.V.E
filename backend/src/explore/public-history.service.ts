import {
  BadRequestException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { DraftSnapshot } from '@stave/shared-types';
import { SUPABASE_ADMIN_CLIENT } from '../supabase/supabase.constants';
import { ProjectAccessService } from '../project-access/project-access.service';
import { DiffService, type SnapshotDiff } from '../commits/diff.service';

export const PUBLIC_HISTORY_PAGE_SIZE = 20;
export const PUBLIC_HISTORY_MAX_PAGE_SIZE = 50;

export interface PublicHistoryAuthor {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
}

export interface PublicBranch {
  id: string;
  name: string;
  is_default: boolean;
  head_commit_id: string | null;
}

export interface PublicCommitItem {
  id: string;
  branch_id: string;
  parent_commit_id: string | null;
  merged_from_commit_id: string | null;
  message: string;
  created_at: string;
  author: PublicHistoryAuthor;
}

export interface PublicCommitPage {
  items: PublicCommitItem[];
  total: number;
  page: number;
  totalPages: number;
  limit: number;
}

export interface PublicCommitDetail extends PublicCommitItem {
  summary: {
    trackCount: number;
    noteCount: number;
    tempo: number | null;
    tracks: Array<{ name: string; instrument: string | null }>;
  };
}

export interface PublicPreview {
  commitId: string | null;
  snapshot: DraftSnapshot | null;
}

interface CommitRow {
  id: string;
  branch_id: string;
  author_id: string | null;
  message: string;
  created_at: string;
  parent_commit_id: string | null;
  merged_from_commit_id: string | null;
}

const COMMIT_COLUMNS =
  'id, branch_id, author_id, message, created_at, parent_commit_id, merged_from_commit_id';

@Injectable()
export class PublicHistoryService {
  constructor(
    @Inject(SUPABASE_ADMIN_CLIENT)
    private readonly supabase: SupabaseClient,
    private readonly access: ProjectAccessService,
    private readonly diff: DiffService,
  ) {}

  async getPreview(projectId: string): Promise<PublicPreview> {
    await this.access.assertPublicReadable(projectId);
    return this.loadPreview(projectId);
  }

  async getPreviewForMember(
    projectId: string,
    userId: string,
  ): Promise<PublicPreview> {
    await this.access.assertCanRead(projectId, userId);
    return this.loadPreview(projectId);
  }

  private async loadPreview(projectId: string): Promise<PublicPreview> {
    const { data: branch, error: branchError } = await this.supabase
      .from('branches')
      .select('head_commit_id')
      .eq('project_id', projectId)
      .eq('is_default', true)
      .maybeSingle<{ head_commit_id: string | null }>();
    if (branchError) {
      throw new InternalServerErrorException('Could not load preview');
    }
    if (!branch?.head_commit_id) return { commitId: null, snapshot: null };

    const { data: commit, error: commitError } = await this.supabase
      .from('commits')
      .select('id, snapshot')
      .eq('id', branch.head_commit_id)
      .maybeSingle<{ id: string; snapshot: DraftSnapshot | null }>();
    if (commitError) {
      throw new InternalServerErrorException('Could not load preview');
    }
    if (!commit?.snapshot) return { commitId: null, snapshot: null };

    const { schemaVersion, meta, tracks, notes } = commit.snapshot;
    return {
      commitId: commit.id,
      snapshot: {
        schemaVersion,
        meta,
        notes,
        tracks: (tracks ?? []).map((track) => {
          const copy = { ...track };
          delete copy.soundMap;
          return copy;
        }),
      },
    };
  }

  async listBranches(projectId: string): Promise<PublicBranch[]> {
    await this.access.assertPublicReadable(projectId);
    const { data, error } = await this.supabase
      .from('branches')
      .select('id, name, is_default, head_commit_id')
      .eq('project_id', projectId)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true });
    if (error) {
      throw new InternalServerErrorException('Could not load branches');
    }
    return ((data ?? []) as PublicBranch[]).map((b) => ({
      id: b.id,
      name: b.name,
      is_default: b.is_default,
      head_commit_id: b.head_commit_id ?? null,
    }));
  }

  async listCommits(
    projectId: string,
    options: { branchId?: string; page?: number; limit?: number },
  ): Promise<PublicCommitPage> {
    await this.access.assertPublicReadable(projectId);
    const page = Math.max(1, options.page ?? 1);
    const limit = Math.min(
      PUBLIC_HISTORY_MAX_PAGE_SIZE,
      Math.max(1, options.limit ?? PUBLIC_HISTORY_PAGE_SIZE),
    );
    const branchIds = await this.projectBranchIds(projectId);
    let scope = branchIds;
    if (options.branchId) {
      if (!branchIds.includes(options.branchId)) {
        throw new NotFoundException('Branch not found');
      }
      scope = [options.branchId];
    }
    if (scope.length === 0) {
      return { items: [], total: 0, page, totalPages: 0, limit };
    }

    const offset = (page - 1) * limit;
    const { data, error, count } = await this.supabase
      .from('commits')
      .select(COMMIT_COLUMNS, { count: 'exact' })
      .in('branch_id', scope)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) {
      throw new InternalServerErrorException('Could not load commit history');
    }
    const rows = (data ?? []) as CommitRow[];
    const authors = await this.loadAuthors(rows);
    const total = count ?? rows.length;
    return {
      items: rows.map((row) => this.toItem(row, authors)),
      total,
      page,
      totalPages: Math.ceil(total / limit),
      limit,
    };
  }

  async getCommit(
    projectId: string,
    commitId: string,
  ): Promise<PublicCommitDetail> {
    await this.access.assertPublicReadable(projectId);
    const branchIds = await this.projectBranchIds(projectId);
    if (branchIds.length === 0) throw new NotFoundException('Commit not found');
    const { data, error } = await this.supabase
      .from('commits')
      .select(`${COMMIT_COLUMNS}, snapshot`)
      .eq('id', commitId)
      .in('branch_id', branchIds)
      .maybeSingle<CommitRow & { snapshot: DraftSnapshot | null }>();
    if (error) {
      throw new InternalServerErrorException('Could not load commit');
    }
    if (!data) throw new NotFoundException('Commit not found');

    const authors = await this.loadAuthors([data]);
    const snapshot = data.snapshot;
    return {
      ...this.toItem(data, authors),
      summary: {
        trackCount: snapshot?.tracks?.length ?? 0,
        noteCount: snapshot?.notes?.length ?? 0,
        tempo:
          typeof snapshot?.meta?.tempo === 'number'
            ? snapshot.meta.tempo
            : null,
        tracks: (snapshot?.tracks ?? []).map((t) => ({
          name: t.name,
          instrument: t.instrument ?? null,
        })),
      },
    };
  }

  async compare(
    projectId: string,
    baseCommitId: string,
    targetCommitId: string,
  ): Promise<SnapshotDiff> {
    await this.access.assertPublicReadable(projectId);
    if (baseCommitId === targetCommitId) {
      throw new BadRequestException('Pick two different versions to compare');
    }
    const branchIds = await this.projectBranchIds(projectId);
    if (branchIds.length === 0) throw new NotFoundException('Commit not found');

    const { data, error } = await this.supabase
      .from('commits')
      .select('id, snapshot')
      .in('id', [baseCommitId, targetCommitId])
      .in('branch_id', branchIds)
      .returns<Array<{ id: string; snapshot: DraftSnapshot }>>();
    if (error) {
      throw new InternalServerErrorException('Could not compare versions');
    }
    const base = data?.find((row) => row.id === baseCommitId);
    const target = data?.find((row) => row.id === targetCommitId);
    if (!base || !target) throw new NotFoundException('Commit not found');
    return this.diff.compareSnapshots(base.snapshot, target.snapshot);
  }

  private async projectBranchIds(projectId: string): Promise<string[]> {
    const { data, error } = await this.supabase
      .from('branches')
      .select('id')
      .eq('project_id', projectId);
    if (error) {
      throw new InternalServerErrorException('Could not load branches');
    }
    return ((data ?? []) as Array<{ id: string }>).map((b) => b.id);
  }

  private async loadAuthors(
    rows: CommitRow[],
  ): Promise<Map<string, PublicHistoryAuthor>> {
    const ids = [
      ...new Set(rows.map((r) => r.author_id).filter((x): x is string => !!x)),
    ];
    const map = new Map<string, PublicHistoryAuthor>();
    if (ids.length === 0) return map;
    const { data, error } = await this.supabase
      .from('users')
      .select('id, username, display_name, avatar_url')
      .in('id', ids);
    if (error) {
      throw new InternalServerErrorException('Could not load commit authors');
    }
    for (const u of (data ?? []) as PublicHistoryAuthor[]) {
      map.set(u.id, {
        id: u.id,
        username: u.username ?? null,
        display_name: u.display_name ?? null,
        avatar_url: u.avatar_url ?? null,
      });
    }
    return map;
  }

  private toItem(
    row: CommitRow,
    authors: Map<string, PublicHistoryAuthor>,
  ): PublicCommitItem {
    return {
      id: row.id,
      branch_id: row.branch_id,
      parent_commit_id: row.parent_commit_id,
      merged_from_commit_id: row.merged_from_commit_id,
      message: row.message,
      created_at: row.created_at,
      author: (row.author_id ? authors.get(row.author_id) : undefined) ?? {
        id: row.author_id ?? '',
        username: null,
        display_name: null,
        avatar_url: null,
      },
    };
  }
}
